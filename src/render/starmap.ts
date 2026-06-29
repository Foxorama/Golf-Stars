/**
 * Travel starmap (GS-routes) — a deterministic SVG of the voyage as a star-chart.
 *
 * The inter-round "choose your jump" screen used to be three flat cards. This draws the DECISION as
 * what it is: a journey. Earth sits at the origin; a dotted trail runs through the stops you've
 * already cleared to YOU (the station-wagon spaceship at the current node); and three glowing branch
 * planets fan out ahead — one per route option, colour-keyed to the choice card below it (rarity ring,
 * event glyph, jump distance, a ⚔ boss / 🔥 harder-path marker). Picking a lane is reading the map.
 *
 * Pure + self-contained: a single SVG string, seeded star placement (no Math.random), NO downloaded
 * asset (the house no-404 rule — the wagon + planets are vector glyphs). A little SMIL twinkle/bob
 * gives it life without a render loop. The string is byte-stable for a given input, so it's safe to
 * inject via innerHTML and cheap to re-emit each render.
 */

import { Rng } from '../sim/rng';
import type { Rarity } from '../sim/course/contract';
import { rarCol } from '../sim/rpg/loot';

export interface StarmapChoice {
  /** Route id — used only to key the DOM node, not drawn. */
  id: number;
  label: string;
  /** Event glyph (emoji) drawn on the branch planet. */
  icon: string;
  rarity: Rarity;
  /** How far this lane jumps (drawn as a +N chip). */
  distanceJump: number;
  elite?: boolean;
  bossAhead?: boolean;
}

/** One cleared stop on the travelled trail (Earth → … → YOU). */
export interface StarmapStop {
  /** Zone/theme name, drawn under its node. */
  label: string;
}

export interface StarmapOpts {
  seed: number | string;
  /** Stops already cleared (length of the travelled trail behind YOU). */
  stopIndex: number;
  distanceFromStart: number;
  /** The current stop's theme/zone name, labelled at YOU. */
  currentLabel: string;
  /**
   * The worlds already cleared, oldest → newest, drawn as named nodes between Earth and YOU so the
   * journey visibly BUILDS (Earth → stage 1 → stage 2 → … → YOU) instead of a blank trail. The
   * current stop (YOU) is NOT included. Optional — falls back to anonymous dots keyed off stopIndex.
   */
  trail?: StarmapStop[];
  choices: StarmapChoice[];
}

const W = 360;
const H = 212;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The station-wagon spaceship, facing right — a compact vector glyph (no asset). `s` ≈ width/40. */
function wagonGlyph(cx: number, cy: number, s: number): string {
  // Authored in a ~40×22 local frame centred on (0,0), then translated/scaled into place.
  const body = `
    <g stroke="#1c130b" stroke-width="1" stroke-linejoin="round">
      <path d="M-18,3 L-14,-4 L4,-5 L11,1 L18,2 L18,6 L-18,6 Z" fill="#8a5a2b"/>
      <path d="M-12,-3 L-1,-3 L-1,0 L-13,0 Z" fill="#bfe3f2"/>
      <path d="M1,-3 L8,0.4 L1,0.4 Z" fill="#bfe3f2"/>
      <rect x="-3.4" y="-3.2" width="1.5" height="3.6" fill="#1c130b" stroke="none"/>
      <circle cx="-9" cy="6.4" r="2.4" fill="#2a1c10"/>
      <circle cx="9" cy="6.4" r="2.4" fill="#2a1c10"/>
    </g>
    <g stroke="none">
      <path d="M-18,1 L-26,-1 L-26,4 L-18,5 Z" fill="#ff8a3c" opacity="0.95"/>
      <path d="M-22,1.6 L-30,0.4 L-30,3 L-22,3.4 Z" fill="#ffd36b" opacity="0.9"/>
      <rect x="13" y="-7" width="1.1" height="5" fill="#9a6a35"/>
      <path d="M14,-7 l6,1.6 l-6,1.8 Z" fill="#ff5a4d"/>
    </g>`;
  return `<g transform="translate(${cx} ${cy}) scale(${s.toFixed(3)})">
    <g opacity="0.9"><animateTransform attributeName="transform" type="translate" values="0 0;0 -1.4;0 0" dur="3.2s" repeatCount="indefinite"/>${body}</g>
  </g>`;
}

