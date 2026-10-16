/**
 * Minimal Stripe Checkout integration over the REST API (no SDK).
 * Only used when PAYMENTS_ENABLED=true and STRIPE_SECRET_KEY is set.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, siteUrl, type OrderRecord } from './orders';

const cents = (n: number) => Math.round(n * 100);

export async function createCheckoutSession(r: OrderRecord): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('customer_email', r.contact.email);
  form.set('client_reference_id', r.id);
  form.set('metadata[order_id]', r.id);
  form.set('payment_intent_data[metadata][order_id]', r.id);
  form.set('success_url', `${siteUrl()}/order/success/?id=${encodeURIComponent(r.id)}&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${siteUrl()}/order/cancel/?id=${encodeURIComponent(r.id)}`);
  const items: { name: string; amount: number; qty: number }[] = r.lines
    .filter((l) => l.unitPrice != null)
    .map((l) => ({ name: l.detail ? `${l.label} (${l.detail})`.slice(0, 250) : l.label, amount: cents(l.unitPrice!), qty: l.qty }));
  if (r.deliveryFee) items.push({ name: 'Delivery', amount: cents(r.deliveryFee), qty: 1 });
  if (r.tax) items.push({ name: 'Sales tax', amount: cents(r.tax), qty: 1 });
  items.forEach((it, i) => {
    form.set(`line_items[${i}][quantity]`, String(it.qty));
    form.set(`line_items[${i}][price_data][currency]`, 'usd');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(it.amount));
    form.set(`line_items[${i}][price_data][product_data][name]`, it.name);
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `checkout-${r.id}` },
    body: form,
  });
  const body = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
  if (!res.ok || !body.url || !body.id) throw new Error(body.error?.message ?? `Stripe error ${res.status}`);
  return { id: body.id, url: body.url };
}

/** Verifies the Stripe-Signature header (v1 scheme, 5 minute tolerance). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const candidates = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return candidates.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}
