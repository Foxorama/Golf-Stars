/**
 * Starting-loadout builders + the Ascension ladder constants (extracted from run.ts, GS-refactor-split).
 *
 * The one source of truth for how `startRun`/`resumeRun`/`startAsgardRun` (and the Sim Lab)
 * reconstruct a run's base loadout, plus the flat per-tier Ascension cut/purse maths. Pure functions;
 * the only run dependency is the `Run` TYPE (erased at compile, so no runtime import cycle). run.ts
 * re-exports every public symbol here, so existing importers are unchanged. Behaviour is byte-for-byte
 * identical to when this lived inside run.ts — a pure move.
 */

import { addUnlockedClubs } from './club-unlock';
import { applyMeta, type MetaUpgrades } from './meta';
import { applyBagTier, DEFAULT_BAG_TIER, type BagTier } from './bag';
import { applyCharacter } from './characters';
import { startingLoadout, type PlayerLoadout } from './economy';
import type { Run } from './run';

/**
 * The starting loadout for a run: the chosen golfer's signature bag/shape (GS-18, GS-clubs) FIRST,
 * then the permanent meta-upgrades baked ON TOP — so Tour Bag (+yds) lands on the character's own
 * sparse starting bag rather than a discarded default one, and the meta order is identical on resume.
 * One source of truth for `startRun` + `resumeRun` (and the Sim Lab) so they reconstruct it the same.
 */
export function startingLoadoutFor(
  meta: MetaUpgrades,
  characterId?: string,
  bagTier: BagTier = DEFAULT_BAG_TIER,
  unlockedClubs: readonly string[] = [],
): PlayerLoadout {
  // The character's ascension-victory club unlocks (GS-ascension-clubs) are added AFTER meta (so they
  // inherit the final distanceClubBonus) but BEFORE the bag tier, so they re-stamp to the live rarity
  // with the rest of the bag. The bag tier re-stamps LAST, reading the final distanceClubBonus (character
  // + meta Tour Bag) when rebuilding the distance clubs — and a 'common' tier is a no-op (byte-for-byte).
  const base = addUnlockedClubs(applyMeta(meta, applyCharacter(characterId, startingLoadout())), unlockedClubs);
  return applyBagTier(base, bagTier);
}

/**
 * The base loadout a run's shop perks sit ON (GS-caddy-factions) — the golfer + meta + bag-tier +
 * ascension-unlock stack, rebuilt the SAME way `startRun`/`resumeRun` build it. Used to reconstruct
 * the loadout MINUS a perk (e.g. when a caddy is fired) by replaying the remaining perks over it.
 */
export function baseLoadoutForRun(run: Run): PlayerLoadout {
  return startingLoadoutFor(
    run.meta,
    run.loadout.characterId,
    run.bagTier ?? DEFAULT_BAG_TIER,
    run.unlockedClubs ?? [],
  );
}

/** Ascension ladder (GS-ascension): a fixed-length campaign gets harder above the base difficulty,
 *  unlocked one tier at a time by winning. Each level adds a flat per-stop cut and thins the purse.
 *  Raised to 15 (GS-bag-tiers) so the deepest bag unlock (clear A11 → legendary bag) is reachable. */
export const ASCENSION_MAX = 15;
export function ascensionCutBonus(level: number): number {
  return Math.max(0, Math.round(level));
}
export function ascensionCreditPenalty(level: number): number {
  return Math.max(0, Math.round(level)) * 8;
}
