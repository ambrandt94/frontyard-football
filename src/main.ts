import './ui/style.css';
import { DEFAULTS, type Settings } from './config/defaults';
import { applyControlPreset, BUILTIN_PRESETS } from './config/presets';
import { browserStore, loadSettings, saveSettings } from './config/settings';
import { nextTimeScale, timeScaleOf } from './config/timeScale';
import { CAM_FOV, FIELD_W, LOS_Y, ROUTES, STEP } from './config/constants';
import { fitAngledCamera, rigAzimuth, type FramePoint } from './render/camera';
import { MODE_LABEL, MP_MODE_IDS, nextMode, type ModeId } from './modes';
import { clamp, rad } from './sim/math';
import { aiLook, loadLook } from './sim/look';
import { createSim } from './sim/sim';
import { freshThrowArm, stepThrowArm, throwTune } from './sim/throwArm';
import type { SimInput, ThrowPhase, Vec2 } from './sim/types';
import { AIM_MODE_LABEL, aimModeOf, createAimState, nextAimMode, resampleArc, stepAim } from './input/aim';
import { createInput } from './input/input';
import type { PolledInput } from './input/input';
import { createCanvasRenderer } from './render/canvas2d/renderer';
import { createThreeRenderer } from './render/three/renderer';
import { loadPlayerModel, MODEL } from './render/three/model';
import type { FieldRenderer, ViewState } from './render/types';
import { createHelp } from './ui/help';
import { updateFloaters, updateHud } from './ui/hud';
import { createLobby } from './ui/lobby';
import { createPanel, toast } from './ui/panel';
import { createSession, type NetSession } from './net/session';

const S: Settings = loadSettings(browserStore());
const sim = createSim(S);
const st = sim.state;
const viewEl = document.getElementById('view');
if (!viewEl) throw new Error('missing #view');

loadPlayerModel();

let renderer: FieldRenderer = null!;
function setRenderer(name: 'three' | 'canvas2d') {
  if (renderer) renderer.dispose();
  renderer = name === 'canvas2d' ? createCanvasRenderer(S) : createThreeRenderer(S);
  renderer.init(viewEl!);
  S.renderer = renderer.name;
}
setRenderer(S.renderer === 'canvas2d' ? 'canvas2d' : 'three');

let session: NetSession;
const panel = createPanel({
  S,
  sim,
  getRenderer: () => renderer,
  setRenderer,
  inRoom: () => {
    const phase = session?.phase;
    return phase === 'lobby' || phase === 'play' || phase === 'ended';
  },
  isClient: () => !!session && session.role === 'client' && session.phase !== 'idle',
  isHostRoom: () => !!session && session.role === 'host' && (session.phase === 'lobby' || session.phase === 'play'),
  roomPhase: () => session?.phase ?? 'idle',
  onHostSettings: () => session?.pushSettings(),
  onLobbyMode: (m) => session?.setMode(m),
  onLook: (look) => session?.setLook(look),
});
const { gui, sandbox } = panel;

addEventListener('resize', () => renderer.resize());
const ZOOM_STOPS = [18, 26, 42];
const CAM_STYLES = ['all22', 'topdown', 'broadcast'] as const;
let zoomFlashTimer = 0;
function camStyleLabel(style: string) {
  if (style === 'topdown') return 'Top-down';
  if (style === 'broadcast') return 'Broadcast';
  return 'All-22';
}
function flashZoom() {
  const el = document.getElementById('zoom-flash');
  const btn = document.getElementById('cam-style');
  if (btn) btn.textContent = camStyleLabel(S.camStyle);
  if (!el) return;
  const stop = ZOOM_STOPS.find((n) => n === S.cameraMinExtent);
  const name = stop === 18 ? 'Close' : stop === 26 ? 'Medium' : stop === 42 ? 'Wide' : `${Math.round(S.cameraMinExtent)} yd`;
  el.textContent = `${camStyleLabel(S.camStyle)} · ${name}`;
  el.classList.add('show');
  window.clearTimeout(zoomFlashTimer);
  zoomFlashTimer = window.setTimeout(() => el.classList.remove('show'), 900);
}
function applyZoom(next: number) {
  S.cameraMinExtent = clamp(Math.round(next), 12, 120);
  saveSettings(browserStore(), S);
  panel.refresh();
  flashZoom();
}
function nudgeZoom(dir: number) {
  applyZoom(S.cameraMinExtent * (dir > 0 ? 1.12 : 1 / 1.12));
}
function cycleZoomStop() {
  const next = ZOOM_STOPS.find((n) => n > S.cameraMinExtent + 0.5);
  applyZoom(next ?? ZOOM_STOPS[0]);
}
function cycleCamStyle() {
  const i = CAM_STYLES.indexOf(S.camStyle as typeof CAM_STYLES[number]);
  S.camStyle = CAM_STYLES[(i + 1) % CAM_STYLES.length];
  saveSettings(browserStore(), S);
  panel.refresh();
  flashZoom();
}
function resetCamera() {
  S.cameraMinExtent = DEFAULTS.cameraMinExtent;
  S.cameraPadding = DEFAULTS.cameraPadding;
  S.camStyle = DEFAULTS.camStyle;
  saveSettings(browserStore(), S);
  panel.refresh();
  flashZoom();
}
viewEl.addEventListener('wheel', (e) => {
  nudgeZoom(e.deltaY > 0 ? 1 : -1);
}, { passive: true });
document.getElementById('cam-zoom-in')?.addEventListener('click', () => nudgeZoom(-1));
document.getElementById('cam-zoom-out')?.addEventListener('click', () => nudgeZoom(1));
document.getElementById('cam-style')?.addEventListener('click', () => cycleCamStyle());
document.getElementById('cam-reset')?.addEventListener('click', () => resetCamera());
const camBtn = document.getElementById('cam-style');
if (camBtn) camBtn.textContent = camStyleLabel(S.camStyle);

