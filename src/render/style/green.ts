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
  type Box,
  centroidOf,
  bboxOf,
  hexAlpha,
  mowPattern,
  turfPx,
  turfApron,
  LIGHT_UL,
} from './shared';

/**
 * Per-world GREEN COMPLEX identity (GS-green-complex). The putting surface used to be DRESSED
 * identically on every world — one two-ring apron at a fixed pixel width, and an always-horizontal
 * six-band mow — so however distinct the generator made the green's SHAPE, every world's green read
 * as the same pale blob dropped on the corridor ("most of the green areas still look very similar").
 * A world now declares how its green complex is presented; content-as-data, so a new world is a ROW,
 * never an engine edit. Every field is a width/pitch — the mow PATTERN comes from the world's own
 * fairway grain (`mowPattern`), so the green is groomed by the same greenkeeper as its corridor.
 */
export interface GreenComplexLook {
  /** Mown apron width around the green, in COURSE YARDS (scale-honest via `turfPx`) — the outer band
   *  of the surround, tinted toward the world's collar tone over WHATEVER the green meets there
   *  (approach fairway in front, rough behind) and fading to nothing at its outer edge. */
  apronYd: number;
  /** The COLLAR: the narrow ring of fairway-height grass the surface is cut down out of, in course
   *  yards. Deliberately much narrower than the apron — a collar is a band you can identify, not a
   *  gradient. Widen it and the green stops reading as a green (the first GS-green-complex preview:
   *  every world's putting surface dissolved into its corridor, which is a fairness bug — an arcade
   *  golf hole must stay readable however smoothly it blends). */
  collarYd: number;
  /** Mow bands across the green — a finer cut than the corridor's, varying per world. */
  mowBands: number;
}
/** Tuned per world's character: a links/desert green runs out into a broad tight-mown apron, a lush
 *  jungle or swamp green is ringed by a narrow abrupt collar, an ice shelf keeps a wide frozen skirt.
 *  GS-green-apron-blend pulled the apron widths in by roughly a third: the band is now a translucent
 *  skirt drawn over the ground rather than an opaque slab, and the BROAD run-off it used to imitate
 *  is the generator's own fairway FLARE — a real, playable feature. Two art passes describing the
 *  same eleven yards of approach is what made the hole-end read as stacked stickers. */
const GREEN_COMPLEX: Record<BiomeArchetype, GreenComplexLook> = {
  verdant: { apronYd: 5, collarYd: 2.4, mowBands: 6 },
  desert: { apronYd: 6.5, collarYd: 3.4, mowBands: 5 }, // firm run-offs — you can putt from off the surface
  frost: { apronYd: 6, collarYd: 3, mowBands: 7 }, // a broad frozen skirt around the shelf
  inferno: { apronYd: 3.5, collarYd: 1.8, mowBands: 5 }, // scorched ground gives up quickly at the edge
  void: { apronYd: 5.5, collarYd: 2.8, mowBands: 6 }, // GS-cetus-void-deep: the tightest complexes in the game sat on the two worlds whose green is hardest to FIND — a surface with no complex around it reads smaller than it is
  crystal: { apronYd: 4, collarYd: 2, mowBands: 8 }, // finely faceted
  tempest: { apronYd: 5.5, collarYd: 2.6, mowBands: 6 },
  fungal: { apronYd: 3, collarYd: 1.6, mowBands: 7 }, // the jungle crowds right up to the surface
  ocean: { apronYd: 6, collarYd: 3.2, mowBands: 6 }, // seaside links run-offs
  cetus: { apronYd: 5.5, collarYd: 2.8, mowBands: 6 }, // GS-cetus-void-deep, as void above
  swamp: { apronYd: 3, collarYd: 1.6, mowBands: 5 }, // the mire closes in
  metal: { apronYd: 4, collarYd: 2, mowBands: 5 },
  derelict: { apronYd: 3.5, collarYd: 1.8, mowBands: 5 },
  asgard: { apronYd: 5.5, collarYd: 2.8, mowBands: 7 },
  earth: { apronYd: 7, collarYd: 3.6, mowBands: 6 }, // the widest run-offs — a real links green complex
};
/** The green-complex look for a world — one description of how wide this world's green complex runs,
 *  read by `styleGreenSurround` for both of its bands and by the guard that pins full row coverage. */
