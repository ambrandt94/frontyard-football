import { learnedCount, stickCal } from '../input/stick';
import type { Player } from '../sim/types';

let calEl: HTMLElement | null = null;
let debugEl: HTMLElement | null = null;

function ensure() {
  if (!calEl) {
    calEl = document.createElement('div');
    calEl.id = 'stick-cal';
    calEl.className = 'hidden';
    document.body.appendChild(calEl);
  }
  if (!debugEl) {
    debugEl = document.createElement('div');
    debugEl.id = 'stick-debug';
    debugEl.className = 'hidden';
    document.body.appendChild(debugEl);
  }
}

function dots(count: number) {
  let html = '';
  for (let i = 0; i < 8; i++) html += `<i class="${i < count ? 'on' : ''}"></i>`;
  return html;
}

function line(label: string, rawM: number, rawDeg: number, m: number, deg: number) {
  const fmt = (n: number) => n.toFixed(2);
  const ang = (n: number) => `${Math.round(n)}°`;
  return `<div><b>${label}</b> raw ${fmt(rawM)} ${ang(rawDeg)} <span class="dim">→</span> cal ${fmt(m)} ${ang(deg)}</div>`;
}

export function updateStickHud(player: Player | undefined) {
  ensure();
  const cal = stickCal;
  const showCal = cal.calibrating;
  calEl!.classList.toggle('hidden', !showCal);
  if (showCal) {
    const left = learnedCount(cal.left);
    const right = learnedCount(cal.right);
    const secs = Math.max(0, (cal.until - Date.now()) / 1000);
    calEl!.innerHTML = `<b>Calibrate sticks</b><p>Rotate both sticks around the rim.</p><p>Left ${dots(left)} ${left}/8 &nbsp; Right ${dots(right)} ${right}/8</p><p class="dim">${secs.toFixed(1)}s</p>`;
  }
  debugEl!.classList.toggle('hidden', !cal.showDebug);
  if (!cal.showDebug) return;
  const sprint = !player ? '—'
    : player.easing ? 'ease-off'
    : player.boostFast ? 'cut'
    : player.boostHold > 0 ? 'hold'
    : player.boost > 0.01 ? 'decay'
    : 'idle';
  const L = cal.leftReading;
  const R = cal.rightReading;
  debugEl!.innerHTML = `
    ${line('L', L.rawM, L.rawDeg, L.m, L.deg)}
    ${line('R', R.rawM, R.rawDeg, R.m, R.deg)}
    <div>Sprint <b>${sprint}</b> <span class="dim">boost ${player ? player.boost.toFixed(2) : '—'}</span></div>`;
}
