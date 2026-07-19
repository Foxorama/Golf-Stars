import { describe, it, expect } from 'vitest';
import {
  STORY_TOURNAMENTS,
  tournamentForChapter,
  rivalTotal,
  SIGIL_WIN_BONUS,
  type StoryTournament,
} from '../src/sim/rpg/storyTournaments';
import { buildStaticCourse } from '../src/sim/course/staticCourses';
import { storyRoundCredits, defaultStoryState, type StoryAlignment } from '../src/sim/rpg/story';
import { initState } from '../src/ui/game';
import { resolveStoryTournament } from '../src/ui/gameUpdates';
import type { PlayedHole } from '../src/sim/round';

/**
 * GS-story-balance — the cross-chapter difficulty + economy pass, guarded.
 *
 * The Story tournaments are ghost-vs-gross (the Asgard model): the player's real venue gross vs a rival
 * ghost tuned by `rivalEdge`, calibrated for INTERACTIVE human play (a several-under round grows with the
 * bag). We measure the rival ghost (deterministic per seed) against fixed to-par REFERENCE rounds and
 * assert the campaign spine is winnable-but-earned: a strong grown round (−6) clears every Sigil at a
 * fair, chapter-declining rate; an ungrown (even-par) round is NOT a reliable win; and difficulty rises
 * monotonically. This locks the curve so a future edge tweak can't quietly make the spine unwinnable (the
 * pre-pass state: a −6 round won only ~13% by Ch5) or a gimme.
 */

const SEEDS = 150;

/** Fraction of seeds a player shooting `toPar` beats the tournament's rival ghost (ties to player). */
function winRate(t: StoryTournament, toPar: number): number {
  const pars = buildStaticCourse(t.venueId).holes.map((h) => h.par);
  const par = pars.reduce((a, b) => a + b, 0);
  let wins = 0;
  for (let i = 0; i < SEEDS; i++) {
    if (par + toPar <= rivalTotal(t, `bal:${t.chapter}:${t.alignment ?? '-'}:${i}`, pars)) wins++;
  }
  return wins / SEEDS;
}

/** Mean rival to-par over many seeds (a stable difficulty measure, venue-par-independent). */
function meanRivalToPar(t: StoryTournament): number {
  const pars = buildStaticCourse(t.venueId).holes.map((h) => h.par);
  const par = pars.reduce((a, b) => a + b, 0);
  let sum = 0;
  for (let i = 0; i < SEEDS; i++) sum += rivalTotal(t, `bal:${t.chapter}:${t.alignment ?? '-'}:${i}`, pars) - par;
  return sum / SEEDS;
}

describe('GS-story-balance — the tournament difficulty curve is fair + winnable', () => {
  it('every Sigil is winnable by a strong grown round (−6), and none is an ungrown gimme', () => {
    for (const t of STORY_TOURNAMENTS) {
      const strong = winRate(t, -6); // a grown bag + good play
      const even = winRate(t, 0); // an ungrown, even-par round
      // Always winnable with a grown bag — the spine must never brick (pre-pass Ch5 was ~13%).
      expect(strong, `${t.name}: strong (−6) win-rate`).toBeGreaterThan(0.3);
      // ...but growth has to matter: an even-par round can't reliably buy the Sigil.
      expect(even, `${t.name}: even-par win-rate`).toBeLessThan(0.45);
      // A grown round always out-performs an ungrown one here.
      expect(strong).toBeGreaterThan(even);
    }
  });

  it('the opener is gentle and the finale Sigils are a genuine (but fair) contest', () => {
    const ch1 = STORY_TOURNAMENTS.find((t) => t.chapter === 1)!;
    expect(winRate(ch1, -6), 'Ch1 strong win-rate').toBeGreaterThan(0.62); // a warm welcome
    for (const path of ['warden', 'herald'] as StoryAlignment[]) {
      const ch5 = tournamentForChapter(5, path)!;
      const strong = winRate(ch5, -6);
      expect(strong, `Ch5-${path} strong win-rate`).toBeGreaterThan(0.3); // earned, not impossible
      expect(strong, `Ch5-${path} strong win-rate`).toBeLessThan(0.55); // the climax is a real test
    }
  });

  it('difficulty rises monotonically across the chapters, on both paths', () => {
    for (const path of ['warden', 'herald'] as StoryAlignment[]) {
      const curve = [1, 2, 3, 4, 5].map((ch) => meanRivalToPar(tournamentForChapter(ch, path)!));
      for (let i = 1; i < curve.length; i++) {
        // each chapter's rival shoots (meaningfully) LOWER to par than the last — harder, no cliffs.
        expect(curve[i]!, `path ${path} chapter ${i + 1} vs ${i}`).toBeLessThan(curve[i - 1]!);
      }
      // and the whole climb is gradual (no single step is a wall) — the pre-pass Ch2→Ch3 jump was ~3 strokes.
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i - 1]! - curve[i]!, `path ${path} step ${i}`).toBeLessThan(2.2);
      }
    }
  });
});

