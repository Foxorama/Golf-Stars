/**
 * Run economy — content-as-data formulas and the shop table.
 *
 * The fail gate is a golf "cut line": a minimum Stableford each stop, ramping with
 * galaxy distance. Beat it to travel on; miss it and the run ends. Credits (earned from
 * Stableford) buy loadout upgrades between stops. All pure & deterministic.
 */

import { CLUBS, clubById, type Club } from '../clubs';
import type { Rarity } from '../course/contract';
import { combineShapeMods, type CaddyGuard, type ShapeMod } from '../shot';
import { DEFAULT_MANUAL_BAND } from '../round';
import { RARITY_C } from './loot';

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

/**
 * Credits earned from a stop's Stableford total, scaled by any credit perk. `bonusFlat` (GS-synergy
 * relic payouts — birdie/eagle/comeback) is added to the Stableford-derived base BEFORE the multiplier,
 * so economy relics SYNERGISE with credit-mult perks (Fortune Chip / Lucky Coin amplify them too).
 */
export function creditsForStop(stableford: number, creditMult = 1, bonusFlat = 0): number {
  return Math.max(0, Math.round((stableford * CREDIT_PER_POINT + bonusFlat) * creditMult));
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
  /**
   * Suggestible Sam caddy (GS-caddy): hands you a club recommendation on the play screen — the 🎯
   * Suggested button + the suggested-club readout, and the default-selected club becomes the
   * green-coverage pick. Without a caddy reading the yardage there is NO suggestion: the default flow
   * starts on a neutral club and you pick your own. INTERACTIVE-ONLY — the auto sim never reads it, so
   * it can't shift scoring/determinism. Undefined/false = no suggestion.
   */
  clubSuggest?: boolean;
  /**
   * Suggestible Sam's "club confidence" boost (GS-caddy): a green-zone ShapeMod applied to a shot ONLY
   * when the played club is the one Sam suggested (commit to the caddy's club → swing freer). Threaded
   * into both the auto sim and the interactive driver under the identical rule, so auto≡interactive
   * holds. Undefined = no caddy → never applied (no shape change, no extra rng → byte-for-byte).
   */
  confidenceMod?: ShapeMod;
  /**
   * Escape-specialist caddy lie relief (GS-mux, Sandy the Sand-Saver): 0..1, softens a BAD lie's
   * carry + spray penalty toward neutral (rough/bunker/trees/waste recover much better). Threaded
   * IDENTICALLY through the auto sim and the interactive driver so auto≡interactive holds; undefined
   * = no relief → byte-for-byte unchanged.
   */
  lieRelief?: number;
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
   * Overdrive (GS-power): extra power FRACTION the interactive pull-to-power gesture may dial PAST a
   * full swing — `0.1` lets you charge to 110% power for more carry (at the club's full spray). The
   * sim accepts any power; this is the per-loadout ceiling the UI clamps to (`maxPowerOf`). The auto
   * sim always plays full swings, so this is an INTERACTIVE-only edge — undefined/0 = capped at 100%.
   */
  overpower?: number;
  /**
   * Running flat carry bonus applied to DISTANCE clubs (GS-clubs): the sum of the character's
   * distance trait (Larry +14 / Bo −8) and meta Tour Bag (+6/level), set as the bag is built. A
   * reward club bought mid-run reads this so a new distance club inherits the same bonus the
   * starting distance clubs already carry (Larry's new driver is still a Larry driver). 0 = none.
   */
  distanceClubBonus: number;
  /**
   * Club types this golfer refuses (GS-clubs): Longshot Larry never carries hybrids, so they never
   * appear in his reward offer. Set by the character; checked by the club-offer filter. Absent = none.
   */
  noHybrids?: boolean;
  /**
   * Putting skill (0 = base). Putter shop perks + the Putting Coach meta upgrade raise it; it widens
   * the manual pace-meter make-band AND tightens auto-putt make%/lag (see puttSkillOf). Rebuilt from
   * perks/meta on resume, so it needs no save bump.
   */
  puttBoost: number;
  /**
   * Trigger-relic economy bonuses (GS-synergy) — credits awarded at the END of a stop you PASS, on top
   * of the Stableford payout, for events that reward aggressive play. They feed the credit multiplier
   * (Fortune/Lucky) so a credit-snowball build compounds. All default 0 (no relic → base economy).
   */
  birdieCredit: number; // per birdie-or-better holed this stop
  eagleCredit: number; // extra per eagle-or-better holed this stop
  comebackCredit: number; // flat, if you PASSED despite a blow-up (a 0-point hole)
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

/** Base maximum shot power — a full swing is 100%. Overdrive upgrades raise it (per loadout). */
export const BASE_MAX_POWER = 1;
/** The most power the pull-to-power gesture may dial for this loadout (GS-power): 1 by default, more
 *  with Overdrive. Shared by the gesture clamp + the cone preview so the on-screen meter reads true. */
export function maxPowerOf(loadout: PlayerLoadout): number {
  return BASE_MAX_POWER + Math.max(0, loadout.overpower ?? 0);
}

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
    distanceClubBonus: 0,
    birdieCredit: 0,
    eagleCredit: 0,
    comebackCredit: 0,
  };
}

