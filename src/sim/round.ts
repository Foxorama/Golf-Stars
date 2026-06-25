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
  playWind,
  PEN_INFO,
  resolveShot,
  TUNABLES,
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
  /** Final rest position after the ball bounces & rolls out from `result.landing`. */
  rest: Vec;
  /** Roll-out distance (yards) from touchdown to rest. */
  roll: number;
  /** True if this shot holed the ball (chip-in / hole-in-one). */
  holed: boolean;
}

/** Roll-out as a fraction of carry, by the surface the ball lands on. Slick ice runs;
 *  bunkers kill it; fairway and tee run out the most. */
const ROLL_FACTOR: Record<string, number> = {
  fairway: 0.16,
  tee: 0.16,
  green: 0.09,
  rough: 0.05,
  waste: 0.08,
  bunker: 0.0,
  ice: 0.32,
  crystal: 0.14,
};
const MAX_ROLL = 42;

function rollYards(lie: FeatureKind, carry: number, rng: Rng): number {
  const f = ROLL_FACTOR[lie] ?? 0.06;
  return Math.max(0, Math.min(MAX_ROLL, carry * f * rng.range(0.7, 1.1)));
}

/** A single putt's roll on the green, for the play view to animate (flat, no arc). */
export interface PuttLog {
  from: Vec;
  to: Vec;
  holed: boolean;
}

export interface PlayedHole {
  record: HoleRecord;
  stat: HoleStat;
  shots: ShotLog[];
  /** Putts on the green, in order; the last one is holed. */
  putts: PuttLog[];
  holed: boolean;
}

export interface PlayHoleOptions {
  bag?: readonly Club[];
  stats?: ClubStats;
  /** Carry multiplier from biome mods (e.g. low gravity). */
  carryMult?: number;
  /** Player dispersion multiplier (<1 = a forgiveness perk). */
  dispersionMult?: number;
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

/**
 * Putt out from `from` toward `pin`, returning the putt count and the roll path (for
 * animation). Deterministic via `rng`. The model is distance-based (no slope yet — that's
 * a later refinement): short putts usually drop, long putts lag close, with a small
 * lateral miss so a missed putt visibly slides past the hole rather than through it.
 */
function puttOut(rng: Rng, from: Vec, pinPt: Vec): { putts: number; log: PuttLog[] } {
  const log: PuttLog[] = [];
  let pos: Vec = from;
  let d = dist(pos, pinPt);
  let putts = 0;
  while (d > HOLE_OUT_RADIUS && putts < 6) {
    putts++;
    let newD: number;
    if (d <= 2.2) {
      newD = rng.bool(0.85) ? 0 : rng.range(0.4, 1.0); // makeable: usually drops
    } else {
      newD = Math.abs(rng.gaussian(d * 0.07, d * 0.05)); // lag close
    }
    const holed = newD <= HOLE_OUT_RADIUS;
    let to: Vec;
    if (holed) {
      to = pinPt;
    } else {
      // Place the ball `newD` from the pin along the pin→ball line, nudged laterally so
      // the miss reads as sliding past the hole.
      let dx = pos[0] - pinPt[0];
      let dy = pos[1] - pinPt[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const lateral = rng.gaussian(0, newD * 0.3);
      to = [pinPt[0] + dx * newD - dy * lateral, pinPt[1] + dy * newD + dx * lateral];
    }
    log.push({ from: pos, to, holed });
    pos = to;
    d = holed ? 0 : dist(pos, pinPt);
  }
  return { putts, log };
}

/**
 * Play a single hole. Strategy: aim at the pin, choose the club that just reaches the
 * plays-like distance, take recoveries from wherever the ball ends up, then putt out.
 */
/** Net carry multiplier from a hole's biome mods (gravity), unless overridden. */
export function biomeCarryMult(hole: Hole): number {
  let m = 1;
  for (const mod of hole.biomeMods ?? []) {
    if (mod.kind === 'carry' && typeof mod.value === 'number') m *= mod.value;
  }
  return m;
}

export function playHole(hole: Hole, rng: Rng, opts: PlayHoleOptions = {}): PlayedHole {
  const bag = opts.bag ?? CLUBS;
  const target = pin(hole);
  const carryMult = opts.carryMult ?? biomeCarryMult(hole);

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

    // If the line to the pin is blocked by a penalty hazard, don't fire over it — lay
    // up to the centreline corridor (penalty-free by the fairness invariant). A player
    // reads the trouble and pitches back into play rather than spiralling.
    const tgt = safeTarget(hole, ball, target);
    const aimDist = dist(ball, tgt);
    const shotBearing = bearingDeg(ball, tgt);
    const playLike = playsLike(aimDist, hole.wind, shotBearing);
    // Club for the EFFECTIVE carry: gravity scales how far a club flies, so divide the
    // target by the carry multiplier before picking (low-grav → club down). Also leave
    // room for roll-out — aim to land short so the run finishes near the target instead
    // of carrying all the way and rolling past it.
    const rollAllowance = Math.min(MAX_ROLL, playLike * 0.1);
    const club = suggestClub(Math.max(1, playLike - rollAllowance) / carryMult, 'reach', bag, opts.stats);

    // Read the wind: aim UPWIND so the crosswind drifts the ball back to target. This
    // is the "wind reads true off the shot bearing" promise — a played shot compensates
    // for known wind rather than spraying into trouble.
    const aim = aimWithWind(ball, tgt, hole.wind, shotBearing, club.carry * carryMult);

    const result = resolveShot({
      from: ball,
      aim,
      club,
      lie,
      wind: hole.wind,
      carryMult,
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
      rng,
    });
    strokes++;

    // Touchdown (end of carry), then bounce & roll out along the travel direction —
    // unless the ball plugs in a penalty surface, which kills the roll.
    const touchdown = result.landing;
    const tdLie = lieAt(hole, touchdown);
    let rest: Vec = touchdown;
    let roll = 0;
    if (!lieInfo(tdLie).penalty) {
      roll = rollYards(tdLie, result.carry, rng);
      if (roll > 0) {
        let dx = touchdown[0] - ball[0];
        let dy = touchdown[1] - ball[1];
        const len = Math.hypot(dx, dy) || 1;
        rest = [touchdown[0] + (dx / len) * roll, touchdown[1] + (dy / len) * roll];
      }
    }

    let landingLie = lieAt(hole, rest);
    const li = lieInfo(landingLie);
    const log: ShotLog = {
      from: ball,
      result,
      lieFrom: lie,
      lieTo: landingLie,
      club,
      rest,
      roll,
      holed: false,
    };

    if (li.penalty) {
      const pen = PEN_INFO[li.penalty];
      penalties += pen.strokes;
      strokes += pen.strokes;
      log.penalty = li.penalty;
      if (pen.replay) {
        // Stroke-and-distance: replay from the same spot, lie unchanged.
        landingLie = lie;
      } else {
        const drop = dropPoint(hole, ball, rest);
        ball = drop;
        lie = lieAt(hole, drop);
      }
    } else {
      ball = rest;
      lie = landingLie;
      // Holed from a full shot — a chip-in or, off the tee, a hole-in-one.
      if (dist(rest, target) <= HOLE_OUT_RADIUS) {
        log.holed = true;
        holed = true;
      }
    }

    // Tee-shot fairway result (par 4/5 only).
    if (swing === 0 && hole.par >= 4) fairwayHit = landingLie === 'fairway';

    shots.push(log);

    if (log.holed || lie === 'green' || dist(ball, target) <= HOLE_OUT_RADIUS) break;
  }

  // Putt out.
  const puttLog: PuttLog[] = [];
  const remaining = dist(ball, target);
  if (remaining <= HOLE_OUT_RADIUS) {
    holed = true;
  } else {
    const out = puttOut(rng, ball, target);
    putts = out.putts;
    puttLog.push(...out.log);
    strokes += putts;
    holed = true;
  }

  const record: HoleRecord = { par: hole.par, strokes };
  const stat: HoleStat = { par: hole.par, strokes, putts, penalties, fairwayHit };
  return { record, stat, shots, putts: puttLog, holed };
}

/** Play every hole of a course in order; returns per-hole results. */
export function playCourse(
  holes: Hole[],
  rng: Rng,
  opts: PlayHoleOptions = {},
): PlayedHole[] {
  return holes.map((h) => playHole(h, rng, opts));
}

/** True if the straight line from→to is free of penalty surfaces (sampled). */
function clearLine(hole: Hole, from: Vec, to: Vec): boolean {
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p: Vec = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    if (lieInfo(lieAt(hole, p)).penalty) return false;
  }
  return true;
}

