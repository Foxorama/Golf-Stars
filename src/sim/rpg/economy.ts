/**
 * Run economy — content-as-data formulas and the shop table.
 *
 * The fail gate is a golf "cut line": a minimum Stableford each stop, ramping with
 * galaxy distance. Beat it to travel on; miss it and the run ends. Credits (earned from
 * Stableford) buy loadout upgrades between stops. All pure & deterministic.
 */

import { CLUBS, type Club } from '../clubs';
import type { Rarity } from '../course/contract';

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
  /**
   * Golfer handicap — the core skill stat. Higher = wider shot randomness, lower =
   * tighter. Skills/cards lower it. Maps to a dispersion factor via handicapDispersion().
   */
  handicap: number;
  /** Equipment dispersion multiplier (<1 = tighter), stacked on top of handicap. */
  dispersionMult: number;
  /** Multiplies credits earned. */
  creditMult: number;
  /** Auto-putt: the green is putted out for you (and better). Granted by a legendary perk. */
  autoPutt?: boolean;
  /** Owned perk ids (each shop item is buyable once). */
  perks: string[];
}

export const STARTING_HANDICAP = 18;

export function startingLoadout(): PlayerLoadout {
  return {
    bag: CLUBS.map((c) => ({ ...c })),
    handicap: STARTING_HANDICAP,
    dispersionMult: 1,
    creditMult: 1,
    perks: [],
  };
}

/** Dispersion factor from handicap: ~0.7x at scratch (0) up to ~1.6x at 36. */
export function handicapDispersion(handicap: number): number {
  const h = Math.max(0, Math.min(36, handicap));
  return 0.7 + (h / 36) * 0.9;
}

/** The player's net shot-dispersion multiplier: handicap skill × equipment. */
export function netDispersion(loadout: PlayerLoadout): number {
  return handicapDispersion(loadout.handicap) * loadout.dispersionMult;
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
  /** Base cost — the price of the FIRST copy. Stackables ramp from here (see itemCost). */
  cost: number;
  desc: string;
  /** Loot grade — tints the item card (see render/cards.ts) AND weights the shop offer. */
  rarity: Rarity;
  /**
   * Repeatable purchases that STACK their effect (the credit sink that keeps a build
   * growing into the cut-line ramp). Absent = a one-shot unique (buyable once per run).
   */
  stackable?: boolean;
  /** Cap on copies of a stackable — bounds the value even though the cost-sink is endless. */
  maxStacks?: number;
  /** Per-owned-copy cost multiplier for a stackable (defaults to STACK_COST_GROWTH). */
  costGrowth?: number;
  apply(loadout: PlayerLoadout): PlayerLoadout;
}

