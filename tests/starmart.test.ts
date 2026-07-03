import { describe, it, expect } from 'vitest';
import { starmartOffer, starmartRerollCost, STARMART_COST, startRun, type Run } from '../src/sim/rpg/run';
import { shopItem } from '../src/sim/rpg/economy';

/** A mid-run voyage stop, deep enough that the catalogue has plenty of rare/epic/legendary to draw. */
function deepRun(seed = 5): Run {
  return { ...startRun(seed, 'voyage'), stopIndex: 5, distanceFromStart: 12 };
}

describe('StarMart pop-up shop (GS-tent-interactions)', () => {
  it('never stocks a common — only rare/epic/legendary', () => {
    for (let seed = 0; seed < 40; seed++) {
      const run = deepRun(seed);
      for (const { item } of starmartOffer(run)) {
        expect(item.rarity).not.toBe('common');
      }
    }
  });

  it('prices every card in shards by rarity (blue 5 · purple 10 · orange 15)', () => {
    expect(STARMART_COST).toMatchObject({ rare: 5, epic: 10, legendary: 15 });
    const run = deepRun(3);
    for (const { item, cost } of starmartOffer(run)) {
      expect(cost).toBe(STARMART_COST[item.rarity]);
      expect(shopItem(item.id)).toBeTruthy(); // every offered id resolves back to a buyable item
    }
  });

  it('is deterministic per run+stop and rerolls to a different rack (salt changes the draw)', () => {
    const run = deepRun(9);
    const a = starmartOffer(run).map((o) => o.item.id);
    const b = starmartOffer(run).map((o) => o.item.id);
    expect(a).toEqual(b); // resume-stable
    const r1 = starmartOffer(run, undefined, 1).map((o) => o.item.id);
    // A reroll generally changes at least one card (not a hard guarantee per seed, but across the rack).
    expect(r1).not.toEqual(a);
  });

  it('skews toward epic/legendary far more than a flat rarity draw would', () => {
    // Across many stops, epic+legendary should be a healthy share of the rack (the "higher chance" ask),
    // not the ~12% they'd be under the catalogue's base weights.
    let epicPlus = 0;
    let total = 0;
    for (let seed = 0; seed < 80; seed++) {
      for (const { item } of starmartOffer(deepRun(seed))) {
        total++;
        if (item.rarity === 'epic' || item.rarity === 'legendary') epicPlus++;
      }
    }
    expect(epicPlus / total).toBeGreaterThan(0.4);
  });

  it('the reroll shard cost ramps', () => {
    expect(starmartRerollCost(0)).toBeLessThan(starmartRerollCost(1));
    expect(starmartRerollCost(1)).toBeLessThan(starmartRerollCost(3));
  });
});
