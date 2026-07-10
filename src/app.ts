/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName, playTotals, stablefordPoints } from './sim/score';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { shotCardHTML } from './render/cards';
import { renderHoleSVG, renderPuttOverlaySVG, PUTT_OVERLAY_ID, renderShotOverlaySVG, SHOT_OVERLAY_ID } from './render/holeView';
import { holeProjector, type ProjectOptions } from './render/project';
import { createWeather } from './render/weather';
import { shotView, previewShot, awaitingPutt, canPuttFringe } from './sim/rpg/play';
import { mountPuttMeter, type PuttMeterHandle } from './render/puttMeter';
import { drawCaddy, hasCaddyArt, CADDY_VOICE } from './render/caddyArt';
import { speakCaddy } from './render/speech';
import { biomeCarryMult, pinOf, greenDepth, forcedCarry, DEFAULT_MANUAL_BAND, DEFAULT_PUTT_RANGE, MANUAL_IDEAL_PACE, puttBreakYd, puttBreakBow, puttBandDistanceFactor, idealPuttAim, puttPathPreview } from './sim/round';
import { puttSkillOf } from './sim/rpg/economy';
import { lieInfo, roughLieOf } from './sim/shot';
import { archetypeFor } from './sim/course/themes';
import { bearing, dist, type Hole, type Vec } from './sim/course/contract';
import { type ShotSpread } from './sim/round';
import { type SprayGeomInput } from './render/holeView';
import { ACE_CREDIT_BONUS, maxPowerOf, usableBag } from './sim/rpg/economy';
import { getFormat, ASGARD_FORMAT } from './sim/rpg/formats';
import { currentBoss, effectiveCut, holeGateArmed, snapshotRun, currentCourse } from './sim/rpg/run';
import { shopItem } from './sim/rpg/economy';
import { CHARACTERS } from './sim/rpg/characters';
import { endlessMilestonesCrossed, endlessMilestoneShards, endlessSetGateOverPar, endlessSetLabel, endlessSetToPar, endlessUnlocksCrossed } from './sim/rpg/endless';
import { liveLeaderboard } from './sim/rpg/league';
import { holeResult } from './sim/rpg/play';
import { isTeamDuelBoss } from './sim/rpg/formats';
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
import { SAVE_VERSION, defaultSave } from './save/schema';
import { mountIntro } from './render/introView';
import { sfx, resumeAudio, landVoiceOf } from './render/audio';
import { setMusicScene, type MusicSceneId } from './render/music';
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
  liveLeaderChip,
  matchHud,
  teamDuel,
  teamFormatLabel,
  teamPartnerChar,
} from './app/duelHud';
import { installView, titleScreen } from './app/titleScreens';
import { endlessRoundSoFar, introScreen, introTraitsOverlay, introView } from './app/introScreens';
import { bossRewardScreen, gameoverScreen, resultScreen, victoryInfo } from './app/resultScreens';
import { shopScreen, shopView, starmartScreen } from './app/shopScreens';
import { MARKET_SECTION_IDS, marketView, tradeMarketScreen } from './app/marketScreens';
import { clubhouseHallScreen, clubhouseScreen, clubhouseView, type ClubSlot } from './app/clubhouseScreens';
import { routeInfoOverlay, travelScreen, travelView } from './app/travelScreens';
import { asgardMapScreen, asgardResultScreen, asgardLiveBoardHTML } from './app/asgardScreens';

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
    const save = loadSave();
    stage('loaded');
    const meta = {
      bestStableford: save.bestStableford,
      bestDistance: save.bestDistance,
      shards: save.shards,
      metaUpgrades: save.metaUpgrades,
      maxAscension: save.maxAscension,
      maxAscensionByCharacter: save.maxAscensionByCharacter,
      lifetimeAces: save.lifetimeAces,
      ownedShips: save.ownedShips,
      ownedApparel: save.ownedApparel,
      shipByCharacter: save.shipByCharacter,
      hatByCharacter: save.hatByCharacter,
      shirtByCharacter: save.shirtByCharacter,
      pantsByCharacter: save.pantsByCharacter,
      golfBagByCharacter: save.golfBagByCharacter,
      driverByCharacter: save.driverByCharacter,
      bagTier: save.bagTier,
      bagTierByCharacter: save.bagTierByCharacter,
      unlockedClubsByCharacter: save.unlockedClubsByCharacter,
      clubhouseVisit: save.clubhouseVisit,
      endlessBestHoles: save.endlessBestHoles,
      marmotBartender: save.marmotBartender,
      marmotTips: save.marmotTips,
      endlessRuns: save.endlessRuns,
      reputationByCharacter: save.reputationByCharacter,
      priceRefund: save.priceRefund,
    };
    const seed = seedFromUrl() ?? freshRunSeed();
    // Always land on the title screen; a saved run is offered as "Continue", never
    // auto-resumed — so the format choice is always reachable.
    setState(initState(seed, meta, save.activeRun));
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
 * Both compose, and both reuse the real reducer to build an honest run — nothing forks the game's logic.
 */
