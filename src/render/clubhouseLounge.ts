/**
 * Clubhouse lounge (GS-clubhouse-lounge) — the interior the four golfers wait in, replacing the old
 * grid of manage-buttons. A cosy bar + fireplace + lounge is painted behind them (self-contained SVG,
 * the house no-asset rule); each golfer stands in the room wearing their own outfit, a brass nameplate
 * at their feet so you can tell who's who across changing looks, and the whole figure is the button to
 * outfit them.
 *
 * Where each golfer stands is chosen by a seeded shuffle of a fixed set of floor "spots", keyed off the
 * finished-run counter (`visit`) — so every time you come home from a run they've milled around to new
 * places, as if they'd been living in there while you were away. Pure, deterministic (Rng, never
 * Math.random) string builder — no DOM, no globals.
 */

import { Rng } from '../sim/rng';
import { golferPreviewSVG } from './apparelArt';

/** One golfer to place in the lounge: identity + the outfit ids resolved by the caller. */
export interface LoungeGolfer {
  id: string;
  shortName: string;
  /** The golfer's signature colour (their cap) — used for the nameplate + a soft grounding glow. */
  capColor: string;
  hatId: string | undefined;
  shirtId: string | undefined;
  pantsId: string | undefined;
  skin: string;
  shirtBase: string;
}

/** A place a golfer can stand: feet anchored at (x%, y%) of the room, scaled for depth. */
interface Spot {
  x: number;
  y: number;
  s: number;
}

/** Fixed floor spots around the lounge — fireplace hearth (left), rug (centre), bar stools (right).
 *  More spots than golfers so which ones sit empty also changes between visits. Front spots (larger y)
 *  are drawn on top via z-index so overlaps read correctly. */
const SPOTS: Spot[] = [
  { x: 29, y: 80, s: 0.86 }, // beside the hearth (clear of the firebox), back
  { x: 37, y: 89, s: 0.99 }, // hearth rug, front
  { x: 48, y: 90, s: 1.02 }, // centre rug, front
  { x: 59, y: 80, s: 0.9 }, // lounge, mid
  { x: 69, y: 73, s: 0.82 }, // bar end, back
  { x: 80, y: 84, s: 0.94 }, // bar stool, front
];

/** Fisher–Yates shuffle of `arr` in place using the seeded Rng (no Math.random). */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** A small engraved brass nameplate, the golfer's name inked in their signature colour. */
function nameplate(name: string, col: string): string {
  return `<span style="display:inline-block;margin-top:2px;padding:2px 8px;border-radius:3px;
    background:linear-gradient(180deg,#e8c266,#a97b25);border:1px solid #5c3f12;
    box-shadow:inset 0 1px 0 #fff6cf,0 1px 2px #0008;font-size:clamp(8px,2.1cqw,11.5px);font-weight:800;letter-spacing:.02em;
    color:${col};text-shadow:0 1px 0 #fff5;white-space:nowrap;font-family:Georgia,'Times New Roman',serif;">
    ${name}</span>`;
}

/** One golfer standing in the room: the outfit preview + nameplate, the whole thing a button that opens
 *  their Clubhouse. Anchored by the feet at the spot; sized in container-query units so the figures scale
 *  WITH the room (never crowding on a narrow phone), the per-spot factor giving a little depth. Front
 *  golfers (larger y) sit on top via z-index. */
