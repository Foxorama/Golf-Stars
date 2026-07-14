/**
 * Hazard-family painters (GS-style-split): the grouped sand + liquid families (GS-hazard-blend,
 * carved through the shared inset-emboss light), exotic scatter surfaces, fescue, the per-world
 * deep rough and the dry ravine. Each painter's rng/stream contract is documented on it.
 */

import type { Vec } from '../../sim/course/contract';
import { dist } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import { fillFor, mixHex, turfShade, SAND, WATER, LAVA } from '../palette';
import {
  type Prim,
  type ArtFeel,
  bboxOf,
  centroidOf,
  scalePoly,
  offsetPoly,
  longAxis,
  extentAlong,
  shiftPoly,
  hexAlpha,
  posHash,
  LIGHT_UL,
} from './shared';

/**
 * Draw a whole FAMILY of sand bodies (every bunker / waste break / crater on a hole) in shared
 * layered passes — the same GS-blend trick the liquids use — so overlapping sand bodies MERGE into
 * one excavated surface instead of a pile of stickers each ringed with its own ink outline (the
 * "bunkers and sand don't merge properly" bug). Pass order across the WHOLE family:
 *   1. lip-shadow rims (outset, darker) UNDER every body — so an overlap shows no internal rim
 *   2. sand bodies — overlapping bodies merge into one continuous surface
 *   3. per-body depression crescent + rake texture, clipped (NO per-body ink → no seam through overlaps)
 * The shadow outset is the edge against the land, exactly like the liquids' shore.
 */
/**
 * Emboss a filled feature's interior as an INSET bowl (clipped to the body): drop the whole rim to
 * a shadow tone, then re-lay the base shifted toward the light so the NEAR (up-light) rim keeps a
 * shadow crescent while the far side stays bright; an optional lit floor pools sun on the down-light
 * floor. This is the raised-shelf recipe INVERTED — a depression, not a plateau — and is what makes
 * a bunker read as dug into the land and a lake as water sunk below the bank. Fixed prim count,
 * zero rng; sized in px off the projector `scale` and clamped to the body so thin creeks don't
 * collapse. The base re-lay is a solid so any interior detail (depth rings, rake) drawn AFTER still
 * paints over the centre.
 */
function embossChildren(
  poly: Vec[],
  scale: number,
  tone: { wall: string; base: string; floor?: string },
): Prim[] {
  const b = bboxOf(poly);
  const half = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.5;
  // GS-inset-2: a THIN near-rim shadow — just enough to hint at a dug-in lip, never a big dark blob.
  // The exposed up-light band is ~2·w wide (inward offset + the away-from-light shift). `w` is capped
  // hard by the body radius (`half`) so it stays a slim rim at the zoomed-in play scale, where a
  // scale-proportional band ballooned into a distinct shadow across a third of the feature.
  const w = Math.max(1, Math.min(scale * 0.6, half * 0.14));
  const sx = -LIGHT_UL[0]; // down-right = away from the light
  const sy = -LIGHT_UL[1];
  const children: Prim[] = [
    { t: 'poly', pts: poly, fill: tone.wall }, // whole interior drops to the shadowed-wall tone
    { t: 'poly', pts: shiftPoly(offsetPoly(poly, w), sx * w, sy * w), fill: tone.base }, // base shifted away from light → dark crescent on the up-light rim
  ];
  if (tone.floor) {
    children.push({ t: 'poly', pts: shiftPoly(offsetPoly(poly, w * 2.4), sx * w * 1.8, sy * w * 1.8), fill: tone.floor });
  }
  return children;
}

/**
 * A bunker's excavated-bowl palette (GS-rusted-bunkers). Every world plays SAND as ordinary sand
 * (`SAND`); the Scrap Belt (metal) instead digs RUST pits — flaky iron-oxide, no pale beach tan — so
 * the hazard fits the corroded machine graveyard the way the toxic pools fit the mire. Render-only:
 * the sim still plays these as `bunker`/`waste`/`pot`/`sand` lies, so escape difficulty is untouched.
 */
interface SandPalette {
  base: string; // lit body fill
  rim: string; // sunlit far-floor glow of the bowl
  shadow: string; // lip-shadow rim against the land
  rake: string; // concentric rake-arc strokes
  wall: string; // inset near-rim shadow (dug-in lip)
}
const SAND_LOOK: SandPalette = { base: SAND.base, rim: SAND.rim, shadow: SAND.shadow, rake: 'rgba(255,248,224,0.14)', wall: SAND.wall };
/** RUSTED PIT — the Scrap Belt's bunker: a flaky orange-rust body (brighter/oranger than the dark
 *  iron rough so it still reads as a hazard, not just more rough), a rust-lit floor, dark corroded
 *  rake grooves (warm-dark, never the pale sand rake), and a deep iron lip-shadow. */
const RUST_SAND: SandPalette = {
  base: '#a5623a', // flaky orange rust pit
  rim: '#d38a52', // sunlit lifted rust flakes
  shadow: '#6e4022', // deep iron lip against the rough
  rake: 'rgba(60,34,18,0.30)', // corroded rake grooves (dark, not white)
  wall: 'rgba(28,14,6,0.34)', // dug-in rust lip
};
/** The bunker palette for a world (GS-rusted-bunkers): the Scrap Belt (metal) digs RUST pits, every
 *  other world keeps ordinary sand. Zero rng — a pure colour swap, so every non-metal world is
 *  byte-identical and metal's sand draw count is unchanged. */
