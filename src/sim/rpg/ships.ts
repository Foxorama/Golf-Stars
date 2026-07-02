/**
 * Spaceships — the cosmetic fleet you fly on the journey map (GS-garage).
 *
 * Star Shards no longer buy permanent stat upgrades (those effects live in the in-run Pro Shop now);
 * instead they're spent at the **Trade Market** on SHIPS — purely cosmetic vessels drawn as the "YOU"
 * craft on the starmap. A ship is content-as-data: an id, a SET it belongs to, a rarity (= price tier),
 * and a render `look` the vector drawer (`render/shipArt.ts`) keys off. New ship = new row.
 *
 * The Trade Market shows the FULL catalogue (GS-clubhouse) — every ship is browsable and buyable the
 * moment you can afford it; scarcity lives in the Shard PRICE (the mythic Mothership is the 1,000-shard
 * grail), not in a rotating offer. Everyone starts owning the classic station wagon (`DEFAULT_SHIP_ID`),
 * free. Ownership is global; which ship each character FLIES is chosen per golfer in the Clubhouse.
 *
 * NOTHING here touches the sim — ships are cosmetic, so there are no balance/fairness implications and
 * the catalogue never affects a run.
 */

import { COSMETIC_RARITY, type CosmeticRarity } from './cosmetics';

/** The vector look the ship drawer renders (a base shape family + palette + bling). */
export interface ShipLook {
  /** Base silhouette the drawer builds. `ufo` is the mythic flying saucer (animated); `infinity` is
   *  the hole-150 Unending-Universe grail (GS-unending) — the most animated craft in the fleet. */
  kind: 'wagon' | 'racer' | 'saucer' | 'comet' | 'shuttle' | 'ufo' | 'moto' | 'chopper' | 'infinity';
  /** Body fill. */
  body: string;
  /** Canopy / glass. */
  glass: string;
  /** Exhaust flame core. */
  flame: string;
  /** Accent trim (roof rack, fins, chrome). */
  accent: string;
  /** Bling level 0..3 — extra decals/sparkle for the blinged-out tiers. */
  bling?: number;
  /** Pennant text flown on a flagpole (the mythic UFO's "Hole 19" flag). */
  flag?: string;
}

export interface Ship {
  id: string;
  name: string;
  /** The cosmetic SET this belongs to (a family of related craft). */
  set: string;
  /** Price tier — also gates the rarity ring + shard cost (up to the top `mythic`). */
  rarity: CosmeticRarity;
  /** One-line flavour for the market card. */
  blurb: string;
  /** Shard price (0 = free / starter). */
  cost: number;
  /** Earned, never bought (GS-unending): unlocked by surviving this many holes of the Unending
   *  Universe. A `secret` unlock is hidden from the market entirely until it's owned. */
  unlockHoles?: number;
  secret?: boolean;
  look: ShipLook;
}

/** The classic woody station wagon — owned by everyone from the off, free. */
export const DEFAULT_SHIP_ID = 'wagon-classic';

/** Shard prices per rarity tier (the Trade Market economy). Mythic is the 1,000-shard grail. */
const TIER_COST: Record<CosmeticRarity, number> = {
  common: 0,
  rare: 60,
  epic: 140,
  legendary: 300,
  mythic: 1000,
};

