/**
 * Canvas2D loading-intro cinematic (render-only, cosmetic — NOT part of the sim).
 *
 * A self-contained title sequence played as a full-screen overlay on first boot:
 *   1. DRIVE/LOAD  — four golfers walk up a suburban driveway and pitch their bags into
 *                    the boot of a woody station wagon, then pile in.
 *   2. TRANSFORM   — the wheels fold up into the body, the car lifts into a hover and jet
 *                    nozzles slide out of the rear; the daytime suburb fades to a starfield.
 *   3. LAUNCH      — ignition flash, a roaring exhaust plume kicks in, the wagon tips
 *                    nose-up and rockets off the top of the frame on warp streaks and a
 *                    screen-shake; a dimpled golf-ball planet hangs in the star-dusted void.
 *   4. WRITE       — a flaming golf-ball comet traces the smoke into the words GOLF STARS,
 *                    which stamp in with a pop, a shine sweep and sparkle glints, then hold.
 *
 * Thin/imperative by design (this is the "feel" layer you can't unit-test); everything is
 * vector-drawn so there's no art asset to 404. Timings/feel read from `window._gsIntro` so
 * they can be A/B'd live without a rebuild (CLAUDE.md escape-hatch rule). Canvas feel can't
 * be asserted in vitest — verify by eyes-on play.
 */

interface IntroFeel {
  /** Phase durations (ms) at speed 1. */
  driveMs: number;
  loadMs: number;
  transformMs: number;
  launchMs: number;
  writeMs: number;
  holdMs: number;
  /** Global time multiplier (>1 = faster). */
  speed: number;
  /** Stars scattered across the space sky. */
  starCount: number;
  /** Launch screen-shake amplitude (design px at the ignition peak). */
  shake: number;
  /** Draw the soft nebula clouds behind the starfield. */
  nebula: boolean;
  /** Draw the dimpled golf-ball planet rising in the corner. */
  planet: boolean;
  /** How many background shooting stars streak past during the space phase. */
  shootingStars: number;
  /** Link the title stars with faint constellation lines once they've formed. */
  constellation: boolean;
}

const BASE_FEEL: IntroFeel = {
  driveMs: 2200,
  loadMs: 1500,
  transformMs: 1500,
  launchMs: 1500,
  writeMs: 2200,
  holdMs: 1500,
  speed: 1,
  starCount: 220,
  shake: 7,
  nebula: true,
  planet: true,
  shootingStars: 4,
  constellation: true,
};

function feel(): IntroFeel {
  const override = (window as unknown as { _gsIntro?: Partial<IntroFeel> })._gsIntro ?? {};
  const f = { ...BASE_FEEL, ...override };
  const s = f.speed > 0 ? f.speed : 1;
  return { ...f, driveMs: f.driveMs / s, loadMs: f.loadMs / s, transformMs: f.transformMs / s, launchMs: f.launchMs / s, writeMs: f.writeMs / s, holdMs: f.holdMs / s };
}

export interface IntroOptions {
  /** Called once the sequence finishes OR the player skips. Fires exactly once. */
  onDone?: () => void;
}

export interface IntroHandle {
  destroy(): void;
}

// --- design space ------------------------------------------------------------
// All scene math is authored in a fixed 1000×640 stage, then scaled to fit the real
// viewport (letterboxed with the sky), so layout is resolution-independent.
const DW = 1000;
const DH = 640;
const GROUND_Y = 472; // where wheels rest / feet stand
const WHEEL_R = 22;

// Tiny deterministic PRNG (mulberry32) so the starfield is stable frame-to-frame and
// across reloads — Math.random would make stars jump. (Render layer, but determinism is
// still the house style.)
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
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number): number => t * t * t;
// Overshoot-and-settle, for the title stamping in past 1.0 then resting at it.
const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** A crisp 4-point star sparkle (used for title glints + the launch ignition flash core). */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(r * 0.16, r * 0.16, 0, -r);
    ctx.quadraticCurveTo(-r * 0.16, r * 0.16, 0, 0);
  }
  ctx.fill();
  ctx.restore();
}

/**
 * A single star making up the GOLF STARS wordmark. Positions are in TEXT-LOCAL space:
 * `lx` measured from the text's left edge, `ly` from its vertical centre — so the caller
 * maps them with the same `tx`/`ty` it lays the title out at. Each star drifts in from a
 * source point (`sx`,`sy`) high above (the rocket's wake) and settles onto its target.
 */
interface TitleStar {
  lx: number;
  ly: number;
  r: number;
  col: string;
  tw: number; // twinkle phase
  order: number; // 0..1 left→right reveal order
  sx: number; // source x (text-local), where it flies in from
  sy: number; // source y (text-local), well above the word
  hero: boolean;
}

/**
 * Sample the wordmark into a constellation of stars by rasterising it to an offscreen
 * canvas and reading back the covered pixels on a grid. Pure-ish (uses the passed RNG for
 * jitter so it's stable across reloads). Wrapped in try/catch: if a browser denies canvas
 * pixel read-back we return an empty set and the caller falls back to glowing text — a
 * cosmetic intro must never throw and strand the boot.
 */
