/**
 * Apparel vector art (GS-cosmetics) — draws the cosmetic hats & shirts as self-contained SVG glyphs
 * (no asset, the house no-404 rule). The wardrobe cards show the garment ICON; a small MANNEQUIN
 * preview shows the golfer wearing the currently-equipped hat + shirt, so what you buy is what you
 * wear (the canvas `drawGolfer` in playView.ts renders the same shapes on-course). Pure string builders.
 */

import { apparelById, type ApparelLook } from '../sim/rpg/apparel';

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
        <path d="M-6.5,-2 Q0,2.6 6.5,-2 Z" fill="${accent}" ${ink}/>`;
      break;
    case 'bucket':
      g = `<path d="M-6.5,-1 A6.5 6.5 0 0 1 6.5,-1 Z" fill="${color}" ${ink}/>
        <ellipse cx="0" cy="0" rx="11" ry="2.6" fill="${accent}" ${ink}/>`;
      break;
    case 'visor':
      // Open-top: a brim curving down over the brow + a headband arcing across it (front view).
      g = `<path d="M-7.5,-1 Q0,3.4 7.5,-1 Z" fill="${accent}" ${ink}/>
        <path d="M-7,-2.4 A7 7 0 0 1 7,-2.4" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/>`;
      break;
    case 'tophat':
      g = `<rect x="-5" y="-16" width="10" height="11" rx="1" fill="${color}" ${ink}/>
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
        <ellipse cx="-2" cy="-1.6" rx="2" ry="1.1" fill="#fff" opacity="0.55"/>`;
      break;
    case 'halo':
      g = `<circle cx="0" cy="-1" r="8" fill="${accent}" ${ink}/>
        <path d="M-5,-1.5 A5 4 0 0 1 5,-1.5 Z" fill="${color}" opacity="0.8"/>
        <ellipse cx="0" cy="-11" rx="7" ry="2.4" fill="none" stroke="${color}" stroke-width="2"><animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/></ellipse>`;
      break;
    default:
      g = '';
  }
  const flair = shape === 'halo' ? sparkles([[-9, -6], [9, -4], [0, 6]]) : '';
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">${a}${g}${flair}</g>`;
}

/** The pattern/panel detail a shirt shape adds over a coloured torso (no base silhouette) — shared by
 *  the wardrobe icon and the mannequin preview so both read identically. */
function shirtDetail(look: ApparelLook, cx: number, cy: number): string {
  const { shape, accent = '#0c1116' } = look;
  let detail = '';
  switch (shape) {
    case 'polo':
      detail = `<path d="M${cx - 4},${cy - 9} L${cx},${cy - 4} L${cx + 4},${cy - 9}" fill="none" stroke="${accent}" stroke-width="1.6"/>
        <line x1="${cx}" y1="${cy - 4}" x2="${cx}" y2="${cy + 3}" stroke="${accent}" stroke-width="1"/>
        <circle cx="${cx}" cy="${cy - 1}" r="0.8" fill="${accent}"/><circle cx="${cx}" cy="${cy + 2}" r="0.8" fill="${accent}"/>`;
      break;
    case 'striped':
      detail = `<g stroke="${accent}" stroke-width="2.4"><line x1="${cx - 9}" y1="${cy - 2}" x2="${cx + 9}" y2="${cy - 2}"/><line x1="${cx - 9}" y1="${cy + 3}" x2="${cx + 9}" y2="${cy + 3}"/><line x1="${cx - 9}" y1="${cy + 8}" x2="${cx + 9}" y2="${cy + 8}"/></g>`;
      break;
    case 'jersey':
      detail = `<rect x="${cx - 6}" y="${cy - 3}" width="12" height="12" rx="1.5" fill="${accent}" opacity="0.85"/>
        <text x="${cx}" y="${cy + 7}" font-size="9" font-weight="800" text-anchor="middle" fill="#0c1116" font-family="system-ui,sans-serif">7</text>`;
      break;
    case 'spacesuit':
      detail = `<rect x="${cx - 5}" y="${cy - 2}" width="10" height="8" rx="1.4" fill="#cdd6e2" stroke="#0c1116" stroke-width="0.8"/>
        <circle cx="${cx - 2}" cy="${cy + 1}" r="1.1" fill="${accent}"/><circle cx="${cx + 2}" cy="${cy + 1}" r="1.1" fill="#2bf0c0"/>
        <rect x="${cx - 3}" y="${cy + 3.4}" width="6" height="1.4" fill="#ffd36b"/>
        <line x1="${cx - 13}" y1="${cy - 6}" x2="${cx - 11}" y2="${cy + 8}" stroke="#cdd6e2" stroke-width="1.4"/>`;
      break;
    case 'cosmic':
      detail = `<g fill="#fff"><circle cx="${cx - 4}" cy="${cy - 2}" r="0.9"/><circle cx="${cx + 3}" cy="${cy + 1}" r="0.7"/><circle cx="${cx - 1}" cy="${cy + 6}" r="0.8"/><circle cx="${cx + 6}" cy="${cy - 4}" r="0.6"/><circle cx="${cx - 6}" cy="${cy + 4}" r="0.6"/></g>
        <path d="M${cx - 9},${cy + 2} Q${cx},${cy - 3} ${cx + 9},${cy + 5}" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.8"/>`;
      break;
    default:
      detail = '';
  }
  return detail;
}

