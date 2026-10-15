import type { Line } from '../../lib/order';
import type { ServiceType } from '../../lib/schemas';

export const STORAGE_KEY = 'amc-builder-v1';

export interface Draft {
  v: 1;
  step: 1 | 2 | 3;
  serviceType: ServiceType | '';
  occasion: string;
  count: number | '';
  date: string;
  timeWindow: string;
  fulfillment: 'delivery' | 'pickup';
  serviceLevel: 'drop-off' | 'setup' | 'full-service';
  lines: Line[];
  event: { tierId?: string; consultOnly: boolean; addOns: string[]; preferences: Record<string, string[]> };
  contact: { name: string; email: string; phone: string; preference: 'email' | 'phone' | 'text'; company: string };
  address: { street: string; unit: string; city: string; zip: string };
  accessNotes: string;
  dietaryNotes: string;
  instructions: string;
  consentService: boolean;
  consentMarketing: boolean;
  website: string;
  started: boolean;
}

export const emptyDraft = (): Draft => ({
  v: 1,
  step: 1,
  serviceType: '',
  occasion: '',
  count: '',
  date: '',
  timeWindow: '',
  fulfillment: 'delivery',
  serviceLevel: 'drop-off',
  lines: [],
  event: { consultOnly: false, addOns: [], preferences: {} },
  contact: { name: '', email: '', phone: '', preference: 'email', company: '' },
  address: { street: '', unit: '', city: '', zip: '' },
  accessNotes: '',
  dietaryNotes: '',
  instructions: '',
  consentService: false,
  consentMarketing: false,
  website: '',
  started: false,
});

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d?.v === 1 ? { ...emptyDraft(), ...d } : null;
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* storage unavailable: the builder still works */ }
}

export function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Turns a zod-style issue path into the DOM id of the field it belongs to. */
export const fieldId = (key: string) => `f-${key.replace(/[^\w-]+/g, '-')}`;
