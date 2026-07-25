/**
 * Story-Tour QUALIFYING FORMATS (GS-story-qualifier-formats) — what shape the road to a Sigil takes.
 *
 * A qualifying event used to be one thing forever: an eighteen-hole solo stroke card against a ghost
 * ladder, three times a chapter, five chapters deep. That is fifteen identical rounds of "shoot a number",
 * and it made the friends aboard your ship into names on a lobby chip. Now every qualifying event is a
 * NINE-hole card drawn into one of FIVE formats:
 *
 *   • `stroke`          — single, stroke play. Your card against the ladder.
 *   • `stableford`      — single, points. A blow-up hole costs a point, not a round.
 *   • `pair-stroke`     — you + a tour-mate against pairs, lower team card wins.
 *   • `pair-stableford` — the same two-ball, scored in points.
 *   • `pair-match`      — the same two-ball, hole by hole against one pair. Win or halve to qualify.
 *
 * A paired event is played SCRAMBLE (share a ball, best of every shot — the Sigil-1 machinery, so the
 * per-shot pick card raises and the AUTO path plays best-of-two identically) or BEST-BALL (each plays their
 * own; the team keeps the lower hole score — the Sigil-2 machinery, a per-hole partner ghost on the same
 * stream the resolution folds). Both are drawn, both are the existing engine pointed at a qualifier — no
 * new shot mechanic, so auto ≡ interactive holds by construction.
 *
 * **The draw is a PLAN, not a surprise.** `qualifierPlan` is a pure keyed hash off the campaign seed + the
 * event's world, so the format and the pairing are fixed the moment the campaign starts and are shown on the
 * star-map dossier before you fly. A chapter charts three events and asks you to qualify in two, so which
 * roads you take is a real choice of golf.
 *
 * **WHO plays it beside you is YOURS** (GS-story-qualifier-partner-pick). The draw suggests a tour-mate; the
 * dossier offers the same three-friend picker a team Sigil does, and `chosenPartnerId` overrides the
 * suggestion (validated against the roster, so a skipped picker still tees off). That matters because the
 * pairing is exactly what `storyBetrayal`'s partner tally reads: the friend you keep choosing — or keep
 * leaving on the ship — is the friend who ends up standing apart. Leaving that to the dice would have made
 * the betrayal something that happened TO you; picking it makes it something you did.
 *
 * PURE + DOM-free. Zero sim rng: the plan is a keyed hash (no sequential draws off any play stream), the
 * field is the deterministic `storyQualifiers` ladder, and the paired resolutions reuse the seeded ghost
 * streams `storyTeams` already owns. Nothing here perturbs a single existing draw.
 */

import { Rng } from '../rng';
import { stablefordPoints } from '../score';
import { otherGolferIds } from './storyCast';
import { getCharacter } from './characters';
import { storyWorldById, type StoryState } from './story';
import { resolveStory2v2Match, storyPartnerBestBallScore, type StoryMatchResult, type StoryTeamFormat } from './storyTeams';
import {
  QUALIFIER_HOLES,
  qualifierField,
  qualifierFieldSize,
  qualifierPlacement,
  qualifierPlacementByPoints,
  qualifyTop,
  placeQualifies,
  type QualifierGhost,
} from './storyQualifiers';
import { isLiveStoryQualifier } from './storyTournaments';

/** The five shapes a qualifying event can be drawn as. */
export type QualifierFormatId = 'stroke' | 'stableford' | 'pair-stroke' | 'pair-stableford' | 'pair-match';

/** The five formats in draw order (the draw is uniform over this list). */
export const QUALIFIER_FORMATS: readonly QualifierFormatId[] = [
  'stroke',
  'stableford',
  'pair-stroke',
  'pair-stableford',
  'pair-match',
];

/** How a PAIRED event's two-ball is played: share one ball (best of every shot) or play your own and keep
 *  the better hole score. Both reuse the Sigil team machinery, so nothing new is simulated. */
export type QualifierPairing = StoryTeamFormat; // 'scramble' | 'bestball'

/** Is this format played with a tour-mate on the bag beside you? */
export function isPairedFormat(format: QualifierFormatId): boolean {
  return format === 'pair-stroke' || format === 'pair-stableford' || format === 'pair-match';
}

