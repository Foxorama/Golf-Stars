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
import { WALL_HEIGHT } from '../walls';
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
  type GreenLobe,
  type Hole,
  type Rarity,
  type ShipWall,
  type Vec,
  type Wind,
} from './contract';

/** Bump when the generation algorithm changes in a way that alters output. */
export const GENERATOR_VERSION = 22; // GS-ship-interior: wider ship corridors + acid-breach lost-ball penalties replace bunkers

/**
 * Signature-mechanic gates (GS-19), the "fair early, brutal late" dial. A world's lost-rough (void)
 * and lava-river (ember) only ARM past a wildness threshold; below it the stop plays fair (normal
 * rough, no river), and the severity (island width / river width) ramps with wildness above it.
 */
const LOST_ROUGH_MIN_WILDNESS = 0.55; // below: void plays as ordinary (fair) rough
const LAVA_RIVER_MIN_WILDNESS = 0.26; // below: a calm ember stop has no river
const FROZEN_POND_MIN_WILDNESS = 0.26; // below: a calm frost stop has no pond crossing
const WATER_CREEK_MIN_WILDNESS = 0.26; // below: a calm parkland stop has no creek crossing
const DEEP_ROUGH_MIN_WILDNESS = 0.3; // below (incl. the stop-0 ceiling): doglegs stay cuttable — the forgiving opener
// GS-rough-gradient: below this the off-corridor rough fill is UNIFORM (a wide, forgiving heavy-rough
// buffer, trees pushed far out); at/above it each hole rolls a CHARACTER (tight tree chute / heavy-rough
// gauntlet / mixed) so the wilder stops read "a lot more random".
const ROUGH_CHAR_MIN_WILDNESS = 0.45;

/** Penalty kinds that are SANCTIONED forced carries on the play corridor (GS-19/GS-mechanics): they
 *  may cross the centreline (exempt from `validateFairness`) BUT `validateCrossings` proves each one
 *  carryable. A river of lava (ember), a frozen-pond channel (frost), and a water creek (parkland)
 *  are all crossings — the carry-aware AI flies any of them generically (it keys off `penalty`). */
const CROSSING_KINDS = new Set(['lavariver', 'frozenpond', 'creek', 'barranca']);
/**
 * Corridor half-width SCALE when the rough is lethal (void islands). Constant (does NOT shrink with
 * wildness like a normal corridor) and generous, so that even max-wildness driver spray usually
 * finds the island — "brutal but fair": a miss is genuinely lost, but the target is honest and big.
 * Raised 2.4 → 2.6 with GS-island-width (the islands-only-get-WIDER rule): the lost worlds were the
 * game's meanest, so their width pass both lifts the baseline and adds widen-only variety on top.
 */
const VOID_ISLAND_SCALE = 2.6;

/**
 * Ship-corridor half-width SCALE (GS-ship-corridor) — the DERELICT world's own width baseline. Unlike
 * the void's wide, blobby survival islands, a dead ship's corridor is a TIGHT, CONSTANT-WIDTH hallway
 * walled on both sides by impassable bulkheads (`sim/walls.ts`), so it doesn't need the generous
 * island scale (a sideways miss ricochets back off the wall instead of being lost). A fixed, modest
 * scale — no wildness ramp, no widen-only bulges — gives every derelict hole the same clean corridor
 * cross-section: a passage you play DOWN, not an island you land ON. Balance-exempt world (a
 * deliberately brutal lost ship), so this is a look-and-feel choice, not a balance one.
 */
const SHIP_CORRIDOR_SCALE = 1.6;

/**
 * Island-hop completability (GS-cetus-gaps): the void carries between a lost-rough hole's pads must
 * be CARRYABLE WITH THE COMMON STARTER BAG, by construction. Gap yardage budgets are relative to the
 * nominal 250-yd common driver at earth gravity — hole length and shot carry both scale with the
 * biome's `carryMult`, so the ratio holds on any world. The per-gap ceiling ramps with wildness
 * (gentler just past the arming threshold, ~60% of a driver at wildness 1); pads between gaps keep a
 * minimum landing length AND enough corridor samples to survive `brokenCorridor`'s ≥3-point rule
 * (a dropped sliver pad silently fused two gaps into one uncarryable mega-void — the GS-cetus-gaps
 * bug). `validateIslandHops` proves all of it on every generated course.
 */
const ISLAND_GAP_MAX_YD_CALM = 100; // per-gap ceiling at the arming threshold (wildness 0.55)
const ISLAND_GAP_MAX_YD_WILD = 150; // per-gap ceiling at wildness 1 — ~60% of a nominal driver
const ISLAND_PAD_MIN_U = 0.09; // min pad between gaps (u-space) — ≥3 dense points at ISLAND_SEGS
const ISLAND_PAD_MIN_YD = 30; // …and never shorter than a landable shelf in (carry-relative) yards
// A void carry must READ as a real gap (GS-variety-3): the render dilates each pad by 14 course-yd,
// so two pads closer than ~28 yd BRIDGE into one landmass — the carry would render as solid ground
// (graphic ≠ physics). Floor every gap to an absolute course-yd width comfortably past that so every
// island hop is genuinely visible. Absolute (NOT carry-relative) — the dilation bridge is a fixed
// course distance, and it's always well under the carryable ceiling so completability is untouched.
const ISLAND_GAP_MIN_YD = 36;
const ISLAND_GAP_SPAN: [number, number] = [0.2, 0.85]; // gaps live here: real tee + green pads
/** Denser corridor sampling on lost-rough holes so a legal min-width pad ALWAYS keeps ≥3 points. */
const ISLAND_SEGS = 37;
/** Validator bar: generation caps a gap at 150 relative yd; +10% void carryJitter headroom ⇒ 175. */
const ISLAND_GAP_VALIDATE_YD = 175;
const ISLAND_PAD_VALIDATE_YD = 20;

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
  /**
   * Wildness DELTA from the chosen journey route (GS-journey-fx) — added to the distance-derived
   * wildness before the [0.05, 1] clamp, so a harder lane generates a genuinely wilder course (and an
   * easier lane a gentler one). Clamped to ≤1, i.e. never beyond the wildness=1 case the no-death-
   * spiral / fairness validators already prove safe. Default 0 ⇒ byte-for-byte the old generation.
   */
  wildnessBoost?: number;
  /** Atmospheric course effect (GS-journey-fx) — stamped on the meta for the renderers (no rng impact). */
  effect?: string;
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
 * Build a fairway corridor as one OR MORE mown ribbons, carving out `gapBands` of native ROUGH
 * (GS-variety-2) — the "a couple of small fairways broken by rough" ask. `gapBands` are `[uStart,
 * uEnd]` ranges in [0,1] along the hole; each contiguous run of points OUTSIDE every gap becomes its
 * own ribbon (with rounded end caps). A run shorter than 3 points is dropped (that grass just reads
 * as rough), so the gaps are real breaks. Rough is the default off-feature lie — a fair carry/thread,
 * never a lost card — so a broken fairway needs no fairness exemption. Returns [] only if every run
 * was too short (the caller falls back to one solid ribbon).
 */
function brokenCorridor(dense: Vec[], leftHW: number[], rightHW: number[], gapBands: [number, number][]): Vec[][] {
  const n = dense.length;
  const inGap = (u: number) => gapBands.some(([a, b]) => u >= a && u <= b);
  const segs: Vec[][] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 3) segs.push(ribbon(run.map((i) => dense[i]!), run.map((i) => leftHW[i]!), run.map((i) => rightHW[i]!)));
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (inGap(i / (n - 1))) flush();
    else run.push(i);
  }
  flush();
  return segs;
}

/**
 * Ship-corridor WALLS (GS-ship-walls): line the two long corridor edges with collidable metal wall
 * segments, from the EXACT ribbon edges (`dense[i] ± normal·halfWidth[i]`) so the sim bounces off the
 * wall the renderer draws. Walls break at the `gapBands` (the torn-open hull sections / island gaps) so
 * a carry across space stays open. Inward normals point toward the centreline (a low ball heading out
 * toward space bounces back onto the deck). Pure geometry, zero rng.
 */
