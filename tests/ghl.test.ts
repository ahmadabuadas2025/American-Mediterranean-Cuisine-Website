import { describe, expect, it } from 'vitest';
import { buildGhlPayload } from '../netlify/lib/ghl';
import type { OrderRecord } from '../netlify/lib/orders';

const record: OrderRecord = {
  id: 'AMC-2026-000042',
  createdAt: '2026-10-15T14:00:00.000Z',
  updatedAt: '2026-10-15T14:00:00.000Z',
  status: 'request_received',
  paymentStatus: 'none',
  path: 'quote',
  reasons: ['Events are confirmed with an itemized quote after we review your date and menu.'],
  serviceType: 'office',
  occasion: 'Office lunch or meeting',
  count: 12,
  date: '2026-10-28',
  timeWindow: '11:30',
  timeWindowLabel: '11:30 am–12:30 pm',
  fulfillment: 'delivery',
  serviceLevel: 'drop-off',
  address: { street: '100 Test Street', unit: 'Suite 4', city: 'Tampa', zip: '33602' },
  zone: 'Unconfirmed',
  lines: [{ uid: 'a', label: 'Classic Box', detail: 'Chicken Shawarma', qty: 12, unitPrice: 16.95, total: 203.4, approved: false }],
  selections: [],
  event: { consultOnly: false, addOns: [], preferences: {} },
  subtotal: 203.4,
  deliveryFee: null,
  tax: null,
  total: null,
  contact: { name: 'Maria de la Cruz', email: 'maria@example.com', phone: '813 555 0100', preference: 'email', company: 'Acme' },
  accessNotes: 'Loading dock B',
  dietaryNotes: '2 people avoid sesame',
  instructions: '',
  consentService: true,
  consentMarketing: true,
  source: { utm_source: 'google', utm_campaign: 'fall-office' },
  followUpOwner: '',
  nextFollowUp: '',
  internalNotes: '',
  history: [],
};

describe('GoHighLevel payload', () => {
  const p = buildGhlPayload(record, 'order.created');

  it('maps standard GHL contact fields', () => {
    expect(p).toMatchObject({
      first_name: 'Maria',
      last_name: 'de la Cruz',
      email: 'maria@example.com',
      phone: '813 555 0100',
      company_name: 'Acme',
      address1: '100 Test Street',
      city: 'Tampa',
      state: 'FL',
      postal_code: '33602',
    });
  });

  it('carries the order details as flat fields', () => {
    expect(p.order_id).toBe('AMC-2026-000042');
    expect(p.order_path).toBe('Quote request');
    expect(p.items_summary).toBe('12 x Classic Box (Chicken Shawarma): $203.40');
    expect(p.total).toBe('');
    expect(p.total_display).toMatch(/\$203\.40 food subtotal/);
    expect(p.event_date_display).toBe('Wednesday, October 28');
    expect(p.tags).toBe('website-order,service-office,path-quote,marketing-opt-in');
  });

  it('is flat (every value is a primitive) so GHL can map it', () => {
    for (const v of Object.values(p)) expect(['string', 'number', 'boolean']).toContain(typeof v);
  });
});
