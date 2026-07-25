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
import type { ShotRedirect } from '../sim/shot';
import { playBoundsCorners, surfaceFirmness } from '../sim/round';
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
  sampleCurvedFlight,
  samplePolylineFlight,
  DEFAULT_FLIGHT_FEEL,
  type FlightFeel,
} from './trajectory';
import { flightApexT, flightProfileOf } from '../sim/flight';
import { GOLFER_COLORS, lookFromColor, drawGolfer, type GolferLook } from './golferArt';

// The on-course golfer's look now lives in golferArt.ts; re-export it so existing importers
// (e.g. src/app/helpers.ts) keep resolving `GolferLook` from this module.
export type { GolferLook } from './golferArt';

interface PlayFeel extends FlightFeel {
  /** Multiplies on-screen arc height (course px → visible loft). */
  heightExaggeration: number;
  /** Max screen-shake amplitude (px) at a full-power strike. */
  shakeAmp: number;
  /** Trail length in samples. */
  trailLen: number;
  /** Pause between shots (ms). */
  gapMs: number;
  /** Bounce hop height (course yards) at a full-energy run-out (scaled down for short rolls). */
  bounceAmp: number;
  /** Max number of decaying bounces during a long, firm run-out (short rolls get fewer). */
  bounces: number;
  /** Run-out animation ms per course-yard of roll (so a long run genuinely takes longer to settle). */
  rollMsPerYard: number;
  /** Clamp on the run-out animation duration (ms). */
  rollMinMs: number;
  rollMaxMs: number;
  /** Roll distance (course yards) at which the bounce reaches full amplitude / hop count. */
  bounceRefRun: number;
  /** Backspin run-out: forward skid on the bounce as a fraction of the eventual check-back distance. */
  backspinSkidFrac: number;
  /** Backspin run-out: cap (course yards) on that forward skid. */
  backspinSkidMax: number;
  /** Backspin run-out: fraction of the run-out spent skidding forward before the spin grabs & zips back. */
  backspinSkidPortion: number;
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
  bounceAmp: 5,
  bounces: 4,
  rollMsPerYard: 20,
  rollMinMs: 150,
  rollMaxMs: 900,
  bounceRefRun: 32,
  backspinSkidFrac: 0.55,
  backspinSkidMax: 7,
  backspinSkidPortion: 0.32,
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
  const dpr = Math.min(2, window.devicePixelRatio || 1);

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
  function drawStatic(): void {
    if (proj !== cachedProj) {
      cachedScene = buildScene(hole, proj, { width, height, biome: opts.biome, themeId: opts.themeId, rainbow: opts.rainbow, tradeTents: opts.tradeTents, meteorScorch: opts.meteorScorch, groundPatch: opts.groundPatch, animateCetus: isCetus });
      cachedProj = proj;
    }
    drawScenePrims(ctx, cachedScene);
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
    if (followMode && opts.follow) {
      camera = [camera[0] + (lastGround[0] - camera[0]) * 0.2, camera[1] + (lastGround[1] - camera[1]) * 0.2];
      proj = buildProj();
      weather.setWind(windScreenDir()); // keep the wind reading true as the camera pans
    }

    // Screen-shake offset (deterministic decay).
    ctx.save();
    if (shake > 0) {
      const amp = F.shakeAmp * shake;
      ctx.translate(Math.sin(now * 0.08) * amp, Math.cos(now * 0.11) * amp);
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
      const apexT = flightApexT(flightProfileOf(shot.club.id));
      const bearing = shot.result.shotBearing;
      const flightDur = flightDurationMs(carry);
      const [tdx, tdy] = proj.project(touchdown);
      const [rsx, rsy] = proj.project(rest);
      // Run-out duration scales with the actual COURSE-YARD roll (zoom-independent), so a long run
      // genuinely takes longer to settle than a short check — the "landing & run match the distance"
      // ask. (The old screen-px scaling ran a 20yd roll at wildly different speeds at different zoom.)
      const rollYds = Math.abs(shot.roll ?? 0);
      const rollDur = rollYds > 0.3 ? Math.max(F.rollMinMs, Math.min(F.rollMaxMs, rollYds * F.rollMsPerYard)) : 0;
      // How energetic the run-out is, 0..~1.4: a long run bounces bigger and more often than a short
      // plop. Combined with surface firmness below.
      const runScale = clamp01(rollYds / F.bounceRefRun) * 1.4;
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

      if (flightElapsed < 0) {
        // --- Windup: ball at rest at the address point, golfer addresses → top → contact.
        lastGround = shot.from; // keep the follow-cam centred on the ball
        const [bx, by] = proj.project(shot.from);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(bx, by, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (F.golfer) drawGolfer(ctx, bx, by, golferH, clamp01((now - segStart) / lead), 0, 1, look, opts.lefty);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
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
        }
        let ground: Vec;
        let height: number;
        let zoomTarget = 1; // redirect zoom-to-impact target (1 = no zoom); eased into cineZoom below
        if (elapsed < flightDur) {
          const tg = elapsed / flightDur;
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
            const sI = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, interceptFrac, peak, apexT);
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

            height = sampleCurvedFlight(shot.from, touchdown, bearing, tg, peak, apexT).height;
            if (tg < interceptFrac) {
              ground = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, tg, peak, apexT).ground;
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
            const s = samplePolylineFlight(fp, tg, peak, apexT);
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
            const s = sampleCurvedFlight(shot.from, touchdown, bearing, tg, peak, apexT);
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
          // Dr Chipinski chip-in (GS-caddy-voices): as the ball drops in, slow the world and have the
          // doctor "answer the call" — the phone glyph + "You rang?" bubble + voice. Fires once.
          if (shot.chipIn && chipInFiredShot !== shotIndex) {
            chipInFiredShot = shotIndex;
            fireCaddyEffect(opts.caddyId);
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
          if ((shot.roll ?? 0) < -0.3) {
            // Backspin is a TWO-BEAT run-out, not a smooth slide back to rest. The old monotonic
            // ease yanked the ball straight backward the instant it touched down — it read as a
            // "rubber band" snap, not spin. Real backspin: the ball SKIDS forward on the bounce
            // (carrying its forward momentum), THEN the spin grabs and zips it back past touchdown
            // to rest. Render-only feel — the sim already resolved `rest` (behind touchdown).
            const br = (bearing * Math.PI) / 180;
            const fwd: Vec = [Math.sin(br), Math.cos(br)]; // forward unit (flight.ts bearing convention)
            const checkDist = Math.hypot(rest[0] - touchdown[0], rest[1] - touchdown[1]);
            const skid = Math.min(checkDist * F.backspinSkidFrac, F.backspinSkidMax);
            const peakPt: Vec = [touchdown[0] + fwd[0] * skid, touchdown[1] + fwd[1] * skid];
            const p = F.backspinSkidPortion;
            if (rt < p) {
              const e1 = easeOutCubic(rt / p); // forward skid, decelerating as the spin bites
              ground = [touchdown[0] + (peakPt[0] - touchdown[0]) * e1, touchdown[1] + (peakPt[1] - touchdown[1]) * e1];
            } else {
              const e2 = easeInOut((rt - p) / (1 - p)); // spin grabs → accelerates back, eases into rest
              ground = [peakPt[0] + (rest[0] - peakPt[0]) * e2, peakPt[1] + (rest[1] - peakPt[1]) * e2];
            }
          } else if (shot.rollPath && shot.rollPath.length > 1) {
            // GS-green-contour-2 round 2: the sim's run-out CURLED along the green's local fall
            // line — walk its actual path by arc length (the putt-path treatment) so the ball
            // visibly breaks off the flank instead of gliding a straight chord to rest.
            const rp = shot.rollPath;
            let total = 0;
            for (let i = 1; i < rp.length; i++) total += Math.hypot(rp[i]![0] - rp[i - 1]![0], rp[i]![1] - rp[i - 1]![1]);
            let want = easeOutCubic(rt) * total;
            ground = rp[rp.length - 1]!;
            for (let i = 1; i < rp.length; i++) {
              const seg = Math.hypot(rp[i]![0] - rp[i - 1]![0], rp[i]![1] - rp[i - 1]![1]);
              if (want <= seg || i === rp.length - 1) {
                const f = seg > 1e-9 ? Math.min(1, want / seg) : 1;
                ground = [rp[i - 1]![0] + (rp[i]![0] - rp[i - 1]![0]) * f, rp[i - 1]![1] + (rp[i]![1] - rp[i - 1]![1]) * f];
                break;
              }
              want -= seg;
            }
          } else {
            const e = easeOutCubic(rt);
            ground = [touchdown[0] + (rest[0] - touchdown[0]) * e, touchdown[1] + (rest[1] - touchdown[1]) * e];
          }
          const firm = surfaceFirmness(shot.landLie ?? shot.lieTo);
          // Bounce reads BOTH the landing surface's firmness AND how far the ball runs: a long firm
          // run skips tall and hops several times; a short soft check plops once and dies. Hop count
          // and amplitude both scale with the run, and the (1−rt) envelope makes the FIRST hop the
          // biggest so it visibly decays into the roll (not a static, uniform jitter).
          const hops = Math.max(1, Math.round(1 + runScale * F.bounces * (0.45 + 0.7 * firm)));
          const amp = F.bounceAmp * (0.28 + 1.1 * firm) * (0.3 + 0.85 * runScale);
          const damp = Math.pow(1 - rt, 1.5 - 0.7 * firm); // soft decays faster (a dead plop)
          height = amp * Math.abs(Math.sin(rt * Math.PI * hops)) * damp;
        }

        lastGround = ground; // feed the follow-cam
        // Ease the redirect zoom toward its target (one-frame lag like the follow-cam; consumed by
        // buildProj next frame). zoomTarget is 1 outside a redirect, so non-redirect shots hold at 1.
        cineZoom += (zoomTarget - cineZoom) * 0.2;
        const [gx, gy] = proj.project(ground);
        const ballY = gy - height * proj.scale * F.heightExaggeration;

        // Golfer holds the follow-through at the address point, fading as the ball flies off.
        if (F.golfer && elapsed < F.followMs) {
          const [bx, by] = proj.project(shot.from);
          const fol = clamp01(elapsed / F.followMs);
          drawGolfer(ctx, bx, by, golferH, 1, Math.max(0.001, fol), 1 - fol, look, opts.lefty);
        }

        // Shadow (fades as the ball climbs).
        ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - height / (peak + 1))})`;
        ctx.beginPath();
        ctx.ellipse(gx, gy, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();

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

        // Ball (a touch bigger when lofted). A glowing tracer ball wears a faint halo in its glow colour.
        const ballR = 3 + (height / (peak + 1)) * 1.5;
        if (tracer?.glow) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = tracer.glow;
          ctx.beginPath();
          ctx.arc(gx, ballY, ballR + 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(gx, ballY, ballR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        hudText = `${shot.club.name} · ${Math.round(carry)} yds${shot.holed ? ' · IN! 🎉' : ''}${shot.penalty ? ` · ${shot.penalty.toUpperCase()}!` : ''}`;

        // At the moment the run-out finishes: fire the hole-out explosion (holed only) once,
        // and start the rest-hold pause.
        if (elapsed >= flightDur + rollDur && lastImpactShot !== shotIndex) {
          lastImpactShot = shotIndex;
          if (shot.holed) spawnImpact([rsx, rsy], 1);
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
        if (elapsed >= flightDur + rollDur + F.restHoldMs) {
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
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(gx[0], gx[1], 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      hudText = `Putt ${puttIndex + 1}${putt.holed ? ' — in!' : ''}`;

      if (t >= 1) {
        if (putt.holed) spawnImpact([tx, ty], 0.5);
        puttIndex++;
        segStart = now + F.gapMs;
      }
    } else if (!done) {
      done = true;
      opts.onDone?.();
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
    },
  };
}

