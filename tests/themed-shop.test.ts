import { describe, it, expect } from 'vitest';
import { shopOffer, startRun, currentTheme, type Run } from '../src/sim/rpg/run';
import {
  ARCHETYPE_AFFINITY,
  itemThemeWeight,
  ITEM_AFFINITY_BOOST,
  THEMES,
  type BiomeArchetype,
} from '../src/sim/course/themes';
import { ITEM_TAGS, itemTags } from '../src/sim/rpg/economy';

const ARCHES: BiomeArchetype[] = ['verdant', 'desert', 'frost', 'inferno', 'void'];

/** Force a run to a stop whose theme has the given archetype, so the shop is themed by it. */
function runWithArchetype(arch: BiomeArchetype): Run | null {
  for (let seed = 0; seed < 400; seed++) {
    for (let stop = 0; stop < 10; stop++) {
      const run = { ...startRun(seed), stopIndex: stop, distanceFromStart: stop * 2 };
      if (currentTheme(run).archetype === arch) return run;
    }
  }
  return null;
}

describe('themed upgrades — shop affinity (GS-17d)', () => {
  it('every archetype has an affinity, and every tag it prefers is a real item category', () => {
    const allTags = new Set(Object.values(ITEM_TAGS).flat());
    for (const a of ARCHES) {
      expect(ARCHETYPE_AFFINITY[a].length).toBeGreaterThan(0);
      for (const t of ARCHETYPE_AFFINITY[a]) expect(allTags.has(t)).toBe(true);
    }
  });

  it('itemThemeWeight boosts on-theme gear and leaves off-theme at 1', () => {
    // Inferno favours distance: the Power Cell (distance) is boosted, the Lucky Coin (economy) isn't.
    expect(itemThemeWeight(itemTags('power-cell'), 'inferno')).toBe(ITEM_AFFINITY_BOOST);
    expect(itemThemeWeight(itemTags('lucky-coin'), 'inferno')).toBe(1);
    // Verdant favours economy/skill: the Lucky Coin IS boosted there.
    expect(itemThemeWeight(itemTags('lucky-coin'), 'verdant')).toBe(ITEM_AFFINITY_BOOST);
    // An untagged item is never boosted.
    expect(itemThemeWeight(itemTags('nonexistent'), 'inferno')).toBe(1);
  });

  it('the shop offer skews toward on-theme gear across seeds (soft bias, not a filter)', () => {
    // Over many seeds, an inferno outpost should offer DISTANCE gear more often than a verdant one.
    const distanceIds = Object.keys(ITEM_TAGS).filter((id) => itemTags(id).includes('distance'));
    const countDistance = (arch: BiomeArchetype): number => {
      let n = 0;
      let stops = 0;
      for (let seed = 0; seed < 300; seed++) {
        const run = { ...startRun(seed), stopIndex: 1, distanceFromStart: 2 };
        if (currentTheme(run).archetype !== arch) continue;
        stops++;
        for (const o of shopOffer(run)) if (distanceIds.includes(o.item.id)) n++;
      }
      return stops ? n / stops : 0;
    };
    const inferno = countDistance('inferno');
    const verdant = countDistance('verdant');
    // Inferno favours distance; verdant favours economy/skill → inferno offers more distance gear.
    expect(inferno).toBeGreaterThan(verdant);
  });

  it('the offer stays deterministic and still respects size with the bias applied', () => {
    const run = runWithArchetype('inferno')!;
    expect(run).not.toBeNull();
    const a = shopOffer(run).map((o) => o.item.id);
    const b = shopOffer(run).map((o) => o.item.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // still distinct
  });

  it('every theme resolves to an archetype with a defined affinity', () => {
    for (const t of THEMES) expect(ARCHETYPE_AFFINITY[t.archetype]).toBeDefined();
  });
});
