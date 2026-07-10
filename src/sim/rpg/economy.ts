/**
 * Run economy — content-as-data formulas and the shop table.
 *
 * The fail gate is a golf "cut line": a minimum Stableford each stop, ramping with
 * galaxy distance. Beat it to travel on; miss it and the run ends. Credits (earned from
 * Stableford) buy loadout upgrades between stops. All pure & deterministic.
 */

import { CLUBS, clubById, type Club } from '../clubs';
import type { FlightClass } from '../flight';
import type { Rarity } from '../course/contract';
import { combineShapeMods, type CaddyGuard, type ShapeMod } from '../shot';
import { DEFAULT_MANUAL_BAND, DEFAULT_PUTT_RANGE } from '../round';
import { RARITY_C } from './loot';

// The Pro Shop item catalogue now lives in shopItems.ts (GS-refactor-split). Import the pieces
// economy uses internally, and re-export the whole catalogue surface so existing importers of
// this module keep resolving these symbols from '../rpg/economy' unchanged.
import {
  DISTANCE_CLUB_CARRY,
  boostDistanceClubs,
  SHOP_ITEMS,
  SANDY_LIE_RELIEF,
  STACK_COST_GROWTH,
} from './shopItems';
import type { ShopItem } from './shopItems';
export {
  DISTANCE_CLUB_CARRY,
  boostDistanceClubs,
  addFamilyMinCarry,
  SPACE_DUCKS_GUARD,
  CONVICT_SHEEP_GUARD,
  SAM_CONFIDENCE,
  SANDY_LIE_RELIEF,
  MOLE_PUTT_BOOST,
  DRIVER_DAN_CARRY,
  PARROT_PREVIEW_CHANCE,
  STACK_COST_GROWTH,
  ITEM_TAGS,
  itemTags,
  SHOP_ITEMS,
} from './shopItems';
export type { ShopItem } from './shopItems';

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

/** Holed eagle-or-better holes in a played stop (an ace counts) — GS-fuel-3's fuel siphon reads it
 *  in `finishStop`. Picked-up holes never qualify. Pure. */
