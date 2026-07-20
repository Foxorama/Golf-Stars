/**
 * The graphic MOTHERSHIP clubhouse for Story Tour's spaceport (GS-story-clubhouse-scene): the campaign hub
 * you return to between worlds, rendered as ONE interactive scene aboard the Mothership rather than a flat
 * list of buttons. You SEE your golfer standing on the deck (their look), the Prognostic Parrot behind the
 * bar, your equipped ship parked in the hangar bay, and your active caddy at your side — then you TAP a place
 * to go there: the viewport for the star chart, the hangar bay for your fleet, the locker bank for your gear,
 * the bar for the Crow's Nest.
 *
 * This is the story spaceport's OWN identity — a warm-lit wreck-of-a-Mothership interior, distinct from the
 * cosmetic title Clubhouse (`clubhouseLounge.ts`, the Voyage/Unending wardrobe). Reuses the proven scene
 * idiom from the Earth clubhouse + the Crow's Nest (container-query sizing, feet-anchored figures, an SVG
 * backdrop with absolutely-positioned tap hotspots). All art is hand-placed (ZERO rng) so it's byte-stable.
 * Its OWN CSS prefix (`.gs-sclub*`) — never the play HUD's `.gs-hud` (see CLAUDE.md on the global-class
 * gotcha). Pure render; reads only the passed StoryState.
 */

import { getCharacter } from '../sim/rpg/characters';
import { golferPreviewSVG } from './apparelArt';
import { shipSVG } from './shipArt';
import { shipById } from '../sim/rpg/ships';
import { prognosticParrotPortraitSVG, carrionCrowPortraitSVG } from './loreArt';
import { activeStoryCaddy } from '../sim/rpg/storyCaddies';
import { crewRoster, allyName } from '../sim/rpg/storyAllies';
import { heraldCrew, type HeraldAgent } from '../sim/rpg/storyHeraldCrew';
import { storyBarName, type StoryState } from '../sim/rpg/story';
import { questOfferable } from '../sim/rpg/storyQuests';
import { otherGolfers } from '../sim/rpg/storyCast';
import { characterQuestOfferable } from '../sim/rpg/characterQuests';
import type { Character } from '../sim/rpg/characters';

/** The Parrot's lore bust, made embeddable at 320×340 inside a positioned `<g transform>` (the Crow's Nest
 *  idiom) so the bird behind the bar is unmistakably the same character. */
function embeddableParrotBust(): string {
  return prognosticParrotPortraitSVG()
    .replace('width="100%"', 'x="0" y="0" width="320" height="340"')
    .replace(/ style="[^"]*"/, '');
}

/** The Carrion Crow bust made embeddable the same way — the Coil's bartender who takes the bar on the Herald
 *  path (GS-story-herald-clubhouse), in place of the Parrot. */
function embeddableCrowBust(): string {
  return carrionCrowPortraitSVG()
    .replace('width="100%"', 'x="0" y="0" width="320" height="340"')
    .replace(/ style="[^"]*"/, '');
}

/** The Coil's OUROBOROS — a serpent swallowing its tail around a dimpled world (the cult's sigil), shown in
 *  the Herald clubhouse viewport where the Warden ship shows a destination planet. Acid-green + venom-violet. */
