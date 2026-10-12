import type { Settings } from '../config/defaults';
import { radialDeadzone } from '../sim/math';

/** Absolute+ is the default. Direction charge separates the line from the distance. */
export type AimMode = 'absolutePlus' | 'directionCharge';

export const AIM_MODE_LABEL: Record<AimMode, string> = {
  absolutePlus: 'Absolute+',
  directionCharge: 'Direction charge',
};

export function nextAimMode(mode: AimMode): AimMode {
  return mode === 'directionCharge' ? 'absolutePlus' : 'directionCharge';
}

export function aimModeOf(value: string): AimMode {
  return value === 'directionCharge' ? 'directionCharge' : 'absolutePlus';
}

/** dist = minDist + (maxDist - minDist) * m^distExp, with m in 0..1. */
export function polarDistance(m: number, minDist: number, maxDist: number, distExp: number): number {
  const u = Math.min(1, Math.max(0, m));
  if (u <= 0) return minDist;
  return minDist + (maxDist - minDist) * u ** Math.max(0, distExp);
}

/**
 * d = minDist + (maxDist - minDist) * (t / chargeTime)^chargeExp.
 * Without ping-pong the marker stops at maxDist. With it, the marker reverses there.
 */
export function chargeDistance(
  t: number,
  minDist: number,
  maxDist: number,
  chargeTime: number,
  chargeExp: number,
  pingPong: boolean,
): number {
  const time = Math.max(1e-4, chargeTime);
  const u = Math.max(0, t) / time;
  let k: number;
  if (!pingPong) k = Math.min(1, u);
  else {
    const phase = u % 2;
    k = phase <= 1 ? phase : 2 - phase;
  }
  if (k <= 0) return minDist;
  return minDist + (maxDist - minDist) * k ** Math.max(0, chargeExp);
}

/** Critically damped spring. `halfLife` is the half-life of the e^{-wt} envelope. */
export function dampSpring(x: number, v: number, target: number, dt: number, halfLife: number): { x: number; v: number } {
  if (dt <= 0) return { x, v };
  const w = Math.LN2 / Math.max(1e-4, halfLife);
  const e = x - target;
  const decay = Math.exp(-w * dt);
  const b = v + w * e;
  const nextE = (e + b * dt) * decay;
  return { x: target + nextE, v: b * decay - w * nextE };
}

/** About 32 segments. The last sample is the original endpoint, not a shortened guess. */
export function resampleArc<T extends { x: number; y: number; z?: number }>(pts: T[], segments = 32): T[] {
  if (pts.length <= 2) return pts.map((p) => ({ ...p }));
  const last = pts.length - 1;
  const n = Math.max(1, segments);
  const out: T[] = [];
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * last;
    const i0 = Math.min(last, Math.floor(f));
    const i1 = Math.min(last, i0 + 1);
    const u = f - i0;
    const a = pts[i0];
    const b = pts[i1];
    out.push({
      ...a,
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * u,
    });
  }
  const end = pts[last];
  out[out.length - 1] = { ...end };
  return out;
}

class LowPass {
  y: number | null = null;
  filter(value: number, alpha: number): number {
    this.y = this.y == null ? value : alpha * value + (1 - alpha) * this.y;
    return this.y;
  }
}

/**
 * One Euro filter. Angle is filtered in degrees so a 90° flick is a fast rate
 * and `beta` opens the cutoff, while a held stick stays near `minCutoff`.
 */
class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT: number | null = null;

  filter(value: number, t: number, minCutoff: number, beta: number, dcutoff = 1): number {
    const te = this.lastT == null ? 1 / 60 : Math.max(1e-4, t - this.lastT);
    this.lastT = t;
    const alpha = (cut: number) => {
      const tau = 1 / (2 * Math.PI * Math.max(1e-3, cut));
      return 1 / (1 + tau / te);
    };
    if (this.x.y == null) return this.x.filter(value, 1);
    const der = (value - this.x.y) / te;
    const edx = this.dx.filter(der, alpha(dcutoff));
    const cutoff = Math.max(1e-3, minCutoff) + Math.max(0, beta) * Math.abs(edx);
    return this.x.filter(value, alpha(cutoff));
  }
}

