/**
 * UI screen-flow reducer — a PURE state machine over the (already pure) run API. Holds no
 * DOM and no time, so the whole interactive flow is unit-tested. `main.ts` renders the
 * returned `UiState` and dispatches `Action`s on clicks; save persistence is a side-effect
 * there, not here.
 *
 * Flow: intro → play → result → shop → travel → (next) intro … until a missed cut → gameover.
 */

import { playHole, type PlayedHole } from '../sim/round';
import type { Course } from '../sim/course/contract';
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
  startRun,
  startAsgardRun,
  strand,
  travel,
  salvageFindFor,
  grantTalent,
  starmartOffer,
  starmartRerollCost,
  STARMART_COST,
  type Run,
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
import { recordSerpentBout, serpentTrophyUnlock } from '../sim/rpg/serpentTrophy';
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
  storyComplete,
  type StoryState,
} from '../sim/rpg/story';
import { storyItemKind, buyStoryCard, worldHasShop } from '../sim/rpg/storyShop';
import { applyStoryGear, equipStoryGear, unequipStoryGear } from '../sim/rpg/storyGear';
import { applyStoryClubEffects } from '../sim/rpg/storyClubEffects';
import { hireStoryCaddy, setActiveStoryCaddy, applyStoryCaddy, worldCaddy } from '../sim/rpg/storyCaddies';
import { allyTalk } from '../sim/rpg/storyAllies';
import { isHeraldAgent, applyHeraldCaddies } from '../sim/rpg/storyHeraldCrew';
import { isOtherGolfer } from '../sim/rpg/storyCast';
import { claimCharacterQuest } from '../sim/rpg/characterQuests';
import { acceptQuest, completeQuest, activeQuest, questWorld, startableQuestForWorld } from '../sim/rpg/storyQuests';
import { isStoryShipId, buyStoryShip, equipStoryShip, worldIsShipVendor } from '../sim/rpg/storyShips';
import { isShipUpgradeId, buyShipUpgrade } from '../sim/rpg/storyShipUpgrades';
import { currentTournament, tournamentForChapter, tournamentRival, sigilMatchThrough, rivalTotalThrough, isTeamTournament, isTeamMatchTournament, teamPartnerOrDefault } from '../sim/rpg/storyTournaments';
import { finaleMatchup, coilChampionOptions, wardenAllyOptions, type CoilChampionId } from '../sim/rpg/storyBetrayal';
import { finaleUnlocked, finaleResult, winFinale } from '../sim/rpg/storyFinale';
import { grantChampionCosmetics } from '../sim/rpg/storyChampionCosmetics';
import { interludeSeen, applyInterlude } from '../sim/rpg/storyInterlude';
import { midroundOmen, applyMidroundOmen } from '../sim/rpg/storyMidround';
import { tournamentAftermath } from '../sim/rpg/storyAftermath';
import { activeQualifierPlan, qualifierMatchThrough } from '../sim/rpg/storyQualifierFormats';
import { questBeatFor, questBeatTurnIndex, questOfferBeatFor } from '../sim/rpg/storyQuestBeat';
import type { GearSlot } from '../sim/rpg/story';
import {
  campaignFor,
  campaignOverwriteWarning,
  campaignTags,
  championCampaigns,
  emptyCampaignStore,
  upsertCampaign,
  type CampaignStore,
  type CampaignTag,
} from '../sim/rpg/storyRoster';
import {
  clearSlot,
  readSlot,
  runModeOf,
  slotModeOf,
  slotTags,
  upsertSlot,
  UNKNOWN_GOLFER,
  type SlotTag,
} from '../sim/rpg/runSlots';
import { campaignWithLiveRound, resumableState } from './resumable';
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
import { SHIP_ROOMS } from './gameState';
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
  /** GS-save-slots: a single parked run, filed into its own `mode:golfer` slot. The save carries the
   *  whole table on `meta` now, so boot never passes this — it survives as the "old input, new
   *  output" adapter for a lone snapshot (the shape `migrateCampaignStore` uses for a bare campaign),
   *  which is what a caller with exactly one run in hand actually has. */
  resumable?: RunSnapshot,
  story?: StoryState,
  /** GS-story-campaign-slots: every campaign the player owns (`loadCampaignStore()`). Optional so every
   *  existing `initState(seed, meta)` call site — the whole test suite — is unchanged. */
  campaigns?: CampaignStore,
): UiState {
  const metaUpgrades = meta.metaUpgrades ?? {};
  const bagTier = meta.bagTier ?? DEFAULT_BAG_TIER;
  const run = startRun(seed, undefined, metaUpgrades, undefined, 0, bagTier);
  // GS-save-slots: the parked-run table, plus the lone-snapshot adapter above folded into its own
  // slot (and pointed at, since a caller handing over one run means that run).
  const loneMode = resumable ? slotModeOf(resumable) : null;
  const runSlots =
    resumable && loneMode
      ? upsertSlot(meta.runSlots ?? {}, loneMode, resumable.characterId, resumable)
      : meta.runSlots ?? {};
  const lastPlayed =
    resumable && loneMode
      ? { mode: loneMode, characterId: resumable.characterId ?? UNKNOWN_GOLFER }
      : meta.lastPlayed;
  return {
    run,
    screen: 'title',
    course: currentCourse(run),
    viewHole: 0,
    runSlots,
    ...(lastPlayed ? { lastPlayed } : {}),
    ...(story ? { story } : {}),
    // GS-story-campaign-slots: the whole roster, so the reducer can answer "does this golfer already
    // have a campaign?" — the question the overwrite confirmation guards a destructive write with.
    // Boot passes it alongside the active campaign; absent (tests, no storage) ⇒ an empty roster that
    // still contains the active campaign if there is one, so nothing downstream has to special-case it.
    campaigns: campaigns ?? (story ? upsertCampaign(emptyCampaignStore(), story) : emptyCampaignStore()),
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
    lastExportRun: meta.lastExportRun,
    endlessBestHoles: meta.endlessBestHoles ?? 0,
    marmotBartender: meta.marmotBartender ?? false,
    marmotTips: meta.marmotTips ?? 0,
    endlessRuns: meta.endlessRuns ?? [],
    reputation: meta.reputationByCharacter ?? {},
    strokePlayBest: meta.strokePlayBest ?? {},
    seenLore: meta.seenLore ?? {},
    // GS-story-startour-unlock: the permanent Star Tour unlock. Backfill it from a live already-completed
    // campaign at boot so a returning player who finished the story BEFORE this flag existed keeps the
    // reward the moment they start a new campaign (the flag then persists on the next save write).
    starTourUnlocked: (meta.starTourUnlocked ?? false) || (story ? storyComplete(story) : false),
    // GS-startour-serpent-trophy: the lifetime root tally, straight off the main save.
    serpentBouts: meta.serpentBouts ?? 0,
    serpentWins: meta.serpentWins ?? 0,
    priceRefund: meta.priceRefund,
  };
}

/**
 * The roster AS IT STANDS RIGHT NOW (GS-story-campaign-picker) — `state.campaigns` with the live
 * `state.story` laid over its own slot.
 *
 * This is what every picker/badge surface must read, and it exists so the roster can never go stale
 * without 190-odd `state.story` writes each having to remember to mirror themselves. The reason it is
 * sound is that **only one campaign can change while you play**: the active one, which IS `state.story`.
 * Every other slot was loaded at boot and nothing can touch it until it becomes the active one.
 */
export function currentRoster(state: UiState): CampaignStore {
  return state.story ? upsertCampaign(state.campaigns, state.story) : state.campaigns;
}

/**
 * The free-roam Star Tour run flown by a CHAMPION (GS-story-startour-champion): a strokeplay run whose
 * loadout is the finished campaign's — the equipped bag, gear and active caddy the golfer saved the
 * galaxy with, folded on in the same order `storyPlayWorld` folds them.
 *
 * ONE builder, because there are now two ways in (a lone champion resolved by `openStarTour`, and a
 * champion chosen off the picker) and they must produce the identical golfer. `DEFAULT_BAG_TIER` with no
 * meta upgrades is deliberate: the campaign's own bag is laid straight over the top, so the main save's
 * bag tier and Ascension clubs have nothing to say here — a champion's kit is the campaign's, entirely.
 */
function championRun(state: UiState, champion: StoryState): Run {
  const base = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, champion.characterId, 0, DEFAULT_BAG_TIER, []);
  const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...base.loadout, bag: storyBagClubs(champion) }, champion), champion), champion);
  return { ...base, loadout };
}

/** The campaign tag per golfer for the STORY picker (`campaignTags` over the live roster). Story Tour
 *  only by construction — the `character` screen is shared, so its badges are passed in, never looked
 *  up by the renderer, or every mode's picker would tag its golfers. */
export function storyCampaignTags(state: UiState): Record<string, CampaignTag> {
  return campaignTags(currentRoster(state));
}

/**
 * GS-save-slots: the run badge per golfer FOR THE MODE BEING ENTERED — the `campaignTags` twin, and
 * passed into the shared `character` screen for the same reason.
 *
 * The mode comes from the run backing the picker (`start` rebuilt it with the chosen format), which is
 * the SAME derivation the reducer's overwrite guard uses — so what the card offers and what tapping it
 * does cannot disagree. Empty for the Story clubhouse (that picker reads campaigns) and for Asgard.
 */
export function modeSlotTags(state: UiState): Record<string, SlotTag> {
  if (state.pendingStoryNew) return {};
  const mode = runModeOf(state.run.formatId);
  return mode && mode !== 'story' ? slotTags(state.runSlots, mode) : {};
}

