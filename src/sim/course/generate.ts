/**
 * Procedural course generator — seed → Course, driven by the biome table + wildness.
 *
 * Wildness/biome system (GS-1): the biome row picks gravity (carry), wind, hazard kinds,
 * scatter surfaces, corridor tightness, and dogleg bias; `wildness` (grows with galaxy
 * distance) turns all of those up. Everything slots behind the frozen contract — the
 * renderer and sim never change shape.
 *
 * Fairness by construction (golf-soul lens): penalty hazards are placed CLEAR of the
 * tee→green play corridor (the line the sim actually plays), so a sensible shot is never
 * unfairly killed. The spice is in-play, non-penalty lies (ice/crystal/low-grav) plus
 * tighter corridors, doglegs, and wind. `validateFairness` proves it post-hoc.
 *
 * Fully deterministic: same (seed, version, opts) → identical course.
 */

import { Rng } from '../rng';
import { RARITIES, RARITY_C } from '../rpg/loot';
import { BIOMES, pickBiome, type Biome } from './biomes';
import { lieInfo } from '../shot';
import {
  bearing,
  pathLength,
  polylineDist,
  segDist,
  validateCourse,
  type BiomeMod,
  type Course,
  type Feature,
  type Hole,
  type Rarity,
  type Vec,
  type Wind,
} from './contract';

/** Bump when the generation algorithm changes in a way that alters output. */
export const GENERATOR_VERSION = 2;

export interface GenerateOptions {
  /** Number of holes (default 1 — the vertical slice). */
  holes?: number;
  /** Galaxy distance from start; scales difficulty/wildness when not given explicitly. */
  distanceFromStart?: number;
  /** 0..1ish wildness override; otherwise derived from distance. */
  wildness?: number;
  /** Force a specific biome by id (otherwise weighted-random). */
  biome?: string;
  /** Cap every hole's par (3 = all par-3s). Omit for the normal 3/4/5 mix. */
  parCap?: 3 | 4 | 5;
}

const NAME_PREFIX = ['Kepler', 'Vega', 'Lyra', 'Orion', 'Cygnus', 'Helix', 'Pulsar', 'Nyx'];
const NAME_SUFFIX = ['Links', 'Greens', 'Fairways', 'Range', 'Crater Club', 'Dunes'];

/** Sample a rarity by RARITY_C weight. */
function pickRarity(rng: Rng): Rarity {
  const total = RARITIES.reduce((s, r) => s + RARITY_C[r].weight, 0);
  let t = rng.range(0, total);
  for (const r of RARITIES) {
    t -= RARITY_C[r].weight;
    if (t <= 0) return r;
  }
  return 'common';
}

/** Approximate a circle as an n-gon with optional radial jitter for an organic edge. */
function blobPoly(center: Vec, radius: number, n: number, jitter: number, rng: Rng): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (1 + (jitter ? rng.range(-jitter, jitter) : 0));
    pts.push([center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r]);
  }
  return pts;
}

/** Build a corridor polygon of given half-width around a centreline polyline. */
function corridorPoly(line: Vec[], halfWidth: number): Vec[] {
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < line.length; i++) {
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(line.length - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy; // left normal
    const ny = dx;
    const p = line[i]!;
    left.push([p[0] + nx * halfWidth, p[1] + ny * halfWidth]);
    right.push([p[0] - nx * halfWidth, p[1] - ny * halfWidth]);
  }
  return [...left, ...right.reverse()];
}

/**
 * Clearance a point of radius `r` must keep from the play corridor for a *penalty*
 * hazard to be fair. The corridor here is both the centreline AND the direct tee→green
 * chord (the line the greedy sim actually plays).
 */
function clearsPlayCorridor(
  c: Vec,
  r: number,
  centreline: Vec[],
  tee: Vec,
  green: Vec,
  halfWidth: number,
): boolean {
  const margin = halfWidth + r + 4;
  return polylineDist(c, centreline) > margin && segDist(c, tee, green) > margin;
}

