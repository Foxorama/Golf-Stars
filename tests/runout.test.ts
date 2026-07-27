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
import { planRunout, sampleRunout, apexOverLenFor, DEFAULT_RUNOUT_FEEL, RUNOUT_BY_CLASS, type Landing, type RunoutPlan } from '../src/render/runout';
import { arcApex, ARC_FEEL, flightApexT } from '../src/sim/flight';
import { sampleCurvedFlight, flightDurationMs, flightT } from '../src/render/trajectory';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLUBS } from '../src/sim/clubs';
import { flightClassOf, flightProfileOf, FLIGHT_PROFILES } from '../src/sim/flight';

/** A firm fairway landing off a driver: ~180yd carry in ~600ms ⇒ 0.3 yd/ms. */
const DRIVER_V = 0.3;

describe('the run-out starts where the flight left off (no speed step)', () => {
  it('the run-out has its OWN time base, and that is deliberate', () => {
    // This used to demand the first hop travel at nearly flight speed, on the reasoning that a real
    // ball leaves its first bounce having lost only one contact's worth. Right about real golf, wrong
    // about this game: the drawn FLIGHT is ~8x real time (750ms for a 250-yard drive that really takes
    // six seconds), so a bounce chained to the arrival speed inherits the 8x and becomes unwatchable.
    // Measured in game under the old rule, a driver's six hops totalled 87ms and the first was 27ms —
    // under two frames — which is exactly the reported "there is no bounce, the ball drops, touches
    // ground and then rolls a little bit".
    const p = planRunout({ dist: 21, firm: 0.85, v0: DRIVER_V, carry: 250, descentDeg: 36, vary: 0.5, clubId: 'D' });
    const first = p.hops[0]!;
    expect(first.dist / first.ms).toBeLessThan(DRIVER_V); // slower than the flight, on purpose
    expect(first.ms, `first hop ${first.ms.toFixed(0)}ms`).toBeGreaterThan(150); // long enough to WATCH
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
    // The run itself is the SIM's (`FLIGHT_PROFILES.carryFrac`), not this module's — a club's number
    // is its TOTAL, and the family decides how much of it is carried and how much released.
    const run = (id: string): number => {
      const p = flightProfileOf(id);
      return p.carryFrac >= 1 ? 0 : (1 - p.carryFrac) / p.carryFrac;
    };
    expect(run('D')).toBeGreaterThan(run('3W'));
    // Woods and hybrids sit together, and both release more than a long iron (GS-carry-roll-real:
    // woods/hybrids 10-15yd, long/mid irons 5-10). The earlier "driving iron outruns the hybrid"
    // reading came from tuning, not from the reference numbers.
    expect(run('3W')).toBeCloseTo(run('4H'), 3);
    expect(run('4H')).toBeGreaterThan(run('3i'));
    expect(run('3i')).toBeGreaterThan(run('7i'));
    // …and the wedges hold, which is where the backspin build takes over (GS-backspin-optin).
    expect(run('7i')).toBeGreaterThan(run('PW'));
    expect(run('PW')).toBe(0);
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
    expect(FLIGHT_PROFILES.ironLong.peakMult).toBeLessThan(FLIGHT_PROFILES.ironShort.peakMult);
    expect(FLIGHT_PROFILES.ironLong.apexAt).toBeLessThan(FLIGHT_PROFILES.ironShort.apexAt);
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
  const apex = arcApex(club.carry, club.carry, ARC_FEEL, pr.peakMult);
  const apexT = flightApexT(pr);
  const from: [number, number] = [0, 0];
  const land: [number, number] = [0, club.carry];
  const dur = flightDurationMs(club.carry);
  const a = sampleCurvedFlight(from, land, 0, flightT(0.98), apex, apexT).ground;
  const b = sampleCurvedFlight(from, land, 0, flightT(1), apex, apexT).ground;
  const v0 = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, 0.02 * dur);
  const s = sampleCurvedFlight(from, land, 0, flightT(0.88), apex, apexT);
  const g = Math.hypot(land[0] - s.ground[0], land[1] - s.ground[1]);
  return { v0, descentDeg: (Math.atan2(s.height, Math.max(0.5, g)) * 180) / Math.PI, carry: club.carry };
}
function land(clubId: string, dist: number, firm = 0.85, extra: Partial<Landing> = {}): RunoutPlan {
  const ar = arrival(clubId);
  return planRunout({ dist, firm, v0: ar.v0, carry: ar.carry, descentDeg: ar.descentDeg, clubId, vary: 0.5, ...extra });
}
/** The run a club releases on a clean strike, straight from the sim's own split. */
function runOf(clubId: string): number {
  const club = CLUBS.find((c) => c.id === clubId)!;
  const pr = flightProfileOf(clubId);
  return pr.carryFrac >= 1 ? 2.5 : club.carry * ((1 - pr.carryFrac) / pr.carryFrac);
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
      const mean = club.carry / flightDurationMs(club.carry);
      expect(ar.v0 / mean, `${id} arrives at this fraction of its average ground speed`).toBeGreaterThan(0.6);
    }
  });

  it('the pacing maps onto the curve monotonically and covers the whole flight', () => {
    expect(flightT(0)).toBeCloseTo(0, 6);
    expect(flightT(1)).toBeCloseTo(1, 6);
    let prev = -1;
    for (let i = 0; i <= 40; i++) {
      const t = flightT(i / 40);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it('the ball is PAST halfway down the fairway around halfway through the flight, not at 75%', () => {
    // The old parameterisation put it at 75% of the ground at half time.
    const club = CLUBS.find((c) => c.id === 'D')!;
    const t = flightT(0.5);
    const ground = 2 * t - t * t; // the degenerate Bézier's own ground fraction
    expect(ground).toBeGreaterThan(0.4);
    expect(ground).toBeLessThan(0.62);
    expect(club.carry).toBeGreaterThan(0); // (keeps the club lookup meaningful)
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
    // A driver's realistic release is ~21yd (GS-carry-roll-real), so the hazard sits 8 yards in.
    const clean = land('D', 21, 0.85);
    const into = land('D', 21, 0.85, { firmAt: (a) => (a > 8 ? 0.12 : 0.85) });
    expect(into.hops.length).toBeLessThan(clean.hops.length);
    const air = (p: RunoutPlan): number => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(into)).toBeLessThan(air(clean));
  });
});

describe('no two shots land alike', () => {
  it('the same club on the same surface varies, and varies deterministically', () => {
    const plans = [0.05, 0.3, 0.55, 0.8, 0.98].map((v) => land('D', 21, 0.85, { vary: v }));
    const firsts = plans.map((p) => p.hops[0]!.dist);
    expect(Math.max(...firsts) / Math.min(...firsts), 'every drive bounced identically').toBeGreaterThan(1.2);
    // …and the SAME variation always gives the same landing (it is a hash, not a draw).
    expect(land('D', 21, 0.85, { vary: 0.42 })).toEqual(land('D', 21, 0.85, { vary: 0.42 }));
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
