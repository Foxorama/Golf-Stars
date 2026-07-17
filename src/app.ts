/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName, playTotals, stablefordPoints } from './sim/score';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { installDecorProbe } from './render/decorProbe';
import { renderHoleSVG, renderPuttOverlaySVG, PUTT_OVERLAY_ID, renderShotOverlaySVG, SHOT_OVERLAY_ID } from './render/holeView';
import { type ProjectOptions } from './render/project';
import { shotView, previewShot, previewBackspin, resolveAimTarget, awaitingPutt, canPuttFringe, type AimMode } from './sim/rpg/play';
import { mountPuttMeter, type PuttMeterHandle } from './render/puttMeter';
import { drawCaddy, hasCaddyArt } from './render/caddyArt';
import { biomeCarryMult, pinOf, greenDepth, forcedCarry, DEFAULT_MANUAL_BAND, DEFAULT_PUTT_RANGE, MANUAL_IDEAL_PACE, puttBreakYd, puttBreakBow, puttBandDistanceFactor, idealPuttAim, puttPathPreview } from './sim/round';
import { puttSkillOf } from './sim/rpg/economy';
import { archetypeFor } from './sim/course/themes';
import { bearing, dist, type Vec } from './sim/course/contract';
import { type ShotSpread } from './sim/round';
import { type SprayGeomInput } from './render/holeView';
import { ACE_CREDIT_BONUS, maxPowerOf, usableBag } from './sim/rpg/economy';
import { getFormat, ASGARD_FORMAT, STROKEPLAY_FORMAT } from './sim/rpg/formats';
import { holeGateArmed, snapshotRun, currentCourse } from './sim/rpg/run';
import { shopOffer, starmartOffer } from './sim/rpg/runShop';
import { shopItem } from './sim/rpg/economy';
import { CHARACTERS } from './sim/rpg/characters';
import { endlessMilestonesCrossed, endlessMilestoneShards, endlessSetGateOverPar, endlessSetLabel, endlessUnlocksCrossed } from './sim/rpg/endless';
import { liveLeaderboard } from './sim/rpg/league';
import { holeResult } from './sim/rpg/play';
import { betterPlayedHole } from './sim/rpg/match';
import { ACE_SHIP_ID } from './sim/rpg/ships';
import { bagTierRank, type BagTier } from './sim/rpg/bag';
import { endlessScoreCard } from './render/endlessCards';
import {
  asgardFieldEdge,
  initState,
  reduce,
  type Action,
  type UiState,
} from './ui/game';
import { loadSave, writeSave } from './save/storage';
import { loadStory } from './save/storyStore';
import { defaultSave } from './save/schema';
import { mountIntro } from './render/introView';
import { mountStoryIntro } from './render/storyIntro';
import { sfx, resumeAudio, landVoiceOf } from './render/audio';
import { getSettings, setSetting, toggleSetting, type Settings } from './settings';
import { HAPTICS, haptic } from './render/haptics';
import { showAceCelebration, showBirdCelebration, showEndlessMilestone, showSectorScan, showVoyageVictory } from './render/celebrations';
import { characterScreen, ordinal, leaderboardHTML } from './render/golferCards';
import { state, setState, btn, header, seedFromUrl, freshRunSeed } from './app/ctx';
import {
  burst,
  caddyBadgeHTML,
  caddyId,
  currentEffect,
  golferLook,
  holeBiome,
  holeThemeId,
  lefty,
  patchActive,
  puttCaddyId,
  rainbowActive,
  scorchActive,
  tentsActive,
} from './app/helpers';
import {
  bestBallRevealHTML,
  holeMatchProgressHTML,
} from './app/duelHud';
import { installView, titleScreen } from './app/titleScreens';
import { endlessRoundSoFar, introFieldOverlay, introScreen, introTraitsOverlay, introView } from './app/introScreens';
import { bossRewardScreen, gameoverScreen, resultScreen, victoryInfo } from './app/resultScreens';
import { shopScreen, shopView, starmartScreen } from './app/shopScreens';
import { MARKET_SECTION_IDS, marketView, tradeMarketScreen } from './app/marketScreens';
import { clubhouseHallScreen, clubhouseScreen, clubhouseView, type ClubSlot } from './app/clubhouseScreens';
import { travelScreen, travelView } from './app/travelScreens';
import { asgardMapScreen, asgardResultScreen, asgardLiveBoardHTML } from './app/asgardScreens';
import { starTourScreen, starTourView, starTourWorlds, starTourShipSpeedMult, starTourShipHovers, starTourFuelHTML, STAR_TOUR_FUEL_CAP, starTourAmmoHTML, WEAPON_AMMO_CAP, yggdrasilArmed, tourShipId } from './app/starTourScreens';
import { shipWeaponFor, shotInnerSVG, type WeaponStyle } from './render/shipWeapons';
import { strokeResultScreen, strokePlayProgressHTML } from './app/strokeResultScreens';
import { storyHubScreen, storyResultScreen, storyGolferPickerHTML } from './app/storyScreens';
import { storyShopScreen } from './app/storyShopScreens';
import { storyLockerScreen } from './app/storyLockerScreens';
import { storyShipyardScreen } from './app/storyShipyardScreens';
import { storyTournamentScreen, storyTournamentResultScreen } from './app/storyTournamentScreens';
import { storyFinaleScreen, storyFinaleResultScreen } from './app/storyFinaleScreens';
import { mountStoryFinale } from './render/storyFinale';
import { finaleResult } from './sim/rpg/storyFinale';
import { loreScreen } from './app/loreScreens';
import { worldPos, CHART_W, CHART_H, SPACEPORT_POS, EARTH_POS, YGGDRASIL_POS, SHIP_DOCK_HEADING, hoverBank } from './render/starTourMap';
import type { CourseEffectId } from './sim/rpg/effects';
import { priceNoticeOverlay, scrambleChoiceOverlay, settingsOverlay, settingsSheetInner, shotPopupOverlay } from './app/overlays';
import { hazardLabel, mapTopInfo, puttAimLabel, puttAimRow } from './app/playHud';
import { mountWeatherOverlay, playCaddyVoice, playTentBonk, syncMusic } from './app/playFx';
import { metaFromSave, persist, persistStory } from './app/persist';

// Breadcrumb: app.ts's module body reached top level (i.e. all imports above evaluated
// without throwing). If the watchdog ever reports a stage *before* this, the fault is in
// an imported module's top-level eval, not in app.ts.
(window as unknown as { __gsStage?: string }).__gsStage = 'app-top';


let view: PlayViewHandle | null = null;
/** The animated weather overlay over the aim/putt map (GS-journey-fx rework) — so the sky + air are
 *  alive while you line up, not only mid-flight. Torn down + remounted each render like `view`. */
let weatherOverlay: { destroy(): void } | null = null;


/** Diagnostic breadcrumb the boot watchdog can read if the app never paints. */
function stage(s: string): void {
  (window as unknown as { __gsStage?: string }).__gsStage = s;
}

function boot(): void {
  try {
    stage('boot:start');
    installDecorProbe(); // GS-decor-view-states: test-only `window.__gsDecorProbe` for the CI view-invariance check
    const save = loadSave();
    stage('loaded');
    const meta = metaFromSave(save);
    const seed = seedFromUrl() ?? freshRunSeed();
    // GS-story: load the Story Mode campaign from its own `gs_story` blob (null ⇒ no campaign yet), so the
    // title's Story tile can offer Continue and `openStory` can resume straight to the hub.
    const story = loadStory() ?? undefined;
    // Always land on the title screen; a saved run is offered as "Continue", never
    // auto-resumed — so the format choice is always reachable.
    setState(initState(seed, meta, save.activeRun, story));
    applyDebugParams(); // GS-asgard: test-hub-only `?rainbow=` / `?asgard=` jumps (dormant in the live game)
    stage('init');
    render();
    stage('rendered');
  } catch (err) {
    recover(err);
  }
}

/**
 * TEST-HUB debug jumps (GS-asgard) — driven ONLY by the hub's Demo controls via URL params; the live
 * game never sets them, so they're dormant in production exactly like `?seed=`/`?intro=`. They let QA
 * reach the hard-to-earn Rainbow-Road → Asgard flow in one click, without grinding for the Rainbow Ball
 * or an eagle:
 *   • `?rainbow=1` — start a fresh run with the Rainbow Ball armed, so every hole is Rainbow Road (eagles
 *     come fast on the wide ribbon and the Bifröst trigger fires authentically when you make one).
 *   • `?asgard=1`  — jump STRAIGHT into the Bifröst interlude (the Himinbjörg map → cross → the nine-hole
 *     tournament → win/lose → return), from a real suspended run so "Return to your journey" works.
 *   • `?screen=travel|shop|starmart|trademarket|clubhouse|lore|storyshop|storylocker|storyshipyard|storytournament|storyfinale` (GS-screen-deeplink) — mount a between-stop
 *     screen directly, so the browser LAYOUT smoke tests (tests/build.test.ts) can reach the travel /
 *     shop / market / clubhouse / lore surfaces WITHOUT playing a full stop (shot animations + watch screens
 *     are flaky to script). The report's highest-risk uncovered surface — the journey map was
 *     redesigned three times in one day with no layout guard. Reuses the real reducer transitions
 *     where they exist (leaveShop → travel, openMarket, openClubhouseHall) so nothing forks the logic.
 * All three compose, and all reuse the real reducer to build an honest run — nothing forks the game's logic.
 */
function applyDebugParams(): void {
  const rainbow = new URLSearchParams(location.search).get('rainbow');
  const asgard = new URLSearchParams(location.search).get('asgard');
  const screen = new URLSearchParams(location.search).get('screen');
  if (!rainbow && !asgard && !screen) return;
  const title = state; // the pristine title state (initState) — where between-RUN screens open from.
  // Build a genuine interactive run with the first golfer, via the same reducer path the UI uses.
  let s = reduce(state, { type: 'start', format: 'unending' });
  s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
  let run = s.run;
  if (rainbow) run = { ...run, loadout: shopItem('rainbow-ball')!.apply(run.loadout) };
  s = { ...s, run, course: currentCourse(run) };
  // Open the Bifröst directly: suspend this run and reveal the Himinbjörg map.
  if (asgard) s = { ...s, screen: 'asgardMap', asgardReturn: snapshotRun(run) };
  // Jump straight to a between-stop / between-run screen for the layout smoke tests (GS-screen-deeplink).
  if (screen) s = jumpToScreen(title, s, screen);
  setState(s);
}

/**
 * GS-screen-deeplink — map a `?screen=` value to the honest UiState for that screen. Every branch either
 * reuses a real reducer transition (leaveShop → travel, openMarket, openClubhouseHall) or builds the SAME
 * state the reducer's own transition builds (shop offer / starmart offer), so the deep-link mounts a
 * genuine screen — never a hand-forged one that could paper over a real render bug. The between-STOP
 * screens (travel / shop / starmart) open off the built run `s`; the between-RUN screens (trademarket /
 * clubhouse) open off the pristine `title` state, which is the screen their reducer guards require.
 */
