import { describe, it, expect } from 'vitest';

import {
  THEMES,
  themesForArc,
  arcForStars,
  arcForDistance,
  archetypeBiome,
  themeBiome,
  themeById,
  pickTheme,
  themeForStop,
  resolveBiome,
  STAR_ARC_BREAKS,
  type BiomeArchetype,
} from '../src/sim/course/themes';
import { BIOMES } from '../src/sim/course/biomes';
import { generateCourse } from '../src/sim/course/generate';
import { lieInfo } from '../src/sim/shot';
import { RARITIES } from '../src/sim/rpg/loot';
import { Rng } from '../src/sim/rng';
import { simulateRun } from '../src/sim/rpg/run';
import { playTotals } from '../src/sim/score';
import { playCourse } from '../src/sim/round';
import { currentCourse, currentTheme, startRun } from '../src/sim/rpg/run';

const ARCHETYPES: BiomeArchetype[] = ['verdant', 'desert', 'frost', 'inferno', 'void'];

describe('theme table integrity', () => {
  it('every theme has a unique, stable id', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every theme uses a known rarity and resolves to a real biome', () => {
    const biomeIds = new Set(BIOMES.map((b) => b.id));
    for (const t of THEMES) {
      expect(RARITIES).toContain(t.rarity);
      expect(ARCHETYPES).toContain(t.archetype);
      expect(biomeIds.has(themeBiome(t))).toBe(true);
    }
  });

  it('every archetype maps to a real biome', () => {
    const biomeIds = new Set(BIOMES.map((b) => b.id));
    for (const a of ARCHETYPES) expect(biomeIds.has(archetypeBiome(a))).toBe(true);
  });

  it('all five archetypes are actually used by the table', () => {
    const used = new Set(THEMES.map((t) => t.archetype));
    for (const a of ARCHETYPES) expect(used.has(a)).toBe(true);
  });
});

