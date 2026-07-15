/**
 * Run state machine — the roguelike spine (GS-2).
 *
 * travel → arrive at a rarity-graded course → play it for credits → spend on loadout
 * upgrades → travel further as wildness/cut-line scale up, until you miss a cut and the
 * run ends. Pure, deterministic, headless: a seed plays the same run every time, so a
 * whole run is simulated and asserted in tests.
 *
 * State transitions: startRun → [playStop → (buy*) → travel]* until status 'ended'.
 */

import { Rng } from '../rng';
import { playCourse, playHole, type PlayedHole, type PlayHoleOptions, type ScrambleOpts } from '../round';
import { playTotals } from '../score';
import type { Course, Rarity } from '../course/contract';
import {
  aceCount,
  eagleCount,
  aceCreditBonus,
  clubItem,
  creditsForStop,
  cutLine,
  grantAceTalent,
  loadoutFromPerks,
  netDispersion,
  puttSkillOf,
  relicCreditBonus,
  shopItem,
  talentsForArchetype,
  type PlayerLoadout,
  type ShopItem,
} from './economy';
import { ASGARD_FORMAT, DEFAULT_FORMAT, bossAt, getFormat, isFinalStop, isMatchplayBoss, isTeamDuelBoss, resolveTeamFormat, startingFuelFor, stopSpecFor, type BossSpec } from './formats';
import { endlessMilestoneShards, endlessSetGateOverPar, endlessSetToPar, passesEndlessSet, warpBirdieHole } from './endless';
import { playMatchStop, playTeamMatchStop, bossHasHomeEdge, type BossEdge, type TeamSetup, type TeamFormat } from './match';
import { metaStartingCredits, type MetaUpgrades } from './meta';
import { DEFAULT_BAG_TIER, type BagTier } from './bag';
import { characterShotMods, scramblePartnerId, bossPartnerId } from './characters';
import { DEFAULT_EVENT, drawArcRouteEvents, eventPool, type RouteEvent } from './events';
import { effectPatchKind, routeClubFind, routeEffect } from './effects';
import { salvageClubFind, type SalvageFind } from './salvage';
import { ASGARD_THEME, arcForDistance, archetypeFor, type BiomeArchetype, type Theme } from '../course/themes';
import { buildField, buildVoyageField, arcCut, arcIndexOf, arcSurvivorTarget, bossOpponentFor, voyageFieldEase, type ArcStopSlice, type Field, type PlayerInfo } from './competition';

// --- Extracted sibling modules (GS-refactor-split) ---------------------------
// run.ts is the barrel: the reducer spine stays here; these siblings hold cohesive sections split
// out of this file (loadout / course / fuel / shop / serialise). The pieces the spine uses are
// imported here; the full public surface of each is re-exported below, so 'sim/rpg/run' stays the
// single import path (every existing importer is unchanged). Each sibling imports only TYPES back
// from run.ts (erased at compile), so there is no runtime import cycle.
import { startingLoadoutFor, baseLoadoutForRun, ASCENSION_MAX, ascensionCutBonus, ascensionCreditPenalty } from './runLoadout';
import { currentCourse, currentTheme, routeTheme } from './runCourse';
import { tankCapacity, routeFuelCost, travelRefuelCost, canTravel, strand } from './runFuel';
import { buy } from './runShop';

export {
  startingLoadoutFor,
  baseLoadoutForRun,
  ASCENSION_MAX,
  ascensionCutBonus,
  ascensionCreditPenalty,
} from './runLoadout';
export { stopSeed, generateStopCourse, currentTheme, routeTheme, currentCourse } from './runCourse';
export {
  FUEL_PRICE_BASE,
  FUEL_PRICE_SLOPE,
  FUEL_PRICE_MAX,
  fuelUnitCost,
  tankCapacity,
  routeFuelCost,
  fuelShortfall,
  travelRefuelCost,
  canTravel,
  scanFuelCost,
  canScanRoutes,
  scanRoutes,
  buyFuel,
  strand,
} from './runFuel';
export {
  buy,
  SHOP_OFFER_SIZE,
  rarityDepthBias,
  voyageRarityBias,
  voyageShopProgress,
  shopRarityBias,
  shopOffer,
  STARMART_OFFER_SIZE,
  STARMART_COST,
  starmartRerollCost,
  starmartOffer,
} from './runShop';
export type { ShopOffer, ShardShopOffer } from './runShop';
export { snapshotRun, resumeRun } from './runSerialise';
export type { RunSnapshot, RoundProgress } from './runSerialise';

export type RunStatus = 'active' | 'ended';
export type EndReason = 'cut' | 'banked' | 'won' | 'stranded';

export interface StopResult {
  stopIndex: number;
  distanceFromStart: number;
  biome: string;
  /** Star-travel theme id (GS-17) the stop flew into, if any. */
  themeId?: string;
  rarity: Rarity;
  stableford: number;
  gross: number;
  /** The cut line that had to be beaten. */
  cut: number;
  passed: boolean;
  creditsEarned: number;
  /** Holes-in-one made this stop (GS-ace) — drives the celebration + the carry-forward reward. */
  aces: number;
}

export interface Route {
  id: number;
  /** How far this route jumps (adds to distanceFromStart → scales difficulty). */
  distanceJump: number;
  label: string;
  /** The risk/reward event waiting at the stop this route reaches (GS-14). */
  event: RouteEvent;
  /**
   * The WORLD this lane flies into (GS-journey-biome) — the theme/biome the next stop is generated
   * from. Drawn from the ARC of the distance THIS jump reaches, so a deeper jump lands a later-arc
   * world AND the lane you pick determines the biome you play (no longer a disconnected surprise).
   * `travel` records it as the run's `pendingTheme`, which `currentTheme` then honours.
   */
  theme: Theme;
  /** The HARDER path (GS-voyage): the deepest, highest-stakes lane this jump — biggest cut, biggest
   *  payout. Derived from the drawn event (no extra rng), surfaced so the player can court the risk. */
  elite?: boolean;
  /** True if the stop this route reaches is a boss (GS-voyage) — previewed on the route card. */
  bossAhead?: boolean;
}

