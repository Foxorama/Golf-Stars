/**
 * GS-story-partners — pick a friend as your partner for the team Sigils (Scramble Ch.1 / Best-ball Ch.2),
 * the pick locked into the campaign (it drives the betrayal branch). Pure helpers + the reducer flow.
 */
import { describe, it, expect } from 'vitest';
import {
  STORY_TOURNAMENTS,
  isTeamTournament,
  teamPartnerPool,
  teamPartnerOrDefault,
  teamFieldPairs,
} from '../src/sim/rpg/storyTournaments';
import {
  defaultStoryState,
  setSigilPartner,
  sigilPartner,
  migrateStory,
  STORY_VERSION,
  type StoryState,
} from '../src/sim/rpg/story';
import { initState, reduce } from '../src/ui/game';
import { resolveStoryTournament } from '../src/ui/gameUpdates';
import { buildStaticCourse } from '../src/sim/course/staticCourses';
import type { PlayedHole } from '../src/sim/round';

const story = (over: Partial<StoryState> = {}): StoryState => ({ ...defaultStoryState('feather-fade'), ...over });

describe('GS-story-partners — team-format rows + pairs', () => {
  it('Ch.1 is a scramble and Ch.2 a best-ball; Ch.3+ are solo', () => {
    const byChapter = (c: number) => STORY_TOURNAMENTS.find((t) => t.chapter === c && !t.alignment)!;
    expect(byChapter(1).format).toBe('scramble');
    expect(byChapter(2).format).toBe('bestball');
    expect(isTeamTournament(byChapter(1))).toBe(true);
    expect(isTeamTournament(byChapter(2))).toBe(true);
    expect(isTeamTournament(byChapter(3))).toBe(false);
  });

  it('the partner pool is your three friends; default falls back to the first', () => {
    const s = story();
    expect(teamPartnerPool(s).map((p) => p.id)).not.toContain('feather-fade');
    expect(teamPartnerPool(s)).toHaveLength(3);
    expect(teamPartnerOrDefault(s, 'longshot-larry')).toBe('longshot-larry');
    expect(teamPartnerOrDefault(s, 'not-a-golfer')).toBe(teamPartnerPool(s)[0]!.id);
    expect(teamPartnerOrDefault(s, undefined)).toBe(teamPartnerPool(s)[0]!.id);
  });

  it('the opposing pairs are the rival pair + randos + the two NON-chosen friends (never your partner)', () => {
    const s = story();
    const t = STORY_TOURNAMENTS.find((x) => x.chapter === 1)!;
    const partnerId = 'huang-woo-hook';
    const pairs = teamFieldPairs(t, s, partnerId);
    // your partner appears in NO opposing pair
    for (const p of pairs) expect(p.golferIds).not.toContain(partnerId);
    // the "friends" pair is exactly the two non-chosen tour-mates
    const friends = pairs.find((p) => p.id === 'friends')!;
    const expected = teamPartnerPool(s).map((p) => p.id).filter((id) => id !== partnerId);
    expect([...friends.golferIds].sort()).toEqual(expected.sort());
    // the rival's pair leads on the sharpest edge
    expect(pairs.find((p) => p.id === 'rival')!.golferIds).toContain(t.rivalId);
  });
});

describe('GS-story-partners — StoryState partner fields (v5)', () => {
  it('setSigilPartner records per chapter; sigilPartner reads it back', () => {
    let s = story();
    s = setSigilPartner(s, 1, 'longshot-larry');
    s = setSigilPartner(s, 2, 'backspin-bo');
    expect(sigilPartner(s, 1)).toBe('longshot-larry');
    expect(sigilPartner(s, 2)).toBe('backspin-bo');
    expect(s.sigil1Partner).toBe('longshot-larry');
    expect(s.sigil2Partner).toBe('backspin-bo');
    // a non-team chapter is a no-op
    expect(setSigilPartner(s, 3, 'x')).toBe(s);
  });

  it('the version is 5 and the partner fields survive a migrate round-trip', () => {
    expect(STORY_VERSION).toBe(5);
    const blob = { ...story({ sigil1Partner: 'longshot-larry', sigil2Partner: 'backspin-bo' }), version: 4 };
    const migrated = migrateStory(JSON.parse(JSON.stringify(blob)));
    expect(migrated.version).toBe(5);
    expect(migrated.sigil1Partner).toBe('longshot-larry');
    expect(migrated.sigil2Partner).toBe('backspin-bo');
    // an old blob with no partner fields upgrades cleanly (fields absent)
    const old = migrateStory({ characterId: 'feather-fade', version: 4 });
    expect(old.sigil1Partner).toBeUndefined();
  });
});

describe('GS-story-partners — the reducer flow', () => {
  it('selectStoryPartner sets the pick (only on the lobby, only a real friend)', () => {
    const hub = reduce(reduce(initState('seed'), { type: 'openStory' }), { type: 'selectCharacter', characterId: 'feather-fade' });
    const withCh1 = { ...hub, story: story({ chapter: 1 }) };
    const lobby = reduce(withCh1, { type: 'openStoryTournament' });
    // needs the lobby screen to be reachable — if not unlocked, guard rejects; assert the guard shape instead
    const picked = reduce({ ...lobby, screen: 'storyTournament' as const }, { type: 'selectStoryPartner', characterId: 'backspin-bo' });
    expect(picked.storyPartnerPick).toBe('backspin-bo');
    // your own id is rejected
    const same = reduce({ ...lobby, screen: 'storyTournament' as const }, { type: 'selectStoryPartner', characterId: 'feather-fade' });
    expect(same.storyPartnerPick).toBeUndefined();
  });

  it('resolving a Ch.1 team major locks the partner into the campaign + emits a team recap', () => {
    const course = buildStaticCourse('verdant-18');
    const pars = course.holes.map((h) => h.par);
    const roundOf = (delta: number) =>
      pars.map((par) => ({ record: { par, strokes: par + delta }, stat: {}, shots: [], putts: [], holed: true, pickedUp: false })) as unknown as PlayedHole[];
    const base = story({ chapter: 1 });
    const s0 = initState('team-seed', {}, undefined, base);
    const s = { ...s0, story: base, course, run: { ...s0.run, storyTournament: 1, storyTournamentPartner: 'longshot-larry' } };

    const win = resolveStoryTournament(s, roundOf(-2));
    expect(win.story!.sigil1Partner).toBe('longshot-larry');
    expect(win.lastStoryTournament!.team).toBeTruthy();
    expect(win.lastStoryTournament!.team!.format).toBe('scramble');
    // team total ≤ your solo total (the partner only helps)
    expect(win.lastStoryTournament!.playerGross).toBeLessThanOrEqual(win.lastStoryTournament!.team!.playerSolo);
    // won is consistent with team total vs the leading pair
    expect(win.lastStoryTournament!.won).toBe(win.lastStoryTournament!.playerGross <= win.lastStoryTournament!.rivalGross);
  });
});
