/**
 * Procedural football player. Bones are laid out in code and smooth capsules
 * are parented to them. Local +Y runs toward each bone's child so the existing
 * pose table and arm IK can aim this skeleton the same way they aimed the old one.
 *
 * Character space, before the root yaw: +Y up, +Z forward, +X the body's left.
 */
import * as THREE from 'three';
import { DEFAULTS } from '../../config/defaults';
import { SKIN_TONE, type Look } from '../../sim/look';
import type { ModelInstance } from './model';

export interface BodySpec {
  /** Crown height in yards, before the renderer's group scale. */
  height: number;
  /** Shoulder and hip width. 1 is the default build. */
  build: number;
  /** Arm, leg, and neck thickness. 1 is the default. */
  limb: number;
}

export const BODY_BONES = [
  'Hips', 'Spine', 'Spine01', 'Spine02', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot',
  'RightUpLeg', 'RightLeg', 'RightFoot',
] as const;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function bodyOf(look: Look, modelHeightYd = DEFAULTS.modelHeightYd): BodySpec {
  const height = look.height * (modelHeightYd / DEFAULTS.modelHeightYd);
  return { height, build: look.build, limb: look.limb };
}

export function bodyKey(spec: BodySpec): string {
  return `${spec.height.toFixed(3)}|${spec.build.toFixed(3)}|${spec.limb.toFixed(3)}`;
}

let numberMap: THREE.Texture | null | undefined;
let outlineMat: THREE.MeshBasicMaterial | null = null;