export function sandLookFor(arch: BiomeArchetype): SandPalette {
  return arch === 'metal' ? RUST_SAND : SAND_LOOK;
}

export function styleSandFamily(polys: Vec[][], art: ArtFeel, scale: number, land: string, arch: BiomeArchetype): Prim[] {
  if (polys.length === 0) return [];
  const sp = sandLookFor(arch);
  const out: Prim[] = [];
  // GS-hazard-blend: a soft grassy MARGIN just outside the bunker — the land tone thinning toward the
  // pit body — so the bunker eases into the surrounding turf the way the fairway collar does, instead
  // of a hard blob dropped on the grass (the "no blending at all" tell). Blended toward the pit (never
  // darker than the turf, so it reads as thinning grass, not a floating shadow — the GS-inset-2 lesson).
  // Grouped UNDER every body, so a merged bunker complex shares one continuous margin with no seam.
  const margin = mixHex(land, sp.base, 0.42);
  for (const poly of polys) out.push({ t: 'poly', pts: offsetPoly(poly, -5), fill: margin });
  // GS-inset-2: no drop shadow cast onto the surrounding turf — a bunker is DUG INTO the ground, it
  // doesn't float above it. The excavated read comes entirely from the inset emboss below (near
  // up-light rim in shadow, far floor sunlit), so the pit sits flush-then-down, not proud.
  for (const poly of polys) out.push({ t: 'poly', pts: offsetPoly(poly, -2.6), fill: sp.shadow }); // 1: pit lip against the grass
  for (const poly of polys) out.push({ t: 'poly', pts: poly, fill: sp.base }); // 2
  for (const poly of polys) {
    const c = centroidOf(poly);
    const b = bboxOf(poly);
    const half = Math.max(3, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.5);
    const detail: Prim[] = [];
    // GS-hazard-blend-2: a smoothly SHADED bowl instead of harsh straight rake lines across the pit
    // (the "awkward white lines" tell). Inset rim shadow (dug in) + a soft sunlit swell on the
    // DOWN-light floor (opposite the shadowed rim), so the bunker reads as a gently scooped bowl that
    // blends, not a flat patch scored with bars.
    detail.push(...embossChildren(poly, scale, { wall: sp.wall, base: sp.base }));
    // Soft sunlit floor, pooled toward the down-light side (away from the up-light rim shadow) — low
    // alpha so it's a gentle swell, not a distinct pool (the GS-inset-2 lesson).
    const litC: Vec = [c[0] - LIGHT_UL[0] * half * 0.32, c[1] - LIGHT_UL[1] * half * 0.32];
    detail.push({ t: 'glow', c: litC, r: half * 1.4, col: hexAlpha(sp.rim, 0.4) });
    // Subtle rake arcs that FOLLOW the rim (concentric, thin, low-alpha) — reads as a raked bowl that
    // blends into the body, unlike the old full-width near-white bars. Warm-dark grooves on rust.
    if (art.stripes) {
      for (let i = 1; i <= 3; i++) {
        detail.push({ t: 'poly', pts: offsetPoly(poly, half * 0.24 * i), fill: 'none', stroke: sp.rake, sw: Math.max(0.6, scale * 0.32) });
      }
    }
    out.push({ t: 'clip', clip: poly, children: detail });
  }
  return out;
}
// ---------------------------------------------------------------------------
// Organic edge roughening (GS-hazard-edges)
// ---------------------------------------------------------------------------
/**
 * The band-aid problem: a river / lava flow / crevice that CROSSES the fairway (or runs long and
 * thin) was drawn straight off the sim's crossing band, whose two long sides are near-parallel and
 * near-straight — so it read as a uniform-width sticky plaster laid across the hole, not a natural
 * hazard whose banks bulge, pinch and break up.
 *
 * This roughens the DRAWN outline of such a body so its sides read like a real bank: WATER meanders
 * in smooth curves, LAVA breaks up into a jagged crust, a CREVICE cracks in sharp teeth. Crucially
 * it is RENDER-ONLY and does NOT touch the sim geometry:
 *   • It runs in COURSE space keyed off `posHash` — ZERO rng draws, so no seeded scene stream is
 *     perturbed and the result is identical across a moving camera (course-space in → deterministic
 *     out → projected fresh each frame, exactly like `biomeRelief`).
 *   • The displacement is MEAN-ZERO about the true edge (banks bulge OUT and pinch IN in equal
 *     measure), and its amplitude is capped to a few yards — the same order as the shore/margin the
 *     liquid family already paints outside the sim poly — so the drawn edge still tracks the sim's
 *     penalty boundary (the graphic stays the physics). Fairness/carry reads run off the SIM poly,
 *     never this decorated outline.
 * Amplitude is also clamped to a fraction of the body's narrow dimension so a thin creek can never
 * pinch shut, and tiny bodies are left alone (wobble would swamp them).
 */
export type RoughStyle = 'water' | 'lava' | 'crevice';

