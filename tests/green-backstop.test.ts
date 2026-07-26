/**
 * GS-green-backstop — the ground BEHIND the green is defended.
 *
 * Playtest: "some biomes have water and bunkers behind the greens, but there's virtually no trees or
 * other hazards to punish going long on a green." A census agreed: the back arc averaged ~1.2 blobs,
 * every one of them incidental (a greenside pot that happened to draw an angle past the pin), and
 * TREES behind a green averaged 0.00–0.12 per hole — i.e. never. Flying the green was free.
 *
 * These tests pin the shape of the fix. Two of them are the feature; the rest are the fairness rules
 * that let it ship, because a backstop is the one hazard class that sits closest to the target:
 *  • Everything behind the green is NON-PENALTY. Long costs a stroke, never a lost card.
 *  • It clears the putting surface, the approach lane and the corridor by construction — the proof is
 *    that `generateCourse` (which runs validateFairness / validateCrossings / validateGreenApproach
 *    internally and THROWS on a violation) still emits clean courses across a wide sweep.
 *  • It rides its OWN side stream, so the main generator draws are untouched (contract 1) — the whole
 *    seeded suite passing unchanged alongside this file is that guard.
 */
import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { lieInfo } from '../src/sim/shot';
import type { Hole, Vec } from '../src/sim/course/contract';

/** Unit vector of the approach into the green (tee→green is close enough for a census). */
function longDir(h: Hole): Vec {
  const dx = h.green[0] - h.tee[0];
  const dy = h.green[1] - h.tee[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}
function centroid(poly: Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}
/** Hazards sitting in the arc BEYOND the green — the ground a shot that flew the green finishes on. */
function behindGreen(h: Hole): { kind: string; poly: Vec[] }[] {
  const [ax, ay] = longDir(h);
  return h.hazards.filter((z) => {
    const c = centroid(z.poly);
    const rx = c[0] - h.green[0];
    const ry = c[1] - h.green[1];
    const along = rx * ax + ry * ay;
    return along > 4 && Math.hypot(rx, ry) < 45;
  });
}
const WORLDS = [
  'verdant-station',
  'dust-belt',
  'ice-ring',
  'ember-world',
  'spore-jungle',
  'tidal-archipelago',
  'toxic-mire',
  'tempest-reach',
  'crystal-spires',
  'earth-links',
];

/** One deterministic sweep of holes per world, reused by every test below. */
function sweep(biome: string, seeds = 12): Hole[] {
  const out: Hole[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    out.push(...generateCourse(seed, { holes: 9, biome, wildness: 0.6 }).holes);
  }
  return out;
}

describe('going long is punished on every world', () => {
  it('most holes carry SOMETHING behind the green', () => {
    for (const w of WORLDS) {
      const holes = sweep(w);
      const defended = holes.filter((h) => behindGreen(h).length > 0).length;
      expect(defended / holes.length, `${w} holes defended long`).toBeGreaterThan(0.7);
    }
  });

  it('a world that grows cover puts real STANDS behind its greens — the missing piece', () => {
    // The complaint was specifically about trees. A tree world must average a meaningful amount of
    // tall cover over the back; the pre-GS-green-backstop generator averaged ~0.05 blobs per hole.
    for (const w of ['verdant-station', 'ice-ring', 'spore-jungle', 'ember-world']) {
      const holes = sweep(w);
      const trees = holes.reduce((a, h) => a + behindGreen(h).filter((z) => z.kind === 'trees').length, 0);
      expect(trees / holes.length, `${w} tall cover behind the green`).toBeGreaterThan(0.4);
    }
  });

  it('a TREELESS world still defends long — with its own material, not a grove', () => {
    // St Annette's is essentially treeless by design (`treeDensity: 0`), and so is the desert-ish end
    // of the rotation. They must still cost you for flying the green — revetted sand and thick native
    // grass — or the fix would only have landed on the parkland worlds.
    const holes = sweep('earth-links');
    const behind = holes.flatMap(behindGreen);
    expect(behind.some((z) => z.kind === 'trees')).toBe(false);
    const defended = holes.filter((h) => behindGreen(h).length > 0).length;
    expect(defended / holes.length).toBeGreaterThan(0.7);
  });
});

describe('a backstop is fair by construction', () => {
  it('the material a backstop places is NON-PENALTY on every world', () => {
    // Long may cost a stroke; it may never lose the ball. A penalty backstop is a difficulty cliff and
    // the fastest route through the no-death-spiral bar. (Penalty blobs can still sit behind a green
    // from the sanctioned greenside RING — an older feature with its own approach-window proof — so
    // this asserts the classes the backstop itself is allowed to place, not everything back there.)
    const BACKSTOP_KINDS = ['trees', 'bunker', 'pot', 'deeprough', 'fescue'];
    for (const k of BACKSTOP_KINDS) {
      expect(lieInfo(k).penalty, `${k} must be a non-penalty lie`).toBeFalsy();
    }
    // …and the fallback the code picks when a world's own deep rough IS a penalty (the tidal world's
    // `deepRough: 'water'`) has to be one of them too.
    expect(lieInfo('fescue').penalty).toBeFalsy();
  });

  it('the material behind a green is mostly stuff you can PLAY OUT OF', () => {
    // Penalty water/lava CAN sit behind a green (the sanctioned greenside ring, an approach lake) and
    // that is good drama. What must not happen is the back of the green becoming a wall of lost balls:
    // the defence the backstop adds is all recoverable, so recoverable material stays the majority.
    for (const w of WORLDS) {
      const behind = sweep(w, 8).flatMap(behindGreen);
      const penalty = behind.filter((z) => lieInfo(z.kind).penalty).length;
      expect(penalty / behind.length, `${w} share of penalty material long`).toBeLessThan(0.4);
    }
  });

  it('the generator still emits legal courses (fairness + approach proofs run inside)', () => {
    // `generateCourse` throws on a fairness / crossing / green-approach violation, so a clean sweep IS
    // the proof that the new pass never walls off the shot you were supposed to hit.
    for (const w of WORLDS) {
      expect(() => sweep(w, 8)).not.toThrow();
    }
  });

  it('is deterministic — the same seed builds the same backstop', () => {
    const a = generateCourse(42, { holes: 9, biome: 'verdant-station', wildness: 0.8 });
    const b = generateCourse(42, { holes: 9, biome: 'verdant-station', wildness: 0.8 });
    expect(JSON.stringify(b.holes.map(behindGreen))).toBe(JSON.stringify(a.holes.map(behindGreen)));
  });
});