function buildShipWalls(dense: Vec[], leftHW: number[], rightHW: number[], gapBands: [number, number][], height: number): ShipWall[] {
  const n = dense.length;
  if (n < 2) return [];
  const inGap = (u: number) => gapBands.some(([a, b]) => u >= a && u <= b);
  // Left normal + inward normals, matching `ribbon`'s frame ([-dy, dx] is the left normal).
  const frame = (i: number): { nx: number; ny: number } => {
    const prev = dense[Math.max(0, i - 1)]!;
    const next = dense[Math.min(n - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { nx: -dy, ny: dx };
  };
  const leftEdge: Vec[] = dense.map((p, i) => { const f = frame(i); return [p[0] + f.nx * leftHW[i]!, p[1] + f.ny * leftHW[i]!]; });
  const rightEdge: Vec[] = dense.map((p, i) => { const f = frame(i); return [p[0] - f.nx * rightHW[i]!, p[1] - f.ny * rightHW[i]!]; });
  const walls: ShipWall[] = [];
  const unit = (a: Vec, b: Vec): Vec => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
  for (let i = 0; i < n - 1; i++) {
    // A wall segment spans dense[i]→dense[i+1]; skip it if either endpoint sits in a gap (open hull).
    if (inGap(i / (n - 1)) || inGap((i + 1) / (n - 1))) continue;
    // Left wall: inward normal points toward the centreline (opposite the left normal).
    { const t = unit(leftEdge[i]!, leftEdge[i + 1]!); walls.push({ a: leftEdge[i]!, b: leftEdge[i + 1]!, normal: [t[1], -t[0]], height }); }
    // Right wall: inward normal points the other way.
    { const t = unit(rightEdge[i]!, rightEdge[i + 1]!); walls.push({ a: rightEdge[i]!, b: rightEdge[i + 1]!, normal: [-t[1], t[0]], height }); }
  }
  return walls;
}

/**
 * Clamp + separate a lost-rough hole's island gap draws so the chain is completable by construction
 * (GS-cetus-gaps). PURE geometry over already-drawn (centre, half-width) pairs — zero rng draws, so
 * every seeded stream is byte-identical; only the derived band edges move. Guarantees:
 *   • every gap ≤ `maxGapU` (the wildness-ramped, common-driver-carryable ceiling);
 *   • every gap ≥ `minGapU` (GS-variety-3: a carry the render can't bridge into solid land — see
 *     ISLAND_GAP_MIN_YD; clamped under `maxGapU` so it can never make a gap uncarryable);
 *   • every pad between two gaps ≥ `minPadU` (a landable shelf that also survives
 *     `brokenCorridor`'s ≥3-point rule — the raw draws could overlap or leave a sliver pad that was
 *     silently DROPPED, fusing two gaps into one uncarryable mega-void);
 *   • the whole chain stays inside `span` (a real tee pad and a real green pad).
 * If the drawn widths can't fit the span with full pads, they are scaled down proportionally first,
 * so a solution always exists (n ≤ 3 gaps in a 0.65 span).
 */
function separateIslandGaps(
  raw: { c: number; h: number }[],
  maxGapU: number,
  minPadU: number,
  minGapU: number,
  span: [number, number],
): [number, number][] {
  const loHalf = Math.min(minGapU, maxGapU) / 2; // never floor a gap above its carryable ceiling
  const bands = raw
    .map((b) => ({ c: b.c, h: Math.max(loHalf, Math.min(b.h, maxGapU / 2)) }))
    .sort((a, b) => a.c - b.c);
  const pads = (bands.length - 1) * minPadU;
  const width = bands.reduce((s, b) => s + 2 * b.h, 0);
  const avail = span[1] - span[0];
  const scale = width + pads > avail ? (avail - pads) / width : 1;
  // Forward pass: keep each gap at its drawn centre where possible, pushed right of the previous
  // gap's far edge + a full pad.
  const out: [number, number][] = [];
  let cursor = span[0];
  for (const b of bands) {
    const h = b.h * scale;
    const start = Math.max(b.c - h, cursor);
    out.push([start, start + 2 * h]);
    cursor = start + 2 * h + minPadU;
  }
  // Backward pass: if the chain overran the span, pull it back left (pads stay intact — the scale
  // step above guarantees it fits).
  let over = out[out.length - 1]![1] - span[1];
  for (let i = out.length - 1; i >= 0 && over > 0; i--) {
    const [s, e] = out[i]!;
    out[i] = [s - over, e - over];
    const prevEnd = i > 0 ? out[i - 1]![1] + minPadU : span[0];
    over = Math.max(0, prevEnd - out[i]![0]);
  }
  return out;
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
    // TAPER toward both ends (pure math on the same draws — the rng stream is untouched) so the
    // band reads as a natural sand blowout LENS, not a road slab with flat-cut ends.
    const taper = 0.3 + 0.7 * Math.sin(Math.PI * (i / N));
    const htTop = thickness * (0.5 + rng.range(0, 0.18)) * taper;
    const htBot = thickness * (0.5 + rng.range(0, 0.18)) * taper;
    top.push([cx + tx * htTop, cy + ty * htTop]);
    bot.push([cx - tx * htBot, cy - ty * htBot]);
  }
  // Rounded NOSE points past each tapered end (pure geometry off the built edges) so the lens
  // finishes on a soft tip rather than a blunt cut.
  const tip = (ti: Vec, bi: Vec, dir: 1 | -1): Vec => [
    (ti[0] + bi[0]) / 2 + dir * px * thickness * 0.55,
    (ti[1] + bi[1]) / 2 + dir * py * thickness * 0.55,
  ];
  const nose0 = tip(top[0]!, bot[0]!, -1);
  const noseN = tip(top[N]!, bot[N]!, 1);
  return [nose0, ...top, noseN, ...bot.reverse()];
}

/**
 * A meandering RIVER channel crossing the play corridor at fraction `t` — the curving, varied
 * replacement for the old straight perpendicular band (which read as a flat "bridge" slab across the
 * hole). Grounded in how real courses route water: the classic strategic hazard is a stream that runs
 * adjacent to a hole then cuts ACROSS on a DIAGONAL — a heroic carry you "bite off as much as you dare"
 * — and natural water meanders down a hollow and POOLS into a lake where it runs out. So this channel:
 *   • crosses on a random DIAGONAL axis (the lateral rotated ±~30°), so no two rivers run the same way
 *     (straight across, slanted left, slanted right, sometimes quartering toward the green);
 *   • MEANDERS with an amplitude that GROWS away from the corridor — anchored to ~0 at the crossing so
 *     the carry stays clean and honest, but curving and wandering the further it runs out;
 *   • runs WELL off into the rough on each side (asymmetric reach) so it heads off toward the horizon
 *     instead of stopping at the fairway edge like a band;
 *   • has a believable VARIABLE width (a gentle wobble), wider where it pools.
 * It returns the polygon plus the far-end `mouth`, where the generator drops a connected LAKE of the
 * same liquid so the river visibly flows INTO a body of water (the render's liquid family merges the
 * two into one seamless surface). The crossing still passes exactly through the corridor point `c`
 * (meander anchored to 0 there), so it stays a provably-fair forced carry (`validateCrossings`).
 * Shared by the ember lava river, the frost frozen pond and the parkland creek.
 */
function riverChannel(
  centreline: Vec[],
  tRaw: number,
  fairwayHalfWidth: number,
  thickness: number,
  rng: Rng,
): { poly: Vec[]; mouth: Vec; source: Vec } {
  const half = thickness / 2;
  const total = pathLength(centreline) || 1;
  // Crossing CHARACTER (GS-rivers-2): rivers used to ALL cross mid-hole on a moderate diagonal, so
  // every water hole read the same. Pick a distinct character — a near-perpendicular STRAIGHT band, a
  // clear angled DIAGONAL carry, or a WINDING river with strongly wandering arms — drawn FIRST so the
  // safe crossing window can be derived from the angle + thickness and the crossing point clamped into
  // it (fair BY CONSTRUCTION, since generateCourse throws on a validateCrossings failure — no retry).
  const character = rng.range(0, 1);
  const thetaRaw = rng.range(-1, 1);
  const ampRaw = rng.range(0, 1);
  let theta: number;
  let ampFrac: number;
  if (character < 0.3) {
    theta = thetaRaw * 0.16; // STRAIGHT — square-ish to the corridor, gentle arms
    ampFrac = 0.12 + ampRaw * 0.16;
  } else if (character < 0.68) {
    theta = Math.sign(thetaRaw || 1) * (0.34 + Math.abs(thetaRaw) * 0.46); // DIAGONAL — a real angled carry (±~20–46°)
    ampFrac = 0.22 + ampRaw * 0.2;
  } else {
    theta = thetaRaw * 0.42; // WINDING — moderate angle, but the arms wander hard
    ampFrac = 0.46 + ampRaw * 0.28;
  }
  // WHERE it crosses (GS-rivers-2): vary the crossing point across the hole — an early tee-shot carry,
  // a mid-hole hazard, or a late approach carry — instead of always the middle third, but CLAMP it so
  // both banks stay inside validateCrossings' [0.12, 0.82] with margin. A band of half-thickness `half`
  // at angle `theta` spans ~`dt` of the centreline arc, so keep the crossing that far clear of each end.
  const dt = (2 * half) / (Math.max(0.2, Math.cos(theta)) * total);
  const loT = 0.15 + dt;
  const hiT = 0.8 - dt;
  const t = hiT > loT ? Math.min(hiT, Math.max(loT, tRaw)) : 0.47;
  const c = centrePoint(centreline, t);
  const a = centrePoint(centreline, Math.max(0, t - 0.02));
  const b = centrePoint(centreline, Math.min(1, t + 0.02));
  let tx = b[0] - a[0];
  let ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl; // unit play direction
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ax = -ty * ct - tx * st; // crossing axis = perp (−ty, tx) rotated by theta
  const ay = tx * ct - ty * st;
  // Meander runs ALONG the play direction (tx, ty), shifting river points forward/back along the hole
  // rather than sideways. Held at ZERO across the corridor (clean carry), growing out in the rough.
  const mx = tx;
  const my = ty;
  const reachNeg = fairwayHalfWidth + rng.range(28, 60);
  const reachPos = fairwayHalfWidth + rng.range(52, 100); // the longer arm pools into the lake
  const f1 = rng.range(1.2, 2.3);
  const p1 = rng.range(0, Math.PI * 2);
  const f2 = rng.range(2.6, 4.3);
  const p2 = rng.range(0, Math.PI * 2);
  const calm = fairwayHalfWidth * 0.8; // no meander inside this radius of the crossing
  const wobPh = rng.range(0, Math.PI * 2);
  const wobLobes = rng.range(1.4, 2.8);
  const STEPS = 9;
  const ptAt = (s: number): Vec => {
    const grow = Math.min(1, Math.max(0, (Math.abs(s) - calm) / (fairwayHalfWidth * 1.1 + 1)));
    const sn = s / (Math.max(reachNeg, reachPos) || 1);
    const amp = ampFrac * Math.max(reachNeg, reachPos) * grow;
    const m = amp * (0.7 * Math.sin(f1 * sn * Math.PI + p1) + 0.42 * Math.sin(f2 * sn * Math.PI + p2));
    return [c[0] + ax * s + mx * m, c[1] + ay * s + my * m];
  };
  // Width TAPER (GS-rivers): the +arm is the MOUTH — it swells downstream into its lake; the −arm is
  // the SOURCE — it narrows to a thin trickle so the river reads as flowing FROM a headwater rather
  // than a blunt band stopping in mid-rough. The full carry width is held across the corridor +
  // clearance zone (|s| ≤ taperZone) so the forced-carry geometry — and `validateCrossings` — is
  // untouched; the taper only shapes the off-corridor arms. Pure geometry, no rng.
  const taperZone = fairwayHalfWidth * 1.2;
  const widthAt = (s: number): number => {
    const grow = Math.min(1, Math.max(0, (Math.abs(s) - calm) / (fairwayHalfWidth * 1.1 + 1)));
    const wob = grow * (0.26 * Math.sin(wobPh + s * 0.05 * wobLobes) - 0.1);
    let taper = 1;
    if (s > taperZone) taper = 1 + 0.5 * Math.min(1, (s - taperZone) / Math.max(1, reachPos - taperZone));
    else if (s < -taperZone) taper = 1 - 0.74 * Math.min(1, (-s - taperZone) / Math.max(1, reachNeg - taperZone));
    return Math.max(half * 0.24, half * taper * (1 + wob));
  };
  // Build each arm OUTWARD from the crossing, TRUNCATING it the moment a point PAST the corridor zone
  // re-approaches the centreline. A long diagonal arm can otherwise re-meet a doglegging centreline far
  // away and create a SECOND bank — an unfair, unprovable carry. Once we're clear of the corridor
  // (|s| past ~1.2·halfWidth), the river's distance to the centreline should only grow; if it drops back
  // toward the corridor, the centreline is curving into us, so we stop the arm there (single crossing,
  // whatever the hole shape).
  const arm = (reach: number, dir: -1 | 1): Vec[] => {
    const pts: Vec[] = [];
    for (let k = 1; k <= STEPS; k++) {
      const s = dir * (k / STEPS) * reach;
      const p = ptAt(s);
      if (Math.abs(s) > fairwayHalfWidth * 1.2 && polylineDist(p, centreline) < fairwayHalfWidth * 1.1) break;
      pts.push(p);
    }
    return pts;
  };
  const neg = arm(reachNeg, -1); // points stepping out toward −axis
  const pos = arm(reachPos, 1); // points stepping out toward +axis
  const line: Vec[] = [...neg.slice().reverse(), c, ...pos];
  const hw: number[] = line.map((p) => {
    // recover s as the signed axis projection of (p − c)
    const s = (p[0] - c[0]) * ax + (p[1] - c[1]) * ay;
    return widthAt(s);
  });
  const mouth: Vec = pos[pos.length - 1] ?? neg[neg.length - 1] ?? c;
  const source: Vec = neg[neg.length - 1] ?? pos[pos.length - 1] ?? c;
  return { poly: ribbon(line, hw, hw, true, true), mouth, source };
}

/**
 * Give a river believable ENDS (GS-rivers) so it flows from a source to a sink instead of a band
 * that stops in mid-rough. The MOUTH (the wide, long arm) pools into a LAKE of the river's own
 * liquid — as before — and the SOURCE (the narrow, tapered arm) gets, for variety: a small SPRING
 * pool it wells out of, a stand of TREES it emerges from ("out of the woods"), or nothing (the
 * tapered trickle simply peters out). Every added body is gated to CLEAR the play corridor
 * (`clearsPlayCorridor`) so fairness is untouched — a lake/pool is a normal penalty body, and even
 * the grove (trees are exempt from fairness) is kept off the corridor so it can't wall the hole in.
 * Returns the extra hazards to push; all rng is drawn here on the shared stream (armed holes only).
 */
function riverTerminals(
  river: { mouth: Vec; source: Vec },
  liquidKind: 'water' | 'lava',
  o: { allowGrove: boolean; centreline: Vec[]; tee: Vec; green: Vec; halfW: number; wildness: number },
  rng: Rng,
): { kind: string; poly: Vec[] }[] {
  const out: { kind: string; poly: Vec[] }[] = [];
  const clears = (p: Vec, r: number): boolean => clearsPlayCorridor(p, r, o.centreline, o.tee, o.green, o.halfW);
  // MOUTH lake — the river pools into a body of water/lava (same render family → merges seamlessly).
  const lakeR = rng.range(14, 22) + o.wildness * 9;
  if (clears(river.mouth, lakeR)) out.push({ kind: liquidKind, poly: blobPoly(river.mouth, lakeR, 16, 0.3, rng) });
  // SOURCE terminal — pick one for variety so no two rivers begin the same way.
  const pick = rng.range(0, 1);
  if (pick < 0.42) {
    const r = rng.range(8, 13) + o.wildness * 4; // a small spring pool the river wells out of
    if (clears(river.source, r)) out.push({ kind: liquidKind, poly: blobPoly(river.source, r, 13, 0.34, rng) });
  } else if (pick < 0.72 && o.allowGrove) {
    const n = rng.int(2, 4); // emerge from a small stand of trees
    for (let k = 0; k < n; k++) {
      const rr = rng.range(6, 10);
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, 9);
      const c: Vec = [river.source[0] + Math.cos(a) * d, river.source[1] + Math.sin(a) * d];
      if (clears(c, rr)) out.push({ kind: 'trees', poly: blobPoly(c, rr, 10, 0.3, rng) });
    }
  } // else: the tapered trickle simply peters out (no terminal)
  return out;
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

/** Substance FAMILY of a hazard kind (GS-hazard-blend). Same-family bodies may overlap freely —
 *  the render's family passes merge them into one surface (a creek pooling into its lake, a chain
 *  of pots reading as one complex). CROSS-family overlaps are the "water spawned on a bunker"
 *  stickers the dedupe below removes. Trees are exempt entirely (canopies overhang anything). */
const HAZARD_FAMILY: Record<string, string> = {
  bunker: 'sand',
  pot: 'sand',
  waste: 'sand',
  sand: 'sand',
  water: 'water',
  creek: 'water',
  frozenpond: 'water',
  lava: 'lava',
  lavariver: 'lava',
  barranca: 'ravine',
  fescue: 'fescue',
  deeprough: 'deeprough',
};

/** Proper segment intersection (strict — shared endpoints/collinear touch don't count). */
function segsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o = (p: Vec, q: Vec, r: Vec) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

/** Do two simple polygons overlap (share interior area)? Bbox reject, then vertex-containment both
 *  ways, then edge crossings (catches two thin bands crossing with no vertex inside the other). */
function polysOverlap(a: Vec[], b: Vec[]): boolean {
  let aMinX = Infinity, aMinY = Infinity, aMaxX = -Infinity, aMaxY = -Infinity;
  for (const p of a) {
    if (p[0] < aMinX) aMinX = p[0];
    if (p[1] < aMinY) aMinY = p[1];
    if (p[0] > aMaxX) aMaxX = p[0];
    if (p[1] > aMaxY) aMaxY = p[1];
  }
  let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
  for (const p of b) {
    if (p[0] < bMinX) bMinX = p[0];
    if (p[1] < bMinY) bMinY = p[1];
    if (p[0] > bMaxX) bMaxX = p[0];
    if (p[1] > bMaxY) bMaxY = p[1];
  }
  if (aMinX > bMaxX || bMinX > aMaxX || aMinY > bMaxY || bMinY > aMaxY) return false;
  for (const p of a) if (pointInPoly(p, b)) return true;
  for (const p of b) if (pointInPoly(p, a)) return true;
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      if (segsCross(a0, a1, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return false;
}

/**
 * Drop hazards that spawned ON a different-substance hazard (GS-hazard-blend) — the "water pool
 * stamped over a bunker" stickers. PURE geometry over already-drawn placements: zero rng draws, so
 * every seeded stream is byte-identical; only which of the drawn hazards SURVIVE changes.
 * Rules: trees are exempt both ways (anything may sit under a canopy); sanctioned forced-carry
 * CROSSINGS are load-bearing (validateCrossings proves them) so they always survive — a blob that
 * overlaps a crossing loses, whichever was placed first. Same-family overlaps are kept: the render
 * merges them into one body (a creek flowing into its lake, pots fusing into a complex).
 */
function dedupeHazardOverlaps(hazards: Feature[]): Feature[] {
  const accepted: Feature[] = hazards.filter((h) => CROSSING_KINDS.has(h.kind));
  const out: Feature[] = [];
  for (const h of hazards) {
    if (h.kind === 'trees' || CROSSING_KINDS.has(h.kind)) {
      out.push(h);
      continue;
    }
    const fam = HAZARD_FAMILY[h.kind];
    const clash = accepted.some(
      (a) => a !== h && HAZARD_FAMILY[a.kind] !== fam && polysOverlap(h.poly, a.poly),
    );
    if (clash) continue;
    accepted.push(h);
    out.push(h);
  }
  return out;
}

/**
 * Clear the abyss of stray hazards on a LOST-ROUGH island hole (GS-cetus / void). The fairway/green
 * pads float in the deep and the deep IS the only penalty, so a pond/void-pool/lava body stranded in
 * the abyss — or a bunker/tree floating off a pad — reads wrong (the same reason an island-green par 3
 * skips its flanking hazards: "ponds in the void read wrong"). Before this filter the par-4/5 island
 * CHAINS (GS-cetus-5) still ran the full flanking/pond/approach-lake/greenside placement against a
 * wide, bending island corridor, scattering water blobs and bunkers over the pads and the deep.
 * PURE geometry over already-drawn placements: zero rng draws, so every seeded stream stays
 * byte-identical; only which hazards SURVIVE changes. A hazard is kept only when it is NON-penalty
 * (sand: a genuine clifftop cove) AND actually sits ON a pad (overlaps a fairway/green/tee feature).
 * Sanctioned forced-carry crossings are load-bearing so they always survive (none spawn on the
 * void/cetus biomes, but the exemption keeps the rule honest).
 */
function clearVoidHazards(hazards: Feature[], pads: Feature[]): Feature[] {
  return hazards.filter((h) => {
    if (CROSSING_KINDS.has(h.kind)) return true;
    if (lieInfo(h.kind).penalty) return false; // the abyss is the only penalty on an island hole
    return pads.some((p) => polysOverlap(h.poly, p.poly));
  });
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

  const tee: Vec = [0, 0];

  // Lost rough (void signature): off the fairway is a PENALTY lie on the wilder/deeper stops.
  // Computed up-front because it ALSO keeps the hole straight: a bending lost-ball ISLAND is a ball
  // shredder (a dogleg pushes the AI's line off the island into the void), so void island holes stay
  // an honest straight target — their challenge is the abyss off the fairway, not the shape.
  const lostRough = biome.lostRough && wildness >= LOST_ROUGH_MIN_WILDNESS ? biome.lostRough : undefined;
  // Island-green PAR 3 (GS-cetus-2): on a lost-rough world (the void / Cetus), a par 3 has no fairway
  // corridor at all — just the tee and a GENEROUS green-centred landing island floating in the deep.
  // You carry the abyss to the island or lose the ball to it. A true island green; the deep is the
  // hazard, so it needs no flanking penalty hazards. The island is sized generous (below) to stay fair.
  const islandPar3 = !!lostRough && par === 3;

  // SHIP corridor (GS-ship-corridor): the derelict world plays DOWN a straight, constant-width metal
  // hallway walled by impassable bulkheads, not across the void's wide landing islands. `ship` gates
  // every corridor-shaping decision below (width scale, width profile, straight-run centreline) so the
  // derelict reads as a ship passage; it's the ONLY `walls` world, and the whole branch is gated on it,
  // so every other world's geometry + rng stream is byte-for-byte unchanged.
  const ship = !!biome.walls;

  // Hole ARCHETYPE (GS-shapes-2): pick a design template that couples a SHAPE (straight drift / single
  // dogleg L-R / S-curve double / heroic CAPE diagonal / severe HAIRPIN) with a LENGTH CLASS (drivable
  // par-4, short/long par-3, reachable/three-shot par-5) so holes stop being one length + one bend.
  // The picker draws first (length class, shape, side) so the RNG order downstream is stable.
  const tpl = chooseTemplate(rng, par, biome, wildness, !!lostRough);
  // Hole length (yards): par baseline × world gravity × the template's length multiplier. Low gravity
  // (carryMult > 1) lengthens holes so they stay challenging despite the longer carries.
  const baseLen = par === 3 ? 165 : par === 4 ? 400 : 530;
  const length = baseLen * biome.carryMult * tpl.lenMult;

  // Everything downstream (corridor, hazards, scatter, green, apron) derives from this centreline.
  const centreline: Vec[] = buildCentreline(length, wildness, biome, rng, par, tpl, !!lostRough, !!biome.sharpCorners, ship);
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
  // The derelict's hallway is a fixed, modest width (walled on both sides), never the void's wide
  // island scale — so its corridor reads as a passage you play DOWN, not an island you land ON.
  const widthScale = ship ? SHIP_CORRIDOR_SCALE : lostRough ? VOID_ISLAND_SCALE : 2.0 - 1.25 * wildness;
  const baseHalf = (par === 3 ? 16 : 22) * biome.fairwayWidthMult * widthScale * rng.range(0.9, 1.2);
  // Denser so the ribbon edge and rounded caps read smoothly. Lost-rough holes sample DENSER still
  // (GS-cetus-gaps): at 19 points (u-step ≈ 0.056) a legal min-width island pad could hold <3 dense
  // points and be dropped by `brokenCorridor`, fusing two void gaps into one uncarryable mega-void.
  // 37 points (u-step ≈ 0.028) guarantee ≥3 points in any pad ≥ ISLAND_PAD_MIN_U. Gated on lostRough
  // (no rng involved), so every normal world's corridor is byte-identical.
  const segs = par === 3 ? 13 : lostRough ? ISLAND_SEGS : 19;
  const dense = densifyCentreline(centreline, segs);
  // Fairway WIDTH GRAMMAR (GS-fairway-width, replacing the single GS-terrain recipe): a per-hole
  // width ARCHETYPE (`chooseWidthProfile` — classic / chute / neck / hourglass / wander / thin /
  // broad) decides how thickness runs along the hole, so fairway width finally distinguishes holes
  // the way real design does. On top of the profile:
  //  • an END ENVELOPE keeps the corridor FULL through the body and only EASES (never pinches to a
  //    point) toward the tee/green ends — combined with `ribbon`'s rounded nose caps, the start/end
  //    read as a turfed front edge and a soft finish, not the old pointed almond;
  //  • a slow LATERAL asymmetry splits left/right half-widths so the fairway isn't a perfect mirror
  //    (damped by the profile where a squeeze must hold).
  // The profile's own `floorFrac` floors the width — the squeezed archetypes dip well below the old
  // 0.5 floor by design — with an absolute 5-yd half-width floor so a corridor never degenerates.
  const wp = chooseWidthProfile(rng, par, wildness, !!lostRough, ship);
  const asymPhase = rng.range(0, Math.PI * 2);
  const asymLobes = rng.range(0.6, 1.6);
  const asymAmt = (0.12 + 0.1 * rng.float()) * wp.asymScale;
  const envAt = (u: number): number => {
    const teeEase = Math.min(1, 0.74 + (u / 0.12) * 0.26); // 0.74 → 1 over the first 12%
    const grnEase = Math.min(1, 0.78 + ((1 - u) / 0.14) * 0.22); // taper the last 14% to 0.78
    return Math.min(teeEase, grnEase);
  };
  const floorW = Math.max(baseHalf * wp.floorFrac, 5);
  const mid = dense.map((_, i) => {
    const u = i / (segs - 1);
    return Math.max(floorW, baseHalf * envAt(u) * wp.at(u));
  });
  const leftHW = mid.map((w, i) => {
    const u = i / (segs - 1);
    return Math.max(floorW * 0.85, w * (1 + asymAmt * Math.sin(asymPhase + u * Math.PI * asymLobes)));
  });
  const rightHW = mid.map((w, i) => {
    const u = i / (segs - 1);
    return Math.max(floorW * 0.85, w * (1 - asymAmt * Math.sin(asymPhase + u * Math.PI * asymLobes)));
  });
  // BROKEN fairway (GS-variety-2): carve 0–2 bands of native ROUGH across the mid-hole so the
  // corridor plays as "a couple of small fairways broken by rough", not one unbroken ribbon. Rough is
  // the default off-feature lie (a fair carry/thread, never a lost card), so this needs no fairness
  // exemption. Count scales with the biome's `roughBreaks` and wildness; par-3s stay unbroken. Two
  // gaps spread across the mid-hole make three fairway islands. Drawn here so the gap rng lands before
  // the green stuff (the stream is reordered anyway — GENERATOR_VERSION is bumped).
  // Never break a lost-rough world's corridor: a gap there reads as the abyss/void PENALTY (a lost
  // ball mid-fairway), not fair rough. Those worlds keep an unbroken island/plateau corridor.
  const roughBreakN = par >= 4 && !lostRough ? Math.round((biome.roughBreaks ?? 0.6) * (0.4 + wildness)) : 0;
  const nGaps = Math.min(2, roughBreakN);
  const gapBands: [number, number][] = [];
  for (let g = 0; g < nGaps; g++) {
    const center = nGaps === 1 ? rng.range(0.4, 0.6) : g === 0 ? rng.range(0.3, 0.42) : rng.range(0.58, 0.7);
    const halfw = rng.range(0.035, 0.06);
    gapBands.push([center - halfw, center + halfw]);
  }
  // ISLAND-HOP breaks (GS-cetus-5): a lost-rough par 4/5 (void/cetus deep) is broken into a CHAIN of
  // clifftop pads by VOID gaps you must carry — the biome's island signature made real. Appended here
  // in its OWN gated draws (only when lost-rough is armed), so every normal world's gap rng + geometry
  // stays byte-identical. The gaps are genuine void carries, COMPLETABLE BY CONSTRUCTION
  // (GS-cetus-gaps): the raw draws are clamped to a wildness-ramped, common-driver-carryable ceiling
  // and separated by real landable pads (`separateIslandGaps` — pure, zero extra rng), because the
  // void isn't a hazard poly so the fairness validators are silent on a lost corridor's shape —
  // `validateIslandHops` proves the chain instead. par-5 gets one more pad than par-4.
  if (lostRough && par >= 4) {
    // ISLAND STORIES (GS-variety-3): the deep void/cetus par 4/5 used to be ONE recipe — 2–4 pads
    // spread EVENLY down a 1.4×-bending chain — so every one read the same "wiggly chain of blobs".
    // Draw a STORY so the island-hop layout genuinely varies (research §D3/§B: risk-reward optionality
    // + distinct hole identities): a long RUNWAY to one heroic approach carry, a single-carry
    // ISLAND-GREEN, an early CAPE bite-off, a busy chain of STEPPING-STONES, or an irregular STAGGERED
    // run. The chosen shape grammar (dogleg/cape/S — GS-cetus-5) rides on TOP, so a "runway" can be a
    // gentle drift while a "stepping-stones" S-bends between pads. All stories still route through
    // `separateIslandGaps` and are proved completable by `validateIslandHops` — the variety can never
    // break the common-driver carry budget.
    const story = rng.float();
    const rawGaps: { c: number; h: number }[] = [];
    const addGap = (c: number, h: number): number => rawGaps.push({ c, h });
    if (story < 0.22) {
      // RUNWAY: a long continuous plateau to drive on, then one (par-4) or two (par-5) big carries
      // clustered near the green — the heroic "cross the abyss to the island" finish.
      const n = par === 5 ? 2 : 1;
      for (let g = 0; g < n; g++) addGap(0.6 + g * 0.15 + rng.range(-0.03, 0.03), rng.range(0.06, 0.085));
    } else if (story < 0.42) {
      // ISLAND-GREEN: a generous landing plateau, then a SINGLE demanding carry to a green island
      // (the TPC-17 feel). par-5 adds one early hop so it still takes three shots.
      if (par === 5) addGap(rng.range(0.34, 0.44), rng.range(0.05, 0.07));
      addGap(rng.range(0.62, 0.74), rng.range(0.07, 0.09));
    } else if (story < 0.62) {
      // CAPE: a heroic carry straight off the tee (bite off as much void as you dare), then a long run
      // home to the green — inverse of the island-green.
      addGap(rng.range(0.24, 0.36), rng.range(0.06, 0.085));
      if (par === 5) addGap(rng.range(0.58, 0.7), rng.range(0.05, 0.07));
    } else if (story < 0.82) {
      // STEPPING-STONES: a busy chain of short, frequent hops — the tactical, fiddly island run.
      const n = par === 5 ? 4 : 3;
      for (let g = 0; g < n; g++) addGap(0.3 + (0.72 - 0.3) * (g / (n - 1)) + rng.range(-0.02, 0.02), rng.range(0.045, 0.065));
    } else {
      // STAGGERED: gaps at irregular positions and varied sizes — no two carries the same distance.
      const n = par === 5 ? 3 : 2;
      for (let g = 0; g < n; g++) addGap(rng.range(0.26, 0.76), rng.range(0.05, 0.085));
    }
    // Gap ceiling in carry-relative yards (shot carry scales with the biome's carryMult, so the bar
    // is `yd × carryMult` in course units): gentler just past the arming threshold, up to ~60% of a
    // nominal driver at wildness 1 — the A4+ brutality the deep stops are meant for. Budgets are
    // u-fractions of the ACTUAL centreline arc (island chains bend 1.4× harder, so the arc runs well
    // past the nominal `length`); the straight chord a shot actually flies is ≤ the arc, so an
    // arc-capped gap is conservatively carryable.
    const wRamp = Math.max(0, Math.min(1, (wildness - LOST_ROUGH_MIN_WILDNESS) / (1 - LOST_ROUGH_MIN_WILDNESS)));
    const maxGapYd = ISLAND_GAP_MAX_YD_CALM + (ISLAND_GAP_MAX_YD_WILD - ISLAND_GAP_MAX_YD_CALM) * wRamp;
    const arcLen = pathLength(centreline) || length;
    const maxGapU = (maxGapYd * biome.carryMult) / arcLen;
    const minPadU = Math.max(ISLAND_PAD_MIN_U, (ISLAND_PAD_MIN_YD * biome.carryMult) / arcLen);
    // Absolute (course-yd) min gap — the render's dilation bridge is a fixed course distance, not a
    // carry-relative one — so every hop stays a visible void carry (graphic ≡ physics).
    const minGapU = ISLAND_GAP_MIN_YD / arcLen;
    gapBands.push(...separateIslandGaps(rawGaps, maxGapU, minPadU, minGapU, ISLAND_GAP_SPAN));
  }
  const corridorSegs = brokenCorridor(dense, leftHW, rightHW, gapBands);
  if (corridorSegs.length === 0) corridorSegs.push(ribbon(dense, leftHW, rightHW)); // never carve it all away
  // The corridor feature(s). An island-green par 3 overrides this with a compact green-centred island
  // once the green radius is known (just below).
  let corridorFeatures: Feature[] = corridorSegs.map((poly) => ({ kind: 'fairway', poly }));
  // Hazard placement + the fairness validator both reason about the corridor's WIDEST point
  // (validateFairness recovers the max lateral extent of the fairway poly), so use that here —
  // penalty hazards then clear the widest part and stay provably fair.
  let fairwayHalfWidth = Math.max(...leftHW, ...rightHW);

  const teeBox: Feature = { kind: 'tee', poly: blobPoly(tee, 8, 8, 0, rng) };
  // Varied GREEN shape (GS-greens), per-biome character. baseR scaled by the biome's greenSize AND by
  // hole length (GS-hazards-2): a short pitch gets a SMALL, demanding target while a long par-5 gets a
  // bigger, more receptive green — par-3 small / par-5 large, the real-design rule. Pure value scale
  // off the already-drawn `tpl.lenMult`, so no new rng draw (the downstream stream is unperturbed).
  const greenLenFactor = Math.max(0.74, Math.min(1.26, 0.5 + tpl.lenMult * 0.5));
  const greenR = rng.range(11, 16) * (biome.greenSize ?? 1) * greenLenFactor;
  const greenPolygon = greenPoly(green, greenR, biome.greenAspect ?? 1.8, biome.greenIrregular ?? 1, rng);
  const greenF: Feature = { kind: 'green', poly: greenPolygon };

  // Island-green par 3: replace the long corridor with a generous organic island around the green.
  // Sized so a sensible tee shot holds it (≈110 yd wide at a ~165 yd hole) while a real miss finds the
  // deep. fairwayHalfWidth → the island radius so any (sand) greenside hazards still clear fairly.
  if (islandPar3) {
    // GS-island-width: seeded widen-ONLY variability (×1–1.25) so island greens vary from snug
    // target to generous shelf — never below the old fixed size (islands only get wider). The
    // draw is gated on islandPar3 (lost-rough armed), so every other world's stream is untouched.
    const islandR = (greenR * 1.8 + 30) * rng.range(1, 1.25);
    corridorFeatures = [{ kind: 'fairway', poly: blobPoly(green, islandR, 14, 0.16, rng) }];
    fairwayHalfWidth = islandR;
  }

  // Flag inside the (arbitrary-shape) green via ray-march from the centre (GS-6/GS-greens): always
  // genuinely inside (never on the lip) yet off-centre, for ANY shape. Drawn from a SIDE rng keyed
  // by hole index so the flag is deterministic without perturbing the main terrain stream.
  const pinRng = new Rng(`${rng.seed}:pin:${holeIndex}`);
  const pin: Vec = pinInGreen(green, greenPolygon, pinRng);

  // Green SLOPE (GS-greens-3): a downhill fall-line direction + a magnitude up to the biome's
  // greenSlopeMax. Drawn from a SIDE rng (like the pin) so adding it leaves the main terrain stream
  // — and thus every existing course's layout — byte-for-byte unchanged.
  // GS-putt-depth: harder stops tilt the greens MORE — the multiplier floor rises with wildness, so a
  // wild stop's greens bias steeper (a stiffer, breakier putt) while a CALM stop (wildness 0) keeps the
  // old range(0.4,1) draw byte-for-byte. Still capped at 1 → never above the biome's greenSlopeMax
  // ceiling (green-slope test holds), and drawn from the SIDE slope rng so the terrain stream is intact.
  const slopeRng = new Rng(`${rng.seed}:slope:${holeIndex}`);
  const slopeAng = slopeRng.range(0, Math.PI * 2);
  const slopeMag = (biome.greenSlopeMax ?? 0.5) * slopeRng.range(0.4 + 0.45 * wildness, 1);
  const greenSlope: Vec = [Math.cos(slopeAng) * slopeMag, Math.sin(slopeAng) * slopeMag];

  // Green CONTOUR (GS-green-contour): 1–2 radial mounds/hollows layered over the plane, so putts
  // break in MORE THAN ONE direction — cross a lobe and the ball curls left then right, like a real
  // green. Drawn from its OWN side stream (like pin/slope) so terrain, pin and plane slope draws are
  // all byte-identical; a second lobe is likelier on wilder stops (a nastier read), but even a calm
  // green gets one gentle roll so greens never read as flat planes. Lobe strength is capped by the
  // biome's greenSlopeMax like the plane, and its footprint is sized to the green so the break is
  // readable at putt zoom — fairness rides the aim clamp always reaching past the ideal borrow.
  const contourRng = new Rng(`${rng.seed}:contour:${holeIndex}`);
  const nLobes = contourRng.bool(0.3 + 0.45 * wildness) ? 2 : 1;
  const greenContour: GreenLobe[] = [];
  for (let li = 0; li < nLobes; li++) {
    const la = contourRng.range(0, Math.PI * 2);
    const ld = greenR * contourRng.range(0.2, 0.75); // centre inside the green, off-middle
    const lr = greenR * contourRng.range(0.45, 0.85); // footprint: a broad roll, not a pimple
    const lh =
      (biome.greenSlopeMax ?? 0.5) *
      contourRng.range(0.3, 0.75) *
      (0.55 + 0.45 * wildness) *
      (contourRng.bool() ? 1 : -1); // mound or hollow
    greenContour.push({ c: [green[0] + Math.cos(la) * ld, green[1] + Math.sin(la) * ld], r: lr, h: lh });
  }

  // Fairway APRON (GS-greens): a tapering strip that runs THROUGH and PAST the green so the fairway
  // wraps around it instead of ending at a hard flat line. Skipped for void island greens (the green
  // floats over the abyss — nothing behind it). A SEPARATE fairway feature so it never widens the
  // corridor's fairness half-width (validateFairness keys off the FIRST fairway feature).
  const features: Feature[] = [...corridorFeatures];
  if (!lostRough) {
    const pa = dense[dense.length - 2] ?? tee;
    const pb = dense[dense.length - 1] ?? green;
    let dx = pb[0] - pa[0];
    let dy = pb[1] - pa[1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    // The apron must MELT into the corridor, not sit on it as a rectangular shelf (the "section around
    // the green that doesn't fit"). On a tight/wild hole the old constant-width apron was far wider than
    // the narrow corridor, so its flat tee-side cut showed as a hard step behind the green. Fix: START
    // the apron at the CORRIDOR's own half-width at the green (a flush join — nothing protrudes), swell
    // only enough to WRAP the green, then taper to a soft point past it, with BOTH ends rounded so there
    // is no flat cut anywhere. More points → a smooth, organic blend rather than a slab.
    const corrHW = (leftHW[leftHW.length - 1]! + rightHW[rightHW.length - 1]!) / 2;
    const back = greenR + 14;
    const tail = greenR * 1.6 + 16;
    const wrap = Math.max(greenR + 9, corrHW); // wraps the green, never narrower than the corridor here
    const apronLine: Vec[] = [
      [green[0] - dx * back, green[1] - dy * back],
      [green[0] - dx * back * 0.4, green[1] - dy * back * 0.4],
      green,
      [green[0] + dx * tail * 0.55, green[1] + dy * tail * 0.55],
      [green[0] + dx * tail, green[1] + dy * tail],
    ];
    const apronHW = [corrHW, (corrHW + wrap) / 2, wrap, wrap * 0.62, wrap * 0.3];
    features.push({ kind: 'fairway', poly: ribbon(apronLine, apronHW, apronHW, true, true) });
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
    if (!placed && !ship) {
      // Couldn't find a fair spot for the penalty kind — a sand bunker is always fair. (The derelict
      // has NO sand: an unplaceable greenside breach is simply omitted — its greenside danger comes
      // from the sanctioned breach RING below + the shoulder breaches instead.)
      hazards.push({ kind: 'bunker', poly: blobPoly(place(rng.range(0, Math.PI * 2)), r, 9, 0.2, rng) });
    }
  }

  // Fairway-flanking penalty hazards: count scales with wildness. Placed CLEAR of the
  // play corridor (fairness guarantee) — rejected if they'd block a sensible line. An island-green
  // par 3 skips them entirely: the surrounding deep IS the hazard (ponds in the void read wrong).
  const flankAttempts = islandPar3 ? 0 : Math.round(rng.range(0, 1.5) + wildness * 3);
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

  // SHIP DECK BREACHES (GS-ship-interior): the derelict's ONLY on-corridor hazard — acid has eaten
  // holes clean through the hull deck, opening to the void (a `breach` = a +1 lost-ball drop). Placed
  // in the corridor SHOULDER, OUT past the central fair lane (`half*0.5`) but INSIDE the bulkheads, so
  // a sensible centred shot is always clean yet a shot drifting toward a wall can fall through and be
  // lost — the "be careful" the walled ship otherwise lacks. Reachable (unlike a flanking penalty
  // BEYOND the wall). Every vertex is proven clear of the central lane before it's kept (a strict
  // mirror of `validateFairness`, padded), so `generateCourse` never throws. Ship-only + gated → every
  // other world byte-identical; the wider corridor (SHIP_CORRIDOR_SCALE) gives the shoulder real room.
  if (ship && !islandPar3) {
    const nBreach = Math.round(1 + wildness * 2.5);
    const fairHalf = fairwayHalfWidth * 0.55; // stricter than the validator's half*0.5 → safe margin
    for (let i = 0; i < nBreach; i++) {
      const t = rng.range(0.26, 0.86);
      const side = rng.bool() ? 1 : -1;
      const r = rng.range(3.5, Math.max(4, fairwayHalfWidth * 0.15));
      const along = centrePoint(centreline, t);
      const perp = perpAt(centreline, t);
      const lateral = fairwayHalfWidth * 0.62 + rng.range(0, fairwayHalfWidth * 0.22);
      const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
      const poly = blobPoly(c, r, 10, 0.2, rng);
      const fair = poly.every((p) => polylineDist(p, centreline) > fairHalf + 1 || segDist(p, tee, green) > fairHalf + 1);
      if (fair) hazards.push({ kind: 'breach', poly });
    }
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

  // ROUGH GRADIENT (GS-rough-gradient) — a distance-graded fill of the off-corridor rough, LAYERED on
  // top of the scattered treeline above. The rough used to be too thin/patchy, so a sprayed ball just
  // bounced through light rough and IGNORED the hole. This pass makes the rough READ as trouble that
  // drives play back to the fairway: a HEAVY-ROUGH band (deeprough/fescue) HUGS the corridor edge and,
  // beyond it, the world's TREES thicken with distance — "the further out, the more forest". The only
  // difficulty lever here is the SHAPE (fairness is untouched — every kind is NON-penalty, so
  // `validateFairness` ignores them and they may hug the edge):
  //   • calm stops — a WIDE, recoverable heavy-rough buffer with the trees pushed far out, uniform hole
  //     to hole, so a wild spray lands in deep rough it can hack out of, not the woods;
  //   • wild stops (≥ ROUGH_CHAR_MIN_WILDNESS) — a per-hole CHARACTER roll ("a lot more random"): a
  //     TIGHT tree chute (trees crowd the edge), a heavy-rough gauntlet (deep rough at the edge), or a
  //     mixed hole; the forest also thickens with wildness.
  // CRITICAL — this pass draws from a DEDICATED side stream (`roughRng`, keyed off the hole like the
  // pin/slope/contour streams), NOT the main `rng`. So it perturbs NO existing draw: every penalty
  // crossing/pond, green, grove and the whole terrain geometry stay byte-for-byte identical, and
  // `validateCrossings`/`validateFairness` are unaffected — only the (non-penalty) rough hazards are
  // ADDED. Scaled by the world's `treeDensity` so a scrub world stays scrubby (few trees, still a real
  // heavy-rough band) and a jungle walls the fairway. Skipped on lost-rough worlds (off the fairway is
  // already the abyss).
  if (!lostRough) {
    const roughRng = new Rng(`${rng.seed}:rough:${holeIndex}`);
    const td = biome.treeDensity ?? 0;
    // The heavier of the two near-band kinds. Land worlds use the `deeprough` hack-out lie; the OCEAN
    // world's rough is a sandy dune shore (its deep-rough-cut is the SEA via the water pass), so it
    // keeps a `fescue`-only band — no land `deeprough` lie — preserving its identity.
    const heavyKind = biome.deepRough === 'water' ? 'fescue' : 'deeprough';
    const charRoll = roughRng.float();
    // Heavy-rough BUFFER: yards of heavy rough past the fairway edge before the forest begins.
    let buffer: number;
    if (wildness >= ROUGH_CHAR_MIN_WILDNESS) {
      if (charRoll < 0.34) buffer = roughRng.range(2, 12); // tight tree chute — canopies at the edge
      else if (charRoll < 0.64) buffer = roughRng.range(30, 54); // heavy-rough gauntlet — deep rough at the edge
      else buffer = roughRng.range(12, 34); // mixed
    } else {
      buffer = (26 + 18 * (1 - wildness)) * roughRng.range(0.9, 1.15); // wide + forgiving, uniform
    }
    const STEPS = par === 3 ? 12 : 16;
    // How far past the buffer the woods run (the back wall), grown by the world's tree density + wildness.
    const forestReach = 24 + 28 * (td / (td + 1)) + wildness * 16;
    // Keep a blob of radius r fully OUTSIDE the local corridor edge (blobPoly jitter ≤ 0.32) so the
    // fairway route stays a clean mown lie — heavy rough LINES the fairway, never sits on it.
    const standoff = (r: number) => r * 1.34 + 1;
    for (let s = 0; s < STEPS; s++) {
      const t = 0.05 + (s / (STEPS - 1)) * 0.92;
      const along = centrePoint(centreline, t);
      const perp = perpAt(centreline, t);
      const idx = Math.max(0, Math.min(segs - 1, Math.round(t * (segs - 1))));
      const edge = Math.max(leftHW[idx] ?? fairwayHalfWidth, rightHW[idx] ?? fairwayHalfWidth, 5);
      // Bound the deepest trees near the old treeline's reach so playBounds (and the OB box, which is
      // derived from all terrain) doesn't balloon the hole out on the wide heavy-rough character holes.
      const maxLat = Math.min(edge + 96, edge + buffer + forestReach + 12);
      for (const side of [-1, 1] as const) {
        // HEAVY-ROUGH near band — deep rough / fescue hugging the edge, near-continuous so a miss is
        // caught. A calm hole's wide buffer packs it with recoverable heavy rough (denser on the calm
        // stops — the "more rough on low difficulty" ask); a tight-tree hole has almost none.
        const nearMax = wildness < ROUGH_CHAR_MIN_WILDNESS ? 2 : 1;
        const roughBlobs = buffer < 8 ? (roughRng.float() < 0.45 ? 1 : 0) : 1 + (roughRng.float() < 0.55 ? nearMax - 1 : 0);
        for (let k = 0; k < roughBlobs; k++) {
          const r = roughRng.range(6, 12);
          const lat = edge + standoff(r) + roughRng.range(0, Math.max(2, buffer));
          const c: Vec = [along[0] + perp[0] * side * lat, along[1] + perp[1] * side * lat];
          const kind = roughRng.float() < 0.5 ? heavyKind : 'fescue';
          hazards.push({ kind, poly: blobPoly(c, r, 10, 0.32, roughRng) });
        }
        // FOREST band — trees thickening with distance AND wildness: each candidate ring is likelier to
        // plant the further out it sits, so the wall reads deepest at the back, and harder stops grow
        // more forest. Ring count ∝ treeDensity; small canopies so a "tight" chute hugs close without
        // poking onto the fairway.
        const rings = td <= 0 ? 0 : Math.min(3, 1 + Math.round(td));
        for (let ring = 0; ring < rings; ring++) {
          const depthFrac = rings === 1 ? 0.5 : ring / (rings - 1);
          const plantP = Math.min(0.95, 0.18 + td * 0.14 + depthFrac * 0.42 + wildness * 0.28);
          if (roughRng.float() > plantP) continue;
          const r = roughRng.range(3.5, 6);
          const lat = Math.min(maxLat, edge + Math.max(buffer, standoff(r)) + depthFrac * forestReach + roughRng.range(0, 10));
          const c: Vec = [along[0] + perp[0] * side * lat, along[1] + perp[1] * side * lat];
          hazards.push({ kind: 'trees', poly: blobPoly(c, r, 8, 0.3, roughRng) });
        }
      }
    }
  }

  // Blocking GROVES on a dogleg's cut-the-corner line (GS-variety): tall stands of trees planted where
  // the STRAIGHT tee→green line leaves the fairway corridor — i.e. the corner you'd otherwise just fire
  // over to reach the pin. With them there, you can't bomb it straight at the green; you have to play
  // AROUND, along the fairway (the lever the future fairway-follow trick-shot perks/talents need).
  // Trees are NON-PENALTY (a punch-out, never a lost card) and sit OUTSIDE the corridor, so
  // validateFairness ignores them and the fairway route stays clean — only a shot trying to cut the
  // corner is knocked down. Big blobs ⇒ TALL canopies that block lofted attempts too. Tree worlds,
  // par 4/5, not on a void island (which stays a straight honest target).
  // NOT wildness-gated any more (GS-variety-2): the whole point is that you CAN'T just bomb it
  // straight across a dogleg's inside — so a bend gets its corner FILLED whether the stop is calm or
  // wild. (The old `wildness >= 0.3` gate meant every early dogleg was cuttable, which read as "the
  // doglegs aren't real".) Difficulty still ramps via bend severity + canopy height, not presence.
  if ((biome.treeDensity ?? 0) > 0 && par >= 4 && !lostRough) {
    const chordLen = dist(tee, green) || 1;
    const cdx = (green[0] - tee[0]) / chordLen;
    const cdy = (green[1] - tee[1]) / chordLen;
    // Denser + a proper wall: scale the stand frequency by the world's tree density so a sparse world
    // (ember snags) still gets a real blocker while parkland/jungle grows a thick grove. Capped per
    // hole; canopies run TALLER (bigger blobs → higher canopy in flight.ts) so a lofted bomb over the
    // corner is knocked down too — you play AROUND, along the fairway. A whole clump per stand so the
    // inside of the leg reads as filled, not a token tree.
    const standChance = Math.min(0.5, 0.16 + (biome.treeDensity ?? 0) * 0.14 + wildness * 0.08);
    const maxStands = par >= 5 ? 3 : 2;
    let stands = 0;
    const STEPS = 16;
    for (let s = 2; s < STEPS - 1 && stands < maxStands; s++) {
      const f = s / STEPS;
      const cp: Vec = [tee[0] + cdx * chordLen * f, tee[1] + cdy * chordLen * f];
      // Only where the straight line is genuinely OFF the corridor (the corner being cut), and never
      // near the corridor edge (keeps the fairway route clear).
      if (polylineDist(cp, centreline) < fairwayHalfWidth + 12) continue;
      if (rng.float() > standChance) continue;
      stands++;
      hazards.push({ kind: 'trees', poly: blobPoly(cp, rng.range(5, 8.5), 9, 0.3, rng) });
      // A small clump of companions so the corner reads FILLED — each kept off the corridor edge.
      const companions = rng.int(1, 3);
      for (let k = 0; k < companions; k++) {
        const a = rng.range(0, Math.PI * 2);
        const dd = rng.range(7, 14);
        const c2: Vec = [cp[0] + Math.cos(a) * dd, cp[1] + Math.sin(a) * dd];
        if (polylineDist(c2, centreline) >= fairwayHalfWidth + 7) {
          hazards.push({ kind: 'trees', poly: blobPoly(c2, rng.range(3.5, 6.5), 8, 0.3, rng) });
        }
      }
    }
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
    const t = rng.range(0.08, 0.92); // GS-rivers-2: a wide target; riverChannel clamps it to the fair window
    const thickness = Math.min(34, length * 0.085, rng.range(8, 13) + wildness * rng.range(6, 16));
    const river = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'lavariver', poly: river.poly });
    // Molten source + mouth pools (GS-rivers) — no grove (lava wells from a vent, not a forest).
    hazards.push(...riverTerminals(river, 'lava', { allowGrove: false, centreline, tee, green, halfW: fairwayHalfWidth, wildness }, rng));
  }

  // Frozen-pond crossing (frost signature, GS-mechanics): a meltwater channel crosses the corridor
  // as a FORCED CARRY — same sanctioned-crossing machinery as the lava river (exempt from
  // `validateFairness`, proven carryable by `validateCrossings`). Longer holes only (a creek across a
  // par-3 leaves no approach); a touch narrower than lava since the AI must clear cold water.
  if (biome.frozenPond && par >= 4 && wildness >= FROZEN_POND_MIN_WILDNESS) {
    const t = rng.range(0.08, 0.92); // GS-rivers-2: a wide target; riverChannel clamps it to the fair window
    const thickness = Math.min(30, length * 0.075, rng.range(7, 12) + wildness * rng.range(5, 14));
    const river = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'frozenpond', poly: river.poly });
    // Meltwater source + mouth pools (GS-rivers); a snowy tree stand can hide the source ("out of the woods").
    hazards.push(...riverTerminals(river, 'water', { allowGrove: true, centreline, tee, green, halfW: fairwayHalfWidth, wildness }, rng));
  }

  // Water CREEK crossing (parkland signature, GS-terrain): a stream/creek runs across the fairway as
  // a FORCED CARRY — the same sanctioned-crossing machinery as the lava river / frozen pond (exempt
  // from `validateFairness`, proven carryable by `validateCrossings`; the carry-aware AI flies it
  // generically off its `penalty`). Only ONE crossing per hole — skip if a river/pond already crosses,
  // so there's always a safe shelf between. Longer holes only; thickness capped relative to the hole.
  const hasCrossing = hazards.some((h) => CROSSING_KINDS.has(h.kind));
  if (biome.waterCreek && par >= 4 && wildness >= WATER_CREEK_MIN_WILDNESS && !hasCrossing) {
    const t = rng.range(0.08, 0.92); // GS-rivers-2: a wide target; riverChannel clamps it to the fair window
    const thickness = Math.min(26, length * 0.06, rng.range(6, 10) + wildness * rng.range(5, 13));
    const river = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'creek', poly: river.poly });
    // Source + mouth pools (GS-rivers): the creek visibly runs FROM a headwater/wood INTO a lake
    // instead of a band floating in the rough (water family → the mouth lake merges into the creek).
    hazards.push(...riverTerminals(river, 'water', { allowGrove: true, centreline, tee, green, halfW: fairwayHalfWidth, wildness }, rng));
  }

  // POT-bunker NESTS (GS-hazards-2): clusters of small, deep pots that PINCH the landing zone — the
  // classic strategic squeeze (carry well past or lay up short). Sand-class → NON-PENALTY (a steep
  // escape tax, never a lost card), so they may bite the corridor edge; appended after the existing
  // hazards so every earlier placement stays byte-identical to before this field existed.
  const potNests = par >= 4 ? Math.round((biome.potBunkers ?? 0) * (0.6 + 0.7 * wildness)) : 0;
  for (let i = 0; i < potNests; i++) {
    const t = rng.range(0.32, 0.74);
    const side = rng.bool() ? 1 : -1;
    const perp = perpAt(centreline, t);
    const cluster = rng.int(2, 4);
    for (let k = 0; k < cluster; k++) {
      const r = rng.range(3.2, 5);
      // March the cluster out from the corridor edge so it pinches the landing zone's flank.
      const along = centrePoint(centreline, Math.max(0.05, Math.min(0.95, t + (k - cluster / 2) * 0.012)));
      const lateral = fairwayHalfWidth - rng.range(0, 4) + k * rng.range(4.5, 7);
      const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
      hazards.push({ kind: 'pot', poly: blobPoly(c, r, 9, 0.16, rng) });
    }
  }

  // Greenside POTS (GS-hazards-2): on a pot-bunker world, ring the green with a couple of deep pots —
  // on a SMALL green this reads as the encircled "Short"-template look. Sand → always fair. Appended,
  // so the existing greenside guards above are untouched.
  const greensidePots = (biome.potBunkers ?? 0) > 0 ? rng.int(0, greenR < 13 ? 3 : 2) : 0;
  for (let i = 0; i < greensidePots; i++) {
    const r = rng.range(3, 5);
    const ang = rng.range(0, Math.PI * 2);
    const dir: Vec = [Math.cos(ang), Math.sin(ang)];
    const d = rayPolyDist(green, dir, greenPolygon) + r + rng.range(2, 6);
    hazards.push({ kind: 'pot', poly: blobPoly([green[0] + dir[0] * d, green[1] + dir[1] * d], r, 9, 0.18, rng) });
  }

  // Thick FESCUE / native rough (GS-hazards-2): non-penalty deep-rough patches lining the rough
  // OUTSIDE the corridor (only an offline shot finds them — the GS-13 invariant) — a heavier recovery
  // lie than ordinary rough so the deep stuff reads as real wispy native grass, not a flat slab.
  const fescueCount = Math.round((biome.fescue ?? 0) * (1 + wildness) * (par === 3 ? 2 : 5));
  for (let i = 0; i < fescueCount; i++) {
    const t = rng.range(0.08, 0.95);
    const side = rng.bool() ? 1 : -1;
    const r = rng.range(5, 11);
    const along = centrePoint(centreline, t);
    const perp = perpAt(centreline, t);
    const lateral = fairwayHalfWidth + r + rng.range(2, 40);
    const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
    hazards.push({ kind: 'fescue', poly: blobPoly(c, r, 10, 0.32, rng) });
  }

  // Dry RAVINE / barranca crossing (GS-hazards-2): a rocky chasm crosses the fairway as a forced carry
  // — the same sanctioned-crossing machinery as the creek/lava river (exempt from `validateFairness`,
  // proven carryable by `validateCrossings`; the carry-aware AI flies it generically off its penalty).
  // ONE crossing per hole — skipped if a river/pond/creek already crosses. Longer holes only.
  const hadCrossing = hazards.some((h) => CROSSING_KINDS.has(h.kind));
  if (biome.barranca && par >= 4 && wildness >= WATER_CREEK_MIN_WILDNESS && !hadCrossing) {
    const t = rng.range(0.08, 0.92); // GS-rivers-2: a wide target; riverChannel clamps it to the fair window
    const thickness = Math.min(28, length * 0.07, rng.range(7, 11) + wildness * rng.range(5, 14));
    const ravine = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'barranca', poly: ravine.poly });
  }

  // A hole gets a forced-carry CROSSING (river/creek/pond/ravine) OR greenside DRAMA — never both, so
  // a crossing world's greens aren't ALSO drowned (that piled ember/frost past the balance bar). Both
  // of the following only fire on a hole with no crossing, so the variety lands where a hole is
  // otherwise quiet (a par-3, or a par-4/5 that didn't draw its crossing).
  const noCrossing = !hazards.some((h) => CROSSING_KINDS.has(h.kind));

  // Greenside penalty RING (GS-variety-2): a lava ring (ember), a water inlet (parkland/ocean/frost)
  // or a void moat (void/cetus) HUGGING the green around the NON-approach arc — the dramatic "carry it
  // onto the green or you're wet/molten/lost" complex. Unlike a flanking pond (which clears the whole
  // corridor), a ring blob is a SANCTIONED exception to validateFairness (`sanctioned: true`): it may
  // sit right against the green but is kept OFF the approach window (the arc the ball flies in from)
  // AND off the approach lane, so the pin stays reachable — `validateGreenApproach` proves it.
  const ringKind = lieInfo(biome.greensideKind).penalty
    ? biome.greensideKind
    : biome.hazardKinds.includes('water')
      ? 'water'
      : biome.hazardKinds.find((k) => lieInfo(k).penalty);
  // Ship gate (GS-ship-interior): a greenside breach ring only makes sense on a CALM derelict hole,
  // where off-green is solid deck for the breach to sit in — on a LOST (island-pad) hole the ring
  // would float breaches out in the open space around the green, and off-deck is already lost anyway.
  const ringAllowed = !ship || !lostRough;
  if (noCrossing && !islandPar3 && ringAllowed && ringKind && rng.float() < 0.34 + wildness * 0.3) {
    const appFrom = centrePoint(centreline, 0.84);
    let adx = green[0] - appFrom[0];
    let ady = green[1] - appFrom[1];
    const al = Math.hypot(adx, ady) || 1;
    adx /= al;
    ady /= al;
    const openAng = Math.atan2(-ady, -adx); // toward the approach — the safe penalty-free opening
    const openHalf = 1.2; // ±~69° penalty-free window on the approach side
    const ringCount = rng.int(2, 4);
    for (let b = 0; b < ringCount; b++) {
      const r = rng.range(5, 9);
      const gap = rng.range(1, 5);
      for (let attempt = 0; attempt < 10; attempt++) {
        const ang = rng.range(0, Math.PI * 2);
        if (angDelta(ang, openAng) < openHalf) continue; // keep the approach window clear
        const dir: Vec = [Math.cos(ang), Math.sin(ang)];
        const d = rayPolyDist(green, dir, greenPolygon) + r + gap;
        const c: Vec = [green[0] + dir[0] * d, green[1] + dir[1] * d];
        if (segDist(c, appFrom, green) < greenR * 0.9 + r) continue; // keep the approach lane clear
        hazards.push({ kind: ringKind, poly: blobPoly(c, r, 10, 0.22, rng), sanctioned: true });
        break;
      }
    }
  }

  // APPROACH LAKE (GS-variety-2): a big lake/lava body flanking the corridor ~3/4 of the way up —
  // right where you land the approach or lay up. The old hazard field bunched at driver range then
  // went quiet until the green; this fills the approach zone so the whole hole has teeth. Still CLEAR
  // of the corridor (fairness) — it swallows an offline approach, never a sensible one. Longer holes.
  if (noCrossing && par >= 4 && !islandPar3 && rng.float() < 0.4 + wildness * 0.35) {
    const kind = biome.hazardKinds.includes('water') ? 'water' : biome.hazardKinds.find((k) => lieInfo(k).penalty);
    if (kind) {
      const r = rng.range(16, 24 + wildness * 14);
      const t = rng.range(0.66, 0.82); // the approach / lay-up zone
      const side = rng.bool() ? 1 : -1;
      const along = centrePoint(centreline, t);
      const perp = perpAt(centreline, t);
      const lateral = fairwayHalfWidth + r + rng.range(4, 16);
      const c: Vec = [along[0] + perp[0] * side * lateral, along[1] + perp[1] * side * lateral];
      if (clearsPlayCorridor(c, r, centreline, tee, green, fairwayHalfWidth)) {
        hazards.push({ kind, poly: blobPoly(c, r, 16, 0.3, rng) });
      }
    }
  }

  // DEEP ROUGH on a dogleg's cut-the-corner line (GS-deep-rough): the deepest recoverable land lie
  // (`deeprough`) — or, on the OCEAN world, the sea itself (`water`, a penalty carry) — CHOKING the
  // inside of a bend, right on the STRAIGHT tee→green line you'd otherwise just fire over to reach the
  // pin. With it there, cutting the corner drops you in hay you can barely advance from (or in the
  // drink), so you must play AROUND, down the fairway — the same lever as the blocking groves but a
  // GROUND hazard a lofted bomb can't clear. Kept fully OFF the corridor (a generous margin), so the
  // fairway route stays clean and, for the ocean's penalty water, `validateFairness` holds by
  // construction (the corner sits far from the bent corridor even though it's on the straight chord).
  // Only genuine bends qualify — on a straight hole the chord hugs the centreline, so nothing places.
  // Wildness-gated (the opener stays forgiving) and per-biome opt-in via `deepRough`; the lost-rough
  // worlds (void/cetus) never set it, so they're untouched. Appended after every other hazard pass, so
  // each earlier placement is byte-identical to before this field existed.
  if (biome.deepRough && par >= 4 && !lostRough && wildness >= DEEP_ROUGH_MIN_WILDNESS) {
    const kind = biome.deepRough;
    const chordLen = dist(tee, green) || 1;
    const cdx = (green[0] - tee[0]) / chordLen;
    const cdy = (green[1] - tee[1]) / chordLen;
    // Reliable enough to actually FORCE the fairway route (the whole point), ramping with wildness.
    const standChance = Math.min(0.9, 0.55 + wildness * 0.35);
    const maxStands = par >= 5 ? 3 : 2;
    let stands = 0;
    const STEPS = 14;
    for (let s = 2; s < STEPS - 1 && stands < maxStands; s++) {
      const f = s / STEPS;
      const cp: Vec = [tee[0] + cdx * chordLen * f, tee[1] + cdy * chordLen * f];
      // Only where the straight line is genuinely OFF the corridor (the corner being cut). The +22
      // reject leaves clearance for the blob radius below so its inner edge never reaches the corridor.
      if (polylineDist(cp, centreline) < fairwayHalfWidth + 22) continue;
      if (rng.float() > standChance) continue;
      stands++;
      const r = rng.range(7, 11);
      hazards.push({ kind, poly: blobPoly(cp, r, 12, 0.3, rng) });
      // A couple of companions choke the rest of the gap between the corridor and the straight line —
      // each kept off the corridor edge so the fairway stays clean (and any penalty stays fair).
      const companions = rng.int(1, 3);
      for (let k = 0; k < companions; k++) {
        const a = rng.range(0, Math.PI * 2);
        const dd = rng.range(6, 14);
        const c2: Vec = [cp[0] + Math.cos(a) * dd, cp[1] + Math.sin(a) * dd];
        const r2 = rng.range(5, 8);
        if (polylineDist(c2, centreline) >= fairwayHalfWidth + r2 + 10) {
          hazards.push({ kind, poly: blobPoly(c2, r2, 10, 0.3, rng) });
        }
      }
    }
  }

  // Cross-family overlap dedupe (GS-hazard-blend): a hazard that spawned ON a different substance
  // (water over sand, sand over lava…) is dropped — trees and the sanctioned crossings excepted.
  // Pure geometry, zero rng draws — every stream stays byte-identical.
  let cleanHazards = dedupeHazardOverlaps(hazards);
  // On a LOST-ROUGH island hole the pads float in the abyss and the abyss IS the only penalty, so
  // strip any hazard stranded in the void (GS-cetus / void): every penalty pool and every sand/tree
  // blob that isn't sitting on a pad. Zero-rng post-filter (like the dedupe), gated on lostRough so
  // every normal world + calm void/cetus stop stays byte-identical.
  if (lostRough) {
    const pads = features.filter((f) => f.kind === 'fairway' || f.kind === 'green' || f.kind === 'tee');
    cleanHazards = clearVoidHazards(cleanHazards, pads);
  }

  // Wind: biome base + wildness ramp; vacuum biomes stay near-calm.
  const wind: Wind = {
    dir: rng.range(0, 360),
    spd: biome.windBase + rng.range(0, biome.windWild) * wildness,
  };

  // Carry modifier (gravity), with optional per-hole jitter (antigrav pockets).
  const carry = biome.carryMult * (biome.carryJitter ? 1 + rng.range(-biome.carryJitter, biome.carryJitter) : 1);
  const biomeMods: BiomeMod[] = [{ kind: 'carry', value: carry, note: `${biome.id} gravity` }];
  // Arm the lost-rough lie for this hole (read by `lieAt` off-feature). The render mirrors this
  // gate (GS-rough-frame): armed → the fairway floats as island platforms in the open deep, so
  // off-fairway LOOKS like the lost ball it is; un-armed → a normal rough landmass, so calm
  // void/cetus stops look as forgiving as they play.
  if (lostRough) biomeMods.push({ kind: 'roughLie', note: lostRough });

  // Ship-corridor WALLS (GS-ship-walls): line the derelict's hull-deck corridor with collidable metal
  // walls off the SAME ribbon edges. Skipped for island-green par 3s (a blob target, no ribbon). Pure
  // geometry, zero rng — the whole feature is gated on `biome.walls`, so every other world is untouched.
  const walls = biome.walls && !islandPar3 ? buildShipWalls(dense, leftHW, rightHW, gapBands, WALL_HEIGHT) : undefined;

  return { par, tee, green, pin, centreline, features, hazards: cleanHazards, wind, biomeMods, shapeId: tpl.id, widthId: wp.id, greenSlope, greenContour, ...(walls && walls.length ? { walls } : {}) };
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

