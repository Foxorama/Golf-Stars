import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings, holeYardage } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { shapeFamilyOf } from '../src/sim/course/compose';
import { biomeById } from '../src/sim/course/biomes';

/** Aggregate the generated par mix / shape families / width ids for a biome over many composed stops. */
function sample(biome: string, wildness = 0.6, stops = 120) {
  const par = { 3: 0, 4: 0, 5: 0 };
  const shape: Record<string, number> = {};
  const width: Record<string, number> = {};
  const yards: number[] = [];
  for (let s = 0; s < stops; s++) {
    const c = generateCourse(s + 40000, { biome, holes: 9, wildness, compose: true });
    expect(validateCourse(c)).toEqual([]);
    expect(validateFairness(c)).toEqual([]);
    expect(validateCrossings(c)).toEqual([]);
    for (const h of c.holes) {
      const p = h.par as 3 | 4 | 5;
      par[p] = par[p] + 1;
      const f = shapeFamilyOf(h.shapeId) ?? 'straight';
      shape[f] = (shape[f] ?? 0) + 1;
      if (h.widthId) width[h.widthId] = (width[h.widthId] ?? 0) + 1;
      yards.push(holeYardage(h));
    }
  }
  return { par, shape, width, yards };
}

describe('per-biome design profiles (GS-biome-profile)', () => {
  it('a world WITHOUT a profile is byte-for-byte the old generation', () => {
    // ember-world sets no profile fields; composing it must be identical run to run and unchanged by
    // the new machinery (the default weights reproduce the old thresholds/proportions exactly).
    const a = generateCourse(123, { biome: 'ember-world', holes: 9, wildness: 0.7, compose: true });
    const b = generateCourse(123, { biome: 'ember-world', holes: 9, wildness: 0.7, compose: true });
    expect(a).toEqual(b);
    expect(biomeById('ember-world')?.parMix).toBeUndefined();
    expect(biomeById('ember-world')?.shapeWeights).toBeUndefined();
    expect(biomeById('ember-world')?.widthWeights).toBeUndefined();
  });

  it('Dust Belt plays LONG and OPEN — more par-5s, wide fairways, few tight corridors', () => {
    const desert = sample('dust-belt');
    const jungle = sample('spore-jungle');
    // The desert draws meaningfully more par-5s than the tight jungle, and fewer par-3s.
    expect(desert.par[5]).toBeGreaterThan(jungle.par[5]);
    // Broad/wander fairways dominate over the squeezed chute/neck/thin archetypes.
    const broadish = (desert.width['broad'] ?? 0) + (desert.width['wander'] ?? 0);
    const tight = (desert.width['chute'] ?? 0) + (desert.width['neck'] ?? 0) + (desert.width['thin'] ?? 0);
    expect(broadish).toBeGreaterThan(tight);
  });

  it('Spore Jungle plays TIGHT and TWISTY — mostly par-4s, doglegs/S-curves, squeezed corridors', () => {
    const jungle = sample('spore-jungle');
    const desert = sample('dust-belt');
    // Par-4 heavy (a tight jungle has no room for long bombers).
    expect(jungle.par[4]).toBeGreaterThan(jungle.par[3] + jungle.par[5]);
    // It bends far more than the straight/cape desert: doglegs + doubles + hairpins dominate.
    const jungleBendy = (jungle.shape['dogleg'] ?? 0) + (jungle.shape['double'] ?? 0) + (jungle.shape['hairpin'] ?? 0);
    const desertBendy = (desert.shape['dogleg'] ?? 0) + (desert.shape['double'] ?? 0) + (desert.shape['hairpin'] ?? 0);
    expect(jungleBendy).toBeGreaterThan(desertBendy);
    // Squeezed corridors (chute/neck/thin) out-number the desert's.
    const jungleTight = (jungle.width['chute'] ?? 0) + (jungle.width['neck'] ?? 0) + (jungle.width['thin'] ?? 0);
    const desertTight = (desert.width['chute'] ?? 0) + (desert.width['neck'] ?? 0) + (desert.width['thin'] ?? 0);
    expect(jungleTight).toBeGreaterThan(desertTight);
  });

  it('Ice Ring plays as an EXPOSED LINKS — more par-3s and sweeping S-curves than the desert', () => {
    const ice = sample('ice-ring');
    const desert = sample('dust-belt');
    expect(ice.par[3]).toBeGreaterThan(desert.par[3]); // wind-shot short holes
    expect(ice.shape['double'] ?? 0).toBeGreaterThan(desert.shape['double'] ?? 0); // sweeping S-curves
  });

  it('the desert plays a longer AVERAGE hole than the tight jungle (identity ≠ just skin)', () => {
    const desert = sample('dust-belt');
    const jungle = sample('spore-jungle');
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(desert.yards)).toBeGreaterThan(mean(jungle.yards));
  });
});
