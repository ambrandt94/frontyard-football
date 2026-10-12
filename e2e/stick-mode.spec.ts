import fs from 'node:fs';
import http from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PeerServer } from 'peer';

const APP = 'http://127.0.0.1:5173/frontyard-football/';
const OUT = '/opt/cursor/artifacts';

let peerHttp: http.Server | undefined;

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  peerHttp = await new Promise((resolve) => {
    PeerServer({ port: 9000, path: '/peerjs' }, (server) => resolve(server));
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (!peerHttp) return resolve();
    peerHttp.close(() => resolve());
  });
});

test('stick mode, pitch window, and the controls card', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__sandbox?.sim);
  await quiet(page);

  await page.evaluate(() => {
    const box = window.__sandbox;
    box.S.timeScale = 0;
    box.S.autoReset = false;
    box.S.requireSnap = false;
    box.S.showReach = false;
    box.S.camStyle = 'all22';
    box.S.cameraFollow = 14;
    box.S.cameraMinExtent = 28;
    box.sim.setMode('throw');
    if (!box.sim._step) box.sim._step = box.sim.step;
    box.sim.step = () => {};
    const st = box.state;
    const qb = st.players.qb;
    Object.assign(qb, { x: 26, y: 40, vx: 0, vy: 0, facing: Math.PI / 2, stickMode: 'throw', pitchUntil: 0 });
    Object.assign(st.ball, { state: 'held', holder: 'qb', x: qb.x, y: qb.y, z: 1.5, vx: 0, vy: 0, vz: 0 });
    st.controlled = 'qb';
    st.play.phase = 'live';
    st.t = 10;
  });
  await page.waitForTimeout(400);
  await expect(page.locator('#mode-chip')).toHaveText('THROW');
  await expect(page.locator('#stick-mode b')).toHaveText('THROW');
  await page.screenshot({ path: `${OUT}/mode-throw.png` });

  await page.evaluate(() => {
    window.__sandbox.state.players.qb.stickMode = 'carry';
  });
  await page.waitForTimeout(200);
  await expect(page.locator('#mode-chip')).toHaveText('CARRY');
  await expect(page.locator('#stick-mode b')).toHaveText('CARRY');
  await page.screenshot({ path: `${OUT}/mode-carry.png` });

  await page.evaluate(() => {
    const st = window.__sandbox.state;
    st.players.qb.stickMode = 'throw';
    st.players.qb.pitchUntil = st.t + 0.4;
  });
  await page.waitForTimeout(200);
  await expect(page.locator('#pitch-chip')).toContainText('PITCH');
  await expect(page.locator('#stick-mode b')).toContainText('PITCH');
  await page.screenshot({ path: `${OUT}/pitch-window.png` });

  await page.evaluate(() => {
    window.__sandbox.state.players.qb.pitchUntil = 0;
  });
  await page.keyboard.press('h');
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('.help-sec[data-sec="qb"]')).toContainText('pitch window');
  await expect(page.locator('.help-sec[data-sec="qb"]')).toContainText('R3');
  await page.locator('#help').screenshot({ path: `${OUT}/controls-overlay.png` });
  await page.keyboard.press('h');

  const host = await open(browser);
  const guest = await open(browser);
  try {
    await host.page.click('#net-open');
    await host.page.fill('#net-name', 'Host');
    await host.page.click('#net-host');
    await expect(host.page.locator('#net-code-label')).toHaveText(/^[A-Z2-9]{4}$/);
    const code = (await host.page.locator('#net-code-label').innerText()).trim();
    await join(guest.page, code, 'Guest');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.some((p) => p.name === 'Guest'))).toBe(true);
    await host.page.evaluate(() => {
      const S = window.__sandbox.S;
      S.autoReset = false;
      S.requireSnap = false;
    });
    await host.page.click('#net-start');
    await expect.poll(() => guest.page.evaluate(() => window.__net!.session.phase)).toBe('play');
    await quiet(guest.page);
    await quiet(host.page);
    await host.page.evaluate(() => {
      const st = window.__sandbox.state;
      const qb = st.players.qb;
      qb.stickMode = 'carry';
      st.ball.holder = 'qb';
      st.ball.state = 'held';
    });
    await expect.poll(() => guest.page.locator('#mode-chip').textContent(), { timeout: 8000 }).toBe('CARRY');
    await expect.poll(() => guest.page.locator('#stick-mode b').textContent()).toContain('CARRY');
    await guest.page.screenshot({ path: `${OUT}/mode-online.png` });

    await host.page.evaluate(() => {
      const st = window.__sandbox.state;
      st.players.qb.stickMode = 'throw';
      st.players.qb.pitchUntil = st.t + 30;
    });
    await expect.poll(() => guest.page.locator('#pitch-chip').textContent(), { timeout: 8000 }).toContain('PITCH');
    await guest.page.screenshot({ path: `${OUT}/pitch-online.png` });
  } finally {
    await guest.ctx.close().catch(() => undefined);
    await host.ctx.close().catch(() => undefined);
  }

  const noise = errors.filter(isRealError);
  expect(noise, noise.join('\n')).toEqual([]);
});

async function quiet(page: Page) {
  const hide = page.locator('.help-hide');
  if (await hide.count() && await hide.isVisible()) await hide.click();
  await page.keyboard.press('g');
}

async function join(page: Page, code: string, name: string) {
  await page.click('#net-open');
  await page.fill('#net-name', name);
  await page.fill('#net-code', code);
  await page.click('#net-join');
  await expect(page.locator('#net-code-label')).toHaveText(code);
}

async function open(browser: Browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    window.__netSignal = { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false };
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__net && !!window.__sandbox);
  return { ctx, page, errors };
}

function isRealError(line: string) {
  if (/favicon/i.test(line)) return false;
  return true;
}

declare global {
  interface Window {
    __netSignal?: { host: string; port: number; path: string; secure: boolean };
    __net?: {
      session: { phase: string; players: { name: string; slot: string }[] };
    };
    __sandbox: {
      S: Record<string, number | boolean | string>;
      sim: { setMode: (m: string) => void; step: () => void; _step?: () => void };
      state: {
        t: number;
        mode: string;
        controlled: string;
        play: { phase: string };
        ball: { state: string; holder: string | null; x: number; y: number; z: number; vx: number; vy: number; vz: number };
        players: Record<string, { x: number; y: number; vx: number; vy: number; facing: number; stickMode: string; pitchUntil: number }>;
      };
    };
  }
}
