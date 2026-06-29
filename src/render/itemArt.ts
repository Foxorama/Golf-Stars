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
import { rarCol } from '../sim/rpg/loot';

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
  | 'coin'
  | 'putter'
  | 'shoes'
  | 'rangefinder'
  | 'wedge'
  | 'coach'
  | 'trophy'
  | 'caddy'
  | 'club';

/** A few ids draw a flavoured BALL (the tint + effect tells water/lava/void/wind/spin/distance apart). */
const BALL_FLAVOUR: Record<string, string> = {
  'range-booster': 'distance',
  'wind-cheater': 'wind',
  'floater-balls': 'water',
  'magma-balls': 'lava',
  'void-walkers': 'void',
};

const KIND_BY_ID: Record<string, ItemArtKind> = {
  'power-cell': 'shaft',
  gyro: 'shaft',
  'distance-control': 'shaft',
  overdrive: 'shaft',
  'precision-chip': 'glove',
  'anti-duck-hook': 'glove',
  'hook-corrector': 'glove',
  'slice-corrector': 'glove',
  'draw-weighting': 'glove',
  'lucky-coin': 'coin',
  'fortune-chip': 'coin',
  'putting-grip': 'putter',
  'tour-putter': 'putter',
  'tour-spikes': 'shoes',
  rangefinder: 'rangefinder',
  'spin-milled': 'wedge',
  'wedge-touch': 'wedge',
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
};

/** Resolve the art kind for an item id. Named caddies → 'caddy'; reward clubs → 'club'. */
export function itemArtKind(id: string): ItemArtKind {
  if (id.startsWith('club:')) return 'club';
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

function drawShaft(col: string, seed: string): string {
  // A driver: graphite shaft + a glinting head, on the diagonal.
  const head = mix(col, '#e8edf5', 0.35);
  return frame(
    `${sparkles(seed, col, 5)}
     <line x1="30" y1="20" x2="104" y2="70" stroke="#1b1f29" stroke-width="9" stroke-linecap="round"/>
     <line x1="30" y1="20" x2="104" y2="70" stroke="${mix(col, '#c9d2e0', 0.5)}" stroke-width="5" stroke-linecap="round"/>
     <rect x="22" y="11" width="16" height="9" rx="3" transform="rotate(34 30 16)" fill="#222633"/>
     <g transform="translate(108 74) rotate(34)">
       <path d="M -14 -12 Q 6 -16 12 0 Q 8 14 -12 11 Z" fill="${head}" stroke="#11141b" stroke-width="2"/>
       <ellipse cx="-2" cy="-2" rx="3" ry="4" fill="#11141b" opacity="0.5"/>
     </g>
     <path d="M 96 64 l 8 -5 l 3 6 z" fill="#ffffff" opacity="0.7"/>`,
    col,
  );
}

function drawBall(id: string, col: string, seed: string): string {
  const flav = BALL_FLAVOUR[id] ?? 'distance';
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
  } else {
    // distance — a hot, fast ball with a motion streak
    fx = '#ffffff';
    extra = `<g stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.7">
      <path d="M 12 40 h 26"/><path d="M 6 52 h 30"/><path d="M 14 64 h 22"/></g>`;
  }
  return frame(`${sparkles(seed, col, 3)}${extra}${ballGlyph(cx, cy, r, fx)}`, col);
}

