import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { createSim } from './sim';
import { blankInput, type SimInput } from './types';

const quiet = { random: () => 0.99 };

function sim(extra: Partial<typeof DEFAULTS> = {}) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, oneHandSuccess: 1, ...extra }, { rng: quiet });
}

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

function putInAir(s: ReturnType<typeof sim>, x: number, y: number) {
  const st = s.state;
  st.play.phase = 'live';
  st.play.snapT = st.t;
  st.ball = {
    state: 'air', holder: null, x, y, z: 1.4,
    vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: { x, y }, throwT: st.t,
    resolved: false, gave: false, power: 0.4,
  };
}

describe('receiver kit in catch and throw around', () => {
  it('matches throw mode in catch: dive, toe-tap, jump, and snap A stays pre-snap', () => {
    const s = sim();
    s.setMode('catch');
    const st = s.state;
    const w = st.players.wr;
    st.cm!.phase = 'wait';
    st.cm!.readyT = st.t + 5;
    s.step(STEP, press({ a: true }));
    expect(st.cm!.phase).toBe('wait');
    expect(w.jumpT).toBe(-1);

    st.cm!.readyT = st.t - 1;
    s.step(STEP, press({ a: true }));
    expect(st.cm!.phase).toBe('windup');
    expect(w.jumpT).toBe(-1);

    st.cm!.phase = 'air';
    putInAir(s, w.x, w.y);
    s.step(STEP, press({ x: true, my: 1 }));
    expect(w.diveT).toBeGreaterThanOrEqual(0);

    const s2 = sim();
    s2.setMode('catch');
    const w2 = s2.state.players.wr;
    s2.state.cm!.phase = 'air';
    putInAir(s2, w2.x + 0.2, w2.y + 0.4);
    s2.step(STEP, press({ a: true }));
    expect(w2.jumpT).toBe(0);
    s2.step(STEP, press({ lt: true }));
    expect(w2.squared).toBe(true);

    const s3 = sim();
    s3.setMode('catch');
    const w3 = s3.state.players.wr;
    w3.x = 2;
    w3.y = 40;
    s3.state.cm!.phase = 'air';
    for (let i = 0; i < 8; i++) s3.step(STEP, press({ rbHeld: true, my: 1 }));
    expect(w3.planted).toBeTruthy();
    putInAir(s3, w3.planted!.x + 0.2, w3.planted!.y + 0.3);
    s3.step(STEP, press({ rbHeld: true, y: true }));
    expect(s3.state.ball.holder).toBe('wr');
    expect(s3.state.stats.last).toBe('CATCH');

    const s4 = sim();
    s4.setMode('catch');
    const w4 = s4.state.players.wr;
    w4.x = 0.4;
    w4.y = 40;
    s4.state.cm!.phase = 'air';
    s4.step(STEP, press({ rbHeld: true }));
    expect(w4.planted).toBeTruthy();
    w4.planted!.x = -0.4;
    putInAir(s4, w4.planted!.x + 0.15, w4.planted!.y);
    s4.step(STEP, press({ rbHeld: true, y: true }));
    expect(s4.state.ball.holder).not.toBe('wr');
    expect(s4.state.stats.last).toBe('OUT OF BOUNDS');
  });

  it('gives throw-around receivers the kit and the holder the quarterback and carrier moves', () => {
    const s = sim();
    s.setMode('free');
    const st = s.state;
    st.controlled = 'p1';
    const mate = st.players.p1;
    const qb = st.players.p0;
    expect(st.ball.holder).toBe('p0');
    putInAir(s, mate.x, mate.y);
    s.step(STEP, press({ x: true, my: 1 }));
    expect(mate.diveT).toBeGreaterThanOrEqual(0);
    expect(qb.diveT).toBeLessThan(0);

    const s2 = sim();
    s2.setMode('free');
    s2.state.controlled = 'p1';
    const wr = s2.state.players.p1;
    wr.x = 8;
    wr.y = 40;
    for (let i = 0; i < 6; i++) s2.step(STEP, press({ rbHeld: true, my: 1 }));
    expect(wr.planted).toBeTruthy();
    putInAir(s2, wr.planted!.x + 0.15, wr.planted!.y + 0.2);
    s2.step(STEP, press({ rbHeld: true, y: true }));
    expect(s2.state.ball.holder).toBe('p1');
    s2.step(STEP, press({ a: true }));
    expect(wr.jumpH).toBe(DEFAULTS.hurdleHeight);

    const s3 = sim();
    s3.setMode('free');
    s3.state.controlled = 'p1';
    const edge = s3.state.players.p1;
    edge.x = 1;
    edge.y = 30;
    s3.step(STEP, press({ rbHeld: true }));
    edge.planted!.x = -1;
    putInAir(s3, edge.planted!.x + 0.15, edge.planted!.y);
    s3.step(STEP, press({ rbHeld: true, y: true }));
    expect(s3.state.stats.last).toBe('OUT OF BOUNDS');
    expect(s3.state.ball.holder).not.toBe('p1');

    const s4 = sim();
    s4.setMode('free');
    const holder = s4.state.players.p0;
    s4.step(STEP, press({ rt: true, trigger: 0.6, stickHeld: true, aim: { x: holder.x, y: holder.y + 12 } }));
    expect(s4.state.throwArm.phase).toBe('charge');
    expect(holder.diveT).toBeLessThan(0);
  });
});
