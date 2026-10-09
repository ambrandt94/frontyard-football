import type { Settings } from '../config/defaults';
import { catchBandRange, maxSprintBoost } from '../config/defaults';
import { clamp } from '../sim/math';
import type { SimState } from '../sim/types';
import type { InputController } from '../input/input';
import type { PolledInput } from '../input/input';
import type { FieldRenderer } from '../render/types';

export function sprintMeter(boost: number, hold: number, fast: boolean, S: Settings): string {
  const maxBoost = Math.max(0.01, maxSprintBoost(S));
  const pct = clamp(boost / maxBoost, 0, 1);
  const pumps = Math.max(1, Math.min(16, Math.round(maxBoost / Math.max(0.05, S.boostPerPump))));
  let pips = '';
  for (let i = 0; i < pumps; i++) {
    const fill = clamp(pct * pumps - i, 0, 1);
    pips += `<i style="--fill:${(fill * 100).toFixed(0)}%"></i>`;
  }
  const color = hold > 0 ? '#ffd54a' : fast ? '#ff7043' : '#ffb74d';
  const detail = boost > 0.01 ? `+${boost.toFixed(2)}${hold > 0 ? ' hold' : ' ↓'}` : '—';
  const title = `Sprint boost toward max (${S.fullSpeed.toFixed(1)}–${S.sprintMaxSpeed.toFixed(1)} yd/s)`;
  return `<div class="row sprint-row"><span>Sprint</span><span class="pips" style="--c:${color}" title="${title}">${pips}</span><b class="sprint-readout">${Math.round(pct * 100)}%<small>${detail}</small></b></div>`;
}

