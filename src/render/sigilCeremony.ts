/**
 * The SIGIL CEREMONY cinematic (GS-story-sigil-ceremony) — Canvas2D, render-only, a full-screen overlay
 * played when you win a Galaxy Tournament and set its Sigil into the Keystone. The spectacular beat the
 * player asked for:
 *   REVEAL  — the Keystone rises from the dark, the Sigils you already hold glowing in their sockets, the
 *             empty sockets waiting; the new Sigil hovers above, spinning.
 *   SLOT    — the new Sigil descends and SLOTS into its socket with a burst of light; energy arcs race to
 *             the Sigils already set, and the Keystone's heart brightens (more Sigils = brighter).
 *   SERPENT — a cut to Jörmungandr, coiled in the dark below the World-Tree. It wakes a little MORE with
 *             every Sigil set (`wakefulness` = sigils / 5): barely stirring at one, restless at four —
 *             and on the FIFTH, a cut to its head, and the great eye OPENS.
 *   CAPTION — a line over the beat ("N of 5 Sigils set" / "The Keystone is complete — the World-Eater wakes").
 *
 * Self-contained (own mount / resize / rAF / skip scaffolding, mirroring `storyFinale.ts` / `storyIntro.ts`),
 * everything vector-drawn (no downloaded asset). Skip button / reduced-motion (guarded at the call site)
 * jump to the end. Thin imperative "feel" layer — verify eyes-on. Zero sim rng (a private mulberry32 for
 * the cinematic scatter only), no save, no reducer impact.
 */

export interface SigilCeremonyHandle {
  destroy(): void;
}

const DW = 1000;
const DH = 640;

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

/** Per-Sigil colour + emblem glyph (content-as-data, keyed by trophy id). A route-specific Ch.4/5 Sigil
 *  gets its own look; an unknown id falls back to a neutral gold. */
export const SIGIL_LOOK: Record<string, { col: string; glow: string; glyph: string }> = {
  'sigil-emerald': { col: '#4fe08a', glow: '#8fffbe', glyph: '❧' },
  'sigil-ember': { col: '#ff7a3c', glow: '#ffb27a', glyph: '✦' },
  'sigil-storm': { col: '#a07cff', glow: '#c9b0ff', glyph: '⚡' },
  'sigil-abyssal': { col: '#4f8ae0', glow: '#9dc2ff', glyph: '◉' },
  'sigil-drowned': { col: '#3fd0c0', glow: '#8fecE0', glyph: '≈' },
  'sigil-vigil': { col: '#7fe0a0', glow: '#c0ffd6', glyph: '✜' },
  'sigil-ascension': { col: '#b0e04f', glow: '#dcff9a', glyph: '☣' },
};
export function sigilLook(id: string): { col: string; glow: string; glyph: string } {
  return SIGIL_LOOK[id] ?? { col: '#f0c860', glow: '#ffe6a0', glyph: '◆' };
}
/** Does a Sigil id have a bespoke ceremony look (not the neutral fallback)? A coverage invariant so every
 *  real tournament Sigil renders with its own colour/glyph in the cinematic. */
export function hasSigilLook(id: string): boolean {
  return id in SIGIL_LOOK;
}