export interface Run {
  seed: number;
  /** Run format id (run shape). See formats.ts. */
  formatId: string;
  /** Which stop we're at (0-based). */
  stopIndex: number;
  distanceFromStart: number;
  credits: number;
  loadout: PlayerLoadout;
  /** Permanent meta-upgrade levels baked into this run's start (GS-12). Kept for resume. */
  meta: MetaUpgrades;
  /** Ascension difficulty tier (GS-ascension): 0 = base; each level tightens every cut and thins the
   *  starting purse. Selectable up to the highest tier unlocked by winning. Voyage-only in practice. */
  ascension: number;
  /** The permanent default-bag tier baked into this run's start (GS-bag-tiers); absent/'common' = the
   *  un-upgraded starter bag. Kept for resume (the loadout is rebuilt from it). */
  bagTier?: BagTier;
  /** The CHARACTER's permanently-unlocked clubs baked into this run's starting bag (GS-ascension-clubs):
   *  club types won as ascension-victory rewards on past runs with this golfer. Stable for the run's
   *  duration (they only grow at a win, which ends the run); kept for resume so the bag rebuilds. */
  unlockedClubs?: string[];
  /** STAR TOUR (GS-star-tour): the pinned static course id this run plays. When set, `currentCourse`
   *  serves `buildStaticCourse(id)` — the fixed designed 18-hole layout — instead of a generated stop.
   *  Absent on every other format → byte-for-byte the generated path. Snapshotted so a round resumes. */
  staticCourseId?: string;
  /** STAR TOUR (GS-star-tour): the weather sky chosen for the round (a `CourseEffectId`) — applied to the
   *  static course as pure physics (wind/carry) by `currentCourse`. Absent/'none' = calm. Snapshotted. */
  staticEffect?: string;
  /**
   * The route event applied to the CURRENT stop (GS-14) — set by `travel`, consumed (and
   * cleared) by `finishStop`. Absent at stop 0 / after scoring → the neutral DEFAULT_EVENT.
   */
  pendingEvent?: RouteEvent;
  /**
   * The WORLD the CURRENT stop flies into (GS-journey-biome) — set by `travel` from the chosen route's
   * destination theme, read by `currentTheme`/`currentCourse`. Absent at stop 0 / on an old resume →
   * `currentTheme` falls back to the deterministic `themeForStop` draw (byte-for-byte the old behaviour).
   */
  pendingTheme?: Theme;
  /** Permanent shards banked mid-run and kept even on a later bust — the Unending Universe's milestone
   *  bonuses (GS-unending) accrue here. Added by shardsForRun. (Route-event salvage lanes no longer drip
   *  shards — they hand you a CLUB instead, GS-journey-fx-3 — so in the voyage this only ever moves via
   *  endless milestones.) */
  bonusShards: number;
  /** Cumulative holes SURVIVED this run (GS-unending) — the per-hole survival format's progress
   *  counter, driving the gate tier, the milestones and the cosmetic unlocks. Advanced by
   *  `finishStop`; always 0 for formats without `holeGate`. Snapshotted so a resume keeps the bar. */
  holesSurvived: number;
  /** Cumulative GROSS strokes over the holes survived (GS-golf-score) — the running golf-round score
   *  for the Unending Universe. Advanced by `finishStop` alongside `holesSurvived`; always 0 for
   *  non-gate formats. Snapshotted so a resume keeps the round total. */
  grossStrokes: number;
  /** Cumulative PAR of the holes survived (GS-golf-score) — with `grossStrokes` gives to-par + net.
   *  Advanced by `finishStop`; always 0 for non-gate formats. Snapshotted. */
  parPlayed: number;
  /** Ids of UNIQUE one-off events already travelled into (GS-17c) — so each fires at most once. */
  firedEventIds: string[];
  /** Holes fast-forwarded by WARP (GS-warp) — the auto-birdie prefix's length. Warp keeps this in
   *  lock-step with `holesSurvived` (warping is only allowed while they're equal, so the warped
   *  span is always a contiguous prefix from hole 1); the first hand-played hole is
   *  `warpedThrough + 1`, the leaderboard range's start. 0 = an unwarped run. Snapshotted. */
  warpedThrough: number;
  /** Ship fuel in the tank (GS-fuel): every journey jump burns `distanceJump` units. Starts at the
   *  format's tank (`startingFuelFor`); topped up with credits (`buyFuel` / travel's auto-refuel).
   *  A run that can't cover any offered lane is STRANDED (endedReason 'stranded'). Snapshotted. */
  fuel: number;
  /** SECTOR SCANS burnt at the CURRENT stop (GS-fuel-4): each scan spends fuel to redraw the three
   *  onward lanes (`routeOptions` keys its rng stream off this count — 0 = the classic stream,
   *  byte-identical). Reset to 0 by `travel`. Snapshotted, so a resume shows the offer you paid
   *  for — unlike the shop reroll (pure UI state), scans burn a persisted run resource. */
  routeScans: number;
  /** Caddies FIRED this run (GS-caddy-factions): hiring a new named caddy while one is on the bag
   *  sacks the incumbent, whose id lands here. A fired caddy sulks off and is never offered again for
   *  the rest of THIS run (they'll turn up in future runs). Snapshotted so a resume keeps the grudge.
   *  Empty on the default path (never fired anyone) → byte-for-byte unchanged. */
  firedCaddies: string[];
  /** The Rainbow Ball has been SPENT on an Asgard tournament (GS-asgard): win or lose, the run loses the
   *  Rainbow Ball (stripped from `loadout.perks` on the return) and the Pro Shop must never re-offer it
   *  this run. Absent/false on every ordinary run → byte-for-byte unchanged. Snapshotted so a resume
   *  keeps the block. */
  rainbowConsumed?: boolean;
  /** The stopIndex at which the Prognostic Parrot's FORESIGHT is armed at 100% (GS-lore-parrot-firebird):
   *  set by the reducer when the parrot-derelict lore beat is dismissed, so THAT stop (and only that stop)
   *  foresees every swing. Self-expiring — `foresightChance` compares it to the live `stopIndex`, so once
   *  you travel on it no longer matches. Absent on every ordinary run → the parrot's normal proc chance,
   *  byte-for-byte unchanged. Snapshotted so a mid-stop resume keeps the boon. */
  parrotForesightStop?: number;
  status: RunStatus;
  endedReason?: EndReason;
  history: StopResult[];
}

export function startRun(
  seed: number | string,
  formatId: string = DEFAULT_FORMAT,
  meta: MetaUpgrades = {},
  characterId?: string,
  ascension = 0,
  bagTier: BagTier = DEFAULT_BAG_TIER,
  unlockedClubs: readonly string[] = [],
  staticCourseId?: string,
  staticEffect?: string,
): Run {
  const rng = new Rng(seed);
  const asc = Math.max(0, Math.min(ASCENSION_MAX, Math.round(ascension)));
  return {
    seed: rng.seed,
    formatId,
    stopIndex: 0,
    distanceFromStart: 0,
    // STAR TOUR (GS-star-tour): the pinned course + weather for a stroke-play round. Absent on every
    // other format, so the generated-stop path is byte-for-byte unchanged.
    ...(staticCourseId ? { staticCourseId } : {}),
    ...(staticEffect && staticEffect !== 'none' ? { staticEffect } : {}),
    // Permanent meta-progression bakes into the starting credits + loadout (GS-12); the chosen
    // golfer's shape/bag tweak (GS-18) is the base it builds on (see startingLoadoutFor). Ascension
    // thins the starting purse (floored so it never strands you with nothing). The default-bag tier
    // (GS-bag-tiers) re-stamps the starting clubs to a higher rarity.
    credits: Math.max(20, metaStartingCredits(meta) - ascensionCreditPenalty(asc)),
    loadout: startingLoadoutFor(meta, characterId, bagTier, unlockedClubs),
    meta,
    ascension: asc,
    bagTier,
    unlockedClubs: [...unlockedClubs],
    bonusShards: 0,
    holesSurvived: 0,
    grossStrokes: 0,
    parPlayed: 0,
    firedEventIds: [],
    warpedThrough: 0,
    // The format's starting tank (GS-fuel): the voyage gets exactly its single-hop budget; the
    // Unending Universe a 25-unit reserve. Every journey jump burns its distance in units.
    fuel: startingFuelFor(getFormat(formatId)),
    routeScans: 0,
    firedCaddies: [],
    status: 'active',
    history: [],
  };
}

/**
 * Play the current stop's course with the run's loadout. Adds credits if the cut is
 * made; ends the run (reason 'cut') if it's missed.
 */
/**
 * Compute a stop's result (cut, credits, run status) from the played holes. Shared by
 * the auto playStop and the interactive driver so both score identically.
 */
