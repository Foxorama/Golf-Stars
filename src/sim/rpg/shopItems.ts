/**
 * Pro Shop item catalogue (extracted from economy.ts, GS-refactor-split).
 *
 * The full `SHOP_ITEMS` table + the named-caddy guard/shape constants it references + the
 * distance-club carry helpers + the `ITEM_TAGS` theme map. Pure data and pure functions; the
 * only economy dependency is the `PlayerLoadout` TYPE (erased at compile, so no runtime import
 * cycle). economy.ts re-exports every public symbol here, so existing importers are unchanged.
 * Behaviour is byte-for-byte the same as when this lived inside economy.ts — a pure move.
 */

import type { Club } from '../clubs';
import type { FlightClass } from '../flight';
import type { Rarity } from '../course/contract';
import { combineShapeMods, type CaddyGuard, type ShapeMod } from '../shot';
import type { PlayerLoadout } from './economy';

/**
 * Add carry to the DISTANCE clubs only (the woods/long hybrids you hit off the tee or
 * for a long second). Boosting scoring clubs too would make the "reach" approach AI
 * overshoot greens and score *worse* — a power-up must feel like an upgrade.
 */
export const DISTANCE_CLUB_CARRY = 185;
export function boostDistanceClubs(bag: Club[], add: number): Club[] {
  return bag.map((c) => (c.carry >= DISTANCE_CLUB_CARRY ? { ...c, carry: c.carry + add } : { ...c }));
}

/** Immutably add `amt` to a club FAMILY's min-carry boost (GS-proshop-distance-items). Pure; the
 *  category-specific Pro Shop control items fold through this so a rebuild-from-perks is exact. */
