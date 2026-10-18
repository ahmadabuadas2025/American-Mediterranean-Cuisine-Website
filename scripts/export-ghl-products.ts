/**
 * Exports every sellable item from src/content into a CSV for importing into
 * GoHighLevel → Payments → Products, so invoice prices match the website.
 * One row per price: trays get separate Half and Full rows.
 * Usage: npm run catalog && npx tsx scripts/export-ghl-products.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog } from '../src/lib/catalog-types';

const root = join(import.meta.dirname, '..');
const c = JSON.parse(readFileSync(join(root, 'src', 'generated', 'catalog.json'), 'utf8')) as Catalog;

type Row = { name: string; description: string; price: number; category: string; sku: string };
const rows: Row[] = [];
const CAT: Record<string, string> = { mains: 'Trays - Mains', salads: 'Trays - Salads', dips: 'Trays - Dips', mezze: 'Trays - Mezze', carbs: 'Trays - Carbs', sides: 'Trays - Sides' };
const sku = (...parts: string[]) => parts.join('-').toUpperCase().replace(/[^A-Z0-9-]/g, '');

// Boxes and family boxes
for (const p of c.packages.filter((p) => p.kind === 'box' || p.kind === 'family')) {
  if (p.price == null) continue;
  const serves = p.serves && p.serves !== '1' ? `Serves ${p.serves}. ` : '';
  rows.push({ name: p.name, description: `${serves}${p.inclusions.join('; ')}.`, price: p.price, category: p.kind === 'box' ? 'Lunchboxes' : 'Family Boxes', sku: sku('BOX', p.id) });
}
// Tray packages with a fixed price
for (const p of c.packages.filter((p) => p.kind === 'tray-package' && p.price != null)) {
  rows.push({ name: p.name, description: `${p.summary} Includes: ${p.inclusions.join('; ')}.`, price: p.price!, category: 'Tray Packages', sku: sku('PKG', p.id) });
}
// Every menu item, half and full tray
for (const m of c.menu) {
  rows.push({ name: `${m.name} - Half Tray`, description: `${m.description} Serves about ${m.servesHalf}.`, price: m.priceHalf, category: CAT[m.category], sku: sku(m.id, 'HALF') });
  rows.push({ name: `${m.name} - Full Tray`, description: `${m.description} Serves about ${m.servesFull}.`, price: m.priceFull, category: CAT[m.category], sku: sku(m.id, 'FULL') });
}
// Event tiers: priced per guest (set the invoice quantity to the guest count)
for (const p of c.packages.filter((p) => p.kind === 'event-tier' && p.price != null)) {
  rows.push({ name: `${p.name} (per guest)`, description: `Minimum ${p.minGuests} guests. ${p.inclusions.join('; ')}. Set quantity = number of guests.`, price: p.price!, category: 'Event Packages', sku: sku('EVENT', p.id) });
}
// Add-ons with a known starting price
const s = c.rules.setupFee;
rows.push({ name: 'Buffet Setup - Small', description: `Buffet setup for smaller events (starting price; final pricing by buffet size).`, price: s.min, category: 'Add-ons', sku: 'ADDON-SETUP-SMALL' });
rows.push({ name: 'Buffet Setup - Large', description: `Buffet setup for larger events (starting price; final pricing by buffet size).`, price: s.max, category: 'Add-ons', sku: 'ADDON-SETUP-LARGE' });

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const header = ['Product Name', 'Description', 'Price', 'Currency', 'Price Type', 'Category', 'SKU'];
const csv = [header.map(esc).join(','), ...rows.map((r) => [r.name, r.description, r.price.toFixed(2), 'USD', 'one_time', r.category, r.sku].map(esc).join(','))].join('\r\n');

const outDir = join(root, 'docs', 'ghl');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'ghl-products.csv'), '﻿' + csv + '\r\n');
console.log(`${rows.length} products → docs/ghl/ghl-products.csv`);
const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.category] = (a[r.category] ?? 0) + 1), a), {});
console.log(counts);
