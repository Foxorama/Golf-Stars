/**
 * GS-story-sigil-live — the Sigil competitions play INTERACTIVELY throughout: a live match state on the
 * matchplay Sigils (from the SAME resolver streams as the finish, so live ≡ final), running team standings
 * through N holes (prefix-consistent with the full totals), a mid-round CLOSE-OUT the moment a match is
 * decided, and partial-round banking that never corrupts the 18-hole `worldBest`.
 */
import { describe, it, expect } from 'vitest';
import {
  tournamentForChapter,
  sigilMatchThrough,
  teamFieldPairs,
  teamPartnerOrDefault,
} from '../src/sim/rpg/storyTournaments';
import { opposingField, opposingPairTotal } from '../src/sim/rpg/storyTeams';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { initState, reduce } from '../src/ui/game';
import { resolveStoryTournament } from '../src/ui/gameUpdates';
import type { PlayedHole } from '../src/sim/round';

const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

/** A minimal synthetic PlayedHole carrying just a score (the resolution reads only record.par/strokes). */
function hole(par: number, strokes: number): PlayedHole {
  return { record: { par, strokes }, stat: {}, shots: [], putts: [], holed: true, pickedUp: false } as unknown as PlayedHole;
}

function storyAt(chapter: number, alignment?: 'warden' | 'herald'): StoryState {
  return { ...defaultStoryState('feather-fade'), chapter, alignment, sigil1Partner: 'huang-woo-hook', sigil2Partner: 'longshot-larry' };
}

describe('running team standings (opposingField upto)', () => {
  const story = storyAt(1);
  const t = tournamentForChapter(1)!; // Emerald scramble
  const pairs = teamFieldPairs(t, story, teamPartnerOrDefault(story, undefined));

  it('upto defaults to every hole (byte-identical) and a partial standing is a prefix of the finish', () => {
    for (const pair of pairs) {
      const full = opposingPairTotal(pair, 'seed-live', PARS, 'scramble');
      expect(opposingPairTotal(pair, 'seed-live', PARS, 'scramble', PARS.length)).toBe(full);
      // through-N totals are non-decreasing and never exceed the finish (same per-hole draws)
      let prev = 0;
      for (let n = 0; n <= PARS.length; n++) {
        const thru = opposingPairTotal(pair, 'seed-live', PARS, 'scramble', n);
        expect(thru).toBeGreaterThanOrEqual(prev);
        prev = thru;
      }
      expect(prev).toBe(full);
    }
    const fieldThru9 = opposingField(pairs, 'seed-live', PARS, 'scramble', 9);
    expect(fieldThru9.length).toBe(pairs.length);
  });
});

describe('live match state (sigilMatchThrough) — live ≡ final', () => {
  it('a partial singles match is a prefix of the full one, on the same streams', () => {
    const story = storyAt(3);
    const t = tournamentForChapter(3)!; // Storm — singles matchplay vs the Apostate
    const strokes = [4, 5, 3, 5, 4, 4, 4, 6, 4, 4, 5, 3, 5, 4, 4, 3, 5, 4];
    const full = sigilMatchThrough(t, story, strokes, 'seed-live', PARS)!;
    const part = sigilMatchThrough(t, story, strokes.slice(0, 9), 'seed-live', PARS)!;
    expect(part.kind).toBe('singles');
    expect(part.res.duels.length).toBeLessThanOrEqual(9);
    for (let i = 0; i < part.res.duels.length; i++) {
      expect(part.res.duels[i]).toEqual(full.res.duels[i]); // the finish never rewrites a live hole
    }
  });

  it('the 2v2 finale resolves teams from the betrayal arc and stops the moment the match is decided', () => {
    const story = storyAt(5, 'warden');
    const t = tournamentForChapter(5, 'warden')!;
    // a dominant round: 1 stroke per hole wins every hole → decided when up > holes remaining
    const m = sigilMatchThrough(t, story, PARS.map(() => 1), 'seed-live', PARS)!;
    expect(m.kind).toBe('team');
    expect(m.matchup?.oppIds).toContain('backspin-bo'); // the betrayer (odd one out of Woo/Larry picks)
    expect(m.res.state.decided).toBe(true);
    expect(m.res.thru).toBeLessThan(PARS.length); // closed out early — dead holes are never scored
    expect(m.res.duels.length).toBe(m.res.thru);
  });

  it('non-matchplay Sigils have no match state', () => {
    expect(sigilMatchThrough(tournamentForChapter(1)!, storyAt(1), [4, 4], 'seed-live', PARS)).toBeUndefined();
  });
});

