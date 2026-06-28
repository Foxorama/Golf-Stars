import { describe, it, expect } from 'vitest';
import {
  PROS,
  shopPro,
  proMood,
  proQuip,
  type ProMood,
} from '../src/sim/course/zones';
import type { BiomeArchetype } from '../src/sim/course/themes';
import { rarityDepthBias, shopOffer, startRun } from '../src/sim/rpg/run';
import { shopItem } from '../src/sim/rpg/economy';
import type { Rarity } from '../src/sim/course/contract';

const ARCHES: BiomeArchetype[] = ['verdant', 'desert', 'frost', 'inferno', 'void'];
const MOODS: ProMood[] = ['scraped', 'solid', 'great', 'stellar'];

describe('Pro Shop staff (GS-proshop)', () => {
  it('every world has a named Pro with a line for every mood', () => {
    for (const a of ARCHES) {
      const pro = shopPro(a);
      expect(pro).toBe(PROS[a]);
      expect(pro.name.length).toBeGreaterThan(0);
      expect(pro.title.length).toBeGreaterThan(0);
      for (const m of MOODS) {
        expect(pro.quips[m].length).toBeGreaterThanOrEqual(1);
        for (const line of pro.quips[m]) expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it('proMood grades degrees of SUCCESS by Stableford / cut ratio', () => {
    // You only reach a shop after passing the cut, so the lowest grade is a nervy scrape.
    expect(proMood(10, 10)).toBe('scraped'); // exactly at the bar
    expect(proMood(12, 10)).toBe('scraped'); // 1.2x
    expect(proMood(15, 10)).toBe('solid'); // 1.5x
    expect(proMood(20, 10)).toBe('great'); // 2.0x
    expect(proMood(30, 10)).toBe('stellar'); // 3.0x
    // Higher ratios never grade lower.
    let prevOrder = -1;
    for (const sf of [10, 13, 18, 25]) {
      const order = MOODS.indexOf(proMood(sf, 10));
      expect(order).toBeGreaterThanOrEqual(prevOrder);
      prevOrder = order;
    }
  });

  it('proMood guards a zero/negative cut without dividing by zero', () => {
    expect(proMood(5, 0)).toBeDefined();
    expect(MOODS).toContain(proMood(5, 0));
  });

  it('proQuip is deterministic, in-bounds, and varies with the salt when there are options', () => {
    for (const a of ARCHES) {
      const pro = shopPro(a);
      for (const m of MOODS) {
        const lines = pro.quips[m];
        for (let salt = 0; salt < 12; salt++) {
          const line = proQuip(pro, m, salt);
          expect(lines).toContain(line);
          expect(proQuip(pro, m, salt)).toBe(line); // deterministic
        }
        // A multi-line mood actually cycles through its lines as the salt advances.
        if (lines.length > 1) {
          const seen = new Set(lines.map((_, i) => proQuip(pro, m, i)));
          expect(seen.size).toBe(lines.length);
        }
      }
    }
  });
});

describe('shop rarity ramps with depth (GS-proshop)', () => {
  it('commons are flat (×1); rare/epic/legendary rise with galaxy distance', () => {
    expect(rarityDepthBias('common', 0)).toBe(1);
    expect(rarityDepthBias('common', 18)).toBe(1);
    for (const r of ['rare', 'epic', 'legendary'] as Rarity[]) {
      // Below 1 early (commons favoured), monotonically rising, above 1 deep (rares favoured).
      expect(rarityDepthBias(r, 0)).toBeLessThan(1);
      expect(rarityDepthBias(r, 9)).toBeGreaterThan(rarityDepthBias(r, 0));
      expect(rarityDepthBias(r, 18)).toBeGreaterThan(rarityDepthBias(r, 9));
      expect(rarityDepthBias(r, 18)).toBeGreaterThan(1);
    }
    // The deeper the rarity tier, the steeper the depth response.
    expect(rarityDepthBias('legendary', 18)).toBeGreaterThan(rarityDepthBias('epic', 18));
    expect(rarityDepthBias('epic', 18)).toBeGreaterThan(rarityDepthBias('rare', 18));
  });

  it('the bias is clamped — distances past the ramp do not keep growing', () => {
    expect(rarityDepthBias('epic', 18)).toBe(rarityDepthBias('epic', 100));
  });

  it('early shops offer more commons than deep shops, on average across seeds', () => {
    const meanCommons = (distance: number): number => {
      let commons = 0;
      let stops = 0;
      for (let seed = 0; seed < 120; seed++) {
        const run = { ...startRun(seed), stopIndex: 1, distanceFromStart: distance };
        for (const o of shopOffer(run)) {
          if (shopItem(o.item.id)?.rarity === 'common') commons++;
        }
        stops++;
      }
      return commons / stops;
    };
    const early = meanCommons(0);
    const deep = meanCommons(18);
    // The headline fix: foundational commons cluster EARLY, not late.
    expect(early).toBeGreaterThan(deep);
  });
});
