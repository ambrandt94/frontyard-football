import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { createSim } from './sim';
import { mulberry32 } from './rng';
import { aimCell, quantizeAim, stepAimHint } from './aimHint';
import { blankInput, type SimInput } from './types';

describe('aim hint', () => {
  it('quantizes to a cell of about half the fuzz radius', () => {
    expect(aimCell(4)).toBe(2);
    expect(aimCell(3)).toBe(1.5);
    expect(aimCell(0.2)).toBe(1);
    expect(quantizeAim(10.3, 20.7, 4)).toEqual({ x: 10, y: 20 });
    expect(quantizeAim(10, 21, 4)).toEqual({ x: 10, y: 22 });
  });

  it('lags when the aim jumps, and drops when aiming stops', () => {
    const first = stepAimHint(null, { x: 10.3, y: 20.2, id: 'qb' }, STEP, 4);
    expect(first).toEqual({ x: 10, y: 20, id: 'qb', sx: 10.3, sy: 20.2 });
    let hint = first;
    for (let i = 0; i < 30; i++) hint = stepAimHint(hint, { x: 40, y: 60, id: 'qb' }, STEP, 4);
    expect(Math.hypot(hint!.sx - 40, hint!.sy - 60)).toBeGreaterThan(8);
    expect(Math.hypot(hint!.sx - 10.3, hint!.sy - 20.2)).toBeGreaterThan(2);
    expect(stepAimHint(hint, null, STEP, 4)).toBeNull();
    const swapped = stepAimHint(hint, { x: 4, y: 8, id: 'wr' }, STEP, 4);
    expect(swapped!.sx).toBe(4);
    expect(swapped!.id).toBe('wr');
  });
});

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

describe('aim hint in the sim', () => {
  it('publishes a coarse lagged spot while a human is aiming, and clears it after the throw', () => {
    const s = boot();
    const qb = s.state.players.qb;
    const aim = { x: qb.x + 3.4, y: qb.y + 22.4 };
    frames(s, 0.3, { trigger: 0.55, aim });
    const hint = s.state.aimHint;
    expect(hint?.id).toBe('qb');
    const cell = aimCell(DEFAULTS.aimFuzzRadius);
    expect(hint!.x / cell).toBeCloseTo(Math.round(hint!.x / cell), 5);
    expect(hint!.y / cell).toBeCloseTo(Math.round(hint!.y / cell), 5);
    expect(Math.hypot(hint!.x - aim.x, hint!.y - aim.y)).toBeGreaterThan(0.05);
    expect(Math.hypot(hint!.sx - aim.x, hint!.sy - aim.y)).toBeLessThan(cell);

    const far = { x: qb.x - 8, y: qb.y + 48 };
    s.step(STEP, press({ trigger: 0.55, aim: far }));
    expect(Math.hypot(s.state.aimHint!.sx - far.x, s.state.aimHint!.sy - far.y)).toBeGreaterThan(6);

    s.step(STEP, press({ trigger: 0, aim }));
    expect(s.state.throwArm.phase).toBe('window');
    const lock = { ...s.state.throwArm.lock! };
    frames(s, 0.12, { trigger: 0, aim: far });
    expect(s.state.throwArm.phase).toBe('window');
    expect(Math.hypot(s.state.aimHint!.sx - lock.x, s.state.aimHint!.sy - lock.y)).toBeLessThan(cell);
    expect(Math.hypot(s.state.aimHint!.x - far.x, s.state.aimHint!.y - far.y)).toBeGreaterThan(10);

    frames(s, 0.05, { trigger: 1, aim });
    expect(s.state.ball.state).toBe('air');
    expect(s.state.aimHint).toBeNull();
  });

  it('stays off when the host disables it, and shows during an AI quarterback windup', () => {
    const off = boot({ showAimFuzz: false });
    const qb = off.state.players.qb;
    frames(off, 0.2, { trigger: 0.55, aim: { x: qb.x, y: qb.y + 18 } });
    expect(off.state.aimHint).toBeNull();

    const s = createSim({ ...DEFAULTS, requireSnap: false, autoReset: false, catchWindup: 5 }, { rng: mulberry32(2) });
    s.setMode('catch');
    s.state.cm!.nextT = s.state.t;
    s.step(STEP, blankInput());
    expect(s.state.cm!.phase).toBe('windup');
    expect(s.state.aimHint?.id).toBe('qb');
    const wr = s.state.players.wr;
    expect(Math.hypot(s.state.aimHint!.x - wr.x, s.state.aimHint!.y - wr.y)).toBeLessThan(8);
  });
});
