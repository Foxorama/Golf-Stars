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

// Backing-store resolution only — a pure, guarded read of the root zoom, so this cinematic
// stays as self-contained and as un-throwable as it was.
import { canvasRatio } from './pixelRatio';

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

/** The serpent-beat caption ESCALATES with how many Sigils are now set (GS-story-ragnarok) — the impending
 *  Ragnarök made legible: a distant dream at one Sigil, the great eye opening and looking back at four. */
export function serpentStirCaption(sigils: number): string {
  return [
    'Far below Yggdrasil, something turns over in its sleep.',
    'Under the roots the sleeper stirs — and the Coil is smiling.',
    "The World-Eater's eye cracks open in the dark.",
    'It is awake now — and it is looking back up the roots, at you.',
  ][Math.max(0, Math.min(3, sigils - 1))]!;
}
/** The Keystone-hold subtitle names the coming Ragnarök as the key nears completion (GS-story-ragnarok). */
export function keystoneSubtitle(sigils: number, total: number): string {
  const tail = [
    'the key takes shape.',
    'the seal weakens.',
    'the root begins to give.',
    'one Sigil from Ragnarök.',
  ][Math.max(0, Math.min(3, sigils - 1))]!;
  return `${sigils} of ${total} Sigils — ${tail}`;
}

/**
 * Paint the waking world-serpent (GS-story-serpent / GS-story-serpent-2) into `ctx`, centred on
 * (CX, CY) in the ceremony's 1000×640 design space. Jörmungandr with an ELDRITCH CONSTELLATION flare:
 * a long marched spine that rears the horned head out of a full COIL of its own body and trails away
 * through deep serpentine waves to a curling tail — and the beast is simultaneously drawn IN STARS.
 * The body is a torn ribbon of night sky (an interior starfield + nebula hearts under the scales),
 * with a constellation FIGURE inscribed along the spine: glowing star nodes joined by chord lines,
 * twinkling, continued onto the head at the horn tips. The coil sits right behind the skull so the
 * iconic pose survives the battle framing (where most of the trailing body runs off-canvas).
 * `wake` 0..1 = how awake it is (drowsy stir → eye wide open); `focusHead` 0..1 zooms in on the head
 * for the final reveal. Exported so `scripts/serpent-preview.mjs` can render it at any state.
 *
 * GS-story-battle-2: returns the head's ANCHORS (eye / brow, in the same design space) so the finale
 * battle can aim its reticle, land its bolts, and hang the Herald's seal ON the drawn serpent — the
 * graphic IS the target. Callers that only paint (the ceremony, the preview) ignore the return.
 */
export interface SerpentAnchors {
  eyeX: number;
  eyeY: number;
  eyeR: number;
  browX: number;
  browY: number;
  /** Head unit + angle, for hanging extra geometry (the Herald's seal) proportionately. */
  headH: number;
  headAng: number;
}

/**
 * How far the serpent's great eye is open, 0 (sealed) → 1 (wide) — PURE, the one source `paintSerpent`
 * reads (GS-story-serpent-eye). The ceremonies drive `wake = sigils/5`, so the eye tracks the campaign:
 * sealed at one Sigil, the barest sliver at two, visibly CRACKED at three (the caption's "eye cracks
 * open"), half-lidded and looking back at four — and the fifth Sigil's head-cut (`focusHead`) opens it
 * wide. Monotone in both inputs (machine-checked), so the teasers' slow opening can never regress.
 */
export function serpentEyeOpen(wake: number, focusHead: number): number {
  return clamp01(focusHead * 1.05 + Math.max(0, wake - 0.3) * 1.0);
}

/** Optional shaping for `paintSerpent` (GS-story-serpent-2) — every field defaults to the classic call. */
export interface SerpentOpts {
  /** Horizontal span of the body at focusHead 0 (design px). Default 620 — the battle framing. */
  spread?: number;
  /** 0..1 — the Reseal's lullaby (GS-story-unending-tease): the sway stills, the body settles, the
   *  eye + jaw slide shut and the constellation dims. Used by the good-win ending; 0 everywhere else. */
  sleep?: number;
  /** 0..1 — battle ROAR: the maw gapes open (the boss visibly spits its volleys, GS-story-serpent-2).
   *  Driven by the finale battle around each volley; 0 everywhere else. */
  rage?: number;
}

