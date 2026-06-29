import { describe, it, expect } from 'vitest';
import {
  CONVICT_SHEEP_GUARD,
  SPACE_DUCKS_GUARD,
  SAM_CONFIDENCE,
  NAMED_CADDY_IDS,
  loadoutFromPerks,
  namedCaddyOwned,
  netDispersion,
  shopItem,
  startingLoadout,
  usableBag,
} from '../src/sim/rpg/economy';
import { beginHole, shotView, takeShot } from '../src/sim/rpg/play';
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
import { executeShot, forcedCarry, pinOf, playCourse, shotSpread, CHIPIN_RANGE } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { playTotals } from '../src/sim/score';
import { type Hole, type Vec } from '../src/sim/course/contract';
import { Rng } from '../src/sim/rng';

const richRun = (seed: number) => ({ ...startRun(seed), credits: 1_000_000 });

describe('named caddies — uniqueness & shop gating', () => {
  it('the named caddies are all flagged caddy:"named" and are epic/legendary', () => {
    expect(NAMED_CADDY_IDS.slice().sort()).toEqual(
      ['auto-caddie', 'convict-sheep', 'dr-chipinski', 'driver-dan', 'mystic-mole', 'sandy-sandsaver', 'space-ducks', 'suggestible-sam'].sort(),
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
    expect(loadoutFromPerks(['suggestible-sam']).confidenceMod).toEqual(SAM_CONFIDENCE);
    expect(loadoutFromPerks(['sandy-sandsaver']).lieRelief).toBeGreaterThan(0);
    expect(loadoutFromPerks(['mystic-mole']).puttBoost).toBeGreaterThan(0);
  });

  it('snapshot/resume reconstructs a hired caddy', () => {
    const run = buy(richRun(9), 'space-ducks');
    const resumed = resumeRun(snapshotRun(run));
    expect(resumed.loadout.caddyGuard).toEqual(SPACE_DUCKS_GUARD);
    expect(namedCaddyOwned(resumed.loadout.perks)).toBe('space-ducks');
  });
});

describe('Suggestible Sam — club confidence (a real, gated scoring edge)', () => {
  it('the base flow has no suggestion and no confidence; Sam adds both', () => {
    expect(startingLoadout().clubSuggest).toBeUndefined();
    expect(startingLoadout().confidenceMod).toBeUndefined();
    const sam = loadoutFromPerks(['suggestible-sam']);
    expect(sam.clubSuggest).toBe(true);
    expect(sam.confidenceMod).toEqual(SAM_CONFIDENCE);
  });

  it('the confidence boost lifts the green zone ONLY on the suggested club', () => {
    const hole = generateCourse('sam:shape', { holes: 6, distanceFromStart: 0 }).holes[0]!;
    const driver = CLUBS.find((c) => c.id === 'D')!;
    const tgt = pinOf(hole);
    const base = shotSpread(hole, hole.tee, 'tee', tgt, driver, { carryMult: 1 });
    const onClub = shotSpread(hole, hole.tee, 'tee', tgt, driver, {
      carryMult: 1,
      confidence: SAM_CONFIDENCE,
      suggestedClubId: 'D',
    });
    const offClub = shotSpread(hole, hole.tee, 'tee', tgt, driver, {
      carryMult: 1,
      confidence: SAM_CONFIDENCE,
      suggestedClubId: '7i', // not the club being played → no boost
    });
    expect(onClub.shape.green).toBeGreaterThan(base.shape.green); // committed to Sam's club → more green
    expect(offClub.shape.green).toBeCloseTo(base.shape.green, 10); // a different club → byte-for-byte base
  });

  it('an absent confidence mod is byte-for-byte identical (no extra rng, landing unchanged)', () => {
    const hole = generateCourse('sam:det', { holes: 6, distanceFromStart: 4 }).holes[0]!;
    const driver = CLUBS.find((c) => c.id === 'D')!;
    const tgt = pinOf(hole);
    for (let s = 0; s < 40; s++) {
      const a = executeShot(hole, hole.tee, 'tee', tgt, driver, { carryMult: 1 }, new Rng(`s:${s}`));
      // confidence present but for a DIFFERENT club → the gate is closed, so it must match exactly.
      const b = executeShot(
        hole,
        hole.tee,
        'tee',
        tgt,
        driver,
        { carryMult: 1, confidence: SAM_CONFIDENCE, suggestedClubId: 'PW' },
        new Rng(`s:${s}`),
      );
      expect(b.log.result.landing).toEqual(a.log.result.landing);
    }
  });

  // Follow-Sam harness: play every shot with the club Sam suggests, with vs without his confidence.
  // Both arms make the IDENTICAL decisions on the IDENTICAL rng stream — the only difference is the
  // shape boost (which adds no rng draws) — so any score gap is the confidence mechanic alone.
  const followSamStableford = (lo: ReturnType<typeof loadoutFromPerks>): number => {
    let sf = 0;
    let n = 0;
    for (let s = 0; s < 60; s++) {
      const course = generateCourse(`${s}:sam`, { holes: 6, distanceFromStart: s % 12 });
      const rng = new Rng(`${course.seed}:sam`);
      const records = course.holes.map((hole, i) => {
        let play = beginHole(hole, i);
        for (let g = 0; g < 40 && !play.done; g++) {
          const sv = shotView(play, lo);
          const clubId = sv.lie === 'green' ? 'putter' : sv.attackClubId; // play Sam's club
          play = takeShot(play, { clubId, aim: 'attack' }, lo, rng);
        }
        return { par: hole.par, strokes: play.strokes };
      });
      sf += playTotals(records).stableford;
      n++;
    }
    return sf / n;
  };

  it('following Sam (committing to his club) raises mean per-stop Stableford', () => {
    const base = followSamStableford(loadoutFromPerks([])); // same clubs, no confidence
    const withSam = followSamStableford(loadoutFromPerks(['suggestible-sam']));
    expect(withSam).toBeGreaterThan(base);
  });

  // Sam's hazard read (richer info): the carry needed to clear a forced penalty on the line.
  it('forcedCarry reports the carry to clear a penalty band on the line (null when clear)', () => {
    const withWater: Hole = {
      par: 4,
      tee: [0, 0],
      green: [0, 300],
      centreline: [[0, 0], [0, 300]],
      features: [
        { kind: 'fairway', poly: [[-15, 0], [15, 0], [15, 280], [-15, 280]] },
        { kind: 'green', poly: [[-10, 290], [10, 290], [10, 310], [-10, 310]] },
      ],
      hazards: [{ kind: 'water', poly: [[-40, 120], [40, 120], [40, 150], [-40, 150]] }],
    };
    const fc = forcedCarry(withWater, [0, 0], [0, 300]);
    expect(fc?.kind).toBe('water');
    // Far edge of the water is at y≈150 — the carry to clear it lands just past it.
    expect(fc!.carry).toBeGreaterThanOrEqual(145);
    expect(fc!.carry).toBeLessThanOrEqual(162);
    // A line with no penalty crossing reads clear.
    const clear: Hole = { ...withWater, hazards: [] };
    expect(forcedCarry(clear, [0, 0], [0, 300])).toBeNull();
  });
});

describe('Sandy the Sand-Saver — lie relief (escape specialist, GS-mux)', () => {
  const hole = generateCourse('sandy:relief', { holes: 6, distanceFromStart: 4 }).holes[0]!;
  const club = CLUBS.find((c) => c.id === '7i')!;
  const tgt: Vec = hole.green;

  it('an absent lie-relief is byte-for-byte identical (no extra rng, landing unchanged)', () => {
    for (let s = 0; s < 30; s++) {
      const a = executeShot(hole, hole.tee, 'rough', tgt, club, { carryMult: 1 }, new Rng(`s:${s}`));
      const b = executeShot(hole, hole.tee, 'rough', tgt, club, { carryMult: 1, lieRelief: undefined }, new Rng(`s:${s}`));
      expect(b.ballAfter).toEqual(a.ballAfter);
      expect(b.log.result.carry).toBe(a.log.result.carry);
    }
  });

  it('relief recovers carry from a bad lie (rough flies closer to full)', () => {
    let plain = 0;
    let relieved = 0;
    const n = 80;
    for (let s = 0; s < n; s++) {
      plain += executeShot(hole, hole.tee, 'rough', tgt, club, { carryMult: 1 }, new Rng(`r:${s}`)).log.result.carry;
      relieved += executeShot(hole, hole.tee, 'rough', tgt, club, { carryMult: 1, lieRelief: 0.6 }, new Rng(`r:${s}`)).log.result.carry;
    }
    expect(relieved / n).toBeGreaterThan(plain / n); // a real escape — more carry out of the rough
  });

  it('relief never helps a clean lie (fairway is unchanged)', () => {
    for (let s = 0; s < 20; s++) {
      const a = executeShot(hole, hole.tee, 'fairway', tgt, club, { carryMult: 1 }, new Rng(`f:${s}`));
      const b = executeShot(hole, hole.tee, 'fairway', tgt, club, { carryMult: 1, lieRelief: 0.6 }, new Rng(`f:${s}`));
      expect(b.log.result.carry).toBe(a.log.result.carry); // fairway carryMult is 1 → relief is a no-op
    }
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
    const empty = { redirect: {}, kind: 'laser' as const };
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
