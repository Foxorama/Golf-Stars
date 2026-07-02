/**
 * Round simulation — plays a hole end-to-end from a seed, headlessly.
 *
 * This is where clubs + shot + lie + scoring meet. Pure and deterministic: a fixed
 * seed plays the same hole the same way every time, so tests assert on outcomes and
 * any bug reproduces by its seed. The renderer will later animate exactly these shots.
 */

import { dist, pathLength, type FeatureKind, type Hole, type Vec } from './course/contract';
import { CLUBS, clubDist, suggestClub, type Club, type ClubStats } from './clubs';
import {
  combineShapeMods,
  dispersionProfile,
  isRoadLie,
  lieAt,
  lieInfo,
  reliedLie,
  playsLike,
  playWind,
  PEN_INFO,
  resolveShape,
  resolveShot,
  sprayAngleRms,
  TUNABLES,
  type CaddyGuard,
  type ShapeMod,
  type ShotResult,
  type SprayShape,
} from './shot';
import type { HoleRecord } from './score';
import type { HoleStat } from './stats';
import type { Rng } from './rng';
import { usableBag } from './rpg/economy';
import { arcApex, flightKnockdown } from './flight';
import { insideTent, tentFlightHit, tradeTents, TENT_BOUNCE_MIN, type TentHit, type TradeTent } from './tents';
import { inScorch, meteorScorch, SCORCHABLE, SCORCH_LIE } from './scorch';
import { effectPatches, inPatch, PATCHABLE, PATCH_SPECS, type PatchKind } from './patches';

/** Ball within this many yards of the pin counts as holed. */
export const HOLE_OUT_RADIUS = 1.2;
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
  /** Trade-camp tent ricochet (GS-tents): the ball clipped a tent roof and bounced off. Carries the
   *  impact point so the renderer can show the ball hit the tent + pop a voice bubble there ("Ow!").
   *  Non-penalty — `result.landing` is the impact and the roll runs out along the reflected direction. */
  tentHit?: { at: Vec; dir: Vec };
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
  trees: 0.15,
  ice: 1.0,
  crystal: 0.95,
};
/** Firmness of a touchdown lie (default a mid value for unknown surfaces). */
export function surfaceFirmness(lie: FeatureKind): number {
  return SURFACE_FIRMNESS[lie] ?? 0.5;
}
/** Clamp on the run-out (yards): forward roll caps high, backspin checks modestly back. */
const MAX_ROLL = 42;
const MAX_CHECK = 18;
/** Per-yard run a hazard-skip ball (GS-proshop-2) keeps while skimming across an IMMUNE penalty —
 *  fast (like firm ice) so a floater/magma/void ball carries on to dry ground instead of dying in it. */
const SKIM_ROLL = 2.2;
/** How strongly a green's slope speeds a downhill roll / brakes an uphill one (GS-greens-3). The
 *  green run-per-yard is scaled by `1 + SLOPE_ROLL_K · (downhill·travelDir) · slopeMag`, floored so a
 *  steep uphill still creeps a hair. slopeMag rides in the green-slope vector's magnitude. */
const SLOPE_ROLL_K = 0.95;

/** Carry of the pitching wedge — at/below this, clubs start adding backspin. */
export const BACKSPIN_CARRY = 106;
const SHORTEST_CARRY = 38;
const DRIVER_CARRY = 250;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * Loft-based roll fraction of carry, by a club's nominal carry. Long clubs run out a lot
 * (driver ~+18%); it tapers down through the irons; PW (+5%) and the lofted wedges below
 * it bite and spin BACK (down to −10% on the shortest). Pure & data-driven. */
export function clubRollFraction(nominalCarry: number): number {
  if (nominalCarry >= BACKSPIN_CARRY) {
    const t = clamp01((nominalCarry - BACKSPIN_CARRY) / (DRIVER_CARRY - BACKSPIN_CARRY));
    return 0.05 + (0.18 - 0.05) * t; // PW +5% → driver +18%
  }
  const t = clamp01((BACKSPIN_CARRY - nominalCarry) / (BACKSPIN_CARRY - SHORTEST_CARRY));
  return 0.05 + (-0.1 - 0.05) * t; // PW +5% → shortest wedge −10% (backspin)
}

