/**
 * STAR TOUR CHAMPIONS (GS-story-startour-champions) — free-roam flown by a finished Story Tour
 * protagonist, one per golfer you have completed a campaign with.
 *
 * The load-bearing assertion in this file is the one that ISN'T about champions at all:
 *
 *   NEVER LOCK ANYONE OUT OF A MODE THEY ALREADY EARNED.
 *
 * `starTourUnlocked` is a PERMANENT main-save flag and remains the only gate on Star Tour. A player who
 * finished the campaign under the old single-slot save and then started over holds that flag with an
 * EMPTY champion roster — and they must still get the mode, on the classic default-loadout flow.
 * Champions enrich Star Tour; they never gate it. Everything else here (which champion flies, what a
 * record says, whether the World Tree shows) is a feature. That one is a promise.
 *
 * Pure reducer + pure-module tests: no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest';
import { initState, reduce, currentRoster, type UiState } from '../src/ui/game';
import { backIntent } from '../src/ui/back';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import {
  championCampaigns,
  championRound,
  emptyCampaignStore,
  upsertCampaign,
  type CampaignStore,
} from '../src/sim/rpg/storyRoster';
import { addStrokeRecord, bestStrokeRounds, isBetterStroke, type StrokePlayRecord } from '../src/sim/rpg/strokePlay';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import { starTourChampionScreen, starTourScreen, starTourView, yggdrasilArmed } from '../src/app/starTourScreens';
import { setState } from '../src/app/ctx';

const FEATHER = 'feather-fade';
const LARRY = 'longshot-larry';
const WOO = 'wildcard-woo';

/** A finished campaign for a golfer — a champion. */
function champion(characterId: string, extra: Partial<StoryState> = {}): StoryState {
  return { ...defaultStoryState(characterId), completed: true, ...extra };
}

/** A boot state holding the given campaigns (the first is the live/active one), with Star Tour earned. */
function booted(stories: StoryState[], opts: { unlocked?: boolean; live?: StoryState } = {}): UiState {
  const roster: CampaignStore = stories.reduce((s, st) => upsertCampaign(s, st), emptyCampaignStore());
  const s = initState('seed', { starTourUnlocked: opts.unlocked ?? true }, undefined, opts.live ?? stories[0], roster);
  return s;
}

const openStarTour = (s: UiState) => reduce(s, { type: 'openStarTour' });

// ── the promise ────────────────────────────────────────────────────────────────────────────────────
describe('the unlock is permanent — champions never gate the mode', () => {
  it('a player who earned the unlock but has NO champion still gets Star Tour, classic flow', () => {
    // Exactly the returning player the roster migration produces: they finished the campaign under the
    // old single-slot save, started over, and the fresh campaign wiped its own `completed` flag.
    const s = booted([defaultStoryState(FEATHER)], { unlocked: true });
    expect(championCampaigns(currentRoster(s))).toHaveLength(0);

    const out = openStarTour(s);
    expect(out.screen).toBe('character'); // the classic character-first flow, not a locked door
    expect(out.screen).not.toBe('starTourChampion');
    expect(out.starTourUnlocked).toBe(true); // and the flag is untouched by any of this
  });

  it('an empty roster entirely — no campaign ever started — still opens character select', () => {
    const s = initState('seed', { starTourUnlocked: true });
    expect(openStarTour(s).screen).toBe('character');
  });

  it('the no-champion path is byte-for-byte the pre-champion flow (nothing about `story` is touched)', () => {
    const live = defaultStoryState(FEATHER);
    const out = openStarTour(booted([live], { unlocked: true }));
    expect(out.story).toBe(live); // the same object — the champion branch never ran
    expect(out.run.loadout.characterId).toBeUndefined(); // a plain placeholder run, golfer picked next
  });
});

