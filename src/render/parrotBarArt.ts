/**
 * The Parrot Bar scene (GS-story-parrot-bar) — "The Crow's Nest", a bespoke SVG cantina aboard the
 * Mothership where the Prognostic Parrot tends bar. House "no downloaded asset" vector language, warm
 * cantina palette against the cold space vista out the porthole (the clubhouse-lounge window idiom). The
 * Parrot himself is the SAME bust as his lore portrait (`prognosticParrotPortraitSVG`), embedded behind
 * the counter so he's unmistakably the same bird — reuse, not a fork.
 *
 * Pure string builder — no DOM, no rng (fixed geometry, camera-proof). Dropped into the screen via
 * innerHTML. The SMIL flickers/twinkles are cosmetic; the screen is a static between-worlds hangout.
 */

import { prognosticParrotPortraitSVG, carrionCrowPortraitSVG } from './loreArt';
import { storyBarName } from '../sim/rpg/story';

/** A lore bust made embeddable: swap the outer `width="100%"` for an explicit 320×340 nested viewport and
 *  drop the block style, so it renders 1:1 inside a positioned `<g transform>`. */
function embeddableBust(svg: string): string {
  return svg.replace('width="100%"', 'x="0" y="0" width="320" height="340"').replace(/ style="[^"]*"/, '');
}

/**
 * The full cantina scene. `viewBox 0 0 720 440`, responsive width. A round porthole onto space (left), a
 * neon sign + a glowing back-bar of bottles (right), a lamp-lit counter, and the barkeep behind it. On the
 * HERALD path (GS-story-herald-clubhouse) the Coil's CROW tends the bar in the Parrot's place, and the neon
 * burns venom-violet instead of acid-green.
 */
