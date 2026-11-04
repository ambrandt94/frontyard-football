import { PLAYER_COLORS } from '../render/colors';

/** Detail colors layered on top of the jersey, pants, and helmet masks. */
export interface KitTrim {
  jerseyG: number;
  jerseyB: number;
  pantsR: number;
  pantsG: number;
  face: number;
  helmetR: number;
  helmetG: number;
  helmetB: number;
}

/** Colors and build a person picked. Saved on this machine and sent with the roster. */
export interface Look {
  jersey: number;
  pants: number;
  helmet: number;
  skin: 'light' | 'dark';
  /** Exact skin tint from a FootballTheater preset. Null uses the light/dark swatch. */
  skinColor: number | null;
  /** Crown height in yards. */
  height: number;
  /** Shoulder and hip width. 1 is average. */
  build: number;
  /** Arm and leg thickness. 1 is average. */
  limb: number;
  /** Jersey, pants, and helmet mask ids. Empty means a solid color. */
  jerseyPattern: string;
  pantsPattern: string;
  helmetPattern: string;
  number: number;
  font: string;
  /** FootballTheater team and uniform. Empty when the kit was picked by hand. */
  team: string;
  uniform: string;
  /** Only the local Stash mesh can be shown. Everything else is missing. */
  beard: '' | 'stash';
  trim: KitTrim;
}

export const DEFAULT_TRIM: KitTrim = {
  jerseyG: 0xf4f7f8,
  jerseyB: 0x1a1a1a,
  pantsR: 0xf4f7f8,
  pantsG: 0x1a1a1a,
  face: 0x2a2e32,
  helmetR: 0xf4f7f8,
  helmetG: 0x1a1a1a,
  helmetB: 0xc8102e,
};

export const DEFAULT_LOOK: Look = {
  jersey: 0x1e63c9,
  pants: 0xf2f2f2,
  helmet: 0xf5f5f5,
  skin: 'light',
  skinColor: null,
  height: 2,
  build: 1,
  limb: 1,
  jerseyPattern: '',
  pantsPattern: '',
  helmetPattern: '',
  number: 12,
  font: 'Ranked',
  team: '',
  uniform: '',
  beard: '',
  trim: { ...DEFAULT_TRIM },
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

function text(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v.slice(0, 48) : fallback;
}

function trimOf(raw: unknown): KitTrim {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    jerseyG: hexNum(o.jerseyG, DEFAULT_TRIM.jerseyG),
    jerseyB: hexNum(o.jerseyB, DEFAULT_TRIM.jerseyB),
    pantsR: hexNum(o.pantsR, DEFAULT_TRIM.pantsR),
    pantsG: hexNum(o.pantsG, DEFAULT_TRIM.pantsG),
    face: hexNum(o.face, DEFAULT_TRIM.face),
    helmetR: hexNum(o.helmetR, DEFAULT_TRIM.helmetR),
    helmetG: hexNum(o.helmetG, DEFAULT_TRIM.helmetG),
    helmetB: hexNum(o.helmetB, DEFAULT_TRIM.helmetB),
  };
}

export function parseLook(raw: unknown): Look {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const skinColor = o.skinColor == null ? null : hexNum(o.skinColor, SKIN_TONE.light);
  return {
    jersey: hexNum(o.jersey, DEFAULT_LOOK.jersey),
    pants: hexNum(o.pants, DEFAULT_LOOK.pants),
    helmet: hexNum(o.helmet, DEFAULT_LOOK.helmet),
    skin: o.skin === 'dark' ? 'dark' : 'light',
    skinColor,
    height: ranged(o.height, DEFAULT_LOOK.height, 1.6, 2.3),
    build: ranged(o.build, DEFAULT_LOOK.build, 0.6, 1.55),
    limb: ranged(o.limb, DEFAULT_LOOK.limb, 0.55, 1.65),
    jerseyPattern: text(o.jerseyPattern, ''),
    pantsPattern: text(o.pantsPattern, ''),
    helmetPattern: text(o.helmetPattern, ''),
    number: Math.round(ranged(o.number, DEFAULT_LOOK.number, 0, 99)),
    font: text(o.font, DEFAULT_LOOK.font),
    team: text(o.team, ''),
    uniform: text(o.uniform, ''),
    beard: o.beard === 'stash' ? 'stash' : '',
    trim: trimOf(o.trim),
  };
}

export function skinHex(look: Look): number {
  return look.skinColor == null ? SKIN_TONE[look.skin] : look.skinColor;
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
  const number = role === 'QB' ? 12 : role === 'WR' ? 11 : role === 'RB' ? 22 : role === 'OL' ? 60 : role === 'DF' ? 54 : 12;
  return parseLook({
    jersey,
    pants: 0xf2f2f2,
    helmet: role === 'OL' ? 0xf9a825 : role === 'DF' ? 0x212121 : 0xf5f5f5,
    skin: 'light',
    height: DEFAULT_LOOK.height,
    build: role === 'OL' ? 1.32 : DEFAULT_LOOK.build,
    limb: role === 'OL' ? 1.15 : DEFAULT_LOOK.limb,
    number,
  });
}
