import { describe, it, expect } from 'vitest';
import {
  finaleResult,
  finaleUnlocked,
  finaleBattleTuning,
  winFinale,
  FINALE_BREACH_NEED,
  FINALE_SURVIVE_NEED,
  FINALE_ATTACK_PERIOD_MS,
  FINALE_FLOOR_SHOTS,
  FINALE_MIN_SHOTS,
  FINALE_HOPELESS_SHOTS,
  FINALE_FLOOR_LUNGES,
  FINALE_MAX_LUNGES,
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

  // GS-story-battle-2: the live battle tuning — the fight (and the briefing that quotes it) actually
  // CONSUMES the arsenal: every rating point past the gate floor measurably improves the real fight.
  it('battle tuning scales continuously with the arsenal past the gate floor', () => {
    // WEAPONS: monotonically fewer volleys as the rating rises above the floor, bounded.
    let prev = Infinity;
    for (let w = FINALE_BREACH_NEED; w <= 100; w += 2) {
      const s = finaleBattleTuning(w, 40, 10).shotsToKill;
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(FINALE_MIN_SHOTS);
      expect(s).toBeLessThanOrEqual(FINALE_FLOOR_SHOTS);
      prev = s;
    }
    expect(finaleBattleTuning(FINALE_BREACH_NEED, 40, 10).shotsToKill).toBe(FINALE_FLOOR_SHOTS);
    // DEFENCE: monotonically more strikes absorbed, bounded.
    prev = 0;
    for (let d = FINALE_SURVIVE_NEED; d <= 140; d += 5) {
      const l = finaleBattleTuning(40, d, 10).lungesToBreak;
      expect(l).toBeGreaterThanOrEqual(prev);
      expect(l).toBeGreaterThanOrEqual(FINALE_FLOOR_LUNGES);
      expect(l).toBeLessThanOrEqual(FINALE_MAX_LUNGES);
      prev = l;
    }
    // ENGINES: monotonically faster recharge, bounded [560, 1000] ms.
    prev = Infinity;
    for (let e = 0; e <= 60; e += 5) {
      const r = finaleBattleTuning(40, 40, e).rechargeMs;
      expect(r).toBeLessThanOrEqual(prev);
      expect(r).toBeGreaterThanOrEqual(560);
      expect(r).toBeLessThanOrEqual(1000);
      prev = r;
    }
  });

  it('under the breach gate the hide holds — unkillable BY CONSTRUCTION, whatever the defence', () => {
    for (let w = 0; w < FINALE_BREACH_NEED; w += 5) {
      for (let d = 0; d <= 140; d += 20) {
        expect(finaleBattleTuning(w, d, 60).shotsToKill).toBe(FINALE_HOPELESS_SHOTS);
      }
    }
    // under the survive gate the shield pool is a couple of hits at best
    expect(finaleBattleTuning(40, 0, 0).lungesToBreak).toBeLessThanOrEqual(3);
    expect(finaleBattleTuning(40, 29, 15).lungesToBreak).toBeLessThan(FINALE_FLOOR_LUNGES);
  });

  it('every gate-armed ship wins the fight by construction — kill time clears shield collapse with margin', () => {
    // An armed player firing steadily (magazine of 3, then one volley per recharge) fells the serpent
    // well before an un-dodged strike cadence can break the shields — for EVERY armed arsenal.
    for (let w = FINALE_BREACH_NEED; w <= 100; w += 3) {
      for (let d = FINALE_SURVIVE_NEED; d <= 140; d += 10) {
        for (let e = 0; e <= 45; e += 15) {
          const tune = finaleBattleTuning(w, d, e);
          const killMs = (tune.shotsToKill - 3) * tune.rechargeMs;
          const collapseMs = tune.lungesToBreak * FINALE_ATTACK_PERIOD_MS;
          expect(killMs * 1.6, `w=${w} d=${d} e=${e}`).toBeLessThan(collapseMs);
        }
      }
    }
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
