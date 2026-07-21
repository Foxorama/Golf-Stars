import { describe, it, expect } from 'vitest';
import {
  finaleResult,
  finaleUnlocked,
  finaleLoadout,
  finaleAssaultSeconds,
  finaleCooldownMult,
  winFinale,
  FINALE_BREACH_NEED,
  FINALE_SURVIVE_NEED,
  FINALE_SERPENT_HP,
  FINALE_PHASES,
  FINALE_OVERWHELM_HITS,
  FINALE_PHASE_REGEN,
  FINALE_HOPELESS_FLOOR_FRAC,
  FINALE_SHIELD_CELL_CAP,
} from '../src/sim/rpg/storyFinale';
import { buyShipUpgrade, grantShipUpgrade, STORY_SHIP_UPGRADES } from '../src/sim/rpg/storyShipUpgrades';
import { defaultStoryState, addCredits, storyComplete, keyToOtherRealm, type StoryState } from '../src/sim/rpg/story';

const FIVE_SIGILS = ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal', 'sigil-serpent'];

/** A campaign with the key forged (five Sigils) + plenty of credits, ready to arm. */
function keyReady(): StoryState {
  return addCredits({ ...defaultStoryState('feather-fade'), chapter: 5, trophyIds: [...FIVE_SIGILS] }, 20000);
}

/** Arm a key-ready campaign with a list of upgrade ids (buying or granting as the row demands). */
function armed(...ids: string[]): StoryState {
  return ids.reduce((s, id) => {
    const bought = buyShipUpgrade(s, id);
    return bought === s ? grantShipUpgrade(s, id) : bought;
  }, keyReady());
}

