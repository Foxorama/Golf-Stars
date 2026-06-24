/**
 * Round simulation — plays a hole end-to-end from a seed, headlessly.
 *
 * This is where clubs + shot + lie + scoring meet. Pure and deterministic: a fixed
 * seed plays the same hole the same way every time, so tests assert on outcomes and
 * any bug reproduces by its seed. The renderer will later animate exactly these shots.
 */

import { dist, type FeatureKind, type Hole, type Vec } from './course/contract';
import { CLUBS, suggestClub, type Club, type ClubStats } from './clubs';
import {
  lieAt,
  lieInfo,
  playsLike,
  PEN_INFO,
  resolveShot,
  type ShotResult,
} from './shot';
import type { HoleRecord } from './score';
import type { HoleStat } from './stats';
import type { Rng } from './rng';

/** Ball within this many yards of the pin counts as holed. */
export const HOLE_OUT_RADIUS = 1.2;
/** Hard cap on full swings so a pathological hole can't loop forever. */
const MAX_FULL_SWINGS = 20;

export interface ShotLog {
  from: Vec;
  result: ShotResult;
  lieFrom: FeatureKind;
  lieTo: FeatureKind;
  club: Club;
  penalty?: string;
}

export interface PlayedHole {
  record: HoleRecord;
  stat: HoleStat;
  shots: ShotLog[];
  holed: boolean;
}

export interface PlayHoleOptions {
  bag?: readonly Club[];
  stats?: ClubStats;
  /** Carry multiplier from biome mods (e.g. low gravity). */
  carryMult?: number;
}

/** Pin location. For the stub that's the green centroid (its generated centre). */
function pin(hole: Hole): Vec {
  return hole.green;
}

/** Find a legal drop after a no-replay penalty: walk back toward the prior spot. */
function dropPoint(hole: Hole, from: Vec, landing: Vec): Vec {
  for (let t = 0.85; t > 0; t -= 0.15) {
    const p: Vec = [from[0] + (landing[0] - from[0]) * t, from[1] + (landing[1] - from[1]) * t];
    if (!lieInfo(lieAt(hole, p)).penalty) return p;
  }
  return from;
}

/** Putt out from a distance, returning putts taken. Deterministic via `rng`. */
function puttOut(rng: Rng, distToPin: number): number {
  let d = distToPin;
  let putts = 0;
  while (d > HOLE_OUT_RADIUS && putts < 6) {
    putts++;
    if (d <= 2.2) {
      // Makeable: usually holed, occasionally a tap-in remains.
      d = rng.bool(0.85) ? 0 : rng.range(0.4, 1.0);
    } else {
      // Lag: leave it close, proportional to length, never negative.
      d = Math.abs(rng.gaussian(d * 0.07, d * 0.05));
    }
  }
  return putts;
}

/**
 * Play a single hole. Strategy: aim at the pin, choose the club that just reaches the
 * plays-like distance, take recoveries from wherever the ball ends up, then putt out.
 */
export function playHole(hole: Hole, rng: Rng, opts: PlayHoleOptions = {}): PlayedHole {
  const bag = opts.bag ?? CLUBS;
  const target = pin(hole);

  let ball: Vec = [...hole.tee] as Vec;
  let lie: FeatureKind = 'tee';
  let strokes = 0;
  let penalties = 0;
  let putts = 0;
  let fairwayHit: boolean | null = hole.par >= 4 ? false : null;
  const shots: ShotLog[] = [];
  let holed = false;

  for (let swing = 0; swing < MAX_FULL_SWINGS; swing++) {
    const remaining = dist(ball, target);

    // On the green (or effectively there) → switch to putting.
    if (lie === 'green' || remaining <= HOLE_OUT_RADIUS) break;

    const playLike = playsLike(remaining, hole.wind, bearingDeg(ball, target));
    const club = suggestClub(playLike, 'reach', bag, opts.stats);

    const result = resolveShot({
      from: ball,
      aim: target,
      club,
      lie,
      wind: hole.wind,
      carryMult: opts.carryMult,
      stats: opts.stats,
      rng,
    });
    strokes++;

    let landingLie = lieAt(hole, result.landing);
    const li = lieInfo(landingLie);
    const log: ShotLog = { from: ball, result, lieFrom: lie, lieTo: landingLie, club };

    if (li.penalty) {
      const pen = PEN_INFO[li.penalty];
      penalties += pen.strokes;
      strokes += pen.strokes;
      log.penalty = li.penalty;
      if (pen.replay) {
        // Stroke-and-distance: replay from the same spot, lie unchanged.
        landingLie = lie;
      } else {
        const drop = dropPoint(hole, ball, result.landing);
        ball = drop;
        lie = lieAt(hole, drop);
      }
    } else {
      ball = result.landing;
      lie = landingLie;
    }

    // Tee-shot fairway result (par 4/5 only).
    if (swing === 0 && hole.par >= 4) fairwayHit = landingLie === 'fairway';

    shots.push(log);

    if (lie === 'green' || dist(ball, target) <= HOLE_OUT_RADIUS) break;
  }

  // Putt out.
  const remaining = dist(ball, target);
  if (remaining <= HOLE_OUT_RADIUS) {
    holed = true;
  } else {
    putts = puttOut(rng, remaining);
    strokes += putts;
    holed = true;
  }

  const record: HoleRecord = { par: hole.par, strokes };
  const stat: HoleStat = { par: hole.par, strokes, putts, penalties, fairwayHit };
  return { record, stat, shots, holed };
}

/** Play every hole of a course in order; returns per-hole results. */
export function playCourse(
  holes: Hole[],
  rng: Rng,
  opts: PlayHoleOptions = {},
): PlayedHole[] {
  return holes.map((h) => playHole(h, rng, opts));
}

// Local copy of the up-screen bearing in degrees (avoids importing for one call site).
function bearingDeg(from: Vec, to: Vec): number {
  const deg = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}
