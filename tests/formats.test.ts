import { describe, it, expect } from 'vitest';
import { FORMATS, getFormat, stopSpecFor } from '../src/sim/rpg/formats';
import { generateCourse } from '../src/sim/course/generate';
import { currentCourse, currentTheme, simulateRun, startRun, travel, routeOptions } from '../src/sim/rpg/run';
import { resolveBiome } from '../src/sim/course/themes';

describe('run formats (GS-9)', () => {
  it('stopSpecFor clamps past the end of the ladder', () => {
    const ladder = getFormat('ladder');
    expect(stopSpecFor(ladder, 0).holes).toBe(3);
    expect(stopSpecFor(ladder, 99).holes).toBe(ladder.stops[ladder.stops.length - 1]!.holes);
    expect(getFormat('nonsense').id).toBe('flat'); // unknown → default
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

  it("the flat format reproduces the fixed 6-hole stop (now theme-driven, GS-17)", () => {
    const run = startRun(1234, 'flat');
    const course = currentCourse(run);
    expect(course.holes.length).toBe(6);
    // Identical to generating that stop directly with 6 holes from the SAME theme: the stop's
    // theme selects the biome + tags the course id, deterministically from the run.
    const theme = currentTheme(run);
    const direct = generateCourse(`${run.seed}:stop:0`, {
      holes: 6,
      distanceFromStart: 0,
      biomeRow: resolveBiome(theme),
      themeId: theme.id,
    });
    expect(course).toEqual(direct);
  });

  it('the ladder format escalates: stop 0 is 3 par-3s, later stops grow', () => {
    let run = startRun(7, 'ladder');
    const c0 = currentCourse(run);
    expect(c0.holes.length).toBe(3);
    expect(c0.holes.every((h) => h.par === 3)).toBe(true);

    run = travel(run, routeOptions(run)[0]!);
    expect(currentCourse(run).holes.length).toBe(6);
  });

  it('a ladder run still terminates by missing a cut', () => {
    const { run } = simulateRun(7, { formatId: 'ladder' });
    expect(run.status).toBe('ended');
    expect(run.formatId).toBe('ladder');
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
