import { describe, it, expect } from 'vitest';
import { FORMATS, getFormat, stopSpecFor } from '../src/sim/rpg/formats';
import { generateCourse } from '../src/sim/course/generate';
import { currentCourse, currentTheme, simulateRun, startRun, travel, routeOptions } from '../src/sim/rpg/run';
import { resolveBiome } from '../src/sim/course/themes';

describe('run formats (GS-9)', () => {
  it('stopSpecFor clamps past the end of the stop list; retired/unknown ids fold to the default', () => {
    const voyage = getFormat('voyage');
    expect(stopSpecFor(voyage, 99).holes).toBe(voyage.stops[voyage.stops.length - 1]!.holes);
    expect(getFormat('nonsense').id).toBe('unending'); // unknown → default
    // The retired roguelites (GS-unending) fold into the default so an old save still resumes.
    expect(getFormat('flat').id).toBe('unending');
    expect(getFormat('ladder').id).toBe('unending');
  });

  it('parCap forces an all-par-3 course without changing the rest of the RNG stream', () => {
    const capped = generateCourse('x', { holes: 9, parCap: 3 });
    expect(capped.holes.every((h) => h.par === 3)).toBe(true);
    const cap4 = generateCourse('x', { holes: 9, parCap: 4 });
    expect(cap4.holes.every((h) => h.par <= 4)).toBe(true);
    // The hole geometry/biome are unchanged by the cap (only par is clamped).
    const uncapped = generateCourse('x', { holes: 9 });
    expect(cap4.biome).toBe(uncapped.biome);
    expect(cap4.holes[0]!.tee).toEqual(uncapped.holes[0]!.tee);
  });

  it('the Unending Universe plays 4-hole stops forever, generated from the stop theme (GS-unending)', () => {
    let run = startRun(1234, 'unending');
    const course = currentCourse(run);
    expect(course.holes.length).toBe(4);
    // Identical to generating that stop directly with 4 holes from the SAME theme: the stop's
    // theme selects the biome + tags the course id, deterministically from the run.
    const theme = currentTheme(run);
    const direct = generateCourse(`${run.seed}:stop:0`, {
      holes: 4,
      distanceFromStart: 0,
      biomeRow: resolveBiome(theme),
      themeId: theme.id,
    });
    expect(course).toEqual(direct);
    // Every later stop repeats the 4-hole spec (the run ends by the survival bar, not length).
    run = travel(run, routeOptions(run)[0]!);
    expect(currentCourse(run).holes.length).toBe(4);
    expect(stopSpecFor(getFormat('unending'), 99).holes).toBe(4);
  });

  it('an Unending-Universe run terminates by failing the survival bar', () => {
    const { run } = simulateRun(7, { formatId: 'unending' });
    expect(run.status).toBe('ended');
    expect(run.endedReason).toBe('cut');
    expect(run.formatId).toBe('unending');
  });

  it('every format is internally consistent (holes ≥ 1, sane parCap)', () => {
    for (const f of Object.values(FORMATS)) {
      for (const s of f.stops) {
        expect(s.holes).toBeGreaterThanOrEqual(1);
        if (s.parCap !== undefined) expect([3, 4, 5]).toContain(s.parCap);
      }
    }
  });
});
