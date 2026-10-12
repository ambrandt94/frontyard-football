import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Player, SimState } from '../../sim/types';
import {
  SOCKET,
  SOCKET_MAX_YD,
  TUCK_SEC,
  aimTwoBone,
  chooseBall,
  freshMem,
  palmSocket,
  planArmGoals,
  socketSpan,
  solveTwoBone,
  vlen,
  type ArmBasis,
  type SocketKind,
  type V,
} from './armIk';

const TUNE = {
  catchReach: 1.1,
  oneHandReach: 1.8,
  batReach: 1.4,
  reachHeight: 2.6,
  diveReachBonus: 0.7,
  stiffArmReach: 1.8,
  punchCooldown: 0.8,
  punchReach: 1.2,
};

const BASIS: ArmBasis = {
  left: { x: 0, y: 0, z: -1 },
  up: { x: 0, y: 1, z: 0 },
  fwd: { x: 1, y: 0, z: 0 },
};

function guy(over: Partial<Player> & Pick<Player, 'id'>): Player {
  return {
    role: 'WR', x: 10, y: 20, z: 0, vx: 0, vy: 0, facing: 0,
    hand: 'R', handSwitchT: 0, diveT: -1, groundT: 0, jumpT: -1,
    planted: null, stretch: 0, stretchReach: 0, leanDir: 0,
    attempt: null, stiffArm: null, tackle: null, punchCD: 0, spinVis: 0,
    ...over,
  } as Player;
}

function ball(over: Partial<SimState['ball']> = {}): SimState['ball'] {
  return {
    state: 'dead', holder: null, x: 10, y: 20, z: 1.2, vx: 0, vy: 0, vz: 0,
    arc: [], landing: null, aimed: null, throwT: 0, resolved: false, gave: false, power: 0,
    ...over,
  };
}

const sL: V = { x: 10.02, y: 1.45, z: -20.28 };
const sR: V = { x: 10.02, y: 1.45, z: -19.72 };

function plan(player: Player, b: SimState['ball'], mem = freshMem(), t = 1, others: Player[] = []) {
  return planArmGoals({
    player, ball: b, t, mode: 'throw', charge: false, others: [player, ...others],
    basis: BASIS, shoulderL: sL, shoulderR: sR, tune: TUNE, mem,
  });
}

describe('two-bone arm IK', () => {
  it('puts the wrist on a reachable target and keeps the elbow on the pole side', () => {
    const shoulder = { x: 0, y: 0, z: 0 };
    const target = { x: 0.05, y: 0.12, z: 0.42 };
    const pole = { x: 1, y: -1, z: 0 };
    const solved = solveTwoBone(shoulder, target, pole, 0.34, 0.24);
    expect(solved.clamped).toBe(false);
    expect(vlen(sub(solved.hand, target))).toBeLessThan(0.02);
    expect(vlen(sub(solved.elbow, shoulder))).toBeCloseTo(0.34, 2);
    expect(vlen(sub(solved.hand, solved.elbow))).toBeCloseTo(0.24, 2);
    expect(solved.elbow.x).toBeGreaterThan(0.04);
  });

  it('clamps a far target along the reach and does not flip the elbow', () => {
    const shoulder = { x: 0, y: 1, z: 0 };
    const target = { x: 0, y: 1, z: 3 };
    const pole = { x: -1, y: 0, z: 0 };
    const solved = solveTwoBone(shoulder, target, pole, 0.34, 0.24);
    expect(solved.clamped).toBe(true);
    expect(vlen(sub(solved.hand, shoulder))).toBeLessThan(0.58);
    expect(solved.hand.z).toBeGreaterThan(0.4);
    expect(solved.elbow.x).toBeLessThan(0);
  });

  it('lands a posed arm on the wrist target', () => {
    const root = new THREE.Group();
    const upper = new THREE.Bone();
    const fore = new THREE.Bone();
    const hand = new THREE.Bone();
    fore.position.set(0, 0.34, 0);
    hand.position.set(0, 0.24, 0);
    upper.add(fore);
    fore.add(hand);
    root.add(upper);
    root.updateMatrixWorld(true);
    const target = { x: 0.08, y: 0.2, z: 0.36 };
    aimTwoBone(upper, fore, hand, target, { x: 0.8, y: -0.6, z: 0.1 }, 1);
    const wrist = new THREE.Vector3();
    hand.getWorldPosition(wrist);
    const solved = solveTwoBone({ x: 0, y: 0, z: 0 }, target, { x: 0.8, y: -0.6, z: 0.1 }, 0.34, 0.24);
    expect(wrist.distanceTo(new THREE.Vector3(solved.hand.x, solved.hand.y, solved.hand.z))).toBeLessThan(0.02);
    const elbow = new THREE.Vector3();
    fore.getWorldPosition(elbow);
    const palm = palmSocket(
      { x: wrist.x, y: wrist.y, z: wrist.z },
      { x: elbow.x, y: elbow.y, z: elbow.z },
      { x: 0, y: 0.2, z: 0 },
      { x: 0, y: 1, z: 0 },
      'catch',
    );
    expect(vlen(sub(palm, { x: wrist.x, y: wrist.y, z: wrist.z }))).toBeLessThanOrEqual(SOCKET_MAX_YD);
  });
});

