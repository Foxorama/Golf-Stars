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
  dist,
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
export const GENERATOR_VERSION = 6;

/**
 * Signature-mechanic gates (GS-19), the "fair early, brutal late" dial. A world's lost-rough (void)
 * and lava-river (ember) only ARM past a wildness threshold; below it the stop plays fair (normal
 * rough, no river), and the severity (island width / river width) ramps with wildness above it.
 */
const LOST_ROUGH_MIN_WILDNESS = 0.55; // below: void plays as ordinary (fair) rough
const LAVA_RIVER_MIN_WILDNESS = 0.3; // below: a calm ember stop has no river
const FROZEN_POND_MIN_WILDNESS = 0.3; // below: a calm frost stop has no pond crossing
const WATER_CREEK_MIN_WILDNESS = 0.3; // below: a calm parkland stop has no creek crossing

/** Penalty kinds that are SANCTIONED forced carries on the play corridor (GS-19/GS-mechanics): they
 *  may cross the centreline (exempt from `validateFairness`) BUT `validateCrossings` proves each one
 *  carryable. A river of lava (ember), a frozen-pond channel (frost), and a water creek (parkland)
 *  are all crossings — the carry-aware AI flies any of them generically (it keys off `penalty`). */
const CROSSING_KINDS = new Set(['lavariver', 'frozenpond', 'creek']);
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

const TAU = Math.PI * 2;
/** Minimal signed-magnitude angular distance between two angles (0..π). */
function angDelta(a: number, b: number): number {
  return Math.abs((((a - b + Math.PI) % TAU) + TAU) % TAU - Math.PI);
}

/**
 * A varied, organic GREEN shape (GS-greens, widened in GS-terrain) — so greens stop being basically
 * circles. The radius r(θ) is driven by FOUR seeded harmonics (bigger amplitudes than before), a
 * low-frequency PEAR/teardrop bias (one end fatter), and 0–2 KIDNEY bites, then stretched along a
 * random long axis. The result spans the real green-complex vocabulary — round, oval, long shelf,
 * pear, kidney, boomerang and clover — never a plain circle. `aspectMax`/`irregular` come from the
 * biome row, so each world keeps a character (frost shelves long, inferno greens jagged, desert big
 * and smooth). Centre = `c`; r(θ) stays single-valued so the polygon is STAR-SHAPED about `c` even
 * when concave (the anisotropic stretch is linear, so it preserves star-shapedness) — `pinInGreen`
 * and `rayPolyDist` rely on a ray from `c` hitting the edge exactly once.
 */
function greenPoly(c: Vec, baseR: number, aspectMax: number, irregular: number, rng: Rng): Vec[] {
  const n = 28;
  const axis = rng.range(0, Math.PI); // long-axis orientation
  // Lean the stretch toward the world's max so the green CHARACTER reads (a frost shelf is reliably
  // long, not occasionally) — at least halfway to the biome's max aspect.
  const aspect = 1 + (Math.max(1, aspectMax) - 1) * (0.5 + 0.5 * rng.float());
  // Bigger shape harmonics → real silhouettes rather than a gently-wobbled circle.
  const a1 = rng.range(-0.3, 0.3) * irregular;
  const a2 = rng.range(-0.22, 0.22) * irregular;
  const a3 = rng.range(-0.15, 0.15) * irregular;
  const a4 = rng.range(-0.1, 0.1) * irregular;
  const p1 = rng.range(0, TAU);
  const p2 = rng.range(0, TAU);
  const p3 = rng.range(0, TAU);
  const p4 = rng.range(0, TAU);
  // Pear/teardrop bias: a low-frequency lobe that fattens one end and pinches the other.
  const pearAmt = rng.range(0, 0.34) * irregular;
  const pearAng = rng.range(0, TAU);
  // 0–2 kidney bites for boomerang / kidney / clover green complexes.
  const lobeCount = rng.float() < 0.6 * irregular ? (rng.float() < 0.4 ? 2 : 1) : 0;
  const lobes: { ang: number; depth: number; w: number }[] = [];
  for (let k = 0; k < lobeCount; k++) {
    lobes.push({ ang: rng.range(0, TAU), depth: rng.range(0.26, 0.55), w: rng.range(0.1, 0.26) });
  }
  const ca = Math.cos(axis);
  const sa = Math.sin(axis);
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    let rr =
      baseR *
      (1 + a1 * Math.sin(th + p1) + a2 * Math.sin(2 * th + p2) + a3 * Math.sin(3 * th + p3) + a4 * Math.sin(4 * th + p4));
    rr *= 1 + pearAmt * Math.cos(th - pearAng);
    for (const lobe of lobes) {
      const d = angDelta(th, lobe.ang);
      rr -= baseR * lobe.depth * Math.exp(-(d * d) / (lobe.w * 2));
    }
    rr = Math.max(baseR * 0.32, rr); // floor: a deep neck is allowed, a self-crossing is not
    // Local point, then stretch along `axis`: decompose into along/perp, scale the along part.
    const x = Math.cos(th) * rr;
    const y = Math.sin(th) * rr;
    const u = (x * ca + y * sa) * aspect; // along-axis component, stretched
    const v = -x * sa + y * ca; // perpendicular component
    pts.push([c[0] + u * ca - v * sa, c[1] + u * sa + v * ca]);
  }
  return pts;
}

