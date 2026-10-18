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
import { lastGhlError, sendToGhl } from '../lib/ghl';
import { createDraftInvoice, draftSummary, ghlApiConfigured } from '../lib/ghl-api';
import { env, getOrder, json, listOrders, paymentsEnabled, saveOrder, STATUSES, toCsv } from '../lib/orders';

const digest = (s: string) => createHash('sha256').update(s).digest();

const adminPassword = () => env('ADMIN_PASSWORD');

/** What is connected on this deploy (no secret values, only yes/no). */
function integrations() {
  const ghlUrl = env('GHL_WEBHOOK_URL');
  return {
    ghl: ghlUrl ? (/^https:\/\/services\.leadconnectorhq\.com\/hooks\//.test(ghlUrl) ? 'connected' : 'url-looks-wrong') : 'not-set',
    ghlDraftInvoices: ghlApiConfigured(),
    ghlCustomerEmails: env('GHL_HANDLES_CUSTOMER_EMAIL') === 'true',
    email: env('RESEND_API_KEY') && env('EMAIL_FROM') ? 'connected' : 'not-set',
    payments: paymentsEnabled() ? 'on' : 'off',
  };
}

function authorized(req: Request, password: string) {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return timingSafeEqual(digest(given), digest(password));
}

const patchSchema = z.object({
  id: z.string().regex(/^AMC-\d{4}-\d{6}$/),
  status: z.enum(STATUSES).optional(),
  followUpOwner: z.string().trim().max(80).optional(),
  nextFollowUp: z.string().trim().max(40).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
  by: z.string().trim().max(80).optional(),
  /** re-send this order to GoHighLevel */
  resendGhl: z.boolean().optional(),
});

export default async (req: Request) => {
  const password = adminPassword();
  if (!password) {
    return json({ message: 'ADMIN_PASSWORD is not set for this deploy. In Netlify, set it with the Functions scope and the Production context, then trigger a new deploy.' }, 503);
  }
  if (password.length < 12) {
    return json({ message: `ADMIN_PASSWORD is set but only ${password.length} characters long. Use 12 or more characters, then trigger a new deploy.` }, 503);
  }
  if (!authorized(req, password)) {
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
    return json({ orders, integrations: integrations() });
  }

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ message: 'Invalid update' }, 400);
    const { id, by = 'admin', resendGhl, ...changes } = parsed.data;
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
    if (resendGhl && !env('GHL_WEBHOOK_URL')) {
      return json({ message: 'GoHighLevel is not connected on this deploy: add GHL_WEBHOOK_URL in Netlify environment variables, then Deploys → Trigger deploy.' }, 503);
    }
    // A manual resend also creates the draft invoice if it is missing.
    if (resendGhl && ghlApiConfigured() && !record.ghlInvoiceId && record.path !== 'checkout') {
      const draft = await createDraftInvoice(record);
      record.ghlInvoiceStatus = draft.status === 'created' ? 'draft created' : draft.status === 'skipped' ? 'not created' : 'draft failed';
      if (draft.status === 'created') { record.ghlInvoiceId = draft.invoiceId; record.ghlInvoiceLink = draft.link; }
      record.history.push({ at: now, by, change: draftSummary(draft, record) });
    }
    // Keep the GHL pipeline in step: send on manual resend or any status change.
    if (env('GHL_WEBHOOK_URL') && (resendGhl || described.some((d) => d.startsWith('status:')))) {
      // A manual resend is for orders GHL missed, so it is delivered as a new order
      // (the GHL workflow only builds cards and alerts for order.created).
      const ok = await sendToGhl(record, resendGhl ? 'order.created' : 'order.updated');
      record.history.push({ at: now, by, change: ok ? 'Sent to GoHighLevel' : 'GoHighLevel webhook failed' });
      if (resendGhl && !ok) { await saveOrder(record); return json({ message: `GoHighLevel did not accept the order (${lastGhlError() || 'no response'}). Check GHL_WEBHOOK_URL and that the workflow is published.`, order: record }, 502); }
    }
    await saveOrder(record);
    return json({ order: record });
  }

  return json({ message: 'Method not allowed' }, 405);
};

export const config: Config = { path: '/api/admin/orders', method: ['GET', 'PATCH'] };
