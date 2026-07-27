/**
 * Ball-flight GEOMETRY — the single, pure source of truth for the curved flight path, the
 * loft-scaled arc height, and the aerial obstacle (tree) knockdown collision. Shared by the
 * SIM (executeShot decides where the ball actually goes) and the RENDERER (draws the same
 * curved arc), so the graphic IS the physics: a ball drawn clearing a tree is a ball the sim
 * let through, and a ball drawn clipping one is a ball the sim knocked down.
 *
 * Pure & headless: no DOM, no time, no rng. Everything here is a deterministic function of the
 * shot's resolved endpoints, so it's unit-tested and reproducible.
 *
 * Two ideas:
 *  1. The flight LAUNCHES along the shot bearing (the aim line) and CURVES to the actual landing
 *     — a quadratic Bézier whose control point sits straight ahead at full carry. A straight shot
 *     barely bows; a fade/slice/hook bows toward where it finishes, so the ball reads as starting
 *     on line and curving away (the banana). The lateral offset of the landing is already baked in
 *     by `resolveShot`'s angular spray; this just shapes the PATH between launch and that landing.
 *  2. The ARC HEIGHT is a real ball-flight PROFILE, measured against the GROUND the ball has covered
 *     (GS-flight-shape): a near-straight lift-supported climb to an apex at `apexAt` of the carry,
 *     then a steepening fall that arrives at a genuine descent angle. Every number in it is a real
 *     golf number — launch angle, apex height, descent angle — and they are tied together rather
 *     than declared independently (see `ARC_FEEL` / `FlightProfile` below), so a family cannot be
 *     given a launch angle its apex contradicts. Tall obstacles (trees) have a canopy height; if the
 *     ball's arc height where it crosses a tree is BELOW that canopy it's knocked down INTO the tree
 *     (a tough non-penalty lie), so arc height genuinely matters — a high wedge drops over a
 *     guarding tree a low runner clips, and the SAME grove blocks a driver line while a 7-iron
 *     sails it.
 *
 * HEIGHT IS A FUNCTION OF GROUND COVERED, NEVER OF THE CURVE'S PARAMETER (GS-flight-shape). The
 * ground path is a quadratic Bézier and its forward progress at parameter `t` is `2t − t²` — fast
 * early, and STOPPING DEAD at t=1. Height used to be evaluated at `t` as well, so over the last few
 * percent of ground the parameter still had a third of its range left to spend and the ball fell
 * out of the sky on a vertical tangent: measured on a drive, the arc lost 6.9yd of height over the
 * 69yd from its apex to 90% of the carry and then the remaining 16.6yd over the last 23yd. A long
 * flat glide, then a plummet — "it looks buggy as heck, not like a real ball flight", and the reason
 * the run-out had to measure its descent over a closing TENTH to dodge the artefact. Sampling height
 * at the GROUND fraction removes it at the root: the drawn shape IS the height-vs-distance profile,
 * and its terminal slope is exactly the family's descent angle (`arrivalAngleDeg`).
 */

import type { Hole, Vec } from './course/contract';
import { pointInPoly, segDist } from './course/contract';

// --- Arc height --------------------------------------------------------------
/**
 * The GLOBAL half of the flight model — the loft ramp every club is read off, plus the one
 * aerodynamic constant that turns a launch angle into an apex.
 *
 * A club's LAUNCH ANGLE is a function of its loft, and in a bag whose only loft signal is the
 * distance on the sole, distance IS loft: the ramp runs from `launchLongDeg` at `flatCarry` (the
 * driver) to `launchShortDeg` at `loftCarry` (the shortest wedge), and each family trims it
 * (`FlightProfile.launchTrimDeg`). The real ladder — driver ~11°, mid iron ~16°, wedge ~25° — falls
 * straight out, and a club BETWEEN two rows (a 4-iron, a 60° wedge) is placed by its own number
 * without an engine edit, which is the whole point of the convention.
 *
 * THE RAMP IS CURVED, AND A STRAIGHT ONE PUT THE BAG'S HIGHEST BALL FLIGHT ON THE HYBRIDS. Real
 * launch angle barely moves across the long clubs (driver 10.4° → 3-iron 10.4° on tour) and then
 * climbs hard through the short irons into the wedges; a linear ramp instead spends a third of its
 * range between the driver and the hybrids, handing a 181yd 3-hybrid a 17° launch and a 35yd apex —
 * higher than the driver, which no bag does. `loftCurve` bends it (`(1−t)^loftCurve`) so the long
 * end stays flat and the loft arrives where the loft actually is.
 *
 * `liftGain` is the one piece of aerodynamics we model, and it is what makes the numbers hang
 * together. A drag-free projectile launched at θ peaks at `tan(θ)/4` of its range — the same
 * relation the run-out's bounce uses (`apexOverLenFor`). A real golf ball flies much higher than
 * that for its launch, because backspin generates lift that holds it up: measured against tour
 * numbers the inflation is remarkably steady across the bag (driver 31.7yd apex on 275yd carry is
 * 2.36× the drag-free 0.0486, a pitching wedge 29.6 on 136 is 2.33×), so ONE constant carries it.
 * Apex is therefore never declared — it is DERIVED, `carry · tan(launch)/4 · liftGain`, which is why
 * a family cannot be handed a launch angle and an apex that disagree.
 */
