import { isSettingsKey, settingAccepts, type Settings } from '../config/defaults';
import { isHostKey, pickHost } from '../config/groups';
import type { IceServer } from './types';

/** Host-owned gameplay. Camera, input feel, renderer, and TURN stay off this object. */
export function gameplaySettings(S: Settings): Partial<Settings> {
  return pickHost(S);
}

export function applyGameplay(S: Settings, incoming: Partial<Settings>) {
  for (const key of Object.keys(incoming) as (keyof Settings)[]) {
    if (!isSettingsKey(key) || !isHostKey(key)) continue;
    const value = incoming[key];
    if (settingAccepts(key, value)) (S as unknown as Record<keyof Settings, Settings[keyof Settings]>)[key] = value as Settings[keyof Settings];
  }
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
