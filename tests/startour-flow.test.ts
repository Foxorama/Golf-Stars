import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';

/** Drive a Star Tour round to the strokeResult recap (openStarTour → CHARACTER → star map → pick a
 *  course → intro → play 18 → holeComplete×18). Character select comes FIRST (GS-star-tour-2). */
function playRound(courseId: string, effect = 'none', charId = CHARACTERS[0]!.id): UiState {
  let s = initState('star-seed');
  s = reduce(s, { type: 'openStarTour' });
  expect(s.screen).toBe('character'); // character first now
  expect(s.run.formatId).toBe(STROKEPLAY_FORMAT);
  s = reduce(s, { type: 'selectCharacter', characterId: charId });
  expect(s.screen).toBe('starTour'); // golfer chosen → the star map
  expect(s.run.loadout.characterId).toBe(charId);
  s = reduce(s, { type: 'pickStarTourCourse', courseId, effect });
  expect(s.screen).toBe('intro');
  expect(s.run.staticCourseId).toBe(courseId);
  expect(s.course.holes).toHaveLength(18);
  s = reduce(s, { type: 'playInteractive' });
  expect(s.screen).toBe('playing');
  let guard = 0;
  while (s.screen === 'playing' && guard++ < 200) {
    while (s.play && !s.play.done && guard++ < 400) s = reduce(s, { type: 'autoShotHole' });
    s = reduce(s, { type: 'holeComplete' });
  }
  return s;
}

describe('Star Tour reducer flow (GS-star-tour-2)', () => {
  it('character-first: golfer → star map → course → play → record recap', () => {
    const s = playRound('verdant-18');
    expect(s.screen).toBe('strokeResult');
    expect(s.run.status).toBe('ended');
    expect(s.played).toHaveLength(18);
    const rec = s.lastStrokeRecord!;
    expect(rec.courseId).toBe('verdant-18');
    expect(rec.characterId).toBe(CHARACTERS[0]!.id);
    expect(rec.toPar).toBe(rec.strokes - rec.par);
    expect(s.strokeIsRecord).toBe(true);
    expect(s.strokePlayBest['verdant-18']).toEqual(rec);
  });

  it('the golfer is baked onto the run BEFORE the course is chosen (so the ship is theirs)', () => {
    let s = initState('ship-seed');
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[1]!.id });
    // On the star map, the run already carries the golfer (no course yet).
    expect(s.screen).toBe('starTour');
    expect(s.run.loadout.characterId).toBe(CHARACTERS[1]!.id);
    expect(s.run.staticCourseId).toBeUndefined();
  });

  it('a weather pick is pinned onto the run and stamped on the course meta', () => {
    let s = initState('wx-seed');
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    s = reduce(s, { type: 'pickStarTourCourse', courseId: 'desert-18', effect: 'dustStorm' });
    expect(s.run.staticEffect).toBe('dustStorm');
    expect(s.course.meta.effect).toBe('dustStorm');
  });

  it('the recap "Star map" keeps the SAME golfer and lands on the map (no re-pick)', () => {
    const s1 = playRound('verdant-18', 'none', CHARACTERS[1]!.id);
    expect(s1.screen).toBe('strokeResult');
    const back = reduce(s1, { type: 'openStarTour' });
    expect(back.screen).toBe('starTour'); // straight to the map, golfer kept
    expect(back.run.loadout.characterId).toBe(CHARACTERS[1]!.id);
    expect(back.run.status).toBe('active');
    expect(back.run.staticCourseId).toBeUndefined(); // fresh — no course pinned yet
  });

  it('only keeps the BETTER round as the course record across replays', () => {
    const s1 = playRound('verdant-18');
    const first = s1.strokePlayBest['verdant-18']!;
    let s2: UiState = reduce(s1, { type: 'openStarTour' }); // recap → map (golfer kept)
    expect(s2.screen).toBe('starTour');
    s2 = reduce(s2, { type: 'pickStarTourCourse', courseId: 'verdant-18', effect: 'none' });
    s2 = reduce(s2, { type: 'playInteractive' });
    let guard = 0;
    while (s2.screen === 'playing' && guard++ < 200) {
      while (s2.play && !s2.play.done && guard++ < 400) s2 = reduce(s2, { type: 'autoShotHole' });
      s2 = reduce(s2, { type: 'holeComplete' });
    }
    expect(s2.strokePlayBest['verdant-18']!.toPar).toBeLessThanOrEqual(first.toPar);
  });

  it('the change-golfer button (openStarTour from the map) returns to character select', () => {
    let s = initState('swap-seed');
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    expect(s.screen).toBe('starTour');
    // The dock's "change golfer" re-enters character select from the map.
    s = reduce(s, { type: 'openStarTour' });
    expect(s.screen).toBe('character');
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[2]!.id });
    expect(s.screen).toBe('starTour');
    expect(s.run.loadout.characterId).toBe(CHARACTERS[2]!.id);
  });

  it('exitStarTour returns to the title from the map', () => {
    let s = initState('exit-seed');
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
    expect(s.screen).toBe('starTour');
    s = reduce(s, { type: 'exitStarTour' });
    expect(s.screen).toBe('title');
  });
});
