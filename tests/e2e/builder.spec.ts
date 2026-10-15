import { expect, test, type Page } from '@playwright/test';

/** Astro removes the `ssr` attribute once an island has hydrated. */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]:not([client="media"])').length === 0);
}
const open = async (page: Page, url: string) => { await page.goto(url); await hydrated(page); };

/** A date comfortably past every lead time that is not a blackout date. */
function futureDate(days = 12): string {
  const d = new Date(Date.now() + days * 86_400_000);
  const s = d.toISOString().slice(0, 10);
  return s.endsWith('12-25') || s.endsWith('01-01') ? futureDate(days + 2) : s;
}

async function step1(page: Page, { count = '12', date = futureDate(), occasion = 'Office lunch or meeting' } = {}) {
  await page.getByLabel('Occasion').selectOption(occasion);
  await page.getByLabel(/How many/).fill(count);
  await page.getByLabel(/^Date/).fill(date);
  await page.getByLabel(/window/).selectOption('11:30');
}

async function step3(page: Page) {
  const main = page.getByRole('main');
  await main.getByRole('textbox', { name: /^Full name/ }).fill('Test Customer');
  await main.getByRole('textbox', { name: /^Email/ }).fill('test@example.com');
  await main.getByRole('textbox', { name: /^Phone/ }).fill('813 555 0100');
  await main.getByRole('textbox', { name: /^Street address/ }).fill('100 Test Street');
  await main.getByRole('textbox', { name: /^City/ }).fill('Tampa');
  await main.getByRole('textbox', { name: /^ZIP code/ }).fill('33602');
  await page.getByLabel(/I agree to be contacted/).check();
}

async function addClassicBoxes(page: Page) {
  await page.getByRole('combobox', { name: 'Main', exact: true }).selectOption({ label: 'Chicken Shawarma' });
  await page.getByRole('combobox', { name: 'Salad or appetizer', exact: true }).selectOption({ index: 1 });
  await page.getByRole('combobox', { name: 'Dip', exact: true }).selectOption({ index: 1 });
  await page.getByRole('combobox', { name: 'Side', exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: /^Add \d+ to order/ }).click();
}

test.beforeEach(async ({ page }) => {
  await open(page, '/order/');
  await page.evaluate(() => localStorage.clear());
});

test('office lunchboxes → quote request with inquiry ID ("request received", not confirmed)', async ({ page }) => {
  await open(page, '/order/?type=office');
  await expect(page.getByRole('radio', { name: /Office or group lunchboxes/ })).toBeChecked();
  await step1(page);
  await page.getByRole('button', { name: /Continue to create/ }).click();
  await expect(page.getByRole('heading', { name: 'Create your food package' })).toBeFocused();
  await addClassicBoxes(page);
  await expect(page.getByRole('complementary', { name: 'Your order' })).toContainText('12 × Classic Box');
  await expect(page.getByRole('complementary', { name: 'Your order' })).toContainText('$203.40');
  await page.getByRole('button', { name: /Continue to deliver/ }).click();
  await step3(page);
  await expect(page.getByText(/request, not a confirmed order/)).toBeVisible();
  await page.getByRole('button', { name: 'Send quote request' }).click();
  await expect(page.getByRole('heading', { name: /We have your request/ })).toBeVisible();
  await expect(page.getByText(/AMC-\d{4}-\d{6}/)).toBeVisible();
  await expect(page.getByText(/not yet a confirmed order/)).toBeVisible();
});

test('event consultation → quote request', async ({ page }) => {
  await open(page, '/order/?type=event');
  await step1(page, { count: '60', date: futureDate(30), occasion: 'Wedding' });
  await page.getByRole('button', { name: /Continue to create/ }).click();
  await page.getByLabel(/I would rather talk it through/).check();
  await page.getByLabel('Buffet setup').check();
  await page.getByRole('button', { name: /Continue to deliver/ }).click();
  await step3(page);
  await page.getByRole('button', { name: 'Send quote request' }).click();
  await expect(page.getByText(/AMC-\d{4}-\d{6}/)).toBeVisible();
});

