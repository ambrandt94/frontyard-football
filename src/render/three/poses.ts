/**
 * Procedural pose table. Rotations are degrees in character space
 * (model +Y up, +Z forward, +X = character's left), applied on top of the bone's current orientation.
 * '*Name' = both sides (Left gets [x,y,z], Right gets the mirror [x,-y,-z]).
 */
import * as THREE from 'three';
import { clamp, lerp } from '../../sim/math';
import type { Player } from '../../sim/types';
import type { ModelInstance } from './model';

type Euler3 = [number, number, number];
type PoseDef = Record<string, Euler3 | number> & { hipsDrop?: number };

export const POSES: Record<string, PoseDef> = {
  stance: { Spine02: [6, 0, 0], '*UpLeg': [-12, 0, 4], '*Leg': [20, 0, 0], '*Arm': [-10, 0, 10], '*ForeArm': [-35, 0, 0], hipsDrop: 0.03 },
  run: { Spine02: [12, 0, 0], Spine01: [4, 0, 0], '*Arm': [0, 0, 6], '*ForeArm': [-75, 0, 0] },
  sprint: { Spine02: [20, 0, 0], Spine01: [6, 0, 0], '*ForeArm': [-85, 0, 0] },
  squared: { Spine02: [22, 0, 0], Spine01: [8, 0, 0], '*UpLeg': [-55, 0, 10], '*Leg': [75, 0, 0], '*Arm': [-45, 0, 18], '*ForeArm': [-40, 0, 0], hipsDrop: 0.16 },
  carryR: { RightArm: [-20, 0, -8], RightForeArm: [-115, 0, 0] },
  carryL: { LeftArm: [-20, 0, 8], LeftForeArm: [-115, 0, 0] },
  throwWindup: { Spine02: [0, -35, 0], RightArm: [20, 0, -105], RightForeArm: [-95, 0, 0], LeftArm: [-80, 0, 15], LeftForeArm: [-20, 0, 0], '*UpLeg': [-10, 0, 8] },
  throwRelease: { Spine02: [18, 30, 0], RightArm: [-120, 0, -15], RightForeArm: [-15, 0, 0], LeftArm: [-10, 0, 25], LeftForeArm: [-60, 0, 0] },
  catchTwo: { Spine02: [-4, 0, 0], '*Arm': [-150, 0, 8], '*ForeArm': [-15, 0, 0] },
  catchOne: { Spine02: [0, 0, -12], RightArm: [-165, 0, -35], RightForeArm: [-5, 0, 0], LeftArm: [-20, 0, 15] },
  callHand: { RightArm: [-175, 0, -12], RightForeArm: [-5, 0, 0] },
  jump: { '*UpLeg': [-45, 0, 6], '*Leg': [70, 0, 0], '*Arm': [-160, 0, 10], '*ForeArm': [-10, 0, 0] },
  hurdle: { LeftUpLeg: [-95, 0, 6], LeftLeg: [35, 0, 0], RightUpLeg: [-35, 0, -6], RightLeg: [110, 0, 0], Spine02: [15, 0, 0], '*Arm': [-30, 0, 35] },
  dive: { '*Arm': [-170, 0, 12], '*ForeArm': [-5, 0, 0], '*UpLeg': [8, 0, 4], '*Leg': [10, 0, 0], Spine02: [-8, 0, 0] },
  plant: { Spine02: [-10, 0, 0], '*UpLeg': [-25, 0, 12], '*Leg': [35, 0, 0], hipsDrop: 0.08 },
  stretch: { Spine02: [10, 0, 0], '*Arm': [-120, 0, 6], '*ForeArm': [-10, 0, 0], LeftUpLeg: [-20, 0, 0], RightUpLeg: [20, 0, 0], RightLeg: [15, 0, 0] },
  fall: { '*Arm': [-165, 0, 15], '*ForeArm': [-5, 0, 0], '*UpLeg': [15, 0, 3] },
  stiffL: { LeftArm: [-85, 0, 35], LeftForeArm: [0, 0, 0], Spine02: [0, 15, 0] },
  stiffR: { RightArm: [-85, 0, -35], RightForeArm: [0, 0, 0], Spine02: [0, -15, 0] },
  truck: { Spine02: [38, 0, 0], Spine01: [12, 0, 0], '*Arm': [-35, 0, 25], '*ForeArm': [-90, 0, 0], hipsDrop: 0.1 },
  tackle: { Spine02: [38, 0, 0], '*Arm': [-85, 0, 35], '*ForeArm': [-50, 0, 0], '*UpLeg': [-35, 0, 8], '*Leg': [45, 0, 0], hipsDrop: 0.12 },
  ground: { '*Arm': [-30, 0, 55], '*ForeArm': [-20, 0, 0], '*UpLeg': [-5, 0, 6] },
  getup: { Spine02: [42, 0, 0], Spine01: [12, 0, 0], '*Arm': [-55, 0, 28], '*ForeArm': [-35, 0, 0], '*UpLeg': [-72, 0, 8], '*Leg': [95, 0, 0], hipsDrop: 0.28 },
  juke: { Spine02: [10, 32, -6], LeftUpLeg: [-18, 28, 10], RightUpLeg: [-48, -18, -8], RightLeg: [62, 0, 0], LeftArm: [-25, 0, 28], RightArm: [-8, 0, -16], hipsDrop: 0.08 },
  cut: { Spine02: [8, -30, 8], LeftUpLeg: [-12, 0, 16], RightUpLeg: [-52, 0, -10], RightLeg: [74, 0, 0], LeftArm: [-28, 0, 22], RightArm: [-8, 0, -18], hipsDrop: 0.06 },
  spin: { Spine02: [12, 48, 0], Spine01: [4, 22, 0], '*Arm': [-42, 0, 26], '*ForeArm': [-20, 0, 0], '*UpLeg': [-22, 12, 6], '*Leg': [28, 0, 0] },
  pitchR: { Spine02: [10, -18, 0], RightArm: [-78, 0, -18], RightForeArm: [-36, 0, 0], LeftArm: [-12, 0, 14], LeftForeArm: [-20, 0, 0] },
  pitchL: { Spine02: [10, 18, 0], LeftArm: [-78, 0, 18], LeftForeArm: [-36, 0, 0], RightArm: [-12, 0, -14], RightForeArm: [-20, 0, 0] },
};

