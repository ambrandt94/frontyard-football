/**
 * Gamepad sticks rarely reach 1.0, and a square-ish gate is shorter on the
 * diagonals. Sprint and full speed both key off magnitude, so a full push
 * that reads 0.85 used to miss the ease-off line and the full-run target.
 * This rescales each direction to the stick's real reach.
 */

export const OCTANTS = 8;
/** A push this hard is treated as the rim, even before a direction is learned. */
export const OUTER_MAG = 0.9;
/** While playing, only a strong push is allowed to define that direction's max. */
export const LEARN_MIN = 0.82;
/** During the calibrate circle, a lighter push still records the rim. */
export const CALIBRATE_MIN = 0.5;

export interface StickProfile {
  /** Highest raw magnitude seen in each 45° slice. 0 means that slice is unknown. */
  max: number[];
}

export interface StickReading {
  x: number;
  y: number;
  /** 0–1 after the deadzone, the outer snap, and the per-octant reach. */
  m: number;
  rawX: number;
  rawY: number;
  rawM: number;
  /** Degrees, atan2(y, x). 0 is stick-right. */
  rawDeg: number;
  deg: number;
}

export function emptyProfile(): StickProfile {
  return { max: Array(OCTANTS).fill(0) };
}

export function octantIndex(x: number, y: number): number {
  const step = Math.PI / 4;
  const i = Math.round(Math.atan2(y, x) / step);
  return ((i % OCTANTS) + OCTANTS) % OCTANTS;
}

export function learnedCount(profile: StickProfile): number {
  return profile.max.filter((n) => n >= CALIBRATE_MIN).length;
}

/**
 * Radial deadzone, then stretch this direction out to the learned rim.
 * Anything already at the outer band snaps to 1 so a stick that tops out
 * at 0.92 is full tilt immediately.
 */
export function shapeStick(
  x: number,
  y: number,
  profile: StickProfile,
  deadzone: number,
  learn: false | 'play' | 'rim',
): StickReading {
  const rawM = Math.hypot(x, y);
  const rawDeg = Math.atan2(y, x) * 180 / Math.PI;
  const blank: StickReading = { x: 0, y: 0, m: 0, rawX: x, rawY: y, rawM, rawDeg, deg: rawDeg };
  if (rawM < 1e-6) return blank;
  const i = octantIndex(x, y);
  const floor = learn === 'rim' ? CALIBRATE_MIN : LEARN_MIN;
  if (learn && rawM >= floor) {
    const prev = profile.max[i] || 0;
    if (prev <= 0 || rawM >= prev) profile.max[i] = Math.min(1, rawM);
    else if (learn === 'play') profile.max[i] = prev * 0.995 + rawM * 0.005;
  }
  const dz = Math.min(0.9, Math.max(0, deadzone));
  if (rawM <= dz) return blank;
  const reach = profile.max[i] > dz + 0.05 ? profile.max[i] : 1;
  let m = Math.min(1, (rawM - dz) / (reach - dz));
  if (rawM >= OUTER_MAG || m >= OUTER_MAG) m = 1;
  return {
    x: (x / rawM) * m,
    y: (y / rawM) * m,
    m,
    rawX: x,
    rawY: y,
    rawM,
    rawDeg,
    deg: Math.atan2(y, x) * 180 / Math.PI,
  };
}

const STORAGE_KEY = 'tdfb.stickcal';

export interface StickCalState {
  left: StickProfile;
  right: StickProfile;
  calibrating: boolean;
  until: number;
  showDebug: boolean;
  leftReading: StickReading;
  rightReading: StickReading;
}

const zeroReading = (): StickReading => ({ x: 0, y: 0, m: 0, rawX: 0, rawY: 0, rawM: 0, rawDeg: 0, deg: 0 });

function freshState(): StickCalState {
  return {
    left: emptyProfile(),
    right: emptyProfile(),
    calibrating: false,
    until: 0,
    showDebug: false,
    leftReading: zeroReading(),
    rightReading: zeroReading(),
  };
}

export const stickCal: StickCalState = freshState();

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function parseMax(raw: unknown): number[] {
  const out = Array(OCTANTS).fill(0);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < OCTANTS; i++) {
    const n = raw[i];
    if (typeof n === 'number' && n > 0 && n <= 1) out[i] = n;
  }
  return out;
}

let loaded = false;
let dirty = false;
let lastSave = 0;

export function loadStickCal(): void {
  if (loaded) return;
  loaded = true;
  const store = storage();
  if (!store) return;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { left?: unknown; right?: unknown; debug?: unknown };
    stickCal.left.max = parseMax(parsed.left);
    stickCal.right.max = parseMax(parsed.right);
    stickCal.showDebug = parsed.debug === true;
  } catch {
    /* ignore a bad save */
  }
}

export function saveStickCal(): void {
  dirty = false;
  lastSave = Date.now();
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({
      left: stickCal.left.max,
      right: stickCal.right.max,
      debug: stickCal.showDebug,
    }));
  } catch {
    /* private mode */
  }
}

export function markStickDirty(): void {
  dirty = true;
}

export function startStickCalibrate(now = Date.now()): void {
  loadStickCal();
  stickCal.left = emptyProfile();
  stickCal.right = emptyProfile();
  stickCal.calibrating = true;
  stickCal.until = now + 5000;
  dirty = true;
}

export function toggleStickDebug(): boolean {
  loadStickCal();
  stickCal.showDebug = !stickCal.showDebug;
  saveStickCal();
  return stickCal.showDebug;
}

/** Call once per poll so a finished circle is stored. */
export function tickStickCal(now = Date.now()): void {
  loadStickCal();
  if (stickCal.calibrating && now >= stickCal.until) {
    stickCal.calibrating = false;
    saveStickCal();
  } else if (dirty && now - lastSave > 1000) {
    saveStickCal();
  }
}
