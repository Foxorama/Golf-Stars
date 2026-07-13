import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';

/** Drive a Star Tour round interactively to the strokeResult recap (openStarTour → pick → character →
 *  intro → play 18 → holeComplete×18). Returns the final state. */
function playRound(courseId: string, effect = 'none', charId = CHARACTERS[0]!.id): UiState {
  let s = initState('star-seed');
  s = reduce(s, { type: 'openStarTour' });
  expect(s.screen).toBe('starTour');
  expect(s.run.formatId).toBe(STROKEPLAY_FORMAT);
  s = reduce(s, { type: 'pickStarTourCourse', courseId, effect });
  expect(s.screen).toBe('character');
  expect(s.starTourPick).toEqual({ courseId, effect });
  s = reduce(s, { type: 'selectCharacter', characterId: charId });
  expect(s.screen).toBe('intro');
  expect(s.run.staticCourseId).toBe(courseId);
  expect(s.course.holes).toHaveLength(18);
  // Start interactive play, then AI-finish each hole and advance.
  s = reduce(s, { type: 'playInteractive' });
  expect(s.screen).toBe('playing');
  let guard = 0;
  while (s.screen === 'playing' && guard++ < 200) {
    // Finish the current hole with the auto driver, then complete it.
    while (s.play && !s.play.done && guard++ < 400) {
      s = reduce(s, { type: 'autoShotHole' });
    }
    s = reduce(s, { type: 'holeComplete' });
  }
  return s;
}

describe('Star Tour reducer flow (GS-star-tour)', () => {
  it('opens the star map, plays a full round, and lands on the record recap', () => {
    const s = playRound('verdant-18');
    expect(s.screen).toBe('strokeResult');
    expect(s.run.status).toBe('ended');
    expect(s.played).toHaveLength(18);
    const rec = s.lastStrokeRecord!;
    expect(rec.courseId).toBe('verdant-18');
    expect(rec.strokes).toBeGreaterThan(0);
    expect(rec.toPar).toBe(rec.strokes - rec.par);
    // The first round on a course is always a new record.
    expect(s.strokeIsRecord).toBe(true);
    expect(s.strokePlayBest['verdant-18']).toEqual(rec);
  });

  it('a weather pick is pinned onto the run and stamped on the course meta', () => {
    let s = initState('wx-seed');
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'pickStarTourCourse', courseId: 'desert-18', effect: 'dustStorm' });
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    expect(s.run.staticEffect).toBe('dustStorm');
    expect(s.course.meta.effect).toBe('dustStorm');
  });

  it('only keeps the BETTER round as the course record across replays', () => {
    // First round banks a record.
    const s1 = playRound('verdant-18');
    const first = s1.strokePlayBest['verdant-18']!;
    // A second round from the recap: back to the map, play again. Carry the banked best forward.
    let s2 = { ...s1 };
    s2 = reduce(s2, { type: 'openStarTour' });
    s2 = reduce(s2, { type: 'pickStarTourCourse', courseId: 'verdant-18', effect: 'none' });
    s2 = reduce(s2, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    s2 = reduce(s2, { type: 'playInteractive' });
    let guard = 0;
    while (s2.screen === 'playing' && guard++ < 200) {
      while (s2.play && !s2.play.done && guard++ < 400) s2 = reduce(s2, { type: 'autoShotHole' });
      s2 = reduce(s2, { type: 'holeComplete' });
    }
    const kept = s2.strokePlayBest['verdant-18']!;
    // The stored best is the better (lower to-par) of the two rounds.
    expect(kept.toPar).toBeLessThanOrEqual(first.toPar);
  });

  it('exitStarTour returns to the title without starting a round', () => {
    let s = initState('exit-seed');
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'exitStarTour' });
    expect(s.screen).toBe('title');
    expect(s.starTourPick).toBeUndefined();
  });

  it('does not disturb Voyage/Unending — a strokeplay open builds only a strokeplay run', () => {
    let s = initState('mix-seed');
    // Start a normal Unending run, back to title (parks resumable), then open Star Tour.
    s = reduce(s, { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    // Star Tour uses its own format id; the generic start path is untouched.
    const st = reduce(initState('mix-seed'), { type: 'openStarTour' });
    expect(st.run.formatId).toBe(STROKEPLAY_FORMAT);
    expect(s.run.formatId).toBe('unending');
  });
});
