/**
 * The golf BALL — a dimpled, lit sphere that visibly ROLLS, plus the ground shadow that sells its
 * height (GS-ball-art).
 *
 * Before this the ball was `ctx.arc(x, y, 3)` filled `#fff`, at three sites, at a FIXED three screen
 * pixels whatever the camera was doing. Two things followed from that, and both were reported:
 *
 *  1. **It never looked like it was rolling**, because a featureless disc cannot. Rotation is only
 *     visible if there is surface detail to rotate, and at 3px there is nowhere to put any.
 *  2. **The bounce was invisible.** A 3px disc that moves 1.5px further up the screen is not a hop —
 *     with no shadow separating "the ball" from "the ground under the ball", height simply doesn't
 *     read. The run-out model was hopping the whole time; you could not see it.
 *
 * ### Size: the ball grows with the camera, within limits
 *
 * A real ball is 0.0467yd across — at the chip/putt camera (~6.6 px/yd) that is a third of a pixel,
 * which is why it was drawn at a fixed size in the first place. But a fixed size means the ball is
 * the SAME dot on the whole-hole map and in a two-foot putt, so zooming in never shows you more.
 * `ballRadiusPx` scales with the projector's px-per-yard around a deliberately exaggerated ball
 * diameter, floored (so the whole-hole map barely moves) and capped so a deep zoom doesn't put a
 * beachball on the green.
 *
 * **EVERY LENGTH ON THE DRAWN BALL IS ONE SCALE, AND THE WHOLE OF IT MOVES TOGETHER.** The size has
 * been reported too big twice; the second time — *"it looks like a tennis ball and not a golf ball…
 * especially on greens, compared to the hole/flag it's a beachball"* — asked for 75%, and the only
 * honest way to give it is to take 75% off the radius curve AND off every absolute ink width that
 * rides on it: the rim hairline, the band, the dimple and mark floors, the aura's outset. Scale the
 * curve alone and the ball gets 25% smaller while its outline, band and glow stay put, so it reads
 * as a MUDDIER ball rather than a smaller one (a 1px rim on a 4.5px ball is a third of it), and the
 * apparent radius — `r + half the rim` — lands short of the 75% asked for. Scaling the feature-onset
 * thresholds by the same factor is what keeps it the SAME ball: the cameras at which dimples, band
 * and mark arrive come out unchanged (8.9 / always / 3.6 px per yard), just drawn smaller.
 *
 * ### Rotation: measured in SCREEN distance, deliberately
 *
 * Everywhere else in this renderer the rule is "measure in yards, never pixels" (GS-green-complex).
 * Roll is the exception, and for a reason: rolling without slipping is `dθ = ds / r`, and BOTH of
 * those are properties of the ball AS DRAWN. Use course yards and a real ball radius and you get 68
 * revolutions per 10 yards — a strobing grey blur at any frame rate. Use the drawn radius and the
 * drawn displacement and the ball turns exactly as fast as it looks like it should, at every zoom,
 * with no per-camera tuning. The step is capped so a fast frame can't alias the direction away.
 *
 * The direction falls out of the ball's own screen motion, which means the two things that matter
 * are free: the ball stops turning the instant it stops moving, and a backspin check turns it
 * BACKWARDS on the way home without a special case.
 *
 * Pure except for `draw*` (which take a 2D context and touch nothing else) — the geometry and the
 * spin maths are node-testable, and the skins are content-as-data, so a ball cosmetic is a ROW.
 */

// The cup's catch radius comes from the SIM, never a number copied over here — see `cupRadiusPx`.
// putting.ts is pure and node-safe (contract / contour / rng only), so ball.ts stays node-testable.
import { HOLE_OUT_RADIUS } from '../sim/putting';

/** A ball's look. Content-as-data: a new cosmetic ball is a new row, never a painter edit. */
export interface BallSkin {
  /** Cover colour — the lit side of the sphere. */
  cover: string;
  /** Shaded side, blended in from the lower-right (matches the scene's `LIGHT_UL`). */
  shade: string;
  /** Dimple tone. Drawn as pocks over the cover once the ball is big enough to hold them. */
  dimple: string;
  /** Alignment band around the equator — the single strongest rolling cue at small sizes. */
  band?: string;
  /** Maker's mark: one dot that tumbles over the horizon and back, which reads as rotation even
   *  when the dimples are too small to draw. */
  mark?: string;
  /** Legendary aura. */
  glow?: string;
}

