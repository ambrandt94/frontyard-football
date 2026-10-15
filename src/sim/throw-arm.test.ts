import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { CATCH_H, FIELD_W, LOS_Y, STEP } from '../config/constants';
import { createAimState, rightStickAims, stepAim } from '../input/aim';
import { freshTrigger, stepTrigger } from '../input/trigger';
import { createSim } from './sim';
import { mulberry32 } from './rng';
import { blankInput, type SimInput, type Vec2 } from './types';

function boot(extra: Partial<typeof DEFAULTS> = {}) {
  const s = createSim({
    ...DEFAULTS,
    requireSnap: false,
    autoReset: false,
    baseInaccuracy: 0,
    unsquaredInaccuracy: 1,
    throwVarianceDeg: 0,
    ...extra,
  }, { rng: mulberry32(4) });
  s.state.play.phase = 'live';
  s.state.play.snapT = s.state.t;
  return s;
}

function press(partial: Partial<SimInput>): SimInput {
  return { ...blankInput(), ...partial };
}

function frames(s: ReturnType<typeof boot>, seconds: number, partial: Partial<SimInput>) {
  const n = Math.max(1, Math.round(seconds / STEP));
  const inp = press(partial);
  for (let i = 0; i < n; i++) s.step(STEP, inp);
}

function aimOf(s: ReturnType<typeof boot>, yards: number): Vec2 {
  const qb = s.state.players.qb;
  return { x: qb.x, y: qb.y + yards };
}

function loft(s: ReturnType<typeof boot>) {
  const b = s.state.ball;
  return Math.atan2(b.vz, Math.hypot(b.vx, b.vy)) * 180 / Math.PI;
}

/** Where the pass arrives at chest height. The ground landing is past that. */
function catchSpot(s: ReturnType<typeof boot>) {
  const arc = s.state.ball.arc;
  for (let i = 1; i < arc.length; i++) {
    if (arc[i].z <= CATCH_H && arc[i - 1].z > CATCH_H) return arc[i];
  }
  return s.state.ball.landing;
}

describe('throw arm', () => {
  it('a light release is a touch and a full squeeze is an immediate bullet', () => {
    const light = boot();
    const spot = aimOf(light, 22);
    frames(light, 0.2, { trigger: 0.5, aim: spot, stickHeld: true });
    expect(light.state.throwArm.phase).toBe('charge');
    expect(light.state.ball.state).toBe('held');
    light.step(STEP, press({ trigger: 0, aim: spot, stickHeld: true }));
    expect(light.state.throwArm.last).toBe('throw');
    expect(light.state.ball.state).toBe('air');
    expect(light.state.ball.power).toBeLessThan(0.33);
    const lightLoft = loft(light);
    expect(lightLoft).toBeGreaterThan(15);

    const hard = boot();
    const far = aimOf(hard, 22);
    frames(hard, 0.2, { trigger: 0.55, aim: far, stickHeld: true });
    expect(hard.state.ball.state).toBe('held');
    hard.step(STEP, press({ trigger: 0.98, aim: far, stickHeld: true }));
    expect(hard.state.throwArm.last).toBe('throw');
    expect(hard.state.ball.state).toBe('air');
    expect(hard.state.ball.power).toBeGreaterThan(0.9);
    expect(loft(hard)).toBeLessThan(lightLoft - 6);
    expect(Math.hypot(hard.state.ball.aimed!.x - far.x, hard.state.ball.aimed!.y - far.y)).toBeLessThan(0.2);
  });

  it('a short brush and a resting trigger throw nothing', () => {
    const s = boot();
    const spot = aimOf(s, 16);
    frames(s, 0.5, { trigger: 0.2, aim: spot, stickHeld: true });
    expect(s.state.throwArm.phase).toBe('idle');
    expect(s.state.ball.state).toBe('held');
    frames(s, 0.04, { trigger: 0.7, aim: spot, stickHeld: true });
    s.step(STEP, press({ trigger: 0, aim: spot, stickHeld: true }));
    expect(s.state.throwArm.last).toBe('brush');
    expect(s.state.ball.state).toBe('held');
  });

  it('letting the right stick go cancels the wind-up', () => {
    const s = boot();
    const spot = aimOf(s, 20);
    frames(s, 0.2, { trigger: 0.8, aim: spot, stickHeld: true });
    expect(s.state.throwArm.phase).toBe('charge');
    s.step(STEP, press({ trigger: 0.8, aim: spot, stickHeld: false }));
    expect(s.state.throwArm.last).toBe('cancel');
    expect(s.state.ball.state).toBe('held');
    s.step(STEP, press({ trigger: 0, aim: spot, stickHeld: false }));
    expect(s.state.ball.state).toBe('held');
  });

  it('centering the stick on the release frame still throws the charged spot', () => {
    const s = boot();
    const spot = aimOf(s, 24);
    const near = aimOf(s, 2);
    frames(s, 0.25, { trigger: 1, aim: spot, stickHeld: true });
    s.step(STEP, press({ trigger: 0, aim: near, stickHeld: false }));
    expect(s.state.throwArm.last).toBe('throw');
    expect(s.state.ball.state).toBe('air');
    expect(s.state.ball.power).toBeGreaterThan(0.9);
    const aimed = s.state.ball.aimed!;
    expect(Math.hypot(aimed.x - spot.x, aimed.y - spot.y)).toBeLessThan(0.2);
    const arrive = catchSpot(s)!;
    expect(Math.hypot(arrive.x - spot.x, arrive.y - spot.y)).toBeLessThan(1.5);
  });
});

