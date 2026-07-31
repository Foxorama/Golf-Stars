/**
 * Fairway + tee painters (GS-style-split): the grouped fairway pass with its per-world mowing
 * patterns (GS-variety-2), the first-cut collar/sheen (GS-fairway), the tee pad, and the Rainbow
 * Road ribbon (GS-rainbow). All pure geometry — zero rng.
 */

import { dist, pointInPoly, type Vec } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import { mixHex, type Shade } from '../palette';
import {
  type Prim,
  type ArtFeel,
  type Box,
  bboxOf,
  offsetPoly,
  shiftPoly,
  hexAlpha,
  LIGHT_UL,
  mowPattern,
  turfPx,
} from './shared';

/** The mown FIRST CUT around a corridor, in COURSE YARDS (GS-green-complex) — the band of taller,
 *  rough-toned grass a fairway is mown down out of. Sized in yards (not the old fixed 6px) so the cut
 *  is the same width of ground at the whole-hole map and at the chip camera alike; ~6 yards matches
 *  what the old 6px read as at map zoom, so the map look is essentially unchanged. */
const FIRST_CUT_YD = 6;
/** How many even tone steps the first cut is walked in — enough that no single jump reads as a ring. */
const FIRST_CUT_STEPS = 6;
/** The single fringe ring the non-grounded worlds (void/cetus) keep, in course yards. */
const FRINGE_YD = 3;

/** The Rainbow Road colour cycle (GS-rainbow) — a vivid 7-band rainbow the ribbon mows through. */
const RAINBOW_BANDS = ['#ff3b5c', '#ff9a3d', '#ffe23d', '#49e06b', '#3bd1ff', '#5a6bff', '#c46bff'];

/**
 * A rainbow-road ribbon (GS-rainbow): fill a play surface (fairway/green/tee) with bright rainbow
 * bands clipped to its polygon — perpendicular-to-play after the projector rotates tee→green up, so
 * the bands read like a prismatic sky-track — then cap it with a glowing white rail. Pure
 * geometry (no rng); `phaseY`/`bandH` let several fairway pieces share one continuous band grid.
 *
 * GS-rainbow-polish: the flat poster bands used to read "pretty rough" — so each band is now GROOVED
 * (a lit top edge + a shaded bottom edge, so it reads as a raised ridge of track, not a printed
 * stripe), the whole surface takes a directional CROWN SHEEN (a soft up-light wash, the same
 * `LIGHT_UL` the fairways use) and an inner EDGE SHADE that darkens toward the rails so the road
 * reads as a crowned, glowing surface with depth. Still all pure geometry, zero rng.
 */