describe('arc gating', () => {
  it('constellation arcs are derived from star count (≤5 / 6–7 / 8+)', () => {
    for (const t of THEMES) {
      if (t.kind === 'constellation') {
        expect(t.stars).toBeGreaterThan(0);
        expect(t.arc).toBe(arcForStars(t.stars!));
      }
    }
    // The rebalanced breaks themselves.
    expect(arcForStars(5)).toBe(1);
    expect(arcForStars(STAR_ARC_BREAKS.arc2Min)).toBe(2);
    expect(arcForStars(7)).toBe(2);
    expect(arcForStars(STAR_ARC_BREAKS.arc3Min)).toBe(3);
  });

  it('the 28 constellations split a balanced 9 / 10 / 9 across the arcs', () => {
    const consts = THEMES.filter((t) => t.kind === 'constellation');
    expect(consts.length).toBe(28);
    const counts = [1, 2, 3].map((a) => consts.filter((t) => t.arc === a).length);
    expect(counts).toEqual([9, 10, 9]);
  });

  it('deep-sky/galaxy showpieces are gated to the later arcs (rare→2, epic→3)', () => {
    for (const t of THEMES) {
      if (t.kind === 'deepsky' || t.kind === 'galaxy') {
        expect(t.arc).toBeGreaterThanOrEqual(2);
        if (t.rarity === 'rare') expect(t.arc).toBe(2);
        if (t.rarity === 'epic') expect(t.arc).toBe(3);
      }
    }
    // The two naked-eye galaxies are pinned to arc 3 as late-game grandeur.
    for (const id of ['milky-way-core', 'magellanic-clouds']) {
      expect(themeById(id)!.arc).toBe(3);
    }
  });

  it('every arc has enough variety to not feel repetitive (≥6 themes)', () => {
    for (const a of [1, 2, 3] as const) {
      expect(themesForArc(a).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('stop→arc opens up with galaxy distance, monotonically', () => {
    expect(arcForDistance(0)).toBe(1);
    expect(arcForDistance(5)).toBe(1);
    expect(arcForDistance(6)).toBe(2);
    expect(arcForDistance(14)).toBe(2);
    expect(arcForDistance(15)).toBe(3);
    let prev = 0;
    for (let d = 0; d < 40; d++) {
      const a = arcForDistance(d);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
});

describe('theme selection', () => {
  it('pickTheme is deterministic by rng seed and stays inside the requested arc', () => {
    for (const a of [1, 2, 3] as const) {
      const x = pickTheme(new Rng(`t:${a}`), a);
      const y = pickTheme(new Rng(`t:${a}`), a);
      expect(x.id).toBe(y.id);
      expect(x.arc).toBe(a);
    }
  });

  it('themeForStop is reproducible and respects the stop distance', () => {
    const a = themeForStop(42, 3, 2); // early → arc 1
    const b = themeForStop(42, 3, 2);
    expect(a.id).toBe(b.id);
    expect(a.arc).toBe(1);
    expect(themeForStop(42, 9, 20).arc).toBe(3); // deep → arc 3
  });

  it('rarer themes really are scarcer in the draw (legendary feels legendary)', () => {
    // Arc 3 mixes common constellations with epic showpieces; sample the distribution.
    let common = 0;
    let epic = 0;
    for (let i = 0; i < 4000; i++) {
      const r = pickTheme(new Rng(`draw:${i}`), 3).rarity;
      if (r === 'common') common++;
      else if (r === 'epic') epic++;
    }
    // Epic showpieces should surface, but far less often than common figures.
    expect(epic).toBeGreaterThan(0);
    expect(common).toBeGreaterThan(epic * 2);
  });
});

describe('rarity-tiered, theme-flavoured biomes (GS-17b)', () => {
  it('resolveBiome keeps the archetype id (palette stays valid) and only known lie kinds', () => {
    const ids = new Set(BIOMES.map((b) => b.id));
    for (const t of THEMES) {
      const b = resolveBiome(t);
      expect(b.id).toBe(archetypeBiome(t.archetype));
      expect(ids.has(b.id)).toBe(true);
      // Scatter kinds are inherited from the archetype, so they must still have LIE_INFO rows.
      for (const s of b.scatter) expect(() => lieInfo(s.kind)).not.toThrow();
    }
  });

  it('every resolved field stays inside the clamped fair range', () => {
    for (const t of THEMES) {
      const b = resolveBiome(t);
      expect(b.carryMult).toBeGreaterThanOrEqual(0.8);
      expect(b.carryMult).toBeLessThanOrEqual(1.6);
      expect(b.fairwayWidthMult).toBeGreaterThanOrEqual(0.72);
      expect(b.windWild).toBeLessThanOrEqual(40);
      expect(b.doglegBias).toBeLessThanOrEqual(0.6);
      expect(b.treeDensity ?? 0).toBeLessThanOrEqual(3.2);
      expect(b.fairwayBunkers ?? 0).toBeLessThanOrEqual(3.5);
    }
  });

  it('rarer themes really play more intense than a common one of the same archetype', () => {
    // A common inferno (Orion) vs an epic inferno (Eta Carinae): the epic reads wilder.
    const common = resolveBiome(themeById('orion')!);
    const epic = resolveBiome(themeById('eta-carinae')!);
    expect(epic.windWild).toBeGreaterThan(common.windWild);
    // And the void's signature gravity is more extreme for the galactic core than a common void.
    const pegasus = resolveBiome(themeById('pegasus')!); // common void
    const core = resolveBiome(themeById('milky-way-core')!); // epic void galaxy
    expect(core.carryMult).toBeGreaterThan(pegasus.carryMult);
    expect(core.carryJitter).toBeGreaterThan(pegasus.carryJitter);
  });

  it('NO systemic death-spiral across EVERY theme at max wildness', () => {
    // The real guarantee for GS-17b: each theme's resolved biome must clear the fairness bar.
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (const t of THEMES) {
      const biomeRow = resolveBiome(t);
      for (let seed = 0; seed < 25; seed++) {
        const course = generateCourse(seed + 500, { biomeRow, holes: 3, wildness: 1 });
        for (const p of playCourse(course.holes, new Rng(`${t.id}:${seed}:p`))) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.record.strokes >= 10) blowups++;
        }
      }
    }
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(blowups / holes).toBeLessThan(0.05);
  });
});

describe('theme → course wiring', () => {
  it('currentCourse generates from the theme’s biome and tags the theme id', () => {
    const run = startRun(7);
    const theme = currentTheme(run);
    const course = currentCourse(run);
    expect(course.meta.themeId).toBe(theme.id);
    expect(course.biome).toBe(themeBiome(theme));
  });

  it('a full themed run still terminates and clears the no-death-spiral bar', () => {
    // Theme selection forces the biome per stop; re-prove the balance invariant holds.
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (let s = 0; s < 30; s++) {
      let run = startRun(`balance:${s}`);
      // Walk a few stops, always taking the deepest jump to push into later arcs.
      for (let stop = 0; stop < 6 && run.status === 'active'; stop++) {
        const course = currentCourse(run);
        const played = playCourse(course.holes, new Rng(`${course.seed}:play`), {
          bag: run.loadout.bag,
        });
        for (const p of played) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.record.strokes >= 10) blowups++;
        }
        const totals = playTotals(played.map((p) => p.record));
        // Advance distance to climb arcs without depending on the cut.
        run = { ...run, stopIndex: run.stopIndex + 1, distanceFromStart: run.distanceFromStart + 3 };
        void totals;
      }
    }
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(blowups / holes).toBeLessThan(0.05);
  });

  it('themed runs simulate end-to-end deterministically', () => {
    const a = simulateRun('themed-run');
    const b = simulateRun('themed-run');
    expect(a.stops.map((s) => s.themeId)).toEqual(b.stops.map((s) => s.themeId));
    // Every played stop carries a theme tag.
    for (const s of a.stops) expect(typeof s.themeId).toBe('string');
  });
});
