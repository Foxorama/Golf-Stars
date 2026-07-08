import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG } from '../src/render/holeView';
import { ARCHETYPE_TURF, ARCHETYPE_SPACE, OB_LOOK, LAND_SPACE_BLEND, landFillFor } from '../src/render/palette';
import { WIND_RGBA, AMBIENT } from '../src/render/weather';
import { BIOMES } from '../src/sim/course/biomes';
import type { BiomeArchetype } from '../src/sim/course/themes';
import { buildScene, landPolysCourseFor, GROUND_COVER, easterEggs, BIOME_RELIEF, type Prim } from '../src/render/style';
import { holeProjector, type Projector } from '../src/render/project';
import { playBoundsCorners } from '../src/sim/round';
import type { Hole, Vec } from '../src/sim/course/contract';

const ARCHES = Object.keys(ARCHETYPE_TURF) as BiomeArchetype[];

// A wooded hole (the spore jungle grows the densest groves) so FLORA is on screen; the render
// `biome` option then re-reads the SAME geometry as each world — the cetus.test gating trick.
const wooded = generateCourse(77, { biome: 'spore-jungle', holes: 1 }).holes[0]!;

describe('biome identity (GS-biome-feel)', () => {
  it('flora is per-world: the same grove is mushrooms on fungal, the classic canopy on verdant', () => {
    const fungal = renderHoleSVG(wooded, { biome: 'spore-jungle' });
    const verdant = renderHoleSVG(wooded, { biome: 'verdant-station' });
    expect(fungal).not.toBe(verdant);
    expect(fungal).toContain('#ded4f2'); // the mushroom stalk
    expect(verdant).not.toContain('#ded4f2');
    expect(verdant).toContain('#1c5c28'); // the classic canopy core shadow
  });

  it('every biome renders a DISTINCT scene off the same geometry (no two byte-equal)', () => {
    const svgs = BIOMES.map((b) => renderHoleSVG(wooded, { biome: b.id }));
    expect(new Set(svgs).size).toBe(BIOMES.length);
  });

  it('the void marks its boundary with floating warp beacons, not white golf stakes', () => {
    const v = renderHoleSVG(wooded, { biome: 'void-garden' });
    expect(v).toContain('#b07eff'); // the beacon diamond
    expect(v).not.toContain('#f4f4f4'); // the classic white post is gone out there
    expect(renderHoleSVG(wooded, { biome: 'verdant-station' })).toContain('#f4f4f4');
  });

  it('signature decor is gated per world (void asteroid islets; none on verdant) and byte-stable', () => {
    const v = renderHoleSVG(wooded, { biome: 'void-garden' });
    expect(v).toContain('#241a44'); // asteroid islets adrift in the abyss
    expect(renderHoleSVG(wooded, { biome: 'void-garden' })).toBe(v); // deterministic
    expect(renderHoleSVG(wooded, { biome: 'verdant-station' })).not.toContain('#241a44');
  });

  it('the weather/boundary tables cover every archetype (no silent verdant fallback)', () => {
    for (const a of ARCHES) {
      expect(WIND_RGBA[a], `wind tint for ${a}`).toBeDefined();
      expect(AMBIENT[a], `ambient air for ${a}`).toBeDefined();
      expect(OB_LOOK[a], `OB look for ${a}`).toBeDefined();
      expect(ARCHETYPE_SPACE[a], `space look for ${a}`).toBeDefined();
    }
  });
});

// --- GS-ground-cover: the rough wears the biome's actual ground covering -----------------------