function jumpToScreen(title: UiState, s: UiState, screen: string): UiState {
  const run = s.run;
  const withShop = (): UiState => ({ ...s, screen: 'shop', shopOffer: shopOffer(run).map((o) => o.item.id), shopRerolls: 0 });
  switch (screen) {
    case 'character':
      // GS-select-onescreen: the golfer roster — mount it the honest way (the Star Tour tile opens
      // character select first), so the layout smoke test can guard the viewport-fit roster.
      return reduce(title, { type: 'openStarTour' });
    case 'shop':
      return withShop();
    case 'travel':
      // The honest path: build the shop, then leave it — the shop → travel reducer transition sets routes.
      return reduce(withShop(), { type: 'leaveShop' });
    case 'starmart':
      return { ...s, screen: 'starmart', starmartOffer: starmartOffer(run).map((o) => o.item.id), starmartRerolls: 0 };
    case 'trademarket':
      return reduce(title, { type: 'openMarket' });
    case 'clubhouse':
      return reduce(title, { type: 'openClubhouseHall' });
    case 'startour':
      // GS-star-tour-2: character select comes first, then the star map — mount it via the real
      // transitions (openStarTour → pick a golfer → land on the map).
      return reduce(reduce(title, { type: 'openStarTour' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    case 'strokeresult': {
      // GS-star-tour: mount the round recap the honest way — golfer → map → pick a course → auto-play +
      // resolve it exactly as the reducer's own `play` path does, so the deep-link can't paper over a
      // render bug.
      const map = reduce(reduce(title, { type: 'openStarTour' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const intro = reduce(map, { type: 'pickStarTourCourse', courseId: 'verdant-18' });
      return reduce(intro, { type: 'play' });
    }
    case 'story':
      // GS-story: mount the Story Mode hub the honest way — enter Story Mode (no save ⇒ new-game golfer
      // pick), then pick the first golfer, which creates the StoryState and lands on the hub.
      return reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    case 'storypick':
      // GS-story-clubhouse: mount the golfer PICKER with a stats/abilities overlay open — enter Story Mode
      // (fresh ⇒ the clubhouse picker), then inspect the first golfer, so the overlay chrome is smoke-tested.
      return reduce(reduce(title, { type: 'openStory' }), { type: 'storyInspectGolfer', characterId: CHARACTERS[0]!.id });
    case 'storyresult': {
      // GS-story-prologue: mount the world-round recap the honest way — enter Story Mode, pick a golfer,
      // tee off the Earth prologue round, then auto-play + resolve it exactly as the reducer's `play` path
      // does. Exercises the whole Story round → resolveStoryRound spine, so the deep-link can't hide a bug.
      const hub = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const intro = reduce(hub, { type: 'storyPlayWorld', courseId: 'standrews-18' });
      return reduce(intro, { type: 'play' });
    }
    case 'storymap': {
      // GS-story-map: reach the galaxy star map in STORY mode the honest way — play the prologue to Chapter
      // 1, continue to the spaceport clubhouse, then open the chart (which reuses the Star Tour screen with
      // the story context). Exercises world unlock-by-chapter + the map render. The app-layer `storyMode`
      // flag is set by the dispatch handler on `openStoryMap`, so drive it through a real dispatch below.
      const hub = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const result = reduce(reduce(hub, { type: 'storyPlayWorld', courseId: 'standrews-18' }), { type: 'play' });
      const club = reduce(result, { type: 'storyRoundContinue' });
      starTourView.storyMode = true; // dispatch normally sets this; the deep-link builds state directly
      return reduce(club, { type: 'openStoryMap' });
    }
    case 'storyshop': {
      // GS-story-econ: mount a world's Pro Shop the honest way — play the prologue to Chapter 1, then
      // clear a shoppable world (verdant-18) so its rack is reachable, open the star map, and open the
      // shop. Exercises the buy/lore-card chrome through real reducer transitions.
      const hub0 = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const afterProl = reduce(reduce(hub0, { type: 'storyPlayWorld', courseId: 'standrews-18' }), { type: 'play' });
      const hub1 = reduce(afterProl, { type: 'storyRoundContinue' });
      const world = reduce(reduce(hub1, { type: 'storyPlayWorld', courseId: 'verdant-18' }), { type: 'play' });
      const hub2 = reduce(world, { type: 'storyRoundContinue' });
      starTourView.storyMode = true; // dispatch normally sets this; the deep-link builds state directly
      const map = reduce(hub2, { type: 'openStoryMap' });
      return reduce(map, { type: 'openStoryShop', worldId: 'verdant-18' });
    }
    case 'storylocker': {
      // GS-story-locker: reach the campaign locker the honest way — play the prologue to Chapter 1 (the
      // spaceport clubhouse), then open the locker. Exercises the bag-builder + gear chrome.
      const hub0 = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const afterProl = reduce(reduce(hub0, { type: 'storyPlayWorld', courseId: 'standrews-18' }), { type: 'play' });
      const hub1 = reduce(afterProl, { type: 'storyRoundContinue' });
      return reduce(hub1, { type: 'openStoryLocker' });
    }
    case 'storyshipyard': {
      // GS-story-ships: reach the shipyard the honest way — prologue → Chapter 1 spaceport → open shipyard.
      const hub0 = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const afterProl = reduce(reduce(hub0, { type: 'storyPlayWorld', courseId: 'standrews-18' }), { type: 'play' });
      const hub1 = reduce(afterProl, { type: 'storyRoundContinue' });
      return reduce(hub1, { type: 'openStoryShipyard' });
    }
    case 'storytournament':
    case 'storytournamentresult': {
      // GS-story-tournament: reach the Galaxy Tournament the honest way — prologue → Chapter 1, clear two of
      // Chapter 1's worlds so the tournament unlocks, then open its lobby. `storytournamentresult` plays it
      // out (vs the rival) to land on the recap.
      const st0 = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const playWorld = (s: UiState, courseId: string): UiState =>
        reduce(reduce(reduce(s, { type: 'storyPlayWorld', courseId }), { type: 'play' }), { type: 'storyRoundContinue' });
      const st1 = playWorld(st0, 'standrews-18'); // prologue → Chapter 1
      const st2 = playWorld(st1, 'verdant-18'); // clear 1
      const st3 = playWorld(st2, 'verdant2-18'); // clear 2 → tournament unlocks
      const lobby = reduce(st3, { type: 'openStoryTournament' });
      if (screen === 'storytournament') return lobby;
      return reduce(reduce(lobby, { type: 'storyPlayTournament' }), { type: 'play' });
    }
    case 'storyfinale':
    case 'storyfinaleresult': {
      // GS-story-yggdrasil: reach the finale by seeding a five-Sigil campaign directly (the honest tournament
      // grind is long; the finale gate is `keyToOtherRealm`, which we set via trophies). `storyfinaleresult`
      // engages to land on the recap. This bypasses the cinematic (a render-only feel layer).
      const base = reduce(reduce(title, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
      const armed: UiState = base.story
        ? {
            ...base,
            story: {
              ...base.story,
              chapter: 5,
              trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal', 'sigil-serpent'],
              // arm the ship so the finale is winnable (the result deep-link lands on the victory recap)
              ownedShipUpgradeIds: ['upg:weapon:scatter', 'upg:weapon:railgun', 'upg:engine:ion', 'upg:shield:deflector', 'upg:shield:aegis'],
            },
          }
        : base;
      const briefing = reduce({ ...armed, screen: 'story' }, { type: 'openStoryFinale' });
      if (screen === 'storyfinale') return briefing;
      return reduce(briefing, { type: 'engageStoryFinale' });
    }
    case 'lore':
      // GS-lore: mount the story-beat popup with the real Driver Dan beat (the SAME shape the arrival
      // lore gate builds), so a headless smoke test can render the new screen chrome.
      return { ...s, screen: 'lore', pendingLoreId: 'driver-dan-derelict' };
    default:
      return s; // unknown value → land on the normal title (no crash)
  }
}

/**
 * Last-resort guard: a stale/corrupt save or a render fault must never leave a blank
 * page. Clear the active run and fall back to a fresh title screen.
 */
function recover(err: unknown): void {
  console.error('Golf Stars recovered from an error:', err);
  (window as unknown as { __gsErr?: string }).__gsErr = String(
    (err && ((err as Error).stack || (err as Error).message)) || err,
  );
  stage('recover');
  try {
    writeSave(defaultSave());
  } catch {
    /* ignore */
  }
  try {
    setState(initState(freshRunSeed(), {}));
    render();
  } catch {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML =
        '<main style="font-family:system-ui;color:#e8e8ea;background:#0b0d12;padding:24px;min-height:100vh;">⛳ Something went wrong and the save was reset. Refresh to start fresh.</main>';
    }
  }
}

function dispatch(action: Action): void {
  // The first user gesture is our cue to resume the (browser-suspended) audio context.
  resumeAudio();
  // Tactile confirmation the moment a stroke is committed (swing a touch firmer than a putt).
  if (action.type === 'shot') haptic(HAPTICS.swing);
  else if (action.type === 'putt') haptic(HAPTICS.putt);
  if (view) {
    view.destroy();
    view = null;
  }
  if (weatherOverlay) {
    weatherOverlay.destroy();
    weatherOverlay = null;
  }
  if (puttMeter) {
    puttMeter.destroy();
    puttMeter = null;
  }
  // A light UI tick on navigation presses (the stroke + purchase actions get their own richer cues,
  // and the sector scan owns its sonar ping — GS-fuel-4).
  if (
    action.type !== 'shot' &&
    action.type !== 'putt' &&
    action.type !== 'buy' &&
    action.type !== 'buyShip' &&
    action.type !== 'buyApparel' &&
    action.type !== 'scanRoutes'
  ) {
    sfx.click();
  }
  // Any reducer action dismisses a pending shot popup and cancels its timer.
  awaitingShotPopup = false;
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = 0;
  }
  try {
    const prevScreen = state.screen;
    // The Unending Universe's milestone takeover (GS-unending) fires on a survived-hole CROSSING —
    // capture the pre-action counters so the post-reduce state can be diffed (same run only).
    const prevRunSeed = state.run.seed;
    const prevHoles = state.run.holesSurvived;
    const prevBestHoles = state.endlessBestHoles;
    // The sector-scan sweep (GS-fuel-4) fires only on a scan that actually BURNT fuel — a refused
    // tap (dry tank, wrong screen) stays silent, so the sonar can never lie about a redraw.
    const prevScans = state.run.routeScans;
    setState(reduce(state, action));
    // Entering character select seeds the difficulty pickers (GS-title-2 / GS-golf-score). Ascension
    // defaults to the LAST tier you chose (persisted pref), clamped to what's now unlocked — so it
    // doesn't snap back to A0 every run. The club set defaults to the owned tier (the strongest bag
    // you have; opt DOWN for a harder run).
    if (action.type === 'start' || action.type === 'openStarTour') {
      selAscension = Math.max(0, Math.min(state.maxAscension, getSettings().lastAscension));
      selClubSet = state.bagTier;
      selClubSetTouched = false;
    }
    // Entering Star Tour (GS-star-tour-2): character select comes first, so `openStarTour` opens the
    // roster; reset the star map's whole view (selection, weather, ship at the spaceport) so a fresh
    // tour docks at home and re-centres on the port.
    // GS-story-map: Story Mode's "Set course" (openStoryMap) flies the SAME galaxy star map as the campaign
    // navigator — reset the view identically, and flag `storyMode` so the chart plots the story's charted
    // worlds, flies the campaign ship, and exits to the clubhouse (openStarTour clears the flag → the
    // records chase). `leaveAsgard→starTour` is the records chase (no Story map returns via Asgard).
    if (
      action.type === 'openStarTour' ||
      action.type === 'openStoryMap' ||
      (action.type === 'leaveAsgard' && state.screen === 'starTour')
    ) {
      starTourView.storyMode = action.type === 'openStoryMap';
      starTourView.selectedId = null;
      starTourView.effect = 'none';
      starTourView.recordsOpen = false;
      starTourView.yggdrasilOpen = false;
      starTourView.centred = false;
      starTourView.shipX = null;
      starTourView.shipY = null;
      starTourView.heading = SHIP_DOCK_HEADING;
      starTourView.flip = 1;
      starTourView.targetX = null;
      starTourView.targetY = null;
      starTourView.flyingTo = null;
      starTourView.dockingAtPort = false;
      starTourView.flyingToYggdrasil = false;
      starTourView.following = false;
      // Open slightly more zoomed OUT than the intrinsic 1× (GS-star-tour-map-improvements) so more of the
      // sky is in frame on arrival; the fit clamp only pulls it in if a viewport is so small the whole
      // chart wouldn't fit even here (GS-star-map-zoom-out).
      starTourView.zoom = ST_OPEN_ZOOM;
      // Fresh tank, normal throttle, no tanker in progress (GS-star-tour-fuel).
      starTourView.fuel = STAR_TOUR_FUEL_CAP;
      starTourView.speed = 'normal';
      starTourView.refuel = null;
      // Fresh weapon magazine + no live projectiles (GS-star-tour-weapons).
      starTourView.ammo = WEAPON_AMMO_CAP;
      stShots.length = 0;
    }
    // Entering/leaving a character's Clubhouse resets the open slot picker to the resting stage.
    if (
      action.type === 'openClubhouse' ||
      action.type === 'closeClubhouse' ||
      action.type === 'clubhouseBackToHall' ||
      action.type === 'openClubhouseHall'
    ) {
      clubhouseView.slot = null;
    }
    // Opening the Trade Market re-collapses every catalogue section so it lands compact
    // (GS-market-accordion) and re-hides owned gear so it lands on the buyable rack (Show Owned off).
    if (action.type === 'openMarket') {
      marketView.collapsed.clear();
      for (const id of MARKET_SECTION_IDS) marketView.collapsed.add(id);
      marketView.showOwned = false;
    }
    // Entering the stop intro (from character-select, resume, or a route jump) opens on the ARC step
    // with the hazards popup closed (GS-intro-split) — never a stale sub-step from last stop. Past the
    // first tee EVERY format now skips straight to the HOLE step (map + Tee Off), so a route jump lands
    // one tap from teeing off instead of on a briefing/leaderboard the player just saw (GS-intro-endless
    // for the Unending Universe; GS-intro-voyage extends the same skip to the Voyage). Stop 0 keeps the
    // arc step — coming from character select it IS the mode lobby ("Change golfer"). The briefing stays
    // one "‹ Briefing" tap away on the hole step.
    if (state.screen === 'intro' && prevScreen !== 'intro') {
      introView.stage = state.run.stopIndex > 0 ? 'hole' : 'arc';
      introView.traitsOpen = false;
      introView.fieldOpen = false;
    }
    // Purchase chime (a real buy only — unaffordable cards aren't clickable).
    if (action.type === 'buy' || action.type === 'buyShip' || action.type === 'buyApparel') {
      sfx.reward();
      haptic(HAPTICS.tap);
    }
    // Big-beat cues on the cut transition: a bright arpeggio for making it, a fall for missing.
    // A WON voyage is the exception — its fanfare + haptic fire inside the victory takeover below, so it
    // never plays the "you failed" fall it used to share with a missed cut.
    const enteredGameover = state.screen === 'gameover' && prevScreen !== 'gameover';
    if (state.screen === 'result' && prevScreen !== 'result') {
      sfx.madeCut();
      haptic(HAPTICS.madeCut);
    } else if (enteredGameover && state.run.endedReason !== 'won') {
      sfx.missCut();
      haptic(HAPTICS.bad);
    }
    persist();
    persistStory(); // GS-story: write the campaign to its own gs_story blob when one is active
    render();
    // The sector-scan sweep (GS-fuel-4): a radar beam climbs the fresh journey map and the redrawn
    // lanes pop in behind it. Called synchronously after render() (same task, before paint) so the
    // new worlds never flash visible first; cosmetic only — the reducer already settled the redraw.
    if (
      action.type === 'scanRoutes' &&
      state.screen === 'travel' &&
      state.run.seed === prevRunSeed &&
      state.run.routeScans === prevScans + 1
    ) {
      showSectorScan();
    }
    // The voyage-victory takeover (GS-victory) overlays the settled gameover recap on a won run, then
    // dismisses back to it. A cosmetic side-effect (like the ace/bird celebrations) — no reducer/save touch.
    if (enteredGameover && state.run.endedReason === 'won') {
      showVoyageVictory(victoryInfo(), () => render());
    }
    // The Unending-Universe milestone takeover (GS-unending): a full-screen victory screen the moment
    // the survived-hole count crosses 40/60/…/140 (or the hole-150 secret) — over the result screen
    // mid-run, or over the gameover recap if the crossing stop was also the dying one. Same cosmetic
    // side-effect pattern as the voyage victory; the shards/unlocks were already banked by the reducer.
    if (state.run.seed === prevRunSeed && state.run.holesSurvived > prevHoles && holeGateArmed(state.run)) {
      const crossed = endlessMilestonesCrossed(prevHoles, state.run.holesSurvived);
      // Shards AND cosmetic unlocks are LIFETIME-once: a re-crossed milestone still fires the
      // celebration, but banks nothing (the sim's lifetime gate paid 0) and re-announces no reward.
      const shards = endlessMilestoneShards(prevBestHoles, state.endlessBestHoles);
      const unlocked = endlessUnlocksCrossed(prevBestHoles, state.endlessBestHoles);
      const secret = unlocked.find((u) => u.secret);
      const top = crossed[crossed.length - 1];
      if (top || secret) {
        const holes = secret && (!top || secret.holes > top.holes) ? secret.holes : top!.holes;
        const u = secret ?? unlocked[unlocked.length - 1];
        showEndlessMilestone(
          {
            holes,
            shards,
            unlock: u
              ? {
                  name: u.name,
                  detail: u.kind === 'ship' ? 'Parked in every golfer’s Clubhouse garage' : 'Wear it from the Clubhouse — earned, never sold',
                  color: '#4fe08a',
                  secret: u.secret,
                }
              : undefined,
            bar: `Next set: ${endlessSetLabel(endlessSetGateOverPar(state.run.stopIndex))} or better`,
            seed: state.run.seed,
          },
          () => render(),
        );
      }
    }
  } catch (err) {
    recover(err);
  }
}





// --- interactive playing screen ----------------------------------------------
let animatedShots = 0; // shots of the current hole already animated
let animHoleIndex = -1;
let animatedPutts = 0; // putts of the current hole already animated
let selClubId: string | null = null;
// The per-shot aim mode (GS-default-aim). Seeded from the player's persisted `aimMode` preference
// each new shot (default 'auto' — the smart down-the-hole assist); the in-play ◎ button and the
// settings pill change it. A free-drag aim (`selFreeTarget`) overrides it for that shot.
let selAim: AimMode = 'auto';
// Cycle order for the in-play aim-mode button + labels/icons shared by the button, its title, the
// power HUD note, and the settings pill (GS-default-aim).
const AIM_MODES: readonly AimMode[] = ['auto', 'attack', 'safe'] as const;
function aimModeMeta(m: AimMode): { icon: string; label: string; note: string } {
  if (m === 'attack') return { icon: '🚩', label: 'Attack the flag', note: 'aim: flag' };
  if (m === 'safe') return { icon: '🛟', label: 'Play safe', note: 'aim: safe' };
  return { icon: '◎', label: 'Auto aim', note: 'aim: auto' };
}
// Fringe/apron putt (GS-fringe-putt): when the ball is just off the green, putting with the pace
// meter is offered (and is the default) instead of an awkward full-swing chip — `selPutt` toggles
// between the putt meter and the normal shot gesture. Reset each new shot to the lie's natural choice.
let selPutt = false;
// Manual-putt lateral AIM (yards, + = right of the ball→cup line; GS-greens-3). The player nudges it
// with ◄/► to read the slope BREAK; a green-reading caddy (Mystic Mole) snaps it to the ideal line.
// `null` = not yet set this putt (seeded from the caddy/flat default on first render of a putt).
let selPuttAim: number | null = null;
let puttAimResolved = 0; // the aim (yd) shown this render — read by the commit handler so they match
let lastPuttKey = ''; // `${holeIndex}:${putts}` — resets the aim for each new putt
// Aim-nudge feel (GS-putt-feel): the ◄/► step + clamp scale with the putt (set each putt render), so a
// long, big-breaking putt is reachable and not 30 taps to dial in. Consecutive quick taps accelerate
// (streak below); press-and-hold auto-repeats (wired on the buttons).
let puttAimStep = 0.4; // base yd per tap for this putt (grows with distance, ≤1yd)
let puttAimMax = 12; // ± clamp for this putt (grows with the break to read)
let puttAimLastTapMs = 0;
let puttAimStreak = 0;
let decisionShotCount = -1; // shots taken when the current club selection was defaulted

// Free-aim target (course-space) from the pull-to-power gesture; overrides attack/safe when set.
let selFreeTarget: [number, number] | null = null;
// Pull-to-power gesture (GS-power): the player presses the map and drags DOWN to charge power
// (1=full swing, dialable down to a soft tap and — with Overdrive — past 100%), sliding sideways to
// aim, then releases to fire. `selPower` is the live charge (1 at rest so the cone previews a full
// swing); `selAimBearing` is the aim line (deg), seeded to the pin each shot and nudged by the drag.
let selPower = 1;
let selAimBearing: number | null = null;
let charging = false; // true while a pull gesture is loading (suppresses the result-popup wiring race)
// Map navigation (local view state, reset per shot). `follow` zooms the camera onto the
// contemplated shot (the default); `whole` fits the ENTIRE hole so you can read the green and
// the full layout on a long hole. `mapZoom` (>1 = closer) and `mapPan` (a course-space offset
// added to the focus) let you zoom and drag the follow-cam around to look ahead. Drag pans the
// map UNLESS free-aim is active (then drag aims) — so "move the map around" is the default touch.
let mapView: 'follow' | 'whole' = 'follow';
let mapZoom = 1;
// The follow-cam radius (course yds) the decision map is CURRENTLY framed at — captured on every
// decision render and handed to the shot animation so the release→watch cut keeps the exact zoom
// the player was aiming at (the "zoom skip-jump on release" bug). null in whole-hole view (no
// follow radius to match) and before any decision has rendered (resume) — those fall back to the
// travel-framed reach.
let decisionRadius: number | null = null;
// The framing for the aim/putt weather overlay's animated world-decor (moving Cetus river / drifting
// ship junk / meteor strikes, GS-cetus-flow / GS-ship-feel / GS-meteor-strikes). Set by the shot-
// decision + putt branches to the SVG map's exact projector options so the overlay canvas lines the
// decor up pixel-for-pixel with the map beneath. `drift` is off on the putt screen (the tight green
// zoom floats the ship debris weirdly). null (whole-hole fit / no decision yet) ⇒ no aligned decor.
let overlayDecor: { mapProj: ProjectOptions; drift: boolean; meteorScorch: boolean } | null = null;
// The putt screen's framed radius — the putt cousin of decisionRadius: handed to the putt animation
// so the strike→watch cut keeps the exact green zoom instead of popping out to a fixed radius (the
// "weird zoom on the green" bug). Fixed per putt (aim-nudge-independent) so the camera holds still.
let puttViewRadius: number | null = null;
// Surgical refresh for aim nudges: redraws the putt map SVG + the aim readout IN PLACE, without a
// full render() — a full render remounts the pace meter (resetting its sweep) on every tap, which
// made reading a long break slow and painful. Assigned by the putt branch; buttons call it.
let puttAimRefresh: (() => void) | null = null;
// Surgical refresh for the pull-to-power gesture (the shot-decision sibling of puttAimRefresh): the
// power pull redraws ONLY the spray-cone overlay group + the power/legend HUD text IN PLACE, never a
// full render() — a full render rebuilt the whole scene (flora, rough gradient, green contour art)
// on every rAF drag frame, which lagged hard on close chips/putts (the heavy GS-rough-gradient
// scene, brutal when pinch-zoomed). Assigned by the shot-decision branch (focus/follow mode only,
// where the camera holds still for the whole decision); null in whole-hole fit mode, where the
// gesture falls back to scheduleRender(). See renderShotOverlaySVG.
let shotAimRefresh: (() => void) | null = null;
// The screen modules' view state (shopView / marketView / clubhouseView / travelView / introView /
// installView) lives with its screen in src/app/*; the wiring below mutates those exported objects.
let mapPan: [number, number] = [0, 0];
// Shot-result popup: after a non-terminal shot settles, freeze on a result card + Continue
// before the next decision, so each shot gets its own beat. Module-level (a timed view
// effect, not reducer state — like animatedShots above).
let awaitingShotPopup = false;
let popupTimer = 0;
// The manual-putt pace meter (a time/DOM side-effect, like the play view) — mounted on the putt
// screen, torn down on any dispatch.
let puttMeter: PuttMeterHandle | null = null;

function pendingAnimation(play: NonNullable<UiState['play']>): { shots: typeof play.shots; putts: typeof play.puttLogs } | null {
  const newShots = play.shots.slice(animatedShots);
  const newPutts = play.puttLogs.slice(animatedPutts);
  if (newShots.length === 0 && newPutts.length === 0) return null;
  return { shots: newShots, putts: newPutts };
}

/** A free-aim target along an aim BEARING (deg, cw from up) at the club's powered reach. Only the
 *  BEARING feeds the shot physics now (power sets the carry), so the distance just places the on-screen
 *  target/cone sensibly. Pure. */
function targetFromBearing(
  play: NonNullable<UiState['play']>,
  clubCarry: number,
  bearingDeg: number,
  powerFrac: number,
): [number, number] {
  const R = Math.max(8, clubCarry * biomeCarryMult(play.hole) * powerFrac);
  const rad = (bearingDeg * Math.PI) / 180;
  return [play.ball[0] + Math.sin(rad) * R, play.ball[1] + Math.cos(rad) * R];
}

/** The selected club's nominal carry (for the aim-target reach), resolved from the lie-legal bag. */
function selectedClubCarry(play: NonNullable<UiState['play']>): number {
  const bag = usableBag(state.run.loadout.bag, play.lie, state.run.loadout.driverAnywhere ?? false);
  const c = bag.find((cl) => cl.id === selClubId) ?? bag[0]!;
  return c.carry;
}

let renderScheduled = false;
/** rAF-throttle re-render so a fast drag doesn't rebuild the DOM faster than the screen refreshes. */
function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

/**
 * Wire the unified PULL-TO-POWER shot gesture on the decision map (GS-power). One smooth action that
 * replaces the old aim-then-pull-the-button flow: press anywhere on the map, drag DOWN to charge
 * POWER (the spray cone grows from a soft tap toward the full-swing cone — `selPower`), slide
 * sideways to AIM (nudges the aim bearing — `selAimBearing`), then release to FIRE. Releasing with
 * power back near zero — a plain tap, or a charge pulled back up — CANCELS without a shot, so a stray
 * touch never fires. Two fingers PINCH-zoom the map (kept). Pointer-move/up listen on `window` so the
 * gesture survives the per-frame re-render that replaces the map element.
 *
 * Only the BEARING + power feed the sim; distance comes from club×power, so no projector/unproject is
 * needed (the old free-aim tap-the-point model is gone — you aim by sliding while you charge).
 */
function wireShotGesture(app: HTMLElement): void {
  if (state.screen !== 'playing' || !state.play || awaitingShotPopup) return;
  // Only the full-shot decision screen — not the green putt, nor a fringe putt the player chose.
  if (state.play.done || awaitingPutt(state.play) || (canPuttFringe(state.play) && selPutt)) return;
  const svg = app.querySelector<SVGSVGElement>('[data-map] svg');
  if (!svg) return;
  const play = state.play;
  const maxPower = maxPowerOf(state.run.loadout);
  const PULL_RANGE = 150; // px of downward drag for 100% power
  const AIM_SENS = 0.34; // degrees of aim nudge per px of horizontal drag
  const COMMIT = 0.06; // release below this power = cancel (a tap, or pulled back to zero)
  const ENGAGE_SLOP = 6; // px a single finger must move before a power charge engages (pinch window)
  const STALE_MS = 700; // a pending single finger older than this is treated as a dropped/stale gesture
  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let startBearing = 0;
  let gestureStart = 0; // performance.now() when the current single-finger gesture began (staleness)
  let pending = false; // a single finger is down but the charge hasn't engaged yet (pinch window)
  let active = false; // a single-finger charge is loading
  let pinch: { startDist: number; startZoom: number } | null = null;
  let lastNotch = 0;

  const twoFingerDist = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  // Apply a drag (client coords) → live power + aim bearing, and re-render so the cone + HUD track.
  const applyDrag = (x: number, y: number): void => {
    selPower = Math.max(0, Math.min(maxPower, (y - startY) / PULL_RANGE));
    selAimBearing = startBearing + (x - startX) * AIM_SENS;
    selFreeTarget = targetFromBearing(play, selectedClubCarry(play), selAimBearing, Math.max(selPower, 0.12));
    charging = true;
    // A ratcheting haptic as the power loads (every 20%).
    const notch = Math.floor(selPower * 5);
    if (notch !== lastNotch) {
      lastNotch = notch;
      haptic(6);
    }
    // Surgical cone/HUD refresh (focus/follow mode) instead of a full scene rebuild per drag frame —
    // the decision-lag fix. Whole-hole mode has no stable focus projector, so it falls back to a
    // full render.
    if (shotAimRefresh) shotAimRefresh();
    else scheduleRender();
  };
  const detach = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    document.removeEventListener('visibilitychange', onHide);
  };
  // Belt-and-braces for a screen-sleep that drops the pointer events entirely: if the tab goes
  // hidden mid-charge, abandon the gesture so we come back to a clean slate (some browsers don't
  // fire pointercancel on background). Attached only while a gesture is live, removed in detach.
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') cancel();
  };
  // Abandon the gesture WITHOUT firing — used by pointercancel and tab-hide. The browser fires
  // pointercancel when the screen sleeps / the touch is interrupted mid-charge; routing that to
  // `up` (which fires when selPower ≥ COMMIT) shot the ball off on its own — the "accidental tiny
  // power shot" on reopen. A cancel always resets and restores the resting full-swing cone.
  function cancel(): void {
    pointers.clear();
    pinch = null;
    pending = false;
    active = false;
    charging = false;
    selPower = 1;
    detach();
    scheduleRender();
  }
  const move = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
    if (pinch) {
      const d = twoFingerDist();
      if (d > 0 && pinch.startDist > 0) {
        mapZoom = Math.min(4, Math.max(0.4, pinch.startZoom * (d / pinch.startDist)));
        scheduleRender();
      }
      return;
    }
    if (active) {
      applyDrag(e.clientX, e.clientY);
      return;
    }
    // A single finger is down but the charge hasn't committed yet: only ENGAGE once it has moved
    // past a small slop. That leaves a window for a SECOND finger to land first and be read as a
    // pinch — so two-finger zoom no longer trips the pull-to-shot (which used to fire on touch).
    if (pending && pointers.size === 1 && Math.hypot(e.clientX - startX, e.clientY - startY) > ENGAGE_SLOP) {
      pending = false;
      active = true;
      charging = true;
      applyDrag(e.clientX, e.clientY);
    }
  };
  function up(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null; // dropped below two fingers → end the pinch
      if (pointers.size === 0) {
        active = false;
        charging = false;
        detach();
      }
      return;
    }
    if (pointers.size > 0) return; // still a finger down — wait
    const fire = active && selPower >= COMMIT;
    const target = selFreeTarget ?? undefined;
    const power = selPower;
    pending = false;
    active = false;
    charging = false;
    selPower = 1; // reset the preview baseline (a full-swing cone) for the next decision
    detach();
    if (fire) {
      haptic(HAPTICS.swing);
      dispatch({ type: 'shot', clubId: selClubId!, aim: selAim, target, power });
    } else {
      scheduleRender(); // cancelled — restore the resting full-swing cone
    }
  }
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const now = performance.now();
    // Clear pointers left by a gesture whose up/cancel never arrived (e.g. the screen slept mid-touch
    // and the OS dropped the release) — without this a leftover entry made the first fresh tap read as
    // a second finger → a spurious pinch. A LIVE gesture (active/pinch) keeps its pointers; a PENDING
    // first finger is only treated as stale once it's OLD, otherwise clearing here would drop it and
    // misread a genuine pinch's second finger as a fresh single-finger charge (never reaching size 2).
    if (!active && !pinch && (!pending || now - gestureStart > STALE_MS)) {
      pointers.clear();
      pending = false;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      startX = e.clientX;
      startY = e.clientY;
      // Seed the aim bearing from the current aim (the pin by default, or the last nudge).
      startBearing = selAimBearing ?? bearing(play.ball, pinOf(play.hole));
      // PENDING, not charging yet: the charge engages only once the finger drags past ENGAGE_SLOP
      // (see `move`), leaving room for a second finger to start a pinch first. The resting
      // full-swing cone stays up until then — a tap that never moves does nothing (no flicker).
      pending = true;
      active = false;
      lastNotch = 0;
      gestureStart = now;
      selPower = 0; // charge starts empty so a no-pull release reads as a cancel (no accidental shot)
      resumeAudio();
    } else if (pointers.size === 2) {
      pinch = { startDist: twoFingerDist(), startZoom: mapZoom };
      pending = false;
      active = false; // a second finger cancels any pending charge → pinch-zoom instead
      selPower = 1;
      charging = false;
      scheduleRender();
    }
    // Same fn refs each time → addEventListener de-dupes, so multiple pointers don't stack handlers.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('visibilitychange', onHide);
  });
}

