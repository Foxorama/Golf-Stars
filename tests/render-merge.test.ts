import { describe, it, expect } from 'vitest';
import { unionPolys, dilateUnion } from '../src/render/merge';
import { pointInPoly, type Vec } from '../src/sim/course/contract';

/** A regular n-gon approximating a circle. */
function circle(cx: number, cy: number, r: number, n = 16): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function areaOf(pts: Vec[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]![0] * pts[i]![1] - pts[i]![0] * pts[j]![1];
  }
  return Math.abs(a / 2);
}

describe('unionPolys (same-family hazard merge, GS-hazard-blend)', () => {
  it('two overlapping circles fuse into ONE merged body covering both', () => {
    const merged = unionPolys([circle(0, 0, 10), circle(12, 0, 10)], 1);
    expect(merged.length).toBe(1);
    const m = merged[0]!;
    // The merged silhouette contains both original centres and interior probe points.
    expect(pointInPoly([0, 0], m)).toBe(true);
    expect(pointInPoly([12, 0], m)).toBe(true);
    expect(pointInPoly([6, 0], m)).toBe(true); // the overlap waist
    // And is at least as big as one circle, less than the sum (they overlap).
    const one = areaOf(circle(0, 0, 10));
    expect(areaOf(m)).toBeGreaterThan(one * 1.2);
    expect(areaOf(m)).toBeLessThan(one * 2);
  });

  it('disjoint bodies stay separate — and keep their EXACT original vertices (identity fast path)', () => {
    const a = circle(0, 0, 5);
    const b = circle(100, 100, 5);
    const merged = unionPolys([a, b], 1);
    expect(merged.length).toBe(2);
    expect(merged).toContain(a); // untouched references — no re-rasterised stair-steps
    expect(merged).toContain(b);
  });

  it('a chain of touching pots reads as one complex', () => {
    const chain = [circle(0, 0, 4), circle(6, 2, 4), circle(12, 0, 4), circle(18, 2, 4)];
    const merged = unionPolys(chain, 0.8);
    expect(merged.length).toBe(1);
    for (const c of [[0, 0], [6, 2], [12, 0], [18, 2]] as Vec[]) {
      expect(pointInPoly(c, merged[0]!)).toBe(true);
    }
  });
});

describe('dilateUnion (fold-proof platform outset)', () => {
  /** A concave V-band ribbon — the shape whose mitred outset self-intersects (the star-gap bug). */
  const vBand: Vec[] = [
    [0, 0],
    [40, 40],
    [80, 0],
    [80, 14],
    [40, 54],
    [0, 14],
  ];

  it('covers every original vertex with margin to spare, with NO fold gap at the concave bend', () => {
    const out = dilateUnion([vBand], 10, 1.5);
    expect(out.length).toBe(1);
    const plat = out[0]!;
    for (const p of vBand) expect(pointInPoly(p, plat)).toBe(true);
    // Points a few units OUTWARD of each vertex are still inside (a real ≥half-pad margin).
    expect(pointInPoly([0 - 5, 0 - 5], plat)).toBe(true);
    expect(pointInPoly([80 + 5, 0 - 5], plat)).toBe(true);
    // The concave notch above the V's inner corner — exactly where a mitred outset folds and the
    // fill rule leaves a star gap — is solid ground.
    expect(pointInPoly([40, 46], plat)).toBe(true);
    expect(pointInPoly([40, 58], plat)).toBe(true); // within pad below the inner corner
  });

  it('the dilated loop is simple (no self-intersections)', () => {
    const plat = dilateUnion([vBand], 12, 1.5)[0]!;
    const cross = (a: Vec, b: Vec, c: Vec, d: Vec): boolean => {
      const o = (p: Vec, q: Vec, r: Vec) =>
        Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
      return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
    };
    const n = plat.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent around the wrap
        expect(cross(plat[i]!, plat[(i + 1) % n]!, plat[j]!, plat[(j + 1) % n]!)).toBe(false);
      }
    }
  });

  it('two nearby features grow together into ONE platform; far ones stay separate islands', () => {
    const near = dilateUnion([circle(0, 0, 8), circle(30, 0, 8)], 10, 1.5);
    expect(near.length).toBe(1);
    const far = dilateUnion([circle(0, 0, 8), circle(100, 0, 8)], 10, 1.5);
    expect(far.length).toBe(2);
  });
});
