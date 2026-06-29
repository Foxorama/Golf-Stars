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
  ASCENSION_MAX,
  bank,
  buy,
  currentBoss,
  currentCourse,
  finishStop,
  playStop,
  playerHoleOpts,
  resumeRun,
  routeOptions,
  scrambleOptsFor,
  shardsForRun,
  shopOffer,
  startRun,
  travel,
  bossRewards,
  grantTalent,
  type BossReward,
  type Route,
  type Run,
  type RunSnapshot,
  type StopResult,
} from '../sim/rpg/run';
import { archetypeFor } from '../sim/course/themes';
import { isMatchplayBoss } from '../sim/rpg/formats';
import { matchOpponentFor, runField } from '../sim/rpg/league';
import { playMatchStop, playBossStop, holeDuel, matchState, type HoleDuel } from '../sim/rpg/match';
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
  | 'bossReward'
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
  /** How many times the current shop's stock has been rerolled (GS-shop-reroll) — drives the salt + cost. */
  shopRerolls?: number;
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
  /** Highest Ascension tier unlocked (GS-ascension) — selectable on the title for a voyage. */
  maxAscension: number;
  /** Lifetime holes-in-one made across every run (GS-ace) — a permanent, cross-run record. */
  lifetimeAces: number;
  /** Matchplay duel state on a boss stop (GS-100): the opponent + their pre-played ball + the duel. */
  match?: MatchUi;
  /** Boss-reward choices to pick from after beating a boss (GS-talents) — shown on the bossReward screen. */
  bossReward?: BossReward[];
}

/** The matchplay duel a boss stop is played as (GS-100). */
export interface MatchUi {
  /** The opponent golfer id (the leaderboard leader). */
  bossId: string;
  /** The boss's real ball on each hole of the stop (pre-computed; revealed hole by hole). */
  bossHoles: PlayedHole[];
  /** Hole-by-hole duel results so far. */
  duels: HoleDuel[];
  /** Holes up from the player's view (+ player, − boss). */
  holesUp: number;
  /** Match mathematically decided (up by more than remain). */
  decided: boolean;
  /** Match over (decided early or all holes played). */
  finished: boolean;
}

export type Action =
  | { type: 'start'; format: string; ascension?: number }
  | { type: 'selectCharacter'; characterId: string } // pick a golfer, then begin the run
  | { type: 'resume' }
  | { type: 'play' } // auto-play the whole stop (watch)
  | { type: 'playInteractive' } // play shot-by-shot
  | { type: 'shot'; clubId: string; aim: AimMode; target?: [number, number]; power?: number }
  | { type: 'putt'; control?: PuttControl } // take one putt — with a pace-meter control = manual skill
  | { type: 'autoShotHole' } // AI-finish the current hole
  | { type: 'holeComplete' } // advance to next hole / score the stop
  | { type: 'continue' }
  | { type: 'pickBossReward'; index: number } // claim a talent / permanent reward after beating a boss
  | { type: 'buy'; id: string }
  | { type: 'rerollShop' } // pay credits to redraw the outfitter's stock (GS-shop-reroll)
  | { type: 'leaveShop' }
  | { type: 'route'; routeId: number }
  | { type: 'bank' } // cash out the run (push-your-luck): bank credits→shards, end the run
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
  maxAscension?: number;
  lifetimeAces?: number;
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
    maxAscension: meta.maxAscension ?? 0,
    lifetimeAces: meta.lifetimeAces ?? 0,
  };
}

/** The credit cost of the NEXT shop reroll (GS-shop-reroll) — base 30, ×1.6 per reroll this stop. */
export const REROLL_BASE_COST = 30;
export function rerollCost(rerolls: number): number {
  return Math.round(REROLL_BASE_COST * Math.pow(1.6, Math.max(0, rerolls)));
}

/** The matchplay opponent for a boss stop (GS-100): the leaderboard leader, or — if the arc has no
 *  scores yet (a fresh resume) — the field's top-rated non-player as a deterministic fallback. */
function resolveBossId(run: Run): string {
  return matchOpponentFor(run) ?? runField(run).golfers.find((g) => !g.isPlayer)?.id ?? '';
}

/** Winning at your current top Ascension tier unlocks the next (GS-ascension), capped at the max. */
function unlockedAscension(state: UiState, run: Run): number {
  if (run.endedReason !== 'won') return state.maxAscension;
  return Math.min(ASCENSION_MAX, Math.max(state.maxAscension, run.ascension + 1));
}

/** Boss-reward choices to offer after a stop, if it was a survived (non-final) boss win (GS-talents).
 *  Themed to the stop's zone. Undefined for an ordinary stop, a missed cut, or a run-winning final boss. */
