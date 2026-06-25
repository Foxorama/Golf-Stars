import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { resolveShot } from '../src/sim/shot';
import { shotSpread } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import { dist, type Hole, type Vec } from '../src/sim/course/contract';

const driver = CLUBS.find((c) => c.id === 'D')!;

// A windless, flat fairway hole so the only spread is the random ANGULAR dispersion — no
// crosswind push to widen the distance envelope.
const flat: Hole = {
  par: 4,
  tee: [0, 0],
  green: [0, 240],
  centreline: [
    [0, 0],
    [0, 240],
  ],
  features: [{ kind: 'fairway', poly: [[-40, 0], [40, 0], [40, 240], [-40, 240]] }],
  hazards: [],
};

describe('angular dispersion (curved spray)', () => {
  it('NO landing finishes farther than the carry window — even a wide miss (box-corner bug gone)', () => {
    const from: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    const spread = shotSpread(flat, from, 'fairway', target, driver, { dispersionMult: 1.6 });
    const rng = new Rng('disp-bound');
    let maxDist = 0;
    for (let i = 0; i < 4000; i++) {
      const r = resolveShot({ from, aim: target, club: driver, lie: 'fairway', dispersionMult: 1.6, rng });
      const d = dist(from, r.landing);
      maxDist = Math.max(maxDist, d);
      // Distance from the tee is the sampled carry in EVERY direction, so it can never exceed
      // the high end of the carry window (no wind here). A tiny epsilon covers float error.
      expect(d).toBeLessThanOrEqual(spread.carryHigh + 1e-6);
    }
    // Sanity: the spread is real (some shots reach near the top of the window).
    expect(maxDist).toBeGreaterThan(spread.expectedCarry);
  });

  it('exposes an angular σ that matches the sampled scatter', () => {
    const from: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    const spread = shotSpread(flat, from, 'fairway', target, driver, { dispersionMult: 1 });
    expect(spread.angleSd).toBeGreaterThan(0);
    const rng = new Rng('disp-angle');
    // Measure the std-dev of the shot angle off the bearing (bearing here is straight up, +Y).
    let sumSq = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const r = resolveShot({ from, aim: target, club: driver, lie: 'fairway', dispersionMult: 1, rng });
      const ang = Math.atan2(r.landing[0] - from[0], r.landing[1] - from[1]); // angle off +Y
      sumSq += ang * ang;
    }
    const measured = Math.sqrt(sumSq / n);
    // Within ~15% of the advertised σ — the cone the UI draws reads true to the physics.
    expect(measured).toBeGreaterThan(spread.angleSd * 0.85);
    expect(measured).toBeLessThan(spread.angleSd * 1.15);
  });
});
