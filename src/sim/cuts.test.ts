import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { createSim } from './sim';
import { lerp, wrapAngle } from './math';
import { blankInput, type SimInput } from './types';

function sim(extra: Partial<typeof DEFAULTS> = {}) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, aiMoveRate: 0, trailingBack: false, ...extra });
}

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

function liveRun() {
  const s = sim();
  s.setMode('run');
  s.state.play.phase = 'live';
  s.state.play.snapT = s.state.t;
  const c = s.state.players.rb;
  c.vx = 0;
  c.vy = 8;
  c.facing = Math.PI / 2;
  return { s, c };
}

describe('sharp cuts', () => {
  it('snaps the carrier onto a hard cut and corners the path', () => {
    const { s, c } = liveRun();
    const before = { x: c.x, y: c.y };
    s.step(STEP, press({ my: 1 }));
    const mid = { x: c.x, y: c.y };
    s.step(STEP, press({ mx: 1, rs: { x: 1, y: 0 }, lt: true }));
    const after = { x: c.x, y: c.y };
    expect(c.move).toBeNull();
    expect(s.state.floaters.map((f) => f.text)).toContain('CUT');
    expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(8 * DEFAULTS.cutRetainHard, 1);
    expect(Math.atan2(c.vy, c.vx)).toBeCloseTo(0, 2);
    expect(c.squared).toBe(false);
    const up = Math.atan2(mid.y - before.y, mid.x - before.x);
    const cut = Math.atan2(after.y - mid.y, after.x - mid.x);
    expect(Math.abs(wrapAngle(cut - up))).toBeGreaterThan(1.2);
    const mark = s.cutMarker(press({ rs: { x: 1, y: 0 } }));
    expect(mark).not.toBeNull();
    expect(mark!.x2 - c.x).toBeCloseTo(1.8, 2);
    expect(s.cutMarker(press({ rs: { x: 0.2, y: 0 } }))).toBeNull();
  });

  it('keeps more speed on a light cut than on a square cut', () => {
    const lightH = Math.PI / 2 - (20 * Math.PI) / 180;
    const cutTo = (rs: { x: number; y: number }) => {
      const { s, c } = liveRun();
      s.step(STEP, press({ rs, lt: true }));
      return Math.hypot(c.vx, c.vy);
    };
    const light = cutTo({ x: Math.cos(lightH), y: Math.sin(lightH) });
    const hard = cutTo({ x: 1, y: 0 });
    const keep = lerp(DEFAULTS.cutRetainLight, DEFAULTS.cutRetainHard, 20 / 90);
    expect(light).toBeCloseTo(8 * keep, 1);
    expect(hard).toBeCloseTo(8 * DEFAULTS.cutRetainHard, 1);
    expect(light).toBeGreaterThan(hard + 1);
  });

  it('holds the planted heading while the left stick disagrees, then lets go', () => {
    const { s, c } = liveRun();
    s.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true, mx: -1, my: -1 }));
    for (let i = 0; i < 8; i++) s.step(STEP, press({ mx: -1, my: -1 }));
    expect(c.cutLock ?? 0).toBeGreaterThan(0);
    expect(Math.atan2(c.vy, c.vx)).toBeCloseTo(0, 2);
    expect(c.vx).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) s.step(STEP, press({ mx: -1 }));
    expect(c.cutLock ?? 0).toBe(0);
    expect(c.vx).toBeLessThan(0);
  });

  it('comes back to speed faster with a higher re-accel multiplier', () => {
    const run = (mult: number) => {
      const s = sim({ cutReaccel: mult, cutPlant: 0.02, cutReaccelWindow: 0.5 });
      s.setMode('run');
      s.state.play.phase = 'live';
      const c = s.state.players.rb;
      c.vx = 0;
      c.vy = 8;
      c.facing = Math.PI / 2;
      s.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true, mx: 1 }));
      for (let i = 0; i < 6; i++) s.step(STEP, press({ mx: 1 }));
      return Math.hypot(c.vx, c.vy);
    };
    expect(run(3)).toBeGreaterThan(run(1) + 0.4);
  });

  it('ignores a held LT and cuts again on the next click', () => {
    const { s, c } = liveRun();
    s.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true }));
    s.step(STEP, press({ rs: { x: 0, y: 1 }, lt: true, my: 1 }));
    expect(Math.atan2(c.vy, c.vx)).toBeCloseTo(0, 1);
    for (let i = 0; i < 30; i++) s.step(STEP, press({ mx: 1 }));
    s.step(STEP, press({ rs: { x: 0, y: 1 }, lt: true, my: 1 }));
    expect(Math.atan2(c.vy, c.vx)).toBeGreaterThan(1);
  });

  it('does not square the carrier up, and restores the truck when sharp cuts are off', () => {
    const { s, c } = liveRun();
    s.step(STEP, press({ lt: true, my: 1 }));
    expect(c.squared).toBe(false);

    const classic = sim({ sharpCuts: false });
    classic.setMode('run');
    classic.state.play.phase = 'live';
    const rb = classic.state.players.rb;
    rb.vx = 0;
    rb.vy = 6;
    rb.facing = Math.PI / 2;
    classic.step(STEP, press({ my: 1, rs: { x: 0, y: 1 } }));
    expect(rb.move?.type).toBe('truck');

    const squared = sim({ sharpCuts: false });
    squared.setMode('run');
    squared.state.play.phase = 'live';
    squared.step(STEP, press({ lt: true, my: 1 }));
    expect(squared.state.players.rb.squared).toBe(true);
  });

  it('cuts a receiver in catch, throw, and coverage, and still squares up with the stick centered', () => {
    const caught = sim();
    caught.setMode('catch');
    const w = caught.state.players.wr;
    w.vx = 0;
    w.vy = 8;
    w.facing = Math.PI / 2;
    caught.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true, my: 1 }));
    expect(Math.atan2(w.vy, w.vx)).toBeCloseTo(0, 1);
    expect(w.squared).toBe(false);

    const square = sim();
    square.setMode('catch');
    square.step(STEP, press({ lt: true }));
    expect(square.state.players.wr.squared).toBe(true);

    const thrown = sim();
    thrown.setMode('throw');
    thrown.switchControl();
    thrown.state.play.phase = 'live';
    thrown.state.play.snapT = thrown.state.t;
    const wr = thrown.state.players.wr;
    wr.vx = 0;
    wr.vy = 8;
    wr.facing = Math.PI / 2;
    thrown.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true }));
    expect(thrown.state.controlled).toBe('wr');
    expect(Math.atan2(wr.vy, wr.vx)).toBeCloseTo(0, 1);

    const cov = sim();
    cov.setMode('coverage');
    const df = cov.state.players.df;
    df.vx = 0;
    df.vy = -6;
    cov.state.play.phase = 'live';
    cov.state.play.snapT = cov.state.t;
    cov.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true }));
    expect(df.cutLock ?? 0).toBe(0);
    cov.switchControl();
    const route = cov.state.players.wr;
    route.vx = 0;
    route.vy = 8;
    route.facing = Math.PI / 2;
    cov.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true }));
    expect(cov.state.controlled).toBe('wr');
    expect(Math.atan2(route.vy, route.vx)).toBeCloseTo(0, 1);
  });

  it('cuts a throw-around teammate and leaves throw aim on the ball holder', () => {
    const s = sim();
    s.setMode('free');
    const holder = s.state.players.p0;
    holder.vx = 0;
    holder.vy = 6;
    holder.stickMode = 'throw';
    s.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true }));
    expect(holder.cutLock ?? 0).toBe(0);
    expect(s.cutMarker(press({ rs: { x: 1, y: 0 } }))).toBeNull();

    s.switchControl();
    const mate = s.state.players.p1;
    mate.vx = 0;
    mate.vy = 7;
    mate.facing = Math.PI / 2;
    s.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true }));
    expect(Math.atan2(mate.vy, mate.vx)).toBeCloseTo(0, 1);
    expect(s.cutMarker(press({ rs: { x: 0, y: 1 } }))).not.toBeNull();
  });

  it('does not plant the quarterback while he is aiming a throw', () => {
    const s = sim({ requireSnap: false });
    const qb = s.state.players.qb;
    qb.vx = 0;
    qb.vy = 8;
    qb.facing = Math.PI / 2;
    s.step(STEP, press({ rs: { x: 1, y: 0 }, lt: true, my: 1 }));
    expect(qb.cutLock ?? 0).toBe(0);
    expect(s.cutMarker(press({ rs: { x: 1, y: 0 } }))).toBeNull();
    expect(Math.atan2(qb.vy, qb.vx)).toBeGreaterThan(1);
  });
});