/**
 * A finger leaving RT and the right stick does not snap to zero in one poll.
 * Both analog values fall across several frames, and the stick often reaches
 * neutral while the trigger is still on its way down.
 */
describe('gamepad release trace', () => {
  const FRAME = 1 / 60;

  function fall(from: number, to: number, n: number): number[] {
    const out: number[] = [];
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const k = 1 - (1 - u) ** 2;
      out.push(from + (to - from) * k);
    }
    return out;
  }

  function trace(rtHold: number) {
    const s = boot();
    const aimState = createAimState();
    let triggerLatch = freshTrigger();
    let prevRt = 0;
    let now = 0;
    const tune = { engage: DEFAULTS.rtEngage, release: DEFAULTS.rtRelease, minHoldMs: DEFAULTS.rtMinHoldMs };
    const holdN = Math.round(0.45 / FRAME);
    const releaseN = 8;
    const stickFall = fall(0.94, 0, releaseN);
    const rtFall = fall(rtHold, 0, releaseN);
    const samples: { x: number; y: number; rt: number; release: boolean }[] = [];
    for (let i = 0; i < holdN; i++) samples.push({ x: 0.02, y: 0.94, rt: rtHold, release: false });
    for (let i = 0; i < releaseN; i++) {
      samples.push({ x: 0.02 * (1 - (i + 1) / releaseN), y: stickFall[i], rt: rtFall[i], release: true });
    }

    let charged: { x: number; y: number; dist: number } | null = null;
    let releaseAim: { x: number; y: number; dist: number } | null = null;
    let heldThrough = true;
    for (const frame of samples) {
      now += FRAME;
      const pulled = stepTrigger(triggerLatch, frame.rt, now * 1000, prevRt, tune);
      triggerLatch = pulled.latch;
      prevRt = frame.rt;
      const mag = Math.hypot(frame.x, frame.y);
      const stickHeld = rightStickAims(mag);
      const qb = s.state.players.qb;
      const aimed = stepAim(aimState, {
        stick: { x: frame.x, y: frame.y },
        mouse: null,
        qb: { x: qb.x, y: qb.y },
        charging: pulled.latch.charging && stickHeld,
        pressure: pulled.charge,
        cancel: false,
      }, FRAME, DEFAULTS, now);
      if (!frame.release && pulled.latch.charging) charged = { x: aimed.x, y: aimed.y, dist: aimed.dist };
      if (frame.release && !releaseAim && (!pulled.latch.charging || !stickHeld)) {
        releaseAim = { x: aimed.x, y: aimed.y, dist: aimed.dist };
      }
      const steps = Math.round(FRAME / STEP);
      for (let i = 0; i < steps; i++) {
        s.step(STEP, press({
          trigger: frame.rt,
          aim: { x: aimed.x, y: aimed.y },
          stickHeld,
          charge: pulled.charge,
        }));
      }
      if (!frame.release && s.state.ball.state !== 'held') heldThrough = false;
    }
    return { s, charged, releaseAim, heldThrough };
  }

  it('a partial squeeze throws a touch on release, at the charged spot', () => {
    const touch = trace(0.5);
    expect(touch.charged).toBeTruthy();
    expect(touch.releaseAim).toBeTruthy();
    expect(touch.heldThrough).toBe(true);
    expect(touch.s.state.ball.state).toBe('air');
    expect(touch.s.state.throwArm.last).toBe('throw');
    expect(touch.s.state.ball.power).toBeLessThan(0.33);
    expect(touch.charged!.dist).toBeGreaterThan(DEFAULTS.chargeMinDist + 8);
    const touchAim = touch.s.state.ball.aimed!;
    expect(Math.hypot(touchAim.x - touch.releaseAim!.x, touchAim.y - touch.releaseAim!.y)).toBeLessThan(2);
    expect(Math.hypot(touchAim.x - touch.charged!.x, touchAim.y - touch.charged!.y)).toBeLessThan(8);
    const arrive = catchSpot(touch.s)!;
    const qb = touch.s.state.players.qb;
    expect(Math.hypot(arrive.x - touchAim.x, arrive.y - touchAim.y)).toBeLessThan(1.5);
    expect(Math.hypot(arrive.x - qb.x, arrive.y - qb.y)).toBeGreaterThan(touch.charged!.dist - 2);
  });

  it('a full squeeze tops out under 1 and throws a bullet before any release', () => {
    const s = boot();
    const aimState = createAimState();
    let triggerLatch = freshTrigger();
    let prevRt = 0;
    let now = 0;
    const tune = { engage: DEFAULTS.rtEngage, release: DEFAULTS.rtRelease, minHoldMs: DEFAULTS.rtMinHoldMs };
    const rampN = 10;
    let threwAt: { x: number; y: number; dist: number } | null = null;
    const push = (rt: number) => {
      now += FRAME;
      const pulled = stepTrigger(triggerLatch, rt, now * 1000, prevRt, tune);
      triggerLatch = pulled.latch;
      prevRt = rt;
      const qb = s.state.players.qb;
      const aimed = stepAim(aimState, {
        stick: { x: 0.02, y: 0.94 },
        mouse: null,
        qb: { x: qb.x, y: qb.y },
        charging: pulled.latch.charging,
        pressure: pulled.charge,
        cancel: false,
      }, FRAME, DEFAULTS, now);
      const steps = Math.round(FRAME / STEP);
      for (let k = 0; k < steps; k++) {
        s.step(STEP, press({
          trigger: rt,
          aim: { x: aimed.x, y: aimed.y },
          stickHeld: true,
          charge: pulled.charge,
        }));
      }
      if (!threwAt && s.state.ball.state === 'air') {
        threwAt = { x: aimed.x, y: aimed.y, dist: aimed.dist };
        expect(rt).toBeGreaterThanOrEqual(0.92);
        expect(rt).toBeLessThan(1);
      }
      return aimed;
    };
    for (let i = 0; i < 28; i++) {
      push(0.55);
      expect(s.state.ball.state).toBe('held');
    }
    for (let i = 1; i <= rampN; i++) push(0.55 + (0.98 - 0.55) * (i / rampN));
    expect(threwAt).toBeTruthy();
    expect(threwAt!.dist).toBeGreaterThan(DEFAULTS.chargeMinDist + 8);
    expect(s.state.throwArm.last).toBe('throw');
    expect(s.state.ball.power).toBeGreaterThan(0.9);
    const aimed = s.state.ball.aimed!;
    expect(Math.hypot(aimed.x - threwAt!.x, aimed.y - threwAt!.y)).toBeLessThan(1);
    const arrive = catchSpot(s)!;
    const qb = s.state.players.qb;
    expect(Math.hypot(arrive.x - aimed.x, arrive.y - aimed.y)).toBeLessThan(1.5);
    expect(Math.hypot(arrive.x - qb.x, arrive.y - qb.y)).toBeGreaterThan(threwAt!.dist - 2);
    expect(Math.hypot(arrive.x - qb.x, arrive.y - qb.y)).toBeGreaterThan(12);
  });
});

