import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { CATCH_H, FIELD_W, STEP } from '../config/constants';
import { clamp } from './math';
import { mulberry32 } from './rng';
import { blankInput, createSim } from './sim';
import type { SimInput } from './types';

function press(partial: Partial<SimInput> = {}): SimInput {
  return { ...blankInput(), ...partial };
}

const DIRS = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0.7071, y: 0.7071 },
  { x: -0.7071, y: 0.7071 },
  { x: 0.7071, y: -0.7071 },
  { x: -0.7071, y: -0.7071 },
];

describe('catch lead', () => {
  it('puts about 30 throws in front of a receiver running every direction', () => {
    const s = createSim({
      ...DEFAULTS,
      requireSnap: true,
      autoReset: false,
      catchPursuer: false,
      catchAIReceiver: false,
      catchPaused: false,
    }, { rng: mulberry32(11) });
    s.setMode('catch');
    const N = 32;
    const angles: number[] = [];
    const closests: number[] = [];
    let behind = 0;
    let reachable = 0;
    let gotThere = 0;
    const speed = 8;

    for (let n = 0; n < N; n++) {
      s.reset();
      const st = s.state;
      const dir = DIRS[n % DIRS.length];
      const w = st.players.wr;
      w.x = clamp(FIELD_W / 2 - dir.x * 14, 12, FIELD_W - 12);
      w.y = clamp(64 - dir.y * 18, 30, 90);
      w.vx = dir.x * speed;
      w.vy = dir.y * speed;
      w.facing = Math.atan2(w.vy, w.vx);
      st.cm!.readyT = st.t - 1;
      st.cm!.nextT = st.t - 1;
      const stick = press({ a: true, mx: dir.x, my: dir.y });
      s.step(STEP, stick);
      const hold = press({ mx: dir.x, my: dir.y });
      let guard = 0;
      while (st.cm!.phase !== 'air' && guard++ < 250) s.step(STEP, hold);
      expect(st.cm!.phase, `throw ${n} dir ${dir.x},${dir.y}`).toBe('air');

      const b = st.ball;
      let land = b.landing;
      for (let i = 1; i < b.arc.length; i++) {
        if (b.arc[i].z <= CATCH_H && b.arc[i - 1].z > CATCH_H) { land = b.arc[i]; break; }
      }
      expect(land).toBeTruthy();
      const dx = land!.x - w.x, dy = land!.y - w.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const sp = Math.hypot(w.vx, w.vy) || 0.001;
      const dot = clamp((dx * w.vx + dy * w.vy) / (dist * sp), -1, 1);
      const ang = Math.acos(dot) * 180 / Math.PI;
      angles.push(ang);
      if (ang > 100) behind++;

      const along = (dx * w.vx + dy * w.vy) / sp;
      const perp = Math.hypot(dx - w.vx / sp * along, dy - w.vy / sp * along);
      const flight = Math.max(0.05, land!.t - st.t);
      // Keep the current heading: in front, not a detour, and close enough to arrive before it hits the ground.
      if (ang <= 100 && along > -0.4 && along < sp * flight + 5 && perp < 3.5) reachable++;

      let closest = Infinity;
      let steps = 0;
      while (st.ball.state === 'air' && steps++ < 500) {
        s.step(STEP, hold);
        closest = Math.min(closest, Math.hypot(w.x - st.ball.x, w.y - st.ball.y));
      }
      closests.push(closest);
      if (closest < 2.4) gotThere++;
    }

    const pctBehind = behind / N;
    const pctReach = reachable / N;
    const pctGot = gotThere / N;
    console.log(
      `catch leads n=${N} behind=${behind} (${(100 * pctBehind).toFixed(1)}%) ` +
      `on-path=${reachable} (${(100 * pctReach).toFixed(1)}%) ` +
      `ran-under-ball=${gotThere} (${(100 * pctGot).toFixed(1)}%) ` +
      `angles=${angles.map((a) => a.toFixed(0)).join(',')} ` +
      `closest=${closests.map((c) => c.toFixed(1)).join(',')}`,
    );
    expect(pctBehind).toBeLessThan(0.05);
    expect(pctReach).toBeGreaterThan(0.8);
    expect(pctGot).toBeGreaterThan(0.7);
  });

  it('does not park a stationary target behind the receiver', () => {
    const s = createSim({ ...DEFAULTS, requireSnap: true, autoReset: false, catchPursuer: false, catchSidelineShare: 0 }, { rng: mulberry32(4) });
    s.setMode('catch');
    const facings = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
    for (let n = 0; n < 8; n++) {
      s.reset();
      const st = s.state;
      const w = st.players.wr;
      const facing = facings[n % facings.length];
      w.x = FIELD_W / 2;
      w.y = 60;
      w.vx = 0;
      w.vy = 0;
      w.facing = facing;
      st.cm!.readyT = st.t - 1;
      let guard = 0;
      s.step(STEP, press({ a: true }));
      while (st.cm!.phase !== 'air' && guard++ < 250) s.step(STEP, blankInput());
      expect(st.cm!.phase).toBe('air');
      const tgt = st.cm!.cur!.tgt;
      const fx = Math.cos(facing), fy = Math.sin(facing);
      const alongFace = (tgt.x - w.x) * fx + (tgt.y - w.y) * fy;
      expect(alongFace).toBeGreaterThan(-0.6);
      if (fy >= -0.2) expect(tgt.y).toBeGreaterThan(w.y - 0.6);
    }
  });
});
