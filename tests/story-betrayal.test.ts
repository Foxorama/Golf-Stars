/**
 * GS-story-betrayer — the odd-one-out rule: WHO betrays you is decided by your two team-Sigil partner picks.
 * Pure, deterministic; the single source the beats + the 2v2 finale + the costume all read.
 */
import { describe, it, expect } from 'vitest';
import {
  betrayerId,
  loyalAllyId,
  heraldOpponentIds,
  coilChampionExcluding,
  coilChampionName,
  corruptedLookOpts,
  COIL_SHIRT,
} from '../src/sim/rpg/storyBetrayal';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { getCharacter } from '../src/sim/rpg/characters';
import { otherGolferIds } from '../src/sim/rpg/storyCast';

// protagonist feather-fade → others, in roster order:
const s = (p1?: string, p2?: string): StoryState => ({ ...defaultStoryState('feather-fade'), sigil1Partner: p1, sigil2Partner: p2 });
const OTHERS = otherGolferIds(s()); // [huang-woo-hook, longshot-larry, backspin-bo]
const [A, B, C] = OTHERS as [string, string, string];

describe('GS-story-betrayer — the odd-one-out rule', () => {
  it('two DIFFERENT partners → the unpicked friend betrays', () => {
    expect(betrayerId(s(A, B))).toBe(C);
    expect(betrayerId(s(A, C))).toBe(B);
    expect(betrayerId(s(B, C))).toBe(A);
    // order of the picks doesn't matter
    expect(betrayerId(s(B, A))).toBe(C);
  });

  it('the SAME partner both times → that trusted friend betrays (the twist)', () => {
    expect(betrayerId(s(A, A))).toBe(A);
    expect(betrayerId(s(C, C))).toBe(C);
  });

  it('only one pick recorded → that friend betrays; no picks → the first tour-mate (safe fallback)', () => {
    expect(betrayerId(s(B, undefined))).toBe(B);
    expect(betrayerId(s(undefined, undefined))).toBe(A);
  });

  it('a bogus pick (not a real friend) is ignored', () => {
    expect(betrayerId(s('not-a-golfer', B))).toBe(B); // only B is valid → trusted-one betrays
  });
});

describe('GS-story-betrayer — the Warden finale ally (a loyal friend, never the betrayer)', () => {
  it('two different partners → your loyal ally is one you partnered, and NOT the betrayer', () => {
    const st = s(A, B); // betrayer = C
    const ally = loyalAllyId(st);
    expect(ally).not.toBe(betrayerId(st));
    expect([A, B]).toContain(ally); // a friend you actually played with
    expect(ally).toBe(B); // prefers your Sigil-2 partner
  });

  it('same partner twice (that partner betrays) → a different loyal friend rallies to you', () => {
    const st = s(A, A); // betrayer = A
    const ally = loyalAllyId(st);
    expect(ally).not.toBe(A);
    expect(OTHERS).toContain(ally);
  });
});

describe('GS-story-betrayer — the Herald finale opponents (your former friends)', () => {
  it('two different partners → both of them come for you', () => {
    expect([...heraldOpponentIds(s(A, B))].sort()).toEqual([A, B].sort());
  });

  it('same partner twice → the one you always picked AND one you spurned', () => {
    const opp = heraldOpponentIds(s(A, A));
    expect(opp).toContain(A);
    expect(opp).toHaveLength(2);
    expect(opp[0]).not.toBe(opp[1]);
  });
});

describe('GS-story-betrayer — the Coil champion partner + costume', () => {
  it('the champion who is not your guide partners you (Herald finale)', () => {
    expect(coilChampionExcluding('voss')).toBe('venoma');
    expect(coilChampionExcluding('venoma')).toBe('voss');
    expect(coilChampionExcluding(undefined)).toBe('voss');
    expect(coilChampionName('venoma')).toContain('Viper');
    expect(coilChampionName('voss')).toContain('Voss');
  });

  it('the corrupted look keeps the golfer\'s hair but swaps to Coil-violet garb', () => {
    const ch = getCharacter(A)!;
    const look = corruptedLookOpts(ch);
    expect(look.shirtBase).toBe(COIL_SHIRT);
    expect(look.hair).toBe(ch.style.hair); // identity stays above the neck
    expect(look.skin).toBe(ch.style.skin);
  });
});
