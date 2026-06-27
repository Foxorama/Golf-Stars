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
  dispersionProfile,
  lieAt,
  lieInfo,
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
): { roll: number; rest: Vec } {
  const sign = K < 0 ? -1 : 1;
  const cap = sign < 0 ? MAX_CHECK : MAX_ROLL;
  const at = (d: number): Vec => [touchdown[0] + dir[0] * sign * d, touchdown[1] + dir[1] * sign * d];
  const STEP = 1.5; // yards per integration step
  let budget = Math.abs(K); // remaining energy, in fairway-equivalent yards
  let dist = 0;
  let guard = 0;
  while (budget > 1e-3 && dist < cap && guard++ < 400) {
    const k = lieAt(hole, at(dist + STEP * 0.5)); // the surface we're rolling onto
    if (lieInfo(k).penalty) {
      dist += STEP; // trickled into a penalty hazard → settles there (+stroke downstream)
      break;
    }
    if (k !== tdLie && (k === 'bunker' || k === 'trees')) {
      dist += STEP; // ran into sand / caught by the woods → stops
      break;
    }
    const m = SURFACE_ROLL[k] ?? 0.6; // this surface's run per yard
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
  /** A named caddy's in-flight ball guard (GS-caddy): redirects a sampled miss tail to the green. */
  guard?: CaddyGuard;
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
): PuttLog {
  const d = dist(from, pinPt) || 1e-6;
  const band = skill.manualBand ?? DEFAULT_MANUAL_BAND;
  const pace = Math.max(0, control.pace);
  const paceErr = pace - MANUAL_IDEAL_PACE; // <0 short, >0 long (in pace units)
  // Unit vector to the cup + its right-perpendicular (the wobble axis).
  const ux = (pinPt[0] - from[0]) / d;
  const uy = (pinPt[1] - from[1]) / d;
  // Skill 0..1: a better putter (bigger band) wobbles less off-line.
  const skillF = clamp01((band - DEFAULT_MANUAL_BAND) / 0.3);
  const wobble = rng.gaussian(0, d * 0.05 * (1 - 0.6 * skillF));
  // A make: pace inside the band AND the line holds (wobble within the cup). Short putts barely
  // wobble, so a good pace drops; long putts wobble more, so good pace can still lip out.
  if (Math.abs(paceErr) <= band && Math.abs(wobble) <= HOLE_OUT_RADIUS) {
    return { from, to: pinPt, holed: true };
  }
  // Missed: it travels `pace × d` along the line (short or long) with the lateral wobble.
  const travel = pace * d;
  const to: Vec = [from[0] + ux * travel - uy * wobble, from[1] + uy * travel + ux * wobble];
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

    const ex = executeShot(hole, ball, lie, tgt, club, {
      carryMult,
      dispersionMult: opts.dispersionMult,
      stats: opts.stats,
      shotMods: opts.shotMods,
      shapeMod: opts.shapeMod,
      minCarryBoost: opts.minCarryBoost,
      wedgeWindow: opts.wedgeWindow,
      guard: opts.guard,
      chipIn: opts.chipIn,
    }, rng);
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
  /** Named-caddy in-flight guard (GS-caddy): redirect a miss tail to the green. */
  guard?: CaddyGuard;
  /** Wedge-caddy chip-in chance (GS-caddy): drop a PW-or-shorter shot resting near the flag. */
  chipIn?: number;
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
  const shotBearing = bearingDeg(from, target);
  const aim = aimWithWind(from, target, hole.wind, shotBearing, club.carry * carryMult);
  // Character per-club shape: keyed by the club's nominal carry (a hooky driver, striped irons,
  // back-spun wedges). `dispMult === 1` passes the original dispersionMult through UNTOUCHED so a
  // characterless shot stays byte-for-byte (undefined stays undefined, never `undefined * 1`).
  const nominalCarry = clubDist(club, opts.stats);
  const mods = opts.shotMods ? opts.shotMods(nominalCarry) : NEUTRAL_SHOT_MODS;
  const dispersionMult =
    mods.dispMult === 1 ? opts.dispersionMult : (opts.dispersionMult ?? 1) * mods.dispMult;
  // Final spray SHAPE = the global upgrade mod (suppress duck-hooks, …) folded with this club's
  // character skew (a hooky driver). Carry-window controls are resolved by club category.
  const shape = resolveShape(opts.shapeMod, mods.shape);
  const cw = carryControlFor(nominalCarry, opts);
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

  // Touchdown → bounce & roll out (unless it plugs in a penalty surface). The run-out integrates
  // the surfaces it crosses: the ball keeps the same roll ENERGY but spends it fast in rough and
  // slowly on fairway/ice, so landing in the rough and trickling onto the fairway (or running off
  // the fairway into rough) reads physically, and it settles where it first finds water/sand/woods.
  const touchdown = result.landing;
  const tdLie = lieAt(hole, touchdown);
  let rest: Vec = touchdown;
  let roll = 0;
  if (!lieInfo(tdLie).penalty) {
    const energy = rollPotential(nominalCarry, result.carry, rng, mods.rollFracDelta);
    if (energy !== 0) {
      const dx = touchdown[0] - from[0];
      const dy = touchdown[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      const out = rollOut(hole, touchdown, [dx / len, dy / len], energy, tdLie);
      roll = out.roll;
      rest = out.rest;
    }
  }

  const restLie = lieAt(hole, rest);
  const li = lieInfo(restLie);
  const log: ShotLog = { from, result, lieFrom: lie, lieTo: restLie, club, rest, roll, holed: false, knockedDown, landLie: tdLie };

  let ballAfter: Vec = rest;
  let lieAfter: FeatureKind = restLie;
  let penaltyStrokes = 0;
  let holed = false;
  if (li.penalty) {
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
  } = {},
): ShotSpread {
  const carryMult = opts.carryMult ?? biomeCarryMult(hole);
  const li = lieInfo(lie);
  const shotBearing = bearingDeg(from, target);
  const nominal = clubDist(club, opts.stats);
  const intended = nominal * li.carryMult * carryMult;
  const w = hole.wind ? playWind(hole.wind, shotBearing) : { along: 0, cross: 0 };
  // The character's per-club shape (GS-18): its dispersion folds into the cone's width and its
  // shot-shape bias ROTATES the cone's centre line, so a fade/hook is visible in the preview and
  // the player can aim to compensate — wind reads true, and so does shape.
  const mods = opts.shotMods ? opts.shotMods(nominal) : NEUTRAL_SHOT_MODS;
  const dispMult = li.dispersionMult * (opts.dispersionMult ?? 1) * mods.dispMult;
  const prof = dispersionProfile(nominal);
  const along = w.along * TUNABLES.windCarryPerMph;
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
  // The asymmetric zone shape: global upgrade mod + this club's character skew. The renderer draws
  // each zone straight from it (so the graphic is the landing distribution), and the effective σ is
  // its RMS so previews/tests read true.
  const shape = resolveShape(opts.shapeMod, mods.shape);
  const angleSpread = prof.lateralFrac * dispMult;
  return {
    origin: from,
    bearing: shotBearing + (mods.angleBias * 180) / Math.PI,
    expectedCarry: mean,
    carryLow: Math.max(0, low + along),
    carryHigh: high + along,
    lateralSd: intended * prof.lateralFrac * dispMult,
    carrySd: intended * prof.carryFrac * dispMult,
    angleSd: sprayAngleRms(shape, angleSpread),
    angleSpread,
    shape,
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
): Vec {
  if (!wind) return target;
  const { cross } = playWind(wind, shotBearingDeg);
  const drift = cross * TUNABLES.windLateralPerMph; // +drift pushes to the shot's right
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