export interface AimState {
  dist: number;
  angleDeg: number;
  /** Last raw angle accepted by the hysteresis gate. */
  heldAngle: number;
  holding: boolean;
  holdUntil: number;
  armedDist: number;
  armedAngle: number;
  armedMag: number;
  armedAt: number;
  peakMag: number;
  lastMag: number;
  chargeT: number;
  chargeOn: boolean;
  /** RT must release after B before another charge starts. */
  chargeBlock: boolean;
  loft: number;
  loftV: number;
  endX: number;
  endY: number;
  endVx: number;
  endVy: number;
  angleFilter: OneEuro;
  magFilter: OneEuro;
}

export function createAimState(): AimState {
  return {
    dist: 12,
    angleDeg: 0,
    heldAngle: 0,
    holding: false,
    holdUntil: 0,
    armedDist: 12,
    armedAngle: 0,
    armedMag: 0,
    armedAt: -99,
    peakMag: 0,
    lastMag: 0,
    chargeT: 0,
    chargeOn: false,
    chargeBlock: false,
    loft: 0.5,
    loftV: 0,
    endX: 0,
    endY: 12,
    endVx: 0,
    endVy: 0,
    angleFilter: new OneEuro(),
    magFilter: new OneEuro(),
  };
}

export interface AimSample {
  /** Field-space right stick. +y is upfield. Null when no pad is connected. */
  stick: { x: number; y: number } | null;
  /** Ground point under the cursor, or null when the stick is aiming. */
  mouse: { x: number; y: number } | null;
  qb: { x: number; y: number };
  /** RT or the left mouse button is held. */
  charging: boolean;
  /** 0–1 trigger pressure while charging. Null before it is touched. */
  pressure: number | null;
  /** B, which cancels a direction charge. */
  cancel: boolean;
  /** Lob window, or the release frame of a charge. Keep the locked spot. */
  hold?: boolean;
}

export interface AimOutput {
  x: number;
  y: number;
  dist: number;
  angleDeg: number;
  /** Drop the throw that this frame would have released. */
  suppressThrow: boolean;
  /** Faint direction line, world yards. Direction charge only. */
  guide: { x: number; y: number; x2: number; y2: number } | null;
  previewLoft: number;
  previewX: number;
  previewY: number;
}

const wrap180 = (deg: number) => {
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
};

function pointOn(qb: { x: number; y: number }, angleDeg: number, dist: number) {
  const a = angleDeg * Math.PI / 180;
  return { x: qb.x + Math.sin(a) * dist, y: qb.y + Math.cos(a) * dist };
}

/**
 * Field-relative aim. Stick forward is upfield, whatever the camera is doing.
 * Absolute+ maps angle and magnitude. Direction charge maps angle only, and
 * the trigger grows the distance. A fast stick return keeps the spot for graceMs.
 */
