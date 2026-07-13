import { describe, it, expect } from 'vitest';
import { startRun } from '../src/sim/rpg/run';
import { currentCourse } from '../src/sim/rpg/runCourse';
import { snapshotRun, resumeRun } from '../src/sim/rpg/run';
import { STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';
import {
  addStrokeRecord,
  bestStrokeFor,
  bestStrokeRounds,
  isBetterStroke,
  isNewCourseRecord,
  coursesPlayed,
  type StrokePlayRecord,
  type StrokePlayBest,
} from '../src/sim/rpg/strokePlay';
import { STATIC_COURSES } from '../src/sim/course/staticCourses';

const rec = (courseId: string, strokes: number, par: number, over: Partial<StrokePlayRecord> = {}): StrokePlayRecord => ({
  courseId,
  characterId: 'nova',
  tier: 'common',
  strokes,
  par,
  toPar: strokes - par,
  seed: 1,
  ...over,
});

describe('Star Tour stroke play (GS-star-tour)', () => {
  it('a strokeplay run serves the pinned static course, not a generated stop', () => {
    const run = startRun('seed-1', STROKEPLAY_FORMAT, {}, 'nova', 0, 'common', [], 'verdant-18');
    expect(run.staticCourseId).toBe('verdant-18');
    const course = currentCourse(run);
    expect(course.holes).toHaveLength(18);
    expect(course.meta.name).toBe('Lyra Meadows');
    // Deterministic: the same run yields byte-identical course geometry every build.
    expect(JSON.stringify(currentCourse(run))).toBe(JSON.stringify(course));
  });

  it('a chosen weather sky is applied as pure physics + stamped on the meta', () => {
    const calm = currentCourse(startRun('s', STROKEPLAY_FORMAT, {}, 'nova', 0, 'common', [], 'desert-18'));
    const windy = currentCourse(startRun('s', STROKEPLAY_FORMAT, {}, 'nova', 0, 'common', [], 'desert-18', 'dustStorm'));
    expect(calm.meta.effect ?? 'none').toBe('none');
    expect(windy.meta.effect).toBe('dustStorm');
    // The geometry (holes/pars/centrelines) is unchanged — weather is wind/carry only, so course
    // records stay comparable. Compare the hole pars + count.
    expect(windy.holes.map((h) => h.par)).toEqual(calm.holes.map((h) => h.par));
  });

  it('a full 18-hole round scores cleanly and banks a course record', () => {
    const run = startRun('round-seed', STROKEPLAY_FORMAT, {}, 'nova', 0, 'common', [], 'verdant-18');
    const course = currentCourse(run);
    const played = playCourse(course.holes, new Rng(`${course.seed}:play`), {});
    expect(played).toHaveLength(18);
    const totals = playTotals(played.map((p) => p.record));
    expect(totals.holesPlayed).toBe(18);
    expect(totals.gross).toBeGreaterThan(0);
    expect(totals.toPar).toBe(totals.gross - totals.totalPar);

    const record = rec('verdant-18', totals.gross, totals.totalPar);
    const best = addStrokeRecord({}, record);
    expect(bestStrokeFor(best, 'verdant-18')).toEqual(record);
  });

  it('a course record keeps only the better round; ties break on fewer strokes', () => {
    let best: StrokePlayBest = {};
    best = addStrokeRecord(best, rec('a', 74, 72)); // +2
    expect(coursesPlayed(best)).toBe(1);
    // A worse round does not replace it (and returns the SAME map reference).
    const same = addStrokeRecord(best, rec('a', 78, 72));
    expect(same).toBe(best);
    expect(bestStrokeFor(best, 'a')!.strokes).toBe(74);
    // A better round replaces it.
    best = addStrokeRecord(best, rec('a', 70, 72)); // −2
    expect(bestStrokeFor(best, 'a')!.strokes).toBe(70);
    expect(isNewCourseRecord(best, rec('a', 71, 72))).toBe(false);
    expect(isNewCourseRecord(best, rec('a', 69, 72))).toBe(true);
    // isBetterStroke ranks by to-par then strokes.
    expect(isBetterStroke(rec('x', 70, 72), rec('y', 71, 70))).toBe(true); // −2 beats +1
    expect(isBetterStroke(rec('x', 70, 71), rec('y', 71, 72))).toBe(true); // −1 vs −1, fewer strokes wins
  });

  it('the overall board ranks the best rounds across courses by to-par', () => {
    let best: StrokePlayBest = {};
    best = addStrokeRecord(best, rec('a', 74, 72)); // +2
    best = addStrokeRecord(best, rec('b', 68, 71)); // −3
    best = addStrokeRecord(best, rec('c', 70, 70)); // E
    best = addStrokeRecord(best, rec('d', 69, 72)); // −3, fewer under? −3 tie with b → fewer strokes 69<68? b=68 strokes, d=69 → b first
    const board = bestStrokeRounds(best, 5);
    expect(board.map((r) => r.courseId)).toEqual(['b', 'd', 'c', 'a']);
    expect(bestStrokeRounds(best, 2).map((r) => r.courseId)).toEqual(['b', 'd']);
  });

  it('the pinned course + weather survive a snapshot round-trip (resume)', () => {
    const run = startRun('rt', STROKEPLAY_FORMAT, {}, 'nova', 0, 'common', [], 'frost-18', 'blizzard');
    const restored = resumeRun(snapshotRun(run));
    expect(restored.staticCourseId).toBe('frost-18');
    expect(restored.staticEffect).toBe('blizzard');
    expect(currentCourse(restored).meta.name).toBe('Cygnus Links');
  });

  it('every Star Tour catalogue course is an 18-hole round with a sky anchor', () => {
    const tourCourses = STATIC_COURSES.filter((c) => c.themeId);
    expect(tourCourses.length).toBeGreaterThanOrEqual(10);
    for (const spec of tourCourses) {
      expect(spec.opts.holes).toBe(18);
      expect(spec.archetype).toBeTruthy();
    }
  });
});
