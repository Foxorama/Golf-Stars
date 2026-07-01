/**
 * Shared cell-shaded scene builder (GS graphic-upscale). ONE source of truth for the static
 * look of a hole, consumed by BOTH renderers — the pure SVG map (`holeView`) and the Canvas2D
 * play view (`playView`) — so they agree. The old draw paths painted every surface as a single
 * flat polygon on a flat rough slab, which read as a "landing strip". This module bands every
 * surface into a manga/comic look: flat tone bands + a bold ink outline, mowing stripes on the
 * cut grass, depth banding in water, lip-shadowed bunkers, 3-tone tree canopies, a textured
 * rough, and seeded "fun" accents (wildflowers / sparkle motes / birds).
 *
 * It is PURE (no DOM, no time): `buildScene` projects a hole into a flat list of screen-space
 * drawing `Prim`s; `scenePrimsToSvg` and `drawScenePrims` are the two thin interpreters. All
 * randomness is a deterministic mulberry32 seeded from a hash of the hole geometry — never
 * `Math.random` — so the SVG output is byte-stable (the render tests rely on it) and reads the
 * same across reloads. `window._gsArt` is the live A/B escape-hatch (guarded for node).
 */

import type { Feature, Hole, Vec } from '../sim/course/contract';
import { dist, pointInPoly, polylineDist } from '../sim/course/contract';
import { obStakes, playBoundsCorners } from '../sim/round';
import { tradeTents as tradeTentsFor, type TradeTent } from '../sim/tents';
import { themeById, archetypeFor, type BiomeArchetype } from '../sim/course/themes';
import { rarCol } from '../sim/rpg/loot';
import { constellationFigure } from './constellations';
import type { Projector } from './project';
import {
  accentFor,
  fillFor,
  turfShade,
  collarFor,
  landFillFor,
  spaceLookFor,
  mixHex,
  type Shade,
  SAND,
  WATER,
  LAVA,
  CANOPY,
  OB,
  OB_LOOK,
  type ObLook,
} from './palette';

// ---------------------------------------------------------------------------
// Drawing primitives (screen-space). Both interpreters understand this set.
// ---------------------------------------------------------------------------

export type Prim =
  | { t: 'poly'; pts: Vec[]; fill?: string; stroke?: string; sw?: number; dash?: number[] }
  | { t: 'circle'; c: Vec; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'line'; a: Vec; b: Vec; stroke: string; sw: number; round?: boolean; dash?: number[] }
  /** A SOFT radial glow: `col` (rgba) at the centre fading to fully transparent at radius `r`. The
   *  intro's sky is built from screen-blended soft nebulae — this brings the same look in-game so a
   *  nebula reads as a luminous wash, not a hard-edged flat disc (the "weird static blob" bug). */
  | { t: 'glow'; c: Vec; r: number; col: string }
  /** Draw `children` clipped to the `clip` polygon (used for mowing stripes). */
  | { t: 'clip'; clip: Vec[]; children: Prim[] };

