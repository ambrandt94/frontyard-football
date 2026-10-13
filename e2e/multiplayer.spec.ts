import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { installTestProfile, useName } from './profile';
import { PeerServer } from 'peer';

const APP = 'http://127.0.0.1:5173/frontyard-football/';

let peerHttp: http.Server | undefined;

test.beforeAll(async () => {
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

test('host and two clients play a pass, then a disconnect falls back to AI', async ({ browser }) => {
  const host = await open(browser);
  const wr = await open(browser);
  const spec = await open(browser);
  try {
    await useName(host.page, 'Host');
    await host.page.click('#net-open');
    await host.page.click('#net-host');
    await expect(host.page.locator('#net-code-label')).toHaveText(/^[A-Z2-9]{4}$/);
    const code = (await host.page.locator('#net-code-label').innerText()).trim();

    await join(wr.page, code, 'Catcher');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.some((p) => p.name === 'Catcher'))).toBe(true);
    await wr.page.selectOption('#net-slot', 'wr');
    await join(spec.page, code, 'Watcher');

    await expect.poll(() => host.page.evaluate(() => {
      const seats = window.__net!.session.players;
      return seats.map((p) => p.name).sort().join(',');
    })).toBe('Catcher,Host,Watcher');
    await expect.poll(() => host.page.evaluate(() => {
      const seats = window.__net!.session.players;
      return seats.find((p) => p.name === 'Catcher')?.slot;
    })).toBe('wr');

    await host.page.evaluate(() => {
      const S = window.__sandbox.S;
      S.baseInaccuracy = 0;
      S.unsquaredInaccuracy = 1;
      S.autoReset = false;
      S.throwPursuer = false;
      S.requireSnap = true;
      S.catchWindowMs = 4000;
      S.catchReach = 2.4;
      S.aiTimingErrorMs = 0;
    });
    await host.page.click('#net-start');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.phase)).toBe('play');
    await expect.poll(() => wr.page.evaluate(() => window.__net!.session.phase)).toBe('play');
    await expect.poll(() => spec.page.evaluate(() => window.__net!.session.phase)).toBe('play');

    await host.page.evaluate(() => window.__net!.setInput({ a: true }));
    await expect.poll(() => host.page.evaluate(() => window.__sandbox.state.play.phase)).toBe('live');
    await host.page.evaluate(() => window.__net!.setInput(null));

    const y0 = await host.page.evaluate(() => window.__sandbox.state.players.wr.y);
    await wr.page.evaluate(() => window.__net!.setInput({ my: 1 }));
    await expect.poll(() => host.page.evaluate(() => window.__sandbox.state.players.wr.y), { timeout: 8000 }).toBeGreaterThan(y0 + 2);
    await expect.poll(() => wr.page.evaluate(() => window.__sandbox.state.players.wr.y)).toBeGreaterThan(y0 + 1.5);
    const hostY = await host.page.evaluate(() => window.__sandbox.state.players.wr.y);
    const clientY = await wr.page.evaluate(() => window.__sandbox.state.players.wr.y);
    expect(Math.abs(hostY - clientY)).toBeLessThan(3);

    await wr.page.evaluate(() => window.__net!.setInput({ my: 0, y: true }));
    const aim = await host.page.evaluate(() => {
      const w = window.__sandbox.state.players.wr;
      return { x: w.x, y: w.y };
    });
    await host.page.evaluate((spot) => {
      window.__net!.setInput({ aim: spot, throwPower: 0.55, lt: true });
    }, aim);
    await expect.poll(() => host.page.evaluate(() => window.__sandbox.state.ball.holder), { timeout: 12000 }).toBe('wr');
    await expect.poll(() => wr.page.evaluate(() => window.__sandbox.state.ball.holder)).toBe('wr');
    await expect.poll(() => spec.page.evaluate(() => window.__sandbox.state.ball.holder)).toBe('wr');
    expect(await host.page.evaluate(() => window.__sandbox.state.play.phase)).not.toBe('over');

    const carried = await host.page.evaluate(() => window.__sandbox.state.players.wr.y);
    const wrErrors = [...wr.errors];
    await wr.ctx.close();
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.some((p) => p.slot === 'wr'))).toBe(false);
    await expect.poll(() => host.page.evaluate(() => window.__sandbox.state.players.wr.y), { timeout: 8000 }).toBeGreaterThan(carried + 1);

    const noise = [...host.errors, ...spec.errors, ...wrErrors].filter(isRealError);
    expect(noise, noise.join('\n')).toEqual([]);
  } finally {
    await wr.ctx.close().catch(() => undefined);
    await host.ctx.close().catch(() => undefined);
    await spec.ctx.close().catch(() => undefined);
  }
});

