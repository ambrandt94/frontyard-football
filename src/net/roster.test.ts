import { describe, expect, it } from 'vitest';
import { aiLook } from '../sim/look';
import { assignSlots } from './roster';

const seat = (peerId: string, slot: string) => ({ peerId, slot });

describe('assignSlots', () => {
  it('keeps throw roles when the field becomes Throw Around', () => {
    const next = assignSlots([seat('h', 'qb'), seat('w', 'wr'), seat('d', 'df')], 'free', 4);
    expect(next.map((s) => s.slot)).toEqual(['p0', 'p1', 'p2']);
  });

  it('puts Throw Around players back on the roles they came from', () => {
    const next = assignSlots([seat('h', 'p0'), seat('w', 'p1'), seat('d', 'p2')], 'throw', 4);
    expect(next.map((s) => s.slot)).toEqual(['qb', 'wr', 'df']);
  });

  it('leaves a defender on defense in coverage', () => {
    const next = assignSlots([seat('h', 'qb'), seat('d', 'df')], 'coverage', 4);
    expect(next.find((s) => s.peerId === 'd')?.slot).toBe('df');
    expect(next.find((s) => s.peerId === 'h')?.slot).toBe('qb');
  });

  it('does not hand the quarterback slot to whoever is listed first', () => {
    const next = assignSlots([seat('w', 'wr'), seat('new', '')], 'throw', 4);
    expect(next.find((s) => s.peerId === 'w')?.slot).toBe('wr');
    expect(next.find((s) => s.peerId === 'new')?.slot).toBe('qb');
  });

  it('lets the fourth person watch when the mode only has three bodies', () => {
    const next = assignSlots([
      seat('a', 'qb'), seat('b', 'wr'), seat('c', 'df'), seat('d', 'p3'),
    ], 'throw', 4);
    expect(next.map((s) => s.slot)).toEqual(['qb', 'wr', 'df', '']);
  });

  it('keeps a runner on the ball and a defender on defense', () => {
    const next = assignSlots([seat('h', 'qb'), seat('d', 'df')], 'run', 4);
    expect(next.map((s) => s.slot)).toEqual(['rb', 'df']);
  });
});

describe('aiLook', () => {
  it('keeps defense maroon until a human jersey would clash', () => {
    expect(aiLook('DF', []).jersey).toBe(0x7a0f1e);
    expect(aiLook('DF', [0x1e63c9]).jersey).toBe(0x7a0f1e);
    expect(aiLook('DF', [0x7a0f1e]).jersey).not.toBe(0x7a0f1e);
    expect(aiLook('WR', []).jersey).toBe(0x1e63c9);
  });
});
