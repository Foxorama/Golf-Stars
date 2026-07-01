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
import { generateCourse } from '../course/generate';
import { playCourse, type PlayedHole, type PlayHoleOptions } from '../round';
import { playTotals } from '../score';
import type { Course, Rarity } from '../course/contract';
import {
  DRIVER_ID,
  SHOP_ITEMS,
  aceCount,
  aceCreditBonus,
  canBuy,
  creditsForStop,
  cutLine,
  grantAceTalent,
  itemCap,
  itemCost,
  itemTags,
  loadoutFromPerks,
  namedCaddyOwned,
  netDispersion,
  offerableClubs,
  ownedCount,
  relicCreditBonus,
  shopItem,
  talentsForArchetype,
  startingLoadout,
  type PlayerLoadout,
  type ShopItem,
} from './economy';
import { RARITY_C } from './loot';
import { DEFAULT_FORMAT, bossAt, getFormat, isFinalStop, isMatchplayBoss, isTeamDuelBoss, resolveTeamFormat, stopCount, stopSpecFor, type BossSpec, type StopSpec } from './formats';
import { playMatchStop, playTeamMatchStop, bossHasHomeEdge, type TeamSetup, type TeamFormat } from './match';
import { applyMeta, metaStartingCredits, type MetaUpgrades } from './meta';
import { applyBagTier, DEFAULT_BAG_TIER, type BagTier } from './bag';
import { addUnlockedClubs } from './club-unlock';
import { applyCharacter, characterShotMods, scramblePartnerId, bossPartnerId } from './characters';
import type { ScrambleOpts } from '../round';
import { DEFAULT_EVENT, drawArcRouteEvents, eventPool, routeEvent, type RouteEvent } from './events';
import { EFFECT_WIND_CAP, effectWindMult, routeDifficulty, routeEffect } from './effects';
import { themeForStop, themeById, resolveBiome, itemThemeWeight, pickTheme, pickThemeFrom, themesForArc, arcForDistance, archetypeFor, type BiomeArchetype, type Theme } from '../course/themes';
import { buildField, buildVoyageField, arcCut, arcIndexOf, arcSurvivorTarget, bossOpponentFor, type ArcStopSlice, type Field, type PlayerInfo } from './competition';

export type RunStatus = 'active' | 'ended';
export type EndReason = 'cut' | 'banked' | 'won';

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
  /** Permanent shards banked mid-run by route events (GS-routes `shardBonus`) — accrued on travel and
   *  kept even on a later bust, so a "salvage" lane is guaranteed meta progress. Added by shardsForRun. */
  bonusShards: number;
  /** Ids of UNIQUE one-off events already travelled into (GS-17c) — so each fires at most once. */
  firedEventIds: string[];
  status: RunStatus;
  endedReason?: EndReason;
  history: StopResult[];
}

/**
 * The starting loadout for a run: the chosen golfer's signature bag/shape (GS-18, GS-clubs) FIRST,
 * then the permanent meta-upgrades baked ON TOP — so Tour Bag (+yds) lands on the character's own
 * sparse starting bag rather than a discarded default one, and the meta order is identical on resume.
 * One source of truth for `startRun` + `resumeRun` (and the Sim Lab) so they reconstruct it the same.
 */
export function startingLoadoutFor(
  meta: MetaUpgrades,
  characterId?: string,
  bagTier: BagTier = DEFAULT_BAG_TIER,
  unlockedClubs: readonly string[] = [],
): PlayerLoadout {
  // The character's ascension-victory club unlocks (GS-ascension-clubs) are added AFTER meta (so they
  // inherit the final distanceClubBonus) but BEFORE the bag tier, so they re-stamp to the live rarity
  // with the rest of the bag. The bag tier re-stamps LAST, reading the final distanceClubBonus (character
  // + meta Tour Bag) when rebuilding the distance clubs — and a 'common' tier is a no-op (byte-for-byte).
  const base = addUnlockedClubs(applyMeta(meta, applyCharacter(characterId, startingLoadout())), unlockedClubs);
  return applyBagTier(base, bagTier);
}