function golferAt(g: LoungeGolfer, spot: Spot): string {
  const action = JSON.stringify({ type: 'openClubhouse', characterId: g.id });
  const preview = golferPreviewSVG(g.hatId, g.shirtId, g.pantsId, {
    skin: g.skin,
    shirtBase: g.shirtBase,
    w: 66,
    h: 84,
  });
  const z = Math.round(spot.y * 10);
  // 12.7cqw ≈ the old 66px at the 520px max width; the spot factor scales for depth.
  const w = (12.7 * spot.s).toFixed(2);
  return `<button class="gs-lounge-golfer" data-action='${action}' aria-label="Outfit ${g.shortName}"
    style="position:absolute;left:${spot.x}%;top:${spot.y}%;z-index:${z};width:${w}cqw;
      transform:translate(-50%,-100%);transform-origin:bottom center;
      background:none;border:0;padding:0;cursor:pointer;color:inherit;text-align:center;
      filter:drop-shadow(0 6px 5px #0007);">
    <span class="gs-manage-hint">Outfit ⚙</span>
    <span class="gs-lounge-shadow" style="background:radial-gradient(ellipse at 50% 50%, ${g.capColor}55, #0000 70%);"></span>
    ${preview}
    ${nameplate(g.shortName, g.capColor)}
  </button>`;
}

/** Once-per-screen CSS for the lounge golfers (responsive sizing + hover lift). Scoped to the hall. */
function loungeStyle(): string {
  return `<style>
    .gs-lounge-golfer{transition:filter .15s ease, translate .15s ease;}
    .gs-lounge-golfer svg{width:100%;height:auto;display:block;}
    .gs-lounge-shadow{display:block;width:80%;height:1.4cqw;min-height:5px;margin:0 auto -1cqw;border-radius:50%;}
    .gs-lounge-golfer:hover,.gs-lounge-golfer:focus-visible{
      filter:drop-shadow(0 10px 8px #000a) brightness(1.08);outline:none;translate:0 -3px;}
    .gs-lounge-golfer:hover .gs-manage-hint,.gs-lounge-golfer:focus-visible .gs-manage-hint{opacity:1;}
    .gs-manage-hint{position:absolute;top:-1.8cqw;left:50%;transform:translateX(-50%);
      font-size:clamp(8px,2cqw,11px);font-weight:700;opacity:0;transition:opacity .15s ease;white-space:nowrap;
      background:#000a;color:#ffe6a6;padding:1px 6px;border-radius:8px;pointer-events:none;}
  </style>`;
}

/** The painted lounge interior behind the golfers: warm panelled wall, a stone fireplace with a live
 *  fire on the left, a rug, and a wooden bar with a bottle shelf and pendant lights on the right.
 *  Hand-placed (no rng) so it's stable; a couple of `<animate>` flickers give the fire + lamps life. */