export function mountSigilCeremony(opts: {
  newSigilId: string;
  priorSigilIds: readonly string[];
  sigilName: string;
  onDone?: () => void;
}): SigilCeremonyHandle {
  const total = 5;
  const priorCount = Math.min(total - 1, opts.priorSigilIds.length);
  const slotIndex = priorCount; // the new Sigil fills the next empty socket
  const sigilCount = priorCount + 1;
  const isFinal = sigilCount >= total;
  const wakefulness = sigilCount / total;

  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-sigil-ceremony', '1');
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

  // Timeline (ms).
  const P = { reveal: 1500, slot: 1800, serpent: 2700, caption: 1700 };
  const B = {
    reveal: P.reveal,
    slot: P.reveal + P.slot,
    serpent: P.reveal + P.slot + P.serpent,
    caption: P.reveal + P.slot + P.serpent + P.caption,
  };
  const TOTAL = B.caption;

  const rng = mulberry32(0x51617 ^ (sigilCount * 0x9e37));
  type Star = { x: number; y: number; r: number; tw: number };
  const stars: Star[] = Array.from({ length: 150 }, () => ({ x: rng() * DW, y: rng() * DH, r: 0.4 + rng() * 1.5, tw: rng() * 6.28 }));
  // Slotting spark motes.
  const motes = Array.from({ length: 46 }, () => ({ a: rng() * 6.28, sp: 90 + rng() * 320, r: 1.5 + rng() * 3.5 }));

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

  // ── geometry ───────────────────────────────────────────────────────────────
  const CX = 500;
  const CY = 320;
  const RING = 180; // socket ring radius
  const SOCK = 40; // socket radius
  /** Socket centre for slot `i` (0..4), arranged as an upright pentagon (slot 0 at top). */
  function socketPos(i: number): { x: number; y: number } {
    const a = -Math.PI / 2 + (i / total) * Math.PI * 2;
    return { x: CX + Math.cos(a) * RING, y: CY + Math.sin(a) * RING };
  }

  // ── drawing (design space) ───────────────────────────────────────────────────
  function drawBackdrop(t: number, tone: 'stone' | 'abyss', flash: number): void {
    if (!ctx) return;
    const g = ctx.createRadialGradient(CX, CY, 30, CX, CY, 620);
    if (tone === 'stone') {
      g.addColorStop(0, '#161226');
      g.addColorStop(0.6, '#0c0a18');
      g.addColorStop(1, '#04040a');
    } else {
      g.addColorStop(0, '#08120e');
      g.addColorStop(0.6, '#040a08');
      g.addColorStop(1, '#020403');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, DW, DH);
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + s.tw);
      ctx.globalAlpha = (tone === 'stone' ? 0.3 : 0.16) + tw * 0.4;
      ctx.fillStyle = tone === 'stone' ? '#cbd6ff' : '#8fe0b0';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(0, 0, DW, DH);
    }
  }

  /** The stone Keystone slab: a dark pentagon ring with the five sockets + a central heart rune that
   *  brightens with how many Sigils are set. `heart` 0..1 is the heart's charge. */
  function drawKeystone(t: number, appear: number, heart: number): void {
    if (!ctx) return;
    ctx.save();
    ctx.globalAlpha = appear;
    // slab body (pentagon)
    ctx.beginPath();
    for (let i = 0; i < total; i++) {
      const a = -Math.PI / 2 + (i / total) * Math.PI * 2;
      const x = CX + Math.cos(a) * (RING + SOCK + 34);
      const y = CY + Math.sin(a) * (RING + SOCK + 34);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const slab = ctx.createLinearGradient(CX, CY - 260, CX, CY + 260);
    slab.addColorStop(0, '#2a2740');
    slab.addColorStop(1, '#131022');
    ctx.fillStyle = slab;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(150,140,200,0.5)';
    ctx.stroke();
    // ring channel joining the sockets
    ctx.beginPath();
    ctx.arc(CX, CY, RING, 0, 6.283);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(90,80,130,0.45)';
    ctx.stroke();
    // central heart rune
    const hr = 46 + heart * 10;
    const hg = ctx.createRadialGradient(CX, CY, 4, CX, CY, hr + 30);
    hg.addColorStop(0, `rgba(255,240,190,${0.25 + heart * 0.75})`);
    hg.addColorStop(0.5, `rgba(240,200,110,${0.15 + heart * 0.5})`);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(CX, CY, hr + 30, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,236,180,${0.4 + heart * 0.6})`;
    ctx.lineWidth = 2 + heart * 2;
    ctx.beginPath();
    ctx.arc(CX, CY, hr, 0, 6.283);
    ctx.stroke();
    // a slowly turning inner keystone glyph
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(t * 0.3);
    ctx.strokeStyle = `rgba(255,230,170,${0.3 + heart * 0.6})`;
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, 12 + k * 9, k, k + 4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  /** Draw a Sigil gem in a socket: an empty dark socket if `fill` 0; a glowing faceted gem as `fill`→1. */
  function drawSocket(i: number, id: string | null, fill: number, t: number): void {
    if (!ctx) return;
    const { x, y } = socketPos(i);
    // socket rim
    ctx.beginPath();
    ctx.arc(x, y, SOCK, 0, 6.283);
    ctx.fillStyle = '#0a0812';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(120,110,160,0.5)';
    ctx.stroke();
    if (!id || fill <= 0) return;
    const look = sigilLook(id);
    const pulse = 0.7 + 0.3 * Math.sin(t * 3 + i);
    // glow halo
    const gr = ctx.createRadialGradient(x, y, 4, x, y, SOCK * 1.9);
    gr.addColorStop(0, hexA(look.glow, 0.9 * fill * pulse));
    gr.addColorStop(0.5, hexA(look.col, 0.5 * fill));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, SOCK * 1.9, 0, 6.283);
    ctx.fill();
    // faceted gem
    ctx.save();
    ctx.globalAlpha = fill;
    ctx.translate(x, y);
    const rr = SOCK * 0.72;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k / 6) * Math.PI * 2;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const gem = ctx.createLinearGradient(0, -rr, 0, rr);
    gem.addColorStop(0, look.glow);
    gem.addColorStop(1, look.col);
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // emblem glyph
    ctx.fillStyle = 'rgba(10,12,20,0.7)';
    ctx.font = `${Math.round(rr * 1.1)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.glyph, 0, 2);
    ctx.restore();
  }

  /** Energy arc between two sockets (drawn when the new Sigil links to the already-set ring). */
  function drawArc(a: number, b: number, col: string, alpha: number): void {
    if (!ctx) return;
    const pa = socketPos(a);
    const pb = socketPos(b);
    const mx = (pa.x + pb.x) / 2 + (CX - (pa.x + pb.x) / 2) * 0.4;
    const my = (pa.y + pb.y) / 2 + (CY - (pa.y + pb.y) / 2) * 0.4;
    ctx.strokeStyle = hexA(col, alpha);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.quadraticCurveTo(mx, my, pb.x, pb.y);
    ctx.stroke();
  }

  /** The waking serpent — coiled in the dark. `wake` 0..1 sets how awake it is (drowsy stir → the eye
   *  opening). `focusHead` blows the head up for the final reveal. */
  function drawSerpent(t: number, wake: number, focusHead: number): void {
    if (!ctx) return;
    // eldritch haze
    const haze = ctx.createRadialGradient(CX, CY + 40, 40, CX, CY + 40, 560);
    haze.addColorStop(0, `rgba(60,${160 + wake * 60},120,${0.1 + wake * 0.16})`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, DW, DH);
    const stir = wake * (0.6 + 0.4 * Math.sin(t * (1.2 + wake)));
    const segs = 30;
    const baseY = CY + 90 - focusHead * 120;
    const spread = lerp(560, 260, focusHead);
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const x = CX - spread / 2 + u * spread;
      const y = baseY + Math.sin(u * 6 + t * (0.6 + wake * 0.9)) * (60 + stir * 40) * (0.4 + u * 0.7);
      const r = lerp(8, 40, u) * (1 + focusHead * 0.5);
      const corr = 0.5 + 0.5 * Math.sin(t * 2.4 + u * 5);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${34 + corr * 40},${70 + corr * 90 + wake * 30},${58 + corr * 30},1)`);
      g.addColorStop(1, `rgba(8,${22 + corr * 18},18,1)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
    }
    // head at u=1
    const hx = CX + spread / 2;
    const hy = baseY + Math.sin(6 + t * (0.6 + wake * 0.9)) * (60 + stir * 40) * 1.1;
    const hr = (28 + focusHead * 90);
    // head mass
    const hg = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, hr * 0.2, hx, hy, hr);
    hg.addColorStop(0, `rgba(50,${110 + wake * 40},80,1)`);
    hg.addColorStop(1, 'rgba(8,26,20,1)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, 6.283);
    ctx.fill();
    // the great EYE — a lid that opens with `wake` (fully open near 1, especially on focusHead)
    const open = clamp01(wake * 0.7 + focusHead * 0.6); // 0 closed .. 1 wide
    const eyeR = hr * (0.5 + focusHead * 0.3);
    if (open > 0.04) {
      const eg = ctx.createRadialGradient(hx, hy, 2, hx, hy, eyeR * 1.4);
      const ep = 0.6 + 0.4 * Math.sin(t * 3);
      eg.addColorStop(0, `rgba(200,255,220,${open})`);
      eg.addColorStop(0.4, `rgba(90,${200 + ep * 40},150,${0.7 * open})`);
      eg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(hx, hy, eyeR * 1.4, 0, 6.283);
      ctx.fill();
      // eye white (a lens) clipped to the open lid aperture
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(hx, hy, eyeR, eyeR * open, 0, 0, 6.283);
      ctx.clip();
      ctx.fillStyle = 'rgba(210,255,225,0.95)';
      ctx.beginPath();
      ctx.arc(hx, hy, eyeR, 0, 6.283);
      ctx.fill();
      // iris + slit pupil
      ctx.fillStyle = 'rgba(20,60,40,0.9)';
      ctx.beginPath();
      ctx.arc(hx, hy, eyeR * 0.5, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = `rgba(255,${120 + open * 60},60,${0.7 + 0.3 * Math.sin(t * 6)})`;
      ctx.beginPath();
      ctx.ellipse(hx, hy, eyeR * 0.12, eyeR * 0.62, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }
    // upper + lower lids (they part as `open` grows)
    ctx.strokeStyle = 'rgba(10,30,22,1)';
    ctx.lineWidth = 4 + focusHead * 4;
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR + 3, eyeR * 1.05, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR + 3, eyeR * 1.05, 0, 0, Math.PI);
    ctx.stroke();
    // the closed slit line when nearly shut
    if (open < 0.5) {
      ctx.strokeStyle = `rgba(120,220,160,${(0.5 - open) * 1.4})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx - eyeR, hy);
      ctx.lineTo(hx + eyeR, hy);
      ctx.stroke();
    }
  }

  function caption(text: string, sub: string, a: number): void {
    if (!ctx) return;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd6';
    ctx.font = '700 34px Georgia, "Times New Roman", serif';
    ctx.fillText(text, CX, DH - 96);
    if (sub) {
      ctx.fillStyle = '#b8c2d6';
      ctx.font = '500 18px system-ui, sans-serif';
      ctx.fillText(sub, CX, DH - 62);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now: number): void {
    if (finished || !ctx) return;
    if (!start) start = now;
    const e = now - start;
    const t = e / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // Which phase are we in?
    const inKeystone = e < B.slot; // reveal + slot
    if (inKeystone) {
      const appear = easeOut(clamp01(e / 700));
      // slot progress: 0 during reveal, 0→1 across the slot phase
      const slotP = e < B.reveal ? 0 : easeInOut(clamp01((e - B.reveal) / P.slot));
      const flash = e >= B.reveal && slotP > 0.5 ? clamp01(1 - (slotP - 0.5) / 0.28) * 0.6 : 0;
      drawBackdrop(t, 'stone', flash);
      // heart brightens as the new Sigil seats (prior fraction + the seating new one)
      const heart = clamp01((priorCount + slotP) / total);
      drawKeystone(t, appear, heart);
      // already-set Sigils
      for (let i = 0; i < priorCount; i++) drawSocket(i, opts.priorSigilIds[i]!, appear, t);
      // the remaining empty sockets
      for (let i = priorCount + 1; i < total; i++) drawSocket(i, null, appear, t);
      // the NEW Sigil: hovers above during reveal, descends + seats during slot
      const target = socketPos(slotIndex);
      const hoverY = CY - 250;
      const spin = t * 3;
      if (e < B.reveal) {
        drawFloatingSigil(target.x, hoverY + Math.sin(t * 2) * 8, opts.newSigilId, appear, spin, 1.1);
        drawSocket(slotIndex, null, appear, t); // empty target socket
      } else {
        const sy = lerp(hoverY, target.y, slotP);
        const sx = lerp(target.x, target.x, slotP);
        drawSocket(slotIndex, slotP > 0.82 ? opts.newSigilId : null, appear, t);
        if (slotP <= 0.9) drawFloatingSigil(sx, sy, opts.newSigilId, 1, spin * (1 - slotP), lerp(1.1, 1, slotP));
        // energy arcs to the ring once seated
        if (slotP > 0.6) {
          const arcA = clamp01((slotP - 0.6) / 0.3);
          const look = sigilLook(opts.newSigilId);
          for (let i = 0; i < priorCount; i++) drawArc(slotIndex, i, look.glow, arcA * (0.5 + 0.5 * Math.sin(t * 8 + i)));
        }
        // burst motes on seating
        if (slotP > 0.5 && slotP < 0.95) {
          const bp = (slotP - 0.5) / 0.45;
          const look = sigilLook(opts.newSigilId);
          ctx.fillStyle = hexA(look.glow, (1 - bp) * 0.9);
          for (const m of motes) {
            const d = m.sp * bp;
            ctx.beginPath();
            ctx.arc(target.x + Math.cos(m.a) * d, target.y + Math.sin(m.a) * d, m.r * (1 - bp * 0.6), 0, 6.283);
            ctx.fill();
          }
        }
      }
    } else if (e < B.serpent) {
      // SERPENT cut — a brief fade from the keystone flash into the abyss
      const sp = clamp01((e - B.slot) / P.serpent);
      drawBackdrop(t, 'abyss', sp < 0.12 ? (0.12 - sp) / 0.12 * 0.5 : 0);
      const wake = wakefulness * easeOut(clamp01(sp * 1.4));
      const focusHead = isFinal ? easeInOut(clamp01((sp - 0.35) / 0.6)) : 0;
      drawSerpent(t, wake, focusHead);
      // a low caption during the serpent beat
      const capA = easeOut(clamp01((sp - 0.2) / 0.4)) * (sp > 0.85 ? clamp01((1 - sp) / 0.15) : 1);
      if (isFinal) caption('The World-Eater stirs…', '', capA * 0.9);
      else caption('Far below Yggdrasil, something turns over in its sleep.', '', capA * 0.8);
    } else {
      // CAPTION hold
      const cp = clamp01((e - B.serpent) / P.caption);
      drawBackdrop(t, 'abyss', 0);
      const wake = wakefulness;
      const focusHead = isFinal ? 1 : 0;
      drawSerpent(t, wake, focusHead);
      const a = easeOut(clamp01(cp * 2)) * (cp > 0.8 ? clamp01((1 - cp) / 0.2) : 1);
      if (isFinal) caption('The Keystone is complete.', 'The World-Eater wakes. Its eye is open.', a);
      else caption(`${opts.sigilName} is set.`, `${sigilCount} of ${total} Sigils — the key takes shape.`, a);
    }

    ctx.restore();
    if (e >= TOTAL) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  /** A Sigil floating free (before it seats): the gem + a trailing glow, scaled + spun. */
  function drawFloatingSigil(x: number, y: number, id: string, alpha: number, spin: number, sc: number): void {
    if (!ctx) return;
    const look = sigilLook(id);
    ctx.save();
    ctx.globalAlpha = alpha;
    // descending light column
    const col = ctx.createLinearGradient(x, y - 40, x, y + 260);
    col.addColorStop(0, hexA(look.glow, 0.5 * alpha));
    col.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = col;
    ctx.fillRect(x - 14, y, 28, 260);
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    ctx.rotate(spin);
    const rr = SOCK * 0.72;
    // glow
    const gr = ctx.createRadialGradient(0, 0, 4, 0, 0, rr * 2.4);
    gr.addColorStop(0, hexA(look.glow, 0.9));
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, rr * 2.4, 0, 6.283);
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k / 6) * Math.PI * 2;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const gem = ctx.createLinearGradient(0, -rr, 0, rr);
    gem.addColorStop(0, look.glow);
    gem.addColorStop(1, look.col);
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  resize();
  window.addEventListener('resize', resize);
  if (!ctx) {
    // No 2D context — degrade gracefully.
    finish();
    return { destroy: finish };
  }
  raf = requestAnimationFrame(frame);
  return { destroy: finish };
}

/** rgba() from a #rrggbb hex + alpha. */
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