/** The structural shapes the template grammar can draw (GS-shapes-2). */
type ShapeKind = 'straight' | 'dogleg' | 'double' | 'hairpin' | 'cape';

/**
 * A drawn hole-design template (GS-shapes-2): a SHAPE coupled with a LENGTH multiplier, so the
 * generator stops emitting one length + one gentle bend. `id` is the human/UI label stamped on
 * `Hole.shapeId` (the sim never branches on it — physics ride the geometry). `side` is the bend
 * direction (drawn once so a cape/dogleg/hairpin knows which way it turns), `severity` pushes a
 * hairpin's corner toward the self-cross cap.
 */
interface HoleTemplate {
  id: string;
  shape: ShapeKind;
  side: 1 | -1;
  lenMult: number;
  severity: number;
}

/**
 * Pick a hole archetype (GS-shapes-2). Couples a length CLASS (drivable / standard / long par-4,
 * short / mid / long par-3, reachable / standard / three-shot par-5) with a SHAPE, biome- and
 * wildness-biased: the chaotic worlds and the deeper stops bend more, the heroic CAPE and severe
 * HAIRPIN only arm once the journey turns a touch wild, and a drivable par-4 stays playable-straight
 * so you can genuinely have a go at the green. Draw order (length roll, shape roll, side) is fixed so
 * the downstream RNG stream is stable. A void island stays a straight, honest target.
 */
