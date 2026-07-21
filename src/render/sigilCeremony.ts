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
 * Paint the waking world-serpent (GS-story-serpent) into `ctx`, centred on (CX, CY) in the ceremony's
 * 1000×640 design space. A MASSIVE scaled serpent, not a string of beads: a continuous tapered body with
 * overlapping crescent scales + a lit dorsal ridge, capped by a proper wedge HEAD — brow, snout, jaw, a
 * proportionate slit-pupil eye set into the brow, and a forked tongue. `wake` 0..1 = how awake it is
 * (drowsy stir → eye wide open); `focusHead` 0..1 zooms in on the head for the final reveal.
 * Exported so `scripts/serpent-preview.mjs` can render the head eyes-on at any `wake`/`focusHead`.
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

export function paintSerpent(
  ctx: CanvasRenderingContext2D,
  CX: number,
  CY: number,
  t: number,
  wake: number,
  focusHead: number,
): SerpentAnchors {
  const DWl = 1000;
  const DHl = 640;
  // eldritch haze
  const haze = ctx.createRadialGradient(CX, CY + 40, 40, CX, CY + 40, 560);
  haze.addColorStop(0, `rgba(60,${160 + wake * 60},120,${0.1 + wake * 0.16})`);
  haze.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, DWl, DHl);

  const stir = wake * (0.6 + 0.4 * Math.sin(t * (1.2 + wake)));
  const baseY = CY + 90 - focusHead * 120;
  const spread = lerp(620, 300, focusHead);
  const amp = 62 + stir * 44;
  const phase = t * (0.6 + wake * 0.9);
  const girth = 1 + focusHead * 1.9; // the whole serpent swells to a MASSIVE thick body on the final reveal
  const N = 64;
  // The spine + a half-width (radius) that tapers from a thin tail to a thick neck.
  const sx = (u: number): number => CX + spread / 2 - u * spread; // head on the LEFT (GS-story-serpent: keeps the head upright + attached — the body normal points dorsal-up at the head)
  const sy = (u: number): number => baseY + Math.sin(u * 5.6 + phase) * amp * (0.35 + u * 0.75);
  const rad = (u: number): number => lerp(7, 46, Math.pow(u, 0.85)) * girth;
  type Pt = { u: number; x: number; y: number; r: number; nx: number; ny: number };
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pts.push({ u, x: sx(u), y: sy(u), r: rad(u), nx: 0, ny: 0 });
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
  // ── BODY: one filled ribbon (top edge forward, bottom edge back) ──
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x + pts[0]!.nx * pts[0]!.r, pts[0]!.y + pts[0]!.ny * pts[0]!.r);
  for (let i = 1; i <= N; i++) ctx.lineTo(pts[i]!.x + pts[i]!.nx * pts[i]!.r, pts[i]!.y + pts[i]!.ny * pts[i]!.r);
  for (let i = N; i >= 0; i--) ctx.lineTo(pts[i]!.x - pts[i]!.nx * pts[i]!.r, pts[i]!.y - pts[i]!.ny * pts[i]!.r);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, baseY - 130, 0, baseY + 150);
  bg.addColorStop(0, `rgba(${46 + wake * 30},${150 + wake * 50},110,1)`); // lit dorsal
  bg.addColorStop(0.5, `rgba(24,${86 + wake * 30},64,1)`);
  bg.addColorStop(1, 'rgba(6,26,20,1)'); // dark belly
  ctx.fillStyle = bg;
  ctx.fill();

  // ── SCALES: overlapping crescent rows across the body, brighter along the back ──
  ctx.save();
  ctx.clip(); // to the body path just filled
  for (let i = 2; i < N - 1; i += 2) {
    const p = pts[i]!;
    const shimmer = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.7);
    for (let j = -2; j <= 2; j++) {
      const off = (j / 2.4) * p.r; // lateral position across the body (−back .. +belly)
      const cx = p.x + p.nx * off;
      const cy = p.y + p.ny * off;
      const sr = p.r * 0.42;
      const lit = 1 - Math.abs(j) / 3; // scales catch light toward the back
      const gG = 120 + lit * 90 + shimmer * 20 + wake * 20;
      ctx.strokeStyle = `rgba(${30 + lit * 30},${gG},${70 + lit * 20},${0.5 + lit * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // a scale = a small crescent opening toward the tail
      ctx.arc(cx + p.nx * 0, cy + p.ny * 0, sr, Math.atan2(p.ny, p.nx) - 1.9, Math.atan2(p.ny, p.nx) + 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ── DORSAL RIDGE: a lit crest line + short spines along the back edge ──
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const p = pts[i]!;
    const x = p.x + p.nx * p.r * 0.9;
    const y = p.y + p.ny * p.r * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(${120 + wake * 60},255,${170 + wake * 40},${0.35 + wake * 0.3})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  for (let i = 6; i < N - 2; i += 3) {
    const p = pts[i]!;
    const bx = p.x + p.nx * p.r;
    const by = p.y + p.ny * p.r;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + p.nx * (6 + p.r * 0.16), by + p.ny * (6 + p.r * 0.16));
    ctx.strokeStyle = `rgba(60,${150 + wake * 40},110,0.6)`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ── HEAD: a mythic world-serpent head — a horned crest, a deep-set reptilian eye under a shadowed brow,
  //    and a fanged maw that gapes wider as it wakes. Built in the local frame L(a,u): `a` forward from the
  //    neck, `u` along +normal (dorsal/up). ──
  return drawSerpentHead(ctx, pts[N]!, pts[N - 3]!, t, wake, focusHead);
}

/** Draw the world-serpent HEAD at the neck point. Split out so it stays legible; pure. */
function drawSerpentHead(
  ctx: CanvasRenderingContext2D,
  neck: { x: number; y: number; r: number; nx: number; ny: number },
  back: { x: number; y: number },
  t: number,
  wake: number,
  focusHead: number,
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
  // The maw + eye stay SHUT while it merely stirs (the non-final sigils, focusHead=0) and only open on the
  // FINAL reveal as the camera cuts to the head — the eye opening is the fifth-Sigil payoff. A touch of `wake`
  // past ~0.6 adds the faintest life to a restless serpent, but never a fully open eye off the reveal.
  const gape = clamp01(focusHead * 0.95 + Math.max(0, wake - 0.62) * 0.4);
  const eyeOpen = clamp01(focusHead * 1.05 + Math.max(0, wake - 0.6) * 0.18);
  const litR = 60 + wake * 40;
  const litG = 168 + wake * 60;

  // (1) HORNS — a pair of smooth back-swept horns from the cranium (the mythic world-serpent), drawn behind
  //    the skull so the head overlaps their base. A near + far horn gives a touch of depth.
  const drawHorn = (baseA: number, baseU: number, len: number, sweep: number, thick: number, lit: number): void => {
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
    hng.addColorStop(0, `rgba(${52 + lit},${66 + lit},${54 + lit},1)`);
    hng.addColorStop(1, 'rgba(10,18,14,1)');
    ctx.fillStyle = hng;
    ctx.fill();
    ctx.strokeStyle = `rgba(${140 + wake * 60},230,180,0.3)`;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  };
  drawHorn(-0.05, 1.0, 0.95, 0.34, 0.17, 0); // far horn — swept BACK over the neck (dimmer, behind)
  drawHorn(0.1, 1.16, 1.1, 0.42, 0.23, 20); // near horn — bigger, lit, laid back over the cranium

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
  const nTop = L(-HL * 0.16, H * 1.04); // rear of the skull, extended BACK over the body end (closes the neck seam)
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
  ctx.quadraticCurveTo(L(HL * 0.12, H * 0.24).x, L(HL * 0.12, H * 0.24).y, nTop.x, nTop.y); // cheek back up to the neck-top
  ctx.closePath();
  const hg = ctx.createLinearGradient(b2.x, b2.y, gapeC.x, gapeC.y);
  hg.addColorStop(0, `rgba(${litR},${litG},124,1)`); // lit brow / dorsal
  hg.addColorStop(0.5, `rgba(30,${104 + wake * 30},76,1)`);
  hg.addColorStop(1, 'rgba(8,32,24,1)'); // shadowed cheek
  ctx.fillStyle = hg;
  ctx.fill();

  // (5) SCALES over the skull (clipped), directionally lit — a bright top edge + a soft shadow beneath.
  ctx.save();
  ctx.clip();
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
  // brow occlusion — a soft shadow the brow casts down into the eye socket
  const socket = L(HL * 0.4, H * 0.5);
  const og = ctx.createRadialGradient(socket.x, socket.y + ny * H * 0.2, 1, socket.x, socket.y, H * 0.9);
  og.addColorStop(0, 'rgba(0,0,0,0.55)');
  og.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = og;
  ctx.fillRect(neck.x - HL, neck.y - HL, HL * 2.5, HL * 2.5);
  ctx.restore();

  // (6) FANGS — curved white fangs from the upper gum (and, when open, the lower jaw).
  const fang = (base: { x: number; y: number }, len: number, curl: number): void => {
    const dtx = fx * curl - nx; // downward-and-slightly-forward
    const dty = fy * curl - ny;
    const dl = Math.hypot(dtx, dty) || 1;
    const tipF = { x: base.x + (dtx / dl) * len, y: base.y + (dty / dl) * len };
    ctx.beginPath();
    ctx.moveTo(base.x + fx * len * 0.16, base.y + fy * len * 0.16);
    ctx.quadraticCurveTo(base.x + (dtx / dl) * len * 0.6 + fx * len * 0.1, base.y + (dty / dl) * len * 0.6 + fy * len * 0.1, tipF.x, tipF.y);
    ctx.quadraticCurveTo(base.x + (dtx / dl) * len * 0.55 - fx * len * 0.1, base.y + (dty / dl) * len * 0.55 - fy * len * 0.1, base.x - fx * len * 0.16, base.y - fy * len * 0.16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(236,255,242,0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,130,0.5)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  };
  if (gape > 0.06 || eyeOpen > 0.3) {
    fang(L(HL * 0.94, -H * 0.12), H * (0.28 + gape * 0.18), 0.5);
    fang(L(HL * 0.74, -H * 0.12), H * (0.2 + gape * 0.14), 0.5);
    if (gape > 0.2) {
      fang(jd(HL * 0.86, -H * 0.06), -H * (0.2 + gape * 0.12), -0.4); // lower fang points up
      fang(jd(HL * 0.66, -H * 0.06), -H * (0.15 + gape * 0.1), -0.4);
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

  // (8) forked TONGUE flicking from the maw once it opens (the reveal).
  if (gape > 0.12) {
    const flick = 0.5 + 0.5 * Math.sin(t * 9);
    const a = clamp01((gape - 0.12) * 2.2);
    const mouth = L(HL * 1.0, -H * (0.12 + gape * 0.2));
    const ext = H * (0.5 + flick * 0.9);
    const forkX = mouth.x + fx * ext;
    const forkY = mouth.y + fy * ext;
    const tineF = H * 0.32;
    const tineS = H * 0.18;
    ctx.strokeStyle = `rgba(224,46,78,${a})`;
    ctx.lineWidth = Math.max(1.6, H * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mouth.x, mouth.y);
    ctx.lineTo(forkX, forkY);
    ctx.moveTo(forkX, forkY);
    ctx.lineTo(forkX + fx * tineF + nx * tineS, forkY + fy * tineF + ny * tineS);
    ctx.moveTo(forkX, forkY);
    ctx.lineTo(forkX + fx * tineF - nx * tineS, forkY + fy * tineF - ny * tineS);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // (9) the great EYE — deep-set, reptilian, under the brow. Mottled sclera, a vertical slit pupil, a glow.
  const eye = L(HL * 0.42, H * 0.5);
  const hx = eye.x;
  const hy = eye.y;
  const eyeR = H * (0.4 + focusHead * 0.16);
  if (eyeOpen > 0.04) {
    // outer glow
    const eg = ctx.createRadialGradient(hx, hy, 2, hx, hy, eyeR * 1.7);
    eg.addColorStop(0, `rgba(150,255,190,${0.5 * eyeOpen})`);
    eg.addColorStop(0.5, `rgba(60,${190 + wake * 40},130,${0.3 * eyeOpen})`);
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(hx, hy, eyeR * 1.7, 0, 6.283);
    ctx.fill();
    // eyeball clipped to the lid aperture (opens with eyeOpen)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR, eyeR * (0.5 + eyeOpen * 0.5), headAng, 0, 6.283);
    ctx.clip();
    const sg = ctx.createRadialGradient(hx - nx * eyeR * 0.3, hy - ny * eyeR * 0.3, 1, hx, hy, eyeR);
    sg.addColorStop(0, '#eafff0');
    sg.addColorStop(0.55, '#a6d888');
    sg.addColorStop(1, '#3a5a2a');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(hx, hy, eyeR, 0, 6.283);
    ctx.fill();
    // bloodshot veins
    ctx.strokeStyle = 'rgba(150,40,54,0.5)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) {
      const aa = headAng + Math.PI + (i - 2) * 0.5;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(aa) * eyeR, hy + Math.sin(aa) * eyeR);
      ctx.quadraticCurveTo(hx + Math.cos(aa) * eyeR * 0.4, hy + Math.sin(aa) * eyeR * 0.4, hx + Math.cos(aa + 0.2) * eyeR * 0.5, hy + Math.sin(aa + 0.2) * eyeR * 0.5);
      ctx.stroke();
    }
    // iris + vertical slit pupil (across the head, i.e. along the normal)
    const ig = ctx.createRadialGradient(hx, hy, 1, hx, hy, eyeR * 0.62);
    ig.addColorStop(0, '#8fffbe');
    ig.addColorStop(0.6, `rgba(60,${180 + wake * 40},110,1)`);
    ig.addColorStop(1, '#0c3a22');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.62, eyeR * 0.62, 0, 0, 6.283);
    ctx.fill();
    // slit pupil oriented along the head normal (perpendicular to the snout)
    ctx.fillStyle = 'rgba(4,8,4,0.96)';
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.14, eyeR * 0.56, headAng, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = `rgba(180,255,210,${0.4 + 0.3 * Math.sin(t * 5)})`;
    ctx.beginPath();
    ctx.ellipse(hx, hy, eyeR * 0.05, eyeR * 0.4, headAng, 0, 6.283);
    ctx.fill();
    // cold glint
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(hx - nx * eyeR * 0.35 + fx * eyeR * 0.25, hy - ny * eyeR * 0.35 + fy * eyeR * 0.25, eyeR * 0.09, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }
  // heavy upper lid / brow rim casting over the eye
  ctx.strokeStyle = `rgba(${20 + wake * 20},${70 + wake * 30},52,1)`;
  ctx.lineWidth = 3 + focusHead * 3 + H * 0.04;
  ctx.beginPath();
  ctx.ellipse(hx, hy, eyeR + 2, eyeR * (0.6 + eyeOpen * 0.5), headAng, Math.PI, Math.PI * 2);
  ctx.stroke();
  // lower lid
  ctx.lineWidth = 2 + focusHead * 2;
  ctx.beginPath();
  ctx.ellipse(hx, hy, eyeR + 1, eyeR * (0.6 + eyeOpen * 0.5), headAng, 0, Math.PI);
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
  ctx.strokeStyle = `rgba(${150 + wake * 80},255,${190 + wake * 40},${0.35 + wake * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nTop.x, nTop.y);
  ctx.bezierCurveTo(L(HL * 0.1, H * 1.28).x, L(HL * 0.1, H * 1.28).y, b2.x, b2.y, L(HL * 0.62, H * 1.02).x, L(HL * 0.62, H * 1.02).y);
  ctx.quadraticCurveTo(s1.x, s1.y, tip.x, tip.y);
  ctx.stroke();

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

  /** The waking serpent, in this cinematic's design space. Thin wrapper over the exported `paintSerpent`. */
  function drawSerpent(t: number, wake: number, focusHead: number): void {
    if (!ctx) return;
    paintSerpent(ctx, CX, CY, t, wake, focusHead);
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
