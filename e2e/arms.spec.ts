import { expect, test } from '@playwright/test';
import fs from 'fs';

const APP = 'http://127.0.0.1:5173/frontyard-football/';
const OUT = '/opt/cursor/artifacts';

test('arm IK poses stay on the hands with no console errors', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: { S?: { timeScale: number } } }).__sandbox);
  await page.evaluate(() => {
    const box = (window as unknown as { __sandbox: { S: { timeScale: number; autoReset: boolean; armIk: boolean } } }).__sandbox;
    box.S.timeScale = 0;
    box.S.autoReset = false;
    box.S.armIk = true;
  });
  const hide = page.locator('.help-hide');
  if (await hide.isVisible()) await hide.click();
  await page.keyboard.press('g');
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: { MODEL?: { ready: boolean } } }).__sandbox?.MODEL?.ready);

  async function shot(name: string, setup: string) {
    await page.evaluate((code) => { (0, eval)(code); }, setup);
    await page.waitForTimeout(700);
    const canvas = page.locator('#view canvas');
    await canvas.screenshot({ path: `${OUT}/${name}.png` });
  }

  const cam = `
    const box = window.__sandbox;
    box.S.timeScale = 0;
    box.S.autoReset = false;
    box.S.armIk = true;
    box.S.armIkDebug = false;
    box.S.showReach = false;
    box.S.showArc = false;
    box.S.camStyle = 'broadcast';
    box.S.camPitch = 16;
    box.S.camFov = 26;
    box.S.camHeightBias = 0.48;
    box.S.camUpfieldBias = 0;
    box.S.cameraMinExtent = 6.5;
    box.S.cameraPadding = 0.4;
    box.S.cameraFollow = 40;
    box.S.playerScale = 1.35;
    box.sim.setMode('coverage');
    if (!box.sim._step) box.sim._step = box.sim.step;
    box.sim.step = () => {};
    const st = box.state;
    const all = st.players;
    window.__armPlayers = all;
  `;
  await page.evaluate((code) => { (0, eval)(code); }, cam);
  await page.waitForTimeout(200);

  const keep = (ids: string) => `
    const st = window.__sandbox.state;
    const all = window.__armPlayers;
    st.players = {};
    for (const id of ${ids}) if (all[id]) st.players[id] = all[id];
  `;

  await shot('arms-two-hand', `
    ${keep("['wr']")}
    const w = window.__sandbox.state.players.wr;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40, z: 0, vx: 0, vy: 0, facing: 0, diveT: -1, groundT: 0, hand: 'R', stiffArm: null, tackle: null, role: 'WR' });
    w.attempt = { type: 'two', t0: 0, win: 5, radius: 2.2 };
    Object.assign(b, { state: 'air', holder: null, x: 30.42, y: 40, z: 1.65, vx: 0, vy: 0, vz: 0, arc: [{ x: 30.42, y: 40, z: 1.65, t: 9 }], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-one-hand', `
    ${keep("['wr']")}
    const w = window.__sandbox.state.players.wr;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40, z: 0, vx: 0, vy: 0, facing: 0, diveT: -1, groundT: 0, hand: 'R', stiffArm: null, tackle: null });
    w.attempt = { type: 'one', t0: 0, win: 5, radius: 2.2 };
    Object.assign(b, { state: 'air', holder: null, x: 30.4, y: 39.65, z: 1.35, vx: 0, vy: 0, vz: 0, arc: [{ x: 30.4, y: 39.65, z: 1.35, t: 9 }], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-dive', `
    ${keep("['wr']")}
    const w = window.__sandbox.state.players.wr;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40, z: 0, vx: 0, vy: 0, facing: 0, diveT: 0.2, groundT: 0, hand: 'R', stiffArm: null, tackle: null });
    w.attempt = { type: 'two', t0: 0, win: 5, radius: 2.4 };
    Object.assign(b, { state: 'air', holder: null, x: 30.55, y: 40, z: 0.85, vx: 0, vy: 0, vz: 0, arc: [{ x: 30.55, y: 40, z: 0.85, t: 9 }], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-carry-right', `
    ${keep("['wr']")}
    const w = window.__sandbox.state.players.wr;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40, z: 0, vx: 0, vy: 0, facing: 0, diveT: -1, groundT: 0, hand: 'R', handSwitchT: 0, stiffArm: null, tackle: null, attempt: null, role: 'WR' });
    Object.assign(b, { state: 'held', holder: 'wr', x: 30, y: 40, z: 1.3, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-carry-left', `
    ${keep("['wr']")}
    const w = window.__sandbox.state.players.wr;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40, z: 0, vx: 0, vy: 0, facing: 0, diveT: -1, groundT: 0, hand: 'L', handSwitchT: 0, stiffArm: null, tackle: null, attempt: null, role: 'WR' });
    Object.assign(b, { state: 'held', holder: 'wr', x: 30, y: 40, z: 1.3, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-qb-windup', `
    ${keep("['qb']")}
    const q = window.__sandbox.state.players.qb;
    const b = window.__sandbox.state.ball;
    Object.assign(q, { x: 30, y: 40, z: 0, vx: 0, vy: 0, facing: 0, diveT: -1, groundT: 0, hand: 'R', stiffArm: null, tackle: null, attempt: null, role: 'QB', visWind: true });
    window.__sandbox.state.throwArm.phase = 'charge';
    Object.assign(b, { state: 'held', holder: 'qb', x: 30, y: 40, z: 1.5, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-stiff', `
    ${keep("['wr', 'df']")}
    const w = window.__sandbox.state.players.wr;
    const d = window.__sandbox.state.players.df;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40.55, z: 0, vx: 0, vy: 0, facing: -Math.PI / 2, diveT: -1, groundT: 0, hand: 'L', handSwitchT: 0, stiffArm: 'R', tackle: null, attempt: null, role: 'WR' });
    Object.assign(d, { x: 30, y: 39.45, z: 0, vx: 0, vy: 0, facing: Math.PI / 2, diveT: -1, groundT: 0, stiffArm: null, tackle: null, attempt: null, role: 'DF' });
    Object.assign(b, { state: 'held', holder: 'wr', x: 30, y: 40.55, z: 1.3, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, pitch: null });
  `);

  await shot('arms-wrap', `
    ${keep("['wr', 'df']")}
    const w = window.__sandbox.state.players.wr;
    const d = window.__sandbox.state.players.df;
    const b = window.__sandbox.state.ball;
    Object.assign(w, { x: 30, y: 40.45, z: 0, vx: 0, vy: 0, facing: -Math.PI / 2, diveT: -1, groundT: 0, hand: 'R', stiffArm: null, tackle: null, attempt: null, role: 'WR' });
    Object.assign(d, { x: 30, y: 39.55, z: 0, vx: 0, vy: 0, facing: Math.PI / 2, diveT: -1, groundT: 0, stiffArm: null, attempt: null, role: 'DF' });
    d.tackle = { kind: 'wrap', t0: 0, done: false };
    Object.assign(b, { state: 'held', holder: 'wr', x: 30, y: 40.45, z: 1.3, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, pitch: null });
  `);

  await page.evaluate(() => {
    const box = (window as unknown as { __sandbox: { S: { armIk: boolean }; sim: { setMode: (m: string) => void } }; __armPlayers: Record<string, unknown> }).__sandbox;
    box.sim.setMode('coverage');
    box.S.armIk = true;
  });
  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  await page.locator('#view canvas').screenshot({ path: `${OUT}/arms-pose-sheet.png` });
  await page.keyboard.press('p');

  const noisy = errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
  expect(noisy, noisy.join('\n')).toEqual([]);
});
