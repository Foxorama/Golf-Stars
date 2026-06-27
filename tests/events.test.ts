import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVENT,
  ROUTE_EVENTS,
  UNIQUE_EVENTS,
  drawRouteEvents,
  eventPool,
  isCalm,
  routeEvent,
} from '../src/sim/rpg/events';
import {
  effectiveCut,
  finishStop,
  playStop,
  resumeRun,
  routeOptions,
  simulateRun,
  snapshotRun,
  startRun,
  travel,
} from '../src/sim/rpg/run';
import { cutLine } from '../src/sim/rpg/economy';
import { Rng } from '../src/sim/rng';

describe('route events — data (GS-14)', () => {
  it('the table is well-formed and spans a real risk/reward spread', () => {
    expect(ROUTE_EVENTS.length).toBeGreaterThanOrEqual(4);
    for (const e of ROUTE_EVENTS) {
      expect(e.id).toBeTruthy();
      expect(e.creditMult).toBeGreaterThan(0);
      expect(Number.isFinite(e.cutDelta)).toBe(true);
    }
    // There is at least one safe lane (an "out") and at least one high-stakes gamble.
    expect(ROUTE_EVENTS.some(isCalm)).toBe(true);
    expect(ROUTE_EVENTS.some((e) => e.cutDelta >= 2)).toBe(true);
    // Higher reward is gated behind higher risk (no free lunch among the charged lanes).
    const charged = ROUTE_EVENTS.filter((e) => !isCalm(e));
    for (const e of charged) expect(e.creditMult).toBeGreaterThan(1);
  });

  it('the default (no-jump) event is neutral, so stop 0 is unchanged', () => {
    expect(DEFAULT_EVENT.creditMult).toBe(1);
    expect(DEFAULT_EVENT.cutDelta).toBe(0);
  });

  it('routeEvent looks up by id', () => {
    expect(routeEvent('solar-flare')?.label).toBe('Solar Flare');
    expect(routeEvent('nope')).toBeUndefined();
  });

  it('drawRouteEvents is deterministic and always offers a calm option', () => {
    for (let seed = 0; seed < 200; seed++) {
      const a = drawRouteEvents(new Rng(`r:${seed}`), 3);
      const b = drawRouteEvents(new Rng(`r:${seed}`), 3);
      expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id)); // deterministic
      expect(a).toHaveLength(3);
      expect(a.some(isCalm)).toBe(true); // there's always an out
    }
  });
});

describe('event split — recurring vs unique + accent arcs (GS-17c)', () => {
  it('unique one-off events are well-formed, deep-arc, high-stakes, and flagged', () => {
    expect(UNIQUE_EVENTS.length).toBeGreaterThanOrEqual(3);
    for (const e of UNIQUE_EVENTS) {
      expect(e.unique).toBe(true);
      expect(e.minArc).toBe(3); // gated to the deep voyage
      expect(e.creditMult).toBeGreaterThan(1); // the richest lanes
      expect(e.cutDelta).toBeGreaterThan(0); // never a free out
    }
    // routeEvent resolves uniques too (resume needs it).
    expect(routeEvent('apophis-flyby')?.unique).toBe(true);
  });

  it('the pool accents the arcs: gentle early, high-stakes + uniques only deep', () => {
    const early = eventPool(0); // arc 1
    expect(early.every((e) => (e.minArc ?? 1) === 1)).toBe(true);
    expect(early.some((e) => e.cutDelta >= 2)).toBe(false); // no brutal lanes early
    expect(early.some((e) => e.unique)).toBe(false); // no uniques early

    const deep = eventPool(15); // arc 3
    expect(deep.some((e) => e.cutDelta >= 3)).toBe(true); // brutal lanes appear
    expect(deep.some((e) => e.unique)).toBe(true); // uniques are on offer
  });

  it('the pool excludes uniques that have already fired', () => {
    const before = eventPool(15);
    expect(before.some((e) => e.id === 'apophis-flyby')).toBe(true);
    const after = eventPool(15, ['apophis-flyby']);
    expect(after.some((e) => e.id === 'apophis-flyby')).toBe(false);
    // Recurring events are untouched by the fired set.
    expect(after.some((e) => e.id === 'solar-flare')).toBe(true);
  });

  it('travel records a unique as fired (once-per-run) but not a recurring event', () => {
    const base = { ...startRun(5), stopIndex: 3, distanceFromStart: 15 };
    const intoUnique = travel(base, {
      id: 0,
      distanceJump: 1,
      label: 'Short hop',
      event: routeEvent('apophis-flyby')!,
    });
    expect(intoUnique.firedEventIds).toContain('apophis-flyby');

    const intoRecurring = travel(base, {
      id: 0,
      distanceJump: 1,
      label: 'Short hop',
      event: routeEvent('solar-flare')!,
    });
    expect(intoRecurring.firedEventIds).not.toContain('solar-flare');
  });

  it('snapshot/resume round-trips the fired-unique set', () => {
    let run = { ...startRun(8), stopIndex: 3, distanceFromStart: 15 };
    run = travel(run, {
      id: 0,
      distanceJump: 1,
      label: 'Short hop',
      event: routeEvent('total-solar-eclipse')!,
    });
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.firedEventIds).toContain('total-solar-eclipse');
    // And that resumed run's pool no longer offers it.
    expect(eventPool(resumed.distanceFromStart, resumed.firedEventIds).some((e) => e.id === 'total-solar-eclipse')).toBe(false);
  });

  it('a full run never fires the same unique twice', () => {
    for (const seed of [1, 2, 3, 7, 14, 99]) {
      const { run } = simulateRun(seed, {}, 200);
      expect(new Set(run.firedEventIds).size).toBe(run.firedEventIds.length);
    }
  });
});

