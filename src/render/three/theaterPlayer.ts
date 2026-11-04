/**
 * FootballTheater body. The Unity rig is renamed to the pose-table bones and
 * reoriented so local +Y points at the child. Jersey, pants, helmet, numbers,
 * and the Stash beard are shader layers on that mesh.
 */
import * as THREE from 'three';
import { THEATER } from '../../data/theater';
import { skinHex, type Look } from '../../sim/look';
import { BODY_BONES, bodyKey, type BodySpec } from './body';
import type { ModelInstance } from './model';
import meshData from './theaterMesh.json';

interface PartArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
}

interface MeshArrays extends PartArrays {
  skinIndex: number[];
  skinWeight: number[];
  skinBones: string[];
  bones: { name: string; parent: string | null; pos: number[]; quat: number[] }[];
  helmet: PartArrays;
  facemask: PartArrays;
  beard: PartArrays;
}

const MESH = meshData as unknown as MeshArrays;
const REFERENCE_HEIGHT = 2;

interface TexSet {
  masks: THREE.Texture;
  shade: THREE.Texture;
  jersey: Map<string, THREE.Texture>;
  pants: Map<string, THREE.Texture>;
  helmetBase: THREE.Texture;
  helmetColor: THREE.Texture;
  helmetHoles: THREE.Texture;
  helmet: Map<string, THREE.Texture>;
  clear: THREE.Texture;
  white: THREE.Texture;
}

let textures: TexSet | null = null;
let bodyGeo: THREE.BufferGeometry | null = null;
let helmetGeo: THREE.BufferGeometry | null = null;
let maskGeo: THREE.BufferGeometry | null = null;
let beardGeo: THREE.BufferGeometry | null = null;
const numberCache = new Map<string, THREE.Texture>();

function baseUrl(): string {
  const base = import.meta.env?.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function solid(r: number, g: number, b: number, a: number): THREE.DataTexture {
  const data = new Uint8Array([r, g, b, a]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.userData.shared = true;
  return tex;
}

function configure(tex: THREE.Texture, data: boolean): THREE.Texture {
  tex.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.userData.shared = true;
  return tex;
}

function loadData(url: string): THREE.Texture {
  if (typeof document === 'undefined') return solid(0, 0, 0, 0);
  const tex = new THREE.TextureLoader().load(url);
  return configure(tex, true);
}

export function loadTheaterTextures(): void {
  if (textures || typeof document === 'undefined') return;
  const root = `${baseUrl()}theater/`;
  const jersey = new Map<string, THREE.Texture>();
  const pants = new Map<string, THREE.Texture>();
  const helmet = new Map<string, THREE.Texture>();
  for (const id of THEATER.jerseyPatterns) jersey.set(id, loadData(`${root}jersey/${id}.png`));
  for (const id of THEATER.pantsPatterns) pants.set(id, loadData(`${root}pants/${id}.png`));
  for (const id of THEATER.helmetPatterns) helmet.set(id, loadData(`${root}helmet/${id}.png`));
  textures = {
    masks: loadData(`${root}masks.png`),
    shade: loadData(`${root}shade.png`),
    jersey,
    pants,
    helmetBase: loadData(`${root}helmet/base.png`),
    helmetColor: loadData(`${root}helmet/color.png`),
    helmetHoles: loadData(`${root}helmet/holes.png`),
    helmet,
    clear: solid(0, 0, 0, 0),
    white: solid(255, 255, 255, 255),
  };
}

function tex(): TexSet {
  if (!textures) {
    textures = {
      masks: solid(255, 0, 255, 0),
      shade: solid(255, 255, 0, 255),
      jersey: new Map(),
      pants: new Map(),
      helmetBase: solid(255, 255, 255, 255),
      helmetColor: solid(255, 0, 0, 255),
      helmetHoles: solid(0, 0, 0, 0),
      helmet: new Map(),
      clear: solid(0, 0, 0, 0),
      white: solid(255, 255, 255, 255),
    };
  }
  return textures;
}

function geometryOf(part: PartArrays & { skinIndex?: number[]; skinWeight?: number[] }, skinned: boolean): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(part.uvs, 2));
  if (skinned && part.skinIndex && part.skinWeight) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(part.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(part.skinWeight, 4));
  }
  geo.userData.shared = true;
  return geo;
}

