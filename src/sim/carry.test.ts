import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { blankInput, createSim } from './sim';
import type { SimInput } from './types';

const zeroRng = { random: () => 0 };

function sim(extra: Partial<typeof DEFAULTS> = {}) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, ...extra }, { rng: zeroRng });
}

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

/** Put the ball in the receiver's hands on the next step. */
function catchBall(s: ReturnType<typeof sim>, controlled: 'qb' | 'wr' = 'wr') {
  const st = s.state;
  st.controlled = controlled;
  st.play.phase = 'live';
  st.play.snapT = st.t;
  const w = st.players.wr;
  w.x = 20;
  w.y = 50;
  w.vx = 0;
  w.vy = 0;
  w.facing = Math.PI / 2;
  st.ball = {
    state: 'air', holder: null, x: w.x, y: w.y + 0.2, z: 1.4,
    vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, throwT: st.t,
    resolved: false, gave: false, power: 0.5,
  };
  w.attempt = { type: 'two', t0: st.t, win: 1, radius: 2 };
  s.step(STEP, blankInput());
  return w;
}

describe('after the catch', () => {
  it('keeps the play live, switches to the receiver, and accepts a carrier move', () => {
    const s = sim();
    const w = catchBall(s, 'qb');
    expect(s.state.ball.holder).toBe('wr');
    expect(s.state.play.phase).toBe('live');
    expect(s.state.carry).toBeTruthy();
    expect(s.state.carry?.goalLabel).toBe('TOUCHDOWN');
    expect(s.state.controlled).toBe('wr');
    expect(s.state.players.df).toBeTruthy();

    const run = press({ my: 1 });
    for (let i = 0; i < 20; i++) s.step(STEP, run);
    s.step(STEP, press({ my: 1, rs: { x: 1, y: 0 } }));
    expect(w.move?.type).toBe('sidestep');
    expect(s.state.carry!.yac).toBeGreaterThan(0.2);
  });

  it('leaves the QB in control when auto-switch is off and still runs the receiver', () => {
    const s = sim({ autoSwitchCarrier: false, throwPursuer: false });
    const w = catchBall(s, 'qb');
    const y0 = w.y;
    expect(s.state.controlled).toBe('qb');
    expect(s.state.players.df).toBeUndefined();
    for (let i = 0; i < 90; i++) s.step(STEP, blankInput());
    expect(w.y).toBeGreaterThan(y0 + 1);
    expect(s.state.carry!.yac).toBeGreaterThan(1);
  });

  it('lets the pursuer tackle and records yards after catch', () => {
    const s = sim({ wrapSuccess: 1, fumbleBase: 0, noLTTackleMult: 1, behindPenalty: 0, speedPenalty: 0 });
    const w = catchBall(s, 'wr');
    for (let i = 0; i < 30; i++) s.step(STEP, press({ my: 1 }));
    const yac = s.state.carry!.yac;
    expect(yac).toBeGreaterThan(0.5);
    const d = s.state.players.df;
    d.x = w.x;
    d.y = w.y + 0.4;
    d.facing = Math.PI / 2;
    d.tackle = { kind: 'wrap', t0: s.state.t, done: false };
    s.step(STEP, blankInput());
    expect(s.state.play.phase).toBe('over');
    expect(s.state.play.result).toBe('TACKLED');
    expect(s.state.stats.last).toBe('TACKLED');
    expect(s.state.stats.lastYac).toBeGreaterThan(0.5);
    expect(s.state.stats.yacTotal).toBeCloseTo(s.state.stats.lastYac, 5);
  });

  it('uses a target line in catch mode and counts YAC on the rep', () => {
    const s = sim({ catchPursuer: true, catchTargetYds: 20, wrapSuccess: 1, fumbleBase: 0, noLTTackleMult: 1, behindPenalty: 0, speedPenalty: 0 });
    s.setMode('catch');
    const st = s.state;
    const cm = st.cm!;
    cm.phase = 'air';
    cm.cur = {
      band: 'short', n: 1, d: 12, lob: false, speed: 20, loftDeg: 10,
      tgt: { x: 20, y: 55 }, landErr: 0, called: false, sideline: false, t: st.t,
    };
    const w = st.players.wr;
    w.x = 20; w.y = 50; w.facing = Math.PI / 2;
    st.ball = {
      state: 'air', holder: null, x: w.x, y: w.y + 0.2, z: 1.4,
      vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, throwT: st.t,
      resolved: false, gave: false, power: 0.5,
    };
    s.step(STEP, press({ y: true }));
    expect(st.ball.holder).toBe('wr');
    expect(cm.phase).toBe('carry');
    expect(st.carry?.goalY).toBeCloseTo(70, 5);
    expect(st.carry?.goalLabel).toBe('TARGET');
    expect(st.players.df).toBeTruthy();
    for (let i = 0; i < 15; i++) s.step(STEP, press({ my: 1 }));
    s.step(STEP, press({ my: 1, rs: { x: 1, y: 0 } }));
    expect(w.move?.type).toBe('sidestep');
    const d = st.players.df;
    d.x = w.x; d.y = w.y + 0.35; d.facing = Math.PI / 2;
    d.tackle = { kind: 'wrap', t0: st.t, done: false };
    s.step(STEP, blankInput());
    expect(cm.phase).toBe('wait');
    expect(cm.stats.comp).toBe(1);
    expect(cm.stats.last).toBe('TACKLED');
    expect(cm.cur?.yac).toBeGreaterThan(0);
    expect(cm.stats.yacTotal).toBeGreaterThan(0);
    expect(st.carry).toBeNull();
  });
});
