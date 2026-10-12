import { describe, expect, it } from 'vitest';
import { freshTrigger, stepTrigger, triggerPower, type TriggerTune } from './trigger';

const tune: TriggerTune = { engage: 0.35, release: 0.12, minHoldMs: 80 };

describe('RT engage threshold', () => {
  it('a resting 0.2 press never charges', () => {
    let latch = freshTrigger();
    let prev = 0;
    for (let t = 0; t <= 400; t += 16) {
      const step = stepTrigger(latch, 0.2, t, prev, tune);
      latch = step.latch;
      prev = 0.2;
      expect(step.charge).toBeNull();
      expect(step.throwPower).toBeNull();
      expect(step.catchEdge).toBe(false);
      expect(latch.charging).toBe(false);
    }
  });

  it('a 0.5 press charges, and the loft scale still reaches a bullet', () => {
    const step = stepTrigger(freshTrigger(), 0.5, 0, 0, tune);
    expect(step.latch.charging).toBe(true);
    expect(step.throwPower).toBeNull();
    expect(step.charge).toBeCloseTo((0.5 - 0.35) / (1 - 0.35));
    expect(step.catchEdge).toBe(true);
    expect(triggerPower(1, 0.35)).toBeCloseTo(1);
    expect(triggerPower(0.35, 0.35)).toBeCloseTo(0);
  });

  it('releases the throw only once RT drops below 0.12', () => {
    const held = stepTrigger(freshTrigger(), 0.8, 0, 0, tune);
    const dip = stepTrigger(held.latch, 0.25, 100, 0.8, tune);
    expect(dip.throwPower).toBeNull();
    expect(dip.latch.charging).toBe(true);
    expect(dip.latch.peak).toBeCloseTo(0.8);
    const thrown = stepTrigger(dip.latch, 0.05, 200, 0.25, tune);
    expect(thrown.throwPower).toBeCloseTo((0.8 - 0.35) / (1 - 0.35));
    expect(thrown.latch.charging).toBe(false);
    expect(thrown.latch.lock).toBe(true);
  });

  it('treats a brush under 80 ms as no charge', () => {
    const held = stepTrigger(freshTrigger(), 0.6, 0, 0, tune);
    const brushed = stepTrigger(held.latch, 0, 40, 0.6, tune);
    expect(brushed.throwPower).toBeNull();
    expect(brushed.latch.charging).toBe(false);
    expect(brushed.charge).toBeNull();
  });

  it('arms a one-hand catch at the engage threshold only', () => {
    const edge = stepTrigger(freshTrigger(), 0.4, 0, 0.2, tune);
    expect(edge.catchEdge).toBe(true);
    const held = stepTrigger(edge.latch, 0.9, 50, 0.4, tune);
    expect(held.catchEdge).toBe(false);
  });
});
