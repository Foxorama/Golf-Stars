import { describe, it, expect } from 'vitest';
import {
  APPAREL,
  APPAREL_COST,
  apparelById,
  apparelForSlot,
  canBuyApparel,
  equippedSet,
} from '../src/sim/rpg/apparel';
import { COSMETIC_RARITY } from '../src/sim/rpg/cosmetics';

describe('apparel catalogue (GS-cosmetics)', () => {
  it('has hats and shirts across every rarity tier, incl. a mythic of each slot', () => {
    const hats = APPAREL.filter((a) => a.slot === 'hat');
    const shirts = APPAREL.filter((a) => a.slot === 'shirt');
    expect(hats.length).toBeGreaterThanOrEqual(5);
    expect(shirts.length).toBeGreaterThanOrEqual(5);
    for (const tier of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) {
      expect(hats.some((h) => h.rarity === tier)).toBe(true); // a hat at every tier
    }
    // Exactly one mythic per slot, and they cost the headline 500 shards.
    const mythicHat = hats.find((h) => h.rarity === 'mythic')!;
    const mythicShirt = shirts.find((s) => s.rarity === 'mythic')!;
    expect(mythicHat.cost).toBe(500);
    expect(mythicShirt.cost).toBe(500);
  });

  it('every garment has a unique id, a render look, and a tier-priced cost', () => {
    expect(new Set(APPAREL.map((a) => a.id)).size).toBe(APPAREL.length);
    for (const a of APPAREL) {
      expect(a.look.shape).toBeTruthy();
      expect(a.cost).toBe(APPAREL_COST[a.rarity]);
    }
  });

  it('the traditional space suit + helmet are a legendary Astronaut set', () => {
    const helmet = apparelById('helmet-astro')!;
    const suit = apparelById('suit-space')!;
    expect(helmet.slot).toBe('hat');
    expect(suit.slot).toBe('shirt');
    expect(helmet.set).toBe('Astronaut');
    expect(suit.set).toBe('Astronaut');
    expect(helmet.rarity).toBe('legendary');
    expect(suit.rarity).toBe('legendary');
  });

  it('the mythic Supernova hat + shirt form one super-cool set', () => {
    const crown = apparelById('crown-supernova')!;
    const suit = apparelById('suit-supernova')!;
    expect(crown.set).toBe('Supernova');
    expect(suit.set).toBe('Supernova');
    expect(crown.rarity).toBe('mythic');
    expect(suit.rarity).toBe('mythic');
    // Equipping both halves reports the set as complete.
    expect(equippedSet(crown.id, suit.id)).toBe('Supernova');
    // A mismatched pair is not a set.
    expect(equippedSet(crown.id, 'polo-classic')).toBeUndefined();
    // Rookie basics (many standalone pieces) never read as a "set".
    expect(equippedSet('cap-classic', 'polo-classic')).toBeUndefined();
  });

  it('apparelForSlot returns each slot sorted by ascending rarity', () => {
    const hats = apparelForSlot('hat');
    for (let i = 1; i < hats.length; i++) {
      expect(COSMETIC_RARITY[hats[i]!.rarity].order).toBeGreaterThanOrEqual(COSMETIC_RARITY[hats[i - 1]!.rarity].order);
    }
  });

  it('canBuyApparel gates on affordability + ownership', () => {
    const cap = apparelById('cap-classic')!;
    expect(canBuyApparel(cap, 15, [])).toBe(true); // exactly affordable
    expect(canBuyApparel(cap, 14, [])).toBe(false); // one short
    expect(canBuyApparel(cap, 999, ['cap-classic'])).toBe(false); // already owned
    expect(canBuyApparel(undefined, 999, [])).toBe(false);
  });
});
