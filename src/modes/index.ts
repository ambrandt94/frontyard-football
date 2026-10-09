/** Play modes. Rules live in src/sim so a future server can run the same code. */

export const MODE_IDS = ['throw', 'run', 'catch', 'coverage', 'free'] as const;
export type ModeId = (typeof MODE_IDS)[number];

/** Modes a lobby can start. Catch stays single-player. */
export const MP_MODE_IDS = ['throw', 'coverage', 'run', 'free'] as const;

export const MODE_LABEL: Record<ModeId, string> = {
  throw: 'Throw',
  run: '1v1 Run',
  catch: 'Catch',
  coverage: 'Coverage',
  free: 'Throw Around',
};

export const MODE_LABELS = MODE_IDS.map((id) => MODE_LABEL[id]);

export function nextMode(mode: ModeId): ModeId {
  const i = MODE_IDS.indexOf(mode);
  return MODE_IDS[(i + 1) % MODE_IDS.length];
}

export function modeFromLabel(label: string): ModeId {
  if (label === '1v1 Run' || label === 'run') return 'run';
  if (label === 'Catch' || label === 'catch') return 'catch';
  if (label === 'Coverage' || label === 'coverage') return 'coverage';
  if (label === 'Throw Around' || label === 'free') return 'free';
  return 'throw';
}
