import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { blankInput, createSim } from './sim';

function sim() {
  return createSim({ ...DEFAULTS, requireSnap: false, autoReset: false });
}

function stick(sprint = false) {
  const inp = blankInput();
  inp.my = 1;
  inp.sprint = sprint;
  return inp;
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
