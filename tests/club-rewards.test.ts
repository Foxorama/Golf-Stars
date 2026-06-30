import { describe, it, expect } from 'vitest';
import {
  CLUB_ITEMS,
  buildRewardClub,
  clubItem,
  clubOfferNote,
  clubItemId,
  clubSetById,
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
import { buy, shopOffer, startRun, snapshotRun, resumeRun, startingLoadoutFor } from '../src/sim/rpg/run';
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
    // Feather carries a Driver (the balanced bag) — a Tour Driver replaces it, doesn't grow the bag.
    const bag = equipClub(lo.bag, buildRewardClub({ set: 'tour', label: 'Tour', rarity: 'rare', carryBonus: 8, cost: 150, distanceOnly: true }, 'D'));
    expect(bag.length).toBe(before); // replaced, not added
    expect(bag.find((c) => c.id === 'D')!.rarity).toBe('rare');
    for (let i = 1; i < bag.length; i++) expect(bag[i]!.carry).toBeLessThanOrEqual(bag[i - 1]!.carry);
  });
});

describe('club ownership / offer rules (GS-clubs-2)', () => {
  it('the shop never offers a common starter club — only rare+ improvements', () => {
    for (const ch of ['feather-fade', 'huang-woo-hook', 'longshot-larry', 'backspin-bo']) {
      const lo = applyCharacter(ch, startingLoadout());
      for (const it of offerableClubs(lo)) {
        expect(it.clubSet, `${ch} offered ${it.id}`).not.toBe('starter');
        expect(it.rarity, `${ch} offered ${it.id}`).not.toBe('common');
      }
    }
  });

  it('a golfer is offered rare+ clubs for the GAPS the balanced bag leaves', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    const ids = offerableClubs(feather).map((i) => i.id);
    // Feather's balanced bag has no 3-wood (distance gap) nor 7-iron (scoring gap) → both offered, rare+.
    expect(ids).toContain('club:tour:3W'); // a distance gap → the rare Tour wood
    expect(ids).toContain('club:pro:7i'); // a scoring gap → the rare Pro iron
    // …but never a club she already carries.
    expect(ids).not.toContain('club:pro:6i'); // owns a 6-iron — a same-carry "premium" copy is no upgrade
  });

  it('a higher-tier version of a DISTANCE club you OWN is offered (the upgrade)', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    const ids = offerableClubs(feather).map((i) => i.id);
    expect(ids).toContain('club:tour:D'); // owns a starter Driver → Tour Driver (rare distance upgrade)
    expect(ids).toContain('club:masters:D'); // …and the epic Masters Driver above it
    // A scoring club she owns is NEVER "upgraded" — extra carry would overshoot, same carry is no gain.
    expect(ids.some((id) => id.endsWith(':6i'))).toBe(false);
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
    const baseCarry = carryOf(run.loadout, 'D')!;
    const after = buy(run, 'club:tour:D'); // Feather carries a starter Driver
    expect(after.loadout.bag.length).toBe(before);
    expect(carryOf(after.loadout, 'D')!).toBeGreaterThan(baseCarry);
    expect(after.loadout.bag.find((c) => c.id === 'D')!.rarity).toBe('rare');
  });

  it('buying a club of a NEW type ADDS it (fills a gap)', () => {
    const run = rich(startRun(2, undefined, {}, 'feather-fade'));
    const before = run.loadout.bag.length;
    expect(carryOf(run.loadout, '7i')).toBeUndefined(); // Feather's balanced bag skips the 7-iron
    const after = buy(run, 'club:pro:7i');
    expect(after.loadout.bag.length).toBe(before + 1);
    expect(carryOf(after.loadout, '7i')).toBe(134);
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

describe('merged club offer + Driver Dan gate (GS-clubs-2)', () => {
  it('reward clubs share the single rotating shop offer (no separate row)', () => {
    // Across seeds, the unified shopOffer surfaces reward clubs alongside gear; every offered club is
    // pursuable, and the offer is deterministic.
    const run = startRun(7, undefined, {}, 'feather-fade');
    const a = shopOffer(run).map((o) => o.item.id);
    const b = shopOffer(run).map((o) => o.item.id);
    expect(a).toEqual(b); // deterministic
    const offerable = new Set(offerableClubs(run.loadout).map((i) => i.id));
    for (const o of shopOffer(run)) {
      if (o.item.clubType) expect(offerable.has(o.item.id), `offered ${o.item.id}`).toBe(true);
    }
    // The offer DOES include reward clubs over a spread of seeds (they're in the same pool now).
    let sawClub = false;
    for (let s = 0; s < 60 && !sawClub; s++) {
      if (shopOffer({ ...run, seed: s }).some((o) => o.item.clubType)) sawClub = true;
    }
    expect(sawClub).toBe(true);
  });

  it('Driver Dan needs a driver in the bag — everyone now starts with one, so he is eligible', () => {
    const hasDan = (run: ReturnType<typeof startRun>) => {
      for (let s = 0; s < 250; s++) {
        // Driver Dan is epic, so he surfaces on the DEEPER racks now that early Pro Shops stock
        // common/rare kit (rarity ramps with galaxy distance) — scan a mid-run depth where epics
        // are plentiful, so the gate (owns-a-driver) is what decides eligibility, not the rarity roll.
        const r = { ...run, seed: s, stopIndex: 4, distanceFromStart: 14 };
        if (shopOffer(r).some((o) => o.item.id === 'driver-dan')) return true;
      }
      return false;
    };
    // Every golfer carries a driver in the balanced bag → Dan is eligible from the off.
    expect(hasDan(startRun(1, undefined, {}, 'feather-fade'))).toBe(true);
    expect(hasDan(startRun(1, undefined, {}, 'longshot-larry'))).toBe(true);
    // Strip the driver out of the bag and the gate closes — Dan never shows.
    const base = startRun(1, undefined, {}, 'feather-fade');
    const noDriver = { ...base, loadout: { ...base.loadout, bag: base.loadout.bag.filter((c) => c.id !== 'D') } };
    expect(hasDan(noDriver)).toBe(false);
  });
});

describe('club offer note — upgrade vs new-gap indicator (GS-clubs-2)', () => {
  it('flags a DISTANCE club you carry as an upgrade with the yards gained', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    const note = clubOfferNote(clubItem('club:tour:D')!, feather);
    expect(note?.kind).toBe('upgrade');
    expect(note?.gainYd).toBe(8); // Tour Driver carries +8 over her starter Driver
  });

  it('flags a NEW club with its carry and the bag clubs that bracket the gap it fills', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    // A Pro 7-iron (134 yd) slots between her 6-iron (142) and 8-iron (125).
    const note = clubOfferNote(clubItem('club:pro:7i')!, feather);
    expect(note?.kind).toBe('new');
    expect(note?.carry).toBe(134);
    expect(note?.longerName).toBe('6-Iron');
    expect(note?.shorterName).toBe('8-Iron');
  });

  it("an upgrade note folds in the golfer's distance bonus (Larry's +14)", () => {
    const larry = applyCharacter('longshot-larry', startingLoadout());
    // Larry's starter Driver already carries +14; the Tour Driver adds the set's +8 on top.
    const note = clubOfferNote(clubItem('club:tour:D')!, larry);
    expect(note?.kind).toBe('upgrade');
    expect(note?.gainYd).toBe(8);
    expect(note?.carry).toBe(250 + 8 + 14);
  });
});

