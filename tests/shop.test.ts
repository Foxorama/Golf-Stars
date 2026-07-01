import { describe, it, expect } from 'vitest';
import {
  SHOP_ITEMS,
  STACK_COST_GROWTH,
  canBuy,
  itemCap,
  itemCost,
  loadoutFromPerks,
  netDispersion,
  ownedCount,
  shopItem,
  startingLoadout,
  type ShopItem,
} from '../src/sim/rpg/economy';
import { buy, shopOffer, snapshotRun, resumeRun, startRun, SHOP_OFFER_SIZE } from '../src/sim/rpg/run';
import { RARITY_C } from '../src/sim/rpg/loot';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';

// A synthetic stackable, kept only to prove the back-compat plumbing (itemCost geometric / itemCap)
// still works for save-migration — the live catalogue no longer ships any stackable (GS-proshop-variety).
const SYNTH_STACK: ShopItem = {
  id: 'synth-stack',
  name: 'Synthetic Stackable',
  cost: 100,
  desc: 'test-only',
  rarity: 'rare',
  stackable: true,
  maxStacks: 3,
  apply: (m) => m,
};

describe('one-shot economy (GS-proshop-variety)', () => {
  it('the whole catalogue is now single-purchase uniques — no stackables ship', () => {
    for (const it of SHOP_ITEMS) expect(it.stackable, it.id).toBeFalsy();
    // The former stackables survive as one-shot uniques.
    for (const id of ['precision-chip', 'caddie-lesson', 'fortune-chip', 'range-booster', 'putting-grip']) {
      expect(shopItem(id), id).toBeTruthy();
      expect(shopItem(id)!.stackable, id).toBeFalsy();
    }
    // The variety siblings that fill out each axis are present.
    for (const id of ['mallet-putter', 'pinseeker-putter', 'pro-irons', 'flop-wedge', 'quantum-shafts', 'nova-driver']) {
      expect(shopItem(id), id).toBeTruthy();
    }
  });

  it('rarity tracks power: the Power Cell is at least as rare as the Distance Balls, never common', () => {
    const power = shopItem('power-cell')!;
    const range = shopItem('range-booster')!;
    expect(RARITY_C[power.rarity].order).toBeGreaterThanOrEqual(RARITY_C[range.rarity].order);
    expect(power.rarity).not.toBe('common');
  });

  it('the putting axis is a rarity ladder of distinct one-shots (not one stacked grip)', () => {
    const order = (id: string) => RARITY_C[shopItem(id)!.rarity].order;
    expect(order('putting-grip')).toBe(order('mallet-putter')); // both rare
    expect(order('tour-putter')).toBeGreaterThan(order('mallet-putter')); // epic
    expect(order('pinseeker-putter')).toBeGreaterThan(order('tour-putter')); // legendary
  });

  it('itemCost is flat for the (unique) catalogue, geometric only for a stackable', () => {
    const chip = shopItem('precision-chip')!;
    expect(itemCost(chip, 0)).toBe(chip.cost);
    expect(itemCost(chip, 1)).toBe(chip.cost); // a unique never ramps
    // The retained plumbing still ramps a genuine stackable (save back-compat).
    expect(itemCost(SYNTH_STACK, 0)).toBe(SYNTH_STACK.cost);
    expect(itemCost(SYNTH_STACK, 1)).toBe(Math.round(SYNTH_STACK.cost * STACK_COST_GROWTH));
    expect(itemCost(SYNTH_STACK, 2)).toBe(Math.round(SYNTH_STACK.cost * STACK_COST_GROWTH ** 2));
  });

  it('caps: every catalogue item caps at 1; the stackable plumbing still honours maxStacks', () => {
    for (const it of SHOP_ITEMS) expect(itemCap(it), it.id).toBe(1);
    expect(itemCap(SYNTH_STACK)).toBe(3);
  });

  it('ownedCount counts duplicate perk ids (old saves may carry stacked perks)', () => {
    expect(ownedCount(['precision-chip', 'precision-chip', 'gyro'], 'precision-chip')).toBe(2);
    expect(ownedCount([], 'precision-chip')).toBe(0);
  });

  it('canBuy respects the cap and the next price', () => {
    const gyro = shopItem('gyro')!;
    expect(canBuy(gyro, 0, 1000)).toBe(true);
    expect(canBuy(gyro, 1, 100000)).toBe(false); // already owned (cap 1)
    expect(canBuy(gyro, 0, 10)).toBe(false); // can't afford
  });
});

