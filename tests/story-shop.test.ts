import { describe, it, expect } from 'vitest';
import {
  STORY_SHOP,
  WORLD_SHOP_INTRO,
  storyItemById,
  storyItemName,
  storyItemPrice,
  storyItemRarity,
  storyItemDetail,
  storyItemLore,
  storyItemBlurb,
  storyShopStock,
  worldHasShop,
  canBuyStoryItem,
  buyStoryItem,
  storyItemOwned,
  storyItemEquipped,
  storyWorldShoppable,
  storyCardFor,
  storyItemKind,
  buyStoryCard,
} from '../src/sim/rpg/storyShop';
import {
  STORY_GEAR,
  STORY_GEAR_STOCK,
  storyGearById,
  storyGearStock,
  buyStoryGear,
  applyStoryGear,
  equipStoryGear,
  unequipStoryGear,
  ownedGearForSlot,
  storyGearCreditMult,
} from '../src/sim/rpg/storyGear';
import {
  defaultStoryState,
  resolveStoryClub,
  storyClubType,
  storyBagClubs,
  equipStoryClub,
  unequipStoryClub,
  storyBagFull,
  MAX_STORY_BAG,
  addCredits,
  recordWorldClear,
  GEAR_SLOTS,
  STORY_WORLDS,
  type StoryState,
} from '../src/sim/rpg/story';
import type { PlayerLoadout } from '../src/sim/rpg/economy';

describe('story club resolution (GS-story-econ)', () => {
  it('resolves a plain taxonomy id and a themed reward id', () => {
    const plain = resolveStoryClub('3W');
    expect(plain?.id).toBe('3W');
    expect(plain?.carry).toBe(235);

    const themed = resolveStoryClub('club:tour:3W'); // Planet 3-Wood, +8 carry
    expect(themed?.id).toBe('3W'); // bag club id is the base type
    expect(themed?.name).toBe('Planet 3-Wood');
    expect(themed?.carry).toBe(243); // 235 + 8 (distance bonus)
    expect(themed?.set).toBe('tour');
    expect(themed?.rarity).toBe('rare');

    // a scoring club gets NO carry bonus (coverage, never overshoots)
    const iron = resolveStoryClub('club:pro:3i');
    expect(iron?.carry).toBe(157); // base 3-Iron
    expect(iron?.name).toBe('Planet 3-Iron');

    expect(resolveStoryClub('club:nope:3W')).toBeUndefined();
    expect(resolveStoryClub('club:tour:ZZ')).toBeUndefined();
    expect(resolveStoryClub('ZZ')).toBeUndefined();
  });

  it('storyClubType maps both id forms to a bag type', () => {
    expect(storyClubType('club:tour:3W')).toBe('3W');
    expect(storyClubType('putter')).toBe('putter');
  });

  it('storyBagClubs resolves a mixed (plain + themed) equipped bag', () => {
    const s = { ...defaultStoryState(), equippedBagIds: ['D', 'club:tour:3W', 'putter'] };
    const bag = storyBagClubs(s);
    expect(bag.map((c) => c.id)).toEqual(['D', '3W', 'putter']);
    expect(bag.find((c) => c.id === '3W')?.name).toBe('Planet 3-Wood');
  });
});

