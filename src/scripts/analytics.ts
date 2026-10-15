/**
 * Analytics wrapper. The provider is chosen by env var (Plausible or GA4) and
 * nothing loads until the visitor accepts. Only whitelisted, non-personal
 * properties are ever sent: no names, contact details, addresses or dietary notes.
 */
type Props = Record<string, string | number | boolean | undefined>;

const PROVIDER = (import.meta.env.PUBLIC_ANALYTICS_PROVIDER ?? '').toLowerCase() as '' | 'plausible' | 'ga4';
const PLAUSIBLE_DOMAIN = import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN ?? '';
const GA4_ID = import.meta.env.PUBLIC_GA4_ID ?? '';
const CONSENT_KEY = 'amc-consent';
const UTM_KEY = 'amc-utm';

export const analyticsConfigured = () =>
  (PROVIDER === 'plausible' && !!PLAUSIBLE_DOMAIN) || (PROVIDER === 'ga4' && !!GA4_ID);

const ALLOWED_PROPS = new Set([
  'service_type', 'card', 'category', 'item', 'step', 'from_step', 'path', 'package', 'channel', 'question',
  'location', 'count_band', 'value_band', 'utm_source', 'utm_medium', 'utm_campaign', 'page',
]);

function safe(storage: 'localStorage' | 'sessionStorage', fn: (s: Storage) => string | null | void) {
  try { return fn(window[storage]) ?? null; } catch { return null; }
}

export const getConsent = () => safe('localStorage', (s) => s.getItem(CONSENT_KEY)) as 'granted' | 'denied' | null;

let loaded = false;
const queue: [string, Props][] = [];

declare global {
  interface Window {
    plausible?: ((e: string, o?: { props?: Props; u?: string }) => void) & { q?: unknown[] };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    amcTrack?: typeof track;
  }
}

function inject(src: string, attrs: Record<string, string> = {}) {
  const s = document.createElement('script');
  s.src = src;
  s.defer = true;
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v));
  document.head.appendChild(s);
}

function load() {
  if (loaded || !analyticsConfigured() || getConsent() !== 'granted') return;
  loaded = true;
  if (PROVIDER === 'plausible') {
    window.plausible = window.plausible || Object.assign((...a: unknown[]) => { (window.plausible!.q = window.plausible!.q || []).push(a); }, {});
    inject('https://plausible.io/js/script.manual.js', { 'data-domain': PLAUSIBLE_DOMAIN });
  } else {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, { send_page_view: false, anonymize_ip: true });
    inject(`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`);
  }
  queue.splice(0).forEach(([n, p]) => send(n, p));
}

function send(name: string, props: Props) {
  if (PROVIDER === 'plausible') {
    if (name === 'pageview') window.plausible?.('pageview', { u: location.href });
    else window.plausible?.(name, { props });
  } else if (window.gtag) {
    if (name === 'pageview') window.gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
    else window.gtag('event', name, props);
  }
}

/** Fire an analytics event. Unknown property keys are dropped. */
export function track(name: string, props: Props = {}) {
  const clean: Props = {};
  for (const [k, v] of Object.entries(props)) if (ALLOWED_PROPS.has(k) && v !== undefined && v !== '') clean[k] = v;
  if (!analyticsConfigured() || getConsent() !== 'granted') return;
  if (!loaded) { queue.push([name, clean]); load(); return; }
  send(name, clean);
}

export function setConsent(value: 'granted' | 'denied') {
  safe('localStorage', (s) => s.setItem(CONSENT_KEY, value));
  if (value === 'granted') { load(); track('pageview'); }
}

/** First-touch campaign source, kept for the session and attached to order submissions. */
export function captureUtm() {
  const params = new URLSearchParams(location.search);
  const utm: Record<string, string> = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => { const v = params.get(k); if (v) utm[k] = v.slice(0, 100); });
  const existing = safe('sessionStorage', (s) => s.getItem(UTM_KEY));
  if (!existing) {
    const record = { ...utm, referrer: document.referrer.slice(0, 300), landing: location.pathname.slice(0, 300) };
    safe('sessionStorage', (s) => s.setItem(UTM_KEY, JSON.stringify(record)));
  }
  return utm;
}

export function getSource(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}'); } catch { return {}; }
}

let wired = false;
export function initAnalytics() {
  window.amcTrack = track;
  if (getConsent() === 'granted') load();
  if (wired) return;
  wired = true;
  document.addEventListener('astro:page-load', () => {
    const utm = captureUtm();
    track('pageview');
    if (utm.utm_source) track('campaign_visit', utm);
  });
  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('a, button, [data-track]');
    if (!el) return;
    const named = el.closest<HTMLElement>('[data-track]');
    if (named) {
      const props: Props = {};
      for (const [k, v] of Object.entries(named.dataset)) if (k.startsWith('track') && k !== 'track') props[k.slice(5).replace(/^./, (c) => c.toLowerCase()).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v;
      track(named.dataset.track!, props);
    }
    const href = el.getAttribute('href') ?? '';
    if (href.startsWith('tel:')) track('contact_click', { channel: 'phone', page: location.pathname });
    if (href.startsWith('mailto:')) track('contact_click', { channel: 'email', page: location.pathname });
  });
  document.addEventListener('toggle', (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.matches?.('details[data-faq]') && d.open) track('faq_opened', { question: d.dataset.faq });
  }, true);
}
