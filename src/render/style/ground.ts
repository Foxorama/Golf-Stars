/**
 * Ground covering + Easter eggs (GS-style-split): the per-world GROUND_COVER texture pass
 * (GS-ground-cover / GS-rough-cover-2) and the whimsical EGGS props hidden in the rough
 * (GS-egg). Both run on dedicated seeded streams with course-space rejection, so their
 * prim counts are camera-proof.
 */

import type { Vec } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import type { Projector } from '../project';
import { type Prim, bboxOf, posHash, inView } from './shared';

/**
 * Per-world ground COVERING (GS-ground-cover). The rough palette gives each world its ground
 * COLOUR; this table gives it the covering TEXTURE — the dense, low-contrast surface detail that
 * makes the in-bounds land read as actual ground and not a flat tinted slab ("the rough still
 * doesn't look like ground"). Snow mottling + drift ridges + ice sparkle on frost; wind-combed
 * beach sand + shell flecks on ocean; moss clumps + lichen dots on fungal; ash drifts + cinder
 * flecks + ember winks on inferno; dune combing on desert; shard-gravel scree on crystal;
 * rain-flattened moor grass on tempest; meadow-grass mottling on verdant.
 *
 * Void and cetus are DELIBERATELY absent: their ground rules are bespoke (floating platforms over
 * the abyss / star-sea clifftops) and their calm-stop rough keeps the luminous night-garden read.
 * Table + dispatch per the GS-biome-feel rule — a new world adds a row, never a fork; coverage is
 * machine-checked by `tests/biome-identity.test.ts`.
 */
export interface GroundCoverLook {
  /** Soft light tonal patch (rgba, low alpha) — the covering's undulation. */
  mottleLight: string;
  /** Soft dark tonal patch (rgba, low alpha). */
  mottleDark: string;
  /** Fine flecks strewn through the covering (snow crumbs, shells, lichen, cinders…). */
  grain: string[];
  /** Directional combing strokes (drift ridges / dune ripples / rain-flattened grass), coherent per hole. */
  ridge?: string;
  /** Rare bright glints (ice sparkle / ember winks / prism flashes). */
  sparkle?: string;
  /**
   * Raised little CLUMPS that give the rough real 3-D texture so it reads as covered GROUND, not a
   * flat tinted slab (GS-rough-cover-2: "crystal, tempest, inferno don't actually look like rough").
   * `blade` = leaning grass/reed tufts (moor, dune, moss), `shard` = angular mineral splinters
   * (crystal scree, ice needles), `clump` = rounded tussock/cinder mounds (ash field). `cols[0]` is
   * the base tone, `cols[1]` the accent (ember wink / lit tip). Drawn dense, sized in yards.
   */
  tuft?: { cols: string[]; style: 'blade' | 'shard' | 'clump' };
  /** Texture-density multiplier (default 1) — bumped on worlds whose rough read as a flat slab. */
  density?: number;
}
export const GROUND_COVER: Partial<Record<BiomeArchetype, GroundCoverLook>> = {
  verdant: {
    mottleLight: 'rgba(130,205,115,0.07)',
    mottleDark: 'rgba(0,22,0,0.13)',
    grain: ['rgba(150,220,130,0.45)', 'rgba(18,48,18,0.5)'],
  },
  desert: {
    mottleLight: 'rgba(255,226,160,0.10)',
    mottleDark: 'rgba(62,38,12,0.14)',
    grain: ['rgba(255,235,190,0.5)', 'rgba(84,58,26,0.5)'],
    ridge: 'rgba(242,212,152,0.22)',
    tuft: { cols: ['#9a7f3e', '#c2a95e'], style: 'blade' }, // dry desert-grass clumps
  },
  frost: {
    mottleLight: 'rgba(255,255,255,0.30)',
    mottleDark: 'rgba(92,132,164,0.16)',
    grain: ['rgba(255,255,255,0.75)', 'rgba(140,176,206,0.5)'],
    ridge: 'rgba(255,255,255,0.35)',
    sparkle: 'rgba(255,255,255,0.9)',
    tuft: { cols: ['#eaf4fb', '#bcd6e6'], style: 'shard' }, // rime ice-needles
  },
  // Inferno reads as a flat red-brown slab (GS-rough-cover-2) — denser ash mottle + charred cinder
  // tussocks with ember winks make the scorched rough read as broken, smouldering ground.
  inferno: {
    mottleLight: 'rgba(168,136,116,0.12)',
    mottleDark: 'rgba(14,8,5,0.24)',
    grain: ['rgba(28,17,11,0.6)', 'rgba(198,168,148,0.35)'],
    sparkle: 'rgba(255,150,60,0.8)',
    tuft: { cols: ['#3a2a22', '#ff7a1e'], style: 'clump' }, // cinder tussocks, ember-flecked (distinct from the snag-ember decor tone)
    density: 1.5,
  },
  // Crystal read as a washed pale slab (GS-rough-cover-2) — denser scree mottle + upright shard
  // splinters make the rough a field of crystalline gravel rather than flat tinted ground.
  crystal: {
    mottleLight: 'rgba(192,215,240,0.12)',
    mottleDark: 'rgba(20,28,48,0.24)',
    grain: ['rgba(206,230,250,0.5)', 'rgba(34,44,68,0.55)'],
    sparkle: 'rgba(222,246,255,0.9)',
    tuft: { cols: ['#bfe0ea', '#8fb8d0'], style: 'shard' }, // shard splinters poking from the scree
    density: 1.6,
  },
  // Tempest read as a flat olive slab (GS-rough-cover-2) — coherent rain-flattened grass tufts (all
  // leaning downwind) + stronger mottle make the moor read as windswept wild grass.
  tempest: {
    mottleLight: 'rgba(172,192,150,0.10)',
    mottleDark: 'rgba(10,16,10,0.22)',
    grain: ['rgba(162,182,140,0.4)', 'rgba(24,32,22,0.55)'],
    ridge: 'rgba(182,202,160,0.20)',
    tuft: { cols: ['#3a4433', '#6f7d58'], style: 'blade' }, // wind-bent moor grass
    density: 1.5,
  },
  fungal: {
    mottleLight: 'rgba(122,232,172,0.10)',
    mottleDark: 'rgba(8,26,16,0.20)',
    grain: ['rgba(150,240,190,0.45)', 'rgba(176,126,255,0.4)'],
    sparkle: 'rgba(150,240,190,0.7)',
    tuft: { cols: ['#2f7a54', '#5fd49e'], style: 'clump' }, // moss clumps, lit tips
  },
  ocean: {
    mottleLight: 'rgba(255,240,205,0.14)',
    mottleDark: 'rgba(112,86,50,0.14)',
    grain: ['rgba(255,248,225,0.55)', 'rgba(122,96,60,0.5)'],
    ridge: 'rgba(255,245,215,0.25)',
    sparkle: 'rgba(255,255,255,0.7)',
    tuft: { cols: ['#9aa85a', '#c2cf7e'], style: 'blade' }, // dune marram grass
  },
  // Asgard — a gilded MEADOW: rich emerald grass mottle strewn with golden pollen flecks and rare
  // gold glints, its blade tufts tipped in gold (Iðavöllr, the golden field of the gods).
  asgard: {
    mottleLight: 'rgba(200,235,150,0.09)',
    mottleDark: 'rgba(10,30,10,0.15)',
    grain: ['rgba(240,225,150,0.5)', 'rgba(24,54,24,0.5)'],
    sparkle: 'rgba(255,232,150,0.85)',
    tuft: { cols: ['#2f7a48', '#c9a84e'], style: 'blade' }, // emerald grass, gold-tipped
  },
};