/** The credit cost of the NEXT shop reroll (GS-shop-reroll) — base 30, ×1.6 per reroll this stop. */
export const REROLL_BASE_COST = 30;
export function rerollCost(rerolls: number): number {
  return Math.round(REROLL_BASE_COST * Math.pow(1.6, Math.max(0, rerolls)));
}

/**
 * GS-story-aftermath: the continuation AFTER a back-half Sigil recap (and its confrontation beat) — the
 * Chapter-4 emotional INTERLUDE (win a friend back / sever one) on a fresh win, else the clubhouse. Shared
 * by `storyTournamentContinue` (trunk / no-aftermath path) and `storyAftermathContinue` (after the beat),
 * so both read the identical branch. Clears the transient tournament payloads.
 */
/**
 * The matchplay boss's UI state (GS-100 / GS-team-duel) — for the first tee, AND for a stop RESUMED
 * mid-way (GS-save-slots).
 *
 * ONE builder because there are now two ways in, and a boss stop is exactly the case the design brief
 * flagged as needing proof: the duel standing must survive a park. It does, because every part of it
 * is DERIVABLE rather than remembered — the opponent from the run, the boss's whole card from its own
 * private `:boss` stream (never the play stream, so it is byte-identical whenever it is rebuilt), and
 * the duels by folding the cards the player has actually banked. Nothing here reads `holeRng`.
 *
 * `partnerHoles` is the one thing that cannot be rebuilt: a best-ball partner's ball is drawn from the
 * PLAY stream, interleaved with the player's shots, and a resume reseeds that stream. It is padded to
 * the right LENGTH with the banked cards instead — which is only ever bookkeeping, because the reveal
 * reads `partnerHoles[holeIndex]` (the hole being played, always written fresh by
 * `withBestBallPartner`) and the SCORES for finished holes are already in `stopPlayed`, where the
 * better ball was banked at the time. Without the padding the array would silently misalign, which is
 * the quiet kind of wrong this codebase keeps learning to avoid.
 */
/**
 * THE ONE PLACE A STORY WORLD ROUND IS BUILT (GS-story-round-resume).
 *
 * Two callers now: teeing off (`storyPlayWorld`) and picking a round back up
 * (`storyContinueCampaign`). They MUST produce the identical run or a resume would drop you into a
 * different round than the one you left — a different bag, a different sky, or worst of all a
 * different qualifier format, since the drawn format decides how the card is even scored.
 *
 * Nothing here is remembered: the loadout is folded from the campaign's own gear/caddy/clubs, the sky
 * is a pure function of the world, and the qualifier plan is a pure hash off `campaignSeed` + the
 * world. So the rebuild is exact by construction rather than by copying — the same reason a parked
 * run's course is rebuilt from its seed instead of stored.
 */
function buildStoryWorldRun(state: UiState, courseId: string, partnerId?: string): Run {
  const story = state.story!;
  const run0 = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, story.characterId, 0, DEFAULT_BAG_TIER, []);
  const bag = storyBagClubs(story);
  // GS-story-gear: fold the campaign's equipped gear (glove/hat/shoes/ball) effects onto the loadout.
  // GS-story-caddies: then the active caddy (a friend on the bag folds a real effect + shows on course).
  const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...run0.loadout, bag }, story), story), story);
  // GS-story-qualifier-formats: the chapter's qualifying events are nine-hole cards drawn into one of five
  // formats, three of which put a tour-mate beside you. The plan arms `currentCourse` (nine holes), the
  // shared co-op machinery, and the format's own scoring. A venue/prologue/quest world draws no plan ⇒ the
  // pinned 18, byte-for-byte. The partner is the player's dossier CHOICE, validated inside the plan.
  const qplan = activeQualifierPlan(story, courseId, partnerId);
  return {
    ...run0,
    loadout,
    staticCourseId: courseId,
    // GS-story-worlddiff: deep worlds play under a stiffer WIND (pure physics, records-safe) so they're
    // harder, not just longer — scaled by the world's tier, calm at Ch.1 → the wildest sky by Ch.5.
    staticEffect: storyWorldEffect(courseId),
    storyRound: true,
    ...(qplan ? { storyQualifier: qplan } : {}),
    ...(qplan?.partnerId ? { storyTournamentPartner: qplan.partnerId } : {}),
    ...(qplan?.pairing ? { storyTeamFormat: qplan.pairing } : {}),
  };
}

function buildMatch(run: Run, course: Course, played: readonly PlayedHole[]): MatchUi | undefined {
  if (!isMatchplayBoss(currentBoss(run))) return undefined;
  const setup = teamDuelSetupForRun(run);
  const bossId = setup?.opponentId ?? resolveBossId(run);
  const bossTents = course.meta?.effect === 'tradeMarket';
  const bossScorch = course.meta?.effect === 'meteorShower';
  const bossPatch = effectPatchKind(course.meta?.effect);
  // The solo boss keeps its home-turf edge here too (it was dropped only on this interactive
  // path — headless playStop always applied it), and both shapes carry the run's Ascension
  // sharpening (GS-boss-scale) so the pre-played boss is the exact headless boss.
  const soloHomeEdge = bossHasHomeEdge(bossId, course.meta?.themeId);
  const bossHoles = setup
    ? playBossSideStop(course.holes, bossId, setup, new Rng(`${course.seed}:boss`), setup.homeEdge, run.loadout.rainbowRoad, bossTents, bossScorch, bossPatch, bossEdgeForRun(run))
    : playBossStop(course.holes, bossId, new Rng(`${course.seed}:boss`), soloHomeEdge, run.loadout.rainbowRoad, bossTents, bossScorch, bossPatch, bossEdgeForRun(run));
  const duels = played.map((p, i) => holeDuel(i, course.holes[i]!.par, p, bossHoles[i]!));
  const ms = matchState(duels, course.holes.length);
  return {
    bossId,
    bossHoles,
    duels,
    holesUp: ms.holesUp,
    decided: ms.decided,
    finished: ms.finished,
    setup,
    partnerHoles: setup ? played.map((p) => p) : undefined,
  };
}