describe('buy (one-shot uniques)', () => {
  it('an item is buyable once — a second buy is a no-op', () => {
    let run = { ...startRun(1), credits: 10000 };
    const chip = shopItem('precision-chip')!;
    const before = run.credits;
    run = buy(run, 'precision-chip');
    expect(run.credits).toBe(before - chip.cost);
    expect(ownedCount(run.loadout.perks, 'precision-chip')).toBe(1);
    expect(run.loadout.dispersionMult).toBeCloseTo(0.88);
    // Owned → a second buy changes nothing.
    expect(buy(run, 'precision-chip')).toBe(run);
    expect(buy({ ...startRun(3), credits: 10000 }, 'gyro')).not.toBe(startRun(3)); // sanity: first buy works
  });

  it('snapshot/resume rebuilds the loadout from perk ids', () => {
    let run = { ...startRun(4), credits: 100000 };
    run = buy(run, 'precision-chip');
    run = buy(run, 'gyro');
    run = buy(run, 'caddie-lesson'); // caddie-lesson needs no gate to APPLY (the gate is offer-only)
    const resumed = resumeRun(snapshotRun(run));
    expect(ownedCount(resumed.loadout.perks, 'precision-chip')).toBe(1);
    expect(resumed.loadout.dispersionMult).toBeCloseTo(0.88 * 0.85);
    expect(resumed.loadout.handicap).toBe(startingLoadout().handicap - 4);
  });

  it('back-compat: an old save with duplicate perk ids still stacks the effect on rebuild', () => {
    // loadoutFromPerks applies each perk in the array, so a pre-GS-proshop-variety save that bought
    // the same stackable twice still resolves its full stacked power — no lost upgrades on migration.
    const lo = loadoutFromPerks(['precision-chip', 'precision-chip']);
    expect(lo.dispersionMult).toBeCloseTo(0.88 * 0.88);
  });
});

describe('shopOffer (rotating stock)', () => {
  it('is deterministic from the run seed + stop', () => {
    const run = startRun(1234);
    const a = shopOffer(run).map((o) => o.item.id);
    const b = shopOffer(run).map((o) => o.item.id);
    expect(a).toEqual(b);
  });

  it('offers SHOP_OFFER_SIZE distinct, valid items', () => {
    for (let seed = 0; seed < 30; seed++) {
      const offer = shopOffer(startRun(seed));
      expect(offer).toHaveLength(SHOP_OFFER_SIZE);
      const ids = offer.map((o) => o.item.id);
      expect(new Set(ids).size).toBe(ids.length); // distinct
      for (const o of offer) expect(shopItem(o.item.id)).toBeTruthy();
    }
  });

  it('drops OWNED items — a bought item never re-appears (fresh stock every stop)', () => {
    // Own a big slice of the catalogue; none of it may show up again.
    const owned = SHOP_ITEMS.slice(0, 12).map((i) => i.id);
    const run = { ...startRun(7), loadout: { ...startingLoadout(), perks: owned } };
    for (let salt = 0; salt < 8; salt++) {
      const ids = shopOffer(run, SHOP_OFFER_SIZE, salt).map((o) => o.item.id);
      for (const u of owned) expect(ids).not.toContain(u);
    }
  });
});

describe('shop items hold the "a power-up must improve scoring" invariant', () => {
  // Mean per-stop Stableford over many independent stops — the stable balance signal
  // (full-run distance is chaotic; see CLAUDE.md / run.test.ts).
  const meanStableford = (perks: string[]): number => {
    const lo = loadoutFromPerks(perks);
    let sf = 0;
    let n = 0;
    for (let s = 0; s < 600; s++) {
      const c = generateCourse(`${s}:stop`, { holes: 6, distanceFromStart: s % 12 });
      const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
        bag: lo.bag,
        dispersionMult: netDispersion(lo),
      });
      sf += playTotals(played.map((p) => p.record)).stableford;
      n++;
    }
    return sf / n;
  };

  const base = meanStableford([]);

  it('Precision Chip helps, and the new legendary precision set helps more', () => {
    expect(meanStableford(['precision-chip'])).toBeGreaterThan(base);
    // Quantum-Balanced Irons are the apex accuracy legendary — a clear lift over a single rare chip.
    expect(meanStableford(['quantum-shafts'])).toBeGreaterThan(meanStableford(['precision-chip']));
  });

  it('Caddie Lessons improve scoring (−4 handicap is a clear skill bump)', () => {
    expect(meanStableford(['caddie-lesson'])).toBeGreaterThan(base);
  });

  it('the distance items (Distance Balls, Nova Long Driver) never hurt scoring', () => {
    expect(meanStableford(['range-booster'])).toBeGreaterThanOrEqual(base);
    expect(meanStableford(['nova-driver'])).toBeGreaterThanOrEqual(base);
  });

  it('Fortune Chip is pure economy — it changes credits, not shot dispersion or the bag', () => {
    const lo = loadoutFromPerks(['fortune-chip']);
    expect(lo.creditMult).toBeCloseTo(1.15);
    expect(lo.dispersionMult).toBe(1);
    expect(lo.bag.find((c) => c.id === 'D')!.carry).toBe(startingLoadout().bag.find((c) => c.id === 'D')!.carry);
  });
});
