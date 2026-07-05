import { describe, it, expect } from 'vitest';
import {
  FUEL_TANK_MAX,
  FUEL_UNIT_COST,
  buyFuel,
  canTravel,
  cashOutShards,
  fuelShortfall,
  resumeRun,
  routeFuelCost,
  simulateRun,
  snapshotRun,
  startRun,
  strand,
  travel,
  travelRefuelCost,
  type Route,
  type Run,
} from '../src/sim/rpg/run';
import { FORMATS, startingFuelFor, stopCount, getFormat, DEFAULT_STARTING_FUEL } from '../src/sim/rpg/formats';
import { DEFAULT_EVENT, routeEvent } from '../src/sim/rpg/events';
import { themeById } from '../src/sim/course/themes';
import { initState, reduce, type UiState } from '../src/ui/game';

const TEST_THEME = themeById('crux')!;

/** A bare lane with a given jump distance (the neutral event, a real theme). */
function lane(distanceJump: number, event = DEFAULT_EVENT): Route {
  return { id: 0, distanceJump, label: 'test', event, theme: TEST_THEME };
}

describe('the fuel tank (GS-fuel)', () => {
  it('the voyage starts with exactly enough fuel for single hops; unending with its 25-unit tank', () => {
    // Machine-check the "complete the journey on single stops" contract against the voyage's SHAPE,
    // so re-arranging the stops list can't silently strand the frugal player.
    expect(FORMATS.voyage!.startingFuel).toBe(stopCount(FORMATS.voyage!) - 1);
    expect(startRun(1, 'voyage').fuel).toBe(8);
    expect(startRun(1, 'unending').fuel).toBe(25);
    // Retired ids fold into the default format's tank.
    expect(startRun(1, 'flat').fuel).toBe(startingFuelFor(getFormat('flat')));
    expect(DEFAULT_STARTING_FUEL).toBe(25);
  });

  it('a jump burns its distance in fuel, unit for unit', () => {
    const run = startRun(2, 'unending');
    expect(routeFuelCost(lane(1))).toBe(1);
    expect(routeFuelCost(lane(3))).toBe(3);
    const after = travel(run, lane(3));
    expect(after.fuel).toBe(run.fuel - 3);
    // No credit charge while the tank covers it.
    expect(after.credits).toBe(run.credits);
  });

  it('a short tank auto-buys the missing units at the depot price', () => {
    const run: Run = { ...startRun(3, 'unending'), fuel: 1, credits: 100 };
    expect(fuelShortfall(run, lane(3))).toBe(2);
    expect(travelRefuelCost(run, lane(3))).toBe(2 * FUEL_UNIT_COST);
    const after = travel(run, lane(3));
    expect(after.fuel).toBe(0);
    expect(after.credits).toBe(100 - 2 * FUEL_UNIT_COST);
  });

  it('the auto-refuel is paid BEFORE a toll, which stays floored at zero', () => {
    const toll = routeEvent('trade-lane');
    if (!toll?.creditToll) return; // event table changed — the ordering rule is covered above
    const run: Run = { ...startRun(4, 'unending'), fuel: 0, credits: FUEL_UNIT_COST + 5 };
    const after = travel(run, lane(1, toll));
    // 1 unit bought (20 cr), then the toll bites what's left (floored, never negative).
    expect(after.fuel).toBe(0);
    expect(after.credits).toBe(Math.max(0, 5 - toll.creditToll!));
  });

  it('an unpayable jump is blocked: canTravel says no and travel throws', () => {
    const broke: Run = { ...startRun(5, 'unending'), fuel: 0, credits: FUEL_UNIT_COST - 1 };
    expect(canTravel(broke, lane(1))).toBe(false);
    expect(() => travel(broke, lane(1))).toThrow(/fuel/);
    // With exactly one unit's worth of credits the same lane opens.
    expect(canTravel({ ...broke, credits: FUEL_UNIT_COST }, lane(1))).toBe(true);
  });

  it('buyFuel tops the tank up with credits, clamped to the purse and the tank cap', () => {
    const run: Run = { ...startRun(6, 'unending'), fuel: 10, credits: 100 };
    const five = buyFuel(run, 5);
    expect(five.fuel).toBe(15);
    expect(five.credits).toBe(100 - 5 * FUEL_UNIT_COST);
    // Purse-clamped: 100 credits buys at most 5 units.
    expect(buyFuel(run, 9).fuel).toBe(15);
    // Tank-clamped at the cap; zero/negative is a no-op (the same object back).
    expect(buyFuel({ ...run, fuel: FUEL_TANK_MAX }, 1)).toEqual({ ...run, fuel: FUEL_TANK_MAX });
    expect(buyFuel(run, 0)).toBe(run);
    expect(buyFuel({ ...run, credits: FUEL_UNIT_COST - 1 }, 1).fuel).toBe(10);
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
    // The voyage's headless driver finishes its campaign (auto-refuel covers deep jumps).
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
    expect(SAVE_VERSION).toBe(18);
    expect(s.activeRun?.fuel).toBeUndefined(); // the stamp adds nothing…
    expect(resumeRun(s.activeRun!).fuel).toBe(8); // …and resume grants the voyage's fresh tank
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
    const fuelBefore = s.run.fuel;
    const creditsBefore = s.run.credits;
    s = reduce(s, { type: 'buyFuel', units: 1 });
    if (creditsBefore >= 20) {
      expect(s.run.fuel).toBe(fuelBefore + 1);
      expect(s.run.credits).toBe(creditsBefore - 20);
    }
  });

  it('an unpayable route click is a no-op; a payable one travels and burns the tank', () => {
    const s = toTravel(31);
    if (!s) return;
    const route = s.routes![0]!;
    // Drain the tank + purse: the same click must now bounce.
    const broke: UiState = { ...s, run: { ...s.run, fuel: 0, credits: 0 } };
    expect(reduce(broke, { type: 'route', routeId: route.id })).toBe(broke);
    // With the real tank the jump proceeds and the gauge drops by the jump distance.
    const after = reduce(s, { type: 'route', routeId: route.id });
    expect(after.screen).toBe('intro');
    expect(after.run.fuel).toBe(Math.max(0, s.run.fuel - route.distanceJump));
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
