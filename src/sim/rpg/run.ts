/**
 * Run state machine — the roguelike spine (GS-2).
 *
 * travel → arrive at a rarity-graded course → play it for credits → spend on loadout
 * upgrades → travel further as wildness/cut-line scale up, until you miss a cut and the
 * run ends. Pure, deterministic, headless: a seed plays the same run every time, so a
 * whole run is simulated and asserted in tests.
 *
 * State transitions: startRun → [playStop → (buy*) → travel]* until status 'ended'.
 */

import { Rng } from '../rng';
import { generateCourse } from '../course/generate';
import { playCourse, type PlayedHole } from '../round';
import { playTotals } from '../score';
import type { Course, Rarity } from '../course/contract';
import {
  SHOP_ITEMS,
  canBuy,
  creditsForStop,
  cutLine,
  itemCap,
  itemCost,
  loadoutFromPerks,
  netDispersion,
  ownedCount,
  shopItem,
  type PlayerLoadout,
  type ShopItem,
} from './economy';
import { RARITY_C } from './loot';
import { DEFAULT_FORMAT, getFormat, stopSpecFor } from './formats';
import { metaStartingCredits, metaStartingLoadout, type MetaUpgrades } from './meta';
import { DEFAULT_EVENT, drawRouteEvents, routeEvent, type RouteEvent } from './events';

export type RunStatus = 'active' | 'ended';
export type EndReason = 'cut' | 'banked';

export interface StopResult {
  stopIndex: number;
  distanceFromStart: number;
  biome: string;
  rarity: Rarity;
  stableford: number;
  gross: number;
  /** The cut line that had to be beaten. */
  cut: number;
  passed: boolean;
  creditsEarned: number;
}

export interface Route {
  id: number;
  /** How far this route jumps (adds to distanceFromStart → scales difficulty). */
  distanceJump: number;
  label: string;
  /** The risk/reward event waiting at the stop this route reaches (GS-14). */
  event: RouteEvent;
}

export interface Run {
  seed: number;
  /** Run format id (run shape). See formats.ts. */
  formatId: string;
  /** Which stop we're at (0-based). */
  stopIndex: number;
  distanceFromStart: number;
  credits: number;
  loadout: PlayerLoadout;
  /** Permanent meta-upgrade levels baked into this run's start (GS-12). Kept for resume. */
  meta: MetaUpgrades;
  /**
   * The route event applied to the CURRENT stop (GS-14) — set by `travel`, consumed (and
   * cleared) by `finishStop`. Absent at stop 0 / after scoring → the neutral DEFAULT_EVENT.
   */
  pendingEvent?: RouteEvent;
  status: RunStatus;
  endedReason?: EndReason;
  history: StopResult[];
}

export function startRun(
  seed: number | string,
  formatId: string = DEFAULT_FORMAT,
  meta: MetaUpgrades = {},
): Run {
  const rng = new Rng(seed);
  return {
    seed: rng.seed,
    formatId,
    stopIndex: 0,
    distanceFromStart: 0,
    // Permanent meta-progression bakes into the starting credits + loadout (GS-12).
    credits: metaStartingCredits(meta),
    loadout: metaStartingLoadout(meta),
    meta,
    status: 'active',
    history: [],
  };
}

/** Deterministic seed for the course at the current stop. */
export function stopSeed(run: Run): string {
  return `${run.seed}:stop:${run.stopIndex}`;
}

/** The course awaiting the player at the current stop (shaped by the run format). */
export function currentCourse(run: Run): Course {
  const spec = stopSpecFor(getFormat(run.formatId), run.stopIndex);
  return generateCourse(stopSeed(run), {
    holes: spec.holes,
    parCap: spec.parCap,
    distanceFromStart: run.distanceFromStart,
  });
}

/**
 * Play the current stop's course with the run's loadout. Adds credits if the cut is
 * made; ends the run (reason 'cut') if it's missed.
 */
/**
 * Compute a stop's result (cut, credits, run status) from the played holes. Shared by
 * the auto playStop and the interactive driver so both score identically.
 */