function continuePastTournament(state: UiState): UiState {
  const r = state.lastStoryTournament;
  if (r?.won && r.chapter === 4 && state.story?.alignment && !interludeSeen(state.story, state.story.alignment)) {
    return { ...state, screen: 'storyInterlude', lastStoryTournament: undefined, pendingAftermath: undefined };
  }
  return { ...state, screen: 'story', lastStoryTournament: undefined, pendingAftermath: undefined };
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
        // GS-save-slots: choosing a MODE parks nothing and destroys nothing. It used to clear the one
        // resumable offer outright, which is how "I'll just look at the Voyage" cost you an Unending
        // run. The golfer picker below badges each golfer with their slot FOR THIS MODE; continuing
        // one is a tap, and starting over a live slot goes through `requestSlotRestart`.
        slotOverwriteId: undefined,
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
        // GS-story-campaign-picker: campaigns are PER GOLFER, so picking one that already has a campaign
        // CONTINUES it — the picker is the campaign list. Creating a fresh campaign over the top is a
        // destructive write and must come through the confirmed `storyRestartCampaign` path instead;
        // guarding that here rather than in the screen means the confirmation cannot be bypassed by any
        // surface that dispatches `selectCharacter` (the inspect card, a deep link, a future picker).
        if (campaignFor(state.campaigns, action.characterId)) {
          return reduce({ ...state, characterLoreId: undefined }, { type: 'storyContinueCampaign', characterId: action.characterId });
        }
        return reduce({ ...state, characterLoreId: undefined }, { type: 'storyRestartCampaign', characterId: action.characterId });
      }
      // GS-save-slots: the SAME rule for every other mode. Runs are per mode per golfer now, so
      // picking a golfer who already has one going CONTINUES it — the picker is the run list. Starting
      // fresh over the top is a destructive write and must come through the confirmed
      // `slotRequestRestart` path; guarding it HERE rather than in the screen means the confirmation
      // cannot be bypassed by any surface that dispatches `selectCharacter` (a deep link, the inspect
      // card, a future picker). This is `storyOverwriteId`'s guard promoted, which is the whole point:
      // it was right, it simply was not applied widely enough.
      const pickMode = runModeOf(state.run.formatId);
      if (
        pickMode &&
        pickMode !== 'story' &&
        state.slotOverwriteId !== action.characterId &&
        readSlot(state.runSlots, pickMode, action.characterId)
      ) {
        return reduce(
          { ...state, characterLoreId: undefined },
          { type: 'resume', mode: pickMode, characterId: action.characterId },
        );
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
      // A CONFIRMED start-over empties the slot right here rather than waiting for the new run to
      // overwrite it. Waiting is not the same thing: a fresh Star Tour run has no course pinned, so
      // there is nothing worth parking yet and the old round would sit there — still offered — after
      // the player had explicitly agreed to bin it.
      const runSlots =
        pickMode && pickMode !== 'story' && state.slotOverwriteId === action.characterId
          ? clearSlot(state.runSlots, pickMode, action.characterId)
          : state.runSlots;
      // STAR TOUR (GS-star-tour-2): the golfer is chosen BEFORE the star map, so a strokeplay selection
      // flows to the map (to pick a world + fly the golfer's own ship) rather than straight to a stop
      // intro. The course pins on at `pickStarTourCourse`. Every other mode goes to the intro as before.
      if (state.run.formatId === STROKEPLAY_FORMAT) {
        return { ...state, run, course: currentCourse(run), screen: 'starTour', bagTierByCharacter, runSlots, slotOverwriteId: undefined, characterLoreId: undefined };
      }
      // The Marmot's tip jar ACCUMULATES across runs (GS-tent-tips) — a new run does NOT empty it, so it
      // fills toward a half-dozen over successive marmot bonks. The clubhouse renders the fill-then-cash-out
      // cycle off this running total (`marmotTips % (CAP + 1)`), so the reducer just keeps counting.
      return withLoreGate({ ...state, run, course: currentCourse(run), screen: 'intro', bagTierByCharacter, runSlots, slotOverwriteId: undefined, characterLoreId: undefined });
    }

    case 'backToCharacter': {
      // GS-intro-split: the arc-intro "Change golfer" back-out. Return to the roster to re-pick;
      // the run rebuilds (same seed + format) on the next `selectCharacter`. View-only navigation —
      // no run/rng change here, so seeded tests are untouched.
      if (state.screen !== 'intro') return state;
      return { ...state, screen: 'character' };
    }

    case 'resume': {
      // GS-save-slots: continue a parked run. Bare (the title's CONTINUE card) resumes whatever
      // `lastPlayed` points at; the per-mode golfer picker names the slot instead, so tapping a
      // golfer who already has a run going continues THAT one and never somebody else's.
      if (state.screen !== 'title' && state.screen !== 'character') return state;
      const target = action.mode
        ? { mode: action.mode, characterId: action.characterId ?? UNKNOWN_GOLFER }
        : state.lastPlayed;
      if (!target) return state;
      // Story Tour's progress is the campaign in `fc_story`, not a run slot — so "continue" there
      // means the campaign, and it is the campaign path that answers it. One entry point, one rule.
      if (target.mode === 'story') {
        return reduce(state, { type: 'storyContinueCampaign', characterId: target.characterId });
      }
      const snap = readSlot(state.runSlots, target.mode, target.characterId);
      if (!snap) return state;
      // THE SLOT IS LEFT EXACTLY WHERE IT IS (GS-resume-slot-loss).
      //
      // This used to `clearSlot` on the reasoning that "the offer is consumed: the run is LIVE now,
      // not parked", and that `persist` re-parks it from the live run on this very action so the slot
      // is refilled before anything can observe it empty. The second half is true and the conclusion
      // does not follow: `resumableState` rebuilds the slot from `state.runSlots` PLUS THE LIVE RUN,
      // so the clear survives only as long as the live run is still this golfer's. "‹ Change golfer"
      // makes it somebody else's — and with the entry already gone from the in-memory table, the very
      // next persist wrote a save with no trace of it. Park a Voyage, re-enter, tap that golfer,
      // change your mind, pick anybody else: the first run was gone.
      //
      // Clearing was never load-bearing. `resumableState` upserts the live run into this same slot on
      // every persist, so the entry is immediately rewritten with fresher data; the clear only ever
      // opened a window in which the table said less than the disk. Leaving it makes `state.runSlots`
      // a faithful superset of the save, which is the invariant every other reader assumes.
      const lastPlayed = target;
      const run = resumeRun(snap);
      const course = currentCourse(run);
      // MID-STOP RESUME (GS-star-tour-resume, generalised by GS-save-slots): a parked run carries its
      // completed scorecard (`stopPlayed`) + the hole reached (`stopHoleIndex`), so continue drops you
      // back on that hole's tee with your card intact. ONE rule for every mode, deliberately — a player
      // who learns one mode's behaviour would otherwise lose a run in another (and it is strictly LESS
      // forgiving than the restart-the-stop resume it replaces, which handed back every hole).
      //
      // `holeRng` is reseeded fresh: the play stream's position isn't persisted, so the holes still to
      // come simply draw a new dispersion stream. Nothing already banked is re-rolled, and the headless
      // auto sim — the thing determinism is guarded for — never takes this path.
      //
      // Everything else the stop needs is DERIVED rather than remembered: the course from the run's own
      // seed/stop/theme/event, the cut and the competition field inside `finishStop` from `run` +
      // `stopPlayed`, the endless set allowance from `run.holesSurvived` + the same cards, and the duel
      // standing from `buildMatch`. No lore gate here (you're already teed off, mid-round).
      if (snap.stopPlayed && snap.stopHoleIndex !== undefined && snap.stopHoleIndex < course.holes.length) {
        return {
          ...state,
          run,
          course,
          screen: 'playing',
          holeRng: new Rng(`${course.seed}:play`),
          stopPlayed: [...snap.stopPlayed],
          play: beginHole(course.holes[snap.stopHoleIndex]!, snap.stopHoleIndex),
          match: buildMatch(run, course, snap.stopPlayed),
          played: undefined,
          lastResult: undefined,
          routes: undefined,
          // A tent mulligan / StarMart offer never survives leaving the stop, exactly as they never
          // carry across a stop boundary (GS-tent-interactions).
          mulliganPending: undefined,
          starmartOffer: undefined,
          starmartRerolls: undefined,
          scrambleChoice: undefined,
          lastPlayed,
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
        lastPlayed,
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
      // GS-star-tour-port: the Clubhouse hall used to carry a "Depart to Star Tour" button (the spaceport
      // ↔ clubhouse loop) — RETIRED, a leftover from the pre-champions Star Tour. The Clubhouse is the
      // outfitting room reached from the title, and the mode is entered from the title tile, so
      // `clubhouseHall` is no longer an origin: leave it out or the guard promises a route nothing takes.
      if (!['title', 'gameover', 'strokeResult', 'starTour', 'character'].includes(state.screen)) return state;
      // GS-story-startour-champion: Star Tour is the REWARD for completing the campaign, so a finished
      // campaign plays free-roam AS the developed champion — the golfer who saved the galaxy, carrying the
      // bag / gear / active caddy you built up.
      //
      // GS-story-startour-champions: campaigns are PER GOLFER, so "the champion" became "the champions".
      // Read the ROSTER, never `state.story` alone — `state.story` is merely whichever campaign happens to
      // be loaded, so off it a player with a finished Larry and a half-played Feather would be told they
      // have no champion at all. Three cases, and the FIRST is a promise:
      //   0 ⇒ the classic character-first flow, byte-for-byte. `starTourUnlocked` is a PERMANENT main-save
      //       flag and remains the only gate on the mode: a player who finished the campaign under the old
      //       single-slot save and then started over holds the unlock with an empty champion roster, and
      //       they must still get Star Tour. Champions ENRICH the mode; they never gate it.
      //   1 ⇒ straight to the map as them (you already ARE your champion — nothing to pick).
      //   2+ ⇒ pick which champion to fly as.
      const champions = championCampaigns(currentRoster(state));
      const keepGolfer = state.screen === 'strokeResult' && !!state.run.loadout.characterId;
      // Coming back from a round keeps whoever just played it — you picked them a moment ago, so a second
      // picker would be asking again for no reason. Applies to champions and ordinary golfers alike.
      const justPlayed = keepGolfer ? champions.find((c) => c.characterId === state.run.loadout.characterId) : undefined;
      const champion = champions.length === 1 ? champions[0] : justPlayed;
      if (!champion && champions.length > 1) {
        // Leave `run`/`story` alone — the champion's run is built by `selectStarTourChampion`, so nothing
        // is committed by merely opening the picker.
        return { ...state, screen: 'starTourChampion', starTourPick: undefined, played: undefined, lastResult: undefined, lastStrokeRecord: undefined, strokeIsRecord: undefined, viewHole: 0 };
      }
      let run;
      if (champion) {
        run = championRun(state, champion);
      } else if (keepGolfer) {
        run = startRun(state.run.seed, STROKEPLAY_FORMAT, state.metaUpgrades, state.run.loadout.characterId, state.run.ascension, state.run.bagTier, state.run.unlockedClubs);
      } else {
        run = startRun(state.run.seed, STROKEPLAY_FORMAT, state.metaUpgrades);
      }
      return {
        ...state,
        run,
        // The chosen champion becomes the LIVE campaign, so the ~190 existing `state.story` readers
        // (`championFreeRoam`, `tourShipId`, the Root replay) keep working unchanged. Safe because
        // `writeStory` upserts by `characterId` and deliberately does NOT move `activeId` — free-roaming
        // as Larry can never hijack the "Continue" of a Feather campaign left mid-chapter.
        ...(champion ? { story: champion } : {}),
        screen: champion || keepGolfer ? 'starTour' : 'character',
        // GS-startour-chart-mode: THE door into free roam — every other route onto the chart (character
        // select, the champion picker, a service exit, `leaveAsgard`) inherits this through `...state`,
        // so the chart can never disagree with itself about which mode it is.
        starTourFreeRoam: true,
        starTourPick: undefined,
        played: undefined,
        lastResult: undefined,
        lastStrokeRecord: undefined,
        strokeIsRecord: undefined,
        viewHole: 0,
      };
    }

    case 'selectStarTourChampion': {
      // GS-story-startour-champions: fly free-roam as THIS champion (only reachable from the picker, and
      // only for a golfer whose campaign is actually finished — so a stale id or a hand-built dispatch
      // can never promote an unfinished campaign into the free-roam reward).
      if (state.screen !== 'starTourChampion') return state;
      const champion = campaignFor(currentRoster(state), action.characterId);
      if (!champion || !storyComplete(champion)) return state;
      return { ...state, run: championRun(state, champion), story: champion, screen: 'starTour', starTourPick: undefined, viewHole: 0 };
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

    case 'serpentBout': {
      // GS-startour-serpent-trophy: one resolved encounter at the root of Yggdrasil (the champion's
      // replay of the fight that ended their campaign). Every one counts — that is the whole feature —
      // and at `SERPENT_TROPHY_WINS` victories the world serpent itself is hung in the global garage.
      //
      // GS-story-startour-champions made the replay reducer-LESS so that "it touches no campaign state"
      // was true by construction. Counting is a main-save fact, not a campaign one, so the guarantee
      // does not go away — it MOVES: this case reads and writes the lifetime tally + `ownedShips` and
      // NOTHING else, leaving `state.story` / `state.campaigns` referentially identical. That is now an
      // assertion in `tests/serpent-trophy.test.ts` rather than an absence of code, which is a weaker
      // guarantee honestly stated and a stronger one than "remember not to".
      //
      // The screen is deliberately NOT checked: the replay lives on the star map but resolves through a
      // full-screen battle overlay, and refusing a bout because the underlying screen moved would throw
      // away a fight the player actually finished.
      const tally = recordSerpentBout({ bouts: state.serpentBouts, wins: state.serpentWins }, action.won);
      const ownedShips = serpentTrophyUnlock(state.ownedShips, tally.wins);
      return {
        ...state,
        serpentBouts: tally.bouts,
        serpentWins: tally.wins,
        // Referentially unchanged unless the grail was just earned (the `aceShipUnlock` idiom), so a
        // bout 1,001 writes the same array back and announces nothing.
        ...(ownedShips !== state.ownedShips ? { ownedShips } : {}),
      };
    }

    case 'openStory': {
      // GS-story: enter Story Mode. If a campaign is loaded (boot read `fc_story` into `state.story`),
      // CONTINUE it — straight to the hub. Otherwise begin a NEW campaign by picking a golfer (the
      // `pendingStoryNew` flag routes `selectCharacter` to create the `StoryState`).
      // GS-story-campaign-picker: Story Tour ALWAYS opens the golfer picker now — campaigns are per
      // golfer, so "which campaign?" and "which golfer?" are the same question, and answering it on one
      // screen is what makes a second campaign discoverable at all. The picker tags each golfer with
      // their campaign state (`campaignTags`), so you can see who has a run going before you tap.
      if (state.screen !== 'title' && state.screen !== 'gameover' && state.screen !== 'story') return state;
      return {
        ...state,
        screen: 'character',
        // GS-startour-chart-mode: a door into a CAMPAIGN, so the chart is the campaign navigator again —
        // a free-roam session left armed would send this campaign's spaceport to the title Clubhouse.
        starTourFreeRoam: undefined,
        pendingStoryNew: true,
        storyInspectId: undefined,
        storyOverwriteId: undefined,
        slotOverwriteId: undefined,
      };
    }

    case 'storyContinueCampaign': {
      // GS-story-campaign-picker: resume a SAVED campaign from the picker. This is the old `openStory`
      // continue branch, now keyed by golfer instead of by "the one campaign" — every guard it carried
      // still applies, because they are properties of the campaign, not of how you reached it.
      if (state.screen !== 'character' && state.screen !== 'title' && state.screen !== 'story') return state;
      const saved = campaignFor(state.campaigns, action.characterId);
      if (!saved) return state;
      // GS-startour-chart-mode: the OTHER door into a campaign — `resume` routes a parked story round
      // straight here, bypassing `openStory`, so it has to disarm free roam itself.
      const base = { ...state, starTourFreeRoam: undefined, pendingStoryNew: false, storyInspectId: undefined, storyOverwriteId: undefined };
      // GS-story-quality (finding A): The Choice is reached only via the transient tournament-result
      // screen (neither it nor `lastStoryTournament` is persisted), so quitting mid-dismiss after the
      // Chapter-3 win would silently railroad you onto the default Warden route AND skip the Chapter-4
      // interlude. If a loaded campaign has advanced past the trunk (chapter ≥ 4) with no path chosen and
      // the finale not yet won, re-present The Choice instead of dropping into the hub.
      if (saved.chapter >= 4 && !saved.alignment && saved.completed !== true) {
        return { ...base, story: saved, screen: 'storyChoice' };
      }
      // GS-story-quality: normalise a Herald campaign's caddy roster on resume (a save from before the Coil
      // volunteers shipped still carries Warden caddies) — the Warden friends leave, the Coil takes the bag.
      const story = applyHeraldCaddies(saved);
      const hub: UiState = { ...base, story, campaigns: upsertCampaign(state.campaigns, story), screen: 'story' };
      // GS-story-round-resume: a world round left part-way through puts you back on the hole you were
      // on, not on its first tee. The run is REBUILT by the same builder that started it (nothing about
      // the round is remembered beyond which world and which partner), then the hole is re-teed with the
      // banked card intact — the same shape as the run-slot mid-stop resume, for the same reason.
      const live = story.liveRound;
      if (!live) return hub;
      const run = buildStoryWorldRun(hub, live.courseId, live.partnerId);
      const course = currentCourse(run);
      // A hole index the rebuilt course cannot serve means the world changed under the campaign (a
      // GENERATOR_VERSION bump re-rolls a static course). Falling back to the hub is the old behaviour,
      // which is the right floor: a tee that cannot be built must never strand the campaign.
      if (live.stopHoleIndex >= course.holes.length) return hub;
      return {
        ...hub,
        run,
        course,
        screen: 'playing',
        holeRng: new Rng(`${course.seed}:play`),
        stopPlayed: [...live.stopPlayed],
        play: beginHole(course.holes[live.stopHoleIndex]!, live.stopHoleIndex),
        played: undefined,
        lastResult: undefined,
        viewHole: 0,
      };
    }

    case 'slotRequestRestart': {
      // GS-save-slots: the player wants to START OVER as a golfer who already has a run parked in the
      // mode they are entering. Raise the confirmation rather than writing — and refuse outright when
      // there is nothing to overwrite, so this can never become a second, unguarded way to bin a run.
      // The exact twin of `storyRequestRestart`, deliberately: one shape, four modes.
      if (state.screen !== 'character' || state.pendingStoryNew) return state;
      const mode = runModeOf(state.run.formatId);
      if (!mode || mode === 'story') return state;
      if (!readSlot(state.runSlots, mode, action.characterId)) return state;
      return { ...state, slotOverwriteId: action.characterId };
    }

    case 'slotCancelRestart': {
      if (!state.slotOverwriteId) return state;
      return { ...state, slotOverwriteId: undefined };
    }

    case 'storyRequestRestart': {
      // GS-story-campaign-picker: the player wants to START OVER as a golfer who already has a campaign.
      // Raise the confirmation rather than writing — and refuse outright when there is nothing to
      // overwrite, so this can never become a second, unguarded way to create a campaign.
      if (state.screen !== 'character' || !state.pendingStoryNew) return state;
      if (!campaignFor(state.campaigns, action.characterId)) return state;
      return { ...state, storyOverwriteId: action.characterId };
    }

    case 'storyCancelRestart': {
      if (!state.storyOverwriteId) return state;
      return { ...state, storyOverwriteId: undefined };
    }

    case 'storyRestartCampaign': {
      // GS-story-campaign-picker: CREATE a campaign for this golfer — a fresh one for a golfer who has
      // none, or the confirmed replacement of an existing one. It overwrites exactly ONE slot; every
      // other golfer's campaign (and their Star Tour champion) is untouched, which is the whole point of
      // the roster. Only reachable from the picker, and only past the confirmation when there is
      // something to destroy — `selectCharacter` routes here for a golfer with no campaign, and the
      // confirm sheet routes here for one with.
      if (state.screen !== 'character' || !state.pendingStoryNew) return state;
      const replacing = !!campaignFor(state.campaigns, action.characterId);
      if (replacing && state.storyOverwriteId !== action.characterId) return state; // unconfirmed ⇒ refuse
      // GS-story-qualifier-formats: stamp the campaign's DRAW-SHEET seed off the boot run seed (the
      // one sanctioned `Math.random` site, `freshRunSeed`), so every campaign draws its own qualifier
      // formats/pairings/partners while each remains a pure keyed hash from then on. `defaultStoryState`
      // stays rng-free (it's sim-pure); the seed is a side-effect-layer value threaded in here.
      const story = { ...defaultStoryState(action.characterId), campaignSeed: `c${state.run.seed}` };
      return {
        ...state,
        story,
        campaigns: upsertCampaign(state.campaigns, story),
        pendingStoryNew: false,
        storyInspectId: undefined,
        storyOverwriteId: undefined,
        characterLoreId: undefined,
        screen: 'story',
      };
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
      // GS-story-venue-services: a Pro Shop opened as a SIGIL-RECAP detour is a detour — the only way off
      // it is back to the recap. Teeing off from there would strand the major's continuation chain (the
      // ceremony, The Choice, the aftermath beat, the interlude), which is precisely the beat `back`
      // swallows on that screen; a shop button must not become the side door back never was.
      if (state.screen === 'storyShop' && state.storyShopReturn === 'storyTournamentResult') return state;
      // GS-story-qualifier-formats: a chapter's QUALIFYING EVENTS are nine-hole cards drawn into one of five
      // formats — and three of those five put a tour-mate beside you. Arming the plan here does three things
      // at once: `currentCourse` serves nine holes, the paired formats arm the SAME co-op machinery the team
      // Sigils use (`storyTeamFormat` + `storyTournamentPartner` → the per-shot scramble pick card / the
      // per-hole best-ball reveal, and `scrambleOptsFor` so the auto path plays best-of-two identically), and
      // the resolution scores the round in the format's own units. A venue/prologue/quest world draws no
      // plan ⇒ the pinned 18, byte-for-byte.
      // GS-story-qualifier-partner-pick: the partner is the player's CHOICE (the dossier's picker), not the
      // draw's — the format and the pairing are the draw's to set, the company is yours. Validated inside
      // the plan, so a skipped picker tees off with the drawn suggestion exactly as before.
      const run = buildStoryWorldRun(state, action.courseId, action.partnerId);
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

    case 'showCharacterLore': {
      // GS-char-lore: tap a golfer's portrait on any select screen to read their dossier. UI-only, zero
      // sim rng; open only where a golfer is being chosen (the card grid or the Story clubhouse).
      const onSelect = state.screen === 'character' || state.screen === 'story';
      if (!onSelect) return state;
      return { ...state, characterLoreId: action.characterId };
    }

    case 'closeCharacterLore': {
      return state.characterLoreId ? { ...state, characterLoreId: undefined } : state;
    }

    case 'storySwitchGolfer': {
      // GS-story-clubhouse: change your protagonist from the prologue hub — only BEFORE the campaign has
      // begun (chapter 0, Earth not yet cleared), so it never rewrites a golfer mid-campaign.
      if (state.screen !== 'story' || !state.story || state.story.chapter > 0) return state;
      // …and never CLOBBER THE GOLFER YOU ARE SWITCHING TO (GS-story-switch-clobber). This restamps the
      // LOADED campaign with another golfer's id, and `writeStory` → `upsertCampaign` keys on exactly
      // that id — so switching to Larry wrote your prologue straight over Larry's chapter-1 slot. The
      // chapter check above guards the campaign you are LEAVING; this guards the one you are LANDING ON.
      // Same predicate the restart confirm consults, so the reducer and the sheet cannot disagree about
      // what "there is something here to destroy" means.
      if (campaignOverwriteWarning(currentRoster(state), action.characterId)) return state;
      return { ...state, story: { ...state.story, characterId: action.characterId }, storyInspectId: undefined };
    }

    case 'openStoryMap': {
      // GS-story-map: open the galaxy star-map navigator from the spaceport clubhouse (post-recruitment) OR
      // straight from a world-clear recap (`storyResult`) so finishing a world drops you back on the chart to
      // fly on / fly home (GS-story-worldclear-map). It REUSES the Star Tour `starTour` screen in a story
      // context — app.ts's dispatch handler flags `starTourView.storyMode` so the chart plots the campaign's
      // charted worlds + flies the story ship.
      if ((state.screen !== 'story' && state.screen !== 'storyResult') || !state.story) return state;
      // GS-startour-chart-mode: state the mode outright, even though the campaign doors already did —
      // this is the action that NAMES the campaign navigator, and it is the one a reader looks for.
      return { ...state, screen: 'starTour', starTourFreeRoam: undefined, lastStoryRound: undefined };
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
      // GS-story-shop-crossnav: also reachable from the SHIPYARD at the same world (the two services link to
      // each other so you don't fly back to the map between them).
      // GS-story-venue-services: and from the SIGIL RECAP — a major is played at a world with a Pro Shop, and
      // the recap used to fly you straight home, so restocking meant a round trip across the galaxy.
      if (
        (state.screen !== 'starTour' &&
          state.screen !== 'storyResult' &&
          state.screen !== 'storyShipyard' &&
          state.screen !== 'storyTournamentResult') ||
        !state.story
      )
        return state;
      if (!worldCleared(state.story, action.worldId) || !worldHasShop(action.worldId)) return state;
      // GS-story-shop-routing: the Pro Shop always returns to the STAR MAP (fly on), whether opened from the
      // star-map dossier (revisit), the world-clear RECAP (first-time), or the shipyard cross-link — every
      // origin is one tap from the map, so exiting always lands there (loop-free, no service back-stack).
      // The ONE exception is the Sigil recap: that screen is a forward-only beat with a continuation chain
      // still to run (the ceremony → The Choice / the aftermath / the interlude), so shopping from it is a
      // DETOUR that hands you back to the recap — never a route that skips the beat.
      const storyShopReturn: Screen = state.screen === 'storyTournamentResult' ? 'storyTournamentResult' : 'starTour';
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
      // GS-story-shop-crossnav: recruit the world's caddy from its Pro Shop OR its Shipyard too, not only the
      // star-map dossier / clear recap. GS-story-venue-services: three Sigil venues host a friend (Orion
      // Forge, Hydra Mire, the Ghost Wreck), so the major's recap offers the recruit as well.
      if (
        state.screen !== 'starTour' &&
        state.screen !== 'storyResult' &&
        state.screen !== 'storyShop' &&
        state.screen !== 'storyShipyard' &&
        state.screen !== 'storyTournamentResult'
      )
        return state;
      // GS-story-quality (GAP1): a Herald can't recruit the Warden friends they turned against (Dan &
      // Penelope are rivals to crush on the dark path) — the recruit UI is hidden, and a stray dispatch
      // is refused here too.
      if (state.story.alignment === 'herald') return state;
      const wid = action.worldId;
      if (!worldCleared(state.story, wid) || worldCaddy(wid) !== action.caddyId) return state;
      const story = hireStoryCaddy(state.story, action.caddyId);
      return story === state.story ? state : { ...state, story };
    }

    case 'setStoryCaddy': {
      // GS-story-caddies: choose which owned caddy carries your bag (an EQUIP). Reachable from the Locker
      // AND from an ally's talk card on the clubhouse hub (GS-story-allies — "carry my bag") or aboard the
      // ship (GS-story-ship-interior).
      if ((state.screen !== 'storyLocker' && state.screen !== 'story' && state.screen !== 'shipInterior') || !state.story) return state;
      const story = setActiveStoryCaddy(state.story, action.caddyId);
      return story === state.story ? state : { ...state, story };
    }

    case 'storyInspectAlly': {
      // GS-story-allies / GS-story-herald-clubhouse: tap a crew standee → open their talk card. On the Warden
      // path that's a real hired caddy; on the Herald path it's a Coil agent (Voss/Venoma/Ouros/Ecdysis).
      // Guarded to the hub OR the ship interior (GS-story-ship-interior — the crew wander aboard too) + a
      // genuine crew member, so a stray tap can't open a mute card.
      if ((state.screen !== 'story' && state.screen !== 'shipInterior') || !state.story) return state;
      const realCaddy = state.story.hiredCaddyIds.includes(action.caddyId) && !!allyTalk(action.caddyId);
      // GS-story-cast: a tapped standee may also be one of your three friend golfers (the OTHER playable
      // characters travelling with you) — same inspect/talk/close plumbing, the screen branches on the id.
      const friendGolfer = isOtherGolfer(state.story, action.caddyId);
      if (!realCaddy && !isHeraldAgent(action.caddyId) && !friendGolfer) return state;
      return { ...state, storyAllyInspectId: action.caddyId, storyAllyTalk: 0 };
    }

    case 'storyAllyTalk': {
      // GS-story-allies: cycle the open ally's banter line (the Parrot-bar tap pattern). Purely cosmetic.
      if ((state.screen !== 'story' && state.screen !== 'shipInterior') || state.storyAllyInspectId !== action.caddyId) return state;
      return { ...state, storyAllyTalk: (state.storyAllyTalk ?? 0) + 1 };
    }

    case 'storyCloseAlly': {
      return state.storyAllyInspectId ? { ...state, storyAllyInspectId: undefined, storyAllyTalk: undefined } : state;
    }

    case 'acceptStoryQuest': {
      // GS-story-quests: accept an ally's side quest from their clubhouse card. Guarded to the hub + an
      // offerable quest (acceptQuest re-checks). Closes the ally card so the active-quest banner shows.
      // Reachable from the hub OR aboard the ship (GS-story-ship-interior — the crew wander aboard too).
      if ((state.screen !== 'story' && state.screen !== 'shipInterior') || !state.story) return state;
      const story = acceptQuest(state.story, action.questId);
      if (story === state.story) return state;
      return { ...state, story, storyAllyInspectId: undefined, storyAllyTalk: undefined };
    }

    case 'claimCharacterQuest': {
      // GS-story-charquests: claim a friend's SIGNATURE club from their talk card (once you've partnered
      // them in a team Sigil). Guarded to the hub / aboard + an offerable claim (claimCharacterQuest
      // re-checks). Keeps the card open so the "claimed" badge shows immediately.
      if ((state.screen !== 'story' && state.screen !== 'shipInterior') || !state.story) return state;
      const story = claimCharacterQuest(state.story, action.charId);
      if (story === state.story) return state;
      return { ...state, story };
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
      // GS-story-quest-offer-beat: play the ally's PITCH as a cinematic beat before the round tees off, so the
      // first story beat lands here (not just as clubhouse-banner prose). `storyQuestOfferContinue` funnels on
      // to the round intro (the same `withLoreGate` both paths reach). Absent `offer` lines ⇒ straight to intro.
      const base = { ...state, run, course: currentCourse(run), viewHole: 0, played: undefined, storyItemInspectId: undefined };
      const offer = questOfferBeatFor(run);
      if (offer) return { ...base, screen: 'storyQuestOffer', pendingQuestOffer: offer };
      return withLoreGate({ ...base, screen: 'intro' });
    }

    case 'storyStartQuest': {
      // GS-story-map-nav: accept + tee off an ally quest STRAIGHT FROM THE STAR MAP's world dossier — so you
      // can identify a quest world on the chart, fly there, and play it without going back through the
      // clubhouse. Resolves the quest that plays on this world (an already-active one, else an offerable
      // one for the path), accepts it if needed, then builds the quest round exactly like `playStoryQuest`.
      if (state.screen !== 'starTour' || !state.story) return state;
      const q = startableQuestForWorld(state.story, action.courseId);
      const worldId = q ? questWorld(q) : undefined;
      if (!q || !worldId) return state;
      // Accept it if it isn't already the active quest; bail if it turned out not to be offerable.
      const story = state.story.activeQuestId === q.id ? state.story : acceptQuest(state.story, q.id);
      if (story.activeQuestId !== q.id) return state;
      const run0 = startRun(state.run.seed, STROKEPLAY_FORMAT, {}, story.characterId, 0, DEFAULT_BAG_TIER, []);
      const bag = storyBagClubs(story);
      const loadout = applyStoryClubEffects(applyStoryCaddy(applyStoryGear({ ...run0.loadout, bag }, story), story), story);
      const run = {
        ...run0,
        loadout,
        staticCourseId: worldId,
        staticEffect: storyWorldEffect(worldId),
        storyRound: true,
        storyQuest: q.id,
      };
      // GS-story-quest-offer-beat: the star-map "accept & play" path used to skip the ally's pitch entirely —
      // fly the offer beat here too, so the first story beat lands regardless of how the player reached the
      // round. Then `storyQuestOfferContinue` flows on to the same round intro (`withLoreGate`).
      const base = { ...state, story, run, course: currentCourse(run), viewHole: 0, played: undefined, storyItemInspectId: undefined };
      const offer = questOfferBeatFor(run);
      if (offer) return { ...base, screen: 'storyQuestOffer', pendingQuestOffer: offer };
      return withLoreGate({ ...base, screen: 'intro' });
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
      if (
        (state.screen !== 'storyShop' &&
          state.screen !== 'storyLocker' &&
          state.screen !== 'storyShipyard' &&
          state.screen !== 'shipInterior') ||
        !state.story
      )
        return state;
      // GS-story-locker-inspect: a hired CADDY is inspectable too (its effect + lore card in the locker).
      const isHiredCaddy = state.story.hiredCaddyIds.includes(action.itemId);
      // GS-story-quality: quest/major/charquest REWARD clubs and PLAIN starter clubs (`plain:<type>`) carry
      // lore cards too (the locker builds these ids via `lorableId`) — accept them so tapping a reward or a
      // green starter club in the locker actually raises its card, not a dead tap. `charquest:` (a friend's
      // signature club) was missing here + in the locker, so tapping one raised the original green iron.
      const isLorableClub =
        action.itemId.startsWith('quest:') ||
        action.itemId.startsWith('major:') ||
        action.itemId.startsWith('charquest:') ||
        action.itemId.startsWith('plain:');
      if (
        !storyItemKind(action.itemId) &&
        !isStoryShipId(action.itemId) &&
        !isShipUpgradeId(action.itemId) &&
        !isHiredCaddy &&
        !isLorableClub
      )
        return state;
      return { ...state, storyItemInspectId: action.itemId };
    }

    case 'storyCloseItem': {
      // Must accept every screen that can OPEN an item card (`storyInspectItem` above) — including the ship
      // interior — or the lore card can't be dismissed (the aboard-ship undismissable-popup bug).
      if (
        state.screen !== 'storyShop' &&
        state.screen !== 'storyLocker' &&
        state.screen !== 'storyShipyard' &&
        state.screen !== 'shipInterior'
      )
        return state;
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
      // GS-story-locker: open the campaign locker from the clubhouse OR the ship interior's locker room
      // (GS-story-ship-interior). Records the origin so exiting returns there.
      if ((state.screen !== 'story' && state.screen !== 'shipInterior') || !state.story) return state;
      return { ...state, screen: 'storyLocker', storyLockerReturn: state.screen, storyItemInspectId: undefined };
    }

    case 'exitStoryLocker': {
      if (state.screen !== 'storyLocker') return state;
      return { ...state, screen: state.storyLockerReturn ?? 'story', storyLockerReturn: undefined, storyItemInspectId: undefined };
    }

    case 'openStoryBar': {
      // GS-story-parrot-bar: enter the Parrot's cantina from the spaceport clubhouse; the chatter starts
      // on the greeting (talk 0). GS-story-prologue-beats: the FIRST Chapter-1 visit answers the
      // cinematic's "meet me at the bar — I'll tell you everything" — record it (persisted in
      // `seenStoryBeats`, no version bump) so the clubhouse ❗ pull retires; a quit before visiting
      // keeps the pull alive. No rng.
      if (state.screen !== 'story' || !state.story) return state;
      const story =
        state.story.chapter <= 1 && !state.story.seenStoryBeats['story-bar-briefing']
          ? { ...state.story, seenStoryBeats: { ...state.story.seenStoryBeats, 'story-bar-briefing': true as const } }
          : state.story;
      return { ...state, story, screen: 'storyBar', storyBarTalk: 0 };
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
        // GS-story-shop-crossnav: also reachable from the PRO SHOP at the same world.
        // GS-story-venue-services: and from the SIGIL RECAP, like the Pro Shop.
        if (
          (state.screen !== 'starTour' &&
            state.screen !== 'storyResult' &&
            state.screen !== 'storyShop' &&
            state.screen !== 'storyTournamentResult') ||
          !state.story
        )
          return state;
        if (!worldCleared(state.story, wid) || !worldIsShipVendor(wid)) return state;
        // GS-story-shop-routing: the vendor shipyard routes EXACTLY like the Pro Shop at the same world —
        // out to the STAR MAP from every origin. It used to send the world-clear RECAP home to the
        // clubhouse instead, so on the handful of vendor worlds the recap's two service buttons landed in
        // two different places and "leave the shipyard" read as "fly home". The Sigil recap is the same
        // detour exception the shop makes (its continuation chain still has to run).
        const back: Screen = state.screen === 'storyTournamentResult' ? 'storyTournamentResult' : 'starTour';
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
      // unaffordable/owned/locked (buyShipUpgrade gates). GS-story-quality: BUYING is only at a ship-vendor
      // WORLD's shipyard now — the ship-interior rooms EQUIP/display what you already own, they don't sell
      // (a shop shouldn't live inside your own hull). The vendor is where the fleet's arms are traded.
      if (state.screen !== 'storyShipyard' || !state.story) return state;
      const story = buyShipUpgrade(state.story, action.upgradeId);
      if (story === state.story) return state;
      return { ...state, story, storyItemInspectId: undefined };
    }

    case 'openShipInterior': {
      // GS-story-ship-interior: step INSIDE your ship from the star map — the rooms, your crew wandering
      // between them. Bumps `shipVisit` so the crew re-scatter to new rooms each time you board.
      if (state.screen !== 'starTour' || !state.story) return state;
      return {
        ...state,
        screen: 'shipInterior',
        shipRoom: 'bridge',
        shipInteriorReturn: 'starTour',
        shipVisit: (state.shipVisit ?? 0) + 1,
        storyItemInspectId: undefined,
      };
    }

    case 'exitShipInterior': {
      if (state.screen !== 'shipInterior') return state;
      return { ...state, screen: state.shipInteriorReturn ?? 'starTour', storyItemInspectId: undefined };
    }

    case 'shipInteriorGoto': {
      // Walk to a room aboard the ship (bridge/engine/weapons/lounge/locker).
      if (state.screen !== 'shipInterior') return state;
      if (!(SHIP_ROOMS as readonly string[]).includes(action.room)) return state;
      return { ...state, shipRoom: action.room, storyItemInspectId: undefined };
    }

    case 'openStoryTournament': {
      // GS-story-tournament: open the current chapter's Galaxy Tournament lobby, only when one is actually
      // unlocked (qualified in two events, Sigil unwon).
      // GS-story-map-nav: reachable from the clubhouse banner OR the star-map VENUE dossier (fly directly to
      // the Sigil). Records the origin so backing out of the lobby returns THERE, not always the clubhouse.
      if ((state.screen !== 'story' && state.screen !== 'starTour') || !state.story) return state;
      if (!currentTournament(state.story)) return state;
      return { ...state, screen: 'storyTournament', storyTournamentReturn: state.screen };
    }

    case 'exitStoryTournament': {
      if (state.screen !== 'storyTournament') return state;
      // GS-story-map-nav: return to wherever the lobby was opened from (the star map, or the clubhouse).
      return { ...state, screen: state.storyTournamentReturn ?? 'story', storyTournamentReturn: undefined };
    }

    case 'selectStoryPartner': {
      // GS-story-partners: pick your partner for a team Sigil in the lobby (one of your three friends).
      if (state.screen !== 'storyTournament' || !state.story) return state;
      if (!isOtherGolfer(state.story, action.characterId)) return state;
      return { ...state, storyPartnerPick: action.characterId };
    }

    case 'selectFinalePartner': {
      // GS-story-sigil5-npc: pick your Ch.5 2v2 finale ally in the lobby — a loyal tour-mate (Warden) or a
      // Coil champion (Herald: Voss/Venoma/Scorpius, minus your caddy). Reject anything not a valid option
      // for the path so the pick can never desync the matchup.
      if (state.screen !== 'storyTournament' || !state.story) return state;
      const t = currentTournament(state.story);
      if (!t || !isTeamMatchTournament(t)) return state;
      const valid =
        state.story.alignment === 'herald'
          ? coilChampionOptions(state.story).includes(action.characterId as CoilChampionId)
          : wardenAllyOptions(state.story).includes(action.characterId);
      if (!valid) return state;
      return { ...state, storyFinalePartner: action.characterId };
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
      // GS-story-partners: a TEAM Sigil (Scramble/Best-ball) carries your chosen partner onto the run so the
      // resolution folds their ghost in (defaulting to your first tour-mate if the picker was skipped).
      // GS-story-sigil5-play: the Ch.5 2v2 SCRAMBLE MATCHPLAY finale is a real scramble too — your side's
      // partner is the finale ALLY (the loyal friend on Warden / the Coil champion on Herald), so the round
      // plays the interactive best-of-two exactly like Sigil 1 (auto ≡ interactive via `scrambleOptsFor`;
      // the resolution then scores the PLAYED team strokes, not a re-folded ally ghost).
      const teamMatch = isTeamMatchTournament(t);
      const partner = isTeamTournament(t)
        ? teamPartnerOrDefault(state.story, state.storyPartnerPick)
        : teamMatch
        ? // GS-story-sigil5-npc: carry the chosen finale ally (loyal friend / Coil champion) onto the run.
          finaleMatchup(state.story, state.story.activeCaddyId, state.storyFinalePartner).allyId
        : undefined;
      // GS-story-sigil-play: a TEAM Sigil carries its co-op FORMAT so the round plays interactively — a
      // SCRAMBLE arms the per-shot pick card, a BEST-BALL the per-hole reveal (the 2v2 finale is a scramble).
      const teamFormat = isTeamTournament(t) ? (t.format as 'scramble' | 'bestball') : teamMatch ? ('scramble' as const) : undefined;
      const run = {
        ...run0,
        loadout,
        staticCourseId: t.venueId,
        // GS-story-worlddiff: the major plays under its venue's tier wind too (the ghost rival also scales).
        staticEffect: storyWorldEffect(t.venueId),
        storyRound: true,
        storyTournament: t.chapter,
        ...(partner ? { storyTournamentPartner: partner } : {}),
        ...(teamFormat ? { storyTeamFormat: teamFormat } : {}),
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

    case 'storyMidBeatContinue': {
      // GS-story-midround-omen: dismiss the pre-Choice foreshadow → mark it seen (fires once per run) and
      // flow into the halftime rival pop (its payload was stashed on the divert). Guarded to the beat screen.
      if (state.screen !== 'storyMidBeat') return state;
      return {
        ...state,
        screen: 'storyTournamentPop',
        pendingMidBeat: undefined,
        ...(state.story ? { story: applyMidroundOmen(state.story) } : {}),
      };
    }

    case 'storyQuestBeatContinue': {
      // GS-story-caddy-quest-dialogue: dismiss the caddy's mid-round beat → tee up the next hole and play on.
      // The next hole index is exactly how many holes have been banked so far (the turn hole), so this resumes
      // the quest round cleanly. Guarded to the beat screen with live play state; defensive fallbacks keep a
      // stale state from blanking (fall back to the clubhouse if the course/round is gone).
      if (state.screen !== 'storyQuestBeat') return state;
      const nextIdx = (state.stopPlayed ?? []).length;
      const hole = state.course.holes[nextIdx];
      if (!hole) return { ...state, screen: 'story', pendingQuestBeat: undefined };
      return { ...state, screen: 'playing', pendingQuestBeat: undefined, play: beginHole(hole, nextIdx) };
    }

    case 'storyQuestOfferContinue': {
      // GS-story-quest-offer-beat: dismiss the ally's pitch → fly out and tee up the quest round. The run +
      // course were built on the divert (from `playStoryQuest`/`storyStartQuest`), so this just flips to the
      // round intro through the SAME `withLoreGate` both round-start paths funnel into (an arrival lore beat
      // may still fire after). Guarded to the offer screen.
      if (state.screen !== 'storyQuestOffer') return state;
      return withLoreGate({ ...state, screen: 'intro', pendingQuestOffer: undefined });
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
      // GS-story-aftermath: a back-half Sigil (Ch.4/5) lands a post-result CONFRONTATION beat — win OR loss
      // — before the interlude / clubhouse (Scorpius withdrawing, the key forging, the harvest), so the
      // result carries weight instead of cutting straight on. Trunk majors return undefined ⇒ unchanged.
      if (r && state.story) {
        const t = tournamentForChapter(r.chapter, state.story.alignment);
        const beat = t ? tournamentAftermath(t, state.story, r.won) : undefined;
        if (beat) return { ...state, screen: 'storyTournamentAftermath', pendingAftermath: beat };
      }
      return continuePastTournament(state);
    }

    case 'storyAftermathContinue': {
      // GS-story-aftermath: dismiss the post-Sigil confrontation beat → the interlude (a Ch.4 win) or the
      // clubhouse (everything else). Runs the SAME continuation the aftermath diverted from.
      if (state.screen !== 'storyTournamentAftermath') return state;
      return continuePastTournament({ ...state, pendingAftermath: undefined });
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
      // GS-story-quality: turning Herald swaps the caddy roster — the Warden friends you betrayed DESERT you,
      // and the Coil inner circle VOLUNTEER as your caddies in their place (free, Venoma on the bag). A Warden
      // choice keeps the roster untouched.
      const chosen = applyHeraldCaddies(chooseAlignment(state.story, action.alignment));
      return { ...state, story: chosen, screen: 'story' };
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
      // GS-story-yggdrasil: whether you CAN win is still the deterministic arm-up floor (`finaleResult`,
      // the two gates) — a gate-lost ship can NEVER win, whatever the battle reports (no soft-lock, the
      // briefing never lies). GS-story-battle-2: an ARMED ship can now LOSE the live fight (shields down →
      // `outcome: 'lost'`) — it is merely REPELLED (`failReason: 'repelled'`): the campaign is saved at the
      // root and it re-engages at no cost, so the fight has real stakes without ever walling progress.
      // Default (no `outcome`) = the gate verdict, byte-for-byte the classic resolution. GS-story-finisher:
      // the strike quality (`strike`) colours a win but never decides it.
      if (state.screen !== 'storyFinale' || !state.story) return state;
      const res = finaleResult(state.story);
      const repelled = res.won && action.outcome === 'lost';
      const won = res.won && !repelled;
      const story = won ? winFinale(state.story) : state.story;
      // GS-story-champion-cosmetics: the ending hangs the path's set in the GLOBAL wardrobe — the route ship
      // you flew that road plus its three-piece outfit, keyed on the alignment you finished on. Every other
      // campaign reward lives inside `fc_story` and dies with the slot; this is the one that outlives it, so
      // it goes on the main save beside `starTourUnlocked`. Idempotent and purely additive (same array refs
      // when nothing is new), so re-winning is a no-op and the other path's set is only ever ADDED later.
      const champ = won
        ? grantChampionCosmetics(state.ownedShips, state.ownedApparel, story.alignment)
        : undefined;
      return {
        ...state,
        story,
        // GS-story-startour-unlock: a finale win PERMANENTLY unlocks Star Tour on the main save — so
        // starting a fresh campaign (which resets the campaign's own `completed` flag) never relocks it.
        ...(won ? { starTourUnlocked: true } : {}),
        ...(champ ? { ownedShips: champ.ownedShips, ownedApparel: champ.ownedApparel } : {}),
        screen: 'storyFinaleResult',
        lastStoryFinale: {
          won,
          failReason: won ? undefined : repelled ? 'repelled' : res.failReason,
          strike: won ? action.strike ?? 'clean' : undefined,
          championUnlocked: champ?.unlocked,
          championSet: champ?.cosmetics?.setName,
        },
      };
    }

    case 'storyFinaleContinue': {
      // GS-story-yggdrasil: dismiss the recap. A defeat returns to the clubhouse for a rematch.
      // GS-story-credits: a VICTORY rolls the credits — the recap's button has said "Roll the credits ›"
      // since the finale shipped, and until now it went straight to the title. The roll reads the live
      // `story` (its alignment picks the ending, its partner tally picks who ran), so the campaign is
      // deliberately still loaded here; `endStoryCredits` is what finally lands on the title.
      if (state.screen !== 'storyFinaleResult') return state;
      const won = state.lastStoryFinale?.won === true;
      return { ...state, screen: won ? 'storyCredits' : 'story', lastStoryFinale: undefined };
    }

    case 'endStoryCredits': {
      // GS-story-credits: the end of the roll (and of the campaign) — the title, where Star Tour is now
      // unlocked. Guarded to the screen like every other navigation action, so a stray dispatch from
      // anywhere else is a no-op rather than a way out of a run.
      if (state.screen !== 'storyCredits') return state;
      return { ...state, screen: 'title' };
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
      const next = { ...state, screen: 'intro' as const, pendingLoreId: undefined, seenLore, ownedShips, run };
      // GS-story-beat-venue: at a SIGIL tee-off, beats CHAIN. The chapter's Sigil-flavoured beats (the rival
      // who actually waits at this tee + the Ragnarök omen that counts the Sigils) all land on the ONE major
      // arrival, so the gate runs again here and plays the next one instead of stranding it. Everywhere else
      // the classic pacing holds — one beat per arrival — so a qualifying round is never a wall of dialogue.
      // The just-seen beat is already recorded, so the chain always terminates.
      return next.run.storyTournament != null ? withLoreGate(next) : next;
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
      // so your interactive play is byte-for-byte the same as a non-boss stop. `buildMatch` is shared
      // with the mid-stop resume so the two can never describe the duel differently.
      return {
        ...state,
        screen: 'playing',
        holeRng: new Rng(`${state.course.seed}:play`),
        stopPlayed: [],
        play: beginHole(state.course.holes[0]!, 0),
        match: buildMatch(state.run, state.course, []),
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
      // GS-story-sigil-play: a Story team Sigil in SCRAMBLE format — you and your chosen partner both hit,
      // pick the better ball (the same choice card the team-duel/parrot use). `scrambleOptsFor` also arms
      // the AUTO path (playStop/autoShotHole), so auto ≡ interactive. Only on a full swing (not on the green).
      const storyScramble = state.run.storyTeamFormat === 'scramble' ? scrambleOptsFor(state.run) : undefined;
      if (storyScramble) {
        const scrambleChoice = resolveScrambleShot(
          state.play,
          { clubId: action.clubId, aim: action.aim, target: action.target, power: action.power },
          state.run.loadout,
          state.holeRng,
          storyScramble.partnerMods,
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
      // GS-story-sigil-live: a MATCHPLAY Sigil (Ch.3 singles / Ch.5 2v2) CLOSES OUT the moment it's
      // decided — up by more than the holes that remain — exactly like real matchplay. The resolution
      // banks only the holes the match ran (and never writes a partial `worldBest`), and the headless
      // auto path truncates to the same `thru` in `resolveStoryTournament`, so auto ≡ interactive holds.
      if (state.run.storyTournament && nextIdx < total) {
        const t = tournamentForChapter(state.run.storyTournament, state.story?.alignment);
        if (t) {
          const pars = state.course.holes.map((h) => h.par);
          const m = sigilMatchThrough(t, state.story, stopPlayed.map((p) => p.record.strokes), String(state.run.seed), pars, {
            teamPlayed: state.run.storyTeamFormat === 'scramble',
            chosenAllyId: state.run.storyTournamentPartner,
          });
          if (m?.res.state.decided) return resolveStoryTournament({ ...state, stopPlayed }, stopPlayed);
        }
      }
      // GS-story-qualifier-match-live: a `pair-match` QUALIFYING EVENT closes out the same way — once your
      // side is up by more than the holes that remain, the match is over and walking in is the honest
      // ending (the panel has already called it). Resolves through the SAME `resolveStoryRound` path, which
      // scores the holes the match actually ran and skips the partial `worldBest` write.
      if (state.run.storyQualifier?.format === 'pair-match' && nextIdx < total) {
        const res = qualifierMatchThrough(
          state.run.storyQualifier,
          stopPlayed.map((p) => p.record.strokes),
          state.course.holes.map((h) => h.par),
          String(state.run.seed),
        );
        if (res?.state.decided) return resolveStoryRound({ ...state, stopPlayed }, stopPlayed);
      }
      if (state.run.storyTournament && total === 18 && nextIdx === 9) {
        const t = tournamentForChapter(state.run.storyTournament, state.story?.alignment);
        if (t) {
          const pars = state.course.holes.map((h) => h.par);
          // GS-story-sigil-rivals: the pop speaks as the EFFECTIVE rival (the betrayal-arc friend on the
          // back-half Sigils), with their figure + voice context carried on the payload.
          const rival = tournamentRival(t, state.story);
          // GS-story-sigil-live: a MATCHPLAY Sigil's halftime reads the MATCH (holes won, from the same
          // resolver streams as the finish), never a stroke count the format doesn't score by.
          const m = sigilMatchThrough(t, state.story, stopPlayed.map((p) => p.record.strokes), String(state.run.seed), pars, {
            teamPlayed: state.run.storyTeamFormat === 'scramble',
            chosenAllyId: state.run.storyTournamentPartner,
          });
          // GS-story-midround-omen: BEFORE the rival pop, at the Chapter-3 major's turn (both partner picks
          // locked, path unchosen), divert ONCE to the pre-Choice betrayal foreshadow — the future betrayer's
          // first crack, keyed to why they're the odd one out. It flows into the pop on continue. A no-op on
          // every other tournament/chapter, so the classic halftime pop is unchanged.
          const pop = m
            ? {
                rivalId: rival.id,
                rivalName: rival.name,
                brag: m.res.holesUp < 0, // the rival's side leads the match → they brag
                playerThru: m.res.duels.filter((d) => d.winner === 'player').length,
                rivalThru: m.res.duels.filter((d) => d.winner === 'boss').length,
                match: { holesUp: m.res.holesUp, thru: m.res.thru, team: m.kind === 'team' },
                ...(rival.golferId ? { rivalGolferId: rival.golferId, rivalVoice: rival.voice, rivalCorrupted: rival.corrupted } : {}),
              }
            : (() => {
                const rivalThru = rivalTotalThrough(t, String(state.run.seed), pars, 9, rival);
                const playerThru = stopPlayed.reduce((s, p) => s + p.record.strokes, 0);
                return {
                  rivalId: rival.id,
                  rivalName: rival.name,
                  brag: rivalThru < playerThru, // rival ahead (fewer strokes) → they brag; else they curse you
                  playerThru,
                  rivalThru,
                  ...(rival.golferId ? { rivalGolferId: rival.golferId, rivalVoice: rival.voice, rivalCorrupted: rival.corrupted } : {}),
                };
              })();
          const omen = midroundOmen(state.story, state.run.storyTournament);
          const midBase = { ...state, stopPlayed, storyTournamentMidPop: pop };
          return omen
            ? { ...midBase, screen: 'storyMidBeat' as const, pendingMidBeat: omen }
            : { ...midBase, screen: 'storyTournamentPop' as const };
        }
      }
      // GS-story-caddy-quest-dialogue: at the TURN of an ally's QUEST round, pause once for the caddy's
      // mid-round beat (their `duringQuest` scene on the shared beat card). Quest-only (`storyRound` +
      // `storyQuest`, never a `storyTournament`/`match` — those branches returned above), a single
      // dismissible pause that flows straight into the next hole on continue, so it can't interrupt the
      // main story or flood the player. Interactive-only (the headless sim never runs `holeComplete`), so
      // auto ≡ interactive holds. Absent `duringQuest` ⇒ `questBeatFor` is undefined ⇒ no pause.
      if (state.run.storyQuest && nextIdx < total && nextIdx === questBeatTurnIndex(total)) {
        const beat = questBeatFor(state.run);
        if (beat) return { ...state, stopPlayed, screen: 'storyQuestBeat', pendingQuestBeat: beat };
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

    case 'backupExported': {
      // GS-backup-nudge: a backup file actually reached the player — stamp the run counter so the
      // nudge goes quiet until they have played on. Dispatched from the app layer on a CONFIRMED
      // success (a download that reported true, a clipboard write that resolved), never on the tap:
      // a nudge silenced by a failed export is worse than one that never fired.
      return { ...state, lastExportRun: state.clubhouseVisit };
    }

    case 'toTitle': {
      // Return to the title from any screen (GS-settings-nav) — the escape hatch the settings sheet
      // offers on screens with no nav of their own (character select, clubhouse, mid-run…). Never
      // destructive: a run that's actually underway (a golfer picked, still active) is parked in its
      // OWN mode/golfer slot — exactly what a page reload offers — so "back to title" can't lose a run.
      //
      // GS-save-slots: this used to re-derive the answer itself, and it got it wrong in a way
      // `persist` did not — it had no Story/Asgard check, so it overwrote the single resumable slot
      // with whatever was live and `persist` faithfully wrote that. `resumableState` is now the ONE
      // function both call, and the two can no longer disagree.
      if (state.screen === 'title') return state;
      const { runSlots, lastPlayed } = resumableState(state);
      // GS-story-round-resume: and the campaign's half of the same question, from the same function
      // `persistStory` calls. It has to land in STATE as well as on disk — the golfer picker reads
      // `state.campaigns`, so a round written to `fc_story` but not folded back here is a round the
      // Continue button cannot see. That gap, in the run-slot table, is exactly GS-resume-slot-loss.
      const story = campaignWithLiveRound(state);
      const campaigns = story ? upsertCampaign(state.campaigns, story) : state.campaigns;
      // Rebuild the placeholder run backing the title (same seed) so format previews start clean.
      const run = startRun(state.run.seed, undefined, state.metaUpgrades, undefined, 0, state.bagTier);
      return {
        ...state,
        story,
        campaigns,
        run,
        course: currentCourse(run),
        screen: 'title',
        runSlots,
        lastPlayed,
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
        // The back-button confirm (GS-android-back) is what usually dispatches this; clear it so the
        // card can never survive onto the title screen.
        pendingExit: undefined,
        // …and the same for the Story golfer/campaign picker's own state. `toTitle` is the ONE way off
        // that screen (its back button, hardware BACK, the settings sheet's escape hatch all land here),
        // and `pendingStoryNew` is what makes screen `character` render the clubhouse picker instead of
        // the ordinary roster. Left set, the next `start` would open Voyage's character select wearing
        // the Story clubhouse — and picking a golfer there creates a CAMPAIGN instead of starting the run.
        pendingStoryNew: false,
        storyInspectId: undefined,
        storyOverwriteId: undefined,
        // …and the star chart's mode (GS-startour-chart-mode). `toTitle` is the ONE exit every screen's
        // settings sheet lands on, so clearing it here is what stops a free-roam session claiming the
        // NEXT campaign's chart — and the campaign navigator is the default, so this is also the safe
        // side to leave it on.
        starTourFreeRoam: undefined,
        // …and the per-mode picker's own confirm, for the same reason: carried onto the title it
        // would let the NEXT mode's first `selectCharacter` overwrite a slot without asking.
        slotOverwriteId: undefined,
        viewHole: 0,
      };
    }

    case 'requestExit': {
      // GS-android-back: raise the "leave this round?" confirm. Only meaningful in a run — every other
      // screen resolves back to a plain navigation, so nothing else should ever reach this.
      if (state.screen !== 'playing' && state.screen !== 'intro') return state;
      return { ...state, pendingExit: true };
    }

    case 'cancelExit': {
      if (!state.pendingExit) return state;
      return { ...state, pendingExit: undefined };
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
          // GS-story-startour-unlock: the permanent Star Tour unlock is meta-progression — carry it over.
          starTourUnlocked: state.starTourUnlocked,
          // GS-save-slots: every parked run survives a restart — re-seeding to a new seed (the Daily)
          // must not bin the runs going in the other three modes.
          runSlots: state.runSlots,
          lastPlayed: state.lastPlayed,
        },
      );
    }
  }
}
