/**
 * Bake FootballTheater's body, helmet, and Stash beard into one JSON mesh
 * the game can build synchronously. Bones are renamed to the pose/IK set and
 * reoriented so local +Y runs toward the child. Skinning is checked at rest.
 */
import { Blob } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    result = null;
    onloadend = null;
    readAsArrayBuffer(blob) {
      const asBlob = blob instanceof Blob ? blob : new Blob([blob]);
      asBlob.arrayBuffer().then((buf) => {
        this.result = buf;
        setTimeout(() => this.onloadend?.({ target: this }), 0);
      });
    }
    readAsDataURL() { this.onloadend?.({ target: this }); }
  };
}
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.env.THEATER_SRC || '/tmp/ft/ChainLink.Football';
const outPath = join(root, 'src/render/three/theaterMesh.json');

const MAP = {
  RigPelvis: 'Hips',
  RigSpine1: 'Spine',
  RigSpine2: 'Spine01',
  RigRibcage: 'Spine02',
  RigNeck: 'Neck',
  RigHead: 'Head',
  RigLArm1: 'LeftArm',
  RigLArm2: 'LeftForeArm',
  RigLArmPalm: 'LeftHand',
  RigRArm1: 'RightArm',
  RigRArm2: 'RightForeArm',
  RigRArmPalm: 'RightHand',
  RigLLeg1: 'LeftUpLeg',
  RigLLeg2: 'LeftLeg',
  RigLLegAnkle: 'LeftFoot',
  RigRLeg1: 'RightUpLeg',
  RigRLeg2: 'RightLeg',
  RigRLegAnkle: 'RightFoot',
};

const CHILD = {
  Hips: 'Spine',
  Spine: 'Spine01',
  Spine01: 'Spine02',
  Spine02: 'Neck',
  Neck: 'Head',
  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',
};

const PARENT = {
  Hips: null,
  Spine: 'Hips',
  Spine01: 'Spine',
  Spine02: 'Spine01',
  Neck: 'Spine02',
  Head: 'Neck',
  LeftShoulder: 'Spine02',
  RightShoulder: 'Spine02',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
};

function loadFbx(path) {
  const buf = readFileSync(path);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path);
}

function f32(attr, itemSize) {
  const out = [];
  const v = new THREE.Vector3();
  const srcAttr = attr;
  for (let i = 0; i < srcAttr.count; i++) {
    if (itemSize === 3) {
      v.fromBufferAttribute(srcAttr, i);
      out.push(+v.x.toFixed(5), +v.y.toFixed(5), +v.z.toFixed(5));
    } else if (itemSize === 2) {
      out.push(+srcAttr.getX(i).toFixed(5), +srcAttr.getY(i).toFixed(5));
    } else {
      for (let k = 0; k < itemSize; k++) out.push(+srcAttr.getComponent(i, k).toFixed(5));
    }
  }
  return out;
}

function parseGltf(path) {
  const g = JSON.parse(readFileSync(path, 'utf8'));
  const bin = readFileSync(path.replace(/\.gltf$/, '.bin'));
  const accessors = g.accessors.map((a) => {
    const view = g.bufferViews[a.bufferView];
    const start = (view.byteOffset || 0) + (a.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const count = a.count * comps;
    if (a.componentType !== 5126 && a.componentType !== 5123 && a.componentType !== 5125) {
      throw new Error('unexpected component ' + a.componentType);
    }
    const out = [];
    if (a.componentType === 5126) {
      for (let i = 0; i < count; i++) out.push(bin.readFloatLE(start + i * 4));
    } else if (a.componentType === 5123) {
      for (let i = 0; i < count; i++) out.push(bin.readUInt16LE(start + i * 2));
    } else {
      for (let i = 0; i < count; i++) out.push(bin.readUInt32LE(start + i * 4));
    }
    return out;
  });
  return { g, accessors };
}

function meshFromGltf(doc, nodeIndex) {
  const node = doc.g.nodes[nodeIndex];
  const prim = doc.g.meshes[node.mesh].primitives[0];
  const pos = doc.accessors[prim.attributes.POSITION];
  const nrm = doc.accessors[prim.attributes.NORMAL];
  const uv = doc.accessors[prim.attributes.TEXCOORD_0];
  const idx = prim.indices != null ? doc.accessors[prim.indices] : null;
  const mat = new THREE.Matrix4();
  if (node.matrix) mat.fromArray(node.matrix);
  const v = new THREE.Vector3();
  const normalMat = new THREE.Matrix3().getNormalMatrix(mat);
  const positions = [];
  const normals = [];
  const uvs = [];
  const pushVert = (i) => {
    v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(mat);
    positions.push(v.x, v.y, v.z);
    v.set(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]).applyMatrix3(normalMat).normalize();
    normals.push(v.x, v.y, v.z);
    uvs.push(uv[i * 2], uv[i * 2 + 1]);
  };
  if (!idx) {
    for (let i = 0; i < pos.length / 3; i++) pushVert(i);
  } else {
    for (const i of idx) pushVert(i);
  }
  return { positions, normals, uvs };
}