/**
 * Your partner's per-hole edge in a qualifying two-ball — deliberately WEAKER than a team Sigil partner
 * (`TEAM_PARTNER_EDGE`, +0.05). A Sigil partner is a co-champion; a qualifier partner is company and a
 * safety net. At Sigil strength the ghost is as good as you are, which quietly halves your own round's
 * influence — a best-ball card becomes `min(you, someone-as-good-as-you)` and the event stops being about
 * how YOU played (measured: the qualifying rate barely moved as the player's standard improved, which is
 * the worst possible reading of a golf format). At this edge the partner covers your disasters and stays
 * out of the way of your good holes, so your card decides the event and the friend beside you is a hand,
 * not a carry. `app.ts` draws the per-hole best-ball reveal with this same number on a qualifier round, so
 * the ball you see revealed is the ball that scored.
 */
export const QUALIFIER_PARTNER_EDGE = -0.7;

/**
 * How much a two-ball is worth over nine holes, in strokes — the amount the ghost ladder SHARPENS by on a
 * paired event, so qualifying is as hard whichever format you drew (the fairness lens: variety must be
 * variety, never a difficulty dice-roll).
 *
 * Both numbers are MEASURED, not guessed (`npx vite-node scripts/qualifier-balance.ts`), because the two
 * pairings help by completely different mechanisms: a SHARED BALL is armed on your own swing (best of two
 * shots every stroke — worth ≈4.5 strokes, measured by driving the real nine-hole qualifier layout through
 * `playCourse` with and without the partner's shot mods), while BEST-BALL leaves your card alone and folds a
 * partner ghost per hole (≈1.0–2.0, more for a struggling round). Retuning either is a BALANCE change:
 * re-run the script and check every format still lands in the same qualifying band.
 *
 * Measured (2026-07-25), a competent round across Ch.1/3/5 — solo 36/44/57%, scramble 45/52/63%, best-ball
 * 35/35/40%, matchplay 42/51/63% (scramble) and 46/49/58% (best-ball): every format inside a 35–63% band,
 * no walkover and no wall. Two notes on why it isn't tighter, and shouldn't be forced to be. A nine-hole
 * ghost ladder is only ~0.55 strokes per rank, so the bar snaps to WHOLE strokes — every shift in (−2.5,
 * −1.5] lands the identical bar, and there is simply no finer dial between "a shade stern" and "a shade
 * generous". And best-ball's real gift is variance, not strokes: it truncates the bad tail, which flatters a
 * scrappy card more than a sharp one. Both residuals curve the right way — a friend on the tee is a hand up
 * while your bag is thin and honest company once it isn't.
 */
export const PAIRING_BAR_SHIFT: Record<QualifierPairing, number> = { bestball: -2, scramble: -4.5 };

/** The per-hole ghost edge the opposing pair plays with in a `pair-match` event, by chapter (1..5). Gentle
 *  at the Emerald tier, sharpening as the galaxy frays — but always UNDER a Sigil rival's edge, because a
 *  qualifier is the road, not the destination. */
export function qualifierOppEdge(chapter: number): number {
  return 0.03 + 0.04 * (Math.max(1, Math.min(5, Math.round(chapter))) - 1);
}

/**
 * The opposing pair in a `pair-match` event is always TWO ghosts against your one real ball plus a
 * deliberately modest partner, so their edge is softened per pairing to pay for that asymmetry — the same
 * lever the Ch.5 finale uses (`FINALE_OPP_EDGE_SCALE`), measured rather than guessed. `scramble` needs less
 * relief (your shared ball is worth ~4.5 strokes and they take an extra assist bite); `bestball` needs more
 * (your side is one real card floored by a weak partner, theirs is a genuine best-of-two).
 */
export const QUALIFIER_MATCH_OPP_SHIFT: Record<QualifierPairing, number> = { scramble: -0.18, bestball: -0.35 };

/** The drawn shape of one qualifying event — everything the lobby, the round and the recap need. */
export interface QualifierPlan {
  courseId: string;
  /** The event world's own chapter (its tier), 1..5. */
  chapter: number;
  /** Nine holes (`QUALIFIER_HOLES`) — carried explicitly so every consumer reads one number. */
  holes: number;
  format: QualifierFormatId;
  /** Set for the three paired formats. */
  partnerId?: string;
  pairing?: QualifierPairing;
}

/** The seed a campaign's qualifier draw sheet hangs off: the campaign's own seed when it has one, else the
 *  protagonist (a pre-`campaignSeed` save still gets a stable, well-formed draw sheet). */
