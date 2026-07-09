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
 *
 * Split per-domain (GS-style-split, the GS-app-split pattern): this file keeps the ORCHESTRATION —
 * `buildScene` owns the documented seeded streams (rng/crng/ocean/river/cliff/cover/decor/egg) and
 * their draw ORDER, the load-bearing determinism contract — plus the two interpreters and the
 * unchanged public re-exports. The per-domain painters live in `./style/*` (shared, land, fairway,
 * green, hazards, flora, ground, platforms, effects); a new painter = a new `style/` module.
 */

import type { Feature, Hole, Vec } from '../sim/course/contract';
import { pointInPoly } from '../sim/course/contract';
import { obStakes, playBoundsCorners } from '../sim/round';
import { tradeTents as tradeTentsFor } from '../sim/tents';
import { meteorScorch as meteorScorchFor } from '../sim/scorch';
import { effectPatches as effectPatchesFor, type PatchKind } from '../sim/patches';
import { themeById, archetypeFor, type BiomeArchetype } from '../sim/course/themes';
import type { Projector } from './project';
import {
  accentFor,
  turfShade,
  collarFor,
  landFillFor,
  spaceLookFor,
  RAINBOW_SPACE,
  mixHex,
  OB,
  OB_LOOK,
  type ObLook,
} from './palette';
import {
  type Prim,
  type ArtFeel,
  artFeel,
  mulberry32,
  hashHole,
  bboxOf,
  centroidOf,
  scalePoly,
  offsetPoly,
  projPoly,
  inView,
  posHash,
  hexAlpha,
  scaleAlpha,
  rgbaParts,
  fadeCol,
  n1,
} from './style/shared';
import { landHullCourse, lostPlatformsCourse, mergedHazardsFor } from './style/land';
import { rainbowRibbon, styleFairways, styleTee } from './style/fairway';
import { styleGreen, styleGreenSurround, greenSlopeArt } from './style/green';
import {
  styleSandFamily,
  styleLiquidFamily,
  WATER_LIQ,
  LAVA_LIQ,
  WATER_KINDS,
  LAVA_KINDS,
  styleScatter,
  styleFescue,
  styleDeepRough,
  styleRavine,
  roughenHazardCached,
} from './style/hazards';
import { styleFlora, archetypeDecor } from './style/flora';
import { GROUND_COVER, groundCover, easterEggs } from './style/ground';
import { BIOME_RELIEF, RAINBOW_RELIEF, biomeRelief } from './style/relief';
import {
  platformCliffs,
  raisedShelf,
  cetusOcean,
  cetusRiver,
  CETUS_CLIFF,
  VOID_CLIFF,
  RAINBOW_CLIFF,
} from './style/platforms';
import {
  styleTents,
  styleScorch,
  stylePatches,
  constellationBackdrop,
  rainbowSky,
  windStreaks,
} from './style/effects';

