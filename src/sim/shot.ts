/**
 * Shot resolution: lie model, penalty model, plays-like wind, and the deterministic
 * shot itself. Reimplemented from the harvest manifest's spec (golf-finder's source
 * isn't in this repo).
 *
 * Pure & headless: randomness comes ONLY from the passed `Rng`. No DOM, no globals.
 * The wind math reads head/tail/cross off the SHOT bearing (not the hole bearing) —
 * that's the golf-finder insight worth keeping. Arcade, not sim: exact, not a forecast.
 *
 * Tunables are exported consts so the render/feel layer can expose them behind
 * `window._*` escape hatches without the sim ever touching `window`.
 */

import type { FeatureKind, Hole, Vec, Wind } from './course/contract';
import { bearing, pointInPoly } from './course/contract';
import type { Club } from './clubs';
import { clubDist, type ClubStats } from './clubs';
import type { Rng } from './rng';

// --- Feel tunables -----------------------------------------------------------
export const TUNABLES = {
  /** Carry yards gained per mph of pure tailwind (lost per mph headwind). */
  windCarryPerMph: 1.0,
  /** Lateral yards pushed per mph of pure crosswind. */
  windLateralPerMph: 0.8,
  // Per-club dispersion: longer clubs spray WILDER in both line and distance; shorter
  // clubs are tighter and more accurate (a 5-iron over a driver). A club's wildness `t`
  // ramps 0→1 from `accurateCarry` to `wildCarry` by its nominal carry; the *Long values
  // apply to the driver, the *Short values to the wedges. All fractions are of the
  // shot's intended carry. (At the driver: lateral σ 20% → ±50% at the 2.5σ cone edge,
  // distance 50%–110% of full — i.e. "can come up well short", matching the design.)
  /** Carry at/below which a club is fully accurate (t=0). */
  accurateCarry: 70,
  /** Carry at which a club is fully wild (t=1, ~the driver). */
  wildCarry: 250,
  /** Lateral std-dev as a fraction of carry — short club → long club. Under the angular
   *  dispersion model these are the small-angle σ (radians) about the bearing; the long value
   *  is trimmed a touch from the old flat-offset model because an angled miss now also loses
   *  forward distance (carry·cosθ), so the same number sprays slightly harder. */
  lateralFracShort: 0.05,
  lateralFracLong: 0.17,
  /** Distance std-dev as a fraction of carry — short → long. */
  carryFracShort: 0.04,
  carryFracLong: 0.13,
  /** Mean carry as a fraction of full (long clubs sit a touch short of nominal). */
  meanFracShort: 0.98,
  meanFracLong: 0.9,
  /** Hard lower clamp on carry (fraction of intended) — short → long. */
  distLowShort: 0.85,
  distLowLong: 0.5,
  /** Hard upper clamp on carry (fraction of intended) — short → long. */
  distHighShort: 1.05,
  distHighLong: 1.1,
} as const;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface DispersionProfile {
  /** Mean carry as a fraction of intended (full) carry. */
  meanFrac: number;
  /** Distance std-dev as a fraction of intended carry. */
  carryFrac: number;
  /** Lateral std-dev as a fraction of intended carry. */
  lateralFrac: number;
  /** Hard lower clamp on carry (fraction of intended). */
  lowFrac: number;
  /** Hard upper clamp on carry (fraction of intended). */
  highFrac: number;
}

/**
 * The per-club dispersion profile for a club of the given nominal carry. Pure. Shared by
 * `resolveShot` (which samples it) and `shotSpread` (which previews it) so the on-screen
 * spray cone reads EXACTLY true to the physics. Longer clubs = wilder; shorter = tighter.
 */
export function dispersionProfile(nominalCarry: number): DispersionProfile {
  const T = TUNABLES;
  const t = clamp01((nominalCarry - T.accurateCarry) / (T.wildCarry - T.accurateCarry));
  const mix = (short: number, long: number): number => short + (long - short) * t;
  return {
    meanFrac: mix(T.meanFracShort, T.meanFracLong),
    carryFrac: mix(T.carryFracShort, T.carryFracLong),
    lateralFrac: mix(T.lateralFracShort, T.lateralFracLong),
    lowFrac: mix(T.distLowShort, T.distLowLong),
    highFrac: mix(T.distHighShort, T.distHighLong),
  };
}

