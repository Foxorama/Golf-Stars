import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  advanceFlightSpin,
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

describe('ball size (the camera decides, within limits)', () => {
  it('floors at the OLD fixed radius on the whole-hole map, so that view is unchanged', () => {
    // The map runs at ~1 px/yard. Before this feature every ball everywhere was exactly 3px.
    expect(ballRadiusPx(0.6)).toBe(3);
    expect(ballRadiusPx(1)).toBe(3);
    expect(ballRadiusPx(2.4)).toBe(3);
  });

  it('grows at the chip/putt camera — which is the whole point of zooming in', () => {
    // ~6.6 px/yard is the chip/putt camera (GS-green-complex measured it). A ball you can see
    // turning needs surface detail, and surface detail needs pixels.
    const putt = ballRadiusPx(6.6);
    expect(putt).toBeGreaterThan(ballRadiusPx(1));
    expect(putt).toBeGreaterThanOrEqual(DEFAULT_BALL_FEEL.dimpleMinPx);
  });

  it('caps, so a deep zoom draws a golf ball and not a beachball', () => {
    expect(ballRadiusPx(40)).toBe(DEFAULT_BALL_FEEL.ballMaxPx);
    expect(ballRadiusPx(1000)).toBe(DEFAULT_BALL_FEEL.ballMaxPx);
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
    for (const pxPerYard of [1, 6.6]) {
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

  it('the shadow tightens as the ball comes down and fades as it climbs', () => {
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
    expect(apex.fillAlphas[0]!).toBeLessThan(0.12);
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
