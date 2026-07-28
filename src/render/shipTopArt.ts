/**
 * TOP-DOWN SHIP ART FOR THE PORTRAIT FIGHT (GS-story-battle-topdown).
 *
 * Player report: *"the serpent looks pretty good as it dangles from the top of the screen, but the side-on
 * spaceships look really weird in portrait mode. I keep trying to crane my neck sideways."* Exactly right,
 * and it is the case where turning the camera genuinely BREAKS — unlike the serpent, which GS-story-battle-
 * epic looked at and left alone. A snake striking head-first down the screen is a real pose. A saloon car
 * seen in **side elevation** while it flies away from you up the screen is not a pose at all: you are
 * looking at the driver's door of a thing that is receding, so the brain tilts the head to fix it.
 *
 * `shipArt.ts` is a SIDE ELEVATION — every hull authored facing +x with wheels underneath, a canopy on top
 * and an exhaust out the back. That is right for the star map, the garage cards and the clubhouse pads, and
 * it is right for the LANDSCAPE fight, where +x really is "across the screen". It is wrong the moment the
 * arena turns 90° and +x becomes "up the screen, away from the player".
 *
 * So this is its PLAN VIEW twin: the same fleet seen from above.
 *
 * THREE RULES, and the first is what makes this cheap:
 *   1. **SAME FRAME, SAME FACING.** Authored in the identical ±20u right-facing frame `shipArt.ts` uses
 *      (viewBox `-34 -20 62 40`), so it is a DROP-IN — the battle swaps one `Image` for the other and
 *      nothing downstream changes: not `SHIP_W`/`SHIP_H`, not the hit radius, not the shield bubble, not
 *      the thrust flame, not one hardpoint in `battleArms.ts`. The portrait camera then points the nose UP,
 *      which is the canonical portrait shmup, and the LANDSCAPE fight keeps the side art byte-for-byte.
 *   2. **SYMMETRIC ABOUT THE KEEL.** A plan view of a vehicle is mirror-symmetric about y=0. This is not
 *      decoration — it is what forces `battleArms` to mirror a one-sided mount set (a side elevation HIDES
 *      the far-side gun; from above you can see both, and firing from only the port wing reads as broken).
 *   3. **THE SILHOUETTE STILL HAS TO BE THAT SHIP.** From above a car is mostly roof, so each hull keeps
 *      whatever survives the change of angle and leans on it: the wagon's roof rack and wood panelling, the
 *      Firebird's phoenix hood decal (which reads BETTER from above than it ever did from the side), the
 *      bikes' wheels-in-line under wide bars, the discs' rim lights, the winged ships' full span.
 *
 * Pure string builders — deterministic, no `Math.random`, and **no SVG `id`s** (they are document-global;
 * two ships mounted together would cross-tint). No SMIL either: the battle rasterizes this into an `<img>`,
 * where animation does not run, so an animated plan hull would be markup that never moves.
 *
 * Node-tested by `tests/ship-top-art.test.ts`; `storyBattle.ts` is the only consumer.
 */

import { shipById, DEFAULT_SHIP_ID, type ShipLook } from '../sim/rpg/ships';

/** The authored frame — identical to `shipArt.ts`'s, which is the whole point (rule 1). */
export const TOP_VIEW_BOX = '-34 -20 62 40';

/** Mirror a path-ish fragment builder across the keel: `pair(y => …)` draws it at +y and −y. */
function pair(f: (s: number) => string): string {
  return f(1) + f(-1);
}

/** The engine glow out the tail — shared, and drawn along −x like the side art's exhaust. */
function wash(flame: string, spread = 5): string {
  return `<g stroke="none">
    <path d="M-17,${-spread} L-29,0 L-17,${spread} Z" fill="${flame}" opacity="0.5"/>
    <path d="M-17,${-spread * 0.5} L-25,0 L-17,${spread * 0.5} Z" fill="#ffe9a8" opacity="0.75"/>
  </g>`;
}

