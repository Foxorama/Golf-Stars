/**
 * Matchplay bosses (GS-100) — a 1-on-1 duel against a real golfer on the actual hole.
 *
 * The arc's boss is the leaderboard leader (`league.arcBossId` → the top non-player). On a matchplay
 * boss stop you don't play Stableford-vs-cut: you play the boss HOLE BY HOLE — fewer strokes wins the
 * hole, and the match is decided when one player is up by more holes than remain ("3 & 2"). Winning
 * (or halving) the match passes the stop; losing ends the run.
 *
 * The boss is a REAL ball, not a ghost: it plays the same hole through the same `playHole` engine with
 * the golfer's own loadout (a distance bonus from their power, a handicap from their skill) and their
 * own shot SHAPE (`bossShotMods` — their fade/hook, dispersion, backspin). So the boss "hits their own
 * shots" and a bomber's boss really does bomb it. The boss plays a SEPARATE rng stream so the player's
 * own play stays byte-for-byte identical to a non-boss stop (the leaderboard/balance for the player's
 * score is unchanged); the duel is the comparison on top.
 *
 * Pure & deterministic, no DOM. The reducer orchestrates (it can see the leaderboard); this module is
 * the engine.
 */

import { playHole, type PlayHoleOptions, type PlayedHole, type ShotMods } from '../round';
import type { PatchKind } from '../patches';
import type { Hole } from '../course/contract';
import { Rng } from '../rng';
import {
  startingLoadout,
  boostDistanceClubs,
  netDispersion,
  puttSkillOf,
  type PlayerLoadout,
} from './economy';
import { applyBagTier, type BagTier } from './bag';
import { bossShotMods, golferDistanceBonus, golferProfile, getGolfer } from './golfers';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Yards the home-zone edge (GS-team-duel / boss home-zone edge) adds to the boss's distance clubs. */
export const HOME_EDGE_DISTANCE = 6;
/** Handicap strokes the home-zone edge sharpens the boss by (a lower handicap → tighter, longer). */
export const HOME_EDGE_HANDICAP = 2;

// --- Ascension boss scaling (GS-boss-scale) -----------------------------------
//
// Bosses used to play the identical game at every Ascension tier while the PLAYER's build kept
// growing (rare/epic/legendary bag tiers, perks, unlocked clubs) — so from ~A4 up the duels fell
// flat. Now the duel carries an EDGE derived from the run: the boss's handicap tightens and their
// distance clubs lengthen per tier, they bring the SAME bag rarity the run is played on (gear
// parity — the applyBagTier machinery, no new club rows), and from BOSS_ATTACK_ASCENSION up they
// hunt pins (the shared GS-ai-attack target rule). A0 with a common bag is an exact no-op, so the
// classic boss — and every existing seeded test — is byte-for-byte unchanged.

/** The run-derived sharpening a boss duel is played at. Empty/A0+common+arc0 = the classic boss. */
export interface BossEdge {
  /** Ascension tier of the run (0 = classic, byte-identical). */
  ascension?: number;
  /** The run's bag tier — the boss brings the same rarity clubs (gear parity). */
  bagTier?: BagTier;
  /**
   * The boss's ARC RANK (GS-boss-escalation): 0 for the Arc-I boss, 1 for Arc-II, 2 for the Arc-III
   * final — so a voyage's three bosses ESCALATE, not just scale flat with Ascension. Derived from the
   * boss's `cutBonus` (1/2/3 → rank 0/1/2), reviving that field's documented "boss is harder" purpose:
   * it was inert because a matchplay boss passes on the DUEL (`matchWon`), never the Stableford cut, so
   * the +1/+2/+3 cut never bit. It now sharpens the boss LOADOUT instead — handicap, distance, dispersion
   * — stacking ON TOP of the Ascension edge. Rank 0 (Arc-I, and the default) is byte-identical to the
   * classic boss. A grown player (deep bag + perks) is meant to out-club the escalation and still win;
   * the escalation just restores a real difficulty CLIMB across the campaign.
   */
  arcRank?: number;
}

/** Handicap strokes shaved off the boss per Ascension tier (they bottom out at scratch). */
export const BOSS_ASC_HANDICAP = 0.7;
/** Extra distance-club yards the boss gains per Ascension tier. */
export const BOSS_ASC_DISTANCE = 2;
/** Dispersion tightening per Ascension tier (multiplicative, floored) — the knob that keeps biting
 *  after the handicap bottoms out at scratch (elite bosses start near it). */
