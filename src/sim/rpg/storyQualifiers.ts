/**
 * Story-Tour QUALIFYING EVENTS (GS-story-qualifiers) — the road into each Galaxy Tournament.
 *
 * The old gate was "clear any 2 of the chapter's worlds". Now each chapter's non-venue worlds are
 * QUALIFYING TOURNAMENTS with a real FIELD of competitors, and you must finish TOP-N in **two** of them
 * to earn a start in the chapter's Sigil major. The bar tightens by chapter — top 10 → 8 → 6 → 4 → 4 —
 * so as the galaxy frays you have to actually contend, not just show up.
 *
 * PURE + DOM-free (no window, seeded only for the competitor NAME shuffle) so vitest can prove the field,
 * the placement, and the two-events gate. The FIELD is a deterministic ghost board: each rank plays a
 * fixed to-par so the qualifying bar is crisp + tunable (the story-balance concern — a mandatory gate must
 * never wall a competent round; a qualifier world is also revisitable, so a loose round can be replayed).
 * `story.ts` owns the persisted `qualifierResults`; the alignment-aware wrappers live in `storyTournaments.ts`
 * (which imports THIS — never the reverse, so there's no cycle).
 */

import { Rng } from '../rng';
import { STORY_WORLDS, STORY_CHAPTER_COUNT, storyWorldById, type StoryState } from './story';

/** How many qualifying events (top-N finishes) you need to unlock a chapter's Galaxy Tournament. */
export const QUALIFY_EVENTS_NEEDED = 2;

/** The finishing position you must beat to QUALIFY, by chapter (1..5): top 10 → 8 → 6 → 4 → 4. The bar
 *  tightens as the campaign — and the serpent — escalates. */
export const QUALIFY_TOP: readonly number[] = [10, 8, 6, 4, 4];

/** The size of a qualifying event's FIELD (you + ghosts), by chapter. Shrinks so a top-4 late is a real
 *  contest, not a formality. */
export const QUALIFIER_FIELD: readonly number[] = [16, 16, 14, 12, 12];

/** The to-par the N-th-best ghost sits at, by chapter — i.e. the score you must MATCH to just sneak in.
 *  Gentle early (a bogey round qualifies at Ch.1) tightening to a couple under by Ch.5, where your grown
 *  bag has to earn it. This is the qualifying BAR; the Sigil match (the rival) is the sharper final test. */
const QUALIFY_BAR: readonly number[] = [2, 1, 0, -1, -2];

/** Strokes of separation between adjacent field ranks — spreads the board around the bar. */
const RANK_SPREAD = 1.1;

function chIdx(chapter: number): number {
  return Math.max(0, Math.min(STORY_CHAPTER_COUNT - 1, Math.round(chapter) - 1));
}

/** The top-N finish that qualifies you, for a world's chapter. */
export function qualifyTop(chapter: number): number {
  return QUALIFY_TOP[chIdx(chapter)]!;
}
/** The field size (you + ghosts) for a chapter's qualifying event. */
export function qualifierFieldSize(chapter: number): number {
  return QUALIFIER_FIELD[chIdx(chapter)]!;
}

/**
 * The qualifying events of a chapter = the chapter's worlds EXCEPT the Sigil VENUE (which is played as the
 * major itself). `venueId` is passed in so this module never imports `storyTournaments` (the venue depends
 * on alignment — the caller resolves it). There are always exactly two (a chapter has three worlds).
 */
export function qualifierEventsForChapter(chapter: number, venueId: string | undefined): string[] {
  return STORY_WORLDS.filter((w) => w.unlockChapter === chapter && w.courseId !== venueId).map((w) => w.courseId);
}

/** A named ghost competitor in a qualifying field (deterministic gross over the venue's pars). */
export interface QualifierGhost {
  name: string;
  gross: number;
}

/** A recorded qualifier finish (the BEST — lowest place — the player has posted at this event). */
export interface QualifierResult {
  place: number;
  field: number;
}