function ouroborosSigil(): string {
  return `<g transform="translate(180 78)">
      <circle r="34" fill="none" stroke="#7fe0a0" stroke-width="5" opacity="0.85"/>
      <circle r="34" fill="none" stroke="#b060c0" stroke-width="1.4" opacity="0.7"/>
      <circle r="34" fill="none" stroke="#0d0714" stroke-width="5" stroke-dasharray="2 7" opacity="0.5"/>
      <g transform="rotate(-40)"><path d="M34,-9 q14,3 14,9 q0,6 -14,9 q6,-9 0,-18 Z" fill="#7fe0a0"/><circle cx="42" cy="-2" r="1.6" fill="#0d0714"/></g>
      <circle r="14" fill="#b060c0"/><circle cx="-4" cy="-4" r="14" fill="#c98ad8" opacity="0.5"/>
      ${[[-5, -4], [3, -6], [6, 2], [-3, 4], [0, -1], [-7, 1]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#5a1f6a" opacity="0.7"/>`).join('')}
    </g>`;
}

/**
 * The illustrated Mothership interior (SVG backdrop). viewBox 0 0 400 300 (4:3). Hand-placed, byte-stable.
 * Left column: the hangar bay (top) + the locker bank (bottom). Centre-back: the star-chart viewport.
 * Right: the bar with the Parrot. A warm-lit deck across the foreground.
 */
function spaceportArt(shipId: string, herald: boolean): string {
  // GS-story-herald-sanctum: on the dark path the room is not a tinted Mothership bar — it's the Coil's
  // ritual SANCTUM (obsidian walls, serpent pillars, green-flame braziers, a shrine to the World-Eater, a
  // ritual circle on the floor). A wholly separate backdrop; the Warden art below stays byte-identical.
  if (herald) return coilSanctumArt(shipId);
  // On the dark path the Crow tends the bar in the Parrot's place (canon: the Carrion Prophet, his mirror).
  const bust = herald ? embeddableCrowBust() : embeddableParrotBust();
  const bottle = (x: number, col: string, h = 26) =>
    `<g transform="translate(${x} ${118 - h})">
       <rect x="0" y="0" width="7" height="${h}" rx="2.4" fill="${col}"/>
       <rect x="2" y="-4" width="3" height="5" fill="#2a2018"/>
       <rect x="1" y="3" width="1.6" height="${h - 8}" fill="#fff" opacity="0.35"/>
     </g>`;
  // GS-story-herald-clubhouse: on the dark path the Mothership becomes the Coil's — violet-dark walls, an
  // acid-green wash, and an OUROBOROS sigil in the viewport instead of a destination planet. (The Parrot's
  // bar stays: canon has him loyal even if you turn.) The Warden palette is the default, byte-identical.
  const p = herald
    ? { wall1: '#241033', wall2: '#0c0714', floor1: '#241436', floor2: '#0f0818', glow: '#7fe0a0', frame: '#b060c0' }
    : { wall1: '#20293c', wall2: '#121826', floor1: '#2a3346', floor2: '#141a26', glow: '#ffdca0', frame: '#7fd8ff' };
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"
    style="position:absolute;inset:0;">
    <defs>
      <linearGradient id="sc-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.wall1}"/><stop offset="100%" stop-color="${p.wall2}"/>
      </linearGradient>
      <linearGradient id="sc-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.floor1}"/><stop offset="100%" stop-color="${p.floor2}"/>
      </linearGradient>
      <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1030"/><stop offset="55%" stop-color="#1a1444"/><stop offset="100%" stop-color="#2a1050"/>
      </linearGradient>
      <radialGradient id="sc-neb" cx="38%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#6a4fb0" stop-opacity="0.6"/><stop offset="100%" stop-color="#6a4fb0" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sc-bay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0f1e"/><stop offset="100%" stop-color="#141d34"/>
      </linearGradient>
      <linearGradient id="sc-counter" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6e4a2c"/><stop offset="100%" stop-color="#3a2614"/>
      </linearGradient>
      <radialGradient id="sc-lamp" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="${p.glow}" stop-opacity="0.42"/><stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="sc-port"><rect x="120" y="30" width="120" height="98" rx="7"/></clipPath>
      <clipPath id="sc-hangar"><rect x="8" y="42" width="92" height="96" rx="5"/></clipPath>
    </defs>

    <!-- back wall + panel seams + rivets -->
    <rect width="400" height="228" fill="url(#sc-wall)"/>
    ${[40, 96, 152].map((y) => `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#00000030" stroke-width="1.4"/>`).join('')}
    ${[20, 200, 380].map((x) => [16, 210].map((y) => `<circle cx="${x}" cy="${y}" r="2" fill="#39445c"/>`).join('')).join('')}

    <!-- warm ceiling glow -->
    <ellipse cx="215" cy="150" rx="150" ry="96" fill="url(#sc-lamp)"/>

    <!-- ══ HANGAR BAY (upper-left): open bay onto space, the parked ship ══ -->
    <g>
      <rect x="4" y="38" width="100" height="104" rx="7" fill="#0a0f1e" stroke="#39455f" stroke-width="3"/>
      <g clip-path="url(#sc-hangar)">
        <rect x="8" y="42" width="92" height="96" fill="url(#sc-bay)"/>
        <g fill="#cfe0ff"><circle cx="24" cy="60" r="1"/><circle cx="70" cy="54" r="1.2"/><circle cx="52" cy="78" r="0.9"/><circle cx="86" cy="88" r="1"/><circle cx="30" cy="98" r="1.1"/></g>
        <!-- launch-pad glow + the equipped ship -->
        <ellipse cx="54" cy="122" rx="42" ry="9" fill="#7fd8ff" opacity="0.22"/>
        <ellipse cx="54" cy="122" rx="30" ry="6" fill="none" stroke="#7fd8ff" stroke-width="1" opacity="0.6" stroke-dasharray="4 4"/>
        ${shipSVG(shipId, 54, 108, 1.35)}
      </g>
      <!-- retracted bay-door halves + rail -->
      <rect x="4" y="38" width="10" height="104" fill="#1a2438"/>
      <rect x="94" y="38" width="10" height="104" fill="#1a2438"/>
      <rect x="9" y="34" width="90" height="6" rx="2" fill="#2a3651"/>
      <rect x="9" y="140" width="90" height="6" rx="2" fill="#2a3651"/>
    </g>

    <!-- ══ LOCKER BANK (lower-left) ══ -->
    <g>
      <rect x="8" y="150" width="92" height="72" rx="4" fill="#1b2333" stroke="#33405a" stroke-width="2"/>
      ${[8, 39, 70].map((lx) => `<g>
        <rect x="${lx + 3}" y="154" width="26" height="64" rx="3" fill="#232d40" stroke="#3a4864" stroke-width="1.4"/>
        <rect x="${lx + 6}" y="159" width="20" height="9" rx="1.5" fill="#151c2b"/>
        <circle cx="${lx + 24}" cy="188" r="1.6" fill="#8a97ad"/>
      </g>`).join('')}
      <rect x="8" y="150" width="92" height="6" fill="#2a3651"/>
    </g>

    <!-- ══ STAR-CHART VIEWPORT (centre-back) ══ -->
    <g>
      <rect x="116" y="26" width="128" height="106" rx="9" fill="#0a0d18"/>
      <g clip-path="url(#sc-port)">
        <rect x="120" y="30" width="120" height="98" fill="url(#sc-sky)"/>
        <ellipse cx="176" cy="72" rx="80" ry="56" fill="url(#sc-neb)"/>
        <g fill="#fff">
          <circle cx="140" cy="48" r="1.1"/><circle cx="176" cy="42" r="0.9"/><circle cx="214" cy="52" r="1.2"/>
          <circle cx="150" cy="88" r="1"><animate attributeName="opacity" values="1;0.3;1" dur="3.6s" repeatCount="indefinite"/></circle>
          <circle cx="206" cy="98" r="1"/><circle cx="230" cy="76" r="1.1"/><circle cx="132" cy="110" r="1"/>
          <circle cx="196" cy="116" r="1.2"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.9s" repeatCount="indefinite"/></circle>
        </g>
        ${
          herald
            ? ouroborosSigil()
            : `<!-- a ringed planet ahead: the destination -->
        <g transform="translate(210 108)">
          <circle r="18" fill="#d8a24a"/><circle cx="-6" cy="-6" r="18" fill="#e8bd6e" opacity="0.5"/>
          <ellipse rx="30" ry="8" fill="none" stroke="#ffe6a6" stroke-width="2.6" transform="rotate(-18)" opacity="0.85"/>
        </g>
        <!-- faint charted route line -->
        <path d="M132,120 Q168,96 210,108" fill="none" stroke="#7fd8ff" stroke-width="1" opacity="0.55" stroke-dasharray="3 4"/>`
        }
      </g>
      <rect x="116" y="26" width="128" height="106" rx="9" fill="none" stroke="#3a475f" stroke-width="4"/>
      <rect x="118" y="28" width="124" height="102" rx="7" fill="none" stroke="${p.frame}" stroke-width="1" opacity="0.35"/>
    </g>

    <!-- ══ BAR + PARROT (right) ══ -->
    <g>
      <!-- neon sign -->
      <ellipse cx="326" cy="46" rx="70" ry="15" fill="#7fe0a0" opacity="0.12"/>
      <rect x="266" y="34" width="120" height="26" rx="6" fill="#0d1512" stroke="#274a38" stroke-width="1.4"/>
      <text x="326" y="52" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="13" fill="#d6ffe6">The Parrot's Perch</text>
      <!-- back-bar shelf + glowing bottles -->
      <rect x="258" y="70" width="136" height="52" rx="3" fill="#241a12"/>
      <rect x="258" y="70" width="136" height="52" rx="3" fill="none" stroke="#3f2b18" stroke-width="1.6"/>
      <rect x="262" y="99" width="128" height="3" fill="#4a3520"/>
      ${bottle(272, '#7fe0a0', 24)}${bottle(288, '#e8c25a', 20)}${bottle(304, '#6ab6ff', 26)}${bottle(356, '#ff6b6b', 22)}${bottle(372, '#4fd8c8', 24)}
      <!-- the Parrot behind the counter (his lore bust) -->
      <g transform="translate(300 78) scale(0.30)">${bust}</g>
      <!-- bar counter -->
      <rect x="252" y="150" width="146" height="12" rx="4" fill="#8a6034"/>
      <rect x="252" y="150" width="146" height="4" rx="2" fill="#b9884a"/>
      <rect x="256" y="162" width="140" height="30" fill="url(#sc-counter)"/>
      <!-- a full glass left for you -->
      <g transform="translate(300 150)"><path d="M-6 -14 L6 -14 L4 0 L-4 0 Z" fill="#7fe0a0" opacity="0.85"/><ellipse cx="0" cy="0" rx="5" ry="1.6" fill="#0c0906"/></g>
    </g>

    <!-- ══ DECK ══ -->
    <rect x="0" y="222" width="400" height="78" fill="url(#sc-floor)"/>
    <line x1="0" y1="222" x2="400" y2="222" stroke="#0c111c" stroke-width="3"/>
    ${[40, 110, 180, 250, 320, 390].map((x) => `<line x1="${x}" y1="222" x2="${x - 26}" y2="300" stroke="#00000033" stroke-width="1.3"/>`).join('')}
    <ellipse cx="200" cy="250" rx="150" ry="15" fill="#ffd98a" opacity="0.05"/>
  </svg>`;
}

/** The Coil's coiled-serpent-in-a-ring SIGIL, `r` px, centred at (0,0). Reused on banners, the back wall,
 *  and the floor ritual circle. `a` scales opacity. */
function coilSigil(r: number, col = '#7fe0a0', a = 1): string {
  return `<g opacity="${a}">
    <circle r="${r}" fill="none" stroke="${col}" stroke-width="${r * 0.09}" opacity="0.8"/>
    <path d="M0,${-r * 0.62} A ${r * 0.62} ${r * 0.62} 0 1 1 ${-r * 0.44},${r * 0.44}"
      fill="none" stroke="${col}" stroke-width="${r * 0.13}" stroke-linecap="round"/>
    <circle cx="${-r * 0.44}" cy="${r * 0.44}" r="${r * 0.11}" fill="${col}"/>
    <circle cx="0" cy="${-r * 0.62}" r="${r * 0.16}" fill="${col}"/>
    <circle cx="${r * 0.05}" cy="${-r * 0.62}" r="${r * 0.07}" fill="#0a0410"/>
  </g>`;
}

/** A green ritual FLAME, `s` px tall, flickering (candle / brazier). */
function greenFlame(x: number, y: number, s: number, seed = 0): string {
  return `<g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="${s * 0.2}" rx="${s * 0.9}" ry="${s * 0.4}" fill="#7fe0a0" opacity="0.16">
      <animate attributeName="opacity" values="0.1;0.24;0.1" dur="${2 + (seed % 3) * 0.4}s" repeatCount="indefinite"/></ellipse>
    <path d="M0,${-s} C ${s * 0.5},${-s * 0.4} ${s * 0.35},${s * 0.2} 0,${s * 0.2} C ${-s * 0.35},${s * 0.2} ${-s * 0.5},${-s * 0.4} 0,${-s} Z" fill="#4fe08a">
      <animate attributeName="d" dur="${0.7 + (seed % 4) * 0.13}s" repeatCount="indefinite"
        values="M0,${-s} C ${s * 0.5},${-s * 0.4} ${s * 0.35},${s * 0.2} 0,${s * 0.2} C ${-s * 0.35},${s * 0.2} ${-s * 0.5},${-s * 0.4} 0,${-s} Z;M0,${-s * 0.82} C ${s * 0.42},${-s * 0.4} ${s * 0.3},${s * 0.2} 0,${s * 0.2} C ${-s * 0.3},${s * 0.2} ${-s * 0.46},${-s * 0.3} 0,${-s * 0.82} Z;M0,${-s} C ${s * 0.5},${-s * 0.4} ${s * 0.35},${s * 0.2} 0,${s * 0.2} C ${-s * 0.35},${s * 0.2} ${-s * 0.5},${-s * 0.4} 0,${-s} Z"/></path>
    <path d="M0,${-s * 0.6} C ${s * 0.24},${-s * 0.28} ${s * 0.18},${s * 0.12} 0,${s * 0.12} C ${-s * 0.18},${s * 0.12} ${-s * 0.24},${-s * 0.28} 0,${-s * 0.6} Z" fill="#d6ffe6"/>
  </g>`;
}

/**
 * The COIL SANCTUM (GS-story-herald-sanctum) — the Herald-path clubhouse backdrop. Same zone geometry as the
 * Mothership (so the hotspots + figures line up: hangar upper-left, reliquary lower-left, shrine centre, bar
 * right, deck foreground) but dressed as a cult's ritual lair: obsidian walls carved with a great ouroboros,
 * serpent pillars flanking a shrine to the World-Eater, green-flame braziers, cult banners, and a glowing
 * ritual circle inlaid in the stone floor. Hand-placed, byte-stable; own `cs-*` gradient ids.
 */
function coilSanctumArt(shipId: string): string {
  const bust = embeddableCrowBust();
  const jar = (x: number, col: string, h = 24): string =>
    `<g transform="translate(${x} ${116 - h})">
       <rect x="0" y="0" width="9" height="${h}" rx="3" fill="${col}" opacity="0.5"/>
       <rect x="0" y="0" width="9" height="${h}" rx="3" fill="none" stroke="#3a5a48" stroke-width="0.8"/>
       <rect x="1.5" y="-3" width="6" height="4" rx="1" fill="#2a2018"/>
       <circle cx="4.5" cy="${h * 0.55}" r="2.2" fill="#d6ffe6" opacity="0.7"/>
     </g>`;
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"
    style="position:absolute;inset:0;">
    <defs>
      <linearGradient id="cs-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1c0e2c"/><stop offset="60%" stop-color="#100720"/><stop offset="100%" stop-color="#05030a"/>
      </linearGradient>
      <linearGradient id="cs-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#160c22"/><stop offset="100%" stop-color="#070410"/>
      </linearGradient>
      <radialGradient id="cs-ceil" cx="50%" cy="0%" r="95%">
        <stop offset="0%" stop-color="#7fe0a0" stop-opacity="0.22"/><stop offset="100%" stop-color="#7fe0a0" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="cs-pillar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#0a0614"/><stop offset="45%" stop-color="#2a1740"/><stop offset="100%" stop-color="#0a0614"/>
      </linearGradient>
      <radialGradient id="cs-sclera" cx="42%" cy="40%" r="72%">
        <stop offset="0%" stop-color="#eafff0"/><stop offset="40%" stop-color="#b6e6a0"/>
        <stop offset="78%" stop-color="#6a9a4a"/><stop offset="100%" stop-color="#2a3618"/>
      </radialGradient>
      <radialGradient id="cs-iris" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#8fffbe"/><stop offset="55%" stop-color="#2fae6a"/>
        <stop offset="88%" stop-color="#0c3a22"/><stop offset="100%" stop-color="#041a10"/>
      </radialGradient>
      <linearGradient id="cs-stone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a1a3a"/><stop offset="100%" stop-color="#140a20"/>
      </linearGradient>
      <clipPath id="cs-port"><rect x="120" y="30" width="120" height="98" rx="7"/></clipPath>
      <clipPath id="cs-hangar"><rect x="8" y="42" width="92" height="96" rx="5"/></clipPath>
    </defs>

    <!-- obsidian back wall + carved vertical grooves -->
    <rect width="400" height="228" fill="url(#cs-wall)"/>
    ${[60, 140, 260, 340].map((x) => `<rect x="${x}" y="0" width="6" height="228" fill="#00000040"/><rect x="${x + 6}" y="0" width="1.5" height="228" fill="#3a2456" opacity="0.5"/>`).join('')}
    <!-- a great ouroboros etched into the wall behind the shrine -->
    <g transform="translate(180 96)">${coilSigil(84, '#5a3f7a', 0.4)}</g>
    <ellipse cx="200" cy="120" rx="180" ry="110" fill="url(#cs-ceil)"/>

    <!-- hanging cult banners -->
    ${[
      { x: 118, y: 8 },
      { x: 274, y: 8 },
    ]
      .map(
        (b) => `<g transform="translate(${b.x} ${b.y})">
        <path d="M0,0 L26,0 L26,40 L13,34 L0,40 Z" fill="#1a0e2a" stroke="#4a2f6a" stroke-width="1"/>
        <g transform="translate(13 18)">${coilSigil(8, '#7fe0a0', 0.85)}</g></g>`,
      )
      .join('')}

    <!-- SERPENT PILLARS flanking the shrine -->
    ${[104, 250].map(
      (x) => `<g>
      <rect x="${x}" y="20" width="18" height="208" fill="url(#cs-pillar)"/>
      <rect x="${x}" y="20" width="18" height="6" fill="#3a2456"/>
      <rect x="${x - 2}" y="18" width="22" height="6" rx="2" fill="#2a1740"/>
      <path d="M${x + 9},30 q10,20 -3,40 q-13,20 3,40 q13,20 -3,40 q-10,18 3,36" fill="none" stroke="#4fe08a" stroke-width="2.4" opacity="0.55"/>
      <circle cx="${x + 9}" cy="30" r="3.4" fill="#4fe08a" opacity="0.8"/>
      <circle cx="${x + 8}" cy="29.5" r="1.1" fill="#0a0410"/>
      ${greenFlame(x + 9, 16, 7, x)}</g>`,
    ).join('')}

    <!-- ══ HANGAR BAY (upper-left) — a dark launch maw ══ -->
    <g>
      <rect x="4" y="38" width="100" height="104" rx="7" fill="#07040e" stroke="#3a2456" stroke-width="3"/>
      <g clip-path="url(#cs-hangar)">
        <rect x="8" y="42" width="92" height="96" fill="#08040f"/>
        <g fill="#9fe0c0"><circle cx="24" cy="60" r="1"/><circle cx="70" cy="54" r="1.2"/><circle cx="52" cy="78" r="0.9"/><circle cx="86" cy="88" r="1"/></g>
        <ellipse cx="54" cy="122" rx="42" ry="9" fill="#7fe0a0" opacity="0.22"/>
        <ellipse cx="54" cy="122" rx="30" ry="6" fill="none" stroke="#7fe0a0" stroke-width="1" opacity="0.6" stroke-dasharray="4 4"/>
        ${shipSVG(shipId, 54, 108, 1.35)}
      </g>
      <!-- fanged bay frame -->
      <path d="M4,38 L104,38 L98,48 L92,40 L84,50 L76,40 L68,50 L60,40 L52,50 L44,40 L36,50 L28,40 L20,50 L12,40 L4,50 Z" fill="#0a0614" opacity="0.85"/>
    </g>

    <!-- ══ RELIQUARY (lower-left) — stone niches with relics, not lockers ══ -->
    <g>
      <rect x="8" y="150" width="92" height="72" rx="4" fill="url(#cs-stone)" stroke="#3a2456" stroke-width="2"/>
      ${[8, 39, 70].map((lx, i) => `<g>
        <rect x="${lx + 3}" y="154" width="26" height="64" rx="12" fill="#0c0618" stroke="#4a2f6a" stroke-width="1.4"/>
        <ellipse cx="${lx + 16}" cy="212" rx="11" ry="3" fill="#7fe0a0" opacity="0.12"/>
        ${
          i === 0
            ? `<g transform="translate(${lx + 16} 190)"><circle r="7" fill="#d8d2c0"/><circle cx="-2.5" cy="-1" r="1.6" fill="#0a0410"/><circle cx="2.5" cy="-1" r="1.6" fill="#0a0410"/><rect x="-4" y="4" width="8" height="3" fill="#0a0410"/></g>` // a skull
            : i === 1
              ? `<g transform="translate(${lx + 16} 188)">${coilSigil(9, '#7fe0a0', 0.9)}</g>` // a coil idol
              : `<g transform="translate(${lx + 16} 186)"><path d="M-4,16 q-3,-16 4,-24 q7,8 4,24 Z" fill="#3a5a48" opacity="0.7"/><circle cx="0" cy="0" r="2.4" fill="#d6ffe6" opacity="0.7"/></g>` // a specimen
        }
      </g>`).join('')}
      <rect x="8" y="150" width="92" height="6" fill="#3a2456"/>
    </g>

    <!-- ══ SHRINE TO THE WORLD-EATER (centre) — a great serpent eye in a stone arch ══ -->
    <g>
      <path d="M112,132 L112,58 Q112,20 180,20 Q248,20 248,58 L248,132 Z" fill="#0c0618" stroke="#3a2456" stroke-width="4"/>
      <path d="M118,130 L118,58 Q118,26 180,26 Q242,26 242,58 L242,130 Z" fill="none" stroke="#7a4aa0" stroke-width="1" opacity="0.5"/>
      <g clip-path="url(#cs-port)">
        <rect x="120" y="30" width="120" height="98" fill="#0a0416"/>
        ${ouroborosSigil()}
      </g>
      <!-- the serpent eye at the shrine's heart (GS-story-herald-eye: a creepy, sunken, bloodshot,
           blinking reptilian eye — the World-Eater watching through the shrine) -->
      <g transform="translate(180 78)">
        <!-- sunken bony socket + orbital ridge shadow -->
        <ellipse rx="42" ry="27" fill="#050208"/>
        <path d="M-40,-6 Q-30,-24 0,-25 Q30,-24 40,-6" fill="none" stroke="#2a1740" stroke-width="4" opacity="0.8"/>
        <path d="M-38,7 Q-20,22 0,22 Q20,22 38,7" fill="none" stroke="#180c26" stroke-width="5"/>
        <!-- sickly mottled sclera -->
        <ellipse rx="33" ry="18.5" fill="url(#cs-sclera)"/>
        <ellipse cx="10" cy="4" rx="7" ry="4" fill="#7a9a4a" opacity="0.4"/>
        <ellipse cx="-14" cy="-3" rx="4" ry="3" fill="#5a7a3a" opacity="0.35"/>
        <!-- bloodshot veins creeping from the corners -->
        <g stroke="#a83848" stroke-width="0.9" fill="none" opacity="0.75" stroke-linecap="round">
          <path d="M-33,0 q10,-3 16,-6 q4,-2 5,-5"/><path d="M-33,2 q12,2 18,1"/><path d="M-31,5 q9,4 15,3"/>
          <path d="M33,0 q-10,-4 -16,-6"/><path d="M33,3 q-12,3 -18,2"/><path d="M31,6 q-9,4 -14,2"/>
        </g>
        <!-- iris + vertical slit pupil that dilates (unsettling) -->
        <ellipse rx="16" ry="16" fill="url(#cs-iris)"/>
        <ellipse rx="16" ry="16" fill="none" stroke="#0a2a18" stroke-width="1.2"/>
        <ellipse rx="4.5" ry="15" fill="#020104">
          <animate attributeName="rx" values="4.5;7;3.5;4.5" dur="7s" repeatCount="indefinite"/>
          <animate attributeName="ry" values="15;12;15.5;15" dur="7s" repeatCount="indefinite"/>
        </ellipse>
        <ellipse rx="1.4" ry="10" fill="#7fe0a0" opacity="0.45"><animate attributeName="ry" values="10;7;10" dur="4s" repeatCount="indefinite"/></ellipse>
        <!-- cold pinpoint glint -->
        <circle cx="-6" cy="-7" r="1.6" fill="#eafff0" opacity="0.8"/>
        <!-- an ichor tear creeping from the lower lid -->
        <path d="M6,17 q1,10 -1,20 q-2,5 1,9" stroke="#4fe08a" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round">
          <animate attributeName="opacity" values="0.2;0.6;0.2" dur="5s" repeatCount="indefinite"/></path>
        <!-- upper + lower LIDS that snap shut in a slow blink -->
        <ellipse rx="34" ry="19" fill="#0c0618">
          <animate attributeName="ry" values="0;0;0;0;19;0" keyTimes="0;0.5;0.8;0.9;0.95;1" dur="7s" repeatCount="indefinite"/>
        </ellipse>
        <path d="M-40,-6 Q-30,-24 0,-25 Q30,-24 40,-6 Q20,-14 0,-14 Q-20,-14 -40,-6 Z" fill="#0c0618"/>
      </g>
      <!-- altar ledge with candles + wax drips -->
      <rect x="120" y="128" width="120" height="9" fill="#241436"/>
      <rect x="120" y="128" width="120" height="3" fill="#3a2456"/>
      ${[134, 150, 210, 226].map((cx, i) => `<rect x="${cx}" y="120" width="4" height="9" fill="#e6dcc4" opacity="0.85"/>${greenFlame(cx + 2, 118, 5, i)}`).join('')}
      ${[128, 168, 200, 236].map((cx) => `<path d="M${cx},137 q1.5,6 0,9" stroke="#3a2456" stroke-width="1.4" fill="none"/>`).join('')}
    </g>

    <!-- ══ THE CROW'S NEST (right) — a dark ritual bar ══ -->
    <g>
      <ellipse cx="326" cy="46" rx="70" ry="15" fill="#7fe0a0" opacity="0.14"/>
      <rect x="266" y="34" width="120" height="26" rx="6" fill="#0a0512" stroke="#3a5a48" stroke-width="1.4"/>
      <text x="326" y="52" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="14" fill="#a6ffcf">The Crow's Nest</text>
      <!-- shelf of specimen jars -->
      <rect x="258" y="70" width="136" height="52" rx="3" fill="#120a1e"/>
      <rect x="258" y="70" width="136" height="52" rx="3" fill="none" stroke="#3a2456" stroke-width="1.6"/>
      <rect x="262" y="99" width="128" height="3" fill="#2a1a3a"/>
      ${jar(272, '#7fe0a0', 24)}${jar(288, '#9a6bd0', 20)}${jar(304, '#4fd8c8', 26)}${jar(356, '#c05a8a', 22)}${jar(372, '#6fe0a0', 24)}
      <g transform="translate(300 78) scale(0.30)">${bust}</g>
      <!-- obsidian counter -->
      <rect x="252" y="150" width="146" height="12" rx="4" fill="#241436"/>
      <rect x="252" y="150" width="146" height="4" rx="2" fill="#3a2456"/>
      <rect x="256" y="162" width="140" height="30" fill="url(#cs-stone)"/>
      <g transform="translate(300 150)"><path d="M-6 -14 L6 -14 L4 0 L-4 0 Z" fill="#7fe0a0" opacity="0.85"/><ellipse cx="0" cy="0" rx="5" ry="1.6" fill="#0c0906"/></g>
    </g>

    <!-- ══ DECK — dark stone flags + a glowing ritual circle ══ -->
    <rect x="0" y="222" width="400" height="78" fill="url(#cs-floor)"/>
    <line x1="0" y1="222" x2="400" y2="222" stroke="#050208" stroke-width="3"/>
    ${[40, 110, 180, 250, 320, 390].map((x) => `<line x1="${x}" y1="222" x2="${x - 26}" y2="300" stroke="#00000040" stroke-width="1.3"/>`).join('')}
    <g transform="translate(200 264)">
      <ellipse rx="150" ry="26" fill="#7fe0a0" opacity="0.06"/>
      ${coilSigil(30, '#7fe0a0', 0.5)}
      <ellipse rx="46" ry="14" fill="none" stroke="#4fe08a" stroke-width="0.8" opacity="0.4"/>
    </g>
  </svg>`;
}

