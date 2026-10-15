/**
 * GET /api/order-status?id=AMC-...&session_id=cs_...
 * Lets the checkout success page show whether payment has been confirmed by
 * the webhook. Requires the matching Stripe session ID, so IDs can't be probed.
 */
import type { Config } from '@netlify/functions';
import { getOrder, json } from '../lib/orders';

export default async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  const session = url.searchParams.get('session_id') ?? '';
  if (!/^AMC-\d{4}-\d{6}$/.test(id) || !session) return json({ message: 'Not found' }, 404);
  const record = await getOrder(id);
  if (!record || record.stripeSessionId !== session) return json({ message: 'Not found' }, 404);
  return json({ id: record.id, status: record.status, paymentStatus: record.paymentStatus, date: record.date, window: record.timeWindowLabel });
};

export const config: Config = { path: '/api/order-status', method: ['GET'] };
