/**
 * Visual-only arm IK. The sim still decides catches, reaches, and where the
 * ball is for gameplay. This layer aims the posed arms and seats the drawn
 * ball on the hand bones.
 *
 * Chain is shoulder → elbow → wrist (LeftArm / LeftForeArm / LeftHand, and the
 * right side). Bone length runs along local +Y. Poles keep the elbows out and
 * down, and a minimum bend keeps the arm from flipping through straight.
 */
import * as THREE from 'three';
import type { Settings } from '../../config/defaults';
import type { Player, SimState } from '../../sim/types';
import type { ModelInstance } from './model';

export const SOCKET_MAX_YD = 0.1;
/** Hands finish the tuck into the carry in this many seconds. */
export const TUCK_SEC = 0.26;
const MIN_BEND = 8 * Math.PI / 180;
const WEIGHT_TAU = 0.09;

export type SocketKind = 'carry' | 'chest' | 'windup' | 'catch' | 'dive';
export type ArmSide = 'L' | 'R';

/** Wrist → palm, in a frame built from the forearm, the chest, and up. The parts sum to under 0.1 yd. */
export const SOCKET: Record<SocketKind, { along: number; inward: number; lift: number }> = {
  carry: { along: 0.048, inward: 0.03, lift: 0.012 },
  chest: { along: 0.04, inward: 0.02, lift: 0.01 },
  windup: { along: 0.055, inward: 0.015, lift: 0.02 },
  catch: { along: 0.042, inward: 0.018, lift: 0 },
  dive: { along: 0.05, inward: 0.012, lift: -0.01 },
};

export interface V {
  x: number;
  y: number;
  z: number;
}

export interface ArmBasis {
  left: V;
  up: V;
  fwd: V;
}

export interface HandGoal {
  x: number;
  y: number;
  z: number;
  weight: number;
}

export interface BallAnchor {
  side: ArmSide | 'both';
  kind: SocketKind;
}

export interface ArmGoals {
  left: HandGoal | null;
  right: HandGoal | null;
  anchor: BallAnchor | null;
  /** Where an in-flight ball is being met, in three.js yards. */
  air: V | null;
}

export interface IkMem {
  holder: string | null;
  tuckT: number;
  from: V | null;
  fromSide: ArmSide | 'both' | null;
  catchAt: V | null;
  catchSide: ArmSide | 'both' | null;
  lastT: number | null;
  wL: number;
  wR: number;
  lastL: HandGoal | null;
  lastR: HandGoal | null;
  hintL: V | null;
  hintR: V | null;
}

export interface SolveResult {
  elbow: V;
  hand: V;
  clamped: boolean;
}

const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a: V) => Math.hypot(a.x, a.y, a.z);
const norm = (a: V): V => {
  const l = vlen(a) || 1;
  return scale(a, 1 / l);
};
const lerpV = (a: V, b: V, t: number): V => add(a, scale(sub(b, a), t));
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smoothstep = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
const copyV = (a: V): V => ({ x: a.x, y: a.y, z: a.z });

function safeNorm(a: V, fallback: V): V {
  return vlen(a) < 1e-4 ? fallback : norm(a);
}

/** Longest a socket offset can be, even if its axes line up. */
export function socketSpan(kind: SocketKind): number {
  const s = SOCKET[kind];
  return Math.abs(s.along) + Math.abs(s.inward) + Math.abs(s.lift);
}

export function freshMem(): IkMem {
  return {
    holder: null, tuckT: -1, from: null, fromSide: null, catchAt: null, catchSide: null,
    lastT: null, wL: 0, wR: 0, lastL: null, lastR: null, hintL: null, hintR: null,
  };
}

export function fieldToThree(x: number, y: number, z: number): V {
  return { x, y: z, z: -y };
}

