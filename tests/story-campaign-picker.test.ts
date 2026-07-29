/**
 * The Story-Tour CAMPAIGN PICKER (GS-story-campaign-picker) — pick the golfer, pick the campaign.
 *
 * Campaigns are per golfer (`storyRoster.ts`), so "which campaign?" and "which golfer?" are the same
 * question and Story Tour answers it on one screen. What this file guards is the DESTRUCTIVE half:
 * creating a campaign over a golfer who already has one throws away a save — and, if that campaign was
 * finished, their Star Tour character with it. So the central assertions are that the reducer REFUSES
 * an unconfirmed overwrite whatever surface asks for it, and that the confirmation's copy describes
 * what the write really does.
 *
 * Pure reducer tests: no DOM, no localStorage.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { initState, reduce, storyCampaignTags, currentRoster, type UiState } from '../src/ui/game';
import { backIntent } from '../src/ui/back';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { campaignFor, emptyCampaignStore, isChampion, upsertCampaign } from '../src/sim/rpg/storyRoster';
import { storyGolferPickerHTML } from '../src/app/storyScreens';
import { setState } from '../src/app/ctx';

const FEATHER = 'feather-fade';
const LARRY = 'longshot-larry';

/** A boot state holding the given campaigns, with the first as the active one. */
function booted(...stories: StoryState[]): UiState {
  const roster = stories.reduce((s, st) => upsertCampaign(s, st), emptyCampaignStore());
  return initState('seed', {}, undefined, stories[0], roster);
}

/** Open the picker from the title. */
const picker = (s: UiState) => reduce(s, { type: 'openStory' });

describe('the picker is where a campaign is chosen', () => {
  it('openStory always opens the golfer picker, campaign or not', () => {
    expect(picker(initState('seed', {})).screen).toBe('character');
    expect(picker(booted(defaultStoryState(FEATHER))).screen).toBe('character');
    expect(picker(booted(defaultStoryState(FEATHER))).pendingStoryNew).toBe(true);
  });

  it('tapping a golfer WITH a campaign continues it; one WITHOUT starts theirs', () => {
    const s = picker(booted({ ...defaultStoryState(FEATHER), chapter: 3, credits: 900 }));

    const cont = reduce(s, { type: 'selectCharacter', characterId: FEATHER });
    expect(cont.screen).toBe('story');
    expect(cont.story?.characterId).toBe(FEATHER);
    expect(cont.story?.chapter).toBe(3);
    expect(cont.story?.credits).toBe(900); // resumed, not restarted

    const fresh = reduce(s, { type: 'selectCharacter', characterId: LARRY });
    expect(fresh.screen).toBe('story');
    expect(fresh.story?.characterId).toBe(LARRY);
    expect(fresh.story?.chapter).toBe(0);
    // …and Feather's campaign is still there, untouched. This is the whole feature.
    expect(campaignFor(currentRoster(fresh), FEATHER)?.chapter).toBe(3);
  });

  it('a new campaign for a second golfer never disturbs the first', () => {
    const s = picker(booted({ ...defaultStoryState(FEATHER), chapter: 5, completed: true, credits: 4200 }));
    const larry = reduce(s, { type: 'selectCharacter', characterId: LARRY });
    const roster = currentRoster(larry);
    expect(isChampion(roster, FEATHER)).toBe(true); // the Star Tour champion survives
    expect(campaignFor(roster, FEATHER)?.credits).toBe(4200);
    expect(campaignFor(roster, LARRY)?.chapter).toBe(0);
  });

  it('a fresh campaign is stamped with a draw-sheet seed (GS-story-qualifier-formats)', () => {
    const s = reduce(picker(initState('seed', {})), { type: 'selectCharacter', characterId: FEATHER });
    expect(s.story?.campaignSeed).toBeTruthy();
  });

  it('starting a campaign does NOT build a run (a Story round tees off later)', () => {
    const s = reduce(picker(initState('seed', {})), { type: 'selectCharacter', characterId: FEATHER });
    expect(s.run.loadout.characterId).toBeFalsy();
  });
});

