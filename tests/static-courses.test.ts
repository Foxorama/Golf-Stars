import { describe, it, expect } from 'vitest';
import { validateCourse, type Vec } from '../src/sim/course/contract';
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

describe('static course library (GS-static-courses)', () => {
  it('metal-18 (frozen) is a complete, contract-valid 18-hole Scrap Belt course', () => {
    const c = metalEighteen();
    expect(c.holes).toHaveLength(18);
    expect(c.biome).toBe('scrap-belt'); // the metal archetype
    expect(c.meta.name).toBe('Antlia Scrapworks');
    expect(validators(c)).toEqual([]); // fairness by construction (contract 3)
  });

  it('is a designed par-71 routing (front 35 / back 36, 5 par-3 · 9 par-4 · 4 par-5)', () => {
    const pars = metalEighteen().holes.map((h) => h.par);
    expect(parStats(pars)).toEqual({ total: 71, front: 35, back: 36, p3: 5, p4: 9, p5: 4 });
    // No par repeats three times in a row (the composer's contrast rule).
    for (let i = 2; i < pars.length; i++) {
      expect(pars[i] === pars[i - 1] && pars[i] === pars[i - 2]).toBe(false);
    }
    for (const h of metalEighteen().holes) expect(holeYardage(h)).toBeGreaterThan(100);
  });

  it('is served from FROZEN data — stable, minified-precision, independent copies', () => {
    // Every build is byte-identical (the whole point of freezing).
    expect(JSON.stringify(metalEighteen())).toBe(JSON.stringify(buildStaticCourse(METAL_18_ID)));
    // Frozen coords were rounded to 3 decimals by the freezer — no 15-digit float noise.
    const coords: number[] = [];
    for (const h of metalEighteen().holes)
      for (const f of [...h.features, ...h.hazards])
        for (const p of f.poly as Vec[]) coords.push(p[0], p[1]);
    expect(coords.length).toBeGreaterThan(0);
    for (const n of coords) expect(Math.round(n * 1000) / 1000).toBe(n);
    // Each build is an independent deep copy — mutating one must not corrupt the shared singleton.
    const a = metalEighteen();
    a.holes[0]!.tents = true;
    (a.meta as { name: string }).name = 'MUTATED';
    const b = metalEighteen();
    expect(b.holes[0]!.tents).toBeUndefined();
    expect(b.meta.name).toBe('Antlia Scrapworks');
  });

  it('regenerate escape hatch rebuilds a valid par-71 course from the spec (redesign / rebalance)', () => {
    const r = buildStaticCourse(METAL_18_ID, { regenerate: true });
    expect(r.holes).toHaveLength(18);
    expect(r.biome).toBe('scrap-belt');
    expect(r.meta.name).toBe('Antlia Scrapworks');
    expect(validators(r)).toEqual([]);
    expect(parStats(r.holes.map((h) => h.par))).toEqual({ total: 71, front: 35, back: 36, p3: 5, p4: 9, p5: 4 });
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
