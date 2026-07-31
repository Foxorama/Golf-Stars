/**
 * Canvas2D play view — the animated, juicy ball-flight layer (GS-3).
 *
 * Reads a hole + the `ShotLog[]` the round sim already produced and animates each shot:
 * an arcing ball with a ground shadow, a fading trail, an impact puff and a carry-scaled
 * screen-shake on landing, plus a per-shot HUD (club + carry). The static hole geometry
 * is drawn with the SAME pure projector the SVG map uses, so the two agree exactly.
 *
 * Thin/imperative by design (this is the part you can't unit-test for "feel"); all the
 * pure math lives in `trajectory.ts`/`project.ts`. Feel tunables read from
 * `window._gsFeel` so they can be A/B'd live (CLAUDE.md escape-hatch rule).
 */

import type { Hole, Vec } from '../sim/course/contract';
import type { PuttLog, ShotLog } from '../sim/round';
import type { ShotRedirect, PenaltyKind } from '../sim/shot';
import { playBoundsCorners, surfaceFirmness } from '../sim/round';
import { lieAt, PEN_INFO } from '../sim/shot';
import { inScorch, meteorScorch as meteorScorchFor } from '../sim/scorch';
import { effectPatches as effectPatchesFor, inPatch, PATCH_SPECS, type PatchKind } from '../sim/patches';
import { TENT_LINES } from '../sim/tents';
import { archetypeFor } from '../sim/course/themes';
import { holeProjector } from './project';
import { buildScene, drawScenePrims, landPolysCourseFor, type Prim } from './style';
import { artFeel } from './style/shared';
import { createWeather, type WeatherHandle } from './weather';
import { safeAreaInsets } from './safeArea';
import { createCetusFlow } from './cetusFlow';
import { createShipDrift } from './shipDrift';
import {
  drawCaddy,
  drawCaddyProjectile,
  caddyProjectile,
  hasCaddyArt,
  CADDY_LABEL,
  CADDY_VOICE,
  drawSpeechBubble,
  drawPhoneIcon,
  type CaddyArtId,
} from './caddyArt';
import {
  easeOutCubic,
  flightDurationMs,
  flightGroundAt,
  sampleCurvedFlight,
  samplePolylineFlight,
  DEFAULT_FLIGHT_FEEL,
  type FlightFeel,
} from './trajectory';
import { arcShapeOf, arrivalAngleDeg, flightProfileOf } from '../sim/flight';
import { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL, type RunoutFeel, type RunoutPlan } from './runout';
import {
  advanceFlightSpin,
  advanceRollPhase,
  ballRadiusPx,
  cupRadiusPx,
  drawBall,
  drawBallShadow,
  ballSkinFor,
  DEFAULT_BALL_FEEL,
  type BallFeel,
} from './ball';
import { GOLFER_COLORS, lookFromColor, drawGolfer, type GolferLook } from './golferArt';
import { canvasRatio } from './pixelRatio';
import { reducedMotion } from '../settings';

// The on-course golfer's look now lives in golferArt.ts; re-export it so existing importers
// (e.g. src/app/helpers.ts) keep resolving `GolferLook` from this module.
export type { GolferLook } from './golferArt';

interface PlayFeel extends FlightFeel, RunoutFeel, BallFeel {
  /** Multiplies on-screen arc height (course px → visible loft). */
  heightExaggeration: number;
  /** Max screen-shake amplitude (px) at a full-power strike. */
  shakeAmp: number;
  /** Trail length in samples. */
  trailLen: number;
  /** Pause between shots (ms). */
  gapMs: number;
  // The LAND → BOUNCE → RUN-OUT model (GS-runout-feel) — every knob lives in `render/runout.ts`'s
  // `RunoutFeel` and is spread in here, so the whole run-out is tunable through the existing `_gsFeel`
  // escape hatch without a new top-level `_gs*` flag (and without a test-hub wiring obligation).
  /** Pause (ms) the ball sits at rest so you can read where it finished. */
  restHoldMs: number;
  /** Draw the little golfer who addresses + swings before each full shot. */
  golfer: boolean;
  /** Golfer figure base height (px); scaled mildly with zoom, clamped readable. */
  golferPx: number;
  /** Windup lead-in (ms) before the ball launches — the address + backswing + downswing. */
  swingLeadMs: number;
  /** Follow-through window (ms) over which the golfer holds the finish then fades. */
  followMs: number;
  /** Animated twinkle/shooting-star space ambience over the field. */
  spaceFX: boolean;
  /** Animated wind streaks drifting across the hole (GS-wind), themed + scaled by wind speed. */
  wind: boolean;
  /** Flow rate of the moving Cetus star-waterfall (GS-cetus-flow) — multiplies the river drift +
   *  curtain fall speed. 1 = default, 0 freezes it (a static river). Cetus-only; ignored elsewhere. */
  cetusFlowSpeed: number;
  /** Drift rate of the derelict world's floating space junk (GS-ship-feel) — multiplies the tumble +
   *  drift speed. 1 = default, 0 freezes it. Derelict-only; ignored elsewhere. */
  shipDriftSpeed: number;
  /**
   * DEMO/test hook (GS-caddy) — force a caddy-guard interception on EVERY shot so the boomerang/laser
   * throw can be watched on demand, instead of only on a rare right/left miss. '' = off (default, the
   * shipped behaviour, byte-for-byte). 'boomerang' = Convict Sheep, 'laser' = Space Ducks: the corner
   * caddy is shown even if none is hired and a redirect is FABRICATED (render-only — no sim/score change)
   * for any shot the sim didn't already redirect. Rides `_gsFeel`, so it needs no new top-level hook.
   */
  forceRedirect: '' | 'boomerang' | 'laser';
}

const BASE_FEEL: PlayFeel = {
  ...DEFAULT_FLIGHT_FEEL,
  heightExaggeration: 0.55,
  shakeAmp: 7,
  trailLen: 18,
  gapMs: 170,
  ...DEFAULT_RUNOUT_FEEL,
  ...DEFAULT_BALL_FEEL,
  restHoldMs: 480,
  golfer: true,
  golferPx: 40,
  swingLeadMs: 520,
  followMs: 440,
  spaceFX: true,
  wind: true,
  cetusFlowSpeed: 1,
  shipDriftSpeed: 1,
  forceRedirect: '',
};

/** The corner caddy id implied by a forced-redirect demo kind (GS-caddy) — so the throw can be
 *  watched even with no caddy hired. Off / a real caddy already drawn ⇒ undefined. */
function forcedRedirectCaddy(kind: PlayFeel['forceRedirect']): string | undefined {
  return kind === 'boomerang' ? 'convict-sheep' : kind === 'laser' ? 'space-ducks' : undefined;
}

/** Fabricate a render-only redirect (GS-caddy demo): the would-be miss the guard "saves", offset to
 *  the guard's side of the touchdown. Pure (no rng) so it's stable across frames; the score already
 *  used the real landing, so this only drives the watch-the-throw animation. */
function fabricateRedirect(
  kind: 'boomerang' | 'laser',
  touchdown: Vec,
  bearingDeg: number,
  carry: number,
  lefty?: boolean,
): ShotRedirect {
  const br = (bearingDeg * Math.PI) / 180;
  // Right-perpendicular of the bearing (shot.ts's +lateral axis): rx=cos, ry=−sin.
  const rx = Math.cos(br);
  const ry = -Math.sin(br);
  // Boomerang saves a right shank (+), laser a left duck-hook (−); lefty mirrors the world side.
  const side = (kind === 'boomerang' ? 1 : -1) * (lefty ? -1 : 1);
  const off = Math.max(22, carry * 0.32) * side;
  return {
    kind,
    fromZone: kind === 'boomerang' ? 'shankR' : 'duckHookL',
    originalLanding: [touchdown[0] + rx * off, touchdown[1] + ry * off],
  };
}


/** Tiny deterministic PRNG (mulberry32) — the house style, so the ambient FX are stable. */
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Where in a holed putt's roll the ball starts dropping into the cup (GS-ball-swallow). Late, so
 *  the drop reads as the ball falling in at the end rather than shrinking on its way there. */
const PUTT_DROP_FROM = 0.86;
/** Where in a swallowing hazard's run-out the ball starts sinking out of sight. Earlier than the
 *  putt's, because the splash/burst FX fires at the end and the ball should be gone under it. */
const SINK_FROM = 0.72;

/** Total length of a flight polyline (the derelict's pinball carom) — the GROUND the arc spans, so
 *  its arrival angle is measured against the same run a parkland shot's carry is. */
