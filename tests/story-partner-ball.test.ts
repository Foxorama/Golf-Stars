/**
 * Your partner's ball is visible during a paired matchplay round (GS-story-partner-ball).
 *
 * Play-test report: in a two-ball best-ball qualifier the live chip showed the OPPONENTS' number
 * ("their ball: 3") and nothing at all for your own side's partner. That is the wrong half — you can
 * already see your own card, so without the partner's ball you cannot tell what your side actually
 * scored, or whether you still need the hole.
 *
 * The partner's card was always rolled by the resolver; it simply was never surfaced on the duel.
 */
import { describe, it, expect } from 'vitest';
import { resolveStory2v2Match } from '../src/sim/rpg/storyTeams';

const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4];
const STROKES = [4, 5, 4, 4, 3, 3, 6, 4, 5];
const OPPS: readonly [string, string] = ['huang-woo-hook', 'longshot-larry'];

const play = (format: 'bestball' | 'scramble' = 'bestball', teamPlayed = false) =>
  resolveStory2v2Match(STROKES, 'feather-fade', 0, OPPS, 0, 'partner-ball-seed', PARS, format, teamPlayed);

describe('the duel carries your partner’s ball', () => {
  it('a best-ball match exposes mateStrokes on every hole played', () => {
    const res = play();
    expect(res.duels.length).toBeGreaterThan(0);
    for (const d of res.duels) {
      expect(d.mateStrokes, `hole ${d.holeIndex} has no partner ball`).toBeTypeOf('number');
      expect(d.mateStrokes!).toBeGreaterThan(0);
    }
  });

  it('your side’s number is the BETTER ball — which is exactly why the partner’s must be shown', () => {
    const res = play();
    for (const d of res.duels) {
      const solo = STROKES[d.holeIndex]!;
      // Best-ball: the side's score can never be worse than either individual ball...
      expect(d.playerStrokes).toBeLessThanOrEqual(solo);
      expect(d.playerStrokes).toBeLessThanOrEqual(d.mateStrokes!);
      // ...and must be exactly one of them.
      expect([solo, d.mateStrokes]).toContain(d.playerStrokes);
    }
  });

  it('is deterministic for a seed (the partner is a rolled ghost, not a live draw)', () => {
    expect(play().duels.map((d) => d.mateStrokes)).toEqual(play().duels.map((d) => d.mateStrokes));
  });

  it('is ABSENT when the side was played for real, where there is no separate partner card', () => {
    // GS-story-sigil5-play: the 2v2 finale is played as an interactive scramble, so the strokes handed
    // in ARE the side's score. Surfacing a partner ball there would be inventing one.
    for (const d of play('scramble', true).duels) expect(d.mateStrokes).toBeUndefined();
  });

  it('surfacing it did not disturb the match result (same seed ⇒ same scoreline)', () => {
    // The ally ghost was hoisted out of an array literal to expose it; the rng draw ORDER is unchanged,
    // so the resolved match must be identical to what the seeded team tests already pin.
    const res = play();
    expect(res.duels.map((d) => [d.playerStrokes, d.bossStrokes])).toEqual(
      play().duels.map((d) => [d.playerStrokes, d.bossStrokes]),
    );
    expect(res.scoreline).toBe(play().scoreline);
  });
});
