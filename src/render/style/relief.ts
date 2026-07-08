/**
 * Biome RELIEF (GS-biome-relief): directional rolling-terrain depth for every world's ground.
 *
 * The rough used to read as a flat, lifeless tinted slab — the ground COVERING (grain/tufts/mottle)
 * gave it a surface texture but no large-scale FORM, so a whole world looked pressed flat. This pass
 * lays soft, paired highlight/shadow lobes across the land: a lit crest on the up-light side of each
 * rise and a shaded hollow on the down-light side, both lit from the shared upper-left sun
 * (`LIGHT_UL`) so the whole hole reads as ONE rolling landform, not a collage. The pairing is the
 * trick — a lone bright blob reads as a "spotlight" pasted on the hole (a documented failure mode of
 * the old big tonal patches); a highlight married to an offset shadow reads as a MOUND with volume.
 *
 * Per-world palettes (`BIOME_RELIEF`) keep every crest/hollow tint biome-derived — warm dune light +
 * brown shadow on desert, snow-white crest + cool-blue hollow on frost, ember-warm rise + charred
 * hollow on inferno, luminous indigo rise + abyssal hollow on the void, gilded crest on Asgard — and
 * NEVER neutral white/black (which would read as a spotlight or a smudge, not terrain).
 *
 * Determinism (contract 1): PURE geometry — this pass draws ZERO rng, so it perturbs NO existing
 * seeded stream and every prior seeded test stays byte-identical (it only ADDS prims). Per-mound
 * variety comes from `posHash` of the COURSE-space cell, never rng, never the projection. Camera-proof
 * (the camera-stability contract): the mound COUNT is a function of the land's COURSE-space bbox
 * (yards) and a course-space inside-poly test — never the projection — and every mound is pushed
 * UNCONDITIONALLY, so a follow-cam pan/zoom never shifts the prim count.
 */

import type { Vec } from '../../sim/course/contract';
import { pointInPoly } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import type { Projector } from '../project';
import { type Prim, bboxOf, posHash, projPoly, scaleAlpha, LIGHT_UL } from './shared';

export interface ReliefLook {
  /** Sunlit crest tint (rgba) — the up-light slope of a rise; biome-derived, warm/bright. */
  hi: string;
  /** Shaded hollow tint (rgba) — the down-light slope; biome-derived, cool/deep. */
  lo: string;
  /** Overall prominence multiplier (≈0.8–1.4) — dune-rolling worlds ride higher, gentle ones lower. */
  strength: number;
}

/**
 * Per-archetype relief palette. Every entry is machine-checked for coverage
 * (`tests/biome-identity.test.ts`) — a new world adds a row, never a fork. Highlight + hollow tints
 * are keyed to the world's ground so the relief SELLS the biome (and never reads as a neutral
 * spotlight): sand dunes on desert/ocean, snow drifts on frost, scorched swells on inferno, cosmic
 * rises on the void, gilded meadow-rolls on Asgard.
 */
export const BIOME_RELIEF: Record<BiomeArchetype, ReliefLook> = {
  verdant: { hi: 'rgba(158,224,132,0.13)', lo: 'rgba(10,34,14,0.20)', strength: 1 },
  desert: { hi: 'rgba(255,226,150,0.14)', lo: 'rgba(74,46,16,0.21)', strength: 1.15 }, // rolling dunes
  frost: { hi: 'rgba(255,255,255,0.20)', lo: 'rgba(122,160,200,0.22)', strength: 1.2 }, // snow drifts
  inferno: { hi: 'rgba(255,150,70,0.13)', lo: 'rgba(8,4,3,0.30)', strength: 1.15 }, // scorched swells
  void: { hi: 'rgba(150,140,244,0.16)', lo: 'rgba(6,3,24,0.32)', strength: 1 }, // cosmic rises over the abyss
  crystal: { hi: 'rgba(210,240,255,0.15)', lo: 'rgba(30,44,74,0.26)', strength: 1.1 }, // faceted scree swells
  tempest: { hi: 'rgba(182,198,152,0.12)', lo: 'rgba(10,16,10,0.26)', strength: 1.1 }, // wind-heaped moor
  fungal: { hi: 'rgba(130,240,182,0.13)', lo: 'rgba(6,26,16,0.26)', strength: 1 }, // mossy mounds
  ocean: { hi: 'rgba(255,244,200,0.14)', lo: 'rgba(112,86,48,0.21)', strength: 1.15 }, // beach dunes
  cetus: { hi: 'rgba(122,232,240,0.15)', lo: 'rgba(5,26,38,0.30)', strength: 1 }, // luminous clifftop swells
  asgard: { hi: 'rgba(255,232,150,0.14)', lo: 'rgba(12,38,20,0.22)', strength: 1.1 }, // gilded meadow rolls
};