describe('pitch window', () => {
  it('RT with the stick centered opens a window, and a flick pitches', () => {
    const s = boot();
    const qb = s.state.players.qb;
    frames(s, 0.05, { trigger: 0, stickHeld: false });
    s.step(STEP, press({ trigger: 0.8, stickHeld: false }));
    expect(s.state.ball.state).toBe('held');
    expect(qb.pitchUntil).toBeGreaterThan(s.state.t);
    expect(s.state.floaters.some((f) => f.text === 'PITCH')).toBe(true);
    const from = { x: s.state.ball.x, y: s.state.ball.y };
    s.step(STEP, press({ trigger: 0.8, stickHeld: true, rs: { x: 1, y: 0 } }));
    expect(s.state.ball.state).toBe('air');
    expect(s.state.ball.pitch).toBeTruthy();
    const land = s.state.ball.landing!;
    const dist = Math.hypot(land.x - from.x, land.y - from.y);
    expect(dist).toBeGreaterThan(DEFAULTS.pitchDistance * 1.05);
    expect(dist).toBeLessThan(DEFAULTS.pitchDistance * 1.25);
    expect(land.x).toBeGreaterThan(from.x);
  });

  it('a gentle flick travels a little less than a fast one', () => {
    function pitched(peak: number) {
      const s = boot();
      frames(s, 0.05, { trigger: 0, stickHeld: false });
      s.step(STEP, press({ trigger: 0.9, stickHeld: false }));
      const from = { x: s.state.ball.x, y: s.state.ball.y };
      s.step(STEP, press({ trigger: 0.9, stickHeld: true, rs: { x: 0, y: peak } }));
      const land = s.state.ball.landing!;
      return Math.hypot(land.x - from.x, land.y - from.y);
    }
    const soft = pitched(0.72);
    const hard = pitched(1);
    expect(soft).toBeGreaterThan(DEFAULTS.pitchDistance * 0.75);
    expect(soft).toBeLessThan(DEFAULTS.pitchDistance);
    expect(hard).toBeGreaterThan(soft + 0.8);
  });

  it('an expired window pitches nothing, and a double-tap no longer pitches the QB', () => {
    const s = boot({ pitchWindow: 0.4 });
    frames(s, 0.05, { trigger: 0, stickHeld: false });
    s.step(STEP, press({ trigger: 0.85, stickHeld: false }));
    const until = s.state.players.qb.pitchUntil;
    frames(s, 0.5, { trigger: 0.85, stickHeld: false });
    expect(s.state.t).toBeGreaterThan(until);
    expect(s.state.players.qb.pitchUntil).toBe(0);
    expect(s.state.ball.state).toBe('held');

    const tap = boot();
    tap.step(STEP, press({ lbHeld: true }));
    tap.step(STEP, press({ lbHeld: false }));
    tap.step(STEP, press({ lbHeld: true }));
    frames(tap, 0.3, { lbHeld: false });
    expect(tap.state.ball.state).toBe('held');
    expect(tap.state.players.qb.pitchPending).toBeNull();
  });
});

