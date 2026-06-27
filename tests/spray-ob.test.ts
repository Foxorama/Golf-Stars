import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { executeShot, shotSpread, playBounds, inBounds } from '../src/sim/round';
import { holeProjector } from '../src/render/project';
import { renderHoleSVG } from '../src/render/holeView';
import { CLUBS } from '../src/sim/clubs';
import { startingLoadout, netDispersion } from '../src/sim/rpg/economy';
import { beginHole, previewShot } from '../src/sim/rpg/play';
import type { Hole, Vec } from '../src/sim/course/contract';

const driver = CLUBS.find((c) => c.id === 'D')!;

// A tiny, contract-valid hole with a known small boundary, so OB is deterministic.
const tinyHole: Hole = {
  par: 4,
  tee: [0, 0],
  green: [0, 200],
  centreline: [
    [0, 0],
    [0, 200],
  ],
  features: [{ kind: 'fairway', poly: [[-15, 0], [15, 0], [15, 200], [-15, 200]] }],
  hazards: [],
};

describe('shotSpread (pure aiming preview)', () => {
  const hole = generateCourse(1234).holes[0]!;
  const ball = hole.tee;
  const pin = hole.green;

  it('points at the target, reaches ~the club carry, and spreads with a carry window', () => {
    const s = shotSpread(hole, ball, 'fairway', pin, driver, {});
    expect(s.expectedCarry).toBeGreaterThan(0);
    expect(s.lateralSd).toBeGreaterThan(0);
    expect(s.carrySd).toBeGreaterThan(0);
    // Lateral spread is wider than along-axis.
    expect(s.lateralSd).toBeGreaterThan(s.carrySd);
    // The driver can come up well short and tops out a touch long.
    expect(s.carryLow).toBeLessThan(s.expectedCarry);
    expect(s.carryHigh).toBeGreaterThan(s.expectedCarry);
    expect(s.carryLow).toBeLessThan(s.carryHigh * 0.7); // a wide window for the driver
  });

  it('the driver sprays ~half the carry sideways at the cone edge (wild, per design)', () => {
    const s = shotSpread(hole, ball, 'fairway', pin, driver, {});
    // Edge ≈ 2.5σ; for the driver that should be ~50% of the intended carry.
    const edge = 2.5 * s.lateralSd;
    const fullCarry = (s.carryHigh + s.carryLow) / 2 / 0.8; // back out intended-ish
    expect(edge / s.expectedCarry).toBeGreaterThan(0.35);
    expect(fullCarry).toBeGreaterThan(0);
  });

  it('a shorter club is tighter AND has a narrower carry window than the driver', () => {
    const drv = shotSpread(hole, ball, 'fairway', pin, driver, {});
    const five = shotSpread(hole, ball, 'fairway', pin, CLUBS.find((c) => c.id === '5i')!, {});
    // Per-club: the 5-iron sprays a smaller FRACTION of its carry than the driver.
    expect(five.lateralSd / five.expectedCarry).toBeLessThan(drv.lateralSd / drv.expectedCarry);
    const drvWindow = (drv.carryHigh - drv.carryLow) / drv.expectedCarry;
    const fiveWindow = (five.carryHigh - five.carryLow) / five.expectedCarry;
    expect(fiveWindow).toBeLessThan(drvWindow);
  });

  it('higher handicap = wider spray; a worse lie = wider still', () => {
    const scratch = shotSpread(hole, ball, 'fairway', pin, driver, { dispersionMult: 0.7 });
    const hacker = shotSpread(hole, ball, 'fairway', pin, driver, { dispersionMult: 1.6 });
    expect(hacker.lateralSd).toBeGreaterThan(scratch.lateralSd);

    const fairway = shotSpread(hole, ball, 'fairway', pin, driver, {});
    const rough = shotSpread(hole, ball, 'rough', pin, driver, {});
    expect(rough.lateralSd).toBeGreaterThan(fairway.lateralSd);
  });

  it('matches the dispersion the round sim actually uses (reads true)', () => {
    // previewShot must use the loadout's net dispersion, not a default of 1.
    const loadout = startingLoadout();
    const s = previewShot(beginHole(hole), { clubId: 'D', aim: 'attack' }, loadout);
    const direct = shotSpread(hole, hole.tee, 'tee', pin, driver, {
      dispersionMult: netDispersion(loadout),
    });
    expect(s.lateralSd).toBeCloseTo(direct.lateralSd, 6);
  });

  it('is deterministic', () => {
    expect(shotSpread(hole, ball, 'fairway', pin, driver, {})).toEqual(
      shotSpread(hole, ball, 'fairway', pin, driver, {}),
    );
  });
});

