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
  bossEdgeForRun,
  buy,
  buyFuel,
  canTravel,
  canWarpStop,
  currentBoss,
  currentCourse,
  endlessAttackArmed,
  finishStop,
  holeGateArmed,
  playStop,
  playStopWarp,
  playerHoleOpts,
  resumeRun,
  routeOptions,
  canScanRoutes,
  scanRoutes,
  scrambleOptsFor,
  teamDuelSetupForRun,
  shardsForRun,
  shopOffer,
  snapshotRun,
  startRun,
  startAsgardRun,
  strand,
  travel,
  salvageFindFor,
  bossRewards,
  grantTalent,
  starmartOffer,
  starmartRerollCost,
  STARMART_COST,
  type BossReward,
  type Route,
  type Run,
  type RunSnapshot,
  type StopResult,
  type TeamDuelSetup,
} from '../sim/rpg/run';
import { endlessUnlocksCrossed, addEndlessRecord, type EndlessRunRecord } from '../sim/rpg/endless';
import type { SalvageFind } from '../sim/rpg/salvage';
import { archetypeFor } from '../sim/course/themes';
import { effectPatchKind } from '../sim/rpg/effects';
import { isMatchplayBoss, ASGARD_FORMAT } from '../sim/rpg/formats';
import { matchOpponentFor, runField } from '../sim/rpg/league';
import { warriorsThreeTotals, warriorsEdge } from '../sim/rpg/competition';
import {
  playMatchStop,
  playTeamMatchStop,
  playBossStop,
  playBossSideStop,
  betterPlayedHole,
  bossHasHomeEdge,
  holeDuel,
  matchState,
  type HoleDuel,
} from '../sim/rpg/match';
import { type MetaUpgrades } from '../sim/rpg/meta';
import { bagSet, bagTierRank, canBuyBagSet, DEFAULT_BAG_TIER, type BagTier } from '../sim/rpg/bag';
import { ascensionClubReward, type ClubUnlockReward } from '../sim/rpg/club-unlock';
import { canBuyShip, shipById, aceShipUnlock, DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import { apparelById, canBuyApparel } from '../sim/rpg/apparel';
import { getCharacter, characterShotMods } from '../sim/rpg/characters';
import { shopItem, ownedCount, itemCap, canBuy, namedCaddyOwned } from '../sim/rpg/economy';
import {
  adjustReputation,
  factionForCaddy,
  REP_ON_FIRE,
  REP_ON_HIRE,
  type ReputationByCharacter,
} from '../sim/rpg/factions';
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
  | 'clubhouse'
  | 'starmart'
  // GS-asgard: the Bifröst interlude — the Himinbjörg reveal map, then the win/lose result of the
  // nine-hole stroke-play tournament against the Warriors Three.
  | 'asgardMap'
  | 'asgardResult';

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
  /** The club a SALVAGE lane just looted on arrival (GS-salvage-mystery) — a TRANSIENT reveal (never
   *  persisted), computed from the PRE-travel loadout in the `route` action so the blind gamble pays off
   *  with a "you looted X" moment on the stop intro. `undefined` when the arriving lane wasn't salvage.
   *  Recomputed each jump; a page-reload resume simply shows no reveal (the club is still in the bag). */
  salvageReveal?: SalvageFind;
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
  /** Highest Ascension tier EACH golfer has personally cleared (+1), keyed by characterId
   *  (GS-ascension-clubs fix). Gates the per-character victory club unlock independently of the global
   *  `maxAscension`, so every golfer has its own unlock ladder (not just the first to clear a tier). */
  maxAscensionByCharacter: Record<string, number>;
  /** Lifetime holes-in-one made across every run (GS-ace) — a permanent, cross-run record. */
  lifetimeAces: number;
  /** The owned permanent default-bag tier (GS-bag-tiers) — the BEST bag you've unlocked, and the ceiling
   *  every per-golfer pick is clamped to. 'common' = the un-upgraded starter bag. */
  bagTier: BagTier;
  /** Per-golfer starting bag tier (GS-wardrobe-bagtier): characterId → BagTier, chosen in the Clubhouse
   *  wardrobe so each golfer can run its OWN Unending-Universe difficulty. Absent → the owned `bagTier`
   *  (the best unlocked bag). Always clamped to the owned tier — a weaker pick is the sterner test, never
   *  a free upgrade. The Voyage ignores it (its difficulty is Ascension) and always plays the owned tier. */
  bagTierByCharacter: Record<string, BagTier>;
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
  /** The cosmetic driver each character swings (GS-thor): characterId → apparel id ('driver' slot).
   *  Absent → the plain club head. Outfitted in the Clubhouse like the other slots. */
  driverByCharacter: Record<string, string>;
  /** The character whose Clubhouse (garage + wardrobe) is open for outfitting (transient — not saved). */
  manageCharacterId?: string;
  /** Matchplay duel state on a boss stop (GS-100): the opponent + their pre-played ball + the duel. */
  match?: MatchUi;
  /** A pending interactive SCRAMBLE shot (GS-team-duel) — or a fortune-teller MULLIGAN (GS-tent-
   *  interactions, `mulligan` flag) — awaiting the player's ball choice. */
  scrambleChoice?: ScrambleShot;
  /** A fortune-teller tent granted a free mulligan (GS-tent-interactions): the NEXT tee shot resolves
   *  two of the player's own balls and they keep the better line. Consumed on that tee shot. */
  mulliganPending?: boolean;
  /** A StarMart tent's pop-up shop (GS-tent-interactions): the item ids on offer (spend shards). Set
   *  when the shop opens mid-hole; cleared on leave. */
  starmartOffer?: string[];
  /** StarMart reroll count this visit (shard cost ramps). */
  starmartRerolls?: number;
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
  /** The Marmot Bartender clubhouse unlock (GS-tent-interactions) — persisted; set the first time a
   *  ball bonks the marmot trade-tent, after which a marmot tends the 19th-hole bar. */
  marmotBartender: boolean;
  /** Balls the Marmot pocketed in the CURRENT run (GS-tent-tips) — persisted; bumped on each marmot-tent
   *  bonk, reset when a new run begins. Drawn as golf balls in the clubhouse tip jar; when it fills the
   *  jar the Marmot is off playing the spaceport par-3 (bar + jar empty) until the next run. */
  marmotTips: number;
  /** Finished Unending-Universe runs (GS-golf-score), newest first — the personal last-runs
   *  leaderboard: holes reached + golf score + golfer, grouped by starting CLUB SET. Persisted. */
  endlessRuns: EndlessRunRecord[];
  /** Character-specific caddy-faction REPUTATION (GS-caddy-factions): characterId → factionId → rep.
   *  Persisted; moved by the shop when a caddy is hired (+1) or fired (−3). Deliberately HIDDEN — no
   *  screen reads it yet; it's groundwork for future faction perks/events. */
  reputation: ReputationByCharacter;
  /** A pending caddy SWAP awaiting confirmation (GS-caddy-factions): the player clicked a new caddy
   *  while one is already on the bag, so the shop shows a "they won't be happy to be fired" warning
   *  before the hire goes through. Transient (never persisted); cleared on confirm/cancel. */
  pendingFireCaddy?: { newId: string; oldId: string };
  /** The suspended real run (GS-asgard): when an eagle-or-better on Rainbow Road opens the Bifröst, the
   *  current run is snapshotted here while the Asgard tournament plays in `run`. Restored (perks edited)
   *  on the tournament's end. The Asgard run is never persisted, so a mid-tournament quit resumes THIS. */
  asgardReturn?: RunSnapshot;
  /** The finished Asgard tournament result (GS-asgard) — shown on the result splash. */
  asgardOutcome?: { won: boolean; playerTotal: number; par: number; field: { name: string; total: number }[] };
  /** A one-shot banner shown on the journey map after returning from Asgard (GS-asgard): the victory or
   *  the "better luck next time" note. Cleared when the player travels on. Transient. */
  asgardBanner?: 'won' | 'lost';
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
  | { type: 'selectCharacter'; characterId: string; ascension?: number; bagTier?: BagTier } // pick a golfer (+ their Ascension tier for a voyage / starting club set for the Unending Universe), then begin the run
  | { type: 'backToCharacter' } // GS-intro-split: from the stop intro, step back to re-pick the golfer
  | { type: 'resume' }
  | { type: 'play' } // auto-play the whole stop (watch)
  | { type: 'warpStop' } // GS-warp: fast-forward this stop under the hidden auto-birdie rule
  | { type: 'playInteractive' } // play shot-by-shot
  | { type: 'shot'; clubId: string; aim: AimMode; target?: [number, number]; power?: number }
  | { type: 'chooseScrambleBall'; pick: 'player' | 'partner' } // keep a ball in an interactive scramble (GS-team-duel)
  | { type: 'putt'; control?: PuttControl } // take one putt — with a pace-meter control = manual skill
  | { type: 'autoShotHole' } // AI-finish the current hole
  | { type: 'holeComplete' } // advance to next hole / score the stop
  | { type: 'continue' }
  | { type: 'crossBifrost' } // GS-asgard: cross the Bifröst from the Himinbjörg map into the Asgard tournament
  | { type: 'leaveAsgard' } // GS-asgard: leave the Golden Realm (win or lose) and resume the suspended run
  | { type: 'pickBossReward'; index: number } // claim a talent / permanent reward after beating a boss
  | { type: 'buy'; id: string; confirmFire?: boolean } // confirmFire: the caddy-swap warning was accepted (GS-caddy-factions)
  | { type: 'cancelFireCaddy' } // dismiss the caddy-swap "they won't be happy" warning without hiring (GS-caddy-factions)
  | { type: 'rerollShop' } // pay credits to redraw the outfitter's stock (GS-shop-reroll)
  | { type: 'leaveShop' }
  | { type: 'openStarmart' } // a StarMart tent's pop-up shop opens mid-hole (GS-tent-interactions)
  | { type: 'buyStarmart'; id: string } // buy a StarMart item with shards
  | { type: 'rerollStarmart' } // pay shards to redraw the StarMart rack
  | { type: 'leaveStarmart' } // close the StarMart and keep playing the hole
  | { type: 'route'; routeId: number }
  | { type: 'scanRoutes' } // burn fuel to redraw the three onward lanes (GS-fuel-4 sector scan)
  | { type: 'buyFuel'; units: number } // top the ship's tank up with credits (GS-fuel) — Pro Shop / journey depot
  | { type: 'strand' } // out of fuel AND credits with no payable lane (GS-fuel): the run ends stranded
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
  | { type: 'setCharacterBagTier'; tier: BagTier } // pick the managed golfer's Unending-Universe starting bag tier (GS-wardrobe-bagtier)
  | { type: 'toTitle' } // back to the title from anywhere (GS-settings-nav) — an underway run stays resumable
  | { type: 'restart'; seed?: number | string };

export interface MetaProgress {
  bestStableford?: number;
  bestDistance?: number;
  shards?: number;
  metaUpgrades?: MetaUpgrades;
  maxAscension?: number;
  maxAscensionByCharacter?: Record<string, number>;
  lifetimeAces?: number;
  ownedShips?: string[];
  ownedApparel?: string[];
  shipByCharacter?: Record<string, string>;
  hatByCharacter?: Record<string, string>;
  shirtByCharacter?: Record<string, string>;
  pantsByCharacter?: Record<string, string>;
  golfBagByCharacter?: Record<string, string>;
  driverByCharacter?: Record<string, string>;
  bagTier?: BagTier;
  bagTierByCharacter?: Record<string, BagTier>;
  unlockedClubsByCharacter?: Record<string, string[]>;
  clubhouseVisit?: number;
  endlessBestHoles?: number;
  marmotBartender?: boolean;
  marmotTips?: number;
  endlessRuns?: EndlessRunRecord[];
  reputationByCharacter?: ReputationByCharacter;
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

/** The cosmetic driver a character swings (GS-thor) — its Clubhouse pick if owned, else none. */
export function driverForCharacter(
  s: { driverByCharacter: Record<string, string>; ownedApparel: string[] },
  characterId: string | undefined,
): string | undefined {
  const pick = characterId ? s.driverByCharacter[characterId] : undefined;
  return pick && s.ownedApparel.includes(pick) ? pick : undefined;
}

/** The starting bag tier a character plays (GS-wardrobe-bagtier) — its Clubhouse wardrobe pick CLAMPED to
 *  the owned tier (never a free upgrade above what's unlocked), else the owned tier itself. This is the
 *  Unending-Universe difficulty axis, now per-golfer. */
export function bagTierForCharacter(
  s: { bagTierByCharacter: Record<string, BagTier>; bagTier: BagTier },
  characterId: string | undefined,
): BagTier {
  const pick = characterId ? s.bagTierByCharacter[characterId] : undefined;
  return pick && bagTierRank(pick) <= bagTierRank(s.bagTier) ? pick : s.bagTier;
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

/**
 * Fire a struck trade-tent's non-shot REACTION (GS-tent-interactions) after a shot resolves. The
 * SHOT itself (the ricochet, and the marmot's lost ball) is already resolved in the shared physics, so
 * auto ≡ interactive holds; these are the interactive-only META reactions, layered on like the ace /
 * unlock side-effects:
 *   • marmot   → the first-ever bonk unlocks the persistent Marmot Bartender (clubhouse cosmetic), and
 *                EVERY bonk drops a ball in its tip jar (GS-tent-tips) — a running total that ACCUMULATES
 *                across runs (the clubhouse renders the fill-to-a-half-dozen-then-cash-out cycle off it);
 *   • fortune  → grant a free mulligan for the NEXT tee shot;
 *   • starmart → opening the pop-up shop is deferred to AFTER the shot animation (app-layer `onDone`),
 *                so it isn't handled here.
 * `ow`/`watch` are pure flavour (the bubble + voice), so no state change. Reads the LAST shot only.
 */
function applyTentReactions(state: UiState, play: HolePlay): UiState {
  const effect = play.shots[play.shots.length - 1]?.tentHit?.effect;
  if (!effect) return state;
  // Every marmot bonk drops a ball in the tip jar (GS-tent-tips) — the first-ever bonk ALSO unlocks the
  // persistent Marmot Bartender. The count is a running total (never reset per run); the clubhouse draws
  // its fill-then-cash-out cycle off it, so the jar accumulates toward a half-dozen across runs.
  if (effect === 'marmot') return { ...state, marmotBartender: true, marmotTips: state.marmotTips + 1 };
  if (effect === 'fortune') return { ...state, mulliganPending: true };
  return state;
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
  // The club reward is PER CHARACTER (GS-ascension-clubs fix): a golfer earns a club when THEY clear an
  // Ascension tier they hadn't cleared before — tracked in `maxAscensionByCharacter`, independent of
  // which OTHER golfer first pushed the global `maxAscension`. Before this fix the gate was the global
  // `maxAscension > state.maxAscension`, so only the FIRST golfer to clear a tier ever got a club; every
  // later golfer clearing the same tier was silently denied. Now each golfer has its own unlock ladder;
  // re-clearing a tier THIS golfer already holds grants nothing (a missed cut / bank just banks shards).
  const charBest = (characterId && state.maxAscensionByCharacter[characterId]) || 0;
  const charCleared =
    run.endedReason === 'won' && characterId
      ? Math.min(ASCENSION_MAX, Math.max(charBest, run.ascension + 1))
      : charBest;
  const newCharClear = charCleared > charBest && !!characterId;
  const reward = newCharClear
    ? ascensionClubReward(characterId, state.bagTier, owned, `${run.seed}:${run.ascension}`)
    : undefined;
  const gotClub = reward?.kind === 'club' && !!characterId;
  const bonusShards = reward?.kind === 'shards' ? reward.shards : 0;
  // Bank the finished Unending-Universe run into the last-runs leaderboard (GS-golf-score): its holes
  // reached + golf-round gross/par + golfer + starting club set. Recorded once, here at the single
  // shared run-end site, so every end path (auto/interactive) logs it exactly once; a non-gate voyage
  // run adds nothing. A characterless placeholder never reaches this (runs only end after a stop).
  const endlessRuns =
    holeGateArmed(run) && characterId
      ? addEndlessRecord(state.endlessRuns, {
          characterId,
          tier: run.bagTier ?? 'common',
          holes: run.holesSurvived,
          gross: run.grossStrokes,
          par: run.parPlayed,
          ascension: run.ascension,
          seed: run.seed,
          // GS-warp: a warped run's board range starts at its first HAND-PLAYED hole ("50–67").
          startHole: run.warpedThrough > 0 ? run.warpedThrough + 1 : undefined,
        })
      : state.endlessRuns;
  return {
    shards: state.shards + earned + bonusShards,
    lastRunShards: earned,
    maxAscension,
    maxAscensionByCharacter: newCharClear
      ? { ...state.maxAscensionByCharacter, [characterId!]: charCleared }
      : state.maxAscensionByCharacter,
    unlockedClubsByCharacter: gotClub
      ? { ...state.unlockedClubsByCharacter, [characterId!]: [...owned, (reward as { clubType: string }).clubType] }
      : state.unlockedClubsByCharacter,
    lastClubUnlock: reward,
    endlessRuns,
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

/**
 * Ace-driven state deltas for a scored stop (GS-ace): the lifetime hole-in-one tally + the secret
 * Comet Rider ship unlock (GS-ace-ship, granted on ANY ace the player doesn't already own — so a
 * player who aced before this shipped still earns it on their next ace). `baseOwnedShips` is the
 * owned list AFTER any endless-milestone unlock at this same site, so the two ship grants compose
 * rather than clobber; spread this LAST at each scoring site. Pure.
 */
function aceUpdates(state: UiState, result: StopResult, baseOwnedShips: string[]): Partial<UiState> {
  const owned = aceShipUnlock(baseOwnedShips, result.aces);
  return {
    lifetimeAces: state.lifetimeAces + result.aces,
    ...(owned !== baseOwnedShips ? { ownedShips: owned } : {}),
  };
}

/** Boss-reward choices to offer after a stop, if it was a survived (non-final) boss win (GS-talents).
 *  Themed to the stop's zone. Undefined for an ordinary stop, a missed cut, or a run-winning final boss. */
function bossRewardFor(run: Run, course: UiState['course'], result: StopResult): BossReward[] | undefined {
  if (!result.passed || run.status !== 'active' || !currentBoss(run)) return undefined;
  return bossRewards(run, archetypeFor(course.meta?.themeId, course.biome));
}

/** The Thor's Hammer cosmetic id (GS-asgard) — the driver skin won by taking the Asgard tournament. */
const THOR_HAMMER_ID = 'thors-hammer';

/**
 * The Rainbow-Ball eagle trigger (GS-asgard): a survived, NON-Asgard, ordinary stop where the Rainbow
 * Ball is armed and the player made an EAGLE-OR-BETTER (a holed hole at ≥2 under — a hole-in-one,
 * albatross or eagle) opens the Bifröst to the Golden Realm. Reducer-only + gated on the Rainbow Ball,
 * so it adds no rng draws and the feature-off path is byte-for-byte unchanged.
 */
export function asgardPortalOpens(run: Run, played: PlayedHole[]): boolean {
  return (
    !!run.loadout.rainbowRoad &&
    run.formatId !== ASGARD_FORMAT &&
    played.some((p) => p.holed && p.record.strokes - p.record.par <= -2)
  );
}

/** Divert a survived ordinary stop to the Himinbjörg map when the Rainbow-Ball eagle trigger fires
 *  (GS-asgard); the current run is snapshotted for the post-tournament restore. A no-op otherwise. */
function withAsgardPortal(next: UiState, run: Run, played: PlayedHole[]): UiState {
  if (next.screen === 'result' && asgardPortalOpens(run, played)) {
    return { ...next, screen: 'asgardMap', asgardReturn: snapshotRun(run) };
  }
  return next;
}

/**
 * The Warriors Three's per-hole SHARPENING for THIS tournament (GS-asgard-scaling): scaled off how deep
 * into the journey (the parked real run's `stopIndex` — the "upgraded clubs" proxy) and at what Ascension
 * the Bifröst was reached, so a late-run encounter with an upgraded bag stays a contest. The suspended
 * run lives in `asgardReturn`; the fresh Asgard run resets `stopIndex` to 0, so read the depth from the
 * snapshot (its ascension is the same value the Asgard run carries). Zero at a shallow, base encounter. */
export function asgardFieldEdge(state: UiState): number {
  const src = state.asgardReturn;
  return warriorsEdge(src?.stopIndex ?? 0, src?.ascension ?? state.run.ascension);
}

/**
 * Resolve the Asgard STROKE-PLAY tournament (GS-asgard): the player's real nine-hole gross against the
 * Warriors Three's deterministic ghost totals. Lowest total wins, ties to the player (a hard-won reward
 * event). A win banks the Thor's Hammer cosmetic here; the Odin's Favour perk + the Rainbow-Ball removal
 * land on the resumed run at `leaveAsgard`. Win OR lose, the player is handed back to their journey.
 */
function resolveAsgard(state: UiState, played: PlayedHole[]): UiState {
  const pars = state.course.holes.map((h) => h.par);
  const playerTotal = played.reduce((s, p) => s + p.record.strokes, 0);
  const field = warriorsThreeTotals(`${state.run.seed}`, pars, asgardFieldEdge(state));
  const won = playerTotal <= Math.min(...field.map((f) => f.total));
  const ownedApparel =
    won && !state.ownedApparel.includes(THOR_HAMMER_ID) ? [...state.ownedApparel, THOR_HAMMER_ID] : state.ownedApparel;
  return {
    ...state,
    played,
    stopPlayed: undefined,
    play: undefined,
    holeRng: undefined,
    match: undefined,
    viewHole: 0,
    screen: 'asgardResult',
    ownedApparel,
    asgardOutcome: { won, playerTotal, par: pars.reduce((a, b) => a + b, 0), field },
  };
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
      // The Marmot's tip jar ACCUMULATES across runs (GS-tent-tips) — a new run does NOT empty it, so it
      // fills toward a half-dozen over successive marmot bonks. The clubhouse renders the fill-then-cash-out
      // cycle off this running total (`marmotTips % (CAP + 1)`), so the reducer just keeps counting.
      return { ...state, run, course: currentCourse(run), screen: 'intro', bagTierByCharacter };
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
      // The Asgard tournament (GS-asgard) is scored on total gross vs the Warriors Three, not the cut —
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
      while (!p.done && guard++ < 40) {
        p = awaitingPutt(p)
          ? takePutt(p, state.run.loadout, state.holeRng)
          : takeShot(p, autoDecision(p, state.run.loadout, attack), state.run.loadout, state.holeRng, true, scramble, tents, scorch, patch);
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
      // cumulative total (exactly as the headless `playStop` does), so auto ≡ interactive holds.
      if (nextIdx < total) {
        return { ...state, stopPlayed, play: beginHole(state.course.holes[nextIdx]!, nextIdx) };
      }
      // The Asgard tournament (GS-asgard) is decided on total gross vs the Warriors Three — resolve it
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
      if (state.screen !== 'asgardResult' || !state.asgardReturn) return state;
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
      return {
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
      };
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
      // Market ("try it on") so a shopper can jump to outfitting without a title round-trip.
      if (state.screen !== 'title' && state.screen !== 'gameover' && state.screen !== 'trademarket') return state;
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
        },
        state.resumable,
      );
    }
  }
}
