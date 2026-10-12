import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
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

  it('releasing the stick and the trigger on the same frame does not throw', () => {
    const s = boot();
    const spot = aimOf(s, 18);
    frames(s, 0.2, { trigger: 1, aim: spot, stickHeld: true });
    s.step(STEP, press({ trigger: 0, aim: spot, stickHeld: false }));
    expect(s.state.throwArm.last).toBe('cancel');
    expect(s.state.ball.state).toBe('held');
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
