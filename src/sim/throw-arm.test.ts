import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { CATCH_H, STEP } from '../config/constants';
import { createAimState, stepAim } from '../input/aim';
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
  it('a light release is a touch and a full release is a bullet', () => {
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
    frames(hard, 0.2, { trigger: 1, aim: far, stickHeld: true });
    hard.step(STEP, press({ trigger: 0, aim: far, stickHeld: true }));
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
    for (const frame of samples) {
      now += FRAME;
      const pulled = stepTrigger(triggerLatch, frame.rt, now * 1000, prevRt, tune);
      triggerLatch = pulled.latch;
      prevRt = frame.rt;
      const mag = Math.hypot(frame.x, frame.y);
      const stickHeld = mag >= 0.15;
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
      const steps = Math.round(FRAME / STEP);
      for (let i = 0; i < steps; i++) {
        s.step(STEP, press({
          trigger: frame.rt,
          aim: { x: aimed.x, y: aimed.y },
          stickHeld,
          charge: pulled.charge,
        }));
      }
    }
    return { s, charged };
  }

  it('lands on the charged spot after a multi-frame stick and RT release', () => {
    const bullet = trace(1);
    expect(bullet.charged).toBeTruthy();
    expect(bullet.charged!.dist).toBeGreaterThan(DEFAULTS.chargeMinDist + 8);
    expect(bullet.s.state.ball.state).toBe('air');
    expect(bullet.s.state.throwArm.last).toBe('throw');
    expect(bullet.s.state.ball.power).toBeGreaterThan(0.9);
    const aimed = bullet.s.state.ball.aimed!;
    const miss = Math.hypot(aimed.x - bullet.charged!.x, aimed.y - bullet.charged!.y);
    const arrive = catchSpot(bullet.s)!;
    const qb = bullet.s.state.players.qb;
    const landDist = Math.hypot(arrive.x - qb.x, arrive.y - qb.y);
    expect(miss).toBeLessThan(1);
    expect(Math.hypot(arrive.x - bullet.charged!.x, arrive.y - bullet.charged!.y)).toBeLessThan(1.5);
    expect(Math.abs(landDist - bullet.charged!.dist)).toBeLessThan(2);
    expect(landDist).toBeGreaterThan(12);

    const touch = trace(0.5);
    expect(touch.s.state.ball.state).toBe('air');
    expect(touch.s.state.ball.power).toBeLessThan(0.33);
    expect(touch.charged!.dist).toBeGreaterThan(DEFAULTS.chargeMinDist + 8);
    const touchAim = touch.s.state.ball.aimed!;
    expect(Math.hypot(touchAim.x - touch.charged!.x, touchAim.y - touch.charged!.y)).toBeLessThan(1);
    expect(Math.abs(touch.charged!.dist - bullet.charged!.dist)).toBeLessThan(1.5);
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
    live.step(STEP, press({ rs: { x: 1, y: 0 }, stickHeld: true }));
    expect(qb.move?.type).toBe('sidestep');

    const aiming = boot();
    aiming.state.players.qb.vy = 6;
    aiming.step(STEP, press({ rs: { x: 1, y: 0 }, stickHeld: true }));
    expect(aiming.state.players.qb.move).toBeNull();
    expect(aiming.state.players.qb.stickMode).toBe('throw');
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
