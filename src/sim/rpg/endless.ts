import type { BagTier } from './bag';
import type { PlayedHole } from '../round';
import { RARITY_C } from './loot';

/**
 * The Unending Universe (GS-unending) — the endless survival format's pure rules.
 *
 * The mode's spine reuses the whole meta-loop unchanged (4-hole stop → Pro Shop → journey lane →
 * next stop, forever); what THIS module owns is the survival law and the milestone ladder:
 *
 *   • SURVIVAL BAR — judged per SET OF FOUR (one stop), on the four-hole cumulative to-par, RESET each
 *     set: the set survives if `Σ(strokes − par) ≤ the set's allowance`. The allowance ramps every two
 *     sets — +4 (sets 1–2), +3, +2, +1, E, −1, −2, −3, capped at −4 (average birdie) forever. Because
 *     it's the four-hole TOTAL, a single blow-up hole (capped at par + MAX_OVER_PAR) can be clawed back
 *     by the other three, so the run only ever ends at a SET boundary — never on one bad hole. Depth
 *     (sets cleared / holes reached) is the sole metric: there is no run-total score to chase.
 *
 *   • MILESTONES — surviving 40/60/80/100/120/140 holes fires a victory takeover and banks a Star
 *     Shard bonus INSTANTLY (via `run.bonusShards`, so a later bust never claws it back). The bonus is
 *     LIFETIME-once, exactly like the cosmetic unlocks below: `finishStop` floors the crossing at the
 *     reducer's persisted lifetime-best hole, so a milestone re-reached in a later run banks nothing.
 *
 *   • UNLOCKS — the Evergreen cosmetic set (bag → cap → pants → the Evergreen Blazer) unlocks at
 *     40/60/80/100, and a SECRET mythic ship waits at hole 150. Unlocks are permanent (pushed into
 *     the owned-cosmetics pools by the UI reducer, keyed off the lifetime-best hole count).
 *
 * Everything here is pure data + arithmetic — no rng, no DOM — so the whole ladder is unit-tested
 * and the gate maths can never drift between the headless sim and the interactive driver (both call
 * these same functions).
 */

/** A "set of four" IS one endless stop — survival is judged on the four-hole total, never a single hole. */
export const ENDLESS_SET_HOLES = 4;

/** The survival threshold steps DOWN one stroke every this-many SETS (two sets per band). */
export const ENDLESS_SETS_PER_STEP = 2;

/**
 * Cumulative strokes-OVER-PAR a whole SET (its four holes together) may finish at to survive, per
 * step; the final entry (−4, i.e. four-under = average birdie) repeats forever (the cap). The user-
 * facing ramp: +4 for sets 1–2, then +3 / +2 / +1 / E / −1 / −2 / −3 and capped at −4, each band two
 * sets long. A single blow-up hole (capped at par + MAX_OVER_PAR) can be absorbed by the other three,
 * so the run only ever ends at a SET boundary — never mid-set.
 */
export const ENDLESS_SET_STEPS: readonly number[] = [4, 3, 2, 1, 0, -1, -2, -3, -4];

/** The cumulative over-par a SET must finish at or under, for a 0-based stop index (holesSurvived/4). */
export function endlessSetGateOverPar(stopIndex: number): number {
  const step = Math.floor(Math.max(0, Math.round(stopIndex)) / ENDLESS_SETS_PER_STEP);
  return ENDLESS_SET_STEPS[Math.min(step, ENDLESS_SET_STEPS.length - 1)]!;
}

/** A set's cumulative to-par (Σ strokes − Σ par). Blow-ups are already capped at par + MAX_OVER_PAR by
 *  the sim, so this is bounded and fair. A pickup just scores its capped strokes — it never auto-busts
 *  the set (the four-hole total is what counts). Pure. */
export function endlessSetToPar(played: readonly { record: { par: number; strokes: number } }[]): number {
  return played.reduce((t, p) => t + (p.record.strokes - p.record.par), 0);
}

/** Does a completed SET clear its survival threshold? (its cumulative to-par ≤ the set's allowance). */
export function passesEndlessSet(setToPar: number, stopIndex: number): boolean {
  return setToPar <= endlessSetGateOverPar(stopIndex);
}

/** A golfer-readable target for a set threshold ("+4", "E", "−2"). */
export function endlessSetLabel(overPar: number): string {
  return formatToPar(overPar);
}

