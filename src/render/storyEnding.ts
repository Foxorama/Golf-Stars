/**
 * The four STORY ENDINGS cinematic (GS-story-endings) — Canvas2D, render-only, a full-screen overlay played
 * after the Jörmungandr finale resolves, one of four ways depending on your PATH (Warden / Herald) and the
 * OUTCOME (win / lose):
 *   'good-win'  — the Wardens win (THE RESEAL, GS-story-reseal-tree): a longer, WORDLESS three-beat sequence —
 *                 the serpent is sung back to SLEEP and the golden seal LOCKS over its coils; then YGGDRASIL,
 *                 the World-Tree, grows up around it (a luminous trunk + canopy behind, roots cradling in
 *                 front, the saved worlds lit as star-fruit); and it HOLDS as dawn breaks while the Coil's
 *                 last wyrm-ship (the lost friend aboard) jets away to THE DESTINATION (GS-story-unending-
 *                 tease — the named unknown deep a future mode will open). The narrative TEXT is not baked
 *                 over the art — it's the readable RECAP this cinematic dismisses onto (advance when read).
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

import { paintSerpent } from './sigilCeremony';

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

// ── YGGDRASIL (GS-story-reseal-tree) — the World-Tree that grows up around the sleeping serpent in the
//    Reseal ending. A recursively-branched skeleton, pre-built once (deterministic, private rng) at mount:
//    a luminous trunk + CANOPY rising behind the settled coils, and a root system that curls in FRONT to
//    cradle the beast. Each segment carries a reveal window [t0,t1] over the growth 0..1 so the tree
//    unfurls trunk-first, tips-last. Star-blossoms (the worlds you saved, hung as fruit) light at the tips.
interface TBranch {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  t0: number;
  t1: number;
  depth: number;
}
interface TBloss {
  x: number;
  y: number;
  t0: number;
  r: number;
  hue: number;
}
interface TFoliage {
  x: number;
  y: number;
  t0: number;
  r: number;
}
interface Yggdrasil {
  canopy: TBranch[];
  canopyBloss: TBloss[];
  foliage: TFoliage[];
  roots: TBranch[];
  rootBloss: TBloss[];
}

function buildYggdrasil(rand: () => number): Yggdrasil {
  const canopy: TBranch[] = [];
  const canopyBloss: TBloss[] = [];
  const foliage: TFoliage[] = [];
  const roots: TBranch[] = [];
  const rootBloss: TBloss[] = [];
  const grow = (
    x: number,
    y: number,
    ang: number,
    len: number,
    depth: number,
    t0: number,
    tSpan: number,
    arr: TBranch[],
    bloss: TBloss[],
    maxD: number,
    wrap: boolean,
  ): void => {
    // Roots curl toward the beast's midline so the tendrils embrace it (a gravity-like inward drift).
    const drift = wrap ? (x < 500 ? 1 : -1) * 0.4 : 0;
    const a = ang + drift;
    const x1 = x + Math.cos(a) * len;
    const y1 = y + Math.sin(a) * len;
    const w = Math.max(1.4, (wrap ? 8 : 14) * Math.pow(0.72, depth));
    arr.push({ x0: x, y0: y, x1, y1, w, t0, t1: t0 + tSpan * 0.5, depth });
    // Canopy foliage — soft leaf-mass blobs seed from the mid-canopy outward, giving the crown volume.
    if (!wrap && depth >= 2) foliage.push({ x: x1, y: y1, t0: t0 + tSpan * 0.35, r: len * (0.7 + rand() * 0.5) });
    if (depth >= maxD || len < (wrap ? 22 : 15)) {
      bloss.push({ x: x1, y: y1, t0: t0 + tSpan * 0.42, r: 3 + rand() * 3.6, hue: rand() });
      return;
    }
    const kids = 2 + (rand() < 0.5 ? 1 : 0);
    const cs = t0 + tSpan * 0.4;
    const csp = tSpan * 0.62;
    const spread = wrap ? 0.4 : 0.6;
    for (let i = 0; i < kids; i++) {
      const f = kids === 1 ? 0 : i / (kids - 1) - 0.5;
      const a2 = a + f * spread * 2 + (rand() - 0.5) * 0.26;
      grow(x1, y1, a2, len * (0.68 + rand() * 0.14), depth + 1, cs, csp, arr, bloss, maxD, wrap);
    }
  };
  // TRUNK + CANOPY — a stout trunk up from the base, forking into a broad, high crown.
  grow(500, 606, -Math.PI / 2, 172, 0, 0, 1, canopy, canopyBloss, 5, false);
  // ROOTS — tendrils fanning UP and OUT from the base, curling inward to CRADLE the sleeping coils.
  for (const a of [-2.62, -2.18, -0.96, -0.52]) grow(500, 560, a, 124, 0, 0.3, 0.66, roots, rootBloss, 3, true);
  return { canopy, canopyBloss, foliage, roots, rootBloss };
}

/** Star-blossom palette (the saved worlds hung in the canopy as fruit). */
const BLOSS_HUE: [number, number, number][] = [
  [150, 235, 175],
  [240, 212, 110],
  [120, 200, 255],
  [232, 140, 200],
  [180, 240, 150],
];

