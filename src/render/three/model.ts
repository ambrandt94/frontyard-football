import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Settings } from '../../config/defaults';
import { SKIN_TONE, type Look } from '../../sim/look';
import { assetUrl } from '../assets';

export interface ModelInstance {
  holder: THREE.Group;
  root: THREE.Object3D;
  sk: THREE.SkinnedMesh;
  ol: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  byName: Record<string, THREE.Bone>;
  rest: THREE.Quaternion[];
  hips: THREE.Bone;
  hipsRest: THREE.Vector3;
  hipsH: number;
  armQ: THREE.Quaternion;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
  w: Record<string, number>;
  phase: number;
  lastT: number | null;
  cq: Map<THREE.Object3D, THREE.Quaternion>;
  applyLook(look: Look): void;
}

export const MODEL: {
  ready: boolean;
  failed: string | null;
  scene: THREE.Object3D | null;
  height: number;
  footY: number;
  base: THREE.Texture | null;
  orm: THREE.Texture | null;
  mask: THREE.Texture | null;
  tris: number;
  walk: THREE.AnimationClip | null;
  clips: string[];
} = {
  ready: false,
  failed: null,
  scene: null,
  height: 1,
  footY: 0,
  base: null,
  orm: null,
  mask: null,
  tris: 0,
  walk: null,
  clips: [],
};

/** Average linear luminance of each region in player_basecolor.png. Keeps the shading when we tint. */
const REGION_LUM = { jersey: 0.024, pants: 0.024, helmet: 0.386, skin: 0.308 };

const LOOK_TINT = `
{
  vec4 mk = texture2D(maskMap, vMapUv);
  float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float cover = clamp(mk.r + mk.g + mk.b + mk.a, 0.0, 1.0);
  vec3 tintCol = uJersey * mk.r + uPants * mk.g + uHelmet * mk.b + uSkin * mk.a;
  float refL = max(uJerseyLum * mk.r + uPantsLum * mk.g + uHelmetLum * mk.b + uSkinLum * mk.a, 0.02);
  diffuseColor.rgb = mix(diffuseColor.rgb, tintCol * (lum / refL), cover);
}`;

interface LookColors { jersey: THREE.Color; pants: THREE.Color; helmet: THREE.Color; skin: THREE.Color }

function lookMaterial(): THREE.MeshStandardMaterial {
  const colors: LookColors = {
    jersey: new THREE.Color(),
    pants: new THREE.Color(),
    helmet: new THREE.Color(),
    skin: new THREE.Color(),
  };
  const m = new THREE.MeshStandardMaterial({
    map: MODEL.base,
    roughnessMap: MODEL.orm,
    metalnessMap: MODEL.orm,
    roughness: 1,
    metalness: 0.6,
  });
  m.userData.lookColors = colors;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.maskMap = { value: MODEL.mask };
    sh.uniforms.uJersey = { value: colors.jersey };
    sh.uniforms.uPants = { value: colors.pants };
    sh.uniforms.uHelmet = { value: colors.helmet };
    sh.uniforms.uSkin = { value: colors.skin };
    sh.uniforms.uJerseyLum = { value: REGION_LUM.jersey };
    sh.uniforms.uPantsLum = { value: REGION_LUM.pants };
    sh.uniforms.uHelmetLum = { value: REGION_LUM.helmet };
    sh.uniforms.uSkinLum = { value: REGION_LUM.skin };
    sh.fragmentShader = [
      'uniform sampler2D maskMap;',
      'uniform vec3 uJersey;',
      'uniform vec3 uPants;',
      'uniform vec3 uHelmet;',
      'uniform vec3 uSkin;',
      'uniform float uJerseyLum;',
      'uniform float uPantsLum;',
      'uniform float uHelmetLum;',
      'uniform float uSkinLum;',
    ].join('\n') + '\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + LOOK_TINT);
  };
  m.customProgramCacheKey = () => 'look-v1';
  return m;
}