test('a client cannot change host tuning, and a host change arrives', async ({ browser }) => {
  const host = await open(browser);
  const guest = await open(browser);
  try {
    await useName(host.page, 'Host');
    await host.page.click('#net-open');
    await host.page.click('#net-host');
    await expect(host.page.locator('#net-code-label')).toHaveText(/^[A-Z2-9]{4}$/);
    const code = (await host.page.locator('#net-code-label').innerText()).trim();
    await join(guest.page, code, 'Guest');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.some((p) => p.name === 'Guest'))).toBe(true);
    await expect.poll(() => guest.page.evaluate(() => window.__net!.session.status)).toContain('Connected');

    await expect(guest.page.locator('.host-lock-note')).toHaveText('Host controls this');
    await expect.poll(() => guest.page.evaluate(() => {
      const accel = [...document.querySelectorAll('.lil-controller')].find((el) => el.textContent?.includes('accel (yd/s'));
      const dead = [...document.querySelectorAll('.lil-controller')].find((el) => el.textContent?.includes('deadzone'));
      return !!accel?.classList.contains('lil-disabled') && !!dead && !dead.classList.contains('lil-disabled');
    })).toBe(true);

    const before = await host.page.evaluate(() => window.__sandbox.S.accel);
    await guest.page.evaluate(() => {
      window.__sandbox.S.accel = 99;
      window.__net!.session.pushSettings();
    });
    await host.page.waitForTimeout(200);
    expect(await host.page.evaluate(() => window.__sandbox.S.accel)).toBe(before);

    await host.page.evaluate(() => {
      window.__sandbox.S.accel = 21;
      window.__sandbox.S.deadzone = 0.42;
      window.__net!.session.pushSettings();
    });
    await expect.poll(() => guest.page.evaluate(() => window.__sandbox.S.accel)).toBe(21);
    expect(await guest.page.evaluate(() => window.__sandbox.S.deadzone)).toBe(0.15);
    await guest.page.evaluate(() => { window.__sandbox.S.deadzone = 0.33; });
    expect(await host.page.evaluate(() => window.__sandbox.S.deadzone)).toBe(0.42);

    await host.page.evaluate(() => {
      window.__sandbox.applyControlPreset('Arcade Snappy');
      window.__net!.session.pushSettings();
    });
    await expect.poll(() => guest.page.evaluate(() => window.__sandbox.S.accel)).toBe(72);
    expect(await guest.page.evaluate(() => window.__sandbox.S.deadzone)).toBe(0.33);

    const noise = [...host.errors, ...guest.errors].filter(isRealError);
    expect(noise, noise.join('\n')).toEqual([]);
  } finally {
    await guest.ctx.close().catch(() => undefined);
    await host.ctx.close().catch(() => undefined);
  }
});