/** Split an `rgba()/rgb()/#hex` colour into an `rgb()` string + its alpha (render helper). */
function rgbaParts(col: string): { rgb: string; a: number } {
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
function fadeCol(col: string): string {
  const { rgb } = rgbaParts(col);
  return rgb.replace('rgb(', 'rgba(').replace(')', ',0)');
}
/** Scale an rgba colour's alpha (clamped to 1) — for tuning a glow's peak brightness. */
function scaleAlpha(col: string, k: number): string {
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

export interface SceneOpts {
  width: number;
  height: number;
  biome?: string;
  /** Star-travel theme id (GS-17e) — draws that constellation in the sky, rarity-tinted. */
  themeId?: string;
  art?: ArtFeel;
  /** Rainbow Ball (GS-rainbow): paint the hole as RAINBOW ROAD — the fairway/green/tee/sand ribbon
   *  becomes a glowing rainbow road through the stars and everything off it is the bare starry void
   *  (it IS out of bounds; see `isRoadLie`). Render-only; the sim's OOB rule is the matching half.
   *  Baked at the app boundary from the live loadout (like `lefty`/`effect`), so no save/URL hook. */
  rainbow?: boolean;
  /** Trade-camp tents (GS-tents): the trade-market route pitches a ring of bright, COLLIDABLE tents
   *  around the green. Drawn in COURSE space (so they track the follow-cam — the fix for the old
   *  screen-space caravan that floated in mid-air). Baked at the app boundary from the course effect. */
  tradeTents?: boolean;
}

/** The Rainbow Road colour cycle (GS-rainbow) — a vivid 7-band rainbow the ribbon mows through. */
const RAINBOW_BANDS = ['#ff3b5c', '#ff9a3d', '#ffe23d', '#49e06b', '#3bd1ff', '#5a6bff', '#c46bff'];

/**
 * A rainbow-road ribbon (GS-rainbow): fill a play surface (fairway/green/tee) with bright rainbow
 * bands clipped to its polygon — perpendicular-to-play after the projector rotates tee→green up, so
 * the bands read like a Mario-Kart Rainbow Road track — then cap it with a glowing white rail. Pure
 * geometry (no rng); `phaseY`/`bandH` let several fairway pieces share one continuous band grid.
 */
function rainbowRibbon(poly: Vec[], phaseY: number, bandH: number): Prim[] {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  const i0 = Math.floor((b.minY - phaseY) / bandH);
  for (let i = i0; phaseY + i * bandH < b.maxY; i++) {
    const y0 = phaseY + i * bandH;
    const y1 = y0 + bandH + 0.6; // overlap a hair so no seam shows
    children.push({
      t: 'poly',
      pts: [
        [b.minX, y0],
        [b.maxX, y0],
        [b.maxX, y1],
        [b.minX, y1],
      ],
      fill: RAINBOW_BANDS[((i % RAINBOW_BANDS.length) + RAINBOW_BANDS.length) % RAINBOW_BANDS.length]!,
    });
  }
  return [
    // A dark under-edge so the road reads as a solid track floating in space (the void shows beyond).
    { t: 'poly', pts: offsetPoly(poly, 2), fill: 'rgba(8,6,22,0.55)' },
    { t: 'clip', clip: poly, children },
    // A glowing white rail + a soft outer halo so the ribbon pops against the starfield.
    { t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(255,255,255,0.9)', sw: 2 },
    { t: 'poly', pts: offsetPoly(poly, 2.4), fill: 'none', stroke: 'rgba(150,200,255,0.45)', sw: 1.2 },
  ];
}

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
function mulberry32(seed: number): () => number {
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
function hashHole(h: Hole): number {
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

function centroidOf(pts: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
function bboxOf(pts: Vec[]): Box {
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
function scalePoly(pts: Vec[], c: Vec, k: number): Vec[] {
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
function offsetPoly(pts: Vec[], d: number): Vec[] {
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
function longAxis(pts: Vec[]): { len: number; dir: Vec; a: Vec; b: Vec } {
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
function extentAlong(pts: Vec[], dx: number, dy: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const t = p[0] * dx + p[1] * dy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return hi - lo;
}

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

function n1(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Per-surface stylers (return screen-space prims for one projected polygon)
// ---------------------------------------------------------------------------

/** Horizontal mowing bands clipped to a (screen-space) polygon. After the projector rotates
 *  tee→green up-screen, horizontal bands run perpendicular to play — i.e. real mowing stripes. */
/** Mowing bands on an EXPLICIT grid (phase origin + band height). Sharing one grid across several
 *  polygons keeps their stripes continuous — what lets the green apron line up with the corridor. */
function stripesAt(poly: Vec[], colA: string, colB: string, phaseY: number, bandH: number): Prim {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  const i0 = Math.floor((b.minY - phaseY) / bandH);
  for (let i = i0; phaseY + i * bandH < b.maxY; i++) {
    const y0 = phaseY + i * bandH;
    const y1 = y0 + bandH + 0.5; // overlap a hair so no seam shows
    children.push({
      t: 'poly',
      pts: [
        [b.minX, y0],
        [b.maxX, y0],
        [b.maxX, y1],
        [b.minX, y1],
      ],
      fill: ((i % 2) + 2) % 2 === 0 ? colA : colB,
    });
  }
  return { t: 'clip', clip: poly, children };
}

function stripes(poly: Vec[], colA: string, colB: string, bands: number): Prim {
  const b = bboxOf(poly);
  return stripesAt(poly, colA, colB, b.minY, (b.maxY - b.minY) / bands);
}

/** VERTICAL mowing bands (along X) — a groomed "grain" running down the hole rather than across it
 *  (GS-variety-2, used for the frost world's swept-ice fairways). */
function stripesAtV(poly: Vec[], colA: string, colB: string, phaseX: number, bandW: number): Prim {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  const i0 = Math.floor((b.minX - phaseX) / bandW);
  for (let i = i0; phaseX + i * bandW < b.maxX; i++) {
    const x0 = phaseX + i * bandW;
    const x1 = x0 + bandW + 0.5;
    children.push({
      t: 'poly',
      pts: [
        [x0, b.minY],
        [x1, b.minY],
        [x1, b.maxY],
        [x0, b.maxY],
      ],
      fill: ((i % 2) + 2) % 2 === 0 ? colA : colB,
    });
  }
  return { t: 'clip', clip: poly, children };
}

/** DIAGONAL mowing bands: bands of constant `y − slope·x`, clipped to the poly (GS-variety-2 — the
 *  faceted grain of the crystal world, the wind-swept grain of the tempest/desert worlds). */
function slantStripes(poly: Vec[], colA: string, colB: string, bandH: number, slope: number): Prim {
  const b = bboxOf(poly);
  const uAt = (x: number, y: number) => y - slope * x;
  const us = [uAt(b.minX, b.minY), uAt(b.maxX, b.minY), uAt(b.minX, b.maxY), uAt(b.maxX, b.maxY)];
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const children: Prim[] = [];
  for (let i = 0; uMin + i * bandH < uMax; i++) {
    const a0 = uMin + i * bandH;
    const a1 = a0 + bandH + 0.5;
    children.push({
      t: 'poly',
      pts: [
        [b.minX, a0 + slope * b.minX],
        [b.maxX, a0 + slope * b.maxX],
        [b.maxX, a1 + slope * b.maxX],
        [b.minX, a1 + slope * b.minX],
      ],
      fill: ((i % 2) + 2) % 2 === 0 ? colA : colB,
    });
  }
  return { t: 'clip', clip: poly, children };
}

/** CHECKERBOARD mowing (both directions) — the dense, lush cross-mown look of the spore-jungle. */
function checkerStripes(poly: Vec[], colA: string, colB: string, cell: number): Prim {
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
  return { t: 'clip', clip: poly, children };
}

/** The per-world fairway mowing PATTERN (GS-variety-2): each archetype grooms its turf differently so
 *  fairways read distinct beyond their colour — horizontal stripes (classic parkland), a vertical
 *  swept grain (frost), a faceted/wind diagonal (crystal/tempest/desert), or a lush cross-mown
 *  checker (jungle). The band grid still rides the MAIN corridor's bbox so apron + segments line up. */
function fairwayStripes(sps: Vec[][], s: Shade, b0: { minX: number; minY: number; maxX: number; maxY: number }, arch: BiomeArchetype): Prim[] {
  const spanY = b0.maxY - b0.minY;
  const bandH = spanY / 7;
  switch (arch) {
    case 'frost':
      return sps.map((sp) => stripesAtV(sp, s.light, s.dark, b0.minX, (b0.maxX - b0.minX) / 6));
    case 'crystal':
      return sps.map((sp) => slantStripes(sp, s.light, s.dark, bandH * 0.95, 0.6));
    case 'tempest':
      return sps.map((sp) => slantStripes(sp, s.light, s.dark, bandH, -0.5));
    case 'desert':
      return sps.map((sp) => slantStripes(sp, s.light, s.dark, spanY / 5, 0.28));
    case 'fungal':
      return sps.map((sp) => checkerStripes(sp, s.light, s.dark, bandH * 0.9));
    case 'inferno':
      return sps.map((sp) => stripesAt(sp, s.light, s.dark, b0.minY, spanY / 5));
    default: // verdant / ocean / void / cetus — the classic horizontal mowing stripes
      return sps.map((sp) => stripesAt(sp, s.light, s.dark, b0.minY, bandH));
  }
}

/** All the hole's fairway polygons drawn as ONE grouped pass (GS-blend, same idea as the liquid
 *  families). A hole has the main corridor plus, near the green, a second `fairway` feature — the
 *  apron that wraps THROUGH and PAST the green. Drawn per-poly it stamped its own dark fringe ring,
 *  ink outline and finer/out-of-phase stripes across the bright corridor (the "section around the
 *  green that doesn't fit"). Grouped, the apron melts into the corridor: every fringe goes UNDER
 *  every base, the stripes share the corridor's band grid, and only the corridor carries the ink
 *  edge, so the apron eases out on its soft fringe alone. With a single fairway (no apron — void
 *  islands) this is byte-for-byte the old per-poly output. */
function styleFairways(sps: Vec[][], art: ArtFeel, s: Shade, fringe: string, arch: BiomeArchetype): Prim[] {
  const out: Prim[] = [];
  // First-cut fringes UNDER all the bases, so the apron's fringe never paints over the corridor —
  // only the outermost edge (past the green) shows it, easing the cut grass into the rough.
  for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -3), fill: fringe });
  for (const sp of sps) out.push({ t: 'poly', pts: sp, fill: s.base });
  // Per-world mowing PATTERN (GS-variety-2), riding the MAIN corridor's band grid so the apron +
  // broken-fairway segments line up with the corridor instead of running out of phase.
  if (art.stripes && sps[0]) out.push(...fairwayStripes(sps, s, bboxOf(sps[0]), arch));
  // ONE soft ink edge, on the main corridor only — no hard outline cuts back across it near the green.
  if (art.ink && sps[0]) out.push({ t: 'poly', pts: sps[0], fill: 'none', stroke: hexAlpha(s.ink, 0.5), sw: 1 });
  return out;
}

function styleGreen(
  poly: Vec[],
  art: ArtFeel,
  s: Shade,
  collar: string,
  fringe: string,
  slope?: { dir: Vec; mag: number },
): Prim[] {
  const c = centroidOf(poly);
  const out: Prim[] = [
    // Two nested rings ease the green into the land: an outer first-cut fringe, then the darker
    // collar/apron — a uniform-width OFFSET (not a centroid scale) so a long ice-shelf or kidney
    // green keeps an even surround instead of ballooning at the ends.
    { t: 'poly', pts: offsetPoly(poly, -6.5), fill: fringe },
    { t: 'poly', pts: offsetPoly(poly, -3.4), fill: collar },
    { t: 'poly', pts: poly, fill: s.base },
  ];
  if (art.stripes) out.push(stripes(poly, s.light, s.dark, 6));
  const gb = bboxOf(poly);
  // Green SLOPE (GS-greens-3): shade the LOW side darker + the HIGH side lighter and lay fall-line
  // arrows pointing downhill, so the tilt reads at a glance (the graphic IS the slope the sim rolls
  // on). `slope.dir` is the screen-space DOWNHILL unit; `mag` 0..~0.7 its steepness.
  if (slope && slope.mag > 0.05) {
    const span = Math.max(gb.maxX - gb.minX, gb.maxY - gb.minY);
    const a = Math.min(0.5, slope.mag * 0.7);
    out.push({
      t: 'clip',
      clip: poly,
      children: [
        // low side (downhill) shadow
        { t: 'circle', c: [c[0] + slope.dir[0] * span * 0.34, c[1] + slope.dir[1] * span * 0.34], r: span * 0.6, fill: `rgba(0,0,0,${(a * 0.5).toFixed(3)})` },
        // high side (uphill) lit
        { t: 'circle', c: [c[0] - slope.dir[0] * span * 0.34, c[1] - slope.dir[1] * span * 0.34], r: span * 0.6, fill: `rgba(255,255,255,${(a * 0.32).toFixed(3)})` },
      ],
    });
    // 2 short chevron arrows pointing downhill.
    const perp: Vec = [-slope.dir[1], slope.dir[0]];
    const arrows: Prim[] = [];
    for (let i = -1; i <= 1; i += 2) {
      const base: Vec = [c[0] + perp[0] * span * 0.16 * i - slope.dir[0] * span * 0.14, c[1] + perp[1] * span * 0.16 * i - slope.dir[1] * span * 0.14];
      const tip: Vec = [base[0] + slope.dir[0] * span * 0.3, base[1] + slope.dir[1] * span * 0.3];
      const col = 'rgba(255,255,255,0.5)';
      arrows.push({ t: 'line', a: base, b: tip, stroke: col, sw: 1.4, round: true });
      arrows.push({ t: 'line', a: tip, b: [tip[0] - slope.dir[0] * 4 + perp[0] * 3, tip[1] - slope.dir[1] * 4 + perp[1] * 3], stroke: col, sw: 1.4, round: true });
      arrows.push({ t: 'line', a: tip, b: [tip[0] - slope.dir[0] * 4 - perp[0] * 3, tip[1] - slope.dir[1] * 4 - perp[1] * 3], stroke: col, sw: 1.4, round: true });
    }
    out.push({ t: 'clip', clip: poly, children: arrows });
  } else {
    // Flat green: the original soft lit highlight toward the top-left.
    out.push({
      t: 'clip',
      clip: poly,
      children: [
        {
          t: 'circle',
          c: [c[0] - (gb.maxX - gb.minX) * 0.18, c[1] - (gb.maxY - gb.minY) * 0.18],
          r: Math.max(4, (gb.maxX - gb.minX) * 0.3),
          fill: 'rgba(255,255,255,0.12)',
        },
      ],
    });
  }
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, 0.7), sw: 1.2 });
  return out;
}

function styleTee(poly: Vec[], art: ArtFeel, s: Shade, fringe: string): Prim[] {
  const out: Prim[] = [
    { t: 'poly', pts: offsetPoly(poly, -2.4), fill: fringe }, // nest the tee in a soft fringe
    { t: 'poly', pts: poly, fill: s.base },
  ];
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, 0.5), sw: 1 });
  return out;
}

/**
 * Draw a whole FAMILY of sand bodies (every bunker / waste break / crater on a hole) in shared
 * layered passes — the same GS-blend trick the liquids use — so overlapping sand bodies MERGE into
 * one excavated surface instead of a pile of stickers each ringed with its own ink outline (the
 * "bunkers and sand don't merge properly" bug). Pass order across the WHOLE family:
 *   1. lip-shadow rims (outset, darker) UNDER every body — so an overlap shows no internal rim
 *   2. sand bodies — overlapping bodies merge into one continuous surface
 *   3. per-body depression crescent + rake texture, clipped (NO per-body ink → no seam through overlaps)
 * The shadow outset is the edge against the land, exactly like the liquids' shore.
 */
function styleSandFamily(polys: Vec[][], art: ArtFeel, scale: number): Prim[] {
  if (polys.length === 0) return [];
  const out: Prim[] = [];
  for (const poly of polys) out.push({ t: 'poly', pts: offsetPoly(poly, -2.6), fill: SAND.shadow }); // 1
  for (const poly of polys) out.push({ t: 'poly', pts: poly, fill: SAND.base }); // 2
  for (const poly of polys) {
    const c = centroidOf(poly);
    // Inner depression crescent: an inset poly nudged down so the far lip catches shadow.
    out.push({ t: 'poly', pts: offsetPoly(poly, 2.4).map((p) => [p[0], p[1] - 1.5] as Vec), fill: SAND.rim });
    // A couple of pale rake arcs across the sand (subtle texture).
    if (art.stripes) {
      const b = bboxOf(poly);
      const w = (b.maxX - b.minX) * 0.5;
      for (let i = 1; i <= 2; i++) {
        const y = b.minY + ((b.maxY - b.minY) * i) / 3;
        out.push({
          t: 'clip',
          clip: poly,
          children: [
            { t: 'line', a: [c[0] - w, y], b: [c[0] + w, y], stroke: SAND.rake, sw: Math.max(0.8, scale * 0.5) },
          ],
        });
      }
    }
  }
  return out;
}

/**
 * A liquid's depth/detail palette. Water and lava share the same banded-depth machinery — only the
 * tones differ — so a lake and a crossing river of the same liquid are drawn identically and read
 * as one substance.
 */
interface LiquidPalette {
  shore: string; // outset rim (water shoreline / lava crust)
  base: string; // body fill
  mid: string; // first depth ring
  deep: string; // core ring
  flow: string; // lengthwise flow streaks (current / molten flow)
  glint: string; // sparkle on a still lake
}
const WATER_LIQ: LiquidPalette = {
  shore: WATER.shallow,
  base: WATER.base,
  mid: WATER.deep,
  deep: WATER.deepest,
  flow: 'rgba(255,255,255,0.30)',
  glint: WATER.glint,
};
const LAVA_LIQ: LiquidPalette = {
  shore: LAVA.crust,
  base: LAVA.body,
  mid: LAVA.hot,
  deep: LAVA.core,
  flow: LAVA.crack,
  glint: LAVA.core,
};

const WATER_KINDS = new Set(['water', 'frozenpond', 'creek']);
const LAVA_KINDS = new Set(['lava', 'lavariver']);

/**
 * Draw a whole FAMILY of same-liquid penalty bodies (all the water, or all the lava on a hole) in
 * shared layered passes, so a lake and a river that touch read as ONE connected body instead of two
 * stickers with a seam between them. Pass order across the WHOLE family:
 *   1. shores/crusts (outset, contrasting) — UNDER every body
 *   2. base bodies — overlapping bodies merge into one continuous surface
 *   3. depth rings + flow/glints, each clipped to its own body
 * Because every shore sits under every body, an overlap shows no shoreline between the two — only
 * the outer edge against the land keeps its shore. Depth rings use `offsetPoly` (a true inward
 * offset), so a thin RIVER band gets channel-following rings instead of a centroid sliver, and an
 * elongated body additionally gets lengthwise FLOW lines so it reads as flowing current/molten lava.
 * No per-body ink outline (that would re-draw a seam through an overlap); the shore is the edge.
 */
function styleLiquidFamily(polys: Vec[][], lp: LiquidPalette, rng: () => number): Prim[] {
  if (polys.length === 0) return [];
  const out: Prim[] = [];
  for (const poly of polys) out.push({ t: 'poly', pts: offsetPoly(poly, -3), fill: lp.shore }); // 1
  for (const poly of polys) out.push({ t: 'poly', pts: poly, fill: lp.base }); // 2
  for (const poly of polys) {
    const axis = longAxis(poly);
    const width = extentAlong(poly, -axis.dir[1], axis.dir[0]); // extent ⟂ the long chord = channel width
    const step = Math.max(1.6, Math.min(7, width * 0.26));
    const detail: Prim[] = [
      { t: 'poly', pts: offsetPoly(poly, step), fill: lp.mid },
      { t: 'poly', pts: offsetPoly(poly, step * 2), fill: lp.deep },
    ];
    if (axis.len > width * 1.9) {
      // A CHANNEL (river/creek/lava river): streaks running ALONG the flow so it reads as moving.
      const px = -axis.dir[1];
      const py = axis.dir[0];
      const c = centroidOf(poly);
      const lanes = 3;
      for (let k = 0; k < lanes; k++) {
        const off = (k - (lanes - 1) / 2) * (width / (lanes + 1));
        const segs = 5;
        for (let sgi = 0; sgi < segs; sgi++) {
          const f0 = -0.42 + (0.84 * sgi) / segs;
          const f1 = -0.42 + (0.84 * (sgi + 0.62)) / segs;
          const wob = (rng() - 0.5) * step * 0.8;
          const a: Vec = [
            c[0] + axis.dir[0] * axis.len * f0 + px * (off + wob),
            c[1] + axis.dir[1] * axis.len * f0 + py * (off + wob),
          ];
          const b: Vec = [
            c[0] + axis.dir[0] * axis.len * f1 + px * (off + wob),
            c[1] + axis.dir[1] * axis.len * f1 + py * (off + wob),
          ];
          detail.push({ t: 'line', a, b, stroke: lp.flow, sw: 1, round: true });
        }
      }
    } else {
      // A still LAKE: a couple of bright glints near the top edge.
      const b = bboxOf(poly);
      const glints = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < glints; i++) {
        const gx = b.minX + (b.maxX - b.minX) * (0.2 + 0.6 * rng());
        const gy = b.minY + (b.maxY - b.minY) * (0.15 + 0.3 * rng());
        const r = 1 + rng() * 1.4;
        detail.push({ t: 'line', a: [gx - r, gy], b: [gx + r, gy], stroke: lp.glint, sw: 1, round: true });
        detail.push({ t: 'line', a: [gx, gy - r], b: [gx, gy + r], stroke: lp.glint, sw: 1, round: true });
      }
    }
    out.push({ t: 'clip', clip: poly, children: detail });
  }
  return out;
}

/**
 * Per-archetype look for a faceted scatter surface (crystal/ice). The default reads as cool
 * crystal/ice; on an INFERNO world the same surface is a glowing OBSIDIAN shard (hot core + warm
 * cleavage), not a cyan ice patch — "ice areas on lava zones don't make sense" (the crystal scatter
 * the ember biome drops used to render in its fixed cyan FILL regardless of the world). Render-only,
 * no rng — purely recolours, so determinism is untouched.
 */
function scatterLook(
  kind: string,
  arch: BiomeArchetype,
): { base: string; highlight: string; facet1: string; facet2: string; faceted: boolean; glow?: string } {
  const faceted = kind === 'crystal' || kind === 'ice';
  if (faceted && arch === 'inferno') {
    return {
      base: '#7a2a16', // charred obsidian body
      highlight: 'rgba(255,196,120,0.22)',
      facet1: 'rgba(255,180,90,0.55)',
      facet2: 'rgba(255,120,50,0.4)',
      faceted,
      glow: 'rgba(255,130,50,0.16)', // heat seeping through the glass
    };
  }
  // The void's crystal gardens are VIOLET and lit from within — the only living light out there
  // (the fixed cyan FILL read as ice floating in the abyss).
  if (faceted && arch === 'void') {
    return {
      base: '#6a4fc0',
      highlight: 'rgba(220,200,255,0.25)',
      facet1: 'rgba(230,210,255,0.6)',
      facet2: 'rgba(180,150,255,0.45)',
      faceted,
      glow: 'rgba(160,120,255,0.24)',
    };
  }
  // Cetus's "crystal" scatter is a bioluminescent REEF, not a gem — warm coral pink over the deep
  // teal turf, glowing like the star-ocean it grew from.
  if (faceted && arch === 'cetus') {
    return {
      base: '#3f8a96',
      highlight: 'rgba(255,190,210,0.3)',
      facet1: 'rgba(255,170,200,0.6)',
      facet2: 'rgba(140,240,255,0.5)',
      faceted,
      glow: 'rgba(120,230,240,0.22)',
    };
  }
  // Prism Reach: the signature crystal fields flash prismatic, not flat cyan.
  if (kind === 'crystal' && arch === 'crystal') {
    return {
      base: '#aee2f0',
      highlight: 'rgba(255,255,255,0.3)',
      facet1: 'rgba(255,160,200,0.55)', // a pink refraction …
      facet2: 'rgba(160,255,220,0.5)', // … and a green one — light splitting in the glass
      faceted,
      glow: 'rgba(190,235,255,0.2)',
    };
  }
  return {
    base: fillFor(kind),
    highlight: 'rgba(255,255,255,0.16)',
    facet1: 'rgba(255,255,255,0.4)',
    facet2: 'rgba(255,255,255,0.25)',
    faceted,
  };
}

/** A scatter surface (ice/crystal/waste/lava/void…): base fill + a lit inset band + ink. The
 *  archetype recolours faceted crystal/ice so it suits the world (e.g. molten obsidian on inferno). */
function styleScatter(kind: string, poly: Vec[], art: ArtFeel, arch: BiomeArchetype): Prim[] {
  const c = centroidOf(poly);
  const look = scatterLook(kind, arch);
  const out: Prim[] = [];
  // A luminous world's scatter glows from within (void crystal / cetus reef / prism / obsidian heat).
  if (look.glow) {
    let r = 0;
    for (const p of poly) r += dist(p, c);
    out.push({ t: 'glow', c, r: (r / poly.length) * 2.1, col: look.glow });
  }
  out.push(
    { t: 'poly', pts: poly, fill: look.base },
    { t: 'poly', pts: scalePoly(poly, c, 0.6).map((p) => [p[0] - 1, p[1] - 1] as Vec), fill: look.highlight },
  );
  if (look.faceted) {
    // Faceting: a couple of bright cleavage lines.
    const b = bboxOf(poly);
    out.push({
      t: 'clip',
      clip: poly,
      children: [
        { t: 'line', a: [b.minX, c[1]], b: [c[0], b.minY], stroke: look.facet1, sw: 1, round: true },
        { t: 'line', a: [c[0], b.minY], b: [b.maxX, c[1]], stroke: look.facet2, sw: 1, round: true },
      ],
    });
  }
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(0,0,0,0.35)', sw: 1.2 });
  return out;
}

/** Thick FESCUE / native rough (GS-hazards-2): an olive-tan body with seeded upright grass blades so
 *  the deep rough reads as wispy native grass, not a flat blob. */
function styleFescue(poly: Vec[], rng: () => number): Prim[] {
  const out: Prim[] = [
    { t: 'poly', pts: poly, fill: '#7c8c48' },
    { t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(40,52,20,0.4)', sw: 1 },
  ];
  const b = bboxOf(poly);
  const blades = Math.max(6, Math.round((b.maxX - b.minX) * (b.maxY - b.minY) * 0.012));
  const inner: Prim[] = [];
  for (let i = 0; i < blades; i++) {
    const x = b.minX + rng() * (b.maxX - b.minX);
    const y = b.minY + rng() * (b.maxY - b.minY);
    const h = 2.5 + rng() * 3.5;
    const lean = (rng() - 0.5) * 2.2;
    inner.push({ t: 'line', a: [x, y], b: [x + lean, y - h], stroke: rng() < 0.5 ? '#a7b86a' : '#6a7a3c', sw: 1, round: true });
  }
  out.push({ t: 'clip', clip: poly, children: inner });
  return out;
}

/** Dry RAVINE / barranca (GS-hazards-2): a dark rocky chasm — a shaded gorge floor with a couple of
 *  jagged crack lines and a lit rim, so it reads as a gash in the ground rather than a flat patch. */
function styleRavine(poly: Vec[], rng: () => number): Prim[] {
  const c = centroidOf(poly);
  const out: Prim[] = [
    { t: 'poly', pts: poly, fill: '#5a4b3c' }, // gorge floor
    { t: 'poly', pts: scalePoly(poly, c, 0.62), fill: '#3a2f24' }, // shadowed depths
    { t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(220,200,170,0.4)', sw: 1.2 }, // lit rim
  ];
  const b = bboxOf(poly);
  const inner: Prim[] = [];
  for (let i = 0; i < 3; i++) {
    const x = b.minX + ((i + 0.5) / 3) * (b.maxX - b.minX);
    inner.push({ t: 'line', a: [x + (rng() - 0.5) * 4, b.minY], b: [x + (rng() - 0.5) * 8, b.maxY], stroke: 'rgba(20,14,8,0.6)', sw: 1.4, round: true });
  }
  out.push({ t: 'clip', clip: poly, children: inner });
  return out;
}

/** Deterministic 0..1 hash off a position (GS-biome-feel) — extra per-flora/per-decor variation
 *  WITHOUT extra rng draws, so every world's art stream stays byte-identical to the classic one. */
function posHash(x: number, y: number, k = 0): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * One piece of world FLORA (GS-biome-feel). Every world used to draw the SAME green parkland canopy
 * — the spore jungle's "luminous mushroom stands" and Prism Reach's "crystalline spires" were
 * literally oak trees, the single biggest reskin tell. The tree hazard now dispatches per archetype
 * to a distinct silhouette: glowing mushrooms, snow-dusted conifers, charred ember snags, saguaros,
 * crystal spires, wind-bent storm scrub, palms, coastal sea-stacks. The LIE is unchanged (`trees` —
 * you still punch out of whatever it is); this is pure render identity.
 *
 * CRITICAL determinism: every variant consumes EXACTLY the two rng draws the classic canopy did
 * (size + tint) — all further variation is a `posHash` of the projected position — so the main art
 * stream is byte-for-byte unchanged on every world, and verdant keeps the original canopy verbatim.
 */
function styleFlora(poly: Vec[], proj: Projector, rng: () => number, arch: BiomeArchetype): Prim[] {
  const cc = centroidOf(poly);
  let rad = 0;
  for (const p of poly) rad += dist(p, cc);
  rad /= poly.length;
  const [x, y] = proj.project(cc);
  const rr = Math.max(3, rad * proj.scale * (0.9 + rng() * 0.5));
  // Slight per-tree hue variance so a treeline isn't a row of clones (the SAME two draws everywhere).
  const tint = rng();
  switch (arch) {
    case 'fungal':
      return floraMushroom(x, y, rr, tint);
    case 'frost':
      return floraConifer(x, y, rr, tint);
    case 'inferno':
      return floraSnag(x, y, rr, tint);
    case 'desert':
      return floraSaguaro(x, y, rr, tint);
    case 'crystal':
      return floraShard(x, y, rr, tint);
    case 'tempest':
      return floraWindScrub(x, y, rr, tint);
    case 'ocean':
      return floraPalm(x, y, rr, tint);
    case 'cetus':
      return floraSeaStack(x, y, rr, tint);
    default:
      break; // verdant (and any unknown) → the classic parkland canopy, byte-identical
  }
  const body = tint < 0.33 ? '#247f34' : tint < 0.66 ? CANOPY.base : '#36a043';
  return [
    { t: 'circle', c: [x, y + rr * 0.7], r: rr * 0.7, fill: CANOPY.shadow }, // cast shadow
    {
      t: 'line',
      a: [x, y + rr * 0.95],
      b: [x, y + rr * 0.1],
      stroke: CANOPY.trunk,
      sw: rr * 0.34,
      round: true,
    },
    { t: 'circle', c: [x, y], r: rr, fill: CANOPY.core, stroke: CANOPY.ink, sw: 1 }, // core shadow
    { t: 'circle', c: [x - rr * 0.12, y - rr * 0.12], r: rr * 0.82, fill: body }, // body
    { t: 'circle', c: [x - rr * 0.3, y - rr * 0.32], r: rr * 0.5, fill: CANOPY.lit }, // lit cap
  ];
}

/** Spore-jungle GIANT MUSHROOM: a pale stalk under a wide flattened dome cap that glows from
 *  within, gill shadow under the rim, luminous spots on top. */
function floraMushroom(x: number, y: number, rr: number, tint: number): Prim[] {
  const cool = tint >= 0.66; // a teal minority among the violet stands
  const cap = tint < 0.33 ? '#8a5ce0' : tint < 0.66 ? '#6a42c0' : '#3fbf9c';
  const capLit = cool ? '#7ae8cc' : '#a97ef0';
  const glow = cool ? 'rgba(90,240,190,0.26)' : 'rgba(150,120,255,0.26)';
  const top = y - rr * 1.5; // cap underside height
  const dome: Vec[] = [
    [x - rr * 1.15, top],
    [x - rr * 0.68, top - rr * 0.72],
    [x, top - rr * 0.94],
    [x + rr * 0.68, top - rr * 0.72],
    [x + rr * 1.15, top],
  ];
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.5], r: rr * 0.68, fill: CANOPY.shadow }, // cast shadow
    { t: 'glow', c: [x, top - rr * 0.3], r: rr * 2.3, col: glow }, // bioluminescent halo
    { t: 'line', a: [x, y + rr * 0.4], b: [x, top], stroke: '#ded4f2', sw: rr * 0.34, round: true }, // stalk
    { t: 'line', a: [x - rr * 0.95, top + 1], b: [x + rr * 0.95, top + 1], stroke: 'rgba(30,16,60,0.55)', sw: 1.6, round: true }, // gill shadow
    { t: 'poly', pts: dome, fill: cap, stroke: 'rgba(26,14,52,0.7)', sw: 1 }, // the cap
    { t: 'poly', pts: [[x - rr * 0.62, top - rr * 0.5], [x - rr * 0.2, top - rr * 0.82], [x + rr * 0.28, top - rr * 0.78], [x - rr * 0.1, top - rr * 0.42]], fill: capLit }, // lit sheen
  ];
  // Luminous spots across the cap (position-hashed — no rng).
  for (let i = 0; i < 3; i++) {
    const u = posHash(x, y, i) - 0.5;
    out.push({ t: 'circle', c: [x + u * rr * 1.5, top - rr * (0.28 + posHash(x, y, i + 3) * 0.4)], r: rr * 0.13, fill: 'rgba(240,236,255,0.9)' });
  }
  return out;
}

