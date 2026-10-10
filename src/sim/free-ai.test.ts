import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { STEP } from '../config/constants';
import { blankInput, createSim } from './sim';
import { mulberry32 } from './rng';

describe('throw around spacing', () => {
  it('keeps 4 bots spread from each other and from the human for 20s', () => {
    const s = createSim({ ...DEFAULTS, autoReset: false }, { rng: mulberry32(9) });
    s.setRoster(5);
    s.setMode('free');
    const st = s.state;
    expect(st.controlled).toBe('p0');
    expect(st.ball.holder).toBe('p0');
    const bots = ['p1', 'p2', 'p3', 'p4'].map((id) => st.players[id]);
    expect(bots.every(Boolean)).toBe(true);
    const minSpace = DEFAULTS.freeSpaceMin;
    let samples = 0;
    let minAvg = Infinity;
    let minHuman = Infinity;
    const frames = Math.round(20 / STEP);
    for (let i = 0; i < frames; i++) {
      s.step(STEP, blankInput());
      if (i % 60 !== 0) continue;
      samples++;
      let pair = 0;
      let n = 0;
      for (let a = 0; a < bots.length; a++) {
        for (let b = a + 1; b < bots.length; b++) {
          pair += Math.hypot(bots[a].x - bots[b].x, bots[a].y - bots[b].y);
          n++;
        }
      }
      const avg = pair / n;
      minAvg = Math.min(minAvg, avg);
      const human = st.players.p0;
      let toHuman = 0;
      for (const bot of bots) toHuman += Math.hypot(bot.x - human.x, bot.y - human.y);
      minHuman = Math.min(minHuman, toHuman / bots.length);
    }
    expect(samples).toBeGreaterThan(30);
    expect(minAvg).toBeGreaterThan(minSpace);
    expect(minHuman).toBeGreaterThan(minSpace * 0.75);
    expect(bots.some((b) => b.callT != null)).toBe(true);
    console.log(`throw-around spacing samples=${samples} minAvgPair=${minAvg.toFixed(2)} minAvgToHuman=${minHuman.toFixed(2)} floor=${minSpace}`);
  });
});