export function finishStop(
  run: Run,
  course: Course,
  played: PlayedHole[],
): { run: Run; result: StopResult } {
  const totals = playTotals(played.map((p) => p.record));
  // The pending route event shifts this stop's cut + payout (GS-14); neutral if none.
  const event = run.pendingEvent ?? DEFAULT_EVENT;
  const cut = effectiveCut(run, course.holes.length);
  const passed = totals.stableford >= cut;
  const creditsEarned = passed
    ? creditsForStop(totals.stableford, run.loadout.creditMult * event.creditMult)
    : 0;

  const result: StopResult = {
    stopIndex: run.stopIndex,
    distanceFromStart: run.distanceFromStart,
    biome: course.biome,
    rarity: course.rarity,
    stableford: totals.stableford,
    gross: totals.gross,
    cut,
    passed,
    creditsEarned,
  };

  const next: Run = {
    ...run,
    credits: run.credits + creditsEarned,
    history: [...run.history, result],
    // The event is spent — clear it so a resume can't double-apply it next stop.
    pendingEvent: undefined,
    status: passed ? 'active' : 'ended',
    ...(passed ? {} : { endedReason: 'cut' as const }),
  };
  return { run: next, result };
}

/**
 * The Stableford the current stop demands — the distance-ramped cut line plus the pending
 * route event's `cutDelta` (GS-14). One source of truth for `finishStop` and the UI banner.
 */
export function effectiveCut(run: Run, holes: number): number {
  const event = run.pendingEvent ?? DEFAULT_EVENT;
  return cutLine(run.distanceFromStart, holes) + event.cutDelta;
}

export function playStop(run: Run): { run: Run; result: StopResult; played: PlayedHole[] } {
  if (run.status !== 'active') throw new Error('playStop: run is not active');
  const course = currentCourse(run);
  const rng = new Rng(`${course.seed}:play`);
  const played = playCourse(course.holes, rng, {
    bag: run.loadout.bag,
    dispersionMult: netDispersion(run.loadout),
  });
  const { run: next, result } = finishStop(run, course, played);
  return { run: next, result, played };
}

/** The onward routes offered after a stop. Deterministic from the run + stop. */
export function routeOptions(run: Run): Route[] {
  const rng = new Rng(`${run.seed}:routes:${run.stopIndex}`);
  const labels: Record<number, string> = { 1: 'Short hop', 2: 'Cruise', 3: 'Deep jump' };
  // Draw distances FIRST (unchanged RNG stream), then attach an event to each route.
  const routes = Array.from({ length: 3 }, (_, i) => {
    const distanceJump = rng.int(1, 3);
    return { id: i, distanceJump, label: labels[distanceJump]! };
  });
  const events = drawRouteEvents(rng, routes.length);
  return routes.map((r, i) => ({ ...r, event: events[i]! }));
}

/** Travel a chosen route to the next stop (deeper = harder, better rewards). */
export function travel(run: Run, route: Route): Run {
  if (run.status !== 'active') throw new Error('travel: run is not active');
  return {
    ...run,
    stopIndex: run.stopIndex + 1,
    distanceFromStart: run.distanceFromStart + route.distanceJump,
    // Carry the chosen route's event into the next stop (applied by finishStop).
    pendingEvent: route.event,
  };
}

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
  return { ...run, credits: run.credits - cost, loadout: item.apply(run.loadout) };
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

/** Weighted draw of `n` distinct items (rarer = less likely), without replacement. */
function weightedSample(rng: Rng, items: readonly ShopItem[], n: number): ShopItem[] {
  const pool = [...items];
  const out: ShopItem[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, it) => s + RARITY_C[it.rarity].weight, 0);
    let r = rng.float() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= RARITY_C[pool[idx]!.rarity].weight;
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
export function shopOffer(run: Run, size = SHOP_OFFER_SIZE): ShopOffer[] {
  const perks = run.loadout.perks;
  // Hide maxed items, and gate tier-ladder items (Driver on Deck) behind their prerequisite.
  const pool = SHOP_ITEMS.filter(
    (it) => ownedCount(perks, it.id) < itemCap(it) && (!it.prereq || perks.includes(it.prereq)),
  );
  const rng = new Rng(`${run.seed}:shop:${run.stopIndex}`);
  return weightedSample(rng, pool, Math.min(size, pool.length)).map((item) => {
    const owned = ownedCount(perks, item.id);
    return { item, cost: itemCost(item, owned), owned };
  });
}

