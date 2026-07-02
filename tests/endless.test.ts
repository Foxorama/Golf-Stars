import { describe, it, expect } from 'vitest';
import {
  ENDLESS_GATE_STEPS,
  ENDLESS_MILESTONES,
  ENDLESS_TIER_HOLES,
  ENDLESS_UNLOCKS,
  endlessGateLabel,
  endlessGateOverPar,
  endlessMilestoneShards,
  endlessMilestonesCrossed,
  endlessRequiredStrokes,
  endlessUnlocksCrossed,
  endlessUnlocksEarned,
  nextEndlessUnlock,
  passesEndlessGate,
} from '../src/sim/rpg/endless';
import {
  currentCourse,
  endlessHoleNumber,
  endlessHolePassed,
  finishStop,
  holeGateArmed,
  playStop,
  resumeRun,
  simulateRun,
  snapshotRun,
  startRun,
  type Run,
} from '../src/sim/rpg/run';
import { getFormat, DEFAULT_FORMAT } from '../src/sim/rpg/formats';
import { apparelById, canBuyApparel, equippedSet } from '../src/sim/rpg/apparel';
import { shipById, canBuyShip } from '../src/sim/rpg/ships';
import { initState, reduce, endlessProgressUpdates, type UiState } from '../src/ui/game';
import type { PlayedHole } from '../src/sim/round';

/** A minimal holed-out PlayedHole for gate/milestone unit tests (only the gate-read fields matter). */
function played(par: number, strokes: number, holed = true): PlayedHole {
  return {
    record: { par, strokes },
    stat: { par, strokes },
    shots: [],
    putts: [],
    holed,
    pickedUp: !holed,
  } as unknown as PlayedHole;
}

describe('the survival bar (GS-unending)', () => {
  it('tightens one stroke every 8 holes: quad bogey → … → par → birdie forever', () => {
    expect(endlessGateOverPar(1)).toBe(4);
    expect(endlessGateOverPar(8)).toBe(4);
    expect(endlessGateOverPar(9)).toBe(3);
    expect(endlessGateOverPar(17)).toBe(2);
    expect(endlessGateOverPar(25)).toBe(1);
    expect(endlessGateOverPar(33)).toBe(0);
    expect(endlessGateOverPar(40)).toBe(0);
    expect(endlessGateOverPar(41)).toBe(-1);
    expect(endlessGateOverPar(999)).toBe(-1); // birdie-or-better, forever
    expect(ENDLESS_GATE_STEPS[ENDLESS_GATE_STEPS.length - 1]).toBe(-1);
    expect(ENDLESS_TIER_HOLES).toBe(8);
  });

  it('is par-relative and readable: the user-facing 8/7/6/5/4 ramp on a par 4', () => {
    // The spec's numbers ARE this ladder on a par-4: 8 → 7 → 6 → 5 → 4, then birdie.
    expect(endlessRequiredStrokes(4, 1)).toBe(8);
    expect(endlessRequiredStrokes(4, 9)).toBe(7);
    expect(endlessRequiredStrokes(4, 17)).toBe(6);
    expect(endlessRequiredStrokes(4, 25)).toBe(5);
    expect(endlessRequiredStrokes(4, 33)).toBe(4);
    expect(endlessRequiredStrokes(4, 41)).toBe(3);
    // A par-3 and a par-5 shift with their par (fair by construction).
    expect(endlessRequiredStrokes(3, 1)).toBe(7);
    expect(endlessRequiredStrokes(5, 41)).toBe(4);
    expect(endlessGateLabel(4)).toBe('Quad bogey');
    expect(endlessGateLabel(0)).toBe('Par');
    expect(endlessGateLabel(-1)).toBe('Birdie');
  });

  it('passes only a HOLED score at or under the bar — a pickup always fails', () => {
    expect(passesEndlessGate(4, 8, true, 1)).toBe(true); // quad bogey holed at the buzzer
    expect(passesEndlessGate(4, 8, false, 1)).toBe(false); // picked up at par+4 → never holed → dead
    expect(passesEndlessGate(4, 9, true, 1)).toBe(false);
    expect(passesEndlessGate(4, 3, true, 41)).toBe(true); // birdie tier
    expect(passesEndlessGate(4, 4, true, 41)).toBe(false); // par no longer survives
  });
});