export const BOSS_ASC_DISPERSION = 0.015;
export const BOSS_ASC_DISPERSION_FLOOR = 0.78;
/** From this Ascension tier up, the boss hunts pins (GS-ai-attack) instead of the percentage play. */
export const BOSS_ATTACK_ASCENSION = 4;

/**
 * Per-ARC-RANK boss sharpening (GS-boss-escalation) — the Arc-II boss is harder than Arc-I, the Arc-III
 * final meaningfully harder again, INDEPENDENT of Ascension (so the campaign escalates even at A0). Rank
 * 0 (Arc-I / default) contributes nothing, so the classic boss + every A0-arc-1 seeded test is unchanged.
 * Tuned bigger than the per-Ascension steps so the arc climb is felt: the Arc-III final (rank 2) plays
 * ~2.6 strokes lower handicap, ~8 yds longer, ~8% tighter than the Arc-I boss at the same tier — a clear
 * step up that a grown bag can still out-club. From rank ≥1 the boss also hunts pins (GS-ai-attack), so a
 * late-arc boss attacks flags even at low Ascension.
 */
export const BOSS_ARC_HANDICAP = 1.3;
export const BOSS_ARC_DISTANCE = 4;
export const BOSS_ARC_DISPERSION = 0.04;
/** From this arc rank up the boss pin-hunts even below BOSS_ATTACK_ASCENSION — reserved for the Arc-III
 *  FINAL (rank 2), so the climax boss plays aggressive championship golf even at A0, while Arc-II stays
 *  the percentage player (just tighter/longer). Above BOSS_ATTACK_ASCENSION every boss pin-hunts anyway. */
export const BOSS_ARC_ATTACK_RANK = 2;

/** Does this boss golfer get the "their turf" home-zone edge on a course of the given theme? */
export function bossHasHomeEdge(golferId: string, themeId: string | undefined): boolean {
  return !!themeId && getGolfer(golferId)?.home === themeId;
}

/**
 * A boss golfer's loadout: the balanced bag with their distance bonus, and a handicap derived from
 * their skill/accuracy (a leaderboard leader plays off a low handicap → tight, long, dangerous).
 * `homeEdge` (GS-team-duel) sharpens them on their home constellation — a lower handicap and a touch
 * more distance, a "this is my turf" signature advantage (fair: you can dodge their home by routing).
 */
export function bossLoadout(golferId: string, homeEdge = false, edge: BossEdge = {}): PlayerLoadout {
  const p = golferProfile(golferId);
  const asc = clamp(Math.round(edge.ascension ?? 0), 0, 15);
  const arcRank = Math.max(0, Math.round(edge.arcRank ?? 0)); // GS-boss-escalation: 0=Arc-I … 2=final
  // Gear parity (GS-boss-scale): re-stamp the boss's bag to the run's tier FIRST (applyBagTier
  // rebuilds carries from the set rows), then lay the golfer/home/ascension distance bonus on top.
  const base = applyBagTier(startingLoadout(), edge.bagTier ?? 'common');
  // Skill+accuracy → handicap ~2 (elite) to ~16 (journeyman); the home edge shaves a couple of
  // strokes, each Ascension tier shaves BOSS_ASC_HANDICAP more, and each ARC RANK shaves
  // BOSS_ARC_HANDICAP (the campaign climb). Floored at scratch once ANY edge is armed (asc>0 OR
  // arcRank>0); the A0 Arc-I floor stays 1 so the classic boss is byte-identical.
  const handicap = Math.round(
    clamp(
      20 - p.skill * 12 - p.accuracy * 6 - (homeEdge ? HOME_EDGE_HANDICAP : 0) - asc * BOSS_ASC_HANDICAP - arcRank * BOSS_ARC_HANDICAP,
      asc > 0 || arcRank > 0 ? 0 : 1,
      18,
    ),
  );
  return {
    ...base,
    bag: boostDistanceClubs(
      base.bag,
      golferDistanceBonus(golferId) +
        (homeEdge ? HOME_EDGE_DISTANCE : 0) +
        Math.round(asc * BOSS_ASC_DISTANCE) +
        arcRank * BOSS_ARC_DISTANCE,
    ),
    handicap,
    // The tier ALSO tightens raw dispersion (multiplicative, floored) — handicap alone saturates
    // at scratch, and the deep tiers need a knob that keeps working. ×1 at A0-arc-1, byte-identical.
    dispersionMult: Math.max(BOSS_ASC_DISPERSION_FLOOR, 1 - asc * BOSS_ASC_DISPERSION - arcRank * BOSS_ARC_DISPERSION),
    characterId: undefined,
  };
}

/** The `playHole` options for a boss golfer (their bag, dispersion, shot shape — and, at high
 *  Ascension, the pin-hunting aim). */
