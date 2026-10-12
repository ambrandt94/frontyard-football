import type { Settings } from '../config/defaults';
import { ROUTES } from '../config/constants';
import { radialDeadzone } from '../sim/math';
import { throwTune } from '../sim/throwArm';
import { blankInput, type SimInput, type ThrowPhase } from '../sim/types';
import { freshTrigger, stepTrigger } from './trigger';

export interface InputMeta {
  switch: boolean;
  reset: boolean;
  start: boolean;
  routeDelta: number;
  route: string | null;
  toggleRenderer: boolean;
  toggleHelp: boolean;
  toggleGui: boolean;
  cycleTime: boolean;
  mode: boolean;
  posePreview: boolean;
  cycleAim: boolean;
  /** -1 zooms in, 1 zooms out. */
  zoom: number;
  cycleCam: boolean;
  zoomStop: boolean;
}

export interface PolledInput extends SimInput {
  aimSpec: { mode: 'mouse'; x: number; y: number } | { mode: 'stick'; offset: { x: number; y: number } };
  /** Raw right stick in field space, including zeros. Null when no pad is connected. */
  aimStick: { x: number; y: number } | null;
}

export interface InputController {
  readonly padConnected: boolean;
  readonly device: string;
  readonly aimMode: string;
  mouse: { x: number; y: number; moved: boolean; down: boolean; downT: number; released: number | null };
  poll(): { inp: PolledInput; meta: InputMeta };
  /** Last throw-arm phase, so a second click during the lob window sends a lob press. */
  setArmPhase(phase: ThrowPhase): void;
}

