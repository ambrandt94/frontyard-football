import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './defaults';
import { recommendedRange } from './recommendations';
import { HOST_KEYS, LOCAL_KEYS } from './groups';
import {
  countRecognized,
  deletePreset,
  emptyPresetStore,
  loadPresetStore,
  loadSettings,
  mergeSettings,
  presetSettings,
  savePresetStore,
  saveSettings,
  toDocument,
  upsertPreset,
  type KeyValueStore,
} from './settings';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

describe('settings schema', () => {
  it('fills missing keys from defaults and drops unknown or mistyped keys', () => {
    const merged = mergeSettings({
      schemaVersion: 99,
      values: { accel: 42, boostPerPump: 'fast', notASetting: 1, renderer: 'canvas2d', playerVisuals: 'wire' },
      extra: true,
    });
    expect(merged.accel).toBe(42);
    expect(merged.boostPerPump).toBe(DEFAULTS.boostPerPump);
    expect(merged.fullSpeed).toBe(DEFAULTS.fullSpeed);
    expect(merged.renderer).toBe('canvas2d');
    expect(merged.playerVisuals).toBe(DEFAULTS.playerVisuals);
    expect(merged).not.toHaveProperty('notASetting');
    expect(countRecognized({ values: { accel: 42, nope: 1 } })).toBe(1);
  });

  it('still reads a flat prototype save', () => {
    const merged = mergeSettings({ accel: 11, sprintMaxSpeed: 14, garbage: 'x' });
    expect(merged.accel).toBe(11);
    expect(merged.sprintMaxSpeed).toBe(14);
    expect(merged.boostPerPump).toBe(0.4);
  });

  it('round-trips the current settings and named presets', () => {
    const store = memoryStore();
    const custom = { ...DEFAULTS, accel: 18, catchPaused: true };
    saveSettings(store, custom);
    expect(loadSettings(store).accel).toBe(18);
    expect(loadSettings(store).catchPaused).toBe(true);
    const saved = JSON.parse(store.data['tdfb.sandbox.settings.v1']);
    expect(saved.schemaVersion).toBe(7);
    expect(saved.host.accel).toBe(18);
    expect(saved.host.deadzone).toBeUndefined();
    expect(saved.local.deadzone).toBe(DEFAULTS.deadzone);
    expect(saved.host.camStyle).toBeUndefined();
    expect(saved.local.camStyle).toBe('all22');
    expect(saved.host.aimMode).toBeUndefined();
    expect(saved.local.aimMode).toBe('directionCharge');
    expect(saved.local.aimGraceMs).toBe(DEFAULTS.aimGraceMs);
    expect(saved.local.accel).toBeUndefined();

    let presets = emptyPresetStore();
    presets = upsertPreset(presets, 'Deep balls', custom);
    presets = upsertPreset(presets, 'Arcade', { ...DEFAULTS, fullSpeed: 10 });
    savePresetStore(store, presets);
    const loaded = loadPresetStore(store);
    expect(Object.keys(loaded.presets).sort()).toEqual(['Arcade', 'Deep balls']);
    expect(presetSettings(loaded, 'Deep balls')?.accel).toBe(18);
    expect(presetSettings(loaded, 'Deep balls')?.jogSpeed).toBe(DEFAULTS.jogSpeed);
    const remaining = deletePreset(loaded, 'Arcade');
    expect(presetSettings(remaining, 'Arcade')).toBeNull();
    expect(toDocument(custom).schemaVersion).toBe(7);
  });

  it('reads schema 5 values bags and schema 6 host/local bags', () => {
    const from5 = mergeSettings({ schemaVersion: 5, values: { accel: 42, deadzone: 0.3 } });
    expect(from5.accel).toBe(42);
    expect(from5.deadzone).toBe(0.3);
    const from6 = mergeSettings({ schemaVersion: 6, host: { accel: 17 }, local: { deadzone: 0.4, renderer: 'canvas2d' } });
    expect(from6.accel).toBe(17);
    expect(from6.deadzone).toBe(0.4);
    expect(from6.renderer).toBe('canvas2d');
    expect(from6.fullSpeed).toBe(DEFAULTS.fullSpeed);
  });

  it('moves schema 6 Absolute+ and the old camera defaults onto direction charge', () => {
    const moved = mergeSettings({
      schemaVersion: 6,
      host: { accel: 17 },
      local: { aimMode: 'absolutePlus', cameraMinExtent: 40, cameraPadding: 7, deadzone: 0.4 },
    });
    expect(moved.aimMode).toBe('directionCharge');
    expect(moved.cameraMinExtent).toBe(DEFAULTS.cameraMinExtent);
    expect(moved.cameraPadding).toBe(DEFAULTS.cameraPadding);
    expect(moved.deadzone).toBe(0.4);
    expect(moved.accel).toBe(17);

    const keptAim = mergeSettings({ schemaVersion: 6, local: { aimMode: 'directionCharge', cameraMinExtent: 55 } });
    expect(keptAim.aimMode).toBe('directionCharge');
    expect(keptAim.cameraMinExtent).toBe(55);

    const chosen = mergeSettings({ schemaVersion: 7, local: { aimMode: 'absolutePlus', cameraMinExtent: 40 } });
    expect(chosen.aimMode).toBe('absolutePlus');
    expect(chosen.cameraMinExtent).toBe(40);
    expect(mergeSettings({}).aimMode).toBe('directionCharge');
  });

  it('keeps each numeric default inside its recommended slider band', () => {
    for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      const value = DEFAULTS[key];
      if (typeof value !== 'number') continue;
      const [lo, hi] = recommendedRange(key, value);
      expect(value, key).toBeGreaterThanOrEqual(lo);
      expect(value, key).toBeLessThanOrEqual(hi);
    }
  });

  it('puts every setting in exactly one group', () => {
    const all = Object.keys(DEFAULTS).sort();
    const union = [...HOST_KEYS, ...LOCAL_KEYS].sort();
    expect(union).toEqual(all);
    const local = new Set<string>(LOCAL_KEYS);
    for (const key of HOST_KEYS) expect(local.has(key)).toBe(false);
    expect(local.has('deadzone')).toBe(true);
    expect(local.has('camStyle')).toBe(true);
    expect(local.has('fieldStyle')).toBe(true);
    expect(DEFAULTS.fieldStyle).toBe('pixel');
    expect(local.has('camPitch')).toBe(true);
    expect(local.has('camFov')).toBe(true);
    expect(local.has('camHeightBias')).toBe(true);
    expect(local.has('camUpfieldBias')).toBe(true);
    expect(local.has('aimMode')).toBe(true);
    expect(local.has('aimDeadzone')).toBe(true);
    expect(local.has('aimMinDist')).toBe(true);
    expect(local.has('aimMaxDist')).toBe(true);
    expect(local.has('chargePingPong')).toBe(true);
    expect(local.has('rtEngage')).toBe(true);
    expect(local.has('rtRelease')).toBe(true);
    expect(local.has('rtMinHoldMs')).toBe(true);
    expect(local.has('previewDefaultLoft')).toBe(true);
    expect(local.has('lobWindow')).toBe(false);
    expect(recommendedRange('lobWindow', 0.3)).toEqual([0.2, 0.5]);
    expect(local.has('accel')).toBe(false);
  });
});
