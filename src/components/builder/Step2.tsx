import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, MenuEntry, PackageEntry } from '../../lib/catalog-types';
import { itemsForSlot, KINDS_FOR, money, type Evaluation, type Line } from '../../lib/order';
import { ChoiceGroup, ErrorText, Stepper } from './fields';
import ItemDialog from './ItemDialog';
import { fieldId, uid, type Draft } from './state';

interface Props {
  c: Catalog;
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  errors: Record<string, string>;
  ev: Evaluation;
  editing: string | null;
  setEditing: (uid: string | null) => void;
  preselect: { packageId?: string };
  announce: (msg: string) => void;
}

const unitFor = (p: PackageEntry) => (p.priceUnit === 'box' ? 'box' : p.priceUnit === 'guest' ? 'guest' : 'package');
const priceShort = (p: PackageEntry) => (p.price == null ? 'Custom quote' : `${money(p.price)} / ${unitFor(p)}`);
const CATEGORY_LABEL: Record<string, string> = { mains: 'Mains', salads: 'Salads', dips: 'Dips and sauces', mezze: 'Mezze and appetizers', carbs: 'Carbs', sides: 'Sides' };

export default function Step2(props: Props) {
  const { d } = props;
  if (d.serviceType === 'event') return <EventStep {...props} />;
  return (
    <div className="grid gap-10">
      <PackageConfigurator {...props} />
      {d.serviceType === 'trays' && <TrayItems {...props} />}
      <ServingMeter {...props} />
      <ErrorText k="lines" error={props.errors.lines} />
      <ErrorText k="minimum" error={props.errors.minimum} />
    </div>
  );
}

/* ------------------------------------------------------- package lines */

