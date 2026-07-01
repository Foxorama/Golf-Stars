import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG } from '../src/render/holeView';
import { ARCHETYPE_TURF, ARCHETYPE_SPACE, OB_LOOK, LAND_SPACE_BLEND, landFillFor } from '../src/render/palette';
import { WIND_RGBA, AMBIENT } from '../src/render/weather';
import { BIOMES } from '../src/sim/course/biomes';
import type { BiomeArchetype } from '../src/sim/course/themes';
import { buildScene, type Prim } from '../src/render/style';
import { holeProjector } from '../src/render/project';
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

  it('the land hull reaches the OB frame: every boundary corner stands on drawn ground', () => {
    const { scene, project } = sceneFor(wooded, 'verdant-station');
    const hulls = polysWithFill(scene, landFillFor('verdant'));
    expect(hulls.length).toBe(1); // one rough landmass on a normal world
    for (const c of playBoundsCorners(wooded)) expect(inPoly(project(c), hulls[0]!)).toBe(true);
  });

  it('an ARMED lost-rough hole floats a platform per play feature in the open deep', () => {
    // wildness 1 arms the void lost rough on every hole (LOST_ROUGH_MIN_WILDNESS), so the render
    // must swap the rough landmass for per-feature islands — off the fairway IS the starry deep.
    const armed = generateCourse(77, { biome: 'void-garden', holes: 3, wildness: 1 }).holes;
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

  it("the void's deep carries negative-energy rifts on an armed hole", () => {
    const armed = generateCourse(77, { biome: 'void-garden', holes: 3, wildness: 1 }).holes;
    const svgs = armed.map((h) => renderHoleSVG(h, { biome: 'void-garden' }));
    expect(svgs.some((s) => s.includes('#020106'))).toBe(true); // the rift tear
  });
});