export function addFamilyMinCarry(
  cur: Partial<Record<FlightClass, number>> | undefined,
  cls: FlightClass,
  amt: number,
): Partial<Record<FlightClass, number>> {
  return { ...(cur ?? {}), [cls]: (cur?.[cls] ?? 0) + amt };
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
  /** Fuel units granted ONCE at purchase (GS-fuel-3, the Reserve Tank arrives full): run.ts `buy`
   *  pours them in clamped to the new capacity. Deliberately NOT part of `apply` — resume rebuilds
   *  the loadout from perk ids, but the fuel itself persists on `Run.fuel`, so re-applying would
   *  double-grant. */
  fuelBonus?: number;
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
// Buffed to legendary strength (GS-caddy-factions): every named caddy is now a legendary, so the four
// that used to be epic (Sam/Sandy/Mole/Dan) get a small bump to stand shoulder-to-shoulder with the
// others — more "which legendary do I want" choice, less "Dan's just the one that showed up".
export const SAM_CONFIDENCE: ShapeMod = { hookL: -0.045, sliceR: -0.045, duckHookL: -0.022, shankR: -0.022 };

/** Sandy the Sand-Saver's lie relief (GS-mux, buffed GS-caddy-factions): recover ~72% of the way back
 *  to a neutral lie from rough/sand/waste/trees — a legendary escape artist without trivialising trouble. */
export const SANDY_LIE_RELIEF = 0.72;
/** Mystic Mole's manual-putt boost (GS-mux, buffed GS-caddy-factions): a strong make-band/lag lift on
 *  the existing putt-skill field, so manual putting sinks far more — a legendary green read. */
export const MOLE_PUTT_BOOST = 0.38;
/** Driver Dan's carry bump (GS-caddy-factions): a Long Haul Trucker hauls the ball further — his big
 *  stick adds yards to your distance clubs on top of letting you swing it from anywhere. */
export const DRIVER_DAN_CARRY = 12;

/** The Prognostic Parrot's foresight proc (GS-caddy-parrot): the per-full-swing chance the pirate
 *  captain SEES the shot before it happens, so you take a second swing of your OWN golfer and keep the
 *  better ball (the scramble effect). A 33% chance — a legendary swing without being a free re-roll. */
export const PARROT_PREVIEW_CHANCE = 0.33;

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
  'green-reading-book': ['putting'],
  'putting-grip': ['putting'],
  'mallet-putter': ['putting'],
  'tour-putter': ['putting'],
  'pinseeker-putter': ['putting'],
  // Mystic Mole (GS-mux) reads the greens — tagged 'putting' (was missing, so green-themed stops
  // never boosted him alongside the putters).
  'mystic-mole': ['putting'],
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
  // Per-category distance control (GS-proshop-distance-items): precision within a family → 'control'.
  'distance-driver': ['control'],
  'distance-woods': ['control'],
  'distance-hybrids': ['control'],
  'distance-irons': ['control'],
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
  // Ship outfitting (GS-fuel-3) — travel economy, so 'economy'.
  'ion-thrusters': ['economy'],
  'reserve-tank': ['economy'],
  // GS-proshop-2 — new gameplay gear.
  'wind-cheater': ['control'], // weather forgiveness reads as control
  'spin-milled': ['skill'], // backspin/short-game touch
  'spin-guide': ['skill'], // backspin-line read + short-game touch
  'spin-computer': ['skill'], // full backspin-line read + short-game touch
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
    // The +carry is recorded on `distanceClubBonus` too (like the talents / Driver Dan), so a reward
    // club bought or salvaged LATER inherits this boost — otherwise a new club (even a higher tier one)
    // lands short of the starting distance clubs the boost already grew (the "legendary 3W shorter than
    // the epic 4W" bug). `boostDistanceClubs` grows the current bag; `distanceClubBonus` carries it forward.
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 12),
      dispersionMult: m.dispersionMult * 0.95,
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 12,
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
    desc: "The Fortune Cartel's lucky ball-marker — ride their luck for +20% credits earned",
    rarity: 'rare',
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.2, perks: [...m.perks, 'lucky-coin'] }),
  },
  {
    // Ship outfitting (GS-fuel-3): the travel-economy sibling pair. Ion Thrusters attack the BURN
    // (every jump −1 unit, min 1 — run.ts routeFuelCost), the Reserve Tank attacks the CAPACITY.
    // Both compound with GS-fuel-2's depth pricing: efficiency is worth more the deeper (dearer)
    // the fuel, so they're mid/late-run economy picks, not day-one auto-buys.
    id: 'ion-thrusters',
    name: 'Ion Thrusters',
    cost: 140,
    desc: 'A retrofit ion drive — every journey jump burns 1 less ⛽ (min 1), and your ship trails a luminous ion wake',
    rarity: 'epic',
    apply: (m) => ({ ...m, fuelEfficiency: (m.fuelEfficiency ?? 0) + 1, perks: [...m.perks, 'ion-thrusters'] }),
  },
  {
    id: 'reserve-tank',
    name: 'Reserve Fuel Tank',
    cost: 90,
    desc: 'A strapped-on auxiliary tank — +4 ⛽ capacity, delivered full',
    rarity: 'rare',
    fuelBonus: 4,
    apply: (m) => ({ ...m, tankBonus: (m.tankBonus ?? 0) + 4, perks: [...m.perks, 'reserve-tank'] }),
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
    // The common rung of the putting ladder (GS-putt-read): now the break line stops DEAD at your
    // confident read, a cheap read-extender is a putt upgrade you can FEEL on stop one. The small
    // puttBoost keeps it a real (if modest) upgrade for the headless auto sim too (contract 4) —
    // `puttReadBonus` itself is manual-putt only.
    id: 'green-reading-book',
    name: 'Green-Reading Book',
    cost: 70,
    desc: 'A dog-eared guide to the galaxy’s greens — your confident read line stretches 4y further',
    rarity: 'common',
    apply: (m) => ({
      ...m,
      puttReadBonus: (m.puttReadBonus ?? 0) + 4,
      puttBoost: (m.puttBoost ?? 0) + 0.05,
      perks: [...m.perks, 'green-reading-book'],
    }),
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
    desc: 'A stable counter-weighted mallet — a solid lift to your make window, lag & read range',
    rarity: 'rare',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.2, perks: [...m.perks, 'mallet-putter'] }),
  },
  {
    id: 'tour-putter',
    name: 'Tour Putter',
    cost: 170,
    desc: 'A precision flat-stick — a big lift to your make window & lag, reads the break further',
    rarity: 'epic',
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.26, perks: [...m.perks, 'tour-putter'] }),
  },
  {
    // The legendary flat-stick (GS-proshop-variety): the apex of the putting ladder, a general-use
    // legendary that isn't a named caddy — so a legendary is actually buyable deep in the voyage.
    id: 'pinseeker-putter',
    name: 'Pinseeker Putter',
    cost: 340,
    desc: 'A face-milled precision blade — the steadiest stroke & longest break read in the galaxy',
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
    cost: 260,
    desc: 'Hand Dan the big stick anywhere — play your driver from ANY lie at full power, plus +12 yds on your distance clubs',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({
      ...m,
      driverAnywhere: true,
      bag: boostDistanceClubs(m.bag, DRIVER_DAN_CARRY),
      distanceClubBonus: (m.distanceClubBonus ?? 0) + DRIVER_DAN_CARRY,
      perks: [...m.perks, 'driver-dan'],
    }),
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
    cost: 260,
    desc: 'Reads the yardage & hands you the club — commit to his pick and swing freer (a big lift in great shots)',
    rarity: 'legendary',
    caddy: 'named',
    apply: (m) => ({ ...m, clubSuggest: true, confidenceMod: SAM_CONFIDENCE, perks: [...m.perks, 'suggestible-sam'] }),
  },
  {
    id: 'sandy-sandsaver',
    name: 'Sandy the Sand-Saver',
    cost: 290,
    desc: 'A grizzled escape artist — recover from rough, sand, waste & trees with far less distance & spray lost',
    rarity: 'legendary',
    caddy: 'named',
    // GS-mux escape specialist: softens a BAD lie's carry + dispersion penalty toward neutral.
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, SANDY_LIE_RELIEF), perks: [...m.perks, 'sandy-sandsaver'] }),
  },
  {
    id: 'mystic-mole',
    name: 'Mystic Mole',
    cost: 280,
    desc: 'Lives under the greens & reads every break — he aims your putt on the perfect line, you judge the pace',
    rarity: 'legendary',
    caddy: 'named',
    // GS-greens-3: READS THE BREAK — the putt UI snaps your aim to the slope-compensated line + draws
    // the read, so a sidehill putt is taken care of for you. Plus the make-band/lag boost he always had.
    apply: (m) => ({ ...m, greenRead: true, puttBoost: (m.puttBoost ?? 0) + MOLE_PUTT_BOOST, perks: [...m.perks, 'mystic-mole'] }),
  },
  {
    id: 'prognostic-parrot',
    name: 'Prognostic Parrot',
    cost: 300,
    desc: 'A pirate captain who foresees the shot — 33% chance to play it TWICE (both your own swing) & keep the better',
    rarity: 'legendary',
    caddy: 'named',
    // GS-caddy-parrot (Space Bandits): a per-shot chance to FORESEE the swing → take two balls (both
    // the player's own golfer) and keep the better — the scramble effect, self-partnered. Only ever
    // raises scoring (best-of-two ≥ solo), so it can't trip the death-spiral bar.
    apply: (m) => ({ ...m, previewScramble: Math.max(m.previewScramble ?? 0, PARROT_PREVIEW_CHANCE), perks: [...m.perks, 'prognostic-parrot'] }),
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
    desc: "The Sponsors' Syndicate bankrolls your voyage — +15% credits earned",
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
      // Carry the +12 forward so later reward clubs inherit it too (see Power Cell / GS-clubs).
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 12,
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

  // --- Per-category distance control (GS-proshop-distance-items) -------------------------------
  // Each raises the MIN carry of ONE club family toward its max — a lot more control over where the
  // ball lands and stops, category by category. Woods/Hybrids/Irons are pure precision (no downside to
  // their family). The Driver keeps its MAX carry (average even rises), but its power gesture FLOORS at
  // the raised min — you get fine control over a high carry band, and the trade-off is you can't dial
  // the driver short (switch clubs to lay up around a hazard or on a short hole).
  {
    id: 'distance-driver',
    name: 'Grooved Driver Face',
    cost: 180,
    desc: "A deep-milled driver face — grooves your driver into a tight high-carry band (min carry way up, max unchanged). The catch: you can't hit it short, so club down to lay up",
    rarity: 'epic',
    apply: (m) => ({
      ...m,
      minCarryBoostByClass: addFamilyMinCarry(m.minCarryBoostByClass, 'driver', 0.18),
      // The power gesture now spans [0.84·full, full] — 1% power ≈ the raised min carry, so short driver
      // shots are off the table. `Math.max` keeps a rebuild-from-perks idempotent (never stacks lower).
      driverPowerFloor: Math.max(m.driverPowerFloor ?? 0, 0.84),
      perks: [...m.perks, 'distance-driver'],
    }),
  },
  {
    id: 'distance-woods',
    name: 'Matched Fairway Woods',
    cost: 110,
    desc: 'Length-matched fairway woods — raises your MIN wood carry so long woods land where you aim, no trade-off',
    rarity: 'rare',
    apply: (m) => ({
      ...m,
      minCarryBoostByClass: addFamilyMinCarry(m.minCarryBoostByClass, 'wood', 0.13),
      perks: [...m.perks, 'distance-woods'],
    }),
  },
  {
    id: 'distance-hybrids',
    name: 'Tuned Hybrid Set',
    cost: 110,
    desc: 'Weight-tuned hybrids — raises your MIN hybrid carry so rescue clubs stop coming up short, no trade-off',
    rarity: 'rare',
    apply: (m) => ({
      ...m,
      minCarryBoostByClass: addFamilyMinCarry(m.minCarryBoostByClass, 'hybrid', 0.13),
      perks: [...m.perks, 'distance-hybrids'],
    }),
  },
  {
    id: 'distance-irons',
    name: 'Blueprint Iron Set',
    cost: 170,
    desc: 'Precision-forged blueprint irons — raises your MIN iron carry so approaches hold their number, no trade-off',
    rarity: 'epic',
    apply: (m) => ({
      ...m,
      minCarryBoostByClass: addFamilyMinCarry(m.minCarryBoostByClass, 'iron', 0.16),
      perks: [...m.perks, 'distance-irons'],
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
      // Carry the +24 forward so a reward club bought after the Nova inherits it (see Power Cell / GS-clubs).
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 24,
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
    desc: "The Birdie Hunters' bounty — +28 credits for every birdie-or-better you hole each stop",
    rarity: 'rare',
    apply: (m) => ({ ...m, birdieCredit: (m.birdieCredit ?? 0) + 28, perks: [...m.perks, 'birdie-hunter'] }),
  },
  {
    id: 'eagle-eye',
    name: 'Eagle Eye',
    cost: 160,
    desc: "The Eagle Order's bounty — +60 credits on top for every EAGLE-or-better you hole each stop",
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
    // The common rung of the backspin-line ladder (GS-backspin-line): with contoured greens + spin
    // gear an approach's check-back is hard to judge, so the shot screen now draws a SHORT roll/check
    // guide line. This card stretches that confident read AND rips a little more spin (a small
    // backspinBoost keeps it a real upgrade for the headless auto sim too — the Green-Reading-Book
    // pattern). `spinReadBonus` itself is render-only.
    id: 'spin-guide',
    name: 'Spin Guide Card',
    cost: 70,
    desc: 'A wedge yardage-book — extends the approach roll/check line + rips a touch more backspin',
    rarity: 'common',
    apply: (m) => ({
      ...m,
      spinReadBonus: (m.spinReadBonus ?? 0) + 4,
      backspinBoost: (m.backspinBoost ?? 0) + 0.04,
      perks: [...m.perks, 'spin-guide'],
    }),
  },
  {
    // The apex of the backspin-line ladder (GS-backspin-line): a rangefinder that computes the WHOLE
    // predicted roll — every yard of check and contour curl, right to where it settles — so a big spinning
    // approach on a wild contoured green reads all the way home. Full read (like the Mystic Mole's break
    // read), plus a little more spin so it's a genuine short-game upgrade for the auto sim (contract 4).
    id: 'spin-computer',
    name: 'Spin Trajectory Computer',
    cost: 150,
    desc: 'Computes the FULL approach roll — reads the whole check + contour curl to where it stops',
    rarity: 'rare',
    apply: (m) => ({
      ...m,
      spinReadFull: true,
      backspinBoost: (m.backspinBoost ?? 0) + 0.05,
      perks: [...m.perks, 'spin-computer'],
    }),
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
    desc: 'Race the rainbow road at your own peril! Warning: unbalanced course. Travel here only if you are worthy…',
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
