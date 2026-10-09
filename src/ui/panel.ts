import GUI from 'lil-gui';
import { ROUTES } from '../config/constants';
import { DEFAULTS, type Settings } from '../config/defaults';
import {
  browserStore,
  countRecognized,
  deletePreset,
  downloadSettings,
  loadPresetStore,
  mergeSettings,
  presetNames,
  presetSettings,
  savePresetStore,
  saveSettings,
  toDocument,
  upsertPreset,
  type PresetStore,
} from '../config/settings';
import { MODE_LABEL, MODE_LABELS, modeFromLabel, type ModeId } from '../modes';
import type { Sim } from '../sim/sim';
import type { FieldRenderer } from '../render/types';

export interface SandboxUi {
  posePreview: boolean;
  route: string;
  controlling: string;
  mode: string;
  reset: () => void;
  switchPlayer: () => void;
  resetDefaults: () => void;
  copyJSON: () => Promise<void>;
  preset: string;
  savePreset: () => void;
  loadPreset: () => void;
  deletePreset: () => void;
  exportFile: () => void;
  importFile: () => void;
}

let toastTimer = 0;
export function toast(msg: string) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.style.display = 'none'; }, 1800);
}

export function createPanel(opts: {
  S: Settings;
  sim: Sim;
  getRenderer: () => FieldRenderer;
  setRenderer: (name: 'three' | 'canvas2d') => void;
}) {
  const { S, sim } = opts;
  const st = sim.state;
  const store = browserStore();
  let presets: PresetStore = loadPresetStore(store);
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  const sandbox: SandboxUi = {
    posePreview: false,
    route: st.route,
    controlling: 'QB',
    mode: 'Throw',
    preset: '',
    reset: () => sim.reset(),
    switchPlayer: () => switchControl(),
    resetDefaults: () => {
      Object.assign(S, DEFAULTS);
      saveSettings(store, S);
      refresh();
      if (opts.getRenderer().name !== S.renderer) opts.setRenderer(S.renderer);
      toast('Settings reset to defaults');
    },
    copyJSON: async () => {
      const txt = JSON.stringify(toDocument(S), null, 2);
      try {
        await navigator.clipboard.writeText(txt);
        toast('Settings JSON copied to clipboard');
      } catch {
        console.log(txt);
        window.prompt('Copy settings JSON:', txt);
      }
    },
    savePreset: () => {
      const suggested = sandbox.preset && sandbox.preset !== '(none)' ? sandbox.preset : '';
      const name = window.prompt('Save preset as', suggested);
      if (name == null) return;
      const trimmed = name.trim();
      if (!trimmed || trimmed === '(none)') { toast('Pick a preset name'); return; }
      if (presets.presets[trimmed] && !window.confirm(`Overwrite preset "${trimmed}"?`)) return;
      presets = upsertPreset(presets, trimmed, S);
      savePresetStore(store, presets);
      saveSettings(store, S);
      refreshPresetList(trimmed);
      toast(`Saved preset "${trimmed}"`);
    },
    loadPreset: () => {
      const next = presetSettings(presets, sandbox.preset);
      if (!next) { toast('No preset selected'); return; }
      applySettings(next);
      toast(`Loaded "${sandbox.preset}"`);
    },
    deletePreset: () => {
      if (!presets.presets[sandbox.preset]) { toast('No preset selected'); return; }
      if (!window.confirm(`Delete preset "${sandbox.preset}"?`)) return;
      const name = sandbox.preset;
      presets = deletePreset(presets, name);
      savePresetStore(store, presets);
      refreshPresetList();
      toast(`Deleted "${name}"`);
    },
    exportFile: () => {
      downloadSettings(S);
      toast('Settings file downloaded');
    },
    importFile: () => { fileInput.value = ''; fileInput.click(); },
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (countRecognized(parsed) === 0) { toast('No recognized settings in that file'); return; }
      applySettings(mergeSettings(parsed));
      toast(`Imported ${file.name}`);
    } catch {
      toast("Couldn't read that settings file");
    }
  });

  function applySettings(next: Settings) {
    Object.assign(S, next);
    saveSettings(store, S);
    refresh();
    if (opts.getRenderer().name !== S.renderer) opts.setRenderer(S.renderer);
  }

  function switchControl() {
    if (st.mode === 'catch') { toast('Catch mode: you are always the receiver'); return; }
    const pair = st.mode === 'run' ? ['rb', 'df'] : ['qb', 'wr'];
    st.controlled = st.controlled === pair[0] ? pair[1] : pair[0];
    sandbox.controlling = st.controlled.toUpperCase();
  }
  function setMode(m: ModeId) {
    sim.setMode(m);
    sandbox.mode = MODE_LABEL[m];
    sandbox.controlling = st.controlled.toUpperCase();
  }

  const gui = new GUI({ title: 'Sandbox settings' });
  const fp = gui.addFolder('Play');
  fp.add(sandbox, 'mode', MODE_LABELS).name('Mode (N / D-pad ▲)').onChange((v: string) => setMode(modeFromLabel(v))).listen();
  fp.add(S, 'requireSnap').name('Require snap (A / Space)');
  fp.add(sandbox, 'route', [...ROUTES]).name('WR route (AI)').onChange((v: string) => { st.route = v; sim.reset(); }).listen();
  fp.add(sandbox, 'controlling').name('Controlling').listen().disable();
  fp.add(sandbox, 'switchPlayer').name('Switch QB ⇄ WR (Tab / Back)');
  fp.add(sandbox, 'reset').name('Reset play (R / Start)');

  const fm = gui.addFolder('Movement');
  fm.add(S, 'accel', 5, 80, 0.5).name('accel (yd/s²)');
  fm.add(S, 'decel', 5, 80, 0.5).name('decel over target (yd/s²)');
  fm.add(S, 'releaseDecel', 5, 100, 0.5).name('stick-release decel');
  fm.add(S, 'turnRate', 2, 40, 0.5).name('turn rate @ slow (rad/s)');
  fm.add(S, 'cutPenalty', 0, 8, 0.05).name('cut sharpness penalty');
  fm.add(S, 'cutBleed', 0, 1.5, 0.01).name('speed bleed per rad');
  fm.add(S, 'reverseAngleDeg', 60, 180, 1).name('plant-reverse angle°');
  fm.add(S, 'jogSpeed', 1, 10, 0.1).name('jog speed (yd/s)');
  fm.add(S, 'fullSpeed', 3, 12, 0.1).name('full speed (yd/s)');
  fm.add(S, 'sprintAccelMult', 0.1, 1.5, 0.01).name('accel/cut mult @ max boost');
  fm.add(S, 'ltSpeedCap', 1, 10, 0.1).name('LT speed cap (yd/s)');
  fm.add(S, 'deadzone', 0, 0.5, 0.01).name('stick radial deadzone');
  fm.add(S, 'facingTurnRate', 2, 40, 0.5).name('facing turn rate');

  const fr = gui.addFolder('1v1 Run: carrier moves');
  addSliders(fr, [
    ['sidestepNormal', 0.2, 4, 0.05, 'sidestep dist @ run (yd)'],
    ['sidestepSprint', 0, 3, 0.05, 'sidestep dist @ sprint (yd)'],
    ['sidestepAngleNormal', 0, 90, 1, 'sidestep angle @ run°'],
    ['sidestepAngleSprint', 0, 60, 1, 'sidestep angle @ sprint°'],
    ['sidestepTime', 0.05, 0.4, 0.01, 'sidestep time (s)'],
    ['flickThreshold', 0.3, 1, 0.01, 'flick threshold'],
    ['flickRearm', 0.05, 0.6, 0.01, 'flick re-arm (center) <'],
    ['flickCooldown', 0, 1, 0.01, 'move cooldown (s)'],
    ['truckBurst', 0, 4, 0.05, 'truck burst (yd/s)'],
    ['truckDuration', 0.1, 1, 0.01, 'truck duration (s)'],
    ['truckBonus', 0, 0.9, 0.01, 'truck tackle-break bonus'],
    ['truckContactSlow', 0.1, 1, 0.01, 'truck contact speed ×'],
    ['spinDuration', 0.15, 0.8, 0.01, 'spin duration (s)'],
    ['spinMomentumAngle', 0, 180, 1, 'spin momentum angle°'],
    ['spinDrift', 0, 6, 0.1, 'spin drift strength (yd/s)'],
    ['spinSpeedKeep', 0.3, 1, 0.01, 'spin speed kept ×'],
    ['spinVulnerable', 0, 0.8, 0.01, 'spin vulnerable after (s)'],
    ['spinCounter', 0, 1, 0.01, 'spin vs arm/dive tackle ×'],
    ['jukeBackstep', 0, 2.5, 0.05, 'juke backstep (yd)'],
    ['jukeHopTime', 0.05, 0.4, 0.01, 'juke hop time (s)'],
    ['jukeReaccelWindow', 0, 1.2, 0.01, 'juke re-accel window (s)'],
    ['jukeReaccelMult', 1, 4, 0.05, 'juke re-accel ×'],
    ['hurdleHeight', 0.3, 1.5, 0.05, 'hurdle height (yd)'],
    ['hurdleDuration', 0.2, 1, 0.01, 'hurdle timing / airtime (s)'],
    ['hurdleClear', 0.1, 1, 0.01, 'height to clear a dive (yd)'],
    ['runDiveDistance', 0.5, 5, 0.1, 'carrier dive distance (yd)'],
    ['stiffArmStrength', 0, 1, 0.01, 'stiff-arm strength'],
    ['stiffArmReach', 0.5, 3, 0.05, 'stiff-arm reach (yd)'],
    ['stiffArmPush', 0, 10, 0.1, 'stiff-arm push (yd/s)'],
    ['tapMaxTime', 0.05, 0.5, 0.01, 'LB/RB tap vs hold (s)'],
    ['handSwitchTime', 0, 0.8, 0.01, 'hand-switch time (s)'],
  ]);
  const ftk = gui.addFolder('1v1 Run: tackling & fumbles');
  addSliders(ftk, [
    ['wrapReach', 0.5, 3, 0.05, 'wrap-up reach (yd)'],
    ['wrapWindow', 0.05, 0.6, 0.01, 'wrap-up window (s)'],
    ['wrapLunge', 0, 5, 0.1, 'wrap-up lunge (yd/s)'],
    ['wrapSuccess', 0, 1, 0.01, 'wrap-up base success'],
    ['diveTackleDist', 0.5, 6, 0.1, 'dive tackle distance (yd)'],
    ['diveTackleReach', 0.3, 2.5, 0.05, 'dive tackle reach (yd)'],
    ['diveTackleSuccess', 0, 1, 0.01, 'dive tackle base success'],
    ['diveTackleRecovery', 0.2, 2.5, 0.05, 'dive tackle recovery (s)'],
    ['noLTTackleMult', 0.1, 1, 0.01, 'tackle without LT ×'],
    ['behindPenalty', 0, 1, 0.01, 'from-behind penalty'],
    ['speedPenalty', 0, 0.2, 0.005, 'carrier speed penalty /yd/s'],
    ['bigHitSpeed', 2, 15, 0.1, 'big-hit closing speed'],
    ['missStagger', 0, 1, 0.01, 'missed wrap stagger (s)'],
    ['brokenStagger', 0, 1.5, 0.01, 'broken tackle stagger (s)'],
    ['brokenSlow', 0.2, 1, 0.01, 'broken tackle speed ×'],
    ['tackleCooldown', 0.1, 1.5, 0.01, 'tackle cooldown (s)'],
    ['fumbleBase', 0, 0.3, 0.005, 'fumble base chance'],
    ['ballSideFumbleMult', 1, 6, 0.1, 'ball-on-hit-side fumble ×'],
    ['bigHitFumbleMult', 1, 6, 0.1, 'big-hit fumble ×'],
    ['hurdleWrapFumbleMult', 1, 8, 0.1, 'hurdle-into-wrap fumble ×'],
    ['punchFumble', 0, 0.6, 0.01, 'punch fumble chance'],
    ['punchReach', 0.5, 3, 0.05, 'punch reach (yd)'],
    ['punchCooldown', 0.2, 2, 0.05, 'punch cooldown (s)'],
  ]);
  const fai = gui.addFolder('1v1 Run: AI & setup');
  addSliders(fai, [
    ['aiAggression', 0, 1, 0.01, 'AI defender aggressiveness'],
    ['aiReaction', 0, 0.6, 0.01, 'AI reaction delay (s)'],
    ['aiLead', 0, 1.5, 0.05, 'AI pursuit lead'],
    ['aiMoveRate', 0, 1, 0.01, 'AI carrier move chance'],
    ['runStartDist', 10, 50, 1, 'carrier start (yd from goal)'],
    ['runDefenderGap', 3, 25, 0.5, 'defender start gap (yd)'],
  ]);
  [fr, ftk, fai].forEach((f) => f.close());

  const fpt = gui.addFolder('Pitch (double-tap LB/RB) & backs');
  fpt.add(S, 'trailingBack').name('1v1: trailing back (needs reset)');
  fpt.add(S, 'throwModeRB').name('Throw: RB beside QB (needs reset)');
  addSliders(fpt, [
    ['doubleTapWindow', 0.1, 0.6, 0.01, 'double-tap window (s)'],
    ['pitchFlickWindow', 0, 0.5, 0.01, 'flick-after window (s)'],
    ['pitchMinSpeed', 2, 15, 0.1, 'pitch speed soft (yd/s)'],
    ['pitchMaxSpeed', 5, 25, 0.1, 'pitch speed firm (yd/s)'],
    ['pitchDefaultSpeed', 2, 25, 0.1, 'no-flick pitch speed'],
    ['pitchDefaultAngle', 60, 180, 1, 'no-flick angle° (from run dir)'],
    ['pitchMinAngle', 0, 120, 1, 'flick clamp: min angle°'],
    ['pitchLoft', 0, 5, 0.1, 'pitch loft (yd/s up)'],
    ['pitchInherit', 0, 1, 0.01, 'carrier momentum inherited'],
    ['pitchCatchReach', 0.5, 3, 0.05, 'AI pitch catch reach (yd)'],
    ['pitchCatchReliability', 0, 1, 0.01, 'AI pitch catch reliability'],
    ['trailDepth', 1, 8, 0.1, 'trail depth (yd)'],
    ['trailWidth', 0, 10, 0.1, 'trail width (yd)'],
  ]);
  fpt.close();

  const fs = gui.addFolder('Sprint (L3 / Shift pumps)');
  fs.add(S, 'boostPerPump', 0.1, 1.5, 0.05).name('boost per pump (yd/s)');
  fs.add(S, 'sprintMaxSpeed', 8, 16, 0.05).name('max sprint speed (yd/s)');
  fs.add(S, 'boostHoldDelay', 0, 2, 0.05).name('hold delay (s)');
  fs.add(S, 'boostDecayRate', 0.1, 6, 0.05).name('decay rate (yd/s²)');
  fs.add(S, 'cutDecayAngleDeg', 5, 120, 1).name('cut decay angle°');
  fs.add(S, 'cutDecayMult', 1, 10, 0.1).name('cut / ease-off decay ×');
  fs.add(S, 'easeOffStick', 0.3, 1, 0.01).name('ease-off stick <');

  const fcm = gui.addFolder('Catch mode');
  fcm.add(S, 'catchPaused').name('Pause throws (Start)').listen();
  fcm.add(S, 'catchAIReceiver').name('AI catches (demo)');
  addSliders(fcm, [
    ['catchShortMin', 3, 30, 0.5, 'Short min (yd)'],
    ['catchShortMax', 5, 40, 0.5, 'Short max (yd)'],
    ['catchMedMin', 5, 50, 0.5, 'Medium min (yd)'],
    ['catchMedMax', 10, 60, 0.5, 'Medium max (yd)'],
    ['catchDeepMin', 15, 70, 0.5, 'Deep min (yd)'],
    ['catchDeepMax', 20, 80, 0.5, 'Deep max (yd)'],
    ['catchThrowsPerBand', 2, 6, 1, 'throws per band'],
    ['catchInterval', 0.5, 8, 0.1, 'seconds between throws'],
    ['catchLobShare', 0, 1, 0.05, 'lob share'],
    ['catchWindup', 0.2, 1.5, 0.05, 'QB windup cue (s)'],
    ['catchSidelineShare', 0, 1, 0.05, 'sideline (toe-tap) share'],
    ['callReactionDelay', 0, 1, 0.05, 'call-for-ball QB reaction (s)'],
    ['callCooldown', 0.3, 5, 0.1, 'call cooldown (s)'],
  ]);
  fcm.add(S, 'catchCycleBands').name('cycle bands (off = random)');
  fcm.close();

  const ft = gui.addFolder('Throwing');
  ft.add(S, 'minThrowSpeed', 5, 25, 0.5).name('min throw speed (yd/s)');
  ft.add(S, 'maxThrowSpeed', 10, 40, 0.5).name('max throw speed (yd/s)');
  ft.add(S, 'minLoftDeg', 0, 20, 0.5).name('min loft angle°');
  ft.add(S, 'maxLoftDeg', 15, 60, 0.5).name('max loft angle°');
  ft.add(S, 'maxAimRange', 10, 70, 1).name('max aim range (yd)');
  ft.add(S, 'stepIntoBonus', 0, 0.5, 0.01).name('step-into bonus');
  ft.add(S, 'backFootPenalty', 0, 0.6, 0.01).name('back-foot penalty');
  ft.add(S, 'baseInaccuracy', 0, 3, 0.05).name('scatter (yd per 20yd)');
  ft.add(S, 'unsquaredInaccuracy', 1, 4, 0.05).name('not-squared scatter ×');
  ft.add(S, 'kbChargeTime', 0.2, 2, 0.05).name('kb/mouse full-power time');

  const fc = gui.addFolder('Catching');
  fc.add(S, 'catchWindowMs', 40, 400, 5).name('Y catch window (ms)');
  fc.add(S, 'catchReach', 0.4, 3, 0.05).name('catch reach radius (yd)');
  fc.add(S, 'reachHeight', 1.5, 3.5, 0.05).name('standing reach height');
  fc.add(S, 'oneHandReach', 0.5, 4, 0.05).name('one-hand reach (yd)');
  fc.add(S, 'oneHandWindowMs', 20, 300, 5).name('one-hand window (ms)');
  fc.add(S, 'oneHandSuccess', 0, 1, 0.01).name('one-hand success');
  fc.add(S, 'ltWindowBonusMs', 0, 300, 5).name('LT two-hand bonus (ms)');
  fc.add(S, 'jumpHeight', 0.1, 1.5, 0.05).name('jump height (yd)');
  fc.add(S, 'jumpDuration', 0.2, 1.2, 0.01).name('jump duration (s)');
  fc.add(S, 'diveDistance', 0.5, 6, 0.1).name('dive distance (yd)');
  fc.add(S, 'diveDuration', 0.1, 0.8, 0.01).name('dive duration (s)');
  fc.add(S, 'diveRecovery', 0.1, 2.5, 0.05).name('dive recovery (s)');
  fc.add(S, 'diveReachBonus', 0, 2, 0.05).name('dive extra reach (yd)');
  fc.add(S, 'plantLockout', 0, 0.4, 0.01).name('RB plant lockout (s)');
  fc.add(S, 'plantFallTime', 0.2, 2, 0.01).name('RB hold → toe-tap fall (s)');
  fc.add(S, 'stretchMaxReach', 0, 3, 0.05).name('stretch max extra reach (yd)');
  fc.add(S, 'stretchRecoveryMult', 0, 2, 0.05).name('stretch release recovery ×hold');
  fc.add(S, 'fallLeanTime', 0.05, 1, 0.01).name('fall lean time (s)');
  fc.add(S, 'fallExtraReach', 0, 2, 0.05).name('fall extra reach (yd)');
  fc.add(S, 'fallRecovery', 0.2, 3, 0.05).name('fall recovery on ground (s)');
  fc.add(S, 'batReach', 0.5, 3, 0.05).name('bat reach (yd)');
  fc.add(S, 'aiTimingErrorMs', 0, 200, 5).name('AI catch timing σ (ms)');
  fc.add(S, 'autoThrowDelay', 0.5, 5, 0.1).name('AI QB throw delay (s)');

  const fv = gui.addFolder('View');
  fv.add(S, 'cameraMinExtent', 15, 120, 1).name('camera zoom: min yards visible').listen();
  fv.add(S, 'cameraPadding', 0, 20, 0.5).name('framing padding (yd)');
  fv.add(S, 'playerScale', 0.8, 2, 0.05).name('player visual scale');
  fv.add(S, 'playerVisuals', ['model', 'capsule']).name('Player visuals (3D)');
  fv.add(S, 'modelOutline').name('model outline');
  fv.add(sandbox, 'posePreview').name('Pose preview (P)').listen();
  fv.add(S, 'cameraFollow', 0.5, 12, 0.1).name('camera follow');
  fv.add(S, 'showReach').name('show WR reach ring');
  fv.add(S, 'showArc').name('show ball arc');
  fv.add(S, 'autoReset').name('auto reset after play');
  fv.add(S, 'renderer', ['three', 'canvas2d']).name('renderer (M)').onChange((v: string) => opts.setRenderer(v === 'canvas2d' ? 'canvas2d' : 'three'));

  const fpre = gui.addFolder('Presets');
  const names = presetNames(presets);
  sandbox.preset = names[0] || '(none)';
  const presetCtrl = fpre.add(sandbox, 'preset', names.length ? names : ['(none)']).name('Saved preset');
  fpre.add(sandbox, 'savePreset').name('Save as…');
  fpre.add(sandbox, 'loadPreset').name('Load');
  fpre.add(sandbox, 'deletePreset').name('Delete');
  fpre.add(sandbox, 'exportFile').name('Export JSON file');
  fpre.add(sandbox, 'importFile').name('Import JSON file');

  gui.add(sandbox, 'resetDefaults').name('↺ Reset to defaults');
  gui.add(sandbox, 'copyJSON').name('⧉ Copy settings JSON');
  gui.onFinishChange(() => saveSettings(store, S));
  [ft, fc, fv].forEach((f) => f.close());

  function refresh() { gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
  function refreshPresetList(select?: string) {
    const list = presetNames(presets);
    const options = list.length ? list : ['(none)'];
    sandbox.preset = select && list.includes(select) ? select : (list.includes(sandbox.preset) ? sandbox.preset : options[0]);
    presetCtrl.options(options);
    presetCtrl.updateDisplay();
  }
  function addSliders(folder: GUI, rows: Array<[keyof Settings, number, number, number, string]>) {
    for (const [key, min, max, step, name] of rows) folder.add(S, key as 'accel', min, max, step).name(name);
  }

  return { gui, sandbox, refresh, setMode, switchControl };
}
