import { describe, expect, it } from 'vitest';
import catalogJson from '../src/generated/catalog.json';
import type { Catalog } from '../src/lib/catalog-types';
import { addressErrors, dateStatus, evaluateOrder, orderSchema, suggestDates, zonedDate } from '../src/lib/order';

const base = catalogJson as unknown as Catalog;
// A fully configured, approved catalog: the only state in which checkout is possible.
const approved: Catalog = {
  ...base,
  menu: base.menu.map((m) => ({ ...m, approved: true })),
  packages: base.packages.map((p) => ({ ...p, approved: true })),
  rules: { ...base.rules, approved: true, taxRatePercent: 7.5 },
  zones: { ...base.zones, zones: [{ id: 'z1', name: 'Downtown Tampa', description: '', zips: ['33602'], deliveryFee: 25, minimumSubtotal: null }] },
  settings: { ...base.settings, pickup: { ...base.settings.pickup, address: '123 Example St' } },
};

const NOW = new Date('2026-10-14T14:00:00Z'); // 10:00 in Tampa
const classic = { classic: { main: ['chicken-shawarma'], salad: ['greek-village-salad'], dip: ['hummus'], side: ['roasted-potatoes'] } };

function order(over: Record<string, unknown> = {}) {
  return {
    serviceType: 'office' as const,
    count: 12,
    date: '2026-10-20',
    timeWindow: '11:30',
    fulfillment: 'delivery' as const,
    serviceLevel: 'drop-off' as const,
    lines: [{ kind: 'package' as const, uid: 'a', packageId: 'classic-box', qty: 12, selections: classic.classic }],
    event: { consultOnly: false, addOns: [], preferences: {} },
    address: { zip: '33602' },
    ...over,
  };
}

describe('pricing', () => {
  it('prices package lines from the catalog', () => {
    const ev = evaluateOrder(approved, order(), { paymentsEnabled: true, now: NOW });
    expect(ev.subtotal).toBe(203.4); // 12 × $16.95
    expect(ev.deliveryFee).toBe(25);
    expect(ev.tax).toBe(17.13);
    expect(ev.total).toBe(245.53);
  });

  it('leaves tax and total unknown until configured', () => {
    const ev = evaluateOrder(base, order(), { paymentsEnabled: true, now: NOW });
    expect(ev.tax).toBeNull();
    expect(ev.total).toBeNull();
  });
});

