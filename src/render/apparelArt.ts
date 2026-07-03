/**
 * Apparel vector art (GS-cosmetics) — draws the cosmetic hats & shirts as self-contained SVG glyphs
 * (no asset, the house no-404 rule). The wardrobe cards show the garment ICON; the full-body
 * `golferPreviewSVG` shows the golfer wearing the equipped hat + shirt + pants (the Clubhouse stage
 * and lounge both mount it). The clubhouse look stands on its own — cel-shaded, characterful — and
 * stays RECOGNISABLE as the on-course outfit by sharing the same `ApparelLook` shapes + palette that
 * the canvas `drawGolfer` (playView.ts) keys off. Pure string builders.
 */

import { apparelById, type ApparelLook } from '../sim/rpg/apparel';

/** Lighten (amt>0, toward white) or darken (amt<0, toward black) a #rrggbb colour. Anything that
 *  isn't 6-digit hex passes through untouched. */
function shade(hex: string, amt: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = (v: number): number =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** A soft glowing aura for the legendary/mythic tiers (a radial halo behind the garment). */
function aura(cx: number, cy: number, r: number, col: string, id: string): string {
  return `<defs><radialGradient id="${id}"><stop offset="0%" stop-color="${col}" stop-opacity="0.8"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"><animate attributeName="opacity" values="0.5;1;0.5" dur="2.4s" repeatCount="indefinite"/></circle>`;
}

/** A few twinkling sparkles (mythic flair). */
function sparkles(pts: [number, number][]): string {
  return pts
    .map(
      ([x, y], i) =>
        `<path transform="translate(${x} ${y})" d="M0,-2.2 L0.6,-0.6 L2.2,0 L0.6,0.6 L0,2.2 L-0.6,0.6 L-2.2,0 L-0.6,-0.6 Z" fill="#fff"><animate attributeName="opacity" values="0.2;1;0.2" dur="${(1.5 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path>`,
    )
    .join('');
}

/**
 * Draw a HAT glyph on a head of radius `r` centred at (cx,cy). The shapes are authored in a canonical
 * frame with the head centre at the origin and head radius R0 = 7 — the SAME numbers as the on-course
 * `drawHat` (playView.ts) — then a single `scale(r/R0)` fits them to whatever head they sit on. That
 * mirror is why "what you buy is what you wear": a proper full-head helmet on the course draws as a
 * proper full-head helmet in the wardrobe/clubhouse, never a little bubble perched on top.
 */
function hatGlyph(look: ApparelLook, cx: number, cy: number, r: number, uid: string): string {
  const { shape, color, accent = '#15161c', glow } = look;
  const R0 = 7; // canonical head radius the shapes below are drawn against (= drawHat's on-course r)
  const s = r / R0;
  const ink = 'stroke="#0c1116" stroke-width="1" stroke-linejoin="round"';
  const a = glow ? aura(0, -R0, R0 + 6, glow, `hg${uid}`) : '';
  let g = '';
  switch (shape) {
    case 'cap':
      // Dome (top half-circle sitting on the head) + a brim curving down over the brow (front view).
      g = `<path d="M-7,-2 A7 7 0 0 1 7,-2 Z" fill="${color}" ${ink}/>
        <path d="M-5.2,-7.2 A7 7 0 0 1 2,-8.5 Q-2.6,-6.2 -5.2,-7.2 Z" fill="#ffffff" opacity="0.22"/>
        <path d="M-6.5,-2 Q0,2.6 6.5,-2 Z" fill="${accent}" ${ink}/>
        <circle cx="0" cy="-8.6" r="0.9" fill="${accent}" stroke="#0c1116" stroke-width="0.6"/>`;
      break;
    case 'bucket':
      g = `<path d="M-6.5,-1 A6.5 6.5 0 0 1 6.5,-1 Z" fill="${color}" ${ink}/>
        <path d="M-4.6,-6 A6.5 6.5 0 0 1 1.6,-7.6 Q-2.4,-5.6 -4.6,-6 Z" fill="#ffffff" opacity="0.2"/>
        <ellipse cx="0" cy="0" rx="11" ry="2.6" fill="${accent}" ${ink}/>`;
      break;
    case 'visor':
      // Open-top: a brim curving down over the brow + a headband arcing across it (front view).
      g = `<path d="M-7.5,-1 Q0,3.4 7.5,-1 Z" fill="${accent}" ${ink}/>
        <path d="M-7,-2.4 A7 7 0 0 1 7,-2.4" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
      break;
    case 'tophat':
      g = `<rect x="-5" y="-16" width="10" height="11" rx="1" fill="${color}" ${ink}/>
        <rect x="-4.2" y="-15.2" width="2.2" height="9.6" rx="1" fill="#ffffff" opacity="0.14"/>
        <rect x="-5" y="-2.5" width="10" height="2.4" fill="${accent}"/>
        <ellipse cx="0" cy="0" rx="10" ry="2.2" fill="${color}" ${ink}/>`;
      break;
    case 'crown':
      g = `<path d="M-7,0 L-7,-5 L-3.5,-1 L0,-8 L3.5,-1 L7,-5 L7,0 Z" fill="${color}" ${ink}/>
        <rect x="-7" y="-0.5" width="14" height="1.8" fill="${accent}"/>
        <circle cx="0" cy="-7" r="1.2" fill="#ff5a4d"/><circle cx="-7" cy="-5" r="1" fill="#5fd6ff"/><circle cx="7" cy="-5" r="1" fill="#5fd6ff"/>`;
      break;
    case 'helmet':
      // A sealed dome ENCLOSING the whole head (radius r+1.5, like drawHat) + a gold visor band across
      // the face + a glint. This is the full-head covering the astronaut report was missing in preview.
      g = `<circle cx="0" cy="-1" r="8.5" fill="${color}" ${ink}/>
        <rect x="-5.6" y="-3.4" width="11.2" height="5.8" rx="2.7" fill="${accent}" opacity="0.92" ${ink}/>
        <ellipse cx="-2" cy="-1.6" rx="2" ry="1.1" fill="#fff" opacity="0.55"/>
        <path d="M-6.4,-4.6 A8.5 8.5 0 0 1 0.5,-9.4 Q-4.4,-7.4 -6.4,-4.6 Z" fill="#ffffff" opacity="0.3"/>`;
      break;
    case 'halo':
      g = `<circle cx="0" cy="-1" r="8" fill="${accent}" ${ink}/>
        <path d="M-5,-1.5 A5 4 0 0 1 5,-1.5 Z" fill="${color}" opacity="0.8"/>
        <ellipse cx="0" cy="-11" rx="7" ry="2.4" fill="none" stroke="${color}" stroke-width="2"><animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/></ellipse>`;
      break;
    case 'baggy':
      // The baggy green (GS-unending): a soft, slouched crown that droops over one side, stitched
      // panel seams, a short brim, and a gold-thread emblem front and centre.
      g = `<path d="M-7.4,-1.6 Q-8.4,-8.2 -2.5,-9.6 Q0.5,-11.4 4,-9.4 Q8.6,-8.8 7.6,-3.4 Q8.8,-1.4 6.8,-1.2 Z" fill="${color}" ${ink}/>
        <path d="M-4.5,-9 Q-3.4,-4.6 -3.8,-1.6 M1.5,-10.2 Q1.2,-5.4 1.2,-1.5 M5.4,-8.6 Q4.8,-4.8 5,-2" fill="none" stroke="#0c1116" stroke-width="0.6" opacity="0.55"/>
        <path d="M-6.8,-2 Q0,1.8 6.6,-2 Z" fill="${accent}" ${ink}/>
        <circle cx="0.6" cy="-5.6" r="1.6" fill="none" stroke="${accent}" stroke-width="0.9"/>
        <path d="M0.6,-6.8 L0.6,-4.4 M-0.6,-5.6 L1.8,-5.6" stroke="${accent}" stroke-width="0.7"/>`;
      break;
    default:
      g = '';
  }
  const flair =
    shape === 'halo'
      ? sparkles([[-9, -6], [9, -4], [0, 6]])
      : shape === 'baggy'
        ? sparkles([[-8, -8], [8, -6]])
        : '';
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">${a}${g}${flair}</g>`;
}

/** The pattern/panel detail a shirt shape adds over a coloured torso (no base silhouette) — authored
 *  in a canonical frame about the chest centre and fitted by a single scale, so the wardrobe icon
 *  (s=1) and the full-body figure (s tracks the figure size) read identically instead of the detail
 *  shrinking into a speck on a big torso. */
function shirtDetail(look: ApparelLook, cx: number, cy: number, s = 1): string {
  const { shape, accent = '#0c1116' } = look;
  let detail = '';
  switch (shape) {
    case 'polo':
      detail = `<path d="M-4,-9 L0,-4 L4,-9" fill="none" stroke="${accent}" stroke-width="1.6"/>
        <line x1="0" y1="-4" x2="0" y2="3" stroke="${accent}" stroke-width="1"/>
        <circle cx="0" cy="-1" r="0.8" fill="${accent}"/><circle cx="0" cy="2" r="0.8" fill="${accent}"/>`;
      break;
    case 'striped':
      detail = `<g stroke="${accent}" stroke-width="2.4"><line x1="-12" y1="-2" x2="12" y2="-2"/><line x1="-12" y1="3" x2="12" y2="3"/><line x1="-12" y1="8" x2="12" y2="8"/></g>`;
      break;
    case 'jersey':
      detail = `<rect x="-6" y="-3" width="12" height="12" rx="1.5" fill="${accent}" opacity="0.85"/>
        <text x="0" y="7" font-size="9" font-weight="800" text-anchor="middle" fill="#0c1116" font-family="system-ui,sans-serif">7</text>`;
      break;
    case 'spacesuit':
      detail = `<rect x="-5" y="-2" width="10" height="8" rx="1.4" fill="#cdd6e2" stroke="#0c1116" stroke-width="0.8"/>
        <circle cx="-2" cy="1" r="1.1" fill="${accent}"/><circle cx="2" cy="1" r="1.1" fill="#2bf0c0"/>
        <rect x="-3" y="3.4" width="6" height="1.4" fill="#ffd36b"/>
        <path d="M-12,-6 Q-14,1 -11,8" fill="none" stroke="#cdd6e2" stroke-width="1.4"/>`;
      break;
    case 'cosmic':
      detail = `<g fill="#fff"><circle cx="-4" cy="-2" r="0.9"/><circle cx="3" cy="1" r="0.7"/><circle cx="-1" cy="6" r="0.8"/><circle cx="6" cy="-4" r="0.6"/><circle cx="-6" cy="4" r="0.6"/></g>
        <path d="M-9,2 Q0,-3 9,5" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.8"/>`;
      break;
    case 'blazer':
      // The tailored jacket (GS-unending's Green Jacket): notched gold-trimmed lapels down to a
      // single button, a breast-pocket crest, and a hint of shirt in the open V.
      detail = `<path d="M-5,-9.5 L0,-4 L5,-9.5 L2.4,4 L-2.4,4 Z" fill="#f4f6f2" opacity="0.9"/>
        <path d="M-6,-10 L-1,-4.5 L-2.6,5 L-5.4,-1" fill="none" stroke="${accent}" stroke-width="1.3"/>
        <path d="M6,-10 L1,-4.5 L2.6,5 L5.4,-1" fill="none" stroke="${accent}" stroke-width="1.3"/>
        <circle cx="0" cy="6" r="1" fill="${accent}"/>
        <g transform="translate(-6.5 1)"><circle r="2.1" fill="${accent}"/><path d="M0,-1.3 L0.4,-0.4 L1.3,-0.3 L0.6,0.3 L0.8,1.2 L0,0.7 L-0.8,1.2 L-0.6,0.3 L-1.3,-0.3 L-0.4,-0.4 Z" fill="#0f5132"/></g>`;
      break;
    default:
      detail = '';
  }
  return detail
    ? `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">${detail}</g>`
    : '';
}

/** Draw a SHIRT glyph (aura + torso silhouette + pattern detail) centred near (cx,cy) in a ~30u frame. */
function shirtGlyph(look: ApparelLook, cx: number, cy: number, uid: string): string {
  const { shape, color, glow } = look;
  const a = glow ? aura(cx, cy, 24, glow, `sg${uid}`) : '';
  const ink = 'stroke="#0c1116" stroke-width="1.1" stroke-linejoin="round"';
  // A common shirt silhouette (shoulders → collar V → body) all shapes share.
  const bodyPath = `M${cx - 13},${cy - 9} L${cx - 6},${cy - 11} L${cx},${cy - 7} L${cx + 6},${cy - 11} L${cx + 13},${cy - 9} L${cx + 10},${cy - 3} L${cx + 9},${cy + 12} L${cx - 9},${cy + 12} L${cx - 10},${cy - 3} Z`;
  const base = `<path d="${bodyPath}" fill="${color}" ${ink}/>`;
  const flair =
    shape === 'cosmic' || shape === 'blazer' ? sparkles([[cx - 12, cy - 6], [cx + 12, cy + 2]]) : '';
  return a + base + shirtDetail(look, cx, cy) + flair;
}

/** Draw a PANTS glyph (aura + a pair-of-trousers silhouette + per-shape detail) centred near (cx,cy). */
function pantsGlyph(look: ApparelLook, cx: number, cy: number, uid: string): string {
  const { shape, color, accent = '#0c1116', glow } = look;
  const a = glow ? aura(cx, cy + 2, 22, glow, `pg${uid}`) : '';
  const ink = 'stroke="#0c1116" stroke-width="1.1" stroke-linejoin="round"';
  const wide = shape === 'knickers';
  const legBottom = shape === 'shorts' ? cy + 1 : wide ? cy + 8 : cy + 12;
  const outer = wide ? 9 : 7;
  // Waist band → two tapering legs with a notch between them.
  const body = `<path d="M${cx - 8},${cy - 9} L${cx + 8},${cy - 9} L${cx + outer},${legBottom} L${cx + 2.5},${legBottom} L${cx},${cy - 3} L${cx - 2.5},${legBottom} L${cx - outer},${legBottom} Z" fill="${color}" ${ink}/>`;
  const band = `<rect x="${cx - 8}" y="${cy - 9}" width="16" height="2.6" fill="${accent}" stroke="none"/>`;
  let detail = '';
  if (shape === 'leggings') {
    detail = `<g stroke="${accent}" stroke-width="1" opacity="0.9"><line x1="${cx - 5}" y1="${cy - 5}" x2="${cx - 4}" y2="${legBottom - 1}"/><line x1="${cx + 5}" y1="${cy - 5}" x2="${cx + 4}" y2="${legBottom - 1}"/></g>`;
  } else if (shape === 'spacepants') {
    detail = `<rect x="${cx - 7}" y="${legBottom - 3}" width="6" height="3" fill="${accent}" stroke="none"/><rect x="${cx + 1}" y="${legBottom - 3}" width="6" height="3" fill="${accent}" stroke="none"/>`;
  } else if (shape === 'knickers') {
    detail = `<circle cx="${cx - 4.5}" cy="${legBottom - 1}" r="1.3" fill="${accent}"/><circle cx="${cx + 4.5}" cy="${legBottom - 1}" r="1.3" fill="${accent}"/>`;
  } else if (shape === 'nebula') {
    detail = `<g fill="#fff"><circle cx="${cx - 4}" cy="${cy + 1}" r="0.8"/><circle cx="${cx + 3}" cy="${cy + 5}" r="0.7"/><circle cx="${cx + 5}" cy="${cy - 4}" r="0.6"/></g>`;
  }
  const flair = shape === 'nebula' ? sparkles([[cx - 10, cy - 4], [cx + 10, cy + 6]]) : '';
  return a + body + band + detail + flair;
}

/**
 * Draw a GOLF-BAG glyph (the cosmetic bag slot, GS-unending) — an upright staff bag: tapered body,
 * gold trim ring + pocket, a shoulder strap, and three clubs standing out of the top. Authored in a
 * ~34u-tall frame about (cx,cy); `scale` fits it elsewhere (the mannequin's side prop).
 */
function bagGlyph(look: ApparelLook, cx: number, cy: number, uid: string, scale = 1): string {
  const { color, accent = '#d9b74a', glow } = look;
  const ink = 'stroke="#0c1116" stroke-width="1" stroke-linejoin="round"';
  const a = glow ? aura(0, 0, 22, glow, `bg${uid}`) : '';
  const clubs = `
    <g stroke="#b9c2cf" stroke-width="1.3" stroke-linecap="round">
      <line x1="-3.5" y1="-11" x2="-5.5" y2="-19"/><line x1="0.5" y1="-11" x2="0.5" y2="-21"/><line x1="4" y1="-11" x2="6" y2="-18"/>
    </g>
    <circle cx="-5.9" cy="-19.6" r="1.7" fill="#dfe6f0" ${ink}/>
    <path d="M0.5,-21 L4.4,-19.6 L0.5,-18.6 Z" fill="#dfe6f0" ${ink}/>
    <circle cx="6.4" cy="-18.5" r="1.5" fill="#dfe6f0" ${ink}/>`;
  const body = `
    <path d="M-6.5,-11 L6.5,-11 L5.4,13 Q0,15.4 -5.4,13 Z" fill="${color}" ${ink}/>
    <ellipse cx="0" cy="-11" rx="6.5" ry="2.3" fill="${accent}" ${ink}/>
    <rect x="-4.6" y="-4" width="9.2" height="2" fill="${accent}" stroke="none"/>
    <path d="M-4.2,0 L4.2,0 L3.6,8 Q0,9.6 -3.6,8 Z" fill="${accent}" opacity="0.9" ${ink}/>
    <path d="M-6,-9 Q-11,0 -5.6,10" fill="none" stroke="${accent}" stroke-width="1.6"/>
    <circle cx="0" cy="4" r="1.9" fill="none" stroke="#0f5132" stroke-width="0.9"/>`;
  return `<g transform="translate(${cx} ${cy}) scale(${scale.toFixed(3)})">${a}${clubs}${body}${sparkles([[-9, -14], [9, 6]])}</g>`;
}

/** A framed `<svg>` icon of a garment for a wardrobe card. */
export function apparelCardSVG(id: string | undefined, w = 96, h = 72): string {
  const item = apparelById(id);
  if (!item) return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"></svg>`;
  const uid = id!.replace(/[^a-z0-9]/gi, '');
  const cx = w / 2;
  // Hats now draw on a notional head centred at (cx,cy) with radius `hatR`; nudge the centre down a
  // touch so brimmed hats (which sit on top of that head) stay vertically balanced in the card.
  const hatR = 10;
  const cy = h / 2 + (item.slot === 'hat' ? 6 : 2);
  const glyph =
    item.slot === 'hat'
      ? hatGlyph(item.look, cx, cy, hatR, uid)
      : item.slot === 'shirt'
        ? shirtGlyph(item.look, cx, cy, uid)
        : item.slot === 'bag'
          ? bagGlyph(item.look, cx, cy - 2, uid, 1.4)
          : pantsGlyph(item.look, cx, cy, uid);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${item.name}" style="display:block;">${glyph}</svg>`;
}

/**
 * The full-body golfer preview — a cel-shaded character wearing the equipped hat + shirt + pants
 * (+ the bag propped at their side). This is the Clubhouse's hero rendering (stage + lounge), built
 * to look good on its own: gradient-shaded garments, a real face, shaped legs and shoes, and the
 * golfer's signature cap when no cosmetic hat is worn (the same default the on-course figure wears,
 * so the clubhouse look is recognisably the on-course look).
 *
 * ONE proportional figure at every size: vertical anchors are fractions of `h` so head→chest→legs
 * read as three even bands (the stage's hat/shirt/pants tap zones line up with them); every authored
 * offset is scaled by `S = h/210`, so the small lounge figure is a clean scale-down of the stage one.
 *
 * `uid` namespaces the SVG defs (gradients/clips) — ids are DOCUMENT-global and the lounge mounts
 * four figures in one document, so figures sharing a fixed id would cross-tint each other's glows
 * (the same class of bug as GS-cetus-4's cross-clipping hole SVGs).
 */
export function golferPreviewSVG(
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  opts: {
    skin?: string;
    shirtBase?: string;
    w?: number;
    h?: number;
    bagId?: string;
    /** Signature cap colour — worn when no cosmetic hat is equipped (mirrors on-course). */
    capColor?: string;
    /** Unique id prefix for this figure's SVG defs — ids are DOCUMENT-global, so co-mounted figures
     *  need distinct prefixes. Defaults to a hash of the figure's inputs, which makes an accidental
     *  collision harmless (two figures hashing alike are wearing the identical look anyway). */
    uid?: string;
  } = {},
): string {
  const { skin = '#f0c49a', shirtBase = '#3f7fd0', w = 110, h = 132, capColor } = opts;
  const uid =
    opts.uid ??
    `p${Math.abs(
      [hatId, shirtId, pantsId, opts.bagId, skin, shirtBase, capColor, w, h]
        .join('|')
        .split('')
        .reduce((a, c) => (Math.imul(a, 33) + c.charCodeAt(0)) | 0, 5381),
    ).toString(36)}`;
  const hat = apparelById(hatId);
  const shirt = apparelById(shirtId);
  const pants = apparelById(pantsId);
  const bag = apparelById(opts.bagId);
  const cx = w / 2;
  const S = h / 210;
  const px = (n: number): number => n * S; // scale an authored length to this figure
  const sw = (n: number): number => Math.max(0.7, n * S); // scale a stroke, but keep hairlines visible
  const f = (n: number): string => (Math.round(n * 10) / 10).toString();

  // The three tap-band anchors (fractions of h — the stage CSS zones key off these).
  const headY = h * 0.19;
  const hipY = h * 0.58;
  const footY = h * 0.93;
  const headR = px(15);
  const shoY = headY + px(17); // shoulder line

  const shirtCol = shirt?.look.color ?? shirtBase;
  const pantsLook = pants?.look;
  const pantsShape = pantsLook?.shape;
  const pantsCol = pantsLook?.color ?? '#2c3142';
  const pantsAcc = pantsLook?.accent ?? shade(pantsCol, -0.35);
  const ink = `stroke="#0c1116" stroke-width="${sw(1.1)}" stroke-linejoin="round"`;

  // Torso: rounded shoulders → collar dip → gentle waist taper to the hip. Built once — the fill,
  // the cel-shade clip and the shirt-detail clip all reuse it.
  const waistY = (shoY + hipY) / 2;
  const torsoPath =
    `M${f(cx - px(19))},${f(shoY + px(5))} ` +
    `Q${f(cx - px(19.5))},${f(shoY - px(4))} ${f(cx - px(10))},${f(shoY - px(5))} ` +
    `L${f(cx - px(4.5))},${f(shoY - px(4.5))} Q${f(cx)},${f(shoY - px(0.5))} ${f(cx + px(4.5))},${f(shoY - px(4.5))} ` +
    `L${f(cx + px(10))},${f(shoY - px(5))} Q${f(cx + px(19.5))},${f(shoY - px(4))} ${f(cx + px(19))},${f(shoY + px(5))} ` +
    `Q${f(cx + px(15.5))},${f(waistY)} ${f(cx + px(13))},${f(hipY)} ` +
    `L${f(cx - px(13))},${f(hipY)} ` +
    `Q${f(cx - px(15.5))},${f(waistY)} ${f(cx - px(19))},${f(shoY + px(5))} Z`;

  const defs = `<defs>
    <linearGradient id="shg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${shade(shirtCol, 0.3)}"/><stop offset="55%" stop-color="${shirtCol}"/><stop offset="100%" stop-color="${shade(shirtCol, -0.24)}"/>
    </linearGradient>
    <linearGradient id="ptg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${shade(pantsCol, 0.22)}"/><stop offset="60%" stop-color="${pantsCol}"/><stop offset="100%" stop-color="${shade(pantsCol, -0.3)}"/>
    </linearGradient>
    <clipPath id="tor${uid}"><path d="${torsoPath}"/></clipPath>
    <clipPath id="hd${uid}"><circle cx="${f(cx)}" cy="${f(headY)}" r="${f(headR)}"/></clipPath>
  </defs>`;

  // ── Auras (legendary/mythic garments glow behind the figure) ─────────────────────────────
  const glowAura = shirt?.look.glow ? aura(cx, shoY + px(20), px(32), shirt.look.glow, `psg${uid}`) : '';
  const pantsGlow = pantsLook?.glow ? aura(cx, (hipY + footY) / 2, px(26), pantsLook.glow, `ppg${uid}`) : '';

  // ── Legs + shoes ──────────────────────────────────────────────────────────────────────────
  const ankleY = footY - px(4);
  const kneeY = hipY + (ankleY - hipY) * 0.5;
  const lHip = cx - px(6.2);
  const rHip = cx + px(6.2);
  const lAnk = cx - px(9);
  const rAnk = cx + px(9);
  const pantsFill = `url(#ptg${uid})`;
  const legPoly = (
    hipC: number,
    ankC: number,
    topHalf: number,
    ankHalf: number,
    top: number,
    bot: number,
    fill: string,
  ): string =>
    `<path d="M${f(hipC - topHalf)},${f(top)} L${f(hipC + topHalf)},${f(top)} L${f(ankC + ankHalf)},${f(bot)} L${f(ankC - ankHalf)},${f(bot)} Z" fill="${fill}" ${ink}/>`;
  const shoe = (x: number, col = '#232733'): string =>
    `<path d="M${f(x - px(5))},${f(footY - px(1.8))} Q${f(x - px(5.6))},${f(footY - px(8.6))} ${f(x)},${f(footY - px(8.6))} Q${f(x + px(5.6))},${f(footY - px(8.6))} ${f(x + px(5.8))},${f(footY - px(1.8))} Z" fill="${col}" ${ink}/>
     <rect x="${f(x - px(6.2))}" y="${f(footY - px(2.6))}" width="${f(px(12.6))}" height="${f(px(2.8))}" rx="${f(px(1.4))}" fill="#e8ecf2" ${ink}/>
     <ellipse cx="${f(x - px(1.6))}" cy="${f(footY - px(6.4))}" rx="${f(px(1.8))}" ry="${f(px(1))}" fill="#ffffff" opacity="0.35"/>`;
  // The hip block bridges the two legs so no background peeks through at the crotch.
  const hipBlock = `<rect x="${f(cx - px(11.8))}" y="${f(hipY - px(1))}" width="${f(px(23.6))}" height="${f(px(10))}" rx="${f(px(4))}" fill="${pantsFill}" ${ink}/>`;
  let legs = '';
  let legDetail = '';
  if (pantsShape === 'shorts') {
    const hemY = kneeY + px(1.5);
    legs =
      hipBlock +
      legPoly(lHip, (lHip + lAnk) / 2, px(5.8), px(5.4), hipY, hemY, pantsFill) +
      legPoly(rHip, (rHip + rAnk) / 2, px(5.8), px(5.4), hipY, hemY, pantsFill) +
      legPoly((lHip + lAnk) / 2, lAnk, px(3), px(2.7), hemY, ankleY, skin) +
      legPoly((rHip + rAnk) / 2, rAnk, px(3), px(2.7), hemY, ankleY, skin) +
      // ankle socks
      `<rect x="${f(lAnk - px(3.4))}" y="${f(ankleY - px(4.4))}" width="${f(px(6.8))}" height="${f(px(4))}" rx="${f(px(1.4))}" fill="#e8ecf2" ${ink}/>
       <rect x="${f(rAnk - px(3.4))}" y="${f(ankleY - px(4.4))}" width="${f(px(6.8))}" height="${f(px(4))}" rx="${f(px(1.4))}" fill="#e8ecf2" ${ink}/>`;
    legDetail = `<rect x="${f(lHip - px(5.8))}" y="${f(hemY - px(2.6))}" width="${f(px(11))}" height="${f(px(2.6))}" fill="${pantsAcc}" opacity="0.9"/>
      <rect x="${f(rHip - px(5.2))}" y="${f(hemY - px(2.6))}" width="${f(px(11))}" height="${f(px(2.6))}" fill="${pantsAcc}" opacity="0.9"/>`;
  } else if (pantsShape === 'knickers') {
    const cuffY = kneeY + px(6);
    // Puffed plus-fours: the outer edge bellies out, gathered into a cuff below the knee.
    const puff = (hipC: number, ankC: number, side: 1 | -1): string =>
      `<path d="M${f(hipC - side * px(5.8))},${f(hipY)} L${f(hipC + side * px(5.8))},${f(hipY)} Q${f(ankC + side * px(8.4))},${f((hipY + cuffY) / 2 + px(4))} ${f(ankC + side * px(3.2))},${f(cuffY)} L${f(ankC - side * px(3.4))},${f(cuffY)} Q${f(ankC - side * px(6.6))},${f((hipY + cuffY) / 2)} ${f(hipC - side * px(5.8))},${f(hipY)} Z" fill="${pantsFill}" ${ink}/>`;
    legs =
      hipBlock +
      puff(lHip, lAnk, -1) +
      puff(rHip, rAnk, 1) +
      legPoly(lAnk, lAnk, px(2.8), px(2.6), cuffY, ankleY, '#e8ecf2') +
      legPoly(rAnk, rAnk, px(2.8), px(2.6), cuffY, ankleY, '#e8ecf2');
    legDetail = `<rect x="${f(lAnk - px(4))}" y="${f(cuffY - px(1.4))}" width="${f(px(8))}" height="${f(px(3))}" rx="${f(px(1.2))}" fill="${pantsAcc}" ${ink}/>
      <rect x="${f(rAnk - px(4))}" y="${f(cuffY - px(1.4))}" width="${f(px(8))}" height="${f(px(3))}" rx="${f(px(1.2))}" fill="${pantsAcc}" ${ink}/>`;
  } else {
    const slim = pantsShape === 'leggings';
    const ankHalf = slim ? px(2.5) : px(3.4);
    legs =
      hipBlock +
      legPoly(lHip, lAnk, px(5.8), ankHalf, hipY, ankleY, pantsFill) +
      legPoly(rHip, rAnk, px(5.8), ankHalf, hipY, ankleY, pantsFill);
    if (pantsShape === 'spacepants') {
      // Mag-boots: accent boot shells swallow the shins.
      const boot = (x: number): string =>
        `<rect x="${f(x - px(4.6))}" y="${f(footY - px(14))}" width="${f(px(9.2))}" height="${f(px(11))}" rx="${f(px(2))}" fill="${pantsAcc}" ${ink}/>
         <rect x="${f(x - px(4.6))}" y="${f(footY - px(14))}" width="${f(px(9.2))}" height="${f(px(2.6))}" rx="${f(px(1.3))}" fill="${shade(pantsAcc, 0.3)}" stroke="none"/>`;
      legDetail = boot(lAnk) + boot(rAnk);
    } else if (pantsShape === 'nebula') {
      legDetail = `<g fill="#fff"><circle cx="${f(lHip - px(1))}" cy="${f(hipY + px(14))}" r="${f(px(1.1))}"/><circle cx="${f(rHip + px(1))}" cy="${f(hipY + px(24))}" r="${f(px(0.9))}"/><circle cx="${f(lAnk)}" cy="${f(ankleY - px(10))}" r="${f(px(0.9))}"/><circle cx="${f(rAnk - px(1))}" cy="${f(ankleY - px(20))}" r="${f(px(0.7))}"/></g>`;
    } else {
      // Trousers/leggings: a pinstripe (or legging seam) down each outer leg sells the tailoring.
      const op = slim ? 0.9 : 0.55;
      legDetail = `<g stroke="${pantsAcc}" stroke-width="${sw(1.2)}" opacity="${op}" stroke-linecap="round">
        <line x1="${f(lHip - px(3.6))}" y1="${f(hipY + px(4))}" x2="${f(lAnk - px(1.4))}" y2="${f(ankleY - px(1))}"/>
        <line x1="${f(rHip + px(3.6))}" y1="${f(hipY + px(4))}" x2="${f(rAnk + px(1.4))}" y2="${f(ankleY - px(1))}"/>
      </g>`;
    }
  }
  const bootCol = pantsShape === 'spacepants' ? pantsAcc : '#232733';
  const shoes = shoe(lAnk, bootCol) + shoe(rAnk, bootCol);

  // ── Arms: a relaxed A-pose whose SLEEVE follows the shirt. The old arms started well inside the
  //    torso and so hid the sleeve behind it — every outfit then read as bare-skin pegs (the astronaut
  //    "still had arms showing"). Now they anchor at the shoulder CORNER and draw over the torso edge,
  //    so the sleeve is visible and reads as attached. Short-sleeve golf shirts (polo/tee/jersey) bare
  //    the forearm; full-cover suits (spacesuit/nebula suit/green jacket) sleeve all the way down —
  //    ending in a glove on the pressure suits, a bare hand at the jacket cuff.
  const shirtShape = shirt?.look.shape;
  const fullSleeve = shirtShape === 'spacesuit' || shirtShape === 'cosmic' || shirtShape === 'blazer';
  const gloved = shirtShape === 'spacesuit' || shirtShape === 'cosmic';
  const sleeveCol = shade(shirtCol, -0.05);
  const handCol = gloved ? shade(shirtCol, 0.06) : skin;
  const elbowY = shoY + px(27);
  const handY = hipY + px(4);
  const shoX = (side: 1 | -1): number => cx + side * px(17.5); // shoulder corner
  const wristX = (side: 1 | -1): number => cx + side * px(16.5);
  const armSeg = (x1: number, y1: number, x2: number, y2: number, col: string, wd: number): string =>
    `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${col}" stroke-width="${f(wd)}" stroke-linecap="round"/>`;
  const arm = (side: 1 | -1): string => {
    if (fullSleeve) {
      // One continuous fabric arm: shoulder → elbow (bowed out past the torso) → wrist.
      return (
        armSeg(shoX(side), shoY + px(1), cx + side * px(20.5), elbowY, sleeveCol, px(7.6)) +
        armSeg(cx + side * px(20.5), elbowY, wristX(side), handY, sleeveCol, px(6.4))
      );
    }
    // Short sleeve capping just below the shoulder, then a bare forearm.
    const hemX = cx + side * px(19.5);
    const hemY = shoY + px(13);
    return (
      armSeg(shoX(side), shoY + px(1), hemX, hemY, sleeveCol, px(7.6)) +
      armSeg(hemX, hemY, wristX(side), handY, skin, px(5.2))
    );
  };
  const hand = (side: 1 | -1): string =>
    `<circle cx="${f(wristX(side))}" cy="${f(handY)}" r="${f(px(3.6))}" fill="${handCol}" stroke="#0c1116" stroke-width="${sw(1)}"/>`;

  // ── Torso + cel shading + garment detail ─────────────────────────────────────────────────
  const neck = `<rect x="${f(cx - px(3.6))}" y="${f(headY + headR - px(4))}" width="${f(px(7.2))}" height="${f(shoY - headY - headR + px(6))}" fill="${shade(skin, -0.12)}"/>`;
  const torso = `<path d="${torsoPath}" fill="url(#shg${uid})" stroke="#0c1116" stroke-width="${sw(1.5)}" stroke-linejoin="round"/>`;
  const torsoShade = `<g clip-path="url(#tor${uid})">
    <ellipse cx="${f(cx - px(9))}" cy="${f(shoY + px(5))}" rx="${f(px(15))}" ry="${f(px(11))}" fill="#ffffff" opacity="0.2"/>
    <rect x="${f(cx + px(7))}" y="${f(shoY - px(6))}" width="${f(px(14))}" height="${f(hipY - shoY + px(12))}" fill="#000000" opacity="0.14"/>
    <rect x="${f(cx - px(20))}" y="${f(hipY - px(4))}" width="${f(px(40))}" height="${f(px(5))}" fill="#000000" opacity="0.12"/>
  </g>`;
  const detail = shirt
    ? `<g clip-path="url(#tor${uid})">${shirtDetail(shirt.look, cx, shoY + px(12), S * 1.75)}</g>`
    : '';
  // Belt across the shirt hem (skipped for shorts — their waistband reads on its own).
  const belt =
    pantsShape === 'shorts'
      ? ''
      : `<rect x="${f(cx - px(12.6))}" y="${f(hipY - px(2.2))}" width="${f(px(25.2))}" height="${f(px(4.4))}" rx="${f(px(2))}" fill="${shade(pantsCol, -0.35)}" ${ink}/>
       <rect x="${f(cx - px(2.4))}" y="${f(hipY - px(1.6))}" width="${f(px(4.8))}" height="${f(px(3.2))}" rx="${f(px(1))}" fill="${pantsAcc}" stroke="none"/>`;

  // ── Head: skin, cel shade, a friendly face, ears, then the hat ───────────────────────────
  const ears = `<circle cx="${f(cx - headR + px(0.5))}" cy="${f(headY + px(1.5))}" r="${f(px(2.6))}" fill="${skin}" stroke="#0c1116" stroke-width="${sw(1)}"/>
    <circle cx="${f(cx + headR - px(0.5))}" cy="${f(headY + px(1.5))}" r="${f(px(2.6))}" fill="${skin}" stroke="#0c1116" stroke-width="${sw(1)}"/>`;
  const head = `<circle cx="${f(cx)}" cy="${f(headY)}" r="${f(headR)}" fill="${skin}" stroke="#0c1116" stroke-width="${sw(1.3)}"/>`;
  const headShade = `<g clip-path="url(#hd${uid})">
    <circle cx="${f(cx - px(5))}" cy="${f(headY - px(5))}" r="${f(px(13))}" fill="#ffffff" opacity="0.18"/>
    <circle cx="${f(cx + px(8))}" cy="${f(headY + px(5))}" r="${f(px(13))}" fill="#000000" opacity="0.1"/>
  </g>`;
  const eyeY = headY - px(0.5);
  const face = `
    <g fill="#232733">
      <circle cx="${f(cx - px(5.2))}" cy="${f(eyeY)}" r="${f(px(1.8))}"/>
      <circle cx="${f(cx + px(5.2))}" cy="${f(eyeY)}" r="${f(px(1.8))}"/>
    </g>
    <circle cx="${f(cx - px(4.6))}" cy="${f(eyeY - px(0.6))}" r="${f(px(0.6))}" fill="#fff"/>
    <circle cx="${f(cx + px(5.8))}" cy="${f(eyeY - px(0.6))}" r="${f(px(0.6))}" fill="#fff"/>
    <path d="M${f(cx - px(7.4))},${f(eyeY - px(4))} Q${f(cx - px(5))},${f(eyeY - px(5.6))} ${f(cx - px(2.8))},${f(eyeY - px(4.2))}" fill="none" stroke="#0c1116" stroke-width="${sw(1.1)}" stroke-linecap="round" opacity="0.6"/>
    <path d="M${f(cx + px(2.8))},${f(eyeY - px(4.2))} Q${f(cx + px(5))},${f(eyeY - px(5.6))} ${f(cx + px(7.4))},${f(eyeY - px(4))}" fill="none" stroke="#0c1116" stroke-width="${sw(1.1)}" stroke-linecap="round" opacity="0.6"/>
    <path d="M${f(cx - px(3.6))},${f(headY + px(6))} Q${f(cx)},${f(headY + px(9))} ${f(cx + px(3.6))},${f(headY + px(6))}" fill="none" stroke="#0c1116" stroke-width="${sw(1.3)}" stroke-linecap="round" opacity="0.75"/>
    <ellipse cx="${f(cx - px(8))}" cy="${f(headY + px(4.5))}" rx="${f(px(2.4))}" ry="${f(px(1.4))}" fill="#ff7b6b" opacity="0.22"/>
    <ellipse cx="${f(cx + px(8))}" cy="${f(headY + px(4.5))}" rx="${f(px(2.4))}" ry="${f(px(1.4))}" fill="#ff7b6b" opacity="0.22"/>`;
  // A cosmetic hat, or the golfer's signature cap (same default as on-course) when none is worn.
  const hatG = hat
    ? hatGlyph(hat.look, cx, headY, headR, uid)
    : capColor
      ? hatGlyph({ shape: 'cap', color: capColor, accent: shade(capColor, -0.3) }, cx, headY, headR, `dc${uid}`)
      : '';

  // The equipped golf bag (GS-unending) stands propped at the golfer's side, feet on the same floor
  // line, scaled with the figure — the caddy-bag flex without cluttering the pose.
  const bagG = bag ? bagGlyph(bag.look, cx - px(37), footY - px(16), `pb${uid}`, S * 1.2) : '';

  // Mythic/legendary outfits shed a few sparkles around the whole figure.
  const flair =
    shirt?.look.glow || pantsLook?.glow
      ? `<g transform="translate(${f(cx)} ${f(shoY + px(18))}) scale(${(S * 1.4).toFixed(2)})">${sparkles([[-17, -12], [16, -3], [-13, 16], [14, 20]])}</g>`
      : '';

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="your golfer" style="display:block;">
    ${defs}${glowAura}${pantsGlow}${bagG}${legs}${legDetail}${shoes}${neck}${torso}${torsoShade}${detail}${belt}${arm(-1)}${arm(1)}${hand(-1)}${hand(1)}${ears}${head}${headShade}${face}${hatG}${flair}
  </svg>`;
}