export function campaignDrawSeed(story: StoryState): string {
  return story.campaignSeed || story.characterId;
}

/**
 * The drawn plan for a qualifying event (pure, deterministic, zero sequential rng on any play stream).
 * Keyed off the campaign seed + the world, so it is stable for the life of a campaign — the dossier can
 * show it before you fly, a replay is the same test, and two campaigns draw different sheets. Returns
 * undefined for anything that isn't a charted story world.
 */
export function qualifierPlan(
  story: StoryState,
  courseId: string,
  /** GS-story-qualifier-partner-pick: the tour-mate the player CHOSE to play this event beside, from the
   *  star-map dossier's picker. Honoured whenever it's one of your three friends; anything else (absent, a
   *  stale id, the protagonist) falls back to the drawn suggestion — so a skipped picker still tees off
   *  cleanly and every existing caller is byte-for-byte unchanged. WHO you play with is the one part of the
   *  draw sheet that is yours: the format and the pairing are the draw's to set, the company is yours,
   *  which is what makes the partner tally a record of your choices rather than of the dice. */
  chosenPartnerId?: string,
): QualifierPlan | undefined {
  const w = storyWorldById(courseId);
  if (!w) return undefined;
  const rng = new Rng(`qualplan:${campaignDrawSeed(story)}:${courseId}`);
  const format = QUALIFIER_FORMATS[Math.min(QUALIFIER_FORMATS.length - 1, Math.floor(rng.float() * QUALIFIER_FORMATS.length))]!;
  const pairing: QualifierPairing = rng.float() < 0.5 ? 'scramble' : 'bestball';
  const others = otherGolferIds(story);
  const drawn = others[Math.min(others.length - 1, Math.floor(rng.float() * Math.max(1, others.length)))];
  const partnerId = chosenPartnerId && others.includes(chosenPartnerId) ? chosenPartnerId : drawn;
  const paired = isPairedFormat(format);
  return {
    courseId,
    chapter: w.unlockChapter,
    holes: QUALIFIER_HOLES,
    format,
    ...(paired && partnerId ? { partnerId, pairing } : {}),
  };
}

/** The tour-mates you may pick to play a qualifying event beside — your three friends (id + short name),
 *  the same pool the team Sigils offer. Empty-safe. */
export function qualifierPartnerPool(story: StoryState): { id: string; name: string }[] {
  return otherGolferIds(story).map((id) => ({ id, name: getCharacter(id)?.shortName ?? id }));
}

/**
 * The plan for a world that IS a qualifying event on the player's path right now (pure) — the gate every
 * caller wants, so the Sigil venue, the Earth prologue and an off-chart course never draw a plan. Undefined
 * when the world isn't a qualifying event.
 */
export function activeQualifierPlan(story: StoryState, courseId: string, chosenPartnerId?: string): QualifierPlan | undefined {
  // GS-story-qualifier-chapter-gate: a world charted AHEAD of its chapter (a caddy-home world you fly out to
  // early) is not a qualifying event yet — `isLiveStoryQualifier` is the one predicate the plan and the
  // resolution share, so an event you play is always an event that counts.
  return isLiveStoryQualifier(story, courseId) ? qualifierPlan(story, courseId, chosenPartnerId) : undefined;
}

/** The player-facing name of a format ("Two-ball best-ball"). */
export function qualifierFormatName(plan: QualifierPlan): string {
  const pair = plan.pairing === 'scramble' ? 'scramble' : 'best-ball';
  switch (plan.format) {
    case 'stroke':
      return 'Singles stroke play';
    case 'stableford':
      return 'Singles Stableford';
    case 'pair-stroke':
      return `Two-ball ${pair} · stroke play`;
    case 'pair-stableford':
      return `Two-ball ${pair} · Stableford`;
    case 'pair-match':
      return `Two-ball ${pair} · matchplay`;
  }
}