/** Frost-world CONIFER: three stacked spruce tiers dusted with snow along their lit edges. */
function floraConifer(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#2c6a52' : tint < 0.66 ? '#2f7a5e' : '#256048';
  const h = rr * 2.6;
  const tw = [1.3, 0.98, 0.62]; // tier half-widths
  const by = [0.02, 0.32, 0.58]; // tier base heights
  const ty = [0.46, 0.74, 1.0]; // tier apex heights
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.5], r: rr * 0.6, fill: CANOPY.shadow },
    { t: 'line', a: [x, y + rr * 0.35], b: [x, y - h * 0.1], stroke: CANOPY.trunk, sw: rr * 0.26, round: true },
  ];
  for (let i = 0; i < 3; i++) {
    const bY = y - h * by[i]!;
    const aY = y - h * ty[i]!;
    out.push({ t: 'poly', pts: [[x - rr * tw[i]!, bY], [x + rr * tw[i]!, bY], [x, aY]], fill: body, stroke: '#123a2c', sw: 1 });
    // Snow along each tier's lit (left) edge.
    out.push({ t: 'line', a: [x, aY], b: [x - rr * tw[i]! * 0.72, bY - (bY - aY) * 0.24], stroke: 'rgba(255,255,255,0.85)', sw: 1.2, round: true });
  }
  out.push({ t: 'circle', c: [x, y - h], r: rr * 0.16, fill: '#ffffff' }); // snow cap
  return out;
}

/** Ember-world CHARRED SNAG: a leaning burnt trunk with bare jagged branches, embers still
 *  crawling up it, over a warm ground glow. */
function floraSnag(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.5 ? '#33241c' : '#241710';
  const lean = (posHash(x, y) - 0.5) * rr * 0.6;
  const topX = x + lean;
  const topY = y - rr * 2.2;
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: 'rgba(0,0,0,0.2)' },
    { t: 'glow', c: [x, y], r: rr * 1.6, col: 'rgba(255,120,44,0.18)' }, // ground ember glow
    { t: 'line', a: [x, y + rr * 0.3], b: [topX, topY], stroke: body, sw: rr * 0.3, round: true }, // trunk
    // Two bare jagged branches off the upper trunk.
    { t: 'line', a: [x + lean * 0.55, y - rr * 1.3], b: [x + lean * 0.55 - rr * 0.9, y - rr * 1.8], stroke: body, sw: rr * 0.16, round: true },
    { t: 'line', a: [x + lean * 0.8, y - rr * 1.8], b: [x + lean * 0.8 + rr * 0.75, y - rr * 2.3], stroke: body, sw: rr * 0.14, round: true },
  ];
  // An ember or two still glowing on the trunk (position-hashed).
  for (let i = 0; i < 2; i++) {
    if (posHash(x, y, i + 7) < 0.7) {
      const t = 0.35 + posHash(x, y, i + 11) * 0.5;
      out.push({ t: 'circle', c: [x + lean * t, y + rr * 0.3 - (y + rr * 0.3 - topY) * t], r: rr * 0.1 + 0.5, fill: '#ff8a2a' });
    }
  }
  return out;
}

/** Dust-belt SAGUARO: a tall ribbed column with two elbowed arms, the desert's lone sentinel. */
function floraSaguaro(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#5f8a4e' : tint < 0.66 ? '#6f9a58' : '#527c46';
  const h = rr * 2.4;
  const armY1 = y - h * 0.55;
  const armY2 = y - h * (0.4 + posHash(x, y) * 0.15);
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: 'rgba(0,0,0,0.18)' },
    { t: 'line', a: [x, y + rr * 0.3], b: [x, y - h], stroke: body, sw: rr * 0.5, round: true }, // column
    { t: 'line', a: [x - rr * 0.1, y], b: [x - rr * 0.1, y - h * 0.9], stroke: 'rgba(255,255,240,0.18)', sw: rr * 0.1, round: true }, // lit rib
    // Left arm: out then up.
    { t: 'line', a: [x, armY1], b: [x - rr * 0.8, armY1], stroke: body, sw: rr * 0.34, round: true },
    { t: 'line', a: [x - rr * 0.8, armY1], b: [x - rr * 0.8, armY1 - rr * 0.85], stroke: body, sw: rr * 0.34, round: true },
    // Right arm, a touch lower.
    { t: 'line', a: [x, armY2], b: [x + rr * 0.7, armY2], stroke: body, sw: rr * 0.3, round: true },
    { t: 'line', a: [x + rr * 0.7, armY2], b: [x + rr * 0.7, armY2 - rr * 0.6], stroke: body, sw: rr * 0.3, round: true },
  ];
  if (posHash(x, y, 5) < 0.3) out.push({ t: 'circle', c: [x, y - h - rr * 0.1], r: rr * 0.16, fill: '#ffd0e0' }); // desert bloom
  return out;
}

/** Prism-Reach CRYSTAL SPIRE: a tall faceted shard with a smaller sibling, glowing from within. */
function floraShard(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#9fd8e6' : tint < 0.66 ? '#b8c8f0' : '#cbe0ea';
  const dark = tint < 0.33 ? '#5fa3b8' : tint < 0.66 ? '#8496c8' : '#93aab8';
  const h = rr * 2.8;
  const spire: Vec[] = [
    [x, y - h],
    [x + rr * 0.55, y - h * 0.32],
    [x + rr * 0.3, y + rr * 0.1],
    [x - rr * 0.42, y - h * 0.22],
  ];
  const side: Vec[] = [
    [x + rr * 0.85, y - h * 0.5],
    [x + rr * 1.2, y - h * 0.14],
    [x + rr * 0.72, y + rr * 0.1],
  ];
  return [
    { t: 'circle', c: [x, y + rr * 0.35], r: rr * 0.6, fill: 'rgba(0,0,0,0.16)' },
    { t: 'glow', c: [x, y - h * 0.45], r: rr * 2.4, col: 'rgba(160,225,255,0.28)' },
    { t: 'poly', pts: side, fill: dark, stroke: 'rgba(30,70,100,0.55)', sw: 1 },
    { t: 'poly', pts: spire, fill: body, stroke: 'rgba(30,70,100,0.6)', sw: 1 },
    { t: 'line', a: [x, y - h], b: [x - rr * 0.06, y + rr * 0.02], stroke: 'rgba(255,255,255,0.75)', sw: 1, round: true }, // cleavage highlight
    { t: 'line', a: [x - rr * 0.5, y - h * 0.92], b: [x + rr * 0.5, y - h * 0.92], stroke: 'rgba(255,255,255,0.8)', sw: 0.8, round: true }, // apex glint
    { t: 'line', a: [x, y - h - rr * 0.4], b: [x, y - h + rr * 0.4], stroke: 'rgba(255,255,255,0.8)', sw: 0.8, round: true },
  ];
}

/** Tempest WIND-BENT SCRUB: a trunk bowed downwind with the whole canopy streaming off its tip. */
function floraWindScrub(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#5a7a4a' : tint < 0.66 ? '#66735c' : '#4e6a44';
  const L = rr * 0.95; // downwind lean (fixed screen direction — the gale never lets up)
  const canopy: Vec[] = [
    [x + L * 0.55, y - rr * 1.9],
    [x + L + rr * 1.35, y - rr * 1.62],
    [x + L + rr * 1.0, y - rr * 1.12],
    [x + L * 0.45, y - rr * 1.18],
  ];
  return [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: CANOPY.shadow },
    { t: 'line', a: [x, y + rr * 0.3], b: [x + L * 0.45, y - rr * 0.9], stroke: '#4a3a26', sw: rr * 0.26, round: true },
    { t: 'line', a: [x + L * 0.45, y - rr * 0.9], b: [x + L, y - rr * 1.5], stroke: '#4a3a26', sw: rr * 0.2, round: true },
    { t: 'poly', pts: canopy, fill: body, stroke: 'rgba(20,26,16,0.6)', sw: 1 },
    // Leaves streaming off the downwind edge.
    { t: 'line', a: [x + L + rr * 1.3, y - rr * 1.55], b: [x + L + rr * 2.0, y - rr * 1.48], stroke: body, sw: 1.1, round: true },
    { t: 'line', a: [x + L + rr * 1.05, y - rr * 1.24], b: [x + L + rr * 1.7, y - rr * 1.14], stroke: body, sw: 1, round: true },
  ];
}

/** Tidal-archipelago PALM: a curved trunk with a burst of arcing fronds. */
function floraPalm(x: number, y: number, rr: number, tint: number): Prim[] {
  const frond = tint < 0.33 ? '#2f9a4a' : tint < 0.66 ? '#2c8a58' : '#3aa843';
  const bend = rr * (0.4 + posHash(x, y) * 0.3);
  const topX = x + bend;
  const topY = y - rr * 2.1;
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: CANOPY.shadow },
    { t: 'line', a: [x, y + rr * 0.3], b: [x + bend * 0.45, y - rr * 1.15], stroke: '#a8845a', sw: rr * 0.26, round: true },
    { t: 'line', a: [x + bend * 0.45, y - rr * 1.15], b: [topX, topY], stroke: '#a8845a', sw: rr * 0.2, round: true },
  ];
  // Fronds fanning from the crown, each a two-segment droop.
  const angles = [-2.7, -2.1, -1.35, -0.6, 0.1];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i]! + (posHash(x, y, i) - 0.5) * 0.3;
    const midX = topX + Math.cos(a) * rr * 0.9;
    const midY = topY + Math.sin(a) * rr * 0.55;
    out.push({ t: 'line', a: [topX, topY], b: [midX, midY], stroke: frond, sw: Math.max(1.2, rr * 0.16), round: true });
    out.push({ t: 'line', a: [midX, midY], b: [midX + Math.cos(a) * rr * 0.5, midY + Math.abs(Math.sin(a)) * rr * 0.3 + rr * 0.3], stroke: frond, sw: Math.max(1, rr * 0.12), round: true });
  }
  if (posHash(x, y, 9) < 0.5) out.push({ t: 'circle', c: [topX - rr * 0.2, topY + rr * 0.25], r: rr * 0.14, fill: '#5a3a22' }); // coconut
  return out;
}

/** Cetus COASTAL SEA-STACK: a wind-carved rock pillar speckled with bioluminescence, foam at
 *  its foot — the sparse "trees" of the clifftop world. */
function floraSeaStack(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.5 ? '#2a5a6a' : '#234c5c';
  const h = rr * 2.0;
  const stack: Vec[] = [
    [x - rr * 0.7, y + rr * 0.15],
    [x - rr * 0.42, y - h * 0.9],
    [x + rr * 0.28, y - h],
    [x + rr * 0.62, y + rr * 0.15],
  ];
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.6, fill: 'rgba(0,0,0,0.2)' },
    { t: 'poly', pts: stack, fill: body, stroke: 'rgba(6,20,30,0.6)', sw: 1 },
    { t: 'line', a: [x - rr * 0.42, y - h * 0.9], b: [x + rr * 0.28, y - h], stroke: 'rgba(150,232,255,0.6)', sw: 1.2, round: true }, // starlit crown
    { t: 'circle', c: [x, y + rr * 0.2], r: rr * 0.78, fill: 'none', stroke: 'rgba(220,248,255,0.35)', sw: 1.2 }, // foam ring at the foot
  ];
  for (let i = 0; i < 3; i++) {
    out.push({ t: 'circle', c: [x + (posHash(x, y, i) - 0.5) * rr, y - h * (0.25 + posHash(x, y, i + 4) * 0.6)], r: 0.8, fill: 'rgba(122,240,255,0.85)' }); // bio-speckles
  }
  return out;
}

/** Bright festival tent colour pairs (roof / shadow side) — content-as-data, cycled by tent index. */
const TENT_FILLS: [string, string][] = [
  ['#ef5350', '#b4302d'], // red
  ['#42a5f5', '#1f6fbf'], // blue
  ['#ffca28', '#cf9f17'], // gold
  ['#66bb6a', '#3f8e4a'], // green
  ['#ab47bc', '#7a2f8a'], // purple
];

/**
 * Draw the trade-camp TENTS (GS-tents) as bright, billboard-upright festival tents at their course
 * positions — projected so they sit ON the ground around the green and track the follow-cam (the fix
 * for the old screen-space caravan that floated in mid-air). A striped conical roof + a dark doorway +
 * a pennant + a warm camp glow, sized by `proj.scale`. Pure (the geometry is the tent's own; no rng).
 */
