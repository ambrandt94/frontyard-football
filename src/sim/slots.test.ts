import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { mulberry32 } from './rng';
import { createSim } from './sim';
import { blankInput, type SimInput } from './types';

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

describe('slot inputs and throw-around', () => {
  it('lets an empty receiver slot fall back to the route AI', () => {
    const sim = createSim({ ...DEFAULTS, requireSnap: true }, { rng: mulberry32(3) });
    sim.setMode('throw');
    sim.setSlotInputs({ qb: press({ a: true }) }, 'qb');
    sim.step(STEP);
    expect(sim.state.play.phase).toBe('live');
    const y0 = sim.state.players.wr.y;
    for (let i = 0; i < 90; i++) {
      sim.setSlotInputs({ qb: press() }, 'qb');
      sim.step(STEP);
    }
    expect(sim.state.players.wr.y).toBeGreaterThan(y0 + 2);
  });

  it('keeps a throw-around catch live and lets the new holder throw', () => {
    const sim = createSim({
      ...DEFAULTS,
      baseInaccuracy: 0,
      unsquaredInaccuracy: 1,
      catchWindowMs: 5000,
      catchReach: 3,
      autoReset: false,
    }, { rng: mulberry32(4) });
    sim.setRoster(2);
    sim.setMode('free');
    const st = sim.state;
    expect(st.ball.holder).toBe('p0');
    expect(st.play.phase).toBe('live');
    const tgt = { x: st.players.p1.x, y: st.players.p1.y };
    sim.setSlotInputs({ p0: press({ aim: tgt, throwPower: 0.55, lt: true }), p1: press() }, null);
    sim.step(STEP);
    expect(st.ball.state).toBe('air');
    expect(st.carry).toBeNull();
    for (let i = 0; i < 500 && st.ball.holder !== 'p1'; i++) {
      const p = st.players.p1;
      const b = st.ball;
      const inp = press();
      if (b.state === 'air' && b.landing) {
        const dx = b.landing.x - p.x, dy = b.landing.y - p.y, d = Math.hypot(dx, dy) || 1;
        inp.mx = dx / d;
        inp.my = dy / d;
        inp.y = true;
      }
      sim.setSlotInputs({ p0: press(), p1: inp }, null);
      sim.step(STEP);
    }
    expect(st.ball.holder).toBe('p1');
    expect(st.play.phase).toBe('live');
    expect(st.carry).toBeNull();
    const back = { x: st.players.p0.x, y: st.players.p0.y };
    sim.setSlotInputs({ p1: press({ aim: back, throwPower: 0.55 }), p0: press() }, null);
    sim.step(STEP);
    expect(st.ball.state).toBe('air');
    expect(st.play.phase).not.toBe('over');
  });
});