export function createInput(S: Settings, view: HTMLElement): InputController {
  const keys = new Set<string>();
  const edges = new Set<string>();
  const mouse = { x: 0, y: 0, moved: false, down: false, downT: 0, released: null as number | null };
  let prevButtons: boolean[] = [];
  let prevRtv = 0;
  let rtLatch = freshTrigger();
  let armPhase: ThrowPhase = 'idle';
  let leftEdge = false;
  let rightEdge = false;
  let cAt = 0;
  let cJog = false;
  let aimMode: 'stick' | 'mouse' = 'stick';
  let aimOffset = { x: 0, y: 12 };
  let lastDevice = 'keyboard';
  const isField = (e: Event) => {
    const tag = (e.target as HTMLElement | null)?.tagName || '';
    return /INPUT|SELECT|TEXTAREA/.test(tag);
  };
  addEventListener('keydown', (e) => {
    if (isField(e)) return;
    if (['Tab', 'Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) edges.add(e.code);
    keys.add(e.code);
    lastDevice = 'keyboard';
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'KeyF') edges.add('KeyF-up');
    if (e.code === 'KeyC') edges.add('KeyC-up');
  });
  addEventListener('blur', () => keys.clear());
  view.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; aimMode = 'mouse'; });
  view.addEventListener('mousedown', (e) => {
    if (e.button === 2) { rightEdge = true; lastDevice = 'keyboard'; }
    if (e.button === 0) { leftEdge = true; mouse.down = true; mouse.downT = performance.now(); mouse.x = e.clientX; mouse.y = e.clientY; aimMode = 'mouse'; lastDevice = 'keyboard'; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0 && mouse.down) { mouse.down = false; mouse.released = (performance.now() - mouse.downT) / 1000; }
  });
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  let arrowT = 0;
  let backAt = 0;
  let backSent = false;
  let startAt = 0;
  let startLong = false;
  let chordSent = false;
  function getPad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
  return {
    get padConnected() { return !!getPad(); },
    get device() { return lastDevice; },
    get aimMode() { return aimMode; },
    mouse,
    setArmPhase(phase: ThrowPhase) { armPhase = phase; },
    poll() {
      const inp = blankInput() as PolledInput;
      const meta: InputMeta = { switch: false, reset: false, start: false, routeDelta: 0, route: null, toggleRenderer: false, toggleHelp: false, toggleGui: false, cycleTime: false, mode: false, posePreview: false, cycleAim: false, zoom: 0, cycleCam: false, zoomStop: false };
      const pad = getPad();
      let padMove: { x: number; y: number } | null = null;
      let aimStick: { x: number; y: number } | null = null;
      if (pad) {
        const B = (i: number) => pad.buttons[i] ? pad.buttons[i].pressed : false;
        const V = (i: number) => pad.buttons[i] ? pad.buttons[i].value : 0;
        const E = (i: number) => B(i) && !prevButtons[i];
        const rawRX = pad.axes[2] || 0;
        const rawRY = pad.axes[3] || 0;
        aimStick = { x: rawRX, y: -rawRY };
        const L = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0, S.deadzone);
        const R = radialDeadzone(rawRX, rawRY, S.deadzone);
        if (L.m > 0) { padMove = { x: L.x, y: -L.y }; lastDevice = 'gamepad'; }
        if (Math.hypot(rawRX, rawRY) > S.aimDeadzone) { aimMode = 'stick'; lastDevice = 'gamepad'; }
        inp.lt = V(6) > 0.3;
        inp.sprint = E(10);
        inp.y = E(3);
        inp.rb = E(5);
        inp.a = E(0);
        inp.x = E(2);
        inp.b = E(1);
        const rt = V(7);
        const engage = Math.min(0.95, Math.max(0.02, S.rtEngage));
        if (rt >= engage && prevRtv < engage) inp.rt = true;
        prevRtv = rt;
        inp.trigger = rt;
        const nowMs = performance.now();
        const back = B(8);
        const startBtn = B(9);
        if (back && startBtn) {
          if (!chordSent) {
            meta.toggleHelp = true;
            chordSent = true;
            backSent = true;
            startLong = true;
          }
        } else if (!back && !startBtn) chordSent = false;
        if (startBtn) {
          if (!startAt) startAt = nowMs;
          if (!startLong && !chordSent && nowMs - startAt >= 600) {
            meta.toggleHelp = true;
            startLong = true;
          }
        } else {
          if (startAt && !startLong && !chordSent) meta.start = true;
          startAt = 0;
          startLong = false;
        }
        if (back) {
          if (!backAt) backAt = nowMs;
          if (!backSent && !chordSent && !startBtn && nowMs - backAt >= 180) {
            meta.switch = true;
            backSent = true;
          }
        } else {
          if (backAt && !backSent && !chordSent) meta.switch = true;
          backAt = 0;
          backSent = false;
        }
        if (E(15)) meta.routeDelta = 1;
        if (E(14)) meta.routeDelta = -1;
        if (E(12)) meta.mode = true;
        if (E(13)) meta.zoomStop = true;
        if (R.m > 0) inp.rs = { x: R.x, y: -R.y };
        inp.lbHeld = B(4);
        inp.rbHeld = B(5);
        if (pad.buttons.some((b) => b.pressed)) lastDevice = 'gamepad';
        prevButtons = pad.buttons.map((b) => b.pressed);
        prevRtv = rt;
      }
      let kx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      let ky = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const km = Math.hypot(kx, ky);
      if (padMove) { inp.mx = padMove.x; inp.my = padMove.y; }
      else if (km > 0) { const mag = keys.has('KeyC') ? 0.5 : 1; inp.mx = kx / km * mag; inp.my = ky / km * mag; }
      const e = (c: string) => edges.has(c);
      inp.lt = inp.lt || keys.has('KeyQ');
      inp.sprint = inp.sprint || e('ShiftLeft') || e('ShiftRight');
      inp.y = inp.y || e('KeyE');
      inp.rt = inp.rt || e('KeyF');
      inp.rb = inp.rb || e('KeyV');
      inp.a = inp.a || e('Space');
      inp.x = inp.x || e('KeyX');
      inp.b = inp.b || e('KeyB');
      const now = performance.now();
      const tune = throwTune(S);
      const cap = Math.min(tune.bulletSqueeze, tune.lobPress) - 0.04;
      const mid = cap <= tune.engage ? tune.engage + 0.01 : tune.engage + (cap - tune.engage) * 0.55;
      const lobSpike = Math.min(1, tune.lobPress + 0.02);
      let mouseT = 0;
      if (mouse.down) {
        if (leftEdge && armPhase === 'window' && !keys.has('KeyF')) mouseT = lobSpike;
        else mouseT = keys.has('KeyF') ? 1 : mid;
      }
      if (rightEdge && armPhase === 'window') mouseT = Math.max(mouseT, lobSpike);
      leftEdge = false;
      rightEdge = false;
      if (mouse.released !== null) mouse.released = null;
      const trigger = Math.max(inp.trigger, mouseT);
      const pulled = stepTrigger(rtLatch, trigger, now, prevRtv, {
        engage: S.rtEngage,
        release: S.rtRelease,
        minHoldMs: S.rtMinHoldMs,
      });
      rtLatch = pulled.latch;
      inp.trigger = trigger;
      if (pulled.latch.charging) inp.charge = trigger;
      if (e('Tab')) meta.switch = true;
      if (e('KeyR')) meta.reset = true;
      if (e('Enter')) meta.start = true;
      if (e('BracketRight')) meta.routeDelta = 1;
      if (e('BracketLeft')) meta.routeDelta = -1;
      ROUTES.forEach((name, i) => { if (i < 9 && e(`Digit${i + 1}`)) meta.route = name; });
      if (e('KeyM')) meta.toggleRenderer = true;
      if (e('KeyK')) meta.cycleAim = true;
      if (e('Equal') || e('NumpadAdd')) meta.zoom = -1;
      if (e('Minus') || e('NumpadSubtract')) meta.zoom = 1;
      if (e('KeyC')) { cAt = now; cJog = km > 0 || !!padMove; }
      if (keys.has('KeyC') && (km > 0 || !!padMove)) cJog = true;
      if (e('KeyC-up')) {
        if (cAt && now - cAt < 280 && !cJog) meta.cycleCam = true;
        cAt = 0;
        cJog = false;
      }
      if (e('KeyH')) meta.toggleHelp = true;
      if (e('KeyG')) meta.toggleGui = true;
      if (e('KeyT')) meta.cycleTime = true;
      if (e('KeyN')) meta.mode = true;
      if (e('KeyP')) meta.posePreview = true;
      inp.lbHeld = !!inp.lbHeld || keys.has('KeyZ') || e('KeyZ');
      inp.rbHeld = !!inp.rbHeld || keys.has('KeyV') || e('KeyV');
      // Arrows are the right stick. Carriers flick relative to their run. Defenders lunge in world space.
      const ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      const ay = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      if (ax || ay) {
        if (!arrowT) arrowT = now;
        if (now - arrowT > 60 && !inp.rs) { const am = Math.hypot(ax, ay); inp.rs = { x: ax / am, y: ay / am }; }
      } else arrowT = 0;
      inp.start = meta.start;
      inp.aimStick = aimStick;
      inp.aimSpec = aimMode === 'mouse' ? { mode: 'mouse', x: mouse.x, y: mouse.y } : { mode: 'stick', offset: aimOffset };
      edges.clear();
      return { inp, meta };
    },
  };
}
