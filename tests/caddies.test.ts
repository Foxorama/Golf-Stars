import { describe, it, expect } from 'vitest';
import {
  CONVICT_SHEEP_GUARD,
  SPACE_DUCKS_GUARD,
  NAMED_CADDY_IDS,
  loadoutFromPerks,
  namedCaddyOwned,
  netDispersion,
  shopItem,
  startingLoadout,
  usableBag,
} from '../src/sim/rpg/economy';
import {
  buy,
  shopOffer,
  snapshotRun,
  resumeRun,
  startRun,
} from '../src/sim/rpg/run';
import {
  classifySprayZone,
  dispersionProfile,
  lieInfo,
  resolveShot,
  type SprayShape,
} from '../src/sim/shot';
import { executeShot, pinOf, playCourse, CHIPIN_RANGE } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { playTotals } from '../src/sim/score';
import { type Vec } from '../src/sim/course/contract';
import { Rng } from '../src/sim/rng';

const richRun = (seed: number) => ({ ...startRun(seed), credits: 1_000_000 });

describe('named caddies — uniqueness & shop gating', () => {
  it('the named caddies are all flagged caddy:"named" and are epic/legendary', () => {
    expect(NAMED_CADDY_IDS.slice().sort()).toEqual(
      ['auto-caddie', 'convict-sheep', 'dr-chipinski', 'driver-dan', 'space-ducks', 'suggestible-sam'].sort(),
    );
    for (const id of NAMED_CADDY_IDS) {
      const it = shopItem(id)!;
      expect(it.caddy).toBe('named');
      expect(['epic', 'legendary']).toContain(it.rarity);
    }
  });

  it('you may hire only ONE named caddy — a second is a no-op', () => {
    let run = buy(richRun(1), 'driver-dan');
    expect(run.loadout.driverAnywhere).toBe(true);
    expect(namedCaddyOwned(run.loadout.perks)).toBe('driver-dan');
    const blocked = buy(run, 'space-ducks');
    expect(blocked).toBe(run); // unchanged reference
    expect(namedCaddyOwned(blocked.loadout.perks)).toBe('driver-dan');
    expect(blocked.loadout.caddyGuard).toBeUndefined();
  });

  it('named caddies are random shop inclusions until one is hired, then never appear again', () => {
    // No caddy yet → named caddies CAN show up in the rotating offer (rarity-weighted, so scarce —
    // assert they surface across enough seeds).
    let surfaced = 0;
    for (let seed = 0; seed < 120; seed++) {
      const ids = shopOffer(startRun(seed)).map((o) => o.item.id);
      if (ids.some((id) => NAMED_CADDY_IDS.includes(id))) surfaced++;
    }
    expect(surfaced).toBeGreaterThan(0);

    // Once a caddy is hired → NO named caddy ever appears in the offer again.
    const withCaddy = buy(richRun(0), 'space-ducks');
    for (let seed = 0; seed < 120; seed++) {
      const ids = shopOffer({ ...withCaddy, seed }).map((o) => o.item.id);
      for (const c of NAMED_CADDY_IDS) expect(ids).not.toContain(c);
    }
  });

  it('Caddie Lesson (a "service" perk) is hidden until a named caddy is hired', () => {
    // No caddy → never offered.
    for (let seed = 0; seed < 60; seed++) {
      expect(shopOffer(startRun(seed)).map((o) => o.item.id)).not.toContain('caddie-lesson');
    }
    // With a caddy hired → it becomes eligible (shows up for some seed).
    const withCaddy = buy(richRun(0), 'dr-chipinski');
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const run = { ...withCaddy, seed };
      if (shopOffer(run).some((o) => o.item.id === 'caddie-lesson')) found = true;
    }
    expect(found).toBe(true);
  });
});

