/**
 * Shared prim vocabulary + deterministic helpers for the scene builder (GS-style-split).
 * Everything here is pure, DOM-free and painter-agnostic: the `Prim` drawing set, the
 * `ArtFeel` escape-hatch, the mulberry32/hashHole seeded-rng plumbing, small geometry
 * helpers, the mowing-stripe fills and the shared GS-inset light. Painters import from here;
 * this module imports from NO other style/ module (the split's dependency root).
 */

import type { Hole, Vec } from '../../sim/course/contract';
import { dist } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import { mixHex } from '../palette';
import type { Projector } from '../project';

// ---------------------------------------------------------------------------
// Drawing primitives (screen-space). Both interpreters understand this set.
// ---------------------------------------------------------------------------

export type Prim =
  | { t: 'poly'; pts: Vec[]; fill?: string; stroke?: string; sw?: number; dash?: number[] }
  | { t: 'circle'; c: Vec; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'line'; a: Vec; b: Vec; stroke: string; sw: number; round?: boolean; dash?: number[] }
  /** An OPEN stroked polyline (never closed/filled — a 'poly' closes with a chord, which would slash
   *  straight across an open curve). Topo isolines (GS-green-contour-2) are the first user. */
  | { t: 'path'; pts: Vec[]; stroke: string; sw: number; round?: boolean; dash?: number[] }
  /** A SOFT radial glow: `col` (rgba) at the centre fading to fully transparent at radius `r`. The
   *  intro's sky is built from screen-blended soft nebulae — this brings the same look in-game so a
   *  nebula reads as a luminous wash, not a hard-edged flat disc (the "weird static blob" bug). */
  | { t: 'glow'; c: Vec; r: number; col: string }
  /** Draw `children` clipped to the `clip` polygon (used for mowing stripes). */
  | { t: 'clip'; clip: Vec[]; children: Prim[] };

/** Split an `rgba()/rgb()/#hex` colour into an `rgb()` string + its alpha (render helper). */
export function rgbaParts(col: string): { rgb: string; a: number } {
  const m = col.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1]!.split(',').map((s) => s.trim());
    return { rgb: `rgb(${p[0]},${p[1]},${p[2]})`, a: p[3] !== undefined ? Number(p[3]) : 1 };
  }
  const h = col.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return { rgb: `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`, a: 1 };
}
/** The same colour at zero alpha — the outer stop of a glow gradient. */
export function fadeCol(col: string): string {
  const { rgb } = rgbaParts(col);
  return rgb.replace('rgb(', 'rgba(').replace(')', ',0)');
}
/** Scale an rgba colour's alpha (clamped to 1) — for tuning a glow's peak brightness. */
export function scaleAlpha(col: string, k: number): string {
  const { rgb, a } = rgbaParts(col);
  return rgb.replace('rgb(', 'rgba(').replace(')', `,${Math.min(1, a * k).toFixed(3)})`);
}

/** Art tunables (escape-hatch). Multipliers gate density; `0` switches a layer off. */
export interface ArtFeel {
  stripes: boolean;
  ink: boolean;
  texture: number; // rough tufts / tone patches density
  accents: number; // wildflowers / motes / birds density
}
export const ART_DEFAULTS: ArtFeel = { stripes: true, ink: true, texture: 1, accents: 1 };
/** Merge caller art with a `window._gsArt` override when in a browser (node-safe). */
export function artFeel(art?: ArtFeel): ArtFeel {
  let win: Partial<ArtFeel> = {};
  if (typeof window !== 'undefined') {
    win = (window as unknown as { _gsArt?: Partial<ArtFeel> })._gsArt ?? {};
  }
  return { ...ART_DEFAULTS, ...art, ...win };
}
// ---------------------------------------------------------------------------
// Deterministic RNG + small geometry helpers
// ---------------------------------------------------------------------------

/** mulberry32 — the same tiny deterministic PRNG the intro uses; no `Math.random`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of a hole's geometry → an art seed (independent of the sim's seeded stream). */
export function hashHole(h: Hole): number {
  let s = 2166136261 >>> 0;
  const mix = (x: number) => {
    s ^= Math.round(x * 1000) | 0;
    s = Math.imul(s, 16777619) >>> 0;
  };
  mix(h.tee[0]); mix(h.tee[1]); mix(h.green[0]); mix(h.green[1]); mix(h.par);
  for (const f of [...h.features, ...h.hazards]) {
    mix(f.poly.length);
    mix(f.poly[0]![0]);
    mix(f.poly[0]![1]);
  }
  return s >>> 0;
}

