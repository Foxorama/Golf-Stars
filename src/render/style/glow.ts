/**
 * The LUMINOUS worlds' emissive kit (GS-cetus-void-glow) — the one description of how a world that
 * is lit from within paints its playable surfaces.
 *
 * Void and Cetus are the two worlds with no ground worth speaking of: off the cut turf is the open
 * deep, and what the player is looking at is a lit shape floating in it. That is a lighting problem,
 * and it was being solved by two ad-hoc lines in `buildScene` — a pair of flat rgba rings at α 0.10 /
 * 0.14 in a greyish periwinkle for the void, and for Cetus nothing at all beyond a hairline rim on
 * the calm-stop shelf. Measured on the drawn map, that left the two space worlds among the LEAST
 * colourful in the game (Hasler–Süsstrunk colourfulness: void 31.7 against verdant's 52.4, on the
 * centre crop of a calm stop) with turf chroma to match (OKLab C: cetus fairway 0.083, against
 * verdant 0.136) — flat mid-value slabs with nothing standing proud of them. Hence the report: the
 * two worlds built to glow were the two that didn't.
 *
 * Three rules this module exists to keep:
 *
 *  1. **A glow is a WORLD'S ROW, not a branch.** `WORLD_GLOW` carries void and cetus; every other
 *     archetype has no row, gets no prims, and is byte-for-byte what it was. A third luminous world
 *     is a row here, never an edit to `buildScene`.
 *  2. **The reach is measured in YARDS** (GS-green-complex's rule, which the old fixed −13/−6 px
 *     rings broke): a halo sized in pixels is a plausible bloom on the whole-hole map and a hairline
 *     at the putt camera, where the player is actually studying the turf.
 *  3. **The lit edge is drawn off the SAME silhouette the ink is** (GS-fairway-silhouette). A neon
 *     line is a wide faint stroke under a narrow bright one — three passes along the same runs — so
 *     it can never cut back across turf another piece of fairway has covered, and a split fairway
 *     glows on every piece rather than only the first.
 *
 * Pure geometry: zero rng, fixed loop counts, so the scene stays camera-proof and every art stream is
 * untouched. Sizes read the projection (the camera contract allows that; only COUNTS may not).
 */
import type { Vec } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import type { EdgeRun } from './fairway';
import { strokeRun } from './fairway';
import { hexAlpha, offsetPoly, turfApron, turfPx, TURF_MITER, type Prim } from './shared';

/** How a luminous world lights its own play surfaces. Widths are COURSE YARDS throughout. */
export interface WorldGlow {
  /** The halo spilling off cut turf into the deep — the world's core glow read. */
  bloom: string;
  bloomYd: number;
  bloomAlpha: number;
  /** The GREEN burns brightest: the target is the one shape the eye should find first. */
  greenBloom: string;
  greenBloomYd: number;
  greenBloomAlpha: number;
  /** The lit edge itself, and the width of its brightest (innermost) stroke — in course yards, like
   *  every other reach here. It was a fixed 1.6px, which is the mistake this module was written to
   *  avoid, just applied to strokes instead of bands: the widest pass is 4x the core, so at the
   *  whole-hole camera a 6.4px halo sat on a green barely 30px across and ate a fifth of the
   *  putting surface. That is most of "the greens look really small in these two biomes" — the
   *  green was not small, its own glow was covering it. */
  rim: string;
  rimYd: number;
  /** Inward reach of a lone surface's inner glow, in course yards, and its alpha at the edge. */
  coreYd: number;
  coreAlpha: number;
}

/**
 * Void = a dark PURPLE glow, Cetus = a dark BLUE one — each keyed to the deep its world floats in,
 * so the lit turf reads as the same light source as the sky rather than a sticker laid over it.
 * Deliberately NOT the near-white lit-lip colours the cliff extrusions use (`CETUS_CLIFF.lipA` and
 * friends): those mark a hard edge catching starlight, this is the surface itself emitting.
 */
