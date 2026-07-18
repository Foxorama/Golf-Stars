import { describe, it, expect } from 'vitest';
import {
  STORY_SHIPS,
  storyShipRow,
  storyShipHull,
  storyShipRevealed,
  canBuyStoryShip,
  buyStoryShip,
  equipStoryShip,
  grantStoryAceShip,
  grantStoryShip,
  shipCreditMult,
  storyShipDetail,
  isStoryShipId,
  SHIP_VENDOR_STOCK,
  worldIsShipVendor,
  worldShipStock,
} from '../src/sim/rpg/storyShips';
import { STORY_SHIP_UPGRADES, shipUpgradeById } from '../src/sim/rpg/storyShipUpgrades';
import { FINALE_BREACH_NEED, FINALE_SURVIVE_NEED } from '../src/sim/rpg/storyFinale';
import { defaultStoryState, addCredits, recordWorldClear, STORY_WORLDS, type StoryState } from '../src/sim/rpg/story';
import { ACE_SHIP_ID, DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';

function clearN(story: StoryState, n: number): StoryState {
  let s = story;
  for (let i = 0; i < n; i++) s = recordWorldClear(s, `w${i}`, { toPar: 0, strokes: 72, par: 72, seed: 'x' }, 0);
  return s;
}

describe('story ships catalogue (GS-story-ships)', () => {
  it('every row references a real hull, has lore + detail, and a scattering of acquisition kinds', () => {
    for (const r of STORY_SHIPS) {
      expect(storyShipHull(r.shipId), `${r.shipId} hull`).toBeTruthy();
      expect(r.lore.length).toBeGreaterThan(0);
      expect(storyShipDetail(r).length).toBeGreaterThan(0);
      expect(r.creditMult).toBeGreaterThanOrEqual(1);
      expect(isStoryShipId(r.shipId)).toBe(true);
    }
    const kinds = new Set(STORY_SHIPS.map((r) => r.acquire));
    // the "scattering of different approaches" — at least buy + milestone + ace + secret all present
    expect(kinds.has('buy')).toBe(true);
    expect(kinds.has('milestone')).toBe(true);
    expect(kinds.has('ace')).toBe(true);
    expect(kinds.has('secret')).toBe(true);
    expect(isStoryShipId('not-a-ship')).toBe(false);
  });

  it('ships + upgrades are sold at ship-vendor WORLDS, not a clubhouse bay (GS-story-ship-vendors)', () => {
    const vendorWorlds = Object.keys(SHIP_VENDOR_STOCK);
    const realWorldIds = new Set(STORY_WORLDS.map((w) => w.courseId));
    // Every vendor world is a real, travel-to-able world, and it actually stocks something.
    for (const wid of vendorWorlds) {
      expect(realWorldIds.has(wid), `${wid} is a real world`).toBe(true);
      expect(worldIsShipVendor(wid)).toBe(true);
      const stock = worldShipStock(wid);
      expect(stock.ships.length + stock.upgrades.length).toBeGreaterThan(0);
      for (const id of stock.ships) expect(storyShipHull(id), `${id} hull`).toBeTruthy();
      for (const id of stock.upgrades) expect(shipUpgradeById(id), `${id} upgrade`).toBeTruthy();
    }
    // A non-vendor world (a Pro-Shop-only world) is not a ship vendor.
    expect(worldIsShipVendor('verdant-18')).toBe(false);
    expect(worldShipStock('verdant-18').ships.length).toBe(0);

    // Every SELLABLE ship (buy / milestone / secret — NOT the granted ace/reward ships) is stocked at
    // exactly one vendor, so a player can always reach it by travelling.
    const sellable = STORY_SHIPS.filter((r) => r.acquire === 'buy' || r.acquire === 'milestone' || r.acquire === 'secret');
    const allVendorShips = vendorWorlds.flatMap((w) => [...SHIP_VENDOR_STOCK[w]!.ships]);
    for (const r of sellable) {
      expect(allVendorShips.filter((id) => id === r.shipId).length, `${r.shipId} sold once`).toBe(1);
    }
    // Granted ships are NEVER on a vendor rack.
    for (const r of STORY_SHIPS.filter((r) => r.acquire === 'ace' || r.acquire === 'reward')) {
      expect(allVendorShips.includes(r.shipId), `${r.shipId} not sold`).toBe(false);
    }
    // Every upgrade is stocked at exactly one vendor (the finale arsenal is fully reachable by travel).
    const allVendorUpgrades = vendorWorlds.flatMap((w) => [...SHIP_VENDOR_STOCK[w]!.upgrades]);
    for (const u of STORY_SHIP_UPGRADES) {
      expect(allVendorUpgrades.filter((id) => id === u.id).length, `${u.id} sold once`).toBe(1);
    }
    // The finale-critical arsenal clears BOTH gates when fully assembled from the vendors.
    const weaponTotal = STORY_SHIP_UPGRADES.filter((u) => u.category === 'weapon').reduce((s, u) => s + u.battle, 0);
    const defenceTotal = STORY_SHIP_UPGRADES.filter((u) => u.category !== 'weapon').reduce((s, u) => s + u.battle, 0);
    expect(weaponTotal).toBeGreaterThanOrEqual(FINALE_BREACH_NEED);
    expect(defenceTotal).toBeGreaterThanOrEqual(FINALE_SURVIVE_NEED);
  });

  it('milestone + secret ships stay hidden until enough worlds are cleared; ace ships never show for sale', () => {
    const fresh = defaultStoryState();
    const saucer = storyShipRow('ufo-saucer')!; // milestone: 4 clears
    const mother = storyShipRow('ufo-mothership')!; // secret: 12 clears
    const comet = storyShipRow(ACE_SHIP_ID)!; // ace
    expect(storyShipRevealed(fresh, saucer)).toBe(false);
    expect(storyShipRevealed(fresh, mother)).toBe(false);
    expect(storyShipRevealed(fresh, comet)).toBe(false); // ace shown only once owned

    const four = clearN(fresh, 4);
    expect(storyShipRevealed(four, saucer)).toBe(true);
    expect(storyShipRevealed(four, mother)).toBe(false);
    expect(storyShipRevealed(clearN(fresh, 12), mother)).toBe(true);

    // the Earth prologue clear does NOT count toward milestones
    const earthOnly = recordWorldClear(fresh, 'standrews-18', { toPar: 0, strokes: 72, par: 72, seed: 'x' }, 0);
    expect(storyShipRevealed(earthOnly, saucer)).toBe(false);
  });

  it('buying a ship spends credits, owns it, and flies it', () => {
    const rich = addCredits(defaultStoryState(), 2000);
    const chrome = storyShipRow('wagon-chrome')!;
    expect(canBuyStoryShip(rich, chrome)).toBe(true);
    const after = buyStoryShip(rich, 'wagon-chrome');
    expect(after.credits).toBe(2000 - chrome.price);
    expect(after.ownedShipIds).toContain('wagon-chrome');
    expect(after.equippedShipId).toBe('wagon-chrome');
    // can't re-buy an owned ship, and can't afford with no credits
    expect(canBuyStoryShip(after, chrome)).toBe(false);
    expect(buyStoryShip(defaultStoryState(), 'wagon-chrome')).toEqual(defaultStoryState());
  });

  it('cannot buy a locked milestone ship even if affordable', () => {
    const rich = addCredits(defaultStoryState(), 5000); // plenty, but 0 worlds cleared
    const saucer = storyShipRow('ufo-saucer')!;
    expect(canBuyStoryShip(rich, saucer)).toBe(false); // not revealed yet
    const ready = clearN(rich, 4);
    expect(canBuyStoryShip(ready, saucer)).toBe(true);
  });

  it('equipStoryShip flies an owned ship only; shipCreditMult reads the equipped ship', () => {
    let s = addCredits(defaultStoryState(), 3000);
    expect(shipCreditMult(s)).toBe(1); // starter wagon → no bonus
    s = buyStoryShip(s, 'hauler-barge'); // +25%
    expect(shipCreditMult(s)).toBeCloseTo(1.25, 5);
    // switch back to the free wagon
    const wagon = equipStoryShip(s, DEFAULT_SHIP_ID);
    expect(wagon.equippedShipId).toBe(DEFAULT_SHIP_ID);
    expect(shipCreditMult(wagon)).toBe(1);
    // equipping an unowned ship is a no-op
    expect(equipStoryShip(defaultStoryState(), 'hauler-barge')).toEqual(defaultStoryState());
  });

  it('grantStoryAceShip awards + flies the Comet Rider once', () => {
    const s = grantStoryAceShip(defaultStoryState());
    expect(s.ownedShipIds).toContain(ACE_SHIP_ID);
    expect(s.equippedShipId).toBe(ACE_SHIP_ID);
    expect(grantStoryAceShip(s)).toBe(s); // idempotent (already owned → same ref)
  });

  it('route reward ships (GS-story-route-rewards) are earned, never sold, and path-tagged', () => {
    const warden = storyShipRow('warden-cruiser')!;
    const wyrm = storyShipRow('wyrm-ship')!;
    expect(warden.acquire).toBe('reward');
    expect(warden.alignment).toBe('warden');
    expect(wyrm.alignment).toBe('herald');
    // not for sale, and hidden from the shipyard until owned
    const rich = addCredits(defaultStoryState(), 9000);
    expect(canBuyStoryShip(rich, warden)).toBe(false);
    expect(storyShipRevealed(rich, warden)).toBe(false);
    // granted → owned, flown, and now revealed
    const granted = grantStoryShip(rich, 'warden-cruiser');
    expect(granted.ownedShipIds).toContain('warden-cruiser');
    expect(granted.equippedShipId).toBe('warden-cruiser');
    expect(storyShipRevealed(granted, warden)).toBe(true);
    expect(shipCreditMult(granted)).toBeCloseTo(1.2, 5);
    expect(grantStoryShip(granted, 'warden-cruiser')).toBe(granted); // idempotent
  });
});
