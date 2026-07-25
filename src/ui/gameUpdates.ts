/**
 * Shared reducer HELPERS + meta-progression UPDATES (extracted from game.ts, GS-refactor-split).
 *
 * The pure functions the `reduce` switch leans on but that aren't themselves action handlers: the
 * best-ball partner / trade-tent reaction layering, the four run-end / endless / ace update bags every
 * stop-scoring site shares, the boss-reward offer, and the whole Asgard-interlude cluster (portal
 * trigger, field scaling, tournament resolution). Byte-for-byte identical to when these lived in
 * game.ts — a pure move; game.ts re-exports the public ones (`runEndUpdates`, `endlessProgressUpdates`,
 * `asgardPortalOpens`, `asgardFieldEdge`) so existing importers/tests are unchanged.
 */

import type { PlayedHole } from '../sim/round';
import { playHole } from '../sim/round';
import {
  ASCENSION_MAX,
  bossRewards,
  currentBoss,
  holeGateArmed,
  playerHoleOpts,
  shardsForRun,
  snapshotRun,
  type BossReward,
  type Run,
  type StopResult,
} from '../sim/rpg/run';
import { addEndlessRecord, endlessUnlocksCrossed } from '../sim/rpg/endless';
import { addStrokeRecord, isNewCourseRecord, type StrokePlayRecord } from '../sim/rpg/strokePlay';
import { playTotals } from '../sim/score';
import { archetypeFor } from '../sim/course/themes';
import { namedCaddyOwned } from '../sim/rpg/economy';
import { pickLoreEvent, type LoreContext } from '../sim/rpg/lore';
import { ASGARD_FORMAT } from '../sim/rpg/formats';
import { matchOpponentFor, runField } from '../sim/rpg/league';
import { warriorsThreeTotals, warriorsEdge } from '../sim/rpg/competition';
import { ascensionClubReward } from '../sim/rpg/club-unlock';
import { aceShipUnlock } from '../sim/rpg/ships';
import {
  completeStoryRound,
  PROLOGUE_COURSE_ID,
  storyRoundCredits,
  storyWorldChapter,
  worldCleared,
  defaultStoryState,
  recordWorldClear,
  equipStoryClub,
  storyRewardSetIds,
  setSigilPartner,
  STORY_CHAPTER_COUNT,
} from '../sim/rpg/story';
import { shipCreditMult, grantStoryAceShip, grantStoryShip } from '../sim/rpg/storyShips';
import { recordCaddyRound } from '../sim/rpg/storyCaddies';
import { upgradeCreditMult, grantShipUpgrade } from '../sim/rpg/storyShipUpgrades';
import { storyGearCreditMult } from '../sim/rpg/storyGear';
import { tournamentForChapter, tournamentRival, sigilMatchThrough, rivalTotal, tournamentField, tournamentLeaderboard, winTournament, SIGIL_WIN_BONUS, isLiveStoryQualifier, chapterQualifierEvents, isTeamTournament, isSinglesMatchTournament, isTeamMatchTournament, teamFieldPairs, teamPartnerOrDefault, TEAM_PARTNER_EDGE } from '../sim/rpg/storyTournaments';
import { resolveStoryTeamStroke, opposingField } from '../sim/rpg/storyTeams';
import { qualifierField, qualifierFieldSize, qualifierPlacement, recordQualifier, recordQualifierPartner, qualifiedCount, qualifyTop, QUALIFY_EVENTS_NEEDED } from '../sim/rpg/storyQualifiers';
import { activeQualifierPlan, resolveQualifierRound, qualifierFormatName, qualifierMatchOpponents } from '../sim/rpg/storyQualifierFormats';
import { betrayerId, betrayerOddness } from '../sim/rpg/storyBetrayal';
import { storyPartnerName } from '../sim/rpg/storyPartners';
import { getCharacter } from '../sim/rpg/characters';
import type { HolePlay } from '../sim/rpg/play';
import type { MatchUi, UiState } from './gameState';

