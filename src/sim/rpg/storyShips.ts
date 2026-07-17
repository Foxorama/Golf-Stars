/**
 * Story-Tour SHIPS (GS-story-ships) — the fleet you fly the campaign in. Ships are cosmetic in the base
 * game; here each is a real choice, acquired a DIFFERENT WAY and carrying a light, honest STORY effect (a
 * credit-earning bonus per world clear — a bigger hold banks more). Bought at the spaceport SHIPYARD with
 * credits, or earned. Ship WEAPONS / engines / battle upgrades (for the finale space battle) are a LATER
 * reward/Pro-Shop layer on this same seam — this chunk is the ships themselves.
 *
 * A "scattering of different approaches" (the design ask): the fleet mixes acquisition kinds —
 *   • `buy`       — for sale at the shipyard the moment you can afford it,
 *   • `milestone` — REVEALED after clearing N worlds, then for sale (an earned-then-bought ride),
 *   • `ace`       — GRANTED free by a hole-in-one on any Story round (the Comet Rider),
 *   • `secret`    — a late grail, revealed only deep in the campaign, then for sale.
 * — and a credit-bonus gradient (cheap flair 1.0 → the hauler's 1.25), so a ship is a genuine trade-off,
 * not one strict ladder.
 *
 * PURE + DOM-free. Rows reference the shared `ships.ts` catalogue (look/name/rarity/art) — a story ship is
 * a THIN row over an existing hull, never new ship art. Item-authoring rule (GS-story-lore-cards): every
 * row carries its own art (via the hull), a mechanical DETAIL, and bespoke LORE.
 */

import { shipById, ACE_SHIP_ID, type Ship } from './ships';
import { addCredits, type StoryState } from './story';

/** How a story ship is obtained. */
export type ShipAcquire = 'buy' | 'milestone' | 'ace' | 'secret';

/** A story-fleet row over a shared `ships.ts` hull. */
export interface StoryShip {
  /** The `ships.ts` id this row flies. */
  shipId: string;
  acquire: ShipAcquire;
  /** Credit price at the shipyard (buy / milestone / secret). An `ace` ship is free (0). */
  price: number;
  /** For `milestone`/`secret`: revealed once this many worlds are cleared (excludes the Earth prologue). */
  unlockAfterClears?: number;
  /** The STORY effect: credits earned per world clear are multiplied by this (default 1 = no bonus). */
  creditMult: number;
  /** Bespoke lore paragraph(s) for the ship's lore card. */
  lore: string[];
}

// The story fleet. A deliberate scattering of acquisition approaches + a credit-bonus gradient. The
// starter Woody Wagon is owned free from the off (not listed for sale). Hulls are reused from ships.ts.
export const STORY_SHIPS: readonly StoryShip[] = [
  {
    shipId: 'wagon-chrome',
    acquire: 'buy',
    price: 240,
    creditMult: 1.06,
    lore: [
      'The same trusty wagon you left Earth in, stripped and re-clad in mirror chrome by a dockyard on ' +
        'the first green world. It is not faster and it is not tougher — it just looks like you mean it, ' +
        'and a golfer who looks the part gets waved to the front of the queue at every clubhouse in the arc.',
    ],
  },
  {
    shipId: 'racer-redline',
    acquire: 'buy',
    price: 340,
    creditMult: 1.1,
    lore: [
      'Low, loud, and unapologetic — a proper roadster. It carries barely a bag and a spare glove, but it ' +
        'turns up to a tournament like a headline act, and the sponsors pay accordingly. Pure flair with a ' +
        'purse to match.',
      'You will not out-haul the barge in it. You will out-arrive everyone.',
    ],
  },
  {
    shipId: 'hauler-barge',
    acquire: 'buy',
    price: 480,
    creditMult: 1.25,
    lore: [
      'A rugged star-barge with a hold you could park a wagon inside. It lumbers between worlds without ' +
        'complaint and comes home riding low on winnings, salvage, and sponsor crates — the single best ' +
        'ship in the fleet for turning a round into a bankroll.',
      'The earner. Not pretty. Very, very useful.',
    ],
  },
  {
    shipId: 'ufo-saucer',
    acquire: 'milestone',
    price: 520,
    unlockAfterClears: 4,
    creditMult: 1.15,
    lore: [
      'They come in peace, and they come with a 7-iron. After you have made a name across four worlds, the ' +
        'Little Green Caddies decide you are worth trading with and let you fly one of their saucers — a ' +
        'hovering disc that never once spills your coffee, however hard you bank it.',
      'Earned by reputation, then bought. The galaxy has to know you before it sells you a saucer.',
    ],
  },
  {
    shipId: 'moto-nitro',
    acquire: 'buy',
    price: 720,
    creditMult: 1.12,
    lore: [
      'A single-rider space-bike: two glowing hover-wheels, a bag strapped to the tail, a jet of nitro ' +
        'behind. All attitude and no cargo — but it splits a crowd and it never, ever stalls on the grid.',
    ],
  },
  {
    shipId: 'pegasus-valkyrie',
    acquire: 'milestone',
    price: 900,
    unlockAfterClears: 8,
    creditMult: 1.18,
    lore: [
      'A winged war-steed of bronze and gold, mane streaming starlight. Eight worlds conquered is enough to ' +
        'turn a Warden’s head, and one of Asgard’s stables opens to you — the Pegasus flies where engines ' +
        'cannot, and lands anywhere a champion is expected.',
      'Half ship, half legend. It arrives, and the tournament feels a little more like a saga.',
    ],
  },
  {
    shipId: ACE_SHIP_ID, // comet-rider
    acquire: 'ace',
    price: 0,
    creditMult: 1.2,
    lore: [
      'A dimpled golf-ball comet blazing across the void — the ship that only ever comes to a golfer who ' +
        'has holed one in a single, perfect stroke. It cannot be bought at any price. You earn the Comet ' +
        'Rider the only way it will accept: an ace.',
      'The universe keeps score of the impossible shots. Make one, and this is waiting.',
    ],
  },
  {
    shipId: 'ufo-mothership',
    acquire: 'secret',
    price: 1500,
    unlockAfterClears: 12,
    creditMult: 1.25,
    lore: [
      'The genuine article — spinning gear, flashing lights, a "Hole 19" flag flying proud. It does not ' +
        'appear on any shipyard manifest until you have cleared twelve worlds and the galaxy has quietly ' +
        'decided you are one of its own. Then, one night, it is simply parked in your berth, waiting, with ' +
        'a price only a legend could pay.',
      'The grail of the ordinary fleet. Everything after this flies under its own kind of story.',
    ],
  },
];

