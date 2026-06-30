import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { shotView, awaitingPutt } from '../src/sim/rpg/play';
import { shipForCharacter, hatForCharacter, shirtForCharacter, pantsForCharacter } from '../src/ui/game';
import { DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';

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
    // Reward clubs are rare/epic, so they surface as the run goes DEEPER (early Pro Shops now
    // stock mostly common/rare perks). Advance stop-by-stop until a rack racks a reward club.
    const reachShopWithClub = (seed: number): { s: UiState; clubIds: string[] } | null => {
      let s = started(seed);
      for (let stop = 0; stop < 6; stop++) {
        s = reduce(s, { type: 'play' });
        if (s.screen !== 'result') return null; // missed the cut
        s = reduce(s, { type: 'continue' });
        if (s.screen !== 'shop') return null;
        const clubIds = (s.shopOffer ?? []).filter((id) => id.startsWith('club:'));
        if (clubIds.length > 0) return { s, clubIds };
        s = reduce(s, { type: 'leaveShop' });
        const routeId = s.routes?.[0]?.id;
        if (routeId == null) return null;
        s = reduce(s, { type: 'route', routeId });
      }
      return null;
    };
    let found: { s: UiState; clubIds: string[] } | null = null;
    for (let seed = 0; seed < 60 && !found; seed++) found = reachShopWithClub(seed);
    expect(found).not.toBeNull(); // reward clubs do appear on the rack alongside the perks
    const { s, clubIds } = found!;
    // Buying a gap club through the reducer grows the bag (a type the bag doesn't carry yet).
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

  it('the Trade Market buys a ship into GLOBAL ownership; the Clubhouse flies it per character (GS-clubhouse)', () => {
    let s = initState(7, { shards: 500 });
    s = reduce(s, { type: 'openMarket' });
    expect(s.screen).toBe('trademarket');
    const before = s.shards;
    // Buying grants ownership only — it does NOT auto-fly (outfitting is done in the Clubhouse).
    s = reduce(s, { type: 'buyShip', id: 'racer-redline' });
    expect(s.ownedShips).toContain('racer-redline');
    expect(s.shards).toBe(before - 60);
    expect(shipForCharacter(s, 'feather-fade')).toBe(DEFAULT_SHIP_ID); // still on the default wagon
    s = reduce(s, { type: 'closeMarket' });
    expect(s.screen).toBe('title');
    // Open one golfer's Clubhouse and fly the new ride on THEM only.
    s = reduce(s, { type: 'openClubhouse', characterId: 'feather-fade' });
    expect(s.screen).toBe('clubhouse');
    s = reduce(s, { type: 'selectShip', id: 'racer-redline' });
    expect(shipForCharacter(s, 'feather-fade')).toBe('racer-redline');
    expect(shipForCharacter(s, 'huang-woo-hook')).toBe(DEFAULT_SHIP_ID); // a different golfer is untouched
    // The fleet + selection are pure cosmetics — a fresh run is unaffected.
    s = reduce(s, { type: 'closeClubhouse' });
    s = reduce(s, { type: 'start', format: 'flat' });
    expect(s.run.credits).toBe(60); // base starting credits (no permanent stat upgrades anymore)
  });

  it('the Clubhouse selects only OWNED ships, only on the managed character (GS-clubhouse)', () => {
    let s = initState(7, { shards: 0 });
    // Selecting outside the Clubhouse is a no-op.
    expect(reduce(s, { type: 'selectShip', id: 'racer-redline' })).toBe(s);
    s = reduce(s, { type: 'openClubhouse', characterId: 'feather-fade' });
    expect(reduce(s, { type: 'selectShip', id: 'racer-redline' })).toBe(s); // not owned → no-op
    // The market can't be opened mid-run.
    const playing = reduce(started(7), { type: 'playInteractive' });
    expect(reduce(playing, { type: 'openMarket' })).toBe(playing);
  });

  it('the Trade Market buys clothing globally; the Clubhouse wears it per character (GS-clubhouse)', () => {
    let s = initState(7, { shards: 500 });
    s = reduce(s, { type: 'openMarket' });
    const before = s.shards;
    // Buy a hat + shirt → globally owned, NOT auto-worn.
    s = reduce(s, { type: 'buyApparel', id: 'cap-classic' });
    s = reduce(s, { type: 'buyApparel', id: 'polo-classic' });
    expect(s.ownedApparel).toEqual(['cap-classic', 'polo-classic']);
    expect(s.shards).toBe(before - 30);
    expect(hatForCharacter(s, 'feather-fade')).toBeUndefined(); // nothing worn yet
    // Wear them on one golfer in the Clubhouse.
    s = reduce(s, { type: 'closeMarket' });
    s = reduce(s, { type: 'openClubhouse', characterId: 'feather-fade' });
    s = reduce(s, { type: 'equipApparel', id: 'cap-classic' });
    expect(hatForCharacter(s, 'feather-fade')).toBe('cap-classic');
    // Clicking the worn piece again takes it off; clicking once more puts it back on.
    s = reduce(s, { type: 'equipApparel', id: 'cap-classic' });
    expect(hatForCharacter(s, 'feather-fade')).toBeUndefined();
    s = reduce(s, { type: 'equipApparel', id: 'cap-classic' });
    expect(hatForCharacter(s, 'feather-fade')).toBe('cap-classic');
    // Hats and shirts live in independent slots, and another golfer is unaffected.
    s = reduce(s, { type: 'equipApparel', id: 'polo-classic' });
    expect(shirtForCharacter(s, 'feather-fade')).toBe('polo-classic');
    expect(hatForCharacter(s, 'feather-fade')).toBe('cap-classic');
    expect(hatForCharacter(s, 'huang-woo-hook')).toBeUndefined();
  });

  it('the Trade Market buys pants globally; the Clubhouse wears them per character (GS-pants-outfit)', () => {
    let s = initState(7, { shards: 500 });
    s = reduce(s, { type: 'openMarket' });
    // Buy a pair of pants → globally owned, NOT auto-worn, and an independent slot from hat/shirt.
    s = reduce(s, { type: 'buyApparel', id: 'trousers-classic' });
    expect(s.ownedApparel).toContain('trousers-classic');
    expect(pantsForCharacter(s, 'feather-fade')).toBeUndefined();
    // Wear them on one golfer in the Clubhouse; the toggle behaves like the other slots.
    s = reduce(s, { type: 'closeMarket' });
    s = reduce(s, { type: 'openClubhouse', characterId: 'feather-fade' });
    s = reduce(s, { type: 'equipApparel', id: 'trousers-classic' });
    expect(pantsForCharacter(s, 'feather-fade')).toBe('trousers-classic');
    expect(hatForCharacter(s, 'feather-fade')).toBeUndefined(); // pants don't touch the hat slot
    s = reduce(s, { type: 'equipApparel', id: 'trousers-classic' });
    expect(pantsForCharacter(s, 'feather-fade')).toBeUndefined(); // clicking again takes them off
    // Another golfer is unaffected.
    s = reduce(s, { type: 'equipApparel', id: 'trousers-classic' });
    expect(pantsForCharacter(s, 'huang-woo-hook')).toBeUndefined();
  });

  it('clothing/ship buys are guarded; equipping is Clubhouse-only and owned-only (GS-clubhouse)', () => {
    let s = initState(7, { shards: 10 }); // can't afford even a common (15)
    s = reduce(s, { type: 'openMarket' });
    expect(reduce(s, { type: 'buyApparel', id: 'cap-classic' })).toBe(s); // too poor → no-op
    // The mythic Supernova suit is the 500-shard splurge — unaffordable here.
    expect(reduce(s, { type: 'buyApparel', id: 'suit-supernova' })).toBe(s);
    // Equipping an unowned piece (or outside the Clubhouse) is a no-op.
    expect(reduce(s, { type: 'equipApparel', id: 'cap-classic' })).toBe(s);
    s = reduce(s, { type: 'closeMarket' });
    s = reduce(s, { type: 'openClubhouse', characterId: 'feather-fade' });
    expect(reduce(s, { type: 'equipApparel', id: 'cap-classic' })).toBe(s); // unowned → no-op
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
