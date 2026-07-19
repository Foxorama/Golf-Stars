/**
 * UI screen-flow reducer — a PURE state machine over the (already pure) run API. Holds no
 * DOM and no time, so the whole interactive flow is unit-tested. `main.ts` renders the
 * returned `UiState` and dispatches `Action`s on clicks; save persistence is a side-effect
 * there, not here.
 *
 * Flow: intro → play → result → shop → travel → (next) intro … until a missed cut → gameover.
 */

import { playHole, type PlayedHole } from '../sim/round';
import {
  bank,
  bossEdgeForRun,
  buy,
  buyFuel,
  canTravel,
  canWarpStop,
  currentBoss,
  currentCourse,
  endlessAttackArmed,
  finishStop,
  foresightChance,
  playStop,
  playStopWarp,
  playerHoleOpts,
  resumeRun,
  routeOptions,
  canScanRoutes,
  scanRoutes,
  scrambleOptsFor,
  teamDuelSetupForRun,
  shopOffer,
  snapshotRun,
  startRun,
  startAsgardRun,
  strand,
  travel,
  salvageFindFor,
  grantTalent,
  starmartOffer,
  starmartRerollCost,
  STARMART_COST,
  type RunSnapshot,
} from '../sim/rpg/run';
import { effectPatchKind } from '../sim/rpg/effects';
import { isMatchplayBoss, ASGARD_FORMAT, STROKEPLAY_FORMAT } from '../sim/rpg/formats';
import {
  playMatchStop,
  playTeamMatchStop,
  playBossStop,
  playBossSideStop,
  betterPlayedHole,
  bossHasHomeEdge,
  holeDuel,
  matchState,
} from '../sim/rpg/match';
import { bagSet, bagTierRank, canBuyBagSet, DEFAULT_BAG_TIER, type BagTier } from '../sim/rpg/bag';
import { canBuyShip, shipById, DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import { apparelById, canBuyApparel } from '../sim/rpg/apparel';
import { getCharacter, characterShotMods } from '../sim/rpg/characters';
import { shopItem, ownedCount, itemCap, canBuy, namedCaddyOwned } from '../sim/rpg/economy';
import { adjustReputation, factionForCaddy, REP_ON_FIRE, REP_ON_HIRE } from '../sim/rpg/factions';
import { loreEventById, type SeenLore } from '../sim/rpg/lore';
import {
  defaultStoryState,
  storyBagClubs,
  worldCleared,
  equipStoryClub,
  unequipStoryClub,
  chooseAlignment,
  storyWorldEffect,
  type StoryState,
} from '../sim/rpg/story';
import { storyItemKind, buyStoryCard, worldHasShop } from '../sim/rpg/storyShop';
import { applyStoryGear, equipStoryGear, unequipStoryGear } from '../sim/rpg/storyGear';
import { applyStoryClubEffects } from '../sim/rpg/storyClubEffects';
import { hireStoryCaddy, setActiveStoryCaddy, applyStoryCaddy, worldCaddy } from '../sim/rpg/storyCaddies';
import { allyTalk } from '../sim/rpg/storyAllies';
import { isHeraldAgent } from '../sim/rpg/storyHeraldCrew';
import { acceptQuest, completeQuest, activeQuest, questWorld } from '../sim/rpg/storyQuests';
import { isStoryShipId, buyStoryShip, equipStoryShip, worldIsShipVendor } from '../sim/rpg/storyShips';
import { isShipUpgradeId, buyShipUpgrade } from '../sim/rpg/storyShipUpgrades';
import { currentTournament, tournamentForChapter, rivalTotalThrough } from '../sim/rpg/storyTournaments';
import { finaleUnlocked, finaleResult, winFinale } from '../sim/rpg/storyFinale';
import { interludeSeen, applyInterlude } from '../sim/rpg/storyInterlude';
import type { GearSlot } from '../sim/rpg/story';
import {
  autoDecision,
  awaitingPutt,
  beginHole,
  holeResult,
  takePutt,
  takeShot,
  resolveScrambleShot,
  commitScrambleBall,
  autoCommitScrambleBall,
} from '../sim/rpg/play';
import { Rng } from '../sim/rng';
import type { Action, MatchUi, MetaProgress, Screen, UiState } from './gameState';
import {
  aceUpdates,
  applyTentReactions,
  bossRewardFor,
  endlessProgressUpdates,
  resolveAsgard,
  resolveBossId,
  resolveStrokePlay,
  resolveStoryRound,
  resolveStoryTournament,
  runEndUpdates,
  withAsgardPortal,
  withBestBallPartner,
  withLoreGate,
} from './gameUpdates';

// game.ts stays the public entry point (`import … from '../ui/game'`): re-export the state/action
// types, the per-character cosmetic resolvers, and the meta-progression helpers that now live in the
// extracted sibling modules (GS-refactor-split), so every existing importer + seeded test is unchanged.
export type { Action, MatchUi, MetaProgress, Screen, UiState } from './gameState';
export {
  bagTierForCharacter,
  driverForCharacter,
  golfBagForCharacter,
  hatForCharacter,
  pantsForCharacter,
  shipForCharacter,
  shirtForCharacter,
} from './gameCosmetics';
export { asgardFieldEdge, asgardPortalOpens, endlessProgressUpdates, runEndUpdates } from './gameUpdates';

/**
 * Build the initial UI state. Always lands on the TITLE screen (pick a format, or resume
 * a saved run if one is offered). A placeholder run backs the title until a format is
 * chosen. Starting at the title — never auto-resuming — guarantees the format choice is
 * always reachable and keeps a stale save from booting straight into a bad state.
 */
export function initState(
  seed: number | string,
  meta: MetaProgress = {},
  resumable?: RunSnapshot,
  story?: StoryState,
): UiState {
  const metaUpgrades = meta.metaUpgrades ?? {};
  const bagTier = meta.bagTier ?? DEFAULT_BAG_TIER;
  const run = startRun(seed, undefined, metaUpgrades, undefined, 0, bagTier);
  return {
    run,
    screen: 'title',
    course: currentCourse(run),
    viewHole: 0,
    resumable,
    ...(story ? { story } : {}),
    bestStableford: meta.bestStableford ?? 0,
    bestDistance: meta.bestDistance ?? 0,
    shards: meta.shards ?? 0,
    metaUpgrades,
    maxAscension: meta.maxAscension ?? 0,
    maxAscensionByCharacter: meta.maxAscensionByCharacter ?? {},
    lifetimeAces: meta.lifetimeAces ?? 0,
    bagTier,
    bagTierByCharacter: meta.bagTierByCharacter ?? {},
    ownedShips: meta.ownedShips && meta.ownedShips.length ? meta.ownedShips : [DEFAULT_SHIP_ID],
    ownedApparel: meta.ownedApparel ?? [],
    shipByCharacter: meta.shipByCharacter ?? {},
    hatByCharacter: meta.hatByCharacter ?? {},
    shirtByCharacter: meta.shirtByCharacter ?? {},
    pantsByCharacter: meta.pantsByCharacter ?? {},
    golfBagByCharacter: meta.golfBagByCharacter ?? {},
    driverByCharacter: meta.driverByCharacter ?? {},
    unlockedClubsByCharacter: meta.unlockedClubsByCharacter ?? {},
    clubhouseVisit: meta.clubhouseVisit ?? 0,
    endlessBestHoles: meta.endlessBestHoles ?? 0,
    marmotBartender: meta.marmotBartender ?? false,
    marmotTips: meta.marmotTips ?? 0,
    endlessRuns: meta.endlessRuns ?? [],
    reputation: meta.reputationByCharacter ?? {},
    strokePlayBest: meta.strokePlayBest ?? {},
    seenLore: meta.seenLore ?? {},
    priceRefund: meta.priceRefund,
  };
}

/** The credit cost of the NEXT shop reroll (GS-shop-reroll) — base 30, ×1.6 per reroll this stop. */
export const REROLL_BASE_COST = 30;
export function rerollCost(rerolls: number): number {
  return Math.round(REROLL_BASE_COST * Math.pow(1.6, Math.max(0, rerolls)));
}

export function reduce(state: UiState, action: Action): UiState {
  switch (action.type) {
    case 'start': {
      if (state.screen !== 'title') return state;
      // Lock in the chosen format, then pick a golfer before the run begins (GS-18). The run is
      // (re)built with the format now so the course preview works; the character layers on at
      // `selectCharacter`. `run.formatId` carries the pending choice — no extra state needed.
      // Ascension (GS-ascension) is normally picked WITH the golfer at `selectCharacter`
      // (GS-title-2); 'start' still accepts one (clamped) as the base the select screen overrides.
      const asc = Math.max(0, Math.min(state.maxAscension, action.ascension ?? 0));
      const run = startRun(state.run.seed, action.format, state.metaUpgrades, undefined, asc, state.bagTier);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'character',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        resumable: undefined,
        viewHole: 0,
      };
    }

    case 'selectCharacter': {
      if (state.screen !== 'character') return state;
      // GS-story: picking a golfer to BEGIN a campaign creates the persistent `StoryState` (green bag +
      // station wagon, empty purse, chapter 0) and lands in the Story Mode hub — it does NOT build a run
      // (a Story round is teed off later from the campaign). Branch first so the shared run-building path
      // below is byte-identical for every other mode.
      if (state.pendingStoryNew) {
        return {
          ...state,
          story: defaultStoryState(action.characterId),
          pendingStoryNew: false,
          storyInspectId: undefined,
          screen: 'story',
        };
      }
      // Rebuild the run with the golfer's loadout/shape baked in, keeping the format + bag tier
      // chosen at 'start'. Ascension (GS-ascension) is a per-run difficulty picked HERE, alongside
      // the golfer (GS-title-2) — it's a choice about who you're playing, so it lives on the same
      // screen; absent (endless formats / no tiers unlocked) the 'start' value carries. Clamped to
      // what's unlocked. The golfer's permanently-unlocked clubs (GS-ascension-clubs) grow their
      // starting bag.
      const asc = Math.max(0, Math.min(state.maxAscension, action.ascension ?? state.run.ascension));
      // Per-golfer bag tier (GS-wardrobe-bagtier): the golfer's Clubhouse wardrobe pick is the STARTING
      // BAG for EVERY mode now — Voyage included — so you can pair a weaker bag with an easier tier to
      // test it. An EXPLICIT char-select strip pick this visit (`action.bagTier`, sent only when the
      // player taps a chip — the strip shows for the Unending Universe) overrides it for this run and
      // WRITES THROUGH to the golfer so it sticks across modes. All clamped to the owned tier (never a
      // free upgrade). Default (no per-golfer entry) = the owned tier, so the un-touched path is
      // byte-identical to the old owned-tier behaviour.
      const owned = state.bagTier;
      const picked = action.bagTier ?? state.bagTierByCharacter[action.characterId];
      const bagTier: BagTier =
        picked && bagTierRank(picked) <= bagTierRank(owned) ? picked : owned;
      const bagTierByCharacter = action.bagTier
        ? { ...state.bagTierByCharacter, [action.characterId]: bagTier }
        : state.bagTierByCharacter;
      const run = startRun(
        state.run.seed,
        state.run.formatId,
        state.metaUpgrades,
        action.characterId,
        asc,
        bagTier,
        state.unlockedClubsByCharacter[action.characterId] ?? [],
      );
      // STAR TOUR (GS-star-tour-2): the golfer is chosen BEFORE the star map, so a strokeplay selection
      // flows to the map (to pick a world + fly the golfer's own ship) rather than straight to a stop
      // intro. The course pins on at `pickStarTourCourse`. Every other mode goes to the intro as before.
      if (state.run.formatId === STROKEPLAY_FORMAT) {
        return { ...state, run, course: currentCourse(run), screen: 'starTour', bagTierByCharacter };
      }
      // The Marmot's tip jar ACCUMULATES across runs (GS-tent-tips) — a new run does NOT empty it, so it
      // fills toward a half-dozen over successive marmot bonks. The clubhouse renders the fill-then-cash-out
      // cycle off this running total (`marmotTips % (CAP + 1)`), so the reducer just keeps counting.
      return withLoreGate({ ...state, run, course: currentCourse(run), screen: 'intro', bagTierByCharacter });
    }

    case 'backToCharacter': {
      // GS-intro-split: the arc-intro "Change golfer" back-out. Return to the roster to re-pick;
      // the run rebuilds (same seed + format) on the next `selectCharacter`. View-only navigation —
      // no run/rng change here, so seeded tests are untouched.
      if (state.screen !== 'intro') return state;
      return { ...state, screen: 'character' };
    }

    case 'resume': {
      if (state.screen !== 'title' || !state.resumable) return state;
      const snap = state.resumable;
      const run = resumeRun(snap);
      const course = currentCourse(run);
      // STAR TOUR mid-round resume (GS-star-tour-resume): a parked stroke-play round carries its
      // completed scorecard (`stopPlayed`) + the hole reached (`stopHoleIndex`), so continue drops you
      // back on that hole's tee with your card intact — the 18 holes are ONE stop, so the ordinary
      // restart-the-stop resume would otherwise bin the whole round. `holeRng` is reseeded fresh: the
      // round is a user-driven records chase (no determinism-guarded auto sim), so the resumed holes just
      // draw a new dispersion stream — no already-played score is re-rolled. No lore gate here (you're
      // already teed off, mid-round). Every other format keeps the intro/restart-the-stop resume below.
      if (
        run.formatId === STROKEPLAY_FORMAT &&
        snap.stopPlayed &&
        snap.stopHoleIndex !== undefined &&
        snap.stopHoleIndex < course.holes.length
      ) {
        return {
          ...state,
          run,
          course,
          screen: 'playing',
          holeRng: new Rng(`${course.seed}:play`),
          stopPlayed: [...snap.stopPlayed],
          play: beginHole(course.holes[snap.stopHoleIndex]!, snap.stopHoleIndex),
          match: undefined,
          played: undefined,
          lastResult: undefined,
          routes: undefined,
          resumable: undefined,
          viewHole: 0,
        };
      }
      return withLoreGate({
        ...state,
        run,
        course,
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        resumable: undefined,
        viewHole: 0,
      });
    }

    case 'openStarTour': {
      // GS-star-tour: open the free-roam star map course picker. Reachable from the title and from the
      // post-round recap / a between-run screen. A placeholder strokeplay run backs the map (character +
      // pinned course layer on at `pickStarTourCourse` → `selectCharacter`), exactly as the title's
      // generic `start` backs character select. The parked Voyage/Unending resume is left untouched —
      // Star Tour is a side mode that never consumes it (the placeholder run has no character, so
      // persist never snapshots it over the resumable offer).
      // GS-star-tour-2: CHARACTER FIRST — the Star Tour tile opens character select, then the golfer
      // choice flows to the star map (so the map can fly the golfer's own cosmetic ship). The corner
      // "change golfer" button on the map re-enters here too. EXCEPTION: coming back from a round's
      // recap ("Star map") keeps the SAME golfer and lands straight on the map — you just picked them.
      // GS-star-tour-port: also reachable from the Clubhouse hall's "Depart to Star Tour" button (the
      // spaceport ↔ clubhouse loop), which re-enters character select before the map.
      if (!['title', 'gameover', 'strokeResult', 'starTour', 'character', 'clubhouseHall'].includes(state.screen)) return state;
      // GS-story-startour-champion: Star Tour is the REWARD for completing the campaign, so a finished
      // campaign plays free-roam AS the developed champion — the golfer who saved the galaxy, carrying the
      // bag / gear / active caddy you built up (loaded from the separate `gs_story` save). We skip the
      // golfer pick (you already ARE your champion) and fly straight to the map. When there's no completed
      // campaign — only reachable in tests, since the title gates Star Tour on completion — the classic
      // character-first flow is byte-for-byte unchanged.
      const champion = state.story?.completed ? state.story : undefined;
      const keepGolfer = state.screen === 'strokeResult' && !!state.run.loadout.characterId;
      let run;
      if (champion) {
        // Build the champion's strokeplay run and fold in the developed Story loadout (the `storyPlayWorld`
        // pattern): the equipped bag + gear + active caddy, so free-roam plays with everything you earned.
        const base = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, champion.characterId, 0, DEFAULT_BAG_TIER, []);
        const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...base.loadout, bag: storyBagClubs(champion) }, champion), champion), champion);
        run = { ...base, loadout };
      } else if (keepGolfer) {
        run = startRun(state.run.seed, STROKEPLAY_FORMAT, state.metaUpgrades, state.run.loadout.characterId, state.run.ascension, state.run.bagTier, state.run.unlockedClubs);
      } else {
        run = startRun(state.run.seed, STROKEPLAY_FORMAT, state.metaUpgrades);
      }
      return {
        ...state,
        run,
        screen: champion || keepGolfer ? 'starTour' : 'character',
        starTourPick: undefined,
        played: undefined,
        lastResult: undefined,
        lastStrokeRecord: undefined,
        strokeIsRecord: undefined,
        viewHole: 0,
      };
    }

    case 'pickStarTourCourse': {
      // GS-star-tour: a course + weather chosen on the star map. The golfer is ALREADY picked (character
      // select came first, GS-star-tour-2), so pin the course + weather onto the run and tee up the
      // round intro. Guarded to the star map.
      if (state.screen !== 'starTour' || !state.run.loadout.characterId) return state;
      const run = { ...state.run, staticCourseId: action.courseId, staticEffect: action.effect ?? 'none' };
      return withLoreGate({ ...state, run, course: currentCourse(run), screen: 'intro', viewHole: 0 });
    }

    case 'exitStarTour': {
      if (state.screen !== 'starTour') return state;
      return { ...state, screen: 'title', starTourPick: undefined };
    }

    case 'openStory': {
      // GS-story: enter Story Mode. If a campaign is loaded (boot read `gs_story` into `state.story`),
      // CONTINUE it — straight to the hub. Otherwise begin a NEW campaign by picking a golfer (the
      // `pendingStoryNew` flag routes `selectCharacter` to create the `StoryState`).
      if (state.screen !== 'title' && state.screen !== 'gameover' && state.screen !== 'story') return state;
      if (state.story) return { ...state, screen: 'story', storyInspectId: undefined };
      return { ...state, screen: 'character', pendingStoryNew: true, storyInspectId: undefined, resumable: state.resumable };
    }

    case 'storyNewCampaign': {
      // GS-story: begin a fresh campaign from the title or the hub (a "start over" that overwrites the
      // saved one only once a golfer is picked). Go pick the protagonist.
      if (state.screen !== 'title' && state.screen !== 'gameover' && state.screen !== 'story') return state;
      return { ...state, screen: 'character', pendingStoryNew: true, storyInspectId: undefined };
    }

    case 'exitStory': {
      if (state.screen !== 'story') return state;
      return { ...state, screen: 'title', storyInspectId: undefined };
    }

    case 'storyPlayWorld': {
      // GS-story-prologue: tee off a Story Mode world round from the campaign hub. Build a strokeplay run
      // pinned to the course from the campaign's golfer — a CLEAN loadout (common bag, no main-save meta/
      // ascension-unlocks: the campaign is a separate progression; the green-bag start + gear ride the
      // StoryState in a later chunk), mark it a Story round so it resolves back into the campaign, and tee
      // up the round intro (through the lore gate, so a world's arrival beat still fires). Reachable from
      // the prologue hub (Earth) and the star-map destination dossier (any charted world).
      // Reachable from the prologue hub (Earth), the star-map dossier (any charted world), and the Pro
      // Shop's "play again" (a cleared world). The bag is the campaign's OWN equipped bag (GS-story-econ):
      // the lean green starter grown by Pro-Shop purchases — not the golfer's normal common bag.
      if ((state.screen !== 'story' && state.screen !== 'starTour' && state.screen !== 'storyShop') || !state.story) return state;
      const run0 = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, state.story.characterId, 0, DEFAULT_BAG_TIER, []);
      const bag = storyBagClubs(state.story);
      // GS-story-gear: fold the campaign's equipped gear (glove/hat/shoes/ball) effects onto the loadout.
      // GS-story-caddies: then the active caddy (a friend on the bag folds a real effect + shows on course).
      const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...run0.loadout, bag }, state.story), state.story), state.story);
      const run = {
        ...run0,
        loadout,
        staticCourseId: action.courseId,
        // GS-story-worlddiff: deep worlds play under a stiffer WIND (pure physics, records-safe) so they're
        // harder, not just longer — scaled by the world's tier, calm at Ch.1 → the wildest sky by Ch.5.
        staticEffect: storyWorldEffect(action.courseId),
        storyRound: true,
      };
      return withLoreGate({ ...state, run, course: currentCourse(run), screen: 'intro', viewHole: 0, played: undefined, storyItemInspectId: undefined });
    }

    case 'storyRoundContinue': {
      // GS-story-prologue: dismiss the world-round recap back to the campaign hub (the run already banked
      // into the StoryState at `resolveStoryRound`).
      if (state.screen !== 'storyResult') return state;
      return { ...state, screen: 'story', lastStoryRound: undefined };
    }

    case 'storyInspectGolfer': {
      // GS-story-clubhouse: open a golfer's stats/abilities overlay in the Earth clubhouse (the new-game
      // picker, or the prologue hub). Guarded to those surfaces.
      const onClubhouse = (state.screen === 'character' && state.pendingStoryNew) || state.screen === 'story';
      if (!onClubhouse) return state;
      return { ...state, storyInspectId: action.characterId };
    }

    case 'storyCloseInspect': {
      return state.storyInspectId ? { ...state, storyInspectId: undefined } : state;
    }

    case 'storySwitchGolfer': {
      // GS-story-clubhouse: change your protagonist from the prologue hub — only BEFORE the campaign has
      // begun (chapter 0, Earth not yet cleared), so it never rewrites a golfer mid-campaign.
      if (state.screen !== 'story' || !state.story || state.story.chapter > 0) return state;
      return { ...state, story: { ...state.story, characterId: action.characterId }, storyInspectId: undefined };
    }

    case 'openStoryMap': {
      // GS-story-map: open the galaxy star-map navigator from the spaceport clubhouse (post-recruitment) OR
      // straight from a world-clear recap (`storyResult`) so finishing a world drops you back on the chart to
      // fly on / fly home (GS-story-worldclear-map). It REUSES the Star Tour `starTour` screen in a story
      // context — app.ts's dispatch handler flags `starTourView.storyMode` so the chart plots the campaign's
      // charted worlds + flies the story ship.
      if ((state.screen !== 'story' && state.screen !== 'storyResult') || !state.story) return state;
      return { ...state, screen: 'starTour', lastStoryRound: undefined };
    }

    case 'exitStoryMap': {
      // Back to the clubhouse from the story star map (guarded to a campaign, so the records chase — which
      // never dispatches this — is unaffected).
      if (state.screen !== 'starTour' || !state.story) return state;
      return { ...state, screen: 'story' };
    }

    case 'openStoryShop': {
      // GS-story-econ / GS-story-shop-access: open a CLEARED world's Pro Shop. Reachable ONLY from the world
      // itself — the star-map dossier (travel back to a cleared world) and the world-clear RECAP (shop the
      // world you just finished, before you leave). Deliberately NOT from the clubhouse: a per-world shop
      // keeps the galaxy big — if you can't afford or skip an item, you fly back to that world for it.
      // Guarded to a campaign + a cleared, shoppable world. Records the origin so exiting returns there.
      if ((state.screen !== 'starTour' && state.screen !== 'storyResult') || !state.story) return state;
      if (!worldCleared(state.story, action.worldId) || !worldHasShop(action.worldId)) return state;
      const storyShopReturn: Screen = state.screen === 'starTour' ? 'starTour' : 'story';
      return { ...state, screen: 'storyShop', storyShopWorldId: action.worldId, storyShopReturn, storyItemInspectId: undefined };
    }

    case 'exitStoryShop': {
      // Close the Pro Shop back to wherever it was opened from (the star map, or the clubhouse).
      if (state.screen !== 'storyShop') return state;
      return { ...state, screen: state.storyShopReturn ?? 'starTour', storyShopReturn: undefined, storyItemInspectId: undefined };
    }

    case 'hireStoryCaddy': {
      // GS-story-caddies: recruit the friend who waits at a CLEARED world (its dossier / recap / Pro Shop).
      // Per-world + travel-back, like every other purchase — spend credits, keep them, first hire carries
      // the bag by default. Guarded to the world actually hosting THIS caddy so a stray dispatch can't hire.
      if (!state.story) return state;
      if (state.screen !== 'starTour' && state.screen !== 'storyResult' && state.screen !== 'storyShop') return state;
      const wid = action.worldId;
      if (!worldCleared(state.story, wid) || worldCaddy(wid) !== action.caddyId) return state;
      const story = hireStoryCaddy(state.story, action.caddyId);
      return story === state.story ? state : { ...state, story };
    }

    case 'setStoryCaddy': {
      // GS-story-caddies: choose which owned caddy carries your bag (an EQUIP). Reachable from the Locker
      // AND from an ally's talk card on the clubhouse hub (GS-story-allies — "carry my bag").
      if ((state.screen !== 'storyLocker' && state.screen !== 'story') || !state.story) return state;
      const story = setActiveStoryCaddy(state.story, action.caddyId);
      return story === state.story ? state : { ...state, story };
    }

    case 'storyInspectAlly': {
      // GS-story-allies / GS-story-herald-clubhouse: tap a crew standee → open their talk card. On the Warden
      // path that's a real hired caddy; on the Herald path it's a Coil agent (Voss/Venoma/Ouros/Ecdysis).
      // Guarded to the hub + a genuine crew member, so a stray tap can't open a mute card.
      if (state.screen !== 'story' || !state.story) return state;
      const realCaddy = state.story.hiredCaddyIds.includes(action.caddyId) && !!allyTalk(action.caddyId);
      if (!realCaddy && !isHeraldAgent(action.caddyId)) return state;
      return { ...state, storyAllyInspectId: action.caddyId, storyAllyTalk: 0 };
    }

    case 'storyAllyTalk': {
      // GS-story-allies: cycle the open ally's banter line (the Parrot-bar tap pattern). Purely cosmetic.
      if (state.screen !== 'story' || state.storyAllyInspectId !== action.caddyId) return state;
      return { ...state, storyAllyTalk: (state.storyAllyTalk ?? 0) + 1 };
    }

    case 'storyCloseAlly': {
      return state.storyAllyInspectId ? { ...state, storyAllyInspectId: undefined, storyAllyTalk: undefined } : state;
    }

    case 'acceptStoryQuest': {
      // GS-story-quests: accept an ally's side quest from their clubhouse card. Guarded to the hub + an
      // offerable quest (acceptQuest re-checks). Closes the ally card so the active-quest banner shows.
      if (state.screen !== 'story' || !state.story) return state;
      const story = acceptQuest(state.story, action.questId);
      if (story === state.story) return state;
      return { ...state, story, storyAllyInspectId: undefined, storyAllyTalk: undefined };
    }

    case 'playStoryQuest': {
      // GS-story-quests: tee off the active quest's round — the ally's home world, marked as the quest so
      // the recap can complete it. Mirrors `storyPlayWorld`'s loadout build (developed bag + gear + caddy).
      if (state.screen !== 'story' || !state.story) return state;
      const q = activeQuest(state.story);
      const worldId = q ? questWorld(q) : undefined;
      if (!q || !worldId) return state;
      const run0 = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, state.story.characterId, 0, DEFAULT_BAG_TIER, []);
      const bag = storyBagClubs(state.story);
      const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...run0.loadout, bag }, state.story), state.story), state.story);
      const run = {
        ...run0,
        loadout,
        staticCourseId: worldId,
        staticEffect: storyWorldEffect(worldId),
        storyRound: true,
        storyQuest: q.id,
      };
      return withLoreGate({ ...state, run, course: currentCourse(run), screen: 'intro', viewHole: 0, played: undefined, storyItemInspectId: undefined });
    }

    case 'completeStoryQuest': {
      // GS-story-quests: claim the reward on the quest round's recap (grants + equips the reward club,
      // records the quest done), then back to the clubhouse. Guarded to the recap of an active quest round.
      if (state.screen !== 'storyResult' || !state.story) return state;
      const qid = state.lastStoryRound?.questId;
      if (!qid) return state;
      const story = completeQuest(state.story, qid);
      return { ...state, story, screen: 'story', lastStoryRound: undefined };
    }

    case 'storyInspectItem': {
      // GS-story-econ / GS-story-lore-cards: tap an item → raise its lore card. Works on the Pro Shop
      // (buy footer), the locker (equip footer), and the shipyard (ship ids → buy/fly footer).
      if ((state.screen !== 'storyShop' && state.screen !== 'storyLocker' && state.screen !== 'storyShipyard') || !state.story) return state;
      if (!storyItemKind(action.itemId) && !isStoryShipId(action.itemId) && !isShipUpgradeId(action.itemId)) return state;
      return { ...state, storyItemInspectId: action.itemId };
    }

    case 'storyCloseItem': {
      if (state.screen !== 'storyShop' && state.screen !== 'storyLocker' && state.screen !== 'storyShipyard') return state;
      return { ...state, storyItemInspectId: undefined };
    }

    case 'storyBuyItem': {
      // GS-story-econ / GS-story-gear: buy the item (club → spend + equip into the bag ≤14; gear → spend +
      // equip in its slot). No-op if unaffordable/owned (buyStoryCard gates), so a double-tap can't
      // overspend. Persists via `state.story`.
      if (state.screen !== 'storyShop' || !state.story) return state;
      if (!storyItemKind(action.itemId)) return state;
      const story = buyStoryCard(state.story, action.itemId);
      if (story === state.story) return state; // couldn't buy — leave the card open
      return { ...state, story, storyItemInspectId: undefined };
    }

    case 'openStoryLocker': {
      // GS-story-locker: open the campaign locker from the spaceport clubhouse (post-recruitment).
      if (state.screen !== 'story' || !state.story) return state;
      return { ...state, screen: 'storyLocker', storyItemInspectId: undefined };
    }

    case 'exitStoryLocker': {
      if (state.screen !== 'storyLocker') return state;
      return { ...state, screen: 'story', storyItemInspectId: undefined };
    }

    case 'openStoryBar': {
      // GS-story-parrot-bar: enter the Parrot's cantina from the spaceport clubhouse; the chatter starts
      // on the greeting (talk 0). Purely cosmetic — no story write, no rng.
      if (state.screen !== 'story' || !state.story) return state;
      return { ...state, screen: 'storyBar', storyBarTalk: 0 };
    }

    case 'exitStoryBar': {
      if (state.screen !== 'storyBar') return state;
      return { ...state, screen: 'story', storyBarTalk: undefined };
    }

    case 'parrotBarNext': {
      // Tap the Parrot for the next line — advance the transient chatter counter (the screen cycles it
      // through the eligible lines). A no-op off the bar screen.
      if (state.screen !== 'storyBar') return state;
      return { ...state, storyBarTalk: (state.storyBarTalk ?? 0) + 1 };
    }

    case 'storyEquipClub': {
      // GS-story-locker: put an owned club into the bag (one per type; ≤14). No-op if the bag is full for
      // a new type (the locker shows a "bag full" hint). Keeps the lore card open so you see the result.
      if (state.screen !== 'storyLocker' || !state.story) return state;
      if (!state.story.ownedClubIds.includes(action.clubId)) return state;
      const story = equipStoryClub(state.story, action.clubId);
      return story === state.story ? state : { ...state, story };
    }

    case 'storyUnequipClub': {
      if (state.screen !== 'storyLocker' || !state.story) return state;
      const story = unequipStoryClub(state.story, action.clubId);
      return story === state.story ? state : { ...state, story };
    }

    case 'storyEquipGear': {
      if (state.screen !== 'storyLocker' || !state.story) return state;
      const story = equipStoryGear(state.story, action.gearId);
      return story === state.story ? state : { ...state, story };
    }

    case 'storyUnequipGear': {
      if (state.screen !== 'storyLocker' || !state.story) return state;
      const story = unequipStoryGear(state.story, action.slot as GearSlot);
      return story === state.story ? state : { ...state, story };
    }

    case 'openStoryShipyard': {
      // GS-story-ship-vendors: TWO modes. With a `worldId` → that cleared VENDOR world's shipyard (buy the
      // ships/upgrades it stocks), reached from its dossier (travel back) or the world-clear recap — the
      // per-world model, so the galaxy stays big. Without a worldId → the clubhouse HANGAR (fly an owned
      // ship only, NO buying). Records the origin so exiting returns there.
      const wid = action.worldId;
      if (wid) {
        if ((state.screen !== 'starTour' && state.screen !== 'storyResult') || !state.story) return state;
        if (!worldCleared(state.story, wid) || !worldIsShipVendor(wid)) return state;
        const back: Screen = state.screen === 'starTour' ? 'starTour' : 'story';
        return { ...state, screen: 'storyShipyard', storyShipyardWorldId: wid, storyShipyardReturn: back, storyItemInspectId: undefined };
      }
      if (state.screen !== 'story' || !state.story) return state;
      return { ...state, screen: 'storyShipyard', storyShipyardWorldId: undefined, storyShipyardReturn: 'story', storyItemInspectId: undefined };
    }

    case 'exitStoryShipyard': {
      if (state.screen !== 'storyShipyard') return state;
      return { ...state, screen: state.storyShipyardReturn ?? 'story', storyShipyardWorldId: undefined, storyShipyardReturn: undefined, storyItemInspectId: undefined };
    }

    case 'storyBuyShip': {
      // GS-story-ships: buy a ship (spend credits, own + fly it). No-op if unaffordable/owned/locked.
      if (state.screen !== 'storyShipyard' || !state.story) return state;
      const story = buyStoryShip(state.story, action.shipId);
      if (story === state.story) return state;
      return { ...state, story, storyItemInspectId: undefined };
    }

    case 'storyEquipShip': {
      // GS-story-ships: fly an owned ship.
      if (state.screen !== 'storyShipyard' || !state.story) return state;
      const story = equipStoryShip(state.story, action.shipId);
      return story === state.story ? state : { ...state, story };
    }

    case 'storyBuyUpgrade': {
      // GS-story-ship-upgrades: buy a ship weapon/engine/shield (spend credits, arm up). No-op if
      // unaffordable/owned/locked (buyShipUpgrade gates).
      if (state.screen !== 'storyShipyard' || !state.story) return state;
      const story = buyShipUpgrade(state.story, action.upgradeId);
      if (story === state.story) return state;
      return { ...state, story, storyItemInspectId: undefined };
    }

    case 'openStoryTournament': {
      // GS-story-tournament: open the current chapter's Galaxy Tournament lobby (from the clubhouse), only
      // when one is actually unlocked (enough chapter worlds cleared, Sigil unwon).
      if (state.screen !== 'story' || !state.story) return state;
      if (!currentTournament(state.story)) return state;
      return { ...state, screen: 'storyTournament' };
    }

    case 'exitStoryTournament': {
      if (state.screen !== 'storyTournament') return state;
      return { ...state, screen: 'story' };
    }

    case 'storyPlayTournament': {
      // GS-story-tournament: tee off the tournament round at the venue vs the rival. Builds a story round
      // (campaign bag + gear) MARKED as the chapter's tournament so it resolves vs the rival for the Sigil.
      if (state.screen !== 'storyTournament' || !state.story) return state;
      const t = currentTournament(state.story);
      if (!t) return state;
      const run0 = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, state.story.characterId, 0, DEFAULT_BAG_TIER, []);
      const bag = storyBagClubs(state.story);
      // GS-story-caddies: the active caddy folds into the tournament loadout too (auto ≡ interactive).
      const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...run0.loadout, bag }, state.story), state.story), state.story);
      const run = {
        ...run0,
        loadout,
        staticCourseId: t.venueId,
        // GS-story-worlddiff: the major plays under its venue's tier wind too (the ghost rival also scales).
        staticEffect: storyWorldEffect(t.venueId),
        storyRound: true,
        storyTournament: t.chapter,
      };
      return withLoreGate({ ...state, run, course: currentCourse(run), screen: 'intro', viewHole: 0, played: undefined, storyItemInspectId: undefined });
    }

    case 'tournamentPopContinue': {
      // GS-story-tournament-midpop: dismiss the halftime rival pop and play on — begin the back nine (hole
      // index 9). Guarded to the pop screen with a live round.
      if (state.screen !== 'storyTournamentPop' || !state.play) return state;
      return {
        ...state,
        screen: 'playing',
        storyTournamentMidPop: undefined,
        play: beginHole(state.course.holes[9]!, 9),
      };
    }

    case 'storyTournamentContinue': {
      // GS-story-tournament: dismiss the tournament recap back to the clubhouse (already banked).
      // GS-story-chapters: winning Chapter 3 (the Storm Sigil) reaches THE CHOICE — divert to it once,
      // before the clubhouse, if the path hasn't been chosen yet.
      if (state.screen !== 'storyTournamentResult') return state;
      const r = state.lastStoryTournament;
      if (r?.won && r.chapter === 3 && state.story && !state.story.alignment) {
        return { ...state, screen: 'storyChoice', lastStoryTournament: undefined };
      }
      // GS-story-midchapter: winning the Chapter-4 route major reaches the emotional INTERLUDE (win a
      // friend back / sever one) — divert to it once, before the clubhouse.
      if (r?.won && r.chapter === 4 && state.story?.alignment && !interludeSeen(state.story, state.story.alignment)) {
        return { ...state, screen: 'storyInterlude', lastStoryTournament: undefined };
      }
      return { ...state, screen: 'story', lastStoryTournament: undefined };
    }

    case 'storyInterludeContinue': {
      // GS-story-midchapter: dismiss the interlude → apply its outcome (mark seen once + the credit
      // consequence) and land on the clubhouse.
      if (state.screen !== 'storyInterlude' || !state.story?.alignment) return state;
      return { ...state, story: applyInterlude(state.story, state.story.alignment), screen: 'story' };
    }

    case 'chooseAlignment': {
      // GS-story-chapters: lock in the path at The Choice (Warden or Herald) → the clubhouse. Gated to the
      // choice screen with the path unchosen, so it fires exactly once.
      if (state.screen !== 'storyChoice' || !state.story || state.story.alignment) return state;
      return { ...state, story: chooseAlignment(state.story, action.alignment), screen: 'story' };
    }

    case 'openStoryFinale': {
      // GS-story-yggdrasil: open the finale briefing — only with the key forged (five Sigils) and unbeaten.
      if (state.screen !== 'story' || !state.story) return state;
      if (!finaleUnlocked(state.story)) return state;
      return { ...state, screen: 'storyFinale' };
    }

    case 'exitStoryFinale': {
      if (state.screen !== 'storyFinale') return state;
      return { ...state, screen: 'story' };
    }

    case 'engageStoryFinale': {
      // GS-story-yggdrasil: whether you CAN win is the deterministic arm-up floor (`finaleResult`, the two
      // gates). GS-story-finisher: the KILL is an interactive golf strike played by app.ts before this
      // dispatches; its quality (`strike`) colours the ending but NEVER decides win/lose (an armed player
      // always wins). A win marks the campaign complete (`completed` → Star Tour unlocks).
      if (state.screen !== 'storyFinale' || !state.story) return state;
      const res = finaleResult(state.story);
      const story = res.won ? winFinale(state.story) : state.story;
      return {
        ...state,
        story,
        screen: 'storyFinaleResult',
        lastStoryFinale: { won: res.won, failReason: res.failReason, strike: res.won ? action.strike ?? 'clean' : undefined },
      };
    }

    case 'storyFinaleContinue': {
      // GS-story-yggdrasil: dismiss the recap. A defeat returns to the clubhouse for a rematch; a victory
      // returns to the title (the campaign is complete — Star Tour is unlocked there).
      if (state.screen !== 'storyFinaleResult') return state;
      const won = state.lastStoryFinale?.won === true;
      return { ...state, screen: won ? 'title' : 'story', lastStoryFinale: undefined };
    }

    case 'playYggdrasilRealm': {
      // GS-star-tour-yggdrasil: play a Norse realm off the hidden World Tree on the star map. The tree is
      // revealed only once Thor's Hammer is won, and today ONLY Asgard has bloomed (the other branches are
      // placeholders for future realms) — so gate hard on both. This spins up a STANDALONE Asgard run (the
      // The Warrior's Tee tournament) from the star-map golfer's bag, exactly like `crossBifrost`, but WITHOUT
      // a suspended journey: `asgardFromStarTour` marks it so `leaveAsgard` returns to the map, not travel.
      if (state.screen !== 'starTour' || !state.run.loadout.characterId) return state;
      if (!state.ownedApparel.includes('thors-hammer')) return state;
      if (action.realmId !== 'asgard') return state;
      const run = startAsgardRun(state.run);
      const course = currentCourse(run);
      return {
        ...state,
        run,
        course,
        screen: 'playing',
        holeRng: new Rng(`${course.seed}:play`),
        stopPlayed: [],
        play: beginHole(course.holes[0]!, 0),
        match: undefined,
        played: undefined,
        lastResult: undefined,
        mulliganPending: undefined,
        starmartOffer: undefined,
        starmartRerolls: undefined,
        viewHole: 0,
        asgardFromStarTour: true,
        asgardReturn: undefined,
      };
    }

    case 'dismissLore': {
      // GS-lore: close the story beat, RECORD it as seen (so it never fires again, across every run +
      // mode — persist writes `seenLore`), and continue to the stop intro the gate diverted from. The
      // run/course were already pinned on the diverted-from state, so the intro renders exactly as it
      // would have; the intro-entry side-effect (introView reset) fires on the lore→intro transition.
      if (state.screen !== 'lore') return state;
      const id = state.pendingLoreId;
      const seenLore: SeenLore = id ? { ...state.seenLore, [id]: true } : state.seenLore;
      // GS-lore-rewards: a beat can PAY OUT on dismiss (unlock a ship, arm a boon). Applied ONCE here (the
      // beat is `once`), so it stays UI/render-only — zero sim rng, determinism/auto≡interactive untouched.
      const fx = loreEventById(id)?.effects;
      const ownedShips =
        fx?.unlockShip && !state.ownedShips.includes(fx.unlockShip)
          ? [...state.ownedShips, fx.unlockShip]
          : state.ownedShips;
      // Arm the Prognostic Parrot's 100% foresight for THIS stop (self-expiring off `stopIndex`).
      const run = fx?.parrotForesight ? { ...state.run, parrotForesightStop: state.run.stopIndex } : state.run;
      return { ...state, screen: 'intro', pendingLoreId: undefined, seenLore, ownedShips, run };
    }

    case 'play': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      // Matchplay boss stop (GS-100): play the duel (player ball + boss ball), pass on the match.
      // A TEAM duel (GS-team-duel) plays each side as solo/scramble/best-ball per the rank-based setup.
      if (isMatchplayBoss(currentBoss(state.run))) {
        const setup = teamDuelSetupForRun(state.run);
        const bossId = setup?.opponentId ?? resolveBossId(state.run);
        // The solo boss's home-turf edge was silently dropped on this watch path (headless playStop
        // always applied it) — resolve it the same way, and carry the Ascension edge (GS-boss-scale).
        const homeEdge = setup?.homeEdge ?? bossHasHomeEdge(bossId, state.course.meta?.themeId);
        const stop = setup
          ? playTeamMatchStop(
              state.course.holes,
              playerHoleOpts(state.run),
              bossId,
              setup,
              new Rng(`${state.course.seed}:play`),
              new Rng(`${state.course.seed}:boss`),
              homeEdge,
              bossEdgeForRun(state.run),
            )
          : playMatchStop(
              state.course.holes,
              playerHoleOpts(state.run),
              bossId,
              new Rng(`${state.course.seed}:play`),
              new Rng(`${state.course.seed}:boss`),
              homeEdge,
              bossEdgeForRun(state.run),
            );
        const { run, result } = finishStop(state.run, state.course, stop.player, {
          matchWon: stop.state.playerAdvances,
          prevBestHoles: state.endlessBestHoles,
        });
        const ended = run.status !== 'active';
        return {
          ...state,
          run,
          played: stop.player,
          lastResult: result,
          match: { bossId, bossHoles: stop.boss, duels: stop.duels, holesUp: stop.state.holesUp, decided: stop.state.decided, finished: true, setup },
          viewHole: 0,
          screen: ended ? 'gameover' : 'result',
          bestStableford: Math.max(state.bestStableford, result.stableford),
          bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
          bossReward: bossRewardFor(run, state.course, result),
          ...runEndUpdates(state, run),
          ...aceUpdates(state, result, state.ownedShips),
        };
      }
      const { run, result, played } = playStop(state.run, { prevBestHoles: state.endlessBestHoles });
      // GS-story-prologue: a Story Mode world round resolves back INTO the campaign (record the clear, pay
      // credits, advance the chapter), not the Star-Tour record boards. Checked before the strokeplay branch.
      // GS-story-tournament: a Galaxy Tournament round resolves vs the rival (Sigil + chapter advance).
      if (state.run.storyTournament) return resolveStoryTournament(state, played);
      if (state.run.storyRound) return resolveStoryRound(state, played);
      // Star Tour (GS-star-tour): a watched round is scored to the personal course-record boards, not the
      // Stableford cut/travel flow — resolve it like Asgard and land on the record recap.
      if (state.run.formatId === STROKEPLAY_FORMAT) return resolveStrokePlay(state, played);
      // The Asgard tournament (GS-asgard) is scored on total gross on The Warrior's Tee, not the cut —
      // resolve it here instead of the ordinary result flow (a watched Asgard stop still resolves).
      if (state.run.formatId === ASGARD_FORMAT) return resolveAsgard(state, played);
      // A run ends on a missed cut OR a won voyage (final boss cleared) — both bank shards and go to
      // the gameover/victory screen; a survived non-final stop goes to the result screen.
      const ended = run.status !== 'active';
      const endless = endlessProgressUpdates(state, run);
      // An eagle-or-better on Rainbow Road diverts to the Himinbjörg map instead (GS-asgard).
      return withAsgardPortal({
        ...state,
        run,
        played,
        lastResult: result,
        match: undefined,
        viewHole: 0,
        screen: ended ? 'gameover' : 'result',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        bossReward: bossRewardFor(run, state.course, result),
        ...endless,
        ...runEndUpdates(state, run),
        ...aceUpdates(state, result, endless.ownedShips ?? state.ownedShips),
      }, run, played);
    }

    case 'warpStop': {
      // WARP (GS-warp): fast-forward this whole stop under the hidden auto-birdie rule. Gated on
      // the pure `canWarpStop` (Unending only, contiguous prefix, whole stop under the proven
      // best), so it can never open new ground or fire past the cap. A warped stop always
      // survives, so this never reaches gameover; the result screen shows the (birdie-floored)
      // card like any watched stop. NO `aceUpdates` — an auto-birdied prefix can't earn the
      // Comet Rider — and `finishStop`'s warp opt already withheld the milestone shards;
      // `endlessProgressUpdates` is safe (the best-holes cap means it's a no-op) and keeps the
      // call-site shape identical to the other stop-scoring sites.
      if (state.screen !== 'intro') return state;
      if (!canWarpStop(state.run, state.endlessBestHoles, state.course.holes.length)) return state;
      const { run, result, played } = playStopWarp(state.run);
      return {
        ...state,
        run,
        played,
        lastResult: result,
        match: undefined,
        viewHole: 0,
        screen: 'result',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        ...endlessProgressUpdates(state, run),
        ...runEndUpdates(state, run),
      };
    }

    case 'playInteractive': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      // Matchplay boss stop (GS-100): pre-play the boss's ball for the whole stop (its own real shots,
      // deterministic), then play your ball hole-by-hole and compare. The boss uses its OWN rng stream,
      // so your interactive play is byte-for-byte the same as a non-boss stop.
      let match: MatchUi | undefined;
      if (isMatchplayBoss(currentBoss(state.run))) {
        const setup = teamDuelSetupForRun(state.run);
        const bossId = setup?.opponentId ?? resolveBossId(state.run);
        const bossTents = state.course.meta?.effect === 'tradeMarket';
        const bossScorch = state.course.meta?.effect === 'meteorShower';
        const bossPatch = effectPatchKind(state.course.meta?.effect);
        // The solo boss keeps its home-turf edge here too (it was dropped only on this interactive
        // path — headless playStop always applied it), and both shapes carry the run's Ascension
        // sharpening (GS-boss-scale) so the pre-played boss is the exact headless boss.
        const soloHomeEdge = bossHasHomeEdge(bossId, state.course.meta?.themeId);
        const bossHoles = setup
          ? playBossSideStop(state.course.holes, bossId, setup, new Rng(`${state.course.seed}:boss`), setup.homeEdge, state.run.loadout.rainbowRoad, bossTents, bossScorch, bossPatch, bossEdgeForRun(state.run))
          : playBossStop(state.course.holes, bossId, new Rng(`${state.course.seed}:boss`), soloHomeEdge, state.run.loadout.rainbowRoad, bossTents, bossScorch, bossPatch, bossEdgeForRun(state.run));
        match = { bossId, bossHoles, duels: [], holesUp: 0, decided: false, finished: false, setup, partnerHoles: setup ? [] : undefined };
      }
      return {
        ...state,
        screen: 'playing',
        holeRng: new Rng(`${state.course.seed}:play`),
        stopPlayed: [],
        play: beginHole(state.course.holes[0]!, 0),
        match,
        // A tent mulligan/StarMart never carries across a stop boundary (GS-tent-interactions).
        mulliganPending: undefined,
        starmartOffer: undefined,
        starmartRerolls: undefined,
      };
    }

    case 'shot': {
      if (state.screen !== 'playing' || !state.play || state.play.done || !state.holeRng) return state;
      if (awaitingPutt(state.play)) return state; // on the green → must putt, not swing
      if (state.scrambleChoice) return state; // already awaiting a ball pick
      // Team duel SCRAMBLE (GS-team-duel), player's side: resolve BOTH balls and let the player pick
      // which to keep (the choice card). Putts are not scrambled, so this fires on full swings only.
      const setup = state.match?.setup;
      // Trade-camp tents (GS-tents) / meteor scorch marks (GS-meteor-scorch) / effect ground patches
      // (GS-journey-fx-2): the route's course effect arms the hole's physical twist — pass it so the
      // interactive shot ricochets off tents / rests scorched or patched exactly as the headless sim.
      const tents = state.course.meta?.effect === 'tradeMarket';
      const scorch = state.course.meta?.effect === 'meteorShower';
      const patch = effectPatchKind(state.course.meta?.effect);
      if (setup?.partnerSide === 'player' && setup.format === 'scramble') {
        const scrambleChoice = resolveScrambleShot(
          state.play,
          { clubId: action.clubId, aim: action.aim, target: action.target, power: action.power },
          state.run.loadout,
          state.holeRng,
          setup.playerPartnerMods,
          tents,
          scorch,
          patch,
        );
        return { ...state, scrambleChoice };
      }
      // Fortune-teller MULLIGAN (GS-tent-interactions): a granted mulligan is spent on the NEXT tee shot
      // — resolve TWO of the player's OWN tee shots (both with the player's swing mods) and let them keep
      // the better line, reusing the scramble pick machinery. Consumes the pending mulligan.
      if (state.mulliganPending && state.play.lie === 'tee' && state.play.shots.length === 0) {
        const two = resolveScrambleShot(
          state.play,
          { clubId: action.clubId, aim: action.aim, target: action.target, power: action.power },
          state.run.loadout,
          state.holeRng,
          characterShotMods(state.run.loadout.characterId),
          tents,
          scorch,
          patch,
        );
        return { ...state, scrambleChoice: { ...two, mulligan: true }, mulliganPending: false };
      }
      // Prognostic Parrot FORESIGHT (GS-caddy-parrot): a per-full-swing proc where the pirate captain
      // SEES the shot — resolve TWO of the player's OWN swings and let them keep the better, reusing the
      // scramble choice card. The proc draw fires ONLY when the parrot is hired, so a normal hole's rng
      // stream is unchanged; the headless playHole draws the identical proc + partner (auto ≡ interactive).
      const foresight = foresightChance(state.run);
      if (foresight && state.holeRng.bool(foresight)) {
        const foreseen = resolveScrambleShot(
          state.play,
          { clubId: action.clubId, aim: action.aim, target: action.target, power: action.power },
          state.run.loadout,
          state.holeRng,
          characterShotMods(state.run.loadout.characterId),
          tents,
          scorch,
          patch,
        );
        return { ...state, scrambleChoice: { ...foreseen, preview: true } };
      }
      // Auto putt-out only when the Auto-Caddie legendary is owned; otherwise putting is manual.
      const auto = !!state.run.loadout.autoPutt;
      const play = takeShot(
        state.play,
        { clubId: action.clubId, aim: action.aim, target: action.target, power: action.power },
        state.run.loadout,
        state.holeRng,
        auto,
        scrambleOptsFor(state.run),
        tents,
        scorch,
        patch,
      );
      return applyTentReactions({ ...state, ...withBestBallPartner(state, play) }, play);
    }

    case 'chooseScrambleBall': {
      if (state.screen !== 'playing' || !state.scrambleChoice || !state.holeRng) return state;
      const auto = !!state.run.loadout.autoPutt;
      const play = commitScrambleBall(state.scrambleChoice, action.pick, state.run.loadout, state.holeRng, auto);
      return applyTentReactions({ ...state, play, scrambleChoice: undefined }, play);
    }

    case 'putt': {
      if (state.screen !== 'playing' || !state.play || state.play.done || !state.holeRng) return state;
      const play = takePutt(state.play, state.run.loadout, state.holeRng, action.control);
      return { ...state, ...withBestBallPartner(state, play) };
    }

    case 'autoShotHole': {
      if (state.screen !== 'playing' || !state.play || !state.holeRng) return state;
      let p = state.play;
      // A pending scramble pick already drew both balls — auto-keep the better (don't re-draw the rng).
      if (state.scrambleChoice) {
        p = autoCommitScrambleBall(state.scrambleChoice, state.run.loadout, state.holeRng, true);
      }
      let guard = 0;
      const scramble = scrambleOptsFor(state.run);
      const tents = state.course.meta?.effect === 'tradeMarket';
      const scorch = state.course.meta?.effect === 'meteorShower';
      const patch = effectPatchKind(state.course.meta?.effect);
      // Finish the hole: putt out if on the green, else swing (with auto putt-out on arrival).
      // GS-ai-attack: past the bogey bar the endless auto driver hunts pins — the identical per-hole
      // rule headless playStop applies, so an auto-finished hole stays byte-for-byte the sim's.
      const attack = endlessAttackArmed(state.run);
      const preview = foresightChance(state.run);
      while (!p.done && guard++ < 40) {
        if (awaitingPutt(p)) {
          p = takePutt(p, state.run.loadout, state.holeRng);
          continue;
        }
        // Prognostic Parrot foresight (GS-caddy-parrot) in the watch/auto-finish loop: the identical
        // proc + two-swing draws headless playHole does, auto-keeping the better (auto ≡ interactive).
        // Gated off during a team scramble (`!scramble`), matching playHole's `!opts.scramble`.
        if (!scramble && preview && state.holeRng.bool(preview)) {
          const foreseen = resolveScrambleShot(
            p,
            autoDecision(p, state.run.loadout, attack),
            state.run.loadout,
            state.holeRng,
            characterShotMods(state.run.loadout.characterId),
            tents,
            scorch,
            patch,
          );
          p = autoCommitScrambleBall(foreseen, state.run.loadout, state.holeRng, true);
          continue;
        }
        p = takeShot(p, autoDecision(p, state.run.loadout, attack), state.run.loadout, state.holeRng, true, scramble, tents, scorch, patch);
      }
      return { ...state, ...withBestBallPartner(state, p), scrambleChoice: undefined };
    }

    case 'holeComplete': {
      if (state.screen !== 'playing' || !state.play || !state.play.done) return state;
      const idx = state.play.holeIndex;
      const raw: PlayedHole = holeResult(state.play);
      // Team duel BEST-BALL (GS-team-duel), player's side: the partner played a parallel ball on the
      // SAME rng the moment the hole finished (`withBestBallPartner` — so the end-of-hole screen could
      // reveal both cards), and the better hole SCORE counts for both the duel and the stop. The
      // fallback re-play here draws the identical numbers, purely defensive.
      let teamHole = raw;
      let partnerHoles = state.match?.partnerHoles;
      const tSetup = state.match?.setup;
      if (tSetup?.partnerSide === 'player' && tSetup.format === 'bestball' && state.holeRng) {
        const already = state.match?.partnerHoles ?? [];
        const partnerHole =
          already[idx] ??
          playHole(state.course.holes[idx]!, state.holeRng, {
            ...playerHoleOpts(state.run),
            shotMods: tSetup.playerPartnerMods,
          });
        teamHole = betterPlayedHole(raw, partnerHole);
        partnerHoles = already.length > idx ? already : [...already, partnerHole];
      }
      const stopPlayed = [...(state.stopPlayed ?? []), teamHole];
      const nextIdx = idx + 1;
      const total = state.course.holes.length;

      // Matchplay (GS-100): score the just-finished hole against the boss's pre-played ball, and FINISH
      // the stop the moment the match is decided (a "3 & 2"), not only after all holes.
      if (state.match) {
        const justPlayed = stopPlayed[stopPlayed.length - 1]!;
        const bossHole = state.match.bossHoles[idx]!;
        const duels = [...state.match.duels, holeDuel(idx, state.play.hole.par, justPlayed, bossHole)];
        const ms = matchState(duels, total);
        const match: MatchUi = { ...state.match, duels, holesUp: ms.holesUp, decided: ms.decided, finished: ms.finished, partnerHoles };
        if (!ms.finished) {
          return { ...state, stopPlayed, match, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
        }
        const { run, result } = finishStop(state.run, state.course, stopPlayed, { matchWon: ms.playerAdvances });
        const ended = run.status !== 'active';
        return {
          ...state,
          run,
          stopPlayed: undefined,
          play: undefined,
          holeRng: undefined,
          played: stopPlayed,
          lastResult: result,
          match,
          viewHole: 0,
          screen: ended ? 'gameover' : 'result',
          bestStableford: Math.max(state.bestStableford, result.stableford),
          bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
          bossReward: bossRewardFor(run, state.course, result),
          ...runEndUpdates(state, run),
          ...aceUpdates(state, result, state.ownedShips),
        };
      }

      // The Unending Universe's survival bar (GS-set-survival) is judged on the whole SET of four, so a
      // blow-up hole never ends the stop mid-way — play every hole, then `finishStop` scores the set's
      // GS-story-tournament-midpop: the HALFTIME pop of an 18-hole major — after hole 9, the rival BRAGS if
      // they're ahead / CURSES you if you're beating them. Interactive-only (this per-hole `holeComplete`
      // path; the headless `play` resolves the whole round without it, so auto ≡ interactive + every
      // `{type:'play'}` test is unaffected). Fires exactly once at the nine-hole boundary.
      if (state.run.storyTournament && total === 18 && nextIdx === 9) {
        const t = tournamentForChapter(state.run.storyTournament, state.story?.alignment);
        if (t) {
          const pars = state.course.holes.map((h) => h.par);
          const rivalThru = rivalTotalThrough(t, String(state.run.seed), pars, 9);
          const playerThru = stopPlayed.reduce((s, p) => s + p.record.strokes, 0);
          return {
            ...state,
            stopPlayed,
            screen: 'storyTournamentPop',
            storyTournamentMidPop: {
              rivalId: t.rivalId,
              rivalName: t.rivalName,
              brag: rivalThru < playerThru, // rival ahead (fewer strokes) → they brag; else they curse you
              playerThru,
              rivalThru,
            },
          };
        }
      }
      // cumulative total (exactly as the headless `playStop` does), so auto ≡ interactive holds.
      if (nextIdx < total) {
        return { ...state, stopPlayed, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
      }
      // GS-story-prologue: a Story world round resolves into the campaign, not the course-record boards.
      if (state.run.storyTournament) return resolveStoryTournament(state, stopPlayed);
      if (state.run.storyRound) return resolveStoryRound(state, stopPlayed);
      // Star Tour (GS-star-tour): the 18-hole round is complete — bank it to the course-record boards.
      if (state.run.formatId === STROKEPLAY_FORMAT) return resolveStrokePlay(state, stopPlayed);
      // The Asgard tournament (GS-asgard) is decided on total gross on The Warrior's Tee — resolve it
      // here rather than through the ordinary Stableford-cut flow.
      if (state.run.formatId === ASGARD_FORMAT) return resolveAsgard(state, stopPlayed);
      // Set complete — score it exactly as the auto path does.
      const { run, result } = finishStop(state.run, state.course, stopPlayed, { prevBestHoles: state.endlessBestHoles });
      const ended = run.status !== 'active';
      const endless = endlessProgressUpdates(state, run);
      // An eagle-or-better on Rainbow Road diverts to the Himinbjörg map instead (GS-asgard).
      return withAsgardPortal({
        ...state,
        run,
        stopPlayed: undefined,
        play: undefined,
        holeRng: undefined,
        played: stopPlayed,
        lastResult: result,
        match: undefined,
        viewHole: 0,
        screen: ended ? 'gameover' : 'result',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        bossReward: bossRewardFor(run, state.course, result),
        ...endless,
        ...runEndUpdates(state, run),
        ...aceUpdates(state, result, endless.ownedShips ?? state.ownedShips),
      }, run, stopPlayed);
    }

    case 'continue': {
      if (state.screen !== 'result') return state;
      // After a boss win, claim the spoils first (GS-talents): a talent or a permanent reward.
      if (state.bossReward && state.bossReward.length) {
        return { ...state, screen: 'bossReward' };
      }
      // Fix the outfitter's stock now (from the post-stop run) so it stays put while shopping. The
      // single 4-card offer now mixes perk gear AND rare+ reward CLUBS (GS-clubs-2) from one draw.
      return {
        ...state,
        screen: 'shop',
        shopOffer: shopOffer(state.run).map((o) => o.item.id),
        shopRerolls: 0,
      };
    }

    case 'crossBifrost': {
      // Cross the Bifröst from the Himinbjörg map into the Asgard tournament (GS-asgard). The suspended
      // real run stays parked in `asgardReturn`; `run` becomes a fresh, self-contained nine-hole stroke
      // -play run on the Golden Realm (the player's bag minus the Rainbow Ball). Drop straight onto the
      // first hole — the Himinbjörg map WAS the between-stop screen.
      if (state.screen !== 'asgardMap' || !state.asgardReturn) return state;
      const run = startAsgardRun(state.run);
      const course = currentCourse(run);
      return {
        ...state,
        run,
        course,
        screen: 'playing',
        holeRng: new Rng(`${course.seed}:play`),
        stopPlayed: [],
        play: beginHole(course.holes[0]!, 0),
        match: undefined,
        played: undefined,
        lastResult: undefined,
        mulliganPending: undefined,
        starmartOffer: undefined,
        starmartRerolls: undefined,
        viewHole: 0,
      };
    }

    case 'leaveAsgard': {
      // Leave the Golden Realm (win or lose) and resume the suspended run at its journey map (GS-asgard).
      // Win OR lose the run loses the Rainbow Ball for good (stripped from perks + `rainbowConsumed` so
      // the shop never re-offers it); a WIN also grants the Odin's Favour perk. The Thor's Hammer cosmetic
      // was already banked at `resolveAsgard`.
      if (state.screen !== 'asgardResult') return state;
      // GS-star-tour-yggdrasil: a STANDALONE Asgard played off the World Tree has no suspended journey to
      // resume — hand the player back to the star map instead. Thor's Hammer (the only prize) was already
      // banked at `resolveAsgard`; there's no journey run to graft Odin's Favour onto. Rebuild a fresh
      // strokeplay run for the golfer so the map's flight/pick machinery has a clean run to work on.
      if (state.asgardFromStarTour) {
        const golfer = state.run.loadout.characterId;
        const run = golfer
          ? startRun(state.run.seed, STROKEPLAY_FORMAT, state.metaUpgrades, golfer, state.run.ascension, state.run.bagTier, state.run.unlockedClubs)
          : startRun(state.run.seed, STROKEPLAY_FORMAT, state.metaUpgrades);
        return {
          ...state,
          run,
          course: currentCourse(run),
          screen: 'starTour',
          asgardFromStarTour: undefined,
          asgardOutcome: undefined,
          asgardBanner: undefined,
          starTourPick: undefined,
          played: undefined,
          lastResult: undefined,
          match: undefined,
          bossReward: undefined,
          stopPlayed: undefined,
          play: undefined,
          holeRng: undefined,
          shopOffer: undefined,
          viewHole: 0,
        };
      }
      if (!state.asgardReturn) return state;
      const won = !!state.asgardOutcome?.won;
      const perks = state.asgardReturn.perks.filter((p) => p !== 'rainbow-ball');
      const editedPerks = won ? [...perks, 'talent-odins-favour'] : perks;
      const run = resumeRun({ ...state.asgardReturn, perks: editedPerks, rainbowConsumed: true });
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'travel',
        routes: routeOptions(run),
        asgardReturn: undefined,
        asgardOutcome: undefined,
        asgardBanner: won ? 'won' : 'lost',
        played: undefined,
        lastResult: undefined,
        match: undefined,
        bossReward: undefined,
        stopPlayed: undefined,
        play: undefined,
        holeRng: undefined,
        shopOffer: undefined,
        viewHole: 0,
      };
    }

    case 'pickBossReward': {
      if (state.screen !== 'bossReward' || !state.bossReward) return state;
      const choice = state.bossReward[action.index];
      if (!choice) return state;
      // A talent applies a run-scoped buff (rebuilt from perks on resume); a permanent reward banks
      // shards (cross-run). Then on to the shop with a fixed stock.
      const run = choice.kind === 'talent' ? grantTalent(state.run, choice.id) : state.run;
      const shards = choice.kind === 'shards' ? state.shards + (choice.shards ?? 0) : state.shards;
      return {
        ...state,
        run,
        shards,
        bossReward: undefined,
        screen: 'shop',
        shopOffer: shopOffer(run).map((o) => o.item.id),
        shopRerolls: 0,
      };
    }

    case 'buy': {
      if (state.screen !== 'shop') return state;
      const item = shopItem(action.id);
      if (!item) return state;
      // Hiring a NEW caddy while one is on the bag FIRES the incumbent (GS-caddy-factions). If the buy
      // is actually affordable, gate it behind a confirmation ("they won't be happy") the first time —
      // the shop renders the warning off `pendingFireCaddy`, and its Confirm button re-dispatches with
      // `confirmFire`. A caddy you can't afford never trips the warning (canBuy is false).
      const incumbent = namedCaddyOwned(state.run.loadout.perks);
      const wouldFire =
        item.caddy === 'named' &&
        !!incumbent &&
        incumbent !== action.id &&
        canBuy(item, ownedCount(state.run.loadout.perks, action.id), state.run.credits);
      if (wouldFire && !action.confirmFire) {
        return { ...state, pendingFireCaddy: { newId: action.id, oldId: incumbent! } };
      }
      const run = buy(state.run, action.id);
      // A no-op buy (unaffordable / maxed) leaves reputation untouched.
      if (run === state.run) return state.pendingFireCaddy ? { ...state, pendingFireCaddy: undefined } : state;
      // Move faction reputation: fire (−3 with the sacked caddy's faction) then hire (+1 with the new
      // one). Character-specific; a no-op if the run has no golfer (shouldn't happen in the shop).
      let reputation = state.reputation;
      const cid = run.loadout.characterId;
      if (item.caddy === 'named' && cid) {
        const fired = run.firedCaddies.find((id) => !state.run.firedCaddies.includes(id));
        if (fired) {
          const oldFaction = factionForCaddy(fired);
          if (oldFaction) reputation = adjustReputation(reputation, cid, oldFaction, REP_ON_FIRE);
        }
        const newFaction = factionForCaddy(action.id);
        if (newFaction) reputation = adjustReputation(reputation, cid, newFaction, REP_ON_HIRE);
      }
      return { ...state, run, reputation, pendingFireCaddy: undefined };
    }

    case 'cancelFireCaddy': {
      // Back out of a caddy swap — keep the caddy you have, hire nobody (GS-caddy-factions).
      if (!state.pendingFireCaddy) return state;
      return { ...state, pendingFireCaddy: undefined };
    }

    case 'rerollShop': {
      // Pay an escalating fee to redraw the outfitter's stock (GS-shop-reroll): agency over the offer.
      if (state.screen !== 'shop') return state;
      const rerolls = state.shopRerolls ?? 0;
      const cost = rerollCost(rerolls);
      if (state.run.credits < cost) return state;
      const next = rerolls + 1;
      return {
        ...state,
        run: { ...state.run, credits: state.run.credits - cost },
        shopRerolls: next,
        shopOffer: shopOffer(state.run, undefined, next).map((o) => o.item.id),
      };
    }

    case 'leaveShop': {
      if (state.screen !== 'shop') return state;
      return { ...state, screen: 'travel', routes: routeOptions(state.run), shopOffer: undefined, pendingFireCaddy: undefined };
    }

    // --- StarMart pop-up shop (GS-tent-interactions): spend SHARDS mid-hole ------------------------
    case 'openStarmart': {
      // Opened from the play screen the moment a StarMart tent's shot finishes animating (app `onDone`).
      if (state.screen !== 'playing') return state;
      return {
        ...state,
        screen: 'starmart',
        starmartOffer: starmartOffer(state.run).map((o) => o.item.id),
        starmartRerolls: 0,
      };
    }

    case 'buyStarmart': {
      if (state.screen !== 'starmart' || !state.starmartOffer) return state;
      const item = shopItem(action.id);
      if (!item || item.rarity === 'common') return state;
      const cost = STARMART_COST[item.rarity];
      const owned = ownedCount(state.run.loadout.perks, action.id);
      // Guard affordability + not-already-maxed; spend SHARDS (cross-run) and apply the item to the run
      // loadout (it round-trips via loadout.perks, so it lasts the run with no save bump). Pull the
      // bought card off the rack so it can't be re-bought.
      if (owned >= itemCap(item) || state.shards < cost) return state;
      return {
        ...state,
        shards: state.shards - cost,
        run: { ...state.run, loadout: item.apply(state.run.loadout) },
        starmartOffer: state.starmartOffer.filter((id) => id !== action.id),
      };
    }

    case 'rerollStarmart': {
      if (state.screen !== 'starmart') return state;
      const rerolls = state.starmartRerolls ?? 0;
      const cost = starmartRerollCost(rerolls);
      if (state.shards < cost) return state;
      const next = rerolls + 1;
      return {
        ...state,
        shards: state.shards - cost,
        starmartRerolls: next,
        starmartOffer: starmartOffer(state.run, undefined, next).map((o) => o.item.id),
      };
    }

    case 'leaveStarmart': {
      if (state.screen !== 'starmart') return state;
      // Back to the hole — keep playing from where the ball came to rest.
      return { ...state, screen: 'playing', starmartOffer: undefined, starmartRerolls: undefined };
    }

    case 'route': {
      if (state.screen !== 'travel') return state;
      const route = (state.routes ?? []).find((r) => r.id === action.routeId);
      if (!route) return state;
      // GS-fuel: a lane whose fuel shortfall exceeds the purse can't be taken (the UI disables it;
      // this guard keeps a stale click from throwing in `travel`).
      if (!canTravel(state.run, route)) return state;
      // GS-salvage-mystery: resolve the salvage reveal from the PRE-travel loadout (once `travel` has
      // run, the bag is mutated and the find can't be recomputed) — the same `salvageFindFor` source
      // `travel` grants from, so the reveal on the intro is exactly what got equipped.
      const salvageReveal = salvageFindFor(state.run, route);
      const run = travel(state.run, route);
      return withLoreGate({
        ...state,
        run,
        course: currentCourse(run),
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        salvageReveal,
        match: undefined,
        bossReward: undefined,
        asgardBanner: undefined, // the Asgard return note is a one-shot on the journey map (GS-asgard)
        viewHole: 0,
      });
    }

    case 'scanRoutes': {
      // Sector scan (GS-fuel-4): burn fuel to redraw the three onward lanes. Travel-screen only;
      // `scanRoutes` escalates the price per scan and always keeps ≥1 cell in the tank, and
      // `routeOptions` re-keys its stream off the bumped count — pure, so a resume reproduces the
      // scanned offer (the count + burnt fuel both persist on the run).
      if (state.screen !== 'travel' || state.run.status !== 'active') return state;
      if (!canScanRoutes(state.run)) return state;
      const run = scanRoutes(state.run);
      return { ...state, run, routes: routeOptions(run) };
    }

    case 'buyFuel': {
      // Top the tank up with run credits (GS-fuel) — offered at the Pro Shop's fuel depot and on
      // the journey screen. `buyFuel` clamps to tank space + affordability, so this can't overdraw.
      if (state.screen !== 'shop' && state.screen !== 'travel') return state;
      if (state.run.status !== 'active') return state;
      return { ...state, run: buyFuel(state.run, action.units) };
    }

    case 'strand': {
      // Out of fuel AND credits with no payable lane (GS-fuel): the run ends STRANDED. Mirrors
      // 'bank' (it's the travel screen's forced exit); leftover pocket change converts to shards
      // via cashOutShards' stranded rule.
      if (state.screen !== 'travel' || state.run.status !== 'active') return state;
      const run = strand(state.run);
      return {
        ...state,
        run,
        routes: undefined,
        screen: 'gameover',
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        ...runEndUpdates(state, run),
      };
    }

    case 'bank': {
      // Push-your-luck cash-out (GS-bank): only between stops (the travel screen), where you've
      // survived the last cut and hold credits worth locking in. Banking ends the run with its
      // credits converted to shards (busting forfeits them) — see shardsForRun.
      if (state.screen !== 'travel' || state.run.status !== 'active') return state;
      const run = bank(state.run);
      return {
        ...state,
        run,
        routes: undefined,
        screen: 'gameover',
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        // Banking ends the run (never a 'won') → bank shards + refresh the Trade Market (GS-garage).
        ...runEndUpdates(state, run),
      };
    }

    case 'viewHole': {
      const n = state.played?.length ?? state.course.holes.length;
      const hole = Math.max(0, Math.min(n - 1, action.hole));
      return { ...state, viewHole: hole };
    }

    case 'openMarket': {
      // The Trade Market (buy ships / apparel / bag tiers) is reachable between runs — from the title,
      // after a run ends, or from a character's Clubhouse ("buy more"). Buying grants GLOBAL ownership;
      // outfitting is done per character in the Clubhouse.
      if (state.screen !== 'title' && state.screen !== 'gameover' && state.screen !== 'clubhouse') return state;
      return { ...state, screen: 'trademarket' };
    }

    case 'closeMarket': {
      if (state.screen !== 'trademarket') return state;
      return { ...state, screen: 'title' };
    }

    case 'openClubhouseHall': {
      // Enter the Clubhouse — the hall where all four golfers wait, each a doorway to their own
      // garage + wardrobe. Reachable between runs (title / game over) and straight from the Trade
      // Market ("try it on") so a shopper can jump to outfitting without a title round-trip. Also from the
      // Star Tour star map (GS-star-tour-port): docking home at the spaceport opens the Clubhouse.
      if (
        state.screen !== 'title' &&
        state.screen !== 'gameover' &&
        state.screen !== 'trademarket' &&
        state.screen !== 'starTour'
      )
        return state;
      return { ...state, screen: 'clubhouseHall' };
    }

    case 'closeClubhouseHall': {
      if (state.screen !== 'clubhouseHall') return state;
      return { ...state, screen: 'title' };
    }

    case 'openClubhouse': {
      // Outfit ONE character's garage (owned ship) + wardrobe (owned hats/shirts). Reachable from the
      // Clubhouse hall (and historically straight from the title).
      if (state.screen !== 'title' && state.screen !== 'clubhouseHall') return state;
      if (!getCharacter(action.characterId)) return state;
      return { ...state, screen: 'clubhouse', manageCharacterId: action.characterId };
    }

    case 'closeClubhouse': {
      if (state.screen !== 'clubhouse') return state;
      return { ...state, screen: 'title', manageCharacterId: undefined };
    }

    case 'clubhouseBackToHall': {
      // From one golfer's stage back to the hall, so you can outfit another golfer without a round-trip
      // through the title (GS-clubhouse-stage). No-op unless we're actually on a golfer's stage.
      if (state.screen !== 'clubhouse') return state;
      return { ...state, screen: 'clubhouseHall', manageCharacterId: undefined };
    }

    case 'buyShip': {
      // Spend Star Shards on a cosmetic ship (GS-garage). Guarded: must be at the market, affordable,
      // unowned, and a real ship. Bought → globally owned (assign it to a character in the Clubhouse).
      if (state.screen !== 'trademarket') return state;
      const ship = shipById(action.id);
      if (!canBuyShip(ship, state.shards, state.ownedShips)) return state;
      return {
        ...state,
        shards: state.shards - ship!.cost,
        ownedShips: [...state.ownedShips, ship!.id],
      };
    }

    case 'buyApparel': {
      // Spend Star Shards on a cosmetic hat/shirt (GS-cosmetics). Guarded: at the market, affordable,
      // unowned. Bought → globally owned (wear it on a character in the Clubhouse).
      if (state.screen !== 'trademarket') return state;
      const item = apparelById(action.id);
      if (!canBuyApparel(item, state.shards, state.ownedApparel)) return state;
      return {
        ...state,
        shards: state.shards - item!.cost,
        ownedApparel: [...state.ownedApparel, item!.id],
      };
    }

    case 'selectShip': {
      // Fly a different OWNED ship on the MANAGED character (the Clubhouse garage). Cosmetic only.
      if (state.screen !== 'clubhouse' || !state.manageCharacterId) return state;
      if (!state.ownedShips.includes(action.id)) return state;
      return { ...state, shipByCharacter: { ...state.shipByCharacter, [state.manageCharacterId]: action.id } };
    }

    case 'equipApparel': {
      // Wear an OWNED hat/shirt on the MANAGED character; clicking the worn piece again takes it OFF
      // (back to that character's default look).
      if (state.screen !== 'clubhouse' || !state.manageCharacterId) return state;
      const item = apparelById(action.id);
      if (!item || !state.ownedApparel.includes(action.id)) return state;
      const cid = state.manageCharacterId;
      const map =
        item.slot === 'hat'
          ? 'hatByCharacter'
          : item.slot === 'shirt'
            ? 'shirtByCharacter'
            : item.slot === 'bag'
              ? 'golfBagByCharacter'
              : item.slot === 'driver'
                ? 'driverByCharacter'
                : 'pantsByCharacter';
      const current = state[map][cid];
      const next = { ...state[map] };
      if (current === action.id) delete next[cid];
      else next[cid] = action.id;
      return { ...state, [map]: next };
    }

    case 'setCharacterBagTier': {
      // Pick the MANAGED golfer's Unending-Universe starting bag tier from the Clubhouse wardrobe
      // (GS-wardrobe-bagtier) — the per-golfer difficulty axis. Clamped to the owned tier (never above
      // what's unlocked); picking the owned tier CLEARS the override so the golfer follows your best bag
      // as you unlock better ones. Meta only (no run/rng touch), so seeded runs are untouched.
      if (state.screen !== 'clubhouse' || !state.manageCharacterId) return state;
      if (bagTierRank(action.tier) > bagTierRank(state.bagTier)) return state;
      const cid = state.manageCharacterId;
      const next = { ...state.bagTierByCharacter };
      if (action.tier === state.bagTier) delete next[cid];
      else next[cid] = action.tier;
      return { ...state, bagTierByCharacter: next };
    }

    case 'dismissPriceNotice': {
      // Close the one-off Trade Market price-cut / refund notice (GS-trade-rebalance). Clearing it to
      // undefined means the next persist writes a save without the flag, so it never shows again.
      if (state.priceRefund == null) return state;
      return { ...state, priceRefund: undefined };
    }

    case 'buyBagTier': {
      // Spend Star Shards on a permanent default-bag upgrade (GS-bag-tiers). Guarded: must be at the
      // Trade Market, the tier unlocked (Ascension gate cleared), strictly higher than the current bag,
      // and affordable. The upgrade takes effect on the NEXT run (the placeholder run is rebuilt so the
      // course preview + a fresh start both reflect it).
      if (state.screen !== 'trademarket') return state;
      const set = bagSet(action.tier);
      if (!set || !canBuyBagSet(set, state.bagTier, state.maxAscension, state.shards)) return state;
      const run = startRun(state.run.seed, state.run.formatId, state.metaUpgrades, undefined, state.run.ascension, set.tier);
      return {
        ...state,
        run,
        course: currentCourse(run),
        shards: state.shards - set.cost,
        bagTier: set.tier,
        // Buying a new best bag AUTO-SETS every golfer to it (GS-wardrobe-bagtier) — clear all per-golfer
        // overrides so each character defaults to the fresh tier; the player re-picks a weaker bag per
        // golfer in the wardrobe afterwards.
        bagTierByCharacter: {},
      };
    }

    case 'toTitle': {
      // Return to the title from any screen (GS-settings-nav) — the escape hatch the settings sheet
      // offers on screens with no nav of their own (character select, clubhouse, mid-run…). Never
      // destructive: a run that's actually underway (a golfer picked, still active) is kept as a
      // resumable snapshot — exactly what a page reload offers — so "back to title" can't lose a run.
      // The title's placeholder run (no golfer yet) is NOT worth resuming; any older offer survives.
      if (state.screen === 'title') return state;
      const resumable =
        state.run.status === 'active' && state.run.loadout.characterId
          ? snapshotRun(
              state.run,
              // Carry a live stroke-play round's progress (GS-star-tour-resume) so a Star Tour round
              // parked via "back to title" resumes from the hole it left off, not the 1st tee.
              state.run.formatId === STROKEPLAY_FORMAT && state.play
                ? { stopHoleIndex: state.play.holeIndex, stopPlayed: state.stopPlayed ?? [] }
                : undefined,
            )
          : state.resumable;
      // Rebuild the placeholder run backing the title (same seed) so format previews start clean.
      const run = startRun(state.run.seed, undefined, state.metaUpgrades, undefined, 0, state.bagTier);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'title',
        resumable,
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        shopOffer: undefined,
        shopRerolls: undefined,
        play: undefined,
        holeRng: undefined,
        stopPlayed: undefined,
        match: undefined,
        scrambleChoice: undefined,
        bossReward: undefined,
        manageCharacterId: undefined,
        viewHole: 0,
      };
    }

    case 'restart': {
      // Fresh run; meta-progression carries over. A pending resume offer (a saved run) also
      // survives — restarting to a new seed (e.g. the Daily) must not wipe an unplayed run.
      return initState(
        action.seed ?? state.run.seed,
        {
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
          strokePlayBest: state.strokePlayBest,
          seenLore: state.seenLore,
        },
        state.resumable,
      );
    }
  }
}