/**
 * Trigger-relic credit bonus for a passed stop (GS-synergy). Reads the holes played: each holed
 * birdie-or-better pays `birdieCredit` (eagles add `eagleCredit` on top), and a `comebackCredit` flat
 * bonus lands if you PASSED despite a blow-up (a hole that scored 0 Stableford, i.e. ≥ par+2 net).
 * Pure; a base loadout (all 0) returns 0 so the economy is byte-for-byte unchanged.
 */
export function relicCreditBonus(
  loadout: PlayerLoadout,
  played: readonly { record: { par: number; strokes: number }; holed: boolean; pickedUp: boolean }[],
  passed: boolean,
): number {
  if (!passed) return 0;
  const birdie = loadout.birdieCredit ?? 0;
  const eagle = loadout.eagleCredit ?? 0;
  const comeback = loadout.comebackCredit ?? 0;
  if (birdie === 0 && eagle === 0 && comeback === 0) return 0;
  let bonus = 0;
  let blewUp = false;
  for (const p of played) {
    const { par, strokes } = p.record;
    if (p.holed && !p.pickedUp) {
      if (strokes <= par - 1) bonus += birdie;
      if (strokes <= par - 2) bonus += eagle;
    }
    // A blow-up hole = 0 Stableford (net ≥ par+2). Picked-up holes are always blow-ups.
    if (p.pickedUp || strokes - par >= 2) blewUp = true;
  }
  if (blewUp) bonus += comeback;
  return bonus;
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
  /** Reward-club marker (GS-clubs): the base club TYPE this item equips ('D','7i',…). Absent = not a club. */
  clubType?: string;
  /** Reward-club SET/style (GS-clubs): the set this club belongs to ('starter','tour',…). */
  clubSet?: string;
  apply(loadout: PlayerLoadout): PlayerLoadout;
}

/** Space Ducks' laser guard (GS-caddy): no more duck-hooks; a hook has a 50% chance to be zapped
 *  back to the green. The cone still shows the left tails — the duck intercepts a sampled miss. */
export const SPACE_DUCKS_GUARD: CaddyGuard = { remove: ['duckHookL'], halve: ['hookL'], kind: 'laser' };
/** Convict Sheep's boomerang guard (GS-caddy): no more shanks; a slice has a 50% chance to be
 *  knocked back to the green. Mirrors Space Ducks on the right side. */
export const CONVICT_SHEEP_GUARD: CaddyGuard = { remove: ['shankR'], halve: ['sliceR'], kind: 'boomerang' };

/**
 * Suggestible Sam's "club confidence" shape boost (GS-caddy): when you commit to the club Sam hands
 * you, you swing freer — trim all four miss zones, feeding the freed probability to GREEN (more great
 * shots, fewer misses, visibly tighter cone). Applied ONLY on the suggested club (override it and you
 * forfeit the boost). Tuned so it's a clear epic-tier scoring lift without trivialising the spray.
 */
export const SAM_CONFIDENCE: ShapeMod = { hookL: -0.03, sliceR: -0.03, duckHookL: -0.015, shankR: -0.015 };

/** Sandy the Sand-Saver's lie relief (GS-mux): recover ~60% of the way back to a neutral lie from
 *  rough/sand/waste/trees — a clear escape-artist power without trivialising trouble. */
export const SANDY_LIE_RELIEF = 0.6;
/** Mystic Mole's manual-putt boost (GS-mux): a strong make-band/lag lift on the existing putt-skill
 *  field, so manual putting sinks far more — a legendary-feeling green read at epic scarcity. */
