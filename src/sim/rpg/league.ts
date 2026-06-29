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
import { effectiveCut, currentCourse, arcSlices, ascensionCutBonus } from './run';
import { getFormat, stopSpecFor, bossAt } from './formats';
import { arcForDistance, archetypeFor } from '../course/themes';
import { getCharacter } from './characters';
import {
  buildField,
  buildVoyageField,
  ghostHoleStableford,
  golferForm,
  homeMatches,
  rankStandings,
  applyCut,
  survivorCount,
  bossPick,
  bossOpponentFor,
  arcCut,
  arcSurvivorTarget,
  ARC_LEN,
  arcIndexOf,
  arcStartStop,
  stopPosInArc,
  isArcBossSlot,
  stopPressure,
  PLAYER_ID,
  type Field,
  type Standing,
  type PlayerInfo,
} from './competition';

// The arc grouping helpers moved to competition.ts (so run.ts can use them for the positional cut
// without an import cycle); re-export them here for back-compat with existing importers.
export { ARC_LEN, arcIndexOf, arcStartStop, stopPosInArc, isArcBossSlot };

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

/** The competition field for the run (deterministic, seed-stable). A WINNABLE voyage uses ONE
 *  persistent field across the whole journey (GS-voyage-field) so the cut thins it to the final two;
 *  endless formats (flat/ladder) keep a fresh per-arc field each "season". */
export function runField(run: Run): Field {
  return getFormat(run.formatId).winnable
    ? buildVoyageField(run.seed, playerInfoFor(run))
    : buildField(run.seed, arcIndexOf(run.stopIndex), arcForDistance(run.distanceFromStart), playerInfoFor(run));
}

/** A stable ghost hole key (independent of the real course seed — only needs to be deterministic). */
function ghostHoleKey(run: Run, stopIndex: number, holeIdx: number): string {
  return `${run.seed}:gl:${stopIndex}:${holeIdx}`;
}

/** A stable per-stop form key (GS-streaks) — each golfer's hot/cold streak is rolled off this + their id. */
function stopFormKey(run: Run, stopIndex: number): string {
  return `${run.seed}:form:${stopIndex}`;
}

export interface Leaderboard {
  field: Field;
  standings: Standing[];
  /** This-stop cut line. In 'positional' mode this is the survivor TARGET (top-N advance); in
   *  'stableford' mode it's the Stableford threshold. */
  cut: number;
  /** AI golfers (excluding the player) still alive after this stop's cut. */
  survivors: number;
  /** Total holes the leaderboard runs through. */
  thru: number;
  /** Whether the current arc has any history yet (else the board is the pre-arc field only). */
  hasScores: boolean;
  /** Survival model (GS-positional-cut): 'positional' = top-N of the field advance (the voyage);
   *  'stableford' = beat a Stableford line (endless flat/ladder). */
  mode: 'positional' | 'stableford';
  /** The survivor target (top-N advance) when positional — for the "N advance" display. */
  survivorTarget?: number;
}

/**
 * The current arc's leaderboard. A WINNABLE campaign (the voyage) is a FIELD competition with a
 * POSITIONAL cut (top-N advance) — survival is your place, the board is what matters; endless formats
 * (flat/ladder) keep the Stableford-line board. Pure/deterministic.
 */
export function leaderboard(run: Run): Leaderboard {
  return getFormat(run.formatId).winnable ? positionalLeaderboard(run) : stablefordLeaderboard(run);
}

/**
 * The positional leaderboard (GS-positional-cut): cumulative arc standings with the top-N cut applied
 * stop-by-stop (top 18, then top 16), so eliminated golfers are flagged and sink below the survivors.
 * Uses the SAME slices + `arcCut` engine `finishStop` uses for survival, so the drawn cut and the real
 * cut can never disagree. A boss stop in the arc adds nothing and draws no cut (the match decides).
 */
