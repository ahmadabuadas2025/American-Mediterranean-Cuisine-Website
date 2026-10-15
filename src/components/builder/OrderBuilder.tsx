import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog } from '../../lib/catalog-types';
import { evaluateOrder, formatDate, orderSchema, SERVICE_LABELS, type Evaluation } from '../../lib/order';
import { SERVICE_TYPES, type ServiceType } from '../../lib/schemas';
import { getSource } from '../../scripts/analytics';
import { clearDraft, emptyDraft, fieldId, loadDraft, saveDraft, uid, type Draft } from './state';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Summary from './Summary';

interface Props {
  catalog: Catalog;
  paymentsEnabled: boolean;
}

type Result = { id: string; path: Evaluation['path']; status: string; reasons: string[] };

const STEPS = [
  { n: 1, title: 'Choose your catering style and need', short: 'Choose' },
  { n: 2, title: 'Create your food package', short: 'Create' },
  { n: 3, title: 'Location, timing and contact', short: 'Deliver' },
] as const;

const KIND_TO_TYPE: Record<string, ServiceType> = { box: 'individual', family: 'family', 'tray-package': 'trays', 'event-tier': 'event' };
const track = (name: string, props: Record<string, string | number> = {}) => window.amcTrack?.(name, props);
const band = (n: number) => (n < 10 ? '1-9' : n < 25 ? '10-24' : n < 50 ? '25-49' : n < 100 ? '50-99' : '100+');

function step1Errors(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.serviceType) e.serviceType = 'Choose what you need.';
  if (!d.occasion) e.occasion = 'Choose an occasion.';
  if (!d.count || d.count < 1) e.count = 'Enter how many people you are feeding.';
  if (!d.date) e.date = 'Choose a date.';
  if (!d.timeWindow) e.timeWindow = 'Choose a time window.';
  return e;
}

function toPayload(d: Draft) {
  return {
    serviceType: d.serviceType,
    occasion: d.occasion,
    count: Number(d.count) || 0,
    date: d.date,
    timeWindow: d.timeWindow,
    fulfillment: d.fulfillment,
    serviceLevel: d.serviceLevel,
    lines: d.serviceType === 'event' ? [] : d.lines,
    event: d.event,
    contact: d.contact,
    address: d.address,
    accessNotes: d.accessNotes,
    dietaryNotes: d.dietaryNotes,
    instructions: d.instructions,
    consentService: d.consentService,
    consentMarketing: d.consentMarketing,
    source: getSource(),
    website: d.website,
  };
}

