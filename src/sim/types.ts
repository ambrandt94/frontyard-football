import type { ModeId } from '../modes';

export interface Vec2 {
  x: number;
  y: number;
}

export interface SimInput {
  mx: number;
  my: number;
  lt: boolean;
  sprint: boolean;
  aim: Vec2 | null;
  charge: number | null;
  throwPower: number | null;
  y: boolean;
  rt: boolean;
  rb: boolean;
  a: boolean;
  x: boolean;
  b: boolean;
  start: boolean;
  rs: Vec2 | null;
  lbHeld: boolean;
  rbHeld: boolean;
}

export function blankInput(): SimInput {
  return {
    mx: 0, my: 0, lt: false, sprint: false, aim: null, charge: null, throwPower: null,
    y: false, rt: false, rb: false, a: false, x: false, b: false, start: false, rs: null,
    lbHeld: false, rbHeld: false,
  };
}

export interface Attempt {
  type: 'two' | 'one' | 'bat';
  t0: number;
  win: number;
  radius: number;
}

export interface Flick {
  x: number;
  y: number;
  peak: number;
  t: number;
}

export interface Planted {
  t0: number;
  x: number;
  y: number;
  said: boolean;
  falling: boolean;
  dir: number;
  fallT0?: number;
}

export interface Move {
  type: 'sidestep' | 'truck' | 'spin' | 'juke';
  t0: number;
  side: number;
  dir: number;
  lat: Vec2;
  dur: number;
  dist: number;
  sf: number;
  sp0?: number;
  v0?: Vec2;
}

export interface Tackle {
  kind: 'wrap' | 'dive' | 'lunge';
  t0: number;
  done: boolean;
  hurdled?: boolean;
  /** World direction of a lunge, radians. */
  dir?: number;
  /** Yards the burst is meant to cover, including speed already carried into it. */
  dist?: number;
  /** Burst speed, yards per second. */
  speed?: number;
  /** Sim time when the 0.25s burst ends. A touch can still wrap until this plus the contact window. */
  burstEnd?: number;
}

export interface Player {
  id: string;
  role: string;
  /** Set while a net slot is occupied. Drawn above the player. */
  name?: string;
  /** Ring color for that net player. Role color is used when this is absent. */
  tint?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  facing: number;
  sprint: boolean;
  boost: number;
  boostHold: number;
  boostFast: boolean;
  squared: boolean;
  squareDir: number;
  plantT: number;
  jumpT: number;
  jumpH?: number;
  jumpDur?: number;
  diveT: number;
  diveDir: number;
  diveSpeed: number;
  diveRec?: number;
  groundT: number;
  stick: number;
  attempt: Attempt | null;
  lastAttempt: Attempt | null;
  cooldownUntil: number;
  wasIn: boolean;
  lateUntil: number;
  dropPending: boolean;
  blockedPass: boolean;
  lbT: number;
  rbT: number;
  lbTTap: number;
  rbTTap: number;
  lbTDbl: boolean;
  rbTDbl: boolean;
  flickArmed: boolean;
  curFlick: Flick | null;
  pitchPending: { side: 'L' | 'R'; t: number; flick: Flick | null } | null;
  bufferedFlick: Flick | null;
  handTapUndo: 'L' | 'R' | null;
  planted: Planted | null;
  stretch: number;
  stretchReach: number;
  leanDir: number;
  hand: 'L' | 'R';
  handSwitchT: number;
  move: Move | null;
  moveCD: number;
  vulnT: number;
  reaccelT: number;
  spinVis: number;
  stiffArm: 'L' | 'R' | null;
  stiffHit: boolean;
  stunT: number;
  tackle: Tackle | null;
  tackleCD: number;
  /** Right-stick lunge rearms once the stick drops. Absent means ready. */
  lungeReady?: boolean;
  punchCD: number;
  dove: boolean;
  callCD?: number;
  callT?: number;
  rbWasHeld?: boolean;
  handX?: number;
  handY?: number;
  forcePose?: string;
  forceSpeed?: number;
  forcePhase?: number;
}

export interface ArcPoint {
  x: number;
  y: number;
  z: number;
  t: number;
}

export interface PitchState {
  from: string;
  t: number;
  x0: number;
  y0: number;
  rolled: Record<string, boolean>;
  looseT: number;
}

export interface Ball {
  state: 'held' | 'air' | 'dead' | 'rest';
  holder: string | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  arc: ArcPoint[];
  landing: ArcPoint | null;
  aimed: Vec2 | null;
  throwT: number;
  resolved: boolean;
  gave: boolean;
  power: number;
  pitch?: PitchState | null;
}