export function updateHud(opts: {
  st: SimState;
  S: Settings;
  inp: PolledInput;
  input: InputController;
  rendererName: string;
  stats: HTMLElement;
  fb: HTMLElement;
  pad: HTMLElement;
  power: HTMLElement;
  prompt: HTMLElement;
}) {
  const { st, S, inp, input, rendererName, stats, fb, pad, power, prompt } = opts;
  const me = st.players[st.controlled] ?? Object.values(st.players)[0];
  if (!me) return;
  const sp = Math.hypot(me.vx, me.vy);
  const flags = [
    me.planted && (me.planted.falling ? 'TOE-TAP FALL' : 'STRETCH ' + Math.round(me.stretch * 100) + '%'),
    me.plantT > 0.001 && !me.planted && 'RECOVER',
    me.move && me.move.type.toUpperCase(),
    me.sprint && 'SPRINT',
    me.squared && 'SQUARED',
    me.z > 0 && 'JUMP',
    me.diveT >= 0 && 'DIVE',
    me.groundT > 0 && 'DOWN',
    me.plantT > 0 && 'PLANT',
  ].filter(Boolean).join(' · ') || '—';
  const meter = sprintMeter(me.boost, me.boostHold, me.boostFast, S);
  if (st.mode === 'catch' && st.cm) {
    const cm = st.cm, cs = cm.stats, [lo, hi] = catchBandRange(S, cm.band);
    const bs = (k: string) => `${cs.bands[k].c}/${cs.bands[k].a}`;
    const n = cm.phase === 'air' ? cm.count : Math.min(cm.count + 1, S.catchThrowsPerBand);
    const next = st.carry ? 'running after the catch' : S.catchPaused ? 'PAUSED (Start)' : cm.phase === 'windup' ? 'throwing…' : cm.phase === 'air' ? 'ball in the air' : S.requireSnap && !S.catchAIReceiver ? 'press A (or Y to call)' : `in ${Math.max(0, cm.nextT - st.t).toFixed(1)} s`;
    const yacNow = st.carry ? st.carry.yac : cm.cur?.yac;
    const sign = st.carry?.goalSign ?? 1;
    const toLine = st.carry ? Math.max(0, (st.carry.goalY - st.players.wr.y) * sign) : null;
    stats.innerHTML = `
    <div class="row"><span>Mode</span><b style="color:#80deea">CATCH</b></div>
    <div class="row"><span>Band</span><b>${cm.band.toUpperCase()} ${lo}-${hi} yd — throw ${n}/${S.catchThrowsPerBand}</b></div>
    <div class="row"><span>Catches</span><b>${cs.comp} / ${cs.att}${cs.att ? ' (' + Math.round(cs.comp / cs.att * 100) + '%)' : ''}</b></div>
    <div class="row"><span>Short · Med · Deep</span><b>${bs('short')} · ${bs('medium')} · ${bs('deep')}</b></div>
    <div class="row"><span>Streak</span><b>${cs.streak} (best ${cs.best})</b></div>
    <div class="row"><span>YAC</span><b>${yacNow == null ? '—' : yacNow.toFixed(1) + ' yd'}${cs.yacTotal ? ' · total ' + cs.yacTotal.toFixed(1) : ''}</b></div>
    <div class="row"><span>${st.carry?.goalLabel === 'TARGET' ? 'To target' : 'To end zone'}</span><b>${toLine == null ? '—' : toLine.toFixed(1) + ' yd'}</b></div>
    <div class="row"><span>Last result</span><b>${cs.last}</b></div>
    <div class="row"><span>Last throw</span><b>${cm.cur ? (cm.cur.lob ? 'lob ' : 'bullet ') + cm.cur.d.toFixed(1) + ' yd' : '—'}</b></div>
    <div class="row"><span>Next throw</span><b>${next}</b></div>
    <div class="row"><span>Speed</span><b>${sp.toFixed(1)} yd/s</b></div>
    ${meter}
    <div class="row"><span>State</span><b>${flags}</b></div>
    <div class="row"><span>Input</span><b>${input.padConnected ? 'gamepad ✓' : 'kb+mouse'} · ${rendererName}</b></div>`;
  } else if (st.mode === 'coverage') {
    const cov = st.cov;
    const avg = cov.throws ? cov.sepSum / cov.throws : 0;
    const holder = st.ball.holder ? st.players[st.ball.holder] : undefined;
    const sign = st.carry?.goalSign ?? 1;
    const toLine = st.carry && holder ? Math.max(0, (st.carry.goalY - holder.y) * sign) : null;
    const who = st.controlled === 'df' ? 'DEF' : st.controlled === 'wr' ? 'WR' : st.controlled.toUpperCase();
    stats.innerHTML = `
    <div class="row"><span>Mode</span><b style="color:#ce93d8">COVERAGE</b></div>
    <div class="row"><span>Controlling</span><b>${who}</b></div>
    <div class="row"><span>Route</span><b>${st.route}</b></div>
    <div class="row"><span>Targets</span><b>${cov.targets}</b></div>
    <div class="row"><span>Catches allowed</span><b>${cov.catches}</b></div>
    <div class="row"><span>PBU</span><b>${cov.pbus}</b></div>
    <div class="row"><span>INT</span><b>${cov.ints}</b></div>
    <div class="row"><span>Avg separation</span><b>${cov.throws ? avg.toFixed(1) + ' yd' : '—'}</b></div>
    <div class="row"><span>Last</span><b>${cov.last}${cov.flags ? ' · FLAG ' + cov.flags : ''}</b></div>
    <div class="row"><span>${holder?.role === 'DF' ? 'Return' : 'YAC'}</span><b>${st.carry ? st.carry.yac.toFixed(1) + ' yd' : '—'}</b></div>
    <div class="row"><span>${holder?.role === 'DF' ? 'To home' : 'To end zone'}</span><b>${toLine == null ? '—' : toLine.toFixed(1) + ' yd'}</b></div>
    <div class="row"><span>Speed</span><b>${sp.toFixed(1)} yd/s</b></div>
    ${meter}
    <div class="row"><span>State</span><b>${flags}</b></div>
    <div class="row"><span>Play</span><b>${st.play.phase}</b></div>
    <div class="row"><span>Input</span><b>${input.padConnected ? 'gamepad ✓' : 'kb+mouse'} · ${rendererName}</b></div>`;
  } else if (st.mode === 'free') {
    const n = Object.keys(st.players).length;
    stats.innerHTML = `
    <div class="row"><span>Mode</span><b style="color:#80cbc4">THROW AROUND</b></div>
    <div class="row"><span>Ball</span><b>${st.ball.holder ? (st.players[st.ball.holder]?.name || st.ball.holder) : st.ball.state}</b></div>
    <div class="row"><span>You</span><b>${me.name || st.controlled}</b></div>
    <div class="row"><span>On the field</span><b>${n}</b></div>
    <div class="row"><span>Speed</span><b>${sp.toFixed(1)} yd/s</b></div>
    ${meter}
    <div class="row"><span>State</span><b>${flags}</b></div>
    <div class="row"><span>Input</span><b>${input.padConnected ? 'gamepad ✓' : 'kb+mouse'} · ${rendererName}</b></div>`;
  } else if (st.mode === 'run') {
    const c = st.players.rb, d = st.players.df, rs = st.runScore;
    const yds = Math.max(0, 110 - c.y);
    stats.innerHTML = `
    <div class="row"><span>Mode</span><b style="color:#ffab40">1v1 RUN</b></div>
    <div class="row"><span>Score</span><b>TD ${rs.td} · Stops ${rs.stops}</b></div>
    <div class="row"><span>Last result</span><b>${rs.last}</b></div>
    <div class="row"><span>Controlling</span><b>${st.controlled === 'rb' ? 'Carrier (orange)' : 'Defender (purple)'}</b></div>
    <div class="row"><span>To goal</span><b>${yds.toFixed(1)} yd</b></div>
    <div class="row"><span>Ball hand</span><b>${c.handSwitchT > 0 ? 'switching…' : c.hand === 'L' ? 'LEFT' : 'RIGHT'}${c.stiffArm ? ' · stiff-arm ' + c.stiffArm : ''}</b></div>
    <div class="row"><span>Speed</span><b>${sp.toFixed(1)} yd/s</b></div>
    ${meter}
    <div class="row"><span>Last pitch</span><b>${st.lastPitch ? (st.lastPitch.flicked ? 'flick ' : 'default ') + st.lastPitch.side + ' ' + st.lastPitch.pitchSpeed + ' yd/s' + (st.lastPitch.caughtBy ? ' ✓' : '') : '—'}</b></div>
    <div class="row"><span>State</span><b>${flags}${d.squared ? ' · DEF SQUARED' : ''}</b></div>
    <div class="row"><span>Play</span><b>${st.play.phase}</b></div>
    <div class="row"><span>Input</span><b>${input.padConnected ? 'gamepad ✓' : 'kb+mouse'} · ${rendererName}</b></div>`;
  } else {
    const holder = st.players[st.ball.holder || 'wr'];
    const sign = st.carry?.goalSign ?? 1;
    const toLine = st.carry && holder ? Math.max(0, (st.carry.goalY - holder.y) * sign) : null;
    const lineLabel = !st.carry ? 'YAC total' : holder?.role === 'DF' ? 'Return' : st.carry.goalLabel === 'TARGET' ? 'To target' : 'To end zone';
    const cov = st.players.df ? st.cov : null;
    const avg = cov && cov.throws ? cov.sepSum / cov.throws : 0;
    stats.innerHTML = `
    <div class="row"><span>Mode</span><b>THROW</b></div>
    <div class="row"><span>Completions</span><b>${st.stats.comp} / ${st.stats.att}</b></div>
    <div class="row"><span>Last result</span><b>${st.stats.last}</b></div>
    <div class="row"><span>Controlling</span><b>${st.controlled === 'qb' ? 'QB (red)' : st.controlled === 'wr' ? 'WR (blue)' : st.controlled.toUpperCase()}</b></div>
    <div class="row"><span>WR route (AI)</span><b>${st.route}</b></div>
    ${cov ? `<div class="row"><span>Coverage</span><b>${cov.catches} catch · ${cov.pbus} PBU · ${cov.ints} INT${cov.throws ? ' · sep ' + avg.toFixed(1) : ''}</b></div>` : ''}
    <div class="row"><span>YAC</span><b>${st.carry ? st.carry.yac.toFixed(1) + ' yd' : (st.stats.yacTotal ? st.stats.lastYac.toFixed(1) + ' yd' : '—')}</b></div>
    <div class="row"><span>${lineLabel}</span><b>${toLine == null ? st.stats.yacTotal.toFixed(1) + ' yd' : toLine.toFixed(1) + ' yd'}</b></div>
    <div class="row"><span>Speed</span><b>${sp.toFixed(1)} yd/s</b></div>
    ${meter}
    <div class="row"><span>State</span><b>${flags}</b></div>
    <div class="row"><span>Play</span><b>${st.play.phase}</b></div>
    <div class="row"><span>Input</span><b>${input.padConnected ? 'gamepad ✓' : 'kb+mouse'} · ${rendererName}</b></div>`;
  }
  const preSnap = S.requireSnap && ((st.mode !== 'catch' && st.play.phase === 'pre') || (st.mode === 'catch' && !!st.cm && st.cm.phase === 'wait' && !S.catchPaused && !S.catchAIReceiver && st.t >= st.cm.readyT));
  prompt.style.display = preSnap ? 'block' : 'none';
  if (preSnap) prompt.textContent = input.padConnected ? 'Press A to snap' : 'Press Space (A) to snap';
  const feedback = st.feedback;
  const age = feedback ? st.t - feedback.t : 99;
  fb.textContent = feedback ? feedback.text : '';
  fb.style.color = feedback ? feedback.color : '#fff';
  fb.style.opacity = age < 1.4 ? '1' : '0';
  pad.style.display = input.padConnected ? 'none' : 'block';
  const throwing = (st.mode === 'throw' && st.controlled === 'qb' && st.ball.holder === 'qb')
    || (st.mode === 'free' && st.ball.holder === st.controlled);
  const showPow = throwing && inp.charge !== null;
  power.style.display = showPow ? 'block' : 'none';
  if (showPow && inp.charge !== null) {
    const fill = power.querySelector('.fill') as HTMLElement | null;
    if (fill) fill.style.left = `${inp.charge * 296}px`;
    const powv = document.getElementById('powv');
    if (powv) powv.textContent = Math.round(inp.charge * 100) + '%';
  }
}