const STORY_SHIP_BY_ID: Record<string, StoryShip> = Object.fromEntries(STORY_SHIPS.map((s) => [s.shipId, s]));

/** The story-fleet row + its shared hull for a ship id (undefined if it isn't a story ship). */
export function storyShipRow(shipId: string): StoryShip | undefined {
  return STORY_SHIP_BY_ID[shipId];
}
/** Resolve a story ship id to its shared `ships.ts` hull. */
export function storyShipHull(shipId: string): Ship | undefined {
  return shipById(shipId);
}

/** Is this a known story ship id (for the shipyard's inspect gate)? */
export function isStoryShipId(shipId: string): boolean {
  return !!STORY_SHIP_BY_ID[shipId];
}

/** Worlds cleared toward milestone unlocks (the Earth prologue does not count). */
function nonPrologueClears(story: StoryState): number {
  return story.clearedWorldIds.filter((id) => id !== 'standrews-18').length;
}

/** Is this ship REVEALED at the shipyard? `buy` always; `milestone`/`secret` once enough worlds are
 *  cleared; an `ace` ship is never shown for sale (it's earned, granted on a hole-in-one). */
export function storyShipRevealed(story: StoryState, row: StoryShip): boolean {
  if (row.acquire === 'ace') return story.ownedShipIds.includes(row.shipId);
  if (row.acquire === 'milestone' || row.acquire === 'secret') {
    return story.ownedShipIds.includes(row.shipId) || nonPrologueClears(story) >= (row.unlockAfterClears ?? 0);
  }
  return true; // buy
}

export function storyShipOwned(story: StoryState, shipId: string): boolean {
  return story.ownedShipIds.includes(shipId);
}
export function storyShipEquipped(story: StoryState, shipId: string): boolean {
  return story.equippedShipId === shipId;
}

/** Can the player buy this ship now — revealed, for sale (not an ace ship), not owned, affordable? */
export function canBuyStoryShip(story: StoryState, row: StoryShip): boolean {
  return (
    row.acquire !== 'ace' &&
    !storyShipOwned(story, row.shipId) &&
    storyShipRevealed(story, row) &&
    row.price > 0 &&
    story.credits >= row.price
  );
}

/** Buy a ship (pure): deduct credits, own it, and fly it. No-op if it can't be bought. */
export function buyStoryShip(story: StoryState, shipId: string): StoryState {
  const row = storyShipRow(shipId);
  if (!row || !canBuyStoryShip(story, row)) return story;
  let next = addCredits(story, -row.price);
  next = { ...next, ownedShipIds: [...next.ownedShipIds, shipId], equippedShipId: shipId };
  return next;
}

/** Fly an OWNED ship (pure). No-op if not owned. */
export function equipStoryShip(story: StoryState, shipId: string): StoryState {
  if (!story.ownedShipIds.includes(shipId) || story.equippedShipId === shipId) return story;
  return { ...story, equippedShipId: shipId };
}

/** Grant the ace Comet Rider (pure, GS-story-ships) when a Story round holes one — added + flown if not
 *  already owned, else unchanged (referentially). Mirrors the base game's `aceShipUnlock`, on the campaign
 *  save. */
export function grantStoryAceShip(story: StoryState): StoryState {
  if (story.ownedShipIds.includes(ACE_SHIP_ID)) return story;
  return { ...story, ownedShipIds: [...story.ownedShipIds, ACE_SHIP_ID], equippedShipId: ACE_SHIP_ID };
}

/** The equipped ship's credit multiplier (the story effect). 1 for the starter wagon / an unknown ship. */
export function shipCreditMult(story: StoryState): number {
  const row = storyShipRow(story.equippedShipId);
  return row?.creditMult ?? 1;
}

/** The mechanical detail line(s) for a ship's lore card. */
export function storyShipDetail(row: StoryShip): string[] {
  const hull = storyShipHull(row.shipId);
  const lines: string[] = [];
  if (hull) lines.push(`${hull.set} class · ${hull.rarity}`);
  const pct = Math.round((row.creditMult - 1) * 100);
  lines.push(pct > 0 ? `Credits per world clear +${pct}% (bigger hold).` : 'A pure-flair ride — no credit bonus.');
  if (row.acquire === 'ace') lines.push('Earned only by a hole-in-one — never for sale.');
  else if (row.acquire === 'milestone') lines.push(`Revealed after clearing ${row.unlockAfterClears} worlds.`);
  else if (row.acquire === 'secret') lines.push(`A grail — revealed after clearing ${row.unlockAfterClears} worlds.`);
  return lines;
}
