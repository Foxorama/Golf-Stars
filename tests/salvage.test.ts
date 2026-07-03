import { describe, it, expect } from 'vitest';
import { salvageClubFind } from '../src/sim/rpg/salvage';
import { routeClubFind } from '../src/sim/rpg/effects';
import { ROUTE_EVENTS, UNIQUE_EVENTS, DEFAULT_EVENT, type RouteEvent } from '../src/sim/rpg/events';
import { startingLoadout, offerableClubs, clubItem } from '../src/sim/rpg/economy';
import type { Rarity } from '../src/sim/course/contract';

const ev = (over: Partial<RouteEvent>): RouteEvent => ({ ...DEFAULT_EVENT, ...over });

describe('routeClubFind — which lanes loot a club (GS-journey-fx-3)', () => {
  it('only salvage-category lanes loot, at max(rare, lane rarity)', () => {
    expect(routeClubFind(undefined)).toBeUndefined();
    expect(routeClubFind(DEFAULT_EVENT)).toBeUndefined(); // calm
    expect(routeClubFind(ev({ category: 'payout', rarity: 'legendary' }))).toBeUndefined();
    expect(routeClubFind(ev({ category: 'toll', rarity: 'epic' }))).toBeUndefined();
    // Salvage lanes: floored at rare (commons aren't offerable gear), else the lane's own rarity.
    expect(routeClubFind(ev({ category: 'salvage', rarity: 'common' }))).toBe('rare');
    expect(routeClubFind(ev({ category: 'salvage', rarity: 'rare' }))).toBe('rare');
    expect(routeClubFind(ev({ category: 'salvage', rarity: 'epic' }))).toBe('epic');
    expect(routeClubFind(ev({ category: 'salvage', rarity: 'legendary' }))).toBe('legendary');
  });

  it('EVERY salvage catalogue event resolves a real, buildable club find', () => {
    const salvage = [...ROUTE_EVENTS, ...UNIQUE_EVENTS].filter((e) => e.category === 'salvage');
    expect(salvage.length).toBeGreaterThan(4); // the debris/wreck/mining backbone
    for (const e of salvage) {
      const want = routeClubFind(e);
      expect(want, `${e.id} is salvage but finds no club`).toBeDefined();
      const found = salvageClubFind(startingLoadout(), want!, `salvage:1:1:${e.id}`);
      // A fresh starter bag always has offerable gear, so a find (not a consolation) comes back.
      expect(found.clubItemId, `${e.id} found nothing from a starter bag`).toBeTruthy();
      expect(clubItem(found.clubItemId!)!.rarity).toBe(want);
    }
  });
});

describe('salvageClubFind — the resolver (GS-journey-fx-3)', () => {
  it('is deterministic in its seed and returns a club of the asked rarity', () => {
    const l = startingLoadout();
    for (const want of ['rare', 'epic', 'legendary'] as Rarity[]) {
      const a = salvageClubFind(l, want, `s:${want}`);
      const b = salvageClubFind(l, want, `s:${want}`);
      expect(a).toEqual(b);
      expect(a.clubItemId).toBeTruthy();
      expect(a.rarity).toBe(want);
    }
  });

  it('prefers a club TYPE the golfer does not already carry over a same-type upgrade', () => {
    // The full starter bag has no gaps, so open one: drop the 5-wood. A rare find should now ALWAYS
    // hand the fresh 5W (a genuine new club) rather than upgrade a carried driver/putter.
    const base = startingLoadout();
    const gappy = { ...base, bag: base.bag.filter((c) => c.id !== '5W') };
    // Sanity: the rare pool now contains a NEW 5W plus upgrades to carried types.
    const rareOffers = offerableClubs(gappy).filter((i) => i.rarity === 'rare');
    expect(rareOffers.some((i) => i.clubType === '5W')).toBe(true);
    expect(rareOffers.some((i) => i.clubType !== '5W')).toBe(true);
    for (let s = 0; s < 30; s++) {
      const found = salvageClubFind(gappy, 'rare', `fresh:${s}`);
      expect(clubItem(found.clubItemId!)!.clubType).toBe('5W');
    }
  });

  it('pays a rarity-scaled credit consolation when no fresh club of the rarity is left', () => {
    // Stuff the bag with every legendary offerable club → the legendary pool empties.
    let l = startingLoadout();
    for (const it of offerableClubs(l).filter((i) => i.rarity === 'legendary')) l = it.apply(l);
    const found = salvageClubFind(l, 'legendary', 'empty');
    expect(found.clubItemId).toBeUndefined();
    expect(found.consolationCredits).toBeGreaterThan(0);
  });
});
