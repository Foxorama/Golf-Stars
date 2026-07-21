/**
 * Story Tour — TEAM tournament resolution (GS-story-team-format).
 *
 * The betrayal-arc Sigils become distinct FORMATS. This pure module resolves the TEAM ones against the
 * campaign's existing deterministic ghost model (`ghostHoleStrokes`/`golferForm`) — the same statistical
 * ghosts the rival + friend field already use — so nothing new is simulated and everything replays
 * byte-identically from the round seed:
 *
 *   • Sigil 1 — SCRAMBLE   : you + a chosen partner vs opposing pairs (rival pair + rando pairs + the two
 *                            non-chosen friends). A scramble team takes the best of more bites → modelled as
 *                            best-of-3 cards per hole (the two members + one "assist" bite).
 *   • Sigil 2 — BEST-BALL  : same field, each golfer plays their own ball, the team keeps the lower hole
 *                            score → best-of-2 cards per hole.
 *   • Sigil 3 — SINGLES MATCHPLAY : just you vs the rival, hole-by-hole (the lower score takes the hole) →
 *                            reuses `match.ts`'s `matchState`/`matchScoreline` (`resolveStorySinglesMatch`).
 *   • Sigil 5 — 2v2 SCRAMBLE MATCHPLAY : you + an ally SHARE a ball vs a pair of opponents sharing theirs,
 *                            hole-by-hole matchplay (each side's scramble best, fewer strokes wins the hole)
 *                            → reuses `match.ts`'s `matchState`/`matchScoreline`. Best-ball (best-of-2) is
 *                            the `format:'bestball'` variant of the same resolver (kept for back-compat).
 *
 * The PLAYER's side folds in their REAL round (the interactive hole strokes) as one card; the partner and
 * every opponent are ghosts. This keeps the tournament an ordinary golf round for the player (no scramble
 * shot-picker rewrite) while the team maths stays pure + deterministic. It is an ARCADE model (the
 * golf-soul lens: fair + readable, not a literal shot-by-shot scramble): best-of-N bites per hole, tuned by
 * per-side ghost `edge`s. Balance of the edges is GS-story-betrayal-polish; this module is the mechanism.
 *
 * PURE + DOM-free. auto ≡ interactive by construction: the player's card is their resolved round strokes
 * (identical headless/interactive), the ghosts are seeded. No rng of its own.
 */

import { ghostHoleStrokes, golferForm } from './competition';
import { matchState, matchScoreline, duelWinner, type HoleDuel, type MatchState } from './match';

/** The two TEAM stroke formats. (Matchplay is resolved separately, always best-ball.) */
export type StoryTeamFormat = 'scramble' | 'bestball';

/** An opposing 2-golfer pair in a team major (content-as-data — built by the tournament layer). */
export interface OpposingPair {
  /** Stable pair id (for the leaderboard row). */
  id: string;
  /** Display name, e.g. "Venoma & Fang". */
  name: string;
  /** The two ghost golfer ids that make up the pair. */
  golferIds: readonly [string, string];
  /** Per-hole ghost stroke edge (difficulty) for BOTH members — higher = they play sharper. */
  edge: number;
}

/** One golfer's ghost hole score on a documented stream (`salt` separates the scramble "assist" bite). */
function ghostCard(golferId: string, seed: string, holeIndex: number, par: number, edge: number, form: number, salt = ''): number {
  return ghostHoleStrokes(golferId, `${seed}:${salt}${holeIndex}`, par, form, edge);
}

/** The team's hole score = the BEST (fewest strokes) of its cards. */
export function teamHoleScore(cards: readonly number[]): number {
  return Math.min(...cards);
}

/**
 * The partner's BEST-BALL ghost score for ONE hole (GS-story-sigil-play) — the EXACT per-hole card
 * `resolveStoryTeamStroke` folds for a best-ball Sigil (same `:partner` form + stream), so a per-hole
 * REVEAL (your ball vs the partner's, the lower counts) matches the finished resolution to the stroke.
 * Pure + deterministic (a keyed hash, no sequential rng), so it's safe to read on the render side.
 */
