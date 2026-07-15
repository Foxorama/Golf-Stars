import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';
import { STATIC_COURSES, buildStaticCourse } from '../src/sim/course/staticCourses';
import { ASGARD_FORMAT } from '../src/sim/rpg/formats';
import { starTourMapSVG, worldPos, EARTH_POS, YGGDRASIL_REALMS, type StarTourWorld } from '../src/render/starTourMap';

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

describe('Yggdrasil — the hidden World Tree (GS-star-tour-yggdrasil)', () => {
  /** Reach the star map with a golfer picked. */
  function onMap(seed = 'ygg-seed', charId = CHARACTERS[0]!.id): UiState {
    let s = initState(seed);
    s = reduce(s, { type: 'openStarTour' });
    s = reduce(s, { type: 'selectCharacter', characterId: charId });
    expect(s.screen).toBe('starTour');
    return s;
  }

  it('the tree glyph renders on the chart only when armed (showYggdrasil)', () => {
    const world: StarTourWorld = { id: 'verdant-18', name: 'X', archetype: 'verdant', tier: 'gentle', themeId: 'lyra', hasRecord: false };
    const off = starTourMapSVG({ seed: 'y', worlds: [world] });
    expect(off).not.toContain('data-startour-yggdrasil');
    const on = starTourMapSVG({ seed: 'y', worlds: [world], showYggdrasil: true });
    expect(on).toContain('data-startour-yggdrasil');
    expect(on).toContain('YGGDRASIL');
  });

  it('carries all nine realms with only Asgard playable', () => {
    expect(YGGDRASIL_REALMS).toHaveLength(9);
    expect(YGGDRASIL_REALMS[0]!.id).toBe('asgard');
    expect(YGGDRASIL_REALMS.filter((r) => r.playable).map((r) => r.id)).toEqual(['asgard']);
  });

  it('is a no-op without Thor\'s Hammer (the tree is hidden until then)', () => {
    const s = onMap();
    expect(s.ownedApparel).not.toContain('thors-hammer');
    const after = reduce(s, { type: 'playYggdrasilRealm', realmId: 'asgard' });
    expect(after.screen).toBe('starTour'); // nothing happened
    expect(after.run.formatId).toBe(STROKEPLAY_FORMAT);
  });

  it('a non-Asgard (unbloomed) realm is a no-op even when armed', () => {
    const s = { ...onMap(), ownedApparel: ['thors-hammer'] } as UiState;
    const after = reduce(s, { type: 'playYggdrasilRealm', realmId: 'vanaheim' });
    expect(after.screen).toBe('starTour');
  });

  it('armed: launches the standalone Asgard tournament and returns to the star map', () => {
    let s = { ...onMap(), ownedApparel: ['thors-hammer'] } as UiState;
    s = reduce(s, { type: 'playYggdrasilRealm', realmId: 'asgard' });
    expect(s.screen).toBe('playing');
    expect(s.run.formatId).toBe(ASGARD_FORMAT);
    expect(s.asgardFromStarTour).toBe(true);
    expect(s.asgardReturn).toBeUndefined(); // standalone — no suspended journey
    expect(s.course.holes).toHaveLength(9);
    // Play the nine holes out to the tournament result.
    let guard = 0;
    while (s.screen === 'playing' && guard++ < 100) {
      while (s.play && !s.play.done && guard++ < 400) s = reduce(s, { type: 'autoShotHole' });
      s = reduce(s, { type: 'holeComplete' });
    }
    expect(s.screen).toBe('asgardResult');
    expect(s.asgardOutcome).toBeTruthy();
    // Leave → back to the star map (not a journey/travel screen), with a fresh strokeplay run.
    s = reduce(s, { type: 'leaveAsgard' });
    expect(s.screen).toBe('starTour');
    expect(s.run.formatId).toBe(STROKEPLAY_FORMAT);
    expect(s.run.status).toBe('active');
    expect(s.run.staticCourseId).toBeUndefined();
    expect(s.asgardFromStarTour).toBeUndefined();
  });
});

describe('Earth — the Old Course at St Andrews (GS-earth)', () => {
  it('the catalogue carries a home Earth course with the real par-72 routing', () => {
    const spec = STATIC_COURSES.find((c) => c.id === 'standrews-18')!;
    expect(spec).toBeTruthy();
    expect(spec.themeId).toBe('earth');
    expect(spec.archetype).toBe('earth');
    expect(spec.opts.biome).toBe('earth-links');
    // The pinned real Old-Course par sequence: par 72, out 36 / in 36.
    const c = buildStaticCourse('standrews-18');
    const pars = c.holes.map((h) => h.par);
    expect(pars).toEqual([4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 3, 4, 4, 5, 4, 4, 4, 4]);
    expect(pars.reduce((a, b) => a + b, 0)).toBe(72);
    expect(pars.slice(0, 9).reduce((a, b) => a + b, 0)).toBe(36);
    expect(c.biome).toBe('earth-links');
    expect(c.meta.name).toBe('The Old Course, St Andrews');
  });

  it('is playable as a full Star Tour stroke-play round, banked as a course record', () => {
    const s = playRound('standrews-18');
    expect(s.screen).toBe('strokeResult');
    expect(s.played).toHaveLength(18);
    expect(s.lastStrokeRecord!.courseId).toBe('standrews-18');
    expect(s.lastStrokeRecord!.par).toBe(72);
    expect(s.strokePlayBest['standrews-18']).toEqual(s.lastStrokeRecord);
  });

  it('sits on the home Earth landmark and is the tappable Old Course target (not a constellation)', () => {
    const earth: StarTourWorld = { id: 'standrews-18', name: 'The Old Course, St Andrews', archetype: 'earth', tier: 'testing', themeId: 'earth', hasRecord: false };
    // Its map position IS the Earth blue-marble landmark, not the RA/Dec projection.
    expect(worldPos(earth)).toEqual(EARTH_POS);
    // Rendered onto the chart, the Earth glyph carries the single tappable course target + its label.
    const svg = starTourMapSVG({ seed: 'earth-map', worlds: [earth], selectedId: 'standrews-18' });
    expect((svg.match(/data-startour-course="standrews-18"/g) ?? []).length).toBe(1);
    expect(svg).toContain('THE OLD COURSE');
    // It is NOT drawn as a generic constellation planet (that class is only the constellation worlds).
    expect((svg.match(/class="gs-st-world"/g) ?? []).length).toBe(0);
  });
});