/** A tap hotspot over the scene: a label chip anchored to a rectangular zone, brightening on hover. The zone
 *  itself is near-transparent (the SVG art carries the look); the chip names where it goes. */
function hotspot(
  action: object,
  label: string,
  rect: { l: number; t: number; w: number; h: number },
  aria: string,
  cornerLabel: 'top' | 'bottom' = 'bottom',
): string {
  return `<button class="gs-sclub-hot" data-action='${JSON.stringify(action)}' aria-label="${aria}"
    style="left:${rect.l}%;top:${rect.t}%;width:${rect.w}%;height:${rect.h}%;">
    <span class="gs-sclub-lab gs-sclub-lab--${cornerLabel}">${label}</span>
  </button>`;
}

/**
 * The full interactive Mothership clubhouse scene: the illustrated room, its four tap hotspots (star chart /
 * hangar / locker / bar), your golfer standing on the deck, and — if one is on the bag — your active caddy at
 * your side. Container-query sized so the figures scale with the room. Reads only the passed StoryState.
 */
export function spaceportSceneHTML(story: StoryState): string {
  const ch = getCharacter(story.characterId);
  const ship = shipById(story.equippedShipId);
  const shipName = ship?.name ?? 'Station Wagon';
  const figure = ch
    ? golferPreviewSVG(undefined, undefined, undefined, {
        skin: ch.style.skin,
        shirtBase: ch.style.shirt,
        capColor: ch.style.cap,
        hair: ch.style.hair,
        uid: `sclub${ch.id.replace(/[^a-z0-9]/gi, '')}`,
        w: 72,
        h: 210,
      })
    : '';
  const activeCaddyId = activeStoryCaddy(story);
  const herald = story.alignment === 'herald';

  // Your golfer, feet-anchored on the deck, centre-front. Tap → your locker (change your bag & gear).
  const playerBtn = ch
    ? `<button class="gs-sclub-golfer" data-action='${JSON.stringify({ type: 'openStoryLocker' })}'
        aria-label="You — ${ch.name}. Open your locker."
        style="left:44%;top:97%;width:15cqw;">
        <span class="gs-sclub-hint">You ★</span>
        <span class="gs-sclub-shadow" style="background:radial-gradient(ellipse at 50% 50%, ${ch.style.cap}66, #0000 70%);"></span>
        ${figure}
        <span class="gs-sclub-plate">${ch.shortName} ★</span>
      </button>`
    : '';

  // GS-story-crew-scene / GS-story-herald-clubhouse: the crew stand around the clubhouse. On the WARDEN /
  // undecided path that's your recruited caddies (the active one at your side, "on the bag"). On the HERALD
  // path it's the Coil's inner circle instead (Voss, Venoma, Ouros, Ecdysis) — your dark-path "allies".
  let crewStandees: string;
  if (herald) {
    const agents = heraldCrew(story);
    // GS-story-quality: the Coil circle VOLUNTEER as your caddies — the one on the bag (activeCaddyId) stands
    // marked at your side; the rest gather along the deck.
    crewStandees = agents
      .slice(0, HERALD_SPOTS.length)
      .map((a, i) => heraldStandee(a, HERALD_SPOTS[i]!, a.id === activeCaddyId))
      .join('');
  } else {
    const others = crewRoster(story).filter((id) => id !== activeCaddyId);
    const active = activeCaddyId ? crewStandee(activeCaddyId, { left: 58, top: 88 }, true, questOfferable(story, activeCaddyId)) : '';
    crewStandees =
      others
        .slice(0, CREW_SPOTS.length)
        .map((id, i) => crewStandee(id, CREW_SPOTS[i]!, false, questOfferable(story, id)))
        .join('') + active;
  }

  // GS-story-cast: your three friends — the OTHER playable golfers — travel with you and gather in the
  // clubhouse (mid-deck, in front of the bar), each tappable → their friend talk card. On the HERALD path
  // they've turned away from you (they stay Wardens, and become your Ch.5 opponents), so the sanctum shows
  // none of them — their absence IS the betrayal. Only past the prologue (chapter ≥ 1), like the crew.
  const friendStandees =
    !herald && story.chapter >= 1
      ? otherGolfers(story)
          .slice(0, FRIEND_SPOTS.length)
          .map((ch, i) => friendStandee(ch, FRIEND_SPOTS[i]!, characterQuestOfferable(story, ch.id)))
          .join('')
      : '';

  return `${SPACEPORT_STYLE}
    <div class="gs-sclub-scene${herald ? ' gs-sclub-scene--herald' : ''}">
      ${spaceportArt(story.equippedShipId, herald)}
      ${hotspot({ type: 'openStoryMap' }, '🗺 Set course', { l: 28, t: 8, w: 34, h: 36 }, 'Set course — the star chart', 'top')}
      ${hotspot({ type: 'openStoryShipyard' }, `🚀 Hangar`, { l: 1, t: 12, w: 25, h: 36 }, `Hangar — fly your fleet (${shipName})`, 'top')}
      ${hotspot({ type: 'openStoryLocker' }, '🎒 Locker', { l: 1, t: 49, w: 25, h: 26 }, 'Locker — build your bag and gear', 'bottom')}
      ${hotspot({ type: 'openStoryBar' }, `🍺 ${storyBarName(herald)}`, { l: 63, t: 10, w: 36, h: 40 }, `${storyBarName(herald)} — talk to the ${herald ? 'Crow' : 'Parrot'}`, 'top')}
      ${friendStandees}
      ${crewStandees}
      ${playerBtn}
    </div>`;
}