describe('stick mode', () => {
  it('starts in throw at the snap and L flips the right stick', () => {
    const s = createSim({ ...DEFAULTS, requireSnap: true, autoReset: false }, { rng: mulberry32(3) });
    s.state.players.qb.stickMode = 'carry';
    s.step(STEP, press({ a: true }));
    expect(s.state.play.phase).toBe('live');
    expect(s.state.players.qb.stickMode).toBe('throw');

    const live = boot();
    const qb = live.state.players.qb;
    qb.vy = 6;
    live.step(STEP, press({ modeToggle: true }));
    expect(qb.stickMode).toBe('carry');
    live.step(STEP, press({ rs: { x: 1, y: 0 }, stickHeld: true, lt: true }));
    expect(qb.move).toBeNull();
    expect(Math.atan2(qb.vy, qb.vx)).toBeCloseTo(0, 1);

    const aiming = boot();
    aiming.state.players.qb.vy = 6;
    aiming.step(STEP, press({ rs: { x: 1, y: 0 }, stickHeld: true }));
    expect(aiming.state.players.qb.move).toBeNull();
    expect(aiming.state.players.qb.stickMode).toBe('throw');
  });
});

describe('line of scrimmage', () => {
  it('puts the QB in CARRY when he crosses, cancels the charge, and stays there behind the line', () => {
    const s = boot();
    const qb = s.state.players.qb;
    qb.y = LOS_Y - 1;
    qb.vy = 0;
    const spot = aimOf(s, 18);
    frames(s, 0.2, { trigger: 0.6, aim: spot, stickHeld: true });
    expect(qb.stickMode).toBe('throw');
    expect(s.state.throwArm.phase).toBe('charge');
    expect(s.state.ball.state).toBe('held');
    qb.y = LOS_Y + 0.4;
    qb.vy = 0;
    s.step(STEP, press({ trigger: 0.6, aim: spot, stickHeld: true }));
    expect(qb.stickMode).toBe('carry');
    expect(s.state.ball.state).toBe('held');
    expect(s.state.throwArm.phase).toBe('idle');
    expect(s.state.throwArm.last).toBe('cancel');
    expect(s.state.floaters.some((f) => f.text === 'CARRY')).toBe(true);
    qb.y = LOS_Y - 2;
    qb.vy = 0;
    s.step(STEP, press({ trigger: 0, stickHeld: false }));
    expect(qb.stickMode).toBe('carry');
    expect(s.state.ball.holder).toBe('qb');
  });

  it('does the same in coverage, catch, and a slotted online QB', () => {
    for (const mode of ['coverage', 'catch'] as const) {
      const s = boot();
      s.setMode(mode);
      const qb = s.state.players.qb;
      qb.y = LOS_Y + 1;
      qb.vy = 0;
      s.step(STEP, press({}));
      expect(qb.stickMode).toBe('carry');
      expect(s.state.ball.state).toBe('held');
      expect(s.state.ball.holder).toBe('qb');
    }
    const slotted = boot();
    slotted.state.play.phase = 'live';
    slotted.state.play.snapT = slotted.state.t;
    slotted.setSlotInputs({ qb: press({}) }, 'qb');
    const qb = slotted.state.players.qb;
    qb.y = LOS_Y + 1;
    qb.vy = 0;
    slotted.step(STEP, press({ trigger: 0.98, stickHeld: true, aim: { x: qb.x, y: qb.y + 24 } }));
    expect(qb.stickMode).toBe('carry');
    expect(slotted.state.ball.state).toBe('held');
    expect(slotted.state.ball.holder).toBe('qb');
  });
});

