/**
 * The FINALE space-battle cinematic (GS-story-yggdrasil) — Canvas2D, render-only (NOT the sim), a
 * full-screen overlay played when you engage the Cthulhu-corrupted Jörmungandr at Yggdrasil's Dark Root.
 * The OUTCOME is resolved deterministically before this runs (`storyFinale.finaleResult`) and passed in as
 * `won`, so the cinematic just plays the matching climax:
 *   APPROACH — your armed ship flies in toward the coiled, eldritch world-serpent.
 *   BREACH   — the ship strafes it with weapon bolts; the corruption flares.
 *   CLIMAX (won)  — the hide cracks, the serpent rears, and a glowing GOLF BALL finisher arcs into its
 *                    great eye; a white nova shatters the serpent into drifting light. "THE SERPENT FALLS."
 *   CLIMAX (lost) — the bolts fizzle on the unbroken hide / a coil sweeps the ship back into the dark.
 *                    "THE HIDE HELD — arm your ship and return."
 *
 * Self-contained (own mount/resize/rAF/skip scaffolding, mirroring `storyIntro.ts`), everything vector-
 * drawn (no asset to 404), skippable (tap / Skip / Esc). Thin imperative "feel" layer — verify eyes-on.
 * Respect reduced-motion at the call site (skip straight to the result).
 */

export interface StoryFinaleHandle {
  destroy(): void;
}

const DW = 1000;
const DH = 600;

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
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const P = { approach: 3000, breach: 3200, climax: 4200, title: 3200 };
const B = {
  approach: P.approach,
  breach: P.approach + P.breach,
  climax: P.approach + P.breach + P.climax,
  title: P.approach + P.breach + P.climax + P.title,
};
const TOTAL = B.title;