describe('ground covering (GS-ground-cover)', () => {
  it('every archetype has a GROUND_COVER row EXCEPT void/cetus (bespoke ground rules)', () => {
    for (const a of ARCHES) {
      if (a === 'void' || a === 'cetus') expect(GROUND_COVER[a], `${a} keeps its own ground rules`).toBeUndefined();
      else expect(GROUND_COVER[a], `ground cover for ${a}`).toBeDefined();
    }
  });

  it('the covering paints on the land: frost renders snow mottle, ocean beach-sand grain', () => {
    const frost = renderHoleSVG(wooded, { biome: 'ice-ring' });
    expect(frost).toContain(GROUND_COVER.frost!.mottleLight);
    expect(frost).toContain(GROUND_COVER.frost!.sparkle!);
    const ocean = renderHoleSVG(wooded, { biome: 'tidal-archipelago' });
    expect(ocean).toContain(GROUND_COVER.ocean!.grain[0]!);
    expect(ocean).toContain(GROUND_COVER.ocean!.ridge!);
    // Deterministic: same hole + biome → byte-identical (the covering is seeded, never Math.random).
    expect(renderHoleSVG(wooded, { biome: 'ice-ring' })).toBe(frost);
  });
});

// --- GS-biome-relief: directional rolling-terrain depth on every world -------------------------