function jerseyNumberMap(): THREE.Texture | null {
  if (numberMap !== undefined) return numberMap;
  if (typeof document === 'undefined') {
    numberMap = null;
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  if (!g) {
    numberMap = null;
    return null;
  }
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#f4f7f8';
  g.font = '800 108px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('12', 64, 86);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  numberMap = tex;
  return tex;
}

function outlineMaterial(): THREE.MeshBasicMaterial {
  if (!outlineMat) {
    outlineMat = new THREE.MeshBasicMaterial({ color: 0x06090d, side: THREE.BackSide });
    outlineMat.userData.shared = true;
  }
  return outlineMat;
}

function paint(color: number, rough = 0.58, metal = 0.04): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

interface Built {
  bones: THREE.Bone[];
  byName: Record<string, THREE.Bone>;
  worldQ: Record<string, THREE.Quaternion>;
  at: Record<string, THREE.Vector3>;
}

function alignY(dir: THREE.Vector3): THREE.Quaternion {
  const q = new THREE.Quaternion();
  const d = dir.clone();
  if (d.lengthSq() < 1e-10) return q;
  q.setFromUnitVectors(Y_AXIS, d.normalize());
  return q;
}

function buildSkeleton(root: THREE.Object3D, spec: BodySpec): Built {
  const H = spec.height;
  const B = spec.build;
  const atY = (x: number, y: number, z: number) => new THREE.Vector3(x * H, y * H, z * H);
  const hipW = 0.052 * B;
  const shoulderW = 0.112 * B;
  const lJoint = atY(shoulderW, 0.785, 0);
  const rJoint = atY(-shoulderW, 0.785, 0);
  const places: Record<string, THREE.Vector3> = {
    Hips: atY(0, 0.53, 0),
    Spine: atY(0, 0.61, 0),
    Spine01: atY(0, 0.685, 0),
    Spine02: atY(0, 0.76, 0),
    Neck: atY(0, 0.835, 0),
    Head: atY(0, 0.9, 0),
    crown: atY(0, 1, 0),
    LeftShoulder: atY(0.03 * B, 0.772, 0),
    RightShoulder: atY(-0.03 * B, 0.772, 0),
    LeftArm: lJoint,
    RightArm: rJoint,
    LeftUpLeg: atY(hipW, 0.52, 0),
    RightUpLeg: atY(-hipW, 0.52, 0),
    LeftLeg: atY(hipW, 0.285, 0.012),
    RightLeg: atY(-hipW, 0.285, 0.012),
    LeftFoot: atY(hipW, 0.046, 0),
    RightFoot: atY(-hipW, 0.046, 0),
    leftToe: atY(hipW, 0.04, 0.1),
    rightToe: atY(-hipW, 0.04, 0.1),
  };
  const hang = (side: number, shoulder: THREE.Vector3) => {
    const elbow = shoulder.clone().add(new THREE.Vector3(-side * 0.012 * H, -0.175 * H, -0.02 * H));
    const wrist = elbow.clone().add(new THREE.Vector3(-side * 0.018 * H, -0.15 * H, 0.035 * H));
    const tip = wrist.clone().add(new THREE.Vector3(-side * 0.006 * H, -0.05 * H, 0.012 * H));
    return { elbow, wrist, tip };
  };
  const leftArm = hang(1, lJoint);
  const rightArm = hang(-1, rJoint);
  places.LeftForeArm = leftArm.elbow;
  places.RightForeArm = rightArm.elbow;
  places.LeftHand = leftArm.wrist;
  places.RightHand = rightArm.wrist;
  places.leftTip = leftArm.tip;
  places.rightTip = rightArm.tip;

  const parentOf: Record<string, string | null> = {
    Hips: null,
    Spine: 'Hips',
    Spine01: 'Spine',
    Spine02: 'Spine01',
    Neck: 'Spine02',
    Head: 'Neck',
    LeftShoulder: 'Spine02',
    RightShoulder: 'Spine02',
    LeftArm: 'LeftShoulder',
    RightArm: 'RightShoulder',
    LeftForeArm: 'LeftArm',
    RightForeArm: 'RightArm',
    LeftHand: 'LeftForeArm',
    RightHand: 'RightForeArm',
    LeftUpLeg: 'Hips',
    RightUpLeg: 'Hips',
    LeftLeg: 'LeftUpLeg',
    RightLeg: 'RightUpLeg',
    LeftFoot: 'LeftLeg',
    RightFoot: 'RightLeg',
  };
  const aimOf: Record<string, THREE.Vector3> = {
    Hips: places.Spine,
    Spine: places.Spine01,
    Spine01: places.Spine02,
    Spine02: places.Neck,
    Neck: places.Head,
    Head: places.crown,
    LeftShoulder: places.LeftArm,
    RightShoulder: places.RightArm,
    LeftArm: places.LeftForeArm,
    RightArm: places.RightForeArm,
    LeftForeArm: places.LeftHand,
    RightForeArm: places.RightHand,
    LeftHand: places.leftTip,
    RightHand: places.rightTip,
    LeftUpLeg: places.LeftLeg,
    RightUpLeg: places.RightLeg,
    LeftLeg: places.LeftFoot,
    RightLeg: places.RightFoot,
    LeftFoot: places.leftToe,
    RightFoot: places.rightToe,
  };

  const bones: THREE.Bone[] = [];
  const byName: Record<string, THREE.Bone> = {};
  const worldQ: Record<string, THREE.Quaternion> = {};
  const at: Record<string, THREE.Vector3> = {};
  for (const name of BODY_BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    const here = places[name];
    const aim = aimOf[name].clone().sub(here);
    const qWorld = alignY(aim);
    const parentName = parentOf[name];
    if (!parentName) {
      root.add(bone);
      bone.position.copy(here);
      bone.quaternion.copy(qWorld);
    } else {
      const parent = byName[parentName];
      parent.add(bone);
      const pq = worldQ[parentName];
      bone.position.copy(here).sub(places[parentName]).applyQuaternion(pq.clone().invert());
      bone.quaternion.copy(pq).invert().multiply(qWorld);
    }
    byName[name] = bone;
    worldQ[name] = qWorld;
    at[name] = here;
    bones.push(bone);
  }
  for (const key of ['crown', 'leftToe', 'rightToe', 'leftTip', 'rightTip']) at[key] = places[key];
  return { bones, byName, worldQ, at };
}

function boneSpan(built: Built, name: string, child: string): number {
  return built.at[name].distanceTo(built.at[child]);
}

export function createProceduralPlayer(spec: BodySpec, groupScale: number): ModelInstance {
  const H = spec.height;
  const B = spec.build;
  const L = spec.limb;
  const holder = new THREE.Group();
  holder.name = 'player-body';
  const root = new THREE.Group();
  root.name = 'player-root';
  holder.add(root);
  const built = buildSkeleton(root, spec);
  const torsoR = 0.078 * H * (0.7 + 0.3 * B) * (0.88 + 0.12 * L);
  const thighR = 0.052 * H * L * (0.84 + 0.16 * B);
  const shinR = 0.036 * H * L;
  const armR = 0.036 * H * L;
  const foreR = 0.028 * H * L;
  const handR = 0.02 * H * Math.min(L, 1.15);
  const neckR = 0.03 * H * (0.85 + 0.15 * L);
  const headR = 0.064 * H * (0.92 + 0.08 * B);
  const footR = 0.024 * H * (0.85 + 0.15 * L);

  const skin = paint(0xd7a57a, 0.62, 0);
  const jersey = paint(0x1e63c9, 0.72, 0.02);
  const pants = paint(0xf2f2f2, 0.78, 0);
  const helmet = paint(0xf5f5f5, 0.38, 0.08);
  const socks = paint(0xf3f4f2, 0.8, 0);
  const cleats = paint(0x161616, 0.55, 0.05);
  const mask = paint(0x23272c, 0.32, 0.72);
  const numberMat = new THREE.MeshBasicMaterial({
    color: 0xf7f8f8,
    map: jerseyNumberMap(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const outlines: THREE.Object3D[] = [];
  const ol = new THREE.Group();
  ol.name = 'outline';
  let outlineOn = true;
  Object.defineProperty(ol, 'visible', {
    configurable: true,
    get() { return outlineOn; },
    set(v: boolean) {
      outlineOn = !!v;
      for (const mesh of outlines) mesh.visible = outlineOn;
    },
  });
  root.add(ol);

  const outlineOf = (src: THREE.BufferGeometry, radius: number, span: number) => {
    if (src.type === 'SphereGeometry') return new THREE.SphereGeometry(radius * 1.1, 10, 8);
    if (src.type === 'BoxGeometry' || src.type === 'PlaneGeometry') return src;
    const cyl = Math.max(0.01, span - radius * 2);
    return new THREE.CapsuleGeometry(radius * 1.1, cyl + radius * 0.18, 3, 8);
  };

  function addMesh(
    bone: THREE.Bone,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    y: number,
    radius = 0,
    span = 0,
    outlined = true,
    scale?: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    bone.add(mesh);
    if (!outlined) return mesh;
    const shell = new THREE.Mesh(outlineOf(geo, radius, span), outlineMaterial());
    shell.position.y = y;
    shell.scale.copy(mesh.scale);
    shell.frustumCulled = false;
    shell.visible = outlineOn;
    bone.add(shell);
    outlines.push(shell);
    return mesh;
  }

  function along(name: string, child: string, radius: number, mat: THREE.Material, from = 0, to?: number) {
    const span = boneSpan(built, name, child);
    const a = from;
    const b = to ?? span;
    const len = Math.max(0.02, b - a);
    const geo = len < radius * 2.15
      ? new THREE.SphereGeometry(Math.max(radius * 0.92, len * 0.45), 10, 8)
      : new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 4, 8);
    addMesh(built.byName[name], geo, mat, (a + b) / 2, radius, len);
  }

  along('Spine', 'Spine01', torsoR * 0.92, jersey);
  along('Spine01', 'Spine02', torsoR, jersey);
  along('Spine02', 'Neck', torsoR * 1.02, jersey);
  along('Neck', 'Head', neckR, skin);
  addMesh(built.byName.Hips, new THREE.SphereGeometry(0.072 * H * (0.8 + 0.2 * B), 12, 10), pants, 0, 0.072 * H, 0.14 * H);

  along('LeftShoulder', 'LeftArm', 0.028 * H * (0.8 + 0.2 * B), jersey);
  along('RightShoulder', 'RightArm', 0.028 * H * (0.8 + 0.2 * B), jersey);
  const padR = 0.058 * H * (0.85 + 0.15 * B);
  for (const name of ['LeftShoulder', 'RightShoulder'] as const) {
    const span = boneSpan(built, name, name === 'LeftShoulder' ? 'LeftArm' : 'RightArm');
    addMesh(built.byName[name], new THREE.SphereGeometry(padR, 12, 10), jersey, span, padR, padR * 2, true, [1.25, 0.48, 1.05]);
  }
  along('LeftArm', 'LeftForeArm', armR, jersey);
  along('RightArm', 'RightForeArm', armR, jersey);
  along('LeftForeArm', 'LeftHand', foreR, skin);
  along('RightForeArm', 'RightHand', foreR, skin);
  along('LeftHand', 'leftTip', handR, skin);
  along('RightHand', 'rightTip', handR, skin);

  along('LeftUpLeg', 'LeftLeg', thighR, pants);
  along('RightUpLeg', 'RightLeg', thighR, pants);
  const leftShin = boneSpan(built, 'LeftLeg', 'LeftFoot');
  const rightShin = boneSpan(built, 'RightLeg', 'RightFoot');
  along('LeftLeg', 'LeftFoot', shinR * 0.96, pants, 0, leftShin * 0.22);
  along('RightLeg', 'RightFoot', shinR * 0.96, pants, 0, rightShin * 0.22);
  along('LeftLeg', 'LeftFoot', shinR * 0.9, socks, leftShin * 0.18, leftShin);
  along('RightLeg', 'RightFoot', shinR * 0.9, socks, rightShin * 0.18, rightShin);
  along('LeftFoot', 'leftToe', footR, cleats);
  along('RightFoot', 'rightToe', footR, cleats);

  const headLen = boneSpan(built, 'Head', 'crown');
  addMesh(built.byName.Head, new THREE.SphereGeometry(headR * 1.08, 16, 12), helmet, headLen * 0.42, headR, headR * 2, true, [1.02, 0.9, 1.06]);
  const face = addMesh(built.byName.Head, new THREE.SphereGeometry(headR * 0.72, 12, 10), skin, headLen * 0.3, headR * 0.72, headR);
  face.position.z = headR * 0.42;
  const bar = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mask);
    mesh.position.set(x, y, z);
    mesh.frustumCulled = false;
    built.byName.Head.add(mesh);
  };
  const fz = headR * 1.15;
  const fy = headLen * 0.26;
  for (const x of [-0.034 * H, 0, 0.034 * H]) bar(x, fy, fz, 0.006 * H, 0.075 * H, 0.006 * H);
  for (const dy of [-0.022 * H, 0.008 * H, 0.036 * H]) bar(0, fy + dy, fz, 0.09 * H, 0.006 * H, 0.006 * H);

  const chestLen = boneSpan(built, 'Spine02', 'Neck');
  const plate = new THREE.PlaneGeometry(0.16 * H, 0.2 * H);
  const front = addMesh(built.byName.Spine02, plate, numberMat, chestLen * 0.48, 0, 0, false);
  front.position.z = torsoR * 1.02;
  const back = addMesh(built.byName.Spine02, plate, numberMat, chestLen * 0.48, 0, 0, false);
  back.position.z = -torsoR * 1.02;
  back.rotation.y = Math.PI;

  root.rotation.y = Math.PI / 2;
  root.scale.setScalar(1 / Math.max(0.25, groupScale));
  root.updateMatrixWorld(true);
  const hips = built.byName.Hips;
  const hipsRest = hips.position.clone();
  const hp = new THREE.Vector3();
  hips.getWorldPosition(hp);
  root.worldToLocal(hp);
  const rest = built.bones.map((bone) => bone.quaternion.clone());

  const applyLook = (look: Look) => {
    jersey.color.setHex(look.jersey);
    pants.color.setHex(look.pants);
    helmet.color.setHex(look.helmet);
    skin.color.setHex(SKIN_TONE[look.skin]);
  };

  const dispose = () => {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    holder.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) geos.add(mesh.geometry);
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => mats.add(m));
      else if (mat) mats.add(mat);
    });
    geos.forEach((geo) => {
      if (!geo.userData.shared) geo.dispose();
    });
    mats.forEach((mat) => {
      if (!mat.userData.shared) mat.dispose();
    });
  };

  return {
    holder,
    root,
    sk: root,
    ol,
    bones: built.bones,
    byName: built.byName,
    rest,
    hips,
    hipsRest,
    hipsH: hp.y,
    armQ: new THREE.Quaternion(),
    mixer: null,
    walk: null,
    w: {},
    phase: 0,
    lastT: null,
    cq: new Map(),
    applyLook,
    dispose,
    bodyKey: bodyKey(spec),
  };
}
