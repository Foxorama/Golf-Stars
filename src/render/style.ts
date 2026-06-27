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
import { themeById } from '../sim/course/themes';
import { rarCol } from '../sim/rpg/loot';
import { constellationFigure } from './constellations';
import type { Projector } from './project';
import {
  roughFor,
  shadeFor,
  accentFor,
  fillFor,
  GREEN_COLLAR,
  SAND,
  WATER,
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

function styleFairway(poly: Vec[], art: ArtFeel): Prim[] {
  const s = shadeFor('fairway');
  const out: Prim[] = [{ t: 'poly', pts: poly, fill: s.base }];
  if (art.stripes) out.push(stripes(poly, s.light, s.dark, 7));
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: s.ink, sw: 1.6 });
  return out;
}

function styleGreen(poly: Vec[], art: ArtFeel): Prim[] {
  const s = shadeFor('green');
  const c = centroidOf(poly);
  const out: Prim[] = [
    // Collar/apron: a darker outset ring so the green sits ON the land, with depth.
    { t: 'poly', pts: scalePoly(poly, c, 1.18), fill: GREEN_COLLAR, stroke: s.ink, sw: 1.4 },
    { t: 'poly', pts: poly, fill: s.base },
  ];
  if (art.stripes) out.push(stripes(poly, s.light, s.dark, 6));
  // A soft lit highlight toward the top-left, then the bold ink outline.
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
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: s.ink, sw: 1.6 });
  return out;
}

function styleTee(poly: Vec[], art: ArtFeel): Prim[] {
  const s = shadeFor('tee');
  const out: Prim[] = [{ t: 'poly', pts: poly, fill: s.base }];
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: s.ink, sw: 1.3 });
  return out;
}

function styleBunker(poly: Vec[], art: ArtFeel, scale: number): Prim[] {
  const c = centroidOf(poly);
  const out: Prim[] = [
    // Lip-shadow rim (outset, darker) under the sand → the bunker reads as a depression.
    { t: 'poly', pts: scalePoly(poly, c, 1.14), fill: SAND.shadow },
    { t: 'poly', pts: poly, fill: SAND.base },
    // Inner depression crescent: an inset poly nudged down so the far lip catches shadow.
    {
      t: 'poly',
      pts: scalePoly(poly, c, 0.74).map((p) => [p[0], p[1] - 1.5] as Vec),
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

function styleWater(poly: Vec[], rng: () => number, art: ArtFeel): Prim[] {
  const c = centroidOf(poly);
  const out: Prim[] = [
    // Shoreline → body → deep core: three inset depth bands (cell-shaded depth).
    { t: 'poly', pts: scalePoly(poly, c, 1.06), fill: WATER.shallow },
    { t: 'poly', pts: poly, fill: WATER.base },
    { t: 'poly', pts: scalePoly(poly, c, 0.62), fill: WATER.deep },
    { t: 'poly', pts: scalePoly(poly, c, 0.32), fill: WATER.deepest },
  ];
  // Sparkle glints near the top edge.
  const b = bboxOf(poly);
  const glints = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < glints; i++) {
    const gx = b.minX + (b.maxX - b.minX) * (0.2 + 0.6 * rng());
    const gy = b.minY + (b.maxY - b.minY) * (0.15 + 0.3 * rng());
    const r = 1 + rng() * 1.4;
    out.push({ t: 'line', a: [gx - r, gy], b: [gx + r, gy], stroke: WATER.glint, sw: 1, round: true });
    out.push({ t: 'line', a: [gx, gy - r], b: [gx, gy + r], stroke: WATER.glint, sw: 1, round: true });
  }
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: WATER.ink, sw: 1.6 });
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
 * The stop's constellation, laid out in the upper sky (screen-space) and rarity-tinted (GS-17e).
 * Pure & deterministic — figure geometry comes from the catalogue table, positions are fixed (no
 * rng), so it's byte-stable. Deep-sky/galaxy themes have no stick figure → nothing drawn (the
 * ambient starfield carries them). The figure stars sit ON TOP of any ambient stars.
 */
