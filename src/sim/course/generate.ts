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
import { lieInfo, lieAt } from '../shot';
import {
  bearing,
  pathLength,
  pointInPoly,
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
export const GENERATOR_VERSION = 5;

/**
 * Signature-mechanic gates (GS-19), the "fair early, brutal late" dial. A world's lost-rough (void)
 * and lava-river (ember) only ARM past a wildness threshold; below it the stop plays fair (normal
 * rough, no river), and the severity (island width / river width) ramps with wildness above it.
 */
const LOST_ROUGH_MIN_WILDNESS = 0.55; // below: void plays as ordinary (fair) rough
const LAVA_RIVER_MIN_WILDNESS = 0.3; // below: a calm ember stop has no river
/**
 * Corridor half-width SCALE when the rough is lethal (void islands). Constant (does NOT shrink with
 * wildness like a normal corridor) and generous, so that even max-wildness driver spray usually
 * finds the island — "brutal but fair": a miss is genuinely lost, but the target is honest and big.
 */
const VOID_ISLAND_SCALE = 2.4;

export interface GenerateOptions {
  /** Number of holes (default 1 — the vertical slice). */
  holes?: number;
  /** Galaxy distance from start; scales difficulty/wildness when not given explicitly. */
  distanceFromStart?: number;
  /** 0..1ish wildness override; otherwise derived from distance. */
  wildness?: number;
  /** Force a specific biome by id (otherwise weighted-random). */
  biome?: string;
  /**
   * Use a fully-resolved biome row directly (GS-17b) — a theme-flavoured, rarity-tiered biome
   * composed by `resolveBiome`. Takes precedence over `biome`. Its `id` still keys the palette.
   */
  biomeRow?: Biome;
  /** Star-travel theme id (GS-17) — recorded on the course meta for the render/UI layer. */
  themeId?: string;
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

/**
 * Build a corridor polygon around a centreline polyline. `halfWidth` is either a single
 * value (a constant-thickness corridor) or one value PER centreline point (a variable-
 * thickness corridor — wide landing zones pinched by the odd neck).
 */
function corridorPoly(line: Vec[], halfWidth: number | number[]): Vec[] {
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
    const hw = typeof halfWidth === 'number' ? halfWidth : halfWidth[i]!;
    left.push([p[0] + nx * hw, p[1] + ny * hw]);
    right.push([p[0] - nx * hw, p[1] - ny * hw]);
  }
  return [...left, ...right.reverse()];
}

/** Resample a centreline into `n` parametric-evenly-spaced points (via `centrePoint`). */
function densifyCentreline(line: Vec[], n: number): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) pts.push(centrePoint(line, n === 1 ? 0 : i / (n - 1)));
  return pts;
}

/**
 * A molten river/creek band crossing the corridor at fraction `t` (GS-19). Spans the fairway plus
 * a chunk of rough either side (so it reads as a river running ACROSS the hole), with a meandering
 * thickness for a natural look. Built perpendicular to the play direction so the carry is honest.
 */
