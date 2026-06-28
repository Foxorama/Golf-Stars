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

import type { Hole, Vec } from '../sim/course/contract';
import { dist, pointInPoly, polylineDist } from '../sim/course/contract';
import { obStakes, playBoundsCorners } from '../sim/round';
import { themeById, archetypeFor, RARITY_INTENSITY, type BiomeArchetype } from '../sim/course/themes';
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
} from './palette';

// ---------------------------------------------------------------------------
// Drawing primitives (screen-space). Both interpreters understand this set.
// ---------------------------------------------------------------------------

export type Prim =
  | { t: 'poly'; pts: Vec[]; fill?: string; stroke?: string; sw?: number; dash?: number[] }
  | { t: 'circle'; c: Vec; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'line'; a: Vec; b: Vec; stroke: string; sw: number; round?: boolean; dash?: number[] }
  /** Draw `children` clipped to the `clip` polygon (used for mowing stripes). */
  | { t: 'clip'; clip: Vec[]; children: Prim[] };

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
function stripes(poly: Vec[], colA: string, colB: string, bands: number): Prim {
  const b = bboxOf(poly);
  const children: Prim[] = [];
  const h = (b.maxY - b.minY) / bands;
  for (let i = 0; i < bands; i++) {
    const y0 = b.minY + i * h;
    const y1 = y0 + h + 0.5; // overlap a hair so no seam shows
    children.push({
      t: 'poly',
      pts: [
        [b.minX, y0],
        [b.maxX, y0],
        [b.maxX, y1],
        [b.minX, y1],
      ],
      fill: i % 2 === 0 ? colA : colB,
    });
  }
  return { t: 'clip', clip: poly, children };
}

function styleFairway(poly: Vec[], art: ArtFeel, s: Shade, fringe: string): Prim[] {
  const out: Prim[] = [
    // A soft "first-cut" fringe (a tone blended fairway↔rough) outset around the edge, so the cut
    // grass eases into the rough instead of meeting the dark land on a hard sticker outline.
    { t: 'poly', pts: offsetPoly(poly, -3), fill: fringe },
    { t: 'poly', pts: poly, fill: s.base },
  ];
  if (art.stripes) out.push(stripes(poly, s.light, s.dark, 7));
  // A mowing edge, not a bold black outline — a soft, translucent ink so the surface reads as part
  // of the terrain rather than a cut-out pasted on top.
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, 0.5), sw: 1 });
  return out;
}

function styleGreen(poly: Vec[], art: ArtFeel, s: Shade, collar: string, fringe: string): Prim[] {
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
  // A soft lit highlight toward the top-left, then a softened ink edge.
  const gb = bboxOf(poly);
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

function styleBunker(poly: Vec[], art: ArtFeel, scale: number): Prim[] {
  const c = centroidOf(poly);
  const out: Prim[] = [
    // Lip-shadow rim (a uniform outset, darker) under the sand → the bunker reads as a depression
    // that hugs its real outline, so a big round crater and a small pot bunker both look excavated.
    { t: 'poly', pts: offsetPoly(poly, -2.6), fill: SAND.shadow },
    { t: 'poly', pts: poly, fill: SAND.base },
    // Inner depression crescent: an inset poly nudged down so the far lip catches shadow.
    {
      t: 'poly',
      pts: offsetPoly(poly, 2.4).map((p) => [p[0], p[1] - 1.5] as Vec),
      fill: SAND.rim,
    },
  ];
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
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: SAND.ink, sw: 1.3 });
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

/** A scatter surface (ice/crystal/waste/lava/void…): base fill + a lit inset band + ink. */
function styleScatter(kind: string, poly: Vec[], art: ArtFeel): Prim[] {
  const c = centroidOf(poly);
  const base = fillFor(kind);
  const out: Prim[] = [
    { t: 'poly', pts: poly, fill: base },
    { t: 'poly', pts: scalePoly(poly, c, 0.6).map((p) => [p[0] - 1, p[1] - 1] as Vec), fill: 'rgba(255,255,255,0.16)' },
  ];
  if (kind === 'crystal' || kind === 'ice') {
    // Faceting: a couple of bright cleavage lines.
    const b = bboxOf(poly);
    out.push({
      t: 'clip',
      clip: poly,
      children: [
        { t: 'line', a: [b.minX, c[1]], b: [c[0], b.minY], stroke: 'rgba(255,255,255,0.4)', sw: 1, round: true },
        { t: 'line', a: [c[0], b.minY], b: [b.maxX, c[1]], stroke: 'rgba(255,255,255,0.25)', sw: 1, round: true },
      ],
    });
  }
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(0,0,0,0.35)', sw: 1.2 });
  return out;
}