const input = createInput(S, viewEl);
const aimState = createAimState();
let armPhase: ThrowPhase = 'idle';
let armLock: Vec2 | null = null;
let clientArm = freshThrowArm();
let clientT = 0;
let clientAcc = 0;
let shownAim = aimModeOf(S.aimMode);
let aimHint = '';
let aimHintUntil = 0;
const cam = { x: FIELD_W / 2, y: LOS_Y + 3, ext: DEFAULTS.cameraMinExtent, lookX: FIELD_W / 2, lookY: LOS_Y + 14, dist: 110 };
let acc = 0;
let last = performance.now();
const help = createHelp(must('help'), must('controls-pill'));
const hud = {
  stats: must('stats'),
  fb: must('feedback'),
  pad: must('padnote'),
  power: must('power'),
};
const promptEl = must('prompt');
const floatEl = must('floaters');
let viewState: ViewState | null = null;
let carry: PolledInput | null = null;

function paintLocalBodies() {
  const mine = loadLook();
  const jerseys = [mine.jersey];
  for (const p of Object.values(st.players)) {
    if (p.id === st.controlled) {
      p.look = { ...mine };
      p.tint = mine.jersey;
    } else {
      delete p.tint;
      p.look = aiLook(p.role, jerseys);
    }
  }
}

