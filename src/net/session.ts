import type { Settings } from '../config/defaults';
import type { ModeId } from '../modes';
import { MP_MODE_IDS } from '../modes';
import type { Sim } from '../sim/sim';
import { STEP } from '../config/constants';
import { timeScaleOf } from '../config/timeScale';
import type { SimInput } from '../sim/types';
import { encodeMsg, frameToInput, inputToFrame, packSnapshot, parseMsg, present, stripEdges } from './codec';
import { createPeerTransport } from './peerjs-transport';
import { readSignal, roomLink } from './signal';
import { defaultSlot, makeRoomCode, slotsFor, tintForSlot } from './slots';
import { applyGameplay, gameplaySettings, iceServers } from './sync';
import type { InputFrame, NetMsg, NetTransport, Seat, Snapshot } from './types';

const TICK = 1 / 60;
const SNAP_EVERY = 3;
const RENDER_DELAY = 0.1;
const MAX_PLAYERS = 6;

interface RemoteBuf {
  seq: number;
  mx: number;
  my: number;
  lt: number;
  rt: number;
  aimX: number | null;
  aimY: number | null;
  throwPower: number;
  rsX: number | null;
  rsY: number | null;
  edges: number;
}

export interface NetSession {
  phase: 'idle' | 'lobby' | 'play' | 'ended';
  role: 'host' | 'client' | null;
  roomCode: string;
  shareUrl: string;
  players: Seat[];
  mode: ModeId;
  freeCount: number;
  mySlot: string;
  myPeerId: string;
  status: string;
  endedReason: string;
  ping: number;
  snapHz: number;
  showStats: boolean;
  host(name: string): Promise<void>;
  join(code: string, name: string): Promise<void>;
  claim(slot: string): void;
  setMode(mode: ModeId): void;
  setFreeCount(n: number): void;
  start(): void;
  leave(): void;
  tick(dt: number, local: SimInput | null): void;
  toggleStats(): void;
  /** Host only. Broadcasts gameplay tuning. Local keys are left out. */
  pushSettings(): void;
}