function PackageConfigurator({ c, d, set, editing, setEditing, preselect, announce, errors }: Props) {
  const type = d.serviceType || 'individual';
  const packages = c.packages.filter((p) => KINDS_FOR[type].includes(p.kind));
  const editingLine = d.lines.find((l): l is Extract<Line, { kind: 'package' }> => l.uid === editing && l.kind === 'package');
  const configured = d.lines.reduce((n, l) => n + (l.kind === 'package' ? l.qty : 0), 0);
  const defaultQty = () => {
    if (type === 'office') return Math.max(1, (Number(d.count) || c.rules.minimums.officeMeals) - configured);
    if (type === 'individual') return Math.max(1, Math.min(9, (Number(d.count) || 1) - configured));
    return 1;
  };

  const initialPkg = (preselect.packageId && packages.some((p) => p.id === preselect.packageId) ? preselect.packageId : undefined)
    ?? packages.find((p) => p.featured)?.id ?? packages[0]?.id ?? '';
  const [pkgId, setPkgId] = useState(initialPkg);
  const [qty, setQty] = useState(defaultQty);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const firstSelect = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editingLine) {
      setPkgId(editingLine.packageId);
      setQty(editingLine.qty);
      setSel(editingLine.selections);
      setLocalErrors({});
      requestAnimationFrame(() => firstSelect.current?.focus());
    }
  }, [editing]);

  const pkg = packages.find((p) => p.id === pkgId);
  const isTrays = type === 'trays';

  const add = () => {
    if (!pkg || pkg.custom) return;
    const errs: Record<string, string> = {};
    for (const s of pkg.slots) {
      for (let i = 0; i < s.count; i++) if (!sel[s.key]?.[i]) errs[`cfg.${s.key}.${i}`] = `Choose ${s.label.toLowerCase()}${s.count > 1 ? ` ${i + 1}` : ''}.`;
    }
    setLocalErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) { document.getElementById(fieldId(first))?.focus(); return; }
    const selections = Object.fromEntries(pkg.slots.map((s) => [s.key, (sel[s.key] ?? []).slice(0, s.count)]));
    const line: Line = { kind: 'package', uid: editingLine?.uid ?? uid(), packageId: pkg.id, qty, selections };
    set({ lines: editingLine ? d.lines.map((l) => (l.uid === line.uid ? line : l)) : [...d.lines, line] });
    announce(`${editingLine ? 'Updated' : 'Added'} ${qty} × ${pkg.name} ${editingLine ? 'in' : 'to'} your order.`);
    setEditing(null);
    setSel({});
    setQty(type === 'office' ? Math.max(1, (Number(d.count) || 0) - configured - qty) : 1);
  };

  const heading = isTrays ? 'Start with a tray package' : type === 'family' ? 'Choose a family box' : 'Choose a box';
  return (
    <section aria-labelledby="pkg-heading" className="grid gap-6">
      <div>
        <h3 id="pkg-heading" className="h-sm">{editingLine ? `Edit ${pkg?.name ?? 'item'}` : heading}</h3>
        <p className="mt-1 text-muted">
          {isTrays ? 'Packages are the simplest way to order. You can also add individual trays below.'
            : type === 'office' ? 'Add boxes in groups: for example 6 chicken shawarma boxes and 4 falafel boxes.'
            : 'Pick the box, then choose what goes in it.'}
        </p>
      </div>

      <ChoiceGroup<string>
        k="cfg.package"
        legend={<span className="sr-only">Package</span>}
        value={pkgId}
        onChange={(v) => { setPkgId(v); setSel({}); setLocalErrors({}); window.amcTrack?.('package_selected', { package: v }); }}
        columns="sm:grid-cols-2 xl:grid-cols-3"
        options={packages.map((p) => ({
          value: p.id,
          label: p.name,
          aside: <span className="shrink-0 text-sm font-bold text-olive">{priceShort(p)}</span>,
          description: <>{p.summary}{p.serves && p.serves !== '1' ? <> <strong className="font-semibold">Serves {p.serves}.</strong></> : null}</>,
        }))}
      />

      {pkg && pkg.custom && (
        <p className="rounded-2xl border border-dashed border-olive-mid p-4 text-muted">
          Build your own: add half or full trays from the menu below. We confirm the final price, including delivery and any setup, before you pay.
        </p>
      )}

      {pkg && !pkg.custom && (
        <div className="card grid gap-5 p-5 md:p-6">
          {pkg.slots.length === 0 && (
            <p className="text-muted">Includes: {pkg.inclusions.join(', ')}.</p>
          )}
          {pkg.slots.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {pkg.slots.flatMap((s, si) =>
                Array.from({ length: s.count }).map((_, i) => {
                  const key = `cfg.${s.key}.${i}`;
                  const id = fieldId(key);
                  const options = itemsForSlot(c.menu, s);
                  return (
                    <div key={key}>
                      <label htmlFor={id} className="field-label">{s.label}{s.count > 1 ? ` ${i + 1}` : ''}</label>
                      <select
                        id={id}
                        ref={si === 0 && i === 0 ? firstSelect : undefined}
                        className="input"
                        value={sel[s.key]?.[i] ?? ''}
                        aria-invalid={localErrors[key] ? true : undefined}
                        aria-describedby={localErrors[key] ? `${id}-err` : undefined}
                        onChange={(e) => {
                          const arr = [...(sel[s.key] ?? [])];
                          arr[i] = e.target.value;
                          setSel({ ...sel, [s.key]: arr });
                        }}
                      >
                        <option value="">Choose…</option>
                        {options.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}{m.dietary.length ? ` (${m.dietary.join(', ')})` : ''}</option>
                        ))}
                      </select>
                      <ErrorText k={key} error={localErrors[key]} />
                    </div>
                  );
                }),
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-sand pt-5">
            <div className="flex items-center gap-3">
              <span className="font-semibold" id="qty-label">{pkg.kind === 'box' ? 'Boxes' : 'Quantity'}</span>
              <Stepper value={qty} min={1} max={500} onChange={setQty} label={`${pkg.name} quantity`} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {editingLine && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setSel({}); }}>Cancel</button>}
              <button type="button" className="btn btn-olive" onClick={add}>
                {editingLine ? 'Save changes' : `Add ${qty} to order`}{pkg.price != null && <span className="font-semibold opacity-80">· {money(pkg.price * qty)}</span>}
              </button>
            </div>
          </div>
        </div>
      )}
      {Object.entries(errors).filter(([k]) => k.startsWith('lines.')).map(([k, v]) => <p key={k} className="field-error" role="alert">{v}</p>)}
    </section>
  );
}

/* --------------------------------------------------------- custom trays */

