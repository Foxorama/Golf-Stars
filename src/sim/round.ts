/**
 * Round simulation — plays a hole end-to-end from a seed, headlessly.
 *
 * This is where clubs + shot + lie + scoring meet. Pure and deterministic: a fixed
 * seed plays the same hole the same way every time, so tests assert on outcomes and
 * any bug reproduces by its seed. The renderer will later animate exactly these shots.
 */

import { dist, type FeatureKind, type Hole, type Vec } from './course/contract';
import { CLUBS, clubDist, suggestClub, type Club, type ClubStats } from './clubs';
import {
  dispersionProfile,
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
/** Max strokes over par before you pick up (max-score rule). Hole ends, score = par + this. */
export const MAX_OVER_PAR = 4;
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
  /** True if the hole was picked up at the max-score cap (par + MAX_OVER_PAR). */
  pickedUp: boolean;
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

/**
 * Out-of-bounds boundary: the course-space box bounding ALL of a hole's terrain
 * (features, hazards, centreline, tee, green), expanded by a generous, hole-size-scaled
 * margin so only genuinely wild shots — well clear of any drawn terrain — count as OB.
 * Pure. (Fairness invariant: penalty surfaces stay off the corridor; OB is the boundary
 * for shots sprayed off the whole map, where stroke-and-distance is the fair golf rule.)
 */
export function playBounds(hole: Hole): { min: Vec; max: Vec } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (p: Vec): void => {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  };
  for (const f of hole.features) for (const p of f.poly) eat(p);
  for (const f of hole.hazards) for (const p of f.poly) eat(p);
  for (const p of hole.centreline) eat(p);
  eat(hole.tee);
  eat(hole.green);
  const span = Math.max(maxX - minX, maxY - minY, dist(hole.tee, hole.green));
  const m = Math.max(40, span * 0.25);
  return { min: [minX - m, minY - m], max: [maxX + m, maxY + m] };
}

