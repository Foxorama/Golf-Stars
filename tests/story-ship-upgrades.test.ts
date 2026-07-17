import { describe, it, expect } from 'vitest';
import {
  STORY_SHIP_UPGRADES,
  shipUpgradeById,
  isShipUpgradeId,
  upgradeRevealed,
  ownsUpgrade,
  canBuyUpgrade,
  buyShipUpgrade,
  combatRating,
  upgradeCreditMult,
  upgradeDetail,
} from '../src/sim/rpg/storyShipUpgrades';
import { defaultStoryState, addCredits, recordWorldClear, type StoryState } from '../src/sim/rpg/story';
import { itemArtKind } from '../src/render/itemArt';

function clearN(story: StoryState, n: number): StoryState {
  let s = story;
  for (let i = 0; i < n; i++) s = recordWorldClear(s, `w${i}`, { toPar: 0, strokes: 72, par: 72, seed: 'x' }, 0);
  return s;
}

describe('story ship upgrades (GS-story-ship-upgrades)', () => {
  it('every row is well-formed, art-routable, and spans all three categories', () => {
    const cats = new Set<string>();
    for (const u of STORY_SHIP_UPGRADES) {
      expect(u.id.startsWith('upg:')).toBe(true);
      expect(isShipUpgradeId(u.id)).toBe(true);
      expect(u.price).toBeGreaterThan(0);
      expect(u.battle).toBeGreaterThan(0);
      expect(u.lore.length).toBeGreaterThan(0);
      expect(upgradeDetail(u).length).toBeGreaterThan(0);
      cats.add(u.category);
      // art routes off the category (weapon → weapon glyph, engine → thruster, shield → shield)
      const kind = itemArtKind(u.id);
      expect(['weapon', 'thruster', 'shield']).toContain(kind);
    }
    expect([...cats].sort()).toEqual(['engine', 'shield', 'weapon']);
    expect(isShipUpgradeId('nope')).toBe(false);
  });

  it('milestone upgrades stay hidden until enough worlds are cleared', () => {
    const fresh = defaultStoryState();
    const nova = shipUpgradeById('upg:weapon:nova')!; // milestone 8
    expect(upgradeRevealed(fresh, nova)).toBe(false);
    expect(upgradeRevealed(clearN(fresh, 8), nova)).toBe(true);
    // a buy upgrade is always revealed
    expect(upgradeRevealed(fresh, shipUpgradeById('upg:weapon:scatter')!)).toBe(true);
  });

  it('buying accumulates ownership, spends credits, and cannot double-buy or overspend', () => {
    const rich = addCredits(defaultStoryState(), 2000);
    const scatter = shipUpgradeById('upg:weapon:scatter')!;
    expect(canBuyUpgrade(rich, scatter)).toBe(true);
    const after = buyShipUpgrade(rich, 'upg:weapon:scatter');
    expect(after.credits).toBe(2000 - scatter.price);
    expect(ownsUpgrade(after, 'upg:weapon:scatter')).toBe(true);
    expect(canBuyUpgrade(after, scatter)).toBe(false); // owned
    expect(buyShipUpgrade(after, 'upg:weapon:scatter')).toBe(after); // no double-buy
    expect(buyShipUpgrade(defaultStoryState(), 'upg:weapon:scatter')).toEqual(defaultStoryState()); // broke
    // can't buy a locked milestone even when rich
    expect(canBuyUpgrade(addCredits(defaultStoryState(), 5000), shipUpgradeById('upg:weapon:nova')!)).toBe(false);
  });

  it('combatRating sums owned battle; upgradeCreditMult multiplies engine bonuses', () => {
    let s = addCredits(defaultStoryState(), 5000);
    expect(combatRating(s)).toBe(0);
    expect(upgradeCreditMult(s)).toBe(1);
    s = buyShipUpgrade(s, 'upg:weapon:scatter'); // battle 8, no creditMult
    s = buyShipUpgrade(s, 'upg:engine:ion'); // battle 4, ×1.05
    s = buyShipUpgrade(s, 'upg:engine:warp'); // battle 9, ×1.10
    expect(combatRating(s)).toBe(8 + 4 + 9);
    expect(upgradeCreditMult(s)).toBeCloseTo(1.05 * 1.1, 5);
  });
});