export type BallSkinId = 'classic' | 'range' | 'tour' | 'comet' | 'ember' | 'void' | 'rainbow';

/**
 * The catalogue. `classic` is the ship default and is deliberately the plain white ball — this
 * feature is about making the ball READ, not about changing what the player already has.
 */
export const BALL_SKINS: Record<BallSkinId, BallSkin> = {
  classic: { cover: '#ffffff', shade: '#b9c1cf', dimple: '#b9c4d4', band: '#e6303a', mark: '#2b3450' },
  range: { cover: '#f4f0dc', shade: '#aca386', dimple: '#cdc4a4', band: '#3d5c2a', mark: '#3d5c2a' },
  tour: { cover: '#fdfdff', shade: '#aebdd4', dimple: '#c6d4e8', band: '#1f6fd0', mark: '#0d2444' },
  comet: { cover: '#fff3d0', shade: '#c78d2e', dimple: '#efcf83', band: '#ff8a3d', mark: '#7a3a06', glow: '#ffb347' },
  ember: { cover: '#ffd9c2', shade: '#9c3218', dimple: '#e5a684', band: '#ff4c22', mark: '#4d1206', glow: '#ff6a2a' },
  void: { cover: '#c9c2ee', shade: '#33245c', dimple: '#9182d2', band: '#7a5cff', mark: '#eae4ff', glow: '#8b6bff' },
  rainbow: { cover: '#fff2fb', shade: '#8f6cc8', dimple: '#e8bde0', band: '#ff5fd0', mark: '#2ad4c8', glow: '#ff8ae0' },
};

export const DEFAULT_BALL_SKIN = BALL_SKINS.classic;

/** Feel knobs, spread into `_gsFeel` by the play view like `RunoutFeel` — no new top-level hook. */
export interface BallFeel {
  /**
   * How fast the drawn ball grows with the camera, as a coefficient on `sqrt(px per yard)`.
   *
   * Growth is SUB-LINEAR on purpose. A real ball is 0.047yd, so every camera in the game draws it
   * oversized and the only question is by how much. Linear growth (the first cut) put the ball on its
   * cap for EVERY putt — the measured putt cameras run 7.6–35 px/yd — which was both too big (18px
   * across, taller than the whole flagstick marker) and flat, so zooming from a 20-yarder to a tap-in
   * showed no change. A sqrt curve keeps giving a size cue all the way in while the EXAGGERATION
   * shrinks as you zoom, which is the right direction: you zoom in to see closer to the truth.
   */
  ballGrowth: number;
  /** px-per-yard below which the ball stays on its floor — the whole-hole map. */
  ballGrowFrom: number;
  /** Screen-radius floor and cap. Both are measured against the fixed-size scene markers the ball
   *  sits among: the tee dot is r5, the flagstick 14 units tall and the pin's base shadow r2.2. At
   *  the old r4.4 cap the ball was TWICE the width of the cup marker it was rolling at — "compared
   *  to the hole/flag it's a beachball" — so the cap sits at r3.3, a ball a little wider than the
   *  cup and under half the height of the stick behind it. */
  ballMinPx: number;
  ballMaxPx: number;
  /** Extra radius at the flight apex, as a fraction — the ball reads as nearer the camera up there. */
  ballLoftGrow: number;
  /** Largest rotation step per frame (radians). Above ~0.6 the dimple pattern aliases and the ball
   *  looks like it is turning the wrong way. */
  spinMaxStep: number;
  /** Steady backspin (rad/s) while the ball is in the AIR on its flight. A struck ball spins back;
   *  screen displacement would say "topspin at 40 rad/frame", which is neither true nor readable. */
  flightSpinRate: number;
  /** Below this radius the dimples are skipped (they'd be sub-pixel mud) and the band + mark carry
   *  the rotation on their own. */
  dimpleMinPx: number;
}

export const DEFAULT_BALL_FEEL: BallFeel = {
  ballGrowth: 0.225,
  ballGrowFrom: 1.8,
  ballMinPx: 2.25,
  ballMaxPx: 3.3,
  ballLoftGrow: 0.5,
  spinMaxStep: 0.55,
  flightSpinRate: 9,
  dimpleMinPx: 2.85,
};

/**
 * The radii the band and the mark arrive at, shared by the canvas painter and the SVG one — one
 * description each, or the resting ball can wear a feature the flying ball doesn't. Both are on the
 * same scale as the size curve above: they are stated as radii, so a change to how big the ball is
 * drawn moves them with it and the CAMERA each feature arrives at stays put.
 */
