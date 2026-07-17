import { describe, it, expect } from 'vitest';
import {
  STORY_TOURNAMENTS,
  tournamentForChapter,
  chapterWorlds,
  worldsClearedInChapter,
  currentTournament,
  tournamentUnlocked,
  tournamentWon,
  rivalTotal,
  winTournament,
  sigilCount,
} from '../src/sim/rpg/storyTournaments';
import {
  defaultStoryState,
  recordWorldClear,
  keyToOtherRealm,
  storyComplete,
  STORY_CHAPTER_COUNT,
  type StoryState,
} from '../src/sim/rpg/story';

function clearWorlds(story: StoryState, ids: string[]): StoryState {
  let s = story;
  for (const id of ids) s = recordWorldClear(s, id, { toPar: 0, strokes: 72, par: 72, seed: 'x' }, 0);
  return s;
}

describe('Galaxy Tournaments (GS-story-tournament)', () => {
  it('one tournament per chapter, each with a distinct Sigil + a real venue', () => {
    expect(STORY_TOURNAMENTS.length).toBe(STORY_CHAPTER_COUNT);
    const sigils = new Set<string>();
    for (let ch = 1; ch <= STORY_CHAPTER_COUNT; ch++) {
      const t = tournamentForChapter(ch);
      expect(t, `chapter ${ch} tournament`).toBeTruthy();
      expect(t!.chapter).toBe(ch);
      expect(chapterWorlds(ch).some((w) => w.courseId === t!.venueId)).toBe(true);
      expect(t!.intro.length).toBeGreaterThan(0);
      sigils.add(t!.sigilId);
    }
    expect(sigils.size).toBe(STORY_CHAPTER_COUNT); // distinct
  });

  it('unlocks only once enough of the chapter’s worlds are cleared, and only while unwon', () => {
    const ch1 = chapterWorlds(1).map((w) => w.courseId);
    const s0 = { ...defaultStoryState('feather-fade'), chapter: 1 };
    expect(tournamentUnlocked(s0)).toBe(false); // nothing cleared
    const one = clearWorlds(s0, [ch1[0]!]);
    expect(worldsClearedInChapter(one, 1)).toBe(1);
    expect(tournamentUnlocked(one)).toBe(false); // needs 2
    const two = clearWorlds(s0, [ch1[0]!, ch1[1]!]);
    expect(tournamentUnlocked(two)).toBe(true);
    expect(currentTournament(two)?.chapter).toBe(1);
    // once the Sigil is won, it no longer offers (even with worlds cleared)
    const won = winTournament(two, tournamentForChapter(1)!);
    expect(tournamentWon(won, tournamentForChapter(1)!)).toBe(true);
    // winning advanced the chapter to 2, so chapter 1's tournament is behind us
    expect(won.chapter).toBe(2);
  });

  it('winning banks the Sigil and advances the chapter (capped)', () => {
    let s: StoryState = { ...defaultStoryState(), chapter: 1 };
    for (let ch = 1; ch <= STORY_CHAPTER_COUNT; ch++) {
      s = winTournament(s, tournamentForChapter(ch)!);
    }
    expect(sigilCount(s)).toBe(STORY_CHAPTER_COUNT);
    expect(s.chapter).toBe(STORY_CHAPTER_COUNT); // capped, not 6
    // five Sigils → the KEY to the finale is forged, but the campaign isn't complete until the finale is won
    expect(keyToOtherRealm(s)).toBe(true);
    expect(storyComplete(s)).toBe(false);
    // idempotent: re-winning a Sigil doesn't duplicate it
    const again = winTournament(s, tournamentForChapter(3)!);
    expect(sigilCount(again)).toBe(STORY_CHAPTER_COUNT);
  });

  it('rivalTotal is deterministic and a stiffer edge scores lower (harder to beat)', () => {
    const pars = Array.from({ length: 18 }, () => 4);
    const t1 = tournamentForChapter(1)!; // edge 0.12
    const t5 = tournamentForChapter(5)!; // edge 0.50
    const a = rivalTotal(t1, 'seed-A', pars);
    const b = rivalTotal(t1, 'seed-A', pars);
    expect(a).toBe(b); // deterministic
    // the chapter-5 rival plays a lower (better) total than the chapter-1 rival on the same card
    expect(rivalTotal(t5, 'seed-A', pars)).toBeLessThan(rivalTotal(t1, 'seed-A', pars));
  });
});