/** GS-story-cast: mid-deck spots where your three friend golfers gather (in front of the bar, behind the
 *  lower crew). Fixed (byte-stable) so identity is stable; clear of the player, the door hotspots + the
 *  active caddy at your side. */
const FRIEND_SPOTS: { left: number; top: number }[] = [
  { left: 34, top: 71 },
  { left: 50, top: 67 },
  { left: 66, top: 72 },
];

/** One friend golfer as a feet-anchored standee (their signature look via `golferPreviewSVG`, drawn a touch
 *  smaller so they read further back on the deck). Tap → their friend talk card (`storyInspectAlly`, widened
 *  in the reducer to accept a playable-golfer id). */
function friendStandee(ch: Character, spot: { left: number; top: number }, hasQuest = false): string {
  const figure = golferPreviewSVG(undefined, undefined, undefined, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    capColor: ch.style.cap,
    hair: ch.style.hair,
    uid: `sclubfriend${ch.id.replace(/[^a-z0-9]/gi, '')}`,
    w: 60,
    h: 175,
  });
  // GS-story-charquests: a gift marker bobs over a friend whose signature club is ready to claim.
  const questMark = hasQuest ? `<span class="gs-sclub-questmark" aria-hidden="true">🎁</span>` : '';
  return `<button class="gs-sclub-golfer gs-sclub-friend"
      data-action='${JSON.stringify({ type: 'storyInspectAlly', caddyId: ch.id })}'
      aria-label="Talk to ${ch.name}, your friend${hasQuest ? ' — they have a gift for you' : ''}"
      style="left:${spot.left}%;top:${spot.top}%;width:11cqw;">
      ${questMark}
      <span class="gs-sclub-shadow" style="background:radial-gradient(ellipse at 50% 50%, ${ch.style.cap}55, #0000 70%);"></span>
      ${figure}
      <span class="gs-sclub-plate gs-sclub-plate--friend">${ch.shortName}</span>
    </button>`;
}