export function centroidOf(pts: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export function bboxOf(pts: Vec[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Scale a polygon toward (k<1) or away from (k>1) its centroid — depth rings / collars. */
export function scalePoly(pts: Vec[], c: Vec, k: number): Vec[] {
  return pts.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k] as Vec);
}

/** Signed area (screen space) — its sign is the winding, so an offset knows which way is inward. */
function signedArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Offset a polygon by a UNIFORM perpendicular distance — positive `d` shrinks it inward, negative
 * grows it outward — by mitring each vertex along its edge-normal bisector. Unlike scaling toward
 * the centroid (which collapses a long thin band into a centred sliver), this hugs the actual shape:
 * a RIVER band gets channel-following depth rings, and a turf fringe is uniform-width on a kidney
 * green or a long fairway alike. The miter is clamped so a reflex vertex can't spike; depth bands
 * are drawn filled on top so the rare self-touch on a very thin neck is hidden.
 */
export function offsetPoly(pts: Vec[], d: number): Vec[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const sign = signedArea(pts) >= 0 ? 1 : -1; // winding → which bisector direction is interior
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    let e1x = cur[0] - prev[0];
    let e1y = cur[1] - prev[1];
    let e2x = next[0] - cur[0];
    let e2y = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = -e1y; const n1y = e1x; // left normals of the two edges
    const n2x = -e2y; const n2y = e2x;
    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    const cos = bx * n1x + by * n1y || 1; // half-angle cosine → miter length
    let m = (d * sign) / cos;
    const cap = 4 * Math.abs(d);
    if (m > cap) m = cap;
    else if (m < -cap) m = -cap;
    out.push([cur[0] + bx * m, cur[1] + by * m]);
  }
  return out;
}

/** The polygon's longest chord (the two farthest-apart vertices) → a channel's flow direction +
 *  rough length. `n` is small (≤~20 here) so the O(n²) scan is cheap. */
export function longAxis(pts: Vec[]): { len: number; dir: Vec; a: Vec; b: Vec } {
  let best = 0;
  let ai = 0;
  let bi = pts.length > 1 ? 1 : 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = dist(pts[i]!, pts[j]!);
      if (d > best) { best = d; ai = i; bi = j; }
    }
  }
  const a = pts[ai]!;
  const b = pts[bi]!;
  const l = best || 1;
  return { len: best, dir: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], a, b };
}

/** Extent of a polygon measured ALONG a unit direction (max − min projection). */
export function extentAlong(pts: Vec[], dx: number, dy: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const t = p[0] * dx + p[1] * dy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return hi - lo;
}
export function n1(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0;
}
// ---------------------------------------------------------------------------
// Per-surface stylers (return screen-space prims for one projected polygon)
// ---------------------------------------------------------------------------

/** Horizontal mowing bands clipped to a (screen-space) polygon. After the projector rotates
 *  tee→green up-screen, horizontal bands run perpendicular to play — i.e. real mowing stripes. */
/** Soft band-edge feather (GS-mow-blend). The mowing bands used to butt at a hard line — the tone
 *  jump read as ruled tape, not a mown transition. Each interior boundary gets a short 2-step ramp
 *  of intermediate tones (35%/65% mixes, width a fraction of the band) laid OVER the bands, so one
 *  stripe eases into the next. Pure geometry, zero rng — the SVG stays byte-stable. */
const FEATHER_FRAC = 0.16;
/** Mowing bands on an EXPLICIT grid (phase origin + band height). Sharing one grid across several
 *  polygons keeps their stripes continuous — what lets the green apron line up with the corridor. */