// The public surface is unchanged by the split (GS-style-split): consumers keep importing
// everything from './style'; the per-domain painters live in './style/*'.
export { ART_DEFAULTS, artFeel } from './style/shared';
export type { Prim, ArtFeel } from './style/shared';
export { landPolysCourseFor } from './style/land';
export { GROUND_COVER, easterEggs } from './style/ground';
export type { GroundCoverLook } from './style/ground';
export { BIOME_RELIEF, RAINBOW_RELIEF, biomeRelief } from './style/relief';
export type { ReliefLook } from './style/relief';
export { cetusRiverPath } from './style/platforms';

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
  /** Meteor-strike scorch craters (GS-meteor-scorch): the meteor-shower route chars craters into the
   *  turf — a ball at rest on one plays the 'scorch' lie. Drawn in COURSE space from the SAME
   *  `meteorScorch(hole)` the sim reads. Baked at the app boundary from the course effect. */
  meteorScorch?: boolean;
  /** Effect ground patches (GS-journey-fx-2): the route's turf-patch family (comet stardust /
   *  frostfall ice / debris wreckage) — a ball at rest on one plays that family's lie. Drawn in
   *  COURSE space from the SAME `effectPatches(hole, kind)` the sim reads (the graphic IS the
   *  physics). Baked at the app boundary from the course effect. */
  groundPatch?: PatchKind;
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
  // Easter-egg props sit well OFF the cut grass (GS-egg): reject within a ~9-yd buffer of any
  // fairway / green / tee, so a snowman or sandcastle never crowds the line of play.
  const grassBuffers: Vec[][] = [];
  for (const f of hole.features) {
    if (f.kind === 'fairway' || f.kind === 'green' || f.kind === 'tee') grassBuffers.push(offsetPoly(f.poly, -9));
  }
  const nearGrass = (p: Vec): boolean => grassBuffers.some((b) => pointInPoly(p, b));
  // …and never floating on a penalty liquid (a snowman in a lava lake reads as a bug). Sand and
  // trees are fine — a beach ball on the strand or a gnome under the pines belongs in the rough.
  const liquidHaz = hole.hazards.filter((f) => WATER_KINDS.has(f.kind) || LAVA_KINDS.has(f.kind)).map((f) => f.poly);
  const onLiquid = (p: Vec): boolean => liquidHaz.some((poly) => pointInPoly(p, poly));

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

  // The floating landmass (GS-rough-frame) fills the OB PLAY-BOUNDS box, plus a small apron so
  // the boundary stakes stand on solid ground: everything IN bounds is the world's ROUGH — proper,
  // playable turf — and deep space with its starfield starts exactly at the OB frame the stakes
  // mark. (An earlier pass hugged the hole geometry and space-blended the rough, so every world's
  // in-bounds rough read as a starfield — i.e. as OB you could somehow play from. The graphic is
  // the physics: ground wherever the sim gives you a lie, the deep where the ball is gone.)
  // Computed by the shared `landHullCourse`/`landPolysCourseFor` helpers — the SAME source the play
  // view's animated star-mask reads, so the twinkle field and the drawn ground can never disagree.
  const landBox = landHullCourse(hole);
  const islandPts = projPoly(landBox, proj);
  // Lost-rough hole (the void / Cetus with the penalty ARMED — the `roughLie` biomeMod `lieAt`
  // reads): off the fairway IS a lost ball out there, so there is no rough to draw. Every play
  // feature (each fairway piece + the tee) becomes its own land platform and the open deep reads
  // between and beyond them — the starfield/abyss you actually hit into. A CALM void/cetus stop
  // (penalty un-armed → off-fairway plays as ordinary rough) keeps the normal rough landmass.
  // Generalised from the island-green par 3 (GS-cetus-2) to every armed hole (GS-rough-frame).
  const lostHole = (hole.biomeMods?.some((m) => m.kind === 'roughLie') ?? false) && !rainbow;
  const landPlatformsCourse: Vec[][] = lostHole ? lostPlatformsCourse(hole) : [landBox];
  const landPlatforms = landPlatformsCourse.map((p) => projPoly(p, proj));
  // Rainbow Road gets its OWN bespoke deep-space look (GS-rainbow-polish) — a distinct indigo-violet
  // cosmos with a prismatic shore rim — so the legendary ball reads as its own world, not the
  // underlying biome recoloured. Every other world keeps its archetype space, byte-for-byte.
  const space = rainbow ? RAINBOW_SPACE : spaceLookFor(arch, deepen);
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

  // --- 2a. Rainbow Road's bespoke aurora sky (GS-rainbow-polish) --------------
  // Prismatic aurora curtains + coloured hero stars OVER the shared starfield, so the legendary ball
  // reads as its own cosmic world — a distinct starfield from Cetus's blue deep and the Void's violet
  // abyss. Drawn off a DEDICATED stream so the shared celestial `crng` (stars/planet/comet) stays
  // byte-identical, and camera-proof (fixed loop counts, no projection read). Gated to rainbow only.
  if (rainbow) {
    const skyRng = mulberry32((hashHole(hole) ^ 0x00a1b0a7) >>> 0);
    prims.push(...rainbowSky(W, H, art.accents, skyRng));
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
    const cliffs = platformCliffs(landPlatforms, deepen, cliffRng, CETUS_CLIFF);
    prims.push(...cliffs.prims);
    cetusFaces = cliffs.faces;
  }
  // Void island-hop pads (GS-cetus-5): extrude each floating pad into a chunky violet ASTEROID
  // underside so the void par 4/5 chain reads as 3D floating rock, not flat indigo decals — the same
  // side-on depth cetus gets. Gated to the LOST (armed) hole so a calm void stop's full-bounds rough
  // rectangle isn't given an odd rectangular underside; own cliff stream, so other streams are stable.
  if (arch === 'void' && lostHole && !rainbow) {
    prims.push(...platformCliffs(landPlatforms, deepen, cliffRng, VOID_CLIFF).prims);
  }

  // --- 3c. Biome RELIEF: directional rolling-terrain depth (GS-biome-relief) ---
  // Soft paired highlight/shadow lobes lit from the shared upper-left sun give every world's ground
  // real rolling-terrain FORM instead of a flat tinted slab — the fix for "they all look incredibly
  // flat and lifeless". PURE geometry (zero rng — posHash variety only), so no existing seeded stream
  // is perturbed and the mound count is camera-proof. Clipped to the land / lost-rough platforms and
  // drawn UNDER the mown turf + cover + decor (which read crisp on top), so the undulation lives in the
  // rough where the flat read was worst. Rainbow's road relief rides ON the ribbon instead (section 5b2).
  if (!rainbow && art.texture > 0) {
    prims.push(...biomeRelief(landPlatformsCourse, BIOME_RELIEF[arch], proj, art.texture));
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
    // Gentle tonal undulation — deliberately SMALL + faint. These used to span up to 29% of the
    // viewport at heavy alpha, reading as lens-flare "spotlights" pasted over the hole (a cohesion
    // tell); dialled down to soft mottle so the ground reads as one surface. (Same 4 rng draws → the
    // downstream stream is byte-for-byte unchanged.)
    const pr = (0.05 + rng() * 0.06) * Math.min(W, H);
    land.push({ t: 'circle', c: [px, py], r: pr, fill: rng() < 0.33 ? 'rgba(220,255,210,0.03)' : 'rgba(0,0,0,0.07)' });
  }
  // Tufts/flowers/stars place in COURSE space and only CULL to the view at paint time — the rng
  // consumption must never read the projection. These draws sit on the shared main `rng` stream:
  // when the retry loops used to skip off-view points, a sub-pixel camera change flipped a point's
  // visibility, shifted the draw COUNT, and re-rolled every tree/water/lava draw downstream — the
  // "whole scene jerks wildly while the camera moves" bug (per-frame follow-cam scene rebuilds).
  const tuftTarget = Math.min(64, Math.round((span / 14) * art.texture));
  let placed = 0;
  for (let i = 0; i < tuftTarget * 3 && placed < tuftTarget; i++) {
    const cp = randCoursePt();
    if (onGrass(cp)) continue;
    placed++;
    const len = 2 + rng() * 2.5;
    const dark = rng() < 0.55;
    const jx = (rng() - 0.5) * 2;
    const sp = proj.project(cp);
    if (!inView(sp, W, H)) continue; // placed + drawn (rng consumed), just not painted
    land.push({ t: 'line', a: [sp[0], sp[1]], b: [sp[0] + jx, sp[1] - len], stroke: dark ? rs.dark : rs.light, sw: 1, round: true });
  }
  const ac = accentFor(biome);
  const flowerTarget = Math.round(5 * art.accents);
  let flowers = 0;
  for (let i = 0; i < flowerTarget * 4 && flowers < flowerTarget; i++) {
    const cp = randCoursePt();
    if (onGrass(cp)) continue;
    flowers++;
    const col = ac.flowers[Math.floor(rng() * ac.flowers.length)]!;
    const dots = 3 + Math.floor(rng() * 2);
    const sp = proj.project(cp);
    const vis = inView(sp, W, H);
    for (let d = 0; d < dots; d++) {
      const dx = (rng() - 0.5) * 6;
      const dy = (rng() - 0.5) * 6;
      const r = 0.9 + rng() * 0.8;
      if (vis) land.push({ t: 'circle', c: [sp[0] + dx, sp[1] + dy], r, fill: col });
    }
  }
  // NO star-salt on the land (GS-rough-frame): the in-bounds ground is playable rough and must
  // read as turf, not as the starfield it once wore — the stars live beyond the OB frame, where
  // the ball actually IS lost. (The old crng star loop here was the "rough became starfields" bug.)
  // Rainbow Road drops the rough/tufts/flowers (off-road is empty space); a lost-rough hole also
  // drops them (its platforms are tiny and turf-covered, the rest is the open deep). The rng was
  // still consumed above, so the art stream is byte-stable whether or not the detail is painted.
  if (!rainbow && !lostHole) prims.push({ t: 'clip', clip: islandPts, children: land });

  // --- 4b. Ground COVERING (GS-ground-cover) -----------------------------------
  // The biome's actual surface texture over the whole land hull — snow / beach sand / moss / ash /
  // scree / moor grass — so the in-bounds rough reads as GROUND, not a flat tinted slab. Own
  // dedicated stream (never perturbs any existing draw), clipped to the land, gated off on a
  // lost-rough hole (its platforms are tiny turf pads; the deep between them is not ground) and on
  // the two bespoke-ground worlds (void/cetus have no GROUND_COVER row by design).
  if (!rainbow && !lostHole && art.texture > 0) {
    const cover = GROUND_COVER[arch];
    if (cover) {
      const grng = mulberry32((hashHole(hole) ^ 0x006c0de5) >>> 0);
      const coverPrims = groundCover(cover, landBox, onGrass, proj, W, H, art.texture, grng);
      if (coverPrims.length) prims.push({ t: 'clip', clip: islandPts, children: coverPrims });
    }
  }

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

  // --- 4d. Easter eggs (GS-egg) — whimsical thematic props hidden out in the rough -------------
  // A treat for scanning the whole hole: a snowman on the frost tundra, a sandcastle + umbrella on
  // the beach, a toadstool cottage in the jungle. Placed on LAND, well off the corridor, on a
  // dedicated stream (byte-stable), clipped to the land hull. Skipped on a lost-rough hole (no rough
  // to hide them in) and on void/cetus (no EGGS row — their bespoke deep already reads great).
  if (!rainbow && !lostHole && art.accents > 0) {
    const eggOk = (p: Vec): boolean => pointInPoly(p, landBox) && !nearGrass(p) && !onLiquid(p);
    const erng = mulberry32((hashHole(hole) ^ 0x00e99e66) >>> 0);
    const eggBase = arch === 'ocean' ? 4 : 3; // a few per hole to reward scanning; the beach gets extra (the user's ask)
    const eggPrims = easterEggs(arch, landBox, eggOk, proj, eggBase, erng);
    if (eggPrims.length) prims.push({ t: 'clip', clip: islandPts, children: eggPrims });
  }

  // --- 5. Terrain features (fairway/green/tee + scatter surfaces) --------------
  const collar = collarFor(arch, deepen);
  // "First-cut" fringe tones — each surface blended halfway toward this world's rough — so the cut
  // grass eases into the surrounding land instead of meeting it on a hard cut-out edge.
  const fwFringe = mixHex(fwShade.base, rs.base, 0.5);
  const grFringe = mixHex(collar, rs.base, 0.5);
  const teeFringe = mixHex(teeShade.base, rs.base, 0.45);
  // GS-fairway: the first-cut ROUGH collar tone (mostly toward rough — a taller mown band) + the
  // gate for it. Only the parkland worlds get the grounded collar/sheen; void/cetus edge their
  // corridor with a glow rim / raised shelf, so they pass no collar and stay byte-for-byte identical.
  const fwCollar = mixHex(fwShade.base, rs.base, 0.72);
  const groundedFw = arch !== 'void' && arch !== 'cetus';
  // Void islands: a soft outset glow under the cut grass so the platforms read as luminous land
  // floating in the abyss (the off-fairway IS the void — there's nowhere else to be).
  const voidGlow = arch === 'void';
  const glowRings = (sp: Vec[]) => {
    // Uniform outward OFFSETS, not centroid scales: a scale balloons a long par-4/5 corridor
    // lengthwise (34% of a 500px ribbon smeared the halo far past the tee/green ends — the
    // "sausage blob" read), while an offset hugs the actual shape like the green collar does.
    prims.push({ t: 'poly', pts: offsetPoly(sp, -13), fill: 'rgba(120,130,240,0.10)' });
    prims.push({ t: 'poly', pts: offsetPoly(sp, -6), fill: 'rgba(120,130,240,0.14)' });
  };
  // Two-tier raised shelf (GS-cetus-6): armed on a CALM cetus/void stop only (deep stops already sit
  // on extruded island platforms; other worlds are flat parkland by design).
  const calmShelf = (arch === 'cetus' || arch === 'void') && !lostHole && !rainbow;
  const shelfLook = arch === 'void' ? VOID_CLIFF : CETUS_CLIFF;
  // Fairways draw as ONE grouped pass FIRST (under tee/green/scatter) so the green apron blends into
  // the main corridor — see `styleFairways`. Everything else keeps its original per-feature order.
  const fairwaySps = hole.features.filter((f) => f.kind === 'fairway').map((f) => projPoly(f.poly, proj));
  // Rainbow Road: extrude EVERY play surface (fairway/green/tee) into a prismatic layered CLIFF
  // (GS-rainbow-polish) — the same side-on depth treatment Cetus/Void get — so the road reads as a
  // raised glowing track floating in space, not a flat decal. Drawn FIRST (behind every ribbon: the
  // ribbon caps each plateau), off the dedicated `cliffRng` (unused on the rainbow path otherwise) so
  // no other stream is perturbed; `platformCliffs` is camera-proof (fixed loop counts).
  if (rainbow) {
    const roadSps = hole.features
      .filter((f) => f.kind === 'fairway' || f.kind === 'green' || f.kind === 'tee')
      .map((f) => projPoly(f.poly, proj));
    prims.push(...platformCliffs(roadSps, deepen, cliffRng, RAINBOW_CLIFF).prims);
  }
  if (voidGlow && !rainbow) for (const sp of fairwaySps) glowRings(sp);
  // Rainbow Road: ONE continuous band grid (the main corridor's bbox) shared by the fairway, GREEN and
  // TEE ribbons — so the rainbow bands run seamlessly tee→fairway→green as a single track instead of
  // three separately-phased blobs with mismatched stripe scales at each seam (the "fairway/green don't
  // mesh" read). Computed once here; the feature loop below reuses it for the green + tee.
  const rainbowGrid = rainbow && fairwaySps[0] ? bboxOf(fairwaySps[0]) : null;
  const rainbowBandY = rainbowGrid ? rainbowGrid.minY : 0;
  const rainbowBandH = rainbowGrid ? Math.max(6, (rainbowGrid.maxY - rainbowGrid.minY) / 9) : 6;
  if (rainbow) {
    if (rainbowGrid) for (const sp of fairwaySps) prims.push(...rainbowRibbon(sp, rainbowBandY, rainbowBandH));
  } else {
    // Two-tier raised fairway SHELF (GS-cetus-6): on a CALM cetus/void stop (the whole play-bounds is
    // playable rough, so it can't be islands) lift the corridor onto a shelf above the rough — a rock
    // face + cast shadow UNDER the fairway fill — so it reads with depth like the deep-stop pads. Deep
    // stops already sit on extruded platforms, so gate to !lostHole. Pure geometry (no rng).
    if (calmShelf) for (const sp of fairwaySps) prims.push(...raisedShelf(sp, proj.scale, shelfLook));
    // GS-green-apron: the green's outward fringe/collar rings ease it into the ROUGH, but they grow
    // PAST the green edge — a green at the end of a fairway ribbon painted a dark apron ring ON TOP of
    // the bright fairway. Draw that surround HERE, UNDER the fairway pass (the fairway then covers it at
    // the green/fairway junction, its own collar handling that seam) so the apron only ever shows in the
    // rough. The green surface itself is still drawn flush, on top, in the feature loop below.
    for (const f of hole.features) {
      if (f.kind === 'green') prims.push(...styleGreenSurround(projPoly(f.poly, proj), collar, grFringe));
    }
    prims.push(...styleFairways(fairwaySps, art, fwShade, fwFringe, arch, groundedFw ? fwCollar : undefined));
    // Void corridors get a luminous rim on top of the turf (the par-3 islands' "lit platform" read):
    // without it a long par-4/5 fairway melted into the equally-purple platform margin around it.
    if (voidGlow) for (const sp of fairwaySps) prims.push({ t: 'poly', pts: sp, fill: 'none', stroke: 'rgba(165,175,255,0.5)', sw: 1.6 });
    // Cetus shelf gets a lit cyan rim so the raised edge catches the starlight (void has its own above).
    if (calmShelf && arch === 'cetus') for (const sp of fairwaySps) prims.push({ t: 'poly', pts: sp, fill: 'none', stroke: 'rgba(150,232,255,0.55)', sw: 1.6 });
  }
  for (const f of hole.features) {
    if (f.kind === 'fairway') continue; // drawn in the grouped pass above
    const sp = projPoly(f.poly, proj);
    if (rainbow) {
      // The green & tee are part of ONE continuous rainbow ribbon — they ride the SAME band grid as
      // the fairway (computed above) so the stripes line up across every seam. Scatter surfaces
      // (ice/crystal/waste) are off the road → bare void, so they're dropped (they read as OOB,
      // matching the sim's lie rule).
      if (f.kind === 'green' || f.kind === 'tee') prims.push(...rainbowRibbon(sp, rainbowBandY, rainbowBandH));
      continue;
    }
    if (voidGlow && f.kind === 'green') glowRings(sp);
    // Raise the green onto the same shelf as the fairway so the play surface reads as one continuous
    // raised mesa (GS-cetus-6) rather than the green sitting back down at rough level.
    if (calmShelf && f.kind === 'green') prims.push(...raisedShelf(sp, proj.scale, shelfLook));
    // GS-inset-2: the green reads FLUSH with the fairway — no cast shadow (a drop shadow made the
    // putting surface float proud of the turf like a raised sticker). Its own mown fringe/collar
    // rings ease it into the land; the shelf/void-glow worlds still model their raised edge.
    if (f.kind === 'green') prims.push(...styleGreen(sp, art, grShade, arch, greenSlopeArt(hole, f.poly, proj)));
    else if (f.kind === 'tee') prims.push(...styleTee(sp, art, teeShade, teeFringe));
    else prims.push(...styleScatter(f.kind, sp, art, arch));
  }

  // --- 5b2. Rainbow Road surface relief (GS-biome-relief) ---------------------
  // A gentle prismatic sheen of lit rises + violet hollows drawn ON the road ribbon (its bands are
  // opaque, so the relief rides over them) so the legendary track reads as a rolling, glowing road
  // rather than a flat decal. Clipped to the road surfaces; pure geometry (zero rng), so the rainbow
  // art stream stays byte-stable.
  if (rainbow && art.texture > 0) {
    const roadPolys = hole.features
      .filter((f) => f.kind === 'fairway' || f.kind === 'green' || f.kind === 'tee')
      .map((f) => f.poly);
    prims.push(...biomeRelief(roadPolys, RAINBOW_RELIEF, proj, art.texture));
  }

  // --- 5b. The Cetus river of stars + its cliff waterfall (GS-cetus) ----------
  // The luminous star-river threads the rough beside the fairway and pours off the cliff into the
  // ocean. Gated to cetus + own `org` stream, drawn over the land but under the hazards/flag.
  if (arch === 'cetus' && !rainbow) prims.push(...cetusRiver(hole, proj, art.accents, riverRng, cetusFaces, landPlatformsCourse));

  // --- 6. Hazards (drawn on top, per the layer rule) --------------------------
  // Draw order is layered so substances read correctly where they overlap (deep/wild holes pile
  // hazards up): SAND first as a grouped family (overlapping bunkers/craters/waste merge into one
  // excavated body — no internal seams), then exotic scatter, then the penalty LIQUIDS as grouped
  // families ON TOP (so a river cutting through a sandy waste band reads as WATER, not buried under
  // sand — the "sand showed on rivers" bug), and finally trees (canopies over everything).
  // Sand + each liquid draw from their per-hole UNION-merged bodies (GS-hazard-blend, course-space
  // + cached): touching bunkers/pots/waste fuse into ONE excavated complex with a single rim, a
  // creek + its mouth lake into one water body. Merging in COURSE space keeps the merged-body count
  // (and thus the family passes' rng draw counts) camera-proof.
  const merged = mergedHazardsFor(hole);
  // GS-hazard-edges: roughen the DRAWN bank of each liquid body (course space, zero rng) so a
  // crossing river/lava flow reads as a natural meandering/cracked hazard, not a uniform band-aid.
  const waterPolys: Vec[][] = merged.water.map((p) => projPoly(roughenHazardCached(p, 'water'), proj));
  const lavaPolys: Vec[][] = merged.lava.map((p) => projPoly(roughenHazardCached(p, 'lava'), proj));
  const sandPolys: Vec[][] = merged.sand.map((p) => projPoly(p, proj));
  const treeHaz: Feature[] = [];
  const fescueHaz: Feature[] = [];
  const deepRoughHaz: Feature[] = [];
  const ravineHaz: Feature[] = [];
  const scatterHaz: Feature[] = [];
  for (const f of hole.hazards) {
    if (f.kind === 'trees') treeHaz.push(f);
    else if (f.kind === 'fescue') fescueHaz.push(f);
    else if (f.kind === 'deeprough') deepRoughHaz.push(f);
    else if (f.kind === 'barranca') ravineHaz.push(f);
    else if (!WATER_KINDS.has(f.kind) && !LAVA_KINDS.has(f.kind) && f.kind !== 'bunker' && f.kind !== 'waste' && f.kind !== 'sand' && f.kind !== 'pot') scatterHaz.push(f);
  }
  // Rainbow Road: SAND is on the road (in-play, see `ROAD_LIES`) so bunkers/craters still draw; every
  // OTHER hazard (rough fescue, ravines, exotic scatter, water/lava, trees) is OFF the road → the bare
  // void, so it's dropped (it reads as the OOB space it now is, matching the sim's lie rule).
  if (!rainbow) {
    // Fescue rides a per-patch LOCAL stream (hole hash ⊕ course centroid): its blade count is
    // px-sized, so on the shared `rng` a zoom step re-rolled everything after it. Contained here,
    // a count step just adds/removes a blade. (Ravine's draws are a fixed count — shared is fine.)
    const patchRng = (poly: Vec[]): (() => number) => {
      const c = centroidOf(poly);
      return mulberry32((hashHole(hole) ^ Math.floor(posHash(c[0], c[1]) * 0xffffffff)) >>> 0);
    };
    for (const f of fescueHaz) prims.push(...styleFescue(projPoly(f.poly, proj), arch, patchRng(f.poly)));
    // Deep rough (GS-deep-rough) rides the same per-patch stream as fescue (its mark count is
    // screen-px-sized), themed per world archetype so the tangle suits the biome.
    for (const f of deepRoughHaz) prims.push(...styleDeepRough(projPoly(f.poly, proj), arch, patchRng(f.poly)));
    // GS-hazard-edges: a ravine/crevice cracks in sharp jagged teeth along both walls.
    for (const f of ravineHaz) prims.push(...styleRavine(projPoly(roughenHazardCached(f.poly, 'crevice'), proj), rng));
  }
  prims.push(...styleSandFamily(sandPolys, art, proj.scale, rs.base));
  if (!rainbow) {
    for (const f of scatterHaz) prims.push(...styleScatter(f.kind, projPoly(f.poly, proj), art, arch));
    // Liquids ON TOP of sand so water/lava is never occluded by an overlapping sand body.
    prims.push(...styleLiquidFamily(waterPolys, WATER_LIQ, rng, rs.base, proj.scale));
    prims.push(...styleLiquidFamily(lavaPolys, LAVA_LIQ, rng, rs.base, proj.scale));
    for (const f of treeHaz) prims.push(...styleFlora(f.poly, proj, rng, arch));
  }

  // --- 6b. Meteor-strike scorch craters (GS-meteor-scorch) ---------------------
  // The meteor-shower route's signature: charred craters burned into the turf, drawn from the SAME
  // `meteorScorch(hole)` the sim's lie conversion reads — a crater you see is exactly the lie the sim
  // plays (the graphic IS the physics). Pure (posHash variation only — zero rng draws, so the seeded
  // scene streams are untouched); off under Rainbow Road (whose road rule ignores scorch).
  if (opts.meteorScorch && !rainbow) prims.push(...styleScorch(meteorScorchFor(hole), proj));
  // Effect ground patches (GS-journey-fx-2): same contract as the craters — drawn from the SAME
  // `effectPatches(hole, kind)` the sim's lie conversion reads, posHash variation only (zero rng).
  if (opts.groundPatch && !rainbow) prims.push(...stylePatches(opts.groundPatch, effectPatchesFor(hole, opts.groundPatch), proj));

  // --- 6c. Trade-camp tents (GS-tents) ----------------------------------------
  // The trade-market route's signature: a ring of bright, collidable tents around the green. Drawn in
  // COURSE space (projected) so they sit on the ground and track the follow-cam — the fix for the old
  // screen-space caravan that floated in mid-air over the controls / the flight. Pure (no rng); off the
  // road under Rainbow Road (they'd be in the OOB void).
  // Tents live on ONE stamped hole of the stop (GS-tent-interactions) — draw only when this hole carries them.
  if (opts.tradeTents && !rainbow && hole.tents) prims.push(...styleTents(tradeTentsFor(hole), proj));

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
      // A warp beacon adrift on the boundary: soft glow + a lit diamond, bobbed by a position hash
      // of the COURSE stake (screen coords would make the bob jitter as the follow-cam moves).
      const by = y - 4 - posHash(s[0], s[1]) * 3;
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

