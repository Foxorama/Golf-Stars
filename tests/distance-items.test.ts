import { describe, it, expect } from 'vitest';
import {
  loadoutFromPerks,
  startingLoadout,
  shopItem,
  netDispersion,
} from '../src/sim/rpg/economy';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { shotSpread, playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';
import type { Vec } from '../src/sim/course/contract';

/**
 * GS-proshop-distance-items — the four per-CATEGORY distance-control Pro Shop items. Each raises the
 * MIN carry of ONE club family toward its max (fewer weak, coming-up-short shots), category by
 * category. Woods/Hybrids/Irons are pure precision; the Driver gets the biggest boost but pays with a
 * shave off its top-end carry (a real trade-off, per the design).
 */

const ITEMS = ['distance-driver', 'distance-woods', 'distance-hybrids', 'distance-irons'];

/** A shotSpread threading the loadout's per-family carry-control fields (mirrors the real play path). */
function spread(hole: ReturnType<typeof generateCourse>['holes'][number], from: Vec, lie: string, clubId: string, perks: string[]) {
  const lo = loadoutFromPerks(perks);
  const club = CLUBS.find((c) => c.id === clubId)!;
  return shotSpread(hole, from, lie as never, hole.green, club, {
    dispersionMult: netDispersion(lo),
    minCarryBoost: lo.minCarryBoost,
    wedgeWindow: lo.wedgeWindow,
    minCarryBoostByClass: lo.minCarryBoostByClass,
    driverMaxCarryCut: lo.driverMaxCarryCut,
  });
}

describe('GS-proshop-distance-items — the four items resolve and fold their fields', () => {
  it('each item exists, and applies a min-carry boost to its own family only', () => {
    for (const id of ITEMS) expect(shopItem(id), id).toBeTruthy();
    expect(loadoutFromPerks(['distance-driver']).minCarryBoostByClass).toEqual({ driver: 0.18 });
    expect(loadoutFromPerks(['distance-woods']).minCarryBoostByClass).toEqual({ wood: 0.13 });
    expect(loadoutFromPerks(['distance-hybrids']).minCarryBoostByClass).toEqual({ hybrid: 0.13 });
    expect(loadoutFromPerks(['distance-irons']).minCarryBoostByClass).toEqual({ iron: 0.16 });
  });

  it('only the Driver item carries the top-end trade-off', () => {
    expect(loadoutFromPerks(['distance-driver']).driverMaxCarryCut).toBeCloseTo(0.06);
    expect(loadoutFromPerks(['distance-woods']).driverMaxCarryCut).toBeUndefined();
    expect(loadoutFromPerks(['distance-irons']).driverMaxCarryCut).toBeUndefined();
  });

  it('a base loadout carries none of the new fields (byte-for-byte default)', () => {
    const lo = startingLoadout();
    expect(lo.minCarryBoostByClass).toBeUndefined();
    expect(lo.driverMaxCarryCut).toBeUndefined();
  });

  it('the four fold together onto one loadout without clobbering each other', () => {
    const all = loadoutFromPerks(ITEMS).minCarryBoostByClass!;
    expect(all).toEqual({ driver: 0.18, wood: 0.13, hybrid: 0.13, iron: 0.16 });
  });
});

describe('GS-proshop-distance-items — each item tightens ONLY its own family', () => {
  const hole = generateCourse(4242).holes[0]!;
  // A downrange ball so an iron/hybrid approach has room; the tee for the long sticks.
  const approach: Vec = [hole.green[0], hole.green[1] - 150];

  it('the Woods item raises the min carry of a wood, and leaves an iron & a wedge untouched', () => {
    const base = spread(hole, hole.tee, 'tee', '3W', []);
    const boosted = spread(hole, hole.tee, 'tee', '3W', ['distance-woods']);
    expect(boosted.carryLow).toBeGreaterThan(base.carryLow);
    // An IRON is unaffected by the Woods item.
    const ironBase = spread(hole, approach, 'fairway', '7i', []);
    const ironWoods = spread(hole, approach, 'fairway', '7i', ['distance-woods']);
    expect(ironWoods.carryLow).toBeCloseTo(ironBase.carryLow, 6);
  });

  it('the Hybrids item raises a hybrid, not a wood', () => {
    const hyBase = spread(hole, hole.tee, 'tee', '2H', []);
    const hyBoost = spread(hole, hole.tee, 'tee', '2H', ['distance-hybrids']);
    expect(hyBoost.carryLow).toBeGreaterThan(hyBase.carryLow);
    const woodBase = spread(hole, hole.tee, 'tee', '3W', []);
    const woodHy = spread(hole, hole.tee, 'tee', '3W', ['distance-hybrids']);
    expect(woodHy.carryLow).toBeCloseTo(woodBase.carryLow, 6);
  });

  it('the Irons item raises an iron, not a hybrid', () => {
    const ironBase = spread(hole, approach, 'fairway', '7i', []);
    const ironBoost = spread(hole, approach, 'fairway', '7i', ['distance-irons']);
    expect(ironBoost.carryLow).toBeGreaterThan(ironBase.carryLow);
    const hyBase = spread(hole, hole.tee, 'tee', '2H', []);
    const hyIrons = spread(hole, hole.tee, 'tee', '2H', ['distance-irons']);
    expect(hyIrons.carryLow).toBeCloseTo(hyBase.carryLow, 6);
  });
});

describe('GS-proshop-distance-items — the Driver trade-off', () => {
  const hole = generateCourse(4242).holes[0]!;

  it('the Driver item raises the min carry AND shaves the max (the trade-off), only on the driver', () => {
    const base = spread(hole, hole.tee, 'tee', 'D', []);
    const boosted = spread(hole, hole.tee, 'tee', 'D', ['distance-driver']);
    // Min carry jumps up (fewer weak drives)…
    expect(boosted.carryLow).toBeGreaterThan(base.carryLow);
    // …and the top end is shaved (the negative attribute).
    expect(boosted.carryHigh).toBeLessThan(base.carryHigh);
    // The window is genuinely tighter overall.
    expect(boosted.carryHigh - boosted.carryLow).toBeLessThan(base.carryHigh - base.carryLow);
  });

  it('the Woods item has NO top-end cut (pure precision, no trade-off)', () => {
    const base = spread(hole, hole.tee, 'tee', '3W', []);
    const boosted = spread(hole, hole.tee, 'tee', '3W', ['distance-woods']);
    expect(boosted.carryHigh).toBeCloseTo(base.carryHigh, 6); // max untouched
    expect(boosted.carryLow).toBeGreaterThan(base.carryLow); // only the floor rises
  });
});

/** Mean per-stop Stableford threading the per-family carry controls (contract 4 guard). */
function meanStableford(perks: string[], n = 250): number {
  const lo = loadoutFromPerks(perks);
  let sf = 0;
  for (let s = 0; s < n; s++) {
    const c = generateCourse(`${s}:stop`, { holes: 6, distanceFromStart: s % 12 });
    const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
      bag: lo.bag,
      dispersionMult: netDispersion(lo),
      shapeMod: lo.shapeMod,
      minCarryBoost: lo.minCarryBoost,
      wedgeWindow: lo.wedgeWindow,
      minCarryBoostByClass: lo.minCarryBoostByClass,
      driverMaxCarryCut: lo.driverMaxCarryCut,
    });
    sf += playTotals(played.map((p) => p.record)).stableford;
  }
  return sf / n;
}

describe('GS-proshop-distance-items — a power-up must not lower scoring (contract 4)', () => {
  const base = meanStableford([]);
  it('no single item lowers mean per-stop Stableford — even the driver with its trade-off', () => {
    for (const id of ITEMS) {
      expect(meanStableford([id]), id).toBeGreaterThanOrEqual(base - 0.2);
    }
  });
  it('carrying all four never lowers scoring', () => {
    expect(meanStableford(ITEMS)).toBeGreaterThanOrEqual(base - 0.2);
  });
});