function chooseTemplate(rng: Rng, par: number, biome: Biome, wildness: number, island: boolean): HoleTemplate {
  const side: 1 | -1 = rng.bool() ? 1 : -1;
  // Par-3 island (void/cetus deep): a single generous target island — a straight carry, no corridor
  // to shape. Par 4/5 islands FALL THROUGH to the full shape grammar below (GS-cetus-5): a lost-rough
  // par 4/5 is now a bending CHAIN of clifftop pads, the island-hop signature. (The old rule forced
  // ALL lost holes straight to protect the auto-AI from aiming into the void; that balance is now
  // deliberately deferred to the AI/death-spiral rework — human interest first.)
  if (island && par === 3) return { id: 'island', shape: 'straight', side, lenMult: rng.range(0.86, 1.12), severity: 1 };

  const lenRoll = rng.float();
  const shapeRoll = rng.float();

  if (par === 3) {
    let lenMult: number;
    let lenTag: string;
    if (lenRoll < 0.34) {
      lenMult = rng.range(0.6, 0.82); // short pitch (drop-shot / island feel)
      lenTag = 'short-3';
    } else if (lenRoll < 0.82) {
      lenMult = rng.range(0.88, 1.06);
      lenTag = 'par-3';
    } else {
      lenMult = rng.range(1.1, 1.28); // long iron — kept modest so it stays reachable
      lenTag = 'long-3';
    }
    // Mostly straight; the doglegging worlds give the odd angled (Redan-ish) par 3.
    const angled = shapeRoll < 0.16 + biome.doglegBias * 0.5;
    return { id: angled ? `angled-${lenTag}` : lenTag, shape: angled ? 'dogleg' : 'straight', side, lenMult, severity: 0.5 };
  }

  let lenMult: number;
  let lenTag: string;
  if (par === 4) {
    // GS-variety-3: keep the DRIVABLE par-4 a live change-of-pace at EVERY wildness. A short, heroic
    // "have a go at the green" hole is one of the most interesting in golf (research §B), yet the old
    // ramp HALVED its frequency deep in (0.24 → 0.12) — exactly where the game most needed variety.
    // Now it barely tapers, so a wild stop still gets the occasional thrilling drivable hole.
    const pDriv = 0.15 + 0.06 * (1 - wildness);
    if (lenRoll < pDriv) {
      lenMult = rng.range(0.66, 0.8); // drivable short par-4
      lenTag = 'drivable';
    } else if (lenRoll < 0.82) {
      lenMult = rng.range(0.9, 1.1);
      lenTag = '';
    } else {
      lenMult = rng.range(1.12, 1.24); // long, stout par-4
      lenTag = 'long';
    }
  } else {
    if (lenRoll < 0.3) {
      lenMult = rng.range(0.84, 0.96); // reachable in two
      lenTag = 'reachable';
    } else if (lenRoll < 0.8) {
      lenMult = rng.range(1.0, 1.12);
      lenTag = '';
    } else {
      lenMult = rng.range(1.16, 1.3); // a genuine three-shotter
      lenTag = 'three-shot';
    }
  }
  const parWord = par === 4 ? 'par-4' : 'par-5';

  // Drivable par-4s stay straight/gentle so the bomb at the green is real.
  if (lenTag === 'drivable') {
    const shape: ShapeKind = shapeRoll < 0.62 ? 'straight' : 'dogleg';
    return { id: 'drivable-par-4', shape, side, lenMult, severity: 0.55 };
  }

  // Shape mix, biome- + wildness-biased (GS-variety-2: VARIETY is decoupled from difficulty). The
  // interesting archetypes — cape (heroic diagonal carry), hairpin (severe corner) and S/double —
  // now show up even on the CALM opening stops (a nonzero base per shape, biome-biased), so a low-
  // wildness hole is no longer always a gentle straight-or-slight-dogleg. Wildness still turns the
  // dial UP (more capes/hairpins deep in), and the BEND SEVERITY is what ramps with difficulty
  // (`buildCentreline`'s dogFac), so calm stops stay fair-but-shapely while deep ones bite.
  // GS-variety-3: a hard hole need NOT bend (research §D4: "difficulty ≠ length + bend"). The old mix
  // crushed the workhorse SIMPLE shapes at high wildness — for a bendy world (void bend 0.45) it left
  // ~8% straight, ~0% plain dogleg, and ~92% cape/hairpin/double, so every deep stop (worst on the
  // long, low-gravity worlds — void/cetus/Rainbow Road) read as one long severe-bend clone. The fix is
  // SURGICAL: `straightP` now RISES with wildness (the deep stops gain straight holes — defended by
  // length, tighter width, the rough gradient and a tilted green — instead of losing them), while the
  // CALM stops keep GS-variety-2's rich early shape vocabulary (straight stays ~its old low share, so
  // the opening holes are still shapely and dispersion-sensitive gear still bites). The heroic shapes
  // stay common but no longer crowd out the plain dogleg; difficulty still rides BEND SEVERITY
  // (`buildCentreline`'s dogFac), length, corridor tightness, rough and green tilt.
  const bend = biome.doglegBias;
  const hairP = 0.05 + bend * 0.1 + wildness * 0.03; // severe corner — still rare, a touch more deep in
  const capeP = 0.1 + bend * 0.16 + wildness * 0.03; // heroic diagonal carry
  const sP = 0.12 + bend * 0.22 + wildness * 0.03; // S-curve / double-dogleg
  const straightP = Math.min(0.3, Math.max(0.08, 0.06 + wildness * 0.2 - bend * 0.06)); // straight rises with difficulty
  const sd = side > 0 ? 'r' : 'l';
  let shape: ShapeKind;
  let shapeTag: string;
  if (shapeRoll < straightP) {
    shape = 'straight';
    shapeTag = 'straight';
  } else if (shapeRoll < straightP + hairP) {
    shape = 'hairpin';
    shapeTag = `hairpin-${sd}`;
  } else if (shapeRoll < straightP + hairP + capeP) {
    shape = 'cape';
    shapeTag = `cape-${sd}`;
  } else if (shapeRoll < straightP + hairP + capeP + sP) {
    shape = 'double';
    shapeTag = `double-${sd}`;
  } else {
    shape = 'dogleg';
    shapeTag = `dogleg-${sd}`;
  }
  const id = lenTag ? `${lenTag}-${parWord}-${shapeTag}` : `${parWord}-${shapeTag}`;
  return { id, shape, side, lenMult, severity: shape === 'hairpin' ? 1.7 : 1 };
}

