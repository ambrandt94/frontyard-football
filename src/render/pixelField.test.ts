import { describe, expect, it } from 'vitest';
import { FIELD_L, FIELD_W } from '../config/constants';
import { PIXEL_COLORS, PIXEL_HASH_X, PIXEL_PPY, paintPixelField } from './pixelField';
import { sidelineFade } from './three/stadium';

function at(field: ReturnType<typeof paintPixelField>, x: number, y: number) {
  const i = Math.min(field.w - 1, Math.max(0, Math.floor(x * PIXEL_PPY)));
  const j = Math.min(field.h - 1, Math.max(0, Math.floor((FIELD_L - y) * PIXEL_PPY - 1e-6)));
  const o = (j * field.w + i) * 4;
  return [field.rgba[o], field.rgba[o + 1], field.rgba[o + 2]] as const;
}

describe('pixel field', () => {
  const field = paintPixelField();

  it('uses an exact 24 texels per yard', () => {
    expect(PIXEL_PPY).toBeGreaterThanOrEqual(16);
    expect(PIXEL_PPY).toBeLessThanOrEqual(24);
    expect(field.w).toBe(Math.round(FIELD_W * PIXEL_PPY));
    expect(field.h).toBe(FIELD_L * PIXEL_PPY);
    expect(field.w).toBe(1280);
    expect(field.h).toBe(2880);
  });

  it('puts the goal lines, the line of scrimmage, and the sideline on the sim yards', () => {
    expect(at(field, FIELD_W / 2, 10)).toEqual(PIXEL_COLORS.paint);
    expect(at(field, FIELD_W / 2, 110)).toEqual(PIXEL_COLORS.paint);
    expect(at(field, FIELD_W / 2, 35)).toEqual(PIXEL_COLORS.paint);
    expect(at(field, 0, 40)).toEqual(PIXEL_COLORS.paint);
    expect(at(field, FIELD_W - 0.01, 40)).toEqual(PIXEL_COLORS.paint);
  });

  it('stripes the grass every five yards and keeps the end zones solid', () => {
    expect(at(field, 26, 12.5)).toEqual(PIXEL_COLORS.warm);
    expect(at(field, 26, 17.5)).toEqual(PIXEL_COLORS.cool);
    expect(at(field, 2, 2)).toEqual(PIXEL_COLORS.near);
    expect(at(field, 2, 118)).toEqual(PIXEL_COLORS.far);
  });

  it('paints hashes on the classic hash and a wordmark in the end zone', () => {
    expect(at(field, PIXEL_HASH_X, 12)).toEqual(PIXEL_COLORS.paint);
    expect(at(field, PIXEL_HASH_X, 12.45)).toEqual(PIXEL_COLORS.warm);
    let letters = 0;
    let blue = 0;
    for (let x = FIELD_W / 2 - 8; x <= FIELD_W / 2 + 8; x += 0.25) {
      const px = at(field, x, 5);
      if (px[0] === PIXEL_COLORS.paint[0]) letters++;
      if (px[0] === PIXEL_COLORS.near[0]) blue++;
    }
    expect(letters).toBeGreaterThan(8);
    expect(blue).toBeGreaterThan(4);
  });
});

describe('sideline fade', () => {
  it('keeps both stands while the camera is over the field', () => {
    const mid = sidelineFade(FIELD_W / 2);
    expect(mid.left).toBe(1);
    expect(mid.right).toBe(1);
  });

  it('drops the stand that sits between an outside camera and the field', () => {
    expect(sidelineFade(-20).left).toBe(0);
    expect(sidelineFade(-20).right).toBe(1);
    expect(sidelineFade(FIELD_W + 20).right).toBe(0);
    expect(sidelineFade(FIELD_W + 20).left).toBe(1);
  });
});