function polylineLength(path: readonly Vec[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return total;
}

/**
 * A stable 0..1 variation for a shot, from the shot's own geometry (GS-landing-real).
 *
 * Landings need to differ — "if it's the same bounce and run on every drive it doesn't feel real" —
 * but the render path may not touch rng: `Math.random` is banned in any deterministic render path,
 * and a sim draw would move every seeded stream (contract 1). So the variation is HASHED out of
 * numbers the shot already has. Same shot, same landing, every replay; different shots, different
 * landings; zero draws.
 */
function shotVariance(shot: { result: { landing: Vec; carry: number }; rest: Vec }): number {
  const bits =
    shot.result.landing[0] * 7919 + shot.result.landing[1] * 104_729 + shot.rest[0] * 1543 + shot.rest[1] * 21 + shot.result.carry * 3.7;
  const x = Math.sin(bits) * 43_758.545_312;
  return x - Math.floor(x);
}
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Caddy-effect SLO-MO + callout (GS-caddy-slomo): when a caddy's signature effect fires (a guard
// laser/boomerang redirect, or a Dr Chipinski chip-in) the animation clock drops to CADDY_SLOMO×
// real time for CADDY_SLOMO_MS of VIRTUAL time, so the throw/drop is noticeable — paired with an
// on-screen speech bubble (+ a ringing phone for Dr Chipinski) for CADDY_CALLOUT_MS. Pure feel:
// the slowed clock only stretches the wall-time of the existing animation, never the sim. These are
// plain module constants (like ARC_FEEL in flight.ts), NOT _gsFeel fields, so no new hook to wire.
const CADDY_SLOMO = 0.34; // virtual-time scale while a caddy effect plays (≈3× slower)
const CADDY_SLOMO_MS = 1050; // virtual ms the slo-mo window lasts (covers the whole intercept arc)
const CADDY_CALLOUT_MS = 1500; // virtual ms the speech bubble / phone glyph stays up
const TENT_CALLOUT_MS = 1100; // virtual ms a trade-tent "Ow!" bubble (GS-tents) stays up

// Caddy-guard redirect geometry (GS-caddy): the projectile and the ball are tied to the SAME flight
// progress `tg`, so they MEET — the caddy fires at FIRE_FRAC and the shot connects with the ball at
// HIT_FRAC (the intercept). The camera zooms to REDIRECT_ZOOM (a viewRadius multiplier) at impact.
const REDIRECT_FIRE_FRAC = 0.28; // flight progress where the caddy looses the laser/boomerang
const REDIRECT_HIT_FRAC = 0.5; // flight progress where it meets the ball (the would-be miss point)
const REDIRECT_ZOOM = 0.6; // viewRadius multiplier at the impact (smaller = zoomed in)
/** Follow-cam pan (in SCREEN px) below which the camera is treated as settled, so the projector —
 *  and with it the whole static-scene cache — is reused (GS-shot-lag). A twentieth of a pixel is
 *  under a quarter of a device pixel at any dpr the game runs at: invisible, and it is what lets an
 *  exponentially-easing camera actually ARRIVE instead of converging forever. */
const CAMERA_SETTLE_PX = 0.05;

function feel(): PlayFeel {
  const override = (window as unknown as { _gsFeel?: Partial<PlayFeel> })._gsFeel ?? {};
  return { ...BASE_FEEL, ...override };
}

export interface PlayViewOptions {
  width?: number;
  height?: number;
  biome?: string;
  /** Star-travel theme id (GS-17e) — draws that constellation in the sky. */
  themeId?: string;
  /** Atmospheric course effect the chosen journey route brought (GS-journey-fx) — adds a static layer
   *  in the scene + an animated overlay (falling meteors, shimmering aurora, storm flicker). */
  effect?: string;
  /** Rainbow Ball (GS-rainbow): paint the play view as RAINBOW ROAD (rainbow ribbon through the stars,
   *  off-road = void). Baked from the live loadout at the app boundary; render-only. */
  rainbow?: boolean;
  /** Trade-camp tents (GS-tents): draw the ring of collidable tents around the green. Baked from the
   *  course effect at the app boundary; render-only (the sim's bounce is the matching half). */
  tradeTents?: boolean;
  /** Meteor-strike scorch craters (GS-meteor-scorch): drawn in the scene + an ash-burst land FX. */
  meteorScorch?: boolean;
  /** Effect ground patches (GS-journey-fx-2): the route's turf-patch family (comet stardust /
   *  frostfall ice / debris wreckage) — drawn in the scene + a per-family land FX. Baked from the
   *  course effect at the app boundary; render-only (the sim's lie conversion is the matching half). */
  groundPatch?: PatchKind;
  /** Fired once when the ball ricochets off a trade-camp tent (GS-tents) — the cue for app.ts to play
   *  the bonk sound + speak the yelp. The arg is the exact bubble text shown on-canvas ("Ow!" /
   *  "Watch it!") so the spoken line matches. Pure feel hook; never affects the sim. */
  onTentHit?: (text: string) => void;
  /** Ship-corridor wall ricochet (GS-ship-walls): the ball just clanged off a metal wall (arg = how
   *  many walls it hit). Wired to a metallic clang + haptic; the flight/roll already show the bounce. */
  onWallBounce?: (bounces: number) => void;
  /** Called once the final shot has landed. */
  onDone?: () => void;
  /** Fired once per segment at the STRIKE moment (club–ball contact / putter tap) — the cue point
   *  for a contact sound + haptic. `quality` 0..1 for a shot (1 = pure, derived from the miss),
   *  undefined for a putt. `clubId` is the struck club's taxonomy id (GS-audio-2) so the cue can
   *  voice driver/wood/iron/wedge distinctly. Pure feel hook; never affects the sim. */
  onImpact?: (kind: 'shot' | 'putt', quality?: number, clubId?: string) => void;
  /** Fired once per shot at TOUCHDOWN, alongside the landing FX (GS-audio-3) — the cue point for a
   *  surface sound (splash / lava sizzle / void implosion / whale / per-world tree knock). `lie` is
   *  the resolved landing surface (scorch-crater + effect-patch conversions included, exactly what
   *  the land FX shows), `penalty` the sim's penalty kind, `knockedDown` true when a tree clipped
   *  the ball out of the air. Pure feel hook; never affects the sim. */
  onLand?: (lie: string, penalty?: string, knockedDown?: boolean) => void;
  /** Fired at both beats of a caddy-guard redirect (GS-audio-4) — the cue points for the projectile
   *  sounds. `'fire'` as the guard looses the laser/boomerang (`travelMs` = REAL ms until contact,
   *  slow-mo already folded in, so a whir/whine can be sized to end at the hit); `'hit'` at the
   *  spark-spray contact with the ball. Pure feel hook; never affects the sim. */
  onRedirect?: (kind: 'laser' | 'boomerang', phase: 'fire' | 'hit', travelMs?: number) => void;
  /**
   * Zoom-and-follow: when set, the camera centres on `focus` (the starting ball) at radius
   * `viewRadius` (course yards) and — if `follow` — eases to track the ball in flight, so the
   * animation matches the zoomed decision map (no jarring zoom jump) and keeps up with the ball.
   */
  focus?: Vec;
  viewRadius?: number;
  /** Where the focus point sits vertically (0=top..1=bottom); higher = ball lower, more shot ahead. */
  focusBias?: number;
  /** Override the up-screen direction (default tee→green) — the follow-cam passes the shot's
   *  origin→pin so the pin stays at the top even on a shot played back toward the green. */
  up?: Vec;
  follow?: boolean;
  /** Draw the animated world-decor twins — the moving Cetus star-waterfall + the derelict's drifting
   *  space junk (GS-cetus-flow / GS-ship-feel). Default true. Set FALSE for the putts-only green watch:
   *  the tight green zoom made the drifting ship SECTIONS float weirdly over the cup (they're readable
   *  from the shot/decision framing, not a 25-yd putt view). A shot watch keeps them on. */
  ambientDrift?: boolean;
  /** The selected golfer's look (GS-18). Absent → the loader-crew cap cycle (result-screen replay). */
  golferLook?: GolferLook;
  /** The hired named caddy id (GS-caddy) — the actual hired caddy. A GUARD caddy (Space Ducks /
   *  Convict Sheep) is drawn persistently in the corner and powers the laser/boomerang redirect;
   *  any other hired caddy only appears transiently for its signature effect (e.g. Dr Chipinski on a
   *  chip-in). Absent → no caddy figure. */
  caddyId?: string;
  /** Screen-space (CSS px, canvas-relative) anchors for a caddy the HUD is already drawing in its
   *  permanent badge slot (GS-hud-frame). When given, the corner FIGURE is not drawn — the badge is
   *  showing that caddy, and drawing the figure too rendered the same caddy twice — and these become
   *  the effect's anchors: `muzzle` is where a guard's laser/boomerang launches from (so the throw
   *  visibly comes off the framed portrait), `head` is where its speech bubble points. `head` is
   *  passed separately rather than derived, because the badge sits INSIDE the frame's bottom bar: a
   *  bubble hung just above the portrait would be drawn behind the controls panel. Absent (the
   *  result-screen replay, the no-caddy force-redirect demo) ⇒ the classic corner figure, unchanged. */
  caddyAnchor?: { muzzle: Vec; head: Vec };
  /** Fired once when a caddy's signature effect triggers visually (a guard redirect or a Dr
   *  Chipinski chip-in) — the cue for app.ts to speak the caddy's voice line + haptic. The arg is
   *  the caddy id whose line to play. Pure feel hook; never affects the sim. */
  onCaddyEffect?: (caddyId: string) => void;
  /** Left-handed mode (GS-lefty): draw the golfer swinging left-handed and mirror the caddy figure.
   *  Pure cosmetic mirror — the ball flight already comes out mirrored from the sim. */
  lefty?: boolean;
}

export interface PlayViewHandle {
  replay(): void;
  destroy(): void;
}

interface Particle {
  pos: Vec; // screen px
  vel: Vec;
  life: number; // 1 → 0
  /** RGB triplet for the particle fill (defaults to the warm impact spark). */
  rgb?: string;
  /** Gravity per frame (px) — leaves flutter down; sparks float. */
  grav?: number;
}

/** Mount an animated play view of a hole's shots. Browser only. */
export function mountPlayView(
  container: HTMLElement,
  hole: Hole,
  shots: ShotLog[],
  putts: PuttLog[] = [],
  opts: PlayViewOptions = {},
): PlayViewHandle {
  const F = feel();
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const dpr = canvasRatio();
  // Resolved once at mount, not per frame — the setting cannot change mid-flight, and reading it in
  // the draw loop would put a localStorage-backed lookup on every frame.
  const shakeAmp = reducedMotion() ? 0 : F.shakeAmp;

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.borderRadius = '10px';
  container.innerHTML = '';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Include every shot's flight + rest (and putt endpoints) so a wild shot that flies
  // off the terrain stays in frame instead of clipping. (Unused in focus/follow mode.)
  const extra: Vec[] = [];
  // Keep the OB boundary (and its stakes) in frame, like the SVG map.
  extra.push(...playBoundsCorners(hole));
  for (const s of shots) extra.push(s.from, s.result.landing, s.rest);
  for (const p of putts) extra.push(p.from, p.to);
  // The camera: whole-hole fit by default, or a zoom window around `focus` that eases to
  // track the ball when `follow` is on. `proj` is rebuilt per-frame in follow mode.
  const followMode = !!opts.focus;
  let camera: Vec = (opts.focus ? ([...opts.focus] as Vec) : hole.tee);
  let lastGround: Vec = camera;
  // cineZoom (default 1) is the live viewRadius multiplier that zooms the camera in to a caddy
  // redirect's slow-mo impact and back out. Declared BEFORE buildProj (which closes over it and is
  // called immediately at `let proj = buildProj()`) so the first call doesn't hit the TDZ.
  let cineZoom = 1;
  const buildProj = () =>
    followMode
      ? holeProjector(hole, {
          width,
          height,
          focus: camera,
          // cineZoom (default 1) tightens the view during a redirect's slow-mo impact (GS-caddy).
          viewRadius: opts.viewRadius != null ? opts.viewRadius * cineZoom : undefined,
          focusBias: opts.focusBias,
          up: opts.up,
        })
      : holeProjector(hole, { width, height, extra });
  let proj = buildProj();
  /** The `cineZoom` `proj` was built at. The follow-cam may now hold the projector still across
   *  frames (GS-shot-lag), so "the camera has not moved" must account for the redirect cinematic's
   *  live viewRadius multiplier too — otherwise a zoom that eases while the ball happens to be
   *  settled would never reach the projector, and the cinematic would stall at whatever zoom it had
   *  when the pan stopped. In practice the ball is in flight throughout a redirect, so this is a
   *  guarantee rather than an observed bug — which is exactly why it should not be left implicit. */
  let projZoom = cineZoom;

  // --- animation state ---
  let shotIndex = 0;
  let puttIndex = 0;
  let segStart = 0; // start time of the current shot or putt
  let raf = 0;
  let trail: Vec[] = [];
  let particles: Particle[] = [];
  let shake = 0; // 0..1, decays
  let done = false;
  let lastImpactShot = -1; // shot whose landing impact/hold has already been triggered
  let lastRollClearShot = -1; // shot whose trail has been reset at the flight→roll transition
  let runoutShot = -1; // shot whose land/bounce/run-out plan is cached below (GS-runout-feel)
  let runoutPlan: RunoutPlan | null = null;
  // Ball ROLL (GS-ball-art). The phase advances off the ball's own SCREEN displacement, so it stops
  // turning exactly when the ball stops and reverses on its own through a backspin check — no special
  // case, and nothing for the two to disagree about. `ballDir` is the last non-trivial travel
  // direction, kept so a ball sitting still doesn't collapse its rotation axis.
  let ballPhase = 0;
  let ballDir: Vec = [1, 0];
  let ballPrev: Vec | null = null; // last COURSE position, not the last screen position
  /** Where the ball finished — kept so it can go on being drawn after the animation ends. */
  let ballRest: Vec | null = null;
  /**
   * Roll the ball to a new COURSE position: advance the phase by how far it moved through the WORLD,
   * measured in today's pixels. Taking the delta between two screen positions from DIFFERENT frames
   * would be wrong — the follow-cam eases toward the ball at 0.2 a frame, so a rolling ball drifts
   * toward the middle of the screen while the world scrolls past it, and its screen displacement is
   * only a fraction of the distance it actually rolled. Projecting both endpoints under the CURRENT
   * projection cancels the camera out and leaves the ball's real travel, in the px it is drawn at.
   */
  const rollBallTo = (at: Vec, project: (p: Vec) => [number, number], r: number): void => {
    if (ballPrev) {
      const [ax, ay] = project(ballPrev);
      const [bx2, by2] = project(at);
      const dx = bx2 - ax;
      const dy = by2 - ay;
      const d = Math.hypot(dx, dy);
      if (d > 0.05) {
        ballDir = [dx / d, dy / d];
        ballPhase = advanceRollPhase(ballPhase, d, r, F);
      }
    }
    ballPrev = at;
  };
  let impactFiredShot = -1; // shot whose strike cue (onImpact) has fired
  let impactFiredPutt = -1; // putt whose strike cue has fired
  // Caddy-guard redirect (GS-caddy): the slow-mo interception. `redirectDraw` is the projectile to
  // paint THIS frame (recomputed every frame so its target tracks the moving ball + camera pan — the
  // old frozen target drifted off and missed); `redirectFiredShot` gates the one-shot slow-mo+voice,
  // `sparksFiredShot` the one-shot contact spray; `cineZoom` (declared above buildProj) is the live
  // viewRadius multiplier that zooms the camera in to the impact and back out.
  let redirectFiredShot = -1;
  let sparksFiredShot = -1;
  let redirectDraw: { kind: 'laser' | 'boomerang'; from: Vec; to: Vec; p: number } | null = null;
  let caddyAnchor: Vec = [0, 0]; // the corner caddy's muzzle (screen px), refreshed each frame
  let caddyHead: Vec = [0, 0]; // the corner caddy's head (screen px) — where its speech bubble points
  // Caddy-effect slo-mo + callout (GS-caddy-slomo). The virtual clock advances at CADDY_SLOMO× real
  // time while `vnow < slowUntilV`; everything below times off the virtual `now`. The callout is the
  // speech bubble (+ optional phone) shown for a hit caddy effect.
  let vnow = 0; // virtual animation time (ms)
  let lastReal = 0; // last real timestamp seen (ms)
  let slowUntilV = 0; // virtual time to hold slo-mo until
  let caddyCallout: { id: CaddyArtId; until: number } | null = null;
  let chipInFiredShot = -1; // shot whose chip-in callout has fired
  // Trade-camp tent bubble (GS-tent-interactions): a transient line at the struck tent. Anchored in
  // COURSE space (`at` = the tent CENTRE) and re-projected every frame — the old bug stored a SCREEN
  // position captured at impact, so as the follow-cam panned with the ball the bubble drifted with the
  // ball instead of staying on the tent. Storing the world point + re-projecting fixes that.
  let tentCallout: { at: Vec; text: string; until: number } | null = null;
  let tentFiredShot = -1; // shot whose tent-hit callout has fired
  let wallFiredShot = -1; // shot whose ship-wall clang has fired (GS-ship-walls)
  let wallSparkShot = -1; // shot whose per-bounce sparks are being tracked (GS-ship-pinball-flight)
  let wallSparkNext = 1; // index of the next interior flight-path vertex to spark as the ball crosses it

  function reset(_now: number): void {
    shotIndex = 0;
    puttIndex = 0;
    // Restart the virtual clock; the first frame re-seeds segStart/lastReal off it.
    vnow = 0;
    lastReal = 0;
    slowUntilV = 0;
    segStart = 0;
    trail = [];
    particles = [];
    shake = 0;
    done = false;
    lastImpactShot = -1;
    lastRollClearShot = -1;
    runoutShot = -1;
    runoutPlan = null;
    ballPhase = 0;
    ballDir = [1, 0];
    ballPrev = null;
    ballRest = null;
    redirectFiredShot = -1;
    sparksFiredShot = -1;
    impactFiredShot = -1;
    impactFiredPutt = -1;
    chipInFiredShot = -1;
    redirectDraw = null;
    cineZoom = 1;
    caddyCallout = null;
    tentCallout = null;
    tentFiredShot = -1;
    wallFiredShot = -1;
    wallSparkShot = -1;
    wallSparkNext = 1;
  }

  function spawnImpact(at: Vec, power: number): void {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 0.6 + power * 1.8;
      particles.push({ pos: [...at] as Vec, vel: [Math.cos(a) * sp, Math.sin(a) * sp], life: 1 });
    }
    shake = Math.min(1, power);
  }

  /** Spark spray at the instant the laser/boomerang meets the ball (GS-caddy) — brighter and faster
   *  than a normal impact, tinted to the weapon (laser = cyan, boomerang = warm). Deterministic
   *  (index-based, no Math.random), cosmetic. */
  function spawnSparks(at: Vec, kind: 'laser' | 'boomerang'): void {
    const base = kind === 'laser' ? '150,228,255' : '255,206,140';
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (i % 2 ? 0.32 : 0);
      const sp = 1.4 + (i % 5) * 0.7;
      particles.push({
        pos: [...at] as Vec,
        vel: [Math.cos(a) * sp, Math.sin(a) * sp - 0.5],
        life: 1,
        rgb: i % 3 === 0 ? '255,255,255' : base,
        grav: 0.05,
      });
    }
    shake = Math.max(shake, 0.75);
  }

  // A knocked-down ball rattles the canopy: a little green leaf-fall at the clip point, so the
  // player SEES the tree stop the ball (the trees lie is the real cost — see flight.ts).
  function spawnLeaves(at: Vec): void {
    const greens = ['46,120,60', '90,168,84', '60,140,70'];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI; // spray downward-ish
      const sp = 0.5 + (i % 3) * 0.4;
      particles.push({
        pos: [at[0] + (i - 5), at[1]] as Vec,
        vel: [Math.cos(a) * sp, Math.abs(Math.sin(a)) * sp * 0.4],
        life: 1,
        rgb: greens[i % greens.length],
        grav: 0.08,
      });
    }
    shake = Math.max(shake, 0.3);
  }

  /** Per-surface TOUCHDOWN feedback (GS-biome-feel): the landing used to look identical whether the
   *  ball found lava, water, sand or the void. Now the surface answers — a blue splash, a fiery lava
   *  burst with a kick of shake, a violet implosion as the void swallows the ball, a sand puff, an
   *  icy skitter, a crystal chime-glint. Deterministic (index-based, no Math.random), cosmetic —
   *  the sim already resolved the lie/penalty; this just makes it FELT. */
  function spawnLandFX(at: Vec, lie: string, penalty?: string): void {
    const burst = (n: number, rgbs: string[], opts: { up?: number; spread?: number; grav?: number; ring?: boolean }) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (i % 2 ? 0.4 : 0);
        const sp = (0.7 + (i % 4) * 0.5) * (opts.spread ?? 1);
        if (opts.ring) {
          // Implosion: start on a ring and get pulled INTO the point (the void feeds).
          const r0 = 10 + (i % 3) * 5;
          particles.push({ pos: [at[0] + Math.cos(a) * r0, at[1] + Math.sin(a) * r0] as Vec, vel: [-Math.cos(a) * sp * 1.1, -Math.sin(a) * sp * 1.1], life: 1, rgb: rgbs[i % rgbs.length], grav: 0 });
        } else {
          particles.push({ pos: [...at] as Vec, vel: [Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - (opts.up ?? 0)], life: 1, rgb: rgbs[i % rgbs.length], grav: opts.grav ?? 0.06 });
        }
      }
    };
    if (penalty === 'lava') {
      burst(18, ['255,138,42', '255,210,74', '255,90,30'], { up: 1.6, spread: 1.3, grav: 0.04 }); // magma burst
      shake = Math.max(shake, 0.7);
    } else if (penalty === 'void' || penalty === 'voidlost') {
      burst(16, ['176,126,255', '126,212,255', '230,160,255'], { ring: true }); // the void swallows it
      shake = Math.max(shake, 0.45);
    } else if (penalty === 'cetuslost') {
      burst(14, ['122,240,255', '235,252,255', '150,222,255'], { up: 1.4, grav: 0.08 }); // into the star-ocean
    } else if (penalty === 'water' || lie === 'water' || lie === 'creek' || lie === 'frozenpond') {
      // GS-toxic-pools: the Toxic Mire's water is a glowing acid pool, so it throws a NEON-GREEN
      // caustic splash instead of the ordinary blue one (every other world keeps the blue splash).
      const toxic = archetypeFor(opts.themeId, opts.biome ?? '') === 'swamp' && !opts.rainbow;
      if (toxic) burst(14, ['96,255,150', '210,255,150', '38,224,110'], { up: 1.5, grav: 0.09 }); // acid splash
      else burst(14, ['150,210,255', '235,246,255', '111,179,236'], { up: 1.5, grav: 0.09 }); // splash
    } else if (penalty === 'ravine' || lie === 'barranca') {
      burst(10, ['138,111,74', '107,90,72'], { up: 0.8, grav: 0.07 }); // rockfall dust
    } else if (lie === 'bunker' || lie === 'pot' || lie === 'waste' || lie === 'sand') {
      // GS-rusted-bunkers: the Scrap Belt digs RUST pits, so it kicks up a rust-flake puff instead of
      // the pale sand one (every other world keeps the sand puff — mirrors the toxic-splash swap).
      const rusted = archetypeFor(opts.themeId, opts.biome ?? '') === 'metal' && !opts.rainbow;
      if (rusted) burst(10, ['165,98,58', '211,138,82', '110,64,34'], { up: 1.0, grav: 0.07 }); // rust-flake puff
      else burst(10, ['233,216,166', '196,173,111'], { up: 1.0, grav: 0.07 }); // sand puff
    } else if (lie === 'ice') {
      burst(8, ['255,255,255', '205,238,247'], { up: 0.3, spread: 1.5, grav: 0.02 }); // icy skitter
    } else if (lie === 'crystal') {
      burst(8, ['191,240,255', '255,255,255'], { up: 1.2, spread: 0.8, grav: 0.03 }); // chime glints
    } else if (lie === 'scorch') {
      burst(12, ['150,140,132', '255,150,60', '96,84,76'], { up: 1.1, spread: 1.1, grav: 0.05 }); // ash + embers
    } else if (lie === 'stardust') {
      burst(12, ['235,250,255', '150,225,255', '255,255,255'], { up: 1.3, spread: 1.0, grav: 0.02 }); // charged glitter
    } else if (lie === 'junk') {
      burst(10, ['150,164,188', '96,106,124', '255,120,80'], { up: 0.9, spread: 1.2, grav: 0.07 }); // rattled scrap + a spark
    } else if (lie === 'tar') {
      burst(9, ['40,26,60', '90,60,140', '20,14,30'], { up: 0.4, spread: 0.6, grav: 0.12 }); // heavy tar glob — plugs, no run
    } else if (lie === 'acid') {
      burst(13, ['96,255,150', '190,250,150', '38,224,110'], { up: 1.2, spread: 0.9, grav: 0.08 }); // caustic fizz splash
    } else if (lie === 'trees') {
      spawnLeaves(at); // rattled the canopy on arrival
    }
  }

  // Meteor-strike scorch craters (GS-meteor-scorch): the SAME mark source the sim's lie conversion
  // reads (sim/scorch.ts), so the touchdown FX below answers exactly the craters that bite.
  const scorchMarks = opts.meteorScorch ? meteorScorchFor(hole) : [];
  // Effect ground patches (GS-journey-fx-2): same contract — the SAME patch source the sim reads.
  const patchMarks = opts.groundPatch ? effectPatchesFor(hole, opts.groundPatch) : [];
  const patchLie = opts.groundPatch ? PATCH_SPECS[opts.groundPatch].lie : undefined;

  // The full static world (rough texture, striped/banded surfaces, depth-banded water,
  // cell-shaded trees, OB, centreline, tee + flag) comes from the SAME shared scene builder
  // the SVG map uses, so the two renderers agree. Cache by projector identity: a whole-hole
  // fit builds once; follow-cam rebuilds the projector per frame, so the scene rebuilds too.
  // The moving Cetus star-waterfall (GS-cetus-flow): on a Cetus hole the play view suppresses the
  // scene's STATIC river (`animateCetus`) and draws the SAME channel geometry as a live, flowing
  // waterfall over the scene (below). Cheap: it re-projects a short polyline + advances seeded
  // particles per frame — no scene rebuild — so it doesn't chug the follow-cam. Absent elsewhere.
  // Skip the world-decor twins on the putts-only green watch (GS-cetus-flow / GS-ship-feel): the tight
  // putt zoom floated the drifting ship SECTIONS weirdly over the cup. A shot watch keeps them on.
  const ambientDrift = opts.ambientDrift !== false;
  const isCetus = archetypeFor(opts.themeId, opts.biome ?? '') === 'cetus' && !opts.rainbow;
  const cetusFlow = isCetus && ambientDrift ? createCetusFlow(hole) : null;
  // The derelict's DRIFTING SPACE JUNK (GS-ship-feel): torn hull-plates tumble through the open space
  // around the wreck. Same cheap per-frame model as the cetus flow (re-project + advance seeded chunks,
  // no scene rebuild), play-view only, so the SVG map stays byte-identical. Absent on every other world.
  const isDerelict = archetypeFor(opts.themeId, opts.biome ?? '') === 'derelict' && !opts.rainbow;
  const shipDrift = isDerelict && ambientDrift ? createShipDrift(hole) : null;
  const flowAccents = artFeel().accents;

  let cachedProj: typeof proj | null = null;
  let cachedScene: Prim[] = [];
  // The PAINTED scene at `cachedProj`, kept so a still camera can blit instead of re-stroking the
  // world (GS-shot-lag). Built lazily — a mount whose camera never settles never allocates it.
  let sceneBitmap: HTMLCanvasElement | null = null;
  let bitmapProj: typeof proj | null = null;
  /**
   * Paint the static world.
   *
   * Two caches, and the second is the one that matters. The scene PRIMS are cached by projector
   * identity (a whole-hole fit builds once; a panning follow-cam rebuilds), but that only skips the
   * BUILD — the world was still stroked, filled, clipped and gradient-ed into the canvas every single
   * frame, even when the camera had not moved a pixel and the picture was provably identical.
   * MEASURED, because the top-level prim count badly understates it: `buildScene` returns ~1,000–1,900
   * prims, but most of the world lives inside `clip` groups, and painting a green at the PUTT camera
   * issues about **97,000 canvas operations** — every frame. On a putts-only watch, where the camera
   * is deliberately STILL (`follow: hadShots`, see app.ts), 100% of that was waste, and the green ran
   * at 3.3 fps under a 12× CPU throttle: the laggiest screen in the game.
   *
   * So: while the projector is unchanged the scene is painted ONCE into an offscreen canvas and
   * blitted. Byte-identical output by construction — the same prims through the same painter, just
   * into a different surface — so this can never change what is drawn, only how often it is drawn.
   * A moving camera skips the offscreen entirely (painting it as well as the frame would be strictly
   * more work), and the first still frame after a pan pays one extra paint to fill it.
   *
   * The offscreen takes the play canvas's OWN device dimensions and is blitted back at exactly those
   * dimensions in CSS units, so under `ctx`'s dpr scale the copy is 1:1 and cannot soften. It must be
   * `canvas.width`, never a re-derived `width * dpr`: `dpr` folds in the UI zoom (GS-a11y-readable-
   * text) and is routinely fractional, and a canvas's width attribute TRUNCATES — so the two would
   * disagree by a device pixel and resample the whole world. Drawn at 0,0 under whatever transform
   * the caller has set, so the screen-shake translate applies to the blit exactly as it applied to
   * the prims. Nothing is cleared first, for the same reason the direct path never was: the scene's
   * own space base covers the frame, and where it doesn't, source-over leaves what the prims left.
   */
  function drawStatic(): void {
    if (proj !== cachedProj) {
      cachedScene = buildScene(hole, proj, { width, height, biome: opts.biome, themeId: opts.themeId, rainbow: opts.rainbow, tradeTents: opts.tradeTents, meteorScorch: opts.meteorScorch, groundPatch: opts.groundPatch, animateCetus: isCetus });
      cachedProj = proj;
      bitmapProj = null; // the bitmap now shows the wrong camera
      drawScenePrims(ctx, cachedScene);
      return;
    }
    if (bitmapProj !== proj) {
      if (!sceneBitmap) {
        sceneBitmap = document.createElement('canvas');
        sceneBitmap.width = canvas.width;
        sceneBitmap.height = canvas.height;
      }
      const bctx = sceneBitmap.getContext('2d');
      if (!bctx) {
        // No second context (an exhausted canvas budget on a low-end device): fall back to the
        // classic per-frame paint rather than dropping the world off the screen.
        sceneBitmap = null;
        drawScenePrims(ctx, cachedScene);
        return;
      }
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, width, height);
      drawScenePrims(bctx, cachedScene);
      bitmapProj = proj;
    }
    ctx.drawImage(sceneBitmap!, 0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  function drawHUD(text: string): void {
    // Keep the flight / putt label clear of the system status bar (GS-play-safearea). The play
    // canvas is FULL-BLEED (`.gs-shot--full .gs-bigmap` is `inset: 0`), so a label at canvas y=8
    // is painted underneath the clock and battery on any device that overlays the status bar —
    // which is what put "5-Iron · 114 yds" on top of the time. CSS `env()` can't help here: to CSS
    // a canvas is one opaque box, so the inset has to be measured and applied in canvas space.
    // `ctx` is already `scale(dpr, dpr)`d, so its user units ARE CSS pixels and the insets apply
    // directly with no DPR multiply.
    const sa = safeAreaInsets();
    const x = 8 + sa.left;
    const y = 8 + sa.top;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(text).width + 16;
    ctx.fillRect(x, y, w, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x + 8, y + 16);
  }

  // Animated atmosphere — the always-on space ambience (twinkling stars + the odd shooting star),
  // the VISIBLE wind, and the journey route's weather EFFECT (moonlight / meteors / aurora / solar
  // storm / debris / trade camp). All screen-space sky+air, drawn by the SHARED weather module so the
  // in-flight view and the aim/putt overlays look identical (GS-journey-fx rework). Off a seeded
  // stream (deterministic, perturbs no sim); `_gsFeel.spaceFX` / `.wind` still gate the ambience.
  const windArch = archetypeFor(opts.themeId, opts.biome ?? '');
  const windSpd = hole.wind?.spd ?? 0;
  const windDirRad = ((hole.wind?.dir ?? 0) * Math.PI) / 180;
  function windScreenDir(): Vec {
    const c0 = hole.tee;
    const c1: Vec = [c0[0] + Math.sin(windDirRad), c0[1] + Math.cos(windDirRad)];
    const a = proj.project(c0);
    const b = proj.project(c1);
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }
  // The land footprint the twinkle starfield must stay OFF (GS-rough-frame): the same course-space
  // polys `buildScene` draws as ground, pushed through the LIVE projector each frame (the follow-cam
  // pans, so the mask is queried per draw). Stars twinkle only over true deep space — never over the
  // playable rough that used to read as "the rough is a starfield".
  const landCourse = landPolysCourseFor(hole, opts.rainbow);
  const weather: WeatherHandle = createWeather({
    effect: opts.effect ?? 'none',
    width,
    height,
    archetype: windArch,
    windSpd,
    windDir: windScreenDir(),
    seed: (Math.round(hole.tee[0] * 7 + hole.green[1] * 13 + hole.par * 101) >>> 0) ^ 0x51ed,
    spaceFX: F.spaceFX,
    wind: F.wind,
    starMask: () => landCourse.map((p) => p.map((pt) => proj.project(pt))),
    // Meteor STRIKES (GS-meteor-strikes): feed the sky the craters' live screen positions — the SAME
    // `meteorScorch(hole)` marks the sim reads, through the live projector (follow-cam-proof, like
    // starMask) — so every few seconds one meteor visibly dives in and re-burns a mark. A landing
    // answers with a soft distant-impact shake.
    strikeTargets: scorchMarks.length
      ? () => scorchMarks.map((m) => ({ c: proj.project(m.c), r: Math.max(4, m.r * proj.scale) }))
      : undefined,
    onStrike: () => {
      shake = Math.max(shake, 0.28);
    },
  });

  function frame(realNow: number): void {
    // Virtual animation clock (GS-caddy-slomo): advance by the real frame delta, scaled down while a
    // caddy effect is playing so the throw/drop is shown in slo-mo. Everything below times off `now`.
    if (!lastReal) lastReal = realNow;
    let dt = realNow - lastReal;
    lastReal = realNow;
    if (dt < 0) dt = 0;
    if (dt > 80) dt = 80; // clamp tab-switch / GC stalls so the clock can't lurch
    const scale = vnow < slowUntilV ? CADDY_SLOMO : 1;
    vnow += dt * scale;
    const now = vnow;
    if (!segStart) segStart = now;
    redirectDraw = null; // recomputed each frame by the redirect cinematic, if active

    // Helper: fire a caddy effect (slo-mo + speech bubble + voice/haptic via onCaddyEffect), once.
    const fireCaddyEffect = (cid: string | undefined): void => {
      if (!hasCaddyArt(cid)) return;
      slowUntilV = Math.max(slowUntilV, now + CADDY_SLOMO_MS);
      if (CADDY_VOICE[cid]) caddyCallout = { id: cid, until: now + CADDY_CALLOUT_MS };
      opts.onCaddyEffect?.(cid);
    };

    // Follow-cam: ease the camera toward the ball's last position and rebuild the projector,
    // so the view pans to keep up with the ball (one-frame lag is imperceptible).
    //
    // The ease is exponential, so once the ball is at rest the camera CONVERGES on it and never
    // arrives — and `buildProj()` mints a fresh projector object every frame regardless, which is
    // the cache key `drawStatic` compares on. So the world was rebuilt and repainted 60×/second to
    // draw a picture that had stopped changing (GS-shot-lag). Below a twentieth of a SCREEN PIXEL
    // the pan is not a pan: the camera settles, the projector is reused, and the scene cache holds
    // for the whole tail of the shot — the run-out, the rest, the beat before the card. Measured in
    // px, not yards, because that is what "the picture moved" means at any zoom.
    if (followMode && opts.follow) {
      const nx = camera[0] + (lastGround[0] - camera[0]) * 0.2;
      const ny = camera[1] + (lastGround[1] - camera[1]) * 0.2;
      const stepPx = Math.hypot(nx - camera[0], ny - camera[1]) * proj.scale;
      const arrived = camera[0] === lastGround[0] && camera[1] === lastGround[1];
      if (stepPx > CAMERA_SETTLE_PX || cineZoom !== projZoom) {
        camera = [nx, ny];
        proj = buildProj();
        projZoom = cineZoom;
        weather.setWind(windScreenDir()); // keep the wind reading true as the camera pans
      } else if (!arrived) {
        // The final step: SNAP onto the ball rather than freezing a fraction of a pixel short of it.
        // One more rebuild, and then the camera is exactly where it was easing to and stays there —
        // so the resting frame is a definite picture rather than the limit of a series.
        camera = [lastGround[0], lastGround[1]];
        proj = buildProj();
        projZoom = cineZoom;
        weather.setWind(windScreenDir());
      }
    }

    // Screen-shake offset (deterministic decay). Reduced motion zeroes the AMPLITUDE rather than
    // skipping the block (GS-a11y-motion): the decay still runs, so every `shake = Math.max(…)` call
    // site downstream behaves identically and there is no second code path. Camera shake is the
    // single most nauseogenic thing on this screen and it had no motion gate at all.
    ctx.save();
    if (shake > 0) {
      const amp = shakeAmp * shake;
      if (amp > 0) ctx.translate(Math.sin(now * 0.08) * amp, Math.cos(now * 0.11) * amp);
      shake = Math.max(0, shake - 0.06);
    }

    drawStatic();
    // Ambient world/sky decor rides the shared WALL clock (`realNow` = the raw rAF timestamp, the SAME
    // `performance.now()` source the aim/putt overlay feeds) — NOT the slo-mo virtual `now`/`vnow` the
    // ball + caddy cinematic uses (GS-decor-view-states). Two reasons: (1) it stays PHASE-CONTINUOUS
    // across the aim→watch view switch, so the weather/river/junk never teleport when you release a shot
    // (the old vnow started at 0 each mount → a jump); (2) the ambient world shouldn't slow to a crawl
    // during a caddy save's slow-mo — only the shot does.
    weather.draw(ctx, realNow);
    // The moving Cetus star-waterfall (GS-cetus-flow), over the scene + weather but UNDER the ball,
    // FX and HUD (drawn later) so the ball still flies clearly over the river of stars.
    cetusFlow?.draw(ctx, proj, realNow, flowAccents, F.cetusFlowSpeed);
    shipDrift?.draw(ctx, proj, realNow, flowAccents, F.shipDriftSpeed);

    // A GUARD caddy stands in the bottom-left corner the whole hole (GS-caddy) — its muzzle anchor is
    // where the Space Ducks laser / Convict Sheep boomerang launches from on a redirect. Only guards
    // are shown persistently (the no-clutter rule); any other hired caddy appears transiently for its
    // own effect (the chip-in callout below). The force-redirect DEMO shows a guard here even when
    // none is hired so the throw can be watched on demand.
    const cornerCaddyId =
      (caddyProjectile(opts.caddyId) ? opts.caddyId : undefined) ?? forcedRedirectCaddy(F.forceRedirect);
    // The caddy that should be VISIBLE in the corner this frame: the persistent guard, or — during a
    // callout (e.g. Dr Chipinski's chip-in) — the calling caddy, so its bubble has a figure to point at.
    const calloutActive = caddyCallout && now < caddyCallout.until ? caddyCallout : null;
    const figureCaddyId =
      cornerCaddyId ?? (calloutActive && hasCaddyArt(calloutActive.id) ? calloutActive.id : undefined);
    // GS-hud-frame: when the HUD is showing this caddy in its permanent badge slot, the badge IS the
    // figure — anchor the projectile + bubble on it and draw nothing here (drawing both put the same
    // caddy on screen twice). Only ever set for the caddy the badge is actually showing.
    if (opts.caddyAnchor && hasCaddyArt(figureCaddyId)) {
      caddyAnchor = opts.caddyAnchor.muzzle;
      caddyHead = opts.caddyAnchor.head;
    } else if (hasCaddyArt(figureCaddyId)) {
      const ch = Math.max(40, Math.min(56, height * 0.085));
      const cx = ch * 0.7 + 6;
      const cy = height - 14;
      caddyAnchor = drawCaddy(ctx, figureCaddyId, cx, cy, ch, now, opts.lefty);
      // The speech bubble points at the caddy's HEAD (top of the figure), not its weapon hand — the
      // muzzle anchor sat mid-figure so the bubble floated off to the side ("a bit off position").
      caddyHead = [cx, cy - ch * 0.92];
      ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(CADDY_LABEL[figureCaddyId as CaddyArtId], cx, cy + 9);
      ctx.textAlign = 'left';
    }

    let hudText = '';

    if (shotIndex < shots.length) {
      const shot = shots[shotIndex]!;
      const carry = shot.result.carry;
      const touchdown = shot.result.landing;
      const rest = shot.rest ?? touchdown;
      // The sim resolves `shot.penalty` at REST (after the roll-out), but the landing FX/voice fire at
      // TOUCHDOWN. For every ordinary world these coincide (penalty surfaces are kept off the corridor,
      // so a ball that lands safe never rolls into one). But on lost-rough islands (void/cetus) the ball
      // routinely lands SAFE on the fairway island and then trickles off the edge INTO the void — so its
      // "lost ball" implosion + void/whale voice must fire where the ball comes to REST, not on the safe
      // fairway landing (the "lost-ball noise played on the fairway, not in the void" bug). The ball
      // landed directly in the penalty ⇔ its touchdown lie === its rest lie; otherwise it rolled in.
      const penaltyAtRest = !!shot.penalty && (shot.landLie ?? shot.lieTo) !== shot.lieTo;
      // The arc apex the SIM resolved (loft-scaled) + the club FAMILY's apex position (GS-flight-3),
      // so the drawn height matches the physics that decided whether a tree knocked the ball down —
      // a driver visibly bores while a wedge towers. The curved ground path launches along the shot
      // bearing and bends to the landing (the fade/hook banana).
      const peak = shot.result.apex;
      // The club family's real flight PROFILE (GS-flight-shape) — height is read off how much GROUND
      // the ball has covered, so the drawn arc is the shot's height-vs-distance curve: a near-straight
      // climb to the family's apex position, then a steepening fall onto its own descent angle.
      const arc = arcShapeOf(shot.club.id);
      // How much forward speed the ball still has as it touches down, per FAMILY (GS-flight-hang).
      // Animation pacing only — the drawn path is untouched — but it is what makes a lofted club
      // SETTLE onto the turf instead of arriving at the speed it left the face.
      const taper = flightProfileOf(shot.club.id).dragTaper;
      const groundAt = (u: number): number => flightGroundAt(u, F, taper);
      const bearing = shot.result.shotBearing;
      const flightDur = flightDurationMs(peak);
      const [tdx, tdy] = proj.project(touchdown);
      const [rsx, rsy] = proj.project(rest);
      // The LAND → BOUNCE → RUN-OUT plan (GS-runout-feel). The sim already decided the roll distance
      // and (on a contoured green) the curved path; this decides WHEN the ball is where and how high
      // it is off the ground, from the surface it landed on and the speed it arrived at.
      //
      // `v0` is the ball's ACTUAL horizontal speed as the flight ends, measured off the same flight
      // geometry it was just drawn flying — so the first hop leaves at (very nearly) the speed the
      // ball arrived and there is no velocity step anywhere from strike to rest. The old run-out
      // started from a duration (`20ms × yards`, floored at 150ms) that had nothing to do with the
      // flight, which is half of why a short check read as a teleport.
      // THE GRAVITY CREEP IS ITS OWN EVENT, NOT THE TAIL OF THE ROLL (GS-roll-hairpin). The sim runs the
      // ball out, and where it STOPS on a steep piece of sculpt the mound field pulls it on down the fall
      // line — a direction that owes nothing to the way it was travelling, so it can double back by up to
      // 180°. Blended into the roll it was drawn as one continuous decelerating sweep straight through the
      // reversal, which is the "weird path roll … looks buggy as heck" report: the ball never appears to
      // stop, so it reads as a magnet yanking it rather than gravity taking a ball at rest. The sim now
      // says WHERE it stopped (`creepFrom`) and the run-out plan is built on the roll ALONE; the creep
      // gets its own slow phase below. No `creepFrom` ⇒ `rollYds` is the whole roll, exactly as before.
      const rollTotalYds = Math.abs(shot.roll ?? 0);
      const rollYds = shot.creepFrom !== undefined ? Math.min(shot.creepFrom, rollTotalYds) : rollTotalYds;
      const creepYds = Math.max(0, rollTotalYds - rollYds);
      const landFirm = surfaceFirmness(shot.landLie ?? shot.lieTo);
      // A backspin CHECK is drawn as a forward skid that reverses. A Dr Chipinski chip-in
      // (GS-chipin-roll) appends a forward trickle into the cup, so its path ends AHEAD of the pitch
      // mark and is walked straight through — the ball going in beats the check drama.
      const isCheck = (shot.roll ?? 0) < -0.3 && !shot.chipIn;
      if (runoutShot !== shotIndex) {
        runoutShot = shotIndex;
        const VEPS = 0.02;
        // The ball's ARRIVAL speed, measured off the drawn pace (GS-flight-pace) — `u` is animation
        // progress, so the curved flight maps through `flightT` exactly as the drawn ball does. Before
        // that mapping existed this measured the bottom of the Bézier's speed collapse and handed the
        // whole run-out chain 2% of the flight's average speed.
        const endAt = (u: number): Vec =>
          shot.flightPath && shot.flightPath.length > 1
            ? samplePolylineFlight(shot.flightPath, u, peak, arc).ground
            : sampleCurvedFlight(shot.from, touchdown, bearing, groundAt(u), peak, arc).ground;
        const a = endAt(1 - VEPS);
        const b = endAt(1);
        const v0 = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, VEPS * flightDur);
        // How STEEPLY it came down — the TERMINAL slope of the arc the ball just flew, off the same
        // shared geometry (GS-flight-shape). Shallow arrivals skip and run; steep ones pop up and
        // stop, and that one number is most of why the clubs feel different on the ground. It used to
        // be sampled as a chord over the closing tenth, to dodge the old arc's vertical touchdown
        // tangent; the arc now lands at a real angle, so it can simply be asked.
        const flightRun =
          shot.flightPath && shot.flightPath.length > 1 ? polylineLength(shot.flightPath) : carry;
        const descentDeg = arrivalAngleDeg(peak, flightRun, arc);
        // Per-shot variation with ZERO rng (contract 1): a stable hash of the shot's own geometry, so
        // the same shot always lands the same way and no two drives land alike.
        const vary = shotVariance(shot);
        // The ground a given distance INTO the run-out — how a hazard gets to act on the bounce.
        const rollDir: Vec = (() => {
          const dx = rest[0] - touchdown[0];
          const dy = rest[1] - touchdown[1];
          const l = Math.hypot(dx, dy);
          return l > 1e-6 ? [dx / l, dy / l] : [0, 1];
        })();
        const firmAt = (along: number): number =>
          surfaceFirmness(lieAt(hole, [touchdown[0] + rollDir[0] * along, touchdown[1] + rollDir[1] * along]));
        const land = {
          dist: rollYds,
          firm: landFirm,
          v0,
          carry,
          descentDeg,
          checking: isCheck,
          holed: shot.holed,
          clubId: shot.club.id,
          vary,
          firmAt,
          // How big the ball is DRAWN, in the run-out's own height units, so a hop that could never
          // lift it clear of itself is not planned (GS-runout-seen). This is the ball-draw below run
          // BACKWARDS through the very same expression — `height * scale * heightExaggeration *
          // hopDrawBoost` — so the plan's question and the drawing are one description, and neither
          // has to guess what camera the shot is being watched at.
          ballYd:
            ballRadiusPx(proj.scale, 0, F) /
            Math.max(1e-6, proj.scale * F.heightExaggeration * F.hopDrawBoost),
        };
        runoutPlan = planRunout(land, F);
      }
      const plan =
        runoutPlan ??
        planRunout({ dist: rollYds, firm: landFirm, v0: 0.2, carry, descentDeg: 45, checking: isCheck, clubId: shot.club.id }, F);
      const rollDur = plan.totalMs;
      // The creep's own clock: a beat of stillness so the ball is SEEN to stop, then a slow trickle.
      const creepDur = creepYds > 1e-6 ? Math.max(F.creepMinMs, creepYds * F.creepMsPerYd) : 0;
      const creepPause = creepDur > 0 ? F.creepPauseMs : 0;
      const runDur = rollDur + creepPause + creepDur; // the whole ground phase, creep included
      // A swing windup leads each full shot: the ball rests at address while the golfer winds
      // up and swings, and the actual flight clock starts at CONTACT (lead ms in).
      const lead = F.golfer ? F.swingLeadMs : 0;
      const flightElapsed = now - segStart - lead;
      // The selected golfer's look (GS-18), or the loader-crew cap cycle when none is set.
      const baseLook = opts.golferLook ?? lookFromColor(GOLFER_COLORS[shotIndex % GOLFER_COLORS.length]!);
      // The cosmetic DRIVER skin (GS-thor: Thor's Hammer) is the DRIVER's club head ONLY — an iron,
      // wedge or chip swings the plain (or in-run gear-themed) club, not a warhammer. Strip the skin
      // off every non-driver shot so it reads as the tee-club flourish it is. (Driver club id 'D',
      // stable across reward drivers, which keep the base club TYPE as their id — see economy.ts.)
      const look: GolferLook =
        baseLook.driver && shot.club.id !== 'D' ? { ...baseLook, driver: undefined } : baseLook;
      // Golfer size: nudged by zoom but clamped so it always reads next to the ball + flag; a
      // bigger-built golfer stands a touch taller.
      const golferH = Math.max(30, Math.min(60, F.golferPx * look.build * Math.max(0.85, Math.min(1.5, proj.scale / 2.4))));
      // The BALL's cover (GS-ball-art). An equipped Story BALL already carries a palette + style for
      // its flight tracer; the ball itself now wears the matching cover, so one cosmetic dresses both
      // ends of the shot instead of the trail alone. No ball equipped ⇒ the plain white `classic`.
      const ballSkin = ballSkinFor(look);

      if (flightElapsed < 0) {
        // --- Windup: ball at rest at the address point, golfer addresses → top → contact.
        lastGround = shot.from; // keep the follow-cam centred on the ball
        const [bx, by] = proj.project(shot.from);
        const addrR = ballRadiusPx(proj.scale, 0, F);
        drawBallShadow(ctx, bx, by, addrR, 0);
        if (F.golfer) drawGolfer(ctx, bx, by, golferH, clamp01((now - segStart) / lead), 0, 1, look, opts.lefty);
        // At address the ball is dead still — phase 0, so it sits with its mark up, like a teed ball.
        drawBall(ctx, bx, by, addrR, { phase: 0, dirX: 1, dirY: 0, skin: ballSkin, feel: F });
        ballPrev = shot.from;
        hudText = `${shot.club.name} · ${Math.round(carry)} yds`;
      } else {
        const elapsed = flightElapsed;
        // Strike cue — fire once as the ball launches (contact). Quality from how straight the
        // shot finished relative to its carry, so a pure strike rings and a wild one thuds.
        if (impactFiredShot !== shotIndex) {
          impactFiredShot = shotIndex;
          const brq = (shot.result.shotBearing * Math.PI) / 180;
          const lat =
            (shot.result.landing[0] - shot.from[0]) * Math.cos(brq) +
            (shot.result.landing[1] - shot.from[1]) * -Math.sin(brq);
          const mf = carry > 0 ? Math.abs(lat) / carry : 0;
          opts.onImpact?.('shot', Math.max(0, 1 - mf / 0.2), shot.club.id);
          // Dr Chipinski (GS-caddy-voices) answers the call AT THE STRIKE, not as the ball drops in.
          // Firing it on the hole-out made the chip-in read as a verdict handed down after the fact —
          // "it feels like cheating instead of chipping in". The doctor calls it as the ball leaves
          // the club and you watch the shot make good on it, which is the whole joke.
          if (shot.chipIn && chipInFiredShot !== shotIndex) {
            chipInFiredShot = shotIndex;
            fireCaddyEffect(opts.caddyId);
          }
        }
        let ground: Vec;
        let height: number;
        // Which spin regime the ball is in (GS-ball-art): airborne on its flight ⇒ steady backspin;
        // running out ⇒ roll off its own screen displacement.
        const rollPhase = elapsed >= flightDur;
        let zoomTarget = 1; // redirect zoom-to-impact target (1 = no zoom); eased into cineZoom below
        if (elapsed < flightDur) {
          const tg = elapsed / flightDur;
          // GS-flight-pace: the SAMPLING parameter. `tg` stays the raw animation progress (the caddy
          // redirect cinematic gates on it), and `tf` is where along the Bézier that progress actually
          // puts the ball — near-constant GROUND speed instead of a curve that stops dead at the
          // landing. The path is identical; only the pacing moves.
          const tf = groundAt(tg);
          // Real caddy-guard redirect (GS-caddy), or — in the force-redirect DEMO — a fabricated one so
          // the throw fires on every shot. caddyProjectile(cornerCaddyId) is the active guard's kind.
          const projKind = caddyProjectile(cornerCaddyId);
          const rd =
            shot.result.redirect ??
            (F.forceRedirect && projKind ? fabricateRedirect(projKind, touchdown, bearing, carry, opts.lefty) : undefined);
          if (rd) {
            // Caddy-guard SLOW-MO interception (GS-caddy). The ball flies toward the would-be miss; the
            // caddy looses its shot at FIRE_FRAC and — KEY FIX — the projectile is tied to the same
            // flight progress `tg`, so it MEETS the ball at HIT_FRAC instead of chasing a frozen point
            // on a separate clock (the "no longer hits the ball" bug). At contact: a spark spray; the
            // camera zooms in; then the ball is knocked back onto the fairway. Slow-mo via fireCaddyEffect.
            // Eyes-on feel; the SCORE already used the redirected landing.
            const interceptFrac = REDIRECT_HIT_FRAC;
            const fireFrac = REDIRECT_FIRE_FRAC;
            const sI = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, groundAt(interceptFrac), peak, arc);
            // Intercept screen point, recomputed EVERY frame so it tracks the camera pan + zoom.
            const impactScreen: Vec = [0, 0];
            {
              const [ipx, ipy] = proj.project(sI.ground);
              impactScreen[0] = ipx;
              impactScreen[1] = ipy - sI.height * proj.scale * F.heightExaggeration;
            }
            if (tg >= fireFrac && redirectFiredShot !== shotIndex) {
              redirectFiredShot = shotIndex;
              shake = Math.max(shake, 0.4);
              // Slow the world + sound the caddy's catchphrase as the guard makes the save.
              fireCaddyEffect(forcedRedirectCaddy(rd.kind));
              // The launch sound (GS-audio-4): pass the REAL ms until contact — the intercept arc
              // in virtual time, stretched by the slow-mo the fireCaddyEffect above just armed —
              // so the laser whine / boomerang whir ends exactly as the hit cue takes over.
              opts.onRedirect?.(rd.kind, 'fire', ((interceptFrac - fireFrac) * flightDur) / CADDY_SLOMO);
            }
            // Projectile: progress tied to the ball's flight, so it arrives at the intercept (pp=1)
            // exactly as the ball does. A short lead past contact lets it visibly strike.
            if (tg >= fireFrac && tg < interceptFrac + 0.06) {
              const pp = clamp01((tg - fireFrac) / (interceptFrac - fireFrac));
              redirectDraw = { kind: rd.kind, from: caddyAnchor, to: impactScreen, p: pp };
            }
            // Contact: spark spray (once) + an expanding shock ring for a beat.
            if (tg >= interceptFrac && sparksFiredShot !== shotIndex) {
              sparksFiredShot = shotIndex;
              spawnSparks(impactScreen, rd.kind);
              opts.onRedirect?.(rd.kind, 'hit'); // the projectile meets the ball (GS-audio-4)
            }
            const sinceHit = tg - interceptFrac;
            if (sinceHit >= 0 && sinceHit < 0.16) {
              const rp = sinceHit / 0.16;
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.strokeStyle = `rgba(${rd.kind === 'laser' ? '150,228,255' : '255,206,140'},${(1 - rp) * 0.85})`;
              ctx.lineWidth = 2.5 * (1 - rp) + 0.5;
              ctx.beginPath();
              ctx.arc(impactScreen[0], impactScreen[1], 4 + rp * 46, 0, Math.PI * 2);
              ctx.stroke();
              ctx.restore();
            }
            // Zoom-to-impact: ease IN over the approach to contact, hold, ease back OUT on the knock.
            if (tg < interceptFrac)
              zoomTarget = 1 + (REDIRECT_ZOOM - 1) * easeInOut(clamp01((tg - fireFrac) / (interceptFrac - fireFrac)));
            else if (tg < interceptFrac + 0.14) zoomTarget = REDIRECT_ZOOM;
            else zoomTarget = REDIRECT_ZOOM + (1 - REDIRECT_ZOOM) * easeInOut(clamp01((tg - interceptFrac - 0.14) / 0.3));

            height = sampleCurvedFlight(shot.from, touchdown, bearing, tf, peak, arc).height;
            if (tg < interceptFrac) {
              ground = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, tf, peak, arc).ground;
            } else {
              const e = easeInOut((tg - interceptFrac) / (1 - interceptFrac));
              ground = [
                sI.ground[0] + (touchdown[0] - sI.ground[0]) * e,
                sI.ground[1] + (touchdown[1] - sI.ground[1]) * e,
              ];
            }
          } else if (shot.flightPath && shot.flightPath.length > 1) {
            // Ship-corridor PINBALL flight (GS-ship-pinball-flight): walk the sim's STRAIGHT reflected
            // polyline — the ball flies straight and cracks off the bulkheads down the hallway, never the
            // parkland banana. Same segments the aim/physics used (graphic ≡ physics).
            const fp = shot.flightPath;
            const s = samplePolylineFlight(fp, tg, peak, arc);
            ground = s.ground;
            height = s.height;
            // Fire a metal spark + hull clang at EACH interior bounce vertex the instant the ball reaches it
            // (by arc length) — the crack off the bulkhead lands where the ricochet actually is, mid-flight,
            // not at the far landing. (The old single touchdown clang is skipped for ship shots below.)
            if (wallSparkShot !== shotIndex) {
              wallSparkShot = shotIndex;
              wallSparkNext = 1;
            }
            let total = 0;
            for (let i = 1; i < fp.length; i++) total += Math.hypot(fp[i]![0] - fp[i - 1]![0], fp[i]![1] - fp[i - 1]![1]);
            let acc = 0;
            for (let i = 1; i < fp.length - 1; i++) {
              acc += Math.hypot(fp[i]![0] - fp[i - 1]![0], fp[i]![1] - fp[i - 1]![1]);
              const frac = total > 0 ? acc / total : 1;
              if (i >= wallSparkNext && tg >= frac) {
                const [vx, vy] = proj.project(fp[i]!);
                spawnLandFX([vx, vy], 'junk'); // shower of sparks + a scrap rattle off the steel bulkhead
                shake = Math.max(shake, 0.34);
                opts.onWallBounce?.(1);
                wallSparkNext = i + 1;
              }
            }
          } else {
            const s = sampleCurvedFlight(shot.from, touchdown, bearing, tf, peak, arc);
            ground = s.ground;
            height = s.height;
          }
        } else {
          // Land → bounce → run/check out → hold at rest. The ball travels touchdown→rest
          // (rest is BEHIND touchdown for a backspin check) while doing decaying hops, then sits
          // still for restHoldMs so you can read the finish. The bounce reads the LANDING surface's
          // firmness: a firm fairway/ice skips high and runs (taller hop, an extra bounce), thick
          // rough or a bunker plops dead (a low, quickly-damped hop).
          // Reset the trail once as the ball touches down: the aerial banana trail stays where it
          // landed and the run-out draws its own short ground trail, so the curve never appears to
          // kink sideways into the diagonal roll (the "loop-de-loop" read).
          if (lastRollClearShot !== shotIndex) {
            lastRollClearShot = shotIndex;
            trail = [];
            // The surface answers the touchdown (GS-biome-feel): splash / lava burst / void
            // implosion / sand puff / icy skitter — keyed off the lie the sim already resolved.
            // A touchdown ON a meteor-strike crater (GS-meteor-scorch) answers with ash + embers,
            // and one ON an effect ground patch (GS-journey-fx-2) with that family's burst — both
            // read from the SAME mark sources the sim's lie conversion uses.
            const onScorch = scorchMarks.length > 0 && inScorch(scorchMarks, touchdown);
            const onPatch = !onScorch && patchLie && patchMarks.length > 0 && inPatch(patchMarks, touchdown);
            const landLie = onScorch ? 'scorch' : onPatch ? patchLie : (shot.landLie ?? shot.lieTo);
            // Only carry the penalty into the TOUCHDOWN cue when the ball landed directly in it; a ball
            // that rolls off into the void fires its lost-ball cue at rest below, not on the safe landing.
            const tdPenalty = penaltyAtRest ? undefined : shot.penalty;
            spawnLandFX([tdx, tdy], landLie, tdPenalty);
            // The surface also ANSWERS in sound (GS-audio-3) — same resolved lie the FX just showed.
            opts.onLand?.(landLie, tdPenalty, shot.knockedDown);
          }
          // Trade-camp tent ricochet (GS-tents): the ball just bounced off a tent — pop an "Ow!" /
          // "Watch it!" bubble at the struck tent + cue the sound. A little screen-shake for the bonk.
          if (shot.tentHit && tentFiredShot !== shotIndex) {
            tentFiredShot = shotIndex;
            // The line is the struck tent's own (GS-tent-interactions) — a startled "Ow!", a grateful
            // marmot, a fortune teller, a shooed trader, a StarMart welcome. Anchor to the tent CENTRE
            // in course space so it stays put on the tent while the follow-cam pans.
            const text = TENT_LINES[shot.tentHit.effect] ?? 'Ow!';
            tentCallout = { at: shot.tentHit.c, text, until: now + TENT_CALLOUT_MS };
            shake = Math.max(shake, 0.3);
            opts.onTentHit?.(text);
          }
          // Ship-corridor wall ricochet (GS-ship-walls): the PINBALL flight (GS-ship-pinball-flight) already
          // sparked + clanged at each bulkhead vertex mid-flight (above), so a ship shot with a `flightPath`
          // skips this touchdown clang — its landing is deep in the corridor, NOT a wall. This fallback only
          // fires for a legacy wall-hit with no stored polyline (never, on the ship now).
          if (shot.wallHit && !shot.flightPath && wallFiredShot !== shotIndex) {
            wallFiredShot = shotIndex;
            spawnLandFX([tdx, tdy], 'junk'); // a shower of sparks + a scrap rattle off the steel wall
            shake = Math.max(shake, shot.wallHit.bounces >= 2 ? 0.5 : 0.32);
            opts.onWallBounce?.(shot.wallHit.bounces);
          }
          const rt = rollDur > 0 ? Math.min(1, (elapsed - flightDur) / rollDur) : 1;
          // Walk the SIM's own travel — the curled `rollPath` on a contoured green (GS-green-contour-2),
          // the straight touchdown→rest chord everywhere else — by ARC LENGTH. Contract 5: the drawn
          // run-out is the physics; only its TIMING and its hop heights are feel.
          const rollPath: Vec[] = shot.rollPath && shot.rollPath.length > 1 ? shot.rollPath : [touchdown, rest];
          let rollLen = 0;
          for (let i = 1; i < rollPath.length; i++) {
            rollLen += Math.hypot(rollPath[i]![0] - rollPath[i - 1]![0], rollPath[i]![1] - rollPath[i - 1]![1]);
          }
          const alongRoll = (want: number): Vec => {
            let left = Math.max(0, want);
            for (let i = 1; i < rollPath.length; i++) {
              const seg = Math.hypot(rollPath[i]![0] - rollPath[i - 1]![0], rollPath[i]![1] - rollPath[i - 1]![1]);
              if (left <= seg || i === rollPath.length - 1) {
                const f = seg > 1e-9 ? Math.min(1, left / seg) : 1;
                return [
                  rollPath[i - 1]![0] + (rollPath[i]![0] - rollPath[i - 1]![0]) * f,
                  rollPath[i - 1]![1] + (rollPath[i]![1] - rollPath[i - 1]![1]) * f,
                ];
              }
              left -= seg;
            }
            return rollPath[rollPath.length - 1]!;
          };
          // The roll's share of the drawn path. The sim's `roll` is arc length, so the run-out (built on
          // the roll ALONE) owns the path up to here and the creep owns the rest.
          const rollArc = rollTotalYds > 1e-6 ? rollLen * (rollYds / rollTotalYds) : rollLen;
          // The ballistic sample: `s` is signed travel in yards (negative only inside a backspin
          // drag-back, which really does travel back past the pitch mark), `h` the height off the deck.
          const rs = sampleRunout(plan, rt);
          if (creepDur > 0 && elapsed >= flightDur + rollDur + creepPause) {
            // GRAVITY CREEP (GS-roll-hairpin): the ball has stopped and sat still, and now the sculpt
            // takes it. Smoothstep — it eases OUT of rest and back INTO it, because both ends are a ball
            // at a standstill, and it is deliberately slower per yard than the roll that fed it.
            const ct = Math.min(1, Math.max(0, (elapsed - flightDur - rollDur - creepPause) / creepDur));
            const e = ct * ct * (3 - 2 * ct);
            ground = alongRoll(rollArc + (rollLen - rollArc) * e);
            height = 0;
          } else if (rs.s >= 0 && plan.check) {
            // Backspin beat one — the ball is still in the air, carrying its flight momentum FORWARD
            // down the shot bearing. (The sim's roll path runs the other way, so it can't be walked.)
            const br = (bearing * Math.PI) / 180;
            ground = [touchdown[0] + Math.sin(br) * rs.s, touchdown[1] + Math.cos(br) * rs.s];
          } else {
            // Beat two of a check, or an ordinary forward run: both walk the sim's own path, scaled so
            // the far end of the walk lands exactly where the ROLL ended (the creep phase above carries
            // it the rest of the way; with no creep `rollArc === rollLen` and this is unchanged).
            const frac = plan.totalDist > 1e-6 ? Math.abs(rs.s) / plan.totalDist : 1;
            ground = alongRoll(frac * rollArc);
          }
          height = rs.h;
        }

        lastGround = ground; // feed the follow-cam
        // Ease the redirect zoom toward its target (one-frame lag like the follow-cam; consumed by
        // buildProj next frame). zoomTarget is 1 outside a redirect, so non-redirect shots hold at 1.
        cineZoom += (zoomTarget - cineZoom) * 0.2;
        const [gx, gy] = proj.project(ground);
        // The drawn height. A bounce is exaggerated well past its modelled yards (GS-landing-real):
        // a real first bounce peaks ~2yd over a ~15yd skip, which at the shot camera's ~2px/yd is four
        // pixels under a ball drawn at three. The flight needs no such help — it is already 25yd up.
        const ballY = gy - height * proj.scale * F.heightExaggeration * (rollPhase ? F.hopDrawBoost : 1);

        // Golfer holds the follow-through at the address point, fading as the ball flies off.
        if (F.golfer && elapsed < F.followMs) {
          const [bx, by] = proj.project(shot.from);
          const fol = clamp01(elapsed / F.followMs);
          drawGolfer(ctx, bx, by, golferH, 1, Math.max(0.001, fol), 1 - fol, look, opts.lefty);
        }

        // The ball's own drawn size + its ground SHADOW (GS-ball-art). The old shadow was a fixed
        // 4x2px ellipse faded by `height / peak` — with `peak` being the FLIGHT apex, a half-yard
        // run-out hop moved that ratio by ~1%, so the shadow sat stone still and the hop it was
        // supposed to sell was invisible. This one reads the ball's actual screen LIFT, which is the
        // quantity a bounce changes.
        const loft = clamp01(height / (peak + 1));
        const ballR = ballRadiusPx(proj.scale, loft, F);
        drawBallShadow(ctx, gx, gy, ballR, gy - ballY);

        // Trail.
        trail.push([gx, ballY]);
        if (trail.length > F.trailLen) trail.shift();
        const tracePath = (): void => {
          ctx.beginPath();
          trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        };
        // GS-tracer: the flight trail reads the chosen golfer's colour (was a fixed yellow). GS-story-avatar:
        // an equipped Story BALL overrides it with its own tracer colour + STYLE — a fat glowing `comet` tail,
        // a sparking `ember` fire-trail, a `spark` hiss, or a plain coloured `line`. Absent (every non-Story
        // mode) → the cap-colour line, byte-for-byte unchanged.
        const tracer = look.ballTracer;
        const trailCol = tracer ? tracer.color : look.cap;
        const comet = tracer?.shape === 'comet';
        const fiery = tracer?.shape === 'ember' || tracer?.shape === 'spark';
        ctx.save();
        if (tracer && (tracer.glow || comet)) {
          // A soft wide aura under the trail for a glowing/comet ball.
          ctx.globalAlpha = 0.24;
          ctx.strokeStyle = tracer.glow ?? trailCol;
          ctx.lineWidth = comet ? 6.5 : 5;
          ctx.lineCap = 'round';
          tracePath();
          ctx.stroke();
        }
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = trailCol;
        ctx.lineWidth = comet ? 2.8 : 2;
        ctx.lineCap = 'round';
        tracePath();
        ctx.stroke();
        // Ember/spark balls scatter a few glinting motes along the freshest trail points.
        if (fiery && trail.length > 1) {
          ctx.fillStyle = tracer!.accent ?? trailCol;
          const from = Math.max(1, trail.length - 5);
          for (let i = from; i < trail.length; i++) {
            const p = trail[i];
            if (!p) continue;
            ctx.globalAlpha = 0.7 * ((i - from + 1) / (trail.length - from + 1));
            ctx.beginPath();
            ctx.arc(p[0], p[1], tracer!.shape === 'ember' ? 1.5 : 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();

        // The BALL. In the air on its flight it carries steady BACKSPIN (a struck ball does, and its
        // screen displacement there is 40 rad a frame, which is neither true nor watchable); the
        // moment it is running out it rolls off its own screen movement instead.
        //
        // A HAZARD THAT TAKES THE BALL TAKES IT (GS-ball-swallow). `ballRest = ground` was
        // unconditional, so a ball hit into water played its splash and then sat ON the surface,
        // fully visible, until the screen changed — and the same for lava and for the void. Whether
        // a hazard swallows is a fact about the hazard, so it is a `PEN_INFO` row (compile-forced
        // for a new `PenaltyKind`), not a list of strings kept in the renderer. An OB or unplayable
        // ball is still lying there in plain sight and correctly does NOT vanish.
        const swallowed = !!PEN_INFO[shot.penalty as PenaltyKind]?.swallows;
        const sink = swallowed ? clamp01((elapsed - flightDur - runDur * SINK_FROM) / Math.max(1, runDur * (1 - SINK_FROM))) : 0;
        ballRest = swallowed ? null : ground;
        if (rollPhase) rollBallTo(ground, (q) => proj.project(q), ballR);
        else {
          ballPhase = advanceFlightSpin(ballPhase, dt, F);
          ballPrev = ground;
        }
        // Sinking: shrink away and settle a little further down-screen, so it goes UNDER rather than
        // simply switching off. Fully gone before the splash FX lands on top of it.
        if (sink < 1) {
          drawBall(ctx, gx, ballY + ballR * 0.5 * sink, ballR * (1 - sink * sink), {
            phase: ballPhase,
            dirX: ballDir[0],
            dirY: ballDir[1],
            skin: ballSkin,
            feel: F,
          });
        }

        hudText = `${shot.club.name} · ${Math.round(carry)} yds${shot.holed ? ' · IN! 🎉' : ''}${shot.penalty ? ` · ${shot.penalty.toUpperCase()}!` : ''}`;

        // At the moment the run-out finishes: fire the hole-out explosion (holed only) once,
        // and start the rest-hold pause.
        if (elapsed >= flightDur + runDur && lastImpactShot !== shotIndex) {
          lastImpactShot = shotIndex;
          if (shot.holed) {
            spawnImpact([rsx, rsy], 1);
            ballRest = null; // it went IN — do not leave it sitting on the lip
          }
          else if (shot.knockedDown) spawnLeaves([tdx, tdy]);
          // A ball that landed safe and then rolled off into a penalty (a lost-rough void/cetus island)
          // fires its lost-ball implosion + voice HERE, at the ball's actual resting point in the void —
          // not on the safe fairway landing above (the "lost-ball cue on the fairway" bug).
          if (penaltyAtRest) {
            spawnLandFX([rsx, rsy], shot.lieTo, shot.penalty);
            opts.onLand?.(shot.lieTo, shot.penalty, shot.knockedDown);
          }
          trail = [];
        }
        // Advance to the next shot only after the ball has sat at rest for restHoldMs.
        if (elapsed >= flightDur + runDur + F.restHoldMs) {
          shotIndex++;
          segStart = now + F.gapMs;
        }
      }
    } else if (puttIndex < putts.length) {
      // Putt phase: flat roll across the green, eased to a stop, into the cup.
      // GS-green-contour-2: a manual putt carries its true CURVED travel (`PuttLog.path` — the
      // break curve the aim screen drew, wobble sheared in), so the ball visibly curls with the
      // contours instead of gliding a straight chord. Auto putts / old logs have no path → the
      // classic straight lerp, byte-for-byte.
      const putt = putts[puttIndex]!;
      if (impactFiredPutt !== puttIndex) {
        impactFiredPutt = puttIndex;
        opts.onImpact?.('putt');
      }
      const path = putt.path && putt.path.length > 1 ? putt.path : [putt.from, putt.to];
      let len = 0;
      for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
      const dur = Math.max(300, Math.min(750, len * proj.scale * 12));
      const t = Math.max(0, Math.min(1, (now - segStart) / dur));
      const e = easeOutCubic(t);
      // Walk the path by arc length so the eased pace reads the same on a curve as on a chord.
      let cur: Vec = path[path.length - 1]!;
      let want = e * len;
      for (let i = 1; i < path.length; i++) {
        const seg = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
        if (want <= seg || i === path.length - 1) {
          const f = seg > 1e-9 ? Math.min(1, want / seg) : 1;
          cur = [
            path[i - 1]![0] + (path[i]![0] - path[i - 1]![0]) * f,
            path[i - 1]![1] + (path[i]![1] - path[i - 1]![1]) * f,
          ];
          break;
        }
        want -= seg;
      }
      lastGround = cur; // feed the follow-cam
      const gx = proj.project(cur);

      // Putt line (aim guide) + rolling ball, both flat on the green — the guide traces the same
      // curved path the ball rolls, so the picture and the physics agree stroke-for-stroke.
      const [fx, fy] = proj.project(putt.from);
      const [tx, ty] = proj.project(putt.to);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      for (let i = 1; i < path.length; i++) {
        const [px, py] = proj.project(path[i]!);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      // The putt is where the roll reads best: the chip/putt camera runs at ~6.6 px/yard, so the ball
      // is at its biggest and every turn is legible — including the break, since the roll direction
      // comes from the ball's own screen motion along the curved path.
      const puttR = ballRadiusPx(proj.scale, 0, F);
      ballRest = putt.holed ? null : cur; // a holed putt is IN the cup, not sitting beside it
      rollBallTo(cur, (q) => proj.project(q), puttR);
      // A HOLED PUTT DROPS IN (GS-ball-swallow). It used to be drawn at full size sitting on the cup
      // and then simply cut when the segment ended, so the ball never went anywhere — it blinked
      // out. Over the last stretch of the roll it now sinks: the radius falls away and the ball
      // settles a touch down-screen into the mouth of the hole, so the last thing you see is the
      // ball going IN. Purely drawn — `putt.holed` and the resolved path are the sim's, untouched.
      const drop = putt.holed ? clamp01((t - PUTT_DROP_FROM) / (1 - PUTT_DROP_FROM)) : 0;
      const dropR = puttR * (1 - 0.82 * drop * drop);
      const dropY = gx[1] + cupRadiusPx(proj.scale) * 0.34 * drop;
      drawBall(ctx, gx[0], dropY, dropR, {
        phase: ballPhase,
        dirX: ballDir[0],
        dirY: ballDir[1],
        skin: ballSkinFor(opts.golferLook),
        feel: F,
      });

      hudText = `Putt ${puttIndex + 1}${putt.holed ? ' — in!' : ''}`;

      if (t >= 1) {
        if (putt.holed) spawnImpact([tx, ty], 0.5);
        puttIndex++;
        segStart = now + F.gapMs;
      }
    } else {
      // The ball STAYS on the screen once everything has played (GS-landing-real). The canvas keeps
      // painting frames until the app swaps the screen, and this branch used to draw nothing at all —
      // so the ball blinked out of existence and the player watched an empty fairway for the handful
      // of frames before the next screen arrived. Draw it at rest, exactly where it finished.
      if (ballRest) {
        const [fx, fy] = proj.project(ballRest);
        const restR = ballRadiusPx(proj.scale, 0, F);
        drawBallShadow(ctx, fx, fy, restR, 0);
        drawBall(ctx, fx, fy, restR, {
          phase: ballPhase,
          dirX: ballDir[0],
          dirY: ballDir[1],
          skin: ballSkinFor(opts.golferLook),
          feel: F,
        });
      }
      if (!done) {
        done = true;
        opts.onDone?.();
      }
    }

    // Caddy-guard projectile (laser/boomerang) flying from the caddy to the ball mid-flight — drawn
    // over the ball from THIS frame's recomputed endpoints (GS-caddy), so it tracks the moving ball
    // and the camera. The contact sparks fire in the cinematic, not here.
    if (redirectDraw) {
      drawCaddyProjectile(ctx, redirectDraw.kind, redirectDraw.from, redirectDraw.to, redirectDraw.p, now);
    }

    // Particles.
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      if (p.grav) p.vel[1] += p.grav;
      p.pos[0] += p.vel[0];
      p.pos[1] += p.vel[1];
      p.life -= 0.04;
      ctx.fillStyle = `rgba(${p.rgb ?? '255,235,180'},${p.life})`;
      ctx.beginPath();
      ctx.arc(p.pos[0], p.pos[1], 2.5 * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Caddy callout (GS-caddy-voices): the signature speech bubble (+ a ringing phone for Dr
    // Chipinski) over the corner caddy, fading out near the end of its window. Drawn last so it sits
    // on top; anchored to the caddy figure's muzzle/hand.
    if (caddyCallout && now < caddyCallout.until) {
      const v = CADDY_VOICE[caddyCallout.id];
      if (v) {
        const remain = caddyCallout.until - now;
        const age = CADDY_CALLOUT_MS - remain;
        const fade = Math.min(1, age / 140) * Math.min(1, remain / 260); // pop in, ease out
        drawSpeechBubble(ctx, v.bubble, caddyHead[0], caddyHead[1], fade);
        if (v.phone) drawPhoneIcon(ctx, caddyHead[0] + 4, caddyHead[1] - 6, 22, now);
      }
    } else if (caddyCallout) {
      caddyCallout = null;
    }

    // Trade-camp tent bubble (GS-tent-interactions): the struck tent's line, anchored ON the tent.
    // Re-projected from the tent's COURSE point every frame so it tracks the tent as the camera pans
    // (the fix for the bubble that used to drift with the ball).
    if (tentCallout && now < tentCallout.until) {
      const remain = tentCallout.until - now;
      const age = TENT_CALLOUT_MS - remain;
      const fade = Math.min(1, age / 120) * Math.min(1, remain / 240);
      const [bx, by] = proj.project(tentCallout.at);
      drawSpeechBubble(ctx, tentCallout.text, bx, by - 14, fade);
    } else if (tentCallout) {
      tentCallout = null;
    }

    ctx.restore();
    if (hudText) drawHUD(hudText);

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    replay(): void {
      reset(performance.now());
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      container.innerHTML = '';
      // Drop the cached world bitmap explicitly. It is a full-screen device-resolution surface and a
      // round of golf mounts one of these per stroke, so leaving it to be collected with the closure
      // is a lot of GPU-backed memory to hold on a phone (GS-shot-lag).
      sceneBitmap = null;
      cachedScene = [];
    },
  };
}

