/**
 * GS-runout-feel — the land / bounce / run-out (and the backspin check) is a ballistic model, not an
 * ease curve with a jiggle laid over it.
 *
 * The playtest report was "it looked like the ball landed and then teleported away". These tests pin
 * the three properties whose absence produced that:
 *  1. No SPEED STEP at touchdown — the first hop leaves at very nearly the speed the flight arrived.
 *  2. The ball is FASTEST FIRST and decelerates ON CONTACT, not from the instant it lands.
 *  3. A run-out is long enough to READ — especially the backspin check, which is a slow thing.
 * Plus the contract-5 property the whole feature rests on: the drawn run-out ends exactly where the
 * sim said the ball rests, however the time is parameterised.
 */
import { describe, it, expect } from 'vitest';
import { planRunout, sampleRunout, apexOverLenFor, hopBite, landingZoomFor, runoutCameraTarget, DEFAULT_RUNOUT_FEEL, RUNOUT_BY_CLASS, type Landing, type RunoutPlan } from '../src/render/runout';
import { arcApex, ARC_FEEL, arcShapeOf, arrivalAngleDeg, descentAngleDeg, flightCarryScale } from '../src/sim/flight';
import { sampleCurvedFlight, flightDurationMs, flightGroundAt } from '../src/render/trajectory';
import { ballRadiusPx } from '../src/render/ball';
import { flightGroundFrac, flightParamAt } from '../src/sim/flight';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLUBS } from '../src/sim/clubs';
import { flightClassOf, flightProfileOf, FLIGHT_PROFILES, rollFractionFor, legacyRollFraction } from '../src/sim/flight';

/** A firm fairway landing off a driver: ~180yd carry in ~600ms ⇒ 0.3 yd/ms. */
const DRIVER_V = 0.3;
/** One frame at 60fps — the unit "can the player see this" is actually measured in. */
const FRAME_MS = 1000 / 60;

