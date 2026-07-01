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
 * Minimum Stableford to survive a stop — the cut line. Calibrated to where golfers actually SCORE,
 * not below it: both the player and the ghost field average ~2 Stableford/hole (par pace), so the old
 * ~1 pt/hole cut sat at half the field's scoring and never bit anyone — arc 1 was a free pass and the
 * leaderboard never thinned (measured: field stop-scores 10–19 over 6 holes vs a cut of 6). Now it
 * STARTS near par pace (~1.7 pt/hole) so even the opening stop cuts the weak tail, and ramps ABOVE par
 * pace (toward ~2.6 pt/hole) as you travel deeper, so the cut scythes more of a fixed-quality field —
 * the "decent curve" that actually eliminates characters at the end of each stage. The voyage softens
 * the distance term via `cutMult` (see effectiveCut) so a bounded campaign plateaus rather than spirals.
 *
 * CALIBRATION (re-run `tests/` harness after touching these): at base+slope (1.7, 0.09) the unupgraded
 * auto reach-AI — the difficulty FLOOR — passes arc 1 comfortably (≈99/93/69% per stop) and the gate
 * tightens through arcs 2–3; an upgrading/interactive player keeps pace. Field-cut% (with the spread
 * field, see buildField) ramps ≈5%→20%→…→88% across the voyage.
 */
export function cutLine(distanceFromStart: number, holes = HOLES_PER_STOP): number {
  return Math.round(holes * (1.7 + distanceFromStart * 0.09));
}

/**
 * Credits earned from a stop's Stableford total, scaled by any credit perk. `bonusFlat` (GS-synergy
 * relic payouts — birdie/eagle/comeback) is added to the Stableford-derived base BEFORE the multiplier,
 * so economy relics SYNERGISE with credit-mult perks (Fortune Chip / Lucky Coin amplify them too).
 */
export function creditsForStop(stableford: number, creditMult = 1, bonusFlat = 0): number {
  return Math.max(0, Math.round((stableford * CREDIT_PER_POINT + bonusFlat) * creditMult));
}

/**
 * Hole-in-one reward (GS-ace). An ace (the tee shot holed, `holed && strokes === 1`) is the rarest
 * shot in the game, so it pays a real jackpot that CARRIES FORWARD: a flat credit bundle (folded into
 * `finishStop`'s pre-multiplier bonus, so it compounds with credit perks just like a relic), PLUS a
 * stacking precision **talent** ("Ace's Touch") that you keep for the rest of the run. Both are applied
 * in the pure `finishStop`, so the auto sim and the interactive player reward an ace IDENTICALLY.
 */
export const ACE_CREDIT_BONUS = 40;
/** The stacking precision talent an ace grants — kept out of boss draws via the `'ace'` archetype. */
export const ACE_TALENT_ID = 'talent-ace';

/** Number of holes-in-one in a played stop (the tee shot holed). Pure; used by `finishStop`. */
export function aceCount(
  played: readonly { record: { strokes: number }; holed: boolean }[],
): number {
  return played.reduce((n, p) => n + (p.holed && p.record.strokes === 1 ? 1 : 0), 0);
}

/** The flat credit bonus for the aces in a stop (folded into `creditsForStop`'s `bonusFlat`). */
export function aceCreditBonus(
  played: readonly { record: { strokes: number }; holed: boolean }[],
): number {
  return aceCount(played) * ACE_CREDIT_BONUS;
}

/**
 * Fold the Ace's Touch talent into a loadout once per ace (GS-ace). It STACKS — each ace pushes the
 * perk id again so `loadoutFromPerks` rebuilds the exact stack on resume, and tightens dispersion a
 * touch more. A precision boost can only ever HELP scoring (it can't trip the no-death-spiral bar),
 * so it's a safe reward for an astronomically rare shot.
 */