// --- Lie model (LIE_INFO analogue) ------------------------------------------
export interface LieInfo {
  /** Multiplies intended carry — a buried bunker lie robs distance. */
  carryMult: number;
  /** Multiplies dispersion — bad lies spray. */
  dispersionMult: number;
  /** If set, being here costs strokes (handled by the round sim, not the swing). */
  penalty?: PenaltyKind;
  /** Human label for HUD. */
  label: string;
}

export type PenaltyKind = 'water' | 'ob' | 'lost' | 'unplayable' | 'lava' | 'void';

/**
 * Surface → playing characteristics. Open table (content-as-data): fantasy surfaces
 * are added as rows, exactly like a new lie in golf-finder. A few fantasy lies ship
 * here as examples (lava = water-like penalty, lowgrav handled via biomeMods on carry).
 */
export const LIE_INFO: Record<string, LieInfo> = {
  tee: { carryMult: 1.0, dispersionMult: 0.85, label: 'Tee' },
  fairway: { carryMult: 1.0, dispersionMult: 1.0, label: 'Fairway' },
  green: { carryMult: 1.0, dispersionMult: 0.8, label: 'Green' },
  rough: { carryMult: 0.9, dispersionMult: 1.4, label: 'Rough' }, // 10% distance penalty
  waste: { carryMult: 0.9, dispersionMult: 1.2, label: 'Waste' },
  bunker: { carryMult: 0.5, dispersionMult: 1.6, label: 'Bunker' }, // 50% distance penalty — a real escape tax
  // Trees are a tough non-penalty LIE, not a mid-flight collision: a sprayed ball ends up
  // "in the woods" and has to punch out (short carry, wild line) — fair and readable, since
  // only an offline shot finds them. NOT a penalty, so they may line the corridor edge.
  trees: { carryMult: 0.6, dispersionMult: 1.7, label: 'Trees' },
  water: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'water', label: 'Water' },
  // Fantasy examples (each biome that uses one references it by this key):
  lava: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'lava', label: 'Lava' },
  void: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'void', label: 'The Void' },
  ice: { carryMult: 1.02, dispersionMult: 1.5, label: 'Ice' }, // slick: hard to control
  crystal: { carryMult: 1.05, dispersionMult: 0.85, label: 'Crystal' }, // true & fast
};

/** Default lie when a point is off every polygon (native / out-of-frame): rough. */
export const DEFAULT_LIE = 'rough';

export function lieInfo(kind: string): LieInfo {
  return LIE_INFO[kind] ?? LIE_INFO[DEFAULT_LIE]!;
}

// --- Penalty model (PEN_INFO analogue) --------------------------------------
export interface PenaltyInfo {
  /** Penalty strokes added. */
  strokes: number;
  /** true = stroke-and-distance (replay from previous spot). */
  replay: boolean;
  label: string;
}

export const PEN_INFO: Record<PenaltyKind, PenaltyInfo> = {
  water: { strokes: 1, replay: false, label: 'Water hazard' },
  ob: { strokes: 1, replay: true, label: 'Out of bounds' },
  lost: { strokes: 1, replay: true, label: 'Lost ball' },
  unplayable: { strokes: 1, replay: false, label: 'Unplayable' },
  lava: { strokes: 1, replay: false, label: 'Lava' },
  void: { strokes: 1, replay: true, label: 'Lost to the void' },
};

// --- Lie lookup against a hole ----------------------------------------------
/**
 * Read the lie at a point. Hazards are checked first (they're drawn on top and they
 * dominate play), then features. Off everything → DEFAULT_LIE.
 */
export function lieAt(hole: Hole, p: Vec): FeatureKind {
  for (const f of hole.hazards) if (pointInPoly(p, f.poly)) return f.kind;
  for (const f of hole.features) if (pointInPoly(p, f.poly)) return f.kind;
  return DEFAULT_LIE;
}

// --- Wind --------------------------------------------------------------------
const deg2rad = (d: number) => (d * Math.PI) / 180;

export interface WindBreakdown {
  /** Along-shot component, yards/sec-equivalent in mph; + = tailwind, − = headwind. */
  along: number;
  /** Cross component in mph; + = pushes toward the shot's right, − = left. */
  cross: number;
}

/**
 * Decompose wind relative to the SHOT bearing. `wind.dir` is the direction the wind
 * blows toward (deg cw from up). When the wind blows the same way the ball travels
 * (dir == shotBearing) it's a pure tailwind (+along).
 */
export function playWind(wind: Wind, shotBearingDeg: number): WindBreakdown {
  const theta = deg2rad(wind.dir - shotBearingDeg);
  return {
    along: wind.spd * Math.cos(theta),
    cross: wind.spd * Math.sin(theta),
  };
}

