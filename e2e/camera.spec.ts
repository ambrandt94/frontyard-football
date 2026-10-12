import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const APP = 'http://127.0.0.1:5173/frontyard-football/';
const OUT = '/opt/cursor/artifacts/camera';

type Mark = { id: string; x: number; y: number; ok: boolean; px: number };
type FrameInfo = {
  rig: string;
  dist: number;
  lookX: number;
  lookY: number;
  qbPx: number;
  points: Mark[];
};

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test('All-22 frames every mode, and the other rigs still read', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(APP);
  await page.waitForFunction(() => !!(window as unknown as { __sandbox?: unknown }).__sandbox);
  const hide = page.locator('.help-hide');
  if (await hide.isVisible()) await hide.click();
  const guiOpen = await page.evaluate(() => {
    const root = document.querySelector('.lil-gui.lil-root');
    return !!root && !root.classList.contains('lil-closed');
  });
  if (guiOpen) await page.keyboard.press('g');
  await page.waitForTimeout(300);

  const rig = await page.evaluate(() => {
    const sb = (window as unknown as { __sandbox: { view: { cam: { rig: string } } | null } }).__sandbox;
    return sb.view?.cam.rig ?? '';
  });
  expect(rig).toBe('all22');

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.setMode('throw');
    w.__sandbox.sim.setLabels({ qb: { name: 'QB', tint: 0x1565c0 }, wr: { name: 'WR', tint: 0x2e7d32 } });
  });
  const snap = await grab(page, 'all22-throw-snap');
  expect(snap.rig).toBe('all22');
  expect(snap.points.some((p) => p.id === 'reticle')).toBe(true);
  const snapQb = snap.points.find((p) => p.id === 'qb');
  const snapRet = snap.points.find((p) => p.id === 'reticle');
  expect(snapRet && snapQb && snapRet.y < snapQb.y).toBe(true);

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.setMode('throw');
    w.__sandbox.sim.setLabels({ qb: { name: 'QB', tint: 0x1565c0 }, wr: { name: 'WR', tint: 0x2e7d32 } });
    const qb = w.__sandbox.state.players.qb;
    w.__sandbox.sim.doThrow({ x: qb.x, y: qb.y + 52 }, 0.18, false);
  });
  await page.waitForFunction(() => {
    const b = (window as unknown as SandboxWindow).__sandbox.state.ball;
    return b.state === 'air' && b.z > 6 && !!b.landing;
  });
  await page.waitForTimeout(350);
  const deep = await grab(page, 'all22-deep-throw');
  const deepQb = deep.points.find((p) => p.id === 'qb');
  const land = deep.points.find((p) => p.id === 'landing');
  const ball = deep.points.find((p) => p.id === 'ball');
  expect(land && deepQb && land.y < deepQb.y).toBe(true);
  expect(ball && land && ball.y < deepQb!.y).toBe(true);

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.setMode('coverage');
    w.__sandbox.sim.setLabels({
      qb: { name: 'QB', tint: 0x1565c0 },
      wr: { name: 'WR', tint: 0x2e7d32 },
      df: { name: 'CB', tint: 0xc62828 },
    });
  });
  const cov = await grab(page, 'all22-coverage');
  expect(cov.points.some((p) => p.id === 'df')).toBe(true);

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.setMode('run');
    const st = w.__sandbox.state;
    st.play.phase = 'pre';
    st.players.rb.x = 27;
    st.players.rb.y = 100;
    st.players.rb.vx = 0;
    st.players.rb.vy = 0;
    st.players.df.x = 31;
    st.players.df.y = 106;
    st.players.df.vx = 0;
    st.players.df.vy = 0;
    w.__sandbox.sim.setLabels({
      rb: { name: 'RB', tint: 0xf9a825 },
      df: { name: 'LB', tint: 0xc62828 },
    });
  });
  const run = await grab(page, 'all22-run-endzone', true);
  expect(run.points.some((p) => p.id === 'goal')).toBe(true);

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.sim.setRoster(5);
    w.__sandbox.setMode('free');
    w.__sandbox.sim.setLabels({
      p0: { name: 'You', tint: 0x1565c0 },
      p1: { name: 'A', tint: 0x2e7d32 },
      p2: { name: 'B', tint: 0xc62828 },
      p3: { name: 'C', tint: 0xf9a825 },
      p4: { name: 'D', tint: 0x6a1b9a },
    });
  });
  const around = await grab(page, 'all22-throw-around');
  expect(around.points.filter((p) => p.id.startsWith('p')).length).toBe(5);

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.S.camStyle = 'topdown';
    w.__sandbox.setMode('throw');
    w.__sandbox.sim.setLabels({ qb: { name: 'QB', tint: 0x1565c0 }, wr: { name: 'WR', tint: 0x2e7d32 } });
  });
  const top = await grab(page, 'topdown-throw-snap');
  expect(top.rig).toBe('topdown');

  await scene(page, () => {
    const w = window as unknown as SandboxWindow;
    w.__sandbox.S.camStyle = 'broadcast';
    w.__sandbox.setMode('throw');
    w.__sandbox.sim.setLabels({ qb: { name: 'QB', tint: 0x1565c0 }, wr: { name: 'WR', tint: 0x2e7d32 } });
    const qb = w.__sandbox.state.players.qb;
    w.__sandbox.sim.doThrow({ x: qb.x + 2, y: qb.y + 52 }, 0.18, false);
  });
  await page.waitForFunction(() => {
    const b = (window as unknown as SandboxWindow).__sandbox.state.ball;
    return b.state === 'air' && b.z > 6 && !!b.landing;
  });
  await page.waitForTimeout(500);
  const side = await grab(page, 'broadcast-deep-throw');
  expect(side.rig).toBe('broadcast');
  const sideQb = side.points.find((p) => p.id === 'qb');
  const sideLand = side.points.find((p) => p.id === 'landing');
  expect(sideLand && sideQb && sideLand.x > sideQb.x + 40).toBe(true);

  const real = errors.filter((e) => !/favicon/i.test(e));
  expect(real).toEqual([]);
});