const BAND_MIN_PX = 1.95;
const MARK_MIN_PX = 2.55;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * Drawn ball radius (px). `pxPerYard` is the projector's scale; `loft` is 0 on the deck and 1 at the
 * flight apex.
 *
 * Measured cameras, for reference (390x844, one full hole played out): the shot views run 0.5–5.7
 * px/yd and the putt views 7.6–17.1, with a tap-in reaching ~35. Sub-linear growth means the ball is
 * still visibly bigger on a tap-in than on a 20-footer, without ever getting near the size where it
 * swamps the cup it is rolling at.
 */
export function ballRadiusPx(pxPerYard: number, loft = 0, feel: BallFeel = DEFAULT_BALL_FEEL): number {
  const grown = feel.ballMinPx + feel.ballGrowth * Math.sqrt(Math.max(0, pxPerYard - feel.ballGrowFrom));
  const base = clamp(grown, feel.ballMinPx, feel.ballMaxPx);
  return base * (1 + clamp(loft, 0, 1) * feel.ballLoftGrow);
}

/**
 * THE CUP IS DRAWN FROM THE RADIUS THAT ACTUALLY CATCHES THE BALL (GS-cup-scale).
 *
 * The comment on `ballRadiusPx` above promises the ball never gets "near the size where it swamps
 * the cup it is rolling at". It was swamping it: there was no cup. The pin drew a `r: 2.2` base
 * SHADOW and a flagstick, at a fixed size that did not scale with the camera, while the ball at the
 * putt camera is drawn at up to 3.3 — so **the ball was bigger than the hole it dropped into**, and
 * a holed putt read as a ball parked on top of a dot. That is both halves of the report: "the hole
 * can be a little bigger" and "the ball often kind of misses the hole, but still sinks".
 *
 * `HOLE_OUT_RADIUS` is the sim's own catch radius, and nothing in `src/render/` read it — a fact
 * described twice, which is contract 5's whole subject (the graphic IS the physics). It is read
 * here now, scaled in YARDS like every other ground measurement (GS-green-complex), and bounded
 * against the DRAWN ball rather than in raw px:
 *
 *  - **Floor** `ball × CUP_MIN_RATIO` — on the whole-hole map 1.2yd is under a pixel, and a cup you
 *    cannot see is a pin you cannot find. Never smaller than the ball, which was the bug.
 *  - **Cap** `ball × CUP_MAX_RATIO` — the ball itself is drawn well oversized (a real ball is a
 *    third of a pixel at the putt camera), so an honest 1.2yd cup at a tap-in zoom would be a
 *    crater with a marble beside it. Capping in proportion to the ball keeps ONE exaggeration
 *    rather than two disagreeing ones, and lands near real golf, where a ball is about 0.36 of the
 *    cup's radius.
 *
 * At the ordinary putt cameras (7.6–17 px/yd) the honest value wins and the drawn cup IS the catch
 * radius; only the extreme tap-in zoom reaches the cap.
 */
/** Real golf: a ball's radius is about 0.36 of the cup's, i.e. the cup is ~2.8x the ball. Drawn at
 *  3.2 it read as a crater sticker on the green; at the real ratio it reads as a hole. */
export const CUP_MAX_RATIO = 2.8;

/**
 * ⚠️ THERE IS NO FLOOR, AND THAT IS THE POINT (GS-cup-oversize).
 *
 * There used to be one — `ball × 1.6`, so the cup could never be drawn smaller than the ball. It
 * reads as the safe direction and it is not: below ~4 px/yd the floor is what wins, so the drawn cup
 * grew to **3x the catch radius on the whole-hole map and 1.6x at a mid approach**. A circle wider
 * than the radius that catches means the ball's drawn centre can sit INSIDE the hole while the sim
 * correctly does not hole it — the ball rolls over the black circle and carries on, which is the
 * report ("it looks especially buggy when chipping") and is a straight violation of contract 5: the
 * graphic IS the physics.
 *
 * So the cup is bounded ABOVE only:
 *
 *  - by the catch radius itself — never draw a hole bigger than the one that catches, at any camera;
 *  - by `ball × CUP_MAX_RATIO` — the ball is drawn hugely oversized at low zoom (a real ball is a
 *    third of a pixel at the putt camera), so an honest 1.2yd cup at a tap-in would be a crater with
 *    a marble beside it. This is the cap that bites at every putt camera.
 *
 * THE COST, STATED: at the whole-hole and long-approach cameras the cup is now SMALLER than the
 * drawn ball (0.6px against 2.25px at 0.5 px/yd) — the very thing the floor was added to prevent.
 * That is accepted deliberately. The two exaggerations cannot both be honoured: the ball has a hard
 * 2.25px floor of its own, so any cup floor above the catch radius re-creates the lie. From 300
 * yards you should not be able to see the hole — the FLAG is what marks the pin at that range, and
 * it is drawn. The case the floor was really protecting (a holed putt reading as a ball parked on a
 * dot) lives at the putt cameras, where the catch radius is 9–42px and nothing is at risk.
 */
