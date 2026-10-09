import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test('controls overlay toggles from the keyboard and a gamepad', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__sandbox);

  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#help')).not.toHaveClass(/hidden/);
  await expect(page.locator('#controls-pill')).toBeHidden();
  await expect(page.locator('.help-sec[data-sec="qb"]')).toBeVisible();
  await expect(page.locator('.help-sec[data-sec="defender"]')).toBeHidden();

  await page.keyboard.press('h');
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#controls-pill')).toBeVisible();
  await expect(page.locator('#controls-pill')).toHaveText('? Controls (H)');

  await page.keyboard.press('h');
  await expect(page.locator('#help')).toBeVisible();
  await page.keyboard.press('h');
  await page.reload();
  await page.waitForFunction(() => !!window.__sandbox);
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#controls-pill')).toBeVisible();

  await page.keyboard.press('g');
  await expect(page.locator('.lil-gui.lil-root')).toHaveClass(/lil-closed/);
  await page.keyboard.press('g');
  await expect(page.locator('.lil-gui.lil-root')).not.toHaveClass(/lil-closed/);

  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'test', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (window as unknown as { __pad: typeof pad }).__pad = pad;
  });
  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
    pad.buttons[8].pressed = true;
    pad.buttons[9].pressed = true;
  });
  await expect.poll(() => page.locator('#help').isVisible()).toBe(true);
  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
    pad.buttons[8].pressed = false;
    pad.buttons[9].pressed = false;
  });
  await page.waitForTimeout(250);

  const t0 = await page.evaluate(() => window.__sandbox.state.play.t0);
  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
    pad.buttons[9].pressed = true;
  });
  await page.waitForTimeout(800);
  await expect.poll(() => page.locator('#help').isVisible()).toBe(false);
  expect(await page.evaluate(() => window.__sandbox.state.play.t0)).toBe(t0);
  await expect(page.locator('#controls-pill')).toBeVisible();

  const noise = errors.filter(isRealError);
  expect(noise, noise.join('\n')).toEqual([]);
});

function isRealError(line: string) {
  if (/favicon/i.test(line)) return false;
  return true;
}

declare global {
  interface Window {
    __sandbox: { state: { play: { t0: number } } };
  }
}