describe('the overwrite is refused until it is confirmed', () => {
  const started = () => picker(booted({ ...defaultStoryState(FEATHER), chapter: 3 }));

  it('selectCharacter can never overwrite — it resumes instead', () => {
    // The guard lives in the REDUCER precisely so no surface can route around the confirmation: the
    // inspect card, a deep link and any future picker all dispatch through here.
    const s = reduce(started(), { type: 'selectCharacter', characterId: FEATHER });
    expect(s.story?.chapter).toBe(3);
  });

  it('storyRestartCampaign is REFUSED outright when unconfirmed', () => {
    // The hostile case: something dispatches the create directly, skipping the sheet.
    const s = started();
    const after = reduce(s, { type: 'storyRestartCampaign', characterId: FEATHER });
    expect(after).toBe(s); // no-op, not a silent wipe
    expect(campaignFor(currentRoster(after), FEATHER)?.chapter).toBe(3);
  });

  it('a confirmation naming a DIFFERENT golfer does not authorise this one', () => {
    const s = { ...booted({ ...defaultStoryState(FEATHER), chapter: 3 }, defaultStoryState(LARRY)) };
    const open = { ...picker(s), storyOverwriteId: LARRY };
    const after = reduce(open, { type: 'storyRestartCampaign', characterId: FEATHER });
    expect(campaignFor(currentRoster(after), FEATHER)?.chapter).toBe(3);
  });

  it('request → confirm → the slot is replaced, and ONLY that slot', () => {
    const s = picker(booted({ ...defaultStoryState(FEATHER), chapter: 5, completed: true }, { ...defaultStoryState(LARRY), chapter: 2 }));
    const asked = reduce(s, { type: 'storyRequestRestart', characterId: FEATHER });
    expect(asked.storyOverwriteId).toBe(FEATHER);
    expect(asked.screen).toBe('character'); // nothing written yet — the sheet is just raised

    const done = reduce(asked, { type: 'storyRestartCampaign', characterId: FEATHER });
    expect(done.screen).toBe('story');
    expect(done.story?.chapter).toBe(0);
    expect(done.storyOverwriteId).toBeUndefined();
    const roster = currentRoster(done);
    expect(isChampion(roster, FEATHER)).toBe(false); // the champion did go, as warned
    expect(campaignFor(roster, LARRY)?.chapter).toBe(2); // …and Larry is untouched
  });

  it('cancelling leaves the campaign exactly as it was', () => {
    const asked = reduce(started(), { type: 'storyRequestRestart', characterId: FEATHER });
    const cancelled = reduce(asked, { type: 'storyCancelRestart' });
    expect(cancelled.storyOverwriteId).toBeUndefined();
    expect(campaignFor(currentRoster(cancelled), FEATHER)?.chapter).toBe(3);
  });

  it('cannot ask to restart a golfer who has no campaign (never a second way to create one)', () => {
    const s = started();
    expect(reduce(s, { type: 'storyRequestRestart', characterId: LARRY }).storyOverwriteId).toBeUndefined();
  });

  it('BACK cancels the confirm — a back press must never destroy a campaign', () => {
    const asked = reduce(started(), { type: 'storyRequestRestart', characterId: FEATHER });
    expect(backIntent(asked)).toEqual({ kind: 'dismiss', action: { type: 'storyCancelRestart' } });
  });
});

describe('campaign tags — the player can see who has a run going', () => {
  it('tags in-progress, prologue and complete, and says nothing about golfers with no campaign', () => {
    const s = booted(
      { ...defaultStoryState(FEATHER), chapter: 3 },
      { ...defaultStoryState(LARRY), chapter: 0 },
      { ...defaultStoryState('backspin-bo'), chapter: 5, completed: true },
    );
    const tags = storyCampaignTags(s);
    expect(tags[FEATHER]).toMatchObject({ kind: 'in-progress', short: 'Chp 3', label: 'In progress — Chapter 3' });
    expect(tags[LARRY]).toMatchObject({ kind: 'in-progress', short: 'Prologue' }); // never "Chapter 0"
    expect(tags['backspin-bo']).toMatchObject({ kind: 'complete', short: '★ Complete' });
    expect(tags['huang-woo-hook']).toBeUndefined();
  });

  it('the tag tracks the LIVE campaign, not the roster snapshot taken at boot', () => {
    // `currentRoster` lays `state.story` over its own slot, which is why 190-odd `state.story` writes
    // don't each have to remember to mirror themselves into the roster.
    const s = booted({ ...defaultStoryState(FEATHER), chapter: 1 });
    const advanced = { ...s, story: { ...s.story!, chapter: 4 } };
    expect(storyCampaignTags(advanced)[FEATHER]?.short).toBe('Chp 4');
  });
});