export function stripesAt(poly: Vec[], colA: string, colB: string, phaseY: number, bandH: number): Prim {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  const hBand = (y0: number, y1: number, fill: string): Prim => ({
    t: 'poly',
    pts: [
      [b.minX, y0],
      [b.maxX, y0],
      [b.maxX, y1],
      [b.minX, y1],
    ],
    fill,
  });
  const i0 = Math.floor((b.minY - phaseY) / bandH);
  for (let i = i0; phaseY + i * bandH < b.maxY; i++) {
    const y0 = phaseY + i * bandH;
    // overlap a hair so no seam shows
    children.push(hBand(y0, y0 + bandH + 0.5, ((i % 2) + 2) % 2 === 0 ? colA : colB));
  }
  // Feather every boundary (GS-mow-blend): ease out of the band above, into the band below.
  const f = bandH * FEATHER_FRAC;
  const m35 = mixHex(colA, colB, 0.35);
  const m65 = mixHex(colA, colB, 0.65);
  for (let i = i0 + 1; phaseY + i * bandH < b.maxY; i++) {
    const y = phaseY + i * bandH;
    const belowIsA = ((i % 2) + 2) % 2 === 0; // colour of the band BELOW this boundary
    children.push(hBand(y - f, y, belowIsA ? m65 : m35));
    children.push(hBand(y, y + f, belowIsA ? m35 : m65));
  }
  return { t: 'clip', clip: poly, children };
}

export function stripes(poly: Vec[], colA: string, colB: string, bands: number): Prim {
  const b = bboxOf(poly);
  return stripesAt(poly, colA, colB, b.minY, (b.maxY - b.minY) / bands);
}

/** VERTICAL mowing bands (along X) — a groomed "grain" running down the hole rather than across it
 *  (GS-variety-2, used for the frost world's swept-ice fairways). */
export function stripesAtV(poly: Vec[], colA: string, colB: string, phaseX: number, bandW: number): Prim {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  const vBand = (x0: number, x1: number, fill: string): Prim => ({
    t: 'poly',
    pts: [
      [x0, b.minY],
      [x1, b.minY],
      [x1, b.maxY],
      [x0, b.maxY],
    ],
    fill,
  });
  const i0 = Math.floor((b.minX - phaseX) / bandW);
  for (let i = i0; phaseX + i * bandW < b.maxX; i++) {
    const x0 = phaseX + i * bandW;
    children.push(vBand(x0, x0 + bandW + 0.5, ((i % 2) + 2) % 2 === 0 ? colA : colB));
  }
  // Feather every boundary (GS-mow-blend), same 2-step ramp as the horizontal bands.
  const f = bandW * FEATHER_FRAC;
  const m35 = mixHex(colA, colB, 0.35);
  const m65 = mixHex(colA, colB, 0.65);
  for (let i = i0 + 1; phaseX + i * bandW < b.maxX; i++) {
    const x = phaseX + i * bandW;
    const rightIsA = ((i % 2) + 2) % 2 === 0;
    children.push(vBand(x - f, x, rightIsA ? m65 : m35));
    children.push(vBand(x, x + f, rightIsA ? m35 : m65));
  }
  return { t: 'clip', clip: poly, children };
}

/** DIAGONAL mowing bands: bands of constant `y − slope·x`, clipped to the poly (GS-variety-2 — the
 *  faceted grain of the crystal world, the wind-swept grain of the tempest/desert worlds). */
export function slantStripes(poly: Vec[], colA: string, colB: string, bandH: number, slope: number): Prim {
  const b = bboxOf(poly);
  const uAt = (x: number, y: number) => y - slope * x;
  const us = [uAt(b.minX, b.minY), uAt(b.maxX, b.minY), uAt(b.minX, b.maxY), uAt(b.maxX, b.maxY)];
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const children: Prim[] = [];
  const uBand = (a0: number, a1: number, fill: string): Prim => ({
    t: 'poly',
    pts: [
      [b.minX, a0 + slope * b.minX],
      [b.maxX, a0 + slope * b.maxX],
      [b.maxX, a1 + slope * b.maxX],
      [b.minX, a1 + slope * b.minX],
    ],
    fill,
  });
  for (let i = 0; uMin + i * bandH < uMax; i++) {
    const a0 = uMin + i * bandH;
    children.push(uBand(a0, a0 + bandH + 0.5, ((i % 2) + 2) % 2 === 0 ? colA : colB));
  }
  // Feather every boundary (GS-mow-blend), the same 2-step ramp run along the slanted grid.
  const f = bandH * FEATHER_FRAC;
  const m35 = mixHex(colA, colB, 0.35);
  const m65 = mixHex(colA, colB, 0.65);
  for (let i = 1; uMin + i * bandH < uMax; i++) {
    const u = uMin + i * bandH;
    const nextIsA = ((i % 2) + 2) % 2 === 0;
    children.push(uBand(u - f, u, nextIsA ? m65 : m35));
    children.push(uBand(u, u + f, nextIsA ? m35 : m65));
  }
  return { t: 'clip', clip: poly, children };
}

