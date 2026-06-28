/**
 * Matchplay bosses (GS-100) — a 1-on-1 duel against a real golfer on the actual hole.
 *
 * The arc's boss is the leaderboard leader (`league.arcBossId` → the top non-player). On a matchplay
 * boss stop you don't play Stableford-vs-cut: you play the boss HOLE BY HOLE — fewer strokes wins the
 * hole, and the match is decided when one player is up by more holes than remain ("3 & 2"). Winning
 * (or halving) the match passes the stop; losing ends the run.
 *
 * The boss is a REAL ball, not a ghost: it plays the same hole through the same `playHole` engine with
 * the golfer's own loadout (a distance bonus from their power, a handicap from their skill) and their
 * own shot SHAPE (`bossShotMods` — their fade/hook, dispersion, backspin). So the boss "hits their own
 * shots" and a bomber's boss really does bomb it. The boss plays a SEPARATE rng stream so the player's
 * own play stays byte-for-byte identical to a non-boss stop (the leaderboard/balance for the player's
 * score is unchanged); the duel is the comparison on top.
 *
 * Pure & deterministic, no DOM. The reducer orchestrates (it can see the leaderboard); this module is
 * the engine.
 */

import { playHole, type PlayHoleOptions, type PlayedHole } from '../round';
import type { Hole } from '../course/contract';
import { Rng } from '../rng';
import {
  startingLoadout,
  boostDistanceClubs,
  netDispersion,
  type PlayerLoadout,
} from './economy';
import { bossShotMods, golferDistanceBonus, golferProfile } from './golfers';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A boss golfer's loadout: the balanced bag with their distance bonus, and a handicap derived from
 * their skill/accuracy (a leaderboard leader plays off a low handicap → tight, long, dangerous).
 */
export function bossLoadout(golferId: string): PlayerLoadout {
  const p = golferProfile(golferId);
  const base = startingLoadout();
  // Skill+accuracy → handicap ~2 (elite) to ~16 (journeyman).
  const handicap = Math.round(clamp(20 - p.skill * 12 - p.accuracy * 6, 1, 18));
  return {
    ...base,
    bag: boostDistanceClubs(base.bag, golferDistanceBonus(golferId)),
    handicap,
    dispersionMult: 1,
    characterId: undefined,
  };
}

/** The `playHole` options for a boss golfer (their bag, dispersion, and shot shape). */
export function bossPlayOpts(golferId: string): PlayHoleOptions {
  const lo = bossLoadout(golferId);
  return {
    bag: lo.bag,
    dispersionMult: netDispersion(lo),
    shotMods: bossShotMods(golferId),
  };
}

/** Play a boss golfer's whole stop (their own ball on each hole), deterministically. */
export function playBossStop(holes: readonly Hole[], golferId: string, rng: Rng): PlayedHole[] {
  const opts = bossPlayOpts(golferId);
  return holes.map((h) => playHole(h, rng, opts));
}

export interface HoleDuel {
  holeIndex: number;
  par: number;
  playerStrokes: number;
  bossStrokes: number;
  /** Who won the hole (fewer strokes). */
  winner: 'player' | 'boss' | 'halved';
}

/** Fewer strokes wins the hole. */
export function duelWinner(playerStrokes: number, bossStrokes: number): HoleDuel['winner'] {
  if (playerStrokes < bossStrokes) return 'player';
  if (bossStrokes < playerStrokes) return 'boss';
  return 'halved';
}

export function holeDuel(holeIndex: number, par: number, player: PlayedHole, boss: PlayedHole): HoleDuel {
  return {
    holeIndex,
    par,
    playerStrokes: player.record.strokes,
    bossStrokes: boss.record.strokes,
    winner: duelWinner(player.record.strokes, boss.record.strokes),
  };
}

export interface MatchState {
  /** Holes up from the PLAYER's perspective (+ player ahead, − boss ahead). */
  holesUp: number;
  /** Holes played so far. */
  thru: number;
  /** Holes still to play. */
  remaining: number;
  /** The match is mathematically over (up by more than remain). */
  decided: boolean;
  /** Match is over (decided early or all holes played). */
  finished: boolean;
  /** Player took the match (up at the finish). */
  playerWon: boolean;
  /** All-square at the finish. */
  halved: boolean;
  /** Player passes the boss stop — won or halved (benefit of the doubt on a half). */
  playerAdvances: boolean;
}

/** Roll duels into a match state, given the total holes in the stop. */
export function matchState(duels: readonly HoleDuel[], totalHoles: number): MatchState {
  let up = 0;
  for (const d of duels) up += d.winner === 'player' ? 1 : d.winner === 'boss' ? -1 : 0;
  const thru = duels.length;
  const remaining = Math.max(0, totalHoles - thru);
  const decided = Math.abs(up) > remaining;
  const finished = decided || thru >= totalHoles;
  const halved = finished && up === 0;
  const playerWon = finished && up > 0;
  return { holesUp: up, thru, remaining, decided, finished, playerWon, halved, playerAdvances: finished && up >= 0 };
}

export interface MatchStop {
  player: PlayedHole[];
  boss: PlayedHole[];
  duels: HoleDuel[];
  state: MatchState;
}

/**
 * Auto-play a whole matchplay stop: the player's ball (supplied opts) and the boss's ball, hole by
 * hole, stopping as soon as the match is mathematically decided. Used by the "watch the AI play" path
 * and tests. Separate rng streams so the player's auto play is identical to a non-boss stop.
 */
export function playMatchStop(
  holes: readonly Hole[],
  playerOpts: PlayHoleOptions,
  golferId: string,
  playerRng: Rng,
  bossRng: Rng,
): MatchStop {
  const bossOpts = bossPlayOpts(golferId);
  const player: PlayedHole[] = [];
  const boss: PlayedHole[] = [];
  const duels: HoleDuel[] = [];
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!;
    const ph = playHole(h, playerRng, playerOpts);
    const bh = playHole(h, bossRng, bossOpts);
    player.push(ph);
    boss.push(bh);
    duels.push(holeDuel(i, h.par, ph, bh));
    if (matchState(duels, holes.length).decided) break;
  }
  return { player, boss, duels, state: matchState(duels, holes.length) };
}

/** A short matchplay scoreline, e.g. "3 & 2", "2 UP", "AS" (all square). */
export function matchScoreline(st: MatchState): string {
  if (st.thru === 0) return 'AS';
  if (st.finished && st.decided && st.remaining > 0) {
    return `${Math.abs(st.holesUp)} & ${st.remaining}`;
  }
  if (st.holesUp === 0) return st.finished ? 'HALVED' : 'AS';
  const side = st.holesUp > 0 ? 'UP' : 'DN';
  return `${Math.abs(st.holesUp)} ${side}`;
}
