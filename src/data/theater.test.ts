import { describe, expect, it } from 'vitest';
import { THEATER, applyUniform } from './theater';
import { DEFAULT_LOOK } from '../sim/look';

describe('football theater presets', () => {
  it('keeps the fantasy teams and resolves a uniform onto the lobby colors', () => {
    expect(THEATER.teams.map((team) => team.id)).toContain('Christastrophe');
    expect(THEATER.teams.map((team) => team.id)).toContain('Magic School Bucs');
    expect(THEATER.players.length).toBeGreaterThan(10);
    const look = applyUniform(DEFAULT_LOOK, 'Christastrophe', 'Default');
    expect(look.jersey).toBe(0xfddf6c);
    expect(look.pants).toBe(0xbb4221);
    expect(look.helmet).toBe(0xbb4221);
    expect(look.jerseyPattern).toBe('A');
    expect(look.team).toBe('Christastrophe');
  });

  it('lists every missing Little Heroes mesh by guid and fileID', () => {
    const missing = THEATER.missingCosmetics.filter((row) => row.status === 'missing');
    expect(missing.length).toBe(26);
    for (const row of missing) {
      expect(row.guid).toMatch(/^[0-9a-f]{32}$/);
      expect(row.fileID).toBeTypeOf('number');
    }
    expect(missing.some((row) => row.prefab.startsWith('Hair/'))).toBe(true);
    expect(missing.some((row) => row.prefab.startsWith('Beard/'))).toBe(true);
    expect(THEATER.missingCosmetics.some((row) => row.status === 'local' && row.prefab.includes('Stash1'))).toBe(true);
  });
});