/** True if a club (by nominal carry) generates meaningful backspin (PW and below). */
export function hasBackspin(nominalCarry: number): boolean {
  return nominalCarry <= BACKSPIN_CARRY;
}

/**
 * The ball's reference run-out ENERGY (signed yards) — how far it would roll on a flat, true (mult 1,
 * fairway) surface. + runs forward, − is backspin checking it back. Loft (`clubRollFraction`) + a
 * character's `rollFracDelta` + a little variance. This is surface-FREE; the surface is applied along
 * the path by `rollOut`. Consumes EXACTLY one rng draw (same as the old `rollYards`), so a 0-delta
 * shot keeps the same rng budget and auto≡interactive holds. */
function rollPotential(nominalCarry: number, carry: number, rng: Rng, rollFracDelta = 0): number {
  const frac = clubRollFraction(nominalCarry) + rollFracDelta;
  const raw = carry * frac * rng.range(0.85, 1.15);
  return Math.max(-MAX_CHECK, Math.min(MAX_ROLL, raw));
}

/**
 * Roll the ball out from `touchdown` along `dir`, integrating each surface's "run" (`SURFACE_ROLL`)
 * step-by-step until the reference energy `K` (signed, from `rollPotential`) is spent — so the SAME
 * energy carries far across slick fairway/ice and dies quickly in thick rough, and a roll that
 * CROSSES surfaces blends them (land rough → reach fairway → keep running, or vice versa). Hard
 * stops: it settles where it first trickles into a penalty (water/lava/void), or plugs in a bunker /
 * is caught by trees it ROLLS into (object interaction on the ground). Returns the SIGNED distance
 * actually travelled (so `dist(rest,touchdown) === |roll|`) + the rest point. Pure, no rng — a
 * deterministic geometry pass after the energy draw, so auto≡interactive is untouched. */
