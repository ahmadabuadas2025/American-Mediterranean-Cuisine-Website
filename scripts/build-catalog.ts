/**
 * Validates every content file against the shared Zod schemas and writes a
 * compact catalog for the Netlify Functions, so server-side pricing reads the
 * same prices the pages show. Runs before `astro dev` and `astro build`.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  calendarSchema, menuItemSchema, packageSchema, rulesSchema, settingsSchema, zonesSchema,
} from '../src/lib/schemas';
import type { Catalog } from '../src/lib/catalog-types';

const root = join(import.meta.dirname, '..', 'src', 'content');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function folder<T extends { sortOrder: number }>(dir: string, schema: { parse: (v: unknown) => T }) {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return { id: basename(f, '.json'), ...schema.parse(readJson(join(root, dir, f))) };
      } catch (err) {
        throw new Error(`Invalid content in ${dir}/${f}:\n${err}`);
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

const catalog: Catalog = {
  menu: folder('menu', menuItemSchema),
  packages: folder('packages', packageSchema),
  rules: rulesSchema.parse(readJson(join(root, 'rules.json'))),
  zones: zonesSchema.parse(readJson(join(root, 'zones.json'))),
  calendar: calendarSchema.parse(readJson(join(root, 'calendar.json'))),
  settings: settingsSchema.parse(readJson(join(root, 'settings.json'))),
};

const out = join(import.meta.dirname, '..', 'src', 'generated');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'catalog.json'), JSON.stringify(catalog));
console.log(`catalog: ${catalog.menu.length} menu items, ${catalog.packages.length} packages`);