/** Copy for each ending: a title + a subtitle + one line of the speaker's voice (Parrot or the Crow).
 *  `{betrayer}` (GS-story-unending-tease) resolves at mount to the campaign's actual odd-one-out. */
const ENDING_COPY: Record<StoryEndingVariant, { title: string; sub: string; voice: string; voiceCol: string }> = {
  'good-win': {
    // GS-story-unending-tease: the Reseal does not KILL the World-Eater — it sings it back to SLEEP. And
    // the victory is left one friend short: the betrayer and the Coil's remnant flee past every chart,
    // to THE DESTINATION (the named unknown deep — a future mode's front door), so redeeming them is a
    // voyage the galaxy cannot yet make.
    title: 'The Reseal',
    sub:
      'Jörmungandr does not die. It sleeps — resealed beneath the root, dreaming of nothing, while dawn breaks ' +
      'across every world you crossed. And ahead of the dawn one dark sail runs for open night: {betrayer}, and ' +
      'what remains of the Coil, fleeing for The Destination.',
    voice:
      '🦜 "Let it sleep, champion. We saved everything… and I still count us one short. {betrayer} is out past ' +
      'every chart I can read now — gone to The Destination, the deep with no fairways in it yet. When you\'re ' +
      'ready to fly that far to bring a friend home — so am I."',
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

export function mountStoryEnding(opts: {
  variant: StoryEndingVariant;
  /** GS-story-unending-tease: the betrayed friend's short-name — fills the `{betrayer}` token in the
   *  good-win copy (the one who flees with the Coil). Absent → a generic "your lost friend". */
  betrayerName?: string;
  onDone?: () => void;
}): StoryEndingHandle {
  const variant = opts.variant;
  const raw = ENDING_COPY[variant];
  const fill = (s: string): string => s.replaceAll('{betrayer}', opts.betrayerName ?? 'your lost friend');
  const copy = { ...raw, title: fill(raw.title), sub: fill(raw.sub), voice: fill(raw.voice) };

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

  // GS-story-reseal-tree: the Reseal ending runs LONGER — the seal applies, then Yggdrasil grows up around
  // the sleeping serpent, and it holds so the moment can land — before dismissing to the readable recap.
  const good = variant === 'good-win';
  const P = good ? { scene: 7200, hold: 2800 } : { scene: 4600, hold: 2400 };
  const TOTAL = P.scene + P.hold;

  const rng = mulberry32(0x5e0d ^ variant.length ^ (variant.charCodeAt(0) << 8));
  type Star = { x: number; y: number; r: number; tw: number };
  const stars: Star[] = Array.from({ length: 220 }, () => ({ x: rng() * DW, y: rng() * DH, r: 0.4 + rng() * 1.6, tw: rng() * 6.28 }));
  // A scatter of worlds (little planets) for the dawn / devour beats.
  const worlds = Array.from({ length: 9 }, () => ({ x: 120 + rng() * 760, y: 90 + rng() * 300, r: 8 + rng() * 16, hue: rng() }));
  // The World-Tree skeleton, pre-built once (own private rng, so it never perturbs the star/world scatter).
  const tree: Yggdrasil | null = good ? buildYggdrasil(mulberry32(0x9a7cf1)) : null;

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

  /** The world-serpent — the SAME mythic constellation beast the teasers and the battle draw
   *  (GS-story-serpent-2: one painter everywhere, no more bead-chain stand-in). `sleep` 0..1
   *  (GS-story-unending-tease) settles it: the sway stills, the body sinks, the eye + jaw slide shut
   *  and the constellation dims — the Reseal sings it back to sleep, it never shatters. */
  function serpent(t: number, cx: number, cy: number, spread: number, wake: number, dim: number, sleep = 0): void {
    if (!ctx) return;
    ctx.globalAlpha = 1 - dim;
    paintSerpent(ctx, cx, cy, t, wake, 0, { spread, sleep });
    ctx.globalAlpha = 1;
  }

  /** GS-story-unending-tease: the Coil's last wyrm-ship, running dark ahead of the dawn — a small
   *  serpent-hulled craft streaking up and out of frame toward The Destination, venom-green engine
   *  trail fading behind it. `p` 0..1 sweeps the whole flight. */
  function coilShipFlees(t: number, p: number): void {
    if (!ctx || p <= 0) return;
    const x = lerp(520, DW + 80, easeInOut(p));
    const y = lerp(330, 60, easeInOut(p));
    const ang = Math.atan2(60 - 330, DW + 80 - 520);
    // engine trail — venom-green motes strung out behind the hull
    for (let i = 1; i <= 16; i++) {
      const d = i * 14;
      const px = x - Math.cos(ang) * d + Math.sin(t * 3 + i) * 2;
      const py = y - Math.sin(ang) * d + Math.cos(t * 2.4 + i) * 2;
      ctx.fillStyle = `rgba(127,224,160,${0.38 * (1 - i / 16) * clamp01(p * 3)})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + i * 0.7, 0, 6.283);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // serpent hull — a dark scaled sliver with a coiled tail fin
    ctx.fillStyle = '#241832';
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.quadraticCurveTo(8, -10, -22, -6);
    ctx.quadraticCurveTo(-30, 0, -22, 6);
    ctx.quadraticCurveTo(8, 10, 30, 0);
    ctx.closePath();
    ctx.fill();
    // scale glints
    ctx.fillStyle = 'rgba(176,96,192,0.5)';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(-10 + k * 9, (k % 2 ? 3 : -3) * 0.8, 1.6, 0, 6.283);
      ctx.fill();
    }
    // the coiled tail
    ctx.strokeStyle = '#3a2450';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-26, 0, 6, 0.6, 5.2);
    ctx.stroke();
    // engine flare
    ctx.fillStyle = `rgba(160,255,200,${0.75 + 0.25 * Math.sin(t * 14)})`;
    ctx.beginPath();
    ctx.ellipse(-30, 0, 8 + Math.sin(t * 12) * 2, 3.4, 0, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  // ── YGGDRASIL painters (GS-story-reseal-tree) — draw the pre-built skeleton, revealed by `grow` 0..1. ──
  /** Draw a set of branches, each unfurling over its own reveal window. `warm` tints the bark (trunk brown
   *  → luminous emerald-gold at the tips), `glow` scales the aura. */
  function drawTree(arr: TBranch[], grow: number, glow: number): void {
    if (!ctx) return;
    ctx.lineCap = 'round';
    for (const b of arr) {
      const span = Math.max(0.0001, b.t1 - b.t0);
      const rev = clamp01((grow - b.t0) / span);
      if (rev <= 0) continue;
      const ex = lerp(b.x0, b.x1, easeOut(rev));
      const ey = lerp(b.y0, b.y1, easeOut(rev));
      // luminous aura underlay
      ctx.strokeStyle = `rgba(130,220,160,${0.1 * glow})`;
      ctx.lineWidth = b.w + 4;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // bark — warm gold-brown heartwood low, brightening to living gold-green out at the twigs
      const lit = Math.min(1, b.depth * 0.22);
      const r = Math.round(96 + lit * 70);
      const g = Math.round(72 + lit * 150);
      const bl = Math.round(40 + lit * 60);
      ctx.strokeStyle = `rgb(${r},${g},${bl})`;
      ctx.lineWidth = b.w;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y0);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // a bright grain highlight down one side of the thicker limbs
      if (b.w > 3) {
        ctx.strokeStyle = `rgba(200,255,210,${0.28 * glow})`;
        ctx.lineWidth = Math.max(0.8, b.w * 0.28);
        ctx.beginPath();
        ctx.moveTo(b.x0, b.y0 - b.w * 0.22);
        ctx.lineTo(ex, ey - b.w * 0.22);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }
  /** Canopy foliage — soft luminous leaf-masses that give the crown volume, unfurling with the growth. */
  function foliage(arr: TFoliage[], grow: number, glow: number, t: number): void {
    if (!ctx) return;
    for (const f of arr) {
      const rev = clamp01((grow - f.t0) / 0.3);
      if (rev <= 0) continue;
      const breathe = 0.92 + 0.08 * Math.sin(t * 1.3 + f.x * 0.02);
      const rr = f.r * rev * breathe;
      const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, rr);
      g.addColorStop(0, `rgba(140,235,165,${0.3 * glow * rev})`);
      g.addColorStop(0.55, `rgba(74,182,116,${0.2 * glow * rev})`);
      g.addColorStop(1, 'rgba(20,80,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, rr, 0, 6.283);
      ctx.fill();
    }
  }
  /** Star-blossoms — the saved worlds hung in the tree as glowing fruit, lit as the growth reaches them. */
  function blossoms(arr: TBloss[], grow: number, glow: number, t: number): void {
    if (!ctx) return;
    for (const bl of arr) {
      const rev = clamp01((grow - bl.t0) / 0.16);
      if (rev <= 0) continue;
      const hue = BLOSS_HUE[(bl.hue * BLOSS_HUE.length) | 0]!;
      const [hr, hg, hb] = hue;
      const tw = 0.6 + 0.4 * Math.sin(t * 2.6 + bl.x * 0.05 + bl.y * 0.03);
      const a = rev * glow * (0.6 + 0.4 * tw);
      const rr = bl.r * (0.65 + 0.35 * rev);
      const gr = ctx.createRadialGradient(bl.x, bl.y, 0.5, bl.x, bl.y, rr * 3.6);
      gr.addColorStop(0, `rgba(${hr},${hg},${hb},${0.8 * a})`);
      gr.addColorStop(0.4, `rgba(${hr},${hg},${hb},${0.28 * a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, rr * 3.6, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,246,${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, rr * 0.7, 0, 6.283);
      ctx.fill();
    }
  }
  /** The applied SEAL — a golden bind-rune ring seated over the sleeping coils, brightening as it locks;
   *  `seat` 0..1 is how set the seal is, `flash` a one-shot bloom when it seizes. */
  function sealSigil(cx: number, cy: number, seat: number, flash: number, t: number): void {
    if (!ctx || seat <= 0) return;
    const R = 150;
    const spin = t * 0.25;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.42); // seat the rune flat over the coils
    // the lock bloom
    if (flash > 0.01) {
      const fg = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.8);
      fg.addColorStop(0, `rgba(255,240,190,${0.5 * flash})`);
      fg.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.8, 0, 6.283);
      ctx.fill();
    }
    ctx.rotate(spin);
    const a = 0.2 + seat * 0.55;
    // twin rings
    for (const rr of [R, R * 0.72]) {
      ctx.strokeStyle = `rgba(244,206,120,${a})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, 6.283);
      ctx.stroke();
    }
    // bind-runes around the ring
    ctx.strokeStyle = `rgba(255,232,160,${a})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * 6.283;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(c * R * 0.72, s * R * 0.72);
      ctx.lineTo(c * R, s * R);
      ctx.stroke();
    }
    ctx.restore();
  }
  /** The Reseal title, laid cleanly at the TOP of the frame — clear of the tree + serpent (the readable
   *  narrative is the recap that follows). Fades in late, once the tree has taken. */
  function titleCard(a: number): void {
    if (!ctx || a <= 0) return;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd6';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 14;
    ctx.font = '800 46px Georgia, "Times New Roman", serif';
    ctx.fillText(copy.title, DW / 2, 74);
    ctx.shadowBlur = 0;
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
    // Flow the block bottom-up-aware: the sub + voice wrap to a variable number of lines (the Reseal copy
    // runs long), so lay them out sequentially instead of at fixed y's — no more overlapping captions.
    ctx.font = '400 17px system-ui, sans-serif';
    const subLines = measureWrap(copy.sub, 720);
    ctx.font = 'italic 500 16px Georgia, serif';
    const voiceLines = measureWrap(copy.voice, 760);
    const blockH = 34 + subLines * 23 + 14 + voiceLines * 21;
    const titleY = DH - 28 - blockH;
    ctx.fillStyle = '#f4ecd6';
    ctx.font = '800 44px Georgia, "Times New Roman", serif';
    ctx.fillText(copy.title, DW / 2, titleY);
    ctx.fillStyle = '#c2ccda';
    ctx.font = '400 17px system-ui, sans-serif';
    wrap(copy.sub, DW / 2, titleY + 34, 720, 23);
    ctx.fillStyle = copy.voiceCol;
    ctx.font = 'italic 500 16px Georgia, serif';
    wrap(copy.voice, DW / 2, titleY + 34 + subLines * 23 + 14, 760, 21);
    ctx.globalAlpha = 1;
  }
  function splitLines(text: string, maxW: number): string[] {
    if (!ctx) return [text];
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
    return lines;
  }
  function measureWrap(text: string, maxW: number): number {
    return splitLines(text, maxW).length;
  }
  function wrap(text: string, cx: number, y: number, maxW: number, lh: number): void {
    if (!ctx) return;
    splitLines(text, maxW).forEach((l, i) => ctx.fillText(l, cx, y + i * lh));
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
      // GS-story-reseal-tree — THE RESEAL, in three beats: (1) the serpent settles to SLEEP while golden
      // seal-rings converge and LOCK (a bind-rune seats over the coils with a bloom); (2) YGGDRASIL, the
      // World-Tree, grows up around it — a luminous trunk + canopy rising behind, roots curling in front to
      // cradle the beast, and the worlds you saved lighting as star-fruit in the crown; (3) it HOLDS as dawn
      // breaks, while the Coil's last wyrm-ship runs dark ahead of the light toward The Destination.
      const seat = easeOut(clamp01(e / 3000)); // the seal seats over the first 3s
      const lockFlash = Math.sin(clamp01((e - 2200) / 900) * Math.PI); // one-shot bloom as it seizes
      const sleep = easeInOut(clamp01(e / 2600)); // the beast slides into dreamless sleep
      const growT = easeOut(clamp01((e - 2900) / 4200)); // the tree unfurls, 2.9s → 7.1s
      const dawnP = clamp01((e - 2600) / (TOTAL - 2600)); // dawn brightens behind the risen tree
      const dawn = ctx.createLinearGradient(0, DH, 0, 0);
      dawn.addColorStop(0, `rgba(255,${180 + dawnP * 40},120,${0.22 + dawnP * 0.38})`);
      dawn.addColorStop(0.5, `rgba(120,180,255,${0.08 + dawnP * 0.22})`);
      dawn.addColorStop(1, '#060814');
      ctx.fillStyle = '#060814';
      ctx.fillRect(0, 0, DW, DH);
      ctx.fillStyle = dawn;
      ctx.fillRect(0, 0, DW, DH);
      starfield(t, 1 - dawnP * 0.65);
      for (const w of worlds) planet(w.x, w.y, w.r, w.hue, easeOut(dawnP));
      // (2a) canopy BEHIND the serpent — the beast nestles into the World-Tree
      if (tree) {
        foliage(tree.foliage, growT, 0.5 + growT * 0.5, t);
        drawTree(tree.canopy, growT, 0.5 + growT * 0.5);
        blossoms(tree.canopyBloss, growT, 0.5 + growT * 0.5, t);
      }
      // (1) the serpent settles into its dreamless sleep
      serpent(t, DW / 2, 300, 500, 0.4 * (1 - sleep), 0, sleep);
      // (1b) the seal takes: amber rings converging on the sleeping coils, then the bind-rune locking
      const cySeal = 330 + sleep * 60;
      const ringN = 3;
      for (let i = 0; i < ringN; i++) {
        const converge = easeOut(clamp01(seat * 1.6 - i * 0.18));
        if (converge <= 0) continue;
        const rr = lerp(430 + i * 70, 250 + i * 26, converge);
        ctx.strokeStyle = `rgba(240,200,110,${0.16 + converge * 0.3})`;
        ctx.lineWidth = 2 + converge * 1.5;
        ctx.beginPath();
        ctx.ellipse(DW / 2, cySeal, rr, rr * 0.42, 0, 0, 6.283);
        ctx.stroke();
      }
      sealSigil(DW / 2, cySeal, seat, lockFlash, t);
      ctx.globalAlpha = 1;
      // (2b) roots IN FRONT, curling up to cradle the sleeping serpent
      if (tree) {
        drawTree(tree.roots, growT, 0.5 + growT * 0.5);
        blossoms(tree.rootBloss, growT, 0.5 + growT * 0.5, t);
      }
      // (3) one dark sail, running for the deep — it lifts once the seal is taking and is still flying
      // through the HOLD (paced on the whole cinematic, not the scene, so the jet-off reads to the end)
      coilShipFlees(t, clamp01((e / TOTAL - 0.3) / 0.75));
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

    // Captions. GS-story-reseal-tree: the Reseal is WORDLESS but for a clean title laid at the top, clear of
    // the art — the full narrative is the readable RECAP the cinematic dismisses onto (advance when you've
    // finished reading). The other three endings keep their in-frame caption block.
    if (good) {
      titleCard(easeOut(clamp01((e - P.scene * 0.62) / (P.scene * 0.38))));
    } else {
      const capA = e < P.scene * 0.45 ? 0 : easeOut(clamp01((e - P.scene * 0.45) / (P.scene * 0.55)));
      captionBlock(capA);
    }

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
