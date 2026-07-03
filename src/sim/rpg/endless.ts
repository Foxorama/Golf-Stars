import type { BagTier } from './bag';
import { RARITY_C } from './loot';

/**
 * The Unending Universe (GS-unending) — the endless survival format's pure rules.
 *
 * The mode's spine reuses the whole meta-loop unchanged (4-hole stop → Pro Shop → journey lane →
 * next stop, forever); what THIS module owns is the survival law and the milestone ladder:
 *
 *   • SURVIVAL BAR — every hole carries a required score, PAR-RELATIVE so a par-3 and a par-5 are
 *     equally fair: quad bogey for holes 1–8, then triple / double / bogey / par per 8-hole block,
 *     and from hole 41 on only a BIRDIE (or better) keeps the run alive. Miss the bar once and the
 *     run ends on the spot. (The user-facing "8/7/6/5/4" ramp is exactly this ladder on a par-4.)
 *
 *   • MILESTONES — surviving 40/60/80/100/120/140 holes fires a victory takeover and banks a Star
 *     Shard bonus INSTANTLY (via `run.bonusShards`, so a later bust never claws it back).
 *
 *   • UNLOCKS — the Evergreen cosmetic set (bag → cap → pants → the Green Jacket) unlocks at
 *     40/60/80/100, and a SECRET mythic ship waits at hole 150. Unlocks are permanent (pushed into
 *     the owned-cosmetics pools by the UI reducer, keyed off the lifetime-best hole count).
 *
 * Everything here is pure data + arithmetic — no rng, no DOM — so the whole ladder is unit-tested
 * and the gate maths can never drift between the headless sim and the interactive driver (both call
 * these same functions).
 */

/** The survival bar tightens every this-many holes. */
export const ENDLESS_TIER_HOLES = 8;

/** Allowed strokes OVER PAR per 8-hole tier; the final entry (birdie-or-better) repeats forever. */
export const ENDLESS_GATE_STEPS: readonly number[] = [4, 3, 2, 1, 0, -1];

/** The strokes-over-par allowed on the n-th hole of the run (1-based, cumulative across stops). */
export function endlessGateOverPar(holeNumber: number): number {
  const tier = Math.floor((Math.max(1, Math.round(holeNumber)) - 1) / ENDLESS_TIER_HOLES);
  return ENDLESS_GATE_STEPS[Math.min(tier, ENDLESS_GATE_STEPS.length - 1)]!;
}

/** A golfer-readable name for a survival bar ("Bogey or better", not "+1"). */
export function endlessGateLabel(overPar: number): string {
  switch (overPar) {
    case 4:
      return 'Quad bogey';
    case 3:
      return 'Triple bogey';
    case 2:
      return 'Double bogey';
    case 1:
      return 'Bogey';
    case 0:
      return 'Par';
    case -1:
      return 'Birdie';
    case -2:
      return 'Eagle';
    default:
      return overPar > 0 ? `+${overPar}` : `${overPar}`;
  }
}

/** The most strokes that keep the run alive on the n-th hole (par-relative bar; floored at 1). */
export function endlessRequiredStrokes(par: number, holeNumber: number): number {
  return Math.max(1, par + endlessGateOverPar(holeNumber));
}

