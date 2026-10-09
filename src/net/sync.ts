import { DEFAULTS, isSettingsKey, settingAccepts, type Settings } from '../config/defaults';
import type { IceServer } from './types';

/** View and this machine's TURN login stay local. Gameplay numbers come from the host. */
const LOCAL_KEYS: (keyof Settings)[] = [
  'cameraMinExtent', 'cameraPadding', 'cameraFollow', 'playerScale', 'playerVisuals',
  'modelHeightYd', 'modelOutline', 'showReach', 'showArc', 'renderer',
  'netTurnUrl', 'netTurnUser', 'netTurnCred',
];

export function gameplaySettings(S: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (LOCAL_KEYS.includes(key)) continue;
    (out as Record<string, unknown>)[key] = S[key];
  }
  return out;
}

export function applyGameplay(S: Settings, incoming: Partial<Settings>) {
  const next: Partial<Settings> = {};
  for (const key of Object.keys(incoming) as (keyof Settings)[]) {
    if (LOCAL_KEYS.includes(key) || !isSettingsKey(key)) continue;
    const value = incoming[key];
    if (settingAccepts(key, value)) (next as Record<string, unknown>)[key] = value;
  }
  Object.assign(S, next);
}

export function iceServers(S: Pick<Settings, 'netTurnUrl' | 'netTurnUser' | 'netTurnCred'>): IceServer[] {
  const ice: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const url = S.netTurnUrl.trim();
  if (url) {
    const turn: IceServer = { urls: url };
    if (S.netTurnUser) turn.username = S.netTurnUser;
    if (S.netTurnCred) turn.credential = S.netTurnCred;
    ice.push(turn);
  }
  return ice;
}