export function finishStop(
  run: Run,
  course: Course,
  played: PlayedHole[],
  opts: { matchWon?: boolean; warp?: boolean; prevBestHoles?: number } = {},
): { run: Run; result: StopResult } {
  const totals = playTotals(played.map((p) => p.record));
  // The pending route event shifts this stop's cut + payout (GS-14); neutral if none.
  const event = run.pendingEvent ?? DEFAULT_EVENT;
  const cut = effectiveCut(run, course.holes.length);
  const format = getFormat(run.formatId);
  const isBossStop = !!bossAt(format, run.stopIndex);
  // The Unending Universe's PER-SET survival bar (GS-set-survival): the whole set of four is scored on
  // its CUMULATIVE to-par (Σ strokes − Σ par), which must clear the set's allowance (ramping every two
  // sets, endless.ts). Reset each set — a single blow-up hole can be absorbed by the other three, so the
  // run only ever ends at a set boundary. `run.stopIndex` (= holesSurvived / 4) keys the allowance.
  const setToPar = format.holeGate ? endlessSetToPar(played) : 0;
  const setSurvived = !!format.holeGate && passesEndlessSet(setToPar, run.stopIndex);
  // Survival rule (GS-positional-cut): a WINNABLE campaign (the voyage) is a FIELD competition — you
  // survive an ordinary stop by finishing in the TOP-N of the arc leaderboard (top 18, then top 16),
  // not by clearing an abstract Stableford line, so the leaderboard is what decides your fate. The boss
  // stop passes on the DUEL (matchWon). The Unending Universe (GS-set-survival) passes only when the
  // four-hole set total cleared its allowance.
  const passed =
    opts.matchWon !== undefined
      ? opts.matchWon
      : format.holeGate
      ? setSurvived
      : format.winnable && !isBossStop
      ? playerSurvivesStop(run, course, totals.stableford)
      : totals.stableford >= cut;
  // Trigger-relic payouts (GS-synergy) add to the base before the credit multiplier, so they
  // synergise with credit perks/events. Zero for a base loadout (no relics).
  const relicBonus = relicCreditBonus(run.loadout, played, passed);
  // Hole-in-one jackpot (GS-ace): a flat credit bundle per ace, folded into the pre-multiplier bonus
  // so it compounds with credit perks — exactly like a relic. Paid on a passed stop (a missed cut ends
  // the run, so its credits are moot); the carry-forward talent below is granted regardless.
  const aces = aceCount(played);
  const creditsEarned = passed
    ? creditsForStop(totals.stableford, run.loadout.creditMult * event.creditMult, relicBonus + aceCreditBonus(played))
    : 0;
  // Clearing the FINAL boss of a winnable voyage WINS the run (GS-voyage).
  const won = passed && isFinalStop(getFormat(run.formatId), run.stopIndex);

  const result: StopResult = {
    stopIndex: run.stopIndex,
    distanceFromStart: run.distanceFromStart,
    biome: course.biome,
    themeId: course.meta?.themeId,
    rarity: course.rarity,
    stableford: totals.stableford,
    gross: totals.gross,
    cut,
    passed,
    creditsEarned,
    aces,
  };

  // Each ace stacks the Ace's Touch talent (GS-ace) — a precision boost kept for the rest of the run,
  // rebuilt from `loadout.perks` on resume. Applied IN finishStop so the auto sim and the interactive
  // player reward an ace byte-for-byte identically.
  const loadout = grantAceTalent(run.loadout, aces);

  // Great golf refuels the ship (GS-fuel-3): each holed EAGLE-OR-BETTER siphons one fuel cell,
  // clamped to capacity (a legacy over-capacity tank is never drained by the clamp). Never on a
  // WARPED stop (mirrors the milestone-shard rule — warped holes are auto-birdied, not earned).
  // Applied here so the auto sim and the interactive player refuel identically; pure, zero rng.
  const cap = tankCapacity(run);
  const siphon = opts.warp ? 0 : eagleCount(played);
  const fuel = run.fuel >= cap ? run.fuel : Math.min(cap, run.fuel + siphon);

  // Unending-Universe progress (GS-unending): advance the survived-hole counter and bank any crossed
  // milestone's shard bonus INSTANTLY through `bonusShards` (the same kept-even-on-a-bust channel the
  // route events use) — so a victory screen's reward can never be clawed back by a later death.
  const holesSurvived = run.holesSurvived + (setSurvived ? course.holes.length : 0);
  // A WARPED stop (GS-warp) never banks milestone shards — its holes were auto-birdied, not earned,
  // and warp is retryable/instant, so banking here would be a free shard farm every run.
  // Milestone shards are a LIFETIME-once reward, exactly like the Evergreen cosmetic unlocks: a
  // milestone already reached in a PRIOR run banks NOTHING when it's re-crossed. `opts.prevBestHoles`
  // is the reducer's persisted lifetime-best hole; flooring the crossing at it means only milestones
  // beyond the lifetime best ever pay out. The headless sim omits it (⇒ 0), preserving the per-run,
  // byte-identical behaviour every seeded test depends on.
  const milestoneFloor = Math.max(run.holesSurvived, opts.prevBestHoles ?? 0);
  const milestoneShards = format.holeGate && !opts.warp ? endlessMilestoneShards(milestoneFloor, holesSurvived) : 0;
  // Retained gross/par bookkeeping (GS-set-survival): a CLEARED set banks its four holes' gross + par;
  // a busted set (the run ends) banks nothing, so the totals stay in lock-step with `holesSurvived`.
  // These are no longer shown or ranked on (depth is the metric) — kept only for save-shape stability.
  let grossAdded = 0;
  let parAdded = 0;
  if (setSurvived) {
    for (const p of played) {
      grossAdded += p.record.strokes;
      parAdded += p.record.par;
    }
  }

  const next: Run = {
    ...run,
    loadout,
    fuel,
    credits: run.credits + creditsEarned,
    holesSurvived,
    grossStrokes: run.grossStrokes + grossAdded,
    parPlayed: run.parPlayed + parAdded,
    bonusShards: run.bonusShards + milestoneShards,
    history: [...run.history, result],
    // The event is spent — clear it so a resume can't double-apply it next stop.
    pendingEvent: undefined,
    // A missed cut ends the run; clearing the final boss WINS it; otherwise travel on.
    status: passed && !won ? 'active' : 'ended',
    ...(passed ? (won ? { endedReason: 'won' as const } : {}) : { endedReason: 'cut' as const }),
  };
  return { run: next, result };
}

/**
 * The Stableford the current stop demands — the distance-ramped cut line plus the pending
 * route event's `cutDelta` (GS-14). One source of truth for `finishStop` and the UI banner.
 */
export function effectiveCut(run: Run, holes: number): number {
  const event = run.pendingEvent ?? DEFAULT_EVENT;
  const format = getFormat(run.formatId);
  const boss = bossAt(format, run.stopIndex);
  // A winnable campaign scales its distance ramp down (cutMult) so it plateaus rather than spirals.
  const rampDistance = run.distanceFromStart * (format.cutMult ?? 1);
  return (
    cutLine(rampDistance, holes) +
    event.cutDelta +
    (boss?.cutBonus ?? 0) +
    ascensionCutBonus(run.ascension)
  );
}

/** The boss awaiting the player at the current stop, if any (GS-voyage). */
export function currentBoss(run: Run): BossSpec | undefined {
  return bossAt(getFormat(run.formatId), run.stopIndex);
}

// --- Positional cut (GS-positional-cut) -------------------------------------
//
// The leaderboard IS the cut for a winnable campaign. These helpers live in run.ts (which owns the Run,
// format, history and course) and lean on competition.ts's pure engine, so `finishStop` can rank the
// player WITHOUT importing league.ts (which would be a cycle). league.ts imports `arcSlices` back so the
// displayed board and the survival verdict are computed from the SAME slices — they can never disagree.

