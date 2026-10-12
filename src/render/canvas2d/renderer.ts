import type { Settings } from '../../config/defaults';
import { CAM_FOV, FIELD_L, FIELD_W, LOS_Y } from '../../config/constants';
import { clamp, rad } from '../../sim/math';
import type { SimState } from '../../sim/types';
import { PLAYER_COLORS } from '../colors';
import { makeFieldCanvas } from '../field';
import type { FieldRenderer, ViewState } from '../types';

export function createCanvasRenderer(S: Settings): FieldRenderer {
  let cv: HTMLCanvasElement = null!;
  let g: CanvasRenderingContext2D = null!;
  let el: HTMLElement = null!;
  let st: SimState = null!;
  let view: ViewState | null = null;
  let field: HTMLCanvasElement = null!;
  let scale = 10;
  const api: FieldRenderer = {
    name: 'canvas2d',
    init(container) {
      el = container;
      cv = document.createElement('canvas');
      el.appendChild(cv);
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('2d context unavailable');
      g = ctx;
      field = makeFieldCanvas(16);
      api.resize();
    },
    resize() {
      const d = Math.min(2, devicePixelRatio);
      cv.width = (el.clientWidth || innerWidth) * d;
      cv.height = (el.clientHeight || innerHeight) * d;
    },
    sync(s, v) { st = s; view = v; },
    render() {
      if (!view) return;
      const cam = view.cam;
      const W = cv.width, H = cv.height;
      const viewH = 2 * cam.h * Math.tan(rad(CAM_FOV / 2));
      scale = H / viewH;
      const P = (x: number, y: number): [number, number] => [W / 2 + (x - cam.x) * scale, H / 2 - (y - cam.y) * scale];
      g.fillStyle = '#1f5a26';
      g.fillRect(0, 0, W, H);
      const [fx, fy] = P(0, FIELD_L);
      g.drawImage(field, fx, fy, FIELD_W * scale, FIELD_L * scale);
      if (st.mode === 'throw' || st.mode === 'coverage') {
        g.fillStyle = '#40a9ff';
        const [a, b] = P(0, LOS_Y);
        g.fillRect(a, b - 0.15 * scale, FIELD_W * scale, 0.3 * scale);
      }
      if (st.mode === 'run' || st.carry) {
        g.fillStyle = '#ffd54a';
        const [a, b] = P(0, st.carry?.goalY ?? 110);
        g.fillRect(a, b - 0.22 * scale, FIELD_W * scale, 0.45 * scale);
      }
      const poly = (pts: { x: number; y: number }[] | null | undefined, color: string, w = 2) => {
        if (!pts || pts.length < 2) return;
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        pts.forEach((p, i) => {
          const [x, y] = P(p.x, p.y);
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        });
        g.stroke();
      };
      const ring = (x: number, y: number, r: number, color: string, w = 2) => {
        const [a, b] = P(x, y);
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        g.arc(a, b, r * scale, 0, 7);
        g.stroke();
      };
      if (view.route) poly(view.route, 'rgba(255,255,255,.35)', 2);
      view.trails.forEach((tr) => poly(tr.pts, '#' + tr.color.toString(16).padStart(6, '0'), 3));
      const b = st.ball;
      if (b.state === 'air') {
        if (view.showArc) poly(b.arc.map((p) => ({ x: p.x, y: p.y + p.z * 0.35 })), 'rgba(255,245,157,.85)', 2);
        if (b.landing) ring(b.landing.x, b.landing.y, 0.6, '#ff7043', 3);
      }
      if (view.cue) ring(view.cue.x, view.cue.y, 1 + 2.5 * (1 - view.cue.frac), '#ffeb3b', 3);
      if (view.aimGuide) {
        poly([{ x: view.aimGuide.x, y: view.aimGuide.y }, { x: view.aimGuide.x2, y: view.aimGuide.y2 }], 'rgba(255,255,255,.35)', 1.5);
      }
      if (view.preview && view.preview.length > 1) {
        const loft = Math.max(0, Math.min(1, view.previewLoft || 0));
        const cr = Math.round(66 + (255 - 66) * loft);
        const cg = Math.round(165 + (112 - 165) * loft);
        const cb = Math.round(245 + (67 - 245) * loft);
        const pts = view.preview;
        for (let i = 1; i < pts.length; i++) {
          const t = i / (pts.length - 1);
          g.globalAlpha = 0.92 * (1 - t * 0.88);
          g.strokeStyle = `rgb(${cr},${cg},${cb})`;
          g.lineWidth = Math.max(1, 3.2 * (1 - t * 0.75));
          g.setLineDash(i % 2 === 0 ? [5, 7] : []);
          const [x0, y0] = P(pts[i - 1].x, pts[i - 1].y + (pts[i - 1].z || 0) * 0.35);
          const [x1, y1] = P(pts[i].x, pts[i].y + (pts[i].z || 0) * 0.35);
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke();
        }
        g.setLineDash([]);
        g.globalAlpha = 1;
      }
      if (view.previewRing) {
        const loft = Math.max(0, Math.min(1, view.previewLoft || 0));
        const cr = Math.round(66 + (255 - 66) * loft);
        const cg = Math.round(165 + (112 - 165) * loft);
        const cb = Math.round(245 + (67 - 245) * loft);
        ring(view.previewRing.x, view.previewRing.y, view.previewRing.r, `rgb(${cr},${cg},${cb})`, 2);
      }
      if (view.reticle) {
        const r = view.reticle;
        ring(r.x, r.y, 1, '#ffeb3b', 3);
        poly([{ x: r.x - 1.3, y: r.y }, { x: r.x + 1.3, y: r.y }], '#ffeb3b', 2);
        poly([{ x: r.x, y: r.y - 1.3 }, { x: r.x, y: r.y + 1.3 }], '#ffeb3b', 2);
      }
      for (const id in st.players) {
        const p = st.players[id];
        const [x, y] = P(p.x, p.y);
        if (view.showReach && id === 'df') ring(p.x, p.y, p.tackle && p.tackle.kind === 'dive' ? S.diveTackleReach : S.wrapReach, p.tackle ? '#ff5252' : p.squared ? '#ffab40' : 'rgba(255,255,255,.3)', 2);
        if (p.tint != null) ring(p.x, p.y, 1.15, '#' + p.tint.toString(16).padStart(6, '0'), 3);
        if (st.controlled === id) ring(p.x, p.y, 0.9, '#ffd54a', 3);
        if (p.callT != null && st.t - p.callT < 0.9) {
          const [cx, cy] = P(p.x, p.y + 1.2);
          g.fillStyle = '#ffeb3b';
          g.beginPath();
          g.arc(cx, cy, 0.35 * scale, 0, 7);
          g.fill();
        }
        if (view.showReach && id === 'wr') {
          const a = p.attempt;
          ring(p.handX ?? p.x + Math.cos(p.facing) * 0.3, p.handY ?? p.y + Math.sin(p.facing) * 0.3, a ? a.radius : S.catchReach, a ? '#69f0ae' : 'rgba(255,255,255,.35)', 2);
        }
        g.save();
        g.translate(x, y);
        g.rotate(-(p.facing + (p.spinVis || 0)));
        const lying = p.diveT >= 0 || p.groundT > 0;
        const sc = (1 + p.z * 0.25) * scale * S.playerScale;
        g.fillStyle = '#' + (PLAYER_COLORS[p.role] || 0xcccccc).toString(16).padStart(6, '0');
        if (p.planted) {
          g.strokeStyle = p.planted.falling ? '#ffab40' : '#80deea';
          g.lineWidth = 0.22 * sc;
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo((0.3 + (p.stretchReach || 0)) * scale, 0);
          g.stroke();
        }
        if (p.stiffArm) {
          const sd = p.stiffArm === 'L' ? -1 : 1;
          g.strokeStyle = '#ffcc80';
          g.lineWidth = 0.2 * sc;
          g.beginPath();
          g.moveTo(0, sd * 0.4 * sc);
          g.lineTo(0.9 * sc, sd * 1.0 * sc);
          g.stroke();
        }
        if (lying) { g.beginPath(); g.ellipse(0.5 * sc, 0, 1.0 * sc, 0.42 * sc, 0, 0, 7); g.fill(); }
        else { g.beginPath(); g.ellipse(0, 0, 0.42 * sc, 0.65 * sc, 0, 0, 7); g.fill(); }
        g.fillStyle = '#f2f2f2';
        g.beginPath();
        g.arc(lying ? 1.2 * sc : 0, 0, 0.3 * sc, 0, 7);
        g.fill();
        g.fillStyle = '#ffee58';
        g.beginPath();
        g.moveTo((lying ? 1.9 : 0.95) * sc, 0);
        g.lineTo((lying ? 1.4 : 0.45) * sc, 0.22 * sc);
        g.lineTo((lying ? 1.4 : 0.45) * sc, -0.22 * sc);
        g.fill();
        g.restore();
      }
      const [sx, sy] = P(b.x, b.y);
      g.fillStyle = `rgba(0,0,0,${clamp(0.55 - b.z * 0.03, 0.15, 0.55)})`;
      g.beginPath();
      g.arc(sx, sy, 0.3 * (1 + b.z * 0.08) * scale, 0, 7);
      g.fill();
      const [bx, by] = P(b.x, b.y + b.z * 0.35);
      g.save();
      g.translate(bx, by);
      g.rotate(-Math.atan2(b.vy, b.vx) || 0);
      const bsz = (1 + b.z * 0.06) * scale;
      g.fillStyle = '#8d4b1f';
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(0, 0, 0.34 * bsz, 0.21 * bsz, 0, 0, 7);
      g.fill();
      g.stroke();
      g.restore();
    },
    fieldToScreen(x, y) {
      if (!view) return { x: -999, y: -999 };
      const r = cv.getBoundingClientRect();
      const d = cv.width / r.width;
      return {
        x: r.left + (cv.width / 2 + (x - view.cam.x) * scale) / d,
        y: r.top + (cv.height / 2 - (y - view.cam.y) * scale) / d,
      };
    },
    screenToField(cx, cy) {
      if (!view) return null;
      const r = cv.getBoundingClientRect();
      const d = cv.width / r.width;
      return {
        x: view.cam.x + ((cx - r.left) * d - cv.width / 2) / scale,
        y: view.cam.y - ((cy - r.top) * d - cv.height / 2) / scale,
      };
    },
    dispose() { cv.remove(); },
  };
  return api;
}
