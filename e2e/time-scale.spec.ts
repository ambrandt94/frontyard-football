import { expect, test, type Page } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test('0.5x covers half the ground per second and doubles throw flight', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__sandbox);

  await page.keyboard.press('t');
  await expect.poll(() => page.evaluate(() => window.__sandbox.S.timeScale)).toBe(0.5);
  await expect(page.locator('#stats')).toContainText('0.5×');
  await page.keyboard.press('t');
  await page.keyboard.press('t');
  await expect.poll(() => page.evaluate(() => window.__sandbox.S.timeScale)).toBe(1);
  await expect(page.locator('#stats')).not.toContainText('Time');

  const full = await yardsPerRealSecond(page, 1);
  const half = await yardsPerRealSecond(page, 0.5);
  expect(half / full).toBeGreaterThan(0.4);
  expect(half / full).toBeLessThan(0.6);

  const flightFull = await airTimeMs(page, 1);
  const flightHalf = await airTimeMs(page, 0.5);
  expect(flightHalf / flightFull).toBeGreaterThan(1.75);
  expect(flightHalf / flightFull).toBeLessThan(2.3);

  const noise = errors.filter((line) => !/favicon/i.test(line));
  expect(noise, noise.join('\n')).toEqual([]);
});

async function yardsPerRealSecond(page: Page, scale: number) {
  await page.evaluate((timeScale) => {
    const S = window.__sandbox.S;
    S.timeScale = timeScale;
    S.requireSnap = false;
    S.autoReset = false;
    S.throwDefender = false;
    S.throwPursuer = false;
    window.__sandbox.setMode('throw');
    window.__net!.setInput({ my: 1, sprint: true });
  }, scale);
  await expect.poll(() => page.evaluate(() => {
    const p = window.__sandbox.state.players.qb;
    return Math.hypot(p.vx, p.vy);
  }), { timeout: 8000 }).toBeGreaterThan(10);
  const start = await page.evaluate(() => {
    const p = window.__sandbox.state.players.qb;
    return { x: p.x, y: p.y, t: performance.now() };
  });
  await page.waitForTimeout(1000);
  return page.evaluate((from) => {
    const p = window.__sandbox.state.players.qb;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    return dist / ((performance.now() - from.t) / 1000);
  }, start);
}

async function airTimeMs(page: Page, scale: number) {
  await page.evaluate((timeScale) => {
    const S = window.__sandbox.S;
    S.timeScale = timeScale;
    S.requireSnap = true;
    S.autoReset = false;
    S.throwDefender = false;
    S.throwPursuer = false;
    S.baseInaccuracy = 0;
    S.catchReach = 0;
    S.oneHandReach = 0;
    S.autoThrowDelay = 30;
    window.__sandbox.setMode('throw');
    window.__net!.setInput(null);
  }, scale);
  await page.evaluate(() => window.__net!.setInput({ a: true }));
  await expect.poll(() => page.evaluate(() => window.__sandbox.state.play.phase)).toBe('live');
  await page.evaluate(() => window.__net!.setInput(null));
  const aim = await page.evaluate(() => {
    const q = window.__sandbox.state.players.qb;
    return { x: q.x, y: q.y + 18 };
  });
  await page.evaluate((spot) => window.__net!.setInput({ aim: spot, throwPower: 0.55, lt: true }), aim);
  await expect.poll(() => page.evaluate(() => window.__sandbox.state.ball.state)).toBe('air');
  const airAt = Date.now();
  await page.evaluate(() => window.__net!.setInput(null));
  await expect.poll(() => page.evaluate(() => window.__sandbox.state.ball.state), { timeout: 20000 }).not.toBe('air');
  return Date.now() - airAt;
}

declare global {
  interface Window {
    __sandbox: {
      S: Record<string, number | string | boolean>;
      setMode(mode: string): void;
      state: {
        play: { phase: string; t0: number };
        ball: { state: string; holder: string | null };
        players: Record<string, { x: number; y: number; vx: number; vy: number }>;
      };
    };
    __net?: { setInput(partial: Record<string, unknown> | null): void };
  }
}
