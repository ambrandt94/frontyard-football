import { clamp } from '../sim/math';

/** Keyboard cycle. The slider still allows any value from 0.1 to 2. */
export const TIME_PRESETS = [1, 0.5, 0.25] as const;

export function timeScaleOf(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(value, 0.1, 2);
}

export function nextTimeScale(value: number): number {
  const current = timeScaleOf(value);
  const i = TIME_PRESETS.findIndex((preset) => Math.abs(preset - current) < 0.001);
  return TIME_PRESETS[(i < 0 ? 0 : i + 1) % TIME_PRESETS.length];
}

export function formatTimeScale(value: number): string {
  const v = Math.round(timeScaleOf(value) * 100) / 100;
  const text = Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : String(v);
  return `${text}×`;
}