describe('route events — run integration (GS-14)', () => {
  it('routeOptions attaches an event to every route, deterministically', () => {
    const run = startRun(7);
    const routes = routeOptions(run);
    expect(routes).toHaveLength(3);
    for (const r of routes) expect(r.event).toBeTruthy();
    expect(routes.some((r) => isCalm(r.event))).toBe(true);
    // Distances are unchanged by adding events (the RNG stream is preserved).
    expect(routeOptions(run).map((r) => r.distanceJump)).toEqual(routes.map((r) => r.distanceJump));
  });

  it('travel carries the route event into the next stop; finishStop consumes it', () => {
    const flare = routeEvent('solar-flare')!;
    let run = startRun(1234);
    run = { ...run, stopIndex: 1, distanceFromStart: 4 };
    const moved = travel(run, { id: 0, distanceJump: 2, label: 'Cruise', event: flare });
    expect(moved.pendingEvent).toBe(flare);

    const course = { holes: new Array(6).fill(0), biome: 'x', rarity: 'common' } as never;
    // A passing scoreline so credits/cut both bite.
    const played = Array.from({ length: 6 }, () => ({ record: { strokes: 3, par: 4 } })) as never;
    const { run: scored } = finishStop(moved, course as never, played as never);
    expect(scored.pendingEvent).toBeUndefined(); // spent — cannot double-apply on resume
  });

  it('a +cutDelta event raises the bar; a creditMult event raises the payout', () => {
    const base = startRun(99);
    const stop = { ...base, stopIndex: 1, distanceFromStart: 6 };
    const holes = 6;
    const neutralCut = cutLine(stop.distanceFromStart, holes);

    const flare = routeEvent('solar-flare')!;
    const withFlare = { ...stop, pendingEvent: flare };
    expect(effectiveCut(withFlare, holes)).toBe(neutralCut + flare.cutDelta);
    expect(effectiveCut(stop, holes)).toBe(neutralCut); // no event → neutral

    // Same played holes, two events → the richer creditMult earns strictly more credits.
    const course = { holes: new Array(holes).fill(0) } as never;
    const played = Array.from({ length: holes }, () => ({ record: { strokes: 3, par: 4 } })) as never;
    const calm = routeEvent('calm-drift')!; // creditMult 1.0
    const poor = finishStop({ ...stop, pendingEvent: calm }, course, played).run.credits;
    const rich = finishStop({ ...stop, pendingEvent: routeEvent('trade-lane')! }, course, played).run.credits;
    expect(rich).toBeGreaterThan(poor);
  });

  it('snapshot/resume round-trips the pending event', () => {
    let run = startRun(42);
    run = travel(run, { ...routeOptions(run)[0]!, event: routeEvent('derelict-cache')! });
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.pendingEvent?.id).toBe('derelict-cache');
  });

  it('a no-upgrade run still always terminates by missing a cut (events do not break it)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { run, stops } = simulateRun(seed);
      expect(run.status).toBe('ended');
      expect(run.endedReason).toBe('cut');
      expect(stops.length).toBeGreaterThan(0);
    }
  });

  it('events leave stop 0 unchanged (neutral baseline — no pending event)', () => {
    // playStop on a fresh run has no pending event → the cut is the un-modified ramp value.
    const a = playStop(startRun(1234));
    expect(a.run.pendingEvent).toBeUndefined();
    expect(a.result.cut).toBe(cutLine(0, 6)); // flat stop 0 = 6 holes, distance 0
  });
});
