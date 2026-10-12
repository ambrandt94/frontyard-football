import type { ModeId } from '../modes';
import { slotsFor } from './slots';

/**
 * Where a person should land when the mode changes.
 * The first id that still exists wins. This is an affinity, not "slot index 0".
 */
export function preferredSlotIds(from: string): string[] {
  const map: Record<string, string[]> = {
    qb: ['qb', 'rb', 'p0'],
    wr: ['wr', 'tb', 'p1'],
    df: ['df', 'p2'],
    rb: ['rb', 'qb', 'p0'],
    tb: ['tb', 'wr', 'p1'],
    p0: ['p0', 'qb', 'rb'],
    p1: ['p1', 'wr', 'tb'],
    p2: ['p2', 'df'],
    p3: ['p3', 'p1', 'wr'],
    p4: ['p4'],
    p5: ['p5'],
  };
  return map[from] ?? (from ? [from] : []);
}

export interface SlotSeat {
  peerId: string;
  slot: string;
}

/**
 * Keep a person's slot when the new mode still has it.
 * Otherwise take the first open slot they used to play.
 * Anyone left, including someone who was watching, takes the next open slot.
 * Past that they watch, and the CPU fills the body.
 */
export function assignSlots(seats: SlotSeat[], mode: ModeId, freeCount: number): SlotSeat[] {
  const open = slotsFor(mode, freeCount).map((s) => s.id);
  const out: SlotSeat[] = seats.map((s) => ({ peerId: s.peerId, slot: '' }));
  const byPeer = new Map(out.map((s) => [s.peerId, s]));
  const take = (id: string) => {
    const i = open.indexOf(id);
    if (i < 0) return false;
    open.splice(i, 1);
    return true;
  };
  for (const seat of seats) {
    if (seat.slot && take(seat.slot)) byPeer.get(seat.peerId)!.slot = seat.slot;
  }
  for (const seat of seats) {
    const row = byPeer.get(seat.peerId)!;
    if (row.slot) continue;
    for (const id of preferredSlotIds(seat.slot)) {
      if (take(id)) { row.slot = id; break; }
    }
  }
  for (const seat of seats) {
    const row = byPeer.get(seat.peerId)!;
    if (row.slot) continue;
    const next = open.shift();
    if (next) row.slot = next;
  }
  return out;
}