describe('possessed ball on the hand socket', () => {
  const kinds = Object.keys(SOCKET) as SocketKind[];

  it('keeps every socket offset inside 0.1 yd', () => {
    for (const kind of kinds) {
      const s = SOCKET[kind];
      const span = socketSpan(kind);
      const straight = Math.hypot(s.along, s.inward, s.lift);
      expect(span).toBeLessThanOrEqual(SOCKET_MAX_YD);
      expect(straight).toBeLessThanOrEqual(SOCKET_MAX_YD);
      expect(straight).toBeGreaterThan(0);
    }
  });

  it('stays within 0.1 yd of the hand in carry, chest, windup, catch, dive, and the tuck', () => {
    const up = BASIS.up;
    const cases: { name: string; wrist: V; elbow: V; chest: V; kind: SocketKind; side: 'L' | 'R' | 'both' }[] = [];
    const carry = plan(guy({ id: 'rb', role: 'RB', hand: 'R' }), ball({ state: 'held', holder: 'rb' }));
    const carryL = plan(guy({ id: 'rb', role: 'RB', hand: 'L' }), ball({ state: 'held', holder: 'rb' }));
    const chest = plan(guy({ id: 'qb', role: 'QB' }), ball({ state: 'held', holder: 'qb' }));
    const wind = plan(guy({ id: 'qb', role: 'QB', visWind: true }), ball({ state: 'held', holder: 'qb' }));
    expect(carry.anchor).toEqual({ side: 'R', kind: 'carry' });
    expect(carry.right?.weight).toBe(1);
    expect(carry.left).toBeNull();
    expect(carryL.anchor).toEqual({ side: 'L', kind: 'carry' });
    expect(carryL.left?.weight).toBe(1);
    expect(carryL.right).toBeNull();
    expect(chest.anchor?.side).toBe('both');
    expect(wind.anchor).toEqual({ side: 'R', kind: 'windup' });
    expect(wind.left).toBeNull();

    const push = (name: string, g: typeof carry, kind: SocketKind) => {
      const chestPt = { x: 10, y: 1.3, z: -20 };
      if (g.left && g.left.weight > 0) cases.push({ name, wrist: g.left, elbow: sL, chest: chestPt, kind, side: g.anchor?.side === 'both' ? 'both' : 'L' });
      if (g.right && g.right.weight > 0) cases.push({ name, wrist: g.right, elbow: sR, chest: chestPt, kind, side: g.anchor?.side === 'both' ? 'both' : 'R' });
    };
    push('carryR', carry, 'carry');
    push('carryL', carryL, 'carry');
    push('chest', chest, 'chest');
    push('windup', wind, 'windup');

    const mem = freshMem();
    const air = ball({
      state: 'air', holder: null, x: 10.45, y: 20.05, z: 1.55,
      arc: [{ x: 10.45, y: 20.05, z: 1.55, t: 1.05 }],
    });
    const reach = plan(guy({ id: 'wr', attempt: { type: 'two', t0: 0.8, win: 0.4, radius: 1.1 } }), air, mem, 1);
    expect(reach.left && reach.right).toBeTruthy();
    expect(reach.anchor).toBeNull();
    const caught = plan(guy({ id: 'wr', role: 'WR', hand: 'R' }), ball({ state: 'held', holder: 'wr', z: 1.55 }), mem, 1.02);
    expect(caught.anchor).toBeTruthy();
    push('tuck-start', caught, caught.anchor!.kind);
    const tucked = plan(guy({ id: 'wr', role: 'WR', hand: 'R' }), ball({ state: 'held', holder: 'wr' }), mem, 1.02 + TUCK_SEC);
    expect(tucked.anchor?.kind === 'carry' || tucked.anchor?.kind === 'dive').toBe(true);
    push('tuck-done', tucked, 'carry');

    const diveMem = freshMem();
    const diveAir = ball({
      state: 'air', x: 10.75, y: 20, z: 0.8,
      arc: [{ x: 10.75, y: 20, z: 0.8, t: 2 }],
    });
    plan(guy({ id: 'wr', diveT: 0.2, attempt: { type: 'two', t0: 1.8, win: 0.4, radius: 1.1 } }), diveAir, diveMem, 1.9);
    const diveHold = plan(guy({ id: 'wr', role: 'WR', hand: 'L', diveT: 0.2 }), ball({ state: 'held', holder: 'wr' }), diveMem, 1.92);
    expect(diveHold.anchor?.kind).toBe('dive');
    push('dive', diveHold, 'dive');

    expect(cases.length).toBeGreaterThan(6);
    for (const c of cases) {
      const palm = palmSocket(c.wrist, c.elbow, c.chest, up, c.kind);
      expect(vlen(sub(palm, c.wrist)), c.name).toBeLessThanOrEqual(SOCKET_MAX_YD + 1e-6);
      const anchorSide = c.side;
      const palms = anchorSide === 'both'
        ? [{ side: 'L' as const, at: palm }, { side: 'R' as const, at: palm }]
        : [{ side: anchorSide, at: palm }];
      const seated = chooseBall(palms, { side: anchorSide, kind: c.kind });
      expect(vlen(sub(seated, palm)), c.name + ' ball').toBeLessThanOrEqual(SOCKET_MAX_YD + 1e-6);
    }
  });

  it('shares a two-hand ball between both palms', () => {
    const a = { x: 0, y: 1.3, z: 0 };
    const b = { x: 0.14, y: 1.3, z: 0 };
    const mid = chooseBall([{ side: 'L', at: a }, { side: 'R', at: b }], { side: 'both', kind: 'chest' });
    expect(vlen(sub(mid, a))).toBeLessThanOrEqual(SOCKET_MAX_YD);
    expect(vlen(sub(mid, b))).toBeLessThanOrEqual(SOCKET_MAX_YD);
    const far = chooseBall([{ side: 'L', at: a }, { side: 'R', at: { x: 0.4, y: 1.3, z: 0 } }], { side: 'both', kind: 'chest' });
    expect(vlen(sub(far, { x: 0.4, y: 1.3, z: 0 }))).toBeLessThanOrEqual(SOCKET_MAX_YD);
  });
});

