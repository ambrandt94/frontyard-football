import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULTS } from '../../config/defaults';
import { DEFAULT_LOOK, parseLook, type Look } from '../../sim/look';
import type { Player, SimState } from '../../sim/types';
import { fieldToThree, placeHeldBall, poseArms, sheetActor } from './armIk';
import { BODY_BONES } from './body';
import { makeModelInstance, type ModelInstance } from './model';
import { poseModel, poseTargets } from './poses';

/** 0.08 yd is about 7 cm. A held ball has to sit on the hand, not float beside it. */
const FEW_CM = 0.08;

function mount(look: Look = DEFAULT_LOOK) {
  const model = makeModelInstance(DEFAULTS, look);
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(model.holder);
  g.scale.setScalar(DEFAULTS.playerScale);
  return { g, model };
}

function place(g: THREE.Group, x: number, y: number, z: number, facing: number) {
  g.position.set(x, z, -y);
  g.rotation.y = facing;
  g.updateMatrixWorld(true);
}

function boneAt(bone: THREE.Object3D) {
  const p = new THREE.Vector3();
  bone.updateWorldMatrix(true, false);
  bone.getWorldPosition(p);
  return p;
}

function gap(bone: THREE.Object3D, at: { x: number; y: number; z: number }) {
  const p = boneAt(bone);
  return Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z);
}

function actAt(name: string, x = 10, y = 20, facing = 0) {
  const mounted = mount();
  place(mounted.g, x, y, 0, facing);
  const act = sheetActor(name, x, y, facing);
  mounted.model.lastT = 0;
  const world = { t: 0.35, mode: 'throw', ball: act.ball, players: act.players };
  poseModel(mounted.model, act.player, world, { qbCharge: null });
  mounted.g.updateMatrixWorld(true);
  const arm = poseArms(mounted.model, act.player, world, { charge: false, snap: true, tune: DEFAULTS });
  return { ...mounted, act, arm };
}

function guy(over: Partial<Player> = {}): Player {
  return {
    id: 'p', role: 'WR', x: 0, y: 0, z: 0, vx: 0, vy: 0, facing: 0,
    hand: 'R', handSwitchT: 0, diveT: -1, groundT: 0, pitchUntil: 0,
    move: null, stiffArm: null, attempt: null, tackle: null, plantT: 0, squared: false,
    ...over,
  } as Player;
}

function deadBall(over: Partial<SimState['ball']> = {}): SimState['ball'] {
  return {
    state: 'dead', holder: null, x: 0, y: 0, z: 1.2, vx: 0, vy: 0, vz: 0,
    arc: [], landing: null, aimed: null, throwT: 0, resolved: false, gave: false, power: 0,
    ...over,
  };
}

