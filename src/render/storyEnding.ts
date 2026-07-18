/**
 * The four STORY ENDINGS cinematic (GS-story-endings) — Canvas2D, render-only, a full-screen overlay played
 * after the Jörmungandr finale resolves, one of four ways depending on your PATH (Warden / Herald) and the
 * OUTCOME (win / lose):
 *   'good-win'  — the Wardens win: the serpent shatters into light and dawn breaks across every world saved.
 *   'good-lose' — the Wardens fall: the CROW — the Coil's true prophet — reveals it let you win all along so
 *                 you'd free the World-Eater with the Keystone; the maw opens and swallows the stars.
 *   'cult-win'  — the Herald wins: the serpent uncoils around the galaxy; Ragnarok; the lights go out, one by
 *                 one, into a serene green silence — the Universe devoured.
 *   'cult-lose' — the Herald falls: the Parrot, Driver Dan and Penelope stand victorious in the light while
 *                 you flee, engines busted and smoking, into the dark unmapped zones.
 *
 * Self-contained (own mount / resize / rAF / skip, the `storyFinale.ts` pattern), everything vector-drawn.
 * Skip button / reduced-motion (guarded at the call site) jump to the end. Zero sim rng (a private
 * mulberry32 for the cinematic scatter), no save, no reducer impact — the outcome is already resolved.
 */

export type StoryEndingVariant = 'good-win' | 'good-lose' | 'cult-win' | 'cult-lose';

export interface StoryEndingHandle {
  destroy(): void;
}

const DW = 1000;
const DH = 620;

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

/** Copy for each ending: a title + a subtitle + one line of the speaker's voice (Parrot or the Crow). */
const ENDING_COPY: Record<StoryEndingVariant, { title: string; sub: string; voice: string; voiceCol: string }> = {
  'good-win': {
    title: 'The Universe is Saved',
    sub: 'Jörmungandr falls. The corruption scatters into harmless light, and dawn breaks across every world you crossed.',
    voice: '🦜 "You did it, champion. You actually did it. Every fairway, everywhere, endures another age."',
    voiceCol: '#8fffbe',
  },
  'good-lose': {
    title: 'The World-Eater is Free',
    sub: 'The Crow was never your enemy. It let you win, every round, so YOU would carry the Keystone to the root and open the cage.',
    voice: '🐦‍⬛ "Caw — caw — did you never wonder why it was so EASY, little champion? Thank you. The Long Rest is yours to have given."',
    voiceCol: '#c98adf',
  },
  'cult-win': {
    title: 'Ragnarök',
    sub: 'The serpent uncoils around the galaxy and the lights go out, one by one, into a serene and final green silence. The Universe is devoured.',
    voice: '🐍 "It is done, Herald. The old Game is over. What comes next is rest — endless, perfect, still."',
    voiceCol: '#b0e04f',
  },
  'cult-lose': {
    title: 'The Wardens Prevail',
    sub: 'The Parrot, Driver Dan and Penelope hold the root against you. Engines busted and trailing smoke, you flee into the dark unmapped zones.',
    voice: '🦜 "Go, then. Run to the dark places on no one’s chart. But the galaxy remembers the friend who turned — and the Game endures without you."',
    voiceCol: '#8fb8ff',
  },
};