export function solveTwoBone(shoulder: V, target: V, pole: V, upper: number, fore: number, hint?: V | null): SolveResult {
  const upperL = Math.max(1e-4, upper);
  const foreL = Math.max(1e-4, fore);
  const raw = sub(target, shoulder);
  const rawLen = vlen(raw);
  const dir = rawLen < 1e-5 ? { x: 0, y: 0, z: 1 } : scale(raw, 1 / rawLen);
  const cosMin = Math.cos(MIN_BEND);
  const maxReach = Math.sqrt(Math.max(0, upperL * upperL + foreL * foreL + 2 * upperL * foreL * cosMin));
  const minReach = Math.abs(upperL - foreL) + Math.min(upperL, foreL) * 0.08;
  const dist = Math.min(maxReach, Math.max(minReach, rawLen < 1e-5 ? minReach : rawLen));
  let poleDir = sub(pole, shoulder);
  poleDir = sub(poleDir, scale(dir, dot(poleDir, dir)));
  if (vlen(poleDir) < 1e-4 && hint) {
    poleDir = sub(hint, shoulder);
    poleDir = sub(poleDir, scale(dir, dot(poleDir, dir)));
  }
  if (vlen(poleDir) < 1e-4) {
    const up = Math.abs(dir.y) > 0.85 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    poleDir = cross(dir, up);
  }
  poleDir = norm(poleDir);
  const cosA = Math.max(-1, Math.min(1, (upperL * upperL + dist * dist - foreL * foreL) / (2 * upperL * dist)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elbow = add(shoulder, add(scale(dir, upperL * cosA), scale(poleDir, upperL * sinA)));
  const hand = add(shoulder, scale(dir, dist));
  return { elbow, hand, clamped: Math.abs(dist - rawLen) > 1e-3 };
}

/** Palm socket in front of the wrist. Always within SOCKET_MAX_YD of the wrist. */
export function palmSocket(wrist: V, elbow: V, chest: V, up: V, kind: SocketKind): V {
  const spec = SOCKET[kind];
  const along = safeNorm(sub(wrist, elbow), up);
  const inward = safeNorm(sub(chest, wrist), scale(along, -1));
  return add(wrist, add(scale(along, spec.along), add(scale(inward, spec.inward), scale(up, spec.lift))));
}

export function chooseBall(palms: { side: ArmSide; at: V }[], anchor: BallAnchor): V {
  const primary = palms.find((p) => p.side === (anchor.side === 'both' ? 'R' : anchor.side)) ?? palms[0];
  if (!primary) return { x: 0, y: 0, z: 0 };
  if (anchor.side !== 'both' || palms.length < 2) return primary.at;
  const mid = lerpV(palms[0].at, palms[1].at, 0.5);
  if (vlen(sub(mid, palms[0].at)) <= SOCKET_MAX_YD && vlen(sub(mid, palms[1].at)) <= SOCKET_MAX_YD) return mid;
  return primary.at;
}

const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _delta = new THREE.Quaternion();
const _worldQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function swingBone(bone: THREE.Bone, dir: V, weight: number) {
  if (weight <= 0.001) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_worldQ);
  _from.copy(_yAxis).applyQuaternion(_worldQ).normalize();
  _to.set(dir.x, dir.y, dir.z);
  if (_to.lengthSq() < 1e-8) return;
  _to.normalize();
  if (_from.dot(_to) > 0.9995) return;
  _delta.setFromUnitVectors(_from, _to);
  _worldQ.premultiply(_delta);
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_parentQ);
  _localQ.copy(_parentQ).invert().multiply(_worldQ);
  bone.quaternion.slerp(_localQ, Math.max(0, Math.min(1, weight)));
}

function boneLen(parent: THREE.Bone, child: THREE.Bone): number {
  parent.updateWorldMatrix(true, false);
  parent.getWorldScale(_scale);
  return child.position.length() * (_scale.x || 1);
}