export function paintSerpent(
  ctx: CanvasRenderingContext2D,
  CX: number,
  CY: number,
  t: number,
  wake: number,
  focusHead: number,
  opts: SerpentOpts = {},
): SerpentAnchors {
  const DWl = 1000;
  const DHl = 640;
  const sleep = clamp01(opts.sleep ?? 0);
  const rage = clamp01(opts.rage ?? 0);
  const still = 1 - sleep * 0.85; // stillness takes the body
  const spd = 1 - sleep * 0.7; // and the movement slows
  // eldritch haze
  const haze = ctx.createRadialGradient(CX, CY + 40 + sleep * 50, 40, CX, CY + 40 + sleep * 50, 560);
  haze.addColorStop(0, `rgba(60,${160 + wake * 60},120,${(0.1 + wake * 0.16) * (1 - sleep * 0.4)})`);
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, DWl, DHl);

  const stir = wake * (0.6 + 0.4 * Math.sin(t * (1.2 + wake) * spd)) * still;
  const phase = t * (0.55 + wake * 0.85) * spd;
  const girth = 1 + focusHead * 1.9; // the whole serpent swells to a MASSIVE thick body on the final reveal
  const spread = lerp(opts.spread ?? 620, 300, focusHead);
  const sc = spread / 620; // uniform geometry scale (radii stay absolute so the focus zoom behaves)

  // ── SPINE (GS-story-serpent-2): marched TAIL-WARD from a FIXED head anchor — a heading integral
  //    (turtle graphics), so the head stays put + attached by construction while the body sways.
  //    The route: a near-straight neck, then one full 2π COIL right behind the skull (the head rears
  //    out of its own coils — and the coil stays on-canvas in the battle's off-centre framing), then
  //    long travelling waves, then a tightening tail SPIRAL. ──
  const LTOT = 1500; // arc length, unscaled — ~2.4× the old sine's span (the "longer" ask)
  const N = 150;
  const ds = LTOT / N;
  const COIL0 = 260; // the coil begins just past the neck…
  const COIL_LEN = 440; // …and winds one full turn over this stretch
  const TAIL0 = LTOT - 190; // the curling tail tip
  const K = (Math.PI * 2) / 410; // body wavelength
  const headX = CX - spread * 0.5 + focusHead * 60; // the focus zoom keeps the huge snout on-canvas
  const headY = CY + 42 - focusHead * 92 + sleep * 60 + Math.sin(t * 0.7 * spd) * 6 * still;
  const smooth01 = (x: number): number => {
    const c = clamp01(x);
    return c * c * (3 - 2 * c);
  };
  let mx = headX;
  let my = headY;
  const fwd: { x: number; y: number }[] = [{ x: mx, y: my }];
  // The focus zoom swells the girth past the loop radius, so the coil UNWINDS as the camera pushes in
  // (the head fills the frame; a knot smaller than the body is thick would degenerate into a smear) —
  // and the WAVE flattens with it, so the body behind the huge head is one smooth sweeping arc, never
  // a bunched squash of overlapping segments.
  const focusW = smooth01(focusHead);
  const coilAmt = 1 - 0.92 * focusW;
  const waveAmt = 1 - 0.78 * focusW;
  for (let k = 1; k <= N; k++) {
    const sm = (k - 0.5) * ds;
    const neckDamp = smooth01(sm / 150); // the neck leaves the skull straight (the head-gap fix)
    const coilW = smooth01((sm - COIL0) / COIL_LEN);
    const coilBell = Math.sin(Math.PI * clamp01((sm - COIL0) / COIL_LEN));
    const tailW = clamp01((sm - TAIL0) / (LTOT - TAIL0));
    const amp = (0.62 + 0.5 * stir) * neckDamp * (1 - 0.88 * coilBell * coilAmt) * (1 - tailW) * (1 - sleep * 0.5) * waveAmt;
    const phi =
      0.2 * (1 - smooth01(sm / 240)) + // the neck dives off the raised skull — the head REARS above the body
      amp * Math.sin(sm * K + 0.9 + phase) +
      0.15 * Math.sin(sm * K * 0.31 + phase * 0.6) + // slow secondary drift
      Math.PI * 2 * coilW * coilAmt - // the great coil turns one way…
      2.3 * Math.PI * tailW * tailW * coilAmt; // …and the tail curls the other
    mx += Math.cos(phi) * ds * sc;
    my += Math.sin(phi) * ds * sc;
    fwd.push({ x: mx, y: my });
  }
  // pts[] tail(0) → head(N), the classic convention (radius fattens toward the neck).
  const rad = (u: number): number => lerp(5, 52, Math.pow(u, 0.85)) * girth;
  type Pt = { u: number; x: number; y: number; r: number; nx: number; ny: number };
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const f = fwd[N - i]!;
    pts.push({ u, x: f.x, y: f.y, r: rad(u), nx: 0, ny: 0 });
  }
  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(N, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    pts[i]!.nx = -dy / len; // unit normal
    pts[i]!.ny = dx / len;
  }
  // NECK SHEATH (GS-story-serpent-2 round 3): the flesh continues INTO the skull — tapering collar
  // segments extend past the head anchor along the head's forward line, carrying the same cel bands /
  // scales / starfield, so the skull always sits ON the body. (The earlier flat cap disc read as a
  // decapitation cross-section — the "pre-decapitated" bug.)
  const fdxq = pts[N]!.x - pts[N - 3]!.x;
  const fdyq = pts[N]!.y - pts[N - 3]!.y;
  const flq = Math.hypot(fdxq, fdyq) || 1;
  const fux = fdxq / flq;
  const fuy = fdyq / flq;
  const chain: Pt[] = [...pts];
  for (let j = 1; j <= 5; j++) {
    const base = pts[N]!;
    chain.push({
      u: 1,
      x: base.x + fux * base.r * 0.34 * j,
      y: base.y + fuy * base.r * 0.34 * j,
      r: base.r * (1 - j * 0.09),
      nx: base.nx,
      ny: base.ny,
    });
  }
  const M = chain.length - 1;

  // ── BODY: per-segment painter, tail → head, so the coil correctly crosses OVER its own far side
  //    (a single ribbon fill can't self-overlap). Each segment lays a slightly WIDER dark halo under
  //    its fill — invisible against space, but where the near coil rides the far coil it reads as the
  //    occlusion shadow that sells the over-cross. ──
  // `band` fills the lateral slice [f0,f1] of a segment (f in −1..1 of the local radius) — the cel
  // planes; `quad(a,b,e)` = the full slice inflated by `e` px (the halo / union path).
  const band = (a: Pt, b: Pt, f0: number, f1: number, e: number): void => {
    // extend a hair longitudinally so adjacent segments overlap (no AA seams)
    const txq = (b.x - a.x) || 0.01;
    const tyq = b.y - a.y;
    const tl = Math.hypot(txq, tyq) || 1;
    const ox = (txq / tl) * 0.8;
    const oy = (tyq / tl) * 0.8;
    ctx.beginPath();
    ctx.moveTo(a.x - ox + a.nx * (a.r * f0 + e * Math.sign(f0)), a.y - oy + a.ny * (a.r * f0 + e * Math.sign(f0)));
    ctx.lineTo(b.x + ox + b.nx * (b.r * f0 + e * Math.sign(f0)), b.y + oy + b.ny * (b.r * f0 + e * Math.sign(f0)));
    ctx.lineTo(b.x + ox + b.nx * (b.r * f1 + e * Math.sign(f1)), b.y + oy + b.ny * (b.r * f1 + e * Math.sign(f1)));
    ctx.lineTo(a.x - ox + a.nx * (a.r * f1 + e * Math.sign(f1)), a.y - oy + a.ny * (a.r * f1 + e * Math.sign(f1)));
    ctx.closePath();
  };
  const quad = (a: Pt, b: Pt, e: number): void => band(a, b, 1, -1, e);
  for (let i = 0; i < M; i++) {
    const a = chain[i]!;
    const b = chain[i + 1]!;
    quad(a, b, 3.5);
    ctx.fillStyle = 'rgba(3,12,9,0.85)'; // lateral occlusion halo
    ctx.fill();
    const glint = 0.5 + 0.5 * Math.sin(t * 2.1 * spd + Math.min(i, N) * 0.5);
    const rr = Math.round(11 + wake * 11 + glint * 6 + a.u * 8);
    const gg = Math.round(46 + wake * 26 + glint * 16 + a.u * 30);
    const bb = Math.round(38 + wake * 7 + glint * 9 + a.u * 9);
    // CEL SHADING (GS-story-serpent-2): three hard-edged flat planes per segment — a lit dorsal band,
    // the mid tone, a dark belly band — crisp toon planes instead of one soft airbrushed tube.
    quad(a, b, 0);
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fill();
    band(a, b, 1, 0.42, 0);
    ctx.fillStyle = `rgb(${Math.round(34 + wake * 16 + a.u * 10)},${Math.round(120 + wake * 34 + a.u * 26)},${Math.round(80 + wake * 10 + a.u * 8)})`;
    ctx.fill();
    band(a, b, -0.38, -1, 0);
    ctx.fillStyle = `rgb(${Math.round(6 + wake * 5)},${Math.round(26 + wake * 12)},${Math.round(21 + wake * 4)})`;
    ctx.fill();
  }
  // The full-body union path (nonzero winding fills overlapping quads as one region) — the clip for
  // everything painted INSIDE the beast. Includes the neck sheath, so the interior dressing runs
  // unbroken under the skull.
  const bodyPath = new Path2D();
  for (let i = 0; i < M; i++) {
    const a = chain[i]!;
    const b = chain[i + 1]!;
    bodyPath.moveTo(a.x + a.nx * a.r, a.y + a.ny * a.r);
    bodyPath.lineTo(b.x + b.nx * b.r, b.y + b.ny * b.r);
    bodyPath.lineTo(b.x - b.nx * b.r, b.y - b.ny * b.r);
    bodyPath.lineTo(a.x - a.nx * a.r, a.y - a.ny * a.r);
    bodyPath.closePath();
  }

  ctx.save();
  ctx.clip(bodyPath);
  // form shading — a dorsal sheen from above, the belly sinking into the void
  const sh = ctx.createLinearGradient(0, CY - 250, 0, CY + 270);
  sh.addColorStop(0, `rgba(190,255,215,${0.07 + wake * 0.04})`);
  sh.addColorStop(0.45, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(1,6,8,0.7)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, DWl, DHl);
  // NEBULA HEARTS — the body is a torn ribbon of night sky, not solid flesh (the eldritch move).
  // Kept OFF the coil (u ~0.52–0.79) so the wound loop stays flesh-dark, not a glowing disc.
  const nebulaAt: [number, string][] = [
    [0.12, '40,170,120'],
    [0.33, '110,70,180'],
    [0.46, '30,140,150'],
    [0.9, '60,180,110'],
  ];
  for (const [uu, hue] of nebulaAt) {
    const p = pts[Math.round(uu * N)]!;
    const ng = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, Math.max(12, p.r * 3.1));
    ng.addColorStop(0, `rgba(${hue},${(0.2 + wake * 0.1) * (1 - sleep * 0.4)})`);
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(12, p.r * 3.1), 0, 6.283);
    ctx.fill();
  }
  // INTERIOR STARFIELD — fixed seed, so the sky inside the serpent is byte-stable every frame;
  // only the twinkle rides t.
  const srng = mulberry32(0x7a3e11);
  for (let i = 2; i < M; i += 2) {
    const p = chain[i]!;
    const nStars = 1 + (i % 3 === 0 ? 1 : 0);
    for (let j = 0; j < nStars; j++) {
      const off = (srng() * 2 - 1) * 0.78;
      const jx = (srng() - 0.5) * ds * sc;
      const rr2 = 0.45 + srng() * 1.25;
      const tw = 0.5 + 0.5 * Math.sin(t * 2.6 * spd + i * 1.7 + j * 2.4);
      const lit = 0.55 + 0.45 * (1 - (off + 1) / 2); // brighter toward the dorsal edge
      ctx.fillStyle = `rgba(214,255,232,${(0.2 + 0.55 * tw) * lit * (1 - sleep * 0.45)})`;
      ctx.beginPath();
      ctx.arc(p.x + p.nx * off * p.r + jx, p.y + p.ny * off * p.r, rr2, 0, 6.283);
      ctx.fill();
    }
  }
  // SCALES: dense crescent rows over the starfield — the beast is still flesh over the sky. Lit hard
  // toward the DORSAL edge (+normal, where the ridge runs): the top rows are bright pale-green plates,
  // the belly rows sink to faint dark seams (the cel read).
  for (let i = 2; i < M - 1; i += 2) {
    const p = chain[i]!;
    const shimmer = 0.5 + 0.5 * Math.sin(t * 2.2 * spd + i * 0.7);
    for (let j = -2; j <= 2; j++) {
      const off = (j / 2.4) * p.r;
      const cx = p.x + p.nx * off;
      const cy = p.y + p.ny * off;
      const sr = p.r * 0.4;
      const lit = (j + 2) / 4; // 0 belly → 1 dorsal
      ctx.strokeStyle = `rgba(${40 + lit * 90},${110 + lit * 110 + shimmer * 16 + wake * 14},${70 + lit * 70},${0.12 + lit * 0.34})`;
      ctx.lineWidth = 1.1 + lit * 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, sr, Math.atan2(p.ny, p.nx) - 1.9, Math.atan2(p.ny, p.nx) + 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── DORSAL RIDGE: a soft acid-glow band + a crisp crest line + short fin spines ──
  const ridge = (w: number, col: string): void => {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pts[i]!;
      const x = p.x + p.nx * p.r * 0.92;
      const y = p.y + p.ny * p.r * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  ridge(6, `rgba(${90 + wake * 50},235,${150 + wake * 40},${(0.1 + wake * 0.1) * (1 - sleep * 0.5)})`);
  ridge(2.2, `rgba(${120 + wake * 60},255,${170 + wake * 40},${(0.3 + wake * 0.3) * (1 - sleep * 0.5)})`);
  for (let i = 8; i < N - 4; i += 5) {
    const p = pts[i]!;
    const bx = p.x + p.nx * p.r;
    const by = p.y + p.ny * p.r;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + p.nx * (5 + p.r * 0.17), by + p.ny * (5 + p.r * 0.17));
    ctx.strokeStyle = `rgba(60,${150 + wake * 40},110,0.55)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── THE CONSTELLATION (GS-story-serpent-2): the World-Eater is a figure DRAWN IN STARS — glowing
  //    nodes strung along the spine, joined by faint chord lines, like a living star-map constellation.
  //    They dim as the Reseal sings it to sleep. ──
  const dimC = 1 - sleep * 0.55;
  ctx.strokeStyle = `rgba(150,255,200,${(0.26 + wake * 0.2) * dimC})`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const nodeIdx: number[] = [];
  for (let i = 4; i <= N - 4; i += 10) nodeIdx.push(i);
  for (let k = 0; k < nodeIdx.length; k++) {
    const p = pts[nodeIdx[k]!]!;
    if (k === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  for (let k = 0; k < nodeIdx.length; k++) {
    const p = pts[nodeIdx[k]!]!;
    const major = k % 3 === 0;
    const tw = 0.5 + 0.5 * Math.sin(t * 2.3 * spd + k * 2.1);
    const a = (0.45 + 0.5 * tw) * dimC;
    const gr = major ? 11 : 6.5;
    const ng = ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, gr);
    ng.addColorStop(0, `rgba(200,255,225,${0.75 * a})`);
    ng.addColorStop(0.45, `rgba(120,255,190,${0.3 * a})`);
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(p.x, p.y, gr, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = `rgba(234,255,242,${0.9 * a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, major ? 2.5 : 1.6, 0, 6.283);
    ctx.fill();
    if (major) {
      // 4-ray diffraction flare on the named stars
      const fl = 6.5 + tw * 3.5;
      ctx.strokeStyle = `rgba(210,255,230,${0.55 * a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - fl, p.y);
      ctx.lineTo(p.x + fl, p.y);
      ctx.moveTo(p.x, p.y - fl);
      ctx.lineTo(p.x, p.y + fl);
      ctx.stroke();
    }
  }

  // ── HEAD: a mythic world-serpent head — a horned crest, a deep-set reptilian eye under a shadowed brow,
  //    and a fanged maw that gapes wider as it wakes. Built in the local frame L(a,u): `a` forward from the
  //    neck, `u` along +normal (dorsal/up). ──
  return drawSerpentHead(ctx, pts[N]!, pts[N - 3]!, t, wake, focusHead, sleep, rage);
}

/** Draw the world-serpent HEAD at the neck point. Split out so it stays legible; pure. */
function drawSerpentHead(
  ctx: CanvasRenderingContext2D,
  neck: { x: number; y: number; r: number; nx: number; ny: number },
  back: { x: number; y: number },
  t: number,
  wake: number,
  focusHead: number,
  sleep = 0,
  rage = 0,
): SerpentAnchors {
  const fdx = neck.x - back.x;
  const fdy = neck.y - back.y;
  const flen = Math.hypot(fdx, fdy) || 1;
  const fx = fdx / flen;
  const fy = fdy / flen; // forward unit (along the body at the neck)
  const headAng = Math.atan2(fy, fx);
  // Head "up" (dorsal) = the BODY normal at the neck. With the body drawn head-on-left this points dorsal-up,
  // so the head is upright AND shares the body's end cross-section — it attaches by construction (no seam).
  const nx = neck.nx;
  const ny = neck.ny;
  const H = neck.r * (1 + focusHead * 0.15); // head tracks the (now much thicker) body — proportionate, not oversized
  const HL = H * 2.4; // head length along the snout
  const L = (a: number, u: number): { x: number; y: number } => ({
    x: neck.x + fx * a + nx * u,
    y: neck.y + fy * a + ny * u,
  });
  // The maw stays SHUT while it merely stirs and only gapes on the FINAL reveal; the EYE, though, opens
  // SLOWLY across the ceremonies (GS-story-serpent-eye) — sealed through the first teaser, a sliver at the
  // second, visibly cracked at the third ("the World-Eater's eye cracks open"), half-lidded and looking back
  // at the fourth — so the teaser captions and the drawn head finally agree. The full wide-open glare is
  // still the fifth-Sigil focus payoff (and the battle's wide-awake serpent).
  const gape = clamp01(focusHead * 0.95 + Math.max(0, wake - 0.62) * 0.4 + rage * 0.8) * (1 - sleep);
  const eyeOpen = serpentEyeOpen(wake, focusHead) * (1 - sleep);
  const litR = 60 + wake * 40;
  const litG = 168 + wake * 60;

  // (1) HORNS — a pair of smooth back-swept horns from the cranium (the mythic world-serpent), drawn behind
  //    the skull so the head overlaps their base. A near + far horn gives a touch of depth. Emerald-dark
  //    (grey horns read as a void between head and body — GS-story-serpent-2); tips returned so the
  //    constellation can hang stars on them.
  const drawHorn = (baseA: number, baseU: number, len: number, sweep: number, thick: number, lit: number): { x: number; y: number } => {
    const base = L(HL * baseA, H * baseU);
    const c1 = L(HL * (baseA - len * 0.35), H * (baseU + sweep * 0.55));
    const tipHorn = L(HL * (baseA - len), H * (baseU + sweep));
    const c2 = L(HL * (baseA - len * 0.4), H * (baseU + sweep * 0.5 - thick * 1.3));
    ctx.beginPath();
    ctx.moveTo(base.x + nx * H * thick, base.y + ny * H * thick);
    ctx.quadraticCurveTo(c1.x, c1.y, tipHorn.x, tipHorn.y);
    ctx.quadraticCurveTo(c2.x, c2.y, base.x - nx * H * thick, base.y - ny * H * thick);
    ctx.closePath();
    const hng = ctx.createLinearGradient(base.x, base.y, tipHorn.x, tipHorn.y);
    hng.addColorStop(0, `rgba(${14 + lit},${40 + lit + wake * 14},${30 + lit},1)`);
    hng.addColorStop(0.55, `rgba(${8 + lit * 0.5},${24 + lit * 0.7},${18 + lit * 0.5},1)`); // hard cel step
    hng.addColorStop(1, 'rgba(2,8,6,1)');
    ctx.fillStyle = hng;
    ctx.fill();
    ctx.strokeStyle = `rgba(${140 + wake * 60},230,180,0.6)`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    return tipHorn;
  };
  const hornTips: { x: number; y: number }[] = [];
  const hornLen = 1 - focusHead * 0.22; // the zoomed reveal keeps the blades from crossing the whole frame
  hornTips.push(drawHorn(-0.05, 1.0, 0.62 * hornLen, 0.42, 0.2, 0)); // far horn — swept BACK over the neck (dimmer, behind)
  hornTips.push(drawHorn(0.1, 1.16, 0.78 * hornLen, 0.52, 0.28, 18)); // near horn — bigger, lit, hooked back over the cranium

  // (2) LOWER JAW (drawn first, under the skull) — drops open by `gape`.
  const jawDrop = gape * H * 0.85;
  const jd = (a: number, u: number): { x: number; y: number } => L(a, u - jawDrop * (a / HL)); // hinge at the back
  const jHinge = L(HL * 0.32, -H * 0.16);
  const jChin = jd(HL * 0.92, -H * 0.34);
  const jTip = jd(HL * 1.02, -H * 0.16);
  ctx.beginPath();
  ctx.moveTo(jHinge.x, jHinge.y);
  ctx.quadraticCurveTo(jd(HL * 0.66, -H * 0.5).x, jd(HL * 0.66, -H * 0.5).y, jChin.x, jChin.y); // jaw underside
  ctx.quadraticCurveTo(jTip.x, jTip.y, jd(HL * 0.86, -H * 0.06).x, jd(HL * 0.86, -H * 0.06).y); // round the chin tip
  ctx.quadraticCurveTo(jd(HL * 0.6, -H * 0.02).x, jd(HL * 0.6, -H * 0.02).y, jHinge.x, jHinge.y); // gum line back to hinge
  ctx.closePath();
  const jg = ctx.createLinearGradient(jHinge.x, jHinge.y, jChin.x, jChin.y);
  jg.addColorStop(0, `rgba(20,${78 + wake * 24},58,1)`);
  jg.addColorStop(1, 'rgba(5,22,17,1)');
  ctx.fillStyle = jg;
  ctx.fill();

  // (3) MAW interior — a dark throat between the jaws when open.
  if (gape > 0.06) {
    ctx.beginPath();
    ctx.moveTo(L(HL * 0.34, -H * 0.14).x, L(HL * 0.34, -H * 0.14).y);
    ctx.quadraticCurveTo(L(HL * 0.7, -H * 0.02).x, L(HL * 0.7, -H * 0.02).y, L(HL * 0.98, -H * 0.12).x, L(HL * 0.98, -H * 0.12).y); // upper gum
    ctx.lineTo(jd(HL * 0.9, -H * 0.08).x, jd(HL * 0.9, -H * 0.08).y);
    ctx.quadraticCurveTo(jd(HL * 0.62, -H * 0.02).x, jd(HL * 0.62, -H * 0.02).y, jHinge.x, jHinge.y);
    ctx.closePath();
    const mg = ctx.createLinearGradient(L(HL * 0.5, 0).x, L(HL * 0.5, 0).y, jChin.x, jChin.y);
    mg.addColorStop(0, 'rgba(48,10,16,1)');
    mg.addColorStop(1, 'rgba(10,3,5,1)');
    ctx.fillStyle = mg;
    ctx.fill();
  }

  // (4) UPPER SKULL + SNOUT silhouette — one filled shape with a form gradient (lit dorsal → dark cheek).
  const nTop = L(-HL * 0.3, H * 0.98); // rear of the skull, extended WELL back over the neck cap (closes the seam)
  const b2 = L(HL * 0.33, H * 1.34); // the bony brow ridge over the eye
  const s1 = L(HL * 0.92, H * 0.5); // snout top
  const tip = L(HL * 1.08, H * 0.08); // snout tip
  const lip = L(HL * 1.0, -H * 0.14); // upper lip / gum
  const gapeC = L(HL * 0.3, -H * 0.14); // mouth corner (upper)
  ctx.beginPath();
  ctx.moveTo(nTop.x, nTop.y);
  ctx.bezierCurveTo(L(HL * 0.1, H * 1.28).x, L(HL * 0.1, H * 1.28).y, b2.x, b2.y, L(HL * 0.62, H * 1.02).x, L(HL * 0.62, H * 1.02).y); // over the brow
  ctx.quadraticCurveTo(s1.x, s1.y, tip.x, tip.y); // down the snout to the tip
  ctx.quadraticCurveTo(L(HL * 1.06, -H * 0.02).x, L(HL * 1.06, -H * 0.02).y, lip.x, lip.y); // round the nose to the gum
  ctx.quadraticCurveTo(L(HL * 0.62, -H * 0.02).x, L(HL * 0.62, -H * 0.02).y, gapeC.x, gapeC.y); // upper gum back to the corner
  ctx.quadraticCurveTo(L(-HL * 0.02, H * 0.14).x, L(-HL * 0.02, H * 0.14).y, nTop.x, nTop.y); // cheek back OVER the neck cap to the skull rear
  ctx.closePath();
  const hg = ctx.createLinearGradient(b2.x, b2.y, gapeC.x, gapeC.y);
  hg.addColorStop(0, `rgba(${litR},${litG},124,1)`); // lit brow / dorsal
  hg.addColorStop(0.5, `rgba(30,${104 + wake * 30},76,1)`);
  hg.addColorStop(1, `rgba(16,${56 + wake * 14},42,1)`); // shadowed cheek — kept near the body's tones so the head-body boundary never reads as a cut
  ctx.fillStyle = hg;
  ctx.fill();

  // (5) SCALES over the skull (clipped), directionally lit — a bright top edge + a soft shadow beneath.
  ctx.save();
  ctx.clip();
  // CEL PLANES (GS-story-serpent-2): two hard-edged flat tones inside the skull — a lit crown band
  // traced along the brow→snout silhouette and a dark jowl band along the gum line — so the head reads
  // as toon-shaded planes, matching the body's banding.
  ctx.strokeStyle = `rgba(${86 + wake * 30},${196 + wake * 34},130,0.5)`;
  ctx.lineWidth = H * 0.42;
  ctx.beginPath();
  ctx.moveTo(nTop.x, nTop.y);
  ctx.bezierCurveTo(L(HL * 0.1, H * 1.28).x, L(HL * 0.1, H * 1.28).y, b2.x, b2.y, L(HL * 0.62, H * 1.02).x, L(HL * 0.62, H * 1.02).y);
  ctx.quadraticCurveTo(s1.x, s1.y, tip.x, tip.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(6,26,20,0.55)';
  ctx.lineWidth = H * 0.34;
  ctx.beginPath();
  ctx.moveTo(gapeC.x, gapeC.y);
  ctx.quadraticCurveTo(L(HL * 0.62, -H * 0.02).x, L(HL * 0.62, -H * 0.02).y, lip.x, lip.y);
  ctx.stroke();
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const sc = L(HL * (0.08 + c * 0.17), H * (1.12 - r * 0.34));
      const sr = H * (0.16 - r * 0.012);
      ctx.strokeStyle = `rgba(${40 + wake * 20},${150 + wake * 40},100,0.5)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sr, headAng - 1.9, headAng + 1.9);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${150 + wake * 60},255,190,0.28)`; // scale highlight
      ctx.beginPath();
      ctx.arc(sc.x - nx * 1, sc.y - ny * 1, sr, headAng - 1.4, headAng + 0.2);
      ctx.stroke();
    }
  }
  // brow occlusion — a violet-black shadow the brow casts down into the eye socket (the eldritch cast)
  const socket = L(HL * 0.4, H * 0.5);
  const og = ctx.createRadialGradient(socket.x, socket.y + ny * H * 0.2, 1, socket.x, socket.y, H * 0.9);
  og.addColorStop(0, 'rgba(30,8,44,0.6)');
  og.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = og;
  ctx.fillRect(neck.x - HL, neck.y - HL, HL * 2.5, HL * 2.5);
  ctx.restore();

  // (6) FANGS — curved two-tone sabre fangs rooted in the gums (GS-story-serpent-2: the old straight
  //     triangles read as floating shards). Each fang is a bowed blade: the leading edge arcs forward,
  //     the tip hooks back toward the throat like a real snake fang; a lit front + shaded back half.
  const fang = (base: { x: number; y: number }, len: number, up: boolean): void => {
    const dirx = up ? nx : -nx; // lower fangs point dorsal-up, upper fangs hang down
    const diry = up ? ny : -ny;
    const w = Math.max(2.2, len * 0.3); // root half-width along the gum
    const tipF = { x: base.x + dirx * len - fx * len * 0.42, y: base.y + diry * len - fy * len * 0.42 };
    const front = { x: base.x + fx * w, y: base.y + fy * w };
    const backP = { x: base.x - fx * w, y: base.y - fy * w };
    const cFront = { x: base.x + fx * w * 0.9 + dirx * len * 0.62, y: base.y + fy * w * 0.9 + diry * len * 0.62 };
    const cBack = { x: base.x - fx * w * 0.7 + dirx * len * 0.5, y: base.y - fy * w * 0.7 + diry * len * 0.5 };
    ctx.beginPath();
    ctx.moveTo(front.x, front.y);
    ctx.quadraticCurveTo(cFront.x, cFront.y, tipF.x, tipF.y);
    ctx.quadraticCurveTo(cBack.x, cBack.y, backP.x, backP.y);
    ctx.closePath();
    const fg = ctx.createLinearGradient(front.x, front.y, backP.x, backP.y);
    fg.addColorStop(0, '#f8fff2');
    fg.addColorStop(0.55, '#dcead2');
    fg.addColorStop(0.56, '#aebfa2'); // the hard cel step — lit front plane, shaded back plane
    fg.addColorStop(1, '#8fa084');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(46,66,52,0.7)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  };
  if (gape > 0.06 || eyeOpen > 0.3) {
    fang(L(HL * 0.92, -H * 0.1), H * (0.3 + gape * 0.2), false);
    fang(L(HL * 0.72, -H * 0.1), H * (0.21 + gape * 0.15), false);
    fang(L(HL * 0.52, -H * 0.1), H * (0.14 + gape * 0.1), false);
    if (gape > 0.2) {
      fang(jd(HL * 0.84, -H * 0.05), H * (0.24 + gape * 0.13), true);
      fang(jd(HL * 0.62, -H * 0.05), H * (0.17 + gape * 0.1), true);
    }
  }

  // (7) NOSTRIL slit near the snout tip.
  const nostril = L(HL * 0.9, H * 0.3);
  ctx.strokeStyle = 'rgba(5,22,17,0.9)';
  ctx.lineWidth = Math.max(1.4, H * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(nostril.x - fx * H * 0.09, nostril.y - fy * H * 0.09);
  ctx.quadraticCurveTo(nostril.x + nx * H * 0.06, nostril.y + ny * H * 0.06, nostril.x + fx * H * 0.09, nostril.y + fy * H * 0.09);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // (8) forked TONGUE flicking from the maw once it opens — a slender TAPERED ribbon arcing out of
  //     the throat with a gentle droop, not the old thick stroked Y (GS-story-serpent-2).
  if (gape > 0.12) {
    const flick = 0.5 + 0.5 * Math.sin(t * 9);
    const a = clamp01((gape - 0.12) * 2.2);
    const mouth = L(HL * 0.78, -H * (0.1 + gape * 0.34)); // from INSIDE the open maw
    const ext = H * (0.55 + flick * 0.55);
    // direction: forward with a slight droop, the tip lifting on the flick
    const ddx = fx - nx * (0.3 - flick * 0.25);
    const ddy = fy - ny * (0.3 - flick * 0.25);
    const dl = Math.hypot(ddx, ddy) || 1;
    const tx2 = mouth.x + (ddx / dl) * ext;
    const ty2 = mouth.y + (ddy / dl) * ext;
    const midx = mouth.x + (ddx / dl) * ext * 0.5 - nx * ext * 0.16; // sag at the middle
    const midy = mouth.y + (ddy / dl) * ext * 0.5 - ny * ext * 0.16;
    const w0 = Math.max(1.4, H * 0.055); // root half-width, tapering to a point
    ctx.fillStyle = `rgba(198,42,86,${a})`;
    ctx.beginPath();
    ctx.moveTo(mouth.x + nx * w0, mouth.y + ny * w0);
    ctx.quadraticCurveTo(midx + nx * w0 * 0.5, midy + ny * w0 * 0.5, tx2, ty2);
    ctx.quadraticCurveTo(midx - nx * w0 * 0.5, midy - ny * w0 * 0.5, mouth.x - nx * w0, mouth.y - ny * w0);
    ctx.closePath();
    ctx.fill();
    // fork tines — two hair-thin flicks off the tip
    const tineF = H * 0.22;
    const tineS = H * 0.12;
    ctx.strokeStyle = `rgba(226,60,100,${a})`;
    ctx.lineWidth = Math.max(1, H * 0.022);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx2, ty2);
    ctx.lineTo(tx2 + (ddx / dl) * tineF + nx * tineS, ty2 + (ddy / dl) * tineF + ny * tineS);
    ctx.moveTo(tx2, ty2);
    ctx.lineTo(tx2 + (ddx / dl) * tineF - nx * tineS * 0.6, ty2 + (ddy / dl) * tineF - ny * tineS * 0.6);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // (9) the great EYE — deep-set, reptilian, under the brow. Mottled sclera, a vertical slit pupil, a glow.
  const eye = L(HL * 0.42, H * 0.5);
  const hx = eye.x;
  const hy = eye.y;
  const eyeR = H * (0.4 + focusHead * 0.16);
  // Lid APERTURE tracks eyeOpen hard (GS-story-serpent-eye): a cracked eye is a genuine narrow slit,
  // a watching eye half-lidded, the reveal wide — so the slow opening reads across the teasers.
  const aper = 0.16 + eyeOpen * 0.84;
  if (eyeOpen > 0.04) {
    // THE EYE IS THE FOCAL POINT (GS-story-serpent-2): a layered menace glow — a wide VIOLET corona
    // bleeding into the dark, a hot GOLD bloom hugging the eye — pulsing, so it reads as the one
    // burning point even on the zoomed-out teasers.
    const pulse = 0.82 + 0.18 * Math.sin(t * 3.1);
    const vg = ctx.createRadialGradient(hx, hy, 2, hx, hy, eyeR * 2.6);
    vg.addColorStop(0, `rgba(168,92,235,${0.4 * eyeOpen * pulse})`);
    vg.addColorStop(0.45, `rgba(112,52,180,${0.2 * eyeOpen * pulse})`);
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(hx, hy, eyeR * 2.6, 0, 6.283);
    ctx.fill();
    const eg = ctx.createRadialGradient(hx, hy, 1, hx, hy, eyeR * 1.4);
    eg.addColorStop(0, `rgba(255,232,120,${0.6 * eyeOpen * pulse})`);
    eg.addColorStop(0.6, `rgba(230,180,70,${0.28 * eyeOpen * pulse})`);
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(hx, hy, eyeR * 1.4, 0, 6.283);
    ctx.fill();
    // eyeball clipped to the lid aperture (opens with eyeOpen)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR, eyeR * aper, headAng, 0, 6.283);
    ctx.clip();
    // toxic pale sclera
    const sg = ctx.createRadialGradient(hx - nx * eyeR * 0.3, hy - ny * eyeR * 0.3, 1, hx, hy, eyeR);
    sg.addColorStop(0, '#fbffe2');
    sg.addColorStop(0.55, '#cfe08c');
    sg.addColorStop(1, '#465220');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(hx, hy, eyeR, 0, 6.283);
    ctx.fill();
    // corrupted veins — violet, crawling in from the rim
    ctx.strokeStyle = 'rgba(128,54,166,0.6)';
    ctx.lineWidth = Math.max(0.7, eyeR * 0.03);
    for (let i = 0; i < 6; i++) {
      const aa = headAng + Math.PI + (i - 2.5) * 0.45;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(aa) * eyeR, hy + Math.sin(aa) * eyeR);
      ctx.quadraticCurveTo(hx + Math.cos(aa) * eyeR * 0.4, hy + Math.sin(aa) * eyeR * 0.4, hx + Math.cos(aa + 0.2) * eyeR * 0.5, hy + Math.sin(aa + 0.2) * eyeR * 0.5);
      ctx.stroke();
    }
    // molten GOLD iris under a VIOLET limbal ring
    const ig = ctx.createRadialGradient(hx, hy, 1, hx, hy, eyeR * 0.64);
    ig.addColorStop(0, '#ffef9e');
    ig.addColorStop(0.45, '#f2c44e');
    ig.addColorStop(0.8, `rgba(170,120,40,1)`);
    ig.addColorStop(1, '#3c2c10');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.64, eyeR * 0.64, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = `rgba(150,70,215,${0.5 + 0.35 * pulse})`;
    ctx.lineWidth = Math.max(1, eyeR * 0.07);
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.64, eyeR * 0.64, 0, 0, 6.283);
    ctx.stroke();
    // iris flecks — radial gold striations toward the slit
    ctx.strokeStyle = 'rgba(120,80,20,0.5)';
    ctx.lineWidth = Math.max(0.6, eyeR * 0.02);
    for (let i = 0; i < 9; i++) {
      const aa = (i / 9) * 6.283 + 0.3;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(aa) * eyeR * 0.24, hy + Math.sin(aa) * eyeR * 0.24);
      ctx.lineTo(hx + Math.cos(aa) * eyeR * 0.58, hy + Math.sin(aa) * eyeR * 0.58);
      ctx.stroke();
    }
    // slit pupil oriented along the head normal (perpendicular to the snout), rimmed in burning gold
    ctx.fillStyle = 'rgba(6,4,10,0.97)';
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.15, eyeR * 0.58, headAng, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,214,90,${0.55 + 0.3 * Math.sin(t * 5)})`;
    ctx.lineWidth = Math.max(0.8, eyeR * 0.035);
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.15, eyeR * 0.58, headAng, 0, 6.283);
    ctx.stroke();
    // a violet ember burning INSIDE the slit
    ctx.fillStyle = `rgba(190,120,255,${0.35 + 0.3 * Math.sin(t * 5 + 1.2)})`;
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.05, eyeR * 0.4, headAng, 0, 6.283);
    ctx.fill();
    // cold glint
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(hx - nx * eyeR * 0.35 + fx * eyeR * 0.25, hy - ny * eyeR * 0.35 + fy * eyeR * 0.25, eyeR * 0.09, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }
  // heavy upper lid / brow rim casting over the eye — traces the aperture, so it narrows with the lids
  ctx.strokeStyle = `rgba(${20 + wake * 20},${70 + wake * 30},52,1)`;
  ctx.lineWidth = 3 + focusHead * 3 + H * 0.04;
  ctx.beginPath();
  ctx.ellipse(hx, hy, eyeR + 2, eyeR * (aper + 0.08), headAng, Math.PI, Math.PI * 2);
  ctx.stroke();
  // lower lid
  ctx.lineWidth = 2 + focusHead * 2;
  ctx.beginPath();
  ctx.ellipse(hx, hy, eyeR + 1, eyeR * (aper + 0.08), headAng, 0, Math.PI);
  ctx.stroke();
  // the closed slit line when nearly shut
  if (eyeOpen < 0.4) {
    ctx.strokeStyle = `rgba(120,220,160,${(0.4 - eyeOpen) * 1.6})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - nx * eyeR, hy - ny * eyeR);
    ctx.lineTo(hx + nx * eyeR, hy + ny * eyeR);
    ctx.stroke();
  }

  // (10) RIM LIGHT along the top silhouette (brow → snout) — the eldritch backlight.
  ctx.strokeStyle = `rgba(${150 + wake * 80},255,${190 + wake * 40},${(0.35 + wake * 0.35) * (1 - sleep * 0.45)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nTop.x, nTop.y);
  ctx.bezierCurveTo(L(HL * 0.1, H * 1.28).x, L(HL * 0.1, H * 1.28).y, b2.x, b2.y, L(HL * 0.62, H * 1.02).x, L(HL * 0.62, H * 1.02).y);
  ctx.quadraticCurveTo(s1.x, s1.y, tip.x, tip.y);
  ctx.stroke();

  // (11) STARLIT CREST (GS-story-serpent-2) — the constellation continues onto the head: star nodes
  //     burn at the horn tips and the snout, twinkling with the body's rhythm.
  const crestStar = (p: { x: number; y: number }, idx: number, big: boolean): void => {
    const tw = 0.5 + 0.5 * Math.sin(t * 2.5 + idx * 1.9);
    const a = (0.45 + 0.45 * tw) * (1 - sleep * 0.55);
    const gr = big ? 9 : 6;
    const sgl = ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, gr);
    sgl.addColorStop(0, `rgba(200,255,225,${0.8 * a})`);
    sgl.addColorStop(0.45, `rgba(120,255,190,${0.32 * a})`);
    sgl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sgl;
    ctx.beginPath();
    ctx.arc(p.x, p.y, gr, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = `rgba(234,255,242,${0.9 * a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, big ? 2.2 : 1.5, 0, 6.283);
    ctx.fill();
    if (big) {
      const fl = 5.5 + tw * 3;
      ctx.strokeStyle = `rgba(210,255,230,${0.55 * a})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - fl, p.y);
      ctx.lineTo(p.x + fl, p.y);
      ctx.moveTo(p.x, p.y - fl);
      ctx.lineTo(p.x, p.y + fl);
      ctx.stroke();
    }
  };
  crestStar(hornTips[1]!, 0, true);
  crestStar(hornTips[0]!, 1, false);
  crestStar(tip, 2, false);

  // GS-story-battle-2: hand the battle the drawn head's anchors (the graphic IS the target).
  return { eyeX: hx, eyeY: hy, eyeR, browX: b2.x, browY: b2.y, headH: H, headAng };
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
    dpr = canvasRatio();
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

  /** The waking serpent, in this cinematic's design space. Thin wrapper over the exported `paintSerpent`
   *  — the ceremony is a centred full-frame cut, so it sprawls wider than the battle's default framing. */
  function drawSerpent(t: number, wake: number, focusHead: number): void {
    if (!ctx) return;
    paintSerpent(ctx, CX, CY, t, wake, focusHead, { spread: 700 });
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
      else caption(serpentStirCaption(sigilCount), '', capA * 0.8);
    } else {
      // CAPTION hold
      const cp = clamp01((e - B.serpent) / P.caption);
      drawBackdrop(t, 'abyss', 0);
      const wake = wakefulness;
      const focusHead = isFinal ? 1 : 0;
      drawSerpent(t, wake, focusHead);
      const a = easeOut(clamp01(cp * 2)) * (cp > 0.8 ? clamp01((1 - cp) / 0.2) : 1);
      if (isFinal) caption('The Keystone is complete.', 'The World-Eater wakes. Its eye is open. Ragnarök begins.', a);
      else caption(`${opts.sigilName} is set.`, keystoneSubtitle(sigilCount, total), a);
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
