import type { ThrowAction, ThrowArm, Vec2 } from './types';

export interface ThrowTune {
  engage: number;
  release: number;
  /** Seconds. A shorter hold is a brush: nothing is thrown. */
  minHold: number;
}

export function freshThrowArm(): ThrowArm {
  return { phase: 'idle', since: 0, prev: 0, peak: 0, releasing: false, wait: false, last: 'none', power: 0, lock: null };
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

function copyLock(lock: Vec2 | null): Vec2 | null {
  return lock ? { x: lock.x, y: lock.y } : null;
}

/**
 * One sim step of the throw arm.
 * The right stick has to be out. RT past the engage mark charges, and the
 * deepest squeeze in that window is the power: a light peak is a touch or
 * lob, a full peak is a bullet. Distance and direction are latched while RT
 * is held, and the release throws that spot. A stick that eases off as the
 * trigger falls does not shorten or cancel the throw. Centering the stick
 * while RT stays down does.
 */
export function stepThrowArm(
  arm: ThrowArm,
  trigger: number,
  aim: Vec2 | null,
  stickHeld: boolean,
  t: number,
  tune: ThrowTune,
): { arm: ThrowArm; action: ThrowAction; target: Vec2 | null; power: number } {
  const next: ThrowArm = { ...arm, lock: copyLock(arm.lock) };
  const prev = arm.prev;
  const tr = Math.max(0, Math.min(1, trigger || 0));
  next.prev = tr;
  const spot = aim ? { x: aim.x, y: aim.y } : null;
  if (next.wait && tr < tune.release) next.wait = false;
  // One animation frame is several sim steps with the same trigger, so a
  // single-step drop is not enough. Once RT leaves its peak, remember that
  // the release is underway until the squeeze comes back.
  const triggerFalling = tr < prev - 0.04;
  if (next.phase === 'charge') {
    if (triggerFalling) next.releasing = true;
    if (tr >= arm.peak - 0.03) next.releasing = false;
  }

  if (next.phase === 'charge' && !stickHeld && tr >= tune.release && !next.releasing) {
    next.phase = 'idle';
    next.peak = 0;
    next.releasing = false;
    next.lock = null;
    next.wait = tr >= tune.release;
    next.last = 'cancel';
    return { arm: next, action: 'cancel', target: null, power: 0 };
  }

  if (next.phase === 'idle') {
    if (stickHeld && !next.wait && prev < tune.engage && tr >= tune.engage) {
      next.phase = 'charge';
      next.since = t;
      next.peak = tr;
      next.releasing = false;
      next.lock = copyLock(spot);
    }
    return { arm: next, action: null, target: null, power: 0 };
  }

  if (tr > next.peak) next.peak = tr;
  // The release frame's near-zero stick is not stickHeld, and its trigger is
  // already under the release mark, so it cannot replace the latched spot.
  if (stickHeld && tr >= tune.release && spot) next.lock = copyLock(spot);
  if (tr < tune.release) {
    const held = t - next.since;
    const power = throwPower(next.peak, tune.engage);
    const target = copyLock(next.lock) || spot;
    next.phase = 'idle';
    next.peak = 0;
    next.releasing = false;
    next.lock = null;
    if (held >= tune.minHold && target) {
      next.wait = true;
      next.last = 'throw';
      next.power = power;
      return { arm: next, action: 'throw', target, power };
    }
    next.last = 'brush';
    next.power = 0;
    return { arm: next, action: null, target: null, power: 0 };
  }
  return { arm: next, action: null, target: null, power: 0 };
}