/** One tree drawn as a 3-tone cell-shaded canopy with a cast shadow, trunk + ink outline. */
function styleTree(poly: Vec[], proj: Projector, rng: () => number): Prim[] {
  const cc = centroidOf(poly);
  let rad = 0;
  for (const p of poly) rad += dist(p, cc);
  rad /= poly.length;
  const [x, y] = proj.project(cc);
  const rr = Math.max(3, rad * proj.scale * (0.9 + rng() * 0.5));
  // Slight per-tree hue variance so a treeline isn't a row of clones.
  const tint = rng();
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

// ---------------------------------------------------------------------------
// Scene assembly
// ---------------------------------------------------------------------------

/** Project a whole polygon to screen space. */
function projPoly(poly: Vec[], proj: Projector): Vec[] {
  return poly.map((p) => proj.project(p));
}

/** Is a screen point within the (padded) view? Used to cull off-screen accents/tufts. */
function inView(p: Vec, w: number, h: number, m = 24): boolean {
  return p[0] >= -m && p[0] <= w + m && p[1] >= -m && p[1] <= h + m;
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
function worldLook(themeId: string | undefined, biome: string | undefined): { arch: BiomeArchetype; deepen: number } {
  const arch = archetypeFor(themeId, biome ?? '');
  const deepen = themeId ? RARITY_INTENSITY[themeById(themeId)?.rarity ?? 'common'] : 1;
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
  const count = Math.round(8 + intensity * 34);
  const colBase = WIND_COL[arch];
  const prims: Prim[] = [];
  for (let i = 0; i < count; i++) {
    const x = crng() * W;
    const y = crng() * H;
    const len = (6 + intensity * 20) * (0.6 + crng() * 0.8);
    const a = (0.06 + intensity * 0.16) * (0.6 + crng() * 0.4);
    prims.push({
      t: 'line',
      a: [x, y],
      b: [x - dx * len, y - dy * len],
      stroke: colBase + a.toFixed(3) + ')',
      sw: 1,
      round: true,
    });
  }
  return prims;
}

/** `#rrggbb` + alpha → an `rgba()` string (render-only helper). */
function hexAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function buildScene(hole: Hole, proj: Projector, opts: SceneOpts): Prim[] {
  const { width: W, height: H, biome, themeId } = opts;
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
  const islandC = centroidOf(islandPts);
  const space = spaceLookFor(arch, deepen);
  // A SEPARATE rng stream for celestial scatter (so the terrain/tree/water/lava placement that
  // reads off the main `rng` stays byte-identical) keyed off the same hole hash.
  const crng = mulberry32((hashHole(hole) ^ 0x5747a2) >>> 0);

  // --- 1. Deep space: an opaque world-tinted base + soft nebula smears ---------
  prims.push({ t: 'poly', pts: [[0, 0], [W, 0], [W, H], [0, H]], fill: space.base });
  for (let i = 0; i < 2; i++) {
    prims.push({
      t: 'circle',
      c: [W * (0.12 + crng() * 0.72), H * (0.06 + crng() * 0.42)],
      r: (0.28 + crng() * 0.26) * Math.max(W, H),
      fill: space.nebula,
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
        // A brighter star: a soft halo + a 4-point twinkle.
        prims.push({ t: 'circle', c: [sx, sy], r: r * 2.6, fill: 'rgba(255,255,255,0.10)' });
        const s = r + 1.8;
        prims.push({ t: 'line', a: [sx - s, sy], b: [sx + s, sy], stroke: col, sw: 0.7, round: true });
        prims.push({ t: 'line', a: [sx, sy - s], b: [sx, sy + s], stroke: col, sw: 0.7, round: true });
      }
    }
    // A far planet (ring + shaded disc + lit highlight) and a faint comet up in the sky.
    const planetCols = ['#caa3ff', '#7be0d0', '#ffb27a', '#9bc2ff', '#ff9bbf'];
    const pcol = planetCols[(crng() * planetCols.length) | 0]!;
    const pr = 10 + crng() * 14;
    const ppx = W * (0.1 + crng() * 0.8);
    const ppy = H * (0.05 + crng() * 0.16);
    if (crng() < 0.6) {
      prims.push({ t: 'circle', c: [ppx, ppy], r: pr * 1.75, fill: 'none', stroke: 'rgba(255,255,255,0.10)', sw: 1.4 });
    }
    prims.push({ t: 'circle', c: [ppx, ppy], r: pr, fill: pcol });
    prims.push({ t: 'circle', c: [ppx + pr * 0.42, ppy + pr * 0.34], r: pr * 0.9, fill: 'rgba(8,10,20,0.34)' });
    prims.push({ t: 'circle', c: [ppx - pr * 0.34, ppy - pr * 0.38], r: pr * 0.42, fill: 'rgba(255,255,255,0.5)' });
    if (crng() < 0.7) {
      const hx = W * (0.2 + crng() * 0.6);
      const hy = H * (0.06 + crng() * 0.12);
      const len = 34 + crng() * 56;
      const ang = 2.35 + crng() * 0.5; // tail down-left
      prims.push({ t: 'line', a: [hx, hy], b: [hx + Math.cos(ang) * len, hy + Math.sin(ang) * len], stroke: 'rgba(214,230,255,0.4)', sw: 1.4, round: true });
      prims.push({ t: 'circle', c: [hx, hy], r: 1.8, fill: 'rgba(255,255,255,0.95)' });
    }
  }

  // --- 3. The floating landmass: an atmospheric rim feathering into the void ---
  prims.push({ t: 'poly', pts: scalePoly(islandPts, islandC, 1.05), fill: space.edge });
  prims.push({ t: 'poly', pts: scalePoly(islandPts, islandC, 1.025), fill: space.edge });
  prims.push({ t: 'poly', pts: islandPts, fill: landFillFor(arch, deepen), stroke: space.edge, sw: 1.2 });

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
  prims.push({ t: 'clip', clip: islandPts, children: land });

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
  for (const f of hole.features) {
    const sp = projPoly(f.poly, proj);
    if (voidGlow && (f.kind === 'fairway' || f.kind === 'green')) {
      const gc = centroidOf(sp);
      prims.push({ t: 'poly', pts: scalePoly(sp, gc, 1.34), fill: 'rgba(120,130,240,0.10)' });
      prims.push({ t: 'poly', pts: scalePoly(sp, gc, 1.16), fill: 'rgba(120,130,240,0.14)' });
    }
    if (f.kind === 'fairway') prims.push(...styleFairway(sp, art, fwShade, fwFringe));
    else if (f.kind === 'green') prims.push(...styleGreen(sp, art, grShade, collar, grFringe));
    else if (f.kind === 'tee') prims.push(...styleTee(sp, art, teeShade, teeFringe));
    else prims.push(...styleScatter(f.kind, sp, art));
  }

  // --- 6. Hazards (drawn on top, per the layer rule) --------------------------
  // Penalty LIQUIDS are drawn as GROUPED families first (all the water, then all the lava) in shared
  // layered passes, so a lake and a river that touch read as one connected body, not two stickers
  // with a seam (GS-blend). Everything else (trees, sand/craters, exotic scatter) draws per-hazard
  // on top of the liquids.
  const waterPolys: Vec[][] = [];
  const lavaPolys: Vec[][] = [];
  for (const f of hole.hazards) {
    if (WATER_KINDS.has(f.kind)) waterPolys.push(projPoly(f.poly, proj));
    else if (LAVA_KINDS.has(f.kind)) lavaPolys.push(projPoly(f.poly, proj));
  }
  prims.push(...styleLiquidFamily(waterPolys, WATER_LIQ, rng));
  prims.push(...styleLiquidFamily(lavaPolys, LAVA_LIQ, rng));
  for (const f of hole.hazards) {
    if (f.kind === 'trees') {
      prims.push(...styleTree(f.poly, proj, rng));
      continue;
    }
    if (WATER_KINDS.has(f.kind) || LAVA_KINDS.has(f.kind)) continue; // drawn in the grouped passes
    const sp = projPoly(f.poly, proj);
    if (f.kind === 'bunker' || f.kind === 'waste' || f.kind === 'sand') {
      prims.push(...styleBunker(sp, art, proj.scale));
    } else {
      prims.push(...styleScatter(f.kind, sp, art));
    }
  }

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

  // --- 9. Out-of-bounds boundary + stakes -------------------------------------
  const corners = projPoly(playBoundsCorners(hole), proj);
  prims.push({ t: 'poly', pts: corners, fill: 'none', stroke: OB.line, sw: 1.5, dash: [2, 7] });
  for (const s of obStakes(hole)) {
    const [x, y] = proj.project(s);
    prims.push({ t: 'line', a: [x, y], b: [x, y - 7], stroke: OB.post, sw: 2, round: true });
    prims.push({ t: 'circle', c: [x, y - 7], r: 1.7, fill: OB.cap });
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
  const one = (p: Prim): string => {
    switch (p.t) {
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
