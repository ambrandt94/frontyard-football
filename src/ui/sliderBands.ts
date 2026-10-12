import type GUI from 'lil-gui';
import { DEFAULTS, isSettingsKey, type Settings } from '../config/defaults';
import { recommendedRange, SLIDER_CAP } from '../config/recommendations';

interface NumberCtrl {
  property: string | number | symbol;
  _min?: number;
  _max?: number;
  _step?: number;
  $slider?: HTMLElement;
  domElement: HTMLElement;
  min(v: number): NumberCtrl;
  max(v: number): NumberCtrl;
  step(v: number, explicit?: boolean): NumberCtrl;
  getValue(): unknown;
}

function tidy(n: number): number {
  const scale = Math.abs(n) >= 20 ? 1 : Math.abs(n) >= 2 ? 10 : 100;
  return Math.round(n * scale) / scale;
}

function widen(ctrl: NumberCtrl) {
  const key = String(ctrl.property);
  if (!isSettingsKey(key) || typeof ctrl._min !== 'number' || typeof ctrl._max !== 'number') return;
  const sample = DEFAULTS[key];
  if (typeof sample !== 'number') return;
  const oldMin = ctrl._min;
  const oldMax = ctrl._max;
  const oldSpan = Math.max(1e-6, oldMax - oldMin);
  let min = Math.min(oldMin, Math.max(0, sample * 0.25));
  let max = Math.max(oldMax, sample * 3);
  if (sample >= 0 && sample <= 1 && oldMax <= 1 && oldMin >= 0) {
    min = 0;
    max = 1;
  }
  const cap = SLIDER_CAP[key as keyof Settings];
  if (cap?.max != null) max = Math.max(oldMax, Math.min(max, cap.max));
  if (cap?.min != null) min = Math.min(oldMin, Math.max(min, cap.min));
  min = Math.min(oldMin, tidy(min));
  max = Math.max(oldMax, tidy(max));
  if (max <= min) max = min + (ctrl._step || 0.01);
  const grew = (max - min) / oldSpan;
  if (grew > 1.35 && typeof ctrl._step === 'number' && ctrl._step > 0) {
    const finer = ctrl._step >= 1 ? ctrl._step / 2 : tidy(ctrl._step / 2);
    ctrl.step(Math.max(0.001, finer));
  }
  ctrl.min(min);
  ctrl.max(max);
  paint(ctrl, min, max);
}

function paint(ctrl: NumberCtrl, min: number, max: number) {
  const key = String(ctrl.property);
  const slider = ctrl.$slider;
  if (!slider) return;
  const sample = isSettingsKey(key) && typeof DEFAULTS[key] === 'number' ? (DEFAULTS[key] as number) : min;
  const [recLo, recHi] = recommendedRange(key, sample);
  const span = Math.max(1e-6, max - min);
  const a = Math.max(0, Math.min(100, ((recLo - min) / span) * 100));
  const b = Math.max(a, Math.min(100, ((recHi - min) / span) * 100));
  let band = slider.querySelector('.rec-band') as HTMLElement | null;
  if (!band) {
    band = document.createElement('div');
    band.className = 'rec-band';
    slider.prepend(band);
  }
  band.style.left = `${a}%`;
  band.style.width = `${Math.max(0, b - a)}%`;
  mark(ctrl);
}

function mark(ctrl: NumberCtrl) {
  const key = String(ctrl.property);
  if (!isSettingsKey(key) || typeof DEFAULTS[key] !== 'number' || typeof ctrl._min !== 'number' || typeof ctrl._max !== 'number') return;
  const value = ctrl.getValue();
  if (typeof value !== 'number') return;
  const [lo, hi] = recommendedRange(key, DEFAULTS[key] as number);
  ctrl.domElement.classList.toggle('is-outside', value < lo || value > hi);
}

/** Widen every numeric slider and paint its recommended band. Returns a refresh for later edits. */
export function bindSliderBands(gui: GUI): () => void {
  const ctrls = gui.controllersRecursive() as unknown as NumberCtrl[];
  for (const ctrl of ctrls) widen(ctrl);
  return () => {
    for (const ctrl of ctrls) mark(ctrl);
  };
}
