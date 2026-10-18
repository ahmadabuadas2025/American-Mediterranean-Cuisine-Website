import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftInvoice, invoiceItems, invoiceNotes } from '../netlify/lib/ghl-api';
import type { OrderRecord } from '../netlify/lib/orders';

const base: OrderRecord = {
  id: 'AMC-2026-000020', createdAt: '', updatedAt: '', status: 'request_received', paymentStatus: 'none', path: 'quote',
  reasons: ['internal reason, never shown to the customer'],
  serviceType: 'office', occasion: 'Office lunch or meeting', count: 12, date: '2030-03-20', timeWindow: '11:30', timeWindowLabel: '11:30 am–12:30 pm',
  fulfillment: 'delivery', serviceLevel: 'drop-off', address: { street: '100 Test St', unit: 'Suite 2', city: 'Tampa', zip: '33602' }, zone: '',
  lines: [
    { uid: 'a', label: 'Classic Box', detail: 'Chicken Shawarma · Greek Village Salad · Hummus · Roasted Potatoes', qty: 8, unitPrice: 16.95, total: 135.6, approved: false },
    { uid: 'b', label: 'Hummus (full tray)', detail: 'Serves about 10–12', qty: 1, unitPrice: 66, total: 66, approved: false },
    { uid: 'event-addons', label: 'Requested add-ons', detail: 'Buffet setup', qty: 1, unitPrice: null, total: null, approved: true },
  ],
  selections: [], event: { consultOnly: false, addOns: [], preferences: {} },
  subtotal: 201.6, deliveryFee: null, tax: null, total: null,
  contact: { name: 'Maria de la Cruz', email: 'maria@example.com', phone: '+18135550100', preference: 'email', company: 'Acme' },
  accessNotes: '', dietaryNotes: 'One guest avoids sesame', instructions: '', consentService: true, consentMarketing: false, source: {},
  followUpOwner: '', nextFollowUp: '', internalNotes: '', history: [],
};

describe('invoice items', () => {
  it('uses only priced lines with unit price and quantity', () => {
    expect(invoiceItems(base)).toEqual([
      { name: 'Classic Box', description: 'Chicken Shawarma · Greek Village Salad · Hummus · Roasted Potatoes', amount: 16.95, qty: 8, currency: 'USD', type: 'one_time' },
      { name: 'Hummus (full tray)', description: 'Serves about 10–12', amount: 66, qty: 1, currency: 'USD', type: 'one_time' },
    ]);
  });
  it('notes show order, address, dietary and quoted extras, but not internal reasons', () => {
    const n = invoiceNotes(base);
    expect(n).toContain('Order AMC-2026-000020');
    expect(n).toContain('100 Test St, Suite 2, Tampa, 33602');
    expect(n).toContain('One guest avoids sesame');
    expect(n).toContain('Requested add-ons: Buffet setup');
    expect(n).not.toContain('internal reason');
  });
});

describe('createDraftInvoice', () => {
  const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
  beforeEach(() => {
    calls.length = 0;
    process.env.GHL_API_TOKEN = 'pit-test';
    process.env.GHL_LOCATION_ID = 'LOC123';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: init.method!, url, body: init.body ? JSON.parse(init.body as string) : {} });
      const respond = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (url.endsWith('/contacts/upsert')) return respond({ new: true, contact: { id: 'CONTACT1' } });
      if (url.includes('/locations/')) return respond({ location: { name: 'American Mediterranean Cuisine', phone: '+18135034606', city: 'Tampa', state: 'FL', postalCode: '33610' } });
      if (url.endsWith('/invoices/')) return respond({ _id: 'INV1', status: 'draft' });
      return new Response('not found', { status: 404 });
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.GHL_API_TOKEN; delete process.env.GHL_LOCATION_ID; });

  it('upserts the contact, then creates a draft invoice with every required API field', async () => {
    const res = await createDraftInvoice(base);
    expect(res).toMatchObject({ status: 'created', invoiceId: 'INV1', contactId: 'CONTACT1' });
    const inv = calls.find((c) => c.url.endsWith('/invoices/'))!;
    // Required by CreateInvoiceDto in HighLevel's published API spec
    for (const k of ['altId', 'altType', 'name', 'businessDetails', 'currency', 'items', 'discount', 'contactDetails', 'issueDate', 'sentTo', 'liveMode']) {
      expect(inv.body).toHaveProperty(k);
    }
    expect(inv.body).toMatchObject({ altId: 'LOC123', altType: 'location', name: 'AMC-2026-000020 quote', dueDate: '2030-03-19' });
    expect(inv.body.contactDetails).toMatchObject({ id: 'CONTACT1', name: 'Maria de la Cruz', email: 'maria@example.com', phoneNo: '+18135550100' });
    expect((inv.body.items as unknown[]).length).toBe(2);
    expect(calls.every((c) => c.url.startsWith('https://services.leadconnectorhq.com/'))).toBe(true);
  });

  it('skips when there is nothing priced (consultation only)', async () => {
    const res = await createDraftInvoice({ ...base, lines: [base.lines[2]] });
    expect(res.status).toBe('skipped');
    expect(calls.length).toBe(0);
  });

  it('reports a failure without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Invalid token"}', { status: 401 })));
    const res = await createDraftInvoice(base);
    expect(res.status).toBe('failed');
  });
});

describe('phone numbers for GHL (E.164)', () => {
  it('normalizes the ways customers type US numbers', async () => {
    const { toE164 } = await import('../netlify/lib/ghl-api');
    expect(toE164('(813) 555-0100')).toBe('+18135550100');
    expect(toE164('813.555.0100')).toBe('+18135550100');
    expect(toE164('1-813-555-0100')).toBe('+18135550100');
    expect(toE164('+44 20 7946 0958')).toBe('+442079460958');
    expect(toE164('555-0100')).toBe('');
  });

  it('sends the invoice with an E.164 phone even when typed with brackets', async () => {
    process.env.GHL_API_TOKEN = 'pit-test';
    process.env.GHL_LOCATION_ID = 'LOC123';
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (init.body) bodies.push(JSON.parse(init.body as string));
      if (url.endsWith('/contacts/upsert')) return new Response(JSON.stringify({ contact: { id: 'C1' } }));
      if (url.endsWith('/invoices/')) return new Response(JSON.stringify({ _id: 'I1' }));
      return new Response('{}', { status: 404 });
    }));
    const res = await createDraftInvoice({ ...base, contact: { ...base.contact, phone: '(813) 555-0100' } });
    expect(res.status).toBe('created');
    const inv = bodies.find((b) => b.altType === 'location')!;
    expect(inv.contactDetails.phoneNo).toBe('+18135550100');
    expect(inv.sentTo.phoneNo).toEqual(['+18135550100']);
    vi.unstubAllGlobals();
  });
});
