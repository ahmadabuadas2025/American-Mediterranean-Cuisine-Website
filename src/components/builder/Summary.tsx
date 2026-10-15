import type { Catalog } from '../../lib/catalog-types';
import { formatDate, money, SERVICE_LABELS, type Evaluation } from '../../lib/order';
import { Stepper, useCountUp } from './fields';
import type { Draft } from './state';

interface Props {
  c: Catalog;
  d: Draft;
  ev: Evaluation;
  set: (patch: Partial<Draft>) => void;
  onEdit: (uid: string) => void;
  showPath: boolean;
}

/** The order ticket: itemized lines and a running subtotal. Fees and tax appear only once known. */
export default function Summary({ c, d, ev, set, onEdit, showPath }: Props) {
  const subtotal = useCountUp(ev.subtotal);
  const windowLabel = c.rules.timeWindows.find((w) => w.start === d.timeWindow)?.label;
  const editable = d.serviceType !== 'event';

  const changeQty = (uid: string, qty: number) =>
    set({ lines: qty <= 0 ? d.lines.filter((l) => l.uid !== uid) : d.lines.map((l) => (l.uid === uid ? { ...l, qty } : l)) });

  return (
    <aside className="ticket card overflow-hidden" aria-labelledby="ticket-title">
      <div className="border-b border-dashed border-sand bg-olive px-5 py-4 text-ivory on-dark">
        <h2 id="ticket-title" className="font-display text-2xl text-ivory">Your order</h2>
        <p className="text-sm text-olive-soft">
          {d.serviceType ? SERVICE_LABELS[d.serviceType] : 'Choose what you need to start'}
          {d.count ? `, ${d.count} ${d.serviceType === 'event' ? 'guests' : d.serviceType === 'office' || d.serviceType === 'individual' ? 'meals' : 'people'}` : ''}
        </p>
        {d.date && <p className="text-sm text-olive-soft">{formatDate(d.date)}{windowLabel ? `, ${windowLabel}` : ''}</p>}
      </div>

      <div className="px-5 py-4">
        {ev.lines.length === 0 ? (
          <p className="py-4 text-muted">Nothing added yet. Your items and running total appear here.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-sand">
            {ev.lines.map((l) => {
              const line = d.lines.find((x) => x.uid === l.uid);
              return (
                <li key={l.uid} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{line ? `${l.qty} × ` : ''}{l.label}</p>
                      {l.detail && <p className="text-sm text-muted">{l.detail}</p>}
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{l.total == null ? 'Quoted' : money(l.total)}</p>
                  </div>
                  {editable && line && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Stepper value={line.qty} min={0} max={500} onChange={(n) => changeQty(l.uid, n)} label={`${l.label} quantity`} />
                      {line.kind === 'package' && c.packages.find((p) => p.id === line.packageId)?.slots.length ? (
                        <button type="button" className="min-h-11 px-2 text-sm font-semibold text-terracotta-deep underline underline-offset-2" onClick={() => onEdit(l.uid)}>
                          Edit<span className="sr-only"> {l.label}</span>
                        </button>
                      ) : null}
                      <button type="button" className="min-h-11 px-2 text-sm font-semibold text-muted underline underline-offset-2" onClick={() => changeQty(l.uid, 0)}>
                        Remove<span className="sr-only"> {l.label}</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <dl className="grid gap-1.5 border-t border-dashed border-sand px-5 py-4" aria-live="polite" aria-atomic="true">
        <div className="flex justify-between gap-4">
          <dt className="font-semibold">Food subtotal{ev.hasQuotedLines ? ' (priced items)' : ''}</dt>
          <dd className="font-display text-2xl tabular-nums text-olive">
            <span aria-hidden="true">{money(Math.round(subtotal * 100) / 100)}</span>
            <span className="sr-only">{money(ev.subtotal)}</span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 text-sm">
          <dt>Delivery</dt>
          <dd>{d.fulfillment === 'pickup' ? 'Pickup' : ev.deliveryFee == null ? 'Confirmed with your quote' : money(ev.deliveryFee)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-sm">
          <dt>Tax</dt>
          <dd>{ev.tax == null ? 'Calculated on confirmation' : money(ev.tax)}</dd>
        </div>
        {d.serviceLevel !== 'drop-off' && (
          <div className="flex justify-between gap-4 text-sm">
            <dt>{d.serviceLevel === 'setup' ? 'Setup' : 'Setup and staff'}</dt>
            <dd>Quoted</dd>
          </div>
        )}
        <div className="mt-2 flex justify-between gap-4 border-t border-sand pt-2">
          <dt className="font-bold">Total</dt>
          <dd className="font-bold">{ev.total == null ? 'Confirmed before you pay' : money(ev.total)}</dd>
        </div>
      </dl>

      {c.settings.showPricingNotice && <p className="px-5 pb-3 text-xs font-semibold text-muted">{c.settings.pricingNotice}</p>}

      {showPath && ev.lines.length > 0 && (
        <div className="border-t border-dashed border-sand bg-paper px-5 py-4">
          <p className="font-bold text-ink">
            {ev.path === 'checkout' ? 'Ready for online checkout' : ev.path === 'conflict' ? 'This will be a request, not a booking' : 'This will be a quote request'}
          </p>
          {ev.path !== 'checkout' && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {ev.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