export function grantAceTalent(loadout: PlayerLoadout, aces: number): PlayerLoadout {
  if (aces <= 0) return loadout;
  const t = talentItem(ACE_TALENT_ID);
  if (!t) return loadout;
  let m = loadout;
  for (let i = 0; i < aces; i++) m = t.apply(m);
  return m;
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
   * A named caddy's in-flight ball guard (GS-caddy, Space Ducks / Convict Sheep): redirects an off-
   * fairway miss back onto the short grass mid-flight (the green if greenside, else the fairway).
   * Undefined = no guard.
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
  /**
   * Left-handed mode (GS-lefty): a player SETTING (not a perk/purchase) baked onto the loadout at the
   * app boundary so the pure sim can read it. Mirrors the golfer's lateral shot tendencies in world
   * space — hook/slice and any character bias curve the opposite way — threaded IDENTICALLY through
   * the auto sim (playStop) and the interactive driver (takeShot/previewShot) so auto≡interactive
   * holds. Undefined/false = right-handed → byte-for-byte unchanged. Not serialised: re-derived from
   * the live setting on resume, so it needs no save bump.
   */
  lefty?: boolean;
  /** Owned perk ids (each shop item is buyable once). */
  perks: string[];
  /** The selected golfer (GS-18), if any — its shot-shape is resolved from this id. */
  characterId?: string;
  /**
   * The permanent DEFAULT-BAG tier baked in at run start (GS-bag-tiers): the loot rarity the starter
   * bag was re-stamped to (rare/epic/legendary), or absent/'common' for the un-upgraded bag. The sim
   * doesn't read it (the clubs already carry their stamped rarity/carry); it's the Pro Shop FLOOR —
   * `offerableClubs` hides reward clubs BELOW it, so a purple bag never sees rare clubs for sale. Set by
   * `applyBagTier`, rebuilt from meta on resume (no save bump to the run snapshot beyond the tier id).
   */
  bagTier?: Rarity;
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
   * Green-reading caddy (GS-greens-3, Mystic Mole): the caddy reads the BREAK for you — the putt UI
   * snaps the aim to the ideal slope-compensated line + draws the read, so you only judge pace. Rebuilt
   * from perks on resume (no save bump). Interactive-only (the headless auto path never reads it).
   */
  greenRead?: boolean;
  /**
   * Trigger-relic economy bonuses (GS-synergy) — credits awarded at the END of a stop you PASS, on top
   * of the Stableford payout, for events that reward aggressive play. They feed the credit multiplier
   * (Fortune/Lucky) so a credit-snowball build compounds. All default 0 (no relic → base economy).
   */
  birdieCredit: number; // per birdie-or-better holed this stop
  eagleCredit: number; // extra per eagle-or-better holed this stop
  comebackCredit: number; // flat, if you PASSED despite a blow-up (a 0-point hole)
  /**
   * Reduced weather impact (GS-proshop-2, Wind-Cheater balls): 0..1 fraction the wind's carry loss AND
   * crosswind push are scaled DOWN by — low-spin gear that bores through the breeze. Threaded
   * IDENTICALLY through the upwind aim (`aimWithWind`) and the shot physics (`resolveShot`) so the
   * compensation stays consistent. Undefined/0 = full wind, byte-for-byte unchanged.
   */
  windResist?: number;
  /**
   * Increased backspin (GS-proshop-2, Spin-Milled wedges/balls): 0..1 subtracted from a shot's roll
   * fraction — freshly milled grooves rip more check so approaches BITE and hold the green (less
   * run-out, a touch more check on the wedges). Folded into the SAME single roll-energy rng draw, so
   * undefined/0 is byte-for-byte unchanged.
   */
  backspinBoost?: number;
  /**
   * Hazard-skip balls (GS-proshop-2, Floater / Magma-Skimmer / Void-Walker): the penalty kinds the
   * ball IGNORES. A ball that would rest in one of these (water/lava/void family) instead SKIMS across
   * and settles on the nearest dry ground with NO penalty stroke (a free carry when you clear it; a
   * drop at the near bank when you don't) — pure geometry, no rng. Each hazard-ball item adds its
   * kind(s). Absent/empty = ordinary penalties, byte-for-byte unchanged.
   */
  hazardImmune?: string[];
  /**
   * The legendary **Rainbow Ball** (GS-rainbow): every hole becomes RAINBOW ROAD — the fairway &
   * green are a rainbow ribbon through the stars and ANYTHING off the fairway/bunkers/green is OUT OF
   * BOUNDS (stroke-and-distance). A gloriously UNbalanced novelty legendary: it doesn't help you score
   * — it turns every hole into a high-wire act (any miss is OOB). Threaded IDENTICALLY through the auto
   * sim (playStop→playHole) and the interactive driver (takeShot), and propagated to the boss/partner
   * on the SAME hole in a duel (it transforms the HOLE, not just your ball — see match.ts), so best-
   * ball/scramble stay fair. Pure geometry on the rest lie (no rng), so absent/false is byte-for-byte
   * unchanged. Rebuilt from the perk id on resume, so no save bump.
   */
  rainbowRoad?: boolean;
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
  /** A boss-reward TALENT (GS-talents): a free run-scoped buff granted by beating a boss — NEVER sold in
   *  the shop (it lives in the TALENTS table, not SHOP_ITEMS), so the rotating offer never surfaces it. */
  talent?: boolean;
  /** A talent's themed zone archetype (GS-talents), so a boss in that world offers its signature talent. */
  archetype?: string;
  apply(loadout: PlayerLoadout): PlayerLoadout;
}

/** Space Ducks' laser guard (GS-caddy): zaps EVERY ball that would come down off the LEFT side of the
 *  short grass (rough/sand/void/water — wherever) back onto it — a GREENSIDE miss is dropped on the GREEN,
 *  any other miss on the fairway. Fires on every left miss, not just the extreme hooks. */
export const SPACE_DUCKS_GUARD: CaddyGuard = { side: 'left', kind: 'laser' };
/** Convict Sheep's boomerang guard (GS-caddy): knocks EVERY ball that would come down off the RIGHT side
 *  back onto the short grass (green if greenside, else the fairway). The right-side mirror of Space Ducks. */
export const CONVICT_SHEEP_GUARD: CaddyGuard = { side: 'right', kind: 'boomerang' };

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
  'mallet-putter': ['putting'],
  'tour-putter': ['putting'],
  'pinseeker-putter': ['putting'],
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
  'flop-wedge': ['control'], // high-spin short game reads as control
  'pro-irons': ['control'], // premium precision iron set
  'quantum-shafts': ['control'], // legendary precision set
  'nova-driver': ['distance'], // legendary straight bomber
  // Overdrive (GS-power): dial the pull-to-power gesture past 100% — pure distance.
  overdrive: ['distance'],
  // Trigger relics + the curse (GS-synergy) — economy snowball pieces + a risk gamble.
  'birdie-hunter': ['economy'],
  'eagle-eye': ['economy'],
  'comeback-kid': ['economy'],
  'glass-cannon': ['economy'],
  // GS-proshop-2 — new gameplay gear.
  'wind-cheater': ['control'], // weather forgiveness reads as control
  'spin-milled': ['skill'], // backspin/short-game touch
  'floater-balls': ['control'], // hazard forgiveness
  'magma-balls': ['control'],
  'void-walkers': ['control'],
  rangefinder: ['skill'],
  'tour-spikes': ['control'],
};