export function rollOut(
  hole: Hole,
  touchdown: Vec,
  dir: Vec,
  K: number,
  tdLie: FeatureKind,
  immune?: ReadonlySet<string>,
  tents?: readonly TradeTent[],
): { roll: number; rest: Vec } {
  const sign = K < 0 ? -1 : 1;
  const cap = sign < 0 ? MAX_CHECK : MAX_ROLL;
  const at = (d: number): Vec => [touchdown[0] + dir[0] * sign * d, touchdown[1] + dir[1] * sign * d];
  const STEP = 1.5; // yards per integration step
  // Trade-camp tents (GS-tents): a ball ROLLING into a tent footprint stops against it (like sand /
  // the woods), so the run-out stays a straight line and the roll-invariant holds. A tent the ball is
  // ALREADY on (a fresh aerial-bounce ricochet starts at the roof it hit) doesn't re-stop it.
  const startTents = tents?.filter((t) => insideTent(t, touchdown));
  const hitsNewTent = (p: Vec): boolean =>
    !!tents && tents.some((t) => insideTent(t, p) && !startTents!.includes(t));
  // Green SLOPE (GS-greens-3): how much the roll runs downhill / checks uphill. The travel direction
  // is sign*dir; its projection onto the green's DOWNHILL vector scales the green's run-per-yard, so a
  // ball rolling downhill runs out far and one rolling (or BACKSPINNING) uphill brakes hard and can't
  // climb — no ball ever spins weirdly up a slope. Pure geometry, no rng, straight roll → the
  // roll-invariant (dist(rest,touchdown) === |roll|) and the renderer's straight run-out hold.
  const slope = hole.greenSlope;
  const tdx = dir[0] * sign;
  const tdy = dir[1] * sign;
  const slopeRun = (k: string): number => {
    if (k !== 'green' || !slope) return 1;
    const along = tdx * slope[0] + tdy * slope[1]; // + = travelling downhill, − = uphill
    return Math.max(0.32, 1 + SLOPE_ROLL_K * along);
  };
  let budget = Math.abs(K); // remaining energy, in fairway-equivalent yards
  let dist = 0;
  let guard = 0;
  while (budget > 1e-3 && dist < cap && guard++ < 400) {
    const k = lieAt(hole, at(dist + STEP * 0.5)); // the surface we're rolling onto
    const kPen = lieInfo(k).penalty;
    // Hazard-skip balls (GS-proshop-2): an IMMUNE penalty is skimmed across (low friction) instead of
    // swallowing the ball — it keeps rolling toward dry ground. A non-immune penalty still stops it.
    // `immune` absent ⇒ this is exactly the old behaviour (break on any penalty), byte-for-byte.
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
    const m = kPen ? SKIM_ROLL : (SURFACE_ROLL[k] ?? 0.6) * slopeRun(k); // this surface's run per yard (immune hazard skims fast); slope-adjusted on the green
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
  /** Raise the lower carry clamp of NON-wedge clubs by this fraction (driver/woods/irons). */
  minCarryBoost?: number;
  /** Tighten the carry window of WEDGES toward the mean by this fraction (0..1). */
  wedgeWindow?: number;
}

/** Resolve the per-club carry-window tweaks from the loadout-level controls + the club's carry. */
export function carryControlFor(
  nominalCarry: number,
  opts: CarryControlOpts,
): { minCarryFracBoost?: number; carryWindowTighten?: number } {
  if (nominalCarry <= WEDGE_CONTROL_CARRY) {
    return opts.wedgeWindow ? { carryWindowTighten: opts.wedgeWindow } : {};
  }
  return opts.minCarryBoost ? { minCarryFracBoost: opts.minCarryBoost } : {};
}

/** A single putt's roll on the green, for the play view to animate (flat, no arc). */
export interface PuttLog {
  from: Vec;
  to: Vec;
  holed: boolean;
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
  /** Suggestible Sam's confidence shape boost (GS-caddy): applied when the AI happens to club the
   *  same club Sam would suggest, so auto-finish/headless play matches the interactive driver. */
  confidence?: ShapeMod;
  /** Co-op SCRAMBLE (GS-scramble, boss stops): a partner golfer hits a second ball each full shot
   *  and the TEAM keeps the better one (one stroke). Absent ⇒ ordinary solo play (no extra rng). */
  scramble?: ScrambleOpts;
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

/**
 * Out-of-bounds boundary: the course-space box bounding ALL of a hole's terrain
 * (features, hazards, centreline, tee, green), expanded by a generous, hole-size-scaled
 * margin so only genuinely wild shots — well clear of any drawn terrain — count as OB.
 * Pure. (Fairness invariant: penalty surfaces stay off the corridor; OB is the boundary
 * for shots sprayed off the whole map, where stroke-and-distance is the fair golf rule.)
 */
export function playBounds(hole: Hole): { min: Vec; max: Vec } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (p: Vec): void => {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  };
  for (const f of hole.features) for (const p of f.poly) eat(p);
  for (const f of hole.hazards) for (const p of f.poly) eat(p);
  for (const p of hole.centreline) eat(p);
  eat(hole.tee);
  eat(hole.green);
  const span = Math.max(maxX - minX, maxY - minY, dist(hole.tee, hole.green));
  // Generous, but CAPPED so a long par-5 doesn't fling the boundary (and its drawn OB
  // stakes) absurdly far out — the cap keeps OB a real, readable edge you can see and aim
  // away from, while still only catching genuinely wild shots clear of all the terrain.
  const m = Math.min(Math.max(40, span * 0.25), 90);
  return { min: [minX - m, minY - m], max: [maxX + m, maxY + m] };
}

/** True if a point is inside the hole's out-of-bounds boundary. */
export function inBounds(hole: Hole, p: Vec): boolean {
  const b = playBounds(hole);
  return p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1];
}