/** Smoothstep: 0 at `a`, 1 at `b`, C1-smooth between — the ramp the width profiles blend with. */
function sstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Fairway WIDTH archetype (GS-fairway-width): how the corridor's thickness runs along the hole.
 * `at(u)` is a width multiplier about `baseHalf` (the end envelope + lateral asymmetry are applied
 * on top by `generateHole`); `floorFrac` is the profile's own width floor as a fraction of
 * `baseHalf` — the squeezed profiles must be allowed to dip well below the classic 0.5 floor or
 * their necks flatten out; `asymScale` damps the left/right asymmetry where a squeeze must hold.
 */
interface WidthProfile {
  id: string;
  at: (u: number) => number;
  floorFrac: number;
  asymScale: number;
}

/**
 * Pick a fairway WIDTH archetype (GS-fairway-width) — the "every fairway is the same shape" fix.
 * Real courses vary width DELIBERATELY, hole to hole: a tree-lined chute off the tee that opens out
 * (Augusta's 18th), an approach that necks down into the green (Royal Lytham), a fairway pinched
 * exactly at driving distance so you lay up short or thread it (Oakmont, links driving zones), a
 * links ribbon that wanders wide-narrow-wide, a uniformly tight US-Open strip, and the huge shared
 * meadows of St Andrews. The old generator gave every hole ONE recipe (full body + landing bulges +
 * a soft pinch), so width never distinguished holes. Like the shape grammar, the width grammar is
 * VARIETY, not difficulty: profiles appear at every wildness (the overall `widthScale` early→late
 * lever still carries difficulty), and each profile's params are drawn seeded so no two chutes are
 * identical. Par 3s use only the whole-hole profiles (classic/thin/broad/wander) — a 13-segment
 * pitch corridor is too short for a chute/neck/hourglass story to read.
 *
 * Lost-rough island holes (void/cetus) get their OWN pool (GS-island-width) under one hard rule:
 * ISLANDS ONLY GET WIDER. Width is survival there (the abyss is the penalty), so every island
 * profile's `at(u)` is ≥ 1 — variety comes from bulging OUTWARD (landing bays, a flared green pad,
 * a broad tee plateau), never from a squeeze — machine-checked by `tests/fairway-width.test.ts`.
 * A lost par 3 keeps the plain 'island' recipe (its corridor is replaced by the green island blob).
 * Exported for that widen-only guard; the generator is the only production caller.
 */
