import { describe, it, expect } from 'vitest';
import {
  META_UPGRADES,
  META_COST_GROWTH,
  buyMetaUpgrade,
  canBuyMeta,
  metaLevel,
  metaStartingCredits,
  metaStartingLoadout,
  metaUpgrade,
  metaUpgradeCost,
} from '../src/sim/rpg/meta';
import { STARTING_CREDITS, startingLoadout } from '../src/sim/rpg/economy';
import { startRun, snapshotRun, resumeRun, shardsForRun, buy, type Run } from '../src/sim/rpg/run';

describe('meta upgrade table', () => {
  it('every upgrade has a sane shape and a ramping cost', () => {
    for (const u of META_UPGRADES) {
      expect(u.maxLevel).toBeGreaterThan(0);
      expect(u.baseCost).toBeGreaterThan(0);
      expect(metaUpgradeCost(u, 0)).toBe(u.baseCost);
      expect(metaUpgradeCost(u, 1)).toBe(Math.round(u.baseCost * META_COST_GROWTH));
      expect(metaUpgradeCost(u, 2)).toBeGreaterThan(metaUpgradeCost(u, 1));
    }
  });

  it('canBuyMeta respects the max level and affordability', () => {
    const u = metaUpgrade('vet-hands')!;
    expect(canBuyMeta(u, 0, 1000)).toBe(true);
    expect(canBuyMeta(u, u.maxLevel, 99999)).toBe(false); // maxed
    expect(canBuyMeta(u, 0, 0)).toBe(false); // can't afford
  });
});

describe('meta application to the starting loadout', () => {
  it('with no upgrades, the start equals the vanilla loadout/credits', () => {
    expect(metaStartingLoadout({})).toEqual(startingLoadout());
    expect(metaStartingCredits({})).toBe(STARTING_CREDITS);
  });

  it('Veteran Hands lowers the starting handicap by 2 per level', () => {
    const base = startingLoadout().handicap;
    expect(metaStartingLoadout({ 'vet-hands': 1 }).handicap).toBe(base - 2);
    expect(metaStartingLoadout({ 'vet-hands': 3 }).handicap).toBe(base - 6);
  });

  it('Tour Bag adds distance to the distance clubs from the start', () => {
    const baseD = startingLoadout().bag.find((c) => c.id === 'D')!.carry;
    expect(metaStartingLoadout({ 'tour-bag': 2 }).bag.find((c) => c.id === 'D')!.carry).toBe(baseD + 12);
    // scoring clubs untouched
    const basePW = startingLoadout().bag.find((c) => c.id === 'PW')!.carry;
    expect(metaStartingLoadout({ 'tour-bag': 2 }).bag.find((c) => c.id === 'PW')!.carry).toBe(basePW);
  });

  it('Steady Grip tightens dispersion; Deep Pockets adds starting credits only', () => {
    expect(metaStartingLoadout({ 'steady-grip': 2 }).dispersionMult).toBeCloseTo(0.96 * 0.96);
    expect(metaStartingCredits({ 'deep-pockets': 3 })).toBe(STARTING_CREDITS + 120);
    // Deep Pockets does not touch the loadout.
    expect(metaStartingLoadout({ 'deep-pockets': 3 })).toEqual(startingLoadout());
  });
});

describe('buying meta upgrades with shards', () => {
  it('deducts shards, levels up, and refuses maxed/unaffordable buys', () => {
    let meta = {};
    let shards = 100;
    const u = metaUpgrade('deep-pockets')!;
    ({ meta, shards } = buyMetaUpgrade(meta, shards, 'deep-pockets'));
    expect(metaLevel(meta, 'deep-pockets')).toBe(1);
    expect(shards).toBe(100 - u.baseCost);
    // Second level costs more.
    const before = shards;
    ({ meta, shards } = buyMetaUpgrade(meta, shards, 'deep-pockets'));
    expect(metaLevel(meta, 'deep-pockets')).toBe(2);
    expect(before - shards).toBe(metaUpgradeCost(u, 1));
    // Unaffordable is a no-op (same refs).
    const broke = buyMetaUpgrade(meta, 0, 'deep-pockets');
    expect(broke.meta).toBe(meta);
    expect(broke.shards).toBe(0);
  });

  it('a bad id is a no-op', () => {
    const r = buyMetaUpgrade({}, 100, 'nope');
    expect(r).toEqual({ meta: {}, shards: 100 });
  });
});

describe('meta wired into the run', () => {
  it('startRun bakes meta into the starting loadout and credits', () => {
    const run = startRun(1, undefined, { 'vet-hands': 2, 'deep-pockets': 1 });
    expect(run.loadout.handicap).toBe(startingLoadout().handicap - 4);
    expect(run.credits).toBe(STARTING_CREDITS + 40);
    expect(run.meta).toEqual({ 'vet-hands': 2, 'deep-pockets': 1 });
  });

  it('snapshot/resume round-trips meta, and perks rebuild OVER the meta base', () => {
    let run = startRun(42, undefined, { 'vet-hands': 3 });
    run = { ...run, credits: 10000 };
    run = buy(run, 'pro-coach'); // −6 handicap shop perk, on top of the −6 from meta
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.meta).toEqual({ 'vet-hands': 3 });
    // 18 (base) − 6 (vet-hands×3) − 6 (pro-coach) = 6
    expect(resumed.loadout.handicap).toBe(6);
    expect(resumed.loadout.perks).toContain('pro-coach');
  });

  it('shardsForRun rewards distance + stops and is floored at 1', () => {
    const ended = (distance: number, stops: number): Run => ({
      seed: 1,
      formatId: 'flat',
      stopIndex: stops,
      distanceFromStart: distance,
      credits: 0,
      loadout: startingLoadout(),
      meta: {},
      ascension: 0,
      bonusShards: 0,
      firedEventIds: [],
      status: 'ended',
      history: Array.from({ length: stops }, () => ({}) as never),
    });
    expect(shardsForRun(ended(10, 6))).toBe(10 * 3 + 6 * 2);
    expect(shardsForRun(ended(0, 0))).toBe(1); // a stop-1 brick still pays something
    expect(shardsForRun(ended(3, 2))).toBeGreaterThan(shardsForRun(ended(1, 1)));
  });
});