describe('procedural player', () => {
  it('builds a full skeleton with human proportions and a tunable body', () => {
    const { g, model } = mount();
    place(g, 10, 20, 0, 0);
    for (const name of BODY_BONES) expect(model.byName[name], name).toBeTruthy();
    const fore = model.byName.LeftForeArm.position;
    expect(Math.abs(fore.x)).toBeLessThan(1e-3);
    expect(Math.abs(fore.z)).toBeLessThan(1e-3);
    expect(fore.y).toBeGreaterThan(0.25);
    const foot = boneAt(model.byName.LeftFoot);
    expect(foot.y).toBeGreaterThan(-0.02);
    expect(foot.y).toBeLessThan(0.16);
    const head = boneAt(model.byName.Head);
    expect(head.y).toBeGreaterThan(1.7);
    expect(head.y).toBeLessThan(2.05);
    expect(boneAt(model.byName.LeftArm).z).toBeLessThan(boneAt(model.byName.RightArm).z);

    const short = mount({ ...DEFAULT_LOOK, height: 1.8 });
    const tall = mount({ ...DEFAULT_LOOK, height: 2.15 });
    place(short.g, 0, 0, 0, 0);
    place(tall.g, 30, 0, 0, 0);
    expect(boneAt(tall.model.byName.Head).y / boneAt(short.model.byName.Head).y).toBeCloseTo(2.15 / 1.8, 2);

    const narrow = mount({ ...DEFAULT_LOOK, build: 0.75 });
    const wide = mount({ ...DEFAULT_LOOK, build: 1.35 });
    place(narrow.g, 0, 40, 0, 0);
    place(wide.g, 30, 40, 0, 0);
    const span = (m: ModelInstance) => boneAt(m.byName.LeftArm).distanceTo(boneAt(m.byName.RightArm));
    expect(span(wide.model)).toBeGreaterThan(span(narrow.model) * 1.4);

    const thin = mount({ ...DEFAULT_LOOK, limb: 0.7 });
    const thick = mount({ ...DEFAULT_LOOK, limb: 1.4 });
    const radius = (m: ModelInstance) => {
      let r = 0;
      m.byName.LeftArm.traverse((obj) => {
        const geo = (obj as THREE.Mesh).geometry as THREE.CapsuleGeometry | undefined;
        if (geo?.parameters?.radius && geo.parameters.radius > r) r = geo.parameters.radius;
      });
      return r;
    };
    expect(radius(thick.model)).toBeGreaterThan(radius(thin.model) * 1.5);
    for (const m of [model, short.model, tall.model, narrow.model, wide.model, thin.model, thick.model]) m.dispose();
  });

  it('keeps the ball socket within a few centimeters of the hand for catch, carry, and throw', () => {
    const carry = actAt('carryR');
    expect(carry.arm.anchor?.kind).toBe('carry');
    expect(carry.arm.anchor?.side).toBe('R');
    const carried = placeHeldBall(carry.model, carry.arm.anchor!);
    expect(carried).toBeTruthy();
    expect(gap(carry.model.byName.RightHand, carried!.pos)).toBeLessThan(FEW_CM);

    const left = actAt('carryL');
    expect(left.arm.anchor?.side).toBe('L');
    const carriedL = placeHeldBall(left.model, left.arm.anchor!);
    expect(gap(left.model.byName.LeftHand, carriedL!.pos)).toBeLessThan(FEW_CM);

    const thrown = actAt('throwWindup');
    expect(thrown.arm.anchor?.kind).toBe('windup');
    expect(thrown.arm.anchor?.side).toBe('R');
    const inHand = placeHeldBall(thrown.model, thrown.arm.anchor!);
    expect(gap(thrown.model.byName.RightHand, inHand!.pos)).toBeLessThan(FEW_CM);

    const one = actAt('catchOne');
    const oneBall = fieldToThree(one.act.ball.x, one.act.ball.y, one.act.ball.z);
    const oneGap = Math.min(gap(one.model.byName.LeftHand, oneBall), gap(one.model.byName.RightHand, oneBall));
    expect(oneGap).toBeLessThan(FEW_CM);

    const two = actAt('catchTwo');
    const twoBall = fieldToThree(two.act.ball.x, two.act.ball.y, two.act.ball.z);
    expect(gap(two.model.byName.LeftHand, twoBall)).toBeLessThan(0.1);
    expect(gap(two.model.byName.RightHand, twoBall)).toBeLessThan(0.1);

    for (const m of [carry.model, left.model, thrown.model, one.model, two.model]) m.dispose();
  });

  it('extends the pitching hand and still seats the ball in that hand', () => {
    const { g, model } = mount();
    place(g, 10, 20, 0, 0);
    const act = sheetActor('carryR', 10, 20, 0);
    act.player.pitchUntil = 5;
    model.lastT = 0;
    const world = { t: 1, mode: 'run', ball: act.ball, players: act.players };
    poseModel(model, act.player, world, { qbCharge: null });
    g.updateMatrixWorld(true);
    const arm = poseArms(model, act.player, world, { charge: false, snap: true, tune: DEFAULTS });
    expect(arm.anchor?.kind).toBe('carry');
    const held = placeHeldBall(model, arm.anchor!);
    expect(gap(model.byName.RightHand, held!.pos)).toBeLessThan(FEW_CM);
    expect(boneAt(model.byName.RightHand).x).toBeGreaterThan(boneAt(model.byName.RightArm).x + 0.2);
    model.dispose();
  });

  it('times the throw to the release and blends cuts, jukes, spins, and the get-up', () => {
    const view = { qbCharge: null as number | null };
    const qb = guy({ id: 'qb', role: 'QB', visWind: true });
    expect(poseTargets(qb, { t: 2, mode: 'throw', ball: deadBall({ state: 'held', holder: 'qb' }) }, { qbCharge: 0.5 }).w.throwWindup).toBeGreaterThan(0);
    qb.visWind = false;
    expect(poseTargets(qb, { t: 2, mode: 'throw', ball: deadBall({ state: 'air', throwT: 1.8 }) }, view).w.throwRelease).toBeGreaterThan(0);
    expect(poseTargets(qb, { t: 2, mode: 'throw', ball: deadBall({ state: 'air', throwT: 1.8, pitch: { from: 'qb', t: 1.8, x0: 0, y0: 0, rolled: {}, looseT: 0 } }) }, view).w.throwRelease).toBeUndefined();

    const world = { t: 1, mode: 'run', ball: deadBall() };
    expect(poseTargets(guy({ vy: 6, move: { type: 'sidestep' } as Player['move'] }), world, view).w.cut).toBeGreaterThan(0);
    expect(poseTargets(guy({ vy: 6, move: { type: 'juke' } as Player['move'] }), world, view).w.juke).toBeGreaterThan(0);
    expect(poseTargets(guy({ vy: 6, move: { type: 'spin' } as Player['move'] }), world, view).w.spin).toBeGreaterThan(0);
    expect(poseTargets(guy({ id: 'rb', role: 'RB', pitchUntil: 3, hand: 'L' }), { t: 1, mode: 'run', ball: deadBall({ state: 'held', holder: 'rb' }) }, view).w.pitchL).toBeGreaterThan(0);
    expect(poseTargets(guy({ groundT: 0.2 }), world, view).w.getup).toBeGreaterThan(0.4);
    expect(poseTargets(guy({ groundT: 1.2 }), world, view).w.getup).toBeUndefined();
  });

  it('gives an older kit the default body size', () => {
    const look = parseLook({ jersey: 0x112233, pants: 1, helmet: 2, skin: 'dark' });
    expect(look.height).toBe(DEFAULT_LOOK.height);
    expect(look.build).toBe(1);
    expect(look.limb).toBe(1);
    expect(parseLook({ height: 9, build: 0, limb: 8 }).height).toBe(2.3);
    expect(parseLook({ height: 9, build: 0, limb: 8 }).build).toBe(0.6);
    expect(parseLook({ height: 9, build: 0, limb: 8 }).limb).toBe(1.65);
  });
});
