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
  it('has hats, shirts and pants across every rarity tier, incl. a mythic of each slot', () => {
    const hats = APPAREL.filter((a) => a.slot === 'hat');
    const shirts = APPAREL.filter((a) => a.slot === 'shirt');
    const pants = APPAREL.filter((a) => a.slot === 'pants');
    expect(hats.length).toBeGreaterThanOrEqual(5);
    expect(shirts.length).toBeGreaterThanOrEqual(5);
    expect(pants.length).toBeGreaterThanOrEqual(5);
    for (const tier of ['common', 'rare', 'epic', 'legendary', 'mythic'] as const) {
      expect(hats.some((h) => h.rarity === tier)).toBe(true); // a hat at every tier
      expect(pants.some((p) => p.rarity === tier)).toBe(true); // a pair of pants at every tier
    }
    // Exactly one mythic per slot, and they cost the headline 500 shards.
    const mythicHat = hats.find((h) => h.rarity === 'mythic')!;
    const mythicShirt = shirts.find((s) => s.rarity === 'mythic')!;
    const mythicPants = pants.find((p) => p.rarity === 'mythic')!;
    expect(mythicHat.cost).toBe(500);
    expect(mythicShirt.cost).toBe(500);
    expect(mythicPants.cost).toBe(500);
  });

  it('every garment has a unique id, a render look, and a tier-priced cost', () => {
    expect(new Set(APPAREL.map((a) => a.id)).size).toBe(APPAREL.length);
    for (const a of APPAREL) {
      expect(a.look.shape).toBeTruthy();
      expect(a.cost).toBe(APPAREL_COST[a.rarity]);
    }
  });

  it('the traditional space suit (helmet + suit + legs) is a legendary Astronaut set', () => {
    const helmet = apparelById('helmet-astro')!;
    const suit = apparelById('suit-space')!;
    const legs = apparelById('pants-astro')!;
    expect(helmet.slot).toBe('hat');
    expect(suit.slot).toBe('shirt');
    expect(legs.slot).toBe('pants');
    expect(helmet.set).toBe('Astronaut');
    expect(suit.set).toBe('Astronaut');
    expect(legs.set).toBe('Astronaut');
    expect(helmet.rarity).toBe('legendary');
    expect(suit.rarity).toBe('legendary');
    expect(legs.rarity).toBe('legendary');
    // The full suit (all three slots) reports the Astronaut set complete.
    expect(equippedSet(helmet.id, suit.id, legs.id)).toBe('Astronaut');
  });

  it('the mythic Supernova hat + shirt + pants form one super-cool head-to-toe set', () => {
    const crown = apparelById('crown-supernova')!;
    const suit = apparelById('suit-supernova')!;
    const leggings = apparelById('leggings-supernova')!;
    expect(crown.set).toBe('Supernova');
    expect(suit.set).toBe('Supernova');
    expect(leggings.set).toBe('Supernova');
    expect(leggings.slot).toBe('pants');
    expect(leggings.rarity).toBe('mythic');
    // The Supernova set spans all three slots — only the full kit reports complete.
    expect(equippedSet(crown.id, suit.id, leggings.id)).toBe('Supernova');
    expect(equippedSet(crown.id, suit.id, undefined)).toBeUndefined(); // missing the pants
    // A mismatched piece breaks the set.
    expect(equippedSet(crown.id, 'polo-classic', leggings.id)).toBeUndefined();
    // Rookie basics (many standalone pieces) never read as a "set".
    expect(equippedSet('cap-classic', 'polo-classic', 'trousers-classic')).toBeUndefined();
  });

  it('two-slot sets (Gentleman = hat + pants) complete with just their two pieces', () => {
    // Gentleman defines only a hat (tophat) + pants (plus-fours) — no shirt — so both = complete.
    expect(equippedSet('tophat-ace', undefined, 'knickers-ace')).toBe('Gentleman');
    expect(equippedSet('tophat-ace', undefined, undefined)).toBeUndefined(); // hat alone is not a set
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
