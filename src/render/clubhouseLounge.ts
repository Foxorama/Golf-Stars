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
import type { GolferHair } from '../sim/rpg/characters';
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
  /** The golfer's chosen hairstyle (render-only; drawn only above the neck). */
  hair?: GolferHair;
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

/** A small engraved brass nameplate: the name inked in a dark engraved fill (always legible on brass,
 *  unlike arbitrary cap colours which wash out), with the golfer's signature colour carried as a small
 *  inlaid gem so identity survives without costing readability. */
function nameplate(name: string, col: string): string {
  return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:1px;padding:2px 8px;border-radius:3px;
    background:linear-gradient(180deg,#e8c266,#a97b25);border:1px solid #5c3f12;
    box-shadow:inset 0 1px 0 #fff6cf,0 1px 2px #0008;font-size:clamp(8px,2.1cqw,11.5px);font-weight:800;letter-spacing:.02em;
    color:#2a1a05;text-shadow:0 1px 0 #ffe6ab;white-space:nowrap;font-family:Georgia,'Times New Roman',serif;">
    <span style="width:.52em;height:.52em;border-radius:50%;flex:none;background:${col};
      box-shadow:0 0 0 1px #0007,inset 0 0 1px 1px #fff8;"></span>${name}</span>`;
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
    hair: g.hair,
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
    /* GS-a11y-focus: restore the keyboard ring outline:none above suppressed (hover styling kept). */
    .gs-lounge-golfer:focus-visible,.gs-port-ship:focus-visible{outline:2px solid var(--gs-info);outline-offset:3px;}
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

/**
 * The Marmot Bartender (GS-tent-interactions), earned the first time a ball bonks a marmot trade-tent.
 * A plump marmot in a bow tie tends the 19th-hole bar — drawn BEHIND the counter (before the worktop),
 * so the counter front occludes its belly and only its head, ears and little paws show over the bar.
 * Centred around x≈333, resting on the back-bar side of the counter (worktop top y=144).
 */
function marmotBartender(): string {
  const x = 333;
  return `<g>
    <!-- shoulders / bow-tie vest peeking over the bar -->
    <path d="M${x - 15},150 Q${x},131 ${x + 15},150 Z" fill="#7a4e2c"/>
    <path d="M${x - 12},150 Q${x},137 ${x + 12},150 Z" fill="#3b2a1a"/>
    <path d="M${x - 3.4},142 L${x},145 L${x + 3.4},142 L${x + 2.6},147 L${x - 2.6},147 Z" fill="#c0392b"/>
    <circle cx="${x}" cy="144.4" r="1.1" fill="#8a2018"/>
    <!-- head -->
    <ellipse cx="${x}" cy="126" rx="11.5" ry="10.5" fill="#8a5a34"/>
    <ellipse cx="${x - 6}" cy="115.5" rx="3.4" ry="3.8" fill="#8a5a34"/>
    <ellipse cx="${x + 6}" cy="115.5" rx="3.4" ry="3.8" fill="#8a5a34"/>
    <ellipse cx="${x - 6}" cy="116" rx="1.6" ry="2" fill="#5f3c20"/>
    <ellipse cx="${x + 6}" cy="116" rx="1.6" ry="2" fill="#5f3c20"/>
    <!-- muzzle + cheeks -->
    <ellipse cx="${x}" cy="130" rx="7" ry="5.4" fill="#c79a68"/>
    <ellipse cx="${x}" cy="128.4" rx="2" ry="1.5" fill="#2a1a10"/>
    <path d="M${x},130 L${x},132.4" stroke="#2a1a10" stroke-width="1"/>
    <path d="M${x - 3.2},133.4 Q${x},135 ${x + 3.2},133.4" fill="none" stroke="#2a1a10" stroke-width="1" stroke-linecap="round"/>
    <!-- eyes -->
    <circle cx="${x - 4.4}" cy="123.6" r="1.7" fill="#1a120b"/>
    <circle cx="${x + 4.4}" cy="123.6" r="1.7" fill="#1a120b"/>
    <circle cx="${x - 3.9}" cy="123.1" r="0.6" fill="#fff" opacity="0.85"/>
    <circle cx="${x + 4.9}" cy="123.1" r="0.6" fill="#fff" opacity="0.85"/>
    <!-- two little front teeth -->
    <rect x="${x - 1.6}" y="132.6" width="1.4" height="2" rx="0.4" fill="#fff"/>
    <rect x="${x + 0.2}" y="132.6" width="1.4" height="2" rx="0.4" fill="#fff"/>
    <!-- paws resting on the bar + a cocktail shaker -->
    <ellipse cx="${x - 9.5}" cy="143" rx="2.6" ry="1.8" fill="#7a4e2c"/>
    <ellipse cx="${x + 9.5}" cy="143" rx="2.6" ry="1.8" fill="#7a4e2c"/>
    <rect x="${x + 11}" y="134" width="5" height="9" rx="1.4" fill="#cfd6de" stroke="#8a9099" stroke-width="0.8"/>
    <rect x="${x + 11.4}" y="132.5" width="4.2" height="2" rx="0.8" fill="#aeb6c0"/>
  </g>`;
}

/**
 * Balls a tip jar holds when FULL (GS-tent-tips) — a half-dozen. The Marmot's tips ACCUMULATE across
 * runs (the persisted `marmotTips` total is no longer reset each run): the jar fills 1→CAP over
 * successive marmot bonks, and the bonk that would overflow a full jar empties it — the Marmot has
 * cashed out its half-dozen and taken the night off on the spaceport par-3 — after which it refills.
 * Sized to the nest below so a full jar reads full.
 */
export const MARMOT_JAR_CAP = 6;

/** Ball nest slots inside the tip jar (dx from the jar centre, absolute y), packed bottom-up above the
 *  "Tips" label — the first `balls` slots are drawn, so the jar visibly fills as tips come in. A neat
 *  3-2-1 pyramid of a half-dozen (= a FULL jar at `MARMOT_JAR_CAP`). */
const JAR_BALL_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [-4.4, 135.6], [0, 135.6], [4.4, 135.6],
  [-2.6, 131.4], [2.6, 131.4],
  [0, 127.2],
];

/** The 19th-Hole TIP JAR on the bar (GS-tent-tips) — a glass jar with a "Tips" sign that gains a golf
 *  ball for every ball the Marmot pockets from a trade tent this run. `balls` (0..CAP) nest inside; an
 *  empty jar still shows (the fixture). Sits on the right of the counter worktop (top y=144). */
function tipJar(balls: number): string {
  const cx = 384;
  const n = Math.max(0, Math.min(MARMOT_JAR_CAP, Math.round(balls)));
  const nest = JAR_BALL_SLOTS.slice(0, n)
    .map(
      ([dx, y]) =>
        `<circle cx="${(cx + dx).toFixed(1)}" cy="${y}" r="2.2" fill="#f4f6f8" stroke="#c9ced4" stroke-width="0.5"/>` +
        `<circle cx="${(cx + dx - 0.7).toFixed(1)}" cy="${y - 0.7}" r="0.55" fill="#fff"/>`,
    )
    .join('');
  return `<g>
    <!-- grounding shadow on the worktop -->
    <ellipse cx="${cx}" cy="144.2" rx="9" ry="1.9" fill="#000" opacity="0.28"/>
    <!-- balls nested inside (drawn before the front glass so the glass tints them) -->
    ${nest}
    <!-- glass jar body: translucent so the balls read through it -->
    <path d="M${cx - 8},124 Q${cx - 8},144 ${cx - 5},144 L${cx + 5},144 Q${cx + 8},144 ${cx + 8},124 Z" fill="#bcd2e6" opacity="0.26"/>
    <path d="M${cx - 8},124 Q${cx - 8},144 ${cx - 5},144 L${cx + 5},144 Q${cx + 8},144 ${cx + 8},124" fill="none" stroke="#e8f2fb" stroke-width="0.9" opacity="0.5"/>
    <line x1="${cx - 6}" y1="127" x2="${cx - 6}" y2="140" stroke="#ffffff" stroke-width="1" opacity="0.35"/>
    <!-- rim / mouth of the jar -->
    <rect x="${cx - 8.6}" y="121" width="17.2" height="3.6" rx="1.6" fill="#cfd6de" stroke="#8a9099" stroke-width="0.6"/>
    <rect x="${cx - 7}" y="121.6" width="14" height="1" rx="0.5" fill="#eef3f7" opacity="0.7"/>
    <!-- kraft-paper "Tips" sign across the jar front -->
    <rect x="${cx - 7.6}" y="137.4" width="15.2" height="6.4" rx="1.2" fill="#f3e7c4" stroke="#b79a5c" stroke-width="0.5"/>
    <text x="${cx}" y="142.3" text-anchor="middle" font-size="5" font-weight="800" fill="#6a4a1c" font-family="Georgia,'Times New Roman',serif" font-style="italic">Tips</text>
  </g>`;
}

/**
 * Thor's Hammer (GS-thor) leaning against the RIGHT jamb of the fireplace stone surround — earned by
 * winning an Asgard tournament, shown only once OWNED. A rune-etched gilded warhammer stood base-down on
 * the hearthstone, its head up against the chimney breast, wreathed in flickering electric-blue lightning
 * (the shipArt Thunderbolt idiom). Drawn AFTER the fireplace block so it sits on top; STATIC positions
 * (no lounge Rng draws) so it never perturbs the seeded golfer placement — the lounge reads identically
 * with or without it, only the hammer is added.
 */
function thorHammerHearth(): string {
  const flick = (dur: string, begin: string): string =>
    `<animate attributeName="opacity" values="0;1;0;0.7;0;0.9;0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`;
  const bolt = (d: string, dur: string, begin: string): string => `
    <path d="${d}" fill="none" stroke="#59b6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0">${flick(dur, begin)}</path>
    <path d="${d}" fill="none" stroke="#eaf6ff" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" opacity="0">${flick(dur, begin)}</path>`;
  return `<g transform="translate(96,169) rotate(-7)">
    <ellipse cx="0" cy="1" rx="7" ry="2" fill="#000" opacity="0.3"/>
    <ellipse cx="0" cy="-62" rx="15" ry="16" fill="#59b6ff" opacity="0.14">
      <animate attributeName="opacity" values="0.08;0.2;0.1;0.18;0.08" dur="2.6s" repeatCount="indefinite"/>
    </ellipse>
    <g>
      ${bolt('M9,-70 L15,-73 L11,-66 L18,-68', '0.7s', '0s')}
      ${bolt('M-9,-69 L-16,-72 L-11,-65 L-18,-67', '0.6s', '0.3s')}
      ${bolt('M10,-58 L17,-56 L13,-52', '0.5s', '0.15s')}
    </g>
    <rect x="-1.8" y="-62" width="3.6" height="62" rx="1.6" fill="#6b4a24" stroke="#2e1d0c" stroke-width="1"/>
    <rect x="-2.1" y="-16" width="4.2" height="15" rx="1.6" fill="#2f2010"/>
    <rect x="-10" y="-72" width="20" height="13.5" rx="1.8" fill="#c9a24a" stroke="#2e1d0c" stroke-width="1.2"/>
    <rect x="-10" y="-72" width="4.6" height="13.5" fill="#ecd591"/>
    <rect x="5.4" y="-72" width="4.6" height="13.5" fill="#ecd591"/>
    <path d="M0,-68.5 L3,-65.2 L0,-61.8 L-3,-65.2 Z" fill="none" stroke="#7a5a22" stroke-width="1"/>
  </g>`;
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
 *  left, space-course window centre, the bar along the right, a patterned rug up front.
 *  `marmot` = the Marmot Bartender clubhouse unlock (GS-tent-interactions) is earned: a marmot tends
 *  the bar and its "Tips" jar sits on the counter, filled with `balls` golf balls (GS-tent-tips — the
 *  jar's current fill, 0..CAP). When the jar has just cashed out the Marmot is `away` on the spaceport
 *  par-3 — the bar shows no marmot and an empty jar that visit. `thorHammer` = Thor's Hammer (GS-thor)
 *  is owned, so it leans against the fireplace. */
function loungeArt(marmot = false, balls = 0, away = false, thorHammer = false): string {
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
    ${thorHammer ? thorHammerHearth() : ''}

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
    ${marmot && !away ? marmotBartender() : ''}
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
    ${marmot ? tipJar(balls) : ''}
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

    <!-- patterned rug up front — pulled in from the right so it clears the bar stools (it used to slide
         under them, cutting off the stool feet so the rug read as floating off the floor) -->
    <ellipse cx="160" cy="248" rx="122" ry="35" fill="#7a2f2f" opacity="0.92"/>
    <ellipse cx="160" cy="248" rx="114" ry="31" fill="none" stroke="#d8a24a" stroke-width="2.2" opacity="0.7"/>
    <ellipse cx="160" cy="248" rx="90" ry="23" fill="none" stroke="#d8a24a" stroke-width="1.2" opacity="0.45"/>
    <g fill="#d8a24a" opacity="0.5">
      <path d="M160,232 L165,240 L160,248 L155,240 Z"/>
      <path d="M102,242 L107,249 L102,256 L97,249 Z"/>
      <path d="M218,242 L223,249 L218,256 L213,249 Z"/>
    </g>

    <!-- warm ambience + corner vignette -->
    <rect width="400" height="300" fill="url(#clHearth)" opacity="0.05"/>
    <rect width="400" height="300" fill="url(#clVig)"/>
  </svg>`;
}

/* ══════════════════════════ THE SPACEPORT (GS-clubhouse-spaceport) ══════════════════════════
 * The view out the clubhouse window, made whole: a single floating golf-deck platform adrift in the
 * same blue→purple sky, ringed planet and moon the bar's picture window looks onto — so the lounge
 * above and this panel read as ONE place (you're seeing the deck the clubhouse sits on). A par-3
 * putting green crowns the deck; the little space-clubhouse (warm windows + a 19th-Hole glow, echoing
 * the bar) sits at its back. Four berths ring the green — THREE holo landing pads and ONE fuelling
 * station — and the four golfers' equipped rides are dealt across them by the visit-seeded shuffle.
 * So each run home the fleet re-parks AND a different ride is the one topping up at the pump. Every
 * ship is the button into that golfer's Clubhouse (nameplate at the nose). Hand-placed, zero rng in
 * the art (byte-stable, like the lounge); the ONLY randomness is which golfer lands on which berth. */

/** A parking berth on the deck: the ship's bottom-anchor point (art units of the 400×230 panel), a
 *  depth scale, and whether it's a holo landing pad or the fuel pump (the pump ship parks nose-in). */
interface Berth {
  x: number;
  y: number;
  s: number;
  kind: 'pad' | 'fuel';
}

/** The four berths ringing the deck green: two small pads on the back band, one big pad front-left,
 *  and the FUEL station front-right. Their draw order is fixed; the visit shuffle picks who parks
 *  where (and so who's at the pump). The pad discs + the pump are painted at these same anchors in
 *  `spaceportArt`, so ship and berth line up. */
const BERTHS: Berth[] = [
  { x: 92, y: 118, s: 0.72, kind: 'pad' }, // back-left pad
  { x: 308, y: 118, s: 0.72, kind: 'pad' }, // back-right pad
  { x: 108, y: 200, s: 1.02, kind: 'pad' }, // front-left pad
  { x: 300, y: 198, s: 1.0, kind: 'fuel' }, // fuelling station, front-right
];

/** Pad-disc geometry per pad berth (centre + painted radii), keyed by the berth's anchor so the
 *  holo pad sits right under the hovering ship. Back pads are smaller (further from camera). */
const PAD_ART: Record<string, { x: number; y: number; rx: number; ry: number }> = {
  '92,118': { x: 92, y: 112, rx: 25, ry: 8.5 },
  '308,118': { x: 308, y: 112, rx: 25, ry: 8.5 },
  '108,200': { x: 108, y: 191, rx: 34, ry: 12 },
};

/** One parked ride: the equipped ship hovering over its berth, nameplate at the nose, whole thing the
 *  button into that golfer's Clubhouse. Anchored in % of the panel; container-query sized. A fuel-berth
 *  ride hangs a little "⛽ Fuelling" tag instead of the "Garage" hint on hover, and glows warm-amber. */
function shipAt(g: LoungeGolfer, berth: Berth): string {
  const action = JSON.stringify({ type: 'openClubhouse', characterId: g.id });
  const ship = shipById(g.shipId) ?? shipById(DEFAULT_SHIP_ID)!;
  const art = `<svg viewBox="0 0 96 62" role="img" aria-hidden="true">${shipSVG(ship.id, 48, 36, 1.2)}</svg>`;
  const left = ((berth.x / 400) * 100).toFixed(1);
  const top = ((berth.y / 230) * 100).toFixed(1);
  const w = (24 * berth.s).toFixed(1);
  const z = Math.round(berth.y);
  const fuel = berth.kind === 'fuel';
  const hint = fuel ? '⛽ Fuelling' : 'Garage 🚀';
  const glowCol = fuel ? '#ffce54' : `${g.capColor}55`;
  return `<button class="gs-port-ship" data-action='${action}' aria-label="Open ${g.shortName}'s garage"
    style="position:absolute;left:${left}%;top:${top}%;z-index:${z};width:${w}cqw;
      transform:translate(-50%,-100%);transform-origin:bottom center;
      filter:${popFilter(ship.rarity)};">
    <span class="gs-manage-hint">${hint}</span>
    <span class="gs-port-glow" style="background:radial-gradient(ellipse at 50% 50%, ${glowCol}, #0000 70%);"></span>
    ${art}
    ${nameplate(g.shortName, g.capColor)}
  </button>`;
}

/** One holo landing pad: a recessed disc lit from within, a breathing teal projection ring and ice
 *  guide ticks — energy-field markings, not painted tarmac. */
function padArt(p: { x: number; y: number; rx: number; ry: number }): string {
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

/** The fuelling station on the front-right deck: a recessed service disc + a pump cabinet with an
 *  amber gauge, a hose looping out to the parked ship, fuel-cell canisters and a neon ⛽ FUEL post.
 *  Warm amber against the teal pads so fuel reads as fuel. Drawn at the fuel berth's anchor (300,198). */
function fuelStationArt(): string {
  return `<g>
    <!-- recessed service disc (matches the holo pads' footprint) + amber field wash -->
    <ellipse cx="300" cy="188" rx="34" ry="12" fill="#000" opacity="0.3"/>
    <ellipse cx="300" cy="186.5" rx="32" ry="11" fill="#171426" stroke="#5a4a2a" stroke-width="1.2"/>
    <ellipse cx="300" cy="186.5" rx="23" ry="7.6" fill="#ffce54" opacity="0.1">
      <animate attributeName="opacity" values="0.06;0.16;0.06" dur="2.8s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="300" cy="186.5" rx="20" ry="6.4" fill="none" stroke="#ffce54" stroke-width="1" opacity="0.4" stroke-dasharray="4 3"/>
    <!-- pump cabinet on the right of the disc: two-tone hull metal, amber gauge screen, keypad ticks -->
    <rect x="320" y="168" width="15" height="23" rx="2.6" fill="#39456a" stroke="#10162a" stroke-width="1"/>
    <rect x="320" y="168" width="15" height="3.2" rx="1.6" fill="#516592"/>
    <rect x="322.5" y="173" width="10" height="6.5" rx="1.2" fill="#1a1206" stroke="#7a6f52" stroke-width="0.6"/>
    <rect x="323.5" y="174" width="5" height="1.6" fill="#ffce54">
      <animate attributeName="width" values="2;8;2" dur="3.2s" repeatCount="indefinite"/>
    </rect>
    <circle cx="331.4" cy="177.6" r="0.9" fill="#ffce54"><animate attributeName="opacity" values="1;0.2;1" dur="1.3s" repeatCount="indefinite"/></circle>
    <g fill="#9fb0cf" opacity="0.7">
      <rect x="323" y="181.6" width="2.2" height="1.6"/><rect x="326.4" y="181.6" width="2.2" height="1.6"/><rect x="329.8" y="181.6" width="2.2" height="1.6"/>
      <rect x="323" y="184.2" width="2.2" height="1.6"/><rect x="326.4" y="184.2" width="2.2" height="1.6"/><rect x="329.8" y="184.2" width="2.2" height="1.6"/>
    </g>
    <!-- fuel-cell canisters stacked beside the pump, glowing amber bands -->
    <rect x="336" y="180" width="7" height="11" rx="2.2" fill="#3d4f79" stroke="#10162a" stroke-width="0.8"/>
    <rect x="336" y="183" width="7" height="2.4" fill="#ffce54" opacity="0.9"/>
    <rect x="343.5" y="177" width="7.6" height="14" rx="2.4" fill="#4a5a86" stroke="#10162a" stroke-width="0.8"/>
    <rect x="343.5" y="181" width="7.6" height="2.8" fill="#ffce54" opacity="0.9">
      <animate attributeName="opacity" values="0.6;1;0.6" dur="2.4s" repeatCount="indefinite"/>
    </rect>
    <!-- hose looping off the pump toward the parked ship's tank (to the left) + nozzle -->
    <path d="M320,174 Q308,175 302,180 Q297,184 293,184" fill="none" stroke="#10162a" stroke-width="2.4"/>
    <path d="M320,174 Q308,175 302,180 Q297,184 293,184" fill="none" stroke="#5a6a96" stroke-width="1.1"/>
    <rect x="289" y="182.4" width="5" height="3.4" rx="1.2" fill="#ffce54" stroke="#b98f4a" stroke-width="0.6"/>
    <!-- neon ⛽ FUEL post beside the island -->
    <line x1="332" y1="168" x2="332" y2="150" stroke="#4a5262" stroke-width="1.6"/>
    <ellipse cx="332" cy="146" rx="14" ry="7.5" fill="#ffce54" opacity="0.14">
      <animate attributeName="opacity" values="0.1;0.22;0.1" dur="4.1s" repeatCount="indefinite"/>
    </ellipse>
    <rect x="320.5" y="141" width="23" height="10" rx="3" fill="#0d1416" stroke="#3a2f1f" stroke-width="1"/>
    <text x="332" y="148.4" text-anchor="middle" font-size="6.4" font-weight="800" fill="#ffdf8a" font-family="Georgia,'Times New Roman',serif" font-style="italic">⛽ FUEL</text>
  </g>`;
}

/** The Marmot out on the deck's par-3 (GS-tent-tips): when its tip jar filled up last run it slips away
 *  from the bar to play golf. A small standing marmot in a red visor, addressing the ball waiting on the
 *  green (at 206,150) with a club. Drawn on top of the turf so it reads against the mown ribbon. */
function marmotGolfer(): string {
  const x = 198;
  const y = 151; // feet on the green, just left of the waiting ball
  return `<g>
    <ellipse cx="${x + 1}" cy="${y + 1.4}" rx="6.5" ry="2" fill="#000" opacity="0.28"/>
    <!-- club: shaft from the paws down to the ball + a little head at the ball -->
    <line x1="${x + 3}" y1="${y - 6}" x2="205.4" y2="149.6" stroke="#dde0e6" stroke-width="1" stroke-linecap="round"/>
    <path d="M204.6,150.4 l3.2,0.5 l-0.5,1.7 l-3.2,-0.5 Z" fill="#8a9099"/>
    <!-- tail + body + belly -->
    <path d="M${x - 3.6},${y - 1} Q${x - 8},${y - 3} ${x - 6.4},${y - 6.5}" fill="none" stroke="#7a4e2c" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="${x}" cy="${y - 4}" rx="4.4" ry="6" fill="#8a5a34"/>
    <ellipse cx="${x + 0.4}" cy="${y - 2.4}" rx="3" ry="3.8" fill="#c79a68" opacity="0.85"/>
    <!-- feet -->
    <ellipse cx="${x - 2}" cy="${y + 0.6}" rx="1.8" ry="1" fill="#7a4e2c"/>
    <ellipse cx="${x + 2}" cy="${y + 0.6}" rx="1.8" ry="1" fill="#7a4e2c"/>
    <!-- arms reaching across to grip the club -->
    <path d="M${x + 1.6},${y - 5.6} Q${x + 3.4},${y - 5.4} ${x + 3},${y - 6}" fill="none" stroke="#8a5a34" stroke-width="2.2" stroke-linecap="round"/>
    <!-- head + ears -->
    <ellipse cx="${x + 1}" cy="${y - 10}" rx="4.4" ry="4" fill="#8a5a34"/>
    <circle cx="${x - 1.4}" cy="${y - 12.8}" r="1.5" fill="#8a5a34"/>
    <circle cx="${x + 3.4}" cy="${y - 12.8}" r="1.5" fill="#8a5a34"/>
    <ellipse cx="${x + 1.6}" cy="${y - 8.6}" rx="2.4" ry="1.9" fill="#c79a68"/>
    <ellipse cx="${x + 1.6}" cy="${y - 9.2}" rx="0.7" ry="0.55" fill="#2a1a10"/>
    <circle cx="${x - 0.2}" cy="${y - 10.6}" r="0.7" fill="#1a120b"/>
    <circle cx="${x + 2.6}" cy="${y - 10.6}" r="0.7" fill="#1a120b"/>
    <!-- jaunty red visor cap -->
    <path d="M${x - 3},${y - 12.4} Q${x + 1},${y - 15} ${x + 5},${y - 12.4}" fill="none" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M${x + 4.4},${y - 12.8} l3,0.4 l-0.4,1.6 l-3,-0.4 Z" fill="#c0392b" opacity="0.9"/>
  </g>`;
}

/** The painted spaceport: ONE floating golf-deck platform (not the old busy orbital ring) adrift in
 *  the bar-window's own sky — blue→purple gradient, a ringed planet + a bright moon, a nebula wash and
 *  drifting asteroids. A hull-metal slab floats on an anti-grav glow; a par-3 putting green crowns it,
 *  the little space-clubhouse (warm windows + a 19th-Hole glow, echoing the bar) at its back, three
 *  holo pads + the fuel station ringing it. Hand-placed (no rng) so it's byte-stable, like the lounge.
 *  `marmotAway` (GS-tent-tips) puts the Marmot on the green playing the par-3 when its tip jar filled up. */
function spaceportArt(marmotAway = false): string {
  // A small cratered asteroid drifting near the deck.
  const asteroid = (x: number, y: number, sc: number, dur: string): string =>
    `<g transform="translate(${x},${y}) scale(${sc})">
      <g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2.4;0 0" dur="${dur}" repeatCount="indefinite"/>
        <path d="M-8,2 L-5,-5 L2,-7 L8,-2 L6,5 L-2,7 Z" fill="#3a4258" stroke="#161a24" stroke-width="1"/>
        <circle cx="1" cy="0" r="2" fill="#2a3040"/><circle cx="-4" cy="2" r="1.2" fill="#2a3040"/>
        <path d="M-5,-5 L2,-7 L5,-4 L-3,-3 Z" fill="#4a5470" opacity="0.7"/>
      </g>
    </g>`;
  // A tiny cel garden tree on the green (grounding shadow, trunk, two-tone canopy).
  const tree = (x: number, y: number, sc: number): string =>
    `<g transform="translate(${x},${y}) scale(${sc})">
      <ellipse cx="0" cy="1.6" rx="6.5" ry="2" fill="#000" opacity="0.25"/>
      <rect x="-1" y="-6" width="2" height="7" fill="#5a3a1f"/>
      <circle cx="0" cy="-9" r="6" fill="#2f7a33"/>
      <circle cx="-2" cy="-11" r="3.4" fill="#3f9a43"/>
    </g>`;
  // An anti-grav emitter under the deck's front rim: a nub + flickering thrust cone.
  const emitter = (x: number, y: number): string =>
    `<rect x="${x - 3}" y="${y - 2}" width="6" height="4" rx="1.4" fill="#3d4f79"/>
     <path d="M${x - 2.6},${y + 2} L${x + 2.6},${y + 2} L${x + 5.5},${y + 13} L${x - 5.5},${y + 13} Z" fill="#7f8bff" opacity="0.3">
       <animate attributeName="opacity" values="0.18;0.4;0.24;0.38;0.18" dur="1.7s" repeatCount="indefinite"/>
     </path>`;
  // Rim lights running around the deck's top edge (ellipse cx200 cy150 rx168 ry46) — cool tones.
  const rim = [10, 40, 70, 110, 140, 170, 200, 230, 250, 290, 320, 350]
    .map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = (200 + 168 * Math.cos(a)).toFixed(1);
      const y = (150 + 46 * Math.sin(a)).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="1.5" fill="${i % 2 ? '#b39dff' : '#7fd6ff'}"><animate attributeName="opacity" values="0.25;1;0.25" dur="2.6s" begin="${(i * 0.22).toFixed(2)}s" repeatCount="indefinite"/></circle>`;
    })
    .join('');
  return `<svg viewBox="0 0 400 230" preserveAspectRatio="xMidYMid slice"
      style="position:absolute;inset:0;width:100%;height:100%;">
    <defs>
      <!-- sky matches the bar's picture window (clWinSky): night blue rising to nebula purple -->
      <linearGradient id="spSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0c1338"/><stop offset="55%" stop-color="#211d4c"/><stop offset="100%" stop-color="#33245e"/>
      </linearGradient>
      <linearGradient id="spDeck" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38456c"/><stop offset="55%" stop-color="#2b3556"/><stop offset="100%" stop-color="#1b2340"/>
      </linearGradient>
      <linearGradient id="spDeckSide" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#222b48"/><stop offset="100%" stop-color="#10152a"/>
      </linearGradient>
      <radialGradient id="spTurf" cx="46%" cy="38%" r="72%">
        <stop offset="0%" stop-color="#4aa84e"/><stop offset="100%" stop-color="#2c6f30"/>
      </radialGradient>
      <clipPath id="spGreenClip"><ellipse cx="200" cy="150" rx="86" ry="26"/></clipPath>
      <radialGradient id="spNebA" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#2bf0c0" stop-opacity="0.13"/><stop offset="100%" stop-color="#2bf0c0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="spNebB" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ff4fd8" stop-opacity="0.11"/><stop offset="100%" stop-color="#ff4fd8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="spVig" cx="50%" cy="48%" r="72%">
        <stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="80%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.4"/>
      </radialGradient>
    </defs>
    <rect width="400" height="230" fill="url(#spSky)"/>
    <!-- nebulae washes behind everything -->
    <ellipse cx="312" cy="40" rx="130" ry="52" fill="url(#spNebA)"/>
    <ellipse cx="70" cy="60" rx="112" ry="50" fill="url(#spNebB)"/>
    <ellipse cx="200" cy="214" rx="180" ry="42" fill="url(#spNebB)" opacity="0.6"/>
    <!-- starfield (a few twinkling) + one shooting star -->
    <g fill="#fff">
      <circle cx="30" cy="26" r="1"/><circle cx="66" cy="14" r="0.7"/><circle cx="118" cy="30" r="0.8"/>
      <circle cx="152" cy="12" r="0.7"/><circle cx="258" cy="16" r="0.8"/><circle cx="300" cy="30" r="0.7"/>
      <circle cx="342" cy="12" r="0.9"/><circle cx="382" cy="34" r="0.7"/><circle cx="14" cy="70" r="0.7"/>
      <circle cx="388" cy="72" r="0.8"/><circle cx="206" cy="8" r="0.7"/><circle cx="96" cy="48" r="0.6"/>
      <circle cx="240" cy="34" r="0.9"><animate attributeName="opacity" values="0.2;1;0.2" dur="2.9s" repeatCount="indefinite"/></circle>
      <circle cx="178" cy="22" r="0.8"><animate attributeName="opacity" values="1;0.2;1" dur="3.7s" repeatCount="indefinite"/></circle>
      <circle cx="8" cy="118" r="0.8"><animate attributeName="opacity" values="0.3;1;0.3" dur="3.1s" repeatCount="indefinite"/></circle>
      <circle cx="394" cy="150" r="0.7"><animate attributeName="opacity" values="1;0.3;1" dur="2.5s" repeatCount="indefinite"/></circle>
    </g>
    <g opacity="0.8">
      <line x1="292" y1="20" x2="320" y2="33" stroke="#fff" stroke-width="1">
        <animate attributeName="opacity" values="0;1;0;0" dur="7s" repeatCount="indefinite"/>
      </line>
    </g>
    <!-- the ringed golden planet + a bright moon, straight off the bar window so it's the same vista -->
    <g transform="translate(58,40)">
      <circle r="15" fill="#d8a24a"/><circle cx="-4" cy="-4" r="15" fill="#e8bd6e" opacity="0.55"/>
      <ellipse rx="25" ry="6" fill="none" stroke="#ffe6a6" stroke-width="2" transform="rotate(-18)" opacity="0.9"/>
      <ellipse rx="25" ry="6" fill="none" stroke="#c98a3e" stroke-width="0.8" transform="rotate(-18)" opacity="0.6"/>
    </g>
    <g transform="translate(340,52)">
      <circle r="9" fill="#eef2ff"/><circle r="9" fill="#c9d2ec" opacity="0.4"/>
      <circle cx="3" cy="-2" r="2" fill="#b9c2e0" opacity="0.6"/><circle cx="-3" cy="3" r="1.4" fill="#b9c2e0" opacity="0.5"/>
    </g>
    ${asteroid(26, 176, 1, '5.2s')}${asteroid(376, 116, 0.7, '6.4s')}
    <!-- ══ THE FLOATING GOLF DECK: an anti-grav slab, its top a hull-metal apron with the green on top ══ -->
    <!-- anti-grav under-glow so the slab reads as floating -->
    <ellipse cx="200" cy="206" rx="150" ry="14" fill="#7f8bff" opacity="0.16">
      <animate attributeName="opacity" values="0.1;0.2;0.1" dur="4.4s" repeatCount="indefinite"/>
    </ellipse>
    <!-- slab thickness (the front rim you see under the deck top) -->
    <path d="M32,150 A168,46 0 0 0 368,150 L368,166 A168,46 0 0 1 32,166 Z" fill="url(#spDeckSide)" stroke="#10152a" stroke-width="1.2"/>
    <!-- anti-grav emitters hanging off the front rim -->
    ${emitter(96, 178)}${emitter(200, 190)}${emitter(304, 178)}
    <!-- deck top -->
    <ellipse cx="200" cy="150" rx="168" ry="46" fill="url(#spDeck)" stroke="#4a5878" stroke-width="1.4"/>
    <!-- faint plating rings on the apron -->
    <ellipse cx="200" cy="150" rx="140" ry="38" fill="none" stroke="#10162a" stroke-width="1" opacity="0.4"/>
    <ellipse cx="200" cy="150" rx="150" ry="41" fill="none" stroke="#2bf0c0" stroke-width="1.4" opacity="0.16">
      <animate attributeName="opacity" values="0.1;0.24;0.1" dur="3.6s" repeatCount="indefinite"/>
    </ellipse>
    ${rim}
    <!-- ══ THE SPACE-GOLF CLUBHOUSE at the back of the deck: warm-lit twin of the bar you were just in,
         so the picture window above literally looks out from HERE. Drawn before the green so the green's
         back fringe tucks against its plinth. -->
    <g>
      <ellipse cx="200" cy="92" rx="58" ry="26" fill="#ffcf8a" opacity="0.12"/>
      <ellipse cx="200" cy="118" rx="50" ry="6" fill="#000" opacity="0.3"/>
      <!-- deck plinth -->
      <rect x="156" y="112" width="88" height="8" rx="2.5" fill="#39456a" stroke="#10162a" stroke-width="1"/>
      <rect x="156" y="112" width="88" height="2.4" fill="#516592"/>
      <!-- lower side wings + warm windows -->
      <g fill="#d8cdb4" stroke="#7a6f52" stroke-width="0.8">
        <rect x="160" y="98" width="18" height="15"/>
        <rect x="222" y="98" width="18" height="15"/>
      </g>
      <g fill="#ffd98a"><rect x="164.5" y="102" width="9" height="8" rx="1"/><rect x="226.5" y="102" width="9" height="8" rx="1"/></g>
      <!-- main hall -->
      <rect x="174" y="90" width="52" height="23" fill="#ece2cd" stroke="#7a6f52" stroke-width="1"/>
      <rect x="174" y="90" width="52" height="3.5" fill="#f6efdd"/>
      <g fill="#cabf9f"><rect x="174" y="90" width="2.2" height="23"/><rect x="223.8" y="90" width="2.2" height="23"/></g>
      <!-- a big warm PICTURE window (the bar's window, seen from outside) + a tall window -->
      <rect x="180" y="96" width="15" height="11" rx="1" fill="#ffd98a" stroke="#b98f4a" stroke-width="0.7"/>
      <g stroke="#b98f4a" stroke-width="0.5" opacity="0.8"><line x1="187.5" y1="96" x2="187.5" y2="107"/><line x1="180" y1="101.5" x2="195" y2="101.5"/></g>
      <rect x="205" y="96" width="9" height="11" rx="1" fill="#ffd98a" stroke="#b98f4a" stroke-width="0.6"/>
      <line x1="209.5" y1="96" x2="209.5" y2="107" stroke="#b98f4a" stroke-width="0.5" opacity="0.7"/>
      <!-- glowing arched doorway -->
      <path d="M198,113 L198,109 Q200.5,106.5 203,109 L203,113 Z" fill="#ffcf7a" stroke="#b98f4a" stroke-width="0.6"/>
      <!-- eave board + pitched green roof (ridge highlight + shaded slope) + pin finial -->
      <rect x="170" y="83" width="60" height="4" rx="1.5" fill="#c9bd9c"/>
      <path d="M167,86 L200,73 L233,86 Z" fill="#2f7a33" stroke="#1e5222" stroke-width="1"/>
      <path d="M200,73 L233,86 L227,86 L200,75.4 Z" fill="#000" opacity="0.14"/>
      <path d="M168,85 L200,73.4 L232,85" fill="none" stroke="#4bbe52" stroke-width="1.1" opacity="0.6"/>
      <line x1="200" y1="73" x2="200" y2="66" stroke="#cfd6de" stroke-width="1"/>
      <path d="M200,66 L208,68.4 L200,70.8 Z" fill="#ff6b6b"/>
      <!-- "19th Hole" neon marquee across the facade under the eave — the bar's own sign, seen from
           outside, so the picture window above looks out from THIS clubhouse -->
      <ellipse cx="200" cy="90.5" rx="30" ry="6" fill="#ff9ad6" opacity="0.14"/>
      <rect x="178" y="86.4" width="44" height="6.6" rx="1.5" fill="#2a0f22" stroke="#5a2440" stroke-width="0.5"/>
      <text x="200" y="91.4" text-anchor="middle" font-size="5" font-weight="800" fill="#ffd6ef" font-family="Georgia,'Times New Roman',serif" font-style="italic">19th Hole</text>
    </g>
    <!-- ══ THE PUTTING GREEN crowning the deck: a real par-3 — turf, mown ribbon, fringe + cup, a
         guarding bunker, tee + ball, a couple of garden trees. Golf, front and centre. -->
    <ellipse cx="200" cy="150" rx="86" ry="26" fill="url(#spTurf)"/>
    <g clip-path="url(#spGreenClip)">
      <!-- turf mottle -->
      <g fill="#215723" opacity="0.2"><ellipse cx="150" cy="156" rx="18" ry="5"/><ellipse cx="242" cy="146" rx="16" ry="4.5"/></g>
      <g fill="#5ec062" opacity="0.12"><ellipse cx="176" cy="144" rx="20" ry="5"/><ellipse cx="238" cy="158" rx="14" ry="4"/></g>
      <!-- mown fairway ribbon tee → green with faint stripes -->
      <path d="M138,160 Q176,156 210,148 Q234,143 252,142" fill="none" stroke="#3f9a43" stroke-width="15" stroke-linecap="round"/>
      <path d="M138,160 Q176,156 210,148 Q234,143 252,142" fill="none" stroke="#ffffff" stroke-width="15" stroke-dasharray="10 10" opacity="0.07"/>
      <!-- the green + fringe + cup -->
      <ellipse cx="252" cy="142" rx="22" ry="9" fill="#5cc160"/>
      <ellipse cx="252" cy="142" rx="22" ry="9" fill="none" stroke="#3f9a43" stroke-width="2.4" opacity="0.9"/>
      <ellipse cx="247" cy="139.5" rx="8.5" ry="2.8" fill="#7fd47f" opacity="0.5"/>
      <ellipse cx="257" cy="143.5" rx="1.8" ry="0.8" fill="#123c14"/>
      <!-- greenside bunker -->
      <path d="M224,152 Q234,148 242,152 Q236,156 226,155.4 Q222,154 224,152 Z" fill="#d8c690"/>
      <path d="M227,152 Q234,149.6 239,152 Q234,154 228,153.6 Z" fill="#e6d6a4"/>
      <!-- tee pad + markers, and the ball waiting mid-fairway -->
      <rect x="130" y="157" width="15" height="6" rx="3" fill="#4aa84e"/>
      <circle cx="132.5" cy="158.4" r="0.8" fill="#e8e2d2"/><circle cx="137.5" cy="161.6" r="0.8" fill="#e8e2d2"/>
      <circle cx="206" cy="150" r="1.6" fill="#fff"/>
      ${tree(146, 142, 0.85)}${tree(232, 158, 0.78)}
    </g>
    <ellipse cx="200" cy="150" rx="86" ry="26" fill="none" stroke="#1e5222" stroke-width="2.4"/>
    ${marmotAway ? marmotGolfer() : ''}
    <!-- the pin on the green (behind the sign; the flag reads against the sky) -->
    <line x1="257" y1="143.5" x2="257" y2="122" stroke="#e8e2d2" stroke-width="1.6"/>
    <path d="M257,122 L273,126 L257,130 Z" fill="#ff6b6b"/>
    <!-- ══ neon SPACEPORT marquee arcing over the deck, on a pair of posts on the back apron -->
    <line x1="132" y1="120" x2="132" y2="46" stroke="#31405f" stroke-width="2"/>
    <line x1="268" y1="120" x2="268" y2="46" stroke="#31405f" stroke-width="2"/>
    <ellipse cx="200" cy="40" rx="66" ry="16" fill="#2bf0c0" opacity="0.12">
      <animate attributeName="opacity" values="0.12;0.2;0.12" dur="5.2s" repeatCount="indefinite"/>
    </ellipse>
    <rect x="140" y="30" width="120" height="22" rx="7" fill="#0d1416" stroke="#1f3a35" stroke-width="1.4"/>
    <text x="200" y="45" text-anchor="middle" font-size="13" font-weight="800" fill="none" stroke="#2bf0c0" stroke-width="3" stroke-linejoin="round" opacity="0.4" font-family="Georgia,'Times New Roman',serif" font-style="italic" letter-spacing="1.5">SPACEPORT</text>
    <text x="200" y="45" text-anchor="middle" font-size="13" font-weight="800" fill="#d9fff4" font-family="Georgia,'Times New Roman',serif" font-style="italic" letter-spacing="1.5">
      SPACEPORT
      <animate attributeName="opacity" values="1;1;0.78;1;0.94;1" dur="6s" repeatCount="indefinite"/>
    </text>
    <!-- the three holo landing pads + the fuel station (ships overlay these as buttons) -->
    ${Object.values(PAD_ART).map(padArt).join('')}
    ${fuelStationArt()}
    <rect width="400" height="230" fill="url(#spVig)"/>
  </svg>`;
}

/** The spaceport panel: the painted deck + the four rides dealt across the berths by the visit shuffle
 *  (so which golfer is topping up at the fuel station changes every run home). */
function spaceportHTML(golfers: LoungeGolfer[], rng: Rng, marmotAway = false): string {
  const berths = shuffle([...BERTHS], rng).slice(0, golfers.length);
  const ships = golfers.map((g, i) => shipAt(g, berths[i] ?? BERTHS[i % BERTHS.length]!)).join('');
  return `<div style="container-type:inline-size;position:relative;width:100%;aspect-ratio:40/23;max-width:680px;
      margin:10px auto 0;border:1px solid #232c42;border-radius:16px;overflow:hidden;background:#0a0d1f;">
      ${spaceportArt(marmotAway)}
      ${ships}
    </div>`;
}

/**
 * Build the full clubhouse-hall HTML: the painted lounge with the golfers placed at seed-shuffled spots,
 * then the spaceport panel below it with each golfer's equipped ride parked on its own pad. `visit` (the
 * finished-run counter) reshuffles both arrangements each time home — the pad draws happen AFTER the spot
 * draws on the same Rng, so the lounge arrangement for a given visit is unchanged by the spaceport.
 */
export function clubhouseLoungeHTML(
  golfers: LoungeGolfer[],
  visit: number,
  marmot = false,
  tips = 0,
  thorHammer = false,
): string {
  const rng = new Rng((visit >>> 0) * 2654435761 + 0x9e37); // spread the small counter across the seed space
  const spots = shuffle([...SPOTS], rng).slice(0, golfers.length);
  const figures = golfers.map((g, i) => golferAt(g, spots[i] ?? SPOTS[i % SPOTS.length]!)).join('');
  // The Marmot's tips ACCUMULATE across runs (GS-tent-tips): the jar fills 1→CAP over successive bonks,
  // and the bonk that would overflow a FULL jar empties it — the Marmot has cashed out its half-dozen
  // and is off playing the spaceport par-3 (so the bar shows no bartender + an empty jar that visit),
  // after which it refills. `tips` is the running total; the visible fill is that total modulo the
  // fill-then-empty cycle (`CAP + 1`), so `balls === 0` (past the first bonk) IS the cash-out visit.
  const balls = tips % (MARMOT_JAR_CAP + 1);
  const away = marmot && tips > 0 && balls === 0;
  // Taller 4:3 frame that grows to fill the screen (was a squat 20:11 letterbox at 520px that left a lot
  // of dead space above/below on a phone). The extra height is foreground floor the golfers stand on.
  return `${loungeStyle()}
    <div style="container-type:inline-size;position:relative;width:100%;aspect-ratio:4/3;max-width:680px;
      margin:0 auto;border:1px solid #3a2f1f;border-radius:16px;overflow:hidden;background:#140d07;">
      ${loungeArt(marmot, balls, away, thorHammer)}
      ${figures}
    </div>
    ${spaceportHTML(golfers, rng, away)}`;
}