export function cupRadiusPx(pxPerYard: number, feel: BallFeel = DEFAULT_BALL_FEEL): number {
  const ball = ballRadiusPx(pxPerYard, 0, feel);
  return Math.min(HOLE_OUT_RADIUS * pxPerYard, ball * CUP_MAX_RATIO);
}

/**
 * Advance the roll phase by a frame's worth of SCREEN movement. `dist` is how far the ball moved on
 * screen (px), `radius` the drawn radius; rolling without slipping is `dθ = ds / r`. Returns the new
 * phase. `dist` of 0 returns the phase unchanged — the ball stops turning exactly when it stops.
 */
export function advanceRollPhase(
  phase: number,
  dist: number,
  radius: number,
  feel: BallFeel = DEFAULT_BALL_FEEL,
): number {
  if (!(dist > 0) || !(radius > 0)) return phase;
  return phase + Math.min(dist / radius, feel.spinMaxStep);
}

/** Advance the phase for a ball in the AIR on its flight: steady backspin, independent of how fast
 *  it is crossing the screen. `dtMs` is the frame time. */
export function advanceFlightSpin(phase: number, dtMs: number, feel: BallFeel = DEFAULT_BALL_FEEL): number {
  return phase - (feel.flightSpinRate * Math.max(0, dtMs)) / 1000;
}

/** Points on the unit sphere the dimples sit at — a fixed, deterministic spiral (no rng, so the ball
 *  is camera-proof and reproducible). Computed once. */
const DIMPLES: ReadonlyArray<readonly [number, number, number]> = (() => {
  const n = 26;
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
})();

/**
 * The ONE description of where a point on the ball's surface lands on screen — shared by the canvas
 * painter and the SVG one, so the animated ball and the resting ball on the aim map cannot drift
 * apart. A plain orthographic sphere spin: surface points turn about the screen-perpendicular axis,
 * and `z > 0` is the near hemisphere.
 */
function surfaceProjector(
  x: number,
  y: number,
  r: number,
  phase: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
): (p: readonly [number, number, number]) => { sx: number; sy: number; z: number } {
  const cos = Math.cos(phase);
  const sin = Math.sin(phase);
  return (p) => {
    const a = p[0] * cos + p[2] * sin; // along travel
    const z = -p[0] * sin + p[2] * cos; // toward the viewer
    const b = p[1]; // across travel
    return { sx: x + r * (a * ux + b * vx), sy: y + r * (a * uy + b * vy), z };
  };
}

/** Unit travel/perp basis from a (possibly absent or degenerate) screen direction. */
function travelBasis(dirX = 1, dirY = 0): { ux: number; uy: number; vx: number; vy: number } {
  const m = Math.hypot(dirX, dirY) || 1;
  const ux = dirX / m;
  const uy = dirY / m;
  return { ux, uy, vx: -uy, vy: ux };
}

/** Where the alignment band's great circle passes — a circle THROUGH the roll axis's poles (see the
 *  note in `drawBall`: the rotation's own equator is invariant and would sit dead still). */
export const BAND_STEPS = 28;
export function bandPoint(i: number): readonly [number, number, number] {
  const t = (i / BAND_STEPS) * Math.PI * 2;
  return [Math.cos(t), Math.sin(t), 0];
}
/** Where the maker's mark sits on the cover. */
export const MARK_POINT: readonly [number, number, number] = [0.72, 0.3, 0.62];

