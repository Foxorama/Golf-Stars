/**
 * Clubhouse lounge (GS-clubhouse-lounge) — the interior the four golfers wait in, replacing the old
 * grid of manage-buttons. A cosy 19th-hole bar is painted behind them (self-contained SVG, the house
 * no-asset rule): a stone fireplace with a live fire, an armchair + floor lamp, a picture window onto
 * the space course, and a REAL bar — mirrored back-bar, bottles, taps, brass foot rail, stools and a
 * neon sign. Each golfer stands in the room wearing their own outfit, a brass nameplate at their feet
 * so you can tell who's who across changing looks, and the whole figure is the button to outfit them.
 *
 * Where each golfer stands is chosen by a seeded shuffle of a fixed set of floor "spots", keyed off the
 * finished-run counter (`visit`) — so every time you come home from a run they've milled around to new
 * places, as if they'd been living in there while you were away. Pure, deterministic (Rng, never
 * Math.random) string builder — no DOM, no globals.
 */

import { Rng } from '../sim/rng';
import { golferPreviewSVG } from './apparelArt';
import { shipSVG } from './shipArt';
import { apparelById } from '../sim/rpg/apparel';
import { shipById, DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import { cosmeticRarCol, cosmeticRarOrder, type CosmeticRarity } from '../sim/rpg/cosmetics';

/** One golfer to place in the lounge: identity + the outfit/ride ids resolved by the caller. */
export interface LoungeGolfer {
  id: string;
  shortName: string;
  /** The golfer's signature colour (their cap) — used for the nameplate + a soft grounding glow. */
  capColor: string;
  hatId: string | undefined;
  shirtId: string | undefined;
  pantsId: string | undefined;
  /** The equipped ride — parked on this golfer's spaceport pad below the lounge. */
  shipId: string;
  skin: string;
  shirtBase: string;
}

/** A place a golfer can stand: feet anchored at (x%, y%) of the room, scaled for depth. */
interface Spot {
  x: number;
  y: number;
  s: number;
}

/** Fixed floor spots around the lounge, each anchored to a piece of furniture — the hearth, the rug,
 *  the armchair corner, the bar stools. More spots than golfers so which ones sit empty also changes
 *  between visits. Front spots (larger y) are drawn on top via z-index so overlaps read correctly. */
const SPOTS: Spot[] = [
  { x: 15, y: 76, s: 0.88 }, // warming up before the hearth, back
  { x: 31, y: 89, s: 1.06 }, // hearth rug, front
  { x: 46, y: 94, s: 1.12 }, // centre rug, front
  { x: 60, y: 78, s: 0.86 }, // by the armchair / window, back
  { x: 71, y: 92, s: 1.06 }, // ambling toward the bar, front
  { x: 82, y: 89, s: 1.0 }, // at the bar, between the stools
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
  return `<span style="display:inline-block;margin-top:1px;padding:2px 8px;border-radius:3px;
    background:linear-gradient(180deg,#e8c266,#a97b25);border:1px solid #5c3f12;
    box-shadow:inset 0 1px 0 #fff6cf,0 1px 2px #0008;font-size:clamp(8px,2.1cqw,11.5px);font-weight:800;letter-spacing:.02em;
    color:${col};text-shadow:0 1px 0 #fff5;white-space:nowrap;font-family:Georgia,'Times New Roman',serif;">
    ${name}</span>`;
}

/** The rarity of the best cosmetic in a set of worn/flown ids — drives the "pop" glow: rare+ gear
 *  wraps its wearer in the rarity's colour so an outfitted golfer (or parked grail ship) reads as
 *  treasure across the room. */
function bestRarity(rarities: (CosmeticRarity | undefined)[]): CosmeticRarity {
  return rarities.reduce<CosmeticRarity>(
    (best, r) => (r && cosmeticRarOrder(r) > cosmeticRarOrder(best) ? r : best),
    'common',
  );
}

/** CSS drop-shadow stack for a lounge/spaceport button: grounding shadow + a rarity glow (rare and up). */
function popFilter(rarity: CosmeticRarity): string {
  const ord = cosmeticRarOrder(rarity);
  const glow = ord >= 1 ? ` drop-shadow(0 0 ${3 + ord * 2}px ${cosmeticRarCol(rarity)}cc)` : '';
  return `drop-shadow(0 6px 5px #0007)${glow}`;
}

/** One golfer standing in the room: the outfit preview + nameplate, the whole thing a button that opens
 *  their Clubhouse. Anchored by the feet at the spot; sized in container-query units so the figures scale
 *  WITH the room (never crowding on a narrow phone), the per-spot factor giving a little depth. Front
 *  golfers (larger y) sit on top via z-index. The preview frame is TIGHT (72u for a 210u figure) — a
 *  wide frame renders as invisible margin and shrinks the drawn body to doll size next to the furniture,
 *  the GS-clubhouse-scale bug. */
function golferAt(g: LoungeGolfer, spot: Spot): string {
  const action = JSON.stringify({ type: 'openClubhouse', characterId: g.id });
  const preview = golferPreviewSVG(g.hatId, g.shirtId, g.pantsId, {
    skin: g.skin,
    shirtBase: g.shirtBase,
    capColor: g.capColor,
    uid: `lg${g.id.replace(/[^a-z0-9]/gi, '')}`,
    w: 72,
    h: 210,
  });
  const z = Math.round(spot.y * 10);
  const w = (11.2 * spot.s).toFixed(2);
  const rarity = bestRarity([g.hatId, g.shirtId, g.pantsId].map((id) => apparelById(id)?.rarity));
  return `<button class="gs-lounge-golfer" data-action='${action}' aria-label="Outfit ${g.shortName}"
    style="position:absolute;left:${spot.x}%;top:${spot.y}%;z-index:${z};width:${w}cqw;
      transform:translate(-50%,-100%);transform-origin:bottom center;
      background:none;border:0;padding:0;cursor:pointer;color:inherit;text-align:center;
      filter:${popFilter(rarity)};">
    <span class="gs-manage-hint">Outfit ⚙</span>
    <span class="gs-lounge-shadow" style="background:radial-gradient(ellipse at 50% 50%, ${g.capColor}66, #0000 70%);"></span>
    ${preview}
    ${nameplate(g.shortName, g.capColor)}
  </button>`;
}

/** Once-per-screen CSS for the lounge golfers + spaceport ships (responsive sizing + hover lift).
 *  Scoped to the hall. */
function loungeStyle(): string {
  return `<style>
    .gs-lounge-golfer,.gs-port-ship{transition:filter .15s ease, translate .15s ease;
      background:none;border:0;padding:0;cursor:pointer;color:inherit;text-align:center;}
    .gs-lounge-golfer svg,.gs-port-ship svg{width:100%;height:auto;display:block;}
    .gs-lounge-shadow{display:block;width:80%;height:1.4cqw;min-height:5px;margin:0 auto -1cqw;border-radius:50%;}
    .gs-port-glow{display:block;width:88%;height:2.2cqw;min-height:6px;margin:0 auto -1.6cqw;border-radius:50%;}
    .gs-port-ship svg{margin-bottom:-3cqw;}
    .gs-lounge-golfer:hover,.gs-lounge-golfer:focus-visible,
    .gs-port-ship:hover,.gs-port-ship:focus-visible{
      filter:drop-shadow(0 10px 8px #000a) brightness(1.1);outline:none;translate:0 -3px;}
    .gs-lounge-golfer:hover .gs-manage-hint,.gs-lounge-golfer:focus-visible .gs-manage-hint,
    .gs-port-ship:hover .gs-manage-hint,.gs-port-ship:focus-visible .gs-manage-hint{opacity:1;}
    .gs-manage-hint{position:absolute;top:-1.8cqw;left:50%;transform:translateX(-50%);
      font-size:clamp(8px,2cqw,11px);font-weight:700;opacity:0;transition:opacity .15s ease;white-space:nowrap;
      background:#000a;color:#ffe6a6;padding:1px 6px;border-radius:8px;pointer-events:none;}
  </style>`;
}

/** One back-bar bottle: a shaped body (rounded shoulders), neck and cap with a glint — so the shelf
 *  reads as a drinks cabinet, not a bookcase. `x` centres it, `baseY` is the shelf it stands on. */
function bottle(x: number, baseY: number, hgt: number, wid: number, col: string): string {
  const body = hgt * 0.62;
  const neckW = wid * 0.34;
  return `<path d="M${x - wid / 2},${baseY} L${x - wid / 2},${baseY - body + 2} Q${x - wid / 2},${baseY - body} ${x - wid / 2 + 1.2},${baseY - body - 1}
      L${x - neckW / 2},${baseY - body - 2} L${x - neckW / 2},${baseY - hgt + 2} L${x + neckW / 2},${baseY - hgt + 2} L${x + neckW / 2},${baseY - body - 2}
      L${x + wid / 2 - 1.2},${baseY - body - 1} Q${x + wid / 2},${baseY - body} ${x + wid / 2},${baseY - body + 2} L${x + wid / 2},${baseY} Z"
      fill="${col}"/>
    <rect x="${x - neckW / 2 - 0.4}" y="${baseY - hgt}" width="${neckW + 0.8}" height="2.4" rx="0.8" fill="#2a1c10"/>
    <line x1="${x - wid / 2 + 1.1}" y1="${baseY - body + 1}" x2="${x - wid / 2 + 1.1}" y2="${baseY - 2}" stroke="#ffffff" stroke-width="0.8" opacity="0.4"/>`;
}

/** An upside-down stemmed glass hanging from the rack over the counter: foot, stem, rounded bowl. */
function hungGlass(x: number): string {
  return `<line x1="${x - 2.6}" y1="123" x2="${x + 2.6}" y2="123" stroke="#cfe0ef" stroke-width="1.2" opacity="0.85"/>
    <line x1="${x}" y1="123" x2="${x}" y2="127" stroke="#cfe0ef" stroke-width="1" opacity="0.8"/>
    <path d="M${x - 3.6},127 Q${x - 3.8},133 ${x},133.8 Q${x + 3.8},133 ${x + 3.6},127 Z" fill="#cfe0ef" opacity="0.7"/>`;
}

/** A bar stool: cushioned seat, chrome legs, a foot ring — parked in front of the counter. */
function stool(x: number): string {
  return `<g>
    <ellipse cx="${x}" cy="262" rx="13" ry="3.5" fill="#000" opacity="0.3"/>
    <g stroke="#8a9099" stroke-width="2" stroke-linecap="round">
      <line x1="${x - 9}" y1="232" x2="${x - 12}" y2="260"/>
      <line x1="${x + 9}" y1="232" x2="${x + 12}" y2="260"/>
      <line x1="${x}" y1="233" x2="${x}" y2="261"/>
    </g>
    <ellipse cx="${x}" cy="248" rx="10.5" ry="3" fill="none" stroke="#6a7078" stroke-width="1.4"/>
    <ellipse cx="${x}" cy="231" rx="13" ry="5.5" fill="#5c2424"/>
    <ellipse cx="${x}" cy="228.5" rx="13" ry="5.5" fill="#7a2f2f"/>
    <ellipse cx="${x - 3}" cy="227.5" rx="6" ry="2" fill="#a04a42" opacity="0.7"/>
  </g>`;
}

/** The painted lounge interior behind the golfers. Hand-placed (no rng) so it's byte-stable; a few
 *  `<animate>` flickers give the fire, lamps and neon sign life. Layout: fireplace + armchair on the
 *  left, space-course window centre, the bar along the right, a patterned rug up front. */
function loungeArt(): string {
  const bottlesTop = [
    bottle(316, 76, 20, 6.5, '#4fae8a'),
    bottle(328, 76, 24, 6, '#c65a4a'),
    bottle(340, 76, 17, 7, '#d8a24a'),
    bottle(352, 76, 22, 6, '#6a8fd0'),
    bottle(364, 76, 18, 6.5, '#9b6fd4'),
    bottle(376, 76, 23, 5.5, '#4fae8a'),
    bottle(387, 76, 16, 6, '#e8e2d2'),
  ].join('');
  const bottlesLow = [
    bottle(318, 104, 17, 7, '#d8a24a'),
    bottle(331, 104, 20, 6, '#c65a4a'),
    bottle(344, 104, 15, 7.5, '#4fae8a'),
    bottle(357, 104, 19, 6, '#e8e2d2'),
    bottle(370, 104, 16, 6.5, '#6a8fd0'),
    bottle(383, 104, 20, 5.5, '#9b6fd4'),
  ].join('');
  const glasses = [320, 334, 348, 362, 376].map(hungGlass).join('');
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"
      style="position:absolute;inset:0;width:100%;height:100%;">
    <defs>
      <linearGradient id="clWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#402e1f"/><stop offset="55%" stop-color="#2a1e13"/><stop offset="100%" stop-color="#1d140c"/>
      </linearGradient>
      <linearGradient id="clFloorG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4c3724"/><stop offset="100%" stop-color="#211505"/>
      </linearGradient>
      <radialGradient id="clHearth" cx="50%" cy="55%" r="60%">
        <stop offset="0%" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="100%" stop-color="#ffd27a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="clLamp" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="#ffe6a6" stop-opacity="0.6"/><stop offset="100%" stop-color="#ffe6a6" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="clMirror" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a4c68"/><stop offset="100%" stop-color="#1d2940"/>
      </linearGradient>
      <linearGradient id="clCounterTop" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a2743f"/><stop offset="100%" stop-color="#6e4a2c"/>
      </linearGradient>
      <linearGradient id="clWoodFront" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5e3f24"/><stop offset="100%" stop-color="#392610"/>
      </linearGradient>
      <linearGradient id="clWinSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#111a3a"/><stop offset="60%" stop-color="#292350"/><stop offset="100%" stop-color="#3a2a5e"/>
      </linearGradient>
      <radialGradient id="clVig" cx="50%" cy="46%" r="72%">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="78%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.42"/>
      </radialGradient>
    </defs>

    <!-- wall, crown molding, wainscot; the floor runs deep into the foreground for the golfers -->
    <rect width="400" height="152" fill="url(#clWall)"/>
    <rect y="12" width="400" height="5" fill="#4a3520"/>
    <rect y="17" width="400" height="1.5" fill="#000" opacity="0.35"/>
    <rect y="116" width="400" height="36" fill="#2b1e12"/>
    <rect y="114" width="400" height="3.5" fill="#57422b"/>
    <g stroke="#1c130b" stroke-width="1.2" opacity="0.55">
      <line x1="120" y1="121" x2="120" y2="150"/><line x1="150" y1="121" x2="150" y2="150"/>
      <line x1="215" y1="121" x2="215" y2="150"/><line x1="245" y1="121" x2="245" y2="150"/>
      <line x1="275" y1="121" x2="275" y2="150"/>
    </g>
    <rect y="150" width="400" height="4" fill="#17100a"/>
    <rect y="152" width="400" height="148" fill="url(#clFloorG)"/>
    <!-- floorboards receding toward the front -->
    <g stroke="#17100a" stroke-width="1" opacity="0.28">
      <line x1="0" y1="168" x2="400" y2="168"/><line x1="0" y1="188" x2="400" y2="188"/>
      <line x1="0" y1="214" x2="400" y2="214"/><line x1="0" y1="246" x2="400" y2="246"/>
      <line x1="0" y1="280" x2="400" y2="280"/>
      <line x1="96" y1="152" x2="56" y2="300"/><line x1="204" y1="152" x2="200" y2="300"/>
      <line x1="308" y1="152" x2="348" y2="300"/>
    </g>

    <!-- ══ FIREPLACE (left): chimney breast, mantel trophies, stone surround, live fire ══ -->
    <rect x="8" y="17" width="94" height="135" fill="#463225"/>
    <rect x="8" y="17" width="3" height="135" fill="#000" opacity="0.25"/>
    <rect x="99" y="17" width="3" height="135" fill="#000" opacity="0.25"/>
    <!-- crossed clubs on a shield plaque over the mantel -->
    <g transform="translate(55,38)">
      <path d="M0,-14 L13,-9 L13,4 Q13,12 0,16 Q-13,12 -13,4 L-13,-9 Z" fill="#5a3a1f" stroke="#2e1d0c" stroke-width="1.5"/>
      <g stroke="#c9b28a" stroke-width="1.8" stroke-linecap="round">
        <line x1="-8" y1="-8" x2="8" y2="10"/><line x1="8" y1="-8" x2="-8" y2="10"/>
      </g>
      <path d="M-8,-8 L-11,-11 L-9,-13 Z" fill="#dfe6f0"/>
      <circle cx="8.5" cy="-8.5" r="2.2" fill="#dfe6f0"/>
      <circle cx="0" cy="1" r="2.6" fill="#e8c266" stroke="#5c3f12" stroke-width="1"/>
    </g>
    <!-- mantel shelf + trophies -->
    <rect x="4" y="62" width="102" height="9" rx="1.5" fill="#7a5230"/>
    <rect x="4" y="62" width="102" height="2.5" fill="#9a6c3e"/>
    <g transform="translate(24,62)">
      <path d="M-5,-14 Q-5,-6 0,-5 Q5,-6 5,-14 Z" fill="#e8c266" stroke="#5c3f12" stroke-width="1"/>
      <path d="M-5,-13 Q-9,-12 -5,-8 M5,-13 Q9,-12 5,-8" fill="none" stroke="#e8c266" stroke-width="1.4"/>
      <rect x="-1.4" y="-5" width="2.8" height="3" fill="#c9a24a"/>
      <rect x="-4" y="-2" width="8" height="2.4" rx="0.8" fill="#5c3f12"/>
    </g>
    <g transform="translate(85,62)">
      <rect x="-8" y="-13" width="16" height="13" rx="1" fill="#a97b25" stroke="#5c3f12" stroke-width="1.2"/>
      <rect x="-6" y="-11" width="12" height="9" fill="#2a3a52"/>
      <path d="M-6,-4.5 Q-1,-7.5 6,-4.8 L6,-2 L-6,-2 Z" fill="#2f7a33"/>
      <circle cx="3" cy="-8.5" r="1.6" fill="#ffe6a6"/>
    </g>
    <!-- stone surround + arched firebox -->
    <rect x="16" y="71" width="78" height="81" fill="#5d5348"/>
    <g stroke="#3f3a33" stroke-width="1.1" opacity="0.8">
      <line x1="16" y1="88" x2="94" y2="88"/><line x1="16" y1="104" x2="94" y2="104"/>
      <line x1="16" y1="122" x2="94" y2="122"/><line x1="16" y1="138" x2="94" y2="138"/>
      <line x1="38" y1="71" x2="38" y2="88"/><line x1="66" y1="71" x2="66" y2="88"/>
      <line x1="27" y1="88" x2="27" y2="104"/><line x1="84" y1="88" x2="84" y2="104"/>
      <line x1="24" y1="122" x2="24" y2="138"/><line x1="88" y1="122" x2="88" y2="138"/>
    </g>
    <path d="M28,152 L28,110 Q55,90 82,110 L82,152 Z" fill="#0f0803"/>
    <ellipse cx="55" cy="130" rx="34" ry="26" fill="url(#clHearth)" opacity="0.5">
      <animate attributeName="opacity" values="0.4;0.62;0.45;0.58;0.4" dur="3.1s" repeatCount="indefinite"/>
    </ellipse>
    <!-- logs + grate -->
    <rect x="36" y="142" width="38" height="6.5" rx="3" fill="#3a2412"/>
    <rect x="40" y="136" width="30" height="6" rx="3" fill="#4a2f18"/>
    <line x1="34" y1="150" x2="76" y2="150" stroke="#1c130b" stroke-width="2"/>
    <!-- flames -->
    <g>
      <path d="M55,148 C43,130 51,122 49,110 C59,120 61,122 61,130 C67,124 65,116 63,110 C73,122 71,138 63,148 Z" fill="#ff7a1f">
        <animate attributeName="d"
          values="M55,148 C43,130 51,122 49,110 C59,120 61,122 61,130 C67,124 65,116 63,110 C73,122 71,138 63,148 Z;
                  M55,148 C45,132 49,120 53,108 C57,120 59,124 59,132 C65,126 63,114 65,108 C71,124 69,140 63,148 Z;
                  M55,148 C43,130 51,122 49,110 C59,120 61,122 61,130 C67,124 65,116 63,110 C73,122 71,138 63,148 Z"
          dur="1.1s" repeatCount="indefinite"/>
      </path>
      <path d="M55,148 C49,136 53,128 55,118 C59,128 61,132 59,140 C65,136 63,128 63,122 C67,132 65,142 59,148 Z" fill="#ffd23f">
        <animate attributeName="opacity" values="0.85;1;0.7;1;0.85" dur="0.9s" repeatCount="indefinite"/>
      </path>
      <circle cx="47" cy="132" r="1.2" fill="#ffb45e"><animate attributeName="opacity" values="0;1;0" dur="1.7s" repeatCount="indefinite"/></circle>
      <circle cx="64" cy="124" r="1" fill="#ffdf9e"><animate attributeName="opacity" values="1;0;1" dur="2.3s" repeatCount="indefinite"/></circle>
    </g>
    <!-- hearthstone + warm pool on the floor -->
    <rect x="12" y="152" width="86" height="7" rx="2.5" fill="#6a6157"/>
    <ellipse cx="55" cy="176" rx="66" ry="19" fill="url(#clHearth)">
      <animate attributeName="opacity" values="0.5;0.72;0.55;0.68;0.5" dur="3.4s" repeatCount="indefinite"/>
    </ellipse>
    <!-- the clubhouse cat, asleep on the warm hearthstone -->
    <g transform="translate(94,172)">
      <ellipse cx="0" cy="0" rx="9" ry="4.5" fill="#3a3f4d"/>
      <circle cx="-7.5" cy="-2" r="3.6" fill="#3a3f4d"/>
      <path d="M-10,-4.4 L-9.6,-7.4 L-7.4,-5.2 Z" fill="#3a3f4d"/>
      <path d="M-6.6,-5 L-5.6,-7.6 L-4.2,-5 Z" fill="#3a3f4d"/>
      <path d="M8,1 Q13,0 12,-4" fill="none" stroke="#3a3f4d" stroke-width="2" stroke-linecap="round"/>
      <path d="M-9.4,-1.6 Q-8.4,-0.8 -7.4,-1.6" fill="none" stroke="#1d2029" stroke-width="0.7"/>
    </g>

    <!-- ══ dartboard + floor lamp + leather armchair ══ -->
    <g transform="translate(146,50)">
      <circle r="15" fill="#2a1e12"/>
      <circle r="12" fill="#e8e2d2"/>
      <g fill="#1d2029">
        <path d="M0,0 L0,-12 A12 12 0 0 1 8.5,-8.5 Z"/><path d="M0,0 L12,0 A12 12 0 0 1 8.5,8.5 Z"/>
        <path d="M0,0 L0,12 A12 12 0 0 1 -8.5,8.5 Z"/><path d="M0,0 L-12,0 A12 12 0 0 1 -8.5,-8.5 Z"/>
      </g>
      <circle r="5.5" fill="none" stroke="#c65a4a" stroke-width="1.6"/>
      <circle r="1.8" fill="#c65a4a"/>
      <line x1="3" y1="-6" x2="8" y2="-14" stroke="#d8a24a" stroke-width="1.2"/>
      <path d="M8,-14 L11,-18 L9.4,-13.2 Z" fill="#4fae8a"/>
    </g>
    <!-- floor lamp -->
    <g>
      <path d="M108,78 L128,78 L124,96 L112,96 Z" fill="#8a5a30"/>
      <path d="M108,78 L128,78 L127,82 L109,82 Z" fill="#a97140"/>
      <ellipse cx="118" cy="97" rx="6" ry="2" fill="#ffe6a6" opacity="0.85">
        <animate attributeName="opacity" values="0.7;0.95;0.7" dur="4.2s" repeatCount="indefinite"/>
      </ellipse>
      <line x1="118" y1="97" x2="118" y2="172" stroke="#2a1c10" stroke-width="2.5"/>
      <ellipse cx="118" cy="173" rx="9" ry="2.6" fill="#2a1c10"/>
      <ellipse cx="118" cy="186" rx="34" ry="9" fill="#ffd27a" opacity="0.1"/>
    </g>
    <!-- armchair, facing the fire -->
    <g>
      <ellipse cx="160" cy="176" rx="30" ry="6" fill="#000" opacity="0.28"/>
      <rect x="162" y="102" width="24" height="64" rx="9" fill="#7a3b2a"/>
      <rect x="165" y="106" width="8" height="56" rx="4" fill="#8f4936" opacity="0.7"/>
      <rect x="134" y="138" width="42" height="26" rx="7" fill="#8a4634"/>
      <rect x="136" y="140" width="38" height="10" rx="5" fill="#9c5340" opacity="0.8"/>
      <rect x="128" y="124" width="14" height="42" rx="6.5" fill="#6e3526"/>
      <rect x="130" y="126" width="5" height="20" rx="2.5" fill="#82412f" opacity="0.8"/>
      <circle cx="174" cy="120" r="1.1" fill="#4a2015"/><circle cx="174" cy="134" r="1.1" fill="#4a2015"/><circle cx="174" cy="148" r="1.1" fill="#4a2015"/>
      <rect x="136" y="164" width="6" height="9" rx="2" fill="#3a2412"/>
      <rect x="172" y="164" width="6" height="9" rx="2" fill="#3a2412"/>
    </g>

    <!-- ══ picture window onto the space course ══ -->
    <g>
      <rect x="171" y="19" width="90" height="84" rx="3" fill="#5a3a1f"/>
      <rect x="176" y="24" width="80" height="74" fill="#3a2712"/>
      <rect x="178" y="26" width="76" height="70" fill="url(#clWinSky)"/>
      <g fill="#fff">
        <circle cx="186" cy="34" r="1"/><circle cx="204" cy="30" r="0.8"/><circle cx="196" cy="46" r="0.7"/>
        <circle cx="214" cy="40" r="0.9"/><circle cx="244" cy="32" r="0.8"/><circle cx="250" cy="48" r="0.7"/>
        <circle cx="188" cy="58" r="0.7"/><circle cx="240" cy="60" r="0.8"/>
      </g>
      <line x1="200" y1="36" x2="210" y2="41" stroke="#fff" stroke-width="0.8" opacity="0.7"/>
      <g transform="translate(233,42)">
        <circle r="7" fill="#d8a24a"/>
        <circle cx="-2" cy="-2" r="7" fill="#e8bd6e" opacity="0.55"/>
        <ellipse rx="12" ry="3" fill="none" stroke="#ffe6a6" stroke-width="1.5" transform="rotate(-18)"/>
      </g>
      <circle cx="193" cy="38" r="4" fill="#ffe6a6" opacity="0.9"/>
      <path d="M178,80 Q206,68 226,77 T254,74 L254,96 L178,96 Z" fill="#2f7a33"/>
      <path d="M178,88 Q210,80 254,86 L254,96 L178,96 Z" fill="#256a2a" opacity="0.85"/>
      <line x1="222" y1="60" x2="222" y2="80" stroke="#e8e2d2" stroke-width="1.4"/>
      <path d="M222,60 L234,64 L222,68 Z" fill="#ff6b6b"/>
      <ellipse cx="222" cy="80" rx="6" ry="1.6" fill="#3f9a43"/>
      <rect x="214" y="24" width="4.5" height="72" fill="#5a3a1f"/>
      <rect x="176" y="58" width="80" height="4.5" fill="#5a3a1f"/>
      <path d="M180,28 L204,26 L188,52 L180,54 Z" fill="#ffffff" opacity="0.05"/>
      <rect x="169" y="103" width="94" height="6" rx="2" fill="#6e4a2c"/>
      <rect x="169" y="103" width="94" height="2" fill="#8a6034"/>
    </g>

    <!-- framed course painting, hung a touch crooked -->
    <g transform="rotate(-2 281 51)">
      <rect x="266" y="36" width="30" height="30" rx="1.5" fill="#a97b25" stroke="#5c3f12" stroke-width="1.5"/>
      <rect x="269" y="39" width="24" height="24" fill="#2a3a52"/>
      <path d="M269,55 Q278,49 285,54 T293,53 L293,63 L269,63 Z" fill="#2f7a33"/>
      <ellipse cx="280" cy="59" rx="4" ry="1.8" fill="#d8c690"/>
      <line x1="287" y1="46" x2="287" y2="54" stroke="#e8e2d2" stroke-width="0.9"/>
      <path d="M287,46 L292,47.6 L287,49.2 Z" fill="#ff6b6b"/>
      <circle cx="274" cy="43" r="2" fill="#ffe6a6" opacity="0.9"/>
    </g>

    <!-- ══ THE BAR (right): neon sign, mirrored back-bar, glass rack, counter, taps, stools ══ -->
    <g>
      <ellipse cx="350" cy="31" rx="46" ry="16" fill="#ff4fd8" opacity="0.16">
        <animate attributeName="opacity" values="0.16;0.24;0.16;0.2;0.16" dur="5s" repeatCount="indefinite"/>
      </ellipse>
      <rect x="306" y="19" width="88" height="25" rx="6" fill="#140b16" stroke="#3a2438" stroke-width="1.5"/>
      <g>
        <text x="350" y="37" text-anchor="middle" font-size="15" font-weight="800" fill="none" stroke="#ff4fd8" stroke-width="3.5" stroke-linejoin="round" opacity="0.45" font-family="Georgia,'Times New Roman',serif" font-style="italic">19th Hole</text>
        <text x="350" y="37" text-anchor="middle" font-size="15" font-weight="800" fill="#ffd6ef" font-family="Georgia,'Times New Roman',serif" font-style="italic">19th Hole</text>
        <animate attributeName="opacity" values="1;1;0.72;1;0.92;1" dur="6s" repeatCount="indefinite"/>
      </g>
    </g>
    <!-- back-bar cabinet with mirror + bottle shelves -->
    <rect x="300" y="46" width="100" height="76" fill="#2e1f11"/>
    <rect x="300" y="46" width="6" height="76" fill="#4a3520"/>
    <rect x="394" y="46" width="6" height="76" fill="#4a3520"/>
    <rect x="308" y="52" width="84" height="62" fill="url(#clMirror)"/>
    <path d="M314,52 L336,52 L318,114 L308,114 L308,90 Z" fill="#ffffff" opacity="0.06"/>
    <path d="M352,52 L362,52 L340,114 L334,114 Z" fill="#ffffff" opacity="0.05"/>
    <rect x="308" y="52" width="84" height="62" fill="none" stroke="#d8a24a" stroke-width="1" opacity="0.5"/>
    <rect x="306" y="80" width="88" height="5" fill="#ffd27a" opacity="0.1"/>
    ${bottlesTop}
    <rect x="306" y="76" width="88" height="2.5" fill="#caa06a" opacity="0.85"/>
    <rect x="306" y="108" width="88" height="5" fill="#ffd27a" opacity="0.1"/>
    ${bottlesLow}
    <rect x="306" y="104" width="88" height="2.5" fill="#caa06a" opacity="0.85"/>
    <!-- hanging stemware rack -->
    <rect x="308" y="120" width="84" height="2.5" fill="#4a3520"/>
    ${glasses}
    <!-- counter: worktop, panelled front, brass foot rail -->
    <rect x="282" y="144" width="118" height="13" rx="3" fill="url(#clCounterTop)"/>
    <rect x="282" y="144" width="118" height="3" rx="1.5" fill="#c99a5c"/>
    <line x1="282" y1="157" x2="400" y2="157" stroke="#17100a" stroke-width="1.5"/>
    <rect x="286" y="157" width="114" height="56" fill="url(#clWoodFront)"/>
    <rect x="286" y="157" width="114" height="3" fill="#7a5230"/>
    <g stroke="#17100a" stroke-width="1.2" opacity="0.6">
      <line x1="314" y1="160" x2="314" y2="213"/><line x1="342" y1="160" x2="342" y2="213"/>
      <line x1="370" y1="160" x2="370" y2="213"/>
    </g>
    <g fill="none" stroke="#000" stroke-width="1" opacity="0.25">
      <rect x="292" y="165" width="16" height="40" rx="2"/><rect x="320" y="165" width="16" height="40" rx="2"/>
      <rect x="348" y="165" width="16" height="40" rx="2"/><rect x="376" y="165" width="16" height="40" rx="2"/>
    </g>
    <line x1="290" y1="206" x2="398" y2="206" stroke="#d8a24a" stroke-width="3" opacity="0.9"/>
    <g stroke="#a97b25" stroke-width="2">
      <line x1="300" y1="206" x2="300" y2="213"/><line x1="348" y1="206" x2="348" y2="213"/><line x1="392" y1="206" x2="392" y2="213"/>
    </g>
    <!-- on the counter: beer taps + poured drinks -->
    <g>
      <rect x="356" y="128" width="6" height="17" rx="2" fill="#b9c2cf" stroke="#5a626e" stroke-width="1"/>
      <path d="M356,132 L350,132 L350,136 L356,136 Z" fill="#8a9099"/>
      <line x1="359" y1="128" x2="355" y2="120" stroke="#8a9099" stroke-width="2" stroke-linecap="round"/>
      <circle cx="354.4" cy="118.8" r="2.6" fill="#c0392b"/>
      <line x1="366" y1="128" x2="370" y2="121" stroke="#8a9099" stroke-width="2" stroke-linecap="round"/>
      <circle cx="370.6" cy="119.8" r="2.6" fill="#2f6fb0"/>
      <rect x="364" y="128" width="6" height="17" rx="2" fill="#b9c2cf" stroke="#5a626e" stroke-width="1"/>
      <rect x="318" y="132" width="9" height="12" rx="1" fill="#e8a33c" opacity="0.92"/>
      <ellipse cx="322.5" cy="131" rx="5" ry="2.4" fill="#fff4d9"/>
      <line x1="320" y1="134" x2="320" y2="142" stroke="#ffffff" stroke-width="1" opacity="0.5"/>
      <path d="M336,134 L346,134 L341,141 Z" fill="#9fd8e6" opacity="0.9"/>
      <line x1="341" y1="141" x2="341" y2="144" stroke="#cfe0ef" stroke-width="1.2"/>
      <circle cx="339" cy="135.5" r="1.2" fill="#4fae8a"/>
    </g>
    ${stool(306)}${stool(348)}

    <!-- potted monstera between the painting and the bar -->
    <g transform="translate(272,150)">
      <ellipse cx="0" cy="22" rx="12" ry="3" fill="#000" opacity="0.3"/>
      <path d="M-9,6 L9,6 L6.5,21 L-6.5,21 Z" fill="#7a4a26"/>
      <path d="M-9,6 L9,6 L8.4,10 L-8.4,10 Z" fill="#8f5a30"/>
      <path d="M0,6 C-14,-2 -12,-18 -2,-22 C0,-14 -2,-4 0,6 Z" fill="#2f7a33"/>
      <path d="M0,6 C12,0 16,-14 6,-20 C4,-12 2,-2 0,6 Z" fill="#3f9a43"/>
      <path d="M0,7 C-4,-4 2,-16 0,-24 C6,-18 8,-6 3,4 Z" fill="#2a6e2e"/>
    </g>

    <!-- patterned rug up front -->
    <ellipse cx="170" cy="248" rx="142" ry="35" fill="#7a2f2f" opacity="0.92"/>
    <ellipse cx="170" cy="248" rx="134" ry="31" fill="none" stroke="#d8a24a" stroke-width="2.2" opacity="0.7"/>
    <ellipse cx="170" cy="248" rx="106" ry="23" fill="none" stroke="#d8a24a" stroke-width="1.2" opacity="0.45"/>
    <g fill="#d8a24a" opacity="0.5">
      <path d="M170,232 L175,240 L170,248 L165,240 Z"/>
      <path d="M110,242 L115,249 L110,256 L105,249 Z"/>
      <path d="M230,242 L235,249 L230,256 L225,249 Z"/>
    </g>

    <!-- warm ambience + corner vignette -->
    <rect width="400" height="300" fill="url(#clHearth)" opacity="0.05"/>
    <rect width="400" height="300" fill="url(#clVig)"/>
  </svg>`;
}

/* ══════════════════════════ THE SPACEPORT (GS-clubhouse-spaceport) ══════════════════════════
 * The parking lot below the lounge: a floating landing RING wrapped around a little putting green,
 * one lit pad per golfer with their equipped ride parked on it. Tapping a ride opens that golfer's
 * Clubhouse (same action as tapping the golfer) — the ship IS the button, a brass nameplate at its
 * nose. Pads are re-dealt by the same visit-seeded shuffle, so the fleet re-parks between runs. */

/** A landing pad on the ring: centre + painted size (art units of the 400×230 panel), depth scale. */
interface Pad {
  x: number;
  y: number;
  rx: number;
  ry: number;
  s: number;
}

/** Two pads on the back band of the ring, two up front (drawn bigger — nearer the camera). */
const PORT_PADS: Pad[] = [
  { x: 98, y: 86, rx: 27, ry: 9.5, s: 0.72 }, // back-left
  { x: 302, y: 86, rx: 27, ry: 9.5, s: 0.72 }, // back-right
  { x: 124, y: 196, rx: 37, ry: 12.5, s: 1 }, // front-left
  { x: 276, y: 196, rx: 37, ry: 12.5, s: 1 }, // front-right
];

/** One parked ride: the equipped ship hovering over its pad, nameplate at the nose, whole thing the
 *  button into that golfer's Clubhouse. Anchored to the pad in % of the panel; container-query sized. */
function shipAt(g: LoungeGolfer, pad: Pad): string {
  const action = JSON.stringify({ type: 'openClubhouse', characterId: g.id });
  const ship = shipById(g.shipId) ?? shipById(DEFAULT_SHIP_ID)!;
  const art = `<svg viewBox="0 0 96 62" role="img" aria-hidden="true">${shipSVG(ship.id, 48, 36, 1.2)}</svg>`;
  const left = ((pad.x / 400) * 100).toFixed(1);
  const top = (((pad.y + pad.ry + 6) / 230) * 100).toFixed(1);
  const w = (24 * pad.s).toFixed(1);
  const z = Math.round(pad.y);
  return `<button class="gs-port-ship" data-action='${action}' aria-label="Open ${g.shortName}'s garage"
    style="position:absolute;left:${left}%;top:${top}%;z-index:${z};width:${w}cqw;
      transform:translate(-50%,-100%);transform-origin:bottom center;
      filter:${popFilter(ship.rarity)};">
    <span class="gs-manage-hint">Garage 🚀</span>
    <span class="gs-port-glow" style="background:radial-gradient(ellipse at 50% 50%, ${g.capColor}55, #0000 70%);"></span>
    ${art}
    ${nameplate(g.shortName, g.capColor)}
  </button>`;
}

/** One holo landing pad: a recessed disc lit from within, a breathing teal projection ring and ice
 *  guide ticks — energy-field markings, not painted tarmac (the gold road-paint read as a raceway). */
function padArt(p: Pad): string {
  const tick = (dx: number, dy: number): string =>
    `<line x1="${p.x + dx * p.rx * 0.8}" y1="${p.y + dy * p.ry * 0.8}" x2="${p.x + dx * p.rx * 0.96}" y2="${p.y + dy * p.ry * 0.96}" stroke="#7fd6ff" stroke-width="1.4" opacity="0.8"/>`;
  return `<g>
    <ellipse cx="${p.x}" cy="${p.y + 1.5}" rx="${p.rx + 2}" ry="${p.ry + 1.5}" fill="#000" opacity="0.3"/>
    <ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" fill="#131a2e" stroke="#3d4f79" stroke-width="1.2"/>
    <ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx * 0.72}" ry="${p.ry * 0.72}" fill="#2bf0c0" opacity="0.08">
      <animate attributeName="opacity" values="0.05;0.14;0.05" dur="2.8s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx * 0.6}" ry="${p.ry * 0.6}" fill="none" stroke="#2bf0c0" stroke-width="1.1" opacity="0.55">
      <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2.8s" repeatCount="indefinite"/>
    </ellipse>
    ${tick(-0.95, -0.4)}${tick(0.95, -0.4)}${tick(-0.95, 0.4)}${tick(0.95, 0.4)}${tick(0, -1)}${tick(0, 1)}
    <circle cx="${p.x - p.rx}" cy="${p.y}" r="1.4" fill="#7fd6ff"><animate attributeName="opacity" values="0.3;1;0.3" dur="2.1s" repeatCount="indefinite"/></circle>
    <circle cx="${p.x + p.rx}" cy="${p.y}" r="1.4" fill="#7fd6ff"><animate attributeName="opacity" values="1;0.3;1" dur="2.1s" repeatCount="indefinite"/></circle>
  </g>`;
}

/** The painted spaceport: an orbital station RING floating in deep space — blue-steel hull deck with
 *  radial plating seams and a pulsing energy conduit (NOT road markings — the first cut's asphalt +
 *  dashed gold centreline read as a raceway), holo landing pads, a glass bio-dome over the putting
 *  green in the hub, anti-grav emitters beneath, nebulae and drifting asteroids around it.
 *  Hand-placed (no rng) so it's byte-stable, like the lounge. */
function spaceportArt(): string {
  // Rim lights sit ON the outer ellipse (cx 200, cy 138, rx 188, ry 74) — all cool tones.
  const rim = [
    [388, 138], [363, 175], [294, 202], [106, 202], [37, 175], [12, 138],
    [37, 101], [106, 74], [200, 64], [294, 74], [363, 101],
  ]
    .map(
      ([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="1.7" fill="${i % 2 ? '#b39dff' : '#7fd6ff'}"><animate attributeName="opacity" values="0.25;1;0.25" dur="2.6s" begin="${(i * 0.24).toFixed(2)}s" repeatCount="indefinite"/></circle>`,
    )
    .join('');
  // Hull plating seams every 30° across the deck band (inner ellipse 108×42 → outer 188×74).
  const seams = [15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return `<line x1="${(200 + 108 * c).toFixed(1)}" y1="${(138 + 42 * s).toFixed(1)}" x2="${(200 + 188 * c).toFixed(1)}" y2="${(138 + 74 * s).toFixed(1)}" stroke="#10162a" stroke-width="1.2" opacity="0.55"/>`;
    })
    .join('');
  // A small cratered asteroid drifting near the ring.
  const asteroid = (x: number, y: number, sc: number, dur: string): string =>
    `<g transform="translate(${x},${y}) scale(${sc})">
      <g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2.4;0 0" dur="${dur}" repeatCount="indefinite"/>
        <path d="M-8,2 L-5,-5 L2,-7 L8,-2 L6,5 L-2,7 Z" fill="#3a4258" stroke="#161a24" stroke-width="1"/>
        <circle cx="1" cy="0" r="2" fill="#2a3040"/><circle cx="-4" cy="2" r="1.2" fill="#2a3040"/>
        <path d="M-5,-5 L2,-7 L5,-4 L-3,-3 Z" fill="#4a5470" opacity="0.7"/>
      </g>
    </g>`;
  // A tiny cel garden tree under the dome (grounding shadow, trunk, two-tone canopy).
  const tree = (x: number, y: number, sc: number): string =>
    `<g transform="translate(${x},${y}) scale(${sc})">
      <ellipse cx="0" cy="1.6" rx="6.5" ry="2" fill="#000" opacity="0.25"/>
      <rect x="-1" y="-6" width="2" height="7" fill="#5a3a1f"/>
      <circle cx="0" cy="-9" r="6" fill="#2f7a33"/>
      <circle cx="-2" cy="-11" r="3.4" fill="#3f9a43"/>
    </g>`;
  // An anti-grav emitter hanging off the ring's underside: a nub + flickering light cone.
  const emitter = (x: number, y: number): string =>
    `<rect x="${x - 3}" y="${y - 2}" width="6" height="4" rx="1.4" fill="#3d4f79"/>
     <path d="M${x - 2.6},${y + 2} L${x + 2.6},${y + 2} L${x + 5.5},${y + 12} L${x - 5.5},${y + 12} Z" fill="#7f8bff" opacity="0.3">
       <animate attributeName="opacity" values="0.18;0.4;0.24;0.38;0.18" dur="1.7s" repeatCount="indefinite"/>
     </path>`;
  return `<svg viewBox="0 0 400 230" preserveAspectRatio="xMidYMid slice"
      style="position:absolute;inset:0;width:100%;height:100%;">
    <defs>
      <linearGradient id="spSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#070a1a"/><stop offset="60%" stop-color="#131230"/><stop offset="100%" stop-color="#201a42"/>
      </linearGradient>
      <linearGradient id="spDeck" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2b3452"/><stop offset="55%" stop-color="#364266"/><stop offset="100%" stop-color="#1d2440"/>
      </linearGradient>
      <radialGradient id="spRough" cx="50%" cy="42%" r="70%">
        <stop offset="0%" stop-color="#338038"/><stop offset="100%" stop-color="#26602a"/>
      </radialGradient>
      <clipPath id="spCourseClip"><ellipse cx="200" cy="138" rx="106" ry="40.5"/></clipPath>
      <radialGradient id="spNebA" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#2bf0c0" stop-opacity="0.14"/><stop offset="100%" stop-color="#2bf0c0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="spNebB" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff4fd8" stop-opacity="0.12"/><stop offset="100%" stop-color="#ff4fd8" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="spDome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cfeaff" stop-opacity="0.26"/><stop offset="55%" stop-color="#9fdcef" stop-opacity="0.1"/><stop offset="100%" stop-color="#9fdcef" stop-opacity="0.04"/>
      </linearGradient>
      <radialGradient id="spVig" cx="50%" cy="48%" r="72%">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="80%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.4"/>
      </radialGradient>
    </defs>
    <rect width="400" height="230" fill="url(#spSky)"/>
    <!-- nebulae washes behind everything -->
    <ellipse cx="310" cy="44" rx="130" ry="52" fill="url(#spNebA)"/>
    <ellipse cx="80" cy="70" rx="110" ry="48" fill="url(#spNebB)"/>
    <ellipse cx="200" cy="210" rx="180" ry="40" fill="url(#spNebB)" opacity="0.6"/>
    <!-- starfield (a few twinkling) + a ringed neighbour planet + one shooting star -->
    <g fill="#fff">
      <circle cx="30" cy="26" r="1"/><circle cx="66" cy="14" r="0.7"/><circle cx="118" cy="30" r="0.8"/>
      <circle cx="152" cy="12" r="0.7"/><circle cx="258" cy="16" r="0.8"/><circle cx="300" cy="30" r="0.7"/>
      <circle cx="342" cy="12" r="0.9"/><circle cx="382" cy="34" r="0.7"/><circle cx="14" cy="70" r="0.7"/>
      <circle cx="388" cy="76" r="0.8"/><circle cx="206" cy="8" r="0.7"/><circle cx="92" cy="50" r="0.6"/>
      <circle cx="240" cy="34" r="0.9"><animate attributeName="opacity" values="0.2;1;0.2" dur="2.9s" repeatCount="indefinite"/></circle>
      <circle cx="178" cy="22" r="0.8"><animate attributeName="opacity" values="1;0.2;1" dur="3.7s" repeatCount="indefinite"/></circle>
      <circle cx="8" cy="120" r="0.8"><animate attributeName="opacity" values="0.3;1;0.3" dur="3.1s" repeatCount="indefinite"/></circle>
      <circle cx="394" cy="180" r="0.7"><animate attributeName="opacity" values="1;0.3;1" dur="2.5s" repeatCount="indefinite"/></circle>
    </g>
    <g transform="translate(52,30)">
      <circle r="9" fill="#c65a4a"/><circle cx="-2.5" cy="-2.5" r="9" fill="#d8755f" opacity="0.5"/>
      <ellipse rx="15" ry="3.6" fill="none" stroke="#ffe6a6" stroke-width="1.4" transform="rotate(-16)" opacity="0.85"/>
    </g>
    <g opacity="0.8">
      <line x1="292" y1="22" x2="318" y2="34" stroke="#fff" stroke-width="1">
        <animate attributeName="opacity" values="0;1;0;0" dur="7s" repeatCount="indefinite"/>
      </line>
    </g>
    ${asteroid(24, 186, 1, '5.2s')}${asteroid(384, 118, 0.7, '6.4s')}
    <!-- anti-grav under-glow, so the ring reads as floating -->
    <ellipse cx="200" cy="216" rx="176" ry="9" fill="#7f8bff" opacity="0.12">
      <animate attributeName="opacity" values="0.08;0.16;0.08" dur="4.4s" repeatCount="indefinite"/>
    </ellipse>
    <!-- the station RING: hull-metal deck annulus + plating seams + energy conduit -->
    <path fill-rule="evenodd" fill="url(#spDeck)" stroke="#4a5878" stroke-width="1.4"
      d="M12,138 a188,74 0 1,0 376,0 a188,74 0 1,0 -376,0 Z
         M92,138 a108,42 0 1,0 216,0 a108,42 0 1,0 -216,0 Z"/>
    ${seams}
    <ellipse cx="200" cy="138" rx="150" ry="59" fill="none" stroke="#10162a" stroke-width="1" opacity="0.4"/>
    <ellipse cx="200" cy="138" rx="108" ry="42" fill="none" stroke="#0f1424" stroke-width="2.4" opacity="0.8"/>
    <ellipse cx="200" cy="138" rx="136" ry="53" fill="none" stroke="#2bf0c0" stroke-width="2" opacity="0.2">
      <animate attributeName="opacity" values="0.12;0.3;0.12" dur="3.6s" repeatCount="indefinite"/>
    </ellipse>
    ${rim}
    ${emitter(60, 187)}${emitter(200, 213)}${emitter(340, 187)}
    <!-- the bio-dome GARDEN in the hub: a real par-3 — rough base, a mown fairway ribbon running
         tee → green, fringe + cup, guarding bunkers, a pond, trees and moon-rocks (the old flat
         oval + concentric rings read as a stadium pitch, not golf) -->
    <ellipse cx="200" cy="138" rx="106" ry="40.5" fill="url(#spRough)"/>
    <g clip-path="url(#spCourseClip)">
      <!-- rough mottle -->
      <g fill="#1e5222" opacity="0.18">
        <ellipse cx="130" cy="135" rx="18" ry="6"/><ellipse cx="215" cy="160" rx="22" ry="7"/>
        <ellipse cx="286" cy="142" rx="16" ry="5"/><ellipse cx="180" cy="118" rx="14" ry="4.5"/>
      </g>
      <g fill="#54b458" opacity="0.1">
        <ellipse cx="160" cy="148" rx="20" ry="6"/><ellipse cx="256" cy="152" rx="14" ry="4.5"/>
      </g>
      <!-- pond, teal-rimmed, with a glint -->
      <path d="M132,116 Q146,108 158,114 Q166,118 158,123 Q142,127 132,122 Q126,119 132,116 Z" fill="#3f8fc9"/>
      <path d="M132,116 Q146,108 158,114 Q166,118 158,123 Q142,127 132,122 Q126,119 132,116 Z" fill="none" stroke="#7fd6ff" stroke-width="1" opacity="0.5"/>
      <path d="M138,116 Q146,113 152,116" stroke="#cfeaff" stroke-width="1" fill="none" opacity="0.6"/>
      <!-- mown fairway ribbon, tee → green, banded stripes along its length -->
      <path d="M128,155 Q168,152 200,141 Q228,132 250,130" fill="none" stroke="#3f9a43" stroke-width="17" stroke-linecap="round"/>
      <path d="M128,155 Q168,152 200,141 Q228,132 250,130" fill="none" stroke="#ffffff" stroke-width="17" stroke-dasharray="11 11" opacity="0.07"/>
      <!-- the green + fringe + cup -->
      <ellipse cx="258" cy="129" rx="25" ry="10.5" fill="#5cc160"/>
      <ellipse cx="258" cy="129" rx="25" ry="10.5" fill="none" stroke="#3f9a43" stroke-width="2.5" opacity="0.9"/>
      <ellipse cx="252" cy="126" rx="10" ry="3.4" fill="#7fd47f" opacity="0.5"/>
      <ellipse cx="263" cy="131" rx="1.9" ry="0.9" fill="#123c14"/>
      <!-- bunkers guarding the green -->
      <path d="M228,141 Q238,137 246,141 Q240,146 230,145 Q226,143 228,141 Z" fill="#d8c690"/>
      <path d="M231,141 Q238,138.6 243,141.4 Q238,143.6 232,143 Z" fill="#e6d6a4"/>
      <ellipse cx="280" cy="118" rx="8" ry="3" fill="#d8c690"/>
      <ellipse cx="279" cy="117.4" rx="5.4" ry="1.9" fill="#e6d6a4"/>
      <!-- tee pad + markers, and the ball waiting mid-fairway -->
      <rect x="118" y="151" width="17" height="7" rx="3" fill="#4aa84e"/>
      <circle cx="120.5" cy="152.6" r="0.8" fill="#e8e2d2"/><circle cx="126" cy="157.2" r="0.8" fill="#e8e2d2"/>
      <circle cx="222" cy="136" r="1.7" fill="#fff"/>
      ${tree(116, 128, 0.9)}${tree(172, 112, 1.05)}${tree(292, 148, 0.95)}${tree(240, 158, 0.8)}
      <!-- a couple of moon-rocks in the rough -->
      <path d="M186,124 L190,120 L195,122 L194,126 L188,127 Z" fill="#8a93a6"/>
      <path d="M188,124 L190,121 L193,122.4 Z" fill="#aab3c6"/>
    </g>
    <ellipse cx="200" cy="138" rx="106" ry="40.5" fill="none" stroke="#1e5222" stroke-width="2.5"/>
    <!-- the pin on the green -->
    <line x1="263" y1="131" x2="263" y2="106" stroke="#e8e2d2" stroke-width="1.6"/>
    <path d="M263,106 L281,110.5 L263,115 Z" fill="#ff6b6b"/>
    <!-- the glass bio-dome sealing the green in: shell, meridian seams, a specular sweep -->
    <path d="M94,138 A106,44 0 0 1 306,138 A106,40.5 0 0 1 94,138 Z" fill="url(#spDome)" stroke="#9fdcef" stroke-width="1.2" opacity="0.9"/>
    <path d="M94,138 A106,44 0 0 1 306,138" fill="none" stroke="#cfeaff" stroke-width="0.8" opacity="0.5"/>
    <g fill="none" stroke="#9fdcef" stroke-width="0.7" opacity="0.3">
      <path d="M148,102 Q144,120 146,138"/>
      <path d="M200,94 Q200,116 200,138"/>
      <path d="M252,102 Q256,120 254,138"/>
    </g>
    <path d="M124,116 A96,40 0 0 1 172,98" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.22"/>
    <!-- control tower on the back band, dish + beacon -->
    <g>
      <rect x="349" y="66" width="5" height="32" fill="#4a5262"/>
      <line x1="345" y1="98" x2="358" y2="98" stroke="#2b3452" stroke-width="2.5"/>
      <ellipse cx="351.5" cy="62" rx="16" ry="7" fill="#364266" stroke="#10162a" stroke-width="1"/>
      <ellipse cx="351.5" cy="59.5" rx="12.5" ry="4.2" fill="#9fdcef" opacity="0.85"/>
      <ellipse cx="347" cy="58.6" rx="4" ry="1.4" fill="#fff" opacity="0.5"/>
      <path d="M363,58 Q370,52 368,45 L372,44 Q375,53 365,60 Z" fill="#8a93a6"/>
      <circle cx="351.5" cy="51" r="2" fill="#ff5a4d"><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite"/></circle>
    </g>
    <!-- grav-beacon on the back-left band: pulsing orb + radar ping -->
    <g>
      <line x1="52" y1="98" x2="52" y2="72" stroke="#4a5262" stroke-width="2"/>
      <circle cx="52" cy="68" r="3.6" fill="#2bf0c0">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite"/>
      </circle>
      <circle cx="52" cy="68" r="6" fill="none" stroke="#2bf0c0" stroke-width="1">
        <animate attributeName="r" values="5;12" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite"/>
      </circle>
    </g>
    <!-- neon gate sign over the back of the ring -->
    <ellipse cx="200" cy="30" rx="52" ry="14" fill="#2bf0c0" opacity="0.13">
      <animate attributeName="opacity" values="0.13;0.2;0.13" dur="5.2s" repeatCount="indefinite"/>
    </ellipse>
    <rect x="152" y="19" width="96" height="21" rx="6" fill="#0d1416" stroke="#1f3a35" stroke-width="1.4"/>
    <text x="200" y="34" text-anchor="middle" font-size="12" font-weight="800" fill="none" stroke="#2bf0c0" stroke-width="3" stroke-linejoin="round" opacity="0.4" font-family="Georgia,'Times New Roman',serif" font-style="italic">Spaceport</text>
    <text x="200" y="34" text-anchor="middle" font-size="12" font-weight="800" fill="#d9fff4" font-family="Georgia,'Times New Roman',serif" font-style="italic">Spaceport</text>
    ${PORT_PADS.map(padArt).join('')}
    <rect width="400" height="230" fill="url(#spVig)"/>
  </svg>`;
}

