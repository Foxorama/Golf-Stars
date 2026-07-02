import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { pointInPoly, type Vec } from '../src/sim/course/contract';
import { landPolysCourseFor } from '../src/render/style';

/**
 * GS-hazard-blend guards.
 *
 * 1. Hazards must not spawn ON a different-substance hazard (water stamped over a bunker, sand
 *    over lava…) — trees are the ONE exception (anything may sit under a canopy), and the
 *    sanctioned forced-carry crossings always win a clash. Same-family overlaps are legal by
 *    design: the render merges them into one body (a creek pooling into its lake, pot chains).
 *
 * 2. On a LOST-rough hole (void/cetus deep) every play feature must sit fully ON a land platform —
 *    the platform dilation must cover fairway, green and tee with margin (the old mitred outset
 *    folded at concave bends and left "star gaps" between the fairway and its border, and the
 *    green could overhang the deep entirely).
 */

const FAMILY: Record<string, string> = {
  bunker: 'sand',
  pot: 'sand',
  waste: 'sand',
  sand: 'sand',
  water: 'water',
  creek: 'water',
  frozenpond: 'water',
  lava: 'lava',
  lavariver: 'lava',
  barranca: 'ravine',
  fescue: 'fescue',
  trees: 'trees',
};

function segsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o = (p: Vec, q: Vec, r: Vec) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function polysOverlap(a: Vec[], b: Vec[]): boolean {
  for (const p of a) if (pointInPoly(p, b)) return true;
  for (const p of b) if (pointInPoly(p, a)) return true;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segsCross(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  return false;
}

describe('cross-family hazard overlap dedupe (GS-hazard-blend)', () => {
  it('no hazard overlaps a DIFFERENT-substance hazard (trees exempt), across biomes and seeds', () => {
    for (const biome of ['verdant-station', 'ember-world', 'frost-hollow', 'dust-belt', 'tide-hollow', 'prism-reach']) {
      for (let seed = 1; seed <= 25; seed++) {
        const c = generateCourse(seed * 31, { biome, holes: 3, wildness: 0.85 });
        for (const h of c.holes) {
          const solid = h.hazards.filter((z) => z.kind !== 'trees');
          for (let i = 0; i < solid.length; i++) {
            for (let j = i + 1; j < solid.length; j++) {
              const a = solid[i]!;
              const b = solid[j]!;
              if (FAMILY[a.kind] === FAMILY[b.kind]) continue; // same substance merges in render
              expect(
                polysOverlap(a.poly, b.poly),
                `${biome} seed ${seed * 31}: ${a.kind} overlaps ${b.kind}`,
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  it('trees still overlap freely (the sanctioned exception) somewhere in a wooded sample', () => {
    // Sanity check the dedupe did NOT also separate trees: overlapping canopies stay plentiful.
    let treeOverlaps = 0;
    for (let seed = 1; seed <= 10 && treeOverlaps === 0; seed++) {
      const c = generateCourse(seed * 7, { biome: 'verdant-station', holes: 3, wildness: 0.8 });
      for (const h of c.holes) {
        const trees = h.hazards.filter((z) => z.kind === 'trees');
        for (let i = 0; i < trees.length && treeOverlaps === 0; i++) {
          for (let j = i + 1; j < trees.length; j++) {
            if (polysOverlap(trees[i]!.poly, trees[j]!.poly)) {
              treeOverlaps++;
              break;
            }
          }
        }
      }
    }
    expect(treeOverlaps).toBeGreaterThan(0);
  });

  it('forced-carry crossings survive the dedupe (they are load-bearing)', () => {
    let crossings = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const c = generateCourse(seed * 13, { biome: 'ember-world', holes: 4, wildness: 0.8 });
      for (const h of c.holes) crossings += h.hazards.filter((z) => z.kind === 'lavariver').length;
    }
    expect(crossings).toBeGreaterThan(0);
  });
});

describe('lost-rough land platforms cover the play features (GS-hazard-blend / star-gap fix)', () => {
  it('every fairway/green/tee vertex of a lost hole sits INSIDE a platform', () => {
    let lostHoles = 0;
    for (const biome of ['void-garden', 'cetus-deep']) {
      for (let seed = 1; seed <= 12; seed++) {
        const c = generateCourse(seed * 17, { biome, holes: 3, wildness: 0.9 });
        for (const h of c.holes) {
          if (!h.biomeMods?.some((m) => m.kind === 'roughLie')) continue;
          lostHoles++;
          const platforms = landPolysCourseFor(h);
          expect(platforms.length).toBeGreaterThan(0);
          for (const f of h.features) {
            if (f.kind !== 'fairway' && f.kind !== 'green' && f.kind !== 'tee') continue;
            for (const p of f.poly) {
              expect(
                platforms.some((plat) => pointInPoly(p, plat)),
                `${biome} seed ${seed * 17}: a ${f.kind} vertex overhangs the deep`,
              ).toBe(true);
            }
          }
        }
      }
    }
    expect(lostHoles).toBeGreaterThan(0);
  });
});
