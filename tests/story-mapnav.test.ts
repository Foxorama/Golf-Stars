import { describe, it, expect } from 'vitest';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { storyWorldNav, storyWorldMarker } from '../src/sim/rpg/storyMapNav';
import { startableQuestForWorld } from '../src/sim/rpg/storyQuests';
import { tournamentForChapter } from '../src/sim/rpg/storyTournaments';
import { qualifyTop } from '../src/sim/rpg/storyQualifiers';

/** A chapter-1 campaign state (Earth cleared elsewhere so quest beats can open). */
function ch1(over: Partial<StoryState> = {}): StoryState {
  return { ...defaultStoryState('feather-fade'), chapter: 1, clearedWorldIds: ['standrews-18'], ...over };
}

describe('Story star-map navigation status (GS-story-map-nav)', () => {
  it('marks the current chapter Sigil VENUE — locked until qualified, then ready, then won', () => {
    const venueId = tournamentForChapter(1)!.venueId; // verdant-18
    // Locked: no qualifying finishes yet.
    let s = ch1();
    let nav = storyWorldNav(s, venueId);
    expect(nav.venue).toBeDefined();
    expect(nav.venue!.current).toBe(true);
    expect(nav.venue!.ready).toBe(false);
    expect(nav.venue!.won).toBe(false);
    expect(nav.qualifier).toBeUndefined(); // the venue is NOT a qualifier
    expect(storyWorldMarker(nav)).toBe('venue-locked');

    // Ready: qualified in the chapter's two qualifying events.
    const quals = ['verdant2-18', 'desert-18'];
    const results: StoryState['qualifierResults'] = {};
    for (const id of quals) results[id] = { place: 1, field: 16 };
    s = ch1({ qualifierResults: results });
    nav = storyWorldNav(s, venueId);
    expect(nav.venue!.ready).toBe(true);
    expect(storyWorldMarker(nav)).toBe('venue-ready');

    // Won: the Sigil is banked.
    s = ch1({ trophyIds: ['sigil-emerald'] });
    nav = storyWorldNav(s, venueId);
    expect(nav.venue!.won).toBe(true);
    expect(nav.venue!.current).toBe(false);
    expect(storyWorldMarker(nav)).toBe('venue-won');
  });

  it('marks the chapter QUALIFYING events with the top-N bar and a qualified verdict', () => {
    const evId = 'verdant2-18';
    let nav = storyWorldNav(ch1(), evId);
    expect(nav.qualifier).toBeDefined();
    expect(nav.qualifier!.top).toBe(qualifyTop(1));
    expect(nav.qualifier!.qualified).toBe(false);
    expect(nav.qualifier!.place).toBeUndefined();
    expect(storyWorldMarker(nav)).toBe('qualifier');

    // A qualifying finish flips it to qualified with the place recorded.
    nav = storyWorldNav(ch1({ qualifierResults: { [evId]: { place: 3, field: 16 } } }), evId);
    expect(nav.qualifier!.qualified).toBe(true);
    expect(nav.qualifier!.place).toBe(3);
    expect(storyWorldMarker(nav)).toBe('qualified');
  });

  it('marks an OFFERABLE ally quest world, and startableQuestForWorld resolves it', () => {
    // Sandy's quest plays on the Vela dunes (desert-18); offerable at Ch.2+ once carried a round & flown on.
    const s = ch1({
      chapter: 2,
      hiredCaddyIds: ['sandy-sandsaver'],
      activeCaddyId: 'sandy-sandsaver',
      caddiedRoundIds: ['sandy-sandsaver'],
      clearedWorldIds: ['standrews-18', 'verdant-18'],
    });
    const nav = storyWorldNav(s, 'desert-18');
    expect(nav.quest).toBeDefined();
    expect(nav.quest!.state).toBe('offerable');
    expect(nav.quest!.rewardName.length).toBeGreaterThan(0);
    expect(storyWorldMarker(nav)).toBe('quest');
    const q = startableQuestForWorld(s, 'desert-18');
    expect(q?.id).toBe('quest-sandy');
  });

  it('marks an ACTIVE quest world (state → active), and holds a "pending" beat before it opens', () => {
    const base = {
      chapter: 2,
      hiredCaddyIds: ['sandy-sandsaver'],
      activeCaddyId: 'sandy-sandsaver',
      clearedWorldIds: ['standrews-18', 'verdant-18'],
    };
    // Pending: recruited + chapter-ready but not yet carried a round with them.
    const pend = storyWorldNav(ch1({ ...base, caddiedRoundIds: [] }), 'desert-18');
    expect(pend.quest!.state).toBe('pending');
    expect(storyWorldMarker(pend)).toBe('quest-pending');

    // Active: the quest has been accepted.
    const act = storyWorldNav(ch1({ ...base, caddiedRoundIds: ['sandy-sandsaver'], activeQuestId: 'quest-sandy' }), 'desert-18');
    expect(act.quest!.state).toBe('active');
    expect(storyWorldMarker(act)).toBe('quest-active');
    expect(startableQuestForWorld(ch1({ ...base, activeQuestId: 'quest-sandy' }), 'desert-18')?.id).toBe('quest-sandy');
  });

  it('has no marker for a world with nothing to do this chapter (a future-chapter world)', () => {
    const nav = storyWorldNav(ch1(), 'inferno-18'); // a Chapter-2 world, seen from Chapter 1
    expect(nav.quest).toBeUndefined();
    expect(nav.qualifier).toBeUndefined();
    expect(nav.venue).toBeUndefined();
    expect(storyWorldMarker(nav)).toBeUndefined();
  });

  it('storyWorldMarker prioritises the Sigil venue over a quest over a qualifier', () => {
    const t = tournamentForChapter(1)!;
    expect(storyWorldMarker({ courseId: 'x', venue: { tournament: t, current: true, ready: true, won: false, qualifiersMet: 2, needed: 2 }, quest: { questId: 'q', title: '', hook: '', giver: '', rewardName: '', state: 'offerable' }, qualifier: { chapter: 1, top: 10, field: 16, qualified: false } })).toBe('venue-ready');
    expect(storyWorldMarker({ courseId: 'x', quest: { questId: 'q', title: '', hook: '', giver: '', rewardName: '', state: 'offerable' }, qualifier: { chapter: 1, top: 10, field: 16, qualified: false } })).toBe('quest');
    expect(storyWorldMarker({ courseId: 'x', qualifier: { chapter: 1, top: 10, field: 16, qualified: true } })).toBe('qualified');
  });
});
