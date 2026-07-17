/**
 * The STORY MODE recruitment cinematic (GS-story-intro) — Canvas2D, render-only (NOT the sim), played as a
 * full-screen overlay after you win the Earth World Tour final and "answer the call", before you arrive at
 * the spaceport clubhouse. The beats (per the story bible):
 *   1. VICTORY  — dusk over the 18th at St Andrews; the champion lifts the trophy, the gallery cheering.
 *   2. SHADOW   — the sky darkens; a vast shadow sweeps the green as the Mothership descends.
 *   3. LAND     — the Mothership hovers on a beam of light; the Prognostic Parrot flies down.
 *   4. THE CALL — the Parrot's recruitment line, typed in: "the Universe needs you… follow me!"
 *   5. ASCEND   — the wagon lifts toward the ship; Earth recedes, the stars take over.
 *   6. TITLE    — "STORY MODE · Chapter One — The Call" forms, then fades to the clubhouse beneath.
 *
 * Self-contained (its own mount/resize/rAF/skip scaffolding, mirroring introView) so the boot intro is
 * untouched. Everything is vector-drawn — no art asset to 404. Skippable (tap / Skip / Esc). Thin/imperative
 * "feel" layer; can't be unit-tested — verify eyes-on. Respect reduced-motion at the call site (skip).
 */

export interface StoryIntroHandle {
  destroy(): void;
}

// Authored in a fixed 1000×600 stage, scaled to fit the viewport (letterboxed).
const DW = 1000;
const DH = 600;
const HORIZON = 360; // the links horizon / where the green meets the sky

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

// Phase durations (ms) and their cumulative boundaries.
const P = { victory: 3000, shadow: 2600, land: 2800, call: 5400, ascend: 3400, title: 2600 };
const B = {
  victory: P.victory,
  shadow: P.victory + P.shadow,
  land: P.victory + P.shadow + P.land,
  call: P.victory + P.shadow + P.land + P.call,
  ascend: P.victory + P.shadow + P.land + P.call + P.ascend,
  title: P.victory + P.shadow + P.land + P.call + P.ascend + P.title,
};
const TOTAL = B.title;

