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
import { archetypeFor } from '../sim/course/themes';
import type { ApparelLook } from '../sim/rpg/apparel';
import { holeProjector } from './project';
import { buildScene, drawScenePrims, type Prim } from './style';
import { createWeather, type WeatherHandle } from './weather';
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
  // Spacesuit chest control panel — a small accented box that sells the "suit" read.
  if (look.shirtStyle?.shape === 'spacesuit') {
    ctx.fillStyle = '#cdd6e2';
    ctx.fillRect(2, -44, 8, 7);
    ctx.fillStyle = look.shirtStyle.accent ?? '#d23b32';
    ctx.fillRect(3, -42.6, 2, 2);
    ctx.fillStyle = '#2bf0c0';
    ctx.fillRect(6.5, -42.6, 2, 2);
  }

  // Club shaft + head (behind the arms). A bought themed club set (GS-proshop-2) tints the head and
  // gives it a glow + a small theme accent, so the gear you bought visibly changes the swing.
  const gear = look.gear;
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
    case 'halo':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(hx + 1, hy - 1, r - 2, r - 3, 0, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      // The glowing halo ring above.
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(hx, hy - r - 4, r, 2.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    default:
      break;
  }
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
      ctx.fillStyle = '#fff'; // a couple of starfield specks
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.4, hip[1] + (fy - hip[1]) * 0.4, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
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
  /** Fired once when the ball ricochets off a trade-camp tent (GS-tents) — the cue for app.ts to play
   *  the bonk sound + speak the yelp. The arg is the exact bubble text shown on-canvas ("Ow!" /
   *  "Watch it!") so the spoken line matches. Pure feel hook; never affects the sim. */
  onTentHit?: (text: string) => void;
  /** Called once the final shot has landed. */
  onDone?: () => void;
  /** Fired once per segment at the STRIKE moment (club–ball contact / putter tap) — the cue point
   *  for a contact sound + haptic. `quality` 0..1 for a shot (1 = pure, derived from the miss),
   *  undefined for a putt. Pure feel hook; never affects the sim. */
  onImpact?: (kind: 'shot' | 'putt', quality?: number) => void;
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
  // Trade-camp tent ricochet (GS-tents): a transient "Ow!"/"Watch it!" bubble at the struck tent.
  let tentCallout: { pos: Vec; text: string; until: number } | null = null;
  let tentFiredShot = -1; // shot whose tent-hit callout has fired

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

  // The full static world (rough texture, striped/banded surfaces, depth-banded water,
  // cell-shaded trees, OB, centreline, tee + flag) comes from the SAME shared scene builder
  // the SVG map uses, so the two renderers agree. Cache by projector identity: a whole-hole
  // fit builds once; follow-cam rebuilds the projector per frame, so the scene rebuilds too.
  let cachedProj: typeof proj | null = null;
  let cachedScene: Prim[] = [];
  function drawStatic(): void {
    if (proj !== cachedProj) {
      cachedScene = buildScene(hole, proj, { width, height, biome: opts.biome, themeId: opts.themeId, rainbow: opts.rainbow, tradeTents: opts.tradeTents });
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
      // The arc apex the SIM resolved (loft-scaled), so the drawn height matches the physics that
      // decided whether a tree knocked the ball down. The curved ground path launches along the
      // shot bearing and bends to the landing (the fade/hook banana).
      const peak = shot.result.apex;
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
      const look = opts.golferLook ?? lookFromColor(GOLFER_COLORS[shotIndex % GOLFER_COLORS.length]!);
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
          opts.onImpact?.('shot', Math.max(0, 1 - mf / 0.2));
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
            const sI = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, interceptFrac, peak);
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

            height = sampleCurvedFlight(shot.from, touchdown, bearing, tg, peak).height;
            if (tg < interceptFrac) {
              ground = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, tg, peak).ground;
            } else {
              const e = easeInOut((tg - interceptFrac) / (1 - interceptFrac));
              ground = [
                sI.ground[0] + (touchdown[0] - sI.ground[0]) * e,
                sI.ground[1] + (touchdown[1] - sI.ground[1]) * e,
              ];
            }
          } else {
            const s = sampleCurvedFlight(shot.from, touchdown, bearing, tg, peak);
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
            const [tx, ty] = proj.project(shot.tentHit.at);
            const text = shotIndex % 2 === 0 ? 'Ow!' : 'Watch it!';
            tentCallout = { pos: [tx, ty - 14], text, until: now + TENT_CALLOUT_MS };
            shake = Math.max(shake, 0.3);
            opts.onTentHit?.(text);
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
      const putt = putts[puttIndex]!;
      if (impactFiredPutt !== puttIndex) {
        impactFiredPutt = puttIndex;
        opts.onImpact?.('putt');
      }
      const len = Math.hypot(putt.to[0] - putt.from[0], putt.to[1] - putt.from[1]);
      const dur = Math.max(300, Math.min(750, len * proj.scale * 12));
      const t = Math.max(0, Math.min(1, (now - segStart) / dur));
      const e = easeOutCubic(t);
      const cur: Vec = [
        putt.from[0] + (putt.to[0] - putt.from[0]) * e,
        putt.from[1] + (putt.to[1] - putt.from[1]) * e,
      ];
      lastGround = cur; // feed the follow-cam
      const gx = proj.project(cur);

      // Putt line (aim guide) + rolling ball, both flat on the green.
      const [fx, fy] = proj.project(putt.from);
      const [tx, ty] = proj.project(putt.to);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
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

    // Trade-camp tent ricochet bubble (GS-tents): "Ow!" / "Watch it!" over the struck tent.
    if (tentCallout && now < tentCallout.until) {
      const remain = tentCallout.until - now;
      const age = TENT_CALLOUT_MS - remain;
      const fade = Math.min(1, age / 120) * Math.min(1, remain / 240);
      drawSpeechBubble(ctx, tentCallout.text, tentCallout.pos[0], tentCallout.pos[1], fade);
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
