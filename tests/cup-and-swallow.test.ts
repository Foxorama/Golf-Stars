import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ballRadiusPx, cupRadiusPx, CUP_MAX_RATIO } from '../src/render/ball';
import { HOLE_OUT_RADIUS, manualPutt, onePutt } from '../src/sim/putting';
import { makeRng, Rng } from '../src/sim/rng';
import { dist, type Vec } from '../src/sim/course/contract';
import { PEN_INFO, type PenaltyKind } from '../src/sim/shot';
import { generateCourse } from '../src/sim/course/generate';
import { playHole, pinOf } from '../src/sim/round';
import { buildScene } from '../src/render/style';

/**
 * THE CUP IS THE CATCH RADIUS, AND A HAZARD THAT TAKES THE BALL TAKES IT (GS-cup-swallow).
 *
 * Two reports, one root each:
 *
 *   1. *"the hole can be a little bigger, the ball often kind of misses the hole but still sinks"* —
 *      there was no cup. The pin drew a fixed `r: 2.2` base shadow that did not scale with the
 *      camera, while the drawn ball reaches 3.3 at the putt view: **the ball was bigger than the
 *      hole**, so it could not be seen to go in. `HOLE_OUT_RADIUS` — the radius that actually
 *      catches the ball — was read by nothing in `src/render/`, which is contract 5's exact subject.
 *
 *   2. *"the ball doesn't disappear, in hazards or in the hole"* — the play view drew the ball at
 *      rest wherever the shot finished, unconditionally, so a ball in the water sat on the surface
 *      after its own splash; and a holed putt was drawn full-size on the cup and then cut.
 */

/** Source with comments stripped — these files are heavily commented, and a comment EXPLAINING why
 *  a symbol must not be re-derived must not itself read as a re-derivation. */
