import { loadLook, parseLook, saveLook, type Look } from './look';

/** Saved name plus kit. Missing means this browser has not created a player yet. */
export const PROFILE_KEY = 'tdfb.sandbox.player';
/** Kept in step with the profile so older online code still finds a name. */
export const NAME_KEY = 'tdfb.sandbox.netname';

export interface PlayerProfile {
  name: string;
  look: Look;
}

export function cleanPlayerName(name: string): string {
  return name.trim().slice(0, 16);
}

export function loadProfile(): PlayerProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? cleanPlayerName(rec.name) : '';
    if (!name) return null;
    return { name, look: parseLook(rec.look) };
  } catch {
    return null;
  }
}

/** Saved profile, or a draft filled from an older name and kit so the first modal is not blank. */
export function draftProfile(): PlayerProfile {
  const saved = loadProfile();
  if (saved) return { name: saved.name, look: { ...saved.look } };
  let name = '';
  try {
    if (typeof localStorage !== 'undefined') name = cleanPlayerName(localStorage.getItem(NAME_KEY) || '');
  } catch { /* private mode */ }
  return { name, look: loadLook() };
}

export function saveProfile(profile: PlayerProfile): PlayerProfile {
  const name = cleanPlayerName(profile.name);
  if (!name) throw new Error('Enter a name to play.');
  const next: PlayerProfile = { name, look: parseLook(profile.look) };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      localStorage.setItem(NAME_KEY, name);
    }
  } catch { /* private mode */ }
  saveLook(next.look);
  return next;
}