function generateHole(rng: Rng, biome: Biome, wildness: number, parCap?: 3 | 4 | 5): Hole {
  const parRoll = rng.float();
  // Always draw parRoll (keeps the RNG stream identical whether or not a cap is set),
  // then clamp to the cap so an all-par-3 ladder stop is just min(par, 3).
  const par = Math.min(parRoll < 0.25 ? 3 : parRoll < 0.8 ? 4 : 5, parCap ?? 5);

  // Hole length (yards) by par. Low gravity (carryMult > 1) lengthens holes so they
  // stay challenging despite longer carries.
  const baseLen = par === 3 ? 165 : par === 4 ? 400 : 530;
  const length = baseLen * biome.carryMult * rng.range(0.85, 1.12);

  const tee: Vec = [0, 0];

  // Dogleg severity scales with biome bias × wildness.
  const doglegMag = biome.doglegBias * wildness * rng.range(0.1, 0.5) * length;
  const bendSide = rng.bool() ? 1 : -1;
  const midY = length * rng.range(0.45, 0.6);
  const mid: Vec = [bendSide * doglegMag, midY];
  const green: Vec = [bendSide * doglegMag * rng.range(0.3, 0.8), length];

  const centreline: Vec[] = par === 3 ? [tee, green] : [tee, mid, green];

  // Corridor tightens with biome width mult and wildness.
  const widthMult = biome.fairwayWidthMult * (1 - wildness * 0.25);
  const fairwayHalfWidth = (par === 3 ? 16 : 22) * widthMult * rng.range(0.9, 1.2);
  const fairway: Feature = { kind: 'fairway', poly: corridorPoly(centreline, fairwayHalfWidth) };

  const teeBox: Feature = { kind: 'tee', poly: blobPoly(tee, 8, 8, 0, rng) };
  const greenR = rng.range(11, 16);
  const greenF: Feature = { kind: 'green', poly: blobPoly(green, greenR, 14, 0.12, rng) };

  const features: Feature[] = [fairway, teeBox, greenF];
  const hazards: Feature[] = [];

  // Greenside hazards (1–2), just off the green. A penalty-kind greenside hazard must
  // still clear the approach line (fairness) — retry placement, else fall back to sand.
  const greensidePenalty = !!lieInfo(biome.greensideKind).penalty;
  const greensideCount = rng.int(1, 2);
  for (let b = 0; b < greensideCount; b++) {
    const r = rng.range(5, 9);
    const d = greenR + r + rng.range(3, 9);
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const ang = rng.range(0, Math.PI * 2);
      const c: Vec = [green[0] + Math.cos(ang) * d, green[1] + Math.sin(ang) * d];
      if (!greensidePenalty || clearsPlayCorridor(c, r, centreline, tee, green, fairwayHalfWidth)) {
        hazards.push({ kind: biome.greensideKind, poly: blobPoly(c, r, 9, 0.2, rng) });
        placed = true;
      }
    }
    if (!placed) {
      // Couldn't find a fair spot for the penalty kind — a sand bunker is always fair.
      const ang = rng.range(0, Math.PI * 2);
      const c: Vec = [green[0] + Math.cos(ang) * d, green[1] + Math.sin(ang) * d];
      hazards.push({ kind: 'bunker', poly: blobPoly(c, r, 9, 0.2, rng) });
    }
  }

  // Fairway-flanking penalty hazards: count scales with wildness. Placed CLEAR of the
  // play corridor (fairness guarantee) — rejected if they'd block a sensible line.
  const flankAttempts = Math.round(rng.range(0, 1.5) + wildness * 3);
  for (let i = 0; i < flankAttempts; i++) {
    const kind = rng.pick(biome.hazardKinds);
    const r = rng.range(10, 14 + wildness * 12);
    const t = rng.range(0.25, 0.85);
    const side = rng.bool() ? 1 : -1;
    const along: Vec = [mid[0] * t, midY * (t / 0.55)]; // rough point along the hole
    const lateral = fairwayHalfWidth + r + rng.range(4, 22);
    const c: Vec = [along[0] + side * lateral, along[1]];
    if (clearsPlayCorridor(c, r, centreline, tee, green, fairwayHalfWidth)) {
      hazards.push({ kind, poly: blobPoly(c, r, 12, 0.25, rng) });
    }
  }

  // In-play scatter surfaces (non-penalty spice): ice/crystal/waste patches near the
  // landing zones. These CAN sit on the line — they change the lie, not your card.
  for (const sc of biome.scatter) {
    const count = Math.round(sc.freqPerHole * (0.5 + wildness));
    for (let i = 0; i < count; i++) {
      const t = rng.range(0.2, 0.9);
      const along: Vec = [centrePoint(centreline, t)[0], centrePoint(centreline, t)[1]];
      const off = rng.range(-fairwayHalfWidth, fairwayHalfWidth);
      const perp = perpAt(centreline, t);
      const c: Vec = [along[0] + perp[0] * off, along[1] + perp[1] * off];
      const r = rng.range(sc.rMin, sc.rMax);
      // Scatter goes in features (under hazards), so a hazard always wins the lie read.
      features.push({ kind: sc.kind, poly: blobPoly(c, r, 10, 0.2, rng) });
    }
  }

  // Wind: biome base + wildness ramp; vacuum biomes stay near-calm.
  const wind: Wind = {
    dir: rng.range(0, 360),
    spd: biome.windBase + rng.range(0, biome.windWild) * wildness,
  };

  // Carry modifier (gravity), with optional per-hole jitter (antigrav pockets).
  const carry = biome.carryMult * (biome.carryJitter ? 1 + rng.range(-biome.carryJitter, biome.carryJitter) : 1);
  const biomeMods: BiomeMod[] = [{ kind: 'carry', value: carry, note: `${biome.id} gravity` }];

  return { par, tee, green, centreline, features, hazards, wind, biomeMods };
}

