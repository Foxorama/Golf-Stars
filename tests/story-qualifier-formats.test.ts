import { describe, it, expect } from 'vitest';
import {
  QUALIFIER_FORMATS,
  QUALIFIER_PARTNER_EDGE,
  PAIRING_BAR_SHIFT,
  qualifierPlan,
  activeQualifierPlan,
  qualifierFormatName,
  qualifierFormatBlurb,
  qualifierPartnerPool,
  qualifierTeamHoleScores,
  qualifierMatchThrough,
  resolveQualifierRound,
  isPairedFormat,
  campaignDrawSeed,
  type QualifierPlan,
  type QualifierFormatId,
} from '../src/sim/rpg/storyQualifierFormats';
import { QUALIFIER_HOLES, qualifierField, qualifyTop, qualifierFieldSize } from '../src/sim/rpg/storyQualifiers';
import { storyPartnerBestBallScore } from '../src/sim/rpg/storyTeams';
import { TEAM_PARTNER_EDGE, tournamentForChapter } from '../src/sim/rpg/storyTournaments';
import { otherGolferIds } from '../src/sim/rpg/storyCast';
import { getCharacter } from '../src/sim/rpg/characters';
import { defaultStoryState, STORY_WORLDS, type StoryState } from '../src/sim/rpg/story';
import { initState, reduce } from '../src/ui/game';
import type { UiState } from '../src/ui/gameState';

/**
 * GS-story-qualifier-formats — the nine-hole, five-format qualifying event. The draw is a pure keyed hash
 * (so the sheet can be shown before you fly and a replay is the same test), every format lands on the same
 * currency (a finishing place), and the paired formats are priced so variety never becomes a difficulty
 * dice-roll.
 */

const CAMPAIGN = (seed = 'campaign-a', characterId = 'feather-fade'): StoryState => ({
  ...defaultStoryState(characterId),
  campaignSeed: seed,
  chapter: 1,
});

const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4]; // par 36 over nine
const TOTAL_PAR = PARS.reduce((a, b) => a + b, 0);

/** A flat round at `toPar` per hole. */
const round = (perHole: number): number[] => PARS.map((p) => Math.max(1, p + perHole));

const plan = (format: QualifierFormatId, over: Partial<QualifierPlan> = {}): QualifierPlan => ({
  courseId: 'verdant2-18',
  chapter: 1,
  holes: QUALIFIER_HOLES,
  format,
  ...(isPairedFormat(format) ? { partnerId: 'longshot-larry', pairing: 'bestball' as const } : {}),
  ...over,
});