function lavaRiverBand(centreline: Vec[], t: number, halfWidth: number, thickness: number, rng: Rng): Vec[] {
  const c = centrePoint(centreline, t);
  const a = centrePoint(centreline, Math.max(0, t - 0.02));
  const b = centrePoint(centreline, Math.min(1, t + 0.02));
  let tx = b[0] - a[0];
  let ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl; // unit play direction (tangent)
  const px = -ty;
  const py = tx; // unit lateral (perp)
  const halfSpan = halfWidth + rng.range(16, 38); // spill into the rough either side
  const N = 6;
  const top: Vec[] = [];
  const bot: Vec[] = [];
  for (let i = 0; i <= N; i++) {
    const s = -halfSpan + (2 * halfSpan * i) / N; // lateral position across the hole
    const meander = (rng.float() - 0.5) * thickness * 0.5; // shift the band centre along play
    const cx = c[0] + px * s + tx * meander;
    const cy = c[1] + py * s + ty * meander;
    const htTop = thickness * (0.5 + rng.range(0, 0.18));
    const htBot = thickness * (0.5 + rng.range(0, 0.18));
    top.push([cx + tx * htTop, cy + ty * htTop]);
    bot.push([cx - tx * htBot, cy - ty * htBot]);
  }
  return [...top, ...bot.reverse()];
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

function generateHole(
  rng: Rng,
  biome: Biome,
  wildness: number,
  holeIndex: number,
  parCap?: 3 | 4 | 5,
): Hole {
  const parRoll = rng.float();
  // Always draw parRoll (keeps the RNG stream identical whether or not a cap is set),
  // then clamp to the cap so an all-par-3 ladder stop is just min(par, 3).
  const par = Math.min(parRoll < 0.25 ? 3 : parRoll < 0.8 ? 4 : 5, parCap ?? 5);

  // Hole length (yards) by par. Low gravity (carryMult > 1) lengthens holes so they
  // stay challenging despite longer carries.
  const baseLen = par === 3 ? 165 : par === 4 ? 400 : 530;
  const length = baseLen * biome.carryMult * rng.range(0.85, 1.12);

  const tee: Vec = [0, 0];

  // Dogleg severity scales with biome bias, but with a floor so the hole BENDS (left or
  // right — `bendSide`) even on calm early stops: the old `× wildness` made every low-wildness
  // hole dead straight. The floor is 35% of full at wildness 0, ramping to the same full
  // severity at wildness 1 (so max-wildness balance is unchanged).
  const doglegFactor = 0.35 + 0.65 * wildness;
  const doglegMag = biome.doglegBias * doglegFactor * rng.range(0.1, 0.5) * length;
  const bendSide = rng.bool() ? 1 : -1;
  const midY = length * rng.range(0.45, 0.6);
  const mid: Vec = [bendSide * doglegMag, midY];
  const green: Vec = [bendSide * doglegMag * rng.range(0.3, 0.8), length];

  const centreline: Vec[] = par === 3 ? [tee, green] : [tee, mid, green];

  // Fairway corridor: WIDE and generous on early/easy stops, tightening as wildness climbs —
  // `widthScale` lerps 1.6 (early) → 0.75 (far, = the old constant), so the late-game balance
  // bar is unchanged while early holes become much more forgiving. The thickness also UNDULATES
  // along the hole (wide landing zones, the odd pinched neck), most dramatically early. The
  // corridor is built from a densified centreline so its edge can vary smoothly.
  // Lost rough (void signature): off the fairway is a PENALTY lie on the wilder/deeper stops.
  // When armed, widen the corridor into a fair "island" so a sensible shot still has somewhere
  // to land — you play TO the fairway or lose the ball, but the target is honest.
  const lostRough = biome.lostRough && wildness >= LOST_ROUGH_MIN_WILDNESS ? biome.lostRough : undefined;
  const widthScale = lostRough ? VOID_ISLAND_SCALE : 1.6 - 0.85 * wildness;
  const baseHalf = (par === 3 ? 16 : 22) * biome.fairwayWidthMult * widthScale * rng.range(0.9, 1.2);
  const segs = par === 3 ? 9 : 15;
  const dense = densifyCentreline(centreline, segs);
  // Seeded thickness wave + one localized pinch; amplitude is early-heavy (calm holes get the
  // wildest variation, brutal holes flatten toward a uniform — but tight — corridor).
  const ampFrac = 0.18 + 0.32 * (1 - wildness);
  const wavePhase = rng.range(0, Math.PI * 2);
  const waveLobes = rng.range(1.3, 2.7);
  const pinchAt = rng.float();
  const pinchDepth = 0.3 * (1 - 0.5 * wildness) * rng.float();
  const halfWidths = dense.map((_, i) => {
    const u = i / (segs - 1);
    const wave = Math.sin(wavePhase + u * Math.PI * waveLobes);
    const pinch = Math.exp(-((u - pinchAt) ** 2) / 0.012) * pinchDepth;
    // Never collapse the corridor: clamp the local half-width to ≥ 55% of base.
    return Math.max(baseHalf * 0.55, baseHalf * (1 + wave * ampFrac - pinch));
  });
  const fairway: Feature = { kind: 'fairway', poly: corridorPoly(dense, halfWidths) };
  // Hazard placement + the fairness validator both reason about the corridor's WIDEST point
  // (validateFairness recovers the max lateral extent of the fairway poly), so use that here —
  // penalty hazards then clear the widest part and stay provably fair.
  const fairwayHalfWidth = Math.max(...halfWidths);

  const teeBox: Feature = { kind: 'tee', poly: blobPoly(tee, 8, 8, 0, rng) };
  const greenR = rng.range(11, 16);
  const greenF: Feature = { kind: 'green', poly: blobPoly(green, greenR, 14, 0.12, rng) };

  // Flag position within the green (GS-6): offset from the centroid by 18–55% of the green
  // radius in a random direction, so every flag is a readable front/back/side pin (never a
  // dead-centre one). The green's min edge distance is ≥ ~0.86·greenR (0.88·greenR min
  // vertex × the 14-gon chord factor), so 0.55·greenR always lands inside with a puttable
  // margin. Drawn from a SIDE rng keyed by hole index so the flag is deterministic WITHOUT
  // perturbing the main stream — every existing course's terrain is byte-for-byte unchanged;
  // only the flag (where you hole/putt, and the interactive "attack" target) is new.
  const pinRng = new Rng(`${rng.seed}:pin:${holeIndex}`);
  const pinAng = pinRng.range(0, Math.PI * 2);
  const pinMag = greenR * (0.18 + 0.37 * pinRng.float());
  const pin: Vec = [green[0] + Math.cos(pinAng) * pinMag, green[1] + Math.sin(pinAng) * pinMag];

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

  // Fairway sand bunkers (non-penalty → ALWAYS fair, so they may bite the corridor edge):
  // classic risk-reward set just off the landing-zone fairway. They reward an accurate line
  // without ever killing a card, the way a sprayed shot — not a sensible one — finds sand.
  const fwBunkers = Math.round((biome.fairwayBunkers ?? 0) * (0.6 + 0.5 * wildness));
  for (let i = 0; i < fwBunkers; i++) {
    const t = rng.range(0.32, 0.72); // the driving/approach landing band
    const side = rng.bool() ? 1 : -1;
    const r = rng.range(6, 10);
    const along = centrePoint(centreline, t);
    const perp = perpAt(centreline, t);
    // Sit the bunker just OUTSIDE the corridor edge (catches a pushed/pulled shot, not a
    // centred one) so the auto/safe line stays clean and scoring isn't tanked.
    const lateral = fairwayHalfWidth + r * 0.3 + rng.range(0, 5);
    const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
    hazards.push({ kind: 'bunker', poly: blobPoly(c, r, 10, 0.22, rng) });
  }

  // Treelines (non-penalty LIE): woods lining the rough OUTSIDE the play corridor, so a
  // sensible shot is always clear and only a sprayed ball ends up punching out of the trees.
  // Stored as many small blobs so the renderer can draw a believable line of canopies.
  const treeCount = Math.round((biome.treeDensity ?? 0) * (0.7 + wildness) * (par === 3 ? 2 : 4));
  for (let i = 0; i < treeCount; i++) {
    const t = rng.range(0.12, 0.95);
    const side = rng.bool() ? 1 : -1;
    const r = rng.range(3, 6);
    const along = centrePoint(centreline, t);
    const perp = perpAt(centreline, t);
    const lateral = fairwayHalfWidth + r + rng.range(3, 20);
    const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
    hazards.push({ kind: 'trees', poly: blobPoly(c, r, 8, 0.3, rng) });
  }

  // Lava rivers (ember signature, GS-19): one (two on the wildest stops) molten band crosses the
  // corridor as a FORCED CARRY. Tagged 'lavariver' so `validateFairness` treats it as a sanctioned
  // crossing (a played shot flies OVER it; the carry-aware AI lays up short or carries it), while
  // `validateCrossings` proves there's fair fairway before AND after each one. Thickness ramps with
  // wildness (a creek early → a wide river late) but stays well inside a standard carry.
  // Rivers only cross the longer holes (a creek across a 150-yd par-3 leaves no approach); par-3
  // ember stops keep their flanking lava lakes. Thickness is capped relative to the hole so there's
  // always fairway to lay up short and land the carry.
  if (biome.lavaRiver && par >= 4 && wildness >= LAVA_RIVER_MIN_WILDNESS) {
    const t = rng.range(0.34, 0.6);
    const thickness = Math.min(34, length * 0.085, rng.range(8, 13) + wildness * rng.range(6, 16));
    hazards.push({ kind: 'lavariver', poly: lavaRiverBand(centreline, t, fairwayHalfWidth, thickness, rng) });
  }

  // Wind: biome base + wildness ramp; vacuum biomes stay near-calm.
  const wind: Wind = {
    dir: rng.range(0, 360),
    spd: biome.windBase + rng.range(0, biome.windWild) * wildness,
  };

  // Carry modifier (gravity), with optional per-hole jitter (antigrav pockets).
  const carry = biome.carryMult * (biome.carryJitter ? 1 + rng.range(-biome.carryJitter, biome.carryJitter) : 1);
  const biomeMods: BiomeMod[] = [{ kind: 'carry', value: carry, note: `${biome.id} gravity` }];
  // Arm the lost-rough lie for this hole (read by `lieAt` off-feature). Visual stays "space"
  // either way; only the penalty is gated, so calm void stops are forgiving and deep ones bite.
  if (lostRough) biomeMods.push({ kind: 'roughLie', note: lostRough });

  return { par, tee, green, pin, centreline, features, hazards, wind, biomeMods };
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
  const biome =
    opts.biomeRow ??
    (opts.biome ? BIOMES.find((b) => b.id === opts.biome) ?? pickBiome(rng.float()) : pickBiome(rng.float()));
  const name = `${rng.pick(NAME_PREFIX)} ${rng.pick(NAME_SUFFIX)}`;

  const holes: Hole[] = [];
  for (let i = 0; i < holeCount; i++) holes.push(generateHole(rng, biome, wildness, i, opts.parCap));

  const course: Course = {
    seed: rng.seed,
    rarity,
    biome: biome.id,
    holes,
    meta: { name, distanceFromStart, wildness, ...(opts.themeId ? { themeId: opts.themeId } : {}) },
  };

  const errs = [...validateCourse(course), ...validateFairness(course), ...validateCrossings(course)];
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
      if (hz.kind === 'lavariver') continue; // sanctioned forced carry — proved by validateCrossings
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

/**
 * Crossing fairness (GS-19): a lava river is a SANCTIONED penalty on the play corridor (you carry
 * it), so it's exempt from `validateFairness` — but it must be CARRYABLE: the centreline has to
 * enter and exit the river (it genuinely crosses), with a penalty-free landing both BEFORE the near
 * bank (room to lay up short) and just AFTER the far bank (somewhere to land the carry). Proven on
 * every generated course; the carry-aware AI relies on exactly these two safe shelves existing.
 */
export function validateCrossings(course: Course): string[] {
  const errs: string[] = [];
  const SAMPLES = 200;
  course.holes.forEach((h, i) => {
    for (const hz of h.hazards) {
      if (hz.kind !== 'lavariver') continue;
      let tIn = -1;
      let tOut = -1;
      for (let s = 0; s <= SAMPLES; s++) {
        const t = s / SAMPLES;
        if (pointInPoly(centrePoint(h.centreline, t), hz.poly)) {
          if (tIn < 0) tIn = t;
          tOut = t;
        }
      }
      if (tIn < 0) {
        errs.push(`hole[${i}]: lava river does not cross the centreline (not a real forced carry)`);
        continue;
      }
      if (tIn < 0.12) errs.push(`hole[${i}]: lava river leaves no room to lay up short (near bank too early)`);
      if (tOut > 0.82) errs.push(`hole[${i}]: lava river crowds the green (far bank too late)`);
      // A safe landing must exist just past the far bank (a ~20-yd shelf before the green).
      const total = pathLength(h.centreline) || 1;
      const after = centrePoint(h.centreline, Math.min(0.99, tOut + 20 / total));
      if (lieInfo(lieAt(h, after)).penalty) errs.push(`hole[${i}]: no safe landing past the lava river`);
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
