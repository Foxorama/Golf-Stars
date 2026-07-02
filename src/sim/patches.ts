/**
 * Effect GROUND PATCHES (GS-journey-fx-2) — the GS-meteor-scorch idea generalised into a family, so
 * every "sky-dressing" journey effect can leave a real, fair mark on the turf you then have to play:
 *
 *   • `stardust` (the COMET route) — glittering drifts shed off the tail. A BONUS lie: the charged
 *     dust launches the ball hot AND true (extra carry, tighter spray) — the one patch you AIM for.
 *   • `frost` (the FROSTFALL route) — rime frozen onto the turf. A ball at rest on it plays the
 *     existing `ice` lie: slick and skiddy, hard to control.
 *   • `junk` (the DEBRIS-FIELD route) — wreckage shards half-buried in the grass. A `junk` lie:
 *     the club snags on scrap, robbing distance and spraying wide. Worse than rough, never a stroke.
 *
 * Same contract as the scorch craters (sim/scorch.ts), machine-checked by tests/patches.test.ts:
 *
 *   1. PLACEMENT is a pure function of the HOLE GEOMETRY on a private seeded stream (`patch:<kind>:…`)
 *      — the play rng stream is NEVER touched, so an armed hole's shots are byte-identical to the
 *      unarmed hole's (only the rest-lie label can differ). Patches land on soft turf ONLY, clear of
 *      the green, the tee and each other; never a penalty area, sand or the putting surface —
 *      fairness validators are untouched by construction.
 *
 *   2. THE LIE — a ball at REST on a patch plays that family's lie next shot, resolved in the shared
 *      `executeShot` rest-lie conversion (exactly like scorch), so auto ≡ interactive byte-for-byte.
 *
 *   3. THE GRAPHIC IS THE PHYSICS — the renderer draws the patches from THIS same function, so a
 *      drift you see is exactly the lie the sim reads.
 *
 * Gated to the owning course effect at the call sites (`playerHoleOpts` / the interactive reducer);
 * a hole without the effect never builds patches, so every other course is byte-for-byte unchanged.
 */

import type { Hole, Vec } from './course/contract';
import { dist } from './course/contract';
import { Rng } from './rng';
import { lieAt } from './shot';
import { greenRadius, centrelinePoint, SCORCHABLE } from './scorch';

/** The patch families a course effect can scatter (see EFFECT_PATCH in rpg/effects.ts). */
export type PatchKind = 'stardust' | 'frost' | 'junk';

export interface GroundPatch {
  /** Patch centre (course space). */
  c: Vec;
  /** Patch radius (yards) — the ball is "on the patch" within this. */
  r: number;
  /** Variant index for the render layer's art. Render-only. */
  variant: number;
}

export interface PatchSpec {
  /** The `LIE_INFO` row a rest on this patch converts to. */
  lie: string;
  /** Most patches a hole carries. */
  max: number;
  /** Patch radius range (yards). */
  minR: number;
  maxR: number;
}

/** Per-family character (content-as-data): the lie each family plays and how it scatters. The bonus
 *  stardust drifts are slightly bigger (you want to FIND them); wreckage is tighter and meaner. */
export const PATCH_SPECS: Record<PatchKind, PatchSpec> = {
  stardust: { lie: 'stardust', max: 5, minR: 4, maxR: 7 },
  frost: { lie: 'ice', max: 6, minR: 4, maxR: 7 },
  junk: { lie: 'junk', max: 5, minR: 3.5, maxR: 6 },
};

/** Lies a patch can settle on — soft turf ONLY, the same set the scorch craters use: a green/tee/
 *  sand/penalty rest keeps its own (harsher or rule-bearing) read. */
export const PATCHABLE: ReadonlySet<string> = SCORCHABLE;

/** Clearance kept between a patch edge and the green surface / tee box (fairness margins). */
const GREEN_MARGIN = 14;
const TEE_MARGIN = 25;
/** Minimum gap between patch edges so the family reads as a scatter, not one blob. */
const MIN_GAP = 12;
/** Candidate slots tried (a fixed budget — placement never loops unbounded). */
const CANDIDATES = 16;

/**
 * The ground patches of `kind` for a hole — deterministic, seeded off the HOLE GEOMETRY on a private
 * per-kind stream (never the play rng). Same placement algorithm as the scorch craters: scattered
 * along the mid corridor with lateral spread, accepted only on soft turf, clear of the green + tee,
 * and clear of each other. Same hole + kind → identical patches, byte-stable across reloads and
 * across both drivers.
 */
export function effectPatches(hole: Hole, kind: PatchKind): GroundPatch[] {
  const spec = PATCH_SPECS[kind];
  const rng = new Rng(`patch:${kind}:${hole.tee[0]},${hole.tee[1]}:${hole.green[0]},${hole.green[1]}:${hole.par}`);
  const gClear = greenRadius(hole) + GREEN_MARGIN;
  const patches: GroundPatch[] = [];
  for (let i = 0; i < CANDIDATES && patches.length < spec.max; i++) {
    // Mid-corridor band (clear of the tee walk-off and the final approach), with lateral scatter
    // wide enough to reach the rough a loose drive finds, not just the mown line.
    const t = 0.2 + rng.float() * 0.68;
    const off = (rng.float() * 2 - 1) * 26;
    const r = spec.minR + rng.float() * (spec.maxR - spec.minR);
    const { p, dir } = centrelinePoint(hole.centreline, t);
    const c: Vec = [p[0] - dir[1] * off, p[1] + dir[0] * off];
    if (dist(c, hole.green) <= gClear + r) continue; // never crowds the putting surface
    if (dist(c, hole.tee) <= TEE_MARGIN + r) continue; // the tee box stays clean
    if (!PATCHABLE.has(lieAt(hole, c))) continue; // soft turf only — never sand/penalty/green
    if (patches.some((m) => dist(m.c, c) < MIN_GAP + m.r + r)) continue; // a scatter, not a blob
    patches.push({ c, r, variant: patches.length });
  }
  return patches;
}

/** Whether a point lies on any patch (the rest-lie conversion test). Pure. */
export function inPatch(patches: readonly GroundPatch[], p: Vec): boolean {
  return patches.some((m) => dist(p, m.c) <= m.r);
}