describe('GS-story-balance — the economy funds the campaign', () => {
  it('the Sigil-win bonus roughly funds the finale arsenal floor', () => {
    // The cheapest finale-clearing arsenal is ~1300 cr (scatter+railgun weapon 26, deflector+aegis def 32).
    // Five Sigil bonuses should shoulder most of that so the majors ARE the paydays, not flat rounds.
    expect(SIGIL_WIN_BONUS).toBeGreaterThan(0);
    expect(5 * SIGIL_WIN_BONUS).toBeGreaterThanOrEqual(1250);
  });

  it('round pay rewards under-par play and floors for a blow-up', () => {
    expect(storyRoundCredits(0)).toBe(200); // even par baseline
    expect(storyRoundCredits(-6)).toBeGreaterThan(storyRoundCredits(0)); // under par pays more
    expect(storyRoundCredits(4)).toBeLessThan(storyRoundCredits(0)); // over par pays less
    expect(storyRoundCredits(50)).toBe(100); // floored — a disaster still pays something
  });

  it('a Sigil WIN pays the milestone bonus on top of the round; a loss does not', () => {
    const course = buildStaticCourse('verdant-18');
    const pars = course.holes.map((h) => h.par);
    // Craft deterministic rounds: a birdie-everything WIN and a blow-up LOSS (only .record is read).
    const roundOf = (delta: number) =>
      pars.map((par) => ({ record: { par, strokes: par + delta }, stat: {}, shots: [], putts: [], holed: true, pickedUp: false })) as unknown as PlayedHole[];
    const base = { ...defaultStoryState(), chapter: 1, credits: 500 };
    const s0 = initState('bonus-seed', {}, undefined, base);
    const s = { ...s0, story: base, course, run: { ...s0.run, storyTournament: 1 } };

    // WIN (−18 to par crushes the ~−8 rival): round pay + the Sigil bonus, and the Sigil is banked.
    const win = resolveStoryTournament(s, roundOf(-1));
    expect(win.lastStoryTournament!.won).toBe(true);
    expect(win.story!.credits).toBe(500 + storyRoundCredits(-1 * pars.length) + SIGIL_WIN_BONUS);
    expect(win.story!.trophyIds).toContain('sigil-emerald');
    // GS-story-tournament-reward: the promised prize CLUB is actually GRANTED + equipped (the Emerald
    // Invitational bug — it named a prize club and never handed it over).
    expect(win.story!.ownedClubIds).toContain('major:emerald');
    expect(win.story!.equippedBagIds).toContain('major:emerald');

    // LOSS (+3/hole): round pay only, no bonus, no Sigil — and no prize club.
    const loss = resolveStoryTournament(s, roundOf(3));
    expect(loss.lastStoryTournament!.won).toBe(false);
    expect(loss.story!.credits).toBe(500 + storyRoundCredits(3 * pars.length));
    expect(loss.story!.trophyIds).not.toContain('sigil-emerald');
    expect(loss.story!.ownedClubIds).not.toContain('major:emerald');
  });
});
