/**
 * GS-story-betrayer — the Ch.5 2v2 best-ball MATCHPLAY finale: the MECHANISM (teams derived from the
 * partner picks + path, resolved through the reducer) and the BALANCE (seed-robust win rates — a strong
 * round wins the match, a blow-up doesn't, and the ally can't carry you). Balance is measured statistically
 * (the opponents play best-ball, so a single seed is noisy — mirrors story-balance.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { tournamentForChapter } from '../src/sim/rpg/storyTournaments';
import { resolveStory2v2Match } from '../src/sim/rpg/storyTeams';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { initState } from '../src/ui/game';
import { resolveStoryTournament } from '../src/ui/gameUpdates';
import { buildStaticCourse } from '../src/sim/course/staticCourses';
import type { PlayedHole } from '../src/sim/round';

// The finale edges the reducer uses (kept in sync with resolveStoryTournament's bestball-match branch).
const ALLY_EDGE = -0.1;
const OPP_EDGE = 0.24 * 0.5; // t.rivalEdge (0.24 at Ch.5) × 0.5

function resolveCh5(alignment: 'warden' | 'herald', delta: number, over: Partial<StoryState> = {}) {
  const t = tournamentForChapter(5, alignment)!;
  const course = buildStaticCourse(t.venueId);
  const pars = course.holes.map((h) => h.par);
  const round = pars.map((par) => ({ record: { par, strokes: par + delta }, stat: {}, shots: [], putts: [], holed: true, pickedUp: false })) as unknown as PlayedHole[];
  const base = { ...defaultStoryState('feather-fade'), chapter: 5, alignment, sigil1Partner: 'huang-woo-hook', sigil2Partner: 'longshot-larry', ...over };
  const s0 = initState('fin-seed', {}, undefined, base);
  const s = { ...s0, story: base, course, run: { ...s0.run, storyTournament: 5 } };
  return resolveStoryTournament(s, round);
}

/** Win rate of a flat player round (delta/hole) vs the opposing pair, over many seeds. */
function winRate(delta: number, allyId: string, oppIds: [string, string], allyEdge = ALLY_EDGE): number {
  const pars = Array.from({ length: 18 }, () => 4);
  const round = pars.map((p) => p + delta);
  let wins = 0;
  const N = 60;
  for (let k = 0; k < N; k++) {
    const r = resolveStory2v2Match(round, allyId, allyEdge, oppIds, OPP_EDGE, `fin-${k}`, pars);
    if (r.playerAdvances) wins++;
  }
  return wins / N;
}

describe('GS-story-betrayer — the finale MECHANISM (through the reducer)', () => {
  it('both Ch.5 Sigils are best-ball matchplay', () => {
    expect(tournamentForChapter(5, 'warden')!.format).toBe('bestball-match');
    expect(tournamentForChapter(5, 'herald')!.format).toBe('bestball-match');
  });

  it('WARDEN recap: the opponents are the betrayer + Venoma; you have a loyal ally', () => {
    const r = resolveCh5('warden', -1).lastStoryTournament!;
    expect(r.match).toBeTruthy();
    expect(r.match!.herald).toBe(false);
    expect(r.match!.scoreline.length).toBeGreaterThan(0);
    expect(r.match!.oppNames.join(' ')).toMatch(/Venoma|Viper/);
    expect(r.match!.allyName).toBeTruthy();
  });

  it('HERALD recap: a Coil champion partners you against your two former friends', () => {
    const r = resolveCh5('herald', -1).lastStoryTournament!;
    expect(r.match!.herald).toBe(true);
    expect(r.match!.allyName).toMatch(/Voss|Venoma|Viper|Sable/);
  });

  it('winning the fifth Sigil forges the key (finalSigil)', () => {
    const r = resolveCh5('warden', -3, {
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal'],
    });
    // a well-under round should carry the match on this seed; if it does, it's the final Sigil
    if (r.lastStoryTournament!.won) expect(r.lastStoryTournament!.finalSigil).toBe(true);
    expect(r.lastStoryTournament!.match).toBeTruthy();
  });
});

describe('GS-story-betrayer — the finale is winnable-but-earned (seed-robust)', () => {
  const OPP: [string, string] = ['huang-woo-hook', 'longshot-larry'];

  it('a strong round (−2/hole) wins the match most of the time', () => {
    expect(winRate(-2, 'venoma', OPP)).toBeGreaterThan(0.6);
  });

  it('a blow-up (+3/hole) wins only rarely — your ally can’t carry you', () => {
    expect(winRate(3, 'venoma', OPP)).toBeLessThan(0.25);
  });

  it('better rounds win more — skill is expressed', () => {
    const strong = winRate(-2, 'venoma', OPP);
    const weak = winRate(2, 'venoma', OPP);
    expect(strong).toBeGreaterThan(weak);
  });
});
