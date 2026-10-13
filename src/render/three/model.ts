import * as THREE from 'three';
import type { Settings } from '../../config/defaults';
import { DEFAULT_LOOK, type Look } from '../../sim/look';
import { bodyOf, createProceduralPlayer } from './body';

export interface ModelInstance {
  holder: THREE.Group;
  root: THREE.Object3D;
  sk: THREE.Object3D;
  ol: THREE.Object3D;
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
  bodyKey: string;
  applyLook(look: Look): void;
  dispose(): void;
}

export const MODEL: {
  ready: boolean;
  failed: string | null;
  scene: THREE.Object3D | null;
  height: number;
  footY: number;
  tris: number;
  walk: THREE.AnimationClip | null;
  clips: string[];
} = {
  ready: false,
  failed: null,
  scene: null,
  height: 2,
  footY: 0,
  tris: 0,
  walk: null,
  clips: [],
};

/** The body is built in code, so it is ready as soon as the page starts. */
export function loadPlayerModel(): void {
  MODEL.ready = true;
  MODEL.failed = null;
  MODEL.scene = MODEL.scene ?? new THREE.Group();
  MODEL.height = DEFAULT_LOOK.height;
  MODEL.footY = 0;
}

export function makeModelInstance(S: Settings, look: Look = DEFAULT_LOOK): ModelInstance {
  const spec = bodyOf(look, S.modelHeightYd);
  const inst = createProceduralPlayer(spec, S.playerScale || 1);
  inst.applyLook(look);
  return inst;
}
