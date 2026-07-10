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
 * category. Woods/Hybrids/Irons are pure precision. The Driver keeps its MAX carry but its power
 * gesture FLOORS at the raised min — you can't dial the driver short (switch clubs to lay up).
 */

const ITEMS = ['distance-driver', 'distance-woods', 'distance-hybrids', 'distance-irons'];

/** A shotSpread threading the loadout's per-family carry-control fields (mirrors the real play path). */
function spread(
  hole: ReturnType<typeof generateCourse>['holes'][number],
  from: Vec,
  lie: string,
  clubId: string,
  perks: string[],
  power = 1,
) {
  const lo = loadoutFromPerks(perks);
  const club = CLUBS.find((c) => c.id === clubId)!;
  return shotSpread(hole, from, lie as never, hole.green, club, {
    dispersionMult: netDispersion(lo),
    power,
    minCarryBoost: lo.minCarryBoost,
    wedgeWindow: lo.wedgeWindow,
    minCarryBoostByClass: lo.minCarryBoostByClass,
    driverPowerFloor: lo.driverPowerFloor,
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

  it('only the Driver item carries the power-floor trade-off', () => {
    expect(loadoutFromPerks(['distance-driver']).driverPowerFloor).toBeCloseTo(0.84);
    expect(loadoutFromPerks(['distance-woods']).driverPowerFloor).toBeUndefined();
    expect(loadoutFromPerks(['distance-irons']).driverPowerFloor).toBeUndefined();
  });

  it('the Driver item is idempotent on a rebuild (the floor never stacks lower)', () => {
    expect(loadoutFromPerks(['distance-driver', 'distance-driver']).driverPowerFloor).toBeCloseTo(0.84);
  });

  it('a base loadout carries none of the new fields (byte-for-byte default)', () => {
    const lo = startingLoadout();
    expect(lo.minCarryBoostByClass).toBeUndefined();
    expect(lo.driverPowerFloor).toBeUndefined();
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

describe('GS-proshop-distance-items — the Driver power-floor trade-off', () => {
  const hole = generateCourse(4242).holes[0]!;

  it('a FULL-power driver keeps its max carry and raises its min (no top-end cut)', () => {
    const base = spread(hole, hole.tee, 'tee', 'D', [], 1);
    const boosted = spread(hole, hole.tee, 'tee', 'D', ['distance-driver'], 1);
    // Max carry is UNCHANGED (the old top-end shave is gone).
    expect(boosted.carryHigh).toBeCloseTo(base.carryHigh, 6);
    // Min carry rises (fewer weak drives).
    expect(boosted.carryLow).toBeGreaterThan(base.carryLow);
  });

  it('a LOW-power driver can no longer be dialed short — it floors near the full-power carry', () => {
    // Base: 1% power gives a tiny carry (you CAN hit the driver short).
    const base = spread(hole, hole.tee, 'tee', 'D', [], 0.01);
    const boosted = spread(hole, hole.tee, 'tee', 'D', ['distance-driver'], 0.01);
    // With the item, a 1% pull still carries a big fraction of a full driver — you can't lay up with it.
    expect(boosted.expectedCarry).toBeGreaterThan(base.expectedCarry * 5);
    const full = spread(hole, hole.tee, 'tee', 'D', ['distance-driver'], 1);
    // 1% power lands within the [floor, full] band (≈ the floor), not near zero.
    expect(boosted.expectedCarry).toBeGreaterThan(full.expectedCarry * 0.7);
  });

  it('the floor is DRIVER-only — a wood at low power still plays short', () => {
    const woodBase = spread(hole, hole.tee, 'tee', '3W', [], 0.1);
    const woodItem = spread(hole, hole.tee, 'tee', '3W', ['distance-driver'], 0.1);
    expect(woodItem.expectedCarry).toBeCloseTo(woodBase.expectedCarry, 6); // the driver floor doesn't touch woods
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
      driverPowerFloor: lo.driverPowerFloor,
    });
    sf += playTotals(played.map((p) => p.record)).stableford;
  }
  return sf / n;
}

describe('GS-proshop-distance-items — a power-up must not lower scoring (contract 4)', () => {
  const base = meanStableford([]);
  it('no single item lowers mean per-stop Stableford (the driver keeps its max → average rises)', () => {
    for (const id of ITEMS) {
      expect(meanStableford([id]), id).toBeGreaterThanOrEqual(base - 0.2);
    }
  });
  it('carrying all four never lowers scoring', () => {
    expect(meanStableford(ITEMS)).toBeGreaterThanOrEqual(base - 0.2);
  });
});