export function bossPlayOpts(golferId: string, homeEdge = false, edge: BossEdge = {}): PlayHoleOptions {
  const lo = bossLoadout(golferId, homeEdge, edge);
  return {
    bag: lo.bag,
    dispersionMult: netDispersion(lo),
    shotMods: bossShotMods(golferId),
    // Pin-hunt from high Ascension OR a late arc (GS-boss-escalation) — an Arc-II/III boss attacks
    // flags even at low Ascension. Arc-I (rank 0) at A<4 stays the percentage player, byte-identical.
    attackPin: (edge.ascension ?? 0) >= BOSS_ATTACK_ASCENSION || Math.max(0, Math.round(edge.arcRank ?? 0)) >= BOSS_ARC_ATTACK_RANK,
    // A tier-parity bag carries its putter's boost — the boss putts like its flat-stick deserves
    // ({} on the classic common bag, byte-identical).
    puttSkill: puttSkillOf(lo),
  };
}

/** Play a boss golfer's whole stop (their own ball on each hole), deterministically. `rainbowRoad`
 *  (GS-rainbow) makes the boss play the player's rainbow-road hole (off-road = OOB); default off. */
export function playBossStop(holes: readonly Hole[], golferId: string, rng: Rng, homeEdge = false, rainbowRoad = false, tradeTents = false, meteorScorch = false, groundPatch?: PatchKind, edge: BossEdge = {}): PlayedHole[] {
  const opts = { ...bossPlayOpts(golferId, homeEdge, edge), rainbowRoad, tradeTents, meteorScorch, groundPatch };
  return holes.map((h) => playHole(h, rng, opts));
}

// --- Team-duel scoring (GS-team-duel) -----------------------------------------
//
// A team-duel boss is a matchplay duel where ONE side (the underdog) plays a TEAM format with a
// partner. The team's hole score depends on the format:
//   • scramble — both hit each shot, the team plays the better ball (one stroke); `playHole`'s
//     `scramble` opt already does this (the partner hits a second ball, pickBetterExec keeps the
//     better). The partner reuses the side's bag/dispersion with their OWN swing shape.
//   • best-ball — both play their OWN ball the whole hole, the better hole SCORE counts. Two
//     independent balls → two `playHole` passes (player then partner) off the same rng, keep fewer
//     strokes.
// The SOLO side is just `playHole`. All three consume rng in a fixed order, so a team stop is
// deterministic and replays identically.

export type TeamFormat = 'bestball' | 'scramble';

/** The better of two played holes (fewer strokes; ties keep the first/`a`). */
export function betterPlayedHole(a: PlayedHole, b: PlayedHole): PlayedHole {
  return b.record.strokes < a.record.strokes ? b : a;
}

/**
 * A best-ball hole for one side: the base player and a partner (same opts, the partner's swing shape)
 * each play their OWN ball; the better hole score counts. The base ball is played first, then the
 * partner's, off the SAME rng (deterministic). Returns the kept hole and whether the PARTNER's
 * counted (for UI attribution).
 */
export function bestBallHole(
  hole: Hole,
  rng: Rng,
  baseOpts: PlayHoleOptions,
  partnerMods: ShotMods | undefined,
): { played: PlayedHole; partnerKept: boolean } {
  const a = playHole(hole, rng, baseOpts);
  const b = playHole(hole, rng, { ...baseOpts, shotMods: partnerMods });
  const partnerKept = b.record.strokes < a.record.strokes;
  return { played: partnerKept ? b : a, partnerKept };
}

/**
 * One side's hole under a team format (GS-team-duel). With no `partnerMods` the side plays SOLO
 * (plain `playHole`). With a partner: `scramble` uses `playHole`'s best-of-two-per-shot; `bestball`
 * plays two independent balls and keeps the better. Deterministic off `rng`.
 */
export function playSideHole(
  hole: Hole,
  rng: Rng,
  baseOpts: PlayHoleOptions,
  partnerMods: ShotMods | undefined,
  format: TeamFormat,
): { played: PlayedHole; partnerKept: boolean } {
  if (!partnerMods) return { played: playHole(hole, rng, baseOpts), partnerKept: false };
  if (format === 'scramble') {
    // The headless PlayedHole doesn't surface per-shot partner attribution (that's tracked on the
    // interactive HolePlay); the team score is correct, attribution is cosmetic on this auto side.
    return { played: playHole(hole, rng, { ...baseOpts, scramble: { partnerMods } }), partnerKept: false };
  }
  return bestBallHole(hole, rng, baseOpts, partnerMods);
}