function loungeArt(): string {
  return `<svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice"
      style="position:absolute;inset:0;width:100%;height:100%;">
    <defs>
      <linearGradient id="clWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#33251a"/><stop offset="55%" stop-color="#241a12"/><stop offset="100%" stop-color="#1a120c"/>
      </linearGradient>
      <radialGradient id="clHearth" cx="50%" cy="55%" r="60%">
        <stop offset="0%" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="100%" stop-color="#ffd27a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="clLamp" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="#ffe6a6" stop-opacity="0.6"/><stop offset="100%" stop-color="#ffe6a6" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- wall + wainscot + floor -->
    <rect width="400" height="220" fill="url(#clWall)"/>
    <rect x="0" y="150" width="400" height="70" fill="#3a2a19"/>
    <rect x="0" y="150" width="400" height="4" fill="#1c130b"/>
    <g stroke="#1c130b" stroke-width="1.5" opacity="0.4">
      <line x1="70" y1="18" x2="70" y2="150"/><line x1="330" y1="18" x2="330" y2="150"/>
    </g>
    <rect x="0" y="18" width="400" height="4" fill="#4a3520"/>

    <!-- FIREPLACE (left) -->
    <g>
      <ellipse cx="52" cy="128" rx="70" ry="46" fill="url(#clHearth)">
        <animate attributeName="opacity" values="0.75;1;0.8;0.95;0.75" dur="3.4s" repeatCount="indefinite"/>
      </ellipse>
      <rect x="12" y="70" width="80" height="88" fill="#5a5148"/>
      <rect x="12" y="70" width="80" height="88" fill="#000" opacity="0.12"/>
      <rect x="6" y="60" width="92" height="14" rx="2" fill="#6e4a2c"/>
      <rect x="6" y="60" width="92" height="4" fill="#8a6034"/>
      <!-- firebox -->
      <rect x="26" y="96" width="52" height="62" fill="#140b06"/>
      <!-- logs -->
      <rect x="30" y="140" width="44" height="8" rx="3" fill="#3a2412"/>
      <rect x="34" y="132" width="36" height="7" rx="3" fill="#4a2f18"/>
      <!-- flames -->
      <g>
        <path d="M52,150 C40,132 48,124 46,112 C56,122 58,124 58,132 C64,126 62,118 60,112 C70,124 68,140 60,150 Z" fill="#ff7a1f">
          <animate attributeName="d"
            values="M52,150 C40,132 48,124 46,112 C56,122 58,124 58,132 C64,126 62,118 60,112 C70,124 68,140 60,150 Z;
                    M52,150 C42,134 46,122 50,110 C54,122 56,126 56,134 C62,128 60,116 62,110 C68,126 66,142 60,150 Z;
                    M52,150 C40,132 48,124 46,112 C56,122 58,124 58,132 C64,126 62,118 60,112 C70,124 68,140 60,150 Z"
            dur="1.1s" repeatCount="indefinite"/>
        </path>
        <path d="M52,150 C46,138 50,130 52,120 C56,130 58,134 56,142 C62,138 60,130 60,124 C64,134 62,144 56,150 Z" fill="#ffd23f">
          <animate attributeName="opacity" values="0.85;1;0.7;1;0.85" dur="0.9s" repeatCount="indefinite"/>
        </path>
      </g>
      <!-- clock on the mantel -->
      <circle cx="52" cy="46" r="9" fill="#e8c266" stroke="#5c3f12" stroke-width="1.5"/>
      <line x1="52" y1="46" x2="52" y2="41" stroke="#2a1c10" stroke-width="1.2"/>
      <line x1="52" y1="46" x2="56" y2="48" stroke="#2a1c10" stroke-width="1.2"/>
    </g>

    <!-- window onto the dusk course (centre-back) -->
    <g transform="translate(168,40)">
      <rect x="-5" y="-5" width="74" height="60" rx="2" fill="#5a3a1f"/>
      <linearGradient id="clWin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a3a52"/><stop offset="60%" stop-color="#41543f"/><stop offset="100%" stop-color="#2f7a33"/>
      </linearGradient>
      <rect x="0" y="0" width="64" height="50" fill="url(#clWin)"/>
      <circle cx="50" cy="12" r="6" fill="#ffe6a6" opacity="0.85"/>
      <path d="M0,36 Q26,28 44,34 T64,32 V50 H0 Z" fill="#2f7a33"/>
      <line x1="32" y1="0" x2="32" y2="50" stroke="#5a3a1f" stroke-width="2.5"/>
      <line x1="0" y1="25" x2="64" y2="25" stroke="#5a3a1f" stroke-width="2.5"/>
    </g>

    <!-- rug on the floor -->
    <ellipse cx="185" cy="192" rx="150" ry="26" fill="#7a2f2f" opacity="0.85"/>
    <ellipse cx="185" cy="192" rx="150" ry="26" fill="none" stroke="#d8a24a" stroke-width="2" opacity="0.7"/>
    <ellipse cx="185" cy="192" rx="120" ry="19" fill="none" stroke="#d8a24a" stroke-width="1.5" opacity="0.5"/>

    <!-- pendant lamp over the lounge -->
    <line x1="200" y1="0" x2="200" y2="14" stroke="#2a1c10" stroke-width="2"/>
    <ellipse cx="200" cy="24" rx="60" ry="30" fill="url(#clLamp)">
      <animate attributeName="opacity" values="0.7;0.9;0.7" dur="4s" repeatCount="indefinite"/>
    </ellipse>
    <path d="M190,14 h20 l4 10 h-28 Z" fill="#3a2a19"/>
    <ellipse cx="200" cy="24" rx="16" ry="3" fill="#ffe6a6"/>

    <!-- BAR (right) -->
    <g>
      <!-- back shelf + bottles -->
      <rect x="300" y="40" width="100" height="70" fill="#2a1c10"/>
      <rect x="300" y="66" width="100" height="4" fill="#4a3520"/>
      <rect x="300" y="100" width="100" height="4" fill="#4a3520"/>
      <g>
        <rect x="312" y="46" width="7" height="18" rx="2" fill="#4fae8a"/>
        <rect x="326" y="42" width="6" height="22" rx="2" fill="#c65a4a"/>
        <rect x="338" y="48" width="7" height="16" rx="2" fill="#d8a24a"/>
        <rect x="352" y="44" width="6" height="20" rx="2" fill="#6a8fd0"/>
        <rect x="366" y="48" width="7" height="16" rx="2" fill="#9b6fd4"/>
        <rect x="380" y="43" width="6" height="21" rx="2" fill="#4fae8a"/>
        <rect x="318" y="80" width="7" height="18" rx="2" fill="#c65a4a"/>
        <rect x="334" y="82" width="6" height="16" rx="2" fill="#d8a24a"/>
        <rect x="350" y="78" width="7" height="20" rx="2" fill="#6a8fd0"/>
        <rect x="368" y="82" width="6" height="16" rx="2" fill="#4fae8a"/>
      </g>
      <!-- pendant lights over the bar -->
      <g>
        <line x1="330" y1="18" x2="330" y2="30" stroke="#2a1c10" stroke-width="1.5"/>
        <circle cx="330" cy="33" r="4" fill="#ffd27a"><animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite"/></circle>
        <line x1="372" y1="18" x2="372" y2="30" stroke="#2a1c10" stroke-width="1.5"/>
        <circle cx="372" cy="33" r="4" fill="#ffd27a"><animate attributeName="opacity" values="1;0.8;1" dur="3.4s" repeatCount="indefinite"/></circle>
      </g>
      <!-- bar counter -->
      <rect x="292" y="150" width="108" height="14" fill="#6e4a2c"/>
      <rect x="292" y="150" width="108" height="4" fill="#8a6034"/>
      <rect x="298" y="164" width="96" height="30" fill="#4a3520"/>
    </g>

    <!-- a couple of leafy plants for warmth -->
    <g transform="translate(120,150)">
      <rect x="-6" y="8" width="12" height="12" rx="2" fill="#5a3a1f"/>
      <path d="M0,10 C-10,0 -8,-12 0,-16 C8,-12 10,0 0,10 Z" fill="#2f7a33"/>
      <path d="M0,8 C-6,2 -6,-8 0,-12 C6,-8 6,2 0,8 Z" fill="#3f9a43"/>
    </g>

    <!-- warm vignette -->
    <rect width="400" height="220" fill="url(#clHearth)" opacity="0.06"/>
  </svg>`;
}

/**
 * Build the full lounge interior HTML: the painted room, then the golfers placed at seed-shuffled spots
 * with brass nameplates. `visit` (the finished-run counter) reshuffles the arrangement each time home.
 */
export function clubhouseLoungeHTML(golfers: LoungeGolfer[], visit: number): string {
  const rng = new Rng((visit >>> 0) * 2654435761 + 0x9e37); // spread the small counter across the seed space
  const spots = shuffle([...SPOTS], rng).slice(0, golfers.length);
  const figures = golfers.map((g, i) => golferAt(g, spots[i] ?? SPOTS[i % SPOTS.length]!)).join('');
  return `${loungeStyle()}
    <div style="container-type:inline-size;position:relative;width:100%;aspect-ratio:20/11;max-width:520px;
      margin:0 auto;border:1px solid #3a2f1f;border-radius:16px;overflow:hidden;background:#140d07;">
      ${loungeArt()}
      ${figures}
    </div>`;
}