const WORLD_GLOW: Partial<Record<BiomeArchetype, WorldGlow>> = {
  // The abyss garden: a saturated cosmic violet bloom off the astroturf islands, a pale lilac rim.
  void: {
    bloom: '#7b3fe4',
    bloomYd: 10,
    bloomAlpha: 0.3,
    greenBloom: '#a06bff',
    greenBloomYd: 13,
    greenBloomAlpha: 0.42,
    rim: '#c9aeff',
    rimYd: 1.1,
    coreYd: 3.2,
    coreAlpha: 0.22,
  },
  // The star-ocean clifftop: a deep cobalt bloom off the plateau into the sea, a bioluminescent
  // cyan rim where the turf catches the light of whatever is swimming below it.
  cetus: {
    bloom: '#1f74e0',
    bloomYd: 10,
    bloomAlpha: 0.32,
    greenBloom: '#2fbcff',
    greenBloomYd: 13,
    greenBloomAlpha: 0.44,
    rim: '#9be8ff',
    rimYd: 1.1,
    coreYd: 3.2,
    coreAlpha: 0.24,
  },
};

/** This world's emissive kit, or `undefined` for the (many) worlds lit from outside. */
export function worldGlow(arch: BiomeArchetype): WorldGlow | undefined {
  return WORLD_GLOW[arch];
}

/**
 * The outward HALO off a play surface, drawn UNDER it. `turfApron` grades alpha quadratically to
 * nothing at the outer edge, so the bloom has no boundary for the eye to find — it is light falling
 * off, not a ring painted around the turf. The innermost ring lands exactly on the surface and is
 * covered by the fill drawn over it, which is why this must stay a below-pass.
 */
export function glowBloom(sp: Vec[], g: WorldGlow, scale: number, green = false): Prim[] {
  const yd = green ? g.greenBloomYd : g.bloomYd;
  const col = green ? g.greenBloom : g.bloom;
  const a = green ? g.greenBloomAlpha : g.bloomAlpha;
  return turfApron(sp, turfPx(scale, yd), col, a, BLOOM_STEPS);
}
/** Enough rings that no single alpha step reads as a band in the falloff. */
const BLOOM_STEPS = 9;

/**
 * The lit EDGE along a silhouette run: a wide faint stroke, a mid one, then the narrow bright core.
 * Stacked that way the line reads as light bleeding off a bright filament rather than a drawn
 * outline — and because it takes the same `EdgeRun`s the ink does, it traces the fairway system's
 * ONE silhouette and never chords across buried turf.
 */
export function glowRim(runs: EdgeRun[][], g: WorldGlow, scale: number): Prim[] {
  const out: Prim[] = [];
  // Floored so the filament never vanishes on the whole-hole map, capped so a putt-camera zoom can't
  // turn the halo into a flood — the same clamp `turfPx` applies to every other turf band.
  const core = turfPx(scale, g.rimYd, 1.2, 6);
  for (const rs of runs)
    for (const r of rs)
      for (const [w, a] of RIM_PASSES) out.push(strokeRun(r, hexAlpha(g.rim, a), core * w));
  return out;
}
/** Width multiple × alpha, widest/faintest first — the falloff either side of the filament. */
const RIM_PASSES: [number, number][] = [
  [4, 0.1],
  [2.2, 0.18],
  [1, 0.62],
];

/**
 * A LONE surface's own lit edge (the green, the tee) — the neon rim plus an inner glow raking back
 * across the surface, so the light falls off BOTH ways off the boundary instead of stopping dead at
 * it. That inner half is what makes a putting surface read as EMITTING rather than as a bright fill
 * with a line round it.
 *
 * The inner glow is concentric STROKES, never nested fills: a stack of filled polygons composites
 * darkest where it overlaps most, which is the interior — exactly backwards, and it would flatten
 * the green's own mow/relief art under a wash. Strokes tint only the band they cover.
 *
 * Only ever applied to a surface that stands alone. An inner glow on one piece of a multi-part
 * fairway would draw a seam straight down the join where two pieces meet flush — the GS-blend bug
 * in reverse — which is why the fairway system takes `glowRim` off its shared silhouette instead.
 */
export function glowSurfaceEdge(sp: Vec[], g: WorldGlow, scale: number): Prim[] {
  const out: Prim[] = [];
  const step = turfPx(scale, g.coreYd / CORE_RINGS, 1);
  for (let i = CORE_RINGS; i >= 1; i--) {
    const u = (i - 1) / CORE_RINGS; // 0 = hard against the edge (full alpha) → deepest inside fades out
    out.push({
      t: 'poly',
      pts: offsetPoly(sp, step * (i - 0.5), TURF_MITER),
      fill: 'none',
      stroke: hexAlpha(g.rim, g.coreAlpha * (1 - u) * (1 - u)),
      sw: step * 1.3,
    });
  }
  out.push(...glowRim([[{ closed: true, pts: sp }]], g, scale));
  return out;
}
const CORE_RINGS = 4;
