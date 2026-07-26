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
import { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL, RUNOUT_BY_CLASS } from '../src/render/runout';
import { CLUBS } from '../src/sim/clubs';
import { flightClassOf, flightProfileOf, FLIGHT_PROFILES } from '../src/sim/flight';

/** A firm fairway landing off a driver: ~180yd carry in ~600ms ⇒ 0.3 yd/ms. */
const DRIVER_V = 0.3;

describe('the run-out starts where the flight left off (no speed step)', () => {
  it('the first hop travels at nearly flight speed, never a fresh slow start', () => {
    const plan = planRunout(30, 0.85, DRIVER_V, false);
    expect(plan.hops.length).toBeGreaterThan(1);
    const first = plan.hops[0]!;
    const hopSpeed = first.dist / first.ms;
    // One contact's worth of loss, no more: the ball leaves the bounce at restitution × arrival.
    expect(hopSpeed).toBeGreaterThan(DRIVER_V * 0.5);
    expect(hopSpeed).toBeLessThanOrEqual(DRIVER_V);
  });

  it('each hop is slower and shorter than the one before — deceleration happens ON CONTACT', () => {
    const plan = planRunout(30, 0.85, DRIVER_V, false);
    for (let i = 1; i < plan.hops.length; i++) {
      const prev = plan.hops[i - 1]!;
      const cur = plan.hops[i]!;
      expect(cur.dist).toBeLessThan(prev.dist);
      expect(cur.dist / cur.ms).toBeLessThan(prev.dist / prev.ms);
      expect(cur.apex).toBeLessThan(prev.apex);
    }
  });

  it('the ball covers ground FASTEST at the start of the run-out (the old ease braked immediately)', () => {
    const plan = planRunout(30, 0.85, DRIVER_V, false);
    const at = (t: number) => sampleRunout(plan, t).s;
    const early = at(0.1) - at(0);
    const late = at(1) - at(0.9);
    expect(early).toBeGreaterThan(late * 1.5);
  });
});