// Decision/putt map geometry — portrait so the map fills the screen. The reach factor zooms the
// follow-cam in on the contemplated shot (smaller = tighter); the playable corridor fills the
// frame and the rough/OB legitimately stretch off-screen.
const DMAP_W = 360;
const DMAP_H = 640;
// Ball sits LOW — near the bottom of the map, just above the floating bottom control panel — so
// nearly the whole frame is the shot AHEAD. At 0.72 the ball read too high and the top of a
// max-distance shot landed at ~4% from the top, tucked behind the top info-chip / at the very top
// edge, forcing a manual zoom-out on every full swing. Dropping it to 0.84 reclaims the wasted
// space that was showing terrain BEHIND the ball, so the full arc for the longest club lands at
// ~16% from the top — clear of the HUD and visible without zooming out. (The ball still clears the
// bottom panel, which floats over roughly the bottom ~10% of the map.)
const DMAP_BIAS = 0.84;
/** View radius (course yds) framing a shot of max-carry `carryHigh`. Tuned with DMAP_BIAS so the
 *  contemplated shot nearly fills the height and the corridor fills the width — the rough/OB
 *  stretch off-screen (the "zoom in, let the hole run off the edges" ask). */
function decisionReach(carryHigh: number): number {
  return Math.max(30, carryHigh * 0.36);
}

/** Reset the map view to the default follow-cam (called on a new shot / new hole). */
function resetMapView(): void {
  mapView = 'follow';
  mapZoom = 1;
  mapPan = [0, 0];
}

/** Whether the view has been moved off the default follow-cam (so we offer a Recenter button). */
function mapViewMoved(): boolean {
  return mapView !== 'follow' || mapZoom !== 1 || mapPan[0] !== 0 || mapPan[1] !== 0;
}

/**
 * The decision/aim map projector options, derived from the current map-nav state. SHARED by the
 * decision render AND `wireMapAiming`'s unproject so tap/drag aiming can never drift from what's
 * drawn (the projector-sync gotcha). `whole` mode fits the entire hole; `follow` zooms the camera
 * onto the contemplated shot, offset by `mapPan` and scaled by `mapZoom`.
 */
function decisionView(play: NonNullable<UiState['play']>, spray: ShotSpread, aimTarget: Vec): ProjectOptions {
  const base: ProjectOptions = { width: DMAP_W, height: DMAP_H };
  if (mapView === 'whole') return base; // whole-hole fit — see the green + full layout (tee→green up)
  const reach = decisionReach(spray.carryHigh) / mapZoom;
  const focus: [number, number] = [play.ball[0] + mapPan[0], play.ball[1] + mapPan[1]];
  // Reorient so the AIM LINE is up-screen (GS-default-aim): the map points DOWN where THIS shot is
  // aimed — down the fairway corridor off the tee, at the flag on an approach — so the default framing
  // and the default aim always AGREE, and it reorients when the aim mode (◎/settings) or a free-drag
  // aim changes. (It used to hardcode tee→PIN, which pointed across a dogleg corner into the trees even
  // when the auto aim went down the fairway.) Degenerate (aim ≈ the ball) falls back to tee→green
  // inside the projector.
  const up: [number, number] = [aimTarget[0] - play.ball[0], aimTarget[1] - play.ball[1]];
  return { ...base, focus, viewRadius: reach, focusBias: DMAP_BIAS, up };
}

// The hole index whose ace has already been celebrated, so the full-screen overlay fires exactly
// once per hole-in-one (the play-view onDone can re-fire on a re-render). Reset per hole in render().
let aceCelebratedHole = -1;
// Same one-shot guard for the eagle/albatross fly-over celebration (a non-ace −2 / −3 hole-out).
let birdCelebratedHole = -1;
// Star Tour (GS-star-tour) auto-advance guard: the hole whose holeComplete has already been scheduled,
// so the "skip the between-hole card, go straight to the next tee" transition fires exactly once per
// hole even though render() runs many times while the ball rests in the cup. Reset per hole in render().
let strokeAutoAdvancedHole = -1;