// --- Warp: the hidden automatic-birdie rule (GS-warp) --------------------------
//
// Warp fast-forwards the early holes the player has ALREADY proven they can beat (capped at their
// lifetime best), auto-playing whole stops instantly. Its survival law is the mirror of the pickup
// rule: just as a disaster hole is CAPPED at par + MAX_OVER_PAR, a warped hole is FLOORED at a
// BIRDIE — the ball is deemed holed in par−1 (a better real score, an eagle or ace, stands). A
// birdie beats every survival bar, so a warped stop can never bust the run; measurement showed no
// honest assist can deliver deep holes anyway (the 41+ birdie-or-better bar compounds
// exponentially — see reports/endless-ai-depth-2026-07-04.md), so warp is a format-blessed
// checkpoint, kept honest on the leaderboard by recording the run's STARTING hole (the range
// "50–67" can never masquerade as "1–67").

/** Floor a warp-played hole at a birdie: holed in min(actual, par−1) strokes (never below 1) —
 *  a real eagle/ace stands, a pickup becomes the birdie. Pure; zero rng. */
export function warpBirdieHole(p: PlayedHole): PlayedHole {
  const strokes = Math.min(p.record.strokes, Math.max(1, p.record.par - 1));
  return { ...p, record: { ...p.record, strokes }, holed: true, pickedUp: false };
}

// --- Milestones (the victory screens) ----------------------------------------

export interface EndlessMilestone {
  /** Cumulative holes survived. */
  holes: number;
  /** Star Shards banked the moment the milestone is crossed (kept even on a later bust). */
  shards: number;
}

/** The celebrated survival milestones — each fires a victory takeover + banks its shard bonus. */
export const ENDLESS_MILESTONES: readonly EndlessMilestone[] = [
  { holes: 40, shards: 40 },
  { holes: 60, shards: 60 },
  { holes: 80, shards: 90 },
  { holes: 100, shards: 130 },
  { holes: 120, shards: 180 },
  { holes: 140, shards: 240 },
];

/** The milestones newly crossed when the survived-hole count moves `before` → `after`. */
export function endlessMilestonesCrossed(before: number, after: number): EndlessMilestone[] {
  return ENDLESS_MILESTONES.filter((m) => before < m.holes && after >= m.holes);
}

/** Total shard bonus banked by crossing `before` → `after`. */
export function endlessMilestoneShards(before: number, after: number): number {
  return endlessMilestonesCrossed(before, after).reduce((s, m) => s + m.shards, 0);
}

// --- Permanent cosmetic unlocks ----------------------------------------------

export interface EndlessUnlock {
  /** Cumulative holes survived to earn it. */
  holes: number;
  /** Which owned-cosmetics pool it joins ('apparel' → ownedApparel, 'ship' → ownedShips). */
  kind: 'apparel' | 'ship';
  /** The catalogue id (apparel.ts / ships.ts row) — machine-checked by tests/endless.test.ts. */
  id: string;
  name: string;
  /** A secret is never teased by name — the UI shows "???" until it's earned. */
  secret?: boolean;
}

/** The Evergreen set + the hole-150 secret. Ids resolve against the cosmetic catalogues. */
export const ENDLESS_UNLOCKS: readonly EndlessUnlock[] = [
  { holes: 40, kind: 'apparel', id: 'bag-evergreen', name: 'Evergreen Tour Bag' },
  { holes: 60, kind: 'apparel', id: 'cap-baggy-green', name: 'Evergreen Soft Cap' },
  { holes: 80, kind: 'apparel', id: 'pants-evergreen', name: 'Evergreen Pro Pants' },
  { holes: 100, kind: 'apparel', id: 'jacket-green', name: 'The Evergreen Blazer' },
  { holes: 150, kind: 'ship', id: 'infinity-ace', name: 'The Infinity Ace', secret: true },
];

/** Every unlock earned at a lifetime-best hole count. */
export function endlessUnlocksEarned(bestHoles: number): EndlessUnlock[] {
  return ENDLESS_UNLOCKS.filter((u) => bestHoles >= u.holes);
}

/** The unlocks newly earned when the lifetime best moves `before` → `after`. */
export function endlessUnlocksCrossed(before: number, after: number): EndlessUnlock[] {
  return ENDLESS_UNLOCKS.filter((u) => before < u.holes && after >= u.holes);
}

/** The next unearned unlock (the market/title tease); secrets stay in the list but read "???". */
export function nextEndlessUnlock(bestHoles: number): EndlessUnlock | undefined {
  return ENDLESS_UNLOCKS.find((u) => bestHoles < u.holes);
}

// --- Starting club sets = the difficulty axis (GS-golf-score / GS-set-survival) ------------------
//
// The four STARTING CLUB SETS are the mode's difficulty selector: a weaker rack makes the escalating
// per-set survival thresholds genuinely harder to clear. They no longer feed a handicap/net SCORE —
// depth (sets cleared) is the only thing the Unending Universe tracks, so there's nothing to net. The
// set is purely how strong your bag starts.

