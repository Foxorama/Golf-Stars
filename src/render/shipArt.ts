/**
 * Ship vector art (GS-garage) — draws the cosmetic fleet as self-contained SVG glyphs (no asset, the
 * house no-404 rule). The journey-map "YOU" craft and the Trade-Market / Garage cards all render
 * through `shipSVG`, keyed off the ship's `look` (a base silhouette + palette + bling level). The
 * classic Woody Wagon reproduces the original starmap wagon byte-for-byte, so the default look is
 * unchanged. Pure string builders — deterministic, embeddable via innerHTML.
 */

import { shipById, DEFAULT_SHIP_ID, type ShipLook } from '../sim/rpg/ships';

/** A few sparkle glints for the blinged-out tiers (deterministic positions, gentle twinkle). */
function bling(level: number): string {
  if (!level) return '';
  const spots = [
    [-12, -6], [6, -7], [14, 2], [-16, 3], [0, -9], [10, 5],
  ].slice(0, level * 2);
  return spots
    .map(
      ([x, y], i) =>
        `<g transform="translate(${x} ${y})" fill="#fff"><path d="M0,-2.4 L0.7,-0.7 L2.4,0 L0.7,0.7 L0,2.4 L-0.7,0.7 L-2.4,0 L-0.7,-0.7 Z"><animate attributeName="opacity" values="0.3;1;0.3" dur="${(1.4 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></path></g>`,
    )
    .join('');
}