export function updateFloaters(opts: {
  st: SimState;
  renderer: FieldRenderer;
  poseSheet: boolean;
  floatEl: HTMLElement;
}) {
  const { st, renderer, poseSheet, floatEl } = opts;
  let html = '';
  for (const f of st.floaters) {
    const age = st.t - f.t;
    const s = renderer.fieldToScreen(f.x, f.y, 2.2);
    html += `<div style="left:${s.x}px;top:${s.y - age * 40}px;color:${f.color};opacity:${clamp(1.3 - age, 0, 1)}">${esc(f.text)}</div>`;
  }
  for (const p of Object.values(st.players)) {
    if (!p.name) continue;
    const s = renderer.fieldToScreen(p.x, p.y, 2.5);
    const col = p.tint != null ? '#' + p.tint.toString(16).padStart(6, '0') : '#fff';
    html += `<div class="nameplate" style="left:${s.x}px;top:${s.y}px;color:${col}">${esc(p.name)}</div>`;
  }
  if (poseSheet && renderer.sheetLabels) {
    for (const l of renderer.sheetLabels()) {
      const s = renderer.fieldToScreen(l.x, l.y, 0);
      html += `<div style="left:${s.x}px;top:${s.y}px;color:#fff;font-size:15px">${l.text}</div>`;
    }
  }
  floatEl.innerHTML = html;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}
