import { describe, it, expect } from 'vitest';
import {
  FULL_BAG_SHARD_BONUS,
  ascensionClubReward,
  addUnlockedClubs,
  unlockableClubTypes,
} from '../src/sim/rpg/club-unlock';
import { finishStop, shardsForRun, startRun, snapshotRun, resumeRun, startingLoadoutFor, type Run } from '../src/sim/rpg/run';
import { applyCharacter } from '../src/sim/rpg/characters';
import { startingLoadout } from '../src/sim/rpg/economy';
import { getFormat } from '../src/sim/rpg/formats';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { CLUBS } from '../src/sim/clubs';
import { initState, reduce, runEndUpdates } from '../src/ui/game';

const carryOf = (bag: { id: string; carry: number }[], id: string) => bag.find((c) => c.id === id)?.carry;
const rarityOf = (bag: { id: string; rarity?: string }[], id: string) => bag.find((c) => c.id === id)?.rarity;

describe('ascension victory club unlock — eligible pool (GS-ascension-clubs)', () => {
  it('excludes the clubs a golfer already carries, the putter, and already-unlocked clubs', () => {
    const have = new Set(applyCharacter('feather-fade', startingLoadout()).bag.map((c) => c.id));
    const pool = unlockableClubTypes('feather-fade');
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) {
      expect(have.has(id)).toBe(false); // never a club she already holds
      expect(id).not.toBe('putter'); // putter is universal
    }
    // Already-unlocked clubs drop out of the pool, shrinking it by exactly one.
    const pick = pool[0]!;
    expect(unlockableClubTypes('feather-fade', [pick])).not.toContain(pick);
    expect(unlockableClubTypes('feather-fade', [pick]).length).toBe(pool.length - 1);
  });

  it('Longshot Larry is never offered a hybrid to unlock', () => {
    const pool = unlockableClubTypes('longshot-larry');
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.some((id) => /H$/.test(id))).toBe(false);
    // Another golfer CAN unlock a hybrid (Feather lacks the 2-Hybrid / 4-Hybrid).
    expect(unlockableClubTypes('feather-fade').some((id) => /H$/.test(id))).toBe(true);
  });
});

describe('ascension victory reward roll (GS-ascension-clubs)', () => {
  it('grants a club the golfer lacks, at the starting-bag rarity, deterministically', () => {
    const r1 = ascensionClubReward('feather-fade', 'rare', [], 'seed-7:2');
    const r2 = ascensionClubReward('feather-fade', 'rare', [], 'seed-7:2');
    expect(r1).toEqual(r2); // deterministic from the seed
    expect(r1.kind).toBe('club');
    if (r1.kind === 'club') {
      expect(r1.rarity).toBe('rare'); // matches the starting-bag tier
      expect(unlockableClubTypes('feather-fade')).toContain(r1.clubType);
      expect(r1.clubName).toBe(CLUBS.find((c) => c.id === r1.clubType)!.name);
    }
  });

  it('pays a rarity-scaled Shard bonus once the golfer carries every club', () => {
    const all = unlockableClubTypes('feather-fade'); // unlock everything → bag full
    expect(ascensionClubReward('feather-fade', 'common', all, 's')).toEqual({ kind: 'shards', shards: FULL_BAG_SHARD_BONUS.common });
    expect(ascensionClubReward('feather-fade', 'rare', all, 's')).toEqual({ kind: 'shards', shards: FULL_BAG_SHARD_BONUS.rare });
    expect(ascensionClubReward('feather-fade', 'epic', all, 's')).toEqual({ kind: 'shards', shards: FULL_BAG_SHARD_BONUS.epic });
    expect(ascensionClubReward('feather-fade', 'legendary', all, 's')).toEqual({ kind: 'shards', shards: FULL_BAG_SHARD_BONUS.legendary });
  });

  it('the consolation table matches the spec (15/25/45/70)', () => {
    expect(FULL_BAG_SHARD_BONUS).toEqual({ common: 15, rare: 25, epic: 45, legendary: 70 });
  });
});

describe('unlocked clubs grow the starting bag (GS-ascension-clubs)', () => {
  it('an empty unlock list leaves the loadout byte-for-byte unchanged', () => {
    const before = startingLoadoutFor({}, 'feather-fade', 'common');
    const after = addUnlockedClubs(before, []);
    expect(after).toBe(before); // same reference — the no-op fast path
    // …and startRun with no unlocks builds the same bag as the default.
    const a = startRun(5, 'voyage', {}, 'feather-fade', 0, 'common', []);
    const b = startRun(5, 'voyage', {}, 'feather-fade', 0);
    expect(a.loadout.bag).toEqual(b.loadout.bag);
  });

  it('a common-tier unlock joins the bag as a common starter club at base carry', () => {
    const lo = startingLoadoutFor({}, 'feather-fade', 'common', ['7i']);
    expect(lo.bag.find((c) => c.id === '7i')).toBeTruthy();
    expect(carryOf(lo.bag, '7i')).toBe(134); // scoring base — no overshoot
    expect(rarityOf(lo.bag, '7i')).toBe('common');
    // The bag stays sorted longest → shortest after the insert.
    for (let i = 1; i < lo.bag.length; i++) expect(lo.bag[i]!.carry).toBeLessThanOrEqual(lo.bag[i - 1]!.carry);
  });

  it('a rare bag re-stamps the unlocked club to the bag rarity with the rest of the bag', () => {
    const lo = startingLoadoutFor({}, 'feather-fade', 'rare', ['7i']);
    expect(rarityOf(lo.bag, '7i')).toBe('rare'); // follows the live bag tier, like every other club
    expect(carryOf(lo.bag, '7i')).toBe(134); // a scoring club keeps base carry at any tier
  });

  it("an unlocked DISTANCE club inherits the golfer's distance bonus (Larry's +14)", () => {
    const lo = startingLoadoutFor({}, 'longshot-larry', 'common', ['3W']);
    expect(carryOf(lo.bag, '3W')).toBe(235 + 14);
  });

  it('unlocked clubs round-trip through snapshot/resume', () => {
    const run = startRun(11, 'voyage', {}, 'feather-fade', 2, 'common', ['7i', '3W']);
    const snap = snapshotRun(run);
    expect(snap.unlockedClubs).toEqual(['7i', '3W']);
    const resumed = resumeRun(snap);
    expect(resumed.unlockedClubs).toEqual(['7i', '3W']);
    expect(resumed.loadout.bag.map((c) => `${c.id}:${c.carry}`).sort()).toEqual(
      run.loadout.bag.map((c) => `${c.id}:${c.carry}`).sort(),
    );
  });
});

