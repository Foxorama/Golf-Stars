/**
 * Procedural course generator — THE NEW THING golf-finder gives nothing for.
 *
 * This is a STUB: it emits a small, contract-valid course (corridor fairway, circular
 * green, a bunker or two, occasional water, wind) so the renderer and sim have real
 * geometry to chew on end-to-end. The wildness/biome system comes later — but it slots
 * in behind this same `Course` contract, so neither renderer nor sim changes when it does.
 *
 * Fully deterministic: same (seed, version, opts) → identical course.
 */

import { Rng } from '../rng';
import { RARITIES, RARITY_C } from '../rpg/loot';
import {
  bearing,
  pathLength,
  validateCourse,
  type Course,
  type Feature,
  type Hole,
  type Rarity,
  type Vec,
  type Wind,
} from './contract';

/** Bump when the generation algorithm changes in a way that alters output. */
export const GENERATOR_VERSION = 1;

export interface GenerateOptions {
  /** Number of holes (default 1 — the vertical slice). */
  holes?: number;
  /** Galaxy distance from start; scales difficulty/wildness when not given explicitly. */
  distanceFromStart?: number;
  /** 0..1ish wildness override; otherwise derived from distance. */
  wildness?: number;
}

const BIOMES = ['verdant-station', 'dust-belt', 'ice-ring', 'ember-world', 'void-garden'];

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
    // Left normal (−dy, dx).
    const nx = -dy;
    const ny = dx;
    const p = line[i]!;
    left.push([p[0] + nx * halfWidth, p[1] + ny * halfWidth]);
    right.push([p[0] - nx * halfWidth, p[1] - ny * halfWidth]);
  }
  return [...left, ...right.reverse()];
}

function generateHole(rng: Rng, index: number, wildness: number): Hole {
  // Par mix shifts slightly with wildness; default lean toward par 4.
  const parRoll = rng.float();
  const par = parRoll < 0.25 ? 3 : parRoll < 0.8 ? 4 : 5;

  // Hole length (yards) by par, with variance.
  const baseLen = par === 3 ? 165 : par === 4 ? 400 : 530;
  const length = baseLen * rng.range(0.85, 1.12);

  const tee: Vec = [0, 0];

  // Optional dogleg: lateral bend partway up, scaled by wildness.
  const doglegMag = wildness * rng.range(0, 0.4) * length;
  const bendSide = rng.bool() ? 1 : -1;
  const midY = length * rng.range(0.45, 0.6);
  const mid: Vec = [bendSide * doglegMag, midY];
  const green: Vec = [bendSide * doglegMag * rng.range(0.3, 0.8), length];

  const centreline: Vec[] = par === 3 ? [tee, green] : [tee, mid, green];

  // Fairway corridor (par-3s get a thin landing apron rather than a full corridor).
  const fairwayHalfWidth = (par === 3 ? 16 : 22) * rng.range(0.9, 1.25);
  const fairway: Feature = { kind: 'fairway', poly: corridorPoly(centreline, fairwayHalfWidth) };

  // Tee box and green.
  const teeBox: Feature = { kind: 'tee', poly: blobPoly(tee, 8, 8, 0, rng) };
  const greenR = rng.range(11, 16);
  const greenF: Feature = { kind: 'green', poly: blobPoly(green, greenR, 14, 0.12, rng) };

  const features: Feature[] = [fairway, teeBox, greenF];

  // Greenside bunkers (1–2), placed just off the green.
  const bunkerCount = rng.int(1, 2);
  const hazards: Feature[] = [];
  for (let b = 0; b < bunkerCount; b++) {
    const ang = rng.range(0, Math.PI * 2);
    const d = greenR + rng.range(6, 12);
    const c: Vec = [green[0] + Math.cos(ang) * d, green[1] + Math.sin(ang) * d];
    hazards.push({ kind: 'bunker', poly: blobPoly(c, rng.range(5, 9), 9, 0.2, rng) });
  }

  // Water hazard whose presence/size scales with wildness.
  if (rng.bool(0.25 + wildness * 0.5)) {
    const t = rng.range(0.3, 0.7);
    const wc: Vec = [
      mid[0] * t + (rng.bool() ? 1 : -1) * fairwayHalfWidth * rng.range(1.2, 2),
      midY * t,
    ];
    hazards.push({ kind: 'water', poly: blobPoly(wc, rng.range(12, 24), 12, 0.25, rng) });
  }

  const wind: Wind = { dir: rng.range(0, 360), spd: rng.range(0, 8 + wildness * 18) };

  const hole: Hole = {
    par,
    tee,
    green,
    centreline,
    features,
    hazards,
    wind,
  };
  void index; // reserved: later holes can vary by position in the course
  return hole;
}

export function generateCourse(seed: number | string, opts: GenerateOptions = {}): Course {
  const rng = new Rng(seed);
  const distanceFromStart = opts.distanceFromStart ?? 0;
  // Wildness grows with galaxy distance; clamp to a sane band.
  const wildness =
    opts.wildness ?? Math.min(1, 0.1 + distanceFromStart * 0.05 + rng.range(0, 0.15));

  const holeCount = Math.max(1, opts.holes ?? 1);
  const rarity = pickRarity(rng);
  const biome = rng.pick(BIOMES);
  const name = `${rng.pick(NAME_PREFIX)} ${rng.pick(NAME_SUFFIX)}`;

  const holes: Hole[] = [];
  for (let i = 0; i < holeCount; i++) holes.push(generateHole(rng, i, wildness));

  const course: Course = {
    seed: rng.seed,
    rarity,
    biome,
    holes,
    meta: { name, distanceFromStart, wildness },
  };

  const errs = validateCourse(course);
  if (errs.length) {
    // A generator that emits an invalid course is a bug — fail loud, don't ship it.
    throw new Error(`generateCourse produced an invalid course:\n  ${errs.join('\n  ')}`);
  }
  return course;
}

/** Convenience: the straight-line tee→green distance of a hole (yards). */
export function holeYardage(hole: Hole): number {
  return Math.round(pathLength(hole.centreline));
}

/** Initial aim bearing from tee toward the green (degrees cw from up). */
export function teeBearing(hole: Hole): number {
  return bearing(hole.tee, hole.green);
}