/** Does a finished hole clear its survival bar? A pickup (never holed out) always fails. */
export function passesEndlessGate(par: number, strokes: number, holed: boolean, holeNumber: number): boolean {
  return holed && strokes <= endlessRequiredStrokes(par, holeNumber);
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
  { holes: 60, kind: 'apparel', id: 'cap-baggy-green', name: 'Baggy Green Cap' },
  { holes: 80, kind: 'apparel', id: 'pants-evergreen', name: 'Evergreen Pro Pants' },
  { holes: 100, kind: 'apparel', id: 'jacket-green', name: 'The Green Jacket' },
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

// --- Golf scoring: gross / net / to-par (GS-golf-score) -----------------------
//
// The Unending Universe is now scored like a real round of golf: a running GROSS (total strokes over
// the holes you've conquered), a TO-PAR figure ("−3", "+5", "E"), and a NET that applies a course
// handicap so runs on different STARTING CLUB SETS are comparable. Survival is unchanged — you still
// play until you miss a hole's par-relative bar; these are the presentation of how you played the holes
// you reached. All pure arithmetic — no rng, no DOM — so both the headless sim and the interactive
// driver read the identical numbers.

/**
 * The four STARTING CLUB SETS, tiered by loot rarity, that double as the mode's difficulty axis
 * (GS-golf-score): green (common starter clubs) → orange (legendary). A weaker set is the sterner
 * test — so it receives more handicap strokes, keeping NET scores fair to compare across sets. The
 * colour + label read straight off the shared rarity table, so a new tier is a new rarity row, nothing
 * here.
 */
export interface ClubSetDifficulty {
  tier: BagTier;
  /** The rack colour keyword the leaderboard groups by. */
  key: 'green' | 'blue' | 'purple' | 'orange';
  /** Player-facing name of the set / difficulty. */
  label: string;
  /** Rarity accent colour (the leaderboard's category colour). */
  col: string;
  /** Course handicap: strokes given back over a full 18 holes (a weaker set gets more). */
  handicap18: number;
}

export const CLUB_SET_DIFFICULTIES: readonly ClubSetDifficulty[] = [
  { tier: 'common', key: 'green', label: 'Starter set', col: RARITY_C.common.col, handicap18: 18 },
  { tier: 'rare', key: 'blue', label: 'Tour set', col: RARITY_C.rare.col, handicap18: 12 },
  { tier: 'epic', key: 'purple', label: 'Pro set', col: RARITY_C.epic.col, handicap18: 6 },
  { tier: 'legendary', key: 'orange', label: 'Elite set', col: RARITY_C.legendary.col, handicap18: 0 },
];

/** The club-set difficulty a run's starting bag tier maps to (absent/unknown ⇒ the green starter set). */
export function clubSetOf(tier: BagTier | undefined): ClubSetDifficulty {
  return CLUB_SET_DIFFICULTIES.find((d) => d.tier === (tier ?? 'common')) ?? CLUB_SET_DIFFICULTIES[0]!;
}

/**
 * The handicap strokes received over `holes` holes on a given starting set — the full-18 allowance
 * prorated to how far the run got, rounded to whole strokes (real golf gives whole strokes). Scratch
 * (the legendary Elite set) always returns 0, so its net == gross.
 */
export function clubSetHandicapStrokes(tier: BagTier | undefined, holes: number): number {
  const h18 = clubSetOf(tier).handicap18;
  return Math.round((h18 * Math.max(0, holes)) / 18);
}

/** Net strokes = gross minus the starting set's prorated handicap allowance (floored at 0). */
export function netStrokes(gross: number, holes: number, tier: BagTier | undefined): number {
  return Math.max(0, gross - clubSetHandicapStrokes(tier, holes));
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
  /** Holes reached (the survival streak) — the headline result. */
  holes: number;
  /** Total gross strokes over the holes reached. */
  gross: number;
  /** Total par of the holes reached (⇒ toPar = gross − par). */
  par: number;
  /** Ascension tier the run was played at (usually 0 in the endless format). */
  ascension: number;
  /** The run seed (lets a record be replayed / disambiguated). */
  seed: number;
}

/** Cap on stored records — we keep a rolling window and surface the most recent slice. */
export const ENDLESS_RECORDS_KEPT = 30;

/** Prepend a finished run to the history, newest first, capped at ENDLESS_RECORDS_KEPT. */
export function addEndlessRecord(records: readonly EndlessRunRecord[], rec: EndlessRunRecord): EndlessRunRecord[] {
  return [rec, ...records].slice(0, ENDLESS_RECORDS_KEPT);
}

/** A record's net-to-par (gross − handicap − par) — the fair, cross-set comparison figure. */
export function recordNetToPar(rec: EndlessRunRecord): number {
  return netStrokes(rec.gross, rec.holes, rec.tier) - rec.par;
}

/** The furthest-reaching record (ties broken by better net-to-par) — the "best effort". */
export function bestEndlessRecord(records: readonly EndlessRunRecord[]): EndlessRunRecord | undefined {
  return records.reduce<EndlessRunRecord | undefined>((best, r) => {
    if (!best) return r;
    if (r.holes !== best.holes) return r.holes > best.holes ? r : best;
    return recordNetToPar(r) < recordNetToPar(best) ? r : best;
  }, undefined);
}
