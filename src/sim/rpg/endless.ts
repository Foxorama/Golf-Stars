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