describe('the run-out starts where the flight left off (no speed step)', () => {
  it('the run-out has its OWN time base, and that is deliberate', () => {
    // This used to demand the first hop travel at nearly flight speed, on the reasoning that a real
    // ball leaves its first bounce having lost only one contact's worth. Right about real golf, wrong
    // about this game: the drawn FLIGHT is ~8x real time (750ms for a 250-yard drive that really takes
    // six seconds), so a bounce chained to the arrival speed inherits the 8x and becomes unwatchable.
    // Measured in game under the old rule, a driver's six hops totalled 87ms and the first was 27ms —
    // under two frames — which is exactly the reported "there is no bounce, the ball drops, touches
    // ground and then rolls a little bit".
    //
    // The threshold below is stated in FRAMES, and it came DOWN with GS-landing-camera, which is the
    // direction it should move: the correction had over-shot to ~1.3x real time, and the same hop is
    // now drawn three times bigger, so it needs fewer frames to read. What must never change is that
    // there ARE frames to read — the failure this guards is the 27ms hop, which is under two of them.
    const p = planRunout({ dist: 21, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, vary: 0.5, clubId: 'D' });
    const first = p.hops[0]!;
    expect(first.dist / first.ms).toBeLessThan(DRIVER_V); // slower than the flight, on purpose
    expect(first.ms / FRAME_MS, `first hop ${first.ms.toFixed(0)}ms`).toBeGreaterThan(6); // frames to WATCH
  });

  it('the bounce is a real share of the run-out, not a blip before a long roll', () => {
    for (const id of ['D', '3W', '7i']) {
      const p = land(id, runOf(id));
      const hopMs = p.hops.reduce((a, h) => a + h.ms, 0);
      const share = hopMs / (hopMs + p.rollMs);
      expect(share, `${id} spends ${(share * 100).toFixed(0)}% of its run-out bouncing`).toBeGreaterThan(0.1);
    }
  });

  it('the first hop is still not a fresh slow start', () => {
    const plan = planRunout({ dist: 30, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    expect(plan.hops.length).toBeGreaterThan(1);
    const first = plan.hops[0]!;
    const hopSpeed = first.dist / first.ms;
    // Slower than the arrival (the run-out's own time base) but still MOVING — the ball must never
    // appear to stop dead and then trundle off.
    expect(hopSpeed).toBeGreaterThan(0);
    expect(hopSpeed).toBeLessThanOrEqual(DRIVER_V);
  });

  it('each hop is slower and shorter than the one before — deceleration happens ON CONTACT', () => {
    const plan = planRunout({ dist: 30, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    for (let i = 1; i < plan.hops.length; i++) {
      const prev = plan.hops[i - 1]!;
      const cur = plan.hops[i]!;
      expect(cur.dist).toBeLessThan(prev.dist);
      expect(cur.dist / cur.ms).toBeLessThan(prev.dist / prev.ms);
      expect(cur.apex).toBeLessThan(prev.apex);
    }
  });

  it('the ball covers ground FASTEST at the start of the run-out (the old ease braked immediately)', () => {
    const plan = planRunout({ dist: 30, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    const at = (t: number) => sampleRunout(plan, t).s;
    const early = at(0.1) - at(0);
    const late = at(1) - at(0.9);
    expect(early).toBeGreaterThan(late * 1.5);
  });
});

describe('the surface decides how the ball lands', () => {
  it('firm ground skips most of its run out; soft ground plops and drags', () => {
    const firm = planRunout({ dist: 30, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, checking: false, vary: 0.5 }); // fairway
    const soft = planRunout({ dist: 30, firm: 0.14, v0: DRIVER_V, carry: 250, descentDeg: 36, checking: false, vary: 0.5 }); // deep tangle / bunker
    const air = (p: ReturnType<typeof planRunout>) => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(firm)).toBeGreaterThan(air(soft) * 2);
    expect(firm.hops[0]!.apex).toBeGreaterThan(soft.hops[0]!.apex);
  });

  it('a soft landing still hops at least once — a dead plop is not a slide', () => {
    const soft = planRunout({ dist: 12, firm: 0.12, v0: 0.18, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    expect(soft.hops.length).toBeGreaterThanOrEqual(1);
  });
});

describe('the drawn run-out ends exactly where the sim said (contract 5)', () => {
  it('a forward run-out lands on the sim’s roll distance', () => {
    for (const [d, f] of [
      [30, 0.85],
      [6, 0.3],
      [55, 1],
      [0.6, 0.65],
    ] as const) {
      const plan = planRunout({ dist: d, firm: f, v0: 0.25, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
      expect(sampleRunout(plan, 1).s).toBeCloseTo(d, 6);
      expect(sampleRunout(plan, 1).h).toBe(0); // and it finishes ON the ground
      expect(sampleRunout(plan, 0).s).toBeCloseTo(0, 6); // …having started at the pitch mark
    }
  });

  it('a backspin check ends the sim’s check distance BEHIND the pitch mark', () => {
    const plan = planRunout({ dist: 14, firm: 0.65, v0: 0.2, carry: 250, descentDeg: 36, checking: true, vary: 0.5 });
    expect(sampleRunout(plan, 1).s).toBeCloseTo(-14, 6);
    expect(sampleRunout(plan, 0).s).toBeCloseTo(0, 6);
  });

  it('progress is monotonic within each beat — the ball never stutters backwards mid-roll', () => {
    const plan = planRunout({ dist: 30, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    let last = -Infinity;
    for (let i = 0; i <= 60; i++) {
      const s = sampleRunout(plan, i / 60).s;
      expect(s).toBeGreaterThanOrEqual(last - 1e-9);
      last = s;
    }
  });
});

describe('a run-out is long enough to READ (the teleport report)', () => {
  it('even the shortest run-out clears the floor', () => {
    const plan = planRunout({ dist: 3, firm: 0.65, v0: 0.2, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    expect(plan.totalMs).toBeGreaterThanOrEqual(DEFAULT_RUNOUT_FEEL.runoutMinMs);
  });

  it('the backspin check is a slow, watchable thing — not the old ~200ms yank', () => {
    const plan = planRunout({ dist: 12, firm: 0.65, v0: 0.2, carry: 250, descentDeg: 36, checking: true, vary: 0.5 });
    expect(plan.totalMs).toBeGreaterThan(700);
    // The ball goes FORWARD first (the skid), then comes back — two beats, not one snap.
    const skidPeak = sampleRunout(plan, plan.check!.skidMs / plan.totalMs).s;
    expect(skidPeak).toBeGreaterThan(0);
    expect(sampleRunout(plan, 1).s).toBeLessThan(0);
  });

  it('a long drive still settles inside the ceiling', () => {
    const plan = planRunout({ dist: 60, firm: 1, v0: 0.35, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    expect(plan.totalMs).toBeLessThanOrEqual(DEFAULT_RUNOUT_FEEL.runoutMaxMs);
  });

  it('a ball that does not move gets no run-out at all', () => {
    expect(planRunout({ dist: 0, firm: 0.65, v0: 0.2, carry: 250, descentDeg: 36, checking: false, vary: 0.5 }).totalMs).toBe(0);
  });
});

/**
 * GS-runout-club — bounce and run READ per club, and the backspin check no longer stops dead.
 *
 * The report on the first attempt was blunt: *"it changed the driver and wood bounce and roll which
 * was pretty good, it didn't actually solve the contour green and backspin issue. The ball now stops
 * and then just slides."* The last sentence is a velocity discontinuity, and the reason it shipped
 * green is that the suite above only ever tested continuity at TOUCHDOWN. So the first thing here is
 * a check across EVERY phase join.
 */

/** Numerically differentiate the drawn travel: yards of signed travel per millisecond. */
function speedAt(plan: ReturnType<typeof planRunout>, ms: number): number {
  const h = 0.5;
  const total = Math.max(1, plan.totalMs);
  const a = sampleRunout(plan, Math.max(0, (ms - h) / total)).s;
  const b = sampleRunout(plan, Math.min(1, (ms + h) / total)).s;
  return (b - a) / (2 * h);
}

describe('velocity is continuous across EVERY phase join, not just touchdown', () => {
  it('a backspin check carries its skid momentum THROUGH the grab', () => {
    // The bug: a constant-speed forward skid handed over to a smoothstep, whose derivative is zero at
    // u = 0. Full flight speed → dead stop → slow creep backwards. "Stops and then just slides."
    const plan = planRunout({ dist: 12, firm: 0.5, v0: 0.28, carry: 250, descentDeg: 36, checking: true, vary: 0.5 });
    const join = plan.check!.skidMs;
    const before = speedAt(plan, join - 6);
    const after = speedAt(plan, join + 6);
    expect(before).toBeGreaterThan(0); // still going forward into the join
    // The step across the join is a fraction of the speed, not a wipe-out to zero.
    expect(Math.abs(after - before)).toBeLessThan(Math.abs(before) * 0.35);
    // …and it is still travelling forward just after the grab, not stopped.
    expect(after).toBeGreaterThan(0);
  });

  it('…and then genuinely reverses and eases to rest at the sim\'s point', () => {
    const plan = planRunout({ dist: 12, firm: 0.5, v0: 0.28, carry: 250, descentDeg: 36, checking: true, vary: 0.5 });
    const mid = plan.check!.skidMs + plan.check!.backMs * 0.55;
    expect(speedAt(plan, mid)).toBeLessThan(0); // dragged back
    expect(Math.abs(speedAt(plan, plan.totalMs - 2))).toBeLessThan(0.02); // settles, not slams
    expect(sampleRunout(plan, 1).s).toBeCloseTo(-12, 6); // ends exactly where the sim said
  });

  it('a forward run-out has no step at ANY hop→hop or hop→roll join either', () => {
    const plan = planRunout({ dist: 34, firm: 0.85, v0: 0.3, carry: 250, descentDeg: 36, checking: false, vary: 0.5, clubId: 'D' });
    let at = 0;
    for (const hop of plan.hops) {
      at += hop.ms;
      if (at >= plan.totalMs - 2) break;
      const before = speedAt(plan, at - 4);
      const after = speedAt(plan, at + 4);
      // A CONTACT legitimately sheds speed — that is the whole model — but it may never gain any,
      // and it may never drop to a stop mid-run-out.
      expect(after).toBeLessThanOrEqual(before + 1e-6);
      expect(after).toBeGreaterThan(0);
    }
  });
});

describe('bounce and run read per CLUB', () => {
  it('the RUN ladder is the one the bag implies: driver > wood > long iron > hybrid > short iron > wedge', () => {
    // The run itself is the SIM's (`FLIGHT_PROFILES.runFrac`), not this module's — the family decides
    // how far the ball runs once it has carried what it carries.
    const run = (id: string): number => {
      const c = CLUBS.find((x) => x.id === id)!;
      return rollFractionFor(flightProfileOf(id), c.carry);
    };
    expect(run('D')).toBeGreaterThan(run('3W'));
    // GS-runout-ladder separated the woods from the hybrids: a 3-wood off the deck is a running club
    // and a rescue is built to land soft, so they no longer share a row.
    expect(run('3W')).toBeGreaterThan(run('4H'));
    expect(run('4H')).toBeGreaterThan(run('3i'));
    expect(run('3i')).toBeGreaterThan(run('7i'));
    // …and the wedges hold, which is where the backspin build takes over (GS-backspin-optin). They opt
    // out of `runFrac` entirely and keep the legacy taper (PW +5% → 0 at the shortest), so the ladder
    // has to END above it — a pitching wedge that outran a 7-iron was the old table's one inversion.
    expect(run('7i')).toBeGreaterThan(run('PW'));
    expect(run('PW')).toBe(legacyRollFraction(CLUBS.find((c) => c.id === 'PW')!.carry));
    expect(run('64')).toBeLessThan(run('PW')); // the lob wedge checks to a stop
  });

  it('every iron in the bag lands on one side of the split, and 4-6 are the long ones', () => {
    const irons = CLUBS.filter((c) => /^\d+i$/.test(c.id));
    expect(irons.length).toBeGreaterThan(2);
    for (const c of irons) {
      const n = Number(/^(\d+)i$/.exec(c.id)![1]);
      expect(flightClassOf(c.id), c.id).toBe(n <= 6 ? 'ironLong' : 'ironShort');
    }
  });

  it('the long irons BORE and the short irons CLIMB', () => {
    // Launch angle is the height lever now (GS-flight-shape) — a long iron leaves flatter than a
    // short one, and being flatter it is still climbing further down the hole (`apexAt`).
    const c5 = CLUBS.find((c) => c.id === '5i')!.carry;
    const c8 = CLUBS.find((c) => c.id === '8i')!.carry;
    expect(descentAngleDeg(FLIGHT_PROFILES.ironLong, c5)).toBeLessThan(descentAngleDeg(FLIGHT_PROFILES.ironShort, c8));
    expect(FLIGHT_PROFILES.ironLong.apexAt).toBeGreaterThan(FLIGHT_PROFILES.ironShort.apexAt);
  });

  it('a driver skips further off the same landing than a wedge, which plops', () => {
    const D = planRunout({ dist: 30, firm: 0.85, v0: 0.3, carry: 250, descentDeg: 36, checking: false, vary: 0.5, clubId: 'D' });
    const W = planRunout({ dist: 30, firm: 0.85, v0: 0.3, carry: 74, descentDeg: 62, checking: false, vary: 0.5, clubId: 'SW' });
    const air = (p: ReturnType<typeof planRunout>): number => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(D)).toBeGreaterThan(air(W) * 1.5);
    expect(D.hops[0]!.dist).toBeGreaterThan(W.hops[0]!.dist);
  });

  it('a wedge hops HIGHER but shorter — steep in, dead stop', () => {
    const D = planRunout({ dist: 30, firm: 0.85, v0: 0.3, carry: 250, descentDeg: 36, checking: false, vary: 0.5, clubId: 'D' });
    const W = planRunout({ dist: 30, firm: 0.85, v0: 0.3, carry: 74, descentDeg: 62, checking: false, vary: 0.5, clubId: 'SW' });
    expect(RUNOUT_BY_CLASS.wedge.bounce).toBeGreaterThan(RUNOUT_BY_CLASS.driver.bounce);
    expect(W.hops[0]!.dist).toBeLessThan(D.hops[0]!.dist);
  });

  it('the SURFACE still has the final say — a plugged bunker kills a driver skip', () => {
    const firm = planRunout({ dist: 30, firm: 0.95, v0: 0.3, carry: 250, descentDeg: 36, checking: false, vary: 0.5, clubId: 'D' });
    const soft = planRunout({ dist: 30, firm: 0.05, v0: 0.3, carry: 250, descentDeg: 36, checking: false, vary: 0.5, clubId: 'D' });
    const air = (p: ReturnType<typeof planRunout>): number => p.hops.reduce((a, h) => a + h.dist, 0);
    // Like for like: the SAME run-out distance, so this measures firmness alone. In play the surface
    // also collapses the sim's `dist`, which compounds it — see the surface ladder below.
    expect(air(soft)).toBeLessThan(air(firm) * 0.75);
    // Not the hop COUNT — a firm landing can spend its whole budget on one long skip while a soft one
    // takes two short ones. The skip LENGTH is the honest signal.
    expect(soft.hops[0]!.dist).toBeLessThan(firm.hops[0]!.dist);
  });

  it('no class can bounce for ever — restitution stays under 1 whatever the surface', () => {
    for (const id of Object.keys(RUNOUT_BY_CLASS)) {
      for (const firm of [0, 0.5, 1]) {
        const p = planRunout({ dist: 60, firm: firm, v0: 0.35, carry: 134, descentDeg: 56, checking: false, vary: 0.5, clubId: id === 'driver' ? 'D' : '7i' });
        for (let i = 1; i < p.hops.length; i++) {
          expect(p.hops[i]!.dist, `${id} @${firm}`).toBeLessThan(p.hops[i - 1]!.dist);
        }
      }
    }
  });

  it('an unknown club still plans a sane landing (the neutral mid-bag row)', () => {
    const p = planRunout({ dist: 20, firm: 0.6, v0: 0.25, carry: 250, descentDeg: 36, checking: false, vary: 0.5 });
    expect(p.totalMs).toBeGreaterThan(0);
    expect(p.hops.length).toBeGreaterThan(0);
    expect(sampleRunout(p, 1).s).toBeCloseTo(20, 6);
  });
});

/**
 * GS-landing-real / GS-flight-pace — the shot ARRIVES, and then it lands like one.
 *
 * The report: *"still doesn't feel as good as it did before… it doesn't feel like you are hitting a
 * golf shot"*, with a specific spec for what each club should do on the ground, and *"if it's the
 * same bounce and run on every drive it doesn't feel real"*.
 */

/** Reproduce what the play view measures off the drawn arc as a full-carry shot touches down. */
function arrival(clubId: string): { v0: number; descentDeg: number; carry: number } {
  const club = CLUBS.find((c) => c.id === clubId)!;
  const pr = flightProfileOf(clubId);
  const apex = arcApex(club.carry, club.carry, ARC_FEEL, pr);
  const shape = arcShapeOf(clubId);
  const from: [number, number] = [0, 0];
  const land: [number, number] = [0, club.carry];
  const dur = flightDurationMs(apex);
  const a = sampleCurvedFlight(from, land, 0, flightGroundAt(0.98, undefined, pr.dragTaper), apex, shape).ground;
  const b = sampleCurvedFlight(from, land, 0, flightGroundAt(1, undefined, pr.dragTaper), apex, shape).ground;
  const v0 = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, 0.02 * dur);
  return { v0, descentDeg: arrivalAngleDeg(apex, club.carry, shape), carry: club.carry };
}
function land(clubId: string, dist: number, firm = 0.85, extra: Partial<Landing> = {}): RunoutPlan {
  const ar = arrival(clubId);
  return planRunout({ dist, firm, v0: ar.v0, carry: ar.carry, descentDeg: ar.descentDeg, clubId, vary: 0.5, ...extra });
}
/** The run a club releases on a clean strike, straight from the sim's own split. */
function runOf(clubId: string): number {
  const club = CLUBS.find((c) => c.id === clubId)!;
  const pr = flightProfileOf(clubId);
  const frac = rollFractionFor(pr, club.carry);
  return pr.runFrac === undefined && pr.carryFrac >= 1 ? 2.5 : club.carry * frac;
}

describe('the ball ARRIVES at speed (GS-flight-pace)', () => {
  it('the drawn flight no longer stops dead in the air before it lands', () => {
    // `flightControl` puts the control point ON the landing for a shot that finishes on its line, so
    // the Bézier degenerates to `2t − t²` and its ground speed is exactly ZERO at t=1. Measured on the
    // drawn arc the ball covered 99% of its ground by t=0.9 and touched down at 2% of its average
    // speed — it rocketed off the club and floated down. Everything downstream inherited that: the
    // run-out chain starts from this number.
    for (const id of ['D', '7i', 'SW']) {
      const ar = arrival(id);
      const club = CLUBS.find((c) => c.id === id)!;
      const pr = flightProfileOf(id);
      const mean = club.carry / flightDurationMs(arcApex(club.carry, club.carry, ARC_FEEL, pr));
      // The taper is per family now (GS-flight-hang) — a lofted club sheds more of its forward speed
      // into the landing, which is what makes it SETTLE rather than arrive at launch pace.
      expect(ar.v0 / mean, `${id} arrives at this fraction of its average ground speed`).toBeGreaterThan(
        (pr.dragTaper ?? 0.72) * 0.85,
      );
    }
  });

  it('HANG TIME COMES FROM THE APEX, NOT THE CARRY (GS-flight-hang)', () => {
    // `t = 2·√(2·apex/g)`: the carry never enters it. Since the apex is tour-flat across the bag, the
    // drawn flight times must be nearly flat too — they were 816ms for a drive against 380 for a
    // wedge, a 2.15 ratio against real golf's 1.2, which is why the short clubs flew like darts.
    const durs = ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW'].map((id) => {
      const club = CLUBS.find((c) => c.id === id)!;
      const pr = flightProfileOf(id);
      const carry = club.carry * flightCarryScale(id, club.carry);
      return flightDurationMs(arcApex(carry, club.carry, ARC_FEEL, pr));
    });
    expect(Math.max(...durs) / Math.min(...durs), 'drive:wedge hang-time ratio').toBeLessThan(1.35);
    // …and it scales with √apex, so a half-height shot hangs 1/√2 as long — the carry is irrelevant.
    expect(flightDurationMs(32) / flightDurationMs(16)).toBeCloseTo(Math.SQRT2, 6);
  });

  it('every club spends the same TIME on the closing tenth of its flight (GS-flight-hang)', () => {
    // The tail complaint measured: a 9-iron spent 44ms on its last tenth of ground against a drive's
    // 95, so the steepest arcs in the bag were also the most rushed. The per-family drag taper plus
    // apex-keyed hang time flattens it.
    const tails = ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW'].map((id) => {
      const club = CLUBS.find((c) => c.id === id)!;
      const pr = flightProfileOf(id);
      const carry = club.carry * flightCarryScale(id, club.carry);
      const dur = flightDurationMs(arcApex(carry, club.carry, ARC_FEEL, pr));
      let u90 = 1;
      for (let i = 0; i <= 2000; i++) {
        const u = i / 2000;
        if (flightGroundAt(u, undefined, pr.dragTaper) >= 0.9) { u90 = u; break; }
      }
      return (1 - u90) * dur;
    });
    expect(Math.max(...tails) / Math.min(...tails), 'closing-tenth time spread').toBeLessThan(1.3);
    // A lofted club must taper HARDER than a driver — that is what stretches its tail.
    expect(FLIGHT_PROFILES.wedge.dragTaper!).toBeLessThan(FLIGHT_PROFILES.driver.dragTaper!);
    expect(FLIGHT_PROFILES.ironShort.dragTaper!).toBeLessThan(FLIGHT_PROFILES.hybrid.dragTaper!);
  });

  it('the pacing walks the whole flight monotonically, in GROUND', () => {
    expect(flightGroundAt(0)).toBeCloseTo(0, 6);
    expect(flightGroundAt(1)).toBeCloseTo(1, 6);
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const g = flightGroundAt(i / 40);
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });

  it('the ball is PAST halfway down the fairway around halfway through the flight, not at 75%', () => {
    // The old parameterisation put it at 75% of the ground at half time.
    const ground = flightGroundAt(0.5);
    expect(ground).toBeGreaterThan(0.4);
    expect(ground).toBeLessThan(0.62);
    // …and the raw curve parameter is exactly the trap it was: 75% of the ground by half-way.
    expect(flightGroundFrac(0.5)).toBeCloseTo(0.75, 9);
    expect(flightParamAt(flightGroundAt(0.5))).toBeLessThan(flightGroundAt(0.5));
  });
});

describe('every club lands the way its flight says it should (GS-landing-real)', () => {
  it('the descent angle ladder is real, and it is what separates the clubs', () => {
    const deg = (id: string): number => arrival(id).descentDeg;
    expect(deg('D')).toBeLessThan(deg('3W'));
    expect(deg('3W')).toBeLessThan(deg('3i'));
    expect(deg('3i')).toBeLessThan(deg('7i'));
    expect(deg('7i')).toBeLessThan(deg('SW'));
    // …and they land in a believable band rather than all coming down like darts.
    expect(deg('D')).toBeGreaterThan(20);
    expect(deg('SW')).toBeLessThan(75);
  });

  it('a driver bounces several times and then rolls; a wedge bounces once', () => {
    // The spec, verbatim: "Driver needs to land, bounce a few times and then roll a bit. woods and
    // hybrids similar, but bounce and run is slightly less. irons still need to land and bounce at
    // least once even if they check up. wedges still need to bounce at least once."
    const D = land('D', runOf('D'));
    const W = land('3W', runOf('3W'));
    const H = land('4H', runOf('4H'));
    const I = land('7i', runOf('7i'));
    const S = land('SW', runOf('SW'));
    expect(D.hops.length).toBeGreaterThanOrEqual(4);
    expect(D.rollDist).toBeGreaterThan(0);
    expect(W.hops.length).toBeGreaterThanOrEqual(3);
    expect(D.hops[0]!.dist).toBeGreaterThan(W.hops[0]!.dist); // "slightly less"
    expect(W.hops[0]!.dist).toBeGreaterThan(H.hops[0]!.dist);
    // EVERY club that arrives from the air bounces, and every one leaves ground to roll on.
    for (const [id, p] of [['D', D], ['3W', W], ['4H', H], ['7i', I], ['SW', S]] as const) {
      expect(p.hops.length, `${id} never bounced`).toBeGreaterThanOrEqual(1);
      expect(p.rollDist, `${id} never rolled`).toBeGreaterThan(0);
    }
  });

  it('a hop is never taller than it is long — the ball skips, it does not pop vertically', () => {
    for (const id of ['D', '3W', '4H', '3i', '7i', 'PW', 'SW']) {
      for (const p of [land(id, runOf(id)), land(id, runOf(id), 0.3)]) {
        for (const h of p.hops) {
          expect(h.apex, `${id} hop apex ${h.apex.toFixed(2)} vs length ${h.dist.toFixed(2)}`).toBeLessThanOrEqual(h.dist * 0.55);
        }
      }
    }
  });

  it('a putter tap does not "land" — it was never in the sky', () => {
    expect(land('putter', 2.5).hops.length).toBe(0);
  });
});

describe('the SURFACE decides how the landing dies', () => {
  it('a driver plugs in a bunker and skips forever on ice', () => {
    // The run itself is the sim's — soft ground already collapses it — and the firmness shapes what
    // is left. Both pull the same way, which is why one number can drive both.
    const fairway = land('D', 62, 0.85);
    const rough = land('D', 20, 0.3);
    const bunker = land('D', 5, 0.12);
    const ice = land('D', 90, 1);
    const air = (p: RunoutPlan): number => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(bunker.hops.length).toBeLessThanOrEqual(1);
    expect(air(bunker)).toBeLessThan(air(rough));
    expect(air(rough)).toBeLessThan(air(fairway));
    expect(air(fairway)).toBeLessThan(air(ice));
    expect(ice.hops.length).toBeGreaterThan(rough.hops.length);
  });

  it('a ball that SKIPS INTO a hazard loses the rest of its train there', () => {
    // "if it lands or bounces into a hazard the remaining bounce and roll should be reduced by the
    // hazard's effect" — the run-out samples the ground each hop lands on, not just the touchdown.
    // The hazard sits a third of the way into the driver's own release, so the first skip clears it
    // and the rest of the train dies in it.
    const D_RUN = runOf('D');
    const clean = land('D', D_RUN, 0.85);
    const into = land('D', D_RUN, 0.85, { firmAt: (a) => (a > D_RUN / 3 ? 0.12 : 0.85) });
    expect(into.hops.length).toBeLessThan(clean.hops.length);
    const air = (p: RunoutPlan): number => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(into)).toBeLessThan(air(clean));
  });
});

describe('no two shots land alike', () => {
  it('the same club on the same surface varies, and varies deterministically', () => {
    const plans = [0.05, 0.3, 0.55, 0.8, 0.98].map((v) => land('D', runOf('D'), 0.85, { vary: v }));
    const firsts = plans.map((p) => p.hops[0]!.dist);
    expect(Math.max(...firsts) / Math.min(...firsts), 'every drive bounced identically').toBeGreaterThan(1.2);
    // …and the SAME variation always gives the same landing (it is a hash, not a draw).
    expect(land('D', runOf('D'), 0.85, { vary: 0.42 })).toEqual(land('D', runOf('D'), 0.85, { vary: 0.42 }));
  });

  it('the run-out module reaches for no randomness of its own', () => {
    // The render path may not touch rng — it would shimmer on every re-render and break replays.
    expect(readFileSync(resolve(__dirname, '../src/render/runout.ts'), 'utf8')).not.toContain('Math.random');
  });
});

describe('a run-out that finishes IN THE CUP keeps its pace', () => {
  it('a holed roll is still moving when it arrives; an ordinary one stops dead', () => {
    // "dr Chipinski is rolling it into the hole now which is great, but it's after the ball comes to a
    // stop so it feels like cheating" — a roll that eases to zero at the lip creeps in.
    const holed = land('SW', 6, 0.65, { holed: true });
    const normal = land('SW', 6, 0.65);
    expect(holed.rollEndFrac).toBeGreaterThan(0);
    expect(normal.rollEndFrac).toBe(0);
    const speedNear = (p: RunoutPlan): number => {
      const a = sampleRunout(p, 0.985).s;
      const b = sampleRunout(p, 1).s;
      return Math.abs(b - a);
    };
    expect(speedNear(holed)).toBeGreaterThan(speedNear(normal) * 1.5);
  });
});

/**
 * GS-runout-visible / GS-roll-hairpin — two reports in one sentence: *"for backspin and green contours
 * the ball is doing the weird path roll instead of a curve from last bounce to final lie… with all
 * clubs as well, it looks like… it just lands and stops or lands and does a flat roll. Or it might be
 * something where the bounces are going way too fast and are not visible."*
 *
 * The second half was right about the symptom and wrong about the cause — nothing was computed off max
 * distance (`carry` is the shot's actual carry) — and the first half turned out to be the gravity CREEP.
 */
describe('the bounce is VISIBLE at the cameras the game uses (GS-runout-visible)', () => {
  it("a hop's apex/length ratio is the projectile one, tan(descent)/4, not a flat constant", () => {
    // Launch at angle θ: length = v²·sin2θ/g, apex = v²·sin²θ/2g ⇒ apex/length = tan(θ)/4. Nothing to
    // tune. The old flat 0.3 was both too generous for a driver's shallow skip and — the bug — far too
    // stingy for a steep wedge, whose hop length is bounded by a deliberately tiny roll.
    // Exact inside the unclamped band — tan(θ)/4 ∈ [0.12, 0.55] ⇒ θ ∈ ~[25.6°, 65.6°], which is every
    // arrival angle the bag actually produces (driver ~35°, wedge ~62°).
    for (const deg of [30, 35, 45, 56, 62]) {
      expect(apexOverLenFor(deg), `${deg}deg`).toBeCloseTo(Math.tan((deg * Math.PI) / 180) / 4, 6);
    }
    // A driver skips flat; a wedge pops. That ORDERING is the whole point of deriving it.
    expect(apexOverLenFor(35)).toBeLessThan(apexOverLenFor(62));
    // …and it stays inside the safety rails at both extremes (a scuff / a vertical bounce).
    expect(apexOverLenFor(2)).toBeGreaterThanOrEqual(DEFAULT_RUNOUT_FEEL.apexOverLenMin);
    expect(apexOverLenFor(89)).toBeLessThanOrEqual(DEFAULT_RUNOUT_FEEL.apexOverLenMax);
  });

  it('a steep short-iron landing draws a hop that clears the ball, at the camera it is watched from', () => {
    // The failure this pins: measured across 40 club/power combinations, 18 drew a peak bounce of
    // 0.7–2.6px under a ball drawn at 3px — the ball never cleared itself, so the bounce was not
    // "too fast to see", it was smaller than the ball. A 7-iron is watched from ~3px/yd.
    const PX_PER_YD = 3;
    const drawnPx = (p: RunoutPlan): number =>
      Math.max(0, ...p.hops.map((h) => h.apex * PX_PER_YD * 0.55 * DEFAULT_RUNOUT_FEEL.hopDrawBoost));
    const shortIron = planRunout({ dist: 3.5, firm: 0.85, v0: 0.25, carry: 141, descentDeg: 56, clubId: '7i', vary: 0.5 });
    expect(shortIron.hops.length).toBeGreaterThan(0);
    expect(drawnPx(shortIron), 'a 7-iron hop must clear the drawn ball').toBeGreaterThan(3);
    // A driver's skip must NOT become a pop-up in the process: its DRAWN height-to-length ratio is what
    // reads as skipping-along vs bouncing-vertically, and it stays under half.
    const driver = planRunout({ dist: 23, firm: 0.85, v0: 0.3, carry: 272, descentDeg: 35, clubId: 'D', vary: 0.5 });
    const first = driver.hops[0]!;
    expect((first.apex * 0.55 * DEFAULT_RUNOUT_FEEL.hopDrawBoost) / first.dist).toBeLessThan(0.55);
  });
});

/**
 * GS-runout-seen — *"woods, hybrids and long irons don't really have any bounce animation, they land
 * and just stick"*, refined to *"I'm fine with the driver keeping the same number of bounces, it's
 * primarily the middle range of clubs."*
 *
 * Measured (`scripts/runout-frames.ts`), the model PLANNED hops it then could not DRAW: on a firm
 * fairway a driver planned six and drew two, a 4-hybrid planned three and drew one, and on a soft
 * green `seen` was 1 on all forty rows. Two separate faults, and they are fixed separately here:
 * the mid-bag's opening skip was too SHORT (the angle term), and the tail was fiction (the plan had
 * no way to ask whether a hop could be seen).
 */
describe('the middle of the bag lands and BOUNCES (GS-runout-seen)', () => {
  /** What the play view draws a modelled apex as, at a given camera. Mirrors `playView.ts`. */
  const HEIGHT_EXAGGERATION = 0.55;
  const drawnPx = (apexYd: number, pxPerYd: number): number =>
    apexYd * pxPerYd * HEIGHT_EXAGGERATION * DEFAULT_RUNOUT_FEEL.hopDrawBoost;
  /** The inverse — what `Landing.ballYd` is, and the only conversion either side may use. */
  const ballYdAt = (ballPx: number, pxPerYd: number): number =>
    ballPx / (pxPerYd * HEIGHT_EXAGGERATION * DEFAULT_RUNOUT_FEEL.hopDrawBoost);
  /** The measured camera band (GS-ball-art): a drive is watched from far out, a wedge from close in. */
  const cameraFor = (carry: number): number => (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0);

  it('the hop LENGTH term is the range relation, and it is the SAME geometry the apex ratio comes from', () => {
    // A projectile launched at θ ranges v²·sin2θ/g and peaks at v²·sin²θ/2g. `apexOverLenFor` is the
    // RATIO of those two (tan θ / 4) and has been derived since GS-runout-visible; the length term was
    // written as cos²(θ), which is neither half of that pair. One projectile, one geometry:
    for (const deg of [30, 38, 45, 50, 57, 62]) {
      const rad = (deg * Math.PI) / 180;
      expect(hopBite(deg), `${deg}deg`).toBeCloseTo(Math.sin(2 * rad), 12);
      // apex / length, built from the two terms independently, must BE the ratio we already derive.
      expect((Math.sin(rad) ** 2 / 2) / hopBite(deg), `${deg}deg`).toBeCloseTo(Math.tan(rad) / 4, 12);
    }
  });

  it('the angle term no longer charges a steep arrival twice', () => {
    // The old cos²(θ) collapsed by a THIRD across the bag's arrival angles while the real range term
    // barely moves — a bounce trades forward speed for height and back again. That penalty landed on
    // exactly the clubs the play-test named, on top of the one `RUNOUT_BY_CLASS.len` already charges.
    const cos2 = (d: number): number => Math.cos((d * Math.PI) / 180) ** 2;
    expect(cos2(50) / cos2(38)).toBeLessThan(0.7); // the old term: a 7-iron docked a third
    expect(hopBite(50) / hopBite(38)).toBeGreaterThan(0.98); // the real one: flat across the bag
    expect(hopBite(45)).toBeCloseTo(1, 12); // …and it peaks at 45°, as a range must
  });

  it('the driver is arithmetically unchanged — `hopLenK` is re-based on its own arrival', () => {
    // The play-test was explicit that the driver already reads right, so the constant is a pure
    // renormalisation pinned at the driver's ~38° landing. If you move `hopLenK`, you have moved the
    // driver, and this is where you find out.
    const OLD_K = 0.07; // …against cos²(descent)
    expect(DEFAULT_RUNOUT_FEEL.hopLenK * hopBite(38)).toBeCloseTo(OLD_K * Math.cos((38 * Math.PI) / 180) ** 2, 4);
  });

  it('every club from driver to 9-iron draws TWO hops that clear the ball on a firm fairway', () => {
    // The report, as a measurement. `land()` here is the real bag through the real flight, and the
    // threshold is the drawn ball at the camera that club is watched from — not a yard count.
    for (const id of ['D', '3W', '4H', '3i', '7i', '9i']) {
      const ar = arrival(id);
      const px = cameraFor(ar.carry);
      const plan = land(id, runOf(id), 0.85, { ballYd: ballYdAt(3, px) });
      const seen = plan.hops.filter((h) => drawnPx(h.apex, px) >= 3).length;
      expect(seen, `${id} draws ${seen} visible hop(s) of ${plan.hops.length} planned`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a hop that cannot be drawn is NOT planned — the model never promises what the camera cannot show', () => {
    // The whole defect in one assertion: planned and seen are the same number, on both surfaces and
    // at every power. A wedge's plop is exempt at the FIRST hop only (a ball out of the sky does not
    // begin by rolling), which is why the first is skipped here.
    for (const id of ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW']) {
      for (const firm of [0.85, 0.45]) {
        for (const power of [1, 0.7, 0.4]) {
          const ar = arrival(id);
          const px = cameraFor(ar.carry * power);
          const ballYd = ballYdAt(3, px);
          const plan = land(id, runOf(id) * power, firm, { ballYd, carry: ar.carry * power });
          for (const h of plan.hops.slice(1)) {
            expect(drawnPx(h.apex, px), `${id} @${power} firm ${firm}: planned an invisible hop`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it('trimming the tail never moves the ball — it goes to the ROLL, not to nowhere (contract 5)', () => {
    for (const id of ['D', '4H', '7i']) {
      const dist = runOf(id);
      const loose = land(id, dist, 0.85);
      const tight = land(id, dist, 0.85, { ballYd: 0.9 }); // an absurdly big ball ⇒ one hop
      expect(tight.hops.length, id).toBeLessThanOrEqual(loose.hops.length);
      expect(tight.hops.length, id).toBeGreaterThanOrEqual(1);
      for (const p of [loose, tight]) {
        expect(sampleRunout(p, 1).s, id).toBeCloseTo(dist, 6);
        expect(p.rollDist + p.hops.reduce((a, h) => a + h.dist, 0), id).toBeCloseTo(dist, 6);
      }
      // The hops it DID keep are untouched — trimming is a decision about the tail, not a re-cut.
      expect(tight.hops[0]!.dist, id).toBeCloseTo(loose.hops[0]!.dist, 9);
    }
  });

  it('a caller that cannot say how big the ball is drawn gets the old yard floor, unchanged', () => {
    // `ballYd` is optional on purpose: every pure caller (and every test above) still exercises the
    // untrimmed model, which is what the bounce PHYSICS is measured against.
    const plan = land('D', runOf('D'), 0.85);
    expect(plan.hops.length).toBeGreaterThanOrEqual(4);
    for (const h of plan.hops) expect(h.dist).toBeGreaterThan(DEFAULT_RUNOUT_FEEL.hopMinYd);
  });
});

/**
 * GS-landing-camera — *"it's now not visible showing any bounces at all. Regardless of club there's no
 * ball bounce visible anywhere… it doesn't feel like you're hitting a golf ball at all."*
 *
 * Every previous pass on this treated the report as a question about the bounce MODEL, and each one
 * found a real fault in it (the flat apex ratio, the `cos²` length term, the collapsing tail, the
 * un-plannable hops). This one is not about the model at all. Measured with `scripts/runout-frames.ts`,
 * the shipped run-out was drawn:
 *
 *   - into **61 screen pixels** for a driver — 38 course yards at the ~1.6 px/yd the FLIGHT is framed at
 *   - over **3,100 ms**, i.e. a THIRD OF A PIXEL PER FRAME
 *   - and all 40 club/power/surface rows came in under one pixel per frame.
 *
 * A bounce cannot be seen in a picture that small crossed that slowly, whatever its apex is. So the
 * camera pushes in for the landing and the run-out's clock roughly doubles. Both numbers live in
 * `RunoutFeel` — the run-out owns its camera, because `landingZoom` and `ballYd` are one decision.
 */
describe('the landing is watched from the landing (GS-landing-camera)', () => {
  const HEIGHT_EXAGGERATION = 0.55; // playView's, and the only conversion either side may use
  const F = DEFAULT_RUNOUT_FEEL;
  /** The camera the FLIGHT is framed at (GS-ball-art's measured band), and the one the RUN-OUT is
   *  watched at — which is the flight's, pushed in. (The full push-in: every club here is framed well
   *  outside `landingMinRadiusYd`, which is checked on its own below.) */
  const flightCam = (carry: number): number => (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0);
  const landingCam = (carry: number): number => flightCam(carry) / F.landingZoom;
  /** What `playView` draws a modelled apex as, and its inverse — the `ballYd` the plan is handed. */
  const drawnPx = (apexYd: number, px: number): number => apexYd * px * HEIGHT_EXAGGERATION * F.hopDrawBoost;
  const ballYdAt = (px: number): number => ballRadiusPx(px) / (px * HEIGHT_EXAGGERATION * F.hopDrawBoost);
  /**
   * The run-out as the player sees it: how many pixels of ground, and how fast the ball crosses them
   * OFF THE FIRST CONTACT.
   *
   * Deliberately not the mean over the whole run-out — the closing roll decelerates to a dead stop by
   * design, so a mean says more about how much roll a club has than about whether the ball is moving.
   * The first hop is the fastest thing in the run-out and the moment the player is looking at, so it is
   * the honest peak: under the old camera and clock it came out at **0.98 px/frame** for a driver.
   */
  function drawn(id: string): { hopPxPerFrame: number; runPx: number; seen: number; ballPx: number } {
    const ar = arrival(id);
    const px = landingCam(ar.carry);
    const plan = land(id, runOf(id), 0.85, { ballYd: ballYdAt(px) });
    const ballPx = ballRadiusPx(px);
    const first = plan.hops[0]!;
    return {
      runPx: plan.totalDist * px,
      hopPxPerFrame: ((first.dist * px) / first.ms) * FRAME_MS,
      ballPx,
      seen: plan.hops.filter((h) => drawnPx(h.apex, px) >= ballPx && h.ms / FRAME_MS >= 5).length,
    };
  }

  it('the run-out is a picture big enough to hold a bounce', () => {
    // The report as a number. 61px is what a driver's whole landing used to get; a bounce train needs
    // room to be a train. (This is a property of the CAMERA, so it is asserted per club at the camera
    // that club is watched from — a wedge's twenty pixels of run-out is a plop and correctly small.)
    for (const id of ['D', '3W', '4H', '3i']) {
      expect(drawn(id).runPx, `${id} draws its whole run-out in ${drawn(id).runPx.toFixed(0)}px`).toBeGreaterThan(90);
    }
  });

  it('the ball MOVES — every club that skips does it at more than 2.5px a frame', () => {
    // The other half, and the one no bounce model could have answered: the ball was being redrawn in
    // almost the same place for three seconds.
    for (const id of ['D', '3W', '4H', '3i', '7i', '9i']) {
      const d = drawn(id);
      expect(d.hopPxPerFrame, `${id} skips at ${d.hopPxPerFrame.toFixed(2)} px/frame`).toBeGreaterThan(2.5);
    }
    // The WEDGES sit lower, and that is the physics rather than an exemption: a ball dropping in at 61°
    // with a wedge's restitution has very little forward speed to give a first hop, which is why its
    // skip is under `hopFirstMinShare`'s net in the first place. It still has to be a hop and not a
    // stutter, so it gets a floor of its own rather than a pass.
    for (const id of ['PW', 'SW']) {
      const d = drawn(id);
      expect(d.hopPxPerFrame, `${id} plops at ${d.hopPxPerFrame.toFixed(2)} px/frame`).toBeGreaterThan(1.5);
    }
  });

  it('pushing the camera in is what BUYS the bounces — the same plan at the flight camera loses them', () => {
    // Why the plan has to be told which camera it will be watched at (`Landing.ballYd`): the trim is a
    // question about pixels, so asking it at the flight camera throws away the tail of the very train
    // the push-in exists to show. This is the fix stated as a comparison, not as a constant.
    const at = (id: string, px: number): number =>
      land(id, runOf(id), 0.85, { ballYd: ballYdAt(px) }).hops.length;
    for (const id of ['D', '3W']) {
      const ar = arrival(id);
      const far = at(id, flightCam(ar.carry));
      expect(at(id, landingCam(ar.carry)), `${id}: ${far} hops at the flight camera`).toBeGreaterThan(far);
    }
    // …and no club anywhere in the bag is WORSE off for it. Only the two longest gain outright: since
    // GS-bounce-ladder a club's skip count is capped by its own class row, so from the hybrid down the
    // ladder decides it and the camera cannot — which is the point of that change, not an exception to
    // this one.
    for (const id of ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW']) {
      const ar = arrival(id);
      expect(at(id, landingCam(ar.carry)), id).toBeGreaterThanOrEqual(at(id, flightCam(ar.carry)));
    }
  });

  it('the landing camera never gets tighter than the green is wide', () => {
    // `landingZoom` is a MULTIPLIER and the play camera's radius has a 30-yard floor of its own, so a
    // chip would be pushed to a ten-yard half-width — under half the putt screen's framing — for a ball
    // that then runs two yards.
    expect(landingZoomFor(99) * 99).toBeCloseTo(99 * F.landingZoom, 6); // a drive gets the full push-in
    expect(landingZoomFor(30) * 30).toBeCloseTo(F.landingMinRadiusYd, 6); // a chip stops at the floor
    expect(landingZoomFor(15)).toBe(1); // already tighter than the floor ⇒ leave the camera alone
  });

  it('a view with no focus radius is not zoomed at all', () => {
    // The replay/demo path fits the whole hole, where `cineZoom` multiplies nothing — so the honest
    // answer is 1, and `ballYd` must be asked at the camera that path really draws.
    expect(landingZoomFor(undefined)).toBe(1);
    expect(landingZoomFor(0)).toBe(1);
  });

  it('the push-in very nearly closes the velocity cliff at touchdown that the slow clock opened', () => {
    // Apparent speed is yards-per-ms TIMES pixels-per-yard, so the camera is half of it. At the flight
    // camera the first hop left at ~12% of the speed the ball arrived at — a brake you can see, and the
    // reason the landing read as the ball hitting a wall. `runoutTimeScale` alone could not fix that
    // without making the hops too brief to watch; the camera is what pays for it.
    const ar = arrival('D');
    const plan = land('D', runOf('D'), 0.85, { ballYd: ballYdAt(landingCam(ar.carry)) });
    const first = plan.hops[0]!;
    const arrivePx = ar.v0 * flightCam(ar.carry); // px/ms as the flight ends
    const hopPx = (first.dist / first.ms) * landingCam(ar.carry); // px/ms off the first contact
    expect(hopPx / arrivePx).toBeGreaterThan(0.5);
    expect(hopPx / arrivePx).toBeLessThan(1); // a contact SHEDS speed — it must not gain any
  });
});

/**
 * GS-bounce-ladder â€” how many times a ball skips is a property of the CLUB.
 *
 * The play-test's spec, verbatim: *"Driver should bounce 4-6 times visibly. Woods should bounce 3-5
 * times visibly. Hybrids should bounce 2-4 times visibly. Long Irons should bounce 1-3 times visibly.
 * Short Irons should bounce 1-2 times visibly. Wedges should bounce 0-1 times visibly."*
 *
 * Before this, `hopMax` was ONE number for the whole bag, so what actually separated a driver from a
 * 9-iron was where the geometric train fell under the drawability floor â€” a fact about the CAMERA, not
 * about the club. GS-landing-camera moved that floor, and the short irons promptly gained a third skip
 * without anything about the golf changing. The count belongs in the class row, beside the club's bite
 * and its pop.
 */
describe('every club skips its own number of times (GS-bounce-ladder)', () => {
  const HEIGHT_EXAGGERATION = 0.55;
  const F = DEFAULT_RUNOUT_FEEL;
  const flightCam = (carry: number): number => (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0);
  const landingCam = (carry: number): number => flightCam(carry) / F.landingZoom;
  const drawnPx = (apexYd: number, px: number): number => apexYd * px * HEIGHT_EXAGGERATION * F.hopDrawBoost;
  const ballYdAt = (px: number): number => ballRadiusPx(px) / (px * HEIGHT_EXAGGERATION * F.hopDrawBoost);

  /** The asked-for band, per FLIGHT CLASS. */
  const BAND: Record<string, [number, number]> = {
    driver: [4, 6],
    wood: [3, 5],
    hybrid: [2, 4],
    ironLong: [1, 3],
    ironShort: [1, 2],
    wedge: [0, 1],
  };
  const BAG = ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW'];

  /** Hops the PLAYER sees: drawn apex clears the drawn ball, held for long enough to register. */
  function seen(id: string, power = 1): number {
    const ar = arrival(id);
    const carry = ar.carry * power;
    const px = landingCam(carry);
    const plan = land(id, runOf(id) * power, 0.85, { ballYd: ballYdAt(px), carry });
    return plan.hops.filter((h) => drawnPx(h.apex, px) >= ballRadiusPx(px) && h.ms / FRAME_MS >= 5).length;
  }

  it('the whole bag lands inside the asked-for band, at every power, on a firm fairway', () => {
    for (const id of BAG) {
      const band = BAND[flightClassOf(id)]!;
      for (const power of [1, 0.85, 0.7, 0.55, 0.4]) {
        const n = seen(id, power);
        expect(n, `${id} @${power} draws ${n} visible bounces, wanted ${band[0]}-${band[1]}`).toBeGreaterThanOrEqual(band[0]);
        expect(n, `${id} @${power} draws ${n} visible bounces, wanted ${band[0]}-${band[1]}`).toBeLessThanOrEqual(band[1]);
      }
    }
  });

  it('the ladder STEPS â€” a driver out-skips a wood out-skips a hybrid out-skips an iron out-skips a wedge', () => {
    // The counts being in band is not enough on its own: a bag where every club draws four is in band
    // for three of the six families and reads as no ladder at all. What sells the club is the contrast.
    expect(seen('D')).toBeGreaterThan(seen('3W'));
    expect(seen('3W')).toBeGreaterThan(seen('4H'));
    expect(seen('4H')).toBeGreaterThan(seen('7i'));
    expect(seen('7i')).toBeGreaterThan(seen('PW'));
  });

  it('a class row can never out-skip the global ceiling', () => {
    // `hopMax` stays the absolute cap and the live `_gsFeel` lever; the class row narrows it, never the
    // other way round. A row above it would be a number that silently does nothing.
    for (const cls of Object.values(RUNOUT_BY_CLASS)) expect(cls.hops).toBeLessThanOrEqual(DEFAULT_RUNOUT_FEEL.hopMax);
  });

  it('the SURFACE still kills the train â€” the ladder is a firm-ground promise, not a floor', () => {
    // `trainSustain` MULTIPLIES the physical `khÂ²` rather than replacing it, which is the whole reason
    // it can be one number: a drive plugging into soft ground still dies in two skips. Holding the
    // ladder there would be the bug â€” a driver landing on a soft green is supposed to stop.
    const ar = arrival('D');
    const px = landingCam(ar.carry);
    const firm = land('D', runOf('D'), 0.9, { ballYd: ballYdAt(px) });
    const soft = land('D', runOf('D') * 0.5, 0.2, { ballYd: ballYdAt(px) });
    expect(soft.hops.length).toBeLessThan(firm.hops.length);
    expect(soft.hops.length).toBeGreaterThanOrEqual(1); // â€¦but a ball out of the sky always lands
  });

  it('the sustain is an exaggeration, and a modest one â€” the train is drawn, not simulated', () => {
    // A projectile ranges 2Â·vhÂ·vv/g, and between contacts vh decays by kh while vv decays by kv â€” so the
    // honest length decay is khÂ·kv, NOT the khÂ² the module has used since GS-runout-ladder. `khÂ²` was
    // already an exaggeration of ~1.5x that nobody had named. The point of pinning this is that the
    // constant must stay small: it multiplies a rate, so it compounds down the train.
    expect(DEFAULT_RUNOUT_FEEL.trainSustain).toBeGreaterThan(1);
    expect(DEFAULT_RUNOUT_FEEL.trainSustain).toBeLessThan(1.25);
    // â€¦and it must never let a bounce keep MORE than it arrived with, at any surface or class.
    for (const cls of Object.values(RUNOUT_BY_CLASS)) {
      const khFirmest = Math.min(0.86, DEFAULT_RUNOUT_FEEL.restitutionFirm * cls.restitution);
      expect(khFirmest * khFirmest * DEFAULT_RUNOUT_FEEL.trainSustain).toBeLessThan(1);
    }
  });

  it('trimming the tail to the class cap still leaves the ball where the sim put it (contract 5)', () => {
    for (const id of BAG) {
      const dist = runOf(id);
      const plan = land(id, dist, 0.85, { ballYd: ballYdAt(landingCam(arrival(id).carry)) });
      expect(plan.hops.length, id).toBeLessThanOrEqual(RUNOUT_BY_CLASS[flightClassOf(id)]!.hops);
      expect(sampleRunout(plan, 1).s, id).toBeCloseTo(dist, 6);
      expect(plan.rollDist + plan.hops.reduce((a, h) => a + h.dist, 0), id).toBeCloseTo(dist, 6);
    }
  });
});

/**
 * GS-runout-clock â€” *"there's now a fun zoom feature when the ball is landing, but there's still no
 * bouncing on screen."*
 *
 * GS-landing-camera and GS-bounce-ladder both measured what they claimed and both left the report
 * standing, because both reasoned in COURSE YARDS. Traced out of the real canvas â€” hooking the ball's
 * own draw call and its shadow's, frame by frame â€” the drawn landing was:
 *
 *   lift 14.4px, 9.5px, 6.2px, 3.8px over 433ms, and then nothing for 1.9 seconds
 *   ball screen x: 238 â†’ 231 â†’ 226 â†’ 221 â†’ 217 â†’ 212 â†’ 209 â†’ â€¦ â†’ 196.2, and then MOTIONLESS
 *
 * Two faults, neither visible to a pure model:
 *
 *  1. **The hops were played at 100ms instead of 130.** `sampleRunout` maps `t` over the raw hop+roll
 *     total while the play view drives off `totalMs`, so a clamped run-out plays uniformly faster â€”
 *     and the compression lands on the hops, which sit on `hopMinMs` and have no slack, while the
 *     roll keeps seconds of it. The rig has printed `timeBase 0.65` throughout and it was read as a
 *     harmless uniform stretch.
 *  2. **The ball never moved forward on screen.** The follow-cam tracks it, and on the ground it
 *     tracks it perfectly, so the forward skip was drawn as the world scrolling behind a pinned ball.
 *     A bounce that does not travel is not a bounce.
 */
describe('the run-out is played at the speed it was planned (GS-runout-clock)', () => {
  const F = DEFAULT_RUNOUT_FEEL;

  it('the ceiling does not bite on an ordinary shot â€” the hops keep the clock they were given', () => {
    // The ceiling compresses EVERY phase, and the hops are the phase with no slack. This is the
    // assertion that keeps it a safety net for monster run-outs rather than a pacing dial. Asked of
    // the SHIPPED path (`ballYd` present), because the untrimmed model plans a longer tail and with it
    // a longer roll — it is the run-out the PLAYER gets that has to fit.
    const cam = (carry: number): number => (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0) / F.landingZoom;
    for (const id of ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW']) {
      const px = cam(arrival(id).carry);
      const plan = land(id, runOf(id), 0.85, { ballYd: ballRadiusPx(px) / (px * 0.55 * F.hopDrawBoost) });
      const raw = plan.hops.reduce((a, h) => a + h.ms, 0) + plan.rollMs;
      expect(plan.totalMs, `${id} run-out planned at ${raw.toFixed(0)}ms`).toBeCloseTo(raw, 6);
      for (const h of plan.hops) expect(h.ms).toBeGreaterThanOrEqual(F.hopMinMs - 1e-9);
    }
  });

  it('and when it DOES bite it compresses uniformly â€” never the roll alone', () => {
    // Trimming the roll to fit is the obvious fix and it makes the ball ACCELERATE out of its last
    // bounce, because the roll's duration is `2Â·rollDist / vLast` and that speed is inherited. A
    // monster run-out therefore plays fast all over rather than gaining a step in the middle.
    const huge = planRunout({ dist: 400, firm: 1, v0: 0.35, carry: 272, descentDeg: 36, clubId: 'D', vary: 0.5 });
    expect(huge.totalMs).toBeCloseTo(F.runoutMaxMs, 6);
    const raw = huge.hops.reduce((a, h) => a + h.ms, 0) + huge.rollMs;
    expect(raw).toBeGreaterThan(F.runoutMaxMs); // it really is being compressed
    // Uniform compression cannot introduce a step: every phase's drawn speed scales by the same k.
    const k = huge.totalMs / raw;
    let prev = Infinity;
    for (const h of huge.hops) {
      const drawn = h.dist / (h.ms * k);
      expect(drawn).toBeLessThanOrEqual(prev + 1e-9);
      prev = drawn;
    }
  });

  it('a shorter hop floor buys headroom under the ceiling, and buys it ONLY from the hops', () => {
    // Why `hopMinMs` came down to 100 (six frames). It is a small, honest saving — the roll is
    // untouched, because the roll enters at whichever is SLOWER of the chained speed and the drawn
    // one, and on a driver that is the chained speed either way. Measured, not reasoned: an earlier
    // draft of this claimed the floor was "paid for twice, the second time by the roll", and the
    // numbers say the roll does not move at all.
    const at = (hopMinMs: number): RunoutPlan =>
      planRunout({ dist: 38, firm: 0.85, v0: 0.3, carry: 272, descentDeg: 36, clubId: 'D', vary: 0.5 }, { ...F, hopMinMs });
    const slow = at(130);
    const quick = at(100);
    expect(quick.rollMs).toBeCloseTo(slow.rollMs, 6); // the roll is NOT where the saving comes from
    const hopMs = (p: RunoutPlan): number => p.hops.reduce((a, h) => a + h.ms, 0);
    expect(hopMs(quick)).toBeLessThan(hopMs(slow));
    // …compared on the RAW total, not `totalMs` — this fixture is the UNTRIMMED model (no `ballYd`),
    // which plans a longer tail than the game draws and so is still up against the ceiling in both.
    const raw = (p: RunoutPlan): number => hopMs(p) + p.rollMs;
    expect(raw(quick)).toBeLessThan(raw(slow));
  });
});

/**
 * The camera half of the same report. A skip reads as a skip because the ball travels ACROSS the
 * frame; a camera locked to the ball cancels exactly that.
 */
describe('the camera lets go of the ball when it lands (GS-runout-clock)', () => {
  const pitch: [number, number] = [100, 200];

  it('holds still while the ball is inside the leash â€” this is what makes a skip travel', () => {
    for (const d of [0, 1, 5, 19.9]) {
      expect(runoutCameraTarget(pitch, [100, 200 + d], 20)).toEqual([100, 200]);
    }
  });

  it('is dragged along past it, so a monster run-out can never leave the frame', () => {
    const t = runoutCameraTarget(pitch, [100, 260], 20);
    expect(t[1]).toBeCloseTo(240, 6); // 60 travelled, 20 of leash â‡’ camera 40 along
    // â€¦and it lags by exactly the leash, whatever the direction or distance.
    for (const [dx, dy] of [[30, 40], [-60, 80], [0, -300]] as const) {
      const ball: [number, number] = [pitch[0] + dx, pitch[1] + dy];
      const cam = runoutCameraTarget(pitch, ball, 20);
      expect(Math.hypot(ball[0] - cam[0], ball[1] - cam[1])).toBeCloseTo(20, 6);
      // it stays ON the pitchâ†’ball line, so the camera never drifts sideways off the shot
      const cross = (ball[0] - pitch[0]) * (cam[1] - pitch[1]) - (ball[1] - pitch[1]) * (cam[0] - pitch[0]);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    }
  });

  it('the leash is long enough that an ordinary landing never moves the camera at all', () => {
    // The whole point: at the landing camera a driver's run-out is ~179px and the leash is 30% of a
    // 844px frame, so the ball skips right across a still picture. If this ever fails, the camera has
    // started chasing the ball again and the bounce goes back to being a bob in place.
    const FRAME_H = 844;
    const leashPx = FRAME_H * DEFAULT_RUNOUT_FEEL.runoutLeashFrac;
    const px = 1.6 / DEFAULT_RUNOUT_FEEL.landingZoom; // the driver's landing camera
    const runPx = runOf('D') * px;
    expect(runPx).toBeLessThan(leashPx);
  });
});
