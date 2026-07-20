/**
 * Round simulation — plays a hole end-to-end from a seed, headlessly.
 *
 * This is where clubs + shot + lie + scoring meet. Pure and deterministic: a fixed
 * seed plays the same hole the same way every time, so tests assert on outcomes and
 * any bug reproduces by its seed. The renderer will later animate exactly these shots.
 */

import { dist, pathLength, segDist, type FeatureKind, type Hole, type Vec } from './course/contract';
import { CLUBS, clubDist, suggestClub, type Club, type ClubStats } from './clubs';
import {
  combineShapeMods,
  dispersionProfile,
  isRoadLie,
  lieAt,
  lieInfo,
  reliedLie,
  driverPowerFloorRemap,
  playsLike,
  playWind,
  PEN_INFO,
  resolveShape,
  resolveShot,
  sprayAngleRms,
  sprayBands,
  SPRAY_GEOM,
  TUNABLES,
  type CaddyGuard,
  type ShapeMod,
  type ShotResult,
  type SprayGeom,
  type SprayShape,
} from './shot';
import type { HoleRecord } from './score';
import type { HoleStat } from './stats';
import type { Rng } from './rng';
import { usableBag } from './rpg/economy';
import { arcApex, ARC_FEEL, flightBlockedBy, flightCarryScale, flightClassOf, flightKnockdown, flightObstacles, flightProfileOf, flightScaleFor, rollFractionFor, type FlightClass, type FlightProfile } from './flight';
import { insideTent, tentFlightHit, tradeTents, TENT_BOUNCE_MIN, type TentHit, type TentEffectId, type TradeTent } from './tents';
import { wallFlightHit, wallRollBounce, wallReflect, WALL_BOUNCE_MIN, WALL_ROLL_RESTITUTION, type WallHit } from './walls';
import type { ShipWall } from './course/contract';
import { inScorch, meteorScorch, SCORCHABLE, SCORCH_LIE } from './scorch';
import { effectPatches, inPatch, PATCHABLE, PATCH_SPECS, type PatchKind } from './patches';
// The putting model now lives in putting.ts (GS-refactor-split). Import the pieces round uses
// internally, and re-export the whole putting surface so 'sim/round' stays the public import path
// (HOLE_OUT_RADIUS, PuttLog, onePutt, greenSlopeAt, DEFAULT_MANUAL_BAND, … all resolve unchanged).
import { HOLE_OUT_RADIUS, greenSlopeAt, puttOut } from './putting';
import type { PuttLog, PuttSkill } from './putting';
// The play-bounds / OB box geometry now lives in bounds.ts (GS-refactor-split). Import `inBounds`
// (round uses it internally) and re-export the whole surface so 'sim/round' stays the public path.
import { inBounds } from './bounds';
export { playBounds, inBounds, playBoundsCorners, obStakes } from './bounds';
export {
  HOLE_OUT_RADIUS,
  MANUAL_IDEAL_PACE,
  MANUAL_PACE_MAX,
  DEFAULT_MANUAL_BAND,
  DEFAULT_PUTT_RANGE,
  puttBandDistanceFactor,
  greenSlopeAt,
  puttBreakProfile,
  puttBreakYd,
  puttBreakBow,
  idealPuttAim,
  puttPathPreview,
  manualPutt,
  onePutt,
} from './putting';
export type { PuttLog, PuttSkill, PuttControl } from './putting';

/** Chip-in range (yards): a PW-or-shorter shot that comes to rest within this of the flag — but
 *  outside the auto hole-out radius — is a "makeable" chip the wedge caddy (Dr Chipinski) can drop. */
export const CHIPIN_RANGE = 8;
/** Max strokes over par before you pick up (max-score rule). Hole ends, score = par + this. */
export const MAX_OVER_PAR = 4;
/** Hard cap on full swings so a pathological hole can't loop forever. */
const MAX_FULL_SWINGS = 20;

export interface ShotLog {
  from: Vec;
  result: ShotResult;
  lieFrom: FeatureKind;
  lieTo: FeatureKind;
  club: Club;
  penalty?: string;
  /** Final rest position after the ball bounces & rolls out from `result.landing`. */
  rest: Vec;
  /** Roll-out distance (yards) from touchdown to rest. */
  roll: number;
  /** The CURVED run-out travel on a contoured green (GS-green-contour-2 round 2): course-space
   *  points from touchdown to exactly `rest`, present only when the roll actually bent (the curling
   *  integrator steered it along the local fall line). The play view walks it by arc length so the
   *  ball visibly breaks off a flank; absent ⇒ the classic straight run-out lerp. */
  rollPath?: Vec[];
  /** True if this shot holed the ball (chip-in / hole-in-one). */
  holed: boolean;
  /** True when a wedge caddy (Dr Chipinski) dropped this approach for a chip-in. Render flavour. */
  chipIn?: boolean;
  /** True if the ball was knocked out of the air by a tree (its `result.landing` is the clip
   *  point, lie = trees). Render-only flavour (a leaf puff); the trees lie is the real cost. */
  knockedDown?: boolean;
  /** Surface the ball first touched down on (BEFORE the bounce & roll-out). Drives the renderer's
   *  firmness-based bounce (firm → skip & run, soft → plop) and is honest HUD data. */
  landLie: FeatureKind;
  /** A hazard-skip ball (GS-proshop-2) skimmed across this penalty kind (water/lava/void) with NO
   *  stroke — render-only flavour ("skipped across!"). Set only when an immune ball saves a hazard. */
  skimmed?: string;
  /** Trade-camp tent ricochet (GS-tents / GS-tent-interactions): the ball clipped a tent roof. Carries
   *  the ball's impact point `at`, the tent CENTRE `c` (so the bubble anchors ON the tent, re-projected
   *  each frame — not on the ball), the tent's `effect` (which drives the bubble line + the interactive
   *  reaction), and the reflected roll direction `dir`. Non-penalty for every tent EXCEPT the marmot,
   *  whose bite resolves as a lost ball above. */
  tentHit?: { at: Vec; c: Vec; effect: TentEffectId; dir: Vec };
  /** Ship-corridor wall ricochet (GS-ship-walls): the FIRST bounce impact `at`, the final reflected `dir`,
   *  and how many walls were struck (`bounces`). The play view fires a metal clang + spark at each bounce;
   *  the flight/roll already follow the reflected result. */
  wallHit?: { at: Vec; dir: Vec; bounces: number };
  /** Ship-corridor PINBALL flight (GS-ship-pinball-flight): the STRAIGHT-segment flight polyline the ball
   *  actually flew — from the tee, cracking off each bulkhead, to its airborne landing. Present ONLY on a
   *  walled derelict shot that bounced (`bounces > 0`); the renderer draws these exact segments instead of
   *  the parkland fade/hook banana, so the graphic IS the physics (contract 5). Absent everywhere else. */
  flightPath?: Vec[];
}

/** Per-yard roll MULTIPLIER of each surface (its "run"): how far the ball travels per unit of roll
 *  energy while it's ON that surface. Slick ice/crystal run free (>1), fairway/tee run true (1),
 *  the green and rough drag, sand/woods kill it. The run-out integrates this surface-by-surface
 *  ALONG the path (`rollOut`), so a ball that lands in the rough and trickles onto the fairway keeps
 *  running, and one that runs off the fairway into rough brakes hard — "running into the fairway, or
 *  vice versa". (Was a single touchdown-surface multiply; now it's a friction integral.) */
const SURFACE_ROLL: Record<string, number> = {
  fairway: 1.0,
  tee: 1.0,
  green: 0.7,
  rough: 0.42, // thick stuff grabs the ball — a touch draggier than the old 0.5 now it's per-step
  waste: 0.7,
  bunker: 0.2,
  pot: 0.12, // deep pot — plugs almost dead
  fescue: 0.3, // thick native grass grabs harder than ordinary rough
  deeprough: 0.2, // deepest tangle — grabs the ball almost dead (GS-deep-rough)
  trees: 0.25, // knocked into the woods → drops nearly dead, barely trickles
  ice: 1.8,
  crystal: 1.1,
};
/** Firmness (bounciness) of a landing surface, 0..1 — fed to the renderer so a ball plops on soft
 *  ground (rough/sand) and skips/runs off firm ground (fairway/ice). Render-only feel; the roll
 *  distance itself comes from the friction integral. */
export const SURFACE_FIRMNESS: Record<string, number> = {
  fairway: 0.85,
  tee: 0.9,
  green: 0.65,
  rough: 0.3,
  waste: 0.6,
  bunker: 0.12,
  pot: 0.08,
  fescue: 0.22,
  deeprough: 0.14, // deep tangle — plops dead, no skip (GS-deep-rough)
  trees: 0.15,
  ice: 1.0,
  crystal: 0.95,
};
/** Firmness of a touchdown lie (default a mid value for unknown surfaces). */
export function surfaceFirmness(lie: FeatureKind): number {
  return SURFACE_FIRMNESS[lie] ?? 0.5;
}
/** Clamp on the run-out (yards): forward roll caps high, backspin checks modestly back. `MAX_ROLL` is
 *  the AUTO-AI's roll ALLOWANCE cap (how much run it plans for when clubbing); `ROLL_ENERGY_CAP` is the
 *  PHYSICS cap on the run a shot can actually release. The split (GS-carry-rollout-split) hands the long
 *  clubs a bigger run (a driver ~53yd off its reduced flight vs the old ~40), so the physics cap sits
 *  above the allowance so a full drive's run isn't clipped and its TOTAL is preserved. */
const MAX_ROLL = 42;
const ROLL_ENERGY_CAP = 60;
const MAX_CHECK = 18;
/** Short-grass touchdowns where the run-out HELPER LINE (`backspinRoll`, GS-carry-rollout-split) draws a
 *  forward run — the ball genuinely releases here (a drive onto the fairway, an approach onto the green),
 *  so the player reads land-and-run. Off these (rough/sand/trees) the run is small and a line into the
 *  hay is clutter, so no forward line is drawn (a backspin CHECK still draws anywhere). */
const RUNOUT_LIES: ReadonlySet<FeatureKind> = new Set(['fairway', 'green', 'tee']);
/** Per-yard run a hazard-skip ball (GS-proshop-2) keeps while skimming across an IMMUNE penalty —
 *  fast (like firm ice) so a floater/magma/void ball carries on to dry ground instead of dying in it. */
const SKIM_ROLL = 2.2;
/** How strongly a green's slope speeds a downhill roll / brakes an uphill one (GS-greens-3). The
 *  green run-per-yard is scaled by `1 + SLOPE_ROLL_K · (downhill·travelDir) · slopeMag`, floored so a
 *  steep uphill still creeps a hair. slopeMag rides in the green-slope vector's magnitude. */
const SLOPE_ROLL_K = 0.95;
/** How hard the green's SIDEWAYS slope steers a rolling ball (GS-green-contour-2 round 2): the
 *  curling integrator bends the travel direction by `ROLL_CURL_K · perp-slope` per yard rolled on
 *  the green. 0.06 lands a ~12yd roll across a 0.4 side slope ~1.5–2yd downhill of the straight
 *  line — the putt-break scale, so an approach and a putt read the same ground the same way. */
const ROLL_CURL_K = 0.06;
/** First-bounce landform response (GS-green-contour-3): a ball TOUCHING DOWN on a CONTOURED green
 *  feels the local slope at the bounce itself — landing into an upslope face kills the skip, landing
 *  on a downslope flank kicks it on, and the initial roll direction deflects toward the fall line.
 *  Contoured greens only (the curling integrator), so every lobe-less hole stays byte-identical. */
const LAND_KICK_K = 0.55; // roll-energy multiplier per unit of downhill-along-travel at touchdown
const LAND_KICK_MIN = 0.45; // an upslope face can kill at most this much of the skip
const LAND_KICK_MAX = 1.6; // a downslope flank can kick on at most this much
const LAND_DEFLECT_K = 0.5; // how hard the bounce redirects toward the fall line's perp component
/** Gravity CREEP (GS-green-contour-3): the ball cannot REST on a steep piece of the SCULPT — once
 *  the roll energy is spent it trickles on down the LOBE field (the mound/hollow relief; the plane
 *  is the green's uniform tilt, which a ball rests on exactly as before) until the sculpt flattens
 *  below CREEP_MIN, the green's edge catches it (a green-hit never creeps off the putting surface),
 *  or the creep budget is spent — so flanks visibly shed balls and hollows gather them, exactly what
 *  the topo rings say the ground does. */
const CREEP_MIN = 0.22; // lobe-field steepness below which the ball settles
const CREEP_STEP = 1.0; // yards per creep step (direction re-read each step, so it curls into hollows)
const CREEP_MAX = 5; // total creep budget (yards) — a settle, not a second roll-out

/** Carry of the pitching wedge — at/below this, clubs start adding backspin. */
export const BACKSPIN_CARRY = 106;

// The neutral roll fraction is now a per-FAMILY carry/roll SPLIT (GS-carry-rollout-split) — a club's
// number is its TOTAL and the ball flies `carryFrac` of it, releasing the rest (driver 80/20, hybrid
// 85/15, iron 90/10; wedge/putter land-and-hold). The model lives in `flight.ts` (`clubRollFraction` /
// `rollFractionFor` / `flightScaleFor`), keyed off the club's `FlightProfile`, and is re-exported here
// for the app + sim consumers.
export { clubRollFraction, rollFractionFor } from './flight';

/** True if a club's loft is in the wedge/short-iron range (PW and below) — the clubs whose roll a
 *  spin build can turn into a real BACKSPIN check. (No longer implies backspin on its own: baseline
 *  wedges just stop; see `clubRollFraction`.) */
export function hasBackspin(nominalCarry: number): boolean {
  return nominalCarry <= BACKSPIN_CARRY;
}

/**
 * The ball's reference run-out ENERGY (signed yards) — how far it would roll on a flat, true (mult 1,
 * fairway) surface. + runs forward, − is backspin checking it back. The family carry/roll SPLIT
 * (`rollFractionFor` on the club's `FlightProfile`, GS-carry-rollout-split) + a character's
 * `rollFracDelta` + a little variance. This is surface-FREE; the surface is applied along the path by
 * `rollOut`. Consumes EXACTLY one rng draw (same as the old `rollYards`), so a 0-delta shot keeps the
 * same rng budget and auto≡interactive holds. */
function rollPotential(profile: FlightProfile, nominalCarry: number, carry: number, rng: Rng, rollFracDelta = 0): number {
  const frac = rollFractionFor(profile, nominalCarry) + rollFracDelta;
  const raw = carry * frac * rng.range(0.85, 1.15);
  return Math.max(-MAX_CHECK, Math.min(ROLL_ENERGY_CAP, raw));
}

/**
 * Roll the ball out from `touchdown` along `dir`, integrating each surface's "run" (`SURFACE_ROLL`)
 * step-by-step until the reference energy `K` (signed, from `rollPotential`) is spent — so the SAME
 * energy carries far across slick fairway/ice and dies quickly in thick rough, and a roll that
 * CROSSES surfaces blends them (land rough → reach fairway → keep running, or vice versa). Hard
 * stops: it settles where it first trickles into a penalty (water/lava/void), or plugs in a bunker /
 * is caught by trees it ROLLS into (object interaction on the ground). Returns the SIGNED distance
 * actually travelled + the rest point. On a hole WITHOUT contour lobes the roll is a straight line
 * (`dist(rest,touchdown) === |roll|` — the classic roll-invariant, byte-for-byte the old integrator).
 * On a CONTOURED green (GS-green-contour-2 round 2) the run-out CURLS: each green step deflects the
 * travel direction toward the local fall line's perpendicular component (the same physics that breaks
 * a putt), `roll` becomes the ARC length, and the curved travel is returned as `path` so the play
 * view can draw the ball breaking off a flank — physics you can SEE. Pure, no rng — a deterministic
 * geometry pass after the energy draw, so auto≡interactive is untouched. */
