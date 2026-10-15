import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fieldId } from './state';

/** aria wiring for an input bound to an error key */
export function aria(key: string, error?: string, hint?: boolean) {
  const id = fieldId(key);
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as const;
}

interface FieldProps {
  k: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ k, label, error, hint, required, className, children }: FieldProps) {
  const id = fieldId(k);
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="field-hint mt-1">{hint}</p>}
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </div>
  );
}

export function ErrorText({ k, error }: { k: string; error?: string }) {
  return error ? <p id={`${fieldId(k)}-err`} className="field-error">{error}</p> : null;
}

/** Choice cards rendered as a radio group (keyboard: arrows move, space selects). */
export function ChoiceGroup<T extends string>({
  k, legend, value, options, onChange, error, columns = 'sm:grid-cols-2', hint,
}: {
  k: string;
  legend: ReactNode;
  value: T | '';
  options: { value: T; label: string; description?: ReactNode; aside?: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  error?: string;
  columns?: string;
  hint?: ReactNode;
}) {
  const id = fieldId(k);
  return (
    <fieldset id={id} tabIndex={-1} aria-describedby={[hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined}>
      <legend className="field-label">{legend}</legend>
      {hint && <p id={`${id}-hint`} className="field-hint -mt-1 mb-3">{hint}</p>}
      <div className={`grid gap-3 ${columns}`}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`choice relative flex min-h-16 cursor-pointer gap-3 rounded-2xl border-[1.5px] bg-white p-4 transition-colors ${
              value === o.value ? 'border-olive bg-olive-soft/50' : 'border-sand hover:border-olive-mid'
            } ${o.disabled ? 'cursor-not-allowed opacity-60' : ''} has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--brand-focus)]`}
          >
            <input
              type="radio"
              name={k}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="mt-1 size-5 shrink-0 accent-[var(--brand-olive)]"
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="flex items-start justify-between gap-3">
                <span className="font-bold text-ink">{o.label}</span>
                {o.aside}
              </span>
              {o.description && <span className="text-sm text-muted">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && <p id={`${id}-err`} className="field-error">{error}</p>}
    </fieldset>
  );
}

export function Stepper({ value, min = 0, max = 500, onChange, label }: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border-[1.5px] border-sand bg-white" role="group" aria-label={label}>
      <button type="button" className="grid size-11 place-items-center rounded-full text-xl font-bold text-olive disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label}`}>−</button>
      <input
        type="number"
        inputMode="numeric"
        className="w-14 bg-transparent text-center font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
      <button type="button" className="grid size-11 place-items-center rounded-full text-xl font-bold text-olive disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates a number toward its target (count-up totals). */
export function useCountUp(target: number, duration = 450) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reducedMotion()) { setShown(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, duration]);
  return shown;
}