/**
 * Rainbow Road's OWN relief (GS-biome-relief): a gentle prismatic sheen of lit rises + violet hollows
 * drawn ON the road ribbon (the bands are opaque, so it rides over them) so the legendary track reads
 * as a rolling glowing road, not a flat decal. Kept subtle — the ribbon's prismatic bands carry the
 * colour; this only gives the surface form.
 */
export const RAINBOW_RELIEF: ReliefLook = { hi: 'rgba(255,240,255,0.15)', lo: 'rgba(46,22,78,0.16)', strength: 0.9 };

/**
 * Lay directionally-lit relief mounds across each course-space polygon (the land hull, a lost-rough
 * world's platforms, or the Rainbow Road surfaces), clipped to it. A jittered COURSE-space grid picks
 * mound centres; each center that falls inside the poly draws a shaded hollow lobe offset DOWN-light
 * and a lit crest lobe offset UP-light, so it reads as a rise with volume. Sized in yards (via
 * `proj.scale`), varied off `posHash`. See the module header for the determinism/camera contract.
 */
export function biomeRelief(polysCourse: Vec[][], look: ReliefLook, proj: Projector, texture: number): Prim[] {
  const out: Prim[] = [];
  const strength = look.strength * texture;
  if (strength <= 0) return out;
  for (const poly of polysCourse) {
    if (poly.length < 3) continue;
    const b = bboxOf(poly);
    const spanX = b.maxX - b.minX;
    const spanY = b.maxY - b.minY;
    if (spanX < 10 || spanY < 10) continue;
    // Grid spacing in YARDS (course space → camera-independent count). ~3–4 rows/cols per axis on a
    // normal hull; a small platform still gets at least one cell.
    const step = Math.max(34, Math.min(88, Math.max(spanX, spanY) / 3.4));
    const nx = Math.max(1, Math.round(spanX / step));
    const ny = Math.max(1, Math.round(spanY / step));
    const cellW = spanX / nx;
    const cellH = spanY / ny;
    const mounds: Prim[] = [];
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        // Un-jittered cell centre keys the posHash so variety differs per hole (course coords), and
        // the jittered centre + inside-poly test are both COURSE space → the count is camera-stable.
        const baseX = b.minX + (ix + 0.5) * cellW;
        const baseY = b.minY + (iy + 0.5) * cellH;
        const cx = baseX + (posHash(baseX, baseY, 1) - 0.5) * cellW * 0.6;
        const cy = baseY + (posHash(baseX, baseY, 2) - 0.5) * cellH * 0.6;
        if (!pointInPoly([cx, cy], poly)) continue;
        const rY = (0.62 + posHash(baseX, baseY, 3) * 0.5) * Math.min(cellW, cellH); // mound radius, yards (overlaps for smooth undulation)
        const vary = 0.72 + posHash(baseX, baseY, 4) * 0.56; // per-mound prominence
        const s = proj.project([cx, cy]);
        const rpx = Math.max(11, rY * proj.scale);
        const off = rpx * 0.42; // lobe offset along the light → a lit bump, not a flat glow
        mounds.push({ t: 'glow', c: [s[0] - LIGHT_UL[0] * off, s[1] - LIGHT_UL[1] * off], r: rpx, col: scaleAlpha(look.lo, strength * vary) });
        mounds.push({ t: 'glow', c: [s[0] + LIGHT_UL[0] * off, s[1] + LIGHT_UL[1] * off], r: rpx * 0.9, col: scaleAlpha(look.hi, strength * vary) });
      }
    }
    if (mounds.length) out.push({ t: 'clip', clip: projPoly(poly, proj), children: mounds });
  }
  return out;
}
