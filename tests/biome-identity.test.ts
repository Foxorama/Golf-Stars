import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG } from '../src/render/holeView';
import { ARCHETYPE_TURF, ARCHETYPE_SPACE, OB_LOOK } from '../src/render/palette';
import { WIND_RGBA, AMBIENT } from '../src/render/weather';
import { BIOMES } from '../src/sim/course/biomes';
import type { BiomeArchetype } from '../src/sim/course/themes';

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
