# American Mediterranean Cuisine website

Production website for **American Mediterranean Cuisine**, a catering business serving Tampa Bay, Florida. It helps individuals, offices, families and event hosts understand the offer, build an order in three steps, and either send a quote request or (once approved) pay for a standard order online.

The developer brief is the source of truth. It is kept out of this public repository: place your copy at `docs/brief.pdf` (git-ignored).

- **Owners and editors:** read [`docs/OWNER-GUIDE.md`](docs/OWNER-GUIDE.md).
- **Before going live:** work through [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md).
- **Test results:** [`docs/TEST-REPORT.md`](docs/TEST-REPORT.md).
- **Photo and video prompts:** [`docs/media-prompts.md`](docs/media-prompts.md).

## Stack

| Layer | Choice |
|---|---|
| Site | Astro 7 (static output), TypeScript, Tailwind CSS 4 |
| Interactive parts | React islands for the order builder and menu filters only; everything else is plain HTML plus small scripts |
| Content | JSON and Markdown in `src/content/`, validated with Zod (`src/lib/schemas.ts`) |
| CMS | Decap CMS at `/admin` (GitHub backend through Netlify OAuth) |
| Forms | Netlify Forms (contact, newsletter) with honeypot |
| Orders | Netlify Functions + Netlify Blobs, email through Resend, optional Stripe Checkout |
| Motion | Lenis + GSAP ScrollTrigger (loaded when idle, skipped for reduced motion), Astro view transitions |
| Fonts | Fraunces + Manrope, self-hosted via Fontsource, with metric-matched fallbacks |

## Project layout

```
src/
  content/            All business content: menu/, packages/, faq/, pages/, settings.json,
                      rules.json (lead times, minimums, fees), zones.json, calendar.json,
                      gallery.json, banners.json
  lib/
    schemas.ts        Zod schemas for every content file (shared by site, CMS data and server)
    order.ts          Order schema, pricing, minimums, lead times and checkout/quote/conflict branching
    site.ts           Build-time content loading
  components/
    builder/          Three-step order builder (React)
    home/, ui/        Page sections and shared pieces
  pages/              Routes (index, lunchboxes, trays, events, how-it-works, menu, about, faq,
                      contact, order/, privacy, terms, 404, admin/orders)
  scripts/            analytics.ts (consent-gated track()), motion.ts (Lenis/GSAP)
  styles/global.css   Brand tokens (CSS variables) and base components
netlify/
  functions/          submit-order, stripe-webhook, order-status, admin-orders
  lib/                Blobs storage, email, Stripe helpers
public/admin/         Decap CMS
public/media/         photos/ (AVIF + WebP), video/ (WebM + MP4), placeholders/
scripts/              build-catalog.ts, process-media.mjs, make-placeholders.mjs, fetch-media.py
tests/                Unit tests (Vitest) and e2e/ (Playwright + axe)
```

**Prices live in one place.** Every price, serving count, minimum and lead time is read from `src/content/`. `scripts/build-catalog.ts` validates the same files and bundles them for the server functions, so the server re-prices every order itself and never trusts the browser.

## Local development

Requirements: Node 22+.

```bash
npm install
cp .env.example .env          # fill in what you need; everything is optional locally
npm run dev                   # site only, http://127.0.0.1:4321
npx netlify dev               # site + functions + Blobs, http://localhost:8888
```

Useful commands:

```bash
npm run build                 # validates content, type-checks, builds to dist/
npm test                      # unit tests for pricing and branching
npx netlify serve --offline   # production build with functions on :8888
npm run test:e2e              # Playwright + axe against :8888 (or BASE_URL)
npm run media                 # re-encode media-src/ into public/media (set FFMPEG for video)
```

## Order flow

1. **Choose:** service type (individual, office, family, trays, event), occasion, count, date, window, delivery or pickup, service level. Blackout dates and lead times are checked immediately, with alternative dates offered.
2. **Create:** curated packages first, then customization (per-box selections, half/full trays, event tiers with menu preferences or "request a consultation"). Minimums are enforced.
3. **Deliver:** contact, address, access notes, dietary and allergen notes, instructions, contact preference and consent.

`evaluateOrder()` in `src/lib/order.ts` then decides the path:

| Path | When |
|---|---|
| `checkout` | Standard package, prices/rules/zone approved, date available, delivery fee known, tax configured, and `PAYMENTS_ENABLED=true` with a Stripe key |
| `quote` | Events, custom trays, setup/staffing, rush dates, unusual quantities, unknown or out-of-zone ZIP, unapproved prices, or payments off |
| `conflict` | Blackout, fully booked, closed weekday or too-soon date; never takes payment |

The customer always sees **"Request received"** for quotes and conflicts. **"Order confirmed"** appears only after the Stripe webhook verifies a payment that matches the stored total.

Each submission gets an ID like `AMC-2026-000123`, is stored in Netlify Blobs, emailed to the business (`BUSINESS_EMAIL`) and acknowledged to the customer. Owners manage orders at `/admin/orders/` (password: `ADMIN_PASSWORD`) with CSV export.

## Deploying to Netlify

`netlify.toml` defines the build (`npm run build` → `dist`), functions, security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy), cache headers and redirects.

**From GitHub (recommended):** in Netlify choose *Add new site → Import from Git*, pick this repository; settings are read from `netlify.toml`. Every push to `main` deploys; pull requests get deploy previews.

**From the CLI:**

```bash
npx netlify login
npx netlify init              # or: npx netlify link
npx netlify deploy --build    # draft preview URL
npx netlify deploy --build --prod
```

Set environment variables under *Site configuration → Environment variables* (see `.env.example`). Never commit secrets.

### Decap CMS authentication (GitHub backend)

1. On GitHub: *Settings → Developer settings → OAuth Apps → New OAuth App*. Homepage URL: your site URL. Authorization callback URL: `https://api.netlify.com/auth/done`.
2. On Netlify: *Site configuration → Access & security → OAuth → Install provider → GitHub*, paste the Client ID and Secret.
3. Give each editor write access to the GitHub repository (that is the permission model: no repo access, no CMS access).
4. Visit `/admin` and choose *Login with GitHub*.

If the repository is renamed or moved, update `backend.repo` in `public/admin/config.yml`.

### Stripe (only when approved)

1. Set `STRIPE_SECRET_KEY` and `PAYMENTS_ENABLED=true` in Netlify env vars (unset means off), then redeploy.
2. In Stripe, add a webhook endpoint `https://<site>/api/stripe-webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`; copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
3. In the CMS, mark the relevant prices, rules and zones as approved, add zone ZIPs and fees, and set the tax rate. Checkout stays off for anything not approved.

## Accessibility and performance

WCAG 2.1 AA: skip link, semantic headings, labels on every field, `aria-live` totals and errors, an error summary that takes focus, keyboard-operable builder and dialogs, visible focus rings, 44 px targets, reduced-motion support, and pause controls for every video. Lighthouse mobile scores and axe results are in the test report.