export interface HoleDuel {
  holeIndex: number;
  par: number;
  /** YOUR SIDE's score for the hole. In a pairs format this is already the TEAM number (the better
   *  ball), not your solo card — see `mateStrokes` for what your partner actually made. */
  playerStrokes: number;
  bossStrokes: number;
  /** Your PARTNER's ball on this hole (GS-story-partner-ball). Present only in a paired format where
   *  the partner is a ghost the sim rolls — so the live HUD can show what your side's other ball did
   *  instead of leaving you to guess which one counted. Absent for singles, and absent when the round
   *  was PLAYED as the team (`playerTeamPlayed`), where there is no separate partner card to show.
   *  Optional so every existing caller and seeded fixture is untouched. */
  mateStrokes?: number;
  /** Who won the hole (fewer strokes). */
  winner: 'player' | 'boss' | 'halved';
}

/** Fewer strokes wins the hole. */
export function duelWinner(playerStrokes: number, bossStrokes: number): HoleDuel['winner'] {
  if (playerStrokes < bossStrokes) return 'player';
  if (bossStrokes < playerStrokes) return 'boss';
  return 'halved';
}

export function holeDuel(holeIndex: number, par: number, player: PlayedHole, boss: PlayedHole): HoleDuel {
  return {
    holeIndex,
    par,
    playerStrokes: player.record.strokes,
    bossStrokes: boss.record.strokes,
    winner: duelWinner(player.record.strokes, boss.record.strokes),
  };
}

export interface MatchState {
  /** Holes up from the PLAYER's perspective (+ player ahead, − boss ahead). */
  holesUp: number;
  /** Holes played so far. */
  thru: number;
  /** Holes still to play. */
  remaining: number;
  /** The match is mathematically over (up by more than remain). */
  decided: boolean;
  /** Match is over (decided early or all holes played). */
  finished: boolean;
  /** Player took the match (up at the finish). */
  playerWon: boolean;
  /** All-square at the finish. */
  halved: boolean;
  /** Player passes the boss stop — won or halved (benefit of the doubt on a half). */
  playerAdvances: boolean;
}

/** Roll duels into a match state, given the total holes in the stop. */
export function matchState(duels: readonly HoleDuel[], totalHoles: number): MatchState {
  let up = 0;
  for (const d of duels) up += d.winner === 'player' ? 1 : d.winner === 'boss' ? -1 : 0;
  const thru = duels.length;
  const remaining = Math.max(0, totalHoles - thru);
  const decided = Math.abs(up) > remaining;
  const finished = decided || thru >= totalHoles;
  const halved = finished && up === 0;
  const playerWon = finished && up > 0;
  return { holesUp: up, thru, remaining, decided, finished, playerWon, halved, playerAdvances: finished && up >= 0 };
}

export interface MatchStop {
  player: PlayedHole[];
  boss: PlayedHole[];
  duels: HoleDuel[];
  state: MatchState;
}

/**
 * Auto-play a whole matchplay stop: the player's ball (supplied opts) and the boss's ball, hole by
 * hole, stopping as soon as the match is mathematically decided. Used by the "watch the AI play" path
 * and tests. Separate rng streams so the player's auto play is identical to a non-boss stop.
 */
export function playMatchStop(
  holes: readonly Hole[],
  playerOpts: PlayHoleOptions,
  golferId: string,
  playerRng: Rng,
  bossRng: Rng,
  homeEdge = false,
  edge: BossEdge = {},
): MatchStop {
  // The Rainbow Ball (GS-rainbow) transforms the HOLE, not just the player's ball — so the boss plays
  // the SAME rainbow road (off-road is OOB for them too). Inherit it from the player's opts so a duel
  // stays fair (both on the wire) instead of the player alone on a brutal course.
  // Trade-camp tents (GS-tents), meteor scorch marks (GS-meteor-scorch) and effect ground patches
  // (GS-journey-fx-2) likewise transform the hole, so the boss obeys the same ring / plays off the
  // same charred craters and turf patches.
  const bossOpts = { ...bossPlayOpts(golferId, homeEdge, edge), rainbowRoad: playerOpts.rainbowRoad, tradeTents: playerOpts.tradeTents, meteorScorch: playerOpts.meteorScorch, groundPatch: playerOpts.groundPatch };
  const player: PlayedHole[] = [];
  const boss: PlayedHole[] = [];
  const duels: HoleDuel[] = [];
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!;
    const ph = playHole(h, playerRng, playerOpts);
    const bh = playHole(h, bossRng, bossOpts);
    player.push(ph);
    boss.push(bh);
    duels.push(holeDuel(i, h.par, ph, bh));
    if (matchState(duels, holes.length).decided) break;
  }
  return { player, boss, duels, state: matchState(duels, holes.length) };
}

