import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { createSim } from './sim';
import { mulberry32 } from './rng';
import { blankInput, type SimInput, type Vec2 } from './types';

function boot(extra: Partial<typeof DEFAULTS> = {}) {
  const s = createSim({
    ...DEFAULTS,
    requireSnap: false,
    autoReset: false,
    baseInaccuracy: 0,
    unsquaredInaccuracy: 1,
    throwVarianceDeg: 0,
    ...extra,
  }, { rng: mulberry32(4) });
  s.state.play.phase = 'live';
  s.state.play.snapT = s.state.t;
  return s;
}

function press(partial: Partial<SimInput>): SimInput {
  return { ...blankInput(), ...partial };
}

function frames(s: ReturnType<typeof boot>, seconds: number, partial: Partial<SimInput>) {
  const n = Math.max(1, Math.round(seconds / STEP));
  const inp = press(partial);
  for (let i = 0; i < n; i++) s.step(STEP, inp);
}

function aimOf(s: ReturnType<typeof boot>, yards: number): Vec2 {
  const qb = s.state.players.qb;
  return { x: qb.x, y: qb.y + yards };
}

function loft(s: ReturnType<typeof boot>) {
  const b = s.state.ball;
  return Math.atan2(b.vz, Math.hypot(b.vx, b.vy)) * 180 / Math.PI;
}

function peakZ(arc: { z: number }[]) {
  return arc.reduce((m, p) => Math.max(m, p.z), 0);
}

describe('throw arm', () => {
  it('a release then a full press at 0.15s lobs to the locked distance', () => {
    const s = boot();
    const lock = aimOf(s, 22);
    frames(s, 0.2, { trigger: 0.6, aim: lock });
    expect(s.state.throwArm.phase).toBe('charge');
    s.step(STEP, press({ trigger: 0, aim: lock }));
    expect(s.state.throwArm.phase).toBe('window');
    const locked = { ...s.state.throwArm.lock! };
    const since = s.state.throwArm.since;
    const elsewhere = aimOf(s, 40);
    while (s.state.t < since + 0.15 - STEP * 0.5) s.step(STEP, press({ trigger: 0, aim: elsewhere }));
    const preview = s.previewThrow(0, locked, 'lob');
    s.step(STEP, press({ trigger: 0.95, aim: elsewhere }));
    const b = s.state.ball;
    expect(s.state.throwArm.last).toBe('lob');
    expect(b.state).toBe('air');
    expect(Math.hypot(b.aimed!.x - locked.x, b.aimed!.y - locked.y)).toBeLessThan(0.2);
    expect(Math.hypot(b.aimed!.x - s.state.players.qb.x, b.aimed!.y - s.state.players.qb.y)).toBeCloseTo(22, 0);
    expect(loft(s)).toBeGreaterThan(30);
    expect(loft(s)).toBeLessThan(40);
    const end = preview.arc[preview.arc.length - 1];
    expect(Math.hypot(end.x - b.landing!.x, end.y - b.landing!.y)).toBeLessThan(0.15);
    expect(peakZ(preview.arc)).toBeGreaterThan(peakZ(s.previewThrow(1, locked, 'bullet').arc) + 1);
  });

  it('a press at 0.6s is a fake, and the next pull charges fresh', () => {
    const s = boot();
    const lock = aimOf(s, 18);
    frames(s, 0.2, { trigger: 0.6, aim: lock });
    s.step(STEP, press({ trigger: 0, aim: lock }));
    const since = s.state.throwArm.since;
    while (s.state.t < since + 0.6) s.step(STEP, press({ trigger: 0, aim: lock }));
    expect(s.state.ball.state).toBe('held');
    expect(s.state.throwArm.last).toBe('pump');
    expect(s.state.throwArm.phase).toBe('idle');
    expect(s.state.throwArm.lock).toBeNull();
    expect(s.state.floaters.some((f) => f.text === 'PUMP')).toBe(true);
    s.step(STEP, press({ trigger: 0.92, aim: lock }));
    expect(s.state.ball.state).toBe('held');
    frames(s, 0.05, { trigger: 0, aim: lock });
    expect(s.state.ball.state).toBe('held');
    expect(s.state.throwArm.phase).toBe('idle');
    s.step(STEP, press({ trigger: 0.6, aim: lock }));
    expect(s.state.throwArm.phase).toBe('charge');
    expect(s.state.ball.state).toBe('held');
  });

  it('a full squeeze while charging throws a bullet', () => {
    const s = boot();
    const spot = aimOf(s, 24);
    frames(s, 0.2, { trigger: 0.6, aim: spot });
    const preview = s.previewThrow(1, spot, 'bullet');
    s.step(STEP, press({ trigger: 1, aim: spot }));
    expect(s.state.throwArm.last).toBe('bullet');
    expect(s.state.ball.state).toBe('air');
    expect(Math.hypot(s.state.ball.aimed!.x - spot.x, s.state.ball.aimed!.y - spot.y)).toBeLessThan(0.2);
    expect(loft(s)).toBeGreaterThan(5);
    expect(loft(s)).toBeLessThan(14);
    const end = preview.arc[preview.arc.length - 1];
    expect(Math.hypot(end.x - s.state.ball.landing!.x, end.y - s.state.ball.landing!.y)).toBeLessThan(0.15);
  });

  it('RT brushes and a resting 0.2 do nothing', () => {
    const s = boot();
    const spot = aimOf(s, 16);
    frames(s, 0.5, { trigger: 0.2, aim: spot });
    expect(s.state.throwArm.phase).toBe('idle');
    expect(s.state.ball.state).toBe('held');
    frames(s, 0.04, { trigger: 0.6, aim: spot });
    s.step(STEP, press({ trigger: 0, aim: spot }));
    expect(s.state.throwArm.last).toBe('brush');
    expect(s.state.throwArm.phase).toBe('idle');
    frames(s, 0.4, { trigger: 0, aim: spot });
    expect(s.state.ball.state).toBe('held');
    expect(s.state.throwArm.last).not.toBe('pump');
  });

  it('B cancels a charge and a defender can bite on the fake', () => {
    const s = boot({ throwDefender: true, pumpBite: 1 });
    const spot = aimOf(s, 20);
    frames(s, 0.2, { trigger: 0.7, aim: spot });
    s.step(STEP, press({ trigger: 0.7, b: true, aim: spot }));
    expect(s.state.throwArm.last).toBe('cancel');
    expect(s.state.ball.state).toBe('held');

    const s2 = boot({ throwDefender: true, pumpBite: 1 });
    const spot2 = aimOf(s2, 26);
    const df = s2.state.players.df;
    const before = Math.hypot(df.x - spot2.x, df.y - spot2.y);
    frames(s2, 0.2, { trigger: 0.6, aim: spot2 });
    s2.step(STEP, press({ trigger: 0, aim: spot2 }));
    const since = s2.state.throwArm.since;
    while (s2.state.t < since + 0.35) s2.step(STEP, press({ trigger: 0, aim: spot2 }));
    expect(s2.state.throwArm.last).toBe('pump');
    frames(s2, 0.25, {});
    const after = Math.hypot(df.x - spot2.x, df.y - spot2.y);
    expect(after).toBeLessThan(before - 0.4);
  });
});
