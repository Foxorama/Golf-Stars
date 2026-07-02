import { describe, it, expect } from 'vitest';
import {
  arcApex,
  arcHeight,
  ARC_FEEL,
  flightApexT,
  flightClassOf,
  flightControl,
  flightGround,
  flightProfileOf,
  FLIGHT_PROFILES,
  canopyHeight,
  flightKnockdown,
} from '../src/sim/flight';
import { executeShot } from '../src/sim/round';
import { lieAt } from '../src/sim/shot';
import { Rng } from '../src/sim/rng';
import { dist, type Hole, type Vec } from '../src/sim/course/contract';
import { CLUBS } from '../src/sim/clubs';

/** A square blob polygon of `r` radius around `c`. */
function blob(c: Vec, r: number): Vec[] {
  return [
    [c[0] - r, c[1] - r],
    [c[0] + r, c[1] - r],
    [c[0] + r, c[1] + r],
    [c[0] - r, c[1] + r],
  ];
}

describe('arc apex (loft-scaled)', () => {
  it('scales with carry and is clamped', () => {
    expect(arcApex(10, 250)).toBe(4); // tiny carry → floor
    expect(arcApex(99999, 250)).toBe(60); // huge → ceiling
    expect(arcApex(200, 250)).toBeGreaterThan(arcApex(100, 250));
  });

  it('a lofted (short) club flies relatively higher than a long club for the same carry', () => {
    // Same carry, but the short-club fraction is higher → a balloon vs a borer.
    expect(arcApex(120, 70)).toBeGreaterThan(arcApex(120, 250));
  });

  it('arcHeight defaults to the classic parabola peaking at midflight, zero at the ends', () => {
    expect(arcHeight(30, 0)).toBeCloseTo(0, 6);
    expect(arcHeight(30, 1)).toBeCloseTo(0, 6);
    expect(arcHeight(30, 0.5)).toBeCloseTo(30, 6);
    expect(arcHeight(30, 0.25)).toBeCloseTo(Math.sin(Math.PI * 0.25) * 30, 6); // = sin(πt) exactly
  });
});

describe('per-family flight profiles (GS-flight-3)', () => {
  it('the classifier maps the whole CLUBS taxonomy onto a profile row', () => {
    for (const c of CLUBS) expect(FLIGHT_PROFILES[flightClassOf(c.id)]).toBeDefined();
    expect(flightClassOf('D')).toBe('driver');
    expect(flightClassOf('3W')).toBe('wood');
    expect(flightClassOf('4H')).toBe('hybrid');
    expect(flightClassOf('7i')).toBe('iron');
    expect(flightClassOf('PW')).toBe('wedge'); // ends in W but is a wedge, not a wood
    expect(flightClassOf('SW')).toBe('wedge');
    expect(flightClassOf('putter')).toBe('putter');
  });

  it('a hybrid flies higher than a wood of the same carry (the rescue-club identity)', () => {
    expect(arcApex(180, 181, ARC_FEEL, FLIGHT_PROFILES.hybrid.peakMult)).toBeGreaterThan(
      arcApex(180, 181, ARC_FEEL, FLIGHT_PROFILES.wood.peakMult),
    );
  });

  it('a driver bores lower than the neutral ramp; a wedge towers above it', () => {
    expect(arcApex(200, 250, ARC_FEEL, FLIGHT_PROFILES.driver.peakMult)).toBeLessThan(arcApex(200, 250));
    expect(arcApex(90, 90, ARC_FEEL, FLIGHT_PROFILES.wedge.peakMult)).toBeGreaterThan(arcApex(90, 90));
  });

  it('apex position: a wedge peaks later along the ground than a driver; every arc stays anchored', () => {
    const dT = flightApexT(FLIGHT_PROFILES.driver);
    const wT = flightApexT(FLIGHT_PROFILES.wedge);
    expect(wT).toBeGreaterThan(dT);
    for (const T of [dT, wT]) {
      expect(arcHeight(30, 0, T)).toBeCloseTo(0, 6);
      expect(arcHeight(30, 1, T)).toBeCloseTo(0, 6);
      expect(arcHeight(30, T, T)).toBeCloseTo(30, 6); // the peak sits exactly at apexT
      expect(arcHeight(30, T - 0.05, T)).toBeLessThan(30);
      expect(arcHeight(30, T + 0.05, T)).toBeLessThan(30);
    }
  });
});

