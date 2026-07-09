import { describe, it, expect } from 'vitest';
import {
  BAG_SETS,
  applyBagTier,
  bagSet,
  bagSetUnlocked,
  bagTierRank,
  bagUnlockForClearedAscension,
  canBuyBagSet,
} from '../src/sim/rpg/bag';
import {
  equippedGearTheme,
  offerableClubs,
  startingLoadout,
} from '../src/sim/rpg/economy';
import { applyCharacter } from '../src/sim/rpg/characters';
import { RARITY_C } from '../src/sim/rpg/loot';
import { startRun, snapshotRun, resumeRun } from '../src/sim/rpg/run';
import { initState, reduce, type UiState } from '../src/ui/game';

const carryOf = (lo: { bag: { id: string; carry: number }[] }, id: string) => lo.bag.find((c) => c.id === id)?.carry;

describe('bag tiers (GS-bag-tiers)', () => {
  it('the table gates each tier on the right Ascension clear + Shard price', () => {
    expect(BAG_SETS.map((s) => [s.tier, s.cost, s.unlockMaxAscension, s.gateLabel])).toEqual([
      ['rare', 300, 3, 'A2'],
      ['epic', 1200, 7, 'A6'],
      ['legendary', 6000, 12, 'A11'],
    ]);
  });

  it('a cleared Ascension gate maps to the bag it unlocks (A2/A6/A11)', () => {
    expect(bagUnlockForClearedAscension(2)?.tier).toBe('rare');
    expect(bagUnlockForClearedAscension(6)?.tier).toBe('epic');
    expect(bagUnlockForClearedAscension(11)?.tier).toBe('legendary');
    // No bag is unlocked by clearing an off-gate level.
    expect(bagUnlockForClearedAscension(3)).toBeUndefined();
  });

  it('applyBagTier re-stamps EVERY default club to the tier rarity (common = no-op)', () => {
    const base = applyCharacter('feather-fade', startingLoadout());
    const common = applyBagTier(base, 'common');
    expect(common).toEqual(base); // byte-for-byte: feature-off path unchanged

    const rare = applyBagTier(base, 'rare');
    for (const c of rare.bag) expect(c.rarity).toBe('rare');
    expect(rare.bagTier).toBe('rare');
    // Planet rare: distance clubs gain +8 carry; scoring clubs keep base carry.
    expect(carryOf(rare, 'D')).toBe(258); // 250 + 8
    expect(carryOf(rare, '5W')).toBe(225); // 217 + 8
    expect(carryOf(rare, '6i')).toBe(carryOf(base, '6i')); // scoring → base carry, no overshoot
    // The themed putter folds in the set's make-window boost.
    expect(rare.puttBoost).toBeCloseTo(0.1, 5);
  });

  it('higher tiers stack more carry on the distance clubs + a steadier putter', () => {
    const base = applyCharacter('feather-fade', startingLoadout());
    const epic = applyBagTier(base, 'epic');
    const leg = applyBagTier(base, 'legendary');
    expect(carryOf(epic, 'D')).toBe(266); // +16 (Phoenix)
    expect(carryOf(leg, 'D')).toBe(274); // +24 (Solar Storm)
    expect(epic.puttBoost).toBeCloseTo(0.16, 5);
    expect(leg.puttBoost).toBeCloseTo(0.22, 5);
    for (const c of leg.bag) expect(c.rarity).toBe('legendary');
  });

  it("folds the golfer's distance bonus onto the upgraded distance clubs (Larry +14)", () => {
    const base = applyCharacter('longshot-larry', startingLoadout());
    const rare = applyBagTier(base, 'rare');
    expect(carryOf(rare, 'D')).toBe(250 + 8 + 14); // base + set + Larry's distance trait
    // Larry refuses hybrids, so his bag still carries the 3-iron (no hybrid sneaks in).
    expect(rare.bag.some((c) => c.id === '3i')).toBe(true);
    expect(rare.bag.some((c) => /H$/.test(c.id))).toBe(false);
  });

  it('startRun bakes the bag tier in → the golfer swings the themed gear', () => {
    const run = startRun(7, 'voyage', {}, 'feather-fade', 0, 'legendary');
    expect(run.bagTier).toBe('legendary');
    expect(run.loadout.bagTier).toBe('legendary');
    expect(equippedGearTheme(run.loadout)?.theme).toBe('solarstorm');
  });

  it('a common-tier run is byte-for-byte identical to no bag tier (determinism)', () => {
    const off = startRun(42, 'voyage', {}, 'huang-woo-hook');
    const common = startRun(42, 'voyage', {}, 'huang-woo-hook', 0, 'common');
    expect(common.loadout.bag).toEqual(off.loadout.bag);
    expect(common.loadout.bagTier).toBeUndefined();
  });

  it('snapshot/resume round-trips the bag tier (the upgraded bag rebuilds)', () => {
    const run = startRun(11, 'voyage', {}, 'backspin-bo', 0, 'epic');
    const snap = snapshotRun(run);
    expect(snap.bagTier).toBe('epic');
    const resumed = resumeRun(snap);
    expect(resumed.bagTier).toBe('epic');
    expect(resumed.loadout.bag).toEqual(run.loadout.bag);
  });

  it('the Pro Shop hides clubs BELOW the bag tier (a purple bag → no rare clubs)', () => {
    const epic = startRun(3, 'voyage', {}, 'feather-fade', 0, 'epic');
    const offered = offerableClubs(epic.loadout);
    expect(offered.length).toBeGreaterThan(0);
    for (const it of offered) expect(RARITY_C[it.rarity].order).toBeGreaterThanOrEqual(RARITY_C.epic.order);
    // A common bag floors at nothing, so it still sees rare clubs.
    const common = startRun(3, 'voyage', {}, 'feather-fade');
    expect(offerableClubs(common.loadout).some((it) => it.rarity === 'rare')).toBe(true);
  });
});

