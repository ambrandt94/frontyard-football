/**
 * Pure football simulation. No DOM, no Three.js — safe to run later on a Node game server.
 * Time is seconds, space is yards. Pass a fixed dt (the app uses 1/120).
 */
import { catchBandRange, type Settings } from '../config/defaults';
import { CATCH_H, FIELD_L, FIELD_W, GOAL_Y, GRAV, JOG_TILT, LOS_Y, RELEASE_H } from '../config/constants';
import type { ModeId } from '../modes';
import { approachAngle, clamp, gauss as gaussOf, lerp, lowAngle, rad, speedForAngle, wrapAngle } from './math';
import { defaultRng, type Rng } from './rng';
import { blankInput, type AiBag, type ArcPoint, type Ball, type Move, type Player, type SimInput, type SimState, type ThrowSolution, type Vec2 } from './types';

export { blankInput } from './types';

/** How often AI clicks L3. 0.1s ≈ 10 taps/s, so the 10-pump climb to max sprint takes ~1s (the old 3–4 pump climb took ~1s at 0.3s). */
const AI_PUMP_INTERVAL = 0.1;

const BANDS = ['short', 'medium', 'deep'];
const MOVE_COLORS: Record<string, string> = { SIDESTEP: '#80deea', TRUCK: '#ff8a65', SPIN: '#ce93d8', JUKE: '#fff176' };

export interface Sim {
  state: SimState;
  step(dt: number, human?: SimInput | null): void;
  reset(): void;
  previewThrow(power: number, tgt: Vec2): { arc: ArcPoint[]; sol: ThrowSolution; step: { f: number; mult: number; err: number } };
  routeWaypoints(name: string): Vec2[];
  snap(): void;
  doThrow(tgt: Vec2, power: number, useError: boolean): void;
  setMode(m: ModeId): void;
  resolveTackle(d: Player, c: Player, kind: 'wrap' | 'dive'): { kind: string; p: number; f: number; bigHit: boolean; notes: string[]; result: string; t: number };
  handPos(p: Player): Vec2;
}

