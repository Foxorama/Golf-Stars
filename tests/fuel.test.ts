import { describe, it, expect } from 'vitest';
import {
  FUEL_PRICE_BASE,
  FUEL_PRICE_MAX,
  FUEL_PRICE_SLOPE,
  buy,
  buyFuel,
  canTravel,
  cashOutShards,
  currentCourse,
  finishStop,
  fuelShortfall,
  fuelUnitCost,
  resumeRun,
  routeFuelCost,
  routeOptions,
  canScanRoutes,
  scanFuelCost,
  scanRoutes,
  simulateRun,
  snapshotRun,
  startRun,
  strand,
  tankCapacity,
  travel,
  travelRefuelCost,
  type Route,
  type Run,
} from '../src/sim/rpg/run';
import type { PlayedHole } from '../src/sim/round';
import { FORMATS, startingFuelFor, stopCount, getFormat, DEFAULT_STARTING_FUEL } from '../src/sim/rpg/formats';
import { DEFAULT_EVENT, eventPool, routeEvent } from '../src/sim/rpg/events';
import { effectFuelDelta, routeEffect } from '../src/sim/rpg/effects';
import { themeById } from '../src/sim/course/themes';
import { fuelGaugeHTML } from '../src/render/fuel';
import { initState, reduce, type UiState } from '../src/ui/game';

const TEST_THEME = themeById('crux')!;

/** A bare lane with a given jump distance (the neutral event, a real theme). */
function lane(distanceJump: number, event = DEFAULT_EVENT): Route {
  return { id: 0, distanceJump, label: 'test', event, theme: TEST_THEME };
}

