/**
 * Default-bag upgrade tiers (GS-bag-tiers) — the cross-run Star-Shard splurge that lifts EVERY
 * character's starting bag to a higher loot rarity for deep-ascension runs.
 *
 * The constitution says "new item = a new row, not an engine edit", and a bag tier is exactly that:
 * it re-stamps the (already-built) starting clubs with one of the existing themed reward SETS
 * (Planet / Phoenix Flames / Solar Storm), so a bought tier is identical to having outfitted the whole
 * bag from the Pro Shop — same carry bonuses on the distance clubs, same themed putter make-window, and
 * the same glowing gear the on-course golfer swings (`equippedGearTheme` already reads the bag's rarest
 * themed set). NOTHING here is a special case in the sim: it's the reward-club machinery, applied to the
 * default bag at run start.
 *
 * Unlocked by CLEARING an Ascension gate (a won voyage at that tier bumps `maxAscension` to gate+1):
 *   • rare      "Planet"        — after clearing A2  (maxAscension ≥ 3)  · 500 shards
 *   • epic      "Phoenix Flames"— after clearing A6  (maxAscension ≥ 7)  · 2,000 shards
 *   • legendary "Solar Storm"   — after clearing A11 (maxAscension ≥ 12) · 10,000 shards
 *
 * Pure & data-driven. The owned tier is permanent meta (persisted in the save, like Star Shards), baked
 * into the loadout at `startRun`/`resumeRun`. The default (common) tier is a no-op, so a feature-off
 * loadout is byte-for-byte unchanged (the determinism contract).
 */

import type { Rarity } from '../course/contract';
import { RARITY_C } from './loot';
import {
  buildRewardClub,
  clubSetById,
  isDistanceType,
  type PlayerLoadout,
} from './economy';

/** A default-bag tier is one of the loot rarities (common = the un-upgraded starter bag). */
export type BagTier = Rarity;

export const DEFAULT_BAG_TIER: BagTier = 'common';

/** A purchasable bag-and-club set: the rarity it lifts the whole default bag to, which themed reward
 *  SETS re-stamp the distance vs scoring clubs, the Ascension gate, and the Shard price. */
export interface BagSet {
  /** The rarity all default clubs become (never 'common' — that's the un-bought baseline). */
  tier: Exclude<BagTier, 'common'>;
  /** Market name + a one-line pitch. */
  name: string;
  blurb: string;
  /** Star-Shard price. */
  cost: number;
  /** The `maxAscension` the player must have reached to unlock this (= the cleared gate + 1). */
  unlockMaxAscension: number;
  /** Human label for the Ascension gate (the level you must CLEAR), e.g. 'A2'. */
  gateLabel: string;
  /** Reward SET id used to re-stamp the DISTANCE clubs (woods/long hybrids — gains carry). */
  distanceSet: string;
  /** Reward SET id used to re-stamp the SCORING clubs + putter (base carry; putter gains make-window). */
  scoringSet: string;
  /** The set's render theme + tint (drives the blinged golf-bag SVG + the swung club glow). */
  theme: string;
  tint: string;
}