describe('carry pitch', () => {
  function pitchAndCatch(s: ReturnType<typeof boot>, fromId: string, catchId: string) {
    const from = s.state.players[fromId];
    const mate = s.state.players[catchId];
    from.vx = 0;
    from.vy = 0;
    s.step(STEP, press({ trigger: 0, stickHeld: false }));
    frames(s, 0.12, { trigger: 0.98, stickHeld: true });
    expect(s.state.ball.state).toBe('held');
    expect(s.state.throwArm.last).not.toBe('throw');
    s.step(STEP, press({ trigger: 0, stickHeld: false }));
    s.step(STEP, press({ trigger: 0.98, stickHeld: false }));
    expect(from.pitchUntil).toBeGreaterThan(s.state.t);
    expect(s.state.ball.state).toBe('held');
    const origin = { x: s.state.ball.x, y: s.state.ball.y };
    s.step(STEP, press({ trigger: 0.98, stickHeld: true, rs: { x: 1, y: 0 } }));
    expect(s.state.ball.state).toBe('air');
    expect(s.state.ball.pitch?.from).toBe(fromId);
    const land = s.state.ball.landing!;
    const dist = Math.hypot(land.x - origin.x, land.y - origin.y);
    expect(dist).toBeGreaterThan(DEFAULTS.pitchDistance * 0.85);
    expect(dist).toBeLessThan(DEFAULTS.pitchDistance * 1.15 + 0.5);
    for (let i = 0; i < 100; i++) {
      if (s.state.ball.state === 'held' && s.state.lastPitch?.caughtBy === catchId) break;
      mate.x = s.state.ball.x;
      mate.y = s.state.ball.y;
      mate.vx = 0;
      mate.vy = 0;
      s.step(STEP, press({}));
    }
    expect(s.state.ball.state).toBe('held');
    expect(s.state.lastPitch?.caughtBy).toBe(catchId);
    return dist;
  }

  it('lets the QB pitch after the line switches him, and a teammate catch it', () => {
    const s = boot({ pitchCatchReliability: 1 });
    const qb = s.state.players.qb;
    qb.y = LOS_Y + 1;
    qb.vy = 0;
    s.step(STEP, press({}));
    expect(qb.stickMode).toBe('carry');
    pitchAndCatch(s, 'qb', 'hb');
    expect(s.state.play.result).toBe('PITCH CAUGHT');
  });

  it('lets a receiver after the catch pitch to the back and keep the play live', () => {
    const s = boot({ pitchCatchReliability: 1, throwPursuer: false });
    s.state.controlled = 'wr';
    const wr = s.state.players.wr;
    wr.x = 26;
    wr.y = 50;
    wr.stickMode = 'carry';
    s.state.ball.holder = 'wr';
    s.state.ball.state = 'held';
    s.state.carry = { catchY: wr.y, yac: 0, goalY: 110, goalLabel: 'TOUCHDOWN', goalSign: 1 };
    const dist = pitchAndCatch(s, 'wr', 'hb');
    expect(dist).toBeGreaterThan(DEFAULTS.pitchDistance * 0.85);
    expect(s.state.play.phase).toBe('live');
  });

  it('lets the running back pitch to the trailing back', () => {
    const s = boot({ pitchCatchReliability: 1, trailingBack: true });
    s.setMode('run');
    s.state.play.phase = 'live';
    s.state.play.snapT = s.state.t;
    expect(s.state.players.rb.stickMode).toBe('carry');
    const rb = s.state.players.rb;
    rb.x = FIELD_W / 2;
    rb.y = 60;
    rb.vx = 0;
    rb.vy = 0;
    const tb = s.state.players.tb;
    expect(tb).toBeTruthy();
    const df = s.state.players.df;
    if (df) { df.x = 2; df.y = 2; df.vx = 0; df.vy = 0; }
    pitchAndCatch(s, 'rb', 'tb');
    expect(s.state.ball.state).toBe('held');
    expect(s.state.play.phase).toBe('live');
  });
});

describe('receiver dive', () => {
  function hang(s: ReturnType<typeof boot>, x: number, y: number) {
    const wr = s.state.players.wr;
    wr.x = 20;
    wr.y = 40;
    wr.vx = 0;
    wr.vy = 8;
    const b = s.state.ball;
    b.state = 'air';
    b.holder = null;
    b.resolved = false;
    b.x = 20;
    b.y = y;
    b.z = 1.6;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    b.arc = [{ x, y, z: 1.5, t: s.state.t + 0.2 }];
    b.landing = { x, y, z: 0, t: s.state.t + 0.4 };
    s.state.ai.wr.dove = false;
  }

  it('stays on its feet when the ball is inside the running reach', () => {
    const s = boot();
    hang(s, 20, 42);
    s.step(STEP, blankInput());
    expect(s.state.players.wr.diveT).toBeLessThan(0);
  });

  it('dives only when the landing is past the stride', () => {
    const s = boot();
    hang(s, 20, 45.2);
    s.step(STEP, blankInput());
    expect(s.state.players.wr.diveT).toBeGreaterThanOrEqual(0);
  });
});
