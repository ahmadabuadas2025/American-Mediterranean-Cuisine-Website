/**
 * Exports every sellable item from src/content as a GoHighLevel product
 * import file (Payments → Products → Import as CSV), so invoice prices match
 * the website. Uses GHL's 29-column template: trays become one product with a
 * "Size" option (Half Tray / Full Tray); everything else is a single-price product.
 * Usage: npm run ghl:products
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Catalog } from '../src/lib/catalog-types';

const root = join(import.meta.dirname, '..');
const c = JSON.parse(readFileSync(join(root, 'src', 'generated', 'catalog.json'), 'utf8')) as Catalog;
const SITE = 'https://american-mediterranean-cuisine.netlify.app';

const HEADER = [
  'Handle', 'Title', 'Body (HTML)', 'Included in Online Store', 'Image Src',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
  'Variant Price', 'Variant Compare At Price', 'Track Inventory', 'Allow Out of Stock Purchases', 'Available Quantity',
  'SKU', 'Weight Value', 'Weight Unit', 'Dimension Length', 'Dimension Width', 'Dimension Height', 'Dimension Unit',
  'Product Label Enable', 'Label Title', 'Label Start Date', 'Label End Date', 'SEO Title', 'SEO Description',
] as const;
type Col = (typeof HEADER)[number];
const rows: Partial<Record<Col, string>>[] = [];

/** Only processed photos have a public URL GHL can fetch. */
const image = (src?: string) => (src && src.startsWith('/media/photos/') ? `${SITE}${src}` : '');
const html = (...parts: string[]) => parts.filter(Boolean).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
const sku = (...parts: string[]) => parts.join('-').toUpperCase().replace(/[^A-Z0-9-]/g, '');
const money = (n: number) => n.toFixed(2);

function single(handle: string, title: string, body: string, price: number, img = '') {
  rows.push({
    Handle: handle, Title: title, 'Body (HTML)': body, 'Included in Online Store': 'FALSE', 'Image Src': img,
    'Variant Price': money(price), 'Track Inventory': 'FALSE', 'Allow Out of Stock Purchases': 'TRUE',
    SKU: sku(handle), 'Product Label Enable': 'FALSE',
  });
}

// Lunchboxes and family boxes
for (const p of c.packages.filter((p) => (p.kind === 'box' || p.kind === 'family') && p.price != null)) {
  single(p.id, p.name, html(p.summary, `Includes: ${p.inclusions.join('; ')}.`, p.serves && p.serves !== '1' ? `Serves ${p.serves}.` : ''), p.price!, image(p.image));
}
// Tray packages with a fixed price
for (const p of c.packages.filter((p) => p.kind === 'tray-package' && p.price != null)) {
  single(p.id, p.name, html(p.summary, `Includes: ${p.inclusions.join('; ')}.`), p.price!, image(p.image));
}
// Every menu dish: one product, Size option with Half / Full variants
for (const m of c.menu) {
  rows.push({
    Handle: m.id, Title: m.name,
    'Body (HTML)': html(m.description, `Half tray serves about ${m.servesHalf}; full tray about ${m.servesFull}.`, m.allergenNote ?? ''),
    'Included in Online Store': 'FALSE', 'Image Src': image(m.image),
    'Option1 Name': 'Size', 'Option1 Value': 'Half Tray', 'Variant Price': money(m.priceHalf),
    'Track Inventory': 'FALSE', 'Allow Out of Stock Purchases': 'TRUE', SKU: sku(m.id, 'HALF'), 'Product Label Enable': 'FALSE',
  });
  rows.push({ Handle: m.id, 'Option1 Value': 'Full Tray', 'Variant Price': money(m.priceFull), SKU: sku(m.id, 'FULL') });
}
// Event tiers: priced per guest (set the invoice quantity to the guest count)
for (const p of c.packages.filter((p) => p.kind === 'event-tier' && p.price != null)) {
  single(p.id, `${p.name} (per guest)`, html(p.summary, `Includes: ${p.inclusions.join('; ')}.`, `Minimum ${p.minGuests} guests. Set the quantity to the number of guests.`), p.price!, image(p.image));
}
// Setup add-on: one product with Small / Large starting prices
const s = c.rules.setupFee;
rows.push(
  { Handle: 'buffet-setup', Title: 'Buffet Setup', 'Body (HTML)': html('Buffet setup add-on. Starting prices; final pricing depends on buffet size.'), 'Included in Online Store': 'FALSE',
    'Option1 Name': 'Size', 'Option1 Value': 'Small Buffet', 'Variant Price': money(s.min), 'Track Inventory': 'FALSE', 'Allow Out of Stock Purchases': 'TRUE', SKU: 'BUFFET-SETUP-SMALL', 'Product Label Enable': 'FALSE' },
  { Handle: 'buffet-setup', 'Option1 Value': 'Large Buffet', 'Variant Price': money(s.max), SKU: 'BUFFET-SETUP-LARGE' },
);

const esc = (v = '') => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = [HEADER.join(','), ...rows.map((r) => HEADER.map((h) => esc(r[h])).join(','))].join('\r\n') + '\r\n';

const outDir = join(root, 'docs', 'ghl');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'ghl-products.csv'), csv);
const products = new Set(rows.map((r) => r.Handle)).size;
console.log(`${products} products, ${rows.length} rows (${HEADER.length} columns) → docs/ghl/ghl-products.csv`);
