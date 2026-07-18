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
  it('a tournament per chapter (Ch.4–5 forked by path), each with a distinct Sigil + a real venue', () => {
    // Every row is well-formed and its venue is one of its chapter's worlds.
    for (const t of STORY_TOURNAMENTS) {
      expect(t.chapter).toBeGreaterThanOrEqual(1);
      expect(chapterWorlds(t.chapter).some((w) => w.courseId === t.venueId), `${t.name} venue`).toBe(true);
      expect(t.intro.length).toBeGreaterThan(0);
    }
    // Each full path (Warden / Herald) is exactly five chapters with five distinct Sigils.
    for (const path of ['warden', 'herald'] as const) {
      const sigils = new Set<string>();
      for (let ch = 1; ch <= STORY_CHAPTER_COUNT; ch++) {
        const t = tournamentForChapter(ch, path);
        expect(t, `chapter ${ch} (${path})`).toBeTruthy();
        expect(t!.chapter).toBe(ch);
        sigils.add(t!.sigilId);
      }
      expect(sigils.size).toBe(STORY_CHAPTER_COUNT);
    }
    // Every tournament names a host (no bare placeholders); the bible's named cast is in place (GS-story-hosts).
    for (const t of STORY_TOURNAMENTS) expect(t.host.length).toBeGreaterThan(0);
    expect(tournamentForChapter(1)!.host).toBe('Sir Aldous Greensward');
    expect(tournamentForChapter(2)!.host).toBe('Magnus Cinder');
    expect(tournamentForChapter(4, 'herald')!.host).toBe('Sister Ecdysis');
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

  it('the back half forks by alignment (GS-story-chapters)', () => {
    // Chapters 1–3 are the shared trunk (same row regardless of path).
    for (let ch = 1; ch <= 3; ch++) {
      expect(tournamentForChapter(ch, 'warden')).toBe(tournamentForChapter(ch, 'herald'));
    }
    // Chapters 4–5 diverge: different venues, rivals, and Sigils per path.
    const w4 = tournamentForChapter(4, 'warden')!;
    const h4 = tournamentForChapter(4, 'herald')!;
    expect(w4.venueId).not.toBe(h4.venueId);
    expect(w4.sigilId).not.toBe(h4.sigilId);
    expect(w4.rivalName).toContain('Venoma');
    expect(h4.rivalName).toBe('Penelope'); // a former ally, now your rival
    const w5 = tournamentForChapter(5, 'warden')!;
    const h5 = tournamentForChapter(5, 'herald')!;
    expect(h5.rivalName).toBe('Driver Dan'); // the Ghost Harvest — crush your first caddy
    expect(w5.sigilId).not.toBe(h5.sigilId);
    // GS-story-route-rewards: the Chapter-4 major grants the route's signature ship
    expect(w4.rewardShipId).toBe('warden-cruiser');
    expect(h4.rewardShipId).toBe('wyrm-ship');
    // an unset path defaults to the Warden variant (defensive; by Ch.4 The Choice is made)
    expect(tournamentForChapter(4)).toBe(w4);
    // either full path collects exactly five distinct Sigils → the key
    const wardenSigils = new Set([1, 2, 3, 4, 5].map((c) => tournamentForChapter(c, 'warden')!.sigilId));
    const heraldSigils = new Set([1, 2, 3, 4, 5].map((c) => tournamentForChapter(c, 'herald')!.sigilId));
    expect(wardenSigils.size).toBe(5);
    expect(heraldSigils.size).toBe(5);
  });

  it('rivalTotal is deterministic and a stiffer edge scores lower (harder to beat)', () => {
    const pars = Array.from({ length: 18 }, () => 4);
    const t1 = tournamentForChapter(1)!; // gentle opener edge
    const t5 = tournamentForChapter(5)!; // the climax edge (stiffer)
    const a = rivalTotal(t1, 'seed-A', pars);
    const b = rivalTotal(t1, 'seed-A', pars);
    expect(a).toBe(b); // deterministic
    // The chapter-5 rival plays a lower (better) MEAN total than the chapter-1 rival. Averaged over seeds
    // because the once-per-round form draw (±~11 strokes) swamps the edge gap on any single card
    // (GS-story-balance narrowed the edges to a smooth curve, so a single-seed compare is pure noise).
    const mean = (t: typeof t1) => {
      let s = 0;
      for (let i = 0; i < 80; i++) s += rivalTotal(t, `edge-seed:${i}`, pars);
      return s / 80;
    };
    expect(mean(t5)).toBeLessThan(mean(t1));
  });
});