function alignY(dir, hint) {
  const y = dir.clone();
  if (y.lengthSq() < 1e-10) y.set(0, 1, 0);
  else y.normalize();
  const z = hint.clone();
  z.addScaledVector(y, -z.dot(y));
  if (z.lengthSq() < 1e-8) {
    const alt = Math.abs(y.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    z.copy(alt).addScaledVector(y, -alt.dot(y));
  }
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function skinError(positions, skinIndex, skinWeight, bones, inverses) {
  const v = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let max = 0;
  const stride = 3;
  const count = positions.length / stride;
  for (let i = 0; i < count; i += 17) {
    v.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const bi = skinIndex[i * 4 + k];
      const wt = skinWeight[i * 4 + k];
      if (wt <= 0) continue;
      tmp.copy(v).applyMatrix4(inverses[bi]).applyMatrix4(bones[bi].matrixWorld);
      acc.addScaledVector(tmp, wt);
    }
    max = Math.max(max, acc.distanceTo(v));
  }
  return max;
}

const group = loadFbx(join(src, 'Base-NoEars.fbx'));
group.updateMatrixWorld(true);
let mesh = null;
group.traverse((obj) => { if (obj.isSkinnedMesh) mesh = obj; });
if (!mesh) throw new Error('no skinned body');

const srcBones = mesh.skeleton.bones.filter((b) => MAP[b.name]);
const skinRemap = mesh.skeleton.bones.map((b) => {
  const at = srcBones.indexOf(b);
  return at >= 0 ? at : 0;
});
const geo = mesh.geometry;
const posAttr = geo.attributes.position;
const nrmAttr = geo.attributes.normal;
const uvAttr = geo.attributes.uv;
const skinAttr = geo.attributes.skinIndex;
const weightAttr = geo.attributes.skinWeight;
const bakedPos = [];
const bakedNrm = [];
const uvs = [];
const skinIndex = [];
const skinWeight = [];
const v = new THREE.Vector3();
const bindRot = new THREE.Matrix4().extractRotation(mesh.bindMatrix);
for (let i = 0; i < posAttr.count; i++) {
  v.fromBufferAttribute(posAttr, i).applyMatrix4(mesh.bindMatrix);
  bakedPos.push(v.x, v.y, v.z);
  v.fromBufferAttribute(nrmAttr, i).applyMatrix4(bindRot).normalize();
  bakedNrm.push(v.x, v.y, v.z);
  uvs.push(uvAttr.getX(i), uvAttr.getY(i));
  for (let k = 0; k < 4; k++) {
    const raw = skinAttr.getComponent(i, k);
    const wt = weightAttr.getComponent(i, k);
    const mapped = skinRemap[raw] ?? 0;
    skinIndex.push(wt > 0 ? mapped : 0);
    skinWeight.push(wt > 0 && skinRemap[raw] != null && mesh.skeleton.bones[raw] && MAP[mesh.skeleton.bones[raw].name] ? wt : 0);
  }
}

const byNew = {};
for (const b of srcBones) {
  const p = new THREE.Vector3();
  b.getWorldPosition(p);
  byNew[MAP[b.name]] = { src: b, pos: p };
}
let crown = 0;
for (let i = 1; i < bakedPos.length; i += 3) crown = Math.max(crown, bakedPos[i]);
const SCALE = 2 / crown;

const worldPos = {};
const worldQuat = {};
for (const [name, info] of Object.entries(byNew)) {
  worldPos[name] = info.pos.clone().multiplyScalar(SCALE);
}
const handEnd = {};
const footEnd = {};
group.traverse((obj) => {
  if (obj.name === 'RigLArmPalm_end' || obj.name === 'RigRArmPalm_end' || obj.name === 'RigLLegAnkle_end' || obj.name === 'RigRLegAnkle_end') {
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    const key = obj.name.includes('LArm') ? 'LeftHand' : obj.name.includes('RArm') ? 'RightHand' : obj.name.includes('LLeg') ? 'LeftFoot' : 'RightFoot';
    (obj.name.includes('Arm') ? handEnd : footEnd)[key] = p.multiplyScalar(SCALE);
  }
});
worldPos.LeftShoulder = worldPos.Spine02.clone().lerp(worldPos.LeftArm, 0.18);
worldPos.RightShoulder = worldPos.Spine02.clone().lerp(worldPos.RightArm, 0.18);

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
function aimOf(name) {
  if (name === 'Head') return worldPos.Head.clone().add(new THREE.Vector3(0, 0.25, 0));
  if (handEnd[name]) return handEnd[name].clone();
  if (footEnd[name]) return footEnd[name].clone();
  const child = CHILD[name];
  if (child && worldPos[child]) return worldPos[child].clone();
  if (name === 'LeftShoulder') return worldPos.LeftArm.clone();
  if (name === 'RightShoulder') return worldPos.RightArm.clone();
  return worldPos[name].clone().add(UP);
}
function poseQuats() {
  for (const name of Object.keys(worldPos)) {
    const dir = aimOf(name).sub(worldPos[name]);
    worldQuat[name] = alignY(dir, FORWARD);
  }
}
poseQuats();
const originalWorld = {};
for (const name of Object.keys(worldPos)) {
  originalWorld[name] = new THREE.Matrix4().compose(worldPos[name], worldQuat[name], new THREE.Vector3(1, 1, 1));
}
// The authored arms are short for the catches this game already aims. Lengthen
// the chain and keep the original inverse bind so the mesh stretches with it.
const ARM_REACH = 1.28;
for (const side of ['Left', 'Right']) {
  const shoulder = worldPos[`${side}Arm`].clone();
  const elbow = worldPos[`${side}ForeArm`].clone();
  const wrist = worldPos[`${side}Hand`].clone();
  const newElbow = shoulder.clone().add(elbow.clone().sub(shoulder).multiplyScalar(ARM_REACH));
  const newWrist = newElbow.clone().add(wrist.clone().sub(elbow).multiplyScalar(ARM_REACH));
  worldPos[`${side}ForeArm`] = newElbow;
  worldPos[`${side}Hand`] = newWrist;
  if (handEnd[`${side}Hand`]) handEnd[`${side}Hand`] = worldPos[`${side}Hand`].clone().add(handEnd[`${side}Hand`].clone().sub(wrist).multiplyScalar(ARM_REACH));
}
poseQuats();

const names = Object.keys(PARENT);
const localPos = {};
const localQuat = {};
function writeLocal(name) {
  const parent = PARENT[name];
  if (!parent) {
    localPos[name] = worldPos[name].clone();
    localQuat[name] = worldQuat[name].clone();
    return;
  }
  writeLocal.done = writeLocal.done || new Set();
  if (!writeLocal.done.has(parent)) writeLocal(parent);
  writeLocal.done.add(name);
  const pq = worldQuat[parent];
  localPos[name] = worldPos[name].clone().sub(worldPos[parent]).applyQuaternion(pq.clone().invert());
  localQuat[name] = pq.clone().invert().multiply(worldQuat[name]);
}
for (const name of names) writeLocal(name);

const holder = new THREE.Group();
const bones = {};
for (const name of names) {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.copy(localPos[name]);
  bone.quaternion.copy(localQuat[name]);
  bones[name] = bone;
}
for (const name of names) {
  const parent = PARENT[name];
  (parent ? bones[parent] : holder).add(bones[name]);
}
holder.updateMatrixWorld(true);

const skinNames = srcBones.map((b) => MAP[b.name]);
const skinBones = skinNames.map((n) => bones[n]);
const scaledPos = [];
for (let i = 0; i < bakedPos.length; i += 3) {
  scaledPos.push(bakedPos[i] * SCALE, bakedPos[i + 1] * SCALE, bakedPos[i + 2] * SCALE);
}
const inverses = skinNames.map((name) => originalWorld[name].clone().invert());
const err = skinError(scaledPos, skinIndex, skinWeight, skinBones, inverses);
console.log('arm stretch yd', err.toFixed(5), 'crown', crown.toFixed(2), 'scale', SCALE.toFixed(6));
console.log('forearm local', bones.LeftForeArm.position.toArray().map((n) => +n.toFixed(4)));
console.log('head', bones.Head.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(3)));
console.log('foot', bones.LeftFoot.getWorldPosition(new THREE.Vector3()).toArray().map((n) => +n.toFixed(3)));
console.log('arms', bones.LeftArm.getWorldPosition(new THREE.Vector3()).x.toFixed(3), bones.RightArm.getWorldPosition(new THREE.Vector3()).x.toFixed(3));
if (!Number.isFinite(err)) throw new Error('skinning produced NaN');

