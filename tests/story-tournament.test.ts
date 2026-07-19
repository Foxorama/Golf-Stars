import { describe, it, expect } from 'vitest';
import {
  STORY_TOURNAMENTS,
  tournamentForChapter,
  chapterWorlds,
  worldsClearedInChapter,
  chapterQualifierEvents,
  currentTournament,
  tournamentUnlocked,
  tournamentWon,
  rivalTotal,
  winTournament,
  sigilCount,
  tournamentField,
  tournamentLeaderboard,
} from '../src/sim/rpg/storyTournaments';
import { recordQualifier } from '../src/sim/rpg/storyQualifiers';
import { CHARACTERS } from '../src/sim/rpg/characters';
import {
  defaultStoryState,
  recordWorldClear,
  keyToOtherRealm,
  storyComplete,
  resolveStoryClub,
  STORY_CHAPTER_COUNT,
  type StoryState,
} from '../src/sim/rpg/story';
import { storyClubEffectLabel } from '../src/sim/rpg/storyClubEffects';

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
    // GS-story-tournament-reward: the trunk majors (Ch.1–3) promise a CLUB — it must be a real, resolving,
    // effect-carrying reward club (the Emerald Invitational used to name a prize and never grant it).
    for (const ch of [1, 2, 3]) {
      const t = tournamentForChapter(ch)!;
      expect(t.rewardClubId, `chapter ${ch} prize club id`).toBeTruthy();
      expect(resolveStoryClub(t.rewardClubId!), `chapter ${ch} prize club resolves`).toBeTruthy();
      expect(storyClubEffectLabel(t.rewardClubId!), `chapter ${ch} prize club effect`).toBeTruthy();
    }
    expect(tournamentForChapter(1)!.host).toBe('Sir Aldous Greensward');
    expect(tournamentForChapter(2)!.host).toBe('Magnus Cinder');
    expect(tournamentForChapter(4, 'herald')!.host).toBe('Sister Ecdysis');
  });

  it('unlocks only once you QUALIFY (top-N) in two of the chapter’s events, and only while unwon (GS-story-qualifiers)', () => {
    const s0 = { ...defaultStoryState('feather-fade'), chapter: 1 };
    const events = chapterQualifierEvents(1, undefined); // Ch.1 qualifiers (the two non-venue worlds)
    expect(events.length).toBe(2);
    expect(tournamentUnlocked(s0)).toBe(false); // nothing qualified

    // Clearing BOTH events is no longer enough — you must actually place top-N.
    const cleared = clearWorlds(s0, events);
    expect(worldsClearedInChapter(cleared, 1)).toBeGreaterThanOrEqual(2);
    expect(tournamentUnlocked(cleared)).toBe(false);

    // One top-10 finish isn't enough; a finish outside the top-10 doesn't count.
    const one = recordQualifier(s0, events[0]!, 3, 16);
    expect(tournamentUnlocked(one)).toBe(false);
    const missed = recordQualifier(one, events[1]!, 12, 16); // Ch.1 top is 10 → 12th misses
    expect(tournamentUnlocked(missed)).toBe(false);

    // Two top-N finishes unlock it.
    const two = recordQualifier(one, events[1]!, 6, 16);
    expect(tournamentUnlocked(two)).toBe(true);
    expect(currentTournament(two)?.chapter).toBe(1);

    // once the Sigil is won, it no longer offers; winning advanced the chapter to 2
    const won = winTournament(two, tournamentForChapter(1)!);
    expect(tournamentWon(won, tournamentForChapter(1)!)).toBe(true);
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
    expect(h5.rivalName).toBe('Driver Dan'); // the Ghost Harvest — crush the old Warden road-caddy
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

describe('Tournament FIELD — all competitors (GS-story-tournament-field)', () => {
  const t = STORY_TOURNAMENTS[0]!; // Ch.1 Emerald Invitational (rival = Birdie Bianchi, not a playable golfer)
  const pars = Array.from({ length: 18 }, (_, i) => (i % 3 === 0 ? 5 : i % 3 === 1 ? 3 : 4));

  it('the field is the rival + your three friends (never the protagonist), deterministic from the seed', () => {
    const prot = CHARACTERS[0]!.id;
    const field = tournamentField(t, 'field-seed', pars, prot);
    // rival + the three non-protagonist playable golfers.
    expect(field.filter((g) => g.kind === 'rival')).toHaveLength(1);
    expect(field.filter((g) => g.kind === 'friend')).toHaveLength(CHARACTERS.length - 1);
    expect(field.some((g) => g.id === prot)).toBe(false); // never yourself
    // Deterministic: same seed → identical grosses.
    const again = tournamentField(t, 'field-seed', pars, prot);
    expect(again.map((g) => g.gross)).toEqual(field.map((g) => g.gross));
    // Different seed → the field re-rolls (grosses can differ).
    const other = tournamentField(t, 'other-seed', pars, prot);
    expect(other.map((g) => g.gross)).not.toEqual(field.map((g) => g.gross));
  });

  it('the finished leaderboard folds YOU in and sorts low-gross-first (ties keep you ahead)', () => {
    const field = tournamentField(t, 'lb-seed', pars, CHARACTERS[0]!.id);
    const board = tournamentLeaderboard(field, 'You', 70);
    expect(board).toHaveLength(field.length + 1);
    // sorted ascending by gross
    for (let i = 1; i < board.length; i++) expect(board[i]!.gross).toBeGreaterThanOrEqual(board[i - 1]!.gross);
    expect(board.filter((g) => g.kind === 'player')).toHaveLength(1);
    // A tie puts the player ahead of the tied rival/friend.
    const tieGross = field[0]!.gross;
    const tied = tournamentLeaderboard(field, 'You', tieGross);
    const youIdx = tied.findIndex((g) => g.kind === 'player');
    const rivalIdx = tied.findIndex((g) => g.id === field[0]!.id);
    if (field[0]!.gross === tieGross) expect(youIdx).toBeLessThan(rivalIdx);
  });
});
