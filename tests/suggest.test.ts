import { describe, it, expect } from 'vitest';
import { suggestPlayerClub, aiClub, greenDepth, biomeCarryMult, shotSpread } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import type { Club } from '../src/sim/clubs';
import type { Hole, Vec } from '../src/sim/course/contract';

const carry = (id: string) => CLUBS.find((c) => c.id === id)!.carry;
const longer = (a: Club, b: Club) => a.carry > b.carry;

// A short par-3: tee 150 yds from a green that spans ~140..160 along the line. Reachable.
const par3: Hole = {
  par: 3,
  tee: [0, 0],
  green: [0, 150],
  centreline: [[0, 0], [0, 150]],
  features: [
    { kind: 'fairway', poly: [[-12, 0], [12, 0], [12, 130], [-12, 130]] },
    { kind: 'green', poly: [[-10, 140], [10, 140], [10, 160], [-10, 160]] },
  ],
  hazards: [],
};

// A long par-5: green ~520 yds away — unreachable off the tee with any club.
const par5: Hole = {
  par: 5,
  tee: [0, 0],
  green: [0, 520],
  centreline: [[0, 0], [0, 520]],
  features: [
    { kind: 'fairway', poly: [[-15, 0], [15, 0], [15, 500], [-15, 500]] },
    { kind: 'green', poly: [[-10, 510], [10, 510], [10, 530], [-10, 530]] },
  ],
  hazards: [],
};

describe('suggestPlayerClub (green coverage)', () => {
  it('measures the green front/back along the approach line', () => {
    const d = greenDepth(par3, par3.tee);
    expect(d.front).toBeCloseTo(140, 0);
    expect(d.back).toBeCloseTo(160, 0);
  });

  it('on a reachable par-3, suggests a LONGER club than the auto aiClub (covers the green)', () => {
    const cm = biomeCarryMult(par3);
    const suggested = suggestPlayerClub(par3, par3.tee, 'tee', CLUBS, { carryMult: cm });
    const auto = aiClub(par3, par3.tee, par3.green, cm, CLUBS);
    expect(longer(suggested, auto) || suggested.id === auto.id).toBe(true);
    // The suggested club's spread can still reach the FRONT of the green (carryLow ≤ front).
    const s = shotSpread(par3, par3.tee, 'tee', par3.green, suggested, { carryMult: cm });
    expect(s.carryLow).toBeLessThanOrEqual(greenDepth(par3, par3.tee).front + 1e-6);
    // …and it can reach (carryHigh covers the front).
    expect(s.carryHigh).toBeGreaterThanOrEqual(greenDepth(par3, par3.tee).front);
  });

  it('on an unreachable par-5, suggests the longest club in the bag', () => {
    const cm = biomeCarryMult(par5);
    const suggested = suggestPlayerClub(par5, par5.tee, 'tee', CLUBS, { carryMult: cm });
    const longest = CLUBS.filter((c) => c.id !== 'putter').reduce((a, b) => (b.carry > a.carry ? b : a));
    expect(suggested.id).toBe(longest.id);
  });

  it('never suggests the putter for an approach', () => {
    const cm = biomeCarryMult(par3);
    const s = suggestPlayerClub(par3, [0, 120] as Vec, 'fairway', CLUBS, { carryMult: cm });
    expect(s.id).not.toBe('putter');
  });
});