/** Default geometric cost ramp for stackables — each copy you own makes the next dearer. */
export const STACK_COST_GROWTH = 1.5;

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'power-cell',
    name: 'Power Cell',
    cost: 120,
    desc: '+12 yds carry on your distance clubs · steadier tempo (−5% spray)',
    rarity: 'common',
    // Under the per-club wildness model, longer clubs spray more — so pure distance is
    // double-edged. The small −5% dispersion keeps the Power Cell a genuine upgrade
    // (a power-up must improve scoring) rather than a wash.
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 12),
      dispersionMult: m.dispersionMult * 0.95,
      perks: [...m.perks, 'power-cell'],
    }),
  },
  {
    id: 'gyro',
    name: 'Gyro Stabiliser',
    cost: 150,
    desc: '15% tighter dispersion',
    rarity: 'rare',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.85, perks: [...m.perks, 'gyro'] }),
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Coin',
    cost: 100,
    desc: '+20% credits earned',
    rarity: 'rare',
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.2, perks: [...m.perks, 'lucky-coin'] }),
  },
  {
    id: 'pro-coach',
    name: 'Pro Coach',
    cost: 170,
    desc: '−6 handicap (tighter, more accurate shots)',
    rarity: 'epic',
    apply: (m) => ({ ...m, handicap: Math.max(0, m.handicap - 6), perks: [...m.perks, 'pro-coach'] }),
  },
  {
    id: 'auto-caddie',
    name: 'Auto-Caddie',
    cost: 280,
    desc: 'Reads & sinks your putts for you — auto-putt with a steadier stroke',
    rarity: 'legendary',
    apply: (m) => ({ ...m, autoPutt: true, perks: [...m.perks, 'auto-caddie'] }),
  },

  // --- Stackable upgrades (the endless credit sink + growing build) -----------
  // Each is buyable repeatedly at a rising price, so credits never go dead and the
  // loadout keeps scaling into the cut-line ramp. Effects compound through apply()
  // being folded once per owned copy (loadoutFromPerks / buy both rely on this).
  {
    id: 'caddie-lesson',
    name: 'Caddie Lesson',
    cost: 70,
    desc: '−2 handicap, tighter shots · stacks down to scratch',
    rarity: 'common',
    stackable: true,
    maxStacks: 9, // 18 handicap → 0 (scratch); past that the −handicap clamp wastes credits
    apply: (m) => ({ ...m, handicap: Math.max(0, m.handicap - 2), perks: [...m.perks, 'caddie-lesson'] }),
  },
  {
    id: 'fortune-chip',
    name: 'Fortune Chip',
    cost: 80,
    desc: '+15% credits earned · stacks (funds the deeper galaxy)',
    rarity: 'common',
    stackable: true,
    maxStacks: 6,
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.15, perks: [...m.perks, 'fortune-chip'] }),
  },
  {
    id: 'precision-chip',
    name: 'Precision Chip',
    cost: 110,
    desc: '8% tighter dispersion · stacks (forgiveness compounds)',
    rarity: 'rare',
    stackable: true,
    maxStacks: 10, // multiplicative decay self-limits value (asymptotic, never to zero → still fair)
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.92, perks: [...m.perks, 'precision-chip'] }),
  },
  {
    id: 'range-booster',
    name: 'Range Booster',
    cost: 100,
    desc: '+8 yds distance clubs · −3% spray · stacks',
    rarity: 'rare',
    stackable: true,
    maxStacks: 5,
    // Distance clubs ONLY (same reason as Power Cell — boosting scoring clubs makes the
    // reach AI overshoot greens). The −3% dispersion offsets the wider-spray penalty a
    // longer club carries, so each stack stays a net scoring upgrade (guarded in tests).
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 8),
      dispersionMult: m.dispersionMult * 0.97,
      perks: [...m.perks, 'range-booster'],
    }),
  },
];

/** How many copies of an item the loadout owns (a unique is 0 or 1; a stackable, 0..cap). */
export function ownedCount(perks: string[], id: string): number {
  return perks.reduce((n, p) => (p === id ? n + 1 : n), 0);
}

/** Max copies an item can reach — 1 for a unique, maxStacks (or ∞) for a stackable. */
export function itemCap(item: ShopItem): number {
  return item.stackable ? item.maxStacks ?? Infinity : 1;
}

/** Price of the NEXT copy, given how many are already owned (geometric ramp for stackables). */
export function itemCost(item: ShopItem, owned: number): number {
  if (!item.stackable || owned <= 0) return item.cost;
  const growth = item.costGrowth ?? STACK_COST_GROWTH;
  return Math.round(item.cost * Math.pow(growth, owned));
}

/** Can another copy be bought right now? (under its cap AND affordable at the next price). */
export function canBuy(item: ShopItem, owned: number, credits: number): boolean {
  return owned < itemCap(item) && credits >= itemCost(item, owned);
}

/** Putting skill from the loadout: the Auto-Caddie sinks more and lags tighter. */
export function puttSkillOf(loadout: PlayerLoadout): { makeChance?: number; lagFrac?: number; lagSd?: number } {
  if (loadout.perks.includes('auto-caddie')) return { makeChance: 0.92, lagFrac: 0.05, lagSd: 0.035 };
  return {};
}

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/** Rebuild a loadout from a set of owned perks (used to resume a saved run). */
export function loadoutFromPerks(perks: string[]): PlayerLoadout {
  let m = startingLoadout();
  const owned = perks ?? [];
  for (const id of owned) {
    const item = shopItem(id);
    if (item) m = item.apply(m);
  }
  // apply() re-appends ids; pin the canonical owned set to avoid duplicates.
  return { ...m, perks: [...owned] };
}