describe('the fuel tank (GS-fuel / GS-fuel-2)', () => {
  it('the voyage starts with exactly enough fuel for single hops; unending with a 12-unit tank', () => {
    // Machine-check the "complete the journey on single stops" contract against the voyage's SHAPE,
    // so re-arranging the stops list can't silently strand the frugal player.
    expect(FORMATS.voyage!.startingFuel).toBe(stopCount(FORMATS.voyage!) - 1);
    expect(startRun(1, 'voyage').fuel).toBe(8);
    expect(startRun(1, 'unending').fuel).toBe(12);
    // Retired ids fold into the default format's tank.
    expect(startRun(1, 'flat').fuel).toBe(startingFuelFor(getFormat('flat')));
    expect(DEFAULT_STARTING_FUEL).toBe(12);
  });

  it('the starting tank IS the capacity (GS-fuel-2) — a run launches full', () => {
    expect(tankCapacity(startRun(1, 'voyage'))).toBe(8);
    expect(tankCapacity(startRun(1, 'unending'))).toBe(12);
  });

  it('fuel gets dearer the deeper you fly (GS-fuel-2), capped at the deep-space ceiling', () => {
    const at = (distanceFromStart: number) => fuelUnitCost({ distanceFromStart });
    expect(at(0)).toBe(FUEL_PRICE_BASE);
    expect(at(5)).toBe(FUEL_PRICE_BASE + 5 * FUEL_PRICE_SLOPE);
    // Monotonic non-decreasing, and capped however deep the run gets.
    for (let d = 1; d < 60; d++) expect(at(d)).toBeGreaterThanOrEqual(at(d - 1));
    expect(at(1000)).toBe(FUEL_PRICE_MAX);
    // A junk negative distance never yields a below-base price.
    expect(at(-3)).toBe(FUEL_PRICE_BASE);
  });

  it('a jump burns its distance in fuel, unit for unit', () => {
    const run = startRun(2, 'unending');
    expect(routeFuelCost(run, lane(1))).toBe(1);
    expect(routeFuelCost(run, lane(3))).toBe(3);
    const after = travel(run, lane(3));
    expect(after.fuel).toBe(run.fuel - 3);
    // No credit charge while the tank covers it.
    expect(after.credits).toBe(run.credits);
  });

  it('a short tank buys the missing units at the LOCAL depot price', () => {
    const run: Run = { ...startRun(3, 'unending'), fuel: 1, credits: 500, distanceFromStart: 10 };
    const local = fuelUnitCost(run);
    expect(local).toBe(FUEL_PRICE_BASE + 10 * FUEL_PRICE_SLOPE);
    expect(fuelShortfall(run, lane(3))).toBe(2);
    expect(travelRefuelCost(run, lane(3))).toBe(2 * local);
    const after = travel(run, lane(3));
    expect(after.fuel).toBe(0);
    expect(after.credits).toBe(500 - 2 * local);
  });

  it('the refuel is paid BEFORE a toll, which stays floored at zero', () => {
    const toll = routeEvent('trade-lane');
    if (!toll?.creditToll) return; // event table changed — the ordering rule is covered above
    const run: Run = { ...startRun(4, 'unending'), fuel: 0, credits: FUEL_PRICE_BASE + 5 };
    const after = travel(run, lane(1, toll));
    // 1 unit bought at the home price, then the toll bites what's left (floored, never negative).
    expect(after.fuel).toBe(0);
    expect(after.credits).toBe(Math.max(0, 5 - toll.creditToll!));
  });

  it('an unpayable jump is blocked: canTravel says no and travel throws', () => {
    const broke: Run = { ...startRun(5, 'unending'), fuel: 0, credits: FUEL_PRICE_BASE - 1 };
    expect(canTravel(broke, lane(1))).toBe(false);
    expect(() => travel(broke, lane(1))).toThrow(/fuel/);
    // With exactly one unit's worth of credits the same lane opens.
    expect(canTravel({ ...broke, credits: FUEL_PRICE_BASE }, lane(1))).toBe(true);
  });

  it('buyFuel tops the tank up at the local price, clamped to the purse and the capacity', () => {
    const run: Run = { ...startRun(6, 'unending'), fuel: 5, credits: 100 };
    const cap = tankCapacity(run);
    const five = buyFuel(run, 5);
    expect(five.fuel).toBe(10);
    expect(five.credits).toBe(100 - 5 * FUEL_PRICE_BASE);
    // Purse-clamped: 100 credits at the 10-cr home price buys at most 10 — but capacity binds first.
    expect(buyFuel(run, 99).fuel).toBe(cap);
    // Deeper, the SAME purse buys fewer units (the price curve is the strategy).
    const deep: Run = { ...run, distanceFromStart: 20 };
    expect(buyFuel(deep, 99).fuel).toBe(5 + Math.floor(100 / fuelUnitCost(deep)));
    // Capacity-clamped at the top; zero/negative is a no-op (the same object back).
    expect(buyFuel({ ...run, fuel: cap }, 1)).toEqual({ ...run, fuel: cap });
    expect(buyFuel(run, 0)).toBe(run);
    expect(buyFuel({ ...run, credits: FUEL_PRICE_BASE - 1 }, 1).fuel).toBe(5);
    // A legacy save resumed ABOVE the capacity simply can't buy more (never a negative clamp).
    expect(buyFuel({ ...run, fuel: cap + 9 }, 3).fuel).toBe(cap + 9);
  });

  it('stranding ends the run and, like a bank, converts the pocket change to shards', () => {
    const run: Run = { ...startRun(7, 'unending'), credits: 45 };
    const stranded = strand(run);
    expect(stranded.status).toBe('ended');
    expect(stranded.endedReason).toBe('stranded');
    expect(cashOutShards(stranded)).toBe(Math.floor(45 / 20));
    // A cut still forfeits (byte-for-byte the old rule).
    expect(cashOutShards({ ...run, status: 'ended', endedReason: 'cut' })).toBe(0);
  });

  it('fuel round-trips through snapshot/resume; a pre-fuel snapshot gets a fresh tank', () => {
    const run: Run = { ...startRun(8, 'voyage'), fuel: 3 };
    expect(resumeRun(snapshotRun(run)).fuel).toBe(3);
    // An old (pre-v18) snapshot has no fuel field → the format's starting tank, never stranded.
    const old = { ...snapshotRun(run), fuel: undefined };
    expect(resumeRun(old).fuel).toBe(8);
  });

  it('simulateRun refuels as it goes and still terminates every seeded run cleanly', () => {
    for (let seed = 0; seed < 6; seed++) {
      const { run } = simulateRun(seed, { formatId: 'unending' }, 200);
      expect(run.status).toBe('ended');
      expect(['cut', 'stranded']).toContain(run.endedReason);
      expect(run.fuel).toBeGreaterThanOrEqual(0);
    }
    // The voyage's headless driver finishes its campaign (the jump-time refuel covers deep jumps).
    const v = simulateRun(2, { formatId: 'voyage' });
    expect(v.run.status).toBe('ended');
    expect(v.run.fuel).toBeGreaterThanOrEqual(0);
  });

  it('a deep-jump strategy on the voyage burns past the single-hop budget and pays for it', () => {
    const deep = simulateRun(9, {
      formatId: 'voyage',
      pickRoute: (_run, routes) => routes.slice().sort((a, b) => b.distanceJump - a.distanceJump)[0]!,
    });
    expect(deep.run.status).toBe('ended');
    expect(deep.run.fuel).toBeGreaterThanOrEqual(0);
  });
});

