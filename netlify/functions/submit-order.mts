/**
 * POST /api/submit-order
 * Validates the builder payload, re-prices it from the server's own catalog,
 * stores the record, emails the business and customer, and returns the
 * inquiry ID. Standard, approved, available orders get a Stripe Checkout URL
 * only when payments are enabled; everything else is a quote request.
 */
import type { Config } from '@netlify/functions';
import { addressErrors, evaluateOrder, orderSchema } from '../../src/lib/order';
import { sendBusinessNotice, sendCustomerAck } from '../lib/email';
import { ghlHandlesCustomerEmail, sendToGhl } from '../lib/ghl';
import { createDraftInvoice, draftSummary, ghlApiConfigured } from '../lib/ghl-api';
import { env, catalog, json, nextInquiryId, paymentsEnabled, saveOrder, type OrderRecord } from '../lib/orders';
import { createCheckoutSession } from '../lib/stripe';

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405, { allow: 'POST' });
  const raw = await req.text();
  if (raw.length > 60_000) return json({ message: 'Request too large' }, 413);

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ message: 'Invalid request' }, 400); }

  // Honeypot: pretend success to bots, store nothing.
  if (body && typeof body === 'object' && (body as { website?: string }).website) {
    return json({ ok: true, id: 'AMC-RECEIVED', path: 'quote', status: 'request_received', reasons: [] });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[i.path.join('.')] ??= i.message;
    const b = body as { fulfillment?: string; address?: Record<string, string> };
    Object.assign(errors, addressErrors(b.fulfillment ?? '', b.address ?? {}), errors);
    return json({ message: 'Please check the highlighted fields.', errors }, 422);
  }
  const order = parsed.data;
  const ev = evaluateOrder(catalog, order, { paymentsEnabled: paymentsEnabled() });
  if (Object.keys(ev.errors).length) return json({ message: 'Please check your order.', errors: ev.errors }, 422);

  const now = new Date().toISOString();
  const id = await nextInquiryId();
  const record: OrderRecord = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'request_received',
    paymentStatus: 'none',
    path: ev.path,
    reasons: ev.reasons,
    serviceType: order.serviceType,
    occasion: order.occasion,
    count: order.count,
    date: order.date,
    timeWindow: order.timeWindow,
    timeWindowLabel: catalog.rules.timeWindows.find((w) => w.start === order.timeWindow)?.label ?? order.timeWindow,
    fulfillment: order.fulfillment,
    serviceLevel: order.serviceLevel,
    address: order.fulfillment === 'delivery' ? order.address : { street: '', unit: '', city: '', zip: '' },
    zone: ev.zone?.name ?? (order.fulfillment === 'delivery' ? 'Unconfirmed' : 'Pickup'),
    lines: ev.lines,
    selections: order.lines,
    event: order.event,
    subtotal: ev.subtotal,
    deliveryFee: ev.deliveryFee,
    tax: ev.tax,
    total: ev.total,
    contact: order.contact,
    accessNotes: order.accessNotes,
    dietaryNotes: order.dietaryNotes,
    instructions: order.instructions,
    consentService: order.consentService,
    consentMarketing: order.consentMarketing,
    source: order.source,
    followUpOwner: '',
    nextFollowUp: '',
    internalNotes: '',
    history: [{ at: now, by: 'website', change: `Submitted via builder (${ev.path})` }],
  };

  let checkoutUrl: string | undefined;
  if (ev.path === 'checkout') {
    try {
      const session = await createCheckoutSession(record);
      record.status = 'awaiting_payment';
      record.paymentStatus = 'pending';
      record.stripeSessionId = session.id;
      record.history.push({ at: now, by: 'website', change: 'Checkout session created' });
      checkoutUrl = session.url;
    } catch (err) {
      console.error('[checkout] falling back to quote', err);
      record.path = 'quote';
      record.reasons = [...record.reasons, 'Online payment is unavailable right now, so we will confirm by email.'];
    }
  }

  await saveOrder(record);
  // Draft invoice first (when the GHL API is configured), so the webhook can carry its link.
  const toGhl = async () => {
    if (ghlApiConfigured() && record.path !== 'checkout') {
      const draft = await createDraftInvoice(record);
      record.ghlInvoiceStatus = draft.status === 'created' ? 'draft created' : draft.status === 'skipped' ? 'not created' : 'draft failed';
      if (draft.status === 'created') { record.ghlInvoiceId = draft.invoiceId; record.ghlInvoiceLink = draft.link; }
      record.history.push({ at: new Date().toISOString(), by: 'website', change: draftSummary(draft, record) });
    }
    return sendToGhl(record, 'order.created');
  };
  const [, , ghl] = await Promise.allSettled([
    sendBusinessNotice(record, record.path === 'checkout' ? 'New order awaiting payment' : record.path === 'conflict' ? 'New request with a date conflict' : 'New quote request'),
    record.path === 'checkout' || ghlHandlesCustomerEmail() ? Promise.resolve(false) : sendCustomerAck(record),
    toGhl(),
  ]);
  if (env('GHL_WEBHOOK_URL')) {
    const ok = ghl.status === 'fulfilled' && ghl.value;
    record.history.push({ at: new Date().toISOString(), by: 'website', change: ok ? 'Sent to GoHighLevel' : 'GoHighLevel webhook failed; resend from the dashboard' });
  }
  if (env('GHL_WEBHOOK_URL') || ghlApiConfigured()) await saveOrder(record);

  return json({ ok: true, id, path: record.path, status: record.status, reasons: record.reasons, checkoutUrl });
};

export const config: Config = { path: '/api/submit-order', method: ['POST'] };