async function scene(page: import('@playwright/test').Page, setup: () => void) {
  await page.evaluate(setup);
  await page.waitForTimeout(1400);
}

async function grab(page: import('@playwright/test').Page, name: string, goal = false): Promise<FrameInfo> {
  const info = await page.evaluate((wantGoal) => {
    const w = window as unknown as SandboxWindow;
    const sb = w.__sandbox;
    const view = sb.view;
    const st = sb.state;
    const r = sb.renderer;
    const canvas = document.querySelector('canvas')!.getBoundingClientRect();
    const inside = (s: { x: number; y: number }) =>
      s.x >= canvas.left + 6 && s.x <= canvas.right - 6 && s.y >= canvas.top + 6 && s.y <= canvas.bottom - 6;
    const points: Mark[] = [];
    const players = Object.values(st.players);
    for (const p of players) {
      const feet = r.fieldToScreen(p.x, p.y, 0.05);
      const head = r.fieldToScreen(p.x, p.y, 2.2);
      points.push({
        id: p.id,
        x: feet.x,
        y: feet.y,
        ok: inside(feet) && inside(head),
        px: Math.hypot(head.x - feet.x, head.y - feet.y),
      });
    }
    const b = st.ball;
    const bs = r.fieldToScreen(b.x, b.y, Math.max(b.z, 0.2));
    points.push({ id: 'ball', x: bs.x, y: bs.y, ok: inside(bs), px: 0 });
    if (b.landing && b.state === 'air') {
      const ls = r.fieldToScreen(b.landing.x, b.landing.y, 0.05);
      points.push({ id: 'landing', x: ls.x, y: ls.y, ok: inside(ls), px: 0 });
    }
    if (view?.reticle) {
      const rs = r.fieldToScreen(view.reticle.x, view.reticle.y, 0.05);
      points.push({ id: 'reticle', x: rs.x, y: rs.y, ok: inside(rs), px: 0 });
    }
    if (wantGoal && st.players.rb) {
      const gs = r.fieldToScreen(st.players.rb.x, 110, 0.05);
      points.push({ id: 'goal', x: gs.x, y: gs.y, ok: inside(gs), px: 0 });
    }
    const anchor = st.players.qb || st.players.rb || st.players.p0;
    const a0 = r.fieldToScreen(anchor.x, anchor.y, 0.05);
    const a1 = r.fieldToScreen(anchor.x, anchor.y, 2.2);
    return {
      rig: view?.cam.rig ?? '',
      dist: view?.cam.dist ?? 0,
      lookX: view?.cam.lookX ?? 0,
      lookY: view?.cam.lookY ?? 0,
      qbPx: Math.hypot(a1.x - a0.x, a1.y - a0.y),
      points,
    };
  }, goal);
  console.log(name, JSON.stringify({ rig: info.rig, dist: +info.dist.toFixed(1), look: [+info.lookX.toFixed(1), +info.lookY.toFixed(1)], qbPx: +info.qbPx.toFixed(1), points: info.points.map((p) => `${p.id}:${p.ok ? 'ok' : 'OFF'}@${p.x.toFixed(0)},${p.y.toFixed(0)} ${p.px.toFixed(0)}px`) }));
  for (const p of info.points) {
    expect(p.ok, `${name} ${p.id} is off screen at ${p.x.toFixed(0)},${p.y.toFixed(0)}`).toBe(true);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return info;
}

interface SandboxWindow {
  __sandbox: {
    S: { camStyle: string };
    setMode(mode: string): void;
    view: { cam: { rig: string; dist: number; lookX: number; lookY: number }; reticle: { x: number; y: number } | null } | null;
    renderer: { fieldToScreen(x: number, y: number, z?: number): { x: number; y: number } };
    sim: {
      doThrow(tgt: { x: number; y: number }, power: number, useError: boolean): void;
      setRoster(n: number): void;
      setLabels(labels: Record<string, { name: string; tint: number } | null>): void;
    };
    state: {
      play: { phase: string };
      ball: { state: string; x: number; y: number; z: number; landing: { x: number; y: number } | null };
      players: Record<string, { id: string; x: number; y: number; vx: number; vy: number }>;
    };
  };
}
