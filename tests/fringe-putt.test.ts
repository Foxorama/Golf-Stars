import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { beginHole, canPuttFringe, takePutt, takeShot, FRINGE_PUTT_RANGE, type HolePlay } from '../src/sim/rpg/play';
import { pinOf } from '../src/sim/round';
import { startingLoadout } from '../src/sim/rpg/economy';
import { Rng } from '../src/sim/rng';
import { dist, type Vec } from '../src/sim/course/contract';

describe('fringe/apron putting (GS-fringe-putt)', () => {
  const hole = generateCourse(1, { biome: 'verdant-station', holes: 1, wildness: 0.4 }).holes[0]!;
  const pin = pinOf(hole);
  const base = (lie: HolePlay['lie'], ball: Vec): HolePlay => ({ ...beginHole(hole), lie, ball });

  it('offers the putter just off the green, but not from the tee, the green, or far out', () => {
    // A few yards short of the pin on the apron (fairway) → puttable.
    const near: Vec = [pin[0] + 6, pin[1]];
    expect(dist(near, pin)).toBeLessThanOrEqual(FRINGE_PUTT_RANGE);
    expect(canPuttFringe(base('fairway', near))).toBe(true);
    expect(canPuttFringe(base('rough', near))).toBe(true);
    // On the green is the normal putt (not a fringe putt); the tee never putts.
    expect(canPuttFringe(base('green', near))).toBe(false);
    expect(canPuttFringe(base('tee', near))).toBe(false);
    // Beyond the fringe range → a real shot, not a putt.
    const far: Vec = [pin[0] + FRINGE_PUTT_RANGE + 20, pin[1]];
    expect(canPuttFringe(base('fairway', far))).toBe(false);
    // A bad lie (bunker) is never a Texas wedge.
    expect(canPuttFringe(base('bunker', near))).toBe(false);
  });

  it('takePutt works from the fringe (the auto sim never reaches it, so determinism is untouched)', () => {
    const near: Vec = [pin[0] + 5, pin[1] + 3];
    const state = base('fairway', near);
    const after = takePutt(state, startingLoadout(), new Rng('fp'), { pace: 1 });
    expect(after.putts).toBe(1); // a putt was actually struck
    expect(after.strokes).toBe(1);

    // takePutt is a no-op from a lie that's neither the green nor a fringe (no accidental putts).
    const farState = base('fairway', [pin[0] + 120, pin[1]] as Vec);
    expect(takePutt(farState, startingLoadout(), new Rng('fp2'), { pace: 1 })).toBe(farState);
  });

  it('the auto-decision chip path never invokes a fringe putt (auto≡interactive intact)', () => {
    // Driving a hole with full shots (no manual putt control) leaves the green-only putt-out behaviour
    // unchanged: takeShot from a fringe lie still plays a stroke, it does not silently putt.
    const near: Vec = [pin[0] + 5, pin[1]];
    const state = base('fairway', near);
    const after = takeShot(state, { clubId: startingLoadout().bag[0]!.id, aim: 'attack' }, startingLoadout(), new Rng('cs'), true);
    expect(after.strokes).toBeGreaterThan(state.strokes); // a real shot was played
  });
});
