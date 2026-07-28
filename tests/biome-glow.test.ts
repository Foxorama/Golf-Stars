/**
 * GS-cetus-void-glow — the two worlds built to glow actually do.
 *
 * Void and Cetus have no ground worth speaking of: off the cut turf is the open deep, and what the
 * player looks at is a lit shape floating in it. They shipped as the flattest, least chromatic turf
 * in the game instead — a petrol-grey Cetus fairway (OKLab C 0.083, against verdant's 0.136) and a
 * monochrome void whose whole emissive kit was two flat rgba rings in a greyish periwinkle. This
 * file is the fence against drifting back there. Four rules:
 *
 *  1. A glow is a WORLD'S ROW, not a branch: exactly the luminous worlds carry one, and a world
 *     without a row emits ZERO glow prims (so every other world stays byte-for-byte).
 *  2. The reach is a width of GROUND (GS-green-complex's rule): a halo sized in pixels is a
 *     plausible bloom on the whole-hole map and a hairline at the putt camera, which is exactly
 *     where the player studies the turf.
 *  3. Sizes may read the projection; COUNTS never may (the camera contract).
 *  4. The turf itself stays CHROMATIC. The glow is an emissive kit laid over the palette, not a
 *     substitute for one — a desaturated world with a bright outline is still a washed-out world.
 */
import { describe, it, expect } from 'vitest';
import type { Vec } from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';
import { holeProjector } from '../src/render/project';
import { buildScene, type Prim } from '../src/render/style';
import { worldGlow, glowBloom, glowRim, glowSurfaceEdge } from '../src/render/style/glow';
import { fairwayEdgeRuns } from '../src/render/style/fairway';
import { ARCHETYPE_TURF, ARCHETYPE_SPACE } from '../src/render/palette';
import type { BiomeArchetype } from '../src/sim/course/themes';

const ARCHES = Object.keys(ARCHETYPE_TURF) as BiomeArchetype[];
/** The worlds whose ground IS the deep — the only ones that light their own play surfaces. */
const LUMINOUS: BiomeArchetype[] = ['void', 'cetus'];

const SQUARE: Vec[] = [
  [0, 0],
  [60, 0],
  [60, 40],
  [0, 40],
];

function countPrims(prims: Prim[]): number {
  let n = 0;
  for (const p of prims) {
    n++;
    if (p.t === 'clip') n += countPrims(p.children);
  }
  return n;
}

/** Widest and narrowest drawn extent of a prim list, as a proxy for "how far does the halo carry". */
function spanOf(prims: Prim[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of prims) {
    if (p.t !== 'poly') continue;
    for (const q of p.pts) {
      if (q[0] < minX) minX = q[0];
      if (q[0] > maxX) maxX = q[0];
    }
  }
  return maxX - minX;
}

