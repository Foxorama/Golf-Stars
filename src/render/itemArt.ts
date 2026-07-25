/**
 * Procedural Pro Shop ITEM art (pure SVG strings) — GS-proshop-2.
 *
 * House rule (same as restArt / zoneHero / the intro): NO downloaded asset to 404 — every shop item
 * gets a self-contained, deterministic vector illustration of the GEAR you're buying (a shaft, a
 * glove, a sleeve of balls, tour spikes, a rangefinder, a themed club, a caddy, a trophy …), tinted by
 * rarity. Pure: no DOM, no rng, no time — placement variety is a fixed hash off the id, so it's
 * byte-stable and testable.
 *
 * The art KIND is resolved from the item id (or, for reward clubs, the set theme). The same themed
 * club look feeds the on-course golfer's swing (see economy.equippedGearTheme + playView.drawGolfer),
 * so the picture you buy is the club you swing.
 */

import type { Rarity } from '../sim/course/contract';
import { rarCol, RARITY_C } from '../sim/rpg/loot';
import { factionForCreditItem } from '../sim/rpg/factions';

const W = 150;
const H = 96;

/** A stable 0..1 hash off a string (FNV-ish) — for deterministic, non-rng placement jitter. */
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 8) / (1 << 24);
}

/** Mix two #rrggbb colours by t (0 = a, 1 = b). */
function mix(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The shop-item ART KIND (what to draw) — keyed off the item id; clubs override via set theme. */
export type ItemArtKind =
  | 'shaft'
  | 'ball'
  | 'glove'
  | 'powerglove'
  | 'coin'
  | 'putter'
  | 'shoes'
  | 'hat'
  | 'jacket'
  | 'pants'
  | 'rangefinder'
  | 'wedge'
  | 'coach'
  | 'trophy'
  | 'thruster'
  | 'fueltank'
  | 'weapon'
  | 'shield'
  | 'caddy'
  | 'club';

/** A few ids draw a flavoured BALL (the tint + effect tells water/lava/void/wind/spin/distance apart). */
const BALL_FLAVOUR: Record<string, string> = {
  'range-booster': 'distance',
  'wind-cheater': 'wind',
  'floater-balls': 'water',
  'magma-balls': 'lava',
  'void-walkers': 'void',
  'rainbow-ball': 'rainbow',
};

const KIND_BY_ID: Record<string, ItemArtKind> = {
  'power-cell': 'shaft',
  gyro: 'shaft',
  'distance-control': 'shaft',
  overdrive: 'shaft',
  'pro-irons': 'shaft',
  'quantum-shafts': 'shaft',
  'nova-driver': 'shaft',
  'distance-driver': 'shaft',
  'distance-woods': 'shaft',
  'distance-hybrids': 'shaft',
  'distance-irons': 'shaft',
  'precision-chip': 'glove',
  'anti-duck-hook': 'glove',
  'hook-corrector': 'glove',
  'slice-corrector': 'glove',
  'draw-weighting': 'glove',
  'power-glove': 'powerglove',
  'lucky-coin': 'coin',
  'fortune-chip': 'coin',
  'putting-grip': 'putter',
  'mallet-putter': 'putter',
  'tour-putter': 'putter',
  'pinseeker-putter': 'putter',
  'tour-spikes': 'shoes',
  rangefinder: 'rangefinder',
  'spin-milled': 'wedge',
  'wedge-touch': 'wedge',
  'flop-wedge': 'wedge',
  'sweet-spot': 'wedge',
  'shank-guard': 'wedge',
  'pro-coach': 'coach',
  'caddie-lesson': 'coach',
  'birdie-hunter': 'trophy',
  'eagle-eye': 'trophy',
  'comeback-kid': 'trophy',
  'glass-cannon': 'trophy',
  'range-booster': 'ball',
  'wind-cheater': 'ball',
  'floater-balls': 'ball',
  'magma-balls': 'ball',
  'void-walkers': 'ball',
  'rainbow-ball': 'ball',
  'ion-thrusters': 'thruster',
  'reserve-tank': 'fueltank',
};

/** Resolve the art kind for an item id. Named caddies → 'caddy'; reward clubs → 'club'. */
export function itemArtKind(id: string): ItemArtKind {
  if (id.startsWith('club:')) return 'club';
  // Story-Tour gear ids (`gear:<slot>:<variant>`, GS-story-gear) draw their slot's kit: a glove, shoes,
  // a ball, a cap. The variant + rarity tint tell them apart; a new slot maps to a new/existing drawing.
  if (id.startsWith('gear:')) {
    const slot = id.split(':')[1];
    const variant = id.split(':')[2];
    // A few gear ids draw a more specific kit than their slot's default (GS-story-shop-depth): the Power
    // Glove gets the NES powerglove art, the rangefinder visor the rangefinder, a distance/economy shaft
    // its own shaft/coin drawing — so a distinct item reads distinct on the rack.
    if (slot === 'glove') return variant === 'power' ? 'powerglove' : 'glove';
    if (slot === 'shoes') return 'shoes';
    if (slot === 'ball') return 'ball';
    if (slot === 'hat') return variant === 'range' ? 'rangefinder' : 'hat';
    if (slot === 'shaft') return 'shaft';
    if (slot === 'wedge') return 'wedge'; // GS-story-wedge-slot: the short-game slot → a wedge head
    if (slot === 'bag') return 'coin'; // the economy slot → a credit-coin emblem
    if (slot === 'jacket') return 'jacket'; // GS-story-clothing: a tailored jacket
    if (slot === 'pants') return 'pants'; // GS-story-clothing: trousers
  }
  // Story-Tour ship upgrades (`upg:<category>:<variant>`, GS-story-ship-upgrades): a weapon turret, an
  // engine (reuses the thruster art), a deflector shield.
  if (id.startsWith('upg:')) {
    const cat = id.split(':')[1];
    if (cat === 'weapon') return 'weapon';
    if (cat === 'engine') return 'thruster';
    if (cat === 'shield') return 'shield';
  }
  return KIND_BY_ID[id] ?? 'caddy'; // caddies + anything unmapped get the caddy bag glyph
}

function frame(inner: string, col: string, opts: { height?: number } = {}): string {
  const dark = mix(col, '#0b0d12', 0.72);
  const darker = mix(col, '#0b0d12', 0.88);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"${opts.height ? ` height="${opts.height}"` : ''} preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;aspect-ratio:${W}/${H};border-radius:9px;background:radial-gradient(120% 120% at 30% 20%, ${dark}, ${darker});">
    <defs><radialGradient id="g" cx="32%" cy="26%" r="80%"><stop offset="0" stop-color="${mix(col, '#ffffff', 0.25)}" stop-opacity="0.5"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g)"/>
    ${inner}
  </svg>`;
}

/** A small sleeve of stars sprinkled for a "space gear" feel, deterministic off `seed`. */
function sparkles(seed: string, col: string, n = 5): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = 8 + hash01(seed + 'x' + i) * (W - 16);
    const y = 6 + hash01(seed + 'y' + i) * (H - 12);
    const r = 0.6 + hash01(seed + 'r' + i) * 1.2;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" opacity="${(0.4 + hash01(seed + 'o' + i) * 0.5).toFixed(2)}"/>`;
  }
  return s;
}

// --- Per-id EMBLEM roundels (GS-proshop-3) -----------------------------------
// Several items share a base art KIND (4 shafts, 5 gloves, 4 wedges, 4 trophies, 2 coins/putters/
// coaches). The base glyph keeps each "the right picture for the item" (a glove looks like a glove);
// a small top-right emblem roundel — a vector symbol of what the item DOES — makes every card UNIQUE
// and reads its function at a glance. Pure, deterministic (keyed off the id only).

/** A small symbol roundel pinned top-right, holding a per-id function emblem. */
function roundel(inner: string, col: string): string {
  return `<g transform="translate(131 21)">
    <circle r="14" fill="#0b0d12" stroke="${col}" stroke-width="1.6"/>
    <circle r="14" fill="${mix(col, '#ffffff', 0.3)}" opacity="0.1"/>
    ${inner}
  </g>`;
}

/** A right-curving arrow (slice) or its mirror (hook) — `dir` 1 = right, −1 = left. */
function curveArrow(col: string, dir: 1 | -1, crossed = false): string {
  const d = dir;
  const slash = crossed ? `<path d="M -10 -10 L 10 10" stroke="#ff5d5d" stroke-width="2.4" stroke-linecap="round"/>` : '';
  return `<g transform="scale(${d} 1)" stroke="${col}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M -6 9 Q -6 -6 7 -8"/>
      <path d="M 7 -8 l -5 -1 m 5 1 l -1 5" />
    </g>${slash}`;
}

/** Tightening-window brackets around a club-family initial — the per-category distance-control emblem. */
function familyControlEmblem(col: string, letter: string): string {
  return `<g stroke="${col}" stroke-width="1.7" fill="none" stroke-linecap="round"><path d="M -10 -9 v 18 M 10 -9 v 18"/></g><text x="0" y="4.5" font-size="12" font-weight="700" fill="${col}" stroke="none" text-anchor="middle" font-family="system-ui, sans-serif">${letter}</text>`;
}

