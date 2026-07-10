import { describe, it, expect } from 'vitest';
import {
  APPAREL,
  APPAREL_COST,
  apparelById,
  apparelForSlot,
  apparelRevealedInMarket,
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
    // Exactly one mythic per slot, and they cost the headline 300 shards (post GS-trade-rebalance cut).
    const mythicHat = hats.find((h) => h.rarity === 'mythic')!;
    const mythicShirt = shirts.find((s) => s.rarity === 'mythic')!;
    const mythicPants = pants.find((p) => p.rarity === 'mythic')!;
    expect(mythicHat.cost).toBe(300);
    expect(mythicShirt.cost).toBe(300);
    expect(mythicPants.cost).toBe(300);
  });

  it('every garment has a unique id, a render look, and a tier-priced cost', () => {
    expect(new Set(APPAREL.map((a) => a.id)).size).toBe(APPAREL.length);
    for (const a of APPAREL) {
      expect(a.look.shape).toBeTruthy();
      // A secret earn-only piece (GS-thor) is never bought, so it costs 0; everything else is tier-priced.
      if (a.secret) expect(a.cost).toBe(0);
      else expect(a.cost).toBe(APPAREL_COST[a.rarity]);
    }
  });

  it("Thor's Hammer is a secret, earn-only mythic DRIVER (GS-thor) — never buyable, hidden until owned", () => {
    const hammer = apparelById('thors-hammer')!;
    expect(hammer.slot).toBe('driver');
    expect(hammer.rarity).toBe('mythic');
    expect(hammer.secret).toBe(true);
    expect(hammer.cost).toBe(0);
    // The driver slot resolves it (and it's the mythic in that slot).
    expect(apparelForSlot('driver').map((a) => a.id)).toContain('thors-hammer');
    // Never buyable, even with a fortune in shards.
    expect(canBuyApparel(hammer, 999999, [])).toBe(false);
    // Hidden from the Trade Market until owned, then revealed (the one reveal predicate per catalogue).
    expect(apparelRevealedInMarket(hammer, [])).toBe(false);
    expect(apparelRevealedInMarket(hammer, ['thors-hammer'])).toBe(true);
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

  it('the Valkyrie helm + cuirass + greaves are a buyable legendary head-to-toe set (GS-valkyrie)', () => {
    const helm = apparelById('helm-valkyrie')!;
    const cuirass = apparelById('cuirass-valkyrie')!;
    const greaves = apparelById('greaves-valkyrie')!;
    expect(helm.slot).toBe('hat');
    expect(cuirass.slot).toBe('shirt');
    expect(greaves.slot).toBe('pants');
    for (const piece of [helm, cuirass, greaves]) {
      expect(piece.set).toBe('Valkyrie');
      expect(piece.rarity).toBe('legendary');
      // Shard-bought, not an earned trophy — always in the market, buyable when affordable.
      expect(piece.unlockHoles).toBeUndefined();
      expect(piece.secret).toBeUndefined();
      expect(piece.cost).toBe(APPAREL_COST.legendary);
      expect(apparelRevealedInMarket(piece, [])).toBe(true);
      expect(canBuyApparel(piece, APPAREL_COST.legendary, [])).toBe(true);
      expect(piece.look.glow).toBeTruthy(); // legendary aura
    }
    // Distinct armoured shapes so the set reads as battle-dress, not reskinned basics.
    expect(helm.look.shape).toBe('wingedHelm');
    expect(cuirass.look.shape).toBe('valkyrie');
    expect(greaves.look.shape).toBe('greaves');
    // All three slots → the Valkyrie set reports complete; any missing piece does not.
    expect(equippedSet(helm.id, cuirass.id, greaves.id)).toBe('Valkyrie');
    expect(equippedSet(helm.id, cuirass.id, undefined)).toBeUndefined();
    expect(equippedSet(helm.id, 'polo-classic', greaves.id)).toBeUndefined();
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
    // The Supernova crown is now the detonating-star crown (GS-solar-flames) — set-matched to the
    // nebula suit/leggings. The old flame crown moved out to the Solar Flames set (asserted below).
    expect(crown.look.shape).toBe('supernova');
    expect(suit.look.shape).toBe('cosmic');
    expect(leggings.look.shape).toBe('nebula');
    // The Supernova set spans all three slots — only the full kit reports complete.
    expect(equippedSet(crown.id, suit.id, leggings.id)).toBe('Supernova');
    expect(equippedSet(crown.id, suit.id, undefined)).toBeUndefined(); // missing the pants
    // A mismatched piece breaks the set.
    expect(equippedSet(crown.id, 'polo-classic', leggings.id)).toBeUndefined();
    // Rookie basics (many standalone pieces) never read as a "set".
    expect(equippedSet('cap-classic', 'polo-classic', 'trousers-classic')).toBeUndefined();
  });

  it('the mythic Solar Flames hat + shirt + pants form one head-to-toe set (GS-solar-flames)', () => {
    const crown = apparelById('crown-solarflames')!;
    const robe = apparelById('suit-solarflames')!;
    const leggings = apparelById('leggings-solarflames')!;
    expect(crown.set).toBe('Solar Flames');
    expect(robe.set).toBe('Solar Flames');
    expect(leggings.set).toBe('Solar Flames');
    expect(crown.rarity).toBe('mythic');
    expect(robe.rarity).toBe('mythic');
    expect(leggings.rarity).toBe('mythic');
    // The flame crown (the former Supernova crown) now heads Solar Flames, paired with the solar-flame
    // robe + ember leggings.
    expect(crown.look.shape).toBe('solarCrown');
    expect(robe.look.shape).toBe('solarflare');
    expect(leggings.look.shape).toBe('emberlegs');
    // The set spans all three slots — only the full kit reports complete.
    expect(equippedSet(crown.id, robe.id, leggings.id)).toBe('Solar Flames');
    expect(equippedSet(crown.id, robe.id, undefined)).toBeUndefined(); // missing the pants
    // Cross-set pieces never assemble a set (the flame crown does NOT complete Supernova).
    expect(equippedSet('crown-solarflames', 'suit-supernova', 'leggings-supernova')).toBeUndefined();
  });

  it('the mythic Punched Galaxy hat + shirt + pants form one super-epic head-to-toe set (GS-punched-galaxy)', () => {
    const crown = apparelById('crown-galaxy')!;
    const warplate = apparelById('suit-galaxy')!;
    const greaves = apparelById('leggings-galaxy')!;
    expect(crown.set).toBe('Punched Galaxy');
    expect(warplate.set).toBe('Punched Galaxy');
    expect(greaves.set).toBe('Punched Galaxy');
    expect(crown.rarity).toBe('mythic');
    expect(warplate.rarity).toBe('mythic');
    expect(greaves.rarity).toBe('mythic');
    // The starburst crown (the former Supernova crown) now heads the Punched Galaxy set, paired with
    // the galaxy-crack warplate + greaves.
    expect(crown.look.shape).toBe('starburst');
    expect(warplate.look.shape).toBe('riftplate');
    expect(greaves.look.shape).toBe('riftgreaves');
    // The set spans all three slots — only the full kit reports complete.
    expect(equippedSet(crown.id, warplate.id, greaves.id)).toBe('Punched Galaxy');
    expect(equippedSet(crown.id, warplate.id, undefined)).toBeUndefined(); // missing the pants
    // Cross-set pieces never assemble a set (the Supernova crown does NOT complete Punched Galaxy).
    expect(equippedSet('crown-supernova', warplate.id, greaves.id)).toBeUndefined();
  });

  it('the mythic Space Pirate Parrot tricorn + plumage + tailfeathers form one head-to-toe set (GS-space-pirate-parrot)', () => {
    const tricorn = apparelById('tricorn-parrot')!;
    const top = apparelById('top-parrot')!;
    const legs = apparelById('legs-parrot')!;
    expect(tricorn.slot).toBe('hat');
    expect(top.slot).toBe('shirt');
    expect(legs.slot).toBe('pants');
    for (const piece of [tricorn, top, legs]) {
      expect(piece.set).toBe('Space Pirate Parrot');
      expect(piece.rarity).toBe('mythic');
      // Shard-bought, not an earned trophy — always in the market, buyable when affordable.
      expect(piece.unlockHoles).toBeUndefined();
      expect(piece.secret).toBeUndefined();
      expect(piece.cost).toBe(APPAREL_COST.mythic);
      expect(apparelRevealedInMarket(piece, [])).toBe(true);
      expect(canBuyApparel(piece, APPAREL_COST.mythic, [])).toBe(true);
      expect(piece.look.glow).toBeTruthy(); // mythic aura
    }
    // Distinct swashbuckling shapes — a galaxy tricorn (with eye patch), macaw plumage, tailfeathers.
    expect(tricorn.look.shape).toBe('tricorn');
    expect(top.look.shape).toBe('parrot');
    expect(legs.look.shape).toBe('parrotpants');
    // All three slots → the set reports complete; any missing piece does not.
    expect(equippedSet(tricorn.id, top.id, legs.id)).toBe('Space Pirate Parrot');
    expect(equippedSet(tricorn.id, top.id, undefined)).toBeUndefined();
    expect(equippedSet(tricorn.id, 'polo-classic', legs.id)).toBeUndefined();
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
    expect(canBuyApparel(cap, 9, [])).toBe(true); // exactly affordable (common, post-cut)
    expect(canBuyApparel(cap, 8, [])).toBe(false); // one short
    expect(canBuyApparel(cap, 999, ['cap-classic'])).toBe(false); // already owned
    expect(canBuyApparel(undefined, 999, [])).toBe(false);
  });
});