export interface ArcFeel {
  /** Launch angle (degrees) of a club at/above `flatCarry` — the driver. */
  launchLongDeg: number;
  /** Launch angle (degrees) of a club at/below `loftCarry` — the shortest wedge. */
  launchShortDeg: number;
  /** Carry at/below which a club launches at `launchShortDeg`. */
  loftCarry: number;
  /** Carry at/above which a club launches at `launchLongDeg`. */
  flatCarry: number;
  /** Curvature of the ramp between them. 1 = linear; >1 keeps the long clubs flat and puts the rise
   *  into the scoring clubs, which is the shape real launch data has. */
  loftCurve: number;
  /** How much higher backspin lift carries the ball than a drag-free projectile off the same tee. */
  liftGain: number;
  /** Floor / ceiling on the apex (yards). */
  peakMin: number;
  peakMax: number;
}

export const ARC_FEEL: ArcFeel = {
  launchLongDeg: 11,
  launchShortDeg: 27,
  loftCarry: 40,
  flatCarry: 250,
  loftCurve: 1.6,
  liftGain: 2.35,
  peakMin: 4,
  peakMax: 60,
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const DEG = Math.PI / 180;

// --- Per-family flight profiles (GS-flight-3) ---------------------------------
/** Club FAMILY for flight purposes — the same id convention the audio strike voices use
 *  (`CLUBS` taxonomy: 'D' the driver, `*W` woods, `*H` hybrids, `*i` irons, the putter itself;
 *  everything else — PW/GW/SW/60/64/chip — is wedge-family). Convention-based on purpose: a NEW
 *  club row picks up a sensible flight (and strike voice) with zero engine edits. */
export type FlightClass = 'driver' | 'wood' | 'hybrid' | 'ironLong' | 'ironShort' | 'wedge' | 'putter';

/** Irons split at this NUMBER: 4-6 are the long/mid irons, 7 and up the short ones. The boundary is
 *  the one real golf uses (GS-carry-roll-real) — a 6-iron releases, a 7-iron checks. Convention-based
 *  like the rest of `flightClassOf`, so a new `4i` row picks up the long-iron flight with no edits. */
export const LONG_IRON_MAX = 6;

export function flightClassOf(clubId?: string): FlightClass {
  // The neutral mid-bag flight when no club is known — a 7-iron, i.e. the SHORT-iron row.
  if (!clubId) return 'ironShort';
  if (clubId === 'D') return 'driver';
  if (clubId === 'putter') return 'putter';
  // Digit-prefixed families only: PW/GW/SW also end in 'W' but are wedges, not woods.
  if (/^\d+W$/.test(clubId)) return 'wood';
  if (/^\d+H$/.test(clubId)) return 'hybrid';
  const iron = /^(\d+)i$/.exec(clubId);
  if (iron) return Number(iron[1]) <= LONG_IRON_MAX ? 'ironLong' : 'ironShort';
  return 'wedge';
}

/** How a club family SHAPES its flight (GS-flight-3 / GS-flight-shape) — content-as-data, the hook
 *  future flight-shaping Pro-Shop gear mods (a piercing driver, a sky-high wedge) will scale.
 *
 *  Three shape levers, and NONE of them is the apex height: that is derived from the launch angle
 *  (`ARC_FEEL.liftGain`), so the rows below cannot describe a trajectory that doesn't close. */
export interface FlightProfile {
  /** Where the apex sits along the GROUND path, as a fraction of carry (0..1).
   *
   *  THE FLATTER CLUB PEAKS LATER, which is the opposite of the intuition this table used to
   *  encode. The rise ends at the apex with zero slope and the fall ends at touchdown at the
   *  descent angle, so the two legs split the ground in proportion to how shallow each is: a driver
   *  climbs at ~11° and drops at ~38°, so it spends two thirds of its carry going up (0.66); a
   *  wedge climbs at ~25° and drops at ~50°, so it is over the top by 0.56. Bounded by real
   *  geometry, not taste — `apexAt` must exceed `apex/(carry·tan(launch))` or the climb cannot be
   *  reached at that launch angle, and `arcShapeFor` turns it into the rise coefficient. */
  apexAt: number;
  /** How much steeper the ball comes DOWN than it went up: `tan(descent)/tan(launch)`. This is the
   *  drag signature of the family and the single number that most decides how the shot behaves on
   *  the ground — a driver arrives at 4× its launch angle and skips, a wedge at 2.7× and sits. */
  dropRatio: number;
  /** Family trim (degrees) on the global loft ramp's launch angle — the rescue-club identity
   *  (a hybrid launches higher than the wood it replaces) and the wedge's extra loft. */
  launchTrimDeg: number;
  /**
   * CARRY as a fraction of the club's TOTAL distance (GS-carry-rollout-split). A club's nominal
   * number is its TOTAL (carry + roll): the ball FLIES this fraction of it and RUNS the rest, so a
   * driver (0.80) lands ~80% of the way and releases the last ~20%, a hybrid 0.85, an iron 0.90.
   * The total is UNCHANGED (the flight is pulled back and the roll makes it up to the same spot) —
   * so where the ball ends is preserved, only the split between flight and run changes. Wedges and
   * the putter keep 1.0 (land and hold — the backspin-optin behaviour, byte-for-byte). Consumed by
   * `flightScaleFor` (the flight-reduction factor) and `rollFractionFor` (the run it releases).
   */
  carryFrac: number;
}

/**
 * The family table — every row a real reference trajectory (GS-flight-shape). Read off the loft
 * ramp with the trims below, the bag flies:
 *
 *     club   launch   apex    descent      club   launch   apex    descent
 *     D      11.0°    31yd    37.9°        7i     20.3°    28yd    49.9°
 *     3W     11.7°    32yd    38.6°        9i     21.7°    24yd    51.9°
 *     5H     19.5°    36yd    48.6°        PW     23.5°    27yd    49.5°
 *     3i     18.1°    27yd    48.0°        SW     25.9°    21yd    52.7°
 *     6i     19.2°    25yd    49.9°        64°    28.5°    13yd    55.7°
 *
 * — i.e. tour-shaped: a near-constant apex through the long and mid bag tapering off in the short
 * wedges, a descent angle climbing from the driver's 38° to the wedges' mid-50s, and every launch
 * angle inside a degree or two of the real club. Absolute heights land where the old hand-tuned
 * fractions already sat (canopies are 7–22y, so the tree game is preserved) — what changed is that
 * they are now CONSEQUENCES of the launch ramp rather than independent guesses, and the descent
 * angles finally differ enough per family to be felt on the ground.
 *
 * The putter row is the neutral arc for tap-length chips; it never really flies.
 */
export const FLIGHT_PROFILES: Record<FlightClass, FlightProfile> = {
  // GS-carry-roll-real: the carry/roll split is set from REAL golf, not from what the auto sim found
  // comfortable. Reference roll-out on a standard fairway/green — driver 15-30yd, woods and hybrids
  // 10-15, long/mid irons 5-10, short irons 2-5, wedges 0-3 — taken at its midpoint against the
  // club's carry, since a club's number here is its TOTAL. The old numbers had a driver releasing 25%
  // of its carry (62 yards) and a long iron 20% (31), which is not golf; and because the split is
  // total-preserving, over-rolling meant under-CARRYING — a 250yd driver flew 200.
  driver: { apexAt: 0.66, dropRatio: 4.0, launchTrimDeg: 0, carryFrac: 0.922 },
  wood: { apexAt: 0.65, dropRatio: 4.2, launchTrimDeg: -0.4, carryFrac: 0.945 },
  hybrid: { apexAt: 0.62, dropRatio: 3.9, launchTrimDeg: 1, carryFrac: 0.945 },
  ironLong: { apexAt: 0.63, dropRatio: 3.9, launchTrimDeg: 0, carryFrac: 0.959 },
  ironShort: { apexAt: 0.6, dropRatio: 3.7, launchTrimDeg: 0.5, carryFrac: 0.976 },
  wedge: { apexAt: 0.56, dropRatio: 3.2, launchTrimDeg: 2.5, carryFrac: 1.0 },
  putter: { apexAt: 0.55, dropRatio: 3.2, launchTrimDeg: 2.5, carryFrac: 1.0 },
};

/** The flight profile a club id flies with — the ONE lookup every consumer (sim resolve, knockdown
 *  walks, aim-overlay probe, play-view animation) shares, so they can never disagree. Pure. */
export function flightProfileOf(clubId?: string): FlightProfile {
  return FLIGHT_PROFILES[flightClassOf(clubId)];
}

// --- Carry / roll split (GS-carry-rollout-split) -----------------------------
/** Anchors for the PRE-SPLIT neutral roll curve (the loft-based run every club used to add on top of
 *  its carry). Kept so the split can be tuned to preserve the club's TOTAL distance. Mirror of the
 *  legacy `clubRollFraction` thresholds. */
const SPLIT_BACKSPIN_CARRY = 106;
const SPLIT_DRIVER_CARRY = 250;
const SPLIT_SHORTEST_CARRY = 38;
const clamp01f = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * The PRE-SPLIT neutral roll fraction (of carry) a club of the given nominal used to release: long
 * clubs ran out a lot (driver +18%), tapering through the irons to a soft stop at the wedges (PW +5%
 * → 0). Retained (GS-carry-rollout-split) purely as the ANCHOR that keeps the new split's TOTAL equal
 * to the old total: the flight is scaled by `carryFrac·(1+legacy)` and the run is `(1−carryFrac)/carryFrac`
 * of that reduced flight, so carry+roll lands exactly where the ball used to finish. Pure. */
export function legacyRollFraction(nominalCarry: number): number {
  if (nominalCarry >= SPLIT_BACKSPIN_CARRY) {
    const t = clamp01f((nominalCarry - SPLIT_BACKSPIN_CARRY) / (SPLIT_DRIVER_CARRY - SPLIT_BACKSPIN_CARRY));
    return 0.05 + (0.18 - 0.05) * t; // PW +5% → driver +18%
  }
  const t = clamp01f((SPLIT_BACKSPIN_CARRY - nominalCarry) / (SPLIT_BACKSPIN_CARRY - SPLIT_SHORTEST_CARRY));
  return 0.05 * (1 - t); // PW +5% → shortest wedge 0% (checks to a stop)
}

/**
 * Factor to scale a shot's intended FLIGHT (carry) by so it lands at `carryFrac` of the club's TOTAL
 * (GS-carry-rollout-split). Anchored on the legacy roll so the flight pulls back by exactly the run it
 * now releases — total distance preserved. Wedge/putter (carryFrac 1) return 1 (byte-for-byte flight).
 * Pure. */
export function flightScaleFor(profile: FlightProfile, nominalCarry: number): number {
  if (profile.carryFrac >= 1) return 1;
  return profile.carryFrac * (1 + legacyRollFraction(nominalCarry));
}

/** `flightScaleFor` keyed by club id. Pure. */
export function flightCarryScale(clubId: string | undefined, nominalCarry: number): number {
  return flightScaleFor(flightProfileOf(clubId), nominalCarry);
}

/**
 * The RUN a club releases as a fraction of its (reduced) flight carry (GS-carry-rollout-split) —
 * `(1−carryFrac)/carryFrac`, so flight + run = the club's total (driver flight 0.80 → run 0.25 of
 * flight = 0.20 of total; hybrid 0.176 ≈ 0.15 of total; iron 0.111 ≈ 0.10 of total). Wedge/putter keep
 * the legacy neutral roll (land-and-hold), so a spin build's backspin still layers on unchanged. Pure. */
export function rollFractionFor(profile: FlightProfile, nominalCarry: number): number {
  if (profile.carryFrac >= 1) return legacyRollFraction(nominalCarry);
  return (1 - profile.carryFrac) / profile.carryFrac;
}

/** `rollFractionFor` keyed by club id. Pure. */
export function clubRollFraction(clubId: string | undefined, nominalCarry: number): number {
  return rollFractionFor(flightProfileOf(clubId), nominalCarry);
}

/**
 * Where a club of `nominalCarry` FINISHES — its flight plus the run it releases (GS-carry-roll-real).
 * THE ENDPOINT IS THE THING THE SPLIT PRESERVES, AND THIS IS THE ONE PLACE THAT SAYS WHAT IT IS: a
 * club's number is NOT its total (the split is anchored on the legacy roll, so the ball finishes
 * `nominalCarry · (1 + legacyRollFraction)` — a 250-yard driver runs out to 295). A reach model that
 * used the bare number instead was silently a CARRY number, and `flightScaleFor` outgrew it the moment
 * `carryFrac` rose past `1/(1+legacyRoll)` = 0.847 — which is how a flight reach ended up LONGER than
 * the "total" reach it is supposed to sit inside. Built from `flightScaleFor` × `rollFractionFor` so
 * flight/total is exactly `carryFrac ≤ 1` by construction and the two can never invert again. Pure. */
export function totalReachFor(profile: FlightProfile, nominalCarry: number): number {
  return nominalCarry * flightScaleFor(profile, nominalCarry) * (1 + rollFractionFor(profile, nominalCarry));
}

/** `totalReachFor` keyed by club id. Pure. */
export function clubTotalReach(clubId: string | undefined, nominalCarry: number): number {
  return totalReachFor(flightProfileOf(clubId), nominalCarry);
}

/** The LAUNCH angle (degrees) a club of `nominalCarry` leaves the clubface at — the global loft ramp
 *  plus the family's trim. Distance is the bag's loft signal, so this is where "which club is it"
 *  becomes a physical number. Pure. */
export function launchAngleDeg(profile: FlightProfile, nominalCarry: number, feel: ArcFeel = ARC_FEEL): number {
  const t = clamp01((nominalCarry - feel.loftCarry) / (feel.flatCarry - feel.loftCarry));
  const loft = Math.pow(1 - t, Math.max(0.2, feel.loftCurve));
  return feel.launchLongDeg + (feel.launchShortDeg - feel.launchLongDeg) * loft + profile.launchTrimDeg;
}

/** The DESCENT angle (degrees) that same club touches down at — its launch steepened by the family's
 *  `dropRatio`. The nominal-carry twin of `arrivalAngleDeg` (which measures the angle off a resolved
 *  shot's own arc, apex clamps and all); the two agree wherever the apex is unclamped. Pure. */
export function descentAngleDeg(profile: FlightProfile, nominalCarry: number, feel: ArcFeel = ARC_FEEL): number {
  return Math.atan(Math.tan(launchAngleDeg(profile, nominalCarry, feel) * DEG) * profile.dropRatio) / DEG;
}

/** Apex height as a fraction of carry: the drag-free `tan(launch)/4` inflated by the lift a spinning
 *  ball generates (`ARC_FEEL.liftGain`). Pure. */
export function apexFractionOf(profile: FlightProfile, nominalCarry: number, feel: ArcFeel = ARC_FEEL): number {
  return (Math.tan(launchAngleDeg(profile, nominalCarry, feel) * DEG) / 4) * feel.liftGain;
}

/**
 * Aerial apex height (yards) for a shot of `carry`, flown by a club of `nominalCarry`. DERIVED from
 * the club's launch angle, never declared: lofted (short) clubs launch steeper and so peak higher
 * relative to carry, which is the lever that lets a high approach drop over a tree a flat one would
 * clip. Clamped to the game's readable band — a clamp scales the whole arc, it does not reshape it.
 * Pure.
 */
export function arcApex(
  carry: number,
  nominalCarry: number,
  feel: ArcFeel = ARC_FEEL,
  profile: FlightProfile = FLIGHT_PROFILES.ironShort,
): number {
  const frac = apexFractionOf(profile, nominalCarry, feel);
  return Math.max(feel.peakMin, Math.min(feel.peakMax, Math.abs(carry) * frac));
}

// --- The arc SHAPE (GS-flight-shape) -----------------------------------------
/**
 * A family's height-vs-ground profile, as the two cubic legs that draw it. Both coefficients are
 * DERIVED from the family row (`arcShapeFor`) — they are the shape the launch angle, apex height and
 * descent angle imply, not free numbers, so the three can never contradict each other.
 */
export interface ArcShape {
  /** Ground fraction of the apex (`FlightProfile.apexAt`). */
  apexAt: number;
  /** Rise leg: the launch slope as a multiple of the climb's AVERAGE slope. ~1 across the whole bag,
   *  which is the signature of a lift-supported climb — the ball goes up in very nearly a straight
   *  line and rounds over at the top, rather than arcing like a thrown stone (which would be 2). */
  rise: number;
  /** Fall leg: the touchdown slope as a multiple of the descent's average. 2 is a plain parabola;
   *  the rows sit above it because drag bleeds forward speed while gravity keeps adding downward. */
  fall: number;
}

/** Keep both cubic legs strictly monotonic (at a coefficient of 3 the leg develops a flat spot — the
 *  ball would hover). Only reachable from an out-of-range table row. */
const shapeCoef = (x: number): number => Math.max(0.2, Math.min(2.95, x));

/**
 * The family's arc shape. Both legs fall out of the same relation the apex height does — a leg's
 * AVERAGE slope is `apex / (its share of the ground)` and its outer end slope is the launch/descent
 * tangent, so:
 *
 *     rise = tan(launch)·apexAt·carry / apex      = 4·apexAt / liftGain
 *     fall = tan(descent)·(1−apexAt)·carry / apex = 4·(1−apexAt)·dropRatio / liftGain
 *
 * The carry cancels, and so does the apex. THAT is why the shape can be a per-FAMILY constant: it
 * depends only on where the ball peaks and how much steeper it lands than it launched — nothing
 * about the particular shot — while the height it is scaled to is the shot's own. Pure. */
export function arcShapeFor(profile: FlightProfile, feel: ArcFeel = ARC_FEEL): ArcShape {
  const ga = Math.max(0.05, Math.min(0.95, profile.apexAt));
  const k = 4 / feel.liftGain;
  return { apexAt: ga, rise: shapeCoef(k * ga), fall: shapeCoef(k * (1 - ga) * profile.dropRatio) };
}

/** `arcShapeFor` keyed by club id — the ONE lookup a consumer needs to draw a club's flight. Pure. */
export function arcShapeOf(clubId?: string, feel: ArcFeel = ARC_FEEL): ArcShape {
  return arcShapeFor(flightProfileOf(clubId), feel);
}

/** The neutral mid-bag arc, for the few callers with no club in hand. */
export const NEUTRAL_ARC: ArcShape = arcShapeFor(FLIGHT_PROFILES.ironShort);

/**
 * Height above the ground (yards) once the ball has covered ground fraction `g` of its carry — THE
 * flight profile, shared by the sim's knockdown walk and the renderer's animation.
 *
 * Two cubic legs, each pinned at both ends in value AND slope: the rise leaves the clubface at the
 * launch angle and reaches the apex flat; the fall leaves the apex flat and reaches the turf at the
 * descent angle. Zero at both ends, exactly `apex` at `apexAt`, C¹ at the peak, monotonic on each
 * leg — so the ball climbs, tops out once and comes down, with no hover and no plummet. Pure. */
export function arcHeight(apex: number, g: number, shape: ArcShape = NEUTRAL_ARC): number {
  const gg = clamp01(g);
  const ga = shape.apexAt;
  if (gg <= ga) {
    // f(0)=0, f'(0)=rise, f(1)=1, f'(1)=0 — the climb: straight, then rounding over.
    const u = gg / Math.max(1e-6, ga);
    const a = shape.rise;
    return (a * u + (3 - 2 * a) * u * u + (a - 2) * u * u * u) * apex;
  }
  // k(0)=1, k'(0)=0, k(1)=0, k'(1)=−fall — the fall: easing off the apex, then steepening in.
  const v = (gg - ga) / Math.max(1e-6, 1 - ga);
  const b = shape.fall;
  return (1 + (b - 3) * v * v + (2 - b) * v * v * v) * apex;
}

/**
 * The angle (degrees) the ball is genuinely falling at as it touches down, taken off the arc it just
 * flew: the fall leg's terminal slope, `fall · apex / ((1−apexAt) · carry)`. THE run-out's arrival
 * angle (GS-landing-real) — how far and how high the ball skips is decided here.
 *
 * Measured rather than looked up, so it stays honest wherever the arc is not the family's stock one:
 * a clamped apex (a chip, a monstrous drive), a partial swing, or the derelict's straight pinball
 * polyline all report the angle they actually arrive at. It replaces sampling the drawn curve over
 * its closing TENTH — a workaround for the vertical-tangent artefact that no longer exists, and
 * which under-read a driver's arrival by 3° and a wedge's by 9°. Pure. */
export function arrivalAngleDeg(apex: number, carry: number, shape: ArcShape = NEUTRAL_ARC): number {
  const run = Math.max(1e-3, (1 - shape.apexAt) * Math.abs(carry));
  return Math.atan2(shape.fall * Math.abs(apex), run) / DEG;
}

// --- Curved ground path ------------------------------------------------------
const deg2rad = (d: number): number => (d * Math.PI) / 180;

/**
 * The Bézier CONTROL point: straight ahead of the ball, down the shot bearing, at the landing's
 * FORWARD DEPTH (its projection onto the aim line) — NOT the full carry. With P0=from and P2=landing,
 * a quadratic Bézier through this control launches along the bearing (the aim line) and curves to the
 * offset landing — the fade/hook banana. Putting the control at the landing's depth (rather than full
 * carry) makes the path's forward progress MONOTONIC: an angled miss's landing is shorter in depth
 * than its carry, so a full-carry control sat BEYOND the landing and the curve overshot then pulled
 * back — the ball "slid out to the side / looped" near touchdown. The projected control removes that
 * overshoot while keeping the identical lateral (t²) banana. Clamp the depth ≥ 0 so a freak backward
 * landing can't invert the control. Pure. */
export function flightControl(from: Vec, landing: Vec, bearingDeg: number): Vec {
  const br = deg2rad(bearingDeg);
  const ux = Math.sin(br);
  const uy = Math.cos(br);
  const fwd = Math.max(0, (landing[0] - from[0]) * ux + (landing[1] - from[1]) * uy);
  return [from[0] + ux * fwd, from[1] + uy * fwd];
}

/**
 * GROUND FRACTION ↔ CURVE PARAMETER (GS-flight-shape). The two are NOT the same number and every
 * consumer works in the first: with the control point on the landing's own depth, the Bézier's
 * forward progress at parameter `t` is exactly `2t − t²` — 75% of the ground gone by t=0.5, and dead
 * stopped at t=1. Height, pacing and the knockdown walk are all indexed by how far the ball has
 * TRAVELLED; only the curve evaluation needs the parameter, and this is the one place that converts.
 * Exact for a shot finishing on its line, a close approximation for the banana. Pure.
 */
export function flightGroundFrac(t: number): number {
  const tt = clamp01(t);
  return tt * (2 - tt);
}

/** The curve parameter that has covered ground fraction `g` — the inverse of `flightGroundFrac`. */
export function flightParamAt(g: number): number {
  return 1 - Math.sqrt(1 - clamp01(g));
}

/** Quadratic Bézier point at `t` ∈ [0,1] through (from → control → landing). Pure. */
export function flightGround(from: Vec, control: Vec, landing: Vec, t: number): Vec {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return [a * from[0] + b * control[0] + c * landing[0], a * from[1] + b * control[1] + c * landing[1]];
}

// --- Tall-obstacle (tree) knockdown ------------------------------------------
/** Hazard kinds that are TALL obstacles a low ball can hit in the air (content-as-data: add a row
 *  and a canopy height for a new obstacle). Ground hazards (water/bunker) are NOT here — they act
 *  on landing/roll, not in the air. */
export const OBSTACLE_KINDS = new Set<string>(['trees']);

export interface CanopyFeel {
  /** Base canopy height (yards) for the smallest obstacle blob. */
  base: number;
  /** Extra canopy height per yard of blob radius (bigger blob = taller tree). */
  perRadius: number;
}
export const CANOPY_FEEL: CanopyFeel = { base: 7, perRadius: 1.5 };

/** Approximate radius (yards) of a hazard blob: mean distance from its centroid to its vertices. */
export function blobRadius(poly: Vec[]): number {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  let r = 0;
  for (const p of poly) r += Math.hypot(p[0] - cx, p[1] - cy);
  return r / poly.length;
}

/** Centroid of a polygon (vertex average — good enough for the round blobs the generator emits). */
export function blobCentroid(poly: Vec[]): Vec {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / poly.length, cy / poly.length];
}

