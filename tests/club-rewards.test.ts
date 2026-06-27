import { describe, it, expect } from 'vitest';
import {
  CLUB_ITEMS,
  buildRewardClub,
  clubItem,
  clubItemId,
  equipClub,
  loadoutFromPerks,
  netDispersion,
  offerableClubs,
  REWARD_CLUB_TYPES,
  shopItem,
  startingLoadout,
  type PlayerLoadout,
} from '../src/sim/rpg/economy';
import { applyCharacter, characterShotMods } from '../src/sim/rpg/characters';
import { buy, clubOffer, shopOffer, startRun, snapshotRun, resumeRun, startingLoadoutFor } from '../src/sim/rpg/run';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';

const carryOf = (lo: PlayerLoadout, id: string) => lo.bag.find((c) => c.id === id)?.carry;
const rich = (run: ReturnType<typeof startRun>) => ({ ...run, credits: 100000 });

describe('club catalogue (GS-clubs)', () => {
  it('shopItem resolves reward clubs as well as perks', () => {
    expect(shopItem('club:tour:3W')).toBeTruthy();
    expect(shopItem('club:tour:3W')!.clubType).toBe('3W');
    expect(shopItem('gyro')).toBeTruthy(); // perks still resolve
    expect(clubItem('club:starter:D')!.rarity).toBe('common');
    expect(clubItem('club:tour:D')!.rarity).toBe('rare');
  });

  it('the tour tier is DISTANCE-only and carries longer than the starter (better base stats)', () => {
    // Tour upgrades exist for distance clubs (extra carry = real reach), NOT scoring clubs (overshoot).
    expect(clubItem(clubItemId('tour', '3W'))).toBeTruthy();
    expect(clubItem(clubItemId('tour', '7i'))).toBeUndefined(); // scoring club — no +carry tour tier
    const tourSet = { set: 'tour', label: 'Tour', rarity: 'rare' as const, carryBonus: 8, cost: 150 };
    const starterSet = { set: 'starter', label: '', rarity: 'common' as const, carryBonus: 0, cost: 70 };
    // Distance club: tour carries longer.
    expect(buildRewardClub(tourSet, '3W').carry).toBeGreaterThan(buildRewardClub(starterSet, '3W').carry);
    // Scoring club: the carry bonus is suppressed (never overshoots) — equal to base.
    expect(buildRewardClub(tourSet, '7i').carry).toBe(buildRewardClub(starterSet, '7i').carry);
  });

  it('equipClub replaces a club of the same type and keeps the bag sorted longest→shortest', () => {
    const lo = applyCharacter('feather-fade', startingLoadout());
    const before = lo.bag.length;
    const bag = equipClub(lo.bag, buildRewardClub({ set: 'tour', label: 'Tour', rarity: 'rare', carryBonus: 8, cost: 150 }, '7i'));
    expect(bag.length).toBe(before); // replaced, not added
    expect(bag.find((c) => c.id === '7i')!.rarity).toBe('rare');
    for (let i = 1; i < bag.length; i++) expect(bag[i]!.carry).toBeLessThanOrEqual(bag[i - 1]!.carry);
  });
});

