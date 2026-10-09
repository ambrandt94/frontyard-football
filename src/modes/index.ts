/** Play modes. Rules live in src/sim so a future server can run the same code. */

export const MODE_IDS = ['throw', 'run', 'catch'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const MODE_LABEL: Record<ModeId, string> = {
  throw: 'Throw',
  run: '1v1 Run',
  catch: 'Catch',
};

export const MODE_LABELS = MODE_IDS.map((id) => MODE_LABEL[id]);

export function nextMode(mode: ModeId): ModeId {
  const i = MODE_IDS.indexOf(mode);
  return MODE_IDS[(i + 1) % MODE_IDS.length];
}

export function modeFromLabel(label: string): ModeId {
  if (label === '1v1 Run' || label === 'run') return 'run';
  if (label === 'Catch' || label === 'catch') return 'catch';
  return 'throw';
}
