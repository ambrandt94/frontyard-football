import raw from './theater.json';
import { parseLook, type Look } from '../sim/look';

export interface TheaterUniform {
  id: string;
  name: string;
  helmet: string;
  facemask: string;
  helmetR: string;
  helmetG: string;
  helmetB: string;
  helmetPattern: string;
  jersey: string;
  jerseyG: string;
  jerseyB: string;
  jerseyPattern: string;
  pants: string;
  pantsR: string;
  pantsG: string;
  pantsPattern: string;
  font: string;
  logo: string | null;
}

export interface TheaterTeam {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  tertiary: string;
  logo: string | null;
  uniforms: TheaterUniform[];
}

export interface TheaterPlayer {
  id: string;
  name: string;
  number: number;
  skin: string | null;
  hairRef: string | null;
  facialHairRef: string | null;
  hairColor: string;
  facialHairColor: string;
}

export interface MissingCosmetic {
  prefab: string;
  status: 'missing' | 'local' | 'unresolved';
  guid: string | null;
  fileID: number | null;
  note: string;
}

export interface TheaterData {
  teams: TheaterTeam[];
  players: TheaterPlayer[];
  fonts: string[];
  jerseyPatterns: string[];
  pantsPatterns: string[];
  helmetPatterns: string[];
  beards: string[];
  missingCosmetics: MissingCosmetic[];
  skippedThirdParty: string[];
}

export const THEATER = raw as TheaterData;

export function teamById(id: string): TheaterTeam | undefined {
  return THEATER.teams.find((team) => team.id === id);
}

export function uniformOf(team: TheaterTeam, id: string): TheaterUniform | undefined {
  return team.uniforms.find((uniform) => uniform.id === id) ?? team.uniforms[0];
}

function hexOf(value: string): number {
  return parseInt(value.replace('#', ''), 16);
}

/** Paint a saved uniform onto a look. Jersey, pants, and helmet stay on the look so the lobby swatches can still override them. */
export function applyUniform(look: Look, teamId: string, uniformId: string): Look {
  const team = teamById(teamId);
  if (!team) return parseLook({ ...look, team: '', uniform: '' });
  const uniform = uniformOf(team, uniformId);
  if (!uniform) return look;
  return parseLook({
    ...look,
    team: team.id,
    uniform: uniform.id,
    jersey: hexOf(uniform.jersey),
    pants: hexOf(uniform.pants),
    helmet: hexOf(uniform.helmet),
    jerseyPattern: uniform.jerseyPattern,
    pantsPattern: uniform.pantsPattern,
    helmetPattern: uniform.helmetPattern,
    font: uniform.font || look.font,
    trim: {
      jerseyG: hexOf(uniform.jerseyG),
      jerseyB: hexOf(uniform.jerseyB),
      pantsR: hexOf(uniform.pantsR),
      pantsG: hexOf(uniform.pantsG),
      face: hexOf(uniform.facemask),
      helmetR: hexOf(uniform.helmetR),
      helmetG: hexOf(uniform.helmetG),
      helmetB: hexOf(uniform.helmetB),
    },
  });
}

/** Copy a saved roster player onto a look. Hair meshes from the missing pack are left off. */
export function applyRoster(look: Look, playerId: string): Look {
  const player = THEATER.players.find((entry) => entry.id === playerId);
  if (!player) return look;
  const next = parseLook({
    ...look,
    number: player.number,
    skinColor: player.skin ? hexOf(player.skin) : null,
    beard: '',
  });
  return next;
}