/**
 * Pre-play the BOSS's whole side of a team duel (GS-team-duel) — every hole as a solo or team format
 * per `setup`, on the boss's own rng. Used by the interactive reducer to reveal the boss hole-by-hole
 * (like `playBossStop` for a solo matchplay boss). Plays ALL holes (no early-stop) since the duel is
 * decided on the player's side.
 */
export function playBossSideStop(
  holes: readonly Hole[],
  golferId: string,
  setup: TeamSetup,
  rng: Rng,
  homeEdge = false,
  rainbowRoad = false,
  tradeTents = false,
  meteorScorch = false,
  groundPatch?: PatchKind,
  edge: BossEdge = {},
): PlayedHole[] {
  // Rainbow Ball (GS-rainbow) / trade-camp tents (GS-tents) / meteor scorch (GS-meteor-scorch) /
  // effect ground patches (GS-journey-fx-2): the player's loadout/route transforms the hole, so the
  // boss side (pre-played by the interactive reducer) plays the same hole. Default off.
  const bossOpts = { ...bossPlayOpts(golferId, homeEdge, edge), rainbowRoad, tradeTents, meteorScorch, groundPatch };
  const bossPartner = setup.partnerSide === 'boss' ? setup.bossPartnerMods : undefined;
  return holes.map((h) => playSideHole(h, rng, bossOpts, bossPartner, setup.format).played);
}

/** Which side of a team duel carries the partner, and the resolved format + partner shapes. */
export interface TeamSetup {
  format: TeamFormat;
  /** The UNDERDOG side (the lower-ranked one) — they get the partner and the team format. */
  partnerSide: 'player' | 'boss';
  /** The player's partner swing shape (present iff partnerSide === 'player'). */
  playerPartnerMods?: ShotMods;
  /** The boss's partner swing shape (present iff partnerSide === 'boss'). */
  bossPartnerMods?: ShotMods;
}

/**
 * Auto-play a whole TEAM-DUEL stop (GS-team-duel): the player's side and the boss's side hole by hole,
 * each as a solo or team format per `setup.partnerSide`, stopping the moment the match is decided.
 * Used by the headless `playStop` and the "watch the AI" path; separate rng streams so each side's play
 * is reproducible. Mirrors the interactive reducer (which auto-resolves a scramble pick the same way).
 */
export function playTeamMatchStop(
  holes: readonly Hole[],
  playerOpts: PlayHoleOptions,
  golferId: string,
  setup: TeamSetup,
  playerRng: Rng,
  bossRng: Rng,
  homeEdge = false,
  edge: BossEdge = {},
): MatchStop {
  // Rainbow Ball (GS-rainbow): the boss side plays the same transformed hole (off-road = OOB), and the
  // boss's partner inherits it via `bossOpts` below — so a team duel stays fair under rainbow road.
  const bossOpts = { ...bossPlayOpts(golferId, homeEdge, edge), rainbowRoad: playerOpts.rainbowRoad, tradeTents: playerOpts.tradeTents, meteorScorch: playerOpts.meteorScorch, groundPatch: playerOpts.groundPatch };
  const playerPartner = setup.partnerSide === 'player' ? setup.playerPartnerMods : undefined;
  const bossPartner = setup.partnerSide === 'boss' ? setup.bossPartnerMods : undefined;
  const player: PlayedHole[] = [];
  const boss: PlayedHole[] = [];
  const duels: HoleDuel[] = [];
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i]!;
    const ph = playSideHole(h, playerRng, playerOpts, playerPartner, setup.format).played;
    const bh = playSideHole(h, bossRng, bossOpts, bossPartner, setup.format).played;
    player.push(ph);
    boss.push(bh);
    duels.push(holeDuel(i, h.par, ph, bh));
    if (matchState(duels, holes.length).decided) break;
  }
  return { player, boss, duels, state: matchState(duels, holes.length) };
}

/** A short matchplay scoreline, e.g. "3 & 2", "2 UP", "AS" (all square). */
export function matchScoreline(st: MatchState): string {
  if (st.thru === 0) return 'AS';
  if (st.finished && st.decided && st.remaining > 0) {
    return `${Math.abs(st.holesUp)} & ${st.remaining}`;
  }
  if (st.holesUp === 0) return st.finished ? 'HALVED' : 'AS';
  const side = st.holesUp > 0 ? 'UP' : 'DN';
  return `${Math.abs(st.holesUp)} ${side}`;
}
