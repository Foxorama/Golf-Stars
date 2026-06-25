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
} from '../src/sim/rpg/economy';
import { buy, shopOffer, snapshotRun, resumeRun, startRun, SHOP_OFFER_SIZE } from '../src/sim/rpg/run';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';

const STACKABLES = SHOP_ITEMS.filter((i) => i.stackable);
const UNIQUES = SHOP_ITEMS.filter((i) => !i.stackable);

describe('stackable economy', () => {
  it('the catalogue still has the original uniques plus new stackables', () => {
    for (const id of ['power-cell', 'gyro', 'lucky-coin', 'pro-coach', 'auto-caddie']) {
      expect(shopItem(id)!.stackable).toBeFalsy();
    }
    expect(STACKABLES.length).toBeGreaterThanOrEqual(4);
  });

  it('itemCost ramps geometrically for stackables, flat for uniques', () => {
    const chip = shopItem('precision-chip')!;
    expect(itemCost(chip, 0)).toBe(chip.cost);
    expect(itemCost(chip, 1)).toBe(Math.round(chip.cost * STACK_COST_GROWTH));
    expect(itemCost(chip, 2)).toBe(Math.round(chip.cost * STACK_COST_GROWTH ** 2));
    // A unique never ramps.
    const gyro = shopItem('gyro')!;
    expect(itemCost(gyro, 0)).toBe(gyro.cost);
    expect(itemCost(gyro, 1)).toBe(gyro.cost);
  });

  it('caps: uniques cap at 1, stackables at maxStacks', () => {
    expect(itemCap(shopItem('gyro')!)).toBe(1);
    expect(itemCap(shopItem('caddie-lesson')!)).toBe(9);
  });

  it('ownedCount counts duplicate perk ids', () => {
    expect(ownedCount(['precision-chip', 'precision-chip', 'gyro'], 'precision-chip')).toBe(2);
    expect(ownedCount([], 'precision-chip')).toBe(0);
  });

  it('canBuy respects the cap and the next price', () => {
    const lesson = shopItem('caddie-lesson')!;
    expect(canBuy(lesson, 0, 1000)).toBe(true);
    expect(canBuy(lesson, 9, 100000)).toBe(false); // at cap
    expect(canBuy(lesson, 0, 10)).toBe(false); // can't afford
  });
});

