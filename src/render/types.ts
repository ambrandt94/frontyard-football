import type { SimState } from '../sim/types';

export interface ViewTrail {
  pts: { x: number; y: number; z?: number }[];
  color: number;
}

export interface ViewState {
  cue: { x: number; y: number; frac: number } | null;
  trails: ViewTrail[];
  cam: { x: number; y: number; h: number; ext: number };
  reticle: { x: number; y: number } | null;
  preview: { x: number; y: number; z?: number }[] | null;
  route: { x: number; y: number; z?: number }[] | null;
  showReach: boolean;
  showArc: boolean;
  qbCharge: number | null;
  poseSheet: boolean;
}

export interface FieldRenderer {
  name: 'three' | 'canvas2d';
  init(el: HTMLElement): void;
  sync(state: SimState, view: ViewState): void;
  render(): void;
  resize(): void;
  dispose(): void;
  screenToField(cx: number, cy: number): { x: number; y: number } | null;
  fieldToScreen(x: number, y: number, z?: number): { x: number; y: number };
  sheetLabels?: () => { text: string; x: number; y: number }[];
}
