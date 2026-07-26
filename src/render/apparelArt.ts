/**
 * Apparel vector art (GS-cosmetics) — draws the cosmetic hats & shirts as self-contained SVG glyphs
 * (no asset, the house no-404 rule). The wardrobe cards show the garment ICON; the full-body
 * `golferPreviewSVG` shows the golfer wearing the equipped hat + shirt + pants (the Clubhouse stage
 * and lounge both mount it). The clubhouse look stands on its own — cel-shaded, characterful — and
 * stays RECOGNISABLE as the on-course outfit by sharing the same `ApparelLook` shapes + palette that
 * the canvas `drawGolfer` (playView.ts) keys off. Pure string builders.
 */

import { apparelById, type ApparelLook } from '../sim/rpg/apparel';
import type { GolferHair } from '../sim/rpg/characters';

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
    case 'starburst': {
      // The Punched Galaxy crown (GS-punched-galaxy, was the Supernova crown): a jewelled violet circlet
      // hugging the brow that ERUPTS into a burst of starlight rays, each fading violet→hot-pink→starlight
      // so the crown reads as a galaxy caught mid-detonation. Set-matched to the Punched Galaxy warplate/
      // greaves (deep-violet body, hot-pink accent, magenta glow) with a bright star-core gem
      // front-and-centre. The rays are computed from a small polar table so the burst stays symmetric.
      const tip = '#fff0a0'; // starlight highlight (shared with the canvas mirror)
      const C: [number, number] = [0, -3.4];
      const rb = 4.0; // ray roots sit just off the circlet
      const rays: [number, number, number][] = [
        [0, 12.5, 1.8], [33, 10, 1.5], [-33, 10, 1.5],
        [63, 8.2, 1.3], [-63, 8.2, 1.3], [94, 6, 1.05], [-94, 6, 1.05],
      ];
      const spikes = rays
        .map(([deg, len, w]) => {
          const t = (deg * Math.PI) / 180;
          const dx = Math.sin(t);
          const dy = -Math.cos(t);
          const px = Math.cos(t);
          const py = Math.sin(t);
          const bx = C[0] + rb * dx;
          const by = C[1] + rb * dy;
          const tx = C[0] + (rb + len) * dx;
          const ty = C[1] + (rb + len) * dy;
          const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
          return `<path d="M${p(bx - w * px, by - w * py)} L${p(tx, ty)} L${p(bx + w * px, by + w * py)} Z" fill="url(#sn${uid})" stroke="#0c1116" stroke-width="0.5" stroke-linejoin="round"><animate attributeName="opacity" values="0.7;1;0.7" dur="${(1.8 + (deg % 5) * 0.2).toFixed(1)}s" repeatCount="indefinite"/></path>`;
        })
        .join('');
      g = `<defs><linearGradient id="sn${uid}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${color}"/><stop offset="52%" stop-color="${accent}"/><stop offset="100%" stop-color="${tip}"/>
        </linearGradient></defs>
        ${spikes}
        <path d="M-6.6,-2 A7 7 0 0 1 6.6,-2 L5.1,0.9 A6.2 6.2 0 0 1 -5.1,0.9 Z" fill="${color}" ${ink}/>
        <path d="M-6.2,-1.3 A6.4 6.4 0 0 1 6.2,-1.3" fill="none" stroke="${accent}" stroke-width="1" opacity="0.9"/>
        <g transform="translate(0 -1.2)">
          <path d="M0,-3.1 L0.9,-0.9 L3.1,0 L0.9,0.9 L0,3.1 L-0.9,0.9 L-3.1,0 L-0.9,-0.9 Z" fill="${tip}" stroke="#0c1116" stroke-width="0.4"/>
          <circle r="0.8" fill="#fff"/>
        </g>`;
      break;
    }
    case 'solarCrown': {
      // The mythic Supernova crown (GS-supernova-flame): a jewelled, pointed CIRCLET erupting into a
      // CROWN OF SOLAR FLAMES — purple-and-black tongues of fire licking upward, each fading
      // black→royal-purple→red coronal at the tip, with red embers flickering around the burst. The
      // circlet is a real crown (no faceplate) that rests on the brow, so the golfer's face stays clear;
      // the fire fans WIDE, shoulder-to-shoulder. Set-matched to the Supernova suit/leggings (deep-violet
      // nebula). Flames root along the circlet crest (a small polar table) so the crown stays symmetric;
      // the SVG flicker lives in <animate> (the canvas mirror is static).
      const cor = accent; // red coronal
      const corHi = '#ffb648'; // hot coronal-tip highlight
      const rb = 7.6; // circlet crest radius the flames root along
      // [x, height, halfWidth, curl] — outer flames lean OUTWARD (curl sign follows x) so the crown fans
      // wide, shoulder-to-shoulder, like real fire; the centre flame stands tallest and straight.
      const flames: [number, number, number, number][] = [
        [0, 14, 3.0, 0],
        [-3.0, 12, 2.6, -0.9], [3.0, 12, 2.6, 0.9],
        [-5.5, 9.6, 2.2, -1.9], [5.5, 9.6, 2.2, 1.9],
        [-7.6, 7.2, 1.9, -3.0], [7.6, 7.2, 1.9, 3.0],
        [-9.0, 5.0, 1.5, -3.8], [9.0, 5.0, 1.5, 3.8],
      ];
      const p = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
      // A licking flame tongue: base-left up the inner edge to a curled tip, back down a bellied outer
      // edge. `c` leans the tip; the sides bow so it reads as fire, not a rigid spike.
      const flamePath = (bx: number, by: number, h: number, w: number, c: number): string =>
        `M${p(bx - w, by)}` +
        ` Q${p(bx - w * 0.78, by - h * 0.5)} ${p(bx - w * 0.12 + c * 0.4, by - h * 0.72)}` +
        ` Q${p(bx + c * 0.9, by - h * 0.92)} ${p(bx + c, by - h)}` +
        ` Q${p(bx + w * 0.55 + c * 0.4, by - h * 0.52)} ${p(bx + w * 0.82, by - h * 0.34)}` +
        ` Q${p(bx + w, by - h * 0.15)} ${p(bx + w, by)} Z`;
      const flameGs = flames
        .map(([x, h, w, c], i) => {
          const by = -Math.sqrt(Math.max(0, rb * rb - x * x));
          const back = `<path d="${flamePath(x, by, h * 1.08, w * 1.16, c)}" fill="#160826"/>`;
          const body = `<path d="${flamePath(x, by, h, w, c)}" fill="url(#sf${uid})" stroke="#0c1116" stroke-width="0.4" stroke-linejoin="round"/>`;
          const lick = `<path d="${flamePath(x, by, h * 0.66, w * 0.5, c * 0.7)}" fill="${cor}" opacity="0.9"><animate attributeName="opacity" values="0.4;1;0.55;0.9;0.4" dur="${(1.1 + i * 0.15).toFixed(2)}s" repeatCount="indefinite"/></path>`;
          const inner = `<path d="${flamePath(x, by, h * 0.4, w * 0.28, c * 0.5)}" fill="${corHi}" opacity="0.85"><animate attributeName="opacity" values="0.2;0.9;0.4;0.2" dur="${(0.9 + i * 0.13).toFixed(2)}s" repeatCount="indefinite"/></path>`;
          return back + body + lick + inner;
        })
        .join('');
      const embers = ([[-8.5, -10], [8.5, -9], [0, -18], [-4.5, -14], [5, -13], [2.5, -20]] as [number, number][])
        .map(([ex, ey], i) => {
          const dur = (0.9 + i * 0.19).toFixed(2);
          return `<circle cx="${ex}" cy="${ey}" r="${(0.5 + (i % 2) * 0.3).toFixed(1)}" fill="${i % 2 ? corHi : cor}"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="cy" values="${ey};${(ey - 3.4).toFixed(1)}" dur="${dur}s" repeatCount="indefinite"/></circle>`;
        })
        .join('');
      g = `<defs><linearGradient id="sf${uid}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="#160826"/><stop offset="30%" stop-color="${color}"/><stop offset="52%" stop-color="#6a24b8"/>
          <stop offset="70%" stop-color="#b8309a"/><stop offset="84%" stop-color="${cor}"/><stop offset="100%" stop-color="${corHi}"/>
        </linearGradient></defs>
        ${flameGs}${embers}
        <path d="M-6.4,-2.2 L-6.4,-3.2 L-5.1,-4.4 L-3.8,-3.0 L-2.5,-5.0 L-1.2,-3.4 L0,-5.6 L1.2,-3.4 L2.5,-5.0 L3.8,-3.0 L5.1,-4.4 L6.4,-3.2 L6.4,-2.2 Q0,-1.5 -6.4,-2.2 Z" fill="${color}" ${ink}/>
        <path d="M-6.1,-2.9 Q0,-4.0 6.1,-2.9" fill="none" stroke="${shade(color, 0.3)}" stroke-width="0.6" opacity="0.75"/>
        <circle cx="-5.1" cy="-4.4" r="0.62" fill="${cor}"/><circle cx="5.1" cy="-4.4" r="0.62" fill="${cor}"/><circle cx="-2.5" cy="-5.0" r="0.62" fill="${corHi}"/><circle cx="2.5" cy="-5.0" r="0.62" fill="${corHi}"/>
        <g transform="translate(0 -5.2)">
          <circle r="2" fill="${cor}" opacity="0.4"><animate attributeName="r" values="1.7;2.4;1.7" dur="1.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.25;0.5;0.25" dur="1.5s" repeatCount="indefinite"/></circle>
          <path d="M0,-2.4 L0.65,-0.65 L2.4,0 L0.65,0.65 L0,2.4 L-0.65,0.65 L-2.4,0 L-0.65,-0.65 Z" fill="${corHi}"/>
          <circle r="0.55" fill="#fff"/>
        </g>`;
      break;
    }
    case 'supernova': {
      // The mythic Supernova crown (GS-solar-flames): an opaque violet crown CAP worn over the head top
      // (so it FITS the head, not a floating orb — the original left too much bare face) with a DETONATING
      // STAR bursting from it: rays rooted along the HEAD CREST fan out radially to frame the head (the
      // flame crown's trick), a nebula SHELL of violet/pink puffs nestles above, bright star-KNOTS strew
      // the burst, and a white-hot core gem sits at the crown apex. Set-matched to the deep-violet nebula
      // Suit/Leggings (violet body, hot-pink accent). Distinct from the Punched Galaxy starburst (rigid
      // rays off a floating circlet) — this hugs the head. Rays/knots off small tables so it stays symmetric.
      const tip = '#fff4c2'; // white-gold nova core light (shared with the canvas mirror)
      const rb = 7.6; // rays root along the HEAD CREST (like the flame crown) so the burst hugs the head
      // [x, length, halfWidth] — a wide radial sunburst fanning around the upper head, framing the face.
      const fil: [number, number, number][] = [
        [0, 9.5, 1.35], [-2.7, 8.8, 1.2], [2.7, 8.8, 1.2],
        [-4.9, 7.6, 1.1], [4.9, 7.6, 1.1], [-6.4, 6.2, 1.0], [6.4, 6.2, 1.0],
        [-7.3, 4.8, 0.85], [7.3, 4.8, 0.85],
      ];
      const p = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
      // Nebula shell — soft violet/pink clumps nestled just above the crest, between the rays.
      const shell = ([[0, -10, 2.9], [-5, -8.8, 2.5], [5, -8.8, 2.5], [-8.2, -6, 2.1], [8.2, -6, 2.1]] as [number, number, number][])
        .map(([sx, sy, sr], i) => `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${i % 2 ? accent : color}" opacity="0.4"/>`)
        .join('');
      const spikes = fil
        .map(([x, len, w], i) => {
          const by = -Math.sqrt(Math.max(0, rb * rb - x * x)); // root on the head crest
          const ux = x / rb;
          const uy = by / rb; // outward radial unit
          const tx = x + len * ux;
          const ty = by + len * uy;
          const px = -uy; // perpendicular to the ray
          const py = ux;
          return `<path d="M${p(x - w * px, by - w * py)} L${p(tx, ty)} L${p(x + w * px, by + w * py)} Z" fill="url(#nv${uid})" stroke="#0c1116" stroke-width="0.4" stroke-linejoin="round"><animate attributeName="opacity" values="0.65;1;0.65" dur="${(1.9 + (i % 5) * 0.2).toFixed(1)}s" repeatCount="indefinite"/></path>`;
        })
        .join('');
      const knots = ([[-3.6, -13, 0.8], [3.6, -13, 0.8], [-9.5, -9, 0.75], [9.5, -9, 0.75], [0, -15.5, 0.7], [-12, -5.5, 0.7], [12, -5.5, 0.7]] as [number, number, number][])
        .map(([kx, ky, kr], i) => `<circle cx="${kx}" cy="${ky}" r="${kr}" fill="${i % 2 ? '#fff' : tip}"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(1.4 + i * 0.2).toFixed(1)}s" repeatCount="indefinite"/></circle>`)
        .join('');
      g = `<defs><linearGradient id="nv${uid}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${color}"/><stop offset="48%" stop-color="#8a3ad6"/><stop offset="76%" stop-color="${accent}"/><stop offset="100%" stop-color="${tip}"/>
        </linearGradient>
        <radialGradient id="nc${uid}"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${tip}"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        <linearGradient id="ncap${uid}" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stop-color="${shade(color, -0.45)}"/><stop offset="100%" stop-color="${shade(color, 0.14)}"/>
        </linearGradient></defs>
        ${shell}${spikes}
        <path d="M-6.7,-2 A7 7 0 0 1 6.7,-2 Z" fill="url(#ncap${uid})" ${ink}/>
        <path d="M-6.2,-2.6 A6.4 6.4 0 0 1 6.2,-2.6" fill="none" stroke="${accent}" stroke-width="1" opacity="0.9"/>
        <circle cx="-4.6" cy="-3.4" r="0.6" fill="${tip}"/><circle cx="4.6" cy="-3.4" r="0.6" fill="${tip}"/>
        ${knots}
        <g transform="translate(0 -6.6)">
          <circle r="4" fill="url(#nc${uid})"><animate attributeName="r" values="3.4;4.4;3.4" dur="2s" repeatCount="indefinite"/></circle>
          <path d="M0,-3.4 L0.9,-0.9 L3.4,0 L0.9,0.9 L0,3.4 L-0.9,0.9 L-3.4,0 L-0.9,-0.9 Z" fill="${tip}" stroke="#0c1116" stroke-width="0.3"/>
          <circle r="1" fill="#fff"/>
        </g>`;
      break;
    }
    case 'wingedHelm': {
      // The Asgardian Valkyrie helm (GS-valkyrie): a feathered silver wing swept up each side (drawn
      // first, behind the dome), a steel dome hugging the head, a gold brow band, a nasal guard down
      // the face, and a small gold rivet emblem.
      const wing = (d: number): string =>
        `<path d="M${d * 4.5},-5 C${d * 10},-6.5 ${d * 14},-10 ${d * 15.5},-15 C${d * 13.5},-12.5 ${d * 12},-12.8 ${d * 11},-11.2 C${d * 10.2},-9.8 ${d * 8.8},-10 ${d * 7.6},-9 C${d * 6.6},-7.6 ${d * 5.4},-6.6 ${d * 4.5},-5 Z" fill="#eef2f8" stroke="#0c1116" stroke-width="0.7" stroke-linejoin="round"/>
         <path d="M${d * 6},-6.4 C${d * 9},-8 ${d * 11.5},-10.4 ${d * 13},-13.4" fill="none" stroke="#b9c2cf" stroke-width="0.5" opacity="0.85"/>`;
      g = `${wing(-1)}${wing(1)}
        <path d="M-7,-3 A7 7 0 0 1 7,-3 Z" fill="${color}" ${ink}/>
        <path d="M-5.4,-8.2 A7 7 0 0 1 1.6,-9.4 Q-2.6,-7.2 -5.4,-8.2 Z" fill="#ffffff" opacity="0.25"/>
        <rect x="-7" y="-3.4" width="14" height="2.4" rx="1" fill="${accent}" ${ink}/>
        <rect x="-1.2" y="-1.2" width="2.4" height="5.4" rx="1.1" fill="${accent}" ${ink}/>
        <circle cx="0" cy="-6.1" r="1" fill="${accent}" stroke="#0c1116" stroke-width="0.5"/>`;
      break;
    }
    case 'baggy':
      // The baggy green (GS-unending): a soft, slouched crown that droops over one side, stitched
      // panel seams, a short brim, and a gold-thread emblem front and centre.
      g = `<path d="M-7.4,-1.6 Q-8.4,-8.2 -2.5,-9.6 Q0.5,-11.4 4,-9.4 Q8.6,-8.8 7.6,-3.4 Q8.8,-1.4 6.8,-1.2 Z" fill="${color}" ${ink}/>
        <path d="M-4.5,-9 Q-3.4,-4.6 -3.8,-1.6 M1.5,-10.2 Q1.2,-5.4 1.2,-1.5 M5.4,-8.6 Q4.8,-4.8 5,-2" fill="none" stroke="#0c1116" stroke-width="0.6" opacity="0.55"/>
        <path d="M-6.8,-2 Q0,1.8 6.6,-2 Z" fill="${accent}" ${ink}/>
        <circle cx="0.6" cy="-5.6" r="1.6" fill="none" stroke="${accent}" stroke-width="0.9"/>
        <path d="M0.6,-6.8 L0.6,-4.4 M-0.6,-5.6 L1.8,-5.6" stroke="${accent}" stroke-width="0.7"/>`;
      break;
    case 'tricorn': {
      // The galaxy pirate TRICORN (GS-space-pirate-parrot): a cocked three-corner felt hat washed in
      // nebula + starlight, gold buccaneer trim along the cocked brim, a starlight emblem front-and-
      // centre, AND a built-in black EYE PATCH drawn over one eye (with a strap across the brow). The
      // eye sits at ~(±2.4, -0.2) in this canonical r=7 frame — the patch covers the +x one. Mirrors
      // the canvas `drawHat 'tricorn'`.
      const trim = accent; // gold trim
      const star = '#fff0c0'; // starlight
      const body = `M-11.5,-1.8 L-8,-9.6 Q-6,-7 -4.2,-6.6 Q-2,-11 0,-11.6 Q2,-11 4.2,-6.6 Q6,-7 8,-9.6 L11.5,-1.8 Q0,1.8 -11.5,-1.8 Z`;
      // Starfield + a soft nebula wash confined to the felt.
      const starPts: [number, number, number][] = [
        [-6.5, -4.5, 0.55], [-3, -7.5, 0.5], [2.5, -8, 0.55], [6, -5, 0.5], [-8.5, -3, 0.45],
        [8.5, -3.2, 0.45], [0, -6, 0.4],
      ];
      const stars = `<g fill="#ffffff">${starPts.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}"/>`).join('')}</g>`;
      const nebula = `<path d="M-9,-3 Q-3,-8 3,-5 Q8,-3.6 9.5,-6" fill="none" stroke="${glow ?? '#7a5cff'}" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>`;
      // Eye patch over one eye + a strap across the brow (drawn last so it reads clearly over the face).
      const patch = `<g>
        <path d="M-4.8,-2.4 L4.6,-0.6" stroke="#0c0a14" stroke-width="0.9" stroke-linecap="round"/>
        <ellipse cx="2.6" cy="0.6" rx="2.15" ry="2.45" fill="#100c1a" stroke="#0c1116" stroke-width="0.6"/>
        <ellipse cx="1.9" cy="-0.1" rx="0.7" ry="0.9" fill="#ffffff" opacity="0.14"/>
      </g>`;
      g = `<path d="${body}" fill="${color}" ${ink}/>
        ${nebula}${stars}
        <path d="M-11.5,-1.8 L-8,-9.6 Q-6,-7 -4.2,-6.6 Q-2,-11 0,-11.6 Q2,-11 4.2,-6.6 Q6,-7 8,-9.6 L11.5,-1.8" fill="none" stroke="${trim}" stroke-width="1.1" stroke-linejoin="round"/>
        <g transform="translate(0 -4.4)">
          <path d="M0,-2.8 L0.8,-0.8 L2.8,0 L0.8,0.8 L0,2.8 L-0.8,0.8 L-2.8,0 L-0.8,-0.8 Z" fill="${star}" stroke="#0c1116" stroke-width="0.4"/>
          <circle r="0.7" fill="#fff"/>
        </g>
        ${patch}`;
      break;
    }
    default:
      g = '';
  }
  const flair =
    shape === 'starburst' || shape === 'supernova'
      ? sparkles([[-11, -9], [11, -8], [0, -18], [-6, 5]])
      : shape === 'tricorn'
        ? sparkles([[-10, -8], [10, -7]])
        : shape === 'baggy'
          ? sparkles([[-8, -8], [8, -6]])
          : '';
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">${a}${g}${flair}</g>`;
}