/**
 * The ground-covering pass itself: tonal mottle patches, fine grain flecks, optional directional
 * combing ridges and rare glints, scattered across the LAND-HULL bbox (playBounds + apron — wider
 * than the features bbox, so the covering reaches the OB frame's corners) and clipped to the land
 * by the caller. Determinism/camera rules (the archetypeDecor contract): consumes ONLY its own
 * dedicated stream; placement rejects off the cut grass with BOUNDED attempts in COURSE space
 * (the draw count never reads the projection); per-item shape varies off `posHash` of the course
 * point; visibility culls at paint time only. Patch radii are sized in YARDS via `proj.scale`
 * (clamped in px) so the covering sticks to the ground at every zoom.
 */
export function groundCover(
  look: GroundCoverLook,
  landBoxCourse: Vec[],
  onGrass: (p: Vec) => boolean,
  proj: Projector,
  W: number,
  H: number,
  texture: number,
  rng: () => number,
): Prim[] {
  const out: Prim[] = [];
  const lb = bboxOf(landBoxCourse);
  const spanX = lb.maxX - lb.minX || 1;
  const spanY = lb.maxY - lb.minY || 1;
  const span = Math.max(spanX, spanY);
  const dens = look.density ?? 1; // worlds whose rough read as a flat slab pack the covering denser
  const pt = (): { c: Vec; s: Vec } | null => {
    for (let i = 0; i < 6; i++) {
      const c: Vec = [lb.minX + spanX * rng(), lb.minY + spanY * rng()];
      if (onGrass(c)) continue;
      return { c, s: proj.project(c) };
    }
    return null;
  };
  // 1. Tonal mottle — soft irregular light/dark patches, the covering's large-scale undulation.
  const mottles = Math.min(40, Math.round((span / 14) * texture * dens));
  for (let i = 0; i < mottles; i++) {
    const g = pt();
    const ry = 5 + rng() * 9; // radius in yards — drawn unconditionally, the count never reads the view
    const light = rng() < 0.45;
    if (!g) continue;
    const r = Math.max(7, Math.min(64, ry * proj.scale));
    if (!inView(g.s, W, H, r + 24)) continue; // placed + sized (rng consumed), just not painted
    const pts: Vec[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const rk = r * (0.68 + posHash(g.c[0], g.c[1], k) * 0.55);
      pts.push([g.s[0] + Math.cos(a) * rk, g.s[1] + Math.sin(a) * rk * 0.82]);
    }
    out.push({ t: 'poly', pts, fill: light ? look.mottleLight : look.mottleDark });
  }
  // 2. Fine grain — the covering's speckle (snow crumbs / shells / lichen / cinders / gravel).
  const grains = Math.min(150, Math.round((span / 5) * texture * dens));
  for (let i = 0; i < grains; i++) {
    const g = pt();
    const which = rng();
    if (!g || !inView(g.s, W, H)) continue;
    const col = look.grain[Math.floor(which * look.grain.length) % look.grain.length]!;
    out.push({ t: 'circle', c: g.s, r: 0.5 + posHash(g.c[0], g.c[1]) * 0.9, fill: col });
  }
  // 3. Combing ridges — short parallel strokes on ONE coherent per-hole grain (wind-blown covering).
  if (look.ridge) {
    const baseAng = rng() * Math.PI;
    const ridges = Math.min(12, Math.round((span / 30) * texture));
    for (let i = 0; i < ridges; i++) {
      const g = pt();
      const ang = baseAng + (rng() - 0.5) * 0.5;
      if (!g || !inView(g.s, W, H)) continue;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      for (let k = 0; k < 3; k++) {
        const off = (k - 1) * 4.2;
        const cxp = g.s[0] - dy * off;
        const cyp = g.s[1] + dx * off;
        const len = 6 + posHash(g.c[0], g.c[1], k) * 9;
        out.push({ t: 'line', a: [cxp - dx * len, cyp - dy * len], b: [cxp + dx * len, cyp + dy * len], stroke: look.ridge, sw: 1.1, round: true });
      }
    }
  }
  // 4. Sparkle — rare bright glints so a crystalline/frozen/ember covering catches the light.
  if (look.sparkle) {
    const sparks = Math.min(14, Math.round((span / 26) * texture));
    for (let i = 0; i < sparks; i++) {
      const g = pt();
      if (!g || !inView(g.s, W, H)) continue;
      const p = g.s;
      const s = 1.2 + posHash(g.c[0], g.c[1], 5) * 1.4;
      out.push({ t: 'line', a: [p[0] - s, p[1]], b: [p[0] + s, p[1]], stroke: look.sparkle, sw: 0.8, round: true });
      out.push({ t: 'line', a: [p[0], p[1] - s], b: [p[0], p[1] + s], stroke: look.sparkle, sw: 0.8, round: true });
    }
  }
  // 5. Tufts — the covering's raised CLUMPS (grass blades / mineral shards / cinder tussocks) so the
  // rough reads as textured, covered ground, not a flat tinted slab (GS-rough-cover-2). Sized in
  // yards (clamped px), varied off course-space posHash (camera-stable prim count per clump). Blades
  // share ONE coherent per-hole lean so a windswept moor / dune grain reads across the whole rough.
  if (look.tuft) {
    const tu = look.tuft;
    const lean0 = tu.style === 'blade' ? rng() * 0.5 - 0.25 : 0; // coherent grain (consumed always)
    const tufts = Math.min(96, Math.round((span / 6) * texture * dens));
    for (let i = 0; i < tufts; i++) {
      const g = pt();
      const cw = rng(); // colour pick, consumed unconditionally so the count never reads the view
      if (!g || !inView(g.s, W, H, 14)) continue;
      const p = g.s;
      const hpx = Math.max(3, Math.min(9, 2.2 * proj.scale));
      const col = cw < 0.5 ? tu.cols[0]! : tu.cols[tu.cols.length - 1]!;
      const n = 3 + Math.floor(posHash(g.c[0], g.c[1], 8) * 2); // 3–4 elements per clump (course-hashed)
      if (tu.style === 'blade') {
        for (let k = 0; k < n; k++) {
          const ox = (posHash(g.c[0], g.c[1], k) - 0.5) * hpx * 0.9;
          const lean = lean0 + (posHash(g.c[0], g.c[1], k + 3) - 0.5) * 0.3;
          out.push({ t: 'line', a: [p[0] + ox, p[1]], b: [p[0] + ox + Math.sin(lean) * hpx, p[1] - hpx], stroke: k % 2 ? tu.cols[0]! : col, sw: 1, round: true });
        }
      } else if (tu.style === 'shard') {
        for (let k = 0; k < n; k++) {
          const ox = (posHash(g.c[0], g.c[1], k) - 0.5) * hpx;
          const tipx = p[0] + ox + (posHash(g.c[0], g.c[1], k + 5) - 0.5) * hpx * 0.4;
          out.push({ t: 'poly', pts: [[p[0] + ox - hpx * 0.2, p[1]], [tipx, p[1] - hpx * (0.7 + posHash(g.c[0], g.c[1], k + 2) * 0.5)], [p[0] + ox + hpx * 0.2, p[1]]], fill: k % 2 ? tu.cols[0]! : col, stroke: 'rgba(30,60,90,0.4)', sw: 0.5 });
        }
      } else {
        // clump — a rounded tussock/cinder mound with a few accent flecks (ember winks on inferno).
        out.push({ t: 'circle', c: p, r: hpx * 0.55, fill: tu.cols[0]! });
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          out.push({ t: 'circle', c: [p[0] + Math.cos(a) * hpx * 0.42, p[1] - Math.abs(Math.sin(a)) * hpx * 0.42], r: hpx * 0.18, fill: tu.cols[tu.cols.length - 1]! });
        }
      }
    }
  }
  return out;
}
// --- GS-egg: whimsical Easter-egg props hidden in the rough -----------------------------------
//
// The signature decor above sells the world; these sell the FUN — a rare treat you only find if you
// zoom out and scan the whole hole (a snowman out on the frost tundra, a sandcastle on the beach, a
// toadstool cottage in the spore jungle, a garden gnome in the parkland). Placed on LAND, well OFF
// the corridor (a buffered cut-grass reject), on a dedicated seeded stream, clipped to the land hull.
// Void & Cetus are excluded BY DESIGN (no EGGS row) — their bespoke abyss already reads great.
//
// A `pen` gives each painter terse `circle/line/poly/glow` helpers + `h(k)` (course-space posHash for
// per-instance variety). THE RULES (the archetypeDecor contract): every painter pushes a FIXED prim
// count (variety comes from `h`, never rng, never the projection), and the egg is pushed
// UNCONDITIONALLY (off-view pieces just paint nothing) — so the scene stays camera-proof under the
// per-frame follow-cam rebuild. Placement rejects only in COURSE space, so the placed count is stable.
interface EggPen {
  circle(cx: number, cy: number, r: number, fill?: string, stroke?: string, sw?: number): void;
  line(ax: number, ay: number, bx: number, by: number, stroke: string, sw?: number): void;
  poly(pts: Vec[], fill?: string, stroke?: string, sw?: number): void;
  glow(cx: number, cy: number, r: number, col: string): void;
  /** Course-space posHash for deterministic, camera-stable per-instance variety. */
  h(k: number): number;
}
type EggPainter = (x: number, y: number, u: number, pen: EggPen) => void;

