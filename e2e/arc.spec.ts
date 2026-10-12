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

test('local throw arc is a thin dotted preview, and other players see a fuzzy aim', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: { sim?: { step: () => void } } }).__sandbox?.sim);
  await quiet(page);

  await page.evaluate(() => {
    const box = window.__sandbox;
    box.S.timeScale = 0;
    box.S.autoReset = false;
    box.S.showReach = false;
    box.S.showArc = false;
    box.S.arcStyle = 'dotted';
    box.S.arcWidth = 0.35;
    box.S.arcOpacity = 0.55;
    box.S.fieldStyle = 'pixel';
    box.S.camStyle = 'all22';
    box.S.cameraFollow = 14;
    box.S.cameraMinExtent = 28;
    box.S.cameraPadding = 3;
    box.sim.setMode('throw');
    if (!box.sim._step) box.sim._step = box.sim.step;
    box.sim.step = () => {};
    const st = box.state;
    const qb = st.players.qb;
    Object.assign(qb, { x: 26, y: 32, vx: 0, vy: 0, facing: Math.PI / 2 });
    Object.assign(st.ball, { state: 'held', holder: 'qb', x: qb.x, y: qb.y, z: 0, vx: 0, vy: 0, vz: 0 });
    st.controlled = 'qb';
    st.play.phase = 'live';
    st.throwArm.phase = 'charge';
    st.throwArm.peak = 0;
    st.aimHint = null;
    window.__net!.setInput({ aim: { x: qb.x + 4, y: qb.y + 22 }, trigger: 0, stickHeld: true });
  });
  await page.waitForTimeout(700);
  const lob = await page.evaluate(() => {
    const view = window.__sandbox.view;
    return { loft: view?.previewLoft ?? -1, n: view?.preview?.length ?? 0, style: view?.arcStyle, fuzz: view?.aimFuzz };
  });
  expect(lob.loft).toBe(0);
  expect(lob.n).toBeGreaterThan(8);
  expect(lob.style).toBe('dotted');
  expect(lob.fuzz).toBeNull();
  await page.locator('#view canvas').screenshot({ path: `${OUT}/arc-lob.png` });

  await page.evaluate(() => {
    const box = window.__sandbox;
    box.S.camStyle = 'topdown';
  });
  await page.waitForTimeout(500);
  await page.locator('#view canvas').screenshot({ path: `${OUT}/arc-lob-topdown.png` });

  await page.evaluate(() => {
    const box = window.__sandbox;
    box.S.camStyle = 'all22';
    box.S.arcStyle = 'line';
  });
  await page.waitForTimeout(400);
  await page.locator('#view canvas').screenshot({ path: `${OUT}/arc-line.png` });

  await page.evaluate(() => {
    const box = window.__sandbox;
    box.S.arcStyle = 'dotted';
    const st = box.state;
    st.throwArm.phase = 'charge';
    st.throwArm.peak = 1;
    const qb = st.players.qb;
    window.__net!.setInput({ aim: { x: qb.x + 6, y: qb.y + 24 }, trigger: 1, stickHeld: true });
  });
  await page.waitForTimeout(400);
  const bullet = await page.evaluate(() => {
    const view = window.__sandbox.view;
    return { loft: view?.previewLoft ?? -1, n: view?.preview?.length ?? 0, fuzz: view?.aimFuzz, ring: view?.previewRing?.r ?? 0 };
  });
  expect(bullet.loft).toBe(1);
  expect(bullet.n).toBeGreaterThan(8);
  expect(bullet.fuzz).toBeNull();
  expect(bullet.ring).toBeLessThan(0.8);
  await page.locator('#view canvas').screenshot({ path: `${OUT}/arc-bullet.png` });

  await page.evaluate(() => { window.__net!.setInput(null); });

  await page.evaluate(() => {
    const box = window.__sandbox;
    if (box.sim._step) box.sim.step = box.sim._step;
    box.S.timeScale = 1;
    box.S.autoReset = false;
    box.S.catchWindup = 8;
    box.S.requireSnap = false;
    box.S.camStyle = 'all22';
    box.S.fieldStyle = 'pixel';
    box.S.showAimFuzz = true;
    box.S.aimFuzzRadius = 4;
    box.sim.setMode('catch');
    box.state.cm!.nextT = box.state.t;
  });
  await expect.poll(() => page.evaluate(() => window.__sandbox.state.cm?.phase), { timeout: 8000 }).toBe('windup');
  await expect.poll(() => page.evaluate(() => window.__sandbox.state.aimHint?.id ?? ''), { timeout: 4000 }).toBe('qb');
  await page.evaluate(() => {
    const box = window.__sandbox;
    if (!box.sim._step) box.sim._step = box.sim.step;
    box.sim.step = () => {};
    box.S.timeScale = 0;
  });
  await page.waitForTimeout(500);
  const offline = await page.evaluate(() => {
    const box = window.__sandbox;
    const view = box.view;
    const hint = box.state.aimHint;
    return {
      preview: view?.preview?.length ?? 0,
      fuzz: view?.aimFuzz,
      hint,
      color: box.state.players.qb.tint || 0xd32f2f,
    };
  });
  expect(offline.preview).toBe(0);
  expect(offline.fuzz).toBeTruthy();
  expect(offline.fuzz!.radius).toBeGreaterThanOrEqual(3);
  expect(offline.fuzz!.radius).toBeLessThanOrEqual(5);
  expect(offline.fuzz!.color).toBe(offline.color);
  expect(offline.hint!.id).toBe('qb');
  await page.locator('#view canvas').screenshot({ path: `${OUT}/fuzz-offline.png` });

  const host = await open(browser);
  const guest = await open(browser);
  try {
    await host.page.click('#net-open');
    await host.page.fill('#net-name', 'Host');
    await host.page.click('#net-host');
    await expect(host.page.locator('#net-code-label')).toHaveText(/^[A-Z2-9]{4}$/);
    const code = (await host.page.locator('#net-code-label').innerText()).trim();
    await join(guest.page, code, 'Receiver');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.some((p) => p.name === 'Receiver'))).toBe(true);
    await guest.page.selectOption('#net-slot', 'wr');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.find((p) => p.name === 'Receiver')?.slot)).toBe('wr');

    await host.page.evaluate(() => {
      const S = window.__sandbox.S;
      S.autoReset = false;
      S.requireSnap = false;
      S.showAimFuzz = true;
      S.aimFuzzRadius = 4;
      S.throwDefender = false;
    });
    await host.page.click('#net-start');
    await expect.poll(() => guest.page.evaluate(() => window.__net!.session.phase)).toBe('play');
    await quiet(guest.page);
    await guest.page.evaluate(() => {
      const S = window.__sandbox.S;
      S.camStyle = 'all22';
      S.fieldStyle = 'pixel';
      S.cameraFollow = 10;
      S.cameraMinExtent = 32;
      S.showReach = false;
    });

    const spot = await host.page.evaluate(() => {
      const w = window.__sandbox.state.players.wr;
      return { x: w.x + 1.3, y: w.y + 4.7 };
    });
    await host.page.evaluate((aim) => {
      window.__net!.setInput({ aim, trigger: 1, stickHeld: true, lt: true });
    }, spot);
    await expect.poll(() => guest.page.evaluate(() => window.__sandbox.view?.aimFuzz?.radius ?? 0), { timeout: 8000 }).toBeGreaterThanOrEqual(3);
    await expect.poll(() => host.page.evaluate(() => window.__sandbox.view?.previewLoft ?? -1)).toBe(1);

    const views = await guest.page.evaluate(() => {
      const view = window.__sandbox.view;
      const hint = window.__sandbox.state.aimHint;
      const qb = window.__sandbox.state.players.qb;
      return {
        preview: view?.preview?.length ?? 0,
        fuzz: view?.aimFuzz,
        hint,
        qbTint: qb.tint || 0xd32f2f,
      };
    });
    const hostView = await host.page.evaluate(() => ({
      fuzz: window.__sandbox.view?.aimFuzz,
      preview: window.__sandbox.view?.preview?.length ?? 0,
    }));
    expect(views.preview).toBe(0);
    expect(views.fuzz).toBeTruthy();
    expect(views.fuzz!.color).toBe(views.qbTint);
    expect(views.hint).toBeTruthy();
    const cell = 2;
    expect(Math.abs(views.hint!.x / cell - Math.round(views.hint!.x / cell))).toBeLessThan(1e-6);
    expect(Math.abs(views.hint!.y / cell - Math.round(views.hint!.y / cell))).toBeLessThan(1e-6);
    expect(Math.hypot(views.hint!.x - spot.x, views.hint!.y - spot.y)).toBeGreaterThan(0.05);
    expect(hostView.fuzz).toBeNull();
    expect(hostView.preview).toBeGreaterThan(8);
    await guest.page.locator('#view canvas').screenshot({ path: `${OUT}/fuzz-online.png` });

    const noise = [...errors, ...host.errors, ...guest.errors].filter(isRealError);
    expect(noise, noise.join('\n')).toEqual([]);
  } finally {
    await guest.ctx.close().catch(() => undefined);
    await host.ctx.close().catch(() => undefined);
  }
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
      setInput(partial: { aim?: { x: number; y: number }; trigger?: number; lt?: boolean; stickHeld?: boolean } | null): void;
      session: {
        phase: string;
        players: { name: string; slot: string }[];
      };
    };
    __sandbox: {
      S: Record<string, unknown>;
      sim: { setMode: (m: string) => void; step: () => void; _step?: () => void };
      state: {
        t: number;
        players: Record<string, { x: number; y: number; vx: number; vy: number; facing: number; tint?: number }>;
        ball: { state: string; holder: string | null; x: number; y: number; z: number; vx: number; vy: number; vz: number };
        controlled: string;
        play: { phase: string };
        throwArm: { phase: string; peak: number };
        aimHint: { x: number; y: number; id: string } | null;
        cm?: { phase: string; nextT: number };
      };
      view: {
        preview: unknown[] | null;
        previewLoft: number;
        previewRing: { r: number } | null;
        arcStyle: string;
        aimFuzz: { x: number; y: number; color: number; radius: number } | null;
      } | null;
    };
  }
}
