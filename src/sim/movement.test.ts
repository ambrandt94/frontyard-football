import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { emptyProfile, shapeStick } from '../input/stick';
import { blankInput, createSim } from './sim';

function sim() {
  return createSim({ ...DEFAULTS, requireSnap: false, autoReset: false });
}

function stick(sprint = false) {
  return stickAt(0, 1, sprint);
}

function stickAt(x: number, y: number, sprint: boolean) {
  const inp = blankInput();
  inp.mx = x;
  inp.my = y;
  inp.sprint = sprint;
  return inp;
}

function gate(deg: number) {
  const a = deg * Math.PI / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const diagonal = Math.abs(c) > 0.2 && Math.abs(s) > 0.2;
  const mag = diagonal ? 0.88 : 1;
  return { x: c * mag, y: s * mag };
}

describe('movement', () => {
  it('accelerates from a standstill at accel and caps at full speed', () => {
    const s = sim();
    const qb = s.state.players.qb;
    for (let i = 0; i < 20; i++) s.step(STEP, stick());
    expect(Math.hypot(qb.vx, qb.vy)).toBeCloseTo(20 * DEFAULTS.accel * STEP, 5);

    for (let i = 0; i < 40; i++) s.step(STEP, stick());
    expect(Math.hypot(qb.vx, qb.vy)).toBeCloseTo(DEFAULTS.fullSpeed, 5);
    expect(qb.boost).toBe(0);
  });

  it('adds one sprint pump per step and reaches max after 10 pumps', () => {
    const s = sim();
    const qb = s.state.players.qb;
    const maxBoost = DEFAULTS.sprintMaxSpeed - DEFAULTS.fullSpeed;
    expect(maxBoost / DEFAULTS.boostPerPump).toBe(10);

    s.step(STEP, stick(true));
    expect(qb.boost).toBeCloseTo(DEFAULTS.boostPerPump, 5);
    const held = qb.boost;

    for (let i = 0; i < 30; i++) s.step(STEP, stick(false));
    expect(qb.boost).toBeCloseTo(held, 5);

    for (let i = 0; i < 9; i++) s.step(STEP, stick(true));
    expect(qb.boost).toBeCloseTo(maxBoost, 5);

    s.step(STEP, stick(true));
    expect(qb.boost).toBeCloseTo(maxBoost, 5);

    for (let i = 0; i < 360; i++) s.step(STEP, stick(false));
    expect(qb.boost).toBe(0);
  });

  it('holds a full sprint on a square-ish gate in all 8 directions', () => {
    const profile = emptyProfile();
    for (let dir = 0; dir < 8; dir++) {
      const raw = gate(dir * 45);
      const shaped = shapeStick(raw.x, raw.y, profile, DEFAULTS.deadzone, 'play');
      expect(shaped.m, `dir ${dir * 45}`).toBe(1);
      const s = sim();
      const qb = s.state.players.qb;
      const maxBoost = DEFAULTS.sprintMaxSpeed - DEFAULTS.fullSpeed;
      for (let i = 0; i < 10; i++) s.step(STEP, stickAt(shaped.x, shaped.y, true));
      expect(qb.boost, `pump ${dir * 45}`).toBeCloseTo(maxBoost, 5);
      let eased = false;
      for (let i = 0; i < 200; i++) {
        if (i % 40 === 0) s.step(STEP, stickAt(shaped.x, shaped.y, true));
        else s.step(STEP, stickAt(shaped.x, shaped.y, false));
        if (qb.easing || qb.boostFast) eased = true;
      }
      expect(eased, `ease ${dir * 45}`).toBe(false);
      expect(qb.boost, `hold ${dir * 45}`).toBeCloseTo(maxBoost, 5);
      expect(Math.hypot(qb.vx, qb.vy), `speed ${dir * 45}`).toBeGreaterThan(DEFAULTS.sprintMaxSpeed - 0.35);
    }
  });

  it('waits through a short dip, then eases off if the stick stays low', () => {
    const s = sim();
    const qb = s.state.players.qb;
    s.step(STEP, stick(true));
    const pumped = qb.boost;
    for (let i = 0; i < 8; i++) s.step(STEP, stickAt(0, 0.6, false));
    expect(qb.easing).toBe(false);
    expect(qb.boost).toBeCloseTo(pumped, 5);
    for (let i = 0; i < 8; i++) s.step(STEP, stick(false));
    expect(qb.easing).toBe(false);
    for (let i = 0; i < 20; i++) s.step(STEP, stickAt(0, 0.6, false));
    expect(qb.easing).toBe(true);
    expect(qb.boost).toBeLessThan(pumped);
  });

  it('still fast-fades a sprint when the stick is held through a real cut', () => {
    const s = sim();
    const qb = s.state.players.qb;
    for (let i = 0; i < 10; i++) s.step(STEP, stick(true));
    let cut = false;
    for (let i = 0; i < 40; i++) {
      s.step(STEP, stickAt(1, 0, false));
      if (qb.boostFast) cut = true;
    }
    expect(cut).toBe(true);
  });

  it('ignores a wobble and a one-frame spike while running straight', () => {
    const s = sim();
    const qb = s.state.players.qb;
    for (let i = 0; i < 10; i++) s.step(STEP, stick(true));
    const boost = qb.boost;
    for (let i = 0; i < 40; i++) {
      const wobble = Math.sin(i * 1.7) * (12 * Math.PI / 180);
      const spike = i === 18 ? (55 * Math.PI / 180) : 0;
      const a = Math.PI / 2 + wobble + spike;
      s.step(STEP, stickAt(Math.cos(a), Math.sin(a), false));
      expect(qb.boostFast, `frame ${i}`).toBe(false);
    }
    expect(qb.boost).toBeCloseTo(boost, 5);
    expect(qb.easing).toBe(false);
  });

  it('lets the AI receiver pump up to the higher sprint cap on a go route', () => {
    const s = sim();
    s.state.route = 'go';
    s.reset();
    const wr = s.state.players.wr;
    for (let i = 0; i < 120 * 3; i++) s.step(STEP, blankInput());
    expect(wr.boost).toBeGreaterThan(3.5);
    expect(Math.hypot(wr.vx, wr.vy)).toBeGreaterThan(DEFAULTS.fullSpeed);
  });
});
