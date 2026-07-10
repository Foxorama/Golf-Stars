/**
 * Ship fuel + the sector scan (extracted from run.ts, GS-refactor-split).
 *
 * The whole fuel economy: local pricing, tank capacity, per-jump burn, shortfall/refuel maths, the
 * travel affordability gate, buying fuel, the sector-scan re-roll, and the stranded end-state. Pure
 * arithmetic on the run (zero rng — every seeded stream is untouched); the only run dependencies are
 * the `Run`/`Route` TYPES (erased at compile, so no runtime import cycle). run.ts re-exports every
 * public symbol here, so existing importers are unchanged. Behaviour is byte-for-byte identical to
 * when this lived inside run.ts — a pure move.
 *
 * --- Ship fuel (GS-fuel, redesigned GS-fuel-2) --------------------------------
 *
 * Every journey jump burns its DISTANCE in fuel units (a 1-hop = 1 unit, a deep 3-jump = 3). The
 * tank is a REAL capacity now (`tankCapacity` = the format's starting tank: voyage 8 = its
 * single-hop travel count, unending 12): it starts full and `buyFuel` can never stock past it.
 * Fuel is bought with run credits at a price that RISES with galaxy depth (`fuelUnitCost` — cheap
 * near home, dear in deep space), so "top the tank up here or spend the credits on gear and pay
 * deep-space prices later" is a real call at every depot — the choice the old flat-priced,
 * silently-auto-bought fuel never posed. `travel` still folds any shortfall into the jump bill at
 * the LOCAL price (ONE rule, so auto ≡ interactive holds by construction) — the UI surfaces that
 * surcharge on the Jump button itself, never silently. A lane whose bill beats the purse is LOCKED
 * (`canTravel`); a stop where EVERY lane is locked strands the run (`strand`). Zero rng — the
 * whole system is pure arithmetic on the run, so every seeded stream is untouched.
 *
 * GS-fuel-3 hangs BUILD hooks off that economy, all rebuilt from perk ids on resume (no save bump):
 * Ion Thrusters (`loadout.fuelEfficiency`) shave a unit off every jump's burn (min 1 — a jump is
 * never free), the Reserve Tank (`loadout.tankBonus`) raises capacity (+ arrives full via
 * `ShopItem.fuelBonus`, granted ONCE in `buy`), and great golf refuels the ship — `finishStop`
 * siphons one cell per holed eagle-or-better (capacity-clamped, never on a warped stop).
 *
 * GS-fuel-4 makes fuel DECIDE things, three ways: the lane's SKY prices the passage
 * (`effectFuelDelta` — solar-wind/comet tailwinds −1 ⛽, gravity-well/ion-storm headwinds +1 ⛽ —
 * so burn is decoupled from distance and lanes differ on a second axis), fuel-salvage EVENTS
 * refuel on arrival (`RouteEvent.fuelBonus`, granted in `travel`), and the SECTOR SCAN burns fuel
 * to redraw the lanes (`scanRoutes` — fuel's first non-jump use, and the anti-stranding lifeline).
 */

import { getFormat, startingFuelFor } from './formats';
import { effectFuelDelta, routeEffect } from './effects';
import type { Run, Route } from './run';

/** Fuel price at the home spaceport (credits per unit). */
export const FUEL_PRICE_BASE = 10;
/** Credits the unit price climbs per point of galaxy distance — deep-space fuel is dear. */
export const FUEL_PRICE_SLOPE = 2;
/** Ceiling on the unit price, however deep the run flies. */
export const FUEL_PRICE_MAX = 60;

/** The LOCAL fuel price (credits per unit) — one rule for the depot and travel's shortfall alike. */
export function fuelUnitCost(run: Pick<Run, 'distanceFromStart'>): number {
  return Math.min(FUEL_PRICE_MAX, FUEL_PRICE_BASE + FUEL_PRICE_SLOPE * Math.max(0, run.distanceFromStart));
}

/** The ship's tank capacity — the format's starting tank plus any Reserve Tank relic
 *  (GS-fuel-2/-3). `buyFuel` clamps to it; a legacy save resumed above it simply can't buy more
 *  until it burns back under. */
