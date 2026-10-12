/**
 * Gamepad RT charge latch. The throw itself is decided by the sim throw arm.
 * Releasing here only ends the charge. It does not throw.
 */

export interface TriggerTune {
  engage: number;
  release: number;
  minHoldMs: number;
}

export interface TriggerLatch {
  charging: boolean;
  peak: number;
  since: number;
  lock: boolean;
}

export interface TriggerStep {
  latch: TriggerLatch;
  /** Remapped loft (0) to bullet (1) while a charge is held. */
  charge: number | null;
  throwPower: number | null;
  /** True on the frame RT crosses the engage threshold. One-hand catches use only this. */
  catchEdge: boolean;
}

export function freshTrigger(): TriggerLatch {
  return { charging: false, peak: 0, since: 0, lock: false };
}

/** Loft-to-bullet using only the travel above the engage threshold. */
export function triggerPower(peak: number, engage: number): number {
  const span = Math.max(0.05, 1 - engage);
  return Math.max(0, Math.min(1, (peak - engage) / span));
}

export function stepTrigger(
  prev: TriggerLatch,
  rt: number,
  now: number,
  prevRt: number,
  tune: TriggerTune,
): TriggerStep {
  const engage = Math.min(0.95, Math.max(0.02, tune.engage));
  const release = Math.min(tune.release, engage - 0.02);
  const catchEdge = rt >= engage && prevRt < engage;
  const latch: TriggerLatch = { ...prev };
  if (latch.lock) {
    if (rt < release) latch.lock = false;
    return { latch, charge: null, throwPower: null, catchEdge };
  }
  if (!latch.charging) {
    if (rt < engage) return { latch, charge: null, throwPower: null, catchEdge };
    latch.charging = true;
    latch.peak = rt;
    latch.since = now;
  } else if (rt > latch.peak) {
    latch.peak = rt;
  }
  if (rt < release) {
    latch.charging = false;
    latch.peak = 0;
    latch.lock = false;
    return { latch, charge: null, throwPower: null, catchEdge };
  }
  return { latch, charge: triggerPower(latch.peak, engage), throwPower: null, catchEdge };
}
