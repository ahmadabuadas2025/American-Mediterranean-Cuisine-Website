/**
 * GoHighLevel API v2: creates a DRAFT invoice for each website order, with the
 * exact items, quantities and prices the customer chose. The owner opens the
 * draft in GHL / the LeadConnector app, adds delivery (and tax if needed) and
 * presses Send. Nothing is sent to the customer automatically.
 *
 * Needs a Private Integration token (Settings → Private Integrations) with the
 * scopes contacts.write and invoices.write (locations.readonly optional), plus
 * the Location ID. Without them this module does nothing.
 */
import { formatDate, money } from '../../src/lib/order';
import { catalog, env, siteUrl, type OrderRecord } from './orders';

const API = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export const ghlApiConfigured = () => !!env('GHL_API_TOKEN') && !!env('GHL_LOCATION_ID');

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env('GHL_API_TOKEN')}`,
      version: VERSION,
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Invoice line items from the priced order lines (quoted extras go in the notes). */
export function invoiceItems(r: OrderRecord) {
  return r.lines
    .filter((l) => l.unitPrice != null && l.qty > 0)
    .map((l) => ({
      name: l.label,
      description: l.detail || undefined,
      amount: l.unitPrice!,
      qty: l.qty,
      currency: 'USD',
      type: 'one_time' as const,
    }));
}

function dueDate(r: OrderRecord) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: catalog.rules.timezone }).format(new Date());
  const dayBefore = new Date(`${r.date}T12:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const d = dayBefore.toISOString().slice(0, 10);
  return d < today ? today : d;
}

/** Customer-facing notes on the invoice (no internal quote reasons). */
export function invoiceNotes(r: OrderRecord) {
  const where = r.fulfillment === 'pickup' ? 'Pickup' : `Delivery to ${[r.address.street, r.address.unit, r.address.city, r.address.zip].filter(Boolean).join(', ')}`;
  const quoted = r.lines.filter((l) => l.unitPrice == null).map((l) => `${l.label}${l.detail ? `: ${l.detail}` : ''}`);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return [
    `<p><strong>Order ${esc(r.id)}</strong> for ${esc(formatDate(r.date))}, ${esc(r.timeWindowLabel)}.</p>`,
    `<p>${esc(where)}.</p>`,
    r.dietaryNotes ? `<p>Dietary notes: ${esc(r.dietaryNotes)}</p>` : '',
    quoted.length ? `<p>Also requested: ${esc(quoted.join('; '))}.</p>` : '',
    '<p>Your order is confirmed once this invoice is paid. Questions or changes? Reply to this email.</p>',
  ].join('');
}

async function businessDetails() {
  try {
    const { location } = await call<{ location: { name?: string; phone?: string; website?: string; logoUrl?: string; address?: string; city?: string; state?: string; postalCode?: string; country?: string } }>(
      'GET', `/locations/${env('GHL_LOCATION_ID')}`,
    );
    return {
      name: location.name || catalog.settings.businessName,
      phoneNo: location.phone || undefined,
      website: location.website || siteUrl(),
      logoUrl: location.logoUrl || undefined,
      address: { addressLine1: location.address, city: location.city, state: location.state, postalCode: location.postalCode, countryCode: location.country || 'US' },
    };
  } catch {
    // locations.readonly scope not granted: fall back to the website settings
    return { name: catalog.settings.businessName, website: siteUrl() };
  }
}

export type DraftResult =
  | { status: 'created'; invoiceId: string; contactId: string; link: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export async function createDraftInvoice(r: OrderRecord): Promise<DraftResult> {
  if (!ghlApiConfigured()) return { status: 'skipped', reason: 'GHL_API_TOKEN / GHL_LOCATION_ID not set' };
  const items = invoiceItems(r);
  if (!items.length) return { status: 'skipped', reason: 'no priced items (consultation only)' };
  const locationId = env('GHL_LOCATION_ID');
  try {
    const [first, ...rest] = r.contact.name.trim().split(/\s+/);
    const { contact } = await call<{ contact: { id: string } }>('POST', '/contacts/upsert', {
      locationId,
      firstName: first,
      lastName: rest.join(' ') || undefined,
      email: r.contact.email,
      phone: r.contact.phone,
      companyName: r.contact.company || undefined,
      address1: r.address.street || undefined,
      city: r.address.city || undefined,
      state: r.fulfillment === 'delivery' ? 'FL' : undefined,
      postalCode: r.address.zip || undefined,
      source: 'Website order',
    });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: catalog.rules.timezone }).format(new Date());
    const invoice = await call<{ _id: string }>('POST', '/invoices/', {
      altId: locationId,
      altType: 'location',
      name: `${r.id} quote`,
      title: 'INVOICE',
      currency: 'USD',
      items,
      discount: { type: 'fixed', value: 0 },
      termsNotes: invoiceNotes(r),
      businessDetails: await businessDetails(),
      contactDetails: {
        id: contact.id,
        name: r.contact.name,
        email: r.contact.email,
        phoneNo: r.contact.phone,
        companyName: r.contact.company || undefined,
        address: r.fulfillment === 'delivery'
          ? { addressLine1: r.address.street, addressLine2: r.address.unit || undefined, city: r.address.city, state: 'FL', postalCode: r.address.zip, countryCode: 'US' }
          : undefined,
      },
      sentTo: { email: [r.contact.email], phoneNo: [r.contact.phone] },
      issueDate: today,
      dueDate: dueDate(r),
      liveMode: env('GHL_INVOICE_TEST_MODE') !== 'true',
    });
    return { status: 'created', invoiceId: invoice._id, contactId: contact.id, link: `https://app.gohighlevel.com/v2/location/${locationId}/payments/invoices/${invoice._id}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[ghl-api] draft invoice failed', reason);
    return { status: 'failed', reason };
  }
}

/** One line for the order history. */
export const draftSummary = (d: DraftResult, r: OrderRecord) =>
  d.status === 'created'
    ? `Draft invoice created in GoHighLevel (${invoiceItems(r).length} items, ${money(r.subtotal)} before delivery/tax)`
    : d.status === 'skipped' ? `No draft invoice: ${d.reason}` : `Draft invoice failed: ${d.reason}`;