function sharedGeo(): { body: THREE.BufferGeometry; helmet: THREE.BufferGeometry; mask: THREE.BufferGeometry; beard: THREE.BufferGeometry } {
  bodyGeo = bodyGeo ?? geometryOf(MESH, true);
  helmetGeo = helmetGeo ?? geometryOf(MESH.helmet, false);
  maskGeo = maskGeo ?? geometryOf(MESH.facemask, false);
  beardGeo = beardGeo ?? geometryOf(MESH.beard, false);
  return { body: bodyGeo, helmet: helmetGeo, mask: maskGeo, beard: beardGeo };
}

const BODY_FRAG = /* glsl */ `
vec4 m = texture2D(uMasks, vMapUv);
vec4 sh = texture2D(uShade, vMapUv);
vec3 jd = texture2D(uJerseyDetail, vMapUv).rgb;
vec3 pd = texture2D(uPantsDetail, vMapUv).rgb;
float numA = texture2D(uNumber, vMapUv).a;
vec3 col = mix(vec3(0.15), uSkin, m.b);
vec3 jersey = uJerseyR;
jersey = mix(jersey, uJerseyG, jd.g);
jersey = mix(jersey, uJerseyB, jd.b);
jersey = mix(jersey, uJerseyR, jd.r);
jersey *= mix(vec3(0.55), vec3(1.0), sh.r);
col = mix(col, jersey, m.r);
vec3 pants = uPants;
pants = mix(pants, uPantsR, pd.r);
pants = mix(pants, uPantsG, pd.g);
pants *= mix(vec3(0.45), vec3(1.0), sh.g);
col = mix(col, pants, m.g);
col = mix(col, uSock, m.a);
vec3 shoe = uShoe * mix(0.35, 1.0, sh.a);
col = mix(col, shoe, sh.b);
float lum = dot(uJerseyR, vec3(0.3, 0.59, 0.11));
vec3 numCol = lum > 0.62 ? vec3(0.08) : vec3(0.96);
col = mix(col, numCol, numA);
diffuseColor.rgb = col;
`;

const HELM_FRAG = /* glsl */ `
vec3 shade = texture2D(uBase, vMapUv).rgb;
vec4 cmap = texture2D(uColorMap, vMapUv);
vec3 detail = texture2D(uDetail, vMapUv).rgb;
float hole = texture2D(uHole, vMapUv).r;
vec3 col = mix(uBaseColor, uFace, clamp(cmap.g, 0.0, 1.0));
col *= mix(vec3(0.45), vec3(1.0), shade);
col = mix(col, uR, detail.r);
col = mix(col, uG, detail.g);
col = mix(col, uB, detail.b);
if (hole > 0.55) discard;
diffuseColor.rgb = col;
`;

function patchBody(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> }, uniforms: Record<string, { value: unknown }>) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uLimb;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * uLimb;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uSkin; uniform vec3 uJerseyR; uniform vec3 uJerseyG; uniform vec3 uJerseyB;
uniform vec3 uPants; uniform vec3 uPantsR; uniform vec3 uPantsG; uniform vec3 uSock; uniform vec3 uShoe;
uniform sampler2D uMasks; uniform sampler2D uShade; uniform sampler2D uJerseyDetail; uniform sampler2D uPantsDetail; uniform sampler2D uNumber;`)
    .replace('#include <map_fragment>', BODY_FRAG);
}

function patchHelm(shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }, uniforms: Record<string, { value: unknown }>) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform vec3 uBaseColor; uniform vec3 uFace; uniform vec3 uR; uniform vec3 uG; uniform vec3 uB;
uniform sampler2D uBase; uniform sampler2D uColorMap; uniform sampler2D uDetail; uniform sampler2D uHole;`)
    .replace('#include <map_fragment>', HELM_FRAG);
}

function colorUniform(hex: number): { value: THREE.Color } {
  return { value: new THREE.Color(hex) };
}