function bossRewardFor(run: Run, course: UiState['course'], result: StopResult): BossReward[] | undefined {
  if (!result.passed || run.status !== 'active' || !currentBoss(run)) return undefined;
  return bossRewards(run, archetypeFor(course.meta?.themeId, course.biome));
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'start': {
      if (state.screen !== 'title') return state;
      // Lock in the chosen format, then pick a golfer before the run begins (GS-18). The run is
      // (re)built with the format now so the course preview works; the character layers on at
      // `selectCharacter`. `run.formatId` carries the pending choice — no extra state needed.
      // Ascension (GS-ascension) is chosen on the title for a voyage; clamp to what's unlocked.
      const asc = Math.max(0, Math.min(state.maxAscension, action.ascension ?? 0));
      const run = startRun(state.run.seed, action.format, state.metaUpgrades, undefined, asc);
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
      // Rebuild the run with the golfer's loadout/shape baked in, keeping the format + ascension chosen at 'start'.
      const run = startRun(state.run.seed, state.run.formatId, state.metaUpgrades, action.characterId, state.run.ascension);
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
      // Matchplay boss stop (GS-100): play the duel (player ball + boss ball), pass on the match.
      if (isMatchplayBoss(currentBoss(state.run))) {
        const bossId = resolveBossId(state.run);
        const stop = playMatchStop(
          state.course.holes,
          playerHoleOpts(state.run),
          bossId,
          new Rng(`${state.course.seed}:play`),
          new Rng(`${state.course.seed}:boss`),
        );
        const { run, result } = finishStop(state.run, state.course, stop.player, { matchWon: stop.state.playerAdvances });
        const ended = run.status !== 'active';
        const earned = ended ? shardsForRun(run) : undefined;
        return {
          ...state,
          run,
          played: stop.player,
          lastResult: result,
          match: { bossId, bossHoles: stop.boss, duels: stop.duels, holesUp: stop.state.holesUp, decided: stop.state.decided, finished: true },
          viewHole: 0,
          screen: ended ? 'gameover' : 'result',
          bestStableford: Math.max(state.bestStableford, result.stableford),
          bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
          shards: state.shards + (earned ?? 0),
          lastRunShards: earned,
          maxAscension: unlockedAscension(state, run),
          lifetimeAces: state.lifetimeAces + result.aces,
          bossReward: bossRewardFor(run, state.course, result),
        };
      }
      const { run, result, played } = playStop(state.run);
      // A run ends on a missed cut OR a won voyage (final boss cleared) — both bank shards and go to
      // the gameover/victory screen; a survived non-final stop goes to the result screen.
      const ended = run.status !== 'active';
      const earned = ended ? shardsForRun(run) : undefined;
      return {
        ...state,
        run,
        played,
        lastResult: result,
        match: undefined,
        viewHole: 0,
        screen: ended ? 'gameover' : 'result',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        shards: state.shards + (earned ?? 0),
        lastRunShards: earned,
        maxAscension: unlockedAscension(state, run),
        lifetimeAces: state.lifetimeAces + result.aces,
        bossReward: bossRewardFor(run, state.course, result),
      };
    }

    case 'playInteractive': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      // Matchplay boss stop (GS-100): pre-play the boss's ball for the whole stop (its own real shots,
      // deterministic), then play your ball hole-by-hole and compare. The boss uses its OWN rng stream,
      // so your interactive play is byte-for-byte the same as a non-boss stop.
      let match: MatchUi | undefined;
      if (isMatchplayBoss(currentBoss(state.run))) {
        const bossId = resolveBossId(state.run);
        const bossHoles = playBossStop(state.course.holes, bossId, new Rng(`${state.course.seed}:boss`));
        match = { bossId, bossHoles, duels: [], holesUp: 0, decided: false, finished: false };
      }
      return {
        ...state,
        screen: 'playing',
        holeRng: new Rng(`${state.course.seed}:play`),
        stopPlayed: [],
        play: beginHole(state.course.holes[0]!, 0),
        match,
      };
    }

    case 'shot': {
      if (state.screen !== 'playing' || !state.play || state.play.done || !state.holeRng) return state;
      if (awaitingPutt(state.play)) return state; // on the green → must putt, not swing
      // Auto putt-out only when the Auto-Caddie legendary is owned; otherwise putting is manual.
      const auto = !!state.run.loadout.autoPutt;
      const play = takeShot(
        state.play,
        { clubId: action.clubId, aim: action.aim, target: action.target, power: action.power },
        state.run.loadout,
        state.holeRng,
        auto,
        scrambleOptsFor(state.run),
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
      const scramble = scrambleOptsFor(state.run);
      // Finish the hole: putt out if on the green, else swing (with auto putt-out on arrival).
      while (!p.done && guard++ < 40) {
        p = awaitingPutt(p)
          ? takePutt(p, state.run.loadout, state.holeRng)
          : takeShot(p, autoDecision(p, state.run.loadout), state.run.loadout, state.holeRng, true, scramble);
      }
      return { ...state, play: p };
    }

    case 'holeComplete': {
      if (state.screen !== 'playing' || !state.play || !state.play.done) return state;
      const stopPlayed = [...(state.stopPlayed ?? []), holeResult(state.play)];
      const nextIdx = state.play.holeIndex + 1;
      const total = state.course.holes.length;

      // Matchplay (GS-100): score the just-finished hole against the boss's pre-played ball, and FINISH
      // the stop the moment the match is decided (a "3 & 2"), not only after all holes.
      if (state.match) {
        const justPlayed = stopPlayed[stopPlayed.length - 1]!;
        const bossHole = state.match.bossHoles[state.play.holeIndex]!;
        const duels = [...state.match.duels, holeDuel(state.play.holeIndex, state.play.hole.par, justPlayed, bossHole)];
        const ms = matchState(duels, total);
        const match: MatchUi = { ...state.match, duels, holesUp: ms.holesUp, decided: ms.decided, finished: ms.finished };
        if (!ms.finished) {
          return { ...state, stopPlayed, match, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
        }
        const { run, result } = finishStop(state.run, state.course, stopPlayed, { matchWon: ms.playerAdvances });
        const ended = run.status !== 'active';
        const earned = ended ? shardsForRun(run) : undefined;
        return {
          ...state,
          run,
          stopPlayed: undefined,
          play: undefined,
          holeRng: undefined,
          played: stopPlayed,
          lastResult: result,
          match,
          viewHole: 0,
          screen: ended ? 'gameover' : 'result',
          bestStableford: Math.max(state.bestStableford, result.stableford),
          bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
          shards: state.shards + (earned ?? 0),
          lastRunShards: earned,
          maxAscension: unlockedAscension(state, run),
          lifetimeAces: state.lifetimeAces + result.aces,
          bossReward: bossRewardFor(run, state.course, result),
        };
      }

      if (nextIdx < total) {
        return { ...state, stopPlayed, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
      }
      // Stop complete — score it exactly as the auto path does.
      const { run, result } = finishStop(state.run, state.course, stopPlayed);
      const ended = run.status !== 'active';
      const earned = ended ? shardsForRun(run) : undefined;
      return {
        ...state,
        run,
        stopPlayed: undefined,
        play: undefined,
        holeRng: undefined,
        played: stopPlayed,
        lastResult: result,
        match: undefined,
        viewHole: 0,
        screen: ended ? 'gameover' : 'result',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        shards: state.shards + (earned ?? 0),
        lastRunShards: earned,
        maxAscension: unlockedAscension(state, run),
        lifetimeAces: state.lifetimeAces + result.aces,
        bossReward: bossRewardFor(run, state.course, result),
      };
    }

    case 'continue': {
      if (state.screen !== 'result') return state;
      // After a boss win, claim the spoils first (GS-talents): a talent or a permanent reward.
      if (state.bossReward && state.bossReward.length) {
        return { ...state, screen: 'bossReward' };
      }
      // Fix the outfitter's stock now (from the post-stop run) so it stays put while shopping. The
      // single 4-card offer now mixes perk gear AND rare+ reward CLUBS (GS-clubs-2) from one draw.
      return {
        ...state,
        screen: 'shop',
        shopOffer: shopOffer(state.run).map((o) => o.item.id),
        shopRerolls: 0,
      };
    }

    case 'pickBossReward': {
      if (state.screen !== 'bossReward' || !state.bossReward) return state;
      const choice = state.bossReward[action.index];
      if (!choice) return state;
      // A talent applies a run-scoped buff (rebuilt from perks on resume); a permanent reward banks
      // shards (cross-run). Then on to the shop with a fixed stock.
      const run = choice.kind === 'talent' ? grantTalent(state.run, choice.id) : state.run;
      const shards = choice.kind === 'shards' ? state.shards + (choice.shards ?? 0) : state.shards;
      return {
        ...state,
        run,
        shards,
        bossReward: undefined,
        screen: 'shop',
        shopOffer: shopOffer(run).map((o) => o.item.id),
        shopRerolls: 0,
      };
    }

    case 'buy': {
      if (state.screen !== 'shop') return state;
      return { ...state, run: buy(state.run, action.id) };
    }

    case 'rerollShop': {
      // Pay an escalating fee to redraw the outfitter's stock (GS-shop-reroll): agency over the offer.
      if (state.screen !== 'shop') return state;
      const rerolls = state.shopRerolls ?? 0;
      const cost = rerollCost(rerolls);
      if (state.run.credits < cost) return state;
      const next = rerolls + 1;
      return {
        ...state,
        run: { ...state.run, credits: state.run.credits - cost },
        shopRerolls: next,
        shopOffer: shopOffer(state.run, undefined, next).map((o) => o.item.id),
      };
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
        match: undefined,
        bossReward: undefined,
        viewHole: 0,
      };
    }

    case 'bank': {
      // Push-your-luck cash-out (GS-bank): only between stops (the travel screen), where you've
      // survived the last cut and hold credits worth locking in. Banking ends the run with its
      // credits converted to shards (busting forfeits them) — see shardsForRun.
      if (state.screen !== 'travel' || state.run.status !== 'active') return state;
      const run = bank(state.run);
      const earned = shardsForRun(run);
      return {
        ...state,
        run,
        routes: undefined,
        screen: 'gameover',
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        shards: state.shards + earned,
        lastRunShards: earned,
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
        maxAscension: state.maxAscension,
      });
    }
  }
}