/** The per-id function emblem (vector symbol authored around the roundel origin, ±11). */
const EMBLEM: Record<string, (col: string) => string> = {
  // Shafts ----------------------------------------------------------------
  'power-cell': (c) => `<path d="M 2 -10 L -6 1 L -1 1 L -3 10 L 6 -2 L 1 -2 Z" fill="${c}"/>`, // power bolt
  gyro: (c) =>
    `<g fill="none" stroke="${c}" stroke-width="1.6"><circle r="2.6"/><ellipse rx="10" ry="4.2"/><ellipse rx="10" ry="4.2" transform="rotate(60)"/><ellipse rx="10" ry="4.2" transform="rotate(120)"/></g>`, // gyroscope rings
  'distance-control': (c) =>
    `<g stroke="${c}" stroke-width="1.7" fill="none" stroke-linecap="round"><path d="M -9 -8 v 16 M 9 -8 v 16"/><path d="M -7 0 h 6 M -1 0 l -3 -3 m 3 3 l -3 3"/><path d="M 7 0 h -6 M 1 0 l 3 -3 m -3 3 l 3 3"/></g>`, // tightening window
  overdrive: (c) =>
    `<g stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M -8 -6 l 5 6 l -5 6"/><path d="M 0 -6 l 5 6 l -5 6"/></g>`, // speed chevrons
  // Per-category distance control (GS-proshop-distance-items): the tightening-window brackets + the
  // club-family initial, so the four cards read Driver / Woods / Hybrids / Irons at a glance.
  'distance-driver': (c) => familyControlEmblem(c, 'D'),
  'distance-woods': (c) => familyControlEmblem(c, 'W'),
  'distance-hybrids': (c) => familyControlEmblem(c, 'H'),
  'distance-irons': (c) => familyControlEmblem(c, 'I'),
  // Gloves ----------------------------------------------------------------
  'precision-chip': (c) =>
    `<g stroke="${c}" stroke-width="1.6" fill="none"><circle r="8"/><path d="M 0 -11 v 5 M 0 11 v -5 M -11 0 h 5 M 11 0 h -5"/></g><circle r="1.8" fill="${c}"/>`, // crosshair
  'anti-duck-hook': (c) => curveArrow(c, -1, true), // crossed-out hard left
  'hook-corrector': (c) => curveArrow(c, -1), // left curve
  'slice-corrector': (c) => curveArrow(c, 1), // right curve
  'draw-weighting': (c) =>
    `<g stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 8 -8 Q -8 -8 -8 8"/><path d="M -8 8 l 5 -1 m -5 1 l 1 -5"/></g>`, // draw shape
  'power-glove': (c) => `<path d="M 2 -10 L -6 1 L -1 1 L -3 10 L 6 -2 L 1 -2 Z" fill="${c}"/>`, // MAX power bolt
  // Coins -----------------------------------------------------------------
  'lucky-coin': (c) =>
    `<g fill="${c}"><circle cx="0" cy="-5" r="3.6"/><circle cx="-5" cy="0" r="3.6"/><circle cx="5" cy="0" r="3.6"/><circle cx="0" cy="5" r="3.6"/></g><rect x="-1" y="0" width="2" height="8" fill="${c}"/>`, // clover
  'fortune-chip': (c) =>
    `<path d="M 0 -10 L 9 -6 L 9 3 Q 9 9 0 11 Q -9 9 -9 3 L -9 -6 Z" fill="none" stroke="${c}" stroke-width="1.6"/><text y="4" font-size="11" text-anchor="middle" fill="${c}" font-weight="bold" font-family="Georgia,serif">$</text>`, // sponsor shield
  // Putters ---------------------------------------------------------------
  'putting-grip': (c) =>
    `<g stroke="${c}" stroke-width="1.7" stroke-linecap="round"><path d="M -7 -9 l 14 5 M -7 -3 l 14 5 M -7 3 l 14 5"/></g>`, // grip wrap lines
  'tour-putter': (c) =>
    `<path d="M 0 -10 l 2.6 6.3 l 6.8 .5 l -5.2 4.4 l 1.7 6.6 l -5.9 -3.6 l -5.9 3.6 l 1.7 -6.6 l -5.2 -4.4 l 6.8 -.5 Z" fill="${c}"/>`, // star
  // Wedges ----------------------------------------------------------------
  'sweet-spot': (c) =>
    `<g fill="none" stroke="${c}" stroke-width="1.5"><circle r="9"/><circle r="5"/></g><circle r="1.8" fill="${c}"/>`, // bullseye
  'wedge-touch': (c) =>
    `<g stroke="${c}" stroke-width="1.6" fill="none"><path d="M 0 -10 v 6 M 0 10 v -6 M -10 0 h 6 M 10 0 h -6"/></g><circle r="2.4" fill="${c}"/>`, // pin-point
  'shank-guard': (c) => curveArrow(c, 1, true), // crossed-out hard right
  'spin-milled': (c) =>
    `<path d="M 0 0 m 0 -2 a 2 2 0 0 1 2 2 a 4 4 0 0 1 -4 4 a 6 6 0 0 1 -6 -6 a 8 8 0 0 1 8 -8 a 10 10 0 0 1 10 10" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`, // spin spiral
  // Coaches ---------------------------------------------------------------
  'pro-coach': (c) =>
    `<g fill="none" stroke="${c}" stroke-width="1.6"><circle cx="2" cy="0" r="5"/><path d="M -3 0 L -10 -4 L -10 4 Z" fill="${c}"/></g>`, // whistle
  'caddie-lesson': (c) =>
    `<g fill="${c}"><path d="M 0 -8 L 11 -3 L 0 2 L -11 -3 Z"/><path d="M 0 2 L 7 -1 v 5 Q 0 8 -7 4 v -5 Z" opacity="0.85"/></g>`, // mortarboard
  // Trophies / relics -----------------------------------------------------
  'birdie-hunter': (c) =>
    `<path d="M -10 2 Q -3 -8 0 -2 Q 3 -8 10 2 Q 3 0 0 6 Q -3 0 -10 2 Z" fill="${c}"/>`, // bird in flight
  'eagle-eye': (c) =>
    `<g fill="none" stroke="${c}" stroke-width="1.6"><path d="M -10 0 Q 0 -8 10 0 Q 0 8 -10 0 Z"/></g><circle r="3" fill="${c}"/>`, // eye
  'comeback-kid': (c) =>
    `<g stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 0 9 V -8"/><path d="M -6 -2 L 0 -9 L 6 -2"/></g>`, // up arrow
  'glass-cannon': (c) =>
    `<g stroke="${c}" stroke-width="1.8" fill="none" stroke-linecap="round"><path d="M 0 -10 L 2 -2 L 9 -1 L 3 3 L 6 10 L 0 5 L -6 10 L -3 3 L -9 -1 L -2 -2 Z"/></g>`, // burst
  // Singles (already unique by kind, but an emblem adds flavour) -----------
  'tour-spikes': (c) => `<g fill="${c}"><circle cx="-6" cy="-5" r="2.2"/><circle cx="5" cy="-6" r="2.2"/><circle cx="-3" cy="4" r="2.2"/><circle cx="7" cy="3" r="2.2"/><circle cx="-8" cy="2" r="2.2"/></g>`, // cleats
  rangefinder: (c) =>
    `<g fill="none" stroke="${c}" stroke-width="1.6"><circle r="9"/><path d="M 0 -12 v 5 M 0 12 v -5 M -12 0 h 5 M 12 0 h -5"/></g><circle r="2" fill="${c}"/>`, // reticle
};

// --- Faction credit TOKENS (GS-credit-factions) ------------------------------
// The four credit-boost items are each ISSUED by a galaxy faction (see sim/rpg/factions.ts
// CREDIT_ITEM_FACTION): the Sponsors' Syndicate (+15%), the Fortune Cartel (+20%), the Birdie Hunters
// (per-birdie bounty), the Eagle Order (per-eagle bounty). Instead of a generic coin/trophy they wear
// their house's CREST on a struck medallion, so each reads as "factionally specific" at a glance.

/** The house accent colour for each credit-issuing faction (the medallion's metal + rim). */
const FACTION_ACCENT: Record<string, string> = {
  'sponsors-syndicate': '#4bb3ff', // corporate blue-chrome
  'fortune-cartel': '#37c76a', // casino green
  'birdie-hunters': '#e6a93a', // lodge amber
  'eagle-order': '#d9a441', // raptor gold
};

/**
 * A faction CREST symbol, authored around the origin at roughly ±13 so it scales cleanly into the
 * token medallion. `c` is the crest's line/fill colour (a bright tint of the house accent).
 */
const FACTION_CREST: Record<string, (c: string) => string> = {
  // Sponsors' Syndicate — a backer's patch: a shield holding a rising-growth arrow crowned by a star.
  'sponsors-syndicate': (c) => `<g>
    <path d="M0 -13 L12 -9 L12 3 Q12 11 0 15 Q-12 11 -12 3 L-12 -9 Z" fill="${c}" opacity="0.14"/>
    <path d="M0 -13 L12 -9 L12 3 Q12 11 0 15 Q-12 11 -12 3 L-12 -9 Z" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>
    <g stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M-7 4 L-1 -2 L3 2 L8 -5"/><path d="M8 -5 l-4 0 m4 0 l0 4"/></g>
    <path d="M0 -11 l1.4 3.1 3.4 .3 -2.6 2.2 .8 3.3 -3 -1.8 -3 1.8 .8 -3.3 -2.6 -2.2 3.4 -.3 Z" fill="${c}"/>
  </g>`,
  // Fortune Cartel — a lucky horseshoe cradling a four-leaf clover.
  'fortune-cartel': (c) => `<g>
    <path d="M-9 9 Q-13 -11 0 -12.5 Q13 -11 9 9" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="-9" cy="9" r="1.7" fill="${c}"/><circle cx="9" cy="9" r="1.7" fill="${c}"/>
    <g fill="${c}"><circle cx="0" cy="-3.4" r="3"/><circle cx="-3.4" cy="0.4" r="3"/><circle cx="3.4" cy="0.4" r="3"/><circle cx="0" cy="4.2" r="3"/></g>
    <path d="M0 3 Q1.5 8 4 10" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
  </g>`,
  // Birdie Hunters — a bird framed dead-centre in a hunter's crosshair.
  'birdie-hunters': (c) => `<g>
    <circle r="12.5" fill="none" stroke="${c}" stroke-width="1.3" opacity="0.7"/>
    <circle r="7.5" fill="none" stroke="${c}" stroke-width="1"/>
    <g stroke="${c}" stroke-width="1.7" stroke-linecap="round"><path d="M0 -14 v4 M0 14 v-4 M-14 0 h4 M14 0 h-4"/></g>
    <path d="M-6.5 1.5 Q-3 -4 0 -1 Q3 -4 6.5 1.5" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>
  </g>`,
  // Eagle Order — an heraldic spread eagle with a piercing eye.
  'eagle-order': (c) => `<g>
    <circle r="13" fill="none" stroke="${c}" stroke-width="1.1" opacity="0.55"/>
    <path d="M0 -2 Q-11 -9 -13.5 -0.5 Q-9 -3 -6 -0.5 Q-11 1.5 -12.5 8 Q-6.5 3 -1 4 Z" fill="${c}"/>
    <path d="M0 -2 Q11 -9 13.5 -0.5 Q9 -3 6 -0.5 Q11 1.5 12.5 8 Q6.5 3 1 4 Z" fill="${c}"/>
    <path d="M0 -3 v7" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="0" cy="-7" r="3.2" fill="${c}"/>
    <circle cx="0" cy="-7" r="1.3" fill="#0b0d12"/>
    <path d="M0 -9 l3 -1.5" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
  </g>`,
};

/** A faction crest symbol (empty for an unknown faction). Exported for the corner-sigil reuse. */
export function factionCrest(factionId: string, col: string): string {
  return FACTION_CREST[factionId]?.(col) ?? '';
}

/**
 * A struck-metal MEDALLION bearing a faction's crest — the card for the four credit-boost tokens
 * (GS-credit-factions). Metallic disc in the house accent, crest embossed on the face, a soft house
 * corona so it reads as a prized commission. Pure, deterministic.
 */
