import { describe, it, expect } from 'vitest';
import {
  usableBag,
  driverAllowedOffTee,
  driverDeckSprayMult,
  loadoutFromPerks,
  startingLoadout,
  DRIVER_ID,
} from '../src/sim/rpg/economy';
import { aiClub, biomeCarryMult } from '../src/sim/round';
import { beginHole, takeShot } from '../src/sim/rpg/play';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import type { Vec } from '../src/sim/course/contract';

const CLUBS = startingLoadout().bag;
const hasDriver = (bag: readonly { id: string }[]) => bag.some((c) => c.id === DRIVER_ID);
const driverCarry = (bag: readonly { id: string; carry: number }[]) => bag.find((c) => c.id === DRIVER_ID)?.carry;

describe('Driver on Deck (#11)', () => {
  it('default (level 0): driver is tee-only — present on the tee, gone off the deck', () => {
    expect(hasDriver(usableBag(CLUBS, 'tee', 0))).toBe(true);
    expect(hasDriver(usableBag(CLUBS, 'fairway', 0))).toBe(false);
    expect(hasDriver(usableBag(CLUBS, 'rough', 0))).toBe(false);
    expect(driverAllowedOffTee('fairway', 0)).toBe(false);
  });

  it('tier 1: fairway only, −50% carry / +50% spray', () => {
    expect(driverAllowedOffTee('fairway', 1)).toBe(true);
    expect(driverAllowedOffTee('rough', 1)).toBe(false);
    expect(hasDriver(usableBag(CLUBS, 'fairway', 1))).toBe(true);
    expect(driverCarry(usableBag(CLUBS, 'fairway', 1))).toBe(Math.round(250 * 0.5));
    expect(hasDriver(usableBag(CLUBS, 'rough', 1))).toBe(false);
    expect(driverDeckSprayMult(DRIVER_ID, 'fairway', 1)).toBeCloseTo(1.5);
    expect(driverDeckSprayMult(DRIVER_ID, 'tee', 1)).toBe(1); // tee never penalised
  });

  it('tier 3 adds the rough; tier 4 allows any lie at near-tee power', () => {
    expect(driverAllowedOffTee('rough', 3)).toBe(true);
    expect(driverAllowedOffTee('bunker', 3)).toBe(false);
    expect(driverAllowedOffTee('bunker', 4)).toBe(true);
    expect(driverCarry(usableBag(CLUBS, 'bunker', 4))).toBe(Math.round(250 * 0.95));
    expect(driverDeckSprayMult(DRIVER_ID, 'bunker', 4)).toBeCloseTo(1.05);
  });

  it('the auto aiClub never returns the driver off the deck at level 0, but can at level 4', () => {
    const hole = generateCourse(1234).holes[0]!;
    const cm = biomeCarryMult(hole);
    const farFromFairway: Vec = [hole.tee[0], hole.tee[1] + 30];
    const lvl0 = aiClub(hole, farFromFairway, hole.green, cm, usableBag(CLUBS, 'fairway', 0));
    expect(lvl0.id).not.toBe(DRIVER_ID);
    const lvl4 = aiClub(hole, farFromFairway, hole.green, cm, usableBag(CLUBS, 'fairway', 4));
    // At level 4 the (near-full) driver is back in the pool — for a max-distance shot it's eligible.
    expect(usableBag(CLUBS, 'fairway', 4).some((c) => c.id === DRIVER_ID)).toBe(true);
    expect(lvl4).toBeTruthy();
  });

  it('a player decision to hit driver off the fairway falls back at lvl 0, fires (penalised) once unlocked', () => {
    const hole = generateCourse(7).holes[0]!;
    const lo0 = startingLoadout();
    const lo1 = loadoutFromPerks(['driver-deck-1']);
    expect(lo1.driverDeck).toBe(1);
    // Put the ball on the fairway.
    const play = { ...beginHole(hole), ball: [...hole.green] as Vec, lie: 'fairway' as const };
    const at0 = takeShot(play, { clubId: DRIVER_ID, aim: 'safe' }, lo0, new Rng('d0'), true);
    const at1 = takeShot(play, { clubId: DRIVER_ID, aim: 'safe' }, lo1, new Rng('d1'), true);
    // Level 0: the illegal driver fell back to a legal club.
    expect(at0.shots[0]!.club.id).not.toBe(DRIVER_ID);
    // Level 1: the driver fired off the deck (id D, but reduced nominal carry).
    expect(at1.shots[0]!.club.id).toBe(DRIVER_ID);
    expect(at1.shots[0]!.club.carry).toBe(Math.round(250 * 0.5));
  });
});