export function storyPartnerBestBallScore(partnerId: string, partnerEdge: number, seed: string, holeIndex: number, par: number): number {
  const form = golferForm(partnerId, `${seed}:partner:${partnerId}`);
  return ghostCard(partnerId, `${seed}:partner`, holeIndex, par, partnerEdge, form);
}

/** A ghost PAIR's cards for one hole (2 for best-ball, 3 for scramble — the extra bite off member A). */
function pairHoleCards(
  pair: OpposingPair,
  formA: number,
  formB: number,
  seed: string,
  holeIndex: number,
  par: number,
  format: StoryTeamFormat,
): number[] {
  const [a, b] = pair.golferIds;
  const cards = [
    ghostCard(a, seed, holeIndex, par, pair.edge, formA),
    ghostCard(b, seed, holeIndex, par, pair.edge, formB),
  ];
  if (format === 'scramble') cards.push(ghostCard(a, seed, holeIndex, par, pair.edge, formA, 'assist:'));
  return cards;
}

/** A ghost PAIR's total over the pars, deterministic from the seed. `upto` (GS-story-sigil-live) caps the
 *  holes counted — the SAME per-hole draws as the full total, so a running standing through N holes is
 *  always consistent with the finish. Default = every hole (byte-identical). */
export function opposingPairTotal(pair: OpposingPair, seed: string, pars: readonly number[], format: StoryTeamFormat, upto = pars.length): number {
  const formA = golferForm(pair.golferIds[0], `${seed}:pair:${pair.id}:${pair.golferIds[0]}`);
  const formB = golferForm(pair.golferIds[1], `${seed}:pair:${pair.id}:${pair.golferIds[1]}`);
  const n = Math.max(0, Math.min(pars.length, upto));
  let total = 0;
  for (let i = 0; i < n; i++) total += teamHoleScore(pairHoleCards(pair, formA, formB, `${seed}:pair:${pair.id}`, i, pars[i]!, format));
  return total;
}

/** A leaderboard row for an opposing pair. */
export interface PairStanding {
  id: string;
  name: string;
  golferIds: readonly [string, string];
  total: number;
}

/** The opposing field, each pair's total computed and the list sorted low→high (the leader is first).
 *  `upto` (GS-story-sigil-live) gives the running standings through N holes, consistent with the finish. */
export function opposingField(pairs: readonly OpposingPair[], seed: string, pars: readonly number[], format: StoryTeamFormat, upto = pars.length): PairStanding[] {
  return pairs
    .map((p) => ({ id: p.id, name: p.name, golferIds: p.golferIds, total: opposingPairTotal(p, seed, pars, format, upto) }))
    .sort((a, b) => a.total - b.total);
}

/** The player-team's cards for one hole: the player's REAL strokes + the partner ghost (+ scramble assist). */
function playerTeamHoleCards(
  playerStrokes: number,
  partnerId: string,
  partnerEdge: number,
  partnerForm: number,
  seed: string,
  holeIndex: number,
  par: number,
  format: StoryTeamFormat,
): { cards: number[]; partnerBest: number } {
  const partner = ghostCard(partnerId, `${seed}:partner`, holeIndex, par, partnerEdge, partnerForm);
  const cards = [playerStrokes, partner];
  if (format === 'scramble') cards.push(ghostCard(partnerId, `${seed}:partner`, holeIndex, par, partnerEdge, partnerForm, 'assist:'));
  const partnerBest = Math.min(...cards.slice(1));
  return { cards, partnerBest };
}

/** The result of a team STROKE major (Sigils 1 & 2). */
export interface StoryTeamStrokeResult {
  won: boolean;
  format: StoryTeamFormat;
  /** Your team's gross over the venue. */
  playerTeamTotal: number;
  /** Your own solo gross (for "your partner saved you N" attribution). */
  playerSoloTotal: number;
  /** How many holes the partner's ball beat yours (attribution/flavour). */
  partnerCountedHoles: number;
  /** The opposing pairs, sorted low→high. */
  field: PairStanding[];
  /** The best (lowest) opposing pair total — the number you had to beat. */
  bestOpponentTotal: number;
}

