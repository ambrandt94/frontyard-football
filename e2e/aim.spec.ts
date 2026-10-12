import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test('aim modes switch live and the arc changes from bullet to lob', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: { setMode?: (m: string) => void } }).__sandbox);
  const hide = page.locator('.help-hide');
  if (await hide.isVisible()) await hide.click();
  await page.evaluate(() => {
    (window as unknown as { __sandbox: { setMode: (m: string) => void } }).__sandbox.setMode('throw');
  });
  await page.waitForFunction(() => {
    const view = (window as unknown as { __sandbox: { view: { preview: { z?: number }[] | null } | null } }).__sandbox.view;
    return !!view?.preview && view.preview.length > 8;
  });

  const starting = await page.evaluate(() => (window as unknown as { __sandbox: { S: { aimMode: string } } }).__sandbox.S.aimMode);
  expect(starting).toBe('directionCharge');
  await page.keyboard.press('k');
  await expect(page.locator('#aim-mode')).toContainText('Absolute+');

  const spot = await page.evaluate(() => {
    const sb = (window as unknown as {
      __sandbox: {
        state: { players: { qb: { x: number; y: number } } };
        renderer: { fieldToScreen: (x: number, y: number, z?: number) => { x: number; y: number } };
      };
    }).__sandbox;
    const qb = sb.state.players.qb;
    return sb.renderer.fieldToScreen(qb.x, qb.y + 40, 0);
  });
  await page.mouse.move(spot.x, spot.y);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as unknown as { __sandbox: { state: { play: { phase: string } } } }).__sandbox.state.play.phase === 'live');
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(180);
  const bullet = await page.evaluate(() => {
    const view = (window as unknown as { __sandbox: { view: { preview: { z?: number }[] | null; previewLoft: number } | null } }).__sandbox.view;
    const preview = view?.preview;
    let z = 0;
    for (const p of preview || []) z = Math.max(z, p.z || 0);
    return { z, loft: view?.previewLoft ?? -1 };
  });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const lob = await page.evaluate(() => {
    const view = (window as unknown as { __sandbox: { view: { preview: { z?: number }[] | null; previewLoft: number } | null } }).__sandbox.view;
    const preview = view?.preview;
    let z = 0;
    for (const p of preview || []) z = Math.max(z, p.z || 0);
    return { z, loft: view?.previewLoft ?? -1 };
  });
  console.log(`bullet loft=${bullet.loft} z=${bullet.z.toFixed(2)} lob loft=${lob.loft} z=${lob.z.toFixed(2)}`);
  expect(bullet.loft).toBe(1);
  expect(lob.loft).toBe(0);
  expect(bullet.z).toBeGreaterThan(0);
  expect(lob.z - bullet.z).toBeGreaterThan(1);

  await page.keyboard.press('k');
  await expect(page.locator('#aim-mode')).toContainText('Direction charge');

  const real = errors.filter((e) => !/favicon/i.test(e));
  expect(real).toEqual([]);
});
