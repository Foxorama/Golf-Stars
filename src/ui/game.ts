/**
 * UI screen-flow reducer — a PURE state machine over the (already pure) run API. Holds no
 * DOM and no time, so the whole interactive flow is unit-tested. `main.ts` renders the
 * returned `UiState` and dispatches `Action`s on clicks; save persistence is a side-effect
 * there, not here.
 *
 * Flow: intro → play → result → shop → travel → (next) intro … until a missed cut → gameover.
 */

import type { Course } from '../sim/course/contract';
import type { PlayedHole, PuttControl } from '../sim/round';
import {
  ASCENSION_MAX,
  bank,
  buy,
  currentBoss,
  currentCourse,
  endlessHolePassed,
  finishStop,
  holeGateArmed,
  playStop,
  playerHoleOpts,
  resumeRun,
  routeOptions,
  scrambleOptsFor,
  teamDuelSetupForRun,
  shardsForRun,
  shopOffer,
  snapshotRun,
  startRun,
  travel,
  bossRewards,
  grantTalent,
  type BossReward,
  type Route,
  type Run,
  type RunSnapshot,
  type StopResult,
  type TeamDuelSetup,
} from '../sim/rpg/run';
import { endlessUnlocksCrossed } from '../sim/rpg/endless';
import { archetypeFor } from '../sim/course/themes';
import { effectPatchKind } from '../sim/rpg/effects';
import { isMatchplayBoss } from '../sim/rpg/formats';
import { matchOpponentFor, runField } from '../sim/rpg/league';
import {
  playMatchStop,
  playTeamMatchStop,
  playBossStop,
  playBossSideStop,
  betterPlayedHole,
  holeDuel,
  matchState,
  type HoleDuel,
} from '../sim/rpg/match';
import { type MetaUpgrades } from '../sim/rpg/meta';
import { bagSet, canBuyBagSet, DEFAULT_BAG_TIER, type BagTier } from '../sim/rpg/bag';
import { ascensionClubReward, type ClubUnlockReward } from '../sim/rpg/club-unlock';
import { canBuyShip, shipById, DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import { apparelById, canBuyApparel } from '../sim/rpg/apparel';
import { getCharacter } from '../sim/rpg/characters';
import { playHole } from '../sim/round';
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
  type AimMode,
  type HolePlay,
  type ScrambleShot,
} from '../sim/rpg/play';
import { Rng } from '../sim/rng';

export type Screen =
  | 'title'
  | 'character'
  | 'intro'
  | 'playing'
  | 'result'
  | 'bossReward'
  | 'shop'
  | 'travel'
  | 'gameover'
  | 'trademarket'
  | 'clubhouseHall'
  | 'clubhouse';

