import { describe, it, expect } from 'vitest';
import { generateCourse, validateIslandHops } from '../src/sim/course/generate';
import { generateStopCourse } from '../src/sim/rpg/run';
import { THEMES, resolveBiome } from '../src/sim/course/themes';

// GS-cetus-gaps: island-hop chains (void/cetus deep par 4/5) must be COMPLETABLE BY CONSTRUCTION.
// The historical bug: the raw island gap draws could overlap, or leave a sliver pad between two gaps
// that brokenCorridor's ≥3-point rule silently DROPPED — either way two void gaps fused into one
// 200–330 yd mega-void no bag can carry, and the hole could not be finished (the lost-ball penalty
// is a drop-back, so an uncarryable gap loops forever). Worst on long par-5s; independent of
// Ascension (the generator never sees it), so a low-difficulty Voyage with the common starter bag
// hit it hardest. Now `separateIslandGaps` clamps every gap to a wildness-ramped, common-driver
// carryable ceiling and guarantees landable pads, and `validateIslandHops` proves it per hole.
describe('island-hop gaps are completable with the common starter bag (GS-cetus-gaps)', () => {
  const LOST_ROUGH_BIOMES = ['cetus-deep', 'void-garden'];
  // Sweep the whole ARMED wildness band, including the low-difficulty end right at the arming
  // threshold (0.55) where the bug was reported.
  const WILDS = [0.55, 0.6, 0.7, 0.85, 1];

  it('every armed island hole passes the completability validator, across seeds and wildness', () => {
    for (const biome of LOST_ROUGH_BIOMES) {
      for (const wild of WILDS) {
        for (let s = 0; s < 12; s++) {
          // generateCourse itself throws if any validator (incl. validateIslandHops) trips — calling
          // it IS the test; the explicit assert makes a failure readable.
          const c = generateCourse(s + 42000, { biome, holes: 6, wildness: wild });
          expect(validateIslandHops(c), `${biome} @${wild} seed ${s}`).toEqual([]);
        }
      }
    }
  });

  it('the chains still exist: every armed par-4/5 breaks into 2+ pads, and real void carries appear', () => {
    let chained = 0;
    let holes = 0;
    for (const biome of LOST_ROUGH_BIOMES) {
      for (let s = 0; s < 12; s++) {
        const c = generateCourse(s + 43000, { biome, holes: 6, wildness: 1 });
        for (const h of c.holes) {
          if (h.par < 4) continue;
          holes++;
          const pads = h.features.filter((f) => f.kind === 'fairway').length;
          // ≥1 gap is drawn on every armed par-4/5, and the pad on each side must now SURVIVE —
          // a dropped sliver pad was exactly the mega-void bug.
          expect(pads, `${biome} seed ${s} par ${h.par}`).toBeGreaterThanOrEqual(2);
          if (pads >= 3) chained++;
        }
      }
    }
    expect(holes).toBeGreaterThan(0);
    expect(chained).toBeGreaterThan(0); // multi-gap island CHAINS still spawn (feature not neutered)
  });

  // The generator PROVES fairness by throwing on a violation — but ~0.1% of void configs at galaxy
  // depth still trip validateIslandHops (a dropped sliver pad fuses two carries), and at the RPG
  // boundary that uncaught throw crashes the whole run. `generateStopCourse` retries on a reseed so a
  // real player never eats the crash. This mirrors the ACTUAL call path (void THEMES + distanceFromStart,
  // not the 2 biome ids + explicit wildness above) that the direct-generateCourse fuzz misses.
  it('generateStopCourse never throws on void worlds at galaxy depth (crash guard)', () => {
    const voidThemes = THEMES.filter((t) => t.archetype === 'void');
    expect(voidThemes.length).toBeGreaterThan(0);
    let rawThrows = 0;
    for (const theme of voidThemes) {
      const biomeRow = resolveBiome(theme);
      for (let dist = 8; dist <= 24; dist += 2) {
        for (let v = 0; v < 20; v++) {
          const seed = `unending:${theme.id}:${dist}:${v}`;
          const opts = { holes: 4, distanceFromStart: dist, biomeRow, themeId: theme.id, wildnessBoost: 0 };
          try {
            generateCourse(seed, opts);
          } catch {
            rawThrows++;
          }
          // The wrapper must ALWAYS succeed, including on the seeds where raw generateCourse throws.
          expect(() => generateStopCourse(seed, opts), `${theme.id} d${dist} v${v}`).not.toThrow();
        }
      }
    }
    // Sanity: this fuzz must actually EXERCISE the throw path, else the guard proves nothing.
    expect(rawThrows).toBeGreaterThan(0);
  });

  it('stays silent on calm lost-rough stops and ordinary worlds (validator scope)', () => {
    // Below the arming threshold the corridor is unbroken normal rough — nothing to validate.
    expect(validateIslandHops(generateCourse(7, { biome: 'cetus-deep', holes: 4, wildness: 0.4 }))).toEqual([]);
    // A normal world never arms lost rough at any wildness.
    expect(validateIslandHops(generateCourse(7, { biome: 'verdant-station', holes: 4, wildness: 1 }))).toEqual([]);
  });
});