/** Aim one arm. Weight 1 puts the wrist on the clamped target. */
export function aimTwoBone(
  upper: THREE.Bone,
  fore: THREE.Bone,
  hand: THREE.Bone,
  target: V,
  pole: V,
  weight: number,
  hint?: V | null,
): V {
  const upperL = boneLen(upper, fore);
  const foreL = boneLen(fore, hand);
  const shoulder = new THREE.Vector3();
  upper.getWorldPosition(shoulder);
  const solved = solveTwoBone(
    { x: shoulder.x, y: shoulder.y, z: shoulder.z },
    target,
    pole,
    upperL,
    foreL,
    hint,
  );
  swingBone(upper, sub(solved.elbow, { x: shoulder.x, y: shoulder.y, z: shoulder.z }), weight);
  upper.updateMatrixWorld(true);
  const elbowNow = new THREE.Vector3();
  fore.getWorldPosition(elbowNow);
  swingBone(fore, sub(solved.hand, { x: elbowNow.x, y: elbowNow.y, z: elbowNow.z }), weight);
  fore.updateMatrixWorld(true);
  return solved.elbow;
}

function goal(p: V, weight: number): HandGoal {
  return { x: p.x, y: p.y, z: p.z, weight };
}

function polePoint(side: ArmSide, shoulder: V, basis: ArmBasis): V {
  const sign = side === 'L' ? 1 : -1;
  const dir = norm(add(scale(basis.left, sign * 0.75), add(scale(basis.up, -0.9), scale(basis.fwd, -0.2))));
  return add(shoulder, dir);
}

function nearSide(p: Player, x: number, y: number): ArmSide {
  const f = p.facing + (p.spinVis || 0);
  const lx = -Math.sin(f);
  const ly = Math.cos(f);
  const s = (x - p.x) * lx + (y - p.y) * ly;
  if (Math.abs(s) < 0.05) return 'R';
  return s > 0 ? 'L' : 'R';
}

/** Same volumes the sim uses in reachInfo / inReach. Radii are the sim's, not new ones. */
function inVisualReach(p: Player, x: number, y: number, z: number, radius: number, reachHeight: number, diveBonus: number): boolean {
  let hx = p.x;
  let hy = p.y;
  let r = radius;
  let zMin = 0.15;
  let zMax = reachHeight + p.z;
  if (p.planted) {
    const ext = 0.3 + (p.stretchReach || 0);
    hx = p.planted.x + Math.cos(p.leanDir) * ext;
    hy = p.planted.y + Math.sin(p.leanDir) * ext;
  } else if (p.diveT >= 0) {
    hx = p.x + Math.cos(p.facing) * 0.8;
    hy = p.y + Math.sin(p.facing) * 0.8;
    r = radius + diveBonus;
    zMin = 0;
    zMax = 1.3;
  } else {
    hx = p.x + Math.cos(p.facing) * 0.3;
    hy = p.y + Math.sin(p.facing) * 0.3;
  }
  if (p.groundT > 0 && p.diveT < 0) { zMin = 0; zMax = 0.9; }
  return Math.hypot(x - hx, y - hy) <= r && z >= zMin && z <= zMax;
}

function predictCatch(p: Player, ball: SimState['ball'], now: number, radius: number, reachHeight: number, diveBonus: number): V | null {
  let best: V | null = null;
  let bestT = Infinity;
  for (const pt of ball.arc) {
    if (pt.t < now - 0.03) continue;
    if (!inVisualReach(p, pt.x, pt.y, pt.z, radius, reachHeight, diveBonus)) continue;
    if (pt.t < bestT) {
      bestT = pt.t;
      best = fieldToThree(pt.x, pt.y, pt.z);
    }
  }
  if (best) return best;
  if (inVisualReach(p, ball.x, ball.y, ball.z, radius, reachHeight, diveBonus)) return fieldToThree(ball.x, ball.y, ball.z);
  return null;
}

function armBack(shoulder: V, basis: ArmBasis, side: ArmSide): V {
  const sign = side === 'L' ? 1 : -1;
  return add(shoulder, add(scale(basis.up, -0.28), add(scale(basis.fwd, -0.08), scale(basis.left, sign * 0.14))));
}

function carryPoint(shoulder: V, basis: ArmBasis, side: ArmSide): V {
  const sign = side === 'L' ? 1 : -1;
  return add(shoulder, add(scale(basis.fwd, 0.16), add(scale(basis.up, -0.06), scale(basis.left, -sign * 0.08))));
}