export function itemTags(id: string): readonly string[] {
  return ITEM_TAGS[id] ?? [];
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'power-cell',
    name: 'Graphite Power Shaft',
    cost: 120,
    desc: '+12 yds carry on your distance clubs · steadier tempo (−5% spray)',
    // Rare, not common: a pure distance upgrade sits alongside the rare Distance Balls (a sibling on
    // the distance axis) — rarity tracks power, so it can't read as common.
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
    name: 'Counterbalance Shaft',
    cost: 150,
    desc: 'A counter-weighted shaft squares the face — 15% tighter dispersion',
    rarity: 'rare',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.85, perks: [...m.perks, 'gyro'] }),
  },
  {
    id: 'lucky-coin',
    name: 'Lucky Ball Marker',
    cost: 100,
    desc: 'A lucky silver ball-marker — +20% credits earned',
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
    desc: 'Steadier stroke — widens the make window & tightens your lag',
    rarity: 'rare',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.16, perks: [...m.perks, 'putting-grip'] }),
  },
  {
    // Mid putting tier (GS-proshop-variety): a mallet sibling between the grip and the Tour Putter, so
    // the putting axis is a ladder of distinct one-shots rather than one stacked grip.
    id: 'mallet-putter',
    name: 'Counterbalance Mallet',
    cost: 130,
    desc: 'A stable counter-weighted mallet — a solid lift to your putting make window & lag',
    rarity: 'rare',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.2, perks: [...m.perks, 'mallet-putter'] }),
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
    // The legendary flat-stick (GS-proshop-variety): the apex of the putting ladder, a general-use
    // legendary that isn't a named caddy — so a legendary is actually buyable deep in the voyage.
    id: 'pinseeker-putter',
    name: 'Pinseeker Putter',
    cost: 340,
    desc: 'A face-milled precision blade — the steadiest stroke in the galaxy, a huge make window',
    rarity: 'legendary',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.4, perks: [...m.perks, 'pinseeker-putter'] }),
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
    cost: 320,
    desc: 'A wedge wizard: +33% chance to hole out any pitching-wedge-or-shorter chip near the pin',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({ ...m, chipInBoost: (m.chipInBoost ?? 0) + 0.33, perks: [...m.perks, 'dr-chipinski'] }),
  },
  {
    id: 'space-ducks',
    name: 'Space Ducks',
    cost: 300,
    desc: 'Laser-toting space ducks zap EVERY ball missing LEFT back onto the short grass — the green if it’s a greenside miss, else the fairway',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({ ...m, caddyGuard: SPACE_DUCKS_GUARD, perks: [...m.perks, 'space-ducks'] }),
  },
  {
    id: 'convict-sheep',
    name: 'Convict Sheep',
    cost: 300,
    desc: 'Boomerang-slinging convict sheep knock EVERY ball missing RIGHT back onto the short grass — the green if it’s a greenside miss, else the fairway',
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
    desc: 'Lives under the greens & reads every break — he aims your putt on the perfect line, you judge the pace',
    rarity: 'epic',
    caddy: 'named',
    // GS-greens-3: READS THE BREAK — the putt UI snaps your aim to the slope-compensated line + draws
    // the read, so a sidehill putt is taken care of for you. Plus the make-band/lag boost he always had.
    apply: (m) => ({ ...m, greenRead: true, puttBoost: (m.puttBoost ?? 0) + MOLE_PUTT_BOOST, perks: [...m.perks, 'mystic-mole'] }),
  },

  // --- One-shot upgrades (GS-proshop-variety) ---------------------------------
  // Formerly stackable, now single-purchase uniques: once bought, an item drops out of the offer, so
  // every shop is fresh DISTINCT gear instead of the same card five stops running. The build still
  // scales — via the many sibling items across each axis (control/distance/economy/putting), not by
  // re-buying one. Each single value is bumped up from its old first-copy strength to stay worthwhile.
  {
    id: 'caddie-lesson',
    name: 'Caddie Lesson',
    cost: 90,
    desc: '−4 handicap — tighter, more accurate shots · (needs a hired caddy)',
    rarity: 'common',
    // A generic caddy 'service' — only offered once you've hired a named caddy (GS-caddy).
    caddy: 'service',
    apply: (m) => ({ ...m, handicap: Math.max(0, m.handicap - 4), perks: [...m.perks, 'caddie-lesson'] }),
  },
  {
    id: 'fortune-chip',
    name: "Sponsor's Badge",
    cost: 80,
    desc: '+15% credits earned (funds the deeper galaxy)',
    rarity: 'common',
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.15, perks: [...m.perks, 'fortune-chip'] }),
  },
  {
    id: 'precision-chip',
    name: 'Tour Glove',
    cost: 110,
    desc: 'A tacky all-weather glove — 12% tighter dispersion',
    rarity: 'rare',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.88, perks: [...m.perks, 'precision-chip'] }),
  },
  {
    id: 'range-booster',
    name: 'Distance Balls',
    cost: 100,
    desc: 'Hot, low-spin distance balls — +12 yds distance clubs · −4% spray',
    rarity: 'rare',
    // Distance clubs ONLY (same reason as Power Cell — boosting scoring clubs makes the
    // reach AI overshoot greens). The −4% dispersion offsets the wider-spray penalty a
    // longer club carries, so it stays a net scoring upgrade (guarded in tests).
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 12),
      dispersionMult: m.dispersionMult * 0.96,
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
    desc: 'Find the centre more often — trims every miss, more GREAT shots',
    rarity: 'rare',
    // Shave a little off all four miss zones → green % rises across the board (display tightens).
    apply: (m) => ({
      ...m,
      shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.02, sliceR: -0.02, duckHookL: -0.01, shankR: -0.01 }),
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
    desc: 'Tames the HOOK (left orange zone) → more centre',
    rarity: 'common',
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.06 }), perks: [...m.perks, 'hook-corrector'] }),
  },
  {
    id: 'slice-corrector',
    name: 'Slice Corrector',
    cost: 90,
    desc: 'Tames the SLICE (right orange zone) → more centre',
    rarity: 'common',
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.06 }), perks: [...m.perks, 'slice-corrector'] }),
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
    name: 'Stiff Tour Shaft',
    cost: 120,
    desc: 'A stiff calibrated shaft — tighter distances on driver/woods/irons (raises the min carry)',
    rarity: 'rare',
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.1, perks: [...m.perks, 'distance-control'] }),
  },
  {
    id: 'wedge-touch',
    name: 'Wedge Touch',
    cost: 110,
    desc: 'Pin-point wedges: tightens the wedge carry window so it lands where you aim',
    rarity: 'rare',
    // Tighten the wedge window AND its line — forward/back AND left/right precision.
    apply: (m) => ({
      ...m,
      wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.32),
      perks: [...m.perks, 'wedge-touch'],
    }),
  },
  {
    // Epic precision iron set (GS-proshop-variety): a premium accuracy sibling to the Counterbalance
    // Shaft — a bigger single dispersion cut than any rare, giving the control axis a purple tier.
    id: 'pro-irons',
    name: 'Tour Muscle-Backs',
    cost: 230,
    desc: 'Forged tour muscle-back irons — a premium 18% tighter dispersion on every club',
    rarity: 'epic',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.82, perks: [...m.perks, 'pro-irons'] }),
  },
  {
    // Epic short-game piece (GS-proshop-variety): a high-spin lob wedge that both bites (backspin) and
    // lands tight (wedge window) — the purple tier of the short-game axis.
    id: 'flop-wedge',
    name: 'Spin Lob Wedge',
    cost: 200,
    desc: 'A high-toe spin lob wedge — rips backspin so approaches check up AND tightens the wedge window',
    rarity: 'epic',
    apply: (m) => ({
      ...m,
      backspinBoost: (m.backspinBoost ?? 0) + 0.1,
      wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.2),
      perks: [...m.perks, 'flop-wedge'],
    }),
  },

  // --- Overdrive (GS-power): lets the pull-to-power gesture charge PAST a full swing for more carry.
  {
    id: 'overdrive',
    name: 'Speed Whip Shaft',
    cost: 140,
    desc: 'A whippy speed shaft: pull PAST 100% on the power gesture (+20% max carry)',
    rarity: 'epic',
    // +0.2 power ceiling (120% pull). Interactive only — the auto sim always plays full swings, so a
    // base/auto loadout is byte-for-byte unchanged.
    apply: (m) => ({ ...m, overpower: (m.overpower ?? 0) + 0.2, perks: [...m.perks, 'overdrive'] }),
  },
  {
    // Legendary straight bomber (GS-proshop-variety): the apex distance club — a big carry boost on the
    // woods/long sticks (DISTANCE clubs only, so the reach AI never overshoots — the power-cell lesson)
    // that ALSO flies straighter. A general-use legendary gear piece, not a named caddy.
    id: 'nova-driver',
    name: 'Nova Long Driver',
    cost: 350,
    desc: 'A supersonic tour driver — +24 yds on your distance clubs AND 10% tighter dispersion. A straight bomb.',
    rarity: 'legendary',
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 24),
      dispersionMult: m.dispersionMult * 0.9,
      perks: [...m.perks, 'nova-driver'],
    }),
  },
  {
    // Legendary precision set (GS-proshop-variety): the apex of the control axis — the biggest single
    // dispersion cut in the game plus a shave off every miss zone. The go-to legendary for an accuracy
    // build, so a deep-voyage shop has a legendary worth its price.
    id: 'quantum-shafts',
    name: 'Quantum-Balanced Irons',
    cost: 360,
    desc: 'Frequency-matched quantum shafts — 22% tighter dispersion AND fewer misses across the board',
    rarity: 'legendary',
    apply: (m) => ({
      ...m,
      dispersionMult: m.dispersionMult * 0.78,
      shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.01, sliceR: -0.01, duckHookL: -0.008, shankR: -0.008 }),
      perks: [...m.perks, 'quantum-shafts'],
    }),
  },
  {
    // The legendary power piece (GS-proshop-3): the 1989 NES Power Glove — MAX power. A single,
    // unique, expensive overpower floor of +0.4 (a 140% pull ceiling, +40% carry), far past the
    // stackable Overdrive's 120%. Interactive only (the auto sim always plays full swings), so it
    // can't shift scoring or trip the death-spiral bar — a pure player-facing power fantasy.
    id: 'power-glove',
    name: 'Power Glove',
    cost: 360,
    desc: "It's so bad. Slip on the Power Glove and crank the pull gesture to MAX — pull to +40% carry, the biggest bomb in the galaxy",
    rarity: 'legendary',
    apply: (m) => ({ ...m, overpower: Math.max(m.overpower ?? 0, 0.4), perks: [...m.perks, 'power-glove'] }),
  },

  // --- Trigger relics (GS-synergy) — payouts that reward a PLAYSTYLE, compounding with credit perks.
  // They define a run's identity (go aggressive for birdie/eagle credits, or build a comeback engine)
  // and stack into the credit-snowball archetype (Fortune Chip / Lucky Coin multiply their payouts).
  {
    id: 'birdie-hunter',
    name: 'Birdie Hunter',
    cost: 110,
    desc: '+28 credits for every birdie-or-better you hole each stop (go aggressive)',
    rarity: 'rare',
    apply: (m) => ({ ...m, birdieCredit: (m.birdieCredit ?? 0) + 28, perks: [...m.perks, 'birdie-hunter'] }),
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
    desc: '+140 credits whenever you make the cut DESPITE a blow-up hole',
    rarity: 'rare',
    apply: (m) => ({ ...m, comebackCredit: (m.comebackCredit ?? 0) + 140, perks: [...m.perks, 'comeback-kid'] }),
  },
  {
    // The CURSE gamble (GS-curses): a real risk you opt into — wilder misses for a big payout multiplier.
    id: 'glass-cannon',
    name: 'Grip It & Rip It',
    cost: 150,
    desc: 'CURSE: swing out of your shoes — wider misses (hook & slice up) but +60% credits earned. High risk, high reward.',
    rarity: 'epic',
    apply: (m) => ({
      ...m,
      shapeMod: combineShapeMods(m.shapeMod, { hookL: 0.03, sliceR: 0.03 }),
      creditMult: m.creditMult * 1.6,
      perks: [...m.perks, 'glass-cannon'],
    }),
  },

  // --- GS-proshop-2: NEW gameplay-changing golf gear --------------------------
  // Weather / spin / hazard-ball items that MATERIALLY change how a shot plays — all default-off so a
  // base loadout is byte-for-byte unchanged in the sim (the determinism contract).
  {
    // Reduced weather impact (windResist): low-spin balls that bore through the breeze. Both the
    // upwind aim AND the actual wind push scale down together, so a shot stays fair — wind just bites
    // less. A safe, clearly-beneficial upgrade (less wind chaos).
    id: 'wind-cheater',
    name: 'Wind-Cheater Balls',
    cost: 120,
    desc: 'Low, boring ball-flight that cuts through the breeze — 45% less wind impact',
    rarity: 'rare',
    apply: (m) => ({ ...m, windResist: Math.min(0.6, (m.windResist ?? 0) + 0.45), perks: [...m.perks, 'wind-cheater'] }),
  },
  {
    // Increased backspin (backspinBoost): milled grooves rip more check so approaches bite & hold.
    id: 'spin-milled',
    name: 'Spin-Milled Wedges',
    cost: 130,
    desc: 'Freshly milled grooves rip backspin — your approaches bite and check up instead of running on',
    rarity: 'rare',
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.07, perks: [...m.perks, 'spin-milled'] }),
  },
  {
    // Hazard-skip ball: WATER. The ball skims clean across water (and creeks / frozen ponds, which
    // carry a 'water' penalty) and settles on the nearest dry ground — no lost-ball stroke.
    id: 'floater-balls',
    name: 'Floater Balls',
    cost: 220,
    desc: 'Buoyant balls that skip clean across water — water hazards & creeks no longer cost you a stroke',
    rarity: 'epic',
    apply: (m) => ({ ...m, hazardImmune: addImmune(m.hazardImmune, 'water'), perks: [...m.perks, 'floater-balls'] }),
  },
  {
    // Hazard-skip ball: LAVA (and the lava-river crossings).
    id: 'magma-balls',
    name: 'Magma Skimmers',
    cost: 220,
    desc: 'Heat-shielded balls that skip across molten lava — lava hazards & rivers cost you no stroke',
    rarity: 'epic',
    apply: (m) => ({ ...m, hazardImmune: addImmune(m.hazardImmune, 'lava'), perks: [...m.perks, 'magma-balls'] }),
  },
  {
    // Hazard-skip ball: THE VOID — the hardest world's signature hazard. Legendary-scarce.
    id: 'void-walkers',
    name: 'Void-Walker Balls',
    cost: 300,
    desc: 'Anti-grav balls that drift across the abyss — the void no longer swallows your ball',
    rarity: 'legendary',
    apply: (m) => ({ ...m, hazardImmune: addImmune(m.hazardImmune, 'void', 'voidlost'), perks: [...m.perks, 'void-walkers'] }),
  },
  {
    // The legendary RAINBOW BALL (GS-rainbow): a glorious novelty that turns every hole into Rainbow
    // Road — the fairway & green become a rainbow ribbon through the stars and ANYTHING off the
    // fairway/bunkers/green is out of bounds. It deliberately BREAKS balance (any miss is OOB, no
    // recoverable rough) — that's the fun. Pure rest-geometry, no rng, default-off → byte-for-byte
    // unchanged for everyone who doesn't buy it. Expensive + legendary-scarce, so it's a rare splurge.
    id: 'rainbow-ball',
    name: 'Rainbow Ball',
    cost: 360,
    desc: 'Turns every hole into RAINBOW ROAD through the stars — the fairway & green are your rainbow ribbon, and anything off the fairway, bunkers or green is OUT OF BOUNDS. Gloriously unbalanced.',
    rarity: 'legendary',
    apply: (m) => ({ ...m, rainbowRoad: true, perks: [...m.perks, 'rainbow-ball'] }),
  },
  {
    // Laser rangefinder: a cheaper, non-caddy way to get the club suggestion affordances. Interactive-
    // only (the auto sim never reads clubSuggest), so it can't shift scoring/determinism.
    id: 'rangefinder',
    name: 'Laser Rangefinder',
    cost: 90,
    desc: 'Precise yardages on tap — shows a suggested club & the green front/middle/back read',
    rarity: 'rare',
    apply: (m) => ({ ...m, clubSuggest: true, perks: [...m.perks, 'rangefinder'] }),
  },
  {
    // Tour spikes (shoes): a modest, weaker lie relief — better footing out of the rough/sand. Uses
    // max() so it never downgrades Sandy's bigger relief; a clear, golf-themed escape upgrade.
    id: 'tour-spikes',
    name: 'Tour Spikes',
    cost: 110,
    desc: 'Aggressive cleats for a planted base — recover better from rough, sand & uneven lies',
    rarity: 'rare',
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.35), perks: [...m.perks, 'tour-spikes'] }),
  },
];

