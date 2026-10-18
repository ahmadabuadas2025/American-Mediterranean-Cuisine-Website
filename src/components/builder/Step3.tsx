import type { Catalog } from '../../lib/catalog-types';
import type { Evaluation } from '../../lib/order';
import { isSet } from '../../lib/schemas';
import { aria, ChoiceGroup, Field } from './fields';
import type { Draft } from './state';

interface Props {
  c: Catalog;
  d: Draft;
  set: (patch: Partial<Draft>) => void;
  errors: Record<string, string>;
  ev: Evaluation;
}

export default function Step3({ c, d, set, errors }: Props) {
  const contact = (patch: Partial<Draft['contact']>) => set({ contact: { ...d.contact, ...patch } });
  const address = (patch: Partial<Draft['address']>) => set({ address: { ...d.address, ...patch } });

  return (
    <div className="grid gap-10">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="h-sm mb-4">Your details</legend>
        <Field k="contact.name" label="Full name" required error={errors['contact.name']}>
          <input className="input" autoComplete="name" value={d.contact.name} onChange={(e) => contact({ name: e.target.value })} {...aria('contact.name', errors['contact.name'])} />
        </Field>
        <Field k="contact.company" label="Company or organization" hint="Optional">
          <input className="input" autoComplete="organization" value={d.contact.company} onChange={(e) => contact({ company: e.target.value })} {...aria('contact.company', undefined, true)} />
        </Field>
        <Field k="contact.email" label="Email" required error={errors['contact.email']}>
          <input className="input" type="email" autoComplete="email" value={d.contact.email} onChange={(e) => contact({ email: e.target.value })} {...aria('contact.email', errors['contact.email'])} />
        </Field>
        <Field k="contact.phone" label="Phone" required error={errors['contact.phone']} hint="US number, e.g. (813) 555-0100. The +1 is optional.">
          <input className="input" type="tel" autoComplete="tel" value={d.contact.phone} onChange={(e) => contact({ phone: e.target.value })} {...aria('contact.phone', errors['contact.phone'], true)} />
        </Field>
        <div className="sm:col-span-2">
          <ChoiceGroup<'email' | 'phone' | 'text'>
            k="contact.preference"
            legend="How should we contact you?"
            value={d.contact.preference}
            columns="grid-cols-3"
            onChange={(v) => contact({ preference: v })}
            options={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone call' }, { value: 'text', label: 'Text' }]}
          />
        </div>
      </fieldset>

      {d.fulfillment === 'delivery' ? (
        <fieldset className="grid gap-5 sm:grid-cols-6">
          <legend className="h-sm mb-4">Delivery address</legend>
          <Field k="address.street" label="Street address" required error={errors['address.street']} className="sm:col-span-4">
            <input className="input" autoComplete="address-line1" value={d.address.street} onChange={(e) => address({ street: e.target.value })} {...aria('address.street', errors['address.street'])} />
          </Field>
          <Field k="address.unit" label="Suite, floor or unit" className="sm:col-span-2">
            <input className="input" autoComplete="address-line2" value={d.address.unit} onChange={(e) => address({ unit: e.target.value })} {...aria('address.unit')} />
          </Field>
          <Field k="address.city" label="City" required error={errors['address.city']} className="sm:col-span-4">
            <input className="input" autoComplete="address-level2" value={d.address.city} onChange={(e) => address({ city: e.target.value })} {...aria('address.city', errors['address.city'])} />
          </Field>
          <Field k="address.zip" label="ZIP code" required error={errors['address.zip']} className="sm:col-span-2">
            <input className="input" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={d.address.zip} onChange={(e) => address({ zip: e.target.value.replace(/\D/g, '') })} {...aria('address.zip', errors['address.zip'])} />
          </Field>
          <Field k="accessNotes" label="Access notes" hint="Gate codes, loading dock, parking, floor or who to ask for" className="sm:col-span-6">
            <textarea className="input" rows={3} value={d.accessNotes} onChange={(e) => set({ accessNotes: e.target.value })} {...aria('accessNotes', undefined, true)} />
          </Field>
        </fieldset>
      ) : (
        <div className="rounded-2xl bg-olive-soft/60 p-5">
          <p className="h-sm">Pickup</p>
          <p className="mt-1 text-ink">{isSet(c.settings.pickup.address) ? c.settings.pickup.address : 'We confirm the pickup location with your order.'}</p>
          <p className="text-sm text-muted">{c.settings.pickup.instructions}</p>
        </div>
      )}

      <fieldset className="grid gap-5">
        <legend className="h-sm mb-4">Food notes</legend>
        <Field
          k="dietaryNotes"
          label="Dietary needs or allergies"
          hint="Tell us about any allergies, and how many people they affect. We reply before preparing your order if anything needs a conversation."
        >
          <textarea className="input" rows={3} value={d.dietaryNotes} onChange={(e) => set({ dietaryNotes: e.target.value })} {...aria('dietaryNotes', undefined, true)} />
        </Field>
        <Field k="instructions" label="Anything else?" hint="Labels by name, serving times, setup preferences">
          <textarea className="input" rows={3} value={d.instructions} onChange={(e) => set({ instructions: e.target.value })} {...aria('instructions', undefined, true)} />
        </Field>
        <p className="text-sm text-muted">{c.settings.dietaryDisclaimer}</p>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="sr-only">Consent</legend>
        <div>
          <label className="flex items-start gap-3">
            <input
              id="f-consentService"
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[var(--brand-olive)]"
              checked={d.consentService}
              onChange={(e) => set({ consentService: e.target.checked })}
              aria-invalid={errors.consentService ? true : undefined}
              aria-describedby={errors.consentService ? 'f-consentService-err' : undefined}
            />
            <span>I agree to be contacted by email, phone or text about this order. <span aria-hidden="true">*</span> <a href="/privacy/" className="underline underline-offset-2">Privacy policy</a>, <a href="/terms/" className="underline underline-offset-2">terms</a> and <a href="/faq/#policies" className="underline underline-offset-2">ordering policies</a>.</span>
          </label>
          {errors.consentService && <p id="f-consentService-err" className="field-error">{errors.consentService}</p>}
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--brand-olive)]" checked={d.consentMarketing} onChange={(e) => set({ consentMarketing: e.target.checked })} />
          <span>Also send me occasional menus and offers. <span className="text-muted">(Optional)</span></span>
        </label>
      </fieldset>

      {/* Honeypot: hidden from people, tempting to bots */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input id="f-website" tabIndex={-1} autoComplete="off" value={d.website} onChange={(e) => set({ website: e.target.value })} />
      </div>
    </div>
  );
}
