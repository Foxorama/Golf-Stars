import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse, type Hole } from '../src/sim/course/contract';
import { BIOMES, biomeById } from '../src/sim/course/biomes';
import { THEMES, archetypeBiome, themeBiome, type BiomeArchetype } from '../src/sim/course/themes';
import { ZONES, PROS } from '../src/sim/course/zones';
import { ARCHETYPE_TURF, ARCHETYPE_SPACE } from '../src/render/palette';
import { zoneHeroSVG } from '../src/render/zoneHero';
import { championFor } from '../src/sim/rpg/golfers';

const NEW: BiomeArchetype[] = ['crystal', 'tempest', 'fungal', 'ocean'];
const NEW_BIOMES = ['crystal-spires', 'tempest-reach', 'spore-jungle', 'tidal-archipelago'];

function countKind(holes: Hole[], kind: string): number {
  return holes.reduce((n, h) => n + h.hazards.filter((z) => z.kind === kind).length + h.features.filter((f) => f.kind === kind).length, 0);
}

describe('new biome worlds (GS-worlds)', () => {
  it('each new biome generates valid, fair, carryable courses across seeds & wildness', () => {
    for (const biome of NEW_BIOMES) {
      for (let s = 0; s < 40; s++) {
        for (const wild of [0.2, 0.6, 1]) {
          const c = generateCourse(s + 31000, { biome, holes: 4, wildness: wild });
          expect(validateCourse(c), `${biome}@${wild}`).toEqual([]);
          expect(validateFairness(c), `${biome}@${wild}`).toEqual([]);
          expect(validateCrossings(c), `${biome}@${wild}`).toEqual([]);
        }
      }
    }
  });

  it('every new archetype is fully wired (biome, zone, pro, turf, space, hero, theme, champion)', () => {
    const biomeIds = new Set(BIOMES.map((b) => b.id));
    for (const a of NEW) {
      expect(biomeIds.has(archetypeBiome(a)), `biome for ${a}`).toBe(true);
      expect(ZONES[a]).toBeDefined();
      expect(PROS[a].name.length).toBeGreaterThan(0);
      expect(ARCHETYPE_TURF[a].fairway.base).toMatch(/^#/);
      expect(ARCHETYPE_SPACE[a].base).toMatch(/^#/);
      expect(zoneHeroSVG(a).length).toBeGreaterThan(100); // a real scene, not the void fallback
      const themes = THEMES.filter((t) => t.archetype === a);
      expect(themes.length, `themes for ${a}`).toBeGreaterThan(0);
      for (const t of themes) {
        expect(biomeIds.has(themeBiome(t))).toBe(true);
        if (t.kind === 'constellation') expect(championFor(t.id), `champion for ${t.id}`).toBeDefined();
      }
    }
  });

  it('the worlds have DISTINCT signatures, not just recolours', () => {
    const tempest = biomeById('tempest-reach')!;
    const verdant = biomeById('verdant-station')!;
    const fungal = biomeById('spore-jungle')!;
    const crystal = biomeById('crystal-spires')!;
    const ocean = biomeById('tidal-archipelago')!;
    // Tempest is windy: a constant gale even at wildness 0.
    expect(tempest.windBase).toBeGreaterThan(verdant.windBase);
    // Fungal is the densest tree world.
    expect(fungal.treeDensity!).toBeGreaterThanOrEqual(Math.max(...BIOMES.map((b) => b.treeDensity ?? 0)));
    // Crystal is paved in true crystal scatter.
    const crystalScatter = crystal.scatter.find((s) => s.kind === 'crystal');
    expect(crystalScatter!.freqPerHole).toBeGreaterThan(2);
    // Ocean is the wettest: a sea-channel crossing + heavy flanking lagoons.
    expect(ocean.waterCreek).toBe(true);
    expect(ocean.ponds!).toBeGreaterThan(1.5);
  });

  it("the ocean's sea channels and the fungal jungle streams actually show up & stay carryable", () => {
    let oceanCross = 0;
    let fungalTrees = 0;
    for (let s = 0; s < 80; s++) {
      const o = generateCourse(s + 32000, { biome: 'tidal-archipelago', holes: 4, wildness: 0.6 });
      expect(validateCrossings(o)).toEqual([]);
      oceanCross += o.holes.filter((h) => h.hazards.some((z) => z.kind === 'creek')).length;
      const f = generateCourse(s + 33000, { biome: 'spore-jungle', holes: 4, wildness: 0.7 });
      fungalTrees += countKind(f.holes, 'trees');
    }
    expect(oceanCross).toBeGreaterThan(0);
    expect(fungalTrees).toBeGreaterThan(0);
  });
});