/** The four corners of the OB box (course-space), CW from the tee-side min corner. The
 *  renderers draw white OB stakes along these edges — the boundary the OB penalty uses. */
export function playBoundsCorners(hole: Hole): [Vec, Vec, Vec, Vec] {
  const b = playBounds(hole);
  return [
    [b.min[0], b.min[1]],
    [b.max[0], b.min[1]],
    [b.max[0], b.max[1]],
    [b.min[0], b.max[1]],
  ];
}

/** Evenly-spaced OB stake positions (course-space) around the boundary, ~`spacing` yards
 *  apart. Render-only marker geometry: the stakes sit EXACTLY where stroke-and-distance
 *  begins, so seeing them reads true to the penalty. Pure. */
export function obStakes(hole: Hole, spacing = 28): Vec[] {
  const corners = playBoundsCorners(hole);
  const pts: Vec[] = [];
  for (let e = 0; e < 4; e++) {
    const p = corners[e]!;
    const q = corners[(e + 1) % 4]!;
    const n = Math.max(2, Math.round(dist(p, q) / spacing));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return pts;
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

/** Putting skill — a lower handicap / a caddie / putter perk tightens these. */
export interface PuttSkill {
  /** Make chance inside ~2.2 yds (default 0.85). */
  makeChance?: number;
  /** Lag distance left as a fraction of the putt length (default 0.07). */
  lagFrac?: number;
  /** Lag std-dev as a fraction of the putt length (default 0.05). */
  lagSd?: number;
  /** MANUAL putting only: half-width of the pace-meter "make" band, as a pace fraction (default
   *  DEFAULT_MANUAL_BAND). Wider = more forgiving timing window. Putter upgrades raise it. */
  manualBand?: number;
}

/** Manual-putt pace-meter tuning (shared by the resolver and the on-screen meter so they agree). */
export const MANUAL_IDEAL_PACE = 1.06; // perfect pace: firm enough to reach the cup and drop just past
export const MANUAL_PACE_MAX = 1.7; // top of the meter (a bold, runs-well-past stroke)
export const DEFAULT_MANUAL_BAND = 0.13; // base make-band half-width (pace fraction)

/** The player's manual-putt input from the pace meter. */
export interface PuttControl {
  /** Struck pace as a fraction of the distance to the cup: 1 ≈ dies at the hole, MANUAL_IDEAL_PACE
   *  drops it, <1 leaves it short, >1 runs it past. Captured when the sweeping marker is tapped. */
  pace: number;
  /** Lateral AIM at the cup (yards, + = right of the ball→cup line; GS-greens-3). The player aims
   *  HIGH to let a sidehill putt BREAK back into the hole. Default 0 = straight at the cup. */
  aim?: number;
}

/** Break strength (GS-greens-3): how many yards a fully-sidehill putt curves, scaling with distance^1.35
 *  and (inversely) pace. Tuned so a 3-yd putt barely breaks but a 16-yd sidehiller swings several feet. */
const BREAK_K = 0.18;

/**
 * The lateral BREAK (yards, + = right) a manual putt picks up from the green slope, for a straight
 * (aim-0) line from `from` to `pin` at the given pace. The shared truth for the resolver, the on-screen
 * break-curve preview, and the Mystic Mole's read. Flat green / no slope → 0. Pure.
 */
export function puttBreakYd(from: Vec, pin: Vec, slope: Vec | undefined, pace: number): number {
  if (!slope) return 0;
  const d = dist(from, pin) || 1e-6;
  let ux = (pin[0] - from[0]) / d;
  let uy = (pin[1] - from[1]) / d;
  const rperp: Vec = [-uy, ux]; // right of the ball→cup line
  const lat = slope[0] * rperp[0] + slope[1] * rperp[1]; // signed sidehill component of the fall line
  const paceFac = Math.max(0.7, Math.min(1.6, MANUAL_IDEAL_PACE / Math.max(0.4, pace)));
  return BREAK_K * lat * Math.pow(d, 1.35) * paceFac;
}

/** The lateral AIM (yards) that cancels the break at the ideal pace — the line the Mystic Mole reads
 *  out for you, and what the UI snaps to with a green-reading caddy. Pure. */
export function idealPuttAim(from: Vec, pin: Vec, slope: Vec | undefined): number {
  return -puttBreakYd(from, pin, slope, MANUAL_IDEAL_PACE);
}

/** Sample the predicted curved PATH of a manual putt (course-space points) for drawing the break line,
 *  so the graphic IS the physics. The ball leaves along the aim and curves by the break as it slows
 *  (break accelerates late, ∝ t^1.8). No wobble (that's the random part). Pure. */
export function puttPathPreview(
  from: Vec,
  pin: Vec,
  slope: Vec | undefined,
  aim: number,
  pace: number,
  samples = 12,
): Vec[] {
  const d = dist(from, pin) || 1e-6;
  const ux = (pin[0] - from[0]) / d;
  const uy = (pin[1] - from[1]) / d;
  const rperp: Vec = [-uy, ux];
  const brk = puttBreakYd(from, pin, slope, pace);
  const along = pace * d;
  const pts: Vec[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const lat = aim * t + brk * Math.pow(t, 1.8);
    pts.push([from[0] + ux * along * t + rperp[0] * lat, from[1] + uy * along * t + rperp[1] * lat]);
  }
  return pts;
}

/**
 * Resolve ONE manual putt from the player's PACE input (skill, not pure luck). Auto-aimed at the cup;
 * the player controls speed via the meter. Holing needs the pace inside the make-band AND the ball
 * staying on-line — a small lateral wobble (one rng draw, scaled by distance and reduced by putter
 * skill) means long putts can slide by even on good pace, while short putts drop reliably. A missed
 * pace finishes short or long by the pace error; the lateral makes a miss read as sliding past. Pure
 * given (from, pin, control, skill, rng).
 */
export function manualPutt(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  control: PuttControl,
  skill: PuttSkill = {},
  slope?: Vec,
): PuttLog {
  const d = dist(from, pinPt) || 1e-6;
  const band = skill.manualBand ?? DEFAULT_MANUAL_BAND;
  const pace = Math.max(0, control.pace);
  const aim = control.aim ?? 0; // lateral aim at the cup (yd, + = right) — the player's break read
  const paceErr = pace - MANUAL_IDEAL_PACE; // <0 short, >0 long (in pace units)
  // Unit vector to the cup + its right-perpendicular (the line/break axis).
  const ux = (pinPt[0] - from[0]) / d;
  const uy = (pinPt[1] - from[1]) / d;
  const rperp: Vec = [-uy, ux];
  // Skill 0..1: a better putter (bigger band) wobbles less off-line.
  const skillF = clamp01((band - DEFAULT_MANUAL_BAND) / 0.3);
  const wobble = rng.gaussian(0, d * 0.05 * (1 - 0.6 * skillF));
  // GS-greens-3: the green slope BREAKS the putt. The ball's lateral position AT THE CUP is your AIM
  // plus the slope's break plus a little wobble — so on a sidehill green you must aim HIGH (aim ≈
  // −break) for it to curl in. Flat green (no slope) → break 0 → byte-for-byte the old straight putt.
  const breakYd = puttBreakYd(from, pinPt, slope, pace);
  const netLat = aim + breakYd + wobble;
  // A make: pace inside the band AND the net lateral (aim + break + wobble) holds within the cup.
  if (Math.abs(paceErr) <= band && Math.abs(netLat) <= HOLE_OUT_RADIUS) {
    return { from, to: pinPt, holed: true };
  }
  // Missed: it travels `pace × d` along the line with the net lateral offset (short/long + off-line).
  const travel = pace * d;
  const to: Vec = [from[0] + ux * travel + rperp[0] * netLat, from[1] + uy * travel + rperp[1] * netLat];
  return { from, to, holed: dist(to, pinPt) <= HOLE_OUT_RADIUS };
}

/**
 * Resolve ONE putt from `from` toward the pin. Pure/deterministic via `rng`. Short putts
 * usually drop; long putts lag close, with a small lateral miss so a miss reads as sliding
 * past the hole. The single building block both auto putt-out and manual putting share.
 */
export function onePutt(rng: Rng, from: Vec, pinPt: Vec, skill: PuttSkill = {}): PuttLog {
  const d = dist(from, pinPt);
  let newD: number;
  if (d <= 2.2) {
    newD = rng.bool(skill.makeChance ?? 0.85) ? 0 : rng.range(0.4, 1.0);
  } else {
    newD = Math.abs(rng.gaussian(d * (skill.lagFrac ?? 0.07), d * (skill.lagSd ?? 0.05)));
  }
  if (newD <= HOLE_OUT_RADIUS) return { from, to: pinPt, holed: true };
  // Place the ball `newD` from the pin along the pin→ball line, nudged laterally.
  let dx = from[0] - pinPt[0];
  let dy = from[1] - pinPt[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const lateral = rng.gaussian(0, newD * 0.3);
  return { from, to: [pinPt[0] + dx * newD - dy * lateral, pinPt[1] + dy * newD + dx * lateral], holed: false };
}

/** Putt out fully (auto), stepping `onePutt` until holed or the budget runs out. */
function puttOut(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  maxPutts = 6,
  skill: PuttSkill = {},
): { putts: number; log: PuttLog[]; holed: boolean } {
  const log: PuttLog[] = [];
  let pos: Vec = from;
  let putts = 0;
  while (dist(pos, pinPt) > HOLE_OUT_RADIUS && putts < maxPutts) {
    putts++;
    const p = onePutt(rng, pos, pinPt, skill);
    log.push(p);
    pos = p.to;
    if (p.holed) break;
  }
  return { putts, log, holed: dist(pos, pinPt) <= HOLE_OUT_RADIUS };
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
    const tgt = layupTarget(hole, ball, lie, usable, carryMult);
    const club = aiClub(hole, ball, tgt, carryMult, usable, opts.stats);
    // Sam's confidence boost applies when the played club IS the one he'd suggest. Gate the
    // suggestion compute on Sam being owned (confidence present) so a non-Sam run is byte-for-byte
    // unchanged (no extra work, no shape change) — same rule the interactive driver uses.
    const suggestedClubId = opts.confidence
      ? suggestPlayerClub(hole, ball, lie, usable, { carryMult, dispersionMult: opts.dispersionMult }).id
      : undefined;

    const execOpts: ExecOpts = {
      carryMult,
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
      shotMods: opts.shotMods,
      shapeMod: opts.shapeMod,
      minCarryBoost: opts.minCarryBoost,
      wedgeWindow: opts.wedgeWindow,
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
    const playerEx: ExecResult = executeShot(hole, ball, lie, tgt, club, execOpts, rng);
    // Scramble (GS-scramble): the partner hits a second ball (same club/target, their own swing
    // shape) and the team keeps the better — fewer penalties / closer to the flag. The partner draw
    // fires ONLY when scramble is armed, so a normal hole's rng stream is byte-for-byte unchanged.
    const ex: ExecResult = opts.scramble
      ? pickBetterExec(
          playerEx,
          executeShot(hole, ball, lie, tgt, club, { ...execOpts, shotMods: opts.scramble.partnerMods }, rng),
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
      const out = puttOut(rng, ball, flag, Math.max(1, maxStrokes - strokes));
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
  // upwind aim stays correct at any power. Power 1 leaves this byte-for-byte unchanged.
  const aim = aimWithWind(from, target, hole.wind, shotBearing, club.carry * carryMult * power, opts.windResist);
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
  const cw = carryControlFor(nominalCarry, opts);
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
    guard: opts.guard,
    // Caddy-guard fairway test (GS-caddy): closes the guard over THIS hole so resolveShot stays
    // course-agnostic. Off the fairway = any lie that isn't fairway or green (rough/sand/void/water/…).
    // Built only when a guard is owned, so a guard-less shot passes `undefined` → no redirect, no draw.
    offFairway: opts.guard ? (p: Vec) => { const k = lieAt(hole, p); return k !== 'fairway' && k !== 'green'; } : undefined,
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
  const kd = flightKnockdown(hole, from, result.landing, result.shotBearing, result.carry, nominalCarry);
  let knockedDown = false;
  if (kd) {
    knockedDown = true;
    result.landing = kd.point;
    result.carry = kd.carry;
    result.apex = arcApex(kd.carry, nominalCarry);
  }

  // Trade-camp tent ricochet (GS-tents): if NOT already knocked into the woods, a low/flat shot whose
  // curved flight crosses a tent roof (around the green) is knocked down AT the tent and bounces off
  // along the reflected direction — a lofted wedge sails over and lands clean. Pure geometry on the
  // SAME curved path the renderer draws (no rng), so auto≡interactive holds; tents are built only when
  // the trade-market route armed them, so a base shot never enters this branch (byte-for-byte stable).
  const tents = opts.tradeTents ? tradeTents(hole) : undefined;
  let tentHit: TentHit | null = null;
  if (tents && !knockedDown) {
    tentHit = tentFlightHit(tents, from, result.landing, result.shotBearing, result.carry, nominalCarry);
    if (tentHit) {
      result.landing = tentHit.point;
      result.carry = tentHit.carry;
      result.apex = arcApex(tentHit.carry, nominalCarry);
    }
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
  // Roll out unless it plugged in a non-immune penalty. An immune-hazard touchdown still rolls — it
  // skims across toward dry ground (rollOut treats the immune surface as a fast skim).
  if (!tdPen || (immune && immune.has(tdPen))) {
    // Increased backspin (GS-proshop-2): subtract from the roll fraction (more check, less run) — same
    // single rng draw, so backspinBoost 0/undefined is byte-for-byte the old energy.
    const energy = rollPotential(nominalCarry, result.carry, rng, mods.rollFracDelta - (opts.backspinBoost ?? 0));
    // Tent ricochet (GS-tents): the run-out goes along the REFLECTED direction with a lively floor of
    // energy (a real bounce, not a dead drop). Otherwise the roll runs along the flight direction. The
    // rng draw above is unchanged either way, so the stream is stable. tents are passed so a roll that
    // trickles into a DIFFERENT tent stops against it (a straight stop → the roll-invariant holds).
    let rollDir: Vec;
    let rollK = energy;
    if (tentHit) {
      rollDir = tentHit.dir;
      rollK = Math.max(Math.abs(energy), TENT_BOUNCE_MIN); // bounce forward off the roof, always lively
    } else {
      const dx = touchdown[0] - from[0];
      const dy = touchdown[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      rollDir = [dx / len, dy / len];
    }
    if (rollK !== 0) {
      const out = rollOut(hole, touchdown, rollDir, rollK, tdLie, immune, tents);
      roll = out.roll;
      rest = out.rest;
    }
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
  if (tentHit) log.tentHit = { at: tentHit.point, dir: tentHit.dir };

  let ballAfter: Vec = rest;
  let lieAfter: FeatureKind = restLie;
  let penaltyStrokes = 0;
  let holed = false;
  if (opts.rainbowRoad && !isRoadLie(restLie)) {
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
  const power = opts.power ?? 1;
  const li = lieInfo(lie);
  const relief = reliedLie(li, opts.lieRelief);
  const shotBearing = bearingDeg(from, target);
  const nominal = clubDist(club, opts.stats);
  const intended = nominal * relief.carryMult * carryMult * power;
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
  const cw = carryControlFor(nominal, opts);
  let lowFrac = prof.lowFrac;
  let highFrac = prof.highFrac;
  if (cw.minCarryFracBoost) lowFrac = Math.min(highFrac, lowFrac + cw.minCarryFracBoost);
  if (cw.carryWindowTighten) {
    const t = Math.max(0, Math.min(1, cw.carryWindowTighten));
    lowFrac = lowFrac + (prof.meanFrac - lowFrac) * t;
    highFrac = highFrac - (highFrac - prof.meanFrac) * t;
  }
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
    carryLow: Math.max(0, low + along),
    carryHigh: high + along,
    lateralSd: intended * prof.lateralFrac * dispMult,
    carrySd: intended * prof.carryFrac * dispMult,
    angleSd: sprayAngleRms(shape, angleSpread),
    angleSpread,
    shape,
    lefty: opts.lefty,
  };
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
 * reasons about green COVERAGE:
 *   - green unreachable → the longest usable club (give it your best go);
 *   - green reachable   → the LONGEST club whose EXPECTED carry still lands on the green
 *     (`expectedCarry ≤ distToBack`), so you take the most club you can without flying the
 *     green on a normal strike — overshooting the front is fine, but the typical shot won't
 *     sail the back.
 *
 * The earlier rule gated on `carryLow ≤ distToFront` (the club's WORST-case carry). That let
 * the driver in for any approach long enough that the driver's worst miss could still come up
 * short of the front — even though the driver's MEAN carry flew 60+ yards past the green. The
 * symptom was "the suggestion keeps handing me the driver": it was clubbing off the minimum
 * carry instead of the expected one. Gating on the expected carry fixes it.
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
  const target = hole.green;
  const spreadOf = (c: Club) =>
    shotSpread(hole, ball, lie, target, c, {
      carryMult: opts.carryMult,
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
    });
  const longest = cand.reduce((a, b) => (clubDist(b, opts.stats) > clubDist(a, opts.stats) ? b : a));

  // Unreachable: even the longest club's best carry can't get to the front → swing the longest.
  if (spreadOf(longest).carryHigh < front) return longest;

  // Reachable: the LONGEST club whose EXPECTED carry still stops on the green (≤ the back edge).
  // Walk shortest→longest and keep the last qualifier; if even the shortest club's expected carry
  // flies the back (the ball is right next to the green), fall back to the shortest (a chip).
  const byCarryAsc = [...cand].sort((a, b) => clubDist(a, opts.stats) - clubDist(b, opts.stats));
  let pick: Club | undefined;
  for (const c of byCarryAsc) {
    if (spreadOf(c).expectedCarry <= back) pick = c;
  }
  return pick ?? byCarryAsc[0]!;
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
  return safeTarget(hole, ball, hole.green, maxReachOf(bag, carryMult, lie));
}

/** Effective max carry (yards) the bag can fly from this lie — the reach a forced carry needs. */
function maxReachOf(bag: readonly Club[], carryMult: number, lie: FeatureKind): number {
  let max = 0;
  for (const c of bag) if (c.id !== 'putter') max = Math.max(max, c.carry);
  return max * carryMult * lieInfo(lie).carryMult;
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
function safeTarget(hole: Hole, ball: Vec, pinPt: Vec, maxReach: number): Vec {
  if (clearLine(hole, ball, pinPt)) return pinPt;
  const t0 = nearestCentrelineT(hole, ball);
  const cross = firstCentrelineCrossing(hole, t0);
  if (cross) {
    const carry = carryTarget(hole, ball, pinPt, cross, maxReach);
    if (carry) return carry;
    return layupShortTarget(hole, cross, t0);
  }
  // Side hazard → advance along the (penalty-free) centreline toward the green.
  return pointAlong(hole.centreline, Math.min(1, t0 + 0.2));
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
  maxReach: number,
): Vec | null {
  const reach = maxReach * 0.97; // small safety so the MEAN shot clears, not just the max
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
