import { describe, it, expect } from 'vitest';
import {
  CREDITS_PER_SHARD,
  bank,
  cashOutShards,
  shardsForRun,
  startRun,
  travel,
  routeOptions,
  playStop,
  type Run,
} from '../src/sim/rpg/run';
import { initState, reduce, type UiState } from '../src/ui/game';

/** Force a run into a known mid-voyage state (a couple of stops deep, holding credits). */
function midRun(seed = 12345): Run {
  let run = startRun(seed, 'unending');
  // Play + travel one stop so distanceFromStart/history advance (banking is a between-stops choice).
  const played = playStop(run);
  run = played.run;
  if (run.status !== 'active') return run; // unlucky early cut — still a valid bank target
  const route = routeOptions(run)[0]!;
  run = travel(run, route);
  return { ...run, credits: 200 }; // a stash worth cashing out
}

describe('push-your-luck banking (GS-bank)', () => {
  it('cashOutShards converts unspent credits only when banked', () => {
    const run = midRun();
    const before = cashOutShards(run); // still active → 0
    expect(before).toBe(0);
    const banked = bank(run);
    expect(banked.endedReason).toBe('banked');
    expect(cashOutShards(banked)).toBe(Math.floor(200 / CREDITS_PER_SHARD));
  });

  it('banking awards strictly MORE shards than busting at the same point (when holding credits)', () => {
    const run = midRun();
    const banked = bank(run);
    // The same run, but ended by a cut instead (no credit conversion).
    const busted: Run = { ...run, status: 'ended', endedReason: 'cut' };
    expect(shardsForRun(banked)).toBeGreaterThan(shardsForRun(busted));
    // The difference is exactly the credit conversion.
    expect(shardsForRun(banked) - shardsForRun(busted)).toBe(cashOutShards(banked));
  });

  it('the cut path is byte-for-byte unchanged (no credit conversion)', () => {
    const run = midRun();
    const busted: Run = { ...run, status: 'ended', endedReason: 'cut' };
    const base = Math.max(
      1,
      Math.round(run.distanceFromStart * 3 + run.history.length * 2),
    );
    expect(shardsForRun(busted)).toBe(base);
  });

  it('reducer: banking from the travel screen ends the run and credits the shards', () => {
    let s: UiState = reduce(initState(777), { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    // Drive to a travel screen.
    s = reduce(s, { type: 'play' });
    if (s.screen === 'gameover') return; // unlucky stop-0 cut: nothing to bank, skip
    s = reduce(s, { type: 'continue' });
    s = reduce(s, { type: 'leaveShop' });
    expect(s.screen).toBe('travel');
    const shardsBefore = s.shards;
    s = reduce(s, { type: 'bank' });
    expect(s.screen).toBe('gameover');
    expect(s.run.endedReason).toBe('banked');
    expect(s.lastRunShards).toBeGreaterThan(0);
    expect(s.shards).toBe(shardsBefore + s.lastRunShards!);
  });

  it('reducer: bank is a no-op off the travel screen', () => {
    const s = reduce(initState(1), { type: 'start', format: 'unending' });
    expect(reduce(s, { type: 'bank' })).toBe(s);
  });
});