describe('the qualifier DRAW SHEET (GS-story-qualifier-formats)', () => {
  it('is nine holes, one of the five formats, and deterministic per campaign + world', () => {
    const s = CAMPAIGN();
    for (const w of STORY_WORLDS) {
      const p = qualifierPlan(s, w.courseId)!;
      expect(p, w.courseId).toBeTruthy();
      expect(p.holes).toBe(QUALIFIER_HOLES);
      expect(QUALIFIER_FORMATS).toContain(p.format);
      expect(p.chapter).toBe(w.unlockChapter);
      // stable: the same campaign + world always draws the same sheet (the dossier can show it up front)
      expect(qualifierPlan(s, w.courseId)).toEqual(p);
    }
    expect(qualifierPlan(s, 'not-a-world')).toBeUndefined();
  });

  it('a PAIRED format carries a real tour-mate + a pairing; a solo format carries neither', () => {
    const s = CAMPAIGN();
    const mates = otherGolferIds(s);
    for (const w of STORY_WORLDS) {
      const p = qualifierPlan(s, w.courseId)!;
      if (isPairedFormat(p.format)) {
        expect(mates, `${w.courseId} partner`).toContain(p.partnerId);
        expect(['scramble', 'bestball']).toContain(p.pairing);
        // never the protagonist — you can't be drawn with yourself
        expect(p.partnerId).not.toBe(s.characterId);
      } else {
        expect(p.partnerId).toBeUndefined();
        expect(p.pairing).toBeUndefined();
      }
    }
  });

  it('two campaigns draw DIFFERENT sheets; a pre-v7 save still gets a stable one off the protagonist', () => {
    const a = STORY_WORLDS.map((w) => JSON.stringify(qualifierPlan(CAMPAIGN('seed-a'), w.courseId)));
    const b = STORY_WORLDS.map((w) => JSON.stringify(qualifierPlan(CAMPAIGN('seed-b'), w.courseId)));
    expect(a).not.toEqual(b);
    const legacy = { ...defaultStoryState('feather-fade') }; // no campaignSeed (a v6 blob)
    expect(campaignDrawSeed(legacy)).toBe('feather-fade');
    expect(qualifierPlan(legacy, 'verdant2-18')).toEqual(qualifierPlan(legacy, 'verdant2-18'));
  });

  it('the whole draw is EXERCISED across a campaign — every format and both pairings actually appear', () => {
    const seen = new Set<string>();
    const pairings = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd']) {
      for (const w of STORY_WORLDS) {
        const p = qualifierPlan(CAMPAIGN(`seed-${seed}`), w.courseId)!;
        seen.add(p.format);
        if (p.pairing) pairings.add(p.pairing);
      }
    }
    for (const f of QUALIFIER_FORMATS) expect(seen, `${f} never drawn`).toContain(f);
    expect([...pairings].sort()).toEqual(['bestball', 'scramble']);
  });

  it('activeQualifierPlan draws only for a world that IS a qualifying event (never the Sigil venue)', () => {
    const s = CAMPAIGN();
    const venue = tournamentForChapter(1)!.venueId;
    expect(activeQualifierPlan(s, venue)).toBeUndefined();
    expect(activeQualifierPlan(s, 'standrews-18')).toBeUndefined(); // the Earth prologue is off-chart
    const event = STORY_WORLDS.find((w) => w.unlockChapter === 1 && w.courseId !== venue)!;
    expect(activeQualifierPlan(s, event.courseId)).toBeTruthy();
  });

  it('every format has a readable name + a "how this is won" blurb naming the partner', () => {
    for (const format of QUALIFIER_FORMATS) {
      const p = plan(format);
      expect(qualifierFormatName(p).length).toBeGreaterThan(6);
      const blurb = qualifierFormatBlurb(p);
      expect(blurb.length).toBeGreaterThan(20);
      if (isPairedFormat(format)) expect(blurb).toContain('Larry');
    }
    expect(qualifierFormatName(plan('pair-stroke', { pairing: 'scramble' }))).toContain('scramble');
    expect(qualifierFormatName(plan('pair-stroke', { pairing: 'bestball' }))).toContain('best-ball');
  });
});

describe('the nine-hole FIELD (GS-story-qualifier-formats)', () => {
  it('the classic 18-hole call is byte-for-byte unchanged (no opts = the original ladder)', () => {
    for (let ch = 1; ch <= 5; ch++) {
      const classic = qualifierField('verdant2-18', 72, ch);
      expect(qualifierField('verdant2-18', 72, ch, {})).toEqual(classic);
      expect(qualifierField('verdant2-18', 72, ch, { holes: 18, barShift: 0 })).toEqual(classic);
    }
  });

  it('a nine-hole ladder asks the same golf PER HOLE — the bar halves with the round', () => {
    for (let ch = 1; ch <= 5; ch++) {
      const need = qualifyTop(ch);
      const bar18 = qualifierField('verdant2-18', 72, ch)[need - 1]!.gross - 72;
      const bar9 = qualifierField('verdant2-18', TOTAL_PAR, ch, { holes: 9 })[need - 1]!.gross - TOTAL_PAR;
      expect(Math.abs(bar9 - bar18 / 2), `chapter ${ch}`).toBeLessThanOrEqual(0.5); // rounding only
    }
  });

  it('a PAIRED field is pairs, and a STABLEFORD field carries points sorted high-first', () => {
    const pairs = qualifierField('verdant2-18', TOTAL_PAR, 1, { holes: 9, paired: true });
    expect(pairs.every((g) => g.name.includes(' & '))).toBe(true);
    const pts = qualifierField('verdant2-18', TOTAL_PAR, 1, { holes: 9, stableford: true });
    expect(pts.every((g) => typeof g.points === 'number')).toBe(true);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.points!).toBeLessThanOrEqual(pts[i - 1]!.points!);
  });
});

