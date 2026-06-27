/**
 * Run economy — content-as-data formulas and the shop table.
 *
 * The fail gate is a golf "cut line": a minimum Stableford each stop, ramping with
 * galaxy distance. Beat it to travel on; miss it and the run ends. Credits (earned from
 * Stableford) buy loadout upgrades between stops. All pure & deterministic.
 */

import { CLUBS, type Club } from '../clubs';
import type { Rarity } from '../course/contract';
import { combineShapeMods, type ShapeMod } from '../shot';
import { DEFAULT_MANUAL_BAND } from '../round';

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
  /**
   * Driver-on-Deck unlock level (GS-mechanics #11). 0 = the driver is tee-only (default); each
   * tier 1..4 lets you hit it off the deck from more lies, with a shrinking distance penalty and
   * spray surcharge (see DRIVER_DECK). The restriction is enforced via `usableBag`, applied by
   * both the auto sim and the interactive player so they stay in lock-step.
   */
  driverDeck: number;
  /** Owned perk ids (each shop item is buyable once). */
  perks: string[];
  /** The selected golfer (GS-18), if any — its shot-shape is resolved from this id. */
  characterId?: string;
  /**
   * Accumulated spray-zone shape mod from shaping upgrades (GS-dispersion-2): suppresses or skews
   * the duck-hook/hook/slice/shank miss zones. Folded into every shot's shape (under the golfer's
   * per-club skew). Defaults to no change.
   */
  shapeMod: ShapeMod;
  /** Distance-control: fraction added to the min carry of driver/woods/irons (point 5). 0 = none. */
  minCarryBoost: number;
  /** Wedge distance-control: fraction the wedge carry window is tightened toward the mean (point 6). */
  wedgeWindow: number;
  /**
   * Putting skill (0 = base). Putter shop perks + the Putting Coach meta upgrade raise it; it widens
   * the manual pace-meter make-band AND tightens auto-putt make%/lag (see puttSkillOf). Rebuilt from
   * perks/meta on resume, so it needs no save bump.
   */
  puttBoost: number;
}

/** The driver club id (off-tee use is gated by the Driver-on-Deck tier). */
export const DRIVER_ID = 'D';

/** Per-tier off-deck driver rules (index = `driverDeck` level). Content-as-data. */
export interface DriverDeckTier {
  /** Distance multiplier on the driver when hit off the tee (1 = full tee power). */
  distMult: number;
  /** Extra dispersion multiplier when hit off the tee (1 = no surcharge). */
  sprayMult: number;
  /** Lies the off-deck driver is allowed from; '*' = any lie. (The tee is always allowed.) */
  lies: readonly string[] | '*';
}
export const DRIVER_DECK: readonly DriverDeckTier[] = [
  { distMult: 1.0, sprayMult: 1.0, lies: [] }, // 0: tee only
  { distMult: 0.5, sprayMult: 1.5, lies: ['fairway'] }, // 1: fairway, −50% / +50%
  { distMult: 0.7, sprayMult: 1.3, lies: ['fairway'] }, // 2: fairway, −30% / +30%
  { distMult: 0.85, sprayMult: 1.15, lies: ['fairway', 'rough'] }, // 3: + rough, −15% / +15%
  { distMult: 0.95, sprayMult: 1.05, lies: '*' }, // 4: any lie, −5% / +5%
];

function driverTier(level: number): DriverDeckTier {
  return DRIVER_DECK[Math.max(0, Math.min(DRIVER_DECK.length - 1, level))]!;
}

/** Is the driver allowed off the deck from `lie` at this unlock level? (The tee always is.) */
export function driverAllowedOffTee(lie: string, level: number): boolean {
  if (lie === 'tee') return true;
  const tier = driverTier(level);
  return tier.lies === '*' || tier.lies.includes(lie);
}

