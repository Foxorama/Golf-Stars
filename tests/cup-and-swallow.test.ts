import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ballRadiusPx, cupRadiusPx, CUP_MIN_RATIO, CUP_MAX_RATIO } from '../src/render/ball';
import { HOLE_OUT_RADIUS, manualPutt, onePutt } from '../src/sim/putting';
import { makeRng } from '../src/sim/rng';
import { dist, type Vec } from '../src/sim/course/contract';
import { PEN_INFO, type PenaltyKind } from '../src/sim/shot';

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
  it('is never smaller than the ball that drops into it — at any camera', () => {
    // The bug, stated as a property. A hole you can hide behind the ball cannot be seen to be holed.
    for (const s of [...SHOT_CAMERAS, ...PUTT_CAMERAS]) {
      expect(cupRadiusPx(s), `cup vanishes under the ball at ${s} px/yd`).toBeGreaterThan(ballRadiusPx(s, 0));
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
    // still hole is the complaint; a cup bigger than the catch radius would be the reverse lie.
    for (const s of PUTT_CAMERAS) {
      expect(cupRadiusPx(s), `drawn cup exceeds the catch radius at ${s} px/yd`).toBeLessThanOrEqual(
        HOLE_OUT_RADIUS * s + 1e-9,
      );
    }
  });

  it('stays in proportion to the ball rather than becoming a crater', () => {
    for (const s of [...SHOT_CAMERAS, ...PUTT_CAMERAS]) {
      const ratio = cupRadiusPx(s) / ballRadiusPx(s, 0);
      expect(ratio).toBeGreaterThanOrEqual(CUP_MIN_RATIO - 1e-9);
      expect(ratio).toBeLessThanOrEqual(CUP_MAX_RATIO + 1e-9);
    }
  });

  it('grows with the camera — a fixed-size cup is what this replaced', () => {
    const at = SHOT_CAMERAS.concat(PUTT_CAMERAS).map((s) => cupRadiusPx(s));
    for (let i = 1; i < at.length; i++) expect(at[i]!).toBeGreaterThanOrEqual(at[i - 1]!);
    expect(at[at.length - 1]!).toBeGreaterThan(at[0]! * 2);
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
});
