/**
 * POST /api/stripe-webhook
 * The only place an order becomes "confirmed": a verified
 * checkout.session.completed event whose amount matches the stored total.
 */
import type { Config } from '@netlify/functions';
import { sendBusinessNotice, sendCustomerConfirmed } from '../lib/email';
import { getOrder, json, saveOrder } from '../lib/orders';
import { verifyStripeSignature } from '../lib/stripe';

interface SessionEvent {
  type: string;
  data: { object: { id: string; payment_status: string; amount_total: number; metadata?: { order_id?: string } } };
}

export default async (req: Request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ message: 'Webhook not configured' }, 503);
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)) return json({ message: 'Invalid signature' }, 400);

  const event = JSON.parse(payload) as SessionEvent;
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return json({ received: true });
  }
  const session = event.data.object;
  const id = session.metadata?.order_id;
  if (!id) return json({ received: true });
  const record = await getOrder(id);
  if (!record) return json({ message: 'Unknown order' }, 404);
  if (record.paymentStatus === 'paid') return json({ received: true });

  const now = new Date().toISOString();
  const expected = Math.round((record.total ?? 0) * 100);
  if (session.payment_status !== 'paid' || session.id !== record.stripeSessionId || session.amount_total !== expected) {
    record.history.push({ at: now, by: 'stripe', change: `Payment event did not match (status ${session.payment_status}, amount ${session.amount_total}, expected ${expected}). Needs review.` });
    await saveOrder(record);
    await sendBusinessNotice(record, 'Payment needs review');
    return json({ received: true });
  }

  record.paymentStatus = 'paid';
  record.status = 'confirmed';
  record.amountPaid = session.amount_total;
  record.history.push({ at: now, by: 'stripe', change: `Paid ${session.amount_total / 100} USD; order confirmed` });
  await saveOrder(record);
  await Promise.allSettled([sendCustomerConfirmed(record), sendBusinessNotice(record, 'Order paid and confirmed')]);
  return json({ received: true });
};

export const config: Config = { path: '/api/stripe-webhook', method: ['POST'] };