export function createSession(opts: { sim: Sim; S: Settings; onChange: () => void }): NetSession {
  const { sim, S } = opts;
  const st = sim.state;
  let transport: NetTransport | null = null;
  let phase: NetSession['phase'] = 'idle';
  let role: NetSession['role'] = null;
  let roomCode = '';
  let mode: ModeId = 'throw';
  let freeCount = 4;
  let myName = 'Player';
  let mySlot = '';
  let status = '';
  let endedReason = '';
  let ping = 0;
  let snapHz = 0;
  let showStats = false;
  let seed = 1;
  const seats: Seat[] = [];
  const bufs = new Map<string, RemoteBuf>();
  const snaps: Snapshot[] = [];
  const snapTimes: number[] = [];
  const pingSent = new Map<number, number>();
  const lastSeen = new Map<string, number>();
  let pingN = 1;
  let pingAcc = 0;
  let tickAcc = 0;
  let tickN = 0;
  let sendAcc = 0;
  let sendSeq = 0;
  let pendingButtons = 0;
  let pendingThrow = -1;
  let pendingAim: { x: number; y: number } | null = null;
  let pendingRs: { x: number; y: number } | null = null;
  let latestAxes: SimInput | null = null;
  let heldLocal: SimInput | null = null;
  let settingsBackup: Settings | null = null;
  let forced: { autoReset: boolean; autoSwitchCarrier: boolean } | null = null;
  let hostPeerId = '';

  function emit() { opts.onChange(); }

  function myPeerId() { return transport?.localId || ''; }

  function seatByPeer(id: string) { return seats.find((s) => s.peerId === id); }

  function rememberSettings() {
    if (!settingsBackup) settingsBackup = { ...S };
  }
  function restoreSettings() {
    if (forced) {
      S.autoReset = forced.autoReset;
      S.autoSwitchCarrier = forced.autoSwitchCarrier;
      forced = null;
    }
    if (settingsBackup) {
      Object.assign(S, settingsBackup);
      settingsBackup = null;
    }
  }
  function forceMatchFlags() {
    if (!forced) forced = { autoReset: S.autoReset, autoSwitchCarrier: S.autoSwitchCarrier };
    S.autoReset = false;
    S.autoSwitchCarrier = false;
  }

  function labelsFromSeats() {
    const labels: Record<string, { name: string; tint: number } | null> = {};
    for (const seat of seats) {
      if (!seat.slot) continue;
      labels[seat.slot] = { name: seat.name, tint: tintForSlot(mode, seat.slot) };
    }
    sim.setLabels(labels);
  }

  function lobbyMsg(): NetMsg {
    return { t: 'lobby', players: seats.map((s) => ({ ...s })), mode, freeCount };
  }

  function broadcast(msg: NetMsg) { transport?.broadcast(encodeMsg(msg)); }
  function send(peerId: string, msg: NetMsg) { transport?.send(peerId, encodeMsg(msg)); }

  function welcomeFor(peerId: string): NetMsg {
    return {
      t: 'welcome',
      you: peerId,
      room: roomCode,
      players: seats.map((s) => ({ ...s })),
      mode,
      inMatch: phase === 'play',
      settings: gameplaySettings(S),
      freeCount,
    };
  }

  function startMsg(): NetMsg {
    const slots: Record<string, string> = {};
    const names: Record<string, { name: string; tint: number }> = {};
    for (const seat of seats) {
      if (!seat.slot) continue;
      slots[seat.peerId] = seat.slot;
      names[seat.slot] = { name: seat.name, tint: tintForSlot(mode, seat.slot) };
    }
    return { t: 'start', mode, seed, slots, settings: gameplaySettings(S), freeCount, names };
  }

  function noteSnapSent() {
    const now = performance.now();
    snapTimes.push(now);
    while (snapTimes.length && now - snapTimes[0] > 1000) snapTimes.shift();
    snapHz = snapTimes.length;
  }

  function applyNames(names: Record<string, { name: string; tint: number }>) {
    const labels: Record<string, { name: string; tint: number } | null> = {};
    for (const [slot, lab] of Object.entries(names)) labels[slot] = lab;
    sim.setLabels(labels);
  }

  function beginMatch(nextMode: ModeId, nextCount: number, names: Record<string, { name: string; tint: number }>) {
    mode = nextMode;
    freeCount = nextCount;
    const humans = Object.keys(names).length;
    const n = mode === 'free' ? Math.max(2, Math.min(6, Math.max(freeCount, humans))) : freeCount;
    if (mode === 'free') sim.setRoster(n);
    sim.setMode(mode);
    applyNames(names);
    snaps.length = 0;
    tickAcc = 0;
    phase = 'play';
  }

  function assignSlot(peerId: string, slot: string): string {
    const allowed = slotsFor(mode, freeCount);
    if (slot && !allowed.some((s) => s.id === slot)) return 'That slot is not in this mode.';
    if (slot && seats.some((s) => s.slot === slot && s.peerId !== peerId)) return 'Someone already has that slot.';
    const seat = seatByPeer(peerId);
    if (!seat) return 'You are not in this room.';
    for (const s of seats) if (s.peerId === peerId) s.slot = slot;
    if (peerId === myPeerId()) mySlot = slot;
    labelsFromSeats();
    broadcast(lobbyMsg());
    emit();
    return '';
  }

  function dropPeer(peerId: string) {
    const idx = seats.findIndex((s) => s.peerId === peerId);
    if (idx >= 0) seats.splice(idx, 1);
    bufs.delete(peerId);
    lastSeen.delete(peerId);
    if (role === 'host') {
      labelsFromSeats();
      if (phase === 'lobby' || phase === 'play') broadcast(lobbyMsg());
      emit();
    }
  }

  function noteFrame(peerId: string, frame: InputFrame) {
    let buf = bufs.get(peerId);
    if (!buf) {
      buf = { seq: 0, mx: 0, my: 0, lt: 0, rt: 0, aimX: null, aimY: null, throwPower: -1, rsX: null, rsY: null, edges: 0 };
      bufs.set(peerId, buf);
    }
    if (frame.seq < buf.seq) return;
    buf.seq = frame.seq;
    buf.mx = frame.mx;
    buf.my = frame.my;
    buf.lt = frame.lt;
    buf.rt = frame.rt;
    if (frame.aimX != null && frame.aimY != null) { buf.aimX = frame.aimX; buf.aimY = frame.aimY; }
    if (frame.rsX != null && frame.rsY != null) { buf.rsX = frame.rsX; buf.rsY = frame.rsY; }
    if (frame.throwPower >= 0) buf.throwPower = frame.throwPower;
    buf.edges |= frame.buttons;
  }

  function consume(peerId: string): SimInput | null {
    const buf = bufs.get(peerId);
    if (!buf || buf.seq === 0) return null;
    const frame: InputFrame = {
      seq: buf.seq,
      mx: buf.mx, my: buf.my, lt: buf.lt, rt: buf.rt,
      buttons: buf.edges,
      aimX: buf.aimX, aimY: buf.aimY,
      throwPower: buf.throwPower,
      rsX: buf.rsX, rsY: buf.rsY,
    };
    buf.edges = 0;
    buf.throwPower = -1;
    return frameToInput(frame);
  }

  function collect(local: SimInput | null): Record<string, SimInput> {
    const out: Record<string, SimInput> = {};
    for (const seat of seats) {
      if (!seat.slot) continue;
      if (seat.host) {
        if (local) out[seat.slot] = local;
      } else {
        const inp = consume(seat.peerId);
        if (inp) out[seat.slot] = inp;
      }
    }
    return out;
  }

  function onHostMessage(from: string, msg: NetMsg) {
    lastSeen.set(from, performance.now());
    if (msg.t === 'hello') {
      if (seats.length >= MAX_PLAYERS) { send(from, { t: 'full' }); return; }
      const name = (msg.name || 'Player').slice(0, 16);
      if (!seatByPeer(from)) seats.push({ peerId: from, name, slot: '', ping: 0, host: false });
      send(from, welcomeFor(from));
      if (phase === 'play') send(from, startMsg());
      broadcast(lobbyMsg());
      emit();
      return;
    }
    if (msg.t === 'claim') {
      const reason = assignSlot(from, msg.slot);
      if (reason) send(from, { t: 'reject', reason });
      return;
    }
    if (msg.t === 'input' && phase === 'play') noteFrame(from, msg.frame);
    if (msg.t === 'ping') send(from, { t: 'pong', n: msg.n });
    if (msg.t === 'pong') {
      const t0 = pingSent.get(msg.n);
      if (t0 != null) {
        const rtt = Math.max(0, performance.now() - t0);
        const seat = seatByPeer(from);
        if (seat) seat.ping = Math.round(rtt);
        pingSent.delete(msg.n);
        emit();
      }
    }
  }

  function onClientMessage(msg: NetMsg) {
    if (msg.t === 'welcome') {
      roomCode = msg.room;
      mode = msg.mode;
      freeCount = msg.freeCount;
      seats.splice(0, seats.length, ...msg.players.map((s) => ({ ...s })));
      rememberSettings();
      applyGameplay(S, msg.settings);
      status = msg.inMatch ? 'Match in progress. Pick an open slot.' : 'Connected. Pick a slot.';
      phase = 'lobby';
      if (mySlot) send(hostPeerId, { t: 'claim', slot: mySlot });
      emit();
      return;
    }
    if (msg.t === 'lobby') {
      mode = msg.mode;
      freeCount = msg.freeCount;
      seats.splice(0, seats.length, ...msg.players.map((s) => ({ ...s })));
      const mine = seatByPeer(myPeerId());
      mySlot = mine?.slot || mySlot;
      if (st.mode !== msg.mode) sim.setMode(msg.mode);
      emit();
      return;
    }
    if (msg.t === 'settings') {
      applyGameplay(S, msg.settings);
      if ((MP_MODE_IDS as readonly ModeId[]).includes(msg.mode)) {
        mode = msg.mode;
        if (st.mode !== msg.mode) sim.setMode(msg.mode);
      }
      emit();
      return;
    }
    if (msg.t === 'start') {
      rememberSettings();
      applyGameplay(S, msg.settings);
      forceMatchFlags();
      mySlot = msg.slots[myPeerId()] || '';
      beginMatch(msg.mode, msg.freeCount, msg.names);
      if (mySlot && st.players[mySlot]) st.controlled = mySlot;
      status = '';
      emit();
      return;
    }
    if (msg.t === 'snap') {
      snaps.push(msg.snap);
      if (snaps.length > 40) snaps.shift();
      noteSnapSent();
      return;
    }
    if (msg.t === 'ping') send(hostPeerId, { t: 'pong', n: msg.n });
    if (msg.t === 'pong') {
      const t0 = pingSent.get(msg.n);
      if (t0 != null) { ping = Math.round(performance.now() - t0); pingSent.delete(msg.n); emit(); }
    }
    if (msg.t === 'full') {
      status = 'That room is full (6 players).';
      emit();
    }
    if (msg.t === 'reject') {
      status = msg.reason;
      if (msg.reason.includes('already')) mySlot = seatByPeer(myPeerId())?.slot || '';
      emit();
    }
    if (msg.t === 'host-gone') endRoom('The host left. This room is over.');
  }

  function wire() {
    if (!transport) return;
    transport.onData((from, data) => {
      const msg = parseMsg(data);
      if (!msg) return;
      if (role === 'host') onHostMessage(from, msg);
      else onClientMessage(msg);
    });
    transport.onClose((peerId) => {
      if (role === 'client') endRoom('The host left. This room is over.');
      else dropPeer(peerId);
    });
  }

  function endRoom(reason: string) {
    transport?.close();
    transport = null;
    sim.setSlotInputs(null, null);
    restoreSettings();
    phase = 'ended';
    endedReason = reason;
    status = reason;
    emit();
  }

  function sendPing() {
    const n = pingN++;
    pingSent.set(n, performance.now());
    if (pingSent.size > 8) {
      const first = pingSent.keys().next().value;
      if (first != null) pingSent.delete(first);
    }
    if (role === 'host') broadcast({ t: 'ping', n });
    else if (hostPeerId) send(hostPeerId, { t: 'ping', n });
  }

  function renderClient() {
    if (snaps.length === 0) return;
    if (snaps.length === 1) present(st, snaps[0], snaps[0], 1);
    else {
      const latest = snaps[snaps.length - 1].t;
      let renderT = latest - RENDER_DELAY;
      if (renderT < snaps[0].t) renderT = snaps[0].t;
      let i = 0;
      while (i < snaps.length - 2 && snaps[i + 1].t < renderT) i++;
      const a = snaps[i], b = snaps[Math.min(snaps.length - 1, i + 1)];
      const span = b.t - a.t;
      const alpha = span > 1e-4 ? (renderT - a.t) / span : 1;
      present(st, a, b, alpha);
    }
    if (mySlot && st.players[mySlot]) st.controlled = mySlot;
  }

  function keepSlots() {
    const allowed = slotsFor(mode, freeCount);
    for (const seat of seats) {
      if (seat.slot && !allowed.some((s) => s.id === seat.slot)) seat.slot = '';
    }
    const mine = seatByPeer(myPeerId());
    mySlot = mine?.slot || '';
    if (!mySlot && mine) {
      mySlot = defaultSlot(mode);
      mine.slot = mySlot;
    }
  }

  function queueLocal(local: SimInput) {
    pendingButtons |= buttonsOf(local);
    if (local.throwPower != null) pendingThrow = local.throwPower;
    if (local.aim) pendingAim = local.aim;
    if (local.rs) pendingRs = local.rs;
    latestAxes = local;
  }

  function flushClientInput() {
    if (!latestAxes || !hostPeerId) return;
    sendSeq++;
    const frame = inputToFrame({
      ...latestAxes,
      sprint: false, y: false, rt: false, rb: false, a: false, x: false, b: false, start: false,
      throwPower: null, aim: pendingAim, rs: pendingRs,
    }, sendSeq);
    frame.buttons = pendingButtons;
    frame.throwPower = pendingThrow;
    send(hostPeerId, { t: 'input', frame });
    pendingButtons = 0;
    pendingThrow = -1;
    pendingRs = null;
  }

  const api: NetSession = {
    get phase() { return phase; },
    get role() { return role; },
    get roomCode() { return roomCode; },
    get shareUrl() { return roomCode ? roomLink(roomCode) : ''; },
    get players() { return seats; },
    get mode() { return mode; },
    get freeCount() { return freeCount; },
    get mySlot() { return mySlot; },
    get myPeerId() { return myPeerId(); },
    get status() { return status; },
    get endedReason() { return endedReason; },
    get ping() { return ping; },
    get snapHz() { return snapHz; },
    get showStats() { return showStats; },
    async host(name: string) {
      api.leave();
      myName = cleanName(name);
      role = 'host';
      status = 'Opening room…';
      emit();
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = makeRoomCode();
        transport = await createPeerTransport();
        wire();
        try {
          await transport.startHost('yard' + code, iceServers(S), readSignal());
          roomCode = code;
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          transport.close();
          transport = null;
          if (!/unavailable/i.test(String(err))) break;
        }
      }
      if (!transport || !roomCode) {
        status = 'Could not open a room. The signaling broker may be down.';
        role = null;
        phase = 'idle';
        emit();
        throw lastErr instanceof Error ? lastErr : new Error(status);
      }
      seats.splice(0, seats.length, { peerId: myPeerId(), name: myName, slot: defaultSlot(mode), ping: 0, host: true });
      mySlot = seats[0].slot;
      phase = 'lobby';
      status = 'Share the code or the link.';
      seed = (Math.random() * 0xffffffff) >>> 0;
      emit();
    },
    async join(code: string, name: string) {
      api.leave();
      myName = cleanName(name);
      role = 'client';
      roomCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      status = 'Joining ' + roomCode + '…';
      phase = 'lobby';
      emit();
      hostPeerId = 'yard' + roomCode;
      transport = await createPeerTransport();
      wire();
      try {
        await transport.startClient(iceServers(S), readSignal());
        await transport.connect(hostPeerId);
        send(hostPeerId, { t: 'hello', name: myName });
      } catch (err) {
        transport.close();
        transport = null;
        role = null;
        phase = 'idle';
        status = /unavailable|timeout/i.test(String(err))
          ? 'Could not find that room. The host may be offline, or a strict NAT is blocking the connection.'
          : 'Could not join. ' + (err instanceof Error ? err.message : '');
        emit();
        throw err;
      }
    },
    claim(slot: string) {
      if (role === 'host') {
        const reason = assignSlot(myPeerId(), slot);
        if (reason) { status = reason; emit(); }
        return;
      }
      mySlot = slot;
      if (hostPeerId) send(hostPeerId, { t: 'claim', slot });
    },
    setMode(next: ModeId) {
      if (role !== 'host' || !(MP_MODE_IDS as readonly ModeId[]).includes(next)) return;
      mode = next;
      keepSlots();
      broadcast(lobbyMsg());
      emit();
    },
    setFreeCount(n: number) {
      if (role !== 'host') return;
      freeCount = Math.max(2, Math.min(6, Math.round(n) || 2));
      keepSlots();
      broadcast(lobbyMsg());
      emit();
    },
    start() {
      if (role !== 'host' || (phase !== 'lobby' && phase !== 'play')) return;
      const humans = seats.filter((s) => s.slot).length;
      if (mode === 'free') freeCount = Math.max(2, Math.min(6, Math.max(freeCount, humans)));
      forceMatchFlags();
      beginMatch(mode, freeCount, {});
      labelsFromSeats();
      if (mySlot && st.players[mySlot]) st.controlled = mySlot;
      broadcast(startMsg());
      status = '';
      emit();
    },
    leave() {
      if (role === 'host' && transport) broadcast({ t: 'host-gone' });
      transport?.close();
      transport = null;
      sim.setSlotInputs(null, null);
      restoreSettings();
      seats.splice(0, seats.length);
      snaps.length = 0;
      bufs.clear();
      phase = 'idle';
      role = null;
      roomCode = '';
      mySlot = '';
      hostPeerId = '';
      status = '';
      endedReason = '';
      ping = 0;
      snapHz = 0;
      emit();
    },
    tick(dt, local) {
      if (phase !== 'lobby' && phase !== 'play') return;
      pingAcc += dt;
      if (pingAcc >= 0.5) { pingAcc = 0; sendPing(); }
      if (role === 'host') {
        const now = performance.now();
        for (const seat of [...seats]) {
          if (seat.host) continue;
          const seen = lastSeen.get(seat.peerId);
          if (seen != null && now - seen > 4000) dropPeer(seat.peerId);
        }
      }
      if (phase !== 'play') return;
      if (role === 'client') {
        if (local) queueLocal(local);
        sendAcc += dt;
        if (sendAcc >= TICK) {
          sendAcc = Math.min(sendAcc - TICK, TICK);
          flushClientInput();
        }
        renderClient();
        return;
      }
      let localNow = local;
      if (localNow && heldLocal) {
        localNow = mergeEdges(heldLocal, localNow);
        heldLocal = null;
      }
      let consumed = false;
      let guard = 0;
      tickAcc += dt * timeScaleOf(S.timeScale);
      while (tickAcc >= TICK && guard++ < 4) {
        const use = consumed ? (localNow ? stripEdges(localNow) : null) : localNow;
        const inputs = collect(use);
        sim.setSlotInputs(inputs, mySlot || null);
        sim.step(STEP);
        const held: Record<string, SimInput> = {};
        for (const id of Object.keys(inputs)) held[id] = stripEdges(inputs[id]);
        sim.setSlotInputs(held, mySlot || null);
        sim.step(STEP);
        if (mySlot && st.players[mySlot]) st.controlled = mySlot;
        tickAcc -= TICK;
        tickN++;
        consumed = true;
        if (tickN % SNAP_EVERY === 0) {
          broadcast({ t: 'snap', snap: packSnapshot(st) });
          noteSnapSent();
        }
      }
      if (!consumed && localNow) heldLocal = localNow;
      if (tickAcc > TICK) tickAcc = 0;
    },
    toggleStats() { showStats = !showStats; emit(); },
    pushSettings() {
      if (role !== 'host' || (phase !== 'lobby' && phase !== 'play')) return;
      if (phase === 'play') mode = st.mode;
      broadcast({ t: 'settings', settings: gameplaySettings(S), mode: phase === 'play' ? st.mode : mode });
    },
  };
  return api;
}

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, 16);
  return trimmed || 'Player';
}

function buttonsOf(inp: SimInput): number {
  return inputToFrame(inp, 0).buttons;
}

const EDGE_KEYS = ['sprint', 'y', 'rt', 'rb', 'a', 'x', 'b', 'start'] as const;

function mergeEdges(prev: SimInput, next: SimInput): SimInput {
  const merged = { ...next };
  for (const key of EDGE_KEYS) merged[key] = next[key] || prev[key];
  merged.lbHeld = next.lbHeld || prev.lbHeld;
  merged.rbHeld = next.rbHeld || prev.rbHeld;
  if (merged.throwPower == null) merged.throwPower = prev.throwPower;
  return merged;
}
