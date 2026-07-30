import { describe, it, expect } from 'vitest';
import { holeIsNewToAnimator, type AnimProgress } from '../src/app/playAnim';

/**
 * THE ANIMATOR MUST NOT CARRY ONE VISIT'S TALLIES INTO THE NEXT (GS-anim-counter-stale).
 *
 * `pendingAnimation` draws only `play.shots.slice(animatedShots)`, so those counters are a claim about
 * how much of THE CURRENT HOLE has been drawn. The reset condition was `play.holeIndex !==
 * animHoleIndex` — and a hole index is not a hole's identity.
 *
 * Reported from play: hit a few shots, leave to the title, come back, and the replayed hole draws
 * nothing for exactly as many shots as were played before leaving — the ball teleports, no watch
 * phase, no run-out, no shot card — then starts working once the tally passes the stale figure. Filed
 * as a Story Tour bug because a Story world always replays from its first tee, so it reproduces every
 * time there; but it is not mode-specific. EVERY mode resumes onto the hole you left, at the same
 * index, which is precisely the case the old condition could not see.
 *
 * Pure predicate, so the rule is exercised here rather than in a render path.
 */

const at = (holeIndex: number, shots: number, putts: number): AnimProgress => ({ holeIndex, shots, putts });
const hole = (holeIndex: number, shots: number, puttLogs: number) => ({
  holeIndex,
  shots: Array.from({ length: shots }),
  puttLogs: Array.from({ length: puttLogs }),
});

describe('a hole the animator has never drawn', () => {
  it('is new when the index changes — the original rule, playing forward', () => {
    expect(holeIsNewToAnimator(hole(1, 0, 0), at(0, 4, 2))).toBe(true);
    expect(holeIsNewToAnimator(hole(0, 0, 0), at(-1, 0, 0))).toBe(true); // the first hole of a session
  });

  it('is NOT new while shots accumulate on the hole being played', () => {
    // The normal case, and the one that must keep working: three shots drawn, a fourth arrives.
    expect(holeIsNewToAnimator(hole(3, 4, 0), at(3, 3, 0))).toBe(false);
    expect(holeIsNewToAnimator(hole(3, 4, 1), at(3, 4, 0))).toBe(false);
    // Nothing new at all — the render that happens between shots.
    expect(holeIsNewToAnimator(hole(3, 4, 1), at(3, 4, 1))).toBe(false);
  });

  it('IS new when a tally goes backwards — the bug, at the same index', () => {
    // THE REPORTED CASE. Three shots were drawn on hole 0; the player left; the round replays from the
    // first tee, so hole 0 comes back holding nothing. Same index, so the old rule saw no change and
    // the animator skipped the next three shots.
    expect(holeIsNewToAnimator(hole(0, 0, 0), at(0, 3, 0))).toBe(true);
    // Mid-hole, deeper in a run: same hole index, fresh hole state.
    expect(holeIsNewToAnimator(hole(7, 0, 0), at(7, 2, 0))).toBe(true);
    // A putt tally can go backwards on its own (shots matched, putts didn't).
    expect(holeIsNewToAnimator(hole(7, 2, 0), at(7, 2, 3))).toBe(true);
  });

  it('shots and putts only ever accumulate WITHIN a hole, which is why backwards is proof', () => {
    // The predicate rests entirely on that impossibility, so state it as a test: any live tally at or
    // above what has been drawn is the same hole continuing; anything below cannot be.
    for (let drawn = 0; drawn <= 6; drawn++) {
      for (let live = 0; live <= 6; live++) {
        expect(holeIsNewToAnimator(hole(2, live, 0), at(2, drawn, 0))).toBe(live < drawn);
      }
    }
  });

  it('never misses a replay for want of a route out of the hole being enumerated', () => {
    // Whatever path leaves a hole — title, settings, a story world ending, a future one nobody has
    // written yet — the returning hole starts at zero shots, and zero is below any positive tally.
    for (const drawnShots of [1, 2, 5, 12]) {
      expect(holeIsNewToAnimator(hole(0, 0, 0), at(0, drawnShots, 0))).toBe(true);
    }
  });
});
