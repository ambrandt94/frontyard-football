import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { blankInput, createSim } from './sim';
import { mulberry32 } from './rng';
import type { SimInput } from './types';

const zeroRng = { random: () => 0 };

function sim(extra: Partial<typeof DEFAULTS> = {}) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, ...extra }, { rng: zeroRng });
}

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

function texts(s: ReturnType<typeof sim>) {
  return s.state.floaters.map((f) => f.text);
}

/** Snap a 1v1 and take the defender. */
function defenderRun(extra: Partial<typeof DEFAULTS> = {}) {
  const s = sim({ aiMoveRate: 0, ...extra });
  s.setMode('run');
  s.state.controlled = 'df';
  s.step(STEP, press({ a: true }));
  expect(s.state.play.phase).toBe('live');
  return s;
}

function park(s: ReturnType<typeof sim>, vel: { x: number; y: number }) {
  const d = s.state.players.df;
  const c = s.state.players.rb;
  c.x = 8;
  c.y = 8;
  c.vx = 0;
  c.vy = 0;
  d.x = 26;
  d.y = 40;
  d.vx = vel.x;
  d.vy = vel.y;
  d.facing = Math.hypot(vel.x, vel.y) > 0.5 ? Math.atan2(vel.y, vel.x) : Math.PI / 2;
  d.plantT = 0;
  d.jumpT = -1;
  d.diveT = -1;
  d.tackle = null;
  d.lungeReady = true;
  d.tackleCD = 0;
  d.squared = false;
  return d;
}

/** Travel during the burst, before the miss recovery plants them. */
function lungeTravel(s: ReturnType<typeof sim>, rs: { x: number; y: number }) {
  const d = s.state.players.df;
  const x0 = d.x;
  const y0 = d.y;
  s.step(STEP, press({ rs }));
  expect(d.tackle?.kind).toBe('lunge');
  const frames = Math.round(0.24 / STEP);
  for (let i = 0; i < frames; i++) s.step(STEP, blankInput());
  return Math.hypot(d.x - x0, d.y - y0);
}