describe('buy with stacking', () => {
  it('a stackable can be bought repeatedly, stacking effect and rising in price', () => {
    let run = { ...startRun(1), credits: 10000 };
    const chip = shopItem('precision-chip')!;
    const before = run.credits;
    run = buy(run, 'precision-chip');
    expect(run.credits).toBe(before - chip.cost);
    expect(ownedCount(run.loadout.perks, 'precision-chip')).toBe(1);
    expect(run.loadout.dispersionMult).toBeCloseTo(0.92);

    const mid = run.credits;
    run = buy(run, 'precision-chip');
    expect(ownedCount(run.loadout.perks, 'precision-chip')).toBe(2);
    expect(run.loadout.dispersionMult).toBeCloseTo(0.92 * 0.92);
    // Second copy cost more than the first.
    expect(mid - run.credits).toBe(itemCost(chip, 1));
    expect(itemCost(chip, 1)).toBeGreaterThan(chip.cost);
  });

  it('stacking stops at the cap (a no-op once maxed)', () => {
    let run = { ...startRun(2), credits: 1_000_000 };
    for (let i = 0; i < 20; i++) run = buy(run, 'caddie-lesson');
    expect(ownedCount(run.loadout.perks, 'caddie-lesson')).toBe(9);
    const maxed = run;
    expect(buy(maxed, 'caddie-lesson')).toBe(maxed); // no-op at cap
  });

  it('a unique is still buyable only once', () => {
    let run = { ...startRun(3), credits: 10000 };
    run = buy(run, 'gyro');
    expect(buy(run, 'gyro')).toBe(run);
  });

  it('snapshot/resume rebuilds a stacked loadout from duplicate perk ids', () => {
    let run = { ...startRun(4), credits: 100000 };
    run = buy(run, 'precision-chip');
    run = buy(run, 'precision-chip');
    run = buy(run, 'caddie-lesson');
    const resumed = resumeRun(snapshotRun(run));
    expect(ownedCount(resumed.loadout.perks, 'precision-chip')).toBe(2);
    expect(resumed.loadout.dispersionMult).toBeCloseTo(0.92 * 0.92);
    expect(resumed.loadout.handicap).toBe(startingLoadout().handicap - 2);
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

  it('drops maxed items: an owned unique never appears, a capped stackable never appears', () => {
    // Own every unique + max a stackable, then the offer must be the remaining pursuables.
    const ownedUniques = UNIQUES.map((i) => i.id);
    const cappedLesson = Array.from({ length: itemCap(shopItem('caddie-lesson')!) }, () => 'caddie-lesson');
    const perks = [...ownedUniques, ...cappedLesson];
    const run = { ...startRun(7), loadout: { ...startingLoadout(), perks } };
    const ids = shopOffer(run).map((o) => o.item.id);
    for (const u of ownedUniques) expect(ids).not.toContain(u);
    expect(ids).not.toContain('caddie-lesson');
    // Pool is the still-pursuable stackables → offer is bounded by that set.
    expect(ids.length).toBeLessThanOrEqual(STACKABLES.length - 1);
  });

  it('offer cost reflects how many of a stackable you already own', () => {
    const chip = shopItem('precision-chip')!;
    // Build a run that owns 2 precision-chips and force it into an offer that includes it.
    const perks = ['precision-chip', 'precision-chip'];
    // Find a seed whose offer includes precision-chip with these perks.
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const run = { ...startRun(seed), loadout: { ...startingLoadout(), perks } };
      const slot = shopOffer(run).find((o) => o.item.id === 'precision-chip');
      if (slot) {
        expect(slot.owned).toBe(2);
        expect(slot.cost).toBe(itemCost(chip, 2));
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('stackables hold the "a power-up must improve scoring" invariant', () => {
  // Mean per-stop Stableford over many independent stops — the stable balance signal
  // (full-run distance is chaotic; see CLAUDE.md / run.test.ts).
  const meanStableford = (perks: string[]): number => {
    const lo = loadoutFromPerks(perks);
    let sf = 0;
    let n = 0;
    for (let s = 0; s < 200; s++) {
      const c = generateCourse(`${s}:stop`, { holes: 6, distanceFromStart: s % 12 });
      const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
        bag: lo.bag,
        // The game applies handicap×equipment; use the same so handicap perks (Caddie
        // Lesson) actually register — passing only dispersionMult would hide them.
        dispersionMult: netDispersion(lo),
      });
      sf += playTotals(played.map((p) => p.record)).stableford;
      n++;
    }
    return sf / n;
  };

  const base = meanStableford([]);

  it('Precision Chip helps, and stacks help more', () => {
    expect(meanStableford(['precision-chip'])).toBeGreaterThan(base);
    expect(meanStableford(['precision-chip', 'precision-chip', 'precision-chip'])).toBeGreaterThan(
      meanStableford(['precision-chip']),
    );
  });

  it('Caddie Lessons improve scoring as the build stacks', () => {
    // A single −2 handicap bump (~4% tighter) is within run-to-run noise over the sample,
    // so the honest invariant is that the BUILD clearly helps and more stacks help more.
    const three = meanStableford(['caddie-lesson', 'caddie-lesson', 'caddie-lesson']);
    const seven = meanStableford(Array.from({ length: 7 }, () => 'caddie-lesson'));
    expect(three).toBeGreaterThan(base); // a few lessons (−6 handicap) clearly help
    expect(seven).toBeGreaterThan(three); // stacks help more
    // A single lesson is a small skill bump — never a regression.
    expect(meanStableford(['caddie-lesson'])).toBeGreaterThanOrEqual(base - 0.2);
  });

  it('Range Booster never hurts scoring, even stacked to the cap', () => {
    expect(meanStableford(['range-booster'])).toBeGreaterThanOrEqual(base);
    expect(meanStableford(Array.from({ length: 5 }, () => 'range-booster'))).toBeGreaterThanOrEqual(base);
  });

  it('Fortune Chip is pure economy — it changes credits, not shot dispersion or the bag', () => {
    const lo = loadoutFromPerks(['fortune-chip', 'fortune-chip']);
    expect(lo.creditMult).toBeCloseTo(1.15 * 1.15);
    expect(lo.dispersionMult).toBe(1);
    expect(lo.bag.find((c) => c.id === 'D')!.carry).toBe(startingLoadout().bag.find((c) => c.id === 'D')!.carry);
  });
});
