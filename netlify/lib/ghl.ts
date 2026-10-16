/**
 * GoHighLevel (GHL) hand-off. Every stored order is POSTed as flat JSON to a
 * GHL Workflow "Inbound Webhook" trigger (GHL_WEBHOOK_URL). GHL then creates
 * the contact and opportunity and sends emails/SMS. The order is always saved
 * here first, so a GHL outage never loses an order.
 */
import { formatDate, money, SERVICE_LABELS } from '../../src/lib/order';
import { env, siteUrl, type OrderRecord } from './orders';

export type GhlEvent = 'order.created' | 'order.paid' | 'order.updated';

const PATH_LABEL = { checkout: 'Online checkout', quote: 'Quote request', conflict: 'Date conflict' } as const;

/** Flat key/value payload: easy to map to GHL contact and custom fields. */
export function buildGhlPayload(r: OrderRecord, event: GhlEvent) {
  const [first, ...rest] = r.contact.name.trim().split(/\s+/);
  const items = r.lines
    .map((l) => `${l.qty} x ${l.label}${l.detail ? ` (${l.detail})` : ''}: ${l.total == null ? 'quoted' : money(l.total)}`)
    .join('\n');
  return {
    event,
    order_id: r.id,
    order_status: r.status,
    payment_status: r.paymentStatus,
    order_path: PATH_LABEL[r.path],
    submitted_at: r.createdAt,

    first_name: first ?? '',
    last_name: rest.join(' '),
    full_name: r.contact.name,
    email: r.contact.email,
    phone: r.contact.phone,
    company_name: r.contact.company,
    contact_preference: r.contact.preference,

    service_type: r.serviceType,
    service_label: SERVICE_LABELS[r.serviceType],
    occasion: r.occasion,
    guest_count: r.count,
    event_date: r.date,
    event_date_display: formatDate(r.date),
    time_window: r.timeWindowLabel,
    fulfillment: r.fulfillment,
    service_level: r.serviceLevel,
    address1: r.address.street,
    address2: r.address.unit,
    city: r.address.city,
    state: r.fulfillment === 'delivery' ? 'FL' : '',
    postal_code: r.address.zip,
    delivery_zone: r.zone,

    items_summary: items,
    subtotal: r.subtotal,
    delivery_fee: r.deliveryFee ?? '',
    tax: r.tax ?? '',
    total: r.total ?? '',
    total_display: r.total == null ? `${money(r.subtotal)} food subtotal (final total in quote)` : money(r.total),
    amount_paid: r.amountPaid ? r.amountPaid / 100 : '',
    quote_reasons: r.reasons.join(' '),

    dietary_notes: r.dietaryNotes,
    access_notes: r.accessNotes,
    special_instructions: r.instructions,
    event_add_ons: r.event.addOns.join(', '),

    service_consent: r.consentService,
    marketing_consent: r.consentMarketing,
    utm_source: r.source.utm_source ?? '',
    utm_medium: r.source.utm_medium ?? '',
    utm_campaign: r.source.utm_campaign ?? '',
    referrer: r.source.referrer ?? '',

    admin_link: `${siteUrl()}/admin/orders/`,
    tags: ['website-order', `service-${r.serviceType}`, `path-${r.path}`, ...(r.consentMarketing ? ['marketing-opt-in'] : [])].join(','),
  };
}

let lastError = '';
/** Short description of the most recent webhook failure (for the dashboard). */
export const lastGhlError = () => lastError;

/** Returns true when GHL accepted the payload; never throws. */
export async function sendToGhl(r: OrderRecord, event: GhlEvent): Promise<boolean> {
  const url = env('GHL_WEBHOOK_URL');
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildGhlPayload(r, event)),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`;
      console.error(`[ghl] webhook returned ${lastError}`);
    }
    return res.ok;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.error('[ghl] webhook failed', err);
    return false;
  }
}

/** When GHL sends the customer emails, skip the website's own customer email to avoid duplicates. */
export const ghlHandlesCustomerEmail = () => !!env('GHL_WEBHOOK_URL') && env('GHL_HANDLES_CUSTOMER_EMAIL') === 'true';
