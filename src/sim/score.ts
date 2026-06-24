/**
 * Scoring model: gross/net totals, Stableford points, course handicap, and
 * strokes-received-by-stroke-index. Reimplemented from the harvest manifest.
 *
 * Stableford suits a roguelike (points per hole → run score, a blow-up hole caps at
 * 0 instead of wrecking the run), so it's the headline metric here. Net/handicap math
 * is reusable but optional for a game — a scratch run just passes no handicap.
 */

export interface HoleRecord {
  par: number;
  /** Total strokes taken on the hole (including any penalty strokes). */
  strokes: number;
  /** Stroke index 1..18 (1 = hardest). Optional; absent ⇒ no handicap strokes. */
  si?: number;
}

/**
 * USGA-style course handicap: HI × (slope/113) + (courseRating − par).
 * Rounded to the nearest integer. A game can ignore this entirely (scratch).
 */
export function courseHandicap(
  handicapIndex: number,
  slope = 113,
  courseRating?: number,
  par?: number,
): number {
  const ratingAdj = courseRating !== undefined && par !== undefined ? courseRating - par : 0;
  return Math.round(handicapIndex * (slope / 113) + ratingAdj);
}

/**
 * Handicap strokes received on a hole of stroke index `si`, given a course handicap.
 * Strokes wrap: everyone gets floor(CH/18) on every hole, plus one more on the
 * hardest CH%18 holes. Negative handicaps (plus golfers) give strokes back.
 */
export function strokesForSI(courseHcp: number, si: number): number {
  if (si < 1 || si > 18) return 0;
  const base = Math.trunc(courseHcp / 18);
  const remainder = courseHcp % 18; // can be negative for plus handicaps
  if (remainder >= 0) {
    return base + (si <= remainder ? 1 : 0);
  }
  // Plus handicap: take a stroke back on the easiest |remainder| holes.
  return base + (si > 18 + remainder ? -1 : 0);
}

/** Stableford points for a single hole given net strokes vs par. Floored at 0. */
export function stablefordPoints(par: number, netStrokes: number): number {
  return Math.max(0, par - netStrokes + 2);
}

export interface PlayTotals {
  holesPlayed: number;
  gross: number;
  net: number;
  stableford: number;
  /** Score relative to par (gross − total par). */
  toPar: number;
  totalPar: number;
}

/**
 * Aggregate a set of hole records into run totals. `courseHcp` is optional; omit it
 * for a scratch run (net == gross, Stableford uses gross strokes vs par).
 */
export function playTotals(records: HoleRecord[], courseHcp = 0): PlayTotals {
  let gross = 0;
  let net = 0;
  let stableford = 0;
  let totalPar = 0;

  for (const r of records) {
    const hcpStrokes = r.si !== undefined ? strokesForSI(courseHcp, r.si) : 0;
    const netStrokes = r.strokes - hcpStrokes;
    gross += r.strokes;
    net += netStrokes;
    totalPar += r.par;
    stableford += stablefordPoints(r.par, netStrokes);
  }

  return {
    holesPlayed: records.length,
    gross,
    net,
    stableford,
    totalPar,
    toPar: gross - totalPar,
  };
}

/** Name of a single-hole score relative to par (for HUD/cards). */
export function scoreName(par: number, strokes: number): string {
  const d = strokes - par;
  if (strokes === 1) return 'Hole-in-One';
  switch (d) {
    case -3:
      return 'Albatross';
    case -2:
      return 'Eagle';
    case -1:
      return 'Birdie';
    case 0:
      return 'Par';
    case 1:
      return 'Bogey';
    case 2:
      return 'Double Bogey';
    default:
      return d < 0 ? `${-d} under` : `+${d}`;
  }
}
