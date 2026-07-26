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
 * diameter, floored at the old 3px (so the whole-hole map is unchanged) and capped so a deep zoom
 * doesn't put a beachball on the green.
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
  /** Exaggerated ball diameter in course yards. A real ball is 0.047yd — at the chip/putt camera
   *  (~6.6 px/yd) that is a THIRD OF A PIXEL, so a scale model is not on the table; this is a
   *  readable stand-in, sized so that camera draws a ball you can see turning (~8px radius) while the
   *  whole-hole map stays on the 3px floor and is unchanged. */
  ballDrawYd: number;
  /** Screen-radius floor (the pre-GS-ball-art constant, so the whole-hole map is unchanged) and cap. */
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
  ballDrawYd: 2.4,
  ballMinPx: 3,
  ballMaxPx: 9,
  ballLoftGrow: 0.5,
  spinMaxStep: 0.55,
  flightSpinRate: 9,
  dimpleMinPx: 4.6,
};

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * Drawn ball radius (px). `pxPerYard` is the projector's scale; `loft` is 0 on the deck and 1 at the
 * flight apex. Floored at the old fixed size so the whole-hole map is byte-for-byte, and capped so a
 * deep chip/putt zoom stays a golf ball.
 */
export function ballRadiusPx(pxPerYard: number, loft = 0, feel: BallFeel = DEFAULT_BALL_FEEL): number {
  const base = clamp(pxPerYard * feel.ballDrawYd * 0.5, feel.ballMinPx, feel.ballMaxPx);
  return base * (1 + clamp(loft, 0, 1) * feel.ballLoftGrow);
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
  let ux = opts.dirX ?? 1;
  let uy = opts.dirY ?? 0;
  const m = Math.hypot(ux, uy) || 1;
  ux /= m;
  uy /= m;
  const vx = -uy;
  const vy = ux;

  ctx.save();
  if (skin.glow) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = skin.glow;
    ctx.beginPath();
    ctx.arc(x, y, r + 2.4, 0, Math.PI * 2);
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

  const cos = Math.cos(phase);
  const sin = Math.sin(phase);
  /** Rotate a unit-sphere point about the screen-vertical axis and project it. */
  const project = (p: readonly [number, number, number]): { sx: number; sy: number; z: number } => {
    const a = p[0] * cos + p[2] * sin; // along travel
    const z = -p[0] * sin + p[2] * cos; // toward the viewer
    const b = p[1]; // across travel
    return { sx: x + r * (a * ux + b * vx), sy: y + r * (a * uy + b * vy), z };
  };

  // The alignment BAND. It has to be a great circle THROUGH the roll axis's poles, not around its
  // equator: the equator of the rotation is invariant under that rotation and would sit dead still
  // while the ball spun underneath it. This one sweeps across the face once per turn, which is what
  // makes a 4px ball read as rolling before it is big enough to hold dimples.
  if (skin.band && r >= 2.6) {
    ctx.strokeStyle = skin.band;
    ctx.lineWidth = Math.max(0.7, r * 0.13);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      const p = project([Math.cos(t), Math.sin(t), 0] as const);
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
    const dr = Math.max(0.5, r * 0.13);
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
  if (skin.mark && r >= 3.4) {
    const q = project([0.72, 0.3, 0.62] as const);
    if (q.z > 0.05) {
      ctx.globalAlpha = Math.min(1, 0.35 + q.z);
      ctx.fillStyle = skin.mark;
      ctx.beginPath();
      ctx.arc(q.sx, q.sy, Math.max(0.6, r * 0.17), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // A hairline so the ball keeps its edge against a bright fairway or a white bunker.
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
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
  // Spread ~40% wider at a full ball-height of air, fading as it goes.
  const spread = 1 + Math.min(1.4, lift / Math.max(2, r * 6)) * 0.55;
  const alpha = 0.34 / (1 + Math.min(3, lift / Math.max(2, r * 4)));
  if (alpha < 0.03) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(gx, gy, r * spread, r * spread * 0.45, 0, 0, Math.PI * 2);
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