// The tiers reuse the existing themed reward sets (economy.CLUB_SETS), so a bag tier IS the themed bag:
//   • rare      → Planet:        'tour' woods (+8 carry) + 'pro' irons/wedges/putter (base + make-window)
//   • epic      → Phoenix Flames:'masters' across the bag (+16 distance carry, themed putter)
//   • legendary → Solar Storm:   'solar' across the bag (+24 distance carry, the steadiest putter)
export const BAG_SETS: readonly BagSet[] = [
  {
    tier: 'rare',
    name: 'Planet Bag & Set',
    blurb: 'A rare Planet-line bag & full club set — every starter club reborn in Planet blue.',
    cost: 500,
    unlockMaxAscension: 3,
    gateLabel: 'A2',
    distanceSet: 'tour',
    scoringSet: 'pro',
    theme: 'planet',
    tint: '#5b8bd0',
  },
  {
    tier: 'epic',
    name: 'Phoenix Flames Bag & Set',
    blurb: 'An epic Phoenix Flames bag & set — longer woods, a steadier putter, wreathed in fire.',
    cost: 2000,
    unlockMaxAscension: 7,
    gateLabel: 'A6',
    distanceSet: 'masters',
    scoringSet: 'masters',
    theme: 'phoenix',
    tint: '#ff7a3c',
  },
  {
    tier: 'legendary',
    name: 'Solar Storm Bag & Set',
    blurb: 'The legendary Solar Storm bag & set — the apex bag, blazing gold across the galaxy.',
    cost: 10000,
    unlockMaxAscension: 12,
    gateLabel: 'A11',
    distanceSet: 'solar',
    scoringSet: 'solar',
    theme: 'solarstorm',
    tint: '#ffd23c',
  },
];

/** Look up a bag set by the tier it grants. */
export function bagSet(tier: BagTier | undefined): BagSet | undefined {
  return BAG_SETS.find((s) => s.tier === tier);
}

/** Loot-order rank of a bag tier (common 0 → legendary 3); undefined ⇒ common. */
export function bagTierRank(tier: BagTier | undefined): number {
  return RARITY_C[tier ?? 'common'].order;
}

/** Has the player unlocked this bag set (cleared its Ascension gate)? */
export function bagSetUnlocked(set: BagSet, maxAscension: number): boolean {
  return maxAscension >= set.unlockMaxAscension;
}

/** Can the player buy this bag set right now — unlocked, strictly higher than the current tier, and
 *  affordable? (Tiers don't have to be bought in order: a richer player may jump straight to a higher
 *  unlocked tier.) */
export function canBuyBagSet(set: BagSet, current: BagTier, maxAscension: number, shards: number): boolean {
  return (
    bagSetUnlocked(set, maxAscension) &&
    bagTierRank(set.tier) > bagTierRank(current) &&
    shards >= set.cost
  );
}

/** The bag set newly unlocked by CLEARING a given Ascension level (for the victory-page notice) — the
 *  set whose gate sits exactly at this level. Undefined for a level that unlocks no bag tier. */
export function bagUnlockForClearedAscension(ascension: number): BagSet | undefined {
  return BAG_SETS.find((s) => s.unlockMaxAscension === ascension + 1);
}

/**
 * Re-stamp the default bag to a tier (GS-bag-tiers). Each club is REBUILT from its base type via the
 * reward-club machinery: distance clubs take the distance set (carry bonus folded in, including the
 * golfer's `distanceClubBonus`), scoring clubs + the putter take the scoring set (base carry; the putter
 * also folds in the set's make-window `puttBoost`). Pure. The 'common' (no-bag) tier is a NO-OP, so a
 * feature-off loadout is byte-for-byte unchanged — and only the default bag is ever passed here (run
 * start), so bought reward clubs layer on top afterwards (loadoutFromPerks).
 */
export function applyBagTier(loadout: PlayerLoadout, tier: BagTier = DEFAULT_BAG_TIER): PlayerLoadout {
  const set = bagSet(tier);
  if (!set) return loadout; // common / unknown → unchanged
  const distanceCS = clubSetById(set.distanceSet);
  const scoringCS = clubSetById(set.scoringSet);
  if (!distanceCS || !scoringCS) return loadout; // defensive — the sets are content rows
  const bonus = loadout.distanceClubBonus ?? 0;
  let puttBoost = loadout.puttBoost ?? 0;
  const bag = loadout.bag.map((c) => {
    const cs = isDistanceType(c.id) ? distanceCS : scoringCS;
    if (c.id === 'putter' && cs.puttBoost) puttBoost += cs.puttBoost;
    return buildRewardClub(cs, c.id, bonus);
  });
  return { ...loadout, bag, puttBoost, bagTier: tier };
}