export const MOLE_PUTT_BOOST = 0.32;

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
  'suggestible-sam': ['skill'],
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
  // Overdrive (GS-power): dial the pull-to-power gesture past 100% — pure distance.
  overdrive: ['distance'],
  // Trigger relics + the curse (GS-synergy) — economy snowball pieces + a risk gamble.
  'birdie-hunter': ['economy'],
  'eagle-eye': ['economy'],
  'comeback-kid': ['economy'],
  'glass-cannon': ['economy'],
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
  // --- Named caddies (GS-caddy) — UNIQUE: only one may be hired at a time. They appear as random,
  // rarity-weighted inclusions in the rotating shop offer (epic/legendary, so scarce); once you hire
  // ANY named caddy, no named caddy appears in the shop again (enforced in shopOffer + buy()).
  // Penelope keeps the legacy `auto-caddie` id so existing saves still resolve her. Hiring any named
  // caddy also unlocks the generic caddy 'service' perks (Caddie Lesson) in the offer.
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
    rarity: 'epic',
    caddy: 'named',
    apply: (m) => ({ ...m, driverAnywhere: true, perks: [...m.perks, 'driver-dan'] }),
  },
  {
    id: 'dr-chipinski',
    name: 'Dr Chipinski',
    cost: 260,
    desc: 'A wedge wizard: +33% chance to hole out any pitching-wedge-or-shorter chip near the pin',
    rarity: 'epic',
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
  {
    id: 'suggestible-sam',
    name: 'Suggestible Sam',
    cost: 240,
    desc: 'Reads the yardage & hands you the club — commit to his pick and swing freer (more great shots)',
    rarity: 'epic',
    caddy: 'named',
    apply: (m) => ({ ...m, clubSuggest: true, confidenceMod: SAM_CONFIDENCE, perks: [...m.perks, 'suggestible-sam'] }),
  },
  {
    id: 'sandy-sandsaver',
    name: 'Sandy the Sand-Saver',
    cost: 280,
    desc: 'A grizzled escape artist — recover from rough, sand, waste & trees with far less distance & spray lost',
    rarity: 'epic',
    caddy: 'named',
    // GS-mux escape specialist: softens a BAD lie's carry + dispersion penalty toward neutral.
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, SANDY_LIE_RELIEF), perks: [...m.perks, 'sandy-sandsaver'] }),
  },
  {
    id: 'mystic-mole',
    name: 'Mystic Mole',
    cost: 260,
    desc: 'Lives under the greens & knows every break — your manual putts sink far more often',
    rarity: 'epic',
    caddy: 'named',
    // Rides the existing putt-skill field: a big make-band + lag boost for the manual pace meter.
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + MOLE_PUTT_BOOST, perks: [...m.perks, 'mystic-mole'] }),
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

  // --- Overdrive (GS-power): lets the pull-to-power gesture charge PAST a full swing for more carry.
  {
    id: 'overdrive',
    name: 'Overdrive',
    cost: 140,
    desc: 'Overpowered shots: pull PAST 100% on the power gesture (+10% max carry) · stacks',
    rarity: 'epic',
    stackable: true,
    maxStacks: 2,
    // +0.1 power ceiling per copy (110% → 120% at two stacks). Interactive only — the auto sim
    // always plays full swings, so a base/auto loadout is byte-for-byte unchanged.
    apply: (m) => ({ ...m, overpower: (m.overpower ?? 0) + 0.1, perks: [...m.perks, 'overdrive'] }),
  },

  // --- Trigger relics (GS-synergy) — payouts that reward a PLAYSTYLE, compounding with credit perks.
  // They define a run's identity (go aggressive for birdie/eagle credits, or build a comeback engine)
  // and stack into the credit-snowball archetype (Fortune Chip / Lucky Coin multiply their payouts).
  {
    id: 'birdie-hunter',
    name: 'Birdie Hunter',
    cost: 110,
    desc: '+18 credits for every birdie-or-better you hole each stop · stacks (go aggressive)',
    rarity: 'rare',
    stackable: true,
    maxStacks: 4,
    apply: (m) => ({ ...m, birdieCredit: (m.birdieCredit ?? 0) + 18, perks: [...m.perks, 'birdie-hunter'] }),
  },
  {
    id: 'eagle-eye',
    name: 'Eagle Eye',
    cost: 160,
    desc: '+60 credits on top for every EAGLE-or-better you hole each stop',
    rarity: 'epic',
    apply: (m) => ({ ...m, eagleCredit: (m.eagleCredit ?? 0) + 60, perks: [...m.perks, 'eagle-eye'] }),
  },
  {
    id: 'comeback-kid',
    name: 'Comeback Kid',
    cost: 120,
    desc: '+90 credits whenever you make the cut DESPITE a blow-up hole · stacks',
    rarity: 'rare',
    stackable: true,
    maxStacks: 3,
    apply: (m) => ({ ...m, comebackCredit: (m.comebackCredit ?? 0) + 90, perks: [...m.perks, 'comeback-kid'] }),
  },
  {
    // The CURSE gamble (GS-curses): a real risk you opt into — wilder misses for a big payout multiplier.
    id: 'glass-cannon',
    name: 'Glass Cannon',
    cost: 150,
    desc: 'CURSE: wider misses (hook & slice up) — but +60% credits earned. High risk, high reward.',
    rarity: 'epic',
    apply: (m) => ({
      ...m,
      shapeMod: combineShapeMods(m.shapeMod, { hookL: 0.03, sliceR: 0.03 }),
      creditMult: m.creditMult * 1.6,
      perks: [...m.perks, 'glass-cannon'],
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

// --- Club rewards (GS-clubs) -------------------------------------------------
// Clubs are loot. A reward club is a ShopItem whose apply() EQUIPS it into the bag — replacing your
// current club of that TYPE, or adding it if you have none (the bag holds one club per type). Each
// club has a club TYPE (a base club id — 'D','7i','putter') and belongs to a SET/style at a rarity
// tier. A higher-tier club of a type you own is an UPGRADE (better base carry); a same-tier club from
// a DIFFERENT set is a side-grade. Starting clubs count as the common 'starter' set, so the offer
// never shows a golfer a club they already hold at that tier (see offerableClubs). The catalogue is
// GENERATED from a compact set×type table, so adding a location-specific legendary set later (e.g. the
// Tarantula Network's Spyder putter) is one row — not an engine edit.

/** A club SET/style: a tier (rarity), a flat carry bonus over the base club, a price, a name prefix. */
export interface ClubSet {
  set: string;
  /** Name prefix ('' = plain "7-Iron"; 'Tour' → "Tour 7-Iron"). */
  label: string;
  rarity: Rarity;
  /** Yards added to the base club's nominal carry — applied to DISTANCE clubs only (see below). */
  carryBonus: number;
  cost: number;
  /**
   * Restrict this set to DISTANCE-club types (GS-clubs). The carry bonus is the only "better base
   * stat" we model today, and extra carry only HELPS on the woods/long sticks (reach) — on a scoring
   * club it OVERSHOOTS the green and scores WORSE (the power-cell lesson, verified). So an upgrade
   * tier built purely on +carry is offered for distance clubs only; scoring-club upgrade tiers need a
   * different stat (tighter dispersion / a game effect) and are a documented follow-up.
   */
  distanceOnly?: boolean;
  /**
   * Restrict this set to SCORING-club types (the irons/wedges below the distance threshold). A scoring
   * reward carries its BASE distance (no overshoot) — its value is COVERAGE: a club for a distance the
   * balanced bag skips, so it fills a gap and lets you dial the shot in (the "too hard close to the
   * green" fix). Offered only for a type you LACK — never as a same-carry "upgrade" to one you hold.
   */
  scoringOnly?: boolean;
  /**
   * Never appears in the rotating offer (GS-clubs-2). The legacy common 'starter' set is kept ONLY so
   * old saves that bought a `club:starter:*` perk still resolve it on resume — the shop no longer sells
   * common clubs (rewards are rare+ improvements). Absent ⇒ offerable.
   */
  offerable?: boolean;
}

export const CLUB_SETS: readonly ClubSet[] = [
  // Legacy common 'starter' set — NO LONGER OFFERED (rewards are rare+ now). Kept resolvable so old
  // saves carrying a `club:starter:*` perk still rebuild it; the live bag's starting clubs are stamped
  // 'starter' directly by the character (buildStartBag), not drawn from here.
  { set: 'starter', label: '', rarity: 'common', carryBonus: 0, cost: 70, offerable: false },
  // 'tour' — the first DISTANCE upgrade tier: a longer rare wood/long-hybrid that replaces your
  // starter one (a verified reach upgrade), or fills a missing distance club.
  { set: 'tour', label: 'Tour', rarity: 'rare', carryBonus: 8, cost: 150, distanceOnly: true },
  // 'masters' — the EPIC distance tier above 'tour' (a deeper reach upgrade for late-run builds).
  { set: 'masters', label: 'Masters', rarity: 'epic', carryBonus: 16, cost: 240, distanceOnly: true },
  // 'pro' — rare SCORING coverage: a premium iron/wedge at base carry that fills a gap the balanced
  // bag leaves (tighter distance control close in). Offered only for a type you don't already carry.
  { set: 'pro', label: 'Pro', rarity: 'rare', carryBonus: 0, cost: 120, scoringOnly: true },
];

/**
 * Club TYPES (base club ids) that can appear as rewards. Two roles relative to the balanced 11-club
 * bag: DISTANCE clubs (D/3W/5W/7W/2H) upgrade an owned one or fill a missing wood; SCORING clubs are
 * the long/mid irons + wedge in-betweens the balanced bag skips (4H/3i/4i/5i/7i/9i, AW/58) — collecting
 * them tightens the gaps so you can dial distance in close to the green. Clubs everyone already carries
 * (6i/8i/PW/GW/SW/LW/60/putter) aren't here — a same-carry "premium" copy is no improvement.
 */
export const REWARD_CLUB_TYPES: readonly string[] = [
  'D', '3W', '5W', '7W', '2H', '4H', '3i', '4i', '5i', '7i', '9i', 'AW', '58',
];

/** Is this club type a hybrid (Longshot Larry refuses them)? Hybrid ids end in 'H'. */
export function isHybridType(type: string): boolean {
  return /H$/.test(type);
}

/** Is this club type a DISTANCE club (woods/long hybrids — where extra carry is a real upgrade)? */
export function isDistanceType(type: string): boolean {
  const base = clubById(type, CLUBS);
  return !!base && base.carry >= DISTANCE_CLUB_CARRY;
}

/** Is this club type a SCORING club (irons/wedges — coverage matters, extra carry would overshoot)? */
export function isScoringType(type: string): boolean {
  const base = clubById(type, CLUBS);
  return !!base && base.carry < DISTANCE_CLUB_CARRY;
}

/** Look up a club SET row by its id (e.g. resolve a reward item's clubSet back to its tier/bonus). */
export function clubSetById(set: string | undefined): ClubSet | undefined {
  return CLUB_SETS.find((s) => s.set === set);
}

/** The reward-club shop-item id for a (set, type) — stable; encodes both so resume rebuilds it. */
export function clubItemId(set: string, type: string): string {
  return `club:${set}:${type}`;
}

/**
 * The bag Club a reward grants. Carry bonuses (the set's tier bonus AND the golfer/meta distance
 * bonus) apply to DISTANCE clubs only — never to a scoring club, where extra carry overshoots the
 * green and scores worse (the power-cell lesson). So a scoring-club reward carries exactly its base.
 */
export function buildRewardClub(set: ClubSet, type: string, distanceClubBonus = 0): Club {
  const base = clubById(type, CLUBS);
  if (!base) throw new Error(`buildRewardClub: unknown club type "${type}"`);
  const bump = base.carry >= DISTANCE_CLUB_CARRY ? set.carryBonus + distanceClubBonus : 0;
  return {
    id: type,
    name: set.label ? `${set.label} ${base.name}` : base.name,
    carry: base.carry + bump,
    set: set.set,
    rarity: set.rarity,
  };
}

/** Equip a club: drop any current club of the same TYPE, insert, re-sort longest→shortest. */
export function equipClub(bag: readonly Club[], club: Club): Club[] {
  return [...bag.filter((c) => c.id !== club.id), club].sort((a, b) => b.carry - a.carry);
}

/** Does a set generate an item for a club type? distance-only sets (tour/masters) cover only distance
 *  clubs; the scoring-only set (pro) only scoring clubs; an unrestricted set (legacy starter) covers all. */
function setCoversType(set: ClubSet, type: string): boolean {
  if (set.distanceOnly) return isDistanceType(type);
  if (set.scoringOnly) return isScoringType(type);
  return true;
}

/** Every reward club as a ShopItem (set × type). Generated once; apply() equips it into the bag. A
 *  distance-only set (tour/masters) skips scoring-club types — a +carry upgrade there would overshoot;
 *  the scoring-only set (pro) skips distance clubs (it carries base distance, value is coverage). */
export const CLUB_ITEMS: readonly ShopItem[] = CLUB_SETS.flatMap((set) =>
  REWARD_CLUB_TYPES.filter((type) => setCoversType(set, type)).map((type): ShopItem => {
    const id = clubItemId(set.set, type);
    const base = clubById(type, CLUBS)!;
    const tierWord = set.rarity === 'common' ? 'A fresh' : `A ${set.rarity}`;
    const carry = base.carry + (isDistanceType(type) ? set.carryBonus : 0);
    return {
      id,
      name: set.label ? `${set.label} ${base.name}` : base.name,
      cost: set.cost,
      desc: `${tierWord} ${base.name} (~${carry} yd) · equips into your bag`,
      rarity: set.rarity,
      clubType: type,
      clubSet: set.set,
      apply: (m) => ({
        ...m,
        bag: equipClub(m.bag, buildRewardClub(set, type, m.distanceClubBonus ?? 0)),
        perks: [...m.perks, id],
      }),
    };
  }),
);

export function clubItem(id: string): ShopItem | undefined {
  return CLUB_ITEMS.find((i) => i.id === id);
}

/** Rarity rank for ordering (common 0 → legendary 3); undefined ⇒ common. */
function rarityRank(r: Rarity | undefined): number {
  return RARITY_C[r ?? 'common'].order;
}

/**
 * The reward clubs offerable to a loadout (GS-clubs-2 ownership rules). The shop only sells rare+
 * IMPROVEMENTS now — no common gap-fillers:
 *  - the legacy common 'starter' set is never offered (`offerable: false`);
 *  - a golfer who refuses a type (Larry/hybrids) never sees it;
 *  - a type you DON'T carry → offered (NEW coverage: fills a gap so you can dial the distance in);
 *  - a type you DO carry → offered only as a genuine carry UPGRADE: a higher-rarity DISTANCE club
 *    (more reach, no overshoot). A scoring club you hold is never "upgraded" — its premium copy has
 *    the same carry, so it's no improvement (the power-cell lesson).
 */
export function offerableClubs(loadout: PlayerLoadout): ShopItem[] {
  return CLUB_ITEMS.filter((it) => {
    if (clubSetById(it.clubSet)?.offerable === false) return false;
    const type = it.clubType!;
    if (loadout.noHybrids && isHybridType(type)) return false;
    const cur = loadout.bag.find((c) => c.id === type);
    if (!cur) return true; // gap-fill: you don't carry this type
    // Owned → only a real carry upgrade: a higher-rarity distance club.
    return isDistanceType(type) && rarityRank(it.rarity) > rarityRank(cur.rarity);
  });
}

/**
 * Player-facing note for a reward club on the shop card (GS-clubs-2): is it an UPGRADE to a club you
 * carry (and by how many yards) or a NEW club, and which distance gap it fills (its neighbours in the
 * bag). Pure — the UI turns this into a badge. Returns undefined for a non-club item.
 */
export interface ClubOfferNote {
  kind: 'upgrade' | 'new';
  /** The reward club's carry (with the golfer's distance bonus folded in, as it'll sit in the bag). */
  carry: number;
  /** Upgrade only: yards gained over the club currently carried (≥0). */
  gainYd?: number;
  /** New only: the bag club just LONGER than this one (the upper edge of the gap it fills), if any. */
  longerName?: string;
  /** New only: the bag club just SHORTER than this one (the lower edge of the gap it fills), if any. */
  shorterName?: string;
}

export function clubOfferNote(item: ShopItem, loadout: PlayerLoadout): ClubOfferNote | undefined {
  const set = clubSetById(item.clubSet);
  if (!item.clubType || !set) return undefined;
  const reward = buildRewardClub(set, item.clubType, loadout.distanceClubBonus ?? 0);
  const cur = loadout.bag.find((c) => c.id === item.clubType);
  if (cur) {
    return { kind: 'upgrade', carry: reward.carry, gainYd: Math.max(0, Math.round(reward.carry - cur.carry)) };
  }
  // New club: find its neighbours by carry to describe the gap it slots into.
  let longer: Club | undefined;
  let shorter: Club | undefined;
  for (const c of loadout.bag) {
    if (c.carry > reward.carry && (!longer || c.carry < longer.carry)) longer = c;
    if (c.carry < reward.carry && (!shorter || c.carry > shorter.carry)) shorter = c;
  }
  return { kind: 'new', carry: reward.carry, longerName: longer?.name, shorterName: shorter?.name };
}

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id) ?? clubItem(id);
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