/** Add penalty kind(s) to a hazard-immunity list (GS-proshop-2), de-duplicated. Pure. */
function addImmune(cur: string[] | undefined, ...kinds: string[]): string[] {
  const set = new Set(cur ?? []);
  for (const k of kinds) set.add(k);
  return [...set];
}

/** All named-caddy shop-item ids (GS-caddy) — the unique, mutually-exclusive caddies. */
export const NAMED_CADDY_IDS: readonly string[] = SHOP_ITEMS.filter((i) => i.caddy === 'named').map((i) => i.id);

/** Is this a unique named caddy (only one ownable at a time)? */
export function isNamedCaddy(id: string): boolean {
  return NAMED_CADDY_IDS.includes(id);
}

/** Putting-specialist caddies (GS-caddy): Penelope auto-putts, Mystic Mole reads the green. They
 *  are the only caddies with a role on the putting screen — a distance/guard/short-game caddy has
 *  nothing to do with the putter, so the green shows none of them. */
export const PUTTING_CADDY_IDS: readonly string[] = ['auto-caddie', 'mystic-mole'];

/** Does this caddy actively help on the green (auto-putt or green-read)? */
export function isPuttingCaddy(id: string | undefined): boolean {
  return !!id && PUTTING_CADDY_IDS.includes(id);
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
  /**
   * Visual THEME of the set (GS-proshop-2): drives the procedural club art on the shop card AND the
   * glowing club head the golfer swings once the set is equipped. 'planet' (rare), 'phoenix' (epic),
   * 'solarstorm' (legendary). Render-only — the sim never reads it. Absent ⇒ plain starter look.
   */
  theme?: string;
  /** Accent colour for the set's theme (render-only) — the club-head glow + card art tint. */
  tint?: string;
  /**
   * If set, this set ALSO covers the PUTTER type, and a themed putter from it grants this much
   * `puttBoost` (a wider make-window). This is the clean way a SCORING-class reward is a genuine
   * improvement (the deferred "scoring upgrade via a real stat, not carry"): everyone owns a putter,
   * so a themed putter is only offered as a RARITY upgrade and its value is the better make-window —
   * never extra carry (a putter has none to overshoot with). Rarity-scaled (Planet < Phoenix < Solar).
   */
  puttBoost?: number;
}