export function chooseWidthProfile(rng: Rng, par: number, wildness: number, island: boolean, ship = false): WidthProfile {
  // Every profile carries a seeded sine for organic edge movement (each draws its own phase/lobes).
  const wave = (amp: number): ((u: number) => number) => {
    const phase = rng.range(0, Math.PI * 2);
    const lobes = rng.range(1.6, 3.2);
    return (u) => Math.sin(phase + u * Math.PI * lobes) * amp;
  };
  // SHIP CORRIDOR (GS-ship-corridor): a straight, near-constant-width metal hallway — the derelict's
  // signature. No landing bays, no widen-only bulges: a passage of uniform cross-section, walled by
  // impassable bulkheads. A whisper of edge movement (buckled plating), otherwise dead straight in
  // width. Nearly symmetric (a corridor doesn't lean). Drawn before the island/land pools; the derelict
  // is the only world that sets `ship`, so no other world's profile pick is touched.
  if (ship) {
    const w = wave(0.04);
    return { id: 'ship-corridor', at: (u) => 1 + w(u), floorFrac: 1, asymScale: 0.2 };
  }
  // The pre-grammar recipe: full body, two landing-zone bulges, a gentle wave and one soft pinch.
  const classic = (id = 'classic'): WidthProfile => {
    const w = wave(0.1 + 0.16 * (1 - wildness));
    const lz1 = rng.range(0.3, 0.42);
    const lz2 = rng.range(0.62, 0.76);
    const lzAmp = 0.16 + 0.12 * rng.float();
    const pinchAt = rng.range(0.2, 0.8);
    const pinchDepth = 0.2 * (1 - 0.5 * wildness) * rng.float();
    return {
      id,
      at: (u) =>
        1 +
        w(u) +
        lzAmp * Math.exp(-((u - lz1) ** 2) / 0.02) +
        lzAmp * 0.85 * Math.exp(-((u - lz2) ** 2) / 0.02) -
        Math.exp(-((u - pinchAt) ** 2) / 0.01) * pinchDepth,
      floorFrac: 0.5,
      asymScale: 1,
    };
  };
  const thin = (): WidthProfile => {
    // A uniformly tight ribbon, tee to green — the rough-lined US-Open strip.
    const tw = rng.range(0.6, 0.76);
    const w = wave(rng.range(0.05, 0.1));
    return { id: 'thin', at: (u) => tw * (1 + w(u)), floorFrac: 0.4, asymScale: 0.6 };
  };
  const broad = (): WidthProfile => {
    // A generous meadow — the St Andrews shared-fairway feel.
    const bw = rng.range(1.24, 1.5);
    const w = wave(rng.range(0.04, 0.09));
    return { id: 'broad', at: (u) => bw * (1 + w(u)), floorFrac: 0.62, asymScale: 1 };
  };
  const wander = (): WidthProfile => {
    // Strongly variable — wide bays alternating with narrow straits down the whole hole.
    const amp = rng.range(0.26, 0.42);
    const phase = rng.range(0, Math.PI * 2);
    const lobes = rng.range(2.8, 4.8);
    return { id: 'wander', at: (u) => 1 + amp * Math.sin(phase + u * Math.PI * lobes), floorFrac: 0.42, asymScale: 0.8 };
  };
  if (island) {
    // Islands ONLY get wider: a positive-only undulation (amp·(0.5 + 0.5·sin) ∈ [0, amp]) is the
    // shared organic movement, so no island profile ever dips below the raised VOID_ISLAND_SCALE
    // baseline (the old classic recipe's wave/pinch could dip to 0.5× — that squeeze is gone too).
    const posWave = (amp: number): ((u: number) => number) => {
      const phase = rng.range(0, Math.PI * 2);
      const lobes = rng.range(1.6, 3.2);
      return (u) => amp * (0.5 + 0.5 * Math.sin(phase + u * Math.PI * lobes));
    };
    if (par === 3) {
      // The par-3 corridor is replaced by the green island blob — keep the honest plain label
      // (and byte-stable draws) rather than a pool id the geometry doesn't use.
      const w = posWave(rng.range(0.12, 0.24));
      return { id: 'island', at: (u) => 1 + w(u), floorFrac: 0.7, asymScale: 1 };
    }
    const roll = rng.float();
    if (roll < 0.26) {
      const w = posWave(rng.range(0.12, 0.24));
      return { id: 'island', at: (u) => 1 + w(u), floorFrac: 0.7, asymScale: 1 };
    }
    if (roll < 0.5) {
      // LANDING BAYS: 1–2 big outward bulges — pads swell where you aim, the straits stay honest.
      const w = posWave(rng.range(0.06, 0.14));
      const nBays = rng.bool(0.6) ? 2 : 1;
      const bays: { c: number; a: number }[] = [];
      for (let b = 0; b < nBays; b++) {
        bays.push({ c: nBays === 1 ? rng.range(0.35, 0.65) : b === 0 ? rng.range(0.28, 0.44) : rng.range(0.58, 0.74), a: rng.range(0.25, 0.5) });
      }
      return {
        id: 'island-bays',
        at: (u) => 1 + w(u) + bays.reduce((s, b) => s + b.a * Math.exp(-((u - b.c) ** 2) / 0.02), 0),
        floorFrac: 0.7,
        asymScale: 1,
      };
    }
    if (roll < 0.7) {
      // FLARE: the plateau grows toward the green — a generous, receptive approach pad.
      const f = rng.range(0.2, 0.4);
      const w = posWave(rng.range(0.05, 0.12));
      return { id: 'island-flare', at: (u) => 1 + f * sstep(0.25, 0.85, u) + w(u), floorFrac: 0.7, asymScale: 1 };
    }
    if (roll < 0.88) {
      // BROAD TEE: a big launch plateau easing back to the baseline for the run home.
      const f = rng.range(0.2, 0.4);
      const w = posWave(rng.range(0.05, 0.12));
      return { id: 'island-broadtee', at: (u) => 1 + f * (1 - sstep(0.15, 0.75, u)) + w(u), floorFrac: 0.7, asymScale: 1 };
    }
    // BROAD: the whole island runs wider, gently undulating.
    const b = rng.range(1.12, 1.3);
    const w = posWave(rng.range(0.04, 0.1));
    return { id: 'island-broad', at: (u) => b * (1 + w(u)), floorFrac: 0.7, asymScale: 1 };
  }
  const roll = rng.float();
  if (par === 3) {
    if (roll < 0.4) return classic();
    if (roll < 0.6) return thin();
    if (roll < 0.8) return broad();
    return wander();
  }
  if (roll < 0.28) return classic();
  if (roll < 0.41) {
    // CHUTE: a narrow tree-lined drive that lets out into a generous body, with an approach bulge.
    const open = rng.range(0.2, 0.34);
    const cw = rng.range(0.5, 0.68);
    const body = rng.range(1.0, 1.16);
    const w = wave(rng.range(0.05, 0.11));
    const lz = rng.range(0.6, 0.74);
    const lzAmp = 0.1 + 0.1 * rng.float();
    return {
      id: 'chute',
      at: (u) => (cw + (body - cw) * sstep(open - 0.06, open + 0.12, u)) * (1 + w(u)) + lzAmp * Math.exp(-((u - lz) ** 2) / 0.02),
      floorFrac: 0.34,
      asymScale: 0.55,
    };
  }
  if (roll < 0.54) {
    // NECK: a full driving body that squeezes down for the approach into the green.
    const start = rng.range(0.6, 0.74);
    const nw = rng.range(0.45, 0.62);
    const body = rng.range(1.0, 1.14);
    const w = wave(rng.range(0.05, 0.11));
    const lz = rng.range(0.3, 0.42);
    const lzAmp = 0.1 + 0.1 * rng.float();
    return {
      id: 'neck',
      at: (u) => (body - (body - nw) * sstep(start, start + 0.16, u)) * (1 + w(u)) + lzAmp * Math.exp(-((u - lz) ** 2) / 0.02),
      floorFrac: 0.3,
      asymScale: 0.55,
    };
  }
  if (roll < 0.66) {
    // HOURGLASS: wide either side of a waist pinched at the driving zone — lay up or thread it.
    const waistAt = rng.range(0.42, 0.62);
    const ww = rng.range(0.42, 0.58);
    const body = rng.range(1.06, 1.24);
    const sig = rng.range(0.012, 0.022);
    const w = wave(rng.range(0.04, 0.1));
    return {
      id: 'hourglass',
      at: (u) => (body - (body - ww) * Math.exp(-((u - waistAt) ** 2) / sig)) * (1 + w(u)),
      floorFrac: 0.3,
      asymScale: 0.5,
    };
  }
  if (roll < 0.78) return wander();
  if (roll < 0.89) return thin();
  return broad();
}