describe('milestones & unlocks (GS-unending)', () => {
  it('milestones sit at 40/60/80/100/120/140 with growing shard bonuses', () => {
    expect(ENDLESS_MILESTONES.map((m) => m.holes)).toEqual([40, 60, 80, 100, 120, 140]);
    for (let i = 1; i < ENDLESS_MILESTONES.length; i++) {
      expect(ENDLESS_MILESTONES[i]!.shards).toBeGreaterThan(ENDLESS_MILESTONES[i - 1]!.shards);
    }
    expect(endlessMilestonesCrossed(36, 40).map((m) => m.holes)).toEqual([40]);
    expect(endlessMilestonesCrossed(40, 44)).toEqual([]);
    expect(endlessMilestoneShards(59, 80)).toBe(60 + 90); // a big jump banks every milestone crossed
  });

  it('every unlock id resolves to a real catalogue row that is earn-only (THE RULE, machine-checked)', () => {
    for (const u of ENDLESS_UNLOCKS) {
      if (u.kind === 'apparel') {
        const item = apparelById(u.id)!;
        expect(item, u.id).toBeDefined();
        expect(item.unlockHoles).toBe(u.holes);
        expect(item.set).toBe('Evergreen');
        // Earn-only: never buyable at any shard balance.
        expect(canBuyApparel(item, 999999, [])).toBe(false);
      } else {
        const ship = shipById(u.id)!;
        expect(ship, u.id).toBeDefined();
        expect(ship.unlockHoles).toBe(u.holes);
        expect(ship.secret).toBe(true); // the hole-150 grail stays a secret
        expect(canBuyShip(ship, 999999, [])).toBe(false);
      }
    }
    // The ladder: bag @40, cap @60, pants @80, the Green Jacket @100, the secret ship @150.
    expect(ENDLESS_UNLOCKS.map((u) => u.holes)).toEqual([40, 60, 80, 100, 150]);
    expect(endlessUnlocksEarned(100).map((u) => u.id)).toEqual([
      'bag-evergreen',
      'cap-baggy-green',
      'pants-evergreen',
      'jacket-green',
    ]);
    expect(endlessUnlocksCrossed(59, 80).map((u) => u.id)).toEqual(['cap-baggy-green', 'pants-evergreen']);
    expect(nextEndlessUnlock(140)!.id).toBe('infinity-ace');
    expect(nextEndlessUnlock(150)).toBeUndefined();
  });

  it('the Evergreen set completes only with all FOUR slots worn (bag included)', () => {
    expect(equippedSet('cap-baggy-green', 'jacket-green', 'pants-evergreen', 'bag-evergreen')).toBe('Evergreen');
    expect(equippedSet('cap-baggy-green', 'jacket-green', 'pants-evergreen')).toBeUndefined(); // no bag
    // Bag-less sets are untouched by the 4th slot (Astronaut still completes on its three).
    expect(equippedSet('helmet-astro', 'suit-space', 'pants-astro')).toBe('Astronaut');
  });
});

describe('the Unending Universe run engine (GS-unending)', () => {
  it('finishStop counts survived holes, banks milestone shards instantly, and ends on a miss', () => {
    const base = startRun(1, 'unending');
    const course = currentCourse(base);
    expect(course.holes.length).toBe(4);
    const pars = course.holes.map((h) => h.par);

    // Four holed pars at holes 37–40 (bar: par) → stop passed, milestone 40 banked.
    const at36: Run = { ...base, holesSurvived: 36 };
    const pass = finishStop(at36, course, pars.map((p) => played(p, p)));
    expect(pass.result.passed).toBe(true);
    expect(pass.run.status).toBe('active');
    expect(pass.run.holesSurvived).toBe(40);
    expect(pass.run.bonusShards).toBe(40); // the hole-40 bonus, banked mid-run

    // A bogey on hole 41 (bar: birdie) dies mid-stop — the partial stop still banks hole 40's crossing.
    const at39: Run = { ...base, holesSurvived: 39 };
    const die = finishStop(at39, course, [played(pars[0]!, pars[0]!), played(pars[1]!, pars[1]! + 1)]);
    expect(die.result.passed).toBe(false);
    expect(die.run.status).toBe('ended');
    expect(die.run.endedReason).toBe('cut');
    expect(die.run.holesSurvived).toBe(40); // the failed hole never counts
    expect(die.run.bonusShards).toBe(40);
  });

  it('playStop stops at the first failed hole and every seeded run terminates by the bar', () => {
    for (let seed = 0; seed < 12; seed++) {
      const { run, stops } = simulateRun(seed, { formatId: 'unending' });
      expect(run.status).toBe('ended');
      expect(run.endedReason).toBe('cut');
      expect(stops[stops.length - 1]!.passed).toBe(false);
      // The ledger equals 4 per survived stop plus the dying stop's leading passes.
      const survivedStops = stops.filter((s) => s.passed).length;
      expect(run.holesSurvived).toBeGreaterThanOrEqual(survivedStops * 4);
      expect(run.holesSurvived).toBeLessThan(survivedStops * 4 + 4);
    }
  });

  it('playStop is reproducible and the gate verdict matches endlessHolePassed hole-for-hole', () => {
    const run = startRun(77, 'unending');
    const a = playStop(run);
    const b = playStop(run);
    expect(a.result).toEqual(b.result);
    expect(a.played.length).toBeLessThanOrEqual(4);
    for (let i = 0; i < a.played.length; i++) {
      const pass = endlessHolePassed(run, i, a.played[i]!);
      // Every hole but a failing last one passed; a short stop's last hole is the death.
      expect(pass).toBe(!(i === a.played.length - 1 && !a.result.passed));
    }
  });

  it('holesSurvived round-trips through snapshot/resume (the bar survives a reload)', () => {
    let run = startRun(5, 'unending');
    run = { ...run, holesSurvived: 23, stopIndex: 6, distanceFromStart: 9 };
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.holesSurvived).toBe(23);
    expect(holeGateArmed(resumed)).toBe(true);
    expect(endlessHoleNumber(resumed, 0)).toBe(24);
  });

  it('the default format is the Unending Universe; the voyage is untouched by the gate', () => {
    expect(DEFAULT_FORMAT).toBe('unending');
    expect(getFormat('unending').holeGate).toBe(true);
    expect(getFormat('voyage').holeGate).toBeUndefined();
    // Voyage runs never advance the ledger.
    const voyage = playStop(startRun(3, 'voyage'));
    expect(voyage.run.holesSurvived).toBe(0);
  });
});

