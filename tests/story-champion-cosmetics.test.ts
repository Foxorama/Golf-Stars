/**
 * GS-story-champion-cosmetics — finishing the Story Tour hangs the path's set in the GLOBAL wardrobe.
 *
 * The promise this file defends: **a finished campaign leaves something behind that outlives the slot.**
 * Every other story reward lands inside `gs_story` (`storyRewards.ts`), so it dies the moment that golfer's
 * campaign is overwritten (one campaign per golfer — GS-story-campaign-slots). The champion set is the
 * exception, and it goes on the MAIN save beside `starTourUnlocked`.
 *
 * The four things that must hold:
 *  1. The ALIGNMENT you finished on is the whole key — a Warden win can never hand you Coil garb.
 *  2. The grant is IDEMPOTENT and ADDITIVE — re-winning changes nothing, and winning the OTHER path later
 *     only ever ADDS. Nothing a player owns is ever taken away.
 *  3. A LOSS grants nothing — including the `repelled` case, which is deliberately costless but is also
 *     not a win.
 *  4. The table's ids all RESOLVE in the live catalogues, and every granted piece is `secret` + free — a
 *     reward you could also just buy is not a reward, and one whose id has drifted is silently nothing.
 */

import { describe, it, expect } from 'vitest';
import { reduce, initState } from '../src/ui/game';
import { defaultStoryState } from '../src/sim/rpg/story';
import type { StoryState } from '../src/sim/rpg/story';
import {
  CHAMPION_COSMETICS,
  championCosmeticsFor,
  grantChampionCosmetics,
  allChampionCosmeticIds,
} from '../src/sim/rpg/storyChampionCosmetics';
import { apparelById, canBuyApparel, apparelRevealedInMarket } from '../src/sim/rpg/apparel';
import { shipById, canBuyShip, shipRevealedInMarket } from '../src/sim/rpg/ships';

const FIVE = ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal', 'sigil-serpent'];
/** The upgrade set `story-flow.test.ts` uses to clear both finale gates. */
const ARMED = ['upg:weapon:scatter', 'upg:weapon:railgun', 'upg:engine:ion', 'upg:shield:deflector', 'upg:shield:aegis'];

/** A campaign standing at the root with the key forged and a ship armed past both finale gates. */
function atTheRoot(alignment: 'warden' | 'herald', armed = true): StoryState {
  return {
    ...defaultStoryState('feather-fade'),
    chapter: 5,
    alignment,
    trophyIds: [...FIVE],
    ownedShipUpgradeIds: armed ? [...ARMED] : [],
  };
}

/** Drive a campaign through the finale battle and hand back the resulting state. */
function playFinale(
  alignment: 'warden' | 'herald',
  outcome?: 'won' | 'lost',
  owned?: Partial<{ ships: string[]; apparel: string[] }>,
) {
  let s = { ...initState('seed', {}, undefined, atTheRoot(alignment)), screen: 'story' as const };
  if (owned?.ships) s = { ...s, ownedShips: owned.ships };
  if (owned?.apparel) s = { ...s, ownedApparel: owned.apparel };
  const briefing = reduce(s, { type: 'openStoryFinale' });
  return reduce(briefing, { type: 'engageStoryFinale', ...(outcome ? { outcome } : {}) });
}

describe('the champion set is keyed on the path you finished (GS-story-champion-cosmetics)', () => {
  it('a WARDEN win hangs the Warden cruiser + the three-piece Warden Vigil outfit, globally', () => {
    const out = playFinale('warden');
    expect(out.story!.completed).toBe(true);
    expect(out.starTourUnlocked).toBe(true);
    expect(out.ownedShips).toContain('warden-cruiser');
    for (const id of CHAMPION_COSMETICS.warden.apparelIds) expect(out.ownedApparel).toContain(id);
    // The other road's set is emphatically NOT yours — that is what a second campaign is for.
    expect(out.ownedShips).not.toContain('wyrm-ship');
    for (const id of CHAMPION_COSMETICS.herald.apparelIds) expect(out.ownedApparel).not.toContain(id);
  });

  it('a HERALD win hangs the wyrm-ship + the three-piece Coil Shroud outfit, globally', () => {
    const out = playFinale('herald');
    expect(out.ownedShips).toContain('wyrm-ship');
    for (const id of CHAMPION_COSMETICS.herald.apparelIds) expect(out.ownedApparel).toContain(id);
    expect(out.ownedShips).not.toContain('warden-cruiser');
    for (const id of CHAMPION_COSMETICS.warden.apparelIds) expect(out.ownedApparel).not.toContain(id);
  });

  it('the recap announces exactly what was NEW, and names the set', () => {
    const out = playFinale('warden');
    expect(out.lastStoryFinale!.championSet).toBe('Warden Vigil');
    expect(out.lastStoryFinale!.championUnlocked).toEqual([
      'warden-cruiser',
      ...CHAMPION_COSMETICS.warden.apparelIds,
    ]);
  });
});