/** A glowing branch planet for one route choice. */
function planetGlyph(cx: number, cy: number, c: StarmapChoice): string {
  const col = rarCol(c.rarity);
  const r = 15;
  const markers: string[] = [];
  if (c.bossAhead) markers.push('⚔');
  if (c.elite) markers.push('🔥');
  const markerRow = markers.length
    ? `<text x="${cx + r - 2}" y="${cy - r + 4}" font-size="11" text-anchor="middle">${markers.join('')}</text>`
    : '';
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${col}" opacity="0.14"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0e1320" stroke="${col}" stroke-width="2"/>
      <circle cx="${cx - 4}" cy="${cy - 4}" r="${r - 3}" fill="${col}" opacity="0.12"/>
      <text x="${cx}" y="${cy + 5}" font-size="15" text-anchor="middle">${c.icon}</text>
      ${markerRow}
      <text x="${cx}" y="${cy + r + 13}" font-size="9" fill="#cdd6e6" text-anchor="middle" font-weight="700">${esc(c.label)}</text>
      <text x="${cx}" y="${cy + r + 24}" font-size="8.5" fill="${col}" text-anchor="middle">+${c.distanceJump} jump</text>
    </g>`;
}

export function starmapSVG(opts: StarmapOpts): string {
  const rng = new Rng(`${opts.seed}:starmap:${opts.stopIndex}`);

  // --- starfield -------------------------------------------------------------------------------
  const stars: string[] = [];
  for (let i = 0; i < 78; i++) {
    const x = rng.float() * W;
    const y = rng.float() * H;
    const sr = rng.float() * 1.1 + 0.3;
    const op = (rng.float() * 0.5 + 0.25).toFixed(2);
    // A handful twinkle (SMIL) so the chart breathes without a render loop.
    const tw =
      i % 11 === 0
        ? `<animate attributeName="opacity" values="${op};0.12;${op}" dur="${(2 + rng.float() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
        : '';
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sr.toFixed(2)}" fill="#dfe7ff" opacity="${op}">${tw}</circle>`);
  }
  // A soft nebula smear for depth.
  const nebula = `
    <ellipse cx="${(W * 0.66).toFixed(0)}" cy="${(H * 0.3).toFixed(0)}" rx="120" ry="70" fill="url(#sm-neb)" opacity="0.5"/>
    <ellipse cx="${(W * 0.2).toFixed(0)}" cy="${(H * 0.8).toFixed(0)}" rx="90" ry="55" fill="url(#sm-neb2)" opacity="0.4"/>`;

  // --- node geometry ---------------------------------------------------------------------------
  const earth = { x: 30, y: 150 };
  const you = { x: 150, y: 86 };
  const choices = opts.choices.slice(0, 3);
  const n = Math.max(1, choices.length);
  const bx = 312;
  const top = 38;
  const span = 122;
  const branchY = (i: number) => (n === 1 ? you.y : top + (span * i) / (n - 1));

  // --- travelled trail: Earth → (cleared stops as NAMED nodes) → YOU ---------------------------
  // A smooth curve with each cleared world as a labelled planet, so the journey reads as a built-up
  // path. Sample the cubic (de Casteljau on its control points) for node positions.
  const trail = `M${earth.x},${earth.y} C ${earth.x + 50},${earth.y} ${you.x - 56},${you.y + 18} ${you.x},${you.y}`;
  const cp1 = { x: earth.x + 50, y: earth.y };
  const cp2 = { x: you.x - 56, y: you.y + 18 };
  const bez = (t: number): { x: number; y: number } => {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * earth.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * you.x,
      y: mt * mt * mt * earth.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * you.y,
    };
  };
  // Prefer the real visited-zone list; fall back to anonymous dots (count from stopIndex) if absent.
  const allStops: StarmapStop[] = opts.trail ?? Array.from({ length: Math.max(0, opts.stopIndex) }, () => ({ label: '' }));
  const MAX_NODES = 4; // keep a long run legible — show the most recent worlds, summarise the rest
  const overflow = Math.max(0, allStops.length - MAX_NODES);
  const shownStops = allStops.slice(overflow);
  const m = shownStops.length;
  const nodeC = '#6fd0d8'; // a "visited" teal — distinct from Earth's blue and YOU's gold
  const dots = shownStops
    .map((s, k) => {
      const p = bez((k + 1) / (m + 1));
      const named = s.label.trim().length > 0;
      if (!named) return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" fill="#7f8aa3"/>`;
      const lab = s.label.length > 11 ? `${s.label.slice(0, 10)}…` : s.label;
      const above = k % 2 === 0; // stagger labels to reduce overlap on a tight trail
      const ly = above ? p.y - 9 : p.y + 14;
      return `<g>
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6.5" fill="${nodeC}" opacity="0.14"/>
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#0e1320" stroke="${nodeC}" stroke-width="1.4"/>
        <circle cx="${(p.x - 1.2).toFixed(1)}" cy="${(p.y - 1.2).toFixed(1)}" r="1.6" fill="${nodeC}" opacity="0.5"/>
        <text x="${p.x.toFixed(1)}" y="${ly.toFixed(1)}" font-size="7.5" fill="#aeb9cf" text-anchor="middle" font-weight="600">${esc(lab)}</text>
      </g>`;
    })
    .join('');
  const moreDots =
    overflow > 0 ? `<text x="${earth.x + 16}" y="${earth.y - 18}" font-size="9" fill="#7f8aa3">＋${overflow} more</text>` : '';

  // --- branch connectors (dashed, rarity-coloured) + planets -----------------------------------
  const branches = choices
    .map((c, i) => {
      const by = branchY(i);
      const col = rarCol(c.rarity);
      const path = `M${you.x},${you.y} C ${you.x + 70},${you.y} ${bx - 70},${by} ${bx},${by}`;
      const glow = c.elite || c.bossAhead ? `<path d="${path}" fill="none" stroke="${col}" stroke-width="5" opacity="0.18"/>` : '';
      return {
        line: `${glow}<path d="${path}" fill="none" stroke="${col}" stroke-width="1.7" stroke-dasharray="2 4" opacity="0.85"><animate attributeName="stroke-dashoffset" values="12;0" dur="1.1s" repeatCount="indefinite"/></path>`,
        planet: planetGlyph(bx, by, c),
      };
    })
    // Lines under planets.
    .reduce((acc, b) => ({ lines: acc.lines + b.line, planets: acc.planets + b.planet }), { lines: '', planets: '' });

  // --- Earth + YOU labels ----------------------------------------------------------------------
  const earthGlyph = `
    <g>
      <circle cx="${earth.x}" cy="${earth.y}" r="17" fill="#1a3a6b" stroke="#2f6fd0" stroke-width="1.5"/>
      <path d="M${earth.x - 12},${earth.y - 5} q6,-4 12,1 q5,4 11,1 M${earth.x - 14},${earth.y + 6} q7,3 13,-1 q6,-3 12,1" stroke="#3fae5a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
      <text x="${earth.x}" y="${earth.y + 32}" font-size="9.5" fill="#9fb0cf" text-anchor="middle" font-weight="700">EARTH</text>
    </g>`;
  const youLabel = `
    <text x="${you.x}" y="${you.y - 18}" font-size="9.5" fill="#ffce54" text-anchor="middle" font-weight="800">YOU · ${esc(opts.currentLabel)}</text>
    <text x="${you.x}" y="${you.y + 24}" font-size="8" fill="#7f8aa3" text-anchor="middle">dist ${opts.distanceFromStart}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Voyage starmap" style="display:block;border-radius:10px;background:radial-gradient(120% 100% at 70% 30%, #16203a 0%, #0a0d16 60%, #05070d 100%);">
    <defs>
      <radialGradient id="sm-neb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#3a5fb0" stop-opacity="0.5"/><stop offset="100%" stop-color="#3a5fb0" stop-opacity="0"/></radialGradient>
      <radialGradient id="sm-neb2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#6b3aa0" stop-opacity="0.45"/><stop offset="100%" stop-color="#6b3aa0" stop-opacity="0"/></radialGradient>
    </defs>
    ${nebula}
    ${stars.join('')}
    <path d="${trail}" fill="none" stroke="#54607d" stroke-width="1.4" stroke-dasharray="1 4" opacity="0.6"/>
    ${dots}
    ${moreDots}
    ${branches.lines}
    ${earthGlyph}
    ${branches.planets}
    ${wagonGlyph(you.x, you.y, 0.92)}
    ${youLabel}
  </svg>`;
}