interface RoughSpec {
  spacing: number; // course-yd between inserted edge samples (roughening resolution)
  wavelength: number; // course-yd of the smooth base meander
  amp: number; // peak bank displacement, yd (capped by the body's narrow dimension)
  jag: number; // 0 = pure smooth curve, 1 = pure sharp teeth
}
const ROUGH_SPECS: Record<RoughStyle, RoughSpec> = {
  // A river's banks meander in long smooth curves — no teeth.
  water: { spacing: 8, wavelength: 22, amp: 3.4, jag: 0.15 },
  // A lava flow's crust breaks up: a curving flow overlaid with a jagged, cracked edge.
  lava: { spacing: 6.5, wavelength: 15, amp: 3.1, jag: 0.5 },
  // A crevice / ravine cracks hardest — sharp, high-contrast teeth along both walls.
  crevice: { spacing: 5.5, wavelength: 10, amp: 4.2, jag: 0.66 },
};

/** Smooth 2-D value noise in [-1, 1] (bilinear-interpolated `posHash` on a smoothstep lattice) —
 *  gives a body's bank a continuous, curving displacement instead of per-vertex hash confetti. */
function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = posHash(xi, yi);
  const b = posHash(xi + 1, yi);
  const c = posHash(xi, yi + 1);
  const d = posHash(xi + 1, yi + 1);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return (ab + (cd - ab) * v) * 2 - 1;
}

/** Signed area (local copy — `shared.ts` keeps its own private) → winding, so a bank knows which way
 *  is OUTWARD. */
function roughSignedArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]![0] * pts[i]![1] - pts[i]![0] * pts[j]![1];
  }
  return a / 2;
}

/** Insert samples along every edge at ~`spacing` course-yd so the roughening has resolution to bend
 *  a long straight bank; original vertices are kept. */
function densify(poly: Vec[], spacing: number): Vec[] {
  const n = poly.length;
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const c = poly[(i + 1) % n]!;
    out.push(a);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const segs = Math.min(28, Math.max(1, Math.round(len / spacing)));
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Unit OUTWARD normal at each vertex (edge-normal bisector, oriented by winding). */
function outwardNormals(pts: Vec[]): Vec[] {
  const n = pts.length;
  const sign = roughSignedArea(pts) >= 0 ? 1 : -1;
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    let e1x = cur[0] - prev[0];
    let e1y = cur[1] - prev[1];
    let e2x = next[0] - cur[0];
    let e2y = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    let bx = -e1y - e2y; // sum of the two edges' LEFT normals
    let by = e1x + e2x;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    // Interior points along `+b·sign` (see offsetPoly); outward is its negation.
    out.push([-bx * sign, -by * sign]);
  }
  return out;
}

/** Roughen a hazard body's drawn outline (course space, deterministic, zero rng) — see the block
 *  comment above. Returns the body unchanged when it's too small to roughen safely. */
export function roughenHazardEdge(poly: Vec[], style: RoughStyle): Vec[] {
  if (poly.length < 3) return poly;
  const b = bboxOf(poly);
  const minDim = Math.min(b.maxX - b.minX, b.maxY - b.minY);
  if (minDim < 5) return poly; // too thin — wobble would swamp it / pinch it shut
  const spec = ROUGH_SPECS[style];
  const cap = Math.min(spec.amp, minDim * 0.4); // never displace a bank more than 40% of the narrow span
  const dense = densify(poly, spec.spacing);
  if (dense.length < 6) return poly;
  const norms = outwardNormals(dense);
  return dense.map((p, i) => {
    const base = smoothNoise(p[0] / spec.wavelength, p[1] / spec.wavelength); // smooth meander
    const teeth = posHash(p[0] * 0.9 + 11.3, p[1] * 0.9 + 4.7, i) * 2 - 1; // sharp per-sample cracks
    let d = base * (1 - spec.jag) + teeth * spec.jag;
    if (d > 1) d = 1;
    else if (d < -1) d = -1;
    const nrm = norms[i]!;
    return [p[0] + nrm[0] * d * cap, p[1] + nrm[1] * d * cap] as Vec;
  });
}

/** Per-body cache of the roughened course-space outline (keyed on the input poly, which is stable
 *  per hole) so the per-frame follow-cam rebuild pays the roughening once, not 60×/sec. */
const roughCache = new WeakMap<Vec[], Vec[]>();
export function roughenHazardCached(poly: Vec[], style: RoughStyle): Vec[] {
  const hit = roughCache.get(poly);
  if (hit) return hit;
  const out = roughenHazardEdge(poly, style);
  roughCache.set(poly, out);
  return out;
}

/**
 * A liquid's depth/detail palette. Water and lava share the same banded-depth machinery — only the
 * tones differ — so a lake and a crossing river of the same liquid are drawn identically and read
 * as one substance.
 */
