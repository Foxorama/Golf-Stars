import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVENT,
  ROUTE_EVENTS,
  UNIQUE_EVENTS,
  drawArcRouteEvents,
  drawRouteEvents,
  eventPool,
  isCalm,
  routeEvent,
  type RouteEvent,
} from '../src/sim/rpg/events';
import {
  effectiveCut,
  finishStop,
  playStop,
  resumeRun,
  routeOptions,
  shardsForRun,
  simulateRun,
  snapshotRun,
  startRun,
  travel,
} from '../src/sim/rpg/run';
import { cutLine } from '../src/sim/rpg/economy';
import { RARITY_C, RARITIES } from '../src/sim/rpg/loot';
import { themeById, type Arc } from '../src/sim/course/themes';
import { Rng } from '../src/sim/rng';

// A stand-in destination world for hand-built Route literals (GS-journey-biome): the route's `theme`
// only drives the biome arrived in, which these economy/event tests don't assert on.
const TEST_THEME = themeById('crux')!;

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
      theme: TEST_THEME,
    });
    expect(intoUnique.firedEventIds).toContain('apophis-flyby');

    const intoRecurring = travel(base, {
      id: 0,
      distanceJump: 1,
      label: 'Short hop',
      event: routeEvent('solar-flare')!,
      theme: TEST_THEME,
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
      theme: TEST_THEME,
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
    const moved = travel(run, { id: 0, distanceJump: 2, label: 'Cruise', event: flare, theme: TEST_THEME });
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

  it('consecutive jumps never offer the identical set of lanes (anti-repeat, GS-journey)', () => {
    // Walk a real voyage; capture the route offer at each travel screen and assert no two BACK-TO-BACK
    // offers are the same id-set (the small early-arc pool used to repeat the same 3 lanes).
    for (const seed of ['journey-1', 'journey-2', 'journey-3', 'abc', 'xyz']) {
      let run = startRun(seed, 'voyage');
      let prev: string | undefined;
      for (let i = 0; i < 6 && run.status === 'active'; i++) {
        run = playStop(run).run;
        if (run.status !== 'active') break;
        const offer = routeOptions(run);
        const key = [...offer.map((r) => r.event.id)].sort().join('|');
        if (prev !== undefined) expect(key).not.toBe(prev);
        prev = key;
        run = travel(run, offer[0]!);
      }
    }
  });

  it('routeOptions stays a deterministic pure function of the run (anti-repeat included)', () => {
    let run = startRun('detr', 'voyage');
    run = playStop(run).run;
    run = travel(run, routeOptions(run)[0]!);
    run = playStop(run).run;
    const a = routeOptions(run).map((r) => r.event.id);
    const b = routeOptions(run).map((r) => r.event.id);
    expect(a).toEqual(b);
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

// --- The rebalance: distinct levers, rarity = stakes, per-arc distribution (GS-routes) -------------

describe('route events — rebalanced lever design (GS-routes)', () => {
  const ALL = [...ROUTE_EVENTS, ...UNIQUE_EVENTS];

  it('no free lunch: a SAFE lane is either poor-paying or charges a toll (never rich-and-free)', () => {
    for (const e of ALL) {
      if (!isCalm(e)) continue; // only the low-risk "outs"
      const rich = e.creditMult > 1.2;
      if (rich) expect(e.creditToll ?? 0).toBeGreaterThan(0); // upside is paid for
    }
  });

  it('rarity = stakes: the credit-multiplier CEILING rises with rarity', () => {
    const ceilByOrder = new Map<number, number>();
    for (const e of ALL) {
      const o = RARITY_C[e.rarity].order;
      ceilByOrder.set(o, Math.max(ceilByOrder.get(o) ?? 0, e.creditMult));
    }
    let prev = 0;
    for (let o = 0; o < RARITIES.length; o++) {
      const c = ceilByOrder.get(o);
      if (c === undefined) continue;
      expect(c).toBeGreaterThanOrEqual(prev); // monotonic non-decreasing ceiling
      prev = c;
    }
    // A common never out-pays the best legendary (the original "green beats orange" bug).
    const bestCommon = Math.max(...ALL.filter((e) => e.rarity === 'common').map((e) => e.creditMult));
    const bestLegendary = Math.max(...ALL.filter((e) => e.rarity === 'legendary').map((e) => e.creditMult));
    expect(bestLegendary).toBeGreaterThan(bestCommon);
  });

  it('the two new reward TYPES exist (a toll lane and a salvage/shard lane)', () => {
    expect(ALL.some((e) => (e.creditToll ?? 0) > 0)).toBe(true);
    expect(ALL.some((e) => (e.shardBonus ?? 0) > 0)).toBe(true);
    // Every event carries the new flavour metadata so the cards read distinctly.
    for (const e of ALL) {
      expect(e.icon).toBeTruthy();
      expect(e.lore).toBeTruthy();
      expect(e.category).toBeTruthy();
    }
  });
});

describe('route events — per-arc slot distribution (GS-routes)', () => {
  const poolFor = (arc: Arc) => eventPool(arc === 1 ? 0 : arc === 2 ? 6 : 15);

  it('drawArcRouteEvents is deterministic and returns ≤3 distinct lanes; arcs 1–2 always offer an out', () => {
    for (const arc of [1, 2, 3] as Arc[]) {
      const pool = poolFor(arc);
      for (let seed = 0; seed < 80; seed++) {
        const a = drawArcRouteEvents(new Rng(`a:${seed}`), arc, pool);
        const b = drawArcRouteEvents(new Rng(`a:${seed}`), arc, pool);
        expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id)); // deterministic
        expect(a.length).toBeLessThanOrEqual(3);
        expect(new Set(a.map((e) => e.id)).size).toBe(a.length); // distinct
        // The early arcs always keep a safer lane; arc 3 may be all-or-nothing.
        if (arc < 3) expect(a.some(isCalm)).toBe(true);
      }
    }
  });

  function rarityMix(arc: Arc): Record<string, number> {
    const pool = poolFor(arc);
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    const N = 2000;
    for (let s = 0; s < N; s++) {
      for (const e of drawArcRouteEvents(new Rng(`mix:${arc}:${s}`), arc, pool)) counts[e.rarity]!++;
    }
    return counts;
  }

  it('the rarity mix ramps with the arc: commons dominate early, rares/epics/legendaries arrive deep', () => {
    const m1 = rarityMix(1);
    const m3 = rarityMix(3);
    const frac = (m: Record<string, number>, k: string) =>
      (m[k] ?? 0) / ((m.common ?? 0) + (m.rare ?? 0) + (m.epic ?? 0) + (m.legendary ?? 0));

    // Arc 1 is overwhelmingly common; arc 3 is overwhelmingly NOT.
    expect(frac(m1, 'common')).toBeGreaterThan(0.7);
    expect(frac(m3, 'common')).toBeLessThan(0.2);
    // Higher tiers are scarce early and common (relatively) deep.
    expect(frac(m3, 'rare')).toBeGreaterThan(frac(m1, 'rare'));
    expect(frac(m3, 'epic')).toBeGreaterThan(frac(m1, 'epic'));
    expect(frac(m3, 'legendary')).toBeGreaterThan(frac(m1, 'legendary'));
    // Arc 1 can flash a rare/epic (the wildcard) but never legendaries; arc 3 reaches them all.
    expect(m1.legendary).toBe(0);
    expect(m3.legendary).toBeGreaterThan(0);
  });

  it('arc 3 can deal a clean sweep of legendaries (the deep-game jackpot ceiling)', () => {
    const pool = poolFor(3);
    let sawTriple = false;
    for (let s = 0; s < 20000 && !sawTriple; s++) {
      const draw = drawArcRouteEvents(new Rng(`triple:${s}`), 3, pool);
      if (draw.length === 3 && draw.every((e) => e.rarity === 'legendary')) sawTriple = true;
    }
    expect(sawTriple).toBe(true);
  });
});

describe('route events — toll + shard levers wired through the run (GS-routes)', () => {
  const lane = (event: RouteEvent, distanceJump = 1) => ({ id: 0, distanceJump, label: 'Short hop', event, theme: TEST_THEME });

  it('a toll lane charges credits up front on travel (floored at 0)', () => {
    const toll = routeEvent('trade-lane')!;
    expect(toll.creditToll).toBeGreaterThan(0);
    const run = { ...startRun(3), credits: 100 };
    const after = travel(run, lane(toll));
    expect(after.credits).toBe(100 - toll.creditToll!);
    // Floors at 0 — a toll never strands you below zero.
    const broke = travel({ ...startRun(3), credits: 5 }, lane(toll));
    expect(broke.credits).toBe(0);
  });

  it('a salvage lane banks permanent shards on travel, kept even on a later bust', () => {
    const salvage = routeEvent('asteroid-mining')!;
    expect(salvage.shardBonus).toBeGreaterThan(0);
    const run = startRun(3);
    const after = travel(run, lane(salvage));
    expect(after.bonusShards).toBe(salvage.shardBonus);
    // Banked shards survive a bust — isolate the bonus from the (distance-driven) base.
    const busted = { ...after, status: 'ended' as const, endedReason: 'cut' as const };
    const withoutBonus = shardsForRun({ ...busted, bonusShards: 0 });
    expect(shardsForRun(busted)).toBe(withoutBonus + salvage.shardBonus!);
  });

  it('a plain lane (no toll/shard) leaves credits + bonusShards untouched', () => {
    const plain = routeEvent('new-moon')!;
    expect(plain.creditToll ?? 0).toBe(0);
    expect(plain.shardBonus ?? 0).toBe(0);
    const run = { ...startRun(3), credits: 60 };
    const after = travel(run, lane(plain));
    expect(after.credits).toBe(60);
    expect(after.bonusShards).toBe(0);
  });

  it('snapshot/resume round-trips banked shards', () => {
    let run = startRun(42);
    run = travel(run, lane(routeEvent('asteroid-mining')!));
    expect(run.bonusShards).toBeGreaterThan(0);
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.bonusShards).toBe(run.bonusShards);
  });
});