function TrayItems({ c, d, set, announce }: Props) {
  const [open, setOpen] = useState<MenuEntry | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, MenuEntry[]>();
    c.menu.filter((m) => m.available).forEach((m) => g.set(m.category, [...(g.get(m.category) ?? []), m]));
    return [...g.entries()];
  }, [c.menu]);
  const inOrder = (id: string, size: 'half' | 'full') =>
    d.lines.reduce((n, l) => n + (l.kind === 'item' && l.itemId === id && l.size === size ? l.qty : 0), 0);

  const addItem = (m: MenuEntry, size: 'half' | 'full') => {
    const existing = d.lines.find((l) => l.kind === 'item' && l.itemId === m.id && l.size === size);
    const lines = existing
      ? d.lines.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l))
      : [...d.lines, { kind: 'item' as const, uid: uid(), itemId: m.id, size, qty: 1 }];
    set({ lines });
    announce(`Added a ${size} tray of ${m.name}. ${inOrder(m.id, size) + 1} in your order.`);
    window.amcTrack?.('menu_item_selected', { item: m.id, location: 'builder' });
  };

  return (
    <section aria-labelledby="trays-heading" className="grid gap-6">
      <div>
        <h3 id="trays-heading" className="h-sm">Or build your own trays</h3>
        <p className="mt-1 text-muted">Half trays serve about 5–6, full trays about 10–12. Custom tray orders are confirmed with an itemized quote.</p>
      </div>
      {groups.map(([cat, items]) => (
        <div key={cat}>
          <h4 className="font-display text-xl text-olive">{CATEGORY_LABEL[cat] ?? cat}</h4>
          <ul className="mt-3 divide-y divide-sand border-y border-sand">
            {items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="text-left font-semibold text-ink underline decoration-sand decoration-2 underline-offset-4 hover:decoration-olive"
                    onClick={(e) => { returnFocus.current = e.currentTarget; setOpen(m); }}
                    aria-haspopup="dialog"
                  >
                    {m.name}
                  </button>
                  {m.dietary.length > 0 && <span className="ml-2 text-xs font-bold text-olive-mid">{m.dietary.join(' · ')}</span>}
                  <p className="text-sm text-muted">Half {money(m.priceHalf)} · Full {money(m.priceFull)}</p>
                </div>
                <div className="flex gap-2">
                  {(['half', 'full'] as const).map((size) => {
                    const n = inOrder(m.id, size);
                    return (
                      <button key={size} type="button" className="btn btn-ghost min-h-11 px-3 text-sm" onClick={() => addItem(m, size)}>
                        + {size === 'half' ? 'Half' : 'Full'}{n > 0 && <span className="rounded-full bg-olive px-1.5 text-xs text-ivory">{n}</span>}
                        <span className="sr-only"> tray of {m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ItemDialog
        item={open}
        onClose={() => { setOpen(null); returnFocus.current?.focus(); }}
        onAdd={(size) => { if (open) addItem(open, size); }}
        dietaryProposed={c.settings.dietaryMarkersStatus !== 'approved'}
      />
    </section>
  );
}

/* ---------------------------------------------------------- servings */

function ServingMeter({ d, ev }: Props) {
  const people = Number(d.count) || 0;
  if (!people || !ev.lines.length) return null;
  if (d.serviceType === 'individual' || d.serviceType === 'office') {
    return (
      <p className="rounded-2xl bg-olive-soft/60 p-4 font-semibold text-ink" role="status">
        {ev.meals} of {people} {people === 1 ? 'meal' : 'meals'} added{ev.meals < people ? `. Add ${people - ev.meals} more to match your headcount.` : '.'}
      </p>
    );
  }
  const ratio = ev.servings / people;
  const note = ratio < 0.85 ? 'You may want more food for this group.' : ratio > 1.5 ? 'Plenty of food. Expect leftovers.' : 'That looks about right for your group.';
  return (
    <p className="rounded-2xl bg-olive-soft/60 p-4 text-ink" role="status">
      <strong>About {Math.round(ev.servings)} servings</strong> of mains and sides for {people} people. {note}
      <span className="block text-sm text-muted">Serving counts are estimates and depend on the menu mix and appetite.</span>
    </p>
  );
}

/* -------------------------------------------------------------- events */

function EventStep({ c, d, set, errors }: Props) {
  const tiers = c.packages.filter((p) => p.kind === 'event-tier');
  const guests = Number(d.count) || 0;
  const tier = tiers.find((t) => t.id === d.event.tierId);
  const setEvent = (patch: Partial<Draft['event']>) => set({ event: { ...d.event, ...patch } });

  return (
    <div className="grid gap-8">
      <label className="flex items-start gap-3 rounded-2xl border-[1.5px] border-sand bg-white p-4 has-[:checked]:border-olive">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--brand-olive)]" checked={d.event.consultOnly} onChange={(e) => setEvent({ consultOnly: e.target.checked })} />
        <span>
          <span className="font-bold">I would rather talk it through</span>
          <span className="block text-sm text-muted">Skip the menu and request a consultation. Good for weddings, venues with special rules or anything unusual.</span>
        </span>
      </label>

      {!d.event.consultOnly && (
        <>
          <ChoiceGroup<string>
            k="event.tierId"
            legend="Choose an event package"
            hint={`Per-guest prices for ${guests || 'your'} guests. Delivery, setup, staff, rentals and tax are quoted separately.`}
            value={d.event.tierId ?? ''}
            error={errors['event.tierId']}
            columns="sm:grid-cols-3"
            onChange={(v) => { setEvent({ tierId: v }); window.amcTrack?.('package_selected', { package: v }); }}
            options={tiers.map((t) => ({
              value: t.id,
              label: t.name,
              aside: <span className="shrink-0 text-sm font-bold text-olive">{priceShort(t)}</span>,
              description: (
                <>
                  {t.summary} <strong className="font-semibold">From {t.minGuests} guests.</strong>
                  {guests > 0 && t.minGuests && guests < t.minGuests && <span className="block font-semibold text-terracotta-deep">Needs {t.minGuests - guests} more guests.</span>}
                  {guests > 0 && t.price != null && (!t.minGuests || guests >= t.minGuests) && <span className="block font-semibold text-ink">About {money(t.price * guests)} for food</span>}
                </>
              ),
            }))}
          />

          {tier && tier.slots.length > 0 && (
            <fieldset className="card grid gap-4 p-5 md:p-6">
              <legend className="sr-only">Menu preferences</legend>
              <div>
                <p className="h-sm">Menu preferences</p>
                <p className="mt-1 text-sm text-muted">Optional. Tell us what you would like and we build the menu around it in your quote.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {tier.slots.flatMap((s) =>
                  Array.from({ length: s.count }).map((_, i) => {
                    const id = fieldId(`pref.${s.key}.${i}`);
                    return (
                      <div key={id}>
                        <label htmlFor={id} className="field-label">{s.label}{s.count > 1 ? ` ${i + 1}` : ''}</label>
                        <select
                          id={id}
                          className="input"
                          value={d.event.preferences[s.key]?.[i] ?? ''}
                          onChange={(e) => {
                            const arr = [...(d.event.preferences[s.key] ?? [])];
                            arr[i] = e.target.value;
                            setEvent({ preferences: { ...d.event.preferences, [s.key]: arr.filter((x, j) => x || j < arr.length) } });
                          }}
                        >
                          <option value="">No preference</option>
                          {itemsForSlot(c.menu, s).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    );
                  }),
                )}
              </div>
            </fieldset>
          )}
        </>
      )}

      <fieldset>
        <legend className="field-label">Add-ons to quote</legend>
        <p className="field-hint -mt-1 mb-3">Everything here is priced in your quote.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {c.rules.eventAddOns.map((a) => (
            <label key={a.key} className="flex min-h-14 items-start gap-3 rounded-2xl border-[1.5px] border-sand bg-white p-4 has-[:checked]:border-olive">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-[var(--brand-olive)]"
                checked={d.event.addOns.includes(a.key)}
                onChange={(e) => setEvent({ addOns: e.target.checked ? [...d.event.addOns, a.key] : d.event.addOns.filter((x) => x !== a.key) })}
              />
              <span><span className="font-semibold">{a.label}</span><span className="block text-sm text-muted">{a.note}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
