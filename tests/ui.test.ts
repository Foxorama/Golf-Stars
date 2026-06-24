import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';

/** A run started from the title screen with the given format. */
function started(seed: number | string, format = 'flat'): UiState {
  return reduce(initState(seed), { type: 'start', format });
}

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
  it('a fresh seed opens on the title screen; start picks a format', () => {
    const title = initState(1234);
    expect(title.screen).toBe('title');
    const s = reduce(title, { type: 'start', format: 'ladder' });
    expect(s.screen).toBe('intro');
    expect(s.run.formatId).toBe('ladder');
    expect(s.course.holes.length).toBe(3); // ladder stop 0 = 3 par-3s
    expect(s.course.holes.every((h) => h.par === 3)).toBe(true);
  });

  it('playing a passable stop goes to the result screen with played holes', () => {
    const s = reduce(started(1234), { type: 'play' });
    expect(s.screen).toBe('result');
    expect(s.played).toHaveLength(s.course.holes.length);
    expect(s.lastResult!.passed).toBe(true);
    expect(s.bestStableford).toBe(s.lastResult!.stableford);
  });

  it('ignores actions that do not apply to the current screen', () => {
    const s = started(1234);
    expect(reduce(s, { type: 'continue' })).toBe(s); // can't continue from intro
    expect(reduce(s, { type: 'buy', id: 'gyro' })).toBe(s);
    expect(reduce(s, { type: 'route', routeId: 0 })).toBe(s);
    expect(reduce(s, { type: 'start', format: 'ladder' })).toBe(s); // can't start mid-run
  });

  it('result → shop → buy → travel → next intro', () => {
    let s = reduce(started(1234), { type: 'play' });
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
    let s = reduce(started(1234), { type: 'play' });
    s = reduce(s, { type: 'viewHole', hole: 2 });
    expect(s.viewHole).toBe(2);
    s = reduce(s, { type: 'viewHole', hole: 999 });
    expect(s.viewHole).toBe(s.played!.length - 1);
    s = reduce(s, { type: 'viewHole', hole: -5 });
    expect(s.viewHole).toBe(0);
  });

  it('a full playthrough ends in gameover and restart returns to the title', () => {
    let s = started(7);
    for (let i = 0; i < 100 && s.screen !== 'gameover'; i++) s = advanceStop(s);
    expect(s.screen).toBe('gameover');
    expect(s.run.status).toBe('ended');
    expect(s.bestDistance).toBeGreaterThan(0);

    const restarted = reduce(s, { type: 'restart', seed: 7 });
    expect(restarted.screen).toBe('title'); // pick a format again
    expect(restarted.bestDistance).toBe(s.bestDistance); // meta carried over
  });

  it('the ladder format escalates hole counts across stops', () => {
    let s = started(7, 'ladder');
    const counts: number[] = [];
    for (let i = 0; i < 5 && s.screen !== 'gameover'; i++) {
      counts.push(s.course.holes.length);
      s = advanceStop(s);
    }
    // First stops should be non-decreasing in size: 3 → 6 → 9 → 9 → 18.
    expect(counts[0]).toBe(3);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });
});
