/**
 * Spaceships — the cosmetic fleet you fly on the journey map (GS-garage).
 *
 * Star Shards no longer buy permanent stat upgrades (those effects live in the in-run Pro Shop now);
 * instead they're spent at the **Trade Market** on SHIPS — purely cosmetic vessels drawn as the "YOU"
 * craft on the starmap. A ship is content-as-data: an id, a SET it belongs to, a rarity (= price tier),
 * and a render `look` the vector drawer (`render/shipArt.ts`) keys off. New ship = new row.
 *
 * The market shows a small rotating OFFER drawn from the ships you don't yet own; it RESETS each
 * completed run (a persisted `marketSeed` bumps on every run end) and can be REROLLED for an
 * escalating Shard cost. Everyone starts owning the classic station wagon (`DEFAULT_SHIP_ID`), free.
 *
 * Pure + deterministic (seeded sampling, no Math.random) so the offer is stable within a visit and
 * reproducible. NOTHING here touches the sim — ships are cosmetic, so there are no balance/fairness
 * implications and the offer never affects a run.
 */

import { Rng } from '../rng';
import { COSMETIC_RARITY, type CosmeticRarity } from './cosmetics';

/** The vector look the ship drawer renders (a base shape family + palette + bling). */
export interface ShipLook {
  /** Base silhouette the drawer builds. `ufo` is the mythic flying saucer (animated). */
  kind: 'wagon' | 'racer' | 'saucer' | 'comet' | 'shuttle' | 'ufo';
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
];

const SHIP_BY_ID: Record<string, Ship> = Object.fromEntries(SHIPS.map((s) => [s.id, s]));

export function shipById(id: string | undefined): Ship | undefined {
  return id ? SHIP_BY_ID[id] : undefined;
}

/** The size of the Trade Market's rotating offer (cards shown at once). */
export const MARKET_OFFER_SIZE = 3;
/** Base + growth for the (deliberately expensive) market reroll. */
export const MARKET_REROLL_BASE = 45;
export const MARKET_REROLL_GROWTH = 2;

/** The shard cost of the NEXT market reroll (GS-garage) — steep, ramps per reroll this visit. */
export function marketRerollCost(rerolls: number): number {
  return Math.round(MARKET_REROLL_BASE * Math.pow(MARKET_REROLL_GROWTH, Math.max(0, rerolls)));
}

/**
 * The Trade Market's current offer — a seeded sample of ships you DON'T yet own, of size up to
 * `MARKET_OFFER_SIZE`. Deterministic from `(marketSeed, rerolls)` so it's stable within a visit and
 * "resets" when `marketSeed` bumps on a completed run. Returns fewer (or none) as the fleet fills up.
 *
 * The sample is RARITY-WEIGHTED (a rarer ship draws less often, mythic least of all), so the mythic
 * Mothership is genuinely scarce to encounter — "rarer than the others" — without ever being unobtainable.
 */
export function marketOffer(marketSeed: number, owned: readonly string[], rerolls = 0): Ship[] {
  const ownedSet = new Set(owned);
  const pool = SHIPS.filter((s) => !ownedSet.has(s.id) && s.cost > 0);
  if (pool.length <= MARKET_OFFER_SIZE) return [...pool];
  const rng = new Rng(`ships:market:${marketSeed}:${rerolls}`);
  const remaining = [...pool];
  const picked: Ship[] = [];
  for (let i = 0; i < MARKET_OFFER_SIZE && remaining.length; i++) {
    const total = remaining.reduce((sum, s) => sum + COSMETIC_RARITY[s.rarity].weight, 0);
    let t = rng.float() * total;
    let idx = remaining.length - 1;
    for (let j = 0; j < remaining.length; j++) {
      t -= COSMETIC_RARITY[remaining[j]!.rarity].weight;
      if (t <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(remaining.splice(idx, 1)[0]!);
  }
  return picked;
}

/** Can this ship be bought? (Affordable, not already owned, and has a price.) */
export function canBuyShip(ship: Ship | undefined, shards: number, owned: readonly string[]): boolean {
  return !!ship && ship.cost > 0 && shards >= ship.cost && !owned.includes(ship.id);
}
