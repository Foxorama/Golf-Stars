import { describe, it, expect } from 'vitest';
import { startRun, travel, routeOptions, routeTheme, currentTheme, currentCourse, type Run } from '../src/sim/rpg/run';
import { themesForArc, themeById, arcForDistance, type BiomeArchetype } from '../src/sim/course/themes';

/**
 * GS-journey-variety: the three branch planets on the journey map must be three genuinely DIFFERENT
 * worlds — and none of them the world you're standing on — so a jump is a real choice of destination,
 * not "ember world / ember world / ember world". Guaranteed by construction (a colliding lane redraws
 * over the arc pool filtered to unused archetypes), so these are hard asserts, not statistics.
 */

describe('journey lane biome variety (GS-journey-variety)', () => {
  it('every arc offers enough archetypes for three distinct lanes plus the current world', () => {
    for (const arc of [1, 2, 3] as const) {
      const archetypes = new Set(themesForArc(arc).map((t) => t.archetype));
      expect(archetypes.size, `arc ${arc}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('the three lanes land three DISTINCT archetypes, none the world you are on', () => {
    for (let seed = 1; seed <= 12; seed++) {
      let run: Run = startRun(seed, 'voyage');
      for (let hop = 0; hop < 6 && run.status === 'active'; hop++) {
        const routes = routeOptions(run);
        const here = currentTheme(run).archetype;
        const lanes = routes.map((r) => r.theme.archetype);
        expect(new Set(lanes).size, `seed ${seed} hop ${hop}: ${lanes.join(',')}`).toBe(routes.length);
        expect(lanes, `seed ${seed} hop ${hop}: on ${here}`).not.toContain(here);
        run = travel(run, routes[(seed + hop) % routes.length]!);
      }
    }
  });

  it('routeOptions stays deterministic with the avoid-set threaded', () => {
    let run = startRun(99, 'voyage');
    run = travel(run, routeOptions(run)[1]!);
    const a = routeOptions(run).map((r) => r.theme.id);
    const b = routeOptions(run).map((r) => r.theme.id);
    expect(a).toEqual(b);
  });

  it('routeTheme honours an avoid set and falls back to the first draw only when impossible', () => {
    const all = new Set(themesForArc(arcForDistance(0)).map((t) => t.archetype));
    // Avoiding everything is impossible → the plain first draw stands (a theme is always returned).
    const blocked = routeTheme('s', 0, 0, 0, all as ReadonlySet<BiomeArchetype>);
    expect(routeTheme('s', 0, 0, 0)).toEqual(blocked);
    // Avoiding just the first draw's archetype yields a different archetype, deterministically.
    const first = routeTheme('s', 0, 0, 0);
    const dodged = routeTheme('s', 0, 0, 0, new Set([first.archetype]));
    expect(dodged.archetype).not.toBe(first.archetype);
    expect(routeTheme('s', 0, 0, 0, new Set([first.archetype]))).toEqual(dodged);
  });

  it('a split stop crosses two DIFFERENT archetypes (voyage "two worlds" stops, several seeds)', () => {
    // Voyage stop 1 ("Orbit II · two worlds") is a split-biome stop (GS-variation).
    for (let seed = 1; seed <= 10; seed++) {
      let run: Run = startRun(seed, 'voyage');
      run = travel(run, routeOptions(run)[seed % 3]!);
      const c = currentCourse(run);
      expect(c.meta.split, `seed ${seed}: stop 1 should be the two-worlds stop`).toBeDefined();
      const arch = (id: string | undefined) => (id ? themeById(id)?.archetype : undefined);
      const front = arch(c.holes[0]!.themeId);
      const back = arch(c.holes[c.holes.length - 1]!.themeId);
      expect(front, `seed ${seed}`).toBeDefined();
      expect(back, `seed ${seed}`).toBeDefined();
      expect(front, `seed ${seed}: ${front} vs ${back}`).not.toBe(back);
    }
  });
});
