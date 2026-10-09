import http from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
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
    await host.page.click('#net-open');
    await host.page.fill('#net-name', 'Host');
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
    await host.page.click('#net-open');
    await host.page.fill('#net-name', 'Host');
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
        players: { name: string; slot: string; peerId: string }[];
        pushSettings(): void;
      };
    };
    __sandbox: {
      state: {
        play: { phase: string; t0: number };
        ball: { holder: string | null; state: string };
        players: Record<string, { x: number; y: number }>;
      };
      S: Record<string, number | string | boolean>;
      applyControlPreset(name: string): void;
    };
  }
}
