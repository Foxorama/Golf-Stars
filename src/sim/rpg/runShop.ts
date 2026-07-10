/**
 * The outfitter: shop + StarMart offers, the rarity-ramp schedules, and the purchase reducer
 * (extracted from run.ts, GS-refactor-split).
 *
 * The seeded, resume-stable Pro-Shop / StarMart stock draws, the depth- and voyage-keyed rarity
 * biases that reweight WHICH item is drawn (never the rng draw COUNT), and `buy`. Deterministic from
 * the run + stop; the sibling `runCourse`/`runLoadout`/`runFuel` modules supply the theme, base
 * loadout and tank helpers, and the only run dependency is the `Run` TYPE (erased at compile, so no
 * runtime import cycle). run.ts re-exports every public symbol here, so existing importers are
 * unchanged. Behaviour is byte-for-byte identical to when this lived inside run.ts — a pure move
 * (same seeds, same draw order).
 */

import { Rng } from '../rng';
import type { Rarity } from '../course/contract';
import { RARITY_C } from './loot';
import { getFormat, stopCount } from './formats';
import {
  DRIVER_ID,
  SHOP_ITEMS,
  canBuy,
  itemCap,
  itemCost,
  itemTags,
  loadoutFromPerks,
  namedCaddyOwned,
  offerableClubs,
  ownedCount,
  putterItemOfferable,
  shopItem,
  type ShopItem,
} from './economy';
import { itemThemeWeight } from '../course/themes';
import { currentTheme } from './runCourse';
import { baseLoadoutForRun } from './runLoadout';
import { tankCapacity } from './runFuel';
import type { Run } from './run';

/**
 * Buy a shop item. Uniques are buyable once; stackables repeatedly at a rising price up
 * to their cap. No-op (returns the same run) if at the cap or unaffordable at the next
 * price — the offer constraint is a UI concern, so the headless sim can buy any item.
 */
export function buy(run: Run, itemId: string): Run {
  const item = shopItem(itemId);
  if (!item) return run;
  const owned = ownedCount(run.loadout.perks, itemId);
  if (!canBuy(item, owned, run.credits)) return run;
  const cost = itemCost(item, owned);
  // Named caddies are still one-at-a-time (GS-caddy) — but hiring a NEW one now FIRES the incumbent
  // (GS-caddy-factions) rather than being a no-op. Rebuild the loadout WITHOUT the fired caddy's perk
  // (over the run's base), then apply the newcomer; the sacked caddy is logged so the shop won't
  // offer them again this run. The sim fires unconditionally (headless/auto ≡ interactive); the UI
  // gates it behind a "they won't be happy" confirmation before dispatching this.
  if (item.caddy === 'named') {
    const have = namedCaddyOwned(run.loadout.perks);
    if (have && have !== itemId) {
      const rebuilt = loadoutFromPerks(
        run.loadout.perks.filter((p) => p !== have),
        baseLoadoutForRun(run),
      );
      return {
        ...run,
        credits: run.credits - cost,
        loadout: item.apply(rebuilt),
        firedCaddies: run.firedCaddies.includes(have) ? run.firedCaddies : [...run.firedCaddies, have],
      };
    }
  }
  const loadout = item.apply(run.loadout);
  // GS-fuel-3: a fuel-granting item (the Reserve Tank arrives FULL) pours its units in ONCE, at
  // purchase, clamped to the (possibly just-raised) capacity — never re-granted on resume
  // (loadoutFromPerks rebuilds only the loadout; the fuel itself persists on Run.fuel), and never
  // draining a legacy over-capacity tank.
  let fuel = run.fuel;
  if (item.fuelBonus) {
    fuel = Math.max(run.fuel, Math.min(tankCapacity({ ...run, loadout }), run.fuel + item.fuelBonus));
  }
  return { ...run, credits: run.credits - cost, loadout, fuel };
}

// --- Shop offer (the rotating outfitter stock) ------------------------------

export interface ShopOffer {
  item: ShopItem;
  /** Price of the next copy right now. */
  cost: number;
  /** Copies already owned (stack depth; 0 or 1 for a unique). */
  owned: number;
}

export const SHOP_OFFER_SIZE = 4;