function styleTents(tents: readonly TradeTent[], proj: Projector): Prim[] {
  const out: Prim[] = [];
  for (const t of tents) {
    const [x, y] = proj.project(t.c);
    const rr = Math.max(6, t.r * proj.scale * 0.95);
    const [roof, shade] = TENT_FILLS[t.hue % TENT_FILLS.length]!;
    const peakY = y - rr * 1.85; // tent height
    const eaveY = y - rr * 0.05;
    const baseY = y + rr * 0.55;
    // Warm camp glow so the tents read as a lively market at night.
    out.push({ t: 'glow', c: [x, y - rr * 0.4], r: rr * 2.0, col: 'rgba(255,196,110,0.20)' });
    // Cast shadow on the ground.
    out.push({ t: 'circle', c: [x, baseY], r: rr * 0.95, fill: 'rgba(0,0,0,0.26)' });
    // Body (the canvas walls) — a short trapezoid under the roof.
    out.push({
      t: 'poly',
      pts: [
        [x - rr * 0.74, eaveY],
        [x + rr * 0.74, eaveY],
        [x + rr * 0.6, baseY],
        [x - rr * 0.6, baseY],
      ],
      fill: shade,
      stroke: 'rgba(20,16,24,0.55)',
      sw: 1,
    });
    // Roof: two panels meeting at the ridge peak (lit left, shaded right), with a couple of bright
    // stripes so it reads as a striped marquee.
    out.push({ t: 'poly', pts: [[x, peakY], [x - rr * 1.0, eaveY], [x, eaveY]], fill: roof, stroke: 'rgba(20,16,24,0.6)', sw: 1 });
    out.push({ t: 'poly', pts: [[x, peakY], [x + rr * 1.0, eaveY], [x, eaveY]], fill: shade, stroke: 'rgba(20,16,24,0.6)', sw: 1 });
    out.push({ t: 'line', a: [x - rr * 0.5, (peakY + eaveY) / 2], b: [x - rr * 0.5, eaveY], stroke: 'rgba(255,255,255,0.5)', sw: 1.4, round: true });
    out.push({ t: 'line', a: [x + rr * 0.5, (peakY + eaveY) / 2], b: [x + rr * 0.5, eaveY], stroke: 'rgba(255,255,255,0.32)', sw: 1.4, round: true });
    // Dark doorway.
    out.push({
      t: 'poly',
      pts: [
        [x - rr * 0.2, eaveY],
        [x + rr * 0.2, eaveY],
        [x + rr * 0.15, baseY],
        [x - rr * 0.15, baseY],
      ],
      fill: 'rgba(28,20,30,0.8)',
    });
    // Pennant flag on the peak.
    out.push({ t: 'line', a: [x, peakY], b: [x, peakY - rr * 0.55], stroke: 'rgba(235,238,250,0.85)', sw: 1.2, round: true });
    out.push({ t: 'poly', pts: [[x, peakY - rr * 0.55], [x + rr * 0.5, peakY - rr * 0.4], [x, peakY - rr * 0.26]], fill: roof });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scene assembly
// ---------------------------------------------------------------------------

/** Project a whole polygon to screen space. */
function projPoly(poly: Vec[], proj: Projector): Vec[] {
  return poly.map((p) => proj.project(p));
}

/** The green's downhill SLOPE as a SCREEN-space unit direction + magnitude (GS-greens-3), by
 *  projecting the course-space fall line through the tee→green-up projector. Undefined for a flat
 *  green. Pure — no rng — so it never perturbs the scene's seeded look. */
function greenSlopeScreen(hole: Hole, proj: Projector): { dir: Vec; mag: number } | undefined {
  const g = hole.greenSlope;
  if (!g) return undefined;
  const mag = Math.hypot(g[0], g[1]);
  if (mag < 1e-4) return undefined;
  const a = proj.project(hole.green);
  const b = proj.project([hole.green[0] + g[0] / mag, hole.green[1] + g[1] / mag]);
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return { dir: [dx / l, dy / l], mag };
}

/** Is a screen point within the (padded) view? Used to cull off-screen accents/tufts. */
function inView(p: Vec, w: number, h: number, m = 24): boolean {
  return p[0] >= -m && p[0] <= w + m && p[1] >= -m && p[1] <= h + m;
}

// ---------------------------------------------------------------------------
// GS-cetus: the star-ocean clifftop world's bespoke decor — a river of stars threading the rough that
// pours off the cliff as a star-waterfall, over a deep ocean where space whales surface. All drawn
// from a dedicated rng stream + gated to the cetus archetype in buildScene, so every other world is
// byte-for-byte unchanged.
// ---------------------------------------------------------------------------

/** Unit tangent at index i of a polyline, from its neighbours. */
function tangentAt(pts: Vec[], i: number): Vec {
  const a = pts[Math.max(0, i - 1)]!;
  const b = pts[Math.min(pts.length - 1, i + 1)]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/** A variable-width ribbon polygon (per-point half-widths) around a polyline. */
function ribbonVar(path: Vec[], hw: number[]): Vec[] {
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < path.length; i++) {
    const t = tangentAt(path, i);
    const px = -t[1];
    const py = t[0];
    const w = hw[i] ?? hw[hw.length - 1] ?? 2;
    left.push([path[i]![0] + px * w, path[i]![1] + py * w]);
    right.push([path[i]![0] - px * w, path[i]![1] - py * w]);
  }
  return [...left, ...right.reverse()];
}

/** Sample a polyline at parameter `u` in [0,1] by arc length (so a curve is walked evenly). */
function sampleAlong(line: Vec[], u: number): Vec {
  const n = line.length;
  if (n === 1) return line[0]!;
  let total = 0;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    total += dist(line[i - 1]!, line[i]!);
    cum.push(total);
  }
  if (total === 0) return line[0]!;
  const target = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < n; i++) {
    if (cum[i]! >= target) {
      const seg = cum[i]! - cum[i - 1]! || 1;
      const f = (target - cum[i - 1]!) / seg;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  }
  return line[n - 1]!;
}

/**
 * The COURSE-SPACE star-river path (GS-cetus-2): a meander that snakes down the hole and weaves
 * across the play corridor, so the river is CARVED through the fairway rather than parked beside it
 * as a straight bar. It is a PURE function of the hole + its own rng — it never reads the projector —
 * so the geometry is byte-stable AND projector-independent. (The old render-only river shared an rng
 * stream with the ocean, whose draw COUNT depended on the projected island polygon — so the river's
 * side + wobble re-rolled on every zoom/pan, the "jumps back and forth all over the place" bug.)
 * Returns null for a hole with no real corridor (a par-3 island green has no fairway to carve).
 */
export function cetusRiverPath(hole: Hole, rng: () => number): { line: Vec[]; hw: number[] } | null {
  const cl = hole.centreline;
  const fw = hole.features.find((f) => f.kind === 'fairway');
  if (!fw || cl.length < 2 || hole.par < 4) return null;
  // Corridor half-width = the fairway's widest lateral extent from the centreline.
  let halfW = 0;
  for (const p of fw.poly) halfW = Math.max(halfW, polylineDist(p, cl));
  if (halfW < 4) return null;
  // Hole length, for sizing the river to the hole rather than the (huge on a lostRough island) corridor.
  let L = 0;
  for (let i = 1; i < cl.length; i++) L += dist(cl[i - 1]!, cl[i]!);
  if (L < 1) L = dist(cl[0]!, cl[cl.length - 1]!) || 100;
  const N = 30;
  const phase = rng() * Math.PI * 2;
  const lobes = 2.0 + rng() * 1.6; // a few S-bends down the length of the hole
  // A real, modest river: its width is keyed off the HOLE LENGTH (not the giant island half-width),
  // and the meander swing is CAPPED so the channel winds down the central fairway and reads as carved
  // INTO the bright turf, instead of a huge band sprawling out across the whole island into the dark.
  const amp = Math.min(halfW * 0.55, 34) * (0.8 + rng() * 0.4); // capped swing across the corridor
  const rw = Math.max(5, Math.min(13, L * 0.018)); // river half-width (course yards)
  const wPhase = rng() * Math.PI * 2;
  const wLobes = 2.4 + rng() * 1.8;
  const line: Vec[] = [];
  const hw: number[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const c = sampleAlong(cl, u);
    const c0 = sampleAlong(cl, Math.max(0, u - 0.012));
    const c2 = sampleAlong(cl, Math.min(1, u + 0.012));
    let tx = c2[0] - c0[0];
    let ty = c2[1] - c0[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const grow = 0.45 + 0.55 * u; // widens its swing toward the green
    const lat = amp * grow * Math.sin(phase + u * Math.PI * lobes);
    line.push([c[0] - ty * lat, c[1] + tx * lat]);
    hw.push(rw * (1 + 0.32 * Math.sin(wPhase + u * Math.PI * wLobes)));
  }
  return { line, hw };
}

/** Convex hull (Andrew's monotone chain) of screen-space points, returned as a closed ring. */
function convexHull(pts: Vec[]): Vec[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Vec, a: Vec, b: Vec) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * The FRONT (screen-down) silhouette of a hull: the chain of its edge from the leftmost to the
 * rightmost vertex that runs along the BOTTOM (larger screen-y). This is the plateau edge the eye
 * reads as facing the viewer — the lip we extrude a cliff down from (GS-cetus-3). Returned L→R.
 */
function frontEdge(hull: Vec[]): Vec[] {
  if (hull.length < 2) return hull;
  let li = 0;
  let ri = 0;
  for (let i = 1; i < hull.length; i++) {
    if (hull[i]![0] < hull[li]![0]) li = i;
    if (hull[i]![0] > hull[ri]![0]) ri = i;
  }
  const walk = (dir: 1 | -1): Vec[] => {
    const out: Vec[] = [];
    for (let i = li; ; i = (i + dir + hull.length) % hull.length) {
      out.push(hull[i]!);
      if (i === ri) break;
    }
    return out;
  };
  const a = walk(1);
  const b = walk(-1);
  const avgY = (c: Vec[]) => c.reduce((s, p) => s + p[1], 0) / (c.length || 1);
  const front = avgY(a) >= avgY(b) ? a : b;
  return front[0]![0] <= front[front.length - 1]![0] ? front : front.slice().reverse();
}

/**
 * GS-cetus-3: extrude each clifftop plateau DOWNWARD into a visible CLIFF FACE so Cetus reads as a
 * clifftop seen side-on — the depth the world always wanted (and the thing that lets the star-river
 * spill over a real edge instead of "starting out of nowhere"). Pure screen-space render off the
 * dedicated cetus cliff stream. Returns the drawn prims (face strata + star-dust + rugged base + lit
 * lip) PLUS the front-edge geometry, which `cetusRiver` reuses so its waterfall pours down this exact
 * face. Height keys off the plateau width so it scales consistently across the map/follow-cam zooms.
 */
function cetusCliffs(
  platforms: Vec[][],
  deepen: number,
  rng: () => number,
): { prims: Prim[]; faces: { top: Vec[]; height: number }[] } {
  const prims: Prim[] = [];
  const faces: { top: Vec[]; height: number }[] = [];
  // A LIT rock wall (top catches the starlight) plunging to the abyss — high contrast so the cliff
  // reads as solid rock against the dark void, which is what sells the side-on depth. Rarity deepens
  // only the LOWER strata (`dk` ramps in with depth) so the lit clifftop always pops regardless of tier.
  const dk = Math.min(0.24, Math.max(0, deepen - 1) * 0.24);
  const strata = ['#5a9db8', '#3f7f9c', '#296079', '#1a4459', '#0f2d40', '#071a28'].map((c, i) =>
    mixHex(c, '#03080f', dk * (i / 5)),
  );
  for (const plat of platforms) {
    const hull = convexHull(plat);
    if (hull.length < 3) continue;
    const top = frontEdge(hull);
    if (top.length < 2) continue;
    const bb = bboxOf(plat);
    const cx = (bb.minX + bb.maxX) / 2;
    const cliffH = Math.max(34, Math.min(190, (bb.maxX - bb.minX) * 0.44));
    faces.push({ top, height: cliffH });
    // Drop the lip down (a slight outward splay so the block reads solid, base roughened into rubble).
    const dropped = (t: number): Vec[] =>
      top.map((p) => [p[0] + (p[0] - cx) * 0.06 * t, p[1] + cliffH * t] as Vec);
    const base = dropped(1).map((p) => [p[0], p[1] + (rng() - 0.5) * cliffH * 0.16] as Vec);
    const face: Vec[] = [...top, ...base.slice().reverse()];
    // A soft cast shadow into the ocean at the cliff foot, so the wall reads as standing IN the sea.
    prims.push({ t: 'poly', pts: [...dropped(0.86), ...dropped(1.32).slice().reverse()], fill: 'rgba(2,7,13,0.5)' });
    prims.push({ t: 'poly', pts: face, fill: strata[strata.length - 1]! }); // solid backing (no clip gaps)
    // Face detail, clipped to the face polygon. ONE clip only — the SVG serializer silently drops a
    // group's contents if a clipPath nests inside another (the GS-cetus-2 bug), so no nested clips.
    const children: Prim[] = [];
    const K = strata.length;
    for (let k = 0; k < K; k++) {
      const bandTop = dropped(k / K);
      const bandBot = dropped((k + 1) / K);
      children.push({ t: 'poly', pts: [...bandTop, ...bandBot.slice().reverse()], fill: strata[k]! });
    }
    // A contact-shadow band tucked right under the lip (ambient occlusion → the plateau reads as a
    // slab casting onto its own face), and star-dust in the rock (Cetus stone is made of the deep).
    children.push({ t: 'poly', pts: [...dropped(0), ...dropped(0.16).slice().reverse()], fill: 'rgba(3,10,18,0.34)' });
    const fb = bboxOf(face);
    const dust = Math.min(110, Math.round(((fb.maxX - fb.minX) * (fb.maxY - fb.minY)) / 620));
    for (let i = 0; i < dust; i++) {
      const x = fb.minX + rng() * (fb.maxX - fb.minX);
      const y = fb.minY + rng() * (fb.maxY - fb.minY);
      children.push({ t: 'circle', c: [x, y], r: 0.35 + rng() * 0.9, fill: rng() < 0.5 ? 'rgba(190,236,255,0.5)' : 'rgba(140,205,255,0.4)' });
    }
    // Vertical fault cracks + lit ridges give the wall its strata read.
    const cracks = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < cracks; i++) {
      const sp = sampleAlong(top, rng());
      const len = cliffH * (0.45 + rng() * 0.5);
      const jx = (rng() - 0.5) * 10;
      children.push({ t: 'line', a: sp, b: [sp[0] + jx, sp[1] + len], stroke: 'rgba(3,9,16,0.5)', sw: 1.2, round: true });
      children.push({ t: 'line', a: [sp[0] + 1.4, sp[1]], b: [sp[0] + jx + 1.4, sp[1] + len], stroke: 'rgba(120,190,225,0.22)', sw: 0.8, round: true }); // lit edge beside each crack
    }
    prims.push({ t: 'clip', clip: face, children });
    // The lit LIP: a luminous edge along the plateau's front rim so it catches the starlight and the
    // slab reads with thickness (drawn LAST, on top of the land fill at the call site).
    for (let i = 1; i < top.length; i++) {
      prims.push({ t: 'line', a: top[i - 1]!, b: top[i]!, stroke: 'rgba(150,232,255,0.9)', sw: 2.6, round: true });
      prims.push({ t: 'line', a: top[i - 1]!, b: top[i]!, stroke: 'rgba(232,252,255,0.7)', sw: 1, round: true });
    }
  }
  return { prims, faces };
}

/**
 * A graceful side-on SPACE WHALE drifting through the deep (GS-cetus-2). A smooth fusiform body
 * (rounded head → tapering tail stock), a long curved humpback PECTORAL fin, a two-lobed notched
 * tail FLUKE, a blowhole MIST spout, a glowing eye, a lit dorsal ridge and a scatter of
 * bioluminescent star-speckles across the body — so the creature is genuinely whale-shaped and reads
 * as made of the night, not a flat fish outline. Screen space; deterministic from the supplied rng.
 */
function whaleSilhouette(cx: number, cy: number, len: number, rng: () => number): Prim[] {
  const f = rng() < 0.5 ? 1 : -1; // facing left/right
  const tilt = (rng() - 0.5) * 0.36;
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  const H = len * 0.5; // body height envelope (chunky, not eel-thin)
  const T = (lx: number, ly: number): Vec => {
    const x = f * lx * len;
    const y = ly * H;
    return [cx + x * ca - y * sa, cy + x * sa + y * ca];
  };
  // A chunky, recognizable whale body (fractions of len/H): bulky head → high straight back → tail
  // stock → full rounded belly → jaw. Tall enough that the SHAPE reads even small in the whole-hole map.
  const body: Vec[] = [
    T(0.5, 0.02), T(0.46, -0.12), T(0.36, -0.26), T(0.18, -0.34), T(-0.05, -0.34),
    T(-0.26, -0.29), T(-0.42, -0.17), T(-0.44, -0.01), T(-0.4, 0.13), T(-0.22, 0.27),
    T(0.0, 0.33), T(0.22, 0.31), T(0.4, 0.2), T(0.47, 0.09),
  ];
  // A darker belly so the body has a lit-from-above volume (the back stays the bright fill).
  const belly: Vec[] = [T(-0.4, 0.13), T(-0.22, 0.27), T(0.0, 0.33), T(0.22, 0.31), T(0.4, 0.2), T(0.46, 0.1), T(0.2, 0.16), T(-0.1, 0.18), T(-0.4, 0.06)];
  // Big two-lobed, centre-notched tail fluke off the stock.
  const fluke: Vec[] = [T(-0.42, -0.04), T(-0.72, -0.36), T(-0.6, -0.06), T(-0.58, 0.05), T(-0.68, 0.36), T(-0.42, 0.08)];
  // Long curved humpback pectoral flipper sweeping down-forward from the lower body (drawn lighter so
  // it pops in front of the belly — the whale's signature read).
  const pec: Vec[] = [T(0.16, 0.16), T(0.48, 0.52), T(0.36, 0.56), T(0.02, 0.24)];
  const eye = T(0.34, -0.06);
  const blow = T(0.18, -0.34);
  const out: Prim[] = [
    { t: 'glow', c: [cx, cy], r: len * 1.25, col: 'rgba(95,225,250,0.22)' }, // bioluminescent aura
    { t: 'poly', pts: fluke, fill: '#10455f', stroke: 'rgba(155,246,255,0.85)', sw: 1.3 },
    { t: 'poly', pts: body, fill: '#1a5878', stroke: 'rgba(170,250,255,0.96)', sw: 1.8 }, // luminous back
    { t: 'poly', pts: belly, fill: 'rgba(6,28,46,0.5)' }, // belly shadow → volume
    { t: 'poly', pts: pec, fill: '#246a8d', stroke: 'rgba(165,248,255,0.9)', sw: 1.2 }, // near flipper, lit
    { t: 'line', a: T(0.34, -0.26), b: T(-0.3, -0.27), stroke: 'rgba(205,251,255,0.6)', sw: 1.3, round: true }, // lit dorsal ridge
  ];
  // Star-speckles dusting the body (the whale is made of the deep). Deterministic jitter from rng.
  const speckN = 8 + Math.floor(rng() * 4);
  for (let i = 0; i < speckN; i++) {
    const p = T((rng() - 0.5) * 0.74, (rng() - 0.42) * 0.5);
    out.push({ t: 'circle', c: p, r: Math.max(0.7, len * 0.016) + rng() * 1, fill: rng() < 0.5 ? 'rgba(232,253,255,0.95)' : 'rgba(155,234,255,0.8)' });
  }
  // Eye (bright core + dark ring), and a soft blowhole MIST spout.
  out.push({ t: 'circle', c: eye, r: Math.max(1.1, len * 0.032), fill: 'rgba(236,253,255,0.96)' });
  out.push({ t: 'circle', c: eye, r: Math.max(1.8, len * 0.052), fill: 'none', stroke: 'rgba(8,36,56,0.6)', sw: 1 });
  out.push({ t: 'line', a: blow, b: T(0.24, -0.76), stroke: 'rgba(205,250,255,0.62)', sw: 1.6, round: true });
  out.push({ t: 'line', a: blow, b: T(0.1, -0.72), stroke: 'rgba(205,250,255,0.46)', sw: 1.4, round: true });
  out.push({ t: 'circle', c: T(0.17, -0.8), r: 1.3 + rng() * 0.9, fill: 'rgba(233,252,255,0.86)' });
  return out;
}

/**
 * The star-ocean OFF the clifftop plateau (GS-cetus-2): a rich star-dusted deep + bioluminescent
 * current blooms, with space WHALES drifting through it. The whales are placed in COURSE space
 * (clear of the land hull) and projected — so they sit at fixed world positions and pan/zoom WITH
 * the camera like every other world object (the old screen-space placement, rejected against the
 * PROJECTED island, made the whale count — and the shared rng stream — depend on the projector).
 * Drawn BEFORE the landmass so the cliff overlaps their near edges. Own rng stream.
 */
function cetusOcean(landPolys: Vec[][], cb: Box, proj: Projector, W: number, H: number, accents: number, rng: () => number): Prim[] {
  const out: Prim[] = [];
  // A denser star-ocean base so the deep reads as the intro's starfield (Cetus's signature). These
  // sit under the landmass; the cliff masks the part over the plateau. Off this dedicated rng stream.
  if (accents > 0) {
    const extra = Math.round(70 * accents);
    for (let i = 0; i < extra; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const r = 0.4 + rng() * 1.2;
      out.push({ t: 'circle', c: [x, y], r, fill: rng() < 0.5 ? 'rgba(220,248,255,0.7)' : 'rgba(150,222,255,0.6)' });
      if (rng() < 0.12) out.push({ t: 'glow', c: [x, y], r: r * 5, col: 'rgba(150,230,255,0.4)' });
    }
  }
  // Broad bioluminescent current blooms + a few sweeping current arcs so the sea reads as living.
  for (let i = 0; i < 3; i++) {
    out.push({ t: 'glow', c: [W * (0.1 + rng() * 0.8), H * (0.45 + rng() * 0.5)], r: (0.22 + rng() * 0.22) * Math.max(W, H), col: 'rgba(55,180,215,0.12)' });
  }
  for (let i = 0; i < 4; i++) {
    const y = H * (0.4 + rng() * 0.56);
    const sag = (rng() - 0.5) * 26;
    out.push({ t: 'line', a: [0, y], b: [W, y + sag], stroke: `rgba(110,225,240,${(0.05 + rng() * 0.06).toFixed(3)})`, sw: 1.2, round: true });
  }
  if (accents <= 0) return out;
  // Whales in the deep, at COURSE-SPACE positions in a band around the island (rejected against the
  // course-space hull — projector-independent, so the rng draw count is stable). Sized in course yards
  // and projected, so they scale with zoom; off-screen ones are simply culled (no rng consumed). The
  // rng-draw count is fixed by `want`, so the river's separate stream is never desynced regardless.
  const spanX = cb.maxX - cb.minX || 1;
  const spanY = cb.maxY - cb.minY || 1;
  const cxw = (cb.minX + cb.maxX) / 2;
  const cyw = (cb.minY + cb.maxY) / 2;
  const want = 4 + Math.floor(rng() * 3);
  const targets: Vec[] = [];
  // A band hugging the island (clear of the plateau but not so far they fly off the zoomed view).
  for (let i = 0; i < want * 18 && targets.length < want; i++) {
    const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.55, cyw + (rng() - 0.5) * spanY * 1.55];
    if (landPolys.some((lp) => pointInPoly(c, lp))) continue; // keep clear of every land platform
    targets.push(c);
  }
  for (const c of targets) {
    // Sized in course yards but CLAMPED in screen px so a whale reads at both the whole-hole map zoom
    // (where the world scale is tiny) and the zoomed play view, scaling between the two.
    const lenCourse = 46 + rng() * 46;
    const lenPx = Math.max(58, Math.min(214, lenCourse * proj.scale));
    const s = proj.project(c);
    if (s[0] < -lenPx || s[0] > W + lenPx || s[1] < -lenPx || s[1] > H + lenPx) {
      // off-screen: still draw the whale's own rng (count stability) but discard the prims
      whaleSilhouette(s[0], s[1], lenPx, rng);
      continue;
    }
    out.push(...whaleSilhouette(s[0], s[1], lenPx, rng));
  }
  return out;
}