interface LiquidPalette {
  shore: string; // outset rim (water shoreline / lava crust)
  base: string; // body fill
  mid: string; // first depth ring
  deep: string; // core ring
  flow: string; // lengthwise flow streaks (current / molten flow)
  glint: string; // sparkle on a still lake
  bank: string; // GS-inset: shadow the raised bank casts on the up-light shore
  /** Emissive halo (rgba) bleeding OUTWARD past the shore — a luminous liquid glows onto the land
   *  (the Toxic Mire's acid pools). Absent → an ordinary, non-glowing liquid (water/lava). */
  glow?: string;
}
export const WATER_LIQ: LiquidPalette = {
  shore: WATER.shallow,
  base: WATER.base,
  mid: WATER.deep,
  deep: WATER.deepest,
  flow: 'rgba(255,255,255,0.30)',
  glint: WATER.glint,
  bank: WATER.bank,
};
export const LAVA_LIQ: LiquidPalette = {
  shore: LAVA.crust,
  base: LAVA.body,
  mid: LAVA.hot,
  deep: LAVA.core,
  flow: LAVA.crack,
  glint: LAVA.core,
  bank: LAVA.bank,
};
/**
 * TOXIC POOL (GS-toxic-pools) — the Toxic Mire's signature hazard. Its penalty water reskins as a
 * vibrant, GLOWING acid pool in a hyper-acidic neon green→teal ramp: a caustic acid-lime shore, a
 * neon-green body deepening to a still-luminous teal core (never a muddy dark centre, so it reads as
 * chemical, not swamp water), bright acid current streaks + caustic glints, and an emissive neon
 * HALO that bleeds onto the surrounding bog. Render-only — the sim still plays this as ordinary
 * `water` penalty, so fairness/carry are untouched; it consumes the exact same rng draws as WATER_LIQ
 * (the halo is a fixed, zero-rng prim), so every non-swamp world stays byte-identical.
 */
export const TOXIC_LIQ: LiquidPalette = {
  shore: '#c6f542', // caustic acid-lime rim
  base: '#26e06e', // neon toxic green body
  mid: '#12c39a', // green→teal transition
  deep: '#0aa7a0', // luminous deep teal core (stays bright — it glows, not muddies)
  flow: 'rgba(210,255,150,0.42)', // bright acid current streaks
  glint: 'rgba(225,255,180,0.85)', // caustic surface glints
  bank: 'rgba(6,26,14,0.34)', // dark toxic shadow under the up-light bank
  glow: 'rgba(96,255,150,0.30)', // emissive neon halo bleeding onto the mire
};

export const WATER_KINDS = new Set(['water', 'frozenpond', 'creek']);
export const LAVA_KINDS = new Set(['lava', 'lavariver']);

/** The water-liquid palette for a world (GS-toxic-pools): the Toxic Mire (swamp) draws GLOWING neon
 *  acid pools; every other world keeps the ordinary blue water. Lava is per-kind (`LAVA_LIQ`), never
 *  per-world, so it isn't routed through here. */
export function waterLiqFor(arch: BiomeArchetype): LiquidPalette {
  return arch === 'swamp' ? TOXIC_LIQ : WATER_LIQ;
}

/**
 * Draw a whole FAMILY of same-liquid penalty bodies (all the water, or all the lava on a hole) in
 * shared layered passes, so a lake and a river that touch read as ONE connected body instead of two
 * stickers with a seam between them. Pass order across the WHOLE family:
 *   1. shores/crusts (outset, contrasting) — UNDER every body
 *   2. base bodies — overlapping bodies merge into one continuous surface
 *   3. depth rings + flow/glints, each clipped to its own body
 * Because every shore sits under every body, an overlap shows no shoreline between the two — only
 * the outer edge against the land keeps its shore. Depth rings use `offsetPoly` (a true inward
 * offset), so a thin RIVER band gets channel-following rings instead of a centroid sliver, and an
 * elongated body additionally gets lengthwise FLOW lines so it reads as flowing current/molten lava.
 * No per-body ink outline (that would re-draw a seam through an overlap); the shore is the edge.
 */
