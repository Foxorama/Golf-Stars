/**
 * UI screen-flow reducer — a PURE state machine over the (already pure) run API. Holds no
 * DOM and no time, so the whole interactive flow is unit-tested. `main.ts` renders the
 * returned `UiState` and dispatches `Action`s on clicks; save persistence is a side-effect
 * there, not here.
 *
 * Flow: intro → play → result → shop → travel → (next) intro … until a missed cut → gameover.
 */

import type { Course } from '../sim/course/contract';
import type { PlayedHole, PuttControl } from '../sim/round';
import {
  buy,
  currentCourse,
  finishStop,
  playStop,
  resumeRun,
  routeOptions,
  shardsForRun,
  shopOffer,
  startRun,
  travel,
  type Route,
  type Run,
  type RunSnapshot,
  type StopResult,
} from '../sim/rpg/run';
import { buyMetaUpgrade, type MetaUpgrades } from '../sim/rpg/meta';
import {
  autoDecision,
  awaitingPutt,
  beginHole,
  holeResult,
  takePutt,
  takeShot,
  type AimMode,
  type HolePlay,
} from '../sim/rpg/play';
import { Rng } from '../sim/rng';

export type Screen =
  | 'title'
  | 'character'
  | 'intro'
  | 'playing'
  | 'result'
  | 'shop'
  | 'travel'
  | 'gameover'
  | 'outpost';

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
  /**
   * The outfitter's stock for this stop (item ids), fixed on entry so buying doesn't
   * reshuffle the cards. Live cost/stack state is recomputed from `run` at render time.
   */
  shopOffer?: string[];
  /** Which hole the play view is showing (0-based). */
  viewHole: number;
  /** A saved in-progress run that the title screen can resume, if any. */
  resumable?: RunSnapshot;
  // --- interactive shot-by-shot play (the 'playing' screen) ---
  /** Current hole being played interactively. */
  play?: HolePlay;
  /** Deterministic RNG for the current stop (mutated as shots resolve). */
  holeRng?: Rng;
  /** Holes completed so far this stop. */
  stopPlayed?: PlayedHole[];
  // Meta-progression (persisted across runs).
  bestStableford: number;
  bestDistance: number;
  /** Persistent currency spent at the Outpost on permanent upgrades (GS-12). */
  shards: number;
  /** Owned permanent upgrade levels (id → level). */
  metaUpgrades: MetaUpgrades;
  /** Shards earned by the run that just ended — shown on the gameover screen. */
  lastRunShards?: number;
}

export type Action =
  | { type: 'start'; format: string }
  | { type: 'selectCharacter'; characterId: string } // pick a golfer, then begin the run
  | { type: 'resume' }
  | { type: 'play' } // auto-play the whole stop (watch)
  | { type: 'playInteractive' } // play shot-by-shot
  | { type: 'shot'; clubId: string; aim: AimMode; target?: [number, number] }
  | { type: 'putt'; control?: PuttControl } // take one putt — with a pace-meter control = manual skill
  | { type: 'autoShotHole' } // AI-finish the current hole
  | { type: 'holeComplete' } // advance to next hole / score the stop
  | { type: 'continue' }
  | { type: 'buy'; id: string }
  | { type: 'leaveShop' }
  | { type: 'route'; routeId: number }
  | { type: 'viewHole'; hole: number }
  | { type: 'openOutpost' } // visit the between-run Outpost (from title or gameover)
  | { type: 'buyUpgrade'; id: string } // buy a permanent upgrade with shards
  | { type: 'closeOutpost' } // back to the title
  | { type: 'restart'; seed?: number | string };

export interface MetaProgress {
  bestStableford?: number;
  bestDistance?: number;
  shards?: number;
  metaUpgrades?: MetaUpgrades;
}

/**
 * Build the initial UI state. Always lands on the TITLE screen (pick a format, or resume
 * a saved run if one is offered). A placeholder run backs the title until a format is
 * chosen. Starting at the title — never auto-resuming — guarantees the format choice is
 * always reachable and keeps a stale save from booting straight into a bad state.
 */