/** Ascension ladder (GS-ascension): a fixed-length campaign gets harder above the base difficulty,
 *  unlocked one tier at a time by winning. Each level adds a flat per-stop cut and thins the purse.
 *  Raised to 15 (GS-bag-tiers) so the deepest bag unlock (clear A11 → legendary bag) is reachable. */
export const ASCENSION_MAX = 15;
export function ascensionCutBonus(level: number): number {
  return Math.max(0, Math.round(level));
}
export function ascensionCreditPenalty(level: number): number {
  return Math.max(0, Math.round(level)) * 8;
}

export function startRun(
  seed: number | string,
  formatId: string = DEFAULT_FORMAT,
  meta: MetaUpgrades = {},
  characterId?: string,
  ascension = 0,
  bagTier: BagTier = DEFAULT_BAG_TIER,
  unlockedClubs: readonly string[] = [],
): Run {
  const rng = new Rng(seed);
  const asc = Math.max(0, Math.min(ASCENSION_MAX, Math.round(ascension)));
  return {
    seed: rng.seed,
    formatId,
    stopIndex: 0,
    distanceFromStart: 0,
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
    firedEventIds: [],
    status: 'active',
    history: [],
  };
}

/** Deterministic seed for the course at the current stop. */
export function stopSeed(run: Run): string {
  return `${run.seed}:stop:${run.stopIndex}`;
}

/**
 * The star-travel theme the current stop flies into (GS-17). The lane you chose at the previous
 * travel screen determines the world (GS-journey-biome) — so honour `pendingTheme` if set. At stop 0
 * (no jump taken yet) or on an old resume it falls back to the deterministic `themeForStop` draw,
 * keeping the very first stop byte-for-byte identical to the old behaviour.
 */
export function currentTheme(run: Run): Theme {
  return run.pendingTheme ?? themeForStop(run.seed, run.stopIndex, run.distanceFromStart);
}

/**
 * The world a route lane flies into (GS-journey-biome). Drawn from the ARC of the distance the jump
 * REACHES (`reachedDistance`), so a deeper jump lands a later-arc, wilder world. Keyed by route id on
 * its own rng stream, so attaching it to `routeOptions` leaves the existing `:routes:` draw order
 * (distances + events) byte-for-byte unchanged. Pure & deterministic.
 *
 * `avoid` (GS-journey-variety) is a set of biome ARCHETYPES this lane must steer clear of — the
 * other lanes' worlds plus the world you're standing on — so the three branch planets read as three
 * genuinely different destinations instead of "ember world, ember world, ember world". A colliding
 * first draw is replaced by ONE rarity-weighted redraw over the arc pool FILTERED to permitted
 * archetypes (this lane's own stream — extra draws perturb nothing else), so distinctness is
 * guaranteed whenever the arc offers enough archetypes (every arc has ≥7; the avoid set is ≤3).
 * Only if the filter empties the pool does the first draw stand.
 */
export function routeTheme(
  seed: number | string,
  stopIndex: number,
  routeId: number,
  reachedDistance: number,
  avoid?: ReadonlySet<BiomeArchetype>,
): Theme {
  const rng = new Rng(`${seed}:routetheme:${stopIndex}:${routeId}`);
  const arc = arcForDistance(reachedDistance);
  const first = pickTheme(rng, arc);
  if (!avoid || !avoid.has(first.archetype)) return first;
  const cands = themesForArc(arc).filter((t) => !avoid.has(t.archetype));
  return cands.length > 0 ? pickThemeFrom(rng, cands) : first;
}

