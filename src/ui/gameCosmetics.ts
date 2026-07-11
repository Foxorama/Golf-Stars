/**
 * Per-character COSMETIC resolvers (extracted from game.ts, GS-refactor-split).
 *
 * Given a slice of the persisted UI state + a character id, each function returns the ship / hat /
 * shirt / pants / bag / driver / bag-tier that golfer actually plays with — the Clubhouse pick when
 * it's still owned/unlocked, else the safe default. Pure lookups over structural param types (they
 * never touch the full `UiState`), so this is a leaf both the reducer and the app render layer import
 * without a cycle. game.ts re-exports every function, so existing importers are unchanged. A pure move.
 */

import { bagTierRank, type BagTier } from '../sim/rpg/bag';
import { DEFAULT_SHIP_ID } from '../sim/rpg/ships';

/** The ship a character flies (GS-clubhouse) — its Clubhouse pick if owned, else the default wagon. */
export function shipForCharacter(
  s: { shipByCharacter: Record<string, string>; ownedShips: string[] },
  characterId: string | undefined,
): string {
  const pick = characterId ? s.shipByCharacter[characterId] : undefined;
  return pick && s.ownedShips.includes(pick) ? pick : DEFAULT_SHIP_ID;
}

/** The hat a character wears (GS-clubhouse) — its Clubhouse pick if owned, else undefined (default look). */
export function hatForCharacter(
  s: { hatByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.hatByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The shirt a character wears (GS-clubhouse) — its Clubhouse pick if owned, else undefined. */
export function shirtForCharacter(
  s: { shirtByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.shirtByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The pants a character wears (GS-pants-outfit) — its Clubhouse pick if owned, else undefined. */
export function pantsForCharacter(
  s: { pantsByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.pantsByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The cosmetic golf bag a character carries (GS-unending) — its Clubhouse pick if owned, else none. */
export function golfBagForCharacter(
  s: { golfBagByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.golfBagByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The cosmetic driver a character swings (GS-thor) — its Clubhouse pick if owned, else none. */
export function driverForCharacter(
  s: { driverByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.driverByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The starting bag tier a character plays (GS-wardrobe-bagtier) — its Clubhouse wardrobe pick CLAMPED to
 *  the owned tier (never a free upgrade above what's unlocked), else the owned tier itself. This is the
 *  Unending-Universe difficulty axis, now per-golfer. */
export function bagTierForCharacter(
  s: { bagTierByCharacter: Record<string, BagTier>; bagTier: BagTier },
  characterId: string | undefined,
): BagTier {
  const pick = characterId ? s.bagTierByCharacter[characterId] : undefined;
  return pick && bagTierRank(pick) <= bagTierRank(s.bagTier) ? pick : s.bagTier;
}
