/**
 * GS-green-complex — the green complex reads as ONE mown surface at EVERY camera.
 *
 * Three rules this pins down:
 *  1. Turf blend bands are SCALE-HONEST: the apron/collar/first-cut are widths of GROUND (course
 *     yards), not fixed pixels. The fixed-px rings read as a plausible apron on the whole-hole map
 *     and collapsed to a hairline at the chip/putt camera — exactly where the player studies the
 *     turf — which is what made the surfaces read as stacked art assets.
 *  2. Sizes may read the projection; COUNTS never may (the camera contract). Zooming must change how
 *     WIDE a band is in pixels and nothing else about how many prims a painter emits.
 *  3. Every world declares its own green complex (a ROW, machine-checked for full coverage) and mows
 *     the green in its own fairway GRAIN — but the surface stays READABLE. A blend that dissolves
 *     the green into the corridor is a fairness bug, not a win.
 */
import { describe, it, expect } from 'vitest';
import type { Vec } from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';
import { holeProjector } from '../src/render/project';
import { buildScene, type Prim } from '../src/render/style';
import { mowPattern, turfPx, turfApron, offsetPoly } from '../src/render/style/shared';
import { greenComplexFor, styleGreen, styleGreenSurround } from '../src/render/style/green';
import { ARCHETYPE_TURF, turfShade } from '../src/render/palette';
import { ART_DEFAULTS } from '../src/render/style/shared';
import type { BiomeArchetype } from '../src/sim/course/themes';

const SQUARE: Vec[] = [
  [0, 0],
  [40, 0],
  [40, 30],
  [0, 30],
];
const BOX = { minX: 0, minY: 0, maxX: 40, maxY: 30 };

/** Recursively count every prim in a scene (clip groups included) — the camera-proof metric. */
function countPrims(prims: Prim[]): number {
  let n = 0;
  for (const p of prims) {
    n++;
    if (p.t === 'clip') n += countPrims(p.children);
  }
  return n;
}

/** Every alpha appearing in an `rgba(...)`/`#rrggbbaa` fill in a prim tree. */
function alphasOf(prims: Prim[], out: number[] = []): number[] {
  for (const p of prims) {
    if (p.t === 'clip') {
      alphasOf(p.children, out);
      continue;
    }
    const fill = 'fill' in p ? p.fill : undefined;
    const m = typeof fill === 'string' ? /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(fill) : null;
    if (m) out.push(Number(m[1]));
  }
  return out;
}

describe('turf blend bands are scale-honest (GS-green-complex)', () => {
  it('a band is the same width of GROUND at every zoom (px scales with px-per-yard)', () => {
    const map = turfPx(1, 6);
    const putt = turfPx(6, 6);
    expect(map).toBeCloseTo(6, 6);
    expect(putt).toBeCloseTo(36, 6);
    // The whole point: 6× the zoom ⇒ 6× the pixels, i.e. the SAME six yards of apron.
    expect(putt / map).toBeCloseTo(6, 6);
  });

  it('floors so it never vanishes at whole-hole zoom, and caps so a deep zoom cannot flood the frame', () => {
    expect(turfPx(0.02, 6)).toBeGreaterThanOrEqual(2);
    expect(turfPx(500, 6)).toBeLessThanOrEqual(64);
    expect(turfPx(0, 6)).toBeGreaterThan(0); // a degenerate scale must not produce a zero/NaN band
  });

  it('the ramp grades in EVEN steps — no single tone jump big enough to read as a ring', () => {
    const ramp = turfApron(SQUARE, 20, '#3f8c3f', 0.2, 6);
    expect(ramp).toHaveLength(6);
    // Widest ring first, each nested inside the last (so every step is drawn over its predecessor).
    const widths = ramp.map((p) => (p.t === 'poly' ? Math.max(...p.pts.map((q) => q[0])) : 0));
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!);
  });

  it('a blend band TINTS (never wipes) the surface underneath it', () => {
    const tint = turfApron(SQUARE, 12, '#5fd45a', 0.24, 4);
    expect(tint).toHaveLength(4);
    // Every ring is translucent — an opaque ring would erase the fairway's mow/sheen and re-read as a
    // painted ring around the green, the very tell the collar exists to cure.
    for (const a of alphasOf(tint)) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(0.24);
    }
  });
});