function chestPoints(sL: V, sR: V, basis: ArmBasis): { left: V; right: V; mid: V } {
  const mid = lerpV(sL, sR, 0.5);
  const center = add(mid, add(scale(basis.fwd, 0.22), scale(basis.up, -0.12)));
  return {
    mid: center,
    left: add(center, scale(basis.left, 0.07)),
    right: add(center, scale(basis.left, -0.07)),
  };
}

function windupPoint(sR: V, basis: ArmBasis): V {
  return add(sR, add(scale(basis.up, 0.2), add(scale(basis.fwd, -0.1), scale(basis.left, -0.05))));
}

function pocket(ball: V, basis: ArmBasis, high: boolean, dive: boolean): { left: V; right: V } {
  if (dive) {
    return {
      left: add(ball, add(scale(basis.left, 0.06), scale(basis.up, 0.02))),
      right: add(ball, add(scale(basis.left, -0.06), scale(basis.up, -0.01))),
    };
  }
  if (high) {
    return {
      left: add(ball, add(scale(basis.left, 0.07), add(scale(basis.up, 0.035), scale(basis.fwd, -0.02)))),
      right: add(ball, add(scale(basis.left, -0.07), add(scale(basis.up, -0.02), scale(basis.fwd, -0.02)))),
    };
  }
  return {
    left: add(ball, add(scale(basis.left, 0.07), scale(basis.up, -0.06))),
    right: add(ball, add(scale(basis.left, -0.07), scale(basis.up, -0.06))),
  };
}

function closestOther(p: Player, others: Player[], maxDist: number): Player | null {
  let best: Player | null = null;
  let bestD = maxDist;
  for (const o of others) {
    if (o.id === p.id) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d > 0.05 && d <= bestD) { best = o; bestD = d; }
  }
  return best;
}

function punchOn(p: Player, now: number, cooldown: number): boolean {
  if (!(p.punchCD > now) || cooldown <= 0) return false;
  const since = cooldown - (p.punchCD - now);
  return since >= -0.02 && since < 0.3;
}

function empty(): ArmGoals {
  return { left: null, right: null, anchor: null, air: null };
}

export interface PlanInput {
  player: Player;
  ball: SimState['ball'];
  t: number;
  mode: string;
  cmPhase?: string;
  charge: boolean;
  others: Player[];
  basis: ArmBasis;
  shoulderL: V;
  shoulderR: V;
  tune: Pick<Settings, 'catchReach' | 'oneHandReach' | 'batReach' | 'reachHeight' | 'diveReachBonus' | 'stiffArmReach' | 'punchCooldown' | 'punchReach'>;
  mem: IkMem;
}