/** The inner figure for a ship look, authored in a ~±20u frame, facing right. */
function shipBody(look: ShipLook): string {
  const { body, glass, flame, accent } = look;
  const exhaust = `
    <g stroke="none">
      <path d="M-18,1 L-26,-1 L-26,4 L-18,5 Z" fill="${flame}" opacity="0.95"/>
      <path d="M-22,1.6 L-30,0.4 L-30,3 L-22,3.4 Z" fill="#ffd36b" opacity="0.9"/>
    </g>`;
  switch (look.kind) {
    case 'wagon':
      // The heritage station wagon (the original starmap glyph, parametrised by palette).
      return `
        <g stroke="#1c130b" stroke-width="1" stroke-linejoin="round">
          <path d="M-18,3 L-14,-4 L4,-5 L11,1 L18,2 L18,6 L-18,6 Z" fill="${body}"/>
          <path d="M-12,-3 L-1,-3 L-1,0 L-13,0 Z" fill="${glass}"/>
          <path d="M1,-3 L8,0.4 L1,0.4 Z" fill="${glass}"/>
          <rect x="-3.4" y="-3.2" width="1.5" height="3.6" fill="#1c130b" stroke="none"/>
          <rect x="-14" y="-5.6" width="14" height="1.4" rx="0.6" fill="${accent}" stroke="none"/>
          <circle cx="-9" cy="6.4" r="2.4" fill="#2a1c10"/>
          <circle cx="9" cy="6.4" r="2.4" fill="#2a1c10"/>
        </g>
        ${exhaust}
        <g stroke="none"><rect x="13" y="-7" width="1.1" height="5" fill="${accent}"/><path d="M14,-7 l6,1.6 l-6,1.8 Z" fill="#ff5a4d"/></g>`;
    case 'racer':
      // A low, pointed speedster.
      return `
        <g stroke="#10131a" stroke-width="1" stroke-linejoin="round">
          <path d="M-16,2 L-6,-2 L14,-1 L20,2 L14,5 L-16,5 Z" fill="${body}"/>
          <path d="M-2,-1.6 L8,-0.8 L8,1.4 L-2,1.4 Z" fill="${glass}"/>
          <path d="M-10,2 L-13,-4 L-7,-1 Z" fill="${accent}"/>
          <path d="M-10,5 L-13,9 L-6,6 Z" fill="${accent}"/>
        </g>
        ${exhaust}`;
    case 'saucer':
      // A flying-saucer caddie.
      return `
        <g stroke="#0d1a14" stroke-width="1" stroke-linejoin="round">
          <ellipse cx="0" cy="2" rx="19" ry="5.5" fill="${body}"/>
          <ellipse cx="0" cy="0" rx="9" ry="6" fill="${glass}" opacity="0.9"/>
          <ellipse cx="0" cy="2" rx="19" ry="5.5" fill="none" stroke="${accent}" stroke-width="1.2"/>
          <circle cx="-11" cy="2.5" r="1.2" fill="${flame}"/><circle cx="0" cy="3.4" r="1.2" fill="${flame}"/><circle cx="11" cy="2.5" r="1.2" fill="${flame}"/>
        </g>
        <path d="M-6,6 L0,16 L6,6 Z" fill="${flame}" opacity="0.55"/>`;
    case 'comet':
      // A dimpled golf-ball comet with a streaming tail.
      return `
        <g stroke="none">
          <path d="M-8,0 L-30,-3 L-30,3 Z" fill="${flame}" opacity="0.85"/>
          <path d="M-8,0 L-26,-1.4 L-26,1.4 Z" fill="#fff" opacity="0.8"/>
        </g>
        <circle cx="0" cy="0" r="9" fill="${body}" stroke="${accent}" stroke-width="1"/>
        <g fill="#c9ccd6"><circle cx="-2.5" cy="-2.5" r="1"/><circle cx="2" cy="-1.5" r="1"/><circle cx="-1" cy="2" r="1"/><circle cx="3" cy="2.5" r="1"/><circle cx="-4" cy="1" r="1"/></g>`;
    case 'ufo': {
      // The mythic Mothership — a classic flying saucer with SPINNING landing-gear wheels, a ring of
      // FLASHING lights, a glass dome, and a "Hole 19" pennant flying off the top. Authored upright
      // (it hovers, it doesn't drive), bigger than the other craft to read as the grail.
      const lightCols = ['#ff5a4d', '#ffd36b', '#7fffd0', '#7fd6ff', '#ff8bf0'];
      const lights = [-16, -8, 0, 8, 16]
        .map((x, i) => {
          const c = lightCols[i % lightCols.length];
          return `<circle cx="${x}" cy="6" r="1.7" fill="${c}"><animate attributeName="opacity" values="0.25;1;0.25" dur="0.9s" begin="${(i * 0.18).toFixed(2)}s" repeatCount="indefinite"/></circle>`;
        })
        .join('');
      // A landing-gear wheel: a small rim with two cross-spokes, spun by an animateTransform rotate.
      const wheel = (x: number, dir: number, dur: string) => `
        <g stroke="#0c1116" stroke-width="0.9"><line x1="${x}" y1="6.5" x2="${x + dir * 3}" y2="12" /></g>
        <g transform="translate(${x + dir * 3} 12.6)">
          <g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${dur}" repeatCount="indefinite"/>
            <circle cx="0" cy="0" r="2.6" fill="#2a2f3a" stroke="#c9ccd6" stroke-width="0.8"/>
            <line x1="-2.6" y1="0" x2="2.6" y2="0" stroke="#c9ccd6" stroke-width="0.7"/>
            <line x1="0" y1="-2.6" x2="0" y2="2.6" stroke="#c9ccd6" stroke-width="0.7"/>
          </g>
        </g>`;
      return `
        <g stroke="#0d1a14" stroke-width="1" stroke-linejoin="round">
          ${wheel(-12, -1, '0.7s')}${wheel(12, 1, '0.8s')}
          <ellipse cx="0" cy="4" rx="22" ry="6.5" fill="${body}"/>
          <ellipse cx="0" cy="4" rx="22" ry="6.5" fill="none" stroke="${accent}" stroke-width="1.4"/>
          <path d="M-12,0.5 A12,11 0 0 1 12,0.5 Z" fill="${glass}" opacity="0.92"/>
          <path d="M-12,0.5 A12,11 0 0 1 12,0.5" fill="none" stroke="${accent}" stroke-width="1"/>
          <ellipse cx="-4" cy="-4" rx="3.5" ry="2" fill="#ffffff" opacity="0.5"/>
        </g>
        ${lights}
        <path d="M-7,9 L0,20 L7,9 Z" fill="${flame}" opacity="0.4"/>
        <g stroke="#0c1116" stroke-width="0.9"><line x1="0" y1="-12" x2="0" y2="-24"/></g>
        <circle cx="0" cy="-24" r="1.1" fill="${accent}"/>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-2.5 0 -20;2.5 0 -20;-2.5 0 -20" dur="2.4s" repeatCount="indefinite"/>
          <path d="M0,-24 L19,-22 L16,-19 L19,-16 L0,-17 Z" fill="#ff4fd8" stroke="#0c1116" stroke-width="0.6"/>
          <text x="2" y="-19" font-size="3" font-weight="700" fill="#ffffff" font-family="system-ui,sans-serif">Hole 19</text>
        </g>`;
    }
    case 'moto': {
      // A motorcycle golf buggy — a single-rider space-bike: a low swooping frame slung between two
      // glowing hover-wheels, handlebars + windscreen up front, and a golf bag standing on the tail
      // with club heads poking out. Neon speeder attitude; jet trail out the back.
      const glow = `<animate attributeName="opacity" values="0.55;1;0.55" dur="1.3s" repeatCount="indefinite"/>`;
      const wheel = (x: number) => `
        <circle cx="${x}" cy="6.5" r="4.6" fill="#12161e" stroke="${accent}" stroke-width="1.5"/>
        <circle cx="${x}" cy="6.5" r="4.6" fill="none" stroke="${flame}" stroke-width="1">${glow}</circle>
        <g transform="translate(${x} 6.5)"><g stroke="${accent}" stroke-width="0.8">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.5s" repeatCount="indefinite"/>
          <line x1="-3.4" y1="0" x2="3.4" y2="0"/><line x1="0" y1="-3.4" x2="0" y2="3.4"/>
          <line x1="-2.4" y1="-2.4" x2="2.4" y2="2.4"/><line x1="-2.4" y1="2.4" x2="2.4" y2="-2.4"/>
        </g></g>
        <circle cx="${x}" cy="6.5" r="1.5" fill="${accent}"/>`;
      return `
        ${exhaust}
        <path d="M-16,3 L-30,1.4 L-30,4.8 Z" fill="${flame}" opacity="0.4"/>
        <g stroke="#0c1016" stroke-width="1" stroke-linejoin="round">
          <!-- golf bag standing on the tail, club heads poking out -->
          <g>
            <line x1="-13.4" y1="-6" x2="-14.8" y2="-14" stroke="#c9ccd6" stroke-width="1"/>
            <circle cx="-14.9" cy="-14.4" r="1.5" fill="#e6ebf2"/>
            <line x1="-11.6" y1="-6" x2="-10.6" y2="-13.4" stroke="#c9ccd6" stroke-width="1"/>
            <circle cx="-10.5" cy="-13.8" r="1.3" fill="#b7c0cc"/>
            <line x1="-12.5" y1="-6" x2="-12.8" y2="-15" stroke="#c9ccd6" stroke-width="0.9"/>
            <circle cx="-12.9" cy="-15.3" r="1.2" fill="#d7dee6"/>
            <path d="M-15.2,-6.5 L-9.8,-6.5 L-10.6,2 L-14.4,2 Z" fill="${accent}"/>
            <rect x="-14.4" y="-5.4" width="4" height="3.4" rx="0.8" fill="${glass}" opacity="0.6"/>
          </g>
          <!-- swooping bike frame from tail to nose -->
          <path d="M-14,3.6 L-9,-3.4 L2,-4.6 L12,-3.2 L18,1 L17,4 L11,4 L-8,4.2 Z" fill="${body}"/>
          <!-- seat + rider fairing hump -->
          <path d="M-11,-3.2 L-2,-4.2 L-1,-1 L-11,0 Z" fill="#151a22"/>
          <!-- fairing accent stripe along the frame -->
          <path d="M-8,-2.4 L2,-3.4 L11,-2.2 L16,0.6" fill="none" stroke="${accent}" stroke-width="1"/>
          <!-- windscreen up front -->
          <path d="M9,-3.4 L15,-1 L14,2.4 L8,0.4 Z" fill="${glass}" opacity="0.9"/>
          <!-- headlamp -->
          <circle cx="17" cy="1.4" r="1.3" fill="#fff6c0"/>
          <!-- handlebar + mirror -->
          <line x1="11" y1="-3.4" x2="14" y2="-7.6"/>
          <circle cx="14.2" cy="-8" r="1.1" fill="${accent}"/>
          <!-- neon underglow strip -->
          <rect x="-9" y="2.2" width="24" height="1.3" rx="0.6" fill="${flame}" stroke="none">${glow}</rect>
        </g>
        ${wheel(-9)}${wheel(11)}`;
    }
    case 'chopper': {
      // The mythic Thunderbolt — a hot-rod SPACE CHOPPER modelled on the Sun Mountain FinnCycle
      // silhouette: fat knobby tyres on bright rims, a long flat seat, a low slung frame, and the
      // golf bag stood UPRIGHT dead-centre between seat and handlebars (its signature). Wreathed in
      // licking flame and forked lightning that crackles around it. Authored bigger to read as a grail.
      const flick = (dur: string, begin: string) =>
        `<animate attributeName="opacity" values="0;1;0;0.7;0;0.9;0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`;
      // A jagged lightning bolt: a wide electric-blue glow under a white core, flickering on its own phase.
      const bolt = (d: string, dur: string, begin: string) => `
        <path d="${d}" fill="none" stroke="#59b6ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0">${flick(dur, begin)}</path>
        <path d="${d}" fill="none" stroke="#eaf6ff" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0">${flick(dur, begin)}</path>`;
      // A fat tyre on a bright rim with spinning spokes and a hub.
      const tyre = (x: number, r: number, dur: string) => `
        <circle cx="${x}" cy="7" r="${r}" fill="#0c0e13" stroke="#0a0c10" stroke-width="1"/>
        <circle cx="${x}" cy="7" r="${(r - 1.3).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="1.6"/>
        <g transform="translate(${x} 7)"><g stroke="${accent}" stroke-width="0.8">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${dur}" repeatCount="indefinite"/>
          <line x1="${-(r - 1.6)}" y1="0" x2="${r - 1.6}" y2="0"/><line x1="0" y1="${-(r - 1.6)}" x2="0" y2="${r - 1.6}"/>
          <line x1="${-(r - 2.4)}" y1="${-(r - 2.4)}" x2="${r - 2.4}" y2="${r - 2.4}"/><line x1="${-(r - 2.4)}" y1="${r - 2.4}" x2="${r - 2.4}" y2="${-(r - 2.4)}"/>
        </g></g>
        <circle cx="${x}" cy="7" r="1.7" fill="${accent}"/><circle cx="${x}" cy="7" r="0.8" fill="#0c0e13"/>`;
      return `
        <!-- forked lightning crackling around the whole rig (behind) -->
        <g>
          ${bolt('M-11,-15 L-6,-19 L-2,-13 L3,-20 L8,-13 L12,-17', '0.7s', '0s')}
          ${bolt('M15,3 L21,4 L18,8 L24,10', '0.5s', '0.15s')}
          ${bolt('M-19,-1 L-25,1 L-21,5 L-27,7', '0.6s', '0.32s')}
        </g>
        <!-- roaring exhaust flame plume trailing off the rear -->
        <g>
          <path d="M-19,4 L-34,-1 L-30,4 L-37,4 L-30,5 L-33,9 Z" fill="${flame}" opacity="0.9"><animate attributeName="opacity" values="0.55;1;0.7;1;0.6" dur="0.4s" repeatCount="indefinite"/></path>
          <path d="M-19,4 L-29,1 L-27,4 L-31,4.5 L-27,5.5 Z" fill="#ffd23a"/>
          <path d="M-19,4 L-25,2.6 L-24,4 L-26,4.6 Z" fill="#fff2b0"/>
        </g>
        <g stroke="#0a0c10" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">
          <!-- low chopper frame mass under seat + bag (with battery box) -->
          <path d="M-13,6 L-17,-3 L2,-2 L9,-3 L11,5 Z" fill="${body}"/>
          <rect x="-6" y="-1" width="13" height="6.5" rx="1" fill="#0d0f15"/>
          <rect x="-5" y="0" width="11" height="1.6" rx="0.8" fill="${accent}" stroke="none" opacity="0.85"/>
          <!-- long flat ribbed seat over the rear -->
          <path d="M-20,-4.6 L-6,-5.2 L-4,-3.4 L-19,-3 Z" fill="#1c1f28"/>
          <g stroke="${accent}" stroke-width="0.5" opacity="0.7"><line x1="-18" y1="-4.2" x2="-18" y2="-3.4"/><line x1="-15" y1="-4.4" x2="-15" y2="-3.5"/><line x1="-12" y1="-4.5" x2="-12" y2="-3.6"/><line x1="-9" y1="-4.6" x2="-9" y2="-3.7"/></g>
          <!-- front fork raked down to the front wheel -->
          <line x1="8" y1="-4" x2="13" y2="6" stroke="${accent}" stroke-width="1.6"/>
          <line x1="10" y1="-4" x2="14.5" y2="6" stroke="#0a0c10" stroke-width="1"/>
          <!-- handlebars rising over the front -->
          <line x1="9" y1="-4" x2="12" y2="-11" stroke-width="1.4"/>
          <line x1="12" y1="-11.4" x2="15.5" y2="-11" stroke-width="1.6"/>
          <circle cx="15.6" cy="-11" r="1" fill="${accent}"/>
          <!-- headlamp -->
          <circle cx="12.5" cy="-2" r="1.7" fill="#fff6c0"/>
        </g>
        <!-- hot-rod flame licks along the lower frame -->
        <g fill="${flame}" opacity="0.92" stroke="none">
          <path d="M8,5.5 L-2,4.4 L1,5.4 L-6,4.6 L-2,6 L-10,5 L-5,6.6 L9,6.2 Z"/>
          <path d="M6,5.4 L-1,4.7 L1,5.4 L-4,4.9 L-1,6 Z" fill="#ffd23a"/>
        </g>
        <!-- the golf bag stood UPRIGHT dead-centre, between seat and bars — the signature -->
        <g stroke="#0a0c10" stroke-width="0.9" stroke-linejoin="round">
          <line x1="1" y1="-8" x2="-0.5" y2="-17" stroke="#c9ccd6" stroke-width="1"/><circle cx="-0.6" cy="-17.4" r="1.6" fill="#e6ebf2"/>
          <line x1="3.4" y1="-8" x2="4.6" y2="-16" stroke="#c9ccd6" stroke-width="1"/><circle cx="4.7" cy="-16.4" r="1.4" fill="#b7c0cc"/>
          <line x1="2" y1="-8" x2="1.8" y2="-18" stroke="#c9ccd6" stroke-width="0.9"/><circle cx="1.7" cy="-18.3" r="1.3" fill="#d7dee6"/>
          <path d="M-2.8,-8.5 L5.8,-8.5 L4.8,1.2 L-1.8,1.2 Z" fill="${accent}"/>
          <path d="M-2.8,-8.5 L5.8,-8.5 L5.4,-6 L-2.5,-6 Z" fill="#0d0f15" stroke="none" opacity="0.35"/>
          <rect x="-1.6" y="-6.6" width="4.8" height="3.4" rx="0.8" fill="${glass}" opacity="0.55"/>
          <circle cx="6" cy="-3" r="1.5" fill="#0d0f15"/><circle cx="6" cy="-3" r="0.7" fill="${accent}"/>
        </g>
        ${tyre(-13, 5.6, '0.5s')}${tyre(13, 7, '0.55s')}`;
    }
    case 'infinity': {
      // The Infinity Ace (GS-unending) — the hole-150 grail and, by construction, the top of the
      // fleet: a golden phoenix-winged star-yacht. Slow-beating flame-feather wings, a triple
      // aurora exhaust, an orbiting ring of light, a spinning golden hull core, and the ∞ pennant
      // flying off the tail fin. Authored biggest of all so nothing in the garage upstages it.
      const shimmer = (dur: string) =>
        `<animate attributeName="opacity" values="0.55;1;0.7;1;0.55" dur="${dur}" repeatCount="indefinite"/>`;
      // A phoenix wing: three layered feather sweeps that gently beat (rotate about the wing root).
      const wing = (sy: number, begin: string) => `
        <g transform="translate(-2 ${sy < 0 ? -4 : 2}) scale(1 ${sy})">
          <g>
            <animateTransform attributeName="transform" type="rotate" values="-4 0 0;5 0 0;-4 0 0" dur="1.8s" begin="${begin}" repeatCount="indefinite"/>
            <path d="M0,0 Q-10,-9 -24,-8 Q-14,-4 -20,-1 Q-12,-2 -16,2 Q-8,1 0,3 Z" fill="${flame}" opacity="0.9">${shimmer('2.2s')}</path>
            <path d="M0,0 Q-8,-6 -18,-5.5 Q-10,-2.5 -14,-0.5 Q-6,-0.5 0,2 Z" fill="${body}"/>
            <path d="M0,0.6 Q-6,-3 -12,-2.6 Q-5,0 0,1.6 Z" fill="#fff2b0" opacity="0.85"/>
          </g>
        </g>`;
      // The orbiting ring: a tilted ellipse of three light-motes circling the hull.
      const orbiters = [0, 1, 2]
        .map(
          (i) => `
        <g><animateTransform attributeName="transform" type="rotate" from="${i * 120}" to="${i * 120 + 360}" dur="3.6s" repeatCount="indefinite"/>
          <circle cx="17" cy="0" r="1.3" fill="#fff"><animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="${(i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>
        </g>`,
        )
        .join('');
      return `
        <!-- triple aurora exhaust, roaring in three colours -->
        <g stroke="none">
          <path d="M-19,-2 L-34,-6 L-31,-2 Z" fill="#7fd6ff" opacity="0.85">${shimmer('0.9s')}</path>
          <path d="M-20,1.5 L-38,1.5 L-33,3.5 Z" fill="${flame}" opacity="0.95">${shimmer('0.7s')}</path>
          <path d="M-19,5 L-33,9 L-30,4.5 Z" fill="#ff8bf0" opacity="0.85">${shimmer('1.1s')}</path>
          <path d="M-20,1 L-30,0.6 L-30,2.6 L-20,3 Z" fill="#fff2b0" opacity="0.9"/>
        </g>
        ${wing(-1, '0s')}${wing(1, '0.4s')}
        <g stroke="#3a2a08" stroke-width="1" stroke-linejoin="round">
          <!-- golden hull: a long swept teardrop with an under-keel -->
          <path d="M-20,2 Q-14,-5.5 0,-6 Q14,-6 21,-0.5 Q15,6 0,6.5 Q-12,6.5 -20,2 Z" fill="${body}"/>
          <path d="M-14,4.6 Q0,8.2 14,4.2 L11,6.4 Q0,8.6 -10,6.4 Z" fill="${accent}" stroke="none" opacity="0.9"/>
          <!-- canopy + glint -->
          <path d="M-2,-5.4 Q6,-8.6 13,-3.4 Q7,-1.4 -1,-2.4 Z" fill="${glass}"/>
          <ellipse cx="4" cy="-4.6" rx="2.6" ry="1" fill="#ffffff" opacity="0.6"/>
          <!-- gold filigree stripe -->
          <path d="M-17,0.6 Q0,-2.6 19,-0.4" fill="none" stroke="#fff2b0" stroke-width="1.1"/>
          <!-- nose lamp -->
          <circle cx="20" cy="-0.4" r="1.6" fill="#fff6c0"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.6s" repeatCount="indefinite"/></circle>
        </g>
        ${orbiters}
        <!-- tail fin + the ∞ pennant, rocking proudly -->
        <g stroke="#3a2a08" stroke-width="0.9"><line x1="-14" y1="-4" x2="-16" y2="-17"/></g>
        <circle cx="-16" cy="-17" r="1.1" fill="${accent}"/>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-3 -16 -14;3 -16 -14;-3 -16 -14" dur="2.2s" repeatCount="indefinite"/>
          <path d="M-16,-17 L1,-15.4 L-2,-12.6 L1,-9.8 L-16,-11 Z" fill="#0f5132" stroke="#3a2a08" stroke-width="0.6"/>
          <text x="-13.4" y="-12.2" font-size="4.6" font-weight="800" fill="#ffd76b" font-family="system-ui,sans-serif">∞</text>
        </g>`;
    }
    case 'pegasus': {
      // The Pegasus (GS-pegasus) — the Asgardian battle-steed matched to the Valkyrie apparel set: a
      // galloping winged horse of burnished bronze with a golden mane, harness and hooves, and great
      // feathered wings that slowly beat. A tail of streaming starlight trails behind like a valkyrie's
      // charge across the sky. Authored right-facing in the ±20u frame; layered wing-behind → body →
      // wing-front so the near wing reads over the barrel.
      const shimmer = (dur: string) =>
        `<animate attributeName="opacity" values="0.6;1;0.75;1;0.6" dur="${dur}" repeatCount="indefinite"/>`;
      // A feathered wing rooted at the withers (~x-1,y-5), sweeping up and back; it slowly beats by
      // rotating about the root. `up` flips the near/far wing a touch so they don't overlap exactly.
      const wing = (up: number, begin: string, fill: string) => `
        <g>
          <animateTransform attributeName="transform" type="rotate" values="${-6 + up} -1 -5;${8 + up} -1 -5;${-6 + up} -1 -5" dur="2.1s" begin="${begin}" repeatCount="indefinite"/>
          <path d="M-1,-5 Q-14,-18 -28,-16 Q-16,-11 -22,-8 Q-11,-10 -16,-5 Q-7,-6 -1,-2 Z" fill="${fill}" stroke="${accent}" stroke-width="0.6" stroke-linejoin="round">${shimmer('2.4s')}</path>
          <path d="M-1,-5 Q-11,-14 -21,-12.5 Q-13,-8.5 -17,-6 Q-8,-6.5 -1,-3 Z" fill="#ffffff" opacity="0.5"/>
        </g>`;
      // The streaming star-tail plume trailing back-left off the rump.
      const tail = `
        <g stroke="none">
          <path d="M-11,-1 Q-24,-5 -32,-10 Q-22,-2 -30,-1 Q-22,1 -30,5 Q-22,4 -28,9 Q-20,3 -11,3 Z" fill="${flame}" opacity="0.85">${shimmer('1.6s')}</path>
          <path d="M-11,0 Q-20,-2 -26,-5 Q-19,0 -24,1.4 Q-19,2 -24,6 Q-18,2.4 -11,2.4 Z" fill="#ffffff" opacity="0.55"/>
        </g>`;
      return `
        ${tail}
        ${wing(-2, '0s', body)}
        <g stroke="#3a2708" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">
          <!-- galloping legs (folded, mid-stride) -->
          <path d="M6,4 L11,10 L9,11" fill="none"/>
          <path d="M3,4.5 L6,11 L4,12" fill="none"/>
          <path d="M-6,4 L-10,10 L-12,10.4" fill="none"/>
          <path d="M-3,4.5 L-5,11 L-7,11.6" fill="none"/>
          <!-- barrel body -->
          <path d="M-12,0 Q-9,-6 0,-6 Q9,-6 11,-1 Q10,5 0,5.6 Q-10,5.6 -12,0 Z" fill="${body}"/>
          <!-- gold saddle-girth harness band -->
          <path d="M-3,-5.6 Q-3,0 -2,5.4" fill="none" stroke="${accent}" stroke-width="1.4"/>
          <!-- arched neck sweeping up to the head -->
          <path d="M7,-3 Q11,-9 13,-11 Q16,-9 15,-5 Q13,-3 9,-1 Z" fill="${body}"/>
          <!-- head + muzzle, an ear pricked up -->
          <path d="M13,-11 Q18,-11 18.5,-7.5 Q18,-6 15.5,-6 Q13.5,-7 13,-9 Z" fill="${body}"/>
          <path d="M13.5,-11 L13,-14.5 L15.4,-11.8 Z" fill="${body}"/>
          <circle cx="16.6" cy="-8.4" r="0.7" fill="#2a1c08"/>
          <!-- gold hooves -->
          <g fill="${accent}" stroke="none"><circle cx="9" cy="11" r="1.1"/><circle cx="4" cy="12" r="1.1"/><circle cx="-12" cy="10.5" r="1.1"/><circle cx="-7" cy="11.7" r="1.1"/></g>
        </g>
        <!-- golden streaming mane along the neck crest -->
        <g stroke="${flame}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.95">
          <path d="M14,-11 Q10,-10 8,-6">${shimmer('1.9s')}</path>
          <path d="M12,-9 Q8,-8 6,-4"/>
          <path d="M10,-6.5 Q6,-6 4,-2.5"/>
        </g>
        ${wing(2, '0.35s', glass)}`;
    }
    case 'firebird': {
      // The Firebird (GS-lore-parrot-firebird) — the parrot's spirit-brother's ride reborn: a jet-black
      // muscle-car star-cruiser with a golden PHOENIX blazing across the hood (a Smokey-and-the-Bandit
      // Trans Am). Authored right-facing in the ±20u frame: fat gold-rimmed tyres UNDER the body (fenders
      // over them), a low coupe greenhouse in Trans Am gold glass with a T-top bar, a shaker hood scoop,
      // twin flame exhaust trailing off the tail, and the spread-winged firebird emblem over the flank.
      const wheel = (x: number) => `
        <circle cx="${x}" cy="6" r="3.5" fill="#0a0c10" stroke="#050608" stroke-width="1"/>
        <circle cx="${x}" cy="6" r="2.1" fill="#14171f" stroke="${accent}" stroke-width="1.1"/>
        <g transform="translate(${x} 6)"><g stroke="${accent}" stroke-width="0.7">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.6s" repeatCount="indefinite"/>
          <line x1="-2" y1="0" x2="2" y2="0"/><line x1="0" y1="-2" x2="0" y2="2"/>
          <line x1="-1.4" y1="-1.4" x2="1.4" y2="1.4"/><line x1="-1.4" y1="1.4" x2="1.4" y2="-1.4"/>
        </g></g>
        <circle cx="${x}" cy="6" r="0.7" fill="${accent}"/>`;
      return `
        <!-- twin flame exhaust roaring off the tail -->
        <g stroke="none">
          <path d="M-17,3.2 L-28,1.6 L-24,3.4 L-30,4 L-24,4.6 L-27,6.2 Z" fill="${flame}" opacity="0.9"><animate attributeName="opacity" values="0.6;1;0.7;1;0.6" dur="0.4s" repeatCount="indefinite"/></path>
          <path d="M-17,3.6 L-24,2.8 L-22,3.8 L-25,4.2 L-22,4.9 Z" fill="#ffd23a"/>
          <path d="M-17,3.9 L-22,3.2 L-21,4 L-23,4.4 Z" fill="#fff2b0"/>
        </g>
        ${wheel(-10)}${wheel(12)}
        <g stroke="#050608" stroke-width="1" stroke-linejoin="round">
          <!-- low wide muscle-car body: rear ducktail → cabin → long hood down to a pointed nose -->
          <path d="M-17,5 L-17,2.4 L-12.5,1.6 L-8,-2 L-2,-4.6 L6,-4.8 L11,-2.2 L19,-1 L19,2.6 L16.5,5 Z" fill="${body}"/>
          <!-- gloss highlight along the flank -->
          <path d="M-12,1.4 L-7.4,-1.6 L-2,-3.9 L6,-4 L10.4,-1.8 L17.5,-0.7" fill="none" stroke="#2a2f3a" stroke-width="0.8" opacity="0.8"/>
          <!-- greenhouse: raked windscreen + side glass, Trans Am gold -->
          <path d="M-1.4,-4 L5.4,-4.2 L9.4,-2.2 L-1.4,-2 Z" fill="${glass}" opacity="0.9"/>
          <path d="M-7,-2 L-2,-4 L-2,-2 Z" fill="${glass}" opacity="0.85"/>
          <!-- T-top bar splitting the glass -->
          <rect x="1.4" y="-4.3" width="1.5" height="2.5" fill="${body}" stroke="none"/>
          <!-- gold beltline pinstripe -->
          <path d="M-15,1.8 Q0,0.2 16,-0.5" fill="none" stroke="${accent}" stroke-width="0.8" opacity="0.9"/>
          <!-- shaker hood scoop up front -->
          <path d="M9.5,-2.2 L14.5,-1.7 L14.5,-0.7 L9.5,-1.1 Z" fill="#151a22"/>
          <!-- pop-up headlamp + rear taillight -->
          <rect x="16.6" y="-0.6" width="2.3" height="1.5" rx="0.4" fill="#fff6c0"/>
          <rect x="-17" y="1.2" width="1.3" height="2.4" rx="0.3" fill="#ff5a4d"/>
        </g>
        <!-- the golden PHOENIX ablaze across the hood/flank — the signature, facing the nose -->
        <g fill="${accent}" stroke="none">
          <!-- central body + crested head toward the nose -->
          <path d="M4,-0.4 Q9,-1.8 14,-0.8 Q11.5,0.2 14,1.2 Q9,0.4 4,-0.4 Z"/>
          <!-- far wing swept up over the hood -->
          <path d="M5,-0.8 Q1,-5.4 -4,-6 Q-0.6,-3.6 -1.4,-2.2 Q2.4,-3 5,-0.8 Z"/>
          <!-- near wing (lighter, over the cabin) -->
          <path d="M6,-0.6 Q3,-4.6 -1,-5 Q1.6,-2.8 0.8,-1.6 Q3.4,-2.4 6,-0.6 Z" fill="${glass}" opacity="0.92"/>
          <!-- flame tail feathers dropping toward the door -->
          <path d="M4,0.2 Q1.4,3.4 -3.6,4 Q-0.6,2 -1.4,0.9 Q1.6,1.6 4,0.2 Z"/>
          <!-- eye + beak glint -->
          <circle cx="12.4" cy="-0.5" r="0.5" fill="#050608"/>
        </g>`;
    }
    case 'shuttle':
      // A rugged hauler barge.
      return `
        <g stroke="#10160d" stroke-width="1" stroke-linejoin="round">
          <path d="M-17,4 L-17,-3 L8,-4 L18,0 L18,6 L-17,6 Z" fill="${body}"/>
          <rect x="-13" y="-2.4" width="6" height="3" fill="${glass}"/>
          <rect x="-5" y="-2.4" width="6" height="3" fill="${glass}"/>
          <path d="M8,-4 L13,-9 L13,-3 Z" fill="${accent}"/>
          <rect x="-17" y="-5" width="22" height="1.6" rx="0.6" fill="${accent}" stroke="none"/>
        </g>
        ${exhaust}`;
    default:
      return '';
  }
}