/**
 * The star-river CARVED through the fairway + its cliff WATERFALL (GS-cetus-3). The course-space
 * meander (`cetusRiverPath`, projector-independent) is projected to a glowing channel of deep
 * star-water DENSELY packed with the intro's starscape, welling from a glowing SOURCE (so it no
 * longer "starts out of nowhere") and pouring over the plateau's real front CLIFF FACE into the
 * ocean. Own rng stream + gated to cetus → determinism-safe. `faces` is the cliff geometry from
 * `cetusCliffs`, so the waterfall drops the exact height of the face it spills over.
 */
function cetusRiver(
  hole: Hole,
  proj: Projector,
  accents: number,
  rng: () => number,
  faces: { top: Vec[]; height: number }[],
): Prim[] {
  const rp = cetusRiverPath(hole, rng);
  if (!rp) return [];
  const { line, hw } = rp;
  const ribbon = projPoly(ribbonVar(line, hw), proj);
  const screen = line.map((p) => proj.project(p));
  const avgHwPx = Math.max(2, (hw.reduce((a, b) => a + b, 0) / hw.length) * proj.scale);

  // Built from a ribbon FILL (the channel) + STROKES along the spine (glow / current / sparkle). The
  // meander is capped within the corridor (see cetusRiverPath), so it never needs clipping to the
  // island — and we deliberately AVOID clipping it: the SVG serializer nests a clipPath inside the
  // clipped <g>, which silently drops the group's contents (the bug that hid the old render-only river).
  const stroke = (out: Prim[], stk: string, sw: number) => {
    for (let i = 1; i < screen.length; i++) out.push({ t: 'line', a: screen[i - 1]!, b: screen[i]!, stroke: stk, sw, round: true });
  };
  const river: Prim[] = [];
  stroke(river, 'rgba(95,225,252,0.2)', avgHwPx * 3.4 + 10); // soft outer bank glow (haloes past the rim)
  river.push({ t: 'poly', pts: ribbon, fill: 'rgba(8,30,48,0.9)' }); // dark deep-water bed → high contrast vs the teal turf
  stroke(river, 'rgba(70,180,225,0.85)', avgHwPx * 1.4); // glowing star-water surface down the channel
  river.push({ t: 'poly', pts: ribbon, fill: 'none', stroke: 'rgba(195,248,255,0.92)', sw: 1.5 }); // bright luminous shoreline
  stroke(river, 'rgba(205,246,255,0.85)', Math.max(1.4, avgHwPx * 0.4)); // bright current spine
  // Densely fill the channel with the intro's starscape so it reads as a RIVER OF STARS, not a teal
  // stripe: stars packed across the width down the length, ~10% "hero" stars with a soft halo.
  if (accents > 0) {
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const u = i / (steps - 1);
      const c = sampleAlong(line, u);
      const t = tangentAt(line, Math.min(line.length - 1, Math.round(u * (line.length - 1))));
      const nx = -t[1];
      const ny = t[0];
      const halfW = (hw[Math.min(hw.length - 1, Math.round(u * (hw.length - 1)))] ?? 4) * 0.9;
      const packed = 2;
      for (let j = 0; j < packed; j++) {
        const lat = (rng() * 2 - 1) * halfW;
        const p = proj.project([c[0] + nx * lat, c[1] + ny * lat]);
        const hero = rng() < 0.1;
        const col = rng() < 0.5 ? 'rgba(255,255,255,0.95)' : rng() < 0.5 ? 'rgba(180,242,255,0.9)' : 'rgba(210,220,255,0.85)';
        if (hero) river.push({ t: 'glow', c: p, r: 4 + rng() * 3, col: 'rgba(200,244,255,0.5)' });
        river.push({ t: 'circle', c: p, r: hero ? 1.4 + rng() * 1 : 0.5 + rng() * 1, fill: col });
      }
    }
  }

  // The river SOURCE (upstream end — screen-top / green side): a glowing spring where the star-water
  // wells up out of the plateau, so the channel has an origin instead of fading in from nowhere.
  const endA = screen[0]!;
  const endB = screen[screen.length - 1]!;
  // The SPILL end is whichever river mouth sits lowest on screen (nearest the front cliff we extruded).
  const spillIsA = endA[1] >= endB[1];
  const spill = spillIsA ? endA : endB;
  const source = spillIsA ? endB : endA;
  const srcW = Math.max(6, avgHwPx * 1.6);
  river.push({ t: 'glow', c: source, r: srcW * 2.4, col: 'rgba(120,225,255,0.4)' });
  river.push({ t: 'circle', c: source, r: srcW, fill: 'rgba(60,150,205,0.6)' });
  river.push({ t: 'circle', c: source, r: srcW * 0.5, fill: 'rgba(220,248,255,0.9)' });
  for (let i = 0; i < (accents > 0 ? 9 : 0); i++) {
    river.push({ t: 'circle', c: [source[0] + (rng() - 0.5) * srcW * 2.2, source[1] + (rng() - 0.5) * srcW * 2.2], r: 0.5 + rng() * 1.2, fill: 'rgba(230,252,255,0.85)' });
  }

  // The WATERFALL: the river pours off the front cliff FACE into the ocean. Drop the exact height of
  // the widest extruded face (so the curtain lands in the sea, not mid-cliff), as a fanning curtain of
  // falling stars over a watery veil, with a bright lip glow and a splash pool + ripple rings below.
  const face = faces.length
    ? faces.slice().sort((a, b) => bboxOf(b.top).maxX - bboxOf(b.top).minX - (bboxOf(a.top).maxX - bboxOf(a.top).minX))[0]!
    : null;
  const fallLen = (face?.height ?? Math.max(24, avgHwPx * 6)) + 26;
  const spillW = Math.max(14, (spillIsA ? hw[0]! : hw[hw.length - 1]!) * proj.scale * 1.8);
  const fall: Prim[] = [{ t: 'glow', c: spill, r: spillW * 1.4, col: 'rgba(140,232,255,0.4)' }];
  // The watery veil behind the falling stars.
  fall.push({
    t: 'poly',
    pts: [
      [spill[0] - spillW * 0.5, spill[1]],
      [spill[0] + spillW * 0.5, spill[1]],
      [spill[0] + spillW * 0.72, spill[1] + fallLen],
      [spill[0] - spillW * 0.72, spill[1] + fallLen],
    ],
    fill: 'rgba(22,64,96,0.5)',
  });
  const fallN = accents > 0 ? 22 : 6;
  for (let i = 0; i < fallN; i++) {
    const fx = (i / Math.max(1, fallN - 1) - 0.5) + (rng() - 0.5) * 0.08; // even lanes → a curtain
    const yA = spill[1] + fallLen * rng() * 0.35;
    const yB = Math.min(spill[1] + fallLen, yA + fallLen * (0.45 + rng() * 0.5));
    const xAt = (y: number) => spill[0] + fx * spillW * (1 + 0.44 * ((y - spill[1]) / fallLen));
    fall.push({ t: 'line', a: [xAt(yA), yA], b: [xAt(yB), yB], stroke: `rgba(205,249,255,${(0.35 + rng() * 0.5).toFixed(2)})`, sw: 1.1, round: true });
    if (accents > 0) {
      const yc = yA + (yB - yA) * rng();
      fall.push({ t: 'circle', c: [xAt(yc), yc], r: 0.6 + rng() * 1, fill: 'rgba(232,252,255,0.92)' });
    }
  }
  const pool: Vec = [spill[0], spill[1] + fallLen];
  fall.push({ t: 'glow', c: pool, r: spillW * 1.3, col: 'rgba(150,238,255,0.32)' });
  for (let i = 1; i <= 3; i++) {
    fall.push({ t: 'circle', c: pool, r: i * 5.5 + spillW * 0.2, fill: 'none', stroke: `rgba(150,238,255,${(0.5 - i * 0.13).toFixed(2)})`, sw: 1.1 });
  }
  return [...river, ...fall];
}

/**
 * Build the full static scene for a hole as a flat list of screen-space prims, in paint order:
 * rough background + texture, ground accents, terrain features, hazards, OB boundary, centreline,
 * tee + flag. The interactive overlays (spray cone, live ball, shot lines, HUD) stay in each
 * renderer — this is only the world.
 */
/**
 * Resolve a stop's WORLD identity for the render: which archetype's explicit turf palette to paint
 * (GS-19, replacing the old subtle hue-rotation) and how much rarity should deepen it. Archetype is
 * keyed off the theme id when present, else the biome id, so a biome-only render (the Sim Lab) still
 * reads on-world. A themeless verdant render uses `verdant` + deepen 1 → byte-identical to before.
 */
/**
 * RENDER-ONLY rarity richness (GS-rarity-style). Decoupled from `RARITY_INTENSITY` (which scales the
 * biome PHYSICS and must stay balance-stable) so a rarer stop can read VISIBLY richer/deeper on screen
 * without touching gravity/wind/spice. Bolder than the physics intensity: a legendary world's turf +
 * deep-space backdrop go markedly deeper and more saturated. Common = 1 (a themeless render is
 * byte-identical). Pure value tint — it never adds prims, so the render prim-count invariants hold.
 */
const RARITY_VIEW_DEEPEN: Record<string, number> = { common: 1, rare: 1.3, epic: 1.6, legendary: 1.95 };

function worldLook(themeId: string | undefined, biome: string | undefined): { arch: BiomeArchetype; deepen: number } {
  const arch = archetypeFor(themeId, biome ?? '');
  const deepen = themeId ? RARITY_VIEW_DEEPEN[themeById(themeId)?.rarity ?? 'common'] ?? 1 : 1;
  return { arch, deepen };
}

/**
 * The stop's constellation, hung large across the upper sky (screen-space) and rarity-tinted
 * (GS-17e). Pure & deterministic — figure geometry comes from the catalogue table, positions are
 * fixed (no rng), so it's byte-stable. Deep-sky/galaxy themes have no stick figure → nothing drawn
 * (the ambient starfield carries them). The figure stars sit ON TOP of the terrain (it's the sky),
 * so the constellation is the stop's identity in BOTH the map and the zoomed play view — not a
 * faint corner motif. The brightest star (lowest magnitude) is the ANCHOR: it gets an extra glow
 * + a fine ring so a Scorpius reads off its Antares, an Orion off its Rigel.
 */
function constellationBackdrop(themeId: string, W: number, H: number): Prim[] {
  const fig = constellationFigure(themeId);
  if (!fig) return [];
  const tint = rarCol(themeById(themeId)?.rarity ?? 'common');
  // Fit the unit-box figure into a generous sky panel across the top, preserving aspect.
  const boxW = W * 0.62;
  const boxH = H * 0.26;
  const ox = W * 0.5 - boxW / 2;
  const oy = H * 0.045;
  const at = (s: { x: number; y: number }): Vec => [ox + s.x * boxW, oy + s.y * boxH];
  // The anchor = the figure's brightest star (lowest magnitude).
  let anchor = 0;
  for (let i = 1; i < fig.stars.length; i++) if (fig.stars[i]!.m < fig.stars[anchor]!.m) anchor = i;

  const prims: Prim[] = [];
  // Faint connecting lines first (the stick figure) — a touch brighter than the corner motif was.
  for (const [a, b] of fig.lines) {
    const sa = fig.stars[a];
    const sb = fig.stars[b];
    if (!sa || !sb) continue;
    prims.push({ t: 'line', a: at(sa), b: at(sb), stroke: hexAlpha(tint, 0.42), sw: 0.9, round: true });
  }
  // Then the stars: brighter (lower mag) = bigger, with a soft halo + a tint dot.
  for (let i = 0; i < fig.stars.length; i++) {
    const s = fig.stars[i]!;
    const p = at(s);
    const r = Math.max(1.2, 3.6 - s.m * 0.5);
    if (i === anchor) {
      // The anchor star: a wide warm glow + a fine tinted ring, so it reads as the hero.
      prims.push({ t: 'circle', c: p, r: r * 4.2, fill: hexAlpha(tint, 0.12) });
      prims.push({ t: 'circle', c: p, r: r * 2.1, fill: 'none', stroke: hexAlpha(tint, 0.5), sw: 0.8 });
    }
    prims.push({ t: 'circle', c: p, r: r * 2.4, fill: hexAlpha(tint, 0.18) }); // halo
    prims.push({ t: 'circle', c: p, r, fill: 'rgba(255,255,255,0.97)' });
    prims.push({ t: 'circle', c: p, r: Math.max(0.7, r * 0.55), fill: hexAlpha(tint, 0.9) });
  }
  return prims;
}

/** Per-world WIND look (GS-wind): the colour of the weather streaking across the hole. */
const WIND_COL: Record<BiomeArchetype, string> = {
  inferno: 'rgba(255,150,70,', // solar wind / embers
  frost: 'rgba(222,243,255,', // driven snow
  desert: 'rgba(226,196,140,', // blown dust
  verdant: 'rgba(208,236,206,', // pollen / leaf drift
  void: 'rgba(200,170,255,', // cosmic dust
  crystal: 'rgba(190,238,248,', // glittering crystal dust
  tempest: 'rgba(200,180,255,', // driving storm rain
  fungal: 'rgba(150,240,190,', // drifting glowing spores
  ocean: 'rgba(190,235,230,', // sea spray
  cetus: 'rgba(150,235,245,', // luminous sea-spray off the deep
};