describe('branching', () => {
  it('standard + approved + available + payments on → checkout', () => {
    const ev = evaluateOrder(approved, order(), { paymentsEnabled: true, now: NOW });
    expect(ev.errors).toEqual({});
    expect(ev.path).toBe('checkout');
  });

  it('payments disabled → quote', () => {
    expect(evaluateOrder(approved, order(), { paymentsEnabled: false, now: NOW }).path).toBe('quote');
  });

  it('concept (unapproved) prices → quote', () => {
    expect(evaluateOrder(base, order(), { paymentsEnabled: true, now: NOW }).path).toBe('quote');
  });

  it('events are always quotes', () => {
    const ev = evaluateOrder(approved, order({ serviceType: 'event', count: 40, date: '2026-11-20', lines: [], event: { tierId: 'celebration-buffet', consultOnly: false, addOns: [], preferences: {} } }), { paymentsEnabled: true, now: NOW });
    expect(ev.path).toBe('quote');
    expect(ev.subtotal).toBe(40 * 29);
  });

  it('event below tier minimum is blocked', () => {
    const ev = evaluateOrder(approved, order({ serviceType: 'event', count: 25, date: '2026-11-20', lines: [], event: { tierId: 'signature-event', consultOnly: false, addOns: [], preferences: {} } }), { paymentsEnabled: true, now: NOW });
    expect(ev.errors['event.tierId']).toMatch(/50 guests/);
  });

  it('custom trays → quote', () => {
    const ev = evaluateOrder(approved, order({ serviceType: 'trays', count: 10, lines: [{ kind: 'item', uid: 'i', itemId: 'hummus', size: 'full', qty: 1 }] }), { paymentsEnabled: true, now: NOW });
    expect(ev.path).toBe('quote');
    expect(ev.subtotal).toBe(66);
  });

  it('out-of-zone ZIP → quote', () => {
    const ev = evaluateOrder(approved, order({ address: { zip: '32801' } }), { paymentsEnabled: true, now: NOW });
    expect(ev.path).toBe('quote');
    expect(ev.reasons.join(' ')).toMatch(/ZIP/);
  });

  it('rush date → quote', () => {
    const ev = evaluateOrder(approved, order({ date: '2026-10-15', timeWindow: '07:30' }), { paymentsEnabled: true, now: NOW });
    expect(ev.dateCheck.status).toBe('rush');
    expect(ev.path).toBe('quote');
  });

  it('unusual quantity → quote', () => {
    const ev = evaluateOrder(approved, order({ count: 120, lines: [{ kind: 'package', uid: 'a', packageId: 'classic-box', qty: 120, selections: classic.classic }] }), { paymentsEnabled: true, now: NOW });
    expect(ev.path).toBe('quote');
  });

  it('blackout date → conflict, never checkout', () => {
    const ev = evaluateOrder(approved, order({ date: '2026-12-25' }), { paymentsEnabled: true, now: NOW });
    expect(ev.path).toBe('conflict');
  });

  it('same-day order below the rush floor → conflict', () => {
    const ev = evaluateOrder(approved, order({ date: '2026-10-14', timeWindow: '16:30' }), { paymentsEnabled: true, now: NOW });
    expect(ev.dateCheck.status).toBe('too-soon');
    expect(ev.path).toBe('conflict');
  });
});

describe('rules', () => {
  it('enforces the office minimum (10 meals or $175)', () => {
    const ev = evaluateOrder(approved, order({ lines: [{ kind: 'package', uid: 'a', packageId: 'classic-box', qty: 4, selections: classic.classic }] }), { paymentsEnabled: true, now: NOW });
    expect(ev.errors.minimum).toMatch(/10 meals/);
  });

  it('requires every slot to be chosen with an allowed dish', () => {
    const ev = evaluateOrder(approved, order({ lines: [{ kind: 'package', uid: 'a', packageId: 'classic-box', qty: 12, selections: { main: ['hummus'] } }] }), { paymentsEnabled: true, now: NOW });
    expect(Object.keys(ev.errors).some((k) => k.startsWith('lines.a.'))).toBe(true);
  });

  it('suggests open dates that meet lead time and skip blackouts', () => {
    const dates = suggestDates(approved, 'trays', '11:30', new Date('2026-12-23T14:00:00Z'));
    expect(dates).not.toContain('2026-12-25');
    expect(dateStatus(approved, 'trays', dates[0], '11:30', new Date('2026-12-23T14:00:00Z')).status).toBe('ok');
  });

  it('converts Tampa wall-clock time across DST', () => {
    expect(zonedDate('2026-07-01', '12:00', 'America/New_York').toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(zonedDate('2026-12-01', '12:00', 'America/New_York').toISOString()).toBe('2026-12-01T17:00:00.000Z');
  });
});

describe('schema', () => {
  it('requires address fields for delivery and consent', () => {
    const r = orderSchema.safeParse({ ...order(), occasion: 'Office lunch or meeting', contact: { name: 'A B', email: 'a@b.co', phone: '813 555 0100', preference: 'email' }, address: { street: '', city: '', zip: '1' }, consentService: false });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join('.'))).toContain('consentService');
    // Address problems are reported even while other fields are invalid.
    expect(Object.keys(addressErrors('delivery', { street: '', city: '', zip: '1' }))).toEqual(['address.street', 'address.city', 'address.zip']);
    expect(addressErrors('pickup', {})).toEqual({});
  });
});