/**
 * GS-green-apron-blend — the green's surround is ONE skirt with NO silhouette of its own.
 *
 * The surround used to be two unrelated passes: an opaque ramp drawn UNDER the fairway plus a tinted
 * collar drawn on top of it. Wherever the generator's green FLARE wrapped the green the opaque ramp
 * was hidden, and wherever it didn't the ramp showed — so the "apron" was never a ring, only a
 * one-sided crescent of a third colour sitting behind the green. On a world whose ground is not green
 * that reads as somebody else's turf dropped on the sand.
 */
describe('the green surround is a skirt, not a second object (GS-green-apron-blend)', () => {
  const SURROUND_ARCHES = Object.keys(ARCHETYPE_TURF) as BiomeArchetype[];

  it('every ring is TRANSLUCENT — the ground it lies on reads straight through', () => {
    for (const arch of SURROUND_ARCHES) {
      const prims = styleGreenSurround(SQUARE, '#3c9a3a', '#5fd45a', arch, 3);
      const fills = prims.map((p) => (p.t === 'poly' ? p.fill : ''));
      for (const f of fills) expect(f, `${arch} surround ring is a tint, never an opaque fill`).toMatch(/^rgba\(/);
      expect(alphasOf(prims)).toHaveLength(fills.length);
    }
  });

  it('the OUTERMOST ring is invisible — the band has no outer edge to find', () => {
    for (const arch of SURROUND_ARCHES) {
      const alphas = alphasOf(styleGreenSurround(SQUARE, '#3c9a3a', '#5fd45a', arch, 3));
      // Each band is emitted widest-first, so the first alpha of each is its outer edge. Under a
      // perceptual floor there is nothing for the eye to catch where the skirt meets the ground.
      expect(Math.min(...alphas), `${arch} outer ring`).toBeLessThan(0.025);
    }
  });

  it('alpha rises MONOTONICALLY inward within each band, peaking at the surface edge', () => {
    const apron = alphasOf(turfApron(SQUARE, 20, '#3c9a3a', 0.2, 8));
    expect(apron).toHaveLength(8);
    for (let i = 1; i < apron.length; i++) expect(apron[i]!).toBeGreaterThan(apron[i - 1]!);
    expect(apron.at(-1)).toBeCloseTo(0.2, 6);
    expect(apron[0]).toBeLessThan(0.01);
  });

  it('a star green’s concave notch cannot spike the skirt (the tight turf miter)', () => {
    // A five-point star — the shape family the generator actually emits for a green (r(θ) with a
    // pin off the centroid). Its inner vertices are reflex, and a generous miter fires there.
    const star: Vec[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 30 : 12;
      star.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    const band = 10;
    const loose = offsetPoly(star, -band); // the default 4× miter — a river band wants sharp corners
    const tight = offsetPoly(star, -band, 1.2); // what a turf skirt uses
    const reach = (pts: Vec[]) => Math.max(...pts.map((p) => Math.hypot(p[0] - 50, p[1] - 50)));
    // The loose miter throws the notch vertices far past the band width; the tight one keeps the
    // skirt roughly a uniform `band` outside the green wherever you measure it.
    expect(reach(loose)).toBeGreaterThan(reach(star) + band * 1.5);
    expect(reach(tight)).toBeLessThanOrEqual(reach(star) + band * 1.25);
  });

  it('the skirt is drawn OVER the corridor and UNDER the surface — so it rings the whole green', () => {
    // The regression this pins: drawn under the fairway pass, the surround vanished wherever the
    // green-flare wrapped the green and showed only where it didn't — a crescent, never a ring.
    const hole = generateCourse(11, { holes: 4, biome: 'verdant-station', wildness: 0.6 }).holes[0]!;
    const proj = holeProjector(hole, { width: 900, height: 600, focus: hole.green, viewRadius: 40 });
    const scene = buildScene(hole, proj, { biome: 'verdant-station', width: 900, height: 600 });
    const fills: string[] = [];
    const walk = (list: Prim[]): void => {
      for (const p of list) {
        if (p.t === 'clip') walk(p.children);
        else if (p.t === 'poly' && typeof p.fill === 'string') fills.push(p.fill);
      }
    };
    walk(scene);
    const fw = turfShade('fairway', 'verdant').base;
    const gr = turfShade('green', 'verdant').base;
    // `hexAlpha` of the verdant collar — the apron band's tint.
    const apronTint = fills.findIndex((f) => f.startsWith('rgba(60,154,58,'));
    expect(apronTint, 'the green apron tint is in the scene').toBeGreaterThan(-1);
    expect(apronTint).toBeGreaterThan(fills.lastIndexOf(fw)); // over the corridor…
    expect(apronTint).toBeLessThan(fills.lastIndexOf(gr)); // …and under the putting surface
  });
});

describe('every world declares its own green complex (content-as-data)', () => {
  it('a row for EVERY archetype — a new world is a ROW, never an engine edit', () => {
    for (const arch of Object.keys(ARCHETYPE_TURF) as BiomeArchetype[]) {
      const look = greenComplexFor(arch);
      expect(look, `green complex row for ${arch}`).toBeDefined();
      expect(look.apronYd).toBeGreaterThan(0);
      expect(look.mowBands).toBeGreaterThan(0);
      // A collar is a band you can identify, not a gradient: always much narrower than the apron.
      expect(look.collarYd).toBeGreaterThan(0);
      expect(look.collarYd).toBeLessThan(look.apronYd);
    }
  });

  it('the worlds differ — apron widths and mow pitches are not one shared value', () => {
    const rows = (Object.keys(ARCHETYPE_TURF) as BiomeArchetype[]).map(greenComplexFor);
    expect(new Set(rows.map((r) => r.apronYd)).size).toBeGreaterThan(3);
    expect(new Set(rows.map((r) => r.mowBands)).size).toBeGreaterThan(2);
  });

  it('the green mows in its OWN world’s grain (the same dispatch the fairway uses)', () => {
    const one = (arch: BiomeArchetype) =>
      JSON.stringify(mowPattern(SQUARE, '#5fd45a', '#49b446', BOX, arch, 6));
    // Swept (frost), faceted (crystal) and cross-mown (fungal) must each differ from classic parkland
    // stripes — a green striped horizontally inside a vertically-swept corridor read as two materials.
    expect(one('frost')).not.toBe(one('verdant'));
    expect(one('crystal')).not.toBe(one('verdant'));
    expect(one('fungal')).not.toBe(one('verdant'));
  });
});

describe('the blend never costs the green its readability', () => {
  it('the putting surface still lays its own base fill, whatever the blend does around it', () => {
    for (const arch of ['verdant', 'desert', 'frost', 'fungal'] as BiomeArchetype[]) {
      const s = turfShade('green', arch);
      const prims = styleGreen(SQUARE, ART_DEFAULTS, s, arch, undefined, BOX, 3);
      const base = prims.find((p) => p.t === 'poly' && p.fill === s.base);
      expect(base, `${arch} green keeps its own surface fill`).toBeDefined();
    }
  });
});

describe('the scale-honest bands stay camera-proof', () => {
  it('the zoom changes band SIZES, never band COUNTS (the camera contract)', () => {
    const s = turfShade('green', 'verdant');
    const near = styleGreen(SQUARE, ART_DEFAULTS, s, 'verdant', undefined, BOX, 6);
    const wide = styleGreen(SQUARE, ART_DEFAULTS, s, 'verdant', undefined, BOX, 1);
    expect(countPrims(near)).toBe(countPrims(wide));
    const apronNear = styleGreenSurround(SQUARE, '#3c9a3a', '#5fd45a', 'verdant', 6);
    const apronWide = styleGreenSurround(SQUARE, '#3c9a3a', '#5fd45a', 'verdant', 1);
    expect(apronNear).toHaveLength(apronWide.length);
    // …and the near camera really does draw a WIDER apron in pixels (the same yards of ground).
    const spanOf = (p: Prim): number => (p.t === 'poly' ? Math.max(...p.pts.map((q) => q[0])) : 0);
    expect(spanOf(apronNear[0]!)).toBeGreaterThan(spanOf(apronWide[0]!));
  });

  it('a whole scene still builds at both cameras and stays byte-stable at each', () => {
    const hole = generateCourse(11, { holes: 4, biome: 'verdant-station', wildness: 0.6 }).holes[0]!;
    const wide = holeProjector(hole, { width: 900, height: 600 });
    const near = holeProjector(hole, { width: 900, height: 600, focus: hole.green, viewRadius: 25 });
    expect(near.scale).toBeGreaterThan(wide.scale * 2); // the two cameras really are far apart
    for (const proj of [wide, near]) {
      const a = buildScene(hole, proj, { biome: 'verdant-station', width: 900, height: 600 });
      const b = buildScene(hole, proj, { biome: 'verdant-station', width: 900, height: 600 });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(countPrims(a)).toBeGreaterThan(0);
    }
  });
});
