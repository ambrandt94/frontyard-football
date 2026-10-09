import { describe, expect, it } from 'vitest';
import { DEFAULTS, type Settings } from './defaults';
import { BUILTIN_PRESETS, applyControlPreset, presetPumps } from './presets';

describe('built-in control presets', () => {
  it('ships five read-only feels and each one changes tuning', () => {
    expect(BUILTIN_PRESETS.map((p) => p.name)).toEqual([
      'Default/Balanced',
      'Arcade Snappy',
      'Sim Heavy',
      'Elusive Back',
      'Power Back',
    ]);
    const applied: Settings[] = [];
    for (const preset of BUILTIN_PRESETS) {
      expect(preset.description.length).toBeGreaterThan(10);
      const target = { ...DEFAULTS, accel: 1, catchWindowMs: 222, renderer: 'canvas2d' as const };
      applyControlPreset(target, preset);
      applied.push(target);
      expect(target.catchWindowMs).toBe(222);
      expect(target.renderer).toBe('canvas2d');
    }
    const accels = applied.map((s) => s.accel);
    expect(new Set(accels).size).toBe(BUILTIN_PRESETS.length);
    expect(applied[0].accel).toBe(DEFAULTS.accel);
    expect(applied[0].boostPerPump).toBe(DEFAULTS.boostPerPump);
    expect(presetPumps(applied[0])).toBeCloseTo(10, 5);
    expect(presetPumps(applied[1])).toBeCloseTo(6, 5);
    expect(presetPumps(applied[2])).toBeCloseTo(12, 5);
    expect(presetPumps(applied[3])).toBeGreaterThan(8);
    expect(presetPumps(applied[3])).toBeLessThan(11);
    expect(presetPumps(applied[4])).toBeCloseTo(14, 5);
    expect(applied[1].cutBleed).toBeLessThan(applied[0].cutBleed);
    expect(applied[2].cutBleed).toBeGreaterThan(applied[0].cutBleed);
    expect(applied[3].sidestepNormal).toBeGreaterThan(applied[0].sidestepNormal);
    expect(applied[3].flickCooldown).toBeLessThan(applied[0].flickCooldown);
    expect(applied[4].truckBonus).toBeGreaterThan(applied[0].truckBonus);
    expect(applied[4].stiffArmStrength).toBeGreaterThan(applied[0].stiffArmStrength);
    expect(applied[4].wrapSuccess).toBeLessThan(applied[0].wrapSuccess);
    expect(applied[4].sprintMaxSpeed).toBeGreaterThan(applied[0].sprintMaxSpeed);
  });
});