import { blankInput, type Player, type SimInput, type SimState } from '../sim/types';
import { BTN, type InputFrame, type NetMsg, type SnapPlayer, type Snapshot } from './types';

export function packButtons(inp: SimInput): number {
  let n = 0;
  if (inp.sprint) n |= BTN.sprint;
  if (inp.y) n |= BTN.y;
  if (inp.rt) n |= BTN.rt;
  if (inp.rb) n |= BTN.rb;
  if (inp.a) n |= BTN.a;
  if (inp.x) n |= BTN.x;
  if (inp.b) n |= BTN.b;
  if (inp.start) n |= BTN.start;
  if (inp.lbHeld) n |= BTN.lb;
  if (inp.rbHeld) n |= BTN.rbHeld;
  return n;
}

export function applyButtons(inp: SimInput, bits: number) {
  inp.sprint = !!(bits & BTN.sprint);
  inp.y = !!(bits & BTN.y);
  inp.rt = !!(bits & BTN.rt);
  inp.rb = !!(bits & BTN.rb);
  inp.a = !!(bits & BTN.a);
  inp.x = !!(bits & BTN.x);
  inp.b = !!(bits & BTN.b);
  inp.start = !!(bits & BTN.start);
  inp.lbHeld = !!(bits & BTN.lb);
  inp.rbHeld = !!(bits & BTN.rbHeld);
}

export function inputToFrame(inp: SimInput, seq: number): InputFrame {
  return {
    seq,
    mx: inp.mx,
    my: inp.my,
    lt: inp.lt ? 1 : 0,
    rt: inp.trigger || 0,
    buttons: packButtons(inp),
    aimX: inp.aim ? inp.aim.x : null,
    aimY: inp.aim ? inp.aim.y : null,
    throwPower: inp.throwPower == null ? -1 : inp.throwPower,
    rsX: inp.rs ? inp.rs.x : null,
    rsY: inp.rs ? inp.rs.y : null,
  };
}

export function frameToInput(frame: InputFrame): SimInput {
  const inp = blankInput();
  inp.mx = frame.mx;
  inp.my = frame.my;
  inp.lt = frame.lt > 0.35;
  applyButtons(inp, frame.buttons);
  inp.trigger = Math.max(0, Math.min(1, frame.rt || 0));
  if (frame.aimX != null && frame.aimY != null) inp.aim = { x: frame.aimX, y: frame.aimY };
  if (frame.throwPower >= 0) inp.throwPower = frame.throwPower;
  if (frame.rsX != null && frame.rsY != null) inp.rs = { x: frame.rsX, y: frame.rsY };
  return inp;
}

/** Second 1/120 substep of a 60 Hz tick: keep axes and the analog trigger, drop edges so a throw or snap does not repeat. */
export function stripEdges(inp: SimInput): SimInput {
  return { ...inp, sprint: false, y: false, rt: false, rb: false, a: false, x: false, b: false, start: false, throwPower: null };
}

function sampleArc(arc: SimState['ball']['arc']): Snapshot['ball']['arc'] {
  if (arc.length <= 12) return arc.map((p) => ({ x: p.x, y: p.y, z: p.z, t: p.t }));
  const out: Snapshot['ball']['arc'] = [];
  const step = (arc.length - 1) / 11;
  for (let i = 0; i < 12; i++) {
    const p = arc[Math.round(i * step)];
    out.push({ x: p.x, y: p.y, z: p.z, t: p.t });
  }
  return out;
}

function packPlayer(p: Player): SnapPlayer {
  return {
    id: p.id,
    role: p.role,
    name: p.name || '',
    tint: p.tint ?? 0,
    x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy,
    facing: p.facing,
    sprint: p.sprint,
    boost: p.boost,
    squared: p.squared,
    diveT: p.diveT,
    groundT: p.groundT,
    jumpT: p.jumpT,
    spinVis: p.spinVis || 0,
  };
}

export function packSnapshot(st: SimState): Snapshot {
  const b = st.ball;
  return {
    t: st.t,
    mode: st.mode,
    phase: st.play.phase,
    result: st.play.result || '',
    route: st.route,
    feedback: st.feedback ? { ...st.feedback } : null,
    ball: {
      state: b.state,
      holder: b.holder,
      x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz,
      aimed: b.aimed ? { ...b.aimed } : null,
      landing: b.landing ? { x: b.landing.x, y: b.landing.y } : null,
      arc: sampleArc(b.arc),
    },
    players: Object.values(st.players).map(packPlayer),
    stats: { ...st.stats },
    cov: { ...st.cov },
    carry: st.carry ? { ...st.carry } : null,
    runScore: { ...st.runScore },
  };
}

