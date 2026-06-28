/**
 * The league glue (GS-100) — turns a `Run` into a competition field + leaderboard.
 *
 * `competition.ts` is the pure engine (it knows nothing about runs); this thin layer assembles its
 * inputs from run state: it groups stops into ARCS, builds the arc's field, and computes the cumulative
 * leaderboard from the player's REAL per-stop Stableford (in `run.history`) and the field's deterministic
 * ghost scores. Run-aware, but still pure/headless — the UI renders what it returns.
 *
 * Boundary note: this module imports `run.ts` (for the `Run` type + `effectiveCut`); `run.ts` never
 * imports this, so there's no cycle. Standings are recomputed from seed + history, so nothing new is
 * persisted; on a fresh resume (history reset) the arc leaderboard simply rebuilds from the next stop on.
 */

import type { Run } from './run';
import { effectiveCut, currentCourse } from './run';
import { getFormat, stopSpecFor, bossAt } from './formats';
import { arcForDistance, archetypeFor } from '../course/themes';
import { getCharacter } from './characters';
import {
  buildField,
  ghostHoleStableford,
  homeMatches,
  rankStandings,
  applyCut,
  survivorCount,
  bossPick,
  PLAYER_ID,
  type Field,
  type Standing,
  type PlayerInfo,
} from './competition';

/** Stops per arc — voyage is 2 ordinary + 1 boss; flat/ladder reuse the grouping as a "season". */
export const ARC_LEN = 3;

export function arcIndexOf(stopIndex: number): number {
  return Math.floor(stopIndex / ARC_LEN);
}
export function arcStartStop(arcIndex: number): number {
  return arcIndex * ARC_LEN;
}
export function stopPosInArc(stopIndex: number): number {
  return stopIndex % ARC_LEN;
}
/** Is this the boss (final) slot of its arc? */
export function isArcBossSlot(stopIndex: number): boolean {
  return stopPosInArc(stopIndex) === ARC_LEN - 1;
}

const DEFAULT_LOOK = { cap: '#cfd6dd', shirt: '#7f8a96', skin: '#caa182', build: 1 };

/** The human player's field identity — their chosen golfer's look. */
export function playerInfoFor(run: Run): PlayerInfo {
  const ch = getCharacter(run.loadout.characterId);
  return {
    name: 'You',
    look: ch?.style ?? DEFAULT_LOOK,
    characterId: run.loadout.characterId,
  };
}

/** Holes in a given stop (per the run's format). */
export function holesForStop(run: Run, stopIndex: number): number {
  return stopSpecFor(getFormat(run.formatId), stopIndex).holes;
}

/** The competition field for the run's CURRENT arc (deterministic, seed-stable). */
export function runField(run: Run): Field {
  const arcIndex = arcIndexOf(run.stopIndex);
  return buildField(run.seed, arcIndex, arcForDistance(run.distanceFromStart), playerInfoFor(run));
}

/** Pressure 0..1 a stop carries (ramps toward the arc's boss slot). */
function stopPressure(stopIndex: number): number {
  const pos = stopPosInArc(stopIndex);
  return isArcBossSlot(stopIndex) ? 1 : pos / ARC_LEN;
}

/** A stable ghost hole key (independent of the real course seed — only needs to be deterministic). */
function ghostHoleKey(run: Run, stopIndex: number, holeIdx: number): string {
  return `${run.seed}:gl:${stopIndex}:${holeIdx}`;
}

export interface Leaderboard {
  field: Field;
  standings: Standing[];
  /** This-stop cut line (the survival threshold drawn across the board). */
  cut: number;
  /** AI golfers (excluding the player) still alive after this stop's cut. */
  survivors: number;
  /** Total holes the leaderboard runs through. */
  thru: number;
  /** Whether the current arc has any history yet (else the board is the pre-arc field only). */
  hasScores: boolean;
}

/**
 * The cumulative leaderboard for the run's current arc, through its played stops. Each completed stop in
 * the arc contributes the player's REAL Stableford and the field's ghost Stableford; the LAST played stop
 * also sets each row's `stopScore` for the cut. `cut` is the just-played stop's effective cut.
 */