/** A point a fraction `t` (by arc length) along a polyline. */
function pointAlong(line: Vec[], t: number): Vec {
  if (line.length === 1) return line[0]!;
  const total = dist(line[0]!, line[1]!) + (line[2] ? dist(line[1]!, line[2]!) : 0);
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++) {
    const segLen = dist(line[i - 1]!, line[i]!);
    if (want <= segLen || i === line.length - 1) {
      const u = segLen ? want / segLen : 0;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    want -= segLen;
  }
  return line[line.length - 1]!;
}

/**
 * Choose where to aim: the pin if the line is clear, else a layup point on the
 * centreline corridor ahead of the ball (guaranteed penalty-free), so a ball in trouble
 * pitches back into play instead of repeatedly firing over a hazard.
 */
function safeTarget(hole: Hole, ball: Vec, pinPt: Vec): Vec {
  if (clearLine(hole, ball, pinPt)) return pinPt;
  // Project the ball onto the centreline (sampled), then advance toward the green.
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const p = pointAlong(hole.centreline, t);
    const d = dist(p, ball);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return pointAlong(hole.centreline, Math.min(1, bestT + 0.2));
}

/**
 * Offset the aim point upwind so the expected crosswind drift lands the ball on target.
 * `carry` is the effective (gravity-scaled) carry the shot is expected to fly.
 */
function aimWithWind(
  from: Vec,
  target: Vec,
  wind: Hole['wind'],
  shotBearingDeg: number,
  carry: number,
): Vec {
  if (!wind) return target;
  const { cross } = playWind(wind, shotBearingDeg);
  const drift = cross * TUNABLES.windLateralPerMph; // +drift pushes to the shot's right
  if (drift === 0) return target;
  // Right-perpendicular of the shot bearing (matches resolveShot's lateral convention).
  const br = (shotBearingDeg * Math.PI) / 180;
  const fx = Math.sin(br);
  const fy = Math.cos(br);
  const rx = fy;
  const ry = -fx;
  // Aim opposite the drift, scaled to the fraction of the carry this shot covers.
  const frac = carry > 0 ? Math.min(1, Math.hypot(target[0] - from[0], target[1] - from[1]) / carry) : 1;
  const comp = -drift * frac;
  return [target[0] + rx * comp, target[1] + ry * comp];
}

// Local copy of the up-screen bearing in degrees (avoids importing for one call site).
function bearingDeg(from: Vec, to: Vec): number {
  const deg = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}
