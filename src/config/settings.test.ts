import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './defaults';
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
    expect(JSON.parse(store.data['tdfb.sandbox.settings.v1']).schemaVersion).toBe(4);

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
    expect(toDocument(custom).schemaVersion).toBe(4);
  });
});
