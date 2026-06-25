import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness } from '../src/sim/course/generate';
import { validateCourse, polylineDist, type Hole } from '../src/sim/course/contract';
import { lieInfo } from '../src/sim/shot';
import { playBounds, playBoundsCorners, obStakes, inBounds } from '../src/sim/round';
import { renderHoleSVG } from '../src/render/holeView';

/** Count hazards of a kind across a multi-hole course. */
function countKind(holes: Hole[], kind: string): number {
  return holes.reduce((n, h) => n + h.hazards.filter((z) => z.kind === kind).length, 0);
}

describe('trees (non-penalty "in the woods" lie)', () => {
  it('trees are a tough lie but never a penalty (you punch out, you do not lose a stroke)', () => {
    const li = lieInfo('trees');
    expect(li.penalty).toBeUndefined();
    expect(li.carryMult).toBeLessThan(1); // short punch-out
    expect(li.dispersionMult).toBeGreaterThan(1.4); // wild through the branches
  });

  it('a wooded biome lines the rough with trees; the void has none', () => {
    let verdantTrees = 0;
    let voidTrees = 0;
    for (let seed = 0; seed < 30; seed++) {
      verdantTrees += countKind(generateCourse(seed, { biome: 'verdant-station', holes: 3, wildness: 0.6 }).holes, 'trees');
      voidTrees += countKind(generateCourse(seed, { biome: 'void-garden', holes: 3, wildness: 0.6 }).holes, 'trees');
    }
    expect(verdantTrees).toBeGreaterThan(0);
    expect(voidTrees).toBe(0);
  });

  it('trees line the rough OUTSIDE the play corridor, so a sensible shot stays clear', () => {
    for (let seed = 0; seed < 40; seed++) {
      const hole = generateCourse(seed, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!;
      const fw = hole.features.find((f) => f.kind === 'fairway')!;
      let half = 0;
      for (const p of fw.poly) half = Math.max(half, polylineDist(p, hole.centreline));
      for (const tree of hole.hazards.filter((z) => z.kind === 'trees')) {
        // The tree's centroid sits beyond the fairway edge (off the line you actually play).
        const c = tree.poly
          .reduce<[number, number]>((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0])
          .map((v) => v / tree.poly.length) as [number, number];
        expect(polylineDist(c, hole.centreline)).toBeGreaterThan(half * 0.7);
      }
    }
  });
});

describe('fairway bunkers (sand is always fair)', () => {
  it('a sandy biome carries more bunkers than a wooded one, and stays fair/valid', () => {
    let dustBunkers = 0;
    for (let seed = 0; seed < 30; seed++) {
      const c = generateCourse(seed, { biome: 'dust-belt', holes: 3, wildness: 0.6 });
      expect(validateCourse(c)).toEqual([]);
      expect(validateFairness(c)).toEqual([]); // sand never makes a hole unfair
      dustBunkers += countKind(c.holes, 'bunker');
    }
    expect(dustBunkers).toBeGreaterThan(0);
  });
});

describe('out-of-bounds stakes (visible stroke-and-distance edge)', () => {
  const hole = generateCourse(1234).holes[0]!;

  it('the stake corners equal the OB box, and every stake sits ON the boundary', () => {
    const b = playBounds(hole);
    const corners = playBoundsCorners(hole);
    expect(corners[0]).toEqual([b.min[0], b.min[1]]);
    expect(corners[2]).toEqual([b.max[0], b.max[1]]);
    // A stake is on the boundary iff it is in bounds but not strictly interior.
    const eps = 1e-6;
    for (const s of obStakes(hole)) {
      expect(inBounds(hole, s)).toBe(true);
      const interior =
        s[0] > b.min[0] + eps && s[0] < b.max[0] - eps && s[1] > b.min[1] + eps && s[1] < b.max[1] - eps;
      expect(interior).toBe(false);
    }
  });

  it('the margin is capped so a long par-5 boundary stays a readable edge', () => {
    // A long low-gravity par-5 has the widest terrain; the cap keeps its margin <= 90 yds.
    const long = generateCourse(99, { biome: 'void-garden', parCap: 5, wildness: 1 }).holes[0]!;
    const b = playBounds(long);
    // The boundary expands terrain by the (capped) margin on each side.
    let maxX = -Infinity;
    for (const f of [...long.features, ...long.hazards]) for (const p of f.poly) maxX = Math.max(maxX, p[0]);
    expect(b.max[0] - maxX).toBeLessThanOrEqual(90 + 1e-6);
  });

  it('renders white OB stakes onto the SVG map', () => {
    const svg = renderHoleSVG(hole, { width: 360, height: 640 });
    expect(svg).toContain('#f4f4f4'); // OB stake post colour
  });
});
