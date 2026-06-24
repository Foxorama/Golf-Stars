import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';

/** Drive the reducer through one full stop (play → continue → shop → travel → next). */
function advanceStop(s: UiState, buys: string[] = []): UiState {
  s = reduce(s, { type: 'play' });
  if (s.screen === 'gameover') return s;
  s = reduce(s, { type: 'continue' });
  for (const id of buys) s = reduce(s, { type: 'buy', id });
  s = reduce(s, { type: 'leaveShop' });
  const routeId = s.routes![0]!.id;
  return reduce(s, { type: 'route', routeId });
}

describe('ui reducer', () => {
  it('starts on the intro screen with a course loaded', () => {
    const s = initState(1234);
    expect(s.screen).toBe('intro');
    expect(s.course.holes.length).toBeGreaterThan(0);
    expect(s.run.status).toBe('active');
  });

  it('playing a passable stop goes to the result screen with played holes', () => {
    const s = reduce(initState(1234), { type: 'play' });
    expect(s.screen).toBe('result');
    expect(s.played).toHaveLength(s.course.holes.length);
    expect(s.lastResult!.passed).toBe(true);
    expect(s.bestStableford).toBe(s.lastResult!.stableford);
  });

  it('ignores actions that do not apply to the current screen', () => {
    const s = initState(1234);
    expect(reduce(s, { type: 'continue' })).toBe(s); // can't continue from intro
    expect(reduce(s, { type: 'buy', id: 'gyro' })).toBe(s);
    expect(reduce(s, { type: 'route', routeId: 0 })).toBe(s);
  });

  it('result → shop → buy → travel → next intro', () => {
    let s = reduce(initState(1234), { type: 'play' });
    s = reduce(s, { type: 'continue' });
    expect(s.screen).toBe('shop');
    const before = s.run.credits;
    s = reduce(s, { type: 'buy', id: 'lucky-coin' });
    expect(s.run.credits).toBeLessThan(before);
    expect(s.run.loadout.perks).toContain('lucky-coin');
    s = reduce(s, { type: 'leaveShop' });
    expect(s.screen).toBe('travel');
    expect(s.routes).toHaveLength(3);
    const nextStop = s.run.stopIndex + 1;
    s = reduce(s, { type: 'route', routeId: s.routes![0]!.id });
    expect(s.screen).toBe('intro');
    expect(s.run.stopIndex).toBe(nextStop);
    expect(s.played).toBeUndefined();
  });

  it('viewHole selects and clamps within the played holes', () => {
    let s = reduce(initState(1234), { type: 'play' });
    s = reduce(s, { type: 'viewHole', hole: 2 });
    expect(s.viewHole).toBe(2);
    s = reduce(s, { type: 'viewHole', hole: 999 });
    expect(s.viewHole).toBe(s.played!.length - 1);
    s = reduce(s, { type: 'viewHole', hole: -5 });
    expect(s.viewHole).toBe(0);
  });

  it('a full playthrough ends in gameover and carries meta into a restart', () => {
    let s = initState(7);
    for (let i = 0; i < 100 && s.screen !== 'gameover'; i++) s = advanceStop(s);
    expect(s.screen).toBe('gameover');
    expect(s.run.status).toBe('ended');
    expect(s.bestDistance).toBeGreaterThan(0);

    const restarted = reduce(s, { type: 'restart', seed: 7 });
    expect(restarted.screen).toBe('intro');
    expect(restarted.run.stopIndex).toBe(0);
    expect(restarted.bestDistance).toBe(s.bestDistance); // meta carried over
  });
});