function stub(src: SnapPlayer): Player {
  return {
    id: src.id, role: src.role, x: src.x, y: src.y, vx: 0, vy: 0, z: 0, facing: src.facing,
    sprint: false, boost: 0, boostHold: 0, boostFast: false, squared: false, squareDir: src.facing,
    plantT: 0, jumpT: -1, diveT: -1, diveDir: 0, diveSpeed: 0, groundT: 0, stick: 0,
    attempt: null, lastAttempt: null, cooldownUntil: 0, wasIn: false, lateUntil: 0, dropPending: false, blockedPass: false,
    lbT: -1, rbT: -1, lbTTap: -9, rbTTap: -9, lbTDbl: false, rbTDbl: false, flickArmed: true, curFlick: null,
    pitchPending: null, bufferedFlick: null, handTapUndo: null, planted: null, stretch: 0, stretchReach: 0, leanDir: src.facing,
    hand: 'R', handSwitchT: 0, move: null, moveCD: 0, vulnT: 0, reaccelT: 0, spinVis: 0,
    stiffArm: null, stiffHit: false, stunT: 0, tackle: null, tackleCD: 0, punchCD: 0, dove: false,
  };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Interpolation-only presentation. Discrete fields come from the newer snapshot. */
export function present(st: SimState, older: Snapshot, newer: Snapshot, alpha: number) {
  const t = Math.min(1, Math.max(0, alpha));
  st.mode = newer.mode;
  st.t = lerp(older.t, newer.t, t);
  st.route = newer.route;
  st.play.phase = newer.phase;
  st.play.result = newer.result || undefined;
  st.feedback = newer.feedback ? { ...newer.feedback } : null;
  st.stats = { ...newer.stats };
  st.cov = { ...newer.cov };
  st.carry = newer.carry ? { ...newer.carry } : null;
  st.runScore = { ...newer.runScore };
  const ids = new Set(newer.players.map((p) => p.id));
  for (const id of Object.keys(st.players)) if (!ids.has(id)) delete st.players[id];
  for (const np of newer.players) {
    const op = older.players.find((p) => p.id === np.id) ?? np;
    const jumped = Math.hypot(np.x - op.x, np.y - op.y) > 12;
    const u = jumped ? 1 : t;
    let p = st.players[np.id];
    if (!p) { p = stub(np); st.players[np.id] = p; }
    p.role = np.role;
    p.name = np.name || undefined;
    p.tint = np.tint || undefined;
    p.x = lerp(op.x, np.x, u);
    p.y = lerp(op.y, np.y, u);
    p.z = lerp(op.z, np.z, u);
    p.vx = np.vx;
    p.vy = np.vy;
    p.facing = np.facing;
    p.sprint = np.sprint;
    p.boost = np.boost;
    p.squared = np.squared;
    p.diveT = np.diveT;
    p.groundT = np.groundT;
    p.jumpT = np.jumpT;
    p.spinVis = np.spinVis;
  }
  const ob = older.ball, nb = newer.ball;
  const ballJump = ob.state !== nb.state || ob.holder !== nb.holder || Math.hypot(nb.x - ob.x, nb.y - ob.y) > 12;
  const u = ballJump ? 1 : t;
  const b = st.ball;
  b.state = nb.state;
  b.holder = nb.holder;
  b.x = lerp(ob.x, nb.x, u);
  b.y = lerp(ob.y, nb.y, u);
  b.z = lerp(ob.z, nb.z, u);
  b.vx = nb.vx; b.vy = nb.vy; b.vz = nb.vz;
  b.aimed = nb.aimed ? { ...nb.aimed } : null;
  b.landing = nb.landing ? { x: nb.landing.x, y: nb.landing.y, z: 0, t: newer.t } : null;
  b.arc = nb.arc.map((p) => ({ ...p }));
}

export function parseMsg(data: unknown): NetMsg | null {
  try {
    const v = typeof data === 'string' ? JSON.parse(data) as unknown : data;
    if (!v || typeof v !== 'object') return null;
    const t = (v as { t?: unknown }).t;
    if (typeof t !== 'string') return null;
    return v as NetMsg;
  } catch {
    return null;
  }
}

export function encodeMsg(msg: NetMsg): string {
  return JSON.stringify(msg);
}
