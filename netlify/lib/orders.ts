/**
 * Order records in Netlify Blobs. One JSON blob per inquiry (key "order/<ID>"),
 * plus a per-year counter for sequential IDs like AMC-2026-000123.
 */
import { getStore } from '@netlify/blobs';
import catalogJson from '../../src/generated/catalog.json';
import type { Catalog } from '../../src/lib/catalog-types';
import type { Evaluation, OrderInput, PricedLine } from '../../src/lib/order';

export const catalog = catalogJson as unknown as Catalog;

export const STATUSES = ['request_received', 'quote_sent', 'awaiting_payment', 'confirmed', 'completed', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export interface OrderRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  paymentStatus: 'none' | 'pending' | 'paid';
  path: Evaluation['path'];
  reasons: string[];
  serviceType: OrderInput['serviceType'];
  occasion: string;
  count: number;
  date: string;
  timeWindow: string;
  timeWindowLabel: string;
  fulfillment: OrderInput['fulfillment'];
  serviceLevel: OrderInput['serviceLevel'];
  address: OrderInput['address'];
  zone: string;
  lines: PricedLine[];
  selections: OrderInput['lines'];
  event: OrderInput['event'];
  subtotal: number;
  deliveryFee: number | null;
  tax: number | null;
  total: number | null;
  contact: OrderInput['contact'];
  accessNotes: string;
  dietaryNotes: string;
  instructions: string;
  consentService: boolean;
  consentMarketing: boolean;
  source: OrderInput['source'];
  followUpOwner: string;
  nextFollowUp: string;
  internalNotes: string;
  stripeSessionId?: string;
  amountPaid?: number;
  history: { at: string; by: string; change: string }[];
}

export const store = () => getStore({ name: 'orders', consistency: 'strong' });

function yearIn(tz: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now);
}

/** Sequential, collision-safe inquiry IDs using conditional writes. */
export async function nextInquiryId(): Promise<string> {
  const s = store();
  const year = yearIn(catalog.rules.timezone);
  const key = `counter/${year}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await s.getWithMetadata(key, { type: 'json' });
    const n = ((current?.data as { n?: number } | undefined)?.n ?? 0) + 1;
    const res = current
      ? await s.setJSON(key, { n }, { onlyIfMatch: current.etag! })
      : await s.setJSON(key, { n }, { onlyIfNew: true });
    if (res.modified) return `AMC-${year}-${String(n).padStart(6, '0')}`;
  }
  throw new Error('Could not allocate an inquiry number');
}

export const getOrder = async (id: string) => (await store().get(`order/${id}`, { type: 'json' })) as OrderRecord | null;
export const saveOrder = (r: OrderRecord) => store().setJSON(`order/${r.id}`, { ...r, updatedAt: new Date().toISOString() });

export async function listOrders(): Promise<OrderRecord[]> {
  const s = store();
  const { blobs } = await s.list({ prefix: 'order/' });
  const records = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<OrderRecord | null>));
  return records.filter((r): r is OrderRecord => !!r).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  // Neutralize spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function toCsv(rows: OrderRecord[]) {
  const cols: [string, (r: OrderRecord) => unknown][] = [
    ['Inquiry ID', (r) => r.id],
    ['Submitted', (r) => r.createdAt],
    ['Status', (r) => r.status],
    ['Payment', (r) => r.paymentStatus],
    ['Path', (r) => r.path],
    ['Service type', (r) => r.serviceType],
    ['Occasion', (r) => r.occasion],
    ['Guests / meals', (r) => r.count],
    ['Requested date', (r) => r.date],
    ['Window', (r) => r.timeWindowLabel],
    ['Fulfillment', (r) => r.fulfillment],
    ['Service level', (r) => r.serviceLevel],
    ['Address', (r) => [r.address.street, r.address.unit, r.address.city, r.address.zip].filter(Boolean).join(', ')],
    ['Zone', (r) => r.zone],
    ['Selections', (r) => r.lines.map((l) => `${l.qty} x ${l.label}${l.detail ? ` (${l.detail})` : ''}${l.total != null ? ` $${l.total}` : ''}`).join('; ')],
    ['Subtotal', (r) => r.subtotal],
    ['Delivery fee', (r) => r.deliveryFee ?? ''],
    ['Tax', (r) => r.tax ?? ''],
    ['Total', (r) => r.total ?? ''],
    ['Name', (r) => r.contact.name],
    ['Company', (r) => r.contact.company],
    ['Email', (r) => r.contact.email],
    ['Phone', (r) => r.contact.phone],
    ['Contact preference', (r) => r.contact.preference],
    ['Dietary / allergens', (r) => r.dietaryNotes],
    ['Access notes', (r) => r.accessNotes],
    ['Instructions', (r) => r.instructions],
    ['Quote reasons', (r) => r.reasons.join('; ')],
    ['UTM source', (r) => r.source.utm_source ?? ''],
    ['UTM medium', (r) => r.source.utm_medium ?? ''],
    ['UTM campaign', (r) => r.source.utm_campaign ?? ''],
    ['Referrer', (r) => r.source.referrer ?? ''],
    ['Service consent', (r) => (r.consentService ? 'yes' : 'no')],
    ['Marketing consent', (r) => (r.consentMarketing ? 'yes' : 'no')],
    ['Follow-up owner', (r) => r.followUpOwner],
    ['Next follow-up', (r) => r.nextFollowUp],
    ['Internal notes', (r) => r.internalNotes],
  ];
  return [cols.map(([h]) => csvCell(h)).join(','), ...rows.map((r) => cols.map(([, f]) => csvCell(f(r))).join(','))].join('\r\n');
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const siteUrl = () => (process.env.URL || process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');

export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true' && !!process.env.STRIPE_SECRET_KEY;