export function mountStoryIntro(opts: { onDone?: () => void } = {}): StoryIntroHandle {
  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-storyintro', '1');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#05070d;overflow:hidden;cursor:pointer;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  overlay.appendChild(canvas);
  const skip = document.createElement('button');
  skip.textContent = 'Skip ▸';
  skip.style.cssText =
    'position:absolute;right:16px;bottom:16px;padding:8px 14px;border-radius:9px;border:1px solid #2a2f3a;' +
    'background:rgba(6,9,15,0.72);color:#cfd6e4;font:600 13px system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(2px);z-index:2;';
  overlay.appendChild(skip);
  document.body.appendChild(overlay);
  const ctx = canvas.getContext('2d');

  type Star = { x: number; y: number; r: number; tw: number; depth: number };
  let stars: Star[] = [];
  // Gallery crowd silhouette bumps behind the green (deterministic).
  const crowdRng = mulberry32(0x6cd0);
  const crowd = Array.from({ length: 46 }, () => ({ x: crowdRng() * DW, r: 8 + crowdRng() * 7, dy: crowdRng() * 8 }));
  // Confetti flecks that burst at the victory beat.
  const confRng = mulberry32(0x0c07);
  const confetti = Array.from({ length: 60 }, () => ({
    x: 300 + confRng() * 400,
    y: 120 + confRng() * 160,
    vx: -40 + confRng() * 80,
    vy: -30 - confRng() * 60,
    col: ['#ffd35a', '#ff6b6b', '#54c8ff', '#7fe0a0', '#e6a24a'][(confRng() * 5) | 0]!,
    rot: confRng() * 6.28,
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
  let vLeft = 0;
  let vRight = DW;
  let vTop = 0;
  let vBot = DH;

  function scatterStars(): void {
    const sr = mulberry32(0x51a7);
    const area = Math.max(1, (vRight - vLeft) * (vBot - vTop));
    const count = Math.min(900, Math.max(60, Math.round((260 * area) / (DW * DH))));
    stars = Array.from({ length: count }, () => ({
      x: lerp(vLeft, vRight, sr()),
      y: lerp(vTop, vBot, sr()),
      r: 0.5 + sr() * 1.7,
      tw: sr() * 6.28,
      depth: sr(),
    }));
  }

  function resize(): void {
    if (!ctx) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = overlay.clientWidth || window.innerWidth;
    cssH = overlay.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
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

  // ── scene drawing (design space) ─────────────────────────────────────────────

  /** Sky gradient morphing dusk → dark → deep space by `space` (0..1) and `dark` (0..1 shadow dimming). */
  function drawSky(space: number, dark: number): void {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, vTop, 0, vBot);
    // dusk palette
    const top = [lerp(46, 6, space), lerp(38, 8, space), lerp(70, 16, space)];
    const mid = [lerp(210, 12, space), lerp(120, 14, space), lerp(120, 30, space)];
    const low = [lerp(250, 8, space), lerp(180, 10, space), lerp(120, 22, space)];
    const d = 1 - dark * 0.55;
    const rgb = (a: number[]): string => `rgb(${(a[0]! * d) | 0},${(a[1]! * d) | 0},${(a[2]! * d) | 0})`;
    g.addColorStop(0, rgb(top));
    g.addColorStop(0.55, rgb(mid));
    g.addColorStop(1, rgb(low));
    ctx.fillStyle = g;
    ctx.fillRect(vLeft, vTop, vRight - vLeft, vBot - vTop);
    // sunset sun sinking as space rises
    if (space < 0.9) {
      const sy = lerp(300, 200, space);
      ctx.globalAlpha = (1 - space) * 0.9 * d;
      const sg = ctx.createRadialGradient(680, sy, 0, 680, sy, 90);
      sg.addColorStop(0, '#fff2c8');
      sg.addColorStop(0.5, '#ffb45a88');
      sg.addColorStop(1, '#ffb45a00');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(680, sy, 90, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawStars(alpha: number, warp: number): void {
    if (!ctx || alpha <= 0) return;
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(performance.now() * 0.004 + s.tw);
      ctx.globalAlpha = alpha * tw;
      ctx.fillStyle = '#eaf2ff';
      if (warp > 0.02) {
        const len = warp * (30 + s.depth * 90);
        ctx.strokeStyle = '#eaf2ff';
        ctx.lineWidth = s.r;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y + len);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The 18th at St Andrews: layered links, the Swilcan-ish burn, a red pin, the stone clubhouse and the
   *  gallery crowd. `alpha` fades the whole ground away as we lift off. */
  function drawLinks(alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.globalAlpha = alpha;
    // sea band on the horizon
    ctx.fillStyle = '#3f6470';
    ctx.fillRect(vLeft, HORIZON - 26, vRight - vLeft, 26);
    // stone clubhouse silhouette, back-right
    ctx.fillStyle = '#2b333e';
    ctx.fillRect(770, HORIZON - 78, 150, 82);
    ctx.beginPath();
    ctx.moveTo(760, HORIZON - 78);
    ctx.lineTo(845, HORIZON - 110);
    ctx.lineTo(930, HORIZON - 78);
    ctx.closePath();
    ctx.fill();
    // gallery crowd — a dark bumpy band along the horizon
    ctx.fillStyle = '#20262f';
    for (const c of crowd) {
      ctx.beginPath();
      ctx.arc(c.x, HORIZON - 4 + c.dy, c.r, Math.PI, 0);
      ctx.fill();
    }
    // fairway/green sward
    const g = ctx.createLinearGradient(0, HORIZON, 0, vBot);
    g.addColorStop(0, '#4f9a3f');
    g.addColorStop(1, '#2f6a28');
    ctx.fillStyle = g;
    ctx.fillRect(vLeft, HORIZON, vRight - vLeft, vBot - HORIZON);
    // the green, a lighter oval
    ctx.fillStyle = '#5fb04a';
    ctx.beginPath();
    ctx.ellipse(500, 500, 360, 70, 0, 0, 6.2832);
    ctx.fill();
    // the pin
    ctx.strokeStyle = '#e8e8ea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(360, 486);
    ctx.lineTo(360, 430);
    ctx.stroke();
    ctx.fillStyle = '#ff5a5a';
    ctx.beginPath();
    ctx.moveTo(360, 430);
    ctx.lineTo(392, 440);
    ctx.lineTo(360, 450);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** A simple golfer figure. `raise` (0..1) lifts a trophy overhead. `carry` drops arms to walk. */
  function golfer(x: number, y: number, s: number, cap: string, raise: number, alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    // legs
    ctx.strokeStyle = '#2b3446';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(-8, -34);
    ctx.moveTo(8, 0);
    ctx.lineTo(8, -34);
    ctx.stroke();
    // torso
    ctx.fillStyle = '#3a7d6e';
    ctx.beginPath();
    ctx.moveTo(-14, -34);
    ctx.quadraticCurveTo(0, -40, 14, -34);
    ctx.lineTo(11, -74);
    ctx.quadraticCurveTo(0, -80, -11, -74);
    ctx.closePath();
    ctx.fill();
    // head
    ctx.fillStyle = '#c99a68';
    ctx.beginPath();
    ctx.arc(0, -88, 11, 0, 6.2832);
    ctx.fill();
    // cap
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(0, -90, 11, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(0, -91, 15, 3);
    // arms: raised overhead when raise>0, else at sides
    ctx.strokeStyle = '#3a7d6e';
    ctx.lineWidth = 7;
    const ax = lerp(16, 6, raise);
    const ay = lerp(-50, -96, raise);
    ctx.beginPath();
    ctx.moveTo(-12, -70);
    ctx.lineTo(-ax, ay);
    ctx.moveTo(12, -70);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    // trophy overhead
    if (raise > 0.05) {
      ctx.globalAlpha = alpha * raise;
      const ty = ay - 14;
      ctx.fillStyle = '#f0c64e';
      ctx.beginPath();
      ctx.moveTo(-10, ty - 16);
      ctx.quadraticCurveTo(-10, ty, 0, ty + 2);
      ctx.quadraticCurveTo(10, ty, 10, ty - 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f0c64e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, ty - 14);
      ctx.quadraticCurveTo(-20, ty - 14, -16, ty - 4);
      ctx.moveTo(10, ty - 14);
      ctx.quadraticCurveTo(20, ty - 14, 16, ty - 4);
      ctx.stroke();
      ctx.fillRect(-2, ty + 2, 4, 6);
      ctx.fillRect(-7, ty + 8, 14, 3);
      // sparkle
      ctx.globalAlpha = alpha * raise * (0.5 + 0.5 * Math.sin(performance.now() * 0.006));
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(0, ty - 8, 3, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The Mothership — a saucer with a lit dome, running lights and a soft underglow. */
  function mothership(cx: number, cy: number, s: number, alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    // underglow
    const ug = ctx.createRadialGradient(0, 22, 0, 0, 22, 150);
    ug.addColorStop(0, 'rgba(120,220,180,0.4)');
    ug.addColorStop(1, 'rgba(120,220,180,0)');
    ctx.fillStyle = ug;
    ctx.beginPath();
    ctx.ellipse(0, 22, 150, 40, 0, 0, 6.2832);
    ctx.fill();
    // hull
    const hg = ctx.createLinearGradient(0, -20, 0, 30);
    hg.addColorStop(0, '#cfe6df');
    hg.addColorStop(1, '#6f8f88');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 8, 128, 34, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = '#48605b';
    ctx.beginPath();
    ctx.ellipse(0, 18, 128, 20, 0, 0, Math.PI);
    ctx.fill();
    // dome
    const dg = ctx.createLinearGradient(0, -44, 0, 4);
    dg.addColorStop(0, '#dff6ff');
    dg.addColorStop(1, '#7fb6c8');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.ellipse(0, 2, 58, 46, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(-18, -18, 16, 12, -0.5, 0, 6.2832);
    ctx.fill();
    // running lights
    for (let i = -3; i <= 3; i++) {
      const lx = i * 34;
      const blink = 0.5 + 0.5 * Math.sin(performance.now() * 0.006 + i);
      ctx.globalAlpha = alpha * (0.4 + 0.6 * blink);
      ctx.fillStyle = ['#ffd35a', '#7fe0a0', '#54c8ff'][((i % 3) + 3) % 3]!;
      ctx.beginPath();
      ctx.arc(lx, 20, 5, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** A tractor beam cone from the ship down to the green. */
  function beam(cx: number, topY: number, botY: number, halfW: number, alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.globalAlpha = alpha * 0.5;
    const g = ctx.createLinearGradient(0, topY, 0, botY);
    g.addColorStop(0, 'rgba(150,240,200,0.55)');
    g.addColorStop(1, 'rgba(150,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 26, topY);
    ctx.lineTo(cx + 26, topY);
    ctx.lineTo(cx + halfW, botY);
    ctx.lineTo(cx - halfW, botY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The Prognostic Parrot — a small green macaw with the pirate's red bandana (matches the caddy art). */
  function parrot(x: number, y: number, s: number, alpha: number, flap: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    // tail
    ctx.fillStyle = '#1f9e5a';
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(26, 26);
    ctx.lineTo(12, 12);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.fillStyle = '#28c46a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 18, 0.2, 0, 6.2832);
    ctx.fill();
    // wing (flaps)
    ctx.save();
    ctx.rotate(-0.3 - 0.5 * flap);
    ctx.fillStyle = '#1fa85a';
    ctx.beginPath();
    ctx.ellipse(-6, -2, 8, 16, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = '#f0c64e';
    ctx.beginPath();
    ctx.ellipse(-6, 6, 5, 9, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    // head
    ctx.fillStyle = '#28c46a';
    ctx.beginPath();
    ctx.arc(2, -18, 10, 0, 6.2832);
    ctx.fill();
    // red bandana
    ctx.fillStyle = '#d23f4f';
    ctx.beginPath();
    ctx.arc(2, -22, 10, Math.PI, 0);
    ctx.fill();
    // beak
    ctx.fillStyle = '#efb43a';
    ctx.beginPath();
    ctx.moveTo(11, -18);
    ctx.lineTo(20, -15);
    ctx.lineTo(11, -12);
    ctx.closePath();
    ctx.fill();
    // eye
    ctx.fillStyle = '#1a120b';
    ctx.beginPath();
    ctx.arc(6, -19, 1.8, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The woody station wagon (a small silhouette lifting toward the ship). */
  function wagon(x: number, y: number, s: number, alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#8a5a2c';
    ctx.beginPath();
    ctx.roundRect?.(-46, -16, 92, 30, 6);
    if (!ctx.roundRect) ctx.rect(-46, -16, 92, 30);
    ctx.fill();
    ctx.fillStyle = '#6e4423';
    ctx.fillRect(-40, -30, 66, 18);
    ctx.fillStyle = '#bfe0ff';
    ctx.fillRect(-36, -27, 26, 13);
    ctx.fillRect(-6, -27, 26, 13);
    // wheels
    ctx.fillStyle = '#1c1712';
    ctx.beginPath();
    ctx.arc(-28, 16, 9, 0, 6.2832);
    ctx.arc(28, 16, 9, 0, 6.2832);
    ctx.fill();
    // jet plume beneath
    const pg = ctx.createLinearGradient(0, 16, 0, 70);
    pg.addColorStop(0, 'rgba(255,200,90,0.9)');
    pg.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(-16, 14);
    ctx.lineTo(16, 14);
    ctx.lineTo(6, 66 + 10 * Math.sin(performance.now() * 0.02));
    ctx.lineTo(-6, 66);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The blue marble Earth (recedes as we climb). */
  function earth(cx: number, cy: number, r: number, alpha: number): void {
    if (!ctx || alpha <= 0) return;
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#7fc0e8');
    g.addColorStop(1, '#1b4a86');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = 'rgba(90,190,120,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.2, cy + r * 0.1, r * 0.4, r * 0.24, 0.4, 0, 6.2832);
    ctx.ellipse(cx + r * 0.35, cy - r * 0.25, r * 0.22, r * 0.16, -0.3, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Cinematic letterbox bars + a subtitle line. */
  function chrome(text: string, textA: number, barA: number): void {
    if (!ctx) return;
    const barH = (vBot - vTop) * 0.09;
    ctx.globalAlpha = barA;
    ctx.fillStyle = '#000';
    ctx.fillRect(vLeft, vTop, vRight - vLeft, barH);
    ctx.fillRect(vLeft, vBot - barH, vRight - vLeft, barH);
    ctx.globalAlpha = 1;
    if (text && textA > 0.01) {
      ctx.globalAlpha = clamp01(textA);
      ctx.fillStyle = '#f2ede0';
      ctx.font = '600 26px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 8;
      // Just above the bottom letterbox bar, centred on the stage. Viewport-space Y so it never overlaps
      // the bar on a tall screen.
      ctx.fillText(text, 500, vBot - barH - 24);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function titleCard(reveal: number): void {
    if (!ctx) return;
    const a = easeOut(clamp01(reveal));
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fe0ff';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText('STORY TOUR', 500, 250 - (1 - a) * 12);
    ctx.fillStyle = '#f6f2e6';
    ctx.font = '800 48px Georgia, serif';
    ctx.shadowColor = '#54c8ff88';
    ctx.shadowBlur = 18;
    ctx.fillText('Chapter One', 500, 300 - (1 - a) * 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cfd6e4';
    ctx.font = 'italic 500 22px Georgia, serif';
    ctx.fillText('The Call', 500, 342 - (1 - a) * 12);
    ctx.globalAlpha = 1;
  }

  // Typed subtitle: reveal `frac` (0..1) of `full`.
  function typed(full: string, frac: number): string {
    const n = Math.round(clamp01(frac) * full.length);
    return full.slice(0, n);
  }

  function frame(now: number): void {
    if (!ctx || finished) return;
    if (!start) start = now;
    const e = now - start;
    if (e >= TOTAL) {
      finish();
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // phase progressions
    const space = e < B.land ? 0 : clamp01((e - B.land) / (B.ascend - B.land)); // ground → space during ascend
    const dark = e < B.victory ? 0 : e < B.land ? clamp01((e - B.victory) / P.shadow) : 1 - clamp01((e - B.land) / 600);
    const warp = e > B.ascend - 900 && e < B.title ? clamp01((e - (B.ascend - 900)) / 900) : e >= B.ascend ? 1 : 0;

    drawSky(space, Math.max(0, dark));
    drawStars(clamp01((space - 0.15) * 1.4), warp * 0.9);

    // ground fades out as we ascend
    const groundA = clamp01(1 - (e - B.land) / (B.ascend - B.land) * 1.2);
    if (e < B.ascend) drawLinks(groundA);

    // confetti at victory
    if (e < B.shadow) {
      const ce = e / 1000;
      for (const c of confetti) {
        const px = c.x + c.vx * ce;
        const py = c.y + c.vy * ce + 60 * ce * ce;
        ctx.globalAlpha = clamp01(1 - ce / 2.6) * groundA;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(c.rot + ce * 4);
        ctx.fillStyle = c.col;
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Mothership descends from top during shadow → hovers during land/call → rises away on ascend
    if (e > B.victory - 200 && e < B.ascend) {
      const descend = clamp01((e - (B.victory - 200)) / (P.shadow + 200));
      const shipY = e < B.land ? lerp(-180, 150, easeInOut(descend)) : e < B.call ? 150 : lerp(150, -260, easeInOut(clamp01((e - B.call) / P.ascend)));
      const shipS = e < B.call ? lerp(0.9, 1, clamp01(descend)) : lerp(1, 0.7, clamp01((e - B.call) / P.ascend));
      mothership(500, shipY, shipS, groundA * 0.5 + 0.5);
      if (e > B.shadow && e < B.call + 400) beam(500, shipY + 30, 470, 120, clamp01((e - B.shadow) / 500) * (1 - clamp01((e - B.call) / 400)));
    }

    // The champion on the green (victory → looks up → boards the wagon at ascend)
    if (e < B.ascend) {
      const raise = e < B.victory ? 1 : clamp01(1 - (e - B.victory) / 700); // lowers the trophy when the shadow falls
      golfer(360, 500, 1.15, '#19b2a6', raise, groundA);
    }

    // The Parrot flies down during land, hovers by the golfer through the call
    if (e > B.shadow && e < B.ascend) {
      const pin = clamp01((e - B.shadow) / P.land);
      const px = lerp(500, 430, easeOut(pin));
      const py = lerp(150, 430, easeOut(pin));
      const flap = 0.5 + 0.5 * Math.sin(now * 0.02);
      parrot(px, py, lerp(1.4, 1.8, pin), groundA, flap);
    }

    // ASCEND: the wagon lifts toward the ship; Earth recedes
    if (e >= B.call && e < B.title) {
      const asc = clamp01((e - B.call) / P.ascend);
      earth(500, lerp(720, 560, asc), lerp(420, 150, easeInOut(asc)), clamp01(asc * 1.4) * (1 - clamp01((e - B.ascend) / 500)));
      wagon(500, lerp(460, 120, easeOut(asc)), lerp(1, 0.7, asc), clamp01((0.15 - Math.abs(asc - 0.35)) * 6 + 0.4));
    }

    // TITLE
    if (e >= B.ascend) titleCard((e - B.ascend) / 900 - 0.0);

    // subtitles per beat
    let sub = '';
    let subA = 1;
    if (e < B.victory) {
      sub = 'World Tour Champion.';
      subA = clamp01(e / 400) * clamp01((B.victory - e) / 500);
    } else if (e < B.land) {
      sub = 'But a shadow falls across the 18th green…';
      subA = clamp01((e - B.victory) / 400) * clamp01((B.land - e) / 500);
    } else if (e < B.call) {
      const line = '"Golfer — you are the best on Earth. Now the Universe needs you."';
      sub = typed(line, (e - B.land) / (P.call * 0.7));
      subA = clamp01((e - B.land) / 300);
    } else if (e < B.ascend) {
      const line = '"Gather your friends… and follow me!"';
      sub = typed(line, (e - B.call) / (P.ascend * 0.55));
      subA = clamp01((e - B.call) / 200) * clamp01((B.ascend - e) / 500);
    }
    const barA = e < 500 ? clamp01(e / 500) : e > TOTAL - 500 ? clamp01((TOTAL - e) / 500) : 1;
    ctx.restore();
    // chrome drawn in stage space too (after restore we re-enter for text centering)
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    chrome(sub, subA, barA * 0.85);
    ctx.restore();

    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return { destroy: finish };
}