const EGGS: Partial<Record<BiomeArchetype, EggPainter[]>> = {
  verdant: [
    // A red picnic blanket + basket.
    (x, y, u, P) => {
      const w = u * 1.3;
      P.poly([[x - w, y - u * 0.1], [x + w, y - u * 0.25], [x + w * 0.92, y + u * 0.45], [x - w * 1.05, y + u * 0.3]], '#c94b3b', 'rgba(70,18,14,0.5)', 0.6);
      P.line(x - w * 0.4, y - u * 0.14, x - w * 0.3, y + u * 0.36, 'rgba(255,255,255,0.6)', 0.7);
      P.line(x + w * 0.3, y - u * 0.2, x + w * 0.36, y + u * 0.3, 'rgba(255,255,255,0.6)', 0.7);
      P.line(x - w, y + u * 0.1, x + w, y + u * 0.02, 'rgba(255,255,255,0.5)', 0.7);
      P.circle(x + w * 0.5, y - u * 0.2, u * 0.26, '#a9722f', 'rgba(55,32,8,0.6)', 0.6);
    },
    // A garden gnome.
    (x, y, u, P) => {
      P.poly([[x - u * 0.3, y], [x + u * 0.3, y], [x + u * 0.22, y - u * 0.55], [x - u * 0.22, y - u * 0.55]], '#3f6fb0');
      P.circle(x, y - u * 0.62, u * 0.24, '#e9c9a2');
      P.poly([[x - u * 0.28, y - u * 0.66], [x + u * 0.28, y - u * 0.66], [x, y - u * 1.25]], '#d23b2c');
      P.circle(x, y - u * 0.52, u * 0.12, '#f2f2f2');
    },
    // A duck paddling a little pond.
    (x, y, u, P) => {
      P.circle(x, y, u * 0.9, '#3f8fe0', 'rgba(20,60,110,0.5)', 0.7);
      P.circle(x, y, u * 0.55, 'rgba(150,205,245,0.5)');
      P.circle(x + u * 0.3, y - u * 0.05, u * 0.16, '#f4e04a');
      P.circle(x + u * 0.5, y - u * 0.18, u * 0.09, '#f4e04a');
      P.line(x + u * 0.58, y - u * 0.18, x + u * 0.7, y - u * 0.16, '#e8892a', 1);
    },
  ],
  desert: [
    // A bleached cow skull.
    (x, y, u, P) => {
      P.poly([[x - u * 0.5, y - u * 0.5], [x + u * 0.5, y - u * 0.5], [x + u * 0.4, y + u * 0.1], [x, y + u * 0.35], [x - u * 0.4, y + u * 0.1]], '#e6ded0', 'rgba(90,80,60,0.5)', 0.6);
      P.poly([[x - u * 0.5, y - u * 0.5], [x - u * 0.95, y - u * 0.72], [x - u * 0.55, y - u * 0.34]], '#efe9dd');
      P.poly([[x + u * 0.5, y - u * 0.5], [x + u * 0.95, y - u * 0.72], [x + u * 0.55, y - u * 0.34]], '#efe9dd');
      P.circle(x - u * 0.2, y - u * 0.14, u * 0.1, '#3a3228');
      P.circle(x + u * 0.2, y - u * 0.14, u * 0.1, '#3a3228');
      P.poly([[x - u * 0.08, y + u * 0.05], [x + u * 0.08, y + u * 0.05], [x, y + u * 0.28]], '#3a3228');
    },
    // A saguaro cactus in bloom.
    (x, y, u, P) => {
      P.poly([[x - u * 0.18, y], [x + u * 0.18, y], [x + u * 0.18, y - u * 0.9], [x - u * 0.18, y - u * 0.9]], '#3f8a4a', 'rgba(20,50,25,0.5)', 0.6);
      P.poly([[x - u * 0.18, y - u * 0.4], [x - u * 0.5, y - u * 0.4], [x - u * 0.5, y - u * 0.7], [x - u * 0.34, y - u * 0.7], [x - u * 0.34, y - u * 0.52], [x - u * 0.18, y - u * 0.52]], '#3f8a4a');
      P.poly([[x + u * 0.18, y - u * 0.5], [x + u * 0.5, y - u * 0.5], [x + u * 0.5, y - u * 0.82], [x + u * 0.34, y - u * 0.82], [x + u * 0.34, y - u * 0.64], [x + u * 0.18, y - u * 0.64]], '#3f8a4a');
      P.circle(x, y - u * 0.96, u * 0.13, '#ff7eb6');
    },
    // A little stone pyramid.
    (x, y, u, P) => {
      P.poly([[x - u * 0.75, y], [x + u * 0.75, y], [x, y - u]], '#c9a662', 'rgba(80,60,25,0.5)', 0.6);
      P.poly([[x, y], [x + u * 0.75, y], [x, y - u]], 'rgba(90,66,28,0.35)');
      P.line(x, y, x, y - u, 'rgba(255,240,200,0.4)', 0.7);
    },
    // A rolling tumbleweed.
    (x, y, u, P) => {
      P.circle(x, y - u * 0.35, u * 0.5, 'none', '#8a6a3a', 1.2);
      for (let k = 0; k < 5; k++) {
        const a = P.h(k) * Math.PI * 2;
        P.line(x, y - u * 0.35, x + Math.cos(a) * u * 0.5, y - u * 0.35 + Math.sin(a) * u * 0.5, 'rgba(120,92,50,0.7)', 0.8);
      }
    },
  ],
  frost: [
    // A snowman, top hat and all.
    (x, y, u, P) => {
      P.circle(x, y - u * 0.25, u * 0.4, '#f6fbff', 'rgba(150,180,205,0.6)', 0.6);
      P.circle(x, y - u * 0.85, u * 0.3, '#f6fbff', 'rgba(150,180,205,0.6)', 0.6);
      P.circle(x, y - u * 1.3, u * 0.22, '#f6fbff', 'rgba(150,180,205,0.6)', 0.6);
      P.poly([[x, y - u * 1.33], [x + u * 0.32, y - u * 1.29], [x, y - u * 1.25]], '#ff8a2a');
      P.circle(x - u * 0.07, y - u * 1.37, u * 0.04, '#222');
      P.circle(x + u * 0.07, y - u * 1.37, u * 0.04, '#222');
      P.line(x - u * 0.28, y - u * 0.85, x - u * 0.62, y - u * 1.02, '#6b4a2a', 1);
      P.line(x + u * 0.28, y - u * 0.85, x + u * 0.62, y - u * 1.02, '#6b4a2a', 1);
      P.poly([[x - u * 0.24, y - u * 1.5], [x + u * 0.24, y - u * 1.5], [x + u * 0.24, y - u * 1.43], [x - u * 0.24, y - u * 1.43]], '#222');
      P.poly([[x - u * 0.14, y - u * 1.5], [x + u * 0.14, y - u * 1.5], [x + u * 0.14, y - u * 1.74], [x - u * 0.14, y - u * 1.74]], '#222');
    },
    // An igloo.
    (x, y, u, P) => {
      P.poly([[x - u * 0.8, y], [x - u * 0.7, y - u * 0.55], [x - u * 0.4, y - u * 0.82], [x, y - u * 0.9], [x + u * 0.4, y - u * 0.82], [x + u * 0.7, y - u * 0.55], [x + u * 0.8, y]], '#e6f0f8', 'rgba(150,180,205,0.6)', 0.7);
      P.line(x - u * 0.55, y - u * 0.55, x + u * 0.55, y - u * 0.55, 'rgba(150,180,205,0.5)', 0.6);
      P.line(x - u * 0.3, y - u * 0.78, x - u * 0.32, y - u * 0.2, 'rgba(150,180,205,0.5)', 0.6);
      P.line(x + u * 0.3, y - u * 0.78, x + u * 0.32, y - u * 0.2, 'rgba(150,180,205,0.5)', 0.6);
      P.poly([[x - u * 0.22, y], [x - u * 0.22, y - u * 0.35], [x - u * 0.1, y - u * 0.46], [x + u * 0.1, y - u * 0.46], [x + u * 0.22, y - u * 0.35], [x + u * 0.22, y]], '#3a5262');
    },
    // A penguin.
    (x, y, u, P) => {
      P.poly([[x - u * 0.32, y], [x - u * 0.36, y - u * 0.7], [x, y - u * 0.95], [x + u * 0.36, y - u * 0.7], [x + u * 0.32, y]], '#26303a', 'rgba(10,14,18,0.7)', 0.6);
      P.poly([[x - u * 0.2, y], [x - u * 0.2, y - u * 0.55], [x, y - u * 0.7], [x + u * 0.2, y - u * 0.55], [x + u * 0.2, y]], '#f2f6fa');
      P.circle(x - u * 0.1, y - u * 0.78, u * 0.05, '#fff');
      P.circle(x + u * 0.1, y - u * 0.78, u * 0.05, '#fff');
      P.poly([[x - u * 0.06, y - u * 0.72], [x + u * 0.06, y - u * 0.72], [x, y - u * 0.6]], '#ff9a2a');
      P.line(x - u * 0.14, y, x - u * 0.28, y + u * 0.08, '#ff9a2a', 1.2);
      P.line(x + u * 0.14, y, x + u * 0.28, y + u * 0.08, '#ff9a2a', 1.2);
    },
  ],
  inferno: [
    // A mini erupting volcano.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.7, u * 1.1, 'rgba(255,120,40,0.3)');
      P.poly([[x - u * 0.8, y], [x + u * 0.8, y], [x + u * 0.32, y - u * 0.85], [x - u * 0.32, y - u * 0.85]], '#2a1c16', 'rgba(10,6,4,0.7)', 0.6);
      P.poly([[x - u * 0.32, y - u * 0.85], [x + u * 0.32, y - u * 0.85], [x + u * 0.24, y - u * 0.72], [x - u * 0.24, y - u * 0.72]], '#ff8a2a');
      P.line(x + u * 0.05, y - u * 0.8, x + u * 0.22, y - u * 0.38, '#ff5a1e', 1.4);
      P.line(x - u * 0.1, y - u * 0.85, x - u * 0.18, y - u * 1.18, 'rgba(255,150,60,0.6)', 1.2);
    },
    // A charred, still-smouldering stump.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.2, u * 0.7, 'rgba(255,120,40,0.22)');
      P.poly([[x - u * 0.3, y], [x + u * 0.3, y], [x + u * 0.24, y - u * 0.7], [x - u * 0.24, y - u * 0.7]], '#231712', 'rgba(8,4,2,0.7)', 0.6);
      P.line(x - u * 0.16, y - u * 0.7, x - u * 0.36, y - u * 0.98, '#231712', 1.4);
      P.line(x + u * 0.14, y - u * 0.7, x + u * 0.32, y - u * 0.92, '#231712', 1.2);
      P.circle(x, y - u * 0.4, u * 0.08, '#ff8a2a');
      P.circle(x - u * 0.1, y - u * 0.14, u * 0.05, '#ffb24a');
    },
    // An obsidian "golf ball" veined with magma.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.3, u * 0.6, 'rgba(255,110,40,0.25)');
      P.circle(x, y - u * 0.3, u * 0.35, '#161014', 'rgba(255,140,60,0.5)', 0.8);
      P.line(x - u * 0.2, y - u * 0.4, x + u * 0.1, y - u * 0.15, '#ff7a2a', 1);
      P.line(x - u * 0.05, y - u * 0.5, x + u * 0.15, y - u * 0.32, '#ffb24a', 0.8);
    },
  ],
  crystal: [
    // A split geode glowing from within.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.35, u * 0.9, 'rgba(160,225,255,0.28)');
      P.circle(x, y - u * 0.35, u * 0.5, '#4a5670', 'rgba(20,40,60,0.6)', 0.8);
      P.circle(x, y - u * 0.35, u * 0.34, '#bff0ff');
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        P.line(x, y - u * 0.35, x + Math.cos(a) * u * 0.32, y - u * 0.35 + Math.sin(a) * u * 0.32, 'rgba(200,245,255,0.7)', 0.6);
      }
    },
    // A cluster of crystal spires.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.4, u * 0.9, 'rgba(150,225,255,0.24)');
      P.poly([[x - u * 0.1, y], [x - u * 0.32, y], [x - u * 0.16, y - u * 0.9]], '#9fd8e6', 'rgba(30,70,100,0.5)', 0.6);
      P.poly([[x + u * 0.05, y], [x + u * 0.3, y], [x + u * 0.2, y - u * 1.1]], '#cbe6f0', 'rgba(30,70,100,0.5)', 0.6);
      P.poly([[x - u * 0.05, y], [x + u * 0.12, y], [x + u * 0.04, y - u * 0.7]], '#bfe0ea', 'rgba(30,70,100,0.5)', 0.6);
    },
    // A floating prism casting rainbow rays.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.6, u * 0.9, 'rgba(180,235,255,0.3)');
      P.poly([[x, y - u * 1.1], [x + u * 0.28, y - u * 0.55], [x, y - u * 0.2], [x - u * 0.28, y - u * 0.55]], '#cbe6f0', 'rgba(40,90,120,0.5)', 0.7);
      P.line(x - u * 0.5, y - u * 0.55, x + u * 0.5, y - u * 0.55, 'rgba(255,150,190,0.4)', 0.6);
      P.line(x - u * 0.45, y - u * 0.4, x + u * 0.45, y - u * 0.7, 'rgba(150,240,192,0.4)', 0.6);
    },
  ],
  tempest: [
    // A three-blade wind turbine.
    (x, y, u, P) => {
      P.line(x, y, x, y - u * 1.0, '#c8ccd8', 1.6);
      const a0 = P.h(0) * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k / 3) * Math.PI * 2;
        P.poly([[x, y - u * 1.0], [x + Math.cos(a) * u * 0.7, y - u * 1.0 + Math.sin(a) * u * 0.7], [x + Math.cos(a + 0.28) * u * 0.5, y - u * 1.0 + Math.sin(a + 0.28) * u * 0.5]], '#e6eaf2', 'rgba(120,130,150,0.5)', 0.5);
      }
      P.circle(x, y - u * 1.0, u * 0.1, '#9aa0b0');
    },
    // A weather vane.
    (x, y, u, P) => {
      P.line(x, y, x, y - u * 1.0, '#8a6a3a', 1.4);
      P.line(x - u * 0.4, y - u * 0.85, x + u * 0.4, y - u * 0.85, '#c8ccd8', 1);
      P.line(x, y - u * 0.6, x, y - u * 1.12, '#c8ccd8', 1);
      P.poly([[x + u * 0.5, y - u * 1.06], [x + u * 0.18, y - u * 1.16], [x + u * 0.18, y - u * 0.96]], '#ffe14a');
    },
    // A lightning-blasted lone tree.
    (x, y, u, P) => {
      P.line(x, y, x, y - u * 1.0, '#2a2420', 2);
      P.line(x, y - u * 0.6, x - u * 0.4, y - u * 0.95, '#2a2420', 1.4);
      P.line(x, y - u * 0.75, x + u * 0.35, y - u * 1.05, '#2a2420', 1.2);
      P.line(x - u * 0.2, y - u * 1.4, x, y - u * 1.0, 'rgba(255,240,180,0.7)', 1.2);
      P.line(x, y - u * 1.0, x - u * 0.1, y - u * 0.85, 'rgba(255,240,180,0.5)', 1);
    },
  ],
  fungal: [
    // A toadstool cottage.
    (x, y, u, P) => {
      P.glow(x, y - u * 0.5, u * 0.9, 'rgba(122,240,192,0.16)');
      P.poly([[x - u * 0.28, y], [x + u * 0.28, y], [x + u * 0.22, y - u * 0.55], [x - u * 0.22, y - u * 0.55]], '#e8e0cf', 'rgba(120,110,90,0.5)', 0.6);
      P.poly([[x - u * 0.7, y - u * 0.5], [x - u * 0.5, y - u * 0.9], [x, y - u * 1.05], [x + u * 0.5, y - u * 0.9], [x + u * 0.7, y - u * 0.5]], '#d23b3b', 'rgba(90,20,20,0.5)', 0.6);
      P.circle(x - u * 0.25, y - u * 0.72, u * 0.1, '#f6efe0');
      P.circle(x + u * 0.2, y - u * 0.82, u * 0.08, '#f6efe0');
      P.circle(x + u * 0.02, y - u * 0.62, u * 0.07, '#f6efe0');
      P.poly([[x - u * 0.12, y], [x - u * 0.12, y - u * 0.3], [x, y - u * 0.4], [x + u * 0.12, y - u * 0.3], [x + u * 0.12, y]], '#4a2f1a');
    },
    // A fairy ring of little glowing mushrooms.
    (x, y, u, P) => {
      P.glow(x, y, u * 1.0, 'rgba(122,240,192,0.14)');
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const mx = x + Math.cos(a) * u * 0.8;
        const my = y + Math.sin(a) * u * 0.4;
        P.line(mx, my, mx, my - u * 0.16, '#e8e0cf', 1);
        P.circle(mx, my - u * 0.19, u * 0.08, k % 2 ? '#7af0c0' : '#d23b3b');
      }
    },
    // A giant garden snail.
    (x, y, u, P) => {
      P.poly([[x - u * 0.5, y], [x + u * 0.5, y], [x + u * 0.55, y - u * 0.1], [x + u * 0.2, y - u * 0.14], [x - u * 0.4, y - u * 0.06]], '#b6d68a');
      P.circle(x - u * 0.05, y - u * 0.25, u * 0.4, '#c88a4a', 'rgba(90,55,20,0.6)', 0.8);
      P.circle(x - u * 0.05, y - u * 0.25, u * 0.22, 'none', 'rgba(90,55,20,0.5)', 0.8);
      P.line(x + u * 0.45, y - u * 0.1, x + u * 0.6, y - u * 0.4, '#b6d68a', 1);
      P.circle(x + u * 0.6, y - u * 0.42, u * 0.05, '#2a3a2a');
    },
  ],
  ocean: [
    // A beach umbrella pitched over a striped towel.
    (x, y, u, P) => {
      P.poly([[x - u * 0.9, y + u * 0.1], [x - u * 0.1, y + u * 0.02], [x, y + u * 0.5], [x - u * 0.85, y + u * 0.6]], '#3fb0e0', 'rgba(20,60,90,0.4)', 0.5);
      P.line(x - u * 0.72, y + u * 0.06, x - u * 0.58, y + u * 0.54, 'rgba(255,255,255,0.5)', 0.6);
      P.line(x - u * 0.42, y + u * 0.02, x - u * 0.3, y + u * 0.52, 'rgba(255,255,255,0.5)', 0.6);
      P.line(x + u * 0.35, y, x + u * 0.2, y - u * 1.0, '#8a6a4a', 1.2);
      P.poly([[x + u * 0.2, y - u * 1.0], [x - u * 0.35, y - u * 0.55], [x + u * 0.75, y - u * 0.55]], '#ff5a3c');
      P.poly([[x + u * 0.2, y - u * 1.0], [x - u * 0.02, y - u * 0.62], [x + u * 0.42, y - u * 0.62]], 'rgba(255,255,255,0.85)');
    },
    // A turreted sandcastle with a pennant.
    (x, y, u, P) => {
      P.poly([[x - u * 0.7, y], [x + u * 0.7, y], [x + u * 0.6, y - u * 0.4], [x - u * 0.6, y - u * 0.4]], '#d8b878', 'rgba(120,90,45,0.5)', 0.6);
      P.poly([[x - u * 0.55, y - u * 0.4], [x - u * 0.2, y - u * 0.4], [x - u * 0.2, y - u * 0.85], [x - u * 0.55, y - u * 0.85]], '#e2c688');
      P.poly([[x + u * 0.2, y - u * 0.4], [x + u * 0.55, y - u * 0.4], [x + u * 0.55, y - u * 0.85], [x + u * 0.2, y - u * 0.85]], '#e2c688');
      P.poly([[x - u * 0.15, y - u * 0.4], [x + u * 0.15, y - u * 0.4], [x + u * 0.15, y - u * 1.0], [x - u * 0.15, y - u * 1.0]], '#e2c688');
      P.line(x, y - u * 1.0, x, y - u * 1.35, '#a9722f', 1);
      P.poly([[x, y - u * 1.35], [x + u * 0.3, y - u * 1.28], [x, y - u * 1.2]], '#ff3b3b');
    },
    // A beach ball.
    (x, y, u, P) => {
      const cy = y - u * 0.4;
      const r = u * 0.45;
      P.circle(x, cy, r, '#f6f6f6', 'rgba(120,120,120,0.4)', 0.5);
      const wedge = (a0: number, a1: number, col: string) =>
        P.poly([[x, cy], [x + Math.cos(a0) * r, cy + Math.sin(a0) * r], [x + Math.cos(a1) * r, cy + Math.sin(a1) * r]], col);
      wedge(-0.6, 0.2, '#ff5a3c');
      wedge(2.0, 2.8, '#3fb0e0');
      wedge(3.3, 4.1, '#f4e04a');
    },
    // A starfish among a couple of seashells.
    (x, y, u, P) => {
      const star: Vec[] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        const rr = (k % 2 ? 0.2 : 0.5) * u;
        star.push([x + Math.cos(a) * rr, y - u * 0.1 + Math.sin(a) * rr * 0.85]);
      }
      P.poly(star, '#ff8a4a', 'rgba(150,70,20,0.5)', 0.6);
      P.circle(x - u * 0.62, y + u * 0.16, u * 0.16, '#f6e6d0', 'rgba(150,120,90,0.5)', 0.5);
      P.circle(x + u * 0.58, y + u * 0.06, u * 0.12, '#f0d8e0', 'rgba(150,90,110,0.5)', 0.5);
    },
    // A surfboard stuck upright in the sand.
    (x, y, u, P) => {
      const ang = -1.15;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const tx = x + dx * u * 1.5;
      const ty = y + dy * u * 1.5;
      const nx = -dy;
      const ny = dx;
      const w = u * 0.24;
      P.poly([[x + nx * w * 0.3, y + ny * w * 0.3], [x + dx * u * 0.75 + nx * w, y + dy * u * 0.75 + ny * w], [tx, ty], [x + dx * u * 0.75 - nx * w, y + dy * u * 0.75 - ny * w], [x - nx * w * 0.3, y - ny * w * 0.3]], '#ffd24a', 'rgba(120,90,20,0.5)', 0.6);
      P.line(x, y, tx, ty, '#e05a2a', 1);
    },
  ],
};

