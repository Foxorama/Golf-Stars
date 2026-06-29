/**
 * Shared atmospheric WEATHER layer (GS-journey-fx rework).
 *
 * The journey route you fly brings a `CourseEffect` — moonlight, a meteor shower, a solar storm, an
 * aurora, a debris field, a trade camp. This module is the ONE source of truth for drawing that
 * atmosphere, plus the always-on space ambience (twinkling stars, the odd shooting star) and the
 * VISIBLE wind. It is consumed by BOTH:
 *   - the animated play view (`playView.ts`) while the ball is in flight, and
 *   - a lightweight overlay on the DECISION / PUTTING screens (`app.ts`), so the world is just as
 *     alive while you're lining up the shot — not only mid-flight.
 *
 * EVERYTHING here is SCREEN-SPACE (the sky and the air), drawn in the canvas's own pixel frame. That
 * is deliberate and is what fixes the old "static decor jumps all over the place" bug: weather is the
 * sky, so it is anchored to the viewport, never to a course point that swings around under the
 * follow-cam. The old course-projected ground decor (trade tents / debris shards planted near the
 * tee) is gone — the trade camp is now a glowing caravan on the horizon and the debris drifts past in
 * orbit, both screen-fixed.
 *
 * Pure feel: seeded off the hole (mulberry32, never `Math.random`) so positions are stable for the
 * session and the same on every screen; only phase/drift animate off the clock. Reduced-motion draws a
 * calm single frame (the caller simply stops ticking).
 */

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

/** Per-archetype wind tint (kept in sync with the scene builder's `WIND_COL`). */
const WIND_RGBA: Record<string, string> = {
  inferno: '255,150,70',
  frost: '222,243,255',
  desert: '226,196,140',
  verdant: '208,236,206',
  void: '200,170,255',
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
}
interface Meteor {
  x: number; // 0..1 lane
  spd: number;
  len: number;
  off: number;
  big: boolean;
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
interface Lantern {
  x: number; // 0..1 along the camp
  ph: number;
  warm: boolean;
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
  let lanterns: Lantern[] = [];
  let windDots: { x: number; y: number; s: number; ph: number }[] = [];
  let shootOff = 0;

