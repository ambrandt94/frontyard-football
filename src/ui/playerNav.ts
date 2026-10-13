import { SWATCHES } from '../sim/look';

export const PARTS = ['jersey', 'pants', 'helmet', 'skin'] as const;
export type Part = (typeof PARTS)[number];
export type Region = 'name' | 'parts' | 'colors' | 'actions';

export interface NavState {
  region: Region;
  part: Part;
  colorIndex: number;
  actionIndex: number;
  required: boolean;
}

export function colorCount(part: Part): number {
  return part === 'skin' ? 2 : SWATCHES.length + 1;
}

export function colorCols(part: Part): number {
  return part === 'skin' ? 2 : 5;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** D-pad / arrow movement. Left and right stay inside a color row; up and down change rows, then regions. */
export function moveNav(state: NavState, dx: number, dy: number): NavState {
  const next: NavState = { ...state };
  if (!dx && !dy) return next;
  if (next.region === 'name') {
    if (dy > 0) next.region = 'parts';
    return next;
  }
  if (next.region === 'parts') {
    if (dx) {
      const i = clamp(PARTS.indexOf(next.part) + dx, 0, PARTS.length - 1);
      next.part = PARTS[i];
      next.colorIndex = clamp(next.colorIndex, 0, colorCount(next.part) - 1);
    }
    if (dy > 0) next.region = 'colors';
    if (dy < 0) next.region = 'name';
    return next;
  }
  if (next.region === 'colors') {
    const cols = colorCols(next.part);
    const count = colorCount(next.part);
    if (dx) {
      const row = Math.floor(next.colorIndex / cols);
      const col = next.colorIndex % cols;
      const nextCol = col + dx;
      if (nextCol >= 0 && nextCol < cols && row * cols + nextCol < count) next.colorIndex = row * cols + nextCol;
    }
    if (dy) {
      const row = Math.floor(next.colorIndex / cols);
      const col = next.colorIndex % cols;
      const nextRow = row + dy;
      const rows = Math.ceil(count / cols);
      if (nextRow < 0) next.region = 'parts';
      else if (nextRow >= rows) {
        next.region = 'actions';
        next.actionIndex = next.required ? 0 : 1;
      } else {
        const lastInRow = Math.min(count - 1, nextRow * cols + cols - 1);
        next.colorIndex = Math.min(nextRow * cols + col, lastInRow);
      }
    }
    return next;
  }
  const actions = next.required ? 1 : 2;
  if (dx) next.actionIndex = clamp(next.actionIndex + dx, 0, actions - 1);
  if (dy < 0) {
    next.region = 'colors';
    next.colorIndex = colorCount(next.part) - 1;
  }
  return next;
}

/** LB / RB wrap through jersey, pants, helmet, and skin. */
export function cyclePart(state: NavState, dir: number): NavState {
  const next: NavState = { ...state, region: 'parts' };
  const i = (PARTS.indexOf(state.part) + dir + PARTS.length) % PARTS.length;
  next.part = PARTS[i];
  next.colorIndex = clamp(state.colorIndex, 0, colorCount(next.part) - 1);
  return next;
}
