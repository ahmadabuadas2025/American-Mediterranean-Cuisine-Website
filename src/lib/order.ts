/**
 * Order rules shared by the builder (browser) and /api/submit-order (server).
 * The server always re-runs these with its own catalog; the browser result is
 * only a preview. Nothing here touches the DOM or Node APIs.
 */
import { z } from 'zod';
import type { Catalog, MenuEntry, PackageEntry } from './catalog-types';
import { isSet, serviceType, type ServiceType, type Slot } from './schemas';

/* ------------------------------------------------------------------ schema */

const selections = z.record(z.string(), z.array(z.string()));

export const lineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('package'),
    uid: z.string(),
    packageId: z.string(),
    qty: z.number().int().min(1).max(500),
    selections: selections.default({}),
  }),
  z.object({
    kind: z.literal('item'),
    uid: z.string(),
    itemId: z.string(),
    size: z.enum(['half', 'full']),
    qty: z.number().int().min(1).max(100),
  }),
]);
export type Line = z.infer<typeof lineSchema>;

/**
 * Phone number in E.164 (+18135550100), which GHL invoices require.
 * US numbers typed as (813) 555-0100, 813.555.0100 or 1-813-555-0100 become +1…;
 * numbers typed with a leading + keep their country code. Returns '' if unusable.
 */