function toHeadLocal(flat) {
  const inv = bones.Head.matrixWorld.clone().invert();
  const out = [];
  const p = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(inv);
  for (let i = 0; i < flat.positions.length; i += 3) {
    p.set(flat.positions[i] * SCALE, flat.positions[i + 1] * SCALE, flat.positions[i + 2] * SCALE).applyMatrix4(inv);
    out.push(+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5));
  }
  const normals = [];
  for (let i = 0; i < flat.normals.length; i += 3) {
    p.set(flat.normals[i], flat.normals[i + 1], flat.normals[i + 2]).applyMatrix3(nm).normalize();
    normals.push(+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4));
  }
  return {
    positions: out,
    normals,
    uvs: flat.uvs.map((n) => +n.toFixed(5)),
  };
}

function translate(flat, x, y, z) {
  const positions = flat.positions.slice();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += x;
    positions[i + 1] += y;
    positions[i + 2] += z;
  }
  return { ...flat, positions };
}

const helmetDoc = parseGltf('/tmp/helmet.gltf');
// Helmet file is centered near the origin. Sit it on the head box (crown at 150.8cm).
const helm = translate(meshFromGltf(helmetDoc, 1), 0, 109, 0);
const mask = translate(meshFromGltf(helmetDoc, 2), 0, 109, 0);
const beardDoc = parseGltf('/tmp/stash.gltf');
const beard = translate(meshFromGltf(beardDoc, 1), 0, 130, 1.5);

