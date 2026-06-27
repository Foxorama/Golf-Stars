import { describe, it, expect } from 'vitest';
import { renderHoleSVG } from '../src/render/holeView';
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
    expect(Object.keys(CONSTELLATION_FIGURES).length).toBe(28);
  });

  it('a themed render draws the constellation; an un-themed one does not', () => {
    const plain = renderHoleSVG(hole, { biome: 'ember-world' });
    const themed = renderHoleSVG(hole, { biome: 'ember-world', themeId: 'scorpius' });
    expect(themed).not.toBe(plain);
    expect(themed.length).toBeGreaterThan(plain.length); // extra figure prims
  });

  it('deep-sky themes (no stick figure) leave the render byte-identical to un-themed', () => {
    const plain = renderHoleSVG(hole, { biome: 'void-garden' });
    const deepSky = renderHoleSVG(hole, { biome: 'void-garden', themeId: 'orion-nebula' });
    expect(deepSky).toBe(plain);
  });

  it('the same theme renders byte-for-byte identically (determinism)', () => {
    const a = renderHoleSVG(hole, { biome: 'ice-ring', themeId: 'cygnus' });
    const b = renderHoleSVG(hole, { biome: 'ice-ring', themeId: 'cygnus' });
    expect(a).toBe(b);
  });
});