export function toE164(raw: string) {
  const s = (raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');
const trimmed = (max: number) => z.string().trim().max(max);

export const orderSchema = z
  .object({
    serviceType,
    occasion: trimmed(80).min(1, 'Choose an occasion'),
    count: z.number({ error: 'Enter a number' }).int('Use a whole number').min(1, 'Enter at least 1').max(2000),
    date: ymd,
    timeWindow: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a time window'),
    fulfillment: z.enum(['delivery', 'pickup']),
    serviceLevel: z.enum(['drop-off', 'setup', 'full-service']),
    lines: z.array(lineSchema).max(60).default([]),
    event: z
      .object({
        tierId: z.string().optional(),
        consultOnly: z.boolean().default(false),
        addOns: z.array(z.string()).max(12).default([]),
        preferences: selections.default({}),
      })
      .default({ consultOnly: false, addOns: [], preferences: {} }),
    contact: z.object({
      name: trimmed(120).min(2, 'Enter your name'),
      email: z.email('Enter a valid email address').max(200),
      phone: trimmed(40).refine((v) => toE164(v) !== '', 'Enter a 10-digit US phone number, e.g. (813) 555-0100 (the +1 is optional)'),
      preference: z.enum(['email', 'phone', 'text']),
      company: trimmed(120).optional().default(''),
    }),
    address: z
      .object({
        street: trimmed(200).default(''),
        unit: trimmed(60).default(''),
        city: trimmed(80).default(''),
        zip: trimmed(10).default(''),
      })
      .default({ street: '', unit: '', city: '', zip: '' }),
    accessNotes: trimmed(1000).default(''),
    dietaryNotes: trimmed(1500).default(''),
    instructions: trimmed(1500).default(''),
    consentService: z.literal(true, { error: 'Please agree so we can contact you about this order' }),
    consentMarketing: z.boolean().default(false),
    source: z
      .object({
        utm_source: trimmed(100).optional(),
        utm_medium: trimmed(100).optional(),
        utm_campaign: trimmed(100).optional(),
        utm_term: trimmed(100).optional(),
        utm_content: trimmed(100).optional(),
        referrer: trimmed(300).optional(),
        landing: trimmed(300).optional(),
      })
      .default({}),
    /** honeypot, must stay empty */
    website: z.string().max(0).optional().default(''),
  })
  .superRefine((o, ctx) => {
    for (const [k, message] of Object.entries(addressErrors(o.fulfillment, o.address))) {
      ctx.addIssue({ code: 'custom', path: k.split('.'), message });
    }
  });
export type OrderInput = z.infer<typeof orderSchema>;

/**
 * Delivery address rules. Kept separate because Zod skips object refinements
 * while other fields are invalid; the builder merges these in so every
 * problem shows at once.
 */
export function addressErrors(fulfillment: string, a: { street?: string; city?: string; zip?: string }) {
  const e: Record<string, string> = {};
  if (fulfillment !== 'delivery') return e;
  if ((a.street ?? '').trim().length < 3) e['address.street'] = 'Enter the delivery street address';
  if ((a.city ?? '').trim().length < 2) e['address.city'] = 'Enter the city';
  if (!/^\d{5}$/.test((a.zip ?? '').trim())) e['address.zip'] = 'Enter a 5-digit ZIP code';
  return e;
}

/* -------------------------------------------------------------- utilities */

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: n % 1 ? 2 : 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

export const SERVICE_LABELS: Record<ServiceType, string> = {
  individual: 'Individual lunchbox',
  office: 'Office or group lunchboxes',
  family: 'Family box (3–5 people)',
  trays: 'Trays and meal catering',
  event: 'Event catering',
};

/** Package kinds offered for each service type. */
export const KINDS_FOR: Record<ServiceType, PackageEntry['kind'][]> = {
  individual: ['box'],
  office: ['box'],
  family: ['family'],
  trays: ['tray-package'],
  event: ['event-tier'],
};

export const countLabel = (t: ServiceType) =>
  t === 'individual' || t === 'office' ? 'meals' : t === 'event' ? 'guests' : 'people';

export function itemsForSlot(menu: MenuEntry[], slot: Slot) {
  return menu.filter((m) => m.available && m.boxRoles.some((r) => slot.roles.includes(r)));
}

/* ------------------------------------------------------------- dates (TZ) */

function tzOffsetMinutes(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return (Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime()) / 60000;
}

/** Wall-clock date + time in the business time zone → absolute Date. */
export function zonedDate(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return new Date(guess - tzOffsetMinutes(new Date(guess), tz) * 60000);
}

export function todayIn(tz: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export type DateStatus = 'ok' | 'blackout' | 'booked' | 'closed' | 'past' | 'too-soon' | 'rush';

export function dateStatus(c: Catalog, type: ServiceType, date: string, time: string, now = new Date()): { status: DateStatus; message: string } {
  const blackout = c.calendar.blackoutDates.find((b) => b.date === date);
  if (blackout) return { status: 'blackout', message: `We are not taking orders on ${formatDate(date)}${blackout.reason ? ` (${blackout.reason.toLowerCase()})` : ''}.` };
  if (c.calendar.fullyBookedDates.includes(date)) return { status: 'booked', message: `${formatDate(date)} is fully booked.` };
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (c.calendar.closedWeekdays.includes(weekday)) return { status: 'closed', message: `We do not deliver on ${formatDate(date).split(',')[0]}s.` };
  const hours = (zonedDate(date, time, c.rules.timezone).getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return { status: 'past', message: 'That time has already passed.' };
  if (hours < c.rules.rushFloorHours[type]) return { status: 'too-soon', message: `That is sooner than we can prepare ${type === 'event' ? 'an event' : 'this order'}.` };
  if (hours < c.rules.leadTimeHours[type]) {
    const { min, max } = c.rules.rushFeePercent;
    return { status: 'rush', message: `This is inside our ${leadTimeText(c.rules.leadTimeHours[type])} lead time, so it becomes a rush request. If we can accept it, a ${min}–${max}% rush fee applies.` };
  }
  return { status: 'ok', message: '' };
}

export const leadTimeText = (h: number) => (h >= 48 && h % 24 === 0 ? `${h / 24}-day` : `${h}-hour`);
export const leadTimeLabel = (h: number) => (h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} hours`);

/** Next dates that meet the standard lead time and are open. */
export function suggestDates(c: Catalog, type: ServiceType, time: string, now = new Date(), n = 3) {
  const out: string[] = [];
  let d = todayIn(c.rules.timezone, now);
  for (let i = 0; i < 120 && out.length < n; i++, d = addDays(d, 1)) {
    if (dateStatus(c, type, d, time, now).status === 'ok') out.push(d);
  }
  return out;
}

/* --------------------------------------------------------------- pricing */

export interface PricedLine {
  uid: string;
  label: string;
  detail: string;
  qty: number;
  unitPrice: number | null;
  total: number | null;
  approved: boolean;
}

export interface Evaluation {
  lines: PricedLine[];
  /** food subtotal of priced lines (custom/quoted lines excluded) */
  subtotal: number;
  /** true when some lines have no fixed price */
  hasQuotedLines: boolean;
  deliveryFee: number | null;
  tax: number | null;
  total: number | null;
  servings: number;
  meals: number;
  zone: { id: string; name: string } | null;
  dateCheck: { status: DateStatus; message: string };
  /** blocking problems, keyed by field path */
  errors: Record<string, string>;
  path: 'checkout' | 'quote' | 'conflict';
  /** customer-facing reasons the order is a quote or conflict */
  reasons: string[];
}

const pkgById = (c: Catalog, id: string) => c.packages.find((p) => p.id === id);
const itemById = (c: Catalog, id: string) => c.menu.find((m) => m.id === id);

function describeSelections(c: Catalog, p: PackageEntry, sel: Record<string, string[]>) {
  return p.slots
    .map((s) => (sel[s.key] ?? []).map((id) => itemById(c, id)?.name).filter(Boolean).join(' + '))
    .filter(Boolean)
    .join(' · ');
}

export function evaluateOrder(
  c: Catalog,
  o: Pick<OrderInput, 'serviceType' | 'count' | 'date' | 'timeWindow' | 'fulfillment' | 'serviceLevel' | 'lines' | 'event'> & {
    address?: { zip?: string };
  },
  opts: { paymentsEnabled: boolean; now?: Date },
): Evaluation {
  const errors: Record<string, string> = {};
  const reasons = new Set<string>();
  const lines: PricedLine[] = [];
  let subtotal = 0;
  let hasQuotedLines = false;
  let servings = 0;
  let meals = 0;
  let boxes = 0;
  let familyBoxes = 0;
  let trays = 0;
  let allApproved = true;
  const allowedKinds = KINDS_FOR[o.serviceType];

  // ---- lines
  for (const line of o.lines) {
    if (line.kind === 'package') {
      const p = pkgById(c, line.packageId);
      if (!p || !p.available || !allowedKinds.includes(p.kind)) {
        errors[`lines.${line.uid}`] = 'This package is no longer available. Remove it to continue.';
        continue;
      }
      for (const slot of p.slots) {
        const chosen = (line.selections[slot.key] ?? []).filter(Boolean);
        const allowed = itemsForSlot(c.menu, slot).map((m) => m.id);
        if (chosen.length !== slot.count || chosen.some((id) => !allowed.includes(id))) {
          errors[`lines.${line.uid}.${slot.key}`] = `Choose ${slot.count === 1 ? 'a' : slot.count} ${slot.label.toLowerCase()} for ${p.name}.`;
        }
      }
      const total = p.price == null ? null : round2(p.price * line.qty);
      if (total == null) hasQuotedLines = true;
      else subtotal += total;
      if (p.custom) reasons.add('Custom orders are confirmed with an itemized quote.');
      if (!p.approved) allApproved = false;
      if (p.kind === 'box') { boxes += line.qty; meals += line.qty; servings += line.qty; }
      if (p.kind === 'family') { familyBoxes += line.qty; servings += (p.servings ?? 4) * line.qty; }
      if (p.kind === 'tray-package') { trays += line.qty * 5; servings += (p.servings ?? 0) * line.qty; }
      lines.push({ uid: line.uid, label: p.name, detail: describeSelections(c, p, line.selections), qty: line.qty, unitPrice: p.price, total, approved: p.approved });
    } else {
      const m = itemById(c, line.itemId);
      if (!m || !m.available || o.serviceType !== 'trays') {
        errors[`lines.${line.uid}`] = 'This item is no longer available. Remove it to continue.';
        continue;
      }
      const unit = line.size === 'half' ? m.priceHalf : m.priceFull;
      const total = round2(unit * line.qty);
      subtotal += total;
      trays += line.qty;
      servings += (line.size === 'half' ? m.servingsHalf : m.servingsFull) * line.qty;
      if (!m.approved) allApproved = false;
      reasons.add('Custom tray orders are confirmed with an itemized quote.');
      lines.push({ uid: line.uid, label: `${m.name} (${line.size} tray)`, detail: `Serves about ${line.size === 'half' ? m.servesHalf : m.servesFull}`, qty: line.qty, unitPrice: unit, total, approved: m.approved });
    }
  }

  // ---- events
  if (o.serviceType === 'event') {
    reasons.add('Events are confirmed with an itemized quote after we review your date and menu.');
    if (o.count > c.rules.unusualQuantity.eventGuests) reasons.add('Very large events are planned with our team directly.');
    if (!o.event.consultOnly) {
      const tier = o.event.tierId ? pkgById(c, o.event.tierId) : undefined;
      if (!tier || tier.kind !== 'event-tier' || !tier.available) {
        errors['event.tierId'] = 'Choose an event package, or ask for a consultation instead.';
      } else {
        if (tier.minGuests && o.count < tier.minGuests) errors['event.tierId'] = `${tier.name} starts at ${tier.minGuests} guests. Change the guest count or choose another package.`;
        if (!tier.approved) allApproved = false;
        const total = tier.price == null ? null : round2(tier.price * o.count);
        if (total == null) hasQuotedLines = true; else subtotal += total;
        servings += o.count;
        const prefs = tier.slots
          .map((s) => (o.event.preferences[s.key] ?? []).map((id) => itemById(c, id)?.name).filter(Boolean).join(', '))
          .filter(Boolean)
          .join(' · ');
        lines.push({ uid: 'event-tier', label: `${tier.name}, ${o.count} guests`, detail: prefs ? `Menu preferences: ${prefs}` : 'Menu to be planned with you', qty: o.count, unitPrice: tier.price, total, approved: tier.approved });
      }
    } else {
      lines.push({ uid: 'event-consult', label: `Event consultation, ${o.count} guests`, detail: 'We will plan the menu and service with you', qty: 1, unitPrice: null, total: null, approved: true });
      hasQuotedLines = true;
    }
    if (o.event.addOns.length) {
      const labels = o.event.addOns.map((k) => c.rules.eventAddOns.find((a) => a.key === k)?.label).filter(Boolean);
      lines.push({ uid: 'event-addons', label: 'Requested add-ons', detail: labels.join(', '), qty: 1, unitPrice: null, total: null, approved: true });
      hasQuotedLines = true;
    }
  } else if (o.lines.length === 0) {
    errors['lines'] = 'Add at least one item to your order.';
  }

  // ---- minimums
  const m = c.rules.minimums;
  if (o.serviceType === 'office' && meals > 0 && meals < m.officeMeals && subtotal < m.officeSubtotal) {
    errors['minimum'] = `Office delivery starts at ${m.officeMeals} meals or a ${money(m.officeSubtotal)} food subtotal. You have ${meals} ${meals === 1 ? 'meal' : 'meals'} (${money(subtotal)}).`;
  }
  if (o.serviceType === 'individual' && boxes > 0 && boxes < m.individualBoxes) errors['minimum'] = `The minimum is ${m.individualBoxes} boxes.`;
  if (o.serviceType === 'family' && familyBoxes > 0 && familyBoxes < m.familyBoxes) errors['minimum'] = `The minimum is ${m.familyBoxes} family boxes.`;

  // ---- unusual quantities
  const u = c.rules.unusualQuantity;
  if (boxes > u.boxes || familyBoxes > u.familyBoxes || trays > u.trays) reasons.add('Large orders are confirmed by our team so we can plan kitchen capacity.');

  // ---- service level
  if (o.serviceLevel !== 'drop-off') reasons.add('Setup and on-site service are quoted by buffet size and staffing.');

  // ---- fulfillment & zone
  let zone: Evaluation['zone'] = null;
  let deliveryFee: number | null = 0;
  if (o.fulfillment === 'delivery') {
    const zip = o.address?.zip ?? '';
    const z = c.zones.zones.find((zz) => zz.zips.includes(zip));
    if (z) {
      zone = { id: z.id, name: z.name };
      deliveryFee = z.deliveryFee;
      if (z.deliveryFee == null) reasons.add('We will confirm the delivery fee for your address.');
      if (z.minimumSubtotal != null && subtotal < z.minimumSubtotal) reasons.add(`Your delivery zone has a ${money(z.minimumSubtotal)} minimum; we will confirm options with you.`);
    } else {
      deliveryFee = null;
      if (/^\d{5}$/.test(zip)) reasons.add('We need to confirm delivery to your ZIP code.');
      else reasons.add('We will confirm the delivery fee once we have your address.');
    }
  } else if (!(c.settings.pickup.enabled && isSet(c.settings.pickup.address))) {
    reasons.add('We will confirm pickup details with you.');
  }

  // ---- date
  const dateCheck = /^\d{4}-\d{2}-\d{2}$/.test(o.date) && /^\d{2}:\d{2}$/.test(o.timeWindow)
    ? dateStatus(c, o.serviceType, o.date, o.timeWindow, opts.now)
    : { status: 'ok' as DateStatus, message: '' };
  if (dateCheck.status === 'rush') reasons.add('Your date is inside our standard lead time, so it is a rush request.');

  // ---- approvals & payments
  if (!allApproved) reasons.add('Our prices are awaiting final confirmation, so we confirm your total before payment.');
  if (!c.rules.approved) reasons.add('Our lead times are awaiting final confirmation.');
  if (!opts.paymentsEnabled) reasons.add('Online payment is not switched on yet, so we confirm your order by email or phone.');

  // ---- totals
  const tax = c.rules.taxRatePercent == null || deliveryFee == null ? null : round2((subtotal + deliveryFee) * (c.rules.taxRatePercent / 100));
  const total = !hasQuotedLines && deliveryFee != null && tax != null ? round2(subtotal + deliveryFee + tax) : null;
  if (total == null) reasons.add('Delivery, fees and tax are confirmed in your quote.');

  const conflict = ['blackout', 'booked', 'closed', 'past', 'too-soon'].includes(dateCheck.status);
  const path: Evaluation['path'] = conflict ? 'conflict' : reasons.size === 0 ? 'checkout' : 'quote';

  return { lines, subtotal: round2(subtotal), hasQuotedLines, deliveryFee, tax, total, servings, meals, zone, dateCheck, errors, path, reasons: [...reasons] };
}