export function greenComplexFor(arch: BiomeArchetype): GreenComplexLook {
  return GREEN_COMPLEX[arch];
}

/**
 * The green's OUTWARD surround — the ONE description of how this world's putting surface meets the
 * ground around it (GS-green-apron-blend).
 *
 * It used to be two unrelated passes. An OPAQUE ramp (`turfRamp`, green-collar → half-rough) drawn
 * UNDER the fairway, plus a separate tinted collar drawn ON TOP of it — which meant the surround was
 * hidden wherever the fairway flare wrapped the green and showed only where it did not. Measured on a
 * fourteen-world preview, that is a one-sided CRESCENT: never a ring, always a lump of a third colour
 * sitting behind the green (0.54% of the frame's pixels, but at up to 189/765 of contrast — a small,
 * loud, lopsided object). On a world whose ground is not green it read as a smear of somebody else's
 * turf dropped on the sand. That is the "green aprons look bad, especially in a non-green biome"
 * report, and it is the opposite of what an apron is for.
 *
 * Now it is one skirt, drawn ON TOP of every turf pass and UNDER the putting surface, so it rings the
 * green whatever it happens to meet — approach fairway in front, rough behind, both on the same hole.
 * Two translucent bands walk one continuous colour path outward from the surface:
 *   ground → apron (toward the world's COLLAR tone) → collar (toward the GREEN's own turf) → green.
 * Both fade to nothing at their outer edge (`turfApron`), so neither band has a silhouette of its own
 * and the ground's cover/relief/texture read straight through — the surround is ground MOWN DOWN,
 * not turf painted on. Uniform-width offsets (not centroid scales) so a long ice-shelf or kidney green
 * keeps an even skirt, at a tight miter so a star green's notches can't spike it.
 */
export function styleGreenSurround(
  poly: Vec[],
  collar: string,
  greenBase: string,
  arch: BiomeArchetype,
  scale = 1,
): Prim[] {
  const look = greenComplexFor(arch);
  return [
    ...turfApron(poly, turfPx(scale, look.apronYd), collar, APRON_ALPHA, APRON_STEPS),
    ...turfApron(poly, turfPx(scale, look.collarYd), greenBase, COLLAR_ALPHA, COLLAR_STEPS),
  ];
}
/** Steps each surround band is walked in — enough that no single alpha step reads as a ring. */
const APRON_STEPS = 8;
const COLLAR_STEPS = 4;
/** Peak tint at the green's edge. The apron is deliberately the weaker of the two: it covers the most
 *  ground and must never build into an opaque halo, while the collar is the narrow band that keeps the
 *  surface READABLE (a green that dissolves into its corridor is a fairness bug, not a blend win). */
const APRON_ALPHA = 0.2;
const COLLAR_ALPHA = 0.3;
/** The green's own outline (GS-green-apron-blend). It was 0.5 back when the outline WAS the whole
 *  transition — a hard cartoon line was the only thing separating a bright surface from whatever it
 *  had been dropped on. With a graded skirt underneath it, the line only has to DEFINE the shape, and
 *  at 0.5 it re-read as a sticker's die-cut. Softened, not deleted: an arcade golf hole whose green
 *  you cannot pick out at a glance is a fairness bug, whatever it does for the blend. */
const GREEN_INK_ALPHA = 0.34;