/** Canopy height (yards) of a tall-obstacle blob, from its size. Pure. */
export function canopyHeight(poly: Vec[], feel: CanopyFeel = CANOPY_FEEL): number {
  return feel.base + blobRadius(poly) * feel.perRadius;
}

export interface Knockdown {
  /** Where the ball was knocked out of the air (course-space) — inside the obstacle blob. */
  point: Vec;
  /** Actual carry to that point (yards). */
  carry: number;
  /** Fraction of the GROUND carry covered at impact (0..1). */
  t: number;
}

/** A tall obstacle with its broad-phase geometry precomputed — the input to `flightBlockedBy`, so a
 *  spray-wide scan (many candidate landings on one hole) prices the hazard list ONCE, not per landing. */
export interface FlightObstacle {
  poly: Vec[];
  canopy: number;
  centre: Vec;
  radius: number;
}

/** All tall obstacles on a hole, with canopy/centre/radius precomputed. Pure. */
export function flightObstacles(hole: Hole): FlightObstacle[] {
  const out: FlightObstacle[] = [];
  for (const z of hole.hazards) {
    if (!OBSTACLE_KINDS.has(z.kind)) continue;
    out.push({ poly: z.poly, canopy: canopyHeight(z.poly), centre: blobCentroid(z.poly), radius: blobRadius(z.poly) });
  }
  return out;
}