/** One line of "how this event is won", for the dossier + the round intro. */
export function qualifierFormatBlurb(plan: QualifierPlan): string {
  const partner = plan.partnerId ? getCharacter(plan.partnerId)?.shortName ?? 'your partner' : '';
  const share =
    plan.pairing === 'scramble'
      ? `You and ${partner} share one ball — the best of every shot.`
      : `You and ${partner} each play your own ball; the team keeps the lower score on every hole.`;
  switch (plan.format) {
    case 'stroke':
      return `Nine holes, your card alone against the field. Lowest scores qualify.`;
    case 'stableford':
      return `Nine holes for POINTS — par is 2, a birdie 3, and a blow-up hole costs a point, not the round. Highest points qualify.`;
    case 'pair-stroke':
      return `${share} Lowest team cards qualify.`;
    case 'pair-stableford':
      return `${share} Scored in POINTS — highest team totals qualify.`;
    case 'pair-match':
      return `${share} One pair across the tee, hole by hole — the lower team score takes the hole. Win or halve the match to qualify.`;
  }
}

/** A qualifying event's finished result, in whatever units its format is scored in. */
export interface QualifierRoundResult {
  plan: QualifierPlan;
  /** The finishing place (1 = winner) — for a matchplay event, the synthetic place the match earned. */
  place: number;
  /** You + the ghosts. */
  fieldSize: number;
  /** Finish inside this to qualify. */
  need: number;
  qualified: boolean;
  /** The ghost field, in finishing order (empty for a matchplay event, which has no board). */
  field: QualifierGhost[];
  /** Your posted score in the format's units (strokes, or points). Absent for matchplay. */
  playerScore?: number;
  /** Your own solo gross, always — the scorecard number. */
  playerGross: number;
  /** Your team's gross on a paired stroke/Stableford event. */
  teamGross?: number;
  /** How many holes your partner's ball beat yours (best-ball colour). */
  partnerCountedHoles?: number;
  /** A matchplay event's result. */
  match?: { scoreline: string; playerWon: boolean; halved: boolean; advances: boolean; thru: number; holesUp: number };
}

/** The two ghost ids that make up the opposing pair in a `pair-match` qualifier — flavour ids on their own
 *  seeded stream (they are a draw-sheet pairing, not campaign characters). */
function matchOpponentIds(courseId: string): [string, string] {
  return [`qual-opp-a:${courseId}`, `qual-opp-b:${courseId}`];
}

/** The opposing pair's display name in a `pair-match` qualifier — the top two names off the event's own
 *  stable line-up, so the pair you face is the pair the draw sheet showed. */
export function qualifierMatchOpponents(plan: QualifierPlan, totalPar: number): string {
  const field = qualifierField(plan.courseId, totalPar, plan.chapter, { holes: plan.holes, paired: true });
  return field[0]?.name ?? 'the draw';
}

/**
 * Your TEAM's per-hole score on a paired event (pure). A SCRAMBLE round was already played as the team (the
 * per-shot pick card / `scrambleOptsFor` — the played strokes ARE the shared ball), so they pass straight
 * through; a BEST-BALL round folds the partner's per-hole ghost off the SAME `storyPartnerBestBallScore`
 * stream the Sigil-2 reveal uses, and keeps the lower of the two.
 */
export function qualifierTeamHoleScores(
  playerHoleStrokes: readonly number[],
  pars: readonly number[],
  plan: QualifierPlan,
  seed: string,
): { holes: number[]; partnerCountedHoles: number } {
  const n = Math.min(playerHoleStrokes.length, pars.length);
  const holes: number[] = [];
  let partnerCountedHoles = 0;
  for (let i = 0; i < n; i++) {
    const solo = playerHoleStrokes[i]!;
    if (plan.pairing !== 'bestball' || !plan.partnerId) {
      holes.push(solo);
      continue;
    }
    const partner = storyPartnerBestBallScore(plan.partnerId, QUALIFIER_PARTNER_EDGE, seed, i, pars[i]!);
    if (partner < solo) partnerCountedHoles++;
    holes.push(Math.min(solo, partner));
  }
  return { holes, partnerCountedHoles };
}

/**
 * The MATCH state of a `pair-match` qualifier through the holes played so far (GS-story-qualifier-match-live,
 * pure). The single source the live HUD chip, the per-hole panel, the mid-round close-out AND the finished
 * resolution all read — pass every hole played so far for the live state, or the whole round for the finish,
 * and the two agree to the hole by construction (each hole's ghost cards are keyed by hole index, so a
 * prefix of the strokes gives exactly the prefix of the duels).
 *
 * Your side's card is folded HERE, by the same helper the stroke formats use — a shared ball passes through
 * (it was already played as the team), a best-ball takes the lower of your ball and the partner ghost off
 * the `:partner` stream. That matters twice over: the per-hole reveal on the end-of-hole screen draws that
 * exact ghost, so what you SEE is what scored; and the resolver is then handed a finished team card
 * (`playerTeamPlayed`), so it never folds a SECOND ally ghost on a different stream — which is what made the
 * match hinge on ghost noise instead of on your round.
 *
 * Returns undefined for any other format (they have a board, not a match).
 */