/**
 * The Easter-egg pass: scatter a few of the world's whimsical props across the LAND-HULL bbox,
 * keeping each on real ground and OFF the corridor (the `eggOk` predicate). Determinism / camera
 * rules per the EGGS contract above — dedicated stream, course-space rejection, fixed prim count
 * per painter, unconditional push. Sized ~3.6 yd (clamped px) so a prop reads at both zooms.
 */
export function easterEggs(
  arch: BiomeArchetype,
  landBoxCourse: Vec[],
  eggOk: (p: Vec) => boolean,
  proj: Projector,
  base: number,
  rng: () => number,
): Prim[] {
  const painters = EGGS[arch];
  if (!painters || !painters.length) return [];
  const out: Prim[] = [];
  const lb = bboxOf(landBoxCourse);
  const spanX = lb.maxX - lb.minX || 1;
  const spanY = lb.maxY - lb.minY || 1;
  const want = base + Math.floor(rng() * 2);
  for (let n = 0, placed = 0; n < want * 18 && placed < want; n++) {
    const c: Vec = [lb.minX + spanX * rng(), lb.minY + spanY * rng()];
    const pick = Math.floor(rng() * painters.length) % painters.length;
    if (!eggOk(c)) continue; // reject in COURSE space only → the placed count is camera-stable
    placed++;
    const s = proj.project(c);
    const u = Math.max(15, Math.min(36, 4.8 * proj.scale)); // ~4.8-yd prop, clamped so it reads zoomed-out AND in play
    const pen: EggPen = {
      circle: (cx, cy, r, fill, stroke, sw) => out.push({ t: 'circle', c: [cx, cy], r, fill, stroke, sw }),
      line: (ax, ay, bx, by, stroke, sw = 1) => out.push({ t: 'line', a: [ax, ay], b: [bx, by], stroke, sw, round: true }),
      poly: (pts, fill, stroke, sw) => out.push({ t: 'poly', pts, fill, stroke, sw }),
      glow: (cx, cy, r, col) => out.push({ t: 'glow', c: [cx, cy], r, col }),
      h: (k) => posHash(c[0], c[1], k),
    };
    painters[pick]!(s[0], s[1], u, pen);
  }
  return out;
}