const code = (p: string): string =>
  readFileSync(resolve(__dirname, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ball = code('../src/render/ball.ts');
const style = code('../src/render/style.ts');
const playView = code('../src/render/playView.ts');

/** The cameras this game actually uses, measured (see `ballRadiusPx`'s note). */
const SHOT_CAMERAS = [0.5, 1.2, 2.6, 5.7];
const PUTT_CAMERAS = [7.6, 11, 17.1, 35];

describe('the drawn cup', () => {
  it('is never smaller than the ball that drops into it — at the cameras you hole out at', () => {
    // The original bug, stated as a property: a hole you can hide behind the ball cannot be seen to
    // be holed. It belongs to the PUTT cameras, which is where a ball is watched dropping in.
    //
    // It is deliberately NOT asserted for the shot cameras any more (GS-cup-oversize). Holding it
    // there needed a floor of `ball × 1.6`, and below ~4 px/yd that floor was what won — drawing a
    // cup up to 6x the radius that actually catches. See the reverse-lie case below: the two cannot
    // both be had, because the BALL has a hard 2.25px floor of its own.
    for (const s of PUTT_CAMERAS) {
      expect(cupRadiusPx(s), `cup vanishes under the ball at ${s} px/yd`).toBeGreaterThan(ballRadiusPx(s, 0));
    }
  });

  it('IS A HOLE, NOT THE CATCH RADIUS DRAWN — the chip and green cameras roughly halve', () => {
    // GS-cup-real. `HOLE_OUT_RADIUS` is 1.2 YARDS — a generosity in the rules, about twenty times a
    // real hole — and drawing it made a crater: "way too large in chipping and chip watch view…
    // probably twice as large as it should be in green and green make view". It was pinned to the
    // catch radius only because a ball could be HOLED while drawn lying outside the cup; every path
    // now finishes IN the cup (`finishInCup`), so the drawn hole is free to be a hole.
    //
    // Pinned as the shipped curve, and stated in YARDS as well, which is the number that says what
    // the player is looking at: 2.4yd wide at range (the catch radius still binds out there — see
    // GS-cup-oversize) down to 0.29yd at a tap-in. You zoom in to see closer to the truth.
    const widthYd = (s: number): number => +((2 * cupRadiusPx(s)) / s).toFixed(2);
    expect(PUTT_CAMERAS.map((s) => +cupRadiusPx(s).toFixed(2))).toEqual([3.55, 4.07, 4.79, 5]);
    expect(PUTT_CAMERAS.map(widthYd)).toEqual([0.94, 0.74, 0.56, 0.29]);
    // The two reported cameras, against what they used to draw.
    expect(+cupRadiusPx(5.7).toFixed(2), 'the chip camera').toBe(3.2); // was 6.84
    expect(+cupRadiusPx(11).toFixed(2), 'the green camera').toBe(4.07); // was 8.21
    // …and the fairway, which was only "slightly" too large and correspondingly barely moves.
    expect(+cupRadiusPx(2).toFixed(2), 'the fairway camera').toBe(1.95); // was 2.4
  });

  it('leaves the far cameras alone — out there the catch radius is still what binds', () => {
    // Below ~2 px/yd the cup is under a couple of pixels and the CEILING is what decides it, exactly
    // as GS-cup-oversize left it. From 300 yards you should not be able to see the hole; the flag is
    // what marks the pin at that range.
    // The crossover is ~1.35 px/yd; past it the cup's own curve is the smaller of the two and wins.
    for (const s of [0.5, 1, 1.3]) {
      expect(cupRadiusPx(s), `the catch radius no longer binds at ${s} px/yd`).toBeCloseTo(HOLE_OUT_RADIUS * s, 9);
    }
  });

  it('tracks the catch radius but is bounded by it, not equal to it — and that is a finding', () => {
    // MEASURED, and worth writing down: at every putt camera the honest 1.2yd catch radius is MORE
    // than the proportion cap, so the cap always bites. At 7.6 px/yd the two are within 2% (9.12
    // honest vs 8.93 drawn), but by 11 px/yd the honest radius is over 4x the drawn ball — a crater
    // with a marble in it.
    //
    // That is not a bug in this function, it is what `HOLE_OUT_RADIUS = 1.2` yards MEANS: about ten
    // times a real hole. So the drawn cup can be made to contain the ball (it now is) but cannot be
    // made to equal the catch radius without looking absurd. Closing that last gap is a BALANCE
    // change — shrinking the catch radius, through the death-spiral harness (contract 4) — and is
    // deliberately not smuggled in behind a render fix.
    // It must never be drawn LARGER than the radius that catches — a cup you can visibly miss and
    // still hole is the complaint; a cup bigger than the catch radius is the reverse lie.
    //
    // ⚠️ THIS RULE WAS WRITTEN HERE BEFORE IT WAS TRUE, AND ONLY CHECKED WHERE IT ALREADY HELD.
    // It ran over PUTT_CAMERAS alone — the cameras where the proportion cap binds and the rule is
    // satisfied for free. Every SHOT camera broke it: the `ball × 1.6` floor drew the cup at 6.00x
    // the catch radius on the whole-hole map, 2.50x at a long approach and 1.26x mid-approach, so
    // the ball's drawn centre could sit inside the hole while the sim correctly did not hole it —
    // "the ball will roll over the black circle and not go in" (GS-cup-oversize). Now enforced at
    // EVERY camera, which is what makes it a rule rather than a description.
    for (const s of [...SHOT_CAMERAS, ...PUTT_CAMERAS]) {
      expect(cupRadiusPx(s), `drawn cup exceeds the catch radius at ${s} px/yd`).toBeLessThanOrEqual(
        HOLE_OUT_RADIUS * s + 1e-9,
      );
    }
  });

  it('never becomes a crater — the ball-proportion cap still bounds it above', () => {
    for (const s of [...SHOT_CAMERAS, ...PUTT_CAMERAS]) {
      const ratio = cupRadiusPx(s) / ballRadiusPx(s, 0);
      expect(ratio, `cup is a crater at ${s} px/yd`).toBeLessThanOrEqual(CUP_MAX_RATIO + 1e-9);
    }
  });

  it('grows with the camera — a fixed-size cup is what this replaced', () => {
    const at = SHOT_CAMERAS.concat(PUTT_CAMERAS).map((s) => cupRadiusPx(s));
    for (let i = 1; i < at.length; i++) expect(at[i]!).toBeGreaterThanOrEqual(at[i - 1]!);
    expect(at[at.length - 1]!).toBeGreaterThan(at[0]! * 2);
  });

  it('THE FLAGSTICK IS A REAL PIN once the camera can see one — and unmoved at range', () => {
    // The other half of the report: "the flag also needs to be a bit bigger as we made the hole
    // bigger without making the flag bigger". It was a flat 14 units at every zoom, so on the green
    // the stick stood shorter than the hole beside it was wide. Read out of the built prims rather
    // than re-derived here, since the point is what the painter emits.
    const stickAt = (scale: number): number => {
      const hole = generateCourse(11, { holes: 1 }).holes[0]!;
      // A stub projector is enough: the flagstick reads `proj.scale` and nothing else about the view.
      const proj = {
        scale,
        project: (p: Vec): [number, number] => [p[0] * scale, p[1] * scale],
      } as unknown as Parameters<typeof buildScene>[1];
      const prims = buildScene(hole, proj, { width: 360, height: 640 });
      const line = prims.filter((p) => p.t === 'line' && p.stroke === '#1a1a1a').pop() as { a: Vec; b: Vec };
      return line.a[1] - line.b[1];
    };
    // Every fairway/approach camera is byte-for-byte the flag it has always been.
    for (const s of [0.5, 1.2, 2.6, 5.7]) expect(stickAt(s), `flag moved at ${s} px/yd`).toBe(14);
    // On the green it grows toward a real seven-foot pin, and stops before it becomes a mast.
    expect(stickAt(7.6)).toBeCloseTo(17.71, 2);
    expect(stickAt(11)).toBeCloseTo(25.63, 2);
    expect(stickAt(17.1)).toBe(30);
    expect(stickAt(35)).toBe(30);
    // …and it is always taller than the hole is wide, which is what it failed at before.
    for (const s of [...SHOT_CAMERAS, ...PUTT_CAMERAS]) {
      expect(stickAt(s), `the cup out-measures the pin at ${s} px/yd`).toBeGreaterThan(2 * cupRadiusPx(s));
    }
  });

  it('is read from the sim, never re-derived in a painter', () => {
    // The whole fault was two descriptions of one radius. `cupRadiusPx` is the seam; a painter
    // reaching for HOLE_OUT_RADIUS itself, or hard-coding a pin radius again, is the way back.
    expect(ball).toContain("import { HOLE_OUT_RADIUS } from '../sim/putting'");
    expect(style).toContain('cupRadiusPx(proj.scale)');
    expect(style, 'style.ts re-derives the cup instead of reading the seam').not.toContain('HOLE_OUT_RADIUS');
  });
});

describe('a hazard that swallows', () => {
  it('every penalty kind has decided whether it takes the ball', () => {
    // Compile-forced by `Record<PenaltyKind, PenaltyInfo>`; asserted here so the intent is readable.
    for (const [kind, info] of Object.entries(PEN_INFO)) {
      expect(typeof info.swallows, `${kind} has no swallow decision`).toBe('boolean');
    }
  });

  it('takes the ball where the ball would be gone, and leaves it where it would not', () => {
    const swallows = (k: PenaltyKind): boolean => PEN_INFO[k].swallows;
    // Under, burnt, or fallen away — you would not be looking at your ball.
    for (const k of ['water', 'lava', 'void', 'voidlost', 'cetuslost', 'ravine', 'lost'] as PenaltyKind[]) {
      expect(swallows(k), `${k} should take the ball`).toBe(true);
    }
    // Still lying there in plain sight; it is the STROKE that costs you, not the ball.
    for (const k of ['ob', 'unplayable'] as PenaltyKind[]) {
      expect(swallows(k), `${k} must NOT vanish the ball — it is visibly still there`).toBe(false);
    }
  });

  it('the play view asks the row rather than listing hazard names itself', () => {
    // Only the SWALLOW decision has to come from the row. The play view legitimately switches on
    // penalty names elsewhere to pick which FX plays (a lava burst is not a splash) — that is art
    // per hazard, a different question, and it is not a second description of this one.
    expect(playView).toContain('PEN_INFO[shot.penalty as PenaltyKind]?.swallows');
    const decision = playView.slice(playView.indexOf('const swallowed'), playView.indexOf('const swallowed') + 200);
    expect(decision, 'the swallow decision hard-codes hazard names').not.toMatch(/'(water|lava|void|ravine)'/);
  });

  it('a holed putt drops in rather than being cut mid-frame', () => {
    expect(playView).toContain('PUTT_DROP_FROM');
    // `ballRest` staying null for a holed putt is what stops it reappearing at rest afterwards.
    expect(playView).toContain('ballRest = putt.holed ? null : cur');
  });

  it('A HOLED PUTT FINISHES IN THE CUP — never resting beside it (GS-putt-holed-position)', () => {
    // THE reported bug, and the one the cup art was only a symptom of: the miss branch computed a
    // resting spot, then flagged `holed` if it happened to land inside the catch radius — WITHOUT
    // moving the ball there. So a ball could be drawn up to 1.2yd (9–20 screen px at the putt
    // camera) to one side of the hole and counted as in: "the hole here and the ball there".
    //
    // Asserted on the resolver's own output across a sweep, so it holds for every branch rather
    // than for the one line that was wrong.
    // `manualPutt` is the branch that was wrong — the player-controlled resolver. (`onePutt`, the
    // auto/Penelope path, already returned the pin and is swept here too for the same property.)
    const pin: Vec = [40, 60];
    let holedCount = 0;
    for (let i = 0; i < 600; i++) {
      const rng = makeRng(`cup-${i}`);
      const from: Vec = [40 + Math.cos(i) * (0.6 + (i % 17) * 0.5), 60 + Math.sin(i) * (0.6 + (i % 13) * 0.6)];
      const control = { pace: 0.55 + ((i * 7) % 90) / 100, aim: (((i * 11) % 40) - 20) / 12 };
      const p = i % 2 ? manualPutt(rng, from, pin, control) : onePutt(rng, from, pin);
      if (!p.holed) continue;
      holedCount++;
      expect(dist(p.to, pin), `holed putt rests ${dist(p.to, pin).toFixed(2)}yd from the cup`).toBeCloseTo(0, 9);
      // The drawn path has to arrive there too — a path that stops short re-creates the gap.
      const end = p.path?.[p.path.length - 1];
      if (end) expect(dist(end, pin)).toBeCloseTo(0, 9);
    }
    expect(holedCount, 'the sweep never holed a putt — it is proving nothing').toBeGreaterThan(5);
  });

  it('A HOLED SHOT FINISHES IN THE CUP TOO — the path that never got the rule (GS-cup-real)', () => {
    // The putt resolvers snapped to the pin (above) and the chip-in trickled into it, but an ORDINARY
    // shot resting inside HOLE_OUT_RADIUS was flagged holed and left lying where it stopped — up to
    // 1.2yd, which is 7–17 screen px at the cameras you watch it from. That is the same lie, and it
    // is the one that forced the cup to be drawn crater-sized to cover it.
    //
    // Swept over real generated holes, so it holds for whatever a shot actually does.
    let aces = 0;
    for (let seed = 0; seed < 400 && aces < 12; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const pin = pinOf(hole);
      for (const s of playHole(hole, new Rng(`${seed}:play`)).shots) {
        if (!s.holed) {
          // The converse: an unholed shot must NOT be sitting in the cup.
          expect(dist(s.rest, pin), 'an unholed shot rests in the hole').toBeGreaterThan(1e-9);
          continue;
        }
        aces++;
        expect(dist(s.rest, pin), `holed shot rests ${dist(s.rest, pin).toFixed(2)}yd from the cup`).toBeCloseTo(0, 9);
        // The drawn walk has to arrive there as well, or the ball stops short and the hole-out fires
        // on bare ground (the GS-chipin-roll lesson, which is why both branches share one seam).
        const end = s.rollPath?.[s.rollPath.length - 1];
        if (end) expect(dist(end, pin)).toBeCloseTo(0, 9);
        // A ball that trickled in went FORWARD into the hole; a "−4yd check" on it is neither true
        // nor drawable.
        expect(s.roll).toBeGreaterThanOrEqual(0);
      }
    }
    expect(aces, 'the sweep never holed a shot — it is proving nothing').toBeGreaterThan(3);
  });
});