test('event tier below its guest minimum is blocked with a clear message', async ({ page }) => {
  await open(page, '/order/?type=event&package=signature-event');
  await step1(page, { count: '25', date: futureDate(30), occasion: 'Birthday' });
  await page.getByRole('button', { name: /Continue to create/ }).click();
  await page.getByRole('button', { name: /Continue to deliver/ }).click();
  await expect(page.getByRole('alert')).toContainText('starts at 50 guests');
});

test('custom trays from a menu deep link → quote, with item dialog keeping state', async ({ page }) => {
  await open(page, '/order/?type=trays&item=hummus');
  await step1(page, { count: '10', occasion: 'Birthday' });
  await page.getByRole('button', { name: /Continue to create/ }).click();
  const ticket = page.getByRole('complementary', { name: 'Your order' });
  await expect(ticket).toContainText('Hummus (half tray)');
  await page.getByRole('button', { name: 'Falafel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Falafel' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Add full tray/ }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Falafel', exact: true })).toBeFocused();
  await expect(ticket).toContainText('Falafel (full tray)');
  await expect(ticket).toContainText('Hummus (half tray)');
  await expect(ticket).toContainText('This will be a quote request');
});

test('blackout date → conflict explained with alternative dates; never offers payment', async ({ page }) => {
  await open(page, '/order/?type=individual');
  await step1(page, { count: '1', date: '2026-12-25', occasion: 'Other' });
  const alert = page.getByRole('alert').filter({ hasText: 'That date does not work' });
  await expect(alert).toContainText('not taking orders');
  const alt = alert.getByRole('button').first();
  const label = await alt.textContent();
  await alt.click();
  await expect(page.getByRole('alert').filter({ hasText: 'That date does not work' })).toHaveCount(0);
  expect(label).toBeTruthy();
});

test('validation: empty step shows an error summary that receives focus', async ({ page }) => {
  await page.getByRole('button', { name: /Continue to create/ }).click();
  const summary = page.getByRole('alert').filter({ hasText: 'Please check' });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('Choose what you need');
  await summary.getByRole('link', { name: 'Choose an occasion.' }).click();
  await expect(page.getByLabel('Occasion')).toBeFocused();
  await expect(page.getByLabel('Occasion')).toHaveAttribute('aria-invalid', 'true');
});

test('office minimum (10 meals or $175) is enforced', async ({ page }) => {
  await open(page, '/order/?type=office');
  await step1(page, { count: '4' });
  await page.getByRole('button', { name: /Continue to create/ }).click();
  await addClassicBoxes(page);
  await page.getByRole('button', { name: /Continue to deliver/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Please check' })).toContainText('Office delivery starts at 10 meals');
});

test('selections persist across a reload', async ({ page }) => {
  await open(page, '/order/?type=office');
  await step1(page);
  await page.getByRole('button', { name: /Continue to create/ }).click();
  await addClassicBoxes(page);
  await open(page, '/order/');
  await expect(page.getByText('We restored the order you started earlier.')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Your order' })).toContainText('12 × Classic Box');
});

test('keyboard only: complete step 1 and reach step 2', async ({ page }) => {
  await open(page, '/order/');
  // Tab from the page top into the first service option, then use arrows.
  await page.getByRole('radio', { name: /Individual lunchbox/ }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Office or group/ })).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Occasion')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.type('12');
  await page.keyboard.press('Tab');
  await page.keyboard.type(futureDate().replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2$3$1'));
  // Chromium's date input has internal segments; move to the next field directly.
  await page.getByLabel(/window/).focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: /Continue to create/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Create your food package' })).toBeFocused();
});

test('stops honeypot submissions server-side without storing them', async ({ request }) => {
  const res = await request.post('/api/submit-order', { data: { website: 'spam' } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).id).toBe('AMC-RECEIVED');
});

test('server rejects invalid payloads with field errors', async ({ request }) => {
  const res = await request.post('/api/submit-order', { data: { serviceType: 'office' } });
  expect(res.status()).toBe(422);
  expect(Object.keys((await res.json()).errors)).toContain('contact');
});
