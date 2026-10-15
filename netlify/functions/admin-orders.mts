/**
 * /api/admin/orders — password-protected order dashboard API.
 *   GET            list orders (JSON)
 *   GET ?format=csv  CSV export
 *   PATCH {id, status?, followUpOwner?, nextFollowUp?, internalNotes?}
 * Auth: "Authorization: Bearer <ADMIN_PASSWORD>" (set ADMIN_PASSWORD in Netlify env vars).
 */
import type { Config } from '@netlify/functions';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getOrder, json, listOrders, saveOrder, STATUSES, toCsv } from '../lib/orders';

const digest = (s: string) => createHash('sha256').update(s).digest();

function authorized(req: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) return false;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return timingSafeEqual(digest(given), digest(password));
}

const patchSchema = z.object({
  id: z.string().regex(/^AMC-\d{4}-\d{6}$/),
  status: z.enum(STATUSES).optional(),
  followUpOwner: z.string().trim().max(80).optional(),
  nextFollowUp: z.string().trim().max(40).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
  by: z.string().trim().max(80).optional(),
});

export default async (req: Request) => {
  if (!process.env.ADMIN_PASSWORD) return json({ message: 'ADMIN_PASSWORD is not configured on this site.' }, 503);
  if (!authorized(req)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return json({ message: 'Wrong password' }, 401);
  }

  if (req.method === 'GET') {
    const orders = await listOrders();
    if (new URL(req.url).searchParams.get('format') === 'csv') {
      return new Response(`﻿${toCsv(orders)}`, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="amc-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
          'cache-control': 'no-store',
        },
      });
    }
    return json({ orders });
  }

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ message: 'Invalid update' }, 400);
    const { id, by = 'admin', ...changes } = parsed.data;
    const record = await getOrder(id);
    if (!record) return json({ message: 'Not found' }, 404);
    // Only the payment webhook may mark an online order as paid.
    if (changes.status === 'confirmed' && record.paymentStatus === 'pending') {
      return json({ message: 'This order is waiting for online payment. It is confirmed automatically when payment succeeds.' }, 409);
    }
    const now = new Date().toISOString();
    const described = Object.entries(changes)
      .filter(([k, v]) => v !== undefined && v !== record[k as keyof typeof record])
      .map(([k, v]) => `${k}: ${String(record[k as keyof typeof record] ?? '') || '—'} → ${v || '—'}`);
    Object.assign(record, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
    if (described.length) record.history.push({ at: now, by, change: described.join('; ') });
    await saveOrder(record);
    return json({ order: record });
  }

  return json({ message: 'Method not allowed' }, 405);
};

export const config: Config = { path: '/api/admin/orders', method: ['GET', 'PATCH'] };
