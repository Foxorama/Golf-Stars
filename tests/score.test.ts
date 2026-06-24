import { describe, it, expect } from 'vitest';
import {
  courseHandicap,
  playTotals,
  scoreName,
  stablefordPoints,
  strokesForSI,
} from '../src/sim/score';

describe('scoring', () => {
  it('Stableford: par = 2, birdie = 3, bogey = 1, blow-up floors at 0', () => {
    expect(stablefordPoints(4, 4)).toBe(2); // par
    expect(stablefordPoints(4, 3)).toBe(3); // birdie
    expect(stablefordPoints(4, 5)).toBe(1); // bogey
    expect(stablefordPoints(4, 7)).toBe(0); // triple → 0, not negative
  });

  it('courseHandicap applies slope and rating-minus-par', () => {
    expect(courseHandicap(0)).toBe(0);
    expect(courseHandicap(18, 113)).toBe(18);
    expect(courseHandicap(10, 130)).toBe(Math.round(10 * (130 / 113)));
  });

  it('strokesForSI spreads strokes by stroke index, wrapping past 18', () => {
    expect(strokesForSI(0, 1)).toBe(0);
    // 18 handicap → one shot on every hole.
    for (let si = 1; si <= 18; si++) expect(strokesForSI(18, si)).toBe(1);
    // 20 handicap → 2 shots on the hardest two holes, 1 elsewhere.
    expect(strokesForSI(20, 1)).toBe(2);
    expect(strokesForSI(20, 2)).toBe(2);
    expect(strokesForSI(20, 3)).toBe(1);
  });

  it('playTotals aggregates gross/net/stableford/toPar', () => {
    const t = playTotals([
      { par: 4, strokes: 4 }, // par → 2
      { par: 3, strokes: 5 }, // double bogey → 0
      { par: 5, strokes: 4 }, // birdie → 3
    ]);
    expect(t.gross).toBe(13);
    expect(t.totalPar).toBe(12);
    expect(t.toPar).toBe(1);
    expect(t.net).toBe(13); // scratch
    expect(t.stableford).toBe(2 + 0 + 3); // par + double-bogey + birdie
  });

  it('scoreName labels common scores', () => {
    expect(scoreName(4, 1)).toBe('Hole-in-One');
    expect(scoreName(4, 3)).toBe('Birdie');
    expect(scoreName(4, 4)).toBe('Par');
    expect(scoreName(4, 5)).toBe('Bogey');
    expect(scoreName(5, 2)).toBe('Albatross');
  });
});
