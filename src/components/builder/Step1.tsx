import type { Catalog } from '../../lib/catalog-types';
import { countLabel, dateStatus, KINDS_FOR, formatDate, leadTimeLabel, SERVICE_LABELS, suggestDates, todayIn } from '../../lib/order';
import type { ServiceType } from '../../lib/schemas';
import { aria, ChoiceGroup, Field } from './fields';
import type { Draft } from './state';

interface Props {
  c: Catalog;
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  errors: Record<string, string>;
}

const SERVICE_HELP: Record<ServiceType, string> = {
  individual: 'One or a few labeled boxes',
  office: 'Labeled boxes for a team or meeting',
  family: 'Shared boxes sized for 3–5 people',
  trays: 'Half and full trays, buffet-style',
  event: 'Buffets for 20+ guests, with optional setup',
};

export default function Step1({ c, d, set, errors }: Props) {
  const type = d.serviceType || 'individual';
  const minDate = todayIn(c.rules.timezone);
  const check = d.date && d.timeWindow ? dateStatus(c, type, d.date, d.timeWindow) : null;
  const conflict = check && ['blackout', 'booked', 'closed', 'past', 'too-soon'].includes(check.status);
  const alternatives = conflict || check?.status === 'rush' ? suggestDates(c, type, d.timeWindow || c.rules.timeWindows[0].start) : [];
  const unit = d.serviceType ? countLabel(d.serviceType) : 'people';
  const minCountHint =
    d.serviceType === 'office' ? `Office delivery starts at ${c.rules.minimums.officeMeals} meals or $${c.rules.minimums.officeSubtotal} in food.`
    : d.serviceType === 'event' ? `Event packages start at ${Math.min(...c.packages.filter((p) => p.kind === 'event-tier').map((p) => p.minGuests ?? 0))} guests.`
    : d.serviceType === 'family' ? 'Each family box serves 3–5 people.'
    : undefined;

  return (
    <div className="grid gap-8">
      <ChoiceGroup<ServiceType>
        k="serviceType"
        legend="What do you need?"
        value={d.serviceType}
        error={errors.serviceType}
        columns="sm:grid-cols-2 xl:grid-cols-3"
        onChange={(v) => {
          const patch: Partial<Draft> = { serviceType: v, started: true };
          // Lines belong to a service type; switching type keeps only the ones that still fit.
          patch.lines = d.lines.filter((l) =>
            l.kind === 'item' ? v === 'trays' : KINDS_FOR[v].includes(c.packages.find((p) => p.id === l.packageId)?.kind ?? 'box') && (v !== 'event'),
          );
          set(patch);
          window.amcTrack?.('service_card_selected', { service_type: v, location: 'builder' });
        }}
        options={(Object.keys(SERVICE_LABELS) as ServiceType[]).map((t) => ({
          value: t,
          label: SERVICE_LABELS[t],
          description: `${SERVICE_HELP[t]}. Order ${t === 'event' ? '7–14 days' : leadTimeLabel(c.rules.leadTimeHours[t])} ahead.`,
        }))}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <Field k="occasion" label="Occasion" required error={errors.occasion}>
          <select className="input" value={d.occasion} onChange={(e) => set({ occasion: e.target.value })} {...aria('occasion', errors.occasion)}>
            <option value="">Choose an occasion</option>
            {c.rules.occasions.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field k="count" label={`How many ${unit}?`} required error={errors.count} hint={minCountHint}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="input"
            value={d.count}
            onChange={(e) => set({ count: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0) })}
            {...aria('count', errors.count, !!minCountHint)}
          />
        </Field>
        <Field k="date" label="Date" required error={errors.date}>
          <input type="date" className="input" min={minDate} value={d.date} onChange={(e) => set({ date: e.target.value })} {...aria('date', errors.date)} />
        </Field>
        <Field k="timeWindow" label={d.fulfillment === 'pickup' ? 'Pickup window' : 'Delivery window'} required error={errors.timeWindow}>
          <select className="input" value={d.timeWindow} onChange={(e) => set({ timeWindow: e.target.value })} {...aria('timeWindow', errors.timeWindow)}>
            <option value="">Choose a time</option>
            {c.rules.timeWindows.map((w) => <option key={w.start} value={w.start}>{w.label}</option>)}
          </select>
        </Field>
      </div>

      {check && check.status !== 'ok' && (
        <div
          role={conflict ? 'alert' : 'status'}
          className={`rounded-2xl border-[1.5px] p-5 ${conflict ? 'border-terracotta bg-terracotta-soft/60' : 'border-olive-mid bg-olive-soft/50'}`}
        >
          <p className="font-bold text-ink">{conflict ? 'That date does not work' : 'Short notice'}</p>
          <p className="mt-1 text-ink">{check.message}</p>
          {conflict && <p className="mt-1 text-sm text-muted">You can still send a request and we will suggest options, but we cannot take payment for this date.</p>}
          {alternatives.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold">Dates with standard notice:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {alternatives.map((alt) => (
                  <button key={alt} type="button" className="btn btn-ghost min-h-11 px-4 text-sm" onClick={() => set({ date: alt })}>
                    {formatDate(alt)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-sm"><a href="/contact/" className="underline underline-offset-2">Or contact us about your date</a></p>
        </div>
      )}

      <ChoiceGroup<'delivery' | 'pickup'>
        k="fulfillment"
        legend="Delivery or pickup?"
        value={d.fulfillment}
        onChange={(v) => set({ fulfillment: v })}
        options={[
          { value: 'delivery', label: 'Delivery', description: 'Priced by zone; you see the fee before you pay.' },
          ...(c.settings.pickup.enabled ? [{ value: 'pickup' as const, label: 'Pickup', description: c.settings.pickup.instructions }] : []),
        ]}
      />

      <ChoiceGroup<'drop-off' | 'setup' | 'full-service'>
        k="serviceLevel"
        legend="Service level"
        value={d.serviceLevel}
        onChange={(v) => set({ serviceLevel: v })}
        columns="sm:grid-cols-3"
        options={[
          { value: 'drop-off', label: 'Drop-off', description: 'Delivered, labeled and ready to serve.' },
          { value: 'setup', label: 'Drop-off and setup', description: `We arrange the buffet. Usually $${c.rules.setupFee.min}–$${c.rules.setupFee.max}+, quoted.` },
          { value: 'full-service', label: 'Full service', description: 'Setup plus staff. Quoted by role and shift.' },
        ]}
      />
    </div>
  );
}
