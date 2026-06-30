import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { renderHoleSVG } from '../src/render/holeView';
import { lieInfo, PEN_INFO } from '../src/sim/shot';
import { archetypeBiome } from '../src/sim/course/themes';
import { biomeById } from '../src/sim/course/biomes';

// GS-cetus: the Whale constellation's clifftop star-ocean. Mechanically it reuses the void's proven-fair
// island/abyss model (off the plateau is lost to the star-ocean); the river/waterfall/whales are pure,
// gated render decor. (The fairness + no-death-spiral bars are covered generically by tests/worlds.test
// and tests/themes.test, which now include Cetus.)
describe('Cetus — the star-ocean clifftop world (GS-cetus)', () => {
  it('wires the clifftop lost-rough lie + a drop-back (non-replay) penalty', () => {
    const cetus = biomeById('cetus-deep')!;
    expect(cetus.lostRough).toBe('cetusdeep');
    expect(lieInfo('cetusdeep').penalty).toBe('cetuslost');
    // A +1 DROP-BACK like the void's lost-rough — never a stroke-and-distance ball-shredder.
    expect(PEN_INFO.cetuslost.strokes).toBe(1);
    expect(PEN_INFO.cetuslost.replay).toBe(false);
    expect(archetypeBiome('cetus')).toBe('cetus-deep');
  });

  it('generates valid, fair, carryable courses (inherits the void island machinery)', () => {
    for (let s = 0; s < 12; s++) {
      for (const wild of [0.3, 0.7, 1]) {
        const c = generateCourse(s + 70000, { biome: 'cetus-deep', holes: 4, wildness: wild });
        expect(validateCourse(c), `@${wild}`).toEqual([]);
        expect(validateFairness(c), `@${wild}`).toEqual([]);
        expect(validateCrossings(c), `@${wild}`).toEqual([]);
      }
    }
  });

  it('draws the bespoke star-river decor, byte-stably, ONLY on Cetus (the render gating proof)', () => {
    const c = generateCourse(7, { biome: 'cetus-deep', holes: 4, wildness: 0.5 });
    const hole = c.holes.find((h) => h.par >= 4) ?? c.holes[0]!;
    const RIVER = 'rgba(70,180,225,0.85)'; // the star-river's glowing water — emitted only by the cetus decor
    const a = renderHoleSVG(hole, { width: 320, height: 480, biome: 'cetus-deep', themeId: 'cetus' });
    const b = renderHoleSVG(hole, { width: 320, height: 480, biome: 'cetus-deep', themeId: 'cetus' });
    expect(a).toBe(b); // deterministic / byte-stable
    expect(a).toContain(RIVER);
    // The SAME hole rendered as another world has no cetus decor (gated to arch === 'cetus').
    expect(renderHoleSVG(hole, { width: 320, height: 480, biome: 'verdant-station' })).not.toContain(RIVER);
  });
});
