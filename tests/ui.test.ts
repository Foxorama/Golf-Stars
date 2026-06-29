import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { shotView, awaitingPutt } from '../src/sim/rpg/play';

/** Drive a whole stop via the interactive reducer flow (attacking every shot). */
function playStopInteractive(s: UiState): UiState {
  s = reduce(s, { type: 'playInteractive' });
  let guard = 0;
  while (s.screen === 'playing' && guard++ < 400) {
    if (s.play && s.play.done) {
      s = reduce(s, { type: 'holeComplete' });
    } else if (s.play && awaitingPutt(s.play)) {
      // Manual putting is the default now — stroke the putt out (no control = the rng putt model).
      s = reduce(s, { type: 'putt' });
    } else if (s.play) {
      const v = shotView(s.play, s.run.loadout);
      s = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
    } else {
      break;
    }
  }
  return s;
}

/** A run started from the title screen with the given format (and a golfer picked, GS-18). */
function started(seed: number | string, format = 'flat'): UiState {
  const picked = reduce(initState(seed), { type: 'start', format });
  return reduce(picked, { type: 'selectCharacter', characterId: 'feather-fade' });
}

/** Drive the reducer through one full stop (play → continue → shop → travel → next). */
function advanceStop(s: UiState, buys: string[] = []): UiState {
  s = reduce(s, { type: 'play' });
  if (s.screen === 'gameover') return s;
  s = reduce(s, { type: 'continue' });
  for (const id of buys) s = reduce(s, { type: 'buy', id });
  s = reduce(s, { type: 'leaveShop' });
  const routeId = s.routes![0]!.id;
  return reduce(s, { type: 'route', routeId });
}

