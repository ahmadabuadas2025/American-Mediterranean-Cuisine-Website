/**
 * Sends one clearly-marked TEST order to a GoHighLevel webhook so the GHL
 * trigger can learn the fields ("Fetch sample requests").
 * Usage: npx tsx scripts/ghl-sample.ts <webhook-url>
 */
import { buildGhlPayload } from '../netlify/lib/ghl';
import type { OrderRecord } from '../netlify/lib/orders';

const url = process.argv[2] ?? process.env.GHL_WEBHOOK_URL;
if (!url) throw new Error('Pass the webhook URL');
process.env.URL ??= 'https://american-mediterranean-cuisine.netlify.app';

const now = new Date();
const date = new Date(now.getTime() + 12 * 864e5).toISOString().slice(0, 10);
const sample: OrderRecord = {
  id: 'AMC-TEST-000000',
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  status: 'request_received',
  paymentStatus: 'none',
  path: 'quote',
  reasons: ['TEST sample sent to set up the GoHighLevel workflow. Safe to delete.'],
  serviceType: 'office',
  occasion: 'Office lunch or meeting',
  count: 12,
  date,
  timeWindow: '11:30',
  timeWindowLabel: '11:30 am–12:30 pm',
  fulfillment: 'delivery',
  serviceLevel: 'drop-off',
  address: { street: '100 Test Street', unit: 'Suite 1', city: 'Tampa', zip: '33602' },
  zone: 'Unconfirmed',
  lines: [
    { uid: 'a', label: 'Classic Box', detail: 'Chicken Shawarma · Greek Village Salad · Hummus · Roasted Potatoes', qty: 8, unitPrice: 16.95, total: 135.6, approved: false },
    { uid: 'b', label: 'Classic Box', detail: 'Falafel · Tabbouleh / Fattoush · Baba Ghanoush · Seasoned Rice / Warm Pita', qty: 4, unitPrice: 16.95, total: 67.8, approved: false },
  ],
  selections: [],
  event: { consultOnly: false, addOns: [], preferences: {} },
  subtotal: 203.4,
  deliveryFee: null,
  tax: null,
  total: null,
  contact: { name: 'TEST Please-Delete', email: 'test@example.com', phone: '+1 813 555 0100', preference: 'email', company: 'Test Company' },
  accessNotes: 'TEST: loading dock B',
  dietaryNotes: 'TEST: 2 people avoid sesame',
  instructions: 'TEST order to set up GoHighLevel',
  consentService: true,
  consentMarketing: false,
  source: { utm_source: 'test', utm_medium: 'setup', utm_campaign: 'ghl-setup' },
  followUpOwner: '',
  nextFollowUp: '',
  internalNotes: '',
  history: [],
};

const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildGhlPayload(sample, 'order.created')) });
console.log(res.status, (await res.text()).slice(0, 200));
