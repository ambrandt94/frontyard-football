import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { createSim } from '../sim/sim';
import { mulberry32 } from '../sim/rng';
import { blankInput } from '../sim/types';
import { frameToInput, inputToFrame, packSnapshot, parseMsg, present } from './codec';
import { applyGameplay, gameplaySettings } from './sync';

describe('net codec', () => {
  it('round-trips an input frame, including aim and the snap bit', () => {
    const inp = { ...blankInput(), mx: 0.2, my: 1, lt: true, a: true, y: true, aim: { x: 12, y: 40 }, throwPower: 0.4, rs: { x: 1, y: 0 } };
    const back = frameToInput(inputToFrame(inp, 7));
    expect(back.mx).toBeCloseTo(0.2);
    expect(back.my).toBe(1);
    expect(back.lt).toBe(true);
    expect(back.a).toBe(true);
    expect(back.y).toBe(true);
    expect(back.throwPower).toBeCloseTo(0.4);
    expect(back.aim).toEqual({ x: 12, y: 40 });
    expect(back.rs).toEqual({ x: 1, y: 0 });
    expect(inputToFrame(blankInput(), 1).throwPower).toBe(-1);
  });

  it('interpolates a player and snaps the ball when the holder changes', () => {
    const sim = createSim({ ...DEFAULTS }, { rng: mulberry32(1) });
    const first = packSnapshot(sim.state);
    const wr = sim.state.players.wr;
    wr.y += 10;
    sim.state.ball.holder = 'wr';
    sim.state.ball.y += 10;
    const second = packSnapshot(sim.state);
    present(sim.state, first, second, 0.5);
    expect(sim.state.players.wr.y).toBeCloseTo(first.players.find((p) => p.id === 'wr')!.y + 5);
    expect(sim.state.ball.holder).toBe('wr');
    expect(sim.state.ball.y).toBeCloseTo(second.ball.y);
  });

  it('rejects junk and keeps gameplay settings free of the camera', () => {
    expect(parseMsg('nope')).toBeNull();
    expect(parseMsg(JSON.stringify({ t: 'ping', n: 3 }))?.t).toBe('ping');
    const g = gameplaySettings({ ...DEFAULTS, cameraMinExtent: 99, netTurnUrl: 'turn:example', deadzone: 0.4, fullSpeed: 8 });
    expect(g.cameraMinExtent).toBeUndefined();
    expect(g.netTurnUrl).toBeUndefined();
    expect(g.deadzone).toBeUndefined();
    expect(g.fullSpeed).toBe(8);
    const applied = { ...DEFAULTS };
    applyGameplay(applied, { accel: 3, deadzone: 0.9, cameraMinExtent: 10 });
    expect(applied.accel).toBe(3);
    expect(applied.deadzone).toBe(DEFAULTS.deadzone);
    expect(applied.cameraMinExtent).toBe(DEFAULTS.cameraMinExtent);
  });
});
