import { GRAV } from '../config/constants';
import type { Rng } from './rng';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rad = (d: number) => (d * Math.PI) / 180;

export function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

export function approachAngle(a: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - a);
  return Math.abs(d) <= maxStep ? target : a + Math.sign(d) * maxStep;
}

export function gauss(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (!u) u = rng.random();
  while (!v) v = rng.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function radialDeadzone(x: number, y: number, dz: number): { x: number; y: number; m: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0, m: 0 };
  const nm = Math.min(1, (m - dz) / (1 - dz));
  return { x: (x / m) * nm, y: (y / m) * nm, m: nm };
}

/** Ballistic helpers. h = release height above target height. */
export function speedForAngle(d: number, h: number, th: number): number {
  const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) + h);
  return den <= 0 ? Infinity : Math.sqrt((GRAV * d * d) / den);
}

export function lowAngle(v: number, d: number, h: number): number | null {
  const a = (GRAV * d * d) / (2 * v * v);
  const disc = d * d - 4 * a * (a - h);
  if (disc < 0) return null;
  return Math.atan((d - Math.sqrt(disc)) / (2 * a));
}