export function planArmGoals(input: PlanInput): ArmGoals {
  const { player: p, ball, t, basis, tune, mem } = input;
  const sL = input.shoulderL;
  const sR = input.shoulderR;
  const holding = ball.state === 'held' && ball.holder === p.id;
  const attempt = !holding && p.attempt && ball.state === 'air' ? p.attempt : null;
  let reach: V | null = null;
  if (attempt) {
    const radius = attempt.radius || (attempt.type === 'one' ? tune.oneHandReach : attempt.type === 'bat' ? tune.batReach : tune.catchReach);
    reach = predictCatch(p, ball, t, radius, tune.reachHeight, tune.diveReachBonus);
  }

  if (holding && mem.holder !== p.id) {
    mem.tuckT = mem.catchAt ? t : t - TUCK_SEC;
    mem.from = mem.catchAt ? copyV(mem.catchAt) : null;
    mem.fromSide = mem.catchSide;
    mem.holder = p.id;
  } else if (!holding && mem.holder === p.id) {
    mem.holder = null;
    mem.from = null;
  }

  if (reach && attempt) {
    mem.catchAt = copyV(reach);
    const side: ArmSide | 'both' = attempt.type === 'two' ? 'both' : nearSide(p, ball.x, ball.y);
    mem.catchSide = side;
    const high = ball.z >= 1.45;
    const dive = p.diveT >= 0;
    if (attempt.type === 'bat') {
      const swipe = scale(basis.left, side === 'L' ? -0.12 : 0.12);
      const at = add(reach, swipe);
      const g = empty();
      if (side === 'L') g.left = goal(at, 1);
      else g.right = goal(at, 1);
      g.air = copyV(reach);
      return g;
    }
    if (attempt.type === 'one') {
      const g = empty();
      const at = reach;
      if (side === 'L') {
        g.left = goal(at, 1);
        g.right = goal(armBack(sR, basis, 'R'), 0.8);
      } else {
        g.right = goal(at, 1);
        g.left = goal(armBack(sL, basis, 'L'), 0.8);
      }
      g.air = copyV(reach);
      return g;
    }
    const hands = pocket(reach, basis, high && !dive, dive);
    return { left: goal(hands.left, 1), right: goal(hands.right, 1), anchor: null, air: copyV(reach) };
  }

  if (!holding) {
    mem.catchAt = null;
    mem.catchSide = null;
  }

  const carrier = ball.state === 'held' && ball.holder ? input.others.find((o) => o.id === ball.holder) ?? null : null;
  if (p.tackle && carrier && carrier.id !== p.id && (p.tackle.kind === 'wrap' || p.tackle.kind === 'lunge' || p.tackle.kind === 'dive')) {
    const torso = fieldToThree(carrier.x, carrier.y, 1.15 + (carrier.z || 0));
    return {
      left: goal(add(torso, scale(basis.left, 0.12)), 1),
      right: goal(add(torso, scale(basis.left, -0.12)), 1),
      anchor: null,
      air: null,
    };
  }

  if (punchOn(p, t, tune.punchCooldown) && (ball.state === 'held' || ball.state === 'air')) {
    const at = fieldToThree(ball.x, ball.y, ball.z);
    const side = nearSide(p, ball.x, ball.y);
    const g = empty();
    if (side === 'L') g.left = goal(at, 1);
    else g.right = goal(at, 1);
    g.air = at;
    return g;
  }

  const winding = holding && (!!p.visWind || input.charge || (input.mode === 'catch' && input.cmPhase === 'windup' && p.role === 'QB'));
  if (holding && p.pitchUntil > t && !winding) {
    const side: ArmSide = p.hand === 'L' ? 'L' : 'R';
    const shoulder = side === 'L' ? sL : sR;
    const dest = add(shoulder, add(scale(basis.fwd, 0.42), add(scale(basis.up, 0.04), scale(basis.left, side === 'L' ? 0.05 : -0.05))));
    const g = empty();
    if (side === 'L') g.left = goal(dest, 1);
    else g.right = goal(dest, 1);
    g.anchor = { side, kind: 'carry' };
    return g;
  }
  if (holding) {
    const tuckU = mem.from ? smoothstep((t - mem.tuckT) / TUCK_SEC) : 1;
    const diving = p.diveT >= 0 && tuckU < 0.65;
    if (winding) {
      return { left: null, right: goal(windupPoint(sR, basis), 1), anchor: { side: 'R', kind: 'windup' }, air: null };
    }
    const qbChest = p.role === 'QB';
    if (qbChest) {
      const chest = chestPoints(sL, sR, basis);
      let left = chest.left;
      let right = chest.right;
      if (mem.from && tuckU < 1) {
        const start = pocket(mem.from, basis, mem.from.y >= 1.45, false);
        left = lerpV(start.left, chest.left, tuckU);
        right = lerpV(start.right, chest.right, tuckU);
      }
      return {
        left: goal(left, 1),
        right: goal(right, 1),
        anchor: { side: 'both', kind: tuckU < 0.45 ? 'catch' : 'chest' },
        air: null,
      };
    }
    const side: ArmSide = p.hand === 'L' ? 'L' : 'R';
    const dest = carryPoint(side === 'L' ? sL : sR, basis, side);
    const fromSide = mem.fromSide;
    const startBall = mem.from;
    if (startBall && tuckU < 1) {
      const both = fromSide === 'both';
      const catchL = both || fromSide === 'L';
      const catchR = both || fromSide === 'R';
      const pocketHands = pocket(startBall, basis, startBall.y >= 1.45, p.diveT >= 0);
      const leftDest = side === 'L' ? dest : armBack(sL, basis, 'L');
      const rightDest = side === 'R' ? dest : armBack(sR, basis, 'R');
      const left = lerpV(catchL ? pocketHands.left : dest, leftDest, tuckU);
      const right = lerpV(catchR ? pocketHands.right : dest, rightDest, tuckU);
      const fade = 1 - smoothstep((tuckU - 0.35) / 0.45);
      const arrive = smoothstep(tuckU / 0.4);
      const leftW = side === 'L' ? (catchL ? 1 : arrive) : (catchL ? fade : 0);
      const rightW = side === 'R' ? (catchR ? 1 : arrive) : (catchR ? fade : 0);
      return {
        left: goal(left, leftW),
        right: goal(right, rightW),
        anchor: {
          side: both && tuckU < 0.45 ? 'both' : side,
          kind: diving ? 'dive' : tuckU < 0.45 ? 'catch' : 'carry',
        },
        air: null,
      };
    }
    const switching = p.handSwitchT > 0;
    if (switching) {
      const chest = chestPoints(sL, sR, basis);
      return {
        left: goal(chest.left, 1),
        right: goal(chest.right, 1),
        anchor: { side: 'both', kind: 'chest' },
        air: null,
      };
    }
    const g = empty();
    if (side === 'L') g.left = goal(dest, 1);
    else g.right = goal(dest, 1);
    g.anchor = { side, kind: diving ? 'dive' : 'carry' };
    applyStiff(g, p, input.others, tune.stiffArmReach);
    return g;
  }

  const stiffOnly = empty();
  if (applyStiff(stiffOnly, p, input.others, tune.stiffArmReach)) return stiffOnly;
  return empty();
}

