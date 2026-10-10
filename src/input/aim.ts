import type { Settings } from '../config/defaults';
import { radialDeadzone } from '../sim/math';

/** Neutral spot: 12 yards downfield, the same offset the stick used to start at. */
export const AIM_REST = { x: 0, y: 12 };

export interface AimState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Frozen on a quick return so the reticle does not chase the stick home. */
  holding: boolean;
  holdUntil: number;
  armedMag: number;
  armedAt: number;
  armedX: number;
  armedY: number;
  peakMag: number;
  lastMag: number;
  t: number;
}

export function createAimState(): AimState {
  return {
    x: AIM_REST.x,
    y: AIM_REST.y,
    vx: 0,
    vy: 0,
    holding: false,
    holdUntil: 0,
    armedMag: 0,
    armedAt: -99,
    armedX: AIM_REST.x,
    armedY: AIM_REST.y,
    peakMag: 0,
    lastMag: 0,
    t: 0,
  };
}

/**
 * Follow a field-space right stick (y already flipped so +y is downfield).
 * A null stick means no pad this frame: leave the spot where it is.
 *
 * Return handling: a fast drop toward center freezes the spot captured while
 * the stick was still out, for `aimReturnHold` seconds. A throw in that window
 * uses the held spot. After the hold, a centered stick eases toward the rest
 * offset. A new outward deflection cancels the hold and follows again.
 */
export function stepAim(
  state: AimState,
  stick: { x: number; y: number } | null,
  dt: number,
  settings: Settings,
  nowSeconds: number,
): { x: number; y: number } {
  if (!stick) return { x: state.x, y: state.y };

  const now = nowSeconds;
  state.t = now;
  const frame = Math.min(Math.max(dt, 0), 0.05);
  const dead = Math.min(0.95, Math.max(0, settings.aimDeadzone));
  const dz = radialDeadzone(stick.x, stick.y, dead);
  const mag = dz.m;
  const rate = frame > 1e-6 ? (mag - state.lastMag) / frame : 0;
  state.lastMag = mag;
  // A gamepad spring is several units per second. A slow aim-in is not.
  const falling = rate < -1.5;

  if (mag > state.peakMag) state.peakMag = mag;
  const nearPeak = state.peakMag <= 0 || mag >= state.peakMag * 0.82;
  if (!falling && mag >= 0.45 && (nearPeak || now - state.armedAt > 0.12)) {
    if (!nearPeak) state.peakMag = mag;
    state.armedMag = mag;
    state.armedAt = now;
    state.armedX = state.x;
    state.armedY = state.y;
  }

  const sprung =
    !state.holding &&
    state.armedMag >= 0.45 &&
    mag < state.armedMag * 0.4 &&
    now - state.armedAt < 0.25;

  if (sprung) {
    state.holding = true;
    state.holdUntil = now + Math.max(0, settings.aimReturnHold);
    state.x = state.armedX;
    state.y = state.armedY;
    state.vx = 0;
    state.vy = 0;
    state.peakMag = 0;
  }

  if (state.holding && mag > 0.32) state.holding = false;

  if (state.holding && now < state.holdUntil) return { x: state.x, y: state.y };

  // Stick is on its way in, but not centered yet. Don't drag the spot with it.
  if (
    !state.holding &&
    falling &&
    state.armedMag >= 0.45 &&
    mag < state.armedMag * 0.7 &&
    now - state.armedAt < 0.25
  ) {
    state.vx = 0;
    state.vy = 0;
    return { x: state.x, y: state.y };
  }

  if (mag < 0.15) state.peakMag = 0;

  let tx = AIM_REST.x;
  let ty = AIM_REST.y;
  let omega = Math.min(Math.max(settings.aimResponse, 0) * 0.22, 2.5);
  if (mag > 0) {
    const shaped = mag ** Math.max(0, settings.aimCurve);
    const scale = shaped / mag;
    tx = dz.x * scale * settings.maxAimRange;
    ty = dz.y * scale * settings.maxAimRange;
    omega = Math.max(settings.aimResponse, 0);
  }

  integrate(state, tx, ty, omega, frame, Math.max(0, settings.aimMaxSpeed));
  const range = settings.maxAimRange;
  const dist = Math.hypot(state.x, state.y);
  if (range > 0 && dist > range) {
    state.x *= range / dist;
    state.y *= range / dist;
  }
  return { x: state.x, y: state.y };
}

/** Semi-implicit Euler on a critically damped spring, with a travel-speed cap. */
function integrate(state: AimState, tx: number, ty: number, omega: number, frame: number, cap: number) {
  if (omega < 1e-4 || frame <= 0) return;
  let left = frame;
  const hMax = 1 / Math.max(120, omega * 8);
  while (left > 1e-8) {
    const h = Math.min(left, hMax);
    const ax = omega * omega * (tx - state.x) - 2 * omega * state.vx;
    const ay = omega * omega * (ty - state.y) - 2 * omega * state.vy;
    state.vx += ax * h;
    state.vy += ay * h;
    const speed = Math.hypot(state.vx, state.vy);
    if (cap > 0 && speed > cap) {
      state.vx = (state.vx / speed) * cap;
      state.vy = (state.vy / speed) * cap;
    }
    state.x += state.vx * h;
    state.y += state.vy * h;
    left -= h;
  }
}