export function styleLiquidFamily(polys: Vec[][], lp: LiquidPalette, rng: () => number, land: string, scale = 4): Prim[] {
  if (polys.length === 0) return [];
  const out: Prim[] = [];
  // GS-hazard-blend: a soft MARGIN just outside the water/lava — the land tone easing toward the shore
  // (a reedy/muddy bank for water, a charred scorch margin for lava) — so the body eases into the turf
  // like the fairway collar instead of meeting the grass on a hard shore ring (the "no blending" tell).
  // Grouped UNDER every body, so a lake + its feeder creek share one continuous margin with no seam.
  const margin = mixHex(land, lp.shore, 0.42);
  // GS-toxic-pools: a luminous liquid (the acid pool) casts an emissive halo that bleeds OUTWARD past
  // the shore onto the land — pushed UNDER every body so it only reads in the ring beyond the pool
  // edge (a glow from within). Fixed prim, ZERO rng, so the seeded flow/glint draws below are
  // untouched and a non-glowing liquid (water/lava, no `lp.glow`) is byte-identical.
  if (lp.glow) {
    for (const poly of polys) {
      const c = centroidOf(poly);
      let r = 0;
      for (const p of poly) r += dist(p, c);
      out.push({ t: 'glow', c, r: (r / poly.length) * 1.7, col: lp.glow });
    }
  }
  for (const poly of polys) out.push({ t: 'poly', pts: offsetPoly(poly, -5.5), fill: margin });
  // GS-inset-2: no drop shadow on the turf — water/lava sits SUNK below its bank, it doesn't float
  // proud of the land. The sunk read comes from the inset bank emboss + depth rings below.
  for (const poly of polys) out.push({ t: 'poly', pts: offsetPoly(poly, -3), fill: lp.shore }); // 1
  for (const poly of polys) out.push({ t: 'poly', pts: poly, fill: lp.base }); // 2
  for (const poly of polys) {
    const axis = longAxis(poly);
    const width = extentAlong(poly, -axis.dir[1], axis.dir[0]); // extent ⟂ the long chord = channel width
    const step = Math.max(1.6, Math.min(7, width * 0.26));
    // GS-inset: the raised bank shadows the up-light shore (base re-laid shifted toward the light) —
    // then the depth ramp below insets from the rim and repaints the deep centre, so the body stays
    // dark-cored while the up-light shore reads as water sunk beneath its bank. Clipped, zero rng.
    const detail: Prim[] = [
      ...embossChildren(poly, scale, { wall: lp.bank, base: lp.base }), // detail is clipped to poly below → no nested clip
    ];
    // GS-hazard-blend-2: SMOOTH depth — many thin feathered rings interpolating base→mid→deep so the
    // body deepens SEAMLESSLY toward its core, instead of the 2 hard contour bands it used to draw (a
    // topographic-map look, not water). `offsetPoly` follows the shape, so a thin river darkens toward
    // its centreline and a lake toward its middle alike. Pure geometry (no rng) — the flow/glint draws
    // below still consume the exact same rng, so every seeded scene is byte-stable.
    const half = Math.max(2, width / 2);
    const maxOff = half * 0.82; // don't collapse the body to a sliver
    const depthRings = 7;
    for (let i = 1; i <= depthRings; i++) {
      const dt = i / depthRings; // 0..1 depth fraction, edge→core
      const col = dt < 0.5 ? mixHex(lp.base, lp.mid, dt * 2) : mixHex(lp.mid, lp.deep, (dt - 0.5) * 2);
      detail.push({ t: 'poly', pts: offsetPoly(poly, maxOff * dt), fill: col });
    }
    if (axis.len > width * 1.9) {
      // A CHANNEL (river/creek/lava river): streaks running ALONG the flow so it reads as moving.
      const px = -axis.dir[1];
      const py = axis.dir[0];
      const c = centroidOf(poly);
      const lanes = 3;
      for (let k = 0; k < lanes; k++) {
        const off = (k - (lanes - 1) / 2) * (width / (lanes + 1));
        const segs = 5;
        for (let sgi = 0; sgi < segs; sgi++) {
          const f0 = -0.42 + (0.84 * sgi) / segs;
          const f1 = -0.42 + (0.84 * (sgi + 0.62)) / segs;
          const wob = (rng() - 0.5) * step * 0.8;
          const a: Vec = [
            c[0] + axis.dir[0] * axis.len * f0 + px * (off + wob),
            c[1] + axis.dir[1] * axis.len * f0 + py * (off + wob),
          ];
          const b: Vec = [
            c[0] + axis.dir[0] * axis.len * f1 + px * (off + wob),
            c[1] + axis.dir[1] * axis.len * f1 + py * (off + wob),
          ];
          detail.push({ t: 'line', a, b, stroke: lp.flow, sw: 1, round: true });
        }
      }
    } else {
      // A still LAKE: a couple of bright glints near the top edge.
      const b = bboxOf(poly);
      const glints = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < glints; i++) {
        const gx = b.minX + (b.maxX - b.minX) * (0.2 + 0.6 * rng());
        const gy = b.minY + (b.maxY - b.minY) * (0.15 + 0.3 * rng());
        const r = 1 + rng() * 1.4;
        detail.push({ t: 'line', a: [gx - r, gy], b: [gx + r, gy], stroke: lp.glint, sw: 1, round: true });
        detail.push({ t: 'line', a: [gx, gy - r], b: [gx, gy + r], stroke: lp.glint, sw: 1, round: true });
      }
    }
    out.push({ t: 'clip', clip: poly, children: detail });
  }
  return out;
}

/**
 * Per-archetype look for a faceted scatter surface (crystal/ice). The default reads as cool
 * crystal/ice; on an INFERNO world the same surface is a glowing OBSIDIAN shard (hot core + warm
 * cleavage), not a cyan ice patch — "ice areas on lava zones don't make sense" (the crystal scatter
 * the ember biome drops used to render in its fixed cyan FILL regardless of the world). Render-only,
 * no rng — purely recolours, so determinism is untouched.
 */
