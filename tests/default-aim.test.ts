import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { dist, type Hole, type Vec } from '../src/sim/course/contract';
import { autoAimTarget, layupTarget, pinOf, biomeCarryMult } from '../src/sim/round';
import { beginHole, previewShot, type ShotDecision } from '../src/sim/rpg/play';
import { startingLoadout } from '../src/sim/rpg/economy';
import { CLUBS } from '../src/sim/clubs';

/** Point a fraction t (arc length) along the centreline — mirrors the generator's centrePoint. */
function alongAt(line: Vec[], t: number): Vec {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const l = Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
    segLens.push(l);
    total += l;
  }
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++) {
    const l = segLens[i - 1]!;
    if (want <= l || i === line.length - 1) {
      const f = l === 0 ? 0 : want / l;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    want -= l;
  }
  return line[0]!;
}

/** Shortest distance from a point to the centreline polyline (how far off-corridor the aim is). */
function distToCentreline(hole: Hole, p: Vec): number {
  let best = Infinity;
  for (let i = 0; i <= 80; i++) best = Math.min(best, dist(p, alongAt(hole.centreline, i / 80)));
  return best;
}

/** Max nominal carry the default bag can fly from the tee (yards) — mirrors round.ts maxReachOf. */
function maxNominalReach(carryMult: number): number {
  let max = 0;
  for (const c of CLUBS) if (c.id !== 'putter') max = Math.max(max, c.carry);
  return max * carryMult;
}

describe('smart default aim (GS-default-aim)', () => {
  it('is a pure function of the hole/ball/lie/bag (determinism)', () => {
    const c = generateCourse(4242, { biome: 'verdant-station', holes: 6, wildness: 0.5 });
    for (const h of c.holes) {
      const cm = biomeCarryMult(h);
      expect(autoAimTarget(h, h.tee, 'tee', CLUBS, cm)).toEqual(autoAimTarget(h, h.tee, 'tee', CLUBS, cm));
    }
  });

  it('a par 3 attacks the FLAG (unchanged from the old default)', () => {
    let par3s = 0;
    for (let s = 0; s < 60; s++) {
      const c = generateCourse(s + 11000, { biome: 'verdant-station', holes: 6, wildness: 0.5 });
      for (const h of c.holes) {
        if (h.par !== 3) continue;
        par3s++;
        expect(autoAimTarget(h, h.tee, 'tee', CLUBS, biomeCarryMult(h))).toEqual(pinOf(h));
      }
    }
    expect(par3s).toBeGreaterThan(10);
  });

  it('a par 4/5 TEE shot aims DOWN the corridor — near the centreline, forward, within a drive', () => {
    let checked = 0;
    let offCorridorIfAttacking = 0; // holes where attacking the pin would sit well off the centreline
    for (let s = 0; s < 120; s++) {
      let c;
      try {
        c = generateCourse(s + 12000, { holes: 4, wildness: 0.7 });
      } catch {
        continue; // benign raw-throw config — production retries it
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue; // island-hop holes have no fairway corridor
        const cm = biomeCarryMult(h);
        const reach = maxNominalReach(cm);
        const t = autoAimTarget(h, h.tee, 'tee', CLUBS, cm);
        checked++;
        // Progress toward the green, never aimed past it, and reachable in one drive.
        expect(dist(t, h.green)).toBeLessThanOrEqual(dist(h.tee, h.green) + 1e-6);
        expect(dist(h.tee, t)).toBeLessThanOrEqual(reach + 1e-6);
        // The aim sits ON the corridor (a real "down the fairway" line), not out in the rough.
        expect(distToCentreline(h, t)).toBeLessThan(18);
        // Where the straight line to the flag would land well off the centreline (a dogleg), the smart
        // aim is meaningfully closer to the corridor than that pin line — the whole point of the change.
        const pinDir = pinOf(h);
        const pinLine: Vec = [
          h.tee[0] + (pinDir[0] - h.tee[0]) * Math.min(1, (reach * 0.88) / (dist(h.tee, pinDir) || 1)),
          h.tee[1] + (pinDir[1] - h.tee[1]) * Math.min(1, (reach * 0.88) / (dist(h.tee, pinDir) || 1)),
        ];
        if (distToCentreline(h, pinLine) > 22) {
          offCorridorIfAttacking++;
          expect(distToCentreline(h, t)).toBeLessThan(distToCentreline(h, pinLine));
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
    // The dogleg improvement is LIVE: some holes genuinely punish an attack-the-pin tee line.
    expect(offCorridorIfAttacking).toBeGreaterThan(0);
  });

  it('a reachable NON-tee approach attacks the flag (best shot at the hole)', () => {
    let checked = 0;
    for (let s = 0; s < 120; s++) {
      let c;
      try {
        c = generateCourse(s + 13000, { holes: 4, wildness: 0.5 });
      } catch {
        continue;
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue;
        const cm = biomeCarryMult(h);
        // Sit the ball on a fairway station ~90 yds short of the green — comfortably within reach.
        const near: Vec = alongAt(h.centreline, 0.98);
        const back: Vec = alongAt(h.centreline, 0.72);
        const ball: Vec = dist(back, pinOf(h)) < maxNominalReach(cm) ? back : near;
        if (dist(ball, pinOf(h)) > maxNominalReach(cm)) continue;
        checked++;
        expect(autoAimTarget(h, ball, 'fairway', CLUBS, cm)).toEqual(pinOf(h));
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("auto ≡ interactive: previewShot 'auto' resolves the SAME target the resolver returns (contract 2)", () => {
    const c = generateCourse(777, { biome: 'verdant-station', holes: 6, wildness: 0.6 });
    const lo = startingLoadout();
    for (const h of c.holes) {
      if (h.par < 4) continue;
      const play = beginHole(h, 0);
      const cm = biomeCarryMult(h);
      const tgt = autoAimTarget(h, play.ball, play.lie, CLUBS, cm);
      const dAuto: ShotDecision = { clubId: 'D', aim: 'auto', power: 1 };
      const dExplicit: ShotDecision = { clubId: 'D', aim: 'attack', target: tgt, power: 1 };
      // The 'auto' aim and an explicit free-target at the same point yield an identical contemplated cone.
      expect(previewShot(play, dAuto, lo)).toEqual(previewShot(play, dExplicit, lo));
    }
  });

  it("'safe' is unchanged (still the corridor lay-up), so only 'auto' is new behaviour", () => {
    const c = generateCourse(999, { holes: 6, wildness: 0.8 });
    for (const h of c.holes) {
      if (h.par < 4) continue;
      const cm = biomeCarryMult(h);
      // The safe target still delegates to layupTarget exactly — no drift introduced by the refactor.
      const play = beginHole(h, 0);
      const lo = startingLoadout();
      const safeCone = previewShot(play, { clubId: 'D', aim: 'safe', power: 1 }, lo);
      const layupCone = previewShot(play, { clubId: 'D', aim: 'attack', target: layupTarget(h, play.ball, play.lie, CLUBS, cm), power: 1 }, lo);
      expect(safeCone).toEqual(layupCone);
    }
  });
});