describe('the finale gates (GS-story-yggdrasil)', () => {
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
    let s = armed('upg:weapon:scatter', 'upg:weapon:railgun'); // 8 + 18 = 26
    r = finaleResult(s);
    expect(r.weaponRating).toBeGreaterThanOrEqual(FINALE_BREACH_NEED);
    expect(r.breachOk).toBe(true);
    expect(r.surviveOk).toBe(false);
    expect(r.won).toBe(false);
    expect(r.failReason).toBe('defence');

    // add engine + shields to survive → win
    s = ['upg:engine:ion', 'upg:shield:deflector', 'upg:shield:aegis'].reduce(buyShipUpgrade, s); // 4+10+22 = 36
    r = finaleResult(s);
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

describe('the live-battle loadout (GS-story-battle-3)', () => {
  const ALL_WEAPONS = ['upg:weapon:scatter', 'upg:weapon:railgun', 'upg:weapon:nova', 'upg:weapon:starlance', 'upg:weapon:wyrmfang'];
  const ALL_ENGINES = ['upg:engine:ion', 'upg:engine:warp', 'upg:engine:singularity', 'upg:engine:longhaul'];
  const ALL_SHIELDS = ['upg:shield:deflector', 'upg:shield:aegis', 'upg:shield:bulwark', 'upg:shield:carapace'];

  it('every owned weapon upgrade is its OWN HUD trigger, hitting exactly its shipyard battle rating', () => {
    const s = armed(...ALL_WEAPONS);
    const lo = finaleLoadout(s);
    expect(lo.weapons.map((w) => w.id)).toEqual(ALL_WEAPONS); // light → heavy, all present
    for (const w of lo.weapons) {
      const row = STORY_SHIP_UPGRADES.find((u) => u.id === w.id)!;
      expect(w.damage).toBe(row.battle); // the readiness number made literal
      expect(w.cooldownMs).toBeGreaterThan(0);
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.color).toMatch(/^#/);
    }
    // distinct styles — each gun reads as its own weapon in the HUD
    expect(new Set(lo.weapons.map((w) => w.style)).size).toBe(lo.weapons.length);
  });

  it('an unarmed hull still gets the fallback cannon (never trigger-less) — but it can never breach', () => {
    const lo = finaleLoadout(keyReady());
    expect(lo.weapons).toHaveLength(1);
    expect(lo.weapons[0]!.id).toBe('hull');
    expect(finaleResult(keyReady()).breachOk).toBe(false);
  });

  it('engines speed every cooldown AND the ship — monotone, bounded', () => {
    let prevMult = Infinity;
    for (let e = 0; e <= 60; e += 5) {
      const m = finaleCooldownMult(e);
      expect(m).toBeLessThanOrEqual(prevMult);
      expect(m).toBeGreaterThanOrEqual(0.7);
      expect(m).toBeLessThanOrEqual(1);
      prevMult = m;
    }
    const slow = finaleLoadout(armed('upg:weapon:scatter'));
    const fast = finaleLoadout(armed('upg:weapon:scatter', ...ALL_ENGINES));
    expect(fast.weapons[0]!.cooldownMs).toBeLessThan(slow.weapons[0]!.cooldownMs);
    expect(fast.shipSpeed).toBeGreaterThan(slow.shipSpeed);
    expect(fast.shipSpeed).toBeLessThanOrEqual(460);
  });

  it('shield cells grow with defence, bounded [1, cap]', () => {
    expect(finaleLoadout(keyReady()).shieldCells).toBeGreaterThanOrEqual(1);
    const floor = finaleLoadout(armed('upg:engine:ion', 'upg:shield:deflector', 'upg:shield:aegis')); // defence 36
    const maxed = finaleLoadout(armed(...ALL_ENGINES, ...ALL_SHIELDS));
    expect(floor.shieldCells).toBeGreaterThan(finaleLoadout(keyReady()).shieldCells);
    expect(maxed.shieldCells).toBeGreaterThanOrEqual(floor.shieldCells);
    expect(maxed.shieldCells).toBe(FINALE_SHIELD_CELL_CAP);
  });

  it('phases descend 75 → 50 → 25 → 5 and the overwhelm is coverable at the survive floor BY CONSTRUCTION', () => {
    expect([...FINALE_PHASES]).toEqual([0.75, 0.5, 0.25, 0.05]);
    for (let i = 1; i < FINALE_PHASES.length; i++) expect(FINALE_PHASES[i]!).toBeLessThan(FINALE_PHASES[i - 1]!);
    // A gate-armed ship that dodges everything dodgeable arrives at the 5% overwhelm with its pool intact
    // (+ the phase-turn regens) — and the overwhelm's cost leaves it alive with margin.
    const floor = finaleLoadout(armed('upg:engine:ion', 'upg:shield:deflector', 'upg:shield:aegis')); // defence 36 ≥ 30
    const atOverwhelm = Math.min(floor.shieldCells, floor.shieldCells + 3 * FINALE_PHASE_REGEN);
    expect(atOverwhelm - FINALE_OVERWHELM_HITS).toBeGreaterThan(0);
    // …and even the cell pool ALONE (no regen banked) covers the overwhelm at the floor.
    expect(floor.shieldCells).toBeGreaterThan(FINALE_OVERWHELM_HITS);
  });

  it('kill time shrinks with a heavier arsenal but the fight is NEVER trivial — bounded at every tier', () => {
    const floor = finaleAssaultSeconds(finaleLoadout(armed('upg:weapon:scatter', 'upg:weapon:railgun')));
    const maxed = finaleAssaultSeconds(finaleLoadout(armed(...ALL_WEAPONS, ...ALL_ENGINES)));
    expect(maxed).toBeLessThan(floor); // arming up genuinely helps…
    expect(floor).toBeGreaterThan(60); // …the floor arsenal fights a real, long assault…
    expect(floor).toBeLessThan(180);
    expect(maxed).toBeGreaterThan(25); // …and even a maxed arsenal fights a REAL assault (never one-shot)
    expect(maxed).toBeLessThan(90);
    // monotone: each added weapon only ever shortens the assault
    let prev = finaleAssaultSeconds(finaleLoadout(armed('upg:weapon:scatter')));
    for (let n = 2; n <= ALL_WEAPONS.length; n++) {
      const t = finaleAssaultSeconds(finaleLoadout(armed(...ALL_WEAPONS.slice(0, n))));
      expect(t).toBeLessThan(prev);
      prev = t;
    }
  });

  it('under the breach gate the hide holds at the hopeless floor — unkillable by construction', () => {
    // The floor fraction is a real, visible chunk of health (the "not enough gun" read), above the
    // overwhelm threshold so an under-gate ship never even reaches the climax.
    expect(FINALE_HOPELESS_FLOOR_FRAC).toBeGreaterThan(FINALE_PHASES[3]!);
    expect(FINALE_HOPELESS_FLOOR_FRAC * FINALE_SERPENT_HP).toBeGreaterThan(0);
    const under = finaleResult(armed('upg:weapon:scatter')); // 8 < 26
    expect(under.breachOk).toBe(false);
    expect(under.won).toBe(false);
  });
});