function drawGlove(col: string, seed: string): string {
  const g = mix(col, '#f2f4f8', 0.55);
  return frame(
    `${sparkles(seed, col, 4)}
     <g transform="translate(54 18)">
       <path d="M 6 24 v -16 a4 4 0 0 1 8 0 v 14 M 16 22 v -20 a4 4 0 0 1 8 0 v 18 M 26 22 v -22 a4 4 0 0 1 8 0 v 20 M 36 24 v -16 a4 4 0 0 1 8 0 v 16"
         fill="${g}" stroke="#11141b" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 4 22 q -8 2 -8 12 q 0 22 22 26 q 26 4 28 -18 l 0 -20 q -2 -6 -8 -4 l 0 6 q -2 4 -6 2 l 0 -8 q -2 -5 -8 -3 l 0 8 q -2 4 -6 2 l 0 -8 q -2 -5 -8 -3 z"
         fill="${g}" stroke="#11141b" stroke-width="2" stroke-linejoin="round"/>
       <path d="M 4 36 q 2 -6 8 -6" fill="none" stroke="${mix(col, '#11141b', 0.4)}" stroke-width="2"/>
       <circle cx="22" cy="30" r="3.4" fill="${col}"/>
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

function drawCaddy(col: string, seed: string): string {
  // A golf bag full of clubs (stands in for "a caddy on the bag").
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

/** Reward club, themed by its set (planet / phoenix / solarstorm). The head glows with the theme. */
function drawThemedClub(theme: string | undefined, col: string, seed: string): string {
  const head = mix(col, '#e8edf5', 0.4);
  let aura = '';
  let badge = '';
  if (theme === 'planet') {
    // A ringed planet behind the club.
    aura = `<g transform="translate(40 32)"><circle cx="0" cy="0" r="15" fill="${mix(col, '#7fb0ff', 0.4)}" opacity="0.85"/>
      <ellipse cx="0" cy="0" rx="24" ry="8" fill="none" stroke="${mix(col, '#cfe3ff', 0.5)}" stroke-width="2.5" transform="rotate(-20)"/>
      <circle cx="-5" cy="-5" r="5" fill="#fff" opacity="0.3"/></g>`;
  } else if (theme === 'phoenix') {
    aura = `<g transform="translate(40 34)" opacity="0.9">
      <path d="M 0 -16 q 14 6 8 22 q 8 -4 6 -16 q 10 12 -2 26 q -16 6 -22 -10 q -2 -16 10 -22 z" fill="#ff7a3c"/>
      <path d="M 0 -8 q 8 4 5 14 q 5 -3 3 -11 q 6 8 -2 16 q -10 3 -13 -7 q -1 -10 7 -12 z" fill="#ffd23c"/></g>`;
  } else if (theme === 'solarstorm') {
    aura = `<g transform="translate(42 32)">
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
    badge = `<g stroke="#ffd23c" stroke-width="1.5" fill="none" opacity="0.6"><path d="M 96 64 q 8 -3 14 2"/></g>`;
  }
  return frame(
    `${sparkles(seed, col, 4)}${aura}
     <line x1="58" y1="22" x2="108" y2="72" stroke="#1b1f29" stroke-width="8" stroke-linecap="round"/>
     <line x1="58" y1="22" x2="108" y2="72" stroke="${mix(col, '#c9d2e0', 0.55)}" stroke-width="4" stroke-linecap="round"/>
     <rect x="50" y="14" width="15" height="9" rx="3" transform="rotate(33 57 18)" fill="#222633"/>
     <g transform="translate(110 74) rotate(33)">
       <path d="M -14 -12 Q 6 -16 12 0 Q 8 14 -12 11 Z" fill="${head}" stroke="#11141b" stroke-width="2"/>
       <ellipse cx="-2" cy="-2" rx="3" ry="4" fill="${col}" opacity="0.5"/>
     </g>
     ${badge}`,
    col,
  );
}

/**
 * The procedural art for a shop item, as an `<svg>` string. `rarity` tints it; `setTheme` (for reward
 * clubs) selects the themed club look. Pure, deterministic, no asset. Width fills the container.
 */
export function itemArtSVG(id: string, rarity: Rarity, setTheme?: string): string {
  const col = rarCol(rarity);
  const kind = itemArtKind(id);
  const seed = id;
  switch (kind) {
    case 'shaft':
      return drawShaft(col, seed);
    case 'ball':
      return drawBall(id, col, seed);
    case 'glove':
      return drawGlove(col, seed);
    case 'coin':
      return drawCoin(col, seed);
    case 'putter':
      return drawPutter(col, seed);
    case 'shoes':
      return drawShoes(col, seed);
    case 'rangefinder':
      return drawRangefinder(col, seed);
    case 'wedge':
      return drawWedge(col, seed);
    case 'coach':
      return drawCoach(col, seed);
    case 'trophy':
      return drawTrophy(col, seed);
    case 'club':
      return drawThemedClub(setTheme, col, seed);
    case 'caddy':
    default:
      return drawCaddy(col, seed);
  }
}