/** Herald crew deck spots — Voss (index 0) at your side, the rest gathered along the deck. */
const HERALD_SPOTS: { left: number; top: number }[] = [
  { left: 62, top: 85 }, // Voss — your mentor, at your side
  { left: 31, top: 91 },
  { left: 78, top: 82 },
  { left: 90, top: 91 },
];

/** One Coil agent as a feet-anchored standee (their lore portrait, tinted). Tap → their Herald talk card. */
function heraldStandee(agent: HeraldAgent, spot: { left: number; top: number }, active: boolean): string {
  const name = agent.name.replace(/^.*?["']([^"']+)["'].*$/, '$1') || agent.name.split(' ')[0];
  const short = agent.name.includes('"') ? name : agent.name.split(' ')[0];
  return `<button class="gs-sclub-caddy gs-sclub-caddy--herald${active ? ' gs-sclub-caddy--on' : ''}"
      data-action='${JSON.stringify({ type: 'storyInspectAlly', caddyId: agent.id })}'
      aria-label="Speak with ${agent.name}${active ? ', on your bag' : ''}"
      style="left:${spot.left}%;top:${spot.top}%;">
      <span class="gs-sclub-cav"${agent.tint ? ` style="filter:${agent.tint};"` : ''}><canvas class="gs-caddycv" data-caddy="${agent.id}" width="260" height="260"></canvas></span>
      <span class="gs-sclub-cplate">${active ? `🎒 ${short}` : short}</span>
    </button>`;
}

