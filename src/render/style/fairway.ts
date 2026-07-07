/**
 * Fairway + tee painters (GS-style-split): the grouped fairway pass with its per-world mowing
 * patterns (GS-variety-2), the first-cut collar/sheen (GS-fairway), the tee pad, and the Rainbow
 * Road ribbon (GS-rainbow). All pure geometry — zero rng.
 */

import type { Vec } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import { mixHex, type Shade } from '../palette';
import {
  type Prim,
  type ArtFeel,
  bboxOf,
  offsetPoly,
  shiftPoly,
  hexAlpha,
  LIGHT_UL,
  stripesAt,
  stripesAtV,
  slantStripes,
  checkerStripes,
} from './shared';

/** The Rainbow Road colour cycle (GS-rainbow) — a vivid 7-band rainbow the ribbon mows through. */
const RAINBOW_BANDS = ['#ff3b5c', '#ff9a3d', '#ffe23d', '#49e06b', '#3bd1ff', '#5a6bff', '#c46bff'];

/**
 * A rainbow-road ribbon (GS-rainbow): fill a play surface (fairway/green/tee) with bright rainbow
 * bands clipped to its polygon — perpendicular-to-play after the projector rotates tee→green up, so
 * the bands read like a Mario-Kart Rainbow Road track — then cap it with a glowing white rail. Pure
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
const MOW_BLEND: Partial<Record<BiomeArchetype, number>> = { void: 0.4, cetus: 0.42 };
function mowTones(s: Shade, arch: BiomeArchetype): { hi: string; lo: string } {
  // Parkland default lifted 0.5 → 0.6 (GS-fairway-2): at 0.5 the narrow-spread palettes (verdant's
  // #3f8c3f↔#56a850, desert, ocean) mowed at a near-invisible whisper and the corridor read as one
  // flat tone — the frost world read best precisely because its grain showed. Still well below the
  // full-contrast stripes the blend was introduced to tame, and the dark cut keeps its 0.72 ease.
  const k = MOW_BLEND[arch] ?? 0.6; // fraction of the way from base toward light/dark (1 = full old contrast)
  const kLo = k * 0.72; // the dark cut eases further back than the light one, on every world
  return { hi: mixHex(s.base, s.light, k), lo: mixHex(s.base, s.dark, kLo) };
}

/** The per-world fairway mowing PATTERN (GS-variety-2): each archetype grooms its turf differently so
 *  fairways read distinct beyond their colour — horizontal stripes (classic parkland), a vertical
 *  swept grain (frost), a faceted/wind diagonal (crystal/tempest/desert), or a lush cross-mown
 *  checker (jungle). The band grid still rides the MAIN corridor's bbox so apron + segments line up.
 *  Tones are softened toward the base (`mowTones`) so the mow reads groomed, not striped. */
function fairwayStripes(sps: Vec[][], s: Shade, b0: { minX: number; minY: number; maxX: number; maxY: number }, arch: BiomeArchetype): Prim[] {
  const spanY = b0.maxY - b0.minY;
  const bandH = spanY / 7;
  const { hi, lo } = mowTones(s, arch);
  switch (arch) {
    case 'frost':
      return sps.map((sp) => stripesAtV(sp, hi, lo, b0.minX, (b0.maxX - b0.minX) / 6));
    case 'crystal':
      return sps.map((sp) => slantStripes(sp, hi, lo, bandH * 0.95, 0.6));
    case 'tempest':
      return sps.map((sp) => slantStripes(sp, hi, lo, bandH, -0.5));
    case 'desert':
      return sps.map((sp) => slantStripes(sp, hi, lo, spanY / 5, 0.28));
    case 'fungal':
      return sps.map((sp) => checkerStripes(sp, hi, lo, bandH * 0.9));
    case 'inferno':
      return sps.map((sp) => stripesAt(sp, hi, lo, b0.minY, spanY / 5));
    default: // verdant / ocean / void / cetus — the classic horizontal mowing stripes
      return sps.map((sp) => stripesAt(sp, hi, lo, b0.minY, bandH));
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
export function styleFairways(sps: Vec[][], art: ArtFeel, s: Shade, fringe: string, arch: BiomeArchetype, collar?: string): Prim[] {
  const out: Prim[] = [];
  // GS-fairway: a wider first-cut ROUGH collar UNDER the light fringe, so the corridor reads as mown
  // DOWN into taller grass rather than a bright tube laid on top (the "flat object" tell). Only the
  // parkland worlds pass a `collar` — void/cetus model their corridor edge with their own glow rim /
  // raised shelf, so they omit it and stay byte-for-byte identical. Grouped like the fringe (every
  // collar UNDER every base), so a broken corridor's segments share one continuous first cut.
  if (collar) for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -6), fill: collar });
  // GS-fairway-2: feather the cut. The collar → fringe → base rings used to BUTT at hard tone jumps
  // — a 3-step staircase that read as concentric stickers (the same "ruled tape" tell the mowing
  // bands had before GS-mow-blend). One intermediate mix ring between each step halves every jump,
  // so the corridor grades smoothly rough → collar → fringe → turf. Pure geometry, zero rng;
  // gated on `collar` like the rest of the grounded-world dressing.
  if (collar) for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -4.4), fill: mixHex(collar, fringe, 0.5) });
  // First-cut fringes UNDER all the bases, so the apron's fringe never paints over the corridor —
  // only the outermost edge (past the green) shows it, easing the cut grass into the rough.
  for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -3), fill: fringe });
  if (collar) for (const sp of sps) out.push({ t: 'poly', pts: offsetPoly(sp, -1.5), fill: mixHex(fringe, s.base, 0.5) });
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
  if (collar) {
    const edgeEase = mixHex(s.base, fringe, 0.4);
    for (const sp of sps) {
      const lit1 = shiftPoly(offsetPoly(sp, 3), LIGHT_UL[0] * 3, LIGHT_UL[1] * 3);
      const lit2 = shiftPoly(offsetPoly(sp, 6.5), LIGHT_UL[0] * 6.5, LIGHT_UL[1] * 6.5);
      out.push({
        t: 'clip',
        clip: sp,
        children: [
          { t: 'poly', pts: sp, fill: 'none', stroke: hexAlpha(edgeEase, 0.32), sw: 9 },
          { t: 'poly', pts: sp, fill: 'none', stroke: hexAlpha(edgeEase, 0.45), sw: 4 },
          { t: 'poly', pts: lit1, fill: hexAlpha(s.light, 0.09) },
          { t: 'poly', pts: lit2, fill: hexAlpha(s.light, 0.08) },
        ],
      });
    }
  }
  // ONE soft ink edge, on the main corridor only — no hard outline cuts back across it near the green.
  if (art.ink && sps[0]) out.push({ t: 'poly', pts: sps[0], fill: 'none', stroke: hexAlpha(s.ink, 0.5), sw: 1 });
  return out;
}
export function styleTee(poly: Vec[], art: ArtFeel, s: Shade, fringe: string): Prim[] {
  const out: Prim[] = [
    { t: 'poly', pts: offsetPoly(poly, -2.4), fill: fringe }, // nest the tee in a soft fringe
    { t: 'poly', pts: poly, fill: s.base },
  ];
  if (art.ink) out.push({ t: 'poly', pts: poly, fill: 'none', stroke: hexAlpha(s.ink, 0.5), sw: 1 });
  return out;
}
