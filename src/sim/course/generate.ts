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
export const GENERATOR_VERSION = 9;

/**
 * Signature-mechanic gates (GS-19), the "fair early, brutal late" dial. A world's lost-rough (void)
 * and lava-river (ember) only ARM past a wildness threshold; below it the stop plays fair (normal
 * rough, no river), and the severity (island width / river width) ramps with wildness above it.
 */
const LOST_ROUGH_MIN_WILDNESS = 0.55; // below: void plays as ordinary (fair) rough
const LAVA_RIVER_MIN_WILDNESS = 0.26; // below: a calm ember stop has no river
const FROZEN_POND_MIN_WILDNESS = 0.26; // below: a calm frost stop has no pond crossing
const WATER_CREEK_MIN_WILDNESS = 0.26; // below: a calm parkland stop has no creek crossing

/** Penalty kinds that are SANCTIONED forced carries on the play corridor (GS-19/GS-mechanics): they
 *  may cross the centreline (exempt from `validateFairness`) BUT `validateCrossings` proves each one
 *  carryable. A river of lava (ember), a frozen-pond channel (frost), and a water creek (parkland)
 *  are all crossings — the carry-aware AI flies any of them generically (it keys off `penalty`). */
const CROSSING_KINDS = new Set(['lavariver', 'frozenpond', 'creek', 'barranca']);
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
  t: number,
  fairwayHalfWidth: number,
  thickness: number,
  rng: Rng,
): { poly: Vec[]; mouth: Vec } {
  const c = centrePoint(centreline, t);
  const a = centrePoint(centreline, Math.max(0, t - 0.02));
  const b = centrePoint(centreline, Math.min(1, t + 0.02));
  let tx = b[0] - a[0];
  let ty = b[1] - a[1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl; // unit play direction
  // Diagonal crossing axis: the lateral (perp) rotated by a random angle, so rivers slant differently.
  const theta = rng.range(-0.55, 0.55); // ±~31° off perpendicular
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ax = -ty * ct - tx * st; // axis = perp (−ty, tx) rotated by theta
  const ay = tx * ct - ty * st;
  // Meander runs ALONG the play direction (tx, ty), so it shifts a river point forward/back along the
  // hole rather than swinging it sideways. Held at ZERO across the whole corridor zone so the carry is
  // a clean straight diagonal, then growing the further it runs out — a wandering river in the rough.
  const mx = tx;
  const my = ty;
  const reachNeg = fairwayHalfWidth + rng.range(28, 60);
  const reachPos = fairwayHalfWidth + rng.range(52, 100); // the longer arm pools into the lake
  const f1 = rng.range(1.2, 2.3);
  const p1 = rng.range(0, Math.PI * 2);
  const f2 = rng.range(2.6, 4.3);
  const p2 = rng.range(0, Math.PI * 2);
  const ampFrac = rng.range(0.22, 0.4);
  const calm = fairwayHalfWidth * 0.8; // no meander inside this radius of the crossing
  const half = thickness / 2;
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
  const widthAt = (s: number): number => {
    const grow = Math.min(1, Math.max(0, (Math.abs(s) - calm) / (fairwayHalfWidth * 1.1 + 1)));
    const wob = grow * (0.26 * Math.sin(wobPh + s * 0.05 * wobLobes) - 0.1);
    return half * (1 + wob);
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
  return { poly: ribbon(line, hw, hw, true, true), mouth };
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

  const tee: Vec = [0, 0];

  // Lost rough (void signature): off the fairway is a PENALTY lie on the wilder/deeper stops.
  // Computed up-front because it ALSO keeps the hole straight: a bending lost-ball ISLAND is a ball
  // shredder (a dogleg pushes the AI's line off the island into the void), so void island holes stay
  // an honest straight target — their challenge is the abyss off the fairway, not the shape.
  const lostRough = biome.lostRough && wildness >= LOST_ROUGH_MIN_WILDNESS ? biome.lostRough : undefined;

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
  const centreline: Vec[] = buildCentreline(length, wildness, biome, rng, par, tpl, !!lostRough);
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
  // Varied GREEN shape (GS-greens), per-biome character. baseR scaled by the biome's greenSize AND by
  // hole length (GS-hazards-2): a short pitch gets a SMALL, demanding target while a long par-5 gets a
  // bigger, more receptive green — par-3 small / par-5 large, the real-design rule. Pure value scale
  // off the already-drawn `tpl.lenMult`, so no new rng draw (the downstream stream is unperturbed).
  const greenLenFactor = Math.max(0.74, Math.min(1.26, 0.5 + tpl.lenMult * 0.5));
  const greenR = rng.range(11, 16) * (biome.greenSize ?? 1) * greenLenFactor;
  const greenPolygon = greenPoly(green, greenR, biome.greenAspect ?? 1.8, biome.greenIrregular ?? 1, rng);
  const greenF: Feature = { kind: 'green', poly: greenPolygon };

  // Flag inside the (arbitrary-shape) green via ray-march from the centre (GS-6/GS-greens): always
  // genuinely inside (never on the lip) yet off-centre, for ANY shape. Drawn from a SIDE rng keyed
  // by hole index so the flag is deterministic without perturbing the main terrain stream.
  const pinRng = new Rng(`${rng.seed}:pin:${holeIndex}`);
  const pin: Vec = pinInGreen(green, greenPolygon, pinRng);

  // Green SLOPE (GS-greens-3): a downhill fall-line direction + a magnitude up to the biome's
  // greenSlopeMax. Drawn from a SIDE rng (like the pin) so adding it leaves the main terrain stream
  // — and thus every existing course's layout — byte-for-byte unchanged.
  const slopeRng = new Rng(`${rng.seed}:slope:${holeIndex}`);
  const slopeAng = slopeRng.range(0, Math.PI * 2);
  const slopeMag = (biome.greenSlopeMax ?? 0.5) * slopeRng.range(0.4, 1);
  const greenSlope: Vec = [Math.cos(slopeAng) * slopeMag, Math.sin(slopeAng) * slopeMag];

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

  // Blocking GROVES on a dogleg's cut-the-corner line (GS-variety): tall stands of trees planted where
  // the STRAIGHT tee→green line leaves the fairway corridor — i.e. the corner you'd otherwise just fire
  // over to reach the pin. With them there, you can't bomb it straight at the green; you have to play
  // AROUND, along the fairway (the lever the future fairway-follow trick-shot perks/talents need).
  // Trees are NON-PENALTY (a punch-out, never a lost card) and sit OUTSIDE the corridor, so
  // validateFairness ignores them and the fairway route stays clean — only a shot trying to cut the
  // corner is knocked down. Big blobs ⇒ TALL canopies that block lofted attempts too. Tree worlds,
  // par 4/5, not on a void island (which stays a straight honest target).
  // Wildness-gated (GS-19 "fair early, brutal late"): the calm opening stops stay forgiving — the
  // corner blockers arm only once the journey is a touch wilder, ramping up deeper in.
  if ((biome.treeDensity ?? 0) > 0 && par >= 4 && !lostRough && wildness >= 0.3) {
    const chordLen = dist(tee, green) || 1;
    const cdx = (green[0] - tee[0]) / chordLen;
    const cdy = (green[1] - tee[1]) / chordLen;
    // Scale the stand frequency by the world's tree density so a sparse world (ember snags) gets the
    // odd blocker while parkland gets a proper wall — and so the extra knockdowns never tip the
    // already-hard tree+crossing worlds over the no-death-spiral bar. Capped per hole; canopies are
    // modest so a LOFTED approach can still carry the corner (it's the flat bomb-it-straight line
    // that's blocked) — keeping it fair for the auto reach-AI while rewarding the played fairway route.
    const standChance = Math.min(0.42, 0.1 + (biome.treeDensity ?? 0) * 0.14);
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
      hazards.push({ kind: 'trees', poly: blobPoly(cp, rng.range(5, 8), 9, 0.3, rng) });
      // One companion to read as a stand — never letting it drift onto the corridor.
      if (rng.float() < 0.5) {
        const a = rng.range(0, Math.PI * 2);
        const dd = rng.range(7, 13);
        const c2: Vec = [cp[0] + Math.cos(a) * dd, cp[1] + Math.sin(a) * dd];
        if (polylineDist(c2, centreline) >= fairwayHalfWidth + 7) {
          hazards.push({ kind: 'trees', poly: blobPoly(c2, rng.range(3, 6), 8, 0.3, rng) });
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
    const t = rng.range(0.34, 0.6);
    const thickness = Math.min(34, length * 0.085, rng.range(8, 13) + wildness * rng.range(6, 16));
    const river = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'lavariver', poly: river.poly });
    // A molten LAKE the river pools into at its mouth — same liquid family, so they merge seamlessly.
    const lakeR = rng.range(13, 20) + wildness * 8;
    if (clearsPlayCorridor(river.mouth, lakeR, centreline, tee, green, fairwayHalfWidth)) {
      hazards.push({ kind: 'lava', poly: blobPoly(river.mouth, lakeR, 15, 0.3, rng) });
    }
  }

  // Frozen-pond crossing (frost signature, GS-mechanics): a meltwater channel crosses the corridor
  // as a FORCED CARRY — same sanctioned-crossing machinery as the lava river (exempt from
  // `validateFairness`, proven carryable by `validateCrossings`). Longer holes only (a creek across a
  // par-3 leaves no approach); a touch narrower than lava since the AI must clear cold water.
  if (biome.frozenPond && par >= 4 && wildness >= FROZEN_POND_MIN_WILDNESS) {
    const t = rng.range(0.34, 0.6);
    const thickness = Math.min(30, length * 0.075, rng.range(7, 12) + wildness * rng.range(5, 14));
    const river = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'frozenpond', poly: river.poly });
    // A frozen LAKE the meltwater channel pools into (water family → merges into the channel).
    const lakeR = rng.range(13, 20) + wildness * 8;
    if (clearsPlayCorridor(river.mouth, lakeR, centreline, tee, green, fairwayHalfWidth)) {
      hazards.push({ kind: 'water', poly: blobPoly(river.mouth, lakeR, 15, 0.3, rng) });
    }
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
    const river = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'creek', poly: river.poly });
    // A LAKE/pond the creek feeds into at its mouth (water family → merges into the creek, so the
    // stream visibly runs INTO the lake instead of a separate body floating beside it).
    const lakeR = rng.range(14, 22) + wildness * 10;
    if (clearsPlayCorridor(river.mouth, lakeR, centreline, tee, green, fairwayHalfWidth)) {
      hazards.push({ kind: 'water', poly: blobPoly(river.mouth, lakeR, 16, 0.3, rng) });
    }
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
    const t = rng.range(0.34, 0.6);
    const thickness = Math.min(28, length * 0.07, rng.range(7, 11) + wildness * rng.range(5, 14));
    const ravine = riverChannel(centreline, t, fairwayHalfWidth, thickness, rng);
    hazards.push({ kind: 'barranca', poly: ravine.poly });
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

  return { par, tee, green, pin, centreline, features, hazards, wind, biomeMods, shapeId: tpl.id, greenSlope };
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
  if (island) return { id: 'island', shape: 'straight', side, lenMult: rng.range(0.86, 1.12), severity: 1 };

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
    const pDriv = 0.12 + 0.12 * (1 - wildness); // drivable shows up more on the calm early stops
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

  // Shape mix, biome- + wildness-biased. Cape (heroic diagonal carry) and hairpin (severe corner)
  // only arm once the journey turns a touch wild; calm stops stay gentle straights/doglegs.
  const hairP = wildness >= 0.5 ? 0.08 + biome.doglegBias * 0.2 : 0;
  const capeP = wildness >= 0.3 ? 0.12 + biome.doglegBias * 0.25 : 0;
  const sP = Math.min(0.4, 0.12 + biome.doglegBias * 0.5 + wildness * 0.25); // S-curve / double-dogleg
  const straightP = Math.max(0.12, 0.36 - biome.doglegBias * 0.7 - wildness * 0.16);
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
): Vec[] {
  const tee: Vec = [0, 0];
  const dogFac = 0.35 + 0.65 * wildness;
  const baseMag = biome.doglegBias * dogFac * length;
  const cap = 0.4 * length;
  const endDrift = (): Vec => [rng.range(-0.06, 0.06) * length, length];

  if (island) return [tee, endDrift()];
  const side = tpl.side;
  const bendAt = (f: number, s: number, scale: number): Vec => [
    s * Math.min(cap, baseMag * scale * rng.range(0.5, 1.0)),
    length * f,
  ];

  switch (tpl.shape) {
    case 'straight': {
      if (par === 3) return [tee, endDrift()];
      // Gentle landing-zone drift — visually straight, a touch of movement.
      return smoothCurve([tee, bendAt(0.5, side, 0.28), endDrift()], 5);
    }
    case 'dogleg': {
      if (par === 3) {
        // A gentle angled (Redan-ish) par-3 — the green sits a little to one side.
        const mag = Math.min(0.16 * length, baseMag * rng.range(0.3, 0.6) + 0.06 * length);
        return smoothCurve([tee, [side * mag, length * 0.55], endDrift()], 4);
      }
      // Single dogleg, left or right; the green sits to the inside of the bend.
      return smoothCurve([tee, bendAt(rng.range(0.42, 0.58), side, 1.0), [side * 0.12 * length * rng.float(), length]], 5);
    }
    case 'cape': {
      // Heroic diagonal: a sharp EARLY corner (the bite-off temptation), green tucked to the inside.
      const corner = rng.range(0.34, 0.46);
      return smoothCurve([tee, bendAt(corner, side, 1.15), [side * 0.18 * length * rng.range(0.4, 1), length]], 5);
    }
    case 'hairpin': {
      // Severe single corner near mid-hole — a true shot-shaper's hole. Magnitude pushed toward the cap.
      const corner = rng.range(0.44, 0.56);
      const mag = Math.min(cap, baseMag * tpl.severity * rng.range(0.7, 1.0));
      return smoothCurve([tee, [side * mag, length * corner], [side * 0.2 * length * rng.range(0.3, 0.9), length]], 6);
    }
    case 'double': {
      // S-curve, or a same-way double on the wilder/doglegging worlds — the real shot-shaping test.
      const s2: number = rng.float() < biome.doglegBias * 0.5 ? side : -side;
      return smoothCurve([tee, bendAt(0.33, side, 0.85), bendAt(0.66, s2, 0.85), endDrift()], 5);
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
