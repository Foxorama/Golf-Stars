import { describe, it, expect } from 'vitest';
import { psAggregate, type HoleStat } from '../src/sim/stats';

describe('psAggregate', () => {
  const holes: HoleStat[] = [
    { par: 4, strokes: 4, putts: 2, penalties: 0, fairwayHit: true }, // GIR (2 to green)
    { par: 3, strokes: 2, putts: 1, penalties: 0, fairwayHit: null }, // par-3, GIR, no fwy chance
    { par: 5, strokes: 7, putts: 3, penalties: 1, fairwayHit: false }, // 4 to green, par-3 reg? no
  ];

  it('computes totals and scoring average', () => {
    const s = psAggregate(holes);
    expect(s.holes).toBe(3);
    expect(s.totalStrokes).toBe(13);
    expect(s.totalPar).toBe(12);
    expect(s.toPar).toBe(1);
    expect(s.scoringAvg).toBeCloseTo(13 / 3);
  });

  it('excludes par-3s from fairway chances', () => {
    const s = psAggregate(holes);
    expect(s.fairwayChances).toBe(2);
    expect(s.fairwaysHit).toBe(1);
    expect(s.fairwayPct).toBeCloseTo(0.5);
  });

  it('derives greens-in-regulation from strokes-minus-putts', () => {
    const s = psAggregate(holes);
    // hole1: 4-2=2 <= 4-2 ✓ ; hole2: 2-1=1 <= 3-2 ✓ ; hole3: 7-3=4 <= 5-2=3 ✗
    expect(s.girCount).toBe(2);
  });

  it('counts putts and penalties and score buckets', () => {
    const s = psAggregate(holes);
    expect(s.totalPutts).toBe(6);
    expect(s.penalties).toBe(1);
    expect(s.pars).toBe(1); // hole1 par
    expect(s.birdiesOrBetter).toBe(1); // hole2 birdie
    expect(s.doublePlus).toBe(1); // hole3 +2
  });

  it('returns null fairwayPct when there are no chances', () => {
    const s = psAggregate([{ par: 3, strokes: 3, putts: 2, penalties: 0, fairwayHit: null }]);
    expect(s.fairwayPct).toBeNull();
  });
});
