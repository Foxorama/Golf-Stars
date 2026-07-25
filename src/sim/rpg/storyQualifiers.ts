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

/** GS-story-qualifier-formats: a qualifying event is a NINE-hole card, not a full 18. Three events per
 *  chapter × five chapters is a lot of golf to sit between you and each Sigil; at nine holes an event is a
 *  single sitting, the format variety below actually gets to breathe, and the Sigil majors keep the full
 *  18-hole weight that makes them majors. The bar/field maths scales off this (`ghostToPar`), so the
 *  qualifying difficulty per hole is unchanged. */
export const QUALIFIER_HOLES = 9;

/** The reference round length the raw `QUALIFY_BAR`/`RANK_SPREAD` numbers are expressed over. */
const BAR_REFERENCE_HOLES = 18;

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
 * on alignment — the caller resolves it). GS-story-world-variety: a chapter now charts FOUR worlds, so
 * this returns THREE qualifying events — but you still only need to QUALIFY in `QUALIFY_EVENTS_NEEDED`
 * (two) of them, so the extra event is a CHOICE of road, not more required grind.
 */
export function qualifierEventsForChapter(chapter: number, venueId: string | undefined): string[] {
  return STORY_WORLDS.filter((w) => w.unlockChapter === chapter && w.courseId !== venueId).map((w) => w.courseId);
}

/** A named ghost competitor in a qualifying field (deterministic gross over the venue's pars). On a PAIRED
 *  event (GS-story-qualifier-formats) the `name` is a two-golfer pair ("Chip Nakamura & Gale Ossuary") and
 *  the gross is that pair's team card; on a STABLEFORD event `points` carries the same card scored as
 *  points (higher wins) — the field is otherwise the identical deterministic ladder. */
export interface QualifierGhost {
  name: string;
  gross: number;
  points?: number;
}

/** Shape levers for a qualifying FIELD (GS-story-qualifier-formats). All optional and defaulting to the
 *  classic 18-hole stroke event, so `qualifierField(id, par, chapter)` is byte-for-byte unchanged. */
export interface QualifierFieldOpts {
  /** How many holes the event is played over (scales the bar + the rank spread). Default 18. */
  holes?: number;
  /** Strokes added to EVERY ghost's to-par — negative sharpens the field. The paired formats use this to
   *  price in the partner you're carrying, so a two-ball event is no easier to qualify in than a solo one. */
  barShift?: number;
  /** Score the field in STABLEFORD points (higher wins) as well as strokes, and sort points-first. */
  stableford?: boolean;
  /** Field entries are two-golfer PAIRS (name them as such). */
  paired?: boolean;
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
 *  qualifying bar, so a player who beats the bar places inside the top N. The bar + the rank spread are
 *  quoted over an 18-hole card and SCALE with the event's length (GS-story-qualifier-formats), so a nine-hole
 *  event asks for exactly the same golf per hole; `barShift` prices in a format's scoring advantage (a
 *  partner's ball) on top. `holes = 18, barShift = 0` reproduces the original draw exactly. */
function ghostToPar(rank: number, chapter: number, holes = BAR_REFERENCE_HOLES, barShift = 0): number {
  const n = qualifyTop(chapter);
  const scale = holes / BAR_REFERENCE_HOLES;
  return (QUALIFY_BAR[chIdx(chapter)]! + (rank - (n - 1)) * RANK_SPREAD) * scale + barShift;
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
 * shuffle) so the qualifying bar is crisp and testable. `opts` (GS-story-qualifier-formats) reshapes the
 * field for the event's drawn FORMAT — length, the paired-format bar shift, Stableford points, pair names —
 * and defaults to the classic 18-hole stroke field, byte-for-byte.
 */
export function qualifierField(
  courseId: string,
  totalPar: number,
  chapter: number,
  opts: QualifierFieldOpts = {},
): QualifierGhost[] {
  const f = qualifierFieldSize(chapter);
  const holes = opts.holes ?? BAR_REFERENCE_HOLES;
  const names = pickNames(courseId, f - 1);
  // A PAIRED event fields two-golfer pairs: each entry takes its own name plus one from the far half of the
  // same stable line-up, so the pairings are distinct, deterministic and read like a real draw sheet.
  const offset = Math.max(1, Math.floor((f - 1) / 2));
  const ghosts: QualifierGhost[] = [];
  for (let rank = 0; rank < f - 1; rank++) {
    const solo = names[rank] ?? `Competitor ${rank + 1}`;
    const mate = names[(rank + offset) % Math.max(1, names.length)] ?? `Competitor ${rank + 2}`;
    const gross = Math.round(totalPar + ghostToPar(rank, chapter, holes, opts.barShift ?? 0));
    ghosts.push({
      name: opts.paired ? `${solo} & ${mate}` : solo,
      gross,
      // Stableford scores the SAME card as points: par is 2, every stroke over costs one (the arcade
      // approximation the ghost model is expressed in — a ghost has a to-par, not a hole-by-hole card).
      ...(opts.stableford ? { points: Math.max(0, Math.round(2 * holes - (gross - totalPar))) } : {}),
    });
  }
  return opts.stableford
    ? ghosts.sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    : ghosts.sort((a, b) => a.gross - b.gross);
}

/** The player's finishing PLACE in a field (1 = winner). Ties break in the player's favour (a tied gross
 *  places the player ahead), matching the tournament convention. */
export function qualifierPlacement(field: readonly QualifierGhost[], playerGross: number): number {
  return 1 + field.filter((g) => g.gross < playerGross).length;
}

/** The player's finishing PLACE in a STABLEFORD field (1 = winner; MORE points is better). Ties break in
 *  the player's favour, exactly as the stroke placement does. */
export function qualifierPlacementByPoints(field: readonly QualifierGhost[], playerPoints: number): number {
  return 1 + field.filter((g) => (g.points ?? 0) > playerPoints).length;
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

/**
 * GS-story-qualifier-formats: record WHO you played a paired qualifying event with (pure). One entry per
 * EVENT — a replay of the same world can't stack the tally, so grinding one road never skews who ends up
 * standing apart; only playing MORE of the chapter's roads does. Immutable; a no-op if already recorded.
 */
export function recordQualifierPartner(story: StoryState, courseId: string, partnerId: string): StoryState {
  if (!partnerId || story.qualifierPartners[courseId] === partnerId) return story;
  return { ...story, qualifierPartners: { ...story.qualifierPartners, [courseId]: partnerId } };
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