describe('equipStoryClub (GS-story-econ)', () => {
  it('appends a NEW type and keeps the bag sorted longest→shortest', () => {
    const s0 = defaultStoryState(); // 10-club green bag, no 3W
    const s1 = equipStoryClub(s0, 'club:tour:3W');
    expect(s1.equippedBagIds).toContain('club:tour:3W');
    expect(s1.equippedBagIds.length).toBe(s0.equippedBagIds.length + 1);
    // ordered by resolved carry desc: D(250) then Planet 3W(243) then 5W(217)…
    const carries = storyBagClubs(s1).map((c) => c.carry);
    expect([...carries]).toEqual([...carries].sort((a, b) => b - a));
    expect(s1.equippedBagIds[1]).toBe('club:tour:3W');
  });

  it('UPGRADES a carried type in place (no size change)', () => {
    const s0 = defaultStoryState(); // green bag has a plain 5W
    const s1 = equipStoryClub(s0, 'club:tour:5W'); // Planet 5-Wood upgrade
    expect(s1.equippedBagIds.length).toBe(s0.equippedBagIds.length); // replaced, not added
    expect(s1.equippedBagIds).toContain('club:tour:5W');
    expect(s1.equippedBagIds.filter((id) => storyClubType(id) === '5W')).toHaveLength(1);
    expect(storyBagClubs(s1).find((c) => c.id === '5W')?.carry).toBe(225); // 217 + 8
  });

  it('refuses a NEW type when the bag is full (14)', () => {
    // Fill to 14 distinct types.
    const ids = ['D', '3W', '5W', '2H', '3H', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW', '60', 'putter'];
    const full = { ...defaultStoryState(), equippedBagIds: ids };
    expect(full.equippedBagIds.length).toBe(MAX_STORY_BAG);
    const same = equipStoryClub(full, 'club:pro:3i'); // 3i is a new type → no room
    expect(same).toBe(full);
    // but an UPGRADE to a carried type still fits
    const up = equipStoryClub(full, 'club:tour:3W');
    expect(up.equippedBagIds.length).toBe(MAX_STORY_BAG);
    expect(up.equippedBagIds).toContain('club:tour:3W');
  });

  it('unknown club id is a no-op', () => {
    const s0 = defaultStoryState();
    expect(equipStoryClub(s0, 'club:nope:3W')).toBe(s0);
  });
});

describe('the Pro Shop catalogue (GS-story-econ)', () => {
  it('every rack id parses, resolves to a real club, and a shop intro exists', () => {
    for (const [worldId, ids] of Object.entries(STORY_SHOP)) {
      expect(WORLD_SHOP_INTRO[worldId], `intro for ${worldId}`).toBeTruthy();
      for (const id of ids) {
        const item = storyItemById(id);
        expect(item, `${id} parses`).toBeTruthy();
        expect(resolveStoryClub(id), `${id} resolves`).toBeTruthy();
        expect(storyItemPrice(item!)).toBeGreaterThan(0);
        expect(storyItemName(item!).length).toBeGreaterThan(0);
        expect(storyItemDetail(item!).length).toBeGreaterThan(0);
        expect(storyItemLore(item!).length).toBeGreaterThanOrEqual(2); // set lore + type flavour
        expect(storyItemBlurb(item!).length).toBeGreaterThan(0);
      }
    }
  });

  it('only charted (non-prologue) worlds carry a rack; Earth has none', () => {
    expect(worldHasShop('standrews-18')).toBe(false);
    // every world in the STORY_SHOP table is a real story destination
    for (const worldId of Object.keys(STORY_SHOP)) {
      expect(STORY_WORLDS.some((w) => w.courseId === worldId), `${worldId} is a story world`).toBe(true);
    }
  });

  it('storyItemById rejects junk', () => {
    expect(storyItemById('3W')).toBeUndefined(); // not a themed shop id
    expect(storyItemById('club:tour')).toBeUndefined();
    expect(storyItemById('club:nope:3W')).toBeUndefined();
  });

  it('rarity tracks the set tier', () => {
    expect(storyItemRarity(storyItemById('club:tour:3W')!)).toBe('rare');
    expect(storyItemRarity(storyItemById('club:masters:D')!)).toBe('epic');
    expect(storyItemRarity(storyItemById('club:solar:D')!)).toBe('legendary');
  });
});

describe('buying (GS-story-econ)', () => {
  it('buy deducts credits, owns the club, and equips it into the bag', () => {
    const item = storyItemById('club:tour:3W')!;
    const rich = addCredits(defaultStoryState(), 1000);
    expect(canBuyStoryItem(rich, item)).toBe(true);
    const after = buyStoryItem(rich, item);
    expect(after.credits).toBe(1000 - storyItemPrice(item));
    expect(storyItemOwned(after, item)).toBe(true);
    expect(storyItemEquipped(after, item)).toBe(true);
    expect(storyBagClubs(after).some((c) => c.name === 'Planet 3-Wood')).toBe(true);
  });

  it('a rack hides already-owned items', () => {
    const rich = addCredits(defaultStoryState(), 5000);
    const first = storyShopStock(rich, 'verdant-18');
    expect(first.length).toBe(STORY_SHOP['verdant-18']!.length);
    const bought = buyStoryItem(rich, first[0]!);
    const after = storyShopStock(bought, 'verdant-18');
    expect(after.length).toBe(first.length - 1);
    expect(after.some((it) => it.id === first[0]!.id)).toBe(false);
  });

  it('cannot buy what you cannot afford, or what you already own', () => {
    const item = storyItemById('club:solar:D')!; // 600
    const broke = defaultStoryState(); // 0 credits
    expect(canBuyStoryItem(broke, item)).toBe(false);
    expect(buyStoryItem(broke, item)).toBe(broke); // no-op

    const rich = addCredits(defaultStoryState(), 5000);
    const owned = buyStoryItem(rich, item);
    expect(canBuyStoryItem(owned, item)).toBe(false); // already owned
    expect(buyStoryItem(owned, item)).toBe(owned); // no-op, no double-charge
  });

  it('storyWorldShoppable needs the world cleared AND a rack', () => {
    const s0 = addCredits(defaultStoryState('feather-fade'), 500);
    expect(storyWorldShoppable(s0, 'verdant-18')).toBe(false); // not cleared yet
    const cleared = recordWorldClear(s0, 'verdant-18', { toPar: 0, strokes: 72, par: 72, seed: 'x' }, 200);
    expect(storyWorldShoppable(cleared, 'verdant-18')).toBe(true);
    // Earth has no rack even once cleared
    const earth = recordWorldClear(s0, 'standrews-18', { toPar: 0, strokes: 72, par: 72, seed: 'x' }, 200);
    expect(storyWorldShoppable(earth, 'standrews-18')).toBe(false);
  });
});

describe('Story gear (GS-story-gear)', () => {
  it('every gear row has art-routable id, price, detail + lore; every stock id resolves', () => {
    for (const g of STORY_GEAR) {
      expect(g.id.startsWith('gear:')).toBe(true);
      expect(GEAR_SLOTS).toContain(g.slot);
      expect(g.price).toBeGreaterThan(0);
      expect(g.detail.length).toBeGreaterThan(0);
      expect(g.lore.length).toBeGreaterThan(0);
      expect(g.blurb.length).toBeGreaterThan(0);
    }
    for (const [worldId, ids] of Object.entries(STORY_GEAR_STOCK)) {
      expect(STORY_WORLDS.some((w) => w.courseId === worldId)).toBe(true);
      for (const id of ids) expect(storyGearById(id), `${id} resolves`).toBeTruthy();
    }
  });

  it('buying gear spends credits, owns it, and equips it in its slot (swapping the old one)', () => {
    const rich = addCredits(defaultStoryState(), 2000);
    const glove = storyGearById('gear:glove:tacky')!;
    const after = buyStoryGear(rich, glove);
    expect(after.credits).toBe(2000 - glove.price);
    expect(after.ownedGearIds).toContain(glove.id);
    expect(after.equippedGear.glove).toBe(glove.id);
    // a second glove REPLACES the first in the slot (one per slot)
    const vice = storyGearById('gear:glove:vice')!;
    const swapped = buyStoryGear(after, vice);
    expect(swapped.equippedGear.glove).toBe(vice.id);
    expect(swapped.ownedGearIds).toContain(glove.id); // still owned, just not equipped
  });

  it('applyStoryGear folds equipped effects onto a loadout (and is a no-op when un-geared)', () => {
    const base: PlayerLoadout = {
      bag: [],
      handicap: 10,
      dispersionMult: 1,
      creditMult: 1,
      perks: [],
      shapeMod: {},
      minCarryBoost: 0,
      wedgeWindow: 0,
      distanceClubBonus: 0,
      puttBoost: 0,
      birdieCredit: 0,
      eagleCredit: 0,
      comebackCredit: 0,
    };
    const un = defaultStoryState();
    expect(applyStoryGear(base, un)).toEqual(base); // no gear → unchanged

    let s = addCredits(defaultStoryState(), 3000);
    s = buyStoryGear(s, storyGearById('gear:glove:tacky')!); // dispersion ×0.93
    s = buyStoryGear(s, storyGearById('gear:hat:visor')!); // puttBoost +0.08
    s = buyStoryGear(s, storyGearById('gear:shoes:spikes')!); // lieRelief 0.30
    s = buyStoryGear(s, storyGearById('gear:ball:soft')!); // backspin +0.08
    const out = applyStoryGear(base, s);
    expect(out.dispersionMult).toBeCloseTo(0.93, 5);
    expect(out.puttBoost).toBeCloseTo(0.08, 5);
    expect(out.lieRelief).toBeCloseTo(0.3, 5);
    expect(out.backspinBoost).toBeCloseTo(0.08, 5);
  });

  it('the unified card layer resolves both clubs and gear', () => {
    const club = storyCardFor('club:tour:3W');
    expect(club?.kind).toBe('club');
    expect(club?.tag).toContain('Fairway wood');
    const gear = storyCardFor('gear:glove:tacky');
    expect(gear?.kind).toBe('gear');
    expect(gear?.tag).toContain('Glove');
    expect(storyItemKind('gear:hat:focus')).toBe('gear');
    expect(storyItemKind('club:solar:D')).toBe('club');
    expect(storyItemKind('nonsense')).toBeUndefined();

    // buyStoryCard dispatches to the right catalogue
    const rich = addCredits(defaultStoryState(), 2000);
    const boughtGear = buyStoryCard(rich, 'gear:glove:tacky');
    expect(boughtGear.equippedGear.glove).toBe('gear:glove:tacky');
    const boughtClub = buyStoryCard(rich, 'club:tour:3W');
    expect(boughtClub.ownedClubIds).toContain('club:tour:3W');
  });
});

describe('the locker model (GS-story-locker)', () => {
  it('unequipStoryClub benches a club; re-equipping a same-type themed swaps in place', () => {
    let s = addCredits(defaultStoryState(), 2000);
    expect(s.equippedBagIds).toContain('5W'); // green bag has a plain 5W
    // buy the Planet 5-Wood → it replaces the plain 5W in the bag (same type), plain 5W benches
    s = buyStoryCard(s, 'club:tour:5W');
    expect(s.equippedBagIds).toContain('club:tour:5W');
    expect(s.equippedBagIds).not.toContain('5W');
    expect(s.ownedClubIds).toContain('5W'); // still owned (on the bench)

    // re-equip the plain 5W from the bench → swaps back (one club per type)
    const back = equipStoryClub(s, '5W');
    expect(back.equippedBagIds).toContain('5W');
    expect(back.equippedBagIds).not.toContain('club:tour:5W');
    expect(back.equippedBagIds.length).toBe(s.equippedBagIds.length); // no size change

    // unequip drops it to the bench (bag shrinks); a no-op if not equipped
    const removed = unequipStoryClub(s, 'club:tour:5W');
    expect(removed.equippedBagIds).not.toContain('club:tour:5W');
    expect(removed.equippedBagIds.length).toBe(s.equippedBagIds.length - 1);
    expect(unequipStoryClub(s, 'nope')).toBe(s);
  });

  it('storyBagFull gates a NEW type but not a same-type swap', () => {
    const ids = ['D', '3W', '5W', '2H', '3H', '5i', '6i', '7i', '8i', '9i', 'PW', 'SW', '60', 'putter'];
    const full = { ...defaultStoryState(), equippedBagIds: ids, ownedClubIds: [...ids, 'club:tour:3W', 'club:pro:4H'] };
    expect(storyBagFull(full)).toBe(true);
    expect(equipStoryClub(full, 'club:pro:4H')).toBe(full); // new type → refused when full
    expect(equipStoryClub(full, 'club:tour:3W').equippedBagIds).toContain('club:tour:3W'); // same type → swaps
  });

  it('gear equip/unequip and ownedGearForSlot manage a slot', () => {
    let s = addCredits(defaultStoryState(), 3000);
    s = buyStoryGear(s, storyGearById('gear:glove:tacky')!);
    s = buyStoryGear(s, storyGearById('gear:glove:vice')!); // vice now equipped, tacky benched (both owned)
    expect(s.equippedGear.glove).toBe('gear:glove:vice');
    expect(ownedGearForSlot(s, 'glove').map((g) => g.id).sort()).toEqual(['gear:glove:tacky', 'gear:glove:vice']);

    const backToTacky = equipStoryGear(s, 'gear:glove:tacky');
    expect(backToTacky.equippedGear.glove).toBe('gear:glove:tacky');
    const bare = unequipStoryGear(backToTacky, 'glove');
    expect(bare.equippedGear.glove).toBeUndefined();
    expect(bare.ownedGearIds).toContain('gear:glove:tacky'); // still owned
    // equipping an UNOWNED gear is a no-op
    expect(equipStoryGear(defaultStoryState(), 'gear:glove:vice')).toEqual(defaultStoryState());
  });
});

describe('route relics (GS-story-route-rewards)', () => {
  it('sheddings are cursed (boon + a real downside); grace is clean', () => {
    const shed = storyGearById('gear:glove:shed')!;
    expect(shed.alignment).toBe('herald');
    expect(shed.curse).toBeTruthy();
    const grace = storyGearById('gear:glove:grace')!;
    expect(grace.alignment).toBe('warden');
    expect(grace.curse).toBeUndefined();
    // the shedding's apply folds BOTH the boon (tighter) and the curse (a credit tithe)
    const base = { dispersionMult: 1, creditMult: 1, minCarryBoost: 0, wedgeWindow: 0, handicap: 10, bag: [], perks: [], shapeMod: {}, distanceClubBonus: 0, puttBoost: 0, birdieCredit: 0, eagleCredit: 0, comebackCredit: 0 } as PlayerLoadout;
    const out = shed.apply(base);
    expect(out.dispersionMult).toBeCloseTo(0.78, 5); // boon
    expect(out.creditMult).toBeCloseTo(0.9, 5); // curse
    // the lore card surfaces the curse as a detail line + a "cursed" tag
    const card = storyCardFor('gear:glove:shed')!;
    expect(card.tag).toContain('cursed');
    expect(card.detail.some((d) => d.includes('⚠'))).toBe(true);
  });

  it('a world rack shows only YOUR path’s relics (and none before The Choice)', () => {
    const rich = addCredits(defaultStoryState('feather-fade'), 5000);
    // crystal2-18 stocks a Herald ball (venom) + a Warden ball (blessed) + ordinary gear.
    const unchosen = storyGearStock(rich, 'crystal2-18').map((g) => g.id);
    expect(unchosen).not.toContain('gear:ball:venom');
    expect(unchosen).not.toContain('gear:ball:blessed'); // route relics hidden before The Choice
    const herald = storyGearStock({ ...rich, alignment: 'herald' }, 'crystal2-18').map((g) => g.id);
    expect(herald).toContain('gear:ball:venom');
    expect(herald).not.toContain('gear:ball:blessed'); // never the other path's
    const warden = storyGearStock({ ...rich, alignment: 'warden' }, 'crystal2-18').map((g) => g.id);
    expect(warden).toContain('gear:ball:blessed');
    expect(warden).not.toContain('gear:ball:venom');
    // ordinary (unaligned) gear still shows on either path
    expect(warden).toContain('gear:hat:oracle');
  });
});

describe('the deep catalogue (GS-story-shop-depth)', () => {
  const unit = (): PlayerLoadout => ({
    bag: [], handicap: 10, dispersionMult: 1, creditMult: 1, perks: [], shapeMod: {},
    minCarryBoost: 0, wedgeWindow: 0, distanceClubBonus: 0, puttBoost: 0, birdieCredit: 0, eagleCredit: 0, comebackCredit: 0,
  });

  it('every purchasable gear item is stocked at some world (no dead content)', () => {
    const stocked = new Set(Object.values(STORY_GEAR_STOCK).flat());
    for (const g of STORY_GEAR) {
      if (g.acquire === 'reward') continue; // quest-granted, deliberately never sold
      expect(stocked.has(g.id), `${g.id} is sold somewhere`).toBe(true);
    }
  });

  it('the catalogue spans all six slots and a green→legendary rarity ladder', () => {
    const slots = new Set(STORY_GEAR.map((g) => g.slot));
    for (const s of ['glove', 'hat', 'shoes', 'ball', 'shaft', 'bag'] as const) expect(slots.has(s), `${s} has gear`).toBe(true);
    const rarities = new Set(STORY_GEAR.map((g) => g.rarity));
    for (const r of ['common', 'rare', 'epic', 'legendary'] as const) expect(rarities.has(r), `${r} gear exists`).toBe(true);
    // green + blue variety exists EARLY (a common item sits on a Chapter-1 world)
    const ch1 = ['verdant-18', 'verdant2-18', 'desert-18'].flatMap((w) => STORY_GEAR_STOCK[w] ?? []);
    expect(ch1.some((id) => storyGearById(id)?.rarity === 'common')).toBe(true);
  });

  it('the new distance/power gear folds real distance levers', () => {
    // Graphite Power Shaft adds carry to distance clubs
    const powerShaft = storyGearById('gear:shaft:power')!;
    const base = { ...unit(), bag: [{ id: 'D', name: 'Driver', carry: 250, loft: 10 } as never] };
    expect(powerShaft.apply(base).distanceClubBonus).toBe(12);
    expect((powerShaft.apply(base).bag[0] as { carry: number }).carry).toBe(262);
    // Speed-Whip shaft lets you pull past 100%
    expect(storyGearById('gear:shaft:overdrive')!.apply(unit()).overpower).toBeCloseTo(0.2, 5);
    // hazard balls skip their hazard
    expect(storyGearById('gear:ball:floater')!.apply(unit()).hazardImmune).toContain('water');
    expect(storyGearById('gear:ball:void')!.apply(unit()).hazardImmune).toEqual(expect.arrayContaining(['void', 'voidlost']));
  });

  it('economy bag gear lifts storyGearCreditMult (default 1 → unchanged)', () => {
    expect(storyGearCreditMult(defaultStoryState())).toBeCloseTo(1, 5); // no bag → byte-for-byte the old pay
    let s = addCredits(defaultStoryState(), 3000);
    s = buyStoryGear(s, storyGearById('gear:bag:sponsor')!); // ×1.15
    expect(storyGearCreditMult(s)).toBeCloseTo(1.15, 5);
    s = equipStoryGear(s, 'gear:bag:cosmic'); // not owned → no-op (still sponsor)
    expect(storyGearCreditMult(s)).toBeCloseTo(1.15, 5);
    s = buyStoryGear(addCredits(s, 3000), storyGearById('gear:bag:cosmic')!); // ×1.6, replaces the slot
    expect(storyGearCreditMult(s)).toBeCloseTo(1.6, 5);
  });
});

describe('gear tiers + one-per-slot (GS-story-gear-tiers)', () => {
  const unit = (): PlayerLoadout => ({
    bag: [], handicap: 10, dispersionMult: 1, creditMult: 1, perks: [], shapeMod: {},
    minCarryBoost: 0, wedgeWindow: 0, distanceClubBonus: 0, puttBoost: 0, birdieCredit: 0, eagleCredit: 0, comebackCredit: 0,
  });

  it('every slot has a clean rare→epic→legendary ladder that strictly improves', () => {
    // glove: dispersion tightens (lower is better)
    expect(storyGearById('gear:glove:master')!.rarity).toBe('legendary');
    const gloveDisp = (id: string) => storyGearById(id)!.apply(unit()).dispersionMult;
    expect(gloveDisp('gear:glove:vice')).toBeLessThan(gloveDisp('gear:glove:tacky'));
    expect(gloveDisp('gear:glove:master')).toBeLessThan(gloveDisp('gear:glove:vice'));
    // hat: putt window widens (higher is better)
    expect(storyGearById('gear:hat:oracle')!.rarity).toBe('legendary');
    const hatPutt = (id: string) => storyGearById(id)!.apply(unit()).puttBoost ?? 0;
    expect(hatPutt('gear:hat:focus')).toBeGreaterThan(hatPutt('gear:hat:visor'));
    expect(hatPutt('gear:hat:oracle')).toBeGreaterThan(hatPutt('gear:hat:focus'));
    // shoes: lie relief deepens (higher is better)
    expect(storyGearById('gear:shoes:anchor')!.rarity).toBe('legendary');
    const shoeRelief = (id: string) => storyGearById(id)!.apply(unit()).lieRelief ?? 0;
    expect(shoeRelief('gear:shoes:gravlock')).toBeGreaterThan(shoeRelief('gear:shoes:spikes'));
    expect(shoeRelief('gear:shoes:anchor')).toBeGreaterThan(shoeRelief('gear:shoes:gravlock'));
    // the apex clean tier is dearer than the epic it caps
    expect(storyGearById('gear:glove:master')!.price).toBeGreaterThan(storyGearById('gear:glove:vice')!.price);
  });

  it('ONE item per slot: owning two gloves folds only the EQUIPPED one — effects never stack', () => {
    const s0: StoryState = { ...defaultStoryState(), ownedGearIds: ['gear:glove:tacky', 'gear:glove:master'], equippedGear: { glove: 'gear:glove:tacky' } };
    // only the equipped tacky glove (×0.93) applies — not ×0.93×0.72
    expect(applyStoryGear(unit(), s0).dispersionMult).toBeCloseTo(0.93, 5);
    // equipping the legendary REPLACES the epic in the slot (equipStoryGear is a per-slot set)
    const eq = equipStoryGear(s0, 'gear:glove:master');
    expect(eq.equippedGear.glove).toBe('gear:glove:master');
    expect(applyStoryGear(unit(), eq).dispersionMult).toBeCloseTo(0.72, 5); // just the one glove, not both
    // still only one glove owned-equipped: the ladder makes stacking unnecessary, not possible
    expect(ownedGearForSlot(eq, 'glove')).toHaveLength(2); // both OWNED
    expect(Object.values(eq.equippedGear).filter((id) => storyGearById(id!)?.slot === 'glove')).toHaveLength(1); // one EQUIPPED
  });
});
