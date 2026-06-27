import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import {
  DEFAULT_SHAPE,
  applyShapeMod,
  combineShapeMods,
  resolveShape,
  sprayBands,
  sprayAngleRms,
  resolveShot,
  type SprayShape,
} from '../src/sim/shot';
import { shotSpread } from '../src/sim/round';
import { renderHoleSVG } from '../src/render/holeView';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { loadoutFromPerks, startingLoadout, netDispersion } from '../src/sim/rpg/economy';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { type Hole, type Vec } from '../src/sim/course/contract';

const driver = CLUBS.find((c) => c.id === 'D')!;
const sum = (s: SprayShape) => s.green + s.hookL + s.sliceR + s.duckHookL + s.shankR;

describe('SprayShape model — zone probabilities & redistribution', () => {
  it('the default shape is 80/8/8/2/2 and sums to 1', () => {
    expect(sum(DEFAULT_SHAPE)).toBeCloseTo(1, 9);
    expect(DEFAULT_SHAPE.green).toBeCloseTo(0.8);
    expect(DEFAULT_SHAPE.hookL).toBeCloseTo(0.08);
    expect(DEFAULT_SHAPE.shankR).toBeCloseTo(0.02);
  });

  it('reducing a miss zone feeds the freed % straight to GREEN (and never the opposite side)', () => {
    const s = applyShapeMod(DEFAULT_SHAPE, { duckHookL: -1 }); // kill the left red
    expect(s.duckHookL).toBe(0);
    expect(s.green).toBeCloseTo(0.82); // the 2% went to green
    expect(s.shankR).toBeCloseTo(0.02); // the OTHER red is untouched
    expect(s.sliceR).toBeCloseTo(0.08);
    expect(sum(s)).toBeCloseTo(1, 9);
  });

  it('a pure trade-off (sums to zero) leaves green unchanged', () => {
    const s = applyShapeMod(DEFAULT_SHAPE, { duckHookL: -0.01, shankR: 0.01 }); // −1% duck-hook / +1% shank
    expect(s.green).toBeCloseTo(DEFAULT_SHAPE.green, 9); // green did not move
    expect(s.duckHookL).toBeCloseTo(0.01);
    expect(s.shankR).toBeCloseTo(0.03);
  });

  it('the draw-weighting trade-off cuts the slice while only nudging the hook (net fewer misses)', () => {
    const s = applyShapeMod(DEFAULT_SHAPE, { sliceR: -0.04, hookL: 0.02 });
    expect(s.sliceR).toBeCloseTo(0.04);
    expect(s.hookL).toBeCloseTo(0.1);
    expect(s.green).toBeGreaterThan(DEFAULT_SHAPE.green); // net −0.02 misses → a touch more green
  });

  it('caps total miss mass so green never goes negative', () => {
    const s = applyShapeMod(DEFAULT_SHAPE, { hookL: 5, sliceR: 5, duckHookL: 5, shankR: 5 });
    expect(s.green).toBeGreaterThanOrEqual(0.39);
    expect(sum(s)).toBeCloseTo(1, 6);
  });

  it('combineShapeMods adds deltas (global upgrade + per-club character skew)', () => {
    const c = combineShapeMods({ duckHookL: -1 }, { hookL: 0.05 });
    expect(c.duckHookL).toBe(-1);
    expect(c.hookL).toBe(0.05);
  });
});

