/**
 * Run economy — content-as-data formulas and the shop table.
 *
 * The fail gate is a golf "cut line": a minimum Stableford each stop, ramping with
 * galaxy distance. Beat it to travel on; miss it and the run ends. Credits (earned from
 * Stableford) buy loadout upgrades between stops. All pure & deterministic.
 */

import { CLUBS, type Club } from '../clubs';

export const HOLES_PER_STOP = 6;
export const CREDIT_PER_POINT = 12;
export const STARTING_CREDITS = 60;

/**
 * Minimum Stableford to survive a stop. At distance 0 it's ~1 pt/hole (gentle); it
 * climbs past par pace (2 pts/hole) as you travel deeper. This is what eventually ends
 * a run if the loadout stops keeping up.
 */
export function cutLine(distanceFromStart: number, holes = HOLES_PER_STOP): number {
  return Math.round(holes * (1.0 + distanceFromStart * 0.07));
}

/** Credits earned from a stop's Stableford total, scaled by any credit perk. */
export function creditsForStop(stableford: number, creditMult = 1): number {
  return Math.max(0, Math.round(stableford * CREDIT_PER_POINT * creditMult));
}

/** The mutable player state a shop item modifies. Fully serialisable (data only). */
export interface PlayerLoadout {
  bag: Club[];
  /** Multiplies shot dispersion (<1 = tighter). */
  dispersionMult: number;
  /** Multiplies credits earned. */
  creditMult: number;
  /** Owned perk ids (each shop item is buyable once). */
  perks: string[];
}

export function startingLoadout(): PlayerLoadout {
  return { bag: CLUBS.map((c) => ({ ...c })), dispersionMult: 1, creditMult: 1, perks: [] };
}

/**
 * Add carry to the DISTANCE clubs only (the woods/long hybrids you hit off the tee or
 * for a long second). Boosting scoring clubs too would make the "reach" approach AI
 * overshoot greens and score *worse* — a power-up must feel like an upgrade.
 */
const DISTANCE_CLUB_CARRY = 185;
function boostDistanceClubs(bag: Club[], add: number): Club[] {
  return bag.map((c) => (c.carry >= DISTANCE_CLUB_CARRY ? { ...c, carry: c.carry + add } : { ...c }));
}

export interface ShopItem {
  id: string;
  name: string;
  cost: number;
  desc: string;
  apply(loadout: PlayerLoadout): PlayerLoadout;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'power-cell',
    name: 'Power Cell',
    cost: 120,
    desc: '+12 yds carry on your distance clubs',
    apply: (m) => ({ ...m, bag: boostDistanceClubs(m.bag, 12), perks: [...m.perks, 'power-cell'] }),
  },
  {
    id: 'gyro',
    name: 'Gyro Stabiliser',
    cost: 150,
    desc: '15% tighter dispersion',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.85, perks: [...m.perks, 'gyro'] }),
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    cost: 100,
    desc: '+20% credits earned',
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.2, perks: [...m.perks, 'lucky-coin'] }),
  },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/** Rebuild a loadout from a set of owned perks (used to resume a saved run). */
export function loadoutFromPerks(perks: string[]): PlayerLoadout {
  let m = startingLoadout();
  for (const id of perks) {
    const item = shopItem(id);
    if (item) m = item.apply(m);
  }
  // apply() re-appends ids; pin the canonical owned set to avoid duplicates.
  return { ...m, perks: [...perks] };
}
