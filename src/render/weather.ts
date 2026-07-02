/**
 * Shared atmospheric WEATHER layer (GS-journey-fx rework).
 *
 * The journey route you fly brings a `CourseEffect` — moonlight, a meteor shower, a solar or ion
 * storm, a total eclipse, a nebula shroud, a grand comet, an aurora, a debris field, a trade camp
 * (GS-journey-variety widened the set). This module is the ONE source of truth for drawing that
 * atmosphere, plus the always-on space ambience (twinkling stars, the odd shooting star) and the
 * VISIBLE wind. It is consumed by BOTH:
 *   - the animated play view (`playView.ts`) while the ball is in flight, and
 *   - a lightweight overlay on the DECISION / PUTTING screens (`app.ts`), so the world is just as
 *     alive while you're lining up the shot — not only mid-flight.
 *
 * EVERYTHING here is SCREEN-SPACE (the sky and the air), drawn in the canvas's own pixel frame. That
 * is deliberate and is what fixes the old "static decor jumps all over the place" bug: weather is the
 * sky, so it is anchored to the viewport, never to a course point that swings around under the
 * follow-cam. The old course-projected ground decor (debris shards planted near the tee) is gone — the
 * debris now drifts past in orbit, screen-fixed. (The TRADE-MARKET route is the exception: its tents
 * are real COLLIDABLE course objects around the green — GS-tents, drawn by the scene builder, not here
 * — so all that's left in this layer for it is a faint warm horizon tint.)
 *
 * Pure feel: seeded off the hole (mulberry32, never `Math.random`) so positions are stable for the
 * session and the same on every screen; only phase/drift animate off the clock. Reduced-motion draws a
 * calm single frame (the caller simply stops ticking).
 */

import { pointInPoly } from '../sim/course/contract';
import type { Vec } from '../sim/course/contract';

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
const wrap = (v: number, m: number): number => ((v % m) + m) % m;

/** A cached soft warm-white glow sprite, stamped with drawImage for hero stars / streak heads — far
 *  cheaper than per-draw `shadowBlur` (the intro's perf lesson) and gives the same lush bloom. */
