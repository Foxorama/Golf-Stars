/**
 * Ascension victory reward (GS-ascension-clubs) — winning a voyage permanently grows the CHARACTER
 * you played with: a new random club they didn't already carry is added to that golfer's starting bag,
 * forever. It celebrates the win and gives each character its own long-tail collection loop (win again
 * → fill out their bag). Character-specific: a win with Feather Fade only ever grows Feather's bag.
 *
 * The new club is granted at the STARTING-BAG rarity (the owned default-bag tier): a common bag earns a
 * common club, a rare/epic/legendary bag earns one of that grade. Mechanically the unlock stores only the
 * club TYPE per character; at run start it's added to the bag as a plain starter club and `applyBagTier`
 * re-stamps it to the current tier with the rest of the bag — so the unlocked club always matches the
 * live bag rarity (and upgrades for free if you later buy a higher bag tier).
 *
 * Once a character carries EVERY taxonomy club (their bag is full), there's nothing left to unlock, so
 * the win pays a Star-Shard consolation instead, scaled to the bag rarity (the value of "a club at that
 * tier"): 15 common · 25 rare · 45 epic · 70 legendary.
 *
 * Pure & data-driven, like everything in the sim. The pick is seeded off the run so it's deterministic;
 * an empty unlock list is byte-for-byte the old loadout (the determinism contract).
 */

import { CLUBS, clubById } from '../clubs';
import type { Rarity } from '../course/contract';
import { Rng } from '../rng';
import { applyCharacter } from './characters';
import {
  buildRewardClub,
  clubSetById,
  equipClub,
  isHybridType,
  startingLoadout,
  type PlayerLoadout,
} from './economy';
import type { BagTier } from './bag';

/** The putter is universal (every bag carries one) and is never an unlock. */
const PUTTER_ID = 'putter';

/** Star-Shard consolation when a character's bag is already full, by starting-bag rarity — worth
 *  "a club at that tier" (mirrors the relative cost of the reward sets). */
export const FULL_BAG_SHARD_BONUS: Record<Rarity, number> = {
  common: 15,
  rare: 25,
  epic: 45,
  legendary: 70,
};

/**
 * The outcome of an ascension victory: a newly-unlocked club for the character, or — if their bag is
 * already complete — a Star-Shard consolation. Surfaced on the victory screen and folded into the save.
 */
export type ClubUnlockReward =
  | { kind: 'club'; clubType: string; clubName: string; rarity: Rarity }
  | { kind: 'shards'; shards: number };

/**
 * The club TYPES a character could still unlock: every taxonomy club they don't already carry — their
 * signature starting bag PLUS any clubs already unlocked — minus the universal putter and any type the
 * golfer refuses (Longshot Larry never takes a hybrid). Pure. A character with no/unknown id resolves to
 * the full default bag (every club), so nothing is unlockable.
 */
export function unlockableClubTypes(
  characterId: string | undefined,
  alreadyUnlocked: readonly string[] = [],
): string[] {
  const lo = applyCharacter(characterId, startingLoadout());
  const have = new Set<string>([...lo.bag.map((c) => c.id), ...alreadyUnlocked]);
  return CLUBS.map((c) => c.id).filter(
    (id) => id !== PUTTER_ID && !have.has(id) && !(lo.noHybrids && isHybridType(id)),
  );
}

/**
 * Roll the ascension victory reward for a won voyage. Deterministic from the run seed (+ how many the
 * character already owns, so repeated wins on the same seed still progress through distinct clubs). The
 * club is granted at the starting-bag rarity (`bagTier`); a full bag pays the Shard consolation instead.
 */
export function ascensionClubReward(
  characterId: string | undefined,
  bagTier: BagTier,
  alreadyUnlocked: readonly string[],
  seed: number | string,
): ClubUnlockReward {
  const rarity: Rarity = bagTier ?? 'common';
  const pool = unlockableClubTypes(characterId, alreadyUnlocked);
  if (pool.length === 0) return { kind: 'shards', shards: FULL_BAG_SHARD_BONUS[rarity] };
  const rng = new Rng(`${seed}:ascension-club:${alreadyUnlocked.length}`);
  const clubType = pool[rng.int(0, pool.length - 1)]!;
  return { kind: 'club', clubType, clubName: clubById(clubType, CLUBS)!.name, rarity };
}

/**
 * Add a character's permanently-unlocked clubs to a freshly-built starting loadout, BEFORE the bag tier
 * re-stamps it (`startingLoadoutFor`). Each unlocked type is equipped as a plain common 'starter' club
 * with the loadout's distance bonus folded in (so Larry's woods stay long); `applyBagTier` then restamps
 * it to the current tier exactly like the rest of the bag. Skips unknowns + types already carried. An
 * empty list returns the loadout unchanged — byte-for-byte (the determinism contract).
 */
export function addUnlockedClubs(loadout: PlayerLoadout, unlocked: readonly string[] = []): PlayerLoadout {
  if (!unlocked || unlocked.length === 0) return loadout;
  const starter = clubSetById('starter')!;
  let bag = loadout.bag;
  for (const type of unlocked) {
    if (!clubById(type, CLUBS)) continue; // defensive: skip a retired/unknown club id
    if (bag.some((c) => c.id === type)) continue; // already carried → no duplicate
    bag = equipClub(bag, buildRewardClub(starter, type, loadout.distanceClubBonus ?? 0));
  }
  return { ...loadout, bag };
}