/**
 * The four STARTING CLUB SETS, tiered by loot rarity: green (common starter clubs) → orange
 * (legendary Elite). The colour + label read straight off the shared rarity table, so a new tier is a
 * new rarity row, nothing here.
 */
export interface ClubSetDifficulty {
  tier: BagTier;
  /** The rack colour keyword the leaderboard groups by. */
  key: 'green' | 'blue' | 'purple' | 'orange';
  /** Player-facing name of the set / difficulty. */
  label: string;
  /** Rarity accent colour (the leaderboard's category colour). */
  col: string;
}

export const CLUB_SET_DIFFICULTIES: readonly ClubSetDifficulty[] = [
  { tier: 'common', key: 'green', label: 'Starter set', col: RARITY_C.common.col },
  { tier: 'rare', key: 'blue', label: 'Tour set', col: RARITY_C.rare.col },
  { tier: 'epic', key: 'purple', label: 'Pro set', col: RARITY_C.epic.col },
  { tier: 'legendary', key: 'orange', label: 'Elite set', col: RARITY_C.legendary.col },
];

/** The club-set difficulty a run's starting bag tier maps to (absent/unknown ⇒ the green starter set). */
export function clubSetOf(tier: BagTier | undefined): ClubSetDifficulty {
  return CLUB_SET_DIFFICULTIES.find((d) => d.tier === (tier ?? 'common')) ?? CLUB_SET_DIFFICULTIES[0]!;
}

/** A golf-readable to-par figure: "E" at level, "−3" under, "+5" over. */
export function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `−${-toPar}`;
}

/** The colour a to-par figure reads in (under green, level ink-neutral, over amber→red). */
export function toParColour(toPar: number): string {
  if (toPar < 0) return '#5fd45a';
  if (toPar === 0) return '#cdd3df';
  return toPar <= 4 ? '#ffce54' : '#ff6b6b';
}

// --- Per-run records: the last-runs leaderboard (GS-golf-score) ----------------

/** One completed Unending-Universe run, banked for the personal last-runs leaderboard. */
export interface EndlessRunRecord {
  /** Which golfer played the run (character id). */
  characterId: string;
  /** The STARTING CLUB SET the run began on — the leaderboard's difficulty category. */
  tier: BagTier;
  /** Holes reached (the survival streak) — the headline result and the ONLY ranking key. */
  holes: number;
  /** Total gross strokes / par over the holes reached. Retained for save-shape stability + possible
   *  future recaps; NOT shown or ranked on — the Unending Universe tracks depth alone. */
  gross: number;
  par: number;
  /** Ascension tier the run was played at (usually 0 in the endless format). */
  ascension: number;
  /** The run seed (lets a record be replayed / disambiguated). */
  seed: number;
  /** The first HAND-PLAYED hole (GS-warp): 1 / absent = played from the first tee; a warped run
   *  starts where the auto-birdie prefix ended + 1 — so the board's range ("50–67") keeps a warped
   *  run honestly distinguishable from a solo one. */
  startHole?: number;
}

/** The record's hole RANGE, first hand-played → last survived ("1–49", "50–67"). What the board
 *  tracks is how far the run got; the range shows where it started earning it (GS-warp). */
export function recordRange(rec: EndlessRunRecord): string {
  return `${rec.startHole ?? 1}–${rec.holes}`;
}

/** The board view: the newest `n` runs, sorted by the highest hole reached — depth is the whole
 *  ranking now (no score tiebreak), so ties fall back to newest-first. Pure. */
export function endlessRecordsByDepth(records: readonly EndlessRunRecord[], n = 10): EndlessRunRecord[] {
  const newest = records.slice(0, n);
  return [...newest].sort((a, b) => (a.holes !== b.holes ? b.holes - a.holes : newest.indexOf(a) - newest.indexOf(b)));
}

/** Cap on stored records — we keep a rolling window and surface the most recent slice. */
export const ENDLESS_RECORDS_KEPT = 30;

/** Prepend a finished run to the history, newest first, capped at ENDLESS_RECORDS_KEPT. */
export function addEndlessRecord(records: readonly EndlessRunRecord[], rec: EndlessRunRecord): EndlessRunRecord[] {
  return [rec, ...records].slice(0, ENDLESS_RECORDS_KEPT);
}

/** The furthest-reaching record (ties → the most recent) — the "best effort". Depth is the only key. */
export function bestEndlessRecord(records: readonly EndlessRunRecord[]): EndlessRunRecord | undefined {
  return records.reduce<EndlessRunRecord | undefined>((best, r) => (!best || r.holes > best.holes ? r : best), undefined);
}