/** Point a fraction `t` along a (possibly bent) centreline. */
function centrePoint(line: Vec[], t: number): Vec {
  if (line.length === 2) {
    const a = line[0]!;
    const b = line[1]!;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // Two-segment dogleg: split at the bend.
  const a = line[0]!;
  const m = line[1]!;
  const b = line[2]!;
  if (t < 0.5) {
    const u = t / 0.5;
    return [a[0] + (m[0] - a[0]) * u, a[1] + (m[1] - a[1]) * u];
  }
  const u = (t - 0.5) / 0.5;
  return [m[0] + (b[0] - m[0]) * u, m[1] + (b[1] - m[1]) * u];
}

/** Unit perpendicular to the centreline near fraction `t`. */
function perpAt(line: Vec[], t: number): Vec {
  const a = centrePoint(line, Math.max(0, t - 0.02));
  const b = centrePoint(line, Math.min(1, t + 0.02));
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return [-dy, dx];
}

export function generateCourse(seed: number | string, opts: GenerateOptions = {}): Course {
  const rng = new Rng(seed);
  const distanceFromStart = opts.distanceFromStart ?? 0;
  const wildness =
    opts.wildness ?? Math.min(1, 0.1 + distanceFromStart * 0.05 + rng.range(0, 0.15));

  const holeCount = Math.max(1, opts.holes ?? 1);
  const rarity = pickRarity(rng);
  const biome = opts.biome
    ? BIOMES.find((b) => b.id === opts.biome) ?? pickBiome(rng.float())
    : pickBiome(rng.float());
  const name = `${rng.pick(NAME_PREFIX)} ${rng.pick(NAME_SUFFIX)}`;

  const holes: Hole[] = [];
  for (let i = 0; i < holeCount; i++) holes.push(generateHole(rng, biome, wildness, opts.parCap));

  const course: Course = {
    seed: rng.seed,
    rarity,
    biome: biome.id,
    holes,
    meta: { name, distanceFromStart, wildness },
  };

  const errs = [...validateCourse(course), ...validateFairness(course)];
  if (errs.length) {
    throw new Error(`generateCourse produced an invalid course:\n  ${errs.join('\n  ')}`);
  }
  return course;
}

/**
 * Fairness check (golf-soul invariant): no penalty hazard may sit on the tee→green play
 * corridor. Returns a list of violations (empty = fair). Run by the generator on every
 * course and asserted in tests across many seeds/wildness levels.
 */
export function validateFairness(course: Course): string[] {
  const errs: string[] = [];
  course.holes.forEach((h, i) => {
    const half = fairwayHalfWidthOf(h);
    for (const hz of h.hazards) {
      if (!lieInfo(hz.kind).penalty) continue; // only penalty surfaces must be avoidable
      for (const p of hz.poly) {
        if (polylineDist(p, h.centreline) < half * 0.5 && segDist(p, h.tee, h.green) < half * 0.5) {
          errs.push(`hole[${i}]: penalty hazard '${hz.kind}' intrudes on the play corridor`);
          break;
        }
      }
    }
  });
  return errs;
}

/** Recover the fairway half-width from a hole's generated fairway feature (for checks). */
function fairwayHalfWidthOf(hole: Hole): number {
  const fw = hole.features.find((f) => f.kind === 'fairway');
  if (!fw) return 20;
  // Half-width ≈ max lateral distance of the corridor polygon from the centreline.
  let max = 0;
  for (const p of fw.poly) max = Math.max(max, polylineDist(p, hole.centreline));
  return max || 20;
}

/** Convenience: the straight-line tee→green distance of a hole (yards). */
export function holeYardage(hole: Hole): number {
  return Math.round(pathLength(hole.centreline));
}

/** Initial aim bearing from tee toward the green (degrees cw from up). */
export function teeBearing(hole: Hole): number {
  return bearing(hole.tee, hole.green);
}