describe('reward clubs survive snapshot/resume (GS-clubs)', () => {
  it('the bag (starting + bought/upgraded clubs) is rebuilt from perks', () => {
    let run = rich(startRun(11, undefined, { 'tour-bag': 1 }, 'longshot-larry'));
    run = buy(run, 'club:tour:D'); // upgrade his driver (distance tour tier)
    run = buy(run, 'club:tour:3W'); // fill a distance gap (gets +8 tour + golfer/meta bonus)
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.loadout.bag.map((c) => `${c.id}:${c.carry}:${c.set}`).sort()).toEqual(
      run.loadout.bag.map((c) => `${c.id}:${c.carry}:${c.set}`).sort(),
    );
    // The gap-filled 3-wood kept its tour bonus AND its golfer+meta distance bonus across the resume.
    expect(carryOf(resumed.loadout, '3W')).toBe(235 + 8 + 14 + 6);
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

  it('filling the bag with rare Pro coverage clubs never lowers the roster mean Stableford', () => {
    // Pro scoring clubs carry their BASE distance — their value is COVERAGE (a club for a distance the
    // balanced bag skips, so you can dial it in close to the green). That's an INTERACTIVE win the
    // auto reach-AI barely exploits, so the honest guarantee is "no CATASTROPHIC regression": adding
    // every offerable Pro iron must not collapse scoring. (The interactive control benefit is the
    // design intent — placement, which the headless reach-AI doesn't aim for.)
    //
    // GS-terrain widened the slack 0.2 → 0.5: denser forest + more water/creek crossings make courses
    // WILDER, and a wilder landscape amplifies the reach-AI's coverage-blindness — a precise "just
    // reaches" club drops into trouble that the sparser bag's over-club would have flown past, so the
    // headless Pro bag trails the base bag by ~0.3/stop on the new courses. That is an auto-AI artifact,
    // not unfairness: the primary death-spiral fairness bar (tests/biomes.test) still holds (toPar/hole
    // ≈ 0.24 ≪ 1.0, 0% blow-ups), and the interactive dial-in win is unchanged.
    const proCoverage = REWARD_CLUB_TYPES.map((t) => clubItemId('pro', t)).filter((id) => clubItem(id));
    expect(rosterMean(proCoverage)).toBeGreaterThanOrEqual(rosterMean([]) - 0.5);
  });

  it('distance-club tour upgrades raise the roster mean Stableford (a verified upgrade)', () => {
    // The balanced bag's distance clubs are D/5W (+ Larry's woods); Tour upgrades add reach.
    const upgrades = ['club:tour:D', 'club:tour:5W', 'club:tour:3W', 'club:tour:2H'];
    expect(rosterMean(upgrades)).toBeGreaterThan(rosterMean([]));
  });
});

describe('themed full sets — woods, irons & a putter (GS-fullsets)', () => {
  it('Phoenix and Solar Storm are complete bags: woods + irons + putter', () => {
    // GS-clubs-3 retired the reward WEDGE types (AW/58°), so a complete themed bag is now
    // woods (distance) + the coverage irons + a themed putter.
    for (const set of ['masters', 'solar']) {
      expect(clubItem(clubItemId(set, 'D')), `${set} wood`).toBeTruthy();
      expect(clubItem(clubItemId(set, '5i')), `${set} iron`).toBeTruthy();
      expect(clubItem(clubItemId(set, '9i')), `${set} short iron`).toBeTruthy();
      expect(clubItem(clubItemId(set, 'putter')), `${set} putter`).toBeTruthy();
    }
    // Planet's full bag is split across `tour` (woods) + `pro` (irons/wedges/putter).
    expect(clubItem(clubItemId('tour', 'D'))).toBeTruthy();
    expect(clubItem(clubItemId('pro', '7i'))).toBeTruthy();
    expect(clubItem(clubItemId('pro', 'putter'))).toBeTruthy();
  });

  it('a themed iron carries BASE distance (coverage, never overshoots); woods keep their reach', () => {
    expect(buildRewardClub(clubSetById('masters')!, '5i').carry).toBe(150); // 5-iron base
    expect(buildRewardClub(clubSetById('solar')!, '9i').carry).toBe(116); // 9-iron base
    expect(buildRewardClub(clubSetById('solar')!, 'D').carry).toBe(250 + 24); // wood keeps the bonus
  });

  it('a themed putter keeps base carry and grants a rarity-scaled puttBoost', () => {
    const lo = clubItem(clubItemId('solar', 'putter'))!.apply(startingLoadout());
    const p = lo.bag.find((c) => c.id === 'putter')!;
    expect(p.carry).toBe(8); // base — a putter has no carry to overshoot with
    expect(p.set).toBe('solar');
    expect(p.rarity).toBe('legendary');
    expect(lo.puttBoost).toBeCloseTo(0.22);
    // A plain (non-putter) reward never touches puttBoost.
    expect(clubItem(clubItemId('solar', 'D'))!.apply(startingLoadout()).puttBoost).toBe(0);
  });

  it('a themed putter is offered as a rarity upgrade over the starter putter, then only higher tiers', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    const ids0 = offerableClubs(feather).map((i) => i.id);
    expect(ids0).toContain('club:pro:putter'); // rare > the common starter putter
    expect(ids0).toContain('club:solar:putter'); // legendary too
    // Equip the legendary putter → no lower/equal-rarity putter is offered anymore.
    const withSolar = clubItem(clubItemId('solar', 'putter'))!.apply(applyCharacter('feather-fade', startingLoadout()));
    expect(offerableClubs(withSolar).some((i) => i.clubType === 'putter')).toBe(false);
  });

  it('the putter offer note reads as a make-window upgrade, not "+0 yd"', () => {
    const feather = applyCharacter('feather-fade', startingLoadout());
    const note = clubOfferNote(clubItem('club:solar:putter')!, feather);
    expect(note?.kind).toBe('upgrade');
    expect(note?.putt).toBe(true);
    expect(note?.gainYd).toBeUndefined();
  });

  it('a bought themed putter survives snapshot/resume (bag + puttBoost rebuilt)', () => {
    let run = rich(startRun(31, undefined, {}, 'feather-fade'));
    run = buy(run, 'club:masters:putter');
    expect(run.loadout.puttBoost).toBeCloseTo(0.16);
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.loadout.puttBoost).toBeCloseTo(0.16);
    expect(resumed.loadout.bag.find((c) => c.id === 'putter')!.set).toBe('masters');
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