export function stepAim(state: AimState, sample: AimSample, dt: number, settings: Settings, nowSeconds: number): AimOutput {
  const mode = aimModeOf(settings.aimMode);
  const frame = Math.min(Math.max(dt, 0), 0.05);
  const now = nowSeconds;
  const dead = Math.min(0.95, Math.max(0, settings.aimDeadzone));
  let suppressThrow = false;

  if (sample.stick && !sample.hold) {
    const dz = radialDeadzone(sample.stick.x, sample.stick.y, dead);
    const mag = dz.m;
    const rate = frame > 1e-6 ? (mag - state.lastMag) / frame : 0;
    state.lastMag = mag;
    const falling = rate < -1.5;
    if (mag > state.peakMag) state.peakMag = mag;
    if (!falling && mag >= 0.45) {
      state.armedMag = mag;
      state.armedAt = now;
      state.armedDist = state.dist;
      state.armedAngle = state.angleDeg;
    }
    const sprung =
      mode === 'absolutePlus' &&
      !state.holding &&
      state.armedMag >= 0.45 &&
      mag < state.armedMag * 0.4 &&
      now - state.armedAt < 0.25;
    if (sprung) {
      state.holding = true;
      state.holdUntil = now + Math.max(0, settings.aimGraceMs) / 1000;
      state.dist = state.armedDist;
      state.angleDeg = state.armedAngle;
      state.peakMag = 0;
    }
    if (state.holding && mag > 0.32) state.holding = false;
    const frozen = mode === 'absolutePlus' && state.holding && now < state.holdUntil;
    if (!frozen && mag > 0) {
      let raw = Math.atan2(dz.x, dz.y) * 180 / Math.PI;
      if (mag > 0.8 && Math.abs(wrap180(raw - state.heldAngle)) < settings.aimAngleDeadband) raw = state.heldAngle;
      else state.heldAngle = raw;
      const unwrapped = state.angleDeg + wrap180(raw - state.angleDeg);
      state.angleDeg = wrap180(state.angleFilter.filter(unwrapped, now, settings.aimEuroMin, settings.aimEuroBeta));
      if (mode === 'absolutePlus') {
        const filtered = state.magFilter.filter(mag, now, settings.aimEuroMin, settings.aimEuroBeta);
        state.dist = polarDistance(filtered, settings.aimMinDist, settings.aimMaxDist, settings.aimDistExp);
      }
    } else if (!frozen && mag <= 0 && mode === 'absolutePlus' && !state.holding) {
      const filtered = state.magFilter.filter(0, now, settings.aimEuroMin, settings.aimEuroBeta);
      state.dist = polarDistance(filtered, settings.aimMinDist, settings.aimMaxDist, settings.aimDistExp);
      state.peakMag = 0;
    }
  }

  if (!sample.hold && sample.mouse && !(mode === 'absolutePlus' && sample.stick && radialDeadzone(sample.stick.x, sample.stick.y, dead).m > 0)) {
    const dx = sample.mouse.x - sample.qb.x;
    const dy = sample.mouse.y - sample.qb.y;
    const d = Math.hypot(dx, dy);
    if (mode === 'absolutePlus') {
      const cap = Math.max(1, settings.aimMaxDist);
      const scale = d > cap ? cap / d : 1;
      state.dist = d * scale;
      if (d > 0.4) state.angleDeg = Math.atan2(dx, dy) * 180 / Math.PI;
    } else if (d > 0.4) {
      const raw = Math.atan2(dx, dy) * 180 / Math.PI;
      const unwrapped = state.angleDeg + wrap180(raw - state.angleDeg);
      state.angleDeg = wrap180(state.angleFilter.filter(unwrapped, now, settings.aimEuroMin, settings.aimEuroBeta));
      state.heldAngle = state.angleDeg;
    }
  }

  if (mode === 'directionCharge') {
    if (!sample.charging && !sample.hold) state.chargeBlock = false;
    if (sample.cancel && (state.chargeOn || sample.charging || sample.hold)) {
      state.chargeOn = false;
      state.chargeT = 0;
      state.chargeBlock = true;
      state.dist = settings.chargeMinDist;
      suppressThrow = true;
    } else if (sample.hold) {
      state.chargeOn = true;
    } else if (sample.charging && !state.chargeBlock) {
      state.chargeOn = true;
      state.chargeT += frame;
      state.dist = chargeDistance(
        state.chargeT,
        settings.chargeMinDist,
        settings.chargeMaxDist,
        settings.chargeTime,
        settings.chargeExp,
        settings.chargePingPong,
      );
    } else if (!sample.charging) {
      state.chargeOn = false;
      state.chargeT = 0;
      state.dist = settings.chargeMinDist;
    }
  }

  const spot = pointOn(sample.qb, state.angleDeg, state.dist);
  const loftTarget = sample.pressure == null ? settings.previewDefaultLoft : sample.pressure;
  const loft = dampSpring(state.loft, state.loftV, loftTarget, frame, 0.07);
  state.loft = loft.x;
  state.loftV = loft.v;
  const ex = dampSpring(state.endX, state.endVx, spot.x - sample.qb.x, frame, 0.04);
  const ey = dampSpring(state.endY, state.endVy, spot.y - sample.qb.y, frame, 0.04);
  state.endX = ex.x;
  state.endY = ey.x;
  state.endVx = ex.v;
  state.endVy = ey.v;

  let guide: AimOutput['guide'] = null;
  if (mode === 'directionCharge') {
    const far = pointOn(sample.qb, state.angleDeg, settings.chargeMaxDist);
    guide = { x: sample.qb.x, y: sample.qb.y, x2: far.x, y2: far.y };
  }
  return {
    x: spot.x,
    y: spot.y,
    dist: state.dist,
    angleDeg: state.angleDeg,
    suppressThrow,
    guide,
    previewLoft: Math.min(1, Math.max(0, state.loft)),
    previewX: sample.qb.x + state.endX,
    previewY: sample.qb.y + state.endY,
  };
}