function scatterLook(
  kind: string,
  arch: BiomeArchetype,
): { base: string; highlight: string; facet1: string; facet2: string; faceted: boolean; glow?: string } {
  const faceted = kind === 'crystal' || kind === 'ice';
  // Scrap Belt (GS-rusted-bunkers / grey-steel-scrap): the firm 'waste' flats are RIVETED STEEL
  // PLATES, not pale beach sand — a brushed grey-steel body with a bright lit seam, so they read as
  // salvaged hull plate laid on the rust (and give the corroded world a cool grey third colour beside
  // the muted-teal fairway and rust rough). Non-faceted (a plate, not a gem). Render-only, no rng.
  if (kind === 'waste' && arch === 'metal') {
    return {
      base: '#8b9099', // brushed steel plate
      highlight: 'rgba(214,224,234,0.22)', // lit plate seam / rivet-line sheen
      facet1: 'rgba(235,242,250,0.4)',
      facet2: 'rgba(120,130,140,0.3)',
      faceted: false,
    };
  }
  if (faceted && arch === 'inferno') {
    return {
      base: '#7a2a16', // charred obsidian body
      highlight: 'rgba(255,196,120,0.22)',
      facet1: 'rgba(255,180,90,0.55)',
      facet2: 'rgba(255,120,50,0.4)',
      faceted,
      glow: 'rgba(255,130,50,0.16)', // heat seeping through the glass
    };
  }
  // The void's crystal gardens are VIOLET and lit from within — the only living light out there
  // (the fixed cyan FILL read as ice floating in the abyss).
  if (faceted && arch === 'void') {
    return {
      base: '#6a4fc0',
      highlight: 'rgba(220,200,255,0.25)',
      facet1: 'rgba(230,210,255,0.6)',
      facet2: 'rgba(180,150,255,0.45)',
      faceted,
      glow: 'rgba(160,120,255,0.24)',
    };
  }
  // Cetus's "crystal" scatter is a bioluminescent REEF, not a gem — warm coral pink over the deep
  // teal turf, glowing like the star-ocean it grew from.
  if (faceted && arch === 'cetus') {
    return {
      base: '#3f8a96',
      highlight: 'rgba(255,190,210,0.3)',
      facet1: 'rgba(255,170,200,0.6)',
      facet2: 'rgba(140,240,255,0.5)',
      faceted,
      glow: 'rgba(120,230,240,0.22)',
    };
  }
  // Prism Reach: the signature crystal fields flash prismatic, not flat cyan.
  if (kind === 'crystal' && arch === 'crystal') {
    return {
      base: '#aee2f0',
      highlight: 'rgba(255,255,255,0.3)',
      facet1: 'rgba(255,160,200,0.55)', // a pink refraction …
      facet2: 'rgba(160,255,220,0.5)', // … and a green one — light splitting in the glass
      faceted,
      glow: 'rgba(190,235,255,0.2)',
    };
  }
  return {
    base: fillFor(kind),
    highlight: 'rgba(255,255,255,0.16)',
    facet1: 'rgba(255,255,255,0.4)',
    facet2: 'rgba(255,255,255,0.25)',
    faceted,
  };
}

/** A scatter surface (ice/crystal/waste/lava/void…): base fill + a lit inset band + ink. The
 *  archetype recolours faceted crystal/ice so it suits the world (e.g. molten obsidian on inferno). */
export function styleScatter(kind: string, poly: Vec[], art: ArtFeel, arch: BiomeArchetype): Prim[] {
  const c = centroidOf(poly);
  const look = scatterLook(kind, arch);
  const out: Prim[] = [];
  // A luminous world's scatter glows from within (void crystal / cetus reef / prism / obsidian heat).
  if (look.glow) {
    let r = 0;
    for (const p of poly) r += dist(p, c);
    out.push({ t: 'glow', c, r: (r / poly.length) * 2.1, col: look.glow });
  }
  out.push(
    { t: 'poly', pts: poly, fill: look.base },
    { t: 'poly', pts: scalePoly(poly, c, 0.6).map((p) => [p[0] - 1, p[1] - 1] as Vec), fill: look.highlight },
  );
  if (look.faceted) {
    // Faceting: a couple of bright cleavage lines.
    const b = bboxOf(poly);
    out.push({
      t: 'clip',
      clip: poly,
      children: [
        { t: 'line', a: [b.minX, c[1]], b: [c[0], b.minY], stroke: look.facet1, sw: 1, round: true },
        { t: 'line', a: [c[0], b.minY], b: [b.maxX, c[1]], stroke: look.facet2, sw: 1, round: true },
      ],
    });
  }
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(0,0,0,0.35)', sw: 1.2 });
  return out;
}

/** Thick FESCUE / native rough (GS-hazards-2): a deep native-grass body with seeded upright tufts so
 *  the deep rough reads as wispy native growth, not a flat blob. PER-WORLD (GS-rough-biome-fit): the
 *  body + tuft colours are DERIVED from the world's own rough Shade, not a hardcoded olive — fescue is
 *  poured into EVERY world's edge band + the whole ocean band by the rough-gradient pass, so a single
 *  olive tuft field clashed on frost/crystal/void/ocean. Deriving from `turfShade('rough', arch)` sits
 *  the fescue naturally on each world's ground, a touch DEEPER than the surrounding rough so it still
 *  reads as trouble. The tuft COUNT scales with the PROJECTED patch size (tufts are screen-px strokes),
 *  so this must run on its own per-patch stream (see the call site) — on the shared stream a zoom step
 *  changed the count and re-rolled every draw downstream (trees, water, lava — the decor-jitter bug). */