let outlineMat: THREE.MeshBasicMaterial | null = null;
function getOutlineMat(): THREE.MeshBasicMaterial {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.MeshBasicMaterial({ color: 0x06090d, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += normalize(objectNormal) * 1.3;');
  };
  outlineMat.customProgramCacheKey = () => 'outline';
  return outlineMat;
}

export function loadPlayerModel(): void {
  if (location.protocol === 'file:') {
    MODEL.failed = 'file:// (serve over http to see the model)';
    return;
  }
  const tl = new THREE.TextureLoader();
  const tex = (u: string, srgb: boolean) => new Promise<THREE.Texture>((res, rej) => tl.load(u, (t) => {
    t.flipY = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    res(t);
  }, undefined, rej));
  const maskTex = tex(assetUrl('player_mask.png'), false).then((t) => {
    t.colorSpace = THREE.LinearSRGBColorSpace;
    return t;
  });
  Promise.all([
    new Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>((res, rej) => new GLTFLoader().load(assetUrl('player.glb'), res, undefined, rej)),
    tex(assetUrl('player_basecolor.png'), true),
    tex(assetUrl('player_orm.png'), false),
    maskTex,
  ]).then(([gltf, base, orm, mask]) => {
    const sc = gltf.scene;
    let sk: THREE.SkinnedMesh | null = null;
    sc.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sk = o as THREE.SkinnedMesh; });
    if (!sk) throw new Error('no skinned mesh');
    const mesh = sk as THREE.SkinnedMesh;
    sc.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sc);
    MODEL.scene = sc;
    MODEL.height = box.max.y - box.min.y;
    MODEL.footY = -box.min.y;
    MODEL.base = base;
    MODEL.orm = orm;
    MODEL.mask = mask;
    MODEL.tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
    const clip = gltf.animations[0];
    if (clip) {
      clip.tracks = clip.tracks.filter((t) => !/\.scale$/.test(t.name) && t.name !== 'Hips.position');
      MODEL.walk = clip;
    }
    MODEL.clips = gltf.animations.map((c) => c.name);
    MODEL.ready = true;
  }).catch((e: unknown) => {
    MODEL.failed = String((e && (e as Error).message) || e);
    console.info('Player model unavailable, using capsules:', MODEL.failed);
  });
}

export function makeModelInstance(S: Settings): ModelInstance {
  if (!MODEL.scene) throw new Error('model not ready');
  const root = cloneSkeleton(MODEL.scene);
  let sk: THREE.SkinnedMesh | null = null;
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sk = o as THREE.SkinnedMesh; });
  if (!sk) throw new Error('no skinned mesh');
  const mesh: THREE.SkinnedMesh = sk;
  const mat = lookMaterial();
  mesh.material = mat;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const ol = new THREE.SkinnedMesh(mesh.geometry, getOutlineMat());
  ol.bind(mesh.skeleton, mesh.bindMatrix);
  ol.position.copy(mesh.position);
  ol.quaternion.copy(mesh.quaternion);
  ol.scale.copy(mesh.scale);
  ol.frustumCulled = false;
  mesh.parent?.add(ol);
  const holder = new THREE.Group();
  holder.add(root);
  root.rotation.y = Math.PI / 2;
  const k = S.modelHeightYd / 1.25 / MODEL.height;
  root.scale.setScalar(k);
  root.position.y = MODEL.footY * k;
  const bones = mesh.skeleton.bones;
  const byName: Record<string, THREE.Bone> = {};
  bones.forEach((b) => { byName[b.name] = b; });
  const rest = bones.map((b) => b.quaternion.clone());
  const hips = byName.Hips;
  if (!hips) throw new Error('Hips bone missing');
  const hipsRest = hips.position.clone();
  const armQ = new THREE.Quaternion();
  for (let n = hips.parent; n && n !== root; n = n.parent) armQ.premultiply(n.quaternion);
  root.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  hips.getWorldPosition(hp);
  root.worldToLocal(hp);
  let mixer: THREE.AnimationMixer | null = null;
  let walk: THREE.AnimationAction | null = null;
  if (MODEL.walk) {
    mixer = new THREE.AnimationMixer(root);
    walk = mixer.clipAction(MODEL.walk);
    walk.play();
  }
  const applyLook = (look: Look) => {
    const colors = mat.userData.lookColors as LookColors;
    colors.jersey.setHex(look.jersey);
    colors.pants.setHex(look.pants);
    colors.helmet.setHex(look.helmet);
    colors.skin.setHex(SKIN_TONE[look.skin]);
  };
  return { holder, root, sk: mesh, ol, bones, byName, rest, hips, hipsRest, hipsH: hp.y, armQ, mixer, walk, w: {}, phase: 0, lastT: null, cq: new Map(), applyLook };
}