function applyStiff(g: ArmGoals, p: Player, others: Player[], reach: number): boolean {
  if (!p.stiffArm) return false;
  const foe = closestOther(p, others, reach);
  if (!foe) return false;
  const at = fieldToThree(foe.x, foe.y, 1.55 + (foe.z || 0));
  if (p.stiffArm === 'L') g.left = goal(at, 1);
  else g.right = goal(at, 1);
  return true;
}

function readBasis(root: THREE.Object3D): ArmBasis {
  root.updateWorldMatrix(true, false);
  const q = new THREE.Quaternion();
  root.getWorldQuaternion(q);
  const left = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return {
    left: { x: left.x, y: left.y, z: left.z },
    up: { x: up.x, y: up.y, z: up.z },
    fwd: { x: fwd.x, y: fwd.y, z: fwd.z },
  };
}

function readPos(bone: THREE.Object3D): V {
  const p = new THREE.Vector3();
  bone.getWorldPosition(p);
  return { x: p.x, y: p.y, z: p.z };
}

const bags = new WeakMap<ModelInstance, IkMem>();

function smooth(cur: number, target: number, dt: number, snap: boolean): number {
  if (snap) return target;
  const k = 1 - Math.exp(-Math.max(0, dt) / WEIGHT_TAU);
  return cur + (target - cur) * k;
}

export interface ArmPose {
  anchor: BallAnchor | null;
  air: V | null;
  debug: { x: number; y: number; z: number; color: number }[];
}

const NONE: ArmPose = { anchor: null, air: null, debug: [] };