function drawCreditToken(factionId: string, col: string, seed: string): string {
  const accent = FACTION_ACCENT[factionId] ?? col;
  const cx = 72;
  const cy = 47;
  const rim = mix(accent, '#ffffff', 0.4);
  const face = mix(accent, '#0b0d12', 0.52);
  const crest = factionCrest(factionId, mix(accent, '#ffffff', 0.55));
  // A soft house-tinted corona (stacked translucent discs, no gradient def → no shared-id collision).
  const corona = [30, 23, 16]
    .map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="${(0.05 + i * 0.04).toFixed(2)}"/>`)
    .join('');
  return frame(
    `${sparkles(seed, accent, 6)}${corona}
     <ellipse cx="${cx}" cy="84" rx="30" ry="6" fill="rgba(0,0,0,0.32)"/>
     <circle cx="${cx}" cy="${cy}" r="33" fill="${face}" stroke="${rim}" stroke-width="3"/>
     <circle cx="${cx}" cy="${cy}" r="33" fill="${mix(accent, '#ffffff', 0.3)}" opacity="0.08"/>
     <circle cx="${cx}" cy="${cy}" r="26.5" fill="none" stroke="${mix(accent, '#ffffff', 0.5)}" stroke-width="1.2" opacity="0.6"/>
     <path d="M ${cx - 20} ${cy - 20} A 33 33 0 0 1 ${cx + 20} ${cy - 20}" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.28"/>
     <g transform="translate(${cx} ${cy}) scale(1.55)">${crest}</g>`,
    col,
  );
}

/** Legendary "awesome" flair: a radiant gold corona burst + extra glints behind the gear. */
function legendaryFlair(col: string): string {
  const gold = mix(col, '#ffe6a0', 0.4);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const x0 = 36 + Math.cos(a) * 18;
    const y0 = 46 + Math.sin(a) * 18;
    const x1 = 36 + Math.cos(a) * (30 + (i % 2) * 8);
    const y1 = 46 + Math.sin(a) * (30 + (i % 2) * 8);
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}"/>`;
  }).join('');
  // A soft corona built from stacked translucent circles (no gradient <def> → no document-global id
  // collision when several legendary cards share a page).
  const corona = [22, 17, 12]
    .map((r, i) => `<circle cx="30" cy="44" r="${r}" fill="${gold}" opacity="${(0.05 + i * 0.04).toFixed(2)}"/>`)
    .join('');
  return `<g>${corona}<g stroke="${gold}" stroke-width="1.2" stroke-linecap="round" opacity="0.32">${rays}</g></g>`;
}

/** Overlay extra content just inside the closing tag of a frame's `<svg>`. */
function withOverlay(svg: string, extra: string): string {
  return extra ? svg.replace(/<\/svg>\s*$/, `${extra}</svg>`) : svg;
}

/** The iconic 1989 NES Power Glove — the new legendary MAX-power item. */
function drawPowerGlove(col: string, seed: string): string {
  const silver = '#c9ccd4';
  const dark = '#2b2f3a';
  const orange = '#e0662a';
  return frame(
    `${sparkles(seed, col, 5)}
     <g transform="translate(58 50) rotate(-18)">
       <!-- forearm gauntlet -->
       <rect x="-30" y="6" width="40" height="34" rx="6" fill="${dark}" stroke="#11141b" stroke-width="2"/>
       <rect x="-30" y="6" width="40" height="13" rx="6" fill="${silver}" stroke="#11141b" stroke-width="2"/>
       <!-- control pad -->
       <rect x="-26" y="22" width="32" height="15" rx="2" fill="#15171d" stroke="#0a0c10" stroke-width="1.5"/>
       <rect x="-24" y="24" width="11" height="8" rx="1" fill="#0c2a16" stroke="#1f6e3a" stroke-width="0.8"/>
       <text x="-18.5" y="30.5" font-size="5.5" text-anchor="middle" fill="#48e27a" font-family="monospace">88</text>
       <g fill="${orange}"><rect x="-10" y="24" width="3.5" height="3.5" rx="0.6"/><rect x="-5.5" y="24" width="3.5" height="3.5" rx="0.6"/><rect x="-1" y="24" width="3.5" height="3.5" rx="0.6"/>
         <rect x="-10" y="28.5" width="3.5" height="3.5" rx="0.6"/><rect x="-5.5" y="28.5" width="3.5" height="3.5" rx="0.6"/><rect x="-1" y="28.5" width="3.5" height="3.5" rx="0.6"/></g>
       <!-- hand + fingers -->
       <path d="M 8 4 q 14 -2 20 6 q 4 6 -2 9 l -18 5 q -8 1 -8 -8 l 0 -10 q 0 -6 8 -7 z" fill="${silver}" stroke="#11141b" stroke-width="2" stroke-linejoin="round"/>
       <g fill="${silver}" stroke="#11141b" stroke-width="1.6">
         <rect x="24" y="-6" width="7" height="16" rx="3" transform="rotate(10 27 2)"/>
         <rect x="26" y="2" width="7" height="16" rx="3" transform="rotate(2 29 10)"/>
         <rect x="24" y="11" width="7" height="15" rx="3" transform="rotate(-8 27 18)"/>
         <rect x="20" y="18" width="6" height="13" rx="3" transform="rotate(-18 23 24)"/>
       </g>
       <!-- gold finger sensors -->
       <g fill="#f2c14e"><rect x="25" y="-3" width="5" height="2.4" rx="1" transform="rotate(10 27 2)"/><rect x="27" y="5" width="5" height="2.4" rx="1" transform="rotate(2 29 10)"/><rect x="25" y="14" width="5" height="2.4" rx="1" transform="rotate(-8 27 18)"/></g>
     </g>`,
    col,
  );
}

/** A golf ball with dimples, optionally tinted. */
function ballGlyph(cx: number, cy: number, r: number, fill = '#ffffff', stroke = '#c2c7d1'): string {
  const dim = (dx: number, dy: number, dr: number) =>
    `<circle cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" r="${dr}" fill="rgba(0,0,0,0.14)"/>`;
  return `
    <ellipse cx="${cx}" cy="${(cy + r * 0.85).toFixed(1)}" rx="${(r * 0.95).toFixed(1)}" ry="${(r * 0.28).toFixed(1)}" fill="rgba(0,0,0,0.35)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    <circle cx="${(cx - r * 0.34).toFixed(1)}" cy="${(cy - r * 0.32).toFixed(1)}" r="${(r * 0.4).toFixed(1)}" fill="#ffffff" opacity="0.5"/>
    ${dim(r * 0.3, r * 0.1, 1.5)}${dim(-r * 0.05, r * 0.38, 1.4)}${dim(r * 0.4, -r * 0.3, 1.1)}${dim(-r * 0.36, r * 0.02, 1.2)}`;
}

// --- The per-kind drawings ---------------------------------------------------

// --- Club heads by FAMILY (GS-club-icons) ------------------------------------
// The old single "shaft" glyph drew ONE rounded blob for every club item, and with the shaft driving
// into the middle of that blob it read as a SHOVEL. Now each club family gets its own head silhouette,
// authored in WORLD coords anchored at a shared HOSEL so the shaft always meets the HEEL (never the
// centre — that was the shovel tell): the driver is a deep bulbous titanium pear, a wood a shallower
// compact pear on sole rails, a hybrid a stubby rounded rescue head, an iron a thin grooved cavity
// blade, a wedge a lofted grooved blade with a wide sole flange, a putter a flat mallet. Pure SVG.

export type ClubFamily = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';

/** Classify a bag club TYPE id ('D','3W','5H','7i','SW','60','chip','putter') into a family. */
export function clubFamilyOf(type: string): ClubFamily {
  if (type === 'putter') return 'putter';
  if (type === 'D') return 'driver';
  if (/W$/.test(type)) return 'wood';
  if (/H$/.test(type)) return 'hybrid';
  if (/i$/.test(type)) return 'iron';
  return 'wedge'; // PW, GW, SW, 60°, 64°, chip
}

/** Which club family each shaft/gear shop item illustrates (default: driver — the flagship stick). */
const SHAFT_FAMILY: Record<string, ClubFamily> = {
  'power-cell': 'driver',
  overdrive: 'driver',
  'distance-driver': 'driver',
  'nova-driver': 'driver',
  'distance-woods': 'wood',
  'distance-hybrids': 'hybrid',
  gyro: 'iron',
  'distance-control': 'iron',
  'distance-irons': 'iron',
  'pro-irons': 'iron',
  'quantum-shafts': 'iron',
};

// The shared hosel anchor: the shaft ends here and every head hangs off it, soled near y≈84.
const HOSEL_X = 99;
const HOSEL_Y = 61;

/** The rubber grip + graphite shaft, ending at the hosel; a ferrule caps the join. */
function clubShaft(col: string): string {
  const grip = mix(col, '#1b1f29', 0.15);
  const steel = mix(col, '#c9d2e0', 0.5);
  return `
     <line x1="24" y1="14" x2="40" y2="24" stroke="${grip}" stroke-width="9" stroke-linecap="round"/>
     <g stroke="#0b0d12" stroke-width="0.8" opacity="0.5"><path d="M27 15 l-3 4 M31 18 l-3 4 M35 21 l-3 4"/></g>
     <line x1="38" y1="23" x2="${HOSEL_X}" y2="${HOSEL_Y}" stroke="#1b1f29" stroke-width="6.5" stroke-linecap="round"/>
     <line x1="38" y1="23" x2="${HOSEL_X}" y2="${HOSEL_Y}" stroke="${steel}" stroke-width="3.2" stroke-linecap="round"/>
     <line x1="39" y1="22" x2="${HOSEL_X - 8}" y2="${HOSEL_Y - 7}" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/>
     <rect x="${HOSEL_X - 5}" y="${HOSEL_Y - 3}" width="8" height="7" rx="2" transform="rotate(37 ${HOSEL_X} ${HOSEL_Y})" fill="#0b0d12"/>`;
}