/** A neutral player look for the survival field — the field COMPOSITION is look-independent (it only
 *  reserves the chosen character's mirror), so this matches league's real-look field golfer-for-golfer. */
const SURVIVAL_LOOK = { cap: '#cfd6dd', shirt: '#7f8a96', skin: '#caa182', build: 1 };

/** The persistent voyage field used for the positional cut (same golfers/scores as league's display
 *  field). For a winnable voyage it's ONE field across the whole journey (GS-voyage-field), so the
 *  cut can thin it down to the final two; endless formats keep the per-arc field. */
function survivalField(run: Run): Field {
  const info: PlayerInfo = { name: 'You', look: SURVIVAL_LOOK, characterId: run.loadout.characterId };
  return getFormat(run.formatId).winnable
    ? buildVoyageField(run.seed, info)
    : buildField(run.seed, arcIndexOf(run.stopIndex), arcForDistance(run.distanceFromStart), info);
}

/**
 * Build the voyage's stop slices for the positional cut (GS-voyage-field): EVERY completed stop (from
 * history, across the whole voyage — the field persists and the cut is cumulative, not reset per arc)
 * plus an optional CURRENT stop (the one being scored, not yet in history). Each slice carries the
 * survivor target (top-N advance) for an ordinary stop — the ramp that thins the field to the final
 * two. Exported so league.ts reuses the SAME builder, so the drawn cut and the real cut never disagree.
 */
export function arcSlices(
  run: Run,
  current?: { themeId?: string; biome: string; holeCount: number; playerSF: number },
): ArcStopSlice[] {
  const format = getFormat(run.formatId);
  const ascCut = ascensionCutBonus(run.ascension);
  // GS-green-ease: the ghost field gives back a little at the gentle end of the ladder so a green-bag,
  // near-even-par player is competitive at A0–A4. Voyage-only (the positional cut) and 0 above A8, so
  // endless + the deep ladder are byte-identical.
  const fieldEase = format.winnable ? voyageFieldEase(run.ascension) : 0;
  const make = (stopIndex: number, themeId: string | undefined, biome: string, holeCount: number, playerSF: number): ArcStopSlice => ({
    stopIndex,
    themeId,
    archetype: archetypeFor(themeId, biome),
    holeCount,
    playerSF,
    isBoss: !!bossAt(format, stopIndex),
    target: arcSurvivorTarget(stopIndex, ascCut),
    fieldEase,
  });
  const slices: ArcStopSlice[] = [];
  for (const h of run.history) {
    slices.push(make(h.stopIndex, h.themeId, h.biome, stopSpecFor(format, h.stopIndex).holes, h.stableford));
  }
  if (current) slices.push(make(run.stopIndex, current.themeId, current.biome, current.holeCount, current.playerSF));
  slices.sort((a, b) => a.stopIndex - b.stopIndex);
  return slices;
}

/** Positional survival for the just-finished ORDINARY stop of a winnable run: is the player still in the
 *  top-N of the arc field (top 18, then top 16) after this stop's scores? */
function playerSurvivesStop(run: Run, course: Course, playerSF: number): boolean {
  const slices = arcSlices(run, {
    themeId: course.meta?.themeId,
    biome: course.biome,
    holeCount: course.holes.length,
    playerSF,
  });
  return arcCut(survivalField(run), run.seed, slices).playerAlive;
}

/**
 * The matchplay boss opponent for the player (GS-matchplay), computed WITHOUT league (so headless
 * playStop can resolve it without a cycle): the rank-mirror among the arc's pre-boss survivors. Matches
 * league.matchOpponentFor golfer-for-golfer (same field + slices), so headless ≡ interactive.
 */
export function matchOpponentForRun(run: Run): string | undefined {
  const field = survivalField(run);
  const slices = arcSlices(run); // the arc's completed (pre-boss) stops
  if (!slices.length) return field.golfers.find((g) => !g.isPlayer)?.id;
  const result = arcCut(field, run.seed, slices);
  return bossOpponentFor(result.standings, 'player') ?? field.golfers.find((g) => !g.isPlayer)?.id;
}

// --- Boss rewards / talents (GS-talents) ------------------------------------

export interface BossReward {
  kind: 'talent' | 'shards';
  /** Talent id (kind 'talent') or 'shards'. */
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  /** Permanent shards granted (kind 'shards'). */
  shards?: number;
}

/** Permanent shard reward for a boss win, scaled by galaxy depth. */
export function bossShardReward(run: Run): number {
  return 8 + Math.round(run.distanceFromStart * 1.5);
}

/**
 * The reward CHOICES offered after beating a boss (GS-talents): pick ONE of a themed run TALENT, a
 * generic run talent, or a permanent shard bonus — the "talent or permanent reward for this run" ask.
 * Thematic to the boss's zone, deterministic, skips talents you already own. Free (the spoils of victory).
 */
export function bossRewards(run: Run, archetype: string, salt = 0): BossReward[] {
  const rng = new Rng(`${run.seed}:bossreward:${run.stopIndex}:${salt}`);
  const owned = new Set(run.loadout.perks);
  const { themed, generic } = talentsForArchetype(archetype);
  const pickOne = (pool: ShopItem[]): BossReward | undefined => {
    const avail = pool.filter((t) => !owned.has(t.id));
    if (!avail.length) return undefined;
    const t = avail[rng.int(0, avail.length - 1)]!;
    owned.add(t.id); // don't offer the same talent twice on one screen
    return { kind: 'talent', id: t.id, name: t.name, desc: t.desc, rarity: t.rarity };
  };
  const choices: BossReward[] = [];
  const themedPick = pickOne(themed) ?? pickOne(generic);
  if (themedPick) choices.push(themedPick);
  const genericPick = pickOne(generic);
  if (genericPick) choices.push(genericPick);
  const shards = bossShardReward(run);
  choices.push({
    kind: 'shards',
    id: 'shards',
    name: 'Star Shards',
    desc: `+${shards} permanent Star Shards — banked across runs, win or lose.`,
    rarity: 'rare',
    shards,
  });
  return choices;
}

/** Grant a boss-reward talent (GS-talents) — applies it free (no credit cost), idempotent. */
export function grantTalent(run: Run, talentId: string): Run {
  const item = shopItem(talentId);
  if (!item || !item.talent || run.loadout.perks.includes(talentId)) return run;
  return { ...run, loadout: item.apply(run.loadout) };
}

/**
 * The full setup for a team-duel boss stop (GS-team-duel), or undefined for a non-team stop. Resolves
 * EVERYTHING the player + boss sides need: the opponent, the concrete format (scramble|bestball — a
 * `'random'` boss is fixed per run), which side is the UNDERDOG that gets the partner (the lower-ranked
 * side), the partner golfer ids + their swing shapes, and whether the boss has the home-zone edge.
 *
 * The partner side is decided by RANK: if the opponent is ranked higher (better), the PLAYER is the
 * underdog and gets the assist; if the player is ranked higher, the BOSS gets the partner. Computed
 * from the SAME field + arc slices as `matchOpponentForRun`, so the headless sim and the interactive
 * reducer agree golfer-for-golfer (both call this). Pure/deterministic.
 */
export interface TeamDuelSetup extends TeamSetup {
  opponentId: string;
  /** The boss course's theme, for the home-zone edge. */
  homeEdge: boolean;
  /** Resolved partner golfer ids (for UI attribution). */
  playerPartnerId?: string;
  bossPartnerId?: string;
}

