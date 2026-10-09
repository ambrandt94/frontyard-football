import type { Settings } from '../config/defaults';
import { ROUTES } from '../config/constants';
import { radialDeadzone } from '../sim/math';
import { blankInput, type SimInput } from '../sim/types';

export interface InputMeta {
  switch: boolean;
  reset: boolean;
  start: boolean;
  routeDelta: number;
  route: string | null;
  toggleRenderer: boolean;
  toggleHelp: boolean;
  mode: boolean;
  posePreview: boolean;
}

export interface PolledInput extends SimInput {
  aimSpec: { mode: 'mouse'; x: number; y: number } | { mode: 'stick'; offset: { x: number; y: number } };
}

export interface InputController {
  readonly padConnected: boolean;
  readonly device: string;
  readonly aimMode: string;
  mouse: { x: number; y: number; moved: boolean; down: boolean; downT: number; released: number | null };
  poll(): { inp: PolledInput; meta: InputMeta };
}

export function createInput(S: Settings, view: HTMLElement): InputController {
  const keys = new Set<string>();
  const edges = new Set<string>();
  const mouse = { x: 0, y: 0, moved: false, down: false, downT: 0, released: null as number | null };
  let prevButtons: boolean[] = [];
  let prevRtv = 0;
  let rtCharging = false;
  let rtPeak = 0;
  let rtLock = false;
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
  });
  addEventListener('blur', () => keys.clear());
  view.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; aimMode = 'mouse'; });
  view.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.down = true; mouse.downT = performance.now(); mouse.x = e.clientX; mouse.y = e.clientY; aimMode = 'mouse'; lastDevice = 'keyboard'; }
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0 && mouse.down) { mouse.down = false; mouse.released = (performance.now() - mouse.downT) / 1000; }
  });
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  let fDownT = 0;
  let arrowT = 0;
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
    poll() {
      const inp = blankInput() as PolledInput;
      const meta: InputMeta = { switch: false, reset: false, start: false, routeDelta: 0, route: null, toggleRenderer: false, toggleHelp: false, mode: false, posePreview: false };
      const pad = getPad();
      let padMove: { x: number; y: number } | null = null;
      if (pad) {
        const B = (i: number) => pad.buttons[i] ? pad.buttons[i].pressed : false;
        const V = (i: number) => pad.buttons[i] ? pad.buttons[i].value : 0;
        const E = (i: number) => B(i) && !prevButtons[i];
        const L = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0, S.deadzone);
        const R = radialDeadzone(pad.axes[2] || 0, pad.axes[3] || 0, S.deadzone);
        if (L.m > 0) { padMove = { x: L.x, y: -L.y }; lastDevice = 'gamepad'; }
        if (R.m > 0) { aimMode = 'stick'; aimOffset = { x: R.x * S.maxAimRange, y: -R.y * S.maxAimRange }; lastDevice = 'gamepad'; }
        inp.lt = V(6) > 0.3;
        inp.sprint = E(10);
        inp.y = E(3);
        inp.rb = E(5);
        inp.a = E(0);
        inp.x = E(2);
        inp.b = E(1);
        const rt = V(7);
        inp.rt = rt > 0.5 && !(prevRtv > 0.5);
        if (rtLock && rt < 0.06) rtLock = false;
        if (!rtLock) {
          if (!rtCharging && rt > 0.1) { rtCharging = true; rtPeak = rt; }
          if (rtCharging) {
            rtPeak = Math.max(rtPeak, rt);
            inp.charge = clampCharge((rtPeak - 0.1) / 0.88);
            if (rt < 0.06 || rt < rtPeak - 0.25 || rtPeak >= 0.99) { inp.throwPower = inp.charge; rtCharging = false; rtLock = true; }
          }
        }
        if (E(8)) meta.switch = true;
        if (E(9)) meta.start = true;
        if (E(15)) meta.routeDelta = 1;
        if (E(14)) meta.routeDelta = -1;
        if (E(12)) meta.mode = true;
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
      if (e('KeyF')) fDownT = now;
      if (mouse.down) inp.charge = clampCharge((now - mouse.downT) / 1000 / S.kbChargeTime);
      else if (keys.has('KeyF') && fDownT) inp.charge = clampCharge((now - fDownT) / 1000 / S.kbChargeTime);
      if (mouse.released !== null) { inp.throwPower = clampCharge(mouse.released / S.kbChargeTime); mouse.released = null; }
      if (e('KeyF-up') && fDownT) { inp.throwPower = clampCharge((now - fDownT) / 1000 / S.kbChargeTime); fDownT = 0; }
      if (e('Tab')) meta.switch = true;
      if (e('KeyR')) meta.reset = true;
      if (e('Enter')) meta.start = true;
      if (e('BracketRight')) meta.routeDelta = 1;
      if (e('BracketLeft')) meta.routeDelta = -1;
      ROUTES.forEach((name, i) => { if (i < 9 && e(`Digit${i + 1}`)) meta.route = name; });
      if (e('KeyM')) meta.toggleRenderer = true;
      if (e('KeyH')) meta.toggleHelp = true;
      if (e('KeyN')) meta.mode = true;
      if (e('KeyP')) meta.posePreview = true;
      inp.lbHeld = !!inp.lbHeld || keys.has('KeyZ') || e('KeyZ');
      inp.rbHeld = !!inp.rbHeld || keys.has('KeyV') || e('KeyV');
      const ax = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      const ay = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      if (ax || ay) {
        if (!arrowT) arrowT = now;
        if (now - arrowT > 60 && !inp.rs) { const am = Math.hypot(ax, ay); inp.rs = { x: ax / am, y: ay / am }; }
      } else arrowT = 0;
      inp.start = meta.start;
      inp.aimSpec = aimMode === 'mouse' ? { mode: 'mouse', x: mouse.x, y: mouse.y } : { mode: 'stick', offset: aimOffset };
      edges.clear();
      return { inp, meta };
    },
  };
}

function clampCharge(v: number): number {
  return Math.max(0, Math.min(1, v));
}