export function styleGreen(
  poly: Vec[],
  art: ArtFeel,
  s: Shade,
  arch: BiomeArchetype,
  slope?: GreenSlopeArt,
  mowGrid?: Box,
  scale = 1,
): Prim[] {
  const c = centroidOf(poly);
  // The outward skirt that eases the green into the ground around it is drawn separately
  // (styleGreenSurround), over the turf and under this pass. styleGreen starts at the surface itself.
  const out: Prim[] = [{ t: 'poly', pts: poly, fill: s.base }];
  // Softened like the fairway's mowTones (GS-mow-blend) — the green used to stripe at FULL
  // light/dark contrast, the harshest cut on the map. A touch stronger than the fairway's blend
  // (the green is the small showpiece surface), dark muted below light. The wide-value indigo/cyan
  // worlds (void/cetus) mute further so their green doesn't band like the fairway used to
  // (GS-cetus-blend) — their palettes carry a big light↔dark spread that a 0.7/0.5 cut over-shouts.
  const softGreen = arch === 'void' || arch === 'cetus';
  // Green SLOPE (GS-greens-3): shade the LOW side darker + the HIGH side lighter and lay fall-line
  // arrows pointing downhill, so the tilt reads at a glance (the graphic IS the slope the sim rolls
  // on). `slope.dir` is the screen-space DOWNHILL unit; `mag` 0..~0.7 its steepness.
  // A green counts as CONTOURED (draws the full relief map) when it has topo ISOLINES — present on
  // EVERY sculpted green (the generator gives every green ≥1 contour lobe on its own side stream, and
  // contourIsolines floors at 3 rings for any amplitude). It used to gate on the fall-line ARROWS,
  // which are only emitted for cells steeper than 0.06 — so a GENTLE green (low-greenSlopeMax worlds
  // like frost/ocean at a calm stop) had zero arrows and fell through to the flat legacy look, i.e.
  // "not all biomes got contour overlays". Isolines exist there, so the relief now renders on all of
  // them; the chevron field still correctly stays OFF near-flat crests (GS-green-contour-allbiomes).
  const contoured = !!((slope?.iso && slope.iso.length > 0) || (slope?.arrows && slope.arrows.length > 0));
  // A CONTOURED green mutes its mow stripe hard (S+ round 2): the full-contrast bands fought the
  // relief art — gradient, rings and arrows all read against striped noise (the frost screenshot).
  // The stripe stays as a whisper of turf texture; the relief owns the value range now.
  const gb = bboxOf(poly);
  if (art.stripes) {
    const lm = contoured ? 0.26 : softGreen ? 0.52 : 0.7;
    const dm = contoured ? 0.18 : softGreen ? 0.36 : 0.5;
    // GS-green-complex: the green is mown in its OWN WORLD'S GRAIN, on the corridor's band grid — the
    // same `mowPattern` dispatch the fairway uses, just at a finer per-world pitch. The green used to
    // stripe horizontally on every world regardless of how its fairway was groomed, so a swept-grain
    // frost corridor or a cross-mown jungle corridor met a horizontally-striped green at a hard seam
    // and the two read as different materials butted together. Phasing off the CORRIDOR's box (when
    // the scene builder passes one) makes the two cuts share one grid, so the mow lines carry through
    // the apron instead of jumping phase at the collar.
    const bands = greenComplexFor(arch).mowBands;
    const grid = mowGrid ?? gb;
    const pitch = arch === 'frost' ? (gb.maxX - gb.minX) / bands : (gb.maxY - gb.minY) / bands;
    out.push(mowPattern(poly, mixHex(s.base, s.light, lm), mixHex(s.base, s.dark, dm), grid, arch, Math.max(1, pitch)));
  }
  // GS-green-complex: the surface's OWN outer edge, eased INWARD — a clipped stroke toned from the
  // putting green toward its collar cut, so the boundary reads as the last mown pass rather than a
  // cut-out laid on the corridor. Strokes, not a deep inset (the GS-fairway-2 lesson: an inset larger
  // than a shelf green's local half-width folds); scale-honest, so the ease is the same band of
  // ground at map and putt zoom alike. It also DEFINES the green — the transition has to soften the
  // step without dissolving the shape, or the hole stops being readable.
  const edgeCol = mixHex(s.base, s.dark, 0.4);
  out.push({
    t: 'clip',
    clip: poly,
    children: [
      { t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(edgeCol, 0.26), sw: turfPx(scale, 2.4) },
      { t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(edgeCol, 0.2), sw: turfPx(scale, 1) },
    ],
  });
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
      // GS-green-contour-3: the washes are BIOME-DERIVED, not fixed white/near-black rgba — a
      // neutral grey ramp greyed-out the pale frost/crystal palettes ("washed" was the review
      // word) and sat dead on the warm desert olive. Sinking toward the world's own dark turf and
      // lifting toward its own light keeps the ramp inside the biome's colour family.
      const sinkCol = mixHex(s.dark, '#061018', 0.55);
      const liftCol = mixHex(s.light, '#ffffff', 0.72);
      for (const [i, off] of [0.05, 0.2, 0.36, 0.52].entries()) {
        bands.push(halfPlane(span * off, 1, hexAlpha(sinkCol, aBase * (0.14 + i * 0.03)))); // low side sinks
        bands.push(halfPlane(span * off, -1, hexAlpha(liftCol, aBase * (0.13 + i * 0.03)))); // high side lifts
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
      // GS-green-contour-3: the sculpted green is FOUR layers, all in the biome's own turf family —
      //  1. TERRACES: closed topo rings fill as stacked elevation washes (dome caps lift toward the
      //     world's light turf, hollow floors sink toward its dark) — nesting rings stack alpha, so
      //     the relief steps up like a real terraced topo map instead of one flat value.
      //  2. RELIEF: each lobe's directional glow pair under the shared upper-left sun (emboss rule),
      //     tinted from the biome Shade — never neutral white/black (the "grey stain" lesson).
      //  3. ILLUMINATED ISOLINES (Tanaka): each ring strokes in fixed chunks lit by their local
      //     aspect — sun-facing spans brighten, shaded spans darken and thicken — so the rings read
      //     as carved ground, not uniform hairlines that vanish on pale worlds.
      //  4. The LOCAL fall-line arrow field, contrast-picked against the turf (dark ink arrows on
      //     pale frost/crystal greens — white-on-white was invisible, the review's first finding).
      const soft = softGreen ? 0.72 : 1;
      const hiCol = mixHex(s.light, '#ffffff', 0.88);
      const loCol = mixHex(s.dark, '#081018', 0.55);
      if (slope.iso && slope.iso.length) {
        const terraces: Prim[] = [];
        // Big fills first so nested caps stack their washes (order by projected area — the single
        // uniform projector scale keeps that ordering identical on every frame).
        const closed = slope.iso.filter((r) => r.closed && r.pts.length > 3);
        const areaOf = (pts: Vec[]): number => {
          let a2 = 0;
          for (let i = 0; i + 1 < pts.length; i++) a2 += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
          return Math.abs(a2) / 2;
        };
        for (const ring of [...closed].sort((a, b) => areaOf(b.pts) - areaOf(a.pts))) {
          const w = Math.abs(ring.frac * 2 - 1); // stronger toward crest/valley
          const col = ring.hiInside
            ? hexAlpha(hiCol, (0.08 + 0.09 * w) * soft)
            : hexAlpha(loCol, (0.07 + 0.08 * w) * soft);
          terraces.push({ t: 'poly', pts: ring.pts, fill: col });
        }
        if (terraces.length) out.push({ t: 'clip', clip: poly, children: terraces });
      }
      const relief: Prim[] = [];
      const reliefLit = mixHex(s.light, '#ffffff', 0.75);
      const reliefShade = mixHex(s.dark, '#04101c', 0.6);
      for (const lb of slope.lobes ?? []) {
        const r = Math.max(3, lb.rPx);
        const st = Math.min(1, Math.abs(lb.h));
        const off = r * 0.36;
        const side = lb.h > 0 ? 1 : -1; // mound lit toward the sun; hollow lit on the far (down-light) wall
        // Toned down (S+ round 2): the relief is an accent under the rings + fall-line gradient
        // now, not the main event — stronger glows pooled into the plane wash and read as stains.
        const litA = Math.min(0.2, 0.07 + st * 0.18) * soft;
        const shA = Math.min(0.21, 0.07 + st * 0.19) * soft;
        relief.push(
          { t: 'glow', c: [lb.c[0] + LIGHT_UL[0] * off * side, lb.c[1] + LIGHT_UL[1] * off * side], r: r * 1.15, col: hexAlpha(reliefLit, litA) },
          { t: 'glow', c: [lb.c[0] - LIGHT_UL[0] * off * side, lb.c[1] - LIGHT_UL[1] * off * side], r: r * 1.08, col: hexAlpha(reliefShade, shA) },
        );
      }
      if (relief.length) out.push({ t: 'clip', clip: poly, children: relief });
      if (slope.iso && slope.iso.length) {
        // Illuminated elevation rings: the base colour still codes elevation in the biome's own
        // turf tones (light above the mid elevation, dark below — the light side pushed harder,
        // the first preview's lesson), and each fixed chunk now modulates by its ASPECT under the
        // shared sun: lit spans ease further toward white and thin, shaded spans deepen and
        // thicken (the Tanaka rule) — which is what makes a ring read as a carved lip instead of
        // a scratch. Chunk counts come from the cached course-space rings (camera-proof); only
        // colours read the projection, per the camera contract.
        const rings: Prim[] = [];
        for (const ring of slope.iso) {
          if (ring.pts.length < 2) continue;
          const d = ring.frac * 2 - 1; // −1 valley … +1 crest
          const w = Math.abs(d);
          const baseCol = d >= 0 ? hiCol : loCol;
          const baseA = (d >= 0 ? 0.24 + 0.34 * w : 0.21 + 0.28 * w) * soft;
          for (const ch of ring.chunks) {
            if (ch.pts.length < 2) continue;
            const lit = Math.max(-1, Math.min(1, ch.lit));
            const col = lit >= 0 ? mixHex(baseCol, '#ffffff', lit * 0.55) : mixHex(baseCol, '#040c16', -lit * 0.5);
            const a = Math.min(0.85, baseA * (1 + Math.abs(lit) * 0.55));
            const sw = lit < 0 ? 1.15 + -lit * 0.75 : Math.max(0.85, 1.15 - lit * 0.25);
            rings.push({ t: 'path', pts: ch.pts, stroke: hexAlpha(col, a), sw, round: true });
          }
        }
        if (rings.length) out.push({ t: 'clip', clip: poly, children: rings });
      }
      const arrows: Prim[] = [];
      // Px-capped sizes off the projected span (the GS-putt-feel lesson): legible glyphs at putt
      // zoom, a subtle stipple at map zoom — the caps never let them balloon into bold bars.
      const len = Math.max(3.5, Math.min(11, span * 0.08));
      const head = Math.max(1.6, len * 0.28);
      // Contrast-picked arrow ink: on a PALE green (frost/crystal/ice) white arrows disappeared —
      // read the turf's luminance and flip to the world's dark ink instead.
      const paleTurf = lumOf(s.base) > 0.62;
      const arrowCol = paleTurf ? mixHex(s.ink, '#04101c', 0.35) : mixHex(s.light, '#ffffff', 0.9);
      for (const ar of slope.arrows!) {
        const col = hexAlpha(arrowCol, 0.3 + Math.min(0.2, ar.mag * 0.32));
        const perp: Vec = [-ar.dir[1], ar.dir[0]];
        const base: Vec = [ar.p[0] - ar.dir[0] * len * 0.5, ar.p[1] - ar.dir[1] * len * 0.5];
        const tip: Vec = [ar.p[0] + ar.dir[0] * len * 0.5, ar.p[1] + ar.dir[1] * len * 0.5];
        arrows.push({ t: 'line', a: base, b: tip, stroke: col, sw: 1.05, round: true });
        arrows.push({ t: 'line', a: tip, b: [tip[0] - ar.dir[0] * head + perp[0] * (head * 0.7), tip[1] - ar.dir[1] * head + perp[1] * (head * 0.7)], stroke: col, sw: 1.05, round: true });
        arrows.push({ t: 'line', a: tip, b: [tip[0] - ar.dir[0] * head - perp[0] * (head * 0.7), tip[1] - ar.dir[1] * head - perp[1] * (head * 0.7)], stroke: col, sw: 1.05, round: true });
      }
      out.push({ t: 'clip', clip: poly, children: arrows });
      if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, GREEN_INK_ALPHA), sw: 1.1 }); // GS-green-apron-blend: the skirt carries the transition, so the outline only has to DEFINE
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
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, GREEN_INK_ALPHA), sw: 1.1 }); // GS-green-apron-blend: the skirt carries the transition, so the outline only has to DEFINE
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
   *  green-reading-book rings colour-code high ground light and low ground dark.
   *  GS-green-contour-3 adds the TERRACE + ILLUMINATION data: `closed`/`hiInside` mark fillable
   *  dome caps and hollow floors, and `chunks` splits each ring into fixed spans (count read only
   *  from the cached course-space point count — camera-proof) carrying the screen-space lighting
   *  of their midpoint under the shared upper-left sun (−1 shadowed … +1 lit), so the rings shade
   *  like sculpted ground (Tanaka-style illuminated contours), not uniform hairlines. */
  iso?: {
    pts: Vec[];
    frac: number;
    closed: boolean;
    hiInside?: boolean;
    chunks: { pts: Vec[]; lit: number }[];
  }[];
}