// --- Reducer integration: a won voyage records the unlock on the played character ---------------

/** A deterministically-WON voyage run for the given golfer (a natural voyage win is far too rare to
 *  drive in a unit test, so we drop onto the final boss stop and force the match win — the same trick
 *  voyage.test uses). Bag tier `common` unless overridden via startRun. */
function wonVoyage(seed: number, characterId: string): Run {
  const voyage = getFormat('voyage');
  let run = startRun(seed, 'voyage', {}, characterId);
  run = { ...run, stopIndex: voyage.stops.length - 1, distanceFromStart: 20 };
  const course = generateCourse(`${run.seed}:stop:${run.stopIndex}`, { holes: 6 });
  const played = playCourse(course.holes, new Rng(`${course.seed}:play`), { bag: run.loadout.bag });
  const { run: ended } = finishStop(run, course, played, { matchWon: true }); // force the boss duel win
  return ended;
}

describe('reducer: a won voyage rewards the played golfer (GS-ascension-clubs)', () => {
  it('selectCharacter grows the bag with that golfer’s permanently-unlocked clubs', () => {
    let s = initState(1, { maxAscension: 0, unlockedClubsByCharacter: { 'feather-fade': ['7i'] } });
    s = reduce(s, { type: 'start', format: 'voyage' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    expect(s.run.loadout.bag.find((c) => c.id === '7i')).toBeTruthy();
    // A DIFFERENT golfer doesn't inherit Feather's unlock.
    let s2 = initState(1, { unlockedClubsByCharacter: { 'feather-fade': ['7i'] } });
    s2 = reduce(s2, { type: 'start', format: 'voyage' });
    s2 = reduce(s2, { type: 'selectCharacter', characterId: 'backspin-bo' });
    expect(s2.run.loadout.bag.find((c) => c.id === '7i')).toBeFalsy();
  });

  it('a won voyage banks a new club for the played golfer (at the starting-bag rarity)', () => {
    const win = wonVoyage(7, 'feather-fade');
    expect(win.endedReason).toBe('won');
    const state = initState(1, {}); // common bag, nothing unlocked yet
    const upd = runEndUpdates(state, win);
    expect(upd.lastClubUnlock?.kind).toBe('club');
    const owned = upd.unlockedClubsByCharacter!['feather-fade'] ?? [];
    expect(owned.length).toBe(1);
    if (upd.lastClubUnlock?.kind === 'club') {
      expect(owned).toEqual([upd.lastClubUnlock.clubType]);
      expect(upd.lastClubUnlock.rarity).toBe('common'); // matches the common starting bag
      expect(unlockableClubTypes('feather-fade')).toContain(upd.lastClubUnlock.clubType);
    }
    // The Ascension tier also advances on a win (existing GS-ascension behaviour, unaffected).
    expect(upd.maxAscension).toBe(1);
  });

  it('a won voyage with a FULL bag pays the Shard consolation instead', () => {
    const win = wonVoyage(7, 'feather-fade');
    const allUnlocked = unlockableClubTypes('feather-fade'); // everything already won
    const state = initState(1, { unlockedClubsByCharacter: { 'feather-fade': allUnlocked } });
    const upd = runEndUpdates(state, win);
    expect(upd.lastClubUnlock).toEqual({ kind: 'shards', shards: FULL_BAG_SHARD_BONUS.common });
    // The consolation is added ON TOP of the normal run shards; the unlock map is unchanged.
    expect(upd.shards).toBe(state.shards + shardsForRun(win) + FULL_BAG_SHARD_BONUS.common);
    expect(upd.unlockedClubsByCharacter!['feather-fade']).toEqual(allUnlocked);
  });

  it('a run that ended at the CUT (not won) grants no club and banks only run shards', () => {
    let run = startRun(7, 'voyage', {}, 'feather-fade');
    run = { ...run, stopIndex: 0, distanceFromStart: 20 };
    const course = generateCourse(`${run.seed}:stop:0`, { holes: 6 });
    const played = playCourse(course.holes, new Rng(`${course.seed}:play`), { bag: run.loadout.bag });
    const { run: ended } = finishStop(run, course, played, { matchWon: false }); // forced miss
    expect(ended.endedReason).toBe('cut');
    const state = initState(1, {});
    const upd = runEndUpdates(state, ended);
    expect(upd.lastClubUnlock).toBeUndefined();
    expect(upd.unlockedClubsByCharacter).toBe(state.unlockedClubsByCharacter); // untouched
    expect(upd.shards).toBe(state.shards + shardsForRun(ended));
  });
});
