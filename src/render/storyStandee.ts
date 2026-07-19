/**
 * FULL-BODY clubhouse standees (GS-story-fullbody). The Story-Tour clubhouse crew used to stand as their
 * head+chest PORTRAIT bust (320×340), feet-anchored — so the chest bottom sat on the floor and they read
 * as "heads/chests on the ground". This wraps each character's existing bust (its identity art) as the
 * HEAD+TORSO of a proper standing figure by drawing a per-character LOWER BODY beneath it (legs+shoes /
 * a cult robe / bird legs / a mole's mound), so the FEET meet the floor. Pure SVG string — no new art per
 * character, works for the Warden caddies AND the Herald cult agents AND the non-humanoid allies, and stays
 * in the clubhouse's string-builder (testable, deep-linkable). Tint filters applied on the wrapper carry
 * through to the whole figure.
 */

/** How a character's lower body is drawn under their bust. */
export type StandeeLegs = 'human' | 'robe' | 'bird' | 'creature';

export interface StandeeLook {
  legs: StandeeLegs;
  /** Trouser / robe colour. */
  cloth?: string;
  /** Shoe colour (human). */
  shoe?: string;
}

/** Per-caddy lower body (colours mirror the on-course `drawCaddy` figures so identity stays consistent). */
export const CADDY_STANDEE: Record<string, StandeeLook> = {
  'driver-dan': { legs: 'human', cloth: '#3a3f4c', shoe: '#22242c' },
  'auto-caddie': { legs: 'human', cloth: '#2c3142', shoe: '#1b1e26' }, // Penelope
  'sandy-sandsaver': { legs: 'human', cloth: '#6b5a3a', shoe: '#4a3d26' },
  'dr-chipinski': { legs: 'human', cloth: '#39405a', shoe: '#20232e' },
  'suggestible-sam': { legs: 'human', cloth: '#2f3a33', shoe: '#1c221d' },
  'prognostic-parrot': { legs: 'bird', cloth: '#e8902a' },
  'mystic-mole': { legs: 'creature' },
};

/** The Coil agents (Voss / Venoma / the Coilkeeper) stand as robed cultists; their per-agent tint recolours
 *  the whole figure (robe included) via the wrapper filter. */
export const HERALD_STANDEE: StandeeLook = { legs: 'robe', cloth: '#2a1836' };

/** The lower-body height (design units) under the 340-tall bust, per kind — a mole is short, a person tall. */
function bodyHeight(legs: StandeeLegs): number {
  return legs === 'creature' ? 70 : legs === 'bird' ? 210 : 260;
}

function humanBody(cloth: string, shoe: string): string {
  return `
    <path d="M116 300 L204 300 L208 352 L112 352 Z" fill="${cloth}"/>
    <path d="M118 342 L152 342 L148 556 L126 556 Z" fill="${cloth}"/>
    <path d="M168 342 L202 342 L194 556 L172 556 Z" fill="${cloth}"/>
    <path d="M160 344 L160 540" stroke="rgba(0,0,0,0.22)" stroke-width="3"/>
    <ellipse cx="133" cy="566" rx="28" ry="13" fill="${shoe}"/>
    <ellipse cx="187" cy="566" rx="28" ry="13" fill="${shoe}"/>
    <ellipse cx="126" cy="561" rx="14" ry="5" fill="rgba(255,255,255,0.14)"/>
    <ellipse cx="180" cy="561" rx="14" ry="5" fill="rgba(255,255,255,0.14)"/>`;
}

function robeBody(cloth: string): string {
  const darker = 'rgba(0,0,0,0.28)';
  return `
    <path d="M120 300 Q94 432 74 566 L246 566 Q226 432 200 300 Z" fill="${cloth}"/>
    <path d="M160 306 L160 560" stroke="${darker}" stroke-width="3"/>
    <path d="M128 320 Q116 440 100 556" fill="none" stroke="${darker}" stroke-width="2"/>
    <path d="M192 320 Q204 440 220 556" fill="none" stroke="${darker}" stroke-width="2"/>
    <path d="M74 560 Q160 586 246 560" fill="none" stroke="${darker}" stroke-width="4"/>
    <path d="M120 300 Q140 316 160 316 Q180 316 200 300 L196 330 Q160 344 124 330 Z" fill="rgba(255,255,255,0.06)"/>`;
}

function birdBody(cloth: string): string {
  const foot = (x: number, dir: number): string =>
    `<path d="M${x} 540 l${-8 * dir} 10 M${x} 540 l0 12 M${x} 540 l${8 * dir} 10" stroke="${cloth}" stroke-width="4" stroke-linecap="round" fill="none"/>`;
  return `
    <path d="M150 326 Q146 440 143 540" stroke="${cloth}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M172 326 Q176 440 179 540" stroke="${cloth}" stroke-width="11" stroke-linecap="round" fill="none"/>
    ${foot(143, 1)}${foot(179, 1)}`;
}

function creatureBody(): string {
  // A small dirt mound the mole rises from (mirrors the on-course drawMole), tucked under the bust bottom.
  return `
    <ellipse cx="160" cy="372" rx="128" ry="34" fill="#3f3122"/>
    <ellipse cx="160" cy="360" rx="104" ry="24" fill="#4f3d29"/>
    <ellipse cx="160" cy="352" rx="76" ry="15" fill="#5c472f"/>`;
}

/** Wrap a 320×340 bust SVG as the head+torso of a full standing figure. */
export function fullBodyStandeeSVG(bust: string, look: StandeeLook): string {
  const H = 340 + bodyHeight(look.legs);
  let body: string;
  switch (look.legs) {
    case 'robe':
      body = robeBody(look.cloth ?? '#2a1836');
      break;
    case 'bird':
      body = birdBody(look.cloth ?? '#e8902a');
      break;
    case 'creature':
      body = creatureBody();
      break;
    case 'human':
    default:
      body = humanBody(look.cloth ?? '#33384a', look.shoe ?? '#1b1e26');
      break;
  }
  return `<svg viewBox="0 0 320 ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
    <g>${body}</g>
    <svg x="0" y="0" width="320" height="340" style="overflow:visible;">${bust}</svg>
  </svg>`;
}