export function rollOut(
  hole: Hole,
  touchdown: Vec,
  dir: Vec,
  K: number,
  tdLie: FeatureKind,
  immune?: ReadonlySet<string>,
  tents?: readonly TradeTent[],
  walls?: readonly ShipWall[],
): { roll: number; rest: Vec; path?: Vec[] } {
  const sign = K < 0 ? -1 : 1;
  const cap = sign < 0 ? MAX_CHECK : ROLL_ENERGY_CAP;
  const STEP = 1.5; // yards per integration step
  // Trade-camp tents (GS-tents): a ball ROLLING into a tent footprint stops against it (like sand /
  // the woods). A tent the ball is ALREADY on (a fresh aerial-bounce ricochet starts at the roof it
  // hit) doesn't re-stop it.
  const startTents = tents?.filter((t) => insideTent(t, touchdown));
  const hitsNewTent = (p: Vec): boolean =>
    !!tents && tents.some((t) => insideTent(t, p) && !startTents!.includes(t));
  // Green SLOPE (GS-greens-3): how much the roll runs downhill / checks uphill. The travel direction's
  // projection onto the green's DOWNHILL vector scales the green's run-per-yard, so a ball rolling
  // downhill runs out far and one rolling (or BACKSPINNING) uphill brakes hard and can't climb.
  // GS-green-contour-2: on a contoured green the LOCAL field (`greenSlopeAt`) is read per step.
  const slope = hole.greenSlope;
  const lobes = hole.greenContour;
  const curling = !!(lobes && lobes.length); // contoured hole → the curling integrator below
  // Ship-corridor PINBALL (GS-ship-pinball): a hole with collidable bulkheads routes through the
  // position-tracking integrator too, so a rolling ball REFLECTS off a wall and keeps rolling (wall
  // to wall) until its momentum bleeds away — never the old dead stop. Walls are derelict-only, so a
  // non-walled hole takes the byte-for-byte straight/curling paths exactly as before.
  const walled = !!(walls && walls.length);
  const slopeRun = (k: string, pMid: Vec, tx: number, ty: number): number => {
    if (k !== 'green' || (!slope && !curling)) return 1;
    const s = curling ? greenSlopeAt(pMid, slope, lobes) : slope!;
    const along = tx * s[0] + ty * s[1]; // + = travelling downhill, − = uphill
    return Math.max(0.32, 1 + SLOPE_ROLL_K * along);
  };
  if (!curling && !walled) {
    // The classic STRAIGHT integrator, byte-for-byte for every lobe-less hole (old saves, synthetic
    // test lanes, plane-only greens): walk fixed distances along one ray.
    const at = (d: number): Vec => [touchdown[0] + dir[0] * sign * d, touchdown[1] + dir[1] * sign * d];
    const tdx = dir[0] * sign;
    const tdy = dir[1] * sign;
    let budget = Math.abs(K);
    let dist = 0;
    let guard = 0;
    while (budget > 1e-3 && dist < cap && guard++ < 400) {
      const k = lieAt(hole, at(dist + STEP * 0.5)); // the surface we're rolling onto
      const kPen = lieInfo(k).penalty;
      // Hazard-skip balls (GS-proshop-2): an IMMUNE penalty is skimmed across (low friction) instead
      // of swallowing the ball. A non-immune penalty still stops it.
      if (kPen && !(immune && immune.has(kPen))) {
        dist += STEP; // trickled into a penalty hazard → settles there (+stroke downstream)
        break;
      }
      if (!kPen && k !== tdLie && (k === 'bunker' || k === 'trees')) {
        dist += STEP; // ran into sand / caught by the woods → stops
        break;
      }
      if (hitsNewTent(at(dist + STEP))) {
        dist += STEP; // trickled up against a trade-camp tent → stops there
        break;
      }
      // NB: no wall check here — a walled hole is routed to the pinball integrator below.
      const m = kPen ? SKIM_ROLL : (SURFACE_ROLL[k] ?? 0.6) * slopeRun(k, at(dist + STEP * 0.5), tdx, tdy);
      if (m <= 0) break;
      const need = STEP / m; // energy to cross STEP on this surface (rough costs more, ice less)
      if (need >= budget) {
        dist += budget * m; // spend the last of the energy
        break;
      }
      dist += STEP;
      budget -= need;
    }
    const roll = sign * Math.min(dist, cap);
    return { roll, rest: [touchdown[0] + dir[0] * roll, touchdown[1] + dir[1] * roll] };
  }
  // CURLING integrator (contoured holes): the ball carries a live travel direction that bends toward
  // the local downhill's perpendicular component while it's on the green — the run-out visibly breaks
  // off a mound's flank the way a putt does. Off-green steps never bend (the fairway stays honest),
  // so a roll that never touches the green is a straight line with the same step semantics.
  let px = touchdown[0];
  let py = touchdown[1];
  let tx = dir[0] * sign;
  let ty = dir[1] * sign;
  const path: Vec[] = [[px, py]];
  let bent = false;
  let budget = Math.abs(K);
  let dist = 0;
  let guard = 0;
  let blocked = false; // stopped against sand/woods/a tent/a penalty → the creep below never fires
  // GS-green-contour-3 — the FIRST BOUNCE reads the landform: a touchdown ON the green scales the
  // roll energy by the slope's along-travel component (into a face → the skip dies; onto a downslope
  // flank → it kicks on) and deflects the initial travel toward the fall line. Deterministic, zero
  // rng; only contoured holes reach this branch, so lobe-less holes are byte-identical.
  if (curling && tdLie === 'green') {
    const s0 = greenSlopeAt(touchdown, slope, lobes);
    const along0 = tx * s0[0] + ty * s0[1]; // + = landing travelling downhill
    budget *= Math.max(LAND_KICK_MIN, Math.min(LAND_KICK_MAX, 1 + LAND_KICK_K * along0));
    const perp0 = s0[0] * -ty + s0[1] * tx;
    if (Math.abs(perp0) > 1e-6) {
      const bend = LAND_DEFLECT_K * perp0;
      const nx = tx + -ty * bend;
      const ny = ty + tx * bend;
      const nl = Math.hypot(nx, ny) || 1;
      tx = nx / nl;
      ty = ny / nl;
      bent = true;
    }
  }
  while (budget > 1e-3 && dist < cap && guard++ < 400) {
    const stepLeft = Math.min(STEP, cap - dist);
    const mid: Vec = [px + tx * stepLeft * 0.5, py + ty * stepLeft * 0.5];
    const k = lieAt(hole, mid);
    const kPen = lieInfo(k).penalty;
    if (kPen && !(immune && immune.has(kPen))) {
      px += tx * stepLeft;
      py += ty * stepLeft;
      dist += stepLeft;
      path.push([px, py]);
      blocked = true;
      break;
    }
    if (!kPen && k !== tdLie && (k === 'bunker' || k === 'trees')) {
      px += tx * stepLeft;
      py += ty * stepLeft;
      dist += stepLeft;
      path.push([px, py]);
      blocked = true;
      break;
    }
    if (hitsNewTent([px + tx * stepLeft, py + ty * stepLeft])) {
      px += tx * stepLeft;
      py += ty * stepLeft;
      dist += stepLeft;
      path.push([px, py]);
      blocked = true;
      break;
    }
    const m = kPen ? SKIM_ROLL : (SURFACE_ROLL[k] ?? 0.6) * slopeRun(k, mid, tx, ty);
    // Ship-corridor PINBALL (GS-ship-pinball): a rolling ball that runs into a bulkhead REFLECTS off
    // it and keeps rolling — wall to wall, until friction + the per-bounce loss stop it. It advances
    // to the impact point (spending that leg's energy), loses a slice to the metal (restitution), then
    // carries on along the reflected line. A ball is only ever saved from going off the deck, so this
    // only ever RAISES the score (contract 4). Walls are derelict-only → non-walled holes never reach
    // this branch (routed to the straight integrator above), so they stay byte-for-byte identical.
    if (walls && m > 0) {
      const wb = wallRollBounce(walls, [px, py], [px + tx * stepLeft, py + ty * stepLeft]);
      if (wb) {
        const dw = Math.hypot(wb.point[0] - px, wb.point[1] - py);
        const need = dw / m;
        if (need >= budget) {
          // Not enough momentum to reach the wall this step — settle where the energy runs out.
          const adv = budget * m;
          px += tx * adv;
          py += ty * adv;
          dist += adv;
          path.push([px, py]);
          break;
        }
        budget -= need;
        dist += dw;
        // Land just shy of the wall so the next step doesn't immediately re-cross it, reflect the
        // travel back onto the deck, and bleed a slice of momentum to the metal bounce.
        const refl = wallReflect(wb.wall.normal, [tx, ty]);
        tx = refl[0];
        ty = refl[1];
        px = wb.point[0] + tx * 0.05;
        py = wb.point[1] + ty * 0.05;
        budget *= WALL_ROLL_RESTITUTION;
        path.push([px, py]);
        bent = true;
        continue;
      }
    }
    if (m <= 0) break;
    const need = stepLeft / m;
    const adv = need >= budget ? budget * m : stepLeft;
    px += tx * adv;
    py += ty * adv;
    dist += adv;
    path.push([px, py]);
    if (need >= budget) break;
    budget -= need;
    // Bend AFTER advancing (the struck line holds for the first step, like the putt's aim): on the
    // green, the fall line's sideways component steers the travel direction. ROLL_CURL_K per yard —
    // tuned to the putt-break scale, so an approach and a putt read the same ground the same way.
    // Only on a genuinely contoured green — a plane-only walled ship green stays honest (matches the
    // straight integrator), so routing it here for the pinball changes nothing but the wall bounce.
    if (curling && k === 'green') {
      const s = greenSlopeAt([px, py], slope, lobes);
      const perp = s[0] * -ty + s[1] * tx; // downhill's component along the travel's perp axis (−ty, tx)
      if (Math.abs(perp) > 1e-6) {
        const bend = ROLL_CURL_K * adv * perp;
        const nx = tx + -ty * bend;
        const ny = ty + tx * bend;
        const nl = Math.hypot(nx, ny) || 1;
        tx = nx / nl;
        ty = ny / nl;
        bent = true;
      }
    }
  }
  // GS-green-contour-3 — gravity CREEP: the ball cannot settle on a steep piece of the sculpt. Once
  // the energy is spent (never after an obstacle stop) it trickles on down the LOBE field — the
  // mound/hollow relief only, so a green's uniform plane tilt still holds a ball exactly as before —
  // re-reading the fall line each step so it curls into hollows and off flanks, until the sculpt
  // flattens, the green's edge catches it, or the small creep budget runs out. The creep is part of
  // the travel: it extends `path` and counts into the arc length. Deterministic, zero rng.
  if (!blocked && lieAt(hole, [px, py]) === 'green') {
    let creep = 0;
    let guard2 = 0;
    while (creep < CREEP_MAX - 1e-9 && dist < cap && guard2++ < 12) {
      const s = greenSlopeAt([px, py], undefined, lobes); // the SCULPT's gradient (no plane)
      const m = Math.hypot(s[0], s[1]);
      if (m < CREEP_MIN) break;
      const step = Math.min(CREEP_STEP, CREEP_MAX - creep, cap - dist);
      const nx = px + (s[0] / m) * step;
      const ny = py + (s[1] / m) * step;
      if (lieAt(hole, [nx, ny]) !== 'green') break; // the collar catches it — never creeps off the green
      if (hitsNewTent([nx, ny])) break;
      px = nx;
      py = ny;
      dist += step;
      creep += step;
      path.push([px, py]);
      bent = true;
    }
  }
  const roll = sign * Math.min(dist, cap);
  return { roll, rest: [px, py], path: bent ? path : undefined };
}

/**
 * A character's per-club shot modifiers (GS-18). Pure: a function of a club's nominal carry, so a
 * golfer can hook the long clubs but stripe the irons, or back-spin the wedges. Shared by the auto
 * sim (`executeShot`), the spray preview (`shotSpread`) and the interactive driver so all three
 * agree. Resolved from the loadout's `characterId` at the run boundary — see rpg/characters.ts.
 */
export interface ClubShotMods {
  /** Multiplies dispersion (lateral + distance) for this club. 1 = unchanged. */
  dispMult: number;
  /** Directional shot-shape bias (radians): + = fade (right), − = hook (left). 0 = straight. */
  angleBias: number;
  /** Added to the club's roll fraction: − = more backspin/check, + = more run-out. 0 = unchanged. */
  rollFracDelta: number;
  /** Per-club spray-zone skew (GS-dispersion-2): shifts duck-hook/hook/slice/shank probabilities for
   *  this club only — a golfer can hook the long sticks (more left zones) but stripe the irons. */
  shape?: ShapeMod;
}
/** A per-club shot-mod function (nominal carry → mods). */
export type ShotMods = (nominalCarry: number) => ClubShotMods;
/** The neutral shot mods (no character / no shape) — every field a no-op. */
export const NEUTRAL_SHOT_MODS: ClubShotMods = { dispMult: 1, angleBias: 0, rollFracDelta: 0 };

/** Carry below which a club counts as a WEDGE for distance-control (PW 106 and shorter). The
 *  distance-control upgrade raises the min carry of everything ABOVE this; the wedge window-tighten
 *  applies to clubs at/below it. */
export const WEDGE_CONTROL_CARRY = 110;

/** Loadout-level distance-control settings (GS-dispersion-2, points 5 & 6), resolved per club. */
export interface CarryControlOpts {
  /** Raise the lower carry clamp of NON-wedge clubs by this fraction (driver/woods/hybrids/irons). */
  minCarryBoost?: number;
  /** Tighten the carry window of WEDGES toward the mean by this fraction (0..1). */
  wedgeWindow?: number;
  /**
   * Per-club-FAMILY min-carry boost (GS-proshop-distance-items): raises the lower carry clamp of just
   * that family (driver/wood/hybrid/iron), on TOP of the family-agnostic `minCarryBoost`. Keyed by
   * `FlightClass`, so the Pro Shop can sell a Driver / Woods / Hybrids / Irons control item that only
   * tightens its own category. Absent = none.
   */
  minCarryBoostByClass?: Partial<Record<FlightClass, number>>;
}

/** Resolve the per-club carry-window tweaks from the loadout-level controls + the club's family/carry.
 *  The wedge branch keys off the (learned) carry so it matches the existing behaviour byte-for-byte;
 *  the per-family boost keys off the club's `FlightClass` so each Pro Shop control item only touches its
 *  own category. (The driver power-floor is a POWER remap, applied in `resolveShot`/`shotSpread`, not a
 *  carry-window clamp — so it lives outside this function.) */
export function carryControlFor(
  clubId: string,
  nominalCarry: number,
  opts: CarryControlOpts,
): { minCarryFracBoost?: number; carryWindowTighten?: number } {
  if (nominalCarry <= WEDGE_CONTROL_CARRY) {
    return opts.wedgeWindow ? { carryWindowTighten: opts.wedgeWindow } : {};
  }
  const cls = flightClassOf(clubId);
  const minBoost = (opts.minCarryBoost ?? 0) + (opts.minCarryBoostByClass?.[cls] ?? 0);
  return minBoost ? { minCarryFracBoost: minBoost } : {};
}

export interface PlayedHole {
  record: HoleRecord;
  stat: HoleStat;
  shots: ShotLog[];
  /** Putts on the green, in order; the last one is holed. */
  putts: PuttLog[];
  holed: boolean;
  /** True if the hole was picked up at the max-score cap (par + MAX_OVER_PAR). */
  pickedUp: boolean;
}

export interface PlayHoleOptions {
  bag?: readonly Club[];
  stats?: ClubStats;
  /** Carry multiplier from biome mods (e.g. low gravity). */
  carryMult?: number;
  /** Player dispersion multiplier (<1 = a forgiveness perk). */
  dispersionMult?: number;
  /** Driver Dan caddy (GS-caddy): when true the driver is usable from ANY lie at full stats; the
   *  default keeps the driver tee-only. (Replaces the removed Driver-on-Deck level system.) */
  driverAnywhere?: boolean;
  /** A named caddy's in-flight ball guard (GS-caddy): redirects a sampled miss tail onto the fairway. */
  guard?: CaddyGuard;
  /** Escape-specialist caddy lie relief (GS-mux), 0..1: softens a bad lie's carry/spray penalty. */
  lieRelief?: number;
  /** Wedge caddy chip-in chance (GS-caddy, Dr Chipinski): probability a PW-or-shorter shot resting
   *  within CHIPIN_RANGE of the flag drops for a chip-in. 0/undefined = off (no extra rng). */
  chipIn?: number;
  /** Character per-club shot modifiers (GS-18): shape bias, per-club dispersion, backspin. */
  shotMods?: ShotMods;
  /** Global spray-zone shape mod from upgrades (GS-dispersion-2): suppress/skew miss zones. */
  shapeMod?: ShapeMod;
  /** Distance-control: raise the min carry of driver/woods/irons by this fraction (point 5). */
  minCarryBoost?: number;
  /** Wedge distance-control: tighten the wedge carry window toward the mean (point 6). */
  wedgeWindow?: number;
  /** Per-family min-carry boost (GS-proshop-distance-items): Driver/Woods/Hybrids/Irons control items. */
  minCarryBoostByClass?: Partial<Record<FlightClass, number>>;
  /** Driver power-floor (GS-proshop-distance-items): the driver's power gesture floors at this fraction
   *  of full carry — the power range is [floor·full, full], so the driver can't be dialed short. */
  driverPowerFloor?: number;
  /** Suggestible Sam's confidence shape boost (GS-caddy): applied when the AI happens to club the
   *  same club Sam would suggest, so auto-finish/headless play matches the interactive driver. */
  confidence?: ShapeMod;
  /** Co-op SCRAMBLE (GS-scramble, boss stops): a partner golfer hits a second ball each full shot
   *  and the TEAM keeps the better one (one stroke). Absent ⇒ ordinary solo play (no extra rng). */
  scramble?: ScrambleOpts;
  /** Prognostic Parrot foresight (GS-caddy-parrot): 0..1 per-full-swing chance to FORESEE the shot —
   *  take a second swing of the SAME golfer (shotMods) and keep the better ball. The proc + partner
   *  draws fire ONLY when armed AND no team `scramble` is active, so undefined/0 is byte-for-byte. */
  previewScramble?: number;
  /** Left-handed mode (GS-lefty): mirror the player's lateral tendencies in world space. Passed to
   *  every executeShot; undefined/false is byte-for-byte right-handed. */
  lefty?: boolean;
  /** Reduced weather impact (GS-proshop-2, Wind-Cheater balls), 0..1. Undefined/0 = full wind. */
  windResist?: number;
  /** Increased backspin (GS-proshop-2, Spin-Milled), 0..1: more check / less run. Undefined/0 = base. */
  backspinBoost?: number;
  /** Hazard-skip balls (GS-proshop-2): penalty kinds the ball skims across with no stroke. Absent = base. */
  hazardImmune?: readonly string[];
  /** The legendary Rainbow Ball (GS-rainbow): the hole becomes RAINBOW ROAD — a ball resting off the
   *  fairway/bunker/green ribbon is OUT OF BOUNDS (stroke-and-distance). Absent/false = ordinary play,
   *  byte-for-byte unchanged. A property of the HOLE while the ball is in play, so a boss/partner on
   *  the same hole plays under the same rule (see match.ts). */
  rainbowRoad?: boolean;
  /** Trade-camp tents (GS-tents): the trade-market route arms a ring of collidable tents around the
   *  green. A property of the HOLE while in play (a boss/partner on the same hole obeys it too — see
   *  match.ts). Absent/false = ordinary play, byte-for-byte unchanged. */
  tradeTents?: boolean;
  /** Meteor-strike scorch marks (GS-meteor-scorch): the meteor-shower route chars craters into the
   *  turf — a ball resting on one plays a hot-but-wild 'scorch' lie. A property of the HOLE while in
   *  play (see match.ts). Absent/false = ordinary play, byte-for-byte unchanged. */
  meteorScorch?: boolean;
  /** Effect ground patches (GS-journey-fx-2, sim/patches.ts): the route's course effect scatters a
   *  seeded turf-patch family (comet stardust / frostfall ice / debris wreckage) — a ball at REST on
   *  one plays that family's lie. A property of the HOLE while in play, exactly like the scorch
   *  craters (see match.ts). Absent = ordinary play, byte-for-byte unchanged. */
  groundPatch?: PatchKind;
  /** Pin-hunting AI (GS-ai-attack): on a green-REACH shot, aim at the FLAG instead of the fat of the
   *  green — the higher-variance line a tight survival bar (or a sharpened boss) demands. Only the
   *  TARGET changes; club choice and physics run through the identical machinery, and lay-ups are
   *  untouched. Absent/false = the classic percentage play, byte-for-byte unchanged. */
  attackPin?: boolean;
  /** Putting skill for the auto putt-out (GS-ai-attack): the loadout's putter upgrades, so the
   *  headless sim sinks putts exactly like the interactive auto-putt (`puttSkillOf`) — putter perks
   *  used to work only interactively, a silent auto ≢ interactive drift. Absent/{} = the classic
   *  default stroke, byte-for-byte unchanged. */
  puttSkill?: PuttSkill;
}

/** Co-op scramble partner (GS-scramble): the partner's per-club shot SHAPE. The partner plays the
 *  same club/target as the team and uses the player's distance/dispersion, but their own swing shape —
 *  two balls a shot, the better is kept. */
export interface ScrambleOpts {
  partnerMods?: ShotMods;
}

/**
 * Pick the better of two resolved shots for a scramble (GS-scramble): a holed ball wins; else the one
 * that avoided a penalty; else the one resting closer to the flag. Pure. Returns the kept result and
 * whether it was the PARTNER's ball (for UI attribution). `b` is the partner's ball.
 */
export function pickBetterExec(
  a: ExecResult,
  b: ExecResult,
  flag: Vec,
): { ex: ExecResult; partnerKept: boolean } {
  const score = (e: ExecResult): [number, number, number] => [
    e.holed ? 0 : 1, // holed beats everything
    e.penaltyStrokes, // fewer penalties is better
    dist(e.ballAfter, flag), // then closer to the flag
  ];
  const sa = score(a);
  const sb = score(b);
  // Lexicographic compare; ties keep the player's ball (a).
  const bBetter = sb[0] < sa[0] || (sb[0] === sa[0] && (sb[1] < sa[1] || (sb[1] === sa[1] && sb[2] < sa[2])));
  return bBetter ? { ex: b, partnerKept: true } : { ex: a, partnerKept: false };
}