/** Distance from interior point `c` to the polygon edge along unit direction `dir` (first hit). */
function rayPolyDist(c: Vec, dir: Vec, poly: Vec[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j]![0];
    const ay = poly[j]![1];
    const bx = poly[i]![0];
    const by = poly[i]![1];
    const ex = bx - ax;
    const ey = by - ay;
    const denom = dir[0] * ey - dir[1] * ex;
    if (Math.abs(denom) < 1e-9) continue; // parallel
    const t = ((ax - c[0]) * ey - (ay - c[1]) * ex) / denom; // distance along the ray
    const s = ((ax - c[0]) * dir[1] - (ay - c[1]) * dir[0]) / denom; // position along the edge
    if (t > 0 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * Place the flag (GS-6) inside an arbitrary green shape: a ray from the green centre in a random
 * direction, out to 22–62% of the distance to that edge — so the pin is always genuinely inside
 * (never on the lip) yet meaningfully off-centre (front/back/tucked), for any green shape. Drawn
 * from a SIDE rng so it never perturbs the main terrain stream.
 */
function pinInGreen(c: Vec, poly: Vec[], rng: Rng): Vec {
  const ang = rng.range(0, Math.PI * 2);
  const dir: Vec = [Math.cos(ang), Math.sin(ang)];
  const edge = rayPolyDist(c, dir, poly);
  const frac = 0.22 + 0.4 * rng.float();
  return [c[0] + dir[0] * edge * frac, c[1] + dir[1] * edge * frac];
}

/**
 * Build a fairway RIBBON around a centreline with INDEPENDENT left/right half-widths and ROUNDED end
 * caps (GS-terrain) — the fix for "fairways badly fit in at the tee and green ends". `corridorPoly`
 * connected the two offset edges with a flat slash, which (combined with the ends pinching narrow)
 * made the fairway read as a pointed almond/leaf floating on the ground. A ribbon instead:
 *  • offsets each side by its OWN half-width (so the corridor isn't a perfect mirror — a real
 *    fairway bulges asymmetrically), and
 *  • caps each end with a smooth rounded NOSE (a turfed front edge at the tee, a soft finish at the
 *    green) instead of a flat cut or a sharp point — so the start/end look naturally shaped.
 * Winding: left edge tee→green, round the green nose, right edge green→tee, round the tee nose.
 */
function ribbon(line: Vec[], leftHW: number[], rightHW: number[], roundStart = true, roundEnd = true): Vec[] {
  const m = line.length;
  const frame = (i: number) => {
    const prev = line[Math.max(0, i - 1)]!;
    const next = line[Math.min(m - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { nx: -dy, ny: dx, tx: dx, ty: dy }; // left normal + unit tangent (play dir)
  };
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < m; i++) {
    const f = frame(i);
    const p = line[i]!;
    left.push([p[0] + f.nx * leftHW[i]!, p[1] + f.ny * leftHW[i]!]);
    right.push([p[0] - f.nx * rightHW[i]!, p[1] - f.ny * rightHW[i]!]);
  }
  // A rounded nose from the LEFT edge endpoint around to the RIGHT edge endpoint (skipping the two
  // endpoints, already on the edges). `fwdSign` bulges it forward (green) or backward (tee).
  const nose = (p: Vec, f: ReturnType<typeof frame>, hwL: number, hwR: number, fwdSign: number): Vec[] => {
    const STEPS = 5;
    const depth = Math.min(hwL, hwR) * 0.92;
    const out: Vec[] = [];
    for (let k = 1; k < STEPS; k++) {
      const phi = (Math.PI * k) / STEPS;
      const lat = Math.cos(phi) * (phi < Math.PI / 2 ? hwL : hwR);
      const fwd = Math.sin(phi) * depth * fwdSign;
      out.push([p[0] + f.nx * lat + f.tx * fwd, p[1] + f.ny * lat + f.ty * fwd]);
    }
    return out;
  };
  const poly: Vec[] = [...left];
  if (roundEnd) poly.push(...nose(line[m - 1]!, frame(m - 1), leftHW[m - 1]!, rightHW[m - 1]!, 1));
  poly.push(...right.reverse());
  if (roundStart) poly.push(...nose(line[0]!, frame(0), leftHW[0]!, rightHW[0]!, -1).reverse());
  return poly;
}

/** Resample a centreline into `n` parametric-evenly-spaced points (via `centrePoint`). */
function densifyCentreline(line: Vec[], n: number): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) pts.push(centrePoint(line, n === 1 ? 0 : i / (n - 1)));
  return pts;
}

/**
 * A river/channel band crossing the corridor at fraction `t` (GS-19/GS-mechanics) — shared by the
 * ember lava river and the frost frozen pond. Spans the fairway plus a chunk of rough either side
 * (so it reads as running ACROSS the hole), with a meandering thickness for a natural look. Built
 * perpendicular to the play direction so the carry is honest.
 */
function crossingBand(
  centreline: Vec[],
  t: number,
  halfWidth: number,
  thickness: number,
  rng: Rng,
  spillMin = 16,
  spillMax = 38,
): Vec[] {
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
  const halfSpan = halfWidth + rng.range(spillMin, spillMax); // spill into the rough either side
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

  // Lost rough (void signature): off the fairway is a PENALTY lie on the wilder/deeper stops.
  // Computed up-front because it ALSO keeps the hole straight: a bending lost-ball ISLAND is a ball
  // shredder (a dogleg pushes the AI's line off the island into the void), so void island holes stay
  // an honest straight target — their challenge is the abyss off the fairway, not the shape.
  const lostRough = biome.lostRough && wildness >= LOST_ROUGH_MIN_WILDNESS ? biome.lostRough : undefined;

  // Hole SHAPE (GS-shapes): a varied, smooth centreline from the template builder — straight drift,
  // single dogleg L/R, or an S-curve — biome- and wildness-biased, so layouts stop feeling identical.
  // Everything downstream (corridor, hazards, scatter, green, apron) derives from this centreline.
  const centreline: Vec[] = buildCentreline(length, wildness, biome, rng, par, !!lostRough);
  const green: Vec = centreline[centreline.length - 1]!;

  // Fairway corridor: WIDE and generous on early/easy stops, tightening as wildness climbs —
  // `widthScale` lerps 2.0 (early) → 0.75 (far, = the old constant), so the late-game balance
  // bar is unchanged while early holes are very forgiving. (The intercept was raised 1.6→2.0:
  // even a beginner driver's spray cone is honestly an ±80% "green zone" ~38yd wide, which
  // overflowed the old ~33yd early fairway — a centre-aimed beginner tee shot only held the
  // fairway ~60% of the time, so a green-zone shot still felt like a miss. Widening the EARLY
  // corridor lifts that to ~67% on stop 1 so the green zone reads true on grass, while the
  // wildness=1 slope is unchanged so the death-spiral bar still holds at 0.75.) The thickness also UNDULATES
  // along the hole (wide landing zones, the odd pinched neck), most dramatically early. The
  // corridor is built from a densified centreline so its edge can vary smoothly.
  // When lost-rough is armed, widen the corridor into a fair "island" so a sensible shot still has
  // somewhere to land — you play TO the fairway or lose the ball, but the target is honest.
  const widthScale = lostRough ? VOID_ISLAND_SCALE : 2.0 - 1.25 * wildness;
  const baseHalf = (par === 3 ? 16 : 22) * biome.fairwayWidthMult * widthScale * rng.range(0.9, 1.2);
  const segs = par === 3 ? 13 : 19; // denser so the ribbon edge and rounded caps read smoothly
  const dense = densifyCentreline(centreline, segs);
  // Fairway WIDTH PROFILE (GS-terrain) — a believable ribbon instead of a symmetric leaf. Three
  // shaping pieces, each per-point along the hole, with a mean ≈ baseHalf so the death-spiral balance
  // is preserved:
  //  • an END ENVELOPE keeps the corridor FULL through the body and only EASES (never pinches to a
  //    point) toward the tee/green ends — combined with `ribbon`'s rounded nose caps, the start/end
  //    read as a turfed front edge and a soft finish, not the old pointed almond;
  //  • LANDING-ZONE bulges (1–2 Gaussian swells at the driving/approach zones, 25–55 yd-wide in real
  //    design) widen where you actually land;
  //  • a gentle seeded WAVE + one localized PINCH for organic movement.
  // Left/right half-widths then differ by a slow LATERAL asymmetry, so the fairway isn't a perfect
  // mirror about its centreline (a real fairway bulges to one side).
  const ampFrac = 0.1 + 0.16 * (1 - wildness);
  const wavePhase = rng.range(0, Math.PI * 2);
  const waveLobes = rng.range(1.6, 3.2);
  const lz1 = rng.range(0.3, 0.42);
  const lz2 = rng.range(0.62, 0.76);
  const lzAmp = 0.16 + 0.12 * rng.float();
  const pinchAt = rng.range(0.2, 0.8);
  const pinchDepth = 0.2 * (1 - 0.5 * wildness) * rng.float();
  const asymPhase = rng.range(0, Math.PI * 2);
  const asymLobes = rng.range(0.6, 1.6);
  const asymAmt = 0.12 + 0.1 * rng.float();
  const envAt = (u: number): number => {
    const teeEase = Math.min(1, 0.74 + (u / 0.12) * 0.26); // 0.74 → 1 over the first 12%
    const grnEase = Math.min(1, 0.78 + ((1 - u) / 0.14) * 0.22); // taper the last 14% to 0.78
    return Math.min(teeEase, grnEase);
  };
  const mid = dense.map((_, i) => {
    const u = i / (segs - 1);
    const wave = Math.sin(wavePhase + u * Math.PI * waveLobes) * ampFrac;
    const bulge = lzAmp * Math.exp(-((u - lz1) ** 2) / 0.02) + lzAmp * 0.85 * Math.exp(-((u - lz2) ** 2) / 0.02);
    const pinch = Math.exp(-((u - pinchAt) ** 2) / 0.01) * pinchDepth;
    return Math.max(baseHalf * 0.5, baseHalf * envAt(u) * (1 + wave + bulge - pinch));
  });
  const leftHW = mid.map((w, i) => {
    const u = i / (segs - 1);
    return Math.max(baseHalf * 0.42, w * (1 + asymAmt * Math.sin(asymPhase + u * Math.PI * asymLobes)));
  });
  const rightHW = mid.map((w, i) => {
    const u = i / (segs - 1);
    return Math.max(baseHalf * 0.42, w * (1 - asymAmt * Math.sin(asymPhase + u * Math.PI * asymLobes)));
  });
  const fairway: Feature = { kind: 'fairway', poly: ribbon(dense, leftHW, rightHW) };
  // Hazard placement + the fairness validator both reason about the corridor's WIDEST point
  // (validateFairness recovers the max lateral extent of the fairway poly), so use that here —
  // penalty hazards then clear the widest part and stay provably fair.
  const fairwayHalfWidth = Math.max(...leftHW, ...rightHW);

  const teeBox: Feature = { kind: 'tee', poly: blobPoly(tee, 8, 8, 0, rng) };
  // Varied GREEN shape (GS-greens), per-biome character. baseR scaled by the biome's greenSize.
  const greenR = rng.range(11, 16) * (biome.greenSize ?? 1);
  const greenPolygon = greenPoly(green, greenR, biome.greenAspect ?? 1.8, biome.greenIrregular ?? 1, rng);
  const greenF: Feature = { kind: 'green', poly: greenPolygon };

  // Flag inside the (arbitrary-shape) green via ray-march from the centre (GS-6/GS-greens): always
  // genuinely inside (never on the lip) yet off-centre, for ANY shape. Drawn from a SIDE rng keyed
  // by hole index so the flag is deterministic without perturbing the main terrain stream.
  const pinRng = new Rng(`${rng.seed}:pin:${holeIndex}`);
  const pin: Vec = pinInGreen(green, greenPolygon, pinRng);

  // Fairway APRON (GS-greens): a tapering strip that runs THROUGH and PAST the green so the fairway
  // wraps around it instead of ending at a hard flat line. Skipped for void island greens (the green
  // floats over the abyss — nothing behind it). A SEPARATE fairway feature so it never widens the
  // corridor's fairness half-width (validateFairness keys off the FIRST fairway feature).
  const features: Feature[] = [fairway];
  if (!lostRough) {
    const pa = dense[dense.length - 2] ?? tee;
    const pb = dense[dense.length - 1] ?? green;
    let dx = pb[0] - pa[0];
    let dy = pb[1] - pa[1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const back = greenR + 12;
    const tail = greenR * 1.5 + 14;
    const aw = Math.max(baseHalf * 0.45, greenR + 9);
    const apronLine: Vec[] = [
      [green[0] - dx * back, green[1] - dy * back],
      green,
      [green[0] + dx * tail, green[1] + dy * tail],
    ];
    // A rounded back nose (not a hard taper to a point) so the fairway flows softly past the green.
    const apronHW = [aw, aw, aw * 0.5];
    features.push({ kind: 'fairway', poly: ribbon(apronLine, apronHW, apronHW, false, true) });
  }
  features.push(teeBox, greenF);
  const hazards: Feature[] = [];

  // Greenside hazards (1–2), hugging the ACTUAL green edge (ray-march, so they sit just off any
  // shape — a long shelf or kidney). A penalty-kind greenside hazard must still clear the approach
  // line (fairness) — retry placement, else fall back to sand.
  const greensidePenalty = !!lieInfo(biome.greensideKind).penalty;
  const greensideCount = rng.int(1, 2);
  for (let b = 0; b < greensideCount; b++) {
    const r = rng.range(5, 9);
    const gap = rng.range(3, 9);
    const place = (ang: number): Vec => {
      const dir: Vec = [Math.cos(ang), Math.sin(ang)];
      const d = rayPolyDist(green, dir, greenPolygon) + r + gap;
      return [green[0] + dir[0] * d, green[1] + dir[1] * d];
    };
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const c = place(rng.range(0, Math.PI * 2));
      if (!greensidePenalty || clearsPlayCorridor(c, r, centreline, tee, green, fairwayHalfWidth)) {
        hazards.push({ kind: biome.greensideKind, poly: blobPoly(c, r, 9, 0.2, rng) });
        placed = true;
      }
    }
    if (!placed) {
      // Couldn't find a fair spot for the penalty kind — a sand bunker is always fair.
      hazards.push({ kind: 'bunker', poly: blobPoly(place(rng.range(0, Math.PI * 2)), r, 9, 0.2, rng) });
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
    const along = centrePoint(centreline, t); // a point along the (curvy) hole
    const perp = perpAt(centreline, t);
    const lateral = fairwayHalfWidth + r + rng.range(4, 22);
    const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
    if (clearsPlayCorridor(c, r, centreline, tee, green, fairwayHalfWidth)) {
      hazards.push({ kind, poly: blobPoly(c, r, 12, 0.25, rng) });
    }
  }

  // Large PONDS / "dams" (GS-terrain): sizable bodies of penalty water flanking the landing zones —
  // the big lake a wild shot is swallowed by, distinct from the small flanking hazards above. Placed
  // CLEAR of the play corridor (fairness), so a sensible shot never has to carry them; they just make
  // an offline miss genuinely costly and give a parkland/ice world real water presence. Drawn as
  // water (or the biome's hazard kind for exotic worlds).
  const pondCount = Math.round((biome.ponds ?? 0) * (0.5 + wildness));
  for (let i = 0; i < pondCount; i++) {
    const kind = biome.hazardKinds.includes('water') ? 'water' : rng.pick(biome.hazardKinds);
    const r = rng.range(16, 22 + wildness * 18); // big — a lake/dam, not a puddle
    const t = rng.range(0.28, 0.82);
    const side = rng.bool() ? 1 : -1;
    const along = centrePoint(centreline, t);
    const perp = perpAt(centreline, t);
    const lateral = fairwayHalfWidth + r + rng.range(6, 20); // near the corridor edge but clear of it
    const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
    if (clearsPlayCorridor(c, r, centreline, tee, green, fairwayHalfWidth)) {
      hazards.push({ kind, poly: blobPoly(c, r, 16, 0.3, rng) });
    }
  }

  // Non-penalty fairway BREAK (GS-terrain): a sandy waste band cutting clean across the corridor — a
  // visible interruption in the fairway you carry or thread (sandbelt-style). Waste is NON-PENALTY
  // (precedence 3 → reads as 'waste', never costs a card) so it may sit on the line; `validateFairness`
  // ignores it. A tight spill keeps it spanning mostly the fairway. Longer holes only, wildness-gated.
  const breakBands = par >= 4 && wildness >= 0.25 ? Math.round((biome.fairwayBreaks ?? 0) * (0.5 + wildness)) : 0;
  for (let i = 0; i < breakBands; i++) {
    const t = rng.range(0.34, 0.64);
    const thickness = rng.range(7, 12);
    hazards.push({ kind: 'waste', poly: crossingBand(centreline, t, fairwayHalfWidth * 0.85, thickness, rng, 2, 9) });
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

  // Impact CRATERS (desert signature, GS-mechanics): big round sand bunkers pocking the landing
  // zones — a navigable crater field. Sand is NON-PENALTY → always fair, so they may sit ON the
  // corridor (a 50% escape tax, never a lost card). Larger + rounder than a fairway bunker.
  const craters = Math.round((biome.craters ?? 0) * (0.6 + 0.7 * wildness));
  for (let i = 0; i < craters; i++) {
    const t = rng.range(0.25, 0.8);
    const r = rng.range(12, 22);
    const along = centrePoint(centreline, t);
    const perp = perpAt(centreline, t);
    // Anywhere from on-line to out in the rough — the crater field is something to thread through.
    const lateral = rng.range(-0.4, 1) * (fairwayHalfWidth + r);
    const c: Vec = [along[0] + perp[0] * lateral, along[1] + perp[1] * lateral];
    hazards.push({ kind: 'bunker', poly: blobPoly(c, r, 12, 0.18, rng) });
  }

  // Treelines (non-penalty LIE): DENSE woods lining the rough OUTSIDE the play corridor (GS-wind
  // bumped the count + the lateral spread so the rough reads as real forest with depth, not a thin
  // single line) — a sensible shot is still always clear; only a sprayed ball punches out. Stored as
  // many small blobs so the renderer draws a believable wall of canopies.
  const treeCount = Math.round((biome.treeDensity ?? 0) * (1.3 + wildness * 1.5) * (par === 3 ? 4 : 8));
  for (let i = 0; i < treeCount; i++) {
    const t = rng.range(0.06, 0.97);
    const side = rng.bool() ? 1 : -1;
    const r = rng.range(3, 6.5);
    const along = centrePoint(centreline, t);
    const perp = perpAt(centreline, t);
    // Keep a clear gap off the corridor edge (only an offline shot finds the woods — the GS-13
    // invariant), then fill DEEP into the rough so the treeline reads as real forest, not a thin line.
    const lateral = fairwayHalfWidth + r + rng.range(5, 72);
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
    hazards.push({ kind: 'lavariver', poly: crossingBand(centreline, t, fairwayHalfWidth, thickness, rng) });
  }

  // Frozen-pond crossing (frost signature, GS-mechanics): a meltwater channel crosses the corridor
  // as a FORCED CARRY — same sanctioned-crossing machinery as the lava river (exempt from
  // `validateFairness`, proven carryable by `validateCrossings`). Longer holes only (a creek across a
  // par-3 leaves no approach); a touch narrower than lava since the AI must clear cold water.
  if (biome.frozenPond && par >= 4 && wildness >= FROZEN_POND_MIN_WILDNESS) {
    const t = rng.range(0.34, 0.6);
    const thickness = Math.min(30, length * 0.075, rng.range(7, 12) + wildness * rng.range(5, 14));
    hazards.push({ kind: 'frozenpond', poly: crossingBand(centreline, t, fairwayHalfWidth, thickness, rng) });
  }

  // Water CREEK crossing (parkland signature, GS-terrain): a stream/creek runs across the fairway as
  // a FORCED CARRY — the same sanctioned-crossing machinery as the lava river / frozen pond (exempt
  // from `validateFairness`, proven carryable by `validateCrossings`; the carry-aware AI flies it
  // generically off its `penalty`). Only ONE crossing per hole — skip if a river/pond already crosses,
  // so there's always a safe shelf between. Longer holes only; thickness capped relative to the hole.
  const hasCrossing = hazards.some((h) => CROSSING_KINDS.has(h.kind));
  if (biome.waterCreek && par >= 4 && wildness >= WATER_CREEK_MIN_WILDNESS && !hasCrossing) {
    const t = rng.range(0.34, 0.6);
    const thickness = Math.min(26, length * 0.06, rng.range(6, 10) + wildness * rng.range(5, 13));
    hazards.push({ kind: 'creek', poly: crossingBand(centreline, t, fairwayHalfWidth, thickness, rng) });
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

/** Point a fraction `t` (by ARC LENGTH) along an N-point centreline polyline (GS-shapes). */
function centrePoint(line: Vec[], t: number): Vec {
  if (line.length === 1) return line[0]!;
  const total = pathLength(line);
  if (total === 0) return line[0]!;
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++) {
    const seg = dist(line[i - 1]!, line[i]!);
    if (want <= seg || i === line.length - 1) {
      const u = seg ? want / seg : 0;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    want -= seg;
  }
  return line[line.length - 1]!;
}

/** Catmull-Rom spline point for the segment p1→p2 at local u∈[0,1] (p0/p3 are the neighbours). */
function crPoint(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Vec {
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

/** Resample control points into a SMOOTH curve (Catmull-Rom), so a dogleg/S-curve corridor bends
 *  cleanly instead of kinking. `per` samples per control segment. */
function smoothCurve(ctrl: Vec[], per: number): Vec[] {
  if (ctrl.length <= 2) return ctrl.slice();
  const n = ctrl.length;
  const get = (i: number) => ctrl[Math.max(0, Math.min(n - 1, i))]!;
  const out: Vec[] = [];
  for (let s = 0; s < n - 1; s++) {
    for (let k = 0; k < per; k++) out.push(crPoint(get(s - 1), get(s), get(s + 1), get(s + 2), k / per));
  }
  out.push(get(n - 1));
  return out;
}

/**
 * Build a hole's centreline as a varied, SMOOTH shape (GS-shapes) — the lever that makes layouts
 * stop feeling identical. A template (straight drift / single dogleg L-R / S-curve double-dogleg) is
 * drawn, biome-biased (a calm verdant world leans straight; a chaotic void/inferno world bends more),
 * with the bend severity scaling by `doglegBias × wildness × length`. Control points are smoothed
 * into a curve so the corridor follows a real arc. Capped so an offset corridor doesn't self-cross.
 */
function buildCentreline(length: number, wildness: number, biome: Biome, rng: Rng, par: number, island = false): Vec[] {
  const tee: Vec = [0, 0];
  const dogFac = 0.35 + 0.65 * wildness;
  const baseMag = biome.doglegBias * dogFac * length;
  const cap = 0.4 * length; // keep bends smooth enough that the corridor offset stays clean
  const endDrift = (): Vec => [rng.range(-0.06, 0.06) * length, length];

  // A lost-ball island stays a straight, honest target (a dogleg over the abyss is unfair).
  if (island) return [tee, endDrift()];

  if (par === 3) {
    // Short holes: usually straight, occasionally a gentle single kink.
    if (rng.float() < 0.6) return [tee, endDrift()];
    const side = rng.bool() ? 1 : -1;
    const mag = Math.min(0.16 * length, baseMag * rng.range(0.25, 0.55));
    return smoothCurve([tee, [side * mag, length * 0.55], endDrift()], 4);
  }

  const bendAt = (f: number, side: number, scale: number): Vec => [
    side * Math.min(cap, baseMag * scale * rng.range(0.5, 1.0)),
    length * f,
  ];
  // Template probabilities, biome- + wildness-biased.
  const straightP = Math.max(0.12, 0.5 - biome.doglegBias * 0.8 - wildness * 0.18);
  const sP = Math.min(0.42, 0.1 + biome.doglegBias * 0.55 + wildness * 0.28); // double-dogleg share
  const roll = rng.float();
  const side = rng.bool() ? 1 : -1;
  let ctrl: Vec[];
  if (roll < straightP) {
    // Gentle landing-zone drift — visually straight, a touch of movement.
    ctrl = [tee, bendAt(0.5, side, 0.28), endDrift()];
  } else if (roll < 1 - sP) {
    // Single dogleg, left or right; the green sits to the inside of the bend.
    ctrl = [tee, bendAt(rng.range(0.42, 0.58), side, 1.0), [side * 0.12 * length * rng.float(), length]];
  } else {
    // S-curve: two opposite bends — the real shot-shaping test.
    ctrl = [tee, bendAt(0.33, side, 0.8), bendAt(0.66, -side, 0.8), endDrift()];
  }
  return smoothCurve(ctrl, 5);
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
      if (CROSSING_KINDS.has(hz.kind)) continue; // sanctioned forced carry — proved by validateCrossings
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
      if (!CROSSING_KINDS.has(hz.kind)) continue;
      const what = hz.kind === 'frozenpond' ? 'frozen pond' : hz.kind === 'creek' ? 'creek' : 'lava river';
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
        errs.push(`hole[${i}]: ${what} does not cross the centreline (not a real forced carry)`);
        continue;
      }
      if (tIn < 0.12) errs.push(`hole[${i}]: ${what} leaves no room to lay up short (near bank too early)`);
      if (tOut > 0.82) errs.push(`hole[${i}]: ${what} crowds the green (far bank too late)`);
      // A safe landing must exist just past the far bank (a ~20-yd shelf before the green).
      const total = pathLength(h.centreline) || 1;
      const after = centrePoint(h.centreline, Math.min(0.99, tOut + 20 / total));
      if (lieInfo(lieAt(h, after)).penalty) errs.push(`hole[${i}]: no safe landing past the ${what}`);
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
