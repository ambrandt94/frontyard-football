import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { createSim } from '../sim/sim';
import {
  METER_START,
  chargeDistance,
  createAimState,
  polarDistance,
  resampleArc,
  rightStickAims,
  stepAim,
  type AimSample,
} from './aim';

const DT = 1 / 120;

function sample(stick: { x: number; y: number } | null, extra: Partial<AimSample> = {}): AimSample {
  return {
    stick,
    mouse: null,
    qb: { x: 0, y: 0 },
    charging: false,
    pressure: null,
    cancel: false,
    ...extra,
  };
}

describe('aim spec v1', () => {
  it('polar distance is monotonic and hits the ends', () => {
    const min = DEFAULTS.aimMinDist;
    const max = DEFAULTS.aimMaxDist;
    const exp = DEFAULTS.aimDistExp;
    expect(polarDistance(0, min, max, exp)).toBe(min);
    expect(polarDistance(1, min, max, exp)).toBe(max);
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const m = i / 20;
      const d = polarDistance(m, min, max, exp);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    const mid = polarDistance(0.5, min, max, exp);
    const linear = min + (max - min) * 0.5;
    expect(mid).toBeLessThan(linear);
  });

  it('keeps a noisy full stick inside 0.3 yd at 50 yards', () => {
    const state = createAimState();
    let now = 0;
    const pts: { x: number; y: number }[] = [];
    const total = 240;
    const settle = 90;
    for (let i = 0; i < total; i++) {
      now += 1 / 60;
      const n1 = ((i * 17) % 11) / 10 * 0.02 - 0.01;
      const n2 = ((i * 13) % 11) / 10 * 0.02 - 0.01;
      const stick = i < 30 ? { x: 0, y: 1 } : { x: n1, y: 1 + n2 };
      const out = stepAim(state, sample(stick), 1 / 60, { ...DEFAULTS, aimMode: 'absolutePlus' }, now);
      if (i >= settle) pts.push({ x: out.x, y: out.y });
    }
    let mx = 0;
    let my = 0;
    for (const p of pts) {
      mx += p.x;
      my += p.y;
    }
    mx /= pts.length;
    my /= pts.length;
    let max = 0;
    let rms = 0;
    for (const p of pts) {
      const d = Math.hypot(p.x - mx, p.y - my);
      max = Math.max(max, d);
      rms += d * d;
    }
    rms = Math.sqrt(rms / pts.length);
    console.log(
      `aim jitter n=${pts.length} max=${max.toFixed(3)} yd rms=${rms.toFixed(3)} yd ` +
        `center=(${mx.toFixed(2)}, ${my.toFixed(2)}) dist=${Math.hypot(mx, my).toFixed(2)}`,
    );
    expect(Math.hypot(mx, my)).toBeGreaterThan(45);
    expect(max).toBeLessThan(0.3);
  });

  it('settles a 90° flick within 60 ms', () => {
    const state = createAimState();
    let now = 0;
    for (let i = 0; i < 30; i++) {
      now += DT;
      stepAim(state, sample({ x: 0, y: 1 }), DT, DEFAULTS, now);
    }
    const t0 = now;
    let settled = -1;
    for (let i = 0; i < 20; i++) {
      now += DT;
      const out = stepAim(state, sample({ x: 1, y: 0 }), DT, DEFAULTS, now);
      const ang = Math.atan2(out.x, out.y) * 180 / Math.PI;
      if (Math.abs(ang - 90) < 2) {
        settled = now - t0;
        break;
      }
    }
    console.log(`aim flick settle=${(settled * 1000).toFixed(1)} ms angle=${state.angleDeg.toFixed(2)}°`);
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThanOrEqual(0.06);
  });

  it('direction charge matches d(t) and B cancels', () => {
    const min = DEFAULTS.chargeMinDist;
    const max = DEFAULTS.chargeMaxDist;
    const time = DEFAULTS.chargeTime;
    const exp = DEFAULTS.chargeExp;
    expect(chargeDistance(0, min, max, time, exp, false)).toBe(min);
    expect(chargeDistance(time, min, max, time, exp, false)).toBeCloseTo(max, 6);
    expect(chargeDistance(time * 2, min, max, time, exp, false)).toBe(max);
    const midT = 0.55;
    const formula = min + (max - min) * (midT / time) ** exp;
    expect(chargeDistance(midT, min, max, time, exp, false)).toBeCloseTo(formula, 6);
    expect(chargeDistance(time, min, max, time, exp, true)).toBeCloseTo(max, 6);
    expect(chargeDistance(time * 2, min, max, time, exp, true)).toBeCloseTo(min, 6);

    const chargeSettings = { ...DEFAULTS, aimMode: 'directionCharge' as const };
    const state = createAimState();
    let now = 0;
    now += DT;
    stepAim(state, sample({ x: 0, y: 1 }), DT, chargeSettings, now);
    let elapsed = 0;
    let dist = 0;
    while (elapsed < midT - 1e-9) {
      const h = Math.min(DT, midT - elapsed);
      elapsed += h;
      now += h;
      dist = stepAim(state, sample({ x: 0, y: 1 }, { charging: true, pressure: 0.4 }), h, chargeSettings, now).dist;
    }
    console.log(`direction charge t=${elapsed.toFixed(3)} d=${dist.toFixed(3)} formula=${formula.toFixed(3)}`);
    expect(dist).toBeCloseTo(formula, 4);

    const cancelled = stepAim(state, sample({ x: 0, y: 1 }, { charging: true, pressure: 0.4, cancel: true }), DT, chargeSettings, now + DT);
    expect(cancelled.suppressThrow).toBe(true);
    expect(cancelled.dist).toBeCloseTo(min, 6);
    const still = stepAim(state, sample({ x: 0, y: 1 }, { charging: true, pressure: 0.4 }), DT, chargeSettings, now + DT * 2);
    expect(still.suppressThrow).toBe(false);
    expect(still.dist).toBeCloseTo(min, 6);
  });

  it('preview arc ends on the sim landing', () => {
    const sim = createSim({ ...DEFAULTS });
    sim.setMode('throw');
    const qb = sim.state.players.qb;
    const tgt = { x: qb.x + 4, y: qb.y + 42 };
    const preview = sim.previewThrow(0.5, tgt);
    const end = preview.arc[preview.arc.length - 1];
    sim.doThrow(tgt, 0.5, false);
    const land = sim.state.ball.landing;
    expect(land).toBeTruthy();
    const err = Math.hypot(end.x - land!.x, end.y - land!.y);
    const drawn = resampleArc(preview.arc, 32);
    const drawErr = Math.hypot(drawn[drawn.length - 1].x - land!.x, drawn[drawn.length - 1].y - land!.y);
    console.log(`arc endpoint error=${err.toFixed(4)} yd resampled=${drawErr.toFixed(4)} yd segments=${drawn.length - 1}`);
    expect(err).toBeLessThan(0.1);
    expect(drawErr).toBeLessThan(0.1);
    expect(drawn.length).toBe(33);
  });

  it('starts the distance meter below the old half-stick line', () => {
    expect(METER_START).toBeLessThan(0.15);
    expect(rightStickAims(0.1)).toBe(true);
    expect(rightStickAims(0.04)).toBe(false);
    const settings = { ...DEFAULTS, aimMode: 'directionCharge' as const };
    const state = createAimState();
    let now = 0;
    let dist = 0;
    let angle = 0;
    const stick = { x: 0.1, y: 0.08 };
    for (let i = 0; i < 40; i++) {
      now += DT;
      const out = stepAim(state, sample(stick, { charging: true, pressure: 0.8 }), DT, settings, now);
      dist = out.dist;
      angle = out.angleDeg;
    }
    expect(Math.hypot(stick.x, stick.y)).toBeLessThan(0.45);
    expect(state.armedMag).toBeGreaterThan(0);
    expect(state.armedMag).toBeLessThan(0.45);
    expect(dist).toBeGreaterThan(settings.chargeMinDist + 3);
    expect(Math.abs(angle)).toBeGreaterThan(30);
  });

  it('keeps the charged distance and direction when the stick eases off', () => {
    const settings = { ...DEFAULTS, aimMode: 'directionCharge' as const };
    const state = createAimState();
    let now = 0;
    const held = { x: 0.55, y: 0.8 };
    let charged = { dist: 0, angleDeg: 0 };
    for (let i = 0; i < 30; i++) {
      now += DT;
      const out = stepAim(state, sample(held, { charging: true, pressure: 0.9 }), DT, settings, now);
      charged = { dist: out.dist, angleDeg: out.angleDeg };
    }
    expect(charged.dist).toBeGreaterThan(settings.chargeMinDist + 4);
    const ease = [
      { x: 0.4, y: 0.55 },
      { x: 0.22, y: 0.3 },
      { x: 0.08, y: 0.12 },
      { x: 0.02, y: 0.04 },
    ];
    for (const stick of ease) {
      now += DT;
      const out = stepAim(state, sample(stick, { charging: true, pressure: 0.7 }), DT, settings, now);
      expect(out.dist).toBeGreaterThan(charged.dist - 0.05);
      expect(Math.abs(out.angleDeg - charged.angleDeg)).toBeLessThan(8);
    }
    now += DT;
    const released = stepAim(state, sample({ x: 0, y: 0 }, { charging: false, pressure: null }), DT, settings, now);
    expect(released.dist).toBeGreaterThan(charged.dist - 0.05);
    expect(Math.abs(released.angleDeg - charged.angleDeg)).toBeLessThan(8);
    expect(released.dist).toBeGreaterThan(settings.chargeMinDist + 4);
  });
});
