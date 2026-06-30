import { describe, it, expect } from 'vitest';
import {
  loadoutFromPerks,
  netDispersion,
  shopItem,
  startingLoadout,
} from '../src/sim/rpg/economy';
import { isRoadLie, ROAD_LIES } from '../src/sim/shot';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, type PlayHoleOptions } from '../src/sim/round';
import { playMatchStop, playTeamMatchStop, type TeamSetup } from '../src/sim/rpg/match';
import { bossShotMods, GOLFERS } from '../src/sim/rpg/golfers';
import { Rng } from '../src/sim/rng';

/** A real golfer id from the roster (the champions are seeded first, deterministic). */
const REAL_BOSS = GOLFERS[0]!.id;

/** The player hole-options from a loadout, threading the rainbow-road flag. */
function optsFor(perks: string[]): PlayHoleOptions {
  const lo = loadoutFromPerks(perks);
  return { bag: lo.bag, dispersionMult: netDispersion(lo), rainbowRoad: lo.rainbowRoad };
}

describe('GS-rainbow — the legendary Rainbow Ball', () => {
  it('the shop item resolves and arms the rainbowRoad loadout flag', () => {
    const it_ = shopItem('rainbow-ball')!;
    expect(it_).toBeTruthy();
    expect(it_.rarity).toBe('legendary');
    expect(loadoutFromPerks(['rainbow-ball']).rainbowRoad).toBe(true);
    // A base loadout never carries it (byte-for-byte default-off).
    expect(startingLoadout().rainbowRoad).toBeUndefined();
  });

  it('the road set is exactly the safe surfaces (fairway/green/tee + sand family)', () => {
    for (const k of ['fairway', 'green', 'tee', 'bunker', 'pot', 'waste', 'sand']) expect(isRoadLie(k)).toBe(true);
    for (const k of ['rough', 'trees', 'fescue', 'water', 'lava', 'void', 'ice', 'crystal']) expect(isRoadLie(k)).toBe(false);
    // The set and the predicate agree.
    for (const k of ROAD_LIES) expect(isRoadLie(k)).toBe(true);
  });

  it('is byte-for-byte unchanged when the ball is NOT owned (determinism contract)', () => {
    // Same seed, base opts vs. an explicit rainbowRoad:false must play identically.
    const c = generateCourse('rainbow:det', { holes: 6, biome: 'verdant', wildness: 0.6 });
    const base = playCourse(c.holes, new Rng(`${c.seed}:play`), { bag: startingLoadout().bag, dispersionMult: 1 });
    const off = playCourse(c.holes, new Rng(`${c.seed}:play`), { bag: startingLoadout().bag, dispersionMult: 1, rainbowRoad: false });
    expect(JSON.stringify(off)).toBe(JSON.stringify(base));
  });

  it('turns off-road rests into OUT OF BOUNDS (stroke-and-distance)', () => {
    // Across many seeded wild holes, the rainbow ball produces strictly MORE OB penalties (a sprayed
    // ball that would have settled in recoverable rough now falls off the road) and never fewer.
    let baseOb = 0;
    let rainbowOb = 0;
    for (let s = 0; s < 60; s++) {
      const c = generateCourse(`rainbow:ob:${s}`, { holes: 6, biome: 'verdant', wildness: 1 });
      const baseStop = playCourse(c.holes, new Rng(`${c.seed}:play`), optsFor([]));
      const rbStop = playCourse(c.holes, new Rng(`${c.seed}:play`), optsFor(['rainbow-ball']));
      for (const p of baseStop) for (const sh of p.shots) if (sh.penalty === 'ob') baseOb++;
      for (const p of rbStop) for (const sh of p.shots) if (sh.penalty === 'ob') rainbowOb++;
    }
    // The rainbow ball makes off-road OOB, so it produces many more OB strokes than ordinary play.
    expect(rainbowOb).toBeGreaterThan(baseOb);
    expect(rainbowOb).toBeGreaterThan(20);
  });

  it('every ball that comes to rest does so on a road surface (or is OOB/holed)', () => {
    // Under rainbow road, a ball can only END a shot on the road (it's never left sitting off-road —
    // an off-road rest is converted to a replay from the prior spot, i.e. an OB penalty).
    const opts = optsFor(['rainbow-ball']);
    for (let s = 0; s < 40; s++) {
      const c = generateCourse(`rainbow:rest:${s}`, { holes: 6, biome: 'inferno', wildness: 1 });
      const played = playCourse(c.holes, new Rng(`${c.seed}:play`), opts);
      for (const p of played) {
        for (const sh of p.shots) {
          // lieTo is the lie the ball physically came to rest on. When it's off-road, the shot MUST
          // carry the OB penalty (it was kicked back); an on-road rest needs no penalty.
          if (!isRoadLie(sh.lieTo) && !sh.holed) expect(sh.penalty).toBe('ob');
        }
      }
    }
  });

  it('boss duels apply rainbow road to the boss too (best-ball & scramble fair)', () => {
    const c = generateCourse('rainbow:boss', { holes: 6, biome: 'frost', wildness: 1 });
    const realBoss = REAL_BOSS;
    const playerOpts = optsFor(['rainbow-ball']);

    // The boss plays the SAME rainbow hole — so its ball also racks up OB off-road. A boss playing a
    // NON-rainbow course (the bug we guard against) would score far better than under rainbow road.
    const underRainbow = playMatchStop(c.holes, playerOpts, realBoss, new Rng('p'), new Rng('b'));
    const bossObRainbow = underRainbow.boss.reduce((n, h) => n + h.shots.filter((s) => s.penalty === 'ob').length, 0);
    const ordinary = playMatchStop(c.holes, optsFor([]), realBoss, new Rng('p'), new Rng('b'));
    const bossObOrdinary = ordinary.boss.reduce((n, h) => n + h.shots.filter((s) => s.penalty === 'ob').length, 0);
    expect(bossObRainbow).toBeGreaterThan(bossObOrdinary);

    // A team duel propagates it to both sides' partners too (no crash; the boss side sees OB off-road).
    const setup: TeamSetup = { format: 'scramble', partnerSide: 'player', playerPartnerMods: bossShotMods(realBoss) };
    const team = playTeamMatchStop(c.holes, playerOpts, realBoss, setup, new Rng('p'), new Rng('b'));
    const teamBossOb = team.boss.reduce((n, h) => n + h.shots.filter((s) => s.penalty === 'ob').length, 0);
    expect(teamBossOb).toBeGreaterThan(0);
  });
});
