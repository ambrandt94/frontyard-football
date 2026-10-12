import type { SimState } from '../sim/types';

export interface ViewTrail {
  pts: { x: number; y: number; z?: number }[];
  color: number;
}

export interface ViewState {
  cue: { x: number; y: number; frac: number } | null;
  trails: ViewTrail[];
  cam: {
    x: number;
    y: number;
    h: number;
    ext: number;
    /** Three.js rig. The flat renderer ignores everything but x, y, and h. */
    rig: 'all22' | 'topdown' | 'broadcast';
    fov: number;
    pitch: number;
    dist: number;
    azimuth: number;
    lookX: number;
    lookY: number;
  };
  reticle: { x: number; y: number } | null;
  preview: { x: number; y: number; z?: number }[] | null;
  /** 0 is a loft (blue), 1 is a bullet (orange). */
  previewLoft: number;
  previewRing: { x: number; y: number; r: number } | null;
  /** Dotted beads or a thin line. The local thrower only. */
  arcStyle: 'dotted' | 'line';
  /** 1 is the old ribbon width. */
  arcWidth: number;
  /** Peak opacity of the local preview. It still fades toward the landing spot. */
  arcOpacity: number;
  /** Soft, imprecise aim for everyone except the thrower. Null when it should stay hidden. */
  aimFuzz: { x: number; y: number; fromX: number; fromY: number; color: number; radius: number } | null;
  /** Direction-charge line, in field yards. */
  aimGuide: { x: number; y: number; x2: number; y2: number } | null;
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