export interface Floater {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

export interface CatchRep {
  band: string;
  n: number;
  d: number;
  lob: boolean;
  speed: number;
  loftDeg: number;
  tgt: Vec2;
  landErr: number;
  called: boolean;
  sideline: boolean;
  t: number;
  result?: string;
  yac?: number;
}

export interface CatchModeState {
  band: string;
  count: number;
  log: CatchRep[];
  stats: {
    att: number;
    comp: number;
    streak: number;
    best: number;
    last: string;
    yacTotal: number;
    bands: Record<string, { a: number; c: number }>;
  };
  phase: 'wait' | 'windup' | 'air' | 'carry';
  nextT: number;
  readyT: number;
  windupStart: number;
  windupEnd: number;
  plan: { d: number; lob: boolean; power: number; sideline: boolean; called: boolean } | null;
  cur: CatchRep | null;
}

/** Live ball-carrier spell after a completion, or after an interception return. */
export interface CarryState {
  catchY: number;
  yac: number;
  goalY: number;
  goalLabel: 'TOUCHDOWN' | 'TARGET';
  /** +1 runs toward the far end zone. -1 is an interception return toward home. */
  goalSign: 1 | -1;
}

/** Coverage drill totals. They persist across resets, like throw stats. */
export interface CoverageStats {
  targets: number;
  catches: number;
  pbus: number;
  ints: number;
  sepSum: number;
  throws: number;
  lastSep: number;
  last: string;
  flags: number;
}

export interface SimState {
  t: number;
  mode: ModeId;
  players: Record<string, Player>;
  ball: Ball;
  play: { phase: string; t0: number; snapT: number | null; endT: number | null; autoDelay?: number; result?: string };
  stats: { att: number; comp: number; last: string; yacTotal: number; lastYac: number };
  cov: CoverageStats;
  /** Seconds of connected arm-check this play. */
  armT: number;
  flagged: boolean;
  carry: CarryState | null;
  runScore: { td: number; stops: number; last: string };
  feedback: { text: string; color: string; t: number } | null;
  floaters: Floater[];
  route: string;
  controlled: string;
  ctl: Record<ModeId, string>;
  ai: Record<string, AiBag>;
  callAt?: number | null;
  aimQB?: Vec2;
  cm?: CatchModeState;
  trailSide?: number;
  pendingSwap?: string | null;
  lastCall?: number;
  lastMove?: Record<string, unknown>;
  lastSpin?: Record<string, unknown>;
  lastPitch?: {
    from: string;
    side: string;
    flicked: boolean;
    flickPeak: number | null;
    relAngleDeg: number;
    pitchSpeed: number;
    groundDirDeg: number;
    refDeg: number;
    t: number;
    caughtBy?: string;
    catchX?: number;
    catchY?: number;
    illegal?: boolean;
    recoveredBy?: string;
  } | null;
  lastHandSwitch?: number;
  lastFall?: { t: number; recovery: number };
  lastPlantRelease?: { held: number; recovery: number };
  lastStiffArm?: { t: number; eff: number };
  lastTackle?: Record<string, unknown>;
  lastPunch?: { t: number; f: number };
  lastHurdle?: number;
  lastHurdleBeat?: number;
  swapCount?: number;
}

export interface AiBag {
  wp?: Vec2[];
  wpi?: number;
  pressed?: boolean;
  noise?: number;
  dove?: boolean;
  done?: boolean;
  cp?: ArcPoint | null;
  cpT?: number;
  pressAt?: number | null;
  aim?: Vec2 | null;
  pumpT?: number;
  moveDone?: boolean;
  hurdled?: boolean;
  switchT?: number;
  tap?: string | null;
  holdArm?: string | null;
  holdUntil?: number;
  seen?: { x: number; y: number; vx: number; vy: number } | null;
  seenT?: number;
  /** Next time the defender AI may flick the right stick into a lunge. */
  lungeAt?: number;
  /** Throw Around spot this bot is drifting toward. */
  spot?: { x: number; y: number };
  spotT?: number;
  /** Next time this bot calls for the ball. */
  heyAt?: number;
  /** Who they are looking at. */
  look?: { x: number; y: number };
  /** Coverage clock, rolled once per snap. */
  holdMin?: number;
  holdMax?: number;
  releaseLag?: number;
  readyAt?: number;
  clockRoute?: string;
}

export interface ThrowSolution {
  vx: number;
  vy: number;
  vz: number;
  v: number;
  th: number;
}

export interface StepFactor {
  f: number;
  mult: number;
  err: number;
}