describe('club ownership / offer rules (GS-clubs)', () => {
  it("a golfer is offered clubs they LACK, but never the starter club they already hold", () => {
    const larry = applyCharacter('longshot-larry', startingLoadout());
    const bo = applyCharacter('backspin-bo', startingLoadout());
    const ids = (lo: PlayerLoadout) => offerableClubs(lo).map((i) => i.id);
    // Larry starts with a Driver, not a 3-wood → no common Driver, but a common 3-wood IS offered.
    expect(ids(larry)).not.toContain('club:starter:D');
    expect(ids(larry)).toContain('club:starter:3W');
    // Bo is the mirror: starts with a 3-wood, no Driver.
    expect(ids(bo)).toContain('club:starter:D');
    expect(ids(bo)).not.toContain('club:starter:3W');
  });

  it('a higher-tier version of a club you OWN is offered (the upgrade)', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    const ids = offerableClubs(feather).map((i) => i.id);
    expect(ids).toContain('club:tour:3W'); // owns starter 3W → tour 3W (distance upgrade) offered
    expect(ids).not.toContain('club:starter:3W'); // …but not the one she already has
    expect(ids).not.toContain('club:starter:7i'); // nor a scoring club she already holds
  });

  it('Longshot Larry never sees hybrids', () => {
    const larry = applyCharacter('longshot-larry', startingLoadout());
    for (const it of offerableClubs(larry)) {
      expect(/H$/.test(it.clubType!), `offered ${it.id}`).toBe(false);
    }
    // Every other golfer CAN be offered a hybrid.
    const feather = applyCharacter('feather-fade', startingLoadout());
    expect(offerableClubs(feather).some((i) => /H$/.test(i.clubType!))).toBe(true);
  });
});

describe('buying clubs equips them (GS-clubs)', () => {
  it('buying a higher-tier club REPLACES your current one (bag size unchanged)', () => {
    const run = rich(startRun(1, undefined, {}, 'feather-fade'));
    const before = run.loadout.bag.length;
    const baseCarry = carryOf(run.loadout, '3W')!;
    const after = buy(run, 'club:tour:3W'); // Feather owns a starter 3-wood
    expect(after.loadout.bag.length).toBe(before);
    expect(carryOf(after.loadout, '3W')!).toBeGreaterThan(baseCarry);
    expect(after.loadout.bag.find((c) => c.id === '3W')!.rarity).toBe('rare');
  });

  it('buying a club of a NEW type ADDS it (fills a gap)', () => {
    const run = rich(startRun(2, undefined, {}, 'feather-fade'));
    const before = run.loadout.bag.length;
    expect(carryOf(run.loadout, 'D')).toBeUndefined(); // Feather has no driver
    const after = buy(run, 'club:starter:D');
    expect(after.loadout.bag.length).toBe(before + 1);
    expect(carryOf(after.loadout, 'D')).toBe(250);
  });

  it("a reward distance club inherits the golfer's distance bonus (and meta stacks)", () => {
    // Larry: +14 distance trait. A bought Tour 3-wood = base 235 + 8 (tour) + 14 = 257.
    const larry = rich(startRun(3, undefined, {}, 'longshot-larry'));
    expect(carryOf(buy(larry, 'club:tour:3W').loadout, '3W')).toBe(235 + 8 + 14);
    // With Tour Bag meta (+6) the bonus stacks: a Tour Driver = 250 + 8 + (14 + 6) = 278.
    const larryMeta = rich(startRun(3, undefined, { 'tour-bag': 1 }, 'longshot-larry'));
    expect(carryOf(buy(larryMeta, 'club:tour:D').loadout, 'D')).toBe(250 + 8 + 14 + 6);
  });

  it('a club already equipped cannot be re-bought (cap 1 per club item)', () => {
    const run = rich(startRun(4, undefined, {}, 'feather-fade'));
    const once = buy(run, 'club:tour:3W');
    expect(buy(once, 'club:tour:3W')).toBe(once); // no-op
  });
});

describe('club offer + Driver Dan gate (GS-clubs)', () => {
  it('clubOffer is deterministic and only lists pursuable clubs', () => {
    const run = startRun(7, undefined, {}, 'feather-fade');
    const a = clubOffer(run).map((o) => o.item.id);
    const b = clubOffer(run).map((o) => o.item.id);
    expect(a).toEqual(b);
    const offerable = new Set(offerableClubs(run.loadout).map((i) => i.id));
    for (const id of a) expect(offerable.has(id)).toBe(true);
  });

  it('Driver Dan appears only once the golfer owns a driver', () => {
    const hasDan = (run: ReturnType<typeof startRun>) => {
      for (let s = 0; s < 250; s++) {
        const r = { ...run, seed: s };
        if (shopOffer(r).some((o) => o.item.id === 'driver-dan')) return true;
      }
      return false;
    };
    // Feather has no driver → Dan never shows.
    expect(hasDan(startRun(1, undefined, {}, 'feather-fade'))).toBe(false);
    // Larry starts with a driver → Dan is eligible from the off.
    expect(hasDan(startRun(1, undefined, {}, 'longshot-larry'))).toBe(true);
    // Give Feather a driver and Dan becomes eligible too.
    const feathered = buy(rich(startRun(1, undefined, {}, 'feather-fade')), 'club:starter:D');
    expect(hasDan(feathered)).toBe(true);
  });
});

