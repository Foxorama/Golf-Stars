/**
 * Green painter + green-slope ART inputs (GS-style-split): the mown green with its GS-greens-3
 * slope shading and the GS-green-contour relief / topo isolines / local fall-line arrow field,
 * all sampled from the sim's own `greenSlopeAt` height field (the graphic IS the physics).
 * Pure geometry — zero rng; isolines cached per hole so counts stay camera-proof.
 */

import type { Hole, Vec } from '../../sim/course/contract';
import { pointInPoly } from '../../sim/course/contract';
import { greenSlopeAt } from '../../sim/round';
import type { BiomeArchetype } from '../../sim/course/themes';
import { mixHex, type Shade } from '../palette';
import { contourIsolines, type Isoline } from '../contour';
import type { Projector } from '../project';
import {
  type Prim,
  type ArtFeel,
  centroidOf,
  bboxOf,
  offsetPoly,
  stripes,
  hexAlpha,
  LIGHT_UL,
} from './shared';

export function styleGreen(
  poly: Vec[],
  art: ArtFeel,
  s: Shade,
  collar: string,
  fringe: string,
  arch: BiomeArchetype,
  slope?: GreenSlopeArt,
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
  // Softened like the fairway's mowTones (GS-mow-blend) — the green used to stripe at FULL
  // light/dark contrast, the harshest cut on the map. A touch stronger than the fairway's blend
  // (the green is the small showpiece surface), dark muted below light. The wide-value indigo/cyan
  // worlds (void/cetus) mute further so their green doesn't band like the fairway used to
  // (GS-cetus-blend) — their palettes carry a big light↔dark spread that a 0.7/0.5 cut over-shouts.
  const softGreen = arch === 'void' || arch === 'cetus';
  // Green SLOPE (GS-greens-3): shade the LOW side darker + the HIGH side lighter and lay fall-line
  // arrows pointing downhill, so the tilt reads at a glance (the graphic IS the slope the sim rolls
  // on). `slope.dir` is the screen-space DOWNHILL unit; `mag` 0..~0.7 its steepness.
  const contoured = !!(slope?.arrows && slope.arrows.length > 0);
  // A CONTOURED green mutes its mow stripe hard (S+ round 2): the full-contrast bands fought the
  // relief art — gradient, rings and arrows all read against striped noise (the frost screenshot).
  // The stripe stays as a whisper of turf texture; the relief owns the value range now.
  if (art.stripes) {
    const lm = contoured ? 0.26 : softGreen ? 0.52 : 0.7;
    const dm = contoured ? 0.18 : softGreen ? 0.36 : 0.5;
    out.push(stripes(poly, mixHex(s.base, s.light, lm), mixHex(s.base, s.dark, dm), 6));
  }
  const gb = bboxOf(poly);
  if (slope && (slope.mag > 0.05 || contoured)) {
    const span = Math.max(gb.maxX - gb.minX, gb.maxY - gb.minY);
    if (slope.mag > 0.05 && !contoured) {
      // Legacy plane-only green (old saves): the classic lit/shadow circle pair.
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
    } else if (slope.mag > 0.05 && contoured) {
      // S+ round 2: the giant soft circles read as a grey STAIN on pale turf (the frost screenshot),
      // not as ground. Replace with a stepped LINEAR gradient along the fall line — three stacked
      // half-plane washes each side of the centre, cumulative alpha ramping light (high side) →
      // dark (low side). Stepped-not-smooth is the game's cel-shaded language, there is no circular
      // edge to read as a blob, and it composes with the rings/relief instead of swallowing them.
      const u = slope.dir; // downhill, screen space
      const p: Vec = [-u[1], u[0]];
      const BIG = span * 2.5;
      const aBase = Math.min(0.36, slope.mag * 0.5);
      const bands: Prim[] = [];
      const halfPlane = (off: number, sideSign: number, fill: string): Prim => {
        // The region on `sideSign`·downhill side of the line through c + u·off, as a big rect.
        const o: Vec = [c[0] + u[0] * off * sideSign, c[1] + u[1] * off * sideSign];
        return {
          t: 'poly',
          pts: [
            [o[0] + p[0] * BIG, o[1] + p[1] * BIG],
            [o[0] - p[0] * BIG, o[1] - p[1] * BIG],
            [o[0] - p[0] * BIG + u[0] * BIG * sideSign, o[1] - p[1] * BIG + u[1] * BIG * sideSign],
            [o[0] + p[0] * BIG + u[0] * BIG * sideSign, o[1] + p[1] * BIG + u[1] * BIG * sideSign],
          ],
          fill,
        };
      };
      for (const [i, off] of [0.05, 0.22, 0.4].entries()) {
        bands.push(halfPlane(span * off, 1, `rgba(6,12,24,${(aBase * (0.1 + i * 0.02)).toFixed(3)})`)); // low side sinks
        bands.push(halfPlane(span * off, -1, `rgba(255,255,244,${(aBase * (0.09 + i * 0.02)).toFixed(3)})`)); // high side lifts
      }
      out.push({ t: 'clip', clip: poly, children: bands });
    }
    // GS-green-contour-2: the contoured green reads as SCULPTED ground, three layers deep —
    //  1. RELIEF: each lobe shades under the shared upper-left sun (LIGHT_UL, the GS-inset light):
    //     a mound pools soft light on its up-light flank and shadow on its down-light flank; a
    //     hollow is the exact inverse (shadowed near rim, lit far wall — the emboss rule). Glow
    //     prims, so the shading falls off smoothly like ground, not a stamped disc.
    //  2. TOPO ISOLINES: level sets of the sim's own height field (`contourIsolines` — the very
    //     surface the putt integrates), thin pale green-reading-book rings.
    //  3. The LOCAL fall-line arrow field (below) — each chevron points down ITS OWN slope.
    // All pure geometry, zero rng; counts read only course-space/deterministic values.
    if (contoured) {
      const relief: Prim[] = [];
      for (const lb of slope.lobes ?? []) {
        const r = Math.max(3, lb.rPx);
        const s = Math.min(1, Math.abs(lb.h));
        const off = r * 0.36;
        const side = lb.h > 0 ? 1 : -1; // mound lit toward the sun; hollow lit on the far (down-light) wall
        // Toned down (S+ round 2): the relief is an accent under the rings + fall-line gradient
        // now, not the main event — stronger glows pooled into the plane wash and read as stains.
        const litA = Math.min(0.14, 0.05 + s * 0.16);
        const shA = Math.min(0.15, 0.05 + s * 0.17);
        relief.push(
          { t: 'glow', c: [lb.c[0] + LIGHT_UL[0] * off * side, lb.c[1] + LIGHT_UL[1] * off * side], r: r * 1.15, col: `rgba(255,255,238,${litA.toFixed(3)})` },
          { t: 'glow', c: [lb.c[0] - LIGHT_UL[0] * off * side, lb.c[1] - LIGHT_UL[1] * off * side], r: r * 1.08, col: `rgba(4,10,22,${shA.toFixed(3)})` },
        );
      }
      if (relief.length) out.push({ t: 'clip', clip: poly, children: relief });
      if (slope.iso && slope.iso.length) {
        // Elevation-CODED rings, in the biome's own turf tones: a ring above the surface's mid
        // elevation strokes light (the green's light tone eased toward white), one below strokes
        // dark (its dark tone eased toward shadow), intensity growing toward the crest/valley —
        // so which side of the green is HIGH reads at a glance, in every world's palette (a flat
        // white ring vanished on the pale frost/ice greens and glared on the dark ones). The
        // wide-value void/cetus palettes mute further, the MOW_BLEND lesson. Deterministic off
        // `frac` — counts/colours never read the projection.
        const soft = softGreen ? 0.72 : 1;
        // The light side needs a harder push than the dark: a pale ring on already-light turf
        // washes out at the alpha where a dark ring already reads (the first preview's lesson).
        const hiCol = mixHex(s.light, '#ffffff', 0.88);
        const loCol = mixHex(s.dark, '#081018', 0.55);
        const rings: Prim[] = [];
        for (const ring of slope.iso) {
          if (ring.pts.length < 2) continue;
          const d = ring.frac * 2 - 1; // −1 valley … +1 crest
          const w = Math.abs(d);
          const col = d >= 0
            ? hexAlpha(hiCol, (0.22 + 0.34 * w) * soft)
            : hexAlpha(loCol, (0.19 + 0.28 * w) * soft);
          rings.push({ t: 'path', pts: ring.pts, stroke: col, sw: 1.15, round: true });
        }
        if (rings.length) out.push({ t: 'clip', clip: poly, children: rings });
      }
      const arrows: Prim[] = [];
      // Px-capped sizes off the projected span (the GS-putt-feel lesson): legible glyphs at putt
      // zoom, a subtle stipple at map zoom — the caps never let them balloon into bold bars.
      const len = Math.max(3.5, Math.min(11, span * 0.08));
      const head = Math.max(1.6, len * 0.28);
      for (const ar of slope.arrows!) {
        const col = `rgba(255,255,255,${(0.2 + Math.min(0.16, ar.mag * 0.28)).toFixed(3)})`;
        const perp: Vec = [-ar.dir[1], ar.dir[0]];
        const base: Vec = [ar.p[0] - ar.dir[0] * len * 0.5, ar.p[1] - ar.dir[1] * len * 0.5];
        const tip: Vec = [ar.p[0] + ar.dir[0] * len * 0.5, ar.p[1] + ar.dir[1] * len * 0.5];
        arrows.push({ t: 'line', a: base, b: tip, stroke: col, sw: 1.05, round: true });
        arrows.push({ t: 'line', a: tip, b: [tip[0] - ar.dir[0] * head + perp[0] * (head * 0.7), tip[1] - ar.dir[1] * head + perp[1] * (head * 0.7)], stroke: col, sw: 1.05, round: true });
        arrows.push({ t: 'line', a: tip, b: [tip[0] - ar.dir[0] * head - perp[0] * (head * 0.7), tip[1] - ar.dir[1] * head - perp[1] * (head * 0.7)], stroke: col, sw: 1.05, round: true });
      }
      out.push({ t: 'clip', clip: poly, children: arrows });
      if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, 0.7), sw: 1.2 });
      return out;
    }
    // Fall-line chevrons pointing downhill. GS-putt-depth: a STEEPER green (a harder, breakier stop)
    // reads with a slightly denser cluster so the tilt's severity is legible — a gentle green keeps the
    // classic pair, a full-tilt green a small 3×2 grid. Sizes are span-proportional but CAPPED IN PX:
    // prims live in SCREEN space, so uncapped span-fraction chevrons ballooned into bold lines stretched
    // clear across the green at the putt zoom (the "overpowering angle lines" bug) — while a too-small
    // cap (#247's 3.4, believed to be course-yards) went near-invisible at putt zoom AND shrank the
    // classic map-zoom pair. These caps never bind at map zoom (a whole-hole green is smaller than them
    // → the classic look) and hold the glyphs modest-but-legible at green zoom. Pure geometry off the
    // deterministic slope magnitude (camera-proof: fixed count per mag; sizes may read the projection).
    const perp: Vec = [-slope.dir[1], slope.dir[0]];
    const arrows: Prim[] = [];
    const steep = Math.max(0, Math.min(1, (slope.mag - 0.15) / 0.5)); // 0 gentle → 1 full tilt
    const cols = 2 + Math.round(steep); // 2 or 3 across
    const rows = 1 + Math.round(steep); // 1 or 2 down the fall line
    const len = Math.min(span * (0.3 - steep * 0.08), 30); // finer (shorter) arrows as they get denser
    const colGap = Math.min(span * 0.17, 26);
    const rowGap = Math.min(span * 0.24, 38);
    const head = Math.max(2.1, len * 0.2);
    const col = `rgba(255,255,255,${(0.3 + steep * 0.12).toFixed(3)})`; // subtle: never bold/overpowering
    for (let r = 0; r < rows; r++) {
      const roff = (r - (rows - 1) / 2) * rowGap;
      for (let ci = 0; ci < cols; ci++) {
        const coff = (ci - (cols - 1) / 2) * colGap;
        const base: Vec = [
          c[0] + perp[0] * coff - slope.dir[0] * (len * 0.5 + roff),
          c[1] + perp[1] * coff - slope.dir[1] * (len * 0.5 + roff),
        ];
        const tip: Vec = [base[0] + slope.dir[0] * len, base[1] + slope.dir[1] * len];
        arrows.push({ t: 'line', a: base, b: tip, stroke: col, sw: 1.1, round: true });
        arrows.push({ t: 'line', a: tip, b: [tip[0] - slope.dir[0] * head + perp[0] * (head * 0.7), tip[1] - slope.dir[1] * head + perp[1] * (head * 0.7)], stroke: col, sw: 1.1, round: true });
        arrows.push({ t: 'line', a: tip, b: [tip[0] - slope.dir[0] * head - perp[0] * (head * 0.7), tip[1] - slope.dir[1] * head - perp[1] * (head * 0.7)], stroke: col, sw: 1.1, round: true });
      }
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
/** Screen-space green slope ART inputs: the dominant plane's downhill dir + mag (GS-greens-3), and —
 *  on a contoured green (GS-green-contour) — a LOCAL fall-line arrow field sampled from the sim's own
 *  `greenSlopeAt` plus the projected lobes for crest/hollow shading. All pure geometry, zero rng. */
export interface GreenSlopeArt {
  dir: Vec;
  mag: number;
  /** Local downhill sample per course-space grid cell inside the green — the contour arrow field. */
  arrows?: { p: Vec; dir: Vec; mag: number }[];
  /** Projected contour lobes: screen centre, px radius, signed peak slope (+ mound / − hollow). */
  lobes?: { c: Vec; rPx: number; h: number }[];
  /** Projected topo ISOLINES (GS-green-contour-2): level sets of the sim's height field, screen
   *  space, each carrying its elevation `frac` (0 = the lowest ring, 1 = the highest) so the
   *  green-reading-book rings colour-code high ground light and low ground dark. */
  iso?: { pts: Vec[]; frac: number }[];
}

/** Course-space isolines per hole (GS-green-contour-2): the field never changes under a camera
 *  move, so the marching-squares pass runs once per hole and every follow-cam frame just re-projects
 *  — both a per-frame cost saving and a hard guarantee of camera-proof line counts. */
const isoCache = new WeakMap<Hole, Isoline[]>();

function greenIsolinesCourse(hole: Hole, greenPolyCourse: Vec[]): Isoline[] {
  let iso = isoCache.get(hole);
  if (!iso) {
    iso = contourIsolines(greenPolyCourse, hole.greenSlope, hole.greenContour ?? []);
    isoCache.set(hole, iso);
  }
  return iso;
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

/**
 * Green slope art for `styleGreen` (GS-green-contour): the plane read plus, when the hole carries
 * contour lobes, a local fall-line arrow FIELD — one downhill sample per course-space grid cell
 * inside the green, taken from the sim's `greenSlopeAt` (the exact field the putt resolver
 * integrates — the graphic IS the physics). The grid lives in COURSE space and the near-flat-crest
 * cut reads only the deterministic field, so the sample count is camera-proof (the follow-cam
 * rebuilds the scene per frame); only px SIZES read the projection, per the camera contract.
 */
export function greenSlopeArt(hole: Hole, greenPolyCourse: Vec[], proj: Projector): GreenSlopeArt | undefined {
  const base = greenSlopeScreen(hole, proj);
  const lobes = hole.greenContour;
  if (!lobes || lobes.length === 0) return base; // plane-only hole → the classic GS-greens-3 look
  const plane: GreenSlopeArt = base ?? { dir: [0, 1], mag: 0 };
  const gb = bboxOf(greenPolyCourse);
  const span = Math.max(gb.maxX - gb.minX, gb.maxY - gb.minY);
  // Sparser than the original span/5 grid (S+ round 2): ~25 chevrons read as scattered clutter over
  // the rings + gradient; a loose handful accents the field without shouting over it.
  const step = Math.max(8, span / 3.4); // course yards — a loose handful of reads across the surface
  const arrows: { p: Vec; dir: Vec; mag: number }[] = [];
  for (let x = gb.minX + step * 0.5; x < gb.maxX; x += step) {
    for (let y = gb.minY + step * 0.5; y < gb.maxY; y += step) {
      const cp: Vec = [x, y];
      if (!pointInPoly(cp, greenPolyCourse)) continue;
      const s = greenSlopeAt(cp, hole.greenSlope, lobes);
      const m = Math.hypot(s[0], s[1]);
      if (m < 0.06) continue; // a flat crest/saddle has no read to give
      const a = proj.project(cp);
      const b = proj.project([cp[0] + s[0] / m, cp[1] + s[1] / m]);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      arrows.push({ p: a, dir: [dx / l, dy / l], mag: m });
    }
  }
  const lobArt = lobes.map((lb) => {
    const c = proj.project(lb.c);
    const e = proj.project([lb.c[0] + lb.r, lb.c[1]]);
    return { c, rPx: Math.hypot(e[0] - c[0], e[1] - c[1]), h: lb.h };
  });
  const iso = greenIsolinesCourse(hole, greenPolyCourse).map((line) => ({
    pts: line.pts.map((p) => proj.project(p)),
    frac: line.frac,
  }));
  return { ...plane, arrows, lobes: lobArt, iso };
}
