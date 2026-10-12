export interface Settings {
  accel: number;
  decel: number;
  releaseDecel: number;
  turnRate: number;
  cutPenalty: number;
  cutBleed: number;
  reverseAngleDeg: number;
  jogSpeed: number;
  fullSpeed: number;
  sprintAccelMult: number;
  boostPerPump: number;
  sprintMaxSpeed: number;
  boostHoldDelay: number;
  boostDecayRate: number;
  cutDecayAngleDeg: number;
  cutDecayMult: number;
  easeOffStick: number;
  ltSpeedCap: number;
  deadzone: number;
  /** Gamepad RT must pass this before a throw charge or a one-hand catch counts. */
  rtEngage: number;
  /** After RT engages, the throw releases only once it drops below this. */
  rtRelease: number;
  /** A trigger brush shorter than this never becomes a throw, milliseconds. */
  rtMinHoldMs: number;
  /** Absolute+ or direction charge. Local to this player. */
  aimMode: 'absolutePlus' | 'directionCharge';
  /** Radial deadzone used only for aiming. Movement still uses `deadzone`. */
  aimDeadzone: number;
  /** Absolute+: closest the stick can place the reticle, yards from the QB. */
  aimMinDist: number;
  /** Absolute+: full-stick distance, yards. */
  aimMaxDist: number;
  /** Absolute+: exponent on stick magnitude past the deadzone. */
  aimDistExp: number;
  /** One Euro minimum cutoff, hertz. Shared by angle and magnitude. */
  aimEuroMin: number;
  /** One Euro speed coefficient. Higher lets a flick through. */
  aimEuroBeta: number;
  /** Absolute+ and direction charge ignore smaller angle changes at high magnitude. */
  aimAngleDeadband: number;
  /** How long a stick spring-back keeps the aimed spot, milliseconds. */
  aimGraceMs: number;
  /** Direction charge: distance when the trigger is first pressed. */
  chargeMinDist: number;
  /** Direction charge: farthest the marker travels, yards. */
  chargeMaxDist: number;
  /** Direction charge: seconds from min distance to max. */
  chargeTime: number;
  /** Direction charge: exponent on the charge clock. */
  chargeExp: number;
  /** Direction charge: the marker reverses after it reaches max distance. */
  chargePingPong: boolean;
  /** Arc loft used before the trigger is touched. 0 is a loft, 1 is a bullet. */
  previewDefaultLoft: number;
  facingTurnRate: number;
  minThrowSpeed: number;
  maxThrowSpeed: number;
  minLoftDeg: number;
  maxLoftDeg: number;
  stepIntoBonus: number;
  backFootPenalty: number;
  baseInaccuracy: number;
  unsquaredInaccuracy: number;
  kbChargeTime: number;
  catchWindowMs: number;
  catchReach: number;
  reachHeight: number;
  oneHandReach: number;
  oneHandWindowMs: number;
  oneHandSuccess: number;
  ltWindowBonusMs: number;
  jumpHeight: number;
  jumpDuration: number;
  diveDistance: number;
  diveDuration: number;
  diveRecovery: number;
  diveReachBonus: number;
  plantLockout: number;
  batReach: number;
  aiTimingErrorMs: number;
  autoThrowDelay: number;
  sidestepNormal: number;
  sidestepSprint: number;
  sidestepAngleNormal: number;
  sidestepAngleSprint: number;
  sidestepTime: number;
  flickThreshold: number;
  flickRearm: number;
  flickCooldown: number;
  truckBurst: number;
  truckDuration: number;
  truckBonus: number;
  truckContactSlow: number;
  spinDuration: number;
  spinMomentumAngle: number;
  spinDrift: number;
  spinSpeedKeep: number;
  spinVulnerable: number;
  spinCounter: number;
  jukeBackstep: number;
  jukeHopTime: number;
  jukeReaccelWindow: number;
  jukeReaccelMult: number;
  hurdleHeight: number;
  hurdleDuration: number;
  hurdleClear: number;
  runDiveDistance: number;
  stiffArmStrength: number;
  stiffArmReach: number;
  stiffArmPush: number;
  tapMaxTime: number;
  handSwitchTime: number;
  wrapReach: number;
  wrapWindow: number;
  wrapLunge: number;
  wrapSuccess: number;
  /** Added yards of a forward lunge at full speed, before momentum. The burst lasts 0.25s. */
  lungeDist: number;
  /** Multiplier on lunge burst speed. 1 covers lungeDist in that 0.25s. */
  lungeSpeed: number;
  /** 0 lunges the same distance every direction. 1 cuts sideways and backward lunges. */
  lungeAlign: number;
  /** 0 ignores current speed. 1 makes a standing lunge a short step. */
  lungeSpeedScale: number;
  /** Right-stick magnitude that starts a lunge. */
  lungeThreshold: number;
  /** Seconds before another lunge. The stick must drop and come back. */
  lungeCooldown: number;
  /** Seconds after the burst that a touch still tries a wrap. */
  lungeContact: number;
  /** Miss recovery at a full-length lunge, seconds. Shorter lunges get up faster. */
  lungeMiss: number;
  diveTackleDist: number;
  diveTackleReach: number;
  diveTackleSuccess: number;
  diveTackleRecovery: number;
  noLTTackleMult: number;
  behindPenalty: number;
  speedPenalty: number;
  bigHitSpeed: number;
  missStagger: number;
  brokenStagger: number;
  brokenSlow: number;
  tackleCooldown: number;
  fumbleBase: number;
  ballSideFumbleMult: number;
  bigHitFumbleMult: number;
  hurdleWrapFumbleMult: number;
  punchFumble: number;
  punchReach: number;
  punchCooldown: number;
  aiAggression: number;
  aiReaction: number;
  aiLead: number;
  aiMoveRate: number;
  runStartDist: number;
  runDefenderGap: number;
  plantFallTime: number;
  stretchMaxReach: number;
  stretchRecoveryMult: number;
  fallLeanTime: number;
  fallExtraReach: number;
  fallRecovery: number;
  doubleTapWindow: number;
  pitchFlickWindow: number;
  pitchMinSpeed: number;
  pitchMaxSpeed: number;
  pitchDefaultSpeed: number;
  pitchDefaultAngle: number;
  pitchMinAngle: number;
  pitchLoft: number;
  pitchInherit: number;
  pitchCatchReach: number;
  pitchCatchReliability: number;
  trailingBack: boolean;
  throwModeRB: boolean;
  trailDepth: number;
  trailWidth: number;
  requireSnap: boolean;
  callReactionDelay: number;
  callCooldown: number;
  catchShortMin: number;
  catchShortMax: number;
  catchMedMin: number;
  catchMedMax: number;
  catchDeepMin: number;
  catchDeepMax: number;
  catchThrowsPerBand: number;
  catchCycleBands: boolean;
  catchInterval: number;
  catchLobShare: number;
  catchWindup: number;
  catchSidelineShare: number;
  catchPaused: boolean;
  catchAIReceiver: boolean;
  /** AI defender closes after a catch in Throw mode. */
  throwPursuer: boolean;
  /** AI defender closes after a catch in Catch mode. */
  catchPursuer: boolean;
  /** When the QB is controlled and the receiver catches it, switch control to the receiver. */
  autoSwitchCarrier: boolean;
  /** Catch mode scores by crossing this many yards past the catch, or the end zone if that is closer. */
  catchTargetYds: number;
  /** Spawn the coverage defender in regular Throw mode. Coverage mode always has one. */
  throwDefender: boolean;
  /** Pre-snap depth: press is on the receiver, off is a cushion. */
  covAlign: 'press' | 'off';
  /** Inside is toward the middle of the field, outside toward the sideline. */
  covShade: 'inside' | 'outside';
  /** Bot QB throws once the receiver is at least this far from the defender. */
  covSep: number;
  /** Scales each route's minimum hold. 1 uses the route's own clock. */
  covMinHold: number;
  /** Bot QB throws anyway after this many seconds from the snap. */
  covMaxHold: number;
  /** Throw Around: bots stay at least this far from whoever has the ball. */
  freeSpaceMin: number;
  /** Throw Around: bots stay inside this far from whoever has the ball. */
  freeSpaceMax: number;
  /** Throw Around: how often a bot picks a new spot, seconds. */
  freeRepick: number;
  /** 0 is wild, 1 is on the money. Scales throw scatter in Coverage. */
  covAccuracy: number;
  /** How hard the AI defender jams, closes, and goes for the ball. */
  covAiAgg: number;
  /** LB arm-check connects inside this range. */
  covArmRange: number;
  /** Arm-check deceleration on the receiver, yards per second squared. */
  covArmSlow: number;
  /** Continuous arm-check time that draws a holding flag. */
  covFlagTime: number;
  /** Multiplier on simulated time. 0.5 runs half as many 1/120 steps per real second. */
  timeScale: number;
  cameraMinExtent: number;
  cameraPadding: number;
  cameraFollow: number;
  /** 3D camera. The flat field stays top-down. */
  camStyle: 'all22' | 'topdown' | 'broadcast';
  /** Degrees down from the horizon. All-22 and the sideline view. */
  camPitch: number;
  /** Vertical field of view, degrees. */
  camFov: number;
  /** Pulls the angled camera back along its pitch. 1 is the fitted distance. */
  camHeightBias: number;
  /** Slides the look point toward the goal, in yards. */
  camUpfieldBias: number;
  playerScale: number;
  playerVisuals: 'model' | 'capsule';
  modelHeightYd: number;
  modelOutline: boolean;
  showReach: boolean;
  showArc: boolean;
  autoReset: boolean;
  renderer: 'three' | 'canvas2d';
  /** Optional TURN server for strict NATs. Empty until someone fills it in. */
  netTurnUrl: string;
  netTurnUser: string;
  netTurnCred: string;
}

