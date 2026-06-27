/**
 * Run economy — content-as-data formulas and the shop table.
 *
 * The fail gate is a golf "cut line": a minimum Stableford each stop, ramping with
 * galaxy distance. Beat it to travel on; miss it and the run ends. Credits (earned from
 * Stableford) buy loadout upgrades between stops. All pure & deterministic.
 */

import { CLUBS, type Club } from '../clubs';
import type { Rarity } from '../course/contract';
import { combineShapeMods, type CaddyGuard, type ShapeMod } from '../shot';
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
  /** Auto-putt: the green is putted out for you (and better). Granted by the Penelope Putter caddy. */
  autoPutt?: boolean;
  /**
   * Driver Dan caddy (GS-caddy): the driver is usable from ANY lie at full stats (not just the tee).
   * Default (undefined/false) keeps the driver tee-only. Replaces the removed Driver-on-Deck system;
   * enforced via `usableBag`, applied by both the auto sim and interactive player in lock-step.
   */
  driverAnywhere?: boolean;
  /**
   * Wedge-caddy chip-in chance (GS-caddy, Dr Chipinski): added probability that a PW-or-shorter shot
   * resting in the makeable chip range drops for a hole-out. 0/undefined = none.
   */
  chipInBoost?: number;
  /**
   * A named caddy's in-flight ball guard (GS-caddy, Space Ducks / Convict Sheep): redirects a sampled
   * miss tail back to the green mid-flight. Undefined = no guard.
   */
  caddyGuard?: CaddyGuard;
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

/** The driver club id (off-tee use is gated unless the Driver Dan caddy is owned). */
export const DRIVER_ID = 'D';

/**
 * The clubs selectable from `lie`. The driver is TEE-ONLY by default; the Driver Dan caddy
 * (`driverAnywhere`) unlocks it from any lie at full driver stats. One source of truth, applied by
 * BOTH the auto sim and the interactive player so they stay in lock-step. On the tee, or with Driver
 * Dan, the full bag is returned unchanged; otherwise the driver is dropped off the tee.
 */
export function usableBag(bag: readonly Club[], lie: string, driverAnywhere: boolean): readonly Club[] {
  if (lie === 'tee' || driverAnywhere) return bag;
  return bag.filter((c) => c.id !== DRIVER_ID);
}

export const STARTING_HANDICAP = 18;

export function startingLoadout(): PlayerLoadout {
  return {
    bag: CLUBS.map((c) => ({ ...c })),
    handicap: STARTING_HANDICAP,
    dispersionMult: 1,
    creditMult: 1,
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
  /**
   * Caddy classification (GS-caddy). `'named'` = a unique named caddy (Penelope Putter, Driver Dan,
   * …): you may own only ONE; they show in the dedicated shop Caddies section (the rest greyed once
   * one is hired). `'service'` = a generic caddy perk (Caddie Lesson) that only appears in the
   * rotating offer once you've hired a named caddy. Absent = an ordinary item.
   */
  caddy?: 'named' | 'service';
  apply(loadout: PlayerLoadout): PlayerLoadout;
}

/** Space Ducks' laser guard (GS-caddy): no more duck-hooks; a hook has a 50% chance to be zapped
 *  back to the green. The cone still shows the left tails — the duck intercepts a sampled miss. */
export const SPACE_DUCKS_GUARD: CaddyGuard = { remove: ['duckHookL'], halve: ['hookL'], kind: 'laser' };
/** Convict Sheep's boomerang guard (GS-caddy): no more shanks; a slice has a 50% chance to be
 *  knocked back to the green. Mirrors Space Ducks on the right side. */
export const CONVICT_SHEEP_GUARD: CaddyGuard = { remove: ['shankR'], halve: ['sliceR'], kind: 'boomerang' };

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
  // Named caddies (GS-caddy) — tagged by their flavour so the theme bias still nudges them.
  'driver-dan': ['distance'],
  'dr-chipinski': ['skill'],
  'space-ducks': ['control'],
  'convict-sheep': ['control'],
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
  // --- Named caddies (GS-caddy) — UNIQUE: only one may be hired at a time. They live in the shop's
  // dedicated Caddies section (others grey out once one is on your bag). Penelope keeps the legacy
  // `auto-caddie` id so existing saves still resolve her. Hiring any named caddy also unlocks the
  // generic caddy 'service' perks (Caddie Lesson) in the rotating offer.
  {
    id: 'auto-caddie',
    name: 'Penelope Putter',
    cost: 280,
    desc: 'Your caddy reads & sinks your putts — auto-putt with a steadier stroke',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({ ...m, autoPutt: true, perks: [...m.perks, 'auto-caddie'] }),
  },
  {
    id: 'driver-dan',
    name: 'Driver Dan',
    cost: 240,
    desc: 'Hand Dan the big stick anywhere — play your driver from ANY lie at full power',
    rarity: 'rare',
    caddy: 'named',
    apply: (m) => ({ ...m, driverAnywhere: true, perks: [...m.perks, 'driver-dan'] }),
  },
  {
    id: 'dr-chipinski',
    name: 'Dr Chipinski',
    cost: 260,
    desc: 'A wedge wizard: +33% chance to hole out any pitching-wedge-or-shorter chip near the pin',
    rarity: 'rare',
    caddy: 'named',
    apply: (m) => ({ ...m, chipInBoost: (m.chipInBoost ?? 0) + 0.33, perks: [...m.perks, 'dr-chipinski'] }),
  },
  {
    id: 'space-ducks',
    name: 'Space Ducks',
    cost: 300,
    desc: 'Laser-toting space ducks zap your duck-hooks (gone) & blast 50% of hooks back to the green',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({ ...m, caddyGuard: SPACE_DUCKS_GUARD, perks: [...m.perks, 'space-ducks'] }),
  },
  {
    id: 'convict-sheep',
    name: 'Convict Sheep',
    cost: 300,
    desc: 'Boomerang-slinging convict sheep end your shanks & knock 50% of slices back to the green',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({ ...m, caddyGuard: CONVICT_SHEEP_GUARD, perks: [...m.perks, 'convict-sheep'] }),
  },

  // --- Stackable upgrades (the endless credit sink + growing build) -----------
  // Each is buyable repeatedly at a rising price, so credits never go dead and the
  // loadout keeps scaling into the cut-line ramp. Effects compound through apply()
  // being folded once per owned copy (loadoutFromPerks / buy both rely on this).
  {
    id: 'caddie-lesson',
    name: 'Caddie Lesson',
    cost: 70,
    desc: '−2 handicap, tighter shots · stacks down to scratch · (needs a hired caddy)',
    rarity: 'common',
    stackable: true,
    maxStacks: 9, // 18 handicap → 0 (scratch); past that the −handicap clamp wastes credits
    // A generic caddy 'service' — only offered once you've hired a named caddy (GS-caddy).
    caddy: 'service',
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
];

/** All named-caddy shop-item ids (GS-caddy) — the unique, mutually-exclusive caddies. */
export const NAMED_CADDY_IDS: readonly string[] = SHOP_ITEMS.filter((i) => i.caddy === 'named').map((i) => i.id);

/** Is this a unique named caddy (only one ownable at a time)? */
export function isNamedCaddy(id: string): boolean {
  return NAMED_CADDY_IDS.includes(id);
}

/** The named caddy currently on the bag, if any (you may hire only one). */
export function namedCaddyOwned(perks: readonly string[]): string | undefined {
  return perks.find((p) => isNamedCaddy(p));
}

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
