import { DEFAULTS, isSettingsKey, type Settings } from './defaults';

/** This machine only. Not sent to other players, and not overwritten when the host syncs. */
export const LOCAL_KEYS = [
  'cameraMinExtent', 'cameraPadding', 'cameraFollow',
  'camStyle', 'camPitch', 'camFov', 'camHeightBias', 'camUpfieldBias', 'fieldStyle',
  'playerScale', 'playerVisuals', 'modelHeightYd', 'modelOutline', 'armIk', 'armIkDebug',
  'showReach', 'showArc', 'arcStyle', 'arcWidth', 'arcOpacity', 'renderer', 'deadzone',
  'rtEngage', 'rtRelease', 'rtMinHoldMs',
  'aimMode', 'aimDeadzone', 'aimMinDist', 'aimMaxDist', 'aimDistExp',
  'aimEuroMin', 'aimEuroBeta', 'aimAngleDeadband', 'aimGraceMs',
  'chargeMinDist', 'chargeMaxDist', 'chargeTime', 'chargeExp', 'chargePingPong',
  'previewDefaultLoft',
  'netTurnUrl', 'netTurnUser', 'netTurnCred',
] as const satisfies readonly (keyof Settings)[];

export type LocalKey = (typeof LOCAL_KEYS)[number];

const LOCAL_SET = new Set<string>(LOCAL_KEYS);

/** Gameplay and physics. The host owns these in a multiplayer room. */
export const HOST_KEYS = (Object.keys(DEFAULTS) as (keyof Settings)[]).filter((key) => !LOCAL_SET.has(key));

export function isLocalKey(key: string): key is LocalKey {
  return LOCAL_SET.has(key);
}

export function isHostKey(key: string): key is keyof Settings {
  return isSettingsKey(key) && !LOCAL_SET.has(key);
}

export function pickHost(settings: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const key of HOST_KEYS) (out as Record<string, unknown>)[key] = settings[key];
  return out;
}

export function pickLocal(settings: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const key of LOCAL_KEYS) (out as Record<string, unknown>)[key] = settings[key];
  return out;
}

export function assignKeys(target: Settings, source: Settings, keys: readonly (keyof Settings)[]) {
  const dest = target as unknown as Record<keyof Settings, Settings[keyof Settings]>;
  for (const key of keys) dest[key] = source[key];
}