describe('ship outfitting + the eagle siphon (GS-fuel-3)', () => {
  /** A run rich enough to buy any relic outright. */
  function richRun(seed: number): Run {
    return { ...startRun(seed, 'unending'), credits: 10_000 };
  }

  it('Ion Thrusters shave a unit off every jump, floored at 1 — a jump is never free', () => {
    const run = buy(richRun(11), 'ion-thrusters');
    expect(run.loadout.fuelEfficiency).toBe(1);
    expect(run.loadout.perks).toContain('ion-thrusters');
    expect(routeFuelCost(run, lane(3))).toBe(2);
    expect(routeFuelCost(run, lane(2))).toBe(1);
    expect(routeFuelCost(run, lane(1))).toBe(1); // the floor
    // The jump still covers its full DISTANCE — the drive saves fuel, not depth.
    const after = travel(run, lane(3));
    expect(after.fuel).toBe(run.fuel - 2);
    expect(after.distanceFromStart).toBe(run.distanceFromStart + 3);
  });

  it('the Reserve Tank raises capacity by 4 and arrives full', () => {
    const base = richRun(12);
    const cap = tankCapacity(base);
    const drained: Run = { ...base, fuel: 3 };
    const run = buy(drained, 'reserve-tank');
    expect(run.loadout.tankBonus).toBe(4);
    expect(tankCapacity(run)).toBe(cap + 4);
    expect(run.fuel).toBe(7); // +4 units poured in at purchase
    // Near-full: the pour clamps to the new capacity, never spills past it.
    const nearFull = buy({ ...base, fuel: cap + 2 }, 'reserve-tank');
    expect(nearFull.fuel).toBe(cap + 4);
    // A legacy over-capacity tank is never drained by the clamp.
    const legacy = buy({ ...base, fuel: cap + 99 }, 'reserve-tank');
    expect(legacy.fuel).toBe(cap + 99);
    // And buyFuel now fills to the raised ceiling.
    expect(buyFuel(run, 99).fuel).toBe(cap + 4);
  });

  it('both relics rebuild from perk ids on resume — and the tank fuel is never re-granted', () => {
    let run = buy(buy(richRun(13), 'ion-thrusters'), 'reserve-tank');
    run = { ...run, fuel: 5 };
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.loadout.fuelEfficiency).toBe(1);
    expect(resumed.loadout.tankBonus).toBe(4);
    expect(tankCapacity(resumed)).toBe(tankCapacity(run));
    expect(routeFuelCost(resumed, lane(3))).toBe(2);
    expect(resumed.fuel).toBe(5); // the +4 pour happened ONCE, at purchase
  });

  it('a holed eagle-or-better siphons one fuel cell in finishStop, capacity-clamped', () => {
    const base = startRun(14, 'unending');
    const course = currentCourse(base);
    // Every hole an eagle (par − 2, holed): passes any endless bar and siphons per hole.
    const eagles = course.holes.map((h) => ({
      record: { par: h.par, strokes: h.par - 2 },
      holed: true,
      pickedUp: false,
    })) as unknown as PlayedHole[];
    const drained: Run = { ...base, fuel: 5 };
    const { run: after } = finishStop(drained, course, eagles);
    expect(after.fuel).toBe(Math.min(tankCapacity(base), 5 + course.holes.length));
    // A warped stop never siphons (mirrors the milestone-shard rule)…
    const { run: warped } = finishStop(drained, course, eagles, { warp: true });
    expect(warped.fuel).toBe(5);
    // …pars siphon nothing, and a legacy over-capacity tank is never drained by the clamp.
    const pars = course.holes.map((h) => ({
      record: { par: h.par, strokes: h.par },
      holed: true,
      pickedUp: false,
    })) as unknown as PlayedHole[];
    expect(finishStop(drained, course, pars).run.fuel).toBe(5);
    const over: Run = { ...base, fuel: 99 };
    expect(finishStop(over, course, eagles).run.fuel).toBe(99);
  });
});