/** The matchplay opponent for a boss stop (GS-100): the leaderboard leader, or — if the arc has no
 *  scores yet (a fresh resume) — the field's top-rated non-player as a deterministic fallback. */
export function resolveBossId(run: Run): string {
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
export function withBestBallPartner(state: UiState, play: HolePlay): { play: HolePlay; match?: MatchUi } {
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
export function applyTentReactions(state: UiState, play: HolePlay): UiState {
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
export function aceUpdates(state: UiState, result: StopResult, baseOwnedShips: string[]): Partial<UiState> {
  const owned = aceShipUnlock(baseOwnedShips, result.aces);
  return {
    lifetimeAces: state.lifetimeAces + result.aces,
    ...(owned !== baseOwnedShips ? { ownedShips: owned } : {}),
  };
}

/** Boss-reward choices to offer after a stop, if it was a survived (non-final) boss win (GS-talents).
 *  Themed to the stop's zone. Undefined for an ordinary stop, a missed cut, or a run-winning final boss. */
export function bossRewardFor(run: Run, course: UiState['course'], result: StopResult): BossReward[] | undefined {
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
export function withAsgardPortal(next: UiState, run: Run, played: PlayedHole[]): UiState {
  if (next.screen === 'result' && asgardPortalOpens(run, played)) {
    return { ...next, screen: 'asgardMap', asgardReturn: snapshotRun(run) };
  }
  return next;
}

/**
 * The arrival LORE gate (GS-lore) — the generic hook that fires a one-off story beat when the player
 * reaches a stop. Wraps any "→ intro" reducer return: it reads a pure snapshot of the arrival (world,
 * caddy, golfer, format, depth) and, if an unseen event's trigger fires, diverts to the `'lore'` screen
 * (stashing the beat's id in `pendingLoreId`); `dismissLore` marks it seen and continues to the intro.
 * A no-op on any non-`'intro'` return and whenever no beat qualifies (the common path). UI/render-only —
 * it touches no sim rng, so every seeded run stays byte-identical.
 */
export function withLoreGate(next: UiState): UiState {
  if (next.screen !== 'intro') return next;
  const { run, course } = next;
  const ctx: LoreContext = {
    biome: course.biome,
    archetype: archetypeFor(course.meta?.themeId, course.biome),
    caddyId: namedCaddyOwned(run.loadout.perks),
    characterId: run.loadout.characterId,
    format: run.formatId,
    stopIndex: run.stopIndex,
    reputation: next.reputation,
    // GS-story-beats: story-round context so campaign dialogue beats can gate on chapter/path and NEVER
    // fire in Voyage/Unending. `storyRound` marks the run as a Story-Tour arrival; chapter/alignment read
    // from the live campaign save.
    storyRound: run.storyRound === true,
    storyChapter: next.story?.chapter,
    storyAlignment: next.story?.alignment,
    storyTournament: run.storyTournament != null,
    // GS-story-doubt: who the betrayal arc says will turn — lets the Ch.4 Warden foreshadow beats speak
    // in the RIGHT friend's voice (the doubt rows gate on chapter/path, so the early fallback never fires).
    ...(run.storyRound === true && next.story ? { storyBetrayerId: betrayerId(next.story) } : {}),
    // GS-story-heard-the-word: why the betrayer is the odd one out, so the Herald "I heard it too" beat
    // pays off exactly the tempted (trusted-twice) friend the mid-round omen showed hearing the word.
    ...(run.storyRound === true && next.story ? (() => { const o = betrayerOddness(next.story); return o ? { storyBetrayerOddness: o } : {}; })() : {}),
  };
  const event = pickLoreEvent(ctx, next.seenLore);
  return event ? { ...next, screen: 'lore', pendingLoreId: event.id } : next;
}

/**
 * The Warrior's Tee's per-hole SHARPENING for THIS tournament (GS-asgard-scaling): scaled off how deep
 * into the journey (the parked real run's `stopIndex` — the "upgraded clubs" proxy) and at what Ascension
 * the Bifröst was reached, so a late-run encounter with an upgraded bag stays a contest. The suspended
 * run lives in `asgardReturn`; the fresh Asgard run resets `stopIndex` to 0, so read the depth from the
 * snapshot (its ascension is the same value the Asgard run carries). Zero at a shallow, base encounter. */
export function asgardFieldEdge(state: UiState): number {
  const src = state.asgardReturn;
  // A parked run (`asgardReturn`) ⇒ the VOYAGE Bifröst — the player arrives upgraded, so the Warriors
  // sharpen off the flat voyage floor + depth/Ascension (GS-warriors-tune). No parked run ⇒ the Star
  // Tour / Yggdrasil realm — the gentle default-bag baseline (voyage = false, byte-identical edge 0).
  const voyage = !!src;
  return warriorsEdge(src?.stopIndex ?? 0, src?.ascension ?? state.run.ascension, voyage);
}

/**
 * Resolve a STAR TOUR round (GS-star-tour): the player's finished 18-hole stroke-play round on a pinned
 * static course, banked into the personal course-record leaderboards. Scored on total gross (via
 * `playTotals`), ranked by to-par into `strokePlayBest` (a per-course best map, so a course's all-time
 * record is never lost). A hole-in-one still counts toward the lifetime ace tally + the Comet Rider ship
 * (like every other mode). The single stop IS the whole run, so the run ends here (endedReason 'banked')
 * and the player lands on the strokeResult recap — never the Stableford-cut/travel flow. Records only:
 * no shard payout, no Ascension/club unlock (those are the campaign's rewards).
 */
export function resolveStrokePlay(state: UiState, played: PlayedHole[]): UiState {
  const run = state.run;
  const totals = playTotals(played.map((p) => p.record));
  const record: StrokePlayRecord = {
    courseId: run.staticCourseId ?? 'unknown',
    characterId: run.loadout.characterId ?? '',
    tier: run.bagTier ?? 'common',
    strokes: totals.gross,
    par: totals.totalPar,
    toPar: totals.toPar,
    effect: run.staticEffect ?? 'none',
    seed: run.seed,
  };
  const strokeIsRecord = isNewCourseRecord(state.strokePlayBest, record);
  const strokePlayBest = addStrokeRecord(state.strokePlayBest, record);
  // A hole-in-one is a hole holed in one stroke — still earns the lifetime ace + the secret Comet Rider.
  const aces = played.filter((p) => p.holed && p.record.strokes === 1).length;
  const ownedShips = aceShipUnlock(state.ownedShips, aces);
  return {
    ...state,
    run: { ...run, status: 'ended', endedReason: 'banked' },
    played,
    stopPlayed: undefined,
    play: undefined,
    holeRng: undefined,
    match: undefined,
    viewHole: 0,
    screen: 'strokeResult',
    strokePlayBest,
    lastStrokeRecord: record,
    strokeIsRecord,
    lifetimeAces: state.lifetimeAces + aces,
    ...(ownedShips !== state.ownedShips ? { ownedShips } : {}),
    // A finished round bumps the lounge counter so the golfers have shuffled by the time you're home.
    clubhouseVisit: state.clubhouseVisit + 1,
  };
}

/**
 * GS-story-prologue: resolve a completed Story Mode WORLD ROUND back into the campaign. Unlike Star Tour
 * (which banks a course record and lands on the record recap), a Story round records the world clear on the
 * `StoryState` — pay credits, keep the best score for the revisit chase, and advance the chapter if this was
 * the prologue (Earth) — then lands on the Story recap (`storyResult`). The campaign's ECONOMY (shards/ships)
 * is a separate progression (`gs_story`), but a hole-in-one still ticks the cross-mode lifetime ace tally
 * shown on the title (GS-story-ace-tally). The pure transition lives in `story.ts completeStoryRound`; this
 * wraps it with the round scoring + screen/state plumbing.
 */
export function resolveStoryRound(state: UiState, played: PlayedHole[]): UiState {
  const run = state.run;
  const totals = playTotals(played.map((p) => p.record));
  const courseId = run.staticCourseId ?? PROLOGUE_COURSE_ID;
  // Defensive: the hub should always have a campaign, but never crash if it's missing mid-round.
  const base = state.story ?? defaultStoryState(run.loadout.characterId ?? undefined);
  // GS-story-econ2: pay scales by the WORLD's difficulty tier (its unlock chapter) and drops to a top-up
  // on a revisit (an already-cleared world) — reward hard worlds, kill the grind-the-easiest-world loop.
  // GS-story-ships: then the equipped ship's credit multiplier (a bigger hold banks more per world clear),
  // stacked with any ENGINE upgrades' credit bonus (GS-story-ship-upgrades). `worldCleared(base, …)` reads
  // the PRE-clear state, so the first clear pays full and every re-fly pays the top-up.
  const revisit = worldCleared(base, courseId);
  const credits = Math.round(
    storyRoundCredits(totals.toPar, { chapter: storyWorldChapter(courseId), revisit }) *
      shipCreditMult(base) *
      upgradeCreditMult(base) *
      // GS-story-shop-depth: an equipped ECONOMY (bag-slot) gear item lifts the purse (default 1 → unchanged).
      storyGearCreditMult(base),
  );
  const { story: cleared, advancedChapter, wasPrologue } = completeStoryRound(
    base,
    courseId,
    { toPar: totals.toPar, strokes: totals.gross, par: totals.totalPar, seed: String(run.seed) },
    credits,
    // GS-story-quality (finding D): a quest round is 9 holes on the same world — don't overwrite the
    // world's 18-hole best (par 36 vs par 72 would corrupt the revisit chase + dossier).
    // GS-story-qualifier-match-live: nor does a PARTIAL round — a `pair-match` qualifier that closed out
    // early banked only the holes the match ran, so its card is measuring a shorter test than the record.
    !run.storyQuest && played.length >= state.course.holes.length,
  );
  // GS-story-ships: a hole-in-one on any Story round earns the secret Comet Rider (the ace ship).
  const aces = played.filter((p) => p.record.strokes === 1).length;
  const aced = aces > 0;
  let story = aced ? grantStoryAceShip(cleared) : cleared;

  // GS-story-qualifiers: a non-prologue, non-quest chapter world that ISN'T the Sigil venue is a QUALIFYING
  // EVENT — play it against a field of competitors; a top-N finish qualifies, and two qualified events unlock
  // the chapter's Galaxy Tournament. Records the best finish; the recap shows the board + progress.
  // GS-story-gather-early: a caddy-home world can be CHARTED before its tournament chapter (fly out to
  // recruit + quest the friend in time). Visiting it early is a plain exploration clear — only resolve the
  // formal QUALIFYING EVENT once you've actually reached its chapter (`isLiveStoryQualifier`, the SAME
  // predicate that arms the plan at tee-off, so what you played is what gets scored).
  let qualifier: NonNullable<UiState['lastStoryRound']>['qualifier'];
  if (!run.storyQuest && isLiveStoryQualifier(base, courseId)) {
    const chapter = storyWorldChapter(courseId);
    // GS-story-qualifier-formats: score the event in the FORMAT it was drawn as — a solo card, a points
    // card, or a two-ball (scramble/best-ball) card, and matchplay on its own win-or-halve terms. The plan
    // rides the run (armed at tee-off); it is re-derived defensively so a resumed/headless round still
    // resolves. Every format lands on the same currency — a finishing place — so the top-N gate, the
    // record and the recap stay one shape.
    const plan = run.storyQualifier ?? activeQualifierPlan(base, courseId);
    const pars = state.course.holes.map((h) => h.par);
    const res = plan
      ? resolveQualifierRound(plan, played.map((p) => p.record.strokes), pars, String(run.seed))
      : undefined;
    const place = res?.place ?? qualifierPlacement(qualifierField(courseId, totals.totalPar, chapter), totals.gross);
    const fieldSize = res?.fieldSize ?? qualifierFieldSize(chapter);
    const need = res?.need ?? qualifyTop(chapter);
    story = recordQualifier(story, courseId, place, fieldSize);
    // The pairing you actually played feeds the betrayal arc's partner tally (one entry per event, so a
    // replay can never stack it) — the friend you keep drawing, or keep leaving on the ship, is the one who
    // ends up standing apart.
    if (plan?.partnerId) story = recordQualifierPartner(story, courseId, plan.partnerId);
    const qualifiedNow = qualifiedCount(story, chapterQualifierEvents(chapter, base.alignment));
    const playerName = getCharacter(base.characterId)?.shortName ?? 'You';
    const stableford = plan?.format === 'stableford' || plan?.format === 'pair-stableford';
    const partnerLabel = plan?.partnerId ? storyPartnerName(plan.partnerId) : undefined;
    const playerRowName = partnerLabel ? `${playerName} & ${partnerLabel}` : playerName;
    const playerGross = res?.teamGross ?? totals.gross;
    const playerPoints = stableford ? res?.playerScore ?? totals.stableford : undefined;
    const ghosts = res?.field ?? qualifierField(courseId, totals.totalPar, chapter);
    const board = [
      ...ghosts.map((g) => ({ name: g.name, gross: g.gross, ...(g.points !== undefined ? { points: g.points } : {}), kind: 'ghost' as const })),
      { name: playerRowName, gross: playerGross, ...(playerPoints !== undefined ? { points: playerPoints } : {}), kind: 'player' as const },
    ].sort((a, b) =>
      stableford
        ? (b.points ?? 0) - (a.points ?? 0) || (a.kind === 'player' ? -1 : b.kind === 'player' ? 1 : 0)
        : a.gross - b.gross || (a.kind === 'player' ? -1 : b.kind === 'player' ? 1 : 0),
    );
    qualifier = {
      chapter,
      place,
      fieldSize,
      need,
      qualified: place <= need,
      qualifiedCount: qualifiedNow,
      neededCount: QUALIFY_EVENTS_NEEDED,
      leaderboard: res?.match ? [] : board,
      formatId: plan?.format ?? 'stroke',
      formatName: plan ? qualifierFormatName(plan) : 'Singles stroke play',
      ...(partnerLabel ? { partnerName: partnerLabel } : {}),
      ...(plan?.pairing ? { pairing: plan.pairing } : {}),
      ...(stableford ? { stableford: true } : {}),
      ...(res?.playerScore !== undefined ? { playerScore: res.playerScore } : {}),
      ...(res?.teamGross !== undefined ? { teamGross: res.teamGross } : {}),
      ...(res?.partnerCountedHoles !== undefined ? { partnerCountedHoles: res.partnerCountedHoles } : {}),
      ...(res?.match && plan
        ? {
            match: {
              scoreline: res.match.scoreline,
              playerWon: res.match.playerWon,
              halved: res.match.halved,
              thru: res.match.thru,
              holesUp: res.match.holesUp,
              // No board on a matchplay event, so the recap has to NAME the pair you faced.
              opponents: qualifierMatchOpponents(plan, totals.totalPar),
            },
          }
        : {}),
    };
  }

  // GS-story-caddy-rep: this round was carried by the active caddy — record it so their personal quest can
  // open up (an ally earns their quest by carrying the bag, not by being hired). No-op if none is active.
  story = recordCaddyRound(story);

  return {
    ...state,
    run: { ...run, status: 'ended', endedReason: 'banked' },
    story,
    // GS-story-ace-tally: a hole-in-one on a Story round still counts toward the cross-mode lifetime ace
    // tally shown on the title (the ace celebration already reads `state.lifetimeAces + 1`). The campaign's
    // OTHER progression (credits/best/ships) stays inside `gs_story`; only this global stat crosses over.
    lifetimeAces: state.lifetimeAces + aces,
    played,
    stopPlayed: undefined,
    play: undefined,
    holeRng: undefined,
    match: undefined,
    viewHole: 0,
    screen: 'storyResult',
    lastStoryRound: {
      courseId,
      toPar: totals.toPar,
      strokes: totals.gross,
      par: totals.totalPar,
      credits,
      advancedChapter,
      wasPrologue,
      // GS-story-quests: carry the ally quest id so the recap can offer the reward.
      ...(run.storyQuest ? { questId: run.storyQuest } : {}),
      ...(qualifier ? { qualifier } : {}),
    },
  };
}

/**
 * Resolve a GALAXY TOURNAMENT round (GS-story-tournament): the player's venue gross against the rival's
 * deterministic ghost total. Beat the rival (ties to the player) and you win the chapter's Sigil, which
 * advances the chapter (unlocking the next worlds). Win OR lose you still played the round, so credits +
 * the venue best bank as usual (with the ship/upgrade credit multipliers). Lands on the tournament recap.
 */
export function resolveStoryTournament(state: UiState, played: PlayedHole[]): UiState {
  const run = state.run;
  const chapter = run.storyTournament ?? 1;
  const totals = playTotals(played.map((p) => p.record));
  let base = state.story ?? defaultStoryState(run.loadout.characterId ?? undefined);
  const t = tournamentForChapter(chapter, base.alignment);
  // Defensive: an unknown chapter falls back to a plain clear so a round can never hang.
  if (!t) return resolveStoryRound({ ...state, run: { ...run, storyTournament: undefined } }, played);

  const pars = state.course.holes.map((h) => h.par);
  const playerName = getCharacter(base.characterId)?.shortName ?? 'You';
  // GS-story-sigil-rivals: the back-half rivals are resolved from the player's OWN story (the betrayal
  // arc), so the ghost, the recap name, and the dialogue all read one person.
  const rival = tournamentRival(t, base);

  let won: boolean;
  let rivalGross: number;
  let rivalName = rival.name;
  let playerGross = totals.gross;
  let matchPayload:
    | { kind: 'singles' | 'team'; scoreline: string; thru: number; holesUp: number; allyName?: string; oppNames?: [string, string]; herald?: boolean }
    | undefined;
  let leaderboard: { name: string; gross: number; kind: 'rival' | 'friend' | 'player' }[];
  let teamPayload: { partnerName: string; format: 'scramble' | 'bestball'; playerSolo: number; partnerCountedHoles: number } | undefined;

  if (isTeamTournament(t)) {
    // GS-story-partners / GS-story-sigil-play: a TEAM Sigil — you + a chosen partner vs a field of opposing
    // PAIRS (the rival's pair + randos + the two non-chosen friends). The pick is LOCKED here (drives the
    // betrayal). SCRAMBLE plays interactively — the partner ball was actually hit + the better kept, so the
    // PLAYED round IS the team's scramble gross. BEST-BALL uses the deterministic partner-ghost fold (the
    // player plays their own ball; the lower per-hole counts) — the reveal is presentation from that model.
    const partnerId = teamPartnerOrDefault(base, run.storyTournamentPartner);
    const partnerName = getCharacter(partnerId)?.shortName ?? 'Partner';
    const pairs = teamFieldPairs(t, base, partnerId);
    if (t.format === 'scramble') {
      const field = opposingField(pairs, String(run.seed), pars, 'scramble');
      const best = field.length ? field[0]!.total : Number.POSITIVE_INFINITY;
      won = totals.gross <= best; // your real scramble team gross vs the leading pair (ties → you)
      rivalGross = best;
      rivalName = field[0]?.name ?? t.rivalName;
      playerGross = totals.gross;
      leaderboard = [
        { name: `You & ${partnerName}`, gross: totals.gross, kind: 'player' as const },
        ...field.map((p) => ({ name: p.name, gross: p.total, kind: 'rival' as const })),
      ].sort((a, b) => a.gross - b.gross || (a.kind === 'player' ? -1 : b.kind === 'player' ? 1 : 0));
      teamPayload = { partnerName, format: 'scramble', playerSolo: totals.gross, partnerCountedHoles: 0 };
    } else {
      const res = resolveStoryTeamStroke(
        played.map((p) => p.record.strokes),
        partnerId,
        TEAM_PARTNER_EDGE,
        pairs,
        String(run.seed),
        pars,
        'bestball',
      );
      won = res.won;
      rivalGross = res.bestOpponentTotal;
      rivalName = res.field[0]?.name ?? t.rivalName;
      playerGross = res.playerTeamTotal;
      leaderboard = [
        { name: `You & ${partnerName}`, gross: res.playerTeamTotal, kind: 'player' as const },
        ...res.field.map((p) => ({ name: p.name, gross: p.total, kind: 'rival' as const })),
      ].sort((a, b) => a.gross - b.gross || (a.kind === 'player' ? -1 : b.kind === 'player' ? 1 : 0));
      teamPayload = { partnerName, format: 'bestball', playerSolo: totals.gross, partnerCountedHoles: res.partnerCountedHoles };
    }
    base = setSigilPartner(base, t.chapter, partnerId);
  } else if (isSinglesMatchTournament(t) || isTeamMatchTournament(t)) {
    // GS-story-sigil-formats / GS-story-sigil-live: the MATCHPLAY Sigils (Ch.3 singles vs the Apostate;
    // the Ch.5 2v2 scramble finale whose teams derive from your partner picks + path). One source —
    // `sigilMatchThrough` — feeds the live HUD, the per-hole reveal, the close-out check AND this final
    // resolution, so they always agree to the hole.
    // GS-story-sigil5-play: a 2v2 SCRAMBLE-MATCH round teed off with the interactive scramble armed
    // (`storyTeamFormat: 'scramble'`) already contains the ally's best-of-two contribution in the played
    // strokes — tell the resolver so it doesn't ALSO fold an ally ghost on top.
    const match = sigilMatchThrough(t, base, played.map((p) => p.record.strokes), String(run.seed), pars, {
      teamPlayed: run.storyTeamFormat === 'scramble',
      chosenAllyId: run.storyTournamentPartner,
    })!;
    const res = match.res;
    won = res.playerAdvances; // win OR halve advances (the campaign's matchplay convention)
    playerGross = res.holesUp; // the match payload carries the real result; keep a number for the type
    rivalGross = 0;
    matchPayload =
      match.kind === 'team' && match.matchup
        ? {
            kind: 'team',
            scoreline: res.scoreline,
            allyName: match.matchup.allyName,
            oppNames: match.matchup.oppNames,
            thru: res.thru,
            holesUp: res.holesUp,
            herald: match.matchup.herald,
          }
        : { kind: 'singles', scoreline: res.scoreline, thru: res.thru, holesUp: res.holesUp };
    if (match.kind === 'team' && match.matchup) rivalName = match.matchup.oppNames.join(' & ');
    leaderboard = []; // no stroke leaderboard for matchplay (the recap shows the scoreline)
    // GS-story-sigil-live: a match CLOSES OUT the moment it's decided, so only the holes it actually ran
    // are banked — the interactive close-out and the headless full-round resolve then bank identically
    // (auto ≡ interactive on the purse too).
    if (res.thru < played.length) played = played.slice(0, res.thru);
  } else {
    rivalGross = rivalTotal(t, String(run.seed), pars, rival);
    won = totals.gross <= rivalGross;
    // GS-story-tournament-field: the full "all competitors" leaderboard for the victory recap — the rival +
    // your three friendly-rival golfers + you, sorted low-gross-first. Display only; deterministic.
    const field = tournamentField(t, String(run.seed), pars, base.characterId, rival);
    leaderboard = tournamentLeaderboard(field, playerName, totals.gross).map((g) => ({
      name: g.kind === 'player' ? 'You' : g.name,
      gross: g.gross,
      kind: g.kind,
    }));
  }

  // Bank the round (credits + best) exactly like a world clear, PLUS the Sigil milestone bonus on a first
  // win (GS-story-balance): the majors fund the escalating bag/ship/finale spend.
  // GS-story-sigil-live: a closed-out match banks only the holes it ran — recompute over the (possibly
  // truncated) played list, and never let a partial round clobber the 18-hole `worldBest` record (the
  // quest-round pattern).
  const bank = playTotals(played.map((p) => p.record));
  const fullRound = played.length >= pars.length;
  const alreadyWon = base.trophyIds.includes(t.sigilId);
  const winBonus = won && !alreadyWon ? SIGIL_WIN_BONUS : 0;
  // GS-story-econ2: a major pays at its VENUE's difficulty tier (later majors pay more), always full-rate
  // (never a revisit top-up) — the tournaments are the campaign's paydays (the Sigil bonus rides on top).
  const credits =
    Math.round(
      storyRoundCredits(bank.toPar, { chapter: storyWorldChapter(t.venueId) }) *
        shipCreditMult(base) *
        upgradeCreditMult(base) *
        storyGearCreditMult(base),
    ) + winBonus;
  let story = recordWorldClear(
    base,
    t.venueId,
    { toPar: bank.toPar, strokes: bank.gross, par: bank.totalPar, seed: String(run.seed) },
    credits,
    fullRound,
  );
  if (won) {
    story = winTournament(story, t);
    // GS-story-tournament-reward: hand over the promised prize CLUB (the bug: majors named a prize club in
    // `prize` but never granted it — the Emerald Invitational report). Own + equip it via the shared club
    // machinery, once (guarded by alreadyWon so a replay can't re-award).
    if (t.rewardClubId && !alreadyWon) {
      // GS-story-quality: a reward may grant a matched SET (the Galewarden Irons are a 5/7/9 trio), so grant
      // every member id — own + equip each (equipStoryClub upgrades that iron slot in place or appends).
      for (const clubId of storyRewardSetIds(t.rewardClubId)) {
        if (story.ownedClubIds.includes(clubId)) continue;
        story = equipStoryClub({ ...story, ownedClubIds: [...story.ownedClubIds, clubId] }, clubId);
      }
    }
    // GS-story-route-rewards: a route major grants its signature ship (own + fly it).
    if (t.rewardShipId) story = grantStoryShip(story, t.rewardShipId);
    // GS-story-reward-variety: a Ch.5 climax major forges a capital SHIP PART for the finale (own it;
    // grantShipUpgrade is idempotent so a replay can't re-grant).
    if (t.rewardUpgradeId) story = grantShipUpgrade(story, t.rewardUpgradeId);
  }
  // GS-story-caddy-rep: a major is a round carried by the active caddy too — count it toward their quest.
  story = recordCaddyRound(story);
  const finalSigil = won && !alreadyWon && story.trophyIds.length >= STORY_CHAPTER_COUNT;
  // GS-story-ace-tally: a hole-in-one during a major still ticks the cross-mode lifetime ace tally. Count
  // over the BANKED holes (a closed-out match may have truncated `played`) so it matches what was played.
  const aces = played.filter((p) => p.record.strokes === 1).length;

  return {
    ...state,
    run: { ...run, status: 'ended', endedReason: 'banked' },
    story,
    lifetimeAces: state.lifetimeAces + aces,
    played,
    stopPlayed: undefined,
    play: undefined,
    holeRng: undefined,
    match: undefined,
    viewHole: 0,
    screen: 'storyTournamentResult',
    lastStoryTournament: {
      chapter,
      name: t.name,
      sigilName: t.sigilName,
      prize: t.prize,
      rivalName,
      playerGross,
      rivalGross,
      won,
      sigilId: t.sigilId,
      finalSigil,
      par: totals.totalPar,
      leaderboard,
      ...(teamPayload ? { team: teamPayload } : {}),
      ...(matchPayload ? { match: matchPayload } : {}),
    },
  };
}

/**
 * Resolve the Asgard STROKE-PLAY tournament (GS-asgard): the player's real nine-hole gross against the
 * Warrior's Tee's deterministic ghost totals. Lowest total wins, ties to the player (a hard-won reward
 * event). A win banks the Thor's Hammer cosmetic here; the Odin's Favour perk + the Rainbow-Ball removal
 * land on the resumed run at `leaveAsgard`. Win OR lose, the player is handed back to their journey.
 */
export function resolveAsgard(state: UiState, played: PlayedHole[]): UiState {
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