/**
 * Resolve a team STROKE major (pure, deterministic). Your team = your real round + a partner ghost combined
 * per format; the opposing pairs are ghost teams. You WIN by matching or bettering the best opposing pair
 * (ties → you, the campaign's benefit-of-the-doubt convention, as the rival ghost uses).
 */
export function resolveStoryTeamStroke(
  playerHoleStrokes: readonly number[],
  partnerId: string,
  partnerEdge: number,
  pairs: readonly OpposingPair[],
  seed: string,
  pars: readonly number[],
  format: StoryTeamFormat,
): StoryTeamStrokeResult {
  const partnerForm = golferForm(partnerId, `${seed}:partner:${partnerId}`);
  const n = Math.min(playerHoleStrokes.length, pars.length);
  let playerTeamTotal = 0;
  let playerSoloTotal = 0;
  let partnerCountedHoles = 0;
  for (let i = 0; i < n; i++) {
    const solo = playerHoleStrokes[i]!;
    playerSoloTotal += solo;
    const { cards, partnerBest } = playerTeamHoleCards(solo, partnerId, partnerEdge, partnerForm, seed, i, pars[i]!, format);
    const team = teamHoleScore(cards);
    playerTeamTotal += team;
    if (partnerBest < solo) partnerCountedHoles++;
  }
  const field = opposingField(pairs, seed, pars, format);
  const bestOpponentTotal = field.length ? field[0]!.total : Number.POSITIVE_INFINITY;
  return {
    won: playerTeamTotal <= bestOpponentTotal,
    format,
    playerTeamTotal,
    playerSoloTotal,
    partnerCountedHoles,
    field,
    bestOpponentTotal,
  };
}

/** The result of a 1v1 SINGLES matchplay major (Sigil 3 — just you vs the rival, hole by hole). */
export interface StorySinglesMatchResult {
  playerWon: boolean;
  halved: boolean;
  /** Win OR halve — you pass (the campaign's matchplay convention). */
  playerAdvances: boolean;
  scoreline: string;
  holesUp: number;
  thru: number;
  state: MatchState;
  duels: HoleDuel[];
}

/**
 * Resolve a 1v1 SINGLES matchplay major (pure, deterministic). Your REAL per-hole strokes vs the rival's
 * ghost card, hole by hole — the lower score takes the hole, the match closes out the moment it's decided
 * (up by more than remain). The rival's per-hole stream is the SAME one `rivalTotal`/`rivalTotalThrough`
 * draw (`golferForm(seed:form)` + `ghostHoleStrokes(seed:i)`), so the halftime standing stays consistent
 * with the finish. Reuses `match.ts`'s `matchState`/`matchScoreline`.
 */
export function resolveStorySinglesMatch(
  playerHoleStrokes: readonly number[],
  rivalId: string,
  rivalEdge: number,
  seed: string,
  pars: readonly number[],
): StorySinglesMatchResult {
  const form = golferForm(rivalId, `${seed}:form`);
  const n = Math.min(playerHoleStrokes.length, pars.length);
  const duels: HoleDuel[] = [];
  for (let i = 0; i < n; i++) {
    const par = pars[i]!;
    const rival = ghostHoleStrokes(rivalId, `${seed}:${i}`, par, form, rivalEdge);
    const player = playerHoleStrokes[i]!;
    duels.push({ holeIndex: i, par, playerStrokes: player, bossStrokes: rival, winner: duelWinner(player, rival) });
    if (matchState(duels, pars.length).decided) break;
  }
  const state = matchState(duels, pars.length);
  return {
    playerWon: state.playerWon,
    halved: state.halved,
    playerAdvances: state.playerAdvances,
    scoreline: matchScoreline(state),
    holesUp: state.holesUp,
    thru: state.thru,
    state,
    duels,
  };
}

