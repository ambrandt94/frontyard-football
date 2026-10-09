import { DEFAULTS, type Settings } from './defaults';

/** Tuning a built-in feel is allowed to change. Everything else (catch windows, camera, toggles) stays put. */
export const CONTROL_PRESET_KEYS = [
  'accel', 'decel', 'releaseDecel', 'turnRate', 'cutPenalty', 'cutBleed', 'reverseAngleDeg',
  'jogSpeed', 'fullSpeed', 'sprintAccelMult',
  'boostPerPump', 'sprintMaxSpeed', 'boostHoldDelay', 'boostDecayRate', 'cutDecayAngleDeg', 'cutDecayMult', 'easeOffStick',
  'sidestepNormal', 'sidestepSprint', 'sidestepAngleNormal', 'sidestepAngleSprint', 'sidestepTime',
  'flickCooldown',
  'truckBurst', 'truckDuration', 'truckBonus', 'truckContactSlow',
  'spinDuration', 'spinMomentumAngle', 'spinDrift', 'spinSpeedKeep', 'spinVulnerable', 'spinCounter',
  'jukeBackstep', 'jukeHopTime', 'jukeReaccelWindow', 'jukeReaccelMult',
  'stiffArmStrength', 'stiffArmReach', 'stiffArmPush',
  'wrapSuccess', 'fumbleBase',
] as const;

export type ControlPresetKey = (typeof CONTROL_PRESET_KEYS)[number];

export interface ControlPreset {
  name: string;
  description: string;
  values: Partial<Pick<Settings, ControlPresetKey>>;
}

/**
 * Read-only feels. Pumps to fill the sprint bar:
 * Default 10, Arcade 6, Sim Heavy 12, Elusive 9, Power Back 14.
 * Decay stays in the same ballpark as the balanced 2.75 so a full bar still fades in about 1–2s.
 */
export const BUILTIN_PRESETS: readonly ControlPreset[] = [
  {
    name: 'Default/Balanced',
    description: 'Current tuning — 10 sprint pumps, moderate cuts and moves.',
    values: {},
  },
  {
    name: 'Arcade Snappy',
    description: 'Very high accel, sharp cuts with little bleed, 6 pumps to sprint, bigger sidesteps.',
    values: {
      accel: 72, decel: 78, releaseDecel: 95, turnRate: 36, cutPenalty: 0.25, cutBleed: 0.05, reverseAngleDeg: 155,
      jogSpeed: 6.2, fullSpeed: 9, sprintAccelMult: 0.9,
      boostPerPump: 0.7, sprintMaxSpeed: 13.2, boostHoldDelay: 0.35, boostDecayRate: 3.2, cutDecayAngleDeg: 50, cutDecayMult: 2, easeOffStick: 0.7,
      sidestepNormal: 2.7, sidestepSprint: 1.4, sidestepAngleNormal: 58, sidestepAngleSprint: 22, sidestepTime: 0.1,
      flickCooldown: 0.14,
      truckBurst: 1.8, truckBonus: 0.35,
      spinDuration: 0.28, spinMomentumAngle: 120, spinDrift: 2.6, spinSpeedKeep: 0.9,
      jukeBackstep: 1.15, jukeHopTime: 0.1, jukeReaccelWindow: 0.35, jukeReaccelMult: 2.4,
    },
  },
  {
    name: 'Sim Heavy',
    description: 'Low accel and strong momentum — cuts bleed speed, 12 pumps to a high top end, longer recoveries.',
    values: {
      accel: 12, decel: 14, releaseDecel: 16, turnRate: 10, cutPenalty: 4.2, cutBleed: 1.2, reverseAngleDeg: 95,
      jogSpeed: 4.2, fullSpeed: 7.2, sprintAccelMult: 0.4,
      boostPerPump: 0.5, sprintMaxSpeed: 13.2, boostHoldDelay: 0.75, boostDecayRate: 3.6, cutDecayMult: 4.5,
      sidestepNormal: 1.05, sidestepSprint: 0.35,
      flickCooldown: 0.55,
      truckBurst: 1.1, truckDuration: 0.55,
      spinDuration: 0.5, spinMomentumAngle: 80, spinSpeedKeep: 0.55,
      jukeBackstep: 0.55, jukeReaccelWindow: 0.85, jukeReaccelMult: 1.15,
      stiffArmStrength: 0.4,
    },
  },
  {
    name: 'Elusive Back',
    description: 'Quick sidesteps, strong spins and jukes, short move cooldowns, average top speed.',
    values: {
      accel: 42, decel: 40, releaseDecel: 48, turnRate: 32, cutPenalty: 0.7, cutBleed: 0.22,
      fullSpeed: 8, sprintMaxSpeed: 11.6, boostPerPump: 0.4,
      sidestepNormal: 2.9, sidestepSprint: 1.6, sidestepAngleNormal: 62, sidestepTime: 0.11,
      flickCooldown: 0.12,
      truckBurst: 0.8, truckBonus: 0.2,
      spinDuration: 0.3, spinMomentumAngle: 145, spinDrift: 3.4, spinSpeedKeep: 0.92, spinCounter: 0.2,
      jukeBackstep: 1.6, jukeHopTime: 0.11, jukeReaccelWindow: 0.5, jukeReaccelMult: 2.6,
      stiffArmStrength: 0.35,
    },
  },
  {
    name: 'Power Back',
    description: 'Slower cuts, a strong truck and stiff-arm, higher break-tackle odds, a big sprint top that is slow to build.',
    values: {
      accel: 20, decel: 22, releaseDecel: 26, turnRate: 16, cutPenalty: 2.6, cutBleed: 0.9,
      fullSpeed: 7.8, sprintMaxSpeed: 14.8, boostPerPump: 0.5, boostHoldDelay: 0.6, boostDecayRate: 3.4,
      sidestepNormal: 1.15, sidestepSprint: 0.4,
      flickCooldown: 0.4,
      truckBurst: 2.6, truckDuration: 0.55, truckBonus: 0.62, truckContactSlow: 0.62,
      spinMomentumAngle: 70, spinSpeedKeep: 0.65,
      jukeBackstep: 0.5, jukeReaccelMult: 1.3,
      stiffArmStrength: 0.82, stiffArmReach: 2.1, stiffArmPush: 7.5,
      wrapSuccess: 0.58, fumbleBase: 0.015,
    },
  },
];

export function builtinPreset(name: string): ControlPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.name === name);
}

/** Write every control key: the preset's value, or the default when the preset leaves it out. */
export function applyControlPreset(target: Settings, preset: ControlPreset): void {
  for (const key of CONTROL_PRESET_KEYS) {
    const value = preset.values[key];
    target[key] = value === undefined ? DEFAULTS[key] : value;
  }
}

export function presetPumps(values: Pick<Settings, 'fullSpeed' | 'sprintMaxSpeed' | 'boostPerPump'>): number {
  return (values.sprintMaxSpeed - values.fullSpeed) / values.boostPerPump;
}