/** The head silhouette for a family, drawn in world coords hanging off the shared hosel. */
function clubHead(family: ClubFamily, col: string): string {
  const head = mix(col, '#e8edf5', 0.34);
  const crown = mix(col, '#ffffff', 0.55);
  const face = mix(col, '#aeb8c8', 0.42);
  const dark = '#11141b';
  const groove = mix(col, '#11141b', 0.4);
  switch (family) {
    case 'driver':
      // Big deep titanium head sitting on a FLAT sole (the resting-club cue) — tall leading face on
      // the heel side, crown doming back to a rounded toe. The widest, deepest of the three.
      return `<g>
        <path d="M 98 60 C 93 64 92 72 96 78 L 100 83 L 130 83 C 140 83 144 70 137 62 C 130 56 112 55 103 57 C 100 58 99 59 98 60 Z" fill="${head}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 104 60 C 114 57 127 58 134 63" fill="none" stroke="${crown}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
        <path d="M 96 65 L 100 66 L 100 82 L 97 79 C 94 74 94 69 96 65 Z" fill="${face}" opacity="0.75"/>
        <path d="M 96 64 L 100 62" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.55"/>
        <circle cx="120" cy="67" r="1.5" fill="${crown}" opacity="0.75"/>
      </g>`;
    case 'wood':
      // Shallower, compact head on a flat sole with a pair of sole rails — reads distinctly smaller
      // and flatter than the driver.
      return `<g>
        <path d="M 99 61 C 95 64 94 71 98 76 L 101 80 L 124 80 C 132 80 135 68 129 62 C 122 57 107 56 99 61 Z" fill="${head}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 104 61 C 112 58 122 59 128 63" fill="none" stroke="${crown}" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
        <path d="M 97 65 L 101 66 L 101 79 L 99 76 C 96 72 96 68 97 65 Z" fill="${face}" opacity="0.75"/>
        <g stroke="${face}" stroke-width="1.3" stroke-linecap="round" opacity="0.85"><path d="M 106 79 L 122 76"/><path d="M 106 81.5 L 120 78.8"/></g>
      </g>`;
    case 'hybrid':
      // Stubby, upright rescue head on a flat sole with a single rail — the smallest, chunkiest of the
      // three rounded heads.
      return `<g>
        <path d="M 99 61 C 95 64 95 71 99 76 L 102 79 L 118 79 C 125 79 127 67 121 62 C 115 57 104 57 99 61 Z" fill="${head}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 104 61 C 110 58 118 59 123 63" fill="none" stroke="${crown}" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>
        <path d="M 98 65 L 102 66 L 102 78 L 100 75 C 97 71 97 68 98 65 Z" fill="${face}" opacity="0.75"/>
        <path d="M 106 78 L 118 75.5" stroke="${face}" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/>
      </g>`;
    case 'iron':
      // Thin cavity-back blade with a distinct hosel neck + grooved face — clearly a bladed iron.
      return `<g>
        <path d="M 98 58 L 103 60 L 101 66 L 96 64 Z" fill="${head}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M 100 63 L 106 66 L 128 82 L 122 85 L 99 71 Z" fill="${head}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M 103 65 L 124 80" stroke="${crown}" stroke-width="1" opacity="0.5"/>
        <g stroke="${groove}" stroke-width="0.9" stroke-linecap="round" opacity="0.75">
          <path d="M 104 70 L 118 80"/><path d="M 107 68.5 L 121 78.5"/><path d="M 110 67 L 124 77"/><path d="M 113 65.5 L 126 75"/>
        </g>
      </g>`;
    case 'wedge':
      // Lofted grooved blade laid open, with a wider sole flange — reads as a scoring wedge.
      return `<g>
        <path d="M 98 58 L 103 59 L 102 66 L 97 65 Z" fill="${head}" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M 100 63 L 108 64 L 132 74 Q 137 78 131 82 L 101 74 Q 95 70 100 63 Z" fill="${head}" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
        <g stroke="${groove}" stroke-width="0.9" stroke-linecap="round" opacity="0.75">
          <path d="M 104 66 L 126 74"/><path d="M 103 69 L 127 76.5"/><path d="M 103 72 L 126 78.5"/>
        </g>
        <path d="M 101 76 Q 108 82 131 82" fill="none" stroke="${dark}" stroke-width="1" opacity="0.4"/>
      </g>`;
    case 'putter':
      // Flat mallet blade with an alignment line.
      return `<g>
        <rect x="97" y="72" width="40" height="12" rx="3" fill="${head}" stroke="${dark}" stroke-width="2"/>
        <rect x="100" y="72" width="6" height="12" fill="${face}" opacity="0.6"/>
        <line x1="118" y1="72" x2="118" y2="84" stroke="${col}" stroke-width="2"/>
      </g>`;
  }
}

/** Draw a full club (grip + shaft + family head) inside the shop-card frame. */
function drawShaft(col: string, seed: string, family: ClubFamily = 'driver'): string {
  return frame(`${sparkles(seed, col, 5)}${clubShaft(col)}${clubHead(family, col)}`, col);
}

/** Story gear ball ids (`gear:ball:<variant>`) map to the same flavours as the Voyage balls, so a floater
 *  draws water, a magma-skimmer draws lava, a void-walker draws the void, etc. (GS-story-shop-depth). */
const STORY_BALL_FLAVOUR: Record<string, string> = {
  range: 'distance', wind: 'wind', floater: 'water', magma: 'lava', void: 'void', venom: 'lava',
};
function drawBall(id: string, col: string, seed: string): string {
  const storyVariant = id.startsWith('gear:ball:') ? id.split(':')[2] : undefined;
  const flav = (storyVariant ? STORY_BALL_FLAVOUR[storyVariant] : undefined) ?? BALL_FLAVOUR[id] ?? 'distance';
  const cx = 80;
  const cy = 50;
  const r = 26;
  let fx = '#ffffff';
  let extra = '';
  if (flav === 'wind') {
    fx = mix('#cfe6ff', col, 0.25);
    extra = `<g stroke="${mix('#dff0ff', col, 0.2)}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.85">
      <path d="M 8 34 q 26 -6 44 0"/><path d="M 4 50 q 30 -7 50 0"/><path d="M 10 66 q 24 -5 40 0"/></g>`;
  } else if (flav === 'water') {
    fx = mix('#bfe0ff', col, 0.2);
    extra = `<g stroke="#8fd0ff" stroke-width="2" fill="none" opacity="0.8">
      <ellipse cx="80" cy="84" rx="40" ry="6"/><ellipse cx="80" cy="86" rx="26" ry="4"/></g>
      <path d="M 50 84 q 8 -10 0 -18 q -8 8 0 18" fill="#9bd6ff" opacity="0.7"/>`;
  } else if (flav === 'lava') {
    fx = mix('#ffd0a0', '#ff7a3c', 0.4);
    extra = `<g fill="#ff7a3c" opacity="0.85"><ellipse cx="80" cy="84" rx="40" ry="6"/></g>
      <g stroke="#ffcf5a" stroke-width="2" fill="none" opacity="0.9"><path d="M 64 50 q 6 -8 0 -16"/><path d="M 92 52 q -5 -7 1 -14"/></g>`;
  } else if (flav === 'void') {
    fx = mix('#d8c4ff', '#7a4ad8', 0.35);
    extra = sparkles(seed + 'void', '#cbb6ff', 7) +
      `<circle cx="80" cy="50" r="30" fill="none" stroke="#b59bff" stroke-width="1.5" opacity="0.5"/>`;
  } else if (flav === 'rainbow') {
    // The Rainbow Ball (GS-rainbow): a glowing white ball trailing a rainbow road of bands into the
    // stars, ringed by a faint rainbow aura.
    fx = '#ffffff';
    const rc = ['#ff4d4d', '#ff9a3d', '#ffe23d', '#49e06b', '#3bd1ff', '#7a6bff', '#d46bff'];
    let road = '<g stroke-linecap="round" opacity="0.92">';
    for (let i = 0; i < rc.length; i++) {
      road += `<path d="M 2 ${(28 + i * 6).toFixed(0)} L 56 ${(42 + i * 1.6).toFixed(0)}" stroke="${rc[i]}" stroke-width="3.4"/>`;
    }
    road += '</g>';
    let aura = '';
    for (let i = 0; i < rc.length; i++) {
      aura += `<circle cx="${cx}" cy="${cy}" r="${(r + 4 + i * 1.7).toFixed(1)}" fill="none" stroke="${rc[i]}" stroke-width="1.1" opacity="${(0.5 - i * 0.05).toFixed(2)}"/>`;
    }
    extra = sparkles(seed + 'rainbow', '#ffffff', 6) + road + aura;
  } else {
    // distance — a hot, fast ball with a motion streak
    fx = '#ffffff';
    extra = `<g stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7">
      <path d="M 12 40 h 26"/><path d="M 6 52 h 30"/><path d="M 14 64 h 22"/></g>`;
  }
  return frame(`${sparkles(seed, col, 3)}${extra}${ballGlyph(cx, cy, r, fx)}`, col);
}

