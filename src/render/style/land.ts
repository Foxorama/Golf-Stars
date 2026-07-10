/**
 * The hole's LAND footprint (GS-rough-frame, split out in GS-style-split): the rounded land hull
 * to the OB frame, a lost-rough hole's dilate-unioned play platforms, and the per-hole cache of
 * the hazard families' union-merged bodies (GS-hazard-blend). Course-space pure geometry — the
 * single source `buildScene` draws AND the play view's animated star-mask reads.
 */

import type { Hole, Vec } from '../../sim/course/contract';
import { playBounds } from '../../sim/round';
import { unionPolys, dilateUnion } from '../merge';
import { mulberry32, hashHole, type Box } from './shared';
import { WATER_KINDS, LAVA_KINDS } from './hazards';

/** A rounded, gently-irregular rectangle hull (course space) — the floating LANDMASS reads as an
 *  island, not a picture frame. Each corner sweeps a 90° arc with a small seeded radius wobble; the
 *  straight runs between corners keep the hole comfortably inside. Off its own rng so it never
 *  perturbs the terrain or celestial streams. */
function roundedHull(box: Box, r: number, jit: number, rng: () => number): Vec[] {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const rr = Math.max(1, Math.min(r, w / 2, h / 2));
  const cc: Vec[] = [
    [box.maxX - rr, box.minY + rr], // top-right
    [box.maxX - rr, box.maxY - rr], // bottom-right
    [box.minX + rr, box.maxY - rr], // bottom-left
    [box.minX + rr, box.minY + rr], // top-left
  ];
  const startAng = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const per = 5;
  const pts: Vec[] = [];
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k <= per; k++) {
      const a = startAng[i]! + (Math.PI / 2) * (k / per);
      const wob = 1 + (rng() - 0.5) * jit;
      pts.push([cc[i]![0] + Math.cos(a) * rr * wob, cc[i]![1] + Math.sin(a) * rr * wob]);
    }
  }
  return pts;
}

/** Yards of ground beyond the dashed OB line (GS-rough-frame) — the stakes stand on the land rim. */
const LAND_PAD = 7;

/** The normal-world LAND HULL in COURSE space: the OB play-bounds box + apron, gently rounded.
 *  Corner radius is capped near 3·LAND_PAD so the rounded arc never cuts inside the OB rectangle
 *  (the stakes always stand on land). Own seeded rng — never perturbs the terrain/celestial streams. */
export function landHullCourse(hole: Hole): Vec[] {
  const pbb = playBounds(hole);
  const lb: Box = {
    minX: pbb.min[0] - LAND_PAD,
    minY: pbb.min[1] - LAND_PAD,
    maxX: pbb.max[0] + LAND_PAD,
    maxY: pbb.max[1] + LAND_PAD,
  };
  const hrng = mulberry32((hashHole(hole) ^ 0x1b873593) >>> 0);
  return roundedHull(lb, Math.min(3 * LAND_PAD, Math.min(lb.maxX - lb.minX, lb.maxY - lb.minY) * 0.22), 0.1, hrng);
}

/** A lost-rough hole's land platforms in COURSE space: every play feature (fairway pieces + tee +
 *  GREEN), grown by a turf margin and UNION-merged — touching pads join into one continuous
 *  platform. Built with the fold-proof grid dilation (`dilateUnion`): the old mitred
 *  `offsetPoly(-14)` outset self-intersected at a concave bend, and the flipped winding left the
 *  fold UNFILLED — the "star gap between the fairway and the border" on Cetus. Including the green
 *  fixes the other seam: a green fatter than the corridor nose used to overhang the open deep.
 *  Cached per hole (pure function of the hole) so the per-frame follow-cam rebuild pays nothing. */
const lostPlatformsCache = new WeakMap<Hole, Vec[][]>();
export function lostPlatformsCourse(hole: Hole): Vec[][] {
  const hit = lostPlatformsCache.get(hole);
  if (hit) return hit;
  const feats = hole.features.filter((f) => f.kind === 'fairway' || f.kind === 'green' || f.kind === 'tee');
  const out = dilateUnion(feats.map((f) => f.poly), 14, 3);
  lostPlatformsCache.set(hole, out);
  return out;
}

/** Per-hole cache of the hazard families' UNION-merged course-space bodies (GS-hazard-blend) —
 *  pure geometry per hole, rebuilt scenes (the follow-cam re-renders every frame) reuse it. */
const mergedHazardsCache = new WeakMap<Hole, { sand: Vec[][]; water: Vec[][]; lava: Vec[][] }>();
export function mergedHazardsFor(hole: Hole): { sand: Vec[][]; water: Vec[][]; lava: Vec[][] } {
  const hit = mergedHazardsCache.get(hole);
  if (hit) return hit;
  const sand: Vec[][] = [];
  const water: Vec[][] = [];
  const lava: Vec[][] = [];
  for (const f of hole.hazards) {
    if (WATER_KINDS.has(f.kind)) water.push(f.poly);
    else if (LAVA_KINDS.has(f.kind)) lava.push(f.poly);
    else if (f.kind === 'bunker' || f.kind === 'waste' || f.kind === 'sand' || f.kind === 'pot') sand.push(f.poly);
  }
  const out = { sand: unionPolys(sand), water: unionPolys(water), lava: unionPolys(lava) };
  mergedHazardsCache.set(hole, out);
  return out;
}

/** The derelict world's BREACHES (GS-ship-interior): acid-etched holes eaten through the deck to
 *  space — `breach` HAZARDS (a lost-ball penalty), union-merged so touching pits fuse into one. Also
 *  folds any `bunker`/`pot`/`sand` (a rare fair-placement fallback) so a stray sand body still reads
 *  as a breach, never a beach. (`waste` scatter is a FEATURE → a steel deck plate, handled
 *  separately.) Course space, cached per hole (camera-proof body counts). */
const derelictBreachCache = new WeakMap<Hole, Vec[][]>();
export function derelictBreachesFor(hole: Hole): Vec[][] {
  const hit = derelictBreachCache.get(hole);
  if (hit) return hit;
  const breaches: Vec[][] = [];
  for (const f of hole.hazards) {
    if (f.kind === 'breach' || f.kind === 'bunker' || f.kind === 'pot' || f.kind === 'sand') breaches.push(f.poly);
  }
  const out = unionPolys(breaches);
  derelictBreachCache.set(hole, out);
  return out;
}

/**
 * The hole's full LAND footprint in COURSE space (GS-rough-frame) — the single source `buildScene`
 * draws AND the play view's animated weather layer masks its twinkle starfield with, so the pinned
 * stars only ever twinkle over true deep space, never over playable turf (the graphic IS the
 * physics, animated edition). Normal hole → one rough hull to the OB frame; lost-rough ARMED
 * (`roughLie` biomeMod) → a platform per play feature; Rainbow Road → no land at all (`[]`).
 */
export function landPolysCourseFor(hole: Hole, rainbow = false): Vec[][] {
  if (rainbow) return [];
  const lost = hole.biomeMods?.some((m) => m.kind === 'roughLie') ?? false;
  return lost ? lostPlatformsCourse(hole) : [landHullCourse(hole)];
}