// Reward club sets are now THEMED by rarity (GS-proshop-2), each with its own look (a procedural club
// art on the card + a glowing club head the golfer swings once it's equipped):
//   • rare      → "Planet"        (the planet line: tour distance woods + pro scoring irons)
//   • epic      → "Phoenix Flames" (the masters distance line)
//   • legendary → "Solar Storm"    (the apex distance line)
// The set IDs (tour/masters/pro/solar) are STABLE for save-compat; only the labels/themes are themed.
// Each THEME is now a COMPLETE set (woods + irons + wedges + a putter), so you can assemble a full
// themed bag (and the avatar swings its themed gear):
//   • Planet (rare)      = `tour` woods (+8 carry)  +  `pro` irons/wedges/putter (base carry)
//   • Phoenix (epic)     = `masters` woods (+16)  +  its own irons/wedges/putter (base carry)
//   • Solar Storm (leg.) = `solar` woods (+24)   +  its own irons/wedges/putter (base carry)
// CRITICAL balance: the carry bonus only ever lands on DISTANCE clubs (buildRewardClub gates on
// DISTANCE_CLUB_CARRY) — irons/wedges carry BASE (coverage, never overshoots, the power-cell lesson),
// proven by the `pro` tier. The PUTTER is the one scoring-class reward with a real stat (`puttBoost`,
// rarity-scaled) so it's a genuine, offerable improvement, not a same-carry cosmetic dupe. So masters
// and solar drop `distanceOnly` to also cover scoring + the putter; tour stays distance-only and the
// Planet scoring/putter line lives on `pro` (an internal split, invisible to the player — both read
// "Planet"). "later we can expand so different sets are better at different things" — the puttBoost
// per-tier is the first step of that; the theme/tint metadata is the seam for more (e.g. dispersion).
export const CLUB_SETS: readonly ClubSet[] = [
  // Legacy common 'starter' set — NO LONGER OFFERED (rewards are rare+ now). Kept resolvable so old
  // saves carrying a `club:starter:*` perk still rebuild it; the live bag's starting clubs are stamped
  // 'starter' directly by the character (buildStartBag), not drawn from here.
  { set: 'starter', label: '', rarity: 'common', carryBonus: 0, cost: 70, offerable: false },
  // 'tour' — the rare PLANET distance tier: a longer wood/long-hybrid that replaces your starter one
  // (a verified reach upgrade), or fills a missing distance club.
  { set: 'tour', label: 'Planet', rarity: 'rare', carryBonus: 8, cost: 150, distanceOnly: true, theme: 'planet', tint: '#5b8bd0' },
  // 'masters' — the epic PHOENIX FLAMES tier: distance woods (+16) PLUS scoring irons/wedges (base
  // carry) and a themed putter (a tidier make-window). A complete epic bag line.
  { set: 'masters', label: 'Phoenix', rarity: 'epic', carryBonus: 16, cost: 240, theme: 'phoenix', tint: '#ff7a3c', puttBoost: 0.16 },
  // 'pro' — the rare PLANET SCORING/PUTTER line: premium irons/wedges at base carry that fill the gaps
  // the balanced bag leaves (tighter distance control close in) plus a steadier Planet putter. Together
  // with `tour` woods this completes the rare Planet bag. Offered only for a type you lack / a putter
  // upgrade.
  { set: 'pro', label: 'Planet', rarity: 'rare', carryBonus: 0, cost: 120, scoringOnly: true, theme: 'planet', tint: '#5b8bd0', puttBoost: 0.10 },
  // 'solar' — the legendary SOLAR STORM tier: the apex distance woods (+24) PLUS scoring irons/wedges
  // (base carry) and the steadiest themed putter. The deep-run, complete legendary bag.
  { set: 'solar', label: 'Solar Storm', rarity: 'legendary', carryBonus: 24, cost: 360, theme: 'solarstorm', tint: '#ffd23c', puttBoost: 0.22 },
];

