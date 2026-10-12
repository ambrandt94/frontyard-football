import { FIELD_L, FIELD_W } from '../config/constants';

/** Texels per yard. 24 divides the 160/3-yard width exactly (1280 texels). */
export const PIXEL_PPY = 24;

/** Same hash the classic field paints, yards from each sideline. */
export const PIXEL_HASH_X = 23.58;

const WARM: RGB = [76, 148, 56];
const COOL: RGB = [44, 112, 88];
const END_NEAR: RGB = [26, 79, 140];
const END_FAR: RGB = [140, 46, 42];
const PAINT: RGB = [243, 236, 220];

export const PIXEL_COLORS = { warm: WARM, cool: COOL, near: END_NEAR, far: END_FAR, paint: PAINT };

type RGB = [number, number, number];

export interface PixelBitmap {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
}

const GLYPH: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
};

function fill(buf: PixelBitmap, x: number, y: number, rw: number, rh: number, color: RGB) {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(buf.w, x + rw);
  const y1 = Math.min(buf.h, y + rh);
  for (let j = y0; j < y1; j++) {
    let o = (j * buf.w + x0) * 4;
    for (let i = x0; i < x1; i++) {
      buf.rgba[o] = color[0];
      buf.rgba[o + 1] = color[1];
      buf.rgba[o + 2] = color[2];
      buf.rgba[o + 3] = 255;
      o += 4;
    }
  }
}

/** Horizontal strip centered on a field y, in texel rows from the top of the image. */
function hLine(buf: PixelBitmap, fieldY: number, x0: number, x1: number, thick: number, color: RGB) {
  const center = (FIELD_L - fieldY) * PIXEL_PPY;
  const half = thick / 2;
  const i0 = Math.floor(Math.min(x0, x1) * PIXEL_PPY);
  const i1 = Math.ceil(Math.max(x0, x1) * PIXEL_PPY);
  const j0 = Math.floor(center - half);
  const j1 = Math.ceil(center + half);
  fill(buf, i0, j0, i1 - i0, j1 - j0, color);
}

function vEdge(buf: PixelBitmap, fromRight: boolean, thick: number, color: RGB) {
  fill(buf, fromRight ? buf.w - thick : 0, 0, thick, buf.h, color);
}

/**
 * Chunks of a 5×7 font. `facing` turns the tops of the letters.
 * field: tops upfield, readable from behind the offense.
 * left / right: tops point at the middle of the field, the way sideline numbers do.
 */
function stamp(buf: PixelBitmap, text: string, fieldX: number, fieldY: number, scale: number, color: RGB, facing: 'field' | 'left' | 'right') {
  const gw = 5;
  const gh = 7;
  const gap = 1;
  const cols = text.length * (gw + gap) - gap;
  const tw = cols * scale;
  const th = gh * scale;
  const cx = fieldX * PIXEL_PPY;
  const cy = (FIELD_L - fieldY) * PIXEL_PPY;
  for (let ci = 0; ci < text.length; ci++) {
    const rows = GLYPH[text[ci]];
    if (!rows) continue;
    for (let py = 0; py < gh; py++) {
      for (let px = 0; px < gw; px++) {
        if (rows[py][px] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const lx = (ci * (gw + gap) + px) * scale + sx;
            const ly = py * scale + sy;
            let tx: number;
            let ty: number;
            if (facing === 'field') {
              tx = Math.round(cx - tw / 2 + lx);
              ty = Math.round(cy - th / 2 + ly);
            } else if (facing === 'left') {
              tx = Math.round(cx + th / 2 - ly);
              ty = Math.round(cy - tw / 2 + lx);
            } else {
              tx = Math.round(cx - th / 2 + ly);
              ty = Math.round(cy + tw / 2 - lx);
            }
            fill(buf, tx, ty, 1, 1, color);
          }
        }
      }
    }
  }
}

/** Grass, paint, and end zones. One texel is 1/24 yard, so the lines sit on the sim's yards. */
export function paintPixelField(): PixelBitmap {
  const w = Math.round(FIELD_W * PIXEL_PPY);
  const h = FIELD_L * PIXEL_PPY;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const buf = { w, h, rgba };
  for (let band = 0; band < FIELD_L; band += 5) {
    const top = (FIELD_L - (band + 5)) * PIXEL_PPY;
    fill(buf, 0, top, w, 5 * PIXEL_PPY, (band / 5) % 2 === 0 ? WARM : COOL);
  }
  fill(buf, 0, (FIELD_L - 10) * PIXEL_PPY, w, 10 * PIXEL_PPY, END_NEAR);
  fill(buf, 0, 0, w, 10 * PIXEL_PPY, END_FAR);
  stamp(buf, 'FRONTYARD', FIELD_W / 2, 5, 7, PAINT, 'field');
  stamp(buf, 'FRONTYARD', FIELD_W / 2, 115, 7, PAINT, 'field');
  for (let y = 10; y <= 110; y += 5) hLine(buf, y, 0, FIELD_W, y === 10 || y === 110 ? 4 : 2, PAINT);
  for (let y = 11; y < 110; y++) {
    if (y % 5 === 0) continue;
    hLine(buf, y, 0.3, 1, 2, PAINT);
    hLine(buf, y, FIELD_W - 1, FIELD_W - 0.3, 2, PAINT);
    hLine(buf, y, PIXEL_HASH_X - 0.35, PIXEL_HASH_X + 0.35, 2, PAINT);
    hLine(buf, y, FIELD_W - PIXEL_HASH_X - 0.35, FIELD_W - PIXEL_HASH_X + 0.35, 2, PAINT);
  }
  for (let y = 20; y <= 100; y += 10) {
    const n = String(y <= 60 ? y - 10 : 110 - y);
    stamp(buf, n, 9, y, 6, PAINT, 'left');
    stamp(buf, n, FIELD_W - 9, y, 6, PAINT, 'right');
  }
  vEdge(buf, false, 4, PAINT);
  vEdge(buf, true, 4, PAINT);
  fill(buf, 0, h - 4, w, 4, PAINT);
  fill(buf, 0, 0, w, 4, PAINT);
  return buf;
}

