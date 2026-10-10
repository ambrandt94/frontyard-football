import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test('defender help describes the lunge and the page stays quiet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__sandbox);
  await page.locator('.help-all').click();
  const defender = page.locator('.help-sec[data-sec="defender"]');
  await expect(defender).toContainText('Jump');
  await expect(defender).toContainText('Lunge');
  await expect(defender).toContainText('Arrows');
  await expect(defender).toContainText('WRAP');
  const real = errors.filter((e) => !/favicon/i.test(e));
  expect(real).toEqual([]);
});