  function build(): void {
    const rng = mulberry32(o.seed);
    // Ambient twinkle field — biased to the upper sky but salted across the view.
    stars = Array.from({ length: 46 }, () => ({
      x: rng() * W,
      y: rng() * H * 0.78,
      r: 0.5 + rng() * 1.5,
      ph: rng() * Math.PI * 2,
      blue: rng() < 0.45,
    }));
    shootOff = rng() * 6000;
    // Meteor lanes (a handful of big fireballs among the streaks).
    meteors = Array.from({ length: 14 }, (_, i) => ({
      x: rng(),
      spd: 0.55 + rng() * 1.0,
      len: 26 + rng() * 46,
      off: rng(),
      big: i < 3,
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
    // Trade-camp lantern string along the horizon.
    lanterns = Array.from({ length: 22 }, (_, i) => ({ x: i / 21, ph: rng() * Math.PI * 2, warm: rng() < 0.8 }));
    windDots = Array.from({ length: 90 }, () => ({ x: rng() * (W + 40), y: rng() * (H + 40), s: 0.6 + rng() * 0.9, ph: rng() * 6.28 }));
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
    } else if (effect === 'spaceJunk') {
      ctx.fillStyle = 'rgba(40,44,54,0.10)';
      ctx.fillRect(0, 0, W, H);
    } else if (effect === 'tradeMarket') {
      const g = ctx.createLinearGradient(0, H, 0, H * 0.55);
      g.addColorStop(0, 'rgba(120,80,30,0.18)');
      g.addColorStop(1, 'rgba(120,80,30,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }
    // solarStorm tints as an edge vignette inside its own draw (centre stays clear).
  }

  function drawStars(ctx: CanvasRenderingContext2D, now: number): void {
    if (!spaceOn) return;
    ctx.save();
    for (const s of stars) {
      const a = 0.2 + 0.55 * (0.5 + 0.5 * Math.sin(now * 0.003 + s.ph));
      if (s.r > 1.05) {
        ctx.globalAlpha = a * 0.22;
        ctx.fillStyle = s.blue ? '#bcd6ff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 2.6, 0, Math.PI * 2);
        ctx.fill();
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

  function drawWind(ctx: CanvasRenderingContext2D, now: number): void {
    if (!windOn || o.windSpd < 2) return;
    const [dx, dy] = windDir;
    const intensity = Math.min(1, (o.windSpd - 2) / 26);
    const count = Math.round(14 + intensity * 66);
    const drift = now * 0.001 * (20 + intensity * 130);
    const wW = W + 40;
    const wH = H + 40;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const p = windDots[i]!;
      const t = drift * p.s;
      const x = wrap(p.x + dx * t, wW) - 20;
      const y = wrap(p.y + dy * t, wH) - 20;
      const a = (0.08 + intensity * 0.18) * (0.6 + 0.4 * Math.sin(now * 0.004 + p.ph));
      const L = (3 + intensity * 13) * (0.6 + p.s);
      ctx.strokeStyle = `rgba(${windCol},${a.toFixed(3)})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx * L, y - dy * L);
      ctx.stroke();
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

  function drawMeteors(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const m of meteors) {
      const t = ((m.off + now * 0.00016 * (0.5 + m.spd)) % 1.32) - 0.12;
      if (t < 0) continue;
      const x = m.x * (W + 120) - 60 - t * W * 0.42;
      const y = t * (H + 80) - 40;
      const a = Math.min(1, t * 3) * Math.min(1, (1.2 - t) * 3);
      if (a <= 0.01) continue;
      const tx = x - m.len * 0.66;
      const ty = y - m.len;
      const lw = m.big ? 2.6 : 1.5;
      const grad = ctx.createLinearGradient(tx, ty, x, y);
      grad.addColorStop(0, `rgba(255,210,150,0)`);
      grad.addColorStop(0.6, `rgba(255,224,170,${(0.5 * a).toFixed(3)})`);
      grad.addColorStop(1, `rgba(255,245,225,${(0.9 * a).toFixed(3)})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      // Glowing head.
      const hr = m.big ? 3.4 : 2;
      const hg = ctx.createRadialGradient(x, y, 0, x, y, hr * 3);
      hg.addColorStop(0, `rgba(255,255,250,${(0.95 * a).toFixed(3)})`);
      hg.addColorStop(0.4, `rgba(255,225,180,${(0.5 * a).toFixed(3)})`);
      hg.addColorStop(1, 'rgba(255,210,150,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y, hr * 3, 0, Math.PI * 2);
      ctx.fill();
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

  function drawDebris(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
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

  function drawTradeCamp(ctx: CanvasRenderingContext2D, now: number): void {
    // A distant caravan pitched on the horizon: a warm ground glow, a row of dome tents in
    // silhouette, and a swaying string of lanterns. Screen-fixed — it never swings under the cam.
    const hy = H * 0.84;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(W * 0.5, hy, 0, W * 0.5, hy, W * 0.55);
    glow.addColorStop(0, 'rgba(255,180,90,0.16)');
    glow.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, hy - H * 0.3, W, H * 0.3 + 4);
    ctx.restore();
    ctx.save();
    // Dome tents.
    ctx.fillStyle = 'rgba(28,22,30,0.78)';
    const tents = 5;
    for (let i = 0; i < tents; i++) {
      const cx = W * (0.18 + (i / (tents - 1)) * 0.64);
      const tw = W * (0.05 + (i % 2) * 0.018);
      const th = tw * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - tw, hy);
      ctx.quadraticCurveTo(cx - tw, hy - th, cx, hy - th);
      ctx.quadraticCurveTo(cx + tw, hy - th, cx + tw, hy);
      ctx.closePath();
      ctx.fill();
      // A glowing doorway.
      ctx.fillStyle = `rgba(255,190,110,${(0.4 + 0.2 * Math.sin(now * 0.002 + i)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(cx, hy - th * 0.18, tw * 0.22, th * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(28,22,30,0.78)';
    }
    // Swaying lantern string above the camp.
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lanterns) {
      const lx = W * (0.12 + L.x * 0.76);
      const sag = Math.sin(L.x * Math.PI) * 14;
      const ly = hy - H * 0.12 - sag + Math.sin(now * 0.0015 + L.x * 6) * 2;
      const tw = 0.5 + 0.5 * Math.sin(now * 0.003 + L.ph);
      const col = L.warm ? `255,196,${Math.round(110 + tw * 60)}` : `150,210,255`;
      ctx.fillStyle = `rgba(${col},${(0.35 + tw * 0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(lx, ly, 1.6 + tw * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx: CanvasRenderingContext2D, now: number): void {
    tint(ctx);
    drawStars(ctx, now);
    // The meteor shower owns the sky; otherwise the ambient shooting star sweeps through.
    if (effect !== 'meteorShower') drawShootingStar(ctx, now);
    switch (effect) {
      case 'moonlight':
        drawMoon(ctx, now);
        break;
      case 'meteorShower':
        drawMeteors(ctx, now);
        break;
      case 'aurora':
        drawAurora(ctx, now);
        break;
      case 'solarStorm':
        drawSolarStorm(ctx, now);
        break;
      case 'spaceJunk':
        drawDebris(ctx, now);
        break;
      case 'tradeMarket':
        drawTradeCamp(ctx, now);
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