function drawGlove(col: string, seed: string): string {
  // A proper golf glove (back-of-hand view): four seamed fingers, a thumb, a wrist cuff with a
  // Velcro strap tab, perforation dots + a snap closure — reads unmistakably as tour leather, not a mitten.
  const leather = mix(col, '#f2f4f8', 0.58);
  const cuff = mix(col, '#dfe4ec', 0.4);
  const seam = mix(col, '#11141b', 0.42);
  const snap = mix(col, '#ffffff', 0.2);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(52 14) rotate(-4)">
       <!-- fingers (closed leather capsules, middle longest) -->
       <g fill="${leather}" stroke="#11141b" stroke-width="1.8" stroke-linejoin="round">
         <path d="M4 30 v-14 a4 4 0 0 1 8 0 v14 Z"/>
         <path d="M13 30 v-20 a4 4 0 0 1 8 0 v20 Z"/>
         <path d="M22 30 v-23 a4 4 0 0 1 8 0 v23 Z"/>
         <path d="M31 30 v-17 a4 4 0 0 1 8 0 v17 Z"/>
       </g>
       <!-- back of hand + wrist -->
       <path d="M2 27 q-9 1 -9 12 l0 9 q0 11 12 14 q13 3 24 0 q10 -3 10 -14 l0 -11 q0 -6 -6 -6 l-31 0 q-4 0 -4 4 Z"
         fill="${leather}" stroke="#11141b" stroke-width="1.9" stroke-linejoin="round"/>
       <!-- thumb -->
       <path d="M-6 41 q-9 -1 -10 9 q-1 8 8 9 q6 1 9 -5 Z" fill="${leather}" stroke="#11141b" stroke-width="1.9" stroke-linejoin="round"/>
       <!-- finger seams -->
       <g stroke="${seam}" stroke-width="1" fill="none" opacity="0.75"><path d="M8 17 v12 M17 13 v16 M26 11 v18 M35 15 v14"/></g>
       <!-- back perforation dots -->
       <g fill="${seam}" opacity="0.5"><circle cx="7" cy="41" r="1"/><circle cx="13" cy="45" r="1"/><circle cx="19" cy="41" r="1"/><circle cx="25" cy="45" r="1"/><circle cx="13" cy="53" r="1"/><circle cx="21" cy="53" r="1"/></g>
       <!-- wrist cut-line -->
       <path d="M-4 52 q1 12 14 15 q13 3 24 0 q9 -3 9 -12" fill="none" stroke="${seam}" stroke-width="1.3" opacity="0.6"/>
       <!-- Velcro strap tab -->
       <path d="M40 45 l15 4 l-2 8 l-14 -3 Z" fill="${cuff}" stroke="#11141b" stroke-width="1.8" stroke-linejoin="round"/>
       <g stroke="${seam}" stroke-width="0.8" opacity="0.55"><path d="M42 48 l11 3 M41 52 l11 3"/></g>
       <!-- snap closure -->
       <circle cx="20" cy="60" r="3.2" fill="${snap}" stroke="#11141b" stroke-width="1.2"/>
       <circle cx="20" cy="60" r="1" fill="#11141b" opacity="0.5"/>
     </g>`,
    col,
  );
}

function drawCoin(col: string, seed: string): string {
  const gold = '#ffd23c';
  return frame(
    `${sparkles(seed, gold, 6)}
     <ellipse cx="75" cy="78" rx="34" ry="7" fill="rgba(0,0,0,0.3)"/>
     <circle cx="75" cy="46" r="30" fill="${mix(gold, '#a8740d', 0.15)}" stroke="#8a5e08" stroke-width="3"/>
     <circle cx="75" cy="46" r="23" fill="none" stroke="#fff2b0" stroke-width="2" opacity="0.7"/>
     <text x="75" y="56" font-size="30" text-anchor="middle" fill="#7a5207" font-weight="bold" font-family="Georgia,serif">★</text>
     <path d="M 56 30 q 8 -6 16 -2" fill="none" stroke="#fff7d6" stroke-width="2.4" opacity="0.8"/>`,
    col,
  );
}

/** Ion Thrusters (GS-fuel-3): a rocket engine bell blasting a layered cyan ion stream — the shop
 *  card of the wake the journey-map ship trails once it's fitted. */
function drawThruster(col: string, seed: string): string {
  const metal = mix(col, '#dbe4f0', 0.55);
  const dark = mix(col, '#0b0d12', 0.6);
  return frame(
    `${sparkles(seed, '#7ff3ff', 5)}
     <ellipse cx="75" cy="82" rx="38" ry="6" fill="rgba(0,0,0,0.3)"/>
     <path d="M62 40 C 40 32 22 34 10 44 C 22 54 40 56 62 54 Z" fill="#8a7bff" opacity="0.3"/>
     <path d="M62 42 C 44 37 30 38 18 44.5 C 30 51 44 52 62 52 Z" fill="#4fd0e0" opacity="0.6"/>
     <path d="M62 44 C 50 41 40 41.5 30 45 C 40 48.5 50 49 62 50 Z" fill="#eaffff" opacity="0.9"/>
     <circle cx="62" cy="46" r="6.5" fill="#7ff3ff" opacity="0.75"/>
     <path d="M62 34 L92 28 L92 64 L62 58 Z" fill="${metal}" stroke="#11141b" stroke-width="2.4"/>
     <path d="M62 34 L92 28 L92 34 L62 39 Z" fill="#ffffff" opacity="0.25"/>
     <path d="M92 26 h20 a6 6 0 0 1 6 6 v28 a6 6 0 0 1 -6 6 h-20 Z" fill="${dark}" stroke="#11141b" stroke-width="2.4"/>
     <rect x="96" y="34" width="16" height="5" rx="2.5" fill="${col}" opacity="0.8"/>
     <rect x="96" y="43" width="16" height="5" rx="2.5" fill="${col}" opacity="0.5"/>
     <circle cx="120" cy="32" r="2" fill="${mix(col, '#ffffff', 0.4)}"/>`,
    col,
  );
}

/** Ship WEAPON (GS-story-ship-upgrades): a mounted cannon/laser turret firing a bright bolt. */
function drawWeapon(col: string, seed: string): string {
  const metal = mix(col, '#dbe4f0', 0.5);
  const dark = mix(col, '#0b0d12', 0.55);
  return frame(
    `${sparkles(seed, col, 4)}
     <ellipse cx="70" cy="82" rx="34" ry="6" fill="rgba(0,0,0,0.3)"/>
     <path d="M24 52 h30 a10 10 0 0 1 10 10 v6 a4 4 0 0 1 -4 4 h-42 a4 4 0 0 1 -4 -4 v-12 a4 4 0 0 1 4 -4 z" fill="${dark}" stroke="#11141b" stroke-width="2.4"/>
     <circle cx="44" cy="52" r="16" fill="${metal}" stroke="#11141b" stroke-width="2.4"/>
     <circle cx="44" cy="52" r="7" fill="${dark}" stroke="#11141b" stroke-width="1.6"/>
     <rect x="52" y="46" width="58" height="12" rx="5" fill="${metal}" stroke="#11141b" stroke-width="2.4"/>
     <rect x="52" y="46" width="58" height="4" rx="2" fill="#ffffff" opacity="0.25"/>
     <circle cx="112" cy="52" r="7.5" fill="${dark}" stroke="#11141b" stroke-width="1.6"/>
     <circle cx="122" cy="52" r="5" fill="${mix(col, '#ffffff', 0.5)}"/>
     <circle cx="122" cy="52" r="10" fill="${col}" opacity="0.35"/>
     <path d="M128 52 h12 M126 45 l9 -4 M126 59 l9 4" stroke="${mix(col, '#ffffff', 0.5)}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`,
    col,
  );
}

/** Ship SHIELD (GS-story-ship-upgrades): a deflector emitter throwing a glowing energy dome. */
function drawShield(col: string, seed: string): string {
  const metal = mix(col, '#dbe4f0', 0.5);
  const dark = mix(col, '#0b0d12', 0.55);
  const glow = mix(col, '#bfe9ff', 0.55);
  return frame(
    `${sparkles(seed, col, 4)}
     <ellipse cx="75" cy="84" rx="34" ry="5" fill="rgba(0,0,0,0.3)"/>
     <path d="M32 74 a48 48 0 0 1 86 0 z" fill="${col}" opacity="0.14"/>
     <path d="M40 74 a35 35 0 0 1 70 0" fill="none" stroke="${glow}" stroke-width="2.4" opacity="0.85"/>
     <path d="M48 74 a27 27 0 0 1 54 0" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.5"/>
     <g transform="translate(75 74)">
       <path d="M-16 0 h32 v-6 a16 10 0 0 0 -32 0 z" fill="${metal}" stroke="#11141b" stroke-width="2.2"/>
       <rect x="-20" y="0" width="40" height="10" rx="3" fill="${dark}" stroke="#11141b" stroke-width="2.2"/>
       <circle cx="0" cy="-6" r="4" fill="${glow}"/>
     </g>
     <circle cx="52" cy="44" r="2" fill="${glow}"/><circle cx="98" cy="40" r="1.6" fill="${glow}"/><circle cx="75" cy="30" r="2" fill="${glow}"/>`,
    col,
  );
}

/** Reserve Fuel Tank (GS-fuel-3): a strapped-on auxiliary canister, delivered full. */
function drawFuelTank(col: string, seed: string): string {
  const body = mix(col, '#e8edf5', 0.35);
  return frame(
    `${sparkles(seed, col, 4)}
     <ellipse cx="75" cy="82" rx="36" ry="6" fill="rgba(0,0,0,0.3)"/>
     <rect x="42" y="30" width="66" height="42" rx="19" fill="${body}" stroke="#11141b" stroke-width="2.5"/>
     <rect x="46" y="34" width="58" height="11" rx="6" fill="#ffffff" opacity="0.22"/>
     <rect x="57" y="26" width="8" height="50" rx="3" fill="#2a3142" stroke="#11141b" stroke-width="1.6"/>
     <rect x="86" y="26" width="8" height="50" rx="3" fill="#2a3142" stroke="#11141b" stroke-width="1.6"/>
     <rect x="98" y="19" width="11" height="13" rx="3.5" fill="${mix(col, '#39415a', 0.5)}" stroke="#11141b" stroke-width="2"/>
     <text x="75" y="59" font-size="17" text-anchor="middle">⛽</text>`,
    col,
  );
}

function drawPutter(col: string, seed: string): string {
  const head = mix(col, '#e8edf5', 0.45);
  return frame(
    `${sparkles(seed, col, 4)}
     <line x1="48" y1="14" x2="78" y2="64" stroke="#1b1f29" stroke-width="7" stroke-linecap="round"/>
     <line x1="48" y1="14" x2="78" y2="64" stroke="${mix(col, '#c9d2e0', 0.5)}" stroke-width="3.5" stroke-linecap="round"/>
     <rect x="40" y="8" width="14" height="9" rx="3" transform="rotate(31 47 13)" fill="#222633"/>
     <g transform="translate(78 66)">
       <rect x="-4" y="-3" width="44" height="11" rx="3" fill="${head}" stroke="#11141b" stroke-width="2"/>
       <rect x="2" y="-3" width="6" height="11" fill="${col}" opacity="0.6"/>
     </g>
     ${ballGlyph(116, 78, 8)}`,
    col,
  );
}

function drawShoes(col: string, seed: string): string {
  const body = mix(col, '#f0f3f8', 0.5);
  const shoe = (x: number) => `
    <g transform="translate(${x} 44)">
      <path d="M 0 14 q -2 -16 14 -16 q 8 0 12 6 q 14 4 22 10 q 6 4 0 8 l -44 0 q -4 0 -4 -4 z" fill="${body}" stroke="#11141b" stroke-width="2" stroke-linejoin="round"/>
      <path d="M -4 22 l 52 0 q 4 0 2 4 l -52 0 q -4 0 -2 -4 z" fill="${mix(col, '#11141b', 0.3)}"/>
      <g fill="#10141b"><circle cx="2" cy="26" r="1.6"/><circle cx="14" cy="27" r="1.6"/><circle cx="26" cy="27" r="1.6"/><circle cx="38" cy="27" r="1.6"/></g>
      <path d="M 8 4 q 8 -2 14 4" fill="none" stroke="${col}" stroke-width="2"/>
    </g>`;
  return frame(`${sparkles(seed, col, 4)}${shoe(18)}${shoe(58)}`, col);
}

/** A golf cap (GS-story-gear, the `hat` slot): a curved crown + a long visor, a themed band, a small
 *  front badge. Deterministic; the rarity tint colours crown + band. */
function drawHat(col: string, seed: string): string {
  const crown = mix(col, '#2b3140', 0.35);
  const band = mix(col, '#f0f3f8', 0.35);
  const visor = mix(col, '#11141b', 0.25);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(30 26)">
       <path d="M 6 30 q -4 -34 42 -34 q 40 0 40 26 q 0 4 -4 6 l -74 4 q -4 0 -4 -2 z" fill="${crown}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 2 30 q -2 -6 6 -6 l 74 0 q 6 0 6 4 q 0 4 -6 6 l -74 2 q -6 0 -6 -6 z" fill="${band}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 2 34 q -14 2 -22 12 q -3 4 2 6 q 24 -6 26 -12 z" fill="${visor}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <circle cx="44" cy="-2" r="1.8" fill="${band}"/>
       <circle cx="40" cy="14" r="6" fill="#0c0f15" stroke="${col}" stroke-width="1.6"/>
       <path d="M 40 10 l 0 8 M 36 14 l 8 0" stroke="${mix(col, '#ffffff', 0.4)}" stroke-width="1.4"/>
     </g>
     ${ballGlyph(122, 74, 8)}`,
    col,
  );
}

/** A tailored JACKET (GS-story-clothing, the `jacket` slot): a torso coat with peaked lapels, a button
 *  placket + a collar badge. Deterministic; the rarity tint colours the body + trim. */
function drawJacket(col: string, seed: string): string {
  const body = mix(col, '#2b3140', 0.18);
  const shade = mix(col, '#0e1118', 0.32);
  const trim = mix(col, '#f0f3f8', 0.35);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(75 50)">
       <path d="M -32 -22 q -8 2 -12 12 l -4 30 q -1 6 6 6 l 12 0 l 0 -34 z" fill="${shade}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 32 -22 q 8 2 12 12 l 4 30 q 1 6 -6 6 l -12 0 l 0 -34 z" fill="${shade}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M -32 -22 q 12 -8 22 -8 l 20 0 q 10 0 22 8 l 4 44 q 1 6 -6 6 l -60 0 q -7 0 -6 -6 z" fill="${body}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M -10 -30 l 12 20 l -18 2 z" fill="${shade}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 10 -30 l -12 20 l 18 2 z" fill="${shade}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 0 -10 l 0 34" stroke="#0e1118" stroke-width="2"/>
       <g fill="${trim}"><circle cx="0" cy="-2" r="2.4"/><circle cx="0" cy="8" r="2.4"/><circle cx="0" cy="18" r="2.4"/></g>
       <circle cx="-9" cy="-18" r="3.2" fill="${trim}"/>
     </g>`,
    col,
  );
}

