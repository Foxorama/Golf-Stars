/**
 * GS-story-team-format — the pure TEAM tournament engine (Sigils 1/2 team stroke + Sigil 5 2v2 matchplay).
 * Deterministic, ghost-based, auto ≡ interactive by construction (the player's card is their resolved round).
 */
import { describe, it, expect } from 'vitest';
import {
  teamHoleScore,
  resolveStoryTeamStroke,
  resolveStory2v2Match,
  opposingField,
  type OpposingPair,
} from '../src/sim/rpg/storyTeams';

const PARS = Array.from({ length: 18 }, () => 4); // par 72
const evenRound = PARS.slice();
const birdieRound = PARS.map((p) => p - 1); // all birdies (a strong grown-bag round)
const poorRound = PARS.map((p) => p + 2); // all double bogeys

const PAIRS: OpposingPair[] = [
  { id: 'rival', name: 'Venoma & Fang', golferIds: ['venoma', 'longshot-larry'], edge: 0.18 },
  { id: 'rando1', name: 'The Nobodies', golferIds: ['huang-woo-hook', 'feather-fade'], edge: 0.02 },
  { id: 'rando2', name: 'The Also-Rans', golferIds: ['backspin-bo', 'venoma'], edge: 0.0 },
];

describe('GS-story-team-format — team hole maths', () => {
  it('a team hole score is the best (fewest strokes) of its cards', () => {
    expect(teamHoleScore([4, 3, 5])).toBe(3);
    expect(teamHoleScore([5])).toBe(5);
  });
});

describe('GS-story-team-format — team STROKE majors (Sigils 1 & 2)', () => {
  it('is deterministic from the seed', () => {
    const a = resolveStoryTeamStroke(evenRound, 'feather-fade', 0.05, PAIRS, 'seed-1', PARS, 'bestball');
    const b = resolveStoryTeamStroke(evenRound, 'feather-fade', 0.05, PAIRS, 'seed-1', PARS, 'bestball');
    expect(a).toEqual(b);
  });

  it('the partner only ever HELPS: team total ≤ your solo total (best-ball)', () => {
    const r = resolveStoryTeamStroke(evenRound, 'feather-fade', 0.05, PAIRS, 'seed-2', PARS, 'bestball');
    expect(r.playerTeamTotal).toBeLessThanOrEqual(r.playerSoloTotal);
    expect(r.partnerCountedHoles).toBeGreaterThanOrEqual(0);
  });

  it('scramble scores ≤ best-ball for the SAME round (more bites can only lower the team score)', () => {
    const bb = resolveStoryTeamStroke(evenRound, 'feather-fade', 0.05, PAIRS, 'seed-3', PARS, 'bestball');
    const sc = resolveStoryTeamStroke(evenRound, 'feather-fade', 0.05, PAIRS, 'seed-3', PARS, 'scramble');
    expect(sc.playerTeamTotal).toBeLessThanOrEqual(bb.playerTeamTotal);
  });

  it('a strong round wins the major; a poor round loses it', () => {
    const strong = resolveStoryTeamStroke(birdieRound, 'feather-fade', 0.05, PAIRS, 'seed-4', PARS, 'bestball');
    const weak = resolveStoryTeamStroke(poorRound, 'feather-fade', 0.05, PAIRS, 'seed-4', PARS, 'bestball');
    expect(strong.won).toBe(true);
    expect(weak.won).toBe(false);
  });

  it('the opposing field is sorted low→high and the best-opponent number is the leader', () => {
    const r = resolveStoryTeamStroke(evenRound, 'feather-fade', 0.05, PAIRS, 'seed-5', PARS, 'bestball');
    const totals = r.field.map((p) => p.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(r.bestOpponentTotal).toBe(r.field[0]!.total);
    expect(r.field).toHaveLength(PAIRS.length);
  });

  it('opposingField totals: scramble ≤ best-ball for each pair (the field scrambles too)', () => {
    const bb = opposingField(PAIRS, 'seed-6', PARS, 'bestball');
    const sc = opposingField(PAIRS, 'seed-6', PARS, 'scramble');
    for (const p of PAIRS) {
      const b = bb.find((x) => x.id === p.id)!.total;
      const s = sc.find((x) => x.id === p.id)!.total;
      expect(s).toBeLessThanOrEqual(b);
    }
  });
});

describe('GS-story-team-format — 2v2 matchplay finale (Sigil 5 scrambles; best-ball is the back-compat variant)', () => {
  it('is deterministic from the seed', () => {
    const a = resolveStory2v2Match(evenRound, 'feather-fade', 0.05, ['venoma', 'backspin-bo'], 0.2, 'm-1', PARS);
    const b = resolveStory2v2Match(evenRound, 'feather-fade', 0.05, ['venoma', 'backspin-bo'], 0.2, 'm-1', PARS);
    expect(a).toEqual(b);
  });

  it('a scramble finale is deterministic and reads win-or-halve advances', () => {
    const a = resolveStory2v2Match(evenRound, 'feather-fade', 0.05, ['venoma', 'backspin-bo'], 0.12, 'm-sc', PARS, 'scramble');
    const b = resolveStory2v2Match(evenRound, 'feather-fade', 0.05, ['venoma', 'backspin-bo'], 0.12, 'm-sc', PARS, 'scramble');
    expect(a).toEqual(b);
    expect(a.playerAdvances).toBe(a.playerWon || a.halved);
  });

  it('a birdie-a-hole round beats a modest opposing pair; win-or-halve advances', () => {
    const r = resolveStory2v2Match(birdieRound, 'feather-fade', 0.08, ['venoma', 'backspin-bo'], 0.05, 'm-2', PARS);
    expect(r.playerWon).toBe(true);
    expect(r.playerAdvances).toBe(true);
    expect(r.scoreline.length).toBeGreaterThan(0);
    expect(r.thru).toBeGreaterThan(0);
    expect(r.thru).toBeLessThanOrEqual(18);
  });

  it('a poor round against a sharp pair loses the match', () => {
    const r = resolveStory2v2Match(poorRound, 'feather-fade', 0.0, ['venoma', 'longshot-larry'], 0.5, 'm-3', PARS);
    expect(r.playerWon).toBe(false);
  });

  it('playerAdvances = win OR halve (never a loss)', () => {
    for (const seed of ['m-a', 'm-b', 'm-c', 'm-d']) {
      const r = resolveStory2v2Match(evenRound, 'feather-fade', 0.05, ['venoma', 'backspin-bo'], 0.12, seed, PARS);
      expect(r.playerAdvances).toBe(r.playerWon || r.halved);
    }
  });
});
