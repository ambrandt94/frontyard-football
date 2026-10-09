import { PRESETS_KEY, SETTINGS_KEY, SETTINGS_SCHEMA_VERSION } from './constants';
import { DEFAULTS, isSettingsKey, settingAccepts, type Settings } from './defaults';

/** Canonical on-disk / clipboard shape. Unknown keys are ignored on load. */
export interface SettingsDocument {
  schemaVersion: number;
  values: Partial<Settings>;
}

export interface PresetStore {
  schemaVersion: 1;
  presets: Record<string, SettingsDocument>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function emptyPresetStore(): PresetStore {
  return { schemaVersion: 1, presets: {} };
}

export function toDocument(settings: Settings): SettingsDocument {
  return { schemaVersion: SETTINGS_SCHEMA_VERSION, values: { ...settings } };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Pull a values bag out of a versioned document or a legacy flat object. */
export function extractValues(raw: unknown): Record<string, unknown> | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  if ('values' in obj) {
    const values = asRecord(obj.values);
    return values ?? {};
  }
  return obj;
}

export function countRecognized(raw: unknown): number {
  const values = extractValues(raw);
  if (!values) return 0;
  let n = 0;
  for (const key of Object.keys(values)) {
    if (isSettingsKey(key) && settingAccepts(key, values[key])) n++;
  }
  return n;
}

/** Missing keys stay at defaults. Unknown keys and wrong types are dropped. */
export function mergeSettings(raw: unknown, base: Settings = DEFAULTS): Settings {
  const next = { ...base };
  const values = extractValues(raw);
  if (!values) return next;
  for (const key of Object.keys(values)) {
    if (!isSettingsKey(key)) continue;
    const value = values[key];
    if (!settingAccepts(key, value)) continue;
    (next as Record<keyof Settings, Settings[keyof Settings]>)[key] = value as Settings[keyof Settings];
  }
  return next;
}

export function loadSettings(store: KeyValueStore): Settings {
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    return mergeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(toDocument(settings)));
  } catch {
    /* private mode / quota */
  }
}

export function loadPresetStore(store: KeyValueStore): PresetStore {
  try {
    const raw = store.getItem(PRESETS_KEY);
    if (!raw) return emptyPresetStore();
    const parsed = asRecord(JSON.parse(raw));
    const presetsIn = parsed && asRecord(parsed.presets);
    const presets: Record<string, SettingsDocument> = {};
    if (presetsIn) {
      for (const name of Object.keys(presetsIn)) {
        const doc = presetsIn[name];
        if (countRecognized(doc) > 0) {
          const values = extractValues(doc) ?? {};
          const partial: Partial<Settings> = {};
          for (const key of Object.keys(values)) {
            if (isSettingsKey(key) && settingAccepts(key, values[key])) {
              (partial as Record<string, unknown>)[key] = values[key];
            }
          }
          const version = asRecord(doc)?.schemaVersion;
          presets[name] = {
            schemaVersion: typeof version === 'number' ? version : SETTINGS_SCHEMA_VERSION,
            values: partial,
          };
        }
      }
    }
    return { schemaVersion: 1, presets };
  } catch {
    return emptyPresetStore();
  }
}

export function savePresetStore(store: KeyValueStore, presets: PresetStore): void {
  try {
    store.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

export function presetNames(presets: PresetStore): string[] {
  return Object.keys(presets.presets).sort((a, b) => a.localeCompare(b));
}

export function upsertPreset(presets: PresetStore, name: string, settings: Settings): PresetStore {
  return {
    schemaVersion: 1,
    presets: { ...presets.presets, [name]: toDocument(settings) },
  };
}

export function deletePreset(presets: PresetStore, name: string): PresetStore {
  const next = { ...presets.presets };
  delete next[name];
  return { schemaVersion: 1, presets: next };
}

export function presetSettings(presets: PresetStore, name: string): Settings | null {
  const doc = presets.presets[name];
  if (!doc) return null;
  return mergeSettings(doc);
}

export function downloadSettings(settings: Settings, filename = 'frontyard-football-settings.json'): void {
  const blob = new Blob([JSON.stringify(toDocument(settings), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function browserStore(): KeyValueStore {
  return localStorage;
}
