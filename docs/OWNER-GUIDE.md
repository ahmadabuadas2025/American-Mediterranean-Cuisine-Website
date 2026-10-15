# Owner guide

How to update the website and handle orders without a developer.

## Signing in

| What | Where | How |
|---|---|---|
| Menu, prices, packages, FAQ, pages, settings | `https://<your-site>/admin` | *Login with GitHub*. Your GitHub account needs write access to the website repository. |
| Orders and inquiries | `https://<your-site>/admin/orders/` | The admin password set in Netlify (`ADMIN_PASSWORD`). |

Every change you save in `/admin` is published automatically in about a minute. Each save is recorded in the repository history, which is your change log for menu and price edits (who changed what, and when).

## Before launch: things only you can confirm

The site hides or flags anything not yet confirmed. Placeholders read `TODO-OWNER` and are hidden on the public site.

In **Settings → Business details and contact**:
- Phone, email, hours, response time, pickup address, social links, Google Business Profile.
- Leave a value as `TODO-OWNER` to keep it hidden.

In **Settings → Ordering rules**:
- Lead times, rush limits and rush fee, minimums, setup fee range, deposit, delivery windows, occasions, event add-ons.
- **Sales tax rate**: leave empty until confirmed. While empty, totals say "calculated on confirmation".
- **Cancellation policy** and **final guest count deadline**: these stay hidden until you replace `TODO-OWNER`.
- Turn on **Rules approved by owner** once everything is right.

In **Settings → Delivery zones**:
- Add each zone's name, ZIP codes, delivery fee and minimum. Until ZIPs are listed, every delivery becomes a quote request so you can confirm the fee.

In **Settings → Blackout and booked dates**:
- Add closed dates (holidays) and fully booked dates. Customers cannot book these and are offered alternatives.

In **Menu dishes** and **Packages**:
- Check every name, description, price and serving estimate.
- **Dietary markers (V, VG, GF-friendly):** only keep a marker if the current recipe and kitchen handling support it. When the full list is checked, set **Dietary markers status** to *approved* in Business details; until then the site shows them as "proposed".
- Turn on **Price approved by owner** for each item you have confirmed.
- When all prices are approved, you can turn off **Show pricing notice** ("Concept pricing, subject to confirmation").

In **Pages**: replace the About text with your story, and have the Privacy and Terms drafts reviewed, then remove the draft notice.

## Common tasks

**Change a price:** Menu dishes (or Packages) → open the item → edit the price → Save. The menu page, trays page, order builder and order emails all update together. Prices are never typed anywhere else.

**Mark something sold out:** open the item → turn off *Available*. It disappears from the menu and the builder.

**Add a dish:** Menu dishes → *New Dish*. Choose its category and, under *Can be chosen in boxes and packages as*, the roles it can fill (for example "Dip"). That is how it appears in box and package choices.

**Replace a photo:** open the item → *Photo* → upload. Write a short description of what is in the photo (this is read aloud to blind visitors and helps search). Turn off *Photo is a placeholder or AI illustration*. Current photos and videos are AI illustrations; please replace them with real photos of your food as soon as you can.

**Homepage gallery:** Settings → Homepage gallery.

**Announcement banner:** Settings → Announcement banner → turn on, write the text and optional link.

**FAQ:** FAQ → edit or add. Tick *Show on the homepage* for up to five top questions. You can insert live values from the ordering rules, for example `{minimums.officeMeals}` or `{leadTimeHours.trays}`, so answers never go out of date.

**Hero video:** Settings → Business details → Homepage hero media. Keep videos short (under 4 MB), muted and without text.

## Handling orders

1. A new request arrives by email to the business inbox with everything the customer entered, and in the **orders dashboard**.
2. The customer automatically receives a **"Request received"** email with their inquiry number (for example `AMC-2026-000123`). It clearly says the order is not yet confirmed.
3. Review the date, delivery and menu, then send the customer an itemized quote (and payment link, if you use one) from your email.
4. In the dashboard, open the order and update **Status** (Quote sent → Confirmed → Completed, or Cancelled), the **Follow-up owner**, the **Next follow-up** date and **Internal notes**. Every change is kept in the order's history.
5. **Download CSV** exports all orders for accounting or a CRM.

The dashboard shows why each request became a quote (for example "rush date" or "outside delivery zones") and any date conflict.

**Online payments:** only standard packages, with approved prices, a known delivery fee and tax, on an available date, can be paid online, and only after a developer switches payments on (see the README). An online order becomes "Confirmed" automatically when the payment succeeds; you cannot mark an unpaid online order as confirmed by hand.

## Contact, newsletter and analytics

- **Contact form and newsletter sign-ups** appear in Netlify under *Forms*. Turn on email notifications there (*Forms → Form notifications*).
- **Analytics** run only if configured (Plausible or Google Analytics 4) and only after the visitor agrees. Names, contact details and dietary notes are never sent.

## Getting help

If a change does not appear after a few minutes, check *Deploys* in Netlify for a failed build. A failed build usually means a required field is empty or a price is not a number; the log names the exact file.