export function eagleCount(
  played: readonly { record: { par: number; strokes: number }; holed: boolean; pickedUp: boolean }[],
): number {
  return played.reduce(
    (n, p) => n + (p.holed && !p.pickedUp && p.record.strokes <= p.record.par - 2 ? 1 : 0),
    0,
  );
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
   * Prognostic Parrot caddy foresight (GS-caddy-parrot): 0..1, the per-full-swing chance the parrot
   * FORESEES the shot — you take a SECOND swing of your own golfer (both balls are your character's) and
   * keep the better (the scramble effect). Threaded IDENTICALLY through the auto sim (playHole/playStop)
   * and the interactive driver (the reducer's shot/auto-finish paths) so auto≡interactive holds: the
   * proc + partner draws fire ONLY when armed, so undefined/0 is byte-for-byte unchanged. Rebuilt from
   * perks on resume (no save bump).
   */
  previewScramble?: number;
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
   * Per-club-FAMILY min-carry boost (GS-proshop-distance-items): the category-specific Pro Shop
   * control items (Driver / Woods / Hybrids / Irons) each raise the lower carry clamp of just their
   * family, on TOP of the family-agnostic `minCarryBoost`. Keyed by `FlightClass`. Absent/empty = none,
   * so a base loadout is byte-for-byte unchanged; rebuilt from perk ids on resume (no save bump).
   */
  minCarryBoostByClass?: Partial<Record<FlightClass, number>>;
  /**
   * Driver power-floor (GS-proshop-distance-items, Grooved Driver Face): 0..1 fraction of full carry the
   * driver's power gesture FLOORS at — the power range becomes [floor·full, full], so 1% power lands at
   * the raised min carry and full power at the max (max carry UNCHANGED). The trade-off is you can't dial
   * the driver short — you switch clubs to lay up around a hazard or on a short hole. Interactive-only in
   * effect (the auto sim plays full swings → remap no-op); 0/undefined = no floor (byte-for-byte).
   */
  driverPowerFloor?: number;
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
   * Extra yards of confident putt READ range (GS-putt-read, Green-Reading Book): added straight onto
   * `puttSkillOf`'s `puttRange`, so the drawn break line reaches further AND the full make band holds
   * deeper into a long putt (the range is one number the resolver and the picture share — contract 5).
   * Rebuilt from perks on resume (no save bump). Manual-putt only (`onePutt` never reads the range);
   * items carrying it pair it with a small `puttBoost` so the auto sim still gains. 0/undefined = base.
   */
  puttReadBonus?: number;
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
  /**
   * Ion Thrusters (GS-fuel-3): fuel units shaved off EVERY journey jump's burn — a jump always
   * costs at least 1 (run.ts `routeFuelCost`). Travel economy only, never shot physics; the
   * journey map draws the retrofit's ion wake off this flag. Rebuilt from the perk id on resume
   * (no save bump). 0/undefined = full burn, byte-for-byte unchanged.
   */
  fuelEfficiency?: number;
  /**
   * Reserve Tank (GS-fuel-3): extra ship-tank CAPACITY on top of the format's base tank (run.ts
   * `tankCapacity`). The relic arrives FULL via `ShopItem.fuelBonus` (granted once in `buy` — the
   * fuel itself lives on `Run.fuel`, already persisted). 0/undefined = base tank.
   */
  tankBonus?: number;
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
): { makeChance?: number; lagFrac?: number; lagSd?: number; manualBand?: number; puttRange?: number } {
  const boost = loadout.puttBoost ?? 0;
  const readBonus = loadout.puttReadBonus ?? 0;
  const caddie = loadout.perks.includes('auto-caddie');
  if (boost === 0 && readBonus === 0 && !caddie) return {};
  // Auto-Caddie is a solid baseline on top of any putter upgrades (preserves its ~0.92 make).
  const b = caddie ? Math.max(boost, 0.6) : boost;
  return {
    makeChance: Math.min(0.98, 0.85 + b * 0.13),
    lagFrac: Math.max(0.03, 0.07 - b * 0.035),
    lagSd: Math.max(0.02, 0.05 - b * 0.03),
    manualBand: Math.min(0.4, DEFAULT_MANUAL_BAND + b * 0.18),
    // GS-putt-depth: a better putter READS and HOLES from further — its confident range extends with
    // the boost, so the make band stays wide (and the break line stays solid) deeper into a long putt.
    // The cap is 1.0 (GS-putt-read, was 0.7): now the break line STOPS DEAD at the range, a stacked
    // putter build must keep visibly stretching it. `puttReadBonus` (Green-Reading Book) adds on top.
    puttRange: DEFAULT_PUTT_RANGE + Math.min(1, b) * 12 + readBonus,
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
    // A DISTANCE club's real carry depends on the buyer's distance boosts (distanceClubBonus), which this
    // static catalogue can't see — so the fixed `carry` here would understate an upgraded bag and read as
    // "the higher-tier club hits shorter". The loadout-aware yardage lives on the shop card BADGE
    // (clubOfferNote); the desc states it only for SCORING clubs, where the carry is boost-independent.
    const desc = isPutt
      ? `${tierWord} ${set.label} putter — a steadier, wider make-window · equips into your bag`
      : isDistanceType(type)
        ? `${tierWord} ${base.name} · equips into your bag`
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
 * The standalone "flat-stick" putter items — the shop putter LADDER whose value is a wider make-window
 * (`puttBoost`). Unlike the reward-club putters (gated by `offerableClubs`), these are plain SHOP_ITEMS,
 * so nothing stopped the shop offering one you'd effectively already outgrown: a player holding an epic
 * bag putter (or the legendary Pinseeker) was still dangled the epic Tour Putter, which reads as a
 * duplicate ("an epic putter for sale when I already have an epic putter"). Kept as an explicit list so
 * the read-range Book and the green-reading caddies (also 'putting'-tagged) are never mistaken for one.
 */
export const FLATSTICK_ITEM_IDS: readonly string[] = ['putting-grip', 'mallet-putter', 'tour-putter', 'pinseeker-putter'];

/**
 * The rarity rank of the best putter the loadout already holds — the equipped bag putter AND any owned
 * flat-stick item. The shop offers a flat-stick only as a STRICT rarity upgrade over this, mirroring the
 * reward-club putter rule and the `bagTier` floor (a purple bag already flooring reward clubs): a putter
 * you effectively own is never dangled again.
 */
export function putterFloorRank(loadout: PlayerLoadout): number {
  let rank = 0;
  const bagPutter = loadout.bag.find((c) => c.id === 'putter');
  if (bagPutter) rank = Math.max(rank, rarityRank(bagPutter.rarity));
  for (const id of loadout.perks ?? []) {
    if (FLATSTICK_ITEM_IDS.includes(id)) {
      const it = SHOP_ITEMS.find((s) => s.id === id);
      if (it) rank = Math.max(rank, rarityRank(it.rarity));
    }
  }
  return rank;
}

/**
 * Is a shop item offerable given the player's putter holdings (GS-clubs)? Every non-flat-stick item
 * passes; a flat-stick putter passes only when its rarity beats every putter already in the bag/owned,
 * so the shop stops re-offering a putter tier you've already met. Pure — the offer filters call it.
 */
export function putterItemOfferable(item: ShopItem, loadout: PlayerLoadout): boolean {
  if (!FLATSTICK_ITEM_IDS.includes(item.id)) return true;
  return rarityRank(item.rarity) > putterFloorRank(loadout);
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
  // Odin's Favour (GS-asgard) — the victory prize for winning the Asgard tournament. Granted ONLY by the
  // reducer on an Asgard win (its `'asgard'` archetype is matched by no real zone, so `talentsForArchetype`
  // never offers it at a boss). A god's blessing of BOTH power and precision — +14 yds on the distance
  // clubs and 10% tighter dispersion — kept for the rest of the run and rebuilt from `perks` on resume.
  {
    id: 'talent-odins-favour', name: "Odin's Favour", archetype: 'asgard', cost: 0, rarity: 'legendary', talent: true,
    desc: "The Allfather's blessing — +14 yds on your distance clubs and 10% tighter dispersion for the rest of the run.",
    apply: (m) => ({ ...m, bag: boostDistanceClubs(m.bag, 14), distanceClubBonus: (m.distanceClubBonus ?? 0) + 14, dispersionMult: m.dispersionMult * 0.9, perks: [...m.perks, 'talent-odins-favour'] }),
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