export default function OrderBuilder({ catalog: c, paymentsEnabled }: Props) {
  const [d, setD] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [preselect, setPreselect] = useState<{ packageId?: string }>({});
  const [showErrors, setShowErrors] = useState<Record<number, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  /* ---- restore saved order and apply deep links (?type=office, ?package=classic-box, ?item=hummus) */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const saved = loadDraft();
    let next = saved ?? emptyDraft();
    const typeParam = params.get('type') as ServiceType | null;
    const pkgParam = params.get('package');
    const itemParam = params.get('item');
    const pkg = pkgParam ? c.packages.find((p) => p.id === pkgParam) : undefined;
    const item = itemParam ? c.menu.find((m) => m.id === itemParam) : undefined;
    let wanted: ServiceType | undefined = typeParam && SERVICE_TYPES.includes(typeParam) ? typeParam : undefined;
    if (!wanted && pkg) wanted = KIND_TO_TYPE[pkg.kind];
    if (!wanted && item) wanted = 'trays';
    if (wanted && wanted !== next.serviceType) {
      // A deep link for a different service starts a fresh order.
      next = { ...emptyDraft(), serviceType: wanted, started: true };
    } else if (saved && (saved.started || saved.lines.length)) {
      setRestored(true);
    }
    if (pkg?.kind === 'event-tier') next = { ...next, event: { ...next.event, tierId: pkg.id } };
    if (pkg) setPreselect({ packageId: pkg.id });
    if (item && !next.lines.some((l) => l.kind === 'item' && l.itemId === item.id)) {
      const size = params.get('size') === 'full' ? 'full' : 'half';
      next = { ...next, lines: [...next.lines, { kind: 'item', uid: uid(), itemId: item.id, size, qty: 1 }] };
    }
    if (next.serviceType === 'event' && !next.occasion) next = { ...next, occasion: '' };
    setD(next);
    setReady(true);
    if (wanted) track('builder_started', { service_type: wanted });
  }, [c]);

  useEffect(() => { if (ready && !result) saveDraft(d); }, [d, ready, result]);

  /* ---- step abandonment */
  useEffect(() => {
    const onHide = () => { if (d.started && !result) track('builder_abandoned', { step: d.step, service_type: d.serviceType }); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [d.started, d.step, d.serviceType, result]);

  const set = useCallback((patch: Partial<Draft>) => {
    setD((prev) => ({ ...prev, ...patch, started: true }));
    setServerFieldErrors({});
  }, []);

  const ev = useMemo(
    () => evaluateOrder(c, { ...toPayload(d), serviceType: d.serviceType || 'individual' } as Parameters<typeof evaluateOrder>[1], { paymentsEnabled }),
    [c, d, paymentsEnabled],
  );

  const errorsFor = (step: number): Record<string, string> => {
    if (step === 1) return step1Errors(d);
    if (step === 2) return ev.errors;
    const parsed = orderSchema.safeParse(toPayload(d));
    const e: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) { const k = i.path.join('.'); if (!e[k] && !k.startsWith('lines') && k !== 'website') e[k] = i.message; }
    return { ...e, ...serverFieldErrors };
  };
  const errors = showErrors[d.step] ? errorsFor(d.step) : serverFieldErrors;

  /* ---- focus management: move focus to the new step heading */
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [d.step, result]);

  const goTo = (step: 1 | 2 | 3) => setD((prev) => ({ ...prev, step }));

  const next = () => {
    const e = errorsFor(d.step);
    if (Object.keys(e).length) {
      setShowErrors((s) => ({ ...s, [d.step]: true }));
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    track('builder_step_completed', { step: d.step, service_type: d.serviceType });
    if (d.step === 1 && !d.started) track('builder_started', { service_type: d.serviceType });
    setEditing(null);
    goTo((d.step + 1) as 2 | 3);
  };

  const submit = async () => {
    const e = { ...errorsFor(3), ...ev.errors };
    if (Object.keys(e).length) {
      setShowErrors((s) => ({ ...s, 3: true }));
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSubmitting(true);
    setServerError('');
    try {
      const res = await fetch('/api/submit-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toPayload(d)),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 422 && body.errors) {
        setServerFieldErrors(body.errors);
        setShowErrors((s) => ({ ...s, 3: true }));
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
      if (!res.ok || !body.id) throw new Error(body.message || 'We could not send your order.');
      track('inquiry_submitted', { path: body.path, service_type: d.serviceType, count_band: band(Number(d.count) || 0) });
      if (body.checkoutUrl) {
        track('checkout_started', { service_type: d.serviceType });
        clearDraft();
        location.href = body.checkoutUrl;
        return;
      }
      track('builder_completed', { path: body.path, service_type: d.serviceType });
      clearDraft();
      setResult({ id: body.id, path: body.path, status: body.status, reasons: body.reasons ?? [] });
    } catch (err) {
      setServerError(
        `${err instanceof Error ? err.message : 'Something went wrong.'} Your selections are saved on this device. Try again, or contact us and mention your order details.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = () => {
    clearDraft();
    setD({ ...emptyDraft() });
    setRestored(false);
    setResult(null);
    setShowErrors({});
    history.replaceState(null, '', location.pathname);
  };

  if (result) return <ResultView r={result} d={d} ev={ev} c={c} headingRef={headingRef} onNew={startOver} />;

  const errorEntries = Object.entries(errors);
  const current = STEPS[d.step - 1];
  const stepTitle = d.step === 2 && d.serviceType === 'event' ? 'Plan your event menu' : current.title;
  const submitLabel = ev.path === 'checkout' ? 'Continue to secure payment' : ev.path === 'conflict' ? 'Send request' : 'Send quote request';

  return (
    <div className="grid gap-10" aria-busy={!ready}>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <nav aria-label="Order progress">
        <ol className="grid grid-cols-3 gap-2">
          {STEPS.map((s) => {
            const state = s.n === d.step ? 'current' : s.n < d.step ? 'done' : 'todo';
            const inner = (
              <>
                <span className={`block h-1.5 rounded-full ${state === 'todo' ? 'bg-sand' : state === 'current' ? 'bg-terracotta' : 'bg-olive'}`} aria-hidden="true" />
                <span className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-xl italic text-terracotta" aria-hidden="true">0{s.n}</span>
                  <span className={`font-semibold ${state === 'todo' ? 'text-muted' : 'text-ink'}`}>{s.short}</span>
                </span>
                <span className="sr-only">: step {s.n} of 3, {s.title}{state === 'done' ? ', completed' : ''}</span>
              </>
            );
            return (
              <li key={s.n} aria-current={state === 'current' ? 'step' : undefined}>
                {state === 'done' ? (
                  <button type="button" className="block w-full min-h-11 text-left" onClick={() => goTo(s.n)}>{inner}</button>
                ) : (
                  <div className="min-h-11">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-olive-soft/60 p-4" role="status">
          <p className="font-semibold">We restored the order you started earlier.</p>
          <button type="button" className="btn btn-ghost min-h-11 px-4 text-sm" onClick={startOver}>Start over</button>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_25rem]">
        <section aria-labelledby="step-heading" className="min-w-0">
          <p className="text-sm font-semibold text-muted">Step {d.step} of 3</p>
          <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="h-md mt-1 scroll-mt-28 outline-none">{stepTitle}</h2>

          {errorEntries.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="mt-6 rounded-2xl border-[1.5px] border-[#8f2d14] bg-white p-5">
              <p className="font-bold text-[#8f2d14]">Please check {errorEntries.length === 1 ? 'one thing' : `${errorEntries.length} things`} before continuing:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {errorEntries.map(([k, msg]) => (
                  <li key={k}>
                    <a
                      href={`#${fieldId(k)}`}
                      className="underline underline-offset-2"
                      onClick={(e) => { e.preventDefault(); const el = document.getElementById(fieldId(k)); (el?.querySelector('input,select,textarea') as HTMLElement | null ?? el)?.focus(); }}
                    >
                      {msg}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            {d.step === 1 && <Step1 c={c} d={d} set={set} errors={errors} />}
            {d.step === 2 && (
              <Step2 c={c} d={d} set={set} errors={errors} ev={ev} editing={editing} setEditing={setEditing} preselect={preselect} announce={setAnnouncement} />
            )}
            {d.step === 3 && <Step3 c={c} d={d} set={set} errors={errors} ev={ev} />}
          </div>

          {d.step === 3 && (
            <div className="mt-10 rounded-2xl border-[1.5px] border-olive-mid bg-white p-5">
              <p className="font-bold">
                {ev.path === 'checkout'
                  ? 'Next: secure payment. Your order is confirmed once payment goes through.'
                  : 'Sending this is a request, not a confirmed order. We reply with an itemized quote or confirmation before you pay anything.'}
              </p>
              {ev.path !== 'checkout' && ev.reasons.length > 0 && (
                <details className="mt-2 text-sm text-muted">
                  <summary className="cursor-pointer font-semibold text-ink">Why is this a {ev.path === 'conflict' ? 'request' : 'quote'}?</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{ev.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </details>
              )}
            </div>
          )}

          {serverError && <p role="alert" className="mt-6 rounded-2xl border-[1.5px] border-[#8f2d14] bg-white p-4 font-semibold text-[#8f2d14]">{serverError}</p>}

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-sand pt-6">
            {d.step > 1 && (
              <button type="button" className="btn btn-ghost" onClick={() => goTo((d.step - 1) as 1 | 2)}>
                <span aria-hidden="true">←</span> Back
              </button>
            )}
            {d.step < 3 ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                Continue to {STEPS.find((s) => s.n === d.step + 1)?.short.toLowerCase()} <span aria-hidden="true">→</span>
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting} aria-disabled={submitting}>
                {submitting ? 'Sending…' : submitLabel}
              </button>
            )}
            <a href="/faq/" className="ml-auto text-sm font-semibold text-muted underline underline-offset-2">Ordering FAQ and policies</a>
          </div>
        </section>

        <div className="lg:sticky lg:top-[calc(var(--header-h)+1rem)]">
          <Summary c={c} d={d} ev={ev} set={set} onEdit={(id) => { setEditing(id); if (d.step !== 2) goTo(2); }} showPath={d.step >= 2} />
        </div>
      </div>
    </div>
  );
}

function ResultView({ r, d, ev, c, headingRef, onNew }: { r: Result; d: Draft; ev: Evaluation; c: Catalog; headingRef: React.RefObject<HTMLHeadingElement | null>; onNew: () => void }) {
  const windowLabel = c.rules.timeWindows.find((w) => w.start === d.timeWindow)?.label;
  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="result-heading">
      <p className="eyebrow">Request received</p>
      <h2 id="result-heading" ref={headingRef} tabIndex={-1} className="h-lg mt-4 outline-none">Thank you. <em>We have your request.</em></h2>
      <div className="market-label mt-8">
        <span className="unit">Inquiry number</span>
        <span className="price">{r.id}</span>
      </div>
      <p className="lede mt-6">
        This is <strong>not yet a confirmed order</strong>. We will check {r.path === 'conflict' ? 'your date and suggest options' : 'availability, delivery and pricing'}, then send an itemized {d.serviceType === 'event' ? 'event quote' : 'quote or confirmation'} to {d.contact.email}.
        {' '}A copy of your request is on its way to your inbox.
      </p>
      <dl className="card mt-8 grid gap-3 p-6">
        <div className="flex justify-between gap-4"><dt className="text-muted">Service</dt><dd className="font-semibold">{d.serviceType && SERVICE_LABELS[d.serviceType]}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted">Date</dt><dd className="text-right font-semibold">{d.date && formatDate(d.date)}{windowLabel ? `, ${windowLabel}` : ''}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted">Items</dt><dd className="text-right font-semibold">{ev.lines.map((l) => l.label).join(', ')}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted">Estimated food subtotal</dt><dd className="font-semibold">{ev.subtotal ? `$${ev.subtotal.toFixed(2)}` : 'Quoted'}</dd></div>
      </dl>
      <div className="mt-10 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={onNew}>Start a new order</button>
        <a href="/" className="btn btn-ghost">Back to home</a>
      </div>
    </section>
  );
}