export function teamDuelSetupForRun(run: Run): TeamDuelSetup | undefined {
  const boss = currentBoss(run);
  if (!isTeamDuelBoss(boss)) return undefined;
  const course = currentCourse(run);
  const opponentId = matchOpponentForRun(run) ?? '';
  const format = resolveTeamFormat(boss, run.seed) as TeamFormat;
  const partnerSide = teamPartnerSide(run, opponentId);
  const playerPid = scramblePartnerId(run.seed, run.stopIndex, run.loadout.characterId);
  const bossPid = bossPartnerId(run.seed, run.stopIndex, run.loadout.characterId);
  return {
    opponentId,
    format,
    partnerSide,
    homeEdge: bossHasHomeEdge(opponentId, course.meta?.themeId),
    playerPartnerId: partnerSide === 'player' ? playerPid : undefined,
    bossPartnerId: partnerSide === 'boss' ? bossPid : undefined,
    playerPartnerMods: partnerSide === 'player' ? characterShotMods(playerPid) : undefined,
    bossPartnerMods: partnerSide === 'boss' ? characterShotMods(bossPid) : undefined,
  };
}

/**
 * Which side of a team duel is the UNDERDOG and gets the partner (GS-team-duel): the lower-ranked side.
 * Compared on the arc standings (the same field/slices as the opponent pick). With no scores yet (the
 * arc's first boss after a resume), default to the player getting the assist (the friendly default).
 */
function teamPartnerSide(run: Run, opponentId: string): 'player' | 'boss' {
  const slices = arcSlices(run);
  if (!slices.length) return 'player';
  const standings = arcCut(survivalField(run), run.seed, slices).standings;
  const playerPos = standings.find((s) => s.isPlayer)?.position ?? 99;
  const oppPos = standings.find((s) => s.golferId === opponentId)?.position ?? 99;
  return underdogSide(playerPos, oppPos);
}

/**
 * Which side is the UNDERDOG and gets the partner, by leaderboard position (GS-team-duel): a LOWER
 * position number is a HIGHER rank, so the side with the bigger number is the underdog. The opponent
 * ranked higher (smaller number) ⇒ the PLAYER is the underdog and gets the assist; the player ranked
 * higher ⇒ the BOSS gets the partner. Pure.
 */
export function underdogSide(playerPosition: number, opponentPosition: number): 'player' | 'boss' {
  return playerPosition > opponentPosition ? 'player' : 'boss';
}

/**
 * Scramble options for the player's OWN ball on the current stop (GS-team-duel): the partner's swing
 * shape ONLY when the player is the underdog on a SCRAMBLE team duel, so the player's solo-played ball
 * (auto sim / watch / auto-finish) plays best-of-two like the interactive driver. Undefined otherwise
 * (solo play / best-ball / non-team stop) — no extra rng, byte-for-byte the solo hole. Pure.
 */
export function scrambleOptsFor(run: Run): ScrambleOpts | undefined {
  const setup = teamDuelSetupForRun(run);
  if (!setup || setup.format !== 'scramble' || setup.partnerSide !== 'player') return undefined;
  return { partnerMods: setup.playerPartnerMods };
}

/**
 * The Prognostic Parrot's EFFECTIVE foresight chance for the CURRENT stop (GS-lore-parrot-firebird): the
 * loadout's proc chance, boosted to a certain 1.0 on the stop where the parrot-derelict lore beat armed
 * it (`run.parrotForesightStop === run.stopIndex`). The `&& base` guard means an un-armed loadout (no
 * parrot) never gets a boost — so with the boon off this returns `run.loadout.previewScramble` verbatim
 * and every seeded run is byte-for-byte unchanged. ONE source, read by BOTH the headless auto path (via
 * `playerHoleOpts`) and the interactive reducer, so `auto ≡ interactive` holds. Pure, zero rng.
 */
export function foresightChance(run: Run): number | undefined {
  const base = run.loadout.previewScramble;
  return base && run.parrotForesightStop === run.stopIndex ? 1 : base;
}

/** The player's `playHole`/`playCourse` options from their loadout — shared by the auto sim and the
 *  matchplay duel so the player's own ball plays identically with or without a boss alongside. */
export function playerHoleOpts(run: Run): PlayHoleOptions {
  return {
    bag: run.loadout.bag,
    dispersionMult: netDispersion(run.loadout),
    // Putter perks reach the headless putt-out too (auto ≡ interactive) — {} on a stock loadout.
    puttSkill: puttSkillOf(run.loadout),
    shotMods: characterShotMods(run.loadout.characterId),
    shapeMod: run.loadout.shapeMod,
    minCarryBoost: run.loadout.minCarryBoost,
    wedgeWindow: run.loadout.wedgeWindow,
    minCarryBoostByClass: run.loadout.minCarryBoostByClass,
    driverPowerFloor: run.loadout.driverPowerFloor,
    driverAnywhere: run.loadout.driverAnywhere,
    guard: run.loadout.caddyGuard,
    chipIn: run.loadout.chipInBoost,
    confidence: run.loadout.confidenceMod,
    lieRelief: run.loadout.lieRelief,
    lefty: run.loadout.lefty,
    windResist: run.loadout.windResist,
    backspinBoost: run.loadout.backspinBoost,
    hazardImmune: run.loadout.hazardImmune,
    rainbowRoad: run.loadout.rainbowRoad,
    // Trade-camp tents (GS-tents): the trade-market route arms a ring of collidable tents around the
    // green. Derived from the SAME pending-event effect `currentCourse` stamps on the meta, so the sim
    // collision and the renderer agree on when tents exist.
    tradeTents: routeEffect(run.pendingEvent) === 'tradeMarket',
    // Meteor-strike scorch marks (GS-meteor-scorch): the meteor-shower route chars craters into the
    // turf — same effect-derived gate, so the sim's lie conversion and the drawn craters agree.
    meteorScorch: routeEffect(run.pendingEvent) === 'meteorShower',
    // Effect ground patches (GS-journey-fx-2): comet stardust / frostfall ice / debris wreckage —
    // same effect-derived gate, so the sim's lie conversion and the drawn patches agree.
    groundPatch: effectPatchKind(routeEffect(run.pendingEvent)),
    scramble: scrambleOptsFor(run),
    // Prognostic Parrot foresight (GS-caddy-parrot): the parrot's per-shot second-swing proc, applied
    // by playHole with the player's OWN golfer as the partner. Undefined without the parrot ⇒ no draw.
    // `foresightChance` bumps it to 100% on the parrot-derelict lore stop (GS-lore-parrot-firebird).
    previewScramble: foresightChance(run),
  };
}

/** The run-derived boss sharpening (GS-boss-scale): Ascension tier + the run's bag tier (gear
 *  parity). One source for the headless `playStop` and the interactive reducer, so a duel plays
 *  the identical boss either way. A0 + common bag ⇒ the classic boss, byte-for-byte. */
export function bossEdgeForRun(run: Run): BossEdge {
  return { ascension: run.ascension, bagTier: run.bagTier };
}

// --- Warp (GS-warp): fast-forward the proven holes under the auto-birdie rule -----------------

/**
 * May the NEXT stop be warped? Only in the Unending Universe, only while the run is still a pure
 * warp prefix (`holesSurvived === warpedThrough` — you can't resume warping after taking a real
 * swing, so the leaderboard range stays one contiguous span), and only while the whole stop fits
 * under the player's PROVEN best (`bestHoles`) — new ground is always hand-played, which is what
 * keeps `endlessBestHoles`, the milestones and the Evergreen unlocks un-farmable.
 */
