import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  advanceFlightSpin,
  ballSVG,
  advanceRollPhase,
  ballRadiusPx,
  ballSkinFor,
  drawBall,
  drawBallShadow,
  BALL_SKINS,
  DEFAULT_BALL_FEEL,
} from '../src/render/ball';

/**
 * The ball (GS-ball-art).
 *
 * The report was "the ball is a pure white circle with no rolling animation" and "there is no
 * bounce". Both were true and both came from the same three lines: `ctx.arc(x, y, 3)` filled `#fff`.
 * A featureless disc cannot show rotation, and a 3px disc rising 1.5px off a static shadow cannot
 * show height — the run-out model had been hopping the whole time, invisibly.
 *
 * The geometry and the spin maths are pure, so they are pinned here rather than eyeballed. The
 * painter is exercised through a recording 2D context, which is enough to assert the two properties
 * that actually matter: that surface detail EXISTS at the sizes the game draws, and that it MOVES
 * with the phase (a rotation that doesn't move the pixels is not a rotation).
 */

/** A 2D context that records the calls we care about — enough to see what was drawn, and where. */
function recordingCtx(): {
  ctx: CanvasRenderingContext2D;
  arcs: { x: number; y: number; r: number }[];
  fillAlphas: number[];
  fills: number;
  strokes: number;
} {
  const arcs: { x: number; y: number; r: number }[] = [];
  const fillAlphas: number[] = [];
  let fills = 0;
  let strokes = 0;
  const noop = (): void => undefined;
  const ctx = {
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: () => { fills++; fillAlphas.push((ctx as { globalAlpha: number }).globalAlpha); },
    stroke: () => { strokes++; },
    arc: (x: number, y: number, r: number) => { arcs.push({ x, y, r }); },
    ellipse: (x: number, y: number, r: number) => { arcs.push({ x, y, r }); },
    createRadialGradient: () => ({ addColorStop: noop }),
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
  } as unknown as CanvasRenderingContext2D;
  return { ctx, arcs, fillAlphas, fills, strokes };
}

/**
 * The cameras the game actually uses, measured by playing one hole out at 390x844: the shot views run
 * 0.53–5.7 px/yard, the putt views 7.6–17.1, and a tap-in reaches ~35.
 */
const MAP_CAMS = [0.53, 1.83];
const SHOT_CAMS = [2.56, 3.41, 5.7];
const PUTT_CAMS = [7.56, 10.95, 17.1, 35];

describe('ball size (the camera decides, within limits)', () => {
  it('sits on the OLD fixed radius at the whole-hole cameras, so that view is unchanged', () => {
    // Before this feature every ball everywhere was exactly 3px — so the whole-hole view has to land
    // back on it to within a fraction of a pixel, or the map people already know changes under them.
    for (const px of MAP_CAMS) {
      expect(ballRadiusPx(px), `${px} px/yd`).toBeGreaterThanOrEqual(3);
      expect(ballRadiusPx(px), `${px} px/yd`).toBeLessThan(3.15);
    }
  });

  it('grows at the chip/putt camera — which is the whole point of zooming in', () => {
    const putt = ballRadiusPx(7.56);
    expect(putt).toBeGreaterThan(ballRadiusPx(1.83));
    // Dimples arrive a little further in than the shallowest putt camera now that the ball is smaller
    // ("it looks like a tennis ball and not a golf ball when doing wedges and putters"); the band and
    // the mark carry the rotation below that, which is what they are for.
    expect(ballRadiusPx(17.1)).toBeGreaterThanOrEqual(DEFAULT_BALL_FEEL.dimpleMinPx);
  });

  it('keeps growing all the way in — a tap-in draws a bigger ball than a 20-footer', () => {
    // The first cut grew LINEARLY and hit its cap by 7.5 px/yd, so every putt in the game drew the
    // same maximum ball: too big AND flat, which loses the size cue exactly where the player is
    // studying the ground. Sub-linear growth keeps the cue without the bulk.
    const rs = PUTT_CAMS.map((px) => ballRadiusPx(px));
    for (let i = 1; i < rs.length; i++) {
      expect(rs[i]!, `${PUTT_CAMS[i]} vs ${PUTT_CAMS[i - 1]} px/yd`).toBeGreaterThan(rs[i - 1]!);
    }
  });

  it('never gets big enough to swamp the scene it sits in', () => {
    // The fixed-size markers around it: the tee dot is r5 and the flagstick is 14 units tall. The
    // reported "really big balls" was an 18px-wide ball on a green — taller than the whole flagstick.
    for (const px of [...SHOT_CAMS, ...PUTT_CAMS, 60, 1000]) {
      expect(ballRadiusPx(px), `${px} px/yd`).toBeLessThanOrEqual(5.5);
    }
    expect(ballRadiusPx(1000)).toBe(DEFAULT_BALL_FEEL.ballMaxPx);
  });

  it('the EXAGGERATION shrinks as you zoom in — you zoom to see closer to the truth', () => {
    // A real ball is 0.0467yd across. The drawn ball is always oversized; what matters is that the
    // overstatement gets smaller the closer the camera gets, not larger.
    const over = (px: number): number => (ballRadiusPx(px) * 2) / px / 0.0467;
    expect(over(17.1)).toBeLessThan(over(5.7));
    expect(over(5.7)).toBeLessThan(over(1.83));
  });

  it('is bigger at the flight apex than on the deck (it reads as nearer the camera)', () => {
    expect(ballRadiusPx(6.6, 1)).toBeGreaterThan(ballRadiusPx(6.6, 0));
  });
});