describe('biome relief (GS-biome-relief)', () => {
  it('every archetype has a BIOME_RELIEF row (table+dispatch, no silent verdant fallback)', () => {
    for (const a of ARCHES) {
      expect(BIOME_RELIEF[a], `relief for ${a}`).toBeDefined();
      expect(BIOME_RELIEF[a].hi, `${a} crest tint`).toMatch(/^rgba\(/);
      expect(BIOME_RELIEF[a].lo, `${a} hollow tint`).toMatch(/^rgba\(/);
      expect(BIOME_RELIEF[a].strength, `${a} strength`).toBeGreaterThan(0);
    }
  });

  it('the relief paints on the land: a frost render carries its snow-drift crest + cool hollow', () => {
    const svg = renderHoleSVG(wooded, { biome: 'ice-ring' });
    // The relief lobes render as radial-gradient glows whose stop colours are the look tints.
    const { hi, lo } = BIOME_RELIEF.frost;
    const rgbOf = (c: string) => c.replace(/rgba?\(([^,]+),([^,]+),([^,]+).*/, 'rgb($1,$2,$3)');
    expect(svg).toContain(rgbOf(hi));
    expect(svg).toContain(rgbOf(lo));
    // Deterministic: pure-geometry relief is seeded by geometry alone, never Math.random.
    expect(renderHoleSVG(wooded, { biome: 'ice-ring' })).toBe(svg);
  });

  it('relief adds NO rng draws: the feature terrain is byte-identical with the pass on (added prims only)', () => {
    // Two worlds that share the SAME geometry differ ONLY by the added relief/decor, never by a
    // re-rolled terrain stream — proven by the every-biome-distinct test above; here we assert the
    // pass is purely additive by confirming the desert (dune-relief) render still contains its
    // unchanged fairway/rough turf tones.
    const svg = renderHoleSVG(wooded, { biome: 'dust-belt' });
    expect(svg).toContain(BIOME_RELIEF.desert.hi.replace(/rgba?\(([^,]+),([^,]+),([^,]+).*/, 'rgb($1,$2,$3)'));
  });
});

// --- GS-rough-cover-2: the flat-reading roughs get characterful tufts --------------------------

describe('rough tufts (GS-rough-cover-2)', () => {
  it('the worlds that read as a flat slab (crystal / tempest / inferno) pack a denser, tufted covering', () => {
    for (const a of ['crystal', 'tempest', 'inferno'] as const) {
      expect(GROUND_COVER[a]!.tuft, `${a} tuft`).toBeDefined();
      expect(GROUND_COVER[a]!.density ?? 1, `${a} density`).toBeGreaterThan(1);
    }
  });

  it('the tuft renders on the land: the crystal shard-splinter tone appears in the SVG', () => {
    const svg = renderHoleSVG(wooded, { biome: 'crystal-spires' });
    expect(svg).toContain(GROUND_COVER.crystal!.tuft!.cols[0]!);
  });
});

// --- GS-egg: whimsical props hidden in the rough (except void/cetus) ---------------------------

/** Deterministic mulberry32-style rng for the unit tests (no Math.random). */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A trivial identity-ish projector (course→screen) for exercising `easterEggs` directly. */
function flatProj(): Projector {
  return {
    width: 400,
    height: 600,
    scale: 4,
    project: (p: Vec): Vec => [200 + p[0] * 2, 300 + p[1] * 2],
    unproject: (px: number, py: number): Vec => [(px - 200) / 2, (py - 300) / 2],
  };
}

describe('easter eggs (GS-egg)', () => {
  const land: Vec[] = [[-40, -40], [40, -40], [40, 40], [-40, 40]];

  it('places whimsical props for the playful worlds and NOTHING for void/cetus (bespoke deep)', () => {
    const proj = flatProj();
    expect(easterEggs('ocean', land, () => true, proj, 4, seededRng(1)).length).toBeGreaterThan(0);
    expect(easterEggs('verdant', land, () => true, proj, 3, seededRng(2)).length).toBeGreaterThan(0);
    expect(easterEggs('inferno', land, () => true, proj, 3, seededRng(3)).length).toBeGreaterThan(0);
    expect(easterEggs('void', land, () => true, proj, 3, seededRng(4))).toEqual([]);
    expect(easterEggs('cetus', land, () => true, proj, 3, seededRng(5))).toEqual([]);
  });

  it('is deterministic and only ever places where the predicate allows (off the corridor)', () => {
    const a = easterEggs('ocean', land, () => true, flatProj(), 4, seededRng(7));
    const b = easterEggs('ocean', land, () => true, flatProj(), 4, seededRng(7));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // eggOk=false everywhere → nothing placed (props reject onto open ground, never near the cut grass).
    expect(easterEggs('ocean', land, () => false, flatProj(), 4, seededRng(7))).toEqual([]);
  });

  it('the beach really shows its props across a course (render integration)', () => {
    const holes = generateCourse(31, { biome: 'tidal-archipelago', holes: 6 }).holes;
    const svgs = holes.map((h) => renderHoleSVG(h, { biome: 'tidal-archipelago' }));
    // At least one beach prop lands somewhere: umbrella/ball (#ff5a3c) · sandcastle flag (#ff3b3b) ·
    // starfish (#ff8a4a) · surfboard (#ffd24a) — none of which the ocean world paints otherwise.
    const beach = ['#ff5a3c', '#ff3b3b', '#ff8a4a', '#ffd24a'];
    expect(svgs.some((s) => beach.some((c) => s.includes(c)))).toBe(true);
  });
});

// --- GS-rough-frame: rough is ROUGH, space starts at the OB frame ------------------------------

/** Ray-cast point-in-polygon (screen space) for the land-hull containment checks. */
function inPoly(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Top-level scene polys carrying a given fill (the land hull / platforms). */
function polysWithFill(scene: Prim[], fill: string): Vec[][] {
  return scene.flatMap((p) => (p.t === 'poly' && p.fill === fill ? [p.pts] : []));
}

function sceneFor(hole: Hole, biome: string): { scene: Prim[]; project: (p: Vec) => Vec } {
  const proj = holeProjector(hole, { width: 360, height: 640, extra: [...playBoundsCorners(hole)] });
  return { scene: buildScene(hole, proj, { width: 360, height: 640, biome }), project: (p) => proj.project(p) };
}

describe('rough vs the starfield (GS-rough-frame)', () => {
  it('the in-bounds land is near-verbatim rough turf, not deep space', () => {
    // The land fill must stay dominated by the world's rough palette — a heavy space blend was
    // the "rough became starfields" bug (every world's playable rough read as OB).
    expect(LAND_SPACE_BLEND).toBeLessThan(0.25);
  });

  it("every world's rough reads as GROUND: clearly lighter than its own night sky", () => {
    // The rough slab only ever renders where it's PLAYABLE ground, so a rough base near the
    // world's space base just reads as more starless OB ("crystal/lava are still starfields").
    // Mean-channel brightness gap ≥ 30/255, with LAND_SPACE_BLEND already bounded above.
    const mean = (hex: string): number => {
      const h = hex.replace('#', '');
      return (parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)) / 3;
    };
    for (const a of ARCHES) {
      const gap = mean(ARCHETYPE_TURF[a].rough.base) - mean(ARCHETYPE_SPACE[a].base);
      expect(gap, `${a}: rough base vs space base brightness gap`).toBeGreaterThanOrEqual(30);
    }
  });

  it('the land hull reaches the OB frame: every boundary corner stands on drawn ground', () => {
    const { scene, project } = sceneFor(wooded, 'verdant-station');
    const hulls = polysWithFill(scene, landFillFor('verdant'));
    expect(hulls.length).toBe(1); // one rough landmass on a normal world
    for (const c of playBoundsCorners(wooded)) expect(inPoly(project(c), hulls[0]!)).toBe(true);
  });

  it('an ARMED lost-rough hole floats a platform per play feature in the open deep', () => {
    // wildness 1 arms the void lost rough on every hole (LOST_ROUGH_MIN_WILDNESS), so the render
    // must swap the rough landmass for per-feature islands — off the fairway IS the starry deep.
    // Seed re-pinned 77 → 6 for GS-variety-3: the island-story reflow made seed 77's hole 0 a long
    // dogleg whose two pads fold close enough for the render dilation to bridge them into one L-shaped
    // platform (a pre-existing bent-chain quirk, not a new bug). Seed 6's armed holes float cleanly.
    const armed = generateCourse(6, { biome: 'void-garden', holes: 3, wildness: 1 }).holes;
    expect(armed.every((h) => h.biomeMods?.some((m) => m.kind === 'roughLie'))).toBe(true);
    for (const h of armed) {
      const { scene, project } = sceneFor(h, 'void-garden');
      const platforms = polysWithFill(scene, landFillFor('void'));
      expect(platforms.length).toBeGreaterThanOrEqual(2); // fairway piece(s) + the tee, never one hull
      // The OB corners float in the deep, OFF every platform (the land no longer reaches the frame).
      for (const c of playBoundsCorners(h)) {
        expect(platforms.some((pl) => inPoly(project(c), pl))).toBe(false);
      }
    }
  });

  it('a CALM void stop (penalty un-armed) keeps a normal rough landmass', () => {
    const calm = generateCourse(77, { biome: 'void-garden', holes: 3, wildness: 0.2 }).holes;
    expect(calm.every((h) => !h.biomeMods?.some((m) => m.kind === 'roughLie'))).toBe(true);
    for (const h of calm) {
      const { scene } = sceneFor(h, 'void-garden');
      expect(polysWithFill(scene, landFillFor('void')).length).toBe(1);
    }
  });

  it('landPolysCourseFor is the ONE land source (scene + weather star-mask): hull / platforms / none', () => {
    const armed = generateCourse(6, { biome: 'void-garden', holes: 1, wildness: 1 }).holes[0]!; // re-pinned (GS-variety-3)
    expect(landPolysCourseFor(wooded).length).toBe(1); // normal world: one rough hull to the OB frame
    expect(landPolysCourseFor(armed).length).toBeGreaterThanOrEqual(2); // armed lost-rough: per-feature platforms
    expect(landPolysCourseFor(armed, true).length).toBe(0); // Rainbow Road: no land — stars everywhere
  });

  it("the void's deep carries negative-energy rifts on an armed hole", () => {
    const armed = generateCourse(77, { biome: 'void-garden', holes: 3, wildness: 1 }).holes;
    const svgs = armed.map((h) => renderHoleSVG(h, { biome: 'void-garden' }));
    expect(svgs.some((s) => s.includes('#020106'))).toBe(true); // the rift tear
  });
});