describe('a loss grants nothing, and a repelled champion is not a champion yet', () => {
  it('an ARMED ship that loses the live fight is merely repelled — no set, no completion', () => {
    const out = playFinale('warden', 'lost');
    expect(out.story!.completed).toBe(false);
    expect(out.lastStoryFinale!.failReason).toBe('repelled');
    expect(out.lastStoryFinale!.championUnlocked).toBeUndefined();
    expect(out.ownedShips).not.toContain('warden-cruiser');
    for (const id of CHAMPION_COSMETICS.warden.apparelIds) expect(out.ownedApparel).not.toContain(id);
  });

  it('a gate-lost ship cannot win, so it cannot earn the set either', () => {
    // A campaign with the key but NO upgrades fails the firepower gate whatever the battle reports.
    const s = { ...initState('seed', {}, undefined, atTheRoot('herald', false)), screen: 'story' as const };
    const out = reduce(reduce(s, { type: 'openStoryFinale' }), { type: 'engageStoryFinale', outcome: 'won' });
    expect(out.lastStoryFinale!.won).toBe(false);
    expect(out.ownedShips).not.toContain('wyrm-ship');
    expect(out.ownedApparel).not.toContain('coil-shroud');
  });
});

describe('the grant is idempotent and purely additive', () => {
  it('re-winning the same path adds nothing and announces nothing', () => {
    const already = {
      ships: ['wagon-classic', 'warden-cruiser'],
      apparel: [...CHAMPION_COSMETICS.warden.apparelIds],
    };
    const out = playFinale('warden', undefined, already);
    expect(out.ownedShips).toEqual(already.ships);
    expect(out.ownedApparel).toEqual(already.apparel);
    // Nothing new ⇒ no reveal panel, but the set is still named (you did finish that path).
    expect(out.lastStoryFinale!.championUnlocked).toEqual([]);
    expect(out.lastStoryFinale!.championSet).toBe('Warden Vigil');
  });

  it('winning the OTHER path later keeps everything the first one earned', () => {
    const warden = playFinale('warden');
    const both = playFinale('herald', undefined, {
      ships: warden.ownedShips,
      apparel: warden.ownedApparel,
    });
    for (const id of [...CHAMPION_COSMETICS.warden.apparelIds, ...CHAMPION_COSMETICS.herald.apparelIds]) {
      expect(both.ownedApparel).toContain(id);
    }
    expect(both.ownedShips).toContain('warden-cruiser');
    expect(both.ownedShips).toContain('wyrm-ship');
  });

  it('the pure grant returns the SAME array reference when there is nothing to add', () => {
    const ships = ['wagon-classic', 'warden-cruiser'];
    const apparel = [...CHAMPION_COSMETICS.warden.apparelIds];
    const g = grantChampionCosmetics(ships, apparel, 'warden');
    expect(g.ownedShips).toBe(ships);
    expect(g.ownedApparel).toBe(apparel);
    expect(g.unlocked).toEqual([]);
  });

  it('an undecided campaign resolves to no set at all (and the grant is a no-op)', () => {
    expect(championCosmeticsFor(undefined)).toBeUndefined();
    const ships = ['wagon-classic'];
    const apparel: string[] = [];
    const g = grantChampionCosmetics(ships, apparel, undefined);
    expect(g.ownedShips).toBe(ships);
    expect(g.ownedApparel).toBe(apparel);
    expect(g.cosmetics).toBeUndefined();
    expect(g.unlocked).toEqual([]);
  });
});

describe('every id in the table resolves, and every piece is an earned secret', () => {
  const { ships, apparel } = allChampionCosmeticIds();

  it('the ships exist, are free, are secret, and can never be bought', () => {
    for (const id of ships) {
      const ship = shipById(id);
      expect(ship, `ship row missing: ${id}`).toBeTruthy();
      expect(ship!.cost).toBe(0);
      expect(ship!.secret).toBe(true);
      expect(canBuyShip(ship, 99_999, [])).toBe(false);
      // Hidden from the Trade Market until owned — the market never spoils an ending.
      expect(shipRevealedInMarket(ship!, [])).toBe(false);
      expect(shipRevealedInMarket(ship!, [id])).toBe(true);
    }
  });

  it('the apparel exists, is free, is secret, and can never be bought', () => {
    for (const id of apparel) {
      const item = apparelById(id);
      expect(item, `apparel row missing: ${id}`).toBeTruthy();
      expect(item!.cost).toBe(0);
      expect(item!.secret).toBe(true);
      expect(canBuyApparel(item, 99_999, [])).toBe(false);
      expect(apparelRevealedInMarket(item!, [])).toBe(false);
      expect(apparelRevealedInMarket(item!, [id])).toBe(true);
    }
  });

  it('each path is a FULL outfit — one hat, one shirt, one pants — under its own set name', () => {
    for (const [path, set] of Object.entries(CHAMPION_COSMETICS)) {
      const rows = set.apparelIds.map((id) => apparelById(id)!);
      expect(rows.map((r) => r.slot).sort(), `${path} outfit slots`).toEqual(['hat', 'pants', 'shirt']);
      // All three carry the set name, so `equippedSet` can award the complete-set flair.
      for (const r of rows) expect(r.set).toBe(set.setName);
    }
  });

  it('the two paths never share a piece — the set IS the alignment', () => {
    const w = new Set<string>([CHAMPION_COSMETICS.warden.shipId, ...CHAMPION_COSMETICS.warden.apparelIds]);
    for (const id of [CHAMPION_COSMETICS.herald.shipId, ...CHAMPION_COSMETICS.herald.apparelIds]) {
      expect(w.has(id)).toBe(false);
    }
  });
});