/** Deck spots (left%, top%) where non-active crew allies stand around the clubhouse — an arc across the deck
 *  that avoids the centre-front player and the door hotspots. Fixed (byte-stable), so identity is stable. */
const CREW_SPOTS: { left: number; top: number }[] = [
  { left: 24, top: 93 }, // left-front, clear of the locker label + the far-left doors
  { left: 42, top: 83 }, // mid-left
  { left: 74, top: 93 }, // in front of the bar (right of the player + active)
  { left: 87, top: 83 },
  { left: 96, top: 94 },
];

/** One crew ally as a feet-anchored portrait standee on the deck. Tap → their ally talk card. The active
 *  caddy (on the bag) gets a pink ring + a 🎒 plate; the rest get a plain name plate. */
function crewStandee(caddyId: string, spot: { left: number; top: number }, active: boolean, hasQuest = false): string {
  const name = allyName(caddyId).split(' ')[0];
  // GS-story-quest-icon: a bobbing quest marker floats over a caddy who has an offerable quest right now.
  const questMark = hasQuest ? `<span class="gs-sclub-questmark" aria-hidden="true">❗</span>` : '';
  return `<button class="gs-sclub-caddy${active ? ' gs-sclub-caddy--on' : ''}"
      data-action='${JSON.stringify({ type: 'storyInspectAlly', caddyId })}'
      aria-label="Talk to ${allyName(caddyId)}${active ? ', on your bag' : ''}${hasQuest ? ' — they have a quest for you' : ''}"
      style="left:${spot.left}%;top:${spot.top}%;">
      ${questMark}
      <span class="gs-sclub-cav"><canvas class="gs-caddycv" data-caddy="${caddyId}" width="260" height="260"></canvas></span>
      <span class="gs-sclub-cplate">${active ? `🎒 ${name}` : name}</span>
    </button>`;
}

