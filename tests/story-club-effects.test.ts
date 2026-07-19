import { describe, it, expect } from 'vitest';
import {
  STORY_CLUB_EFFECTS,
  storyClubEffectLabel,
  hasStoryClubEffect,
  applyStoryClubEffects,
} from '../src/sim/rpg/storyClubEffects';
import { NAMED_STORY_CLUBS, defaultStoryState, equipStoryClub } from '../src/sim/rpg/story';
import type { PlayerLoadout } from '../src/sim/rpg/economy';

/** A neutral base loadout to fold effects onto. */
function baseLoadout(): PlayerLoadout {
  return {
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
  } as PlayerLoadout;
}

describe('GS-story-club-effects — reward clubs carry a signature effect', () => {
  it('EVERY named reward club (quest + major) has a signature effect — none is just a tier bump', () => {
    for (const id of Object.keys(NAMED_STORY_CLUBS)) {
      expect(hasStoryClubEffect(id), `${id} has an effect`).toBe(true);
      expect(storyClubEffectLabel(id), `${id} label`).toBeTruthy();
    }
  });

  it('a plain club has no effect', () => {
    expect(hasStoryClubEffect('3W')).toBe(false);
    expect(storyClubEffectLabel('club:tour:3W')).toBeUndefined();
  });

  it('applyStoryClubEffects is a no-op when no special club is equipped', () => {
    const base = baseLoadout();
    expect(applyStoryClubEffects(base, defaultStoryState())).toBe(base);
  });

  it("Sandy's wedge folds strong lie relief once equipped", () => {
    const s = equipStoryClub({ ...defaultStoryState(), ownedClubIds: ['quest:sandy'] }, 'quest:sandy');
    const out = applyStoryClubEffects(baseLoadout(), s);
    expect(out.lieRelief).toBeGreaterThanOrEqual(0.5);
  });

  it("Dan's driver drives from any lie + raises the distance floor", () => {
    const s = equipStoryClub({ ...defaultStoryState(), ownedClubIds: ['quest:dan'] }, 'quest:dan');
    const out = applyStoryClubEffects(baseLoadout(), s);
    expect(out.driverAnywhere).toBe(true);
    expect(out.minCarryBoost).toBeGreaterThan(0);
  });

  it('the Galewarden major irons fold strong wind resistance', () => {
    const s = equipStoryClub({ ...defaultStoryState(), ownedClubIds: ['major:storm'] }, 'major:storm');
    const out = applyStoryClubEffects(baseLoadout(), s);
    expect(out.windResist ?? 0).toBeGreaterThanOrEqual(0.5);
  });

  it('effects stack across multiple equipped reward clubs, and only when equipped (not merely owned)', () => {
    let s = { ...defaultStoryState(), ownedClubIds: ['quest:penelope', 'quest:mole'] };
    // owned but not equipped → no effect yet
    expect(applyStoryClubEffects(baseLoadout(), s).greenRead).toBeUndefined();
    s = equipStoryClub(s, 'quest:penelope');
    s = equipStoryClub(s, 'quest:mole');
    const out = applyStoryClubEffects(baseLoadout(), s);
    expect(out.greenRead).toBe(true); // both set it
    expect(out.puttBoost).toBeGreaterThan(0); // Penelope
    expect((out.spinReadBonus ?? 0)).toBeGreaterThan(0); // Mole
  });

  it('every effect only ever HELPS (never widens dispersion or lowers a boost)', () => {
    const base = baseLoadout();
    for (const id of Object.keys(STORY_CLUB_EFFECTS)) {
      const out = STORY_CLUB_EFFECTS[id]!.apply(base);
      expect(out.dispersionMult, `${id} dispersion`).toBeLessThanOrEqual(base.dispersionMult);
      expect(out.minCarryBoost, `${id} minCarry`).toBeGreaterThanOrEqual(base.minCarryBoost);
      expect(out.puttBoost, `${id} putt`).toBeGreaterThanOrEqual(base.puttBoost);
    }
  });
});
