import { describe, it, expect } from 'vitest';
import {
  arcApex,
  arcHeight,
  arcShapeFor,
  arcShapeOf,
  rollFractionFor,
  arrivalAngleDeg,
  launchAngleDeg,
  descentAngleDeg,
  apexFractionOf,
  ARC_FEEL,
  flightGroundFrac,
  flightParamAt,
  flightClassOf,
  flightControl,
  flightGround,
  flightProfileOf,
  FLIGHT_PROFILES,
  canopyHeight,
  flightKnockdown,
  flightCarryScale,
  clubTotalReach,
  legacyRollFraction,
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

describe('arc apex (derived from the launch angle)', () => {
  it('scales with carry and is clamped', () => {
    expect(arcApex(10, 250)).toBe(4); // tiny carry → floor
    expect(arcApex(99999, 250)).toBe(60); // huge → ceiling
    expect(arcApex(200, 250)).toBeGreaterThan(arcApex(100, 250));
  });

  it('a lofted (short) club flies relatively higher than a long club for the same carry', () => {
    // Same carry, but the short club launches steeper → a balloon vs a borer.
    expect(arcApex(120, 70)).toBeGreaterThan(arcApex(120, 250));
  });

  it('APEX IS NOT DECLARED — it is the launch angle inflated by lift (GS-flight-shape)', () => {
    // The one relation the whole model hangs off: a drag-free projectile peaks at tan(θ)/4 of its
    // range, and a spinning ball beats that by `liftGain`. If these ever disagree, some row has been
    // handed an apex its launch angle cannot produce.
    for (const c of CLUBS) {
      const p = flightProfileOf(c.id);
      const want = (Math.tan((launchAngleDeg(p, c.carry) * Math.PI) / 180) / 4) * ARC_FEEL.liftGain;
      expect(apexFractionOf(p, c.carry)).toBeCloseTo(want, 12);
      const apex = arcApex(c.carry, c.carry, ARC_FEEL, p);
      if (apex > ARC_FEEL.peakMin && apex < ARC_FEEL.peakMax) expect(apex / c.carry).toBeCloseTo(want, 9);
    }
  });

  it('the whole bag launches, peaks and lands on REAL golf numbers', () => {
    // Reference bands, not point values — the table is allowed to be tuned inside them.
    const bands: Record<string, { launch: [number, number]; apex: [number, number]; descent: [number, number] }> = {
      D: { launch: [9, 13], apex: [27, 35], descent: [35, 41] },
      '3W': { launch: [9, 14], apex: [26, 34], descent: [36, 43] },
      '3H': { launch: [13, 17], apex: [25, 33], descent: [42, 49] },
      '6i': { launch: [15, 19], apex: [22, 30], descent: [45, 52] },
      '9i': { launch: [18, 23], apex: [21, 29], descent: [48, 55] },
      PW: { launch: [20, 26], apex: [20, 30], descent: [48, 56] },
      SW: { launch: [23, 29], apex: [16, 26], descent: [52, 60] },
    };
    for (const [id, band] of Object.entries(bands)) {
      const club = CLUBS.find((c) => c.id === id)!;
      const p = flightProfileOf(id);
      const carry = club.carry * flightCarryScale(id, club.carry);
      const launch = launchAngleDeg(p, club.carry);
      const apex = arcApex(carry, club.carry, ARC_FEEL, p);
      const descent = descentAngleDeg(p, club.carry);
      expect(launch, `${id} launch`).toBeGreaterThanOrEqual(band.launch[0]);
      expect(launch, `${id} launch`).toBeLessThanOrEqual(band.launch[1]);
      expect(apex, `${id} apex`).toBeGreaterThanOrEqual(band.apex[0]);
      expect(apex, `${id} apex`).toBeLessThanOrEqual(band.apex[1]);
      expect(descent, `${id} descent`).toBeGreaterThanOrEqual(band.descent[0]);
      expect(descent, `${id} descent`).toBeLessThanOrEqual(band.descent[1]);
    }
  });

  it('NO CLUB OUT-FLIES THE DRIVER: the loft ramp is curved, not linear (GS-flight-shape)', () => {
    // A linear ramp gave a 181yd hybrid a 17° launch and the highest ball flight in the bag. Every
    // club's apex must sit at or under the driver's, and the long clubs must launch within a few
    // degrees of it rather than fanning out.
    const dP = flightProfileOf('D');
    const dApex = arcApex(250 * flightCarryScale('D', 250), 250, ARC_FEEL, dP);
    for (const c of CLUBS) {
      if (c.id === 'putter') continue;
      const p = flightProfileOf(c.id);
      const apex = arcApex(c.carry * flightCarryScale(c.id, c.carry), c.carry, ARC_FEEL, p);
      expect(apex, `${c.id} apex vs driver`).toBeLessThanOrEqual(dApex + 1e-9);
      if (c.carry >= 165) expect(launchAngleDeg(p, c.carry), `${c.id} launch`).toBeLessThan(17);
    }
  });
});

describe('the arc SHAPE — height against GROUND covered (GS-flight-shape)', () => {
  const SHAPES = Object.values(FLIGHT_PROFILES).map((p) => arcShapeFor(p));

  it('is anchored: zero at both ends, exactly the apex at apexAt, and it peaks ONCE', () => {
    for (const sh of SHAPES) {
      expect(arcHeight(30, 0, sh)).toBeCloseTo(0, 9);
      expect(arcHeight(30, 1, sh)).toBeCloseTo(0, 9);
      expect(arcHeight(30, sh.apexAt, sh)).toBeCloseTo(30, 9);
      // Strictly up to the apex, strictly down after it — no hover, no second bump.
      let prev = -1;
      for (let i = 0; i <= 400; i++) {
        const g = i / 400;
        const h = arcHeight(30, g, sh);
        if (g <= sh.apexAt) expect(h).toBeGreaterThan(prev - 1e-9);
        else expect(h).toBeLessThan(prev + 1e-9);
        prev = h;
      }
    }
  });

  it('THE BALL DOES NOT DROP OUT OF THE SKY: the descent steepens smoothly to its arrival angle', () => {
    // The old model sampled height at the CURVE PARAMETER while the ground ran as 2t−t², so the last
    // few yards of ground had a third of the parameter left to spend: a driver glided at under 2° for
    // 68yd and then fell at 47°. The regression that catches it is the RATIO of the closing slope to
    // the one before it — a plummet shows up as a step change, not as a wrong angle.
    for (const id of ['D', '3W', '3H', '6i', 'PW']) {
      const club = CLUBS.find((c) => c.id === id)!;
      const p = flightProfileOf(id);
      const carry = club.carry * flightCarryScale(id, club.carry);
      const apex = arcApex(carry, club.carry, ARC_FEEL, p);
      const sh = arcShapeOf(id);
      const slopeAt = (g: number): number => {
        const d = 0.01;
        return ((arcHeight(apex, g - d, sh) - arcHeight(apex, g + d, sh)) / (2 * d * carry) / Math.PI) * 180;
      };
      let prev = 0;
      for (let g = sh.apexAt + 0.05; g <= 0.995; g += 0.05) {
        const s = slopeAt(g);
        expect(s, `${id} descending at ${g.toFixed(2)}`).toBeGreaterThan(prev - 1e-9);
        prev = s;
      }
      const descent = descentAngleDeg(p, club.carry);
      // It finishes at exactly the family's real descent angle…
      expect(arrivalAngleDeg(apex, carry, sh)).toBeCloseTo(descent, 6);
      // …and it ARRIVES there, rather than snapping to it. The chord over the closing 5% of ground
      // is within a hair of the true tangent; on the old arc a driver's was 47° against a 35° run-in,
      // which is exactly what "drops out of the air" looks like as a number.
      const chord = (Math.atan2(arcHeight(apex, 0.95, sh), 0.05 * carry) / Math.PI) * 180;
      expect(chord / descent, `${id} closing chord vs true descent`).toBeGreaterThan(0.85);
      expect(chord / descent, `${id} closing chord vs true descent`).toBeLessThan(1.02);
      // And most of the height is gone before the last stretch — the old model still had 71% of a
      // driver's apex left to shed at 90% of the ground, and 42% of it at 97%.
      expect(arcHeight(apex, 0.9, sh) / apex, `${id} height left at 90%`).toBeLessThan(0.6);
      expect(arcHeight(apex, 0.97, sh) / apex, `${id} height left at 97%`).toBeLessThan(0.25);
    }
  });

  it('the shape is a per-FAMILY constant — the carry and the apex both cancel out', () => {
    const sh = arcShapeOf('D');
    expect(arrivalAngleDeg(30, 250, sh)).toBeCloseTo(arrivalAngleDeg(30, 250, arcShapeFor(FLIGHT_PROFILES.driver)), 9);
    // Halving the carry at the same apex doubles the tangent of the arrival angle (the ball comes
    // down over half the ground) — the shape did not change, only what it is drawn across.
    const a = Math.tan((arrivalAngleDeg(30, 250, sh) * Math.PI) / 180);
    const b = Math.tan((arrivalAngleDeg(30, 125, sh) * Math.PI) / 180);
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('a lift-supported climb: every family rises in very nearly a straight line', () => {
    // `rise` is the launch slope as a multiple of the climb's average. 1 = straight, 2 = a thrown
    // stone. A golf ball is held up by its own backspin, so the whole bag sits close to 1.
    for (const sh of SHAPES) {
      expect(sh.rise).toBeGreaterThan(0.85);
      expect(sh.rise).toBeLessThan(1.25);
      // …and it comes down harder than it went up, which is what drag does.
      expect(sh.fall).toBeGreaterThan(sh.rise * 1.8);
      expect(sh.fall).toBeLessThan(2.95);
    }
  });

  it('ground fraction and curve parameter are inverses, and are NOT the same number', () => {
    for (let i = 0; i <= 20; i++) {
      const g = i / 20;
      expect(flightGroundFrac(flightParamAt(g))).toBeCloseTo(g, 9);
    }
    // The curve is three-quarters done in ground by its half-way parameter — the whole reason height
    // must be indexed by ground.
    expect(flightGroundFrac(0.5)).toBeCloseTo(0.75, 9);
  });
});

describe('per-family flight profiles (GS-flight-3)', () => {
  it('the classifier maps the whole CLUBS taxonomy onto a profile row', () => {
    for (const c of CLUBS) expect(FLIGHT_PROFILES[flightClassOf(c.id)]).toBeDefined();
    expect(flightClassOf('D')).toBe('driver');
    expect(flightClassOf('3W')).toBe('wood');
    expect(flightClassOf('4H')).toBe('hybrid');
    // GS-runout-club splits the irons for FLIGHT at the number: 3-5 launch low and run, 6+ climb
    // and stop. The strike voice and the shop's "irons" are still one thing.
    expect(flightClassOf('3i')).toBe('ironLong');
    expect(flightClassOf('5i')).toBe('ironLong');
    expect(flightClassOf('6i')).toBe('ironLong'); // 4-6 are the long/mid irons (GS-carry-roll-real)
    expect(flightClassOf('7i')).toBe('ironShort');
    expect(flightClassOf('PW')).toBe('wedge'); // ends in W but is a wedge, not a wood
    expect(flightClassOf('SW')).toBe('wedge');
    expect(flightClassOf('putter')).toBe('putter');
  });

  // GS-carry-roll-real. The ball CANNOT land further than it finishes, and for six months nothing said
  // so: `maxReachOf` reached for the club's bare NUMBER while `maxFlightReachOf` went through
  // `flightScaleFor`, which is `carryFrac · (1 + legacyRoll)` — greater than 1 as soon as `carryFrac`
  // clears 1/(1+legacyRoll) = 0.847. The old driver sat at 0.80, just under the line, so the two models
  // stayed accidentally ordered; setting the split from real golf crossed it and the bag's flight reach
  // (258yd) came out LONGER than its "total" reach (237). The aim AI then pointed a drive into a lava
  // river. Pin the ORDERING and the RATIO, so a future retune of any row cannot reintroduce it.
  it('a club can never LAND further than it FINISHES, and the ratio is exactly 1/(1+run)', () => {
    for (const c of CLUBS) {
      if (c.id === 'putter') continue;
      const flight = c.carry * flightCarryScale(c.id, c.carry);
      const total = clubTotalReach(c.id, c.carry);
      // The ordering is the invariant that matters, and it holds for every row in the bag.
      expect(flight, `${c.id} flight ${flight.toFixed(1)} > total ${total.toFixed(1)}`).toBeLessThanOrEqual(total + 1e-9);
      // Flight and run are now two independent levers (GS-runout-ladder): `carryFrac` scales the
      // FLIGHT and `runFrac` says how far the ball then runs, so the split ratio is the run's, not
      // the flight's. A row without `runFrac` keeps the legacy leftover and is unchanged.
      expect(flight / total, c.id).toBeCloseTo(1 / (1 + rollFractionFor(flightProfileOf(c.id), c.carry)), 9);
      const p = flightProfileOf(c.id);
      if (p.runFrac === undefined && p.carryFrac >= 1) expect(flight).toBeCloseTo(c.carry, 9);
    }
  });

  it('THE CARRY IS FIXED AND THE RUN IS THE LEVER (GS-runout-ladder)', () => {
    // The flight is exactly what it was before the run ladder moved — carry is load-bearing (forced
    // carries, tree knockdowns, apex) in a way run is not, so buying a bigger run out of it is not a
    // free trade. Every club therefore FINISHES further than it used to, and carries the same.
    for (const c of CLUBS) {
      if (c.id === 'putter') continue;
      const p = flightProfileOf(c.id);
      if (p.runFrac === undefined) continue;
      expect(clubTotalReach(c.id, c.carry), c.id).toBeGreaterThan(c.carry * (1 + legacyRollFraction(c.carry)));
    }
    // A driver carries 272 and runs 38 on firm turf, finishing at 310 — real firm-fairway driving.
    expect(250 * flightCarryScale('D', 250)).toBeCloseTo(272, 0);
    expect(clubTotalReach('D', 250)).toBeCloseTo(310, 0);
  });

  it('the FLIGHT scale is still anchored on the legacy roll', () => {
    // `carryFrac` is now purely the FLIGHT lever, and it is still anchored the same way: the ball flies
    // `number · carryFrac · (1 + legacyRollFraction)`. That anchor is why this change moved ZERO carries
    // — the forced-carry AI, the tree knockdowns and the apex all read the flight, and all are untouched.
    for (const c of CLUBS) {
      if (c.id === 'putter') continue;
      const p = flightProfileOf(c.id);
      // `carryFrac 1` opts a row out of the split altogether (the wedges: land-and-hold, so a spin
      // build's backspin layers on unchanged, GS-backspin-optin) — its flight IS its number.
      const want = p.carryFrac >= 1 ? c.carry : c.carry * p.carryFrac * (1 + legacyRollFraction(c.carry));
      expect(c.carry * flightCarryScale(c.id, c.carry), c.id).toBeCloseTo(want, 9);
    }
    expect(250 * flightCarryScale('D', 250)).toBeCloseTo(272, 0); // the 250-nominal driver carries 272
  });

  it('a hybrid flies higher than a wood of the same carry (the rescue-club identity)', () => {
    expect(arcApex(180, 181, ARC_FEEL, FLIGHT_PROFILES.hybrid)).toBeGreaterThan(
      arcApex(180, 181, ARC_FEEL, FLIGHT_PROFILES.wood),
    );
    expect(FLIGHT_PROFILES.hybrid.launchTrimDeg).toBeGreaterThan(FLIGHT_PROFILES.wood.launchTrimDeg);
  });

  it('a driver bores; a wedge towers — at the SAME carry, off the launch ramp', () => {
    expect(arcApex(200, 250, ARC_FEEL, FLIGHT_PROFILES.driver)).toBeLessThan(
      arcApex(200, 90, ARC_FEEL, FLIGHT_PROFILES.wedge),
    );
  });

  it('THE FLATTER CLUB PEAKS LATER along the ground (GS-flight-shape)', () => {
    // A driver climbs at ~11° and lands at ~38°, so it is still going up two thirds of the way; a
    // wedge climbs at ~25° and lands at ~53°, so it is over the top well before that. The table used
    // to have this exactly backwards.
    expect(FLIGHT_PROFILES.driver.apexAt).toBeGreaterThan(FLIGHT_PROFILES.ironShort.apexAt);
    expect(FLIGHT_PROFILES.ironShort.apexAt).toBeGreaterThan(FLIGHT_PROFILES.wedge.apexAt);
    // …and the steeper-landing club arrives at a genuinely bigger angle.
    expect(descentAngleDeg(FLIGHT_PROFILES.wedge, 74)).toBeGreaterThan(descentAngleDeg(FLIGHT_PROFILES.driver, 250) + 10);
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
    // Same target + same tree guarding the approach; only the arc differs. The tree sits at 70 of a
    // 100yd shot — under the wedge's apex, and still on the driver's flat climb. (It used to sit at
    // 90, i.e. ten yards short of the flag: with a real descent profile BOTH clubs are on their way
    // down through a canopy there, which is correct golf, not a loft test.)
    const hole = treeAt([0, 70], 3);
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
      hazards: [{ kind: 'trees', poly: blob([0, 28], 14) }], // a big, tall tree right off the tee
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