export function initState(
  seed: number | string,
  meta: MetaProgress = {},
  resumable?: RunSnapshot,
): UiState {
  const metaUpgrades = meta.metaUpgrades ?? {};
  const run = startRun(seed, undefined, metaUpgrades);
  return {
    run,
    screen: 'title',
    course: currentCourse(run),
    viewHole: 0,
    resumable,
    bestStableford: meta.bestStableford ?? 0,
    bestDistance: meta.bestDistance ?? 0,
    shards: meta.shards ?? 0,
    metaUpgrades,
  };
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'start': {
      if (state.screen !== 'title') return state;
      // Lock in the chosen format, then pick a golfer before the run begins (GS-18). The run is
      // (re)built with the format now so the course preview works; the character layers on at
      // `selectCharacter`. `run.formatId` carries the pending choice — no extra state needed.
      const run = startRun(state.run.seed, action.format, state.metaUpgrades);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'character',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        resumable: undefined,
        viewHole: 0,
      };
    }

    case 'selectCharacter': {
      if (state.screen !== 'character') return state;
      // Rebuild the run with the golfer's loadout/shape baked in, keeping the format chosen at 'start'.
      const run = startRun(state.run.seed, state.run.formatId, state.metaUpgrades, action.characterId);
      return { ...state, run, course: currentCourse(run), screen: 'intro' };
    }

    case 'resume': {
      if (state.screen !== 'title' || !state.resumable) return state;
      const run = resumeRun(state.resumable);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        resumable: undefined,
        viewHole: 0,
      };
    }

    case 'play': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      const { run, result, played } = playStop(state.run);
      const ended = !result.passed;
      const earned = ended ? shardsForRun(run) : undefined;
      return {
        ...state,
        run,
        played,
        lastResult: result,
        viewHole: 0,
        screen: result.passed ? 'result' : 'gameover',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        shards: state.shards + (earned ?? 0),
        lastRunShards: earned,
      };
    }

    case 'playInteractive': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      return {
        ...state,
        screen: 'playing',
        holeRng: new Rng(`${state.course.seed}:play`),
        stopPlayed: [],
        play: beginHole(state.course.holes[0]!, 0),
      };
    }

    case 'shot': {
      if (state.screen !== 'playing' || !state.play || state.play.done || !state.holeRng) return state;
      if (awaitingPutt(state.play)) return state; // on the green → must putt, not swing
      // Auto putt-out only when the Auto-Caddie legendary is owned; otherwise putting is manual.
      const auto = !!state.run.loadout.autoPutt;
      const play = takeShot(
        state.play,
        { clubId: action.clubId, aim: action.aim, target: action.target },
        state.run.loadout,
        state.holeRng,
        auto,
      );
      return { ...state, play };
    }

    case 'putt': {
      if (state.screen !== 'playing' || !state.play || state.play.done || !state.holeRng) return state;
      const play = takePutt(state.play, state.run.loadout, state.holeRng, action.control);
      return { ...state, play };
    }

    case 'autoShotHole': {
      if (state.screen !== 'playing' || !state.play || !state.holeRng) return state;
      let p = state.play;
      let guard = 0;
      // Finish the hole: putt out if on the green, else swing (with auto putt-out on arrival).
      while (!p.done && guard++ < 40) {
        p = awaitingPutt(p)
          ? takePutt(p, state.run.loadout, state.holeRng)
          : takeShot(p, autoDecision(p, state.run.loadout), state.run.loadout, state.holeRng, true);
      }
      return { ...state, play: p };
    }

    case 'holeComplete': {
      if (state.screen !== 'playing' || !state.play || !state.play.done) return state;
      const stopPlayed = [...(state.stopPlayed ?? []), holeResult(state.play)];
      const nextIdx = state.play.holeIndex + 1;
      if (nextIdx < state.course.holes.length) {
        return { ...state, stopPlayed, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
      }
      // Stop complete — score it exactly as the auto path does.
      const { run, result } = finishStop(state.run, state.course, stopPlayed);
      const ended = !result.passed;
      const earned = ended ? shardsForRun(run) : undefined;
      return {
        ...state,
        run,
        stopPlayed: undefined,
        play: undefined,
        holeRng: undefined,
        played: stopPlayed,
        lastResult: result,
        viewHole: 0,
        screen: result.passed ? 'result' : 'gameover',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        shards: state.shards + (earned ?? 0),
        lastRunShards: earned,
      };
    }

    case 'continue': {
      if (state.screen !== 'result') return state;
      // Fix the outfitter's stock now (from the post-stop run) so it stays put while shopping. The
      // single 4-card offer now mixes perk gear AND rare+ reward CLUBS (GS-clubs-2) from one draw.
      return {
        ...state,
        screen: 'shop',
        shopOffer: shopOffer(state.run).map((o) => o.item.id),
      };
    }

    case 'buy': {
      if (state.screen !== 'shop') return state;
      return { ...state, run: buy(state.run, action.id) };
    }

    case 'leaveShop': {
      if (state.screen !== 'shop') return state;
      return { ...state, screen: 'travel', routes: routeOptions(state.run), shopOffer: undefined };
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

    case 'openOutpost': {
      // The Outpost is reachable between runs — from the title or after a run ends.
      if (state.screen !== 'title' && state.screen !== 'gameover') return state;
      return { ...state, screen: 'outpost' };
    }

    case 'buyUpgrade': {
      if (state.screen !== 'outpost') return state;
      const { meta, shards } = buyMetaUpgrade(state.metaUpgrades, state.shards, action.id);
      if (meta === state.metaUpgrades) return state; // no-op: maxed, unaffordable, or bad id
      return { ...state, metaUpgrades: meta, shards };
    }

    case 'closeOutpost': {
      if (state.screen !== 'outpost') return state;
      // Back to the title; refresh the placeholder run so the new meta shows, but keep any
      // resumable run and the rest of the meta state intact (don't reset via initState).
      const run = startRun(state.run.seed, undefined, state.metaUpgrades);
      return { ...state, run, course: currentCourse(run), screen: 'title' };
    }

    case 'restart': {
      // Fresh run; meta-progression carries over.
      return initState(action.seed ?? state.run.seed, {
        bestStableford: state.bestStableford,
        bestDistance: state.bestDistance,
        shards: state.shards,
        metaUpgrades: state.metaUpgrades,
      });
    }
  }
}
