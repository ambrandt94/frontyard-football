import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { GOAL_Y, STEP } from '../config/constants';
import { blankInput, createSim } from './sim';
import { mulberry32 } from './rng';
import type { SimInput } from './types';

const zeroRng = { random: () => 0 };

function sim(extra: Partial<typeof DEFAULTS> = {}) {
  return createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, trailingBack: false, ...extra }, { rng: zeroRng });
}

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

function texts(s: ReturnType<typeof sim>) {
  return s.state.floaters.map((f) => f.text);
}

describe('tackle challenge', () => {
  it('starts the carrier on the 50, with a center in front and two tacklers split wide', () => {
    const s = sim();
    s.setMode('run');
    const rb = s.state.players.rb;
    const ol = s.state.players.ol;
    const df = s.state.players.df;
    const df2 = s.state.players.df2;
    expect(rb.y).toBe(GOAL_Y - DEFAULTS.runStartDist);
    expect(rb.y).toBe(60);
    expect(ol.role).toBe('OL');
    expect(ol.y).toBeGreaterThan(rb.y);
    expect(ol.y).toBeLessThan(df.y);
    expect(df.role).toBe('DF');
    expect(df2.role).toBe('DF');
    expect(df.x).toBeLessThan(rb.x);
    expect(df2.x).toBeGreaterThan(rb.x);
    expect(df2.x - df.x).toBeGreaterThan(5);
    expect(s.state.ball.holder).toBe('rb');
    expect(s.state.play.phase).toBe('pre');
    expect(rb.stickMode).toBe('carry');
  });

  it('keeps the tacklers on opposite sides of the ball', () => {
    const s = sim({ wrapSuccess: 0, diveTackleSuccess: 0, fumbleBase: 0, aiMoveRate: 0 });
    s.setMode('run');
    s.step(STEP, press({ a: true }));
    const frames = Math.round(0.8 / STEP);
    let narrow = Infinity;
    for (let i = 0; i < frames; i++) {
      s.step(STEP, press({ my: 1 }));
      const gap = s.state.players.df2.x - s.state.players.df.x;
      narrow = Math.min(narrow, gap);
    }
    expect(s.state.play.phase).toBe('live');
    expect(narrow).toBeGreaterThan(3);
    expect(s.state.players.df.x).toBeLessThan(s.state.players.rb.x);
    expect(s.state.players.df2.x).toBeGreaterThan(s.state.players.rb.x);
  });

  it('engages the nearest tackler, holds them, then lets them shed', () => {
    const s = sim({ blockHold: 0.5, blockSlip: 1.2, blockPush: 1.5, aiMoveRate: 0 });
    s.setMode('run');
    s.step(STEP, press({ a: true }));
    const rb = s.state.players.rb;
    const ol = s.state.players.ol;
    const df = s.state.players.df;
    const df2 = s.state.players.df2;
    rb.x = 26; rb.y = 40; rb.vx = 0; rb.vy = 0;
    ol.x = 26; ol.y = 41.2; ol.vx = 0; ol.vy = 0;
    df.x = 26; df.y = 42.2; df.vx = 0; df.vy = 0; df.tackle = null;
    df2.x = 4; df2.y = 4; df2.vx = 0; df2.vy = 0;
    s.step(STEP, press({ my: 1 }));
    expect(texts(s)).toContain('BLOCK');
    expect(s.state.ai.ol?.engage?.id).toBe('df');
    const x0 = df.x, y0 = df.y;
    const held = Math.round(0.3 / STEP);
    for (let i = 0; i < held; i++) s.step(STEP, press({ my: 1 }));
    expect(s.state.ai.ol?.engage?.id).toBe('df');
    expect(Math.hypot(df.x - x0, df.y - y0)).toBeLessThan(1.6);
    const cap = Math.round(0.6 / STEP);
    for (let i = 0; i < cap && !texts(s).includes('SHED'); i++) s.step(STEP, press({ my: 1 }));
    expect(texts(s)).toContain('SHED');
    expect(ol.plantT).toBeGreaterThan(0);
    expect(s.state.ai.ol?.engage).toBeNull();
    const sx = df.x, sy = df.y;
    for (let i = 0; i < 8; i++) s.step(STEP, blankInput());
    expect(Math.hypot(df.x - sx, df.y - sy)).toBeGreaterThan(0.35);
  });

  it('scores a touchdown at the goal line and keeps the count across a reset', () => {
    const s = sim({ aiMoveRate: 0 });
    s.setMode('run');
    s.state.play.phase = 'live';
    s.state.play.snapT = s.state.t;
    const rb = s.state.players.rb;
    rb.x = 20; rb.y = 109.4; rb.vx = 0; rb.vy = 8;
    s.state.players.df.x = 4; s.state.players.df.y = 40;
    s.state.players.df2.x = 48; s.state.players.df2.y = 40;
    s.state.players.ol.x = 20; s.state.players.ol.y = 100;
    for (let i = 0; i < 30 && s.state.play.phase !== 'over'; i++) s.step(STEP, press({ my: 1 }));
    expect(s.state.play.result).toBe('TOUCHDOWN');
    expect(s.state.feedback?.text).toBe('TOUCHDOWN');
    expect(s.state.runScore.td).toBe(1);
    s.reset();
    expect(s.state.play.phase).toBe('pre');
    expect(s.state.players.rb.y).toBe(60);
    expect(s.state.runScore.td).toBe(1);
  });

  it('still hurdles, and an upfield flick does not truck while sharp cuts are on', () => {
    const s = sim({ aiMoveRate: 0 });
    s.setMode('run');
    s.step(STEP, press({ a: true }));
    s.step(STEP, press({ a: true, my: 1 }));
    expect(texts(s)).toContain('HURDLE');
    const again = sim({ aiMoveRate: 0 });
    again.setMode('run');
    again.state.play.phase = 'live';
    const c = again.state.players.rb;
    c.vx = 0; c.vy = 6; c.facing = Math.PI / 2;
    again.step(STEP, press({ my: 1, rs: { x: 0, y: 1 } }));
    expect(c.move).toBeNull();
  });

  it('does not stack the lanes when the carrier starts off center', () => {
    const s = createSim({
      ...DEFAULTS, requireSnap: true, autoReset: false, trailingBack: false, aiMoveRate: 0, wrapSuccess: 0, fumbleBase: 0,
    }, { rng: mulberry32(4) });
    s.setMode('run');
    s.step(STEP, press({ a: true }));
    for (let i = 0; i < Math.round(0.7 / STEP); i++) s.step(STEP, press({ my: 1 }));
    expect(s.state.players.df2.x - s.state.players.df.x).toBeGreaterThan(3);
  });
});