/**
 * Plays-like distance: what a target distance effectively "plays" into the given wind
 * along the shot bearing. Headwind makes it play longer (need more club); tailwind
 * shorter. Mirrors golf-finder's `_playsLike`, minus the forecast conservatism.
 */
export function playsLike(distance: number, wind: Wind | undefined, shotBearingDeg: number): number {
  if (!wind) return distance;
  const { along } = playWind(wind, shotBearingDeg);
  return distance - along * TUNABLES.windCarryPerMph;
}

// --- Shot resolution ---------------------------------------------------------
export interface ShotInput {
  from: Vec;
  /** The point the player aims at; defines the shot bearing and intended distance. */
  aim: Vec;
  club: Club;
  /** Lie the ball is currently sitting on. */
  lie: FeatureKind;
  wind?: Wind;
  /** Per-hole biome modifiers (e.g. low-gravity carry multiplier). */
  carryMult?: number;
  /** Player dispersion multiplier (<1 = a forgiveness/stability perk). */
  dispersionMult?: number;
  stats?: ClubStats;
  rng: Rng;
}

export interface ShotResult {
  /** Where the ball came to rest (course-space). */
  landing: Vec;
  /** Actual carry achieved (yards), after lie, wind, biome, and dispersion. */
  carry: number;
  shotBearing: number;
  wind: WindBreakdown;
  /** Intended (pre-noise) carry, for HUD / debugging. */
  intended: number;
}

/**
 * Resolve one swing deterministically. The caller reads the resulting lie via
 * `lieAt(hole, result.landing)` and applies any penalty — the swing itself doesn't
 * know the course, keeping this function pure and reusable.
 */
export function resolveShot(input: ShotInput): ShotResult {
  const { from, aim, club, lie, wind, rng } = input;
  const li = lieInfo(lie);

  const shotBearing = bearing(from, aim);
  const biomeMult = input.carryMult ?? 1;
  const nominal = clubDist(club, input.stats);
  const intended = nominal * li.carryMult * biomeMult;

  const w = wind ? playWind(wind, shotBearing) : { along: 0, cross: 0 };

  const dispMult = li.dispersionMult * (input.dispersionMult ?? 1);
  const prof = dispersionProfile(nominal);
  const carrySd = intended * prof.carryFrac * dispMult;
  // Random spray is ANGULAR, not a flat sideways offset: a fraction-of-carry std-dev becomes
  // a small-angle std-dev (radians) about the shot bearing. Because a rotation preserves
  // length, the ball's distance from the tee is the sampled `carry` in EVERY direction — so a
  // wide miss never finishes farther than the carry window (the old square-box bug). At small
  // angles carry*sin(θ) ≈ carry*θ ≈ the old lateral spread, so dispersion magnitude is ~unchanged.
  const angleSd = prof.lateralFrac * dispMult;

  // Distance: a mean a touch short of full (long clubs more so), gaussian noise, then a
  // hard clamp to the club's [low, high] window so a shot can come up well short (down to
  // ~50% on the driver) but never absurdly so — and tops out around 110%.
  const carryMean = intended * prof.meanFrac + w.along * TUNABLES.windCarryPerMph;
  const carryNoisy = carryMean + rng.gaussian(0, carrySd);
  const carry = Math.max(
    intended * prof.lowFrac,
    Math.min(intended * prof.highFrac, Math.max(0, carryNoisy)),
  );
  // SECOND rng draw (was the lateral offset) — keeps the draw count/order identical so the
  // headless sim and the interactive driver stay byte-for-byte in step.
  const thetaRand = rng.gaussian(0, angleSd);
  // Crosswind is a DETERMINISTIC lateral push (the AI already aims upwind to cancel it), kept
  // separate from the random angular spray so wind shifts the cone rather than widening it.
  const windLat = w.cross * TUNABLES.windLateralPerMph;

  // Forward unit vector along the shot bearing (cw from +Y), rotated by the random angle.
  const br = deg2rad(shotBearing);
  // Right-perpendicular of the unrotated bearing — the crosswind push axis (+θ also turns
  // toward this axis, matching the old "+lateral = right" convention).
  const rx = Math.cos(br);
  const ry = -Math.sin(br);
  const brR = br + thetaRand;
  const fxR = Math.sin(brR);
  const fyR = Math.cos(brR);

  const landing: Vec = [
    from[0] + fxR * carry + rx * windLat,
    from[1] + fyR * carry + ry * windLat,
  ];

  return { landing, carry, shotBearing, wind: w, intended };
}