// Rarity RAMPS with the voyage (GS-proshop). The catalogue is count-skewed toward rare/epic, so a
// flat rarity-weighted draw showed lots of rare/epic up front and only dribbled commons in later as
// the rare/epic uniques sold out — exactly backwards from how loot should feel. Now each rarity's
// base drop weight (RARITY_C) is multiplied by `b^order`, where `b` lerps from <1 EARLY (commons-
// heavy foundational kit, epics/legendaries scarce) to >1 DEEP (rare/epic/legendary power), keyed
// off galaxy distance — the same depth signal the cut line ramps off. This shifts WHICH items are
// drawn, not the rng draw count, so the offer stays deterministic and resume-stable.
const RARITY_RAMP_DEPTH = 18; // galaxy distance at which the rarity tilt reaches its deep extreme
const RARITY_TILT_EARLY = 0.22; // tilt base at the start — strongly favours commons so the FIRST/SECOND Pro Shops stock foundational common/rare kit, not rare/epic. The catalogue + reward-club pool is heavily count-skewed toward rare/epic, so a low tilt is needed to keep the early draw common-dominant (measured ~61% common / 37% rare / 2% epic at stop 0, ramping to rare/epic-heavy deep).
const RARITY_TILT_DEEP = 2.15; // tilt base deep in the run — favours rare/epic/legendary (raised to surface more epic/legendary rewards)

/**
 * Depth-scaled rarity multiplier for the shop draw (early → commons, deep → rare/epic). Used by the
 * ENDLESS formats (flat/ladder), which climb toward the deep extreme as galaxy distance grows.
 */
export function rarityDepthBias(rarity: Rarity, distanceFromStart: number): number {
  const p = Math.max(0, Math.min(1, distanceFromStart / RARITY_RAMP_DEPTH));
  const b = RARITY_TILT_EARLY + (RARITY_TILT_DEEP - RARITY_TILT_EARLY) * p;
  return Math.pow(b, RARITY_C[rarity].order);
}

// The VOYAGE rarity schedule (GS-voyage-rarity). The bounded voyage is only ~8 shops long and never
// reaches the endless ramp's deep distance, so keying its rarity off raw galaxy distance left the last
// shop stuck around blue-heavy / 18% epic / 6% legendary — legendaries barely showed. Instead the
// voyage runs its OWN progress curve keyed off the STOP (the arc/boss structure the player actually
// reads), so the mix scales the way the campaign is paced:
//   • shop 1 (stop 0)         → mostly GREEN with a BLUE; epics/legendaries essentially absent.
//   • between boss 1 & 2 (2–4) → a SMALL chance of purple AND the first orange.
//   • after boss 2 (5–7)       → a HIGHER chance, ending "halfish blue / halfish purple with a shot at
//                                a legendary" at the final pre-boss shop.
// Two knobs give independent control the single `b^order` couples away: `b` lerps the rare/epic base,
// and `legTilt` gates the legendary tail separately so it stays a real rarity (a taste between the
// bosses, a genuine chance — not a flood — at the end). Bosses sit at stops 2 & 5, so the curve is
// sampled at those thresholds by design. Byte-for-byte irrelevant to the endless formats (they never
// call this) and to determinism (it reweights WHICH item is drawn, never the rng draw COUNT).
const VOYAGE_TILT_EARLY = 0.16; // rare/epic base at the first shop — strong commons bias (mostly green + a blue)
const VOYAGE_TILT_DEEP = 3.2; // rare/epic base at the last pre-boss shop — halfish blue / halfish purple
const VOYAGE_LEG_EARLY = 0.0; // legendary tail multiplier at the start — no legendaries in the opening shops
const VOYAGE_LEG_DEEP = 0.62; // legendary tail multiplier deep — a real (bounded) shot at orange late, not a flood
const VOYAGE_TILT_EASE = 1.5; // ease-in on the rare/epic ramp so arc 1 stays green/blue and purple opens after boss 1
const VOYAGE_LEG_OPEN = 0.12; // voyage progress at which the legendary tail starts opening (just after boss 1 / stop 2)

/**
 * Rarity multiplier for a VOYAGE shop draw, keyed off the stop (arc/boss pacing) rather than galaxy
 * distance. `progress` is 0 at the first shop → 1 at the final pre-boss shop. Commons stay flat (×1);
 * rare/epic ramp on `b^order`; the legendary tail rides a SEPARATE, later-opening multiplier so it
 * only tastes in around boss 1 and reaches a genuine (bounded) chance by the end.
 */