describe('roll (measured in screen distance, deliberately)', () => {
  it('a ball that is not moving does not turn — the two stop together', () => {
    // This is the property that sells a run-out settling. It is free here because the phase is
    // driven by the ball's own displacement rather than by a clock.
    expect(advanceRollPhase(1.234, 0, 8)).toBe(1.234);
    expect(advanceRollPhase(1.234, -0, 8)).toBe(1.234);
  });

  it('rolls without slipping: dtheta = ds / r', () => {
    expect(advanceRollPhase(0, 2, 8)).toBeCloseTo(0.25, 6);
    // …so the SAME screen movement turns a small ball further than a big one.
    expect(advanceRollPhase(0, 2, 4)).toBeGreaterThan(advanceRollPhase(0, 2, 8));
  });

  it('caps the step, or a fast frame aliases the direction backwards', () => {
    const step = advanceRollPhase(0, 10_000, 3);
    expect(step).toBe(DEFAULT_BALL_FEEL.spinMaxStep);
    // Below the classic wagon-wheel threshold for a 26-dimple field.
    expect(DEFAULT_BALL_FEEL.spinMaxStep).toBeLessThan(0.7);
  });

  it('a whole run-out turns a readable number of times at BOTH camera extremes', () => {
    // The failure modes on either side: too few turns and the ball is a sliding disc (the bug this
    // fixes), too many and it strobes. Walk a 40-yard run-out at 60fps at the map camera and at the
    // chip camera and assert both land in the band.
    for (const pxPerYard of [1.83, 17.1]) {
      const r = ballRadiusPx(pxPerYard);
      const totalPx = 40 * pxPerYard;
      let phase = 0;
      const frames = 60;
      for (let i = 0; i < frames; i++) phase = advanceRollPhase(phase, totalPx / frames, r);
      const turns = phase / (Math.PI * 2);
      expect(turns, `${pxPerYard} px/yd turned ${turns.toFixed(1)}x`).toBeGreaterThan(0.5);
      expect(turns, `${pxPerYard} px/yd turned ${turns.toFixed(1)}x`).toBeLessThan(12);
    }
  });

  it('a struck ball in the air carries BACKspin, on a clock and not on displacement', () => {
    // Screen displacement during flight is tens of radians a frame, and forwards — i.e. topspin,
    // which is both wrong and unwatchable.
    expect(advanceFlightSpin(0, 16)).toBeLessThan(0);
    expect(advanceFlightSpin(0, 32)).toBeCloseTo(advanceFlightSpin(0, 16) * 2, 6);
    expect(advanceFlightSpin(5, 0)).toBe(5);
  });
});