describe('reward clubs survive snapshot/resume (GS-clubs)', () => {
  it('the bag (starting + bought/upgraded clubs) is rebuilt from perks', () => {
    let run = rich(startRun(11, undefined, { 'tour-bag': 1 }, 'longshot-larry'));
    run = buy(run, 'club:tour:D'); // upgrade his driver (distance tour tier)
    run = buy(run, 'club:starter:3W'); // fill a gap (gets +20 distance bonus)
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.loadout.bag.map((c) => `${c.id}:${c.carry}:${c.set}`).sort()).toEqual(
      run.loadout.bag.map((c) => `${c.id}:${c.carry}:${c.set}`).sort(),
    );
    // The gap-filled 3-wood kept its golfer+meta distance bonus across the resume.
    expect(carryOf(resumed.loadout, '3W')).toBe(235 + 14 + 6);
  });
});

describe('reward clubs improve scoring — the collection loop pays off (GS-clubs)', () => {
  // Mean per-stop Stableford with the clubs IN HAND (isolating the bag effect from acquisition cost),
  // averaged across the roster — the stable balance signal (per-character single-item deltas are
  // within run-to-run noise; see shop.test). A fuller / upgraded bag must lift the roster mean.
  const CHARS = ['feather-fade', 'huang-woo-hook', 'longshot-larry', 'backspin-bo'];
  const meanSF = (characterId: string, perks: string[], n = 360): number => {
    const lo = loadoutFromPerks(perks, startingLoadoutFor({}, characterId));
    const shotMods = characterShotMods(characterId);
    let sf = 0;
    for (let s = 0; s < n; s++) {
      const c = generateCourse(`${s}:stop`, { holes: 6, distanceFromStart: s % 12 });
      const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
        bag: lo.bag,
        dispersionMult: netDispersion(lo),
        shotMods,
      });
      sf += playTotals(played.map((p) => p.record)).stableford;
    }
    return sf / n;
  };
  const rosterMean = (perks: string[]) => CHARS.reduce((a, c) => a + meanSF(c, perks), 0) / CHARS.length;

  it('filling the bag toward full raises the roster mean Stableford', () => {
    // Acquire every common club a golfer doesn't start with → a near-full bag. The reach-AI then has a
    // club for every distance, so it stops over-clubbing across the sparse gaps (a small modest gap-fill
    // is within noise; substantial coverage is the robust, monotonic win — see the bag-size sweep).
    const coverage = REWARD_CLUB_TYPES.map((t) => clubItemId('starter', t));
    expect(rosterMean(coverage)).toBeGreaterThan(rosterMean([]));
  });

  it('distance-club tour upgrades raise the roster mean Stableford (a verified upgrade)', () => {
    const upgrades = ['club:tour:3W', 'club:tour:D', 'club:tour:5W', 'club:tour:7W'];
    expect(rosterMean(upgrades)).toBeGreaterThan(rosterMean([]));
  });
});

describe('catalogue integrity', () => {
  it('every reward club has a valid type, set and a buildable bag club', () => {
    for (const it of CLUB_ITEMS) {
      expect(it.clubType).toBeTruthy();
      expect(it.clubSet).toBeTruthy();
      const lo = it.apply(startingLoadout());
      expect(lo.bag.find((c) => c.id === it.clubType)).toBeTruthy();
    }
  });
});