/**
 * The Ion Thrusters retrofit's wake (GS-fuel-3) — the "fully sick" version of the stock exhaust: a
 * long, layered ion stream trailing behind the hull (violet halo → cyan stream → white-hot core),
 * flickering at engine frequency, with charge particles racing down the wake and a glowing nozzle
 * ring where it leaves the ship. Authored in the same ±20u right-facing ship frame (the stock
 * exhaust ends ~x −30; the wake reaches ~x −58) and layered UNDER the hull. Pure SVG + SMIL, no
 * defs/gradients (SVG ids are document-global — a shared id would cross-tint co-mounted ships).
 */
function ionWake(): string {
  const particle = (beg: string, dy: number, dur: string): string =>
    `<circle cx="-20" cy="${dy}" r="1.1" fill="#eaffff" opacity="0">
       <animate attributeName="opacity" values="0;0.9;0" dur="${dur}" begin="${beg}" repeatCount="indefinite"/>
       <animateTransform attributeName="transform" type="translate" values="0 0;-34 ${dy > 2 ? 1.5 : -1.5}" dur="${dur}" begin="${beg}" repeatCount="indefinite"/>
     </circle>`;
  return `<g stroke="none">
    <path d="M-17,-1 C-32,-6 -48,-5 -58,2 C-48,9 -32,8 -17,5 Z" fill="#8a7bff" opacity="0.22">
      <animate attributeName="opacity" values="0.22;0.1;0.22" dur="1.1s" repeatCount="indefinite"/>
    </path>
    <path d="M-17,0 C-30,-4 -44,-3 -53,2 C-44,7 -30,7 -17,4 Z" fill="#4fd0e0" opacity="0.5">
      <animate attributeName="opacity" values="0.55;0.3;0.55" dur="0.7s" repeatCount="indefinite"/>
    </path>
    <path d="M-17,1 C-27,-1 -37,-0.5 -45,2 C-37,4.5 -27,5 -17,3.4 Z" fill="#bfffff" opacity="0.75">
      <animate attributeName="opacity" values="0.8;0.5;0.8" dur="0.45s" repeatCount="indefinite"/>
    </path>
    <circle cx="-18" cy="2" r="4" fill="#7ff3ff" opacity="0.45">
      <animate attributeName="r" values="3.4;4.6;3.4" dur="0.9s" repeatCount="indefinite"/>
    </circle>
    <circle cx="-18" cy="2" r="1.8" fill="#ffffff" opacity="0.85"/>
    ${particle('0s', 1, '0.9s')}${particle('0.3s', 3.2, '1.1s')}${particle('0.6s', -0.6, '0.8s')}
  </g>`;
}

/** Draw a ship as an SVG `<g>` translated to (cx,cy) and scaled (s≈width/40), with a gentle bob.
 *  `opts.ion` (GS-fuel-3) trails the Ion Thrusters wake under the hull; absent = the classic ship,
 *  byte-identical everywhere else this is mounted (clubhouse pads, market cards). */
export function shipSVG(id: string | undefined, cx: number, cy: number, s: number, opts: { ion?: boolean } = {}): string {
  const look = (shipById(id) ?? shipById(DEFAULT_SHIP_ID))!.look;
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">
    <g opacity="0.95"><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.4;0 0" dur="3.2s" repeatCount="indefinite"/>${shipBody(look)}${opts.ion ? ionWake() : ''}${bling(look.bling ?? 0)}</g>
  </g>`;
}

/** A complete framed `<svg>` of a ship for a market / garage / preview card. */
export function shipCardSVG(id: string | undefined, w = 96, h = 64): string {
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ship" style="display:block;">
    ${shipSVG(id, w / 2, h / 2 + 4, Math.min(w, h) / 34)}
  </svg>`;
}
