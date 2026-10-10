import { describe, expect, it } from 'vitest';
import { DEFAULTS, type Settings } from '../config/defaults';
import { HOME_Y, ROUTES, STEP, routeDef } from '../config/constants';
import { blankInput, createSim } from './sim';
import { mulberry32 } from './rng';
import type { SimInput } from './types';

const zeroRng = { random: () => 0 };

function sim(extra: Partial<Settings> = {}, rng = zeroRng) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, ...extra }, { rng });
}

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

function coverage(extra: Partial<Settings> = {}, rng = zeroRng) {
  const s = sim({ covSep: 99, covMaxHold: 99, ...extra }, rng);
  s.setMode('coverage');
  return s;
}

function airBall(x: number, y: number, t: number) {
  return {
    state: 'air' as const, holder: null, x, y, z: 1.4,
    vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, throwT: t,
    resolved: false, gave: false, power: 0.8,
  };
}

describe('coverage', () => {
  it('starts as a 1-on-1 with a route and snaps on A', () => {
    const s = coverage();
    const st = s.state;
    expect(st.mode).toBe('coverage');
    expect(st.controlled).toBe('df');
    expect(st.players.qb && st.players.wr && st.players.df).toBeTruthy();
    expect(ROUTES).toContain(st.route);
    expect(st.play.phase).toBe('pre');
    for (const name of ['post', 'corner', 'comeback', 'dig'] as const) {
      expect(s.routeWaypoints(name).length).toBeGreaterThan(1);
    }
    s.step(STEP, press({ a: true }));
    expect(st.play.phase).toBe('live');
    expect(st.ball.holder).toBe('qb');
  });

  it('lets the defender roam before the snap', () => {
    const s = coverage();
    const st = s.state;
    const dfY = st.players.df.y;
    const wrY = st.players.wr.y;
    for (let i = 0; i < 40; i++) s.step(STEP, press({ my: 1 }));
    expect(st.play.phase).toBe('pre');
    expect(st.players.df.y).toBeGreaterThan(dfY + 0.5);
    expect(st.players.wr.y).toBe(wrY);
  });

  it('switches control between the defender and the receiver', () => {
    const s = coverage();
    const st = s.state;
    expect(s.switchControl()).toBe(true);
    expect(st.controlled).toBe('wr');
    st.play.phase = 'live';
    st.play.snapT = st.t;
    const wrY = st.players.wr.y;
    for (let i = 0; i < 36; i++) s.step(STEP, press({ my: 1 }));
    expect(st.players.wr.y).toBeGreaterThan(wrY + 0.4);
    expect(s.switchControl()).toBe(true);
    expect(st.controlled).toBe('df');
    const dfY = st.players.df.y;
    for (let i = 0; i < 36; i++) s.step(STEP, press({ my: -1 }));
    expect(st.players.df.y).toBeLessThan(dfY - 0.4);
  });

  it('bats the ball into a PBU', () => {
    const s = coverage();
    const st = s.state;
    st.play.phase = 'live';
    const d = st.players.df;
    d.x = 20;
    d.y = 50;
    st.players.wr.x = 20;
    st.players.wr.y = 35;
    st.ball = airBall(d.x, d.y + 0.2, st.t);
    d.attempt = { type: 'bat', t0: st.t, win: 1, radius: 2 };
    s.step(STEP, blankInput());
    expect(st.play.phase).toBe('over');
    expect(st.play.result).toBe('PBU');
    expect(st.cov.pbus).toBe(1);
    expect(st.cov.last).toBe('PBU');
    expect(st.ball.holder).toBeNull();
  });

  it('intercepts and returns with the carrier controls', () => {
    const s = coverage();
    const st = s.state;
    st.play.phase = 'live';
    const d = st.players.df;
    d.x = 20;
    d.y = 50;
    d.facing = -Math.PI / 2;
    st.players.wr.x = 20;
    st.players.wr.y = 35;
    st.ball = airBall(d.x, d.y + 0.2, st.t);
    d.attempt = { type: 'two', t0: st.t, win: 1, radius: 2 };
    s.step(STEP, blankInput());
    expect(st.ball.holder).toBe('df');
    expect(st.stats.comp).toBe(0);
    expect(st.cov.ints).toBe(1);
    expect(st.carry?.goalSign).toBe(-1);
    expect(st.carry?.goalY).toBe(HOME_Y);
    expect(st.play.phase).toBe('live');
    const y0 = d.y;
    for (let i = 0; i < 24; i++) s.step(STEP, press({ my: -1 }));
    expect(d.y).toBeLessThan(y0 - 0.3);
    expect(st.carry!.yac).toBeGreaterThan(0.3);
    s.step(STEP, press({ my: -1, rs: { x: 1, y: 0 } }));
    expect(d.move?.type).toBe('sidestep');
  });

  it('completes to the receiver and keeps the defender for yards after the catch', () => {
    const s = coverage();
    const st = s.state;
    st.play.phase = 'live';
    const w = st.players.wr;
    w.x = 20;
    w.y = 50;
    w.vx = 0;
    w.vy = 0;
    st.ball = airBall(w.x, w.y + 0.2, st.t);
    w.attempt = { type: 'two', t0: st.t, win: 1, radius: 2 };
    s.step(STEP, blankInput());
    expect(st.ball.holder).toBe('wr');
    expect(st.stats.comp).toBe(1);
    expect(st.cov.catches).toBe(1);
    expect(st.carry?.goalSign).toBe(1);
    expect(st.carry?.goalY).toBe(110);
    expect(st.play.phase).toBe('live');
    expect(st.controlled).toBe('df');
    expect(st.players.df).toBeTruthy();
    for (let i = 0; i < 30; i++) s.step(STEP, blankInput());
    expect(st.carry!.yac).toBeGreaterThan(0.2);
  });

  it('flags a long arm-check without ending the play', () => {
    const s = coverage({ covArmRange: 40, covFlagTime: 0.25 });
    const st = s.state;
    st.play.phase = 'live';
    st.play.snapT = st.t;
    st.players.df.x = st.players.wr.x + 0.4;
    st.players.df.y = st.players.wr.y + 0.4;
    for (let i = 0; i < 40; i++) s.step(STEP, press({ lbHeld: true }));
    expect(st.cov.flags).toBe(1);
    expect(st.feedback?.text).toContain('FLAG');
    expect(st.play.phase).toBe('live');
    s.reset();
    expect(st.cov.flags).toBe(1);
  });

  it('has the bot quarterback throw off coverage and record separation', () => {
    const s = coverage({ covSep: 0, covMaxHold: 5 }, mulberry32(3));
    s.step(STEP, press({ a: true }));
    const snap = s.state.play.snapT ?? s.state.t;
    const floor = routeDef(s.state.route).minHold[0];
    for (let i = 0; i < 120 * 5 && s.state.ball.state !== 'air'; i++) s.step(STEP, blankInput());
    expect(s.state.ball.state).toBe('air');
    expect(s.state.ball.throwT - snap).toBeGreaterThanOrEqual(floor - 0.02);
    expect(s.state.cov.targets).toBe(1);
    expect(s.state.cov.lastSep).toBeGreaterThan(1);
    expect(s.state.stats.att).toBe(1);
  });

  it('holds a covered route until the max, then throws', () => {
    const s = createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, covSep: 2.5, covMaxHold: 2.6, covMinHold: 1 }, { rng: mulberry32(8) });
    s.setMode('coverage');
    s.state.route = 'hitch';
    s.reset(true);
    s.step(STEP, press({ a: true }));
    const snap = s.state.play.snapT ?? 0;
    let threw = -1;
    for (let i = 0; i < 120 * 6 && threw < 0; i++) {
      const wr = s.state.players.wr;
      const df = s.state.players.df;
      df.x = wr.x + 0.35;
      df.y = wr.y + 0.2;
      df.vx = 0;
      df.vy = 0;
      s.step(STEP, blankInput());
      if (s.state.ball.state === 'air') threw = s.state.ball.throwT - snap;
    }
    expect(threw).toBeGreaterThanOrEqual(routeDef('hitch').minHold[0] - 0.02);
    expect(threw).toBeGreaterThan(2);
    expect(threw).toBeLessThan(3.4);
  });

  it('logs 30 coverage throws and never beats the route minimum', () => {
    const s = createSim({ ...DEFAULTS, requireSnap: true, autoReset: false }, { rng: mulberry32(21) });
    s.setMode('coverage');
    const log: Record<string, number[]> = {};
    for (let n = 0; n < 30; n++) {
      const name = ROUTES[n % ROUTES.length];
      s.state.route = name;
      s.reset(true);
      s.state.controlled = 'df';
      s.step(STEP, press({ a: true }));
      const snap = s.state.play.snapT ?? s.state.t;
      let threw = -1;
      for (let i = 0; i < 120 * 6 && threw < 0; i++) {
        s.step(STEP, blankInput());
        if (s.state.ball.state === 'air') threw = s.state.ball.throwT - snap;
      }
      const floor = routeDef(name).minHold[0];
      expect(threw, name).toBeGreaterThanOrEqual(floor - 0.02);
      (log[name] = log[name] || []).push(+threw.toFixed(2));
    }
    const lines = ROUTES.map((name) => `${name} min ${routeDef(name).minHold[0].toFixed(1)}: ${(log[name] || []).join(', ')}`);
    console.log('coverage throws n=30\n' + lines.join('\n'));
  });

  it('uses the route clock in Throw mode when the human plays defense', () => {
    const s = createSim({ ...DEFAULTS, throwDefender: true, requireSnap: true, autoReset: false }, { rng: mulberry32(5) });
    s.state.route = 'slant';
    s.reset(true);
    s.state.controlled = 'df';
    s.step(STEP, press({ a: true }));
    const snap = s.state.play.snapT ?? 0;
    s.state.players.df.x = 2;
    s.state.players.df.y = 8;
    s.state.players.df.vx = 0;
    s.state.players.df.vy = 0;
    let threw = -1;
    for (let i = 0; i < 120 * 4 && threw < 0; i++) {
      s.step(STEP, blankInput());
      if (s.state.ball.state === 'air' || s.state.ball.throwT > snap) threw = s.state.ball.throwT - snap;
    }
    expect(threw).toBeGreaterThanOrEqual(routeDef('slant').minHold[0] - 0.02);
    expect(threw).toBeLessThan(1.7);
  });

  it('adds and removes the defender in Throw mode with the same outcomes', () => {
    const S: Settings = { ...DEFAULTS, throwDefender: false, requireSnap: true, autoReset: false };
    const s = createSim(S, { rng: zeroRng });
    expect(s.state.players.df).toBeUndefined();
    S.throwDefender = true;
    s.reset();
    expect(s.state.mode).toBe('throw');
    expect(s.state.players.df).toBeTruthy();
    expect(s.state.controlled).toBe('qb');
    const st = s.state;
    st.play.phase = 'live';
    st.controlled = 'df';
    const d = st.players.df;
    d.x = 18;
    d.y = 48;
    st.players.wr.x = 30;
    st.players.wr.y = 60;
    st.ball = airBall(d.x, d.y + 0.15, st.t);
    d.attempt = { type: 'bat', t0: st.t, win: 1, radius: 2 };
    s.step(STEP, blankInput());
    expect(st.play.result).toBe('PBU');
    expect(st.cov.pbus).toBe(1);
    S.throwDefender = false;
    s.reset();
    expect(s.state.players.df).toBeUndefined();
    expect(s.state.cov.pbus).toBe(1);
  });

  it('lines up press tighter than off, and shades inside or outside', () => {
    const off = coverage({ covAlign: 'off', covShade: 'inside' });
    const press = coverage({ covAlign: 'press', covShade: 'inside' });
    const outside = coverage({ covAlign: 'off', covShade: 'outside' });
    const gap = (x: ReturnType<typeof coverage>) => x.state.players.df.y - x.state.players.wr.y;
    expect(gap(press)).toBeLessThan(2);
    expect(gap(off)).toBeGreaterThan(4);
    expect(off.state.players.df.x).toBeGreaterThan(off.state.players.wr.x);
    expect(outside.state.players.df.x).toBeLessThan(outside.state.players.wr.x);
  });
});
