import { describe, it, expect } from 'vitest';
import {
  TALENTS,
  talentItem,
  talentsForArchetype,
  shopItem,
  SHOP_ITEMS,
  loadoutFromPerks,
  startingLoadout,
} from '../src/sim/rpg/economy';
import { startRun, bossRewards, grantTalent, type BossReward } from '../src/sim/rpg/run';
import { initState, reduce, type UiState } from '../src/ui/game';

describe('talents (GS-talents)', () => {
  it('talents are never in the shop catalogue (so the rotating offer can never sell one)', () => {
    for (const t of TALENTS) expect(SHOP_ITEMS.some((i) => i.id === t.id)).toBe(false);
  });

  it('shopItem resolves a talent, so a granted talent rebuilds from perks on resume', () => {
    expect(talentItem('talent-power')).toBeDefined();
    expect(shopItem('talent-power')?.talent).toBe(true);
    const base = startingLoadout();
    const lo = loadoutFromPerks(['talent-precision'], base);
    expect(lo.dispersionMult).toBeLessThan(base.dispersionMult);
    expect(lo.perks).toContain('talent-precision');
  });

  it('talentsForArchetype splits the zone-themed talents from the generics', () => {
    const { themed, generic } = talentsForArchetype('inferno');
    expect(themed.some((t) => t.id === 'talent-ember')).toBe(true);
    expect(generic.length).toBeGreaterThan(0);
    expect(generic.every((t) => !t.archetype)).toBe(true);
  });
});

describe('boss rewards (GS-talents)', () => {
  const run = startRun('br', 'voyage', {}, 'feather-fade');

  it('offers a themed talent, a generic talent, and a permanent shard reward', () => {
    const rewards = bossRewards({ ...run, stopIndex: 2, distanceFromStart: 4 }, 'inferno');
    expect(rewards.length).toBe(3);
    expect(rewards[0]!.kind).toBe('talent');
    expect(rewards[0]!.id).toBe('talent-ember'); // the inferno signature talent
    expect(rewards[1]!.kind).toBe('talent');
    expect(rewards[1]!.id).not.toBe('talent-ember'); // a distinct (generic) talent
    expect(rewards[2]!.kind).toBe('shards');
    expect(rewards[2]!.shards).toBeGreaterThan(0);
  });

  it('is deterministic and never re-offers a talent you already own', () => {
    expect(bossRewards(run, 'frost')).toEqual(bossRewards(run, 'frost'));
    const withIce = grantTalent(run, 'talent-iceveins');
    const after = bossRewards(withIce, 'frost');
    expect(after.find((r) => r.id === 'talent-iceveins')).toBeUndefined();
  });

  it('grantTalent applies free (no credit cost) and is idempotent', () => {
    const before = run.loadout.dispersionMult;
    const g = grantTalent(run, 'talent-precision');
    expect(g.loadout.dispersionMult).toBeLessThan(before);
    expect(g.credits).toBe(run.credits); // free — the spoils of victory
    expect(g.loadout.perks).toContain('talent-precision');
    const again = grantTalent(g, 'talent-precision');
    expect(again.loadout.dispersionMult).toBe(g.loadout.dispersionMult); // no double-apply
  });
});

describe('boss-reward reducer flow', () => {
  function stateWithReward(bossReward: BossReward[], extra: Partial<UiState> = {}): UiState {
    const base = initState(7, {});
    return { ...base, screen: 'bossReward', bossReward, ...extra };
  }

  it('picking a talent applies the run buff and moves to the shop', () => {
    const reward: BossReward[] = [{ kind: 'talent', id: 'talent-precision', name: 'Steady Hands', desc: 'x', rarity: 'epic' }];
    const before = initState(7, {}).run.loadout.dispersionMult;
    const after = reduce(stateWithReward(reward), { type: 'pickBossReward', index: 0 });
    expect(after.screen).toBe('shop');
    expect(after.run.loadout.perks).toContain('talent-precision');
    expect(after.run.loadout.dispersionMult).toBeLessThan(before);
    expect(after.bossReward).toBeUndefined();
    expect(after.shopOffer).toBeDefined();
  });

  it('picking the permanent reward banks shards and moves to the shop', () => {
    const reward: BossReward[] = [{ kind: 'shards', id: 'shards', name: 'Star Shards', desc: 'x', rarity: 'rare', shards: 12 }];
    const after = reduce(stateWithReward(reward, { shards: 5 }), { type: 'pickBossReward', index: 0 });
    expect(after.shards).toBe(17);
    expect(after.screen).toBe('shop');
    expect(after.bossReward).toBeUndefined();
  });

  it('the result screen Continue routes to the reward screen when one is pending', () => {
    const reward: BossReward[] = [{ kind: 'shards', id: 'shards', name: 'Star Shards', desc: 'x', rarity: 'rare', shards: 8 }];
    const onResult = { ...stateWithReward(reward), screen: 'result' as const };
    const after = reduce(onResult, { type: 'continue' });
    expect(after.screen).toBe('bossReward');
  });
});