/**
 * Walk the curved flight path and return the EARLIEST tree the ball clips — i.e. the first obstacle
 * blob it crosses while its arc height there is below the canopy. Returns null if the ball flies
 * clean (high enough, or never over a tree). Pure, no rng.
 *
 * The ball starting INSIDe an obstacle (it's already in the woods) does not count as a fresh clip —
 * only an outside→inside crossing knocks it down — so a punch-out from the trees isn't re-trapped at
 * its own bush.
 */
export function flightKnockdown(
  hole: Hole,
  from: Vec,
  landing: Vec,
  bearingDeg: number,
  carry: number,
  nominalCarry: number,
  profile: FlightProfile,
  steps = 22,
): Knockdown | null {
  return flightBlockedBy(flightObstacles(hole), from, landing, bearingDeg, carry, nominalCarry, profile, steps);
}

/**
 * The same knockdown walk as `flightKnockdown`, against a PRE-BUILT obstacle list — the shape the
 * blocked-shot spray overlay needs (it probes hundreds of candidate landings per hole, so it builds
 * `flightObstacles(hole)` once). `flightKnockdown` delegates here, so the overlay and the sim resolve
 * a clip from ONE code path — the drawn blocked zone IS the physics. Pure, no rng.
 */
export function flightBlockedBy(
  obstacles: readonly FlightObstacle[],
  from: Vec,
  landing: Vec,
  bearingDeg: number,
  carry: number,
  nominalCarry: number,
  profile: FlightProfile,
  steps = 22,
): Knockdown | null {
  if (carry <= 0) return null;
  // Candidate obstacles: only those whose blob comes near the straight launch→landing chord
  // (broad-phase prune so we fine-walk a handful, not every tree on the hole).
  const candidates: { poly: Vec[]; canopy: number; inside: boolean }[] = [];
  for (const o of obstacles) {
    if (segDist(o.centre, from, landing) > o.radius + 6) continue;
    candidates.push({ poly: o.poly, canopy: o.canopy, inside: pointInPoly(from, o.poly) });
  }
  if (candidates.length === 0) return null;

  const control = flightControl(from, landing, bearingDeg);
  const apex = arcApex(carry, nominalCarry, ARC_FEEL, profile);
  const shape = arcShapeFor(profile);
  // Walked in GROUND fraction, so the samples are evenly spread over the turf the ball crosses (the
  // curve's own parameter bunches them into the first half of the flight) and each height is the one
  // the renderer draws at that point — contract 5.
  for (let i = 1; i <= steps; i++) {
    const g = i / steps;
    const pos = flightGround(from, control, landing, flightParamAt(g));
    const h = arcHeight(apex, g, shape);
    for (const cand of candidates) {
      const inNow = pointInPoly(pos, cand.poly);
      // A fresh outside→inside crossing while below the canopy = a clip.
      if (inNow && !cand.inside && h < cand.canopy) {
        return { point: pos, carry: Math.hypot(pos[0] - from[0], pos[1] - from[1]), t: g };
      }
      cand.inside = inNow;
    }
  }
  return null;
}