export function styleFescue(poly: Vec[], arch: BiomeArchetype, rng: () => number): Prim[] {
  const r = turfShade('rough', arch);
  const body = mixHex(r.base, r.dark, 0.55); // a touch deeper than the surrounding rough
  const tuftHi = mixHex(r.light, r.base, 0.35);
  const tuftLo = r.dark;
  const out: Prim[] = [
    { t: 'poly', pts: poly, fill: body },
    { t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(r.ink, 0.4), sw: 1 },
  ];
  const b = bboxOf(poly);
  const blades = Math.max(6, Math.round((b.maxX - b.minX) * (b.maxY - b.minY) * 0.012));
  const inner: Prim[] = [];
  for (let i = 0; i < blades; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    const h = 2.5 + rng() * 3.5;
    const lean = (rng() - 0.5) * 2.2;
    inner.push({ t: 'line', a: [x, y], b: [x + lean, y - h], stroke: rng() < 0.5 ? tuftHi : tuftLo, sw: 1, round: true });
  }
  out.push({ t: 'clip', clip: poly, children: inner });
  return out;
}

/** DEEP ROUGH look per world ARCHETYPE (GS-deep-rough) — a DARK, dense body (deeper than the world's
 *  fescue/rough so it reads as trouble at a glance) with a themed surface texture: tangled grass
 *  blades (grassy worlds), packed snow mounds (frost), upright shard splinters (crystal), or
 *  ember-flecked cinder clumps (inferno). Ocean never uses this (its deep rough is `water`).
 *  void/cetus DO get deeprough blobs on a CALM stop — the rough-gradient pass runs whenever the hole
 *  isn't lost-rough (wildness < 0.55), and with no biome.deepRough set it defaults heavyKind to
 *  'deeprough' — so they need their own rows (GS-rough-biome-fit); without one they fell through to
 *  the verdant-green default and painted green tangle on the indigo void / abyssal-blue cetus ground. */
type DeepRoughMark = 'blade' | 'mound' | 'shard' | 'clump';
interface DeepRoughLook {
  base: string;
  shade: string;
  ink: string;
  mark: DeepRoughMark;
  markCols: [string, string];
  glow?: string;
}
const DEEP_ROUGH: Partial<Record<BiomeArchetype, DeepRoughLook>> = {
  verdant: { base: '#2c4014', shade: '#1a2a0c', ink: 'rgba(10,20,4,0.5)', mark: 'blade', markCols: ['#3e5a1e', '#597e2c'] },
  desert: { base: '#5c4a22', shade: '#3f3216', ink: 'rgba(28,20,8,0.5)', mark: 'blade', markCols: ['#7a6330', '#a68a4a'] },
  // A DARKER shadowed drift so it reads as trouble against the bright snow ground (not just more snow);
  // white crust mounds ride on top to keep it snow.
  frost: { base: '#7c9bb4', shade: '#586f8a', ink: 'rgba(40,60,84,0.5)', mark: 'mound', markCols: ['#ffffff', '#cfe0ee'] },
  inferno: { base: '#3a281e', shade: '#241812', ink: 'rgba(10,6,4,0.55)', mark: 'clump', markCols: ['#4a3226', '#ff7a1e'], glow: 'rgba(255,120,40,0.14)' },
  crystal: { base: '#2c3652', shade: '#1a2238', ink: 'rgba(12,18,34,0.5)', mark: 'shard', markCols: ['#bfe0ea', '#7fa8c8'], glow: 'rgba(180,220,255,0.12)' },
  tempest: { base: '#2e3826', shade: '#1c2418', ink: 'rgba(8,14,6,0.5)', mark: 'blade', markCols: ['#3f4e30', '#6f7d58'] },
  fungal: { base: '#173a28', shade: '#0d2418', ink: 'rgba(4,18,10,0.5)', mark: 'clump', markCols: ['#2f7a54', '#5fd49e'], glow: 'rgba(120,240,180,0.13)' },
  // A dark indigo cosmic tangle with a faint violet glow so it reads as trouble on the void's indigo
  // garden ground (not the old verdant-green default).
  void: { base: '#1a1038', shade: '#0f0822', ink: 'rgba(6,4,16,0.55)', mark: 'clump', markCols: ['#3a2a66', '#7a5fd0'], glow: 'rgba(150,120,255,0.12)' },
  // A deep sea-blue kelp-tangle with a soft cyan glow, sitting on the cetus abyssal-blue clifftop rough.
  cetus: { base: '#123048', shade: '#0b2032', ink: 'rgba(4,14,24,0.55)', mark: 'blade', markCols: ['#1e5068', '#57b4d8'], glow: 'rgba(90,200,255,0.12)' },
  // A rich gilded-emerald tangle with a faint golden glow — a lush hazard on Asgard's emerald fields.
  asgard: { base: '#234a2e', shade: '#16321f', ink: 'rgba(8,20,10,0.5)', mark: 'blade', markCols: ['#2f6a40', '#d8b84a'], glow: 'rgba(255,210,120,0.12)' },
  // A dark, dank reed/bramble bog thicket with a faint sickly-green glow — trouble on the mire's muck.
  swamp: { base: '#26361a', shade: '#16220e', ink: 'rgba(6,14,4,0.5)', mark: 'blade', markCols: ['#3a4a1e', '#5f7a34'], glow: 'rgba(120,180,60,0.11)' },
  // A rust-brown rebar/scrap thicket with a faint ember-orange glow — a jagged tangle on the belt.
  metal: { base: '#3a2416', shade: '#241610', ink: 'rgba(10,5,2,0.55)', mark: 'shard', markCols: ['#8a5a3a', '#c98a4a'], glow: 'rgba(255,140,60,0.10)' },
  // A dark gunmetal thicket of twisted torn hull-plate + severed cabling with a faint cold-cyan glow —
  // a jagged tangle of wreckage on the derelict's steel ground.
  derelict: { base: '#2a3138', shade: '#191d22', ink: 'rgba(6,9,12,0.55)', mark: 'shard', markCols: ['#5c6773', '#8fb0c0'], glow: 'rgba(95,212,208,0.10)' },
  // A thick tawny GORSE/WHIN + fescue tangle (GS-earth) — golden-brown seaside scrub that swallows a cut
  // corner, its wiry blades tipped in the gorse's dusty yellow-green (no glow — real daylight links rough).
  earth: { base: '#6a5a2a', shade: '#4a3e1c', ink: 'rgba(30,24,8,0.5)', mark: 'blade', markCols: ['#8a7c3a', '#b6a85a'] },
};
const DEEP_ROUGH_DEFAULT: DeepRoughLook = { base: '#2c4014', shade: '#1a2a0c', ink: 'rgba(10,20,4,0.5)', mark: 'blade', markCols: ['#3e5a1e', '#597e2c'] };