export function mountStoryFinale(opts: { won: boolean; onDone?: () => void } = { won: false }): StoryFinaleHandle {
  const won = opts.won;
  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-storyfinale', '1');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#03040a;overflow:hidden;cursor:pointer;';
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

  type Star = { x: number; y: number; r: number; tw: number };
  let stars: Star[] = [];
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

  // The serpent's segment phase offsets (deterministic).
  const segRng = mulberry32(0x5e12);
  const shardRng = mulberry32(0x51a4);
  const shards = Array.from({ length: 60 }, () => ({ a: shardRng() * 6.28, sp: 60 + shardRng() * 260, r: 2 + shardRng() * 5, hue: shardRng() }));

  function scatterStars(): void {
    const sr = mulberry32(0x51a7);
    const area = Math.max(1, (vRight - vLeft) * (vBot - vTop));
    const count = Math.min(700, Math.max(80, Math.round((300 * area) / (DW * DH))));
    stars = Array.from({ length: count }, () => ({
      x: lerp(vLeft, vRight, sr()),
      y: lerp(vTop, vBot, sr()),
      r: 0.5 + sr() * 1.6,
      tw: sr() * 6.28,
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

  // ── drawing (design space) ───────────────────────────────────────────────────

  function drawSpace(t: number, flash: number): void {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, vTop, 0, vBot);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.5, '#0a0716');
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    ctx.fillRect(vLeft, vTop, vRight - vLeft, vBot - vTop);
    // eldritch nebula haze
    const haze = ctx.createRadialGradient(640, 300, 40, 640, 300, 520);
    haze.addColorStop(0, 'rgba(60,200,140,0.14)');
    haze.addColorStop(0.5, 'rgba(90,60,160,0.10)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(vLeft, vTop, vRight - vLeft, vBot - vTop);
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
      ctx.globalAlpha = 0.35 + tw * 0.5;
      ctx.fillStyle = '#dfe8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(vLeft, vTop, vRight - vLeft, vBot - vTop);
    }
  }

  /** The Cthulhu-serpent: a coiled sine body + a great eye head with a tentacle maw. `rear` 0..1 rears it
   *  back (climax), `hurt` 0..1 flares the wounds, `dim` fades it (shatter). */
  function drawSerpent(t: number, rear: number, hurt: number, dim: number): void {
    if (!ctx) return;
    ctx.globalAlpha = 1 - dim;
    const baseY = 320 + rear * 30;
    const amp = 90 - rear * 40;
    // body segments back-to-front
    const segs = 26;
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const x = 250 + u * 640;
      const y = baseY + Math.sin(u * 7 + t * 1.4 + segRng.length) * amp * (0.5 + u * 0.6) - rear * u * 120;
      const r = lerp(10, 44, u); // thin tail → thick head
      const corr = 0.5 + 0.5 * Math.sin(t * 3 + u * 5);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${40 + corr * 40},${90 + corr * 80},${70 + corr * 30},1)`);
      g.addColorStop(1, `rgba(10,${28 + corr * 20},22,1)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
      // wound flare
      if (hurt > 0 && i % 3 === 0) {
        ctx.fillStyle = `rgba(255,${120 + corr * 80},60,${hurt * (0.3 + corr * 0.4)})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, 6.283);
        ctx.fill();
      }
    }
    // head at u=1
    const hx = 250 + 640;
    const hy = baseY + Math.sin(7 + t * 1.4 + segRng.length) * amp * 1.1 - rear * 120;
    // tentacle maw
    ctx.strokeStyle = 'rgba(30,70,55,0.9)';
    ctx.lineWidth = 7;
    for (let k = 0; k < 7; k++) {
      const wig = Math.sin(t * 4 + k) * 12;
      ctx.beginPath();
      ctx.moveTo(hx + 20, hy + 6);
      ctx.quadraticCurveTo(hx + 48 + wig, hy + 20 + k * 6, hx + 70 + wig, hy + 40 + k * 7);
      ctx.stroke();
    }
    // the great eye
    const eyeGlow = ctx.createRadialGradient(hx, hy, 4, hx, hy, 46);
    const ep = 0.6 + 0.4 * Math.sin(t * 4);
    eyeGlow.addColorStop(0, `rgba(180,255,210,${0.9 * (1 - dim)})`);
    eyeGlow.addColorStop(0.4, `rgba(80,${200 + ep * 40},150,${0.7 * (1 - dim)})`);
    eyeGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eyeGlow;
    ctx.beginPath();
    ctx.arc(hx, hy, 46, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = `rgba(6,10,8,${1 - dim})`;
    ctx.beginPath();
    ctx.arc(hx, hy, 22, 0, 6.283);
    ctx.fill();
    // vertical slit pupil
    ctx.fillStyle = `rgba(255,120,60,${(0.8 + 0.2 * Math.sin(t * 6)) * (1 - dim)})`;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 4, 16 - rear * 4, 0, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  // expose the head position for the finisher target
  function headPos(t: number, rear: number): { x: number; y: number } {
    const baseY = 320 + rear * 30;
    const amp = 90 - rear * 40;
    const hy = baseY + Math.sin(7 + t * 1.4 + segRng.length) * amp * 1.1 - rear * 120;
    return { x: 890, y: hy };
  }

  /** The player's ship — a simple swept hull with an ion flame, nose toward the serpent. */
  function drawShip(x: number, y: number, tilt: number, thrust: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // flame
    ctx.fillStyle = `rgba(127,216,255,${0.5 + thrust * 0.4})`;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-26 - 26 * thrust, -5);
    ctx.lineTo(-26 - 40 * thrust, 0);
    ctx.lineTo(-26 - 26 * thrust, 5);
    ctx.closePath();
    ctx.fill();
    // hull
    ctx.fillStyle = '#cfd8e6';
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(-16, -13);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-16, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7fd0ff';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function centeredText(lines: { s: string; size: number; col: string; dy: number }[], alpha: number): void {
    if (!ctx) return;
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of lines) {
      ctx.fillStyle = l.col;
      ctx.font = `800 ${l.size}px system-ui, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 12;
      ctx.fillText(l.s, 500, 300 + l.dy);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  function frame(now: number): void {
    if (!ctx) {
      finish();
      return;
    }
    if (!start) start = now;
    const el = now - start;
    const t = el / 1000;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.translate(offX, offY);
      ctx.scale(scale, scale);

      // phase locals
      let rear = 0;
      let hurt = 0;
      let dim = 0;
      let flash = 0;
      let shipX = 180;
      let shipY = 460;
      let thrust = 0.6;
      const bolts: { x: number; y: number }[] = [];

      if (el < B.approach) {
        const p = easeInOut(clamp01(el / P.approach));
        shipX = lerp(-60, 260, p);
        shipY = lerp(520, 430, p);
        thrust = 0.9;
      } else if (el < B.breach) {
        const p = clamp01((el - B.approach) / P.breach);
        shipX = 260 + Math.sin(p * 8) * 30;
        shipY = 430 + Math.sin(p * 6) * 22;
        thrust = 0.7;
        hurt = won ? p * 0.8 : p * 0.25;
        // strafing bolts
        const n = Math.floor(p * 6);
        for (let i = 0; i < n; i++) {
          const bp = (p * 6 - i) % 1;
          bolts.push({ x: lerp(shipX + 30, 880, bp), y: lerp(shipY, headPos(t, 0).y, bp) });
        }
      } else if (el < B.climax) {
        const p = clamp01((el - B.breach) / P.climax);
        if (won) {
          rear = easeOut(clamp01(p * 1.4));
          hurt = 0.8;
          // finisher golf ball flies in on the second half, then a nova
          if (p > 0.4 && p < 0.72) {
            const bp = (p - 0.4) / 0.32;
            const hp = headPos(t, rear);
            const bx = lerp(280, hp.x, easeOut(bp));
            const by = lerp(430, hp.y, easeOut(bp)) - Math.sin(bp * Math.PI) * 120; // arc
            drawSpaceBallTrail(bx, by, bp);
          }
          if (p >= 0.72) {
            const np = (p - 0.72) / 0.28;
            flash = np < 0.3 ? np / 0.3 : Math.max(0, 1 - (np - 0.3) / 0.7) * 0.6;
            dim = easeOut(np);
          }
          shipX = 280;
          shipY = 430;
        } else {
          // the hide holds: a coil sweeps, the ship is knocked back into the dark
          rear = easeOut(clamp01(p)) * 0.5;
          hurt = Math.max(0, 0.25 - p * 0.25);
          shipX = lerp(260, -40, easeOut(clamp01((p - 0.4) / 0.6)));
          shipY = lerp(430, 560, easeOut(clamp01((p - 0.4) / 0.6)));
          thrust = 0.3;
          dim = 0; // serpent stays
        }
      } else {
        // title
        rear = won ? 1 : 0.4;
        dim = won ? 1 : 0;
        shipX = won ? -80 : -80;
        shipY = 430;
      }

      drawSpace(t, flash);
      if (!(won && el >= B.climax)) drawSerpent(t, rear, hurt, dim);
      // shatter shards on a win climax/title
      if (won && dim > 0.05) {
        const hp = headPos(t, rear);
        for (const sh of shards) {
          const d = sh.sp * dim;
          const x = hp.x + Math.cos(sh.a) * d;
          const y = hp.y + Math.sin(sh.a) * d;
          ctx.globalAlpha = Math.max(0, 1 - dim) * 0.9;
          ctx.fillStyle = sh.hue > 0.5 ? '#9dffce' : '#bfe9ff';
          ctx.beginPath();
          ctx.arc(x, y, sh.r * (1 - dim * 0.5), 0, 6.283);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // bolts
      for (const b of bolts) {
        ctx.strokeStyle = 'rgba(255,180,90,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x - 14, b.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      if (!(won && el >= B.climax)) drawShip(shipX, shipY, won ? -0.15 : 0.25, thrust);

      // title text
      if (el >= B.climax) {
        const tp = clamp01((el - B.climax) / 900);
        if (won) {
          centeredText(
            [
              { s: 'THE SERPENT FALLS', size: 46, col: '#9dffce', dy: -24 },
              { s: 'The universe is saved.', size: 22, col: '#e8f2ff', dy: 24 },
            ],
            tp,
          );
        } else {
          centeredText(
            [
              { s: 'THE HIDE HELD', size: 46, col: '#ff8a6a', dy: -24 },
              { s: 'Arm your ship and return.', size: 22, col: '#e8f2ff', dy: 24 },
            ],
            tp,
          );
        }
      }

      ctx.restore();
    } catch {
      finish();
      return;
    }
    if (el >= TOTAL) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function drawSpaceBallTrail(x: number, y: number, bp: number): void {
    if (!ctx) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 40 * (1 - bp), y + 18 * (1 - bp));
    ctx.lineTo(x, y);
    ctx.stroke();
    const g = ctx.createRadialGradient(x, y, 1, x, y, 12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, 'rgba(180,220,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 6.283);
    ctx.fill();
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return { destroy: finish };
}