export function canWarpStop(run: Run, bestHoles: number, stopHoles: number): boolean {
  return (
    run.status === 'active' &&
    holeGateArmed(run) &&
    run.holesSurvived === run.warpedThrough &&
    stopHoles > 0 &&
    run.holesSurvived + stopHoles <= bestHoles
  );
}

/**
 * Auto-play the current stop under WARP (GS-warp): the auto-AI plays every hole instantly on the
 * ordinary `:play` stream (same courses, same shot engine, pin-attack arming and all), and each
 * hole is then floored at a BIRDIE (`warpBirdieHole` — the hidden mirror of the pickup rule), so
 * the stop always survives its bars. Credits/economy accrue off the (birdie-floored) card exactly
 * as if played — the build you arrive with is the build the run pays for — but milestone shards
 * are NOT banked (finishStop's warp opt) and the reducer suppresses the ace-ship grant. The caller
 * enforces `canWarpStop`; a non-gate format falls through to the ordinary `playStop`.
 */
export function playStopWarp(run: Run): { run: Run; result: StopResult; played: PlayedHole[] } {
  if (run.status !== 'active') throw new Error('playStopWarp: run is not active');
  if (!getFormat(run.formatId).holeGate) return playStop(run);
  const course = currentCourse(run);
  const rng = new Rng(`${course.seed}:play`);
  const base = playerHoleOpts(run);
  const holeOpts = endlessAttackArmed(run) ? { ...base, attackPin: true } : base;
  const played = course.holes.map((h) => warpBirdieHole(playHole(h, rng, holeOpts)));
  const fin = finishStop(run, course, played, { warp: true });
  // The warp prefix extends in lock-step with the survived count (every warped hole survives).
  return { run: { ...fin.run, warpedThrough: fin.run.holesSurvived }, result: fin.result, played };
}

export function playStop(
  run: Run,
  opts: { prevBestHoles?: number } = {},
): { run: Run; result: StopResult; played: PlayedHole[] } {
  if (run.status !== 'active') throw new Error('playStop: run is not active');
  const course = currentCourse(run);
  // A matchplay boss stop (GS-matchplay) is a 1-on-1 knockout vs the player's rank-mirror, decided by
  // the DUEL — so headless plays it exactly as the interactive reducer does (same opponent, same two
  // rng streams), keeping auto ≡ interactive. The player's OWN ball is byte-for-byte a solo stop (the
  // boss rides a separate stream), so balance for the player's shots is unchanged; only the PASS gate
  // becomes the match instead of Stableford-vs-cut.
  if (getFormat(run.formatId).winnable && isMatchplayBoss(currentBoss(run))) {
    // A TEAM duel (GS-team-duel) plays each side as solo/scramble/best-ball per the rank-based setup;
    // a plain matchplay boss is a straight 1-v-1. Both decided by the hole-by-hole duel.
    const setup = teamDuelSetupForRun(run);
    const oppId = setup?.opponentId ?? matchOpponentForRun(run) ?? '';
    const homeEdge = setup?.homeEdge ?? bossHasHomeEdge(oppId, course.meta?.themeId);
    const stop = setup
      ? playTeamMatchStop(
          course.holes,
          playerHoleOpts(run),
          oppId,
          setup,
          new Rng(`${course.seed}:play`),
          new Rng(`${course.seed}:boss`),
          homeEdge,
          bossEdgeForRun(run),
        )
      : playMatchStop(
          course.holes,
          playerHoleOpts(run),
          oppId,
          new Rng(`${course.seed}:play`),
          new Rng(`${course.seed}:boss`),
          homeEdge,
          bossEdgeForRun(run),
        );
    const { run: next, result } = finishStop(run, course, stop.player, {
      matchWon: stop.state.playerAdvances,
      prevBestHoles: opts.prevBestHoles,
    });
    return { run: next, result, played: stop.player };
  }
  const rng = new Rng(`${course.seed}:play`);
  // The Unending Universe (GS-set-survival) is judged on the whole SET of four, so the auto sim plays
  // every hole of the stop (no mid-set death) on the same sequential `:play` stream and hands the full
  // set to `finishStop` — byte-for-byte like the interactive driver, which also plays every hole and
  // scores the set at the end. GS-ai-attack: once the set's allowance is bogey-tight the auto-AI hunts
  // pins (armed per SET, so it's on for the whole stop or none) — the same rule the interactive auto
  // driver reads via `endlessAttackArmed`.
  if (getFormat(run.formatId).holeGate) {
    const base = playerHoleOpts(run);
    const holeOpts = endlessAttackArmed(run) ? { ...base, attackPin: true } : base;
    const played = playCourse(course.holes, rng, holeOpts);
    const { run: next, result } = finishStop(run, course, played, { prevBestHoles: opts.prevBestHoles });
    return { run: next, result, played };
  }
  const played = playCourse(course.holes, rng, playerHoleOpts(run));
  const { run: next, result } = finishStop(run, course, played, { prevBestHoles: opts.prevBestHoles });
  return { run: next, result, played };
}

// --- Unending-Universe helpers (GS-unending) ---------------------------------

/** Is this run governed by the per-hole survival bar (the Unending Universe)? */
export function holeGateArmed(run: Run): boolean {
  return !!getFormat(run.formatId).holeGate;
}

/** The cumulative (1-based) hole NUMBER of the current stop's `holeIndex`-th hole — for display
 *  ("holes 25–28"). Valid before the stop is scored (holesSurvived is the pre-stop count). */
export function endlessHoleNumber(run: Run, holeIndex: number): number {
  return run.holesSurvived + holeIndex + 1;
}

/** The set allowance (cumulative strokes over par) at/below which the endless auto-AI turns pin-hunter. */
export const ENDLESS_ATTACK_GATE = 1;

/** Should the auto-AI hunt pins this SET (GS-ai-attack)? Armed only in the Unending Universe, once the
 *  set's allowance is bogey-tight or tighter — safe play can't buy the pars/birdies a deep set demands.
 *  Per SET (constant across the stop's four holes), so it's on for the whole set or none. One rule for
 *  headless `playStop` AND the interactive auto driver (`autoShotHole`), so auto ≡ interactive holds;
 *  every voyage/calm-set hole is byte-identical. */
export function endlessAttackArmed(run: Run): boolean {
  return holeGateArmed(run) && endlessSetGateOverPar(run.stopIndex) <= ENDLESS_ATTACK_GATE;
}

/**
 * The bare event-ids a given stop's route draw produces — mirrors `routeOptions`'s draw order (3
 * distance rolls, then the arc event draw) so it can be recomputed for a PAST stop. Used only for
 * anti-repeat; pure and deterministic. (Uses the run's CURRENT firedEventIds, a harmless arc-3-only
 * approximation, since uniques don't gate arcs 1–2 where the small pool makes repeats most visible.
 * Likewise keys off the stop's ORIGINAL, un-scanned offer — a past stop's sector-scan count isn't
 * persisted per stop (GS-fuel-4), and anti-repeat is a taste rule, not a contract.)
 */
function offerEventIds(run: Run, stopIndex: number, distanceFromStart: number): string[] {
  const rng = new Rng(`${run.seed}:routes:${stopIndex}`);
  const maxJump = getFormat(run.formatId).maxJump ?? 3;
  for (let i = 0; i < 3; i++) rng.int(1, maxJump);
  const arc = arcForDistance(distanceFromStart);
  const pool = eventPool(distanceFromStart, run.firedEventIds);
  return drawArcRouteEvents(rng, arc, pool).map((e) => e.id);
}