/** Unit SCREEN direction the wind blows, from a hole's `Wind.dir` (course bearing) through the
 *  projector (which has rotated tee→green up) — so the streaks read true to the shot bearing. */
function windScreenDir(hole: Hole, proj: Projector): Vec {
  const w = hole.wind;
  if (!w) return [0, 0];
  const r = (w.dir * Math.PI) / 180;
  const c0 = hole.tee;
  const c1: Vec = [c0[0] + Math.sin(r), c0[1] + Math.cos(r)];
  const a = proj.project(c0);
  const b = proj.project(c1);
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/**
 * Static wind streaks blowing across the hole (GS-wind) — the on-screen "solar wind" that shows
 * which way and how hard it's blowing, themed per world. Screen-space, off the independent `crng`
 * (so it never perturbs the terrain stream), count + length scaling with `Wind.spd`. The play view
 * layers an animated drift on top; this static pass makes the map + SVG read the weather too.
 */
function windStreaks(hole: Hole, proj: Projector, arch: BiomeArchetype, W: number, H: number, crng: () => number): Prim[] {
  const spd = hole.wind?.spd ?? 0;
  if (spd < 2) return [];
  const [dx, dy] = windScreenDir(hole, proj);
  if (dx === 0 && dy === 0) return [];
  const intensity = Math.min(1, (spd - 2) / 26);
  // FLOWING comet-streaks, not scratchy uniform dashes (the old look read as rain on the glass). Each
  // streak is a faint long TAIL + a brighter short HEAD at its leading edge, so the wind DIRECTION
  // reads at a glance even on the still SVG map; count/length/brightness scale with speed. The
  // animated overlay (weather.ts) layers true motion on top during play. Off the independent `crng`,
  // the LAST crng consumer in buildScene, so count/draw changes shift nothing else (determinism kept).
  const count = Math.round(10 + intensity * 30);
  const colBase = WIND_COL[arch];
  // The cross-stream perpendicular, to bow each streak slightly into a gust curve.
  const px = -dy;
  const py = dx;
  const prims: Prim[] = [];
  for (let i = 0; i < count; i++) {
    const hx = crng() * W;
    const hy = crng() * H;
    const len = (16 + intensity * 40) * (0.55 + crng() * 0.9);
    const bow = (crng() - 0.5) * len * 0.18;
    const tailA = (0.05 + intensity * 0.10) * (0.6 + crng() * 0.4);
    const headA = tailA * 2.1;
    // faint long tail, trailing back UPWIND from the head
    const tx = hx - dx * len + px * bow;
    const ty = hy - dy * len + py * bow;
    prims.push({ t: 'line', a: [hx, hy], b: [tx, ty], stroke: colBase + tailA.toFixed(3) + ')', sw: 1, round: true });
    // brighter short head segment so the leading edge (wind direction) pops
    prims.push({ t: 'line', a: [hx, hy], b: [hx - dx * len * 0.32, hy - dy * len * 0.32], stroke: colBase + headA.toFixed(3) + ')', sw: 1.5, round: true });
  }
  return prims;
}

/** `#rrggbb` + alpha → an `rgba()` string (render-only helper). */
function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Archetype SIGNATURE ground decor (GS-biome-feel) — the Cetus treatment (whales/star-river),
 * generalised: each world gets a bespoke seeded decor pass so its ground reads as a PLACE, not a
 * recoloured slab. Void: drifting asteroid islets in the abyss + a distant black-hole eye. Inferno:
 * glowing ground fissures. Fungal: spore-mist + tiny toadstool clusters in the rough. Crystal: shard
 * clusters + prismatic ground glints. Frost: snow drifts + ice-sheen cracks. Desert: dune ripples +
 * sun-bleached rocks. Tempest: cloud-shadow bands + a storm eye with a forked lightning strand.
 * Ocean: foam surf-lines around the island + sandy islets with a palm out in the sea.
 *
 * Determinism: consumes ONLY the dedicated `rng` stream passed in (seeded off the hole hash with its
 * own salt, like the cetus streams) and is gated per archetype — so every other world's prims and
 * every other stream are byte-for-byte untouched. Cetus/verdant return nothing (cetus has its own
 * bespoke passes; verdant is the familiar parkland baseline the wild worlds contrast against).
 */
function archetypeDecor(
  arch: BiomeArchetype,
  islandPts: Vec[],
  landPolysCourse: Vec[][],
  cb: Box,
  proj: Projector,
  W: number,
  H: number,
  accents: number,
  onGrass: (p: Vec) => boolean,
  rng: () => number,
): Prim[] {
  const out: Prim[] = [];
  const clipped: Prim[] = []; // gathered, then pushed as ONE island clip (never nest clips — SVG serializer bug)
  // A course-space point in the hole's bbox, projected; rejected off the cut grass. Bounded attempts
  // so the draw count can never run away; a miss returns null (rng was still consumed — fine, this
  // stream feeds nothing else).
  const groundPt = (): Vec | null => {
    for (let i = 0; i < 8; i++) {
      const cp: Vec = [cb.minX + (cb.maxX - cb.minX) * rng(), cb.minY + (cb.maxY - cb.minY) * rng()];
      if (onGrass(cp)) continue;
      const sp = proj.project(cp);
      if (!inView(sp, W, H)) continue;
      return sp;
    }
    return null;
  };

  switch (arch) {
    case 'void': {
      // Asteroid islets adrift in the abyss beyond the fairway islands — the void is a PLACE you
      // could fall into, not a purple background. Course-space band around the island (the whale
      // placement model), rejected off every land platform, sized in yards and clamped in px.
      const spanX = cb.maxX - cb.minX || 1;
      const spanY = cb.maxY - cb.minY || 1;
      const cxw = (cb.minX + cb.maxX) / 2;
      const cyw = (cb.minY + cb.maxY) / 2;
      const want = 5 + Math.floor(rng() * 3);
      for (let i = 0, placed = 0; i < want * 14 && placed < want; i++) {
        const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.7, cyw + (rng() - 0.5) * spanY * 1.7];
        if (landPolysCourse.some((lp) => pointInPoly(c, lp))) continue;
        placed++;
        const s = proj.project(c);
        const r = Math.max(4, Math.min(22, (5 + rng() * 9) * proj.scale));
        if (!inView(s, W, H)) continue; // sized + placed (rng consumed), just not painted
        const pts: Vec[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const rk = r * (0.72 + posHash(s[0], s[1], k) * 0.5);
          pts.push([s[0] + Math.cos(a) * rk, s[1] + Math.sin(a) * rk * 0.8]);
        }
        out.push({ t: 'glow', c: s, r: r * 2.1, col: 'rgba(150,120,255,0.14)' });
        out.push({ t: 'poly', pts, fill: '#241a44', stroke: 'rgba(150,140,220,0.5)', sw: 1 });
        out.push({ t: 'line', a: pts[4]!, b: pts[5]!, stroke: 'rgba(200,185,255,0.65)', sw: 1.4, round: true }); // starlit rim
        out.push({ t: 'circle', c: [s[0] + r * 0.2, s[1] - r * 0.24], r: 1, fill: 'rgba(215,200,255,0.9)' }); // crystal glint
      }
      // A distant black-hole eye low in the sky — the thing the void gardens orbit.
      const bx = W * (0.16 + rng() * 0.68);
      const by = H * (0.05 + rng() * 0.1);
      const br = 6 + rng() * 4;
      out.push({ t: 'glow', c: [bx, by], r: br * 7, col: 'rgba(150,90,225,0.30)' });
      out.push({ t: 'circle', c: [bx, by], r: br * 1.6, fill: 'none', stroke: 'rgba(235,210,255,0.55)', sw: 1.2 }); // accretion ring
      out.push({ t: 'circle', c: [bx, by], r: br, fill: '#050208', stroke: 'rgba(200,160,255,0.8)', sw: 1 }); // the event horizon
      break;
    }
    case 'inferno': {
      // Glowing ground FISSURES crawling through the scorched rough — the crust is barely holding.
      const fissures = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < fissures; i++) {
        const p0 = groundPt();
        const ang = rng() * Math.PI * 2;
        if (!p0) continue; // nothing painted; this dedicated stream feeds nothing downstream
        let px0 = p0[0];
        let py0 = p0[1];
        let a = ang;
        for (let sgm = 0; sgm < 3; sgm++) {
          const len = 9 + posHash(px0, py0, sgm) * 14;
          const px1 = px0 + Math.cos(a) * len;
          const py1 = py0 + Math.sin(a) * len;
          clipped.push({ t: 'line', a: [px0, py0], b: [px1, py1], stroke: 'rgba(16,6,3,0.75)', sw: 3, round: true });
          clipped.push({ t: 'line', a: [px0, py0], b: [px1, py1], stroke: 'rgba(255,138,42,0.8)', sw: 1.2, round: true });
          a += (posHash(px1, py1, sgm) - 0.5) * 1.5;
          px0 = px1;
          py0 = py1;
        }
        clipped.push({ t: 'glow', c: p0, r: 8 + rng() * 8, col: 'rgba(255,130,50,0.28)' });
      }
      break;
    }
    case 'fungal': {
      // Spore-mist pooling in the undergrowth + tiny toadstool clusters — the jungle floor is alive.
      const mists = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < mists; i++) {
        const p = groundPt();
        const r = (0.07 + rng() * 0.08) * Math.min(W, H);
        if (p) clipped.push({ t: 'glow', c: p, r, col: 'rgba(120,240,180,0.13)' });
      }
      const shrooms = Math.round(7 * accents);
      for (let i = 0; i < shrooms; i++) {
        const p = groundPt();
        const cool = rng() < 0.4;
        if (!p) continue;
        const h = 3 + posHash(p[0], p[1]) * 2.5;
        const cap = cool ? '#7af0c0' : '#b07eff';
        clipped.push({ t: 'line', a: p, b: [p[0], p[1] - h], stroke: '#ded4f2', sw: 1.1, round: true });
        clipped.push({ t: 'circle', c: [p[0], p[1] - h], r: 1.6 + posHash(p[0], p[1], 2), fill: cap });
        if (posHash(p[0], p[1], 3) < 0.45) clipped.push({ t: 'glow', c: [p[0], p[1] - h], r: 6, col: cool ? 'rgba(122,240,192,0.35)' : 'rgba(176,126,255,0.35)' });
      }
      break;
    }
    case 'crystal': {
      // Shard clusters growing out of the rough + prismatic ground glints — everything refracts.
      const clusters = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < clusters; i++) {
        const p = groundPt();
        const big = 4 + rng() * 5;
        if (!p) continue;
        const lean = (posHash(p[0], p[1]) - 0.5) * big * 0.7;
        clipped.push({ t: 'glow', c: [p[0], p[1] - big * 0.6], r: big * 2.4, col: 'rgba(160,225,255,0.22)' });
        clipped.push({ t: 'poly', pts: [[p[0], p[1] - big * 1.7], [p[0] + big * 0.4, p[1] - big * 0.4], [p[0] + big * 0.2, p[1]], [p[0] - big * 0.34, p[1] - big * 0.3]], fill: '#9fd8e6', stroke: 'rgba(30,70,100,0.55)', sw: 0.8 });
        clipped.push({ t: 'poly', pts: [[p[0] + lean + big * 0.5, p[1] - big], [p[0] + lean + big * 0.8, p[1] - big * 0.2], [p[0] + lean + big * 0.45, p[1]]], fill: '#cbe0ea', stroke: 'rgba(30,70,100,0.45)', sw: 0.8 });
      }
      const glintCols = ['#ff9ab8', '#ffe14a', '#7af0c0', '#9fd8ff'];
      const glints = Math.round(5 * accents);
      for (let i = 0; i < glints; i++) {
        const p = groundPt();
        const col = glintCols[Math.floor(rng() * glintCols.length)]!;
        if (!p) continue;
        clipped.push({ t: 'line', a: [p[0] - 2, p[1]], b: [p[0] + 2, p[1]], stroke: col, sw: 0.9, round: true });
        clipped.push({ t: 'line', a: [p[0], p[1] - 2], b: [p[0], p[1] + 2], stroke: col, sw: 0.9, round: true });
      }
      break;
    }
    case 'frost': {
      // Wind-blown snow drifts + ice-sheen cracks — the ground is frozen, not just teal.
      const drifts = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < drifts; i++) {
        const p = groundPt();
        const r = (0.05 + rng() * 0.07) * Math.min(W, H);
        if (p) clipped.push({ t: 'circle', c: p, r, fill: 'rgba(240,250,255,0.10)' });
      }
      const cracks = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < cracks; i++) {
        const p = groundPt();
        const ang = rng() * Math.PI * 2;
        if (!p) continue;
        const len = 8 + posHash(p[0], p[1]) * 12;
        const mx = p[0] + Math.cos(ang) * len;
        const my = p[1] + Math.sin(ang) * len;
        clipped.push({ t: 'line', a: p, b: [mx, my], stroke: 'rgba(220,245,255,0.35)', sw: 0.9, round: true });
        clipped.push({ t: 'line', a: [mx, my], b: [mx + Math.cos(ang + 0.7) * len * 0.5, my + Math.sin(ang + 0.7) * len * 0.5], stroke: 'rgba(220,245,255,0.28)', sw: 0.8, round: true });
      }
      break;
    }
    case 'desert': {
      // Dune ripples combed across the waste + the odd sun-bleached rock.
      const bands = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < bands; i++) {
        const p = groundPt();
        const ang = rng() * Math.PI; // ripple grain
        if (!p) continue;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        for (let k = 0; k < 4; k++) {
          const off = (k - 1.5) * 4.5;
          const cxp = p[0] - dy * off;
          const cyp = p[1] + dx * off;
          const len = 7 + posHash(cxp, cyp, k) * 8;
          clipped.push({ t: 'line', a: [cxp - dx * len, cyp - dy * len], b: [cxp + dx * len, cyp + dy * len], stroke: 'rgba(235,205,150,0.20)', sw: 1.2, round: true });
        }
      }
      const rocks = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < rocks; i++) {
        const p = groundPt();
        if (!p) continue;
        const r = 2.5 + posHash(p[0], p[1]) * 3;
        clipped.push({ t: 'poly', pts: [[p[0] - r, p[1]], [p[0] - r * 0.3, p[1] - r * 0.9], [p[0] + r * 0.7, p[1] - r * 0.6], [p[0] + r, p[1]]], fill: '#8a6f4a', stroke: 'rgba(46,36,19,0.6)', sw: 0.8 });
        clipped.push({ t: 'line', a: [p[0] - r * 0.3, p[1] - r * 0.9], b: [p[0] + r * 0.7, p[1] - r * 0.6], stroke: 'rgba(255,240,210,0.5)', sw: 0.9, round: true });
      }
      break;
    }
    case 'tempest': {
      // Cloud shadows racing over the ground + the storm's eye glowering in the sky.
      const bands = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < bands; i++) {
        const y0 = rng() * H;
        const slant = 30 + rng() * 50;
        const bw = 26 + rng() * 30;
        clipped.push({ t: 'poly', pts: [[-20, y0], [W + 20, y0 - slant], [W + 20, y0 - slant + bw], [-20, y0 + bw]], fill: 'rgba(8,10,18,0.14)' });
      }
      const ex = W * (0.18 + rng() * 0.64);
      const ey = H * (0.05 + rng() * 0.09);
      const er = 12 + rng() * 10;
      out.push({ t: 'glow', c: [ex, ey], r: er * 4, col: 'rgba(170,150,255,0.28)' });
      out.push({ t: 'circle', c: [ex, ey], r: er, fill: 'none', stroke: 'rgba(210,195,255,0.4)', sw: 1.4 });
      out.push({ t: 'circle', c: [ex, ey], r: er * 0.55, fill: 'none', stroke: 'rgba(230,220,255,0.5)', sw: 1 });
      // One forked lightning strand hanging from the eye (static; the animated layer flickers live).
      let lx = ex;
      let ly = ey + er * 0.6;
      for (let sgm = 0; sgm < 3; sgm++) {
        const nx = lx + (posHash(lx, ly, sgm) - 0.5) * 22;
        const ny = ly + 12 + posHash(lx, ly, sgm + 3) * 14;
        out.push({ t: 'line', a: [lx, ly], b: [nx, ny], stroke: 'rgba(255,240,180,0.5)', sw: 1.4, round: true });
        if (sgm === 1) out.push({ t: 'line', a: [lx, ly], b: [lx + 14, ly + 12], stroke: 'rgba(255,240,180,0.35)', sw: 1.1, round: true });
        lx = nx;
        ly = ny;
      }
      break;
    }
    case 'ocean': {
      // Surf FOAM around the island's shore + sandy islets with a palm out in the lagoon.
      out.push({ t: 'poly', pts: offsetPoly(islandPts, -5), fill: 'none', stroke: 'rgba(150,235,225,0.35)', sw: 2.6 });
      out.push({ t: 'poly', pts: offsetPoly(islandPts, -11), fill: 'none', stroke: 'rgba(150,235,225,0.16)', sw: 4 });
      const spanX = cb.maxX - cb.minX || 1;
      const spanY = cb.maxY - cb.minY || 1;
      const cxw = (cb.minX + cb.maxX) / 2;
      const cyw = (cb.minY + cb.maxY) / 2;
      const want = 3 + Math.floor(rng() * 2);
      for (let i = 0, placed = 0; i < want * 14 && placed < want; i++) {
        const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.7, cyw + (rng() - 0.5) * spanY * 1.7];
        if (landPolysCourse.some((lp) => pointInPoly(c, lp))) continue;
        placed++;
        const s = proj.project(c);
        const r = Math.max(4, Math.min(16, (4 + rng() * 6) * proj.scale));
        if (!inView(s, W, H)) continue;
        out.push({ t: 'circle', c: s, r: r * 1.35, fill: 'none', stroke: 'rgba(220,248,255,0.4)', sw: 1.2 }); // breaking surf
        out.push({ t: 'circle', c: s, r, fill: '#c8b088', stroke: 'rgba(90,70,40,0.5)', sw: 1 }); // the sand cay
        out.push({ t: 'line', a: [s[0], s[1] - r * 0.2], b: [s[0], s[1] - r * 1.1], stroke: '#a8845a', sw: 1.4, round: true }); // a lone palm
        out.push({ t: 'line', a: [s[0], s[1] - r * 1.1], b: [s[0] - r * 0.5, s[1] - r * 1.25], stroke: '#2f9a4a', sw: 1.2, round: true });
        out.push({ t: 'line', a: [s[0], s[1] - r * 1.1], b: [s[0] + r * 0.5, s[1] - r * 1.2], stroke: '#2f9a4a', sw: 1.2, round: true });
      }
      break;
    }
    default:
      break; // verdant = the parkland baseline; cetus has its own bespoke ocean/river/cliff passes
  }
  if (clipped.length) out.push({ t: 'clip', clip: islandPts, children: clipped });
  return out;
}