describe('resolving a qualifying event in its own units', () => {
  it('every format lands on the same currency — a place inside the chapter field', () => {
    for (const format of QUALIFIER_FORMATS) {
      const res = resolveQualifierRound(plan(format), round(0), PARS, 'seed');
      expect(res.need).toBe(qualifyTop(1));
      expect(res.fieldSize).toBe(qualifierFieldSize(1));
      expect(res.place).toBeGreaterThanOrEqual(1);
      expect(res.qualified).toBe(res.place <= res.need);
    }
  });

  it('a strong round qualifies and a wretched one misses, in EVERY format', () => {
    for (const format of QUALIFIER_FORMATS) {
      for (const pairing of isPairedFormat(format) ? (['scramble', 'bestball'] as const) : ([undefined] as const)) {
        const p = plan(format, pairing ? { pairing } : {});
        const label = `${format}/${pairing ?? 'solo'}`;
        expect(resolveQualifierRound(p, round(-2), PARS, 'seed').qualified, `${label} at -2/hole`).toBe(true);
        expect(resolveQualifierRound(p, round(6), PARS, 'seed').qualified, `${label} at +6/hole`).toBe(false);
      }
    }
  });

  it('YOUR round decides the event — a two-ball never plays itself (the partner-carry regression)', () => {
    // A partner ghost strong enough to cover a wreck makes the format a coin-flip on ghost noise. Every
    // paired format must separate a good card from a bad one by a wide margin.
    for (const format of ['pair-stroke', 'pair-stableford', 'pair-match'] as const) {
      for (const pairing of ['scramble', 'bestball'] as const) {
        const p = plan(format, { pairing });
        const good = resolveQualifierRound(p, round(-2), PARS, 'seed');
        const bad = resolveQualifierRound(p, round(6), PARS, 'seed');
        expect(good.place, `${format}/${pairing}`).toBeLessThan(bad.place);
      }
    }
  });

  it('STABLEFORD scores points (higher wins) and forgives one blow-up hole more than stroke play', () => {
    const solid = round(0);
    const blowUp = [...solid];
    blowUp[3] = PARS[3]! + 8; // one catastrophe
    const strokeMiss = resolveQualifierRound(plan('stroke'), blowUp, PARS, 'seed');
    const pointsMiss = resolveQualifierRound(plan('stableford'), blowUp, PARS, 'seed');
    expect(pointsMiss.playerScore).toBeGreaterThan(0);
    // the same wreck costs fewer places in points than in strokes — the whole reason the format exists
    expect(pointsMiss.place).toBeLessThan(strokeMiss.place);
  });

  it('a BEST-BALL team card is exactly the per-hole ghost the mid-round reveal shows (live ≡ final)', () => {
    const p = plan('pair-stroke', { pairing: 'bestball' });
    const strokes = round(1);
    const { holes } = qualifierTeamHoleScores(strokes, PARS, p, 'seed');
    for (let i = 0; i < PARS.length; i++) {
      const partner = storyPartnerBestBallScore(p.partnerId!, QUALIFIER_PARTNER_EDGE, 'seed', i, PARS[i]!);
      expect(holes[i]).toBe(Math.min(strokes[i]!, partner));
    }
    const res = resolveQualifierRound(p, strokes, PARS, 'seed');
    expect(res.teamGross).toBe(holes.reduce((a, b) => a + b, 0));
    expect(res.teamGross!).toBeLessThanOrEqual(res.playerGross);
  });

  it('a qualifier partner is WEAKER than a Sigil partner — company, not a carry', () => {
    // The event must turn on YOUR card. `app.ts` draws the per-hole reveal with this same edge on a
    // qualifier round (it branches on `run.storyQualifier`), so the ball revealed is the ball that scored.
    expect(QUALIFIER_PARTNER_EDGE).toBeLessThan(TEAM_PARTNER_EDGE);
  });

  it('a SCRAMBLE card passes through untouched — the shared ball was already played (never double-counted)', () => {
    const p = plan('pair-stroke', { pairing: 'scramble' });
    const strokes = round(0);
    expect(qualifierTeamHoleScores(strokes, PARS, p, 'seed').holes).toEqual(strokes);
    expect(resolveQualifierRound(p, strokes, PARS, 'seed').teamGross).toBe(strokes.reduce((a, b) => a + b, 0));
  });

  it('MATCHPLAY qualifies on a win OR a halve, and has a scoreline instead of a board', () => {
    const p = plan('pair-match', { pairing: 'bestball' });
    const strong = resolveQualifierRound(p, round(-3), PARS, 'seed');
    expect(strong.field).toEqual([]); // no ladder — a match has a scoreline
    expect(strong.match).toBeTruthy();
    expect(strong.match!.playerWon).toBe(true);
    expect(strong.place).toBe(1);
    expect(strong.qualified).toBe(true);
    const weak = resolveQualifierRound(p, round(6), PARS, 'seed');
    expect(weak.match!.playerWon).toBe(false);
    expect(weak.place).toBe(weak.need + 1); // one outside the bar — missed by a hair, replay to fix it
    expect(weak.qualified).toBe(false);
    // the convention: a halve still advances you
    expect(strong.match!.advances).toBe(true);
  });

  it('the paired bar shift PRICES IN the partner — a two-ball is variety, not a discount', () => {
    // Same card, scored solo vs as a two-ball: the ladder must have moved against you by roughly what the
    // partner is worth, so the two never diverge into "the easy format" and "the hard format".
    expect(PAIRING_BAR_SHIFT.bestball).toBeLessThan(0);
    expect(PAIRING_BAR_SHIFT.scramble).toBeLessThan(0);
    const solo = resolveQualifierRound(plan('stroke'), round(0), PARS, 'seed');
    const paired = resolveQualifierRound(plan('pair-stroke', { pairing: 'bestball' }), round(0), PARS, 'seed');
    expect(Math.abs(paired.place - solo.place)).toBeLessThanOrEqual(4);
  });
});

