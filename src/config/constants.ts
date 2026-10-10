/** Field and sim constants. Units are yards and seconds.
 *  sim x = across the field, sim y = downfield, sim z = height. */

export const FIELD_W = 160 / 3; // 53.33 yd
export const FIELD_L = 120; // incl. end zones; goal lines at y=10 and y=110
export const GRAV = 10.73; // 32.2 ft/s^2 in yd/s^2
export const LOS_Y = 35; // own 25-yard line
export const CATCH_H = 1.4; // chest height throws are aimed at
export const RELEASE_H = 2.0;
export const JOG_TILT = 0.65; // stick tilt where jog speed is reached
export const STEP = 1 / 120;
export const CAM_FOV = 42;
export const ROUTES = ['go', 'slant', 'out', 'hitch', 'curl', 'post', 'corner', 'comeback', 'dig'] as const;
/** Own goal line. An interception return scores by crossing this. */
export const HOME_Y = 10;
export type RouteName = (typeof ROUTES)[number];

/** One route the receiver AI can run. Points are yards from the snap spot, x across and y downfield. */
export interface RouteDef {
  name: RouteName;
  points: { x: number; y: number }[];
  /** Waypoint the quarterback is timing, usually the break. */
  throwAt: number;
  /** Earliest and latest minimum hold, seconds. Each play rolls a clock in this range. */
  minHold: [number, number];
}

export const ROUTE_DEFS: readonly RouteDef[] = [
  { name: 'go', points: [{ x: 0, y: 20 }, { x: 0, y: 50 }], throwAt: 0, minHold: [2.0, 2.6] },
  { name: 'slant', points: [{ x: 0, y: 3 }, { x: 10, y: 12 }, { x: 26, y: 28 }], throwAt: 1, minHold: [0.9, 1.2] },
  { name: 'out', points: [{ x: 0, y: 10 }, { x: -9.5, y: 10 }], throwAt: 1, minHold: [1.4, 1.8] },
  { name: 'hitch', points: [{ x: 0, y: 6 }, { x: 0, y: 5 }], throwAt: 1, minHold: [0.9, 1.2] },
  { name: 'curl', points: [{ x: 0, y: 12 }, { x: 2.5, y: 10 }], throwAt: 1, minHold: [1.4, 1.8] },
  { name: 'post', points: [{ x: 0, y: 12 }, { x: 14, y: 28 }], throwAt: 1, minHold: [2.0, 2.6] },
  { name: 'corner', points: [{ x: 0, y: 10 }, { x: -8, y: 26 }], throwAt: 1, minHold: [2.0, 2.6] },
  { name: 'comeback', points: [{ x: 0, y: 18 }, { x: 0, y: 12 }], throwAt: 1, minHold: [2.0, 2.6] },
  { name: 'dig', points: [{ x: 0, y: 10 }, { x: 16, y: 10 }], throwAt: 1, minHold: [1.4, 1.8] },
];

export function routeDef(name: string): RouteDef {
  return ROUTE_DEFS.find((r) => r.name === name) || ROUTE_DEFS[0];
}
export const GOAL_Y = 110;

export const SETTINGS_KEY = 'tdfb.sandbox.settings.v1';
export const PRESETS_KEY = 'tdfb.sandbox.presets.v1';
/** Wrapped settings documents. Flat prototype saves and schema 5 `{ values }` bags still load. */
export const SETTINGS_SCHEMA_VERSION = 6;
