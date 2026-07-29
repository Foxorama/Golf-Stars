/**
 * Champion cosmetics — what FINISHING a Story-Tour campaign hangs in your wardrobe (GS-story-champion-cosmetics).
 *
 * The campaign already pays out along the way, but every one of those rewards lands INSIDE `fc_story` (see
 * `storyRewards.ts`): a route ship you fly on the campaign's own star chart, gear you swing in the campaign's
 * own rounds. Start a second campaign and none of it exists. So the only thing a finished campaign left
 * behind on the MAIN save was a boolean — `starTourUnlocked`.
 *
 * These are the trophy. Beat the World-Eater and the path you beat it ON hangs a permanent, GLOBAL set in
 * the Trade Market wardrobe + garage: **the ship you flew that road, and the colours you wore walking it.**
 * Wearable in Voyage, in the Unending Universe, on the Star Tour — everywhere, forever, on every golfer,
 * long after that campaign's slot has been overwritten.
 *
 * THREE RULES, and the reason this is a table and not four `if`s scattered across the reducer:
 *
 *  1. **The ALIGNMENT you finished on is the whole key.** A Warden win hangs Warden white-and-gold; a Herald
 *     win hangs the Coil's violet and venom. You cannot hold both from one campaign — that is the point of
 *     The Choice, and it is what makes a second campaign down the other road worth flying. (One golfer, one
 *     slot, one campaign — GS-story-campaign-slots — so the OTHER set costs you a whole second run.)
 *  2. **The ship is the one you already earned on that road** (`warden-cruiser` / `wyrm-ship`), not a new
 *     hull. It is already a `secret`, `cost: 0` row in `ships.ts`, hidden from the market until owned, and
 *     the campaign already grants it to the campaign's OWN garage at the Chapter-4 major. Granting the same
 *     id globally is the honest reading of "you keep it": the hull you flew to the root is now yours to fly
 *     anywhere. A second, near-identical grail hull would be a strictly worse story.
 *  3. **The grant is IDEMPOTENT and PURELY ADDITIVE.** It appends ids to the global `ownedShips` /
 *     `ownedApparel` pools and returns the SAME ARRAY REFERENCE when there is nothing to add, so a caller
 *     can cheaply detect "no change" (the `aceShipUnlock` / `resolveAsgard` idiom). Nothing is ever taken
 *     away — re-finishing, or finishing the other path later, only ever adds.
 *
 * NO SAVE BUMP: these are catalogue ids dropped into pools that already exist, and `schema.ts sanitize()`
 * already drops ids it cannot resolve. Purely cosmetic — nothing here touches the sim, so there are no
 * balance or fairness implications.
 */

import type { StoryAlignment } from './story';

/** The permanent, global set a finished campaign hangs in the wardrobe, keyed by the path you finished on. */
export interface ChampionCosmetics {
  /** The garage hull (an existing `secret` row in `ships.ts` — the route ship you flew that road). */
  shipId: string;
  /** The apparel ids — a full three-piece outfit (hat + shirt + pants). */
  apparelIds: readonly string[];
  /** The apparel SET name, so a surface can name the outfit without re-deriving it from the rows. */
  setName: string;
  /** How the unlock card announces the path (the title on the finale's reward panel). */
  title: string;
}

/** The ONE description of what each ending unlocks. A new path = a new row, never a reducer edit. */
export const CHAMPION_COSMETICS: Record<StoryAlignment, ChampionCosmetics> = {
  warden: {
    shipId: 'warden-cruiser',
    apparelIds: ['warden-halo', 'warden-mantle', 'warden-raiment'],
    setName: 'Warden Vigil',
    title: 'Warden of the Realms',
  },
  herald: {
    shipId: 'wyrm-ship',
    apparelIds: ['coil-hood', 'coil-shroud', 'coil-scales'],
    setName: 'Coil Shroud',
    title: 'Herald of the Coil',
  },
};

/** The set a finished campaign earns — `undefined` for a campaign that never reached The Choice (which
 *  cannot finish anyway: the finale is gated on five Sigils, and The Choice comes at the end of Ch.3). */
export function championCosmeticsFor(alignment: StoryAlignment | undefined): ChampionCosmetics | undefined {
  return alignment ? CHAMPION_COSMETICS[alignment] : undefined;
}

/** Every id this feature can ever grant — the guard's handle on "the catalogue covers the table". */
export function allChampionCosmeticIds(): { ships: string[]; apparel: string[] } {
  const rows = Object.values(CHAMPION_COSMETICS);
  return {
    ships: rows.map((r) => r.shipId),
    apparel: rows.flatMap((r) => [...r.apparelIds]),
  };
}

/** What a grant actually CHANGED — so a caller can announce only the genuinely new pieces (finishing the
 *  same path twice is not a reveal), and skip the celebration entirely when `unlocked` is empty. */
export interface ChampionGrant {
  ownedShips: string[];
  ownedApparel: string[];
  /** The set, when the alignment resolves to one — present even if everything in it was already owned. */
  cosmetics?: ChampionCosmetics;
  /** The ids that were NOT already owned (ship first, then apparel in catalogue order). Empty = nothing new. */
  unlocked: string[];
}

/**
 * Hang the finished path's set in the global wardrobe. Idempotent and additive: an id already owned is left
 * alone, and when NOTHING is new both arrays come back by reference so the caller can no-op.
 */
export function grantChampionCosmetics(
  ownedShips: readonly string[],
  ownedApparel: readonly string[],
  alignment: StoryAlignment | undefined,
): ChampionGrant {
  const cosmetics = championCosmeticsFor(alignment);
  if (!cosmetics) {
    return { ownedShips: ownedShips as string[], ownedApparel: ownedApparel as string[], unlocked: [] };
  }
  const unlocked: string[] = [];
  const ships = ownedShips.includes(cosmetics.shipId)
    ? (ownedShips as string[])
    : (unlocked.push(cosmetics.shipId), [...ownedShips, cosmetics.shipId]);
  const freshApparel = cosmetics.apparelIds.filter((id) => !ownedApparel.includes(id));
  unlocked.push(...freshApparel);
  const apparel = freshApparel.length ? [...ownedApparel, ...freshApparel] : (ownedApparel as string[]);
  return { ownedShips: ships, ownedApparel: apparel, cosmetics, unlocked };
}
