import { FIELD_L, FIELD_W } from '../config/constants';

/** Shared yardage texture. ppy = pixels per yard. */
export function makeFieldCanvas(ppy = 20): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(FIELD_W * ppy);
  c.height = FIELD_L * ppy;
  const g = c.getContext('2d');
  if (!g) return c;
  const Y = (y: number) => (FIELD_L - y) * ppy;
  const X = (x: number) => x * ppy;
  for (let y = 0; y < FIELD_L; y += 5) {
    g.fillStyle = (Math.floor(y / 5) % 2) ? '#2f7d32' : '#2a7330';
    g.fillRect(0, Y(y + 5), c.width, 5 * ppy);
  }
  g.fillStyle = '#1d5a8a';
  g.fillRect(0, Y(10), c.width, 10 * ppy);
  g.fillStyle = '#8a1d1d';
  g.fillRect(0, Y(120), c.width, 10 * ppy);
  g.strokeStyle = 'rgba(255,255,255,.92)';
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.lineWidth = ppy * 0.12;
  for (let y = 10; y <= 110; y += 5) {
    g.beginPath();
    g.moveTo(0, Y(y));
    g.lineTo(c.width, Y(y));
    g.stroke();
  }
  g.lineWidth = ppy * 0.55;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, c.width - g.lineWidth, c.height - g.lineWidth);
  g.lineWidth = ppy * 0.08;
  const hash = 23.58;
  for (let y = 11; y < 110; y++) {
    if (y % 5 === 0) continue;
    for (const [x0, x1] of [[0.3, 1], [FIELD_W - 1, FIELD_W - 0.3], [hash - 0.35, hash + 0.35], [FIELD_W - hash - 0.35, FIELD_W - hash + 0.35]]) {
      g.beginPath();
      g.moveTo(X(x0), Y(y));
      g.lineTo(X(x1), Y(y));
      g.stroke();
    }
  }
  g.font = `bold ${ppy * 2}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let y = 20; y <= 100; y += 10) {
    const n = y <= 60 ? y - 10 : 110 - y;
    for (const [x, r] of [[9, Math.PI / 2], [FIELD_W - 9, -Math.PI / 2]] as const) {
      g.save();
      g.translate(X(x), Y(y));
      g.rotate(r);
      g.fillText(String(n), 0, 0);
      g.restore();
    }
  }
  g.font = `bold ${ppy * 4}px sans-serif`;
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.fillText('HOME', c.width / 2, Y(5));
  g.fillText('END ZONE', c.width / 2, Y(115));
  return c;
}
