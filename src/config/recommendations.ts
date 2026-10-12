import { DEFAULTS, type Settings } from './defaults';

/**
 * The faint band on a slider. The track itself is wider so a value can be
 * pushed well past this. Defaults sit inside the band.
 */
export const RECOMMENDED: Partial<Record<keyof Settings, readonly [number, number]>> = {
  rtEngage: [0.25, 0.5],
  rtRelease: [0.06, 0.2],
  rtMinHoldMs: [40, 140],
  cameraMinExtent: [20, 34],
  cameraPadding: [3, 8],
  camPitch: [36, 50],
  camFov: [30, 46],
  camHeightBias: [0.95, 1.3],
  camUpfieldBias: [4, 14],
  aimMinDist: [2, 6],
  aimMaxDist: [35, 60],
  aimDistExp: [1.2, 2.1],
  aimEuroMin: [0.6, 2],
  aimEuroBeta: [0.01, 0.08],
  aimAngleDeadband: [0.2, 1.5],
  aimGraceMs: [60, 180],
  chargeMinDist: [3, 10],
  chargeMaxDist: [40, 70],
  chargeTime: [0.7, 1.6],
  chargeExp: [1.1, 1.8],
  previewDefaultLoft: [0.3, 0.7],
};

/** Upper bounds that stop a 3× stretch from becoming a nonsense angle or rate. */
export const SLIDER_CAP: Partial<Record<keyof Settings, { min?: number; max?: number }>> = {
  camPitch: { min: 20, max: 80 },
  camFov: { min: 16, max: 90 },
  reverseAngleDeg: { max: 180 },
  spinMomentumAngle: { max: 180 },
  sidestepAngleNormal: { max: 150 },
  sidestepAngleSprint: { max: 90 },
  pitchDefaultAngle: { max: 180 },
  pitchMinAngle: { max: 170 },
  cutDecayAngleDeg: { max: 180 },
  aimAngleDeadband: { max: 15 },
  timeScale: { min: 0.1, max: 3 },
  playerScale: { min: 0.3, max: 3 },
  cameraMinExtent: { min: 12, max: 120 },
  cameraPadding: { min: 0, max: 24 },
  rtEngage: { min: 0.05, max: 0.9 },
  rtRelease: { min: 0, max: 0.6 },
  rtMinHoldMs: { min: 0, max: 400 },
};

function tidy(n: number): number {
  const scale = Math.abs(n) >= 20 ? 1 : Math.abs(n) >= 2 ? 10 : 100;
  return Math.round(n * scale) / scale;
}

/** A band around the shipped default, wide enough to see and tight enough to mean "plays well". */
export function bandAround(value: number, floor = 0, cap = Infinity): readonly [number, number] {
  let lo = Math.max(floor, value * 0.75);
  let hi = Math.min(cap, value * 1.35);
  const span = Math.max(0.05, Math.abs(value) * 0.35);
  if (hi - lo < span) hi = Math.min(cap, lo + span);
  if (hi <= lo) hi = lo + 0.01;
  return [tidy(lo), tidy(hi)];
}

export function recommendedRange(key: string, sample: number): readonly [number, number] {
  const custom = RECOMMENDED[key as keyof Settings];
  if (custom) return custom;
  const unit = sample >= 0 && sample <= 1;
  return bandAround(sample, 0, unit ? 1 : Infinity);
}

export function defaultSitsInBand(key: keyof Settings): boolean {
  const sample = DEFAULTS[key];
  if (typeof sample !== 'number') return true;
  const [lo, hi] = recommendedRange(key, sample);
  return sample >= lo - 1e-6 && sample <= hi + 1e-6;
}