/** TROUSERS (GS-story-clothing, the `pants` slot): a waistband over two tapered legs with a centre crease.
 *  Deterministic; the rarity tint colours the cloth + belt. */
function drawTrousers(col: string, seed: string): string {
  const body = mix(col, '#2b3140', 0.2);
  const shade = mix(col, '#0e1118', 0.3);
  const belt = mix(col, '#f0f3f8', 0.32);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(75 30)">
       <rect x="-28" y="-6" width="56" height="11" rx="3.5" fill="${belt}" stroke="#0e1118" stroke-width="2"/>
       <path d="M -28 5 l 24 0 l -3 46 q 0 4 -4 4 l -12 0 q -4 0 -4 -4 z" fill="${body}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 4 5 l 24 0 l -1 46 q 0 4 -4 4 l -12 0 q -4 0 -4 -4 z" fill="${body}" stroke="#0e1118" stroke-width="2" stroke-linejoin="round"/>
       <path d="M -16 8 l -2 44 M 16 8 l 0 44" stroke="${shade}" stroke-width="1.6"/>
       <circle cx="-3" cy="0" r="1.8" fill="${shade}"/>
     </g>`,
    col,
  );
}

function drawRangefinder(col: string, seed: string): string {
  const body = mix(col, '#2a2f3a', 0.25);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(38 26)">
       <rect x="0" y="0" width="48" height="40" rx="8" fill="${body}" stroke="#11141b" stroke-width="2"/>
       <rect x="48" y="8" width="14" height="22" rx="4" fill="${mix(col, '#2a2f3a', 0.3)}" stroke="#11141b" stroke-width="2"/>
       <circle cx="14" cy="20" r="11" fill="#0c0f15" stroke="${col}" stroke-width="2"/>
       <circle cx="14" cy="20" r="5" fill="${mix(col, '#bfe6ff', 0.5)}" opacity="0.8"/>
       <path d="M 14 11 v 18 M 5 20 h 18" stroke="${col}" stroke-width="1" opacity="0.7"/>
       <rect x="30" y="9" width="12" height="9" rx="2" fill="#0c0f15"/>
       <text x="36" y="16.5" font-size="6.5" text-anchor="middle" fill="${mix(col, '#7CFC9A', 0.4)}" font-family="monospace">152</text>
     </g>
     <path d="M 92 30 l 18 -8" stroke="${col}" stroke-width="2" stroke-dasharray="3 3" opacity="0.8"/>
     ${ballGlyph(120, 28, 7)}`,
    col,
  );
}

function drawWedge(col: string, seed: string): string {
  const head = mix(col, '#e8edf5', 0.4);
  // A wedge with spin lines + a checking ball.
  return frame(
    `${sparkles(seed, col, 4)}
     <line x1="40" y1="16" x2="70" y2="58" stroke="#1b1f29" stroke-width="7" stroke-linecap="round"/>
     <line x1="40" y1="16" x2="70" y2="58" stroke="${mix(col, '#c9d2e0', 0.5)}" stroke-width="3.5" stroke-linecap="round"/>
     <g transform="translate(70 60) rotate(20)">
       <path d="M -6 -4 L 30 -10 Q 38 0 30 12 L -4 8 Q -10 2 -6 -4 Z" fill="${head}" stroke="#11141b" stroke-width="2"/>
       <g stroke="#11141b" stroke-width="0.9" opacity="0.7"><path d="M 2 -6 l 24 -4"/><path d="M 2 -1 l 26 -4"/><path d="M 2 4 l 26 -3"/><path d="M 2 9 l 24 -2"/></g>
     </g>
     <g transform="translate(116 70)">${ballGlyph(0, 0, 9)}
       <path d="M -16 6 q 8 6 16 0" fill="none" stroke="${col}" stroke-width="2" stroke-dasharray="2 3" opacity="0.8"/></g>`,
    col,
  );
}

function drawCoach(col: string, seed: string): string {
  const skin = '#caa07a';
  const shirt = mix(col, '#1e6f4a', 0.3);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(58 18)">
       <circle cx="8" cy="14" r="11" fill="${skin}" stroke="#11141b" stroke-width="1.5"/>
       <path d="M -4 9 a 12 9 0 0 1 24 0 l 6 -2 q 2 4 -2 5 l -32 0 q -4 -1 -2 -5 z" fill="${mix(col, '#11141b', 0.3)}"/>
       <path d="M -6 58 q 0 -30 14 -30 q 14 0 14 30 z" fill="${shirt}" stroke="#11141b" stroke-width="1.5"/>
       <rect x="-2" y="40" width="6" height="8" rx="1" fill="#fff" opacity="0.85"/>
       <line x1="2" y1="44" x2="-22" y2="34" stroke="#d8c089" stroke-width="2.4" stroke-linecap="round"/>
       <circle cx="-24" cy="33" r="3" fill="${col}"/>
     </g>`,
    col,
  );
}

function drawTrophy(col: string, seed: string): string {
  const gold = '#ffd23c';
  return frame(
    `${sparkles(seed, gold, 6)}
     <ellipse cx="75" cy="84" rx="26" ry="5" fill="rgba(0,0,0,0.3)"/>
     <path d="M 56 22 h 38 v 10 q 0 22 -19 26 q -19 -4 -19 -26 z" fill="${mix(gold, '#a8740d', 0.1)}" stroke="#8a5e08" stroke-width="2.5"/>
     <path d="M 56 26 q -14 0 -14 12 q 0 10 12 12" fill="none" stroke="#8a5e08" stroke-width="3"/>
     <path d="M 94 26 q 14 0 14 12 q 0 10 -12 12" fill="none" stroke="#8a5e08" stroke-width="3"/>
     <rect x="68" y="58" width="14" height="10" fill="${mix(gold, '#a8740d', 0.2)}" stroke="#8a5e08" stroke-width="2"/>
     <rect x="58" y="68" width="34" height="8" rx="2" fill="${mix(gold, '#a8740d', 0.25)}" stroke="#8a5e08" stroke-width="2"/>
     <text x="75" y="46" font-size="20" text-anchor="middle" fill="#7a5207" font-weight="bold">⌃</text>`,
    col,
  );
}

function drawCaddyBag(col: string, seed: string): string {
  // A golf bag full of clubs — the fallback when a caddy id has no bespoke figure.
  const bag = mix(col, '#243049', 0.25);
  return frame(
    `${sparkles(seed, col, 5)}
     <ellipse cx="74" cy="86" rx="24" ry="5" fill="rgba(0,0,0,0.3)"/>
     <g stroke="#11141b" stroke-width="1.5">
       <line x1="62" y1="30" x2="58" y2="8" stroke-width="3" stroke-linecap="round"/>
       <line x1="74" y1="28" x2="74" y2="4" stroke-width="3" stroke-linecap="round"/>
       <line x1="86" y1="30" x2="90" y2="9" stroke-width="3" stroke-linecap="round"/>
       <circle cx="58" cy="7" r="4" fill="${mix(col, '#e8edf5', 0.4)}"/>
       <circle cx="74" cy="4" r="4" fill="${mix(col, '#e8edf5', 0.4)}"/>
       <circle cx="90" cy="8" r="4" fill="${mix(col, '#e8edf5', 0.4)}"/>
     </g>
     <path d="M 56 30 q 18 -6 36 0 l -3 50 q -1 6 -7 6 l -16 0 q -6 0 -7 -6 z" fill="${bag}" stroke="#11141b" stroke-width="2"/>
     <rect x="58" y="44" width="32" height="8" rx="2" fill="${mix(col, '#11141b', 0.3)}"/>
     <circle cx="74" cy="64" r="6" fill="${col}" opacity="0.8"/>
     <path d="M 60 36 q 14 -4 28 0" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.5"/>`,
    col,
  );
}

/**
 * A blinged GOLF BAG (GS-bag-tiers), themed by `tint` and `tier`. The default-bag upgrade gets flashier
 * with each rarity — more clubs poking out, a brighter body panel, a themed emblem, more sparkles, and a
 * gold corona at legendary. Pure SVG, no rng (placement is a fixed function of the tier). Shown on the
 * Trade Market bag-set cards, the Garage, and the Pro Shop bag-inventory header.
 */