// --- OKLab, so "washed out" is measured the way an eye reads it, not in raw RGB ---------------
function oklab(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [R, G, B] = ch.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** Perceptual chroma — how far off grey a colour sits. */
function chroma(hex: string): number {
  const [, a, b] = oklab(hex);
  return Math.hypot(a, b);
}
/** Perceptual distance between two colours. */
function deltaE(x: string, y: string): number {
  const a = oklab(x);
  const b = oklab(y);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('the emissive kit is a world ROW, never a branch (GS-cetus-void-glow)', () => {
  it('exactly the luminous worlds carry a glow row', () => {
    for (const a of ARCHES) {
      const has = !!worldGlow(a);
      expect(has, `${a}: glow row`).toBe(LUMINOUS.includes(a));
    }
  });

  it('a world with no row emits no glow prims at all — every other world is untouched', () => {
    // The painters are the ONLY way glow reaches the scene, so a world without a row cannot get any.
    for (const a of ARCHES) {
      if (LUMINOUS.includes(a)) continue;
      expect(worldGlow(a)).toBeUndefined();
    }
    // And the parkland worlds' scenes are free of the kit's signature colours.
    const hole = generateCourse(11, { holes: 4, biome: 'verdant-station', wildness: 0.6 }).holes[0]!;
    const proj = holeProjector(hole, { width: 900, height: 600 });
    const scene = JSON.stringify(buildScene(hole, proj, { biome: 'verdant-station', width: 900, height: 600 }));
    for (const a of LUMINOUS) {
      const g = worldGlow(a)!;
      expect(scene.includes(g.bloom.slice(1)), `verdant scene carries ${a}'s bloom`).toBe(false);
    }
  });

  it('the GREEN burns brightest: a wider, stronger halo than the corridor carries', () => {
    // Game-feel: the target is the one shape the eye should find first on a world with no landmarks.
    for (const a of LUMINOUS) {
      const g = worldGlow(a)!;
      expect(g.greenBloomYd, `${a}: green halo reach`).toBeGreaterThan(g.bloomYd);
      expect(g.greenBloomAlpha, `${a}: green halo strength`).toBeGreaterThan(g.bloomAlpha);
      expect(spanOf(glowBloom(SQUARE, g, 1, true))).toBeGreaterThan(spanOf(glowBloom(SQUARE, g, 1, false)));
    }
  });
});

describe('the halo is a width of GROUND, not of pixels (GS-cetus-void-glow)', () => {
  it('the same bloom covers twice the pixels at twice the zoom', () => {
    const g = worldGlow('void')!;
    const wide = spanOf(glowBloom(SQUARE, g, 1));
    const near = spanOf(glowBloom(SQUARE, g, 2));
    // The surface itself is 60 wide either way; only the halo either side of it should have grown.
    expect(near - 60).toBeGreaterThan((wide - 60) * 1.8);
  });

  it('zooming changes how WIDE the glow is and nothing about how MANY prims it is', () => {
    for (const a of LUMINOUS) {
      const g = worldGlow(a)!;
      for (const build of [
        (s: number) => glowBloom(SQUARE, g, s),
        (s: number) => glowBloom(SQUARE, g, s, true),
        (s: number) => glowSurfaceEdge(SQUARE, g, s),
      ]) {
        expect(countPrims(build(1)), `${a}: prim count at zoom`).toBe(countPrims(build(7)));
      }
    }
  });
});

describe('the lit rim traces the fairway system, not just its first piece (GS-cetus-void-glow)', () => {
  it('a multi-part fairway glows on every piece — off the SAME silhouette the ink uses', () => {
    // GS-fairway-silhouette's rule, inherited: the rim takes `fairwayEdgeRuns`, so a split lane or a
    // broken island segment cannot ship with a bare, unlit edge beside a glowing corridor.
    const g = worldGlow('cetus')!;
    const a: Vec[] = [
      [0, 0],
      [40, 0],
      [40, 20],
      [0, 20],
    ];
    const b: Vec[] = a.map((p) => [p[0] + 90, p[1]] as Vec); // a separate lane, touching nothing
    const runs = fairwayEdgeRuns([a, b], 1);
    const per = runs.map((rs) => glowRim([rs], g).length);
    expect(per.length).toBe(2);
    for (const n of per) expect(n).toBeGreaterThan(0);
  });

  it('a lone surface takes the closed-ring treatment: rim plus an inner glow', () => {
    const g = worldGlow('void')!;
    const edge = glowSurfaceEdge(SQUARE, g, 1);
    expect(edge.length).toBeGreaterThan(glowRim([[{ closed: true, pts: SQUARE }]], g).length);
    // Every ring is a STROKE. A stack of nested FILLS composites darkest where it overlaps most —
    // the interior — which is backwards for an inner glow and would flatten the green's own art.
    for (const p of edge) if (p.t === 'poly') expect(p.fill === undefined || p.fill === 'none').toBe(true);
  });
});

describe('the luminous worlds keep CHROMATIC turf (GS-cetus-void-glow)', () => {
  // The floors below sit under the shipped values with room to tune, and comfortably above where
  // both worlds were when the report came in (cetus fairway 0.083 / rough 0.054, void rough 0.084).
  // A bright outline around a grey slab is not a glowing world.
  const FLOOR = { fairway: 0.095, green: 0.125, rough: 0.075 } as const;

  it('every play surface on a luminous world clears its chroma floor', () => {
    for (const a of LUMINOUS) {
      for (const kind of ['fairway', 'green', 'rough'] as const) {
        const c = chroma(ARCHETYPE_TURF[a][kind].base);
        expect(c, `${a} ${kind}: OKLab chroma`).toBeGreaterThanOrEqual(FLOOR[kind]);
      }
    }
  });

  it('the green stays findable against the fairway it sits in', () => {
    // A luminous world's surfaces share one hue by design, so the green's separation has to be
    // earned in lightness/chroma — this is the fairness half of the art brief, not a nicety.
    for (const a of LUMINOUS) {
      const t = ARCHETYPE_TURF[a];
      expect(deltaE(t.green.base, t.fairway.base), `${a}: green vs fairway`).toBeGreaterThan(0.18);
      expect(deltaE(t.fairway.base, t.rough.base), `${a}: fairway vs rough`).toBeGreaterThan(0.12);
    }
  });

  it('the glow is keyed to the deep its world floats in — a dark blue / dark purple, not a wash', () => {
    // Cetus glows BLUE and void PURPLE, each near its own sky, so the lit turf reads as the same
    // light source as the world around it rather than a sticker laid over it.
    for (const a of LUMINOUS) {
      const g = worldGlow(a)!;
      const sky = ARCHETYPE_SPACE[a].base;
      expect(chroma(g.bloom), `${a}: bloom chroma`).toBeGreaterThan(0.1);
      const hue = (h: string): number => {
        const [, x, y] = oklab(h);
        return (Math.atan2(y, x) * 180) / Math.PI;
      };
      const spread = Math.abs(((hue(g.bloom) - hue(sky) + 540) % 360) - 180);
      expect(spread, `${a}: bloom hue vs its own sky`).toBeLessThan(45);
    }
  });
});