/** The onward routes offered after a stop. Deterministic from the run + stop — and from the stop's
 *  SECTOR-SCAN count (GS-fuel-4): each scan re-keys the stream, so a scanned offer is a genuinely
 *  fresh draw yet still pure (a resume reproduces exactly the lanes you paid for). Scan 0 keeps the
 *  classic key, byte-identical (contract 1: the new draws are gated behind the feature being used). */
export function routeOptions(run: Run): Route[] {
  const scanKey = run.routeScans > 0 ? `:scan${run.routeScans}` : '';
  const rng = new Rng(`${run.seed}:routes:${run.stopIndex}${scanKey}`);
  const labels: Record<number, string> = { 1: 'Short hop', 2: 'Cruise', 3: 'Deep jump' };
  // A bounded campaign caps the per-jump distance so its wildness/cut growth stays fair (GS-voyage);
  // endless formats default to the original 1–3 draw, keeping their RNG stream byte-identical.
  const maxJump = getFormat(run.formatId).maxJump ?? 3;
  // Draw distances FIRST (unchanged RNG stream for flat/ladder), then attach an event to each route.
  const routes = Array.from({ length: 3 }, (_, i) => {
    const distanceJump = rng.int(1, maxJump);
    return { id: i, distanceJump, label: labels[distanceJump]! };
  });
  // Pool is arc-tiered to the run's depth and excludes already-fired uniques (GS-17c). The per-arc
  // SLOT draw (GS-routes) sets the rarity MIX — gentle commons early, rares/epics/legendaries deep —
  // so the loot feel ramps with the journey instead of a flat rarity-weighted shuffle.
  const arc = arcForDistance(run.distanceFromStart);
  // Anti-repeat (GS-journey): drop the events offered at the PREVIOUS stop so two consecutive jumps
  // never show the same lanes (the "same 3 options again" complaint — the early-arc common pool is
  // small, so an unconstrained draw repeats often). Recomputed deterministically from history, so it
  // stays a pure function of `run` (no new run/save state); empty at stop 0 (there is no prior offer).
  const prevStop = run.history.length >= 2 ? run.history[run.history.length - 2] : undefined;
  const excludeIds = prevStop ? offerEventIds(run, prevStop.stopIndex, prevStop.distanceFromStart) : [];
  const fullPool = eventPool(run.distanceFromStart, run.firedEventIds);
  const pool = excludeIds.length ? fullPool.filter((e) => !excludeIds.includes(e.id)) : fullPool;
  const events = drawArcRouteEvents(rng, arc, pool);
  const withEvents = routes.map((r, i) => ({ ...r, event: events[i] ?? DEFAULT_EVENT }));
  // Derive the HARDER PATH (GS-voyage) WITHOUT touching the rng: the single highest-stakes lane —
  // the route whose event raises the cut the most (ties broken by payout). Only a genuinely risky
  // lane (cutDelta > 0) is flagged, so early calm jumps show no elite option.
  const format = getFormat(run.formatId);
  let eliteIdx = -1;
  for (let i = 0; i < withEvents.length; i++) {
    const e = withEvents[i]!.event;
    if (e.cutDelta <= 0) continue;
    if (
      eliteIdx < 0 ||
      e.cutDelta > withEvents[eliteIdx]!.event.cutDelta ||
      (e.cutDelta === withEvents[eliteIdx]!.event.cutDelta && e.creditMult > withEvents[eliteIdx]!.event.creditMult)
    ) {
      eliteIdx = i;
    }
  }
  // Lane-distinct worlds (GS-journey-variety): each lane avoids the archetypes the earlier lanes
  // drew AND the world you're currently standing on, so the three planets are three different
  // biomes and you (pool permitting) never fly straight back into the world you just played.
  const avoid = new Set<BiomeArchetype>([currentTheme(run).archetype]);
  return withEvents.map((r, i) => {
    // GS-weather-affinity: bias this lane's world toward its SKY (a blizzard lane leans cold, a dust
    // storm lane leans desert) — a soft nudge on the lane's own theme stream, weather still event-driven.
    const theme = routeTheme(run.seed, run.stopIndex, r.id, run.distanceFromStart + r.distanceJump, avoid, routeEffect(r.event));
    avoid.add(theme.archetype);
    return {
      ...r,
      elite: i === eliteIdx,
      // The world this lane flies into (GS-journey-biome) — drawn from the arc the jump reaches, so the
      // route preview, the map planet, and the biome you actually play all agree.
      theme,
      // Preview whether the stop this route reaches (the next stop) is a boss.
      bossAhead: !!bossAt(format, run.stopIndex + 1),
    };
  });
}

/**
 * Resolve the SALVAGE club find a route hands you on arrival (GS-journey-fx-3, GS-salvage-mystery) —
 * `undefined` for any non-salvage lane. THE SINGLE SOURCE: `travel` grants from it, and the UI reveals
 * from it (the reveal, unlike a preview, is computed here from the PRE-travel `run` so it can't be
 * recomputed after `travel` has already mutated the bag). Keyed to the DESTINATION stream
 * (`salvage:<seed>:<arrivingStop>:<eventId>`), so each salvage stop is its own blind roll — skip it and
 * the next lane's loot may differ. Pure & deterministic in `run` + `route` (never a shared sim/render
 * stream), so it perturbs no existing draw order (contract 1).
 */
export function salvageFindFor(run: Run, route: Route): SalvageFind | undefined {
  const findRarity = routeClubFind(route.event);
  if (!findRarity) return undefined;
  return salvageClubFind(run.loadout, findRarity, `salvage:${run.seed}:${run.stopIndex + 1}:${route.event.id}`);
}

/** Travel a chosen route to the next stop (deeper = harder, better rewards). */
export function travel(run: Run, route: Route): Run {
  if (run.status !== 'active') throw new Error('travel: run is not active');
  // GS-fuel: the jump burns its distance in fuel; a short tank buys the missing units at the LOCAL
  // depot price (GS-fuel-2 — dearer the deeper you fly). ONE rule for the headless sim and the
  // interactive reducer (which guards with `canTravel`, disables the lane, and prints this exact
  // surcharge on the Jump button), so auto ≡ interactive holds by construction.
  const refuel = travelRefuelCost(run, route);
  if (run.credits < refuel) throw new Error('travel: not enough fuel (refuel or pick a shorter jump)');
  const burnt = Math.max(0, run.fuel - routeFuelCost(run, route));
  const ev = route.event;
  // A fuel-salvage lane (GS-fuel-4) siphons its units ON ARRIVAL — clamped to capacity, never
  // draining a legacy over-capacity tank. One rule here, so auto ≡ interactive by construction.
  const fuelAfter = ev.fuelBonus
    ? Math.max(burnt, Math.min(tankCapacity(run), burnt + Math.max(0, Math.floor(ev.fuelBonus))))
    : burnt;
  const arrivingStop = run.stopIndex + 1;
  // GS-routes: a credit TOLL bites up front (floored so it never strands you below zero).
  const toll = Math.max(0, ev.creditToll ?? 0);
  // GS-journey-fx-3: a SALVAGE lane scavenges a club you don't already carry, equipped for the rest of
  // the run — a reward you feel THIS run, in place of the old trivial shard drip. Resolved by the shared
  // `salvageFindFor` (the single source the UI reveal also reads), keyed to the DESTINATION so each
  // salvage stop is its own blind roll (GS-salvage-mystery). Resume-safe for free: the find is a shop
  // CLUB_ITEM, so applying it records the item's perk id and `loadoutFromPerks` re-equips it on resume.
  // If the bag already holds every candidate at that rarity, it pays a rarity-scaled credit consolation
  // so the lane never comes up empty.
  const found = salvageFindFor(run, route);
  let loadout = run.loadout;
  let salvageCredits = 0;
  if (found) {
    const item = found.clubItemId ? clubItem(found.clubItemId) : undefined;
    if (item) loadout = item.apply(loadout);
    else salvageCredits = found.consolationCredits ?? 0;
  }
  return {
    ...run,
    loadout,
    stopIndex: arrivingStop,
    distanceFromStart: run.distanceFromStart + route.distanceJump,
    // The mandatory refuel is paid first (guarded above), then the toll bites (still floored).
    credits: Math.max(0, run.credits - refuel - toll) + salvageCredits,
    fuel: fuelAfter,
    // The sector-scan meter resets with the jump (GS-fuel-4): the next stop's offer opens on the
    // classic scan-0 stream, and the escalating scan price starts over.
    routeScans: 0,
    // Carry the chosen route's event into the next stop (applied by finishStop).
    pendingEvent: ev,
    // Carry the chosen lane's WORLD into the next stop (GS-journey-biome) — the biome you arrive in is
    // the one the route previewed, not an unrelated re-draw.
    pendingTheme: route.theme,
    // A unique one-off is now spent for the rest of the run (GS-17c).
    firedEventIds: ev.unique ? [...run.firedEventIds, ev.id] : run.firedEventIds,
  };
}