/** Voluntarily bank the run (cash out) — ends it with reason 'banked'. */
export function bank(run: Run): Run {
  return { ...run, status: 'ended', endedReason: 'banked' };
}

// --- Serialisation (for the save layer) -------------------------------------

export interface RunSnapshot {
  seed: number;
  /** Run format id (optional for back-compat with v1-era snapshots → flat). */
  formatId?: string;
  stopIndex: number;
  distanceFromStart: number;
  credits: number;
  /** Owned perks; the loadout is rebuilt from these (over the meta base) on resume. */
  perks: string[];
  /** Permanent meta-upgrade levels (GS-12); the resume base is rebuilt from these. */
  meta?: MetaUpgrades;
  /** The pending route event id (GS-14), so a resume mid-jump keeps the stop's modifier. */
  pendingEventId?: string;
}

export function snapshotRun(run: Run): RunSnapshot {
  return {
    seed: run.seed,
    formatId: run.formatId,
    stopIndex: run.stopIndex,
    distanceFromStart: run.distanceFromStart,
    credits: run.credits,
    perks: [...run.loadout.perks],
    meta: { ...run.meta },
    pendingEventId: run.pendingEvent?.id,
  };
}

export function resumeRun(snap: RunSnapshot): Run {
  const meta = snap.meta ?? {};
  return {
    seed: snap.seed,
    formatId: snap.formatId ?? DEFAULT_FORMAT,
    stopIndex: snap.stopIndex,
    distanceFromStart: snap.distanceFromStart,
    credits: snap.credits,
    // Perks sit on top of the permanent meta base so progression survives a resume.
    loadout: loadoutFromPerks(snap.perks ?? [], metaStartingLoadout(meta)),
    meta,
    pendingEvent: snap.pendingEventId ? routeEvent(snap.pendingEventId) : undefined,
    status: 'active',
    history: [],
  };
}

// --- Meta-progression: shards earned per run (GS-12) -------------------------

export const SHARD_PER_DISTANCE = 3;
export const SHARD_PER_STOP = 2;

/**
 * Star Shards earned by a run — the persistent currency spent at the Outpost. Rewards how
 * FAR you travelled (the roguelite goal) plus a little per stop cleared, so even a run that
 * bricks on stop 1 buys some lasting progress. Pure; floored at 1.
 */
export function shardsForRun(run: Run): number {
  return Math.max(
    1,
    Math.round(run.distanceFromStart * SHARD_PER_DISTANCE + run.history.length * SHARD_PER_STOP),
  );
}

// --- Headless full-run driver (for tests / AI sims) -------------------------

export interface RunStrategy {
  /** Pick an onward route; default = the first. */
  pickRoute?(run: Run, routes: Route[]): Route;
  /** Item ids to attempt buying after a stop; default = none. */
  shop?(run: Run): string[];
  /** Run format id; default = the engine default ('flat'). */
  formatId?: string;
}

export interface RunOutcome {
  run: Run;
  stops: StopResult[];
}

/** Simulate an entire run to its end (or a safety cap). Deterministic. */
export function simulateRun(
  seed: number | string,
  strategy: RunStrategy = {},
  maxStops = 100,
): RunOutcome {
  let run = startRun(seed, strategy.formatId);
  const stops: StopResult[] = [];
  for (let i = 0; i < maxStops && run.status === 'active'; i++) {
    const played = playStop(run);
    run = played.run;
    stops.push(played.result);
    if (run.status !== 'active') break;
    for (const id of strategy.shop?.(run) ?? []) run = buy(run, id);
    const routes = routeOptions(run);
    const route = strategy.pickRoute?.(run, routes) ?? routes[0]!;
    run = travel(run, route);
  }
  return { run, stops };
}
