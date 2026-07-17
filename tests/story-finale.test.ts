import { describe, it, expect } from 'vitest';
import {
  finaleResult,
  finaleUnlocked,
  winFinale,
  FINALE_BREACH_NEED,
  FINALE_SURVIVE_NEED,
} from '../src/sim/rpg/storyFinale';
import { buyShipUpgrade } from '../src/sim/rpg/storyShipUpgrades';
import { defaultStoryState, addCredits, storyComplete, keyToOtherRealm, type StoryState } from '../src/sim/rpg/story';

const FIVE_SIGILS = ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal', 'sigil-serpent'];

/** A campaign with the key forged (five Sigils) + plenty of credits, ready to arm. */
function keyReady(): StoryState {
  return addCredits({ ...defaultStoryState('feather-fade'), chapter: 5, trophyIds: [...FIVE_SIGILS] }, 5000);
}

describe('the finale (GS-story-yggdrasil)', () => {
  it('unlocks only with the key forged (five Sigils) and not yet completed', () => {
    expect(finaleUnlocked(defaultStoryState())).toBe(false); // no Sigils
    const key = keyReady();
    expect(keyToOtherRealm(key)).toBe(true);
    expect(finaleUnlocked(key)).toBe(true);
    expect(finaleUnlocked({ ...key, completed: true })).toBe(false); // already won
  });

  it('needs BOTH gates — firepower to breach and defence to survive', () => {
    const key = keyReady();
    // unarmed → loses on firepower
    let r = finaleResult(key);
    expect(r.won).toBe(false);
    expect(r.failReason).toBe('firepower');

    // enough weapons to breach, but no defence → loses on defence
    let armed = buyShipUpgrade(buyShipUpgrade(key, 'upg:weapon:scatter'), 'upg:weapon:railgun'); // 8 + 18 = 26
    r = finaleResult(armed);
    expect(r.weaponRating).toBeGreaterThanOrEqual(FINALE_BREACH_NEED);
    expect(r.breachOk).toBe(true);
    expect(r.surviveOk).toBe(false);
    expect(r.won).toBe(false);
    expect(r.failReason).toBe('defence');

    // add engine + shields to survive → win
    armed = buyShipUpgrade(buyShipUpgrade(buyShipUpgrade(armed, 'upg:engine:ion'), 'upg:shield:deflector'), 'upg:shield:aegis'); // 4 + 10 + 22 = 36
    r = finaleResult(armed);
    expect(r.defenceRating).toBeGreaterThanOrEqual(FINALE_SURVIVE_NEED);
    expect(r.won).toBe(true);
    expect(r.failReason).toBeUndefined();
  });

  it('winning marks the campaign complete → storyComplete → Star Tour unlocks', () => {
    const key = keyReady();
    expect(storyComplete(key)).toBe(false); // five Sigils alone is NOT complete
    const done = winFinale(key);
    expect(done.completed).toBe(true);
    expect(storyComplete(done)).toBe(true);
    expect(winFinale(done)).toBe(done); // idempotent
  });
});
