/**
 * GS-story-stableford — the Ch.3 Storm Championship is a single-person STABLEFORD (points, higher wins;
 * attack every flag, a blow-up hole only costs that hole). Pure helpers + the resolution.
 */
import { describe, it, expect } from 'vitest';
import {
  STORY_TOURNAMENTS,
  isStablefordTournament,
  isTeamTournament,
  rivalStablefordTotal,
  stablefordLeaderboard,
} from '../src/sim/rpg/storyTournaments';
import { defaultStoryState } from '../src/sim/rpg/story';
import { initState } from '../src/ui/game';
import { resolveStoryTournament } from '../src/ui/gameUpdates';
import { buildStaticCourse } from '../src/sim/course/staticCourses';
import type { PlayedHole } from '../src/sim/round';

const ch3 = STORY_TOURNAMENTS.find((t) => t.chapter === 3 && !t.alignment)!;

describe('GS-story-stableford — Ch.3 is Stableford, not team/strokes', () => {
  it('the Storm Championship is a stableford major', () => {
    expect(ch3.format).toBe('stableford');
    expect(isStablefordTournament(ch3)).toBe(true);
    expect(isTeamTournament(ch3)).toBe(false);
  });

  it('the rival posts a deterministic, positive points total', () => {
    const pars = buildStaticCourse(ch3.venueId).holes.map((h) => h.par);
    const a = rivalStablefordTotal(ch3, 'sf-1', pars);
    const b = rivalStablefordTotal(ch3, 'sf-1', pars);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it('the points leaderboard is sorted HIGH→low and includes you + rival + friends', () => {
    const pars = buildStaticCourse(ch3.venueId).holes.map((h) => h.par);
    const board = stablefordLeaderboard(ch3, 'sf-2', pars, 'feather-fade', 'You', 40);
    const totals = board.map((b) => b.gross);
    expect(totals).toEqual([...totals].sort((a, b) => b - a)); // descending
    expect(board.some((b) => b.kind === 'player')).toBe(true);
    expect(board.some((b) => b.kind === 'rival')).toBe(true);
    expect(board.filter((b) => b.kind === 'friend')).toHaveLength(3);
  });
});

describe('GS-story-stableford — the resolution (points, higher wins)', () => {
  const course = buildStaticCourse(ch3.venueId);
  const pars = course.holes.map((h) => h.par);
  const roundOf = (delta: number) =>
    pars.map((par) => ({ record: { par, strokes: par + delta }, stat: {}, shots: [], putts: [], holed: true, pickedUp: false })) as unknown as PlayedHole[];
  const base = { ...defaultStoryState('feather-fade'), chapter: 3 };
  const s0 = initState('sf-seed', {}, undefined, base);
  const s = { ...s0, story: base, course, run: { ...s0.run, storyTournament: 3 } };

  it('a birdie-a-hole round wins on points and banks the Storm Sigil; the recap is stableford-flagged', () => {
    const win = resolveStoryTournament(s, roundOf(-1));
    expect(win.lastStoryTournament!.stableford).toBe(true);
    expect(win.lastStoryTournament!.won).toBe(true);
    // higher points win → your points ≥ the rival's
    expect(win.lastStoryTournament!.playerGross).toBeGreaterThanOrEqual(win.lastStoryTournament!.rivalGross);
    expect(win.story!.trophyIds).toContain('sigil-storm');
  });

  it('a blow-up round (no points) loses', () => {
    const loss = resolveStoryTournament(s, roundOf(3));
    expect(loss.lastStoryTournament!.won).toBe(false);
    expect(loss.story!.trophyIds).not.toContain('sigil-storm');
  });

  it('won is consistent with points (player ≥ rival)', () => {
    for (const delta of [-2, -1, 0, 1, 2]) {
      const r = resolveStoryTournament(s, roundOf(delta)).lastStoryTournament!;
      expect(r.won).toBe(r.playerGross >= r.rivalGross);
    }
  });
});