export interface UiState {
  run: Run;
  screen: Screen;
  /** The current stop's course. */
  course: Course;
  /** Played holes from the last `play` (for the scorecard + animation). */
  played?: PlayedHole[];
  lastResult?: StopResult;
  /** Onward routes, populated on the travel screen. */
  routes?: Route[];
  /**
   * The outfitter's stock for this stop (item ids), fixed on entry so buying doesn't
   * reshuffle the cards. Live cost/stack state is recomputed from `run` at render time.
   */
  shopOffer?: string[];
  /** How many times the current shop's stock has been rerolled (GS-shop-reroll) — drives the salt + cost. */
  shopRerolls?: number;
  /** Which hole the play view is showing (0-based). */
  viewHole: number;
  /** A saved in-progress run that the title screen can resume, if any. */
  resumable?: RunSnapshot;
  // --- interactive shot-by-shot play (the 'playing' screen) ---
  /** Current hole being played interactively. */
  play?: HolePlay;
  /** Deterministic RNG for the current stop (mutated as shots resolve). */
  holeRng?: Rng;
  /** Holes completed so far this stop. */
  stopPlayed?: PlayedHole[];
  // Meta-progression (persisted across runs).
  bestStableford: number;
  bestDistance: number;
  /** Persistent currency spent at the Outpost on permanent upgrades (GS-12). */
  shards: number;
  /** Owned permanent upgrade levels (id → level). */
  metaUpgrades: MetaUpgrades;
  /** Shards earned by the run that just ended — shown on the gameover screen. */
  lastRunShards?: number;
  /** Highest Ascension tier unlocked (GS-ascension) — selectable on the title for a voyage. */
  maxAscension: number;
  /** Lifetime holes-in-one made across every run (GS-ace) — a permanent, cross-run record. */
  lifetimeAces: number;
  /** The owned permanent default-bag tier (GS-bag-tiers) — baked into every new run's starting bag.
   *  'common' = the un-upgraded starter bag. */
  bagTier: BagTier;
  /** Owned cosmetic ships (GS-garage) — always includes the default Woody Wagon. Global ownership. */
  ownedShips: string[];
  /** Owned cosmetic apparel ids (GS-cosmetics) — hats + shirts bought at the Trade Market. Global. */
  ownedApparel: string[];
  /** The ship each character flies on the journey map (GS-clubhouse): characterId → ship id. Absent →
   *  the default Woody Wagon. Outfitted per golfer in the Clubhouse. */
  shipByCharacter: Record<string, string>;
  /** The hat / shirt / pants each character wears (characterId → apparel id). Absent → default look. */
  hatByCharacter: Record<string, string>;
  shirtByCharacter: Record<string, string>;
  pantsByCharacter: Record<string, string>;
  /** The cosmetic golf bag each character carries (GS-unending): characterId → apparel id ('bag'
   *  slot). Absent → no bag on the stage. Outfitted in the Clubhouse like the other slots. */
  golfBagByCharacter: Record<string, string>;
  /** The character whose Clubhouse (garage + wardrobe) is open for outfitting (transient — not saved). */
  manageCharacterId?: string;
  /** Matchplay duel state on a boss stop (GS-100): the opponent + their pre-played ball + the duel. */
  match?: MatchUi;
  /** A pending interactive SCRAMBLE shot (GS-team-duel) awaiting the player's ball choice. */
  scrambleChoice?: ScrambleShot;
  /** Boss-reward choices to pick from after beating a boss (GS-talents) — shown on the bossReward screen. */
  bossReward?: BossReward[];
  /** Per-character ascension-victory club unlocks (GS-ascension-clubs): each golfer's permanently-unlocked
   *  extra starting clubs (characterId → club type ids), grown one per voyage win with that golfer. */
  unlockedClubsByCharacter: Record<string, string[]>;
  /** The ascension-victory reward from the run that just WON (GS-ascension-clubs) — a newly-unlocked club
   *  (or a Shard consolation if the character's bag was already full). Shown on the victory screen. */
  lastClubUnlock?: ClubUnlockReward;
  /** Finished-run counter (GS-clubhouse-lounge) — bumped once per run end; seeds where the golfers stand
   *  in the Clubhouse lounge, so they appear to have milled around while you were away. Cosmetic only. */
  clubhouseVisit: number;
  /** Most holes ever survived in one Unending-Universe run (GS-unending) — persisted; the key the
   *  Evergreen cosmetic unlocks + the title-card progress read. */
  endlessBestHoles: number;
}

/** The matchplay duel a boss stop is played as (GS-100), incl. team duels (GS-team-duel). */
export interface MatchUi {
  /** The opponent golfer id (the leaderboard leader). */
  bossId: string;
  /** The boss's (team-scored) ball on each hole of the stop (pre-computed; revealed hole by hole). */
  bossHoles: PlayedHole[];
  /** Hole-by-hole duel results so far. */
  duels: HoleDuel[];
  /** Holes up from the player's view (+ player, − boss). */
  holesUp: number;
  /** Match mathematically decided (up by more than remain). */
  decided: boolean;
  /** Match over (decided early or all holes played). */
  finished: boolean;
  /** Team-duel setup (GS-team-duel): format, which side has the partner, partner ids. Absent ⇒ solo duel. */
  setup?: TeamDuelSetup;
  /** The player's partner's parallel ball per completed hole (best-ball only) — for "which counted" display. */
  partnerHoles?: PlayedHole[];
}

