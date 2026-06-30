import { describe, it, expect } from 'vitest';
import { SHIPS, DEFAULT_SHIP_ID, shipById, shipCatalogue, canBuyShip } from '../src/sim/rpg/ships';
import { COSMETIC_RARITY } from '../src/sim/rpg/cosmetics';

describe('ships catalogue (GS-garage / GS-clubhouse)', () => {
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

  it('shipCatalogue lists the whole fleet, ordered common → mythic', () => {
    const cat = shipCatalogue();
    expect(cat.length).toBe(SHIPS.length); // the FULL fleet is browsable (no rotating offer)
    expect(new Set(cat.map((s) => s.id)).size).toBe(SHIPS.length);
    expect(cat[0]!.id).toBe(DEFAULT_SHIP_ID); // the common starter wagon first
    expect(cat[cat.length - 1]!.rarity).toBe('mythic'); // the grail last
    // Non-decreasing rarity order across the catalogue.
    for (let i = 1; i < cat.length; i++) {
      expect(COSMETIC_RARITY[cat[i]!.rarity].order).toBeGreaterThanOrEqual(COSMETIC_RARITY[cat[i - 1]!.rarity].order);
    }
  });

  it('canBuyShip gates on affordability, ownership, and a real priced ship', () => {
    const owned = [DEFAULT_SHIP_ID];
    const ship = SHIPS.find((s) => s.cost > 0)!;
    expect(canBuyShip(ship, ship.cost, owned)).toBe(true);
    expect(canBuyShip(ship, ship.cost - 1, owned)).toBe(false); // can't afford
    expect(canBuyShip(ship, 9999, [DEFAULT_SHIP_ID, ship.id])).toBe(false); // already owned
    expect(canBuyShip(shipById(DEFAULT_SHIP_ID), 9999, [])).toBe(false); // free default isn't "bought"
    expect(canBuyShip(undefined, 9999, owned)).toBe(false);
  });
});