/** The pattern/panel detail a shirt shape adds over a coloured torso (no base silhouette) — authored
 *  in a canonical frame about the chest centre and fitted by a single scale, so the wardrobe icon
 *  (s=1) and the full-body figure (s tracks the figure size) read identically instead of the detail
 *  shrinking into a speck on a big torso. */
function shirtDetail(
  look: ApparelLook,
  cx: number,
  cy: number,
  s = 1,
  /** When the garment is WORN on the full-body figure, the torso is much taller than the shop card's
   *  little silhouette, so the compact card motif leaves the body half-empty (GS-worn-coverage). Pass
   *  the torso's reach in AUTHORED units (relative to this detail's centre) and the detailed mythic
   *  shapes draw an EXPANDED layout that fills it. Absent ⇒ the compact card motif (card stays identical). */
  worn?: { top: number; bottom: number; halfW: number },
): string {
  const { shape, accent = '#0c1116' } = look;
  let detail = '';
  switch (shape) {
    case 'valkyrie': {
      // The Valkyrie cuirass (GS-valkyrie): gold pauldrons on the shoulders, a central ridge, two
      // scaled plate bands across the belly, and a winged gold chest boss with a crimson star.
      const gold = look.accent ?? '#ffe08a';
      const ink = 'stroke="#0c1116" stroke-width="0.7" stroke-linejoin="round"';
      detail = `<path d="M-11,-9 Q-13.4,-4.6 -9,-2.6 Q-6,-5.6 -7,-9 Z" fill="${gold}" ${ink}/>
        <path d="M11,-9 Q13.4,-4.6 9,-2.6 Q6,-5.6 7,-9 Z" fill="${gold}" ${ink}/>
        <line x1="0" y1="-9" x2="0" y2="8" stroke="${gold}" stroke-width="1" opacity="0.65"/>
        <g fill="none" stroke="${gold}" stroke-width="0.8" opacity="0.7"><path d="M-6,2 Q0,5 6,2"/><path d="M-5,6 Q0,8.6 5,6"/></g>
        <g transform="translate(0 -4)">
          <path d="M-2.4,0 Q-6,-1.8 -8.4,-3.2 Q-5.2,-1.2 -2.6,-1.4 Z" fill="${gold}" ${ink}/>
          <path d="M2.4,0 Q6,-1.8 8.4,-3.2 Q5.2,-1.2 2.6,-1.4 Z" fill="${gold}" ${ink}/>
          <circle r="2.5" fill="${gold}" ${ink}/>
          <path d="M0,-1.5 L0.5,-0.4 L1.6,-0.3 L0.7,0.4 L0.9,1.5 L0,0.8 L-0.9,1.5 L-0.7,0.4 L-1.6,-0.3 L-0.5,-0.4 Z" fill="#7a2f34"/>
        </g>`;
      if (worn) {
        // Worn: the fauld — scaled plate bands + a central ridge continue down to the hem so the cuirass
        // armours the whole torso, not just the chest (GS-worn-coverage).
        const b = worn.bottom;
        detail += `<line x1="0" y1="8" x2="0" y2="${(b - 2).toFixed(1)}" stroke="${gold}" stroke-width="1" opacity="0.6"/>
          <g fill="none" stroke="${gold}" stroke-width="0.9" opacity="0.65">
            <path d="M-6.5,${(b - 15).toFixed(1)} Q0,${(b - 12).toFixed(1)} 6.5,${(b - 15).toFixed(1)}"/>
            <path d="M-6,${(b - 10).toFixed(1)} Q0,${(b - 7).toFixed(1)} 6,${(b - 10).toFixed(1)}"/>
            <path d="M-5,${(b - 5).toFixed(1)} Q0,${(b - 2.5).toFixed(1)} 5,${(b - 5).toFixed(1)}"/></g>
          <g fill="${gold}" opacity="0.85"><circle cx="0" cy="${(b - 13).toFixed(1)}" r="0.8"/><circle cx="0" cy="${(b - 8).toFixed(1)}" r="0.8"/></g>`;
      }
      break;
    }
    case 'polo':
      detail = `<path d="M-4,-9 L0,-4 L4,-9" fill="none" stroke="${accent}" stroke-width="1.6"/>
        <line x1="0" y1="-4" x2="0" y2="3" stroke="${accent}" stroke-width="1"/>
        <circle cx="0" cy="-1" r="0.8" fill="${accent}"/><circle cx="0" cy="2" r="0.8" fill="${accent}"/>`;
      if (worn) {
        // Worn: soft side seams + a hem line give the polo body definition down to the waist so it reads
        // as a finished shirt, not a flat colour block (GS-worn-coverage) — kept subtle so it stays a polo.
        const t = worn.top;
        const b = worn.bottom;
        detail += `<g stroke="${accent}" stroke-width="0.8" opacity="0.38" stroke-linecap="round" fill="none">
            <path d="M-9,${(t + 4).toFixed(1)} Q-9.8,${((t + b) / 2).toFixed(1)} -9,${(b - 2).toFixed(1)}"/>
            <path d="M9,${(t + 4).toFixed(1)} Q9.8,${((t + b) / 2).toFixed(1)} 9,${(b - 2).toFixed(1)}"/>
            <line x1="-8" y1="${(b - 3).toFixed(1)}" x2="8" y2="${(b - 3).toFixed(1)}"/></g>`;
      }
      break;
    case 'striped':
      if (worn) {
        // Worn: the bands run the WHOLE shirt, evenly spaced top-to-hem (GS-worn-coverage) — the shop
        // icon's three upper stripes left the tall worn body plain below the chest.
        const lines: string[] = [];
        for (let y = worn.top + 2; y <= worn.bottom - 1; y += 4.4) {
          lines.push(`<line x1="-13" y1="${y.toFixed(1)}" x2="13" y2="${y.toFixed(1)}"/>`);
        }
        detail = `<g stroke="${accent}" stroke-width="2.6" stroke-linecap="round">${lines.join('')}</g>`;
      } else {
        detail = `<g stroke="${accent}" stroke-width="2.4"><line x1="-12" y1="-2" x2="12" y2="-2"/><line x1="-12" y1="3" x2="12" y2="3"/><line x1="-12" y1="8" x2="12" y2="8"/></g>`;
      }
      break;
    case 'jersey':
      if (worn) {
        // Worn: the chest number panel stays high, with racing stripes down both flanks + a hem band, so
        // the sports jersey fills the torso instead of floating one badge mid-chest (GS-worn-coverage).
        const t = worn.top;
        const b = worn.bottom;
        detail = `<rect x="-10.5" y="${(t + 2).toFixed(1)}" width="2.6" height="${(b - t - 4).toFixed(1)}" rx="1" fill="${accent}" opacity="0.8"/>
          <rect x="7.9" y="${(t + 2).toFixed(1)}" width="2.6" height="${(b - t - 4).toFixed(1)}" rx="1" fill="${accent}" opacity="0.8"/>
          <rect x="-8" y="${(b - 6).toFixed(1)}" width="16" height="2.4" rx="1" fill="${accent}" opacity="0.7"/>
          <rect x="-6" y="${(t + 3).toFixed(1)}" width="12" height="12" rx="1.5" fill="${accent}" opacity="0.9"/>
          <text x="0" y="${(t + 12.5).toFixed(1)}" font-size="9" font-weight="800" text-anchor="middle" fill="#0c1116" font-family="system-ui,sans-serif">7</text>`;
      } else {
        detail = `<rect x="-6" y="-3" width="12" height="12" rx="1.5" fill="${accent}" opacity="0.85"/>
        <text x="0" y="7" font-size="9" font-weight="800" text-anchor="middle" fill="#0c1116" font-family="system-ui,sans-serif">7</text>`;
      }
      break;
    case 'spacesuit':
      detail = `<rect x="-5" y="-2" width="10" height="8" rx="1.4" fill="#cdd6e2" stroke="#0c1116" stroke-width="0.8"/>
        <circle cx="-2" cy="1" r="1.1" fill="${accent}"/><circle cx="2" cy="1" r="1.1" fill="#2bf0c0"/>
        <rect x="-3" y="3.4" width="6" height="1.4" fill="#ffd36b"/>
        <path d="M-12,-6 Q-14,1 -11,8" fill="none" stroke="#cdd6e2" stroke-width="1.4"/>`;
      if (worn) {
        // Worn: a utility belt + hip pouches + segment seams run down to the hem so the pressure suit
        // reads as engineered head-to-waist, not plain below the chest panel (GS-worn-coverage).
        const b = worn.bottom;
        detail += `<rect x="-9" y="${(b - 13).toFixed(1)}" width="18" height="3" rx="1.2" fill="#cdd6e2" stroke="#0c1116" stroke-width="0.6"/>
          <rect x="-1.6" y="${(b - 13).toFixed(1)}" width="3.2" height="3" fill="#ffd36b"/>
          <rect x="-8.5" y="${(b - 9).toFixed(1)}" width="5" height="6" rx="1" fill="#cdd6e2" stroke="#0c1116" stroke-width="0.6"/>
          <rect x="3.5" y="${(b - 9).toFixed(1)}" width="5" height="6" rx="1" fill="#cdd6e2" stroke="#0c1116" stroke-width="0.6"/>
          <g stroke="#aeb6c6" stroke-width="0.7" opacity="0.7"><line x1="-6" y1="${(b - 16).toFixed(1)}" x2="6" y2="${(b - 16).toFixed(1)}"/></g>`;
      }
      break;
    case 'cosmic':
      if (worn) {
        // Worn: a full nebula STARFIELD spanning the whole torso — a scatter of stars top-to-hem plus
        // three drifting nebula swooshes, so the living-nebula suit reads across the body, not one patch.
        const b = worn.bottom;
        const t = worn.top;
        const stars: [number, number, number][] = [
          [-5, t + 2.5, 0.9], [3, t + 5, 0.7], [-2, t + 10, 0.8], [6, t + 7.5, 0.6], [-6, t + 13, 0.6],
          [1, t + 17, 0.85], [5, t + 21, 0.7], [-4, t + 24, 0.65], [3, t + 28, 0.8], [-6, b - 6, 0.6],
          [6, b - 3, 0.7], [0, b - 1, 0.6], [-3, t + 6, 0.5], [7, t + 15, 0.55], [-7, t + 20, 0.55], [2, b - 8, 0.6],
        ];
        detail =
          `<g fill="#fff">${stars.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>` +
          `<path d="M-8,${(t + 6).toFixed(1)} Q0,${(t + 1).toFixed(1)} 8,${(t + 9).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.85"/>` +
          `<path d="M-8,${(t + 19).toFixed(1)} Q0,${(t + 14).toFixed(1)} 8,${(t + 22).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.75"/>` +
          `<path d="M-7,${(b - 5).toFixed(1)} Q0,${(b - 9).toFixed(1)} 7,${(b - 3).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.6"/>`;
      } else {
        detail = `<g fill="#fff"><circle cx="-4" cy="-2" r="0.9"/><circle cx="3" cy="1" r="0.7"/><circle cx="-1" cy="6" r="0.8"/><circle cx="6" cy="-4" r="0.6"/><circle cx="-6" cy="4" r="0.6"/></g>
        <path d="M-9,2 Q0,-3 9,5" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.8"/>`;
      }
      break;
    case 'blazer':
      // The tailored jacket (GS-unending's Evergreen Blazer): notched gold-trimmed lapels down to a
      // single button, a breast-pocket crest, and a hint of shirt in the open V.
      detail = `<path d="M-5,-9.5 L0,-4 L5,-9.5 L2.4,4 L-2.4,4 Z" fill="#f4f6f2" opacity="0.9"/>
        <path d="M-6,-10 L-1,-4.5 L-2.6,5 L-5.4,-1" fill="none" stroke="${accent}" stroke-width="1.3"/>
        <path d="M6,-10 L1,-4.5 L2.6,5 L5.4,-1" fill="none" stroke="${accent}" stroke-width="1.3"/>
        <circle cx="0" cy="6" r="1" fill="${accent}"/>
        <g transform="translate(-6.5 1)"><circle r="2.1" fill="${accent}"/><path d="M0,-1.3 L0.4,-0.4 L1.3,-0.3 L0.6,0.3 L0.8,1.2 L0,0.7 L-0.8,1.2 L-0.6,0.3 L-1.3,-0.3 L-0.4,-0.4 Z" fill="#0f5132"/></g>`;
      if (worn) {
        // Worn: the jacket tailors down the full torso — the lapel edges continue to the hem, a second
        // button, and two hip pockets, so the blazer body isn't a plain colour block (GS-worn-coverage).
        const b = worn.bottom;
        detail += `<g fill="none" stroke="${accent}" stroke-width="1" opacity="0.75">
            <path d="M-2.6,4 L-3.4,${(b - 2).toFixed(1)}"/><path d="M2.6,4 L3.4,${(b - 2).toFixed(1)}"/></g>
          <circle cx="0" cy="${(b - 12).toFixed(1)}" r="1" fill="${accent}"/>
          <g fill="none" stroke="${accent}" stroke-width="0.9" opacity="0.7">
            <path d="M-9,${(b - 9).toFixed(1)} L-3.5,${(b - 9).toFixed(1)} L-3.5,${(b - 5).toFixed(1)} L-9,${(b - 5).toFixed(1)}"/>
            <path d="M9,${(b - 9).toFixed(1)} L3.5,${(b - 9).toFixed(1)} L3.5,${(b - 5).toFixed(1)} L9,${(b - 5).toFixed(1)}"/></g>`;
      }
      break;
    case 'riftplate': {
      // The Punched Galaxy warplate (GS-punched-galaxy): a cosmic warlord's cuirass barely containing a
      // caged star — angular dark pauldrons + a gorget V-plate + a diamond core housing framing a glowing
      // STAR-CORE, with jagged GALAXY-CRACK energy forking out across the chest (accent + a cyan inner
      // spark) and red-hot coronal embers flickering. Styled after a cosmic end-boss's power-up.
      const acc = look.accent ?? '#ff7bf0';
      const body = look.color ?? '#2a1257';
      const plate = shade(body, -0.3);
      const gorget = shade(body, -0.1);
      const cyan = '#8fefff';
      const inkP = 'stroke="#0c1116" stroke-width="0.7" stroke-linejoin="round"';
      const crack = (d: string): string =>
        `<path d="${d}" fill="none" stroke="${acc}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="#fff" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
      const embers = ([[-8, -6], [7.5, -5], [-6.5, 5.5], [6.5, 6], [0, -8.5]] as [number, number][])
        .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="0.7" fill="${i % 2 ? '#ffd07a' : acc}"><animate attributeName="opacity" values="0;1;0" dur="${(1 + i * 0.21).toFixed(2)}s" repeatCount="indefinite"/></circle>`)
        .join('');
      detail = `
        <path d="M-11.5,-9 L-5.5,-10.5 L-4,-3.5 L-10,-1.8 Z" fill="${plate}" ${inkP}/>
        <path d="M11.5,-9 L5.5,-10.5 L4,-3.5 L10,-1.8 Z" fill="${plate}" ${inkP}/>
        <path d="M-10.6,-8.4 L-5.4,-9.6 M9.6,-8.4 L4.6,-9.6" stroke="${acc}" stroke-width="0.6" opacity="0.8"/>
        <path d="M-5.5,-10.5 L0,-6.2 L5.5,-10.5 L4.6,-2.2 L-4.6,-2.2 Z" fill="${gorget}" ${inkP}/>
        <g>
          ${crack('M0,-1 L-3,-4.5 L-7.5,-5.5 L-10,-8.5')}
          ${crack('M0,-1 L3,-4.5 L7.5,-5.5 L10,-8.5')}
          ${crack('M0,-1 L-2,3 L-4.5,7.8')}
          ${crack('M0,-1 L2,3 L5,7.8')}
          ${crack('M0,-1 L-6,-0.4 L-10.5,1.2')}
          ${crack('M0,-1 L6,-0.4 L10.5,1.2')}
        </g>
        <path d="M0,-1 L-1.6,-4 L-4.2,-4.6" fill="none" stroke="${cyan}" stroke-width="0.7" stroke-linecap="round" opacity="0.85"/>
        <path d="M0,-1 L1.7,2.4 L3.6,3.4" fill="none" stroke="${cyan}" stroke-width="0.7" stroke-linecap="round" opacity="0.85"/>
        <path d="M0,-6.4 L2.9,-1 L0,4.4 L-2.9,-1 Z" fill="${plate}" ${inkP}/>
        <circle cx="0" cy="-1" r="3.4" fill="${acc}" opacity="0.5"><animate attributeName="r" values="3;4;3" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.3;0.6;0.3" dur="1.8s" repeatCount="indefinite"/></circle>
        <circle cx="0" cy="-1" r="2.3" fill="${acc}"/>
        <circle cx="0" cy="-1" r="1.4" fill="#ffd9f6"/>
        <circle cx="0" cy="-1" r="0.7" fill="#fff"/>
        ${embers}
        <g fill="#fff" opacity="0.85"><circle cx="-8.5" cy="-1.6" r="0.7"/><circle cx="8.6" cy="-2.6" r="0.6"/><circle cx="-3.2" cy="8" r="0.6"/><circle cx="3.8" cy="-8.6" r="0.5"/></g>`;
      if (worn) {
        // Worn: the caged star's galaxy-crack energy forks all the way DOWN the torso to the hem, over a
        // lower belly plate, with more embers + starfield — so the warplate fills the whole body, not just
        // the chest (GS-worn-coverage).
        const b = worn.bottom;
        const lp = (b - 12).toFixed(1); // lower plate centre
        detail += `
          ${crack(`M0,-1 L-1.6,7 L-3,15 L-2.2,${(b - 3).toFixed(1)}`)}
          ${crack(`M0,-1 L1.8,7 L3.2,15 L2.4,${(b - 3).toFixed(1)}`)}
          ${crack(`M0,4 L-4.5,9 L-6.5,${(b - 7).toFixed(1)}`)}
          ${crack(`M0,4 L4.5,9 L6.5,${(b - 7).toFixed(1)}`)}
          <path d="M0,${(b - 17).toFixed(1)} L3.1,${lp} L0,${(b - 7).toFixed(1)} L-3.1,${lp} Z" fill="${plate}" ${inkP}/>
          <circle cx="0" cy="${lp}" r="2.4" fill="${acc}" opacity="0.5"><animate attributeName="r" values="2;2.9;2" dur="1.9s" repeatCount="indefinite"/></circle>
          <circle cx="0" cy="${lp}" r="1.5" fill="${acc}"/><circle cx="0" cy="${lp}" r="0.7" fill="#fff"/>
          <g fill="#fff" opacity="0.85"><circle cx="-6.5" cy="${(b - 15).toFixed(1)}" r="0.6"/><circle cx="6.8" cy="${(b - 9).toFixed(1)}" r="0.55"/><circle cx="-4" cy="${(b - 3).toFixed(1)}" r="0.6"/><circle cx="4.4" cy="${(b - 19).toFixed(1)}" r="0.5"/><circle cx="7.2" cy="${(b - 21).toFixed(1)}" r="0.5"/><circle cx="-7.2" cy="${(b - 5).toFixed(1)}" r="0.5"/></g>
          <g><circle cx="-5" cy="${(b - 12).toFixed(1)}" r="0.7" fill="${acc}"><animate attributeName="opacity" values="0;1;0" dur="1.3s" repeatCount="indefinite"/></circle><circle cx="5.5" cy="${(b - 16).toFixed(1)}" r="0.6" fill="#ffd07a"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle></g>`;
      }
      break;
    }
    case 'solarflare': {
      // The Solar Flames robe (GS-solar-flames): a blazing coronal SUN-CORE on the chest (soft glow → red
      // disc → hot-gold inner → white pip) ringed by short coronal spikes, with purple-black solar FLAMES
      // licking up the hem (dark→violet→magenta→red→hot, stacked solid fills so no shared gradient id can
      // cross-tint co-mounted lounge figures — the riftplate rule) and red embers rising. Set-matched to
      // the flame crown (deep purple-black body, red coronal accent). Mirrors the canvas `drawGolfer`.
      const cor = look.accent ?? '#ff4d2a';
      const corHi = '#ffb648';
      const p = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
      const flamePath = (bx: number, by: number, h: number, w: number, c: number): string =>
        `M${p(bx - w, by)} Q${p(bx - w * 0.78, by - h * 0.5)} ${p(bx - w * 0.12 + c * 0.4, by - h * 0.72)}` +
        ` Q${p(bx + c * 0.9, by - h * 0.92)} ${p(bx + c, by - h)}` +
        ` Q${p(bx + w * 0.55 + c * 0.4, by - h * 0.52)} ${p(bx + w * 0.82, by - h * 0.34)}` +
        ` Q${p(bx + w, by - h * 0.15)} ${p(bx + w, by)} Z`;
      // Worn: the flames rise from the ACTUAL hem (bottom of the tall torso) and lick much higher, so
      // the robe reads as sheathed in fire top-to-toe instead of one small band mid-chest (GS-worn-coverage).
      const hemY = worn ? worn.bottom - 0.5 : 10.5;
      const flames: [number, number, number, number][] = worn
        ? [
            [0, 22, 3.0, 0], [-5.5, 18.5, 2.6, -0.9], [5.5, 18.5, 2.6, 0.9], [-9, 14, 2.2, -1.6],
            [9, 14, 2.2, 1.6], [-2.8, 16, 1.6, -0.4], [2.8, 16, 1.6, 0.4],
          ]
        : [[0, 9.5, 2.6, 0], [-5, 8, 2.2, -0.8], [5, 8, 2.2, 0.8], [-9, 6, 1.8, -1.5], [9, 6, 1.8, 1.5]];
      const flameGs = flames
        .map(([x, h, w, c], i) => {
          const back = `<path d="${flamePath(x, hemY, h * 1.12, w * 1.16, c)}" fill="#160826"/>`;
          const bodyF = `<path d="${flamePath(x, hemY, h, w, c)}" fill="#6a24b8" stroke="#0c1116" stroke-width="0.3" stroke-linejoin="round"/>`;
          const mid = `<path d="${flamePath(x, hemY, h * 0.82, w * 0.72, c * 0.85)}" fill="#b8309a"/>`;
          const lick = `<path d="${flamePath(x, hemY, h * 0.58, w * 0.5, c * 0.7)}" fill="${cor}"><animate attributeName="opacity" values="0.55;1;0.7;0.55" dur="${(1.1 + i * 0.16).toFixed(2)}s" repeatCount="indefinite"/></path>`;
          const inner = `<path d="${flamePath(x, hemY, h * 0.34, w * 0.3, c * 0.5)}" fill="${corHi}"><animate attributeName="opacity" values="0.25;0.9;0.4;0.25" dur="${(0.9 + i * 0.13).toFixed(2)}s" repeatCount="indefinite"/></path>`;
          return back + bodyF + mid + lick + inner;
        })
        .join('');
      const emberPts: [number, number][] = worn
        ? [[-7, hemY - 5], [7, hemY - 3], [-4, hemY - 12], [5, hemY - 15], [0, hemY - 8], [-6, hemY - 19], [6, hemY - 21], [3, hemY - 2], [-3, 3], [5, 2]]
        : [[-7, 2], [7, 3], [-3, -0.5], [4, -1], [0, 4]];
      const embers = emberPts
        .map(([ex, ey], i) => `<circle cx="${ex}" cy="${ey.toFixed(1)}" r="${(0.5 + (i % 2) * 0.3).toFixed(1)}" fill="${i % 2 ? corHi : cor}"><animate attributeName="opacity" values="0;1;0" dur="${(1 + i * 0.2).toFixed(2)}s" repeatCount="indefinite"/><animate attributeName="cy" values="${ey.toFixed(1)};${(ey - 3).toFixed(1)}" dur="${(1 + i * 0.2).toFixed(2)}s" repeatCount="indefinite"/></circle>`)
        .join('');
      // Coronal sun-core on the upper chest — soft glow, coronal spikes ring, red disc, hot inner, white pip.
      const spikes = Array.from({ length: 8 }, (_, k) => {
        const t = (k * Math.PI) / 4;
        const x0 = Math.cos(t) * 3.2;
        const y0 = -3 + Math.sin(t) * 3.2;
        const x1 = Math.cos(t) * 5.4;
        const y1 = -3 + Math.sin(t) * 5.4;
        const nx = -Math.sin(t) * 0.9;
        const ny = Math.cos(t) * 0.9;
        return `<path d="M${p(x0 - nx, y0 - ny)} L${p(x1, y1)} L${p(x0 + nx, y0 + ny)} Z" fill="${cor}" opacity="0.85"/>`;
      }).join('');
      const core = `<circle cx="0" cy="-3" r="5" fill="${cor}" opacity="0.35"><animate attributeName="r" values="4.4;5.6;4.4" dur="1.8s" repeatCount="indefinite"/></circle>
        ${spikes}
        <circle cx="0" cy="-3" r="3" fill="${cor}" stroke="#0c1116" stroke-width="0.4"/>
        <circle cx="0" cy="-3" r="1.8" fill="${corHi}"/>
        <circle cx="0" cy="-3" r="0.7" fill="#fff"/>`;
      detail = flameGs + core + embers;
      break;
    }
    case 'parrot': {
      // The Space Parrot plumage (GS-space-pirate-parrot): rows of iridescent scalloped macaw feathers
      // (teal → gold → magenta, cycling per row) shingled down the cosmic-blue body, with white star
      // specks flecked over them and a starlight gem on the breast. Mirrors the canvas `drawGolfer`.
      const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
      const scale = (x: number, y: number, r: number, col: string): string =>
        `<path d="M${(x - r).toFixed(1)},${y.toFixed(1)} A${r.toFixed(2)},${r.toFixed(2)} 0 0 0 ${(x + r).toFixed(1)},${y.toFixed(1)} Z" fill="${col}" stroke="#0c1116" stroke-width="0.3" stroke-linejoin="round"/>`;
      const rows = (yTop: number, yBottom: number, halfW: number): string => {
        const r = 2.4;
        const step = r * 1.32;
        let out = '';
        let row = 0;
        for (let y = yTop; y <= yBottom; y += step, row++) {
          const col = plume[row % plume.length]!;
          const off = (row % 2) * r; // stagger alternate rows
          for (let x = -halfW + off; x <= halfW; x += r * 2) out += scale(x, y, r, col);
        }
        return out;
      };
      const starPts: [number, number, number][] = worn
        ? [[-6, worn.top + 3, 0.7], [5, worn.top + 9, 0.6], [-4, worn.top + 16, 0.65], [6, worn.top + 22, 0.6], [-6, worn.bottom - 6, 0.6], [3, worn.bottom - 2, 0.55]]
        : [[-6, -6, 0.6], [5, -2, 0.55], [-3, 4, 0.6], [6, 7, 0.5]];
      const stars = `<g fill="#ffffff">${starPts.map(([x, y, rr]) => `<circle cx="${x}" cy="${y.toFixed(1)}" r="${rr}"/>`).join('')}</g>`;
      const gemY = worn ? worn.top + 5 : -6;
      const gem = `<g transform="translate(0 ${gemY.toFixed(1)})">
        <path d="M0,-2.4 L0.7,-0.7 L2.4,0 L0.7,0.7 L0,2.4 L-0.7,0.7 L-2.4,0 L-0.7,-0.7 Z" fill="#fff0c0" stroke="#0c1116" stroke-width="0.3"/>
        <circle r="0.6" fill="#fff"/></g>`;
      detail = worn ? rows(worn.top + 2, worn.bottom - 1, worn.halfW) + stars + gem : rows(-8, 10, 8.5) + stars + gem;
      break;
    }
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
    shape === 'cosmic' || shape === 'blazer' || shape === 'riftplate' || shape === 'solarflare' || shape === 'parrot'
      ? sparkles([[cx - 12, cy - 6], [cx + 12, cy + 2]])
      : '';
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
  } else if (shape === 'riftgreaves') {
    // The Punched Galaxy greaves (GS-punched-galaxy): galaxy-crack energy forking down each leg (accent
    // + a white core) over angular cosmic shin plates, with a scatter of starfield specks — the legs of
    // the warplate.
    const acc = look.accent ?? '#ff7bf0';
    const plate = shade(color, -0.3);
    const inkP = 'stroke="#0c1116" stroke-width="0.6" stroke-linejoin="round"';
    const crack = (d: string): string =>
      `<path d="${d}" fill="none" stroke="${acc}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="${d}" fill="none" stroke="#fff" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    detail =
      `<rect x="${cx - 6.4}" y="${legBottom - 6}" width="4.2" height="6.2" rx="1" fill="${plate}" ${inkP}/>` +
      `<rect x="${cx + 2.2}" y="${legBottom - 6}" width="4.2" height="6.2" rx="1" fill="${plate}" ${inkP}/>` +
      crack(`M${cx - 4.6},${cy - 6} L${cx - 5.2},${cy + 1} L${cx - 3.6},${legBottom - 5}`) +
      crack(`M${cx + 4.6},${cy - 6} L${cx + 5.2},${cy + 1} L${cx + 3.6},${legBottom - 5}`) +
      `<g fill="#fff"><circle cx="${cx - 3.4}" cy="${cy + 2}" r="0.7"/><circle cx="${cx + 3.6}" cy="${cy + 6}" r="0.6"/><circle cx="${cx + 5}" cy="${cy - 4}" r="0.5"/></g>`;
  } else if (shape === 'emberlegs') {
    // The Solar Flames leggings (GS-solar-flames): purple-black solar FLAMES licking up each leg
    // (dark→violet→magenta→red→hot, stacked solid fills — the shirt's idiom) with red embers rising.
    // Set-matched to the flame crown + robe. Mirrors the canvas `drawPants`.
    const cor = look.accent ?? '#ff4d2a';
    const corHi = '#ffb648';
    const P = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
    const flamePath = (bx: number, by: number, h: number, w: number, c: number): string =>
      `M${P(bx - w, by)} Q${P(bx - w * 0.78, by - h * 0.5)} ${P(bx - w * 0.12 + c * 0.4, by - h * 0.72)}` +
      ` Q${P(bx + c * 0.9, by - h * 0.92)} ${P(bx + c, by - h)}` +
      ` Q${P(bx + w * 0.55 + c * 0.4, by - h * 0.52)} ${P(bx + w * 0.82, by - h * 0.34)}` +
      ` Q${P(bx + w, by - h * 0.15)} ${P(bx + w, by)} Z`;
    const by = legBottom - 1;
    const flames: [number, number, number, number][] = [
      [cx - 5, 11, 1.9, -0.3], [cx - 2.8, 7, 1.3, 0.5], [cx + 5, 11, 1.9, 0.3], [cx + 2.8, 7, 1.3, -0.5],
    ];
    const flameGs = flames
      .map(([x, h, w, c], i) => {
        const back = `<path d="${flamePath(x, by, h * 1.12, w * 1.16, c)}" fill="#160826"/>`;
        const bodyF = `<path d="${flamePath(x, by, h, w, c)}" fill="#6a24b8" stroke="#0c1116" stroke-width="0.3" stroke-linejoin="round"/>`;
        const mid = `<path d="${flamePath(x, by, h * 0.8, w * 0.72, c * 0.85)}" fill="#b8309a"/>`;
        const lick = `<path d="${flamePath(x, by, h * 0.56, w * 0.5, c * 0.7)}" fill="${cor}"><animate attributeName="opacity" values="0.55;1;0.7;0.55" dur="${(1.1 + i * 0.17).toFixed(2)}s" repeatCount="indefinite"/></path>`;
        const inner = `<path d="${flamePath(x, by, h * 0.32, w * 0.3, c * 0.5)}" fill="${corHi}"><animate attributeName="opacity" values="0.25;0.9;0.4;0.25" dur="${(0.9 + i * 0.14).toFixed(2)}s" repeatCount="indefinite"/></path>`;
        return back + bodyF + mid + lick + inner;
      })
      .join('');
    const embers = ([[cx - 6, cy - 2], [cx + 6, cy - 4], [cx - 3, cy + 3], [cx + 3, cy + 1]] as [number, number][])
      .map(([ex, ey], i) => `<circle cx="${ex}" cy="${ey}" r="${(0.5 + (i % 2) * 0.25).toFixed(2)}" fill="${i % 2 ? corHi : cor}"><animate attributeName="opacity" values="0;1;0" dur="${(1 + i * 0.22).toFixed(2)}s" repeatCount="indefinite"/></circle>`)
      .join('');
    detail = flameGs + embers;
  } else if (shape === 'parrotpants') {
    // The Space Parrot tailfeathers (GS-space-pirate-parrot): long macaw tail-plumes sweeping down each
    // leg (teal/gold/magenta) over cosmic navy, tipped with star specks. Mirrors the canvas `drawPants`.
    const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
    const feather = (x: number, yTop: number, len: number, w: number, col: string): string =>
      `<path d="M${x.toFixed(1)},${yTop.toFixed(1)} Q${(x - w).toFixed(1)},${(yTop + len * 0.55).toFixed(1)} ${x.toFixed(1)},${(yTop + len).toFixed(1)} Q${(x + w).toFixed(1)},${(yTop + len * 0.55).toFixed(1)} ${x.toFixed(1)},${yTop.toFixed(1)} Z" fill="${col}" stroke="#0c1116" stroke-width="0.3" stroke-linejoin="round"/>` +
      `<line x1="${x.toFixed(1)}" y1="${(yTop + 1).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(yTop + len - 1).toFixed(1)}" stroke="#0c1116" stroke-width="0.3" opacity="0.5"/>`;
    const legFeathers = (lx: number, row0: number): string => {
      const specs: [number, number, number, number][] = [
        [lx, cy - 6, legBottom - (cy - 6), 2.3],
        [lx - 2.5, cy - 3, (legBottom - (cy - 3)) * 0.74, 1.6],
        [lx + 2.5, cy - 3, (legBottom - (cy - 3)) * 0.74, 1.6],
      ];
      return specs.map(([x, yt, len, w], i) => feather(x, yt, len, w, plume[(i + row0) % 3]!)).join('');
    };
    detail =
      legFeathers(cx - 3.5, 0) +
      legFeathers(cx + 3.5, 1) +
      `<g fill="#fff"><circle cx="${cx - 3.5}" cy="${cy + 1}" r="0.6"/><circle cx="${cx + 3.5}" cy="${cy + 4}" r="0.6"/><circle cx="${cx - 5.5}" cy="${cy + 6}" r="0.5"/><circle cx="${cx + 5.5}" cy="${cy - 2}" r="0.5"/></g>`;
  } else if (shape === 'greaves') {
    // Valkyrie greaves (GS-valkyrie): war-skirt tassets hanging off the waist + gold shin plates.
    const plate = shade(accent, 0.14);
    detail = `<g fill="${accent}" stroke="#0c1116" stroke-width="0.6" stroke-linejoin="round">
        <path d="M${cx - 8},${cy - 7} L${cx - 3},${cy - 7} L${cx - 4.6},${cy} Z"/>
        <path d="M${cx - 2.6},${cy - 7} L${cx + 2.6},${cy - 7} L${cx + 1.6},${cy} L${cx - 1.6},${cy} Z"/>
        <path d="M${cx + 3},${cy - 7} L${cx + 8},${cy - 7} L${cx + 4.6},${cy} Z"/>
      </g>
      <g fill="${plate}" stroke="#0c1116" stroke-width="0.6" stroke-linejoin="round">
        <rect x="${cx - 6.4}" y="${legBottom - 6}" width="4" height="6.4" rx="1.1"/>
        <rect x="${cx + 2.4}" y="${legBottom - 6}" width="4" height="6.4" rx="1.1"/>
      </g>`;
  }
  const flair =
    shape === 'nebula' || shape === 'riftgreaves' || shape === 'emberlegs' || shape === 'parrotpants'
      ? sparkles([[cx - 10, cy - 4], [cx + 10, cy + 6]])
      : '';
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

/**
 * Draw a DRIVER-club glyph (the cosmetic driver slot, GS-thor) — a mythic WARHAMMER stood on its haft:
 * a rune-etched gilded hammer head crossing the top of a leather-gripped shaft, wreathed in flickering
 * electric-blue forked lightning. The lightning reuses the shipArt Thunderbolt idiom (a wide `#59b6ff`
 * glow under a white core, `<animate>` opacity flicker). Authored in a ~34u frame about (cx,cy); `scale`
 * fits it elsewhere (the card icon, the mannequin's side prop).
 */
function driverGlyph(look: ApparelLook, cx: number, cy: number, uid: string, scale = 1): string {
  const { color = '#c9a24a', accent = '#59b6ff', glow } = look;
  const ink = 'stroke="#0c1116" stroke-width="1" stroke-linejoin="round"';
  const a = glow ? aura(0, -7, 22, glow, `dvg${uid}`) : '';
  // The Thunderbolt flick/bolt idiom (render/shipArt.ts chopper case): a wide electric-blue glow under a
  // thin white core, each flickering on its own phase.
  const flick = (dur: string, begin: string): string =>
    `<animate attributeName="opacity" values="0;1;0;0.7;0;0.9;0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`;
  const bolt = (d: string, dur: string, begin: string): string => `
    <path d="${d}" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0">${flick(dur, begin)}</path>
    <path d="${d}" fill="none" stroke="#eaf6ff" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" opacity="0">${flick(dur, begin)}</path>`;
  const bolts = `<g>
    ${bolt('M9,-13 L14,-15 L11,-10 L17,-11', '0.7s', '0s')}
    ${bolt('M-9,-12 L-15,-14 L-11,-9 L-17,-10', '0.6s', '0.3s')}
    ${bolt('M10,-3 L16,-1 L13,3', '0.5s', '0.15s')}</g>`;
  // Leather-gripped haft, then the chunky gilded head crossing its top (lighter struck faces + rune diamond).
  const haft = `<rect x="-1.4" y="-9" width="2.8" height="27" rx="1.3" fill="#6b4a24" ${ink}/>
    <rect x="-1.7" y="8" width="3.4" height="9" rx="1.3" fill="#2f2010"/>`;
  const head = `<rect x="-9" y="-15" width="18" height="12.5" rx="1.6" fill="${color}" ${ink}/>
    <rect x="-9" y="-15" width="4.2" height="12.5" fill="#ecd591"/>
    <rect x="4.8" y="-15" width="4.2" height="12.5" fill="#ecd591"/>
    <path d="M0,-12 L2.8,-8.7 L0,-5.4 L-2.8,-8.7 Z" fill="none" stroke="#7a5a22" stroke-width="0.9"/>`;
  return `<g transform="translate(${cx} ${cy}) scale(${scale.toFixed(3)})">${a}${bolts}${haft}${head}${sparkles([[-12, -14], [12, 2]])}</g>`;
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
          : item.slot === 'driver'
            ? driverGlyph(item.look, cx, cy + 2, uid, 1.4)
            : pantsGlyph(item.look, cx, cy, uid);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${item.name}" style="display:block;">${glyph}</svg>`;
}

/**
 * Draw a golfer's CHOSEN hairstyle on the front-facing figure (GS-avatar-gender). This is the ONLY
 * per-character gender-presentation cue, and it lives ENTIRELY above the neck — the body silhouette,
 * torso, limbs and every garment are byte-identical for all golfers, so outfits stay gender-neutral
 * (a spacesuit drapes the same on everyone; a sealed helmet hides hair, so all read identical in one).
 *
 * Authored in the figure's proportional frame: head centred at (cx, headY) with radius `headR`, `S`
 * the figure scale. Returns three z-layers the caller threads into the stack: `back` (a rear mass drawn
 * BEHIND the head), `top` (the scalp cap + face-framing side locks + fringe, over the skin, under any
 * hat), and `face` (optional light stubble over the jaw). Styles run a length/shape spectrum — `crop`
 * (short) → `sweep` (side-swept) → `tousled` (medium) → `coils` (voluminous) — any golfer could wear
 * any of them; each character row just picks its look.
 */
function hairLayers(
  hair: GolferHair,
  cx: number,
  headY: number,
  headR: number,
  S: number,
): { back: string; top: string; face: string } {
  const px = (n: number): number => n * S;
  const f = (n: number): string => (Math.round(n * 10) / 10).toString();
  const sw = (n: number): number => Math.max(0.7, n * S);
  const col = hair.color;
  const lo = shade(col, -0.3);
  const hi = shade(col, 0.26);
  const ink = `stroke="#0c1116" stroke-width="${sw(1.1)}" stroke-linejoin="round"`;

  // Per-style geometry: how far the side locks fall below the head centre, how far the rear mass falls,
  // the crown apex height, and the hairline height on the forehead (all in authored px).
  const CFG: Record<GolferHair['style'], { side: number; back: number; crown: number; fringe: number }> = {
    crop: { side: 0.5, back: 0, crown: 15, fringe: 6.6 },
    sweep: { side: 3, back: 4, crown: 15, fringe: 6 },
    tousled: { side: 4.5, back: 6.5, crown: 15.6, fringe: 5.4 },
    coils: { side: 13, back: 13, crown: 15.2, fringe: 5 },
  };
  const c = CFG[hair.style];

  const sxOuter = headR + px(0.6); // outer edge of the hair, a hair proud of the head
  const sxInner = headR - px(3.6); // inner edge of a side lock → frames the face
  const apexY = headY - px(c.crown); // top of the crown
  const hlY = headY - px(c.fringe); // hairline on the forehead
  const fx = px(9); // half-width of the fringe across the forehead
  const botY = headY + px(c.side); // where the side locks end
  const taper = px(1.4); // the inner bottom of a lock pulls in toward the face

  // The fringe segment across the forehead, from the RIGHT hairline point (current pen) to the LEFT
  // one — the silhouette detail that most distinguishes the styles.
  let fringe: string;
  switch (hair.style) {
    case 'sweep': // an off-centre side sweep
      fringe = `C ${f(cx + px(3))},${f(hlY + px(2.4))} ${f(cx - px(2.5))},${f(hlY - px(1.2))} ${f(cx - fx)},${f(hlY + px(1.8))}`;
      break;
    case 'tousled': // a spiky, textured hairline
      fringe = `L ${f(cx + px(4.6))},${f(hlY + px(2.2))} L ${f(cx + px(2))},${f(hlY - px(1.2))} L ${f(cx - px(1))},${f(hlY + px(2))} L ${f(cx - px(4.2))},${f(hlY - px(0.8))} L ${f(cx - fx)},${f(hlY + px(1.4))}`;
      break;
    case 'coils': // a soft scalloped hairline
      fringe = `Q ${f(cx + px(4.5))},${f(hlY - px(1.6))} ${f(cx + px(2.5))},${f(hlY + px(0.6))} Q ${f(cx)},${f(hlY - px(2))} ${f(cx - px(2.5))},${f(hlY + px(0.6))} Q ${f(cx - px(4.5))},${f(hlY - px(1.6))} ${f(cx - fx)},${f(hlY)}`;
      break;
    default: // crop — a clean shallow dip
      fringe = `Q ${f(cx)},${f(hlY + px(1.4))} ${f(cx - fx)},${f(hlY)}`;
  }

  // ── TOP: crown + face-framing side locks + fringe (one filled outline over the skin) ──
  const topPath =
    `M ${f(cx - sxOuter)},${f(botY)} ` +
    `L ${f(cx - sxOuter)},${f(headY - px(1))} ` +
    `Q ${f(cx - headR - px(0.5))},${f(apexY + px(6))} ${f(cx - px(8.5))},${f(apexY + px(1))} ` +
    `Q ${f(cx)},${f(apexY - px(1))} ${f(cx + px(8.5))},${f(apexY + px(1))} ` +
    `Q ${f(cx + headR + px(0.5))},${f(apexY + px(6))} ${f(cx + sxOuter)},${f(headY - px(1))} ` +
    `L ${f(cx + sxOuter)},${f(botY)} ` +
    `L ${f(cx + sxInner - taper)},${f(botY)} ` +
    `Q ${f(cx + sxInner)},${f(headY - px(2))} ${f(cx + fx)},${f(hlY)} ` +
    `${fringe} ` +
    `Q ${f(cx - sxInner)},${f(headY - px(2))} ${f(cx - sxInner + taper)},${f(botY)} Z`;
  const topFill = `<path d="${topPath}" fill="${col}" ${ink}/>`;
  // A soft highlight sweeping over the crown for roundness.
  const sheen = `<path d="M ${f(cx - px(9))},${f(apexY + px(5))} Q ${f(cx - px(2))},${f(apexY - px(0.5))} ${f(cx + px(5))},${f(apexY + px(3))}" fill="none" stroke="${hi}" stroke-width="${sw(1.6)}" stroke-linecap="round" opacity="0.5"/>`;
  // Coils get a few little texture bumps around the crown.
  const texture =
    hair.style === 'coils'
      ? `<g fill="${hi}" opacity="0.45">` +
        ([[-9, -12], [-3, -14.5], [4, -14], [9.5, -11], [-11, -6], [11, -6]] as [number, number][])
          .map(([dx, dy]) => `<circle cx="${f(cx + px(dx))}" cy="${f(headY + px(dy))}" r="${f(px(1.7))}"/>`)
          .join('') +
        `</g>`
      : '';

  // ── BACK: a rear mass drawn behind the head (longer styles only) ──
  let back = '';
  if (c.back > 0) {
    const backBot = headY + px(c.back);
    back =
      `<path d="M ${f(cx - headR - px(1))},${f(headY - px(2))} ` +
      `Q ${f(cx - headR - px(3.5))},${f(backBot)} ${f(cx - headR + px(2.5))},${f(backBot)} ` +
      `L ${f(cx + headR - px(2.5))},${f(backBot)} ` +
      `Q ${f(cx + headR + px(3.5))},${f(backBot)} ${f(cx + headR + px(1))},${f(headY - px(2))} ` +
      `Q ${f(cx)},${f(headY - headR - px(2.5))} ${f(cx - headR - px(1))},${f(headY - px(2))} Z" fill="${lo}" ${ink}/>`;
  }

  // ── FACE: optional light stubble over the jaw (a faint hair-toned wash) ──
  const face =
    hair.facial === 'stubble'
      ? `<path d="M ${f(cx - px(8.5))},${f(headY + px(3.5))} Q ${f(cx)},${f(headY + px(11))} ${f(cx + px(8.5))},${f(headY + px(3.5))} ` +
        `Q ${f(cx + px(6.5))},${f(headY + px(9))} ${f(cx)},${f(headY + px(10.5))} ` +
        `Q ${f(cx - px(6.5))},${f(headY + px(9))} ${f(cx - px(8.5))},${f(headY + px(3.5))} Z" fill="${col}" opacity="0.18"/>`
      : '';

  return { back, top: topFill + sheen + texture, face };
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
    /** The equipped cosmetic driver (GS-thor) — propped at the golfer's other side (mirrors on-course). */
    driverId?: string;
    /** Signature cap colour — worn when no cosmetic hat is equipped (mirrors on-course). */
    capColor?: string;
    /** The golfer's chosen hairstyle (render-only). Drawn only above the neck and hidden by a sealed
     *  helmet, so it never affects how a garment looks. Absent ⇒ no hair drawn. */
    hair?: GolferHair;
    /** Unique id prefix for this figure's SVG defs — ids are DOCUMENT-global, so co-mounted figures
     *  need distinct prefixes. Defaults to a hash of the figure's inputs, which makes an accidental
     *  collision harmless (two figures hashing alike are wearing the identical look anyway). */
    uid?: string;
    /** GS-story-coil-garb: draw a Coil DEFECTOR — an open serpent robe + a raised cobra hood + a spiky
     *  serpent circlet layered OVER the golfer's own outfit, keeping their shirt colour/face/hair so they
     *  still read as themselves, switched sides. Suppresses the signature cap (the circlet is the hat). */
    coilGarb?: { robe: string; hood: string; accent: string };
  } = {},
): string {
  const { skin = '#f0c49a', shirtBase = '#3f7fd0', w = 110, h = 132, capColor } = opts;
  const uid =
    opts.uid ??
    `p${Math.abs(
      [hatId, shirtId, pantsId, opts.bagId, opts.driverId, skin, shirtBase, capColor, w, h]
        .join('|')
        .split('')
        .reduce((a, c) => (Math.imul(a, 33) + c.charCodeAt(0)) | 0, 5381),
    ).toString(36)}`;
  const hat = apparelById(hatId);
  const shirt = apparelById(shirtId);
  const pants = apparelById(pantsId);
  const bag = apparelById(opts.bagId);
  const driver = apparelById(opts.driverId);
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
    <linearGradient id="skg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${shade(skin, 0.16)}"/><stop offset="55%" stop-color="${skin}"/><stop offset="100%" stop-color="${shade(skin, -0.22)}"/>
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
      // A full starfield down BOTH legs (GS-worn-coverage) — the worn leggings are long, so the four
      // specks of the shop icon left them near-empty; now stars run hip-to-ankle like the nebula suit.
      const legStars = (hipC: number, ankC: number, o: number): string =>
        [0.1, 0.27, 0.44, 0.61, 0.78, 0.93]
          .map((fr, i) => {
            const x = hipC + (ankC - hipC) * fr + (i % 2 ? px(2.2) : -px(2.2));
            const y = hipY + (ankleY - hipY) * fr;
            return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(px(0.55 + ((i + o) % 3) * 0.22))}"/>`;
          })
          .join('');
      legDetail = `<g fill="#fff">${legStars(lHip, lAnk, 0)}${legStars(rHip, rAnk, 1)}</g>`;
    } else if (pantsShape === 'riftgreaves') {
      // Punched Galaxy greaves (GS-punched-galaxy): galaxy-crack energy forking down each thigh (accent
      // + a white core) over angular cosmic shin plates, with a scatter of starfield specks — the legs
      // that match the warplate.
      const plate = shade(pantsCol, -0.3);
      const crack = (hipC: number, ankC: number): string => {
        const d = `M${f(hipC)},${f(hipY + px(2))} L${f((hipC + ankC) / 2 - px(1))},${f((hipY + ankleY) / 2)} L${f(ankC)},${f(ankleY - px(4))}`;
        return (
          `<path d="${d}" fill="none" stroke="${pantsAcc}" stroke-width="${sw(1.3)}" stroke-linecap="round" stroke-linejoin="round"/>` +
          `<path d="${d}" fill="none" stroke="#fff" stroke-width="${sw(0.5)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`
        );
      };
      const greave = (x: number): string =>
        `<rect x="${f(x - px(4))}" y="${f(ankleY - px(14))}" width="${f(px(8))}" height="${f(px(12))}" rx="${f(px(1.6))}" fill="${plate}" ${ink}/>` +
        `<rect x="${f(x - px(4))}" y="${f(ankleY - px(14))}" width="${f(px(8))}" height="${f(px(2.4))}" rx="${f(px(1.2))}" fill="${pantsAcc}" stroke="none" opacity="0.85"/>`;
      // A starfield runs the full length of both thighs (GS-worn-coverage), matching the warplate.
      const legStars = (hipC: number, ankC: number, o: number): string =>
        [0.14, 0.32, 0.5, 0.66]
          .map((fr, i) => {
            const x = hipC + (ankC - hipC) * fr + (i % 2 ? px(2.4) : -px(2));
            const y = hipY + (ankleY - hipY) * fr;
            return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(px(0.55 + ((i + o) % 3) * 0.2))}"/>`;
          })
          .join('');
      legDetail =
        crack(lHip, lAnk) +
        crack(rHip, rAnk) +
        greave(lAnk) +
        greave(rAnk) +
        `<g fill="#fff" opacity="0.9">${legStars(lHip, lAnk, 0)}${legStars(rHip, rAnk, 1)}</g>`;
    } else if (pantsShape === 'emberlegs') {
      // The Solar Flames leggings (GS-solar-flames): purple-black solar flames licking up each shin
      // (dark→violet→magenta→red→hot, stacked solid fills — the shirt's idiom) with red embers rising.
      const cor = pantsAcc; // red coronal (accent)
      const corHi = '#ffb648';
      const flamePath = (bx: number, by: number, h: number, w: number, c: number): string =>
        `M${f(bx - w)},${f(by)} Q${f(bx - w * 0.78)},${f(by - h * 0.5)} ${f(bx - w * 0.12 + c * 0.4)},${f(by - h * 0.72)}` +
        ` Q${f(bx + c * 0.9)},${f(by - h * 0.92)} ${f(bx + c)},${f(by - h)}` +
        ` Q${f(bx + w * 0.55 + c * 0.4)},${f(by - h * 0.52)} ${f(bx + w * 0.82)},${f(by - h * 0.34)}` +
        ` Q${f(bx + w)},${f(by - h * 0.15)} ${f(bx + w)},${f(by)} Z`;
      // Fire climbs the WHOLE leg in two stacked clusters (shin + knee/thigh), not just the ankle
      // (GS-worn-coverage), with embers rising the length of each leg.
      const flameStack = (x: number, by: number, h: number, w: number, c: number): string => {
        const back = `<path d="${flamePath(x, by, h * 1.12, w * 1.16, c)}" fill="#160826"/>`;
        const bodyF = `<path d="${flamePath(x, by, h, w, c)}" fill="#6a24b8" stroke="#0c1116" stroke-width="${sw(0.5)}" stroke-linejoin="round"/>`;
        const mid = `<path d="${flamePath(x, by, h * 0.8, w * 0.72, c * 0.85)}" fill="#b8309a"/>`;
        const lick = `<path d="${flamePath(x, by, h * 0.56, w * 0.5, c * 0.7)}" fill="${cor}"/>`;
        const inner = `<path d="${flamePath(x, by, h * 0.32, w * 0.3, c * 0.5)}" fill="${corHi}"/>`;
        return back + bodyF + mid + lick + inner;
      };
      const legFire = (hipC: number, ankC: number): string => {
        const xAt = (y: number): number => hipC + (ankC - hipC) * ((y - hipY) / (ankleY - hipY));
        const clusters: [number, number][] = [
          [ankleY - px(1), 1], // shin
          [(hipY + ankleY) / 2 + px(3), 0.82], // knee/thigh
        ];
        return clusters
          .map(([by, sc]) => {
            const x0 = xAt(by);
            const specs: [number, number, number, number][] = [
              [x0, px(20 * sc), px(3.2 * sc), 0],
              [x0 + px(2.4 * sc), px(12 * sc), px(2.1 * sc), px(1)],
              [x0 - px(2.2 * sc), px(10 * sc), px(1.9 * sc), -px(0.9)],
            ];
            return specs.map(([x, h, w, c]) => flameStack(x, by, h, w, c)).join('');
          })
          .join('');
      };
      const legEmbers = (hipC: number, ankC: number, o: number): string =>
        [0.16, 0.36, 0.56, 0.72, 0.88]
          .map((fr, i) => {
            const x = hipC + (ankC - hipC) * fr + (i % 2 ? px(2.4) : -px(2.4));
            const y = hipY + (ankleY - hipY) * fr;
            return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(px(0.6 + ((i + o) % 2) * 0.25))}" fill="${(i + o) % 2 ? corHi : cor}"><animate attributeName="opacity" values="0;1;0" dur="${(1 + i * 0.2).toFixed(2)}s" repeatCount="indefinite"/></circle>`;
          })
          .join('');
      legDetail =
        legFire(lHip, lAnk) + legFire(rHip, rAnk) + `<g>${legEmbers(lHip, lAnk, 0)}${legEmbers(rHip, rAnk, 1)}</g>`;
    } else if (pantsShape === 'parrotpants') {
      // The Space Parrot tailfeathers (GS-space-pirate-parrot): long macaw tail-plumes sweeping the full
      // length of each leg (teal/gold/magenta) over the cosmic-navy legs, tipped with star specks.
      const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
      const feather = (x: number, yTop: number, len: number, w: number, col: string): string =>
        `<path d="M${f(x)},${f(yTop)} Q${f(x - w)},${f(yTop + len * 0.55)} ${f(x)},${f(yTop + len)} Q${f(x + w)},${f(yTop + len * 0.55)} ${f(x)},${f(yTop)} Z" fill="${col}" stroke="#0c1116" stroke-width="${sw(0.6)}" stroke-linejoin="round"/>` +
        `<line x1="${f(x)}" y1="${f(yTop + px(1.5))}" x2="${f(x)}" y2="${f(yTop + len - px(1.5))}" stroke="#0c1116" stroke-width="${sw(0.6)}" opacity="0.5"/>`;
      const legPlumes = (hipC: number, ankC: number, row0: number): string => {
        const mid = (hipC + ankC) / 2;
        const top = hipY + px(1);
        const len = ankleY - top;
        const specs: [number, number, number, number, string][] = [
          [mid, top, len, px(3.6), plume[row0 % 3]!],
          [mid - px(3.4), top + px(3), len * 0.76, px(2.4), plume[(row0 + 1) % 3]!],
          [mid + px(3.4), top + px(3), len * 0.76, px(2.4), plume[(row0 + 2) % 3]!],
        ];
        return specs.map(([x, yt, l, w, col]) => feather(x, yt, l, w, col)).join('');
      };
      const legStars = (hipC: number, ankC: number, o: number): string =>
        [0.22, 0.48, 0.72]
          .map((fr, i) => {
            const x = hipC + (ankC - hipC) * fr + (i % 2 ? px(2) : -px(2));
            const y = hipY + (ankleY - hipY) * fr;
            return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(px(0.6 + ((i + o) % 2) * 0.2))}"/>`;
          })
          .join('');
      legDetail =
        legPlumes(lHip, lAnk, 0) +
        legPlumes(rHip, rAnk, 1) +
        `<g fill="#fff">${legStars(lHip, lAnk, 0)}${legStars(rHip, rAnk, 1)}</g>`;
    } else if (pantsShape === 'greaves') {
      // Valkyrie greaves (GS-valkyrie): war-skirt tassets over the hips + gold shin greave plates.
      const plate = shade(pantsAcc, 0.14);
      const tas = (x0: number, x1: number): string =>
        `<path d="M${f(x0)},${f(hipY)} L${f(x1)},${f(hipY)} L${f((x0 + x1) / 2)},${f(hipY + px(12))} Z" fill="${pantsAcc}" ${ink}/>`;
      const greave = (x: number): string =>
        `<rect x="${f(x - px(4))}" y="${f(ankleY - px(15))}" width="${f(px(8))}" height="${f(px(13))}" rx="${f(px(1.6))}" fill="${plate}" ${ink}/>
         <rect x="${f(x - px(4))}" y="${f(ankleY - px(15))}" width="${f(px(8))}" height="${f(px(2.6))}" rx="${f(px(1.3))}" fill="${shade(pantsAcc, 0.34)}" stroke="none"/>`;
      legDetail =
        tas(cx - px(11), cx - px(3.6)) +
        tas(cx - px(3.6), cx + px(3.6)) +
        tas(cx + px(3.6), cx + px(11)) +
        greave(lAnk) +
        greave(rAnk);
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

  // ── Arms: proper SHAPED limbs (not sticks). The old arms were thin <line> strokes floating beside
  //    the torso with a visible gap at the shoulder — they read as bolted-on pegs. Now each arm is a
  //    tapered filled limb whose deltoid root is drawn BEHIND the torso, so the shoulder swallows the
  //    join and the arm grows out of the body. The sleeve shares the torso's own gradient (`shg`) so
  //    the lighting runs continuous shoulder-to-cuff; a rim highlight down the outer edge gives it
  //    roundness. Short-sleeve golf shirts (polo/tee/jersey) cap the sleeve at the upper arm and bare
  //    a gradient-shaded forearm; full-cover suits/jacket (spacesuit/nebula/green jacket) sleeve to the
  //    wrist — a pressure cuff + glove on the suits, a jacket cuff + bare hand on the blazer.
  const shirtShape = shirt?.look.shape;
  const fullSleeve =
    shirtShape === 'spacesuit' ||
    shirtShape === 'cosmic' ||
    shirtShape === 'blazer' ||
    shirtShape === 'riftplate' ||
    shirtShape === 'solarflare';
  const gloved = shirtShape === 'spacesuit' || shirtShape === 'cosmic' || shirtShape === 'riftplate';
  const sleeveFill = `url(#shg${uid})`;
  const skinFill = `url(#skg${uid})`;
  const handCol = gloved ? shade(shirtCol, 0.08) : skin;
  const elbowY = shoY + px(27);
  const handY = hipY + px(4);
  const armInk = `stroke="#0c1116" stroke-width="${sw(1.4)}" stroke-linejoin="round"`;
  // A smooth tapered outline through a chain of {x,y,w=half-width} joints, rounding the final (wrist) end.
  const limb = (joints: { x: number; y: number; w: number }[]): string => {
    const n = joints.length;
    const L: [number, number][] = [];
    const R: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p = joints[i]!;
      let dx = 0;
      let dy = 0;
      if (i > 0) {
        dx += p.x - joints[i - 1]!.x;
        dy += p.y - joints[i - 1]!.y;
      }
      if (i < n - 1) {
        dx += joints[i + 1]!.x - p.x;
        dy += joints[i + 1]!.y - p.y;
      }
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      L.push([p.x + nx * p.w, p.y + ny * p.w]);
      R.push([p.x - nx * p.w, p.y - ny * p.w]);
    }
    const last = joints[n - 1]!;
    const prev = joints[n - 2] ?? last;
    const ddx = last.x - prev.x;
    const ddy = last.y - prev.y;
    const dl = Math.hypot(ddx, ddy) || 1;
    const tipx = last.x + (ddx / dl) * last.w;
    const tipy = last.y + (ddy / dl) * last.w;
    let d = `M${f(L[0]![0])},${f(L[0]![1])} `;
    for (let i = 1; i < n; i++) d += `L${f(L[i]![0])},${f(L[i]![1])} `;
    d += `Q${f(tipx)},${f(tipy)} ${f(R[n - 1]![0])},${f(R[n - 1]![1])} `;
    for (let i = n - 2; i >= 0; i--) d += `L${f(R[i]![0])},${f(R[i]![1])} `;
    return `${d}Z`;
  };
  const armUnit = (side: 1 | -1): string => {
    const sx = (n: number): number => cx + side * px(n);
    const shoulder = { x: sx(15.5), y: shoY + px(2), w: px(7) };
    const upper = { x: sx(19), y: shoY + px(14), w: px(6.1) };
    const elbow = { x: sx(18.5), y: elbowY, w: px(5.2) };
    const wrist = { x: sx(16), y: handY, w: px(4.3) };
    const rim = `<path d="M${f(sx(21.5))},${f(shoY + px(10))} Q${f(sx(23.6))},${f(elbowY - px(2))} ${f(sx(20.4))},${f(handY - px(4))}" fill="none" stroke="#ffffff" stroke-width="${sw(1.3)}" stroke-linecap="round" opacity="0.16"/>`;
    const hand = `<ellipse cx="${f(wrist.x)}" cy="${f(handY + px(1))}" rx="${f(px(3.9))}" ry="${f(px(4.7))}" fill="${handCol}" stroke="#0c1116" stroke-width="${sw(1.2)}"/>`;
    if (fullSleeve) {
      const sleeve = `<path d="${limb([shoulder, upper, elbow, wrist])}" fill="${sleeveFill}" ${armInk}/>`;
      const cuff = gloved
        ? `<circle cx="${f(wrist.x)}" cy="${f(wrist.y - px(1.5))}" r="${f(px(4.2))}" fill="${shade(shirtCol, -0.2)}" ${armInk}/>`
        : `<path d="M${f(wrist.x - px(4.6))},${f(wrist.y - px(3))} L${f(wrist.x + px(4.6))},${f(wrist.y - px(3))}" stroke="${shade(shirtCol, -0.3)}" stroke-width="${sw(2.2)}" stroke-linecap="round"/>`;
      return sleeve + cuff + rim + hand;
    }
    // Short cap sleeve over the upper arm; gradient-shaded skin forearm below.
    const skinArm = `<path d="${limb([shoulder, upper, elbow, wrist])}" fill="${skinFill}" ${armInk}/>`;
    const hem = { x: sx(19.4), y: shoY + px(15.5), w: px(6.4) };
    const sleeve = `<path d="${limb([shoulder, hem])}" fill="${sleeveFill}" ${armInk}/>`;
    return skinArm + sleeve + rim + hand;
  };

  // ── Torso + cel shading + garment detail ─────────────────────────────────────────────────
  const neck = `<rect x="${f(cx - px(3.6))}" y="${f(headY + headR - px(4))}" width="${f(px(7.2))}" height="${f(shoY - headY - headR + px(6))}" fill="${shade(skin, -0.12)}"/>`;
  const torso = `<path d="${torsoPath}" fill="url(#shg${uid})" stroke="#0c1116" stroke-width="${sw(1.5)}" stroke-linejoin="round"/>`;
  const torsoShade = `<g clip-path="url(#tor${uid})">
    <ellipse cx="${f(cx - px(9))}" cy="${f(shoY + px(5))}" rx="${f(px(15))}" ry="${f(px(11))}" fill="#ffffff" opacity="0.2"/>
    <rect x="${f(cx + px(7))}" y="${f(shoY - px(6))}" width="${f(px(14))}" height="${f(hipY - shoY + px(12))}" fill="#000000" opacity="0.14"/>
    <rect x="${f(cx - px(20))}" y="${f(hipY - px(4))}" width="${f(px(40))}" height="${f(px(5))}" fill="#000000" opacity="0.12"/>
  </g>`;
  // The worn torso is far taller than the shop card's little silhouette, so pass its reach (in authored
  // units, relative to the detail centre) — the detailed mythic shirts expand to fill it (GS-worn-coverage).
  const dCy = shoY + px(12);
  const dS = S * 1.75;
  const detail = shirt
    ? `<g clip-path="url(#tor${uid})">${shirtDetail(shirt.look, cx, dCy, dS, {
        top: (shoY - px(3) - dCy) / dS,
        bottom: (hipY - px(1) - dCy) / dS,
        halfW: px(13) / dS,
      })}</g>`
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
  // ── GS-story-coil-garb: the Coil DEFECTOR overlay (an open serpent robe + a raised cobra hood + a
  //    serpent circlet) drawn OVER the golfer's own outfit, so their shirt colour, face and hair still
  //    read — the same person, switched to the Coil. All in the passed Coil palette; zero rng, pure. ──
  const coil = opts.coilGarb;
  let coilRobePanels = '';
  let coilCollar = '';
  let coilHoodBack = '';
  let coilCirclet = '';
  if (coil) {
    const { robe, hood, accent } = coil;
    const robeDark = shade(robe, -0.3);
    const cInk = `stroke="#0c1116" stroke-width="${sw(1.2)}" stroke-linejoin="round"`;
    // Open robe: two panels hanging from the shoulders down the OUTER sides to mid-shin, leaving the shirt
    // (the identity colour) visible down the centre. Drawn BEFORE the arms, so the golfer's arms and hands
    // hang naturally in front of the open robe.
    const hemY = hipY + (footY - hipY) * 0.52;
    const panel = (o: 1 | -1): string =>
      `<path d="M${f(cx + o * px(20))},${f(shoY - px(1))} ` +
      `Q${f(cx + o * px(24))},${f(waistY)} ${f(cx + o * px(16.5))},${f(hemY)} ` +
      `L${f(cx + o * px(6.5))},${f(hemY)} L${f(cx + o * px(8.5))},${f(shoY + px(3))} Z" fill="${robe}" ${cInk}/>` +
      // accent trim + a fold shade down the open inner edge
      `<path d="M${f(cx + o * px(8.5))},${f(shoY + px(4))} L${f(cx + o * px(6.7))},${f(hemY - px(1))}" fill="none" stroke="${accent}" stroke-width="${sw(1.3)}" stroke-linecap="round" opacity="0.85"/>`;
    coilRobePanels = panel(-1) + panel(1);
    // Shawl collar — a raised Coil mantle across the shoulders, drawn OVER the torso at the neckline, with a
    // coil-sigil clasp at the throat.
    coilCollar =
      `<path d="M${f(cx - px(11))},${f(shoY - px(2))} Q${f(cx)},${f(shoY + px(4))} ${f(cx + px(11))},${f(shoY - px(2))} ` +
      `L${f(cx + px(20))},${f(shoY)} Q${f(cx + px(13))},${f(shoY - px(9))} ${f(cx)},${f(shoY - px(8))} ` +
      `Q${f(cx - px(13))},${f(shoY - px(9))} ${f(cx - px(20))},${f(shoY)} Z" fill="${robeDark}" ${cInk}/>` +
      `<g transform="translate(${f(cx)} ${f(shoY - px(1.5))})">` +
      `<circle r="${f(px(2.4))}" fill="${robe}" stroke="${accent}" stroke-width="${sw(1)}"/>` +
      `<path d="M0,${f(-px(1.5))} A ${f(px(1.5))} ${f(px(1.5))} 0 1 1 ${f(-px(1))},${f(px(1.05))}" fill="none" stroke="${accent}" stroke-width="${sw(0.9)}" stroke-linecap="round"/>` +
      `</g>`;
    // Cobra hood flaring behind the head (drawn behind the head so the face + hair still read).
    coilHoodBack =
      `<path d="M${f(cx)},${f(headY - px(17))} ` +
      `Q${f(cx - px(27))},${f(headY - px(9))} ${f(cx - px(21))},${f(headY + px(11))} ` +
      `Q${f(cx - px(11))},${f(headY + px(6))} ${f(cx)},${f(headY + px(4))} ` +
      `Q${f(cx + px(11))},${f(headY + px(6))} ${f(cx + px(21))},${f(headY + px(11))} ` +
      `Q${f(cx + px(27))},${f(headY - px(9))} ${f(cx)},${f(headY - px(17))} Z" fill="${hood}" ${cInk}/>` +
      `<path d="M${f(cx - px(20))},${f(headY + px(8))} Q${f(cx - px(24))},${f(headY - px(8))} ${f(cx)},${f(headY - px(15))} Q${f(cx + px(24))},${f(headY - px(8))} ${f(cx + px(20))},${f(headY + px(8))}" fill="none" stroke="${accent}" stroke-width="${sw(1.2)}" opacity="0.7"/>` +
      `<circle cx="${f(cx - px(11))}" cy="${f(headY - px(4))}" r="${f(px(1.9))}" fill="${accent}" opacity="0.45"/>` +
      `<circle cx="${f(cx + px(11))}" cy="${f(headY - px(4))}" r="${f(px(1.9))}" fill="${accent}" opacity="0.45"/>`;
    // The serpent CIRCLET (the "spiffy Coil hat") — a dark brow band with an accent highlight and a small
    // rising cobra crest at centre-front. Drawn last on the head (in place of the signature cap).
    const crest =
      `<g transform="translate(${f(cx)} ${f(headY - px(9))})">` +
      `<path d="M0,${f(px(2))} Q${f(-px(2))},${f(-px(2))} 0,${f(-px(4))} Q${f(px(2.4))},${f(-px(6))} ${f(px(1))},${f(-px(8.4))}" fill="none" stroke="${accent}" stroke-width="${sw(2)}" stroke-linecap="round"/>` +
      `<path d="M${f(px(1))},${f(-px(8.4))} q${f(px(2.4))},${f(-px(0.6))} ${f(px(2.9))},${f(px(1.5))} q${f(-px(1.3))},${f(px(1.3))} ${f(-px(2.9))},${f(px(0.6))} z" fill="${accent}" ${cInk}/>` +
      `<circle cx="${f(px(2.5))}" cy="${f(-px(7.7))}" r="${f(px(0.5))}" fill="#0a0410"/>` +
      `</g>`;
    coilCirclet =
      `<path d="M${f(cx - px(13))},${f(headY - px(4.5))} Q${f(cx)},${f(headY - px(11.5))} ${f(cx + px(13))},${f(headY - px(4.5))}" fill="none" stroke="${robeDark}" stroke-width="${sw(4)}" stroke-linecap="round"/>` +
      `<path d="M${f(cx - px(13))},${f(headY - px(4.5))} Q${f(cx)},${f(headY - px(11.5))} ${f(cx + px(13))},${f(headY - px(4.5))}" fill="none" stroke="${accent}" stroke-width="${sw(1.2)}" stroke-linecap="round" opacity="0.9"/>` +
      crest;
  }

  // A cosmetic hat, or the golfer's signature cap (same default as on-course) when none is worn. A Coil
  // defector wears the serpent circlet instead, so the signature cap is suppressed.
  const hatG = coil
    ? ''
    : hat
      ? hatGlyph(hat.look, cx, headY, headR, uid)
      : capColor
        ? hatGlyph({ shape: 'cap', color: capColor, accent: shade(capColor, -0.3) }, cx, headY, headR, `dc${uid}`)
        : '';

  // The golfer's chosen hairstyle (GS-avatar-gender) — the only per-character gender-presentation cue,
  // drawn strictly above the neck. A SEALED helmet encloses the head, so it hides hair entirely: every
  // golfer reads identical in a spacesuit, exactly as an unstyled space garment should.
  const sealed = hat?.look.shape === 'helmet';
  const hairL =
    opts.hair && !sealed ? hairLayers(opts.hair, cx, headY, headR, S) : { back: '', top: '', face: '' };

  // The equipped golf bag (GS-unending) stands propped at the golfer's side, feet on the same floor
  // line, scaled with the figure — the caddy-bag flex without cluttering the pose.
  const bagG = bag ? bagGlyph(bag.look, cx - px(37), footY - px(16), `pb${uid}`, S * 1.2) : '';
  // The equipped cosmetic driver (GS-thor) stands propped at the golfer's OTHER side (opposite the bag),
  // scaled with the figure — the warhammer flex, its lightning crackling beside the pose.
  const driverG = driver ? driverGlyph(driver.look, cx + px(37), footY - px(18), `pd${uid}`, S * 1.15) : '';

  // Mythic/legendary outfits shed a few sparkles around the whole figure.
  const flair =
    shirt?.look.glow || pantsLook?.glow
      ? `<g transform="translate(${f(cx)} ${f(shoY + px(18))}) scale(${(S * 1.4).toFixed(2)})">${sparkles([[-17, -12], [16, -3], [-13, 16], [14, 20]])}</g>`
      : '';

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="your golfer" style="display:block;">
    ${defs}${glowAura}${pantsGlow}${bagG}${legs}${legDetail}${shoes}${coilRobePanels}${armUnit(-1)}${armUnit(1)}${neck}${torso}${torsoShade}${detail}${belt}${coilCollar}${coilHoodBack}${hairL.back}${ears}${head}${headShade}${hairL.top}${face}${hairL.face}${hatG}${coilCirclet}${driverG}${flair}
  </svg>`;
}