/** Draw a SHIRT glyph (aura + torso silhouette + pattern detail) centred near (cx,cy) in a ~30u frame. */
function shirtGlyph(look: ApparelLook, cx: number, cy: number, uid: string): string {
  const { shape, color, glow } = look;
  const a = glow ? aura(cx, cy, 24, glow, `sg${uid}`) : '';
  const ink = 'stroke="#0c1116" stroke-width="1.1" stroke-linejoin="round"';
  // A common shirt silhouette (shoulders → collar V → body) all shapes share.
  const bodyPath = `M${cx - 13},${cy - 9} L${cx - 6},${cy - 11} L${cx},${cy - 7} L${cx + 6},${cy - 11} L${cx + 13},${cy - 9} L${cx + 10},${cy - 3} L${cx + 9},${cy + 12} L${cx - 9},${cy + 12} L${cx - 10},${cy - 3} Z`;
  const base = `<path d="${bodyPath}" fill="${color}" ${ink}/>`;
  const flair = shape === 'cosmic' ? sparkles([[cx - 12, cy - 6], [cx + 12, cy + 2]]) : '';
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
        : pantsGlyph(item.look, cx, cy, uid);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${item.name}" style="display:block;">${glyph}</svg>`;
}

/**
 * A small MANNEQUIN preview — the golfer (head + torso + legs) wearing the currently-equipped hat,
 * shirt + pants. Standalone so the wardrobe can show "this is how you'll look". Falls back to a plain
 * figure (default legs/look) when a slot is empty. `skin`/`shirtBase` default to the loader-crew look.
 */
export function golferPreviewSVG(
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  opts: { skin?: string; shirtBase?: string; w?: number; h?: number; legsFull?: boolean } = {},
): string {
  const { skin = '#f0c49a', shirtBase = '#3f7fd0', w = 110, h = 132, legsFull = false } = opts;
  const hat = apparelById(hatId);
  const shirt = apparelById(shirtId);
  const pants = apparelById(pantsId);
  const cx = w / 2;
  // `legsFull` stands the golfer up as a full-body figure (proportional head/hip/foot) so the big
  // Clubhouse stage reads head→chest→legs as three clean tap bands; the default short-legged mannequin
  // (lounge / preview cards) is unchanged byte-for-byte.
  const headY = legsFull ? Math.round(h * 0.19) : 40;
  const hipY = legsFull ? Math.round(h * 0.58) : h - 24;
  const footY = legsFull ? Math.round(h * 0.93) : h - 5;
  const headR = legsFull ? 15 : 13;
  const shirtCol = shirt?.look.color ?? shirtBase;
  const glowAura = shirt?.look.glow ? aura(cx, headY + 36, 30, shirt.look.glow, 'prevsg') : '';
  // Legs (drawn behind the torso): default dark trousers, tinted by the equipped pants. Shorts bare the
  // shins (skin below the knee), and a glowing pair adds a soft aura.
  const pantsCol = pants?.look.color ?? '#2c3142';
  const pantsGlow = pants?.look.glow ? aura(cx, hipY + 6, 20, pants.look.glow, 'prevpg') : '';
  const shorts = pants?.look.shape === 'shorts';
  const lx = cx - 5;
  const rx = cx + 5;
  const lfx = cx - 7;
  const rfx = cx + 7;
  const kneeY = (hipY + footY) / 2;
  const leg = (x1: number, y1: number, x2: number, y2: number, col: string, wd: number): string =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${wd}" stroke-linecap="round"/>`;
  const legs = shorts
    ? leg(lx, hipY, lfx, footY, skin, 5.5) +
      leg(rx, hipY, rfx, footY, skin, 5.5) +
      leg(lx, hipY, (lx + lfx) / 2, kneeY, pantsCol, 7) +
      leg(rx, hipY, (rx + rfx) / 2, kneeY, pantsCol, 7)
    : leg(lx, hipY, lfx, footY, pantsCol, 7) + leg(rx, hipY, rfx, footY, pantsCol, 7);
  const torso = `
    <path d="M${cx - 20},${headY + 16} L${cx - 9},${headY + 10} L${cx},${headY + 14} L${cx + 9},${headY + 10} L${cx + 20},${headY + 16} L${cx + 16},${headY + 26} L${cx + 12},${hipY} L${cx - 12},${hipY} L${cx - 16},${headY + 26} Z" fill="${shirtCol}" stroke="#0c1116" stroke-width="1.4" stroke-linejoin="round"/>`;
  const detail = shirt ? shirtDetail(shirt.look, cx, headY + 30) : '';
  const head = `<circle cx="${cx}" cy="${headY}" r="${headR}" fill="${skin}" stroke="#0c1116" stroke-width="1.2"/>`;
  // Draw the hat ON the head (centre + real radius) so it scales to the head it sits on — a helmet
  // encloses the whole head, a cap perches on the crown — exactly as on-course.
  const hatG = hat ? hatGlyph(hat.look, cx, headY, headR, 'prev') : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="your golfer" style="display:block;">
    ${glowAura}${pantsGlow}${legs}${torso}${detail}${head}${hatG}
  </svg>`;
}