export const SHIPS: readonly Ship[] = [
  // --- The WAGON line: tiers of blinged-out station wagon (the heritage fleet) ---
  {
    id: DEFAULT_SHIP_ID,
    name: 'Woody Wagon',
    set: 'Wagon',
    rarity: 'common',
    blurb: 'The trusty woody station wagon. Where every voyage began.',
    cost: TIER_COST.common,
    look: { kind: 'wagon', body: '#8a5a2b', glass: '#bfe3f2', flame: '#ff8a3c', accent: '#5a3a1c' },
  },
  {
    id: 'wagon-chrome',
    name: 'Chrome Cruiser',
    set: 'Wagon',
    rarity: 'rare',
    blurb: 'Buffed to a mirror shine. Blinds the asteroids.',
    cost: TIER_COST.rare,
    look: { kind: 'wagon', body: '#aeb6c2', glass: '#d6f0ff', flame: '#7fd6ff', accent: '#e8eef6', bling: 1 },
  },
  {
    id: 'wagon-gold',
    name: 'Gilded Estate',
    set: 'Wagon',
    rarity: 'epic',
    blurb: 'Solid-gold trim, fuzzy dice, the works. Pure swagger.',
    cost: TIER_COST.epic,
    look: { kind: 'wagon', body: '#d9a930', glass: '#fff0c0', flame: '#ffd36b', accent: '#fff3b0', bling: 2 },
  },
  {
    id: 'wagon-cosmic',
    name: 'Cosmic Voyager',
    set: 'Wagon',
    rarity: 'legendary',
    blurb: 'A wagon woven from starlight. The ultimate ride.',
    cost: TIER_COST.legendary,
    look: { kind: 'wagon', body: '#5b3b8a', glass: '#cdb8ff', flame: '#c585ff', accent: '#ffd86b', bling: 3 },
  },
  // --- The RACER set: sleek speedsters ---
  {
    id: 'racer-redline',
    name: 'Redline Roadster',
    set: 'Racer',
    rarity: 'rare',
    blurb: 'Low, fast, and unapologetically loud.',
    cost: TIER_COST.rare,
    look: { kind: 'racer', body: '#d23b32', glass: '#ffe1c0', flame: '#ffb04a', accent: '#2a1010' },
  },
  {
    id: 'racer-nebula',
    name: 'Nebula Streak',
    set: 'Racer',
    rarity: 'epic',
    blurb: 'Trails stardust like a comet with somewhere to be.',
    cost: TIER_COST.epic,
    look: { kind: 'racer', body: '#2f7fd0', glass: '#bfe9ff', flame: '#7fd0ff', accent: '#9ad0ff', bling: 1 },
  },
  // --- The HAULER set: big rugged barges ---
  {
    id: 'hauler-barge',
    name: 'Star Barge',
    set: 'Hauler',
    rarity: 'rare',
    blurb: 'Built to lug a full bag across three arcs and back.',
    cost: TIER_COST.rare,
    look: { kind: 'shuttle', body: '#6b8f5a', glass: '#d6f0c0', flame: '#ffb04a', accent: '#39502c' },
  },
  // --- The EXOTIC set: anything goes ---
  {
    id: 'ufo-saucer',
    name: 'Little Green Caddie',
    set: 'Exotic',
    rarity: 'epic',
    blurb: 'A flying saucer with a 7-iron. They come in peace.',
    cost: TIER_COST.epic,
    look: { kind: 'saucer', body: '#54dba0', glass: '#d8fff0', flame: '#9affd6', accent: '#1c5a3c', bling: 1 },
  },
  {
    id: 'comet-rider',
    name: 'Comet Rider',
    set: 'Exotic',
    rarity: 'legendary',
    blurb: 'A dimpled golf-ball comet blazing across the void.',
    cost: TIER_COST.legendary,
    look: { kind: 'comet', body: '#f4f6ff', glass: '#ffffff', flame: '#9ad8ff', accent: '#ffd36b', bling: 3 },
  },
  // --- The SPEEDER set: single-rider space-bikes (motorcycle golf buggies) ---
  {
    id: 'moto-nitro',
    name: 'Nitro Niblick',
    set: 'Speeder',
    rarity: 'legendary',
    blurb: 'A motorcycle golf buggy — two glowing hover-wheels, a bag on the tail, a jet trail. All attitude.',
    cost: TIER_COST.legendary,
    look: { kind: 'moto', body: '#2a2f3a', glass: '#bfe9ff', flame: '#ff3ea5', accent: '#28e0d0', bling: 2 },
  },
  // --- The MYTHIC grail: the rarest, flashiest ride in the galaxy ---
  {
    id: 'ufo-mothership',
    name: 'The Mothership',
    set: 'Mythic',
    rarity: 'mythic',
    blurb: 'A genuine flying saucer — spinning gear, flashing lights, and a "Hole 19" flag flying proud.',
    cost: TIER_COST.mythic,
    look: { kind: 'ufo', body: '#9fb4c8', glass: '#9affe0', flame: '#7fffd0', accent: '#ffd36b', bling: 3, flag: 'Hole 19' },
  },
  {
    id: 'chopper-thunderbolt',
    name: 'The Thunderbolt',
    set: 'Mythic',
    rarity: 'mythic',
    blurb: 'A hot-rod space chopper — fat wheels, a bag stood between the bars, wreathed in flame and forked lightning.',
    cost: 1250, // the top of the fleet — a hand-built showpiece above the Mothership grail
    look: { kind: 'chopper', body: '#16181f', glass: '#cfe9ff', flame: '#ff7a1a', accent: '#7fe049', bling: 3 },
  },
  // --- The SECRET grail (GS-unending): earned at hole 150 of the Unending Universe, never sold.
  // Kept LAST so the ships tests' first-mythic assertions (the Mothership) are undisturbed.
  {
    id: 'infinity-ace',
    name: 'The Infinity Ace',
    set: 'Mythic',
    rarity: 'mythic',
    blurb:
      'Forged at the edge of the unending universe — a golden phoenix-winged star-yacht wreathed in living aurora, flying the ∞ pennant. There is no better ride. There cannot be.',
    cost: 0, // priceless — earned by surviving 150 holes of the Unending Universe (GS-unending)
    unlockHoles: 150,
    secret: true,
    look: { kind: 'infinity', body: '#f2c94c', glass: '#eafff6', flame: '#7fffd4', accent: '#4fe08a', bling: 3, flag: '∞' },
  },
];

const SHIP_BY_ID: Record<string, Ship> = Object.fromEntries(SHIPS.map((s) => [s.id, s]));

export function shipById(id: string | undefined): Ship | undefined {
  return id ? SHIP_BY_ID[id] : undefined;
}

/** The full ship catalogue for the Trade Market, ordered by ascending rarity then catalogue order —
 *  the common starter wagon first, the mythic grail last. (Mirrors `apparelForSlot` for apparel.) */
export function shipCatalogue(): Ship[] {
  return [...SHIPS].sort((a, b) => COSMETIC_RARITY[a.rarity].order - COSMETIC_RARITY[b.rarity].order);
}

/** Can this ship be bought? (Affordable, not already owned, has a price, and actually FOR SALE —
 *  an Unending-Universe unlock (GS-unending) is earned, never bought.) */
export function canBuyShip(ship: Ship | undefined, shards: number, owned: readonly string[]): boolean {
  return !!ship && !ship.unlockHoles && ship.cost > 0 && shards >= ship.cost && !owned.includes(ship.id);
}