describe('the qualifying event, end to end through the reducer', () => {
  /** Dismiss any arrival lore beat so a test reaches the intro. */
  const pastLore = (s: UiState): UiState => {
    let out = s;
    while (out.screen === 'lore') out = reduce(out, { type: 'dismissLore' });
    return out;
  };

  /** A Chapter-1 campaign parked on the star map, with a known draw sheet. */
  const onMap = (seed = 'campaign-a'): UiState => {
    const story = { ...CAMPAIGN(seed), unlockedWorldIds: STORY_WORLDS.map((w) => w.courseId) };
    return { ...initState('run-seed', {}, undefined, story), screen: 'starTour' as const };
  };

  /** The first Chapter-1 event whose plan matches the predicate. */
  const eventWhere = (s: UiState, pred: (p: QualifierPlan) => boolean): string => {
    const venue = tournamentForChapter(1)!.venueId;
    const found = STORY_WORLDS.filter((w) => w.unlockChapter === 1 && w.courseId !== venue).find((w) => {
      const p = activeQualifierPlan(s.story!, w.courseId);
      return !!p && pred(p);
    });
    if (!found) throw new Error('no Chapter-1 event matched');
    return found.courseId;
  };

  it('a qualifying event tees off as NINE holes with its drawn format armed on the run', () => {
    const map = onMap();
    const world = eventWhere(map, () => true);
    const plan = activeQualifierPlan(map.story!, world)!;
    const intro = pastLore(reduce(map, { type: 'storyPlayWorld', courseId: world }));
    expect(intro.screen).toBe('intro');
    expect(intro.course.holes.length).toBe(QUALIFIER_HOLES);
    expect(intro.run.storyQualifier).toEqual(plan);
    // A paired draw arms the SAME co-op machinery the team Sigils use — nothing new is simulated, so the
    // per-shot scramble card, the per-hole best-ball reveal and `scrambleOptsFor` all just work.
    expect(intro.run.storyTournamentPartner).toBe(plan.partnerId);
    expect(intro.run.storyTeamFormat).toBe(plan.pairing);
  });

  it('a Sigil VENUE round is untouched — the pinned 18, no plan, no partner', () => {
    const map = onMap();
    const intro = pastLore(reduce(map, { type: 'storyPlayWorld', courseId: tournamentForChapter(1)!.venueId }));
    expect(intro.course.holes.length).toBe(18);
    expect(intro.run.storyQualifier).toBeUndefined();
    expect(intro.run.storyTeamFormat).toBeUndefined();
  });

  it('finishing a PAIRED event records the pairing into the tally the betrayal arc reads', () => {
    const map = onMap();
    const world = eventWhere(map, (p) => isPairedFormat(p.format));
    const plan = activeQualifierPlan(map.story!, world)!;
    const done = reduce(pastLore(reduce(map, { type: 'storyPlayWorld', courseId: world })), { type: 'play' });
    expect(done.screen).toBe('storyResult');
    expect(done.story!.qualifierPartners[world]).toBe(plan.partnerId);
    expect(done.story!.qualifierResults[world]).toBeTruthy();
    const q = done.lastStoryRound!.qualifier!;
    expect(q.formatId).toBe(plan.format);
    expect(q.partnerName).toBeTruthy();
    expect(q.pairing).toBe(plan.pairing);
  });

  it('a SOLO event records a result but no pairing (nobody stood beside you)', () => {
    const map = onMap();
    const world = eventWhere(map, (p) => !isPairedFormat(p.format));
    const done = reduce(pastLore(reduce(map, { type: 'storyPlayWorld', courseId: world })), { type: 'play' });
    expect(done.story!.qualifierResults[world]).toBeTruthy();
    expect(done.story!.qualifierPartners[world]).toBeUndefined();
    expect(done.lastStoryRound!.qualifier!.partnerName).toBeUndefined();
  });

  it('the recap carries a BOARD for a scored event and a SCORELINE for a matchplay one', () => {
    const map = onMap();
    const solo = eventWhere(map, (p) => p.format === 'stroke' || p.format === 'stableford');
    const scored = reduce(pastLore(reduce(map, { type: 'storyPlayWorld', courseId: solo })), { type: 'play' })
      .lastStoryRound!.qualifier!;
    expect(scored.leaderboard.length).toBeGreaterThan(1);
    expect(scored.match).toBeUndefined();
    // Find a matchplay draw in any campaign seed (not every sheet has one in Chapter 1).
    for (const seed of ['campaign-a', 'campaign-b', 'campaign-c', 'campaign-d', 'campaign-e']) {
      const m = onMap(seed);
      const venue = tournamentForChapter(1)!.venueId;
      const world = STORY_WORLDS.filter((w) => w.unlockChapter === 1 && w.courseId !== venue).find(
        (w) => activeQualifierPlan(m.story!, w.courseId)?.format === 'pair-match',
      );
      if (!world) continue;
      const q = reduce(pastLore(reduce(m, { type: 'storyPlayWorld', courseId: world.courseId })), { type: 'play' })
        .lastStoryRound!.qualifier!;
      expect(q.match).toBeTruthy();
      expect(q.match!.scoreline.length).toBeGreaterThan(0);
      expect(q.leaderboard).toEqual([]);
      return;
    }
    throw new Error('no Chapter-1 matchplay draw found across five campaign seeds');
  });
});