/**
 * Build a hole's centreline as a varied, SMOOTH shape from a drawn template (GS-shapes-2, widening
 * GS-shapes) — the lever that makes layouts stop feeling identical. The bend severity scales by
 * `doglegBias × (0.35 + 0.65·wildness) × length`, capped at `0.4·length` so an offset corridor can't
 * self-cross; control points are smoothed (Catmull-Rom) so a dogleg/cape/S follows a real arc.
 * Shapes: straight drift, single dogleg, heroic CAPE (an early sharp corner — a tempting diagonal
 * carry, green tucked inside), severe HAIRPIN (a big corner near mid-hole), and an S/double bend.
 */
function buildCentreline(
  length: number,
  wildness: number,
  biome: Biome,
  rng: Rng,
  par: number,
  tpl: HoleTemplate,
  island = false,
  sharp = false,
  ship = false,
): Vec[] {
  const tee: Vec = [0, 0];
  // SHARP ship-corridor corners (GS-ship-feel): drop the Catmull-Rom sampling to 2 points/segment so the
  // corridor bends at ANGULAR corners (a spaceship hallway) instead of smooth arcs. The control points
  // (and thus the rng draws) are IDENTICAL — only how many smoothing samples they're resampled into
  // changes — so a non-sharp world is byte-for-byte unchanged, and 2 (not 1) keeps a slight ease so the
  // ribbon never folds at a corner. `sp(p)` = the per-segment sample count for a given shape.
  // The SHIP corridor (GS-ship-corridor) resamples at ONE point/segment — i.e. straight lines through
  // the raw control points, so its runs are DEAD STRAIGHT and its turns are HARD ANGULAR junctions (a
  // spaceship hallway with 90°-ish elbows), the sharpest read of `sharp`. Same control points/rng.
  const sp = (p: number): number => (ship ? 1 : sharp ? 2 : p);
  // Bend severity floor raised (GS-variety-2): the old `0.35 + 0.65·wildness` left calm doglegs
  // nearly straight — "every early hole is the same gentle curve". A proper dogleg bends properly
  // even on a calm stop; wildness still steepens it toward the self-cross cap. The cap is loosened a
  // touch (0.4 → 0.46·length) so a bend can be genuinely dramatic without the corridor self-crossing.
  const dogFac = 0.5 + 0.5 * wildness;
  // Lost-rough par 4/5 chains bend HARDER (GS-cetus-5) — the island-hop route swings between pads for
  // real drama. `island` is false for every normal hole, so their bend magnitude is byte-identical.
  // The SHIP corridor (GS-ship-corridor) does the OPPOSITE: it runs mostly STRAIGHT down the hull, so
  // it skips the 1.4× island swing — its variety is the odd HARD ANGULAR junction (crisp corners via
  // `sharp` sampling), not a sweeping bend, exactly like a real spaceship passageway.
  const baseMag = biome.doglegBias * dogFac * length * (island && !ship ? 1.4 : 1);
  const cap = 0.44 * length;
  const endDrift = (): Vec => [rng.range(-0.06, 0.06) * length, length];

  // Par-3 island: a straight carry to the target island (no corridor). Par 4/5 islands flow into the
  // shape switch below so the chain of pads doglegs/capes/S-bends like any other shaped hole.
  if (island && par === 3) return [tee, endDrift()];
  const side = tpl.side;
  const bendAt = (f: number, s: number, scale: number): Vec => [
    s * Math.min(cap, baseMag * scale * rng.range(0.5, 1.0)),
    length * f,
  ];

  switch (tpl.shape) {
    case 'straight': {
      if (par === 3) return [tee, endDrift()];
      // Gentle landing-zone drift — visually straight, a touch of movement.
      return smoothCurve([tee, bendAt(0.5, side, 0.28), endDrift()], sp(5));
    }
    case 'dogleg': {
      if (par === 3) {
        // A gentle angled (Redan-ish) par-3 — the green sits a little to one side.
        const mag = Math.min(0.16 * length, baseMag * rng.range(0.3, 0.6) + 0.06 * length);
        return smoothCurve([tee, [side * mag, length * 0.55], endDrift()], sp(4));
      }
      // Single dogleg, left or right; the green sits to the inside of the bend.
      return smoothCurve([tee, bendAt(rng.range(0.42, 0.58), side, 1.0), [side * 0.12 * length * rng.float(), length]], sp(5));
    }
    case 'cape': {
      // Heroic diagonal: a sharp EARLY corner (the bite-off temptation), green tucked to the inside.
      const corner = rng.range(0.34, 0.46);
      return smoothCurve([tee, bendAt(corner, side, 1.15), [side * 0.18 * length * rng.range(0.4, 1), length]], sp(5));
    }
    case 'hairpin': {
      // Severe single corner near mid-hole — a true shot-shaper's hole. Magnitude pushed toward the cap.
      const corner = rng.range(0.44, 0.56);
      const mag = Math.min(cap, baseMag * tpl.severity * rng.range(0.7, 1.0));
      return smoothCurve([tee, [side * mag, length * corner], [side * 0.2 * length * rng.range(0.3, 0.9), length]], sp(6));
    }
    case 'double': {
      // S-curve, or a same-way double on the wilder/doglegging worlds — the real shot-shaping test.
      const s2: number = rng.float() < biome.doglegBias * 0.5 ? side : -side;
      return smoothCurve([tee, bendAt(0.33, side, 0.85), bendAt(0.66, s2, 0.85), endDrift()], sp(5));
    }
  }
  return [tee, endDrift()];
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
  // A chosen journey route can make the next course wilder/gentler (GS-journey-fx). The boost is added
  // to the distance-derived wildness then clamped to [0.05, 1]; boost 0 keeps the rng draw + result
  // byte-for-byte (the lower clamp never bites the unboosted base, which is ≥ 0.1).
  const boost = opts.wildnessBoost ?? 0;
  const wildness =
    opts.wildness ?? Math.max(0.05, Math.min(1, 0.1 + distanceFromStart * 0.05 + rng.range(0, 0.15) + boost));

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
    meta: {
      name,
      distanceFromStart,
      wildness,
      ...(opts.themeId ? { themeId: opts.themeId } : {}),
      ...(opts.effect && opts.effect !== 'none' ? { effect: opts.effect } : {}),
    },
  };

  const errs = [
    ...validateCourse(course),
    ...validateFairness(course),
    ...validateCrossings(course),
    ...validateGreenApproach(course),
    ...validateIslandHops(course),
  ];
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
      if (hz.sanctioned) continue; // greenside ring — proved by validateGreenApproach (GS-variety-2)
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
      const what =
        hz.kind === 'frozenpond' ? 'frozen pond' : hz.kind === 'creek' ? 'creek' : hz.kind === 'barranca' ? 'ravine' : 'lava river';
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

