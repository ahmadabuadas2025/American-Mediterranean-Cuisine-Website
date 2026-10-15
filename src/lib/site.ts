/** Build-time access to the content singletons and collections, validated with the shared schemas. */
import { getCollection } from 'astro:content';
import bannersJson from '../content/banners.json';
import calendarJson from '../content/calendar.json';
import galleryJson from '../content/gallery.json';
import rulesJson from '../content/rules.json';
import settingsJson from '../content/settings.json';
import zonesJson from '../content/zones.json';
import type { Catalog } from './catalog-types';
import {
  bannersSchema, calendarSchema, gallerySchema, rulesSchema, settingsSchema, zonesSchema,
} from './schemas';

export const settings = settingsSchema.parse(settingsJson);
export const rules = rulesSchema.parse(rulesJson);
export const zones = zonesSchema.parse(zonesJson);
export const calendar = calendarSchema.parse(calendarJson);
export const gallery = gallerySchema.parse(galleryJson);
export const banners = bannersSchema.parse(bannersJson);

/** Server-only flag read at build time; the checkout function re-checks it at request time. */
export const paymentsEnabled = (import.meta.env.PAYMENTS_ENABLED ?? process.env.PAYMENTS_ENABLED) === 'true';

const bySort = <T extends { data: { sortOrder: number } }>(a: T, b: T) => a.data.sortOrder - b.data.sortOrder;

export async function getMenu() {
  return (await getCollection('menu')).filter((m) => m.data.available).sort(bySort);
}
export async function getPackages() {
  return (await getCollection('packages')).filter((p) => p.data.available).sort(bySort);
}
export async function getFaq() {
  return (await getCollection('faq')).sort(bySort);
}

export async function getCatalog(): Promise<Catalog> {
  const [menu, packages] = await Promise.all([getMenu(), getPackages()]);
  return {
    menu: menu.map((m) => ({ id: m.id, ...m.data })),
    packages: packages.map((p) => ({ id: p.id, ...p.data })),
    rules, zones, calendar, settings,
  };
}

/** Replaces {path.to.value} tokens in FAQ text with values from rules.json, so numbers live in one place. */
export function fillRules(text: string) {
  return text.replace(/\{([\w.]+)\}/g, (whole, path: string) => {
    const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], rules);
    return typeof v === 'number' || typeof v === 'string' ? String(v) : whole;
  });
}

export const priceText = (price: number | null, unit: string) => {
  if (price == null) return 'Custom quote';
  const p = price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: price % 1 ? 2 : 0 });
  return unit === 'guest' ? `${p} per guest` : unit === 'box' ? `${p} per box` : p;
};
