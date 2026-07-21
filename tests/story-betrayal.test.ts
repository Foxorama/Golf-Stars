/**
 * GS-story-betrayer — the odd-one-out rule: WHO betrays you is decided by your two team-Sigil partner picks.
 * Pure, deterministic; the single source the beats + the 2v2 finale + the costume all read.
 */
import { describe, it, expect } from 'vitest';
import {
  betrayerId,
  loyalAllyId,
  heraldOpponentIds,
  heraldSeveredId,
  coilChampionExcluding,
  coilChampionName,
  corruptedLookOpts,
  friendRivalTaunt,
  friendRivalHalftime,
  everyGolferHasBetrayalVoice,
  COIL_SHIRT,
} from '../src/sim/rpg/storyBetrayal';
import { tournamentForChapter, tournamentRival, tournamentIntroLines } from '../src/sim/rpg/storyTournaments';
import { interludeFriend } from '../src/sim/rpg/storyInterlude';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { CHARACTERS, getCharacter } from '../src/sim/rpg/characters';
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

describe('GS-story-sigil-rivals — the severed friend + dynamic tournament rivals', () => {
  it('the severed friend is exactly the one tour-mate NOT in the Ch.5 opposing pair', () => {
    for (const picks of [[A, B], [A, C], [B, C], [A, A], [B, B], [C, C], [A, undefined], [undefined, undefined]] as const) {
      const st = s(picks[0], picks[1]);
      const severed = heraldSeveredId(st);
      const opp = heraldOpponentIds(st);
      expect(opp).not.toContain(severed);
      // severed + the two opponents = the whole trio, no protagonist
      expect([severed, ...opp].sort()).toEqual([...OTHERS].sort());
    }
  });

  it('Ch.4 Herald rival IS the severed friend — the rival you crush is the friend you then sever', () => {
    const st = { ...s(A, B), alignment: 'herald' as const, chapter: 4 };
    const t = tournamentForChapter(4, 'herald')!;
    const rival = tournamentRival(t, st);
    expect(rival.golferId).toBe(heraldSeveredId(st)); // = C
    expect(rival.name).toBe(getCharacter(C)!.shortName);
    expect(rival.voice).toBe('confront');
    expect(rival.corrupted).toBeFalsy(); // they're still a Warden — YOU are the corrupted one
    // the interlude severs the SAME person (rival ≡ severed friend, in every pick case)
    expect(interludeFriend(st).id).toBe(rival.golferId);
  });

  it('same-partner-twice keeps the trusted friend for the Ghost Harvest (the severed one differs)', () => {
    const st = { ...s(A, A), alignment: 'herald' as const, chapter: 4 };
    const severed = heraldSeveredId(st);
    expect(severed).not.toBe(A); // the trusted friend still comes for you at Ch.5
    expect(heraldOpponentIds(st)).toContain(A);
    expect(interludeFriend(st).id).toBe(severed);
  });

  it('Ch.5 Warden rival is the corrupted BETRAYER; Ch.5 Herald features a former friend-partner', () => {
    const warden = { ...s(A, B), alignment: 'warden' as const, chapter: 5 };
    const w = tournamentRival(tournamentForChapter(5, 'warden')!, warden);
    expect(w.golferId).toBe(betrayerId(warden)); // = C
    expect(w.corrupted).toBe(true);
    expect(w.voice).toBe('corrupt');

    const herald = { ...s(A, B), alignment: 'herald' as const, chapter: 5 };
    const h = tournamentRival(tournamentForChapter(5, 'herald')!, herald);
    expect(heraldOpponentIds(herald)).toContain(h.golferId);
    expect(h.voice).toBe('confront');
  });

  it('trunk + Ch.4 Warden rivals stay the static NPCs; no story → the fallback row rival', () => {
    const st = s(A, B);
    for (const [ch, path] of [[1, undefined], [2, undefined], [3, undefined], [4, 'warden']] as const) {
      const t = tournamentForChapter(ch, path as 'warden' | undefined)!;
      const r = tournamentRival(t, st);
      expect(r.id).toBe(t.rivalId);
      expect(r.golferId).toBeUndefined();
    }
    const h4 = tournamentForChapter(4, 'herald')!;
    expect(tournamentRival(h4, undefined).id).toBe(h4.rivalId); // storyless fallback never throws
  });

  it('intro lines resolve every story token — no {rival}/{opponents} ever reaches the screen', () => {
    const st = { ...s(A, B), alignment: 'herald' as const };
    for (const path of ['warden', 'herald'] as const) {
      for (let ch = 1; ch <= 5; ch++) {
        const t = tournamentForChapter(ch, path)!;
        for (const line of tournamentIntroLines(t, { ...st, alignment: path })) {
          expect(line).not.toMatch(/\{rival\}|\{opponents\}/);
        }
      }
    }
    // the Drowning Rite intro names the actual severed friend
    const h4 = tournamentForChapter(4, 'herald')!;
    const severedName = getCharacter(heraldSeveredId(st))!.shortName;
    expect(tournamentIntroLines(h4, st).join(' ')).toContain(severedName);
  });

  it('every golfer has a full betrayal voice: defection, farewell, confront + corrupt rival lines', () => {
    expect(everyGolferHasBetrayalVoice()).toBe(true);
    for (const c of CHARACTERS) {
      for (const voice of ['confront', 'corrupt'] as const) {
        expect(friendRivalTaunt(c.id, voice).length).toBeGreaterThan(10);
        expect(friendRivalHalftime(c.id, voice, true)).not.toBe(friendRivalHalftime(c.id, voice, false));
      }
    }
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
