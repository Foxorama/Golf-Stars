import { describe, it, expect } from 'vitest';
import { validateCourse } from '../src/sim/course/contract';
import {
  validateFairness,
  validateCrossings,
  validateGreenApproach,
  validateIslandHops,
  holeYardage,
} from '../src/sim/course/generate';
import {
  buildStaticCourse,
  metalEighteen,
  regenerateStaticCourse,
  staticCourseSpec,
  STATIC_COURSES,
  METAL_18_ID,
} from '../src/sim/course/staticCourses';

const validators = (c: ReturnType<typeof metalEighteen>) => [
  ...validateCourse(c),
  ...validateFairness(c),
  ...validateCrossings(c),
  ...validateGreenApproach(c),
  ...validateIslandHops(c),
];

const parStats = (pars: number[]) => ({
  total: pars.reduce((a, b) => a + b, 0),
  front: pars.slice(0, 9).reduce((a, b) => a + b, 0),
  back: pars.slice(9).reduce((a, b) => a + b, 0),
  p3: pars.filter((p) => p === 3).length,
  p4: pars.filter((p) => p === 4).length,
  p5: pars.filter((p) => p === 5).length,
});

/** A valid 18-hole static routing: par in the designed 69–73 band, sums add up, has par-3/4/5 variety
 *  and no par repeats three times in a row (the composer's contrast rule). Static courses are UNFROZEN
 *  (GS-biome-variety), so a course's exact par shifts with the per-world design — the identity is a
 *  VALID varied routing in the band, not one pinned number. */
function expectValidRouting(pars: number[]) {
  const s = parStats(pars);
  expect(pars).toHaveLength(18);
  expect(s.front + s.back).toBe(s.total);
  expect(s.p3 + s.p4 + s.p5).toBe(18);
  expect(s.total).toBeGreaterThanOrEqual(69);
  expect(s.total).toBeLessThanOrEqual(73);
  expect(s.p3).toBeGreaterThan(0); // has short holes
  expect(s.p5).toBeGreaterThan(0); // has long holes
  for (let i = 2; i < pars.length; i++) {
    expect(pars[i] === pars[i - 1] && pars[i] === pars[i - 2]).toBe(false);
  }
}

describe('static course library (GS-static-courses)', () => {
  it('metal-18 is a complete, contract-valid 18-hole Scrap Belt course', () => {
    const c = metalEighteen();
    expect(c.holes).toHaveLength(18);
    expect(c.biome).toBe('scrap-belt'); // the metal archetype
    expect(c.meta.name).toBe('Antlia Scrapworks');
    expect(validators(c)).toEqual([]); // fairness by construction (contract 3)
  });

  it('is a designed, varied 18-hole routing (par in the 69–73 band, real 3/4/5 mix, no par-triples)', () => {
    const pars = metalEighteen().holes.map((h) => h.par);
    expectValidRouting(pars);
    for (const h of metalEighteen().holes) expect(holeYardage(h)).toBeGreaterThan(100);
  });

  it('is UNFROZEN but DETERMINISTIC — regenerated from its spec, identical build-to-build, independent copies', () => {
    // No course is frozen (GS-biome-variety); a build regenerates from the pinned spec, so it is
    // deterministic within a generator version — the same layout every play.
    expect(JSON.stringify(metalEighteen())).toBe(JSON.stringify(buildStaticCourse(METAL_18_ID)));
    // The frozen/regenerate flag is a no-op today: both paths regenerate identically.
    expect(JSON.stringify(buildStaticCourse(METAL_18_ID, { regenerate: true }))).toBe(JSON.stringify(metalEighteen()));
    // Each build is an independent object — mutating one must not corrupt another.
    const a = metalEighteen();
    a.holes[0]!.tents = true;
    (a.meta as { name: string }).name = 'MUTATED';
    const b = metalEighteen();
    expect(b.holes[0]!.tents).toBeUndefined();
    expect(b.meta.name).toBe('Antlia Scrapworks');
  });

  it('regenerate escape hatch rebuilds a valid course from the spec (redesign / rebalance)', () => {
    const r = buildStaticCourse(METAL_18_ID, { regenerate: true });
    expect(r.holes).toHaveLength(18);
    expect(r.biome).toBe('scrap-belt');
    expect(r.meta.name).toBe('Antlia Scrapworks');
    expect(validators(r)).toEqual([]);
    expectValidRouting(r.holes.map((h) => h.par));
    // Regeneration is deterministic (same spec + version → identical), so a redesign is reproducible.
    expect(JSON.stringify(regenerateStaticCourse(METAL_18_ID))).toBe(JSON.stringify(r));
  });

  it('catalogue lookups resolve; unknown ids throw on both paths', () => {
    expect(staticCourseSpec(METAL_18_ID)?.name).toBe('Antlia Scrapworks');
    expect(staticCourseSpec('no-such-course')).toBeUndefined();
    expect(() => buildStaticCourse('no-such-course')).toThrow(/unknown static course/);
    expect(() => regenerateStaticCourse('no-such-course')).toThrow(/unknown static course/);
    // Every catalogue row plays (frozen or, if unfrozen, from source) and regenerates cleanly.
    for (const spec of STATIC_COURSES) {
      expect(validators(buildStaticCourse(spec))).toEqual([]);
      expect(validators(buildStaticCourse(spec, { regenerate: true }))).toEqual([]);
      expect(buildStaticCourse(spec).meta.name).toBe(spec.name);
    }
  });
});