/** The competitor name pool — fictional tour pros with a cosmic bent. Shuffled per world so each event
 *  fields a different, stable line-up. */
const NAME_POOL: readonly string[] = [
  'Bogey Bördvik', 'Chip Nakamura', 'Fairway Fenn', 'Gale Ossuary', 'Halcyon Vey', 'Iridia Sol',
  'Jax Crater', 'Kestrel Voss', 'Lyra Bellwether', 'Marlo Quist', 'Nova Pinehurst', 'Orrin Slade',
  'Pippa Grün', 'Quill Argent', 'Rook Sabbath', 'Sable Meridian', 'Tavish Roan', 'Ushi Kwan',
  'Vale Corriden', 'Wren Halloway', 'Xander Pell', 'Yara Duskmoor', 'Zeb Calloway', 'Ada Fernleaf',
  'Bram Tollver', 'Cass Nightingale', 'Deo Ravencourt', 'Echo Marsh',
];

/** The to-par a ghost of the given RANK (0 = strongest) plays at this chapter. Rank N-1 sits exactly at the
 *  qualifying bar, so a player who beats the bar places inside the top N. */
function ghostToPar(rank: number, chapter: number): number {
  const n = qualifyTop(chapter);
  return QUALIFY_BAR[chIdx(chapter)]! + (rank - (n - 1)) * RANK_SPREAD;
}

/** Pick a stable, world-specific line-up of `count` competitor names. */
function pickNames(courseId: string, count: number): string[] {
  const rng = new Rng(`qualnames:${courseId}`);
  const pool = [...NAME_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.float() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/**
 * The FIELD of a qualifying event: `fieldSize - 1` ghost competitors, each playing a fixed rank-based
 * to-par over the venue's total par, sorted low gross first. Deterministic (the only rng is the name
 * shuffle) so the qualifying bar is crisp and testable.
 */
export function qualifierField(courseId: string, totalPar: number, chapter: number): QualifierGhost[] {
  const f = qualifierFieldSize(chapter);
  const names = pickNames(courseId, f - 1);
  const ghosts: QualifierGhost[] = [];
  for (let rank = 0; rank < f - 1; rank++) {
    ghosts.push({ name: names[rank] ?? `Competitor ${rank + 1}`, gross: Math.round(totalPar + ghostToPar(rank, chapter)) });
  }
  return ghosts.sort((a, b) => a.gross - b.gross);
}

/** The player's finishing PLACE in a field (1 = winner). Ties break in the player's favour (a tied gross
 *  places the player ahead), matching the tournament convention. */
export function qualifierPlacement(field: readonly QualifierGhost[], playerGross: number): number {
  return 1 + field.filter((g) => g.gross < playerGross).length;
}

/** Did the player's finishing place qualify them at a world of this chapter? */
export function placeQualifies(place: number, chapter: number): boolean {
  return place <= qualifyTop(chapter);
}

/** Record a qualifier finish (pure): keep only the BEST (lowest) place per event, so a replay can improve
 *  but never worsen a qualification. Immutable. */
export function recordQualifier(story: StoryState, courseId: string, place: number, field: number): StoryState {
  const prev = story.qualifierResults[courseId];
  if (prev && prev.place <= place) return story;
  return { ...story, qualifierResults: { ...story.qualifierResults, [courseId]: { place, field } } };
}

/** Has the player QUALIFIED at this specific event (their best finish clears the top-N bar)? `chapter` is
 *  the event world's own chapter (its threshold is fixed regardless of the player's current chapter). */
export function eventQualified(story: StoryState, courseId: string): boolean {
  const r = story.qualifierResults[courseId];
  const w = storyWorldById(courseId);
  return !!r && !!w && placeQualifies(r.place, w.unlockChapter);
}

/** How many of a given set of qualifying events the player has qualified in. */
export function qualifiedCount(story: StoryState, eventIds: readonly string[]): number {
  return eventIds.filter((id) => eventQualified(story, id)).length;
}
