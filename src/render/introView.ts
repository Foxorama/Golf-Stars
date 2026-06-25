/**
 * Canvas2D loading-intro cinematic (render-only, cosmetic — NOT part of the sim).
 *
 * A self-contained title sequence played as a full-screen overlay on first boot:
 *   1. DRIVE/LOAD  — four golfers walk up a suburban driveway and pitch their bags into
 *                    the boot of a woody station wagon, then pile in.
 *   2. TRANSFORM   — the wheels fold up into the body, the car lifts into a hover and jet
 *                    nozzles slide out of the rear; the daytime suburb fades to a starfield.
 *   3. LAUNCH      — the wagon tips nose-up and rockets off the top of the frame.
 *   4. WRITE       — a comet traces the rocket's smoke into the words GOLF STARS, glowing
 *                    in the starry sky; a beat to read it, then it hands off to the title.
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
}

const BASE_FEEL: IntroFeel = {
  driveMs: 2200,
  loadMs: 1500,
  transformMs: 1500,
  launchMs: 1300,
  writeMs: 2200,
  holdMs: 1100,
  speed: 1,
  starCount: 150,
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

/**
 * Mount the intro as a fixed, full-screen overlay on <body>. The host app renders the
 * title screen underneath first (so the page has actually "booted"); this just covers it
 * until the sequence finishes or is skipped, then removes itself.
 */
export function mountIntro(opts: IntroOptions = {}): IntroHandle {
  const F = feel();

  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-intro', '1');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:#05060f;overflow:hidden;cursor:pointer;';

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

  // Pre-scatter the starfield in design space (deterministic).
  const rng = mulberry32(0x901f);
  const stars = Array.from({ length: F.starCount }, () => ({
    x: rng() * DW,
    y: rng() * (DH * 0.78),
    r: 0.5 + rng() * 1.6,
    tw: rng() * Math.PI * 2, // twinkle phase
  }));

  // Phase boundaries (cumulative ms).
  const t0 = F.driveMs;
  const t1 = t0 + F.loadMs;
  const t2 = t1 + F.transformMs;
  const t3 = t2 + F.launchMs;
  const t4 = t3 + F.writeMs;
  const t5 = t4 + F.holdMs;

  let raf = 0;
  let start = 0;
  let finished = false;
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let scale = 1;
  let offX = 0;
  let offY = 0;

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

  function drawSky(dayA: number, spaceA: number): void {
    if (!ctx) return;
    // Space gradient underneath, always.
    const sp = ctx.createLinearGradient(0, 0, 0, DH);
    sp.addColorStop(0, '#0a0f2a');
    sp.addColorStop(0.6, '#05071a');
    sp.addColorStop(1, '#02030a');
    ctx.fillStyle = sp;
    ctx.fillRect(-offX / scale, -offY / scale, DW + (offX * 2) / scale, DH + (offY * 2) / scale);

    if (spaceA > 0) {
      ctx.save();
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(performance.now() * 0.004 + s.tw);
        ctx.globalAlpha = spaceA * tw;
        ctx.fillStyle = '#eaf2ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (dayA > 0) {
      ctx.save();
      ctx.globalAlpha = dayA;
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#9bdcff');
      sky.addColorStop(1, '#eaf7ff');
      ctx.fillStyle = sky;
      ctx.fillRect(-offX / scale, -offY / scale, DW + (offX * 2) / scale, DH);
      // Sun.
      ctx.fillStyle = 'rgba(255,247,214,0.95)';
      ctx.beginPath();
      ctx.arc(840, 96, 34, 0, Math.PI * 2);
      ctx.fill();
      // A couple of soft clouds.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const [cx, cy, s] of [[180, 110, 1], [560, 70, 0.8]] as const) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, 60 * s, 22 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 46 * s, cy + 6 * s, 44 * s, 18 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 46 * s, cy + 8 * s, 40 * s, 16 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
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

  function drawTitle(reveal: number, glow: number): void {
    if (!ctx) return;
    const text = 'GOLF STARS';
    ctx.save();
    ctx.font = '800 96px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    const tx = DW / 2 - w / 2;
    const ty = 250;

    // Reveal the lettering left-to-right (the rocket "writes" it in smoke).
    const headX = tx + w * reveal;
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx - 30, 0, headX - (tx - 30), DH);
    ctx.clip();
    ctx.shadowColor = 'rgba(255,209,102,0.9)';
    ctx.shadowBlur = 24 + glow * 18;
    const grad = ctx.createLinearGradient(tx, ty - 50, tx, ty + 50);
    grad.addColorStop(0, '#fff1c4');
    grad.addColorStop(1, '#ffb84d');
    ctx.fillStyle = grad;
    ctx.fillText(text, tx, ty);
    ctx.restore();

    // The comet write-head + sparks, riding the reveal edge.
    if (reveal < 1) {
      const now = performance.now();
      // Smoke puffs trailing back from the head.
      for (let i = 0; i < 6; i++) {
        const back = headX - i * 9;
        ctx.globalAlpha = 0.18 * (1 - i / 6);
        ctx.fillStyle = '#dfe6f2';
        ctx.beginPath();
        ctx.arc(back, ty + Math.sin(now * 0.02 + i) * 3, 7 - i, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'rgba(255,236,150,1)';
      ctx.shadowBlur = 26;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(headX, ty, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      for (let i = 0; i < 5; i++) {
        const a = now * 0.02 + (i / 5) * Math.PI * 2;
        ctx.fillStyle = 'rgba(255,206,84,0.9)';
        ctx.beginPath();
        ctx.arc(headX + Math.cos(a) * 12, ty + Math.sin(a) * 12, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Subtitle, fading in with the glow.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = glow;
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
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

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);

      // Day → space crossfade spans transform + launch.
      const space = clamp01((e - t1) / (t3 - t1));
      const dayA = 1 - space;

      drawSky(dayA, space);
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
          const lp = clamp01((e - t2) / F.launchMs);
          wheelRetract = 1;
          jet = 1;
          tilt = easeIn(lp) * 1.4;
          flame = 0.5 + lp * 0.5;
          carY = GROUND_Y - 70 - easeIn(lp) * (GROUND_Y - 70 + 280);
          carX = 520 + lp * 130;
          cs = 1 - lp * 0.45;
        }
        drawCar(carX, carY, cs, tilt, wheelRetract, jet, flame, bootOpen);
      }

      // Title written into the smoke, then held.
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
