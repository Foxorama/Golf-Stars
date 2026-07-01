import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { resolveShot } from '../src/sim/shot';
import { shotSpread } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import { dist, type Hole, type Vec } from '../src/sim/course/contract';
import { beginHole, takeShot, previewShot } from '../src/sim/rpg/play';
import { startingLoadout, loadoutFromPerks, maxPowerOf, shopItem } from '../src/sim/rpg/economy';
import { generateCourse } from '../src/sim/course/generate';

const driver = CLUBS.find((c) => c.id === 'D')!;

// Windless, flat fairway hole so power scales carry cleanly (no wind term to break proportionality).
const flat: Hole = {
  par: 5,
  tee: [0, 0],
  green: [0, 300],
  centreline: [
    [0, 0],
    [0, 300],
  ],
  features: [{ kind: 'fairway', poly: [[-50, 0], [50, 0], [50, 320], [-50, 320]] }],
  hazards: [],
};

describe('shot power (GS-power)', () => {
  it('power scales carry linearly per-sample (same rng, windless)', () => {
    const from: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    // Identical rng streams → identical draws; only `power` differs, so the landing distance from the
    // tee at half power is exactly half the full-power landing distance (everything scales by power).
    for (const seed of ['p1', 'p2', 'p3']) {
      const full = resolveShot({ from, aim: target, club: driver, lie: 'fairway', power: 1, rng: new Rng(seed) });
      const half = resolveShot({ from, aim: target, club: driver, lie: 'fairway', power: 0.5, rng: new Rng(seed) });
      expect(dist(from, half.landing)).toBeCloseTo(dist(from, full.landing) * 0.5, 4);
      expect(half.carry).toBeCloseTo(full.carry * 0.5, 4);
    }
  });

  it('power defaults to 1 — omitting it is byte-for-byte identical', () => {
    const from: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    const a = resolveShot({ from, aim: target, club: driver, lie: 'fairway', rng: new Rng('eq') });
    const b = resolveShot({ from, aim: target, club: driver, lie: 'fairway', power: 1, rng: new Rng('eq') });
    expect(b.landing[0]).toBe(a.landing[0]);
    expect(b.landing[1]).toBe(a.landing[1]);
    expect(b.carry).toBe(a.carry);
  });

  it('overpower carries PAST a full swing (>100%)', () => {
    const from: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    const full = resolveShot({ from, aim: target, club: driver, lie: 'fairway', power: 1, rng: new Rng('over') });
    const over = resolveShot({ from, aim: target, club: driver, lie: 'fairway', power: 1.2, rng: new Rng('over') });
    expect(over.carry).toBeCloseTo(full.carry * 1.2, 4);
    expect(dist(from, over.landing)).toBeGreaterThan(dist(from, full.landing));
  });

  it('the previewed cone GROWS with power (carry window + reach scale)', () => {
    const from: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    const fullS = shotSpread(flat, from, 'fairway', target, driver, { power: 1 });
    const halfS = shotSpread(flat, from, 'fairway', target, driver, { power: 0.5 });
    expect(halfS.expectedCarry).toBeCloseTo(fullS.expectedCarry * 0.5, 3);
    expect(halfS.carryHigh).toBeCloseTo(fullS.carryHigh * 0.5, 3);
    expect(halfS.carryLow).toBeCloseTo(fullS.carryLow * 0.5, 3);
    // The angular spread (cone half-angle) is keyed off the club, so it's the SAME at any power —
    // the cone scales in YARDS because the reach scales, not because the angle widens.
    expect(halfS.angleSpread).toBeCloseTo(fullS.angleSpread, 6);
  });

  it('the interactive driver honours power: a soft shot lands shorter than a full swing', () => {
    const hole = generateCourse(4242).holes[0]!;
    const lo = startingLoadout();
    const target: Vec = [hole.tee[0], hole.tee[1] + 200];
    const soft = takeShot(beginHole(hole), { clubId: 'D', aim: 'attack', target, power: 0.4 }, lo, new Rng('pw'), true);
    const big = takeShot(beginHole(hole), { clubId: 'D', aim: 'attack', target, power: 1 }, lo, new Rng('pw'), true);
    expect(dist(hole.tee, soft.ball)).toBeLessThan(dist(hole.tee, big.ball));
  });

  it('previewShot power 1 === omitting power (decision-level determinism)', () => {
    const hole = generateCourse(99).holes[0]!;
    const lo = startingLoadout();
    const a = previewShot(beginHole(hole), { clubId: '7i', aim: 'attack' }, lo);
    const b = previewShot(beginHole(hole), { clubId: '7i', aim: 'attack', power: 1 }, lo);
    expect(b.expectedCarry).toBeCloseTo(a.expectedCarry, 9);
    expect(b.carryHigh).toBeCloseTo(a.carryHigh, 9);
  });
});

describe('Overdrive upgrade (overpower ceiling)', () => {
  it('a base loadout caps at 100% power', () => {
    expect(maxPowerOf(startingLoadout())).toBe(1);
  });

  it('Overdrive raises the power ceiling to 120% (a one-shot epic)', () => {
    const one = loadoutFromPerks(['overdrive']);
    expect(maxPowerOf(one)).toBeCloseTo(1.2, 6);
    // A one-shot unique now (GS-proshop-variety) — no stacking, capped at one copy.
    const item = shopItem('overdrive')!;
    expect(item.stackable).toBeFalsy();
    expect(item.rarity).toBe('epic');
  });
});