/** A per-hole deterministic SVG id prefix — same hole → same ids (byte-stable renders), different
 *  holes → disjoint ids, so several hole SVGs can share one document (see scenePrimsToSvg). */
export function holeIdPrefix(hole: Hole): string {
  return `gs${hashHole(hole).toString(36)}`;
}

/**
 * Render a prim list to an SVG fragment string (pure). Clip/gradient ids are a deterministic
 * counter under `idPrefix` — and the prefix MUST be unique per distinct scene when several hole
 * SVGs share one document: SVG ids are document-global, so two fragments both using `gsc0` make
 * every `url(#gsc0)` resolve to the FIRST panel's clip geometry — the other panel's stripes get
 * clipped away and its glows borrow the wrong gradient (the gallery/test-hub cross-panel bleed).
 * `renderHoleSVG` passes a hole-hash prefix: the same hole re-rendered stays byte-identical, and
 * identical ids across copies of the SAME hole reference identical geometry, so they stay harmless.
 */
export function scenePrimsToSvg(prims: Prim[], idPrefix = 'gs'): string {
  let clipId = 0;
  let glowId = 0;
  const one = (p: Prim): string => {
    switch (p.t) {
      case 'glow': {
        const id = `${idPrefix}g${glowId++}`;
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
      case 'path': {
        const dash = p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : '';
        const cap = p.round ? ' stroke-linecap="round" stroke-linejoin="round"' : '';
        return `<polyline points="${ptsStr(p.pts)}" fill="none" stroke="${p.stroke}" stroke-width="${p.sw}"${cap}${dash} />`;
      }
      case 'clip': {
        const id = `${idPrefix}c${clipId++}`;
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
      case 'path': {
        path(p.pts); // NO closePath — an isoline is an open curve
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.lineCap = p.round ? 'round' : 'butt';
        ctx.lineJoin = p.round ? 'round' : 'miter';
        ctx.setLineDash(p.dash ?? []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
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
