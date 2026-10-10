import { describe, expect, it } from 'vitest';
import { formatTimeScale, nextTimeScale, timeScaleOf } from './timeScale';

describe('time scale', () => {
  it('clamps to the slider range and cycles the presets', () => {
    expect(timeScaleOf(0.5)).toBe(0.5);
    expect(timeScaleOf(0)).toBe(0.1);
    expect(timeScaleOf(9)).toBe(2);
    expect(timeScaleOf(Number.NaN)).toBe(1);
    expect(nextTimeScale(1)).toBe(0.5);
    expect(nextTimeScale(0.5)).toBe(0.25);
    expect(nextTimeScale(0.25)).toBe(1);
    expect(nextTimeScale(0.7)).toBe(1);
    expect(formatTimeScale(0.5)).toBe('0.5×');
    expect(formatTimeScale(1)).toBe('1×');
  });
});