export function drawGolfBag(tint: string, tier: Rarity): string {
  const rank = RARITY_C[tier].order; // 0 (common) .. 3 (legendary)
  const seed = `golfbag:${tier}`;
  const cx = 75;
  const body = mix(tint, '#1c2436', 0.3);
  const panel = mix(tint, '#ffffff', 0.1 + rank * 0.05);
  const head = mix(tint, '#e8edf5', 0.42);
  // Club heads poking out the top — more sticks as the bag gets richer (3 → 6).
  const n = 3 + rank;
  let clubs = '<g stroke="#11141b" stroke-width="1.5">';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = cx - 16 + t * 32;
    const lean = (t - 0.5) * 10;
    const topY = 6 + Math.abs(t - 0.5) * 8;
    clubs += `<line x1="${x.toFixed(1)}" y1="30" x2="${(x + lean).toFixed(1)}" y2="${topY.toFixed(1)}" stroke-width="3" stroke-linecap="round"/>`;
    clubs += `<circle cx="${(x + lean).toFixed(1)}" cy="${(topY - 1).toFixed(1)}" r="4" fill="${head}"/>`;
  }
  clubs += '</g>';
  // A centred themed corona for the legendary bag (a soft glow for epic; nothing lower).
  const glow =
    tier === 'legendary'
      ? [24, 18, 12].map((r, i) => `<circle cx="${cx}" cy="58" r="${r}" fill="${mix(tint, '#ffe6a0', 0.4)}" opacity="${(0.05 + i * 0.05).toFixed(2)}"/>`).join('')
      : rank >= 2
      ? `<circle cx="${cx}" cy="58" r="20" fill="${tint}" opacity="0.1"/>`
      : '';
  // Themed emblem on the pocket; legendary stamps a gold star.
  const emblem =
    `<circle cx="${cx}" cy="62" r="${6 + rank}" fill="${tint}" opacity="0.9" stroke="#0b0d12" stroke-width="1"/>` +
    (tier === 'legendary'
      ? `<text x="${cx}" y="66.5" font-size="11" text-anchor="middle" fill="#7a5207" font-weight="bold" font-family="Georgia,serif">★</text>`
      : '');
  // A bright themed rim traces the bag from rare up (brighter the higher you go).
  const rim =
    rank >= 1
      ? `<path d="M 57 32 q 18 -6 36 0 l -3 50 q -1 6 -7 6 l -16 0 q -6 0 -7 -6 z" fill="none" stroke="${mix(tint, '#ffffff', 0.5)}" stroke-width="1.4" opacity="${(0.3 + rank * 0.15).toFixed(2)}"/>`
      : '';
  return frame(
    `${sparkles(seed, tint, 3 + rank * 2)}${glow}
     <ellipse cx="${cx}" cy="88" rx="26" ry="5" fill="rgba(0,0,0,0.32)"/>
     ${clubs}
     <path d="M 57 32 q 18 -6 36 0 l -3 50 q -1 6 -7 6 l -16 0 q -6 0 -7 -6 z" fill="${body}" stroke="#11141b" stroke-width="2"/>
     <path d="M 60 34 q 15 -5 30 0 l -2 22 l -26 0 z" fill="${panel}" opacity="0.85"/>
     <rect x="59" y="46" width="32" height="7" rx="2" fill="${mix(tint, '#11141b', 0.35)}"/>
     <path d="M 90 40 q 10 18 -2 40" fill="none" stroke="${mix(tint, '#11141b', 0.2)}" stroke-width="3" opacity="0.7"/>
     ${emblem}
     ${rim}
     <path d="M 61 38 q 14 -4 28 0" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.45"/>`,
    tint,
  );
}

// --- Bespoke named-caddy portraits (GS-proshop-2) ----------------------------
// The named caddies are the game-changing centrepieces, so each gets a self-contained SVG portrait
// matching its in-game canvas figure (see render/caddyArt.ts) — not the generic bag glyph. Authored
// directly in the 150×96 card frame (ground ≈ y88, figure ≈ x58, props reach to the right).

/** A hat/cap dome (semicircle, flat bottom at `cy`, arcing up to `cy-r`). */
function dome(cx: number, cy: number, r: number, fill: string): string {
  return `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="${fill}"/>`;
}
const groundShadow = (cx = 60): string => `<ellipse cx="${cx}" cy="89" rx="27" ry="5" fill="rgba(0,0,0,0.32)"/>`;

