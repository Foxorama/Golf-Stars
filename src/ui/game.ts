/**
 * UI screen-flow reducer — a PURE state machine over the (already pure) run API. Holds no
 * DOM and no time, so the whole interactive flow is unit-tested. `main.ts` renders the
 * returned `UiState` and dispatches `Action`s on clicks; save persistence is a side-effect
 * there, not here.
 *
 * Flow: intro → play → result → shop → travel → (next) intro … until a missed cut → gameover.
 */

import type { Course } from '../sim/course/contract';
import type { PlayedHole } from '../sim/round';
import {
  buy,
  currentCourse,
  playStop,
  routeOptions,
  startRun,
  travel,
  type Route,
  type Run,
  type StopResult,
} from '../sim/rpg/run';

export type Screen = 'title' | 'intro' | 'result' | 'shop' | 'travel' | 'gameover';

export interface UiState {
  run: Run;
  screen: Screen;
  /** The current stop's course. */
  course: Course;
  /** Played holes from the last `play` (for the scorecard + animation). */
  played?: PlayedHole[];
  lastResult?: StopResult;
  /** Onward routes, populated on the travel screen. */
  routes?: Route[];
  /** Which hole the play view is showing (0-based). */
  viewHole: number;
  // Meta-progression (persisted across runs).
  bestStableford: number;
  bestDistance: number;
}

export type Action =
  | { type: 'start'; format: string }
  | { type: 'play' }
  | { type: 'continue' }
  | { type: 'buy'; id: string }
  | { type: 'leaveShop' }
  | { type: 'route'; routeId: number }
  | { type: 'viewHole'; hole: number }
  | { type: 'restart'; seed?: number | string };

export interface MetaProgress {
  bestStableford?: number;
  bestDistance?: number;
}

/**
 * Build the initial UI state. A resumed `Run` lands on the intro screen; a fresh seed
 * lands on the title screen (pick a run format first) with a placeholder run.
 */
export function initState(seedOrRun: number | string | Run, meta: MetaProgress = {}): UiState {
  const resuming = typeof seedOrRun === 'object';
  const run = resuming ? seedOrRun : startRun(seedOrRun);
  return {
    run,
    screen: resuming ? 'intro' : 'title',
    course: currentCourse(run),
    viewHole: 0,
    bestStableford: meta.bestStableford ?? 0,
    bestDistance: meta.bestDistance ?? 0,
  };
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'start': {
      if (state.screen !== 'title') return state;
      const run = startRun(state.run.seed, action.format);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        viewHole: 0,
      };
    }

    case 'play': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      const { run, result, played } = playStop(state.run);
      return {
        ...state,
        run,
        played,
        lastResult: result,
        viewHole: 0,
        screen: result.passed ? 'result' : 'gameover',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
      };
    }

    case 'continue': {
      if (state.screen !== 'result') return state;
      return { ...state, screen: 'shop' };
    }

    case 'buy': {
      if (state.screen !== 'shop') return state;
      return { ...state, run: buy(state.run, action.id) };
    }

    case 'leaveShop': {
      if (state.screen !== 'shop') return state;
      return { ...state, screen: 'travel', routes: routeOptions(state.run) };
    }

    case 'route': {
      if (state.screen !== 'travel') return state;
      const route = (state.routes ?? []).find((r) => r.id === action.routeId);
      if (!route) return state;
      const run = travel(state.run, route);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        viewHole: 0,
      };
    }

    case 'viewHole': {
      const n = state.played?.length ?? state.course.holes.length;
      const hole = Math.max(0, Math.min(n - 1, action.hole));
      return { ...state, viewHole: hole };
    }

    case 'restart': {
      // Fresh run; meta-progression carries over.
      return initState(action.seed ?? state.run.seed, {
        bestStableford: state.bestStableford,
        bestDistance: state.bestDistance,
      });
    }
  }
}