test('throw around keeps names and rings through passes and mode changes', async ({ browser }) => {
  test.setTimeout(180000);
  const host = await open(browser);
  const catcher = await open(browser);
  const dee = await open(browser);
  const pages = [host.page, catcher.page, dee.page];
  const kits = {
    Host: { jersey: 0xd32f2f, pants: 0xf2f2f2, helmet: 0x212121, skin: 'dark' },
    Catcher: { jersey: 0x2e7d32, pants: 0xf5f5f5, helmet: 0x212121, skin: 'light' },
    Dee: { jersey: 0xf9a825, pants: 0x1e63c9, helmet: 0xf5f5f5, skin: 'dark' },
  };
  try {
    await host.page.evaluate((look) => window.__net!.session.setLook(look), kits.Host);
    await catcher.page.evaluate((look) => window.__net!.session.setLook(look), kits.Catcher);
    await dee.page.evaluate((look) => window.__net!.session.setLook(look), kits.Dee);

    await useName(host.page, 'Host');
    await host.page.click('#net-open');
    await host.page.click('#net-host');
    await expect(host.page.locator('#net-code-label')).toHaveText(/^[A-Z2-9]{4}$/);
    const code = (await host.page.locator('#net-code-label').innerText()).trim();
    await host.page.evaluate(() => {
      window.__net!.session.setMode('free');
      window.__net!.session.setFreeCount(3);
    });

    await join(catcher.page, code, 'Catcher');
    await join(dee.page, code, 'Dee');
    await expect.poll(() => catcher.page.locator('#net-slot option[value="p1"]').count()).toBe(1);
    await expect.poll(() => dee.page.locator('#net-slot option[value="p2"]').count()).toBe(1);
    await catcher.page.selectOption('#net-slot', 'p1');
    await dee.page.selectOption('#net-slot', 'p2');
    await expect.poll(() => host.page.evaluate(() => window.__net!.session.players.map((p) => p.slot).sort().join(','))).toBe('p0,p1,p2');
    await expect(catcher.page.locator('#net-wait')).toHaveText('Waiting for host');
    await expect(catcher.page.locator('#net-start')).toBeHidden();
    await shot(host.page, '#lobby .card', 'lobby-card');

    await host.page.evaluate(() => {
      const S = window.__sandbox.S;
      S.baseInaccuracy = 0;
      S.unsquaredInaccuracy = 1;
      S.catchWindowMs = 4000;
      S.catchReach = 6;
      S.aiTimingErrorMs = 0;
      S.throwVarianceDeg = 0;
    });
    await host.page.click('#net-start');
    for (const page of pages) {
      await expect.poll(() => page.evaluate(() => window.__net!.session.phase)).toBe('play');
      await page.evaluate(() => window.__net!.setInput({ mx: 0, my: 0, y: true }));
    }
    await expectRoster(pages, [
      { name: 'Host', slot: 'p0', tint: kits.Host.jersey },
      { name: 'Catcher', slot: 'p1', tint: kits.Catcher.jersey },
      { name: 'Dee', slot: 'p2', tint: kits.Dee.jersey },
    ]);
    await expect(host.page.locator('.roster-chip')).toHaveCount(3);

    const order = ['p1', 'p2', 'p0', 'p1', 'p2', 'p0', 'p1', 'p2', 'p0', 'p1'];
    for (const target of order) {
      await host.page.evaluate((id) => {
        const st = window.__sandbox.state as unknown as {
          t: number;
          ball: { state: string; holder: string | null; x: number; y: number; z: number; vx: number; vy: number; vz: number; resolved: boolean; gave: boolean; aimed: { x: number; y: number } | null };
          players: Record<string, { x: number; y: number; attempt: { type: string; t0: number; win: number; radius: number } | null; wasIn: boolean; dropPending: boolean; blockedPass: boolean; lateUntil: number; cooldownUntil: number }>;
        };
        const p = st.players[id];
        const b = st.ball;
        b.state = 'air';
        b.holder = null;
        b.resolved = false;
        b.gave = false;
        b.x = p.x;
        b.y = p.y;
        b.z = 1.15;
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        b.aimed = { x: p.x, y: p.y };
        p.wasIn = false;
        p.dropPending = false;
        p.blockedPass = false;
        p.lateUntil = 0;
        p.cooldownUntil = 0;
        p.attempt = { type: 'two', t0: st.t, win: 1.5, radius: 2.5 };
      }, target);
      await expect.poll(() => host.page.evaluate(() => window.__sandbox.state.ball.holder), { timeout: 8000 }).toBe(target);
      await expect.poll(() => catcher.page.evaluate(() => window.__sandbox.state.ball.holder)).toBe(target);
      await expect.poll(() => dee.page.evaluate(() => window.__sandbox.state.ball.holder)).toBe(target);
      await expectRoster(pages, [
        { name: 'Host', slot: 'p0', tint: kits.Host.jersey },
        { name: 'Catcher', slot: 'p1', tint: kits.Catcher.jersey },
        { name: 'Dee', slot: 'p2', tint: kits.Dee.jersey },
      ]);
    }

    await host.page.evaluate(() => window.__sandbox.setMode('throw'));
    await expectRoster(pages, [
      { name: 'Host', slot: 'qb', tint: kits.Host.jersey },
      { name: 'Catcher', slot: 'wr', tint: kits.Catcher.jersey },
      { name: 'Dee', slot: 'df', tint: kits.Dee.jersey },
    ]);
    await host.page.evaluate(() => window.__sandbox.setMode('free'));
    await expectRoster(pages, [
      { name: 'Host', slot: 'p0', tint: kits.Host.jersey },
      { name: 'Catcher', slot: 'p1', tint: kits.Catcher.jersey },
      { name: 'Dee', slot: 'p2', tint: kits.Dee.jersey },
    ]);

    const purple = { jersey: 0xab47bc, pants: 0x212121, helmet: 0xf5f5f5, skin: 'dark' as const };
    await catcher.page.evaluate((look) => window.__net!.session.setLook(look), purple);
    await expect.poll(() => host.page.evaluate(() => window.__sandbox.state.players.p1?.tint)).toBe(purple.jersey);
    await expect.poll(() => dee.page.evaluate(() => window.__sandbox.state.players.p1?.look?.jersey)).toBe(purple.jersey);
    const teal = { jersey: 0x00897b, pants: 0xf2f2f2, helmet: 0xf5f5f5, skin: 'light' as const };
    await host.page.evaluate((look) => window.__net!.session.setLook(look), teal);
    await expect.poll(() => catcher.page.evaluate(() => window.__sandbox.state.players.p0?.tint)).toBe(teal.jersey);
    await expect.poll(() => dee.page.evaluate(() => {
      const seat = window.__net!.session.players.find((p) => p.name === 'Host');
      return seat?.look?.jersey;
    })).toBe(teal.jersey);

    for (const page of pages) {
      await page.evaluate(() => window.__net!.setInput({ mx: 0, my: 0, y: false, rt: false, a: false, x: false, b: false }));
    }
    await host.page.evaluate(() => {
      const st = window.__sandbox.state as unknown as {
        ball: { state: string; holder: string | null; x: number; y: number; z: number; vx: number; vy: number; vz: number; aimed: { x: number; y: number } | null };
        players: Record<string, { x: number; y: number; z: number; vx: number; vy: number; facing: number; move: unknown }>;
      };
      const place = (id: string, x: number, y: number) => {
        const p = st.players[id];
        p.x = x;
        p.y = y;
        p.z = 0;
        p.vx = 0;
        p.vy = 0;
        p.facing = 0;
        p.move = null;
      };
      place('p0', 26, 58.6);
      place('p1', 26, 62.2);
      place('p2', 27.2, 60.4);
      const b = st.ball;
      b.state = 'held';
      b.holder = 'p2';
      b.aimed = null;
      b.x = 27.2;
      b.y = 60.4;
      b.z = 1.1;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      const S = window.__sandbox.S;
      S.camStyle = 'broadcast';
      S.cameraMinExtent = 10;
      S.cameraPadding = 0.8;
      S.cameraFollow = 18;
      S.camUpfieldBias = 0;
      S.camHeightBias = 1;
      S.playerScale = 1.85;
      const gui = document.querySelector('.lil-gui');
      if (gui && !gui.classList.contains('lil-closed')) gui.querySelector('.title')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await host.page.waitForTimeout(2000);
    await expect(host.page.locator('.roster-chip')).toHaveCount(3);
    const vp = host.page.viewportSize() ?? { width: 1280, height: 720 };
    await shotClip(host.page, 'roster-chips', {
      x: Math.max(0, vp.width - 460),
      y: 0,
      width: Math.min(460, vp.width),
      height: 120,
    });
    await shot(host.page, '#view', 'custom-players');

    const noise = [...host.errors, ...catcher.errors, ...dee.errors].filter(isRealError);
    expect(noise, noise.join('\n')).toEqual([]);
  } finally {
    await host.ctx.close().catch(() => undefined);
    await catcher.ctx.close().catch(() => undefined);
    await dee.ctx.close().catch(() => undefined);
  }
});

async function expectRoster(pages: Page[], expected: { name: string; slot: string; tint: number }[]) {
  const want = [...expected].sort((a, b) => a.name.localeCompare(b.name));
  for (const page of pages) {
    await expect.poll(() => page.evaluate(() => {
      const seats = window.__net!.session.players.filter((p) => p.slot);
      const html = (document.getElementById('floaters')?.innerHTML || '').toLowerCase();
      const rows = seats.map((s) => {
        const body = window.__sandbox.state.players[s.slot];
        return { name: s.name, slot: s.slot, body: body?.name || '', tint: body?.tint ?? 0 };
      }).sort((a, b) => a.name.localeCompare(b.name));
      const platesOk = rows.every((r) => html.includes(r.name.toLowerCase()) && html.includes('#' + r.tint.toString(16).padStart(6, '0')));
      return { rows, platesOk };
    })).toEqual({
      rows: want.map((e) => ({ name: e.name, slot: e.slot, body: e.name, tint: e.tint })),
      platesOk: true,
    });
  }
}

async function shotClip(page: Page, name: string, clip: { x: number; y: number; width: number; height: number }) {
  const file = path.join('test-results', `${name}.png`);
  await page.screenshot({ path: file, clip });
  try {
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    fs.copyFileSync(file, path.join('/opt/cursor/artifacts', `${name}.png`));
  } catch { /* the artifacts directory is optional */ }
}

async function shot(page: Page, selector: string, name: string) {
  const file = path.join('test-results', `${name}.png`);
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error('no box for ' + selector);
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.max(1, Math.min(vp.width - x, Math.ceil(box.width)));
  const height = Math.max(1, Math.min(vp.height - y, Math.ceil(box.height)));
  await page.screenshot({ path: file, clip: { x, y, width, height } });
  try {
    fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
    fs.copyFileSync(file, path.join('/opt/cursor/artifacts', `${name}.png`));
  } catch { /* the artifacts directory is optional */ }
}

async function join(page: Page, code: string, name: string) {
  await useName(page, name);
  await page.click('#net-open');
  await page.fill('#net-code', code);
  await page.click('#net-join');
  await expect(page.locator('#net-code-label')).toHaveText(code);
}

async function open(browser: Browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    window.__netSignal = { host: '127.0.0.1', port: 9000, path: '/peerjs', secure: false };
  });
  await ctx.addInitScript(installTestProfile);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto(APP);
  await page.waitForFunction(() => !!window.__net && !!window.__sandbox);
  return { ctx, page, errors };
}

