import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { easeThresholds, radialDeadzone } from '../sim/math';
import { emptyProfile, octantIndex, shapeStick } from './stick';

/** Square-ish gate: cardinals reach 1, diagonals top out at 0.88. */
function gate(deg: number): { x: number; y: number } {
  const a = deg * Math.PI / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const diagonal = Math.abs(c) > 0.2 && Math.abs(s) > 0.2;
  const mag = diagonal ? 0.88 : 1;
  return { x: c * mag, y: s * mag };
}

describe('stick calibration', () => {
  it('maps a square-ish full tilt to magnitude 1 in all 8 directions', () => {
    const profile = emptyProfile();
    for (let i = 0; i < 8; i++) {
      const raw = gate(i * 45);
      const shaped = shapeStick(raw.x, raw.y, profile, DEFAULTS.deadzone, 'play');
      expect(shaped.rawM, `raw ${i * 45}`).toBeCloseTo(i % 2 === 0 ? 1 : 0.88, 5);
      expect(shaped.m, `cal ${i * 45}`).toBe(1);
      expect(octantIndex(shaped.x, shaped.y)).toBe(octantIndex(raw.x, raw.y));
    }
  });

  it('snaps a cardinal that only reaches 0.92, and still deadzones the center', () => {
    const profile = emptyProfile();
    const full = shapeStick(0.92, 0, profile, DEFAULTS.deadzone, 'play');
    expect(full.m).toBe(1);
    const rest = shapeStick(0.08, 0.04, profile, DEFAULTS.deadzone, 'play');
    expect(rest.m).toBe(0);
  });

  it('shows why the old radial deadzone dropped a short diagonal', () => {
    const diagonal = (mag: number) => radialDeadzone(mag * Math.SQRT1_2, mag * Math.SQRT1_2, DEFAULTS.deadzone).m;
    expect(diagonal(0.85)).toBeLessThan(0.85);
    expect(diagonal(0.88)).toBeLessThan(0.9);
    const shaped = shapeStick(0.85 * Math.SQRT1_2, 0.85 * Math.SQRT1_2, emptyProfile(), DEFAULTS.deadzone, 'play');
    expect(shaped.m).toBe(1);
  });

  it('treats the old 0.85 ease-off default as 0.7 with a higher release', () => {
    expect(easeThresholds(0.85)).toEqual({ enter: 0.7, exit: 0.85, grace: 0.12 });
    expect(easeThresholds(0.7).enter).toBe(0.7);
    expect(easeThresholds(0.55)).toEqual({ enter: 0.55, exit: 0.7, grace: 0.12 });
  });
});