function widen(bones: Record<string, THREE.Bone>, build: number) {
  if (Math.abs(build - 1) < 1e-3) return;
  const root = bones.Hips.parent as THREE.Object3D;
  root.updateMatrixWorld(true);
  const world = new Map<string, THREE.Vector3>();
  for (const name of BODY_BONES) {
    const at = new THREE.Vector3();
    bones[name].getWorldPosition(at);
    at.x *= build;
    world.set(name, at);
  }
  const pq = new THREE.Quaternion();
  const pp = new THREE.Vector3();
  for (const name of BODY_BONES) {
    const bone = bones[name];
    const parent = bone.parent as THREE.Object3D;
    const pos = world.get(name)!;
    if (parent === root) bone.position.copy(pos);
    else {
      parent.updateMatrixWorld(true);
      parent.getWorldQuaternion(pq);
      parent.getWorldPosition(pp);
      bone.position.copy(pos).sub(pp).applyQuaternion(pq.invert());
    }
    bone.updateMatrixWorld(true);
  }
}

function paintNumber(font: string, number: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const key = `${font}|${number}`;
  const cached = numberCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  numberCache.set(key, tex);
  const digits = String(Math.max(0, Math.min(99, number | 0))).padStart(number > 9 ? 2 : 1, '0');
  const root = `${baseUrl()}theater/numbers/${font}/`;
  const images = digits.split('').map((digit) => {
    const img = new Image();
    img.src = `${root}${digit}.png`;
    return img;
  });
  const draw = () => {
    ctx.clearRect(0, 0, 256, 256);
    if (images.length === 1) ctx.drawImage(images[0], 0, 0, 256, 256);
    else {
      ctx.drawImage(images[0], -11, 0, 256, 256);
      ctx.drawImage(images[1], 11, 0, 256, 256);
    }
    tex.needsUpdate = true;
  };
  let pending = images.length;
  for (const img of images) {
    img.onload = () => { pending -= 1; if (pending <= 0) draw(); };
    img.onerror = () => { pending -= 1; if (pending <= 0) draw(); };
  }
  return tex;
}

