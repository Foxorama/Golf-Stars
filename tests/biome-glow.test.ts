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
import { CETUS_CLIFF, VOID_CLIFF, SHIP_CLIFF, RAINBOW_CLIFF, platformCliffs } from '../src/render/style/platforms';
import { greenComplexFor } from '../src/render/style/green';
import { BIOMES } from '../src/sim/course/biomes';
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
/** Perceptual lightness, 0 (black) to 1 (white). */
function lightness(hex: string): number {
  return oklab(hex)[0];
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

  it('the lit RIM is a width of ground too — it was the half of the rule that got missed', () => {
    // A fixed-px rim is the same mistake as a fixed-px band, just on strokes: the widest pass is 4x
    // the core, so on the whole-hole map a 6.4px halo sat on a green barely 30px across and covered
    // a fifth of the putting surface. That is why the greens "looked really small".
    for (const a of LUMINOUS) {
      const g = worldGlow(a)!;
      const widthAt = (s: number): number => {
        const w = glowRim([[{ closed: true, pts: SQUARE }]], g, s).map((p) => ('sw' in p ? (p.sw ?? 0) : 0));
        return Math.max(...w);
      };
      expect(widthAt(4), `${a}: rim at 4 px/yd`).toBeGreaterThan(widthAt(1) * 1.8);
      // ...and clamped at both ends, so it neither vanishes on the map nor floods at the putt camera.
      expect(widthAt(0.05), `${a}: rim floor`).toBeGreaterThan(0);
      expect(widthAt(400), `${a}: rim cap`).toBeLessThan(widthAt(4) * 20);
    }
  });

  it('zooming changes how WIDE the glow is and nothing about how MANY prims it is', () => {
    for (const a of LUMINOUS) {
      const g = worldGlow(a)!;
      for (const build of [
        (s: number) => glowBloom(SQUARE, g, s),
        (s: number) => glowBloom(SQUARE, g, s, true),
        (s: number) => glowSurfaceEdge(SQUARE, g, s),
        (s: number) => glowRim([[{ closed: true, pts: SQUARE }]], g, s),
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
    const per = runs.map((rs) => glowRim([rs], g, 1).length);
    expect(per.length).toBe(2);
    for (const n of per) expect(n).toBeGreaterThan(0);
  });

  it('a lone surface takes the closed-ring treatment: rim plus an inner glow', () => {
    const g = worldGlow('void')!;
    const edge = glowSurfaceEdge(SQUARE, g, 1);
    expect(edge.length).toBeGreaterThan(glowRim([[{ closed: true, pts: SQUARE }]], g, 1).length);
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

describe('the supporting art supports — it does not compete (GS-cetus-void-deep)', () => {
  // The report: "the pillars supporting the fairways and the space background have also been
  // tonally brightened, and the holes themselves don't really stand out." Both halves are the same
  // rule — on a world whose whole point is a lit shape in the dark, the ONLY bright thing in the
  // frame should be the golf. Everything else is scenery, and scenery sits underneath.
  const CLIFFS: [BiomeArchetype, { strata: string[] }][] = [
    ['cetus', CETUS_CLIFF],
    ['void', VOID_CLIFF],
  ];

  it('every cliff stratum is darker than the turf it holds up', () => {
    // The buttress had a top band at OKLab L 0.703 under a cetus fairway at 0.556, and 0.546 under a
    // void fairway at 0.400 — the masonry was lighter than the golf course standing on it, which is
    // exactly why the eye went to it on a frame that is half drawn island.
    for (const [a, look] of CLIFFS) {
      const fairway = lightness(ARCHETYPE_TURF[a].fairway.base);
      for (const [i, band] of look.strata.entries()) {
        expect(lightness(band), `${a} stratum ${i} vs its own fairway`).toBeLessThan(fairway);
      }
      // ...and the brightest band by a clear STEP, not a hair, so the plateau reads as capping a
      // mass in shadow. Pinned to the fairway rather than the rough on purpose: Cetus is a SEA CLIFF
      // whose upper face legitimately catches light (that side-on read is the world's signature), so
      // a "darker than the darkest ground" rule would be describing the void's asteroid, not both.
      expect(lightness(look.strata[0]!), `${a}: top stratum sits well under the golf`).toBeLessThan(fairway - 0.1);
    }
  });

  it('the face descends monotonically into the dark', () => {
    for (const [a, look] of CLIFFS) {
      for (let i = 1; i < look.strata.length; i++) {
        expect(lightness(look.strata[i]!), `${a} stratum ${i}`).toBeLessThan(lightness(look.strata[i - 1]!));
      }
    }
  });

  it('the extrusion is a SKIRT, not a second object the size of the hole', () => {
    // At 0.6 of the platform's short span the buttress ran to two-fifths of the drawn island and
    // took as much of the play frame as the fairway. A third of that span still says "this is a slab
    // floating in space"; past it, it is just a bigger object.
    const wide: Vec[] = [
      [0, 0],
      [300, 0],
      [300, 200],
      [0, 200],
    ];
    const { faces } = platformCliffs([wide], 1, () => 0.5, VOID_CLIFF);
    expect(faces[0]!.height).toBeLessThan(200 * 0.4);
    // ...and it is a ROW, so the other materials on the same painter are untouched: a derelict hull
    // SECTION is a torn slab of ship and a Rainbow Course buttress is a pillar. Both keep the classic
    // depth, which is what stops a void art pass quietly restyling two other worlds.
    for (const look of [SHIP_CLIFF, RAINBOW_CLIFF]) {
      expect(platformCliffs([wide], 1, () => 0.5, look).faces[0]!.height).toBe(200 * 0.6);
    }
  });

  it('the two worlds that ARE the dark keep the darkest skies in the game', () => {
    // The nebula is drawn as three glows sized off the SCREEN, so at the play camera — where the sky
    // is a thin margin round the hole — the player only ever sees their bright cores. On these two
    // worlds the sky has to be colour at near-zero strength, or the deep reads as a flat mid wash at
    // the platform's own value and nothing stands out.
    const alpha = (rgba: string): number => Number(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(rgba)![1]);
    const others = (Object.keys(ARCHETYPE_SPACE) as BiomeArchetype[]).filter((a) => !LUMINOUS.includes(a));
    const dimmest = Math.min(...others.map((a) => alpha(ARCHETYPE_SPACE[a].nebula)));
    for (const a of LUMINOUS) {
      expect(alpha(ARCHETYPE_SPACE[a].nebula), `${a}: nebula strength`).toBeLessThanOrEqual(dimmest);
      expect(lightness(ARCHETYPE_SPACE[a].base), `${a}: sky base`).toBeLessThan(0.15);
    }
  });
});

describe('the green is findable on a world with no landmarks (GS-cetus-void-deep)', () => {
  it('neither luminous world carries an outlier-small green any more', () => {
    // They held the two smallest greens in the game outside the derelict, on the two worlds whose
    // green is hardest to find. `greenSize` is a pure multiplier applied AFTER the radius draw, so
    // this moves geometry without moving the rng stream (contract 1).
    const sizes = BIOMES.filter((b) => b.greenSize !== undefined).map((b) => b.greenSize!);
    const median = sizes.slice().sort((x, y) => x - y)[Math.floor(sizes.length / 2)]!;
    for (const id of ['void-garden', 'cetus-deep']) {
      const b = BIOMES.find((x) => x.id === id)!;
      expect(b.greenSize, `${id}: greenSize vs the pack median`).toBeGreaterThanOrEqual(median);
    }
  });

  it('a green with no complex around it reads smaller than it is', () => {
    // The tightest green complexes in the game sat on the two worlds that most needed a sized,
    // readable surround. Brought up to the parkland band.
    for (const a of LUMINOUS) {
      expect(greenComplexFor(a).apronYd, `${a}: apron`).toBeGreaterThanOrEqual(greenComplexFor('verdant').apronYd);
      expect(greenComplexFor(a).collarYd, `${a}: collar`).toBeGreaterThanOrEqual(greenComplexFor('verdant').collarYd);
    }
  });
});