/** The spaceport panel: painted ring + the four rides parked on visit-shuffled pads. */
function spaceportHTML(golfers: LoungeGolfer[], rng: Rng): string {
  const pads = shuffle([...PORT_PADS], rng).slice(0, golfers.length);
  const ships = golfers.map((g, i) => shipAt(g, pads[i] ?? PORT_PADS[i % PORT_PADS.length]!)).join('');
  return `<div style="container-type:inline-size;position:relative;width:100%;aspect-ratio:40/23;max-width:680px;
      margin:10px auto 0;border:1px solid #232c42;border-radius:16px;overflow:hidden;background:#0a0d1f;">
      ${spaceportArt()}
      ${ships}
    </div>`;
}

/**
 * Build the full clubhouse-hall HTML: the painted lounge with the golfers placed at seed-shuffled spots,
 * then the spaceport panel below it with each golfer's equipped ride parked on its own pad. `visit` (the
 * finished-run counter) reshuffles both arrangements each time home — the pad draws happen AFTER the spot
 * draws on the same Rng, so the lounge arrangement for a given visit is unchanged by the spaceport.
 */
export function clubhouseLoungeHTML(golfers: LoungeGolfer[], visit: number): string {
  const rng = new Rng((visit >>> 0) * 2654435761 + 0x9e37); // spread the small counter across the seed space
  const spots = shuffle([...SPOTS], rng).slice(0, golfers.length);
  const figures = golfers.map((g, i) => golferAt(g, spots[i] ?? SPOTS[i % SPOTS.length]!)).join('');
  // Taller 4:3 frame that grows to fill the screen (was a squat 20:11 letterbox at 520px that left a lot
  // of dead space above/below on a phone). The extra height is foreground floor the golfers stand on.
  return `${loungeStyle()}
    <div style="container-type:inline-size;position:relative;width:100%;aspect-ratio:4/3;max-width:680px;
      margin:0 auto;border:1px solid #3a2f1f;border-radius:16px;overflow:hidden;background:#140d07;">
      ${loungeArt()}
      ${figures}
    </div>
    ${spaceportHTML(golfers, rng)}`;
}