export function buildScene(hole: Hole, proj: Projector, opts: SceneOpts): Prim[] {
  const { width: W, height: H, biome, themeId } = opts;
  // Rainbow Road (GS-rainbow): the play surfaces become a glowing rainbow ribbon and everything off
  // it is the bare starry void (out of bounds). The deep-space base + starfield (painted first) stay,
  // so the ribbon floats through the stars; the land hull, rough texture and non-sand hazards are
  // dropped below. All rng draws are KEPT (only the prim pushes change), so the art stream is stable.
  const rainbow = !!opts.rainbow;
  const art = artFeel(opts.art);
  const rng = mulberry32(hashHole(hole));
  const prims: Prim[] = [];
  // The stop's world identity → explicit per-archetype turf palette (GS-19), rarity-deepened.
  // verdant + deepen 1 (themeless) reproduces the original SHADES byte-for-byte.
  const { arch, deepen } = worldLook(themeId, biome);
  const fwShade = turfShade('fairway', arch, deepen);
  const grShade = turfShade('green', arch, deepen);
  const teeShade = turfShade('tee', arch, deepen);

  // Geometry we reject rough texture / flowers from (keep them out of the cut grass).
  const fairwayPoly = hole.features.find((f) => f.kind === 'fairway')?.poly;
  const greenPoly = hole.features.find((f) => f.kind === 'green')?.poly;
  const onGrass = (p: Vec): boolean =>
    (!!fairwayPoly && pointInPoly(p, fairwayPoly)) || (!!greenPoly && pointInPoly(p, greenPoly));

  // Course-space bbox to scatter ground detail across (then project + cull to the view).
  const allPts: Vec[] = [];
  for (const f of [...hole.features, ...hole.hazards]) allPts.push(...f.poly);
  allPts.push(hole.tee, hole.green);
  const cb = bboxOf(allPts);
  const span = Math.max(cb.maxX - cb.minX, cb.maxY - cb.minY) || 1;
  const randCoursePt = (): Vec => [
    cb.minX + (cb.maxX - cb.minX) * rng(),
    cb.minY + (cb.maxY - cb.minY) * rng(),
  ];

  // The floating landmass (GS — "golf amongst the stars") hugs the hole GEOMETRY (a tight margin),
  // NOT the full OB play-bounds box. The OB box is a deliberately GENEROUS fairness boundary
  // (`clamp(span*0.25,40,90)`); filling it with rough sprawled the turf to the screen edges, so the
  // zoomed play view was wall-to-wall green with no sky. We draw a tighter land hull (the geometry
  // bbox + a small margin) and let SPACE show beyond it, so the starfield reads DURING play; the real
  // OB box stays the (invisible) trigger and its stakes float out in the void. Purely visual — OB /
  // fairness is untouched. (This generalises the void's "island in the abyss" look to all worlds.)
  const landMargin = Math.max(14, Math.min(36, span * 0.08));
  // The landmass is a ROUNDED, gently-irregular island hull (not a hard rectangle) so a stop reads
  // as a piece of ground floating in space, not a green picture-frame. Built off its OWN rng so the
  // corner wobble never perturbs the terrain (`rng`) or celestial (`crng`) streams.
  const lb: Box = {
    minX: cb.minX - landMargin,
    minY: cb.minY - landMargin,
    maxX: cb.maxX + landMargin,
    maxY: cb.maxY + landMargin,
  };
  const hrng = mulberry32((hashHole(hole) ^ 0x1b873593) >>> 0);
  const landBox = roundedHull(lb, Math.min(lb.maxX - lb.minX, lb.maxY - lb.minY) * 0.22, 0.14, hrng);
  const islandPts = projPoly(landBox, proj);
  // Island-green par 3 (GS-cetus-2): a lost-rough par 3 has NO corridor — just the tee + a green
  // island floating in the deep. So instead of ONE hull spanning tee→green (which would fill the
  // gap with dark land), draw a land platform around EACH play feature (the green-island fairway +
  // the tee), letting the open star-ocean read between them. Detected off the roughLie biomeMod
  // (the lost-rough signal the sim already carries) so the render needs no new hole flag.
  const islandHole =
    hole.par === 3 && (hole.biomeMods?.some((m) => m.kind === 'roughLie') ?? false) && !rainbow;
  const fairwayFeat = hole.features.find((f) => f.kind === 'fairway');
  const teeFeat = hole.features.find((f) => f.kind === 'tee');
  // The land platforms, in COURSE space (grown a touch beyond each feature for a turf margin).
  const landPlatformsCourse: Vec[][] =
    islandHole && fairwayFeat && teeFeat
      ? [offsetPoly(fairwayFeat.poly, -14), offsetPoly(teeFeat.poly, -10)]
      : [landBox];
  const landPlatforms = landPlatformsCourse.map((p) => projPoly(p, proj));
  const space = spaceLookFor(arch, deepen);
  // A SEPARATE rng stream for celestial scatter (so the terrain/tree/water/lava placement that
  // reads off the main `rng` stays byte-identical) keyed off the same hole hash.
  const crng = mulberry32((hashHole(hole) ^ 0x5747a2) >>> 0);
  // GS-cetus: SEPARATE, INDEPENDENT streams for the star-ocean and the star-river, so the bespoke
  // Cetus visuals never perturb the terrain (`rng`) or celestial (`crng`) placement — every OTHER
  // world is byte-for-byte unchanged (the decor is also gated to `arch === 'cetus'` below). The two
  // get DISTINCT seeds (not one shared stream) so the ocean's draw count can never desync the river
  // — the root of the "river jumps with zoom/pan" bug (GS-cetus-2).
  const oceanRng = mulberry32((hashHole(hole) ^ 0x000ce705) >>> 0);
  const riverRng = mulberry32((hashHole(hole) ^ 0x00cef10e) >>> 0);
  // GS-cetus-3: a THIRD dedicated stream for the clifftop extrusion (dropdown cliff faces), distinct
  // from ocean/river so none of the three can desync the others.
  const cliffRng = mulberry32((hashHole(hole) ^ 0x00c11ff5) >>> 0);
  // The extruded cliff faces, filled by the cliff pass below and reused by the river's waterfall so it
  // spills down a real edge. Empty on every non-cetus world (the pass is gated to `arch === 'cetus'`).
  let cetusFaces: { top: Vec[]; height: number }[] = [];

  // --- 1. Deep space: an opaque world-tinted base + soft nebula smears ---------
  // The nebulae are SOFT radial GLOWS (luminous wash, the intro's sky) — NOT hard-edged flat discs,
  // which read as a "weird static blob" floating over the hole. A touch brighter at the core than the
  // old flat alpha (a glow falls off, so a flat-alpha peak looked anaemic) and feathered to nothing.
  prims.push({ t: 'poly', pts: [[0, 0], [W, 0], [W, H], [0, H]], fill: space.base });
  const nebPeak = scaleAlpha(space.nebula, 1.9);
  for (let i = 0; i < 3; i++) {
    prims.push({
      t: 'glow',
      c: [W * (0.08 + crng() * 0.84), H * (0.04 + crng() * 0.5)],
      r: (0.3 + crng() * 0.3) * Math.max(W, H),
      col: nebPeak,
    });
  }

  // --- 2. Starfield in the void — the intro's sky, carried in-game -------------
  if (art.accents > 0) {
    const starTarget = Math.round(90 * art.accents);
    for (let i = 0; i < starTarget; i++) {
      const sx = crng() * W;
      const sy = crng() * H;
      const r = 0.4 + crng() * 1.3;
      const tone = crng();
      const col =
        tone < 0.6 ? 'rgba(255,255,255,0.92)' : tone < 0.8 ? 'rgba(186,214,255,0.9)' : 'rgba(255,222,228,0.85)';
      prims.push({ t: 'circle', c: [sx, sy], r, fill: col });
      if (crng() < 0.16) {
        // A brighter star: a soft glowing halo + a 4-point twinkle (the intro's hero stars).
        prims.push({ t: 'glow', c: [sx, sy], r: r * 4.5, col: 'rgba(255,255,255,0.5)' });
        const s = r + 1.8;
        prims.push({ t: 'line', a: [sx - s, sy], b: [sx + s, sy], stroke: col, sw: 0.7, round: true });
        prims.push({ t: 'line', a: [sx, sy - s], b: [sx, sy + s], stroke: col, sw: 0.7, round: true });
      }
    }
    // A far planet (ring + shaded disc + lit highlight) and a faint comet up in the sky. Kept SMALL,
    // HIGH (the top sky band) and TRANSLUCENT so it reads as a DISTANT background body — not a bright
    // disc parked over the course (it sits in screen space, so a low/large/opaque one looked like a
    // "weirdly placed graphic" floating on the green during the follow-cam flight).
    const planetCols = ['#caa3ff', '#7be0d0', '#ffb27a', '#9bc2ff', '#ff9bbf'];
    const pcol = planetCols[(crng() * planetCols.length) | 0]!;
    const pr = 6 + crng() * 7;
    const ppx = W * (0.08 + crng() * 0.84);
    const ppy = H * (0.035 + crng() * 0.1);
    if (crng() < 0.6) {
      prims.push({ t: 'circle', c: [ppx, ppy], r: pr * 1.75, fill: 'none', stroke: 'rgba(255,255,255,0.08)', sw: 1.2 });
    }
    prims.push({ t: 'circle', c: [ppx, ppy], r: pr, fill: hexAlpha(pcol, 0.62) });
    prims.push({ t: 'circle', c: [ppx + pr * 0.42, ppy + pr * 0.34], r: pr * 0.9, fill: 'rgba(8,10,20,0.28)' });
    prims.push({ t: 'circle', c: [ppx - pr * 0.34, ppy - pr * 0.38], r: pr * 0.42, fill: 'rgba(255,255,255,0.4)' });
    if (crng() < 0.7) {
      const hx = W * (0.2 + crng() * 0.6);
      const hy = H * (0.06 + crng() * 0.12);
      const len = 34 + crng() * 56;
      const ang = 2.35 + crng() * 0.5; // tail down-left
      prims.push({ t: 'line', a: [hx, hy], b: [hx + Math.cos(ang) * len, hy + Math.sin(ang) * len], stroke: 'rgba(214,230,255,0.4)', sw: 1.4, round: true });
      prims.push({ t: 'circle', c: [hx, hy], r: 1.8, fill: 'rgba(255,255,255,0.95)' });
    }
  }

  // --- 2b. The Cetus star-ocean: whales surfacing in the deep beyond the cliffs (GS-cetus) ----
  // Drawn BEFORE the landmass so the clifftop plateau overlaps their near edges (they read as the
  // sea below the cliffs). Gated to cetus + own `org` stream → no other world is touched.
  if (arch === 'cetus' && !rainbow) prims.push(...cetusOcean(landPlatformsCourse, cb, proj, W, H, art.accents, oceanRng));

  // --- 3. The floating landmass: an atmospheric rim feathering into the void ---
  // Rainbow Road: NO landmass at all (rim glow + fill) — the rainbow ribbon floats over open space, so
  // the starfield reads everywhere off the road (off-road IS out of bounds). An island-green par 3
  // draws a separate platform per play feature (tee + green island) so the deep shows between them.
  if (!rainbow) {
    for (const lp of landPlatforms) {
      const lc = centroidOf(lp);
      prims.push({ t: 'poly', pts: scalePoly(lp, lc, 1.05), fill: space.edge });
      prims.push({ t: 'poly', pts: scalePoly(lp, lc, 1.025), fill: space.edge });
      prims.push({ t: 'poly', pts: lp, fill: landFillFor(arch, deepen), stroke: space.edge, sw: 1.2 });
    }
  }

  // --- 3b. Cetus: extrude the plateau into dropdown CLIFF FACES (GS-cetus-3) ---
  // Drawn AFTER the land fill so the plateau caps each cliff (the lit lip sits crisp on the fill edge)
  // and the face draws over the ocean/whales below. Fills `cetusFaces` for the river's waterfall.
  if (arch === 'cetus' && !rainbow) {
    const cliffs = cetusCliffs(landPlatforms, deepen, cliffRng);
    prims.push(...cliffs.prims);
    cetusFaces = cliffs.faces;
  }

  // --- 4. Land detail (tone, tufts, flowers, ground sparkle) — clipped to land -
  // The main `rng` is consumed here in the SAME order as before (patches → tufts → flowers) so the
  // downstream terrain/tree/water/lava draws that read off it stay byte-for-byte unchanged; only the
  // PAINT position (clipped onto the island) moved. Ground sparkle uses the independent `crng`.
  const land: Prim[] = [];
  const rs = turfShade('rough', arch, deepen);
  const patches = Math.round(5 * art.texture);
  for (let i = 0; i < patches; i++) {
    const px = rng() * W;
    const py = rng() * H;
    const pr = (0.13 + rng() * 0.16) * Math.min(W, H);
    land.push({ t: 'circle', c: [px, py], r: pr, fill: rng() < 0.33 ? 'rgba(220,255,210,0.04)' : 'rgba(0,0,0,0.12)' });
  }
  const tuftTarget = Math.min(64, Math.round((span / 14) * art.texture));
  let placed = 0;
  for (let i = 0; i < tuftTarget * 3 && placed < tuftTarget; i++) {
    const cp = randCoursePt();
    if (onGrass(cp)) continue;
    const sp = proj.project(cp);
    if (!inView(sp, W, H)) continue;
    placed++;
    const len = 2 + rng() * 2.5;
    const dark = rng() < 0.55;
    land.push({ t: 'line', a: [sp[0], sp[1]], b: [sp[0] + (rng() - 0.5) * 2, sp[1] - len], stroke: dark ? rs.dark : rs.light, sw: 1, round: true });
  }
  const ac = accentFor(biome);
  const flowerTarget = Math.round(5 * art.accents);
  let flowers = 0;
  for (let i = 0; i < flowerTarget * 4 && flowers < flowerTarget; i++) {
    const cp = randCoursePt();
    if (onGrass(cp)) continue;
    const sp = proj.project(cp);
    if (!inView(sp, W, H)) continue;
    flowers++;
    const col = ac.flowers[Math.floor(rng() * ac.flowers.length)]!;
    const dots = 3 + Math.floor(rng() * 2);
    for (let d = 0; d < dots; d++) {
      land.push({ t: 'circle', c: [sp[0] + (rng() - 0.5) * 6, sp[1] + (rng() - 0.5) * 6], r: 0.9 + rng() * 0.8, fill: col });
    }
  }
  // Faint stars salt the dark land too (crng — does NOT perturb the terrain rng), so even the
  // zoomed-in "on the ground" view reads as golf amongst the stars.
  if (art.accents > 0) {
    const groundStars = Math.round(34 * art.accents);
    for (let i = 0; i < groundStars; i++) {
      const cp: Vec = [cb.minX + (cb.maxX - cb.minX) * crng(), cb.minY + (cb.maxY - cb.minY) * crng()];
      if (onGrass(cp)) continue;
      const sp = proj.project(cp);
      if (!inView(sp, W, H)) continue;
      const r = 0.5 + crng() * 1.1;
      land.push({ t: 'circle', c: sp, r, fill: crng() < 0.5 ? 'rgba(235,242,255,0.75)' : 'rgba(190,214,255,0.62)' });
    }
  }
  // Rainbow Road drops the rough/tufts/flowers (off-road is empty space); an island-green par 3 also
  // drops them (the platforms are tiny and turf-covered, the rest is open ocean). The rng was still
  // consumed above, so the art stream is byte-stable whether or not the detail is painted.
  if (!rainbow && !islandHole) prims.push({ t: 'clip', clip: islandPts, children: land });

  // --- 4c. Archetype SIGNATURE decor (GS-biome-feel) ---------------------------
  // The Cetus treatment generalised: void asteroid fields + a black-hole eye, inferno ground
  // fissures, fungal spore-mist + toadstools, crystal shard clusters, frost drifts + ice cracks,
  // desert dune ripples, tempest cloud shadows + storm eye, ocean surf + lagoon cays. Own dedicated
  // stream (`brng`) + gated per archetype, drawn UNDER the terrain features (section 5 paints the
  // mown turf over it) — so every other world, and every other stream, is byte-for-byte untouched.
  if (!rainbow && art.accents > 0) {
    const brng = mulberry32((hashHole(hole) ^ 0x00b10a3e) >>> 0);
    prims.push(...archetypeDecor(arch, islandPts, landPlatformsCourse, cb, proj, W, H, art.accents, onGrass, brng));
  }

  // --- 5. Terrain features (fairway/green/tee + scatter surfaces) --------------
  const collar = collarFor(arch, deepen);
  // "First-cut" fringe tones — each surface blended halfway toward this world's rough — so the cut
  // grass eases into the surrounding land instead of meeting it on a hard cut-out edge.
  const fwFringe = mixHex(fwShade.base, rs.base, 0.5);
  const grFringe = mixHex(collar, rs.base, 0.5);
  const teeFringe = mixHex(teeShade.base, rs.base, 0.45);
  // Void islands: a soft outset glow under the cut grass so the platforms read as luminous land
  // floating in the abyss (the off-fairway IS the void — there's nowhere else to be).
  const voidGlow = arch === 'void';
  const glowRings = (sp: Vec[]) => {
    const gc = centroidOf(sp);
    prims.push({ t: 'poly', pts: scalePoly(sp, gc, 1.34), fill: 'rgba(120,130,240,0.10)' });
    prims.push({ t: 'poly', pts: scalePoly(sp, gc, 1.16), fill: 'rgba(120,130,240,0.14)' });
  };
  // Fairways draw as ONE grouped pass FIRST (under tee/green/scatter) so the green apron blends into
  // the main corridor — see `styleFairways`. Everything else keeps its original per-feature order.
  const fairwaySps = hole.features.filter((f) => f.kind === 'fairway').map((f) => projPoly(f.poly, proj));
  if (voidGlow && !rainbow) for (const sp of fairwaySps) glowRings(sp);
  if (rainbow) {
    // Rainbow Road: paint every fairway piece as a rainbow ribbon, all riding ONE continuous band grid
    // (the main corridor's bbox) so the apron's bands line up with the corridor — one seamless road.
    if (fairwaySps[0]) {
      const fb = bboxOf(fairwaySps[0]);
      const bandH = Math.max(6, (fb.maxY - fb.minY) / 9);
      for (const sp of fairwaySps) prims.push(...rainbowRibbon(sp, fb.minY, bandH));
    }
  } else {
    prims.push(...styleFairways(fairwaySps, art, fwShade, fwFringe, arch));
  }
  for (const f of hole.features) {
    if (f.kind === 'fairway') continue; // drawn in the grouped pass above
    const sp = projPoly(f.poly, proj);
    if (rainbow) {
      // The green & tee are part of the rainbow ribbon; scatter surfaces (ice/crystal/waste) are off
      // the road → bare void, so they're dropped (they read as OOB, matching the sim's lie rule).
      if (f.kind === 'green') {
        const gb = bboxOf(sp);
        prims.push(...rainbowRibbon(sp, gb.minY, Math.max(5, (gb.maxY - gb.minY) / 6)));
      } else if (f.kind === 'tee') {
        const tb = bboxOf(sp);
        prims.push(...rainbowRibbon(sp, tb.minY, Math.max(4, (tb.maxY - tb.minY) / 4)));
      }
      continue;
    }
    if (voidGlow && f.kind === 'green') glowRings(sp);
    if (f.kind === 'green') prims.push(...styleGreen(sp, art, grShade, collar, grFringe, greenSlopeScreen(hole, proj)));
    else if (f.kind === 'tee') prims.push(...styleTee(sp, art, teeShade, teeFringe));
    else prims.push(...styleScatter(f.kind, sp, art, arch));
  }

  // --- 5b. The Cetus river of stars + its cliff waterfall (GS-cetus) ----------
  // The luminous star-river threads the rough beside the fairway and pours off the cliff into the
  // ocean. Gated to cetus + own `org` stream, drawn over the land but under the hazards/flag.
  if (arch === 'cetus' && !rainbow) prims.push(...cetusRiver(hole, proj, art.accents, riverRng, cetusFaces));

  // --- 6. Hazards (drawn on top, per the layer rule) --------------------------
  // Draw order is layered so substances read correctly where they overlap (deep/wild holes pile
  // hazards up): SAND first as a grouped family (overlapping bunkers/craters/waste merge into one
  // excavated body — no internal seams), then exotic scatter, then the penalty LIQUIDS as grouped
  // families ON TOP (so a river cutting through a sandy waste band reads as WATER, not buried under
  // sand — the "sand showed on rivers" bug), and finally trees (canopies over everything).
  const waterPolys: Vec[][] = [];
  const lavaPolys: Vec[][] = [];
  const sandPolys: Vec[][] = [];
  const treeHaz: Feature[] = [];
  const fescueHaz: Feature[] = [];
  const ravineHaz: Feature[] = [];
  const scatterHaz: Feature[] = [];
  for (const f of hole.hazards) {
    if (WATER_KINDS.has(f.kind)) waterPolys.push(projPoly(f.poly, proj));
    else if (LAVA_KINDS.has(f.kind)) lavaPolys.push(projPoly(f.poly, proj));
    else if (f.kind === 'bunker' || f.kind === 'waste' || f.kind === 'sand' || f.kind === 'pot') sandPolys.push(projPoly(f.poly, proj));
    else if (f.kind === 'trees') treeHaz.push(f);
    else if (f.kind === 'fescue') fescueHaz.push(f);
    else if (f.kind === 'barranca') ravineHaz.push(f);
    else scatterHaz.push(f);
  }
  // Rainbow Road: SAND is on the road (in-play, see `ROAD_LIES`) so bunkers/craters still draw; every
  // OTHER hazard (rough fescue, ravines, exotic scatter, water/lava, trees) is OFF the road → the bare
  // void, so it's dropped (it reads as the OOB space it now is, matching the sim's lie rule).
  if (!rainbow) {
    for (const f of fescueHaz) prims.push(...styleFescue(projPoly(f.poly, proj), rng));
    for (const f of ravineHaz) prims.push(...styleRavine(projPoly(f.poly, proj), rng));
  }
  prims.push(...styleSandFamily(sandPolys, art, proj.scale));
  if (!rainbow) {
    for (const f of scatterHaz) prims.push(...styleScatter(f.kind, projPoly(f.poly, proj), art, arch));
    // Liquids ON TOP of sand so water/lava is never occluded by an overlapping sand body.
    prims.push(...styleLiquidFamily(waterPolys, WATER_LIQ, rng));
    prims.push(...styleLiquidFamily(lavaPolys, LAVA_LIQ, rng));
    for (const f of treeHaz) prims.push(...styleFlora(f.poly, proj, rng, arch));
  }

  // --- 6b. Trade-camp tents (GS-tents) ----------------------------------------
  // The trade-market route's signature: a ring of bright, collidable tents around the green. Drawn in
  // COURSE space (projected) so they sit on the ground and track the follow-cam — the fix for the old
  // screen-space caravan that floated in mid-air over the controls / the flight. Pure (no rng); off the
  // road under Rainbow Road (they'd be in the OOB void).
  if (opts.tradeTents && !rainbow) prims.push(...styleTents(tradeTentsFor(hole), proj));

  // --- 7. Sparkle motes (a little life over the whole hole) -------------------
  const motes = Math.round(4 * art.accents);
  for (let i = 0; i < motes; i++) {
    const sx = rng() * W;
    const sy = rng() * H * 0.7;
    const r = 0.8 + rng() * 1.2;
    prims.push({ t: 'line', a: [sx - r, sy], b: [sx + r, sy], stroke: ac.mote, sw: 0.8, round: true });
    prims.push({ t: 'line', a: [sx, sy - r], b: [sx, sy + r], stroke: ac.mote, sw: 0.8, round: true });
  }
  // The odd bird, up toward the horizon.
  const birds = rng() < 0.6 * art.accents ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < birds; i++) {
    const bx = W * (0.25 + rng() * 0.5);
    const by = H * (0.08 + rng() * 0.14);
    prims.push({ t: 'line', a: [bx - 4, by + 2], b: [bx, by], stroke: 'rgba(20,24,30,0.55)', sw: 1.2, round: true });
    prims.push({ t: 'line', a: [bx, by], b: [bx + 4, by + 2], stroke: 'rgba(20,24,30,0.55)', sw: 1.2, round: true });
  }

  // --- 7b. Wind streaks blowing across the hole (GS-wind), themed + off `crng` ---
  if (art.accents > 0) prims.push(...windStreaks(hole, proj, arch, W, H, crng));

  // --- 8. The stop's CONSTELLATION, hung over the hole as its sky (GS-17e) -----
  // The stop's theme isn't just physics + flavour — its actual constellation hangs overhead,
  // rarity-tinted, so a Scorpius stop LOOKS like Scorpius. Drawn AFTER the terrain (on top, as the
  // sky) so it stays visible in the zoomed-in play view as well as the whole-hole map. Uses NO rng/
  // crng, and is gated by themeId + a real figure, so a deep-sky/themeless render is byte-identical
  // to before (the constellation-backdrop test relies on that count invariant).
  if (themeId && art.accents > 0) prims.push(...constellationBackdrop(themeId, W, H));

  // NB: the journey route's atmospheric WEATHER (moonlight / meteors / aurora / storm / debris / trade
  // camp) is NO LONGER baked into the static scene — it's drawn by the shared, animated, SCREEN-SPACE
  // `weather.ts` layer (the play view in flight, an overlay while aiming/putting), so it's alive on
  // every screen and never jumps as a false ground-anchored layer (GS-journey-fx rework).

  // --- 9. Out-of-bounds boundary + stakes (per-world look, GS-biome-feel) ------
  // The same white/red golf stake used to ring EVERY world — a picket fence floating in the void.
  // Each archetype now marks its boundary in its own vocabulary (`OB_LOOK`); the two lost-rough
  // worlds trade the ground post for a FLOATING warp beacon (there's no ground out there to plant
  // a stake in). Render-only — the OB rule (play-bounds box) is byte-identical.
  const obl = OB_LOOK[arch] ?? OB;
  const corners = projPoly(playBoundsCorners(hole), proj);
  prims.push({ t: 'poly', pts: corners, fill: 'none', stroke: obl.line, sw: 1.5, dash: [2, 7] });
  for (const s of obStakes(hole)) {
    const [x, y] = proj.project(s);
    const beacon = (obl as ObLook).beacon;
    if (beacon) {
      // A warp beacon adrift on the boundary: soft glow + a lit diamond, bobbed by a position hash.
      const by = y - 4 - posHash(x, y) * 3;
      prims.push({ t: 'glow', c: [x, by], r: 7, col: beacon });
      prims.push({ t: 'poly', pts: [[x, by - 3.2], [x + 2.3, by], [x, by + 3.2], [x - 2.3, by]], fill: obl.cap, stroke: obl.post, sw: 0.8 });
      prims.push({ t: 'circle', c: [x, by], r: 0.9, fill: '#ffffff' });
      continue;
    }
    prims.push({ t: 'line', a: [x, y], b: [x, y - 7], stroke: obl.post, sw: 2, round: true });
    if ((obl as ObLook).glow) prims.push({ t: 'glow', c: [x, y - 7], r: 5.5, col: (obl as ObLook).glow! });
    prims.push({ t: 'circle', c: [x, y - 7], r: 1.7, fill: obl.cap });
  }

  // --- 10. Centreline ---------------------------------------------------------
  const cl = projPoly(hole.centreline, proj);
  for (let i = 1; i < cl.length; i++) {
    prims.push({ t: 'line', a: cl[i - 1]!, b: cl[i]!, stroke: 'rgba(255,255,255,0.38)', sw: 1.5, dash: [5, 5] });
  }

  // --- 11. Tee marker + flagstick ---------------------------------------------
  const [tx, ty] = proj.project(hole.tee);
  prims.push({ t: 'circle', c: [tx, ty], r: 5, fill: '#ffffff', stroke: '#000', sw: 1 });
  const [gx, gy] = proj.project(hole.pin ?? hole.green);
  prims.push({ t: 'circle', c: [gx, gy + 1], r: 2.2, fill: 'rgba(0,0,0,0.25)' }); // base shadow
  prims.push({ t: 'line', a: [gx, gy], b: [gx, gy - 14], stroke: '#1a1a1a', sw: 1.4, round: true });
  prims.push({ t: 'poly', pts: [[gx, gy - 14], [gx + 9, gy - 11], [gx, gy - 8]], fill: '#ff3b3b', stroke: '#7a1414', sw: 0.8 });

  void polylineDist; // (kept available for future corridor-aware accents)
  return prims;
}

