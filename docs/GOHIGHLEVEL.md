# GoHighLevel setup

The website stays on Netlify and does the ordering logic. Every order is also sent to GoHighLevel (GHL), which runs the customer side: contacts, the orders pipeline, emails/SMS, invoices and follow-ups.

```
Customer → website order builder → order saved (Netlify) ─┬→ GHL webhook → contact + opportunity + emails/SMS
                                                           └→ /admin/orders/ (backup dashboard)
```

The website sends to GHL:

| Event | When |
|---|---|
| `order.created` | A customer submits the order builder |
| `order.paid` | Stripe confirms an online payment (only if online checkout is on) |
| `order.updated` | Staff change an order's status in `/admin/orders/`, or press **Send to GoHighLevel** |

The order is always saved on the website first. If GHL is down, the customer still gets their order number, the order history shows "GoHighLevel webhook failed", and staff can press **Send to GoHighLevel** later.

## Step 1: create the pipeline (5 min)

**Opportunities → Pipelines → Create new pipeline** named **Catering Orders**, with these stages:

1. New request
2. Quote sent
3. Awaiting payment
4. Confirmed (paid)
5. Completed
6. Lost / cancelled

## Step 2: create custom fields (10 min)

**Settings → Custom Fields → Add field** (group "Catering order"). Create these as single-line text unless noted:

| Field name | Website key | Type |
|---|---|---|
| Order ID | `order_id` | Text |
| Order path | `order_path` | Text (Quote request / Online checkout / Date conflict) |
| Order status | `order_status` | Text |
| Service | `service_label` | Text |
| Occasion | `occasion` | Text |
| Guests or meals | `guest_count` | Number |
| Event date | `event_date` | Date |
| Time window | `time_window` | Text |
| Fulfillment | `fulfillment` | Text (delivery / pickup) |
| Service level | `service_level` | Text |
| Items | `items_summary` | Multi-line text |
| Order total | `total_display` | Text |
| Food subtotal | `subtotal` | Monetary |
| Why it's a quote | `quote_reasons` | Multi-line text |
| Dietary / allergies | `dietary_notes` | Multi-line text |
| Access notes | `access_notes` | Multi-line text |
| Special instructions | `special_instructions` | Multi-line text |
| Event add-ons | `event_add_ons` | Text |

These map to GHL's built-in contact fields: `first_name`, `last_name`, `email`, `phone`, `company_name`, `address1`, `city`, `state`, `postal_code`.

Also sent, if you want them: `payment_status`, `amount_paid`, `delivery_fee`, `tax`, `total`, `delivery_zone`, `contact_preference`, `marketing_consent`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer`, `tags`, `admin_link`, `event` and `submitted_at`.

## Step 3: create the workflow and get the webhook URL (10 min)

1. **Automation → Workflows → Create Workflow → Start from scratch**, named **Website catering orders**.
2. **Add New Trigger → Inbound Webhook.** GHL shows a webhook URL. **Copy it.**
3. Send a sample so GHL learns the fields: run `npx tsx scripts/ghl-sample.ts <webhook-url>` (sends one order marked TEST), or do Step 4 and place a test order. Then click **Fetch sample requests** and pick the sample.
4. Add actions:
   1. **Create/Update Contact.** Map first name, last name, email, phone, company, address, city, state and postal code from the webhook fields, plus the custom fields from Step 2.
   2. **Add Tag.** Use `website-order` (the payload's `tags` field also has `service-office`, `path-quote` and so on).
   3. **If/Else** on `event`:
      - **`order.created`**: **Create/Update Opportunity** in *Catering Orders* → *New request*. Use the name `{{order_id}} · {{service_label}} · {{event_date}}` and the value from `subtotal`. Then **Send Email** to the customer (template below) and **Internal Notification** to staff (email/SMS/app).
      - **`order.paid`**: move the opportunity to *Confirmed (paid)*, then send the "Order confirmed" email.
      - **`order.updated`**: move the opportunity to the stage matching `order_status` (`quote_sent` → Quote sent, `confirmed` → Confirmed, `completed` → Completed, `cancelled` → Lost).
5. **Save** and **Publish**.

Customer email template (order.created):

> **Subject:** We received your catering request ({{order_id}})
>
> Hi {{first_name}}, thanks for your {{service_label}} request for **{{event_date_display}}, {{time_window}}**.
>
> **Your request:** {{items_summary}}
> **Estimated:** {{total_display}}
>
> This is **not yet a confirmed order**. We'll check the date, delivery and menu and send you an itemized quote with a secure payment link. Nothing is charged until you approve it.

## Step 4: connect the website (2 min)

In **Netlify → Site configuration → Environment variables** add:

| Variable | Value |
|---|---|
| `GHL_WEBHOOK_URL` | The URL from Step 3 |
| `GHL_HANDLES_CUSTOMER_EMAIL` | `true` if the GHL workflow sends the customer emails (recommended), so the website doesn't send a second copy |

Then redeploy (**Deploys → Trigger deploy**) and place a test order on the site. It should appear in GHL within seconds. Go back to Step 3.3 to fetch the sample.

With GHL handling customer emails, you don't need Resend for customers. You can keep `BUSINESS_EMAIL` and Resend as a backup alert to the business, or skip them.

## Step 5: taking payment through GHL

1. **Payments → Integrations → Connect Stripe.**
2. When an order is ready to quote, open the contact in GHL and send an **Invoice** (or a **Payment Link**) for the confirmed total.
3. Add a workflow with the trigger **Invoice paid** (or Payment received) that moves the opportunity to *Confirmed (paid)* and sends the confirmation email.
4. In `/admin/orders/`, set the website order to *Confirmed*. That also syncs to GHL as `order.updated`.

The website's own Stripe checkout stays off (`PAYMENTS_ENABLED` unset), so customers are never charged before you confirm.

## Step 6: useful follow-up workflows (optional)

- **Reminder:** 2 days before `event_date`, text or email the customer with delivery details.
- **Quote follow-up:** if the opportunity sits in *Quote sent* for 48 hours, remind the customer.
- **After the event:** 1 day after *Completed*, send a thank-you and reorder link, plus a review request only if `marketing_consent` is true.
- **Office regulars:** tag repeat office customers and send a weekly "order next week's lunch" email.

## Troubleshooting

| Problem | Fix |
|---|---|
| Nothing reaches GHL | Check `GHL_WEBHOOK_URL` in Netlify and redeploy; make sure the workflow is **Published**. |
| Order history says "GoHighLevel webhook failed" | Open the order in `/admin/orders/` and press **Send to GoHighLevel**. |
| Customer gets two emails | Set `GHL_HANDLES_CUSTOMER_EMAIL=true` and redeploy. |
| Fields are empty in GHL | Re-run **Fetch sample requests** in the trigger and re-map the fields. |
