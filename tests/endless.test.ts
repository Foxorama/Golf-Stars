import { describe, it, expect } from 'vitest';
import {
  ENDLESS_SET_STEPS,
  ENDLESS_SET_HOLES,
  ENDLESS_SETS_PER_STEP,
  ENDLESS_MILESTONES,
  ENDLESS_UNLOCKS,
  endlessSetGateOverPar,
  endlessSetLabel,
  endlessSetToPar,
  passesEndlessSet,
  endlessMilestoneShards,
  endlessMilestonesCrossed,
  endlessUnlocksCrossed,
  endlessUnlocksEarned,
  nextEndlessUnlock,
  CLUB_SET_DIFFICULTIES,
  clubSetOf,
  formatToPar,
  addEndlessRecord,
  bestEndlessRecord,
  ENDLESS_RECORDS_KEPT,
  type EndlessRunRecord,
} from '../src/sim/rpg/endless';
import {
  currentCourse,
  endlessHoleNumber,
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
import { apparelById, apparelRevealedInMarket, canBuyApparel, equippedSet } from '../src/sim/rpg/apparel';
import { shipById, canBuyShip, shipRevealedInMarket } from '../src/sim/rpg/ships';
import { BAG_SETS, bagSetRevealedInMarket } from '../src/sim/rpg/bag';
import { initState, reduce, endlessProgressUpdates, runEndUpdates, type UiState } from '../src/ui/game';
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

describe('the per-set survival bar (GS-set-survival)', () => {
  it('tightens one stroke every two SETS: +4 → +3 → +2 → +1 → E → −1 → −2 → −3, capped at −4', () => {
    // Keyed off the 0-based stop index (= holesSurvived / 4); two sets per band.
    expect(endlessSetGateOverPar(0)).toBe(4); // set 1
    expect(endlessSetGateOverPar(1)).toBe(4); // set 2
    expect(endlessSetGateOverPar(2)).toBe(3); // set 3
    expect(endlessSetGateOverPar(3)).toBe(3); // set 4
    expect(endlessSetGateOverPar(4)).toBe(2); // set 5
    expect(endlessSetGateOverPar(6)).toBe(1); // set 7
    expect(endlessSetGateOverPar(8)).toBe(0); // set 9 — even
    expect(endlessSetGateOverPar(10)).toBe(-1); // set 11
    expect(endlessSetGateOverPar(12)).toBe(-2); // set 13
    expect(endlessSetGateOverPar(14)).toBe(-3); // set 15
    expect(endlessSetGateOverPar(16)).toBe(-4); // set 17 — the cap
    expect(endlessSetGateOverPar(999)).toBe(-4); // −4 forever
    expect(ENDLESS_SET_STEPS[ENDLESS_SET_STEPS.length - 1]).toBe(-4);
    expect(ENDLESS_SET_HOLES).toBe(4);
    expect(ENDLESS_SETS_PER_STEP).toBe(2);
  });

  it('scores the four-hole cumulative total, not a single hole', () => {
    const set = [
      { record: { par: 4, strokes: 8 } }, // +4 blow-up (capped)
      { record: { par: 4, strokes: 3 } }, // −1
      { record: { par: 4, strokes: 3 } }, // −1
      { record: { par: 4, strokes: 3 } }, // −1
    ];
    expect(endlessSetToPar(set)).toBe(1); // +4 −1 −1 −1 = +1
    // Set 1 allowance is +4: the blow-up is absorbed by the three birdies → the set SURVIVES.
    expect(passesEndlessSet(1, 0)).toBe(true);
    // Four flat pars (E) survive +4/+3/+2/+1/E bands but MISS the −1 band and tighter.
    expect(passesEndlessSet(0, 8)).toBe(true); // set 9, E
    expect(passesEndlessSet(0, 10)).toBe(false); // set 11, −1
    // Labels read like a scorecard target.
    expect(endlessSetLabel(4)).toBe('+4');
    expect(endlessSetLabel(0)).toBe('E');
    expect(endlessSetLabel(-4)).toBe('−4');
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
    // The ladder: bag @40, cap @60, pants @80, the Evergreen Blazer @100, the secret ship @150.
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

  it('earned & gated unlocks stay HIDDEN from the Trade Market until unlocked/owned (GS-hide-unlocks)', () => {
    // Earn-only cosmetics: out of the market until OWNED (never spoil the milestone reward).
    for (const u of ENDLESS_UNLOCKS) {
      if (u.kind === 'apparel') {
        const item = apparelById(u.id)!;
        expect(apparelRevealedInMarket(item, [])).toBe(false); // not earned yet → hidden
        expect(apparelRevealedInMarket(item, [u.id])).toBe(true); // owned → shown (greyed "✓ owned")
      } else {
        const ship = shipById(u.id)!;
        expect(shipRevealedInMarket(ship, [])).toBe(false);
        expect(shipRevealedInMarket(ship, [u.id])).toBe(true);
      }
    }
    // Ordinary for-sale gear is always shown regardless of ownership.
    expect(apparelRevealedInMarket(apparelById('cap-classic')!, [])).toBe(true);
    expect(shipRevealedInMarket(shipById('racer-redline')!, [])).toBe(true);

    // Gated club-set upgrades: purchasable, so revealed once AVAILABLE TO BUY (gate cleared) — or owned.
    const planet = BAG_SETS.find((s) => s.tier === 'rare')!; // unlocks at A2 clear (maxAscension 3)
    expect(bagSetRevealedInMarket(planet, 2, 'common')).toBe(false); // gate not yet cleared → hidden
    expect(bagSetRevealedInMarket(planet, 3, 'common')).toBe(true); // available to buy → shown
    // Owned lower tier stays shown even if a re-lock somehow occurred (rank-based ownership).
    expect(bagSetRevealedInMarket(planet, 0, 'rare')).toBe(true);
  });

  it('the Evergreen set completes only with all FOUR slots worn (bag included)', () => {
    expect(equippedSet('cap-baggy-green', 'jacket-green', 'pants-evergreen', 'bag-evergreen')).toBe('Evergreen');
    expect(equippedSet('cap-baggy-green', 'jacket-green', 'pants-evergreen')).toBeUndefined(); // no bag
    // Bag-less sets are untouched by the 4th slot (Astronaut still completes on its three).
    expect(equippedSet('helmet-astro', 'suit-space', 'pants-astro')).toBe('Astronaut');
  });
});

describe('the Unending Universe run engine (GS-set-survival)', () => {
  it('finishStop scores the whole set, banks milestone shards on a cleared set, and ends on a missed set', () => {
    const base = startRun(1, 'unending');
    const course = currentCourse(base);
    expect(course.holes.length).toBe(4);
    const pars = course.holes.map((h) => h.par);

    // Set 10 (stopIndex 9) allowance is EVEN: four pars clear it → holes 36→40, milestone 40 banked.
    const at36: Run = { ...base, holesSurvived: 36, stopIndex: 9 };
    const pass = finishStop(at36, course, pars.map((p) => played(p, p)));
    expect(pass.result.passed).toBe(true);
    expect(pass.run.status).toBe('active');
    expect(pass.run.holesSurvived).toBe(40);
    expect(pass.run.bonusShards).toBe(40); // the hole-40 bonus, banked mid-run

    // Set 11 (stopIndex 10) needs −1 for the set: four pars (E) miss it → the run ends, no new holes.
    const at40: Run = { ...base, holesSurvived: 40, stopIndex: 10 };
    const die = finishStop(at40, course, pars.map((p) => played(p, p)));
    expect(die.result.passed).toBe(false);
    expect(die.run.status).toBe('ended');
    expect(die.run.endedReason).toBe('cut');
    expect(die.run.holesSurvived).toBe(40); // the busted set never counts
  });

  it('a single blow-up hole no longer wrecks the set — the four-hole total is what counts', () => {
    const base = startRun(1, 'unending');
    const course = currentCourse(base);
    const pars = course.holes.map((h) => h.par);
    // Set 1 (stopIndex 0, allowance +4): one quad-bogey blow-up (+4) clawed back by three birdies (−3)
    // → cumulative +1 ≤ +4 → the set SURVIVES (the whole point of the redesign).
    const at0: Run = { ...base, holesSurvived: 0, stopIndex: 0 };
    const res = finishStop(at0, course, [
      played(pars[0]!, pars[0]! + 4),
      played(pars[1]!, pars[1]! - 1),
      played(pars[2]!, pars[2]! - 1),
      played(pars[3]!, pars[3]! - 1),
    ]);
    expect(res.result.passed).toBe(true);
    expect(res.run.holesSurvived).toBe(4);
  });

  it('milestone shards are LIFETIME-once: a re-crossed milestone (prevBestHoles) banks nothing', () => {
    const base = startRun(1, 'unending');
    const course = currentCourse(base);
    const pars = course.holes.map((h) => h.par);
    const at36: Run = { ...base, holesSurvived: 36, stopIndex: 9 }; // set 10, allowance E

    // First time reaching hole 40 (lifetime best 0/36 below it) still pays the crossing.
    const fresh = finishStop(at36, course, pars.map((p) => played(p, p)), { prevBestHoles: 36 });
    expect(fresh.run.holesSurvived).toBe(40);
    expect(fresh.run.bonusShards).toBe(40);

    // Re-playing over already-conquered ground: the lifetime best is past hole 40, so re-crossing it
    // banks NOTHING (the reward was earned once, in the run that first reached it).
    const replay = finishStop(at36, course, pars.map((p) => played(p, p)), { prevBestHoles: 60 });
    expect(replay.run.holesSurvived).toBe(40);
    expect(replay.run.bonusShards).toBe(0);

    // New ground beyond the lifetime best still pays: best 40, this set (stopIndex 14, allowance −3)
    // is birdied out (−4) → holes 56→60, the hole-60 bonus banks.
    const at56: Run = { ...base, holesSurvived: 56, stopIndex: 14 };
    const beyond = finishStop(at56, course, pars.map((p) => played(p, p - 1)), { prevBestHoles: 40 });
    expect(beyond.run.holesSurvived).toBe(60);
    expect(beyond.run.bonusShards).toBe(60);
  });

  it('every seeded run terminates by the set bar, crediting whole sets only', () => {
    for (let seed = 0; seed < 12; seed++) {
      const { run, stops } = simulateRun(seed, { formatId: 'unending' });
      expect(run.status).toBe('ended');
      expect(run.endedReason).toBe('cut');
      expect(stops[stops.length - 1]!.passed).toBe(false);
      // The ledger is exactly 4 per CLEARED set; the busted set adds nothing (no mid-set credit).
      const survivedStops = stops.filter((s) => s.passed).length;
      expect(run.holesSurvived).toBe(survivedStops * 4);
    }
  });

  it('playStop plays the full set, is reproducible, and its verdict matches passesEndlessSet', () => {
    const run = startRun(77, 'unending');
    const a = playStop(run);
    const b = playStop(run);
    expect(a.result).toEqual(b.result);
    expect(a.played.length).toBe(4); // always the whole set now — no early break
    expect(a.result.passed).toBe(passesEndlessSet(endlessSetToPar(a.played), run.stopIndex));
  });

  it('holesSurvived round-trips through snapshot/resume (the bar survives a reload)', () => {
    let run = startRun(5, 'unending');
    run = { ...run, holesSurvived: 24, stopIndex: 6, distanceFromStart: 9 };
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.holesSurvived).toBe(24);
    expect(holeGateArmed(resumed)).toBe(true);
    expect(endlessHoleNumber(resumed, 0)).toBe(25);
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

describe('starting club sets = the difficulty axis (GS-set-survival)', () => {
  it('the four sets map to green/blue/purple/orange rarities (no handicap/net anymore)', () => {
    expect(CLUB_SET_DIFFICULTIES.map((d) => d.key)).toEqual(['green', 'blue', 'purple', 'orange']);
    expect(CLUB_SET_DIFFICULTIES.map((d) => d.tier)).toEqual(['common', 'rare', 'epic', 'legendary']);
    expect(clubSetOf(undefined).key).toBe('green'); // absent ⇒ the starter set
    expect((clubSetOf('common') as unknown as Record<string, unknown>).handicap18).toBeUndefined(); // net scoring is gone
  });

  it('formats a to-par figure like a golf scorecard', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(-3)).toBe('−3');
    expect(formatToPar(5)).toBe('+5');
  });
});

describe('the last-runs leaderboard records (GS-set-survival)', () => {
  const rec = (over: Partial<EndlessRunRecord> = {}): EndlessRunRecord => ({
    characterId: 'feather-fade',
    tier: 'common',
    holes: 12,
    gross: 55,
    par: 49,
    ascension: 0,
    seed: 1,
    ...over,
  });

  it('prepends newest-first and caps the stored window', () => {
    let recs: EndlessRunRecord[] = [];
    for (let i = 0; i < ENDLESS_RECORDS_KEPT + 5; i++) recs = addEndlessRecord(recs, rec({ seed: i, holes: i }));
    expect(recs.length).toBe(ENDLESS_RECORDS_KEPT);
    expect(recs[0]!.seed).toBe(ENDLESS_RECORDS_KEPT + 4); // the most recent is first
  });

  it('picks the furthest-reaching run as the best; ties keep the most recent (depth is the only key)', () => {
    const a = rec({ seed: 1, holes: 20 });
    const b = rec({ seed: 2, holes: 30 }); // further → best
    const c = rec({ seed: 3, holes: 30 }); // same depth
    expect(bestEndlessRecord([a, b])).toBe(b);
    // Records are stored newest-first, so a tie resolves to the earlier (more recent) entry.
    expect(bestEndlessRecord([b, c])).toBe(b);
    expect(bestEndlessRecord([])).toBeUndefined();
  });
});

describe('finishStop banks a cleared set (GS-set-survival)', () => {
  it('banks the whole set gross + par on a cleared set (0 on a bust) and round-trips through resume', () => {
    const base = startRun(3, 'unending');
    const course = currentCourse(base);
    const pars = course.holes.map((h) => h.par);
    const total = pars.reduce((a, b) => a + b, 0);
    // Set 1 (stopIndex 0, allowance +4): four pars clear it → the whole four-hole set banks.
    const pass = finishStop(base, course, pars.map((p) => played(p, p)));
    expect(pass.result.passed).toBe(true);
    expect(pass.run.holesSurvived).toBe(4);
    expect(pass.run.grossStrokes).toBe(total);
    expect(pass.run.parPlayed).toBe(total);
    const resumed = resumeRun(snapshotRun(pass.run));
    expect(resumed.grossStrokes).toBe(pass.run.grossStrokes);
    expect(resumed.parPlayed).toBe(pass.run.parPlayed);

    // A busted set (stopIndex 10 needs −1, four pars miss) banks nothing.
    const at40: Run = { ...base, holesSurvived: 40, stopIndex: 10 };
    const bust = finishStop(at40, course, pars.map((p) => played(p, p)));
    expect(bust.result.passed).toBe(false);
    expect(bust.run.holesSurvived).toBe(40);
    expect(bust.run.grossStrokes).toBe(base.grossStrokes); // unchanged
  });

  it('a voyage run never accumulates the endless round (stays 0)', () => {
    const course = currentCourse(startRun(3, 'voyage'));
    const pars = course.holes.map((h) => h.par);
    const res = finishStop(startRun(3, 'voyage'), course, pars.map((p) => played(p, p)));
    expect(res.run.grossStrokes).toBe(0);
    expect(res.run.parPlayed).toBe(0);
  });
});

describe('runEndUpdates banks the finished run into the last-runs leaderboard (GS-golf-score)', () => {
  it('records an ended endless run (golfer, club set, holes, gross/par) once; a voyage run records nothing', () => {
    const s = initState(1);
    const run: Run = {
      ...startRun(7, 'unending', {}, 'feather-fade'),
      status: 'ended',
      endedReason: 'cut',
      holesSurvived: 15,
      grossStrokes: 70,
      parPlayed: 62,
      bagTier: 'common',
    };
    const up = runEndUpdates(s, run);
    expect(up.endlessRuns!.length).toBe(1);
    expect(up.endlessRuns![0]).toMatchObject({
      characterId: 'feather-fade',
      tier: 'common',
      holes: 15,
      gross: 70,
      par: 62,
      seed: 7,
    });
    // An active run banks nothing; a voyage run (non-gate) never touches the endless history.
    expect(runEndUpdates(s, { ...run, status: 'active' }).endlessRuns).toBeUndefined();
    const voyage: Run = { ...startRun(7, 'voyage', {}, 'feather-fade'), status: 'ended', endedReason: 'cut' };
    expect(runEndUpdates(s, voyage).endlessRuns).toBe(s.endlessRuns);
  });
});