// ── champion select ────────────────────────────────────────────────────────────────────────────────
describe('champion select reads the ROSTER, not the loaded campaign', () => {
  it('ONE champion flies straight to the map as them, carrying the campaign loadout', () => {
    const c = champion(FEATHER, { equippedBagIds: ['D', '7i', 'putter'], credits: 4200 });
    const out = openStarTour(booted([c]));
    expect(out.screen).toBe('starTour');
    expect(out.story?.characterId).toBe(FEATHER);
    expect(out.run.loadout.characterId).toBe(FEATHER);
    expect(out.run.loadout.bag).toHaveLength(3); // the campaign's equipped bag, not a starting set
  });

  it("a champion is found even when a DIFFERENT campaign is the one loaded", () => {
    // The bug the roster read exists to prevent: off `state.story` alone this player has no champion.
    const s = booted([champion(LARRY)], { live: defaultStoryState(FEATHER) });
    const out = openStarTour(s);
    expect(out.screen).toBe('starTour');
    expect(out.story?.characterId).toBe(LARRY);
  });

  it('TWO champions raise the picker, and nothing is committed by opening it', () => {
    const live = defaultStoryState(WOO);
    const s = booted([champion(FEATHER), champion(LARRY)], { live });
    const out = openStarTour(s);
    expect(out.screen).toBe('starTourChampion');
    expect(out.story).toBe(live); // untouched — the champion's run is built on SELECT
    expect(out.run).toBe(s.run);
  });

  it('selecting a champion flies as them and makes them the live campaign', () => {
    const s = openStarTour(booted([champion(FEATHER), champion(LARRY, { credits: 999 })]));
    const out = reduce(s, { type: 'selectStarTourChampion', characterId: LARRY });
    expect(out.screen).toBe('starTour');
    expect(out.story?.characterId).toBe(LARRY);
    expect(out.story?.credits).toBe(999);
    expect(out.run.loadout.characterId).toBe(LARRY);
  });

  it('an UNFINISHED campaign can never be promoted into the free-roam reward', () => {
    // A stale id, a deep link, a future surface: the guard is in the reducer, not the screen.
    const s = openStarTour(booted([champion(FEATHER), champion(LARRY)], { live: defaultStoryState(WOO) }));
    const roster = upsertCampaign(s.campaigns, defaultStoryState(WOO));
    const out = reduce({ ...s, campaigns: roster }, { type: 'selectStarTourChampion', characterId: WOO });
    expect(out.screen).toBe('starTourChampion'); // refused — still on the picker
    expect(out.story?.characterId).toBe(WOO); // …and nothing was flown as
    expect(out.run.loadout.characterId).toBeUndefined();
  });

  it('a golfer with no campaign at all is refused too', () => {
    const s = openStarTour(booted([champion(FEATHER), champion(LARRY)]));
    expect(reduce(s, { type: 'selectStarTourChampion', characterId: 'nobody' }).screen).toBe('starTourChampion');
  });

  it('back off the picker leaves the mode — it is a pick, not a forward-only beat', () => {
    const s = openStarTour(booted([champion(FEATHER), champion(LARRY)]));
    expect(backIntent(s)).toEqual({ kind: 'navigate', action: { type: 'toTitle' } });
  });

  it('returning from a round keeps the champion who just played — no second pick', () => {
    const s = openStarTour(booted([champion(FEATHER), champion(LARRY)]));
    const flying = reduce(s, { type: 'selectStarTourChampion', characterId: LARRY });
    // Land on the recap the way a finished round does, then take "Star map" back.
    const back = openStarTour({ ...flying, screen: 'strokeResult' });
    expect(back.screen).toBe('starTour');
    expect(back.story?.characterId).toBe(LARRY);
  });
});

// ── the champion mark on the boards ────────────────────────────────────────────────────────────────
describe('records DESCRIBE a champion round, they do not rank it apart', () => {
  const rec = (toPar: number, champion?: boolean): StrokePlayRecord => ({
    courseId: `c${toPar}`,
    characterId: FEATHER,
    tier: 'common',
    strokes: 72 + toPar,
    par: 72,
    toPar,
    seed: 1,
    ...(champion ? { champion: true } : {}),
  });

  it('the flag changes NOTHING about ranking or board keying', () => {
    expect(isBetterStroke(rec(-2, true), rec(-4))).toBe(false);
    expect(isBetterStroke(rec(-4), rec(-2, true))).toBe(true);
    const board = bestStrokeRounds(addStrokeRecord(addStrokeRecord({}, rec(-2, true)), rec(-4)), 5);
    expect(board.map((r) => r.toPar)).toEqual([-4, -2]); // one board, ordered on to-par alone
  });

  it('championRound needs BOTH a finished campaign AND that golfer holding the club', () => {
    expect(championRound(champion(FEATHER), FEATHER)).toBe(true);
    expect(championRound(defaultStoryState(FEATHER), FEATHER)).toBe(false); // unfinished
    expect(championRound(champion(FEATHER), LARRY)).toBe(false); // someone else is playing
    expect(championRound(champion(FEATHER), undefined)).toBe(false);
    expect(championRound(undefined, FEATHER)).toBe(false);
  });

  it('a pre-champion record simply lacks the mark — the honest "we do not know"', () => {
    expect(rec(-4).champion).toBeUndefined();
  });

  it('a v30 save migrates to the current version without disturbing a banked record', () => {
    const old = { version: 30, strokePlayBest: { 'verdant-18': rec(-4) } } as unknown;
    const s = migrate(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.version).toBeGreaterThanOrEqual(31); // v31 stamped the champion mark; later bumps ride over it
    expect(s.strokePlayBest['verdant-18']).toEqual(rec(-4)); // unmarked, unmoved
  });
});

