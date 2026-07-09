import { describe, it, expect } from 'vitest';
import {
  CONVICT_SHEEP_GUARD,
  SPACE_DUCKS_GUARD,
  SAM_CONFIDENCE,
  NAMED_CADDY_IDS,
  PARROT_PREVIEW_CHANCE,
  loadoutFromPerks,
  namedCaddyOwned,
  netDispersion,
  shopItem,
  startingLoadout,
  usableBag,
} from '../src/sim/rpg/economy';
import { characterShotMods } from '../src/sim/rpg/characters';
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
import { executeShot, forcedCarry, pinOf, playCourse, playHole, shotSpread, CHIPIN_RANGE } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { playTotals } from '../src/sim/score';
import { type Hole, type Vec } from '../src/sim/course/contract';
import { Rng } from '../src/sim/rng';

const richRun = (seed: number) => ({ ...startRun(seed), credits: 1_000_000 });

describe('named caddies — uniqueness & shop gating', () => {
  it('the named caddies are all flagged caddy:"named" and are LEGENDARY (GS-caddy-factions)', () => {
    expect(NAMED_CADDY_IDS.slice().sort()).toEqual(
      ['auto-caddie', 'convict-sheep', 'dr-chipinski', 'driver-dan', 'mystic-mole', 'prognostic-parrot', 'sandy-sandsaver', 'space-ducks', 'suggestible-sam'].sort(),
    );
    for (const id of NAMED_CADDY_IDS) {
      const it = shopItem(id)!;
      expect(it.caddy).toBe('named');
      // Every caddy is now legendary so they all appear at the same scarcity — no "Dan's just the one
      // that showed up" because he was epic (GS-caddy-factions).
      expect(it.rarity).toBe('legendary');
    }
  });

  it('hiring a NEW caddy FIRES the incumbent (GS-caddy-factions) and keeps them out of the shop this run', () => {
    let run = buy(richRun(1), 'driver-dan');
    expect(run.loadout.driverAnywhere).toBe(true);
    expect(namedCaddyOwned(run.loadout.perks)).toBe('driver-dan');
    expect(run.firedCaddies).toEqual([]);

    // Hire a second caddy → the first is fired, the new one takes the bag, the old effect is gone.
    const swapped = buy(run, 'space-ducks');
    expect(namedCaddyOwned(swapped.loadout.perks)).toBe('space-ducks');
    expect(swapped.loadout.caddyGuard).toEqual(SPACE_DUCKS_GUARD);
    expect(swapped.loadout.driverAnywhere).toBeFalsy(); // Dan's power left with him
    expect(swapped.firedCaddies).toContain('driver-dan');
    expect(swapped.loadout.perks).not.toContain('driver-dan');

    // The fired caddy never returns to the shop for the rest of this run (across many seeds).
    for (let seed = 0; seed < 60; seed++) {
      const ids = shopOffer({ ...swapped, seed }).map((o) => o.item.id);
      expect(ids).not.toContain('driver-dan');
    }
  });

  it('buying the caddy you already own is a no-op (no self-fire)', () => {
    const run = buy(richRun(2), 'convict-sheep');
    const again = buy(run, 'convict-sheep');
    expect(again).toBe(run); // canBuy false (maxed) → unchanged reference
    expect(again.firedCaddies).toEqual([]);
  });

  it('named caddies surface in the shop, and OTHER caddies stay offerable after a hire (for swapping)', () => {
    // No caddy yet → named caddies CAN show up in the rotating offer (rarity-weighted, so scarce —
    // assert they surface across enough seeds and a spread of stops, as a real run encounters them).
    let surfaced = 0;
    for (let seed = 0; seed < 120; seed++) {
      for (const distanceFromStart of [0, 3, 6, 9]) {
        const run = { ...startRun(seed), stopIndex: 1, distanceFromStart };
        const ids = shopOffer(run).map((o) => o.item.id);
        if (ids.some((id) => NAMED_CADDY_IDS.includes(id))) surfaced++;
      }
    }
    expect(surfaced).toBeGreaterThan(0);

    // Once a caddy is hired → the one you OWN never re-appears, but the OTHERS still can (you can swap).
    const withCaddy = buy(richRun(0), 'space-ducks');
    let othersSurfaced = 0;
    for (let seed = 0; seed < 200; seed++) {
      const ids = shopOffer({ ...withCaddy, seed, stopIndex: 1, distanceFromStart: 6 }).map((o) => o.item.id);
      expect(ids).not.toContain('space-ducks'); // the one you own is maxed out
      if (ids.some((id) => NAMED_CADDY_IDS.includes(id) && id !== 'space-ducks')) othersSurfaced++;
    }
    expect(othersSurfaced).toBeGreaterThan(0);
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
    const wedge = CLUBS.find((c) => c.id === 'SW')!;
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

// --- Guard helpers. The guard now fires on OUTCOME: a ball that would come down OFF the fairway on the
// caddy's side is zapped back to the centre — every qualifying miss, no chance roll. resolveShot stays
// course-agnostic, so the tests supply a synthetic `offFairway` predicate: a narrow strip of fairway
// (|x| <= FW_HALF off the dead-straight aim line) with rough everywhere else. ---
const wideMiss: SprayShape = { green: 0.5, hookL: 0.15, sliceR: 0.15, duckHookL: 0.1, shankR: 0.1 };
const driver = CLUBS.find((c) => c.id === 'D')!;
const angleSd = dispersionProfile(driver.carry).lateralFrac * lieInfo('fairway').dispersionMult;
const FROM: Vec = [0, 0];
const AIM: Vec = [0, 100]; // dead up +Y, so landing[0] IS the lateral miss (− left, + right)

function rawShot(rng: Rng) {
  return resolveShot({ from: FROM, aim: AIM, club: driver, lie: 'fairway', shape: wideMiss, rng });
}
function zoneOf(r: { landing: Vec }) {
  return classifySprayZone(Math.atan2(r.landing[0], r.landing[1]), wideMiss, angleSd);
}
// Calibrate the fairway half-width to sit just OUTSIDE the green band, so a centred (saved) ball always
// reads as ON the fairway and the miss tails always read as OFF it — no boundary ambiguity.
let greenMaxX = 0;
for (let s = 0; s < 800; s++) {
  const r = rawShot(new Rng(`cal:${s}`));
  if (zoneOf(r) === 'green') greenMaxX = Math.max(greenMaxX, Math.abs(r.landing[0]));
}
const FW_HALF = greenMaxX + 5; // a comfortable margin past the widest centred shot
const offFairway = (p: Vec) => Math.abs(p[0]) > FW_HALF;

function guardedShot(rng: Rng, guard: typeof SPACE_DUCKS_GUARD) {
  return resolveShot({ from: FROM, aim: AIM, club: driver, lie: 'fairway', shape: wideMiss, guard, offFairway, rng });
}

describe('Space Ducks — laser EVERY ball that would miss the fairway LEFT back onto it', () => {
  it('no ball is left to come down left of the fairway; each fires (and lands back on) the fairway', () => {
    let baseLeft = 0;
    let baseRight = 0;
    let guardLeft = 0;
    let guardRight = 0;
    let lasers = 0;
    let savedOnFairway = 0;
    for (let s = 0; s < 800; s++) {
      const b = rawShot(new Rng(`d:${s}`));
      if (b.landing[0] < -FW_HALF) baseLeft++;
      if (b.landing[0] > FW_HALF) baseRight++;
      const g = guardedShot(new Rng(`d:${s}`), SPACE_DUCKS_GUARD);
      if (g.landing[0] < -FW_HALF) guardLeft++;
      if (g.landing[0] > FW_HALF) guardRight++;
      if (g.redirect?.kind === 'laser') {
        lasers++;
        if (!offFairway(g.landing)) savedOnFairway++; // the redirected ball lands back on the fairway
      }
    }
    expect(baseLeft).toBeGreaterThan(20); // the setup really does miss left a lot
    expect(guardLeft).toBe(0); // …and the ducks zap EVERY one of them — none lands left of the fairway
    expect(lasers).toBe(baseLeft); // exactly one laser per would-be left miss (100%, not a sample)
    expect(savedOnFairway).toBe(lasers); // and every zapped ball comes down back ON the fairway
    expect(guardRight).toBe(baseRight); // right misses are the sheep's job — the ducks leave them be
  });
});

describe('Convict Sheep — boomerang EVERY ball that would miss the fairway RIGHT back onto it', () => {
  it('no ball is left to come down right of the fairway; the ducks-mirror', () => {
    let baseLeft = 0;
    let baseRight = 0;
    let guardLeft = 0;
    let guardRight = 0;
    let boomerangs = 0;
    let savedOnFairway = 0;
    for (let s = 0; s < 800; s++) {
      const b = rawShot(new Rng(`c:${s}`));
      if (b.landing[0] < -FW_HALF) baseLeft++;
      if (b.landing[0] > FW_HALF) baseRight++;
      const g = guardedShot(new Rng(`c:${s}`), CONVICT_SHEEP_GUARD);
      if (g.landing[0] < -FW_HALF) guardLeft++;
      if (g.landing[0] > FW_HALF) guardRight++;
      if (g.redirect?.kind === 'boomerang') {
        boomerangs++;
        if (!offFairway(g.landing)) savedOnFairway++;
      }
    }
    expect(baseRight).toBeGreaterThan(20);
    expect(guardRight).toBe(0); // every right miss is boomeranged home
    expect(boomerangs).toBe(baseRight);
    expect(savedOnFairway).toBe(boomerangs);
    expect(guardLeft).toBe(baseLeft); // left misses are the ducks' job — untouched
  });
});

describe('a guard classifies by FAIRWAY side, not the aim line (GS-caddy fix)', () => {
  it('the ducks leave a RIGHT-of-fairway miss for the sheep even when the aim line is offset in the rough', () => {
    // The reported bug: from the right rough, aiming straight down the hole (an aim line PARALLEL to the
    // fairway but offset right of it), a ball that sprays a little left is still RIGHT of the fairway — yet
    // the old bearing-relative sign read it as a LEFT miss and the ducks lasered it further offline (into a
    // lake). The fix classifies off the fairway centreline (here `x < 0`).
    const FROM_R: Vec = [50, 0]; // parked in the right rough
    const AIM_UP: Vec = [50, 120]; // aim straight down the hole — parallel to the fairway, offset right of it
    const fairwaySide = (p: Vec): 'left' | 'right' => (p[0] < 0 ? 'left' : 'right'); // fairway centred on x=0
    let rightMisses = 0;
    let fixedLasersRight = 0; // ducks firing on a right-of-fairway ball, WITH the centreline classifier
    let buggyLasersRight = 0; // …with the old bearing-relative fallback (no fairwaySide)
    for (let s = 0; s < 800; s++) {
      const raw = resolveShot({ from: FROM_R, aim: AIM_UP, club: driver, lie: 'fairway', shape: wideMiss, rng: new Rng(`fs:${s}`) });
      if (!(raw.landing[0] > FW_HALF)) continue; // only the right-of-fairway misses
      rightMisses++;
      const fixed = resolveShot({ from: FROM_R, aim: AIM_UP, club: driver, lie: 'fairway', shape: wideMiss, guard: SPACE_DUCKS_GUARD, offFairway, fairwaySide, rng: new Rng(`fs:${s}`) });
      const buggy = resolveShot({ from: FROM_R, aim: AIM_UP, club: driver, lie: 'fairway', shape: wideMiss, guard: SPACE_DUCKS_GUARD, offFairway, rng: new Rng(`fs:${s}`) });
      if (fixed.redirect?.kind === 'laser') fixedLasersRight++;
      if (buggy.redirect?.kind === 'laser') buggyLasersRight++;
    }
    expect(rightMisses).toBeGreaterThan(10); // the setup really does miss right of the fairway a lot
    expect(fixedLasersRight).toBe(0); // FIX: the ducks (left) never touch a right-of-fairway ball
    expect(buggyLasersRight).toBeGreaterThan(0); // the OLD bearing-relative sign wrongly lasered some of them
  });
});

describe('a guard with no fairway test is byte-for-byte identical (no extra rng)', () => {
  it('a guard but no offFairway predicate leaves the landing + rng stream untouched', () => {
    const guard = { side: 'left' as const, kind: 'laser' as const };
    for (let s = 0; s < 50; s++) {
      const a = resolveShot({ from: FROM, aim: AIM, club: driver, lie: 'fairway', shape: wideMiss, rng: new Rng(`e:${s}`) });
      const b = resolveShot({ from: FROM, aim: AIM, club: driver, lie: 'fairway', shape: wideMiss, guard, rng: new Rng(`e:${s}`) });
      expect(b.landing).toEqual(a.landing);
      expect(b.redirect).toBeUndefined();
    }
  });
});

describe('greenside misses are dropped ON the green, not just the fairway', () => {
  it('a greenside off-fairway miss on the guard side is teleported to the green target', () => {
    const GREEN_PT: Vec = [9, 235];
    const greenAim = (_p: Vec) => GREEN_PT; // treat every off-fairway miss as greenside
    let saves = 0;
    for (let s = 0; s < 400; s++) {
      const r = resolveShot({
        from: FROM, aim: AIM, club: driver, lie: 'fairway', shape: wideMiss,
        guard: SPACE_DUCKS_GUARD, offFairway, greenAim, rng: new Rng(`gs:${s}`),
      });
      if (r.redirect) {
        saves++;
        expect(r.landing).toEqual(GREEN_PT); // dropped on the green, NOT recentred on the fairway line
        expect(r.carry).toBeCloseTo(Math.hypot(GREEN_PT[0] - FROM[0], GREEN_PT[1] - FROM[1]), 3);
      }
    }
    expect(saves).toBeGreaterThan(20); // plenty of left misses to save
  });

  it('when the miss is NOT greenside (greenAim → null) the save recentres onto the fairway instead', () => {
    const greenAim = (_p: Vec) => null; // nothing is greenside
    let redirects = 0;
    let backOnFairway = 0;
    for (let s = 0; s < 400; s++) {
      const r = resolveShot({
        from: FROM, aim: AIM, club: driver, lie: 'fairway', shape: wideMiss,
        guard: SPACE_DUCKS_GUARD, offFairway, greenAim, rng: new Rng(`fw:${s}`),
      });
      if (r.redirect) {
        redirects++;
        if (!offFairway(r.landing)) backOnFairway++;
      }
    }
    expect(redirects).toBeGreaterThan(20);
    expect(backOnFairway).toBe(redirects); // every non-greenside save lands back on the fairway
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

describe('Prognostic Parrot — foresight scramble (GS-caddy-parrot)', () => {
  it('is a legendary named caddy that arms previewScramble to the 33% chance', () => {
    const item = shopItem('prognostic-parrot')!;
    expect(item.caddy).toBe('named');
    expect(item.rarity).toBe('legendary');
    expect(PARROT_PREVIEW_CHANCE).toBe(0.33);
    const lo = loadoutFromPerks(['prognostic-parrot']);
    expect(lo.previewScramble).toBe(PARROT_PREVIEW_CHANCE);
    // A stock loadout never arms it (byte-for-byte off path).
    expect(startingLoadout().previewScramble).toBeUndefined();
  });

  it('the OFF path (no parrot) draws ZERO extra rng — byte-for-byte the solo hole', () => {
    const c = generateCourse('parrot:eq', { holes: 6, distanceFromStart: 5 });
    // previewScramble undefined vs 0 both mean "no proc, no draw" and equal the plain solo hole.
    const solo = playHole(c.holes[0]!, new Rng('z'), { shotMods: characterShotMods('feather-fade') });
    const off1 = playHole(c.holes[0]!, new Rng('z'), { shotMods: characterShotMods('feather-fade'), previewScramble: undefined });
    const off2 = playHole(c.holes[0]!, new Rng('z'), { shotMods: characterShotMods('feather-fade'), previewScramble: 0 });
    expect(off1).toEqual(solo);
    expect(off2).toEqual(solo);
  });

  it('a proc consumes the SAME rng stream regardless of the partner mods (foresight is player-owned)', () => {
    // At chance 1 the parrot ALWAYS procs → best-of-two every full swing, deterministic per seed.
    const c = generateCourse('parrot:det', { holes: 6, distanceFromStart: 7 });
    const a = playHole(c.holes[0]!, new Rng('p'), { shotMods: characterShotMods('feather-fade'), previewScramble: 1 });
    const b = playHole(c.holes[0]!, new Rng('p'), { shotMods: characterShotMods('feather-fade'), previewScramble: 1 });
    expect(a).toEqual(b); // pure + deterministic
  });

  it('the foresight scramble scores at least as well as solo, on average better', () => {
    const mods = characterShotMods('feather-fade');
    let solo = 0;
    let parrot = 0;
    const N = 40;
    for (let s = 0; s < N; s++) {
      const c = generateCourse(`prt:${s}`, { holes: 9, distanceFromStart: 8 });
      const a = playCourse(c.holes, new Rng(`prt:${s}:p`), { shotMods: mods });
      // Chance 1 = the parrot foresees EVERY shot (best-of-two), the strongest form of the effect.
      const b = playCourse(c.holes, new Rng(`prt:${s}:p`), { shotMods: mods, previewScramble: 1 });
      solo += playTotals(a.map((p) => p.record)).stableford;
      parrot += playTotals(b.map((p) => p.record)).stableford;
    }
    expect(parrot).toBeGreaterThan(solo); // a power-up must RAISE mean Stableford (contract 4)
  });

  it('a team scramble gates the parrot OFF (no double proc): team scramble is byte-for-byte with or without the parrot armed', () => {
    const c = generateCourse('parrot:team', { holes: 6, distanceFromStart: 6 });
    const partner = characterShotMods('huang-woo-hook');
    const withTeam = playHole(c.holes[0]!, new Rng('t'), { shotMods: characterShotMods('feather-fade'), scramble: { partnerMods: partner } });
    const withBoth = playHole(c.holes[0]!, new Rng('t'), {
      shotMods: characterShotMods('feather-fade'),
      scramble: { partnerMods: partner },
      previewScramble: 1, // ignored while a team scramble is active (matches !opts.scramble gate)
    });
    expect(withBoth).toEqual(withTeam);
  });
});