describe('ui reducer', () => {
  it('a fresh seed opens on the title screen; start picks a format then a golfer', () => {
    const title = initState(1234);
    expect(title.screen).toBe('title');
    const picked = reduce(title, { type: 'start', format: 'ladder' });
    expect(picked.screen).toBe('character'); // GS-18: choose a golfer before the run begins
    expect(picked.run.formatId).toBe('ladder');
    const s = reduce(picked, { type: 'selectCharacter', characterId: 'longshot-larry' });
    expect(s.screen).toBe('intro');
    expect(s.run.formatId).toBe('ladder');
    expect(s.run.loadout.characterId).toBe('longshot-larry');
    expect(s.course.holes.length).toBe(3); // ladder stop 0 = 3 par-3s
    expect(s.course.holes.every((h) => h.par === 3)).toBe(true);
  });

  it('playing a passable stop goes to the result screen with played holes', () => {
    const s = reduce(started(3), { type: 'play' }); // seed 3 clears the opening cut comfortably
    expect(s.screen).toBe('result');
    expect(s.played).toHaveLength(s.course.holes.length);
    expect(s.lastResult!.passed).toBe(true);
    expect(s.bestStableford).toBe(s.lastResult!.stableford);
  });

  it('playInteractive drops straight into the first hole (no briefing splash)', () => {
    let s = reduce(started(3), { type: 'playInteractive' });
    expect(s.screen).toBe('playing');
    expect(s.play!.holeIndex).toBe(0);
    expect(s.play!.strokes).toBe(0);
    // The shot-by-shot flow plays immediately — taking a shot advances the hole.
    const v = shotView(s.play!, s.run.loadout);
    s = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
    expect(s.play!.strokes).toBeGreaterThan(0);
  });

  it('the shop offer includes reward clubs, and buying one equips it (GS-clubs)', () => {
    // seed 3 / Feather clears the opening cut → reaches the shop.
    let s = reduce(started(3), { type: 'play' });
    expect(s.screen).toBe('result');
    s = reduce(s, { type: 'continue' });
    expect(s.screen).toBe('shop');
    const clubIds = (s.shopOffer ?? []).filter((id) => id.startsWith('club:'));
    expect(clubIds.length).toBeGreaterThan(0); // reward clubs are on the rack alongside the perks
    // Buying a gap club through the reducer grows the bag (Feather starts without these types).
    const gap = clubIds.find((id) => !s.run.loadout.bag.some((c) => c.id === id.split(':')[2]));
    if (gap) {
      const before = s.run.loadout.bag.length;
      const rich = { ...s, run: { ...s.run, credits: 100000 } };
      const after = reduce(rich, { type: 'buy', id: gap });
      expect(after.run.loadout.bag.length).toBe(before + 1);
    }
  });

  it('ignores actions that do not apply to the current screen', () => {
    const s = started(1234);
    expect(reduce(s, { type: 'continue' })).toBe(s); // can't continue from intro
    expect(reduce(s, { type: 'buy', id: 'gyro' })).toBe(s);
    expect(reduce(s, { type: 'route', routeId: 0 })).toBe(s);
    expect(reduce(s, { type: 'start', format: 'ladder' })).toBe(s); // can't start mid-run
  });

  it('result → shop → buy → travel → next intro', () => {
    let s = reduce(started(3), { type: 'play' }); // passing seed → reaches the result/shop flow
    s = reduce(s, { type: 'continue' });
    expect(s.screen).toBe('shop');
    const before = s.run.credits;
    s = reduce(s, { type: 'buy', id: 'lucky-coin' });
    expect(s.run.credits).toBeLessThan(before);
    expect(s.run.loadout.perks).toContain('lucky-coin');
    s = reduce(s, { type: 'leaveShop' });
    expect(s.screen).toBe('travel');
    expect(s.routes).toHaveLength(3);
    const nextStop = s.run.stopIndex + 1;
    s = reduce(s, { type: 'route', routeId: s.routes![0]!.id });
    expect(s.screen).toBe('intro');
    expect(s.run.stopIndex).toBe(nextStop);
    expect(s.played).toBeUndefined();
  });

  it('entering the shop fixes a rotating offer; leaving clears it', () => {
    let s = reduce(started(3), { type: 'play' }); // passing seed → reaches the shop
    expect(s.shopOffer).toBeUndefined();
    s = reduce(s, { type: 'continue' });
    expect(s.screen).toBe('shop');
    expect(s.shopOffer?.length).toBeGreaterThan(0);
    const offer = s.shopOffer;
    // Buying does not reshuffle the displayed stock.
    s = reduce(s, { type: 'buy', id: offer![0]! });
    expect(s.shopOffer).toEqual(offer);
    s = reduce(s, { type: 'leaveShop' });
    expect(s.shopOffer).toBeUndefined();
  });

  it('manual putting: a hole is finished by stroking putts', () => {
    // No Auto-Caddie owned, so putting is manual: the ball waits on the green for stroked putts.
    let s = reduce(started(1234), { type: 'playInteractive' });
    let sawPutt = false;
    let guard = 0;
    while (s.screen === 'playing' && guard++ < 800) {
      if (!s.play) break;
      if (s.play.done) {
        s = reduce(s, { type: 'holeComplete' });
      } else if (awaitingPutt(s.play)) {
        sawPutt = true;
        s = reduce(s, { type: 'putt' });
      } else {
        const v = shotView(s.play, s.run.loadout);
        s = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
      }
    }
    expect(sawPutt).toBe(true); // manual putts actually happened
    expect(['result', 'gameover']).toContain(s.screen); // the stop completed
  });

  it('viewHole selects and clamps within the played holes', () => {
    let s = reduce(started(1234), { type: 'play' });
    s = reduce(s, { type: 'viewHole', hole: 2 });
    expect(s.viewHole).toBe(2);
    s = reduce(s, { type: 'viewHole', hole: 999 });
    expect(s.viewHole).toBe(s.played!.length - 1);
    s = reduce(s, { type: 'viewHole', hole: -5 });
    expect(s.viewHole).toBe(0);
  });

  it('a full playthrough ends in gameover and restart returns to the title', () => {
    // seed 3 clears the opening cut comfortably, then fails a few stops deep as the cut ramps —
    // so the run both advances (bestDistance > 0) and terminates within the cap.
    let s = started(3);
    for (let i = 0; i < 100 && s.screen !== 'gameover'; i++) s = advanceStop(s);
    expect(s.screen).toBe('gameover');
    expect(s.run.status).toBe('ended');
    expect(s.bestDistance).toBeGreaterThan(0);

    const restarted = reduce(s, { type: 'restart', seed: 7 });
    expect(restarted.screen).toBe('title'); // pick a format again
    expect(restarted.bestDistance).toBe(s.bestDistance); // meta carried over
    expect(restarted.shards).toBe(s.shards); // shards carry over too
  });

  it('a missed cut awards Star Shards (GS-12)', () => {
    // Walk the run until a cut is missed (the gentle opening cut is now reliably cleared, so
    // failure comes a few stops deep as the cut ramps) — the missed cut must award shards.
    let s = started(9);
    for (let i = 0; i < 100 && s.screen !== 'gameover'; i++) s = advanceStop(s);
    expect(s.screen).toBe('gameover');
    expect(s.lastRunShards).toBeGreaterThan(0);
    expect(s.shards).toBe(s.lastRunShards);
  });

  it('the Outpost buys permanent upgrades and bakes them into the next run', () => {
    let s = initState(7, { shards: 100, metaUpgrades: {} });
    s = reduce(s, { type: 'openOutpost' });
    expect(s.screen).toBe('outpost');
    const before = s.shards;
    s = reduce(s, { type: 'buyUpgrade', id: 'deep-pockets' });
    expect(s.metaUpgrades['deep-pockets']).toBe(1);
    expect(s.shards).toBeLessThan(before);
    s = reduce(s, { type: 'closeOutpost' });
    expect(s.screen).toBe('title');
    // Deep Pockets (+40 starting credits) is now baked into a fresh run.
    s = reduce(s, { type: 'start', format: 'flat' });
    expect(s.run.credits).toBe(100);
  });

  it('the Outpost is unreachable mid-run and guards bad buys', () => {
    const playing = reduce(started(7), { type: 'playInteractive' });
    expect(reduce(playing, { type: 'openOutpost' })).toBe(playing); // not from a live run
    const outpost = reduce(initState(7, { shards: 0 }), { type: 'openOutpost' });
    expect(reduce(outpost, { type: 'buyUpgrade', id: 'vet-hands' })).toBe(outpost); // can't afford
  });

  it('offers Continue when a saved run is present, and resume enters it', () => {
    // A saved run snapshot (e.g. from localStorage) is offered on the title screen.
    const snap = {
      seed: 42,
      formatId: 'ladder',
      stopIndex: 2,
      distanceFromStart: 5,
      credits: 90,
      perks: ['gyro'],
    };
    const title = initState(1, {}, snap);
    expect(title.screen).toBe('title');
    expect(title.resumable).toEqual(snap);

    const resumed = reduce(title, { type: 'resume' });
    expect(resumed.screen).toBe('intro');
    expect(resumed.run.formatId).toBe('ladder');
    expect(resumed.run.stopIndex).toBe(2);
    expect(resumed.run.loadout.perks).toEqual(['gyro']);
    expect(resumed.resumable).toBeUndefined();
  });

  it('resume is a no-op when there is nothing to resume', () => {
    const title = initState(1);
    expect(reduce(title, { type: 'resume' })).toBe(title);
  });

  it('interactive play: shot-by-shot through a stop reaches a scored result', () => {
    let s = started(1234);
    s = reduce(s, { type: 'playInteractive' });
    expect(s.screen).toBe('playing');
    expect(s.play).toBeDefined();
    expect(s.play!.holeIndex).toBe(0);

    s = playStopInteractive(started(1234));
    expect(['result', 'gameover']).toContain(s.screen);
    expect(s.played).toHaveLength(s.course.holes.length);
    expect(s.lastResult).toBeDefined();
    expect(s.play).toBeUndefined(); // cleaned up after the stop
  });

  it('autoShotHole finishes the current hole', () => {
    let s = reduce(started(7), { type: 'playInteractive' });
    s = reduce(s, { type: 'autoShotHole' });
    expect(s.play!.done).toBe(true);
    s = reduce(s, { type: 'holeComplete' });
    // Either onto the next hole (still playing) or the stop is scored.
    expect(['playing', 'result', 'gameover']).toContain(s.screen);
  });

  it('the ladder format escalates hole counts across stops', () => {
    let s = started(7, 'ladder');
    const counts: number[] = [];
    for (let i = 0; i < 5 && s.screen !== 'gameover'; i++) {
      counts.push(s.course.holes.length);
      s = advanceStop(s);
    }
    // First stops should be non-decreasing in size: 3 → 6 → 9 → 9 → 18.
    expect(counts[0]).toBe(3);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });
});