export function leaderboard(run: Run): Leaderboard {
  const arcIndex = arcIndexOf(run.stopIndex);
  const field = runField(run);
  // The arc's completed stops, in order.
  const arcStops = run.history.filter((h) => arcIndexOf(h.stopIndex) === arcIndex).sort((a, b) => a.stopIndex - b.stopIndex);

  const totals = new Map<string, number>();
  const stopScores = new Map<string, number>();
  for (const g of field.golfers) {
    totals.set(g.id, 0);
    stopScores.set(g.id, 0);
  }

  let thru = 0;
  let lastCut = 0;
  for (let s = 0; s < arcStops.length; s++) {
    const h = arcStops[s]!;
    const isLast = s === arcStops.length - 1;
    const holeCount = holesForStop(run, h.stopIndex);
    const archetype = archetypeFor(h.themeId, h.biome);
    const pressure = stopPressure(h.stopIndex);
    thru += holeCount;
    lastCut = h.cut;

    // Player: their real stop Stableford.
    totals.set(PLAYER_ID, totals.get(PLAYER_ID)! + h.stableford);
    if (isLast) stopScores.set(PLAYER_ID, h.stableford);

    // Field: ghost per-hole, summed for the stop.
    for (const g of field.golfers) {
      if (g.isPlayer) continue;
      let sf = 0;
      for (let i = 0; i < holeCount; i++) {
        sf += ghostHoleStableford(g.id, ghostHoleKey(run, h.stopIndex, i), homeMatches(g, h.themeId, archetype), pressure);
      }
      totals.set(g.id, totals.get(g.id)! + sf);
      if (isLast) stopScores.set(g.id, sf);
    }
  }

  const rows: Standing[] = field.golfers.map((g) => ({
    golferId: g.id,
    name: g.name,
    shortName: g.shortName,
    tier: g.tier,
    look: g.look,
    isPlayer: g.isPlayer,
    total: totals.get(g.id)!,
    thru,
    stopScore: arcStops.length ? stopScores.get(g.id)! : undefined,
    position: 0,
  }));
  rankStandings(rows);

  const cut = arcStops.length ? lastCut : effectiveCut(run, holesForStop(run, run.stopIndex));
  const withCut = applyCut(rows, cut);
  return {
    field,
    standings: withCut,
    cut,
    survivors: survivorCount(withCut),
    thru,
    hasScores: arcStops.length > 0,
  };
}

/**
 * The arc's boss — the top non-player on the leaderboard going INTO the boss slot (i.e. computed from the
 * arc's pre-boss stops). Returns undefined if the current arc has no boss slot or no scores yet.
 */
export function arcBossId(run: Run): string | undefined {
  const board = leaderboard(run);
  if (!board.hasScores) return undefined;
  return bossPick(board.standings);
}

/** Is the run currently AT (or about to play) an arc's boss stop? */
export function isBossStop(run: Run): boolean {
  return !!bossAt(getFormat(run.formatId), run.stopIndex);
}

export interface LivePosition {
  /** 1-based live leaderboard position (arc total + the in-progress stop so far). */
  position: number;
  /** The player's live cumulative arc Stableford. */
  total: number;
  /** Field size. */
  of: number;
  /** Points behind the live leader (0 if leading). */
  gapToLead: number;
}

/**
 * The player's LIVE leaderboard position mid-stop (GS-100) — the arc total from completed stops plus
 * the in-progress stop's partial: the player's `playerStopSF` over `holesPlayed` holes, and each
 * ghost's score over the SAME holes. Drives the per-hole "you're Nth" chip on the play screen, so the
 * board updates the moment a hole is finished. Pure/deterministic.
 */
export function livePosition(run: Run, holesPlayed: number, playerStopSF: number): LivePosition {
  const board = leaderboard(run); // completed arc stops
  const field = board.field;
  const course = currentCourse(run);
  const themeId = course.meta?.themeId;
  const archetype = archetypeFor(themeId, course.biome);
  const pressure = stopPressure(run.stopIndex);

  const totals = new Map<string, number>();
  for (const s of board.standings) totals.set(s.golferId, s.total);
  totals.set(PLAYER_ID, (totals.get(PLAYER_ID) ?? 0) + playerStopSF);
  for (const g of field.golfers) {
    if (g.isPlayer) continue;
    let sf = 0;
    for (let i = 0; i < holesPlayed; i++) {
      sf += ghostHoleStableford(g.id, ghostHoleKey(run, run.stopIndex, i), homeMatches(g, themeId, archetype), pressure);
    }
    totals.set(g.id, (totals.get(g.id) ?? 0) + sf);
  }

  const rows = field.golfers.map((g) => ({ id: g.id, total: totals.get(g.id) ?? 0 }));
  rows.sort((a, b) => b.total - a.total);
  const position = rows.findIndex((r) => r.id === PLAYER_ID) + 1;
  const total = rows.find((r) => r.id === PLAYER_ID)?.total ?? 0;
  return { position, total, of: rows.length, gapToLead: (rows[0]?.total ?? 0) - total };
}