function constellationBackdrop(themeId: string, W: number, H: number): Prim[] {
  const fig = constellationFigure(themeId);
  if (!fig) return [];
  const tint = rarCol(themeById(themeId)?.rarity ?? 'common');
  // Fit the unit-box figure into a sky panel up top, preserving aspect.
  const boxW = W * 0.46;
  const boxH = H * 0.2;
  const ox = W * 0.5 - boxW / 2;
  const oy = H * 0.06;
  const at = (s: { x: number; y: number }): Vec => [ox + s.x * boxW, oy + s.y * boxH];

  const prims: Prim[] = [];
  // Faint connecting lines first (the stick figure).
  for (const [a, b] of fig.lines) {
    const sa = fig.stars[a];
    const sb = fig.stars[b];
    if (!sa || !sb) continue;
    prims.push({ t: 'line', a: at(sa), b: at(sb), stroke: hexAlpha(tint, 0.35), sw: 0.8, round: true });
  }
  // Then the stars: brighter (lower mag) = bigger, with a soft halo + a tint dot.
  for (const s of fig.stars) {
    const p = at(s);
    const r = Math.max(1, 3.1 - s.m * 0.45);
    prims.push({ t: 'circle', c: p, r: r * 2.2, fill: hexAlpha(tint, 0.16) }); // halo
    prims.push({ t: 'circle', c: p, r, fill: 'rgba(255,255,255,0.95)' });
    prims.push({ t: 'circle', c: p, r: Math.max(0.6, r * 0.55), fill: hexAlpha(tint, 0.85) });
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

  // --- 1. Rough background + soft tone variance --------------------------------
  prims.push({ t: 'poly', pts: [[0, 0], [W, 0], [W, H], [0, H]], fill: roughFor(biome) });
  const rs = shadeFor('rough');
  // A few large, soft tonal patches so the rough isn't a flat slab — gentle undulation, not
  // spotlights, so they stay low-alpha and lean dark (lit terrain is the exception).
  const patches = Math.round(5 * art.texture);
  for (let i = 0; i < patches; i++) {
    const px = rng() * W;
    const py = rng() * H;
    const pr = (0.13 + rng() * 0.16) * Math.min(W, H);
    prims.push({ t: 'circle', c: [px, py], r: pr, fill: rng() < 0.33 ? 'rgba(220,255,210,0.035)' : 'rgba(0,0,0,0.09)' });
  }

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

  // --- 2. Rough tufts (short dark/light strokes in the rough only) -------------
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
    prims.push({
      t: 'line',
      a: [sp[0], sp[1]],
      b: [sp[0] + (rng() - 0.5) * 2, sp[1] - len],
      stroke: dark ? rs.dark : rs.light,
      sw: 1,
      round: true,
    });
  }

  // --- 3. Wildflowers (biome-flavoured dot clusters in the rough) --------------
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
      prims.push({
        t: 'circle',
        c: [sp[0] + (rng() - 0.5) * 6, sp[1] + (rng() - 0.5) * 6],
        r: 0.9 + rng() * 0.8,
        fill: col,
      });
    }
  }

  // --- 3b. Celestial backdrop (spacey flavour, GS) ----------------------------
  // A travelling space golf course should read as floating in the void — so the rough is
  // salted with distant stars, a far planet and a comet. A SEPARATE rng stream (so the
  // existing terrain/tree/mote placement stays byte-identical) keyed off the same hole hash,
  // gated by the `accents` density. Stars sit in course space (pan/zoom with the cam) and are
  // culled to the rough; the planet/comet are screen-space "sky" fixtures up toward the top.
  const crng = mulberry32((hashHole(hole) ^ 0x5747a2) >>> 0);
  if (art.accents > 0) {
    // Background stars over the rough (kept off the cut grass so the playable lines stay clean).
    const starTarget = Math.round(26 * art.accents);
    let st = 0;
    for (let i = 0; i < starTarget * 4 && st < starTarget; i++) {
      const cp = randCoursePt();
      if (onGrass(cp)) continue;
      const sp = proj.project(cp);
      if (!inView(sp, W, H)) continue;
      st++;
      const r = 0.5 + crng() * 1.2;
      const col =
        crng() < 0.5 ? 'rgba(255,255,255,0.9)' : crng() < 0.6 ? 'rgba(186,214,255,0.9)' : 'rgba(255,224,230,0.85)';
      prims.push({ t: 'circle', c: sp, r, fill: col });
      if (crng() < 0.22) {
        const s = r + 1.6; // a brighter star gets a 4-point twinkle
        prims.push({ t: 'line', a: [sp[0] - s, sp[1]], b: [sp[0] + s, sp[1]], stroke: col, sw: 0.7, round: true });
        prims.push({ t: 'line', a: [sp[0], sp[1] - s], b: [sp[0], sp[1] + s], stroke: col, sw: 0.7, round: true });
      }
    }
    // A far planet up in a top corner — ring, shaded disc, lit highlight.
    const planetCols = ['#caa3ff', '#7be0d0', '#ffb27a', '#9bc2ff', '#ff9bbf'];
    const pcol = planetCols[(crng() * planetCols.length) | 0]!;
    const pr = 9 + crng() * 12;
    const ppx = W * (0.1 + crng() * 0.8);
    const ppy = H * (0.05 + crng() * 0.13);
    if (crng() < 0.55) {
      prims.push({ t: 'circle', c: [ppx, ppy], r: pr * 1.75, fill: 'none', stroke: 'rgba(255,255,255,0.10)', sw: 1.4 });
    }
    prims.push({ t: 'circle', c: [ppx, ppy], r: pr, fill: pcol });
    prims.push({ t: 'circle', c: [ppx + pr * 0.42, ppy + pr * 0.34], r: pr * 0.9, fill: 'rgba(8,10,20,0.34)' });
    prims.push({ t: 'circle', c: [ppx - pr * 0.34, ppy - pr * 0.38], r: pr * 0.42, fill: 'rgba(255,255,255,0.5)' });
    // A faint comet streak near the top.
    if (crng() < 0.7) {
      const hx = W * (0.2 + crng() * 0.6);
      const hy = H * (0.06 + crng() * 0.12);
      const len = 30 + crng() * 50;
      const ang = 2.35 + crng() * 0.5; // tail down-left
      prims.push({ t: 'line', a: [hx, hy], b: [hx + Math.cos(ang) * len, hy + Math.sin(ang) * len], stroke: 'rgba(214,230,255,0.4)', sw: 1.4, round: true });
      prims.push({ t: 'circle', c: [hx, hy], r: 1.8, fill: 'rgba(255,255,255,0.95)' });
    }
  }

  // --- 3c. The course's CONSTELLATION, drawn in the sky (GS-17e) ---------------
  // The stop's theme isn't just physics + flavour — its actual constellation hangs overhead,
  // rarity-tinted, so a Scorpius stop LOOKS like Scorpius. Drawn screen-space in the upper sky,
  // using NO crng (so it never perturbs the planet/comet stream above; a course with no theme
  // skips this entirely and stays byte-identical to the pre-GS-17e render).
  if (themeId && art.accents > 0) prims.push(...constellationBackdrop(themeId, W, H));

  // --- 4. Terrain features (fairway/green/tee + scatter surfaces) --------------
  for (const f of hole.features) {
    const sp = projPoly(f.poly, proj);
    if (f.kind === 'fairway') prims.push(...styleFairway(sp, art));
    else if (f.kind === 'green') prims.push(...styleGreen(sp, art));
    else if (f.kind === 'tee') prims.push(...styleTee(sp, art));
    else prims.push(...styleScatter(f.kind, sp, art));
  }

  // --- 5. Hazards (drawn on top, per the layer rule) --------------------------
  for (const f of hole.hazards) {
    if (f.kind === 'trees') {
      prims.push(...styleTree(f.poly, proj, rng));
      continue;
    }
    const sp = projPoly(f.poly, proj);
    if (f.kind === 'bunker' || f.kind === 'waste' || f.kind === 'sand') {
      prims.push(...styleBunker(sp, art, proj.scale));
    } else if (f.kind === 'water') {
      prims.push(...styleWater(sp, rng, art));
    } else {
      prims.push(...styleScatter(f.kind, sp, art));
    }
  }

  // --- 6. Sparkle motes (a little life over the whole hole) -------------------
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

  // --- 7. Out-of-bounds boundary + stakes -------------------------------------
  const corners = projPoly(playBoundsCorners(hole), proj);
  prims.push({ t: 'poly', pts: corners, fill: 'none', stroke: OB.line, sw: 1.5, dash: [2, 7] });
  for (const s of obStakes(hole)) {
    const [x, y] = proj.project(s);
    prims.push({ t: 'line', a: [x, y], b: [x, y - 7], stroke: OB.post, sw: 2, round: true });
    prims.push({ t: 'circle', c: [x, y - 7], r: 1.7, fill: OB.cap });
  }

  // --- 8. Centreline ----------------------------------------------------------
  const cl = projPoly(hole.centreline, proj);
  for (let i = 1; i < cl.length; i++) {
    prims.push({ t: 'line', a: cl[i - 1]!, b: cl[i]!, stroke: 'rgba(255,255,255,0.38)', sw: 1.5, dash: [5, 5] });
  }

  // --- 9. Tee marker + flagstick ----------------------------------------------
  const [tx, ty] = proj.project(hole.tee);
  prims.push({ t: 'circle', c: [tx, ty], r: 5, fill: '#ffffff', stroke: '#000', sw: 1 });
  const [gx, gy] = proj.project(hole.pin ?? hole.green);
  prims.push({ t: 'circle', c: [gx, gy + 1], r: 2.2, fill: 'rgba(0,0,0,0.25)' }); // base shadow
  prims.push({ t: 'line', a: [gx, gy], b: [gx, gy - 14], stroke: '#1a1a1a', sw: 1.4, round: true });
  prims.push({ t: 'poly', pts: [[gx, gy - 14], [gx + 9, gy - 11], [gx, gy - 8]], fill: '#ff3b3b', stroke: '#7a1414', sw: 0.8 });

  void polylineDist; // (kept available for future corridor-aware accents)
  return prims;
}

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