const SPACEPORT_STYLE = `<style>
  .gs-sclub-scene{container-type:inline-size;position:relative;width:100%;aspect-ratio:4/3;max-width:620px;
    margin:0 auto;border:1px solid #2a3346;border-radius:16px;overflow:hidden;background:#0f1420;
    box-shadow:0 8px 30px -12px #000a;}
  .gs-sclub-hot{position:absolute;background:none;border:1px solid transparent;border-radius:12px;padding:0;
    cursor:pointer;color:inherit;display:flex;align-items:flex-end;justify-content:center;
    transition:background .15s ease,border-color .15s ease,box-shadow .15s ease;}
  .gs-sclub-hot:hover,.gs-sclub-hot:focus-visible{outline:none;background:#7fd8ff14;border-color:#7fd8ff66;
    box-shadow:inset 0 0 24px #7fd8ff22;}
  .gs-sclub-lab{position:absolute;left:50%;transform:translateX(-50%);font-size:clamp(10px,2.6cqw,14px);
    font-weight:800;white-space:nowrap;background:#0b1018d8;color:#eaf2ff;padding:3px 10px;border-radius:20px;
    border:1px solid #33465f;box-shadow:0 2px 6px #0007;pointer-events:none;}
  .gs-sclub-lab--bottom{bottom:6%;}
  .gs-sclub-lab--top{top:5%;}
  .gs-sclub-hot:hover .gs-sclub-lab,.gs-sclub-hot:focus-visible .gs-sclub-lab{background:#123049;border-color:#7fd8ff;color:#dff3ff;}
  .gs-sclub-golfer{position:absolute;background:none;border:0;padding:0;cursor:pointer;color:inherit;
    text-align:center;transform:translate(-50%,-100%);transform-origin:bottom center;
    filter:drop-shadow(0 7px 6px #0009);transition:filter .15s ease,translate .15s ease;z-index:20;}
  .gs-sclub-golfer svg{width:100%;height:auto;display:block;}
  .gs-sclub-golfer:hover,.gs-sclub-golfer:focus-visible{translate:0 -3px;outline:none;filter:drop-shadow(0 10px 9px #000b) brightness(1.07);}
  .gs-sclub-golfer:hover .gs-sclub-hint,.gs-sclub-golfer:focus-visible .gs-sclub-hint{opacity:1;}
  .gs-sclub-shadow{display:block;width:80%;height:1.4cqw;min-height:5px;margin:0 auto -1cqw;border-radius:50%;}
  .gs-sclub-hint{position:absolute;top:-1.6cqw;left:50%;transform:translateX(-50%);font-size:clamp(8px,2cqw,11px);
    font-weight:700;opacity:0;transition:opacity .15s ease;white-space:nowrap;background:#a97b25;color:#2a1a05;
    padding:1px 7px;border-radius:8px;pointer-events:none;}
  .gs-sclub-plate{display:inline-block;margin-top:2px;padding:2px 8px;border-radius:3px;
    background:linear-gradient(180deg,#e8c266,#a97b25);border:1px solid #5c3f12;box-shadow:inset 0 1px 0 #fff6cf,0 1px 2px #0008;
    font-family:Georgia,serif;font-size:clamp(8px,2.1cqw,11.5px);font-weight:800;color:#2a1a05;white-space:nowrap;}
  /* Crew members stand on the deck as FULL-BODY figures (GS-story-figures) — the game's OWN on-course caddy
     art (drawCaddy) + matching robed Coil-agent art (drawCoilAgent), drawn into a per-standee <canvas> by
     the app.ts mount pass (canvas.gs-caddycv[data-caddy]). Feet-anchored so the FEET meet the floor. */
  .gs-sclub-caddy{position:absolute;background:none;border:0;padding:0;cursor:pointer;color:inherit;text-align:center;
    transform:translate(-50%,-100%);z-index:16;transition:transform .15s ease;}
  .gs-sclub-caddy:hover,.gs-sclub-caddy:focus-visible{outline:none;transform:translate(-50%,-100%) scale(1.06);z-index:22;}
  .gs-sclub-caddy--on{z-index:19;}
  .gs-sclub-cav{display:block;width:23cqw;max-width:132px;margin:0 auto -2cqw;filter:drop-shadow(0 4px 4px #000a);}
  .gs-sclub-cav canvas{width:100%;height:auto;display:block;}
  .gs-sclub-caddy--on .gs-sclub-cav{width:26cqw;max-width:150px;filter:drop-shadow(0 5px 5px #000b) drop-shadow(0 0 8px #f0a8c8aa);}
  /* GS-story-quest-icon: a gold quest marker bobbing over a caddy who has a quest to offer. */
  .gs-sclub-questmark{position:absolute;top:-3%;left:50%;font-size:clamp(13px,3.4cqw,20px);line-height:1;
    filter:drop-shadow(0 0 5px #ffd23c) drop-shadow(0 1px 1px #000a);pointer-events:none;z-index:24;
    animation:gs-sclub-qbob 1.25s ease-in-out infinite;}
  @keyframes gs-sclub-qbob{0%,100%{transform:translate(-50%,0);}50%{transform:translate(-50%,-5px);}}
  .gs-sclub-cplate{display:inline-block;margin-top:2px;padding:1px 7px;border-radius:10px;background:#0e141edd;
    border:1px solid #33465f;font-size:clamp(7px,1.8cqw,10px);font-weight:700;color:#cdd8ea;white-space:nowrap;position:relative;z-index:1;}
  .gs-sclub-caddy--on .gs-sclub-cplate{background:#231018ee;border-color:#6a3a52;color:#f0a8c8;}
  /* Herald (Coil) crew — venom-violet glow on the active mentor; violet plate. */
  .gs-sclub-caddy--herald.gs-sclub-caddy--on .gs-sclub-cav{filter:drop-shadow(0 6px 6px #000b) drop-shadow(0 0 8px #b060c0cc);}
  .gs-sclub-caddy--herald .gs-sclub-cplate{background:#1a0f24ee;border-color:#5a3a6a;color:#d6b8e8;}
  /* Herald scene: tint the door labels toward the Coil palette. */
  .gs-sclub-scene--herald .gs-sclub-hot:hover,.gs-sclub-scene--herald .gs-sclub-hot:focus-visible{background:#b060c018;border-color:#b060c066;box-shadow:inset 0 0 24px #7fe0a022;}
  .gs-sclub-scene--herald .gs-sclub-hot:hover .gs-sclub-lab,.gs-sclub-scene--herald .gs-sclub-hot:focus-visible .gs-sclub-lab{background:#2a1236;border-color:#b060c0;color:#ecd8f4;}
  /* GS-story-cast: your three friend golfers gather mid-deck, behind the player + active caddy (lower
     z-index), a touch dimmer so they read "further back"; a cool steel plate marks them apart from the
     gold player/caddy plates. */
  .gs-sclub-friend{z-index:14;filter:drop-shadow(0 5px 5px #0009) brightness(.92) saturate(.9);}
  .gs-sclub-friend:hover,.gs-sclub-friend:focus-visible{z-index:23;filter:drop-shadow(0 9px 8px #000b) brightness(1.05);}
  .gs-sclub-plate--friend{background:linear-gradient(180deg,#5a7fb0,#2f4a6e);border-color:#1b2c42;color:#eaf2ff;
    box-shadow:inset 0 1px 0 #bcd6ff77,0 1px 2px #0008;font-family:inherit;}
</style>`;