/** Pure geometry helpers exposed for unit tests (not part of the public render API). */
export const __test__ = { offsetPoly };

// ---------------------------------------------------------------------------
// Interpreters
// ---------------------------------------------------------------------------

function ptsStr(pts: Vec[]): string {
  return pts.map((p) => `${n1(p[0])},${n1(p[1])}`).join(' ');
}

/** Render a prim list to an SVG fragment string (pure). Clip ids are a deterministic counter. */
export function scenePrimsToSvg(prims: Prim[]): string {
  let clipId = 0;
  let glowId = 0;
  const one = (p: Prim): string => {
    switch (p.t) {
      case 'glow': {
        const id = `gsg${glowId++}`;
        const { rgb, a } = rgbaParts(p.col);
        return (
          `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n1(p.c[0])}" cy="${n1(p.c[1])}" r="${n1(Math.max(0.01, p.r))}">` +
          `<stop offset="0" stop-color="${rgb}" stop-opacity="${a.toFixed(3)}"/>` +
          `<stop offset="1" stop-color="${rgb}" stop-opacity="0"/></radialGradient>` +
          `<circle cx="${n1(p.c[0])}" cy="${n1(p.c[1])}" r="${n1(Math.max(0, p.r))}" fill="url(#${id})" />`
        );
      }
      case 'poly': {
        const stroke = p.stroke
          ? ` stroke="${p.stroke}" stroke-width="${p.sw ?? 1}"${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}`
          : '';
        return `<polygon points="${ptsStr(p.pts)}" fill="${p.fill ?? 'none'}"${stroke} />`;
      }
      case 'circle': {
        const stroke = p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.sw ?? 1}"` : '';
        return `<circle cx="${n1(p.c[0])}" cy="${n1(p.c[1])}" r="${n1(p.r)}" fill="${p.fill ?? 'none'}"${stroke} />`;
      }
      case 'line': {
        const dash = p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : '';
        const cap = p.round ? ' stroke-linecap="round"' : '';
        return `<line x1="${n1(p.a[0])}" y1="${n1(p.a[1])}" x2="${n1(p.b[0])}" y2="${n1(p.b[1])}" stroke="${p.stroke}" stroke-width="${p.sw}"${cap}${dash} />`;
      }
      case 'clip': {
        const id = `gsc${clipId++}`;
        return (
          `<clipPath id="${id}"><polygon points="${ptsStr(p.clip)}" /></clipPath>` +
          `<g clip-path="url(#${id})">${p.children.map(one).join('')}</g>`
        );
      }
    }
  };
  return prims.map(one).join('');
}

/** Draw a prim list onto a Canvas2D context (imperative). */
export function drawScenePrims(ctx: CanvasRenderingContext2D, prims: Prim[]): void {
  const path = (pts: Vec[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  };
  const one = (p: Prim): void => {
    switch (p.t) {
      case 'glow': {
        const r = Math.max(0.01, p.r);
        const g = ctx.createRadialGradient(p.c[0], p.c[1], 0, p.c[0], p.c[1], r);
        g.addColorStop(0, p.col);
        g.addColorStop(1, fadeCol(p.col));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.c[0], p.c[1], r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'poly': {
        path(p.pts);
        ctx.closePath();
        if (p.fill && p.fill !== 'none') {
          ctx.fillStyle = p.fill;
          ctx.fill();
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.sw ?? 1;
          ctx.setLineDash(p.dash ?? []);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        break;
      }
      case 'circle': {
        ctx.beginPath();
        ctx.arc(p.c[0], p.c[1], Math.max(0, p.r), 0, Math.PI * 2);
        if (p.fill && p.fill !== 'none') {
          ctx.fillStyle = p.fill;
          ctx.fill();
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.sw ?? 1;
          ctx.stroke();
        }
        break;
      }
      case 'line': {
        ctx.beginPath();
        ctx.moveTo(p.a[0], p.a[1]);
        ctx.lineTo(p.b[0], p.b[1]);
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.lineCap = p.round ? 'round' : 'butt';
        ctx.setLineDash(p.dash ?? []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        break;
      }
      case 'clip': {
        ctx.save();
        path(p.clip);
        ctx.closePath();
        ctx.clip();
        p.children.forEach(one);
        ctx.restore();
        break;
      }
    }
  };
  prims.forEach(one);
}