/** Pin location: the generated flag within the green (GS-6), or the centroid if absent. */
function pin(hole: Hole): Vec {
  return hole.pin ?? hole.green;
}

/** Find a legal drop after a no-replay penalty: walk back toward the prior spot. */
function dropPoint(hole: Hole, from: Vec, landing: Vec): Vec {
  for (let t = 0.85; t > 0; t -= 0.15) {
    const p: Vec = [from[0] + (landing[0] - from[0]) * t, from[1] + (landing[1] - from[1]) * t];
    if (!lieInfo(lieAt(hole, p)).penalty) return p;
  }
  return from;
}

/**
 * Where a hazard-skip ball (GS-proshop-2) settles when it stopped IN an immune hazard (it didn't quite
 * skim clear): walk back from `rest` toward the shot origin `from` in small steps and return the first
 * in-bounds, non-penalty point — the near bank it last crossed. No penalty stroke is applied; this only
 * picks the playable spot. Pure geometry. Falls back to `from` if no dry ground is found (a full carry
 * that came up entirely inside the water — you replay from where you were, still penalty-free).
 */
function skimToDry(hole: Hole, rest: Vec, from: Vec): Vec {
  const STEP = 2;
  const dx = from[0] - rest[0];
  const dy = from[1] - rest[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  for (let d = STEP; d <= len; d += STEP) {
    const p: Vec = [rest[0] + ux * d, rest[1] + uy * d];
    if (!lieInfo(lieAt(hole, p)).penalty && inBounds(hole, p)) return p;
  }
  return from;
}


/**
 * Play a single hole. Strategy: aim at the fat of the green, choose the club that just
 * reaches the plays-like distance, take recoveries from wherever the ball ends up, then
 * putt out to the flag.
 */
/** Net carry multiplier from a hole's biome mods (gravity), unless overridden. */
export function biomeCarryMult(hole: Hole): number {
  let m = 1;
  for (const mod of hole.biomeMods ?? []) {
    if (mod.kind === 'carry' && typeof mod.value === 'number') m *= mod.value;
  }
  return m;
}

/**
 * The pin-hunting target (GS-ai-attack): the FLAG, when some usable club can carry to it — the
 * green-reach "go" shot — else null (lay-ups keep the percentage play). Shared by the headless
 * `playHole` and the interactive auto driver (`autoDecision`) so both resolve the identical rule
 * (contract 2, auto ≡ interactive). Pure.
 */
export function attackTarget(
  hole: Hole,
  ball: Vec,
  usable: readonly Club[],
  carryMult: number,
  stats?: ClubStats,
): Vec | null {
  const flag = pin(hole);
  let reach = 0;
  for (const c of usable) reach = Math.max(reach, clubDist(c, stats) * carryMult);
  return dist(ball, flag) <= reach ? flag : null;
}

export function playHole(hole: Hole, rng: Rng, opts: PlayHoleOptions = {}): PlayedHole {
  const bag = opts.bag ?? CLUBS;
  // Aim at the FAT OF THE GREEN (centroid) — the percentage play. Aiming at an off-centre
  // flag spills shots off the green under max-wildness spray (more chips, worse scores AND
  // fairness); the centroid is the sane line. The FLAG (`flag`) is still the real hole: it's
  // where the ball holes out and putts to, so a back/tucked pin means a longer putt. Flag-
  // hunting is the interactive "attack" choice (the player's risk), not the auto sim's job.
  // (`layupTarget` aims at the green centroid internally — the percentage play.)
  const flag = pin(hole);
  const carryMult = opts.carryMult ?? biomeCarryMult(hole);

  let ball: Vec = [...hole.tee] as Vec;
  let lie: FeatureKind = 'tee';
  let strokes = 0;
  let penalties = 0;
  let putts = 0;
  let fairwayHit: boolean | null = hole.par >= 4 ? false : null;
  const shots: ShotLog[] = [];
  let holed = false;
  let pickedUp = false;
  const maxStrokes = hole.par + MAX_OVER_PAR;

  for (let swing = 0; swing < MAX_FULL_SWINGS; swing++) {
    // Hole-out / switch-to-putt keys off the FLAG (not the aim) so the headless sim and the
    // interactive driver agree on exactly when a hole ends.
    const remaining = dist(ball, flag);
    if (lie === 'green' || remaining <= HOLE_OUT_RADIUS) break;

    // AI decision: lay up to the penalty-free corridor when the line is blocked, carry a lava
    // river when it's reachable, and club to leave room for roll-out. The player (interactive
    // driver) makes this choice instead; both then run the SAME executeShot physics.
    // Club from the lie-appropriate bag: the driver is tee-only unless the Driver Dan caddy unlocks
    // it from any lie at full stats — same rule the interactive player obeys.
    const usable = usableBag(bag, lie, opts.driverAnywhere ?? false);
    // GS-ai-attack: when armed, a green-reach shot hunts the FLAG (variance the tight bar demands);
    // lay-ups and the default path keep the fat-of-green percentage play, byte-for-byte.
    const tgt =
      (opts.attackPin ? attackTarget(hole, ball, usable, carryMult, opts.stats) : null) ??
      layupTarget(hole, ball, lie, usable, carryMult);
    const club = aiClub(hole, ball, tgt, carryMult, usable, opts.stats);
    // Sam's confidence boost applies when the played club IS the one he'd suggest. Gate the
    // suggestion compute on Sam being owned (confidence present) so a non-Sam run is byte-for-byte
    // unchanged (no extra work, no shape change) — same rule the interactive driver uses.
    const suggestedClubId = opts.confidence
      ? suggestPlayerClub(hole, ball, lie, usable, { carryMult, dispersionMult: opts.dispersionMult }).id
      : undefined;

    const execOpts: ExecOpts = {
      carryMult,
      // GS-rough-gradient-rebalance: dial the power down for a short shot (chip/punch-out) instead of
      // over-swinging past the target. Full power (byte-identical) on any ordinary reach shot.
      power: autoShotPower(hole, ball, tgt, club, carryMult, usable, opts.stats),
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
      shotMods: opts.shotMods,
      shapeMod: opts.shapeMod,
      minCarryBoost: opts.minCarryBoost,
      wedgeWindow: opts.wedgeWindow,
      minCarryBoostByClass: opts.minCarryBoostByClass,
      driverPowerFloor: opts.driverPowerFloor,
      guard: opts.guard,
      lieRelief: opts.lieRelief,
      chipIn: opts.chipIn,
      confidence: opts.confidence,
      suggestedClubId,
      lefty: opts.lefty,
      windResist: opts.windResist,
      backspinBoost: opts.backspinBoost,
      hazardImmune: opts.hazardImmune,
      rainbowRoad: opts.rainbowRoad,
      tradeTents: opts.tradeTents,
      meteorScorch: opts.meteorScorch,
      groundPatch: opts.groundPatch,
    };
    // Scramble partner shot-mods for THIS swing, if any: a team-duel partner (GS-scramble) OR the
    // Prognostic Parrot foresight (GS-caddy-parrot) — a per-swing proc that takes a SECOND swing of the
    // player's OWN golfer (opts.shotMods) and keeps the better. The proc draw fires ONLY when the parrot
    // is armed AND no team scramble is active (`!opts.scramble` short-circuits before rng), so a normal
    // hole's stream is byte-for-byte unchanged; the interactive reducer draws the identical proc + shots.
    const parrotProc = !opts.scramble && !!opts.previewScramble && rng.bool(opts.previewScramble);
    const scramblePartnerMods: ShotMods | undefined = opts.scramble
      ? opts.scramble.partnerMods
      : parrotProc
      ? opts.shotMods
      : undefined;
    const playerEx: ExecResult = executeShot(hole, ball, lie, tgt, club, execOpts, rng);
    // Keep the better of the two balls — fewer penalties / closer to the flag. The partner draw fires
    // ONLY when a scramble (team or parrot) is armed for this swing, so an un-scrambled hole is unchanged.
    const ex: ExecResult =
      opts.scramble || parrotProc
        ? pickBetterExec(
            playerEx,
            executeShot(hole, ball, lie, tgt, club, { ...execOpts, shotMods: scramblePartnerMods }, rng),
            flag,
          ).ex
        : playerEx;
    strokes += 1 + ex.penaltyStrokes;
    penalties += ex.penaltyStrokes;

    // Tee-shot fairway result (par 4/5 only) — based on where the ball physically came
    // to rest, before any penalty drop.
    if (swing === 0 && hole.par >= 4) fairwayHit = ex.restLie === 'fairway';

    shots.push(ex.log);
    ball = ex.ballAfter;
    lie = ex.lieAfter;

    if (ex.holed) {
      holed = true;
      break;
    }
    // Max-score rule: at par + MAX_OVER_PAR strokes, pick up.
    if (strokes >= maxStrokes) {
      pickedUp = true;
      strokes = maxStrokes;
      break;
    }
    if (lie === 'green' || dist(ball, flag) <= HOLE_OUT_RADIUS) break;
  }

  // Putt out (unless already holed or picked up), within the remaining stroke budget.
  const puttLog: PuttLog[] = [];
  if (!holed && !pickedUp) {
    const remaining = dist(ball, flag);
    if (remaining <= HOLE_OUT_RADIUS) {
      holed = true;
    } else {
      const out = puttOut(rng, ball, flag, Math.max(1, maxStrokes - strokes), opts.puttSkill);
      putts = out.putts;
      puttLog.push(...out.log);
      strokes += putts;
      if (out.holed) holed = true;
      else {
        pickedUp = true;
        strokes = maxStrokes;
      }
    }
  }

  const record: HoleRecord = { par: hole.par, strokes };
  const stat: HoleStat = { par: hole.par, strokes, putts, penalties, fairwayHit };
  return { record, stat, shots, putts: puttLog, holed, pickedUp };
}

/** Play every hole of a course in order; returns per-hole results. */
export function playCourse(
  holes: Hole[],
  rng: Rng,
  opts: PlayHoleOptions = {},
): PlayedHole[] {
  return holes.map((h) => playHole(h, rng, opts));
}

export interface ExecOpts {
  carryMult: number;
  dispersionMult?: number;
  stats?: ClubStats;
  /** Character per-club shot modifiers (GS-18): shape bias, per-club dispersion, backspin. */
  shotMods?: ShotMods;
  /** Global spray-zone shape mod from upgrades (GS-dispersion-2). */
  shapeMod?: ShapeMod;
  /** Distance-control: raise min carry of driver/woods/irons (point 5). */
  minCarryBoost?: number;
  /** Wedge distance-control: tighten the wedge carry window (point 6). */
  wedgeWindow?: number;
  /** Per-family min-carry boost (GS-proshop-distance-items): Driver/Woods/Hybrids/Irons control items. */
  minCarryBoostByClass?: Partial<Record<FlightClass, number>>;
  /** Driver power-floor (GS-proshop-distance-items): the driver's power gesture floors at this fraction
   *  of full carry — the power range is [floor·full, full], so the driver can't be dialed short. */
  driverPowerFloor?: number;
  /** Named-caddy in-flight guard (GS-caddy): redirect a miss tail onto the fairway. */
  guard?: CaddyGuard;
  /** Escape-specialist caddy lie relief (GS-mux), 0..1: softens a bad lie's carry/spray penalty. */
  lieRelief?: number;
  /** Wedge-caddy chip-in chance (GS-caddy): drop a PW-or-shorter shot resting near the flag. */
  chipIn?: number;
  /** Shot POWER (GS-power): intended carry as a fraction of the club's full carry (1 = full swing,
   *  the default; <1 a partial shot; >1 overpowered). Undefined/1 → byte-for-byte unchanged. The auto
   *  sim always plays full swings (power 1); the interactive pull-to-power gesture dials it. */
  power?: number;
  /**
   * Suggestible Sam's "club confidence" shape boost (GS-caddy): a green-zone bonus ShapeMod applied
   * ONLY when the played club is the one Sam suggested (`suggestedClubId`) — commit to your caddy's
   * club and you swing freer. Undefined = no caddy → never applied (no shape change, byte-for-byte).
   */
  confidence?: ShapeMod;
  /** The club id Sam suggested for this position — confidence applies iff the played club matches. */
  suggestedClubId?: string;
  /** Left-handed mode (GS-lefty): mirror the lateral shot tendencies in world space. Threaded into
   *  resolveShot; undefined/false is byte-for-byte right-handed. */
  lefty?: boolean;
  /** Reduced weather impact (GS-proshop-2, Wind-Cheater): 0..1 — wind's carry/lateral scaled down.
   *  Threaded into both the upwind aim and resolveShot. Undefined/0 = full wind (byte-for-byte). */
  windResist?: number;
  /** Increased backspin (GS-proshop-2): 0..1 subtracted from the roll fraction (more check, less run).
   *  Folded into the SAME roll-energy rng draw. Undefined/0 = byte-for-byte unchanged. */
  backspinBoost?: number;
  /** Hazard-skip balls (GS-proshop-2): penalty kinds the ball skims across with no stroke (water/lava/
   *  void). Absent/empty = ordinary penalties (byte-for-byte). Pure geometry, no rng. */
  hazardImmune?: readonly string[];
  /** Rainbow Ball (GS-rainbow): off the fairway/bunker/green ribbon is OUT OF BOUNDS. Pure geometry on
   *  the rest lie (no rng); absent/false is byte-for-byte unchanged. */
  rainbowRoad?: boolean;
  /** Trade-camp tents (GS-tents): when true the hole has a ring of COLLIDABLE tents around the green
   *  (the trade-market route's signature) that a low/flat shot ricochets off. Pure geometry, no rng;
   *  absent/false is byte-for-byte unchanged. Resolved from the course effect at the call sites. */
  tradeTents?: boolean;
  /** Meteor-strike scorch marks (GS-meteor-scorch): when true the hole carries charred craters (the
   *  meteor-shower route's signature) — a ball at REST on one plays the hot-but-wild 'scorch' lie.
   *  Pure seeded geometry, no play rng; absent/false is byte-for-byte unchanged. Resolved from the
   *  course effect at the call sites. */
  meteorScorch?: boolean;
  /** Effect ground patches (GS-journey-fx-2): which seeded turf-patch family the hole carries
   *  (comet stardust / frostfall ice / debris wreckage) — a ball at REST on one plays that family's
   *  lie. Pure seeded geometry exactly like the scorch craters, no play rng; absent is byte-for-byte
   *  unchanged. Resolved from the course effect at the call sites. */
  groundPatch?: PatchKind;
}

export interface ExecResult {
  log: ShotLog;
  /** Where the ball ends up for the next shot (after any penalty drop). */
  ballAfter: Vec;
  lieAfter: FeatureKind;
  /** Lie where the ball physically came to rest (before a penalty drop). */
  restLie: FeatureKind;
  penaltyStrokes: number;
  holed: boolean;
}

/** How far OFF the green a miss can be and still count as "greenside" for a caddy-guard save (GS-caddy):
 *  added to the green's own radius, so a ball within this margin of the putting surface is dropped ON the
 *  green rather than recentred onto the fairway. */
const CADDY_GREENSIDE_MARGIN = 30;

/**
 * Which WORLD side of the fairway a point sits on (GS-caddy). Finds the nearest segment of the hole's
 * centreline and returns 'left'/'right' off that segment's local forward direction — the same
 * "+ = right of the shot line" convention `resolveShot` uses (right-perp of forward `f` is `(f.y, −f.x)`).
 * A guard's `side` is a fairway side, so this is what decides whether the Space Ducks (left) or the
 * Convict Sheep (right) cover a given miss — independent of where the player happened to aim.
 */
function fairwaySideOf(centreline: Vec[], p: Vec): 'left' | 'right' {
  if (centreline.length < 2) return 'right';
  let bestD = Infinity;
  let lateral = 0;
  for (let i = 0; i < centreline.length - 1; i++) {
    const a = centreline[i]!;
    const b = centreline[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen2 = dx * dx + dy * dy;
    // Project p onto the segment, clamped to its endpoints, to find the closest point on it.
    const t = segLen2 > 1e-9 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / segLen2)) : 0;
    const cx = a[0] + dx * t;
    const cy = a[1] + dy * t;
    const d = (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy);
    if (d < bestD) {
      bestD = d;
      // Signed side off this segment's forward direction: right-perp of (dx,dy) is (dy,-dx).
      lateral = (p[0] - cx) * dy + (p[1] - cy) * -dx;
    }
  }
  return lateral < 0 ? 'left' : 'right';
}

/** The point on the fairway SPINE (centreline) nearest `p` that actually sits on short grass (fairway or
 *  green) — the home a caddy-guard fairway save snaps a miss back to (GS-caddy-snapback). Skips centreline
 *  stations that fall in a rough gap / off a broken corridor, so the ball always lands on true fairway.
 *  null if the whole centreline is off the short grass (never in practice). Pure, zero rng. */