function positionalLeaderboard(run: Run): Leaderboard {
  const field = runField(run);
  const slices = arcSlices(run); // completed arc stops (the result screen renders AFTER history is appended)
  const result = arcCut(field, run.seed, slices);
  const survivors = result.standings.filter((s) => !s.isPlayer && !s.cut).length;
  // The "cut" here is the survivor TARGET (top-N advance). Before any stop is played it's the first
  // stop's target (so a fresh board reads "top 18 advance"); after a boss stop there's no positional cut.
  const target = result.lastTarget ?? arcSurvivorTarget(run.stopIndex, ascensionCutBonus(run.ascension));
  return {
    field,
    standings: result.standings,
    cut: target ?? 0,
    survivors,
    thru: result.thru,
    hasScores: slices.length > 0,
    mode: 'positional',
    survivorTarget: result.lastIsBoss ? undefined : target,
  };
}

/**
 * The cumulative leaderboard for the run's current arc, through its played stops. Each completed stop in
 * the arc contributes the player's REAL Stableford and the field's ghost Stableford; the LAST played stop
 * also sets each row's `stopScore` for the cut. `cut` is the just-played stop's effective cut.
 */
function stablefordLeaderboard(run: Run): Leaderboard {
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

  const format = getFormat(run.formatId);
  let thru = 0;
  let lastCut = 0;
  let lastIsBoss = false;
  for (let s = 0; s < arcStops.length; s++) {
    const h = arcStops[s]!;
    const isLast = s === arcStops.length - 1;
    // A matchplay/scramble BOSS stop is a knockout, not a stroke-scoring round (GS-matchplay): it adds
    // NO Stableford to anyone's arc total. Otherwise winning the boss but trailing them on points reads
    // backwards. The stop still shows on the board as a +0 line (reinforcing "the boss round is decided
    // by the match, not points").
    const isBoss = !!bossAt(format, h.stopIndex);
    if (isLast) lastIsBoss = isBoss;
    if (isBoss) {
      if (isLast) for (const g of field.golfers) stopScores.set(g.id, 0);
      continue;
    }
    const holeCount = holesForStop(run, h.stopIndex);
    const archetype = archetypeFor(h.themeId, h.biome);
    const pressure = stopPressure(h.stopIndex);
    thru += holeCount;
    lastCut = h.cut;

    // Player: their real stop Stableford.
    totals.set(PLAYER_ID, totals.get(PLAYER_ID)! + h.stableford);
    if (isLast) stopScores.set(PLAYER_ID, h.stableford);

    // Field: ghost per-hole, summed for the stop. Each golfer carries a per-stop form streak (GS-streaks)
    // so the order shuffles stop to stop — a hot field golfer can leap the board, a cold champion slips.
    const formKey = stopFormKey(run, h.stopIndex);
    for (const g of field.golfers) {
      if (g.isPlayer) continue;
      const form = golferForm(g.id, formKey);
      let sf = 0;
      for (let i = 0; i < holeCount; i++) {
        sf += ghostHoleStableford(g.id, ghostHoleKey(run, h.stopIndex, i), homeMatches(g, h.themeId, archetype), pressure, form);
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

  // No Stableford cut is drawn on (or after) a boss stop — the boss round is decided by the matchplay.
  const cut = lastIsBoss ? 0 : arcStops.length ? lastCut : effectiveCut(run, holesForStop(run, run.stopIndex));
  const withCut = lastIsBoss ? rows.map((r) => ({ ...r, cut: false })) : applyCut(rows, cut);
  return {
    field,
    standings: withCut,
    cut,
    survivors: survivorCount(withCut),
    thru,
    hasScores: arcStops.length > 0,
    mode: 'stableford',
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

/**
 * The matchplay boss opponent for the player (GS-matchplay): the field plays a knockout that pairs the
 * leaderboard best-vs-worst (#1 v last, #2 v 2nd-last, …), so this returns the player's RANK-MIRROR — top
 * of the arc earns the weakest opponent, a nervy scrape into the boss draws the leader. Falls back to the
 * top-rated non-player on a fresh arc with no scores yet (a resume). Replaces "always face the leader".
 */
export function matchOpponentFor(run: Run): string | undefined {
  const board = leaderboard(run);
  if (!board.hasScores) return runField(run).golfers.find((g) => !g.isPlayer)?.id;
  return bossOpponentFor(board.standings, PLAYER_ID);
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
 * The FULL live arc leaderboard mid-stop (GS-100) — the cumulative arc board through the completed
 * stops PLUS the in-progress stop's partial: the player's `playerStopSF` over `holesPlayed` holes and
 * each ghost's score over the SAME holes. This is what the end-of-hole screen shows, so the standings
 * visibly move every hole. `stopScore` is the in-progress stop partial; `thru` counts the partial holes.
 * The cut line is the stop's effective cut for context, but the per-stop cut flag is left UNSET mid-stop
 * (a partial stop hasn't been scored against the cut yet — the caller hides the divider for the live view).
 * Pure/deterministic.
 */
export function liveLeaderboard(run: Run, holesPlayed: number, playerStopSF: number): Leaderboard {
  const board = leaderboard(run); // completed arc stops (cumulative; positional → carries cut flags)
  const field = board.field;
  const course = currentCourse(run);
  const themeId = course.meta?.themeId;
  const archetype = archetypeFor(themeId, course.biome);
  const pressure = stopPressure(run.stopIndex);
  const currentIsBoss = !!bossAt(getFormat(run.formatId), run.stopIndex);
  // Only a positional board carries PERMANENT eliminations between stops; a stableford board (flat/
  // ladder) re-includes everyone each stop, so its prior cut flags are display-only — don't freeze them.
  const carryElim = board.mode === 'positional';

  const eliminated = new Map<string, boolean>();
  for (const s of board.standings) eliminated.set(s.golferId, carryElim ? !!s.cut : false);

  const totals = new Map<string, number>();
  const stopScores = new Map<string, number>();
  for (const s of board.standings) totals.set(s.golferId, s.total);

  // A boss stop adds nothing to the board (matchplay), so don't fold a partial there.
  const addPartial = !currentIsBoss;
  if (addPartial) {
    totals.set(PLAYER_ID, (totals.get(PLAYER_ID) ?? 0) + playerStopSF);
    stopScores.set(PLAYER_ID, playerStopSF);
    const formKey = stopFormKey(run, run.stopIndex);
    for (const g of field.golfers) {
      if (g.isPlayer || eliminated.get(g.id)) continue; // an eliminated golfer is out — no partial
      const form = golferForm(g.id, formKey);
      let sf = 0;
      for (let i = 0; i < holesPlayed; i++) {
        sf += ghostHoleStableford(g.id, ghostHoleKey(run, run.stopIndex, i), homeMatches(g, themeId, archetype), pressure, form);
      }
      totals.set(g.id, (totals.get(g.id) ?? 0) + sf);
      stopScores.set(g.id, sf);
    }
  }

  const thru = board.thru + (addPartial ? holesPlayed : 0);
  const rows: Standing[] = field.golfers.map((g) => ({
    golferId: g.id,
    name: g.name,
    shortName: g.shortName,
    tier: g.tier,
    look: g.look,
    isPlayer: g.isPlayer,
    total: totals.get(g.id) ?? 0,
    thru,
    stopScore: stopScores.get(g.id) ?? 0,
    position: 0,
    cut: eliminated.get(g.id) ?? false,
  }));
  // Sink eliminated golfers below the survivors (positional); a stableford board has none flagged.
  rows.sort((a, b) => (a.cut ? 1 : 0) - (b.cut ? 1 : 0) || b.total - a.total || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.position = i + 1));

  const survivorTarget = board.mode === 'positional' && !currentIsBoss ? arcSurvivorTarget(run.stopIndex, ascensionCutBonus(run.ascension)) : undefined;
  return {
    field,
    standings: rows,
    cut: survivorTarget ?? effectiveCut(run, holesForStop(run, run.stopIndex)),
    survivors: rows.filter((s) => !s.isPlayer && !s.cut).length,
    thru,
    hasScores: true,
    mode: board.mode,
    survivorTarget,
  };
}

/**
 * The player's LIVE leaderboard position mid-stop (GS-100) — drives the per-hole "you're Nth" play-HUD
 * chip. A thin projection of `liveLeaderboard` onto the player's row. Pure/deterministic.
 */
export function livePosition(run: Run, holesPlayed: number, playerStopSF: number): LivePosition {
  const board = liveLeaderboard(run, holesPlayed, playerStopSF);
  const me = board.standings.find((s) => s.isPlayer)!;
  const lead = board.standings[0]?.total ?? 0;
  return { position: me.position, total: me.total, of: board.standings.length, gapToLead: lead - me.total };
}