describe('caddy effects rebuild from perks (resume-safe, no save bump)', () => {
  it('each named caddy folds its effect into the loadout', () => {
    expect(loadoutFromPerks(['auto-caddie']).autoPutt).toBe(true);
    expect(loadoutFromPerks(['driver-dan']).driverAnywhere).toBe(true);
    expect(loadoutFromPerks(['dr-chipinski']).chipInBoost).toBeCloseTo(0.33);
    expect(loadoutFromPerks(['space-ducks']).caddyGuard).toEqual(SPACE_DUCKS_GUARD);
    expect(loadoutFromPerks(['convict-sheep']).caddyGuard).toEqual(CONVICT_SHEEP_GUARD);
    expect(loadoutFromPerks(['suggestible-sam']).clubSuggest).toBe(true);
  });

  it('Suggestible Sam is a pure interactive QoL caddy — no sim effect, base flow has no suggestion', () => {
    // The base loadout (no caddy) carries no club-suggestion flag, so the default play flow shows none.
    expect(startingLoadout().clubSuggest).toBeUndefined();
    // Sam is interactive-only: he sets no shot/economy field the headless sim reads, so a run with Sam
    // and a run without him play byte-for-byte identically (the auto sim never reads clubSuggest).
    const withSam = loadoutFromPerks(['suggestible-sam']);
    expect(withSam.caddyGuard).toBeUndefined();
    expect(withSam.chipInBoost).toBeUndefined();
    expect(withSam.driverAnywhere).toBeUndefined();
    expect(withSam.autoPutt).toBeUndefined();
  });

  it('snapshot/resume reconstructs a hired caddy', () => {
    const run = buy(richRun(9), 'space-ducks');
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.loadout.caddyGuard).toEqual(SPACE_DUCKS_GUARD);
    expect(namedCaddyOwned(resumed.loadout.perks)).toBe('space-ducks');
  });
});

describe('Driver Dan — driver from any lie', () => {
  it('the driver is tee-only by default, usable everywhere with Driver Dan', () => {
    const hasD = (bag: readonly { id: string }[]) => bag.some((c) => c.id === 'D');
    expect(hasD(usableBag(CLUBS, 'tee', false))).toBe(true);
    expect(hasD(usableBag(CLUBS, 'fairway', false))).toBe(false);
    expect(hasD(usableBag(CLUBS, 'rough', false))).toBe(false);
    // Driver Dan unlocks it from any lie at FULL carry (no reduced-carry copy).
    expect(hasD(usableBag(CLUBS, 'fairway', true))).toBe(true);
    const driver = usableBag(CLUBS, 'fairway', true).find((c) => c.id === 'D')!;
    expect(driver.carry).toBe(CLUBS.find((c) => c.id === 'D')!.carry);
  });
});

describe('Dr Chipinski — wedge chip-ins near the pin', () => {
  // Fire a wedge from ~its carry short of the pin so shots ring the green; count hole-outs with and
  // without the caddy. Direct executeShot (the shared core) so this is exactly what auto≡interactive run.
  const holeOuts = (chipIn: number): number => {
    const course = generateCourse('chip:test', { holes: 6, distanceFromStart: 0 });
    const hole = course.holes[0]!;
    const pin = pinOf(hole);
    const wedge = CLUBS.find((c) => c.id === 'LW')!;
    // Place the ball `wedge carry` short of the pin, on the tee→pin line.
    const tee = hole.tee;
    const d = Math.hypot(tee[0] - pin[0], tee[1] - pin[1]) || 1;
    const dir: Vec = [(tee[0] - pin[0]) / d, (tee[1] - pin[1]) / d];
    const from: Vec = [pin[0] + dir[0] * wedge.carry, pin[1] + dir[1] * wedge.carry];
    let holed = 0;
    for (let s = 0; s < 400; s++) {
      const ex = executeShot(hole, from, 'fairway', pin, wedge, { carryMult: 1, chipIn }, new Rng(`chip:${s}`));
      if (ex.holed) holed++;
    }
    return holed;
  };

  it('the +33% chip-in chance clearly increases hole-outs from wedge range', () => {
    const base = holeOuts(0);
    const withDoc = holeOuts(0.33);
    expect(withDoc).toBeGreaterThan(base);
  });

  it('only fires inside the makeable chip range (a sane, bounded window)', () => {
    expect(CHIPIN_RANGE).toBeGreaterThan(1.2); // wider than the auto hole-out radius
    expect(CHIPIN_RANGE).toBeLessThanOrEqual(12); // but still a chip, not a full approach
  });
});

// --- Guard helpers: classify the FINAL spray zone a shot finished in (no wind, no bias). ---
const wideMiss: SprayShape = { green: 0.5, hookL: 0.15, sliceR: 0.15, duckHookL: 0.1, shankR: 0.1 };
const driver = CLUBS.find((c) => c.id === 'D')!;
const angleSd = dispersionProfile(driver.carry).lateralFrac * lieInfo('fairway').dispersionMult;