function isRealError(line: string) {
  if (/favicon/i.test(line)) return false;
  if (/Failed to load resource/i.test(line) && /favicon/i.test(line)) return false;
  return true;
}

declare global {
  interface Window {
    __netSignal?: { host: string; port: number; path: string; secure: boolean };
    __net?: {
      setInput(partial: Record<string, unknown> | null): void;
      session: {
        phase: string;
        roomCode: string;
        players: { name: string; slot: string; peerId: string; look?: { jersey: number } }[];
        pushSettings(): void;
        setMode(mode: string): void;
        setFreeCount(n: number): void;
        setLook(look: { jersey: number; pants: number; helmet: number; skin: string }): void;
      };
    };
    __sandbox: {
      state: {
        mode: string;
        play: { phase: string; t0: number };
        ball: { holder: string | null; state: string; aimed: { x: number; y: number } | null; x: number; y: number; z: number };
        feedback: { text: string } | null;
        players: Record<string, { x: number; y: number; name?: string; tint?: number; look?: { jersey: number } }>;
      };
      S: Record<string, number | string | boolean>;
      setMode(mode: string): void;
      sim: { doThrow(tgt: { x: number; y: number }, power: number, useError: boolean, errScale?: number, style?: string): void };
      applyControlPreset(name: string): void;
    };
  }
}