/** True if a point is inside the hole's out-of-bounds boundary. */
export function inBounds(hole: Hole, p: Vec): boolean {
  const b = playBounds(hole);
  return p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1];
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
function puttOut(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  maxPutts = 6,
): { putts: number; log: PuttLog[]; holed: boolean } {
  const log: PuttLog[] = [];
  let pos: Vec = from;
  let d = dist(pos, pinPt);
  let putts = 0;
  while (d > HOLE_OUT_RADIUS && putts < maxPutts) {
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
  return { putts, log, holed: d <= HOLE_OUT_RADIUS };
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
  let pickedUp = false;
  const maxStrokes = hole.par + MAX_OVER_PAR;

  for (let swing = 0; swing < MAX_FULL_SWINGS; swing++) {
    const remaining = dist(ball, target);

    // On the green (or effectively there) → switch to putting.
    if (lie === 'green' || remaining <= HOLE_OUT_RADIUS) break;

    // AI decision: lay up to the penalty-free corridor when the line is blocked, and
    // club to leave room for roll-out. The player (interactive driver) makes this choice
    // instead; both then run the SAME executeShot physics.
    const tgt = safeTarget(hole, ball, target);
    const club = aiClub(hole, ball, tgt, carryMult, bag, opts.stats);

    const ex = executeShot(hole, ball, lie, tgt, club, {
      carryMult,
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
    }, rng);
    strokes += 1 + ex.penaltyStrokes;
    penalties += ex.penaltyStrokes;

    // Tee-shot fairway result (par 4/5 only) — based on where the ball physically came
    // to rest, before any penalty drop.
    if (swing === 0 && hole.par >= 4) fairwayHit = ex.restLie === 'fairway';

    shots.push(ex.log);
    ball = ex.ballAfter;
    lie = ex.lieAfter;

    if (ex.holed) {
      holed = true;
      break;
    }
    // Max-score rule: at par + MAX_OVER_PAR strokes, pick up.
    if (strokes >= maxStrokes) {
      pickedUp = true;
      strokes = maxStrokes;
      break;
    }
    if (lie === 'green' || dist(ball, target) <= HOLE_OUT_RADIUS) break;
  }

  // Putt out (unless already holed or picked up), within the remaining stroke budget.
  const puttLog: PuttLog[] = [];
  if (!holed && !pickedUp) {
    const remaining = dist(ball, target);
    if (remaining <= HOLE_OUT_RADIUS) {
      holed = true;
    } else {
      const out = puttOut(rng, ball, target, Math.max(1, maxStrokes - strokes));
      putts = out.putts;
      puttLog.push(...out.log);
      strokes += putts;
      if (out.holed) holed = true;
      else {
        pickedUp = true;
        strokes = maxStrokes;
      }
    }
  }

  const record: HoleRecord = { par: hole.par, strokes };
  const stat: HoleStat = { par: hole.par, strokes, putts, penalties, fairwayHit };
  return { record, stat, shots, putts: puttLog, holed, pickedUp };
}

/** Play every hole of a course in order; returns per-hole results. */
export function playCourse(
  holes: Hole[],
  rng: Rng,
  opts: PlayHoleOptions = {},
): PlayedHole[] {
  return holes.map((h) => playHole(h, rng, opts));
}

export interface ExecOpts {
  carryMult: number;
  dispersionMult?: number;
  stats?: ClubStats;
}

export interface ExecResult {
  log: ShotLog;
  /** Where the ball ends up for the next shot (after any penalty drop). */
  ballAfter: Vec;
  lieAfter: FeatureKind;
  /** Lie where the ball physically came to rest (before a penalty drop). */
  restLie: FeatureKind;
  penaltyStrokes: number;
  holed: boolean;
}

/**
 * Resolve ONE full shot — wind-compensated aim, flight, bounce/roll-out, penalty, and
 * hole-out — given an explicit `target` and `club`. Shared by the AI (playHole) and the
 * interactive player driver so both obey identical physics. Pure: randomness from `rng`.
 */
export function executeShot(
  hole: Hole,
  from: Vec,
  lie: FeatureKind,
  target: Vec,
  club: Club,
  opts: ExecOpts,
  rng: Rng,
): ExecResult {
  const carryMult = opts.carryMult;
  const shotBearing = bearingDeg(from, target);
  const aim = aimWithWind(from, target, hole.wind, shotBearing, club.carry * carryMult);
  const result = resolveShot({
    from,
    aim,
    club,
    lie,
    wind: hole.wind,
    carryMult,
    dispersionMult: opts.dispersionMult,
    stats: opts.stats,
    rng,
  });

  // Touchdown → bounce & roll out (unless it plugs in a penalty surface).
  const touchdown = result.landing;
  const tdLie = lieAt(hole, touchdown);
  let rest: Vec = touchdown;
  let roll = 0;
  if (!lieInfo(tdLie).penalty) {
    roll = rollYards(tdLie, result.carry, rng);
    if (roll > 0) {
      const dx = touchdown[0] - from[0];
      const dy = touchdown[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      rest = [touchdown[0] + (dx / len) * roll, touchdown[1] + (dy / len) * roll];
    }
  }

  const restLie = lieAt(hole, rest);
  const li = lieInfo(restLie);
  const log: ShotLog = { from, result, lieFrom: lie, lieTo: restLie, club, rest, roll, holed: false };

  let ballAfter: Vec = rest;
  let lieAfter: FeatureKind = restLie;
  let penaltyStrokes = 0;
  let holed = false;
  if (li.penalty) {
    const pen = PEN_INFO[li.penalty];
    penaltyStrokes = pen.strokes;
    log.penalty = li.penalty;
    if (pen.replay) {
      ballAfter = from;
      lieAfter = lie;
    } else {
      const drop = dropPoint(hole, from, rest);
      ballAfter = drop;
      lieAfter = lieAt(hole, drop);
    }
  } else if (!inBounds(hole, rest)) {
    // Out of bounds: stroke-and-distance — +1 penalty and replay from the shot's origin.
    penaltyStrokes = PEN_INFO.ob.strokes;
    log.penalty = 'ob';
    ballAfter = from;
    lieAfter = lie;
  } else if (dist(rest, pin(hole)) <= HOLE_OUT_RADIUS) {
    log.holed = true;
    holed = true;
  }

  return { log, ballAfter, lieAfter, restLie, penaltyStrokes, holed };
}

/** Deterministic spread of a contemplated shot — the mean + std-devs `resolveShot`
 *  samples from, computed WITHOUT consuming rng. Lets the UI draw an honest "where can
 *  it go" spray cone before the player commits. Pure. */
export interface ShotSpread {
  /** Ball position (course space). */
  origin: Vec;
  /** Shot bearing toward the target (deg, cw from up). */
  bearing: number;
  /** Mean carry (yards), after lie, biome and wind — the cone's centre reach. */
  expectedCarry: number;
  /** Nearest the ball may come up (yards) — the shot can fall well short. */
  carryLow: number;
  /** Furthest the ball may carry (yards). */
  carryHigh: number;
  /** Lateral std-dev (yards) at landing — the render scales this by its tier z-values. */
  lateralSd: number;
  /** Along-axis (distance) std-dev (yards). */
  carrySd: number;
}

export function shotSpread(
  hole: Hole,
  from: Vec,
  lie: FeatureKind,
  target: Vec,
  club: Club,
  opts: { carryMult?: number; dispersionMult?: number; stats?: ClubStats } = {},
): ShotSpread {
  const carryMult = opts.carryMult ?? biomeCarryMult(hole);
  const li = lieInfo(lie);
  const shotBearing = bearingDeg(from, target);
  const nominal = clubDist(club, opts.stats);
  const intended = nominal * li.carryMult * carryMult;
  const w = hole.wind ? playWind(hole.wind, shotBearing) : { along: 0, cross: 0 };
  const dispMult = li.dispersionMult * (opts.dispersionMult ?? 1);
  const prof = dispersionProfile(nominal);
  const along = w.along * TUNABLES.windCarryPerMph;
  const low = intended * prof.lowFrac;
  const high = intended * prof.highFrac;
  const mean = Math.max(low, Math.min(high, intended * prof.meanFrac + along));
  return {
    origin: from,
    bearing: shotBearing,
    expectedCarry: mean,
    carryLow: Math.max(0, low + along),
    carryHigh: high + along,
    lateralSd: intended * prof.lateralFrac * dispMult,
    carrySd: intended * prof.carryFrac * dispMult,
  };
}

/** The club the AI would choose for a target: reach the plays-like distance, minus a
 *  roll allowance, gravity-adjusted. The interactive driver uses this as its suggestion. */
export function aiClub(
  hole: Hole,
  from: Vec,
  target: Vec,
  carryMult: number,
  bag: readonly Club[],
  stats?: ClubStats,
): Club {
  const shotBearing = bearingDeg(from, target);
  const playLike = playsLike(dist(from, target), hole.wind, shotBearing);
  const rollAllowance = Math.min(MAX_ROLL, playLike * 0.1);
  return suggestClub(Math.max(1, playLike - rollAllowance) / carryMult, 'reach', bag, stats);
}

/** Pin location (exported for the interactive driver). */
export function pinOf(hole: Hole): Vec {
  return pin(hole);
}

/** Lay-up target: the penalty-free corridor point ahead of the ball (exported). */
export function layupTarget(hole: Hole, ball: Vec): Vec {
  return safeTarget(hole, ball, pin(hole));
}

/** Auto putt-out from a position (exported for the interactive driver). */
export function puttOutFrom(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  maxPutts = 6,
): { putts: number; log: PuttLog[]; holed: boolean } {
  return puttOut(rng, from, pinPt, maxPutts);
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
