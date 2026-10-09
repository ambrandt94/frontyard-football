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
export const GOAL_Y = 110;

export const SETTINGS_KEY = 'tdfb.sandbox.settings.v1';
export const PRESETS_KEY = 'tdfb.sandbox.presets.v1';
/** Wrapped settings documents. Flat prototype saves (no schemaVersion) still load. */
export const SETTINGS_SCHEMA_VERSION = 5;