function finalZone(rng: Rng, guard?: typeof SPACE_DUCKS_GUARD) {
  const from: Vec = [0, 0];
  const aim: Vec = [0, 100];
  const r = resolveShot({ from, aim, club: driver, lie: 'fairway', shape: wideMiss, guard, rng });
  const theta = Math.atan2(r.landing[0], r.landing[1]) - (r.shotBearing * Math.PI) / 180;
  return { zone: classifySprayZone(theta, wideMiss, angleSd), redirect: r.redirect };
}

describe('Space Ducks — laser-zap the duck-hooks', () => {
  it('removes every duck-hook and redirects some hooks to the green', () => {
    let baseDuck = 0;
    let guardDuck = 0;
    let lasers = 0;
    for (let s = 0; s < 600; s++) {
      if (finalZone(new Rng(`d:${s}`)).zone === 'duckHookL') baseDuck++;
      const g = finalZone(new Rng(`d:${s}`), SPACE_DUCKS_GUARD);
      if (g.zone === 'duckHookL') guardDuck++;
      if (g.redirect?.kind === 'laser') lasers++;
    }
    expect(baseDuck).toBeGreaterThan(10); // the setup really does produce duck-hooks
    expect(guardDuck).toBe(0); // …all of which the ducks zap away
    expect(lasers).toBeGreaterThan(0); // and the redirect is recorded for the animation
  });
});

describe('Convict Sheep — boomerang the shanks', () => {
  it('removes every shank and redirects some slices to the green', () => {
    let baseShank = 0;
    let guardShank = 0;
    let boomerangs = 0;
    for (let s = 0; s < 600; s++) {
      if (finalZone(new Rng(`c:${s}`)).zone === 'shankR') baseShank++;
      const g = finalZone(new Rng(`c:${s}`), CONVICT_SHEEP_GUARD);
      if (g.zone === 'shankR') guardShank++;
      if (g.redirect?.kind === 'boomerang') boomerangs++;
    }
    expect(baseShank).toBeGreaterThan(10);
    expect(guardShank).toBe(0);
    expect(boomerangs).toBeGreaterThan(0);
  });
});

describe('a guard with nothing to remove is byte-for-byte identical (no extra rng)', () => {
  it('an empty guard leaves the landing and rng stream untouched', () => {
    const empty = { remove: [] as never[], halve: [] as never[], kind: 'laser' as const };
    for (let s = 0; s < 50; s++) {
      const a = resolveShot({ from: [0, 0], aim: [0, 100], club: driver, lie: 'fairway', shape: wideMiss, rng: new Rng(`e:${s}`) });
      const b = resolveShot({ from: [0, 0], aim: [0, 100], club: driver, lie: 'fairway', shape: wideMiss, guard: empty, rng: new Rng(`e:${s}`) });
      expect(b.landing).toEqual(a.landing);
      expect(b.redirect).toBeUndefined();
    }
  });
});

describe('caddies hold the "a power-up must not hurt scoring" invariant', () => {
  const meanStableford = (perks: string[]): number => {
    const lo = loadoutFromPerks(perks);
    let sf = 0;
    let n = 0;
    for (let s = 0; s < 300; s++) {
      const c = generateCourse(`${s}:caddy`, { holes: 6, distanceFromStart: s % 12 });
      const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
        bag: lo.bag,
        dispersionMult: netDispersion(lo),
        guard: lo.caddyGuard,
        chipIn: lo.chipInBoost,
        driverAnywhere: lo.driverAnywhere,
      });
      sf += playTotals(played.map((p) => p.record)).stableford;
      n++;
    }
    return sf / n;
  };

  it('Dr Chipinski and the guard caddies never lower mean per-stop Stableford', () => {
    const base = meanStableford([]);
    expect(meanStableford(['dr-chipinski'])).toBeGreaterThanOrEqual(base - 0.1);
    expect(meanStableford(['space-ducks'])).toBeGreaterThanOrEqual(base - 0.1);
    expect(meanStableford(['convict-sheep'])).toBeGreaterThanOrEqual(base - 0.1);
  });
});
