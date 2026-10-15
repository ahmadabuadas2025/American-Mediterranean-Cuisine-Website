# Test report

Run on 14 October 2026 against the production build (`npx netlify serve --offline`, site + functions + Blobs) on Windows 11, Chromium 156. Payments were off (`PAYMENTS_ENABLED` unset) and no email provider was configured, as on a fresh deploy.

## Summary

| Area | Result |
|---|---|
| Type check (`astro check`) | 0 errors, 0 warnings |
| Content validation (`scripts/build-catalog.ts`) | 23 dishes, 12 packages, all valid |
| Unit tests (Vitest, `tests/order.test.ts`) | **18 / 18 passed** |
| End-to-end tests (Playwright, `tests/e2e/`) | **43 / 43 passed** |
| Accessibility (axe-core, WCAG 2.1 A/AA, 13 pages) | **0 violations** |
| Lighthouse mobile Accessibility / Best Practices / SEO | **100 / 100 / 100** on all 12 pages measured |
| Lighthouse mobile Performance | **91–98** on all 12 pages (see below) |

## Order builder branches

| Scenario | How it was tested | Result |
|---|---|---|
| Office lunchboxes, 12 × Classic Box, delivery | e2e: full flow to submission | Subtotal $203.40; "Send quote request"; result page shows `AMC-YYYY-NNNNNN` and "not yet a confirmed order" ✔ |
| Standard + approved + available + payments on → **checkout** | unit: approved catalog, zone with fee, tax 7.5% | Path `checkout`, total $245.53 ✔ (Stripe itself not exercised; no test keys) |
| Payments off → quote | unit | ✔ |
| Concept (unapproved) prices → quote | unit | ✔ |
| Event consultation with setup add-on | e2e | Quote request with inquiry ID ✔ |
| Event tier below minimum (Signature, 25 guests) | e2e + unit | Blocked: "starts at 50 guests" ✔ |
| Custom trays from a menu deep link | e2e | Item preloaded; item dialog opens, adds a full tray, Escape closes, focus returns, builder state kept; "quote request" ✔ |
| Out-of-zone ZIP | unit | Quote, reason mentions ZIP ✔ |
| Rush date (inside lead time) | unit | Quote with rush notice ✔ |
| Unusual quantity (120 boxes) | unit | Quote ✔ |
| Blackout date (25 Dec) | e2e + unit | Conflict explained, alternative dates offered and applied; never checkout ✔ |
| Same-day, below rush floor | unit | Conflict ✔ |
| Office minimum (4 boxes) | e2e + unit | Blocked: "starts at 10 meals or $175" ✔ |
| Missing slot selections | unit | Field-level error ✔ |
| Empty step 1 | e2e | Error summary receives focus; links move focus to the field; `aria-invalid` set ✔ |
| Persistence across reload | e2e | "We restored the order you started earlier" and items intact ✔ |
| Keyboard only (step 1 → step 2) | e2e | Radios, selects and inputs operated with keys; step heading receives focus ✔ |
| Server: honeypot | e2e (API) | Fake success, nothing stored ✔ |
| Server: invalid payload | e2e (API) | 422 with field errors ✔ |
| Delivery address errors shown together with other errors | unit | ✔ (found and fixed a Zod refinement ordering bug during testing) |
| DST-safe Tampa time conversion | unit | ✔ |

## Site checks

| Check | Result |
|---|---|
| No horizontal scroll at 375 / 768 / 1440 px on Home, Order, Menu, Trays | ✔ (full-page screenshots in `test-results/screens/`, regenerated on each run) |
| Reduced motion: no scroll animations, content visible, no video loaded | ✔ |
| Mobile menu: opens, traps focus, Escape closes, focus returns | ✔ |
| Service cards deep-link with type preselected (`/order/?type=office`) | ✔ |
| Menu search and dietary filters; prices are real text | ✔ |
| Every page links to the builder or event inquiry | ✔ |
| Unique titles, one canonical and description per page, robots.txt | ✔ |
| Orders API: 401 without password; JSON and CSV with password | ✔ |

## Lighthouse (mobile, simulated throttling)

Measured on the built `dist/` served with gzip (`npx serve`), because Netlify's local server does not compress responses. Netlify's CDN serves Brotli and HTTP/2, so production should match or beat these figures. Lighthouse varies by a few points between runs; `/order/` scored 91, 94 and 96 on three repeat runs.

| Page | Perf | A11y | BP | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` | 91 | 100 | 100 | 100 | 3.3 s | 0 |
| `/order/` | 91–96 | 100 | 100 | 100 | 2.7–3.3 s | 0 |
| `/menu/` | 94 | 100 | 100 | 100 | 3.0 s | 0 |
| `/trays/` | 94 | 100 | 100 | 100 | 3.1 s | 0 |
| `/events/` | 94 | 100 | 100 | 100 | 3.1 s | 0 |
| `/lunchboxes/` | 93 | 100 | 100 | 100 | 3.2 s | 0 |
| `/faq/` | 97 | 100 | 100 | 100 | 2.6 s | 0 |
| `/how-it-works/` | 98 | 100 | 100 | 100 | 2.3 s | 0 |
| `/contact/` | 96 | 100 | 100 | 100 | 2.7 s | 0 |
| `/about/` | 97 | 100 | 100 | 100 | 2.6 s | 0 |
| `/privacy/` | 96 | 100 | 100 | 100 | 2.7 s | 0 |
| `/terms/` | 97 | 100 | 100 | 100 | 2.6 s | 0 |

Performance work done to reach these numbers: replaced the React mobile menu with a dependency-free one (removed ~66 KB of JavaScript from every page), CSS-only entrances for above-the-fold content, GSAP/Lenis and the hero video loaded only when the browser is idle, inlined CSS, preloaded fonts with metric-matched fallbacks (removed a 0.2 layout shift on FAQ), and AVIF/WebP responsive images.

## Not covered by automated tests

- **Stripe Checkout and webhook** end to end (needs test keys). The signature check, amount match and "only the webhook confirms" rule are implemented; run the launch checklist's test-mode checkout.
- **Email delivery** (needs Resend keys). Without keys the functions log "email skipped" and still store the order.
- **Decap CMS login** (needs the GitHub OAuth app on Netlify).
- **Netlify Forms** capture (only works on a Netlify deploy).
- **Screen reader pass** with NVDA/VoiceOver. The structure is tested with axe and keyboard-only tests; a manual pass is recommended before launch.
- **Real devices.** Testing used Chromium emulation; check Safari on iOS before launch.

## Re-running

```bash
npm test
npx netlify serve --offline          # in another terminal
npm run test:e2e                     # or BASE_URL=https://<preview> npm run test:e2e
```