describe('catch, tackle, and stiff-arm targets', () => {
  it('sends both hands to a two-hand catch and only the near hand to a one-hand catch', () => {
    const high = ball({
      state: 'air', x: 10.4, y: 20, z: 1.8,
      arc: [{ x: 10.4, y: 20, z: 1.8, t: 1.1 }],
    });
    const two = plan(guy({ id: 'wr', attempt: { type: 'two', t0: 0, win: 1, radius: 1.1 } }), high);
    expect(two.left?.weight).toBe(1);
    expect(two.right?.weight).toBe(1);
    expect(two.air).toBeTruthy();
    const lowRight = ball({
      state: 'air', x: 10.35, y: 19.6, z: 1.1,
      arc: [{ x: 10.35, y: 19.6, z: 1.1, t: 1.1 }],
    });
    const one = plan(guy({ id: 'wr', attempt: { type: 'one', t0: 0, win: 1, radius: 1.8 } }), lowRight);
    expect(one.right?.weight).toBe(1);
    expect(one.left?.weight).toBeGreaterThan(0.5);
    expect(one.left!.x).toBeLessThan(sL.x);
    expect(one.right!.x).toBeGreaterThan(sR.x);
  });

  it('does not reach when the ball is out of range', () => {
    const far = ball({ state: 'air', x: 18, y: 20, z: 1.4, arc: [{ x: 18, y: 20, z: 1.4, t: 2 }] });
    const g = plan(guy({ id: 'wr', attempt: { type: 'two', t0: 0, win: 1, radius: 1.1 } }), far);
    expect(g.left).toBeNull();
    expect(g.right).toBeNull();
  });

  it('reaches a wrap at the carrier and a punch or bat at the ball', () => {
    const carrier = guy({ id: 'rb', role: 'RB', x: 12, y: 21 });
    const wrap = plan(
      guy({ id: 'df', role: 'DF', x: 11, y: 20, tackle: { kind: 'wrap', t0: 0, done: false } }),
      ball({ state: 'held', holder: 'rb', x: 12, y: 21, z: 1.3 }),
      freshMem(),
      1,
      [carrier],
    );
    expect(wrap.left && wrap.right).toBeTruthy();
    expect(wrap.anchor).toBeNull();
    const punch = plan(
      guy({ id: 'df', role: 'DF', punchCD: 1.8 }),
      ball({ state: 'held', holder: 'rb', x: 11.2, y: 20.2, z: 1.3 }),
      freshMem(),
      1.1,
    );
    expect(punch.left || punch.right).toBeTruthy();
    expect((punch.left ? 1 : 0) + (punch.right ? 1 : 0)).toBe(1);
    const bat = plan(
      guy({ id: 'df', role: 'DF', attempt: { type: 'bat', t0: 0, win: 0.2, radius: 1.4 } }),
      ball({ state: 'air', x: 10.5, y: 20.2, z: 1.4, arc: [{ x: 10.5, y: 20.2, z: 1.4, t: 1.05 }] }),
    );
    expect(bat.left || bat.right).toBeTruthy();
    expect(bat.anchor).toBeNull();
  });

  it('stiff-arms the near defender and leaves the ball hand tucked', () => {
    const foe = guy({ id: 'df', role: 'DF', x: 10, y: 21.2 });
    const g = plan(
      guy({ id: 'rb', role: 'RB', hand: 'R', stiffArm: 'L' }),
      ball({ state: 'held', holder: 'rb' }),
      freshMem(),
      1,
      [foe],
    );
    expect(g.anchor?.side).toBe('R');
    expect(g.left?.weight).toBe(1);
    expect(g.right?.weight).toBe(1);
    const alone = plan(guy({ id: 'rb', role: 'RB', hand: 'R', stiffArm: 'L' }), ball({ state: 'held', holder: 'rb' }));
    expect(alone.left).toBeNull();
    expect(alone.anchor?.side).toBe('R');
  });
});

function sub(a: V, b: V): V {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