function sampleTitleStars(
  text: string,
  font: string,
  rng: () => number,
): { stars: TitleStar[]; width: number; links: [number, number][] } {
  try {
    const cv = document.createElement('canvas');
    const octx = cv.getContext('2d');
    if (!octx) return { stars: [], width: 0, links: [] };
    octx.font = font;
    const width = octx.measureText(text).width;
    const H = 132;
    cv.width = Math.max(1, Math.ceil(width) + 8);
    cv.height = H;
    octx.font = font;
    octx.textAlign = 'left';
    octx.textBaseline = 'middle';
    octx.fillStyle = '#fff';
    octx.fillText(text, 4, H / 2);
    const data = octx.getImageData(0, 0, cv.width, cv.height).data;

    const golds = ['#fff4cf', '#ffe39a', '#ffd27a'];
    const step = 9;
    const stars: TitleStar[] = [];
    for (let py = 0; py < H; py += step) {
      for (let px = 0; px < cv.width; px += step) {
        if ((data[(py * cv.width + px) * 4 + 3] ?? 0) < 130) continue;
        const lx = px - 4 + (rng() - 0.5) * step * 0.7;
        const ly = py - H / 2 + (rng() - 0.5) * step * 0.7;
        const hero = rng() < 0.2;
        stars.push({
          lx,
          ly,
          r: hero ? 2.4 + rng() * 1.6 : 1.1 + rng() * 1.1,
          col: rng() < 0.5 ? '#ffffff' : golds[(rng() * golds.length) | 0]!,
          tw: rng() * Math.PI * 2,
          order: width > 0 ? lx / width : 0,
          // Drift in from above, biased toward the rocket's exit column (right of centre),
          // as if the climbing wagon shed them in its wake.
          sx: lx + (rng() - 0.5) * width * 0.5 + width * 0.12,
          sy: -120 - rng() * 170,
          hero,
        });
      }
    }
    // Pre-compute a faint constellation web: link each star to its nearest neighbour
    // within reach. O(n²) once at mount (a few hundred stars), never per frame.
    const links: [number, number][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < stars.length; i++) {
      let best = -1;
      let bestD = 26 * 26;
      for (let j = 0; j < stars.length; j++) {
        if (j === i) continue;
        const dx = stars[i]!.lx - stars[j]!.lx;
        const dy = stars[i]!.ly - stars[j]!.ly;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0) {
        const key = i < best ? `${i}:${best}` : `${best}:${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push([i, best]);
        }
      }
    }
    return { stars, width, links };
  } catch {
    return { stars: [], width: 0, links: [] };
  }
}

/**
 * Mount the intro as a fixed, full-screen overlay on <body>. The host app renders the
 * title screen underneath first (so the page has actually "booted"); this just covers it
 * until the sequence finishes or is skipped, then removes itself.
 */
export function mountIntro(opts: IntroOptions = {}): IntroHandle {
  const F = feel();

  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-intro', '1');
  // Base colour matches the app background (#0b0d12) so the loader→title handoff is seamless.
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#0b0d12;overflow:hidden;cursor:pointer;';

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  overlay.appendChild(canvas);

  const skip = document.createElement('button');
  skip.textContent = 'Skip ▸';
  skip.style.cssText =
    'position:absolute;right:16px;bottom:16px;padding:8px 14px;border-radius:9px;border:1px solid #2a2f3a;' +
    'background:rgba(13,16,22,0.7);color:#cfd6e4;font:600 13px system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(2px);';
  overlay.appendChild(skip);

  document.body.appendChild(overlay);
  const ctx = canvas.getContext('2d');

  // The starfield is regenerated on every resize to fill the WHOLE viewport — the sky is
  // full-screen, not a letterboxed band — at a constant density, so on a tall phone the top
  // of the frame fills with stars as the scene turns to space instead of showing an empty
  // slab above the 1000×640 stage. (A tenth are bigger, tinted "hero" stars with a soft
  // glow; the rest are plain pinpricks.) `rng` (seed 0x901f) drives the title + shooters.
  const rng = mulberry32(0x901f);
  type Star = { x: number; y: number; r: number; tw: number; hero: boolean; col: string; depth: number; pop: number };
  let stars: Star[] = [];
  function scatterStars(): void {
    const sr = mulberry32(0x901f);
    const heroHues = ['#fff4cf', '#bcd6ff', '#ffd0e6', '#cfeaff'];
    const area = Math.max(1, (vRight - vLeft) * (vBot - vTop));
    // F.starCount is the density reference for one DW×DH stage; scale by the real visible
    // area so a tall portrait letterbox gets proportionally more stars (capped for sanity).
    const count = Math.min(1500, Math.max(60, Math.round((F.starCount * area) / (DW * DH))));
    stars = Array.from({ length: count }, () => {
      const hero = sr() < 0.1;
      return {
        x: lerp(vLeft, vRight, sr()),
        y: lerp(vTop, vBot, sr()),
        r: hero ? 1.6 + sr() * 1.8 : 0.5 + sr() * 1.4,
        tw: sr() * Math.PI * 2, // twinkle phase
        hero,
        col: hero ? heroHues[(sr() * heroHues.length) | 0]! : '#eaf2ff',
        depth: sr(), // parallax 0..1 — nearer stars streak more during the warp launch
        pop: sr(), // fill threshold 0..1 — pops in once the takeoff fill passes it
      };
    });
  }

  // Drifting day clouds, scattered across the upper sky and well into the top letterbox so
  // the daytime sky reads "blue and cloudy" right to the top of the frame.
  const cloudRng = mulberry32(0x0c10);
  const clouds = Array.from({ length: 10 }, () => ({
    x: -DW * 0.3 + cloudRng() * DW * 1.6,
    y: -DH * 1.6 + cloudRng() * (DH * 1.6 + 210),
    s: 0.65 + cloudRng() * 1.0,
    a: 0.55 + cloudRng() * 0.35,
  }));

  // Pebble/grit flecks salting the underground cross-section, pre-scattered over a deep,
  // wide band (positions are depth below the turf line so they hold across resizes).
  const pebRng = mulberry32(0x5eed);
  const pebbles = Array.from({ length: 150 }, () => ({
    x: -DW * 0.3 + pebRng() * DW * 1.6,
    dy: pebRng() * DH * 2.6,
    r: 1 + pebRng() * 3.5,
    light: pebRng() < 0.45,
  }));

  // The GOLF STARS wordmark as a constellation, sampled from the rasterised text. The
  // stars rain in from the rocket's wake (above) and settle into the letters; if pixel
  // sampling is unavailable, `titleStars` is empty and drawTitle falls back to glowing text.
  const TITLE_FONT = '800 96px system-ui, "Segoe UI", sans-serif';
  const { stars: titleStars, width: titleW, links: titleLinks } = sampleTitleStars(
    'GOLF STARS',
    TITLE_FONT,
    rng,
  );

  // Phase boundaries (cumulative ms).
  const t0 = F.driveMs;
  const t1 = t0 + F.loadMs;
  const t2 = t1 + F.transformMs;
  const t3 = t2 + F.launchMs;
  const t4 = t3 + F.writeMs;
  const t5 = t4 + F.holdMs;

  // Deterministic shooting stars, each firing once within the space window.
  const shooters = Array.from({ length: Math.max(0, F.shootingStars) }, () => ({
    t: t1 + rng() * Math.max(1, t5 - t1 - 900),
    sx: -60 + rng() * 560,
    sy: 20 + rng() * 220,
    ang: 0.42 + rng() * 0.42, // down-and-right
    dur: 620 + rng() * 320,
    reach: 360 + rng() * 220,
  }));

  let raf = 0;
  let start = 0;
  let finished = false;
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let scale = 1;
  let offX = 0;
  let offY = 0;
  // Visible region in design coords (the full viewport, including the letterbox bands) so the
  // sky/stars/dirt can be drawn full-screen rather than only inside the 1000×640 stage.
  let vLeft = 0;
  let vRight = DW;
  let vTop = 0;
  let vBot = DH;

  function resize(): void {
    if (!ctx) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = overlay.clientWidth || window.innerWidth;
    cssH = overlay.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    // Fit the 1000×640 stage into the viewport, centred (cover-ish: use min so it always
    // fits, with the sky bleeding into the letterbox).
    scale = Math.min(cssW / DW, cssH / DH);
    offX = (cssW - DW * scale) / 2;
    offY = (cssH - DH * scale) / 2;
    vLeft = -offX / scale;
    vRight = (cssW - offX) / scale;
    vTop = -offY / scale;
    vBot = (cssH - offY) / scale;
    scatterStars();
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
  };

  function finish(): void {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    opts.onDone?.();
  }

  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    finish();
  });
  overlay.addEventListener('click', finish);
  window.addEventListener('keydown', onKey);

  // --- scene drawing (all in design space) ----------------------------------

  /** Soft, large nebula blobs for depth — screen-blended so they glow over the dark sky. */
  function drawNebula(a: number): void {
    if (!ctx || a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const blobs: [number, number, number, string][] = [
      [250, 170, 300, '#3b1d72'],
      [780, 300, 340, '#0f4257'],
      [540, 70, 240, '#5a1f55'],
      [120, 470, 260, '#1d2f6b'],
    ];
    for (const [bx, by, br, col] of blobs) {
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Shooting stars: short tapered streaks crossing the void on a timer. */
  function drawShooters(spaceA: number, e: number): void {
    if (!ctx || spaceA <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sh of shooters) {
      if (e < sh.t || e > sh.t + sh.dur) continue;
      const p = (e - sh.t) / sh.dur;
      const d = easeOut(p) * sh.reach;
      const hx = sh.sx + Math.cos(sh.ang) * d;
      const hy = sh.sy + Math.sin(sh.ang) * d;
      const tailLen = 70 + 40 * Math.sin(p * Math.PI);
      const tx = hx - Math.cos(sh.ang) * tailLen;
      const ty = hy - Math.sin(sh.ang) * tailLen;
      const a = spaceA * Math.sin(p * Math.PI);
      const g = ctx.createLinearGradient(tx, ty, hx, hy);
      g.addColorStop(0, 'rgba(180,210,255,0)');
      g.addColorStop(1, `rgba(235,245,255,${a})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawSky(dayA: number, spaceA: number, e: number, warp: number): void {
    if (!ctx) return;
    // Space gradient underneath, always. Resolves to the app background (#0b0d12) at the
    // bottom so when the overlay lifts, the starfield blends straight into the title screen.
    const sp = ctx.createLinearGradient(0, 0, 0, DH);
    sp.addColorStop(0, '#11141f');
    sp.addColorStop(0.6, '#0c0f17');
    sp.addColorStop(1, '#0b0d12');
    ctx.fillStyle = sp;
    ctx.fillRect(vLeft, vTop, vRight - vLeft, vBot - vTop);

    if (spaceA > 0) {
      if (F.nebula) drawNebula(spaceA);
      ctx.save();
      const now = performance.now();
      for (const s of stars) {
        // Progressive fill: each star pops in once the takeoff fill (spaceA) passes its
        // threshold, so the sky fills with stars as the wagon climbs rather than all at once.
        const fill = clamp01((spaceA - s.pop) / 0.22);
        if (fill <= 0) continue;
        const tw = 0.55 + 0.45 * Math.sin(now * 0.004 + s.tw);
        ctx.globalAlpha = fill * tw;
        // Warp launch: near stars stretch into vertical streaks as the wagon punches up.
        const streak = warp * (8 + s.depth * 46);
        if (streak > 1.5) {
          const g = ctx.createLinearGradient(s.x, s.y - streak, s.x, s.y + streak);
          g.addColorStop(0, 'rgba(234,242,255,0)');
          g.addColorStop(0.5, s.col);
          g.addColorStop(1, 'rgba(234,242,255,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = s.r * 1.1;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - streak);
          ctx.lineTo(s.x, s.y + streak);
          ctx.stroke();
          continue;
        }
        if (s.hero) {
          ctx.shadowColor = s.col;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      drawShooters(spaceA, e);
    }

    if (dayA > 0) {
      ctx.save();
      ctx.globalAlpha = dayA;
      // Blue sky filling the WHOLE frame down to the ground (top letterbox included), so the
      // top of the screen matches the scene's sky instead of showing an empty slab.
      const sky = ctx.createLinearGradient(0, vTop, 0, GROUND_Y);
      sky.addColorStop(0, '#7cc1f4');
      sky.addColorStop(0.55, '#9bdcff');
      sky.addColorStop(1, '#eaf7ff');
      ctx.fillStyle = sky;
      ctx.fillRect(vLeft, vTop, vRight - vLeft, GROUND_Y - vTop);
      // Sun.
      ctx.fillStyle = 'rgba(255,247,214,0.95)';
      ctx.beginPath();
      ctx.arc(840, 96, 34, 0, Math.PI * 2);
      ctx.fill();
      // Soft clouds drifting across the upper sky (into the top letterbox).
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const c of clouds) {
        ctx.globalAlpha = dayA * c.a;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 60 * c.s, 22 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 46 * c.s, c.y + 6 * c.s, 44 * c.s, 18 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x - 46 * c.s, c.y + 8 * c.s, 40 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // --- underground cross-section --------------------------------------------
  // Buried treasures, each drawn in design space at (x, y). Kept small + vector so there's
  // no asset to 404 and they read against the dark soil.

  /** A faceted gemstone (diamond cut) with a bright top facet and a glint. */
  function drawGem(x: number, y: number, s: number, col: string, rot: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    const w = 14;
    const top = -10;
    const mid = -2;
    const bot = 16;
    // Body.
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(-w * 0.6, top);
    ctx.lineTo(w * 0.6, top);
    ctx.lineTo(w, mid);
    ctx.lineTo(0, bot);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    // Lighter top crown facet.
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, top);
    ctx.lineTo(w * 0.6, top);
    ctx.lineTo(w, mid);
    ctx.lineTo(-w, mid);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    // Facet seams.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w, mid);
    ctx.lineTo(0, bot);
    ctx.moveTo(w, mid);
    ctx.lineTo(0, bot);
    ctx.moveTo(0, top);
    ctx.lineTo(0, bot);
    ctx.stroke();
    // Glint.
    sparkle(ctx, -w * 0.2, top + 1, 5, 'rgba(255,255,255,0.9)');
    ctx.restore();
  }

  /** A classic dog-bone (two knuckles + shaft) for the dino-bone vibe. */
  function drawBone(x: number, y: number, s: number, rot: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = '#e9e2cf';
    ctx.strokeStyle = '#b6ab8f';
    ctx.lineWidth = 1.5;
    const L = 26;
    const knuck = 7;
    for (const ex of [-L, L]) {
      for (const ey of [-knuck, knuck]) {
        ctx.beginPath();
        ctx.arc(ex, ey, knuck, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    rr(ctx, -L, -6, L * 2, 12, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** A cartoon dino skull: a snout, eye socket and a row of teeth. */
  function drawSkull(x: number, y: number, s: number, rot: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = '#e9e2cf';
    ctx.strokeStyle = '#b6ab8f';
    ctx.lineWidth = 1.5;
    // Cranium + elongated snout.
    ctx.beginPath();
    ctx.moveTo(-34, 4);
    ctx.quadraticCurveTo(-40, -20, -16, -22);
    ctx.quadraticCurveTo(6, -24, 16, -14);
    ctx.lineTo(40, -8);
    ctx.quadraticCurveTo(46, -2, 38, 2);
    ctx.lineTo(16, 6);
    ctx.quadraticCurveTo(2, 16, -16, 14);
    ctx.quadraticCurveTo(-30, 14, -34, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Eye socket.
    ctx.fillStyle = '#5a513c';
    ctx.beginPath();
    ctx.arc(-12, -8, 6, 0, Math.PI * 2);
    ctx.fill();
    // Teeth along the jaw.
    ctx.fillStyle = '#f3eee0';
    for (let i = 0; i < 5; i++) {
      const tx = 6 + i * 7;
      ctx.beginPath();
      ctx.moveTo(tx, 4);
      ctx.lineTo(tx + 3, 4);
      ctx.lineTo(tx + 1.5, 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** A long-lost dimpled golf ball, half-buried treasure. */
  function drawBuriedBall(x: number, y: number, s: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 14);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c7cdd8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,130,150,0.5)';
    for (let v = -1; v <= 1; v++) {
      for (let u = -1; u <= 1; u++) {
        if (u * u + v * v > 2) continue;
        ctx.beginPath();
        ctx.arc(u * 6, v * 6, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * A cross-section of earth under the lawn, revealed in the bottom band: stacked soil layers
   * (topsoil → subsoil → clay → bedrock) salted with grit and buried treasures (dino bones,
   * gemstones, a lost golf ball). Fades out with the day scene — there's no ground in space.
   * Drawn from the turf line (DH) down to the bottom of the viewport.
   */
  function drawUnderground(a: number): void {
    if (!ctx || a <= 0 || vBot <= DH) return;
    ctx.save();
    ctx.globalAlpha = a;
    const top = DH;
    const x = vLeft;
    const w = vRight - vLeft;

    // Soil base gradient, browns deepening with depth.
    const g = ctx.createLinearGradient(0, top, 0, vBot);
    g.addColorStop(0, '#5a3f25');
    g.addColorStop(0.4, '#46301d');
    g.addColorStop(0.75, '#341f13');
    g.addColorStop(1, '#22140b');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w, vBot - top);

    // Dark topsoil seam right under the turf, with a slightly wavy interface.
    ctx.fillStyle = '#2c1d10';
    ctx.beginPath();
    ctx.moveTo(x, top);
    const seg = Math.max(40, w / 18);
    for (let sx = x; sx <= x + w; sx += seg) {
      ctx.lineTo(sx, top + 10 + Math.sin(sx * 0.03) * 6);
    }
    ctx.lineTo(x + w, top);
    ctx.closePath();
    ctx.fill();

    // Strata divider lines (lighter mineral seams) at a few depths.
    ctx.strokeStyle = 'rgba(150,120,86,0.25)';
    ctx.lineWidth = 2;
    for (const frac of [0.26, 0.52, 0.78]) {
      const ly = top + (vBot - top) * frac;
      if (ly > vBot - 4) continue;
      ctx.beginPath();
      ctx.moveTo(x, ly + Math.sin(x * 0.02) * 8);
      for (let sx = x; sx <= x + w; sx += seg) {
        ctx.lineTo(sx, ly + Math.sin(sx * 0.02) * 8);
      }
      ctx.stroke();
    }

    // Grit / pebbles.
    for (const p of pebbles) {
      const py = top + p.dy;
      if (py > vBot - 2) continue;
      ctx.fillStyle = p.light ? 'rgba(196,170,128,0.5)' : 'rgba(20,12,6,0.55)';
      ctx.beginPath();
      ctx.arc(p.x, py, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Buried treasures (only those that fall inside the visible depth).
    const items: Array<() => void> = [];
    const at = (dy: number, fn: (yy: number) => void): void => {
      const yy = top + dy;
      if (yy < vBot - 14) items.push(() => fn(yy));
    };
    at(150, (yy) => drawSkull(300, yy, 1.0, -0.12));
    at(120, (yy) => drawBone(660, yy, 0.95, 0.1));
    at(250, (yy) => drawGem(470, yy, 1.15, '#7be0d0', 0.18));
    at(300, (yy) => drawGem(150, yy, 0.95, '#c89bff', -0.3));
    at(280, (yy) => drawGem(845, yy, 1.05, '#ff9bbf', 0.12));
    at(380, (yy) => drawBone(790, yy, 0.85, 0.95));
    at(400, (yy) => drawBuriedBall(360, yy, 1.0));
    at(520, (yy) => drawGem(620, yy, 1.25, '#ffd27a', -0.15));
    for (const fn of items) fn();

    ctx.restore();
  }

  /**
   * A giant dimpled golf-ball planet — the world you're launching off. Drawn as a shaded
   * sphere with foreshortened dimples, low in the corner, rising as the void fades in.
   * (On-theme for space golf, and there's no asset to 404.)
   */
  function drawPlanet(a: number): void {
    if (!ctx || a <= 0) return;
    const cx = 168;
    const cy = lerp(700, 656, a); // eases up as space settles in
    const R = 250;
    // Light from the upper-right (toward the departing rocket).
    const lx = 0.55;
    const ly = -0.62;
    const lz = 0.56;

    ctx.save();
    ctx.globalAlpha = a;

    // Atmospheric rim glow.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.16);
    halo.addColorStop(0, 'rgba(150,200,255,0.28)');
    halo.addColorStop(1, 'rgba(150,200,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2);
    ctx.fill();

    // Sphere body.
    const body = ctx.createRadialGradient(cx + R * 0.32, cy - R * 0.36, R * 0.1, cx, cy, R);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.55, '#e7ecf5');
    body.addColorStop(0.85, '#b9c2d4');
    body.addColorStop(1, '#727b90');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Dimples, clipped to the sphere, sized by foreshortening and shaded by the light.
    ctx.save();
    ctx.clip(); // current path is the sphere
    const step = 0.13;
    for (let v = -0.96; v <= 0.96; v += step) {
      // Offset alternate rows for a honeycomb-ish pack.
      const rowOff = (Math.round((v + 1) / step) % 2) * (step / 2);
      for (let u = -0.96 + rowOff; u <= 0.96; u += step) {
        const d2 = u * u + v * v;
        if (d2 > 0.9) continue;
        const z = Math.sqrt(1 - d2);
        const px = cx + u * R;
        const py = cy + v * R;
        const size = (4.2 + 4.8 * z);
        // Diffuse term toward the light → dimple contrast fades on the dark limb.
        const ndl = clamp01(u * lx + v * ly + z * lz);
        const dimA = 0.12 + 0.16 * ndl;
        // Shadowed half of each dimple + a tiny lit speck for relief.
        ctx.fillStyle = `rgba(60,72,96,${dimA})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.18 * ndl})`;
        ctx.beginPath();
        ctx.arc(px - size * 0.3, py - size * 0.3, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Terminator: darken the unlit limb with a directional gradient.
    const term = ctx.createLinearGradient(cx + lx * R, cy + ly * R, cx - lx * R, cy - ly * R);
    term.addColorStop(0, 'rgba(5,8,20,0)');
    term.addColorStop(1, 'rgba(5,8,20,0.6)');
    ctx.fillStyle = term;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawSuburb(dayA: number): void {
    if (!ctx || dayA <= 0) return;
    ctx.save();
    ctx.globalAlpha = dayA;

    // Lawn.
    ctx.fillStyle = '#6fae54';
    ctx.fillRect(0, GROUND_Y - 64, DW, DH - (GROUND_Y - 64));
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, GROUND_Y - 64, DW, 6);

    // Driveway (concrete trapezoid running from the garage to the foreground).
    ctx.fillStyle = '#bfc3cb';
    ctx.beginPath();
    ctx.moveTo(360, GROUND_Y - 60);
    ctx.lineTo(660, GROUND_Y - 60);
    ctx.lineTo(820, DH);
    ctx.lineTo(220, DH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(510, GROUND_Y - 60);
    ctx.lineTo(520, DH);
    ctx.stroke();

    // House (left), behind the driveway.
    const hx = 70;
    const hy = 250;
    const hw = 300;
    const hh = (GROUND_Y - 60) - hy;
    ctx.fillStyle = '#e7d4a6';
    ctx.fillRect(hx, hy, hw, hh);
    // Roof.
    ctx.fillStyle = '#8a4b3a';
    ctx.beginPath();
    ctx.moveTo(hx - 22, hy);
    ctx.lineTo(hx + hw / 2, hy - 72);
    ctx.lineTo(hx + hw + 22, hy);
    ctx.closePath();
    ctx.fill();
    // Garage door.
    ctx.fillStyle = '#cdb98a';
    ctx.fillRect(hx + 150, hy + 50, 130, hh - 50);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    for (let gy = hy + 70; gy < hy + hh; gy += 22) {
      ctx.beginPath();
      ctx.moveTo(hx + 150, gy);
      ctx.lineTo(hx + 280, gy);
      ctx.stroke();
    }
    // Front door + window.
    ctx.fillStyle = '#7d5a3a';
    ctx.fillRect(hx + 30, hy + 70, 44, hh - 70);
    ctx.fillStyle = '#bfe0ef';
    ctx.fillRect(hx + 95, hy + 40, 40, 40);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(hx + 95, hy + 40, 40, 40);

    // A little shrub by the door.
    ctx.fillStyle = '#4f8f3c';
    ctx.beginPath();
    ctx.arc(hx + 12, GROUND_Y - 70, 16, 0, Math.PI * 2);
    ctx.arc(hx + 28, GROUND_Y - 78, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** A single cartoon golfer at foot position (x, GROUND_Y). */
  function drawGolfer(x: number, scaleG: number, color: string, walk: number, withBag: boolean, alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, GROUND_Y);
    ctx.scale(scaleG, scaleG);
    const swing = Math.sin(walk) * 9;

    // Legs.
    ctx.strokeStyle = '#34384a';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(-swing * 0.6, 0);
    ctx.moveTo(0, -30);
    ctx.lineTo(swing * 0.6, 0);
    ctx.stroke();

    // Bag on the back (a quiver of clubs), drawn behind the torso.
    if (withBag) {
      ctx.save();
      ctx.translate(11, -44);
      ctx.rotate(0.25);
      ctx.fillStyle = '#c0392b';
      rr(ctx, -5, -2, 10, 30, 4);
      ctx.fill();
      ctx.strokeStyle = '#d7dbe2';
      ctx.lineWidth = 2;
      for (const dx of [-3, 0, 3]) {
        ctx.beginPath();
        ctx.moveTo(dx, -2);
        ctx.lineTo(dx, -14);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Torso.
    ctx.fillStyle = color;
    rr(ctx, -9, -54, 18, 26, 6);
    ctx.fill();
    // Arms.
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-8, -50);
    ctx.lineTo(-12 - swing * 0.3, -34);
    ctx.moveTo(8, -50);
    ctx.lineTo(12 + swing * 0.3, -34);
    ctx.stroke();
    // Head.
    ctx.fillStyle = '#f3c9a0';
    ctx.beginPath();
    ctx.arc(0, -64, 8, 0, Math.PI * 2);
    ctx.fill();
    // Cap.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -66, 8, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-10, -67, 9, 3); // brim
    ctx.restore();
  }

  /**
   * The hero wagon. Drawn in local space centred on its body, front pointing local -x and
   * exhaust pointing local +x, so a single `tilt` rotates the whole thing (nose-up launch)
   * and the flame always trails the rear.
   */
  function drawCar(
    cx: number,
    groundY: number,
    s: number,
    tilt: number,
    wheelRetract: number,
    jet: number,
    flame: number,
    bootOpen: number,
  ): void {
    if (!ctx) return;
    const bodyCenterY = groundY - 58;
    ctx.save();
    ctx.translate(cx, bodyCenterY);
    ctx.scale(s, s);
    ctx.rotate(tilt);

    // Flame first (behind the body), from the rear nozzles.
    if (flame > 0) {
      const nozX = 150 + jet * 42;
      for (const ny of [-16, 6]) {
        const len = (70 + flame * 80) * (0.85 + 0.15 * Math.sin(performance.now() * 0.05 + ny));
        const g = ctx.createLinearGradient(nozX, ny, nozX + len, ny);
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.3, 'rgba(255,206,84,0.9)');
        g.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(nozX, ny - 9);
        ctx.quadraticCurveTo(nozX + len * 0.6, ny - 4, nozX + len, ny);
        ctx.quadraticCurveTo(nozX + len * 0.6, ny + 4, nozX, ny + 9);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Jet nozzles sliding out of the rear.
    if (jet > 0) {
      ctx.fillStyle = '#6b7080';
      for (const ny of [-16, 6]) {
        rr(ctx, 150, ny - 7, jet * 42, 14, 4);
        ctx.fill();
      }
      ctx.fillStyle = '#3a3f4d';
      for (const ny of [-16, 6]) {
        rr(ctx, 150 + jet * 42 - 6, ny - 8, 6, 16, 3);
        ctx.fill();
      }
    }

    // Wheels (fold up + shrink + fade as retract → 1).
    const wy = 36 - wheelRetract * 30;
    const wr = WHEEL_R * (1 - 0.45 * wheelRetract);
    ctx.globalAlpha = 1 - 0.85 * wheelRetract;
    for (const wx of [-92, 96]) {
      ctx.fillStyle = '#1c1f29';
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b9bdc8';
      ctx.beginPath();
      ctx.arc(wx, wy, wr * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Lower body.
    const bodyGrad = ctx.createLinearGradient(0, -28, 0, 28);
    bodyGrad.addColorStop(0, '#3f78b8');
    bodyGrad.addColorStop(1, '#2c567f');
    ctx.fillStyle = bodyGrad;
    rr(ctx, -150, -10, 300, 38, 14);
    ctx.fill();

    // Cabin / greenhouse.
    ctx.fillStyle = '#34618f';
    ctx.beginPath();
    ctx.moveTo(-118, -8);
    ctx.lineTo(-78, -54);
    ctx.lineTo(70, -54);
    ctx.lineTo(120, -8);
    ctx.closePath();
    ctx.fill();
    // Glass.
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath();
    ctx.moveTo(-104, -12);
    ctx.lineTo(-72, -46);
    ctx.lineTo(-6, -46);
    ctx.lineTo(-6, -12);
    ctx.closePath();
    ctx.moveTo(4, -12);
    ctx.lineTo(4, -46);
    ctx.lineTo(62, -46);
    ctx.lineTo(104, -12);
    ctx.closePath();
    ctx.fill();
    // Pillar.
    ctx.strokeStyle = '#2c567f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-1, -46);
    ctx.lineTo(-1, -12);
    ctx.stroke();

    // Woody side panel (the wagon signature).
    ctx.fillStyle = '#c79a5b';
    rr(ctx, -40, -2, 150, 22, 5);
    ctx.fill();
    ctx.strokeStyle = '#8d6a39';
    ctx.lineWidth = 2;
    rr(ctx, -40, -2, 150, 22, 5);
    ctx.stroke();

    // Rear hatch / boot lid (lifts open during loading).
    ctx.save();
    ctx.translate(150, -10);
    ctx.rotate(-bootOpen * 1.0);
    ctx.fillStyle = '#356193';
    rr(ctx, -2, -44, 12, 44, 4);
    ctx.fill();
    ctx.restore();

    // Headlight (front, local -x).
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(-146, 4, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Launch effects drawn UNDER the car (in design space, not the car's local frame): a
   * blinding ignition flash, a roaring exhaust plume, and a rising smoke column.
   */
  function drawLaunchFX(carX: number, carY: number, lp: number): void {
    if (!ctx) return;
    const now = performance.now();
    const padY = GROUND_Y - 28;

    // Ignition flash at the pad, brightest at t=0, gone by ~lp 0.22.
    const flash = Math.max(0, 1 - lp / 0.22);
    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fr = 120 + (1 - flash) * 220;
      const g = ctx.createRadialGradient(520, padY, 0, 520, padY, fr);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * flash})`);
      g.addColorStop(0.4, `rgba(255,214,120,${0.7 * flash})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(520, padY, fr, 0, Math.PI * 2);
      ctx.fill();
      sparkle(ctx, 520, padY, 60 + flash * 70, `rgba(255,248,220,${flash})`);
      ctx.restore();
    }

    // Exhaust plume + smoke, hanging straight down off the climbing car.
    const topY = carY + 18;
    ctx.save();
    // Bright core jet.
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.82 + 0.18 * Math.sin(now * 0.06);
    const plume = ctx.createLinearGradient(carX, topY, carX, DH + 80);
    plume.addColorStop(0, `rgba(255,255,255,${0.95 * flick})`);
    plume.addColorStop(0.25, `rgba(255,210,110,${0.8 * flick})`);
    plume.addColorStop(0.6, 'rgba(255,120,40,0.35)');
    plume.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(carX - 20, topY);
    ctx.lineTo(carX + 20, topY);
    ctx.lineTo(carX + 74, DH + 80);
    ctx.lineTo(carX - 74, DH + 80);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Roiling smoke puffs billowing out below.
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const age = ((i / 7 + lp * 1.4) % 1);
      const py = lerp(topY + 30, DH + 40, age);
      const spread = 16 + age * 150;
      const pr = 18 + age * 70;
      const a = 0.32 * (1 - age);
      const wob = Math.sin(now * 0.01 + i * 2) * spread * 0.5;
      ctx.fillStyle = `rgba(206,212,224,${a})`;
      ctx.beginPath();
      ctx.arc(carX + wob, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(120,128,144,${a * 0.7})`;
      ctx.beginPath();
      ctx.arc(carX + wob + pr * 0.3, py + pr * 0.2, pr * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A golf bag in flight, arcing from a golfer into the boot. */
  function drawFlyingBag(fromX: number, toX: number, p: number): void {
    if (!ctx) return;
    const x = lerp(fromX, toX, p);
    const baseY = lerp(GROUND_Y - 70, GROUND_Y - 86, p);
    const arc = -70 * Math.sin(p * Math.PI);
    ctx.save();
    ctx.translate(x, baseY + arc);
    ctx.rotate(p * 2.4);
    ctx.fillStyle = '#c0392b';
    rr(ctx, -6, -16, 12, 34, 5);
    ctx.fill();
    ctx.strokeStyle = '#d7dbe2';
    ctx.lineWidth = 2;
    for (const dx of [-3, 0, 3]) {
      ctx.beginPath();
      ctx.moveTo(dx, -16);
      ctx.lineTo(dx, -26);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The title, spelled out by the stars the rocket left in its wake. Each star streams
   * down from above (the trail) and settles onto its letter target, left-to-right, then
   * twinkles; faint constellation lines web the formed wordmark together. Falls back to a
   * glowing text wordmark when pixel-sampling wasn't available (`titleStars` empty).
   */
  function drawTitle(reveal: number, glow: number): void {
    if (!ctx) return;
    const text = 'GOLF STARS';
    const ty = 250;
    const now = performance.now();

    if (titleStars.length === 0) {
      // Degrade-safe fallback: draw the glowing wordmark directly so the title is never
      // missing if a browser denied canvas read-back at mount.
      ctx.save();
      ctx.font = TITLE_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = clamp01(reveal);
      ctx.shadowColor = 'rgba(255,209,102,0.9)';
      ctx.shadowBlur = 24 + glow * 18;
      const grad = ctx.createLinearGradient(0, ty - 50, 0, ty + 50);
      grad.addColorStop(0, '#fff1c4');
      grad.addColorStop(1, '#ffb84d');
      ctx.fillStyle = grad;
      ctx.fillText(text, DW / 2, ty);
      ctx.restore();
    } else {
      const tx = DW / 2 - titleW / 2;
      // Per-star arrival progress: staggered by left→right order so the word forms in the
      // direction the rocket flew.
      const apOf = (s: TitleStar): number => clamp01((reveal - s.order * 0.62) / 0.3);

      // Faint constellation web between settled neighbours.
      if (F.constellation) {
        ctx.save();
        ctx.lineWidth = 1;
        for (const [i, j] of titleLinks) {
          const a = Math.min(apOf(titleStars[i]!), apOf(titleStars[j]!));
          if (a < 0.85) continue;
          ctx.strokeStyle = `rgba(180,205,255,${0.16 * (a - 0.85) / 0.15})`;
          ctx.beginPath();
          ctx.moveTo(tx + titleStars[i]!.lx, ty + titleStars[i]!.ly);
          ctx.lineTo(tx + titleStars[j]!.lx, ty + titleStars[j]!.ly);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of titleStars) {
        const ap = apOf(s);
        if (ap <= 0) continue;
        const fly = easeOutBack(ap); // ease in with a tiny settle overshoot
        const x = lerp(tx + s.sx, tx + s.lx, fly);
        const y = lerp(ty + s.sy, ty + s.ly, fly);
        const settled = ap >= 1;
        const tw = settled ? 0.7 + 0.3 * Math.sin(now * 0.005 + s.tw) : 1;

        // A short motion tail while still flying in, pointing back along its descent.
        if (ap < 1) {
          const back = 1 - 0.12;
          const bx = lerp(tx + s.sx, tx + s.lx, easeOutBack(ap * back));
          const by = lerp(ty + s.sy, ty + s.ly, easeOutBack(ap * back));
          const g = ctx.createLinearGradient(bx, by, x, y);
          g.addColorStop(0, 'rgba(255,236,180,0)');
          g.addColorStop(1, `rgba(255,242,205,${0.5 * ap})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = s.r * 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        ctx.globalAlpha = clamp01(ap * tw);
        if (s.hero) {
          ctx.shadowColor = s.col;
          ctx.shadowBlur = 9;
        }
        ctx.fillStyle = s.col;
        ctx.beginPath();
        ctx.arc(x, y, s.r * (settled ? 1 : 1.25), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      // Sparkle glints riding the formed wordmark.
      if (glow > 0.2) {
        const glints: [number, number, number][] = [
          [tx + titleW * 0.12, ty - 30, 0],
          [tx + titleW * 0.5, ty + 26, 1.6],
          [tx + titleW * 0.86, ty - 20, 3.1],
        ];
        for (const [gx, gy, ph] of glints) {
          const tw = Math.max(0, Math.sin(now * 0.005 + ph));
          if (tw <= 0) continue;
          sparkle(ctx, gx, gy, 6 + tw * 9, `rgba(255,250,225,${0.7 * tw * glow})`);
        }
      }
    }

    // Subtitle, fading in with the glow.
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = glow;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fb2cf';
    ctx.fillText('A space-golf odyssey', DW / 2, ty + 78);
    ctx.restore();
  }

  // --- main loop -------------------------------------------------------------
  function frame(now: number): void {
    if (!ctx) {
      finish();
      return;
    }
    try {
      if (!start) start = now;
      const e = now - start;

      // Launch progress drives the warp streaks + screen-shake.
      const lp = e >= t2 && e < t3 ? clamp01((e - t2) / F.launchMs) : e >= t3 ? 1 : 0;
      const warp = e >= t2 && e < t3 ? easeIn(lp) * (1 - lp * 0.3) : 0;
      // Shake spikes at ignition and decays through the climb.
      const shakeEnv = e >= t2 && e < t3 ? Math.exp(-lp * 3.4) : 0;
      const shx = shakeEnv * F.shake * Math.sin(now * 0.085);
      const shy = shakeEnv * F.shake * Math.cos(now * 0.067);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);
      if (shakeEnv > 0) ctx.translate(shx, shy);

      // Day → space crossfade spans transform + launch.
      const space = clamp01((e - t1) / (t3 - t1));
      const dayA = 1 - space;

      drawSky(dayA, space, e, warp);
      if (F.planet) drawPlanet(space);
      drawUnderground(dayA);
      drawSuburb(dayA);

      // Golfers + bag loading (day scene only).
      const lineX = [690, 726, 762, 798];
      const startX = [1080, 1150, 1220, 1290];
      const colors = ['#e15b5b', '#56b870', '#5b8de1', '#e0a93f'];
      if (e < t1) {
        const dp = easeInOut(clamp01(e / t0));
        for (let i = 0; i < 4; i++) {
          // Loading progress for golfer i (staggered).
          const li = e < t0 ? 0 : clamp01(((e - t0) / F.loadMs) * 1.3 - i * 0.22);
          const walking = e < t0;
          const gx = walking ? lerp(startX[i]!, lineX[i]!, dp) : lineX[i]!;

          if (li < 0.5) {
            // Standing at the boot, bag still on the back (until the toss begins).
            drawGolfer(gx, 1, colors[i]!, walking ? e * 0.02 + i : 0, true, 1);
            if (li > 0) drawFlyingBag(lineX[i]! - 10, 648, clamp01(li / 0.5));
          } else {
            // Bag's in — walk to the door and hop in (slide left + fade).
            const enter = clamp01((li - 0.5) / 0.5);
            const ex = lerp(lineX[i]!, 560, easeIn(enter));
            drawGolfer(ex, 1, colors[i]!, e * 0.03 + i, false, 1 - enter);
          }
        }
      }

      // The hero car.
      if (e < t3) {
        let carX = 520;
        let carY = GROUND_Y;
        let tilt = 0;
        let wheelRetract = 0;
        let jet = 0;
        let flame = 0;
        let cs = 1;
        const bootOpen = e > t0 - 150 && e < t1 ? easeOut(clamp01((Math.min(e, t1) - (t0 - 150)) / 400)) * (e > t1 - 350 ? Math.max(0, 1 - (e - (t1 - 350)) / 350) : 1) : 0;

        if (e >= t1 && e < t2) {
          const tp = easeInOut(clamp01((e - t1) / F.transformMs));
          wheelRetract = tp;
          carY = GROUND_Y - tp * 70 + Math.sin(now * 0.012) * 4 * tp;
          jet = clamp01(tp * 1.4);
          flame = tp * 0.35;
        } else if (e >= t2) {
          wheelRetract = 1;
          jet = 1;
          tilt = easeIn(lp) * 1.4;
          flame = 0.5 + lp * 0.5;
          carY = GROUND_Y - 70 - easeIn(lp) * (GROUND_Y - 70 + 280);
          carX = 520 + lp * 130;
          cs = 1 - lp * 0.45;
        }
        // Launch FX sit under the car (separate from its local frame).
        if (e >= t2) drawLaunchFX(carX, carY, lp);
        drawCar(carX, carY, cs, tilt, wheelRetract, jet, flame, bootOpen);
      }

      // Title formed by the stars left in the rocket's wake, then held.
      if (e >= t3) {
        const reveal = easeInOut(clamp01((e - t3) / F.writeMs));
        const glow = clamp01((e - t3 - F.writeMs * 0.4) / (F.writeMs * 0.6));
        drawTitle(reveal, glow);
      }

      ctx.restore();

      if (e >= t5) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    } catch {
      // A cosmetic intro must never strand the boot — bail straight to the title.
      finish();
    }
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return {
    destroy(): void {
      finish();
    },
  };
}