function bounds(flat) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < flat.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], flat.positions[i + k]);
      max[k] = Math.max(max[k], flat.positions[i + k]);
    }
  }
  return { min, max };
}
console.log('helmet cm', bounds(helm));
console.log('beard cm', bounds(beard));
console.log('helmet head-local', bounds(toHeadLocal(helm)));
console.log('beard head-local', bounds(toHeadLocal(beard)));

const payload = {
  scaleFromCm: SCALE,
  positions: scaledPos.map((n) => +n.toFixed(5)),
  normals: bakedNrm.map((n) => +n.toFixed(4)),
  uvs: uvs.map((n) => +n.toFixed(5)),
  skinIndex,
  skinWeight: skinWeight.map((n) => +n.toFixed(5)),
  skinBones: skinNames,
  bones: names.map((name) => ({
    name,
    parent: PARENT[name],
    pos: localPos[name].toArray().map((n) => +n.toFixed(5)),
    quat: localQuat[name].toArray().map((n) => +n.toFixed(6)),
  })),
  helmet: toHeadLocal(helm),
  facemask: toHeadLocal(mask),
  beard: toHeadLocal(beard),
};
writeFileSync(outPath, JSON.stringify(payload));
console.log('wrote', outPath, 'bytes', JSON.stringify(payload).length);

function staticMesh(flat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(flat.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(flat.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(flat.uvs, 2));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
}

const bodyGeo = new THREE.BufferGeometry();
bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(scaledPos, 3));
bodyGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bakedNrm, 3));
bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
const skinned = new THREE.SkinnedMesh(bodyGeo, new THREE.MeshStandardMaterial());
holder.add(skinned);
const skeleton = new THREE.Skeleton(skinBones);
skinned.bind(skeleton, new THREE.Matrix4());
skeleton.boneInverses = inverses;
bones.Head.add(staticMesh(toHeadLocal(helm)));
bones.Head.add(staticMesh(toHeadLocal(mask)));
bones.Head.add(staticMesh(toHeadLocal(beard)));
mkdirSync(join(root, 'public/theater'), { recursive: true });
const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(holder, { binary: true });
const glbPath = join(root, 'public/theater/body.glb');
writeFileSync(glbPath, Buffer.from(glb));
console.log('wrote', glbPath, glb.byteLength);
