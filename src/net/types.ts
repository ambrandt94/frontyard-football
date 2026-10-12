import type { Settings } from '../config/defaults';
import type { ModeId } from '../modes';
import type { Look } from '../sim/look';
import type { ArcPoint, Vec2 } from '../sim/types';

/** Wire format for one tick of a player's controller. Triggers are 0..1. throwPower is -1 when not thrown. */
export interface InputFrame {
  seq: number;
  mx: number;
  my: number;
  lt: number;
  rt: number;
  buttons: number;
  aimX: number | null;
  aimY: number | null;
  throwPower: number;
  rsX: number | null;
  rsY: number | null;
}

export const BTN = {
  sprint: 1,
  y: 2,
  rt: 4,
  rb: 8,
  a: 16,
  x: 32,
  b: 64,
  start: 128,
  lb: 256,
  rbHeld: 512,
} as const;

export interface SnapPlayer {
  id: string;
  role: string;
  name: string;
  tint: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  facing: number;
  sprint: boolean;
  boost: number;
  squared: boolean;
  diveT: number;
  groundT: number;
  jumpT: number;
  spinVis: number;
}

export interface Snapshot {
  t: number;
  mode: ModeId;
  phase: string;
  result: string;
  route: string;
  feedback: { text: string; color: string; t: number } | null;
  ball: {
    state: 'held' | 'air' | 'dead' | 'rest';
    holder: string | null;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    aimed: Vec2 | null;
    landing: Vec2 | null;
    arc: ArcPoint[];
  };
  players: SnapPlayer[];
  stats: { att: number; comp: number; last: string; yacTotal: number; lastYac: number };
  cov: { targets: number; catches: number; pbus: number; ints: number; sepSum: number; throws: number; lastSep: number; last: string; flags: number };
  carry: { catchY: number; yac: number; goalY: number; goalLabel: 'TOUCHDOWN' | 'TARGET'; goalSign: 1 | -1 } | null;
  runScore: { td: number; stops: number; last: string };
}

export interface Seat {
  peerId: string;
  name: string;
  slot: string;
  ping: number;
  host: boolean;
  look: Look;
}

export interface RosterName {
  name: string;
  tint: number;
  look: Look;
}

export interface NetMsgMap {
  hello: { t: 'hello'; name: string; look?: Look };
  welcome: { t: 'welcome'; you: string; room: string; players: Seat[]; mode: ModeId; inMatch: boolean; settings: Partial<Settings>; freeCount: number; v: number };
  lobby: { t: 'lobby'; v: number; players: Seat[]; mode: ModeId; freeCount: number };
  claim: { t: 'claim'; slot: string };
  look: { t: 'look'; look: Look };
  start: { t: 'start'; v: number; mode: ModeId; seed: number; slots: Record<string, string>; settings: Partial<Settings>; freeCount: number; names: Record<string, RosterName> };
  input: { t: 'input'; frame: InputFrame };
  snap: { t: 'snap'; snap: Snapshot };
  ping: { t: 'ping'; n: number };
  pong: { t: 'pong'; n: number };
  'host-gone': { t: 'host-gone' };
  full: { t: 'full' };
  reject: { t: 'reject'; reason: string };
  settings: { t: 'settings'; settings: Partial<Settings>; mode: ModeId };
}

export type NetMsg = NetMsgMap[keyof NetMsgMap];

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SignalConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

/** Signaling + data channels. A Colyseus client can implement this same shape later. */
export interface NetTransport {
  readonly localId: string | null;
  startHost(peerId: string, ice: IceServer[], signal: SignalConfig): Promise<void>;
  startClient(ice: IceServer[], signal: SignalConfig): Promise<void>;
  connect(remoteId: string): Promise<void>;
  send(peerId: string, data: string): void;
  broadcast(data: string): void;
  onData(cb: (peerId: string, data: unknown) => void): void;
  onClose(cb: (peerId: string) => void): void;
  close(): void;
}