describe('close-out banking (resolveStoryTournament on a decided match)', () => {
  /** A real Ch.3 tournament round state (run + course built by the reducers). */
  function ch3Round() {
    const story: StoryState = {
      ...storyAt(3),
      clearedWorldIds: ['standrews-18', 'crystal-18', 'fungal-18'],
      qualifierResults: { 'crystal-18': { place: 1, field: 12 }, 'fungal-18': { place: 2, field: 12 } },
    };
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };
    let s = reduce(hub, { type: 'openStoryTournament' });
    s = reduce(s, { type: 'storyPlayTournament' });
    while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
    return s;
  }

  it('a dominant round closes out early: only the holes the match ran are banked, worldBest untouched', () => {
    const s = ch3Round();
    const pars = s.course.holes.map((h) => h.par);
    const played = pars.map((p) => hole(p, 1)); // wins every hole — decided well before 18
    const done = resolveStoryTournament(s, played);
    const r = done.lastStoryTournament!;
    expect(r.won).toBe(true);
    expect(r.match?.kind).toBe('singles');
    expect(r.match!.thru).toBeLessThan(pars.length);
    // banked exactly the holes the match ran (auto ≡ interactive on the purse)
    expect(done.played!.length).toBe(r.match!.thru);
    // a partial round must never write the 18-hole record (the quest-round rule)
    expect(done.story!.worldBest['tempest-18']).toBeUndefined();
    // but the Sigil + chapter still bank
    expect(done.story!.trophyIds).toContain('sigil-storm');
  });

  it('a full-distance match banks the whole round and records the best', () => {
    const s = ch3Round();
    const pars = s.course.holes.map((h) => h.par);
    const t3 = tournamentForChapter(3)!;
    // Play EXACTLY the rival's card each hole (halve every hole) → all square through 18, never decided.
    // The card is read hole-by-hole off the live helper (prior holes halved keep the match undecided, so
    // the probe hole's duel is always present).
    const strokes: number[] = [];
    for (let i = 0; i < pars.length; i++) {
      const probe = sigilMatchThrough(t3, s.story, [...strokes, 9], String(s.run.seed), pars)!;
      strokes.push(probe.res.duels[i]!.bossStrokes);
    }
    const played = strokes.map((st, i) => hole(pars[i]!, st));
    const done = resolveStoryTournament(s, played);
    const r = done.lastStoryTournament!;
    expect(r.match!.thru).toBe(pars.length);
    expect(done.played!.length).toBe(pars.length);
    expect(done.story!.worldBest['tempest-18']).toBeTruthy();
    expect(r.won).toBe(true); // a halved match advances (the campaign's convention)
  });

  it('the interactive reducer closes a decided match out mid-round (holeComplete → result)', () => {
    // Drive the real interactive loop; whatever the outcome, the invariant holds: the banked holes equal
    // the match's `thru`, and a short round leaves the venue's 18-hole best unwritten.
    let s = ch3Round();
    s = reduce(s, { type: 'playInteractive' });
    let guard = 0;
    while (s.screen === 'playing' || s.screen === 'storyTournamentPop' || s.screen === 'storyMidBeat') {
      if (guard++ > 800) throw new Error('round never resolved');
      if (s.screen === 'storyMidBeat') {
        // GS-story-midround-omen: the pre-Choice betrayal foreshadow lands at the Ch.3 turn (both partner
        // picks locked, path unchosen) — dismiss it into the halftime pop.
        s = reduce(s, { type: 'storyMidBeatContinue' });
        continue;
      }
      if (s.screen === 'storyTournamentPop') {
        // GS-story-sigil-live: the matchplay halftime pop reads the MATCH, not stroke counts.
        expect(s.storyTournamentMidPop?.match).toBeTruthy();
        expect(s.storyTournamentMidPop!.match!.thru).toBeLessThanOrEqual(9);
        s = reduce(s, { type: 'tournamentPopContinue' });
        continue;
      }
      while (s.play && !s.play.done && guard++ < 4000) s = reduce(s, { type: 'autoShotHole' });
      s = reduce(s, { type: 'holeComplete' });
    }
    expect(s.screen).toBe('storyTournamentResult');
    const r = s.lastStoryTournament!;
    expect(s.played!.length).toBe(r.match!.thru);
    if (r.match!.thru < 18) expect(s.story!.worldBest['tempest-18']).toBeUndefined();
    else expect(s.story!.worldBest['tempest-18']).toBeTruthy();
  });
});