let _glow: HTMLCanvasElement | null = null;
function glowSprite(): HTMLCanvasElement | null {
  if (_glow) return _glow;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(218,234,255,0.36)');
  grad.addColorStop(1, 'rgba(218,234,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glow = c;
  return c;
}

/** Per-archetype wind tint (kept in sync with the scene builder's `WIND_COL`). All TEN worlds —
 *  the five GS-worlds archetypes used to silently fall back to verdant's pollen green, so a gale on
 *  a crystal or storm world blew the wrong colour (GS-biome-feel). */
export const WIND_RGBA: Record<string, string> = {
  inferno: '255,150,70',
  frost: '222,243,255',
  desert: '226,196,140',
  verdant: '208,236,206',
  void: '200,170,255',
  crystal: '190,238,248', // glittering crystal dust
  tempest: '200,180,255', // driving storm rain
  fungal: '150,240,190', // drifting glowing spores
  ocean: '190,235,230', // sea spray
  cetus: '150,235,245', // luminous spray off the deep
};

/**
 * Always-on per-world AMBIENT particles (GS-biome-feel) — the air of the place, independent of the
 * journey effect and the wind: rising embers on the ember world, falling snow on the ice ring,
 * drifting glow-spores under the jungle canopy, fireflies at the verdant dusk, prismatic glints on
 * Prism Reach, slow stardust in the void, sea-spray flecks on the archipelago, rising
 * bioluminescent motes off the Cetus deep, dust on the dust belt — and on Tempest Reach, a distant
 * lightning flicker. Screen-space, seeded, riding the same `spaceFX` ambience gate the stars use.
 */
interface AmbientCfg {
  /** Motion model: fall (snow), rise (embers/spores/plankton), drift (dust/spray/stardust), twinkle (glints). */
  mode: 'fall' | 'rise' | 'drift' | 'twinkle';
  /** rgb triplet(s) — a particle picks one at build time. */
  cols: string[];
  /** Count per 7200 px² (the starfield's density unit), before clamping. */
  density: number;
  /** Base speed in px/s (unused for twinkle). */
  spd: number;
  /** Radius range. */
  r: [number, number];
  /** Peak alpha. */
  a: number;
  /** Bloom through the glow sprite. */
  glow?: boolean;
  /** Distant lightning flicker on top (tempest). */
  lightning?: boolean;
}
export const AMBIENT: Record<string, AmbientCfg> = {
  verdant: { mode: 'drift', cols: ['205,240,150', '235,255,180'], density: 0.16, spd: 9, r: [0.9, 1.8], a: 0.55, glow: true }, // fireflies
  desert: { mode: 'drift', cols: ['226,196,140'], density: 0.5, spd: 26, r: [0.5, 1.2], a: 0.22 }, // blown dust
  frost: { mode: 'fall', cols: ['255,255,255', '225,242,255'], density: 0.85, spd: 22, r: [0.7, 1.9], a: 0.6 }, // snowfall
  inferno: { mode: 'rise', cols: ['255,150,70', '255,205,110'], density: 0.4, spd: 18, r: [0.6, 1.5], a: 0.6, glow: true }, // embers
  void: { mode: 'drift', cols: ['200,170,255', '160,200,255'], density: 0.3, spd: 4, r: [0.5, 1.3], a: 0.4 }, // slow stardust
  crystal: { mode: 'twinkle', cols: ['255,160,200', '255,225,120', '150,255,215', '170,220,255'], density: 0.34, spd: 0, r: [0.8, 1.8], a: 0.7 }, // prismatic glints
  tempest: { mode: 'drift', cols: ['200,180,255'], density: 0.55, spd: 60, r: [0.5, 1.1], a: 0.3, lightning: true }, // scud + far lightning
  fungal: { mode: 'rise', cols: ['150,240,190', '190,150,255'], density: 0.55, spd: 8, r: [0.7, 1.7], a: 0.5, glow: true }, // glow-spores
  ocean: { mode: 'drift', cols: ['235,250,255'], density: 0.45, spd: 30, r: [0.5, 1.2], a: 0.3 }, // sea-spray flecks
  cetus: { mode: 'rise', cols: ['122,240,255', '190,250,255'], density: 0.35, spd: 10, r: [0.6, 1.6], a: 0.55, glow: true }, // bioluminescent motes
};

export interface WeatherOpts {
  effect: string;
  width: number;
  height: number;
  /** Resolved biome archetype (verdant/desert/frost/inferno/void) — drives the wind tint. */
  archetype: string;
  /** Hole wind speed (the same units the shot sim reads) — scales the streaks. */
  windSpd: number;
  /** SCREEN-space unit vector the wind blows TOWARD (caller projects the hole bearing). */
  windDir: Vec;
  /** Stable per-hole seed so the look is identical across screens and reloads. */
  seed: number;
  /** Honour `_gsFeel.spaceFX` / `.wind` from the play view; default on for the idle overlay. */
  spaceFX?: boolean;
  wind?: boolean;
  /**
   * SCREEN-space polygons the pinned twinkle STARFIELD must stay out of — the drawn LAND
   * (GS-rough-frame): the rough is playable turf, so stars twinkling over it read as the old
   * "rough is a starfield" bug; they belong only over true deep space (beyond the OB frame, or
   * off a lost-rough hole's floating platforms). Queried EVERY frame (the follow-cam re-projects
   * the land as it pans); the play view feeds it `landPolysCourseFor` through the live projector.
   * Absent/`null` → unmasked. Only the pinned stars mask — the shooting star, meteors and debris
   * MOVE, which sells them as sky above the world, and the ambient biome air is the ground's own.
   */
  starMask?: () => Vec[][] | null;
  /**
   * Meteor STRIKES (GS-meteor-strikes): the meteor-shower sky no longer just streaks and fades —
   * on a clock-driven cadence one meteor DIVES INTO one of the hole's scorch craters and lands with
   * an impact flash + ember splash, closing the fiction gap between the sky show and the char marks
   * the sim plays. The callback supplies the craters' SCREEN positions (+ px radii) per frame — the
   * play view projects the SAME `meteorScorch(hole)` marks the sim's lie conversion reads through
   * its LIVE projector, so a strike tracks the follow-cam and always lands exactly on a drawn
   * crater. Purely cosmetic and purely clock-driven (zero rng streams touched; the craters
   * pre-exist — a strike RE-BURNS an existing mark, never spawns a new one). Absent/`null`/empty →
   * no strikes (e.g. the aim-overlay, whose local projector is wind-orientation only and would lie
   * about crater positions — same reason it can't feed `starMask`). Only the meteorShower effect
   * reads it.
   */
  strikeTargets?: () => { c: Vec; r: number }[] | null;
  /** Fired once per landing strike — the play view's cue for a touch of screen-shake. Cosmetic. */
  onStrike?: () => void;
}

export interface WeatherHandle {
  /** Draw one screen-space frame at virtual time `now` (ms). */
  draw(ctx: CanvasRenderingContext2D, now: number): void;
  /** Follow-cam: update the screen-space wind direction as the camera pans. */
  setWind(dir: Vec): void;
  /** The canvas resized — re-seed the screen-space scatter to the new frame. */
  resize(width: number, height: number): void;
}

interface Star {
  x: number;
  y: number;
  r: number;
  ph: number;
  blue: boolean;
  hero: boolean;
}
interface Meteor {
  x: number; // 0..1 spawn lane across the top of the sky
  spd: number;
  head: number; // fireball head radius (px)
  tail: number; // flame tail length (px)
  off: number; // phase offset within the loop
  burn: number; // burns out at this fraction of the sky's height — never reaches the turf
}
interface Debris {
  y: number;
  spd: number;
  sz: number;
  off: number;
  spin: number;
  shape: Vec[];
  blink: number;
}

/**
 * One meteor FIREBALL (GS-meteor-look): a white-hot head inside a tapered, licking flame tail,
 * drawn as a chain of shrinking, cooling blobs back along the flight line — reads as burning rock,
 * not the old 1px "rain streak". Shared by the ambient shower and the crater strike so the one that
 * lands is unmistakably the same object. Screen-space + clock-driven only; `flick` animates the
 * flame. `dir` is the unit FLIGHT direction (the tail streams behind); caller sets 'lighter'.
 */
function fireball(ctx: CanvasRenderingContext2D, x: number, y: number, dirX: number, dirY: number, head: number, tail: number, a: number, flick: number): void {
  const n = Math.max(9, Math.round(tail / 2.5)); // dense enough that the blobs fuse into flame
  for (let i = 1; i <= n; i++) {
    const f = i / n; // 0 head → 1 tail tip
    const lick = Math.sin(flick * 2.2 + f * 9.5) * head * 0.5 * f; // side-to-side flame licks
    const bx = x - dirX * tail * f - dirY * lick;
    const by = y - dirY * tail * f + dirX * lick;
    const r = Math.max(0.4, head * (1.2 - f * 0.95) * (0.85 + 0.15 * Math.sin(flick * 3.1 + f * 11)));
    const fa = a * (1 - f) * (1 - f) * 0.3;
    // White-hot at the head, cooling through amber to ember red at the tail tip.
    const col = f < 0.22 ? '255,238,196' : f < 0.55 ? '255,184,96' : '255,116,52';
    ctx.fillStyle = `rgba(${col},${fa.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const hg = ctx.createRadialGradient(x, y, 0, x, y, head * 3);
  hg.addColorStop(0, `rgba(255,255,246,${(0.95 * a).toFixed(3)})`);
  hg.addColorStop(0.35, `rgba(255,214,150,${(0.55 * a).toFixed(3)})`);
  hg.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(x, y, head * 3, 0, Math.PI * 2);
  ctx.fill();
}

export function createWeather(o: WeatherOpts): WeatherHandle {
  let W = o.width;
  let H = o.height;
  let windDir: Vec = o.windDir;
  const effect = o.effect || 'none';
  const windCol = WIND_RGBA[o.archetype] ?? WIND_RGBA.verdant;
  const spaceOn = o.spaceFX !== false;
  const windOn = o.wind !== false;

  let stars: Star[] = [];
  let meteors: Meteor[] = [];
  let debris: Debris[] = [];
  let windDots: { x: number; y: number; s: number; ph: number }[] = [];
  let ambient: { x: number; y: number; s: number; ph: number; r: number; col: string }[] = [];
  let shootOff = 0;
  // Per-effect showpiece elements (GS-journey-variety) — each built on its OWN seeded stream so
  // adding an effect never re-scatters the shared starfield/wind/ambient layout above.
  let nebulae: { x: number; y: number; r: number; col: string; spd: number; ph: number }[] = [];
  let ions: { x: number; y: number; s: number; ph: number }[] = [];
  let cometDust: { t: number; off: number; s: number; ph: number }[] = [];
  let lanterns: { x: number; y: number; s: number; ph: number; col: string }[] = [];
  let hulk: { y: number; sz: number; shape: Vec[]; spin: number } | null = null;
  // GS-journey-fx-2 showpieces, each on its OWN seeded stream (rng3) so adding them never
  // re-scatters the earlier layers (the same rule rng2 obeys for the rng layout).
  let flakes: { x: number; spd: number; s: number; off: number; ph: number }[] = [];
  let giant: { x: number; y: number; r: number; tilt: number; hue: number } | null = null;

  function build(): void {
    const rng = mulberry32(o.seed);
    // Ambient twinkle field — a LUSH starfield like the intro: density scales with the visible area,
    // salted across the whole view, a tenth of them glowing "hero" stars.
    const starCount = Math.max(60, Math.min(180, Math.round((W * H) / 7200)));
    stars = Array.from({ length: starCount }, () => ({
      x: rng() * W,
      y: rng() * H,
      r: 0.5 + rng() * 1.6,
      ph: rng() * Math.PI * 2,
      blue: rng() < 0.45,
      hero: rng() < 0.12,
    }));
    shootOff = rng() * 6000;
    // Meteor fireballs (GS-meteor-look): a SPARSE handful on their OWN stream — each flies for only
    // ~a third of its loop, so two-or-so ride the sky at once instead of a constant rain, and
    // retuning their count/shape never re-scatters the shared starfield/wind/ambient layout above.
    const rngM = mulberry32((o.seed ^ 0xc2b2ae35) >>> 0);
    meteors = Array.from({ length: 6 }, (_, i) => ({
      x: rngM(),
      spd: 0.75 + rngM() * 0.6,
      head: i < 2 ? 2.7 + rngM() * 0.9 : 1.7 + rngM() * 0.7,
      tail: 34 + rngM() * 34,
      off: rngM(),
      burn: 0.26 + rngM() * 0.24,
    }));
    // Orbital debris silhouettes — small tumbling wrecks at varied "depth" (size↔speed parallax).
    debris = Array.from({ length: 9 }, () => {
      const sz = 4 + rng() * 9;
      const n = 4 + Math.floor(rng() * 3);
      const shape: Vec[] = Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 + rng() * 0.5;
        const rr = sz * (0.55 + rng() * 0.6);
        return [Math.cos(a) * rr, Math.sin(a) * rr] as Vec;
      });
      return { y: 0.05 + rng() * 0.6, spd: 0.2 + (12 - sz) * 0.06, sz, off: rng(), spin: rng() * Math.PI * 2, shape, blink: rng() * Math.PI * 2 };
    });
    windDots = Array.from({ length: 90 }, () => ({ x: rng() * (W + 40), y: rng() * (H + 40), s: 0.6 + rng() * 0.9, ph: rng() * 6.28 }));
    // Effect showpiece scatters — independent streams (see the declarations above for why).
    const rng2 = mulberry32((o.seed ^ 0x9e3779b9) >>> 0);
    const NEB_COLS = ['255,120,210', '120,200,255', '180,140,255', '90,235,190'];
    nebulae = Array.from({ length: 4 }, (_, i) => ({
      x: rng2() * W,
      y: H * (0.03 + rng2() * 0.3),
      r: Math.min(W, H) * (0.22 + rng2() * 0.2),
      col: NEB_COLS[i % NEB_COLS.length]!,
      spd: 2.5 + rng2() * 4,
      ph: rng2() * Math.PI * 2,
    }));
    ions = Array.from({ length: 30 }, () => ({ x: rng2() * (W + 40), y: rng2() * (H + 40), s: 0.5 + rng2(), ph: rng2() * Math.PI * 2 }));
    cometDust = Array.from({ length: 26 }, () => ({ t: rng2(), off: rng2(), s: 0.5 + rng2(), ph: rng2() * Math.PI * 2 }));
    const LANTERN_COLS = ['255,196,110', '255,150,70', '255,220,150'];
    lanterns = Array.from({ length: 14 }, (_, i) => ({
      x: rng2() * (W + 40),
      y: H * (0.45 + rng2() * 0.55),
      s: 0.5 + rng2(),
      ph: rng2() * Math.PI * 2,
      col: LANTERN_COLS[i % LANTERN_COLS.length]!,
    }));
    // One BIG foreground derelict for the junk field — a slow hulking silhouette with real presence.
    {
      const sz = 24 + rng2() * 14;
      const n = 6 + Math.floor(rng2() * 3);
      const shape: Vec[] = Array.from({ length: n }, (_, k) => {
        const a = (k / n) * Math.PI * 2 + rng2() * 0.4;
        const rr = sz * (0.6 + rng2() * 0.55);
        return [Math.cos(a) * rr, Math.sin(a) * rr] as Vec;
      });
      hulk = { y: 0.1 + rng2() * 0.25, sz, shape, spin: rng2() * Math.PI * 2 };
    }
    // GS-journey-fx-2 showpiece scatters — a third independent stream (see the declarations above).
    const rng3 = mulberry32((o.seed ^ 0x85ebca6b) >>> 0);
    // Frostfall: big glittering crystals sifting straight down out of a dead-still sky.
    flakes = Array.from({ length: 36 }, () => ({
      x: rng3(),
      spd: 12 + rng3() * 18,
      s: 1.0 + rng3() * 1.8,
      off: rng3(),
      ph: rng3() * Math.PI * 2,
    }));
    // Gravity well: ONE vast ringed giant looming low in the sky.
    giant = {
      x: W * (0.22 + rng3() * 0.56),
      y: H * (0.10 + rng3() * 0.10),
      r: Math.min(W, H) * (0.13 + rng3() * 0.05),
      tilt: -0.35 + rng3() * 0.7,
      hue: rng3(),
    };
    // The world's ambient air (GS-biome-feel): count scales with area like the starfield.
    const amb = AMBIENT[o.archetype];
    if (amb) {
      const n = Math.max(8, Math.min(70, Math.round(((W * H) / 7200) * amb.density * 4)));
      ambient = Array.from({ length: n }, () => ({
        x: rng() * (W + 40),
        y: rng() * (H + 40),
        s: 0.55 + rng() * 0.9,
        ph: rng() * Math.PI * 2,
        r: amb.r[0] + rng() * (amb.r[1] - amb.r[0]),
        col: amb.cols[Math.floor(rng() * amb.cols.length)]!,
      }));
    }
  }
  build();

  // ---- helpers -------------------------------------------------------------
  function tint(ctx: CanvasRenderingContext2D): void {
    // A SUBTLE directional gradient, never a flat muddy wash — keep the course readable.
    if (effect === 'moonlight') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(120,150,225,0.20)');
      g.addColorStop(0.5, 'rgba(96,124,196,0.08)');
      g.addColorStop(1, 'rgba(70,90,150,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (effect === 'meteorShower') {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      g.addColorStop(0, 'rgba(60,34,44,0.20)');
      g.addColorStop(1, 'rgba(60,34,44,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.6);
    } else if (effect === 'aurora') {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.5);
      g.addColorStop(0, 'rgba(40,90,80,0.16)');
      g.addColorStop(1, 'rgba(40,90,80,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.5);
    } else if (effect === 'eclipse') {
      // The day goes DARK: a deep indigo pall, strongest at the sky, easing off the turf.
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(10,8,34,0.34)');
      g.addColorStop(0.55, 'rgba(12,10,36,0.16)');
      g.addColorStop(1, 'rgba(12,10,36,0.04)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (effect === 'nebula') {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
      g.addColorStop(0, 'rgba(70,40,90,0.16)');
      g.addColorStop(1, 'rgba(70,40,90,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.7);
    } else if (effect === 'comet') {
      const g = ctx.createLinearGradient(W, 0, W * 0.35, H * 0.5);
      g.addColorStop(0, 'rgba(90,180,200,0.12)');
      g.addColorStop(1, 'rgba(90,180,200,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.6);
    } else if (effect === 'spaceJunk') {
      ctx.fillStyle = 'rgba(40,44,54,0.10)';
      ctx.fillRect(0, 0, W, H);
    } else if (effect === 'tradeMarket') {
      const g = ctx.createLinearGradient(0, H, 0, H * 0.55);
      g.addColorStop(0, 'rgba(120,80,30,0.18)');
      g.addColorStop(1, 'rgba(120,80,30,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    } else if (effect === 'frostfall') {
      // Cold, dead-clear air: a pale icy wash off the top of the sky.
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      g.addColorStop(0, 'rgba(180,220,245,0.16)');
      g.addColorStop(1, 'rgba(180,220,245,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.6);
    } else if (effect === 'gravityWell') {
      // The giant's shadowed presence: a heavy violet pall pressing down from the sky.
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(60,40,110,0.26)');
      g.addColorStop(0.5, 'rgba(50,36,90,0.10)');
      g.addColorStop(1, 'rgba(40,30,70,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // solarStorm / ionStorm tint as edge vignettes inside their own draws (centre stays clear).
  }

  function drawStars(ctx: CanvasRenderingContext2D, now: number): void {
    if (!spaceOn) return;
    const sprite = glowSprite();
    const mask = o.starMask?.() ?? null; // the drawn land — stars only twinkle over true space
    ctx.save();
    for (const s of stars) {
      if (mask && mask.some((p) => pointInPoly([s.x, s.y], p))) continue;
      const tw = 0.5 + 0.5 * Math.sin(now * 0.003 + s.ph);
      const a = 0.25 + 0.6 * tw;
      // Hero stars bloom through the cached glow sprite (cheap; the intro's perf trick).
      if (s.hero && sprite) {
        const gr = (s.r + 2.2) * (1.6 + 0.5 * tw);
        ctx.globalAlpha = a * 0.7;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sprite, s.x - gr, s.y - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = s.blue ? '#bcd6ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShootingStar(ctx: CanvasRenderingContext2D, now: number): void {
    if (!spaceOn) return;
    const period = 5200;
    const dur = 760;
    const sp = ((now + shootOff) % period) / dur;
    if (sp > 1) return;
    const x0 = -40;
    const y0 = H * 0.06;
    const x1 = W + 40;
    const y1 = H * 0.34;
    const hx = x0 + (x1 - x0) * sp;
    const hy = y0 + (y1 - y0) * sp;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const tail = 64;
    const a = Math.sin(sp * Math.PI);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail, hx, hy);
    grad.addColorStop(0, 'rgba(220,235,255,0)');
    grad.addColorStop(1, 'rgba(220,235,255,0.95)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - Math.cos(ang) * tail, hy - Math.sin(ang) * tail);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The world's ambient AIR (GS-biome-feel): snow falls, embers rise, spores drift, glints flash.
   *  Rides the same `spaceFX` gate as the stars, so a reduced-feel setup switches it off with them. */
  function drawAmbient(ctx: CanvasRenderingContext2D, now: number): void {
    const amb = AMBIENT[o.archetype];
    if (!spaceOn || !amb || ambient.length === 0) return;
    const sprite = glowSprite();
    const wW = W + 40;
    const wH = H + 40;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ambient) {
      let x = p.x;
      let y = p.y;
      let a = amb.a * (0.5 + 0.5 * Math.sin(now * 0.002 + p.ph));
      if (amb.mode === 'fall') {
        // Snow: sink with a lazy cross-sway.
        y = wrap(p.y + now * 0.001 * amb.spd * p.s, wH) - 20;
        x = wrap(p.x + Math.sin(now * 0.0009 + p.ph) * 14, wW) - 20;
      } else if (amb.mode === 'rise') {
        // Embers/spores/plankton: climb with a flickering wobble.
        y = wrap(p.y - now * 0.001 * amb.spd * p.s, wH) - 20;
        x = wrap(p.x + Math.sin(now * 0.0013 + p.ph) * 9, wW) - 20;
      } else if (amb.mode === 'drift') {
        // Dust/spray/stardust/fireflies: wander sideways, bobbing.
        x = wrap(p.x + now * 0.001 * amb.spd * p.s, wW) - 20;
        y = wrap(p.y + Math.sin(now * 0.0011 + p.ph) * 10, wH) - 20;
      } else {
        // Twinkle (prism glints): fixed points that flash on their own phase.
        const tw = Math.sin(now * 0.0035 + p.ph);
        a = tw > 0.55 ? amb.a * ((tw - 0.55) / 0.45) : 0;
        if (a <= 0.02) continue;
      }
      if (amb.glow && sprite && p.s > 0.9) {
        const gr = p.r * 3.2;
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(sprite, x - gr, y - gr, gr * 2, gr * 2);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgba(${p.col},1)`;
      ctx.beginPath();
      if (amb.mode === 'twinkle') {
        // A four-point sparkle, not a dot.
        ctx.moveTo(x - p.r * 2, y);
        ctx.lineTo(x + p.r * 2, y);
        ctx.moveTo(x, y - p.r * 2);
        ctx.lineTo(x, y + p.r * 2);
        ctx.strokeStyle = `rgba(${p.col},1)`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      } else {
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Tempest: a distant lightning flicker — a soft whole-sky flash + a seeded fork, on a slow cadence.
    if (amb.lightning) {
      const cyc = 3400;
      const phase = ((now + o.seed % 997) % cyc) / cyc;
      const flash = phase < 0.09 ? 1 - phase / 0.09 : 0;
      if (flash > 0.03) {
        ctx.save();
        ctx.fillStyle = `rgba(205,215,255,${(0.07 * flash).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        const seed = mulberry32((o.seed ^ Math.floor(now / cyc) * 2654435761) >>> 0);
        let x = seed() * W;
        let y = H * 0.04 + seed() * H * 0.1;
        ctx.strokeStyle = `rgba(230,238,255,${(0.75 * flash).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        const segs = 4 + Math.floor(seed() * 3);
        for (let s = 0; s < segs; s++) {
          x += (seed() - 0.5) * 46;
          y += 14 + seed() * 26;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawWind(ctx: CanvasRenderingContext2D, now: number): void {
    if (!windOn || o.windSpd < 2) return;
    const [dx, dy] = windDir;
    const intensity = Math.min(1, (o.windSpd - 2) / 26);
    // FLOWING comet-streaks that drift in the wind direction — a bright leading HEAD and a tapered
    // glow TAIL trailing UPWIND, so direction is unmistakable and the whole field is clearly weather,
    // not rain scratches. Count, length, glow AND drift speed all scale with wind speed, so a strong
    // wind reads as a faster, busier, brighter stream you can feel pushing the shot.
    const count = Math.round(10 + intensity * 46);
    const speed = 26 + intensity * 150;
    const drift = now * 0.001 * speed;
    const wW = W + 60;
    const wH = H + 60;
    const px = -dy; // cross-stream, for a gentle flutter
    const py = dx;
    const sprite = glowSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const p = windDots[i]!;
      const t = drift * (0.6 + p.s);
      const hx = wrap(p.x + dx * t, wW) - 30;
      const hy = wrap(p.y + dy * t, wH) - 30;
      const L = (14 + intensity * 40) * (0.5 + p.s);
      const flut = Math.sin(now * 0.0022 + p.ph) * (1.5 + intensity * 3);
      const tx = hx - dx * L + px * flut;
      const ty = hy - dy * L + py * flut;
      const a = (0.07 + intensity * 0.2) * (0.55 + 0.45 * Math.sin(now * 0.004 + p.ph));
      const grad = ctx.createLinearGradient(tx, ty, hx, hy);
      grad.addColorStop(0, `rgba(${windCol},0)`);
      grad.addColorStop(1, `rgba(${windCol},${a.toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1 + p.s * 1.3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      // A small glowing head so the leading edge pops (a couple bloom through the sprite).
      if (sprite && p.s > 0.7) {
        const gr = 3 + intensity * 4;
        ctx.globalAlpha = a * 1.4;
        ctx.drawImage(sprite, hx - gr, hy - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // ---- per-effect showpieces ----------------------------------------------
  function drawMoon(ctx: CanvasRenderingContext2D, now: number): void {
    const mx = W * 0.8;
    const my = H * 0.14;
    const r = Math.max(13, Math.min(W, H) * 0.07);
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0008);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(mx, my, r * 0.6, mx, my, r * (3.4 + pulse * 0.5));
    halo.addColorStop(0, 'rgba(208,222,255,0.28)');
    halo.addColorStop(0.5, 'rgba(160,185,250,0.10)');
    halo.addColorStop(1, 'rgba(160,185,250,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, r * 3.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The disc + a few craters.
    ctx.save();
    const face = ctx.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.2, mx, my, r);
    face.addColorStop(0, '#f3f6ff');
    face.addColorStop(1, '#c9d3ee');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,168,212,0.5)';
    for (const [ox, oy, cr] of [[-0.34, -0.12, 0.2], [0.26, 0.3, 0.14], [0.05, -0.36, 0.1], [0.36, -0.18, 0.08]] as const) {
      ctx.beginPath();
      ctx.arc(mx + ox * r, my + oy * r, cr * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The ambient shower (GS-meteor-look): a sparse handful of true fireballs that dive down-left on
  // the SAME bearing the strike arrives on, then visibly BURN UP high in the sky — they never plunge
  // into the turf, so the only meteor that ever reaches the ground is the strike, and it lands on a
  // crater (GS-meteor-strikes). That closes the old "rain of streaks falling through the course
  // without ever hitting the marks" read.
  function drawMeteors(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of meteors) {
      // Sparse duty cycle: each fireball flies for ~a third of its loop, then its lane rests.
      const ph = (m.off + now * 0.00024 * m.spd) % 1;
      if (ph >= 0.36) continue;
      const u = ph / 0.36;
      const x0 = m.x * (W + 200) - 60;
      const y0 = -30;
      const y1 = H * m.burn;
      const x1 = x0 - (y1 - y0) * 0.38;
      const x = x0 + (x1 - x0) * u;
      const y = y0 + (y1 - y0) * u;
      const a = Math.min(1, u * 5) * Math.min(1, (1 - u) * 2.4);
      if (a <= 0.01) continue;
      const dl = Math.hypot(x1 - x0, y1 - y0) || 1;
      fireball(ctx, x, y, (x1 - x0) / dl, (y1 - y0) / dl, m.head, m.tail * (0.55 + 0.45 * u), a, now * 0.02 + m.off * 40);
      // Terminal flare — the last stretch pops and gutters out: a burn-up, not a vanish.
      if (u > 0.8) {
        const fu = (u - 0.8) / 0.2;
        const fr = m.head * (2 + 5 * fu);
        const fg = ctx.createRadialGradient(x, y, 0, x, y, fr);
        fg.addColorStop(0, `rgba(255,240,210,${(0.5 * (1 - fu) * a).toFixed(3)})`);
        fg.addColorStop(1, 'rgba(255,160,80,0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(x, y, fr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawAurora(ctx: CanvasRenderingContext2D, now: number): void {
    const cols = ['90,235,180', '110,180,255', '200,140,255'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      const baseY = H * (0.04 + b * 0.05);
      const ph = now * 0.0006 + b * 1.3;
      const N = 40;
      // A shimmering vertical curtain: a wavy top edge dropping into a soft gradient fade.
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = (W * i) / N;
        const y = baseY + Math.sin(i * 0.4 + ph) * 12 + Math.sin(i * 0.13 + ph * 1.7) * 7;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const depth = H * (0.26 + b * 0.04);
      for (let i = N; i >= 0; i--) {
        const x = (W * i) / N;
        const y = baseY + depth + Math.sin(i * 0.36 + ph) * 16;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, baseY, 0, baseY + depth);
      const shimmer = 0.10 + 0.05 * (0.5 + 0.5 * Math.sin(now * 0.0013 + b));
      g.addColorStop(0, `rgba(${cols[b]},${(shimmer * 1.4).toFixed(3)})`);
      g.addColorStop(0.4, `rgba(${cols[b]},${shimmer.toFixed(3)})`);
      g.addColorStop(1, `rgba(${cols[b]},0)`);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSolarStorm(ctx: CanvasRenderingContext2D, now: number): void {
    // A red EDGE vignette (centre clear so the course reads), a pulsing corner flare, and crackling
    // arcs that flash on a seeded cadence with a bloom.
    ctx.save();
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.28, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(150,40,30,0)');
    vig.addColorStop(1, `rgba(150,40,30,${(0.12 + 0.06 * (0.5 + 0.5 * Math.sin(now * 0.0011))).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Corner flare.
    const fx = W * 0.18;
    const fy = H * 0.12;
    const fr = Math.max(12, W * 0.05);
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0026);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * (3 + pulse));
    fg.addColorStop(0, `rgba(255,200,120,${(0.5 + pulse * 0.3).toFixed(3)})`);
    fg.addColorStop(0.4, 'rgba(255,120,60,0.22)');
    fg.addColorStop(1, 'rgba(255,90,50,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx, fy, fr * (3.2 + pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,210,150,${(0.5 + pulse * 0.4).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, fr * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // Crackle: 3 arcs, each flashing for a slice of its own cycle.
    for (let k = 0; k < 3; k++) {
      const cyc = 1400 + k * 520;
      const phase = ((now + k * 470) % cyc) / cyc;
      const flash = phase < 0.12 ? 1 - phase / 0.12 : 0;
      if (flash <= 0.02) continue;
      const seed = mulberry32((o.seed ^ (k * 2654435761) ^ Math.floor(now / cyc)) >>> 0);
      let x = seed() * W;
      let y = seed() * H * 0.45;
      ctx.strokeStyle = `rgba(255,170,110,${(0.7 * flash).toFixed(3)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segs = 4 + Math.floor(seed() * 3);
      for (let s = 0; s < segs; s++) {
        x += (seed() - 0.5) * 40;
        y += 12 + seed() * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A single lightning fork from (x,y): a jagged descending polyline with one side branch, drawn as
   *  a soft wide GLOW pass under a hot thin core so the bolt pops instead of reading as a hairline. */
  function drawFork(ctx: CanvasRenderingContext2D, seed: () => number, x: number, y: number, col: string, flash: number, lw: number): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const segs = 5 + Math.floor(seed() * 3);
    const branchAt = 1 + Math.floor(seed() * (segs - 2));
    const main: Vec[] = [[x, y]];
    for (let s = 0; s < segs; s++) {
      x += (seed() - 0.5) * 52;
      y += 16 + seed() * 30;
      main.push([x, y]);
    }
    // The side branch — forking off sideways then dying out.
    const side = seed() < 0.5 ? -1 : 1;
    let [bx, by] = main[branchAt + 1]!;
    const branch: Vec[] = [[bx, by]];
    for (let s = 0; s < 3; s++) {
      bx += side * (14 + seed() * 22);
      by += 8 + seed() * 18;
      branch.push([bx, by]);
    }
    const trace = (pts: Vec[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    };
    // Glow pass, then hot white-ish core.
    ctx.strokeStyle = `rgba(${col},${(0.3 * flash).toFixed(3)})`;
    ctx.lineWidth = lw * 4;
    trace(main);
    ctx.lineWidth = lw * 2.6;
    trace(branch);
    ctx.strokeStyle = `rgba(245,248,255,${(0.9 * flash).toFixed(3)})`;
    ctx.lineWidth = lw;
    trace(main);
    ctx.strokeStyle = `rgba(${col},${(0.6 * flash).toFixed(3)})`;
    ctx.lineWidth = lw * 0.6;
    trace(branch);
  }

  function drawIonStorm(ctx: CanvasRenderingContext2D, now: number): void {
    // A blue-violet EDGE vignette (centre clear, same discipline as the solar storm).
    ctx.save();
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(56,66,190,0)');
    vig.addColorStop(1, `rgba(56,66,190,${(0.14 + 0.06 * (0.5 + 0.5 * Math.sin(now * 0.0013))).toFixed(3)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // Charged sparks riding the gusts — small bright motes with a glow, drifting fast.
    const sprite = glowSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ions) {
      const x = wrap(p.x + now * 0.001 * 34 * p.s, W + 40) - 20;
      const y = wrap(p.y + Math.sin(now * 0.0016 + p.ph) * 12, H + 40) - 20;
      const a = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.005 + p.ph));
      if (sprite && p.s > 1.1) {
        ctx.globalAlpha = a * 0.7;
        ctx.drawImage(sprite, x - 4, y - 4, 8, 8);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(x, y, 0.9 + p.s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Forked lightning, two independent families — busier and brighter than the tempest flicker.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const cyc = 1150 + k * 640;
      const phase = ((now + k * 517) % cyc) / cyc;
      const flash = phase < 0.11 ? 1 - phase / 0.11 : 0;
      if (flash <= 0.02) continue;
      // Whole-sky charge flash under the bolt.
      ctx.fillStyle = `rgba(190,205,255,${(0.08 * flash).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      const seed = mulberry32((o.seed ^ (k * 40503) ^ Math.floor(now / cyc) * 2654435761) >>> 0);
      drawFork(ctx, seed, seed() * W, H * 0.02 + seed() * H * 0.12, '185,205,255', flash, 1.8);
    }
    ctx.restore();
  }

  function drawEclipse(ctx: CanvasRenderingContext2D, now: number): void {
    const mx = W * 0.78;
    const my = H * 0.16;
    const r = Math.max(15, Math.min(W, H) * 0.075);
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0009);
    // The blazing corona — a broad soft halo plus slowly-turning flare petals, all additive.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(mx, my, r * 0.9, mx, my, r * (2.9 + pulse * 0.5));
    halo.addColorStop(0, 'rgba(255,244,214,0.55)');
    halo.addColorStop(0.35, 'rgba(255,220,170,0.20)');
    halo.addColorStop(1, 'rgba(255,210,150,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, r * 3.6, 0, Math.PI * 2);
    ctx.fill();
    // Corona streamers: 7 tapered petals wheeling imperceptibly slowly.
    const base = now * 0.00004;
    for (let k = 0; k < 7; k++) {
      const a = base + (k / 7) * Math.PI * 2;
      const len = r * (1.9 + 0.7 * Math.sin(k * 2.1 + pulse * 2));
      const tipX = mx + Math.cos(a) * len;
      const tipY = my + Math.sin(a) * len;
      const g = ctx.createLinearGradient(mx, my, tipX, tipY);
      g.addColorStop(0, 'rgba(255,236,200,0.30)');
      g.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = r * 0.34;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
    ctx.restore();
    // The BLACK SUN itself, over the corona, with a razor-thin bright rim.
    ctx.save();
    ctx.fillStyle = '#05060d';
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,246,225,${(0.55 + 0.35 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.stroke();
    // A diamond-ring glint that slides around the rim.
    const ga = now * 0.00013;
    const gx = mx + Math.cos(ga) * r;
    const gy = my + Math.sin(ga) * r;
    const sprite = glowSprite();
    if (sprite) {
      ctx.globalCompositeOperation = 'lighter';
      const gr = r * 0.55;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(sprite, gx - gr, gy - gr, gr * 2, gr * 2);
    }
    ctx.restore();
  }

  function drawNebula(ctx: CanvasRenderingContext2D, now: number): void {
    // Vast colour-lit fog banks drifting over the sky half — alphas kept low so the course reads.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of nebulae) {
      const x = wrap(n.x + now * 0.001 * n.spd, W + n.r * 2) - n.r;
      const breathe = 1 + 0.08 * Math.sin(now * 0.0005 + n.ph);
      const rr = n.r * breathe;
      const a = 0.16 + 0.05 * (0.5 + 0.5 * Math.sin(now * 0.0007 + n.ph * 1.7));
      const g = ctx.createRadialGradient(x, n.y, 0, x, n.y, rr);
      g.addColorStop(0, `rgba(${n.col},${a.toFixed(3)})`);
      g.addColorStop(0.55, `rgba(${n.col},${(a * 0.55).toFixed(3)})`);
      g.addColorStop(1, `rgba(${n.col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, n.y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawComet(ctx: CanvasRenderingContext2D, now: number): void {
    // The grand comet: a blazing head upper-right, twin tails (blue ion + pale dust) streaming away
    // up-sky, and a slow fall of sparkle dust shed along the tail line.
    const hx = W * 0.74 + Math.sin(now * 0.00012) * W * 0.02;
    const hy = H * 0.14 + Math.cos(now * 0.00009) * H * 0.012;
    const L = Math.min(W * 0.52, 340);
    const dir: Vec = [-0.87, -0.5]; // tail streams to the upper-left
    const perp: Vec = [-dir[1], dir[0]];
    const sprite = glowSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Two tails at slightly split angles: the narrow blue ion tail and the broad pale dust tail.
    const tails: { split: number; wid: number; col: string; a: number }[] = [
      { split: 0.06, wid: 9, col: '140,200,255', a: 0.5 },
      { split: -0.1, wid: 20, col: '235,240,255', a: 0.3 },
    ];
    for (const t of tails) {
      const tx = hx + (dir[0] + perp[0] * t.split) * L;
      const ty = hy + (dir[1] + perp[1] * t.split) * L;
      const g = ctx.createLinearGradient(hx, hy, tx, ty);
      g.addColorStop(0, `rgba(${t.col},${t.a.toFixed(3)})`);
      g.addColorStop(1, `rgba(${t.col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(hx + perp[0] * 2, hy + perp[1] * 2);
      ctx.lineTo(tx + perp[0] * t.wid, ty + perp[1] * t.wid);
      ctx.lineTo(tx - perp[0] * t.wid, ty - perp[1] * t.wid);
      ctx.lineTo(hx - perp[0] * 2, hy - perp[1] * 2);
      ctx.closePath();
      ctx.fill();
    }
    // The head: a hot core blooming through the glow sprite.
    if (sprite) {
      const gr = 16 + 2.5 * Math.sin(now * 0.003);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(sprite, hx - gr, hy - gr, gr * 2, gr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle dust shed along the tail, sinking gently off it as it twinkles out.
    for (const p of cometDust) {
      const prog = (p.t + now * 0.00002 * (0.5 + p.s)) % 1;
      const px = hx + dir[0] * L * prog + perp[0] * (p.off - 0.5) * 26;
      const py = hy + dir[1] * L * prog + perp[1] * (p.off - 0.5) * 26 + prog * 26 * p.s;
      const a = (1 - prog) * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(now * 0.004 + p.ph)));
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dff2ff';
      ctx.beginPath();
      ctx.arc(px, py, 0.8 + p.s * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLanterns(ctx: CanvasRenderingContext2D, now: number): void {
    // Trade-camp lantern motes rising off the market below — warm fireflies over the horizon tint.
    const sprite = glowSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of lanterns) {
      const y = H * 0.45 + wrap(p.y - H * 0.45 - now * 0.001 * 7 * p.s, H * 0.55 + 20);
      const x = wrap(p.x + Math.sin(now * 0.0011 + p.ph) * 10, W + 40) - 20;
      const a = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.0024 + p.ph));
      if (sprite && p.s > 0.75) {
        ctx.globalAlpha = a * 0.9;
        const gr = 5 + p.s * 3;
        ctx.drawImage(sprite, x - gr, y - gr, gr * 2, gr * 2);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgba(${p.col},1)`;
      ctx.beginPath();
      ctx.arc(x, y, 1.3 + p.s * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDebris(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    // The big foreground hulk first — a slow, unmistakable derelict crossing behind the small fry.
    if (hulk) {
      const x = wrap(now * 0.0035, W + hulk.sz * 4) - hulk.sz * 2;
      const y = hulk.y * H;
      const rot = hulk.spin + now * 0.00005;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      hulk.shape.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      const hg = ctx.createLinearGradient(-hulk.sz, -hulk.sz, hulk.sz, hulk.sz);
      hg.addColorStop(0, 'rgba(96,108,132,0.9)');
      hg.addColorStop(1, 'rgba(34,40,54,0.9)');
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(186,202,228,0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Panel seams so it reads as a built thing, not a rock.
      ctx.strokeStyle = 'rgba(20,24,34,0.6)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-hulk.sz * 0.7, 0);
      ctx.lineTo(hulk.sz * 0.7, 0);
      ctx.moveTo(0, -hulk.sz * 0.6);
      ctx.lineTo(0, hulk.sz * 0.6);
      ctx.stroke();
      ctx.restore();
      // Twin nav lights blinking in counter-phase.
      const blink = 0.5 + 0.5 * Math.sin(now * 0.003);
      ctx.fillStyle = `rgba(255,90,90,${(blink * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x - hulk.sz * 0.5, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(120,255,140,${((1 - blink) * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x + hulk.sz * 0.5, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of debris) {
      const x = wrap(d.off * (W + 120) + now * 0.001 * d.spd * 18, W + 120) - 60;
      const y = d.y * H;
      const rot = d.spin + now * 0.0004 * d.spd;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      // A metallic grey hull with a cool lit edge + a darker underside, so the wreck reads against
      // the void instead of vanishing into it.
      ctx.beginPath();
      d.shape.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      const hull = ctx.createLinearGradient(-d.sz, -d.sz, d.sz, d.sz);
      hull.addColorStop(0, 'rgba(108,120,142,0.92)');
      hull.addColorStop(1, 'rgba(44,50,64,0.92)');
      ctx.fillStyle = hull;
      ctx.fill();
      ctx.strokeStyle = 'rgba(186,202,228,0.6)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
      // A slow blinking nav light.
      const blink = 0.5 + 0.5 * Math.sin(now * 0.004 + d.blink);
      if (blink > 0.6) {
        ctx.fillStyle = `rgba(255,90,90,${((blink - 0.6) * 2.2).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }


  // Frostfall (GS-journey-fx-2): big glittering ice crystals sifting straight down through still
  // air — the sky-half of the route whose ground-half is the frozen turf patches.
  function drawFrostfall(ctx: CanvasRenderingContext2D, now: number): void {
    const sprite = glowSprite();
    ctx.save();
    for (const f of flakes) {
      const t = wrap(f.off + (now * 0.001 * f.spd) / (H + 40), 1);
      const y = t * (H + 30) - 15;
      const x = wrap(f.x * (W + 30) + Math.sin(now * 0.0012 + f.ph) * 9, W + 30) - 15;
      const tw = 0.5 + 0.5 * Math.sin(now * 0.004 + f.ph);
      const a = 0.35 + 0.5 * tw;
      const r = f.s * (0.9 + 0.25 * tw);
      // A six-point crystal glint: two crossed strokes + a soft bloom on the biggest flakes.
      ctx.strokeStyle = `rgba(235,248,255,${a.toFixed(3)})`;
      ctx.lineWidth = 0.9;
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI + f.ph;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ang) * r, y - Math.sin(ang) * r);
        ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
        ctx.stroke();
      }
      if (f.s > 2 && sprite) {
        ctx.globalAlpha = 0.3 * tw;
        ctx.drawImage(sprite, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // Gravity well (GS-journey-fx-2): ONE vast ringed giant looming low in the sky — the visible
  // reason every shot flies heavy (the carry hook is the matching physics half).
  function drawGravityWell(ctx: CanvasRenderingContext2D, now: number): void {
    if (!giant) return;
    const { x, y, r, tilt, hue } = giant;
    const breathe = 0.5 + 0.5 * Math.sin(now * 0.0006);
    // Two banded palettes so different holes get different giants.
    const bands = hue < 0.5 ? ['#8f7ad8', '#6c58b8', '#57459c', '#463786'] : ['#d8a07a', '#b87d58', '#9c6245', '#864f37'];
    ctx.save();
    // A heavy, PULLING halo — drawn 'lighter' so the sky bends bright around the mass.
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x, y, r, x, y, r * (2.6 + breathe * 0.3));
    halo.addColorStop(0, 'rgba(150,120,255,0.20)');
    halo.addColorStop(0.6, 'rgba(120,90,220,0.08)');
    halo.addColorStop(1, 'rgba(120,90,220,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The banded disc.
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i]!;
      const by = y - r + (i / bands.length) * 2 * r;
      ctx.fillRect(x - r, by, 2 * r, (2 * r) / bands.length + 1);
    }
    // Day-side light + limb shadow so the sphere reads round.
    const shade = ctx.createRadialGradient(x - r * 0.45, y - r * 0.4, r * 0.15, x, y, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.28)');
    shade.addColorStop(0.55, 'rgba(255,255,255,0.0)');
    shade.addColorStop(1, 'rgba(10,8,30,0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
    // The ring system — an ellipse tilted across the disc, brighter where it crosses in front.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    for (const [rr, a] of [[1.55, 0.5], [1.75, 0.32], [1.95, 0.18]] as const) {
      ctx.strokeStyle = `rgba(220,210,255,${a})`;
      ctx.lineWidth = Math.max(1.2, r * 0.07);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * rr, r * rr * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Meteor STRIKES (GS-meteor-strikes) -----------------------------------------------------
  // One strike per STRIKE_PERIOD: pick a crater (seeded off the cycle index — deterministic in the
  // clock, no shared stream), dive a fireball into it along the sky lanes' fall direction, then an
  // impact flash + ember splash over the crater's true footprint. All timing is phase-of-clock so a
  // paused/reduced-motion frame just shows one instant of it.
  const STRIKE_PERIOD = 2600; // ms per cycle: dive ~0.9s, burn ~0.8s, quiet the rest
  let lastStrikeK = -1; // which cycle already fired the onStrike cue

  function drawStrikes(ctx: CanvasRenderingContext2D, now: number): void {
    const targets = o.strikeTargets?.() ?? null;
    if (!targets || targets.length === 0) return;
    const k = Math.floor(now / STRIKE_PERIOD);
    const t = (now % STRIKE_PERIOD) / STRIKE_PERIOD;
    // Per-cycle picks off a private mulberry seeded by the cycle index — identical for every frame
    // of the cycle, different across cycles, and never touching the layout streams above.
    const pick = mulberry32((o.seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0);
    const idx0 = Math.floor(pick() * targets.length);
    const jitter = pick() * 0.3 - 0.15; // slight per-strike approach-angle variation
    // Aim at an ON-SCREEN crater: scan from the seeded pick for the first visible one (stable
    // target order, so the choice holds through the cycle) — a cycle is never wasted diving at a
    // mark the camera can't see. No visible crater at all → paint cull, cadence/clock unaffected.
    let target: { c: Vec; r: number } | null = null;
    for (let i = 0; i < targets.length && !target; i++) {
      const cand = targets[(idx0 + i) % targets.length]!;
      if (cand.c[0] >= -60 && cand.c[0] <= W + 60 && cand.c[1] >= -60 && cand.c[1] <= H + 60) target = cand;
    }
    if (!target) return;
    const [cx, cy] = target.c;
    const IN = 0.14; // dive starts
    const IMPACT = 0.48; // touchdown
    const OUT = 0.78; // afterglow ends
    // Incoming from the upper-right, matching the ambient shower's down-left fall.
    const dx = 0.36 + jitter;
    const dy = -1;
    const dl = Math.hypot(dx, dy);
    const reach = Math.max(W, H) * 0.85;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (t >= IN && t < IMPACT) {
      const f0 = (t - IN) / (IMPACT - IN); // 0 → 1 along the dive
      const f = f0 * f0; // a falling rock ACCELERATES in — not a constant-speed slide
      const x = cx + (dx / dl) * reach * (1 - f);
      const y = cy + (dy / dl) * reach * (1 - f);
      // The strike is the ambient fireball's big sibling — same painter, so the one that lands
      // is unmistakably the same object the shower has been teasing.
      fireball(ctx, x, y, -dx / dl, -dy / dl, 4.4, 46 + 42 * f, Math.min(1, f0 * 4), now * 0.02 + k * 13);
    } else if (t >= IMPACT && t < OUT) {
      if (lastStrikeK !== k) {
        lastStrikeK = k;
        o.onStrike?.(); // the landing moment — cue the caller's shake exactly once per cycle
      }
      const f = (t - IMPACT) / (OUT - IMPACT); // 0 → 1 through the afterglow
      const fade = 1 - f;
      // Core flash over the crater's TRUE footprint, blooming out and fading.
      const fr = target.r * (1.1 + 1.9 * f);
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
      fg.addColorStop(0, `rgba(255,250,235,${(0.85 * fade).toFixed(3)})`);
      fg.addColorStop(0.45, `rgba(255,190,110,${(0.45 * fade).toFixed(3)})`);
      fg.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, cy, fr, 0, Math.PI * 2);
      ctx.fill();
      // Shock ring racing out over the turf — the "it really hit HERE" read on the crater.
      const ring = target.r * (1 + 3.4 * f);
      ctx.strokeStyle = `rgba(255,200,130,${(0.55 * fade * fade).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, 2.6 * fade);
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
      // Ember splash — a handful of sparks thrown up-and-out on simple ballistic arcs.
      for (let i = 0; i < 7; i++) {
        const a = pick() * Math.PI * 2;
        const sp = target.r * (1.2 + pick() * 1.6);
        const ex = cx + Math.cos(a) * sp * f;
        const ey = cy + Math.sin(a) * sp * f * 0.6 - (f - f * f) * target.r * 2.6; // rise then fall
        ctx.fillStyle = i % 2 ? `rgba(255,170,80,${(0.9 * fade).toFixed(3)})` : `rgba(255,120,50,${(0.8 * fade).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.4 + (i % 3) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function draw(ctx: CanvasRenderingContext2D, now: number): void {
    tint(ctx);
    drawStars(ctx, now);
    drawAmbient(ctx, now); // the world's own air (GS-biome-feel), under the journey showpiece
    // The meteor shower owns the sky; otherwise the ambient shooting star sweeps through.
    if (effect !== 'meteorShower') drawShootingStar(ctx, now);
    switch (effect) {
      case 'moonlight':
        drawMoon(ctx, now);
        break;
      case 'meteorShower':
        drawMeteors(ctx, now);
        drawStrikes(ctx, now); // one gets through and LANDS — on a real crater (GS-meteor-strikes)
        break;
      case 'aurora':
        drawAurora(ctx, now);
        break;
      case 'solarStorm':
        drawSolarStorm(ctx, now);
        break;
      case 'ionStorm':
        drawIonStorm(ctx, now);
        break;
      case 'eclipse':
        drawEclipse(ctx, now);
        break;
      case 'nebula':
        drawNebula(ctx, now);
        break;
      case 'comet':
        drawComet(ctx, now);
        break;
      case 'spaceJunk':
        drawDebris(ctx, now);
        break;
      case 'tradeMarket':
        drawLanterns(ctx, now);
        break;
      case 'frostfall':
        drawFrostfall(ctx, now);
        break;
      case 'gravityWell':
        drawGravityWell(ctx, now);
        break;
      default:
        break;
    }
    drawWind(ctx, now);
  }

  return {
    draw,
    setWind(dir: Vec) {
      windDir = dir;
    },
    resize(width: number, height: number) {
      W = width;
      H = height;
      build();
    },
  };
}