describe('defender lunge', () => {
  it('jumps on A and does not start a tackle', () => {
    const s = defenderRun();
    const d = park(s, { x: 0, y: 0 });
    s.step(STEP, press({ a: true }));
    expect(d.jumpT).toBe(0);
    expect(d.tackle).toBeNull();
    for (let i = 0; i < 10; i++) s.step(STEP, blankInput());
    expect(d.z).toBeGreaterThan(0.15);
    expect(d.tackle).toBeNull();
  });

  it('jumps on A in coverage, and the right stick does nothing before the catch', () => {
    const s = createSim({
      ...DEFAULTS, requireSnap: true, autoReset: false, covSep: 80, covMaxHold: 30,
    }, { rng: mulberry32(1) });
    s.setMode('coverage');
    expect(s.state.controlled).toBe('df');
    s.step(STEP, press({ a: true }));
    expect(s.state.play.phase).toBe('live');
    const d = s.state.players.df;
    const qb = s.state.players.qb;
    expect(d.z).toBe(0);
    s.step(STEP, press({ a: true }));
    for (let i = 0; i < 10; i++) s.step(STEP, blankInput());
    expect(d.z).toBeGreaterThan(0.15);
    expect(d.tackle).toBeNull();

    d.z = 0;
    d.jumpT = -1;
    d.x = qb.x;
    d.y = qb.y + 0.4;
    d.vx = 0;
    d.vy = 0;
    d.lungeReady = true;
    const x0 = d.x;
    for (let i = 0; i < 20; i++) s.step(STEP, press({ rs: { x: 0, y: -1 } }));
    expect(d.tackle).toBeNull();
    expect(s.state.play.phase).toBe('live');
    expect(Math.abs(d.x - x0)).toBeLessThan(0.05);
    expect(texts(s)).not.toContain('LUNGE');
  });

  it('lunges farther aligned and fast than sideways, backward, or standing', () => {
    const speed = DEFAULTS.fullSpeed;
    const atSpeed = defenderRun();
    park(atSpeed, { x: 0, y: speed });
    const alignedFast = lungeTravel(atSpeed, { x: 0, y: 1 });

    const side = defenderRun();
    park(side, { x: 0, y: speed });
    const sideways = lungeTravel(side, { x: 1, y: 0 });

    const back = defenderRun();
    park(back, { x: 0, y: speed });
    const backward = lungeTravel(back, { x: 0, y: -1 });

    const still = defenderRun();
    park(still, { x: 0, y: 0 });
    const standing = lungeTravel(still, { x: 0, y: 1 });

    expect(alignedFast).toBeGreaterThan(sideways + 0.8);
    expect(alignedFast).toBeGreaterThan(standing + 0.8);
    expect(sideways).toBeGreaterThan(backward);
    expect(standing).toBeLessThan(1.2);
    expect(alignedFast).toBeGreaterThan(2);
  });

  it('wraps the carrier on contact during a lunge', () => {
    const s = defenderRun({
      wrapSuccess: 1, fumbleBase: 0, noLTTackleMult: 1, behindPenalty: 0, speedPenalty: 0,
    });
    const d = s.state.players.df;
    const c = s.state.players.rb;
    c.x = 26;
    c.y = 40;
    c.vx = 0;
    c.vy = 0;
    d.x = 26;
    d.y = 40.7;
    d.vx = 0;
    d.vy = 0;
    d.facing = -Math.PI / 2;
    d.lungeReady = true;
    d.tackle = null;
    d.tackleCD = 0;
    s.step(STEP, press({ rs: { x: 0, y: -1 } }));
    expect(texts(s)).toContain('LUNGE');
    expect(s.state.play.phase).toBe('over');
    expect(s.state.play.result).toBe('TACKLED');
    expect(s.state.lastTackle?.kind).toBe('lunge');
    expect(texts(s)).toContain('WRAP');
  });

  it('plants a whiff, longer after a farther lunge', () => {
    function miss(velY: number) {
      const s = defenderRun();
      const d = park(s, { x: 0, y: velY });
      s.step(STEP, press({ rs: { x: 0, y: 1 } }));
      expect(d.tackle?.kind).toBe('lunge');
      let plant = 0;
      for (let i = 0; i < 80 && plant <= 0; i++) {
        s.step(STEP, blankInput());
        if (d.plantT > 0) plant = d.plantT;
      }
      expect(texts(s)).toContain('MISSED');
      expect(s.state.play.phase).toBe('live');
      expect(d.tackle).toBeNull();
      return plant;
    }
    const running = miss(DEFAULTS.fullSpeed);
    const standing = miss(0);
    expect(running).toBeGreaterThan(standing);
    expect(standing).toBeGreaterThan(0.1);
  });

  it('has the AI defender tackle with a lunge', () => {
    const s = sim({
      wrapSuccess: 1, fumbleBase: 0, noLTTackleMult: 1, behindPenalty: 0, speedPenalty: 0, aiMoveRate: 0,
    });
    s.setMode('run');
    expect(s.state.controlled).toBe('rb');
    s.step(STEP, press({ a: true }));
    const c = s.state.players.rb;
    const d = s.state.players.df;
    c.x = 26;
    c.y = 40;
    c.vx = 0;
    c.vy = 0;
    d.x = 26;
    d.y = 41;
    d.vx = 0;
    d.vy = 0;
    d.lungeReady = true;
    d.tackleCD = 0;
    for (let i = 0; i < 40 && s.state.play.phase !== 'over'; i++) s.step(STEP, blankInput());
    expect(texts(s)).toContain('LUNGE');
    expect(s.state.play.phase).toBe('over');
    expect(s.state.play.result).toBe('TACKLED');
    expect(s.state.lastTackle?.kind).toBe('lunge');
  });

  it('does not give a lunge the hurdle bonus', () => {
    const s = sim({ wrapSuccess: 0.5, fumbleBase: 0, noLTTackleMult: 1, behindPenalty: 0, speedPenalty: 0, hurdleWrapFumbleMult: 4 });
    const d = s.state.players.qb;
    const c = s.state.players.wr;
    c.z = 0.6;
    const wrap = s.resolveTackle(d, c, 'wrap');
    const lunge = s.resolveTackle(d, c, 'lunge');
    expect(wrap.notes).toContain('hurdled into the hit');
    expect(lunge.notes).not.toContain('hurdled into the hit');
    expect(lunge.p).toBeLessThan(wrap.p);
  });
});
