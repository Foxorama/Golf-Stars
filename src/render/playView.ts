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
import type { ApparelLook } from '../sim/rpg/apparel';
import { mixHex } from './palette';
import { holeProjector } from './project';
import { buildScene, drawScenePrims, landPolysCourseFor, type Prim } from './style';
import { artFeel } from './style/shared';
import { createWeather, type WeatherHandle } from './weather';
import { createCetusFlow } from './cetusFlow';
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
  DEFAULT_FLIGHT_FEEL,
  type FlightFeel,
} from './trajectory';
import { flightApexT, flightProfileOf } from '../sim/flight';

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

// Loader-style cap colours so the play-view golfer reads as one of the intro's crew (the fallback
// when no specific golfer is selected — the result-screen replay cycles them by shot).
const GOLFER_COLORS = ['#d23f4f', '#3f78b8', '#e0a83f', '#46a05a'];

/** The on-course golfer's look — cap/shirt/skin + a build scale (GS-18 character identity). */
export interface GolferLook {
  cap: string;
  shirt: string;
  skin: string;
  /** Figure size scale (1 = default). */
  build: number;
  /**
   * Equipped GEAR theme (GS-proshop-2): the rarest themed club set the player carries (Planet /
   * Phoenix Flames / Solar Storm). When set, the golfer swings a GLOWING themed club head — so the
   * club you bought in the Pro Shop is the club you swing. Absent = a plain club head (unchanged).
   */
  gear?: { theme: string; tint: string };
  /** Equipped cosmetic HAT (GS-cosmetics) — overrides the default cap with its own shape/palette. */
  hat?: ApparelLook;
  /** Equipped cosmetic SHIRT — overrides the torso colour + adds a glowing aura for the top tiers. */
  shirtStyle?: ApparelLook;
  /** Equipped cosmetic PANTS (GS-pants-outfit) — overrides the default legs with their own shape/palette. */
  pantsStyle?: ApparelLook;
  /** Equipped cosmetic DRIVER (GS-thor) — swaps the plain club head for its own skin (a mythic warhammer,
   *  Thor's Hammer). Takes precedence over the in-run `gear` themed head when both are present. */
  driver?: ApparelLook;
  /** Equipped cosmetic BAG (GS-wardrobe-bagtier) — a staff bag propped behind the golfer at address, so
   *  the caddy bag you outfit in the Clubhouse actually shows on the course. Absent → no bag prop (the
   *  clubs still carry their bag-tier gear skin). */
  bag?: ApparelLook;
}
/** A cap colour → a full look (shirt matches the cap; default skin) — the loader-crew fallback. */
function lookFromColor(color: string): GolferLook {
  return { cap: color, shirt: color, skin: '#f0c49a', build: 1 };
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

/**
 * A little cartoon golfer mid-swing, in the same silhouette language as the loading intro's
 * crew (stick legs, blocky torso, round head + cap) but posed side-on over the ball with a
 * club. The figure is authored in a local frame ~72 units tall (origin at the feet, +x toward
 * the target, −y up) and scaled to `h` px, then positioned so its LOCAL ball (where the club
 * sole rests at address) lands exactly on the REAL ball on screen — so figure, club and ball
 * stay in proportion at any zoom. `swing` 0..1 drives the windup (address → top → contact);
 * once `follow` > 0 the club sweeps on through to a high finish.
 */
function drawGolfer(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  h: number,
  swing: number,
  follow: number,
  alpha: number,
  look: GolferLook,
  lefty = false,
): void {
  const u = h / 72;
  const S: Vec = [8, -50]; // shoulder pivot
  const B: Vec = [30, -1]; // local ball (club sole at address)
  const CL = Math.hypot(B[0] - S[0], B[1] - S[1]);
  const a0 = Math.atan2(B[1] - S[1], B[0] - S[0]); // address angle (down to the ball)
  const aTop = a0 - 3.0; // top of the backswing (up and behind)
  const aFin = a0 - 3.9; // high finish (further round and up)
  let ang: number;
  if (follow > 0) {
    ang = a0 + (aFin - a0) * easeOutCubic(follow);
  } else if (swing < 0.5) {
    ang = a0 + (aTop - a0) * easeInOut(swing / 0.5); // takeaway → top
  } else {
    const d = (swing - 0.5) / 0.5;
    ang = aTop + (a0 - aTop) * (d * d); // downswing accelerates into contact
  }
  const head: Vec = [S[0] + Math.cos(ang) * CL, S[1] + Math.sin(ang) * CL];
  const hands: Vec = [S[0] + Math.cos(ang) * CL * 0.34, S[1] + Math.sin(ang) * CL * 0.34];

  ctx.save();
  ctx.globalAlpha = alpha;
  // Place the figure so its LOCAL ball B lands on the real ball, then for a left-handed golfer
  // MIRROR the whole stick figure horizontally about that ball (GS-lefty) — a lefty stands on the
  // other side and swings the mirror image. Right-handed (lefty=false) reduces to the original
  // translate+scale, so the figure is byte-for-byte unchanged.
  ctx.translate(bx, by);
  ctx.scale(lefty ? -u : u, u);
  ctx.translate(-B[0], -B[1]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(6, 1, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // The equipped cosmetic BAG (GS-wardrobe-bagtier) stands propped BEHIND the golfer (their −x side,
  // clear of the target-side swing arc), planted on the same ground line — so the caddy bag you outfit
  // in the Clubhouse shows on the course. Drawn before the body so the figure overlaps it if close.
  if (look.bag) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; // its own little ground shadow
    ctx.beginPath();
    ctx.ellipse(-18, 1, 7, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawGolfBag(ctx, -18, -8, 0.62, look.bag);
  }

  // Legs (a planted stance). A cosmetic PANTS (GS-pants-outfit) overrides the bare leg colour with its
  // own shape/palette; with nothing equipped the original dark legs draw byte-for-byte unchanged.
  if (look.pantsStyle) {
    drawPants(ctx, look.pantsStyle, look.skin, alpha);
  } else {
    ctx.strokeStyle = '#2c3142';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(2, -30);
    ctx.lineTo(-7, 0);
    ctx.moveTo(2, -30);
    ctx.lineTo(12, 0);
    ctx.stroke();
  }

  // Torso (hip → shoulders, tilted toward the ball). A cosmetic shirt (GS-cosmetics) overrides the
  // colour and, for the glowing top tiers, adds a soft aura behind the torso.
  const shirtCol = look.shirtStyle?.color ?? look.shirt;
  if (look.shirtStyle?.glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = look.shirtStyle.glow;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(2, -30);
    ctx.lineTo(S[0], S[1]);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = shirtCol;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(2, -30);
  ctx.lineTo(S[0], S[1]);
  ctx.stroke();
  // The torso is a diagonal capsule hip(2,-30)→shoulder(8,-50); `torsoX(y)` is its centreline x at a
  // given height, so patterned shirts (GS-worn-coverage) paint ON the torso, not floating beside it.
  const torsoX = (y: number): number => 2 - (y + 30) * 0.3;
  const sShape = look.shirtStyle?.shape;
  // Nebula suit (GS-cosmic 'cosmic'): a starfield + magenta swooshes down the torso, so the Supernova
  // suit reads as living nebula on-course, not a plain purple torso. Mirrors the wardrobe SVG's worn fill.
  if (sShape === 'cosmic') {
    const acc = look.shirtStyle?.accent ?? '#ff7bf0';
    ctx.fillStyle = '#fff';
    for (const [dx, y, rr] of [[-2, -47, 0.9], [2, -44, 0.7], [-1, -40, 0.8], [3, -36, 0.7], [-2, -33, 0.7], [1, -49, 0.6], [-3, -43, 0.5]] as [number, number, number][]) {
      ctx.beginPath();
      ctx.arc(torsoX(y) + dx, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(torsoX(-45) - 4, -45);
    ctx.quadraticCurveTo(torsoX(-43), -48, torsoX(-41) + 4, -41);
    ctx.moveTo(torsoX(-37) - 4, -37);
    ctx.quadraticCurveTo(torsoX(-35), -39, torsoX(-33) + 4, -33);
    ctx.stroke();
    ctx.restore();
  }
  // Striped tee ('striped'): bands run the whole torso, centred on the torso line.
  if (sShape === 'striped') {
    ctx.strokeStyle = look.shirtStyle?.accent ?? '#f4f1e6';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let y = -47; y <= -32; y += 3.4) {
      const c = torsoX(y);
      ctx.moveTo(c - 6, y);
      ctx.lineTo(c + 6, y);
    }
    ctx.stroke();
  }
  // Neon jersey ('jersey'): a number panel high on the chest + racing stripes down both flanks.
  if (sShape === 'jersey') {
    const acc = look.shirtStyle?.accent ?? '#2bf0c0';
    const py = -44;
    ctx.fillStyle = acc;
    ctx.fillRect(torsoX(py) - 4.5, py - 4, 9, 8.5);
    ctx.fillStyle = '#0c1116';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', torsoX(py), py);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.4;
    for (const off of [-5.5, 5.5]) {
      ctx.beginPath();
      ctx.moveTo(torsoX(-48) + off, -48);
      ctx.lineTo(torsoX(-32) + off, -32);
      ctx.stroke();
    }
  }
  // Polo ('polo'): collar V + placket + buttons, so the plain polo reads as a collared shirt on-course.
  if (sShape === 'polo') {
    ctx.strokeStyle = look.shirtStyle?.accent ?? '#1d4a7a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(torsoX(-49) - 3, -49);
    ctx.lineTo(torsoX(-46), -45);
    ctx.lineTo(torsoX(-49) + 3, -49);
    ctx.moveTo(torsoX(-45), -45);
    ctx.lineTo(torsoX(-39), -39);
    ctx.stroke();
    ctx.fillStyle = look.shirtStyle?.accent ?? '#1d4a7a';
    for (const y of [-43, -40]) {
      ctx.beginPath();
      ctx.arc(torsoX(y), y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Spacesuit chest control panel — a small accented box that sells the "suit" read.
  if (look.shirtStyle?.shape === 'spacesuit') {
    ctx.fillStyle = '#cdd6e2';
    ctx.fillRect(2, -44, 8, 7);
    ctx.fillStyle = look.shirtStyle.accent ?? '#d23b32';
    ctx.fillRect(3, -42.6, 2, 2);
    ctx.fillStyle = '#2bf0c0';
    ctx.fillRect(6.5, -42.6, 2, 2);
  }
  // Green-Jacket lapels (GS-unending 'blazer'): a light shirt V in the open front + gold lapel lines
  // and a button, so the jacket reads as tailored even at swing size.
  if (look.shirtStyle?.shape === 'blazer') {
    const gold = look.shirtStyle.accent ?? '#f2d06b';
    ctx.fillStyle = '#f4f6f2';
    ctx.beginPath();
    ctx.moveTo(1, -46);
    ctx.lineTo(6, -38);
    ctx.lineTo(11, -46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -47);
    ctx.lineTo(6, -38);
    ctx.moveTo(12, -47);
    ctx.lineTo(6, -38);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(5, -35, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Valkyrie cuirass (GS-valkyrie 'valkyrie'): a gold shoulder pauldron, a central ridge, and a winged
  // gold chest boss, so the burnished plate reads even at swing size.
  if (look.shirtStyle?.shape === 'valkyrie') {
    const gold = look.shirtStyle.accent ?? '#ffe08a';
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(8, -50, 3.4, Math.PI * 0.75, Math.PI * 1.95); // shoulder pauldron
    ctx.fill();
    ctx.strokeStyle = gold; // central ridge
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -46);
    ctx.lineTo(4, -34);
    ctx.stroke();
    ctx.beginPath(); // winged chest boss
    ctx.arc(4, -43, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1.6, -43.6);
    ctx.lineTo(-1.2, -44.6);
    ctx.moveTo(6.4, -43.6);
    ctx.lineTo(9.2, -44.6);
    ctx.stroke();
  }
  // Punched Galaxy warplate (GS-punched-galaxy 'riftplate'): a glowing star-core on the chest with
  // galaxy-crack energy forking out of it + a dark shoulder plate, so the cosmic cuirass reads at swing
  // size. Mirrors the wardrobe SVG (`apparelArt.ts shirtDetail 'riftplate'`).
  if (look.shirtStyle?.shape === 'riftplate') {
    const acc = look.shirtStyle.accent ?? '#ff7bf0';
    const cx = 5;
    const cy = -41;
    // Soft core glow.
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Dark shoulder plate.
    ctx.fillStyle = '#160826';
    ctx.strokeStyle = '#0c1116';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(9, -52);
    ctx.lineTo(13, -50.5);
    ctx.lineTo(11.5, -46.5);
    ctx.lineTo(8, -48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Galaxy-crack energy lines radiating from the core (accent, then a thin white core over the same path).
    const cracks = (): void => {
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx - 7, cy - 3);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy - 4.5); ctx.lineTo(cx + 6, cy - 5.5);
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 2, cy + 5); ctx.lineTo(cx - 3.5, cy + 9);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy + 4.5); ctx.lineTo(cx + 5, cy + 8);
    };
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.2;
    cracks();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.stroke(); // white core over the same current path
    // Core orb.
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Solar Flames robe (GS-solar-flames 'solarflare'): a coronal sun-core on the chest + solar flames
  // licking up the hem + embers, so the banked starfire reads at swing size. Mirrors the wardrobe SVG.
  if (look.shirtStyle?.shape === 'solarflare') {
    const cor = look.shirtStyle.accent ?? '#ff4d2a';
    const corHi = '#ffb648';
    const ccx = 5;
    const ccy = -42;
    const flame = (
      bx: number, by: number, h: number, w: number, c: number, fill: string,
    ): void => {
      ctx.beginPath();
      ctx.moveTo(bx - w, by);
      ctx.quadraticCurveTo(bx - w * 0.78, by - h * 0.5, bx - w * 0.12 + c * 0.4, by - h * 0.72);
      ctx.quadraticCurveTo(bx + c * 0.9, by - h * 0.92, bx + c, by - h);
      ctx.quadraticCurveTo(bx + w * 0.55 + c * 0.4, by - h * 0.52, bx + w * 0.82, by - h * 0.34);
      ctx.quadraticCurveTo(bx + w, by - h * 0.15, bx + w, by);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // Solar flames licking up from the hem.
    const flames: [number, number, number, number, number][] = [
      [2, -31, 8.5, 2.5, 0], [-3, -31, 6.5, 2, -0.6], [7, -31, 6.5, 2, 0.6],
    ];
    for (const [x, y, h, w, c] of flames) {
      flame(x, y, h * 1.12, w * 1.16, c, '#160826');
      flame(x, y, h, w, c, '#6a24b8');
      flame(x, y, h * 0.8, w * 0.72, c * 0.85, '#b8309a');
      flame(x, y, h * 0.56, w * 0.5, c * 0.7, cor);
      flame(x, y, h * 0.32, w * 0.3, c * 0.5, corHi);
    }
    // Coronal sun-core glow.
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Short coronal spikes ringing the core.
    ctx.fillStyle = cor;
    for (let k = 0; k < 8; k++) {
      const t = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(ccx + Math.cos(t) * 3.2 - Math.sin(t) * 0.9, ccy + Math.sin(t) * 3.2 + Math.cos(t) * 0.9);
      ctx.lineTo(ccx + Math.cos(t) * 5.4, ccy + Math.sin(t) * 5.4);
      ctx.lineTo(ccx + Math.cos(t) * 3.2 + Math.sin(t) * 0.9, ccy + Math.sin(t) * 3.2 - Math.cos(t) * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    // Red disc, hot inner, white pip.
    ctx.fillStyle = cor;
    ctx.strokeStyle = '#0c1116';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = corHi;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Space Parrot plumage (GS-space-pirate-parrot 'parrot'): rows of scalloped iridescent macaw feathers
  // (teal/gold/magenta) shingled down the torso + star specks + a breast gem. Mirrors the wardrobe SVG.
  if (sShape === 'parrot') {
    const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
    const r = 1.9;
    const step = r * 1.35;
    let row = 0;
    for (let y = -49; y <= -31; y += step, row++) {
      ctx.fillStyle = plume[row % 3]!;
      const c = torsoX(y);
      const off = (row % 2) * r;
      for (let x = c - 5.5 + off; x <= c + 5.5; x += r * 2) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI, false); // lower semicircle bulging down = a feather scale
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = '#fff'; // star specks
    for (const [dx, y] of [[-3, -46], [3, -42], [-2, -37], [3, -33]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(torsoX(y) + dx, y, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Starlight breast gem (a small 4-point star).
    const gx = torsoX(-45);
    const gy = -45;
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath();
    ctx.moveTo(gx, gy - 2.2);
    ctx.lineTo(gx + 0.7, gy - 0.7);
    ctx.lineTo(gx + 2.2, gy);
    ctx.lineTo(gx + 0.7, gy + 0.7);
    ctx.lineTo(gx, gy + 2.2);
    ctx.lineTo(gx - 0.7, gy + 0.7);
    ctx.lineTo(gx - 2.2, gy);
    ctx.lineTo(gx - 0.7, gy - 0.7);
    ctx.closePath();
    ctx.fill();
  }

  // Club shaft + head (behind the arms). An equipped cosmetic DRIVER (GS-thor) swaps the plain club head
  // for a mythic WARHAMMER wreathed in lightning; else a bought themed club set (GS-proshop-2) tints the
  // head + glows; else a plain club head. The driver skin takes precedence over the in-run gear theme.
  const gear = look.gear;
  if (look.driver) {
    drawWarhammer(ctx, hands, head, ang, swing, follow, alpha, look.driver);
  } else {
  ctx.strokeStyle = gear ? gear.tint : '#d9dee8';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(head[0], head[1]);
  ctx.stroke();
  if (gear) {
    // Soft glow behind the head, in the set's tint.
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = gear.tint;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = gear.tint;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 3.4, 0, Math.PI * 2);
    ctx.fill();
    // A couple of themed sparks trailing the head once it's swinging through (Solar Storm sparkles,
    // Phoenix embers, Planet glints) — purely cosmetic motion.
    if (follow > 0.05) {
      ctx.save();
      ctx.globalAlpha = alpha * (1 - follow) * 0.9;
      ctx.fillStyle = gear.theme === 'planet' ? '#ffffff' : gear.tint;
      for (let i = 1; i <= 3; i++) {
        const t = follow - i * 0.06;
        if (t < 0) continue;
        const a = aTop + (a0 - aTop) * 1 + (aFin - a0) * easeOutCubic(t);
        ctx.beginPath();
        ctx.arc(S[0] + Math.cos(a) * CL, S[1] + Math.sin(a) * CL, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#aeb6c6';
    ctx.beginPath();
    ctx.arc(head[0], head[1], 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  }

  // Arms (shoulders → hands).
  ctx.strokeStyle = look.skin;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(S[0], S[1]);
  ctx.lineTo(hands[0], hands[1]);
  ctx.stroke();

  // Head + headwear (brim/front points down the line, +x toward the target).
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(12, -58, 7, 0, Math.PI * 2);
  ctx.fill();
  if (look.hat) {
    drawHat(ctx, 12, -58, 7, look.hat);
  } else {
    // Default cap.
    ctx.fillStyle = look.cap;
    ctx.beginPath();
    ctx.arc(12, -59, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(15, -60, 9, 3); // brim
  }

  ctx.restore();
}

/**
 * Draw the mythic WARHAMMER driver skin (GS-thor: Thor's Hammer) in place of the plain club head — a big,
 * unmistakable Mjölnir. A short thick leather-wrapped haft, a chunky flared-face gilded maul head crossing
 * the shaft end (rim-lit, rune-etched, with a glowing storm-core between the faces), and layered electric
 * lightning wreathing it. A broad electric aura + rune-core stay lit through the WHOLE swing (swelling
 * with power), so the hammer still reads as a glowing weapon even when it smears through a fast downswing —
 * the "hard to recognise at speed" fix. Authored in the figure's local frame (same units as `drawGolfer`);
 * the head is drawn in a frame rotated to the club angle so the striking faces cross the shaft.
 * Deterministic (no Math.random — the flicker rides the swing/follow phase), assetless.
 */
function drawWarhammer(
  ctx: CanvasRenderingContext2D,
  hands: Vec,
  head: Vec,
  ang: number,
  swing: number,
  follow: number,
  alpha: number,
  look: ApparelLook,
): void {
  const gold = look.color || '#c9a24a';
  const boltCol = look.accent || '#59b6ff';
  const dark = '#5f4419';
  const rim = '#f6e9ad';
  // Storm power rides the swing: a low simmer through the takeaway, surging into contact + the
  // follow-through. A separate high-frequency flicker sells the "live current".
  const power = clamp01((swing > 0.5 ? 0.4 + (swing - 0.5) : swing * 0.5) + follow);
  const flick = 0.55 + 0.45 * Math.abs(Math.sin((swing + follow) * 21));

  // Thick wooden haft hands → head, with a dark leather grip wrap near the hands + a metal ferrule collar.
  ctx.strokeStyle = '#6b4a24';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(head[0], head[1]);
  ctx.stroke();
  ctx.strokeStyle = '#241708';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(hands[0] + (head[0] - hands[0]) * 0.34, hands[1] + (head[1] - hands[1]) * 0.34);
  ctx.stroke();

  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(ang);

  // Broad electric aura behind the head — ALWAYS lit, swelling with power. Two soft blue discs so the
  // hammer stays a recognisable glowing mass through the fast part of the swing.
  const auraR = 11 + power * 7;
  ctx.save();
  ctx.fillStyle = boltCol;
  ctx.globalAlpha = alpha * (0.16 + power * 0.2) * flick;
  ctx.beginPath();
  ctx.arc(1, 0, auraR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * (0.28 + power * 0.28) * flick;
  ctx.beginPath();
  ctx.arc(1, 0, auraR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The maul head — a chunky block that FLARES at the two striking faces and pinches at the waist where
  // the haft passes through (the classic Mjölnir dumbbell), so it reads as a hammer from any angle.
  const cx = 1.2; // head centre, a touch past the shaft end
  const endH = 8.8; // half-height to a striking face
  const waistH = 6.4; // half-height at the pinched waist
  const endW = 6.2; // half-width across a flared face
  const waistW = 4.8; // half-width at the waist
  ctx.beginPath();
  ctx.moveTo(cx - endW, -endH);
  ctx.lineTo(cx + endW, -endH); // top face
  ctx.lineTo(cx + waistW, -waistH);
  ctx.lineTo(cx + waistW, waistH);
  ctx.lineTo(cx + endW, endH); // bottom face
  ctx.lineTo(cx - endW, endH);
  ctx.lineTo(cx - waistW, waistH);
  ctx.lineTo(cx - waistW, -waistH);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Lighter struck faces (top & bottom caps) + a bright rim highlight down the leading (target-side) edge.
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.moveTo(cx - endW, -endH);
  ctx.lineTo(cx + endW, -endH);
  ctx.lineTo(cx + endW - 1.4, -endH + 2.6);
  ctx.lineTo(cx - endW + 1.4, -endH + 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - endW, endH);
  ctx.lineTo(cx + endW, endH);
  ctx.lineTo(cx + endW - 1.4, endH - 2.6);
  ctx.lineTo(cx - endW + 1.4, endH - 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx + endW - 0.6, -endH + 1.5);
  ctx.lineTo(cx + waistW - 0.6, -waistH);
  ctx.lineTo(cx + waistW - 0.6, waistH);
  ctx.lineTo(cx + endW - 0.6, endH - 1.5);
  ctx.stroke();
  // Glowing storm-core set into the waist — a pulsing electric slit + rune, lit through the whole swing.
  ctx.save();
  ctx.globalAlpha = alpha * (0.5 + 0.5 * flick);
  ctx.fillStyle = boltCol;
  ctx.beginPath();
  ctx.ellipse(cx - 0.2, 0, 2.0, waistH - 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eaf6ff';
  ctx.beginPath();
  ctx.ellipse(cx - 0.2, 0, 0.9, waistH - 3.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Rune-etched diamond on the face.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, -4.4);
  ctx.lineTo(cx + 2.2, 0);
  ctx.lineTo(cx, 4.4);
  ctx.lineTo(cx - 2.2, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Forked lightning wreathing the head — layered (wide blue glow → hot white core), radiating from the
  // faces. Present from the downswing through the follow-through, brightest at contact.
  const zap = clamp01((swing > 0.5 ? (swing - 0.5) / 0.5 : 0) + follow);
  if (zap > 0.02) {
    ctx.save();
    ctx.translate(head[0], head[1]);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha * zap * flick;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const bolts: number[][][] = [
      [[6, -7], [11, -9], [9, -13], [14, -15]],
      [[6, 7], [12, 8], [10, 12], [15, 14]],
      [[-4, -8], [-9, -9], [-7, -13], [-11, -16]],
      [[-4, 8], [-8, 10], [-6, 13], [-10, 16]],
      [[8, 0], [13, -1.5], [12, 2], [17, 1]],
    ];
    for (const pts of bolts) {
      const trace = (): void => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0]!, p[1]!) : ctx.moveTo(p[0]!, p[1]!)));
        ctx.stroke();
      };
      ctx.strokeStyle = boltCol; // wide electric-blue glow
      ctx.lineWidth = 3.4;
      ctx.globalAlpha = alpha * zap * flick * 0.5;
      trace();
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = alpha * zap * flick;
      trace();
      ctx.strokeStyle = '#f2faff'; // hot white core
      ctx.lineWidth = 0.9;
      trace();
    }
    ctx.restore();
  }
}

/**
 * Draw a cosmetic HAT on the golfer's head (canvas), centred on (hx,hy) with head radius r. Authored
 * in the canonical right-facing frame (the outer transform mirrors it for a lefty); the brim/front
 * points +x (down the line). Shapes mirror the wardrobe SVG (`render/apparelArt.ts`) so what you buy
 * is what you wear.
 */
function drawHat(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, look: ApparelLook): void {
  const { shape, color, accent = '#15161c', glow } = look;
  if (glow) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.55;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy - r, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0c1116';
  ctx.lineWidth = 1;
  switch (shape) {
    case 'cap':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx + 3, hy - 2, r + 2, 2.6); // brim
      break;
    case 'bucket':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r - 0.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(hx, hy, r + 4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'visor':
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 1);
      ctx.lineTo(hx + r + 6, hy);
      ctx.lineTo(hx + r, hy + 2);
      ctx.lineTo(hx - 1, hy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      break;
    case 'tophat':
      ctx.fillRect(hx - 5, hy - r - 9, 10, 11);
      ctx.fillStyle = accent;
      ctx.fillRect(hx - 5, hy - 2.5, 10, 2.4); // band
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(hx, hy, r + 3, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(hx - r, hy);
      ctx.lineTo(hx - r, hy - 5);
      ctx.lineTo(hx - r / 2, hy - 1);
      ctx.lineTo(hx, hy - 8);
      ctx.lineTo(hx + r / 2, hy - 1);
      ctx.lineTo(hx + r, hy - 5);
      ctx.lineTo(hx + r, hy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff5a4d';
      ctx.beginPath();
      ctx.arc(hx, hy - 7, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(hx + 1, hy - 1, r - 1.5, r - 2.5, 0, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(hx - 1.5, hy - 3, 2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'starburst': {
      // The Punched Galaxy crown (GS-punched-galaxy, was the Supernova crown): a jewelled violet circlet
      // bursting into starlight rays (violet→hot-pink→starlight gradient) with a star-core gem — the
      // set-matched twin of the wardrobe SVG (`apparelArt.ts hatGlyph 'starburst'`). Canonical r=7 head.
      const s = r / 7;
      const tip = '#fff0a0';
      const cx = hx;
      const cy = hy - 3.4 * s;
      const rb = 4.0 * s;
      const rays: [number, number, number][] = [
        [0, 12.5, 1.8], [33, 10, 1.5], [-33, 10, 1.5],
        [63, 8.2, 1.3], [-63, 8.2, 1.3], [94, 6, 1.05], [-94, 6, 1.05],
      ];
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.5;
      for (const [deg, len, w] of rays) {
        const t = (deg * Math.PI) / 180;
        const dx = Math.sin(t);
        const dy = -Math.cos(t);
        const px = Math.cos(t);
        const py = Math.sin(t);
        const bx = cx + rb * dx;
        const by = cy + rb * dy;
        const tx = cx + (rb + len * s) * dx;
        const ty = cy + (rb + len * s) * dy;
        const grad = ctx.createLinearGradient(bx, by, tx, ty);
        grad.addColorStop(0, color);
        grad.addColorStop(0.52, accent);
        grad.addColorStop(1, tip);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(bx - w * s * px, by - w * s * py);
        ctx.lineTo(tx, ty);
        ctx.lineTo(bx + w * s * px, by + w * s * py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Violet circlet band across the brow.
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, r, Math.PI * 1.06, Math.PI * 1.94);
      ctx.arc(hx, hy, r * 0.72, Math.PI * 1.94, Math.PI * 1.06, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Hot-pink rim highlight along the band.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, r * 0.86, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      // Star-core gem at the brow.
      const gx = hx;
      const gy = hy - 1.2 * s;
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.moveTo(gx, gy - 3 * s);
      ctx.lineTo(gx + 0.9 * s, gy - 0.9 * s);
      ctx.lineTo(gx + 3 * s, gy);
      ctx.lineTo(gx + 0.9 * s, gy + 0.9 * s);
      ctx.lineTo(gx, gy + 3 * s);
      ctx.lineTo(gx - 0.9 * s, gy + 0.9 * s);
      ctx.lineTo(gx - 3 * s, gy);
      ctx.lineTo(gx - 0.9 * s, gy - 0.9 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'solarCrown': {
      // The mythic Supernova crown (GS-supernova-flame): a jewelled, pointed CIRCLET (no faceplate —
      // the face stays clear) erupting into a CROWN OF SOLAR FLAMES that fan WIDE, shoulder-to-shoulder
      // — purple-black tongues fading to red coronal tips, red embers, a hot core gem. The set-matched
      // twin of the wardrobe SVG (`apparelArt.ts hatGlyph 'solarCrown'`); the SVG carries the flicker,
      // the canvas is a static snapshot. Authored against the canonical r=7 head.
      const s = r / 7;
      const cor = accent; // red coronal
      const corHi = '#ffb648';
      const rb = 7.6 * s;
      const flames: [number, number, number, number][] = [
        [0, 14, 3.0, 0],
        [-3.0, 12, 2.6, -0.9], [3.0, 12, 2.6, 0.9],
        [-5.5, 9.6, 2.2, -1.9], [5.5, 9.6, 2.2, 1.9],
        [-7.6, 7.2, 1.9, -3.0], [7.6, 7.2, 1.9, 3.0],
        [-9.0, 5.0, 1.5, -3.8], [9.0, 5.0, 1.5, 3.8],
      ];
      const flame = (
        bx: number, by: number, h: number, w: number, c: number, fill: string | CanvasGradient,
      ): void => {
        ctx.beginPath();
        ctx.moveTo(bx - w, by);
        ctx.quadraticCurveTo(bx - w * 0.78, by - h * 0.5, bx - w * 0.12 + c * 0.4, by - h * 0.72);
        ctx.quadraticCurveTo(bx + c * 0.9, by - h * 0.92, bx + c, by - h);
        ctx.quadraticCurveTo(bx + w * 0.55 + c * 0.4, by - h * 0.52, bx + w * 0.82, by - h * 0.34);
        ctx.quadraticCurveTo(bx + w, by - h * 0.15, bx + w, by);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      for (const [x, h0, w0, c0] of flames) {
        const bx = hx + x * s;
        const by = hy - Math.sqrt(Math.max(0, rb * rb - x * s * (x * s)));
        const h = h0 * s;
        const w = w0 * s;
        const c = c0 * s;
        flame(bx, by, h * 1.08, w * 1.16, c, '#160826'); // dark back-flame for depth
        const grad = ctx.createLinearGradient(bx, by, bx + c, by - h);
        grad.addColorStop(0, '#160826');
        grad.addColorStop(0.3, color);
        grad.addColorStop(0.52, '#6a24b8');
        grad.addColorStop(0.7, '#b8309a');
        grad.addColorStop(0.84, cor);
        grad.addColorStop(1, corHi);
        ctx.strokeStyle = '#0c1116';
        ctx.lineWidth = 0.4;
        flame(bx, by, h, w, c, grad);
        ctx.stroke();
        flame(bx, by, h * 0.66, w * 0.5, c * 0.7, cor); // inner red lick
        flame(bx, by, h * 0.4, w * 0.28, c * 0.5, corHi); // hot core lick
      }
      // Pointed crown circlet resting on the brow (no faceplate). Peaks: centre -5.6, inner ±5.0,
      // outer ±4.4; a gently-bowed base tucks it onto the forehead so the face stays clear.
      const cp: [number, number][] = [
        [-6.4, -2.2], [-6.4, -3.2], [-5.1, -4.4], [-3.8, -3.0], [-2.5, -5.0], [-1.2, -3.4],
        [0, -5.6], [1.2, -3.4], [2.5, -5.0], [3.8, -3.0], [5.1, -4.4], [6.4, -3.2], [6.4, -2.2],
      ];
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      cp.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(hx + px * s, hy + py * s);
        else ctx.lineTo(hx + px * s, hy + py * s);
      });
      ctx.quadraticCurveTo(hx, hy - 1.5 * s, hx - 6.4 * s, hy - 2.2 * s); // bowed base
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Metallic rim highlight along the base.
      ctx.strokeStyle = mixHex(color, '#ffffff', 0.3);
      ctx.lineWidth = 0.6 * s;
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.75;
      ctx.beginPath();
      ctx.moveTo(hx - 6.1 * s, hy - 2.9 * s);
      ctx.quadraticCurveTo(hx, hy - 4.0 * s, hx + 6.1 * s, hy - 2.9 * s);
      ctx.stroke();
      ctx.globalAlpha = ctx.globalAlpha / 0.75;
      // Ember gems set at the crown points.
      for (const [ex, ey, hot] of [[-5.1, -4.4, false], [5.1, -4.4, false], [-2.5, -5.0, true], [2.5, -5.0, true]] as [number, number, boolean][]) {
        ctx.fillStyle = hot ? corHi : cor;
        ctx.beginPath();
        ctx.arc(hx + ex * s, hy + ey * s, 0.62 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // A few static embers floating above the burst.
      const embers: [number, number, number, boolean][] = [
        [-8.5, -10, 0.6, false], [8.5, -9, 0.7, true], [0, -18, 0.6, false], [5, -13, 0.7, true],
      ];
      for (const [ex, ey, er, hot] of embers) {
        ctx.fillStyle = hot ? corHi : cor;
        ctx.beginPath();
        ctx.arc(hx + ex * s, hy + ey * s, er * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // A small coronal sun-spark at the crown's centre point (a 4-point star, not a round "eye").
      const scx = hx;
      const scy = hy - 5.2 * s;
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.4;
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(scx, scy, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = corHi;
      ctx.beginPath();
      ctx.moveTo(scx, scy - 2.4 * s);
      ctx.lineTo(scx + 0.65 * s, scy - 0.65 * s);
      ctx.lineTo(scx + 2.4 * s, scy);
      ctx.lineTo(scx + 0.65 * s, scy + 0.65 * s);
      ctx.lineTo(scx, scy + 2.4 * s);
      ctx.lineTo(scx - 0.65 * s, scy + 0.65 * s);
      ctx.lineTo(scx - 2.4 * s, scy);
      ctx.lineTo(scx - 0.65 * s, scy - 0.65 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(scx, scy, 0.55 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'supernova': {
      // The mythic Supernova crown (GS-solar-flames): an opaque violet crown CAP worn over the head top
      // (so the crown fits the head, not a floating orb) with a DETONATING STAR bursting from it — rays
      // rooted along the HEAD CREST fanning radially to frame the head, a nebula shell of violet/pink
      // puffs, bright star-knots, and a white-hot core gem at the crown apex. Set-matched to the nebula
      // Suit/Leggings; the twin of the wardrobe SVG (`apparelArt.ts hatGlyph 'supernova'`). r=7 head.
      const s = r / 7;
      const tip = '#fff4c2';
      const rb = 7.6; // rays root along the head crest so the burst hugs the head (like the flame crown)
      // Nebula shell puffs (soft, nestled just above the crest, behind the burst).
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.4;
      const puffs: [number, number, number, boolean][] = [
        [0, -10, 2.9, false], [-5, -8.8, 2.5, true], [5, -8.8, 2.5, true], [-8.2, -6, 2.1, false], [8.2, -6, 2.1, false],
      ];
      for (const [ux, uy, ur, pink] of puffs) {
        ctx.fillStyle = pink ? accent : color;
        ctx.beginPath();
        ctx.arc(hx + ux * s, hy + uy * s, ur * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Radial rays rooted along the head crest — a sunburst fanning around the upper head.
      const fil: [number, number, number][] = [
        [0, 9.5, 1.35], [-2.7, 8.8, 1.2], [2.7, 8.8, 1.2], [-4.9, 7.6, 1.1], [4.9, 7.6, 1.1],
        [-6.4, 6.2, 1.0], [6.4, 6.2, 1.0], [-7.3, 4.8, 0.85], [7.3, 4.8, 0.85],
      ];
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.4;
      for (const [x, len, w] of fil) {
        const by = -Math.sqrt(Math.max(0, rb * rb - x * x));
        const ux = x / rb;
        const uy = by / rb;
        const rootx = hx + x * s;
        const rooty = hy + by * s;
        const tx = hx + (x + len * ux) * s;
        const ty = hy + (by + len * uy) * s;
        const px = -uy;
        const py = ux;
        const grad = ctx.createLinearGradient(rootx, rooty, tx, ty);
        grad.addColorStop(0, color);
        grad.addColorStop(0.48, '#8a3ad6');
        grad.addColorStop(0.76, accent);
        grad.addColorStop(1, tip);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(rootx - w * s * px, rooty - w * s * py);
        ctx.lineTo(tx, ty);
        ctx.lineTo(rootx + w * s * px, rooty + w * s * py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Opaque crown cap covering the head top (the WORN part), violet gradient bottom→top.
      const capg = ctx.createLinearGradient(hx, hy - 2 * s, hx, hy - 7 * s);
      capg.addColorStop(0, mixHex(color, '#000000', 0.45));
      capg.addColorStop(1, mixHex(color, '#ffffff', 0.14));
      ctx.fillStyle = capg;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 7 * s, Math.atan2(-2, -6.7), Math.atan2(-2, 6.7), false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Hot-pink rim highlight along the brow + two starlight gems.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 6.4 * s, Math.atan2(-2.6, -6.2), Math.atan2(-2.6, 6.2), false);
      ctx.stroke();
      for (const gx of [-4.6, 4.6]) {
        ctx.fillStyle = tip;
        ctx.beginPath();
        ctx.arc(hx + gx * s, hy - 3.4 * s, 0.6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bright star-knots strung through the burst.
      const knots: [number, number, number, boolean][] = [
        [-3.6, -13, 0.8, true], [3.6, -13, 0.8, true], [-9.5, -9, 0.75, false], [9.5, -9, 0.75, false],
        [0, -15.5, 0.7, false], [-12, -5.5, 0.7, false], [12, -5.5, 0.7, false],
      ];
      for (const [kx, ky, kr, white] of knots) {
        ctx.fillStyle = white ? '#fff' : tip;
        ctx.beginPath();
        ctx.arc(hx + kx * s, hy + ky * s, kr * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // White-hot core gem at the crown apex: a soft radial glow, a 4-point star, a white pip.
      const bcx = hx;
      const bcy = hy - 6.6 * s;
      const cg = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, 4 * s);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.4, tip);
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(bcx, bcy, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tip;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(bcx, bcy - 3.4 * s);
      ctx.lineTo(bcx + 0.9 * s, bcy - 0.9 * s);
      ctx.lineTo(bcx + 3.4 * s, bcy);
      ctx.lineTo(bcx + 0.9 * s, bcy + 0.9 * s);
      ctx.lineTo(bcx, bcy + 3.4 * s);
      ctx.lineTo(bcx - 0.9 * s, bcy + 0.9 * s);
      ctx.lineTo(bcx - 3.4 * s, bcy);
      ctx.lineTo(bcx - 0.9 * s, bcy - 0.9 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bcx, bcy, 1 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wingedHelm': {
      // The Asgardian Valkyrie helm (GS-valkyrie): a feathered silver wing swept up each side (behind
      // the dome), a steel dome, a gold brow band + nasal guard, and a gold rivet emblem. Mirrors the
      // wardrobe SVG (`apparelArt.ts hatGlyph 'wingedHelm'`).
      ctx.save();
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.7;
      ctx.fillStyle = '#eef2f8';
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + d * 4.5, hy - 5);
        ctx.bezierCurveTo(hx + d * 10, hy - 6.5, hx + d * 14, hy - 10, hx + d * 15.5, hy - 15);
        ctx.bezierCurveTo(hx + d * 13.5, hy - 12.5, hx + d * 12, hy - 12.8, hx + d * 11, hy - 11.2);
        ctx.bezierCurveTo(hx + d * 10.2, hy - 9.8, hx + d * 8.8, hy - 10, hx + d * 7.6, hy - 9);
        ctx.bezierCurveTo(hx + d * 6.6, hy - 7.6, hx + d * 5.4, hy - 6.6, hx + d * 4.5, hy - 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // Steel dome.
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy - 3, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Gold brow band, nasal guard, emblem.
      ctx.fillStyle = accent;
      ctx.fillRect(hx - r, hy - 3.4, r * 2, 2.4);
      ctx.fillRect(hx - 1.2, hy - 1.2, 2.4, 5.4);
      ctx.beginPath();
      ctx.arc(hx, hy - 6.1, 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'baggy':
      // The baggy green (GS-unending): a soft crown that slouches back off the brow, over a short
      // front brim, with a gold emblem dot. Mirrors the wardrobe SVG's slouched silhouette.
      ctx.beginPath();
      ctx.moveTo(hx - r - 1.5, hy - 1);
      ctx.quadraticCurveTo(hx - r - 2.5, hy - r - 2, hx - 2, hy - r - 3);
      ctx.quadraticCurveTo(hx + 3, hy - r - 4.5, hx + r - 1, hy - r + 0.5);
      ctx.quadraticCurveTo(hx + r + 1, hy - 2, hx + r - 1, hy - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx + 3, hy - 2, r + 1.5, 2.4); // short front brim
      ctx.beginPath();
      ctx.arc(hx, hy - r + 1, 1.3, 0, Math.PI * 2); // gold emblem
      ctx.fill();
      break;
    case 'tricorn': {
      // The galaxy pirate TRICORN (GS-space-pirate-parrot): a cocked three-corner felt hat washed in
      // nebula + starlight, gold buccaneer trim along the cocked brim, a starlight emblem, and a built-in
      // black EYE PATCH over one eye. Mirrors the wardrobe SVG (`apparelArt.ts hatGlyph 'tricorn'`);
      // authored against the canonical r=7 head, scaled by s.
      const s = r / 7;
      const P = (x: number, y: number): [number, number] => [hx + x * s, hy + y * s];
      const felt = (): void => {
        ctx.beginPath();
        let p = P(-11.5, -1.8); ctx.moveTo(p[0], p[1]);
        p = P(-8, -9.6); ctx.lineTo(p[0], p[1]);
        let c1 = P(-6, -7); let e = P(-4.2, -6.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        c1 = P(-2, -11); e = P(0, -11.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        c1 = P(2, -11); e = P(4.2, -6.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        c1 = P(6, -7); e = P(8, -9.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        p = P(11.5, -1.8); ctx.lineTo(p[0], p[1]);
        c1 = P(0, 1.8); e = P(-11.5, -1.8); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        ctx.closePath();
      };
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      felt();
      ctx.fill();
      ctx.stroke();
      // Nebula wash swoosh.
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.5;
      ctx.strokeStyle = glow ?? '#7a5cff';
      ctx.lineWidth = 1.6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let q = P(-9, -3); ctx.moveTo(q[0], q[1]);
      let cc = P(-3, -8); let ee = P(3, -5); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(8, -3.6); ee = P(9.5, -6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      ctx.stroke();
      ctx.restore();
      // Starfield on the felt.
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy, sr] of [[-6.5, -4.5, 0.55], [-3, -7.5, 0.5], [2.5, -8, 0.55], [6, -5, 0.5], [-8.5, -3, 0.45], [8.5, -3.2, 0.45], [0, -6, 0.4]] as [number, number, number][]) {
        ctx.beginPath();
        ctx.arc(hx + sx * s, hy + sy * s, sr * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Gold trim re-tracing the cocked upper brim.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      q = P(-11.5, -1.8); ctx.moveTo(q[0], q[1]);
      q = P(-8, -9.6); ctx.lineTo(q[0], q[1]);
      cc = P(-6, -7); ee = P(-4.2, -6.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(-2, -11); ee = P(0, -11.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(2, -11); ee = P(4.2, -6.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(6, -7); ee = P(8, -9.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      q = P(11.5, -1.8); ctx.lineTo(q[0], q[1]);
      ctx.stroke();
      // Starlight emblem (a 4-point star) front-and-centre.
      const ex = hx;
      const ey = hy - 4.4 * s;
      ctx.fillStyle = '#fff0c0';
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.4 * s;
      ctx.beginPath();
      ctx.moveTo(ex, ey - 2.8 * s);
      ctx.lineTo(ex + 0.8 * s, ey - 0.8 * s);
      ctx.lineTo(ex + 2.8 * s, ey);
      ctx.lineTo(ex + 0.8 * s, ey + 0.8 * s);
      ctx.lineTo(ex, ey + 2.8 * s);
      ctx.lineTo(ex - 0.8 * s, ey + 0.8 * s);
      ctx.lineTo(ex - 2.8 * s, ey);
      ctx.lineTo(ex - 0.8 * s, ey - 0.8 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, 0.7 * s, 0, Math.PI * 2);
      ctx.fill();
      // Eye patch over one eye (the +x eye), with a strap across the brow.
      ctx.strokeStyle = '#0c0a14';
      ctx.lineWidth = 0.9 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      q = P(-4.8, -2.4); ctx.moveTo(q[0], q[1]);
      q = P(4.6, -0.6); ctx.lineTo(q[0], q[1]);
      ctx.stroke();
      ctx.fillStyle = '#100c1a';
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.6 * s;
      ctx.beginPath();
      ctx.ellipse(hx + 2.6 * s, hy + 0.6 * s, 2.15 * s, 2.45 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/**
 * Draw a cosmetic GOLF BAG (GS-wardrobe-bagtier) propped beside the golfer — the canvas mirror of the
 * wardrobe SVG `bagGlyph`: a tapered staff-bag body with gold trim + pocket + strap, three clubs standing
 * out the top, and a soft aura for the glowing tiers. Authored in a ~34u-tall glyph frame about (cx,cy),
 * fitted by `scale`. Kept in sync with `apparelArt.ts bagGlyph` so what you outfit is what you carry.
 */
function drawGolfBag(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, look: ApparelLook): void {
  const { color, accent = '#d9b74a', glow } = look;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (glow) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.5;
    const g = ctx.createRadialGradient(0, -3, 2, 0, -3, 20);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -3, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Clubs poking out of the top.
  ctx.strokeStyle = '#b9c2cf';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-3.5, -11); ctx.lineTo(-5.5, -19);
  ctx.moveTo(0.5, -11); ctx.lineTo(0.5, -21);
  ctx.moveTo(4, -11); ctx.lineTo(6, -18);
  ctx.stroke();
  ctx.fillStyle = '#dfe6f0';
  ctx.strokeStyle = '#0c1116';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(-5.9, -19.6, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.5, -21); ctx.lineTo(4.4, -19.6); ctx.lineTo(0.5, -18.6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(6.4, -18.5, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Bag body (tapered), gold top ring, trim band, pocket, strap, drawstring ring.
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0c1116';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6.5, -11); ctx.lineTo(6.5, -11); ctx.lineTo(5.4, 13);
  ctx.quadraticCurveTo(0, 15.4, -5.4, 13); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.ellipse(0, -11, 6.5, 2.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillRect(-4.6, -4, 9.2, 2);
  ctx.beginPath();
  ctx.moveTo(-4.2, 0); ctx.lineTo(4.2, 0); ctx.lineTo(3.6, 8);
  ctx.quadraticCurveTo(0, 9.6, -3.6, 8); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(-11, 0, -5.6, 10); ctx.stroke();
  ctx.strokeStyle = '#0f5132';
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.arc(0, 4, 1.9, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * Draw cosmetic PANTS on the golfer's legs (canvas) — replaces the default dark legs. Authored in the
 * same local frame as `drawGolfer` (hip at (2,-30), feet at (-7,0) & (12,0); the outer transform mirrors
 * for a lefty). Shapes mirror the wardrobe SVG (`render/apparelArt.ts`) so what you buy is what you wear.
 */
function drawPants(ctx: CanvasRenderingContext2D, look: ApparelLook, skin: string, alpha: number): void {
  const { shape, color, accent = '#0c1116', glow } = look;
  const hip: Vec = [2, -30];
  const feet: Vec[] = [[-7, 0], [12, 0]];
  // Stroke both legs from the hip down to a fraction `frac` of the way to each foot (1 = full leg).
  const legs = (col: string, w: number, frac = 1): void => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const [fx, fy] of feet) {
      ctx.moveTo(hip[0], hip[1]);
      ctx.lineTo(hip[0] + (fx - hip[0]) * frac, hip[1] + (fy - hip[1]) * frac);
    }
    ctx.stroke();
  };
  // A soft aura behind the legs for the glowing top tiers.
  if (glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    legs(glow, 14);
    ctx.restore();
  }
  switch (shape) {
    case 'shorts':
      legs(skin, 5); // bare shins
      legs(color, 7.5, 0.5); // shorts to the knee
      break;
    case 'knickers':
      legs(skin, 4.5); // long socks
      legs(color, 8.5, 0.62); // puffed plus-fours past the knee
      ctx.fillStyle = accent; // buckled cuffs
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.62, hip[1] + (fy - hip[1]) * 0.62, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'leggings':
      legs(color, 5);
      break;
    case 'spacepants':
      legs(color, 7);
      ctx.fillStyle = accent; // mag-boots
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.ellipse(fx, fy - 1, 3, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'nebula':
      legs(color, 6.5);
      ctx.fillStyle = '#fff'; // a starfield running the length of both legs (GS-worn-coverage)
      for (const [fx, fy] of feet) {
        for (const [fr, rr] of [[0.2, 0.9], [0.42, 0.7], [0.62, 0.8], [0.82, 0.6]] as [number, number][]) {
          const dx = fr > 0.5 ? 1.2 : -1.2;
          ctx.beginPath();
          ctx.arc(hip[0] + (fx - hip[0]) * fr + dx, hip[1] + (fy - hip[1]) * fr, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'emberlegs': {
      // Solar Flames leggings (GS-solar-flames): dark leggings with solar flames licking up each shin
      // (dark→violet→magenta→red→hot) + red embers rising. Mirrors the wardrobe SVG (`pantsGlyph`).
      legs(color, 6.5);
      const cor = accent;
      const corHi = '#ffb648';
      const flame = (
        bx: number, by: number, h: number, w: number, c: number, fill: string,
      ): void => {
        ctx.beginPath();
        ctx.moveTo(bx - w, by);
        ctx.quadraticCurveTo(bx - w * 0.78, by - h * 0.5, bx - w * 0.12 + c * 0.4, by - h * 0.72);
        ctx.quadraticCurveTo(bx + c * 0.9, by - h * 0.92, bx + c, by - h);
        ctx.quadraticCurveTo(bx + w * 0.55 + c * 0.4, by - h * 0.52, bx + w * 0.82, by - h * 0.34);
        ctx.quadraticCurveTo(bx + w, by - h * 0.15, bx + w, by);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      for (const [fx, fy] of feet) {
        const c = (hip[0] - fx) * 0.12; // lean the flame tip up the leg toward the hip
        const layers: [number, number, string][] = [
          [15 * 1.12, 3.4 * 1.16, '#160826'], [15, 3.4, '#6a24b8'], [12, 2.4, '#b8309a'],
          [8.4, 1.7, cor], [4.8, 1, corHi],
        ];
        for (const [h, w, fill] of layers) flame(fx, fy - 2, h, w, c * (h / 15), fill);
      }
      ctx.fillStyle = cor;
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.5, hip[1] + (fy - hip[1]) * 0.5 - 4, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'riftgreaves': {
      // Punched Galaxy greaves (GS-punched-galaxy): cosmic leggings with galaxy-crack energy down each
      // thigh (accent + white core) over dark angular shin plates + star specks. Mirrors the wardrobe SVG.
      legs(color, 6.5);
      const crackPath = (): void => {
        ctx.beginPath();
        for (const [fx, fy] of feet) {
          const side = fx > hip[0] ? 1 : -1;
          ctx.moveTo(hip[0] + (fx - hip[0]) * 0.1, hip[1] + (fy - hip[1]) * 0.1);
          ctx.lineTo(hip[0] + (fx - hip[0]) * 0.34 + side * 1.6, hip[1] + (fy - hip[1]) * 0.34);
          ctx.lineTo(hip[0] + (fx - hip[0]) * 0.58, hip[1] + (fy - hip[1]) * 0.58);
        }
      };
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      crackPath();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      ctx.stroke(); // white core over the same path
      // Dark shin plates over the lower legs, with an accent rim at the knee.
      ctx.strokeStyle = '#160826';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.6, hip[1] + (fy - hip[1]) * 0.6);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        const tx = hip[0] + (fx - hip[0]) * 0.6;
        const ty = hip[1] + (fy - hip[1]) * 0.6;
        ctx.moveTo(tx - 2.5, ty);
        ctx.lineTo(tx + 2.5, ty);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff'; // star specks
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.44, hip[1] + (fy - hip[1]) * 0.44, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'parrotpants': {
      // Space Parrot tailfeathers (GS-space-pirate-parrot): cosmic-navy legs draped in long macaw
      // tail-plumes (teal/gold/magenta) + star specks. Mirrors the wardrobe SVG (`pantsGlyph`).
      legs(color, 6.5);
      const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
      const feather = (x0: number, y0: number, x1: number, y1: number, w: number, col: string): void => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * w;
        const ny = (dx / len) * w;
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1);
        ctx.quadraticCurveTo(mx - nx, my - ny, x0, y0);
        ctx.closePath();
        ctx.fill();
      };
      let li = 0;
      for (const [fx, fy] of feet) {
        const ex = hip[0] + (fx - hip[0]) * 0.82;
        const ey = hip[1] + (fy - hip[1]) * 0.82;
        feather(hip[0], hip[1], fx, fy, 2.6, plume[li % 3]!);
        feather(hip[0], hip[1], ex - 2, ey, 1.7, plume[(li + 1) % 3]!);
        feather(hip[0], hip[1], ex + 2, ey, 1.7, plume[(li + 2) % 3]!);
        li++;
      }
      ctx.fillStyle = '#fff'; // star specks along the plumes
      for (const [fx, fy] of feet) {
        for (const fr of [0.3, 0.6]) {
          ctx.beginPath();
          ctx.arc(hip[0] + (fx - hip[0]) * fr + (fr > 0.4 ? 1 : -1), hip[1] + (fy - hip[1]) * fr, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'greaves': {
      legs(color, 6.5); // crimson-leather leggings
      // Gold shin greaves over the lower half of each leg.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.5, hip[1] + (fy - hip[1]) * 0.5);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      // War-skirt tassets hanging off the hip.
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hip[0] - 6, hip[1]);
      ctx.lineTo(hip[0] + 8, hip[1]);
      ctx.lineTo(hip[0] + 3, hip[1] + 8);
      ctx.lineTo(hip[0] - 2, hip[1] + 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'trousers':
    default:
      legs(color, 6.5);
      break;
  }
  // A waistband accent across the hip (skipped for shorts, which read better bare-waisted).
  if (shape !== 'shorts') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hip[0] - 4, hip[1]);
    ctx.lineTo(hip[0] + 4, hip[1]);
    ctx.stroke();
  }
}

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
  /** The selected golfer's look (GS-18). Absent → the loader-crew cap cycle (result-screen replay). */
  golferLook?: GolferLook;
  /** The hired named caddy id (GS-caddy) — the actual hired caddy. A GUARD caddy (Space Ducks /
   *  Convict Sheep) is drawn persistently in the corner and powers the laser/boomerang redirect;
   *  any other hired caddy only appears transiently for its signature effect (e.g. Dr Chipinski on a
   *  chip-in). Absent → no caddy figure. */
  caddyId?: string;
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
  const isCetus = archetypeFor(opts.themeId, opts.biome ?? '') === 'cetus' && !opts.rainbow;
  const cetusFlow = isCetus ? createCetusFlow(hole) : null;
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
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(text).width + 16;
    ctx.fillRect(8, 8, w, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 16, 24);
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
    weather.draw(ctx, now);
    // The moving Cetus star-waterfall (GS-cetus-flow), over the scene + weather but UNDER the ball,
    // FX and HUD (drawn later) so the ball still flies clearly over the river of stars.
    cetusFlow?.draw(ctx, proj, now, flowAccents, F.cetusFlowSpeed);

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
    if (hasCaddyArt(figureCaddyId)) {
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
          // Ship-corridor wall ricochet (GS-ship-walls): the flight ENDS at the wall it clanged off
          // (the sim set the landing there), so touchdown IS the impact — throw a metallic spark + a
          // hull clang here, harder for a double bounce. The flight/roll already show it bouncing back.
          if (shot.wallHit && wallFiredShot !== shotIndex) {
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
        ctx.beginPath();
        trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
        // GS-tracer: the flight trail reads the chosen golfer's colour (was a fixed yellow).
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = look.cap;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Ball (a touch bigger when lofted).
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(gx, ballY, 3 + (height / (peak + 1)) * 1.5, 0, Math.PI * 2);
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