export type Action =
  | { type: 'start'; format: string; ascension?: number }
  | { type: 'selectCharacter'; characterId: string; ascension?: number } // pick a golfer (+ their Ascension tier for a voyage), then begin the run
  | { type: 'resume' }
  | { type: 'play' } // auto-play the whole stop (watch)
  | { type: 'playInteractive' } // play shot-by-shot
  | { type: 'shot'; clubId: string; aim: AimMode; target?: [number, number]; power?: number }
  | { type: 'chooseScrambleBall'; pick: 'player' | 'partner' } // keep a ball in an interactive scramble (GS-team-duel)
  | { type: 'putt'; control?: PuttControl } // take one putt — with a pace-meter control = manual skill
  | { type: 'autoShotHole' } // AI-finish the current hole
  | { type: 'holeComplete' } // advance to next hole / score the stop
  | { type: 'continue' }
  | { type: 'pickBossReward'; index: number } // claim a talent / permanent reward after beating a boss
  | { type: 'buy'; id: string }
  | { type: 'rerollShop' } // pay credits to redraw the outfitter's stock (GS-shop-reroll)
  | { type: 'leaveShop' }
  | { type: 'route'; routeId: number }
  | { type: 'bank' } // cash out the run (push-your-luck): bank credits→shards, end the run
  | { type: 'viewHole'; hole: number }
  | { type: 'openMarket' } // visit the between-run Trade Market (buy ships/apparel/bags) (GS-clubhouse)
  | { type: 'closeMarket' } // back to the title from the Trade Market
  | { type: 'openClubhouseHall' } // enter the Clubhouse — the hall of all four golfers (GS-clubhouse)
  | { type: 'closeClubhouseHall' } // back to the title from the Clubhouse hall
  | { type: 'openClubhouse'; characterId: string } // outfit one character's garage + wardrobe (GS-clubhouse)
  | { type: 'closeClubhouse' } // back to the title from the Clubhouse
  | { type: 'clubhouseBackToHall' } // back to the hall (pick another golfer) from one golfer's Clubhouse
  | { type: 'buyShip'; id: string } // buy a cosmetic ship with shards (global ownership) (GS-garage)
  | { type: 'selectShip'; id: string } // fly a different owned ship on the managed character (Clubhouse)
  | { type: 'buyApparel'; id: string } // buy a cosmetic hat/shirt/pants with shards (global ownership) (GS-cosmetics)
  | { type: 'equipApparel'; id: string } // wear an owned hat/shirt/pants on the managed character (toggles off)
  | { type: 'buyBagTier'; tier: BagTier } // buy a permanent default-bag upgrade with shards (GS-bag-tiers)
  | { type: 'toTitle' } // back to the title from anywhere (GS-settings-nav) — an underway run stays resumable
  | { type: 'restart'; seed?: number | string };

export interface MetaProgress {
  bestStableford?: number;
  bestDistance?: number;
  shards?: number;
  metaUpgrades?: MetaUpgrades;
  maxAscension?: number;
  lifetimeAces?: number;
  ownedShips?: string[];
  ownedApparel?: string[];
  shipByCharacter?: Record<string, string>;
  hatByCharacter?: Record<string, string>;
  shirtByCharacter?: Record<string, string>;
  pantsByCharacter?: Record<string, string>;
  golfBagByCharacter?: Record<string, string>;
  bagTier?: BagTier;
  unlockedClubsByCharacter?: Record<string, string[]>;
  clubhouseVisit?: number;
  endlessBestHoles?: number;
}

