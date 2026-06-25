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
  STARTING_CREDITS,
  creditsForStop,
  cutLine,
  loadoutFromPerks,
  netDispersion,
  shopItem,
  startingLoadout,
  type PlayerLoadout,
} from './economy';
import { DEFAULT_FORMAT, getFormat, stopSpecFor } from './formats';

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
  status: RunStatus;
  endedReason?: EndReason;
  history: StopResult[];
}

export function startRun(seed: number | string, formatId: string = DEFAULT_FORMAT): Run {
  const rng = new Rng(seed);
  return {
    seed: rng.seed,
    formatId,
    stopIndex: 0,
    distanceFromStart: 0,
    credits: STARTING_CREDITS,
    loadout: startingLoadout(),
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
export function playStop(run: Run): { run: Run; result: StopResult; played: PlayedHole[] } {
  if (run.status !== 'active') throw new Error('playStop: run is not active');
  const course = currentCourse(run);
  const rng = new Rng(`${course.seed}:play`);
  const played = playCourse(course.holes, rng, {
    bag: run.loadout.bag,
    dispersionMult: netDispersion(run.loadout),
  });
  const totals = playTotals(played.map((p) => p.record));
  const cut = cutLine(run.distanceFromStart, course.holes.length);
  const passed = totals.stableford >= cut;
  const creditsEarned = passed ? creditsForStop(totals.stableford, run.loadout.creditMult) : 0;

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
    status: passed ? 'active' : 'ended',
    ...(passed ? {} : { endedReason: 'cut' as const }),
  };
  return { run: next, result, played };
}

/** The onward routes offered after a stop. Deterministic from the run + stop. */
export function routeOptions(run: Run): Route[] {
  const rng = new Rng(`${run.seed}:routes:${run.stopIndex}`);
  const labels: Record<number, string> = { 1: 'Short hop', 2: 'Cruise', 3: 'Deep jump' };
  return Array.from({ length: 3 }, (_, i) => {
    const distanceJump = rng.int(1, 3);
    return { id: i, distanceJump, label: labels[distanceJump]! };
  });
}

/** Travel a chosen route to the next stop (deeper = harder, better rewards). */
export function travel(run: Run, route: Route): Run {
  if (run.status !== 'active') throw new Error('travel: run is not active');
  return {
    ...run,
    stopIndex: run.stopIndex + 1,
    distanceFromStart: run.distanceFromStart + route.distanceJump,
  };
}

/** Buy a shop item (once each). No-op if unaffordable or already owned. */
export function buy(run: Run, itemId: string): Run {
  const item = shopItem(itemId);
  if (!item) return run;
  if (run.credits < item.cost) return run;
  if (run.loadout.perks.includes(itemId)) return run;
  return { ...run, credits: run.credits - item.cost, loadout: item.apply(run.loadout) };
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
  /** Owned perks; the loadout is rebuilt from these on resume. */
  perks: string[];
}

export function snapshotRun(run: Run): RunSnapshot {
  return {
    seed: run.seed,
    formatId: run.formatId,
    stopIndex: run.stopIndex,
    distanceFromStart: run.distanceFromStart,
    credits: run.credits,
    perks: [...run.loadout.perks],
  };
}

export function resumeRun(snap: RunSnapshot): Run {
  return {
    seed: snap.seed,
    formatId: snap.formatId ?? DEFAULT_FORMAT,
    stopIndex: snap.stopIndex,
    distanceFromStart: snap.distanceFromStart,
    credits: snap.credits,
    loadout: loadoutFromPerks(snap.perks ?? []),
    status: 'active',
    history: [],
  };
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