function nearestFairwayPoint(hole: Hole, p: Vec): Vec | null {
  let best: Vec | null = null;
  let bestD = Infinity;
  for (let i = 0; i <= 200; i++) {
    const q = pointAlong(hole.centreline, i / 200);
    const k = lieAt(hole, q);
    if (k !== 'fairway' && k !== 'green') continue;
    const d = dist(q, p);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/**
 * Resolve ONE full shot — wind-compensated aim, flight, bounce/roll-out, penalty, and
 * hole-out — given an explicit `target` and `club`. Shared by the AI (playHole) and the
 * interactive player driver so both obey identical physics. Pure: randomness from `rng`.
 */
export function executeShot(
  hole: Hole,
  from: Vec,
  lie: FeatureKind,
  target: Vec,
  club: Club,
  opts: ExecOpts,
  rng: Rng,
): ExecResult {
  const carryMult = opts.carryMult;
  const power = opts.power ?? 1;
  const shotBearing = bearingDeg(from, target);
  // Wind compensation scales by the POWERED carry (a soft shot drifts less in the wind) so the
  // upwind aim stays correct at any power. The driver power-floor remap is applied here too so the
  // aim matches the floored carry resolveShot will produce (a no-op at full power / non-driver /
  // no floor, so byte-for-byte unchanged). `resolveShot` below re-derives it from the RAW power, so
  // the floor is applied exactly once on each side.
  const aimPower = driverPowerFloorRemap(power, opts.driverPowerFloor, flightClassOf(club.id) === 'driver');
  // The wind-compensation carry is the FLIGHT carry (GS-carry-rollout-split) — the ball drifts while
  // it's in the air, so the aim reads the reduced flight, matching `resolveShot`'s scaled `intended`.
  const aimCarry = club.carry * flightScaleFor(flightProfileOf(club.id), club.carry) * carryMult * aimPower;
  const aim = aimWithWind(from, target, hole.wind, shotBearing, aimCarry, opts.windResist);
  // Character per-club shape: keyed by the club's nominal carry (a hooky driver, striped irons,
  // back-spun wedges). `dispMult === 1` passes the original dispersionMult through UNTOUCHED so a
  // characterless shot stays byte-for-byte (undefined stays undefined, never `undefined * 1`).
  const nominalCarry = clubDist(club, opts.stats);
  const mods = opts.shotMods ? opts.shotMods(nominalCarry) : NEUTRAL_SHOT_MODS;
  const dispersionMult =
    mods.dispMult === 1 ? opts.dispersionMult : (opts.dispersionMult ?? 1) * mods.dispMult;
  // Final spray SHAPE = the global upgrade mod (suppress duck-hooks, …) folded with this club's
  // character skew (a hooky driver) — PLUS Sam's confidence boost when this IS the club he suggested
  // (commit to the caddy's club → more great shots). A non-Sam shot leaves confidence undefined, so
  // the combine is a no-op and the shape is byte-for-byte unchanged. Carry-window by club category.
  const confident = opts.confidence && opts.suggestedClubId === club.id ? opts.confidence : undefined;
  const shape = resolveShape(combineShapeMods(opts.shapeMod, confident), mods.shape);
  const cw = carryControlFor(club.id, nominalCarry, opts);
  // Greenside save target (GS-caddy): when a guard fires on a miss NEAR the green, drop the ball ON the
  // green (partway from the green centre to the pin — always inside the star-shaped green) instead of
  // recentring on the fairway, the most useful save. "Near" = within the green's own radius + a greenside
  // margin. Built only when a guard is owned, so a guard-less shot passes `undefined` (no green teleport).
  let greenAim: ((p: Vec) => Vec | null) | undefined;
  if (opts.guard) {
    const gc = hole.green;
    const pin = pinOf(hole);
    const gpoly = hole.features.find((f) => f.kind === 'green')?.poly;
    let gR = 0;
    if (gpoly) for (const v of gpoly) gR = Math.max(gR, Math.hypot(v[0] - gc[0], v[1] - gc[1]));
    const reach = gR + CADDY_GREENSIDE_MARGIN;
    const target: Vec = [gc[0] + (pin[0] - gc[0]) * 0.6, gc[1] + (pin[1] - gc[1]) * 0.6];
    greenAim = (p: Vec) => (dist(p, gc) <= reach ? target : null);
  }
  const result = resolveShot({
    from,
    aim,
    club,
    lie,
    wind: hole.wind,
    carryMult,
    dispersionMult,
    angleBias: mods.angleBias,
    shape,
    minCarryFracBoost: cw.minCarryFracBoost,
    carryWindowTighten: cw.carryWindowTighten,
    driverPowerFloor: opts.driverPowerFloor,
    guard: opts.guard,
    // Caddy-guard fairway test (GS-caddy): closes the guard over THIS hole so resolveShot stays
    // course-agnostic. Off the fairway = any lie that isn't fairway or green (rough/sand/void/water/…).
    // Built only when a guard is owned, so a guard-less shot passes `undefined` → no redirect, no draw.
    offFairway: opts.guard ? (p: Vec) => { const k = lieAt(hole, p); return k !== 'fairway' && k !== 'green'; } : undefined,
    // Which side of the FAIRWAY the miss is on (GS-caddy) — classified off the hole's centreline, not the
    // shot bearing, so the guard covers its true world side (fixes ducks firing on right-of-fairway misses
    // aimed across from the rough). Built only with a guard, so a guard-less shot is byte-for-byte unchanged.
    fairwaySide: opts.guard ? (p: Vec) => fairwaySideOf(hole.centreline, p) : undefined,
    // Caddy-guard fairway-spine snap (GS-caddy-snapback): bring a saved miss all the way home to the
    // fairway, however far offline it went. Built only with a guard → a guard-less shot is byte-for-byte.
    fairwaySnap: opts.guard ? (p: Vec) => nearestFairwayPoint(hole, p) : undefined,
    greenAim,
    lieRelief: opts.lieRelief,
    lefty: opts.lefty,
    windResist: opts.windResist,
    power: opts.power,
    stats: opts.stats,
    rng,
  });

  // Aerial obstacle (tree) knockdown — the "affected by hazards based on arc height" half of the
  // ask. A low ball that crosses a treeline below its canopy is knocked out of the air into the
  // woods (a tough non-penalty lie); a high one drops over. Pure geometry on the SAME curved path
  // the renderer draws, off the already-resolved endpoints — no rng, so auto≡interactive holds.
  const flight = flightProfileOf(club.id);
  const kd = flightKnockdown(hole, from, result.landing, result.shotBearing, result.carry, nominalCarry, flight);
  let knockedDown = false;
  if (kd) {
    knockedDown = true;
    result.landing = kd.point;
    result.carry = kd.carry;
    result.apex = arcApex(kd.carry, nominalCarry, ARC_FEEL, flight.peakMult);
  }

  // Trade-camp tent ricochet (GS-tents): if NOT already knocked into the woods, a low/flat shot whose
  // curved flight crosses a tent roof (around the green) is knocked down AT the tent and bounces off
  // along the reflected direction — a lofted wedge sails over and lands clean. Pure geometry on the
  // SAME curved path the renderer draws (no rng), so auto≡interactive holds; tents are built only when
  // the trade-market route armed them, so a base shot never enters this branch (byte-for-byte stable).
  // Tents live on ONE stamped hole of a trade-market stop (GS-tent-interactions): armed only when the
  // effect is on (`opts.tradeTents`) AND this is that hole (`hole.tents`). Every other hole is unchanged.
  const tents = opts.tradeTents && hole.tents ? tradeTents(hole) : undefined;
  let tentHit: TentHit | null = null;
  if (tents && !knockedDown) {
    tentHit = tentFlightHit(tents, from, result.landing, result.shotBearing, result.carry, nominalCarry, flight);
    if (tentHit) {
      result.landing = tentHit.point;
      result.carry = tentHit.carry;
      result.apex = arcApex(tentHit.carry, nominalCarry, ARC_FEEL, flight.peakMult);
    }
  }
  // The MARMOT tent (GS-tent-interactions) is the one exception to "tents are non-penalty": the marmot
  // pockets your ball and vanishes, so a marmot bonk is a LOST BALL (stroke-and-distance), resolved in
  // the shared physics so the headless sim and the interactive driver score it identically. The ball
  // stops dead at the tent (no ricochet run-out) and replays from the shot's origin below.
  const tentLost = tentHit?.tent.effect === 'marmot';

  // Caddy-GUARD redirect on a walled corridor (GS-ship-wall-caddy): a Space Duck laser / Convict Sheep
  // boomerang recentres an off-deck miss onto the fairway LINE — but that "line" is the original aim
  // BEARING, which on a BENDING ship corridor runs straight off into open space while the hull deck bends
  // away (94% of the caddy-save losses on walled holes were the redirected landing itself sitting in
  // space). The guard is meant to SAVE the ball, so when its recentred landing is off the deck, snap it to
  // the corridor's DECK SPINE (the nearest on-deck centreline point to the ORIGINAL miss's progress) — a
  // guaranteed-safe fairway save at the right distance down the hole. A greenside save (landing already on
  // the green/deck) is left untouched. Then the flight-time wall bounce is SKIPPED for a redirected shot
  // (below): the landing is already safe, and bouncing the fictional curve-back arc off a wall used to
  // re-intercept ~81% of caddy saves and fling ~7% back into space. Derelict-only + guard-only, so every
  // other world (and every guard-less shot) is byte-for-byte identical.
  if (result.redirect && hole.walls && hole.walls.length && isLostToSpace(lieAt(hole, result.landing))) {
    const safe = nearestSolidCentre(hole, result.redirect.originalLanding);
    if (safe) {
      result.landing = safe;
      result.carry = dist(from, safe);
      result.apex = arcApex(result.carry, nominalCarry, ARC_FEEL, flight.peakMult);
    }
  }

  // Ship-corridor wall ricochet (GS-ship-walls): a low, flat ball heading off the derelict's hull deck
  // toward open space bounces back off a metal corridor wall (up to two bounces — hit two walls, bounce
  // twice). Same curved path the renderer draws (no rng), gated on `hole.walls` (the derelict only), so
  // auto ≡ interactive holds and every other world is byte-for-byte unchanged. A wall bounce is skipped
  // if the ball was already knocked into the woods or bounced off a tent (one aerial deflection wins), or
  // when a caddy GUARD redirected the shot (handled just above — the guard's placement is final).
  let wallHit: WallHit | null = null;
  let shipPath: Vec[] | undefined;
  let shipRollDir: Vec | undefined;
  if (hole.walls && hole.walls.length && !knockedDown && !tentHit && !result.redirect) {
    // Ship-corridor PINBALL flight (GS-ship-pinball-flight): the ball flies a STRAIGHT line and CRACKS off
    // each bulkhead, caroming down the metal hallway to its airborne landing — a spaceship corridor, not the
    // parkland fade/hook banana that used to curve into the wall then die at it. The FULL carry is spent
    // along the reflected polyline (the ball flew the whole way, it just bounced), so `result.carry`/`apex`
    // are unchanged — only the LANDING moves to the polyline end. Keys off the DRAWN DECK edge, so it catches
    // the hard-corner / chain-end escapes the old per-segment collision missed. Pure geometry, zero rng.
    // ALWAYS take the straight-flight path on the ship (even a clean 0-bounce drive), so a corridor shot
    // NEVER curves — a clean drive is a straight line, a wall-clipper cracks off the bulkheads. The landing
    // is unchanged on a clean flight (path ends exactly on it) and only moves to the polyline end on a bounce.
    const sf = shipFlightPath(hole, from, result.landing);
    result.landing = sf.landing;
    shipPath = sf.path;
    shipRollDir = sf.dir;
    if (sf.bounces > 0) wallHit = sf.firstHit;
  }

  // Touchdown → bounce & roll out (unless it plugs in a penalty surface). The run-out integrates
  // the surfaces it crosses: the ball keeps the same roll ENERGY but spends it fast in rough and
  // slowly on fairway/ice, so landing in the rough and trickling onto the fairway (or running off
  // the fairway into rough) reads physically, and it settles where it first finds water/sand/woods.
  // Hazard-skip balls (GS-proshop-2): the penalty kinds this ball skims across with no stroke. Built
  // only when an immunity item is owned, so a base loadout passes `undefined` and the roll/penalty
  // paths below are byte-for-byte the old ones.
  const immune = opts.hazardImmune && opts.hazardImmune.length ? new Set(opts.hazardImmune) : undefined;
  const touchdown = result.landing;
  const tdLie = lieAt(hole, touchdown);
  const tdPen = lieInfo(tdLie).penalty;
  let rest: Vec = touchdown;
  let roll = 0;
  let rollPath: Vec[] | undefined;
  // Roll out unless it plugged in a non-immune penalty. An immune-hazard touchdown still rolls — it
  // skims across toward dry ground (rollOut treats the immune surface as a fast skim).
  if (!tdPen || (immune && immune.has(tdPen))) {
    // Increased backspin (GS-proshop-2): subtract from the roll fraction (more check, less run) — same
    // single rng draw, so backspinBoost 0/undefined is byte-for-byte the old energy.
    const energy = rollPotential(flight, nominalCarry, result.carry, rng, mods.rollFracDelta - (opts.backspinBoost ?? 0));
    // Tent ricochet (GS-tents): the run-out goes along the REFLECTED direction with a lively floor of
    // energy (a real bounce, not a dead drop). Otherwise the roll runs along the flight direction. The
    // rng draw above is unchanged either way, so the stream is stable. tents are passed so a roll that
    // trickles into a DIFFERENT tent stops against it (a straight stop → the roll-invariant holds).
    let rollDir: Vec;
    let rollK = energy;
    if (tentHit) {
      rollDir = tentHit.dir;
      // The marmot keeps the ball — it stops dead at the tent (no ricochet). Every other tent bounces
      // forward off the roof with a lively energy floor.
      rollK = tentLost ? 0 : Math.max(Math.abs(energy), TENT_BOUNCE_MIN);
    } else if (shipRollDir) {
      // Pinball flight (GS-ship-pinball-flight): the ball landed still travelling along the final flight
      // line, so the run-out carries ON along it. A shot that actually CRACKED off a bulkhead keeps a lively
      // metal-bounce energy floor (it skips off the deck, doesn't die); a CLEAN corridor drive (no bounce)
      // keeps its exact ordinary roll energy — so a non-bouncing ship shot is byte-for-byte the old outcome.
      rollDir = shipRollDir;
      rollK = wallHit ? Math.max(Math.abs(energy), WALL_BOUNCE_MIN) : energy;
    } else {
      const dx = touchdown[0] - from[0];
      const dy = touchdown[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      rollDir = [dx / len, dy / len];
    }
    if (rollK !== 0) {
      const out = rollOut(hole, touchdown, rollDir, rollK, tdLie, immune, tents, hole.walls);
      roll = out.roll;
      rest = out.rest;
      rollPath = out.path;
    }
  }

  // Ship-corridor wall-SAVE backstop (GS-ship-corridor-contain): a walled corridor's impassable bulkheads
  // must never let a ball be LOST TO SPACE sideways off a solid stretch of hull deck. If the ball still
  // ends up off the hull at a station where the corridor is SOLID (something the ricochet maths + pinball
  // roll-out couldn't catch on the hard-cornered layout), pull it back onto the nearest deck — the ball
  // clangs off the bulkhead and stays inside. A rest in a genuine torn-hull GAP is a sanctioned forward
  // carry and is left lost. Pure geometry, zero rng, derelict-only (byte-for-byte elsewhere), and it only
  // ever moves a ball ONTO the deck, so Stableford can only rise (contract 4).
  if (hole.walls && hole.walls.length) {
    const saved = containToDeck(hole, rest);
    if (saved) {
      // Extend the run-out path so the render walks the ball back onto the deck instead of snapping.
      rollPath = rollPath && rollPath.length ? [...rollPath, saved] : [touchdown, saved];
      roll += dist(rest, saved);
      rest = saved;
    }
  }

  // Caddy-GUARD save is STICKY on a walled hole (GS-ship-wall-caddy): the guard fires on EVERY qualifying
  // miss with no chance roll — it PROMISES a save onto the short grass. On the derelict, the placed ball
  // can still roll off the deck spine into a torn-hull star-gap (`containToDeck` above leaves a gap-station
  // rest lost, as it should for an ordinary shot). But a caddy-placed ball rolling into the abyss breaks
  // the guarantee, so seat a still-lost redirected shot back on its on-deck placement. Guard-only +
  // walled-only + only ever moves a ball ONTO the deck (Stableford can only rise) → byte-identical
  // everywhere else.
  if (result.redirect && hole.walls && hole.walls.length && isLostToSpace(lieAt(hole, rest))) {
    rollPath = rollPath && rollPath.length ? [...rollPath, result.landing] : [touchdown, result.landing];
    roll += dist(rest, result.landing);
    rest = result.landing;
  }

  let restLie = lieAt(hole, rest);
  // Meteor-strike scorch (GS-meteor-scorch): a ball at REST on a charred crater plays the 'scorch'
  // lie next shot — hot off the baked crust, but wild. The marks are a pure function of the hole
  // (own seeded stream — ZERO play-rng), built only when the meteor-shower route armed them, so a
  // base shot never enters this branch (byte-for-byte stable). Soft-turf lies only: a green/tee/
  // sand/penalty rest keeps its own (harsher or rule-bearing) read. Skipped under the Rainbow Ball,
  // whose own off-road rule reads the UNCONVERTED rest lie (a scorched fairway is still the road).
  if (opts.meteorScorch && !opts.rainbowRoad && SCORCHABLE.has(restLie) && inScorch(meteorScorch(hole), rest)) {
    restLie = SCORCH_LIE;
  }
  // Effect ground patches (GS-journey-fx-2): the same rest-lie conversion for the generalised patch
  // families — comet stardust (a bonus lie), frostfall ice, debris wreckage. Pure seeded geometry on
  // a private stream (ZERO play-rng), built only when the owning route armed it, so a base shot never
  // enters this branch. Soft-turf rests only; skipped under the Rainbow Ball for the same road rule.
  if (opts.groundPatch && !opts.rainbowRoad && PATCHABLE.has(restLie) && inPatch(effectPatches(hole, opts.groundPatch), rest)) {
    restLie = PATCH_SPECS[opts.groundPatch].lie as FeatureKind;
  }
  const li = lieInfo(restLie);
  const log: ShotLog = { from, result, lieFrom: lie, lieTo: restLie, club, rest, roll, holed: false, knockedDown, landLie: tdLie };
  if (rollPath) log.rollPath = rollPath;
  // Surface the tent CENTRE + effect (not just the ball's roof-contact point) so the renderer can anchor
  // the speech bubble ON the tent (GS-tent-interactions) and the interactive driver can fire the effect.
  if (tentHit) log.tentHit = { at: tentHit.point, c: tentHit.tent.c, effect: tentHit.tent.effect, dir: tentHit.dir };
  if (wallHit) log.wallHit = { at: wallHit.point, dir: wallHit.dir, bounces: wallHit.bounces };
  if (shipPath) log.flightPath = shipPath;

  let ballAfter: Vec = rest;
  let lieAfter: FeatureKind = restLie;
  let penaltyStrokes = 0;
  let holed = false;
  if (tentLost) {
    // Marmot tent (GS-tent-interactions): the ball is gone — lost ball, stroke-and-distance from origin.
    penaltyStrokes = PEN_INFO.lost.strokes;
    log.penalty = 'lost';
    ballAfter = from;
    lieAfter = lie;
  } else if (opts.rainbowRoad && !isRoadLie(restLie)) {
    // Rainbow Ball (GS-rainbow): the hole is RAINBOW ROAD. A ball resting off the fairway/bunker/green
    // ribbon has fallen off into the void of space — out of bounds, stroke-and-distance (replay from
    // the shot's origin). This subsumes ordinary penalties/rough/OOB for the off-road case, and reads
    // as 'ob' (the OB stakes/vignette + "Out of bounds"). Pure geometry on the rest lie — no rng — so a
    // base loadout (rainbowRoad absent) never enters this branch and is byte-for-byte unchanged. A
    // green rest stays on the road, so holing out is unaffected (handled in the in-bounds branch below).
    penaltyStrokes = PEN_INFO.ob.strokes;
    log.penalty = 'ob';
    ballAfter = from;
    lieAfter = lie;
  } else if (li.penalty && immune && immune.has(li.penalty)) {
    // Hazard-skip ball (GS-proshop-2): it stopped in an immune hazard (didn't quite clear it) → play on
    // from the nearest dry ground back toward the shot origin, with NO penalty stroke. Pure geometry.
    const dry = skimToDry(hole, rest, from);
    ballAfter = dry;
    lieAfter = lieAt(hole, dry);
    log.skimmed = li.penalty;
    log.lieTo = lieAfter; // the card reads the dry finish, not "in the water"
  } else if (li.penalty) {
    const pen = PEN_INFO[li.penalty];
    penaltyStrokes = pen.strokes;
    log.penalty = li.penalty;
    if (pen.replay) {
      ballAfter = from;
      lieAfter = lie;
    } else {
      const drop = dropPoint(hole, from, rest);
      ballAfter = drop;
      lieAfter = lieAt(hole, drop);
    }
  } else if (!inBounds(hole, rest)) {
    // Out of bounds: stroke-and-distance — +1 penalty and replay from the shot's origin.
    penaltyStrokes = PEN_INFO.ob.strokes;
    log.penalty = 'ob';
    ballAfter = from;
    lieAfter = lie;
  } else if (dist(rest, pin(hole)) <= HOLE_OUT_RADIUS) {
    log.holed = true;
    holed = true;
  } else if (
    // Wedge-caddy chip-in (GS-caddy, Dr Chipinski): a PW-or-shorter shot resting in the makeable
    // chip range gets a `chipIn` chance to drop. Gated behind `opts.chipIn` (caddy owned) AND the
    // proximity + wedge checks, so a base loadout never reaches the rng draw → byte-for-byte stable.
    opts.chipIn &&
    nominalCarry <= WEDGE_CONTROL_CARRY &&
    dist(rest, pin(hole)) <= CHIPIN_RANGE &&
    rng.float() < opts.chipIn
  ) {
    log.holed = true;
    log.chipIn = true;
    holed = true;
    ballAfter = pin(hole);
    lieAfter = 'green';
  }

  return { log, ballAfter, lieAfter, restLie, penaltyStrokes, holed };
}

/** Deterministic spread of a contemplated shot — the mean + std-devs `resolveShot`
 *  samples from, computed WITHOUT consuming rng. Lets the UI draw an honest "where can
 *  it go" spray cone before the player commits. Pure. */
export interface ShotSpread {
  /** Ball position (course space). */
  origin: Vec;
  /** Shot bearing toward the target (deg, cw from up). */
  bearing: number;
  /** Mean carry (yards), after lie, biome and wind — the cone's centre reach. */
  expectedCarry: number;
  /** Nearest the ball may come up (yards) — the shot can fall well short. */
  carryLow: number;
  /** Furthest the ball may carry (yards). */
  carryHigh: number;
  /** Lateral std-dev (yards) at landing — the render scales this by its tier z-values. */
  lateralSd: number;
  /** Along-axis (distance) std-dev (yards). */
  carrySd: number;
  /**
   * Effective angular spray σ (radians, RMS) — the spread the cone "reads as", matching the sampled
   * scatter so the dispersion preview stays honest under any shape.
   */
  angleSd: number;
  /** Base angular spread σ0 (radians) the bands scale from — the renderer turns this + `shape`
   *  into the drawn zone wedges (`sprayBands`). */
  angleSpread: number;
  /** The asymmetric spray-zone shape (GS-dispersion-2) — the renderer draws each zone's band &
   *  % straight from this, so the graphic IS the landing distribution. */
  shape: SprayShape;
  /** Left-handed mode (GS-lefty): the renderer mirrors the cone's band angles about the bearing so
   *  it reads as the lefty's (world-flipped) landing distribution — matching resolveShot's sign
   *  flip. The bias is already mirrored into `bearing`. Undefined/false = right-handed (no mirror). */
  lefty?: boolean;
  /** The club's nominal (full) carry (yards) — feeds the loft/apex model so the blocked-by-trees
   *  overlay (`sprayBlocking`) walks the SAME flight the sim resolves via `flightKnockdown`. */
  nominalCarry: number;
  /** The club family's flight profile (GS-flight-3) — the overlay probes the SAME family-shaped arc
   *  the sim resolves, so switching from driver to 7-iron visibly changes what reads blocked. */
  flight: FlightProfile;
}

export function shotSpread(
  hole: Hole,
  from: Vec,
  lie: FeatureKind,
  target: Vec,
  club: Club,
  opts: {
    carryMult?: number;
    dispersionMult?: number;
    stats?: ClubStats;
    shotMods?: ShotMods;
    shapeMod?: ShapeMod;
    minCarryBoost?: number;
    wedgeWindow?: number;
    /** Per-family min-carry boost (GS-proshop-distance-items): Driver/Woods/Hybrids/Irons control items. */
    minCarryBoostByClass?: Partial<Record<FlightClass, number>>;
    /** Driver power-floor (GS-proshop-distance-items): floors the driver's power gesture so the previewed
     *  cone reads the raised min carry at low power (the driver can't be dialed short). */
    driverPowerFloor?: number;
    /** Sam's confidence shape boost — folded into the cone iff `club.id === suggestedClubId`. */
    confidence?: ShapeMod;
    suggestedClubId?: string;
    /** Escape-specialist caddy lie relief (GS-mux): softens a bad lie so the cone reads true. */
    lieRelief?: number;
    /** Left-handed mode (GS-lefty): mirror the cone (and the character bias) about the bearing. */
    lefty?: boolean;
    /** Shot POWER (GS-power): intended carry as a fraction of full (1 = full swing). Scales the
     *  whole carry window so the previewed cone GROWS with power — the on-screen "draw to power up". */
    power?: number;
    /** Reduced weather impact (GS-proshop-2): scales the previewed headwind carry effect down, so the
     *  cone reads true with Wind-Cheater gear. Undefined/0 = full wind. */
    windResist?: number;
  } = {},
): ShotSpread {
  const carryMult = opts.carryMult ?? biomeCarryMult(hole);
  // The driver power-floor (GS-proshop-distance-items) remaps the gesture into [floor, 1] so the previewed
  // cone reads the raised min carry at low power — identical to resolveShot, so the cone stays true.
  const power = driverPowerFloorRemap(opts.power ?? 1, opts.driverPowerFloor, flightClassOf(club.id) === 'driver');
  const li = lieInfo(lie);
  const relief = reliedLie(li, opts.lieRelief);
  const shotBearing = bearingDeg(from, target);
  const nominal = clubDist(club, opts.stats);
  // Carry/roll SPLIT (GS-carry-rollout-split): the previewed cone reads the reduced FLIGHT landing
  // (`flightScaleFor` — the run-out line draws the run past it), matching `resolveShot` exactly so the
  // cone stays honest. Wedge/putter → 1 (byte-for-byte).
  const intended = nominal * flightScaleFor(flightProfileOf(club.id), nominal) * relief.carryMult * carryMult * power;
  const w = hole.wind ? playWind(hole.wind, shotBearing) : { along: 0, cross: 0 };
  // The character's per-club shape (GS-18): its dispersion folds into the cone's width and its
  // shot-shape bias ROTATES the cone's centre line, so a fade/hook is visible in the preview and
  // the player can aim to compensate — wind reads true, and so does shape.
  const mods = opts.shotMods ? opts.shotMods(nominal) : NEUTRAL_SHOT_MODS;
  const dispMult = relief.dispersionMult * (opts.dispersionMult ?? 1) * mods.dispMult;
  const prof = dispersionProfile(nominal);
  const along = w.along * TUNABLES.windCarryPerMph * (1 - Math.max(0, Math.min(1, opts.windResist ?? 0)));
  // Carry window mirrors resolveShot's clamp (distance-control / wedge-window), so the preview's
  // min/max carry read exactly what the shot will do.
  const cw = carryControlFor(club.id, nominal, opts);
  let lowFrac = prof.lowFrac;
  let highFrac = prof.highFrac;
  if (cw.minCarryFracBoost) lowFrac = Math.min(highFrac, lowFrac + cw.minCarryFracBoost);
  if (cw.carryWindowTighten) {
    const t = Math.max(0, Math.min(1, cw.carryWindowTighten));
    lowFrac = lowFrac + (prof.meanFrac - lowFrac) * t;
    highFrac = highFrac - (highFrac - prof.meanFrac) * t;
  }
  // The carry WINDOW is resolveShot's clamp: [intended·lowFrac, intended·highFrac]. Wind shifts the
  // MEAN *within* that window (resolveShot clamps carryMean+noise to these UN-shifted bounds), it does
  // NOT move the bounds — so the cone's near/far arcs are `low`/`high`, and only `expectedCarry` (the
  // aim line) carries the wind bias. The arcs used to be drawn at `low+along`/`high+along`, which is a
  // window the shot can never actually reach: harmless at full power (window >> wind) but at CHIP power
  // the window is tiny and the wind term dominates, so the drawn cone diverged wildly from where the
  // ball lands (a headwind chip drew a 2-4y cone for a shot that clamps to ~8y — "the arc overlay is
  // way too long/short around the green"). Now the arcs mirror the sim's clamp exactly (GS-chip-cone).
  const low = intended * lowFrac;
  const high = intended * highFrac;
  const mean = Math.max(low, Math.min(high, intended * prof.meanFrac + along));
  // The asymmetric zone shape: global upgrade mod + this club's character skew (+ Sam's confidence
  // boost when this is his suggested club, so the cone visibly tightens on the recommended club). The
  // renderer draws each zone straight from it (so the graphic is the landing distribution), and the
  // effective σ is its RMS so previews/tests read true.
  const confident = opts.confidence && opts.suggestedClubId === club.id ? opts.confidence : undefined;
  const shape = resolveShape(combineShapeMods(opts.shapeMod, confident), mods.shape);
  const angleSpread = prof.lateralFrac * dispMult;
  // Left-handed (GS-lefty): the character's directional bias rotates the OPPOSITE way (a lefty's fade
  // ends left, not right). The renderer mirrors the spray bands about this bearing via `lefty` — so
  // `bearing + h·bias` plus mirrored bands reproduces resolveShot's `h·(bias + sprayAngle)` exactly.
  const h = opts.lefty ? -1 : 1;
  return {
    origin: from,
    bearing: shotBearing + (h * mods.angleBias * 180) / Math.PI,
    expectedCarry: mean,
    carryLow: Math.max(0, low),
    carryHigh: high,
    lateralSd: intended * prof.lateralFrac * dispMult,
    carrySd: intended * prof.carryFrac * dispMult,
    angleSd: sprayAngleRms(shape, angleSpread),
    angleSpread,
    shape,
    lefty: opts.lefty,
    nominalCarry: nominal,
    flight: flightProfileOf(club.id),
  };
}

// --- Backspin helper line (GS-backspin-line) ---------------------------------
/** The previewed MEAN roll-out of a contemplated wedge/short-iron shot — the "backspin helper line".
 *  Course-space, so the renderer draws the check/curl exactly where the ball will settle. */
export interface BackspinRoll {
  /** Where the ball first lands — the aim-line touchdown at `expectedCarry`. */
  landing: Vec;
  /** The rolled/checked travel path landing→rest (≥2 points; curls on contoured greens, byte-for-byte
   *  the SAME `rollOut` path the sim resolves, so the graphic IS the physics — contract 5). */
  path: Vec[];
  /** Signed roll (yd): + runs forward, − checks back toward the player. */
  rollYd: number;
}

/** Below this |roll| (yd) the ball effectively stops dead — not worth drawing a helper line for. */
const SPIN_LINE_MIN = 1.0;

/**
 * Deterministic MEAN roll-out of a contemplated shot — the roll/check helper line (GS-backspin-line +
 * GS-runout-line). Mirrors `executeShot`'s roll block at the mean roll energy (rng.range midpoint 1.0, NO
 * draw taken), so it is a PURE render aid: the same `clubRollFraction` + character `rollFracDelta` −
 * `backspinBoost` the sim uses, fed through the SAME `rollOut` — the drawn check/run + contour curl is
 * exactly the physics. A backspin club (wedge/short iron) always yields its check line; a FORWARD-rolling
 * club (mid/long iron, hybrid, wood) yields its forward RUN-OUT only when the ball lands ON THE GREEN (so
 * the graphic shows where an approach actually settles instead of just its carry — the "ball goes long of
 * the arc" fix). Returns null for a club that runs forward but lands off the green, a landing that plugs
 * in a penalty, or a negligible roll. Zero rng. (The rare ship-corridor pinball flight + tent ricochet are
 * not reproduced — the line is a helper, the actual bounce is the truth.) */
export function backspinRoll(
  hole: Hole,
  spray: ShotSpread,
  opts: {
    /** Character per-club roll bias (− = more check). */
    rollFracDelta?: number;
    /** Spin gear (Spin-Milled etc.): subtracted from the roll fraction — more check. */
    backspinBoost?: number;
    /** Hazard-skip balls: penalty kinds the ball skims across instead of resting in. */
    immune?: ReadonlySet<string>;
    tents?: readonly TradeTent[];
  } = {},
): BackspinRoll | null {
  const nominal = spray.nominalCarry;
  const carry = spray.expectedCarry;
  if (carry <= 0) return null;
  const br = (spray.bearing * Math.PI) / 180;
  const dir: Vec = [Math.sin(br), Math.cos(br)];
  const landing: Vec = [spray.origin[0] + dir[0] * carry, spray.origin[1] + dir[1] * carry];
  // The MEAN roll energy: rollPotential's `carry · frac` at the rng.range(0.85,1.15) midpoint 1.0 — the
  // family carry/roll SPLIT (GS-carry-rollout-split) off the club's flight profile, so the drawn line IS
  // the physics the sim releases.
  const frac = rollFractionFor(spray.flight, nominal) + (opts.rollFracDelta ?? 0) - (opts.backspinBoost ?? 0);
  const K = Math.max(-MAX_CHECK, Math.min(ROLL_ENERGY_CAP, carry * frac));
  if (Math.abs(K) < SPIN_LINE_MIN) return null;
  const tdLie = lieAt(hole, landing);
  // The line draws the ball's LAND-and-RUN: a forward RUN-OUT (driver/wood/hybrid/iron flying its
  // reduced carry then releasing to the total, GS-carry-rollout-split) so the player SEES the total
  // includes the run and can read "carry short of a hazard, run to the pin". A backspin BUILD's wedge
  // (K < 0) always draws its check/curl. A forward run only draws when it lands on SHORT GRASS
  // (fairway/green/tee) where the ball genuinely releases — a ball dropping into rough/sand/trees
  // stops in the stuff (little run, and a line into the hay reads as clutter, not info).
  if (K >= 0 && !RUNOUT_LIES.has(tdLie)) return null;
  const tdPen = lieInfo(tdLie).penalty;
  if (tdPen && !(opts.immune && opts.immune.has(tdPen))) return null; // plugs in a hazard — nothing to roll
  const out = rollOut(hole, landing, dir, K, tdLie, opts.immune, opts.tents, hole.walls);
  if (Math.abs(out.roll) < SPIN_LINE_MIN) return null;
  const path = out.path && out.path.length >= 2 ? out.path : [landing, out.rest];
  return { landing, path, rollYd: out.roll };
}

// --- Blocked-shot spray overlay (GS-spray-block) ------------------------------
/** One angular sample of a blocked region: the landing radii [r0, r1] (yards) at band angle `a`
 *  (radians off the bearing, in the same pre-mirror band space `sprayBands` uses) where a ball
 *  sampled to land would instead be knocked down by a tall obstacle. */
export interface BlockedSample {
  a: number;
  r0: number;
  r1: number;
}

/** A contiguous angular run of blocked landings inside the spray cone — the renderer shades it. */
export interface BlockedRegion {
  a0: number;
  a1: number;
  /** Per-angle radial intervals, evenly spaced a0→a1 — the region's drawable boundary. */
  samples: BlockedSample[];
  /** What interrupts the flight here — picks the render glyph (🌲/⛺/🧱). A run is 'tents'/'walls' only
   *  when NO tree contributes to it (a mixed grove run reads as woods). */
  src: 'trees' | 'tents' | 'walls';
}

export interface SprayBlockingOpts {
  /** Angular width (radians) below which a blocked run is DROPPED — a sliver reads as noise, not
   *  information. The renderer derives this from the projected pixel size, so it's zoom-honest. */
  minSpanRad?: number;
  /** Clear gap (radians) between two blocked runs below which they MERGE — no barcode striping. */
  mergeGapRad?: number;
  /** Radial depth (yards) below which a blocked interval is ignored (a grazing clip, not a wall). */
  minDepthYd?: number;
  /** Snap a blocked interval's edge onto the carry-window edge when within this (yards) — kills the
   *  1-px "open rim" sliver between a blocked zone and the arc it nearly touches. */
  snapYd?: number;
  /** Angular sample count across the cone (clamped; default scales with `minSpanRad`). */
  samples?: number;
  /** Trade-camp tents (GS-tents) to probe as aerial obstacles alongside the trees — pass the SAME
   *  `tradeTents(hole)` the sim collides with in `executeShot`, and only when the trade-market
   *  course effect is armed (the call sites gate it). Absent ⇒ tents never shade. */
  tents?: readonly TradeTent[];
  /** Ship-corridor bulkheads (GS-ship-walls) to probe as tall obstacles alongside the trees — pass
   *  the hole's own `walls` (the derelict only). A cone angle whose flight would ricochet off a wall
   *  shades from the impact out, marked with the wall glyph, so the player SEES the bounce coming.
   *  Absent ⇒ walls never shade. */
  walls?: readonly ShipWall[];
}

/**
 * Where the contemplated shot would be BLOCKED by tall obstacles, across the drawn spray cone
 * (GS-spray-block / GS-spray-block-2). For each angle across the cone's full band extent, the
 * landing radii in the carry window are probed with the SAME walks the sim resolves shots with —
 * trees via `flightBlockedBy` (the path `flightKnockdown` delegates to) and trade-camp tents via
 * `tentFlightHit` (when `opts.tents` is armed). Per angle the read is BINARY (GS-spray-block-2):
 *  - if EVERY landing in the window flies clean over everything on that line (or nothing is in
 *    reach), the line is CLEAR — no shading, however tall the scenery it sails over;
 *  - if ANY landing gets interrupted, the line is BLOCKED from the interruption point (where the
 *    ball actually comes down — the object, not the aimed landing) out to the cone's FAR edge.
 *    No floating "clear pocket" draws beyond the object: the whole rest of that slice reads dead.
 * So an unshaded landing is exactly one the sim lets through, and a shaded slice always starts at
 * a real knockdown/bounce (the far part is conservative — a flyer that would individually clear
 * the object lands as a pleasant surprise, never a hidden wall).
 *
 * The per-angle mask is then smoothed so it reads as intent, not noise:
 *  - intervals shallower than `minDepthYd` are dropped, and a near edge within `snapYd` of the
 *    carry window snaps onto it;
 *  - angular runs closer than `mergeGapRad` merge (interpolating across the gap), and runs
 *    narrower than `minSpanRad` are dropped — no 1-px blockers, no blocked/open striping.
 *
 * Pure, zero rng — display-only geometry; the sim's own knockdown/bounce in `executeShot` is
 * untouched.
 */
export function sprayBlocking(
  hole: Hole,
  s: ShotSpread,
  geom: SprayGeom = SPRAY_GEOM,
  opts: SprayBlockingOpts = {},
): BlockedRegion[] {
  if (s.expectedCarry <= 0 || s.angleSpread <= 0 || s.carryHigh <= 0) return [];
  const obstacles = flightObstacles(hole);
  const tents = opts.tents && opts.tents.length ? opts.tents : undefined;
  const walls = opts.walls && opts.walls.length ? opts.walls : undefined;
  if (obstacles.length === 0 && !tents && !walls) return [];
  const bands = sprayBands(s.shape, s.angleSpread, geom).filter((b) => b.prob > 0 && b.a1 - b.a0 > 1e-6);
  if (bands.length === 0) return [];
  let aMin = Infinity;
  let aMax = -Infinity;
  for (const b of bands) {
    aMin = Math.min(aMin, b.a0);
    aMax = Math.max(aMax, b.a1);
  }
  const span = aMax - aMin;
  if (!(span > 0)) return [];

  const minSpan = Math.max(0, opts.minSpanRad ?? 0.02);
  const mergeGap = Math.max(0, opts.mergeGapRad ?? 0.03);
  const minDepth = Math.max(0, opts.minDepthYd ?? 2);
  const snap = Math.max(0, opts.snapYd ?? 2);
  // Angular resolution: fine enough to resolve runs at the sliver threshold (≥2 samples per
  // `minSpan`), clamped so a huge cone stays cheap and a tiny one stays smooth.
  const N = Math.max(
    16,
    Math.min(72, opts.samples ?? Math.ceil(span / Math.max(1e-4, minSpan / 2))),
  );
  const rLow = Math.max(0.5, s.carryLow);
  const rHigh = Math.max(rLow, s.carryHigh);
  // Radial probes: every few yards through the carry window (endpoints included).
  const K = Math.max(3, Math.min(16, Math.ceil((rHigh - rLow) / 4) + 1));
  const rStep = K > 1 ? (rHigh - rLow) / (K - 1) : 0;

  const br = (s.bearing * Math.PI) / 180;
  // The same lefty mirror the drawn cone (and resolveShot) applies: band angle a → world bearing
  // br + h·a, so the probed landings are exactly the points the cone draws.
  const h = s.lefty ? -1 : 1;
  const landAt = (a: number, r: number): Vec => [
    s.origin[0] + Math.sin(br + h * a) * r,
    s.origin[1] + Math.cos(br + h * a) * r,
  ];

  // Per-angle blocked interval (or null), GS-spray-block-2: scan the landing radii short→long and
  // stop at the FIRST interruption (tree knockdown, else tent bounce — the sim checks trees first
  // in `executeShot` too). Blocked ⇒ the interval runs from where the ball comes DOWN (the object)
  // to the cone's far edge; no interruption at any radius ⇒ the line is clear, nothing shades.
  const intervals: ({ r0: number; r1: number } | null)[] = [];
  const causes: ('trees' | 'tents' | 'walls' | null)[] = [];
  const angles: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = aMin + (span * i) / N;
    angles.push(a);
    let hitAt = -1;
    let cause: 'trees' | 'tents' | 'walls' = 'trees';
    for (let k = 0; k < K; k++) {
      const r = rLow + rStep * k;
      const landing = landAt(a, r);
      const kd = flightBlockedBy(obstacles, s.origin, landing, s.bearing, r, s.nominalCarry, s.flight);
      if (kd) {
        hitAt = kd.carry;
        break;
      }
      const th = tents ? tentFlightHit(tents, s.origin, landing, s.bearing, r, s.nominalCarry, s.flight) : null;
      if (th) {
        hitAt = th.carry;
        cause = 'tents';
        break;
      }
      // Ship-corridor bulkhead (GS-ship-walls): the SAME curved-flight ricochet check the sim
      // resolves shots with — a cone line whose arc would cross a wall reads BLOCKED from the impact
      // out, so a bounce is never a surprise.
      const wh = walls ? wallFlightHit(walls, s.origin, landing, s.bearing, r, s.nominalCarry, s.flight) : null;
      if (wh) {
        hitAt = wh.carry;
        cause = 'walls';
        break;
      }
    }
    if (hitAt < 0) {
      intervals.push(null);
      causes.push(null);
      continue;
    }
    let r0 = Math.max(rLow, hitAt);
    if (r0 - rLow < snap) r0 = rLow;
    const keep = rHigh - r0 >= minDepth;
    intervals.push(keep ? { r0, r1: rHigh } : null);
    causes.push(keep ? cause : null);
  }

  // Merge angular runs across sub-threshold clear gaps (lerp the interval through the gap), then
  // drop runs narrower than the sliver threshold.
  const step = span / N;
  const gapSamples = Math.floor(mergeGap / Math.max(1e-6, step));
  for (let i = 0; i <= N; i++) {
    if (intervals[i] !== null) continue;
    // A clear gap: find its extent and the blocked neighbours on both sides.
    let j = i;
    while (j <= N && intervals[j] === null) j++;
    const prev = i - 1 >= 0 ? intervals[i - 1] : null;
    const next = j <= N ? intervals[j] : null;
    if (prev && next && j - i <= gapSamples) {
      for (let k = i; k < j; k++) {
        const t = (k - (i - 1)) / (j - (i - 1));
        intervals[k] = { r0: prev.r0 + (next.r0 - prev.r0) * t, r1: prev.r1 + (next.r1 - prev.r1) * t };
        // Carry a cause across the bridged gap too (nearest blocked neighbour), so a merged region's
        // tree-vs-tent classification counts the whole run — a bridged gap left as `null` biased every
        // merged region to 'trees' and could stamp the wrong glyph over a tent stretch.
        causes[k] = (k - (i - 1) <= j - k ? causes[i - 1] : causes[j]) ?? causes[i - 1] ?? causes[j] ?? 'trees';
      }
    }
    i = j;
  }

  const regions: BlockedRegion[] = [];
  for (let i = 0; i <= N; i++) {
    if (intervals[i] === null) continue;
    let j = i;
    while (j <= N && intervals[j] !== null) j++;
    // Run spans samples [i, j); width in radians:
    const width = angles[j - 1]! - angles[i]!;
    if (width >= minSpan) {
      const samples: BlockedSample[] = [];
      let treeHits = 0;
      let tentHits = 0;
      let wallHits = 0;
      for (let k = i; k < j; k++) {
        const iv = intervals[k]!;
        samples.push({ a: angles[k]!, r0: iv.r0, r1: iv.r1 });
        if (causes[k] === 'trees') treeHits++;
        else if (causes[k] === 'tents') tentHits++;
        else if (causes[k] === 'walls') wallHits++;
      }
      // A mixed run reads as the more "solid" cause: a grove wins (trees), then tents, then walls —
      // so a purely-wall run (the derelict) glyphs as a wall, never mislabelled woods.
      const src = treeHits > 0 ? 'trees' : tentHits > 0 ? 'tents' : wallHits > 0 ? 'walls' : 'trees';
      regions.push({ a0: angles[i]!, a1: angles[j - 1]!, samples, src });
    }
    i = j;
  }
  return regions;
}

/** The club the AI would choose for a target: reach the plays-like distance, minus a
 *  roll allowance, gravity-adjusted. The interactive driver uses this as its suggestion. */
export function aiClub(
  hole: Hole,
  from: Vec,
  target: Vec,
  carryMult: number,
  bag: readonly Club[],
  stats?: ClubStats,
): Club {
  const shotBearing = bearingDeg(from, target);
  const playLike = playsLike(dist(from, target), hole.wind, shotBearing);
  const rollAllowance = Math.min(MAX_ROLL, playLike * 0.1);
  return suggestClub(Math.max(1, playLike - rollAllowance) / carryMult, 'reach', bag, stats);
}

/** Floor on the auto sim's dialed-down power — a controlled chip/punch, never a putt-tap full swing. */
export const AUTO_MIN_POWER = 0.4;
/** Only throttle when the target is inside this fraction of the club's carry — a genuine chip/punch,
 *  not a near-full approach (kept moderate so ordinary short-iron approaches stay full power). */
export const AUTO_THROTTLE_MAX = 0.8;

/**
 * The POWER the auto sim plays a shot at (GS-rough-gradient-rebalance). The sim used to swing every
 * club at FULL power, so when the target sat inside the chosen club's carry — a chip onto a green, a
 * punch-out to the nearest fairway — it OVERSHOT (blasting a 60-yd wedge at a 25-yd escape), the ball
 * flew back into trouble, and strokes piled up. That was the twin sparse-bag death-spiral driver: the
 * ball couldn't escape trees (a full swing sprayed back in) and couldn't hold a green from close (it
 * flew the apron). A real player dials the power gesture down for a short shot; now the auto sim does
 * too — it throttles to land the ball near the target (leaving the same 10%-ish roll allowance
 * `aiClub` clubs for), floored at `AUTO_MIN_POWER`. Returns 1 (byte-identical) whenever the target is
 * at/beyond the club's controllable carry, so ordinary reach shots are UNCHANGED. Pure, zero rng —
 * mirrored by the interactive auto path (`autoDecision`) so auto ≡ interactive holds.
 */
export function autoShotPower(
  hole: Hole,
  from: Vec,
  target: Vec,
  club: Club,
  carryMult: number,
  bag: readonly Club[],
  stats?: ClubStats,
): number {
  const full = clubDist(club, stats) * carryMult;
  if (full <= 0) return 1;
  // NEVER dial down a shot whose line must CARRY a penalty hazard (water/lava/void/crossing) — a soft
  // shot would drop short INTO it. Those play full power to clear (byte-identical on a clear line).
  if (forcedCarry(hole, from, target)) return 1;
  // ONLY a genuine short shot gets dialed — a chip onto a green, a punch-out from trees. That means
  // the SHORTEST club in the bag was chosen (no shorter option exists) AND the target sits well inside
  // its carry, so a full swing would blow past it into trouble. Every ordinary reach shot (a longer
  // club, or a target near/beyond the club's carry) plays FULL power → byte-identical.
  let shortest = Infinity;
  for (const c of bag) if (c.id !== 'putter') shortest = Math.min(shortest, clubDist(c, stats) * carryMult);
  if (full > shortest + 1e-6) return 1; // a longer club than the shortest ⇒ a reach shot, full power
  const playLike = playsLike(dist(from, target), hole.wind, bearingDeg(from, target));
  if (playLike >= full * AUTO_THROTTLE_MAX) return 1; // target near the club's carry ⇒ full power
  // A soft chip/punch still rolls a touch, so carry SHORT of the target and let it roll on. Floored so
  // it stays a controlled shot, never a stunted tap.
  const wantCarry = playLike - Math.min(MAX_ROLL, playLike * 0.1);
  return Math.max(AUTO_MIN_POWER, wantCarry / full);
}

/** Pin location (exported for the interactive driver). */
export function pinOf(hole: Hole): Vec {
  return pin(hole);
}

/** Near/far extent of the green along the ball→green line (yards from the ball): how far it
 *  is to the front edge and the back edge of the putting surface on the approach line. Pure. */
export function greenDepth(hole: Hole, ball: Vec): { front: number; back: number } {
  const c = hole.green;
  let ux = c[0] - ball[0];
  let uy = c[1] - ball[1];
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const greenPoly = hole.features.find((f) => f.kind === 'green')?.poly;
  if (!greenPoly || greenPoly.length < 3) return { front: len, back: len };
  let front = Infinity;
  let back = -Infinity;
  for (const v of greenPoly) {
    const d = (v[0] - ball[0]) * ux + (v[1] - ball[1]) * uy; // projection onto the approach line
    front = Math.min(front, d);
    back = Math.max(back, d);
  }
  return { front: Math.max(0, front), back: Math.max(0, back) };
}

/**
 * The nearest PENALTY carry on the straight line from `from` to `target`: the first penalty band
 * (water/lava/void/crossing) the line crosses, and the carry needed to reach just past its far edge
 * (i.e. to clear it). Sampled along the line — info only (Suggestible Sam's hazard read), so a few
 * yards of sampling slop is fine; it never feeds fairness/scoring. Returns null if the line is clear.
 * Pure.
 */
export function forcedCarry(hole: Hole, from: Vec, target: Vec): { carry: number; kind: FeatureKind } | null {
  const total = dist(from, target);
  if (total < 1) return null;
  const ux = (target[0] - from[0]) / total;
  const uy = (target[1] - from[1]) / total;
  const step = 3;
  let entry = -1;
  let kind: FeatureKind | null = null;
  for (let d = step; d <= total; d += step) {
    const p: Vec = [from[0] + ux * d, from[1] + uy * d];
    const lk = lieAt(hole, p);
    if (lieInfo(lk).penalty) {
      if (entry < 0) {
        entry = d;
        kind = lk;
      }
    } else if (entry >= 0) {
      // Exited the first penalty band — carrying to here clears it.
      return { carry: Math.round(d), kind: kind! };
    }
  }
  // The line ends inside a penalty band (you'd have to fly the whole way), or never crossed one.
  return entry >= 0 ? { carry: Math.round(total), kind: kind! } : null;
}

/**
 * The club to SUGGEST to an interactive player aiming at the green (GS-mechanics #6). Unlike
 * the auto `aiClub` (shortest club that just reaches — tuned for the headless balance), this
 * reasons about green COVERAGE *and the pin*:
 *   - green unreachable → the longest usable club (give it your best go);
 *   - reachable, a full club holds the green → the LONGEST club whose EXPECTED carry both REACHES
 *     THE PIN and still stops by the back edge (`distToPin ≤ expectedCarry ≤ distToBack`), so you
 *     take the most club you can without flying the green AND never come up short of the flag;
 *   - too close for any full club to hold the green → the SHORTEST club that can still carry to
 *     the pin, to be DIALED DOWN to it (a partial pitch — the at-rest power seed scales the shot
 *     to the pin), rather than the shortest club in the bag.
 *
 * The earlier rule gated on `carryLow ≤ distToFront` (the club's WORST-case carry). That let
 * the driver in for any approach long enough that the driver's worst miss could still come up
 * short of the front — the "the suggestion keeps handing me the driver" bug — so it was retuned
 * to gate on the EXPECTED carry `≤ back`. But that left a near-green failure: with no pin term,
 * whenever the next club up would fly the back edge the rule fell to the shortest club in the bag
 * — the 20-yд Chipper — leaving any pin past its range well short (brutal in the sparse Story bag
 * where the drop below the Sand Wedge is the Chipper). Adding the pin floor fixes both: a club is
 * never chosen if it can't carry to the flag, and the Chipper is picked only when the pin is
 * genuinely within its ~20-yд range.
 *
 * Pure; uses the same `shotSpread` the cone draws so the suggestion reads true. Does NOT touch
 * the auto sim.
 */
export function suggestPlayerClub(
  hole: Hole,
  ball: Vec,
  lie: FeatureKind,
  bag: readonly Club[],
  opts: { carryMult?: number; dispersionMult?: number; stats?: ClubStats } = {},
): Club {
  // Approach clubs only — the putter/short chip are never an approach suggestion (the UI
  // swaps to the putter itself once on the green).
  const cand = bag.filter((c) => c.id !== 'putter');
  if (cand.length === 0) return bag[0]!;
  const { front, back } = greenDepth(hole, ball);
  const distToPin = dist(ball, pinOf(hole));
  const target = hole.green;
  const spreadOf = (c: Club) =>
    shotSpread(hole, ball, lie, target, c, {
      carryMult: opts.carryMult,
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
    });
  // Green COVERAGE reasons about where the ball RESTS, not where it lands — so fold the run-out back in
  // (GS-carry-rollout-split): the club flies its reduced carry then releases to the total, and it's the
  // total that has to reach the flag and stop by the back. `expectedTotal`/`highTotal` add the family
  // run to the flight cone so the suggestion reads true (wedge/putter run 0 → unchanged).
  const expectedTotal = (c: Club) => {
    const sp = spreadOf(c);
    return sp.expectedCarry * (1 + rollFractionFor(sp.flight, sp.nominalCarry));
  };
  const highTotal = (c: Club) => {
    const sp = spreadOf(c);
    return sp.carryHigh * (1 + rollFractionFor(sp.flight, sp.nominalCarry));
  };
  const longest = cand.reduce((a, b) => (clubDist(b, opts.stats) > clubDist(a, opts.stats) ? b : a));

  // Unreachable: even the longest club's best TOTAL can't get to the front → swing the longest.
  if (highTotal(longest) < front) return longest;

  const byCarryAsc = [...cand].sort((a, b) => clubDist(a, opts.stats) - clubDist(b, opts.stats));
  const EPS = 1e-6;
  // The honest approach: the LONGEST club whose EXPECTED total reaches the PIN yet still stops by the
  // back edge. Walk shortest→longest, keep the last qualifier — never short of the flag, never over the
  // back on a normal strike.
  let onGreen: Club | undefined;
  for (const c of byCarryAsc) {
    const et = expectedTotal(c);
    if (et >= distToPin - EPS && et <= back) onGreen = c;
  }
  if (onGreen) return onGreen;
  // Too close for any full club to hold the green (every full total flies the back): the SHORTEST club
  // that can still reach the pin, dialed DOWN to it (a partial pitch). NOT the shortest club in the
  // bag — that under-clubbed to the Chipper and left mid pins short (the near-green bug).
  for (const c of byCarryAsc) {
    if (expectedTotal(c) >= distToPin - EPS) return c;
  }
  // Nothing reaches the pin (a forced lay-up short) → the longest club, best go.
  return longest;
}

/**
 * PUNCH-OUT recovery (GS-rough-gradient-rebalance): from a TRAPPING lie — trees or deep rough — where
 * the green is out of reach anyway, the smart play is OUT to the nearest fairway, NOT a low-percentage
 * bomb toward the green through the forest. That bomb was the #1 sparse-bag death-spiral driver: a trees
 * lie fed ~60% of the blow-ups (the ball kept re-hitting trees because the AI always aimed forward and
 * `clearLine` only sees penalty hazards, not trees). Returns the nearest REACHABLE fairway/green point
 * that best trades escape cost for forward progress (never retreating more than a little), or null when
 * there's no worthwhile escape (fall back to the normal forward line). Pure geometry, zero rng — shared
 * by the auto sim (`playHole`) and the interactive "safe"/auto-finish aim, so auto ≡ interactive holds.
 */
function recoveryTarget(hole: Hole, ball: Vec, lie: FeatureKind, maxReach: number): Vec | null {
  if ((lie !== 'trees' && lie !== 'deeprough') || maxReach <= 0) return null;
  const flag = pin(hole);
  // If the green is reachable this is an approach/greenside recovery — let `safeTarget` play toward
  // the green (a sideways punch-out would waste a scoring shot). Only punch out on the long game.
  if (dist(ball, flag) <= maxReach) return null;
  const here = dist(ball, flag);
  let best: Vec | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const q = pointAlong(hole.centreline, i / 200);
    const k = lieAt(hole, q);
    if (k !== 'fairway' && k !== 'green') continue;
    const d = dist(q, ball);
    if (d > maxReach || d < 1) continue; // must be reachable, and a real move
    if (!clearLine(hole, ball, q)) continue; // never punch OVER a penalty hazard (lava/water/void)
    const progress = here - dist(q, flag); // >0 ⇒ q is closer to the green than the ball
    if (progress < -maxReach * 0.25) continue; // never retreat more than a quarter of the reach
    // Prefer forward progress; discount by escape distance so we take the CLOSE, safe way out.
    const score = progress - d * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

/** Lay-up target: the penalty-free corridor point ahead of the ball (exported). */
export function layupTarget(
  hole: Hole,
  ball: Vec,
  lie: FeatureKind = 'fairway',
  bag: readonly Club[] = CLUBS,
  carryMult: number = biomeCarryMult(hole),
): Vec {
  // The "safe" line plays to the fat of the green (centroid), mirroring the auto playHole
  // aim EXACTLY so the interactive auto-finish reproduces the headless sim byte-for-byte.
  // The "attack" choice is what aims at the flag — the player's risk to take. `maxReach` is
  // derived deterministically from (bag, lie, carryMult) so a forced-carry decision (lava
  // rivers) is identical on both the auto and interactive paths.
  const maxReach = maxReachOf(bag, carryMult, lie);
  const maxFlightReach = maxFlightReachOf(bag, carryMult, lie);
  // From trees / deep rough, punch OUT to the fairway first (positional golf, not a forest bomb).
  const escape = recoveryTarget(hole, ball, lie, maxReach);
  if (escape) return escape;
  return safeTarget(hole, ball, hole.green, maxReach, maxFlightReach);
}

/** Effective max TOTAL reach (yards) the bag can finish at from this lie — where the ball ends
 *  (carry + run). This is the number a green/position REACH decision keys off; the carry/roll split
 *  preserves the total, so it is unchanged. */
function maxReachOf(bag: readonly Club[], carryMult: number, lie: FeatureKind): number {
  let max = 0;
  for (const c of bag) if (c.id !== 'putter') max = Math.max(max, c.carry);
  return max * carryMult * lieInfo(lie).carryMult;
}

/** Effective max FLIGHT reach (yards) the bag can CARRY from this lie — where the ball first LANDS,
 *  the number a forced-carry decision needs (GS-carry-rollout-split). The split lands the ball at
 *  `flightCarryScale` of its total, so a carry over water must be cleared in the AIR, not by the run —
 *  this is what tells the AI to lay up when its reduced flight can't span the hazard. Wedge/putter
 *  (scale 1) are unchanged; the longest club (driver, ~0.94×) drives this. */
function maxFlightReachOf(bag: readonly Club[], carryMult: number, lie: FeatureKind): number {
  let max = 0;
  const lieM = lieInfo(lie).carryMult;
  for (const c of bag) {
    if (c.id === 'putter') continue;
    max = Math.max(max, c.carry * flightCarryScale(c.id, c.carry) * carryMult * lieM);
  }
  return max;
}

/**
 * The SMART interactive default aim (GS-default-aim). Where a helpful auto-aim assist points so the
 * default framing looks DOWN the hole, never out into the rough:
 *   - a par 3 (or any one-shot hole) → the FLAG (attack it — that's the whole shot);
 *   - a par 4/5 TEE shot → down the fairway CENTRELINE (dogleg-aware: the corridor station a good
 *     drive reaches, not a straight line that cuts the corner into the trees);
 *   - a par 4/5 NON-tee shot → the FLAG when the green is reachable (the best shot at the hole),
 *     else position down the corridor like the tee shot.
 * Routes the positioning aim through the shared `safeTarget` so a forced carry / side hazard on the
 * way is still respected (fair by construction). Pure, zero rng. Interactive-only — the headless auto
 * sim keeps its own `layupTarget` line, so determinism (contract 1) and every seeded test are
 * untouched; only the interactive shot screen's DEFAULT target changes.
 */
export function autoAimTarget(
  hole: Hole,
  ball: Vec,
  lie: FeatureKind = 'tee',
  bag: readonly Club[] = CLUBS,
  carryMult: number = biomeCarryMult(hole),
): Vec {
  const pin = pinOf(hole);
  if (hole.par <= 3) return pin;
  const maxReach = maxReachOf(bag, carryMult, lie);
  // A shot from off the tee that can carry to the green goes for the flag.
  if (lie !== 'tee' && maxReach > 0 && dist(ball, pin) <= maxReach) return pin;
  // Tee shot, or an out-of-reach approach: position DOWN the corridor. Aim at the centreline station a
  // good drive reaches (following any dogleg) — this keeps the camera framed on the hole, not the rough.
  const t0 = nearestCentrelineT(hole, ball);
  const tAim = stationAtDistance(hole, ball, t0, maxReach * WIDTH_LAYUP.meanLandFrac);
  const aimPt = pointAlong(hole.centreline, tAim);
  // If the straight line to that station is penalty-free, aim there. Otherwise a forced carry blocks it:
  // defer to the shared safe logic toward the green (carry it, or lay up short — fair by construction),
  // but never aim a positioning shot PAST a drive (the fractional side-hazard advance can overshoot on a
  // wandering corridor), so fall back to the reachable station if the safe line runs long.
  if (clearLine(hole, ball, aimPt)) return aimPt;
  const safe = safeTarget(hole, ball, pin, maxReach, maxFlightReachOf(bag, carryMult, lie));
  return dist(ball, safe) <= maxReach + 1e-6 ? safe : aimPt;
}

/**
 * The club the SMART default aim (`autoAimTarget`) pre-selects (GS-default-aim), kept in LOCKSTEP with
 * it so the pre-armed club matches the pre-aimed line. The headless `aiClub` clubs DOWN (the shortest
 * club that just reaches the target minus roll) — right for the auto-sim balance, wrong for a human
 * DEFAULT: off the tee it handed back a fairway wood instead of the driver, and an approach came up a
 * club or two SHORT of the green. This picks the club a player wants pre-armed instead:
 *   - a green attack (par 3, or a reachable approach — auto aims at the flag) → the green-COVERAGE club
 *     (`suggestPlayerClub`: the MOST club that still holds the green), so an approach never clubs short;
 *   - an OPEN positioning shot down the corridor (a tee bomb, a lay-forward) → the LONGEST usable club
 *     (the driver off the tee), so a drive isn't clubbed down to a wood — the club sets the CARRY and the
 *     aim target only the DIRECTION (`shotSpread`), so the longest club bombs down the aim line;
 *   - a forced-CARRY drive (the aim line flies OVER a hazard to a landing beyond it) → the LONGEST club
 *     that still safely clears the far bank and lands penalty-free (a tee carry the driver flies is a
 *     driver, not a clubbed-down wood — taking MORE club is the safer carry, never less). Only when NO
 *     club can both clear the hazard and land clear (a genuine lay-up short) does it fall back to the
 *     shortest club that REACHES (`aiClub`), a controlled shot that won't drop into the hazard.
 * Pure, zero rng. Interactive-only (the UI's default club) — the headless sim keeps `aiClub`, so
 * determinism (contract 1) and every seeded test are untouched.
 */
export function autoAimClub(
  hole: Hole,
  ball: Vec,
  lie: FeatureKind,
  bag: readonly Club[],
  carryMult: number,
  dispersionMult = 1,
): Club {
  const target = autoAimTarget(hole, ball, lie, bag, carryMult);
  // Green attack — cover the green (never club short of it).
  if (dist(target, pin(hole)) <= 1) {
    return suggestPlayerClub(hole, ball, lie, bag, { carryMult, dispersionMult });
  }
  const cand = bag.filter((c) => c.id !== 'putter');
  if (cand.length === 0) return bag[0]!;
  // Open positioning down the corridor → send the LONGEST club (driver off the tee).
  const longest = cand.reduce((a, b) => (clubDist(b) > clubDist(a) ? b : a));
  if (clearLine(hole, ball, target)) return longest;
  // Blocked line: the aim flies OVER a hazard (a forced carry — a lay-up SHORT would leave the line
  // clear). A player takes the driver to carry it, not a clubbed-down wood, so send the LONGEST club
  // that still clears the far bank AND lands on a penalty-free spot. Only if none can (the hazard is
  // out of every club's carry — a genuine lay-up short) fall back to the controlled `aiClub` reach.
  return longestCarryClub(hole, ball, target, lie, carryMult, cand) ?? aiClub(hole, ball, target, carryMult, bag);
}

/**
 * The LONGEST club that safely CARRIES the hazard on the ball→target line and comes down on a
 * penalty-free spot — the club a player reaches for on a forced-carry drive (more club = the safer
 * carry). Walks longest→shortest and returns the first whose nominal carry clears the hazard's far
 * bank and whose landing isn't itself a penalty (so a bomb that would overshoot into a SECOND hazard
 * steps down to the longest club that stays dry). Null when no club can clear it (lay up short).
 * Pure, zero rng — used only by the interactive default-club pick.
 */
function longestCarryClub(
  hole: Hole,
  ball: Vec,
  target: Vec,
  lie: FeatureKind,
  carryMult: number,
  cand: readonly Club[],
): Club | null {
  const fc = forcedCarry(hole, ball, target);
  if (!fc) return null; // not actually a carry — nothing to clear
  const total = dist(ball, target);
  if (total < 1) return null;
  const ux = (target[0] - ball[0]) / total;
  const uy = (target[1] - ball[1]) / total;
  const lieM = lieInfo(lie).carryMult;
  const byLong = [...cand].sort((a, b) => clubDist(b) - clubDist(a));
  for (const c of byLong) {
    // FLIGHT carry (GS-carry-rollout-split): the ball must fly past the far bank in the AIR, so scale
    // the reach by the club's flight fraction — a club whose TOTAL clears but whose landing drops into
    // the hazard is not a carry club.
    const carry = clubDist(c) * flightCarryScale(c.id, clubDist(c)) * carryMult * lieM;
    if (carry < fc.carry) continue; // doesn't reach past the far bank → would drop into the hazard
    const land: Vec = [ball[0] + ux * carry, ball[1] + uy * carry];
    if (lieInfo(lieAt(hole, land)).penalty) continue; // overshoots into another penalty → try shorter
    return c;
  }
  return null;
}

/** Auto putt-out from a position (exported for the interactive driver). */
export function puttOutFrom(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  maxPutts = 6,
  skill: PuttSkill = {},
): { putts: number; log: PuttLog[]; holed: boolean } {
  return puttOut(rng, from, pinPt, maxPutts, skill);
}

/** True if the straight line from→to is free of penalty surfaces (sampled). */
function clearLine(hole: Hole, from: Vec, to: Vec): boolean {
  const steps = 20;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p: Vec = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    if (lieInfo(lieAt(hole, p)).penalty) return false;
  }
  return true;
}

/** A point a fraction `t` (by arc length) along an N-point polyline (GS-shapes). */
function pointAlong(line: Vec[], t: number): Vec {
  if (line.length === 1) return line[0]!;
  const total = pathLength(line);
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++) {
    const segLen = dist(line[i - 1]!, line[i]!);
    if (want <= segLen || i === line.length - 1) {
      const u = segLen ? want / segLen : 0;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    }
    want -= segLen;
  }
  return line[line.length - 1]!;
}

/** Fraction along the centreline nearest the ball (sampled) — the ball's progress down the hole. */
function nearestCentrelineT(hole: Hole, ball: Vec): number {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const d = dist(pointAlong(hole.centreline, t), ball);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return bestT;
}

// --- Ship-corridor containment (GS-ship-corridor-contain) ------------------------------------------
// The derelict's bulkheads are IMPASSABLE, so the walled corridor must never LOSE a ball to space by
// letting it slip sideways off a solid stretch of hull deck — the invariant "a sideways miss ricochets
// back, never lost". The per-segment wall collision (`wallFlightHit` + the pinball roll-out) can't
// guarantee that on the zigzagging, hull-broken corridor: the curved flight banana and the run-out both
// reach off-deck spots through the HARD-CORNER openings between adjacent wall rails and past the ends of
// the wall chain (measured: ~25% of full-power derelict drives were lost to space DESPITE the walls, most
// resting within a few yards of the deck edge). The pre-built wall SEGMENTS simply don't form a closed
// fence around a corridor that bends this hard. So here the DECK the renderer draws is treated as the real
// bulkhead (graphic ≡ physics): detect a ball that has left the SOLID deck and ricochet / pull it straight
// back on. A rest in a genuine torn-hull GAP (the centreline itself is off the deck there — a sanctioned
// FORWARD carry between hull sections) is left lost. Pure geometry, ZERO rng, gated on `hole.walls`, and it
// only ever moves a ball ONTO the deck — every non-derelict world is byte-for-byte unchanged and Stableford
// can only rise (contract 4). See docs/decisions/sim-generator.md (GS-ship-walls / GS-ship-corridor-contain).
const CONTAIN_STEP = 2; // yards per inward probe step when walking a lost ball back onto the deck
const CONTAIN_MARGIN = 4; // extra yards past the recovered deck edge so the ball rests clear of the razor edge
/**
 * How far off the nearest DRAWN bulkhead a lost ball may sit and still be tucked back onto the deck
 * (GS-ship-space-boundary). The whole containment promise is "graphic IS physics": a ball is held in by
 * a bulkhead you can SEE. A ball only a few yards past the hull edge is caught by the wall (well within
 * this margin — it covers the drawn +14 yd dead-hull dilation and the small hard-corner NOTCHES between
 * rail ends where balls used to leak). But a ball flung FAR out into open space — beyond any bulkhead,
 * through a torn-hull gap opening or clean past the wall ends — has NOTHING to bounce off, so it flies
 * FREE (stays lost), instead of being reeled back onto the fairway by an invisible "far space boundary".
 * Measured: derelict drives were reaching 40–175 yd off the nearest wall out in the void and getting
 * pulled back; 22 yd cleanly separates a real near-edge miss (contain) from a genuine space excursion (lose).
 */
const CONTAIN_MAX_WALL_DIST = 22;

/** Distance (yards) from `p` to the nearest DRAWN bulkhead segment, or Infinity if the hole has no walls. */
function nearestWallDist(hole: Hole, p: Vec): number {
  const walls = hole.walls;
  if (!walls || !walls.length) return Infinity;
  let best = Infinity;
  for (const w of walls) {
    const d = segDist(p, w.a, w.b);
    if (d < best) best = d;
  }
  return best;
}

/** A lie in which the ball is LOST TO SPACE off the hull (`shiprough`/void-rough), NEVER an on-deck
 *  hazard like a `breach` — a breach is a deliberate penalty and must stay lost. */
function isLostToSpace(lie: FeatureKind): boolean {
  return lie !== 'breach' && lieInfo(lie).penalty === 'voidlost';
}

/** The centreline point nearest `p`, found on a FINE sample (own local search — never touches the
 *  coarser `nearestCentrelineT` the AI reads, so no seeded path shifts). */
function nearestCentrePoint(hole: Hole, p: Vec): Vec {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const d = dist(pointAlong(hole.centreline, t), p);
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return pointAlong(hole.centreline, bestT);
}

/** The corridor is SOLID at `p`'s station iff the centreline point nearest `p` is itself on the deck
 *  (a torn-hull gap has an off-deck centreline). */
function corridorSolidAt(hole: Hole, p: Vec): boolean {
  return !isLostToSpace(lieAt(hole, nearestCentrePoint(hole, p)));
}

/** The nearest centreline point to `p` that is ON the hull deck (not lost-to-space) — the corridor's safe
 *  spine. Used to land a caddy-guard save on the actual deck when the guard's bearing-line recentre falls
 *  into space on a bending ship corridor (GS-ship-wall-caddy). null if the whole centreline is off-deck
 *  (never, in practice — a corridor always has solid stations). Pure, zero rng. */
function nearestSolidCentre(hole: Hole, p: Vec): Vec | null {
  let best: Vec | null = null;
  let bestD = Infinity;
  for (let i = 0; i <= 200; i++) {
    const q = pointAlong(hole.centreline, i / 200);
    if (isLostToSpace(lieAt(hole, q))) continue;
    const d = dist(q, p);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

/** Minimum inward component every ricochet must carry (sin ~17°). A pure reflection off a bulkhead the ball
 *  meets at a GRAZING angle barely changes direction, so it re-clips the same wall a step later and again —
 *  a machine-gun bounce loop that burns the bounce cap and reads as jitter, not a carom. Forcing each bounce
 *  to turn at least this far back toward the corridor spine makes it a crisp, decisive ricochet. */
const WALL_MIN_INWARD = 0.3;

/** The inward ricochet direction at `at` for a ball travelling `travel` into the hull edge: reflect it off
 *  the nearest DRAWN wall (so the bounce angle matches the bulkhead the renderer shows), then guarantee the
 *  ricochet makes real inward progress toward the corridor spine (`WALL_MIN_INWARD`) — a grazing reflection
 *  is bent back toward the centreline so it can't re-graze the same wall into a bounce loop, and a reflection
 *  that would still point off the deck falls all the way back to straight-at-the-spine. So a ricochet ALWAYS
 *  comes back onto the deck, decisively. Returns the dir + the struck wall. */
function inwardReflect(hole: Hole, at: Vec, travel: Vec): { dir: Vec; wall: ShipWall | null } {
  const walls = hole.walls ?? [];
  let bw: ShipWall | null = null;
  let bd = Infinity;
  for (const w of walls) {
    const d = segDist(at, w.a, w.b);
    if (d < bd) {
      bd = d;
      bw = w;
    }
  }
  let dir = bw ? wallReflect(bw.normal, travel) : travel;
  const c = nearestCentrePoint(hole, at);
  const tl = Math.hypot(c[0] - at[0], c[1] - at[1]) || 1;
  const toC: Vec = [(c[0] - at[0]) / tl, (c[1] - at[1]) / tl];
  if (dir[0] * toC[0] + dir[1] * toC[1] < WALL_MIN_INWARD) {
    // Grazing / off-deck reflection → blend toward the spine so the carom turns decisively inward.
    const blended: Vec = [dir[0] + toC[0], dir[1] + toC[1]];
    const bl = Math.hypot(blended[0], blended[1]) || 1;
    dir = [blended[0] / bl, blended[1] / bl];
    if (dir[0] * toC[0] + dir[1] * toC[1] < WALL_MIN_INWARD) dir = toC; // still too shallow → head for the spine
  }
  return { dir, wall: bw };
}

/** The first point a STRAIGHT segment `a→b` leaves the hull deck (lost-to-space) at a SOLID station — the
 *  bulkhead it clangs off. Returns the last on-deck point + the inward-reflected direction + the struck
 *  wall, or null if the segment stays on the deck OR only departs at a non-solid station (a sanctioned
 *  forward carry over a torn-hull gap — flown clean). The step count scales with the segment length so a
 *  long drive resolves the wall to ~3 yd. Pure, zero rng. */
function firstSolidDeparture(hole: Hole, a: Vec, b: Vec): { prev: Vec; dir: Vec; wall: ShipWall } | null {
  const walls = hole.walls;
  if (!walls || !walls.length) return null;
  const len = dist(a, b);
  const steps = Math.min(240, Math.max(24, Math.ceil(len / 3)));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let prev = a;
  let prevLost = isLostToSpace(lieAt(hole, a));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pos: Vec = [a[0] + dx * t, a[1] + dy * t];
    const lost = isLostToSpace(lieAt(hole, pos));
    // Only ricochet off a DRAWN bulkhead (GS-ship-space-boundary): a departure at a torn-hull gap opening
    // (walls removed for that span) or clean past the wall ends has no bulkhead to bounce off, so the ball
    // flies FREE through the opening rather than caroming off an invisible boundary out in space.
    if (lost && !prevLost && corridorSolidAt(hole, pos) && nearestWallDist(hole, prev) <= CONTAIN_MAX_WALL_DIST) {
      const l = Math.hypot(pos[0] - prev[0], pos[1] - prev[1]) || 1;
      const travel: Vec = [(pos[0] - prev[0]) / l, (pos[1] - prev[1]) / l];
      const { dir, wall } = inwardReflect(hole, prev, travel);
      return { prev, dir, wall: wall ?? walls[0]! };
    }
    prev = pos;
    prevLost = lost;
  }
  return null;
}

export interface ShipFlight {
  /** The flight polyline: tee → each bulkhead ricochet → airborne landing (straight segments). */
  path: Vec[];
  /** The airborne landing (path end). */
  landing: Vec;
  /** The final travel direction (unit) — the roll-out runs on along it. */
  dir: Vec;
  /** How many bulkheads the flight cracked off. */
  bounces: number;
  /** The first bounce (impact point + final dir), for the sfx/shake + `wallHit` log. null if it flew clean. */
  firstHit: WallHit | null;
}

/**
 * Ship-corridor PINBALL flight (GS-ship-pinball-flight) — the derelict's signature bounce, done for FEEL.
 * The ball flies a STRAIGHT line along its resolved shot line and RICOCHETS crisply off the drawn hull-deck
 * edge (the bulkhead), caroming on down the metal hallway — a spaceship corridor, NOT the parkland fade/hook
 * banana that used to curve into the wall then die. It reuses the exact deck-boundary of `flightWallBounce`
 * (reflect at the first SOLID-station departure) but CONTINUES the flight after each bounce, spending the
 * remaining carry along the reflected line, up to `maxBounces` (a runaway guard on a pathological near-parallel
 * skim). A forward torn-hull GAP is a non-solid station, so a sanctioned carry over a star-gap flies clean and
 * is left to the lost/backstop logic. Pure geometry, ZERO rng, derelict-only (gated on `hole.walls`) — every
 * other world never enters here, so it's byte-for-byte irrelevant there (contracts 1 & 2). It only ever keeps
 * a ball that would else be lost ON the deck, so Stableford can only rise (contract 4).
 */
function shipFlightPath(hole: Hole, from: Vec, landing0: Vec, maxBounces = 8): ShipFlight {
  const path: Vec[] = [from];
  let pos = from;
  const total = Math.hypot(landing0[0] - from[0], landing0[1] - from[1]);
  let dir: Vec = total > 1e-6 ? [(landing0[0] - from[0]) / total, (landing0[1] - from[1]) / total] : [0, 1];
  let remaining = total;
  let bounces = 0;
  let flown = 0;
  let firstHit: WallHit | null = null;
  while (remaining > 1 && bounces < maxBounces) {
    const end: Vec = [pos[0] + dir[0] * remaining, pos[1] + dir[1] * remaining];
    const dep = firstSolidDeparture(hole, pos, end);
    if (!dep) {
      path.push(end);
      pos = end;
      remaining = 0;
      break;
    }
    const seg = dist(pos, dep.prev);
    path.push(dep.prev);
    flown += seg;
    remaining -= seg;
    bounces++;
    if (!firstHit) firstHit = { wall: dep.wall, point: dep.prev, dir: dep.dir, carry: flown, t: 0, bounces };
    dir = dep.dir;
    // Resume from the bounce vertex nudged a hair INWARD along the ricochet, so the next march starts clear
    // of the deck edge and can't re-detect the same crossing at step 1 (a zero-progress bounce loop).
    pos = [dep.prev[0] + dir[0] * 0.75, dep.prev[1] + dir[1] * 0.75];
    remaining -= 0.75;
  }
  // Clean finish → landed at `end`. Bounce cap hit → LAND at the last on-deck ricochet, never extend straight
  // (that would fly a spent, ping-ponging ball off into space — the ball dies in the corridor, contained).
  const landing = path[path.length - 1]!;
  return { path, landing, dir, bounces, firstHit: firstHit ? { ...firstHit, bounces } : null };
}

/** Pull an off-hull rest point back onto the nearest deck (stepping toward the centreline), or null if
 *  `p` is already on the deck / in a real hazard / in a sanctioned torn-hull gap. The wall-SAVE guarantee:
 *  after every shot on a walled hole this backstops any escape the ricochet maths missed. */
export function containToDeck(hole: Hole, p: Vec): Vec | null {
  if (!isLostToSpace(lieAt(hole, p))) return null; // on the deck, or in a real hazard → nothing to save
  // No bulkhead within reach → the ball is out in open space (through a torn-hull gap opening or past the
  // wall ends), so it flies FREE, never reeled back by an invisible boundary (GS-ship-space-boundary).
  if (nearestWallDist(hole, p) > CONTAIN_MAX_WALL_DIST) return null;
  const c = nearestCentrePoint(hole, p);
  if (isLostToSpace(lieAt(hole, c))) return null; // corridor broken here → a sanctioned carry, stays lost
  const dx = c[0] - p[0];
  const dy = c[1] - p[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const onDeck = (q: Vec): boolean => {
    const lk = lieAt(hole, q);
    return !isLostToSpace(lk) && !lieInfo(lk).penalty;
  };
  for (let d = CONTAIN_STEP; d <= L; d += CONTAIN_STEP) {
    const q: Vec = [p[0] + ux * d, p[1] + uy * d];
    if (!onDeck(q)) continue;
    // Seat it a margin deeper toward the centre so it never rests on the razor edge — but the corridor
    // can hold a THIN sliver of space between two deck patches (a `waste` plate beside the fairway), so
    // the deeper point is re-validated: if the margin push would cross back into space, seat at the deck
    // point we actually reached. Guarantees the returned point is genuinely ON the deck.
    const extra = Math.min(CONTAIN_MARGIN, L - d);
    const deep: Vec = [q[0] + ux * extra, q[1] + uy * extra];
    return onDeck(deep) ? deep : q;
  }
  return c;
}

/**
 * The first PENALTY band the centreline itself crosses ahead of the ball — a lava river / creek
 * spanning the corridor (GS-19). Returns the entry/exit fractions, or null if the centreline is
 * penalty-free ahead (the normal case, and every void hole — its centreline is on the island).
 */
function firstCentrelineCrossing(hole: Hole, fromT: number): { nearT: number; farT: number } | null {
  const STEPS = 120;
  let nearT: number | null = null;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    if (t <= fromT + 1e-6) continue;
    const pen = !!lieInfo(lieAt(hole, pointAlong(hole.centreline, t))).penalty;
    if (pen && nearT === null) nearT = t;
    if (!pen && nearT !== null) return { nearT, farT: t };
  }
  if (nearT !== null) return { nearT, farT: 1 };
  return null;
}

/**
 * Choose where to aim. The pin if the line is clear; if a lava RIVER crosses the centreline
 * ahead, either CARRY it (aim at the furthest penalty-free point past the far bank that's within
 * reach — flying over a hazard is fair) or, if it's too far to clear in one, lay up SHORT of the
 * near bank; otherwise (a side hazard clipping the chord) lay up onto the penalty-free centreline.
 */
function safeTarget(hole: Hole, ball: Vec, pinPt: Vec, maxReach: number, maxFlightReach: number = maxReach): Vec {
  if (clearLine(hole, ball, pinPt)) return widthLayupTarget(hole, ball, pinPt, maxReach) ?? pinPt;
  const t0 = nearestCentrelineT(hole, ball);
  const cross = firstCentrelineCrossing(hole, t0);
  if (cross) {
    // A forced CARRY must clear the hazard in the AIR — key it off the bag's FLIGHT reach (the split
    // lands the ball short of its total, so the run can't be counted on to span water/lava/void).
    const carry = carryTarget(hole, ball, pinPt, cross, maxFlightReach);
    if (carry) return carry;
    return layupShortTarget(hole, cross, t0);
  }
  // Side hazard → advance along the (penalty-free) centreline toward the green.
  return pointAlong(hole.centreline, Math.min(1, t0 + 0.2));
}

// --- Width-aware positioning (GS-fairway-width-2) --------------------------------
// The auto AI reads the corridor's WIDTH PROFILE the generator drew (chute/neck/hourglass/wander/…)
// the way a real player does: a full bomb that would come down in a NARROW pinch (an hourglass
// waist, a wander strait) is a wasted stroke of position — a shorter club that lands in the WIDE
// bay just short of the pinch holds the fairway, and with the rough-gradient's punishing off-fairway
// lies that clean lie is worth more than the yards it gives up. So on an out-of-reach POSITIONING
// drive down a clean (penalty-free) line, if the natural landing sits in a genuine pinch and a
// meaningfully wider landing zone lies within a modest lay-up short of it, aim there instead. This
// is pure geometry (no rng) applied inside the shared `safeTarget`, so the headless sim and the
// interactive "safe"/auto-finish line stay byte-for-byte in step (contract 2), and it never fires on
// a reachable approach (that's green-coverage's job) or a lost-rough island (its clean line to the
// green is never penalty-free — the abyss keeps `clearLine` false — so width IS survival, untouched).
const WIDTH_LAYUP = {
  /** Fraction of `maxReach` a full positioning drive is expected to actually carry (mean, a touch
   *  short of nominal — long clubs sit ~0.9× and lose a little more to the angled-miss cosθ). */
  meanLandFrac: 0.88,
  /** How far short of the natural landing the AI will look for a wider bay (yards). */
  layupYards: 34,
  /** A candidate bay must be at least this much wider than the natural landing to be worth the
   *  lay-up — so the AI only pulls back for a GENUINE pinch, not a few yards of ordinary taper. */
  widenFactor: 1.35,
  /** Don't bother pinch-avoiding unless the natural landing is genuinely tight (half-width yards);
   *  a landing already this wide holds a sensible drive, so bombing on is correct (byte-identical).
   *  Deliberately LOW: a corridor this tight only occurs at high wildness (the driving zone shrinks
   *  with the `widthScale` ramp), so the lay-up fires on the brutal deep stops it helps and stays
   *  quiet on the wide calm/mid corridors where trading distance for a marginally-wider bay would
   *  LOSE strokes — measured on mean per-stop Stableford (contract 4: the change RAISES it, +0.01/stop
   *  on the default bag, and improves the max-wildness toPar bar 0.78 → 0.77). */
  pinchHalfWidth: 10,
  /** Cap on the measured corridor half-width — beyond this a "bay" is effectively open (a gap in the
   *  fairway / off the poly), so it doesn't count as a target to lay up to. */
  wideCap: 60,
} as const;

/**
 * Width-aware lay-up (GS-fairway-width-2): returns a penalty-free centreline point SHORT of a
 * driving-zone pinch when laying up to a wider bay is the better position, else null (bomb on).
 * Pure — measures the corridor the generator actually drew, adds no rng.
 */
function widthLayupTarget(hole: Hole, ball: Vec, pinPt: Vec, maxReach: number): Vec | null {
  // Only POSITIONING drives: if the green is reachable this is an approach — leave the club to the
  // green-coverage suggester and keep the shot byte-identical.
  if (maxReach <= 0 || dist(ball, pinPt) <= maxReach) return null;
  const t0 = nearestCentrelineT(hole, ball);
  const meanReach = maxReach * WIDTH_LAYUP.meanLandFrac;
  const tNat = stationAtDistance(hole, ball, t0, meanReach);
  if (tNat <= t0 + 1e-3) return null;
  const wNat = corridorHalfWidthAt(hole, tNat);
  // A comfortably wide natural landing → bomb on (no pinch to dodge).
  if (wNat >= WIDTH_LAYUP.pinchHalfWidth) return null;
  const minT = stationAtDistance(hole, ball, t0, meanReach - WIDTH_LAYUP.layupYards);
  let bestT: number | null = null;
  let bestW = wNat * WIDTH_LAYUP.widenFactor;
  const STEPS = 8;
  for (let i = 1; i <= STEPS; i++) {
    const t = tNat + ((minT - tNat) * i) / STEPS;
    if (t <= t0 + 1e-3) break;
    const w = corridorHalfWidthAt(hole, t);
    // A reading AT the cap means the station is off-fairway (a broken-corridor gap), never a real bay.
    if (w > bestW && w < WIDTH_LAYUP.wideCap) {
      bestW = w;
      bestT = t;
    }
  }
  return bestT === null ? null : pointAlong(hole.centreline, bestT);
}

/** The centreline fraction (≥ t0) whose point is ~`targetDist` yards from the ball, walking forward
 *  toward the green. Clamped to [t0, 1]. Pure. */
function stationAtDistance(hole: Hole, ball: Vec, t0: number, targetDist: number): number {
  if (targetDist <= 0) return t0;
  const STEPS = 60;
  for (let i = 1; i <= STEPS; i++) {
    const t = t0 + ((1 - t0) * i) / STEPS;
    if (dist(ball, pointAlong(hole.centreline, t)) >= targetDist) return t;
  }
  return 1;
}

/**
 * Half-width (yards) of the fairway corridor at centreline fraction `t` — the tighter of the two
 * perpendicular distances from the centreline to the fairway polygon's edge, i.e. how far a shot can
 * miss to the closer side and still hold the short grass. Measures the polygon the generator drew
 * (so it can never drift from the ribbon), returns the wide cap when the centreline point sits off
 * the fairway (a broken-corridor gap) so such a station never reads as a lay-up bay. Pure.
 */
export function corridorHalfWidthAt(hole: Hole, t: number): number {
  const fw = hole.features.find((f) => f.kind === 'fairway');
  if (!fw || fw.poly.length < 3) return WIDTH_LAYUP.wideCap;
  const c = pointAlong(hole.centreline, t);
  const a = pointAlong(hole.centreline, Math.max(0, t - 0.03));
  const b = pointAlong(hole.centreline, Math.min(1, t + 0.03));
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const perp: Vec = [dy, -dx]; // right-perpendicular unit
  const right = rayEdgeDist(c, perp, fw.poly);
  const left = rayEdgeDist(c, [-perp[0], -perp[1]], fw.poly);
  return Math.min(right, left, WIDTH_LAYUP.wideCap);
}

/** Distance from `o` along unit ray `d` to the first crossing of the closed polygon's edges
 *  (WIDTH_LAYUP.wideCap if none within it). Pure. */
function rayEdgeDist(o: Vec, d: Vec, poly: Vec[]): number {
  let best: number = WIDTH_LAYUP.wideCap;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const sx = b[0] - a[0];
    const sy = b[1] - a[1];
    const denom = d[0] * sy - d[1] * sx;
    if (Math.abs(denom) < 1e-9) continue; // parallel
    const qpx = a[0] - o[0];
    const qpy = a[1] - o[1];
    const tRay = (qpx * sy - qpy * sx) / denom; // distance along the ray (|d| = 1)
    const uSeg = (qpx * d[1] - qpy * d[0]) / denom;
    if (tRay > 1e-6 && tRay < best && uSeg >= 0 && uSeg <= 1) best = tRay;
  }
  return best;
}

/** Push a fraction `t` further along the centreline by ~`yards` (toward the green). */
function advanceAlong(hole: Hole, t: number, yards: number): number {
  const total = pathLength(hole.centreline) || 1;
  return Math.min(1, t + yards / total);
}

/**
 * Aim to CARRY a river: the furthest penalty-free centreline point past the far bank that the
 * bag can reach (so a played shot flies over the molten band and lands on the fairway beyond).
 * Returns null when even just-past-the-bank is out of reach — then the AI lays up short instead.
 */
function carryTarget(
  hole: Hole,
  ball: Vec,
  pinPt: Vec,
  cross: { nearT: number; farT: number },
  maxFlightReach: number,
): Vec | null {
  // `maxFlightReach` is the bag's FLIGHT reach (GS-carry-rollout-split) — the ball must fly PAST the
  // far bank, the run can't be counted on to span the hazard. Small safety so the MEAN shot clears.
  const reach = maxFlightReach * 0.97;
  // The nearest safe landing past the far bank (a margin clear of the lava).
  const landT = advanceAlong(hole, cross.farT, 10);
  const mustReach = pointAlong(hole.centreline, landT);
  if (dist(ball, mustReach) > reach) return null; // can't clear it yet
  // The green itself, if it's past the river and reachable, is the best carry.
  if (dist(ball, pinPt) <= reach) return pinPt;
  // Otherwise the furthest reachable, penalty-free centreline point beyond the far bank.
  for (let i = 40; i >= 0; i--) {
    const t = landT + ((1 - landT) * i) / 40;
    const p = pointAlong(hole.centreline, t);
    if (dist(ball, p) <= reach && !lieInfo(lieAt(hole, p)).penalty) return p;
  }
  return mustReach;
}

/** Lay up SHORT of a river's near bank: a penalty-free centreline point a margin before it,
 *  never aimed behind the ball (so a ball already at the bank just nudges up to set the carry). */
function layupShortTarget(hole: Hole, cross: { nearT: number; farT: number }, t0: number): Vec {
  const total = pathLength(hole.centreline) || 1;
  const margin = 14 / total; // ~14 yds short of the near bank
  let t = Math.max(t0, cross.nearT - margin);
  // Back off if the chosen point somehow still reads as penalty (thin safe shelf).
  for (let i = 0; i < 8 && lieInfo(lieAt(hole, pointAlong(hole.centreline, t))).penalty; i++) {
    t = Math.max(t0, t - margin);
  }
  return pointAlong(hole.centreline, t);
}

/**
 * Offset the aim point upwind so the expected crosswind drift lands the ball on target.
 * `carry` is the effective (gravity-scaled) carry the shot is expected to fly.
 */
function aimWithWind(
  from: Vec,
  target: Vec,
  wind: Hole['wind'],
  shotBearingDeg: number,
  carry: number,
  windResist = 0,
): Vec {
  if (!wind) return target;
  const { cross } = playWind(wind, shotBearingDeg);
  // Reduced weather impact (GS-proshop-2): the ball drifts LESS in wind, so the upwind compensation
  // shrinks by the SAME factor resolveShot scales the actual push — keeping aim consistent. 0 = full.
  const wr = 1 - Math.max(0, Math.min(1, windResist));
  const drift = cross * TUNABLES.windLateralPerMph * wr; // +drift pushes to the shot's right
  if (drift === 0) return target;
  // Right-perpendicular of the shot bearing (matches resolveShot's lateral convention).
  const br = (shotBearingDeg * Math.PI) / 180;
  const fx = Math.sin(br);
  const fy = Math.cos(br);
  const rx = fy;
  const ry = -fx;
  // Aim opposite the drift, scaled to the fraction of the carry this shot covers.
  const frac = carry > 0 ? Math.min(1, Math.hypot(target[0] - from[0], target[1] - from[1]) / carry) : 1;
  const comp = -drift * frac;
  return [target[0] + rx * comp, target[1] + ry * comp];
}

// Local copy of the up-screen bearing in degrees (avoids importing for one call site).
function bearingDeg(from: Vec, to: Vec): number {
  const deg = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}
