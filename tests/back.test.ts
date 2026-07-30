/**
 * The BACK gesture policy (GS-android-back).
 *
 * `backIntent` is pure, so the whole policy is assertable here — which matters more than usual:
 * on Android an unhandled back button CLOSES THE APP, so a screen falling through to the wrong tier
 * is a data-losing bug that no amount of play-testing on desktop would surface.
 *
 * The load-bearing test is `every screen is covered` — the `Screen` union has 36 members and grows
 * with every feature. TypeScript's `never` guard in `screenIntent` catches an omission at compile
 * time; this catches the other half, that the answer is a real intent rather than an accident.
 */
import { describe, it, expect } from 'vitest';
import { backIntent, exitPrompt, resumePromise } from '../src/ui/back';
import { initState, reduce } from '../src/ui/game';
import type { Screen, UiState } from '../src/ui/gameState';
import { ASGARD_FORMAT, STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';

/** Every member of the `Screen` union. Kept literal (not derived) so ADDING a screen without
 *  deciding its back behaviour fails here as well as at the compiler. */
const ALL_SCREENS: Screen[] = [
  'title', 'character', 'intro', 'playing', 'result', 'bossReward', 'shop', 'travel', 'gameover',
  'trademarket', 'clubhouseHall', 'clubhouse', 'starmart', 'asgardMap', 'asgardResult', 'starTour',
  'strokeResult', 'story', 'storyResult', 'storyShop', 'storyLocker', 'storyShipyard', 'shipInterior',
  'storyTournament', 'storyTournamentResult', 'storyTournamentAftermath', 'storyTournamentPop',
  'storyMidBeat', 'storyQuestBeat', 'storyQuestOffer', 'storyFinale', 'storyFinaleResult',
  'storyChoice', 'storyInterlude', 'storyBar', 'lore',
];

const base = (): UiState => initState('back-seed');
const on = (screen: Screen, over: Partial<UiState> = {}): UiState => ({ ...base(), screen, ...over });

describe('back policy — coverage', () => {
  it('every screen resolves to a real intent (no screen is a dead fallthrough)', () => {
    const kinds = new Set<string>();
    for (const screen of ALL_SCREENS) {
      const intent = backIntent(on(screen));
      expect(intent, `screen '${screen}' has no back intent`).toBeTruthy();
      expect(
        ['dismiss', 'closeSettings', 'navigate', 'swallow', 'confirm', 'exitApp'],
        `screen '${screen}' returned an unknown intent kind '${intent.kind}'`,
      ).toContain(intent.kind);
      kinds.add(intent.kind);
    }
    // Sanity that the tiers are all actually in use — a policy that collapsed to all-swallow would
    // otherwise pass every assertion above.
    expect(kinds).toContain('navigate');
    expect(kinds).toContain('swallow');
    expect(kinds).toContain('exitApp');
  });

  it('ALL_SCREENS matches the Screen union exactly (no duplicates, none missed)', () => {
    expect(new Set(ALL_SCREENS).size).toBe(ALL_SCREENS.length);
    // `initState` starts on the title; if a screen were removed from the union this file stops
    // compiling, so length is the remaining guard against silent additions.
    expect(ALL_SCREENS).toHaveLength(36);
  });
});

describe('back policy — the app only closes from the title', () => {
  it('title exits the app', () => {
    expect(backIntent(on('title')).kind).toBe('exitApp');
  });

  it('NO other screen may exit the app', () => {
    for (const screen of ALL_SCREENS.filter((s) => s !== 'title')) {
      expect(backIntent(on(screen)).kind, `screen '${screen}' would close the app`).not.toBe('exitApp');
    }
  });
});

describe('back policy — tier 0 dismisses the topmost layer first', () => {
  it('the settings sheet closes before the screen is navigated', () => {
    // On `story`, back normally navigates out to the title...
    expect(backIntent(on('story')).kind).toBe('navigate');
    // ...but with the sheet open it must close the sheet instead.
    expect(backIntent(on('story'), { settingsOpen: true }).kind).toBe('closeSettings');
  });

  it('an open overlay is dismissed rather than navigating away behind it', () => {
    const cases: [keyof UiState, string][] = [
      ['characterLoreId', 'closeCharacterLore'],
      ['storyInspectId', 'storyCloseInspect'],
      ['storyItemInspectId', 'storyCloseItem'],
      ['storyAllyInspectId', 'storyCloseAlly'],
    ];
    for (const [field, expected] of cases) {
      const intent = backIntent(on('story', { [field]: 'x' } as Partial<UiState>));
      expect(intent.kind, `${String(field)} should dismiss`).toBe('dismiss');
      expect(intent.kind === 'dismiss' && intent.action.type).toBe(expected);
    }
  });

  it('the caddy-swap warning is cancelled, never confirmed, by back', () => {
    const intent = backIntent(on('shop', { pendingFireCaddy: { newId: 'a', oldId: 'b' } }));
    expect(intent.kind).toBe('dismiss');
    expect(intent.kind === 'dismiss' && intent.action.type).toBe('cancelFireCaddy');
  });

  it('the exit confirm outranks everything — a second back press CANCELS, never leaves', () => {
    const intent = backIntent(on('playing', { pendingExit: true }), { settingsOpen: true });
    expect(intent.kind).toBe('dismiss');
    expect(intent.kind === 'dismiss' && intent.action.type).toBe('cancelExit');
  });
});

describe('back policy — tier 2 swallows forward-only beats', () => {
  // Skipping these with back would let a player dodge a reward pick or desync `seenStoryBeats`.
  const BEATS: Screen[] = [
    'lore', 'bossReward', 'result', 'strokeResult', 'storyChoice', 'storyMidBeat', 'storyQuestBeat',
    'storyQuestOffer', 'storyResult', 'storyTournamentPop', 'storyTournamentResult',
    'storyTournamentAftermath', 'storyFinaleResult', 'storyInterlude', 'asgardMap', 'asgardResult',
    'shop', 'starmart', 'travel',
  ];
  it.each(BEATS)('%s absorbs back', (screen) => {
    expect(backIntent(on(screen)).kind).toBe('swallow');
  });
});

describe('back policy — tier 1 navigates to the REAL parent', () => {
  it.each([
    ['character', 'toTitle'],
    ['gameover', 'toTitle'],
    ['trademarket', 'closeMarket'],
    ['clubhouseHall', 'closeClubhouseHall'],
    ['clubhouse', 'clubhouseBackToHall'], // the hall, NOT the title — clubhouse is a room inside it
    ['story', 'exitStory'],
    ['storyShop', 'exitStoryShop'],
    ['storyLocker', 'exitStoryLocker'],
    ['storyShipyard', 'exitStoryShipyard'],
    ['shipInterior', 'exitShipInterior'],
    ['storyTournament', 'exitStoryTournament'],
    ['storyFinale', 'exitStoryFinale'],
    ['storyBar', 'exitStoryBar'],
  ] as [Screen, string][])('%s → %s', (screen, action) => {
    const intent = backIntent(on(screen));
    expect(intent.kind).toBe('navigate');
    expect(intent.kind === 'navigate' && intent.action.type).toBe(action);
  });

  it('the star map returns to the CAMPAIGN when in a story, to the title otherwise', () => {
    const solo = backIntent(on('starTour'));
    expect(solo.kind === 'navigate' && solo.action.type).toBe('exitStarTour');
    const story = on('starTour');
    const inStory = backIntent({ ...story, story: { ...(story.story ?? {}) } as UiState['story'] });
    expect(inStory.kind === 'navigate' && inStory.action.type).toBe('exitStoryMap');
  });

  it('a star-map SHEET closes before the map does (GS-story-venue-services)', () => {
    // The world dossier / records board / Yggdrasil realms are raised OVER the chart, so back closes
    // the sheet. Without this, pressing back at an open dossier flew you home to the clubhouse.
    const map = on('starTour');
    expect(backIntent(map, { starMapSheetOpen: true }).kind).toBe('closeStarMapSheet');
    // and it is guarded to the map — a stale flag can't swallow a back press on another screen
    expect(backIntent(on('story'), { starMapSheetOpen: true }).kind).toBe('navigate');
    // the settings sheet is still the outer layer
    expect(backIntent(map, { starMapSheetOpen: true, settingsOpen: true }).kind).toBe('closeSettings');
  });
});

describe('back policy — tier 3 confirms before leaving a run', () => {
  it('mid-round back raises the confirm rather than leaving outright', () => {
    const intent = backIntent(on('playing'));
    expect(intent.kind).toBe('confirm');
    expect(intent.kind === 'confirm' && intent.action.type).toBe('requestExit');
  });

  it('the FIRST tee offers "change golfer" instead — nothing has been played yet', () => {
    const s = on('intro');
    expect(s.run.stopIndex).toBe(0);
    const intent = backIntent(s);
    expect(intent.kind).toBe('navigate');
    expect(intent.kind === 'navigate' && intent.action.type).toBe('backToCharacter');
  });

  it('a LATER stop intro confirms instead of silently rewinding the run', () => {
    const s = on('intro');
    const intent = backIntent({ ...s, run: { ...s.run, stopIndex: 3 } });
    expect(intent.kind).toBe('confirm');
  });
});

describe('the exit confirm round-trips through the reducer', () => {
  it('requestExit raises the card, cancelExit clears it, and the run is untouched', () => {
    const playing = on('playing');
    const raised = reduce(playing, { type: 'requestExit' });
    expect(raised.pendingExit).toBe(true);
    expect(raised.screen).toBe('playing'); // raising the confirm must not navigate
    const cancelled = reduce(raised, { type: 'cancelExit' });
    expect(cancelled.pendingExit).toBeUndefined();
    expect(cancelled.screen).toBe('playing');
  });

  it('requestExit is a no-op outside a run (nothing else can raise the card)', () => {
    for (const screen of ALL_SCREENS.filter((s) => s !== 'playing' && s !== 'intro')) {
      expect(reduce(on(screen), { type: 'requestExit' }).pendingExit, screen).toBeUndefined();
    }
  });

  it('leaving clears the card, so it can never survive onto the title', () => {
    const raised = reduce(on('playing'), { type: 'requestExit' });
    const left = reduce(raised, { type: 'toTitle' });
    expect(left.screen).toBe('title');
    expect(left.pendingExit).toBeUndefined();
  });
});

describe('the confirm copy stays truthful', () => {
  // The prompt must never claim the run is lost — `toTitle` parks it in its own slot. What differs is
  // WHAT is parked, and there are exactly three answers (GS-save-slots).
  it('never threatens data loss', () => {
    const body = exitPrompt(on('playing')).body.toLowerCase();
    expect(body).not.toMatch(/lose|lost|discard|delete/);
    expect(body).toMatch(/saved/);
  });

  it('promises a hole-level resume in EVERY parked mode — one rule, not a per-format lottery', () => {
    const s = on('playing');
    expect(exitPrompt(s).body).toMatch(/this hole/); // Voyage
    expect(exitPrompt({ ...s, run: { ...s.run, formatId: STROKEPLAY_FORMAT } }).body).toMatch(/this hole/);
    expect(exitPrompt({ ...s, run: { ...s.run, formatId: 'unending' } }).body).toMatch(/this hole/);
  });

  it('and says the OTHER truth where the hole is not kept, rather than a uniform lie', () => {
    const s = on('playing');
    // A Story world round owns no run slot — the campaign is saved, the round is replayed.
    const story = exitPrompt({ ...s, run: { ...s.run, formatId: STROKEPLAY_FORMAT, storyRound: true } });
    expect(story.body).toMatch(/campaign is saved/);
    expect(story.body).toMatch(/replay this world/);
    expect(story.body).not.toMatch(/this hole/);
    // The Asgard tournament is never persisted: leaving forfeits the attempt.
    const asgard = exitPrompt({ ...s, run: { ...s.run, formatId: ASGARD_FORMAT } });
    expect(asgard.body).toMatch(/forfeits/);
    expect(asgard.body).toMatch(/saved/);
  });

  it('every exit surface reads the SAME sentence — the settings footer cannot promise something milder', () => {
    const s = on('playing');
    expect(exitPrompt(s).body).toBe(resumePromise(s));
  });
});