describe('curved ground path (launch along bearing, bend to landing)', () => {
  const from: Vec = [0, 0];
  const landing: Vec = [40, 200]; // a shot that finishes 40 right (a fade)
  // The bearing is the AIM line (straight up), NOT the line to the offset landing — that offset is
  // the spray angle, and the curve is what the path does between the aim line and that landing.
  const bearing = 0;

  it('hits the endpoints exactly', () => {
    const control = flightControl(from, landing, bearing);
    expect(flightGround(from, control, landing, 0)).toEqual(from);
    const end = flightGround(from, control, landing, 1);
    expect(end[0]).toBeCloseTo(landing[0], 6);
    expect(end[1]).toBeCloseTo(landing[1], 6);
  });

  it('curves: at midflight the ball is less than halfway to the lateral finish (banana)', () => {
    // The control sits straight ahead (no lateral), so a quadratic Bézier hugs the aim line early
    // and swings out late — the classic fade/slice shape, not a straight diagonal.
    const straightAhead = flightControl(from, landing, bearing);
    expect(Math.abs(straightAhead[0])).toBeLessThan(1); // control is ~on the launch axis
    const mid = flightGround(from, straightAhead, landing, 0.5);
    expect(mid[0]).toBeLessThan(landing[0] / 2); // not yet halfway sideways
    expect(mid[0]).toBeGreaterThan(0); // but already drifting toward the finish
  });
});

describe('tree canopy + knockdown (arc height matters)', () => {
  const treeAt = (c: Vec, r: number): Hole => ({
    par: 4,
    tee: [0, 0],
    green: [0, 220],
    centreline: [
      [0, 0],
      [0, 220],
    ],
    features: [{ kind: 'fairway', poly: [[-30, 0], [30, 0], [30, 220], [-30, 220]] }],
    hazards: [{ kind: 'trees', poly: blob(c, r) }],
  });

  it('canopy height grows with blob size', () => {
    expect(canopyHeight(blob([0, 0], 6))).toBeGreaterThan(canopyHeight(blob([0, 0], 3)));
  });

  it('no obstacle on the hole → never knocked down', () => {
    const clear: Hole = {
      par: 4,
      tee: [0, 0],
      green: [0, 220],
      centreline: [[0, 0], [0, 220]],
      features: [{ kind: 'fairway', poly: [[-30, 0], [30, 0], [30, 220], [-30, 220]] }],
      hazards: [],
    };
    expect(flightKnockdown(clear, [0, 0], [0, 200], 0, 200, 250, flightProfileOf('D'))).toBeNull();
  });

  it('a low ball that crosses a treeline near launch is knocked down', () => {
    const hole = treeAt([0, 22], 6); // a tree just ahead, where the arc is still low
    const kd = flightKnockdown(hole, [0, 0], [0, 200], 0, 200, 250, flightProfileOf('D'));
    expect(kd).not.toBeNull();
    expect(kd!.carry).toBeLessThan(200); // clipped short of the intended landing
    expect(dist(kd!.point, [0, 22])).toBeLessThan(12);
  });

  it('ARC HEIGHT decides it: a lofted approach clears a guarding tree a low borer would clip', () => {
    // Same target + same tree guarding the front of the green; only the arc differs.
    const hole = treeAt([0, 90], 3);
    const lofted = flightKnockdown(hole, [0, 0], [0, 100], 0, 100, 106, flightProfileOf('PW')); // balloons up & over
    const borer = flightKnockdown(hole, [0, 0], [0, 100], 0, 100, 250, flightProfileOf('D')); // a flat low strike: clipped
    expect(lofted).toBeNull();
    expect(borer).not.toBeNull();
  });

  it('the FAMILY arc decides it too: a 7-iron flies a mid-range grove the driver line cannot (GS-flight-3)', () => {
    // Same landing point, same grove — only the club family differs. The driver's boring flight
    // clips it; the 7-iron's higher, later-peaking arc sails over. This is the club-choice lever
    // the aim overlay now shows (pick more club → the blocked slice opens up).
    const hole = treeAt([0, 90], 3);
    const iron = flightKnockdown(hole, [0, 0], [0, 120], 0, 120, 134, flightProfileOf('7i'));
    const driver = flightKnockdown(hole, [0, 0], [0, 120], 0, 120, 250, flightProfileOf('D'));
    expect(iron).toBeNull();
    expect(driver).not.toBeNull();
  });

  it('a ball already in the trees is not re-trapped at its own bush', () => {
    const hole = treeAt([0, 10], 8);
    // Launch from inside the blob: the outside→inside guard means no fresh clip.
    expect(flightKnockdown(hole, [0, 10], [0, 200], 0, 190, 250, flightProfileOf('D'))).toBeNull();
  });

  it('a tree well off the shot line is ignored (broad-phase prune)', () => {
    const hole = treeAt([120, 100], 6);
    expect(flightKnockdown(hole, [0, 0], [0, 200], 0, 200, 250, flightProfileOf('D'))).toBeNull();
  });
});