/** CHECKERBOARD mowing (both directions) — the dense, lush cross-mown look of the spore-jungle. */
export function checkerStripes(poly: Vec[], colA: string, colB: string, cell: number): Prim {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  let j = 0;
  for (let y = b.minY; y < b.maxY; y += cell, j++) {
    let i = 0;
    for (let x = b.minX; x < b.maxX; x += cell, i++) {
      children.push({
        t: 'poly',
        pts: [
          [x, y],
          [x + cell + 0.5, y],
          [x + cell + 0.5, y + cell + 0.5],
          [x, y + cell + 0.5],
        ],
        fill: (i + j) % 2 === 0 ? colA : colB,
      });
    }
  }
  // Feather (GS-mow-blend): in a checker EVERY neighbour flips tone, so one mid-tone strip along
  // each interior grid line (both directions) softens every edge at once.
  const f = cell * FEATHER_FRAC * 0.75; // slightly narrower — checker boundaries are denser
  const mid = mixHex(colA, colB, 0.5);
  for (let y = b.minY + cell; y < b.maxY; y += cell) {
    children.push({
      t: 'poly',
      pts: [
        [b.minX, y - f],
        [b.maxX, y - f],
        [b.maxX, y + f],
        [b.minX, y + f],
      ],
      fill: mid,
    });
  }
  for (let x = b.minX + cell; x < b.maxX; x += cell) {
    children.push({
      t: 'poly',
      pts: [
        [x - f, b.minY],
        [x + f, b.minY],
        [x + f, b.maxY],
        [x - f, b.maxY],
      ],
      fill: mid,
    });
  }
  return { t: 'clip', clip: poly, children };
}
/**
 * The per-world fairway/green mowing PATTERN (GS-variety-2, generalised by GS-green-complex): each
 * archetype grooms its turf differently — horizontal stripes (classic parkland), a vertical swept
 * grain (frost), a faceted/wind diagonal (crystal/tempest/desert), or a lush cross-mown checker
 * (jungle). Lives HERE (not in `fairway.ts`) because the GREEN mows in the same pattern as its own
 * fairway now: a world whose corridor is swept vertically and whose green was always striped
 * horizontally read as two different materials butted together (the "art assets stacked on each
 * other" report). `b0` is the grid the bands are phased off — pass the CORRIDOR's box for the
 * fairway pass so broken segments + the apron line up. Pure geometry, zero rng.
 */
export function mowPattern(
  poly: Vec[],
  hi: string,
  lo: string,
  b0: Box,
  arch: BiomeArchetype,
  bandH: number,
): Prim {
  switch (arch) {
    case 'frost':
      return stripesAtV(poly, hi, lo, b0.minX, bandH);
    case 'crystal':
      return slantStripes(poly, hi, lo, bandH * 0.95, 0.6);
    case 'tempest':
      return slantStripes(poly, hi, lo, bandH, -0.5);
    case 'desert':
      return slantStripes(poly, hi, lo, bandH, 0.28);
    case 'fungal':
      return checkerStripes(poly, hi, lo, bandH * 0.9);
    default: // verdant / ocean / inferno / void / cetus / … — the classic horizontal mowing stripes
      return stripesAt(poly, hi, lo, b0.minY, bandH);
  }
}

/**
 * A turf blend-band's SCREEN width for a band `yd` course-yards wide, at the projector's px-per-yard
 * `scale` (GS-green-complex).
 *
 * Every mown transition on the hole — the fairway's first cut, the green's apron and collar, the tee
 * pad's fringe — used to be a FIXED PIXEL offset. At the whole-hole map (~1 px/yd) 6px read as a
 * plausible ~6-yard apron; at the chip/putt camera (~6.6 px/yd), where the player actually looks at
 * the green, the same 6px collapsed to under a yard, so the green butted the fairway on a hairline
 * and the two surfaces read as stacked art assets rather than one mown complex. Sizing the bands in
 * YARDS makes the complex scale-honest — the same apron at every camera. Floored so it never
 * vanishes at whole-hole zoom, capped so a deep zoom can't flood the frame. Sizes may read the
 * projection (the camera contract allows colours/sizes; only COUNTS must not), and it is pure.
 */
