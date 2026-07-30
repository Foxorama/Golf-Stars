/**
 * IS THE ANIMATOR LOOKING AT A HOLE IT HAS NEVER SEEN? (GS-anim-counter-stale)
 *
 * The play screen animates only what is NEW: `pendingAnimation` slices `play.shots` from
 * `animatedShots` onward, so those counters are a claim about how much of THE CURRENT HOLE has
 * already been drawn. They are module state in `app.ts` (a render effect, not reducer state — the
 * reducer must stay pure), and they were reset on one condition: `play.holeIndex !== animHoleIndex`.
 *
 * The hole INDEX is not a hole's identity. Leave a round mid-hole and the counters keep their values
 * along with `animHoleIndex`; come back to a hole at the SAME index — which is not an edge case but
 * the normal thing, since every resume lands you on the hole you left, and a Story world replays from
 * its first tee — and the reset never fires. The animator then believes the first N shots of a
 * brand-new hole have already been drawn and silently skips them: the ball teleports, no watch phase,
 * no run-out, no shot card, for exactly as many shots as were played before leaving. Once the tally
 * passes the stale figure it quietly starts working again, which is why it reads as "just the hole I
 * was on".
 *
 * So the question is asked properly here, as a pure function of the two tallies, and unit-tested —
 * rather than as a third inline condition in the render path where it cannot be exercised.
 */

/** What the animator currently believes it has drawn. */
export interface AnimProgress {
  /** The hole index those tallies describe. `-1` before anything has been animated. */
  holeIndex: number;
  shots: number;
  putts: number;
}

/** What the live hole actually holds. (Structurally a subset of `UiState['play']`.) */
export interface HoleTallies {
  holeIndex: number;
  shots: readonly unknown[];
  puttLogs: readonly unknown[];
}

/**
 * Must the animator's tallies be reset before drawing this hole?
 *
 * Two ways a hole is new, and the second is the one that was missing:
 *
 *  1. **The index changed.** The original rule, and it covers playing forward.
 *  2. **A tally went BACKWARDS.** Shots and putts only ever accumulate within a hole, so a live hole
 *     holding FEWER than the animator has drawn cannot be the same hole — it is a fresh hole state at
 *     the same index. That is a replayed round, a resume, or a restarted stop, and it needs no new
 *     state to detect: the impossibility is the signal.
 *
 * Deliberately not solved by clearing the counters when `state.play` goes absent. That would fix the
 * observed path and leave the same trap set for the next one, because it would still be relying on
 * catching every route out of a hole rather than on recognising a hole it has not drawn.
 */
export function holeIsNewToAnimator(play: HoleTallies, progress: AnimProgress): boolean {
  return (
    play.holeIndex !== progress.holeIndex ||
    play.shots.length < progress.shots ||
    play.puttLogs.length < progress.putts
  );
}