function playingBody(animating: boolean): string {
  const play = state.play!;
  const v = shotView(play, state.run.loadout);
  const bag = state.run.loadout.bag;
  const par = play.hole.par;

  if (animating) {
    // Full-bleed: the live shot canvas IS the screen. The play view draws the active caddy ITSELF in
    // the bottom-LEFT corner during flight — a guard caddy persistently (so its laser/boomerang
    // redirect originates from the figure), and any other hired caddy transiently while its effect
    // calls out. We do NOT also float the framed gold portrait badge here: the corner figure already
    // shows the caddy, so a badge just rendered the SAME caddy twice (the "caddy shows twice on the
    // shot-watching screen" bug). The portrait still rides the aim-and-charge + putting screens.
    return `
      <div class="gs-shot gs-shot--full">
        <div class="gs-bigmap" id="play"></div>
        ${mapTopInfo(v, { shotNo: play.strokes, distLabel: '…watching…' })}
      </div>`;
  }

  if (play.done) {
    const birdieOrBetter = !play.pickedUp && play.strokes <= par - 1;
    // The end-of-hole screen IS the leaderboard screen now: include the hole just finished (it isn't in
    // stopPlayed until `holeComplete`) and show the live arc standings so you track progress every hole.
    // On a matchplay boss stop the duel HUD is the relevant tracker, so the board is replaced by it.
    const raw = holeResult(play);
    // Team duel BEST-BALL (GS-team-duel), player's side: the partner's parallel ball resolved the
    // moment the hole finished (`withBestBallPartner`) — THIS screen is its reveal. Everything scored
    // below (duel, points, banner) uses the KEPT team ball, exactly what `holeComplete` will record.
    const tSetup = state.match?.setup;
    const partnerHole =
      tSetup?.partnerSide === 'player' && tSetup.format === 'bestball'
        ? state.match?.partnerHoles?.[play.holeIndex]
        : undefined;
    const kept = partnerHole ? betterPlayedHole(raw, partnerHole) : raw;
    const name = kept.pickedUp ? 'Picked up' : scoreName(par, kept.record.strokes);
    const playedSoFar = [...(state.stopPlayed ?? []), kept];
    const lastIsHoled = kept.holed && kept.shots.some((s) => s.holed);
    const stopPts = playTotals(playedSoFar.map((p) => p.record)).stableford;
    // The two big shot/putt vignette cards used to push the score + leaderboard off the bottom of the
    // screen — the actual point of the screen. They're scrapped for a compact banner that headlines the
    // ONLY numbers that matter here: this hole's score and the running points total, with the leaderboard
    // prominent right below it.
    const holePts = stablefordPoints(par, kept.record.strokes);
    const d = kept.pickedUp ? 99 : kept.record.strokes - par;
    const scoreCol = d < 0 ? '#5fd45a' : d === 0 ? 'var(--gs-ink)' : d === 1 ? '#ffce54' : '#ff6b6b';
    // The Asgard tournament (GS-asgard) is STROKE PLAY, so the banner counts GROSS and to-par, not
    // Stableford points — the running gross total is what decides it on The Warrior's Tee.
    const isAsgard = state.run.formatId === ASGARD_FORMAT;
    const grossSoFar = playedSoFar.reduce((s, p) => s + p.record.strokes, 0);
    const toParSoFar = grossSoFar - playedSoFar.reduce((s, p) => s + p.record.par, 0);
    const toParTag = (v: number): string => (v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`);
    const holeLine = isAsgard
      ? `${kept.pickedUp ? 'no return' : d === 0 ? 'level par' : `${toParTag(d)} to par`} this hole`
      : `+${holePts} pt${holePts === 1 ? '' : 's'} this hole`;
    const isAce = play.holed && play.strokes === 1;
    // After the celebration overlay lifts, the end-of-hole screen confirms the ace reward in place.
    const aceNote = isAce
      ? `<div style="margin:0 0 -2px;max-width:460px;background:linear-gradient(180deg,#1c1708,#120f06);border:1px solid rgba(255,213,74,.4);border-radius:12px;padding:9px 14px;font-size:12.5px;color:var(--gs-gold);">⛳ <b>Hole-in-one!</b> +${ACE_CREDIT_BONUS} credits · Ace's Touch (+8% precision) earned for the run.</div>`
      : '';
    const scoreBanner = `
      <div style="display:flex;align-items:center;gap:14px;background:#0d1016;border:1px solid var(--gs-line);border-radius:12px;padding:12px 16px;max-width:460px;">
        <div style="text-align:center;min-width:48px;">
          <div style="font-size:34px;font-weight:800;line-height:1;color:${scoreCol};">${kept.pickedUp ? '—' : kept.record.strokes}</div>
          <div style="font-size:10px;opacity:.55;letter-spacing:.08em;margin-top:3px;">PAR ${par}</div>
        </div>
        <div style="flex:1 1 auto;min-width:0;">
          <div style="font-size:10.5px;opacity:.5;letter-spacing:.1em;">HOLE ${play.holeIndex + 1}${partnerHole ? ' · TEAM BALL' : ''}</div>
          <div style="font-size:18px;font-weight:800;">${name}${lastIsHoled ? ' 🎉' : ''}</div>
          <div style="font-size:12px;opacity:.7;margin-top:1px;">${holeLine}</div>
        </div>
        <div style="text-align:center;border-left:1px solid var(--gs-line-2);padding-left:14px;">
          <div style="font-size:28px;font-weight:800;line-height:1;color:var(--gs-accent);">${isAsgard ? grossSoFar : stopPts}</div>
          <div style="font-size:10px;opacity:.55;letter-spacing:.05em;margin-top:3px;">${isAsgard ? `GROSS · ${toParTag(toParSoFar)}` : 'STOP PTS'}</div>
        </div>
      </div>`;
    const progress = state.run.formatId === STROKEPLAY_FORMAT
      ? // Star Tour (GS-star-tour): a solo records chase — show the running stroke scorecard, not the
        // voyage's ghost competitor board (there is no field to place against).
        strokePlayProgressHTML(playedSoFar)
      : state.run.formatId === ASGARD_FORMAT
      ? // The Asgard tournament (GS-asgard) is STROKE PLAY on The Warrior's Tee, not the 20-golfer
        // Stableford field — show the running lowest-gross standings, its own event.
        asgardLiveBoardHTML(playedSoFar, state.course.holes.map((h) => h.par), `${state.run.seed}`, asgardFieldEdge(state))
      : state.match
      ? holeMatchProgressHTML(playedSoFar)
      : holeGateArmed(state.run)
      ? // The Unending Universe (GS-golf-score): the running GOLF ROUND scorecard replaces the ghost
        // leaderboard — the score you're actually building, hole by hole.
        endlessScoreCard(endlessRoundSoFar(playedSoFar), { title: 'Round so far', next: true })
      : (() => {
          const board = liveLeaderboard(state.run, playedSoFar.length, stopPts);
          const me = board.standings.find((s) => s.isPlayer)!;
          const place = `<p style="font-size:13px;margin:.4em 0 .5em;">You're <b style="color:${me.position <= 3 ? '#5fd45a' : me.position <= board.standings.length / 2 ? '#ffce54' : '#ff6b6b'};">${ordinal(me.position)}</b> of ${board.standings.length} · ${board.thru} hole${board.thru === 1 ? '' : 's'} in.</p>`;
          return place + leaderboardHTML(board, { live: true });
        })();
    return `
      ${header()}
      <div style="position:relative;">${birdieOrBetter ? burst() : ''}</div>
      ${aceNote}
      ${partnerHole ? `<div style="margin:0 0 12px;">${bestBallRevealHTML(raw, partnerHole, par)}</div>` : ''}
      ${scoreBanner}
      <div style="margin:12px 0;max-width:460px;">${progress}</div>
      <div style="margin-top:8px;">${btn('Continue →', { type: 'holeComplete' }, { variant: 'primary' })}</div>`;
  }

  // Detect a NEW shot ONCE per shot, BEFORE the fringe-putt early-return below — so the per-shot
  // defaults (club/aim/power and the putt-vs-chip choice) AND `decisionShotCount` are committed even
  // when the putt screen is the first thing that renders for this shot. (Bug: landing near the green
  // defaults `selPutt` to the putter, so the putt screen returned early and never advanced
  // `decisionShotCount`; tapping "Chip instead" then re-tripped `newShot`, which snapped `selPutt`
  // straight back to the putter and re-disabled the chip gesture — you had to toggle putt→chip twice.)
  const newShot = play.shots.length !== decisionShotCount;
  if (newShot) {
    decisionShotCount = play.shots.length;
    selClubId = null;
    selAim = getSettings().aimMode; // the player's default aim assist (GS-default-aim), 'auto' by default
    selFreeTarget = null;
    selPower = 1; // seeded sensibly below once the club is known; full swing is the fallback
    selAimBearing = null; // re-seed the aim to the pin for the new shot
    selPutt = canPuttFringe(play); // just off the green → default to the putter (a Texas wedge)
    resetMapView();
  }

  // Manual putting — on the green, or a chosen fringe/apron "Texas wedge" (GS-fringe-putt): stroke
  // putts one at a time with the pace meter, instead of the awkward full-swing chip the apron forced.
  const fringePutt = canPuttFringe(play) && selPutt;
  if (awaitingPutt(play) || fringePutt) {
    // Frame the putt on the ball→cup line: centre the view on the MIDPOINT of the two and size it
    // to the putt length, so the cup and ball both sit on-screen with even margin — not the ball
    // dead-centre with the green (and a lot of dead rough) shoved to one edge.
    const puttPin = pinOf(play.hole);
    const puttMid: [number, number] = [
      (play.ball[0] + puttPin[0]) / 2,
      (play.ball[1] + puttPin[1]) / 2,
    ];
    // Putt BREAK (GS-greens-3): the slope curls the putt; the player aims HIGH to read it. A
    // green-reading caddy (Mystic Mole) snaps the aim to the ideal line for you; otherwise it starts
    // straight and you nudge ◄/► to find the read. The drawn dotted curve uses the SAME break model
    // as the resolver, so the line you see is the line the ball takes.
    // Reset the aim for each NEW putt (a fresh break to read), preserved across aim-nudge re-renders.
    const puttKey = `${play.holeIndex}:${play.putts}`;
    if (puttKey !== lastPuttKey) {
      selPuttAim = null;
      lastPuttKey = puttKey;
    }
    const slope = play.hole.greenSlope;
    // GS-green-contour: the contour lobes fold into every read here — ideal aim, net break, the bow
    // the frame must hold, and the drawn line — through the same sim field the resolver integrates.
    const contour = play.hole.greenContour;
    const ideal = idealPuttAim(play.ball, puttPin, slope, contour);
    const reads = !!state.run.loadout.greenRead;
    if (selPuttAim === null) selPuttAim = reads ? ideal : 0;
    const puttAim = reads ? ideal : selPuttAim;
    puttAimResolved = puttAim; // read by the commit handler so the struck aim matches the drawn line
    const breakYd = puttBreakYd(play.ball, puttPin, slope, MANUAL_IDEAL_PACE, contour);
    const bow = puttBreakBow(play.ball, puttPin, slope, contour);
    // A real double-breaker (the curve bows meaningfully BOTH sides of the line) gets called out in
    // the read row — its net break alone under-sells the S.
    const doubleBreak = bow.max > 0.35 && bow.min < -0.35;
    // GS-putt-depth: how far up the line the putter can CONFIDENTLY read. A green-reading caddy (Mystic
    // Mole) sees the whole break; otherwise the confident read ends at the putter's range, and the line
    // fades beyond it. Same range the resolver uses (puttSkillOf), so the picture matches the physics.
    const puttLen = v.distToPin;
    const puttReadRange = puttSkillOf(state.run.loadout).puttRange ?? DEFAULT_PUTT_RANGE;
    const puttReadFrac = reads ? 1 : Math.min(1, puttReadRange / Math.max(1e-3, puttLen));
    // Aim range/step scaled to THIS putt so a long, big-breaking putt is reachable and quick to dial in
    // (a fixed ±12 clamp / 0.4-yd step made a long sidehiller impossible AND painfully slow). The clamp
    // comfortably exceeds the break you'd need to cancel (floored at the old ±12); the step covers the
    // range in ~a dozen taps but stays ≤1yd so a single tap is still precise (the cup's HOLE_OUT_RADIUS
    // 1.2yd is the bar) — press-and-hold / tap bursts carry the long hauls.
    puttAimMax = Math.max(12, Math.abs(ideal) * 1.6 + 4);
    puttAimStep = Math.max(0.4, Math.min(1, puttAimMax / 14));
    // Frame the putt to cover the ball↔cup span PLUS the break's lateral swing — on a steep green the
    // curved line used to bow outside a distance-only radius. Keyed to the break BOW (aim-INDEPENDENT;
    // GS-green-contour: a double-breaker bows both ways, wider than its net break) so the zoom holds
    // perfectly still while the player nudges the read.
    const puttRadius = Math.max(5.5, v.distToPin * 0.6 + 3 + Math.min(14, Math.max(bow.max, -bow.min)) * 0.6);
    puttViewRadius = puttRadius;
    const buildPuttSvg = (aim: number) => renderHoleSVG(play.hole, {
      // No flight tracers here (GS-tracer bug fix): on the tight green-zoom the prior shots' curved
      // Bézier flight lines projected across the tiny view, smearing tracer arcs "all over the green".
      // The putt screen is the ball↔cup line — the approach tracers belong to the whole-hole decision view.
      biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
      rainbow: rainbowActive(),
      tradeTents: tentsActive(),
      meteorScorch: scorchActive(),
      groundPatch: patchActive(),
      width: DMAP_W,
      height: DMAP_H,
      ball: play.ball,
      // Zoom in on the ball↔cup span (midpoint-centred) so both ends frame with even margin. A lower
      // floor lets a SHORT putt actually zoom in (the old flat 9-yd floor left a tap-in tiny in a big
      // view); the +3 keeps a little green around the cup so the break/hole read has context.
      focus: puttMid,
      viewRadius: puttRadius,
      focusBias: 0.5,
      // Cup up-screen, ball below — the putt reads bottom-to-top (matches the pace meter).
      up: [puttPin[0] - play.ball[0], puttPin[1] - play.ball[1]],
      puttPath: puttPathPreview(play.ball, puttPin, slope, aim, MANUAL_IDEAL_PACE, contour),
      puttReadFrac,
    });
    const puttSvg = buildPuttSvg(puttAim);
    // Nudging the aim redraws the break line + readout IN PLACE (never a full render(), which would
    // remount the pace meter and reset its sweep). Only the BREAK-LINE overlay group is swapped — NOT
    // the whole scene: rebuilding the flora + green contour art (isolines, Tanaka lighting) on every
    // hold-repeat tick is what made an aim nudge lag hard, brutally so when the page is pinch-zoomed
    // (each swap re-rasterises the zoomed SVG). The framing is aim-independent, so the overlay reuses
    // the exact focus/zoom the map was built at; the weather canvas over the same .gs-bigmap survives.
    const puttUp: [number, number] = [puttPin[0] - play.ball[0], puttPin[1] - play.ball[1]];
    // Arm the putt overlay's animated decor — meteor STRIKES keep animating on the craters (sky, fine
    // zoomed in), but `drift` is OFF: the course-space Cetus river / ship junk float weirdly on the
    // tight green zoom (the reported "very small … looks super weird" bug). The projector is the putt
    // map's exact focus/zoom so a strike still lands on a drawn crater.
    overlayDecor = {
      mapProj: { width: DMAP_W, height: DMAP_H, focus: puttMid, viewRadius: puttRadius, focusBias: 0.5, up: puttUp },
      drift: false,
      meteorScorch: scorchActive(),
    };
    puttAimRefresh = () => {
      const aim = selPuttAim ?? 0;
      puttAimResolved = aim;
      const overlay = document.getElementById(PUTT_OVERLAY_ID);
      if (overlay) {
        overlay.outerHTML = renderPuttOverlaySVG(play.hole, {
          width: DMAP_W,
          height: DMAP_H,
          focus: puttMid,
          viewRadius: puttRadius,
          focusBias: 0.5,
          up: puttUp,
          puttPath: puttPathPreview(play.ball, puttPin, slope, aim, MANUAL_IDEAL_PACE, contour),
          puttReadFrac,
        });
      } else {
        // Overlay not found (defensive: first paint / DOM churn) — fall back to the full SVG swap.
        const svgEl = document.querySelector('.gs-bigmap[data-weather="putt"] svg');
        if (svgEl) svgEl.outerHTML = buildPuttSvg(aim);
      }
      const label = document.getElementById('puttaimlabel');
      if (label) label.innerHTML = puttAimLabel(breakYd, aim, doubleBreak);
    };
    // Manual putt = a pace meter: stop the sweeping marker in the green MAKE band to sink it.
    // Tapping the meter OR the Putt button captures the pace. Full-bleed: the map fills the screen,
    // the meter + Putt float in a bottom panel.
    return `
      <div class="gs-shot gs-shot--full">
        <div class="gs-bigmap" data-weather="putt">${puttSvg}</div>
        ${mapTopInfo(v, { shotNo: play.strokes + play.putts + 1, distLabel: `<b>${v.distToPin}</b>y · putt <b>${play.putts + 1}</b>` })}
        <div class="gs-hud gs-hud-bottom">
          ${caddyBadgeHTML(puttCaddyId())}
          <div class="gs-hud-controls gs-glass">
            <p style="font-size:11px;opacity:.7;margin:0;line-height:1.35;">${fringePutt ? 'Putting from the fringe — ' : ''}Read the <b>break</b>, aim, then tap the meter in the green <b>MAKE</b> band.${puttReadFrac < 0.999 ? ` <span style="opacity:.85;">Your read line <b>ends at ${Math.round(puttReadRange)}y</b> — past it you're guessing; a better putter reads further.</span>` : ''}</p>
            ${puttAimRow(breakYd, puttAim, reads, doubleBreak)}
            <div id="puttmeter"></div>
            <button class="gs-btn gs-btn--primary" data-putt-commit="1" style="margin:0;padding:11px;">⛳ Putt</button>
            ${fringePutt ? `<button class="gs-btn gs-btn--ghost" data-putt-toggle="0" style="margin:6px 0 0;padding:9px;">⛳→🏌 Chip instead</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Decision screen: map with shots so far + ball marker, the aiming spray cone, and controls.
  // (The per-shot club/aim/power/putt defaults are seeded above, before the fringe-putt return.)
  // Only lie-legal clubs are selectable (driver tee-only unless the Driver Dan caddy unlocks it).
  const usable = usableBag(bag, play.lie, state.run.loadout.driverAnywhere ?? false);
  // The EXPLICIT suggestion affordances are a Suggestible Sam caddy perk (GS-caddy): the 🎯 snap-back
  // button, the legend's `suggested: …` readout, the 🎒 yardage read, and the confidence scoring edge
  // only appear with Sam. But the DEFAULT-selected club is the green-coverage pick for EVERYONE — its
  // whole job is to stop you flying the green, so handing the base flow the longest club (an overshoot
  // by default) was an overcorrection. Sam sells the precise read + confidence, not "don't overshoot".
  const hasSuggest = !!state.run.loadout.clubSuggest;
  const onGreenPutter = v.lie === 'green' && usable.some((c) => c.id === 'putter');
  // The green-coverage suggestion. Putter is the obvious green default for everyone — that's not a
  // "suggestion", just the only sensible flat-stick choice. This is Sam's 🏌 snap-to club (the pin
  // attack), independent of the aim mode.
  const suggested = onGreenPutter ? 'putter' : v.attackClubId;
  // Default selection: putter on the green, else the club that fits the DEFAULT AIM (GS-default-aim) —
  // the auto/safe positioning club off the tee, the green-coverage club when attacking the flag — so
  // the pre-armed club matches where we're pre-aimed. You can still cycle/override.
  const defaultClubId = onGreenPutter
    ? 'putter'
    : selAim === 'safe'
      ? v.safeClubId
      : selAim === 'auto'
        ? v.autoClubId
        : v.attackClubId;
  if (selClubId === null || !usable.some((c) => c.id === selClubId)) selClubId = defaultClubId;
  const maxPower = maxPowerOf(state.run.loadout);
  // Seed the at-rest preview POWER on a NEW shot so the default cone lands AT the target rather than
  // always flying a full swing (bug fix): for a short chip the shortest club at full power overshoots
  // the green entirely, so the green/amber/red arc read "nowhere near where the ball lands". Scaling
  // the at-rest power to (distance-to-pin ÷ the club's full expected carry) puts the cone on the pin;
  // a normal approach (target past the club's reach) clamps the ratio to 1 — a full swing, as before.
  // The player still pulls to override; the gesture charges from 0 on press regardless. Floored just
  // above the release-cancel threshold (not 0.25) so a genuinely SHORT greenside chip defaults to the
  // pin instead of the shortest wedge's 25%-power overshoot (GS-chip-cone) — the honest cone then
  // reads true right down to a few-yard chip.
  if (newShot && selClubId !== 'putter' && !selPutt) {
    const full = previewShot(play, { clubId: selClubId, aim: selAim, power: 1 }, state.run.loadout);
    if (full.expectedCarry > 1) {
      const want = dist(play.ball, pinOf(play.hole));
      selPower = Math.max(0.1, Math.min(1, want / full.expectedCarry));
    }
  }
  // The gesture's aim/power feed the shot: a target along the (gesture-nudged) aim bearing, at the
  // live charge power. `selPower` is 1 at rest (a full-swing cone previews) and animates 0→pull as
  // you charge. The cone the player sees is this powered shot; releasing fires it (GS-power).
  const decision = { clubId: selClubId, aim: selAim, target: selFreeTarget ?? undefined, power: selPower };
  const spray = previewShot(play, decision, state.run.loadout);
  // Backspin helper line (GS-backspin-line): the predicted roll/check from where this shot lands, so a
  // spinning wedge onto a contoured green reads before you hit it. Null for non-backspin clubs (no line).
  const spinPreview = previewBackspin(play, spray, state.run.loadout);
  // Feel escape-hatch: window._gsSpray scales the green centre wedge live (A/B the cone geometry).
  const sprayGeom = (window as unknown as { _gsSpray?: SprayGeomInput })._gsSpray;
  // % of shots per zone — straight off the shot's asymmetric shape, so the legend reads exactly true.
  const pctRound = (x: number) => Math.round(x * 100);
  // Frame the map on the FULL-power PIN-AIM shot — NOT the live charge, and NOT the live drag
  // target either: carryHigh folds in the wind component ALONG the shot bearing, so framing on the
  // dragged target made viewRadius wobble with every pixel of aim slide. A sub-pixel projector
  // change re-projects the whole seeded scene (the decor-jitter-while-pulling bug); the camera
  // must hold perfectly still for the entire decision. Both the render and the gesture build the
  // projector from this same stable spread (projector-sync).
  const frameSpray = previewShot(play, { clubId: selClubId, aim: selAim, power: 1 }, state.run.loadout);
  // Orient the map DOWN the aim line (GS-default-aim): resolve the SAME target the shot will fly (aim
  // mode, or a free-drag aim when set) and point the camera at it, so the framing matches the default
  // aim and reorients when either changes. Power-independent, so it holds steady while the cone charges.
  const orientTarget = resolveAimTarget(
    play,
    { clubId: selClubId, aim: selAim, target: selFreeTarget ?? undefined, power: 1 },
    state.run.loadout,
  );
  const mapOpts = decisionView(play, frameSpray, orientTarget);
  // Remember the follow-cam radius the player is LOOKING AT — the shot animation starts at this
  // exact zoom so releasing the gesture never skip-jumps to a different framing (GS-power).
  decisionRadius = mapOpts.viewRadius ?? null;
  // Arm the aim-overlay's animated world-decor (moving Cetus river / drifting ship junk / meteor
  // strikes) — but only in FOCUS/FOLLOW mode: the whole-hole fit folds `extra` points into its
  // projector that the overlay can't reproduce, so it would misalign (the SVG keeps its static decor
  // there). The decor lines up pixel-for-pixel with this exact map projector.
  overlayDecor = mapOpts.focus ? { mapProj: mapOpts, drift: true, meteorScorch: scorchActive() } : null;
  const svg = renderHoleSVG(play.hole, {
    shots: play.shots,
    shotColor: golferLook()?.cap, // GS-tracer: the player's shot tracer reads the chosen golfer's colour.
    // On a matchplay boss stop, overlay the boss's pre-played line for THIS hole so you see them on the
    // course (where they drove it, where they ended up) — feedback on their ball, not just a number.
    // Best-ball (GS-team-duel) hides it: the hole result is revealed at the end-of-hole cards, and the
    // boss's drawn path would spoil their score mid-hole.
    ghostShots:
      state.match && state.match.setup?.format !== 'bestball'
        ? state.match.bossHoles[play.holeIndex]?.shots
        : undefined,
    biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
    rainbow: rainbowActive(),
    tradeTents: tentsActive(),
    meteorScorch: scorchActive(),
      groundPatch: patchActive(),
    ball: play.ball,
    spray,
    spinPath: spinPreview?.path,
    spinReadFrac: spinPreview?.readFrac,
    fitSpray: frameSpray, // whole-map fit holds still while the live cone charges/aims
    sprayGeom,
    ...mapOpts,
  });
  // Map-nav overlay (floats ON the map so it needs no scrolling): overview/follow toggle, zoom
  // in/out, and a recenter that snaps back to the default follow-cam. Solves "can't see the green
  // / full hole on a long hole" (overview) and "move the map around" (zoom + drag-to-pan).
  const mapCtrls = `
    <div class="gs-mapctrl">
      <button class="gs-mapbtn${mapView === 'whole' ? ' gs-mapbtn--on' : ''}" data-mapview="toggle" title="${mapView === 'whole' ? 'Follow the ball' : 'See the whole hole'}">${mapView === 'whole' ? '🎯' : '🗺'}</button>
      <button class="gs-mapbtn" data-mapzoom="in" title="Zoom in"${mapView === 'whole' ? ' disabled' : ''}>＋</button>
      <button class="gs-mapbtn" data-mapzoom="out" title="Zoom out"${mapView === 'whole' ? ' disabled' : ''}>－</button>
      ${mapViewMoved() ? `<button class="gs-mapbtn" data-mapview="reset" title="Recenter on the ball">⌖</button>` : ''}
      <button class="gs-mapbtn" data-open-settings="1" title="Settings">⚙</button>
    </div>`;
  const cbtn = (label: string, dir: number) =>
    `<button class="gs-btn" data-cycle="${dir}" aria-label="cycle club ${dir > 0 ? 'up' : 'down'}">${label}</button>`;
  // Aim-mode toggle (GS-default-aim): cycle the default aim between the smart auto assist, always-attack
  // the flag, and always-play-safe. It sets the persisted preference AND this shot; a free-drag aim
  // (🎯 clears it) still overrides for the current shot. Hidden while a manual aim is dragged (the 🎯
  // reset owns that state) so the two controls never contradict.
  const aimMeta = aimModeMeta(selAim);
  const aimBtn = selFreeTarget
    ? ''
    : `<button class="gs-btn gs-mini${selAim === 'auto' ? '' : ' gs-btn--on'}" data-aimmode="1" title="Aim: ${aimMeta.label} — tap to change">${aimMeta.icon}</button>`;
  // Club row: ◄ name ► + aim-mode + (re-aim-at-pin when nudged) + (Sam's snap-to-suggested when hired).
  const clubRow = `<div class="gs-clubrow">
      ${cbtn('◄', -1)}
      <span class="gs-clubname">${usable.find((c) => c.id === selClubId)?.name ?? selClubId}</span>
      ${cbtn('►', 1)}
      ${aimBtn}
      ${selFreeTarget ? `<button class="gs-btn gs-mini" data-aimreset="1" title="Re-aim at the pin">🎯</button>` : ''}
      ${hasSuggest ? `<button class="gs-btn gs-mini${selClubId === suggested ? ' gs-btn--on' : ''}" data-suggest="1" title="Use the suggested club">🏌</button>` : ''}
      ${canPuttFringe(play) ? `<button class="gs-btn gs-mini" data-putt-toggle="1" title="Putt from the fringe">⛳</button>` : ''}
    </div>`;
  // Power read-out: the bar fills as you pull DOWN on the map (the cone grows in step); past 100%
  // (with Overdrive) it glows orange as an overpowered shot. Built by a shared inner-HTML builder so
  // the surgical pull refresh (shotAimRefresh) can update it in place without a full render.
  const powerHudInner = (): string => {
    const powerPct = Math.round(selPower * 100);
    const over = selPower > 1.001;
    const powerCol = over ? '#ff8a3d' : selPower >= 0.66 ? '#5fd45a' : selPower >= 0.33 ? '#ffc454' : '#9fd8e6';
    const aimNote =
      selFreeTarget && selAimBearing != null && Math.abs(((selAimBearing - bearing(play.ball, pinOf(play.hole)) + 540) % 360) - 180) > 2
        ? 'aim adjusted'
        : selFreeTarget
          ? 'aim: pin'
          : aimModeMeta(selAim).note;
    return `<div class="gs-powerbar"><span class="gs-powerfill" style="width:${Math.min(100, (selPower / maxPower) * 100).toFixed(0)}%;background:${powerCol};"></span>${maxPower > 1 ? `<span class="gs-power100" style="left:${(100 / maxPower).toFixed(0)}%;"></span>` : ''}</div>
      <div class="gs-powerlabel"><b style="color:${powerCol};">${over ? '⚡ ' : ''}Power ${powerPct}%</b> · ${aimNote} · <span style="opacity:.7;">${charging ? 'release to hit · pull back to cancel' : 'pull DOWN on the map'}</span></div>`;
  };
  const powerHud = `<div class="gs-power" id="gs-powerhud">${powerHudInner()}</div>`;
  // Condensed spray odds + carry range (the cone on the map carries the detail). Sam (if hired) adds a
  // compact green-depth + forced-carry read on its own line.
  let samRead = '';
  if (hasSuggest && play.lie !== 'green') {
    const gd = greenDepth(play.hole, play.ball);
    const fc = forcedCarry(play.hole, play.ball, pinOf(play.hole));
    const carryTxt = fc ? ` · <span style="color:var(--gs-warn);">⚠ carry <b>${fc.carry}</b> ${hazardLabel(fc.kind)}</span>` : '';
    samRead = `<div class="gs-legend-line" style="opacity:.9;">🎒 ${Math.round(gd.front)}·${Math.round(dist(play.ball, play.hole.green))}·${Math.round(gd.back)}y${carryTxt}</div>`;
  }
  const legendInner = (sp: ShotSpread): string => {
    const shp = sp.shape;
    return `<span style="color:#5fd45a;">●</span> ${pctRound(shp.green)}% ·
      <span style="color:#ffc454;">●</span> ${pctRound(shp.hookL)}/${pctRound(shp.sliceR)}% ·
      <span style="color:#ff4c4c;">●</span> ${pctRound(shp.duckHookL)}/${pctRound(shp.shankR)}% ·
      <b>${Math.round(sp.carryLow)}–${Math.round(sp.carryHigh)}y</b>`;
  };
  const legend = `<div class="gs-legend-line" id="gs-shotlegend">${legendInner(spray)}</div>`;
  // Wire the surgical pull-to-power refresh (the decision-lag fix). FOCUS/FOLLOW mode only: the
  // camera is framed on the stable full-power spread and holds still for the whole decision, so the
  // cone overlay re-projects against the SAME framing without rebuilding the scene. Whole-hole fit
  // mode has no stable focus projector (its fit folds in per-frame extras) → null → full render. The
  // recomputed spray/HUD are byte-identical to what a full render() would draw for the same charge.
  shotAimRefresh =
    mapView === 'whole'
      ? null
      : () => {
          const overlay = document.getElementById(SHOT_OVERLAY_ID);
          if (!overlay) {
            scheduleRender();
            return;
          }
          const sprayNow = previewShot(
            play,
            { clubId: selClubId!, aim: selAim, target: selFreeTarget ?? undefined, power: selPower },
            state.run.loadout,
          );
          const spinNow = previewBackspin(play, sprayNow, state.run.loadout);
          overlay.outerHTML = renderShotOverlaySVG(play.hole, {
            width: DMAP_W,
            height: DMAP_H,
            focus: mapOpts.focus,
            viewRadius: mapOpts.viewRadius,
            focusBias: mapOpts.focusBias,
            up: mapOpts.up,
            spray: sprayNow,
            spinPath: spinNow?.path,
            spinReadFrac: spinNow?.readFrac,
            sprayGeom,
            biome: holeBiome(play.hole),
            themeId: holeThemeId(play.hole),
            tradeTents: tentsActive(),
          });
          const hud = document.getElementById('gs-powerhud');
          if (hud) hud.innerHTML = powerHudInner();
          const leg = document.getElementById('gs-shotlegend');
          if (leg) leg.innerHTML = legendInner(sprayNow);
        };
  // The hired caddy, framed in the bottom-left so it stands out (GS-fullmap). The figure is drawn to
  // the canvas in the render wiring. Absent when no caddy is hired.
  const caddyBadge = caddyBadgeHTML(caddyId());
  const autoFinish = `<button class="gs-roundbtn gs-glass" data-action='${JSON.stringify({ type: 'autoShotHole' })}' title="Auto-finish this hole">»</button>`;
  return `
    <div class="gs-shot gs-shot--full${lefty() ? ' gs-shot--lefty' : ''}">
      <div class="gs-bigmap" data-map="1" data-weather="decision">${svg}</div>
      ${mapCtrls}
      ${mapTopInfo(v, { shotNo: play.strokes + 1, distLabel: `<b>${v.distToPin}</b>y` })}
      <div class="gs-hud gs-hud-bottom">
        ${caddyBadge}
        <div class="gs-hud-controls gs-glass">
          ${clubRow}
          ${powerHud}
          ${legend}
          ${samRead}
        </div>
        ${autoFinish}
      </div>
    </div>
    ${state.scrambleChoice ? scrambleChoiceOverlay() : awaitingShotPopup ? shotPopupOverlay() : ''}`;
}

// Settings sheet — a view overlay (not reducer state), toggled like the shot popup.
let settingsOpen = false;

// The Ascension tier picked on the character-select screen (GS-title-2) — view state, like the
// club selection: the [data-asc] chips set it, every golfer card's select action carries it, and
// entering character select ('start') resets it to A0. Never persisted; the reducer clamps it.
let selAscension = 0;

// The starting CLUB SET picked on the character-select screen for the Unending Universe (GS-golf-score)
// — the mode's difficulty axis. View state like `selAscension`: the [data-clubset] chips set it, every
// golfer card's select action bakes it in, and 'start' resets it to the owned tier. The reducer clamps.
let selClubSet: BagTier = 'common';
// Whether the player has TAPPED a club-set chip on THIS character-select visit (GS-wardrobe-bagtier).
// The strip is a per-run override; when untouched, each golfer plays its own wardrobe-set tier instead,
// so an untouched strip (seeded to the owned tier) must NOT clobber a per-golfer pick.
let selClubSetTouched = false;

// STAR TOUR (GS-star-tour): set true while a pan-drag on the star map exceeds the tap threshold, so the
// click that ends the drag doesn't accidentally select the world it lands on. Reset on each pointerdown.
let starTourDragged = false;

/** Star Tour chart zoom bounds (pinch / scroll). The MIN is dynamic (`starTourFitZoom`) and set to the
 *  COVER floor so a pinch-out never pulls back past the point where the chart still fills the whole
 *  viewport — no empty black letterbox bands ever show (the player ask: "zoom goes too far out, leaving
 *  black empty map sections"). The earlier FIT floor (`min(w/CHART_W, h/CHART_H)`) let the whole wide map
 *  shrink inside the viewport with dark bands on the axis it didn't fill (GS-star-map-zoom-out); the
 *  starry `.gs-st-space` backdrop softened those bands but they still read as empty (GS-star-map-zoom-cap).
 *  The chart is a big, near-square canvas (lots of starry PAD around the world cluster), so the cover
 *  floor still shows plenty of open space to fly into while keeping the frame full. */
const ST_ZOOM_MAX = 2.6;

/** The smallest zoom at which the chart still COVERS the whole viewport (SVG = `CHART_W×CHART_H × zoom`
 *  px): every viewport edge is filled, the chart overflowing (pannable) on the axis it doesn't exactly
 *  match. Covering both axes means clearing the LARGER ratio, so the floor is the greater of width/height
 *  fit. Guards a zero-sized viewport (pre-layout) by falling back to 0 so the caller's own bounds win. */
function starTourFitZoom(vp: HTMLElement): number {
  const w = vp.clientWidth;
  const h = vp.clientHeight;
  if (w <= 0 || h <= 0) return 0;
  return Math.max(w / CHART_W, h / CHART_H);
}

/** The letterbox margin (px) that CENTRES the chart on each axis when the scaled chart is SMALLER than the
 *  viewport (zoomed out past cover); 0 on an axis the chart fills/overflows (so scroll-pan is unchanged).
 *  The chart's on-screen origin is therefore `(margin - scroll)` — the tap/focal math must add these. */
function starTourChartMargins(vp: HTMLElement, z: number): { mx: number; my: number } {
  const sw = CHART_W * z;
  const sh = CHART_H * z;
  return {
    mx: sw < vp.clientWidth ? (vp.clientWidth - sw) / 2 : 0,
    my: sh < vp.clientHeight ? (vp.clientHeight - sh) / 2 : 0,
  };
}

/** Size the SVG to the CURRENT `starTourView.zoom` and apply the centring margins in one place, so the
 *  rendered px size + letterbox offset never drift apart. Returns the applied margins for callers that
 *  need them (focal-preserving zoom). */
function applyStarTourChartSize(vp: HTMLElement): { mx: number; my: number } {
  const chart = vp.querySelector<SVGElement>('.gs-startour__chart');
  const z = starTourView.zoom || 1;
  const m = starTourChartMargins(vp, z);
  if (chart) {
    chart.setAttribute('width', (CHART_W * z).toFixed(0));
    chart.setAttribute('height', (CHART_H * z).toFixed(0));
    chart.style.marginLeft = `${m.mx.toFixed(0)}px`;
    chart.style.marginTop = `${m.my.toFixed(0)}px`;
  }
  return m;
}

/** Keep the chart's rendered size within the cover floor / max ceiling (used on mount + resize): if the
 *  current zoom is below the cover floor (chart no longer fills the viewport) or above the max, clamp it;
 *  then (re)size the SVG + re-centre. May force a zoom-IN when the default open zoom (`ST_OPEN_ZOOM`) sits
 *  below the cover floor on a viewport whose aspect needs more scale to stay full-frame. */
function clampStarTourZoom(vp: HTMLElement): void {
  const zFit = starTourFitZoom(vp);
  if (zFit <= 0) return;
  const zMax = Math.max(ST_ZOOM_MAX, zFit);
  starTourView.zoom = Math.max(zFit, Math.min(zMax, starTourView.zoom || 1));
  applyStarTourChartSize(vp);
}

/** Wire pan + PINCH-ZOOM on the Star Tour chart viewport. The viewport is `touch-action:none`, so we
 *  drive both gestures ourselves via pointer events (native touch-scroll used to jitter into the drag
 *  handler on a second finger — the "flicker jump" pinch bug — and there was no zoom at all). One
 *  finger drags (pans scroll); two fingers pinch-zoom about their midpoint, resizing the SVG's px size
 *  (viewBox fixed, so ship/world chart-coords are unchanged) and re-anchoring scroll to hold the focal
 *  point. A drag/pinch past a few px marks `starTourDragged` so the trailing click doesn't fly the ship.
 *  Re-wired each render (the node is replaced). */
function wireStarTourGestures(vp: HTMLElement): void {
  const chart = vp.querySelector<SVGElement>('.gs-startour__chart');
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { sx: number; sy: number; l0: number; t0: number } | null = null;
  let pinch: { startDist: number; startZoom: number } | null = null;
  vp.style.cursor = 'grab';

  const setZoom = (z: number, focalClientX: number, focalClientY: number): void => {
    // Floor at the COVER zoom so a pinch-out can pull back until the chart just fills the viewport but
    // never smaller than that — past it the map would letterbox into empty black bands (GS-star-map-zoom-cap).
    // Keep the ceiling above the floor for the degenerate case where the cover itself exceeds ST_ZOOM_MAX.
    const zMin = starTourFitZoom(vp);
    const zMax = Math.max(ST_ZOOM_MAX, zMin);
    z = Math.max(zMin, Math.min(zMax, z));
    const oldZoom = starTourView.zoom || 1;
    if (!chart || z === oldZoom) return;
    const rect = vp.getBoundingClientRect();
    const fx = focalClientX - rect.left;
    const fy = focalClientY - rect.top;
    // Focal-preserving zoom, MARGIN-AWARE (the chart's on-screen origin is `margin - scroll`, so the
    // chart point under the focus is `(focus + scroll - margin) / zoom`). Recover that point at the old
    // zoom/margin, then re-solve scroll at the new zoom/margin so it stays under the focus.
    const m0 = starTourChartMargins(vp, oldZoom);
    const px = (fx + vp.scrollLeft - m0.mx) / oldZoom;
    const py = (fy + vp.scrollTop - m0.my) / oldZoom;
    starTourView.zoom = z;
    const m1 = applyStarTourChartSize(vp);
    vp.scrollLeft = m1.mx + px * z - fx; // browser clamps ≥0; when centred (margin>0) scroll pins to 0
    vp.scrollTop = m1.my + py * z - fy;
    starTourView.scrollX = vp.scrollLeft;
    starTourView.scrollY = vp.scrollTop;
  };

  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    // The player is taking manual control (pan/pinch) — release the chase-cam so it can't yank the map
    // back to the ship (GS-star-map-jerky-movement). A trailing tap re-arms it via fly* on `click`.
    starTourView.following = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // NB: deliberately NO setPointerCapture — capturing the pointer retargets the trailing `click` to
    // the viewport, so `target.closest('[data-startour-course]')` misses the tapped world and every
    // world-tap degrades to a free flight (dossier never opens). vp is full-bleed, so move/up land on
    // it without capture anyway.
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { startDist: Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1, startZoom: starTourView.zoom || 1 };
      drag = null;
      starTourDragged = true; // a pinch is never a tap
    } else if (pointers.size === 1) {
      drag = { sx: e.clientX, sy: e.clientY, l0: vp.scrollLeft, t0: vp.scrollTop };
      starTourDragged = false;
      vp.style.cursor = 'grabbing';
    }
  });
  vp.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1;
      setZoom(pinch.startZoom * (dist / pinch.startDist), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      starTourDragged = true;
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) starTourDragged = true;
      vp.scrollLeft = drag.l0 - dx;
      vp.scrollTop = drag.t0 - dy;
      starTourView.scrollX = vp.scrollLeft;
      starTourView.scrollY = vp.scrollTop;
    }
  });
  const up = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      drag = null;
      vp.style.cursor = 'grab';
    }
  };
  vp.addEventListener('pointerup', up);
  vp.addEventListener('pointercancel', up);
  // Desktop: Ctrl/⌘ + wheel zooms about the cursor; a plain wheel keeps native scroll.
  vp.addEventListener(
    'wheel',
    (e) => {
      // Any wheel input is manual navigation (native scroll or ⌘/Ctrl zoom) — release the chase-cam so it
      // doesn't fight the wheel (GS-star-map-jerky-movement).
      starTourView.following = false;
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((starTourView.zoom || 1) * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY);
    },
    { passive: false },
  );
}

// STAR TOUR ship flight (GS-star-tour-2): the ship orients toward a tapped point/world and cruises
// there; on reaching a WORLD its dossier opens. Pure app-layer animation — the reducer stays clean;
// `starTourView` holds the ship's position so it survives re-renders. Only ever runs on the star map.
const stAnim = { raf: 0 };

/** The flat per-frame cruise step (chart units) at rare (1.0×) speed — the "current slow speed" the
 *  small map wants. Rarity scales it via `starTourShipSpeedMult()`. Dialled down 25% (7 → 5.25) for a
 *  more deliberate, readable cruise on the small map. */
const STAR_TOUR_BASE_STEP = 5.25;
/** Only a flight with more than this much distance remaining earns a gentle acceleration on top of the
 *  flat cruise; shorter/medium hops stay at the constant base speed. */
const STAR_TOUR_LONG_HAUL = 750;

/** The star map opens slightly more zoomed OUT than intrinsic (GS-star-tour-map-improvements) — the
 *  cover-zoom clamp still overrides this upward on a tall/narrow viewport that would otherwise letterbox. */
const ST_OPEN_ZOOM = 0.82;

/** ── FUEL model (GS-star-tour-fuel) ──────────────────────────────────────────────────────────────────
 *  Flying burns fuel by DISTANCE travelled (not time), so the "empty after 3/4 of the map at fast" target
 *  holds exactly regardless of the speed multiplier. FAST empties the tank over 3/4 of the chart width and
 *  burns 1.5× the fuel-per-distance of NORMAL (so NORMAL lasts 1.5× further = well past a full traverse).
 *  FAST also cruises +25% faster. Fuel is app-layer feel state (never the sim / a save). */
const ST_SPEED_FAST_MULT = 1.25;
/** Fuel drained per chart-unit travelled at FAST — sized so a fast cruise empties over 0.75 × CHART_W. */
const ST_FUEL_BURN_FAST = STAR_TOUR_FUEL_CAP / (0.75 * CHART_W);
/** NORMAL burns 1.5× LESS per distance than fast (the console fast-mode 1.5× thirst). */
const ST_FUEL_BURN_NORMAL = ST_FUEL_BURN_FAST / 1.5;
/** Coming to rest within this of a world / Earth / the spaceport tops the tank to full (a fuel stop). */
const ST_REFUEL_STATION_R = 96;
/** Tanker lerp speeds (fraction/frame) for the fly-in / fly-out, and the hose fill rate (fuel/frame). */
const ST_TRUCK_IN_EASE = 0.11;
const ST_TRUCK_OUT_EASE = 0.09;
const ST_TRUCK_FILL_RATE = STAR_TOUR_FUEL_CAP / 90; // ~1.5 s to brim the tank at 60fps

/** Set the hull flip for a flight: mirror vertically (−1) when heading LEFT so a wheeled/keeled ship
 *  keeps its top up rather than reading belly-up (a spaceship has no "up", but these are drawn as
 *  vehicles). Held constant for the whole flight (decided at launch off the target's side) so it never
 *  snaps mid-cruise as the ship crosses straight-up/down. */
function setStarTourFlip(targetX: number): void {
  const fromX = starTourView.shipX ?? SPACEPORT_POS.x;
  if (targetX < fromX - 2) starTourView.flip = -1;
  else if (targetX > fromX + 2) starTourView.flip = 1;
  // near-vertical: keep the current flip
}

/** Set a flight to a chart point (free roam — no dossier on arrival). */
function flyStarTourToPoint(x: number, y: number): void {
  starTourView.targetX = Math.max(20, Math.min(CHART_W - 20, x));
  starTourView.targetY = Math.max(20, Math.min(CHART_H - 20, y));
  starTourView.flyingTo = null;
  starTourView.dockingAtPort = false;
  starTourView.flyingToYggdrasil = false;
  starTourView.yggdrasilOpen = false;
  starTourView.following = true; // arm the chase-cam so rapid re-taps glide (GS-star-map-jerky-movement)
  setStarTourFlip(starTourView.targetX);
  sfx.click();
  startStarTourAnim();
}

/** Set a flight to a world; its dossier opens when the ship arrives. */
function flyStarTourToWorld(id: string | null): void {
  if (!id) return;
  const w = starTourWorlds().find((x) => x.id === id);
  if (!w) return;
  const p = worldPos(w);
  starTourView.targetX = p.x;
  starTourView.targetY = p.y;
  starTourView.flyingTo = id;
  starTourView.dockingAtPort = false;
  starTourView.flyingToYggdrasil = false;
  starTourView.yggdrasilOpen = false;
  starTourView.following = true; // arm the chase-cam (GS-star-map-jerky-movement)
  starTourView.selectedId = null; // close any open dossier while we fly
  setStarTourFlip(p.x);
  sfx.click();
  haptic(HAPTICS.tap);
  render(); // reflect the closed dossier immediately, then fly
}

/** Fly home to the SPACEPORT (GS-star-tour-port): on arrival the ship docks and the Clubhouse opens — the
 *  star map's way OUT. */
function flyStarTourToPort(): void {
  starTourView.targetX = SPACEPORT_POS.x;
  starTourView.targetY = SPACEPORT_POS.y;
  starTourView.flyingTo = null;
  starTourView.dockingAtPort = true;
  starTourView.flyingToYggdrasil = false;
  starTourView.yggdrasilOpen = false;
  starTourView.following = true; // arm the chase-cam (GS-star-map-jerky-movement)
  starTourView.selectedId = null;
  setStarTourFlip(SPACEPORT_POS.x);
  sfx.click();
  haptic(HAPTICS.tap);
  render();
}

/** Fly to the hidden YGGDRASIL (GS-star-tour-yggdrasil): on arrival the realm-tree overlay opens. */
function flyStarTourToYggdrasil(): void {
  starTourView.targetX = YGGDRASIL_POS.x;
  starTourView.targetY = YGGDRASIL_POS.y;
  starTourView.flyingTo = null;
  starTourView.dockingAtPort = false;
  starTourView.flyingToYggdrasil = true;
  starTourView.following = true; // arm the chase-cam (GS-star-map-jerky-movement)
  starTourView.selectedId = null;
  starTourView.recordsOpen = false;
  setStarTourFlip(YGGDRASIL_POS.x);
  sfx.click();
  haptic(HAPTICS.tap);
  render();
}

/** ── STAR-MAP WEAPONS (GS-star-tour-weapons) ─────────────────────────────────────────────────────────
 *  A live projectile: an SVG `<g>` appended to `#gs-st-shots`, moved by a per-frame transform (the ship /
 *  tanker pattern), removed when `life` runs out. Pure app-layer feel — no sim, no save, no rng. */
interface StShot {
  g: SVGGElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  life: number;
  /** Frames over which to fade the shot out at the end of its life. */
  fade: number;
}
const SVGNS = 'http://www.w3.org/2000/svg';
let stShots: StShot[] = [];

/** Spawn one projectile `<g>` into the shots layer, authored facing +x and oriented by `rot`. */
function addStShot(group: Element, style: WeaponStyle | 'flash' | 'pellet', c1: string, c2: string, x: number, y: number, rot: number, vx: number, vy: number, life: number): void {
  const g = document.createElementNS(SVGNS, 'g') as SVGGElement;
  g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`);
  // innerHTML on an SVG element parses its children in the SVG namespace (modern browsers) — the same
  // authored-facing-+x markup the ship/thrust use, so a projectile just needs a translate+rotate.
  g.innerHTML = shotInnerSVG(style, c1, c2);
  group.appendChild(g);
  stShots.push({ g, x, y, vx, vy, rot, life, fade: Math.min(9, life) });
}

/** Fire the flown ship's weapon (GS-star-tour-weapons): spend one charge, spray the volley + a muzzle flash
 *  from the nose along the current heading. Blocked while the tank is being refuelled; a soft click when out
 *  of charges (they reload at the next fuel stop). Pure DOM + the shot list — never a `render()` (that would
 *  rebuild the whole chart and wipe live projectiles), so the ammo pips update in place like the fuel gauge. */
function fireStarTourWeapon(): void {
  if (state.screen !== 'starTour') return;
  const v = starTourView;
  if (v.refuel) return; // stalled at the pump — no firing
  const group = document.getElementById('gs-st-shots');
  if (!group) return;
  if (v.ammo <= 0) {
    sfx.click();
    haptic(HAPTICS.bad);
    return;
  }
  const w = shipWeaponFor(tourShipId());
  const sx = v.shipX ?? SPACEPORT_POS.x;
  const sy = v.shipY ?? SPACEPORT_POS.y;
  const hRad = (v.heading * Math.PI) / 180;
  // Spawn at the ship's NOSE so the shot reads as leaving the muzzle.
  const nx = sx + Math.cos(hRad) * 14;
  const ny = sy + Math.sin(hRad) * 14;
  addStShot(group, 'flash', w.color, w.color2, nx, ny, v.heading, 0, 0, 12);
  const n = Math.max(1, w.count);
  for (let i = 0; i < n; i++) {
    const spreadDeg = n > 1 ? (i / (n - 1) - 0.5) * w.spread : 0;
    const a = hRad + (spreadDeg * Math.PI) / 180;
    // A scatter volley draws individual pellets; every other weapon draws its own style once.
    const style = w.style === 'scatter' ? 'pellet' : w.style;
    addStShot(group, style, w.color, w.color2, nx, ny, v.heading + spreadDeg, Math.cos(a) * w.speed, Math.sin(a) * w.speed, w.life);
  }
  v.ammo = Math.max(0, v.ammo - 1);
  updateStAmmo();
  sfx.redirectFire(w.sound === 'kinetic' ? 'boomerang' : 'laser', 550);
  haptic(HAPTICS.tap);
  startStarTourAnim(); // ensure the loop is running to animate the shots (idempotent)
}

/** Advance/fade/reap the live projectiles — one frame. Called from the star-map rAF loop. */
function stepStarTourShots(): void {
  if (!stShots.length) return;
  const group = document.getElementById('gs-st-shots');
  for (let i = stShots.length - 1; i >= 0; i--) {
    const s = stShots[i]!;
    // A stale ref (the chart was re-rendered out from under us) — drop it.
    if (group && !group.contains(s.g)) {
      stShots.splice(i, 1);
      continue;
    }
    s.x += s.vx;
    s.y += s.vy;
    s.life--;
    s.g.setAttribute('transform', `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(1)})`);
    if (s.life < s.fade) s.g.setAttribute('opacity', Math.max(0, s.life / s.fade).toFixed(2));
    if (s.life <= 0) {
      s.g.remove();
      stShots.splice(i, 1);
    }
  }
}

/** Rebuild the ammo pips in place (`#gs-st-ammo`) + reflect the empty state on the fire button, without a
 *  whole-chart re-render (the fuel-gauge pattern). */
function updateStAmmo(): void {
  const ammoEl = document.getElementById('gs-st-ammo');
  if (ammoEl) ammoEl.innerHTML = starTourAmmoHTML();
  const btn = document.getElementById('gs-st-fire');
  if (btn) btn.classList.toggle('gs-sthud__fire--empty', starTourView.ammo <= 0);
}

/** Lerp an angle (degrees) toward a target by fraction f, taking the short way round. */
function lerpAngle(a: number, b: number, f: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * f;
}

/** (Re)start the single ship-animation rAF loop. Idempotent — cancels any in-flight frame first. */
function startStarTourAnim(): void {
  if (state.screen !== 'starTour') return;
  if (stAnim.raf) cancelAnimationFrame(stAnim.raf);
  stAnim.raf = requestAnimationFrame(stepStarTour);
}

/** A rest point is at a fuel STATION (GS-star-tour-fuel) if it's within `ST_REFUEL_STATION_R` of any
 *  world, Earth, or the spaceport — coming to rest there tops the tank to full (a fuel stop). A free-roam
 *  tap into empty space does NOT refuel; running dry out there is what summons the tanker. */
function starTourStationNear(x: number, y: number): boolean {
  const stations = [SPACEPORT_POS, EARTH_POS, ...starTourWorlds().map(worldPos)];
  // The World Tree is a station too, once it's revealed (GS-star-tour-yggdrasil).
  if (yggdrasilArmed()) stations.push(YGGDRASIL_POS);
  return stations.some((p) => Math.hypot(p.x - x, p.y - y) <= ST_REFUEL_STATION_R);
}

/** The tank ran dry in deep space: stall the ship and fly the space tanker in. The interrupted flight is
 *  stashed on `resume` so the ship carries on to its target once the tank is brimmed again. */
function beginStarTourRefuel(vp: HTMLElement | null): void {
  const v = starTourView;
  const shipX = v.shipX ?? SPACEPORT_POS.x;
  const shipY = v.shipY ?? SPACEPORT_POS.y;
  const resume = v.targetX != null && v.targetY != null ? { targetX: v.targetX, targetY: v.targetY, flyingTo: v.flyingTo } : null;
  v.targetX = null;
  v.targetY = null;
  v.flyingTo = null;
  // Enter from whichever side of the VISIBLE region the ship has more runway toward, so the truck has room
  // to fly in on-screen. Fall back to a fixed offset if the viewport isn't measurable yet.
  const z = v.zoom || 1;
  const m = vp ? starTourChartMargins(vp, z) : { mx: 0, my: 0 };
  const leftEdge = vp ? (vp.scrollLeft - m.mx) / z : shipX - 320;
  const rightEdge = vp ? (vp.scrollLeft - m.mx + vp.clientWidth) / z : shipX + 320;
  const enterRight = shipX - leftEdge < rightEdge - shipX;
  const sideDir = enterRight ? 1 : -1;
  const edgeX = enterRight ? rightEdge + 70 : leftEdge - 70;
  const dockX = shipX + sideDir * 46;
  const dockY = shipY - 42;
  v.refuel = {
    phase: 'in',
    truckX: edgeX,
    truckY: dockY,
    dockX,
    dockY,
    exitX: edgeX,
    exitY: dockY,
    flip: -sideDir, // the +x-facing tanker mirrors so its cab points back at the ship
    resume,
  };
  sfx.click();
}

/** Advance the refuel tanker (fly in → hose the tank up → fly out → resume the stashed flight). */
function stepStarTourRefuel(): void {
  const v = starTourView;
  const rf = v.refuel!;
  if (rf.phase === 'in') {
    rf.truckX += (rf.dockX - rf.truckX) * ST_TRUCK_IN_EASE;
    rf.truckY += (rf.dockY - rf.truckY) * ST_TRUCK_IN_EASE;
    if (Math.hypot(rf.dockX - rf.truckX, rf.dockY - rf.truckY) < 4) rf.phase = 'hose';
  } else if (rf.phase === 'hose') {
    rf.truckX = rf.dockX;
    rf.truckY = rf.dockY;
    v.fuel = Math.min(STAR_TOUR_FUEL_CAP, v.fuel + ST_TRUCK_FILL_RATE);
    if (v.fuel >= STAR_TOUR_FUEL_CAP) {
      v.fuel = STAR_TOUR_FUEL_CAP;
      // A tanker top-up also reloads the weapon (GS-star-tour-weapons).
      if (v.ammo < WEAPON_AMMO_CAP) {
        v.ammo = WEAPON_AMMO_CAP;
        updateStAmmo();
      }
      rf.phase = 'out';
      sfx.click();
    }
  } else {
    rf.truckX += (rf.exitX - rf.truckX) * ST_TRUCK_OUT_EASE;
    rf.truckY += (rf.exitY - rf.truckY) * ST_TRUCK_OUT_EASE;
    if (Math.hypot(rf.exitX - rf.truckX, rf.exitY - rf.truckY) < 8) {
      const resume = rf.resume;
      v.refuel = null;
      if (resume) {
        v.targetX = resume.targetX;
        v.targetY = resume.targetY;
        v.flyingTo = resume.flyingTo;
        setStarTourFlip(resume.targetX);
      }
    }
  }
}

/** Draw the tanker + hose (during a refuel) and keep the fuel gauge in sync. Pure DOM writes on the
 *  existing SVG nodes — no whole-map re-render, like the ship transform. */
function paintStarTourRefuel(): void {
  const v = starTourView;
  const truckEl = document.getElementById('gs-st-fueltruck');
  const hoseEl = document.getElementById('gs-st-fuelhose');
  const hoseHiEl = document.getElementById('gs-st-fuelhose-hi');
  const rf = v.refuel;
  if (rf && truckEl) {
    truckEl.style.display = '';
    truckEl.setAttribute('transform', `translate(${rf.truckX.toFixed(1)} ${rf.truckY.toFixed(1)}) scale(${rf.flip} 1)`);
    if (rf.phase === 'hose' && hoseEl && hoseHiEl) {
      const nx = rf.truckX;
      const ny = rf.truckY + 18; // the tanker's belly nozzle
      const sx = v.shipX ?? nx;
      const sy = v.shipY ?? ny;
      const mx = (nx + sx) / 2;
      const my = Math.max(ny, sy) + 16; // a slack sag between the two
      const d = `M${nx.toFixed(1)},${ny.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${sx.toFixed(1)},${sy.toFixed(1)}`;
      hoseEl.setAttribute('d', d);
      hoseHiEl.setAttribute('d', d);
      hoseEl.style.display = '';
      hoseHiEl.style.display = '';
    } else {
      if (hoseEl) hoseEl.style.display = 'none';
      if (hoseHiEl) hoseHiEl.style.display = 'none';
    }
  } else if (truckEl) {
    truckEl.style.display = 'none';
    if (hoseEl) hoseEl.style.display = 'none';
    if (hoseHiEl) hoseHiEl.style.display = 'none';
  }
}

/** The floored fuel value currently painted into `#gs-st-fuel`, so the gauge only rebuilds on a real
 *  step-change (cheap) instead of every frame. −1 forces the first paint. */
let stFuelShown = -1;

function stepStarTour(): void {
  if (state.screen !== 'starTour') {
    stAnim.raf = 0;
    return;
  }
  const v = starTourView;
  if (v.shipX == null || v.shipY == null) {
    v.shipX = SPACEPORT_POS.x;
    v.shipY = SPACEPORT_POS.y;
  }
  const vp = document.getElementById('gs-st-viewport');
  let cruising = false;
  if (v.refuel) {
    // Stalled: run the tanker sequence instead of a flight (the ship holds position).
    stepStarTourRefuel();
  } else if (v.targetX != null && v.targetY != null) {
    const dx = v.targetX - v.shipX;
    const dy = v.targetY - v.shipY;
    const d = Math.hypot(dx, dy);
    // Orient the nose ALONG the flight. The ship art faces +x (right), so heading = atan2(dy,dx); the
    // old atan2(dx,−dy) assumed a 0=up hull and rendered a downward flight upside-down (GS-star-tour).
    v.heading = lerpAngle(v.heading, (Math.atan2(dy, dx) * 180) / Math.PI, 0.28);
    if (d < 3.5) {
      v.shipX = v.targetX;
      v.shipY = v.targetY;
      v.targetX = null;
      v.targetY = null;
      // Visiting any station (a world, Earth, the spaceport) tops the tank to full (GS-star-tour-fuel) and
      // reloads the weapon magazine (GS-star-tour-weapons).
      if (starTourStationNear(v.shipX, v.shipY)) {
        v.fuel = STAR_TOUR_FUEL_CAP;
        if (v.ammo < WEAPON_AMMO_CAP) {
          v.ammo = WEAPON_AMMO_CAP;
          updateStAmmo();
        }
      }
      if (v.dockingAtPort) {
        // Docked home at the spaceport (GS-star-tour-port) → into the Clubhouse (the map's way out).
        v.dockingAtPort = false;
        stAnim.raf = 0;
        sfx.click();
        dispatch({ type: 'openClubhouseHall' });
        return;
      }
      if (v.flyingToYggdrasil) {
        // Arrived at the World Tree (GS-star-tour-yggdrasil) → open the Nine Realms overlay.
        v.flyingToYggdrasil = false;
        v.yggdrasilOpen = true;
        stAnim.raf = 0;
        sfx.click();
        render();
        return;
      }
      if (v.flyingTo) {
        // Arrived at a world → open its course dossier (the "course info screen loads on arrival").
        v.selectedId = v.flyingTo;
        v.flyingTo = null;
        stAnim.raf = 0;
        sfx.click();
        render(); // rebuilds the DOM (dossier up) + restarts the loop via the post-render block
        return;
      }
    } else {
      // Near-CONSTANT cruise (GS-star-tour-map-improvements): the small map wants a deliberate flat
      // speed, not the old `d * 0.14` that made distant hops rocket off way too fast. The base step is
      // scaled by the flown ship's RARITY (commons slower, mythic faster) and only a genuinely long
      // haul earns a gentle acceleration so a cross-galaxy jump isn't a slog — anything under
      // STAR_TOUR_LONG_HAUL cruises flat. FAST throttle adds +25% on top (GS-star-tour-fuel).
      const accel = d > STAR_TOUR_LONG_HAUL ? (d - STAR_TOUR_LONG_HAUL) * 0.0375 : 0;
      const speedMult = v.speed === 'fast' ? ST_SPEED_FAST_MULT : 1;
      const step = (STAR_TOUR_BASE_STEP + accel) * starTourShipSpeedMult() * speedMult;
      const moved = Math.min(step, d);
      const f = moved / d;
      v.shipX += dx * f;
      v.shipY += dy * f;
      cruising = true;
      // Burn fuel by DISTANCE moved so the "empty after 3/4 map at fast" target holds regardless of speed.
      const burn = v.speed === 'fast' ? ST_FUEL_BURN_FAST : ST_FUEL_BURN_NORMAL;
      v.fuel = Math.max(0, v.fuel - moved * burn);
      if (v.fuel <= 0) beginStarTourRefuel(vp); // ran dry in deep space → the tanker comes to you
    }
  }
  // Chase-cam: while the player is flying the ship around (or watching the tanker), ease the viewport to
  // keep the ship centred. The chart point's on-screen x is `margin − scroll + coord×zoom`, so centring the
  // ship needs scroll = margin + shipX×zoom − half-viewport (margin is 0 unless the map is zoomed out to
  // letterbox). Gated on `v.following` (set by any fly*, cleared on manual pan/pinch/wheel) rather than the
  // per-frame `cruising` flag (GS-star-map-jerky-movement): a completed hop used to drop `cruising` and hard-
  // freeze the map off-centre until the next tap, so rapid "tap to keep moving" taps stuttered freeze→lurch.
  // Following instead keeps the cam easing across the gaps, so it glides — and once the ship is idle+centred
  // the ease converges to a no-op, so it never fights a resting view.
  if ((cruising || v.refuel || v.following) && vp) {
    const z = v.zoom || 1;
    const m = starTourChartMargins(vp, z);
    const tx = m.mx + v.shipX * z - vp.clientWidth / 2;
    const ty = m.my + v.shipY * z - vp.clientHeight / 2;
    vp.scrollLeft += (tx - vp.scrollLeft) * 0.16;
    vp.scrollTop += (ty - vp.scrollTop) * 0.16;
    v.scrollX = vp.scrollLeft;
    v.scrollY = vp.scrollTop;
  }
  const el = document.getElementById('gs-st-ship');
  if (el) {
    // GS-ship-fly-orient: the group carries POSITION only; two children carry orientation so a nose-less
    // hover craft (saucer/UFO) glides LEVEL while its plume still trails behind. NOSE craft rotate the hull
    // to the heading (+ vertical flip flying left); HOVER craft keep the disc upright and only bank.
    el.setAttribute('transform', `translate(${v.shipX.toFixed(1)} ${v.shipY.toFixed(1)})`);
    const hover = starTourShipHovers();
    const bodyEl = document.getElementById('gs-st-body');
    if (bodyEl)
      bodyEl.setAttribute(
        'transform',
        hover ? `rotate(${hoverBank(v.heading).toFixed(1)})` : `rotate(${v.heading.toFixed(1)}) scale(1 ${v.flip})`,
      );
    // The thrust plume always rotates to the heading so it streams BEHIND the hull, whatever the body does.
    const thrustEl = document.getElementById('gs-st-thrust-orient');
    if (thrustEl) thrustEl.setAttribute('transform', `rotate(${v.heading.toFixed(1)})`);
    // Fire the engine plume (a `.gs-st-thrust` in the group) only while actually cruising (not stalled).
    el.classList.toggle('gs-st-thrusting', cruising);
  }
  paintStarTourRefuel();
  stepStarTourShots();
  // Keep the fuel gauge honest, rebuilding only when the shown integer changes (cheap).
  const shown = Math.floor(v.fuel);
  if (shown !== stFuelShown) {
    stFuelShown = shown;
    const fuelEl = document.getElementById('gs-st-fuel');
    if (fuelEl) fuelEl.innerHTML = starTourFuelHTML();
  }
  stAnim.raf = requestAnimationFrame(stepStarTour);
}



/**
 * Wire the settings sheet's interactive elements found under `root`. Called with the whole `app` on a
 * full render, and with the sheet element alone from `refreshSettings` after an in-sheet surgical update
 * (so only the freshly-swapped descendants get fresh listeners — the persistent backdrop + sheet frame
 * keep their original ones and are never double-wired). GS-settings-flicker.
 */
function wireSettingsSheet(root: ParentNode): void {
  // Close (backdrop tap, the ✕, Done); a `keep` on the sheet frame swallows body taps so they can't
  // bubble to the backdrop's close (the old <select> mis-tap → accidental exit, GS-default-aim).
  root.querySelectorAll<HTMLElement>('[data-settings]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (el.dataset.settings === 'keep') {
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
      settingsOpen = false;
      render();
    });
  });
  // On/off preference CHIP toggles (GS-settings-chips). Update the sheet SURGICALLY (refreshSettings) so
  // the frame's slide-up animation isn't replayed; keep the ambient music matched when Music is flipped.
  root.querySelectorAll<HTMLElement>('[data-setting]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSetting(el.dataset.setting as keyof Settings);
      resumeAudio();
      sfx.click();
      syncMusic();
      refreshSettings();
    });
  });
  // Default aim-mode SEGMENTED control (GS-default-aim): three real buttons (no fiddly native <select> to
  // mis-tap). Each STOPS PROPAGATION so a tap can't bubble to the backdrop's close. Persist the choice
  // and clear any drag aim / club pick so the next shot re-seeds from it; refresh the sheet surgically.
  root.querySelectorAll<HTMLElement>('[data-selaim]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selAim = el.dataset.selaim as AimMode;
      setSetting('aimMode', selAim);
      selClubId = null;
      selFreeTarget = null;
      selAimBearing = null;
      sfx.click();
      haptic(HAPTICS.tap);
      refreshSettings();
    });
  });
  // "Return to title" (GS-settings-nav): close the sheet, then the reducer parks an underway run as a
  // resumable snapshot and lands on the title — the same offer a page reload makes.
  root.querySelectorAll<HTMLElement>('[data-settings-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsOpen = false;
      dispatch({ type: 'toTitle' });
    });
  });
}

