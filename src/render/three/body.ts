/**
 * Body proportions shared by the theater player. The mesh itself lives in
 * theaterPlayer.ts. Character space, before the root yaw: +Y up, +Z forward,
 * +X the body's left. Local +Y runs toward each bone's child so the pose table
 * and arm IK can aim this skeleton.
 */
import { DEFAULTS } from '../../config/defaults';
import type { Look } from '../../sim/look';

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

export function bodyOf(look: Look, modelHeightYd = DEFAULTS.modelHeightYd): BodySpec {
  const height = look.height * (modelHeightYd / DEFAULTS.modelHeightYd);
  return { height, build: look.build, limb: look.limb };
}

export function bodyKey(spec: BodySpec): string {
  return `${spec.height.toFixed(3)}|${spec.build.toFixed(3)}|${spec.limb.toFixed(3)}`;
}
