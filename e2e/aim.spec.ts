import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test('aim modes switch live and the arc morphs with RT', async ({ page }) => {
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

  await page.keyboard.press('k');
  await expect(page.locator('#aim-mode')).toContainText('Direction charge');
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
  await page.waitForTimeout(200);
  await page.keyboard.down('f');
  const peaks: number[] = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(70);
    const peak = await page.evaluate(() => {
      const view = (window as unknown as { __sandbox: { view: { preview: { z?: number }[] | null; previewLoft: number } | null } }).__sandbox.view;
      const preview = view?.preview;
      if (!preview?.length) return -1;
      let z = 0;
      for (const p of preview) z = Math.max(z, p.z || 0);
      return z;
    });
    peaks.push(peak);
  }
  await page.keyboard.up('f');
  console.log('arc peaks ' + peaks.map((z) => z.toFixed(2)).join(', '));
  expect(peaks.every((z) => z > 0)).toBe(true);
  let maxStep = 0;
  for (let i = 1; i < peaks.length; i++) maxStep = Math.max(maxStep, Math.abs(peaks[i] - peaks[i - 1]));
  const span = Math.max(...peaks) - Math.min(...peaks);
  console.log(`arc morph step=${maxStep.toFixed(2)} yd span=${span.toFixed(2)} yd`);
  expect(maxStep).toBeLessThan(6);
  expect(span).toBeGreaterThan(1);

  const real = errors.filter((e) => !/favicon/i.test(e));
  expect(real).toEqual([]);
});
