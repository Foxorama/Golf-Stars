/**
 * WHICH CHART AM I FLYING? (GS-startour-chart-mode)
 *
 * The star chart is ONE screen (`starTour`) serving two modes: the free-roam records chase / champion
 * reward (GS-star-tour), and the Story Tour campaign navigator (GS-story-map). Which one it is decides
 * the worlds plotted, the ship flown, the HUD, and — the bug this module exists because of — where the
 * SPACEPORT drops you: the title's cosmetic Clubhouse hall, or your campaign's own clubhouse.
 *
 * It used to be an app-layer flag on `starTourView`, assigned in exactly ONE place (app.ts's dispatch
 * handler, on `openStoryMap`). But SIX reducer transitions land on `screen: 'starTour'`, and three of
 * them are story service exits that can be reached from a world-clear RECAP without the chart ever
 * having been opened — `storyResult` → Pro Shop → back is `starTour`, and no `openStoryMap` was
 * dispatched anywhere along it. So a campaign that started its round from the clubhouse (a quest, a
 * tournament banner, a resumed round) and then used the recap's own shop button arrived on its chart
 * flagged as the records chase, and docking at the spaceport flew the player to the title Clubhouse.
 * Four deep-links had to hand-set the flag for the same reason, each one a copy of the same fact.
 *
 * So the answer lives in `UiState` and rides the reducer's `...state` spread: every return route
 * inherits it, and only the DOORS declare it — `openStarTour` arms free-roam, and the doors into a
 * campaign (`openStory` / `storyContinueCampaign` / `openStoryMap`) plus `toTitle` disarm it. The
 * default is the campaign navigator, so a route nobody remembered lands on the safe side of the bug.
 *
 * PURE (no DOM, no ambient state) so the reducer walks in `tests/startour-chart-mode.test.ts` can
 * assert the real routes; `app/starTourScreens.ts` wraps both over the live state.
 */
import type { UiState } from './gameState';

/** Is the star chart the STORY campaign navigator (vs the free-roam records chase)? */
export function isStoryChart(s: UiState): boolean {
  return !!s.story && !s.starTourFreeRoam;
}

/**
 * Free-roam Star Tour flown as a DEVELOPED CHAMPION (GS-story-startour-champions): a completed
 * campaign playing its reward, NOT the campaign navigator — the chart flies the earned Story ship and
 * drops the records-chase "change golfer" swap.
 */
export function isChampionFreeRoam(s: UiState): boolean {
  return !isStoryChart(s) && !!s.story?.completed;
}
