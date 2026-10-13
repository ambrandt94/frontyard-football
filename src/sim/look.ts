import { PLAYER_COLORS } from '../render/colors';

/** Colors and build a person picked. Saved on this machine and sent with the roster. */
export interface Look {
  jersey: number;
  pants: number;
  helmet: number;
  skin: 'light' | 'dark';
  /** Crown height in yards. */
  height: number;
  /** Shoulder and hip width. 1 is average. */
  build: number;
  /** Arm and leg thickness. 1 is average. */
  limb: number;
}

export const DEFAULT_LOOK: Look = {
  jersey: 0x1e63c9,
  pants: 0xf2f2f2,
  helmet: 0xf5f5f5,
  skin: 'light',
  height: 2,
  build: 1,
  limb: 1,
};

/** Curated kit colors. A custom picker can still choose anything else. */
export const SWATCHES = [0xd32f2f, 0x1e63c9, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0xef6c00, 0xf5f5f5, 0x212121, 0x7a0f1e, 0x00897b];

export const SKIN_TONE: Record<Look['skin'], number> = {
  light: 0xd7a57a,
  dark: 0x6b4228,
};

const LOOK_KEY = 'tdfb.sandbox.look';
const DF_JERSEY = 0x7a0f1e;
const DF_ALT = 0x1565c0;

export function hexCss(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0');
}

function hexNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v & 0xffffff;
  if (typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v)) return parseInt(v.replace('#', ''), 16);
  return fallback;
}

function ranged(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseLook(raw: unknown): Look {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    jersey: hexNum(o.jersey, DEFAULT_LOOK.jersey),
    pants: hexNum(o.pants, DEFAULT_LOOK.pants),
    helmet: hexNum(o.helmet, DEFAULT_LOOK.helmet),
    skin: o.skin === 'dark' ? 'dark' : 'light',
    height: ranged(o.height, DEFAULT_LOOK.height, 1.6, 2.3),
    build: ranged(o.build, DEFAULT_LOOK.build, 0.6, 1.55),
    limb: ranged(o.limb, DEFAULT_LOOK.limb, 0.55, 1.65),
  };
}

export function loadLook(): Look {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_LOOK };
    const raw = localStorage.getItem(LOOK_KEY);
    if (!raw) return { ...DEFAULT_LOOK };
    return parseLook(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_LOOK };
  }
}

export function saveLook(look: Look): void {
  const next = parseLook(look);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOOK_KEY, JSON.stringify(next));
  } catch { /* private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tdfb-look'));
}

/** Distance in 0–255 RGB. Used so a human jersey doesn't sit on the maroon defense. */
export function colorDist(a: number, b: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/** CPU bodies. Defense stays maroon unless that would match someone in the room. */
export function aiLook(role: string, humanJerseys: number[]): Look {
  let jersey = role === 'DF' ? DF_JERSEY : (PLAYER_COLORS[role] ?? DEFAULT_LOOK.jersey);
  if (role === 'DF' && humanJerseys.some((j) => colorDist(j, DF_JERSEY) < 80)) jersey = DF_ALT;
  return {
    jersey,
    pants: 0xf2f2f2,
    helmet: role === 'DF' ? 0x212121 : 0xf5f5f5,
    skin: 'light',
    height: DEFAULT_LOOK.height,
    build: DEFAULT_LOOK.build,
    limb: DEFAULT_LOOK.limb,
  };
}