function applyDebugParams(): void {
  const rainbow = new URLSearchParams(location.search).get('rainbow');
  const asgard = new URLSearchParams(location.search).get('asgard');
  if (!rainbow && !asgard) return;
  // Build a genuine interactive run with the first golfer, via the same reducer path the UI uses.
  let s = reduce(state, { type: 'start', format: 'unending' });
  s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
  let run = s.run;
  if (rainbow) run = { ...run, loadout: shopItem('rainbow-ball')!.apply(run.loadout) };
  s = { ...s, run, course: currentCourse(run) };
  // Open the Bifröst directly: suspend this run and reveal the Himinbjörg map.
  if (asgard) s = { ...s, screen: 'asgardMap', asgardReturn: snapshotRun(run) };
  setState(s);
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

function persist(): void {
  writeSave({
    version: SAVE_VERSION,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    shards: state.shards,
    metaUpgrades: state.metaUpgrades,
    maxAscension: state.maxAscension,
    maxAscensionByCharacter: state.maxAscensionByCharacter,
    lifetimeAces: state.lifetimeAces,
    ownedShips: state.ownedShips,
    ownedApparel: state.ownedApparel,
    shipByCharacter: state.shipByCharacter,
    hatByCharacter: state.hatByCharacter,
    shirtByCharacter: state.shirtByCharacter,
    pantsByCharacter: state.pantsByCharacter,
    golfBagByCharacter: state.golfBagByCharacter,
    driverByCharacter: state.driverByCharacter,
    bagTier: state.bagTier,
    bagTierByCharacter: state.bagTierByCharacter,
    unlockedClubsByCharacter: state.unlockedClubsByCharacter,
    clubhouseVisit: state.clubhouseVisit,
    endlessBestHoles: state.endlessBestHoles,
    marmotBartender: state.marmotBartender,
    marmotTips: state.marmotTips,
    endlessRuns: state.endlessRuns,
    reputationByCharacter: state.reputation,
    // The one-off Trade Market price-cut notice (GS-trade-rebalance): persisted while pending so a
    // reload before dismissal still shows it; cleared to undefined once the player closes it.
    priceRefund: state.priceRefund,
    // Persist the LIVE run only when it's actually underway (a golfer picked). The title's
    // placeholder run is active-but-empty — snapshotting it used to overwrite a saved run the
    // moment anything dispatched from the title. While no real run is live, any resumable offer
    // the state carries (a reload's, or one parked by 'toTitle') is kept instead of wiped.
    // The Asgard tournament run (GS-asgard) is NEVER persisted — a mid-tournament quit resumes the
    // SUSPENDED real run (the Asgard attempt is forfeited, the Rainbow Ball intact), so persist the
    // parked snapshot instead of the ephemeral tournament run.
    activeRun:
      state.run.status === 'active' && state.run.formatId === ASGARD_FORMAT
        ? state.asgardReturn
        : state.run.status === 'active' && state.run.loadout.characterId
        ? snapshotRun(state.run)
        : state.resumable,
  });
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
    if (action.type === 'start') {
      selAscension = Math.max(0, Math.min(state.maxAscension, getSettings().lastAscension));
      selClubSet = state.bagTier;
      selClubSetTouched = false;
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
    // with the hazards popup closed (GS-intro-split) — never a stale sub-step from last stop. The
    // Unending Universe past its first tee skips straight to the HOLE step (GS-intro-endless): the
    // arc briefing repeats the round summary the result screen just showed, so every route jump threw
    // up the same card twice; it stays one "‹ Briefing" tap away on the hole step.
    if (state.screen === 'intro' && prevScreen !== 'intro') {
      introView.stage = holeGateArmed(state.run) && state.run.stopIndex > 0 ? 'hole' : 'arc';
      introView.traitsOpen = false;
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
let selAim: 'attack' | 'safe' = 'attack';
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

/** The aim readout inside the break-read row — split out so an aim nudge can update JUST this span
 *  in place (the ◄/► buttons keep their listeners; see puttAimRefresh). */
function puttAimLabel(breakYd: number, aim: number, dbl = false): string {
  const fmt = (y: number) => `${Math.abs(y).toFixed(1)}yd ${y >= 0 ? 'right' : 'left'}`;
  // GS-green-contour: a double-breaker is called out — its NET break can be tiny while the line
  // still S-curves, so "breaks —" alone would read as a flat putt and lie about the picture.
  const brkTxt = dbl
    ? `double-breaks${Math.abs(breakYd) < 0.2 ? '' : ` · nets ${fmt(breakYd)}`}`
    : Math.abs(breakYd) < 0.2 ? '—' : `breaks ${fmt(breakYd)}`;
  return `Aim <b>${Math.abs(aim) < 0.2 ? 'straight' : fmt(aim)}</b><br><span style="opacity:.6;">slope ${brkTxt}</span>`;
}

/** The break-read row on the putt screen (GS-greens-3): the slope's break + ◄/► aim controls (or the
 *  caddy's read). `breakYd`/`aim` are signed (+ = right of the line); the player aims to cancel break. */
function puttAimRow(breakYd: number, aim: number, reads: boolean, dbl = false): string {
  const fmt = (y: number) => `${Math.abs(y).toFixed(1)}yd ${y >= 0 ? 'right' : 'left'}`;
  const brkTxt = dbl
    ? `double-breaks${Math.abs(breakYd) < 0.2 ? '' : ` · nets ${fmt(breakYd)}`}`
    : Math.abs(breakYd) < 0.2 ? '—' : `breaks ${fmt(breakYd)}`;
  if (reads) {
    return `<div style="font-size:11.5px;opacity:.85;text-align:center;margin:1px 0;">🐀 <b>Mole reads:</b> aim ${Math.abs(aim) < 0.2 ? 'straight' : fmt(aim)} · <span style="opacity:.7;">${brkTxt}</span></div>`;
  }
  return `<div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:11.5px;margin:1px 0;">
      <button class="gs-btn gs-mini" data-putt-aim="-1" title="Aim left">◄</button>
      <span id="puttaimlabel" style="min-width:120px;text-align:center;">${puttAimLabel(breakYd, aim)}</span>
      <button class="gs-btn gs-mini" data-putt-aim="1" title="Aim right">►</button>
    </div>`;
}
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

/** Plain-language wind read relative to the hole's play direction (up = toward the green). */
function windDescription(hole: Hole): string {
  const w = hole.wind;
  if (!w || w.spd < 1) return '🍃 Calm';
  const holeBearing = bearing(hole.tee, hole.green);
  const delta = ((w.dir - holeBearing + 540) % 360) - 180; // −180..180; 0 = tailwind (toward green)
  const along = Math.cos((delta * Math.PI) / 180);
  const kind = along > 0.4 ? 'tailwind' : along < -0.4 ? 'headwind' : 'crosswind';
  const arrow = `<span style="display:inline-block;transform:rotate(${delta.toFixed(0)}deg);">⬆</span>`;
  return `🌬 ${Math.round(w.spd)} mph ${kind} ${arrow}`;
}

/** The current lie as a prominent, colour-coded chip with its effect on the NEXT shot — so the
 *  player always knows what they're playing from and how it bites (carry penalty + spray), shown
 *  right where the shot decision is made. This is the lie-awareness the per-shot popup used to
 *  carry, moved to the moment it actually matters. */
function lieChip(lie: string): string {
  const info = lieInfo(lie);
  const label = info.label ?? lie;
  const carryPen =
    info.carryMult < 0.99 ? `−${Math.round((1 - info.carryMult) * 100)}% carry`
    : info.carryMult > 1.01 ? `+${Math.round((info.carryMult - 1) * 100)}% carry` // hot/fast lies fly long
    : '';
  const spray = info.dispersionMult >= 1.55 ? 'very wild' : info.dispersionMult >= 1.25 ? 'wild' : info.dispersionMult > 1.05 ? 'loose' : '';
  const eff = [carryPen, spray].filter(Boolean).join(' · ');
  const trouble = !!info.penalty || info.carryMult <= 0.6 || info.dispersionMult >= 1.55;
  const caution = info.carryMult < 0.95 || info.dispersionMult > 1.15;
  const col = trouble ? '#ff6b6b' : caution ? '#ffc454' : '#5fd45a';
  const dot = trouble ? '🔴' : caution ? '🟠' : '🟢';
  return `<span class="gs-liechip" style="border-color:${col};color:${col};">${dot} <b style="color:var(--gs-ink);">${label}</b>${eff ? ` <span style="opacity:.85;">${eff}</span>` : ''}</span>`;
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
function decisionView(play: NonNullable<UiState['play']>, spray: ShotSpread): ProjectOptions {
  const base: ProjectOptions = { width: DMAP_W, height: DMAP_H };
  if (mapView === 'whole') return base; // whole-hole fit — see the green + full layout (tee→green up)
  const reach = decisionReach(spray.carryHigh) / mapZoom;
  const focus: [number, number] = [play.ball[0] + mapPan[0], play.ball[1] + mapPan[1]];
  // Reorient so the PIN is up-screen — keeps the contemplated shot pointing UP even when the ball
  // is long of the green (so the pull-to-aim gesture never feels backwards). Degenerate near the
  // hole falls back to tee→green inside the projector.
  const pin = pinOf(play.hole);
  const up: [number, number] = [pin[0] - play.ball[0], pin[1] - play.ball[1]];
  return { ...base, focus, viewRadius: reach, focusBias: DMAP_BIAS, up };
}

/** Running stop score vs the cut-to-beat, coloured by how the run is tracking:
 *  🟢 beating the cut · 🟠 within striking distance · 🔴 well short. */
/** Friendly name for a penalty surface in Sam's hazard read (the carry-to-clear callout). */
function hazardLabel(kind: string): string {
  if (kind === 'water') return 'the water';
  if (kind === 'lava' || kind === 'lavariver') return 'the lava';
  if (kind === 'void' || kind === 'voidrough') return 'the void';
  if (kind === 'cetusdeep') return 'the star-ocean';
  if (kind === 'frozenpond') return 'the pond';
  if (kind === 'creek') return 'the creek';
  return 'the hazard';
}


// The hole index whose ace has already been celebrated, so the full-screen overlay fires exactly
// once per hole-in-one (the play-view onDone can re-fire on a re-render). Reset per hole in render().
let aceCelebratedHole = -1;
// Same one-shot guard for the eagle/albatross fly-over celebration (a non-ace −2 / −3 hole-out).
let birdCelebratedHole = -1;

/** A momentum rail: one pip per hole in the stop, coloured by the score already made (eagle gold →
 *  blow-up red), the current hole ringed, upcoming holes dim — so the run's shape reads at a glance. */
function holePips(): string {
  const total = state.course.holes.length;
  const done = state.stopPlayed ?? [];
  const cur = state.play?.holeIndex ?? done.length;
  const pips = Array.from({ length: total }, (_, i) => {
    if (i < done.length) {
      const r = done[i]!.record;
      const rel = r.strokes - r.par;
      const col = done[i]!.pickedUp
        ? '#b3402f'
        : rel <= -2 ? '#ffd54a' : rel === -1 ? '#5fd45a' : rel === 0 ? '#9fd8e6' : rel === 1 ? '#ffc454' : '#ff6b6b';
      return `<span class="gs-pip" style="background:${col};" title="hole ${i + 1}: ${r.strokes} (par ${r.par})"></span>`;
    }
    return `<span class="gs-pip${i === cur ? ' gs-pip--cur' : ''}"></span>`;
  }).join('');
  return `<div class="gs-pips" aria-hidden="true">${pips}</div>`;
}

function zoneScoreChip(): string {
  // The Unending Universe (GS-set-survival): the number that matters is THIS SET's running four-hole
  // total vs its allowance — show how far under/over you are through the holes played so far, and the
  // target the whole set has to hit. A blow-up hole never ends the run, so this is a budget, not a
  // death clock: it goes amber → red as the set total pushes past the allowance with holes still to go.
  if (holeGateArmed(state.run)) {
    const done = state.stopPlayed ?? [];
    const setSoFar = endlessSetToPar(done); // completed holes of this set (current hole not yet scored)
    const target = endlessSetGateOverPar(state.run.stopIndex);
    const room = target - setSoFar; // over-par budget left for the rest of the set (current hole included)
    const col = room >= 3 ? '#5fd45a' : room >= 0 ? '#ffc454' : '#ff6b6b';
    const soFar = setSoFar > 0 ? `+${setSoFar}` : setSoFar === 0 ? 'E' : `−${-setSoFar}`;
    return `<span class="gs-shotscore" style="color:${col};" title="this set of 4: you're ${soFar} through ${done.length}, needing ${endlessSetLabel(target)} or better for the whole set — a blow-up won't end the run, the four-hole total is what counts">🎯 ${soFar} · need ${endlessSetLabel(target)}</span>`;
  }
  const done = state.stopPlayed ?? [];
  const sf = playTotals(done.map((p) => p.record)).stableford;
  const cut = effectiveCut(state.run, state.course.holes.length);
  const gap = cut - sf;
  const col = gap <= 0 ? '#5fd45a' : gap <= Math.ceil(cut / 2) ? '#ffc454' : '#ff6b6b';
  return `<span class="gs-shotscore" style="color:${col};" title="stop Stableford vs the cut to make">${sf}/${cut} pts</span>`;
}

/** The floating top-left info chip for the full-bleed hole screen (GS-fullmap): hole #/total, par +
 *  length, the live distance, the running zone score on line 1; a thin lie · wind sub-line + the
 *  momentum pips below. Conditions are pared to what matters (an armed lost-rough warning + scramble);
 *  the verbose biome string moved off the play HUD. Translucent, non-intrusive, pass-through. */

/** A short, fun label for a notable hole archetype (GS-shapes-2); '' for a plain straight/dogleg. */
function shapeLabel(shapeId?: string): string {
  if (!shapeId) return '';
  if (shapeId === 'drivable-par-4') return '🏌 Drivable';
  if (shapeId.includes('hairpin')) return '↩ Hairpin';
  if (shapeId.includes('cape')) return '🌊 Cape';
  if (shapeId.includes('double')) return '〰 Double dogleg';
  if (shapeId.startsWith('short-3')) return 'Short';
  if (shapeId.startsWith('long-3')) return 'Long';
  if (shapeId.startsWith('long-')) return 'Long';
  if (shapeId.startsWith('three-shot')) return '3-shot';
  if (shapeId.startsWith('reachable')) return 'Reachable';
  return '';
}

/** A short label for a notable fairway-width archetype (GS-fairway-width); '' for the plain ones
 *  (classic/wander read off the map; 'island' already has the lost-rough warning). */
function widthLabel(widthId?: string): string {
  if (widthId === 'chute') return '🌲 Tight drive';
  if (widthId === 'neck') return '🎯 Tight approach';
  if (widthId === 'hourglass') return '⏳ Pinched waist';
  if (widthId === 'thin') return '📏 Ribbon fairway';
  if (widthId === 'broad') return '🌾 Broad fairway';
  return '';
}

function mapTopInfo(v: ReturnType<typeof shotView>, opts: { shotNo: number; distLabel: string }): string {
  const play = state.play!;
  const len = Math.round(dist(play.hole.tee, play.hole.green));
  // Only the decision-relevant warning survives onto the play HUD (the full conditions list lives on
  // the zone splash): the void's armed lost-rough, which turns an offline miss into a lost ball.
  const lostRough = lieInfo(roughLieOf(play.hole)).penalty ? ' · <span style="color:var(--gs-warn);">🕳 lost rough</span>' : '';
  const boss = currentBoss(state.run);
  // Team duel (GS-team-duel): when YOU carry the partner, show them + the format on the HUD.
  const duel = isTeamDuelBoss(boss) ? teamDuel() : undefined;
  let scrambleLine = '';
  if (duel && duel.partnerSide === 'player') {
    const partner = teamPartnerChar(duel);
    if (partner) {
      const tail =
        duel.format === 'scramble'
          ? play.partnerKept
            ? ' · kept ✓'
            : play.shots.length
            ? ' · yours held'
            : ''
          : ' · reveal at the flag'; // best-ball: their parallel ball stays hidden until the hole ends
      scrambleLine = `<div class="gs-sub" style="color:${partner.style.cap};">🤝 <b>${partner.name}</b> · ${teamFormatLabel(duel.format)}${tail}</div>`;
    }
  }
  return `
    <div class="gs-hud gs-hud-top gs-glass">
      <div class="gs-stats">
        <span>⛳ <b>${play.holeIndex + 1}/${state.course.holes.length}</b></span>
        <span>Par <b>${play.hole.par}</b>·${len}y</span>
        ${shapeLabel(play.hole.shapeId) ? `<span style="color:var(--gs-info);">${shapeLabel(play.hole.shapeId)}</span>` : ''}
        ${widthLabel(play.hole.widthId) ? `<span style="color:var(--gs-info);">${widthLabel(play.hole.widthId)}</span>` : ''}
        <span>${opts.distLabel}</span>
        ${zoneScoreChip()}
        ${liveLeaderChip()}
      </div>
      <div class="gs-sub">${lieChip(v.lie)} ${windDescription(play.hole)}${lostRough}</div>
      ${scrambleLine}
      ${state.match ? `<div style="margin-top:5px;">${matchHud()}</div>` : ''}
      ${holePips()}
    </div>`;
}

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
    // Stableford points — the running gross total is what decides it against the Warriors Three.
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
    const progress = state.run.formatId === ASGARD_FORMAT
      ? // The Asgard tournament (GS-asgard) is STROKE PLAY vs the Warriors Three, not the 20-golfer
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
    selAim = 'attack';
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
  // "suggestion", just the only sensible flat-stick choice.
  const suggested = onGreenPutter ? 'putter' : v.attackClubId;
  // Default selection: putter on the green, else the green-coverage club (longest that still stops on
  // the green). You can still cycle/override; Sam just makes the suggestion explicit and snap-back-able.
  const defaultClubId = suggested;
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
  const mapOpts = decisionView(play, frameSpray);
  // Remember the follow-cam radius the player is LOOKING AT — the shot animation starts at this
  // exact zoom so releasing the gesture never skip-jumps to a different framing (GS-power).
  decisionRadius = mapOpts.viewRadius ?? null;
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
  // Club row: ◄ name ► + (re-aim-at-pin when nudged) + (Sam's snap-to-suggested when hired).
  const clubRow = `<div class="gs-clubrow">
      ${cbtn('◄', -1)}
      <span class="gs-clubname">${usable.find((c) => c.id === selClubId)?.name ?? selClubId}</span>
      ${cbtn('►', 1)}
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
    const aimNote = selFreeTarget && selAimBearing != null && Math.abs(((selAimBearing - bearing(play.ball, pinOf(play.hole)) + 540) % 360) - 180) > 2 ? 'aim adjusted' : 'aim: pin';
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
          overlay.outerHTML = renderShotOverlaySVG(play.hole, {
            width: DMAP_W,
            height: DMAP_H,
            focus: mapOpts.focus,
            viewRadius: mapOpts.viewRadius,
            focusBias: mapOpts.focusBias,
            up: mapOpts.up,
            spray: sprayNow,
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

/** The settings sheet: player-owned feel/control prefs (sound, haptics, fast shots, swing gesture,
 *  left-handed, reduced motion), plus — anywhere but the title itself — a "Return to title" escape
 *  hatch (GS-settings-nav). An underway run is parked as a resumable snapshot, never destroyed. */
function settingsOverlay(): string {
  const s = getSettings();
  const row = (key: keyof Settings, label: string, desc: string): string => {
    const on = s[key];
    return `<button class="gs-setrow" data-setting="${key}">
      <span class="gs-setlabel"><b>${label}</b><span>${desc}</span></span>
      <span class="gs-toggle${on ? ' gs-toggle--on' : ''}" aria-hidden="true"><span class="gs-knob"></span></span>
    </button>`;
  };
  const midRun = state.run.status === 'active' && !!state.run.loadout.characterId;
  const homeRow =
    state.screen === 'title'
      ? ''
      : `<button class="gs-setrow" data-settings-home="1">
          <span class="gs-setlabel"><b>🏠 Return to title</b><span>${midRun ? 'Your run is saved — continue it any time' : 'Back to the main menu'}</span></span>
          <span style="font-size:16px;opacity:.6;" aria-hidden="true">→</span>
        </button>`;
  return `
    <div class="gs-sheet-backdrop" data-settings="close">
      <div class="gs-sheet" data-settings="keep">
        <div class="gs-sheet-head"><b style="font-size:17px;">⚙ Settings</b>
          <button class="gs-mapbtn" data-settings="close" title="Close">✕</button></div>
        ${row('sound', 'Sound', 'Chimes & contact cues (no downloads)')}
        ${row('music', 'Music', 'Ambient world themes — a different mood per world')}
        ${row('haptics', 'Haptics', 'Vibration feedback on supported phones')}
        ${row('fastShots', 'Fast shots', 'Skip the tap after each shot — roll straight on')}
        ${row('leftHanded', 'Left-handed', 'Enables left handed mode')}
        ${row('reducedMotion', 'Reduced motion', 'Calmer effects & celebrations')}
        ${homeRow}
        <div style="text-align:center;margin-top:10px;">
          <button class="gs-btn gs-btn--primary" data-settings="close" style="padding:11px 26px;">Done</button>
        </div>
      </div>
    </div>`;
}

/**
 * The one-off Trade Market price-cut notice (GS-trade-rebalance) — shown once, over any screen, when
 * the save migration refunded shards for the 40% price drop. A single "Got it" close button dispatches
 * `dismissPriceNotice`, which clears the flag so it never returns. Reuses the settings sheet chrome.
 */
function priceNoticeOverlay(): string {
  const refund = state.priceRefund ?? 0;
  return `
    <div class="gs-sheet-backdrop" style="align-items:center;">
      <div class="gs-sheet" style="max-width:380px;text-align:center;">
        <div style="font-size:34px;margin:2px 0 6px;">🛰️</div>
        <b style="font-size:19px;">Trade Market Update</b>
        <p style="margin:12px 0 6px;color:var(--gs-ink);line-height:1.5;">
          Every Trade Market price — ships, apparel, and club sets — has been cut by <b>40%</b>.
        </p>
        <p style="margin:6px 0 4px;line-height:1.5;">
          You've been refunded the difference on everything you already own:
        </p>
        <div style="font-size:24px;font-weight:800;color:var(--gs-gold, #e08a2b);margin:10px 0 4px;">
          ✦ +${refund.toLocaleString()} Star Shards
        </div>
        <div style="opacity:.7;font-size:13px;margin-bottom:14px;">added to your balance</div>
        <button class="gs-btn gs-btn--primary" data-action='${JSON.stringify({ type: 'dismissPriceNotice' })}' style="padding:11px 30px;">Got it</button>
      </div>
    </div>`;
}

/**
 * The interactive SCRAMBLE ball-choice screen (GS-team-duel): both balls just hit from the same spot
 * are shown — on an inline map (player line + partner line) and as two info cards with lie + distance
 * to the pin — and the player CONFIRMS which to play on from. A real scramble decision: take the safe
 * one in the fairway, or the aggressive one nearer the pin.
 */
function scrambleChoiceOverlay(): string {
  const sc = state.scrambleChoice!;
  const duel = teamDuel();
  const partner = duel ? teamPartnerChar(duel) : undefined;
  const hole = sc.base.hole;
  // Both balls from the SAME spot: the player's line solid, the partner's muted (ghost) beneath.
  const map = renderHoleSVG(hole, {
    width: 320,
    height: 240,
    biome: holeBiome(hole),
    themeId: holeThemeId(hole),
    rainbow: rainbowActive(),
    tradeTents: tentsActive(),
    meteorScorch: scorchActive(),
      groundPatch: patchActive(),
    shots: [sc.player.log],
    ghostShots: [sc.partner.log],
  });
  const option = (label: string, ex: typeof sc.player, dist: number, pick: 'player' | 'partner', accent: string): string => `
    <div style="flex:1 1 150px;min-width:148px;display:flex;flex-direction:column;gap:7px;">
      <div style="font-size:12px;font-weight:800;color:${accent};text-align:center;">${label}</div>
      ${shotCardHTML(ex.log, { distToPin: ex.holed ? undefined : dist })}
      <button class="gs-btn gs-btn--primary gs-btn--block"
        data-action='${JSON.stringify({ type: 'chooseScrambleBall', pick })}'
        style="text-align:center;font-size:14px;padding:11px;">${ex.holed ? '🏁 Holed — take it' : 'Play this →'}</button>
    </div>`;
  // A fortune-teller MULLIGAN (GS-tent-interactions) and a Prognostic Parrot FORESIGHT (GS-caddy-parrot)
  // both reuse this "choose your ball" card, but both balls are the player's OWN swing — so each is
  // titled for its source and the two options read "A/B" rather than naming a partner.
  const isMulligan = !!sc.mulligan;
  const isPreview = !!sc.preview;
  const heading = isMulligan
    ? { title: '🔮 FORTUNE\'S MULLIGAN — PICK YOUR TEE SHOT', sub: 'The fortune teller gifted a second tee shot — keep whichever line you like best.' }
    : isPreview
    ? { title: '🦜 PROGNOSTIC PARROT — PICK YOUR SHOT', sub: 'The captain foresaw the shot & played it twice — keep whichever ball you like best.' }
    : { title: '🤝 SCRAMBLE — CHOOSE YOUR BALL', sub: `You and ${partner?.name ?? 'your partner'} both hit — play on from the better lie.` };
  const labelA = isPreview ? 'Vision A' : isMulligan ? 'Tee shot A' : 'Your ball';
  const labelB = isPreview ? 'Vision B' : isMulligan ? 'Tee shot B' : `${partner?.name ?? 'Partner'}'s ball`;
  return `
    <div style="position:fixed;inset:0;background:rgba(5,7,11,0.82);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;overflow:auto;">
      <div style="display:flex;flex-direction:column;gap:11px;max-width:360px;width:100%;">
        <div style="text-align:center;">
          <div style="font-size:13px;font-weight:800;letter-spacing:.08em;color:#ffce54;">${heading.title}</div>
          <div style="font-size:11.5px;opacity:.75;margin-top:2px;">${heading.sub}</div>
        </div>
        <div style="border-radius:10px;overflow:hidden;border:1px solid var(--gs-line-2);line-height:0;align-self:center;">${map}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${option(labelA, sc.player, sc.playerDistToPin, 'player', '#5fd45a')}
          ${option(labelB, sc.partner, sc.partnerDistToPin, 'partner', isPreview ? '#ffce54' : isMulligan ? '#c39bd3' : partner?.style.cap ?? '#7aa2ff')}
        </div>
      </div>
    </div>`;
}

/** Modal shot-result popup: the just-played shot's card + a Continue, shown after the shot has
 *  settled so each shot gets its own beat before the next decision. */
function shotPopupOverlay(): string {
  const play = state.play!;
  const last = play.shots[play.shots.length - 1];
  if (!last) return '';
  const distToPin = last.holed ? undefined : Math.round(dist(play.ball, pinOf(play.hole)));
  // The whole backdrop is a dismiss target so a tap anywhere advances — one less precise tap
  // per shot on a phone. The card itself sits above it with the explicit Continue button.
  return `
    <div data-popup-continue="1" style="position:fixed;inset:0;background:rgba(5,7,11,0.72);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;overflow:auto;cursor:pointer;">
      <div style="display:flex;flex-direction:column;align-items:stretch;gap:12px;max-width:300px;width:100%;">
        ${shotCardHTML(last, { distToPin })}
        <button class="gs-btn gs-btn--primary" data-popup-continue="1" style="text-align:center;font-size:16px;padding:12px;">Continue →</button>
      </div>
    </div>`;
}






/** Drive the ambient music layer (GS-audio-2) off the current screen: the stop's world theme
 *  while golf is on screen (playing/result — the hole under view picks the track, so a
 *  split-biome stop's back holes switch), the clubhouse lull everywhere else. A cheap no-op when
 *  the scene hasn't changed, so it's safe on render()'s hot path (power-pull re-renders). */
function syncMusic(): void {
  let sceneId: MusicSceneId = 'menu';
  const hole =
    state.screen === 'playing' && state.play
      ? state.play.hole
      : state.screen === 'result' && state.played
        ? state.course.holes[state.viewHole] ?? state.course.holes[0]
        : undefined;
  if (hole) sceneId = archetypeFor(holeThemeId(hole), holeBiome(hole));
  setMusicScene(sceneId);
}

/** The per-hole weather seed — shared by the play view + the aim/putt overlay so the sky reads
 *  identically across screens (a quiet hand-off from lining up to watching the shot). */
function weatherSeed(hole: Hole): number {
  return (Math.round(hole.tee[0] * 7 + hole.green[1] * 13 + hole.par * 101) >>> 0) ^ 0x51ed;
}

/**
 * Mount the animated, SCREEN-SPACE weather overlay over the aim/putt map (GS-journey-fx rework) so the
 * sky + air are alive while you line up — not just during ball flight (the in-flight view draws the
 * SAME weather from the shared module). `up` orients the wind to read true relative to the shot. A
 * transparent, pointer-events-none canvas so the pull-to-shot gesture passes straight through.
 */
function mountWeatherOverlay(el: HTMLElement, hole: Hole, up: Vec): void {
  const cw = Math.round(el.clientWidth || DMAP_W);
  const ch = Math.round(el.clientHeight || DMAP_H);
  if (cw < 2 || ch < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cw * dpr;
  cv.height = ch * dpr;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:10px;';
  el.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  // Wind screen-direction via a projector oriented the same way the map is (shot pointing up).
  const proj = holeProjector(hole, { width: cw, height: ch, focus: hole.tee, up, viewRadius: 80, focusBias: DMAP_BIAS });
  const rad = ((hole.wind?.dir ?? 0) * Math.PI) / 180;
  const a = proj.project(hole.tee);
  const b = proj.project([hole.tee[0] + Math.sin(rad), hole.tee[1] + Math.cos(rad)]);
  let wdx = b[0] - a[0];
  let wdy = b[1] - a[1];
  const wl = Math.hypot(wdx, wdy) || 1;
  // Star-mask (GS-rough-frame): this overlay sits on the SVG decision map, whose land now fills to
  // the OB frame — but the local projector above is only wind-orientation, NOT the map's exact fit,
  // so a projected land mask would lie. Land dominates the aim framing on every normal hole, so the
  // pinned twinkle stars are simply kept off the whole overlay there; a lost-rough hole or Rainbow
  // Road is mostly open deep, where the twinkle belongs (unmasked). Shooting star/meteors/ambient
  // air stay on either way — motion sells them as sky, not ground.
  const landDominant = !rainbowActive() && !(hole.biomeMods?.some((m) => m.kind === 'roughLie') ?? false);
  const overlayMask: Vec[][] = [
    [
      [0, 0],
      [cw, 0],
      [cw, ch],
      [0, ch],
    ],
  ];
  const w = createWeather({
    effect: currentEffect() ?? 'none',
    width: cw,
    height: ch,
    archetype: archetypeFor(holeThemeId(hole), holeBiome(hole) ?? ''),
    windSpd: hole.wind?.spd ?? 0,
    windDir: [wdx / wl, wdy / wl],
    seed: weatherSeed(hole),
    starMask: () => (landDominant ? overlayMask : null),
  });
  const reduced = getSettings().reducedMotion;
  let raf = 0;
  let live = true;
  const tick = (now: number): void => {
    if (!live || !cv.isConnected) return;
    ctx.clearRect(0, 0, cw, ch);
    w.draw(ctx, now);
    if (!reduced) raf = requestAnimationFrame(tick);
  };
  tick(performance.now());
  weatherOverlay = {
    destroy() {
      live = false;
      cancelAnimationFrame(raf);
      cv.remove();
    },
  };
}




/** Play a caddy's signature voice line + haptic when its effect fires in the play view (GS-caddy-
 *  voices) — wired to the play view's `onCaddyEffect`. Gated/guarded inside `speakCaddy`. */
function playCaddyVoice(id: string): void {
  const v = CADDY_VOICE[id as keyof typeof CADDY_VOICE];
  if (!v) return;
  speakCaddy(v.speech, v.lang, { rate: v.rate, pitch: v.pitch });
  haptic(HAPTICS.caddy);
}

/** Ball bonks a trade-camp tent (GS-tents): the canvas already pops an "Ow!"/"Watch it!" bubble — back
 *  it with a soft bonk sound, a haptic, and a spoken yelp (a startled trader). Pure feel; guarded. */
function playTentBonk(text: string): void {
  sfx.bonk();
  haptic(HAPTICS.tap);
  speakCaddy(text, 'en-GB', { rate: 1.1, pitch: 1.2 });
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
      decisionRadius = null;
      puttViewRadius = null;
      resetMapView();
    }
    animatingPlay = pendingAnimation(state.play);
  }

  // The route-info sheet is only meaningful on the travel screen; clear it the moment we leave so a
  // stale id (route ids repeat 1..3 each stop) can't auto-reopen a sheet on the next travel screen.
  if (state.screen !== 'travel') travelView.inspectRouteId = null;

  const body =
    state.screen === 'title'
      ? titleScreen()
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
      : gameoverScreen();

  // The interactive play screen (decision / watching / putting — but not the hole-complete card) is
  // full-bleed: the map fills the page, so drop the page frame's padding/max-width for it.
  const fullBleed = state.screen === 'playing' && !!state.play && !state.play.done;
  // The character-select roster wants a wider frame so all four golfers line up across one screen.
  const wide = state.screen === 'character';
  const routeSheet = state.screen === 'travel' && travelView.inspectRouteId != null ? routeInfoOverlay() : '';
  // The settings cog rides EVERY screen (GS-settings-nav) — fixed top-right, outside each screen's
  // own markup so no screen can forget it. The full-bleed play view is the one exception: its
  // map-nav stack already carries a cog, and a second fixed button would collide with it.
  const cog = fullBleed ? '' : `<button class="gs-cog" data-open-settings="1" title="Settings" aria-label="Settings">⚙</button>`;
  // The hole-step hazards/benefits popup (GS-intro-split) rides over the page like the settings sheet.
  const introTraits = state.screen === 'intro' && introView.stage === 'hole' && introView.traitsOpen ? introTraitsOverlay() : '';
  // The one-off Trade Market price-cut / refund notice (GS-trade-rebalance) rides over every screen
  // until the player closes it — it's stamped by the save migration and shown on the boot title.
  const priceNotice = state.priceRefund != null ? priceNoticeOverlay() : '';
  app.innerHTML = `<main class="gs-main${fullBleed ? ' gs-main--bleed' : ''}${wide ? ' gs-main--wide' : ''}">${body}</main>${cog}${settingsOpen ? settingsOverlay() : ''}${routeSheet}${introTraits}${priceNotice}`;
  app.setAttribute('data-booted', '1'); // tell the boot watchdog the app painted

  // Arc-intro "First Tee" at the BOTTOM only when the field overflows one screen (GS-intro-split):
  // measure after layout settles and reveal the second CTA so it's reachable without scrolling back
  // up — but never a redundant duplicate on a short screen. rAF so scrollHeight is post-layout.
  if (state.screen === 'intro' && introView.stage === 'arc') {
    requestAnimationFrame(() => {
      const wrap = document.getElementById('gs-firsttee-bottomwrap');
      if (!wrap) return;
      const overflows = document.documentElement.scrollHeight - window.innerHeight > 8;
      wrap.style.display = overflows ? 'flex' : 'none';
    });
  }

  // Wire actions.
  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => dispatch(JSON.parse(el.dataset.action!) as Action));
  });
  // Shop bag-inventory: tap an owned gear chip to pop its card (toggle), for comparison with the stock.
  app.querySelectorAll<HTMLElement>('[data-inspect]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.inspect!;
      shopView.inspectGearId = shopView.inspectGearId === id ? null : id;
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
  // Travel star-chart: tap a branch planet to open its route-info sheet; tap the backdrop / close /
  // Cancel to dismiss it (the sheet's Confirm is a normal [data-action] route dispatch). getAttribute
  // (not dataset) so it works on SVG <g> nodes too.
  app.querySelectorAll<HTMLElement>('[data-route-inspect]').forEach((el) => {
    el.addEventListener('click', () => {
      travelView.inspectRouteId = Number(el.getAttribute('data-route-inspect'));
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // The sheet card itself is data-route="keep" — clicks inside it must NOT close it.
      if (el.getAttribute('data-route') === 'keep') {
        e.stopPropagation();
        return;
      }
      travelView.inspectRouteId = null;
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
  // Settings sheet: open/close + toggle a preference (all view-only, persisted in localStorage).
  app.querySelectorAll<HTMLElement>('[data-open-settings]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsOpen = true;
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-settings]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el.dataset.settings;
      if (a === 'keep') return; // clicks inside the sheet body don't close it
      e.stopPropagation();
      settingsOpen = false;
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-setting]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSetting(el.dataset.setting as keyof Settings);
      resumeAudio();
      sfx.click();
      render();
    });
  });
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
  // "Return to title" (GS-settings-nav): close the sheet, then the reducer parks an underway run
  // as a resumable snapshot and lands on the title — the same offer a page reload makes.
  app.querySelectorAll<HTMLElement>('[data-settings-home]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsOpen = false;
      dispatch({ type: 'toTitle' });
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
      mountWeatherOverlay(wEl, state.play.hole, [pin[0] - ball[0], pin[1] - ball[1]]);
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