function must(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing #' + id);
  return el;
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const polled = input.poll();
  const inp = polled.inp;
  const meta = polled.meta;
  if (carry) {
    for (const k of ['sprint', 'y', 'rt', 'rb', 'a', 'x', 'b', 'start', 'lbHeld', 'rbHeld'] as const) inp[k] = inp[k] || carry[k];
    if (inp.throwPower === null) inp.throwPower = carry.throwPower;
    carry = null;
  }
  const online = session.phase === 'play';
  if (meta.mode && session.role !== 'client') {
    let m = nextMode(st.mode);
    const inRoom = session.phase === 'lobby' || session.phase === 'play';
    if (inRoom) while (!(MP_MODE_IDS as readonly ModeId[]).includes(m)) m = nextMode(m);
    panel.setMode(m);
  }
  sandbox.controlling = st.controlled.toUpperCase();
  if (!online && st.mode === 'catch' && meta.start && st.cm?.phase !== 'carry') {
    S.catchPaused = !S.catchPaused;
    toast(S.catchPaused ? 'Throws paused' : 'Throws resumed');
    panel.refresh();
    meta.start = false;
    inp.start = false;
  }
  if (!online && meta.switch) panel.switchControl();
  if (!online && (meta.reset || (meta.start && !(st.controlled === 'wr' && st.ball.holder === 'qb' && st.play.phase !== 'over')))) {
    sim.reset();
    meta.start = false;
    inp.start = false;
  }
  if (!online && meta.routeDelta) {
    st.route = ROUTES[(ROUTES.indexOf(st.route as typeof ROUTES[number]) + meta.routeDelta + ROUTES.length) % ROUTES.length];
    sandbox.route = st.route;
    sim.reset(true);
  }
  if (!online && meta.route) { st.route = meta.route; sandbox.route = st.route; sim.reset(true); }
  if (meta.toggleRenderer) {
    setRenderer(renderer.name === 'three' ? 'canvas2d' : 'three');
    panel.refresh();
    saveSettings(browserStore(), S);
  }
  if (meta.toggleHelp) help.toggle();
  if (meta.toggleGui) {
    if (gui.domElement.classList.contains('lil-closed')) gui.open();
    else gui.close();
  }
  const shown = session.phase === 'lobby' ? session.mode : st.mode;
  help.setMode(shown);
  if (session.role === 'client' && session.phase !== 'idle') {
    const label = MODE_LABEL[shown];
    if (sandbox.mode !== label) sandbox.mode = label;
    if (session.phase === 'play' && sandbox.route !== st.route) sandbox.route = st.route;
  }
  if (meta.cycleTime && session.role === 'client') toast('Host controls this');
  if (meta.cycleTime && session.role !== 'client') {
    S.timeScale = nextTimeScale(S.timeScale);
    saveSettings(browserStore(), S);
    panel.refresh();
    if (session.role === 'host' && (session.phase === 'lobby' || session.phase === 'play')) session.pushSettings();
  }
  if (meta.posePreview) sandbox.posePreview = !sandbox.posePreview;
  if (meta.cycleAim) {
    S.aimMode = nextAimMode(aimModeOf(S.aimMode));
    saveSettings(browserStore(), S);
    panel.refresh();
  }
  if (meta.zoom) nudgeZoom(meta.zoom);
  if (meta.zoomStop) cycleZoomStop();
  if (meta.cycleCam) cycleCamStyle();
  if (aimModeOf(S.aimMode) !== shownAim) {
    shownAim = aimModeOf(S.aimMode);
    aimHint = AIM_MODE_LABEL[shownAim];
    aimHintUntil = performance.now() + 2000;
  }

  const thrower = localThrower();
  let reticle: { x: number; y: number } | null = null;
  let aimGuide: { x: number; y: number; x2: number; y2: number } | null = null;
  let previewLoft = S.previewDefaultLoft;
  let previewPoint: { x: number; y: number } | null = null;
  if (thrower) {
    const mouse = inp.aimSpec.mode === 'mouse' ? renderer.screenToField(inp.aimSpec.x, inp.aimSpec.y) : null;
    const aimed = stepAim(aimState, {
      stick: inp.aimSpec.mode === 'stick' ? inp.aimStick : null,
      mouse,
      qb: thrower,
      charging: inp.charge !== null,
      pressure: inp.charge,
      cancel: !!inp.b,
      hold: armPhase === 'window' || (armPhase === 'charge' && (inp.trigger || 0) < S.rtRelease),
    }, dt, S, now / 1000);
    if (aimed.suppressThrow) {
      inp.throwPower = null;
      inp.charge = null;
    }
    inp.aim = { x: aimed.x, y: aimed.y };
    if (st.ball.holder === thrower.id) {
      reticle = inp.aim;
      aimGuide = aimed.guide;
      previewLoft = aimed.previewLoft;
      previewPoint = { x: aimed.previewX, y: aimed.previewY };
    }
  }
  if (window.__netInput) Object.assign(inp, window.__netInput);
  if (!reticle && st.ball.state === 'air' && st.ball.aimed) reticle = st.ball.aimed;

  if (session.phase === 'lobby' || session.phase === 'play') session.tick(dt, online ? inp : null);
  if (!online) {
    acc += dt * timeScaleOf(S.timeScale);
    let first = true;
    while (acc >= STEP) {
      const i: SimInput = first ? inp : { ...inp, sprint: false, y: false, rt: false, rb: false, a: false, x: false, b: false, start: false, throwPower: null };
      sim.step(STEP, i);
      first = false;
      acc -= STEP;
    }
    if (first) carry = inp;
    paintLocalBodies();
  } else {
    acc = 0;
    carry = null;
  }

  const b = st.ball;
  const attack: 1 | -1 = st.carry?.goalSign ?? 1;
  const showRoute = (st.mode === 'coverage' || (st.mode === 'throw' && st.controlled === 'qb')) && st.play.phase !== 'over' && st.ball.holder === 'qb';
  const route = showRoute ? [{ x: 12, y: LOS_Y - 0.6 }, ...sim.routeWaypoints(st.route)] : null;
  const pts: FramePoint[] = [];
  for (const p of Object.values(st.players)) pts.push({ x: p.x, y: p.y, z: p.z + 2 });
  pts.push({ x: b.x, y: b.y, z: Math.max(b.z, 0.3) });
  if (st.mode === 'catch' && st.cm?.cur && b.state === 'air') pts.push(st.cm.cur.tgt);
  if (st.mode === 'run') {
    const c = st.players.rb;
    if (c) pts.push({ x: c.x, y: 110 }, { x: c.x, y: 116 });
  }
  if (b.state === 'air' && b.landing) pts.push(b.landing);
  if (reticle) pts.push(reticle);
  if (route) for (const p of route) pts.push(p);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const vw = viewEl!.clientWidth || innerWidth;
  const vh = viewEl!.clientHeight || innerHeight;
  const guiW = gui._closed ? 0 : Math.min(vw * 0.5, gui.domElement.getBoundingClientRect().width + 10);
  const pad = S.cameraPadding;
  const aspect = (vw - guiW) / vh;
  // Top-down measures the ground point. The body hangs past it, so keep a couple of yards for the sprite.
  const sprite = 2.2;
  const needH = Math.max(S.cameraMinExtent, (y1 - y0) + 2 * (pad + sprite), ((x1 - x0) + 2 * (pad + sprite)) / aspect);
  const tx = (x0 + x1) / 2 + (guiW / 2) * (cam.ext / vh);
  const ty = (y0 + y1) / 2;
  const k = 1 - Math.exp(-S.cameraFollow * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.ext += (needH - cam.ext) * (needH > cam.ext ? Math.min(1, k * 2.5) : k * 0.6);

  const rig = S.camStyle === 'topdown' || S.camStyle === 'broadcast' ? S.camStyle : 'all22';
  const azimuth = rig === 'topdown' ? 0 : rigAzimuth(rig, attack);
  if (rig !== 'topdown' && pts.length) {
    const fit = fitAngledCamera({
      points: pts,
      aspect: Math.max(0.3, aspect),
      pitch: S.camPitch,
      fov: S.camFov,
      azimuth,
      upfieldBias: S.camUpfieldBias,
      heightBias: S.camHeightBias,
      minYards: S.cameraMinExtent,
      padding: S.cameraPadding,
      panelShift: guiW > 0 ? (guiW / 2) * (cam.ext / Math.max(vh, 1)) : 0,
      attack,
    });
    const dlx = fit.lookX - cam.lookX;
    const dly = fit.lookY - cam.lookY;
    const lookFar = Math.hypot(dlx, dly) > 6;
    const lookDead = Math.hypot(dlx, dly) <= 0.45;
    const kLook = lookDead ? k * 0.12 : lookFar ? Math.min(1, k * 2.2) : k;
    cam.lookX += dlx * kLook;
    cam.lookY += dly * kLook;
    const grow = fit.dist > cam.dist;
    const kDist = grow ? Math.min(1, k * 2.8) : k * 0.42;
    if (Math.abs(fit.dist - cam.dist) > Math.max(0.8, cam.dist * 0.012)) cam.dist += (fit.dist - cam.dist) * kDist;
  }

  const onlinePlay = session.phase === 'play' && session.role === 'client';
  if (onlinePlay) {
    clientAcc += dt * timeScaleOf(S.timeScale);
    const tune = throwTune(S);
    let guard = 0;
    while (clientAcc >= STEP && guard++ < 8) {
      const out = stepThrowArm(clientArm, inp.trigger || 0, inp.aim, !!inp.b, clientT + STEP, tune);
      clientArm = out.arm;
      clientT += STEP;
      clientAcc -= STEP;
      if (out.action === 'pump' && thrower) {
        st.floaters.push({ text: 'PUMP', x: thrower.x, y: thrower.y + 1.2, t: clientT, color: '#ffe0b2' });
        thrower.forcePose = 'throwWindup';
      }
    }
    if (thrower && clientArm.pumpUntil > 0 && clientT >= clientArm.pumpUntil && thrower.forcePose === 'throwWindup') delete thrower.forcePose;
    else if (thrower && clientT < clientArm.pumpUntil) thrower.forcePose = 'throwWindup';
    armPhase = clientArm.phase;
    armLock = clientArm.lock;
  } else {
    armPhase = st.throwArm.phase;
    armLock = st.throwArm.lock;
    clientArm = freshThrowArm();
    clientT = st.t;
    clientAcc = 0;
  }
  input.setArmPhase(armPhase);
  if (thrower && st.ball.holder === thrower.id && (armLock || inp.aim)) {
    if (armPhase === 'window' && armLock) {
      previewLoft = 0;
      previewPoint = armLock;
    } else if (armPhase === 'charge' && inp.aim) {
      previewLoft = 1;
      previewPoint = inp.aim;
    }
  }

  const qb = st.players.qb;
  let preview = null;
  let previewRing: { x: number; y: number; r: number } | null = null;
  if (previewPoint) {
    const style = armPhase === 'window' ? 'lob' as const : armPhase === 'charge' ? 'bullet' as const : undefined;
    const arc = sim.previewThrow(previewLoft, previewPoint, style).arc;
    const end = arc[arc.length - 1];
    preview = resampleArc(arc, 32);
    if (end) previewRing = { x: end.x, y: end.y, r: S.catchReach };
  }
  for (const p of Object.values(st.players)) {
    const h = sim.handPos(p);
    p.handX = h.x;
    p.handY = h.y;
  }
  const cmw = st.mode === 'catch' && st.cm?.phase === 'windup' ? st.cm : null;
  viewState = {
    cue: cmw && qb ? { x: qb.x, y: qb.y, frac: clamp((st.t - cmw.windupStart) / Math.max(0.01, cmw.windupEnd - cmw.windupStart), 0, 1) } : null,
    trails: updateTrails(),
    cam: {
      x: cam.x, y: cam.y, h: cam.ext / (2 * Math.tan(rad(CAM_FOV / 2))), ext: cam.ext,
      rig, fov: S.camFov, pitch: S.camPitch, dist: cam.dist, azimuth, lookX: cam.lookX, lookY: cam.lookY,
    },
    reticle,
    preview,
    previewLoft,
    previewRing,
    aimGuide,
    route,
    showReach: S.showReach,
    showArc: S.showArc,
    qbCharge: inp.charge,
    poseSheet: sandbox.posePreview && renderer.name === 'three',
  };
  renderer.sync(st, viewState);
  renderer.render();
  updateHud({
    st, S, inp, input, rendererName: renderer.name, stats: hud.stats, fb: hud.fb, pad: hud.pad, power: hud.power, prompt: promptEl,
    aimHint: performance.now() < aimHintUntil ? aimHint : null,
  });
  updateFloaters({ st, renderer, poseSheet: !!viewState.poseSheet, floatEl });
  lobby.paintStats();
  requestAnimationFrame(frame);
}

function localThrower() {
  if (st.mode === 'free') {
    const id = st.ball.holder;
    if (id && id === st.controlled) return st.players[id] ?? null;
    return null;
  }
  if ((st.mode === 'throw' || st.mode === 'coverage') && st.controlled === 'qb') return st.players.qb ?? null;
  return null;
}

const trailBuf: Record<string, { x: number; y: number; t: number }[]> = {};
let trailKey = '';
function updateTrails() {
  const key = st.mode + ':' + st.play.t0 + ':' + (st.swapCount || 0);
  if (key !== trailKey) {
    trailKey = key;
    for (const k of Object.keys(trailBuf)) delete trailBuf[k];
  }
  const out: { pts: { x: number; y: number }[]; color: number }[] = [];
  for (const id in st.players) {
    const p = st.players[id];
    if (p.role === 'QB' || p.role === 'DF') continue;
    const buf = trailBuf[id] || (trailBuf[id] = []);
    const lastP = buf[buf.length - 1];
    if (!lastP || Math.hypot(p.x - lastP.x, p.y - lastP.y) > 0.15) buf.push({ x: p.x, y: p.y, t: st.t });
    while (buf.length && st.t - buf[0].t > 2.5) buf.shift();
    if (buf.length > 1) out.push({ pts: buf, color: p.role === 'RB' ? 0xffe082 : p.role === 'TB' ? 0xffcc80 : 0x90caf9 });
  }
  return out;
}

declare global {
  interface Window {
    __sandbox?: unknown;
    __net?: {
      setInput(partial: Partial<SimInput> | null): void;
      session: NetSession;
    };
    __netInput?: Partial<SimInput> | null;
    __netSignal?: { host: string; port: number; path: string; secure: boolean };
  }
}
window.__sandbox = {
  MODEL,
  sim,
  state: st,
  S,
  DEFAULTS,
  setMode: (m: ModeId) => panel.setMode(m),
  get renderer() { return renderer; },
  get view() { return viewState; },
  setRenderer,
  builtins: BUILTIN_PRESETS,
  applyControlPreset: (name: string) => {
    const preset = BUILTIN_PRESETS.find((p) => p.name === name);
    if (preset) applyControlPreset(S, preset);
  },
};

let lobby: ReturnType<typeof createLobby>;
session = createSession({
  sim,
  S,
  onChange: () => {
    lobby.update();
    panel.syncLock();
    panel.refresh();
  },
});
lobby = createLobby({ session });
window.__net = {
  setInput(partial) { window.__netInput = partial; },
  session,
};
lobby.boot();

requestAnimationFrame(frame);