export function rainbowRibbon(poly: Vec[], phaseY: number, bandH: number): Prim[] {
  const b = bboxOf(poly);
  const bandOf = (i: number) =>
    RAINBOW_BANDS[((i % RAINBOW_BANDS.length) + RAINBOW_BANDS.length) % RAINBOW_BANDS.length]!;
  const children: Prim[] = [];
  const i0 = Math.floor((b.minY - phaseY) / bandH);
  for (let i = i0; phaseY + i * bandH < b.maxY; i++) {
    const y0 = phaseY + i * bandH;
    const y1 = y0 + bandH + 0.6; // overlap a hair so no seam shows
    const col = bandOf(i);
    children.push({
      t: 'poly',
      pts: [[b.minX, y0], [b.maxX, y0], [b.maxX, y1], [b.minX, y1]],
      fill: col,
    });
    // GROOVE the band: a thin lit lip along its top, a thin shade along its bottom, so adjacent
    // colours meet on a soft ridge instead of a hard poster seam (the "no shading" read).
    const lip = Math.max(0.8, bandH * 0.16);
    children.push({ t: 'poly', pts: [[b.minX, y0], [b.maxX, y0], [b.maxX, y0 + lip], [b.minX, y0 + lip]], fill: hexAlpha(mixHex(col, '#ffffff', 0.55), 0.5) });
    children.push({ t: 'poly', pts: [[b.minX, y1 - lip], [b.maxX, y1 - lip], [b.maxX, y1], [b.minX, y1]], fill: 'rgba(6,4,18,0.28)' });
  }
  // A directional crown sheen (the shared up-light), pooled to the up-light side so the road reads
  // as a raised crowned surface catching the starlight — two soft washes so it grades in, not a line.
  const lit1 = shiftPoly(offsetPoly(poly, 2.5), LIGHT_UL[0] * 3, LIGHT_UL[1] * 3);
  const lit2 = shiftPoly(offsetPoly(poly, 5.5), LIGHT_UL[0] * 6, LIGHT_UL[1] * 6);
  children.push({ t: 'poly', pts: lit1, fill: 'rgba(255,255,255,0.10)' });
  children.push({ t: 'poly', pts: lit2, fill: 'rgba(255,255,255,0.07)' });
  // An inner edge shade hugging the rails (darkens toward the road's edges → a crowned, not flat, top).
  children.push({ t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(6,4,18,0.30)', sw: 5 });
  return [
    // A dark under-edge so the road reads as a solid track floating in space (the void shows beyond).
    { t: 'poly', pts: offsetPoly(poly, 2), fill: 'rgba(8,6,22,0.55)' },
    { t: 'clip', clip: poly, children },
    // A glowing white rail + a soft outer halo so the ribbon pops against the starfield.
    { t: 'poly', pts: poly, fill: 'none', stroke: 'rgba(255,255,255,0.9)', sw: 2 },
    { t: 'poly', pts: offsetPoly(poly, 2.4), fill: 'none', stroke: 'rgba(150,200,255,0.45)', sw: 1.2 },
  ];
}
/** Softened mowing tones (GS-cetus-5, retuned GS-cetus-blend). The mowing bands used to fill with the
 *  FULL `s.light`/`s.dark` turf shades — maximum contrast, which on a thin wiggly corridor reads as a
 *  harsh striped snake ("Beetlejuice snakes"), not groomed grass. Blend each tone back toward the base
 *  so the stripes whisper the mow instead of shouting it. The value-crushed indigo/cyan worlds
 *  (void/cetus) used to keep a WIDER spread (they'd otherwise vanish into the base), but their turf
 *  palettes already carry a wide light↔dark VALUE spread, so even a normal blend banded them into hard
 *  bright/dark stripes discordant with the smooth luminous platform — so they now mute BELOW parkland
 *  (`MOW_BLEND`). The DARK tone eases further back than the light one for every world (GS-mow-blend) —
 *  the eye reads a dark cut as a shadow/edge, the austere half of the stripe; muting it asymmetrically
 *  keeps the mow while losing the harsh line. */
const MOW_BLEND: Partial<Record<BiomeArchetype, number>> = { void: 0.4, cetus: 0.42, derelict: 0.42 };
function mowTones(s: Shade, arch: BiomeArchetype): { hi: string; lo: string } {
  // Parkland default lifted 0.5 → 0.6 (GS-fairway-2): at 0.5 the narrow-spread palettes (verdant's
  // #3f8c3f↔#56a850, desert, ocean) mowed at a near-invisible whisper and the corridor read as one
  // flat tone — the frost world read best precisely because its grain showed. Still well below the
  // full-contrast stripes the blend was introduced to tame, and the dark cut keeps its 0.72 ease.
  const k = MOW_BLEND[arch] ?? 0.6; // fraction of the way from base toward light/dark (1 = full old contrast)
  const kLo = k * 0.72; // the dark cut eases further back than the light one, on every world
  return { hi: mixHex(s.base, s.light, k), lo: mixHex(s.base, s.dark, kLo) };
}

/** The band pitch (screen px) the world mows its FAIRWAY at, off the main corridor's box. Split out
 *  (GS-green-complex) so the GREEN can subdivide the SAME pitch instead of inventing its own — a
 *  green mown at an unrelated pitch to the corridor it sits in is one of the tells that made the two
 *  read as separate art assets. Frost sweeps its grain down the hole (X) and the desert/inferno mow
 *  wider, so each keeps its classic pitch. */
export function fairwayBandH(b0: Box, arch: BiomeArchetype): number {
  const spanY = b0.maxY - b0.minY;
  if (arch === 'frost') return (b0.maxX - b0.minX) / 6;
  if (arch === 'desert' || arch === 'inferno') return spanY / 5;
  return spanY / 7;
}

/** The per-world fairway mowing PATTERN (GS-variety-2): each archetype grooms its turf differently so
 *  fairways read distinct beyond their colour. The pattern dispatch itself moved to `shared.ts`
 *  (`mowPattern`, GS-green-complex) so the green mows in its own world's grain too; this just picks
 *  the corridor's pitch and tones. The band grid rides the MAIN corridor's bbox so apron + segments
 *  line up. Tones are softened toward the base (`mowTones`) so the mow reads groomed, not striped. */
function fairwayStripes(sps: Vec[][], s: Shade, b0: Box, arch: BiomeArchetype): Prim[] {
  const bandH = fairwayBandH(b0, arch);
  const { hi, lo } = mowTones(s, arch);
  return sps.map((sp) => mowPattern(sp, hi, lo, b0, arch, bandH));
}

// ---------------------------------------------------------------------------
// The fairway SILHOUETTE (GS-fairway-silhouette)
// ---------------------------------------------------------------------------

// EVERY length here is a width of GROUND (course yards), never pixels — and that is what makes the
// silhouette CAMERA-PROOF, not just scale-honest (GS-green-complex's rule, one step further). Where
// one piece of fairway buries another is a fact about the course; decide it in pixels and a
// follow-cam zoom can pop a run of ink in or out mid-shot, and `tests/camera-stability` (which pins
// the whole scene's prim count + type sequence across a pan) goes flaky. The projector is a
// similarity (uniform scale + rotation), so a yard-derived decision taken on projected points is
// exactly the course-space one.
/** How finely a fairway edge is walked when deciding which of it SHOWS — the ink then starts and
 *  stops within ~a yard and a half of where a neighbouring piece really swallows it. The per-poly
 *  budget bounds the work (the follow-cam rebuilds the whole scene every frame); it is a count of
 *  GROUND samples, so it can't drift with the zoom either. */
const OUTLINE_STEP_YD = 1.5;
const OUTLINE_MAX_SAMPLES = 720;
/** Overlap tolerance: an edge running along the inside lip of a neighbour counts as buried, so a
 *  flush join (the apron STARTS at the corridor's own half-width) can't leave a row of ink specks. */
const OUTLINE_BLEED_YD = 0.8;
/** A buried DIP shorter than this is stitched back into the silhouette (a morphological close) — an
 *  edge that just grazes a neighbour draws as one continuous line, never as a row of dashes. */
const OUTLINE_CLOSE_YD = 4;
/** A visible run shorter than this is dropped — a stub of outline reads as a speck of dirt, not an edge. */
const OUTLINE_MIN_RUN_YD = 2.5;

/** A run of fairway edge that is actually ON the outside of the fairway system. `closed` = the whole
 *  ring shows (no other piece buries any of it), so it strokes as the classic closed polygon. */
export interface EdgeRun {
  closed: boolean;
  pts: Vec[];
}

/**
 * The VISIBLE boundary of the fairway union, per polygon (GS-fairway-silhouette).
 *
 * A hole's fairway is nearly always MORE THAN ONE polygon — the corridor, the green flare, a
 * split-fairway alternate lane, the segments of a broken island corridor (94% of generated holes;
 * 25% carry a piece that touches nothing else). The ink edge used to be stamped on `sps[0]` alone,
 * because a per-poly outline slashed the apron's ring back across the corridor near the green — so
 * every OTHER piece of cut grass shipped with no outline at all: a split fairway drawn as a bare
 * green smear beside an inked corridor (the player report).
 *
 * A fairway polygon is NOT the same shape as the cut grass the player can see, and that is the second
 * half of the rule (GS-fairway-ink-break). The corridor runs on UNDER the green, and hazards are cut
 * out of it and painted over it — so an outline that asks only "does another fairway bury this?" draws
 * ink across the putting surface, along the floor of a bunker and through a creek. Measured over 2,925
 * generated holes it was **2.3% of all ink length inside a green (77% of holes) and 7.9% inside a
 * hazard (87%)** — every hazard family in the game, led by bunkers, creeks and water. So the
 * occluders — the green and the drawn hazard bodies — bury edge exactly as a neighbouring fairway
 * does. The player put it best: it should be on the fairway itself, and *definitely* not on the green
 * even if the fairway art runs under the green.
 *
 * TREES ARE DELIBERATELY NOT OCCLUDERS. A canopy is a sprite with gaps drawn over the turf, not a
 * body cut out of it — the ground under it is still cut grass, and burying edge there would shred the
 * outline into dashes wherever a grove overhangs the fairway.
 *
 * Both wants are the same rule: **the fairway system has ONE silhouette, and the ink traces it.**
 * Walk each polygon's own edge and keep the runs no other fairway polygon buries. A piece that
 * stands alone returns its whole ring (byte-for-byte the old closed stroke); the apron keeps only
 * the part outside the corridor, so nothing cuts back across. The runs lie exactly on the drawn
 * polygons — never on a re-derived union outline, which would be a SECOND description of an edge
 * the fills have already committed to. Pure geometry, zero rng, camera-proof: every tolerance is a
 * width of ground and the sample count comes out of the ground length, so panning and zooming move
 * the runs and change nothing about how many there are.
 */
export function fairwayEdgeRuns(sps: Vec[][], scale = 1, occluders: Vec[][] = []): EdgeRun[][] {
  if (sps.length <= 1 && !occluders.length) return sps.map((p) => [{ closed: true, pts: p }]);
  // Yards → this camera's pixels. Deliberately UNCLAMPED (unlike `turfPx`, which floors a band so it
  // stays visible): a clamp is a camera-dependent decision, and these numbers decide structure.
  const pxPerYd = scale > 0 ? scale : 1;
  const bleed = OUTLINE_BLEED_YD * pxPerYd;
  const closeGap = OUTLINE_CLOSE_YD * pxPerYd;
  const minRun = OUTLINE_MIN_RUN_YD * pxPerYd;
  const stepPx = OUTLINE_STEP_YD * pxPerYd;
  const grown = sps.map((p) => offsetPoly(p, -bleed));
  const boxes = grown.map(bboxOf);
  // The OCCLUDERS (GS-fairway-ink-break) — the green and the hazard bodies, which are painted ON TOP
  // of the fairway pass. Grown by the same `bleed` as a neighbouring fairway, so an edge running
  // along a bunker's rim stops just short of it instead of leaving a row of specks along the sand.
  const grownOcc = occluders.map((p) => offsetPoly(p, -bleed));
  const occBoxes = grownOcc.map(bboxOf);
  return sps.map((poly, i) => {
    const n = poly.length;
    if (n < 3) return [{ closed: true, pts: poly }];
    const buried = (p: Vec): boolean => {
      for (let j = 0; j < grown.length; j++) {
        if (j === i) continue;
        const b = boxes[j]!;
        if (p[0] < b.minX || p[0] > b.maxX || p[1] < b.minY || p[1] > b.maxY) continue;
        if (pointInPoly(p, grown[j]!)) return true;
      }
      for (let j = 0; j < grownOcc.length; j++) {
        const b = occBoxes[j]!;
        if (p[0] < b.minX || p[0] > b.maxX || p[1] < b.minY || p[1] > b.maxY) continue;
        if (pointInPoly(p, grownOcc[j]!)) return true;
      }
      return false;
    };
    let perim = 0;
    for (let e = 0; e < n; e++) perim += dist(poly[e]!, poly[(e + 1) % n]!);
    const step = Math.max(stepPx, perim / OUTLINE_MAX_SAMPLES);
    // Densify the ring: `ring[m]` starts sub-segment m, `vis[m]` says whether that sub-segment shows.
    const ring: Vec[] = [];
    const vis: boolean[] = [];
    for (let k = 0; k < n; k++) {
      const a = poly[k]!;
      const b = poly[(k + 1) % n]!;
      const m = Math.max(1, Math.ceil(dist(a, b) / step));
      for (let q = 0; q < m; q++) {
        const t = q / m;
        ring.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        const tm = (q + 0.5) / m;
        vis.push(!buried([a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm]));
      }
    }
    const M = ring.length;
    const segLen = (m: number): number => dist(ring[m]!, ring[(m + 1) % M]!);
    // CLOSE the short buried dips: where two pieces of fairway join flush their edges weave across
    // each other for a few yards at a time, and drawn literally that is a row of dashes along one
    // continuous edge of grass. Stitching first, then dropping the short runs below, is the standard
    // close-then-open — do it the other way round and the dashes survive as specks.
    if (vis.some(Boolean)) {
      let s0 = -1;
      for (let m = 0; m < M; m++)
        if (!vis[m] && vis[(m - 1 + M) % M]) {
          s0 = m; // start iterating AT a dip's first sample, so no run straddles the wrap
          break;
        }
      for (let m = 0; s0 >= 0 && m < M; ) {
        if (vis[(s0 + m) % M]) {
          m++;
          continue;
        }
        let len = 0;
        let k = m;
        while (k < M && !vis[(s0 + k) % M]) len += segLen((s0 + k++) % M);
        if (len < closeGap) for (let q = m; q < k; q++) vis[(s0 + q) % M] = true;
        m = k;
      }
    }
    // Untouched by every other piece → the classic closed ring, on the ORIGINAL vertices.
    if (vis.every(Boolean)) return [{ closed: true, pts: poly }];
    let start = -1;
    for (let m = 0; m < M; m++)
      if (vis[m] && !vis[(m - 1 + M) % M]) {
        start = m;
        break;
      }
    if (start < 0) return []; // wholly buried — this piece has no silhouette of its own
    const runs: EdgeRun[] = [];
    let cur: Vec[] = [];
    let len = 0;
    const flush = (): void => {
      if (cur.length >= 2 && len >= minRun) runs.push({ closed: false, pts: cur });
      cur = [];
      len = 0;
    };
    for (let q = 0; q < M; q++) {
      const m = (start + q) % M;
      if (!vis[m]) {
        flush();
        continue;
      }
      const a = ring[m]!;
      const b = ring[(m + 1) % M]!;
      if (!cur.length) cur.push(a);
      cur.push(b);
      len += dist(a, b);
    }
    flush();
    return runs;
  });
}

/** Stroke one silhouette run — a closed ring keeps its `poly` prim (so a lone fairway is byte-for-byte
 *  the old output); an open run is a `path`, never a `poly` (which would close with a chord slashing
 *  straight across the fairway). Exported so the worlds that edge their corridor with something other
 *  than ink (void's luminous rim, cetus's lit shelf) draw that edge off the SAME silhouette. */
export function strokeRun(r: EdgeRun, stroke: string, sw: number): Prim {
  return r.closed
    ? { t: 'poly', pts: r.pts, fill: 'none', stroke, sw }
    : { t: 'path', pts: r.pts, stroke, sw, round: true };
}

/** All the hole's fairway polygons drawn as ONE grouped pass (GS-blend, same idea as the liquid
 *  families). A hole has the main corridor plus, near the green, a second `fairway` feature — the
 *  apron that wraps THROUGH and PAST the green — and often a third: a split-fairway alternate lane,
 *  or the far segments of a broken island corridor. Drawn per-poly each stamped its own dark fringe
 *  ring, ink outline and finer/out-of-phase stripes across the bright corridor (the "section around
 *  the green that doesn't fit"). Grouped, the apron melts into the corridor: every fringe goes UNDER
 *  every base, the stripes share the corridor's band grid, and the ink + edge ease trace the union's
 *  ONE silhouette (`fairwayEdgeRuns`) so nothing cuts back across the turf and no piece is left
 *  un-outlined. With a single fairway (no apron — void islands) this is byte-for-byte the old
 *  per-poly output. */
export function styleFairways(
  sps: Vec[][],
  art: ArtFeel,
  s: Shade,
  fringe: string,
  arch: BiomeArchetype,
  collar?: string,
  scale = 1,
  edgeRuns?: EdgeRun[][],
): Prim[] {
  const out: Prim[] = [];
  // GS-fairway: a wider first-cut ROUGH collar UNDER the light fringe, so the corridor reads as mown
  // DOWN into taller grass rather than a bright tube laid on top (the "flat object" tell). Only the
  // parkland worlds pass a `collar` — void/cetus model their corridor edge with their own glow rim /
  // raised shelf, so they omit it. Grouped like the fringe (every collar UNDER every base), so a
  // broken corridor's segments share one continuous first cut.
  //
  // GS-fairway-2 feathered the cut with one intermediate ring per step; GS-green-complex finishes the
  // job on both axes: the ramp is now sized in COURSE YARDS (`turfPx` — the fixed-px rings shrank to a
  // hairline at the chip/putt camera, exactly where the player studies the turf) and walked in
  // FIRST_CUT_STEPS even steps, so no single tone jump is large enough for the eye to read a ring.
  // Grouped level-by-level: every ring of a level is laid for EVERY segment before the next level, so
  // the apron's first cut never paints over the corridor's turf.
  if (collar) {
    const cw = turfPx(scale, FIRST_CUT_YD);
    for (let i = 0; i < FIRST_CUT_STEPS; i++) {
      const u = i / FIRST_CUT_STEPS;
      const col = mixHex(collar, s.base, u);
      for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -cw * (1 - u)), fill: col });
    }
  } else {
    // First-cut fringe UNDER all the bases, so the apron's fringe never paints over the corridor —
    // only the outermost edge (past the green) shows it, easing the cut grass into the rough.
    for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -turfPx(scale, FRINGE_YD)), fill: fringe });
  }
  for (const sp of sps) out.push({ t: 'poly', pts: sp, fill: s.base });
  // Per-world mowing PATTERN (GS-variety-2), riding the MAIN corridor's band grid so the apron +
  // broken-fairway segments line up with the corridor instead of running out of phase.
  if (art.stripes && sps[0]) out.push(...fairwayStripes(sps, s, bboxOf(sps[0]), arch));
  // GS-fairway/GS-fairway-2: the interior modelling, clipped to each segment. Grounded worlds only.
  //  • EDGE EASE — two nested inner strokes toned from the turf toward the fringe, so the mown
  //    surface ramps into its own mow line from whichever side the fringe sits (lighter on the
  //    sandy worlds, darker on parkland) instead of a flat fill stopping dead at a ring. Strokes,
  //    not deep filled insets: an inset larger than the corridor's local half-width folds on a
  //    thin ribbon, while a clipped stroke hugs the edge safely at any width/zoom.
  //  • SHEEN — the directional lit band pooled on the up-light side (the shared LIGHT_UL) now
  //    stacks as TWO softer washes instead of one 0.16 band, so the crown light grades in rather
  //    than switching on at a visible line. All pure geometry, zero rng.
  // The silhouette of the whole fairway system — one walk, shared by the edge ease and the ink below
  // so the two can never describe the fairway's edge differently.
  const runs = edgeRuns ?? (collar || art.ink ? fairwayEdgeRuns(sps, scale) : []);
  if (collar) {
    const edgeEase = mixHex(s.base, fringe, 0.4);
    // Scale-honest like the first cut (GS-green-complex): the ease band + crown sheen are a width of
    // GROUND, so they hold at the chip camera instead of collapsing to a hairline.
    const e1 = turfPx(scale, 9);
    const e2 = turfPx(scale, 4);
    const o1 = turfPx(scale, 3);
    const o2 = turfPx(scale, 6.5);
    sps.forEach((sp, i) => {
      const lit1 = shiftPoly(offsetPoly(sp, o1), LIGHT_UL[0] * o1, LIGHT_UL[1] * o1);
      const lit2 = shiftPoly(offsetPoly(sp, o2), LIGHT_UL[0] * o2, LIGHT_UL[1] * o2);
      // The ease rides the SILHOUETTE, not the raw ring: a buried edge (the apron's flush join at the
      // corridor) would otherwise ramp a dark band straight across the middle of the fairway.
      const ease = (runs[i] ?? []).flatMap((r) => [
        strokeRun(r, hexAlpha(edgeEase, 0.32), e1),
        strokeRun(r, hexAlpha(edgeEase, 0.45), e2),
      ]);
      out.push({
        t: 'clip',
        clip: sp,
        children: [...ease, { t: 'poly', pts: lit1, fill: hexAlpha(s.light, 0.09) }, { t: 'poly', pts: lit2, fill: hexAlpha(s.light, 0.08) }],
      });
    });
  }
  // ONE soft ink edge around the WHOLE fairway system (GS-fairway-silhouette): every piece of cut
  // grass is outlined where it meets the ground, and nothing is outlined where it meets more fairway.
  if (art.ink) for (const rs of runs) for (const r of rs) out.push(strokeRun(r, hexAlpha(s.ink, 0.5), 1));
  return out;
}
export function styleTee(poly: Vec[], art: ArtFeel, s: Shade, fringe: string, scale = 1): Prim[] {
  const out: Prim[] = [
    // Nest the tee in a soft fringe — scale-honest in course yards (GS-green-complex).
    { t: 'poly', pts: offsetPoly(poly, -turfPx(scale, 2.4)), fill: fringe },
    { t: 'poly', pts: poly, fill: s.base },
  ];
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, 0.5), sw: 1 });
  return out;
}
