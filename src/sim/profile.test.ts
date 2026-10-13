import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, loadLook, saveLook } from './look';
import { draftProfile, loadProfile, saveProfile } from './profile';

function memoryStorage() {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => (rows.has(key) ? rows.get(key)! : null),
    setItem: (key: string, value: string) => { rows.set(key, String(value)); },
    removeItem: (key: string) => { rows.delete(key); },
    clear: () => { rows.clear(); },
    key: (index: number) => [...rows.keys()][index] ?? null,
    get length() { return rows.size; },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('player profile', () => {
  it('is missing until someone saves a name', () => {
    expect(loadProfile()).toBeNull();
    saveLook({ ...DEFAULT_LOOK, jersey: 0xd32f2f });
    localStorage.setItem('tdfb.sandbox.netname', 'Alex');
    expect(loadProfile()).toBeNull();
    const draft = draftProfile();
    expect(draft.name).toBe('Alex');
    expect(draft.look.jersey).toBe(0xd32f2f);
  });

  it('round-trips a name and kit', () => {
    const saved = saveProfile({
      name: '  Alex  ',
      look: { jersey: 0x2e7d32, pants: 0x212121, helmet: 0xf9a825, skin: 'dark' },
    });
    expect(saved.name).toBe('Alex');
    expect(loadProfile()).toEqual(saved);
    expect(loadLook().skin).toBe('dark');
    expect(localStorage.getItem('tdfb.sandbox.netname')).toBe('Alex');
    expect(draftProfile().look.helmet).toBe(0xf9a825);
  });

  it('rejects an empty name and keeps the name inside 16 characters', () => {
    expect(() => saveProfile({ name: '   ', look: DEFAULT_LOOK })).toThrow(/name/i);
    expect(loadProfile()).toBeNull();
    const saved = saveProfile({ name: '  Quarterback Names  ', look: DEFAULT_LOOK });
    expect(saved.name).toBe('Quarterback Name');
    expect(saved.name.length).toBe(16);
  });

  it('ignores a stored profile with no name', () => {
    localStorage.setItem('tdfb.sandbox.player', JSON.stringify({ name: '   ', look: DEFAULT_LOOK }));
    expect(loadProfile()).toBeNull();
    localStorage.setItem('tdfb.sandbox.player', '{');
    expect(loadProfile()).toBeNull();
  });
});
