import type { Vec2 } from './types';

/** What other players are allowed to know about a thrower's aim. */
export interface AimHint {
  /** Quantized spot. This is the only part that goes on the wire. */
  x: number;
  y: number;
  id: string;
  /** Lag memory. Never sent. */
  sx: number;
  sy: number;
}

export interface AimSample {
  x: number;
  y: number;
  id: string;
}

/** Cell size for a fuzz radius. Half the radius, and never finer than a yard. */
export function aimCell(radius: number): number {
  return Math.max(1, radius * 0.5);
}

export function quantizeAim(x: number, y: number, radius: number): Vec2 {
  const cell = aimCell(radius);
  const tidy = (n: number) => Math.round(n * 100) / 100;
  return {
    x: tidy(Math.round(x / cell) * cell),
    y: tidy(Math.round(y / cell) * cell),
  };
}

/**
 * Ease toward the true spot, then publish a coarse cell.
 * A new thrower starts on the cell. A moving aim lags, so the cell trails the stick.
 */
export function stepAimHint(prev: AimHint | null, sample: AimSample | null, dt: number, radius: number): AimHint | null {
  if (!sample) return null;
  const k = 1 - Math.exp(-2.2 * Math.max(0, dt));
  let sx = sample.x;
  let sy = sample.y;
  if (prev && prev.id === sample.id) {
    sx = prev.sx + (sample.x - prev.sx) * k;
    sy = prev.sy + (sample.y - prev.sy) * k;
  }
  const q = quantizeAim(sx, sy, radius);
  return { x: q.x, y: q.y, id: sample.id, sx, sy };
}
