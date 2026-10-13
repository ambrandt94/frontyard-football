import { describe, expect, it } from 'vitest';
import { SWATCHES } from '../sim/look';
import { cyclePart, moveNav, type NavState } from './playerNav';

function nav(partial: Partial<NavState> = {}): NavState {
  return {
    region: 'name',
    part: 'jersey',
    colorIndex: 0,
    actionIndex: 1,
    required: false,
    ...partial,
  };
}

describe('player modal navigation', () => {
  it('walks name, parts, the swatch grid, and Save', () => {
    let state = nav();
    state = moveNav(state, 0, 1);
    expect(state.region).toBe('parts');
    state = moveNav(state, 1, 0);
    expect(state.part).toBe('pants');
    state = moveNav(state, 0, 1);
    expect(state.region).toBe('colors');
    state = moveNav(state, 1, 0);
    expect(state.colorIndex).toBe(1);
    state = moveNav(state, 0, 1);
    expect(state.colorIndex).toBe(6);
    const lastRow = Math.floor((SWATCHES.length) / 5) * 5;
    state = { ...state, colorIndex: lastRow };
    state = moveNav(state, 0, 1);
    expect(state.region).toBe('actions');
    expect(state.actionIndex).toBe(1);
    state = moveNav(state, -1, 0);
    expect(state.actionIndex).toBe(0);
    state = moveNav(state, 0, -1);
    expect(state.region).toBe('colors');
    expect(state.colorIndex).toBe(SWATCHES.length);
  });

  it('does not leave a color row sideways, and a required modal has only Save', () => {
    const stayed = moveNav(nav({ region: 'colors', colorIndex: 0 }), -1, 0);
    expect(stayed.colorIndex).toBe(0);
    const custom = moveNav(nav({ region: 'colors', colorIndex: 9 }), 0, 1);
    expect(custom.region).toBe('colors');
    expect(custom.colorIndex).toBe(SWATCHES.length);
    const down = moveNav(nav({ region: 'colors', colorIndex: SWATCHES.length, required: true }), 0, 1);
    expect(down.region).toBe('actions');
    expect(down.actionIndex).toBe(0);
    expect(moveNav(down, -1, 0).actionIndex).toBe(0);
  });

  it('treats skin as two choices and wraps parts with the bumpers', () => {
    const skin = moveNav(nav({ region: 'parts', part: 'helmet' }), 1, 0);
    expect(skin.part).toBe('skin');
    const down = moveNav({ ...skin, region: 'colors', colorIndex: 0 }, 0, 1);
    expect(down.region).toBe('actions');
    const wrapped = cyclePart(nav({ part: 'skin' }), 1);
    expect(wrapped.part).toBe('jersey');
    expect(wrapped.region).toBe('parts');
    expect(cyclePart(nav({ part: 'jersey' }), -1).part).toBe('skin');
  });
});
