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
import { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL } from '../src/render/runout';

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
