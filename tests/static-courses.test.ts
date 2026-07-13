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
  staticCourseSpec,
  STATIC_COURSES,
  METAL_18_ID,
} from '../src/sim/course/staticCourses';

describe('static course library (GS-static-courses)', () => {
  it('metal-18 is a complete, contract-valid 18-hole Scrap Belt course', () => {
    const c = metalEighteen();
    expect(c.holes).toHaveLength(18);
    expect(c.biome).toBe('scrap-belt'); // the metal archetype
    expect(c.meta.name).toBe('Antlia Scrapworks');
    // Passes every generator validator (fairness by construction, contract 3).
    expect(validateCourse(c)).toEqual([]);
    expect(validateFairness(c)).toEqual([]);
    expect(validateCrossings(c)).toEqual([]);
    expect(validateGreenApproach(c)).toEqual([]);
    expect(validateIslandHops(c)).toEqual([]);
  });

  it('is a designed par-71 routing (front 35 / back 36, 5 par-3 · 9 par-4 · 4 par-5)', () => {
    const pars = metalEighteen().holes.map((h) => h.par);
    expect(pars.reduce((a, b) => a + b, 0)).toBe(71);
    expect(pars.slice(0, 9).reduce((a, b) => a + b, 0)).toBe(35);
    expect(pars.slice(9).reduce((a, b) => a + b, 0)).toBe(36);
    expect(pars.filter((p) => p === 3)).toHaveLength(5);
    expect(pars.filter((p) => p === 4)).toHaveLength(9);
    expect(pars.filter((p) => p === 5)).toHaveLength(4);
    // No par repeats three times in a row (the composer's contrast rule).
    for (let i = 2; i < pars.length; i++) {
      expect(pars[i] === pars[i - 1] && pars[i] === pars[i - 2]).toBe(false);
    }
    // Every hole has real length (the low-gravity carryMult scales holes up but keeps them finite).
    for (const h of metalEighteen().holes) expect(holeYardage(h)).toBeGreaterThan(100);
  });

  it('is STATIC — byte-identical every build (deterministic within a generator version)', () => {
    expect(JSON.stringify(metalEighteen())).toBe(JSON.stringify(metalEighteen()));
    expect(JSON.stringify(buildStaticCourse(METAL_18_ID))).toBe(JSON.stringify(metalEighteen()));
  });

  it('catalogue lookups resolve and unknown ids throw', () => {
    expect(staticCourseSpec(METAL_18_ID)?.name).toBe('Antlia Scrapworks');
    expect(staticCourseSpec('no-such-course')).toBeUndefined();
    expect(() => buildStaticCourse('no-such-course')).toThrow(/unknown static course/);
    // Every catalogue row builds cleanly.
    for (const spec of STATIC_COURSES) {
      const c = buildStaticCourse(spec);
      expect(validateCourse(c)).toEqual([]);
      expect(c.meta.name).toBe(spec.name);
    }
  });
});