/** The inner figure for a ship look, seen FROM ABOVE, authored in the ±20u frame, nose facing +x. */
function shipTopBody(look: ShipLook): string {
  const { body, glass, flame, accent } = look;
  switch (look.kind) {
    case 'wagon':
      // A station wagon from directly overhead: a long roof, the rack rails running fore-and-aft down
      // both sides, wood panelling along the flanks, and all four wheels showing (a side view shows two).
      return `${wash(flame)}
        <g stroke="#1c130b" stroke-width="1" stroke-linejoin="round">
          ${pair((s) => `<rect x="-13" y="${s * 7.4 - (s > 0 ? 0 : 2.6)}" width="6" height="2.6" rx="0.8" fill="#2a1c10"/>
                          <rect x="8" y="${s * 7.4 - (s > 0 ? 0 : 2.6)}" width="6" height="2.6" rx="0.8" fill="#2a1c10"/>`)}
          <path d="M-17,-7 L12,-7.6 L19,-3.4 L19,3.4 L12,7.6 L-17,7 Z" fill="${body}"/>
          <path d="M-17,-4.4 L-17,4.4" fill="none" stroke="${accent}" stroke-width="2"/>
          ${pair((s) => `<rect x="-15" y="${s * 6.2 - 1}" width="26" height="2" rx="0.9" fill="${accent}" stroke="none" opacity="0.85"/>`)}
          <path d="M2,-6 L11,-5.2 L14,0 L11,5.2 L2,6 Z" fill="${glass}" opacity="0.9"/>
          <rect x="-12" y="-5.2" width="9" height="10.4" rx="1" fill="${glass}" opacity="0.55"/>
          ${pair((s) => `<rect x="-14" y="${s * 4 - 0.7}" width="24" height="1.4" fill="${accent}" stroke="none" opacity="0.5"/>`)}
        </g>
        <g stroke="none">${pair((s) => `<rect x="-13" y="${s * 6.6 - 0.5}" width="4" height="1" fill="${accent}"/>`)}</g>`;

    case 'racer':
      // A dart from above: a needle nose, a narrow spine and swept delta wings well aft.
      return `${wash(flame, 4)}
        <g stroke="#10131a" stroke-width="1" stroke-linejoin="round">
          <path d="M-13,-3.6 L-4,-12 L-11,-13 L-16,-4.6 Z" fill="${accent}"/>
          <path d="M-13,3.6 L-4,12 L-11,13 L-16,4.6 Z" fill="${accent}"/>
          <path d="M22,0 L6,-4.4 L-15,-5 L-16,5 L6,4.4 Z" fill="${body}"/>
          <path d="M11,0 L2,-2.6 L-3,-2.4 L-3,2.4 L2,2.6 Z" fill="${glass}" opacity="0.92"/>
          <path d="M22,0 L10,-1.2 L10,1.2 Z" fill="${accent}"/>
        </g>
        <g stroke="none">${pair((s) => `<rect x="-16.5" y="${s * 3.6 - 1.2}" width="3" height="2.4" rx="1" fill="${flame}"/>`)}</g>`;

    case 'saucer':
      // A disc is a disc — but from above it is a CIRCLE with the dome at its middle and the drive
      // lights ringing the rim, not the flattened ellipse the side view shows.
      return `
        <g stroke="#0d1a14" stroke-width="1">
          <circle cx="0" cy="0" r="15" fill="${body}"/>
          <circle cx="0" cy="0" r="15" fill="none" stroke="${accent}" stroke-width="1.4"/>
          <circle cx="0" cy="0" r="10.5" fill="none" stroke="${accent}" stroke-width="0.8" opacity="0.6"/>
          <circle cx="0" cy="0" r="6.4" fill="${glass}" opacity="0.9"/>
        </g>
        <g stroke="none" fill="${flame}">
          ${[0, 60, 120, 180, 240, 300].map((d) => {
            const a = (d * Math.PI) / 180;
            return `<circle cx="${(Math.cos(a) * 12.6).toFixed(1)}" cy="${(Math.sin(a) * 12.6).toFixed(1)}" r="1.3"/>`;
          }).join('')}
        </g>
        <ellipse cx="-3" cy="-2.4" rx="3" ry="2" fill="#ffffff" opacity="0.35"/>`;

    case 'comet':
      // A golf ball looks the same from every angle — that is what a sphere is. Only the tail turns.
      return `
        <g stroke="none">
          <path d="M-8,0 L-30,-4 L-30,4 Z" fill="${flame}" opacity="0.85"/>
          <path d="M-8,0 L-26,-1.8 L-26,1.8 Z" fill="#fff" opacity="0.8"/>
        </g>
        <circle cx="0" cy="0" r="9" fill="${body}" stroke="${accent}" stroke-width="1"/>
        <g fill="#c9ccd6"><circle cx="-2.5" cy="-2.5" r="1"/><circle cx="2" cy="-1.5" r="1"/><circle cx="-1" cy="2" r="1"/><circle cx="3" cy="2.5" r="1"/><circle cx="-4" cy="1" r="1"/><circle cx="0" cy="-4.6" r="1"/><circle cx="1" cy="5" r="1"/></g>
        <ellipse cx="-3" cy="-3.4" rx="2.6" ry="1.8" fill="#ffffff" opacity="0.4"/>`;

    case 'shuttle':
      // A hauler from above is all PLAN: a broad slab fuselage, swept wings, and the cargo pods slung
      // either side that the side elevation could only ever show one of.
      return `${wash(flame, 6)}
        <g stroke="#10160d" stroke-width="1" stroke-linejoin="round">
          ${pair((s) => `<path d="M-6,${s * 4} L-13,${s * 16} L-2,${s * 16} L8,${s * 4.6} Z" fill="${body}"/>`)}
          ${pair((s) => `<rect x="-9" y="${s * 10 - (s > 0 ? 0 : 5)}" width="16" height="5" rx="2" fill="${accent}"/>`)}
          <path d="M-17,-6 L10,-6.6 L19,-2.6 L19,2.6 L10,6.6 L-17,6 Z" fill="${body}"/>
          <path d="M11,-4 L17,-1.6 L17,1.6 L11,4 Z" fill="${glass}" opacity="0.9"/>
          <rect x="-14" y="-4.6" width="20" height="9.2" rx="1.2" fill="none" stroke="${accent}" stroke-width="1"/>
          <line x1="-10" y1="-4.6" x2="-10" y2="4.6" stroke="${accent}" stroke-width="0.8"/>
          <line x1="-2" y1="-4.6" x2="-2" y2="4.6" stroke="${accent}" stroke-width="0.8"/>
        </g>
        <g stroke="none">${pair((s) => `<rect x="-18" y="${s * 3.4 - 1.4}" width="3.2" height="2.8" rx="1.2" fill="${flame}"/>`)}</g>`;

    case 'ufo':
      // The Mothership overhead: the full disc, the dome, the whole ring of flashing lights (the side
      // view can only show the near arc of them), the landing gear splayed out, and the pennant.
      return `
        <g stroke="#0d1a14" stroke-width="1">
          ${[30, 150, 270].map((d) => {
            const a = (d * Math.PI) / 180;
            return `<circle cx="${(Math.cos(a) * 17).toFixed(1)}" cy="${(Math.sin(a) * 17).toFixed(1)}" r="2.4" fill="#2a2f3a" stroke="#c9ccd6" stroke-width="0.8"/>`;
          }).join('')}
          <circle cx="0" cy="0" r="18" fill="${body}"/>
          <circle cx="0" cy="0" r="18" fill="none" stroke="${accent}" stroke-width="1.5"/>
          <circle cx="0" cy="0" r="12.6" fill="none" stroke="${accent}" stroke-width="0.9" opacity="0.55"/>
          <circle cx="0" cy="0" r="8" fill="${glass}" opacity="0.92"/>
          <circle cx="0" cy="0" r="8" fill="none" stroke="${accent}" stroke-width="1"/>
        </g>
        <g stroke="none">
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((d, i) => {
            const cols = ['#ff5a4d', '#ffd36b', '#7fffd0', '#7fd6ff', '#ff8bf0'];
            const a = (d * Math.PI) / 180;
            return `<circle cx="${(Math.cos(a) * 15.3).toFixed(1)}" cy="${(Math.sin(a) * 15.3).toFixed(1)}" r="1.5" fill="${cols[i % cols.length]}"/>`;
          }).join('')}
        </g>
        <ellipse cx="-3.4" cy="-3.4" rx="3.2" ry="2.2" fill="#ffffff" opacity="0.45"/>
        <g stroke="#0c1116" stroke-width="0.9"><line x1="18" y1="0" x2="24" y2="0"/></g>
        <path d="M24,0 L24,-6 L20,-4 L24,-2 Z" fill="#ff4fd8" stroke="#0c1116" stroke-width="0.6"/>`;

    case 'moto':
      // A space-bike overhead: wheels IN LINE down the keel, the rider's shoulders amidships, wide bars
      // across the front — the read a side view cannot give you — and the bag standing on the tail.
      return `${wash(flame, 3)}
        <g stroke="#0c1016" stroke-width="1" stroke-linejoin="round">
          <rect x="-14" y="-2" width="8" height="4" rx="1.8" fill="#0e121a" stroke="${accent}" stroke-width="1.1"/>
          <rect x="6" y="-1.8" width="9" height="3.6" rx="1.6" fill="#0e121a" stroke="${accent}" stroke-width="1.1"/>
          <path d="M-15,-2.6 L7,-3.6 L17,-1.3 L17,1.3 L7,3.6 L-15,2.6 Z" fill="${body}"/>
          <ellipse cx="-3" cy="0" rx="5" ry="4.6" fill="#151a22"/>
          <ellipse cx="-3.6" cy="0" rx="2.4" ry="2.2" fill="${accent}" opacity="0.45"/>
          <path d="M8,-3 L14,-1.1 L14,1.1 L8,3 Z" fill="${glass}" opacity="0.9"/>
          <line x1="10.5" y1="-8.4" x2="10.5" y2="8.4" stroke="${accent}" stroke-width="1.8"/>
          ${pair((s) => `<circle cx="10.5" cy="${s * 8.8}" r="1.2" fill="${accent}"/>`)}
          <path d="M-20,-3.2 L-14,-3.2 L-14.8,2.4 L-19.2,2.4 Z" fill="${accent}"/>
          ${pair((s) => `<line x1="-17" y1="${s * 1.6}" x2="-22" y2="${s * 4}" stroke="#c9ccd6" stroke-width="1"/>`)}
        </g>
        <g stroke="none">
          <circle cx="18" cy="0" r="1.3" fill="#fff6c0"/>
          ${pair((s) => `<rect x="-9" y="${s * 4.9 - 0.45}" width="17" height="0.9" rx="0.45" fill="${flame}"/>`)}
        </g>`;

    case 'chopper':
      // The Thunderbolt overhead: a long keel between fat tyres, the raked bars thrown wide at the
      // front, hot-rod flame licking down BOTH flanks, and the golf bag stood dead centre — from above
      // you see straight down into it, club heads fanned out.
      return `
        <g stroke="none">
          <path d="M-17,-5 L-33,0 L-17,5 Z" fill="${flame}" opacity="0.9"/>
          <path d="M-17,-2.6 L-27,0 L-17,2.6 Z" fill="#ffd23a"/>
        </g>
        <g stroke="#0a0c10" stroke-width="1" stroke-linejoin="round">
          <rect x="-17" y="-2.6" width="10" height="5.2" rx="2.2" fill="#0c0e13" stroke="${accent}" stroke-width="1.5"/>
          <rect x="10" y="-3" width="10" height="6" rx="2.6" fill="#0c0e13" stroke="${accent}" stroke-width="1.5"/>
          <path d="M-15,-3.6 L9,-4.6 L14,-2 L14,2 L9,4.6 L-15,3.6 Z" fill="${body}"/>
          <path d="M-14,-3 L-4,-3.4 L-4,3.4 L-14,3 Z" fill="#1c1f28"/>
          <line x1="9.6" y1="-10.4" x2="9.6" y2="10.4" stroke-width="1.9"/>
          ${pair((s) => `<line x1="9.6" y1="${s * 10.4}" x2="13.4" y2="${s * 9.2}" stroke-width="1.6"/><circle cx="13.8" cy="${s * 9.1}" r="1.1" fill="${accent}"/>`)}
        </g>
        <g fill="${flame}" opacity="0.92" stroke="none">
          ${pair((s) => `<path d="M7,${s * 4.2} L-1,${s * 3.6} L2,${s * 4.6} L-5,${s * 3.8} L-1,${s * 5.2} L-9,${s * 4.2} L-4,${s * 5.6} L8,${s * 5} Z"/>`)}
        </g>
        <g stroke="#0a0c10" stroke-width="0.9">
          <circle cx="1.5" cy="0" r="4" fill="${accent}"/>
          <circle cx="1.5" cy="0" r="2.4" fill="#0d0f15"/>
          <g stroke="#c9ccd6" stroke-width="1" fill="#e6ebf2">
            <line x1="1.5" y1="0" x2="5.6" y2="-3.4"/><circle cx="6" cy="-3.6" r="1.4" stroke="none"/>
            <line x1="1.5" y1="0" x2="6" y2="2.6"/><circle cx="6.4" cy="2.8" r="1.2" stroke="none"/>
            <line x1="1.5" y1="0" x2="2.6" y2="5"/><circle cx="2.7" cy="5.4" r="1.2" stroke="none"/>
          </g>
        </g>`;

    case 'infinity':
      // The Infinity Ace overhead: the full phoenix wingspan (a side view shows one wing edge-on), the
      // orbiting ring of light as a true circle, the golden core, and the ∞ on the hull.
      return `${wash(flame, 5)}
        <g stroke="none">
          ${pair((s) => `<path d="M-2,${s * 3} C-8,${s * 10} -6,${s * 17} 4,${s * 18} C8,${s * 12} 8,${s * 7} 6,${s * 3} Z" fill="${flame}" opacity="0.55"/>
                          <path d="M-1,${s * 3} C-6,${s * 9} -4,${s * 14} 4,${s * 15} C7,${s * 10} 7,${s * 6} 5.4,${s * 3} Z" fill="${accent}" opacity="0.75"/>`)}
        </g>
        <g stroke="#3a2c07" stroke-width="1" stroke-linejoin="round">
          <path d="M20,0 L8,-5 L-14,-4.6 L-17,0 L-14,4.6 L8,5 Z" fill="${body}"/>
          <path d="M12,0 L3,-2.8 L-4,-2.6 L-4,2.6 L3,2.8 Z" fill="${glass}" opacity="0.9"/>
        </g>
        <circle cx="0" cy="0" r="16" fill="none" stroke="${flame}" stroke-width="1.2" opacity="0.6"/>
        <circle cx="0" cy="0" r="16" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.5"/>
        <g fill="none" stroke="#3a2c07" stroke-width="1.1">
          <circle cx="-7" cy="0" r="2.4"/><circle cx="-2.4" cy="0" r="2.4"/>
        </g>
        <g stroke="none">${pair((s) => `<rect x="-18" y="${s * 2.6 - 1.1}" width="3" height="2.2" rx="1" fill="${flame}"/>`)}</g>`;

    case 'pegasus':
      // The Pegasus overhead: the full spread of both wings, the barrel and neck running down the keel,
      // the head at the nose and the starlight tail streaming aft.
      return `
        <g stroke="none">
          <path d="M-14,-4 L-30,-1 L-30,1 L-14,4 Z" fill="${flame}" opacity="0.6"/>
        </g>
        <g stroke="none">
          ${pair((s) => `<path d="M-3,${s * 3.4} C-12,${s * 9} -12,${s * 16} -1,${s * 18} C6,${s * 13} 7,${s * 7} 4,${s * 3.4} Z" fill="${accent}" opacity="0.85"/>
                          <path d="M-2,${s * 3.4} C-9,${s * 8} -9,${s * 13} -1,${s * 14.6} C4,${s * 10} 5,${s * 6} 3,${s * 3.4} Z" fill="${glass}" opacity="0.55"/>
                          <g stroke="${body}" stroke-width="0.6" opacity="0.55">
                            <line x1="-1" y1="${s * 5}" x2="-3" y2="${s * 15}"/><line x1="1.4" y1="${s * 5}" x2="0.6" y2="${s * 14}"/>
                          </g>`)}
        </g>
        <g stroke="#5a3c14" stroke-width="1" stroke-linejoin="round">
          <path d="M-15,0 L-11,-4 L2,-5.4 L10,-3.2 L14,-2.2 L19,0 L14,2.2 L10,3.2 L2,5.4 L-11,4 Z" fill="${body}"/>
          <path d="M13,-2.4 L19,0 L13,2.4 Z" fill="${accent}"/>
          <path d="M4,-2.6 L10,-1.6 L10,1.6 L4,2.6 Z" fill="${accent}" opacity="0.8"/>
        </g>
        <g stroke="none" fill="${accent}">${pair((s) => `<path d="M2,${s * 4.4} L-4,${s * 6.4} L-1,${s * 3.6} Z"/>`)}</g>`;

    default:
      // 'firebird' — the muscle car overhead, and the angle its art was BORN for: the spread-winged
      // phoenix blazing across the hood is a hood decal, and a side elevation could only ever show it
      // edge-on. From above it is the whole ship.
      return `
        <g stroke="none">
          ${pair((s) => `<path d="M-17,${s * 3.4} L-30,${s * 1} L-24,${s * 3.4} L-31,${s * 4} L-22,${s * 5.4} Z" fill="${flame}" opacity="0.85"/>`)}
        </g>
        <g stroke="#050608" stroke-width="1" stroke-linejoin="round">
          ${pair((s) => `<rect x="-13" y="${s * 7 - (s > 0 ? 0 : 2.8)}" width="6.5" height="2.8" rx="1" fill="#0a0c10" stroke="${accent}" stroke-width="0.8"/>
                          <rect x="7" y="${s * 7 - (s > 0 ? 0 : 2.8)}" width="6.5" height="2.8" rx="1" fill="#0a0c10" stroke="${accent}" stroke-width="0.8"/>`)}
          <path d="M-17,-6.4 L-14,-7.6 L11,-7.2 L19,-3 L19,3 L11,7.2 L-14,7.6 L-17,6.4 Z" fill="${body}"/>
          <path d="M-9,-5.4 L2,-5 L5,0 L2,5 L-9,5.4 Z" fill="${glass}" opacity="0.85"/>
          <rect x="-4.4" y="-5.4" width="1.8" height="10.8" fill="${body}" stroke="none"/>
          <rect x="9" y="-3" width="5" height="6" rx="1" fill="#0a0c10"/>
        </g>
        <g stroke="none" fill="${accent}" opacity="0.95">
          <path d="M6,0 L1,-1.6 L-2,-1 L-1,0 L-2,1 L1,1.6 Z"/>
          ${pair((s) => `<path d="M1,${s * 1.2} C-2,${s * 4} -7,${s * 5.6} -12,${s * 5} C-8,${s * 3.4} -5,${s * 2.6} -1.6,${s * 0.8} Z"/>
                          <path d="M0,${s * 0.8} C-3,${s * 2.6} -8,${s * 3.4} -12,${s * 3} C-8,${s * 1.8} -4,${s * 1.4} -1.4,${s * 0.4} Z" fill="${flame}" opacity="0.8"/>`)}
        </g>`;
  }
}

/**
 * Draw a ship FROM ABOVE as an SVG `<g>` translated to (cx,cy) and scaled — the plan-view twin of
 * `shipSVG`, same frame, same facing, same signature shape.
 */
export function shipTopSVG(id: string | undefined, cx: number, cy: number, s: number): string {
  const look = (shipById(id) ?? shipById(DEFAULT_SHIP_ID))!.look;
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">${shipTopBody(look)}</g>`;
}

/** The full `<svg>` document for rasterizing into an `<img>` — what the battle actually mounts. */
export function shipTopSpriteSVG(id: string | undefined, w = 372, h = 240): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${TOP_VIEW_BOX}">${shipTopSVG(id, 0, 0, 1)}</svg>`;
}