/** Voluntarily bank the run (cash out) — ends it with reason 'banked'. */
export function bank(run: Run): Run {
  return { ...run, status: 'ended', endedReason: 'banked' };
}

/**
 * Build the ASGARD tournament run (GS-asgard) — a self-contained nine-hole stroke-play side event on the
 * Golden Realm, spun off from the player's CURRENT run when they earn an eagle-or-better on Rainbow Road.
 * It keeps their built-up bag (perks) MINUS the Rainbow Ball, so it plays Asgard's real geometry rather
 * than the rainbow ribbon; the theme is forced to Asgard (`pendingTheme` object, never `themeById`), so
 * `currentCourse` generates the `asgard-realm` biome. It is never travelled/shopped and never persisted
 * (a mid-tournament quit falls back to the suspended run), so it needs no fuel/route state. Deterministic
 * from the source run + stop.
 */
export function startAsgardRun(source: Run): Run {
  const perks = source.loadout.perks.filter((p) => p !== 'rainbow-ball');
  const loadout = loadoutFromPerks(perks, baseLoadoutForRun(source));
  return {
    ...startRun(`${source.seed}:asgard:${source.stopIndex}`, ASGARD_FORMAT, source.meta, source.loadout.characterId, source.ascension, source.bagTier, source.unlockedClubs),
    loadout,
    // The Golden Realm, forced as the destination world (the object, so it never needs a THEMES entry).
    pendingTheme: ASGARD_THEME,
  };
}

// --- Meta-progression: shards earned per run (GS-12) -------------------------

export const SHARD_PER_DISTANCE = 3;
export const SHARD_PER_STOP = 2;
/** Credits → shards conversion when you BANK or WIN a run. Busting at the cut forfeits this. */
export const CREDITS_PER_SHARD = 20;
/** Flat shard bonus for completing a winnable voyage (GS-voyage) — the payoff for a finished run. */
export const WIN_SHARD_BONUS = 60;

/**
 * Star Shards earned by a run — the persistent currency spent at the Outpost. Rewards how
 * FAR you travelled (the roguelite goal) plus a little per stop cleared, so even a run that
 * bricks on stop 1 buys some lasting progress. Pure; floored at 1.
 *
 * Push-your-luck (GS-bank): a run you BANK (voluntarily cash out, `endedReason 'banked'`) also
 * converts its UNSPENT credits into shards — a run cut short at the line forfeits them. This is
 * what gives the "bank now or push one deeper" decision real teeth (the classic roguelite tension)
 * and gives leftover credits a terminal value instead of evaporating when the run ends.
 */
export function cashOutShards(run: Run): number {
  // A STRANDED run (GS-fuel) also keeps its pocket change: running dry is a forced stop, not a
  // missed cut, so the leftovers convert like a bank (they're below one fuel unit by definition,
  // so this is a courtesy, not a loophole).
  const keepsCredits =
    run.endedReason === 'banked' || run.endedReason === 'won' || run.endedReason === 'stranded';
  return keepsCredits ? Math.floor(Math.max(0, run.credits) / CREDITS_PER_SHARD) : 0;
}

export function shardsForRun(run: Run): number {
  const base = Math.max(
    1,
    Math.round(run.distanceFromStart * SHARD_PER_DISTANCE + run.history.length * SHARD_PER_STOP),
  );
  const winBonus = run.endedReason === 'won' ? WIN_SHARD_BONUS : 0;
  // Route-event salvage banked mid-run (GS-routes) is kept regardless of how the run ends.
  return base + cashOutShards(run) + winBonus + Math.max(0, run.bonusShards ?? 0);
}

// --- Headless full-run driver (for tests / AI sims) -------------------------

export interface RunStrategy {
  /** Pick an onward route; default = the first. */
  pickRoute?(run: Run, routes: Route[]): Route;
  /** Item ids to attempt buying after a stop; default = none. */
  shop?(run: Run): string[];
  /** Run format id; default = the engine default (DEFAULT_FORMAT). */
  formatId?: string;
  /** Permanent meta-upgrades baked into the starting loadout/credits; default = none. */
  meta?: MetaUpgrades;
  /** Selected golfer id (GS-18); default = none (a neutral straight golfer). */
  characterId?: string;
  /** Ascension difficulty tier (GS-ascension); default 0. */
  ascension?: number;
  /** The character's ascension-victory club unlocks (GS-ascension-clubs) baked into the starting bag;
   *  default none. */
  unlockedClubs?: readonly string[];
}

export interface RunOutcome {
  run: Run;
  stops: StopResult[];
}

/** Simulate an entire run to its end (or a safety cap). Deterministic. */
export function simulateRun(
  seed: number | string,
  strategy: RunStrategy = {},
  maxStops = 100,
): RunOutcome {
  let run = startRun(
    seed,
    strategy.formatId,
    strategy.meta,
    strategy.characterId,
    strategy.ascension,
    DEFAULT_BAG_TIER,
    strategy.unlockedClubs ?? [],
  );
  const stops: StopResult[] = [];
  for (let i = 0; i < maxStops && run.status === 'active'; i++) {
    const played = playStop(run);
    run = played.run;
    stops.push(played.result);
    if (run.status !== 'active') break;
    for (const id of strategy.shop?.(run) ?? []) run = buy(run, id);
    const routes = routeOptions(run);
    // GS-fuel: honour the strategy's pick while it's payable (travel auto-buys any shortfall);
    // otherwise fall back to the cheapest payable lane, and with none the run is STRANDED — the
    // same rule the interactive travel screen enforces.
    const preferred = strategy.pickRoute?.(run, routes) ?? routes[0]!;
    const route = canTravel(run, preferred)
      ? preferred
      : routes.filter((r) => canTravel(run, r)).sort((a, b) => a.distanceJump - b.distanceJump)[0];
    if (!route) {
      run = strand(run);
      break;
    }
    run = travel(run, route);
  }
  return { run, stops };
}