describe('a pair-match qualifier plays as a LIVE match (GS-story-qualifier-match-live)', () => {
  const matchPlan = plan('pair-match', { pairing: 'bestball' });

  it('the live state through N holes is exactly the PREFIX of the finish (live ≡ final)', () => {
    const strokes = round(0);
    const full = qualifierMatchThrough(matchPlan, strokes, PARS, 'seed')!;
    for (let n = 1; n <= strokes.length; n++) {
      const live = qualifierMatchThrough(matchPlan, strokes.slice(0, n), PARS, 'seed')!;
      // every duel the live state has read must be identical to the finished one
      for (let i = 0; i < live.duels.length; i++) expect(live.duels[i]).toEqual(full.duels[i]);
      expect(live.thru).toBeLessThanOrEqual(full.thru);
    }
    // …and the finished match is the same object the recap scores, so the chip can never drift from it.
    const res = resolveQualifierRound(matchPlan, strokes, PARS, 'seed');
    expect(res.match!.scoreline).toBe(full.scoreline);
    expect(res.match!.thru).toBe(full.thru);
  });

  it('the opponent card for a hole is knowable BEFORE you play it (the chip probes with a dummy stroke)', () => {
    // The HUD reads the opponent's number on the hole in play by appending a placeholder for your own
    // ball — their card must not depend on yours, or the chip would lie about what you have to beat.
    const strokes = round(0);
    const real = qualifierMatchThrough(matchPlan, strokes, PARS, 'seed')!;
    for (const dummy of [1, 9]) {
      const probe = qualifierMatchThrough(matchPlan, [...strokes.slice(0, 3), dummy], PARS, 'seed')!;
      expect(probe.duels[3]!.bossStrokes).toBe(real.duels[3]!.bossStrokes);
    }
  });

  it('a decided match CLOSES OUT mid-round, banking only the holes it ran and no partial record', () => {
    // Drive the REAL interactive loop on a campaign whose Chapter-1 event is drawn as a matchplay.
    for (const seed of ['q0', 'q2', 'q4', 'q5', 'campaign-a', 'campaign-b', 'campaign-c']) {
      const story = { ...CAMPAIGN(seed), unlockedWorldIds: STORY_WORLDS.map((w) => w.courseId) };
      const map = { ...initState('run-seed', {}, undefined, story), screen: 'starTour' as const };
      if (activeQualifierPlan(map.story!, 'verdant2-18')?.format !== 'pair-match') continue;

      let s: UiState = reduce(map, { type: 'storyPlayWorld', courseId: 'verdant2-18' });
      while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
      expect(s.course.holes.length).toBe(QUALIFIER_HOLES);
      s = reduce(s, { type: 'playInteractive' });
      let guard = 0;
      while (s.screen === 'playing') {
        if (guard++ > 400) throw new Error('round never resolved');
        while (s.play && !s.play.done && guard++ < 4000) s = reduce(s, { type: 'autoShotHole' });
        s = reduce(s, { type: 'holeComplete' });
      }
      expect(s.screen).toBe('storyResult');

      // Whatever the outcome, the invariant holds: the banked holes are exactly the holes the match ran,
      // and a round cut short never writes a record measuring a shorter test than the full event.
      const q = s.lastStoryRound!.qualifier!;
      expect(q.match).toBeTruthy();
      expect(s.played!.length).toBe(q.match!.thru);
      if (q.match!.thru < QUALIFIER_HOLES) expect(s.story!.worldBest['verdant2-18']).toBeUndefined();
      else expect(s.story!.worldBest['verdant2-18']).toBeTruthy();
      return;
    }
    throw new Error('no Chapter-1 matchplay draw found across the probed campaign seeds');
  });
});


