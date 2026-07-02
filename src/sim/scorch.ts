/**
 * Meteor-strike SCORCH MARKS (GS-meteor-scorch) — the meteor-shower route's signature, charred
 * craters burned into the turf where strikes came down. The follow-up to GS-tents: a second course
 * effect that is also a (small, fair) GAME MECHANIC instead of pure sky-dressing.
 *
 * Two ideas, both PURE & deterministic:
 *
 *  1. PLACEMENT — a handful of craters scattered along the play corridor (seeded off the HOLE
 *     GEOMETRY on a private rng stream, so the same hole always burns the same marks and the play
 *     rng stream is never touched), kept OFF the green, the tee box and every non-turf surface —
 *     a strike only ever chars soft turf (fairway/rough/waste/fescue), never a penalty area, sand
 *     or the putting surface. Non-penalty by construction: fairness validators are untouched.
 *
 *  2. THE LIE — a ball at REST on a mark plays a `scorch` lie next shot (`LIE_INFO.scorch`): the
 *     ball comes out HOT off the baked crust (a touch of extra carry) but ash and cinders make it
 *     WILD (a real dispersion tax) — spicier than rough, never a stroke. Resolved in the shared
 *     `executeShot` (the rest-lie conversion), so auto ≡ interactive byte-for-byte.
 *
 * Gated to the meteor-shower course effect at the call sites (`playerHoleOpts` / the interactive
 * driver); a hole without it never builds marks, so every other course is byte-for-byte unchanged.
 * The renderer draws the craters from THIS same function (the graphic IS the physics — a mark you
 * see is exactly the mark the sim reads).
 */

import type { Hole, Vec } from './course/contract';
import { dist } from './course/contract';
import { Rng } from './rng';
import { lieAt } from './shot';

export interface ScorchMark {
  /** Crater centre (course space). */
  c: Vec;
  /** Crater radius (yards) — the ball is "on the mark" within this. */
  r: number;
  /** Variant index for the render layer's crater art. Render-only. */
  variant: number;
}

/** The lie kind a rest on a mark converts to (a `LIE_INFO` row — hot but wild, never a penalty). */
export const SCORCH_LIE = 'scorch';
/** Most craters a hole carries. */
export const SCORCH_MAX = 6;
/** Crater radius range (yards) — big enough to matter, small enough to play around. */
export const SCORCH_MIN_R = 3.5;
export const SCORCH_MAX_R = 6;
/** Lies a strike can char — soft turf ONLY. A green/tee/sand/penalty rest keeps its own read
 *  (usually harsher or rule-bearing), so scorch never overrides a stricter rule. */
export const SCORCHABLE: ReadonlySet<string> = new Set(['fairway', 'rough', 'waste', 'fescue']);

/** Clearance kept between a crater edge and the green surface / tee box (fairness margins). */
const GREEN_MARGIN = 14;
const TEE_MARGIN = 25;
/** Minimum gap between crater edges so strikes read as a scatter, not one blob. */
const MIN_GAP = 12;
/** Candidate slots tried (a fixed budget — placement never loops unbounded). */
const CANDIDATES = 16;

/** Rough radius of the green feature (mean centroid→vertex), or a sensible fallback.
 *  (Exported for `sim/patches.ts`, the generalised patch machinery — GS-journey-fx-2.) */
export function greenRadius(hole: Hole): number {
  const g = hole.features.find((f) => f.kind === 'green');
  if (!g || g.poly.length < 3) return 12;
  let r = 0;
  for (const p of g.poly) r += dist(p, hole.green);
  return r / g.poly.length;
}

/** Point + travel direction at fraction `t` (0..1 by arc length) along the centreline.
 *  (Exported for `sim/patches.ts`, the generalised patch machinery — GS-journey-fx-2.) */
export function centrelinePoint(cl: readonly Vec[], t: number): { p: Vec; dir: Vec } {
  if (cl.length < 2) {
    const p = cl[0] ?? ([0, 0] as Vec);
    return { p: [p[0], p[1]], dir: [0, 1] };
  }
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < cl.length; i++) {
    total += dist(cl[i - 1]!, cl[i]!);
    lens.push(total);
  }
  const want = t * total;
  let i = 0;
  while (i < lens.length - 1 && lens[i]! < want) i++;
  const segStart = i === 0 ? 0 : lens[i - 1]!;
  const a = cl[i]!;
  const b = cl[i + 1]!;
  const segLen = lens[i]! - segStart || 1;
  const f = Math.max(0, Math.min(1, (want - segStart) / segLen));
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const m = Math.hypot(dx, dy) || 1;
  return { p: [a[0] + dx * f, a[1] + dy * f], dir: [dx / m, dy / m] };
}

/**
 * The meteor-strike craters for a hole — deterministic, seeded off the HOLE GEOMETRY on a private
 * stream (never the play rng). Up to `SCORCH_MAX` marks scattered along the mid corridor with
 * lateral spread, each accepted only on soft turf, clear of the green + tee, and clear of the other
 * marks. Same hole → identical marks, byte-stable across reloads and across both drivers.
 */
export function meteorScorch(hole: Hole): ScorchMark[] {
  const rng = new Rng(`scorch:${hole.tee[0]},${hole.tee[1]}:${hole.green[0]},${hole.green[1]}:${hole.par}`);
  const gClear = greenRadius(hole) + GREEN_MARGIN;
  const marks: ScorchMark[] = [];
  for (let i = 0; i < CANDIDATES && marks.length < SCORCH_MAX; i++) {
    // Mid-corridor band (clear of the tee walk-off and the final approach), with lateral scatter
    // wide enough to char the rough a loose drive finds, not just the mown line.
    const t = 0.2 + rng.float() * 0.68;
    const off = (rng.float() * 2 - 1) * 26;
    const r = SCORCH_MIN_R + rng.float() * (SCORCH_MAX_R - SCORCH_MIN_R);
    const { p, dir } = centrelinePoint(hole.centreline, t);
    const c: Vec = [p[0] - dir[1] * off, p[1] + dir[0] * off];
    if (dist(c, hole.green) <= gClear + r) continue; // never chars (or crowds) the green
    if (dist(c, hole.tee) <= TEE_MARGIN + r) continue; // the tee box stays clean
    if (!SCORCHABLE.has(lieAt(hole, c))) continue; // soft turf only — never sand/penalty/green
    if (marks.some((m) => dist(m.c, c) < MIN_GAP + m.r + r)) continue; // a scatter, not a blob
    marks.push({ c, r, variant: marks.length });
  }
  return marks;
}

/** Whether a point lies on any mark (the rest-lie conversion test). Pure. */
export function inScorch(marks: readonly ScorchMark[], p: Vec): boolean {
  return marks.some((m) => dist(p, m.c) <= m.r);
}
