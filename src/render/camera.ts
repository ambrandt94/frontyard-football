import { rad } from '../sim/math';

/** A framed world point. z is height in yards. */
export interface FramePoint {
  x: number;
  y: number;
  z?: number;
}

export type CameraRig = 'all22' | 'topdown' | 'broadcast';

interface V3 {
  x: number;
  y: number;
  z: number;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return mul(a, 1 / l);
};

/**
 * Horizontal look direction in field space. 0 looks upfield (+y).
 * All-22 sits behind the offense. Broadcast sits on the sideline so the
 * attack direction runs toward the right of the screen.
 */
export function rigAzimuth(rig: 'all22' | 'broadcast', attack: 1 | -1): number {
  if (rig === 'broadcast') return attack > 0 ? -Math.PI / 2 : Math.PI / 2;
  return attack > 0 ? 0 : Math.PI;
}

export function cameraBasis(pitchDeg: number, azimuth: number) {
  const pitch = rad(Math.max(18, Math.min(78, pitchDeg)));
  const fx = Math.sin(azimuth);
  const fy = Math.cos(azimuth);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const f: V3 = { x: fx * cp, y: -sp, z: -fy * cp };
  const zaxis = mul(f, -1);
  const xaxis = norm(cross({ x: 0, y: 1, z: 0 }, zaxis));
  const yaxis = cross(zaxis, xaxis);
  return { f, xaxis, yaxis };
}

/** Screen-right, in field x/y, so the settings panel can be kept off the action. */
export function screenRightField(pitchDeg: number, azimuth: number): { x: number; y: number } {
  const { xaxis } = cameraBasis(pitchDeg, azimuth);
  return { x: xaxis.x, y: -xaxis.z };
}

export interface Projected {
  x: number;
  y: number;
  depth: number;
}

/** Perspective NDC of a field point. +y is up the screen, matching Three.js. */
export function projectField(
  p: FramePoint,
  lookX: number,
  lookY: number,
  dist: number,
  pitchDeg: number,
  azimuth: number,
  fovDeg: number,
  aspect: number,
  lookH = 0.35,
): Projected {
  const { f, xaxis, yaxis } = cameraBasis(pitchDeg, azimuth);
  const C: V3 = {
    x: lookX - f.x * dist,
    y: lookH - f.y * dist,
    z: -lookY - f.z * dist,
  };
  const V = sub({ x: p.x, y: p.z ?? 0, z: -p.y }, C);
  const depth = dot(V, f);
  const t = Math.tan(rad(fovDeg) / 2);
  const safe = Math.max(aspect, 0.2);
  if (depth <= 0.05) return { x: 99, y: 99, depth };
  return {
    x: dot(V, xaxis) / depth / (t * safe),
    y: dot(V, yaxis) / depth / t,
    depth,
  };
}

export interface AngledFitInput {
  points: FramePoint[];
  aspect: number;
  pitch: number;
  fov: number;
  azimuth: number;
  /** Extra yards to slide the look point toward the goal being attacked. */
  upfieldBias: number;
  /** Scales the fitted distance. Above 1 sits higher and sees more. */
  heightBias: number;
  /** Smallest field length that must stay in frame, in yards. */
  minYards: number;
  padding: number;
  /** Yards to shift the look point toward screen-right (the settings panel). */
  panelShift: number;
  attack: 1 | -1;
}

export interface AngledFit {
  lookX: number;
  lookY: number;
  dist: number;
}

const MARGIN = 0.9;

/**
 * Smallest camera distance along the fixed pitch that keeps every framed
 * point, plus a minimum yard window, inside the view.
 */
export function fitAngledCamera(input: AngledFitInput): AngledFit {
  const pts = input.points.length ? input.points : [{ x: 26, y: 40, z: 0 }];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const right = screenRightField(input.pitch, input.azimuth);
  const attack = input.attack >= 0 ? 1 : -1;
  const lookX = cx + right.x * input.panelShift;
  const lookY = cy + attack * input.upfieldBias + right.y * input.panelShift;
  const pad = Math.max(0, input.padding);
  const padded: FramePoint[] = pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const l = Math.hypot(dx, dy);
    const z = p.z ?? 0;
    if (l < 0.05) return { x: p.x, y: p.y, z };
    const s = (l + pad) / l;
    return { x: cx + dx * s, y: cy + dy * s, z };
  });
  const half = Math.max(4, input.minYards) / 2;
  const ghosts: FramePoint[] = [
    { x: cx, y: cy + half, z: 0 },
    { x: cx, y: cy - half, z: 0 },
    { x: cx + half * 0.5, y: cy, z: 0 },
    { x: cx - half * 0.5, y: cy, z: 0 },
  ];
  const all = padded.concat(ghosts);
  const pitch = input.pitch;
  const fov = input.fov;
  const aspect = input.aspect;
  const azimuth = input.azimuth;
  const inside = (dist: number) => all.every((p) => {
    const n = projectField(p, lookX, lookY, dist, pitch, azimuth, fov, aspect);
    return n.depth > 1.2 && Math.abs(n.x) <= MARGIN && Math.abs(n.y) <= MARGIN;
  });
  let lo = 10;
  let hi = 560;
  if (!inside(hi)) hi = 560;
  else {
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) hi = mid;
      else lo = mid;
    }
  }
  const bias = Math.max(0.55, input.heightBias);
  return { lookX, lookY, dist: hi * bias };
}

/** Three.js position and look target for an angled rig. */
export function angledPose(
  lookX: number,
  lookY: number,
  dist: number,
  pitchDeg: number,
  azimuth: number,
  lookH = 0.35,
): { px: number; py: number; pz: number; lx: number; ly: number; lz: number } {
  const { f } = cameraBasis(pitchDeg, azimuth);
  return {
    px: lookX - f.x * dist,
    py: lookH - f.y * dist,
    pz: -lookY - f.z * dist,
    lx: lookX,
    ly: lookH,
    lz: -lookY,
  };
}
