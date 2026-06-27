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
import { playBoundsCorners, surfaceFirmness } from '../sim/round';
import { holeProjector } from './project';
import { buildScene, drawScenePrims, type Prim } from './style';
import { drawCaddy, drawCaddyProjectile, hasCaddyArt, CADDY_LABEL, type CaddyArtId } from './caddyArt';
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
  restHoldMs: 480,
  golfer: true,
  golferPx: 40,
  swingLeadMs: 520,
  followMs: 440,
  spaceFX: true,
};

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
}
/** A cap colour → a full look (shirt matches the cap; default skin) — the loader-crew fallback. */
function lookFromColor(color: string): GolferLook {
  return { cap: color, shirt: color, skin: '#f0c49a', build: 1 };
}

/** Tiny deterministic PRNG (mulberry32) — the house style, so the ambient FX are stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

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
  ctx.translate(bx - B[0] * u, by - B[1] * u);
  ctx.scale(u, u);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(6, 1, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs (a planted stance).
  ctx.strokeStyle = '#2c3142';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(2, -30);
  ctx.lineTo(-7, 0);
  ctx.moveTo(2, -30);
  ctx.lineTo(12, 0);
  ctx.stroke();

  // Torso (hip → shoulders, tilted toward the ball).
  ctx.strokeStyle = look.shirt;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(2, -30);
  ctx.lineTo(S[0], S[1]);
  ctx.stroke();

  // Club shaft + head (behind the arms).
  ctx.strokeStyle = '#d9dee8';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(head[0], head[1]);
  ctx.stroke();
  ctx.fillStyle = '#aeb6c6';
  ctx.beginPath();
  ctx.arc(head[0], head[1], 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Arms (shoulders → hands).
  ctx.strokeStyle = look.skin;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(S[0], S[1]);
  ctx.lineTo(hands[0], hands[1]);
  ctx.stroke();

  // Head + cap (brim points down the line).
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(12, -58, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.cap;
  ctx.beginPath();
  ctx.arc(12, -59, 7, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(15, -60, 9, 3); // brim

  ctx.restore();
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
  /** Called once the final shot has landed. */
  onDone?: () => void;
  /**
   * Zoom-and-follow: when set, the camera centres on `focus` (the starting ball) at radius
   * `viewRadius` (course yards) and — if `follow` — eases to track the ball in flight, so the
   * animation matches the zoomed decision map (no jarring zoom jump) and keeps up with the ball.
   */
  focus?: Vec;
  viewRadius?: number;
  /** Where the focus point sits vertically (0=top..1=bottom); higher = ball lower, more shot ahead. */
  focusBias?: number;
  follow?: boolean;
  /** The selected golfer's look (GS-18). Absent → the loader-crew cap cycle (result-screen replay). */
  golferLook?: GolferLook;
  /** The hired named caddy id (GS-caddy) — draws that caddy in the corner and powers the laser/
   *  boomerang redirect effect. Absent → no caddy figure. */
  caddyId?: string;
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
  const buildProj = () =>
    followMode
      ? holeProjector(hole, { width, height, focus: camera, viewRadius: opts.viewRadius, focusBias: opts.focusBias })
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
  // Caddy-guard redirect (GS-caddy): the projectile fired for the current shot, if any.
  let redirectFiredShot = -1;
  let redirectFx: { kind: 'laser' | 'boomerang'; t0: number; from: Vec; to: Vec } | null = null;
  let caddyAnchor: Vec = [0, 0]; // the corner caddy's muzzle (screen px), refreshed each frame

  function reset(now: number): void {
    shotIndex = 0;
    puttIndex = 0;
    segStart = now;
    trail = [];
    particles = [];
    shake = 0;
    done = false;
    lastImpactShot = -1;
    lastRollClearShot = -1;
    redirectFiredShot = -1;
    redirectFx = null;
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
      cachedScene = buildScene(hole, proj, { width, height, biome: opts.biome, themeId: opts.themeId });
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

  // Animated space ambience: a fixed far starfield in the upper sky that twinkles, plus a
  // shooting star that sweeps through on a slow loop. Purely additive "alive" feel on top of
  // the static (seeded) celestial accents the scene builder already bakes in. Positions are
  // seeded off the hole so they're stable for the session; only the alpha/sweep animate.
  const fxRng = mulberry32((Math.round(hole.tee[0] * 7 + hole.green[1] * 13 + hole.par * 101) >>> 0) ^ 0x51ed);
  const fxStars = Array.from({ length: 18 }, () => ({
    x: fxRng() * width,
    y: fxRng() * height * 0.5, // bias to the upper "sky" band
    r: 0.5 + fxRng() * 1.2,
    ph: fxRng() * Math.PI * 2,
    blue: fxRng() < 0.5,
  }));
  const shootPeriod = 5200;
  const shootDur = 760;
  const shootOff = fxRng() * shootPeriod;
  function drawSpaceFX(now: number): void {
    if (!F.spaceFX) return;
    ctx.save();
    for (const s of fxStars) {
      const a = 0.18 + 0.5 * (0.5 + 0.5 * Math.sin(now * 0.003 + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.blue ? '#bcd6ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shooting star sweeping down-right across the upper third on a slow loop.
    const sp = ((now + shootOff) % shootPeriod) / shootDur;
    if (sp <= 1) {
      const x0 = -40;
      const y0 = height * 0.06;
      const x1 = width + 40;
      const y1 = height * 0.34;
      const hx = x0 + (x1 - x0) * sp;
      const hy = y0 + (y1 - y0) * sp;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const tail = 60;
      const a = Math.sin(sp * Math.PI);
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(220,235,255,0.9)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function frame(now: number): void {
    if (!segStart) segStart = now;

    // Follow-cam: ease the camera toward the ball's last position and rebuild the projector,
    // so the view pans to keep up with the ball (one-frame lag is imperceptible).
    if (followMode && opts.follow) {
      camera = [camera[0] + (lastGround[0] - camera[0]) * 0.2, camera[1] + (lastGround[1] - camera[1]) * 0.2];
      proj = buildProj();
    }

    // Screen-shake offset (deterministic decay).
    ctx.save();
    if (shake > 0) {
      const amp = F.shakeAmp * shake;
      ctx.translate(Math.sin(now * 0.08) * amp, Math.cos(now * 0.11) * amp);
      shake = Math.max(0, shake - 0.06);
    }

    drawStatic();
    drawSpaceFX(now);

    // The hired caddy stands in the bottom-left corner the whole hole (GS-caddy). Its muzzle anchor
    // is where the Space Ducks laser / Convict Sheep boomerang launches from on a redirect.
    if (hasCaddyArt(opts.caddyId)) {
      const ch = Math.max(40, Math.min(56, height * 0.085));
      const cx = ch * 0.7 + 6;
      const cy = height - 14;
      caddyAnchor = drawCaddy(ctx, opts.caddyId, cx, cy, ch, now);
      ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(CADDY_LABEL[opts.caddyId as CaddyArtId], cx, cy + 9);
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
        if (F.golfer) drawGolfer(ctx, bx, by, golferH, clamp01((now - segStart) / lead), 0, 1, look);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        hudText = `${shot.club.name} · ${Math.round(carry)} yds`;
      } else {
        const elapsed = flightElapsed;
        let ground: Vec;
        let height: number;
        if (elapsed < flightDur) {
          const tg = elapsed / flightDur;
          const rd = shot.result.redirect;
          if (rd) {
            // Caddy-guard redirect (GS-caddy): the ball curves toward the would-be miss
            // (originalLanding), the caddy fires mid-flight, then it's knocked back to the green
            // (touchdown). Height is the single loft arc over the whole flight (it ignores the
            // landing point), so only the GROUND path kinks at the intercept — exactly the "zapped"
            // read. Eyes-on feel; the SCORE already used the redirected landing.
            const interceptFrac = 0.5;
            const fireFrac = 0.4;
            const sI = sampleCurvedFlight(shot.from, rd.originalLanding, bearing, interceptFrac, peak);
            if (tg >= fireFrac && redirectFiredShot !== shotIndex) {
              redirectFiredShot = shotIndex;
              const [ipx, ipy] = proj.project(sI.ground);
              redirectFx = {
                kind: rd.kind,
                t0: now,
                from: caddyAnchor,
                to: [ipx, ipy - sI.height * proj.scale * F.heightExaggeration],
              };
              shake = Math.max(shake, 0.4);
            }
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
          const rt = rollDur > 0 ? Math.min(1, (elapsed - flightDur) / rollDur) : 1;
          const e = easeOutCubic(rt);
          ground = [touchdown[0] + (rest[0] - touchdown[0]) * e, touchdown[1] + (rest[1] - touchdown[1]) * e];
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
        const [gx, gy] = proj.project(ground);
        const ballY = gy - height * proj.scale * F.heightExaggeration;

        // Golfer holds the follow-through at the address point, fading as the ball flies off.
        if (F.golfer && elapsed < F.followMs) {
          const [bx, by] = proj.project(shot.from);
          const fol = clamp01(elapsed / F.followMs);
          drawGolfer(ctx, bx, by, golferH, 1, Math.max(0.001, fol), 1 - fol, look);
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
        ctx.strokeStyle = 'rgba(255,216,74,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

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

    // Caddy-guard projectile (laser/boomerang) flying from the caddy to the ball mid-flight.
    if (redirectFx) {
      const dur = redirectFx.kind === 'laser' ? 150 : 300;
      const age = now - redirectFx.t0;
      drawCaddyProjectile(ctx, redirectFx.kind, redirectFx.from, redirectFx.to, clamp01(age / dur), now);
      if (age >= dur) {
        spawnImpact(redirectFx.to, 0.45);
        redirectFx = null;
      }
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