describe('spray bands — proportional, asymmetric, zero-removal (the graphic geometry)', () => {
  const SIGMA = 0.2;
  it('a 2% red band is drawn a quarter the width of an 8% orange band (proportional to chance)', () => {
    const bands = sprayBands(DEFAULT_SHAPE, SIGMA);
    const orange = bands.find((b) => b.tier === 'orange')!;
    const red = bands.find((b) => b.tier === 'red')!;
    const oW = orange.a1 - orange.a0;
    const rW = red.a1 - red.a0;
    expect(rW / oW).toBeCloseTo(0.25, 2); // 2% / 8%
  });

  it('the GREEN wedge keeps its width even as its % rises (great shots land where they land)', () => {
    const g0 = sprayBands(DEFAULT_SHAPE, SIGMA).find((b) => b.tier === 'green')!;
    const richer = applyShapeMod(DEFAULT_SHAPE, { hookL: -0.06, sliceR: -0.06 }); // more green %
    const g1 = sprayBands(richer, SIGMA).find((b) => b.tier === 'green')!;
    expect(richer.green).toBeGreaterThan(DEFAULT_SHAPE.green);
    expect(g1.a1 - g1.a0).toBeCloseTo(g0.a1 - g0.a0, 9); // same wedge width
  });

  it('a zone reduced to 0 collapses to a zero-width band (vanishes from the display)', () => {
    const s = applyShapeMod(DEFAULT_SHAPE, { duckHookL: -1 });
    const bands = sprayBands(s, SIGMA);
    const leftRed = bands.find((b) => b.tier === 'red' && b.a0 < 0)!;
    expect(leftRed.prob).toBe(0);
    expect(leftRed.a1 - leftRed.a0).toBeCloseTo(0, 9);
    // The right red still has width.
    const rightRed = bands.find((b) => b.tier === 'red' && b.a0 > 0)!;
    expect(rightRed.a1 - rightRed.a0).toBeGreaterThan(0);
  });
});

// A windless flat fairway so the only spread is the angular spray.
const flat: Hole = {
  par: 4,
  tee: [0, 0],
  green: [0, 240],
  centreline: [[0, 0], [0, 240]],
  features: [{ kind: 'fairway', poly: [[-60, 0], [60, 0], [60, 240], [-60, 240]] }],
  hazards: [],
};

/** Classify a landing into a zone index by its signed angle off +Y against the shape's band edges. */
function zoneOf(shape: SprayShape, sigma: number, from: Vec, landing: Vec): string {
  const ang = Math.atan2(landing[0] - from[0], landing[1] - from[1]);
  const bands = sprayBands(shape, sigma);
  for (const b of bands) {
    if (ang < b.a0 - 1e-9 || ang > b.a1 + 1e-9) continue;
    if (b.tier === 'green') return 'green';
    return `${b.tier}${b.a1 <= 0 ? 'L' : 'R'}`;
  }
  return 'out';
}

