/**
 * GS-story-sigil-formats — the Ch.3 Storm Championship is a 1v1 SINGLES MATCHPLAY (just you vs the
 * Apostate, hole by hole, the lower score takes the hole; win OR halve the match → the Sigil). Pure
 * resolver + the reducer wiring.
 */
import { describe, it, expect } from 'vitest';
import {
  STORY_TOURNAMENTS,
  isSinglesMatchTournament,
  isTeamTournament,
  isTeamMatchTournament,
} from '../src/sim/rpg/storyTournaments';
import { resolveStorySinglesMatch } from '../src/sim/rpg/storyTeams';
import { defaultStoryState } from '../src/sim/rpg/story';
import { initState } from '../src/ui/game';
import { resolveStoryTournament } from '../src/ui/gameUpdates';
import { buildStaticCourse } from '../src/sim/course/staticCourses';
import type { PlayedHole } from '../src/sim/round';

const ch3 = STORY_TOURNAMENTS.find((t) => t.chapter === 3 && !t.alignment)!;

describe('GS-story-sigil-formats — Ch.3 is a singles matchplay, not stableford/team/strokes', () => {
  it('the Storm Championship is a singles matchplay major', () => {
    expect(ch3.format).toBe('matchplay');
    expect(isSinglesMatchTournament(ch3)).toBe(true);
    expect(isTeamTournament(ch3)).toBe(false);
    expect(isTeamMatchTournament(ch3)).toBe(false);
  });

  it('the singles resolver is deterministic and reads win-or-halve advances', () => {
    const pars = Array.from({ length: 18 }, () => 4);
    const round = pars.map((p) => p - 1); // all birdies
    const a = resolveStorySinglesMatch(round, ch3.rivalId, ch3.rivalEdge, 'sm-1', pars);
    const b = resolveStorySinglesMatch(round, ch3.rivalId, ch3.rivalEdge, 'sm-1', pars);
    expect(a).toEqual(b);
    expect(a.playerAdvances).toBe(a.playerWon || a.halved);
    expect(a.scoreline.length).toBeGreaterThan(0);
    expect(a.thru).toBeGreaterThan(0);
    expect(a.thru).toBeLessThanOrEqual(18);
  });

  it('a birdie-a-hole round beats the rival; a blow-up round loses', () => {
    const pars = Array.from({ length: 18 }, () => 4);
    const strong = resolveStorySinglesMatch(pars.map((p) => p - 1), ch3.rivalId, ch3.rivalEdge, 'sm-2', pars);
    const weak = resolveStorySinglesMatch(pars.map((p) => p + 3), ch3.rivalId, ch3.rivalEdge, 'sm-2', pars);
    expect(strong.playerAdvances).toBe(true);
    expect(weak.playerWon).toBe(false);
  });
});

describe('GS-story-sigil-formats — the Ch.3 resolution (through the reducer)', () => {
  const course = buildStaticCourse(ch3.venueId);
  const pars = course.holes.map((h) => h.par);
  const roundOf = (delta: number) =>
    pars.map((par) => ({ record: { par, strokes: par + delta }, stat: {}, shots: [], putts: [], holed: true, pickedUp: false })) as unknown as PlayedHole[];
  const base = { ...defaultStoryState('feather-fade'), chapter: 3 };
  const s0 = initState('sm-seed', {}, undefined, base);
  const s = { ...s0, story: base, course, run: { ...s0.run, storyTournament: 3 } };

  it('a birdie-a-hole round wins the match and banks the Storm Sigil; the recap is a singles matchplay', () => {
    const win = resolveStoryTournament(s, roundOf(-1));
    const r = win.lastStoryTournament!;
    expect(r.match).toBeTruthy();
    expect(r.match!.kind).toBe('singles');
    expect(r.match!.scoreline.length).toBeGreaterThan(0);
    // singles matchplay has no ally / opposing pair
    expect(r.match!.allyName).toBeUndefined();
    expect(r.match!.oppNames).toBeUndefined();
    expect(r.won).toBe(true);
    expect(win.story!.trophyIds).toContain('sigil-storm');
    // no stroke leaderboard for a matchplay Sigil
    expect(r.leaderboard).toEqual([]);
  });

  it('a blow-up round loses the match and banks no Sigil', () => {
    const loss = resolveStoryTournament(s, roundOf(4));
    expect(loss.lastStoryTournament!.won).toBe(false);
    expect(loss.story!.trophyIds).not.toContain('sigil-storm');
  });
});
