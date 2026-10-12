import type { ThrowAction, ThrowArm, Vec2 } from './types';

export interface ThrowTune {
  engage: number;
  release: number;
  /** Seconds. A shorter hold is a brush: no window, no throw. */
  minHold: number;
  bulletSqueeze: number;
  lobPress: number;
  lobWindow: number;
}

export function freshThrowArm(): ThrowArm {
  return { phase: 'idle', since: 0, lock: null, prev: 0, wait: false, pumpUntil: 0, last: 'none' };
}

export function throwTune(S: {
  rtEngage: number;
  rtRelease: number;
  rtMinHoldMs: number;
  bulletSqueeze: number;
  lobPress: number;
  lobWindow: number;
}): ThrowTune {
  const engage = Math.min(0.95, Math.max(0.02, S.rtEngage));
  const release = Math.min(Math.max(0, S.rtRelease), engage - 0.02);
  const bullet = Math.min(0.999, Math.max(engage + 0.04, S.bulletSqueeze));
  const lob = Math.min(0.999, Math.max(engage + 0.04, S.lobPress));
  return {
    engage,
    release,
    minHold: Math.max(0, S.rtMinHoldMs) / 1000,
    bulletSqueeze: bullet,
    lobPress: lob,
    lobWindow: Math.max(0.05, S.lobWindow),
  };
}

/**
 * One sim step of the throw arm.
 * Pull past engage to charge. A full squeeze throws a bullet at the live aim.
 * A release opens a lob window on the locked aim. A press in that window lobs.
 * Silence through the window is a pump fake, and the next pull has to re-engage.
 */
export function stepThrowArm(
  arm: ThrowArm,
  trigger: number,
  aim: Vec2 | null,
  cancel: boolean,
  t: number,
  tune: ThrowTune,
): { arm: ThrowArm; action: ThrowAction; target: Vec2 | null } {
  const next: ThrowArm = { ...arm, lock: arm.lock ? { x: arm.lock.x, y: arm.lock.y } : null };
  const prev = arm.prev;
  const tr = Math.max(0, Math.min(1, trigger || 0));
  next.prev = tr;
  const spot = aim ? { x: aim.x, y: aim.y } : null;
  if (next.wait && tr < tune.release) next.wait = false;

  if (cancel && (next.phase === 'charge' || next.phase === 'window')) {
    next.phase = 'idle';
    next.lock = null;
    next.wait = tr >= tune.release;
    next.last = 'cancel';
    return { arm: next, action: 'cancel', target: null };
  }

  if (next.phase === 'idle') {
    if (!next.wait && prev < tune.engage && tr >= tune.engage) {
      next.phase = 'charge';
      next.since = t;
      next.lock = null;
    }
    return { arm: next, action: null, target: null };
  }

  if (next.phase === 'charge') {
    if (tr >= tune.bulletSqueeze && spot) {
      next.phase = 'idle';
      next.lock = null;
      next.wait = true;
      next.last = 'bullet';
      return { arm: next, action: 'bullet', target: spot };
    }
    if (tr < tune.release) {
      const held = t - next.since;
      next.phase = 'idle';
      if (held >= tune.minHold && spot) {
        next.phase = 'window';
        next.since = t;
        next.lock = spot;
        return { arm: next, action: null, target: spot };
      }
      next.lock = null;
      next.last = 'brush';
      return { arm: next, action: null, target: null };
    }
    return { arm: next, action: null, target: null };
  }

  const crossed = prev < tune.lobPress && tr >= tune.lobPress;
  if (crossed && next.lock) {
    const target = next.lock;
    next.phase = 'idle';
    next.lock = null;
    next.wait = true;
    next.last = 'lob';
    return { arm: next, action: 'lob', target };
  }
  if (t - next.since >= tune.lobWindow) {
    const target = next.lock;
    next.phase = 'idle';
    next.lock = null;
    next.wait = tr >= tune.release;
    next.pumpUntil = t + 0.24;
    next.last = 'pump';
    return { arm: next, action: 'pump', target };
  }
  return { arm: next, action: null, target: null };
}