export function createTheaterPlayer(spec: BodySpec, groupScale: number): ModelInstance {
  const set = tex();
  const geo = sharedGeo();
  const holder = new THREE.Group();
  holder.name = 'player-body';
  const root = new THREE.Group();
  root.name = 'player-root';
  holder.add(root);
  const byName: Record<string, THREE.Bone> = {};
  const bones: THREE.Bone[] = [];
  for (const specBone of MESH.bones) {
    const bone = new THREE.Bone();
    bone.name = specBone.name;
    bone.position.fromArray(specBone.pos);
    bone.quaternion.fromArray(specBone.quat);
    byName[specBone.name] = bone;
  }
  for (const specBone of MESH.bones) {
    const bone = byName[specBone.name];
    const parent = specBone.parent ? byName[specBone.parent] : root;
    parent.add(bone);
  }
  for (const name of BODY_BONES) bones.push(byName[name]);
  widen(byName, spec.build);
  root.rotation.y = Math.PI / 2;
  root.scale.setScalar((spec.height / REFERENCE_HEIGHT) / Math.max(0.25, groupScale));
  root.updateMatrixWorld(true);

  const bodyUniforms = {
    uLimb: { value: (spec.limb - 1) * 0.02 },
    uSkin: colorUniform(0xd7a57a),
    uJerseyR: colorUniform(0x1e63c9),
    uJerseyG: colorUniform(0xf4f7f8),
    uJerseyB: colorUniform(0x1a1a1a),
    uPants: colorUniform(0xf2f2f2),
    uPantsR: colorUniform(0xf4f7f8),
    uPantsG: colorUniform(0x1a1a1a),
    uSock: colorUniform(0xf3f4f2),
    uShoe: colorUniform(0x161616),
    uMasks: { value: set.masks },
    uShade: { value: set.shade },
    uJerseyDetail: { value: set.clear },
    uPantsDetail: { value: set.clear },
    uNumber: { value: set.clear },
  };
  const bodyMat = new THREE.MeshStandardMaterial({ map: set.white, roughness: 0.72, metalness: 0.02 });
  bodyMat.customProgramCacheKey = () => 'theater-body';
  bodyMat.onBeforeCompile = (shader) => patchBody(shader, bodyUniforms);

  const skinBones = MESH.skinBones.map((name) => byName[name]);
  const skinned = new THREE.SkinnedMesh(geo.body, bodyMat);
  skinned.name = 'theater-body';
  skinned.frustumCulled = false;
  root.add(skinned);
  skinned.bind(new THREE.Skeleton(skinBones));

  const helmUniforms = {
    uBaseColor: colorUniform(0xf5f5f5),
    uFace: colorUniform(0x2a2e32),
    uR: colorUniform(0xf4f7f8),
    uG: colorUniform(0x1a1a1a),
    uB: colorUniform(0xc8102e),
    uBase: { value: set.helmetBase },
    uColorMap: { value: set.helmetColor },
    uDetail: { value: set.clear },
    uHole: { value: set.helmetHoles },
  };
  const helmMat = new THREE.MeshStandardMaterial({ map: set.white, roughness: 0.38, metalness: 0.08 });
  helmMat.customProgramCacheKey = () => 'theater-helmet';
  helmMat.onBeforeCompile = (shader) => patchHelm(shader, helmUniforms);
  const helmet = new THREE.Mesh(geo.helmet, helmMat);
  helmet.name = 'theater-helmet';
  helmet.frustumCulled = false;
  byName.Head.add(helmet);
  const maskMat = new THREE.MeshStandardMaterial({ color: 0x2a2e32, roughness: 0.32, metalness: 0.72 });
  const facemask = new THREE.Mesh(geo.mask, maskMat);
  facemask.name = 'theater-facemask';
  facemask.frustumCulled = false;
  byName.Head.add(facemask);
  const beardMat = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.84, metalness: 0 });
  const beard = new THREE.Mesh(geo.beard, beardMat);
  beard.name = 'theater-beard';
  beard.frustumCulled = false;
  beard.visible = false;
  byName.Head.add(beard);

  const ol = new THREE.Group();
  ol.name = 'outline';
  root.add(ol);

  const hips = byName.Hips;
  const hipsRest = hips.position.clone();
  const rest = bones.map((bone) => bone.quaternion.clone());
  const hp = new THREE.Vector3();
  hips.getWorldPosition(hp);
  root.worldToLocal(hp);

  let sig = '';
  const applyLook = (look: Look) => {
    const next = [
      look.jersey, look.pants, look.helmet, skinHex(look), look.number, look.font, look.beard,
      look.jerseyPattern, look.pantsPattern, look.helmetPattern,
      look.trim.jerseyG, look.trim.jerseyB, look.trim.pantsR, look.trim.pantsG,
      look.trim.face, look.trim.helmetR, look.trim.helmetG, look.trim.helmetB,
    ].join('|');
    if (next === sig) return;
    sig = next;
    bodyUniforms.uSkin.value.setHex(skinHex(look));
    bodyUniforms.uJerseyR.value.setHex(look.jersey);
    bodyUniforms.uJerseyG.value.setHex(look.trim.jerseyG);
    bodyUniforms.uJerseyB.value.setHex(look.trim.jerseyB);
    bodyUniforms.uPants.value.setHex(look.pants);
    bodyUniforms.uPantsR.value.setHex(look.trim.pantsR);
    bodyUniforms.uPantsG.value.setHex(look.trim.pantsG);
    bodyUniforms.uJerseyDetail.value = set.jersey.get(look.jerseyPattern) ?? set.clear;
    bodyUniforms.uPantsDetail.value = set.pants.get(look.pantsPattern) ?? set.clear;
    bodyUniforms.uNumber.value = paintNumber(look.font, look.number) ?? set.clear;
    helmUniforms.uBaseColor.value.setHex(look.helmet);
    helmUniforms.uFace.value.setHex(look.trim.face);
    helmUniforms.uR.value.setHex(look.trim.helmetR);
    helmUniforms.uG.value.setHex(look.trim.helmetG);
    helmUniforms.uB.value.setHex(look.trim.helmetB);
    helmUniforms.uDetail.value = set.helmet.get(look.helmetPattern) ?? set.clear;
    maskMat.color.setHex(look.trim.face);
    beard.visible = look.beard === 'stash';
  };

  const dispose = () => {
    bodyMat.dispose();
    helmMat.dispose();
    maskMat.dispose();
    beardMat.dispose();
  };

  return {
    holder,
    root,
    sk: root,
    ol,
    bones,
    byName,
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
    limb: spec.limb,
  };
}