/** The result of the 2v2 MATCHPLAY finale (Sigil 5 — scramble; or best-ball for back-compat). */
export interface StoryMatchResult {
  playerWon: boolean;
  halved: boolean;
  /** Win OR halve — you pass (the campaign's matchplay convention). */
  playerAdvances: boolean;
  scoreline: string;
  holesUp: number;
  thru: number;
  state: MatchState;
  duels: HoleDuel[];
}

/**
 * Resolve the 2v2 MATCHPLAY finale (pure, deterministic). Your side = your real round teamed with an ally
 * ghost; the opposing side = two opponent ghosts. `format` sets how each side's team hole score is taken:
 * `scramble` (Sigil 5 — the two share a ball, best of three bites incl. an "assist") or `bestball` (best of
 * two). Fewer TEAM strokes wins the hole; the match closes out the moment it's decided (up by more than
 * remain). Reuses `match.ts`'s `matchState`. Default `bestball` keeps the pre-scramble callers byte-identical.
 */
export function resolveStory2v2Match(
  playerHoleStrokes: readonly number[],
  allyId: string,
  allyEdge: number,
  oppIds: readonly [string, string],
  oppEdge: number,
  seed: string,
  pars: readonly number[],
  format: StoryTeamFormat = 'bestball',
  /** GS-story-sigil5-play: the player's strokes are already the SIDE's scramble score — the round was
   *  PLAYED as an interactive/auto scramble (ally ball hit + the better kept, per shot), so no ally ghost
   *  is folded on top (it would double-count the ally). Default false = the legacy ghost fold, so every
   *  pre-existing caller is byte-identical. The opposing side stays the ghost pair either way. */
  playerTeamPlayed = false,
): StoryMatchResult {
  const allyForm = golferForm(allyId, `${seed}:ally:${allyId}`);
  const oppForm0 = golferForm(oppIds[0], `${seed}:opp:${oppIds[0]}`);
  const oppForm1 = golferForm(oppIds[1], `${seed}:opp:${oppIds[1]}`);
  const n = Math.min(playerHoleStrokes.length, pars.length);
  const duels: HoleDuel[] = [];
  for (let i = 0; i < n; i++) {
    const par = pars[i]!;
    // Your team: your real strokes + the ally ghost (+ a scramble "assist" bite off the ally) — or, when
    // the round was PLAYED as the team (playerTeamPlayed), the real strokes alone. The opposing team: the
    // two opponent ghosts (+ a scramble assist off the first). teamHoleScore = the best of them.
    const playerCards = playerTeamPlayed
      ? [playerHoleStrokes[i]!]
      : [playerHoleStrokes[i]!, ghostCard(allyId, `${seed}:ally`, i, par, allyEdge, allyForm)];
    const oppCards = [
      ghostCard(oppIds[0], `${seed}:opp`, i, par, oppEdge, oppForm0),
      ghostCard(oppIds[1], `${seed}:opp`, i, par, oppEdge, oppForm1),
    ];
    if (format === 'scramble') {
      if (!playerTeamPlayed) playerCards.push(ghostCard(allyId, `${seed}:ally`, i, par, allyEdge, allyForm, 'assist:'));
      oppCards.push(ghostCard(oppIds[0], `${seed}:opp`, i, par, oppEdge, oppForm0, 'assist:'));
    }
    const playerTeam = teamHoleScore(playerCards);
    const oppTeam = teamHoleScore(oppCards);
    duels.push({ holeIndex: i, par, playerStrokes: playerTeam, bossStrokes: oppTeam, winner: duelWinner(playerTeam, oppTeam) });
    if (matchState(duels, pars.length).decided) break;
  }
  const state = matchState(duels, pars.length);
  return {
    playerWon: state.playerWon,
    halved: state.halved,
    playerAdvances: state.playerAdvances,
    scoreline: matchScoreline(state),
    holesUp: state.holesUp,
    thru: state.thru,
    state,
    duels,
  };
}