describe('out of bounds (stroke-and-distance)', () => {
  it('boundary contains the terrain but a far point is OB', () => {
    const b = playBounds(tinyHole);
    expect(inBounds(tinyHole, tinyHole.tee)).toBe(true);
    expect(inBounds(tinyHole, tinyHole.green)).toBe(true);
    expect(inBounds(tinyHole, [500, 0])).toBe(false);
    // A point just outside the fairway (in native rough) is still IN bounds — OB only
    // catches genuinely wild shots clear of the whole map.
    expect(inBounds(tinyHole, [20, 100])).toBe(true);
    expect(b.max[0]).toBeGreaterThan(15);
  });

  it('a shot sprayed off the map costs +1 and replays from the origin', () => {
    const from: Vec = [...tinyHole.tee] as Vec;
    // Aim a driver far sideways: the ~250yd carry lands well beyond the ±65yd boundary.
    const ex = executeShot(tinyHole, from, 'tee', [10000, 0], driver, { carryMult: 1 }, new Rng('ob'));
    expect(ex.log.penalty).toBe('ob');
    expect(ex.penaltyStrokes).toBe(1);
    expect(ex.ballAfter).toEqual(from); // stroke-and-distance: back to the start
    expect(ex.lieAfter).toBe('tee');
    expect(ex.holed).toBe(false);
  });

  it('a normal shot down the fairway is NOT OB', () => {
    const ex = executeShot(tinyHole, [0, 0], 'tee', [0, 150], CLUBS.find((c) => c.id === '8i')!, { carryMult: 1 }, new Rng('ok'));
    expect(ex.log.penalty).toBeUndefined();
  });
});

describe('render fit (never clip the ball off-map)', () => {
  const hole = generateCourse(1234).holes[0]!;
  // A point deliberately far outside the hole's terrain.
  const far: Vec = [hole.tee[0] + 800, hole.tee[1] + 800];

  it('including a far point in the fit keeps it on-screen', () => {
    const W = 320;
    const H = 460;
    const withExtra = holeProjector(hole, { width: W, height: H, extra: [far] });
    const [x, y] = withExtra.project(far);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(W);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(H);
  });

  it('without it, the far point projects off-screen (proving the fix matters)', () => {
    const W = 320;
    const H = 460;
    const noExtra = holeProjector(hole, { width: W, height: H });
    const [x, y] = noExtra.project(far);
    const off = x < 0 || x > W || y < 0 || y > H;
    expect(off).toBe(true);
  });
});

describe('spray cone render (SVG)', () => {
  const hole = generateCourse(1234).holes[0]!;
  it('draws the three-tier cone (green / orange / red) when a spray is supplied', () => {
    const spray = shotSpread(hole, hole.tee, 'tee', hole.green, driver, { dispersionMult: 1.2 });
    const svg = renderHoleSVG(hole, { width: 320, height: 460, spray });
    // Central likely wedge (green) + two SEPARATE orange flanks + two SEPARATE red hook/shank
    // flanks — none stacked under another, so each side band is its own polygon.
    expect(svg).toContain('rgba(95,212,90,0.30)');
    expect(svg.match(/rgba\(255,196,84,0\.18\)/g)!.length).toBe(2);
    expect(svg.match(/rgba\(255,76,76,0\.20\)/g)!.length).toBe(2);
  });
  it('labels each zone with an easy-to-read % of shots (≈80 / 8 / 2)', () => {
    const spray = shotSpread(hole, hole.tee, 'tee', hole.green, driver, { dispersionMult: 1.2 });
    const svg = renderHoleSVG(hole, { width: 320, height: 460, spray });
    // Defaults: 80% centre, 8% each orange flank, 2% each red flank (the hook/shank tail).
    expect(svg).toContain('>80%<');
    expect(svg.match(/>8%</g)!.length).toBe(2);
    expect(svg.match(/>2%</g)!.length).toBe(2);
  });
  it('omits the cone when no spray is supplied', () => {
    const svg = renderHoleSVG(hole, { width: 320, height: 460 });
    expect(svg).not.toContain('rgba(95,212,90,0.30)');
  });
});