/**
 * Club TYPES (base club ids) that can appear as rewards. Two roles relative to the balanced 10-club
 * bag: DISTANCE clubs (D/3W/5W/2H) upgrade an owned one or fill a missing wood; SCORING clubs are
 * the long/mid irons the balanced bag skips (4H/3i/5i/7i/9i) — collecting them tightens the gaps so
 * you can dial distance in close to the green. Clubs everyone already carries (6i/8i/PW/GW/SW/60)
 * aren't here — a same-carry "premium" copy is no improvement. The PUTTER is the exception: everyone
 * carries one, but a themed putter is a real UPGRADE via its make-window (`puttBoost`), so it's offered
 * as a rarity upgrade — its value is the stat, never carry (see `ClubSet.puttBoost`).
 * (GS-clubs-3 retired the 7W/4i/AW/58° reward types along with their base clubs.)
 */
export const REWARD_CLUB_TYPES: readonly string[] = [
  'D', '3W', '5W', '2H', '4H', '3i', '5i', '7i', '9i', 'putter',
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

/**
 * The themed gear look the golfer should SWING with (GS-proshop-2): the highest-rarity THEMED club set
 * the bag currently carries (Planet < Phoenix Flames < Solar Storm), so buying a club set visibly
 * changes the club head the on-course golfer swings. Pure, render-only; returns undefined for a plain
 * starter bag. The renderer reads `theme`/`tint`; the sim never calls this.
 */
export interface GearTheme {
  theme: string;
  tint: string;
  rarity: Rarity;
}
export function equippedGearTheme(loadout: PlayerLoadout): GearTheme | undefined {
  let best: ClubSet | undefined;
  for (const c of loadout.bag) {
    const set = clubSetById(c.set);
    if (!set?.theme || !set.tint) continue;
    if (!best || RARITY_C[set.rarity].order > RARITY_C[best.rarity].order) best = set;
  }
  return best && best.theme && best.tint ? { theme: best.theme, tint: best.tint, rarity: best.rarity } : undefined;
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

/** Does a set generate an item for a club type? The PUTTER is covered only by a putter-capable set
 *  (one with `puttBoost`) — checked first, since a putter's tiny carry otherwise reads as "scoring".
 *  Then: a distance-only set (tour) covers distance clubs; the scoring-only set (pro) the irons/wedges;
 *  an unrestricted set (masters/solar — full themed bags) both distance and scoring. */
function setCoversType(set: ClubSet, type: string): boolean {
  if (type === 'putter') return set.puttBoost !== undefined;
  if (set.distanceOnly) return isDistanceType(type);
  if (set.scoringOnly) return isScoringType(type);
  return true; // unrestricted (distance + scoring; the putter is gated above)
}

/** Every reward club as a ShopItem (set × type). Generated once; apply() equips it into the bag. A
 *  distance-only set (tour) skips scoring-club types — a +carry upgrade there would overshoot; the
 *  scoring-only set (pro) skips distance clubs (base distance, value is coverage); a themed PUTTER also
 *  folds in the set's `puttBoost` (its make-window upgrade — the putter has no carry to upgrade). */
export const CLUB_ITEMS: readonly ShopItem[] = CLUB_SETS.flatMap((set) =>
  REWARD_CLUB_TYPES.filter((type) => setCoversType(set, type)).map((type): ShopItem => {
    const id = clubItemId(set.set, type);
    const base = clubById(type, CLUBS)!;
    const tierWord = set.rarity === 'common' ? 'A fresh' : `A ${set.rarity}`;
    const carry = base.carry + (isDistanceType(type) ? set.carryBonus : 0);
    const isPutt = type === 'putter';
    const desc = isPutt
      ? `${tierWord} ${set.label} putter — a steadier, wider make-window · equips into your bag`
      : `${tierWord} ${base.name} (~${carry} yd) · equips into your bag`;
    return {
      id,
      name: set.label ? `${set.label} ${base.name}` : base.name,
      cost: set.cost,
      desc,
      rarity: set.rarity,
      clubType: type,
      clubSet: set.set,
      apply: (m) => ({
        ...m,
        bag: equipClub(m.bag, buildRewardClub(set, type, m.distanceClubBonus ?? 0)),
        // A themed putter also raises the make-window (its real, non-carry upgrade); stacks like other
        // putter perks, and rebuilds deterministically because loadoutFromPerks replays each apply().
        puttBoost: isPutt && set.puttBoost ? (m.puttBoost ?? 0) + set.puttBoost : m.puttBoost,
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
 *  - a type you DO carry → offered only as a genuine UPGRADE: a higher-rarity DISTANCE club (more
 *    reach, no overshoot) OR a higher-rarity PUTTER (a wider make-window). A scoring iron/wedge you
 *    hold is never "upgraded" — its premium copy has the same carry, so it's no improvement (the
 *    power-cell lesson); the putter is the exception because its upgrade is a stat, not carry.
 */
export function offerableClubs(loadout: PlayerLoadout): ShopItem[] {
  // The default-bag tier (GS-bag-tiers) is a rarity FLOOR: once your starter bag is rare/epic/legendary,
  // the shop no longer dangles clubs BELOW that tier (a purple bag sees only purple+ clubs). Common
  // (the un-upgraded bag) is rank 0, so this filters nothing — byte-for-byte unchanged when off.
  const floor = rarityRank(loadout.bagTier);
  return CLUB_ITEMS.filter((it) => {
    if (clubSetById(it.clubSet)?.offerable === false) return false;
    if (rarityRank(it.rarity) < floor) return false;
    const type = it.clubType!;
    if (loadout.noHybrids && isHybridType(type)) return false;
    const cur = loadout.bag.find((c) => c.id === type);
    if (!cur) return true; // gap-fill: you don't carry this type
    // Owned → only a real upgrade: a higher-rarity distance club (reach) or putter (make-window).
    return (isDistanceType(type) || type === 'putter') && rarityRank(it.rarity) > rarityRank(cur.rarity);
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
  /** Upgrade only: a PUTTER upgrade — the gain is a steadier make-window, not yards. */
  putt?: boolean;
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
    // A putter's upgrade is its make-window (puttBoost), not carry — flag it so the UI reads right.
    if (item.clubType === 'putter') return { kind: 'upgrade', carry: reward.carry, putt: true };
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

/**
 * Boss-reward TALENTS (GS-talents) — free, run-scoped buffs you PICK after beating a boss (one of a few
 * thematic choices). They are ShopItems flagged `talent: true` and kept OUT of `SHOP_ITEMS`, so the
 * rotating shop never offers them; they're granted by the boss-reward screen and rebuilt from `perks`
 * on resume (via `shopItem`→`talentItem`), exactly like a bought perk. Each themed talent carries the
 * zone `archetype` it belongs to, so a boss in that world offers its signature power.
 */
export const TALENTS: readonly ShopItem[] = [
  // Generic — offered everywhere as the second choice.
  {
    id: 'talent-power', name: 'Cosmic Power', cost: 0, rarity: 'epic', talent: true,
    desc: '+12 yds on your distance clubs for the rest of the run.',
    apply: (m) => ({ ...m, bag: boostDistanceClubs(m.bag, 12), distanceClubBonus: (m.distanceClubBonus ?? 0) + 12, perks: [...m.perks, 'talent-power'] }),
  },
  {
    id: 'talent-precision', name: 'Steady Hands', cost: 0, rarity: 'epic', talent: true,
    desc: '10% tighter dispersion on every club.',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.9, perks: [...m.perks, 'talent-precision'] }),
  },
  {
    id: 'talent-fortune', name: 'Treasure Sense', cost: 0, rarity: 'rare', talent: true,
    desc: '+30% credits earned for the rest of the run.',
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.3, perks: [...m.perks, 'talent-fortune'] }),
  },
  {
    id: 'talent-putt', name: 'Golden Putter', cost: 0, rarity: 'epic', talent: true,
    desc: 'A far steadier putter — a much wider make window.',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.18, perks: [...m.perks, 'talent-putt'] }),
  },
  // Zone-themed — the FIRST choice on a boss in that world.
  {
    id: 'talent-ember', name: 'Ember Surge', archetype: 'inferno', cost: 0, rarity: 'epic', talent: true,
    desc: 'Forged in fire — +16 yds on your distance clubs.',
    apply: (m) => ({ ...m, bag: boostDistanceClubs(m.bag, 16), distanceClubBonus: (m.distanceClubBonus ?? 0) + 16, perks: [...m.perks, 'talent-ember'] }),
  },
  {
    id: 'talent-iceveins', name: 'Ice Veins', archetype: 'frost', cost: 0, rarity: 'epic', talent: true,
    desc: 'Cold-blooded under pressure — 12% tighter dispersion.',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.88, perks: [...m.perks, 'talent-iceveins'] }),
  },
  {
    id: 'talent-dunewalker', name: 'Dune Walker', archetype: 'desert', cost: 0, rarity: 'epic', talent: true,
    desc: 'A genius from the sand — recover far better from bad lies.',
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, SANDY_LIE_RELIEF), perks: [...m.perks, 'talent-dunewalker'] }),
  },
  {
    id: 'talent-voidfocus', name: 'Void Focus', archetype: 'void', cost: 0, rarity: 'epic', talent: true,
    desc: 'Eerie calm — trims every miss zone, so more shots find the green.',
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.03, sliceR: -0.03, duckHookL: -0.015, shankR: -0.015 }), perks: [...m.perks, 'talent-voidfocus'] }),
  },
  {
    id: 'talent-fairwaymaster', name: 'Fairway Master', archetype: 'verdant', cost: 0, rarity: 'epic', talent: true,
    desc: 'Parkland precision — 10% tighter and less coming up short.',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.9, minCarryBoost: m.minCarryBoost + 0.04, perks: [...m.perks, 'talent-fairwaymaster'] }),
  },
  // GS-worlds — themed talents for the four new worlds.
  {
    id: 'talent-prism', name: 'Prism Strike', archetype: 'crystal', cost: 0, rarity: 'epic', talent: true,
    desc: 'True off the crystal — 12% tighter dispersion.',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.88, perks: [...m.perks, 'talent-prism'] }),
  },
  {
    id: 'talent-stormrider', name: 'Storm Rider', archetype: 'tempest', cost: 0, rarity: 'epic', talent: true,
    desc: 'Born in the gale — steadier in wind (8% tighter) and +8 yds on distance clubs.',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.92, bag: boostDistanceClubs(m.bag, 8), distanceClubBonus: (m.distanceClubBonus ?? 0) + 8, perks: [...m.perks, 'talent-stormrider'] }),
  },
  {
    id: 'talent-mycelial', name: 'Mycelial Touch', archetype: 'fungal', cost: 0, rarity: 'epic', talent: true,
    desc: 'At home in the jungle — recover far better from the deep stuff.',
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, SANDY_LIE_RELIEF), perks: [...m.perks, 'talent-mycelial'] }),
  },
  {
    id: 'talent-tidecaller', name: 'Tide Caller', archetype: 'ocean', cost: 0, rarity: 'epic', talent: true,
    desc: 'Carry the sea with confidence — trims the wild miss zones so more shots find dry land.',
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.025, sliceR: -0.025, duckHookL: -0.02, shankR: -0.02 }), perks: [...m.perks, 'talent-tidecaller'] }),
  },
  // Ace reward (GS-ace) — granted ONLY by a hole-in-one, never offered at a boss. The `'ace'`
  // archetype is matched by no zone (inferno/frost/desert/void/verdant) and isn't `!archetype`
  // either, so `talentsForArchetype` excludes it from both the themed and generic boss draws.
  {
    id: 'talent-ace', name: "Ace's Touch", archetype: 'ace', cost: 0, rarity: 'legendary', talent: true,
    desc: 'A hole-in-one earns a touch you keep — 8% tighter dispersion (stacks with every ace).',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.92, perks: [...m.perks, 'talent-ace'] }),
  },
];

const talentById = new Map(TALENTS.map((t) => [t.id, t]));
/** Resolve a talent by id (GS-talents) — used by `shopItem` so a granted talent rebuilds from perks. */
export function talentItem(id: string): ShopItem | undefined {
  return talentById.get(id);
}
/** The themed talents for a zone archetype, plus the generics (GS-talents). */
export function talentsForArchetype(archetype: string): { themed: ShopItem[]; generic: ShopItem[] } {
  return {
    themed: TALENTS.filter((t) => t.archetype === archetype),
    generic: TALENTS.filter((t) => !t.archetype),
  };
}

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id) ?? clubItem(id) ?? talentItem(id);
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