describe('the picker screen renders the campaign state', () => {
  /** Render the picker with a given state pushed into the app-layer ctx. */
  function render(s: UiState): string {
    setState(s);
    return storyGolferPickerHTML();
  }

  it('badges the golfers who have campaigns, and only those', () => {
    const html = render(picker(booted({ ...defaultStoryState(FEATHER), chapter: 3 })));
    expect(html).toContain('Chp 3');
    expect(html).toContain('In progress — Chapter 3'); // spoken in the figure's accessible name
    expect(html).not.toContain('★ Complete');
  });

  it('a completed campaign reads as a champion', () => {
    const html = render(picker(booted({ ...defaultStoryState(FEATHER), chapter: 5, completed: true })));
    expect(html).toContain('★ Complete');
    expect(html).toMatch(/Star Tour champion/);
  });

  it('the continue label never reads "Continue — Complete"', () => {
    // A finished campaign is still playable, but that phrasing reads as a contradiction; it names what
    // they ARE instead. Caught by eyes-on (`scripts/campaign-picker-preview.mjs`), pinned here.
    const s = { ...picker(booted({ ...defaultStoryState(FEATHER), chapter: 5, completed: true })), storyInspectId: FEATHER };
    const html = render(s);
    expect(html).not.toMatch(/Continue — Complete/);
    expect(html).toMatch(/Continue as champion/);
    // …and a live campaign still names where it is.
    const mid = { ...picker(booted({ ...defaultStoryState(FEATHER), chapter: 3 })), storyInspectId: FEATHER };
    expect(render(mid)).toMatch(/Continue — Chapter 3/);
  });

  it('shows no badges at all before any campaign exists', () => {
    const html = render(picker(initState('seed', {})));
    expect(html).not.toContain('Chp ');
    expect(html).not.toContain('★ Complete');
  });

  it('the confirm sheet SAYS the Star Tour character goes with a completed campaign', () => {
    // The severe consequence a player would not otherwise connect. Derived from the same pure
    // `campaignOverwriteWarning` the reducer's guard consults, so the sheet cannot promise something
    // milder than the write.
    const s = reduce(picker(booted({ ...defaultStoryState(FEATHER), chapter: 5, completed: true })), {
      type: 'storyRequestRestart',
      characterId: FEATHER,
    });
    const html = render(s);
    expect(html).toMatch(/Star Tour character/);
    expect(html).toMatch(/No other golfer’s campaign is touched/);
    // The safe choice is the primary button.
    expect(html).toMatch(/gs-btn--primary[^>]*storyCancelRestart|storyCancelRestart[\s\S]{0,200}Keep/);
  });

  it('a mid-campaign confirm names the chapter and does NOT claim a champion is at stake', () => {
    const s = reduce(picker(booted({ ...defaultStoryState(FEATHER), chapter: 3 })), {
      type: 'storyRequestRestart',
      characterId: FEATHER,
    });
    const html = render(s);
    expect(html).toMatch(/chapter 3/);
    expect(html).not.toMatch(/Star Tour character/);
  });
});