describe('the painter', () => {
  it('draws dimples once the ball is big enough to hold them, and not before', () => {
    const small = recordingCtx();
    drawBall(small.ctx, 50, 50, 3, { skin: BALL_SKINS.classic });
    const big = recordingCtx();
    drawBall(big.ctx, 50, 50, 8, { skin: BALL_SKINS.classic });
    // A 3px ball is the body + the rim; an 8px one carries a dimple field on top.
    expect(big.arcs.length).toBeGreaterThan(small.arcs.length + 10);
  });

  it('the surface MOVES with the phase — a rotation that draws the same pixels is not one', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawBall(a.ctx, 50, 50, 8, { phase: 0, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    drawBall(b.ctx, 50, 50, 8, { phase: 1.1, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    const key = (c: typeof a): string => c.arcs.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
    expect(key(a)).not.toBe(key(b));
  });

  it('a full turn comes back to where it started', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    drawBall(a.ctx, 50, 50, 8, { phase: 0.4, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    drawBall(b.ctx, 50, 50, 8, { phase: 0.4 + Math.PI * 2, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    expect(a.arcs.length).toBe(b.arcs.length);
    a.arcs.forEach((p, i) => {
      expect(p.x).toBeCloseTo(b.arcs[i]!.x, 6);
      expect(p.y).toBeCloseTo(b.arcs[i]!.y, 6);
    });
  });

  it('detail crosses the ball along the direction of TRAVEL, not always rightwards', () => {
    // Roll direction comes from the ball's own screen motion, so a ball running down the screen must
    // turn about a different axis than one running across it.
    const across = recordingCtx();
    const down = recordingCtx();
    drawBall(across.ctx, 50, 50, 8, { phase: 0.9, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    drawBall(down.ctx, 50, 50, 8, { phase: 0.9, dirX: 0, dirY: 1, skin: BALL_SKINS.classic });
    const key = (c: typeof across): string => c.arcs.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|');
    expect(key(across)).not.toBe(key(down));
  });

  it('the shadow is OFFSET so it is not hidden under the ball', () => {
    // The first version drew it concentric with the ball at the same radius, so on the ground — which
    // is most of a run-out — the ball covered it completely. The report was "I can't see any shadows
    // at all"; they were being drawn the whole time, underneath the ball.
    const on = recordingCtx();
    drawBallShadow(on.ctx, 50, 50, 6, 0);
    expect(on.arcs.length).toBe(1);
    const sh = on.arcs[0]!;
    expect(Math.hypot(sh.x - 50, sh.y - 50), 'shadow sits exactly under the ball').toBeGreaterThan(1);
    // It peeks out from UNDER the ball on the offset, not by being bigger — an oversized shadow was
    // the next report ("the shadow is too large"), so it now sits just inside the ball's own radius.
    expect(sh.r, 'shadow is a puddle, not a pool').toBeLessThan(6);
    expect(sh.r).toBeGreaterThan(3);
  });

  it('the shadow spreads as the ball climbs and fades with it', () => {
    const low = recordingCtx();
    const high = recordingCtx();
    drawBallShadow(low.ctx, 50, 50, 6, 0);
    drawBallShadow(high.ctx, 50, 50, 6, 30);
    expect(low.arcs[0]!.r).toBeLessThan(high.arcs[0]!.r); // spreads with height
    expect(low.fillAlphas[0]!).toBeGreaterThan(high.fillAlphas[0]!); // …and fades with it
    // It never disappears entirely, on purpose: a faint mark under a ball in the air is the only
    // thing telling you WHERE over the ground it is. It just stops competing with the ball.
    const apex = recordingCtx();
    drawBallShadow(apex.ctx, 50, 50, 6, 100_000);
    expect(apex.fillAlphas[0]!).toBeLessThan(0.2);
    expect(apex.fillAlphas[0]!).toBeGreaterThan(0);
  });

  it('is deterministic — no rng anywhere near the ball', () => {
    // The scene is camera-proof (tests/camera-stability.test.ts) because nothing in it draws off an
    // unseeded source. The ball is redrawn every frame from a rebuilt projection; a `Math.random`
    // dimple field would shimmer.
    const src = readFileSync(resolve(__dirname, '../src/render/ball.ts'), 'utf8');
    expect(src).not.toContain('Math.random');
  });
});

describe('ball skins are content-as-data', () => {
  it('no ball equipped ⇒ the plain white classic (nothing the player has changes)', () => {
    expect(ballSkinFor(undefined)).toBe(BALL_SKINS.classic);
    expect(ballSkinFor({})).toBe(BALL_SKINS.classic);
  });

  it('an equipped Story BALL dresses the ball AND its trail from the one row', () => {
    // The tracer already coloured the flight trail (GS-story-avatar). One cosmetic, both ends of the
    // shot — not a trail plus a second unrelated purchase.
    const skin = ballSkinFor({ ballTracer: { shape: 'comet', color: '#ff8a3d', glow: '#ffb347' } });
    expect(skin.band).toBe('#ff8a3d');
    expect(skin.glow).toBe('#ffb347');
    expect(skin.cover).toBe(BALL_SKINS.comet.cover);
  });

  it('an unknown tracer style still resolves — a NEW tracer row needs no edit here', () => {
    const skin = ballSkinFor({ ballTracer: { shape: 'something-new', color: '#123456' } });
    expect(skin.cover).toBeTruthy();
    expect(skin.band).toBe('#123456');
  });

  it('every catalogue cover is complete enough to draw', () => {
    for (const [id, s] of Object.entries(BALL_SKINS)) {
      expect(s.cover, id).toMatch(/^#/);
      expect(s.shade, id).toMatch(/^#/);
      expect(s.dimple, id).toMatch(/^#/);
    }
  });
});

describe('the RESTING ball on the aim map (the same ball, in SVG)', () => {
  // The animated ball was dimpled from day one and the aim screen — where the player actually spends
  // their time looking at it — kept a bare `<circle r="4" fill="#fff">`. You lined a shot up with a
  // plain white dot, watched a dimpled ball fly, and got the dot back at rest, so as far as the player
  // was concerned the cosmetic did not exist.
  it('wears the cover: dimples, the band and the mark, not a white disc', () => {
    const svg = ballSVG(50, 50, ballRadiusPx(17.1), BALL_SKINS.classic);
    expect(svg).toContain(BALL_SKINS.classic.cover);
    expect(svg).toContain(BALL_SKINS.classic.dimple);
    expect(svg).toContain(BALL_SKINS.classic.band!);
    expect(svg).toContain(BALL_SKINS.classic.mark!);
  });

  it('shows the equipped cosmetic, so a Story ball is visible while you AIM it', () => {
    const skin = ballSkinFor({ ballTracer: { shape: 'ember', color: '#ff4c22', glow: '#ff6a2a' } });
    const svg = ballSVG(50, 50, 5, skin);
    expect(svg).toContain('#ff4c22');
    expect(svg).toContain('#ff6a2a');
  });

  it('agrees with the CANVAS ball on where every surface feature sits', () => {
    // Both emitters go through the one `surfaceProjector` + the one `DIMPLES` field, so this is a
    // structural guarantee rather than a coincidence — but it is the guarantee worth pinning, because
    // a divergence would show as the ball changing pattern the instant the swing starts.
    const r = 5.2;
    const canvas = recordingCtx();
    drawBall(canvas.ctx, 50, 50, r, { phase: 0, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    const svg = ballSVG(50, 50, r, BALL_SKINS.classic);
    const svgPts = [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)"/g)].map((m) => `${m[1]},${m[2]}`);
    const canvasPts = new Set(canvas.arcs.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    // Every dimple/mark the SVG places is one the canvas places too (the SVG adds its own two-circle
    // sphere body, which the canvas does with a gradient instead).
    const shared = svgPts.filter((p) => canvasPts.has(p));
    expect(shared.length).toBeGreaterThan(8);
  });

  it('emits no SVG ids — several hole SVGs share one document', () => {
    // `holeIdPrefix` exists because ids are document-global and the gallery/test hub put many hole
    // SVGs on one page; a gradient id here would make every ball reference the first panel's.
    expect(ballSVG(50, 50, 5, BALL_SKINS.comet)).not.toMatch(/\bid=/);
    expect(ballSVG(50, 50, 5, BALL_SKINS.comet)).not.toContain('url(#');
  });
});