export function voyageRarityBias(rarity: Rarity, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const order = RARITY_C[rarity].order;
  if (order === 0) return 1; // commons flat
  const eased = Math.pow(p, VOYAGE_TILT_EASE);
  const b = VOYAGE_TILT_EARLY + (VOYAGE_TILT_DEEP - VOYAGE_TILT_EARLY) * eased;
  const base = Math.pow(b, order);
  if (rarity !== 'legendary') return base;
  // Legendary rides the rare/epic ramp PLUS its own tail gate: 0 until `VOYAGE_LEG_OPEN`, then lerps
  // up to VOYAGE_LEG_DEEP so orange opens around boss 1 and peaks (bounded) at the final shop.
  const lp = Math.max(0, Math.min(1, (p - VOYAGE_LEG_OPEN) / (1 - VOYAGE_LEG_OPEN)));
  return base * (VOYAGE_LEG_EARLY + (VOYAGE_LEG_DEEP - VOYAGE_LEG_EARLY) * lp);
}

/** Voyage shop progress 0..1 keyed off the stop — 0 at the first shop, 1 at the final pre-boss shop. */
export function voyageShopProgress(stopIndex: number, stops: number): number {
  // Shops sit at stops 0..(stops-2); the final stop is the boss with no shop after it.
  const lastShop = Math.max(1, stops - 2);
  return Math.max(0, Math.min(1, stopIndex / lastShop));
}

/**
 * The rarity multiplier the shop draw applies for THIS run. A winnable voyage uses its own stop-keyed
 * schedule (`voyageRarityBias`); the endless formats keep the galaxy-distance ramp (`rarityDepthBias`).
 */
export function shopRarityBias(run: Run, rarity: Rarity): number {
  const format = getFormat(run.formatId);
  if (format.winnable) {
    return voyageRarityBias(rarity, voyageShopProgress(run.stopIndex, stopCount(format)));
  }
  return rarityDepthBias(rarity, run.distanceFromStart);
}

/**
 * Weighted draw of `n` distinct items (rarer = less likely), without replacement. An optional
 * `weight` multiplier per item lets the active theme bias the offer toward on-theme gear (GS-17d).
 */
function weightedSample(
  rng: Rng,
  items: readonly ShopItem[],
  n: number,
  weight: (it: ShopItem) => number = () => 1,
): ShopItem[] {
  const pool = [...items];
  const out: ShopItem[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, it) => s + RARITY_C[it.rarity].weight * weight(it), 0);
    let r = rng.float() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= RARITY_C[pool[idx]!.rarity].weight * weight(pool[idx]!);
      if (r <= 0) break;
    }
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

/**
 * The outfitter's stock at the current stop: a seeded, rarity-weighted subset of the
 * catalogue. Deterministic from the run seed + stop, so the same run shows the same shop
 * (and a resume reproduces it). Items already maxed (owned uniques / capped stackables)
 * drop out, so every slot is something you can still pursue. Costs reflect current stacks.
 */
export function shopOffer(run: Run, size = SHOP_OFFER_SIZE, salt = 0): ShopOffer[] {
  const perks = run.loadout.perks;
  const hasCaddy = !!namedCaddyOwned(perks);
  // Driver Dan (GS-clubs) only turns up once the golfer actually OWNS a driver. Everyone now starts
  // with one (the balanced bag), so he's eligible from the off; he still only appears at his epic
  // rarity in the rotation, so owning a driver is a gate, not a guaranteed early show.
  const ownsDriver = run.loadout.bag.some((c) => c.id === DRIVER_ID);
  // Hide maxed items, gate prereq tier-ladders, and handle caddies (GS-caddy / GS-caddy-factions):
  // named caddies are random rarity-weighted inclusions, and they STAY offerable even once you've
  // hired one — hiring a new caddy FIRES the incumbent (a real swap decision), so the others must
  // keep showing. The one you already own drops out via the maxed check; a caddy you FIRED this run
  // never comes back (they're sulking). Generic caddy 'service' perks only surface once a named caddy
  // has been hired.
  const gear = SHOP_ITEMS.filter(
    (it) =>
      ownedCount(perks, it.id) < itemCap(it) &&
      (!it.prereq || perks.includes(it.prereq)) &&
      (it.caddy !== 'named' || !run.firedCaddies.includes(it.id)) &&
      (it.caddy !== 'service' || hasCaddy) &&
      (it.id !== 'driver-dan' || ownsDriver) &&
      // The Rainbow Ball, once SPENT on an Asgard tournament (GS-asgard), never returns to the rack
      // this run — the run has left Rainbow Road behind for good.
      (it.id !== 'rainbow-ball' || !run.rainbowConsumed) &&
      // Don't dangle a flat-stick putter you've already met (GS-clubs) — strict rarity upgrade only.
      putterItemOfferable(it, run.loadout),
  );
  // Reward CLUBS (GS-clubs-2) share the SAME 4-card offer now — no separate row. They're rare+
  // improvements (a distance upgrade, or a new club that fills a gap in the balanced bag), drawn
  // from the same rarity-weighted pool as the gear so they're appropriately scarce.
  const pool = [...gear, ...offerableClubs(run.loadout)];
  // A reroll (GS-shop-reroll) salts the seed so the draw changes; salt 0 keeps the original stock
  // byte-for-byte (so existing tests + a fresh shop entry are unchanged).
  const rng = new Rng(salt ? `${run.seed}:shop:${run.stopIndex}:r${salt}` : `${run.seed}:shop:${run.stopIndex}`);
  // The current stop's theme biases the outfitter toward on-theme gear (GS-17d), and the rarity mix
  // RAMPS with galaxy distance (GS-proshop): commons early, rare/epic/legendary deep.
  const archetype = currentTheme(run).archetype;
  const weight = (it: ShopItem) =>
    itemThemeWeight(itemTags(it.id), archetype) * shopRarityBias(run, it.rarity);
  return weightedSample(rng, pool, Math.min(size, pool.length), weight).map((item) => {
    const owned = ownedCount(perks, item.id);
    return { item, cost: itemCost(item, owned), owned };
  });
}