describe('the surface decides how the ball lands', () => {
  it('firm ground skips most of its run out; soft ground plops and drags', () => {
    const firm = planRunout(30, 0.85, DRIVER_V, false); // fairway
    const soft = planRunout(30, 0.14, DRIVER_V, false); // deep tangle / bunker
    const air = (p: ReturnType<typeof planRunout>) => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(firm)).toBeGreaterThan(air(soft) * 2);
    expect(firm.hops[0]!.apex).toBeGreaterThan(soft.hops[0]!.apex);
  });

  it('a soft landing still hops at least once — a dead plop is not a slide', () => {
    const soft = planRunout(12, 0.12, 0.18, false);
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
      const plan = planRunout(d, f, 0.25, false);
      expect(sampleRunout(plan, 1).s).toBeCloseTo(d, 6);
      expect(sampleRunout(plan, 1).h).toBe(0); // and it finishes ON the ground
      expect(sampleRunout(plan, 0).s).toBeCloseTo(0, 6); // …having started at the pitch mark
    }
  });

  it('a backspin check ends the sim’s check distance BEHIND the pitch mark', () => {
    const plan = planRunout(14, 0.65, 0.2, true);
    expect(sampleRunout(plan, 1).s).toBeCloseTo(-14, 6);
    expect(sampleRunout(plan, 0).s).toBeCloseTo(0, 6);
  });

  it('progress is monotonic within each beat — the ball never stutters backwards mid-roll', () => {
    const plan = planRunout(30, 0.85, DRIVER_V, false);
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
    const plan = planRunout(3, 0.65, 0.2, false);
    expect(plan.totalMs).toBeGreaterThanOrEqual(DEFAULT_RUNOUT_FEEL.runoutMinMs);
  });

  it('the backspin check is a slow, watchable thing — not the old ~200ms yank', () => {
    const plan = planRunout(12, 0.65, 0.2, true);
    expect(plan.totalMs).toBeGreaterThan(700);
    // The ball goes FORWARD first (the skid), then comes back — two beats, not one snap.
    const skidPeak = sampleRunout(plan, plan.check!.skidMs / plan.totalMs).s;
    expect(skidPeak).toBeGreaterThan(0);
    expect(sampleRunout(plan, 1).s).toBeLessThan(0);
  });

  it('a long drive still settles inside the ceiling', () => {
    const plan = planRunout(60, 1, 0.35, false);
    expect(plan.totalMs).toBeLessThanOrEqual(DEFAULT_RUNOUT_FEEL.runoutMaxMs);
  });

  it('a ball that does not move gets no run-out at all', () => {
    expect(planRunout(0, 0.65, 0.2, false).totalMs).toBe(0);
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
    const plan = planRunout(12, 0.5, 0.28, true);
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
    const plan = planRunout(12, 0.5, 0.28, true);
    const mid = plan.check!.skidMs + plan.check!.backMs * 0.55;
    expect(speedAt(plan, mid)).toBeLessThan(0); // dragged back
    expect(Math.abs(speedAt(plan, plan.totalMs - 2))).toBeLessThan(0.02); // settles, not slams
    expect(sampleRunout(plan, 1).s).toBeCloseTo(-12, 6); // ends exactly where the sim said
  });

  it('a forward run-out has no step at ANY hop→hop or hop→roll join either', () => {
    const plan = planRunout(34, 0.85, 0.3, false, DEFAULT_RUNOUT_FEEL, 'D');
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
    expect(run('3W')).toBeGreaterThan(run('3i'));
    // A driving iron launches low with little spin and outruns the rescue club it replaced.
    expect(run('3i')).toBeGreaterThan(run('4H'));
    expect(run('4H')).toBeGreaterThan(run('7i'));
    // …and the wedges hold, which is where the backspin build takes over (GS-backspin-optin).
    expect(run('7i')).toBeGreaterThan(run('PW'));
    expect(run('PW')).toBe(0);
  });

  it('every iron in the bag lands on one side of the split, and 3-5 are the long ones', () => {
    const irons = CLUBS.filter((c) => /^\d+i$/.test(c.id));
    expect(irons.length).toBeGreaterThan(2);
    for (const c of irons) {
      const n = Number(/^(\d+)i$/.exec(c.id)![1]);
      expect(flightClassOf(c.id), c.id).toBe(n <= 5 ? 'ironLong' : 'ironShort');
    }
  });

  it('the long irons BORE and the short irons CLIMB', () => {
    expect(FLIGHT_PROFILES.ironLong.peakMult).toBeLessThan(FLIGHT_PROFILES.ironShort.peakMult);
    expect(FLIGHT_PROFILES.ironLong.apexAt).toBeLessThan(FLIGHT_PROFILES.ironShort.apexAt);
  });

  it('a driver skips further off the same landing than a wedge, which plops', () => {
    const D = planRunout(30, 0.85, 0.3, false, DEFAULT_RUNOUT_FEEL, 'D');
    const W = planRunout(30, 0.85, 0.3, false, DEFAULT_RUNOUT_FEEL, 'SW');
    const air = (p: ReturnType<typeof planRunout>): number => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(D)).toBeGreaterThan(air(W) * 1.5);
    expect(D.hops[0]!.dist).toBeGreaterThan(W.hops[0]!.dist);
  });

  it('a wedge hops HIGHER but shorter — steep in, dead stop', () => {
    const D = planRunout(30, 0.85, 0.3, false, DEFAULT_RUNOUT_FEEL, 'D');
    const W = planRunout(30, 0.85, 0.3, false, DEFAULT_RUNOUT_FEEL, 'SW');
    expect(RUNOUT_BY_CLASS.wedge.apex).toBeGreaterThan(RUNOUT_BY_CLASS.driver.apex);
    expect(W.hops[0]!.dist).toBeLessThan(D.hops[0]!.dist);
  });

  it('the SURFACE still has the final say — a plugged bunker kills a driver skip', () => {
    const firm = planRunout(30, 0.95, 0.3, false, DEFAULT_RUNOUT_FEEL, 'D');
    const soft = planRunout(30, 0.05, 0.3, false, DEFAULT_RUNOUT_FEEL, 'D');
    const air = (p: ReturnType<typeof planRunout>): number => p.hops.reduce((a, h) => a + h.dist, 0);
    expect(air(soft)).toBeLessThan(air(firm) * 0.5);
  });

  it('no class can bounce for ever — restitution stays under 1 whatever the surface', () => {
    for (const id of Object.keys(RUNOUT_BY_CLASS)) {
      for (const firm of [0, 0.5, 1]) {
        const p = planRunout(60, firm, 0.35, false, DEFAULT_RUNOUT_FEEL, id === 'driver' ? 'D' : '7i');
        for (let i = 1; i < p.hops.length; i++) {
          expect(p.hops[i]!.dist, `${id} @${firm}`).toBeLessThan(p.hops[i - 1]!.dist);
        }
      }
    }
  });

  it('an unknown club still plans a sane landing (the neutral mid-bag row)', () => {
    const p = planRunout(20, 0.6, 0.25, false);
    expect(p.totalMs).toBeGreaterThan(0);
    expect(p.hops.length).toBeGreaterThan(0);
    expect(sampleRunout(p, 1).s).toBeCloseTo(20, 6);
  });
});
