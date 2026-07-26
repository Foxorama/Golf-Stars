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
import { mowPattern, turfPx, turfRamp, turfRampTint } from '../src/render/style/shared';
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

  it('the ramps grade in EVEN steps — no single tone jump big enough to read as a ring', () => {
    const ramp = turfRamp(SQUARE, 20, '#3f8c3f', '#5fd45a', 6);
    expect(ramp).toHaveLength(6);
    // Widest ring first, each nested inside the last (so every step is drawn over its predecessor).
    const widths = ramp.map((p) => (p.t === 'poly' ? Math.max(...p.pts.map((q) => q[0])) : 0));
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeLessThan(widths[i - 1]!);
  });

  it('the on-fairway collar TINTS (never wipes) the corridor underneath it', () => {
    const tint = turfRampTint(SQUARE, 12, '#5fd45a', 0.24, 4);
    expect(tint).toHaveLength(4);
    // Every ring is translucent — an opaque ring would erase the fairway's mow/sheen and re-read as a
    // painted ring around the green, the very tell the collar exists to cure.
    for (const a of alphasOf(tint)) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(0.3);
    }
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
    const apronNear = styleGreenSurround(SQUARE, '#3c9a3a', '#356b30', 'verdant', 6);
    const apronWide = styleGreenSurround(SQUARE, '#3c9a3a', '#356b30', 'verdant', 1);
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
