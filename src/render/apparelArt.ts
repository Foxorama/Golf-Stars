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
    case 'blazer':
      // The tailored jacket (GS-unending's Green Jacket): notched gold-trimmed lapels down to a
      // single button, a breast-pocket crest, and a hint of shirt in the open V.
      detail = `<path d="M${cx - 5},${cy - 9.5} L${cx},${cy - 4} L${cx + 5},${cy - 9.5} L${cx + 2.4},${cy + 4} L${cx - 2.4},${cy + 4} Z" fill="#f4f6f2" opacity="0.9"/>
        <path d="M${cx - 6},${cy - 10} L${cx - 1},${cy - 4.5} L${cx - 2.6},${cy + 5} L${cx - 5.4},${cy - 1}" fill="none" stroke="${accent}" stroke-width="1.3"/>
        <path d="M${cx + 6},${cy - 10} L${cx + 1},${cy - 4.5} L${cx + 2.6},${cy + 5} L${cx + 5.4},${cy - 1}" fill="none" stroke="${accent}" stroke-width="1.3"/>
        <circle cx="${cx}" cy="${cy + 6}" r="1" fill="${accent}"/>
        <g transform="translate(${cx - 6.5} ${cy + 1})"><circle r="2.1" fill="${accent}"/><path d="M0,-1.3 L0.4,-0.4 L1.3,-0.3 L0.6,0.3 L0.8,1.2 L0,0.7 L-0.8,1.2 L-0.6,0.3 L-1.3,-0.3 L-0.4,-0.4 Z" fill="#0f5132"/></g>`;
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
 * A small MANNEQUIN preview — the golfer (head + torso + legs) wearing the currently-equipped hat,
 * shirt + pants. Standalone so the wardrobe can show "this is how you'll look". Falls back to a plain
 * figure (default legs/look) when a slot is empty. `skin`/`shirtBase` default to the loader-crew look.
 */
export function golferPreviewSVG(
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  opts: { skin?: string; shirtBase?: string; w?: number; h?: number; bagId?: string } = {},
): string {
  const { skin = '#f0c49a', shirtBase = '#3f7fd0', w = 110, h = 132 } = opts;
  const hat = apparelById(hatId);
  const shirt = apparelById(shirtId);
  const pants = apparelById(pantsId);
  const bag = apparelById(opts.bagId);
  const cx = w / 2;
  // ONE proportional full-body figure at every size. Vertical anchors are fractions of `h` so
  // head→chest→legs read as three even bands (the Clubhouse stage's hat/shirt/pants tap zones line up
  // with them); every authored offset/width is scaled by `S` so the small lounge mannequin stays in
  // proportion (a fixed head+neck used to eat a short figure, leaving a stunted chest + stretched legs).
  // Authored at h=210 (S=1 → the big stage), so smaller previews are just a clean scale-down.
  const S = h / 210;
  const px = (n: number): number => n * S; // scale an authored length to this figure
  const sw = (n: number): number => Math.max(0.7, n * S); // scale a stroke, but keep hairlines visible
  const headY = Math.round(h * 0.19);
  const hipY = Math.round(h * 0.58);
  const footY = Math.round(h * 0.93);
  const headR = px(15);
  const shirtCol = shirt?.look.color ?? shirtBase;
  const glowAura = shirt?.look.glow ? aura(cx, headY + px(36), px(30), shirt.look.glow, 'prevsg') : '';
  // Legs (drawn behind the torso): default dark trousers, tinted by the equipped pants. Shorts bare the
  // shins (skin below the knee), and a glowing pair adds a soft aura.
  const pantsCol = pants?.look.color ?? '#2c3142';
  const pantsGlow = pants?.look.glow ? aura(cx, hipY + px(6), px(20), pants.look.glow, 'prevpg') : '';
  const shorts = pants?.look.shape === 'shorts';
  const lx = cx - px(5);
  const rx = cx + px(5);
  const lfx = cx - px(7);
  const rfx = cx + px(7);
  const kneeY = (hipY + footY) / 2;
  const line = (x1: number, y1: number, x2: number, y2: number, col: string, wd: number): string =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${wd}" stroke-linecap="round"/>`;
  const legs = shorts
    ? line(lx, hipY, lfx, footY, skin, px(5.5)) +
      line(rx, hipY, rfx, footY, skin, px(5.5)) +
      line(lx, hipY, (lx + lfx) / 2, kneeY, pantsCol, px(7)) +
      line(rx, hipY, (rx + rfx) / 2, kneeY, pantsCol, px(7))
    : line(lx, hipY, lfx, footY, pantsCol, px(7)) + line(rx, hipY, rfx, footY, pantsCol, px(7));
  // Arms hang at the sides: a sleeve (shirt colour) from just under the shoulder out to the hip, capped
  // by a skin hand. Drawn BEHIND the torso so the sleeve emerges from under the shirt; the hands sit on
  // top. Without these the figure read as an armless mannequin on the big stage.
  const shoulderY = headY + px(18);
  const handY = hipY + px(2);
  const shoulderX = px(16);
  const handX = px(20);
  const armW = px(5.5);
  const handR = px(3.2);
  const arms =
    line(cx - shoulderX, shoulderY, cx - handX, handY, shirtCol, armW) +
    line(cx + shoulderX, shoulderY, cx + handX, handY, shirtCol, armW);
  const hand = (x: number): string =>
    `<circle cx="${x}" cy="${handY}" r="${handR}" fill="${skin}" stroke="#0c1116" stroke-width="${sw(1)}"/>`;
  const hands = hand(cx - handX) + hand(cx + handX);
  const torso = `
    <path d="M${cx - px(20)},${headY + px(16)} L${cx - px(9)},${headY + px(10)} L${cx},${headY + px(14)} L${cx + px(9)},${headY + px(10)} L${cx + px(20)},${headY + px(16)} L${cx + px(16)},${headY + px(26)} L${cx + px(12)},${hipY} L${cx - px(12)},${hipY} L${cx - px(16)},${headY + px(26)} Z" fill="${shirtCol}" stroke="#0c1116" stroke-width="${sw(1.4)}" stroke-linejoin="round"/>`;
  const detail = shirt ? shirtDetail(shirt.look, cx, headY + px(30)) : '';
  const head = `<circle cx="${cx}" cy="${headY}" r="${headR}" fill="${skin}" stroke="#0c1116" stroke-width="${sw(1.2)}"/>`;
  // Draw the hat ON the head (centre + real radius) so it scales to the head it sits on — a helmet
  // encloses the whole head, a cap perches on the crown — exactly as on-course.
  const hatG = hat ? hatGlyph(hat.look, cx, headY, headR, 'prev') : '';
  // The equipped golf bag (GS-unending) stands propped at the golfer's side, feet on the same floor
  // line, scaled with the figure — the caddy-bag flex without cluttering the swing pose.
  const bagG = bag ? bagGlyph(bag.look, cx - px(34), footY - px(15), 'prevbag', S * 1.15) : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="your golfer" style="display:block;">
    ${glowAura}${pantsGlow}${bagG}${legs}${arms}${torso}${detail}${hands}${head}${hatG}
  </svg>`;
}