describe('the fuel gauge (GS-fuel-2)', () => {
  it('draws one cell per unit of capacity, lit up to the tank level', () => {
    const html = fuelGaugeHTML(3, 8);
    expect(html.match(/gs-fuelbar__cell[" ]/g)!.length).toBe(8);
    expect(html.match(/gs-fuelbar__cell--lit/g)!.length).toBe(3);
    expect(html).toContain('aria-label="Fuel 3 of 8"');
  });

  it('a legacy over-capacity tank shows a reserve chip, never a longer bar', () => {
    const html = fuelGaugeHTML(25, 12);
    expect(html.match(/gs-fuelbar__cell--lit/g)!.length).toBe(12);
    expect(html).toContain('gs-fuelbar__over');
    expect(html).toContain('+13');
  });

  it('an empty or junk tank never draws a lit cell', () => {
    expect(fuelGaugeHTML(0, 8)).not.toContain('--lit');
    expect(fuelGaugeHTML(-3, 8)).not.toContain('--lit');
  });
});

describe('save v17 → v18 (GS-fuel)', () => {
  it('migrates as a pure version stamp; an active pre-fuel run resumes with a fresh tank', async () => {
    const { migrate, defaultSave, SAVE_VERSION } = await import('../src/save/schema');
    const v17 = {
      ...defaultSave(),
      version: 17,
      activeRun: { seed: 7, formatId: 'voyage', stopIndex: 3, distanceFromStart: 4, credits: 90, perks: [] },
    } as unknown;
    const s = migrate(v17);
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(23);
    expect(s.activeRun?.fuel).toBeUndefined(); // the stamp adds nothing…
    expect(resumeRun(s.activeRun!).fuel).toBe(8); // …and resume grants the voyage's fresh tank
  });

  it('v18 → v19 (GS-fuel-4) is a pure stamp; a pre-scan run resumes on the classic scan-0 offer', async () => {
    const { migrate, defaultSave } = await import('../src/save/schema');
    const v18 = {
      ...defaultSave(),
      version: 18,
      activeRun: { seed: 7, formatId: 'unending', stopIndex: 2, distanceFromStart: 3, credits: 90, perks: [], fuel: 6 },
    } as unknown;
    const s = migrate(v18);
    expect(s.version).toBe(23);
    expect(s.activeRun?.routeScans).toBeUndefined(); // the stamp adds nothing…
    expect(resumeRun(s.activeRun!).routeScans).toBe(0); // …and resume reads it as never-scanned
  });
});

describe('the sky prices the passage (GS-fuel-4 tail/headwinds)', () => {
  const tailwind = routeEvent('solar-wind')!; // → solarWind sky, −1 ⛽
  const headwind = routeEvent('ion-storm')!; // → ionStorm sky, +1 ⛽

  it('a tailwind sky shaves a unit, a headwind adds one — decoupling burn from distance', () => {
    const run = startRun(51, 'unending');
    expect(effectFuelDelta('solarWind')).toBe(-1);
    expect(effectFuelDelta('comet')).toBe(-1);
    expect(effectFuelDelta('gravityWell')).toBe(1);
    expect(effectFuelDelta('ionStorm')).toBe(1);
    expect(routeFuelCost(run, lane(2, tailwind))).toBe(1);
    expect(routeFuelCost(run, lane(2, headwind))).toBe(3);
    // The 1-unit floor holds — a tailwind never makes a jump free.
    expect(routeFuelCost(run, lane(1, tailwind))).toBe(1);
    // An event-less partial (clear skies) prices exactly as before.
    expect(routeFuelCost(run, lane(2))).toBe(2);
  });

  it('travel, the shortfall bill and the lane lock all price the sky', () => {
    const run = startRun(52, 'unending');
    const after = travel(run, lane(2, headwind));
    expect(after.fuel).toBe(run.fuel - 3);
    expect(after.distanceFromStart).toBe(run.distanceFromStart + 2); // burn ≠ depth: full distance flown
    const dry: Run = { ...run, fuel: 0, credits: 500 };
    expect(fuelShortfall(dry, lane(2, headwind))).toBe(3);
    expect(travelRefuelCost(dry, lane(2, headwind))).toBe(3 * fuelUnitCost(dry));
    const broke: Run = { ...run, fuel: 2, credits: 0 };
    expect(canTravel(broke, lane(2, tailwind))).toBe(true); // tailwind brings it in range…
    expect(canTravel(broke, lane(2, headwind))).toBe(false); // …the headwind locks it
  });

  it('Ion Thrusters stack with the sky, still floored at 1', () => {
    const run = buy({ ...startRun(53, 'unending'), credits: 10_000 }, 'ion-thrusters');
    expect(routeFuelCost(run, lane(3, headwind))).toBe(3); // 3 +1 sky −1 drive
    expect(routeFuelCost(run, lane(2, tailwind))).toBe(1); // 2 −1 sky −1 drive → floor
  });

  it('FAIRNESS machine-check: no calm-category OUT lane is ever fuel-taxed', () => {
    for (const e of eventPool(999)) {
      if (effectFuelDelta(routeEffect(e)) > 0) expect(e.category).not.toBe('calm');
    }
  });
});

describe('fuel-salvage lanes (GS-fuel-4)', () => {
  it('the tanker events exist, arc-tiered, and every fuel grant is stated on the card desc', () => {
    const arc1 = eventPool(0).map((e) => e.id);
    expect(arc1).toContain('fuel-scow');
    expect(arc1).not.toContain('derelict-tanker');
    const deep = eventPool(999).map((e) => e.id);
    expect(deep).toContain('derelict-tanker');
    expect(deep).toContain('fuel-caravan');
    // Honesty guard: a lane that refuels SAYS so, in the same ⛽ language every gauge uses.
    for (const e of eventPool(999)) {
      if (e.fuelBonus) expect(e.desc).toMatch(/refuel \+\d+ ⛽/i);
    }
  });

  it('travel siphons the bonus on arrival, clamped to capacity, never draining an over-full tank', () => {
    const scow = routeEvent('fuel-scow')!;
    const run: Run = { ...startRun(61, 'unending'), fuel: 4 };
    const after = travel(run, lane(1, scow));
    expect(after.fuel).toBe(4 - 1 + 2); // burn the hop, then +2 from the scow
    // Near-full: the siphon clamps to the tank, never spills.
    const nearFull: Run = { ...run, fuel: tankCapacity(run) };
    expect(travel(nearFull, lane(1, scow)).fuel).toBe(tankCapacity(run));
    // A legacy over-capacity tank is never drained by the clamp.
    const over: Run = { ...run, fuel: tankCapacity(run) + 9 };
    expect(travel(over, lane(1, scow)).fuel).toBe(tankCapacity(run) + 9 - 1);
  });
});

describe('the sector scan (GS-fuel-4)', () => {
  it('burns escalating fuel to redraw the lanes, and always keeps a cell in the tank', () => {
    const run: Run = { ...startRun(71, 'unending'), fuel: 4 };
    expect(scanFuelCost(run)).toBe(1);
    expect(canScanRoutes(run)).toBe(true);
    const once = scanRoutes(run);
    expect(once.fuel).toBe(3);
    expect(once.routeScans).toBe(1);
    expect(scanFuelCost(once)).toBe(2); // the reroll precedent: 1, 2, 3…
    const twice = scanRoutes(once);
    expect(twice.fuel).toBe(1);
    // At 1 cell the next (3-unit) scan is refused — you can never scan yourself dry.
    expect(canScanRoutes(twice)).toBe(false);
    expect(() => scanRoutes(twice)).toThrow(/fuel/);
    // The guard is strict: fuel === cost still refuses (≥1 cell must REMAIN).
    expect(canScanRoutes({ ...run, fuel: 1, routeScans: 0 })).toBe(false);
    expect(canScanRoutes({ ...run, fuel: 2, routeScans: 0 })).toBe(true);
  });

  it('a scan re-keys the route draw; scan 0 is the classic stream; travel resets the meter', () => {
    const run: Run = { ...startRun(72, 'unending'), stopIndex: 1, fuel: 10 };
    const original = routeOptions(run);
    // Scan 0 is pure + repeatable (the classic stream, byte-identical).
    expect(routeOptions(run)).toEqual(original);
    const scanned = scanRoutes(run);
    const redrawn = routeOptions(scanned);
    // A fresh draw — deterministic (a resume reproduces it), and different from the original
    // (event ids + distances both re-rolled; if this seed ever collides, pick another).
    expect(routeOptions(scanned)).toEqual(redrawn);
    expect(redrawn.map((r) => `${r.distanceJump}:${r.event.id}`)).not.toEqual(
      original.map((r) => `${r.distanceJump}:${r.event.id}`),
    );
    // The jump resets the meter: the NEXT stop opens on its classic scan-0 offer.
    expect(travel(scanned, redrawn[0]!).routeScans).toBe(0);
  });

  it('the scanned offer round-trips through snapshot/resume — you keep what you paid for', () => {
    const run = scanRoutes({ ...startRun(73, 'unending'), stopIndex: 2, fuel: 8 });
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.routeScans).toBe(1);
    expect(routeOptions(resumed).map((r) => r.event.id)).toEqual(routeOptions(run).map((r) => r.event.id));
    // A pre-scan snapshot reads as never-scanned.
    expect(resumeRun({ ...snapshotRun(run), routeScans: undefined }).routeScans).toBe(0);
  });
});

describe('the reducer plumbs fuel (GS-fuel)', () => {
  /** Drive a fresh unending run to its first travel screen (or bail on an unlucky stop-0 death). */
  function toTravel(seed: number): UiState | undefined {
    let s = reduce(initState(seed), { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    s = reduce(s, { type: 'play' });
    if (s.screen === 'gameover') return undefined;
    s = reduce(s, { type: 'continue' });
    s = reduce(s, { type: 'leaveShop' });
    return s.screen === 'travel' ? s : undefined;
  }

  it('buyFuel works at the Pro Shop and on the journey screen, nowhere else', () => {
    let s = reduce(initState(21), { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    s = reduce(s, { type: 'play' });
    if (s.screen === 'gameover') return;
    // Intro/result screens refuse the action.
    expect(reduce(s, { type: 'buyFuel', units: 1 })).toBe(s);
    s = reduce(s, { type: 'continue' });
    expect(s.screen).toBe('shop');
    // The run launches with a FULL tank (GS-fuel-2), so drain it to make room to buy.
    const drained: UiState = { ...s, run: { ...s.run, fuel: 2, credits: 200 } };
    const price = fuelUnitCost(drained.run);
    const bought = reduce(drained, { type: 'buyFuel', units: 1 });
    expect(bought.run.fuel).toBe(3);
    expect(bought.run.credits).toBe(200 - price);
    // A full tank refuses the top-up (capacity is real now).
    const full: UiState = { ...s, run: { ...s.run, fuel: tankCapacity(s.run), credits: 200 } };
    expect(reduce(full, { type: 'buyFuel', units: 1 }).run.fuel).toBe(tankCapacity(s.run));
  });

  it('an unpayable route click is a no-op; a payable one travels and burns the tank', () => {
    const s = toTravel(31);
    if (!s) return;
    const route = s.routes![0]!;
    // Drain the tank + purse: the same click must now bounce.
    const broke: UiState = { ...s, run: { ...s.run, fuel: 0, credits: 0 } };
    expect(reduce(broke, { type: 'route', routeId: route.id })).toBe(broke);
    // With the real tank the jump proceeds and the gauge drops by the jump's full bill (its
    // distance, plus any GS-fuel-4 sky tail/headwind) — and any arrival siphon pours back in.
    const after = reduce(s, { type: 'route', routeId: route.id });
    expect(after.screen).toBe('intro');
    const bonus = route.event.fuelBonus ?? 0;
    expect(after.run.fuel).toBe(
      Math.min(tankCapacity(s.run), Math.max(0, s.run.fuel - routeFuelCost(s.run, route)) + bonus),
    );
  });

  it('scanRoutes burns fuel and redraws the lanes on the travel screen, nowhere else', () => {
    const s = toTravel(51);
    if (!s) return;
    const scanned = reduce(s, { type: 'scanRoutes' });
    expect(scanned.run.fuel).toBe(s.run.fuel - 1);
    expect(scanned.run.routeScans).toBe(1);
    expect(scanned.routes!.map((r) => `${r.distanceJump}:${r.event.id}`)).not.toEqual(
      s.routes!.map((r) => `${r.distanceJump}:${r.event.id}`),
    );
    // A dry tank refuses (the scan never takes the last cell)…
    const dry: UiState = { ...s, run: { ...s.run, fuel: 1 } };
    expect(reduce(dry, { type: 'scanRoutes' })).toBe(dry);
    // …and off the travel screen it's a no-op.
    const title = initState(1);
    expect(reduce(title, { type: 'scanRoutes' })).toBe(title);
  });

  it('strand ends the run from the travel screen with the stranded reason + banked shards', () => {
    const s = toTravel(41);
    if (!s) return;
    const stuck: UiState = { ...s, run: { ...s.run, fuel: 0, credits: 0 } };
    const over = reduce(stuck, { type: 'strand' });
    expect(over.screen).toBe('gameover');
    expect(over.run.endedReason).toBe('stranded');
    expect(over.lastRunShards).toBeGreaterThan(0);
    // And off the travel screen it's a no-op.
    const title = initState(1);
    expect(reduce(title, { type: 'strand' })).toBe(title);
  });
});
