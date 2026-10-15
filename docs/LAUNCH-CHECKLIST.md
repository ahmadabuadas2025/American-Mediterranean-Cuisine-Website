# Launch checklist

Work through this before the site is public. Items map to the brief's "Owner decisions needed before launch" (section 11) and acceptance criteria (section 10).

## Owner decisions and content

- [ ] Final public business name, logo and brand colors. Swap logo colors in `src/styles/global.css` (`:root` tokens) and replace the mark in `src/components/Logo.astro`.
- [ ] Verified phone, email, hours, response time, social links, Google Business Profile (CMS → Settings → Business details).
- [ ] Delivery zones: ZIP codes, fees and minimums (CMS → Delivery zones). Mark zones approved.
- [ ] Pickup address and process, or turn pickup off.
- [ ] Every menu item, inclusion, serving estimate and price confirmed; *Price approved* turned on.
- [ ] Dietary markers checked against recipes and handling; status set to *approved*. Allergen disclaimer wording reviewed.
- [ ] Lead times, rush rules, capacity, blackout dates and delivery windows confirmed; *Rules approved* on.
- [ ] Cancellation, change, refund and final-count policy written (replaces `TODO-OWNER`).
- [ ] Event terms: deposit, balance timing, setup/staffing/rental options, tasting rules, quote expiry.
- [ ] Sales tax treatment confirmed and rate entered (or left empty so tax is always quoted).
- [ ] About page copy from the founder; Privacy and Terms reviewed and draft notices removed.
- [ ] Real food, packaging and setup photography replaces the AI illustrations (see `docs/media-prompts.md`).
- [ ] No testimonials, ratings, certifications or insurance claims unless provided with permission.

## Accounts and configuration (Netlify env vars)

- [ ] Netlify site connected to the GitHub repository; custom domain added; HTTPS certificate active.
- [ ] `ADMIN_PASSWORD` (12+ characters) set; shared only with staff who handle orders.
- [ ] Resend account with the sending domain verified; `RESEND_API_KEY`, `EMAIL_FROM`, `BUSINESS_EMAIL` set.
- [ ] Decap CMS: GitHub OAuth app created and installed in Netlify; each editor has repository write access.
- [ ] Netlify Forms notifications for the `contact` and `newsletter` forms turned on.
- [ ] Analytics provider chosen; `PUBLIC_ANALYTICS_PROVIDER` and `PUBLIC_PLAUSIBLE_DOMAIN` or `PUBLIC_GA4_ID` set; privacy policy names the provider.
- [ ] Payments (optional): Stripe account, `STRIPE_SECRET_KEY`, webhook `/api/stripe-webhook` with `STRIPE_WEBHOOK_SECRET`, then `PAYMENTS_ENABLED=true` and redeploy.
- [ ] Netlify uptime/deploy notifications to the owner's email.
- [ ] Backups: the repository holds all content; export orders as CSV on a schedule (orders live in Netlify Blobs).

## End-to-end verification on the live domain

- [ ] Place a test **office lunchbox** request: inquiry ID shown, business email received, customer "Request received" email received, order visible in `/admin/orders/`.
- [ ] Place a test **event** request and a **custom tray** request: both arrive as quotes.
- [ ] Choose a blackout date: conflict message and alternatives appear; no payment offered.
- [ ] If payments are on: a test-mode Stripe checkout completes, the success page shows "Order confirmed", the confirmation email arrives, and the dashboard shows *paid*.
- [ ] Contact form and newsletter submissions appear in Netlify Forms.
- [ ] Update a price in the CMS; the menu, trays page and builder all show the new price after the deploy.
- [ ] CSV export opens correctly in a spreadsheet.
- [ ] Check the site on a real iPhone and Android phone, a tablet and a desktop browser.
- [ ] Run Lighthouse (mobile) on the live URL: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95.
- [ ] Submit `https://<domain>/sitemap-index.xml` in Google Search Console; link the Google Business Profile.
- [ ] Owner has admin access and has read `docs/OWNER-GUIDE.md`.