/** The course awaiting the player at the current stop (shaped by the run format + theme). */
export function currentCourse(run: Run): Course {
  const spec = stopSpecFor(getFormat(run.formatId), run.stopIndex);
  const theme = currentTheme(run);
  // The chosen journey route (GS-journey-fx) makes the world it flew into wilder/gentler AND brings an
  // atmospheric effect — both derived from the CURRENT stop's pending event (already round-tripped on
  // resume), so no new run/save state. Stop 0 / no event ⇒ boost 0, effect 'none' (byte-for-byte old).
  const wildnessBoost = routeDifficulty(run.pendingEvent);
  const effect = routeEffect(run.pendingEvent);
  // GS-variation: a split-biome stop CROSSES TWO WORLDS — the front holes are this stop's theme, the
  // back holes a different theme of the same arc. Each half is generated independently and stitched,
  // every hole stamped with its own biome/themeId so it renders + plays as its world.
  if (spec.splitBiome && spec.holes >= 2) {
    return applyEffectWind(stitchSplitCourse(run, spec.holes, spec.parCap, theme, wildnessBoost, effect), effect);
  }
  return applyEffectWind(
    generateCourse(stopSeed(run), {
      holes: spec.holes,
      parCap: spec.parCap,
      distanceFromStart: run.distanceFromStart,
      // The theme resolves to a rarity-tiered, flavoured biome (GS-17b) and tags the course (GS-17).
      biomeRow: resolveBiome(theme),
      themeId: theme.id,
      wildnessBoost,
      effect,
    }),
    effect,
  );
}

/**
 * The course effect's one physics hook (GS-journey-variety): scale every hole's generated wind by
 * `effectWindMult`, clamped to the generator's own max band — a PURE post-generation transform (no
 * rng, no geometry), so `validateFairness`/`validateCrossings` are untouched and auto ≡ interactive
 * holds by construction (the transformed speed IS `hole.wind`, read by HUD, renderer, AI and sim
 * alike). A neutral effect returns the course object UNCHANGED (byte-for-byte the old path).
 */
function applyEffectWind(course: Course, effect: string): Course {
  const mult = effectWindMult(effect);
  if (mult === 1) return course;
  return {
    ...course,
    holes: course.holes.map((h) =>
      h.wind ? { ...h, wind: { ...h.wind, spd: Math.min(EFFECT_WIND_CAP, Math.max(0, h.wind.spd * mult)) } } : h,
    ),
  };
}

/** Stamp every hole of a course with its biome/theme render keys (GS-variation). Pure. */
function stampHoles(course: Course): Course {
  return { ...course, holes: course.holes.map((h) => ({ ...h, biome: course.biome, themeId: course.meta.themeId })) };
}

/**
 * Build a two-world stop (GS-variation): front holes from `themeA`, back holes from a DISTINCT theme
 * of the same arc, concatenated into one Course. Holes carry their own biome/themeId so both renderer
 * and per-hole physics (biomeMods) read the right world. Deterministic from the run + stop. The
 * course's top-level identity is the front theme (the card leads with it); `meta.split` flags it.
 */
