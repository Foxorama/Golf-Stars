/**
 * STAR TOUR stroke-play records (GS-star-tour).
 *
 * The personal-best leaderboards for the Star Tour mode: a full 18-hole stroke-play round on a chosen
 * static course, ranked purely on score. Two boards, both derived from ONE persisted source of truth —
 * `StrokePlayBest`, the player's best-ever round on EACH course (a map keyed by course id, so a course's
 * all-time best is never evicted):
 *   • per-course best  — `bestStrokeFor(best, courseId)`
 *   • best rounds overall — `bestStrokeRounds(best, n)` (the n lowest-to-par course records)
 *
 * Pure & deterministic, no rng — a finished round is scored by `playTotals` (score.ts) and banked here.
 * Ranking is by TO-PAR ascending (lower is better), ties broken by fewer gross strokes. To-par is the
 * fair cross-course key: par varies course to course, so a −3 on a par-70 beats a −2 on a par-72.
 *
 * This mirrors the Unending Universe's `EndlessRunRecord` history (endless.ts) but ranks the OTHER way
 * (lowest score, not deepest survival) and keys by course rather than a rolling window — a records mode
 * must never lose your best.
 */

import type { BagTier } from './bag';

/** One completed Star Tour round, banked as a course record. */
export interface StrokePlayRecord {
  /** The static course id it was played on (the per-course board key). */
  courseId: string;
  /** Which golfer played the round (character id). */
  characterId: string;
  /** The starting club set the round began on (a difficulty/category tag; not part of the ranking).
   *  MEANINGLESS on a champion round — see `champion`, which is the tag that applies there. */
  tier: BagTier;
  /**
   * The round was played by a STAR TOUR CHAMPION (GS-story-startour-champions) — a finished Story Tour
   * protagonist carrying the bag / gear / caddy they saved the galaxy with, rather than a golfer on a
   * starting club set.
   *
   * DESCRIPTIVE, NOT PART OF THE RANKING — the same standing this record's `characterId` and `tier`
   * already have. There is one board per course and a champion's −9 sits on it beside everyone else's.
   * The alternative — keying the board on the loadout — cannot be done honestly: a champion IS the live
   * campaign slot (`docs/decisions/story-campaign-slots.md`), deliberately so that a champion who keeps
   * shopping after the finale keeps improving, which means there is no stable loadout identity to key a
   * board on. You would be ranking a player against a bag they no longer own. So the board DESCRIBES the
   * round instead, and a ★ says why a score is out of reach of a starting bag.
   *
   * Absent on every record banked before this shipped, which reads as "we don't know" — the honest
   * answer, since a pre-champion round left no trace of what was in the bag.
   */
  champion?: boolean;
  /** Total gross strokes over the 18 holes. */
  strokes: number;
  /** Total par of the course. */
  par: number;
  /** Strokes − par (the ranking key; stored for stable, edit-proof display). */
  toPar: number;
  /** The weather sky the round was played under (a `CourseEffectId`), for the scorecard. 'none' = calm. */
  effect?: string;
  /** The run seed (lets a record be disambiguated / replayed). */
  seed: number;
}

/** The player's best-ever round on each course, keyed by course id. The single source of truth for both
 *  Star Tour boards; a course's record is only ever REPLACED by a better one, never evicted. */
export type StrokePlayBest = Record<string, StrokePlayRecord>;

/** Does round `a` rank better than `b`? Lower to-par wins; ties broken by fewer gross strokes. */
export function isBetterStroke(a: StrokePlayRecord, b: StrokePlayRecord): boolean {
  return a.toPar !== b.toPar ? a.toPar < b.toPar : a.strokes < b.strokes;
}

/** The stored best round on a course, or undefined if it's never been finished. */
export function bestStrokeFor(best: StrokePlayBest, courseId: string): StrokePlayRecord | undefined {
  return best[courseId];
}

/** Would this round set a NEW course record (no prior, or better than the stored best)? */
export function isNewCourseRecord(best: StrokePlayBest, rec: StrokePlayRecord): boolean {
  const prev = best[rec.courseId];
  return !prev || isBetterStroke(rec, prev);
}

/** Bank a finished round: keep it as the course's record only if it beats (or is the first on) that
 *  course. Returns a new map (never mutates); an unchanged best returns the SAME map reference. */
export function addStrokeRecord(best: StrokePlayBest, rec: StrokePlayRecord): StrokePlayBest {
  if (!isNewCourseRecord(best, rec)) return best;
  return { ...best, [rec.courseId]: rec };
}

/** The overall board: the `n` best course records, lowest to-par first (ties → fewer strokes, then
 *  by course id for a stable order). One entry per course (each is that course's best). */
export function bestStrokeRounds(best: StrokePlayBest, n = 5): StrokePlayRecord[] {
  return Object.values(best)
    .slice()
    .sort((a, b) => (isBetterStroke(a, b) ? -1 : isBetterStroke(b, a) ? 1 : a.courseId < b.courseId ? -1 : 1))
    .slice(0, n);
}

/** How many distinct courses the player has a record on (the "courses conquered" tally). */
export function coursesPlayed(best: StrokePlayBest): number {
  return Object.keys(best).length;
}
