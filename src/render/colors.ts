export const PLAYER_COLORS: Record<string, number> = {
  QB: 0xd32f2f,
  WR: 0x1e63c9,
  RB: 0xef6c00,
  TB: 0xffb74d,
  DF: 0x6a1b9a,
};

/** A lob stays blue and a bullet stays orange, pulled a little toward gray. */
export const LOB_COLOR = 0x6eafd6;
export const BULLET_COLOR = 0xe08a66;

export function loftRgb(loft: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, loft));
  const lob = [0x6e, 0xaf, 0xd6];
  const bullet = [0xe0, 0x8a, 0x66];
  return [
    Math.round(lob[0] + (bullet[0] - lob[0]) * t),
    Math.round(lob[1] + (bullet[1] - lob[1]) * t),
    Math.round(lob[2] + (bullet[2] - lob[2]) * t),
  ];
}
