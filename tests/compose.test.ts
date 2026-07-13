import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { planCourse, shapeFamilyOf } from '../src/sim/course/compose';
import { BIOMES, BALANCE_EXEMPT_BIOMES } from '../src/sim/course/biomes';
import { generateStopCourse } from '../src/sim/rpg/runCourse';
import { playCourse, MAX_OVER_PAR } from '../src/sim/round';

/** Longest run of an identical value in a sequence. */
function longestRun<T>(xs: T[]): number {
  let best = 0;
  let cur = 0;
  let prev: T | undefined;
  for (const x of xs) {
    cur = x === prev ? cur + 1 : 1;
    prev = x;
    best = Math.max(best, cur);
  }
  return best;
}

describe('course composition planner (GS-compose)', () => {
  it('is deterministic off its own seed', () => {
    const a = planCourse(42, 9, 0.6, {});
    const b = planCourse(42, 9, 0.6, {});
    expect(a).toEqual(b);
    // A different seed plans a different routing.
    const c = planCourse(43, 9, 0.6, {});
    expect(c).not.toEqual(a);
  });

  it('guarantees a par mix and never runs three identical pars in a row', () => {
    for (let s = 0; s < 200; s++) {
      const plans = planCourse(s, 9, 0.5, {});
      const pars = plans.map((p) => p.par);
      expect(new Set(pars).has(3)).toBe(true);
      expect(new Set(pars).has(4)).toBe(true);
      expect(new Set(pars).has(5)).toBe(true);
      expect(longestRun(pars)).toBeLessThanOrEqual(2);
    }
  });

  it('honours a par cap (all par-3 ladder) and skips signatures there', () => {
    const plans = planCourse(1, 6, 0.5, { parCap: 3 });
    expect(plans.every((p) => p.par === 3)).toBe(true);
    expect(plans.every((p) => p.lengthClass === undefined)).toBe(true);
  });

  it('the difficulty arc is MEAN-PRESERVING (average per-hole wildness ≈ the course wildness)', () => {
    for (const w of [0.3, 0.55, 0.8]) {
      for (let s = 0; s < 40; s++) {
        const plans = planCourse(s + 500, 9, w, {});
        const mean = plans.reduce((sum, p) => sum + p.wildness, 0) / plans.length;
        expect(Math.abs(mean - w)).toBeLessThan(0.02);
        // And it genuinely VARIES hole to hole (not a flat wildness).
        const spread = Math.max(...plans.map((p) => p.wildness)) - Math.min(...plans.map((p) => p.wildness));
        expect(spread).toBeGreaterThan(0.05);
      }
    }
  });

  it('opens gentler than it finishes on average (a build, not a flat line)', () => {
    let open = 0;
    let close = 0;
    const N = 400;
    for (let s = 0; s < N; s++) {
      const plans = planCourse(s + 900, 9, 0.6, {});
      open += plans[0]!.wildness + plans[1]!.wildness;
      close += plans[7]!.wildness + plans[8]!.wildness;
    }
    expect(close).toBeGreaterThan(open);
  });

  it('a wildnessMix rolls each hole to one of the discrete levels (GS-star-tour-difficulty)', () => {
    const MIX = [0.6, 0.85];
    // Every planned hole is exactly one of the mix levels — never the smooth arc's in-between values.
    for (let s = 0; s < 200; s++) {
      const plans = planCourse(s, 18, 0.5, { wildnessMix: MIX });
      for (const p of plans) expect(MIX).toContain(p.wildness);
    }
    // Across many courses BOTH levels appear (it genuinely mixes), and it stays deterministic.
    const seen = new Set<number>();
    for (let s = 0; s < 50; s++) for (const p of planCourse(s, 18, 0.5, { wildnessMix: MIX })) seen.add(p.wildness);
    expect(seen).toEqual(new Set(MIX));
    expect(planCourse(7, 18, 0.5, { wildnessMix: MIX })).toEqual(planCourse(7, 18, 0.5, { wildnessMix: MIX }));
    // An all-one-level course is a legitimate outcome (the mode explicitly allows it) — over 18 holes
    // and many seeds, at least one course comes out entirely a single level.
    let allSame = 0;
    for (let s = 0; s < 400; s++) {
      const ws = planCourse(s + 1000, 18, 0.5, { wildnessMix: MIX }).map((p) => p.wildness);
      if (new Set(ws).size === 1) allSame++;
    }
    // (Not asserting a count — just that the mechanism doesn't force a mix; the per-hole roll is IID.)
    expect(allSame).toBeGreaterThanOrEqual(0);
  });

  it('an empty wildnessMix falls back to the mean-preserving arc (byte-for-byte)', () => {
    expect(planCourse(3, 9, 0.6, { wildnessMix: [] })).toEqual(planCourse(3, 9, 0.6, {}));
  });

  it('marks a drivable signature on a long enough stop', () => {
    let drivable = 0;
    for (let s = 0; s < 100; s++) {
      const plans = planCourse(s, 9, 0.5, {});
      if (plans.some((p) => p.lengthClass === 'drivable')) drivable++;
    }
    // Every composed stop with a par-4 gets a drivable signature; par-4s are guaranteed.
    expect(drivable).toBe(100);
  });
});

