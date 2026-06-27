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
 *  2. The ARC HEIGHT is a loft-scaled parabola: lofted/short clubs fly relatively higher, long
 *     clubs flatter. Tall obstacles (trees) have a canopy height; if the ball's arc height where it
 *     crosses a tree is BELOW that canopy it's knocked down INTO the tree (a tough non-penalty lie),
 *     so arc height genuinely matters — a high wedge drops over a guarding tree a low runner clips.
 */

import type { Hole, Vec } from './course/contract';
import { pointInPoly, segDist } from './course/contract';

// --- Arc height --------------------------------------------------------------
export interface ArcFeel {
  /** Peak height as a fraction of carry for a LONG club (driver). */
  peakFracLong: number;
  /** Peak height as a fraction of carry for a SHORT/lofted club (wedge). */
  peakFracShort: number;
  /** Carry at/below which a club flies at the short (high-loft) fraction. */
  loftCarry: number;
  /** Carry at/above which a club flies at the long (flat) fraction. */
  flatCarry: number;
  /** Floor / ceiling on the apex (yards). */
  peakMin: number;
  peakMax: number;
}

export const ARC_FEEL: ArcFeel = {
  peakFracLong: 0.12,
  peakFracShort: 0.22,
  loftCarry: 70,
  flatCarry: 250,
  peakMin: 4,
  peakMax: 60,
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Aerial apex height (yards) for a shot of `carry`, flown by a club of `nominalCarry`. Lofted
 * (short) clubs peak higher relative to carry than long clubs, so a wedge balloons and a driver
 * bores — the lever that lets a high approach drop over a tree a flat one would clip. Pure.
 */
export function arcApex(carry: number, nominalCarry: number, feel: ArcFeel = ARC_FEEL): number {
  const t = clamp01((nominalCarry - feel.loftCarry) / (feel.flatCarry - feel.loftCarry));
  const frac = feel.peakFracShort + (feel.peakFracLong - feel.peakFracShort) * t;
  return Math.max(feel.peakMin, Math.min(feel.peakMax, Math.abs(carry) * frac));
}

/** Height above ground (yards) at normalised flight progress `t` ∈ [0,1] for a given apex — a
 *  simple parabola peaking at midflight, matching the render's `sampleFlight`. Pure. */
export function arcHeight(apex: number, t: number): number {
  return Math.sin(Math.PI * clamp01(t)) * apex;
}

// --- Curved ground path ------------------------------------------------------
const deg2rad = (d: number): number => (d * Math.PI) / 180;

/**
 * The Bézier CONTROL point: straight ahead of the ball, down the shot bearing, at the full carry
 * distance. With P0=from and P2=landing, a quadratic Bézier through this control launches along
 * the bearing (the aim line) and curves to the offset landing — the fade/hook banana. Pure.
 */
export function flightControl(from: Vec, bearingDeg: number, carry: number): Vec {
  const br = deg2rad(bearingDeg);
  return [from[0] + Math.sin(br) * carry, from[1] + Math.cos(br) * carry];
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
  /** Flight fraction at impact (0..1). */
  t: number;
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
  steps = 22,
): Knockdown | null {
  if (carry <= 0) return null;
  // Candidate obstacles: only those whose blob comes near the straight launch→landing chord
  // (broad-phase prune so we fine-walk a handful, not every tree on the hole).
  const candidates: { poly: Vec[]; canopy: number; inside: boolean }[] = [];
  for (const z of hole.hazards) {
    if (!OBSTACLE_KINDS.has(z.kind)) continue;
    const c = blobCentroid(z.poly);
    const r = blobRadius(z.poly);
    if (segDist(c, from, landing) > r + 6) continue;
    candidates.push({ poly: z.poly, canopy: canopyHeight(z.poly), inside: pointInPoly(from, z.poly) });
  }
  if (candidates.length === 0) return null;

  const control = flightControl(from, bearingDeg, carry);
  const apex = arcApex(carry, nominalCarry);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pos = flightGround(from, control, landing, t);
    const h = arcHeight(apex, t);
    for (const cand of candidates) {
      const inNow = pointInPoly(pos, cand.poly);
      // A fresh outside→inside crossing while below the canopy = a clip.
      if (inNow && !cand.inside && h < cand.canopy) {
        return { point: pos, carry: Math.hypot(pos[0] - from[0], pos[1] - from[1]), t };
      }
      cand.inside = inNow;
    }
  }
  return null;
}
