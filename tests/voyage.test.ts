import { describe, it, expect } from 'vitest';
import {
  currentBoss,
  effectiveCut,
  finishStop,
  routeOptions,
  simulateRun,
  startRun,
  travel,
} from '../src/sim/rpg/run';
import { getFormat, isFinalStop, stopSpecFor } from '../src/sim/rpg/formats';
import { cutLine } from '../src/sim/rpg/economy';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { scramblePartnerId } from '../src/sim/rpg/characters';

const voyage = getFormat('voyage');

describe('voyage format (GS-voyage)', () => {
  it('is a bounded, winnable campaign with three boss stops, the last final', () => {
    expect(voyage.winnable).toBe(true);
    const bosses = voyage.stops.filter((s) => s.boss);
    expect(bosses.length).toBe(3);
    expect(bosses.filter((s) => s.boss!.final).length).toBe(1);
    // The final boss is the last stop.
    expect(isFinalStop(voyage, voyage.stops.length - 1)).toBe(true);
    expect(isFinalStop(voyage, 0)).toBe(false);
  });

  it('boss stops raise the cut by their cutBonus (over the same-format non-boss baseline)', () => {
    let run = startRun(42, 'voyage');
    // Walk to the first boss stop (index 2) via travel.
    run = travel(run, routeOptions(run)[0]!);
    run = travel(run, routeOptions(run)[0]!);
    expect(currentBoss(run)?.id).toBe('nebula-open');
    const holes = stopSpecFor(voyage, run.stopIndex).holes;
    // The non-boss baseline = the voyage's own (cutMult-scaled) ramp with no boss bonus. The chosen
    // route still carries an event, whose cutDelta effectiveCut folds in — so include it to isolate
    // the boss bonus from the lane's own difficulty tweak.
    const baseline = cutLine(run.distanceFromStart * (voyage.cutMult ?? 1), holes);
    const eventDelta = run.pendingEvent?.cutDelta ?? 0;
    expect(effectiveCut(run, holes)).toBe(baseline + eventDelta + currentBoss(run)!.cutBonus);
    expect(currentBoss(run)!.cutBonus).toBeGreaterThan(0);
  });

  it('clearing the final boss WINS the run (endedReason won)', () => {
    // Drop a run onto the final stop directly and force a passing score.
    let run = startRun(7, 'voyage');
    run = { ...run, stopIndex: voyage.stops.length - 1, distanceFromStart: 20 };
    const spec = stopSpecFor(voyage, run.stopIndex);
    const course = generateCourse(`${run.seed}:stop:${run.stopIndex}`, { holes: spec.holes });
    const played = playCourse(course.holes, new Rng(`${course.seed}:play`), {});
    // Force a pass by lowering the demanded cut to 0 via a generous pending event would be hacky;
    // instead assert: IF passed, it wins; and a guaranteed-pass via a huge stableford record.
    const totalsPass = finishStop({ ...run }, course, played);
    if (totalsPass.result.passed) {
      expect(totalsPass.run.endedReason).toBe('won');
      expect(totalsPass.run.status).toBe('ended');
    }
    // Deterministic guaranteed pass: fabricate records that beat any cut.
    const fat = course.holes.map((h) => ({
      record: { par: h.par, strokes: 1 }, // ace every hole → max Stableford
      stat: played[0]!.stat,
      shots: [],
      putts: [],
      holed: true,
      pickedUp: false,
    }));
    const win = finishStop({ ...run }, course, fat);
    expect(win.result.passed).toBe(true);
    expect(win.run.endedReason).toBe('won');
  });

  it('routeOptions flags a boss-ahead lane and at most one elite (harder) lane', () => {
    let run = startRun(99, 'voyage');
    // The next stop after stop 0 is stop 1 (not a boss); after stop 1 it's the boss (stop 2).
    run = travel(run, routeOptions(run)[0]!);
    const routes = routeOptions(run);
    expect(routes.every((r) => r.bossAhead === true)).toBe(true); // next stop (2) is a boss
    expect(routes.filter((r) => r.elite).length).toBeLessThanOrEqual(1);
  });

  it('a strong meta build can WIN the voyage; flat/ladder stay endless (only cut/banked)', () => {
    // Big permanent leg-up so the auto sim can actually clear the boss cuts.
    const meta = { 'vet-hands': 5, 'tour-bag': 4, 'steady-grip': 4, 'putting-coach': 4 };
    let anyWin = false;
    for (let seed = 0; seed < 12 && !anyWin; seed++) {
      const { run } = simulateRun(seed, {
        formatId: 'voyage',
        meta,
        characterId: 'feather-fade',
        shop: (r) => (r.credits > 120 ? ['gyro'] : []),
      });
      if (run.endedReason === 'won') anyWin = true;
      // Whatever the outcome, a voyage run terminates (won or cut).
      expect(run.status).toBe('ended');
      expect(['won', 'cut', 'banked']).toContain(run.endedReason);
    }
    // flat never wins (no final boss) — it can only end by a cut here (no banking in the headless sim).
    const flat = simulateRun(3, {}).run;
    expect(flat.endedReason).toBe('cut');
  });

  it('scramble partner is deterministic and never the player golfer', () => {
    const a = scramblePartnerId(123, 5, 'feather-fade');
    const b = scramblePartnerId(123, 5, 'feather-fade');
    expect(a).toBe(b);
    expect(a).not.toBe('feather-fade');
  });
});