export function poseArms(
  model: ModelInstance,
  player: Player,
  world: { t: number; mode: string; ball: SimState['ball']; players: Record<string, Player>; cm?: { phase: string } },
  opts: { charge: boolean; snap?: boolean; tune: PlanInput['tune'] },
): ArmPose {
  const upperL = model.byName.LeftArm;
  const foreL = model.byName.LeftForeArm;
  const handL = model.byName.LeftHand;
  const upperR = model.byName.RightArm;
  const foreR = model.byName.RightForeArm;
  const handR = model.byName.RightHand;
  if (!upperL || !foreL || !handL || !upperR || !foreR || !handR) return NONE;
  if (!model.holder.visible && !opts.snap) return NONE;
  model.root.updateWorldMatrix(true, true);
  const basis = readBasis(model.root);
  const mem = bags.get(model) ?? freshMem();
  bags.set(model, mem);
  const goals = planArmGoals({
    player,
    ball: world.ball,
    t: world.t,
    mode: world.mode,
    cmPhase: world.cm?.phase,
    charge: opts.charge,
    others: Object.values(world.players),
    basis,
    shoulderL: readPos(upperL),
    shoulderR: readPos(upperR),
    tune: opts.tune,
    mem,
  });
  let dt = mem.lastT == null ? 0.016 : Math.min(0.05, Math.max(0, world.t - mem.lastT));
  // A paused sim still draws frames. Keep blending so the arms do not freeze mid-reach.
  if (dt < 0.001) dt = 0.016;
  mem.lastT = world.t;
  const snap = !!opts.snap || !!player.forcePose;
  mem.wL = smooth(mem.wL, goals.left?.weight ?? 0, dt, snap);
  mem.wR = smooth(mem.wR, goals.right?.weight ?? 0, dt, snap);
  if (goals.left && goals.left.weight > 0.02) mem.lastL = goals.left;
  if (goals.right && goals.right.weight > 0.02) mem.lastR = goals.right;
  const debug: ArmPose['debug'] = [];
  if (mem.wL > 0.02 && mem.lastL) {
    const target = { x: mem.lastL.x, y: mem.lastL.y, z: mem.lastL.z };
    const shoulder = readPos(upperL);
    mem.hintL = aimTwoBone(upperL, foreL, handL, target, polePoint('L', shoulder, basis), mem.wL, mem.hintL);
    debug.push({ ...target, color: 0x4fc3f7 });
  } else if (mem.wL <= 0.02) mem.lastL = null;
  if (mem.wR > 0.02 && mem.lastR) {
    const target = { x: mem.lastR.x, y: mem.lastR.y, z: mem.lastR.z };
    const shoulder = readPos(upperR);
    mem.hintR = aimTwoBone(upperR, foreR, handR, target, polePoint('R', shoulder, basis), mem.wR, mem.hintR);
    debug.push({ ...target, color: 0xf06292 });
  } else if (mem.wR <= 0.02) mem.lastR = null;
  model.root.updateMatrixWorld(true);
  if (goals.air) debug.push({ ...goals.air, color: 0xffee58 });
  return { anchor: goals.anchor, air: goals.air, debug };
}

export interface HeldBall {
  pos: V;
  forearm: V;
  across: V;
  up: V;
}

/** Ball center on the hand socket. The offset from the wrist stays inside 0.1 yd. */
export function placeHeldBall(model: ModelInstance, anchor: BallAnchor): HeldBall | null {
  const upperL = model.byName.LeftArm;
  const upperR = model.byName.RightArm;
  const handL = model.byName.LeftHand;
  const handR = model.byName.RightHand;
  const foreL = model.byName.LeftForeArm;
  const foreR = model.byName.RightForeArm;
  if (!upperL || !upperR || !handL || !handR || !foreL || !foreR) return null;
  model.root.updateWorldMatrix(true, true);
  const basis = readBasis(model.root);
  const chest = lerpV(readPos(upperL), readPos(upperR), 0.5);
  const sides: ArmSide[] = anchor.side === 'both' ? ['L', 'R'] : [anchor.side];
  const palms: { side: ArmSide; at: V }[] = [];
  let forearm = basis.fwd;
  for (const side of sides) {
    const wrist = readPos(side === 'L' ? handL : handR);
    const elbow = readPos(side === 'L' ? foreL : foreR);
    palms.push({ side, at: palmSocket(wrist, elbow, chest, basis.up, anchor.kind) });
    forearm = safeNorm(sub(wrist, elbow), basis.fwd);
  }
  const pos = chooseBall(palms, anchor);
  return { pos, forearm, across: basis.left, up: basis.up };
}

export function orientBall(kind: SocketKind, held: HeldBall, out: THREE.Quaternion) {
  const src = kind === 'windup' ? held.up : kind === 'catch' || kind === 'dive' ? held.forearm : held.across;
  _to.set(src.x, src.y, src.z);
  if (_to.lengthSq() < 1e-8) _to.copy(_xAxis);
  else _to.normalize();
  out.setFromUnitVectors(_xAxis, _to);
}