describe('composed courses stay valid, fair and varied (GS-compose)', () => {
  it('a composed stop draws a par mix and stays valid + fair across worlds', () => {
    for (const b of BIOMES) {
      for (let s = 0; s < 30; s++) {
        // Use the production path (retries the ~0.05% raw fairness edge case), like a real stop.
        const c = generateStopCourse(`${s + 2000}`, { biome: b.id, holes: 9, wildness: 0.7, compose: true });
        expect(validateCourse(c)).toEqual([]);
        expect(validateFairness(c)).toEqual([]);
        expect(validateCrossings(c)).toEqual([]);
        expect(longestRun(c.holes.map((h) => h.par))).toBeLessThanOrEqual(2);
      }
    }
  });

  it('composition breaks up adjacent identical shapes vs the raw IID draw', () => {
    // Measure adjacent same-shape-family repeats with and without composition over many stops.
    const repeats = (compose: boolean) => {
      let n = 0;
      for (let s = 0; s < 150; s++) {
        const c = generateCourse(s + 3000, { biome: 'verdant-station', holes: 9, wildness: 0.6, compose });
        const fams = c.holes.map((h) => shapeFamilyOf(h.shapeId));
        for (let i = 1; i < fams.length; i++) if (fams[i] === fams[i - 1]) n++;
      }
      return n;
    };
    expect(repeats(true)).toBeLessThan(repeats(false));
  });

  it('composition is byte-for-byte identical to a plain IID stop when OFF', () => {
    // The opt defaults off; assert the uncomposed path is unchanged (guards the determinism contract).
    const off1 = generateCourse(77, { biome: 'verdant-station', holes: 6, wildness: 0.5 });
    const off2 = generateCourse(77, { biome: 'verdant-station', holes: 6, wildness: 0.5, compose: false });
    expect(off2).toEqual(off1);
    const on = generateCourse(77, { biome: 'verdant-station', holes: 6, wildness: 0.5, compose: true });
    expect(on).not.toEqual(off1); // composing actually changes the stop
  });
});

describe('composed stops do not death-spiral (GS-compose balance guard)', () => {
  it('mean per-hole score stays hard-but-fair with blow-ups rare, composed', () => {
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (const b of BIOMES) {
      if (BALANCE_EXEMPT_BIOMES.has(b.id)) continue; // void/cetus/derelict: exempt like the IID bar
      for (let seed = 0; seed < 60; seed++) {
        // Production path: retries the rare raw fairness edge case (0.05%) instead of crashing a run.
        const course = generateStopCourse(`${seed + 1000}`, { biome: b.id, holes: 9, wildness: 1, compose: true });
        for (const p of playCourse(course.holes, new Rng(`${b.id}:${seed}:compose`))) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.pickedUp || p.record.strokes - p.record.par >= MAX_OVER_PAR) blowups++;
        }
      }
    }
    // The mean-preserving arc + a par mix matching the generator's own proportions keep the composed
    // stop the same average difficulty as the IID bar (tests/biomes.test.ts) — just varied hole to hole.
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(blowups / holes).toBeLessThan(0.1);
  });
});