export const DEFAULTS: Settings = {
  accel: 30,
  decel: 34,
  releaseDecel: 42,
  turnRate: 26,
  cutPenalty: 1.6,
  cutBleed: 0.6,
  reverseAngleDeg: 115,
  jogSpeed: 5,
  fullSpeed: 8,
  sprintAccelMult: 0.6,
  // 10 pumps of 0.4 cover the 4 yd/s gap from full speed (8) to max sprint (12).
  boostPerPump: 0.4,
  sprintMaxSpeed: 12,
  boostHoldDelay: 0.5,
  // Scaled from the old 1.2 so a full bar still fades in ~1.45s after the hold
  // (old pool was 1.75 yd/s at 1.2 yd/s²; new pool is 4.0). Cut/ease-off stays ×3.5.
  boostDecayRate: 2.75,
  cutDecayAngleDeg: 35,
  cutDecayMult: 3.5,
  easeOffStick: 0.85,
  ltSpeedCap: 4,
  deadzone: 0.15,
  rtEngage: 0.35,
  rtRelease: 0.12,
  rtMinHoldMs: 80,
  aimMode: 'directionCharge',
  aimDeadzone: 0.12,
  aimMinDist: 3,
  aimMaxDist: 50,
  aimDistExp: 1.6,
  aimEuroMin: 1,
  aimEuroBeta: 0.02,
  aimAngleDeadband: 0.6,
  aimGraceMs: 120,
  chargeMinDist: 5,
  chargeMaxDist: 60,
  chargeTime: 1.1,
  chargeExp: 1.4,
  chargePingPong: false,
  previewDefaultLoft: 0.5,
  facingTurnRate: 18,
  minThrowSpeed: 13,
  maxThrowSpeed: 29,
  minLoftDeg: 4,
  maxLoftDeg: 42,
  stepIntoBonus: 0.12,
  backFootPenalty: 0.2,
  baseInaccuracy: 0.5,
  unsquaredInaccuracy: 1.8,
  kbChargeTime: 0.8,
  catchWindowMs: 170,
  catchReach: 1.1,
  reachHeight: 2.6,
  oneHandReach: 1.8,
  oneHandWindowMs: 100,
  oneHandSuccess: 0.65,
  ltWindowBonusMs: 90,
  jumpHeight: 0.6,
  jumpDuration: 0.5,
  diveDistance: 3.0,
  diveDuration: 0.32,
  diveRecovery: 0.8,
  diveReachBonus: 0.7,
  plantLockout: 0.1,
  batReach: 1.4,
  aiTimingErrorMs: 45,
  autoThrowDelay: 2.0,
  sidestepNormal: 1.8,
  sidestepSprint: 0.6,
  sidestepAngleNormal: 40,
  sidestepAngleSprint: 12,
  sidestepTime: 0.14,
  flickThreshold: 0.7,
  flickRearm: 0.3,
  flickCooldown: 0.3,
  truckBurst: 1.5,
  truckDuration: 0.45,
  truckBonus: 0.4,
  truckContactSlow: 0.45,
  spinDuration: 0.36,
  spinMomentumAngle: 110,
  spinDrift: 2.0,
  spinSpeedKeep: 0.8,
  spinVulnerable: 0.2,
  spinCounter: 0.3,
  jukeBackstep: 0.9,
  jukeHopTime: 0.14,
  jukeReaccelWindow: 0.45,
  jukeReaccelMult: 1.9,
  hurdleHeight: 0.85,
  hurdleDuration: 0.5,
  hurdleClear: 0.35,
  runDiveDistance: 2.5,
  stiffArmStrength: 0.5,
  stiffArmReach: 1.8,
  stiffArmPush: 4,
  tapMaxTime: 0.18,
  handSwitchTime: 0.25,
  wrapReach: 1.3,
  wrapWindow: 0.2,
  wrapLunge: 2.0,
  wrapSuccess: 0.8,
  lungeDist: 1.75,
  lungeSpeed: 1,
  lungeAlign: 1,
  lungeSpeedScale: 1,
  lungeThreshold: 0.65,
  lungeCooldown: 0.55,
  lungeContact: 0.18,
  lungeMiss: 0.42,
  diveTackleDist: 3.0,
  diveTackleReach: 1.1,
  diveTackleSuccess: 0.55,
  diveTackleRecovery: 1.0,
  noLTTackleMult: 0.7,
  behindPenalty: 0.4,
  speedPenalty: 0.05,
  bigHitSpeed: 12,
  missStagger: 0.35,
  brokenStagger: 0.6,
  brokenSlow: 0.75,
  tackleCooldown: 0.5,
  fumbleBase: 0.03,
  ballSideFumbleMult: 2.5,
  bigHitFumbleMult: 2,
  hurdleWrapFumbleMult: 4,
  punchFumble: 0.15,
  punchReach: 1.5,
  punchCooldown: 0.8,
  aiAggression: 0.6,
  aiReaction: 0.15,
  aiLead: 0.8,
  aiMoveRate: 0.7,
  runStartDist: 25,
  runDefenderGap: 12,
  plantFallTime: 0.75,
  stretchMaxReach: 1.2,
  stretchRecoveryMult: 0.6,
  fallLeanTime: 0.3,
  fallExtraReach: 0.5,
  fallRecovery: 1.2,
  doubleTapWindow: 0.25,
  pitchFlickWindow: 0.15,
  pitchMinSpeed: 7,
  pitchMaxSpeed: 15,
  pitchDefaultSpeed: 10,
  pitchDefaultAngle: 120,
  pitchMinAngle: 70,
  pitchLoft: 1.5,
  pitchInherit: 0.5,
  pitchCatchReach: 1.3,
  pitchCatchReliability: 0.95,
  trailingBack: true,
  throwModeRB: true,
  trailDepth: 4,
  trailWidth: 4,
  requireSnap: true,
  callReactionDelay: 0.3,
  callCooldown: 1.5,
  catchShortMin: 10,
  catchShortMax: 15,
  catchMedMin: 15,
  catchMedMax: 30,
  catchDeepMin: 30,
  catchDeepMax: 60,
  catchThrowsPerBand: 3,
  catchCycleBands: false,
  catchInterval: 3,
  catchLobShare: 0.4,
  catchWindup: 0.6,
  catchSidelineShare: 0.2,
  catchPaused: false,
  catchAIReceiver: false,
  throwPursuer: true,
  catchPursuer: true,
  autoSwitchCarrier: true,
  catchTargetYds: 20,
  throwDefender: false,
  covAlign: 'off',
  covShade: 'inside',
  covSep: 2.5,
  covMinHold: 1,
  covMaxHold: 2.6,
  freeSpaceMin: 8,
  freeSpaceMax: 20,
  freeRepick: 3.5,
  covAccuracy: 0.72,
  covAiAgg: 0.65,
  covArmRange: 1.7,
  covArmSlow: 1.6,
  covFlagTime: 0.65,
  timeScale: 1,
  cameraMinExtent: 26,
  cameraPadding: 5,
  cameraFollow: 3.0,
  camStyle: 'all22',
  camPitch: 42,
  camFov: 36,
  camHeightBias: 1.12,
  camUpfieldBias: 8,
  playerScale: 1.25,
  playerVisuals: 'model',
  modelHeightYd: 2.0,
  modelOutline: true,
  showReach: true,
  showArc: true,
  autoReset: true,
  renderer: 'three',
  netTurnUrl: '',
  netTurnUser: '',
  netTurnCred: '',
};

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  playerVisuals: ['model', 'capsule'],
  renderer: ['three', 'canvas2d'],
  camStyle: ['all22', 'topdown', 'broadcast'],
  aimMode: ['absolutePlus', 'directionCharge'],
  covAlign: ['press', 'off'],
  covShade: ['inside', 'outside'],
};

export function catchBandRange(S: Settings, k: string): [number, number] {
  if (k === 'short') return [S.catchShortMin, S.catchShortMax];
  if (k === 'medium') return [S.catchMedMin, S.catchMedMax];
  return [S.catchDeepMin, S.catchDeepMax];
}

/** Max speed added on top of fullSpeed by sprint pumps. */
export function maxSprintBoost(S: Settings): number {
  return Math.max(0, S.sprintMaxSpeed - S.fullSpeed);
}

export function isSettingsKey(key: string): key is keyof Settings {
  return Object.prototype.hasOwnProperty.call(DEFAULTS, key);
}

export function settingAccepts(key: keyof Settings, value: unknown): boolean {
  const sample = DEFAULTS[key];
  if (typeof value !== typeof sample) return false;
  if (typeof sample === 'number') return typeof value === 'number' && Number.isFinite(value);
  const allowed = ENUMS[key];
  if (allowed) return typeof value === 'string' && allowed.includes(value);
  return true;
}
