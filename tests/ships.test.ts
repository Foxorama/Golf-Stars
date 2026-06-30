import { describe, it, expect } from 'vitest';
import {
  SHIPS,
  DEFAULT_SHIP_ID,
  shipById,
  marketOffer,
  marketRerollCost,
  canBuyShip,
  MARKET_OFFER_SIZE,
} from '../src/sim/rpg/ships';

describe('ships catalogue (GS-garage)', () => {
  it('has a free default wagon and several priced ships across sets/rarities', () => {
    const def = shipById(DEFAULT_SHIP_ID);
    expect(def).toBeTruthy();
    expect(def!.cost).toBe(0);
    expect(SHIPS.length).toBeGreaterThanOrEqual(6);
    expect(SHIPS.filter((s) => s.cost > 0).length).toBeGreaterThanOrEqual(5);
    expect(new Set(SHIPS.map((s) => s.set)).size).toBeGreaterThanOrEqual(3); // broken into sets
    // Every ship has a render look + unique id.
    expect(new Set(SHIPS.map((s) => s.id)).size).toBe(SHIPS.length);
    for (const s of SHIPS) expect(s.look.kind).toBeTruthy();
  });

  it('a priced ship costs more for a rarer tier, topped by a 1,000-shard mythic UFO', () => {
    const rare = SHIPS.find((s) => s.rarity === 'rare')!;
    const epic = SHIPS.find((s) => s.rarity === 'epic')!;
    const leg = SHIPS.find((s) => s.rarity === 'legendary')!;
    const myth = SHIPS.find((s) => s.rarity === 'mythic')!;
    expect(epic.cost).toBeGreaterThan(rare.cost);
    expect(leg.cost).toBeGreaterThan(epic.cost);
    expect(myth).toBeTruthy();
    expect(myth.cost).toBe(1000); // the headline grail
    expect(myth.cost).toBeGreaterThan(leg.cost);
    // The mythic ride is the animated UFO saucer with its "Hole 19" flag.
    expect(myth.look.kind).toBe('ufo');
    expect(myth.look.flag).toBe('Hole 19');
  });

  it('the rarity-weighted market makes the mythic UFO the scarcest draw', () => {
    const myth = SHIPS.find((s) => s.rarity === 'mythic')!;
    const owned = [DEFAULT_SHIP_ID];
    let sawMyth = 0;
    const N = 400;
    for (let seed = 0; seed < N; seed++) {
      if (marketOffer(seed, owned).some((s) => s.id === myth.id)) sawMyth++;
    }
    // It DOES appear (obtainable), but far less than a uniform 3-of-pool share would give.
    const pool = SHIPS.filter((s) => s.cost > 0).length;
    const uniformRate = MARKET_OFFER_SIZE / pool;
    expect(sawMyth).toBeGreaterThan(0);
    expect(sawMyth / N).toBeLessThan(uniformRate);
  });
});

describe('trade market offer (GS-garage)', () => {
  const owned = [DEFAULT_SHIP_ID];

  it('draws unowned, priced ships, deterministic per (seed, rerolls)', () => {
    const a = marketOffer(0, owned, 0).map((s) => s.id);
    const b = marketOffer(0, owned, 0).map((s) => s.id);
    expect(a).toEqual(b); // deterministic
    expect(a.length).toBe(Math.min(MARKET_OFFER_SIZE, SHIPS.filter((s) => s.cost > 0).length));
    for (const id of a) {
      expect(owned).not.toContain(id); // never offers an owned ship
      expect(shipById(id)!.cost).toBeGreaterThan(0); // never offers the free default
    }
  });

  it('a reroll (different salt) can change the draw; the seed bump refreshes it too', () => {
    const r0 = marketOffer(0, owned, 0).map((s) => s.id);
    const r1 = marketOffer(0, owned, 1).map((s) => s.id);
    const s1 = marketOffer(1, owned, 0).map((s) => s.id);
    // With a pool > offer size, at least one of the variants differs (not a hard guarantee per draw,
    // but across both reroll + seed it must move).
    expect(r0.join() !== r1.join() || r0.join() !== s1.join()).toBe(true);
  });

  it('shrinks to the remaining ships as the fleet fills, then empties', () => {
    const allPriced = SHIPS.filter((s) => s.cost > 0).map((s) => s.id);
    const nearlyAll = [DEFAULT_SHIP_ID, ...allPriced.slice(0, -1)];
    expect(marketOffer(0, nearlyAll, 0).length).toBe(1); // only one ship left
    const everything = [DEFAULT_SHIP_ID, ...allPriced];
    expect(marketOffer(0, everything, 0)).toEqual([]); // fleet complete
  });

  it('the reroll cost is steep and ramps', () => {
    expect(marketRerollCost(0)).toBeGreaterThanOrEqual(40);
    expect(marketRerollCost(1)).toBeGreaterThan(marketRerollCost(0));
    expect(marketRerollCost(2)).toBeGreaterThan(marketRerollCost(1));
  });

  it('canBuyShip gates on affordability, ownership, and a real priced ship', () => {
    const ship = SHIPS.find((s) => s.cost > 0)!;
    expect(canBuyShip(ship, ship.cost, owned)).toBe(true);
    expect(canBuyShip(ship, ship.cost - 1, owned)).toBe(false); // can't afford
    expect(canBuyShip(ship, 9999, [DEFAULT_SHIP_ID, ship.id])).toBe(false); // already owned
    expect(canBuyShip(shipById(DEFAULT_SHIP_ID), 9999, [])).toBe(false); // free default isn't "bought"
    expect(canBuyShip(undefined, 9999, owned)).toBe(false);
  });
});