/** Draw one DEEP ROUGH patch (GS-deep-rough), themed per world. Like `styleFescue` the surface-mark
 *  COUNT scales with the PROJECTED patch size (marks are screen-px strokes), so this MUST run on its
 *  own per-patch stream (see the call site) — on the shared stream a zoom step would re-roll every
 *  draw downstream. */
export function styleDeepRough(poly: Vec[], arch: BiomeArchetype, rng: () => number): Prim[] {
  const look = DEEP_ROUGH[arch] ?? DEEP_ROUGH_DEFAULT;
  const c = centroidOf(poly);
  const out: Prim[] = [];
  if (look.glow) {
    let r = 0;
    for (const p of poly) r += dist(p, c);
    out.push({ t: 'glow', c, r: (r / poly.length) * 1.9, col: look.glow });
  }
  out.push(
    { t: 'poly', pts: poly, fill: look.base },
    { t: 'poly', pts: scalePoly(poly, c, 0.6), fill: look.shade }, // a deep shadowed core so it reads THICK
    { t: 'poly', pts: poly, fill: 'none', stroke: look.ink, sw: 1.2 },
  );
  const b = bboxOf(poly);
  const marks = Math.max(8, Math.round((b.maxX - b.minX) * (b.maxY - b.minY) * 0.016));
  const inner: Prim[] = [];
  for (let i = 0; i < marks; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    const col = rng() < 0.5 ? look.markCols[0] : look.markCols[1];
    if (look.mark === 'mound') {
      const w = 2 + rng() * 3;
      inner.push({ t: 'line', a: [x - w, y], b: [x + w, y - 1], stroke: col, sw: 1.6, round: true });
    } else if (look.mark === 'shard') {
      const h = 3 + rng() * 4;
      inner.push({ t: 'line', a: [x, y], b: [x + (rng() - 0.5) * 1.5, y - h], stroke: col, sw: 1.3, round: true });
    } else if (look.mark === 'clump') {
      const rr = 1.2 + rng() * 1.8; // a small squat tuft/cinder mound (a hexish blob, no rng helper needed)
      const pts: Vec[] = [];
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        pts.push([x + Math.cos(ang) * rr * (0.8 + rng() * 0.4), y + Math.sin(ang) * rr * (0.8 + rng() * 0.4)]);
      }
      inner.push({ t: 'poly', pts, fill: col });
    } else {
      const h = 3.5 + rng() * 4.5; // tall tangled blade
      const lean = (rng() - 0.5) * 2.6;
      inner.push({ t: 'line', a: [x, y], b: [x + lean, y - h], stroke: col, sw: 1.1, round: true });
    }
  }
  out.push({ t: 'clip', clip: poly, children: inner });
  return out;
}

/** Dry RAVINE / barranca (GS-hazards-2): a dark rocky chasm — a shaded gorge floor with a couple of
 *  jagged crack lines and a lit rim, so it reads as a gash in the ground rather than a flat patch. */
export function styleRavine(poly: Vec[], rng: () => number): Prim[] {
  const c = centroidOf(poly);
  const out: Prim[] = [
    { t: 'poly', pts: poly, fill: '#5a4b3c' }, // gorge floor
    { t: 'poly', pts: scalePoly(poly, c, 0.62), fill: '#3a2f24' }, // shadowed depths
    { t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(220,200,170,0.4)', sw: 1.2 }, // lit rim
  ];
  const b = bboxOf(poly);
  const inner: Prim[] = [];
  for (let i = 0; i < 3; i++) {
    const x = b.minX + ((i + 0.5) / 3) * (b.maxX - b.minX);
    inner.push({ t: 'line', a: [x + (rng() - 0.5) * 4, b.minY], b: [x + (rng() - 0.5) * 8, b.maxY], stroke: 'rgba(20,14,8,0.6)', sw: 1.4, round: true });
  }
  out.push({ t: 'clip', clip: poly, children: inner });
  return out;
}