// ── the World Tree + the Root ───────────────────────────────────────────────────────────────────────
describe('a champion reveals the World Tree; only the hammer opens Asgard', () => {
  /** Mount the app-layer star map against a state, with the Yggdrasil sheet raised. */
  function chart(s: UiState): string {
    setState(s);
    starTourView.storyMode = false;
    starTourView.selectedId = null;
    starTourView.recordsOpen = false;
    starTourView.serpentResult = null;
    starTourView.yggdrasilOpen = true;
    return starTourScreen();
  }

  const flying = (c: StoryState, meta: Record<string, unknown> = {}) =>
    reduce(
      initState('seed', { starTourUnlocked: true, ...meta }, undefined, c, upsertCampaign(emptyCampaignStore(), c)),
      { type: 'openStarTour' },
    );

  it('a champion arms the tree WITHOUT Thor’s Hammer', () => {
    setState(flying(champion(FEATHER)));
    expect(yggdrasilArmed()).toBe(true);
  });

  it('…but the Bifröst stays sealed, because Asgard is the Asgard reward', () => {
    // The button must be ABSENT, not merely inert: `playYggdrasilRealm` refuses without the hammer, and a
    // dead control is worse than none. (Asserted on the ACTION — the realm's own blurb names the Bifröst.)
    const html = chart(flying(champion(FEATHER)));
    expect(html).toContain('Bifröst sealed');
    expect(html).not.toContain('playYggdrasilRealm');
  });

  it('the hammer opens it, champion or not', () => {
    expect(chart(flying(champion(FEATHER), { ownedApparel: ['thors-hammer'] }))).toContain('playYggdrasilRealm');
  });

  it('the Root offers the boss THIS champion’s path faced', () => {
    expect(chart(flying(champion(FEATHER)))).toContain('Jörmungandr'); // no alignment ⇒ the Warden road
    expect(chart(flying(champion(FEATHER, { alignment: 'warden' })))).toContain('Jörmungandr');
    const herald = chart(flying(champion(LARRY, { alignment: 'herald' })));
    expect(herald).toContain('Warden Ark');
    expect(herald).not.toContain('Jörmungandr');
  });

  it('the Root is offered ONLY to a champion — an unfinished campaign never sees it', () => {
    const s = initState('seed', { starTourUnlocked: true, ownedApparel: ['thors-hammer'] });
    expect(chart(reduce(reduce(s, { type: 'openStarTour' }), { type: 'selectCharacter', characterId: FEATHER }))).not.toContain('The Root');
  });
});

describe('the champion picker renders', () => {
  it('names every champion and offers each as a select action', () => {
    const s = openStarTour(booted([champion(FEATHER), champion(LARRY)]));
    setState(s);
    const html = starTourChampionScreen();
    expect(html).toContain('gs-champ__grid');
    expect(html.match(/gs-champ__card/g) ?? []).toHaveLength(2);
    expect(html).toContain('selectStarTourChampion');
    // Each figure's SVG defs get their OWN id prefix — ids are document-global and both mount at once.
    expect(html).toContain(`champ${FEATHER.replace(/-/g, '')}`);
    expect(html).toContain(`champ${LARRY.replace(/-/g, '')}`);
  });

  it('names the PATH each champion walked — that is what differs between them', () => {
    const s = openStarTour(booted([champion(FEATHER, { alignment: 'warden' }), champion(LARRY, { alignment: 'herald' })]));
    setState(s);
    const html = starTourChampionScreen();
    expect(html).toContain('Warden of the Realms');
    expect(html).toContain('Herald of the Coil');
  });
});