export function turfPx(scale: number, yd: number, minPx = 2, maxPx = 64): number {
  const px = yd * (scale > 0 ? scale : 1);
  return px < minPx ? minPx : px > maxPx ? maxPx : px;
}

/**
 * A smooth OUTWARD blend ramp around a play surface (GS-green-complex): `steps` nested rings running
 * from `outerPx` in to the surface edge, each filled with a mix walking `outer` → `inner`. Two or
 * three opaque rings read as concentric stickers however carefully the tones are picked — the eye
 * finds the step. Enough steps and the per-step tone jump falls under the banding threshold, so the
 * transition reads as ground. Widest ring FIRST (each is drawn over the last). Pure, zero rng.
 */
export function turfRamp(poly: Vec[], outerPx: number, outer: string, inner: string, steps = 6): Prim[] {
  const out: Prim[] = [];
  const n = Math.max(1, Math.round(steps));
  for (let i = 0; i < n; i++) {
    const u = i / n; // 0 = the outermost (widest, most `outer`-toned) ring
    out.push({ t: 'poly', pts: offsetPoly(poly, -outerPx * (1 - u)), fill: mixHex(outer, inner, u) });
  }
  return out;
}

/**
 * The same ramp drawn as ALPHA tints rather than opaque fills (GS-green-complex) — for a collar that
 * sits ON TOP of an already-dressed surface (the green's collar over the flared fairway apron). An
 * opaque ring wipes the fairway's mowing stripes, sheen and texture and re-reads as a painted ring
 * around the green; a tint carries the same colour walk while the groundskeeping underneath shows
 * through, so the collar reads as the fairway MOWN DOWN toward the green. Pure, zero rng.
 */
export function turfRampTint(poly: Vec[], outerPx: number, col: string, peakAlpha: number, steps = 6): Prim[] {
  const out: Prim[] = [];
  const n = Math.max(1, Math.round(steps));
  for (let i = 0; i < n; i++) {
    const u = i / n;
    // Each ring adds another tint layer, so alpha ACCUMULATES inward toward the green edge; keep the
    // per-ring alpha low and let the stacking do the grading.
    out.push({ t: 'poly', pts: offsetPoly(poly, -outerPx * (1 - u)), fill: hexAlpha(col, peakAlpha * (0.35 + 0.65 * u)) });
  }
  return out;
}

// GS-inset: ONE global light — the sun sits upper-left (matching the green's lit highlight and the
// cetus raised-shelf), so every carved feature shades the same way and the hole reads as one lit
// landform instead of a collage of stickers. Unit vector pointing TOWARD the light.
export const LIGHT_UL: Vec = [-0.576, -0.816];

export function shiftPoly(pts: Vec[], dx: number, dy: number): Vec[] {
  return pts.map((p) => [p[0] + dx, p[1] + dy] as Vec);
}
/** Deterministic 0..1 hash off a position (GS-biome-feel) — extra per-flora/per-decor variation
 *  WITHOUT extra rng draws, so every world's art stream stays byte-identical to the classic one.
 *  ALWAYS key it off a COURSE-space position, never a projected pixel: the play view rebuilds the
 *  scene through a moving projector every frame, and a sub-pixel camera shift flips a screen-keyed
 *  hash to a completely different value — the "decor jerks wildly while the camera moves" bug. */
export function posHash(x: number, y: number, k = 0): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
/** Project a whole polygon to screen space. */
export function projPoly(poly: Vec[], proj: Projector): Vec[] {
  return poly.map((p) => proj.project(p));
}
/** Is a screen point within the (padded) view? Used to cull off-screen accents/tufts. */
export function inView(p: Vec, w: number, h: number, m = 24): boolean {
  return p[0] >= -m && p[0] <= w + m && p[1] >= -m && p[1] <= h + m;
}
/** `#rrggbb` + alpha → an `rgba()` string (render-only helper). */
export function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