export function qualifierMatchThrough(
  plan: QualifierPlan,
  playerHoleStrokes: readonly number[],
  pars: readonly number[],
  seed: string,
): StoryMatchResult | undefined {
  if (plan.format !== 'pair-match') return undefined;
  const { holes: teamHoles } = qualifierTeamHoleScores(playerHoleStrokes, pars, plan, seed);
  return resolveStory2v2Match(
    teamHoles,
    plan.partnerId ?? '',
    QUALIFIER_PARTNER_EDGE,
    matchOpponentIds(plan.courseId),
    qualifierOppEdge(plan.chapter) + QUALIFIER_MATCH_OPP_SHIFT[plan.pairing ?? 'bestball'],
    seed,
    pars,
    plan.pairing ?? 'bestball',
    true,
  );
}

/**
 * Resolve a played qualifying event into a placement (pure, deterministic). Every format lands on the SAME
 * currency — a finishing place against the chapter's field — so the top-N gate, the recap and the
 * `qualifierResults` record are one shape no matter which road you took.
 *
 * The stroke/Stableford formats place you on the ghost ladder (sharpened by `PAIRING_BAR_SHIFT` when you
 * carried a partner, so the two-ball is variety and not a discount). Matchplay has no board, so it earns a
 * SYNTHETIC place off the campaign's matchplay convention — win outright and you top the draw, halve and
 * you scrape in on the number, lose and you sit one outside it — which keeps "win or halve to qualify" true
 * while feeding the same `recordQualifier` best-finish record.
 */
export function resolveQualifierRound(
  plan: QualifierPlan,
  playerHoleStrokes: readonly number[],
  pars: readonly number[],
  seed: string,
): QualifierRoundResult {
  const totalPar = pars.reduce((a, b) => a + b, 0);
  const playerGross = playerHoleStrokes.reduce((a, b) => a + b, 0);
  const need = qualifyTop(plan.chapter);
  const fieldSize = qualifierFieldSize(plan.chapter);
  const paired = isPairedFormat(plan.format);
  const barShift = paired && plan.pairing ? PAIRING_BAR_SHIFT[plan.pairing] : 0;

  if (plan.format === 'pair-match') {
    const res = qualifierMatchThrough(plan, playerHoleStrokes, pars, seed)!;
    const place = res.playerWon ? 1 : res.halved ? need : need + 1;
    return {
      plan,
      place,
      fieldSize,
      need,
      qualified: placeQualifies(place, plan.chapter),
      field: [],
      playerGross,
      match: {
        scoreline: res.scoreline,
        playerWon: res.playerWon,
        halved: res.halved,
        advances: res.playerAdvances,
        thru: res.thru,
        holesUp: res.holesUp,
      },
    };
  }

  const stableford = plan.format === 'stableford' || plan.format === 'pair-stableford';
  const field = qualifierField(plan.courseId, totalPar, plan.chapter, {
    // Scale the ghost ladder off the round ACTUALLY played, not the planned length — so the bar is honest
    // even if a round somehow ran short (a defensive resume), and identical to `plan.holes` in normal play.
    holes: pars.length,
    barShift,
    stableford,
    paired,
  });

  const team = paired
    ? qualifierTeamHoleScores(playerHoleStrokes, pars, plan, seed)
    : { holes: [...playerHoleStrokes], partnerCountedHoles: 0 };
  const cardHoles = team.holes;
  const cardGross = cardHoles.reduce((a, b) => a + b, 0);
  const playerScore = stableford
    ? cardHoles.reduce((sum, strokes, i) => sum + stablefordPoints(pars[i] ?? 4, strokes), 0)
    : cardGross;
  const place = stableford ? qualifierPlacementByPoints(field, playerScore) : qualifierPlacement(field, playerScore);

  return {
    plan,
    place,
    fieldSize,
    need,
    qualified: placeQualifies(place, plan.chapter),
    field,
    playerScore,
    playerGross,
    ...(paired ? { teamGross: cardGross, partnerCountedHoles: team.partnerCountedHoles } : {}),
  };
}
