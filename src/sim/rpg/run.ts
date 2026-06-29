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
  canBuy,
  creditsForStop,
  cutLine,
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
import { DEFAULT_FORMAT, bossAt, getFormat, isFinalStop, isMatchplayBoss, stopSpecFor, type BossSpec, type StopSpec } from './formats';
import { playMatchStop } from './match';
import { applyMeta, metaStartingCredits, type MetaUpgrades } from './meta';
import { applyCharacter, characterShotMods, scramblePartnerId } from './characters';
import type { ScrambleOpts } from '../round';
import { DEFAULT_EVENT, drawArcRouteEvents, eventPool, routeEvent, type RouteEvent } from './events';
import { themeForStop, resolveBiome, itemThemeWeight, pickTheme, arcForDistance, archetypeFor, type Theme } from '../course/themes';
import { buildField, arcCut, arcIndexOf, arcSurvivorTarget, bossOpponentFor, type ArcStopSlice, type Field, type PlayerInfo } from './competition';

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
}

export interface Route {
  id: number;
  /** How far this route jumps (adds to distanceFromStart → scales difficulty). */
  distanceJump: number;
  label: string;
  /** The risk/reward event waiting at the stop this route reaches (GS-14). */
  event: RouteEvent;
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
  /**
   * The route event applied to the CURRENT stop (GS-14) — set by `travel`, consumed (and
   * cleared) by `finishStop`. Absent at stop 0 / after scoring → the neutral DEFAULT_EVENT.
   */
  pendingEvent?: RouteEvent;
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
export function startingLoadoutFor(meta: MetaUpgrades, characterId?: string): PlayerLoadout {
  return applyMeta(meta, applyCharacter(characterId, startingLoadout()));
}

/** Ascension ladder (GS-ascension): a fixed-length campaign gets harder above the base difficulty,
 *  unlocked one tier at a time by winning. Each level adds a flat per-stop cut and thins the purse. */
export const ASCENSION_MAX = 8;
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
    // thins the starting purse (floored so it never strands you with nothing).
    credits: Math.max(20, metaStartingCredits(meta) - ascensionCreditPenalty(asc)),
    loadout: startingLoadoutFor(meta, characterId),
    meta,
    ascension: asc,
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

/** The star-travel theme the current stop flies into (GS-17). Deterministic from the run. */
export function currentTheme(run: Run) {
  return themeForStop(run.seed, run.stopIndex, run.distanceFromStart);
}

/** The course awaiting the player at the current stop (shaped by the run format + theme). */
export function currentCourse(run: Run): Course {
  const spec = stopSpecFor(getFormat(run.formatId), run.stopIndex);
  const theme = currentTheme(run);
  // GS-variation: a split-biome stop CROSSES TWO WORLDS — the front holes are this stop's theme, the
  // back holes a different theme of the same arc. Each half is generated independently and stitched,
  // every hole stamped with its own biome/themeId so it renders + plays as its world.
  if (spec.splitBiome && spec.holes >= 2) {
    return stitchSplitCourse(run, spec.holes, spec.parCap, theme);
  }
  return generateCourse(stopSeed(run), {
    holes: spec.holes,
    parCap: spec.parCap,
    distanceFromStart: run.distanceFromStart,
    // The theme resolves to a rarity-tiered, flavoured biome (GS-17b) and tags the course (GS-17).
    biomeRow: resolveBiome(theme),
    themeId: theme.id,
  });
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
function stitchSplitCourse(run: Run, holes: number, parCap: StopSpec['parCap'], themeA: Theme): Course {
  const front = Math.ceil(holes / 2);
  const back = holes - front;
  const arc = arcForDistance(run.distanceFromStart);
  // A second, distinct theme of the same arc (re-draw until it differs; arcs have ≥9 themes).
  const pick = new Rng(`${run.seed}:split:${run.stopIndex}`);
  let themeB = pickTheme(pick, arc);
  for (let i = 0; i < 6 && themeB.id === themeA.id; i++) themeB = pickTheme(pick, arc);
  const a = stampHoles(
    generateCourse(`${stopSeed(run)}:front`, {
      holes: front,
      parCap,
      distanceFromStart: run.distanceFromStart,
      biomeRow: resolveBiome(themeA),
      themeId: themeA.id,
    }),
  );
  const b = stampHoles(
    generateCourse(`${stopSeed(run)}:back`, {
      holes: back,
      parCap,
      distanceFromStart: run.distanceFromStart,
      biomeRow: resolveBiome(themeB),
      themeId: themeB.id,
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
  const creditsEarned = passed
    ? creditsForStop(totals.stableford, run.loadout.creditMult * event.creditMult, relicBonus)
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
  };

  const next: Run = {
    ...run,
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

/** The arc field used for the positional cut (same golfers/scores as league's display field). */
function survivalField(run: Run): Field {
  const info: PlayerInfo = { name: 'You', look: SURVIVAL_LOOK, characterId: run.loadout.characterId };
  return buildField(run.seed, arcIndexOf(run.stopIndex), arcForDistance(run.distanceFromStart), info);
}

/**
 * Build the current arc's stop slices for the positional cut: the completed arc stops (from history) plus
 * an optional CURRENT stop (the one being scored, not yet in history). Each slice carries the survivor
 * target (top-N advance) for an ordinary stop. Exported so league.ts reuses the SAME builder.
 */
export function arcSlices(
  run: Run,
  current?: { themeId?: string; biome: string; holeCount: number; playerSF: number },
): ArcStopSlice[] {
  const format = getFormat(run.formatId);
  const arcIdx = arcIndexOf(run.stopIndex);
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
    if (arcIndexOf(h.stopIndex) !== arcIdx) continue;
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
 * Scramble options for the current stop (GS-scramble): a co-op partner's swing shape when the stop is
 * a `partner: 'scramble'` boss, else undefined (ordinary solo play). The partner is a deterministic
 * unchosen golfer; threaded IDENTICALLY into the auto sim (playStop) and the interactive driver so
 * auto≡interactive holds. Pure.
 */
export function scrambleOptsFor(run: Run): ScrambleOpts | undefined {
  const boss = currentBoss(run);
  if (boss?.partner !== 'scramble') return undefined;
  const partnerId = scramblePartnerId(run.seed, run.stopIndex, run.loadout.characterId);
  return { partnerMods: characterShotMods(partnerId) };
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
    const oppId = matchOpponentForRun(run) ?? '';
    const stop = playMatchStop(
      course.holes,
      playerHoleOpts(run),
      oppId,
      new Rng(`${course.seed}:play`),
      new Rng(`${course.seed}:boss`),
    );
    const { run: next, result } = finishStop(run, course, stop.player, { matchWon: stop.state.playerAdvances });
    return { run: next, result, played: stop.player };
  }
  const rng = new Rng(`${course.seed}:play`);
  const played = playCourse(course.holes, rng, playerHoleOpts(run));
  const { run: next, result } = finishStop(run, course, played);
  return { run: next, result, played };
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
  const pool = eventPool(run.distanceFromStart, run.firedEventIds);
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
  return withEvents.map((r, i) => ({
    ...r,
    elite: i === eliteIdx,
    // Preview whether the stop this route reaches (the next stop) is a boss.
    bossAhead: !!bossAt(format, run.stopIndex + 1),
  }));
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
const RARITY_TILT_EARLY = 0.5; // tilt base at the start — strongly favours commons
const RARITY_TILT_DEEP = 1.9; // tilt base deep in the run — favours rare/epic/legendary

/** Depth-scaled rarity multiplier for the shop draw (early → commons, deep → rare/epic). */
export function rarityDepthBias(rarity: Rarity, distanceFromStart: number): number {
  const p = Math.max(0, Math.min(1, distanceFromStart / RARITY_RAMP_DEPTH));
  const b = RARITY_TILT_EARLY + (RARITY_TILT_DEEP - RARITY_TILT_EARLY) * p;
  return Math.pow(b, RARITY_C[rarity].order);
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
    itemThemeWeight(itemTags(it.id), archetype) * rarityDepthBias(it.rarity, run.distanceFromStart);
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
  /** The pending route event id (GS-14), so a resume mid-jump keeps the stop's modifier. */
  pendingEventId?: string;
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
    pendingEventId: run.pendingEvent?.id,
    bonusShards: run.bonusShards,
    firedEventIds: [...run.firedEventIds],
    characterId: run.loadout.characterId,
  };
}

export function resumeRun(snap: RunSnapshot): Run {
  const meta = snap.meta ?? {};
  return {
    seed: snap.seed,
    formatId: snap.formatId ?? DEFAULT_FORMAT,
    stopIndex: snap.stopIndex,
    distanceFromStart: snap.distanceFromStart,
    credits: snap.credits,
    // Perks (incl. reward clubs, GS-clubs) sit on top of the golfer+meta starting loadout, rebuilt the
    // SAME way `startRun` builds it, so the bag (starting clubs + bought/upgraded clubs) reconstructs.
    loadout: loadoutFromPerks(snap.perks ?? [], startingLoadoutFor(meta, snap.characterId)),
    meta,
    ascension: snap.ascension ?? 0,
    pendingEvent: snap.pendingEventId ? routeEvent(snap.pendingEventId) : undefined,
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
  let run = startRun(seed, strategy.formatId, strategy.meta, strategy.characterId, strategy.ascension);
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