// --- StarMart: the trade-tent pop-up shop (GS-tent-interactions) -------------
// One of the five trade tents opens a StarMart window mid-hole — a shop that spends cross-run STAR
// SHARDS instead of run credits. It stocks only the good stuff (NO commons) and skews epic/legendary,
// at a flat shard price per rarity. Items last the run like any Pro-Shop buy (they round-trip through
// `loadout.perks`), so no save bump. The offer is a pure, seeded, resume-stable draw off the run + stop.

/** How many cards the StarMart window shows. */
export const STARMART_OFFER_SIZE = 4;
/** Flat StarMart shard price by rarity — blue 5, purple 10, orange 15 (commons never appear). */
export const STARMART_COST: Record<Rarity, number> = { common: 0, rare: 5, epic: 10, legendary: 15 };
/** Rarity draw boost for the StarMart — counteracts the catalogue's base scarcity so epic/legendary
 *  show up far more than in the credit Pro Shop (the "epic & legendary have a higher chance" ask). */
const STARMART_RARITY_BOOST: Record<Rarity, number> = { common: 0, rare: 1, epic: 5, legendary: 8 };
/** Shard cost of the next StarMart reroll (a gentle ramp). */
export function starmartRerollCost(rerolls: number): number {
  return 3 + Math.max(0, rerolls) * 2;
}

export interface ShardShopOffer {
  item: ShopItem;
  /** Price in STAR SHARDS (by rarity). */
  cost: number;
}

/**
 * The StarMart window's stock for the current stop (GS-tent-interactions): a seeded, rarity-weighted
 * draw over the Pro-Shop catalogue + reward clubs, with COMMONS excluded and epic/legendary boosted.
 * Priced in shards by rarity. Deterministic from the run seed + stop (a resume/re-open reproduces it);
 * a reroll salts the seed. Owned/maxed items and gated caddies drop out exactly like `shopOffer`.
 */
export function starmartOffer(run: Run, size = STARMART_OFFER_SIZE, salt = 0): ShardShopOffer[] {
  const perks = run.loadout.perks;
  const hasCaddy = !!namedCaddyOwned(perks);
  const ownsDriver = run.loadout.bag.some((c) => c.id === DRIVER_ID);
  const gear = SHOP_ITEMS.filter(
    (it) =>
      it.rarity !== 'common' &&
      ownedCount(perks, it.id) < itemCap(it) &&
      (!it.prereq || perks.includes(it.prereq)) &&
      (it.caddy !== 'named' || !run.firedCaddies.includes(it.id)) &&
      (it.caddy !== 'service' || hasCaddy) &&
      (it.id !== 'driver-dan' || ownsDriver) &&
      (it.id !== 'rainbow-ball' || !run.rainbowConsumed) && // spent on Asgard, never re-offered (GS-asgard)
      putterItemOfferable(it, run.loadout),
  );
  const clubs = offerableClubs(run.loadout).filter((c) => c.rarity !== 'common');
  const pool = [...gear, ...clubs];
  const rng = new Rng(salt ? `${run.seed}:starmart:${run.stopIndex}:r${salt}` : `${run.seed}:starmart:${run.stopIndex}`);
  const weight = (it: ShopItem) => STARMART_RARITY_BOOST[it.rarity];
  return weightedSample(rng, pool, Math.min(size, pool.length), weight).map((item) => ({
    item,
    cost: STARMART_COST[item.rarity],
  }));
}
