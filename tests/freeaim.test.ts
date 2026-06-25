import { describe, it, expect } from 'vitest';
import { beginHole, previewShot, takeShot } from '../src/sim/rpg/play';
import { startingLoadout } from '../src/sim/rpg/economy';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import type { Vec } from '../src/sim/course/contract';

describe('free-aim target (#10)', () => {
  const hole = generateCourse(1234).holes[0]!;
  const lo = startingLoadout();

  it('previewShot aims at an explicit target, overriding attack/safe', () => {
    const play = beginHole(hole);
    const atPin = previewShot(play, { clubId: 'D', aim: 'attack' }, lo);
    // A target pushed well to the right of the ball changes the shot bearing.
    const right: Vec = [play.ball[0] + 120, play.ball[1] + 120];
    const free = previewShot(play, { clubId: 'D', aim: 'attack', target: right }, lo);
    expect(Math.abs(free.bearing - atPin.bearing)).toBeGreaterThan(5);
  });

  it('takeShot with a target sends the ball toward that target', () => {
    const play = beginHole(hole);
    const right: Vec = [play.ball[0] + 100, play.ball[1] + 150];
    const after = takeShot(play, { clubId: '7i', aim: 'attack', target: right }, lo, new Rng('free'), true);
    // The ball moved to the right of the straight-up pin line (positive x off the tee).
    expect(after.ball[0]).toBeGreaterThan(play.ball[0] + 10);
  });
});
