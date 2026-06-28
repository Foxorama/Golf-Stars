import { describe, it, expect } from 'vitest';
import { startRun, currentCourse, travel, routeOptions } from '../src/sim/rpg/run';
import { getFormat } from '../src/sim/rpg/formats';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';

const voyage = getFormat('voyage');

describe('multi-biome split stops (GS-variation)', () => {
  it('the voyage varies stop SIZE (not a uniform 6/6/6)', () => {
    const sizes = new Set(voyage.stops.map((s) => s.holes));
    expect(sizes.size).toBeGreaterThan(1);
    expect(voyage.stops.some((s) => s.splitBiome)).toBe(true);
  });

  it('a split-biome stop crosses TWO worlds (front + back holes differ), and is fair', () => {
    // Stop 1 is the first splitBiome stop.
    let run = startRun(2026, 'voyage', {}, 'feather-fade');
    run = travel(run, routeOptions(run)[0]!);
    const c = currentCourse(run); // generateCourse throws if either half is unfair → building proves it
    expect(c.meta.split).toBeTruthy();
    const front = c.meta.split!.frontHoles;
    const frontThemes = new Set(c.holes.slice(0, front).map((h) => h.themeId));
    const backThemes = new Set(c.holes.slice(front).map((h) => h.themeId));
    expect(frontThemes.size).toBe(1);
    expect(backThemes.size).toBe(1);
    expect([...frontThemes][0]).not.toBe([...backThemes][0]); // two distinct worlds
    // Each hole carries its own biome render key.
    expect(c.holes.every((h) => typeof h.biome === 'string')).toBe(true);
  });

  it('a split stop is deterministic (same run → same two worlds)', () => {
    const mk = () => {
      let run = startRun(2026, 'voyage', {}, 'feather-fade');
      run = travel(run, routeOptions(run)[0]!);
      return currentCourse(run);
    };
    expect(mk().meta.split).toEqual(mk().meta.split);
  });

  it('a split stop still plays to a sane score (no death-spiral)', () => {
    let run = startRun(2026, 'voyage', {}, 'feather-fade');
    run = travel(run, routeOptions(run)[0]!);
    const c = currentCourse(run);
    const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {});
    const t = playTotals(played.map((p) => p.record));
    expect(t.toPar / c.holes.length).toBeLessThan(1.5); // relaxed bar; deep-arc auto AI
  });
});