/**
 * Greenside-ring fairness (GS-variety-2): a `sanctioned` greenside penalty ring is EXEMPT from
 * `validateFairness` (it deliberately hugs the green), so it must instead be proven not to wall the
 * green off. For every hole carrying sanctioned penalty hazards this asserts the green stays
 * playable: the flag and the green centre are penalty-free, and there is a penalty-free landing just
 * SHORT of the green on the approach line (room to fly/run a shot onto the surface). By construction
 * the ring is kept off the approach window + lane, so this holds — but it's proven on every course.
 */
export function validateGreenApproach(course: Course): string[] {
  const errs: string[] = [];
  course.holes.forEach((h, i) => {
    if (!h.hazards.some((hz) => hz.sanctioned && lieInfo(hz.kind).penalty)) return;
    const target = h.pin ?? h.green;
    if (lieInfo(lieAt(h, target)).penalty) errs.push(`hole[${i}]: greenside ring covers the flag`);
    if (lieInfo(lieAt(h, h.green)).penalty) errs.push(`hole[${i}]: greenside ring covers the green centre`);
    // A landing just short of the green on the incoming line must be penalty-free (a fair approach).
    const appFrom = centrePoint(h.centreline, 0.84);
    let dx = h.green[0] - appFrom[0];
    let dy = h.green[1] - appFrom[1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    let greenR = 0;
    const gf = h.features.find((f) => f.kind === 'green');
    if (gf) for (const p of gf.poly) greenR = Math.max(greenR, dist(p, h.green));
    const shortPt: Vec = [h.green[0] - dx * (greenR + 12), h.green[1] - dy * (greenR + 12)];
    if (lieInfo(lieAt(h, shortPt)).penalty) errs.push(`hole[${i}]: greenside ring blocks the approach`);
  });
  return errs;
}

/**
 * Island-hop completability (GS-cetus-gaps): on an ARMED lost-rough hole (void/cetus deep, par 4/5)
 * the corridor is broken into pads separated by genuine void carries — the void is the implicit
 * rough lie, not a hazard poly, so `validateFairness`/`validateCrossings` are silent on it. This
 * validator proves the chain can actually be PLAYED with the baseline common bag: every EFFECTIVE
 * carry along the centreline stays inside a driver-carryable bar. A non-penalty sliver too short to
 * land on (a ribbon nose clipping a bent centreline inside a gap) is NO relief, so the bar holds
 * ACROSS it — which is exactly how the two historical failure modes read: overlapping gap draws,
 * and a sliver pad silently dropped by `brokenCorridor`'s ≥3-point rule (either fused two gaps into
 * one uncarryable mega-void). Island par-3s are exempt — their single carry is design-sized
 * (GS-cetus-2). Bars scale by the hole's carry mod (gravity), like every shot.
 */
export function validateIslandHops(course: Course): string[] {
  const errs: string[] = [];
  const SAMPLES = 400;
  course.holes.forEach((h, i) => {
    if (h.par < 4) return;
    const mods = h.biomeMods ?? [];
    if (!mods.some((m) => m.kind === 'roughLie')) return;
    let carry = 1;
    for (const m of mods) if (m.kind === 'carry' && typeof m.value === 'number') carry *= m.value;
    const total = pathLength(h.centreline) || 1;
    // Contiguous same-class runs along the centreline: penalty = a void carry, else = a pad.
    const runs: { from: number; to: number; penalty: boolean }[] = [];
    for (let s = 0; s <= SAMPLES; s++) {
      const t = s / SAMPLES;
      const pen = !!lieInfo(lieAt(h, centrePoint(h.centreline, t))).penalty;
      const last = runs[runs.length - 1];
      if (last && last.penalty === pen) last.to = t;
      else runs.push({ from: t, to: t, penalty: pen });
    }
    // Effective carries: penalty runs, merged ACROSS any non-penalty sliver too short to land on.
    const carries: { from: number; to: number }[] = [];
    let cur: { from: number; to: number } | undefined;
    runs.forEach((r, k) => {
      const yd = (r.to - r.from) * total;
      if (r.penalty) {
        if (cur) cur.to = r.to;
        else cur = { from: r.from, to: r.to };
      } else if (cur && k < runs.length - 1 && yd < ISLAND_PAD_VALIDATE_YD * carry) {
        cur.to = r.to; // a nose-clip sliver mid-void — no landable relief, the carry continues
      } else {
        if (cur) carries.push(cur);
        cur = undefined;
      }
    });
    if (cur) carries.push(cur);
    for (const g of carries) {
      const yd = (g.to - g.from) * total;
      if (yd > ISLAND_GAP_VALIDATE_YD * carry) {
        errs.push(
          `hole[${i}]: island-hop void carry of ${Math.round(yd)}yd exceeds the completable bar (${Math.round(ISLAND_GAP_VALIDATE_YD * carry)}yd)`,
        );
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