export function tankCapacity(run: Pick<Run, 'formatId' | 'loadout'>): number {
  return startingFuelFor(getFormat(run.formatId)) + Math.max(0, Math.floor(run.loadout.tankBonus ?? 0));
}

/** The fuel maths sees a route's jump AND (optionally) its event, whose sky prices the passage
 *  (GS-fuel-4). Event-less partials (tests, bare previews) price as clear skies. */
type FuelRoute = Pick<Route, 'distanceJump'> & Partial<Pick<Route, 'event'>>;

/** Fuel a route's jump burns: its distance, unit for unit — plus the sky's tail/headwind
 *  (GS-fuel-4: `effectFuelDelta`, so a lane's burn is no longer glued to its distance), less any
 *  Ion Thrusters efficiency (GS-fuel-3) — floored at 1 (a jump is never free). */
export function routeFuelCost(run: Pick<Run, 'loadout'>, route: FuelRoute): number {
  const jump = Math.max(0, route.distanceJump);
  if (jump === 0) return 0;
  const sky = effectFuelDelta(routeEffect(route.event));
  return Math.max(1, jump + sky - Math.max(0, Math.floor(run.loadout.fuelEfficiency ?? 0)));
}

/** Units missing from the tank for this jump (0 = the tank covers it). */
export function fuelShortfall(run: Run, route: FuelRoute): number {
  return Math.max(0, routeFuelCost(run, route) - Math.max(0, run.fuel));
}

/** Credits `travel` will spend on missing fuel for this jump at the LOCAL price (0 = tank covers it). */
export function travelRefuelCost(run: Run, route: FuelRoute): number {
  return fuelShortfall(run, route) * fuelUnitCost(run);
}

/** Can this lane be taken — is the tank + purse enough for its jump? */
export function canTravel(run: Run, route: FuelRoute): boolean {
  return run.credits >= travelRefuelCost(run, route);
}

// --- Sector scan (GS-fuel-4): burn fuel to redraw the three onward lanes ------
//
// Fuel's first use besides jumping: a poor offer (or an unpayable one — the scan doubles as an
// anti-stranding lifeline) can be re-rolled for fuel. The cost ESCALATES per scan at the same stop
// (1, 2, 3… — the shop/StarMart reroll precedent, so lane-fishing can't be spammed) and always
// leaves at least one cell in the tank (you can never scan yourself to a dry tank). Interactive-only
// by design, like the shop reroll — the headless auto-driver never scans, so every seeded stream is
// untouched; unlike the shop reroll the count lives ON the run (snapshotted), because the fuel it
// burnt does too.

/** Fuel the NEXT sector scan at this stop costs (escalates per scan: 1, 2, 3…). */
export function scanFuelCost(run: Pick<Run, 'routeScans'>): number {
  return 1 + Math.max(0, run.routeScans);
}

/** Can the ship scan for new routes — active run, and the tank keeps ≥1 cell after the burn? */
export function canScanRoutes(run: Run): boolean {
  return run.status === 'active' && run.fuel > scanFuelCost(run);
}

/** Burn fuel to redraw the onward lanes: `routeOptions` re-keys its stream off the bumped count. */
export function scanRoutes(run: Run): Run {
  if (!canScanRoutes(run)) throw new Error('scanRoutes: not enough fuel to scan');
  return { ...run, fuel: run.fuel - scanFuelCost(run), routeScans: run.routeScans + 1 };
}

/**
 * Buy fuel with run credits at the LOCAL price (the Pro Shop / journey-screen depot). Clamps to
 * what fits in the tank AND what the purse affords, so the buttons always do the sensible thing;
 * a no-op at 0 units.
 */
export function buyFuel(run: Run, units: number): Run {
  const price = fuelUnitCost(run);
  const n = Math.min(
    Math.max(0, Math.floor(units)),
    Math.max(0, tankCapacity(run) - run.fuel),
    Math.floor(run.credits / price),
  );
  if (n <= 0) return run;
  return { ...run, credits: run.credits - n * price, fuel: run.fuel + n };
}

/** Out of fuel AND credits with no travellable lane: the run ends STRANDED. Like a bank, the
 *  pocket change converts to shards (see cashOutShards) — it's a forced stop, not a punishment
 *  beat on top of one. */
export function strand(run: Run): Run {
  return { ...run, status: 'ended', endedReason: 'stranded' };
}
