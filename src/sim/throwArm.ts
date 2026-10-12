import type { ThrowAction, ThrowArm, Vec2 } from './types';

export interface ThrowTune {
  engage: number;
  release: number;
  /** Seconds. A shorter hold is a brush: nothing is thrown. */
  minHold: number;
}

export function freshThrowArm(): ThrowArm {
  return { phase: 'idle', since: 0, prev: 0, peak: 0, wait: false, last: 'none', power: 0 };
}

export function throwTune(S: {
  rtEngage: number;
  rtRelease: number;
  rtMinHoldMs: number;
}): ThrowTune {
  const engage = Math.min(0.95, Math.max(0.02, S.rtEngage));
  const release = Math.min(Math.max(0, S.rtRelease), engage - 0.02);
  return {
    engage,
    release,
    minHold: Math.max(0, S.rtMinHoldMs) / 1000,
  };
}

/** Loft at 0, bullet at 1, using only the travel above the engage threshold. */
export function throwPower(peak: number, engage: number): number {
  const span = Math.max(0.05, 1 - engage);
  return Math.max(0, Math.min(1, (peak - engage) / span));
}

/**
 * One sim step of the throw arm.
 * The right stick has to be held. RT past the engage mark charges, and the
 * peak past that mark is the power. Releasing RT throws: a light peak is a
 * touch or lob, a full peak is a bullet. Letting the stick go cancels.
 */
export function stepThrowArm(
  arm: ThrowArm,
  trigger: number,
  aim: Vec2 | null,
  stickHeld: boolean,
  t: number,
  tune: ThrowTune,
): { arm: ThrowArm; action: ThrowAction; target: Vec2 | null; power: number } {
  const next: ThrowArm = { ...arm };
  const prev = arm.prev;
  const tr = Math.max(0, Math.min(1, trigger || 0));
  next.prev = tr;
  const spot = aim ? { x: aim.x, y: aim.y } : null;
  if (next.wait && tr < tune.release) next.wait = false;

  if (next.phase === 'charge' && !stickHeld) {
    next.phase = 'idle';
    next.peak = 0;
    next.wait = tr >= tune.release;
    next.last = 'cancel';
    return { arm: next, action: 'cancel', target: null, power: 0 };
  }

  if (next.phase === 'idle') {
    if (stickHeld && !next.wait && prev < tune.engage && tr >= tune.engage) {
      next.phase = 'charge';
      next.since = t;
      next.peak = tr;
    }
    return { arm: next, action: null, target: null, power: 0 };
  }

  if (tr > next.peak) next.peak = tr;
  if (tr < tune.release) {
    const held = t - next.since;
    const power = throwPower(next.peak, tune.engage);
    next.phase = 'idle';
    next.peak = 0;
    if (held >= tune.minHold && spot) {
      next.wait = true;
      next.last = 'throw';
      next.power = power;
      return { arm: next, action: 'throw', target: spot, power };
    }
    next.last = 'brush';
    next.power = 0;
    return { arm: next, action: null, target: null, power: 0 };
  }
  return { arm: next, action: null, target: null, power: 0 };
}