describe('leaving the picker', () => {
  /** The action carried by the picker's own "Back to title" button, as the DOM would dispatch it. */
  function backButtonAction(s: UiState): Parameters<typeof reduce>[1] {
    setState(s);
    const html = storyGolferPickerHTML();
    // The ghost button in the footer div, under the clubhouse scene.
    const m = /gs-btn--ghost" data-action='([^']+)'>‹ Back to title</.exec(html);
    expect(m, 'the picker renders a "Back to title" button').toBeTruthy();
    return JSON.parse(m?.[1] ?? 'null');
  }

  it('the back button agrees with `backIntent`, and actually leaves', () => {
    // The picker is screen `character`, so its back action is the CHARACTER screen's — not the story
    // HUB's `exitStory`, which is guarded to `screen === 'story'` and was therefore a NO-OP here: the
    // reducer handed back the same state and the button did nothing at all.
    const s = picker(booted({ ...defaultStoryState(FEATHER), chapter: 3 }));
    const action = backButtonAction(s);
    // One decision, two devices: the on-screen button and the hardware BACK must ask for the same thing.
    expect(backIntent(s)).toEqual({ kind: 'navigate', action });

    const left = reduce(s, action);
    expect(left).not.toBe(s); // a back button that returns the same state is a dead button
    expect(left.screen).toBe('title');
  });

  it('leaves no picker state behind — the next Voyage opens the ORDINARY roster', () => {
    // `pendingStoryNew` is what makes screen `character` render the clubhouse picker. Carried onto the
    // title it would dress Voyage's character select as the Story clubhouse, and picking a golfer there
    // would create a CAMPAIGN instead of starting the run.
    const s = reduce(picker(booted({ ...defaultStoryState(FEATHER), chapter: 3 })), { type: 'storyRequestRestart', characterId: FEATHER });
    const title = reduce({ ...s, storyInspectId: FEATHER }, { type: 'toTitle' });
    expect(title.screen).toBe('title');
    expect(title.pendingStoryNew).toBeFalsy();
    expect(title.storyInspectId).toBeUndefined();
    expect(title.storyOverwriteId).toBeUndefined();

    const voyage = reduce(title, { type: 'start', format: 'voyage' });
    expect(voyage.pendingStoryNew).toBeFalsy();
    const picked = reduce(voyage, { type: 'selectCharacter', characterId: LARRY });
    expect(picked.screen).not.toBe('story'); // a run, not a campaign
    expect(picked.run.loadout.characterId).toBe(LARRY);
    expect(campaignFor(currentRoster(picked), LARRY)).toBeFalsy();
  });
});

describe('the badges are Story Tour only', () => {
  it('a non-story character pick is untouched by the campaign machinery', () => {
    // The `character` screen is SHARED with Voyage / Unending / Star Tour. `pendingStoryNew` is what
    // gates the story path, and without it `selectCharacter` must still build a run as it always did.
    const s = booted({ ...defaultStoryState(FEATHER), chapter: 3 });
    const voyage = reduce({ ...s, screen: 'character' as const, pendingStoryNew: false }, {
      type: 'selectCharacter',
      characterId: FEATHER,
    });
    expect(voyage.screen).not.toBe('story');
    expect(voyage.run.loadout.characterId).toBe(FEATHER); // a real run was built
    expect(voyage.story?.chapter).toBe(3); // the campaign was not resumed or restarted
  });
});

describe('state hygiene', () => {
  it('initState defaults the roster from the active campaign when none is passed', () => {
    // Every existing `initState(seed, meta, run, story)` call site (the whole suite) must keep working,
    // and the active campaign must still be findable in the roster.
    const s = initState('seed', {}, undefined, { ...defaultStoryState(FEATHER), chapter: 2 });
    expect(campaignFor(s.campaigns, FEATHER)?.chapter).toBe(2);
    expect(initState('seed', {}).campaigns.campaigns).toEqual({});
  });

  it('opening the picker clears a stale inspect/confirm from a previous visit', () => {
    const s = { ...booted(defaultStoryState(FEATHER)), storyInspectId: LARRY, storyOverwriteId: FEATHER };
    const open = picker(s);
    expect(open.storyInspectId).toBeUndefined();
    expect(open.storyOverwriteId).toBeUndefined();
  });
});

// Keep the app-layer ctx from leaking a story state into other suites sharing the module.
afterAll(() => setState(initState('seed', {})));