describe('bag-tier unlock + purchase gating', () => {
  it('canBuyBagSet needs the gate cleared, a higher tier, and the shards', () => {
    const planet = bagSet('rare')!;
    expect(bagSetUnlocked(planet, 2)).toBe(false); // A2 not yet cleared (maxAscension < 3)
    expect(bagSetUnlocked(planet, 3)).toBe(true);
    expect(canBuyBagSet(planet, 'common', 2, 9999)).toBe(false); // locked
    expect(canBuyBagSet(planet, 'common', 3, 299)).toBe(false); // too poor (post-cut 300)
    expect(canBuyBagSet(planet, 'common', 3, 300)).toBe(true);
    // Already at a higher tier → not a purchase.
    expect(canBuyBagSet(planet, 'epic', 12, 999999)).toBe(false);
    expect(bagTierRank('common') < bagTierRank('rare')).toBe(true);
  });

  it('the reducer buys a bag tier with shards and carries it into the next run', () => {
    let s: UiState = initState(1, { maxAscension: 7, shards: 5000 });
    s = { ...s, screen: 'trademarket' };
    s = reduce(s, { type: 'buyBagTier', tier: 'epic' });
    expect(s.bagTier).toBe('epic');
    expect(s.shards).toBe(3800); // 5000 − 1200 (epic bag, post GS-trade-rebalance cut)
    // Start a voyage → the run is built with the epic bag.
    s = { ...s, screen: 'title' };
    s = reduce(s, { type: 'start', format: 'voyage' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    expect(s.run.bagTier).toBe('epic');
    expect(s.run.loadout.bag.every((c) => c.rarity === 'epic')).toBe(true);
  });

  it('a per-golfer wardrobe bag tier is used in EVERY mode, incl. the Voyage (GS-wardrobe-bagtier)', () => {
    let s: UiState = initState(1, { maxAscension: 7, shards: 5000 });
    s = reduce({ ...s, screen: 'trademarket' }, { type: 'buyBagTier', tier: 'epic' });
    expect(s.bagTier).toBe('epic');
    // Set feather-fade DOWN to the common starter set in the wardrobe.
    s = { ...s, screen: 'clubhouse', manageCharacterId: 'feather-fade' };
    s = reduce(s, { type: 'setCharacterBagTier', tier: 'common' });
    expect(s.bagTierByCharacter['feather-fade']).toBe('common');
    // A VOYAGE with feather-fade now plays the common bag (used to always play the owned epic tier).
    s = reduce({ ...s, screen: 'title' }, { type: 'start', format: 'voyage' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    expect(s.run.bagTier).toBe('common');
    expect(s.run.loadout.bag.every((c) => c.rarity === 'common')).toBe(true);
    // A different golfer with no wardrobe pick still gets the owned epic bag.
    s = reduce({ ...s, screen: 'title' }, { type: 'start', format: 'voyage' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'longshot-larry' });
    expect(s.run.bagTier).toBe('epic');
  });

  it('picking the owned tier clears a golfer override; buying a new tier resets EVERY golfer to it', () => {
    let s: UiState = initState(1, { maxAscension: 7, shards: 5000 });
    s = reduce({ ...s, screen: 'trademarket' }, { type: 'buyBagTier', tier: 'rare' });
    s = { ...s, screen: 'clubhouse', manageCharacterId: 'feather-fade' };
    // A weaker pick stores an override…
    s = reduce(s, { type: 'setCharacterBagTier', tier: 'common' });
    expect(s.bagTierByCharacter['feather-fade']).toBe('common');
    // …and re-picking the owned tier clears it (the golfer follows the owned bag again).
    s = reduce(s, { type: 'setCharacterBagTier', tier: 'rare' });
    expect(s.bagTierByCharacter['feather-fade']).toBeUndefined();
    // Re-set an override, then BUY a higher tier — every golfer resets to the fresh best bag.
    s = reduce(s, { type: 'setCharacterBagTier', tier: 'common' });
    s = reduce({ ...s, screen: 'trademarket' }, { type: 'buyBagTier', tier: 'epic' });
    expect(s.bagTier).toBe('epic');
    expect(s.bagTierByCharacter).toEqual({});
  });

  it('a golfer bag tier can never exceed the owned tier (no free upgrade)', () => {
    let s: UiState = initState(1, { maxAscension: 3, shards: 5000 });
    s = reduce({ ...s, screen: 'trademarket' }, { type: 'buyBagTier', tier: 'rare' });
    s = { ...s, screen: 'clubhouse', manageCharacterId: 'feather-fade' };
    // Epic is above the owned rare tier → the reducer refuses the pick.
    s = reduce(s, { type: 'setCharacterBagTier', tier: 'epic' });
    expect(s.bagTierByCharacter['feather-fade']).toBeUndefined();
    expect(s.bagTier).toBe('rare');
  });

  it('the reducer refuses a locked or unaffordable bag tier', () => {
    let s: UiState = initState(1, { maxAscension: 2, shards: 100000 });
    s = { ...s, screen: 'trademarket' };
    // A2 not cleared (maxAscension 2 < 3) → rare bag stays locked.
    s = reduce(s, { type: 'buyBagTier', tier: 'rare' });
    expect(s.bagTier).toBe('common');
    expect(s.shards).toBe(100000);
    // Unlocked but broke.
    let poor: UiState = { ...initState(1, { maxAscension: 3, shards: 100 }), screen: 'trademarket' };
    poor = reduce(poor, { type: 'buyBagTier', tier: 'rare' });
    expect(poor.bagTier).toBe('common');
  });
});