const CADDY_FIGURES: Record<string, () => string> = {
  // Penelope Putter — teal caddy bib, flagstick + pennant, ponytail under a cap.
  'auto-caddie': () =>
    `${groundShadow(60)}
     <path d="M60 60 L52 88 M60 60 L68 88" stroke="#2c3142" stroke-width="6.5" stroke-linecap="round" fill="none"/>
     <line x1="60" y1="62" x2="58" y2="35" stroke="#19b2a6" stroke-width="16" stroke-linecap="round"/>
     <line x1="58" y1="44" x2="80" y2="34" stroke="#e8c6a0" stroke-width="4.2" stroke-linecap="round"/>
     <line x1="86" y1="20" x2="86" y2="52" stroke="#d9dee8" stroke-width="2.6"/>
     <path d="M86 20 L106 25 L86 30 Z" fill="#ff5d5d"/>
     <ellipse cx="47" cy="31" rx="4.4" ry="8" fill="#6b4a2e"/>
     <circle cx="58" cy="30" r="9.2" fill="#f0c49a"/>
     ${dome(58, 27, 9.4, '#138f86')}<rect x="56" y="24.5" width="13" height="3.2" rx="1.5" fill="#138f86"/>`,
  // Driver Dan — burly orange caddy, a big driver slung over the shoulder.
  'driver-dan': () =>
    `${groundShadow(60)}
     <path d="M60 60 L51 88 M60 60 L69 88" stroke="#3a3f4c" stroke-width="7.5" stroke-linecap="round" fill="none"/>
     <line x1="60" y1="62" x2="58" y2="33" stroke="#e0883a" stroke-width="20" stroke-linecap="round"/>
     <line x1="44" y1="52" x2="94" y2="16" stroke="#c8ccd6" stroke-width="3.2" stroke-linecap="round"/>
     <ellipse cx="96" cy="15" rx="8" ry="5.5" fill="#2b2f3a" transform="rotate(-35 96 15)"/>
     <line x1="58" y1="42" x2="44" y2="52" stroke="#d8a878" stroke-width="5" stroke-linecap="round"/>
     <circle cx="58" cy="30" r="10" fill="#d8a878"/>
     ${dome(58, 27, 10, '#c4882a')}<rect x="44" y="24.5" width="14" height="3.4" rx="1.5" fill="#c4882a"/>`,
  // Dr Chipinski — white lab coat, specs, a wedge held low, a ringing call badge.
  'dr-chipinski': () =>
    `${groundShadow(58)}
     <path d="M58 60 L51 88 M58 60 L65 88" stroke="#39405a" stroke-width="6.5" stroke-linecap="round" fill="none"/>
     <line x1="58" y1="62" x2="56" y2="35" stroke="#eef2f7" stroke-width="16" stroke-linecap="round"/>
     <line x1="56" y1="50" x2="55" y2="62" stroke="#cfd6e0" stroke-width="1.6"/>
     <line x1="72" y1="44" x2="90" y2="66" stroke="#c8ccd6" stroke-width="2.8"/>
     <path d="M90 66 L98 64 L95 73 Z" fill="#aeb6c6"/>
     <line x1="56" y1="44" x2="72" y2="44" stroke="#e8c6a0" stroke-width="4.2" stroke-linecap="round"/>
     <circle cx="56" cy="30" r="9.2" fill="#e8c6a0"/>
     <g stroke="#2b2f3a" stroke-width="1.4" fill="none"><circle cx="52.5" cy="30" r="2.6"/><circle cx="60" cy="30" r="2.6"/><line x1="55.1" y1="30" x2="57.4" y2="30"/></g>
     ${dome(56, 26, 9, '#3a3f4c')}
     <g transform="translate(104 24)"><circle r="11" fill="#22c55e" stroke="rgba(0,0,0,0.25)" stroke-width="1.4"/>
       <path d="M -4 -4 q -2 -2 0 -3 l 2 2 q 0 1 -1 1 q 0 3 3 4 q 0 -1 1 -1 l 2 2 q -1 2 -3 0 q -5 -1 -7 -6 z" fill="#fff" transform="rotate(-12)"/>
       <g stroke="#bdf3cf" stroke-width="1.5" fill="none" opacity="0.85"><path d="M -13 -7 a5 5 0 0 1 4 -3"/><path d="M 13 -7 a5 5 0 0 0 -4 -3"/></g></g>`,
  // Space Ducks — plump yellow duck in a bubble helmet + top hat, laser raised.
  'space-ducks': () =>
    `${groundShadow(58)}
     <ellipse cx="52" cy="86" rx="5" ry="2.4" fill="#e8902a"/><ellipse cx="64" cy="86" rx="5" ry="2.4" fill="#e8902a"/>
     <ellipse cx="58" cy="62" rx="14" ry="19" fill="#f7d046"/>
     <ellipse cx="49" cy="62" rx="5" ry="11" fill="#e6bf36"/>
     <line x1="62" y1="56" x2="92" y2="34" stroke="#3a4150" stroke-width="3.6" stroke-linecap="round"/>
     <circle cx="93" cy="33" r="3.2" fill="#7cf3ff"/>
     <circle cx="60" cy="36" r="10" fill="#f7d046"/>
     <ellipse cx="71" cy="37" rx="6" ry="3.2" fill="#e8902a"/>
     <circle cx="62" cy="34" r="1.8" fill="#222"/>
     <circle cx="60" cy="35" r="16" fill="rgba(180,230,255,0.13)" stroke="rgba(180,230,255,0.85)" stroke-width="1.6"/>
     <rect x="46" y="16" width="28" height="3.2" rx="1" fill="#1b1e26"/><rect x="51" y="3" width="17" height="14" rx="1.5" fill="#1b1e26"/>`,
  // Convict Sheep — woolly jailbird in stripes, spinning a boomerang.
  'convict-sheep': () =>
    `${groundShadow(58)}
     <path d="M52 62 L50 88 M64 62 L66 88" stroke="#2c3142" stroke-width="5" stroke-linecap="round" fill="none"/>
     <ellipse cx="58" cy="58" rx="16" ry="17" fill="#dfe3ea"/>
     <g stroke="#2b2f3a" stroke-width="2.4"><line x1="44" y1="50" x2="72" y2="50"/><line x1="43" y1="58" x2="73" y2="58"/><line x1="44" y1="66" x2="72" y2="66"/></g>
     <circle cx="58" cy="36" r="12" fill="#f4f6fa"/>
     <ellipse cx="58" cy="33" rx="6.5" ry="8" fill="#2b2f3a"/>
     <circle cx="55.6" cy="31.5" r="1.5" fill="#fff"/><circle cx="60.4" cy="31.5" r="1.5" fill="#fff"/>
     <ellipse cx="49" cy="33" rx="4" ry="2.2" fill="#2b2f3a" transform="rotate(34 49 33)"/>
     <line x1="68" y1="44" x2="84" y2="26" stroke="#dfe3ea" stroke-width="4" stroke-linecap="round"/>
     <path d="M76 34 L84 22 L92 34" stroke="#9a6b3a" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Suggestible Sam — green caddy vest, offering a club aloft with a yardage thought-bubble.
  'suggestible-sam': () =>
    `${groundShadow(58)}
     <path d="M58 60 L51 88 M58 60 L65 88" stroke="#2f3a33" stroke-width="6.5" stroke-linecap="round" fill="none"/>
     <line x1="58" y1="62" x2="56" y2="35" stroke="#3fae5c" stroke-width="15" stroke-linecap="round"/>
     <line x1="56" y1="44" x2="78" y2="30" stroke="#e8c6a0" stroke-width="4.2" stroke-linecap="round"/>
     <line x1="78" y1="30" x2="86" y2="8" stroke="#c8ccd6" stroke-width="2.6" stroke-linecap="round"/>
     <ellipse cx="86" cy="8" rx="4" ry="2.6" fill="#aeb6c6" transform="rotate(-28 86 8)"/>
     <g><circle cx="34" cy="34" r="8" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>
       <path d="M34 29 L34 38 L37 39" stroke="#5fd45a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
       <circle cx="42" cy="42" r="2" fill="rgba(255,255,255,0.4)"/></g>
     <circle cx="56" cy="30" r="9.2" fill="#e8c6a0"/>
     ${dome(56, 27, 9.2, '#2f8f47')}<rect x="56" y="24.6" width="13" height="3.2" rx="1.5" fill="#2f8f47"/>`,
  // Sandy the Sand-Saver — weathered bush-hat escape artist, wedge spraying sand.
  'sandy-sandsaver': () =>
    `${groundShadow(58)}
     <path d="M58 60 L50 88 M58 60 L66 88" stroke="#6b5a3a" stroke-width="6.5" stroke-linecap="round" fill="none"/>
     <line x1="58" y1="62" x2="56" y2="34" stroke="#b89a5a" stroke-width="17" stroke-linecap="round"/>
     <line x1="56" y1="44" x2="74" y2="38" stroke="#d8b888" stroke-width="4.2" stroke-linecap="round"/>
     <line x1="74" y1="38" x2="84" y2="18" stroke="#c8ccd6" stroke-width="2.8" stroke-linecap="round"/>
     <ellipse cx="84" cy="18" rx="4" ry="2.6" fill="#aeb6c6" transform="rotate(-32 84 18)"/>
     <g fill="#e3c98f"><circle cx="90" cy="14" r="1.4"/><circle cx="94" cy="20" r="1.4"/><circle cx="88" cy="24" r="1.2"/><circle cx="95" cy="27" r="1.1"/></g>
     <circle cx="56" cy="31" r="9" fill="#d8a878"/>
     <ellipse cx="56" cy="24" rx="17" ry="3.6" fill="#7a6238"/>
     ${dome(56, 24, 8, '#7a6238')}`,
  // Mystic Mole — spectacled green-reader popping from a dirt mound, holding a putter.
  'mystic-mole': () =>
    `${groundShadow(60)}
     <ellipse cx="60" cy="84" rx="22" ry="7" fill="#4a3a28"/>
     <ellipse cx="60" cy="56" rx="16" ry="20" fill="#5a5560"/>
     <ellipse cx="60" cy="62" rx="9" ry="12" fill="#7a7682"/>
     <line x1="74" y1="46" x2="86" y2="74" stroke="#d9dee8" stroke-width="2.6"/>
     <rect x="83" y="72" width="8" height="3.4" rx="1" fill="#aeb6c6"/>
     <g fill="#1a1d24"><circle cx="54" cy="42" r="5"/><circle cx="66" cy="42" r="5"/></g>
     <g fill="#9fd8e6"><circle cx="54" cy="42" r="2.8"/><circle cx="66" cy="42" r="2.8"/></g>
     <line x1="58.8" y1="42" x2="61.2" y2="42" stroke="#1a1d24" stroke-width="1.4"/>
     <circle cx="60" cy="50" r="3" fill="#ff9db0"/>`,
  // Prognostic Parrot — bipedal green parrot pirate captain, tricorne + eyepatch, foreseeing through a spyglass.
  'prognostic-parrot': () =>
    `${groundShadow(58)}
     <path d="M58 62 L50 86 M58 62 L66 86" stroke="#e8902a" stroke-width="5" stroke-linecap="round" fill="none"/>
     <g stroke="#e8902a" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M50 86 l-4 3 M50 86 l0 4 M50 86 l4 3 M66 86 l-4 3 M66 86 l0 4 M66 86 l4 3"/></g>
     <line x1="58" y1="63" x2="56" y2="34" stroke="#37a05a" stroke-width="16" stroke-linecap="round"/>
     <line x1="58" y1="60" x2="57" y2="42" stroke="#7ed957" stroke-width="7" stroke-linecap="round"/>
     <path d="M50 40 Q41 53 48 68 L55 60 Q50 50 54 42 Z" fill="#2f8f47"/>
     <g stroke="#4b7bd6" stroke-width="2" stroke-linecap="round"><path d="M48 66 l3 -2"/><path d="M46 60 l3 -2"/><path d="M45 54 l3 -2"/></g>
     <line x1="58" y1="44" x2="76" y2="30" stroke="#37a05a" stroke-width="4.2" stroke-linecap="round"/>
     <g transform="rotate(-30 80 28)"><rect x="72" y="25" width="15" height="6.5" rx="2.5" fill="#c8912f"/><rect x="85" y="24" width="4.5" height="8.5" rx="1.5" fill="#e8b64a"/></g>
     <g fill="#ffce54"><circle cx="99" cy="19" r="2.2"/><circle cx="105" cy="25" r="1.4"/><circle cx="95" cy="27" r="1.2"/></g>
     <circle cx="56" cy="30" r="9.2" fill="#37a05a"/>
     <path d="M64 28 q7 1 4.5 6 q-3.5 1 -6.5 -2 Z" fill="#f0b429"/>
     <circle cx="57" cy="28" r="2.2" fill="#1a1d24"/>
     <line x1="49" y1="26" x2="59" y2="27" stroke="#1a1d24" stroke-width="1.8"/>
     <path d="M44 25 Q56 11 69 22 Q57 19 44 25 Z" fill="#2b2f3a"/>
     <path d="M45 24 Q56 17 68 22" stroke="#d9a441" stroke-width="1.6" fill="none"/>
     <circle cx="52" cy="19" r="2.4" fill="#d9a441"/>`,
};

/** A bespoke caddy figure (GS-proshop-2), or the generic bag glyph for an unknown caddy id. */
function drawCaddyFigure(id: string, col: string, seed: string): string {
  const fig = CADDY_FIGURES[id];
  if (!fig) return drawCaddyBag(col, seed);
  return frame(`${sparkles(seed, col, 5)}${fig()}`, col);
}

/** Reward club, themed by its set (planet / phoenix / solarstorm). The head glows with the theme, and
 *  `clubType` picks the family silhouette (driver / wood / hybrid / iron / wedge / putter) so a reward
 *  driver looks like a driver and a reward wedge like a wedge — never the same generic blade. */
function drawThemedClub(theme: string | undefined, col: string, seed: string, clubType?: string): string {
  const family = clubType ? clubFamilyOf(clubType) : 'driver';
  let aura = '';
  if (theme === 'planet') {
    // A ringed planet behind the club.
    aura = `<g transform="translate(40 30)"><circle cx="0" cy="0" r="15" fill="${mix(col, '#7fb0ff', 0.4)}" opacity="0.85"/>
      <ellipse cx="0" cy="0" rx="24" ry="8" fill="none" stroke="${mix(col, '#cfe3ff', 0.5)}" stroke-width="2.5" transform="rotate(-20)"/>
      <circle cx="-5" cy="-5" r="5" fill="#fff" opacity="0.3"/></g>`;
  } else if (theme === 'phoenix') {
    aura = `<g transform="translate(40 32)" opacity="0.9">
      <path d="M 0 -16 q 14 6 8 22 q 8 -4 6 -16 q 10 12 -2 26 q -16 6 -22 -10 q -2 -16 10 -22 z" fill="#ff7a3c"/>
      <path d="M 0 -8 q 8 4 5 14 q 5 -3 3 -11 q 6 8 -2 16 q -10 3 -13 -7 q -1 -10 7 -12 z" fill="#ffd23c"/></g>`;
  } else if (theme === 'solarstorm') {
    aura = `<g transform="translate(42 30)">
      <circle cx="0" cy="0" r="14" fill="#ffd23c"/>
      <g stroke="#ffb01e" stroke-width="2.4" stroke-linecap="round">
        ${Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          const x0 = Math.cos(a) * 16;
          const y0 = Math.sin(a) * 16;
          const x1 = Math.cos(a) * (22 + (i % 2) * 5);
          const y1 = Math.sin(a) * (22 + (i % 2) * 5);
          return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}"/>`;
        }).join('')}
      </g>
      <circle cx="-4" cy="-4" r="4" fill="#fff7d6" opacity="0.7"/></g>`;
  }
  return frame(`${sparkles(seed, col, 4)}${aura}${clubShaft(col)}${clubHead(family, col)}`, col);
}

/**
 * The procedural art for a shop item, as an `<svg>` string. `rarity` tints it; `setTheme` (for reward
 * clubs) selects the themed club look. Pure, deterministic, no asset. Width fills the container.
 */
export function itemArtSVG(id: string, rarity: Rarity, setTheme?: string): string {
  const col = rarCol(rarity);
  const seed = id;
  // Credit-boost tokens are a class of their own: a faction crest medallion (GS-credit-factions).
  // The whole card IS the emblem, so they skip the base gear glyph + the corner roundel.
  const creditFaction = factionForCreditItem(id);
  if (creditFaction) {
    const token = drawCreditToken(creditFaction, col, seed);
    return rarity === 'legendary' ? withOverlay(token, legendaryFlair(col)) : token;
  }
  const kind = itemArtKind(id);
  let base: string;
  switch (kind) {
    case 'shaft':
      base = drawShaft(col, seed, SHAFT_FAMILY[id] ?? 'driver');
      break;
    case 'ball':
      base = drawBall(id, col, seed);
      break;
    case 'glove':
      base = drawGlove(col, seed);
      break;
    case 'powerglove':
      base = drawPowerGlove(col, seed);
      break;
    case 'coin':
      base = drawCoin(col, seed);
      break;
    case 'putter':
      base = drawPutter(col, seed);
      break;
    case 'shoes':
      base = drawShoes(col, seed);
      break;
    case 'hat':
      base = drawHat(col, seed);
      break;
    case 'jacket':
      base = drawJacket(col, seed);
      break;
    case 'pants':
      base = drawTrousers(col, seed);
      break;
    case 'rangefinder':
      base = drawRangefinder(col, seed);
      break;
    case 'wedge':
      base = drawWedge(col, seed);
      break;
    case 'coach':
      base = drawCoach(col, seed);
      break;
    case 'trophy':
      base = drawTrophy(col, seed);
      break;
    case 'thruster':
      base = drawThruster(col, seed);
      break;
    case 'fueltank':
      base = drawFuelTank(col, seed);
      break;
    case 'weapon':
      base = drawWeapon(col, seed);
      break;
    case 'shield':
      base = drawShield(col, seed);
      break;
    case 'club':
      // Reward club id is `club:<set>:<type>` — the type selects the head (putter vs iron/wood).
      base = drawThemedClub(setTheme, col, seed, id.split(':')[2]);
      break;
    case 'caddy':
    default:
      base = drawCaddyFigure(id, col, seed);
      break;
  }
  // Per-id emblem roundel (makes shared-kind items unique + reads the function); caddies/clubs/balls
  // are already bespoke/flavoured, so they skip it. Legendary items get the radiant gold flair.
  const emblem = EMBLEM[id];
  let overlay = '';
  if (rarity === 'legendary') overlay += legendaryFlair(col);
  if (emblem) overlay += roundel(emblem(mix(col, '#ffffff', 0.3)), col);
  return withOverlay(base, overlay);
}

/** The named caddies with a bespoke shop-card portrait (GS-proshop-2). */
export const CADDY_ART_IDS = Object.keys(CADDY_FIGURES);