export const RUN_CYCLE = {
  strideYd: 2.3,
  jog: { thigh: 32, knee: 55, arm: 38 },
  sprint: { thigh: 50, knee: 85, arm: 62 },
  bob: 0.03,
};

const ARM_POSES = ['carryR', 'carryL', 'throwWindup', 'throwRelease', 'catchTwo', 'catchOne', 'callHand', 'stiffL', 'stiffR', 'tackle', 'pitchR', 'pitchL', 'juke', 'cut', 'spin'];
const POSE_LIST = Object.keys(POSES);
const POSE_EUL: Record<string, Record<string, Euler3>> = {};
for (const k of POSE_LIST) {
  const e: Record<string, Euler3> = {};
  for (const [b, v] of Object.entries(POSES[k])) {
    if (b === 'hipsDrop' || !Array.isArray(v)) continue;
    const r = v.map((d) => d * Math.PI / 180) as Euler3;
    if (b[0] === '*') {
      e['Left' + b.slice(1)] = r;
      e['Right' + b.slice(1)] = [r[0], -r[1], -r[2]];
    } else e[b] = r;
  }
  POSE_EUL[k] = e;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export interface PoseWorld {
  t: number;
  mode: string;
  ball: { holder: string | null; state: string; throwT: number; pitch?: unknown };
  cm?: { phase: string };
}

export interface PoseView {
  qbCharge: number | null;
}

export function poseTargets(p: Player, st: PoseWorld, view: PoseView) {
  const w: Record<string, number> = {};
  const add = (k: string, v = 1) => { w[k] = (w[k] || 0) + v; };
  const sp = Math.hypot(p.vx, p.vy);
  const t = st.t;
  const b = st.ball;
  if (p.forcePose) { add(p.forcePose); return { w, sp: p.forceSpeed || 0, loco: !!p.forceSpeed }; }
  let loco = false;
  if (p.groundT > 0) {
    const rise = clamp((0.5 - p.groundT) / 0.5, 0, 1);
    add('ground', 1 - rise * 0.85);
    if (rise > 0.02) add('getup', rise);
  } else if (p.diveT >= 0) add('dive');
  else if (p.planted) add(p.planted.falling ? 'fall' : 'stretch', Math.max(0.35, p.stretch || 0));
  else if (p.z > 0.05) add(p.role === 'RB' ? 'hurdle' : 'jump');
  else if (p.tackle && (p.tackle.kind === 'wrap' || p.tackle.kind === 'lunge')) add('tackle');
  else {
    loco = true;
    if (p.attempt) add(p.attempt.type === 'two' ? 'catchTwo' : 'catchOne');
    else if (p.callT != null && t - p.callT < 0.9) add('callHand');
    if (p.role === 'QB') {
      const wind = (view.qbCharge != null && b.holder === p.id) || !!p.visWind || (st.mode === 'catch' && st.cm && st.cm.phase === 'windup');
      if (wind) add('throwWindup');
      else if (b.state === 'air' && !b.pitch && t - b.throwT < 0.35) add('throwRelease');
    }
    if (p.stiffArm) add(p.stiffArm === 'L' ? 'stiffL' : 'stiffR');
    if (p.move && p.move.type === 'truck') add('truck');
    if (p.move && p.move.type === 'juke') add('juke');
    if (p.move && p.move.type === 'sidestep') add('cut');
    if (p.move && p.move.type === 'spin') add('spin');
    if (p.plantT > 0 || (p.cutLock ?? 0) > 0) add('plant');
    if (p.squared) add('squared');
    if (b.holder === p.id && p.pitchUntil > t) add(p.hand === 'L' ? 'pitchL' : 'pitchR');
    else if (b.holder === p.id && p.role !== 'QB' && !p.stiffArm) add(p.hand === 'L' ? 'carryL' : 'carryR');
  }
  return { w, sp, loco };
}

export function poseModel(m: ModelInstance, p: Player, st: PoseWorld, view: PoseView) {
  const dt = m.lastT == null ? 0 : clamp(st.t - m.lastT, 0, 0.1);
  m.lastT = st.t;
  const { w: tgt, sp, loco } = poseTargets(p, st, view);
  const k = p.forcePose ? 1 : 1 - Math.exp(-14 * dt);
  for (const key of new Set([...Object.keys(m.w), ...Object.keys(tgt)])) {
    m.w[key] = (m.w[key] || 0) + ((tgt[key] || 0) - (m.w[key] || 0)) * k;
    if (m.w[key] < 0.002 && !tgt[key]) delete m.w[key];
  }
  const runF = loco ? clamp(sp / 8, 0, 1) : 0;
  const sprintF = loco ? clamp((p.boost || 0) / 1.5, 0, 1) * runF : 0;
  if (p.forcePose) m.phase = p.forcePhase || 1.2;
  else m.phase += dt * sp / RUN_CYCLE.strideYd * Math.PI * 2 * (loco ? 1 : 0);
  const armBusy = clamp(ARM_POSES.reduce((a, kk) => a + (m.w[kk] || 0), 0), 0, 1);
  const lw: Record<string, number> = { ...m.w };
  if (loco) {
    lw.run = (lw.run || 0) + runF * (1 - sprintF);
    lw.sprint = (lw.sprint || 0) + sprintF;
    lw.stance = (lw.stance || 0) + (1 - runF) * (1 - Math.min(1, (m.w.squared || 0) + (m.w.plant || 0)));
  }
  m.bones.forEach((bn, i) => bn.quaternion.copy(m.rest[i]));
  m.hips.position.copy(m.hipsRest);
  const off: Record<string, Euler3> = {};
  const addE = (bone: string, r: Euler3, s: number) => {
    const o = off[bone] || (off[bone] = [0, 0, 0]);
    o[0] += r[0] * s; o[1] += r[1] * s; o[2] += r[2] * s;
  };
  let drop = 0;
  for (const [key, wt] of Object.entries(lw)) {
    if (!POSE_EUL[key] || wt < 0.002) continue;
    for (const [bone, r] of Object.entries(POSE_EUL[key])) addE(bone, r, wt);
    drop += (POSES[key].hipsDrop || 0) * wt;
  }
  const sw = runF;
  if (sw > 0.01) {
    const A = {
      thigh: lerp(RUN_CYCLE.jog.thigh, RUN_CYCLE.sprint.thigh, sprintF),
      knee: lerp(RUN_CYCLE.jog.knee, RUN_CYCLE.sprint.knee, sprintF),
      arm: lerp(RUN_CYCLE.jog.arm, RUN_CYCLE.sprint.arm, sprintF),
    };
    const s1 = Math.sin(m.phase);
    const swingL = Math.max(0, s1);
    const swingR = Math.max(0, -s1);
    const d = Math.PI / 180;
    addE('LeftUpLeg', [-A.thigh * s1 * d, 0, 0], sw);
    addE('RightUpLeg', [A.thigh * s1 * d, 0, 0], sw);
    addE('LeftLeg', [(14 + (A.knee - 14) * swingL) * d, 0, 0], sw);
    addE('RightLeg', [(14 + (A.knee - 14) * swingR) * d, 0, 0], sw);
    addE('LeftFoot', [(-24 * swingL + 8 * (1 - swingL)) * d, 0, 0], sw);
    addE('RightFoot', [(-24 * swingR + 8 * (1 - swingR)) * d, 0, 0], sw);
    addE('Hips', [0, -7 * s1 * d, 0], sw);
    addE('Spine01', [0, 5 * s1 * d, 0], sw);
    const as = sw * (1 - armBusy);
    addE('LeftArm', [A.arm * s1 * d, 0, 0], as * (m.w.carryL ? 0.2 : 1));
    addE('RightArm', [-A.arm * s1 * d, 0, 0], as * (m.w.carryR ? 0.2 : 1));
    drop += RUN_CYCLE.bob * Math.abs(Math.cos(m.phase)) * sw;
  }
  const cq = m.cq;
  for (const bn of m.bones) {
    const P = bn === m.hips || !cq.has(bn.parent as THREE.Bone) ? m.armQ : cq.get(bn.parent as THREE.Bone)!;
    const o = off[bn.name];
    if (o) {
      _q.setFromEuler(_e.set(o[0], o[1], o[2], 'YXZ'));
      _q2.copy(P).invert().multiply(_q).multiply(P);
      bn.quaternion.premultiply(_q2);
    }
    const c = cq.get(bn) || new THREE.Quaternion();
    c.copy(P).multiply(bn.quaternion);
    cq.set(bn, c);
  }
  if (drop > 0.001) {
    m.root.updateMatrixWorld(true);
    m.hips.getWorldPosition(_v);
    m.root.worldToLocal(_v);
    _v.y -= drop * m.hipsH;
    m.root.localToWorld(_v);
    m.hips.parent?.worldToLocal(_v);
    m.hips.position.copy(_v);
  }
}

const PREVIEW_PLAYER = {
  id: 'preview', role: 'WR', x: 0, y: 0, z: 0, vx: 0, vy: 4.4, facing: 0,
  hand: 'R', handSwitchT: 0, diveT: -1, groundT: 0, boost: 0, pitchUntil: 0,
  move: null, stiffArm: null, attempt: null, tackle: null, plantT: 0, squared: false,
} as Player;

const PREVIEW_BALL = { holder: null, state: 'dead', throwT: 0 };

/** Jog the procedural cycle in the My Player preview. */
export function previewJog(m: ModelInstance, dt: number) {
  const start = m.lastT == null;
  const t = (m.lastT ?? 0) + Math.max(0.016, dt);
  if (start) m.lastT = t - 0.2;
  poseModel(m, PREVIEW_PLAYER, { t, mode: 'free', ball: PREVIEW_BALL }, { qbCharge: null });
}