export function createSim(S: Settings, options?: { rng?: Rng }): Sim {
  const rng = options?.rng ?? defaultRng();
  const gauss = () => gaussOf(rng);
  const st: SimState = {
    t: 0, mode: 'throw', players: {}, ball: null as unknown as Ball, play: null as unknown as SimState['play'],
    stats: { att: 0, comp: 0, last: '—', yacTotal: 0, lastYac: 0 }, carry: null, runScore: { td: 0, stops: 0, last: '—' }, feedback: null, floaters: [],
    route: 'slant', controlled: 'qb', ctl: { throw: 'qb', run: 'rb', catch: 'wr' }, ai: {},
  };

  function newPlayer(id: string, role: string, x: number, y: number): Player {
    return {
      id, role, x, y, vx: 0, vy: 0, z: 0, facing: Math.PI / 2, sprint: false, boost: 0, boostHold: 0, boostFast: false, squared: false, squareDir: Math.PI / 2,
      plantT: 0, jumpT: -1, diveT: -1, diveDir: 0, diveSpeed: 0, groundT: 0, stick: 0,
      attempt: null, lastAttempt: null, cooldownUntil: 0, wasIn: false, lateUntil: 0, dropPending: false, blockedPass: false,
      lbT: -1, rbT: -1, lbTTap: -9, rbTTap: -9, lbTDbl: false, rbTDbl: false, flickArmed: true, curFlick: null, pitchPending: null, bufferedFlick: null, handTapUndo: null,
      planted: null, stretch: 0, stretchReach: 0, leanDir: Math.PI / 2,
      hand: 'R', handSwitchT: 0, move: null, moveCD: 0, vulnT: 0, reaccelT: 0, spinVis: 0,
      stiffArm: null, stiffHit: false, stunT: 0, tackle: null, tackleCD: 0, punchCD: 0, dove: false,
    };
  }
  function say(text: string, color = '#fff') { st.feedback = { text, color, t: st.t }; }

  function reset() {
    st.floaters = [];
    st.carry = null;
    if (st.mode === 'run') return resetRun();
    if (st.mode === 'catch') return resetCatch();
    st.callAt = null;
    st.players = {};
    st.players.qb = newPlayer('qb', 'QB', FIELD_W / 2, LOS_Y - 5);
    st.players.wr = newPlayer('wr', 'WR', 12, LOS_Y - 0.6);
    if (S.throwModeRB) st.players.hb = addRunState(newPlayer('hb', 'RB', FIELD_W / 2 + S.trailWidth, LOS_Y - 5 - S.trailDepth));
    st.ball = { state: 'held', holder: 'qb', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, throwT: 0, resolved: false, gave: false, power: 0 };
    st.play = { phase: 'pre', t0: st.t, snapT: null, endT: null, autoDelay: 0 };
    st.ai = { wr: { wp: routeWaypoints(st.route), wpi: 0, pressed: false, noise: 0, dove: false, done: false }, qb: { aim: null } };
    st.aimQB = { x: FIELD_W / 2, y: LOS_Y + 12 };
    say(S.requireSnap ? 'SET' : 'SET');
    holdBall();
  }

  function routeWaypoints(name: string): Vec2[] {
    const sx = 12, sy = LOS_Y - 0.6, inn = 1;
    const P = (dx: number, dy: number) => ({ x: sx + dx * inn, y: sy + dy });
    switch (name) {
      case 'go': return [P(0, 50)];
      case 'slant': return [P(0, 3), P(10, 12), P(26, 28)];
      case 'out': return [P(0, 10), P(-9.5, 10)];
      case 'hitch': return [P(0, 6), P(0, 5)];
      case 'curl': return [P(0, 12), P(2.5, 10)];
    }
    return [P(0, 20)];
  }

  function snap() { if (st.play.phase === 'pre') { st.play.phase = 'live'; st.play.snapT = st.t; st.ai.wr.wp = routeWaypoints(st.route); st.ai.wr.wpi = 0; say('HIKE', '#9fe39f'); } }
  function endPlay(result: string) { if (st.play.phase !== 'over') { st.play.phase = 'over'; st.play.endT = st.t; st.play.result = result; } st.stats.last = result; }

  function holdBall() {
    const b = st.ball, p = b.holder ? st.players[b.holder] : undefined;
    if (!p) return;
    if (p.role === 'RB' || p.role === 'TB' || (st.carry && p.id === b.holder && p.role !== 'QB')) {
      const side = p.hand === 'L' ? 1 : -1, k = p.handSwitchT > 0 ? 0.1 : 0.45, f = p.facing + (p.spinVis || 0);
      b.x = p.x + Math.cos(f) * 0.2 - Math.sin(f) * side * k; b.y = p.y + Math.sin(f) * 0.2 + Math.cos(f) * side * k; b.z = 1.25 + p.z;
      b.vx = p.vx; b.vy = p.vy; b.vz = 0; return;
    }
    b.x = p.x + Math.cos(p.facing) * 0.35; b.y = p.y + Math.sin(p.facing) * 0.35; b.z = 1.5 + p.z; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
  }

  function moveTarget(m: number, p: Player) {
    let sp = m <= JOG_TILT ? S.jogSpeed * (m / JOG_TILT) : lerp(S.jogSpeed, S.fullSpeed, (m - JOG_TILT) / (1 - JOG_TILT));
    const fullness = clamp((m - JOG_TILT) / (1 - JOG_TILT), 0, 1);
    sp += p.boost * fullness;
    if (p.squared) sp = Math.min(sp, S.ltSpeedCap);
    return sp;
  }
  function updateMovement(p: Player, inp: SimInput, dt: number) {
    let mx = inp.mx, my = inp.my; const m = Math.min(1, Math.hypot(mx, my)); p.stick = m;
    p.squared = !!inp.lt;
    if (p.role === 'QB') { const aim = st.ball.holder === 'qb' ? (inp.aim || st.aimQB) : null; if (aim) p.squareDir = aim.x >= p.x ? 0 : Math.PI; }
    else p.squareDir = (p.role === 'RB' || p.role === 'TB' || (st.carry && p.id === st.ball.holder)) ? Math.PI / 2 : -Math.PI / 2;

    if (p.jumpT >= 0) { p.jumpT += dt; const u = p.jumpT / (p.jumpDur || S.jumpDuration); if (u >= 1) { p.jumpT = -1; p.z = 0; } else p.z = 4 * (p.jumpH || S.jumpHeight) * u * (1 - u); }

    if (p.groundT > 0) {
      p.groundT -= dt; const sp = Math.hypot(p.vx, p.vy), ns = Math.max(0, sp - 25 * dt);
      if (sp > 0) { p.vx *= ns / sp; p.vy *= ns / sp; }
    } else if (p.diveT >= 0) {
      p.diveT += dt; p.vx = Math.cos(p.diveDir) * p.diveSpeed; p.vy = Math.sin(p.diveDir) * p.diveSpeed; p.facing = p.diveDir;
      if (p.diveT >= S.diveDuration) { p.diveT = -1; p.groundT = p.diveRec ?? S.diveRecovery; p.vx *= 0.3; p.vy *= 0.3; }
    } else if (p.planted) {
      p.vx = 0; p.vy = 0; p.x = p.planted.x; p.y = p.planted.y;
    } else if (p.move && p.move.type === 'spin') {
      // spin owns the velocity (see applyMove)
    } else if (p.plantT > 0) {
      p.plantT -= dt; p.vx = 0; p.vy = 0;
    } else if (p.z > 0) {
      // airborne: no traction
    } else {
      const maxBoost = Math.max(0, S.sprintMaxSpeed - S.fullSpeed);
      let sp = Math.hypot(p.vx, p.vy);
      if (inp.sprint && m > 0.3 && !p.squared) { p.boost = Math.min(maxBoost, p.boost + S.boostPerPump); p.boostHold = S.boostHoldDelay; }
      let cutting = false;
      if (m > 0.001 && sp > 1) { const a = Math.acos(clamp((p.vx * mx + p.vy * my) / (sp * m), -1, 1)); cutting = a > rad(S.cutDecayAngleDeg); }
      p.boostFast = cutting || m < S.easeOffStick || p.squared;
      if (p.boostFast) p.boostHold = 0;
      if (p.boostHold > 0) p.boostHold -= dt;
      else if (p.boost > 0) p.boost = Math.max(0, p.boost - S.boostDecayRate * (p.boostFast ? S.cutDecayMult : 1) * dt);
      p.sprint = p.boost > 0.01;
      const boostFrac = maxBoost > 0 ? p.boost / maxBoost : 0;
      const sm = 1 - (1 - S.sprintAccelMult) * boostFrac;
      const am = p.reaccelT > st.t ? S.jukeReaccelMult : 1;
      if (m <= 0.001) {
        sp = Math.max(0, sp - S.releaseDecel * sm * dt);
        const cs = Math.hypot(p.vx, p.vy); if (cs > 0) { p.vx *= sp / cs; p.vy *= sp / cs; }
      } else {
        const dx = mx / m, dy = my / m, target = moveTarget(m, p);
        if (sp < 0.35) {
          sp = Math.min(target, sp + S.accel * sm * am * dt); p.vx = dx * sp; p.vy = dy * sp;
        } else {
          let cx = p.vx / sp, cy = p.vy / sp;
          const ang = Math.atan2(cx * dy - cy * dx, cx * dx + cy * dy), absA = Math.abs(ang);
          if (absA > rad(S.reverseAngleDeg)) {
            sp = Math.max(0, sp - S.decel * sm * dt);
            if (sp < 0.6) { cx = dx; cy = dy; }
          } else {
            const ratio = sp / S.fullSpeed;
            const turnRate = S.turnRate * Math.sqrt(sm) / (1 + S.cutPenalty * ratio * ratio);
            const turn = Math.sign(ang) * Math.min(absA, turnRate * dt);
            const c = Math.cos(turn), s = Math.sin(turn);
            const nx = cx * c - cy * s, ny = cx * s + cy * c; cx = nx; cy = ny;
            sp *= Math.max(0, 1 - S.cutBleed * Math.abs(turn) * ratio * (1 + 0.3 * boostFrac));
            if (sp < target) sp = Math.min(target, sp + S.accel * sm * am * dt);
            else sp = Math.max(target, sp - S.decel * sm * dt);
          }
          p.vx = cx * sp; p.vy = cy * sp;
        }
      }
    }
    p.x = clamp(p.x + p.vx * dt, -4, FIELD_W + 4);
    p.y = clamp(p.y + p.vy * dt, -2, FIELD_L + 2);

    if (p.diveT < 0 && p.groundT <= 0 && !p.planted) {
      const sp = Math.hypot(p.vx, p.vy); let tf: number | null = null;
      if (p.squared) tf = p.squareDir; else if (sp > 0.5) tf = Math.atan2(p.vy, p.vx); else if (m > 0.05) tf = Math.atan2(my, mx);
      if (tf !== null) p.facing = wrapAngle(approachAngle(p.facing, tf, (p.squared ? 28 : S.facingTurnRate) * dt));
    }

    const groundedNow = p.z <= 0 && p.diveT < 0 && p.groundT <= 0;
    if (inp.rb && groundedNow) { p.vx = 0; p.vy = 0; p.plantT = S.plantLockout; p.sprint = false; p.boost = 0; p.boostHold = 0; }
    if (inp.a && groundedNow && p.plantT <= 0) { p.jumpT = 0; }
    if (inp.x && groundedNow) {
      p.diveT = 0; p.diveDir = m > 0.2 ? Math.atan2(my, mx) : p.facing;
      p.diveSpeed = Math.max(Math.hypot(p.vx, p.vy), S.diveDistance / S.diveDuration); p.sprint = false; p.boost = 0; p.boostHold = 0;
    }
  }

  function solveThrow(from: Vec2 & { z: number }, tgt: Vec2, power: number, stepMult = 1): ThrowSolution {
    const dx = tgt.x - from.x, dy = tgt.y - from.y, d = Math.max(0.5, Math.hypot(dx, dy)), ux = dx / d, uy = dy / d;
    const h = from.z - CATCH_H, thMax = rad(S.maxLoftDeg), thMin = rad(S.minLoftDeg);
    const vLoft = speedForAngle(d, h, thMax);
    let v = clamp(lerp(Math.min(vLoft, S.maxThrowSpeed), S.maxThrowSpeed, power), S.minThrowSpeed, S.maxThrowSpeed) * stepMult;
    let th = lowAngle(v, d, h);
    if (th === null) th = Math.min(thMax, rad(45));
    else if (th < thMin) { th = thMin; v = speedForAngle(d, h, thMin); }
    else if (th > thMax) th = thMax;
    return { vx: ux * v * Math.cos(th), vy: uy * v * Math.cos(th), vz: v * Math.sin(th), v, th };
  }
  function predictArc(x: number, y: number, z: number, vx: number, vy: number, vz: number, t0: number): ArcPoint[] {
    const pts: ArcPoint[] = []; const dt = 1 / 60;
    for (let i = 0; i < 480; i++) {
      const t = i * dt; const pz = z + vz * t - 0.5 * GRAV * t * t;
      pts.push({ x: x + vx * t, y: y + vy * t, z: Math.max(0, pz), t: t0 + t });
      if (pz <= 0) break;
    }
    return pts;
  }
  function releasePoint(qb: Player) { return { x: qb.x + Math.cos(qb.facing) * 0.3, y: qb.y + Math.sin(qb.facing) * 0.3, z: RELEASE_H + qb.z }; }
  function stepFactor(qb: Player, tgt: Vec2) {
    const dx = tgt.x - qb.x, dy = tgt.y - qb.y, d = Math.hypot(dx, dy) || 1;
    const f = clamp((qb.vx * dx + qb.vy * dy) / d / S.fullSpeed, -1, 1);
    return f >= 0 ? { f, mult: 1 + S.stepIntoBonus * f, err: 1 - 0.5 * f } : { f, mult: 1 - S.backFootPenalty * -f, err: 1 + 1.5 * -f };
  }
  function previewThrow(power: number, tgt: Vec2) {
    const qb = st.players.qb, from = releasePoint(qb), sf = stepFactor(qb, tgt);
    const sol = solveThrow(from, tgt, power, sf.mult);
    return { arc: predictArc(from.x, from.y, from.z, sol.vx, sol.vy, sol.vz, st.t), sol, step: sf };
  }
  function doThrow(tgt: Vec2, power: number, useError: boolean) {
    const qb = st.players.qb, b = st.ball;
    if (b.holder !== 'qb' || st.play.phase === 'over') return;
    snap();
    const sf = stepFactor(qb, tgt), from = releasePoint(qb);
    const dist = Math.hypot(tgt.x - qb.x, tgt.y - qb.y);
    const err = useError ? S.baseInaccuracy * (dist / 20) * sf.err * (qb.squared ? 1 : S.unsquaredInaccuracy) : 0;
    const aimed = { x: tgt.x + gauss() * err, y: tgt.y + gauss() * err };
    const sol = solveThrow(from, aimed, power, sf.mult);
    Object.assign(b, { state: 'air', holder: null, x: from.x, y: from.y, z: from.z, vx: sol.vx, vy: sol.vy, vz: sol.vz, throwT: st.t, resolved: false, gave: false, power, aimed: { ...tgt } });
    b.arc = predictArc(b.x, b.y, b.z, b.vx, b.vy, b.vz, st.t); b.landing = b.arc[b.arc.length - 1];
    st.stats.att++; st.callAt = null;
    const kind = power > 0.66 ? 'BULLET' : power < 0.33 ? 'LOFT' : 'TOUCH';
    say(`${kind}${sf.f > 0.25 ? ' · stepped in' : sf.f < -0.25 ? ' · back foot' : ''}`, '#cfe');
    const w = st.players.wr; w.wasIn = false; w.lateUntil = 0; w.dropPending = false; w.blockedPass = false; w.lastAttempt = null;
    st.ai.wr.pressed = false; st.ai.wr.dove = false; st.ai.wr.cp = null; st.ai.wr.pressAt = null; st.ai.wr.noise = gauss() * S.aiTimingErrorMs / 1000;
  }
  function flightTimeTo(h0: number, vz: number, h1: number) { const disc = vz * vz + 2 * GRAV * (h0 - h1); return disc < 0 ? 1 : (vz + Math.sqrt(disc)) / GRAV; }
  function aiQBThrow() {
    const qb = st.players.qb, r = st.players.wr; let tf = 1, tgt = { x: r.x, y: r.y };
    for (let i = 0; i < 5; i++) {
      tgt = { x: clamp(r.x + r.vx * tf, 1, FIELD_W - 1), y: clamp(r.y + r.vy * tf, 0, FIELD_L) };
      const sol = solveThrow(releasePoint(qb), tgt, 0.55, 1); tf = flightTimeTo(RELEASE_H, sol.vz, CATCH_H);
    }
    doThrow(tgt, 0.55, true);
  }

  function handPos(p: Player): Vec2 {
    if (p.planted) { const r = 0.3 + p.stretchReach; return { x: p.planted.x + Math.cos(p.leanDir) * r, y: p.planted.y + Math.sin(p.leanDir) * r }; }
    const ext = p.diveT >= 0 ? 0.8 : 0.3; return { x: p.x + Math.cos(p.facing) * ext, y: p.y + Math.sin(p.facing) * ext };
  }
  function reachInfo(p: Player, radius: number) {
    const h = handPos(p);
    if (p.diveT >= 0) return { h, r: radius + S.diveReachBonus, zMin: 0, zMax: 1.3 };
    if (p.groundT > 0) return { h, r: radius, zMin: 0, zMax: 0.9 };
    return { h, r: radius, zMin: 0.15, zMax: S.reachHeight + p.z };
  }
  function inReach(p: Player, bx: number, by: number, bz: number, radius: number) {
    const ri = reachInfo(p, radius);
    return Math.hypot(bx - ri.h.x, by - ri.h.y) <= ri.r && bz >= ri.zMin && bz <= ri.zMax;
  }
  function startAttempt(p: Player, type: 'two' | 'one' | 'bat') {
    if (st.t < p.cooldownUntil) return;
    const b = st.ball;
    if (type !== 'bat' && p.lateUntil > st.t && b.state === 'air' && !b.resolved) {
      p.lateUntil = 0; p.dropPending = false; say('LATE', '#ffd54a'); b.gave = true; st.stats.last = 'LATE';
    }
    let win: number, radius: number;
    if (type === 'two') { win = (S.catchWindowMs + (p.squared ? S.ltWindowBonusMs : 0)) / 1000; radius = S.catchReach; }
    else if (type === 'one') { win = S.oneHandWindowMs / 1000; radius = S.oneHandReach; }
    else { win = 0.15; radius = S.batReach; }
    p.attempt = { type, t0: st.t, win, radius };
    p.cooldownUntil = st.t + win + 0.2;
  }
  function catchUpdate(p: Player) {
    const b = st.ball, t = st.t;
    const a = p.attempt;
    if (a && t > a.t0 + a.win) { p.lastAttempt = a; p.attempt = null; }
    if (b.state !== 'air' || b.resolved || b.pitch) return;
    if (p.attempt && !p.blockedPass && inReach(p, b.x, b.y, b.z, p.attempt.radius)) {
      const type = p.attempt.type; p.attempt = null;
      if (type === 'bat') {
        b.vx *= 0.15; b.vy *= 0.15; b.vz = -7; b.resolved = true; b.gave = true; say('BATTED', '#ffab40'); endPlay('BATTED'); return;
      }
      if (type === 'one' && rng.random() > S.oneHandSuccess) {
        b.vx = b.vx * 0.25 + gauss(); b.vy = b.vy * 0.25 + gauss(); b.vz = 2.5; b.resolved = true; b.gave = true;
        say('DROP (one-hand)', '#ff5252'); st.stats.last = 'DROP'; return;
      }
      const fx = p.planted ? p.planted.x : p.x, fy = p.planted ? p.planted.y : p.y;
      if (fx < 0 || fx > FIELD_W || fy > FIELD_L) {
        b.resolved = true; b.gave = true; b.vx *= 0.3; b.vy *= 0.3; st.stats.last = 'OUT OF BOUNDS';
        say('OUT OF BOUNDS — INCOMPLETE', '#bbb'); floatText('OUT OF BOUNDS', p.x, p.y, '#bbb'); return;
      }
      b.state = 'held'; b.holder = p.id; b.resolved = true; b.gave = true; st.stats.comp++;
      if (p.planted) floatText('TOE-TAP CATCH!', p.x, p.y, '#69f0ae');
      say(p.planted ? 'TOE-TAP CATCH!' : type === 'one' ? 'ONE-HAND CATCH!' : (p.diveT >= 0 || p.groundT > 0) ? 'DIVING CATCH!' : p.z > 0.05 ? 'HIGH-POINT CATCH!' : 'CATCH', '#69f0ae');
      beginCarry(p); return;
    }
    const nowIn = inReach(p, b.x, b.y, b.z, S.catchReach);
    if (nowIn && !p.wasIn) {
      const la = p.lastAttempt;
      if (!p.attempt && la && la.type !== 'bat' && t - (la.t0 + la.win) < 0.45) { say('EARLY', '#ffd54a'); b.gave = true; p.blockedPass = true; st.stats.last = 'EARLY'; }
    }
    if (!nowIn && p.wasIn) { p.blockedPass = false; if (!b.gave) { p.lateUntil = t + 0.35; p.dropPending = true; } }
    if (p.dropPending && t > p.lateUntil) { p.dropPending = false; if (!b.gave) { say('DROP', '#ff5252'); b.gave = true; st.stats.last = 'DROP'; } }
    p.wasIn = nowIn;
  }

  function speedToMag(v: number) { return v <= S.jogSpeed ? (v / S.jogSpeed) * JOG_TILT : clamp(JOG_TILT + (v - S.jogSpeed) / (S.fullSpeed - S.jogSpeed) * (1 - JOG_TILT), 0, 1); }
  function aiPump(ai: AiBag) { if (st.t - (ai.pumpT || 0) > AI_PUMP_INTERVAL) { ai.pumpT = st.t; return true; } return false; }
  function aiReceiver(p: Player): SimInput {
    const inp = blankInput(), ai = st.ai.wr, b = st.ball, t = st.t;
    if (st.play.phase === 'pre') return inp;
    if (b.state === 'air' && !b.resolved && b.arc.length) {
      if (!ai.cp || t - (ai.cpT || 0) > 0.15) {
        ai.cp = null; ai.cpT = t;
        for (const pt of b.arc) {
          if (pt.t < t + 0.05 || pt.z > S.reachHeight - 0.3 || pt.z < 0.4) continue;
          const d = Math.hypot(pt.x - p.x, pt.y - p.y);
          const need = d < 0.6 ? 0 : 0.15 + d / (d > 6 ? S.sprintMaxSpeed * 0.9 : S.fullSpeed * 0.85);
          ai.cp = pt; if (need <= pt.t - t) break;
        }
      }
      const cp = ai.cp;
      if (cp) {
        const dx = cp.x - p.x, dy = cp.y - p.y, d = Math.hypot(dx, dy), left = Math.max(0.05, cp.t - t);
        const want = d / left;
        if (d > 0.35) {
          const mag = want > S.fullSpeed * 0.9 ? 1 : clamp(speedToMag(want * 1.3 + 1), 0.3, 1);
          inp.mx = dx / d * mag; inp.my = dy / d * mag; inp.sprint = want > S.fullSpeed && aiPump(ai);
        }
        if (d < 1.5 && left > 0.25) inp.lt = true;
        if (!ai.dove && left < 0.3 && d > S.catchReach + 0.4 && d < S.catchReach + S.diveReachBonus + S.diveDistance * 0.7) { inp.x = true; ai.dove = true; inp.mx = dx / d; inp.my = dy / d; }
      }
      if (!ai.pressed) {
        let te: number | null = null; const lt = inp.lt || p.squared;
        for (const pt of b.arc) {
          if (pt.t < t) continue; const ahead = pt.t - t; if (ahead > 1.2) break;
          const k = Math.min(ahead, 0.25);
          const ghost = { ...p, x: p.x + p.vx * k, y: p.y + p.vy * k };
          if (inReach(ghost, pt.x, pt.y, pt.z, S.catchReach)) { te = ahead; break; }
        }
        const win = (S.catchWindowMs + (lt ? S.ltWindowBonusMs : 0)) / 1000;
        if (te !== null && te > 0.02) ai.pressAt = t + te - (win * 0.3 + (ai.noise || 0));
        else if (te !== null && ai.pressAt == null) ai.pressAt = t;
        if (ai.pressAt != null && t >= ai.pressAt) { inp.y = true; ai.pressed = true; }
      }
      return inp;
    }
    if (b.holder === 'wr') { inp.my = 1; return inp; }
    if (st.play.phase !== 'live') return inp;
    const wp = ai.wp && ai.wpi != null ? ai.wp[ai.wpi] : undefined;
    if (!wp) { if (st.route === 'hitch' || st.route === 'curl') inp.lt = true; return inp; }
    const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
    if (d < 0.7) { ai.wpi = (ai.wpi || 0) + 1; return aiReceiver(p); }
    const last = ai.wpi === (ai.wp?.length ?? 0) - 1, settle = last && (st.route === 'hitch' || st.route === 'curl');
    const mag = settle ? clamp(d / 3, 0.3, 1) : 1;
    inp.mx = dx / d * mag; inp.my = dy / d * mag; inp.sprint = st.route === 'go' && aiPump(ai);
    return inp;
  }
  function aiQB(): SimInput {
    const inp = blankInput();
    if (st.ball.holder === 'qb') { inp.lt = true; st.aimQB = { x: st.players.wr.x, y: st.players.wr.y }; inp.aim = st.aimQB; }
    return inp;
  }

  function ballUpdate(dt: number) {
    const b = st.ball;
    if (b.state === 'held') { holdBall(); return; }
    if (b.state === 'rest') return;
    b.vz -= GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z <= 0.12) {
      b.z = 0.12;
      if (b.state === 'air') {
        b.state = 'dead';
        const w = st.players.wr;
        if (w && (w.wasIn || w.dropPending) && !b.gave) { say('DROP', '#ff5252'); b.gave = true; st.stats.last = 'DROP'; w.dropPending = false; }
        b.resolved = true;
      }
      if (Math.abs(b.vz) < 1.2) { b.vz = 0; b.vx *= 0.9; b.vy *= 0.9; if (Math.hypot(b.vx, b.vy) < 0.3) b.state = 'rest'; }
      else { b.vz = -b.vz * 0.35; b.vx *= 0.5; b.vy *= 0.5; }
    }
  }

  function step(dt: number, human?: SimInput | null) {
    st.t += dt;
    if (st.mode === 'run') return stepRun(dt, human);
    if (st.mode === 'catch') return stepCatch(dt, human);
    if (st.carry) return stepAfterCatch(dt, human);
    const ctl = st.controlled, other = ctl === 'qb' ? 'wr' : 'qb';
    const inputs: Record<string, SimInput> = { [ctl]: human || blankInput() };
    inputs[other] = other === 'wr' ? aiReceiver(st.players.wr) : aiQB();
    let hi = inputs[ctl];
    if (S.requireSnap) {
      if (st.play.phase === 'pre') {
        const go = hi.a; inputs.qb = blankInput(); inputs.wr = blankInput(); hi = inputs[ctl];
        if (go) snap();
      }
    } else {
      if (hi.mx || hi.my || hi.throwPower !== null || hi.start) snap();
      if (st.play.phase === 'pre' && st.t - st.play.t0 > 0.8) snap();
    }
    if (ctl === 'wr' && hi.y && st.ball.holder === 'qb' && st.play.phase === 'live') callForBall(st.players.wr, () => { st.callAt = st.t + S.callReactionDelay; });
    if (ctl === 'qb' && hi.aim) st.aimQB = hi.aim;

    const qb = st.players.qb, w0 = st.players.wr, hb = st.players.hb;
    flickCheck(qb, inputs.qb, false); shoulderButtons(qb, inputs.qb, { hands: false, stiff: false }); pitchUpdate(qb, false);
    plantStretch(w0, inputs.wr);
    updateMovement(qb, { ...inputs.qb, rb: false }, dt);
    updateMovement(w0, { ...inputs.wr, rb: false }, dt);
    if (hb) updateMovement(hb, { ...(st.play.phase === 'pre' ? blankInput() : aiPitchBack(hb, qb, -1)), rb: false }, dt);

    if (st.ball.holder === 'qb') {
      if (ctl === 'qb' && hi.throwPower !== null) doThrow(st.aimQB || { x: qb.x, y: qb.y + 12 }, hi.throwPower, true);
      else if (ctl === 'wr' && st.play.phase === 'live' && st.play.snapT != null && (hi.start || st.t - st.play.snapT > S.autoThrowDelay || (st.callAt != null && st.t >= st.callAt))) aiQBThrow();
    }
    const wi = inputs.wr, w = st.players.wr;
    const airNow = st.ball.state === 'air';
    if (wi.y && airNow) startAttempt(w, 'two'); else if (wi.rt && airNow) startAttempt(w, 'one'); else if (wi.b) startAttempt(w, 'bat');
    ballUpdate(dt);
    const b = st.ball;
    if (b.pitch) { pitchCatchCheck(); looseBallCheck(); }
    else catchUpdate(w);
    st.floaters = st.floaters.filter(f => st.t - f.t < 1.3);
    if (!b.pitch && b.state !== 'air' && b.state !== 'held' && b.resolved && st.play.phase !== 'over') {
      if (!b.gave) say('INCOMPLETE', '#bbb');
      endPlay(b.gave && st.stats.last !== '—' && st.stats.last !== 'CATCH' ? st.stats.last : 'INCOMPLETE');
    }
    if (S.autoReset && st.play.phase === 'over' && st.play.endT != null && st.t - st.play.endT > (st.play.result === 'CATCH' ? 3.5 : 2.2)) reset();
  }

  function bandRange(k: string) { return catchBandRange(S, k); }
  function callForBall(p: Player, onCall: () => void) {
    if (st.t < (p.callCD || 0)) return false;
    p.callCD = st.t + S.callCooldown; p.callT = st.t; st.lastCall = st.t;
    floatText('HEY!', p.x, p.y, '#ffeb3b'); onCall(); return true;
  }
  function resetCatch() {
    st.players = { qb: newPlayer('qb', 'QB', FIELD_W / 2, 38), wr: newPlayer('wr', 'WR', FIELD_W / 2, 52) };
    st.ball = { state: 'held', holder: 'qb', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, throwT: 0, resolved: false, gave: false, power: 0 };
    st.play = { phase: 'live', t0: st.t, snapT: st.t, endT: null };
    st.ai = { wr: { wp: [], wpi: 0, pressed: false, noise: 0, dove: false }, qb: {} };
    if (!st.cm) st.cm = { band: 'short', count: 0, log: [], stats: { att: 0, comp: 0, streak: 0, best: 0, last: '—', yacTotal: 0, bands: { short: { a: 0, c: 0 }, medium: { a: 0, c: 0 }, deep: { a: 0, c: 0 } } }, phase: 'wait', nextT: 0, readyT: 0, windupStart: 0, windupEnd: 0, plan: null, cur: null };
    Object.assign(st.cm, { phase: 'wait', nextT: st.t + 1, readyT: st.t + 0.3, windupStart: 0, windupEnd: 0, plan: null, cur: null });
    say('CATCH MODE', '#9fe39f'); holdBall();
  }
  function beginCatchWindup(dur: number, called: boolean) {
    const cm = st.cm, qb = st.players.qb, w = st.players.wr, b = st.ball;
    if (!cm) return;
    const [lo, hi] = bandRange(cm.band), maxR = 0.95 * S.maxThrowSpeed * S.maxThrowSpeed / GRAV;
    const d = Math.min(lo + rng.random() * (hi - lo), maxR);
    const lob = rng.random() < S.catchLobShare;
    const px = w.x + w.vx * (dur + 0.8), py = w.y + w.vy * (dur + 0.8);
    let a = (rng.random() - 0.5) * rad(60);
    const qx = clamp(px - d * Math.sin(a), 3, FIELD_W - 3); a = Math.asin(clamp((px - qx) / d, -1, 1));
    const qy = clamp(py - d * Math.cos(a), 1, FIELD_L - 1);
    Object.assign(qb, { x: qx, y: qy, vx: 0, vy: 0 }); qb.facing = Math.atan2(py - qy, px - qx);
    Object.assign(b, { state: 'held', holder: 'qb', arc: [], landing: null, aimed: null, resolved: false, gave: false }); holdBall();
    cm.plan = { d, lob, power: lob ? rng.random() * 0.2 : 0.8 + rng.random() * 0.2, sideline: rng.random() < S.catchSidelineShare, called: !!called };
    cm.phase = 'windup'; cm.windupStart = st.t; cm.windupEnd = st.t + dur;
  }
  function onBand(qb: Player, base: Vec2, d: number, sideline: boolean): Vec2 {
    const dx = base.x - qb.x, dy = base.y - qb.y; const m = Math.hypot(dx, dy) || 1;
    let tx = qb.x + dx / m * d;
    if (sideline) tx = tx < FIELD_W / 2 ? 0.5 + rng.random() * 0.8 : FIELD_W - 0.5 - rng.random() * 0.8;
    tx = clamp(tx, 0.4, FIELD_W - 0.4);
    tx = clamp(tx, qb.x - d * 0.98, qb.x + d * 0.98);
    const ty = qb.y + Math.sqrt(Math.max(0, d * d - (tx - qb.x) ** 2)) * (dy >= -0.01 || qb.y > FIELD_L - 5 ? 1 : -1);
    return { x: tx, y: Math.min(ty, FIELD_L - 0.5) };
  }
  function releaseCatchThrow() {
    const cm = st.cm, qb = st.players.qb, w = st.players.wr;
    if (!cm || !cm.plan) return;
    const pl = cm.plan, from = releasePoint(qb);
    const sp = Math.hypot(w.vx, w.vy); let tgt: Vec2;
    if (sp > 1) {
      let tf = 1;
      tgt = { x: w.x, y: w.y };
      for (let i = 0; i < 6; i++) { tgt = onBand(qb, { x: w.x + w.vx * tf, y: w.y + w.vy * tf }, pl.d, pl.sideline); tf = flightTimeTo(from.z, solveThrow(from, tgt, pl.power, 1).vz, CATCH_H); }
    } else {
      const r = rng.random(), o = 3 + rng.random() * 4;
      const base = r < 0.33 ? { x: w.x - o, y: w.y } : r < 0.66 ? { x: w.x + o, y: w.y } : { x: w.x, y: w.y + o };
      tgt = onBand(qb, base, pl.d, pl.sideline);
    }
    st.stats.last = '—'; st.play.phase = 'live';
    doThrow(tgt, pl.power, false);
    const b = st.ball;
    let land = b.landing; for (let i = 1; i < b.arc.length; i++) if (b.arc[i].z <= CATCH_H && b.arc[i - 1].z > CATCH_H) { land = b.arc[i]; break; }
    cm.count++;
    cm.cur = {
      band: cm.band, n: cm.count, d: +Math.hypot(tgt.x - qb.x, tgt.y - qb.y).toFixed(2), lob: pl.lob, speed: +Math.hypot(b.vx, b.vy, b.vz).toFixed(1),
      loftDeg: +(Math.atan2(b.vz, Math.hypot(b.vx, b.vy)) * 180 / Math.PI).toFixed(1), tgt: { x: +tgt.x.toFixed(2), y: +tgt.y.toFixed(2) },
      landErr: land ? +Math.hypot(land.x - tgt.x, land.y - tgt.y).toFixed(2) : 0, called: pl.called, sideline: pl.sideline, t: st.t,
    };
    say((pl.lob ? 'LOB' : 'BULLET') + ` · ${cm.band.toUpperCase()} ${cm.cur.d.toFixed(0)} yd`, '#cfe');
    cm.phase = 'air';
  }
  function finishCatchRep(carryResult?: string) {
    const cm = st.cm, b = st.ball, w = st.players.wr;
    if (!cm) return;
    if (cm.cur) {
      const c = cm.cur, S2 = cm.stats;
      const caught = !!carryResult || b.holder === 'wr' || b.holder === 'hb';
      let r = carryResult || (caught ? 'CATCH' : st.stats.last);
      if (r === 'OUT OF BOUNDS') r = 'OUT';
      else if (!carryResult && !caught && !['DROP', 'EARLY', 'LATE', 'BATTED'].includes(r)) {
        const qb = st.players.qb, ux = c.tgt.x - qb.x, uy = c.tgt.y - qb.y, m = Math.hypot(ux, uy) || 1;
        r = ((b.x - w.x) * ux + (b.y - w.y) * uy) / m > 0 ? 'OVERTHROWN' : 'INCOMPLETE';
      }
      S2.att++; S2.bands[c.band].a++;
      if (carryResult || caught) {
        S2.comp++; S2.bands[c.band].c++; S2.streak++; S2.best = Math.max(S2.best, S2.streak);
        c.yac = st.carry ? +st.carry.yac.toFixed(2) : 0;
        S2.yacTotal += c.yac;
      } else S2.streak = 0;
      S2.last = r; c.result = r; cm.log.push(c);
      st.stats.last = r;
      if (r !== 'CATCH') say(r, r === 'OUT' || r === 'OVERTHROWN' || r === 'INCOMPLETE' ? '#bbb' : r === 'TOUCHDOWN' || r === 'TARGET' ? '#69f0ae' : '#ff5252');
    }
    st.carry = null;
    delete st.players.df;
    st.play.phase = 'live';
    cm.phase = 'wait'; cm.nextT = st.t + S.catchInterval; cm.readyT = st.t + 0.5;
    if (cm.count >= S.catchThrowsPerBand) {
      cm.count = 0; const i = BANDS.indexOf(cm.band);
      cm.band = S.catchCycleBands ? BANDS[(i + 1) % 3] : BANDS.filter(k => k !== cm.band)[rng.random() < 0.5 ? 0 : 1];
      floatText('NEXT: ' + cm.band.toUpperCase(), w.x, w.y + 2, '#80deea');
    }
  }
  function stepCatch(dt: number, human?: SimInput | null) {
    const cm = st.cm, qb = st.players.qb, w = st.players.wr, b = st.ball;
    if (!cm) return;
    st.controlled = 'wr';
    if (cm.phase === 'carry') return stepAfterCatch(dt, human);
    let wi = human || blankInput();
    const aiMode = S.catchAIReceiver;
    if (aiMode && b.state === 'air') wi = aiReceiver(w);
    const phase = () => st.cm?.phase;
    if (phase() === 'wait' && !S.catchPaused) {
      const call = !aiMode && wi.y && st.t >= cm.readyT && callForBall(w, () => {});
      if (call) beginCatchWindup(S.callReactionDelay, true);
      else if ((S.requireSnap && !aiMode) ? (wi.a && st.t >= cm.readyT) : st.t >= cm.nextT) beginCatchWindup(S.catchWindup, false);
      if (phase() === 'windup') wi = { ...wi, a: false };
    } else if (phase() === 'windup') {
      qb.facing = Math.atan2(w.y - qb.y, w.x - qb.x);
      if (st.t >= cm.windupEnd) releaseCatchThrow();
    }
    plantStretch(w, wi);
    updateMovement(w, { ...wi, rb: false }, dt);
    updateMovement(qb, blankInput(), dt);
    const airNow = b.state === 'air';
    if (wi.y && airNow) startAttempt(w, 'two'); else if (wi.rt && airNow) startAttempt(w, 'one'); else if (wi.b && airNow) startAttempt(w, 'bat');
    ballUpdate(dt);
    catchUpdate(w);
    if (cm.phase === 'air' && b.state !== 'air' && b.resolved && !st.carry) finishCatchRep();
    st.floaters = st.floaters.filter(f => st.t - f.t < 1.3);
  }

  function floatText(text: string, x: number, y: number, color = '#fff') { st.floaters.push({ text, x, y, t: st.t, color }); }
  function addRunState(p: Player) {
    return Object.assign(p, {
      hand: 'R' as const, handSwitchT: 0, move: null, moveCD: 0, flickArmed: true, vulnT: 0, reaccelT: 0, spinVis: 0,
      stiffArm: null, stiffHit: false, stunT: 0, tackle: null, tackleCD: 0, punchCD: 0, dove: false,
    });
  }
  function resetRun() {
    const cx = FIELD_W / 2 + (rng.random() - 0.5) * 12, cy = GOAL_Y - S.runStartDist;
    st.players = {
      rb: addRunState(newPlayer('rb', 'RB', cx, cy)),
      df: addRunState(newPlayer('df', 'DF', clamp(cx + (rng.random() - 0.5) * 16, 6, FIELD_W - 6), cy + S.runDefenderGap)),
    };
    st.players.df.facing = -Math.PI / 2;
    st.trailSide = cx > FIELD_W / 2 ? 1 : -1;
    if (S.trailingBack) st.players.tb = addRunState(newPlayer('tb', 'TB', cx - st.trailSide * S.trailWidth, cy - S.trailDepth));
    st.pendingSwap = null;
    st.ball = { state: 'held', holder: 'rb', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, arc: [], landing: null, aimed: null, throwT: 0, resolved: false, gave: false, power: 0 };
    st.play = { phase: 'pre', t0: st.t, snapT: null, endT: null };
    st.ai = { rb: { moveDone: false, hurdled: false, pumpT: 0, switchT: -9, tap: null, holdArm: null, holdUntil: 0 }, df: { seen: null, seenT: -9, pumpT: 0 } };
    say('READY'); holdBall();
  }
  function setMode(m: ModeId) {
    st.ctl[st.mode] = st.controlled;
    st.mode = m; st.controlled = st.ctl[m]; reset();
  }
  const isGrounded = (p: Player) => p.z <= 0 && p.diveT < 0 && p.groundT <= 0;
  function runDir(p: Player) { const sp = Math.hypot(p.vx, p.vy); return sp > 1 ? Math.atan2(p.vy, p.vx) : p.facing; }
  function relSide(p: Player, q: Player) { const fx = Math.cos(p.facing), fy = Math.sin(p.facing); return (fx * (q.y - p.y) - fy * (q.x - p.x)) >= 0 ? 1 : -1; }
  function sprintFrac(p: Player) { return clamp(p.boost / Math.max(0.05, S.boostPerPump), 0, 1); }

  function startMove(p: Player, type: Move['type'], side: number) {
    const dir = runDir(p), sf = sprintFrac(p);
    const m: Move = { type, t0: st.t, side, dir, lat: { x: -Math.sin(dir) * side, y: Math.cos(dir) * side }, dur: 0.2, dist: 0, sf };
    const sp = Math.hypot(p.vx, p.vy);
    if (type === 'sidestep') {
      m.dur = S.sidestepTime; m.dist = lerp(S.sidestepNormal, S.sidestepSprint, sf);
      const nd = dir + rad(lerp(S.sidestepAngleNormal, S.sidestepAngleSprint, sf)) * side;
      if (sp > 0.5) { p.vx = Math.cos(nd) * sp; p.vy = Math.sin(nd) * sp; }
    } else if (type === 'truck') {
      m.dur = S.truckDuration; p.vx = Math.cos(dir) * (sp + S.truckBurst); p.vy = Math.sin(dir) * (sp + S.truckBurst);
    } else if (type === 'spin') {
      m.dur = S.spinDuration; m.sp0 = sp; m.v0 = { x: p.vx, y: p.vy };
    } else if (type === 'juke') {
      m.dur = S.jukeHopTime; m.dist = S.jukeBackstep; p.vx = 0; p.vy = 0; p.boost = 0; p.boostHold = 0;
    }
    p.move = m; p.moveCD = st.t + m.dur + S.flickCooldown;
    const label = type === 'sidestep' ? 'SIDESTEP' : type.toUpperCase();
    floatText(label, p.x, p.y, MOVE_COLORS[label]);
    st.lastMove = { type, side, t: st.t, sf: +sf.toFixed(2), dist: m.dist, x0: p.x, y0: p.y };
  }
  function applyMove(p: Player, dt: number) {
    const m = p.move; if (!m) return;
    const u = (st.t - m.t0) / m.dur, k = m.dist * dt / m.dur;
    if (m.type === 'sidestep') { p.x += m.lat.x * k; p.y += m.lat.y * k; }
    if (m.type === 'spin') {
      const uu = clamp((st.t - m.t0 + dt) / m.dur, 0, 1), turn = m.side * rad(S.spinMomentumAngle);
      const head = m.dir + turn * uu, diag = m.dir + turn, sp = (m.sp0 || 0) * S.spinSpeedKeep;
      p.vx = Math.cos(head) * sp + Math.cos(diag) * S.spinDrift; p.vy = Math.sin(head) * sp + Math.sin(diag) * S.spinDrift;
      if (uu >= 1) st.lastSpin = { side: m.side, before: m.v0, after: { x: p.vx, y: p.vy } };
    }
    if (m.type === 'juke') { p.x -= Math.cos(m.dir) * k; p.y -= Math.sin(m.dir) * k; p.vx = 0; p.vy = 0; }
    if (m.type === 'spin') p.spinVis = m.side * 2 * Math.PI * clamp(u, 0, 1);
    if (u >= 1) {
      if (m.type === 'spin') { p.vulnT = st.t + S.spinVulnerable; p.spinVis = 0; }
      if (m.type === 'juke') p.reaccelT = st.t + S.jukeReaccelWindow;
      p.move = null;
    }
  }
  function flickCheck(p: Player, inp: SimInput, allowMoves: boolean) {
    const rs = inp.rs, m = rs ? Math.hypot(rs.x, rs.y) : 0;
    if (!p.flickArmed && p.curFlick && rs && m > p.curFlick.peak) { p.curFlick.peak = m; p.curFlick.x = rs.x; p.curFlick.y = rs.y; }
    if (m < S.flickRearm) p.flickArmed = true;
    if (!p.flickArmed || !rs || m < S.flickThreshold) return;
    p.flickArmed = false;
    const fl = { x: rs.x, y: rs.y, peak: m, t: st.t }; p.curFlick = fl;
    if (p.pitchPending) { if (!p.pitchPending.flick) p.pitchPending.flick = fl; return; }
    if (canPitch(p) && st.t - Math.max(p.lbTTap, p.rbTTap) <= S.doubleTapWindow) { p.bufferedFlick = fl; return; }
    if (allowMoves) doFlickMove(p, rs);
  }
  function doFlickMove(p: Player, rs: Vec2) {
    if (st.t < p.moveCD || p.move || !isGrounded(p) || p.plantT > 0) return;
    const a = wrapAngle(Math.atan2(rs.y, rs.x) - runDir(p)), A = Math.abs(a), side = a >= 0 ? 1 : -1;
    if (A <= rad(30)) startMove(p, 'truck', 0);
    else if (A >= rad(158)) startMove(p, 'juke', 0);
    else if (A >= rad(112)) startMove(p, 'spin', side);
    else startMove(p, 'sidestep', side);
  }
  function shoulderButtons(p: Player, inp: SimInput, opts: { hands: boolean; stiff: boolean } = { hands: true, stiff: true }) {
    const specs: Array<{ held: boolean; side: 'L' | 'R'; down: 'lbT' | 'rbT'; tap: 'lbTTap' | 'rbTTap'; dbl: 'lbTDbl' | 'rbTDbl' }> = [
      { held: inp.lbHeld, side: 'L', down: 'lbT', tap: 'lbTTap', dbl: 'lbTDbl' },
      { held: inp.rbHeld, side: 'R', down: 'rbT', tap: 'rbTTap', dbl: 'rbTDbl' },
    ];
    for (const spec of specs) {
      if (spec.held) {
        if (p[spec.down] < 0) {
          p[spec.down] = st.t;
          if (st.t - p[spec.tap] <= S.doubleTapWindow && canPitch(p)) {
            p[spec.dbl] = true; p[spec.tap] = -9;
            if (p.handTapUndo) { p.hand = p.handTapUndo; p.handSwitchT = 0; p.handTapUndo = null; }
            beginPitch(p, spec.side);
          }
        }
        if (!p[spec.dbl] && opts.stiff && st.t - p[spec.down] >= S.tapMaxTime && p.stiffArm !== spec.side) { p.stiffArm = spec.side; p.stiffHit = false; }
      } else if (p[spec.down] >= 0) {
        if (!p[spec.dbl] && st.t - p[spec.down] < S.tapMaxTime) {
          p[spec.tap] = st.t;
          if (opts.hands) { p.handTapUndo = p.hand; p.hand = p.hand === 'R' ? 'L' : 'R'; p.handSwitchT = S.handSwitchTime; floatText('BALL → ' + (p.hand === 'L' ? 'LEFT' : 'RIGHT'), p.x, p.y, '#ffe082'); st.lastHandSwitch = st.t; }
        }
        p[spec.dbl] = false;
        if (p.stiffArm === spec.side) p.stiffArm = null;
        p[spec.down] = -1;
      }
    }
  }
  function canPitch(p: Player) {
    return st.ball.holder === p.id && st.ball.state === 'held' && st.play.phase !== 'over'
      && (p.role === 'QB' || p.role === 'RB' || (!!st.carry && (p.role === 'WR' || p.role === 'TB')));
  }
  function beginPitch(p: Player, side: 'L' | 'R') {
    const bf = p.bufferedFlick && st.t - p.bufferedFlick.t <= S.doubleTapWindow + 0.05 ? p.bufferedFlick : null;
    p.bufferedFlick = null;
    p.pitchPending = { side, t: st.t, flick: bf };
  }
  function pitchUpdate(p: Player, allowMoves: boolean) {
    const pp = p.pitchPending;
    if (pp) {
      const fl = pp.flick;
      if ((fl && (p.flickArmed || st.t - fl.t > 0.12)) || (!fl && st.t - pp.t > S.pitchFlickWindow)) executePitch(p);
    }
    if (p.bufferedFlick && !p.pitchPending && st.t - p.bufferedFlick.t > S.doubleTapWindow) {
      const f = p.bufferedFlick; p.bufferedFlick = null; if (allowMoves) doFlickMove(p, f);
    }
    if (p.handTapUndo && st.t - Math.max(p.lbTTap, p.rbTTap) > S.doubleTapWindow) p.handTapUndo = null;
  }
  function executePitch(p: Player) {
    const pp = p.pitchPending, b = st.ball; p.pitchPending = null;
    if (!pp || !canPitch(p)) return;
    const sideN = pp.side === 'L' ? 1 : -1, ref = p.role === 'QB' ? Math.PI / 2 : runDir(p);
    let ang: number, speed: number;
    if (pp.flick) {
      const a = clamp(wrapAngle(Math.atan2(pp.flick.y, pp.flick.x) - ref) * sideN, rad(S.pitchMinAngle), rad(175));
      ang = ref + sideN * a;
      speed = lerp(S.pitchMinSpeed, S.pitchMaxSpeed, clamp((pp.flick.peak - S.flickThreshold) / Math.max(0.01, 1 - S.flickThreshold), 0, 1));
    } else { ang = ref + sideN * rad(S.pitchDefaultAngle); speed = S.pitchDefaultSpeed; }
    const vx = Math.cos(ang) * speed + p.vx * S.pitchInherit, vy = Math.sin(ang) * speed + p.vy * S.pitchInherit;
    if (st.mode === 'throw') snap();
    Object.assign(b, {
      state: 'air', holder: null, z: Math.max(1.0, b.z), vx, vy, vz: S.pitchLoft, throwT: st.t, resolved: false, gave: false, aimed: null, power: 0,
      pitch: { from: p.id, t: st.t, x0: b.x, y0: b.y, rolled: {}, looseT: 0 },
    });
    b.arc = predictArc(b.x, b.y, b.z, b.vx, b.vy, b.vz, st.t); b.landing = b.arc[b.arc.length - 1];
    p.handSwitchT = 0; p.stiffArm = null;
    floatText('PITCH', p.x, p.y, '#ffe082');
    const deg = (r: number) => +(r * 180 / Math.PI).toFixed(1);
    st.lastPitch = {
      from: p.id, side: pp.side, flicked: !!pp.flick, flickPeak: pp.flick ? +pp.flick.peak.toFixed(2) : null, relAngleDeg: deg(wrapAngle(ang - ref)), pitchSpeed: +speed.toFixed(2),
      groundDirDeg: deg(Math.atan2(vy, vx)), refDeg: deg(ref), t: st.t,
    };
  }
  function pitchCatchCheck() {
    const b = st.ball; if (b.state !== 'air' || !b.pitch || b.resolved) return;
    for (const p of Object.values(st.players)) {
      if (p.role === 'DF' || p.role === 'QB' || b.pitch.rolled[p.id]) continue;
      if (p.id === b.pitch.from && st.t - b.pitch.t < 0.4) continue;
      const h = handPos(p);
      if (Math.hypot(b.x - h.x, b.y - h.y) > S.pitchCatchReach || b.z < 0.1 || b.z > S.reachHeight + p.z) continue;
      b.pitch.rolled[p.id] = true;
      if (rng.random() > S.pitchCatchReliability) { floatText('DROPPED', p.x, p.y, '#ff5252'); b.vx *= 0.3; b.vy *= 0.3; b.vz = 1; continue; }
      b.state = 'held'; b.holder = p.id; b.resolved = true;
      const illegal = st.mode === 'run' && b.y > b.pitch.y0 + 0.5;
      Object.assign(st.lastPitch || {}, { caughtBy: p.id, catchX: +b.x.toFixed(2), catchY: +b.y.toFixed(2), illegal });
      floatText('PITCH CAUGHT', p.x, p.y, '#69f0ae');
      if (illegal) floatText('ILLEGAL FORWARD PASS', p.x, p.y + 2, '#ffd54a');
      if (st.mode === 'run') { if (p.id !== 'rb') st.pendingSwap = p.id; }
      else if (st.carry) { if (st.controlled !== 'df') st.controlled = p.id; }
      else { say('PITCH CAUGHT', '#69f0ae'); endPlay('PITCH CAUGHT'); }
      return;
    }
  }
  function looseBallCheck() {
    const b = st.ball; if (!b.pitch || b.holder || (b.state !== 'dead' && b.state !== 'rest')) return;
    if (!b.pitch.looseT) { b.pitch.looseT = st.t; floatText('LOOSE BALL!', b.x, b.y, '#ffab40'); }
    for (const p of Object.values(st.players)) {
      if (Math.hypot(p.x - b.x, p.y - b.y) > 0.9 || p.groundT > 0) continue;
      if (p.role === 'DF') { floatText('DEFENSE RECOVERS', b.x, b.y, '#ff5252'); endCarrier('FUMBLE'); return; }
      b.state = 'held'; b.holder = p.id; b.resolved = true; floatText('RECOVERED', p.x, p.y, '#69f0ae');
      if (st.lastPitch) st.lastPitch.recoveredBy = p.id;
      if (st.mode === 'run') { if (p.id !== 'rb') st.pendingSwap = p.id; }
      else if (st.carry) { if (st.controlled !== 'df') st.controlled = p.id; }
      else { say('RECOVERED', '#bbb'); endPlay('RECOVERED'); }
      return;
    }
    if (st.t - b.pitch.looseT > 3) { if (st.mode === 'run' || st.carry) endCarrier('FUMBLE'); else { say('FUMBLE', '#ffab40'); endPlay('FUMBLE'); } }
  }
  function swapCarrier(id: string) {
    const a = st.players.rb, n = st.players[id];
    st.players.rb = n; st.players[id] = a; n.id = 'rb'; a.id = id; n.role = 'RB'; a.role = id === 'tb' ? 'TB' : a.role;
    n.hand = 'R'; n.stiffArm = null; a.stiffArm = null; a.move = null; a.spinVis = 0; st.ball.holder = 'rb';
    st.swapCount = (st.swapCount || 0) + 1;
  }
  function aiPitchBack(p: Player, leader: Player, side: number): SimInput {
    const inp = blankInput(), b = st.ball, t = st.t, ai = (st.ai[p.id] = st.ai[p.id] || { pumpT: 0 });
    let tx: number, ty: number, want: number;
    if (b.pitch && b.state === 'air' && !b.resolved) {
      let cp: ArcPoint | null = null;
      for (const pt of b.arc) {
        if (pt.t < t || pt.z > 2.2 || pt.z < 0.15) continue;
        const d = Math.hypot(pt.x - p.x, pt.y - p.y); cp = pt;
        if ((d < 0.8 ? 0 : 0.1 + d / (S.fullSpeed * 0.95)) <= pt.t - t) break;
      }
      if (!cp) return inp;
      tx = cp.x; ty = cp.y; want = Math.hypot(tx - p.x, ty - p.y) / Math.max(0.05, cp.t - t) * 1.3 + 1;
    } else if (b.pitch && !b.holder) { tx = b.x; ty = b.y; want = 99; }
    else {
      const rd = leader.role === 'QB' ? Math.PI / 2 : runDir(leader);
      tx = clamp(leader.x - Math.cos(rd) * S.trailDepth - Math.sin(rd) * side * S.trailWidth, 1, FIELD_W - 1);
      ty = leader.y - Math.sin(rd) * S.trailDepth + Math.cos(rd) * side * S.trailWidth;
      want = Math.hypot(leader.vx, leader.vy) + Math.hypot(tx - p.x, ty - p.y) * 2.5;
    }
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
    if (d > 0.3) { const mag = want >= S.fullSpeed ? 1 : clamp(speedToMag(want), 0.2, 1); inp.mx = dx / d * mag; inp.my = dy / d * mag; }
    if (want > S.fullSpeed + 0.3 && aiPump(ai)) inp.sprint = true;
    return inp;
  }
  function plantStretch(p: Player | undefined, inp: SimInput) {
    if (!p) return;
    const t = st.t;
    if (inp.rbHeld && !p.planted && !p.rbWasHeld && isGrounded(p) && p.plantT <= 0) {
      const sp0 = Math.hypot(p.vx, p.vy), dir0 = sp0 > 0.5 ? Math.atan2(p.vy, p.vx) : p.facing;
      p.planted = { t0: t, x: p.x, y: p.y, said: false, falling: false, dir: dir0 }; p.facing = dir0; p.vx = 0; p.vy = 0; p.boost = 0; p.boostHold = 0; p.sprint = false;
      p.leanDir = dir0; floatText('PLANT', p.x, p.y, '#fff');
    }
    p.rbWasHeld = !!inp.rbHeld;
    const pl = p.planted;
    if (!pl) { p.stretch = 0; p.stretchReach = 0; return; }
    p.leanDir = pl.dir; p.facing = pl.dir;
    const held = t - pl.t0;
    if (pl.falling) {
      p.stretch = 1; p.stretchReach = S.stretchMaxReach + S.fallExtraReach;
      if (pl.fallT0 != null && t - pl.fallT0 >= S.fallLeanTime) { p.planted = null; p.groundT = S.fallRecovery; p.diveRec = undefined; p.stretch = 0; p.stretchReach = 0; st.lastFall = { t, recovery: S.fallRecovery }; }
      return;
    }
    if (inp.rbHeld) {
      p.stretch = clamp(held / S.plantFallTime, 0, 1); p.stretchReach = p.stretch * S.stretchMaxReach;
      if (held > 0.2 && !pl.said) { pl.said = true; floatText('STRETCH', p.x, p.y, '#80deea'); }
      if (held >= S.plantFallTime) { pl.falling = true; pl.fallT0 = t; floatText('TOE-TAP FALL', p.x, p.y, '#ffab40'); }
    } else {
      p.plantT = S.plantLockout + held * S.stretchRecoveryMult; st.lastPlantRelease = { held: +held.toFixed(3), recovery: +p.plantT.toFixed(3) };
      p.planted = null; p.stretch = 0; p.stretchReach = 0;
    }
  }
  function stiffArmUpdate(c: Player, d: Player) {
    if (!c.stiffArm || c.stiffHit) return;
    const dx = d.x - c.x, dy = d.y - c.y, dist = Math.hypot(dx, dy) || 1;
    if (dist > S.stiffArmReach || relSide(c, d) !== (c.stiffArm === 'L' ? 1 : -1)) return;
    if (Math.cos(c.facing) * dx + Math.sin(c.facing) * dy < -0.6) return;
    const eff = S.stiffArmStrength * (c.stiffArm === c.hand ? 0.3 : 1);
    d.vx = d.vx * (1 - eff) + dx / dist * S.stiffArmPush * eff; d.vy = d.vy * (1 - eff) + dy / dist * S.stiffArmPush * eff;
    d.stunT = Math.max(d.stunT, st.t + 0.25 * eff); d.boost = 0;
    c.stiffHit = true; floatText('STIFF-ARM', c.x, c.y, '#ffcc80'); st.lastStiffArm = { t: st.t, eff };
  }

  function resolveTackle(d: Player, c: Player, kind: 'wrap' | 'dive') {
    const notes: string[] = [];
    let p = kind === 'dive' ? S.diveTackleSuccess : S.wrapSuccess;
    if (!d.squared) { p *= S.noLTTackleMult; notes.push('no LT (arm tackle)'); }
    const run = runDir(c), from = Math.atan2(d.y - c.y, d.x - c.x);
    const behind = clamp((Math.abs(wrapAngle(from - run)) - Math.PI / 2) / (Math.PI / 2), 0, 1);
    p *= 1 - S.behindPenalty * behind;
    const cs = Math.hypot(c.vx, c.vy);
    p *= clamp(1 - S.speedPenalty * Math.max(0, cs - S.jogSpeed), 0.4, 1);
    const dist = Math.hypot(c.x - d.x, c.y - d.y) || 1;
    const closing = ((d.vx - c.vx) * (c.x - d.x) + (d.vy - c.vy) * (c.y - d.y)) / dist;
    const bigHit = kind === 'wrap' && d.squared && closing > S.bigHitSpeed;
    const m = c.move, hurdling = c.z > 0.05;
    if (m && m.type === 'spin' && (kind === 'dive' || !d.squared)) { p *= S.spinCounter; notes.push('spin beat it'); }
    if (c.vulnT > st.t) { p *= 1.3; notes.push('spin recovery (vulnerable)'); }
    if (m && m.type === 'truck') { p *= 1 - S.truckBonus; notes.push('truck'); }
    const defSide = relSide(c, d), ballSide = c.hand === 'L' ? 1 : -1;
    if (c.stiffArm && (c.stiffArm === 'L' ? 1 : -1) === defSide) { p *= 1 - S.stiffArmStrength * (c.stiffArm === c.hand ? 0.3 : 1); notes.push('stiff-arm'); }
    if (hurdling && kind === 'wrap') { p *= 1.15; notes.push('hurdled into the hit'); }
    p = clamp(p, 0.02, 0.98);
    let f = S.fumbleBase;
    if (ballSide === defSide) { f *= S.ballSideFumbleMult; notes.push('ball on hit side'); }
    if (c.handSwitchT > 0) f *= 2;
    if (bigHit) f *= S.bigHitFumbleMult;
    if (hurdling && kind === 'wrap') f *= S.hurdleWrapFumbleMult;
    if (m && m.type === 'truck' && bigHit) f *= 1.5;
    f = clamp(f, 0, 0.9);
    const result = rng.random() < f ? 'FUMBLE' : rng.random() < p ? 'TACKLED' : 'BROKEN';
    return (st.lastTackle = { kind, p: +p.toFixed(3), f: +f.toFixed(3), bigHit, notes, result, t: st.t });
  }
  function looseBall(c: Player) {
    const b = st.ball; b.state = 'dead'; b.holder = null; b.resolved = true;
    b.vx = c.vx * 0.5 + (rng.random() - 0.5) * 6; b.vy = c.vy * 0.5 + (rng.random() - 0.5) * 6; b.vz = 3;
  }
  function applyTackle(d: Player, c: Player, r: { result: string; bigHit: boolean; kind: string }) {
    if (r.result === 'TACKLED') {
      floatText(r.bigHit ? 'BIG HIT!' : 'TACKLE', c.x, c.y, '#ff5252');
      c.groundT = 1.5; c.vx *= 0.3; c.vy *= 0.3; c.move = null; endCarrier('TACKLED');
    } else if (r.result === 'FUMBLE') {
      floatText(r.bigHit ? 'BIG HIT — FUMBLE!' : 'FUMBLE!', c.x, c.y, '#ffab40');
      looseBall(c); c.groundT = 1.2; endCarrier('FUMBLE');
    } else {
      floatText('BROKEN TACKLE', c.x, c.y, '#69f0ae');
      const slow = c.move && c.move.type === 'truck' ? S.truckContactSlow : S.brokenSlow;
      c.vx *= slow; c.vy *= slow;
      if (r.kind === 'wrap') { d.plantT = S.brokenStagger; d.vx *= 0.2; d.vy *= 0.2; }
    }
  }
  function defenderActions(d: Player, c: Player, inp: SimInput) {
    if (d.stunT > st.t || st.play.phase !== 'live') return;
    const dx = c.x - d.x, dy = c.y - d.y, dist = Math.hypot(dx, dy) || 1;
    if (inp.a && !d.tackle && st.t > d.tackleCD && isGrounded(d) && d.plantT <= 0) {
      d.tackle = { kind: 'wrap', t0: st.t, done: false }; d.tackleCD = st.t + S.tackleCooldown;
      d.vx += dx / dist * S.wrapLunge; d.vy += dy / dist * S.wrapLunge;
    }
    if (inp.x && !d.tackle && isGrounded(d) && d.plantT <= 0) {
      const m = Math.hypot(inp.mx, inp.my);
      d.diveT = 0; d.diveDir = m > 0.2 ? Math.atan2(inp.my, inp.mx) : Math.atan2(dy, dx);
      d.diveSpeed = S.diveTackleDist / S.diveDuration; d.diveRec = S.diveTackleRecovery; d.boost = 0; d.boostHold = 0;
      d.tackle = { kind: 'dive', t0: st.t, done: false };
    }
    if (inp.y && st.t > d.punchCD) {
      d.punchCD = st.t + S.punchCooldown;
      if (dist <= S.punchReach) {
        const f = S.punchFumble * (relSide(c, d) === (c.hand === 'L' ? 1 : -1) ? S.ballSideFumbleMult : 1) * (c.handSwitchT > 0 ? 2 : 1);
        st.lastPunch = { t: st.t, f };
        if (rng.random() < f) { floatText('PUNCHED OUT!', c.x, c.y, '#ffab40'); looseBall(c); endCarrier('FUMBLE'); }
        else floatText('PUNCH', d.x, d.y, '#b39ddb');
      } else floatText('PUNCH (whiff)', d.x, d.y, '#888');
    }
  }
  function tackleCheck(d: Player, c: Player) {
    const tk = d.tackle; if (!tk) return;
    if (tk.kind === 'wrap' && st.t - tk.t0 > S.wrapWindow) { d.tackle = null; floatText('MISSED', d.x, d.y, '#bbb'); d.plantT = S.missStagger; return; }
    if (tk.kind === 'dive' && d.diveT < 0) { d.tackle = null; floatText(tk.hurdled ? 'HURDLED!' : 'MISSED', d.x, d.y, tk.hurdled ? '#69f0ae' : '#bbb'); return; }
    if (st.play.phase !== 'live' || st.ball.holder !== c.id) return;
    const ext = tk.kind === 'dive' ? 0.8 : 0.3, hx = d.x + Math.cos(d.facing) * ext, hy = d.y + Math.sin(d.facing) * ext;
    if (Math.hypot(c.x - hx, c.y - hy) > (tk.kind === 'dive' ? S.diveTackleReach : S.wrapReach)) return;
    if (tk.kind === 'dive' && c.z > S.hurdleClear) { if (!tk.hurdled) { tk.hurdled = true; st.lastHurdleBeat = st.t; } return; }
    d.tackle = null;
    applyTackle(d, c, resolveTackle(d, c, tk.kind));
  }
  function separate(a: Player, b: Player) {
    if (a.diveT >= 0 || b.diveT >= 0 || a.groundT > 0 || b.groundT > 0 || a.z > 0.2 || b.z > 0.2) return;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = 0.85;
    if (d > 0.001 && d < min) { const k = (min - d) / 2; a.x -= dx / d * k; a.y -= dy / d * k; b.x += dx / d * k; b.y += dy / d * k; }
  }
  function endRun(result: string) {
    if (st.play.phase === 'over') return;
    st.play.phase = 'over'; st.play.endT = st.t; st.play.result = result; st.runScore.last = result;
    if (result === 'TOUCHDOWN') st.runScore.td++; else st.runScore.stops++;
    const col: Record<string, string> = { TOUCHDOWN: '#69f0ae', TACKLED: '#ff5252', FUMBLE: '#ffab40', 'OUT OF BOUNDS': '#bbb', DOWN: '#bbb' };
    say(result, col[result] || '#fff');
  }
  function pressHeld(inp: SimInput, key: string | null | undefined) {
    if (key === 'lbHeld' || key === 'rbHeld' || key === 'a' || key === 'x' || key === 'y') inp[key] = true;
  }
  function aiCarrier(c: Player, dt: number): SimInput {
    const inp = blankInput(), d = st.players.df, ai = (st.ai[c.id] = st.ai[c.id] || {}), t = st.t;
    const goalY = st.carry?.goalY ?? GOAL_Y;
    if (ai.tap) { pressHeld(inp, ai.tap); ai.tap = null; }
    if (ai.holdArm && t < (ai.holdUntil || 0)) pressHeld(inp, ai.holdArm); else ai.holdArm = null;
    if (st.play.phase !== 'live') return inp;
    if (!d) {
      inp.my = 1;
      if (aiPump(ai)) inp.sprint = true;
      if (goalY - c.y < S.runDiveDistance && goalY - c.y > 0.6) inp.x = true;
      return inp;
    }
    const rx = d.x - c.x, ry = d.y - c.y, dist = Math.hypot(rx, ry);
    const ahead = ry > -1 && d.groundT <= 0;
    let tx = c.x, ty = goalY + 3;
    if (ahead && dist < 15) {
      let s = Math.sign(c.x - d.x) || (c.x < FIELD_W / 2 ? 1 : -1);
      if ((s > 0 && c.x > FIELD_W - 7) || (s < 0 && c.x < 7)) s = -s;
      tx = clamp(d.x + s * (3 + dist * 0.45), 3, FIELD_W - 3);
    }
    const dx = tx - c.x, dy = ty - c.y, dd = Math.hypot(dx, dy) || 1;
    inp.mx = dx / dd; inp.my = dy / dd;
    if (dist > 4 && aiPump(ai)) inp.sprint = true;
    if (dist > 6) { ai.moveDone = false; ai.hurdled = false; }
    const away = -relSide(c, d);
    if (dist < 7 && relSide(c, d) === (c.hand === 'L' ? 1 : -1) && t - (ai.switchT || 0) > 1.2) { ai.tap = c.hand === 'L' ? 'rbHeld' : 'lbHeld'; ai.switchT = t; }
    if (d.diveT >= 0 && dist < 3.2 && !ai.hurdled) { ai.hurdled = true; if (rng.random() < S.aiMoveRate) inp.a = true; }
    else if (!ai.moveDone && ahead && dist < 3.4 && rng.random() < S.aiMoveRate * dt * 5) {
      ai.moveDone = true;
      const r = rng.random(), dir = runDir(c);
      let ang: number | null = null;
      if (r < 0.45) ang = dir + away * Math.PI / 2;
      else if (r < 0.65) ang = dir + away * rad(135);
      else if (r < 0.8) ang = dir + Math.PI;
      else if (r < 0.9) ang = dir;
      else { ai.holdArm = relSide(c, d) > 0 ? 'lbHeld' : 'rbHeld'; ai.holdUntil = t + 0.7; }
      if (ang !== null) inp.rs = { x: Math.cos(ang), y: Math.sin(ang) };
    }
    if (goalY - c.y < S.runDiveDistance && goalY - c.y > 0.6 && dist < 3) inp.x = true;
    return inp;
  }
  function aiDefender(d: Player, dt: number): SimInput {
    const inp = blankInput(), ai = st.ai.df, t = st.t, b = st.ball;
    const holder = b.holder ? st.players[b.holder] : undefined;
    const c = holder ? holder : { x: b.x, y: b.y, vx: b.vx, vy: b.vy, groundT: 0 };
    if (st.play.phase !== 'live' || c.groundT > 0) return inp;
    if (!ai.seen || t - (ai.seenT || 0) >= S.aiReaction) { ai.seen = { x: c.x, y: c.y, vx: c.vx, vy: c.vy }; ai.seenT = t; }
    const s = ai.seen;
    if (!s) return inp;
    const lag = t - (ai.seenT || t), sx = s.x + s.vx * lag, sy = s.y + s.vy * lag;
    const mySpeed = S.sprintMaxSpeed * 0.95;
    let tt = Math.hypot(sx - d.x, sy - d.y) / mySpeed;
    for (let i = 0; i < 3; i++) tt = Math.hypot(sx + s.vx * tt * S.aiLead - d.x, sy + s.vy * tt * S.aiLead - d.y) / mySpeed;
    const goalY = st.carry?.goalY ?? GOAL_Y;
    const tx = clamp(sx + s.vx * tt * S.aiLead, 0, FIELD_W), ty = Math.min(sy + s.vy * tt * S.aiLead + 0.8, goalY + 2);
    const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy);
    if (dd > 0.2) { inp.mx = dx / dd; inp.my = dy / dd; }
    const real = Math.hypot(c.x - d.x, c.y - d.y), inFront = d.y > c.y - 0.5;
    if (real > 6 && aiPump(ai)) inp.sprint = true;
    if (real < lerp(4.5, 2.2, S.aiAggression) && inFront) inp.lt = true;
    if (real < S.wrapReach + 0.4 && !d.tackle) inp.a = true;
    else if (!d.tackle && real > 1.8 && real < S.diveTackleDist + 0.6 && rng.random() < S.aiAggression * 3 * dt) {
      inp.x = true; const px = c.x + c.vx * 0.2 - d.x, py = c.y + c.vy * 0.2 - d.y, pm = Math.hypot(px, py) || 1; inp.mx = px / pm; inp.my = py / pm;
    }
    if (!inFront && real < S.punchReach && rng.random() < S.aiAggression * 1.5 * dt) inp.y = true;
    return inp;
  }
  function scoringLine() { return st.carry?.goalY ?? GOAL_Y; }
  function beginCarry(p: Player) {
    addRunState(p);
    p.hand = p.hand || 'R';
    const goalY = st.mode === 'catch' ? Math.min(GOAL_Y, p.y + Math.max(1, S.catchTargetYds)) : GOAL_Y;
    const goalLabel = goalY >= GOAL_Y - 0.05 ? 'TOUCHDOWN' : 'TARGET';
    st.carry = { catchY: p.y, yac: 0, goalY, goalLabel };
    st.play.phase = 'live';
    if (st.cm && st.mode === 'catch') st.cm.phase = 'carry';
    st.stats.last = 'CATCH';
    const ai = (st.ai[p.id] = st.ai[p.id] || {});
    ai.moveDone = false; ai.hurdled = false; ai.pumpT = 0; ai.switchT = -9; ai.tap = null; ai.holdArm = null;
    const wantPursuer = st.mode === 'catch' ? S.catchPursuer : S.throwPursuer;
    if (wantPursuer) {
      const room = goalY - p.y;
      const gap = clamp(Math.min(S.runDefenderGap * 0.75, room * 0.55), 4, Math.max(4, room - 1));
      const df = addRunState(newPlayer('df', 'DF', clamp(p.x + (rng.random() - 0.5) * 8, 3, FIELD_W - 3), clamp(p.y + gap, p.y + 3, Math.max(p.y + 3, goalY - 0.4))));
      df.facing = -Math.PI / 2;
      st.players.df = df;
      st.ai.df = { seen: null, seenT: -9, pumpT: 0 };
    } else delete st.players.df;
    if (st.mode === 'throw' && S.autoSwitchCarrier && st.controlled !== p.id) st.controlled = p.id;
    if (p.y >= goalY && p.x >= 0 && p.x <= FIELD_W) {
      floatText(goalLabel === 'TARGET' ? 'TARGET!' : 'TOUCHDOWN!', p.x, p.y, '#69f0ae');
      endAfterCatch(goalLabel);
    }
  }
  function endCarrier(result: string) {
    if (st.mode === 'run') endRun(result);
    else if (st.carry) endAfterCatch(result);
    else endPlay(result);
  }
  function endAfterCatch(result: string) {
    const holder = st.ball.holder ? st.players[st.ball.holder] : st.players.wr;
    if (st.carry && holder) st.carry.yac = holder.y - st.carry.catchY;
    st.stats.lastYac = st.carry ? st.carry.yac : 0;
    st.stats.yacTotal += st.stats.lastYac;
    if (st.mode === 'catch') finishCatchRep(result);
    else endPlay(result);
  }
  function stepAfterCatch(dt: number, human?: SimInput | null) {
    const humanIn = human || blankInput();
    let holder = st.ball.holder ? st.players[st.ball.holder] : st.players.wr;
    if (!holder || holder.role === 'DF' || holder.role === 'QB') holder = st.players.wr;
    const d = st.players.df;
    const humanCarrier = st.controlled === holder.id;
    let ci = humanCarrier ? humanIn : aiCarrier(holder, dt);
    let di = d ? (st.controlled === 'df' ? humanIn : aiDefender(d, dt)) : blankInput();
    if (st.play.phase === 'over') { ci = { ...blankInput(), lbHeld: ci.lbHeld, rbHeld: ci.rbHeld }; di = blankInput(); }
    const qb = st.players.qb;
    if (qb && qb !== holder) updateMovement(qb, humanCarrier || st.mode === 'catch' ? blankInput() : { ...humanIn, a: false, x: false, y: false, b: false, rb: false, rt: false }, dt);
    const hb = st.players.hb;
    if (hb && hb !== holder) updateMovement(hb, { ...(st.play.phase === 'live' ? aiPitchBack(hb, holder, -1) : blankInput()), rb: false }, dt);
    advanceCarrier(dt, holder, d, ci, di);
    st.floaters = st.floaters.filter(f => st.t - f.t < 1.3);
    if (st.mode !== 'catch' && S.autoReset && st.play.phase === 'over' && st.play.endT != null && st.t - st.play.endT > 2.6) reset();
  }
  /** Shared 1v1 carrier update: moves, shoulders, hurdle/dive, pursuer, and how the play ends. */
  function advanceCarrier(dt: number, c: Player, d: Player | undefined, ci: SimInput, di: SimInput) {
    const goalY = scoringLine();
    flickCheck(c, ci, true); shoulderButtons(c, ci); pitchUpdate(c, true);
    if (c.handSwitchT > 0) c.handSwitchT -= dt;
    updateMovement(c, { ...ci, a: false, x: false, rb: false }, dt);
    applyMove(c, dt);
    if (st.play.phase === 'live' && isGrounded(c) && c.plantT <= 0) {
      if (ci.a) { c.jumpT = 0; c.jumpH = S.hurdleHeight; c.jumpDur = S.hurdleDuration; c.move = null; floatText('HURDLE', c.x, c.y, '#a5d6a7'); st.lastHurdle = st.t; }
      else if (ci.x) {
        const m = Math.hypot(ci.mx, ci.my);
        c.diveT = 0; c.diveDir = m > 0.2 ? Math.atan2(ci.my, ci.mx) : c.facing; c.dove = true; c.move = null;
        c.diveSpeed = Math.max(Math.hypot(c.vx, c.vy), S.runDiveDistance / S.diveDuration); c.diveRec = 1.5; c.boost = 0; c.boostHold = 0;
        floatText('DIVE', c.x, c.y, '#fff');
      }
    }
    const tb = st.mode === 'run' ? st.players.tb : undefined;
    if (tb && tb !== c) updateMovement(tb, { ...(st.play.phase === 'live' ? aiPitchBack(tb, c, st.trailSide || 1) : blankInput()), rb: false }, dt);
    if (d) {
      let defIn = di;
      if (d.stunT > st.t) defIn = { ...di, mx: di.mx * 0.3, my: di.my * 0.3, a: false, x: false, y: false };
      updateMovement(d, { ...defIn, a: false, x: false, y: false }, dt);
      defenderActions(d, c, defIn);
      stiffArmUpdate(c, d);
      tackleCheck(d, c);
      separate(c, d);
    }
    ballUpdate(dt);
    pitchCatchCheck(); looseBallCheck();
    if (st.carry && st.play.phase === 'live') st.carry.yac = c.y - st.carry.catchY;
    if (st.play.phase === 'live') {
      const b = st.ball;
      const label = st.carry?.goalLabel ?? 'TOUCHDOWN';
      const crossed = (st.mode === 'run' ? b.y : c.y) >= goalY;
      if (b.holder === c.id && crossed && c.x >= 0 && c.x <= FIELD_W) {
        floatText(label === 'TARGET' ? 'TARGET!' : 'TOUCHDOWN!', c.x, c.y, '#69f0ae');
        endCarrier(label);
      } else if (b.holder === c.id && (c.x < 0 || c.x > FIELD_W)) {
        floatText('OUT', c.x, c.y, '#bbb');
        endCarrier('OUT OF BOUNDS');
      } else if (b.holder === c.id && c.dove && c.groundT > 0) endCarrier('DOWN');
    }
  }
  function stepRun(dt: number, human?: SimInput | null) {
    const c = st.players.rb, d = st.players.df, ctl = st.controlled;
    const humanIn = human || blankInput();
    let ci = ctl === 'rb' ? humanIn : aiCarrier(c, dt);
    let di = ctl === 'df' ? humanIn : aiDefender(d, dt);
    if (st.play.phase === 'pre') {
      if (S.requireSnap ? humanIn.a : (humanIn.mx || humanIn.my || st.t - st.play.t0 > 0.8)) { st.play.phase = 'live'; st.play.snapT = st.t; say('GO!', '#9fe39f'); ci = { ...ci, a: false }; di = { ...di, a: false }; }
      else { ci = blankInput(); di = blankInput(); }
    }
    if (st.play.phase === 'over') { ci = { ...blankInput(), lbHeld: ci.lbHeld, rbHeld: ci.rbHeld }; di = blankInput(); }
    advanceCarrier(dt, c, d, ci, di);
    if (st.pendingSwap) { swapCarrier(st.pendingSwap); st.pendingSwap = null; }
    st.floaters = st.floaters.filter(f => st.t - f.t < 1.3);
    if (S.autoReset && st.play.phase === 'over' && st.play.endT != null && st.t - st.play.endT > 2.6) reset();
  }

  reset();
  return { state: st, step, reset, previewThrow, routeWaypoints, snap, doThrow, setMode, resolveTackle, handPos };
}
