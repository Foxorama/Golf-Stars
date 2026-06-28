import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG } from '../src/render/holeView';
import { __test__ } from '../src/render/style';
import { LAVA, WATER } from '../src/render/palette';
import type { Hole, Vec } from '../src/sim/course/contract';

const { offsetPoly } = __test__;

/** Bounding-box extent of a polygon (for area-direction checks). */
function span(pts: Vec[]): { w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { w: maxX - minX, h: maxY - minY };
}

describe('offsetPoly (uniform polygon inset/outset — the blend/depth-band primitive)', () => {
  const square: Vec[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('a positive distance shrinks the polygon (inward), a negative grows it (outward)', () => {
    const inb = span(offsetPoly(square, 2));
    const outb = span(offsetPoly(square, -2));
    expect(inb.w).toBeLessThan(10);
    expect(inb.h).toBeLessThan(10);
    expect(outb.w).toBeGreaterThan(10);
    expect(outb.h).toBeGreaterThan(10);
    // The inset of a 10×10 square by 2 is a centred 6×6.
    expect(inb.w).toBeCloseTo(6, 1);
    expect(inb.h).toBeCloseTo(6, 1);
  });

  it('hugs an elongated band (a river) instead of collapsing it toward the centroid', () => {
    // A long thin band: inset by 2 stays a long band (a centroid-scale would crush its length).
    const band: Vec[] = [
      [0, 0],
      [100, 0],
      [100, 8],
      [0, 8],
    ];
    const inset = span(offsetPoly(band, 2));
    expect(inset.w).toBeCloseTo(96, 0); // length barely changes — the channel is preserved
    expect(inset.h).toBeCloseTo(4, 0); // only the narrow dimension closes in
  });

  it('handles a degenerate polygon without throwing', () => {
    expect(() => offsetPoly([[0, 0], [1, 1]], 2)).not.toThrow();
  });
});

/** Find a generated hole carrying a given hazard kind (deterministic search). */
function holeWith(biome: string, kind: string): Hole | undefined {
  for (let seed = 1; seed < 60; seed++) {
    for (const h of generateCourse(seed, { holes: 6, biome, wildness: 1 }).holes) {
      if (h.hazards.some((z) => z.kind === kind)) return h;
    }
  }
  return undefined;
}

describe('liquid families render through the shared banded/flow drawer (GS-blend)', () => {
  it('a lava river is drawn with its crust shore + molten body (one connected substance)', () => {
    const hole = holeWith('ember-world', 'lavariver');
    expect(hole, 'an ember hole with a lava river').toBeDefined();
    const svg = renderHoleSVG(hole!, { biome: 'ember-world' });
    expect(svg).toContain(LAVA.body); // molten body
    expect(svg).toContain(LAVA.crust); // charred crust = the shore rim
  });

  it('a water creek is drawn with its shore + body and stays deterministic', () => {
    const hole = holeWith('verdant-station', 'creek');
    expect(hole, 'a verdant hole with a creek').toBeDefined();
    const svg = renderHoleSVG(hole!, { biome: 'verdant-station' });
    expect(svg).toContain(WATER.base);
    expect(svg).toContain(WATER.shallow); // shoreline rim
    expect(renderHoleSVG(hole!, { biome: 'verdant-station' })).toBe(svg); // byte-stable
  });
});
