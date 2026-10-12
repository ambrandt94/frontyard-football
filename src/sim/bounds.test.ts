import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { FIELD_L, FIELD_W, STEP } from '../config/constants';
import { blankInput, createSim } from './sim';
import type { Ball } from './types';

const zeroRng = { random: () => 0 };

function sim(extra: Partial<typeof DEFAULTS> = {}) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, throwPursuer: false, ...extra }, { rng: zeroRng });
}

function live(s: ReturnType<typeof sim>) {
  s.state.play.phase = 'live';
  s.state.play.snapT = s.state.t;
}

function placeBall(s: ReturnType<typeof sim>, partial: Partial<Ball>) {
  s.state.ball = {
    state: 'air', holder: null, x: 20, y: 40, z: 2, vx: 0, vy: 0, vz: 0,
    arc: [], landing: null, aimed: null, throwT: s.state.t, resolved: false, gave: false, power: 0.5,
    ...partial,
  };
}

function inside(b: Ball) {
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x).toBeLessThanOrEqual(FIELD_W);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeLessThanOrEqual(FIELD_L);
}

describe('balls out of bounds', () => {
  it('ends a pass that lands out of bounds and spots it on the sideline', () => {
    const s = sim();
    live(s);
    placeBall(s, { x: -1.2, y: 42, z: 0.05, vx: -4, vy: 1, vz: -1 });
    s.step(STEP, blankInput());
    expect(s.state.play.phase).toBe('over');
    expect(s.state.play.result).toBe('OUT OF BOUNDS');
    expect(s.state.stats.last).toBe('OUT OF BOUNDS');
    inside(s.state.ball);
    expect(s.state.ball.holder).toBeNull();
  });

  it('ends a pass thrown past the field before it can rest out there', () => {
    const s = sim();
    live(s);
    placeBall(s, { x: FIELD_W + 6, y: 50, z: 8, vx: 12, vy: 4, vz: 2 });
    s.step(STEP, blankInput());
    expect(s.state.play.phase).toBe('over');
    expect(s.state.stats.last).toBe('OUT OF BOUNDS');
    inside(s.state.ball);
  });

  it('marks a catch incomplete when the receiver is out of bounds', () => {
    const s = sim();
    live(s);
    s.state.controlled = 'wr';
    const w = s.state.players.wr;
    w.x = -0.8;
    w.y = 48;
    placeBall(s, { x: w.x, y: w.y, z: 1.4, vx: 0, vy: 0, vz: 0 });
    w.attempt = { type: 'two', t0: s.state.t, win: 1, radius: 2 };
    s.step(STEP, blankInput());
    expect(s.state.play.phase).toBe('over');
    expect(s.state.stats.last).toBe('OUT OF BOUNDS');
    expect(s.state.ball.holder).toBeNull();
    inside(s.state.ball);
  });

  it('ends the play when the carrier runs out, including on a dive', () => {
    const s = sim();
    live(s);
    const w = s.state.players.wr;
    w.x = 20;
    w.y = 50;
    s.state.ball = {
      state: 'held', holder: 'wr', x: w.x, y: w.y, z: 1, vx: 0, vy: 0, vz: 0,
      arc: [], landing: null, aimed: null, throwT: 0, resolved: true, gave: true, power: 0.5,
    };
    s.state.carry = { catchY: 50, yac: 0, goalY: 110, goalLabel: 'TOUCHDOWN', goalSign: 1 };
    w.x = -0.4;
    s.step(STEP, blankInput());
    expect(s.state.play.result).toBe('OUT OF BOUNDS');

    const dive = sim();
    live(dive);
    const wr = dive.state.players.wr;
    wr.x = FIELD_W + 0.6;
    wr.y = 50;
    wr.dove = true;
    wr.groundT = 0.4;
    dive.state.ball = {
      state: 'held', holder: 'wr', x: wr.x, y: wr.y, z: 0.2, vx: 0, vy: 0, vz: 0,
      arc: [], landing: null, aimed: null, throwT: 0, resolved: true, gave: true, power: 0.5,
    };
    dive.state.carry = { catchY: 48, yac: 2, goalY: 110, goalLabel: 'TOUCHDOWN', goalSign: 1 };
    dive.step(STEP, blankInput());
    expect(dive.state.play.result).toBe('OUT OF BOUNDS');
  });

  it('bounces a loose ball at the sideline instead of letting it rest outside', () => {
    const s = sim();
    live(s);
    placeBall(s, { state: 'dead', x: 1, y: 40, z: 0.4, vx: -30, vy: 2, vz: 0, resolved: true, gave: true });
    s.state.stats.last = 'FUMBLE';
    for (let i = 0; i < 90; i++) s.step(STEP, blankInput());
    inside(s.state.ball);
    expect(s.state.stats.last).toBe('FUMBLE');
  });

  it('resets a dead ball that nobody picks up', () => {
    const s = sim();
    live(s);
    placeBall(s, { state: 'rest', x: 26, y: 40, z: 0.12, vx: 0, vy: 0, vz: 0, resolved: true, gave: true });
    s.state.stats.last = 'INCOMPLETE';
    s.step(STEP, blankInput());
    expect(s.state.play.phase).toBe('over');
    for (let i = 0; i < 120 * 4.2; i++) s.step(STEP, blankInput());
    expect(s.state.play.phase).toBe('pre');
    expect(s.state.ball.state).toBe('held');
    expect(s.state.ball.holder).toBe('qb');
  });

  it('hands an idle Throw Around ball to the nearest player', () => {
    const s = sim();
    s.setMode('free');
    const ids = Object.keys(s.state.players);
    expect(ids.length).toBeGreaterThan(1);
    s.state.ball = {
      state: 'rest', holder: null, x: 1, y: 1, z: 0.12, vx: 0, vy: 0, vz: 0,
      arc: [], landing: null, aimed: null, throwT: s.state.t, resolved: true, gave: true, power: 0,
    };
    for (let i = 0; i < 120 * 4.2; i++) s.step(STEP, blankInput());
    expect(s.state.ball.state).toBe('held');
    expect(s.state.ball.holder).toBeTruthy();
    const holder = s.state.players[s.state.ball.holder!];
    expect(holder).toBeTruthy();
    expect(Math.hypot(holder.x - s.state.ball.x, holder.y - s.state.ball.y)).toBeLessThan(1.5);
  });
});
