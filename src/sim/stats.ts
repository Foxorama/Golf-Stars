/**
 * PLAY-STATS-CORE — pure, DOM-free, no-globals stats aggregation.
 *
 * This is the "gold pattern" the kit calls out: a region that is unit-tested straight
 * from Node because it touches nothing but its inputs. The whole sim follows this
 * shape. Feed it per-hole records, get a run summary out — no side effects.
 */

export interface HoleStat {
  par: number;
  /** Total strokes including putts and penalty strokes. */
  strokes: number;
  putts: number;
  /** Penalty strokes incurred on the hole. */
  penalties: number;
  /**
   * Whether the tee shot found the fairway. `null`/absent on par-3s (no fairway
   * chance off the tee) so they're excluded from the fairway percentage.
   */
  fairwayHit?: boolean | null;
}

export interface StatsSummary {
  holes: number;
  totalStrokes: number;
  totalPar: number;
  toPar: number;
  /** Strokes per hole. */
  scoringAvg: number;

  fairwaysHit: number;
  fairwayChances: number;
  /** 0..1, or null if no chances (e.g. all par-3s). */
  fairwayPct: number | null;

  /** Greens in regulation: reached the green in (par − 2) strokes or fewer. */
  girCount: number;
  girPct: number;

  totalPutts: number;
  puttsPerHole: number;

  penalties: number;

  birdiesOrBetter: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
}

/** Strokes used to reach the green = total strokes minus putts on the green. */
function strokesToGreen(h: HoleStat): number {
  return Math.max(0, h.strokes - h.putts);
}

/** Green-in-regulation: on the green in (par − 2) or fewer. */
function isGir(h: HoleStat): boolean {
  return strokesToGreen(h) <= h.par - 2;
}

export function psAggregate(holes: HoleStat[]): StatsSummary {
  const n = holes.length;
  let totalStrokes = 0;
  let totalPar = 0;
  let fairwaysHit = 0;
  let fairwayChances = 0;
  let girCount = 0;
  let totalPutts = 0;
  let penalties = 0;
  let birdiesOrBetter = 0;
  let pars = 0;
  let bogeys = 0;
  let doublePlus = 0;

  for (const h of holes) {
    totalStrokes += h.strokes;
    totalPar += h.par;
    totalPutts += h.putts;
    penalties += h.penalties;

    if (h.fairwayHit !== null && h.fairwayHit !== undefined) {
      fairwayChances++;
      if (h.fairwayHit) fairwaysHit++;
    }
    if (isGir(h)) girCount++;

    const d = h.strokes - h.par;
    if (d <= -1) birdiesOrBetter++;
    else if (d === 0) pars++;
    else if (d === 1) bogeys++;
    else doublePlus++;
  }

  return {
    holes: n,
    totalStrokes,
    totalPar,
    toPar: totalStrokes - totalPar,
    scoringAvg: n ? totalStrokes / n : 0,
    fairwaysHit,
    fairwayChances,
    fairwayPct: fairwayChances ? fairwaysHit / fairwayChances : null,
    girCount,
    girPct: n ? girCount / n : 0,
    totalPutts,
    puttsPerHole: n ? totalPutts / n : 0,
    penalties,
    birdiesOrBetter,
    pars,
    bogeys,
    doublePlus,
  };
}
