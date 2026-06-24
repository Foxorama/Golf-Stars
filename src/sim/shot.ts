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
  /** Carry std-dev as a fraction of intended carry (before lie multiplier). */
  carryDispersionFrac: 0.03,
  /** Lateral std-dev as a fraction of intended carry (before lie multiplier). */
  lateralDispersionFrac: 0.04,
} as const;

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
  rough: { carryMult: 0.85, dispersionMult: 1.4, label: 'Rough' },
  waste: { carryMult: 0.9, dispersionMult: 1.2, label: 'Waste' },
  bunker: { carryMult: 0.7, dispersionMult: 1.6, label: 'Bunker' },
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
  const intended = clubDist(club, input.stats) * li.carryMult * biomeMult;

  const w = wind ? playWind(wind, shotBearing) : { along: 0, cross: 0 };

  const dispMult = li.dispersionMult * (input.dispersionMult ?? 1);
  const carrySd = intended * TUNABLES.carryDispersionFrac * dispMult;
  const lateralSd = intended * TUNABLES.lateralDispersionFrac * dispMult;

  const carry = Math.max(
    0,
    intended + w.along * TUNABLES.windCarryPerMph + rng.gaussian(0, carrySd),
  );
  const lateral = w.cross * TUNABLES.windLateralPerMph + rng.gaussian(0, lateralSd);

  // Unit vector along the shot bearing (bearing is cw from +Y).
  const br = deg2rad(shotBearing);
  const fx = Math.sin(br);
  const fy = Math.cos(br);
  // Right-perpendicular (for lateral push): rotate forward −90°.
  const rx = fy;
  const ry = -fx;

  const landing: Vec = [
    from[0] + fx * carry + rx * lateral,
    from[1] + fy * carry + ry * lateral,
  ];

  return { landing, carry, shotBearing, wind: w, intended };
}