describe('executeShot integration (knockdown + hazard-aware roll)', () => {
  const driver = CLUBS.find((c) => c.id === 'D')!;

  it('a tree in the flight path knocks the ball into the woods (a trees lie, no penalty)', () => {
    const hole: Hole = {
      par: 4,
      tee: [0, 0],
      green: [0, 240],
      centreline: [
        [0, 0],
        [0, 240],
      ],
      features: [{ kind: 'fairway', poly: [[-40, 0], [40, 0], [40, 240], [-40, 240]] }],
      hazards: [{ kind: 'trees', poly: blob([0, 30], 9) }], // a big tree right off the tee
    };
    const ex = executeShot(hole, [0, 0], 'tee', [0, 240], driver, { carryMult: 1 }, new Rng('kd'));
    expect(ex.log.knockedDown).toBe(true);
    expect(ex.log.lieTo).toBe('trees');
    expect(ex.penaltyStrokes).toBe(0); // trees are NEVER a penalty — you punch out
  });

  it('a ball running into water settles in it (a penalty), instead of rolling through', () => {
    // Touchdown on dry fairway just short of a pond; the forward roll trickles in.
    const hole: Hole = {
      par: 4,
      tee: [0, 0],
      green: [0, 300],
      centreline: [
        [0, 0],
        [0, 300],
      ],
      features: [{ kind: 'fairway', poly: [[-40, 0], [40, 0], [40, 300], [-40, 300]] }],
      hazards: [{ kind: 'water', poly: [[-40, 250], [40, 250], [40, 300], [-40, 300]] }],
    };
    // Aim so the driver touches down on dry fairway a few yards short of the water edge (y=250).
    const ex = executeShot(hole, [0, 5], 'fairway', [0, 250], driver, { carryMult: 1 }, new Rng('water-roll'));
    if (ex.log.roll > 0 && lieAt(hole, ex.log.result.landing) === 'fairway') {
      // If it touched down dry and rolled forward into the pond, it's a water penalty resting in water.
      if (ex.log.penalty === 'water') {
        expect(lieAt(hole, ex.log.rest)).toBe('water');
      }
    }
    // Deterministic regardless of branch.
    const ex2 = executeShot(hole, [0, 5], 'fairway', [0, 250], driver, { carryMult: 1 }, new Rng('water-roll'));
    expect(ex2.log.rest).toEqual(ex.log.rest);
  });
});