export function pixelFieldCanvas(): HTMLCanvasElement {
  const bmp = paintPixelField();
  const canvas = document.createElement('canvas');
  canvas.width = bmp.w;
  canvas.height = bmp.h;
  const g = canvas.getContext('2d');
  if (g) g.putImageData(new ImageData(new Uint8ClampedArray(bmp.rgba), bmp.w, bmp.h), 0, 0);
  return canvas;
}

/** A small repeating tile. Alpha stays 255. */
export function paintTile(kind: 'track' | 'plank' | 'fence' | 'tower' | 'press'): PixelBitmap {
  if (kind === 'track') return paintTrack();
  if (kind === 'plank') return paintPlank();
  if (kind === 'fence') return paintFence();
  if (kind === 'tower') return paintTower();
  return paintPress();
}

function solid(w: number, h: number, color: RGB): PixelBitmap {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const buf = { w, h, rgba };
  fill(buf, 0, 0, w, h, color);
  return buf;
}

function paintTrack(): PixelBitmap {
  const buf = solid(48, 24, [122, 70, 52]);
  const mortar: RGB = [74, 42, 34];
  fill(buf, 0, 0, 48, 2, mortar);
  fill(buf, 0, 0, 2, 24, mortar);
  fill(buf, 24, 12, 2, 12, mortar);
  return buf;
}

function paintPlank(): PixelBitmap {
  const buf = solid(48, 24, [154, 163, 171]);
  const gap: RGB = [78, 88, 98];
  const warm: RGB = [210, 196, 168];
  for (let y = 0; y < 24; y += 8) {
    fill(buf, 0, y, 48, 1, gap);
    fill(buf, 0, y + 1, 48, 1, warm);
  }
  return buf;
}

function paintFence(): PixelBitmap {
  const buf = solid(32, 32, [42, 48, 56]);
  const slat: RGB = [168, 176, 184];
  for (let x = 0; x < 32; x += 4) fill(buf, x, 0, 3, 32, slat);
  return buf;
}

function paintTower(): PixelBitmap {
  const buf = solid(16, 32, [58, 66, 76]);
  const lamp: RGB = [255, 214, 120];
  const cool: RGB = [86, 96, 108];
  fill(buf, 0, 0, 16, 10, [40, 46, 54]);
  for (let y = 2; y < 8; y += 3) {
    for (let x = 2; x < 14; x += 4) fill(buf, x, y, 2, 2, lamp);
  }
  fill(buf, 0, 10, 16, 1, cool);
  return buf;
}

function paintPress(): PixelBitmap {
  const buf = solid(64, 32, [92, 98, 108]);
  const warm: RGB = [196, 184, 160];
  const glass: RGB = [150, 206, 224];
  const frame: RGB = [46, 52, 62];
  for (let y = 20; y < 32; y += 4) fill(buf, 0, y, 64, 1, warm);
  fill(buf, 0, 4, 64, 12, frame);
  for (let x = 2; x < 64; x += 8) fill(buf, x, 6, 5, 8, glass);
  return buf;
}

/** Static dots. Empty texels are transparent so the plank shows through. */
export function paintCrowd(): PixelBitmap {
  const w = 128;
  const h = 24;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const shirts: RGB[] = [[196, 64, 58], [48, 96, 180], [232, 196, 92], [240, 236, 228], [56, 140, 88]];
  const buf = { w, h, rgba };
  for (let i = 0; i < 16; i++) {
    const x = 4 + i * 8;
    const shirt = shirts[i % shirts.length];
    fill(buf, x + 1, 4, 2, 2, [40, 32, 28]);
    fill(buf, x, 7, 4, 5, shirt);
  }
  return buf;
}

export function bitmapCanvas(bmp: PixelBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bmp.w;
  canvas.height = bmp.h;
  const g = canvas.getContext('2d');
  if (g) g.putImageData(new ImageData(new Uint8ClampedArray(bmp.rgba), bmp.w, bmp.h), 0, 0);
  return canvas;
}