/**
 * Re-render JUST the open settings sheet's inner content in place, then re-wire it — no full render(), so
 * the `.gs-sheet` frame stays mounted and its slide-up animation doesn't replay on every toggle/aim tap
 * (the flicker, GS-settings-flicker). Falls back to a full render if the sheet isn't mounted.
 */
function refreshSettings(): void {
  const sheet = document.querySelector<HTMLElement>('.gs-settings');
  if (!settingsOpen || !sheet) {
    render();
    return;
  }
  sheet.innerHTML = settingsSheetInner();
  wireSettingsSheet(sheet);
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // Keep the ambient music matched to what's on screen (a no-op when the scene is unchanged).
  syncMusic();
  // Tear down the previous canvas mounts BEFORE we wipe the DOM and (maybe) mount fresh ones.
  // render() replaces `app.innerHTML`, which detaches the old play-view / putt-meter canvases —
  // but their self-perpetuating rAF loops (playView re-requests every frame even after `done`,
  // see playView.ts) keep running forever unless `destroy()` is called. dispatch() destroys them,
  // but render() is invoked DIRECTLY all over (scheduleRender during the power-pull, the onDone
  // hold timers, popup-continue, the settings toggle) — so each shot used to leak one orphaned
  // 60fps loop drawing into a detached canvas, piling up until the power-pull and manual putting
  // went unusably laggy. Destroying here makes every re-render reclaim the prior mount; the
  // conditional blocks below re-mount fresh handles as the screen needs them.
  if (view) {
    view.destroy();
    view = null;
  }
  if (weatherOverlay) {
    weatherOverlay.destroy();
    weatherOverlay = null;
  }
  if (puttMeter) {
    puttMeter.destroy();
    puttMeter = null;
  }
  // Settings → sim bridge (GS-lefty): the pure sim can't read localStorage, so bake the live
  // left-handed setting onto the loadout here. render() runs after every dispatch and after the
  // settings toggle's direct render(), so `loadout.lefty` is always current before the next shot
  // reducer reads it — and it's NOT serialised (re-derived here on resume), so no save bump.
  if (state.run?.loadout) state.run.loadout.lefty = lefty();

  // The interactive playing screen interleaves animation with input, so it computes its
  // own body (controls vs "watching") based on whether shots are pending animation.
  let animatingPlay: ReturnType<typeof pendingAnimation> = null;
  if (state.screen === 'playing' && state.play) {
    if (state.play.holeIndex !== animHoleIndex) {
      animatedShots = 0;
      animatedPutts = 0;
      animHoleIndex = state.play.holeIndex;
      selClubId = null;
      selAim = 'attack';
      selPower = 1;
      selAimBearing = null;
      decisionShotCount = -1;
      awaitingShotPopup = false;
      aceCelebratedHole = -1;
      birdCelebratedHole = -1;
      strokeAutoAdvancedHole = -1;
      decisionRadius = null;
      puttViewRadius = null;
      resetMapView();
    }
    animatingPlay = pendingAnimation(state.play);
  }

  // Star Tour (GS-star-tour): a solo stroke-play round has NO between-hole scoring interstitial. Once a
  // hole is holed out — and any ace/eagle celebration + the settle beat have cleared — go STRAIGHT to the
  // next tee. Unlike the Voyage (a Stableford cut to make) and the Unending Universe (a survival bar),
  // there is no field to place against and no cut to review, so the end-of-hole leaderboard/points card
  // the other formats show is just a needless tap between the player and the next hole. `holeComplete`
  // advances to the next hole (or resolves the round → strokeResult on the 18th). Fire once per hole
  // (`strokeAutoAdvancedHole`), only when the animation is finished (`animatingPlay === null`) and no
  // hold/celebration timer is pending (`!popupTimer`) — so the ball-in-the-cup frame + any celebration
  // still play first. The scheduled dispatch repaints the next tee; the frozen last frame holds until then.
  if (
    state.screen === 'playing' &&
    state.play?.done &&
    animatingPlay === null &&
    !popupTimer &&
    state.run.formatId === STROKEPLAY_FORMAT &&
    strokeAutoAdvancedHole !== state.play.holeIndex
  ) {
    strokeAutoAdvancedHole = state.play.holeIndex;
    popupTimer = window.setTimeout(() => {
      popupTimer = 0;
      dispatch({ type: 'holeComplete' });
    }, 0);
    return;
  }

  // The lane selection + depot toggle are only meaningful on the travel screen; clear them the moment we
  // leave so a stale id (route ids repeat 1..3 each stop) can't carry over to the next travel screen.
  if (state.screen !== 'travel') {
    travelView.selectedRouteId = null;
    travelView.depotOpen = false;
    travelView.exitOpen = false;
  }

  // Reset the aim-overlay decor framing each render; the decision/putt branches below re-arm it when
  // they draw a focus-mode map (whole-hole fit can't be aligned, so it stays null → no aligned decor).
  overlayDecor = null;

  const body =
    state.screen === 'title'
      ? titleScreen()
      : state.screen === 'character' && state.pendingStoryNew
      ? // GS-story-clubhouse: picking your protagonist for a NEW campaign happens IN the graphic Earth
        // clubhouse — tap a golfer to open their stats/abilities overlay, then "Play as" them.
        storyGolferPickerHTML()
      : state.screen === 'character'
      ? characterScreen(state.unlockedClubsByCharacter, {
          modeName: getFormat(state.run.formatId).name,
          winnable: !!getFormat(state.run.formatId).winnable,
          // The Voyage's difficulty is picked here, with the golfer (GS-title-2) — only when
          // tiers are actually unlocked (a fresh account just plays A0, no dropdown to show).
          ascension:
            getFormat(state.run.formatId).winnable && state.maxAscension > 0
              ? { max: state.maxAscension, sel: selAscension }
              : undefined,
          // The STARTING CLUB SET / bag pill (GS-golf-score / GS-wardrobe-bagtier) shows on EVERY mode now,
          // but only when a better-than-common bag is owned (otherwise there's no choice to make). Bounded
          // to the owned tier (green always); the reducer re-clamps. Overrides per-run only when changed.
          clubSet:
            bagTierRank(state.bagTier) > 0
              ? {
                  owned: state.bagTier,
                  sel: bagTierRank(selClubSet) <= bagTierRank(state.bagTier) ? selClubSet : state.bagTier,
                  touched: selClubSetTouched,
                }
              : undefined,
          // Per-golfer Ascension-clear ladder (GS-ascension-clubs display) — drives each Voyage card's
          // "does a win here unlock a new club?" badge. Voyage-only (endless grants no club unlocks).
          unlockLadder: getFormat(state.run.formatId).winnable ? state.maxAscensionByCharacter : undefined,
        })
      : state.screen === 'intro'
      ? introScreen()
      : state.screen === 'playing'
      ? playingBody(animatingPlay !== null)
      : state.screen === 'result'
      ? resultScreen()
      : state.screen === 'bossReward'
      ? bossRewardScreen()
      : state.screen === 'shop'
      ? shopScreen()
      : state.screen === 'starmart'
      ? starmartScreen()
      : state.screen === 'travel'
      ? travelScreen()
      : state.screen === 'trademarket'
      ? tradeMarketScreen()
      : state.screen === 'clubhouseHall'
      ? clubhouseHallScreen()
      : state.screen === 'clubhouse'
      ? clubhouseScreen()
      : state.screen === 'asgardMap'
      ? asgardMapScreen()
      : state.screen === 'asgardResult'
      ? asgardResultScreen()
      : state.screen === 'starTour'
      ? starTourScreen()
      : state.screen === 'strokeResult'
      ? strokeResultScreen()
      : state.screen === 'story'
      ? storyHubScreen()
      : state.screen === 'storyResult'
      ? storyResultScreen()
      : state.screen === 'storyShop'
      ? storyShopScreen()
      : state.screen === 'storyLocker'
      ? storyLockerScreen()
      : state.screen === 'storyShipyard'
      ? storyShipyardScreen()
      : state.screen === 'storyTournament'
      ? storyTournamentScreen()
      : state.screen === 'storyTournamentResult'
      ? storyTournamentResultScreen()
      : state.screen === 'storyFinale'
      ? storyFinaleScreen()
      : state.screen === 'storyFinaleResult'
      ? storyFinaleResultScreen()
      : state.screen === 'lore'
      ? loreScreen()
      : gameoverScreen();

  // The interactive play screen (decision / watching / putting — but not the hole-complete card) is
  // full-bleed: the map fills the page, so drop the page frame's padding/max-width for it.
  // The Star Tour star map (GS-star-tour) is full-bleed too — the chart fills the page and pans.
  const fullBleed =
    (state.screen === 'playing' && !!state.play && !state.play.done) ||
    state.screen === 'starTour' ||
    state.screen === 'lore'; // GS-lore: the story beat owns the full viewport (its own cinematic backdrop)
  // The character-select roster wants a wider frame so all four golfers line up across one screen,
  // and on phones it locks to the viewport (GS-select-onescreen) — the grid fills the space under the
  // header so the whole roster fits one mobile screen with no scroll.
  const wide = state.screen === 'character';
  const fit = state.screen === 'character';
  // The settings cog rides EVERY screen (GS-settings-nav) — fixed top-right, outside each screen's
  // own markup so no screen can forget it. Two exceptions carry their OWN cog and would collide with a
  // second fixed one: the full-bleed play view (its map-nav stack has a cog) and the travel bridge HUD
  // (GS-journey-map-hud-consolidate — the cog docks into the HUD's top-right status pod).
  const cog =
    fullBleed || state.screen === 'travel' || state.screen === 'starTour'
      ? ''
      : `<button class="gs-cog" data-open-settings="1" title="Settings" aria-label="Settings">⚙</button>`;
  // The hole-step hazards/benefits popup (GS-intro-split) rides over the page like the settings sheet.
  const introTraits = state.screen === 'intro' && introView.stage === 'hole' && introView.traitsOpen ? introTraitsOverlay() : '';
  // The arc-step field/scout overlay (GS-intro-onescreen): the full competitor field / records behind a tap.
  const introField = state.screen === 'intro' && introView.stage === 'arc' && introView.fieldOpen ? introFieldOverlay() : '';
  // The one-off Trade Market price-cut / refund notice (GS-trade-rebalance) rides over every screen
  // until the player closes it — it's stamped by the save migration and shown on the boot title.
  const priceNotice = state.priceRefund != null ? priceNoticeOverlay() : '';
  app.innerHTML = `<main class="gs-main${fullBleed ? ' gs-main--bleed' : ''}${wide ? ' gs-main--wide' : ''}${fit ? ' gs-main--fit' : ''}">${body}</main>${cog}${settingsOpen ? settingsOverlay() : ''}${introTraits}${introField}${priceNotice}`;
  app.setAttribute('data-booted', '1'); // tell the boot watchdog the app painted

  // Star Tour star map (GS-star-tour): on first mount, centre the pannable chart on the worlds'
  // centroid; then wire pointer-drag-to-fly (native scroll already handles touch + wheel). Re-wired
  // each render (innerHTML replaced the node), so a fresh element always gets its listeners.
  if (state.screen === 'starTour') {
    // A render rebuilt the chart SVG — the old shots layer + its `<g>`s are detached, so drop the stale
    // element refs (a fresh empty `#gs-st-shots` is in the new DOM).
    stShots.length = 0;
    const vp = document.getElementById('gs-st-viewport');
    if (vp) {
      if (!starTourView.centred) {
        requestAnimationFrame(() => {
          // Keep the open zoom within the fit floor / max ceiling (only matters on a viewport too small
          // to fit the whole chart even at ST_OPEN_ZOOM).
          clampStarTourZoom(vp);
          // Open the view on the clubhouse SPACEPORT — the ship's home dock (GS-star-tour-2). The chart
          // point's on-screen x is `margin - scroll + coord×zoom`, so to seat the spaceport at the
          // viewport centre, scroll = margin + coord×zoom − half-viewport (margin is 0 unless letterboxed).
          const z = starTourView.zoom || 1;
          const m = starTourChartMargins(vp, z);
          starTourView.scrollX = m.mx + SPACEPORT_POS.x * z - vp.clientWidth / 2;
          starTourView.scrollY = m.my + SPACEPORT_POS.y * z - vp.clientHeight / 2;
          vp.scrollLeft = starTourView.scrollX;
          vp.scrollTop = starTourView.scrollY;
          starTourView.centred = true;
        });
      } else if (starTourView.scrollX != null && starTourView.scrollY != null) {
        // Re-clamp on every re-render: an orientation change / resize can lift the fit floor above the
        // held zoom, so a whole-map view stays valid rather than shrinking below "everything visible".
        clampStarTourZoom(vp);
        // Restore the preserved scroll — the viewport is a fresh node each render, so the browser
        // scroll is otherwise lost and the chart snaps to its top-left corner.
        vp.scrollLeft = starTourView.scrollX;
        vp.scrollTop = starTourView.scrollY;
      }
      // Keep the preserved offset in sync with any native scroll (wheel / touch / scrollbar).
      vp.addEventListener('scroll', () => {
        starTourView.scrollX = vp.scrollLeft;
        starTourView.scrollY = vp.scrollTop;
      });
      wireStarTourGestures(vp);
      startStarTourAnim();
    }
  }

  // Wire actions.
  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => dispatch(JSON.parse(el.dataset.action!) as Action));
  });
  // GS-story-intro: "Answer the call" on the prologue victory plays the recruitment cinematic (the Mothership
  // + the Parrot), THEN continues to the spaceport clubhouse. Under reduced-motion the cinematic is skipped
  // (the recruitment beat is already on the result screen) — straight to the clubhouse.
  app.querySelectorAll<HTMLElement>('[data-story-intro]').forEach((el) => {
    el.addEventListener('click', () => {
      resumeAudio();
      const go = (): void => dispatch({ type: 'storyRoundContinue' });
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        go();
        return;
      }
      mountStoryIntro({ onDone: go });
    });
  });
  // GS-story-econ / GS-story-lore-cards: dismiss the Pro-Shop item lore card (backdrop or ✕ carry this).
  app.querySelectorAll<HTMLElement>('[data-story-item-close]').forEach((el) => {
    el.addEventListener('click', () => dispatch({ type: 'storyCloseItem' }));
  });
  // GS-story-yggdrasil: "Engage Jörmungandr" plays the battle cinematic (the outcome is resolved
  // deterministically from the armed ship), THEN dispatches the resolution to land on the recap. Under
  // reduced-motion the cinematic is skipped — straight to the result.
  app.querySelectorAll<HTMLElement>('[data-story-finale-engage]').forEach((el) => {
    el.addEventListener('click', () => {
      resumeAudio();
      const go = (): void => dispatch({ type: 'engageStoryFinale' });
      const won = state.story ? finaleResult(state.story).won : false;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        go();
        return;
      }
      mountStoryFinale({ won, onDone: go });
    });
  });
  // Shop bag-inventory: tap an owned gear chip to pop its card (toggle), for comparison with the stock.
  app.querySelectorAll<HTMLElement>('[data-inspect]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.inspect!;
      shopView.inspectGearId = shopView.inspectGearId === id ? null : id;
      render();
    });
  });
  // Pro Shop accordions (GS-pro-shop-redesign): tap a panel header (Pro Shop / Golf Bag / Upgrades, or the
  // nested upgrade-detail toggle) to expand/collapse it. Independent set, so the shop and bag can BOTH be
  // open to compare — view-only, re-rendered, never persisted.
  app.querySelectorAll<HTMLElement>('[data-shop-panel]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.shopPanel!;
      if (shopView.open.has(id)) shopView.open.delete(id);
      else shopView.open.add(id);
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Trade Market accordion: tap a section header to collapse/expand its card rack (view-only).
  app.querySelectorAll<HTMLElement>('[data-toggle-section]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.toggleSection!;
      if (marketView.collapsed.has(id)) marketView.collapsed.delete(id);
      else marketView.collapsed.add(id);
      render();
    });
  });
  // Trade Market "Show Owned" toggle: flip whether already-owned gear appears in the racks (view-only).
  app.querySelectorAll<HTMLElement>('[data-market-showowned]').forEach((el) => {
    el.addEventListener('click', () => {
      marketView.showOwned = !marketView.showOwned;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Clubhouse stage: tap a body part or the garage to reveal that slot's picker (tap again to close).
  app.querySelectorAll<HTMLElement>('[data-clubslot]').forEach((el) => {
    el.addEventListener('click', () => {
      const slot = el.dataset.clubslot as ClubSlot;
      clubhouseView.slot = clubhouseView.slot === slot ? null : slot;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Travel star-map (GS-journey-map-redesign): tap a branch world to SELECT it — its info card rises over
  // the bottom half of the screen. getAttribute (not dataset) so it works on SVG <g> nodes too. Selecting
  // a world dismisses any open fuel-depot / exit sheet so only one bottom overlay is ever up.
  app.querySelectorAll<HTMLElement>('[data-route-inspect]').forEach((el) => {
    el.addEventListener('click', () => {
      travelView.selectedRouteId = Number(el.getAttribute('data-route-inspect'));
      travelView.depotOpen = false;
      travelView.exitOpen = false;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Close the world info card (✕ / tap the same world again) → back to the full map.
  app.querySelectorAll<HTMLElement>('[data-route-close]').forEach((el) => {
    el.addEventListener('click', () => {
      travelView.selectedRouteId = null;
      sfx.click();
      render();
    });
  });
  // Star Tour star map (GS-star-tour-2): a TAP flies the ship. Tapping a WORLD flies to it and opens the
  // dossier on arrival; tapping empty space flies there (free roam). Handled on the VIEWPORT so the tap
  // point maps to chart coords; a world hit is detected via closest() (works on SVG <g> too). A drag
  // (starTourDragged) is a pan, not a tap. Weather chips + close/records are ordinary buttons.
  {
    const vp = document.getElementById('gs-st-viewport');
    if (vp && state.screen === 'starTour') {
      vp.addEventListener('click', (e) => {
        if (starTourDragged) {
          starTourDragged = false;
          return;
        }
        const target = e.target as Element;
        // Ignore taps on the HUD controls that overlay the map (they have their own handlers). The HUD
        // is the shared bridge frame (GS-star-tour-hud) — `.gs-bhud` covers exit/golfer/records/cog.
        if (target.closest('.gs-bhud, .gs-st-sheet')) return;
        const worldEl = target.closest('[data-startour-course]');
        if (worldEl) {
          flyStarTourToWorld(worldEl.getAttribute('data-startour-course'));
          return;
        }
        // Tapping the SPACEPORT (GS-star-tour-port) flies home + docks → the Clubhouse (the map's way out).
        if (target.closest('[data-startour-port]')) {
          flyStarTourToPort();
          return;
        }
        // Tapping the hidden YGGDRASIL (GS-star-tour-yggdrasil) flies to it and opens the realm overlay.
        if (target.closest('[data-startour-yggdrasil]')) {
          flyStarTourToYggdrasil();
          return;
        }
        // Free flight to the tapped chart point. The SVG renders at zoom×intrinsic and is offset by the
        // letterbox margin when zoomed out, so recover chart coords as `(client − rect − margin + scroll) / zoom`.
        const rect = vp.getBoundingClientRect();
        const z = starTourView.zoom || 1;
        const m = starTourChartMargins(vp, z);
        const cx = (e.clientX - rect.left - m.mx + vp.scrollLeft) / z;
        const cy = (e.clientY - rect.top - m.my + vp.scrollTop) / z;
        flyStarTourToPoint(cx, cy);
      });
    }
  }
  app.querySelectorAll<HTMLElement>('[data-startour-weather]').forEach((el) => {
    el.addEventListener('click', () => {
      starTourView.effect = (el.getAttribute('data-startour-weather') ?? 'none') as CourseEffectId;
      sfx.click();
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-startour-close]').forEach((el) => {
    el.addEventListener('click', () => {
      starTourView.selectedId = null;
      sfx.click();
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-startour-records]').forEach((el) => {
    el.addEventListener('click', () => {
      starTourView.recordsOpen = el.getAttribute('data-startour-records') === '1';
      sfx.click();
      render();
    });
  });
  // Star Tour Yggdrasil overlay close (GS-star-tour-yggdrasil): dismiss the realm-tree sheet.
  app.querySelectorAll<HTMLElement>('[data-startour-ygg]').forEach((el) => {
    el.addEventListener('click', () => {
      starTourView.yggdrasilOpen = el.getAttribute('data-startour-ygg') === '1';
      sfx.click();
      render();
    });
  });
  // Star Tour speed control (GS-star-tour-fuel): toggle the cruise throttle between NORMAL and FAST. FAST
  // is +25% speed and burns 1.5× fuel per distance; the fuel gauge + flight loop read `starTourView.speed`.
  app.querySelectorAll<HTMLElement>('[data-startour-speed]').forEach((el) => {
    el.addEventListener('click', () => {
      starTourView.speed = starTourView.speed === 'fast' ? 'normal' : 'fast';
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Star Tour weapon (GS-star-tour-weapons): the dashboard fire button spits the ship's themed projectile
  // from the nose. Fires directly (no render() — that would wipe live shots); ammo pips update in place.
  app.querySelectorAll<HTMLElement>('[data-startour-fire]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      resumeAudio();
      fireStarTourWeapon();
    });
  });
  // Travel map chrome: the fuel gauge / depot ✕ toggle the fuel-depot sheet (a view flag). Opening it
  // dismisses the exit sheet so the two never stack.
  app.querySelectorAll<HTMLElement>('[data-depot]').forEach((el) => {
    el.addEventListener('click', () => {
      travelView.depotOpen = !travelView.depotOpen;
      if (travelView.depotOpen) travelView.exitOpen = false;
      sfx.click();
      render();
    });
  });
  // The 🚪 exit icon → the end-run / bank confirm sheet ("1" opens, "0" / ✕ closes). Bank/Abandon are
  // normal [data-action]s inside it; a deliberate two-step so one touch never ends the run.
  app.querySelectorAll<HTMLElement>('[data-exit-confirm]').forEach((el) => {
    el.addEventListener('click', () => {
      travelView.exitOpen = el.getAttribute('data-exit-confirm') === '1';
      if (travelView.exitOpen) travelView.depotOpen = false;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Local (non-game) controls on the playing screen: club cycle + aim select.
  app.querySelectorAll<HTMLElement>('[data-cycle]').forEach((el) => {
    el.addEventListener('click', () => {
      // Cycle through only the lie-legal clubs (driver tee-only unless the Driver Dan caddy unlocks it).
      const lie = state.play?.lie ?? 'tee';
      const bag = usableBag(state.run.loadout.bag, lie, state.run.loadout.driverAnywhere ?? false);
      const i = bag.findIndex((c) => c.id === selClubId);
      const ni = Math.max(0, Math.min(bag.length - 1, (i < 0 ? 0 : i) + Number(el.dataset.cycle)));
      selClubId = bag[ni]!.id;
      render();
    });
  });
  // Re-aim at the pin: clear the gesture's aim nudge so the next shot lines up on the flag again.
  app.querySelectorAll<HTMLElement>('[data-aimreset]').forEach((el) => {
    el.addEventListener('click', () => {
      selFreeTarget = null;
      selAimBearing = null;
      render();
    });
  });
  // Aim-mode toggle (GS-default-aim): cycle auto → attack → safe, persist it as the default, and apply
  // it to THIS shot. Re-seed the club to the new mode's fit and clear any drag aim so the mode takes.
  app.querySelectorAll<HTMLElement>('[data-aimmode]').forEach((el) => {
    el.addEventListener('click', () => {
      const next = AIM_MODES[(AIM_MODES.indexOf(selAim) + 1) % AIM_MODES.length]!;
      selAim = next;
      setSetting('aimMode', next);
      selClubId = null; // re-seed the default club to fit the new aim on the next render
      selFreeTarget = null;
      selAimBearing = null;
      resumeAudio();
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Map-nav: overview/follow toggle + recenter.
  app.querySelectorAll<HTMLElement>('[data-mapview]').forEach((el) => {
    el.addEventListener('click', () => {
      const a = el.dataset.mapview;
      if (a === 'reset') resetMapView();
      else mapView = mapView === 'whole' ? 'follow' : 'whole';
      render();
    });
  });
  // Map-nav: zoom the follow-cam in/out (no-op in whole-hole mode).
  app.querySelectorAll<HTMLElement>('[data-mapzoom]').forEach((el) => {
    el.addEventListener('click', () => {
      if (mapView === 'whole') return;
      const factor = el.dataset.mapzoom === 'in' ? 1.4 : 1 / 1.4;
      mapZoom = Math.min(4, Math.max(0.4, mapZoom * factor));
      render();
    });
  });
  // Pull-to-power shot gesture: press the map, drag DOWN to charge power (the cone grows), slide to
  // aim, release to fire (GS-power). Pointer-move/up listen on window so the gesture survives the
  // per-frame re-render that replaces the map element.
  wireShotGesture(app);
  // "Use suggested" snaps the club back to the suggestion for this position.
  app.querySelectorAll<HTMLElement>('[data-suggest]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!state.play) return;
      const sv = shotView(state.play, state.run.loadout);
      const onGreen = sv.lie === 'green' && state.run.loadout.bag.some((c) => c.id === 'putter');
      selClubId = onGreen ? 'putter' : sv.attackClubId;
      render();
    });
  });
  // PWA install nudge: fire the captured prompt, then forget it (one offer).
  app.querySelectorAll<HTMLElement>('[data-install]').forEach((el) => {
    el.addEventListener('click', () => {
      try {
        installView.deferred?.prompt?.();
      } catch {
        /* ignore */
      }
      installView.deferred = null;
      try {
        localStorage.setItem('gs_installNudge', 'dismissed');
      } catch {
        /* ignore */
      }
      render();
    });
  });
  // Stop-intro step switch (GS-intro-split): First Tee (→ hole) / Back (→ arc). View-only; closing
  // the hazards popup as we move keeps steps clean. A UI tick sells the page turn.
  app.querySelectorAll<HTMLElement>('[data-intro-stage]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      introView.stage = el.dataset.introStage === 'hole' ? 'hole' : 'arc';
      introView.traitsOpen = false;
      introView.fieldOpen = false;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Hole-step hazards/benefits popup open/close (view-only, like the settings sheet).
  app.querySelectorAll<HTMLElement>('[data-introtraits]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el.dataset.introtraits;
      if (a === 'keep') return; // clicks inside the sheet body don't close it
      e.stopPropagation();
      introView.traitsOpen = a === 'open';
      sfx.click();
      render();
    });
  });
  // Arc-step field/scout overlay open/close (GS-intro-onescreen) — the sibling of the hazards popup.
  app.querySelectorAll<HTMLElement>('[data-introfield]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el.dataset.introfield;
      if (a === 'keep') return; // clicks inside the sheet body don't close it
      e.stopPropagation();
      introView.fieldOpen = a === 'open';
      sfx.click();
      render();
    });
  });
  // Settings sheet: open/close + toggle a preference (all view-only, persisted in localStorage).
  app.querySelectorAll<HTMLElement>('[data-open-settings]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsOpen = true;
      render();
    });
  });
  // Settings-sheet handlers (toggles, aim segments, close, "Return to title"). Shared with the surgical
  // `refreshSettings` in-sheet update, so an in-sheet tap updates the sheet WITHOUT a full render (which
  // re-mounts the sheet and replays its slide-up animation — the flicker, GS-settings-flicker).
  wireSettingsSheet(app);
  // Ascension difficulty DROPDOWN on character select (GS-diffpills): a native-select pill — the picked
  // tier re-renders the roster (updating each card's club-unlock badge) and rides every golfer card's
  // select action. `change` fires on the OS picker's commit; re-render surgically keeps the pill's value.
  app.querySelectorAll<HTMLSelectElement>('[data-selasc]').forEach((el) => {
    el.addEventListener('change', () => {
      selAscension = Number(el.value);
      // Remember the pick so the picker defaults here next run instead of snapping back to A0.
      setSetting('lastAscension', selAscension);
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Starting club-set / bag DROPDOWN on character select (GS-diffpills): now on every mode — the sterner-
  // bag difficulty axis. Changing it marks the pick touched so it overrides the golfer's wardrobe default
  // for this run (and write-throughs on select); the reducer clamps to the owned tier.
  app.querySelectorAll<HTMLSelectElement>('[data-selclubset]').forEach((el) => {
    el.addEventListener('change', () => {
      selClubSet = el.value as BagTier;
      selClubSetTouched = true;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Dismiss the shot-result popup → reveal the next decision (a local view control).
  app.querySelectorAll<HTMLElement>('[data-popup-continue]').forEach((el) => {
    el.addEventListener('click', () => {
      awaitingShotPopup = false;
      render();
    });
  });
  // The "⛳ Putt" button commits the pace meter at the marker's current position (same as tapping it).
  app.querySelectorAll<HTMLElement>('[data-putt-commit]').forEach((el) => {
    el.addEventListener('click', () => puttMeter?.commit());
  });
  // ◄/► nudge the manual-putt AIM (GS-greens-3) to read the break. A tap steps once; PRESS-AND-HOLD
  // auto-repeats (doubling after a second) so a big borrow on a long steep putt doesn't take dozens
  // of taps. Step/clamp are per-putt (puttAimStep/puttAimMax, scaled to the read). Updates are
  // surgical (puttAimRefresh) — never a full render(), which would remount the pace meter mid-aim.
  app.querySelectorAll<HTMLElement>('[data-putt-aim]').forEach((el) => {
    const dir = Number(el.dataset.puttAim);
    const apply = (mult = 1) => {
      selPuttAim = Math.max(-puttAimMax, Math.min(puttAimMax, (selPuttAim ?? 0) + dir * puttAimStep * mult));
      puttAimRefresh?.();
    };
    let delay = 0;
    let timer = 0;
    let held = false;
    const stop = () => {
      clearTimeout(delay);
      clearInterval(timer);
      delay = timer = 0;
    };
    el.addEventListener('pointerdown', (e) => {
      held = false;
      // Capture the pointer so pointerup still lands here when the finger drifts off the button.
      try { el.setPointerCapture((e as PointerEvent).pointerId); } catch { /* older browsers */ }
      delay = window.setTimeout(() => {
        held = true;
        let ticks = 0;
        timer = window.setInterval(() => apply(++ticks > 12 ? 2 : 1), 80);
      }, 330);
    });
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('click', () => {
      // The click that ends a hold-repeat must not add one more step on release.
      if (held) {
        held = false;
        return;
      }
      // Tap acceleration: consecutive quick taps the SAME way ramp the step up (to ~5×), so a burst
      // of taps covers a long read fast while single taps stay precise (press-and-hold also repeats).
      const now = performance.now();
      if (now - puttAimLastTapMs < 380 && Math.sign(dir) === Math.sign(puttAimStreak || dir)) puttAimStreak += dir;
      else puttAimStreak = dir;
      puttAimLastTapMs = now;
      const accel = Math.min(5, 1 + (Math.abs(puttAimStreak) - 1) * 0.7);
      sfx.click();
      apply(accel);
    });
  });
  // Fringe/apron (GS-fringe-putt): toggle between the putt meter (⛳) and the normal chip gesture (🏌).
  app.querySelectorAll<HTMLElement>('[data-putt-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      selPutt = el.dataset.puttToggle === '1';
      render();
    });
  });

  // Mount the manual-putt pace meter when the ball is on the green awaiting a manual putt.
  if (state.screen === 'playing' && state.play && !animatingPlay && !state.play.done && (awaitingPutt(state.play) || (canPuttFringe(state.play) && selPutt))) {
    const meterEl = document.getElementById('puttmeter');
    if (meterEl) {
      // GS-putt-depth: the drawn MAKE band is the SAME distance-scaled window the resolver holes on —
      // it shrinks the further the ball is from the cup (past the putter's confident range), so a long
      // putt shows a nervously narrow band and a better putter keeps it wide. `puttBandDistanceFactor`
      // is the shared truth so the green band you aim at is exactly the one that drops the putt.
      const skill = puttSkillOf(state.run.loadout);
      const puttDist = dist(state.play.ball, pinOf(state.play.hole));
      const band = (skill.manualBand ?? DEFAULT_MANUAL_BAND) * puttBandDistanceFactor(puttDist, skill.puttRange ?? DEFAULT_PUTT_RANGE);
      // Fit the meter to its container so it never overflows a narrow phone (it mounts at a
      // fixed px width); clamp so it stays usable on tiny and tablet-wide screens alike.
      const meterW = Math.max(240, Math.min(420, meterEl.clientWidth || 300));
      puttMeter = mountPuttMeter(meterEl, {
        width: meterW,
        band,
        // The caddy now stands in the framed badge beside the meter (only a putting specialist), so
        // the meter itself draws no figure and uses its full width.
        onCommit: (pace) => dispatch({ type: 'putt', control: { pace, aim: puttAimResolved } }),
      });
    }
  }

  // Animated weather over the aim/putt map (GS-journey-fx rework): the sky + air are alive while you
  // line up, drawn by the SAME shared module the in-flight view uses. Skipped while a shot animates
  // (the play view owns the canvas + draws its own weather then).
  if (state.screen === 'playing' && state.play && !animatingPlay) {
    const wEl = document.querySelector<HTMLElement>('[data-weather]');
    if (wEl) {
      const ball = state.play.ball;
      const pin = pinOf(state.play.hole);
      weatherOverlay = mountWeatherOverlay(
        wEl,
        state.play.hole,
        [pin[0] - ball[0], pin[1] - ball[1]],
        { width: DMAP_W, height: DMAP_H, focusBias: DMAP_BIAS },
        // Animate the world-decor twins over the aim/putt map too (GS-cetus-flow / GS-ship-feel /
        // GS-meteor-strikes) — armed by the decision/putt branch with the map's exact projector so the
        // river/junk/craters line up beneath. null in whole-hole fit (can't align) ⇒ sky-only overlay.
        overlayDecor ?? undefined,
      );
    }
  }

  // Draw the hired caddy into each framed gold badge on screen (the decision screen's bottom-left
  // figure, the putting screen's, and the watch screen's bottom-right portrait, GS-fullmap). The play
  // view draws its own corner guard while animating; these framed badges cover the aim-and-charge,
  // putting, and watch screens. Each badge canvas carries its caddy id in `data-caddy`, so this one
  // generic pass serves every screen. A one-shot draw per render (the idle bob updates whenever the
  // screen re-renders — live while charging), so no rAF.
  document.querySelectorAll<HTMLCanvasElement>('canvas.gs-caddycv[data-caddy]').forEach((cv) => {
    const id = cv.dataset.caddy;
    if (!hasCaddyArt(id)) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // The figure is authored ~64u tall; draw it scaled to fill the badge, feet near the bottom.
    // Mirror the portrait in left-handed mode (GS-lefty) so the caddy faces with the flipped cast.
    drawCaddy(ctx, id, cv.width / 2, cv.height - 8, cv.height * 0.92, performance.now(), lefty());
  });


  // Mount the animated play view on the result screen.
  if (state.screen === 'result' && state.played) {
    const playEl = document.getElementById('play');
    const holePlay = state.played[state.viewHole];
    const hole = state.course.holes[state.viewHole];
    if (playEl && holePlay && hole) {
      view = mountPlayView(playEl, hole, holePlay.shots, holePlay.putts, {
        width: 340,
        height: 520,
        biome: holeBiome(hole), themeId: holeThemeId(hole), effect: currentEffect(),
        rainbow: rainbowActive(),
        tradeTents: tentsActive(),
        meteorScorch: scorchActive(),
        groundPatch: patchActive(),
        golferLook: golferLook(),
        caddyId: caddyId(),
        lefty: lefty(),
        onImpact: (kind, quality, clubId) => (kind === 'shot' ? sfx.swing(quality ?? 0.6, clubId) : sfx.putt()),
        onLand: (lie, penalty, knockedDown) =>
          sfx.land(lie, penalty, archetypeFor(holeThemeId(hole), holeBiome(hole)), knockedDown),
        onRedirect: (kind, phase, travelMs) =>
          phase === 'fire' ? sfx.redirectFire(kind, travelMs) : sfx.redirectHit(kind),
        onCaddyEffect: playCaddyVoice,
        onTentHit: playTentBonk,
        // Ship-corridor wall clang (GS-ship-walls): force the world's struck-metal tree voice ('clang'
        // on the derelict) so a wall ricochet rings like hollow hull steel.
        onWallBounce: () => sfx.land('fairway', undefined, archetypeFor(holeThemeId(hole), holeBiome(hole)), true),
      });
    }
  }

  // Animate pending shots on the playing screen, then re-render for the next decision.
  if (state.screen === 'playing' && state.play && animatingPlay) {
    const playEl = document.getElementById('play');
    if (playEl) {
      const play = state.play;
      // Zoom + follow the ball in flight, framed to the actual shot travel so the camera keeps up
      // with the ball without clipping it (and matches the decision map's zoom level).
      const travel = Math.max(
        20,
        ...animatingPlay.shots.map((s) => Math.hypot(s.rest[0] - s.from[0], s.rest[1] - s.from[1])),
      );
      const hadShots = animatingPlay.shots.length > 0;
      const animPin = pinOf(play.hole);
      // A PUTTS-ONLY watch (rolling the ball out on the green) needs NO follow-cam: the putt screen
      // already framed the WHOLE ball↔cup span (puttViewRadius, midpoint-centred), so the ball simply
      // rolls across a STATIC frame — exactly the putt aim screen held still (the documented "reuses
      // the putt screen's framing"). Crucially a static camera lets playView's scene cache HOLD: the
      // follow-cam rebuilds the projector every frame, which re-ran the whole heavy `buildScene`
      // (flora, rough gradient, green contour art) 60×/sec — the putt-watch chug, worst on the
      // frost/ice greens whose sparkle + relief art paint heaviest. Off the green (a real shot in the
      // batch) still follows the ball in flight. (GS-putt-watch-lag.)
      const focus: [number, number] = hadShots
        ? (animatingPlay.shots[0]?.from ?? animatingPlay.putts[0]?.from ?? play.ball)
        : // Centre on the ball↔cup MIDPOINT, matching the putt screen's `puttMid` frame exactly.
          [
            ((animatingPlay.putts[0]?.from ?? play.ball)[0] + animPin[0]) / 2,
            ((animatingPlay.putts[0]?.from ?? play.ball)[1] + animPin[1]) / 2,
          ];
      // Orient pin-up from the focus (fixed for the whole animation so the world doesn't spin
      // mid-flight) — matches the decision / putt map the player just aimed on (origin→pin up).
      const animUp: [number, number] = [animPin[0] - focus[0], animPin[1] - focus[1]];
      // Fill the WHOLE full-bleed map (the `.gs-bigmap` is absolute inset:0 = the viewport), so the
      // watch screen has no letterboxed dead space below the canvas. The canvas can't aspect-scale
      // via CSS like the SVG map can, so we size it to the container's real pixels and let the
      // follow-cam show a little more vertically; the corridor framing (width-limited on viewRadius)
      // still matches the decision map.
      const animW = Math.round(playEl.clientWidth || (window.innerWidth || 400));
      const animH = Math.round(playEl.clientHeight || (window.innerHeight || 800));
      view = mountPlayView(playEl, play.hole, animatingPlay.shots, animatingPlay.putts, {
        width: animW,
        height: animH,
        biome: holeBiome(play.hole), themeId: holeThemeId(play.hole), effect: currentEffect(),
        rainbow: rainbowActive(),
        tradeTents: tentsActive(),
        meteorScorch: scorchActive(),
        groundPatch: patchActive(),
        golferLook: golferLook(),
        caddyId: caddyId(),
        lefty: lefty(),
        onCaddyEffect: playCaddyVoice,
        onTentHit: playTentBonk,
        // Ship-corridor wall clang (GS-ship-walls): the world's struck-metal voice on a wall ricochet.
        onWallBounce: () => sfx.land('fairway', undefined, archetypeFor(holeThemeId(play.hole), holeBiome(play.hole)), true),
        focus,
        // Start the watch-cam at the EXACT zoom the decision map was framed at (the player was just
        // looking at it — release must not skip-jump), falling back to the travel-framed reach when
        // no decision preceded this animation (resume, auto-advance). The radius holds for the whole
        // animation; the follow-cam pans to keep up with the ball either way. A putts-only animation
        // keeps the PUTT screen's framing the same way (puttViewRadius) — the old fixed 25 popped the
        // camera out and back around every stroke on the green.
        viewRadius: hadShots ? decisionRadius ?? decisionReach(travel) : puttViewRadius ?? 25,
        // Putts-only: centre the ball↔cup span (bias 0.5) exactly like the putt screen; a shot
        // watch keeps the low decision-map bias so more of the hole ahead stays in view.
        focusBias: hadShots ? DMAP_BIAS : 0.5,
        up: animUp,
        // Follow the ball only when there's a real shot in flight; a green putt holds the frame
        // still so the heavy scene builds ONCE, not every frame (GS-putt-watch-lag).
        follow: hadShots,
        // Draw the moving Cetus river / drifting ship junk only on a SHOT watch — a putts-only green
        // watch is zoomed to ~25 yds, where the drifting ship SECTIONS floated weirdly over the cup.
        ambientDrift: hadShots,
        onImpact: (kind, quality, clubId) => {
          // Contact cue — fires at the strike moment (the windup has already played).
          if (kind === 'shot') {
            sfx.swing(quality ?? 0.6, clubId);
            haptic((quality ?? 0) > 0.85 ? HAPTICS.good : HAPTICS.tap);
          } else {
            sfx.putt();
          }
        },
        // Touchdown surface cue (GS-audio-3): the splash/sizzle/whale/tree-knock, voiced off the
        // hole's world archetype so the tree you clipped sounds like the tree you see.
        onLand: (lie, penalty, knockedDown) =>
          sfx.land(lie, penalty, archetypeFor(holeThemeId(play.hole), holeBiome(play.hole)), knockedDown),
        // Caddy-guard projectile cues (GS-audio-4): the laser pew / boomerang whir at the launch,
        // the zap / wooden crack as it meets the ball — layered under the caddy's voice line.
        onRedirect: (kind, phase, travelMs) =>
          phase === 'fire' ? sfx.redirectFire(kind, travelMs) : sfx.redirectHit(kind),
        onDone: () => {
          animatedShots = play.shots.length;
          animatedPutts = play.puttLogs.length;
          // The rarest shot in the game (GS-ace): the TEE shot holed out. Worth a full-screen takeover.
          const isAce = play.done && play.holed && play.strokes === 1;
          // A holed −2 / −3 that ISN'T an ace earns its own fly-over (GS-bird). Ace wins precedence
          // (a holed-out par-4 is technically an albatross, but a hole-in-one is the bigger moment).
          const relToPar = play.holed ? play.strokes - play.hole.par : 0;
          const birdKind: 'eagle' | 'albatross' | null =
            play.done && play.holed && !isAce
              ? relToPar <= -3 ? 'albatross' : relToPar === -2 ? 'eagle' : null
              : null;
          // Terminal cue: ball in the cup vs found a hazard, as the ball settles.
          const lastShot = play.shots[play.shots.length - 1];
          if (play.holed) {
            sfx.holeOut();
            haptic(HAPTICS.holeOut);
          } else if (lastShot?.penalty) {
            // The touchdown surface voice (GS-audio-3) already sounds hazards with their own cue — a
            // water splash, a lava sizzle, the void implosion, the star-ocean whale. Only add the generic
            // penalty "wah" for a SURFACELESS penalty (OB / lost with no surface voice), so a water/void
            // ball doesn't play BOTH the new splash and the old wah (the doubled-sound bug).
            if (!landVoiceOf(lastShot.lieTo, lastShot.penalty)) sfx.penalty();
            haptic(HAPTICS.bad);
          }
          // Hold a beat after the ball settles so the finish reads as finished before the next screen
          // — chipping/putting used to cut to the follow-up instantly. Cases:
          //  • a HOLE-IN-ONE → a brief beat for the ball to drop, then the celebration overlay (which
          //    runs onDismiss → render() to land on the normal end-of-hole screen);
          //  • non-terminal full shot → pop the rich shot-result card (auto-advances if Fast Shots is on);
          //  • terminal (holed/picked up/auto putt-out done) → a longer hold, then the done screen;
          //  • non-terminal putt(s) only (manual lag) → a brief hold, then back to the putt meter.
          const feelMs = (window as unknown as { _gsFeel?: Record<string, number> })._gsFeel ?? {};
          // A StarMart tent (GS-tent-interactions): once the ricochet settles, pop the shard shop for the
          // mid-hole. Takes precedence over the shot-result card; opening it advances via the reducer.
          const starmartHit = !play.done && play.shots[play.shots.length - 1]?.tentHit?.effect === 'starmart';
          if (starmartHit) {
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              dispatch({ type: 'openStarmart' });
            }, feelMs.popupDelayMs ?? 340);
          } else if (isAce && aceCelebratedHole !== play.holeIndex) {
            aceCelebratedHole = play.holeIndex;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              showAceCelebration(
                {
                  holeNo: play.holeIndex + 1,
                  total: state.course.holes.length,
                  par: play.hole.par,
                  club: lastShot?.club.name,
                  aceNo: state.lifetimeAces + 1, // this ace (counted into the save at stop scoring)
                  // The secret Comet Rider (GS-ace-ship) is granted at stop scoring on any ace you don't
                  // yet own it; not owning it now = this ace earns it, so reveal it in the takeover.
                  shipUnlocked: !state.ownedShips.includes(ACE_SHIP_ID),
                },
                () => render(),
              );
            }, feelMs.aceDelayMs ?? 380);
          } else if (birdKind && birdCelebratedHole !== play.holeIndex) {
            birdCelebratedHole = play.holeIndex;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              showBirdCelebration(
                birdKind,
                { holeNo: play.holeIndex + 1, par: play.hole.par, club: lastShot?.club.name },
                () => render(),
              );
            }, feelMs.birdDelayMs ?? 380);
          } else if (play.done) {
            const hold = feelMs.resultHoldMs ?? 700;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              render();
            }, hold);
          } else if (hadShots) {
            const delay = feelMs.popupDelayMs ?? 320;
            // Fast Shots: skip the tap-to-continue and roll straight on after a short beat — the
            // new lie + its effect are highlighted on the next decision bar, so you stay informed
            // without the per-shot tap. Default off (the result card waits for a tap/dismiss).
            if (getSettings().fastShots) {
              popupTimer = window.setTimeout(() => {
                popupTimer = 0;
                render();
              }, (feelMs.fastAdvanceMs ?? 620));
            } else {
              popupTimer = window.setTimeout(() => {
                popupTimer = 0;
                awaitingShotPopup = true;
                render();
              }, delay);
            }
          } else {
            const hold = feelMs.puttHoldMs ?? 450;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              render();
            }, hold);
          }
        },
      });
    } else {
      // No canvas to animate into — skip ahead so we never get stuck.
      animatedShots = state.play.shots.length;
      animatedPutts = state.play.puttLogs.length;
    }
  }
}

/**
 * Decide whether to play the loading-intro cinematic. It's cosmetic, so it degrades safely:
 * we boot the real title FIRST (so the page has genuinely painted), then overlay the intro
 * on top and remove it when it finishes/skips. Gated so it plays on a fresh session but not
 * on every in-session reload; `?intro=1` forces it, `?intro=0` (or reduced-motion) skips it.
 */
function shouldPlayIntro(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('intro');
    if (q === '1') return true;
    if (q === '0') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem('gs_introSeen') === '1') return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Register the offline service worker (PWA). Guarded to http/https so it never fires under
 * the `file://` smoke test (where registration would reject), and fully swallowed so a SW
 * failure can never strand the boot — the app works identically with no worker. The worker
 * is network-first (see public/sw.js), so it adds offline play without risking a stale page.
 */
function registerServiceWorker(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    // Relative URL → the worker scopes to our own subpath, never a sibling app on the origin.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline support is a bonus; never surface or block on its failure */
      });
    });
  } catch {
    /* ignore */
  }
}

/** Entry, called from main.ts inside try/catch so any boot fault is visible. */
export function start(): void {
  boot();
  registerServiceWorker();
  // Capture the install prompt so the title can offer an "Install app" button (instead of the
  // browser's own mini-infobar). Re-render so the button appears once it's available.
  try {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installView.deferred = e as Event & { prompt?: () => void };
      if (state?.screen === 'title') render();
    });
  } catch {
    /* ignore — install nudge is a bonus */
  }
  if (!shouldPlayIntro()) return;
  try {
    sessionStorage.setItem('gs_introSeen', '1');
  } catch {
    /* ignore */
  }
  try {
    mountIntro({});
  } catch {
    /* the title is already painted underneath — losing the intro is harmless */
  }
}