/**
 * Draw the ball at `(x, y)` with radius `r`, rolled to `phase` about an axis perpendicular to
 * `(dirX, dirY)` — the direction it is travelling on screen. The rotation is a plain orthographic
 * sphere spin: surface points turn about the screen-perpendicular axis and the back hemisphere is
 * culled, so detail crosses the face in the direction of travel and disappears over the horizon.
 */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  opts: {
    phase?: number;
    dirX?: number;
    dirY?: number;
    skin?: BallSkin;
    feel?: BallFeel;
  } = {},
): void {
  const skin = opts.skin ?? DEFAULT_BALL_SKIN;
  const feel = opts.feel ?? DEFAULT_BALL_FEEL;
  const phase = opts.phase ?? 0;
  // Screen basis: u along travel, v perpendicular. A resting ball has no direction — keep the last
  // sensible default (rightwards) rather than collapsing the sphere.
  const { ux, uy, vx, vy } = travelBasis(opts.dirX, opts.dirY);

  ctx.save();
  // A legendary aura, kept TIGHT. At `r + 2.4` and half opacity it added better than a pixel of
  // apparent radius all round, so a skinned ball read as a bigger ball rather than a fancier one —
  // and an outset in absolute px grows as a share of the ball every time the ball shrinks, so it
  // scales with the size curve like every other length here.
  if (skin.glow) {
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(x, y, r + 0.83, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // The lit sphere. Light from the upper-left, the same direction every carved feature in the scene
  // is lit from (`LIGHT_UL` in style/shared.ts) — a ball lit from anywhere else reads as a sticker.
  const grad = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.1, x, y, r * 1.08);
  grad.addColorStop(0, skin.cover);
  grad.addColorStop(0.55, skin.cover);
  grad.addColorStop(1, skin.shade);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  const project = surfaceProjector(x, y, r, phase, ux, uy, vx, vy);

  // The alignment BAND. It has to be a great circle THROUGH the roll axis's poles, not around its
  // equator: the equator of the rotation is invariant under that rotation and would sit dead still
  // while the ball spun underneath it. This one sweeps across the face once per turn, which is what
  // makes a 4px ball read as rolling before it is big enough to hold dimples.
  if (skin.band && r >= BAND_MIN_PX) {
    ctx.strokeStyle = skin.band;
    ctx.lineWidth = Math.max(0.52, r * 0.13);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= BAND_STEPS; i++) {
      const p = project(bandPoint(i));
      if (p.z < -0.05) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p.sx, p.sy);
        started = true;
      } else ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
  }

  if (r >= feel.dimpleMinPx) {
    ctx.fillStyle = skin.dimple;
    const dr = Math.max(0.41, r * 0.16);
    for (const p of DIMPLES) {
      const q = project(p);
      if (q.z <= 0.12) continue; // back hemisphere + the grazing rim, where a dimple is a smudge
      ctx.globalAlpha = 0.32 + 0.5 * q.z;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, dr * (0.55 + 0.45 * q.z), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The maker's mark — one dot, so there is always exactly one unambiguous feature to track. It is
  // what tells you the ball is turning when it is too small for dimples.
  if (skin.mark && r >= MARK_MIN_PX) {
    const q = project(MARK_POINT);
    if (q.z > 0.05) {
      ctx.globalAlpha = Math.min(1, 0.35 + q.z);
      ctx.fillStyle = skin.mark;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, Math.max(0.45, r * 0.17), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // A hairline so the ball keeps its edge against a bright fairway or a white bunker. It is stroked
  // ON the silhouette, so it adds half its width to the APPARENT radius — which is why it scales with
  // the ball: at 1px on the small-camera ball it was a third of the drawn width and swallowed it.
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * The ground shadow. `h` is the ball's height in the SAME screen units its vertical offset uses, so
 * the shadow tightens and darkens as the ball comes down and spreads and fades as it climbs.
 *
 * This is the other half of "there is no bounce": a 3px disc rising 1.5px is not a visible hop, but
 * a disc leaving its shadow is unmistakable — the hop train the run-out model was already drawing
 * was simply invisible without it.
 */
export function drawBallShadow(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  r: number,
  h: number,
): void {
  const lift = Math.max(0, h);
  // Grows and softens with height, so the gap between ball and shadow is what reads as air.
  const spread = 0.95 + Math.min(1.6, lift / Math.max(2, r * 5)) * 0.5;
  const alpha = 0.46 / (1 + Math.min(2.6, lift / Math.max(2, r * 5)));
  if (alpha < 0.04) return;
  // OFFSET down-right, away from the scene's upper-left light (`LIGHT_UL`). The first version drew
  // the shadow concentric with the ball at the same radius, so on the ground — which is most of a
  // run-out — the ball covered it completely and there was nothing to see. The report was simply
  // "I can't see any shadows at all"; they were being drawn the whole time, underneath the ball.
  const off = r * 0.5;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(gx + off, gy + off * 0.7, r * spread, r * spread * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The cover a golfer's ball wears. Content-as-data with ONE seam: an equipped Story BALL already
 * declares a tracer palette + style (`GolferLook.ballTracer`, GS-story-avatar) for its flight trail,
 * and this dresses the ball itself from the same row — so a cosmetic ball is one item that changes
 * both ends of the shot, not a trail plus a second unrelated purchase. A `TracerShape` maps to the
 * nearest catalogue cover; its own colour then re-tints the band and the aura, so a NEW tracer row
 * needs no edit here.
 *
 * No ball equipped ⇒ `classic`, the plain white one. This feature is about making the ball read, not
 * about changing what the player already has.
 */
export function ballSkinFor(look?: { ballTracer?: { shape: string; color: string; accent?: string; glow?: string } }): BallSkin {
  const t = look?.ballTracer;
  if (!t) return BALL_SKINS.classic;
  const base =
    t.shape === 'comet' ? BALL_SKINS.comet
    : t.shape === 'ember' ? BALL_SKINS.ember
    : t.shape === 'spark' ? BALL_SKINS.void
    : BALL_SKINS.tour;
  return { ...base, band: t.color, mark: t.accent ?? base.mark, glow: t.glow ?? base.glow };
}

/**
 * The ball as an SVG fragment — the RESTING ball on the static aim / putt map (`renderHoleSVG`).
 *
 * That map is where the player actually spends their time looking at the ball, and it was still a
 * bare `<circle r="4" fill="#fff">`: you lined up a shot with a plain white dot, watched a dimpled
 * ball fly, and got the dot back at rest. The cover has to be the same in both places or the
 * cosmetic doesn't exist as far as the player is concerned.
 *
 * It shares `surfaceProjector`, `DIMPLES`, `bandPoint` and `MARK_POINT` with the canvas painter, so
 * there is ONE description of where a point on the cover lands and the two renderers cannot drift.
 * A resting ball has no travel direction, so it takes the same phase-0 pose the tee shot starts in.
 */
export function ballSVG(
  x: number,
  y: number,
  r: number,
  skin: BallSkin = DEFAULT_BALL_SKIN,
  feel: BallFeel = DEFAULT_BALL_FEEL,
): string {
  const { ux, uy, vx, vy } = travelBasis(1, 0);
  const project = surfaceProjector(x, y, r, 0, ux, uy, vx, vy);
  const n = (v: number): string => v.toFixed(2);
  const out: string[] = [];
  if (skin.glow) {
    out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r + 1.65)}" fill="${skin.glow}" opacity="0.45" />`);
  }
  // The lit sphere. An SVG radial gradient needs an id, and ids are DOCUMENT-global — several hole
  // SVGs share one document in the gallery and the test hub (see `holeIdPrefix`). Two overlaid
  // circles give the same read with nothing to collide.
  out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${skin.shade}" />`);
  out.push(`<circle cx="${n(x - r * 0.16)}" cy="${n(y - r * 0.18)}" r="${n(r * 0.86)}" fill="${skin.cover}" />`);
  if (r >= feel.dimpleMinPx) {
    for (const p of DIMPLES) {
      const q = project(p);
      if (q.z <= 0.12) continue;
      const dr = Math.max(0.3, r * 0.15) * (0.55 + 0.45 * q.z);
      out.push(`<circle cx="${n(q.sx)}" cy="${n(q.sy)}" r="${n(dr)}" fill="${skin.dimple}" opacity="${(0.3 + 0.45 * q.z).toFixed(2)}" />`);
    }
  }
  if (skin.band && r >= BAND_MIN_PX) {
    const pts: string[] = [];
    for (let i = 0; i <= BAND_STEPS; i++) {
      const p = project(bandPoint(i));
      if (p.z < -0.05) continue;
      pts.push(`${n(p.sx)},${n(p.sy)}`);
    }
    if (pts.length > 1) {
      out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${skin.band}" stroke-width="${n(Math.max(0.45, r * 0.13))}" />`);
    }
  }
  if (skin.mark && r >= MARK_MIN_PX) {
    const q = project(MARK_POINT);
    if (q.z > 0.05) {
      out.push(`<circle cx="${n(q.sx)}" cy="${n(q.sy)}" r="${n(Math.max(0.38, r * 0.17))}" fill="${skin.mark}" />`);
    }
  }
  out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="0.75" />`);
  return out.join('');
}