export function mountStoryEnding(opts: { variant: StoryEndingVariant; onDone?: () => void }): StoryEndingHandle {
  const variant = opts.variant;
  const copy = ENDING_COPY[variant];

  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-story-ending', variant);
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

  const P = { scene: 4600, hold: 2400 };
  const TOTAL = P.scene + P.hold;

  const rng = mulberry32(0x5e0d ^ variant.length ^ (variant.charCodeAt(0) << 8));
  type Star = { x: number; y: number; r: number; tw: number };
  const stars: Star[] = Array.from({ length: 220 }, () => ({ x: rng() * DW, y: rng() * DH, r: 0.4 + rng() * 1.6, tw: rng() * 6.28 }));
  // A scatter of worlds (little planets) for the dawn / devour beats.
  const worlds = Array.from({ length: 9 }, () => ({ x: 120 + rng() * 760, y: 90 + rng() * 300, r: 8 + rng() * 16, hue: rng() }));

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
  overlay.addEventListener('click', () => finish());
  window.addEventListener('keydown', onKey);

  // ── shared bits ──────────────────────────────────────────────────────────────
  function starfield(t: number, a: number, col = '#dfe8ff'): void {
    if (!ctx) return;
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
      ctx.globalAlpha = a * (0.3 + tw * 0.5);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** A little planet. */
  function planet(x: number, y: number, r: number, hue: number, lit: number): void {
    if (!ctx) return;
    const hs = [200, 30, 280, 150, 340];
    const h = hs[(hue * hs.length) | 0]!;
    ctx.fillStyle = `hsl(${h},${40 + lit * 30}%,${18 + lit * 40}%)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.fill();
    if (lit > 0.1) {
      ctx.fillStyle = `hsla(${h},80%,80%,${lit * 0.5})`;
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, 6.283);
      ctx.fill();
    }
  }

  /** The coiled serpent (the ceremony/finale style), `wake`/`rear` shape it. */
  function serpent(t: number, cx: number, cy: number, spread: number, wake: number, dim: number): void {
    if (!ctx) return;
    ctx.globalAlpha = 1 - dim;
    const segs = 30;
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const x = cx - spread / 2 + u * spread;
      const y = cy + Math.sin(u * 6 + t * (0.6 + wake)) * (60 + wake * 30) * (0.4 + u * 0.7);
      const r = lerp(8, 40, u);
      const corr = 0.5 + 0.5 * Math.sin(t * 2.4 + u * 5);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${34 + corr * 40},${80 + corr * 90 + wake * 30},${58 + corr * 30},1)`);
      g.addColorStop(1, `rgba(8,${22 + corr * 18},18,1)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
    }
    // head + eye
    const hx = cx + spread / 2;
    const hy = cy + Math.sin(6 + t * (0.6 + wake)) * (60 + wake * 30) * 1.1;
    const hr = 44;
    const hg = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, hr * 0.2, hx, hy, hr);
    hg.addColorStop(0, `rgba(50,${110 + wake * 40},80,1)`);
    hg.addColorStop(1, 'rgba(8,26,20,1)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,255,225,0.95)';
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 0.5, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = `rgba(255,140,60,${0.7 + 0.3 * Math.sin(t * 6)})`;
    ctx.beginPath();
    ctx.ellipse(hx, hy, hr * 0.1, hr * 0.4, 0, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The Crow — the Coil's true prophet, the dark mirror of the Parrot. A great black bird with a pale
   *  bone beak + a single burning eye; wings spread `spread` 0..1. */
  function crow(t: number, cx: number, cy: number, sc: number, spread: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    // wings
    const flap = Math.sin(t * 2) * 0.2 * spread;
    ctx.fillStyle = '#0a0a12';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * (0.5 + flap) * spread);
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(s * 120 * spread, -30, s * 180 * spread, 20);
      ctx.quadraticCurveTo(s * 110 * spread, 30, 0, 30);
      ctx.closePath();
      ctx.fill();
      // feather tips
      ctx.strokeStyle = '#1a1a26';
      ctx.lineWidth = 2;
      for (let k = 1; k <= 4; k++) {
        ctx.beginPath();
        ctx.moveTo(s * 60 * spread, 4);
        ctx.lineTo(s * (120 + k * 14) * spread, 20 + k * 5);
        ctx.stroke();
      }
      ctx.restore();
    }
    // body
    ctx.fillStyle = '#0c0c16';
    ctx.beginPath();
    ctx.ellipse(0, 20, 34, 52, 0, 0, 6.283);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(0, -26, 26, 0, 6.283);
    ctx.fill();
    // pale bone beak
    ctx.fillStyle = '#c9c2a8';
    ctx.beginPath();
    ctx.moveTo(18, -30);
    ctx.lineTo(58, -22);
    ctx.lineTo(18, -14);
    ctx.closePath();
    ctx.fill();
    // the burning eye
    const eg = ctx.createRadialGradient(6, -30, 1, 6, -30, 12);
    eg.addColorStop(0, 'rgba(255,220,120,1)');
    eg.addColorStop(0.5, `rgba(220,120,60,${0.7 + 0.3 * Math.sin(t * 5)})`);
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(6, -30, 12, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#2a1206';
    ctx.beginPath();
    ctx.arc(6, -30, 3.4, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  /** A small golfer + parrot silhouette group (the Wardens victorious). */
  function wardens(t: number, cx: number, cy: number): void {
    if (!ctx) return;
    // three lit figures
    const cols = ['#37a05a', '#e0883a', '#19b2a6']; // parrot green / dan orange / penelope teal
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 70;
      const bob = Math.sin(t * 2 + i) * 3;
      // halo
      const hg = ctx.createRadialGradient(x, cy - 30 + bob, 4, x, cy - 30 + bob, 60);
      hg.addColorStop(0, `${cols[i]}88`);
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, cy - 30 + bob, 60, 0, 6.283);
      ctx.fill();
      // body
      ctx.fillStyle = cols[i]!;
      ctx.beginPath();
      ctx.ellipse(x, cy + bob, 16, 40, 0, 0, 6.283);
      ctx.fill();
      // head
      ctx.fillStyle = '#e8c6a0';
      ctx.beginPath();
      ctx.arc(x, cy - 46 + bob, 12, 0, 6.283);
      ctx.fill();
    }
  }

  /** The player's busted ship trailing smoke, fleeing. `x` sweeps it out toward the dark. */
  function bustedShip(t: number, x: number, y: number): void {
    if (!ctx) return;
    // smoke trail
    for (let i = 0; i < 14; i++) {
      const px = x + 30 + i * 16 + Math.sin(t * 3 + i) * 4;
      const py = y + Math.sin(t * 2 + i) * 6;
      ctx.fillStyle = `rgba(90,90,100,${0.4 * (1 - i / 14)})`;
      ctx.beginPath();
      ctx.arc(px, py, 6 + i * 1.5, 0, 6.283);
      ctx.fill();
    }
    // hull (battered)
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#3a4150';
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(20, -12);
    ctx.lineTo(28, 0);
    ctx.lineTo(20, 12);
    ctx.closePath();
    ctx.fill();
    // sparks / broken bits
    ctx.fillStyle = `rgba(255,160,60,${0.6 + 0.4 * Math.sin(t * 12)})`;
    ctx.beginPath();
    ctx.arc(-20 + Math.sin(t * 20) * 3, Math.cos(t * 18) * 3, 3, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  function captionBlock(a: number): void {
    if (!ctx) return;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd6';
    ctx.font = '800 44px Georgia, "Times New Roman", serif';
    ctx.fillText(copy.title, DW / 2, DH - 150);
    ctx.fillStyle = '#c2ccda';
    ctx.font = '400 17px system-ui, sans-serif';
    wrap(copy.sub, DW / 2, DH - 116, 720, 23);
    ctx.fillStyle = copy.voiceCol;
    ctx.font = 'italic 500 16px Georgia, serif';
    wrap(copy.voice, DW / 2, DH - 58, 760, 21);
    ctx.globalAlpha = 1;
  }
  function wrap(text: string, cx: number, y: number, maxW: number, lh: number): void {
    if (!ctx) return;
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
  }

  function frame(now: number): void {
    if (finished || !ctx) return;
    if (!start) start = now;
    const e = now - start;
    const t = e / 1000;
    const sp = clamp01(e / P.scene); // scene progress
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    if (variant === 'good-win') {
      // dawn sweeps up from the bottom; the serpent shatters into light; worlds brighten.
      const dawn = ctx.createLinearGradient(0, DH, 0, 0);
      dawn.addColorStop(0, `rgba(255,${180 + sp * 40},120,${0.25 + sp * 0.35})`);
      dawn.addColorStop(0.5, `rgba(120,180,255,${0.1 + sp * 0.2})`);
      dawn.addColorStop(1, '#060814');
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, DW, DH);
      ctx.fillStyle = dawn;
      ctx.fillRect(0, 0, DW, DH);
      starfield(t, 1 - sp * 0.7);
      // shattering serpent → light shards
      if (sp < 0.5) serpent(t, DW / 2, 300, 500, 0.4, sp * 2);
      const shards = 60;
      for (let i = 0; i < shards; i++) {
        const a = (i / shards) * 6.283;
        const d = sp * (120 + (i % 5) * 60);
        ctx.globalAlpha = clamp01(sp * 2) * (1 - sp);
        ctx.fillStyle = '#bfffe0';
        ctx.beginPath();
        ctx.arc(DW / 2 + Math.cos(a) * d, 300 + Math.sin(a) * d * 0.6, 3, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const w of worlds) planet(w.x, w.y, w.r, w.hue, easeOut(sp));
    } else if (variant === 'good-lose') {
      ctx.fillStyle = '#050307';
      ctx.fillRect(0, 0, DW, DH);
      starfield(t, clamp01(1 - sp * 1.3));
      // the maw — a growing black hole swallowing the stars
      const maw = sp * 360;
      const mg = ctx.createRadialGradient(DW / 2, 280, 4, DW / 2, 280, maw + 40);
      mg.addColorStop(0, '#000');
      mg.addColorStop(0.7, 'rgba(20,8,26,0.9)');
      mg.addColorStop(1, `rgba(120,60,140,${0.3 * (1 - sp)})`);
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(DW / 2, 280, maw + 40, 0, 6.283);
      ctx.fill();
      // the keystone burning at the maw's lip
      ctx.strokeStyle = `rgba(240,200,110,${0.6 * (1 - sp * 0.5)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(DW / 2, 280, maw * 0.5 + 30, 0, 6.283);
      ctx.stroke();
      // the Crow descends + spreads, cackling
      crow(t, DW / 2, lerp(120, 250, easeOut(sp)), 0.7 + sp * 0.7, easeInOut(sp));
    } else if (variant === 'cult-win') {
      ctx.fillStyle = '#040806';
      ctx.fillRect(0, 0, DW, DH);
      // the serpent uncoils around the galaxy; stars go OUT one by one
      const out = Math.floor(sp * stars.length);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]!;
        if (i < out) continue; // extinguished
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
        ctx.globalAlpha = 0.3 + tw * 0.4;
        ctx.fillStyle = '#9fe0b0';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // green stillness wash rising
      const still = ctx.createRadialGradient(DW / 2, 300, 30, DW / 2, 300, 500);
      still.addColorStop(0, `rgba(60,${140 + sp * 40},90,${0.1 + sp * 0.22})`);
      still.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = still;
      ctx.fillRect(0, 0, DW, DH);
      serpent(t, DW / 2, 300, lerp(500, 820, sp), 0.5 + sp * 0.5, 0);
    } else {
      // cult-lose: Wardens in light; the player's busted ship flees into the dark
      const g = ctx.createLinearGradient(0, 0, DW, 0);
      g.addColorStop(0, '#0a1622');
      g.addColorStop(0.5, '#0c1a12');
      g.addColorStop(1, '#020204');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, DW, DH);
      starfield(t, 0.5);
      // light on the left (Warden root), dark on the right (unmapped zones)
      const lg = ctx.createRadialGradient(300, 300, 30, 300, 300, 460);
      lg.addColorStop(0, 'rgba(150,200,255,0.22)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, DW, DH);
      wardens(t, 300, 340);
      // the ship sweeps right, out of frame, into the dark
      bustedShip(t, lerp(560, 900, easeInOut(sp)), lerp(300, 210, sp));
    }

    // caption block — fades in over the back half of the scene, holds through the end
    const capA = e < P.scene * 0.45 ? 0 : easeOut(clamp01((e - P.scene * 0.45) / (P.scene * 0.55)));
    captionBlock(capA);

    ctx.restore();
    if (e >= TOTAL) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!ctx) {
    finish();
    return { destroy: finish };
  }
  raf = requestAnimationFrame(frame);
  return { destroy: finish };
}

/** The ending variant for a resolved finale (pure). Warden = good, Herald = cult; won/lost splits each. */
export function endingVariant(alignment: 'warden' | 'herald' | undefined, won: boolean): StoryEndingVariant {
  const cult = alignment === 'herald';
  return cult ? (won ? 'cult-win' : 'cult-lose') : won ? 'good-win' : 'good-lose';
}
