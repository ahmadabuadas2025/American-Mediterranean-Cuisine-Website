import { useMemo, useState } from 'react';
import type { MenuEntry } from '../lib/catalog-types';

interface Props {
  items: MenuEntry[];
  dietaryProposed: boolean;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mains', label: 'Mains' },
  { key: 'salads', label: 'Salads' },
  { key: 'dips', label: 'Dips' },
  { key: 'mezze', label: 'Mezze' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'sides', label: 'Sides' },
];
const DIET = [
  { key: 'V', label: 'Vegetarian' },
  { key: 'VG', label: 'Vegan' },
  { key: 'GF-friendly', label: 'Gluten-friendly' },
];
const money = (n: number) => `$${n}`;
const track = (name: string, props: Record<string, string>) => window.amcTrack?.(name, props);

/**
 * Searchable, filterable menu. Rendered on the server too, so every dish and
 * price is plain HTML before JavaScript loads.
 */
export default function MenuBrowser({ items, dietaryProposed }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [diet, setDiet] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (m) =>
        (category === 'all' || m.category === category) &&
        diet.every((d) => m.dietary.includes(d as MenuEntry['dietary'][number])) &&
        (!q || `${m.name} ${m.description}`.toLowerCase().includes(q)),
    );
  }, [items, query, category, diet]);

  const toggleDiet = (k: string) => setDiet((d) => (d.includes(k) ? d.filter((x) => x !== k) : [...d, k]));

  return (
    <div>
      <div className="card flex flex-col gap-5 p-5 md:p-6" role="search" aria-label="Filter the menu">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label htmlFor="menu-search" className="field-label">Search dishes</label>
            <input
              id="menu-search"
              type="search"
              className="input"
              placeholder="Try hummus, chicken or kale"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <fieldset>
            <legend className="field-label">Dietary</legend>
            <div className="flex flex-wrap gap-2">
              {DIET.map((d) => (
                <label key={d.key} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-sand bg-white px-4 has-[:checked]:border-olive has-[:checked]:bg-olive-soft">
                  <input type="checkbox" className="size-4 accent-[var(--brand-olive)]" checked={diet.includes(d.key)} onChange={() => toggleDiet(d.key)} />
                  <span className="text-sm font-semibold">{d.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <fieldset>
          <legend className="sr-only">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-olive-mid px-4 text-sm font-bold text-olive has-[:checked]:bg-olive has-[:checked]:text-ivory has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--brand-focus)]">
                <input
                  type="radio"
                  name="menu-category"
                  className="sr-only"
                  checked={category === c.key}
                  onChange={() => { setCategory(c.key); track('menu_category_selected', { category: c.key }); }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        {dietaryProposed && (
          <p className="text-sm text-muted">Dietary markers with a dashed outline are proposed and still being checked by our kitchen.</p>
        )}
      </div>

      <p className="mt-6 text-sm font-semibold text-muted" aria-live="polite">
        Showing {filtered.length} of {items.length} dishes
      </p>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-card)] border border-dashed border-olive-mid p-8">
          <p className="font-display text-2xl text-olive">No dishes match those filters.</p>
          <button type="button" className="link-arrow mt-2" onClick={() => { setQuery(''); setCategory('all'); setDiet([]); }}>
            <span className="label">Clear all filters</span><span className="arrow" aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <li key={m.id} className="card flex flex-col p-6">
              <p className="text-sm font-semibold capitalize text-muted">{m.category}</p>
              <h2 className="h-sm mt-1">{m.name}</h2>
              <p className="mt-2 flex-1 text-muted">{m.description}</p>
              {m.allergenNote && <p className="mt-2 text-sm text-muted">{m.allergenNote}</p>}
              {m.dietary.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Dietary markers">
                  {m.dietary.map((t) => (
                    <li key={t} className={`badge ${dietaryProposed ? 'badge-proposed' : ''}`}>
                      {t}<span className="sr-only">{dietaryProposed ? ' (proposed)' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="mt-5 grid grid-cols-2 gap-2 border-t border-sand pt-4">
                <div>
                  <dt className="text-xs font-semibold text-muted">Half tray, serves {m.servesHalf}</dt>
                  <dd className="font-display text-2xl text-olive">{money(m.priceHalf)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted">Full tray, serves {m.servesFull}</dt>
                  <dd className="font-display text-2xl text-olive">{money(m.priceFull)}</dd>
                </div>
              </dl>
              <a
                href={`/order/?type=trays&item=${m.id}`}
                className="link-arrow mt-3"
                onClick={() => track('menu_item_selected', { item: m.id })}
              >
                <span className="label">Add to a tray order</span><span className="sr-only">: {m.name}</span><span className="arrow" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
