import { describe, it, expect } from 'vitest';
import { renderHoleSVG } from '../src/render/holeView';
import { buildScene } from '../src/render/style';
import { holeProjector } from '../src/render/project';
import { CONSTELLATION_FIGURES, constellationFigure } from '../src/render/constellations';
import { generateCourse } from '../src/sim/course/generate';
import { THEMES } from '../src/sim/course/themes';

const hole = generateCourse(123, { holes: 1 }).holes[0]!;

describe('constellation backdrop (GS-17e)', () => {
  it('there is a figure for every constellation theme, normalized into the unit box', () => {
    const constThemes = THEMES.filter((t) => t.kind === 'constellation');
    for (const t of constThemes) {
      const fig = constellationFigure(t.id);
      expect(fig, `figure for ${t.id}`).toBeDefined();
      expect(fig!.stars.length).toBeGreaterThan(0);
      for (const s of fig!.stars) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(1);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(1);
      }
      // Stick-figure line indices are in range.
      for (const [a, b] of fig!.lines) {
        expect(a).toBeLessThan(fig!.stars.length);
        expect(b).toBeLessThan(fig!.stars.length);
      }
    }
    expect(Object.keys(CONSTELLATION_FIGURES).length).toBe(36);
  });

  it('a themed render draws the constellation; an un-themed one does not', () => {
    const plain = renderHoleSVG(hole, { biome: 'ember-world' });
    const themed = renderHoleSVG(hole, { biome: 'ember-world', themeId: 'scorpius' });
    expect(themed).not.toBe(plain);
    expect(themed.length).toBeGreaterThan(plain.length); // extra figure prims
  });

  it('deep-sky themes (no stick figure) add NO figure prims (only the turf/ground tint differs)', () => {
    // Structural invariant: the per-theme tint (GS-17f) recolours fills but adds no prims, while a
    // constellation theme adds the figure's line/circle prims. A deep-sky theme has no figure → same
    // prim COUNT as un-themed; a constellation theme has MORE.
    const proj = holeProjector(hole, { width: 320, height: 420 });
    const base = { width: 320, height: 420, biome: 'void-garden' } as const;
    const plain = buildScene(hole, proj, base).length;
    const deepSky = buildScene(hole, proj, { ...base, themeId: 'orion-nebula' }).length;
    const constellation = buildScene(hole, proj, { ...base, themeId: 'sagittarius' }).length;
    expect(deepSky).toBe(plain); // no figure added
    expect(constellation).toBeGreaterThan(plain); // figure prims added
  });

  it('a per-theme tint recolours the turf/ground (GS-17f) without changing structure', () => {
    // Same hole + theme with vs without the figure-bearing constellation still tints the ground.
    const plain = renderHoleSVG(hole, { biome: 'void-garden' });
    const tinted = renderHoleSVG(hole, { biome: 'void-garden', themeId: 'orion-nebula' });
    expect(tinted).not.toBe(plain); // the turf/ground hue shifted
  });

  it('the same theme renders byte-for-byte identically (determinism)', () => {
    const a = renderHoleSVG(hole, { biome: 'ice-ring', themeId: 'cygnus' });
    const b = renderHoleSVG(hole, { biome: 'ice-ring', themeId: 'cygnus' });
    expect(a).toBe(b);
  });
});