/**
 * The clubs actually selectable from `lie` at this driver-deck level. Off the tee, the driver is
 * removed when not yet unlocked for that lie, or replaced by a reduced-carry copy (the distance
 * penalty) when it is — so club-selection AND distance are correct in one place, shared by the
 * auto sim and the interactive player. On the tee the full bag is returned unchanged.
 */
export function usableBag(bag: readonly Club[], lie: string, level: number): readonly Club[] {
  if (lie === 'tee') return bag;
  const tier = driverTier(level);
  if (!driverAllowedOffTee(lie, level)) return bag.filter((c) => c.id !== DRIVER_ID);
  return bag.map((c) => (c.id === DRIVER_ID ? { ...c, carry: Math.round(c.carry * tier.distMult) } : c));
}

/** Extra dispersion multiplier when the driver is played off the deck (1 otherwise). */
export function driverDeckSprayMult(clubId: string, lie: string, level: number): number {
  if (clubId !== DRIVER_ID || lie === 'tee') return 1;
  return driverAllowedOffTee(lie, level) ? driverTier(level).sprayMult : 1;
}

export const STARTING_HANDICAP = 18;

export function startingLoadout(): PlayerLoadout {
  return {
    bag: CLUBS.map((c) => ({ ...c })),
    handicap: STARTING_HANDICAP,
    dispersionMult: 1,
    creditMult: 1,
    driverDeck: 0,
    perks: [],
    shapeMod: {},
    minCarryBoost: 0,
    wedgeWindow: 0,
    puttBoost: 0,
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
export const DISTANCE_CLUB_CARRY = 185;
export function boostDistanceClubs(bag: Club[], add: number): Club[] {
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
  /** Item id that must already be owned for this one to appear in the shop offer (tier ladders). */
  prereq?: string;
  apply(loadout: PlayerLoadout): PlayerLoadout;
}

/** Default geometric cost ramp for stackables — each copy you own makes the next dearer. */
export const STACK_COST_GROWTH = 1.5;

/**
 * Upgrade CATEGORIES (GS-17d) — the thematic vocabulary the star-travel theme biases the shop by.
 * Kept as a side map (not on each ShopItem) so the catalogue stays untouched. An item with no entry
 * has no category and is never theme-boosted. Categories: `distance` (carry/driver), `control`
 * (dispersion/handicap forgiveness), `skill` (handicap mastery), `economy` (credits), `putting`.
 */
export const ITEM_TAGS: Record<string, readonly string[]> = {
  'power-cell': ['distance'],
  'range-booster': ['distance'],
  gyro: ['control'],
  'precision-chip': ['control'],
  'caddie-lesson': ['skill'],
  'pro-coach': ['skill'],
  'lucky-coin': ['economy'],
  'fortune-chip': ['economy'],
  'auto-caddie': ['putting'],
  'putting-grip': ['putting'],
  'tour-putter': ['putting'],
  'driver-deck-1': ['distance'],
  'driver-deck-2': ['distance'],
  'driver-deck-3': ['distance'],
  'driver-deck-4': ['distance'],
  // Spray-zone shapers (GS-dispersion-2) — accuracy/forgiveness, so 'control'.
  'sweet-spot': ['control'],
  'anti-duck-hook': ['control'],
  'shank-guard': ['control'],
  'hook-corrector': ['control'],
  'slice-corrector': ['control'],
  'draw-weighting': ['control'],
  // Distance-control (carry-window) upgrades — 'distance'.
  'distance-control': ['distance'],
  'wedge-touch': ['control'],
};

export function itemTags(id: string): readonly string[] {
  return ITEM_TAGS[id] ?? [];
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'power-cell',
    name: 'Power Cell',
    cost: 120,
    desc: '+12 yds carry on your distance clubs · steadier tempo (−5% spray)',
    // Rare, not common: a +12yd unique is a stronger first-copy upgrade than the rare,
    // stackable Range Booster (+8yd) — rarity must track power, so it can't read as common.
    rarity: 'rare',
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
    id: 'putting-grip',
    name: 'Pro Putting Grip',
    cost: 90,
    desc: 'Steadier stroke — widens the make window & tightens your lag · stacks',
    rarity: 'rare',
    stackable: true,
    maxStacks: 4,
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.12, perks: [...m.perks, 'putting-grip'] }),
  },
  {
    id: 'tour-putter',
    name: 'Tour Putter',
    cost: 170,
    desc: 'A precision flat-stick — a big lift to your putting make window & lag',
    rarity: 'epic',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.26, perks: [...m.perks, 'tour-putter'] }),
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

  // --- Spray-zone shapers (GS-dispersion-2) ------------------------------------
  // These re-shape WHERE a miss goes by editing the duck-hook/hook/slice/shank zone probabilities.
  // Cutting a miss zone feeds the freed % straight to GREEN (great shots) — the central band keeps
  // its width but its % climbs, and a zone cut to 0 vanishes from the spray graphic entirely. Pure
  // upgrades (only reduce misses) strictly raise scoring; the trade-off card is a sidegrade.
  {
    id: 'sweet-spot',
    name: 'Sweet-Spot Forging',
    cost: 130,
    desc: 'Find the centre more often — trims every miss, more GREAT shots · stacks',
    rarity: 'rare',
    stackable: true,
    maxStacks: 5,
    // Shave a little off all four miss zones → green % rises across the board (display tightens).
    apply: (m) => ({
      ...m,
      shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.012, sliceR: -0.012, duckHookL: -0.006, shankR: -0.006 }),
      perks: [...m.perks, 'sweet-spot'],
    }),
  },
  {
    id: 'anti-duck-hook',
    name: 'Anti-Hook Grip',
    cost: 110,
    desc: 'Kills the DUCK-HOOK (left red zone) — that wild left tail is gone',
    rarity: 'rare',
    // −100% duck-hooks: the whole left red zone disappears; its 2% flows to green.
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { duckHookL: -1 }), perks: [...m.perks, 'anti-duck-hook'] }),
  },
  {
    id: 'shank-guard',
    name: 'Shank Guard',
    cost: 110,
    desc: 'Kills the SHANK (right red zone) — no more wild blocks right',
    rarity: 'rare',
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { shankR: -1 }), perks: [...m.perks, 'shank-guard'] }),
  },
  {
    id: 'hook-corrector',
    name: 'Hook Corrector',
    cost: 90,
    desc: 'Halves the HOOK (left orange zone) → more centre · stacks',
    rarity: 'common',
    stackable: true,
    maxStacks: 3,
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.04 }), perks: [...m.perks, 'hook-corrector'] }),
  },
  {
    id: 'slice-corrector',
    name: 'Slice Corrector',
    cost: 90,
    desc: 'Halves the SLICE (right orange zone) → more centre · stacks',
    rarity: 'common',
    stackable: true,
    maxStacks: 3,
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.04 }), perks: [...m.perks, 'slice-corrector'] }),
  },
  {
    id: 'draw-weighting',
    name: 'Draw Weighting',
    cost: 80,
    desc: 'Trade-off: −4% slice for +2% hook — swaps right misses for fewer, left ones',
    rarity: 'common',
    // A pure trade-off (does NOT feed green): drops the right orange but adds a little left orange.
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.04, hookL: 0.02 }), perks: [...m.perks, 'draw-weighting'] }),
  },

  // --- Distance-control (carry-window) upgrades (GS-dispersion-2, points 5 & 6) ---
  {
    id: 'distance-control',
    name: 'Distance Control',
    cost: 120,
    desc: 'Tighter distances on driver/woods/irons — raises the min carry, smaller gap · stacks',
    rarity: 'rare',
    stackable: true,
    maxStacks: 4,
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.05, perks: [...m.perks, 'distance-control'] }),
  },
  {
    id: 'wedge-touch',
    name: 'Wedge Touch',
    cost: 110,
    desc: 'Pin-point wedges: tightens the wedge carry window so it lands where you aim · stacks',
    rarity: 'rare',
    stackable: true,
    maxStacks: 3,
    // Tighten the wedge window AND its line a touch — forward/back AND left/right precision.
    apply: (m) => ({
      ...m,
      wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.18),
      perks: [...m.perks, 'wedge-touch'],
    }),
  },

  // --- Driver on Deck (GS-mechanics #11): a 4-tier ladder unlocking the driver off the deck.
  // Each tier appears in the shop only once the previous is owned (prereq). The level drives the
  // distance penalty / spray surcharge / allowed lies via DRIVER_DECK.
  {
    id: 'driver-deck-1',
    name: 'Driver on Deck',
    cost: 90,
    desc: 'Hit driver off the FAIRWAY too — but −50% distance & +50% spray off the deck',
    rarity: 'common',
    apply: (m) => ({ ...m, driverDeck: Math.max(m.driverDeck, 1), perks: [...m.perks, 'driver-deck-1'] }),
  },
  {
    id: 'driver-deck-2',
    name: 'Tour Driver',
    cost: 150,
    desc: 'Off-deck driver eased to −30% distance, +30% spray (fairway)',
    rarity: 'rare',
    prereq: 'driver-deck-1',
    apply: (m) => ({ ...m, driverDeck: Math.max(m.driverDeck, 2), perks: [...m.perks, 'driver-deck-2'] }),
  },
  {
    id: 'driver-deck-3',
    name: 'Deck Cannon',
    cost: 230,
    desc: 'Off-deck driver −15% / +15% · now playable from the ROUGH too',
    rarity: 'epic',
    prereq: 'driver-deck-2',
    apply: (m) => ({ ...m, driverDeck: Math.max(m.driverDeck, 3), perks: [...m.perks, 'driver-deck-3'] }),
  },
  {
    id: 'driver-deck-4',
    name: 'Big Stick',
    cost: 320,
    desc: 'Off-deck driver near tee-power (−5% / +5%) · from ANY lie',
    rarity: 'legendary',
    prereq: 'driver-deck-3',
    apply: (m) => ({ ...m, driverDeck: Math.max(m.driverDeck, 4), perks: [...m.perks, 'driver-deck-4'] }),
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

/**
 * Putting skill from the loadout. A base loadout (no putter perks, no caddie) returns `{}` so the
 * headless sim + auto-putt stay byte-for-byte. Putter upgrades (`puttBoost`) and the Auto-Caddie both
 * sink more and lag tighter (auto-putt) AND widen the manual pace-meter make-band (`manualBand`).
 */
export function puttSkillOf(
  loadout: PlayerLoadout,
): { makeChance?: number; lagFrac?: number; lagSd?: number; manualBand?: number } {
  const boost = loadout.puttBoost ?? 0;
  const caddie = loadout.perks.includes('auto-caddie');
  if (boost === 0 && !caddie) return {};
  // Auto-Caddie is a solid baseline on top of any putter upgrades (preserves its ~0.92 make).
  const b = caddie ? Math.max(boost, 0.6) : boost;
  return {
    makeChance: Math.min(0.98, 0.85 + b * 0.13),
    lagFrac: Math.max(0.03, 0.07 - b * 0.035),
    lagSd: Math.max(0.02, 0.05 - b * 0.03),
    manualBand: Math.min(0.4, DEFAULT_MANUAL_BAND + b * 0.18),
  };
}

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/**
 * Rebuild a loadout from a set of owned perks (used to resume a saved run). `base` is the
 * starting loadout the perks build on — pass a meta-upgraded base (see meta.ts) so permanent
 * progression sits UNDER the run's shop perks; defaults to the vanilla starting loadout.
 */
export function loadoutFromPerks(perks: string[], base: PlayerLoadout = startingLoadout()): PlayerLoadout {
  let m = base;
  const owned = perks ?? [];
  for (const id of owned) {
    const item = shopItem(id);
    if (item) m = item.apply(m);
  }
  // apply() re-appends ids; pin the canonical owned set to avoid duplicates.
  return { ...m, perks: [...owned] };
}