describe('resolveShot honours the shape (physics == the graphic)', () => {
  const from: Vec = [0, 0];
  const aim: Vec = [0, 240];

  it('the sampled zone proportions match the shape probabilities (~80/8/8/2/2)', () => {
    const spread = shotSpread(flat, from, 'fairway', aim, driver, {});
    const sigma = spread.angleSpread;
    const counts: Record<string, number> = {};
    const N = 20000;
    const rng = new Rng('shape-sample');
    for (let i = 0; i < N; i++) {
      const r = resolveShot({ from, aim, club: driver, lie: 'fairway', rng });
      const z = zoneOf(DEFAULT_SHAPE, sigma, from, r.landing);
      counts[z] = (counts[z] ?? 0) + 1;
    }
    expect((counts['green'] ?? 0) / N).toBeGreaterThan(0.75);
    expect((counts['green'] ?? 0) / N).toBeLessThan(0.85);
    // Each red tail is rare (~2%).
    expect((counts['redL'] ?? 0) / N).toBeLessThan(0.04);
    expect((counts['redR'] ?? 0) / N).toBeLessThan(0.04);
  });

  it('killing the duck-hook means NO shot lands in the wild-left region', () => {
    const shape = applyShapeMod(DEFAULT_SHAPE, { duckHookL: -1 });
    const spread = shotSpread(flat, from, 'fairway', aim, driver, { shapeMod: { duckHookL: -1 } });
    const sigma = spread.angleSpread;
    // The left edge of the (now sole) left band — the orange hook — is the furthest left a ball can go.
    const bands = sprayBands(shape, sigma);
    const leftMost = Math.min(...bands.filter((b) => b.prob > 0).map((b) => b.a0));
    const rng = new Rng('no-duckhook');
    for (let i = 0; i < 8000; i++) {
      const r = resolveShot({ from, aim, club: driver, lie: 'fairway', shape, rng });
      const ang = Math.atan2(r.landing[0] - from[0], r.landing[1] - from[1]);
      expect(ang).toBeGreaterThanOrEqual(leftMost - 1e-6);
    }
  });

  it('an asymmetric shape sprays more one way than the other', () => {
    // Feather-like: suppress left, add right.
    const shape = applyShapeMod(DEFAULT_SHAPE, { duckHookL: -0.015, hookL: -0.05, sliceR: 0.05 });
    const rng = new Rng('asym');
    let left = 0;
    let right = 0;
    for (let i = 0; i < 8000; i++) {
      const r = resolveShot({ from, aim, club: driver, lie: 'fairway', shape, rng });
      if (r.landing[0] < -1e-6) left++;
      else if (r.landing[0] > 1e-6) right++;
    }
    // The central green cluster is symmetric, so it dilutes the skew — but the right still clearly wins.
    expect(right).toBeGreaterThan(left * 1.15);
  });

  it('the exposed angleSd matches the sampled RMS scatter of the shaped spray', () => {
    const shape = applyShapeMod(DEFAULT_SHAPE, { duckHookL: -1, hookL: -0.04 });
    const spread = shotSpread(flat, from, 'fairway', aim, driver, { shapeMod: { duckHookL: -1, hookL: -0.04 } });
    const rng = new Rng('rms');
    let sumSq = 0;
    const n = 12000;
    for (let i = 0; i < n; i++) {
      const r = resolveShot({ from, aim, club: driver, lie: 'fairway', shape, rng });
      const ang = Math.atan2(r.landing[0] - from[0], r.landing[1] - from[1]);
      sumSq += ang * ang;
    }
    const measured = Math.sqrt(sumSq / n);
    expect(measured).toBeGreaterThan(spread.angleSd * 0.85);
    expect(measured).toBeLessThan(spread.angleSd * 1.15);
    // sprayAngleRms is the source of truth.
    expect(spread.angleSd).toBeCloseTo(sprayAngleRms(shape, spread.angleSpread), 9);
  });
});

