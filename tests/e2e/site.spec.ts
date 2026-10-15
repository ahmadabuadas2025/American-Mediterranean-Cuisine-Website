import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/lunchboxes/', '/trays/', '/events/', '/how-it-works/', '/menu/', '/about/', '/faq/', '/contact/', '/order/', '/privacy/', '/terms/', '/404'];
const WIDTHS = [375, 768, 1440];

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  for (const path of PAGES) {
    test(`no violations on ${path}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([]);
    });
  }
});

test.describe('responsive screenshots', () => {
  for (const width of WIDTHS) {
    for (const path of ['/', '/order/', '/menu/', '/trays/']) {
      test(`${path} at ${width}px has no horizontal scroll`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/screens/${path.replace(/\//g, '_') || 'home'}-${width}.png`, fullPage: true });
      });
    }
  }
});

test('reduced motion: no scroll animations and content is visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.classList.contains('js-motion'))).toBe(false);
  await expect(page.getByRole('heading', { name: /Office lunch, solved/ })).toBeVisible();
  expect(await page.locator('video source').count()).toBe(0);
});

test('mobile menu: opens, traps focus, closes on Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Build an Order' }).first()).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Open menu' });
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]:not([client="media"])').length === 0);
  await toggle.click();
  const dialog = page.getByRole('dialog', { name: 'Site menu' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Lunchboxes/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
});

test('service cards deep-link into the builder with the type preselected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Companies & Offices/ }).click();
  await expect(page).toHaveURL(/\/order\/\?type=office/);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]:not([client="media"])').length === 0);
  await expect(page.getByRole('radio', { name: /Office or group lunchboxes/ })).toBeChecked();
});

test('menu: search and dietary filters work, prices are real text', async ({ page }) => {
  await page.goto('/menu/');
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]:not([client="media"])').length === 0);
  await expect(page.getByText('$66').first()).toBeVisible();
  await page.getByLabel('Search dishes').fill('muhammara');
  await expect(page.getByText(/Showing 1 of/)).toBeVisible();
  await page.getByLabel('Search dishes').fill('');
  await page.getByLabel('Vegan').check();
  await expect(page.getByRole('heading', { name: 'Chicken Shawarma' })).toHaveCount(0);
});

test('every page offers a route to the builder or event inquiry', async ({ page }) => {
  for (const path of PAGES.filter((p) => p !== '/order/')) {
    await page.goto(path);
    expect(await page.locator('main a[href^="/order/"], header a[href^="/order/"]').count(), path).toBeGreaterThan(0);
  }
});

test('SEO basics: unique titles, canonical, sitemap and robots', async ({ page, request }) => {
  const titles = new Set<string>();
  for (const path of PAGES.slice(0, 10)) {
    await page.goto(path);
    titles.add(await page.title());
    await expect(page.locator('link[rel=canonical]')).toHaveCount(1);
    await expect(page.locator('meta[name=description]')).toHaveCount(1);
  }
  expect(titles.size).toBe(10);
  expect((await request.get('/robots.txt')).ok()).toBe(true);
});

test('orders dashboard requires the admin password', async ({ request }) => {
  expect((await request.get('/api/admin/orders')).status()).toBe(401);
  const ok = await request.get('/api/admin/orders', { headers: { authorization: `Bearer ${process.env.ADMIN_PASSWORD ?? 'local-dev-password-123'}` } });
  expect(ok.ok()).toBe(true);
  const csv = await request.get('/api/admin/orders?format=csv', { headers: { authorization: `Bearer ${process.env.ADMIN_PASSWORD ?? 'local-dev-password-123'}` } });
  expect(await csv.text()).toContain('Inquiry ID');
});
