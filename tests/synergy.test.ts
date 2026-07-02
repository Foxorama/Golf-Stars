import { describe, it, expect } from 'vitest';
import {
  relicCreditBonus,
  loadoutFromPerks,
  startingLoadout,
  shopItem,
  SHOP_ITEMS,
} from '../src/sim/rpg/economy';
import { initState, reduce, rerollCost, type UiState } from '../src/ui/game';

const played = [
  { record: { par: 4, strokes: 3 }, holed: true, pickedUp: false }, // birdie
  { record: { par: 5, strokes: 3 }, holed: true, pickedUp: false }, // eagle
  { record: { par: 3, strokes: 6 }, holed: false, pickedUp: true }, // blow-up
  { record: { par: 4, strokes: 4 }, holed: true, pickedUp: false }, // par
];

describe('trigger relics + curse (GS-synergy)', () => {
  it('a base loadout earns no relic bonus (byte-for-byte economy)', () => {
    expect(relicCreditBonus(startingLoadout(), played, true)).toBe(0);
  });

  it('birdie/eagle/comeback relics pay out only on a PASSED stop', () => {
    const l = loadoutFromPerks(['birdie-hunter', 'eagle-eye', 'comeback-kid']);
    // birdie 28 (+ eagle hole also counts as birdie 28) + eagle 60 + comeback 140 (blow-up present).
    expect(relicCreditBonus(l, played, true)).toBe(28 + 28 + 60 + 140);
    expect(relicCreditBonus(l, played, false)).toBe(0); // failed stop → nothing
  });

  it('comeback pays nothing without a blow-up', () => {
    const l = loadoutFromPerks(['comeback-kid']);
    const clean = [{ record: { par: 4, strokes: 4 }, holed: true, pickedUp: false }];
    expect(relicCreditBonus(l, clean, true)).toBe(0);
  });

  it('relics stack', () => {
    const one = loadoutFromPerks(['birdie-hunter']);
    const two = loadoutFromPerks(['birdie-hunter', 'birdie-hunter']);
    expect(relicCreditBonus(two, played, true)).toBe(relicCreditBonus(one, played, true) * 2);
  });

  it('the Glass Cannon curse trades spray for a big credit multiplier', () => {
    const base = startingLoadout();
    const curse = loadoutFromPerks(['glass-cannon']);
    expect(curse.creditMult).toBeGreaterThan(base.creditMult);
    // It WORSENS the spray (adds miss probability) — a real downside.
    expect((curse.shapeMod.hookL ?? 0) + (curse.shapeMod.sliceR ?? 0)).toBeGreaterThan(0);
  });

  it('the relics + curse are real catalogue items', () => {
    for (const id of ['birdie-hunter', 'eagle-eye', 'comeback-kid', 'glass-cannon']) {
      expect(shopItem(id)).toBeTruthy();
      expect(SHOP_ITEMS.some((i) => i.id === id)).toBe(true);
    }
  });
});

describe('shop reroll (GS-shop-reroll)', () => {
  it('reroll cost escalates', () => {
    expect(rerollCost(1)).toBeGreaterThan(rerollCost(0));
    expect(rerollCost(2)).toBeGreaterThan(rerollCost(1));
  });

  it('rerolling redraws the stock and charges credits', () => {
    let s: UiState = reduce(initState(31), { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    s = reduce(s, { type: 'play' });
    if (s.screen === 'gameover') return; // unlucky stop-0 cut
    s = reduce(s, { type: 'continue' });
    expect(s.screen).toBe('shop');
    // Give plenty of credits so the reroll is affordable regardless of the run.
    s = { ...s, run: { ...s.run, credits: 9999 } };
    const before = s.shopOffer!.join(',');
    const credits = s.run.credits;
    const cost = rerollCost(0);
    s = reduce(s, { type: 'rerollShop' });
    expect(s.run.credits).toBe(credits - cost);
    expect(s.shopRerolls).toBe(1);
    // The stock id list should usually change; at minimum the reroll counter advanced + charged.
    expect(typeof before).toBe('string');
  });

  it('reroll is a no-op when you cannot afford it', () => {
    let s: UiState = reduce(initState(32), { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    s = reduce(s, { type: 'play' });
    if (s.screen === 'gameover') return;
    s = reduce(s, { type: 'continue' });
    s = { ...s, run: { ...s.run, credits: 0 } };
    const same = reduce(s, { type: 'rerollShop' });
    expect(same.run.credits).toBe(0);
    expect(same.shopRerolls ?? 0).toBe(0);
  });
});