describe('shape upgrades — wired through the loadout & the round', () => {
  it('Anti-Hook Grip removes the duck-hook zone from the loadout shape', () => {
    const lo = loadoutFromPerks(['anti-duck-hook']);
    const shape = resolveShape(lo.shapeMod);
    expect(shape.duckHookL).toBe(0);
    expect(shape.green).toBeGreaterThan(DEFAULT_SHAPE.green);
  });

  it('Sweet-Spot Forging stacks: more stacks → more green', () => {
    const one = resolveShape(loadoutFromPerks(['sweet-spot']).shapeMod).green;
    const three = resolveShape(loadoutFromPerks(['sweet-spot', 'sweet-spot', 'sweet-spot']).shapeMod).green;
    expect(one).toBeGreaterThan(DEFAULT_SHAPE.green);
    expect(three).toBeGreaterThan(one);
  });

  it('Distance Control raises the lower carry of a wood (smaller min-max gap), not a wedge', () => {
    const hole = generateCourse(1234).holes[0]!;
    const base = startingLoadout();
    const dc = loadoutFromPerks(['distance-control', 'distance-control']);
    const wood = CLUBS.find((c) => c.id === '3W')!;
    const baseSpread = shotSpread(hole, hole.tee, 'tee', hole.green, wood, { dispersionMult: netDispersion(base) });
    const dcSpread = shotSpread(hole, hole.tee, 'tee', hole.green, wood, {
      dispersionMult: netDispersion(dc),
      minCarryBoost: dc.minCarryBoost,
      wedgeWindow: dc.wedgeWindow,
    });
    expect(dcSpread.carryLow).toBeGreaterThan(baseSpread.carryLow);
    // A wedge is unaffected by Distance Control.
    const wedge = CLUBS.find((c) => c.id === 'SW')!;
    const wBase = shotSpread(hole, hole.green, 'fairway', hole.green, wedge, { dispersionMult: netDispersion(base) });
    const wDc = shotSpread(hole, hole.green, 'fairway', hole.green, wedge, {
      dispersionMult: netDispersion(dc),
      minCarryBoost: dc.minCarryBoost,
      wedgeWindow: dc.wedgeWindow,
    });
    expect(wDc.carryLow).toBeCloseTo(wBase.carryLow, 6);
  });

  it('Wedge Touch tightens the wedge carry window (forward/back precision), not a driver', () => {
    const hole = generateCourse(1234).holes[0]!;
    const base = startingLoadout();
    const wt = loadoutFromPerks(['wedge-touch']);
    const wedge = CLUBS.find((c) => c.id === 'SW')!;
    const ball: Vec = [hole.green[0], hole.green[1] - 70];
    const wBase = shotSpread(hole, ball, 'fairway', hole.green, wedge, { dispersionMult: netDispersion(base) });
    const wWt = shotSpread(hole, ball, 'fairway', hole.green, wedge, {
      dispersionMult: netDispersion(wt),
      minCarryBoost: wt.minCarryBoost,
      wedgeWindow: wt.wedgeWindow,
    });
    const baseWindow = wBase.carryHigh - wBase.carryLow;
    const wtWindow = wWt.carryHigh - wWt.carryLow;
    expect(wtWindow).toBeLessThan(baseWindow); // window pulled in toward the mean
  });
});

/** Mean per-stop Stableford for a perk set — threads the full loadout (shape + carry controls). */
function meanStableford(perks: string[], n = 250): number {
  const lo = loadoutFromPerks(perks);
  let sf = 0;
  for (let s = 0; s < n; s++) {
    const c = generateCourse(`${s}:stop`, { holes: 6, distanceFromStart: s % 12 });
    const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
      bag: lo.bag,
      dispersionMult: netDispersion(lo),
      shapeMod: lo.shapeMod,
      minCarryBoost: lo.minCarryBoost,
      wedgeWindow: lo.wedgeWindow,
    });
    sf += playTotals(played.map((p) => p.record)).stableford;
  }
  return sf / n;
}

describe('new upgrades improve scoring (a power-up must feel like one)', () => {
  const base = meanStableford([]);
  it('killing miss zones raises mean per-stop Stableford', () => {
    expect(meanStableford(['anti-duck-hook', 'shank-guard'])).toBeGreaterThan(base);
    expect(meanStableford(['sweet-spot', 'sweet-spot'])).toBeGreaterThan(base);
  });
  it('distance & wedge control never lower scoring', () => {
    expect(meanStableford(['distance-control'])).toBeGreaterThanOrEqual(base - 0.2);
    expect(meanStableford(['wedge-touch'])).toBeGreaterThanOrEqual(base - 0.2);
  });
});

describe('asymmetric cone render — only the live zones appear', () => {
  const hole = generateCourse(1234).holes[0]!;
  it('a one-sided suppression drops one red band but keeps the other', () => {
    const spray = shotSpread(hole, hole.tee, 'tee', hole.green, driver, {
      dispersionMult: 1.2,
      shapeMod: { duckHookL: -1 },
    });
    const svg = renderHoleSVG(hole, { width: 320, height: 460, spray });
    // Only ONE red flank now (the shank), not two.
    expect(svg.match(/rgba\(255,76,76,0\.20\)/g)!.length).toBe(1);
    // Green % rose above 80.
    expect(svg).toMatch(/>(8[2-9]|9\d)%</);
  });
});
