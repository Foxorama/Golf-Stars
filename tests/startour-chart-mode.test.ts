/**
 * GS-startour-chart-mode — WHICH CHART AM I FLYING?
 *
 * `screen: 'starTour'` serves two modes: the free-roam records chase / champion reward, and the Story
 * Tour campaign navigator. The answer decided the worlds plotted, the ship flown, the HUD — and where
 * the SPACEPORT drops you: `exitStoryMap` (your campaign's own clubhouse) or `openClubhouseHall` (the
 * title's cosmetic hall).
 *
 * It used to be an app-layer flag assigned in ONE place (on `openStoryMap`), while SIX reducer
 * transitions land on the chart. Three of those are story service exits reachable from a world-clear
 * RECAP — so a campaign whose round started at the clubhouse (a quest, a tournament banner, a resumed
 * round) and which then used the recap's own Pro Shop arrived on its chart flagged as the records
 * chase, and docking flew the player to the title Clubhouse.
 *
 * These are the routes, walked through the real reducer. `isStoryChart` is the ONE predicate the
 * spaceport, the worlds, the ship and the HUD all ask.
 */
import { describe, it, expect } from 'vitest';
import { initState, reduce } from '../src/ui/game';
import { isStoryChart, isChampionFreeRoam } from '../src/ui/starTourMode';
import { emptyCampaignStore, upsertCampaign } from '../src/sim/rpg/storyRoster';
import { defaultStoryState } from '../src/sim/rpg/story';
import { worldHasShop } from '../src/sim/rpg/storyShop';
import { worldIsShipVendor } from '../src/sim/rpg/storyShips';
import type { UiState } from '../src/ui/gameState';
import type { StoryState } from '../src/sim/rpg/story';

function pastLore(s: UiState): UiState {
  while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
  return s;
}

/** Prologue → Chapter 1 spaceport clubhouse, the honest way. */
function chapterOne(): UiState {
  const picker = reduce(initState('chart-mode'), { type: 'openStory' });
  const hub = reduce(picker, { type: 'selectCharacter', characterId: 'feather-fade' });
  const played = reduce(pastLore(reduce(hub, { type: 'storyPlayWorld', courseId: 'standrews-18' })), { type: 'play' });
  return reduce(played, { type: 'storyRoundContinue' });
}

/** Clear a world and stop on its world-clear RECAP (the screen whose service buttons route to the chart). */
function recapAfterClearing(from: UiState, courseId: string): UiState {
  const s = reduce(pastLore(reduce(from, { type: 'storyPlayWorld', courseId })), { type: 'play' });
  expect(s.screen).toBe('storyResult');
  return s;
}

describe('the star chart knows which mode it is (GS-startour-chart-mode)', () => {
  it('a campaign navigator opened with "Set course" is the story chart', () => {
    const chart = reduce(chapterOne(), { type: 'openStoryMap' });
    expect(chart.screen).toBe('starTour');
    expect(isStoryChart(chart)).toBe(true);
  });

  it('THE BUG: a world-clear recap → Pro Shop → back lands on the chart, and it is STILL the story chart', () => {
    // This route never dispatches `openStoryMap`, which is why the old app-layer flag was never set.
    const ch1 = reduce(chapterOne(), { type: 'openStoryMap' });
    const recap = recapAfterClearing(ch1, 'verdant-18');
    expect(worldHasShop('verdant-18')).toBe(true);

    const shop = reduce(recap, { type: 'openStoryShop', worldId: 'verdant-18' });
    expect(shop.screen).toBe('storyShop');
    const back = reduce(shop, { type: 'exitStoryShop' });
    expect(back.screen).toBe('starTour'); // the recap's shop routes OUT to the map (GS-story-shop-routing)
    expect(isStoryChart(back)).toBe(true);
  });

  it('…and the same for a vendor world\'s SHIPYARD, the other service that exits to the chart', () => {
    const vendor = ['verdant-18', 'verdant2-18', 'desert-18', 'ocean-18', 'crimson-18'].find(worldIsShipVendor);
    expect(vendor).toBeTruthy();
    const ch1 = reduce(chapterOne(), { type: 'openStoryMap' });
    const recap = recapAfterClearing(ch1, vendor!);
    const yard = reduce(recap, { type: 'openStoryShipyard', worldId: vendor! });
    expect(yard.screen).toBe('storyShipyard');
    const back = reduce(yard, { type: 'exitStoryShipyard' });
    expect(back.screen).toBe('starTour');
    expect(isStoryChart(back)).toBe(true);
  });

  it('…and for boarding your ship and stepping back out', () => {
    const chart = reduce(chapterOne(), { type: 'openStoryMap' });
    const inside = reduce(chart, { type: 'openShipInterior' });
    expect(inside.screen).toBe('shipInterior');
    const back = reduce(inside, { type: 'exitShipInterior' });
    expect(back.screen).toBe('starTour');
    expect(isStoryChart(back)).toBe(true);
  });

  it('a campaign that has NEVER opened its chart still owns it — the default is the navigator', () => {
    // A round teed off from the clubhouse (a quest, a tournament, a resumed round) means the first
    // chart the player ever sees can be a service exit. Nothing set a flag; the chart is still theirs.
    const hub = chapterOne();
    expect(isStoryChart(hub)).toBe(true);
  });
});

describe('free-roam Star Tour is NOT the campaign navigator', () => {
  const champion = (): StoryState => ({ ...defaultStoryState('feather-fade'), chapter: 5, completed: true });

  function freeRoam(): UiState {
    const c = champion();
    const s = initState('free', { starTourUnlocked: true }, undefined, c, upsertCampaign(emptyCampaignStore(), c));
    return reduce(s, { type: 'openStarTour' });
  }

  it('a champion flying free-roam holds a campaign in `state.story` and is still NOT the story chart', () => {
    const chart = freeRoam();
    expect(chart.screen).toBe('starTour');
    expect(chart.story).toBeTruthy(); // the champion IS a loaded campaign — `state.story` alone can't answer
    expect(isStoryChart(chart)).toBe(false);
    expect(isChampionFreeRoam(chart)).toBe(true);
  });

  it('leaving free roam for a campaign hands the chart back — the doors disarm it', () => {
    // `openStarTour` arms free roam for the session; entering Story Tour must take it away, or the
    // campaign's spaceport would fly the player to the title Clubhouse.
    const afterFreeRoam = reduce(freeRoam(), { type: 'exitStarTour' });
    expect(afterFreeRoam.screen).toBe('title');
    const picker = reduce(afterFreeRoam, { type: 'openStory' });
    const resumed = reduce(picker, { type: 'storyContinueCampaign', characterId: 'feather-fade' });
    expect(isStoryChart(resumed)).toBe(true);
  });

  it('…and `toTitle` disarms it too, since that is the exit every settings sheet offers', () => {
    const home = reduce(freeRoam(), { type: 'toTitle' });
    expect(home.screen).toBe('title');
    // Asserted through the predicate, not the raw field: the champion's campaign is still loaded, so
    // "disarmed" and "the chart belongs to the campaign again" are the same claim.
    expect(isStoryChart(home)).toBe(true);
  });
});
