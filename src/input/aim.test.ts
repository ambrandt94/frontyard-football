import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { radialDeadzone } from '../sim/math';
import { createAimState, stepAim } from './aim';

const DT = 1 / 60;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mean squared distance from the centroid. This is the old reticle's twitch. */
function variance(samples: { x: number; y: number }[]): number {
  let mx = 0;
  let my = 0;
  for (const p of samples) {
    mx += p.x;
    my += p.y;
  }
  mx /= samples.length;
  my /= samples.length;
  let v = 0;
  for (const p of samples) v += (p.x - mx) ** 2 + (p.y - my) ** 2;
  return v / samples.length;
}

/** What the reticle used to do: movement deadzone, then a straight map to yards. */
function instantAim(stick: { x: number; y: number }): { x: number; y: number } {
  const r = radialDeadzone(stick.x, stick.y, DEFAULTS.deadzone);
  return { x: r.x * DEFAULTS.maxAimRange, y: r.y * DEFAULTS.maxAimRange };
}

function jitterStick(i: number): { x: number; y: number } {
  return {
    x: 0.62 + Math.sin(i * 1.7) * 0.14 + Math.sin(i * 4.3) * 0.05,
    y: -0.48 + Math.cos(i * 1.3) * 0.12 + Math.sin(i * 5.1) * 0.04,
  };
}

describe('QB aim feel', () => {
  it('shrinks reticle variance under scripted stick jitter', () => {
    const state = createAimState();
    const raw: { x: number; y: number }[] = [];
    const smooth: { x: number; y: number }[] = [];
    let now = 0;
    const total = 270;
    const settle = 120;
    for (let i = 0; i < total; i++) {
      now += DT;
      const stick = jitterStick(i);
      const off = stepAim(state, stick, DT, DEFAULTS, now);
      if (i >= settle) {
        raw.push(instantAim(stick));
        smooth.push(off);
      }
    }
    const rawVar = variance(raw);
    const smoothVar = variance(smooth);
    const ratio = smoothVar / rawVar;
    console.log(
      `aim jitter variance raw=${rawVar.toFixed(4)} (rms ${Math.sqrt(rawVar).toFixed(3)} yd) ` +
        `smoothed=${smoothVar.toFixed(4)} (rms ${Math.sqrt(smoothVar).toFixed(3)} yd) ` +
        `ratio=${ratio.toFixed(4)}`,
    );
    expect(state.holding).toBe(false);
    expect(rawVar).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(0.25);
  });

  it('keeps the aimed spot when the stick springs back on the throw', () => {
    const state = createAimState();
    const stick = { x: 0.18, y: 0.94 };
    let now = 0;
    let aimed = { x: 0, y: 12 };
    for (let i = 0; i < 90; i++) {
      now += DT;
      aimed = stepAim(state, stick, DT, DEFAULTS, now);
    }

    const springFrames = 8;
    let thrown = aimed;
    let worst = 0;
    for (let i = 0; i < springFrames + 12; i++) {
      now += DT;
      const k = i < springFrames ? 1 - (i + 1) / springFrames : 0;
      const off = stepAim(state, { x: stick.x * k, y: stick.y * k }, DT, DEFAULTS, now);
      worst = Math.max(worst, dist(off, aimed));
      if (k === 0) thrown = off;
    }
    console.log(
      `aim spring held=(${aimed.x.toFixed(2)}, ${aimed.y.toFixed(2)}) ` +
        `throw=(${thrown.x.toFixed(2)}, ${thrown.y.toFixed(2)}) ` +
        `error=${dist(thrown, aimed).toFixed(3)} yd worst=${worst.toFixed(3)} yd`,
    );
    expect(dist(thrown, aimed)).toBeLessThan(1.5);
    expect(Math.hypot(thrown.x, thrown.y)).toBeGreaterThan(8);
    expect(worst).toBeLessThan(1.5);

    // One-frame stick drop, the same frame a throw would read.
    const drop = createAimState();
    now = 0;
    let settled = { x: 0, y: 12 };
    for (let i = 0; i < 90; i++) {
      now += DT;
      settled = stepAim(drop, stick, DT, DEFAULTS, now);
    }
    now += DT;
    const onRelease = stepAim(drop, { x: 0, y: 0 }, DT, DEFAULTS, now);
    expect(dist(onRelease, settled)).toBeLessThan(0.75);

    // After the hold, ease toward the rest offset. No one-frame snap onto the QB.
    let prev = thrown;
    let maxStep = 0;
    const after = now + DEFAULTS.aimReturnHold + 1.2;
    while (now < after) {
      now += DT;
      const off = stepAim(state, { x: 0, y: 0 }, DT, DEFAULTS, now);
      maxStep = Math.max(maxStep, dist(off, prev));
      prev = off;
    }
    expect(maxStep).toBeLessThan(2);
    expect(dist(prev, aimed)).toBeGreaterThan(1);
    expect(dist(prev, { x: 0, y: 12 })).toBeLessThan(dist(aimed, { x: 0, y: 12 }));
  });

  it('gives a small stick less than a linear share of the range', () => {
    const state = createAimState();
    let now = 0;
    let off = { x: 0, y: 12 };
    const stick = { x: 0, y: 0.3 };
    for (let i = 0; i < 180; i++) {
      now += DT;
      off = stepAim(state, stick, DT, DEFAULTS, now);
    }
    const linear = instantAim(stick);
    expect(Math.hypot(off.x, off.y)).toBeLessThan(Math.hypot(linear.x, linear.y) * 0.55);
  });

  it('follows a new deflection during the return hold', () => {
    const state = createAimState();
    const stick = { x: 0.18, y: 0.94 };
    let now = 0;
    let aimed = { x: 0, y: 12 };
    for (let i = 0; i < 90; i++) {
      now += DT;
      aimed = stepAim(state, stick, DT, DEFAULTS, now);
    }
    now += DT;
    const held = stepAim(state, { x: 0, y: 0 }, DT, DEFAULTS, now);
    expect(dist(held, aimed)).toBeLessThan(0.75);
    let off = held;
    for (let i = 0; i < 45; i++) {
      now += DT;
      off = stepAim(state, { x: -0.85, y: 0.35 }, DT, DEFAULTS, now);
    }
    expect(dist(off, held)).toBeGreaterThan(4);
  });
});