export function parrotBarSceneSVG(herald = false): string {
  const bust = embeddableBust(herald ? carrionCrowPortraitSVG() : prognosticParrotPortraitSVG());
  const signCol = herald ? '#b060c0' : '#7fe0a0';
  const signInk = herald ? '#ecd8f4' : '#d6ffe6';
  const barName = storyBarName(herald);
  // A glowing bottle on the back-bar shelf: body + a soft emissive halo + a highlight.
  const bottle = (x: number, col: string, h = 46) => `
    <g transform="translate(${x} ${226 - h})">
      <ellipse cx="7" cy="${h + 4}" rx="16" ry="6" fill="${col}" opacity="0.18"/>
      <rect x="4" y="-8" width="6" height="12" rx="2" fill="#2a2018"/>
      <path d="M0 6 Q0 -2 7 -6 Q14 -2 14 6 L14 ${h} Q14 ${h + 4} 7 ${h + 4} Q0 ${h + 4} 0 ${h} Z" fill="${col}"/>
      <path d="M2 8 L2 ${h - 2}" stroke="#fff" stroke-width="1.4" opacity="0.35" stroke-linecap="round"/>
      <rect x="1.5" y="${h - 18}" width="11" height="10" rx="1.5" fill="#fff" opacity="0.14"/>
    </g>`;

  return `<svg viewBox="0 0 720 440" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${barName} — ${herald ? 'the Crow' : "the Parrot"}'s bar" style="display:block;">
  <defs>
    <linearGradient id="gs-pbar-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#241a12"/>
      <stop offset="60%" stop-color="#1a130d"/>
      <stop offset="100%" stop-color="#0f0a07"/>
    </linearGradient>
    <linearGradient id="gs-pbar-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#101830"/>
      <stop offset="55%" stop-color="#241a44"/>
      <stop offset="100%" stop-color="#3a1e52"/>
    </linearGradient>
    <radialGradient id="gs-pbar-neb" cx="34%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#6a4fb0" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#6a4fb0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-pbar-counter" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6e4a2c"/>
      <stop offset="100%" stop-color="#3a2614"/>
    </linearGradient>
    <radialGradient id="gs-pbar-lamp" cx="50%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#ffdca0" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffdca0" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="gs-pbar-port"><circle cx="168" cy="158" r="108"/></clipPath>
  </defs>

  <!-- ══ wall + floor ══ -->
  <rect x="0" y="0" width="720" height="440" fill="url(#gs-pbar-wall)"/>
  <rect x="0" y="356" width="720" height="84" fill="#0c0906"/>
  <rect x="0" y="356" width="720" height="3" fill="#3a2a1a" opacity="0.6"/>
  <!-- warm rivet trim along the wall (a ship interior) -->
  <g fill="#3a2a1a"><circle cx="30" cy="24" r="3"/><circle cx="690" cy="24" r="3"/><circle cx="30" cy="330" r="3"/><circle cx="690" cy="330" r="3"/></g>

  <!-- ══ porthole onto space (the Mothership window) ══ -->
  <g>
    <circle cx="168" cy="158" r="118" fill="#2a1c10"/>
    <circle cx="168" cy="158" r="112" fill="#140d08"/>
    <g clip-path="url(#gs-pbar-port)">
      <rect x="56" y="46" width="224" height="224" fill="url(#gs-pbar-sky)"/>
      <ellipse cx="150" cy="140" rx="120" ry="90" fill="url(#gs-pbar-neb)"/>
      <!-- stars (a couple twinkle) -->
      <g fill="#fff">
        <circle cx="92" cy="96" r="1.4"><animate attributeName="opacity" values="1;0.3;1" dur="3.4s" repeatCount="indefinite"/></circle>
        <circle cx="130" cy="78" r="1"/><circle cx="196" cy="92" r="1.2"/><circle cx="236" cy="120" r="1"/>
        <circle cx="88" cy="170" r="1"/><circle cx="118" cy="214" r="1.3"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.8s" repeatCount="indefinite"/></circle>
        <circle cx="210" cy="196" r="1"/><circle cx="244" cy="168" r="1.1"/><circle cx="150" cy="60" r="0.9"/>
      </g>
      <!-- a slow shooting star -->
      <line x1="100" y1="90" x2="122" y2="102" stroke="#fff" stroke-width="1" opacity="0">
        <animate attributeName="opacity" values="0;0;0.9;0" dur="6s" repeatCount="indefinite"/>
      </line>
      <!-- the ringed golden planet + a bright moon (the lounge vista) -->
      <g transform="translate(214 208)">
        <circle r="26" fill="#d8a24a"/>
        <circle cx="-8" cy="-8" r="26" fill="#e8bd6e" opacity="0.5"/>
        <ellipse rx="44" ry="11" fill="none" stroke="#ffe6a6" stroke-width="4" transform="rotate(-20)" opacity="0.85"/>
      </g>
      <circle cx="96" cy="118" r="12" fill="#ffe6a6" opacity="0.9"/>
      <circle cx="91" cy="114" r="12" fill="#fff" opacity="0.25"/>
    </g>
    <!-- porthole ring + cross bars + a glass glint -->
    <circle cx="168" cy="158" r="112" fill="none" stroke="#5a3a1f" stroke-width="6"/>
    <circle cx="168" cy="158" r="112" fill="none" stroke="#8a6034" stroke-width="2"/>
    <g stroke="#5a3a1f" stroke-width="5"><line x1="56" y1="158" x2="280" y2="158"/><line x1="168" y1="46" x2="168" y2="270"/></g>
    <g fill="#7a5228"><circle cx="168" cy="46" r="6"/><circle cx="168" cy="270" r="6"/><circle cx="56" cy="158" r="6"/><circle cx="280" cy="158" r="6"/></g>
    <path d="M100 96 Q140 70 190 78" stroke="#fff" stroke-width="4" opacity="0.06" fill="none" stroke-linecap="round"/>
  </g>

  <!-- ══ neon sign (venom-violet on the Herald path) ══ -->
  <g>
    <ellipse cx="500" cy="60" rx="118" ry="26" fill="${signCol}" opacity="0.12">
      <animate attributeName="opacity" values="0.12;0.2;0.12;0.16;0.12" dur="5s" repeatCount="indefinite"/>
    </ellipse>
    <rect x="392" y="38" width="216" height="42" rx="9" fill="#0d1512" stroke="#274a38" stroke-width="1.6"/>
    <g font-family="Georgia,'Times New Roman',serif" font-style="italic" font-weight="800">
      <text x="500" y="67" text-anchor="middle" font-size="${barName.length > 15 ? 21 : 24}" fill="none" stroke="${signCol}" stroke-width="4" stroke-linejoin="round" opacity="0.4">${barName}</text>
      <text x="500" y="67" text-anchor="middle" font-size="${barName.length > 15 ? 21 : 24}" fill="${signInk}">${barName}
        <animate attributeName="opacity" values="1;1;0.7;1;0.9;1" dur="6s" repeatCount="indefinite"/>
      </text>
    </g>
  </g>

  <!-- ══ back-bar shelf + glowing bottles ══ -->
  <g>
    <rect x="360" y="120" width="300" height="112" rx="4" fill="#2a1c10"/>
    <rect x="360" y="120" width="300" height="112" rx="4" fill="none" stroke="#3f2b18" stroke-width="2"/>
    <rect x="366" y="176" width="288" height="5" fill="#4a3520"/>
    <rect x="366" y="226" width="288" height="5" fill="#4a3520"/>
    <!-- a faint mirrored back -->
    <rect x="372" y="128" width="276" height="96" fill="#120c08" opacity="0.7"/>
    ${bottle(392, '#7fe0a0', 48)}${bottle(428, '#e8c25a', 40)}${bottle(462, '#6ab6ff', 52)}
    ${bottle(500, '#ff6b6b', 42)}${bottle(536, '#4fd8c8', 50)}${bottle(576, '#b060c0', 44)}${bottle(614, '#f0b429', 38)}
    <!-- lower-shelf mugs -->
    <g fill="#c9a06a"><rect x="470" y="204" width="16" height="20" rx="2"/><rect x="500" y="206" width="14" height="18" rx="2"/></g>
  </g>

  <!-- ══ hanging lamp over the bar ══ -->
  <g>
    <line x1="330" y1="0" x2="330" y2="60" stroke="#2a1c10" stroke-width="3"/>
    <path d="M310 60 L350 60 L342 82 L318 82 Z" fill="#3a2614"/>
    <path d="M310 60 L350 60 L346 66 L314 66 Z" fill="#5a3a1f"/>
    <ellipse cx="330" cy="90" rx="70" ry="70" fill="url(#gs-pbar-lamp)"/>
    <circle cx="330" cy="82" r="6" fill="#ffdca0"/>
  </g>

  <!-- ══ the Parrot, behind the bar ══ -->
  <g transform="translate(256 92) scale(0.62)">${bust}</g>
  <!-- a polishing rag over his 'wing' resting on the bar (drawn small, near the counter line) -->
  <path d="M300 300 q30 -10 58 2 q-28 8 -58 -2 Z" fill="#cdb89a" opacity="0.9"/>

  <!-- ══ the bar counter (in front of the Parrot) ══ -->
  <g>
    <rect x="52" y="300" width="616" height="20" rx="6" fill="#8a6034"/>
    <rect x="52" y="300" width="616" height="6" rx="3" fill="#b9884a"/>
    <rect x="60" y="320" width="600" height="42" fill="url(#gs-pbar-counter)"/>
    <rect x="60" y="320" width="600" height="42" fill="none" stroke="#2a1a0e" stroke-width="1.5"/>
    <!-- front-panel plank seams -->
    <g stroke="#2a1a0e" stroke-width="1.4" opacity="0.6"><line x1="180" y1="320" x2="180" y2="362"/><line x1="340" y1="320" x2="340" y2="362"/><line x1="500" y1="320" x2="500" y2="362"/></g>
    <!-- two full glasses left on the bar for you -->
    <g transform="translate(150 300)">
      <path d="M-9 -22 L9 -22 L6 0 L-6 0 Z" fill="#7fe0a0" opacity="0.85"/>
      <path d="M-9 -22 L9 -22 L8 -15 L-8 -15 Z" fill="#d6ffe6" opacity="0.6"/>
      <ellipse cx="0" cy="0" rx="7" ry="2" fill="#0c0906"/>
    </g>
    <g transform="translate(590 300)">
      <path d="M-8 -20 L8 -20 L6 0 L-6 0 Z" fill="#e8c25a" opacity="0.85"/>
      <ellipse cx="0" cy="0" rx="6" ry="2" fill="#0c0906"/>
    </g>
  </g>

  <!-- ══ two bar stools, foreground ══ -->
  <g fill="#3a2614" stroke="#221408" stroke-width="1.5">
    <g transform="translate(250 392)">
      <ellipse cx="0" cy="-16" rx="24" ry="8" fill="#5a3a1f"/>
      <rect x="-4" y="-14" width="8" height="42"/>
      <line x1="-16" y1="28" x2="16" y2="28" stroke="#221408" stroke-width="3"/>
    </g>
    <g transform="translate(470 400)">
      <ellipse cx="0" cy="-16" rx="26" ry="9" fill="#5a3a1f"/>
      <rect x="-4" y="-14" width="8" height="46"/>
      <line x1="-18" y1="32" x2="18" y2="32" stroke="#221408" stroke-width="3"/>
    </g>
  </g>
</svg>`;
}
