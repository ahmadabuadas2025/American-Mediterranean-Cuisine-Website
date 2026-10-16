/**
 * Transactional email through Resend's HTTP API (no SDK needed).
 * Configure RESEND_API_KEY, EMAIL_FROM and BUSINESS_EMAIL in Netlify env vars.
 * If they are missing, emails are skipped and the order is still stored.
 */
import { formatDate, money, SERVICE_LABELS } from '../../src/lib/order';
import { env, catalog, siteUrl, type OrderRecord } from './orders';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function send(to: string, subject: string, html: string, text: string, replyTo?: string) {
  const key = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');
  if (!key || !from || !to) {
    console.warn(`[email] skipped "${subject}": RESEND_API_KEY, EMAIL_FROM or recipient not configured`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) console.error(`[email] Resend error ${res.status}: ${await res.text()}`);
  return res.ok;
}

function itemsTable(r: OrderRecord) {
  const rows = r.lines
    .map((l) => `<tr><td style="padding:6px 0">${l.qty} × ${esc(l.label)}${l.detail ? `<br><span style="color:#545a45;font-size:13px">${esc(l.detail)}</span>` : ''}</td><td style="padding:6px 0;text-align:right">${l.total == null ? 'Quoted' : money(l.total)}</td></tr>`)
    .join('');
  const fee = r.fulfillment === 'pickup' ? 'Pickup' : r.deliveryFee == null ? 'Confirmed in your quote' : money(r.deliveryFee);
  return `<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
    <tr><td style="padding-top:10px;border-top:1px solid #dccba8">Food subtotal</td><td style="padding-top:10px;border-top:1px solid #dccba8;text-align:right">${money(r.subtotal)}</td></tr>
    <tr><td>Delivery</td><td style="text-align:right">${fee}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">${r.tax == null ? 'Calculated on confirmation' : money(r.tax)}</td></tr>
    <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${r.total == null ? 'Confirmed before you pay' : money(r.total)}</strong></td></tr></table>`;
}

const wrap = (body: string) =>
  `<div style="background:#f6f1e4;padding:24px;font-family:Arial,sans-serif;color:#1e2317"><div style="max-width:560px;margin:0 auto;background:#fcf9f2;border-radius:16px;padding:28px">${body}<p style="margin-top:28px;color:#545a45;font-size:13px">${esc(catalog.settings.businessName)} · ${esc(catalog.settings.brandLine)}</p></div></div>`;

const when = (r: OrderRecord) => `${formatDate(r.date)}${r.timeWindowLabel ? `, ${r.timeWindowLabel}` : ''}`;

/** "Request received": summary, timing expectation and how we follow up. */
export function sendCustomerAck(r: OrderRecord) {
  const subject = `Request received: ${r.id}`;
  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;color:#2f3a1f">We have your request</h1>
    <p>Hi ${esc(r.contact.name.split(' ')[0])}, thanks for your ${esc(SERVICE_LABELS[r.serviceType].toLowerCase())} request for <strong>${esc(when(r))}</strong>.</p>
    <p style="padding:12px 16px;border:1.5px solid #2f3a1f;border-radius:10px;display:inline-block">Inquiry number <strong>${esc(r.id)}</strong></p>
    <p><strong>This is not yet a confirmed order.</strong> We will check availability, delivery and pricing and reply by ${esc(r.contact.preference === 'email' ? 'email' : r.contact.preference === 'text' ? 'text' : 'phone')} with an itemized quote or confirmation. You do not pay anything until you approve it.</p>
    ${itemsTable(r)}
    <p>Need to change something? Reply to this email and mention ${esc(r.id)}.</p>
    <p><a href="${siteUrl()}/faq/" style="color:#843820">Ordering FAQ and policies</a></p>`);
  const text = `We have your request ${r.id} for ${when(r)}.\nThis is not yet a confirmed order. We will reply with an itemized quote or confirmation before you pay anything.\n\n${r.lines.map((l) => `${l.qty} x ${l.label}`).join('\n')}\n\nFood subtotal: ${money(r.subtotal)}`;
  return send(r.contact.email, subject, html, text, env('BUSINESS_EMAIL'));
}

/** "Payment/booking confirmed": sent only after the Stripe webhook verifies payment. */
export function sendCustomerConfirmed(r: OrderRecord) {
  const subject = `Order confirmed: ${r.id}`;
  const address = r.fulfillment === 'pickup' ? 'Pickup' : [r.address.street, r.address.unit, r.address.city, r.address.zip].filter(Boolean).join(', ');
  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;color:#2f3a1f">Your order is confirmed</h1>
    <p>Order <strong>${esc(r.id)}</strong> for <strong>${esc(when(r))}</strong>.</p>
    <p>${esc(address)}</p>
    ${itemsTable(r)}
    <p>Paid: <strong>${money((r.amountPaid ?? 0) / 100)}</strong>. Balance due: <strong>${money(Math.max(0, (r.total ?? 0) - (r.amountPaid ?? 0) / 100))}</strong>.</p>
    <p>Questions or changes? Reply to this email and mention ${esc(r.id)}.</p>`);
  return send(r.contact.email, subject, html, `Order ${r.id} is confirmed for ${when(r)}.`, env('BUSINESS_EMAIL'));
}

/** Full structured record for the business inbox. */
export function sendBusinessNotice(r: OrderRecord, headline = 'New order request') {
  const to = env('BUSINESS_EMAIL') ?? '';
  const row = (k: string, v: unknown) => (v === '' || v == null ? '' : `<tr><td style="padding:4px 12px 4px 0;color:#545a45;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`);
  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;color:#2f3a1f">${esc(headline)}: ${esc(r.id)}</h1>
    <p><strong>Path:</strong> ${esc(r.path)} · <strong>Status:</strong> ${esc(r.status)}</p>
    ${r.reasons.length ? `<p style="color:#843820">${r.reasons.map(esc).join('<br>')}</p>` : ''}
    <table style="font-size:14px">
      ${row('Service', SERVICE_LABELS[r.serviceType])}${row('Occasion', r.occasion)}${row('Guests / meals', r.count)}
      ${row('Date', when(r))}${row('Fulfillment', r.fulfillment)}${row('Service level', r.serviceLevel)}
      ${row('Address', [r.address.street, r.address.unit, r.address.city, r.address.zip].filter(Boolean).join(', '))}${row('Zone', r.zone)}
      ${row('Name', r.contact.name)}${row('Company', r.contact.company)}${row('Email', r.contact.email)}${row('Phone', r.contact.phone)}${row('Prefers', r.contact.preference)}
      ${row('Dietary / allergens', r.dietaryNotes)}${row('Access notes', r.accessNotes)}${row('Instructions', r.instructions)}
      ${row('Event add-ons', r.event.addOns.join(', '))}${row('Marketing consent', r.consentMarketing ? 'yes' : 'no')}
      ${row('Source', [r.source.utm_source, r.source.utm_medium, r.source.utm_campaign].filter(Boolean).join(' / ') || r.source.referrer)}
    </table>
    ${itemsTable(r)}
    <p><a href="${siteUrl()}/admin/orders/" style="color:#843820">Open the orders dashboard</a></p>`);
  return send(to, `${headline}: ${r.id} (${SERVICE_LABELS[r.serviceType]}, ${r.date})`, html, `${headline} ${r.id}`, r.contact.email);
}
