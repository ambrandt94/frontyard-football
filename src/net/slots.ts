import type { ModeId } from '../modes';

export const NET_COLORS = [0x29b6f6, 0xff7043, 0x66bb6a, 0xffd54a, 0xab47bc, 0xec407a];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function slotsFor(mode: ModeId, freeCount: number): { id: string; label: string }[] {
  if (mode === 'run') return [{ id: 'rb', label: 'Carrier' }, { id: 'df', label: 'Defender' }];
  if (mode === 'free') {
    const n = Math.max(2, Math.min(6, Math.round(freeCount) || 2));
    return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, label: `Player ${i + 1}` }));
  }
  if (mode === 'catch') return [];
  return [{ id: 'qb', label: 'QB' }, { id: 'wr', label: 'Receiver' }, { id: 'df', label: 'Defender' }];
}

export function tintForSlot(mode: ModeId, slot: string): number {
  const list = slotsFor(mode, 6);
  const i = list.findIndex((s) => s.id === slot);
  return NET_COLORS[(i < 0 ? 0 : i) % NET_COLORS.length];
}

export function defaultSlot(mode: ModeId): string {
  if (mode === 'run') return 'rb';
  if (mode === 'free') return 'p0';
  if (mode === 'coverage') return 'df';
  return 'qb';
}