/** The ship a character flies (GS-clubhouse) — its Clubhouse pick if owned, else the default wagon. */
export function shipForCharacter(
  s: { shipByCharacter: Record<string, string>; ownedShips: string[] },
  characterId: string | undefined,
): string {
  const pick = characterId ? s.shipByCharacter[characterId] : undefined;
  return pick && s.ownedShips.includes(pick) ? pick : DEFAULT_SHIP_ID;
}

/** The hat a character wears (GS-clubhouse) — its Clubhouse pick if owned, else undefined (default look). */
export function hatForCharacter(
  s: { hatByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.hatByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The shirt a character wears (GS-clubhouse) — its Clubhouse pick if owned, else undefined. */
export function shirtForCharacter(
  s: { shirtByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.shirtByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The pants a character wears (GS-pants-outfit) — its Clubhouse pick if owned, else undefined. */
export function pantsForCharacter(
  s: { pantsByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.pantsByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The cosmetic golf bag a character carries (GS-unending) — its Clubhouse pick if owned, else none. */
export function golfBagForCharacter(
  s: { golfBagByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.golfBagByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

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
    bestStableford: meta.bestStableford ?? 0,
    bestDistance: meta.bestDistance ?? 0,
    shards: meta.shards ?? 0,
    metaUpgrades,
    maxAscension: meta.maxAscension ?? 0,
    lifetimeAces: meta.lifetimeAces ?? 0,
    bagTier,
    ownedShips: meta.ownedShips && meta.ownedShips.length ? meta.ownedShips : [DEFAULT_SHIP_ID],
    ownedApparel: meta.ownedApparel ?? [],
    shipByCharacter: meta.shipByCharacter ?? {},
    hatByCharacter: meta.hatByCharacter ?? {},
    shirtByCharacter: meta.shirtByCharacter ?? {},
    pantsByCharacter: meta.pantsByCharacter ?? {},
    golfBagByCharacter: meta.golfBagByCharacter ?? {},
    unlockedClubsByCharacter: meta.unlockedClubsByCharacter ?? {},
    clubhouseVisit: meta.clubhouseVisit ?? 0,
    endlessBestHoles: meta.endlessBestHoles ?? 0,
  };
}

/** The credit cost of the NEXT shop reroll (GS-shop-reroll) — base 30, ×1.6 per reroll this stop. */
export const REROLL_BASE_COST = 30;
export function rerollCost(rerolls: number): number {
  return Math.round(REROLL_BASE_COST * Math.pow(1.6, Math.max(0, rerolls)));
}

/** The matchplay opponent for a boss stop (GS-100): the leaderboard leader, or — if the arc has no
 *  scores yet (a fresh resume) — the field's top-rated non-player as a deterministic fallback. */
function resolveBossId(run: Run): string {
  return matchOpponentFor(run) ?? runField(run).golfers.find((g) => !g.isPlayer)?.id ?? '';
}

/**
 * Best-ball partner resolution (GS-team-duel): the moment the PLAYER's ball is holed out, the
 * partner's parallel ball plays on the SAME `:play` rng — so the end-of-hole screen can reveal both
 * cards side by side (the kept one highlighted) instead of the partner's score materialising
 * invisibly at `holeComplete`. The rng ORDER is unchanged from the auto sim (`bestBallHole`: the
 * player's full hole, then the partner's whole hole after it) — only the action the partner's draws
 * land in moved earlier. No-op on solo/scramble duels and on an already-resolved hole, so every
 * other path's stream is byte-for-byte untouched.
 */
function withBestBallPartner(state: UiState, play: HolePlay): { play: HolePlay; match?: MatchUi } {
  const setup = state.match?.setup;
  if (
    !play.done ||
    !state.match ||
    !state.holeRng ||
    setup?.partnerSide !== 'player' ||
    setup.format !== 'bestball' ||
    (state.match.partnerHoles ?? []).length !== play.holeIndex
  ) {
    return { play, match: state.match };
  }
  const partnerHole = playHole(state.course.holes[play.holeIndex]!, state.holeRng, {
    ...playerHoleOpts(state.run),
    shotMods: setup.playerPartnerMods,
  });
  return {
    play,
    match: { ...state.match, partnerHoles: [...(state.match.partnerHoles ?? []), partnerHole] },
  };
}

/** Winning at your current top Ascension tier unlocks the next (GS-ascension), capped at the max. */
function unlockedAscension(state: UiState, run: Run): number {
  if (run.endedReason !== 'won') return state.maxAscension;
  return Math.min(ASCENSION_MAX, Math.max(state.maxAscension, run.ascension + 1));
}

/**
 * The meta-progression deltas every run-end site shares (GS-12 / GS-ascension / GS-ascension-clubs):
 * banked shards, the Trade-Market reseed, the Ascension tier unlock, and — on a NEW Ascension clear —
 * the character's ascension-victory club unlock (or a Shard consolation if their bag is already full).
 * One source of truth so all four end sites (auto/interactive × ordinary/matchplay) reward a win
 * identically. Returns the unchanged fields while the run is still active (a survived non-final stop).
 * Exported so tests can assert the win reward directly (a natural voyage win is too rare to drive in a
 * unit test).
 */
export function runEndUpdates(state: UiState, run: Run): Partial<UiState> {
  if (run.status === 'active') {
    return { lastRunShards: undefined, lastClubUnlock: undefined };
  }
  const earned = shardsForRun(run);
  const maxAscension = unlockedAscension(state, run);
  const characterId = run.loadout.characterId;
  const owned = (characterId && state.unlockedClubsByCharacter[characterId]) || [];
  // The club reward fires only on a NEW Ascension clear — a won voyage that pushes maxAscension higher
  // (the same gate the bag tiers use), NOT every win. Re-clearing a tier you already hold grants nothing;
  // a missed cut / bank just banks shards.
  const reward =
    maxAscension > state.maxAscension
      ? ascensionClubReward(characterId, state.bagTier, owned, `${run.seed}:${run.ascension}`)
      : undefined;
  const gotClub = reward?.kind === 'club' && !!characterId;
  const bonusShards = reward?.kind === 'shards' ? reward.shards : 0;
  return {
    shards: state.shards + earned + bonusShards,
    lastRunShards: earned,
    maxAscension,
    unlockedClubsByCharacter: gotClub
      ? { ...state.unlockedClubsByCharacter, [characterId!]: [...owned, (reward as { clubType: string }).clubType] }
      : state.unlockedClubsByCharacter,
    lastClubUnlock: reward,
    // A finished run bumps the lounge counter so the golfers have shuffled around by the time you're home.
    clubhouseVisit: state.clubhouseVisit + 1,
  };
}

/**
 * Unending-Universe progression (GS-unending): applied at EVERY stop-scoring site (not just run end,
 * since milestones cross mid-run while the run survives). Lifts the persisted lifetime-best hole count
 * and grants any newly-crossed cosmetic unlock into the owned pools — the same ownership arrays the
 * Trade Market/Clubhouse already read, so an earned Evergreen piece equips exactly like a bought one.
 * Pure function of the counters; the milestone SHARD bonus is banked by the sim (`finishStop` →
 * `run.bonusShards`), not here. A no-op ({}) for non-gate formats or a non-record run.
 */
export function endlessProgressUpdates(state: UiState, run: Run): Partial<UiState> {
  const holes = run.holesSurvived ?? 0;
  if (!holeGateArmed(run) || holes <= state.endlessBestHoles) return {};
  let ownedApparel = state.ownedApparel;
  let ownedShips = state.ownedShips;
  for (const u of endlessUnlocksCrossed(state.endlessBestHoles, holes)) {
    if (u.kind === 'apparel' && !ownedApparel.includes(u.id)) ownedApparel = [...ownedApparel, u.id];
    if (u.kind === 'ship' && !ownedShips.includes(u.id)) ownedShips = [...ownedShips, u.id];
  }
  return { endlessBestHoles: holes, ownedApparel, ownedShips };
}

/** Boss-reward choices to offer after a stop, if it was a survived (non-final) boss win (GS-talents).
 *  Themed to the stop's zone. Undefined for an ordinary stop, a missed cut, or a run-winning final boss. */
function bossRewardFor(run: Run, course: UiState['course'], result: StopResult): BossReward[] | undefined {
  if (!result.passed || run.status !== 'active' || !currentBoss(run)) return undefined;
  return bossRewards(run, archetypeFor(course.meta?.themeId, course.biome));
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
      // Rebuild the run with the golfer's loadout/shape baked in, keeping the format + bag tier
      // chosen at 'start'. Ascension (GS-ascension) is a per-run difficulty picked HERE, alongside
      // the golfer (GS-title-2) — it's a choice about who you're playing, so it lives on the same
      // screen; absent (endless formats / no tiers unlocked) the 'start' value carries. Clamped to
      // what's unlocked. The golfer's permanently-unlocked clubs (GS-ascension-clubs) grow their
      // starting bag.
      const asc = Math.max(0, Math.min(state.maxAscension, action.ascension ?? state.run.ascension));
      const run = startRun(
        state.run.seed,
        state.run.formatId,
        state.metaUpgrades,
        action.characterId,
        asc,
        state.bagTier,
        state.unlockedClubsByCharacter[action.characterId] ?? [],
      );
      return { ...state, run, course: currentCourse(run), screen: 'intro' };
    }

    case 'resume': {
      if (state.screen !== 'title' || !state.resumable) return state;
      const run = resumeRun(state.resumable);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        resumable: undefined,
        viewHole: 0,
      };
    }

    case 'play': {
      if (state.screen !== 'intro' || state.run.status !== 'active') return state;
      // Matchplay boss stop (GS-100): play the duel (player ball + boss ball), pass on the match.
      // A TEAM duel (GS-team-duel) plays each side as solo/scramble/best-ball per the rank-based setup.
      if (isMatchplayBoss(currentBoss(state.run))) {
        const setup = teamDuelSetupForRun(state.run);
        const bossId = setup?.opponentId ?? resolveBossId(state.run);
        const homeEdge = setup?.homeEdge ?? false;
        const stop = setup
          ? playTeamMatchStop(
              state.course.holes,
              playerHoleOpts(state.run),
              bossId,
              setup,
              new Rng(`${state.course.seed}:play`),
              new Rng(`${state.course.seed}:boss`),
              homeEdge,
            )
          : playMatchStop(
              state.course.holes,
              playerHoleOpts(state.run),
              bossId,
              new Rng(`${state.course.seed}:play`),
              new Rng(`${state.course.seed}:boss`),
            );
        const { run, result } = finishStop(state.run, state.course, stop.player, { matchWon: stop.state.playerAdvances });
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
          lifetimeAces: state.lifetimeAces + result.aces,
          bossReward: bossRewardFor(run, state.course, result),
          ...runEndUpdates(state, run),
        };
      }
      const { run, result, played } = playStop(state.run);
      // A run ends on a missed cut OR a won voyage (final boss cleared) — both bank shards and go to
      // the gameover/victory screen; a survived non-final stop goes to the result screen.
      const ended = run.status !== 'active';
      return {
        ...state,
        run,
        played,
        lastResult: result,
        match: undefined,
        viewHole: 0,
        screen: ended ? 'gameover' : 'result',
        bestStableford: Math.max(state.bestStableford, result.stableford),
        bestDistance: Math.max(state.bestDistance, run.distanceFromStart),
        lifetimeAces: state.lifetimeAces + result.aces,
        bossReward: bossRewardFor(run, state.course, result),
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
        const bossHoles = setup
          ? playBossSideStop(state.course.holes, bossId, setup, new Rng(`${state.course.seed}:boss`), setup.homeEdge, state.run.loadout.rainbowRoad, bossTents, bossScorch, bossPatch)
          : playBossStop(state.course.holes, bossId, new Rng(`${state.course.seed}:boss`), false, state.run.loadout.rainbowRoad, bossTents, bossScorch, bossPatch);
        match = { bossId, bossHoles, duels: [], holesUp: 0, decided: false, finished: false, setup, partnerHoles: setup ? [] : undefined };
      }
      return {
        ...state,
        screen: 'playing',
        holeRng: new Rng(`${state.course.seed}:play`),
        stopPlayed: [],
        play: beginHole(state.course.holes[0]!, 0),
        match,
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
      return { ...state, ...withBestBallPartner(state, play) };
    }

    case 'chooseScrambleBall': {
      if (state.screen !== 'playing' || !state.scrambleChoice || !state.holeRng) return state;
      const auto = !!state.run.loadout.autoPutt;
      const play = commitScrambleBall(state.scrambleChoice, action.pick, state.run.loadout, state.holeRng, auto);
      return { ...state, play, scrambleChoice: undefined };
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
      while (!p.done && guard++ < 40) {
        p = awaitingPutt(p)
          ? takePutt(p, state.run.loadout, state.holeRng)
          : takeShot(p, autoDecision(p, state.run.loadout), state.run.loadout, state.holeRng, true, scramble, tents, scorch, patch);
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
          lifetimeAces: state.lifetimeAces + result.aces,
          bossReward: bossRewardFor(run, state.course, result),
          ...runEndUpdates(state, run),
        };
      }

      // The Unending Universe's survival bar (GS-unending): a hole that misses its required score
      // ends the stop RIGHT HERE — score the partial stop exactly as the headless `playStop` does
      // (it breaks its hole loop at the same failure), so auto ≡ interactive holds.
      const gateFailed = holeGateArmed(state.run) && !endlessHolePassed(state.run, idx, teamHole);
      if (nextIdx < total && !gateFailed) {
        return { ...state, stopPlayed, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
      }
      // Stop complete (or survival bar missed) — score it exactly as the auto path does.
      const { run, result } = finishStop(state.run, state.course, stopPlayed);
      const ended = run.status !== 'active';
      return {
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
        lifetimeAces: state.lifetimeAces + result.aces,
        bossReward: bossRewardFor(run, state.course, result),
        ...endlessProgressUpdates(state, run),
        ...runEndUpdates(state, run),
      };
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
      return { ...state, run: buy(state.run, action.id) };
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
      return { ...state, screen: 'travel', routes: routeOptions(state.run), shopOffer: undefined };
    }

    case 'route': {
      if (state.screen !== 'travel') return state;
      const route = (state.routes ?? []).find((r) => r.id === action.routeId);
      if (!route) return state;
      const run = travel(state.run, route);
      return {
        ...state,
        run,
        course: currentCourse(run),
        screen: 'intro',
        played: undefined,
        lastResult: undefined,
        routes: undefined,
        match: undefined,
        bossReward: undefined,
        viewHole: 0,
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
      // garage + wardrobe. Reachable between runs (title / game over), like the Trade Market.
      if (state.screen !== 'title' && state.screen !== 'gameover') return state;
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
              : 'pantsByCharacter';
      const current = state[map][cid];
      const next = { ...state[map] };
      if (current === action.id) delete next[cid];
      else next[cid] = action.id;
      return { ...state, [map]: next };
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
          ? snapshotRun(state.run)
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
          lifetimeAces: state.lifetimeAces,
          ownedShips: state.ownedShips,
          ownedApparel: state.ownedApparel,
          shipByCharacter: state.shipByCharacter,
          hatByCharacter: state.hatByCharacter,
          shirtByCharacter: state.shirtByCharacter,
          pantsByCharacter: state.pantsByCharacter,
          golfBagByCharacter: state.golfBagByCharacter,
          bagTier: state.bagTier,
          unlockedClubsByCharacter: state.unlockedClubsByCharacter,
          clubhouseVisit: state.clubhouseVisit,
          endlessBestHoles: state.endlessBestHoles,
        },
        state.resumable,
      );
    }
  }
}