describe('YOU pick the partner (GS-story-qualifier-partner-pick)', () => {
  it('a chosen tour-mate overrides the draw; the format + pairing stay the draw’s to set', () => {
    const s = CAMPAIGN();
    const world = STORY_WORLDS.find((w) => isPairedFormat(qualifierPlan(s, w.courseId)!.format))!.courseId;
    const drawn = qualifierPlan(s, world)!;
    const others = otherGolferIds(s);
    for (const mate of others) {
      const picked = qualifierPlan(s, world, mate)!;
      expect(picked.partnerId).toBe(mate);
      // the draw still owns everything except the company
      expect(picked.format).toBe(drawn.format);
      expect(picked.pairing).toBe(drawn.pairing);
      expect(picked.holes).toBe(drawn.holes);
    }
    // every friend is offered, and only friends
    expect(qualifierPartnerPool(s).map((p) => p.id)).toEqual(others);
  });

  it('an invalid pick falls back to the draw — a skipped picker still tees off cleanly', () => {
    const s = CAMPAIGN();
    const world = STORY_WORLDS.find((w) => isPairedFormat(qualifierPlan(s, w.courseId)!.format))!.courseId;
    const drawn = qualifierPlan(s, world)!;
    for (const bad of [undefined, '', 'not-a-golfer', s.characterId]) {
      expect(qualifierPlan(s, world, bad)!.partnerId, `pick "${bad}"`).toBe(drawn.partnerId);
    }
  });

  it('the pick reaches the ROUND and the betrayal tally — not the draw’s suggestion', () => {
    const story = { ...CAMPAIGN(), unlockedWorldIds: STORY_WORLDS.map((w) => w.courseId) };
    const map = { ...initState('run-seed', {}, undefined, story), screen: 'starTour' as const };
    const venue = tournamentForChapter(1)!.venueId;
    const world = STORY_WORLDS.filter((w) => w.unlockChapter === 1 && w.courseId !== venue).find((w) =>
      isPairedFormat(activeQualifierPlan(map.story!, w.courseId)!.format),
    )!.courseId;
    const drawn = activeQualifierPlan(map.story!, world)!;
    // Deliberately pick someone OTHER than the draw's suggestion.
    const chosen = otherGolferIds(map.story!).find((id) => id !== drawn.partnerId)!;

    let s: UiState = reduce(map, { type: 'storyPlayWorld', courseId: world, partnerId: chosen });
    while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
    expect(s.run.storyQualifier!.partnerId).toBe(chosen);
    expect(s.run.storyTournamentPartner).toBe(chosen); // the co-op machinery gets the chosen friend

    const done = reduce(s, { type: 'play' });
    // The event is recorded against the friend you CHOSE, so the tally is a record of your decisions.
    expect(done.story!.qualifierPartners[world]).toBe(chosen);
    expect(done.lastStoryRound!.qualifier!.partnerName).toBe(getCharacter(chosen)!.shortName);
  });
});