/** Relative luminance (0..1) of a `#rrggbb` colour — picks arrow ink against pale vs dark turf
 *  (GS-green-contour-3). Non-hex input reads as mid (0.5). */
function lumOf(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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
  // Illuminated-contour chunks (GS-green-contour-3): split each cached course-space ring into fixed
  // spans of ISO_CHUNK_SEGS segments — chunk COUNT reads only the cached point count, so it is
  // camera-proof by construction — and light each span by its midpoint's slope: uphill facing the
  // shared upper-left sun reads lit, the far side shadowed, scaled by local steepness so near-flat
  // ground stays neutral. Lighting reads the projection (screen-space, like every emboss), which the
  // camera contract allows for colours/sizes; counts never do.
  const ISO_CHUNK_SEGS = 7;
  const iso = greenIsolinesCourse(hole, greenPolyCourse).map((line) => {
    const ptsPx = line.pts.map((p) => proj.project(p));
    const chunks: { pts: Vec[]; lit: number }[] = [];
    for (let i = 0; i + 1 < line.pts.length; i += ISO_CHUNK_SEGS) {
      const end = Math.min(i + ISO_CHUNK_SEGS, line.pts.length - 1);
      const midC = line.pts[Math.min(line.pts.length - 1, Math.floor((i + end) / 2))]!;
      const sl = greenSlopeAt(midC, hole.greenSlope, lobes);
      const m = Math.hypot(sl[0], sl[1]);
      let lit = 0;
      if (m > 1e-6) {
        const a = proj.project(midC);
        const b = proj.project([midC[0] - sl[0] / m, midC[1] - sl[1] / m]); // one yard UPHILL
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l = Math.hypot(dx, dy) || 1;
        lit = ((dx / l) * LIGHT_UL[0] + (dy / l) * LIGHT_UL[1]) * Math.min(1, m / 0.5);
      }
      chunks.push({ pts: ptsPx.slice(i, end + 1), lit });
    }
    return { pts: ptsPx, frac: line.frac, closed: line.closed, hiInside: line.hiInside, chunks };
  });
  return { ...plane, arrows, lobes: lobArt, iso };
}