describe('the reducer plumbs progression + unlocks (GS-unending)', () => {
  it('endlessProgressUpdates lifts the lifetime best and grants crossed unlocks into the owned pools', () => {
    const s = initState(1);
    const run = { ...startRun(1, 'unending'), holesSurvived: 60 };
    const up = endlessProgressUpdates(s, run);
    expect(up.endlessBestHoles).toBe(60);
    expect(up.ownedApparel).toContain('bag-evergreen');
    expect(up.ownedApparel).toContain('cap-baggy-green');
    expect(up.ownedApparel).not.toContain('pants-evergreen');
    // At 150 the secret ship lands in the fleet.
    const deep = endlessProgressUpdates(s, { ...run, holesSurvived: 150 });
    expect(deep.ownedShips).toContain('infinity-ace');
    expect(deep.ownedApparel).toContain('jacket-green');
    // No regression below the recorded best, and non-gate formats are ignored.
    const s2: UiState = { ...s, endlessBestHoles: 80 };
    expect(endlessProgressUpdates(s2, run)).toEqual({});
    expect(endlessProgressUpdates(s, { ...startRun(1, 'voyage'), holesSurvived: 60 })).toEqual({});
  });

  it('an earned Evergreen piece equips in the Clubhouse like any owned garment (incl. the bag slot)', () => {
    let s = initState(7, { ownedApparel: ['bag-evergreen', 'jacket-green'] });
    s = reduce(s, { type: 'openClubhouse', characterId: 'feather-fade' });
    s = reduce(s, { type: 'equipApparel', id: 'jacket-green' });
    s = reduce(s, { type: 'equipApparel', id: 'bag-evergreen' });
    expect(s.shirtByCharacter['feather-fade']).toBe('jacket-green');
    expect(s.golfBagByCharacter['feather-fade']).toBe('bag-evergreen');
    // The bag toggles off like every other slot.
    s = reduce(s, { type: 'equipApparel', id: 'bag-evergreen' });
    expect(s.golfBagByCharacter['feather-fade']).toBeUndefined();
  });

  it('interactive play dies at the same hole as the headless sim (auto ≡ interactive)', () => {
    // Drive stops interactively with the AI's own decisions (autoShotHole) until the run ends, then
    // compare the ledger + history against the pure playStop-driven run for the SAME seed.
    const seed = 11;
    const headless = simulateRun(seed, { formatId: 'unending' }, 100);

    let s = reduce(initState(seed), { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    // Match the headless default strategy: no buys, always route 0.
    let guard = 0;
    while (s.screen !== 'gameover' && guard++ < 3000) {
      if (s.screen === 'intro') {
        s = reduce(s, { type: 'playInteractive' });
      } else if (s.screen === 'playing') {
        s = s.play && s.play.done ? reduce(s, { type: 'holeComplete' }) : reduce(s, { type: 'autoShotHole' });
      } else if (s.screen === 'result') {
        s = reduce(s, { type: 'continue' });
      } else if (s.screen === 'shop') {
        s = reduce(s, { type: 'leaveShop' });
      } else if (s.screen === 'travel') {
        s = reduce(s, { type: 'route', routeId: s.routes![0]!.id });
      } else {
        break;
      }
    }
    // The character changes the loadout, so replay headless WITH the same character for a fair diff.
    const headlessChar = simulateRun(seed, { formatId: 'unending', characterId: 'feather-fade' }, 100);
    expect(s.screen).toBe('gameover');
    expect(s.run.holesSurvived).toBe(headlessChar.run.holesSurvived);
    expect(s.run.history.map((h) => h.stableford)).toEqual(headlessChar.run.history.map((h) => h.stableford));
    // And the no-character headless run also terminated (sanity on the harness itself).
    expect(headless.run.status).toBe('ended');
  });
});
