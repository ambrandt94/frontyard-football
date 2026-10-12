import { expect, test } from '@playwright/test';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

test('dive and toe-tap catches in catch mode and throw around', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: { setMode?: (m: string) => void } }).__sandbox);
  const hide = page.locator('.help-hide');
  if (await hide.isVisible()) await hide.click();

  await page.evaluate(() => {
    const box = (window as unknown as { __sandbox: {
      setMode: (m: string) => void;
      S: { catchPaused: boolean; autoReset: boolean; oneHandSuccess: number };
      state: {
        t: number;
        cm?: { phase: string };
        players: Record<string, { x: number; y: number; vx: number; vy: number }>;
        ball: Record<string, unknown>;
      };
    } }).__sandbox;
    box.setMode('catch');
    box.S.catchPaused = true;
    box.S.autoReset = false;
    box.S.oneHandSuccess = 1;
    const st = box.state;
    st.cm!.phase = 'air';
    const w = st.players.wr;
    w.vx = 0;
    w.vy = 0;
    st.ball = {
      state: 'air', holder: null, x: w.x, y: w.y + 0.3, z: 1.5,
      vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: { x: w.x, y: w.y }, throwT: st.t,
      resolved: false, gave: false, power: 0.4,
    };
  });
  await page.keyboard.down('x');
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const st = (window as unknown as { __sandbox: { state: { ball: { holder: string | null }; players: { wr: { diveT: number } } } } }).__sandbox.state;
    return st.ball.holder === 'wr' || st.players.wr.diveT >= 0;
  });
  const dive = await page.evaluate(() => {
    const st = (window as unknown as { __sandbox: { state: { ball: { holder: string | null }; stats: { last: string }; players: { wr: { diveT: number } } } } }).__sandbox.state;
    return { dive: st.players.wr.diveT, holder: st.ball.holder, last: st.stats.last };
  });
  console.log('catch dive', JSON.stringify(dive));
  expect(dive.dive).toBeGreaterThanOrEqual(0);
  await page.keyboard.up('x');

  await page.evaluate(() => {
    const box = (window as unknown as { __sandbox: {
      setMode: (m: string) => void;
      S: { catchPaused: boolean; autoReset: boolean };
      state: {
        t: number;
        cm?: { phase: string };
        players: Record<string, { x: number; y: number; vx: number; vy: number; diveT: number }>;
        ball: Record<string, unknown>;
      };
    } }).__sandbox;
    box.setMode('catch');
    box.S.catchPaused = true;
    box.S.autoReset = false;
    const st = box.state;
    st.cm!.phase = 'air';
    const w = st.players.wr;
    w.x = 12;
    w.y = 48;
    w.vx = 0;
    w.vy = 0;
    w.diveT = -1;
    st.ball = {
      state: 'air', holder: null, x: w.x, y: w.y + 6, z: 4,
      vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: { x: w.x, y: w.y }, throwT: st.t,
      resolved: false, gave: false, power: 0.4,
    };
  });
  await page.keyboard.down('v');
  await page.waitForFunction(() => !!(window as unknown as { __sandbox: { state: { players: { wr: { planted: unknown } } } } }).__sandbox.state.players.wr.planted);
  await page.evaluate(() => {
    const st = (window as unknown as { __sandbox: { state: {
      t: number;
      cm?: { phase: string };
      players: { wr: { planted: { x: number; y: number } | null } };
      ball: { x: number; y: number; z: number; vz: number; state: string; holder: string | null; resolved: boolean };
    } } }).__sandbox.state;
    const feet = st.players.wr.planted!;
    st.ball.x = feet.x + 0.2;
    st.ball.y = feet.y + 0.35;
    st.ball.z = 1.45;
    st.ball.vz = 0;
    st.ball.state = 'air';
    st.ball.holder = null;
    st.ball.resolved = false;
    st.cm!.phase = 'air';
  });
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const st = (window as unknown as { __sandbox: { state: { ball: { holder: string | null }; stats: { last: string } } } }).__sandbox.state;
    return st.ball.holder === 'wr' || st.stats.last === 'CATCH';
  }, undefined, { timeout: 3000 });
  const toe = await page.evaluate(() => {
    const st = (window as unknown as { __sandbox: { state: { ball: { holder: string | null }; stats: { last: string } } } }).__sandbox.state;
    return { holder: st.ball.holder, last: st.stats.last };
  });
  console.log('catch toe-tap', JSON.stringify(toe));
  expect(toe.holder).toBe('wr');
  await page.keyboard.up('v');

  await page.evaluate(() => {
    const box = (window as unknown as { __sandbox: {
      setMode: (m: string) => void;
      S: { autoReset: boolean };
      state: {
        t: number;
        controlled: string;
        players: Record<string, { x: number; y: number; vx: number; vy: number; diveT: number }>;
        ball: Record<string, unknown>;
      };
    } }).__sandbox;
    box.setMode('free');
    box.S.autoReset = false;
    const st = box.state;
    st.controlled = 'p1';
    const w = st.players.p1;
    w.vx = 0;
    w.vy = 0;
    w.diveT = -1;
    st.ball = {
      state: 'air', holder: null, x: w.x, y: w.y + 0.3, z: 1.5,
      vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: { x: w.x, y: w.y }, throwT: st.t,
      resolved: false, gave: false, power: 0.4,
    };
  });
  await page.keyboard.down('x');
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const st = (window as unknown as { __sandbox: { state: { ball: { holder: string | null }; players: { p1: { diveT: number } } } } }).__sandbox.state;
    return st.players.p1.diveT >= 0 || st.ball.holder === 'p1';
  });
  const freeDive = await page.evaluate(() => {
    const st = (window as unknown as { __sandbox: { state: { ball: { holder: string | null }; players: { p0: { diveT: number }; p1: { diveT: number } } } } }).__sandbox.state;
    return { dive: st.players.p1.diveT, holder: st.ball.holder, qbDive: st.players.p0.diveT };
  });
  console.log('free dive', JSON.stringify(freeDive));
  expect(freeDive.dive).toBeGreaterThanOrEqual(0);
  await page.keyboard.up('x');

  await page.evaluate(() => {
    const box = (window as unknown as { __sandbox: {
      setMode: (m: string) => void;
      S: { autoReset: boolean };
      state: {
        t: number;
        controlled: string;
        players: Record<string, { x: number; y: number; vx: number; vy: number; diveT: number; planted: unknown }>;
        ball: Record<string, unknown>;
      };
    } }).__sandbox;
    box.setMode('free');
    box.S.autoReset = false;
    const st = box.state;
    st.controlled = 'p1';
    const w = st.players.p1;
    w.x = 20;
    w.y = 50;
    w.vx = 0;
    w.vy = 0;
    w.diveT = -1;
    w.planted = null;
    st.ball = {
      state: 'air', holder: null, x: w.x, y: w.y + 8, z: 5,
      vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: { x: w.x, y: w.y }, throwT: st.t,
      resolved: false, gave: false, power: 0.4,
    };
  });
  await page.keyboard.down('v');
  await page.waitForFunction(() => !!(window as unknown as { __sandbox: { state: { players: { p1: { planted: unknown } } } } }).__sandbox.state.players.p1.planted);
  await page.evaluate(() => {
    const st = (window as unknown as { __sandbox: { state: {
      players: { p1: { planted: { x: number; y: number } | null } };
      ball: { x: number; y: number; z: number; vz: number; state: string; holder: string | null; resolved: boolean };
    } } }).__sandbox.state;
    const feet = st.players.p1.planted!;
    st.ball.x = feet.x + 0.2;
    st.ball.y = feet.y + 0.35;
    st.ball.z = 1.45;
    st.ball.vz = 0;
    st.ball.state = 'air';
    st.ball.holder = null;
    st.ball.resolved = false;
  });
  await page.keyboard.press('e');
  await page.waitForFunction(() => (window as unknown as { __sandbox: { state: { ball: { holder: string | null } } } }).__sandbox.state.ball.holder === 'p1', undefined, { timeout: 3000 });
  const freeToe = await page.evaluate(() => (window as unknown as { __sandbox: { state: { ball: { holder: string | null } } } }).__sandbox.state.ball.holder);
  console.log('free toe-tap holder', freeToe);
  expect(freeToe).toBe('p1');
  await page.keyboard.up('v');

  const real = errors.filter((e) => !/favicon/i.test(e));
  expect(real).toEqual([]);
});
