import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test.use({ storageState: { cookies: [], origins: [] } });

test('a first visit builds a player, then the pad can move the picker', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(APP);
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: unknown }).__sandbox);

  await expect(page.locator('#player-modal')).toBeVisible();
  await expect(page.locator('#pm-title')).toHaveText('Create your player');
  await expect(page.locator('#pm-close')).toBeHidden();
  await page.click('#pm-save');
  await expect(page.locator('#pm-hint')).toHaveText('Enter a name to play.');

  await page.fill('#pm-name', 'Alex');
  await page.locator('#pm-grid .pm-swatch').first().click();
  await expect(page.locator('.pm-stage')).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
  await page.locator('.pm-card').screenshot({ path: '/tmp/my-player-create.png' });
  await page.click('#pm-save');
  await expect(page.locator('#player-modal')).toBeHidden();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tdfb.sandbox.player') || 'null') as { name: string; look: { jersey: number } });
  expect(saved.name).toBe('Alex');
  expect(saved.look.jersey).toBe(0xd32f2f);
  await expect(page.locator('.nameplate')).toHaveText('Alex');
  const settings = page.locator('.lil-gui.lil-root');
  await expect(settings).not.toContainText('Jersey');
  await expect(settings).not.toContainText('Pants');
  await expect(settings).not.toContainText('Skin');
  await page.screenshot({ path: '/tmp/my-player-field.png' });

  await page.click('#my-player');
  await expect(page.locator('#pm-title')).toHaveText('My Player');
  await expect(page.locator('#pm-name')).toHaveValue('Alex');
  await expect(page.locator('#pm-close')).toBeVisible();
  await expect(page.locator('.pm-stage')).toHaveAttribute('data-state', 'ready', { timeout: 15000 });

  await page.evaluate(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'test', index: 0, connected: true, mapping: 'standard' as const, axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  await page.evaluate(() => { (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad.buttons[13].pressed = true; });
  await expect(page.locator('#pm-parts button.pad-focus')).toHaveText('Jersey');
  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
    pad.buttons[13].pressed = false;
    pad.buttons[0].pressed = true;
  });
  await expect(page.locator('#pm-grid .pm-swatch.pad-focus')).toHaveCount(1);
  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean }[] } }).__pad;
    pad.buttons[0].pressed = false;
  });
  await page.click('#pm-close');
  await expect(page.locator('#player-modal')).toBeHidden();

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sandbox: { state: { play: { phase: string } } } }).__sandbox.state.play.phase)).toBe('live');
  expect(errors).toEqual([]);
});