function stitchSplitCourse(
  run: Run,
  holes: number,
  parCap: StopSpec['parCap'],
  themeA: Theme,
  wildnessBoost = 0,
  effect = 'none',
): Course {
  const front = Math.ceil(holes / 2);
  const back = holes - front;
  const arc = arcForDistance(run.distanceFromStart);
  // A second, distinct theme of the same arc — distinct by ARCHETYPE, not just id (GS-journey-variety),
  // so the two halves read as two visibly different worlds: a colliding draw is replaced by one
  // rarity-weighted redraw over the arc pool minus the front archetype (arcs have ≥7 archetypes).
  const pick = new Rng(`${run.seed}:split:${run.stopIndex}`);
  let themeB = pickTheme(pick, arc);
  if (themeB.archetype === themeA.archetype) {
    const cands = themesForArc(arc).filter((t) => t.archetype !== themeA.archetype);
    if (cands.length > 0) themeB = pickThemeFrom(pick, cands);
  }
  const a = stampHoles(
    generateCourse(`${stopSeed(run)}:front`, {
      holes: front,
      parCap,
      distanceFromStart: run.distanceFromStart,
      biomeRow: resolveBiome(themeA),
      themeId: themeA.id,
      wildnessBoost,
      effect,
    }),
  );
  const b = stampHoles(
    generateCourse(`${stopSeed(run)}:back`, {
      holes: back,
      parCap,
      distanceFromStart: run.distanceFromStart,
      biomeRow: resolveBiome(themeB),
      themeId: themeB.id,
      wildnessBoost,
      effect,
    }),
  );
  return {
    ...a,
    holes: [...a.holes, ...b.holes],
    // Lead with the front theme's identity; flag the split + record the back theme for the UI.
    meta: { ...a.meta, themeId: themeA.id, split: { backThemeId: themeB.id, frontHoles: front } },
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
  opts: { matchWon?: boolean } = {},
): { run: Run; result: StopResult } {
  const totals = playTotals(played.map((p) => p.record));
  // The pending route event shifts this stop's cut + payout (GS-14); neutral if none.
  const event = run.pendingEvent ?? DEFAULT_EVENT;
  const cut = effectiveCut(run, course.holes.length);
  const format = getFormat(run.formatId);
  const isBossStop = !!bossAt(format, run.stopIndex);
  // Survival rule (GS-positional-cut): a WINNABLE campaign (the voyage) is a FIELD competition — you
  // survive an ordinary stop by finishing in the TOP-N of the arc leaderboard (top 18, then top 16),
  // not by clearing an abstract Stableford line, so the leaderboard is what decides your fate. The boss
  // stop passes on the DUEL (matchWon). Endless formats (flat/ladder) keep the Stableford cut.
  const passed =
    opts.matchWon !== undefined
      ? opts.matchWon
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

  const next: Run = {
    ...run,
    loadout,
    credits: run.credits + creditsEarned,
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
  const make = (stopIndex: number, themeId: string | undefined, biome: string, holeCount: number, playerSF: number): ArcStopSlice => ({
    stopIndex,
    themeId,
    archetype: archetypeFor(themeId, biome),
    holeCount,
    playerSF,
    isBoss: !!bossAt(format, stopIndex),
    target: arcSurvivorTarget(stopIndex, ascCut),
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

/** The player's `playHole`/`playCourse` options from their loadout — shared by the auto sim and the
 *  matchplay duel so the player's own ball plays identically with or without a boss alongside. */
export function playerHoleOpts(run: Run): PlayHoleOptions {
  return {
    bag: run.loadout.bag,
    dispersionMult: netDispersion(run.loadout),
    shotMods: characterShotMods(run.loadout.characterId),
    shapeMod: run.loadout.shapeMod,
    minCarryBoost: run.loadout.minCarryBoost,
    wedgeWindow: run.loadout.wedgeWindow,
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
    scramble: scrambleOptsFor(run),
  };
}

export function playStop(run: Run): { run: Run; result: StopResult; played: PlayedHole[] } {
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
        )
      : playMatchStop(
          course.holes,
          playerHoleOpts(run),
          oppId,
          new Rng(`${course.seed}:play`),
          new Rng(`${course.seed}:boss`),
          homeEdge,
        );
    const { run: next, result } = finishStop(run, course, stop.player, { matchWon: stop.state.playerAdvances });
    return { run: next, result, played: stop.player };
  }
  const rng = new Rng(`${course.seed}:play`);
  const played = playCourse(course.holes, rng, playerHoleOpts(run));
  const { run: next, result } = finishStop(run, course, played);
  return { run: next, result, played };
}

/**
 * The bare event-ids a given stop's route draw produces — mirrors `routeOptions`'s draw order (3
 * distance rolls, then the arc event draw) so it can be recomputed for a PAST stop. Used only for
 * anti-repeat; pure and deterministic. (Uses the run's CURRENT firedEventIds, a harmless arc-3-only
 * approximation, since uniques don't gate arcs 1–2 where the small pool makes repeats most visible.)
 */
function offerEventIds(run: Run, stopIndex: number, distanceFromStart: number): string[] {
  const rng = new Rng(`${run.seed}:routes:${stopIndex}`);
  const maxJump = getFormat(run.formatId).maxJump ?? 3;
  for (let i = 0; i < 3; i++) rng.int(1, maxJump);
  const arc = arcForDistance(distanceFromStart);
  const pool = eventPool(distanceFromStart, run.firedEventIds);
  return drawArcRouteEvents(rng, arc, pool).map((e) => e.id);
}

/** The onward routes offered after a stop. Deterministic from the run + stop. */
export function routeOptions(run: Run): Route[] {
  const rng = new Rng(`${run.seed}:routes:${run.stopIndex}`);
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
    const theme = routeTheme(run.seed, run.stopIndex, r.id, run.distanceFromStart + r.distanceJump, avoid);
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

/** Travel a chosen route to the next stop (deeper = harder, better rewards). */
export function travel(run: Run, route: Route): Run {
  if (run.status !== 'active') throw new Error('travel: run is not active');
  const ev = route.event;
  // GS-routes levers paid at the moment of choosing the lane: a credit TOLL bites up front (floored
  // so it never strands you below zero), a SHARD bonus is banked now (kept even on a later bust).
  const toll = Math.max(0, ev.creditToll ?? 0);
  const shardBonus = Math.max(0, ev.shardBonus ?? 0);
  return {
    ...run,
    stopIndex: run.stopIndex + 1,
    distanceFromStart: run.distanceFromStart + route.distanceJump,
    credits: Math.max(0, run.credits - toll),
    bonusShards: run.bonusShards + shardBonus,
    // Carry the chosen route's event into the next stop (applied by finishStop).
    pendingEvent: ev,
    // Carry the chosen lane's WORLD into the next stop (GS-journey-biome) — the biome you arrive in is
    // the one the route previewed, not an unrelated re-draw.
    pendingTheme: route.theme,
    // A unique one-off is now spent for the rest of the run (GS-17c).
    firedEventIds: ev.unique ? [...run.firedEventIds, ev.id] : run.firedEventIds,
  };
}

/**
 * Buy a shop item. Uniques are buyable once; stackables repeatedly at a rising price up
 * to their cap. No-op (returns the same run) if at the cap or unaffordable at the next
 * price — the offer constraint is a UI concern, so the headless sim can buy any item.
 */
export function buy(run: Run, itemId: string): Run {
  const item = shopItem(itemId);
  if (!item) return run;
  const owned = ownedCount(run.loadout.perks, itemId);
  if (!canBuy(item, owned, run.credits)) return run;
  // Named caddies are mutually exclusive (GS-caddy): you may hire only one. A second is a no-op.
  if (item.caddy === 'named') {
    const have = namedCaddyOwned(run.loadout.perks);
    if (have && have !== itemId) return run;
  }
  const cost = itemCost(item, owned);
  return { ...run, credits: run.credits - cost, loadout: item.apply(run.loadout) };
}

// --- Shop offer (the rotating outfitter stock) ------------------------------

export interface ShopOffer {
  item: ShopItem;
  /** Price of the next copy right now. */
  cost: number;
  /** Copies already owned (stack depth; 0 or 1 for a unique). */
  owned: number;
}

export const SHOP_OFFER_SIZE = 4;

// Rarity RAMPS with the voyage (GS-proshop). The catalogue is count-skewed toward rare/epic, so a
// flat rarity-weighted draw showed lots of rare/epic up front and only dribbled commons in later as
// the rare/epic uniques sold out — exactly backwards from how loot should feel. Now each rarity's
// base drop weight (RARITY_C) is multiplied by `b^order`, where `b` lerps from <1 EARLY (commons-
// heavy foundational kit, epics/legendaries scarce) to >1 DEEP (rare/epic/legendary power), keyed
// off galaxy distance — the same depth signal the cut line ramps off. This shifts WHICH items are
// drawn, not the rng draw count, so the offer stays deterministic and resume-stable.
const RARITY_RAMP_DEPTH = 18; // galaxy distance at which the rarity tilt reaches its deep extreme
const RARITY_TILT_EARLY = 0.22; // tilt base at the start — strongly favours commons so the FIRST/SECOND Pro Shops stock foundational common/rare kit, not rare/epic. The catalogue + reward-club pool is heavily count-skewed toward rare/epic, so a low tilt is needed to keep the early draw common-dominant (measured ~61% common / 37% rare / 2% epic at stop 0, ramping to rare/epic-heavy deep).
const RARITY_TILT_DEEP = 2.15; // tilt base deep in the run — favours rare/epic/legendary (raised to surface more epic/legendary rewards)

/**
 * Depth-scaled rarity multiplier for the shop draw (early → commons, deep → rare/epic). Used by the
 * ENDLESS formats (flat/ladder), which climb toward the deep extreme as galaxy distance grows.
 */
export function rarityDepthBias(rarity: Rarity, distanceFromStart: number): number {
  const p = Math.max(0, Math.min(1, distanceFromStart / RARITY_RAMP_DEPTH));
  const b = RARITY_TILT_EARLY + (RARITY_TILT_DEEP - RARITY_TILT_EARLY) * p;
  return Math.pow(b, RARITY_C[rarity].order);
}

// The VOYAGE rarity schedule (GS-voyage-rarity). The bounded voyage is only ~8 shops long and never
// reaches the endless ramp's deep distance, so keying its rarity off raw galaxy distance left the last
// shop stuck around blue-heavy / 18% epic / 6% legendary — legendaries barely showed. Instead the
// voyage runs its OWN progress curve keyed off the STOP (the arc/boss structure the player actually
// reads), so the mix scales the way the campaign is paced:
//   • shop 1 (stop 0)         → mostly GREEN with a BLUE; epics/legendaries essentially absent.
//   • between boss 1 & 2 (2–4) → a SMALL chance of purple AND the first orange.
//   • after boss 2 (5–7)       → a HIGHER chance, ending "halfish blue / halfish purple with a shot at
//                                a legendary" at the final pre-boss shop.
// Two knobs give independent control the single `b^order` couples away: `b` lerps the rare/epic base,
// and `legTilt` gates the legendary tail separately so it stays a real rarity (a taste between the
// bosses, a genuine chance — not a flood — at the end). Bosses sit at stops 2 & 5, so the curve is
// sampled at those thresholds by design. Byte-for-byte irrelevant to the endless formats (they never
// call this) and to determinism (it reweights WHICH item is drawn, never the rng draw COUNT).
const VOYAGE_TILT_EARLY = 0.16; // rare/epic base at the first shop — strong commons bias (mostly green + a blue)
const VOYAGE_TILT_DEEP = 3.2; // rare/epic base at the last pre-boss shop — halfish blue / halfish purple
const VOYAGE_LEG_EARLY = 0.0; // legendary tail multiplier at the start — no legendaries in the opening shops
const VOYAGE_LEG_DEEP = 0.62; // legendary tail multiplier deep — a real (bounded) shot at orange late, not a flood
const VOYAGE_TILT_EASE = 1.5; // ease-in on the rare/epic ramp so arc 1 stays green/blue and purple opens after boss 1
const VOYAGE_LEG_OPEN = 0.12; // voyage progress at which the legendary tail starts opening (just after boss 1 / stop 2)

/**
 * Rarity multiplier for a VOYAGE shop draw, keyed off the stop (arc/boss pacing) rather than galaxy
 * distance. `progress` is 0 at the first shop → 1 at the final pre-boss shop. Commons stay flat (×1);
 * rare/epic ramp on `b^order`; the legendary tail rides a SEPARATE, later-opening multiplier so it
 * only tastes in around boss 1 and reaches a genuine (bounded) chance by the end.
 */
export function voyageRarityBias(rarity: Rarity, progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  const order = RARITY_C[rarity].order;
  if (order === 0) return 1; // commons flat
  const eased = Math.pow(p, VOYAGE_TILT_EASE);
  const b = VOYAGE_TILT_EARLY + (VOYAGE_TILT_DEEP - VOYAGE_TILT_EARLY) * eased;
  const base = Math.pow(b, order);
  if (rarity !== 'legendary') return base;
  // Legendary rides the rare/epic ramp PLUS its own tail gate: 0 until `VOYAGE_LEG_OPEN`, then lerps
  // up to VOYAGE_LEG_DEEP so orange opens around boss 1 and peaks (bounded) at the final shop.
  const lp = Math.max(0, Math.min(1, (p - VOYAGE_LEG_OPEN) / (1 - VOYAGE_LEG_OPEN)));
  return base * (VOYAGE_LEG_EARLY + (VOYAGE_LEG_DEEP - VOYAGE_LEG_EARLY) * lp);
}

/** Voyage shop progress 0..1 keyed off the stop — 0 at the first shop, 1 at the final pre-boss shop. */
export function voyageShopProgress(stopIndex: number, stops: number): number {
  // Shops sit at stops 0..(stops-2); the final stop is the boss with no shop after it.
  const lastShop = Math.max(1, stops - 2);
  return Math.max(0, Math.min(1, stopIndex / lastShop));
}

/**
 * The rarity multiplier the shop draw applies for THIS run. A winnable voyage uses its own stop-keyed
 * schedule (`voyageRarityBias`); the endless formats keep the galaxy-distance ramp (`rarityDepthBias`).
 */
export function shopRarityBias(run: Run, rarity: Rarity): number {
  const format = getFormat(run.formatId);
  if (format.winnable) {
    return voyageRarityBias(rarity, voyageShopProgress(run.stopIndex, stopCount(format)));
  }
  return rarityDepthBias(rarity, run.distanceFromStart);
}

/**
 * Weighted draw of `n` distinct items (rarer = less likely), without replacement. An optional
 * `weight` multiplier per item lets the active theme bias the offer toward on-theme gear (GS-17d).
 */
function weightedSample(
  rng: Rng,
  items: readonly ShopItem[],
  n: number,
  weight: (it: ShopItem) => number = () => 1,
): ShopItem[] {
  const pool = [...items];
  const out: ShopItem[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((s, it) => s + RARITY_C[it.rarity].weight * weight(it), 0);
    let r = rng.float() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= RARITY_C[pool[idx]!.rarity].weight * weight(pool[idx]!);
      if (r <= 0) break;
    }
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

/**
 * The outfitter's stock at the current stop: a seeded, rarity-weighted subset of the
 * catalogue. Deterministic from the run seed + stop, so the same run shows the same shop
 * (and a resume reproduces it). Items already maxed (owned uniques / capped stackables)
 * drop out, so every slot is something you can still pursue. Costs reflect current stacks.
 */
export function shopOffer(run: Run, size = SHOP_OFFER_SIZE, salt = 0): ShopOffer[] {
  const perks = run.loadout.perks;
  const hasCaddy = !!namedCaddyOwned(perks);
  // Driver Dan (GS-clubs) only turns up once the golfer actually OWNS a driver. Everyone now starts
  // with one (the balanced bag), so he's eligible from the off; he still only appears at his epic
  // rarity in the rotation, so owning a driver is a gate, not a guaranteed early show.
  const ownsDriver = run.loadout.bag.some((c) => c.id === DRIVER_ID);
  // Hide maxed items, gate prereq tier-ladders, and handle caddies (GS-caddy): named caddies are
  // random rarity-weighted inclusions UNTIL you hire one, after which NO named caddy appears again;
  // generic caddy 'service' perks only surface once a named caddy has been hired.
  const gear = SHOP_ITEMS.filter(
    (it) =>
      ownedCount(perks, it.id) < itemCap(it) &&
      (!it.prereq || perks.includes(it.prereq)) &&
      (it.caddy !== 'named' || !hasCaddy) &&
      (it.caddy !== 'service' || hasCaddy) &&
      (it.id !== 'driver-dan' || ownsDriver),
  );
  // Reward CLUBS (GS-clubs-2) share the SAME 4-card offer now — no separate row. They're rare+
  // improvements (a distance upgrade, or a new club that fills a gap in the balanced bag), drawn
  // from the same rarity-weighted pool as the gear so they're appropriately scarce.
  const pool = [...gear, ...offerableClubs(run.loadout)];
  // A reroll (GS-shop-reroll) salts the seed so the draw changes; salt 0 keeps the original stock
  // byte-for-byte (so existing tests + a fresh shop entry are unchanged).
  const rng = new Rng(salt ? `${run.seed}:shop:${run.stopIndex}:r${salt}` : `${run.seed}:shop:${run.stopIndex}`);
  // The current stop's theme biases the outfitter toward on-theme gear (GS-17d), and the rarity mix
  // RAMPS with galaxy distance (GS-proshop): commons early, rare/epic/legendary deep.
  const archetype = currentTheme(run).archetype;
  const weight = (it: ShopItem) =>
    itemThemeWeight(itemTags(it.id), archetype) * shopRarityBias(run, it.rarity);
  return weightedSample(rng, pool, Math.min(size, pool.length), weight).map((item) => {
    const owned = ownedCount(perks, item.id);
    return { item, cost: itemCost(item, owned), owned };
  });
}

/** Voluntarily bank the run (cash out) — ends it with reason 'banked'. */
export function bank(run: Run): Run {
  return { ...run, status: 'ended', endedReason: 'banked' };
}

// --- Serialisation (for the save layer) -------------------------------------

export interface RunSnapshot {
  seed: number;
  /** Run format id (optional for back-compat with v1-era snapshots → flat). */
  formatId?: string;
  stopIndex: number;
  distanceFromStart: number;
  credits: number;
  /** Owned perks; the loadout is rebuilt from these (over the meta base) on resume. */
  perks: string[];
  /** Permanent meta-upgrade levels (GS-12); the resume base is rebuilt from these. */
  meta?: MetaUpgrades;
  /** Ascension difficulty tier (GS-ascension); 0/absent for back-compat. */
  ascension?: number;
  /** Permanent default-bag tier (GS-bag-tiers), so a resume rebuilds the upgraded starting bag.
   *  Absent ⇒ the un-upgraded common bag (old snapshots). */
  bagTier?: BagTier;
  /** The character's ascension-victory club unlocks (GS-ascension-clubs), so a resume rebuilds the
   *  grown starting bag. Absent ⇒ none (old snapshots / a fresh roster). */
  unlockedClubs?: string[];
  /** The pending route event id (GS-14), so a resume mid-jump keeps the stop's modifier. */
  pendingEventId?: string;
  /** The pending destination-world theme id (GS-journey-biome), so a resume keeps the stop's biome.
   *  Absent on an old snapshot → `currentTheme` falls back to the deterministic draw. */
  pendingThemeId?: string;
  /** Permanent shards banked mid-run by route events (GS-routes); 0/absent for back-compat. */
  bonusShards?: number;
  /** Unique one-off event ids already fired (GS-17c), so a resume can't re-offer them. */
  firedEventIds?: string[];
  /** The selected golfer (GS-18) — re-applied to the loadout on resume. */
  characterId?: string;
}

export function snapshotRun(run: Run): RunSnapshot {
  return {
    seed: run.seed,
    formatId: run.formatId,
    stopIndex: run.stopIndex,
    distanceFromStart: run.distanceFromStart,
    credits: run.credits,
    perks: [...run.loadout.perks],
    meta: { ...run.meta },
    ascension: run.ascension,
    bagTier: run.bagTier,
    unlockedClubs: run.unlockedClubs ? [...run.unlockedClubs] : undefined,
    pendingEventId: run.pendingEvent?.id,
    pendingThemeId: run.pendingTheme?.id,
    bonusShards: run.bonusShards,
    firedEventIds: [...run.firedEventIds],
    characterId: run.loadout.characterId,
  };
}

export function resumeRun(snap: RunSnapshot): Run {
  const meta = snap.meta ?? {};
  const bagTier = snap.bagTier ?? DEFAULT_BAG_TIER;
  return {
    seed: snap.seed,
    formatId: snap.formatId ?? DEFAULT_FORMAT,
    stopIndex: snap.stopIndex,
    distanceFromStart: snap.distanceFromStart,
    credits: snap.credits,
    // Perks (incl. reward clubs, GS-clubs) sit on top of the golfer+meta+bag-tier starting loadout,
    // rebuilt the SAME way `startRun` builds it, so the bag (upgraded starting clubs + bought clubs)
    // reconstructs identically.
    loadout: loadoutFromPerks(
      snap.perks ?? [],
      startingLoadoutFor(meta, snap.characterId, bagTier, snap.unlockedClubs ?? []),
    ),
    meta,
    ascension: snap.ascension ?? 0,
    bagTier,
    unlockedClubs: snap.unlockedClubs ? [...snap.unlockedClubs] : [],
    pendingEvent: snap.pendingEventId ? routeEvent(snap.pendingEventId) : undefined,
    pendingTheme: snap.pendingThemeId ? themeById(snap.pendingThemeId) : undefined,
    bonusShards: snap.bonusShards ?? 0,
    firedEventIds: snap.firedEventIds ? [...snap.firedEventIds] : [],
    status: 'active',
    history: [],
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
  const keepsCredits = run.endedReason === 'banked' || run.endedReason === 'won';
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
  /** Run format id; default = the engine default ('flat'). */
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
    const route = strategy.pickRoute?.(run, routes) ?? routes[0]!;
    run = travel(run, route);
  }
  return { run, stops };
}
