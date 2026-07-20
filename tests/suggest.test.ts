import { describe, it, expect } from 'vitest';
import { suggestPlayerClub, aiClub, greenDepth, biomeCarryMult, shotSpread } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import type { Club } from '../src/sim/clubs';
import type { Hole, Vec } from '../src/sim/course/contract';

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
    const { front, back } = greenDepth(par3, par3.tee);
    const s = shotSpread(par3, par3.tee, 'tee', par3.green, suggested, { carryMult: cm });
    // The EXPECTED carry stops on the green (≤ the back) — it does NOT fly the green…
    expect(s.expectedCarry).toBeLessThanOrEqual(back + 1e-6);
    // …and it still reaches (max carry covers the front).
    expect(s.carryHigh).toBeGreaterThanOrEqual(front);
  });

  it('does NOT hand the driver to a mid-iron approach (regression: gated on min carry)', () => {
    // The driver's worst-case carry could fall short of a far-ish front, but its MEAN flies
    // way past — it must never be the suggestion for a green a 5-iron reaches.
    const cm = biomeCarryMult(par3);
    const suggested = suggestPlayerClub(par3, par3.tee, 'tee', CLUBS, { carryMult: cm });
    expect(suggested.id).not.toBe('D');
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

  // GS-neargreen-club: close to the green, the old "longest club that stays under the back edge" rule
  // dropped to the shortest club in the bag (the 20-yд Chipper) as soon as the next club up would fly the
  // back — leaving any pin past ~20 yд well short. It must now pick a club that can carry to the PIN.
  const DEFAULT_STORY_BAG = ['D', '5W', '3H', '5i', '7i', '9i', 'PW', 'SW', 'chip', 'putter'];
  const storyBag = DEFAULT_STORY_BAG.map((id) => CLUBS.find((c) => c.id === id)!);
  // A pin ~45 yд away, ball just off the front: the Sand Wedge (74) flies the back at full power, but the
  // Chipper (20) can't reach the flag — so the pick must be a club whose full carry ≥ the pin (dial down).
  const nearGreen: Hole = {
    par: 4,
    tee: [0, 0],
    green: [0, 45],
    centreline: [[0, 0], [0, 45]],
    features: [
      { kind: 'fairway', poly: [[-12, 0], [12, 0], [12, 30], [-12, 30]] },
      { kind: 'green', poly: [[-9, 38], [9, 38], [9, 52], [-9, 52]] },
    ],
    hazards: [],
  };

  it('does NOT drop to the Chipper for a ~45-yд pin in the sparse Story bag (near-green fix)', () => {
    const cm = biomeCarryMult(nearGreen);
    const ball: Vec = [0, 0];
    const s = suggestPlayerClub(nearGreen, ball, 'fairway', storyBag, { carryMult: cm });
    expect(s.id).not.toBe('chip');
    // The chosen club can actually carry to the flag (dialed down by the at-rest power seed).
    const reach = shotSpread(nearGreen, ball, 'fairway', nearGreen.green, s, { carryMult: cm });
    expect(reach.expectedCarry).toBeGreaterThanOrEqual(pinDist(nearGreen, ball) - 1e-6);
  });

  it('still picks the Chipper for a pin genuinely within its ~20-yд range', () => {
    const cm = biomeCarryMult(nearGreen);
    const ball: Vec = [0, 30]; // 15 yд from the [0,45] pin — a true short chip
    const s = suggestPlayerClub(nearGreen, ball, 'fringe', storyBag, { carryMult: cm });
    expect(s.id).toBe('chip');
  });
});

function pinDist(hole: Hole, ball: Vec): number {
  return Math.hypot(hole.green[0] - ball[0], hole.green[1] - ball[1]);
}