/** Fake sim state so the pose sheet aims the same way a live play does. */
export function sheetActor(name: string, x: number, y: number, facing: number): { player: Player; ball: SimState['ball']; players: Record<string, Player> } {
  const id = 'sheet-' + name;
  const foeId = id + '-foe';
  const base = {
    id, role: 'WR', x, y, z: 0, vx: 0, vy: 0, facing, hand: 'R' as const, handSwitchT: 0,
    diveT: -1, groundT: 0, jumpT: -1, planted: null, stretch: 0, stretchReach: 0, leanDir: facing,
    attempt: null, stiffArm: null, tackle: null, punchCD: 0, spinVis: 0, visWind: false,
  } as Player;
  const foe = { ...base, id: foeId, role: 'DF', x: x + Math.cos(facing) * 1.1, y: y + Math.sin(facing) * 1.1 } as Player;
  const ball: SimState['ball'] = {
    state: 'dead', holder: null, x, y, z: 1.4, vx: 0, vy: 0, vz: 0,
    arc: [], landing: null, aimed: null, throwT: 0, resolved: false, gave: false, power: 0,
  };
  const ahead = { x: x + Math.cos(facing) * 0.55, y: y + Math.sin(facing) * 0.55 };
  if (name === 'catchTwo' || name === 'jump' || name === 'stretch') {
    base.attempt = { type: 'two', t0: 0, win: 1, radius: 2.2 };
    if (name === 'jump') base.z = 0.45;
    ball.state = 'air';
    ball.x = ahead.x; ball.y = ahead.y; ball.z = name === 'stretch' ? 0.9 : 1.7;
    ball.arc = [{ x: ball.x, y: ball.y, z: ball.z, t: 0.2 }];
  } else if (name === 'catchOne') {
    base.attempt = { type: 'one', t0: 0, win: 1, radius: 2.2 };
    ball.state = 'air';
    const f = facing;
    const rx = Math.sin(f);
    const ry = -Math.cos(f);
    ball.x = x + Math.cos(f) * 0.45 + rx * 0.28;
    ball.y = y + Math.sin(f) * 0.45 + ry * 0.28;
    ball.z = 1.45;
    ball.arc = [{ x: ball.x, y: ball.y, z: ball.z, t: 0.2 }];
  } else if (name === 'dive') {
    base.attempt = { type: 'two', t0: 0, win: 1, radius: 2.4 };
    base.diveT = 0.2;
    ball.state = 'air';
    ball.x = x + Math.cos(facing) * 0.7;
    ball.y = y + Math.sin(facing) * 0.7;
    ball.z = 0.7;
    ball.arc = [{ x: ball.x, y: ball.y, z: ball.z, t: 0.2 }];
  } else if (name === 'carryR' || name === 'carryL') {
    base.role = 'RB';
    base.hand = name === 'carryL' ? 'L' : 'R';
    ball.state = 'held';
    ball.holder = id;
  } else if (name === 'throwWindup') {
    base.role = 'QB';
    base.visWind = true;
    ball.state = 'held';
    ball.holder = id;
  } else if (name === 'stiffL' || name === 'stiffR') {
    base.role = 'RB';
    base.stiffArm = name === 'stiffL' ? 'L' : 'R';
    base.hand = name === 'stiffL' ? 'R' : 'L';
    ball.state = 'held';
    ball.holder = id;
    const sign = name === 'stiffL' ? 1 : -1;
    const lx = -Math.sin(facing);
    const ly = Math.cos(facing);
    foe.x = x + lx * sign * 1.15;
    foe.y = y + ly * sign * 1.15;
  } else if (name === 'tackle') {
    base.role = 'DF';
    base.tackle = { kind: 'wrap', t0: 0, done: false };
    foe.role = 'RB';
    ball.state = 'held';
    ball.holder = foeId;
  }
  return { player: base, ball, players: { [id]: base, [foeId]: foe } };
}
