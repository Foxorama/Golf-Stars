/**
 * Travel journey map (GS-routes, GS-galaxy-map, GS-journey-vertical) — the voyage drawn as a real
 * star-chart you climb.
 *
 * The inter-round "choose your jump" screen is a journey, so it's drawn as one — now VERTICAL and
 * mobile-first: Earth at the BOTTOM (home), the travelled trail winding UP through every cleared stop
 * to YOU, and three glowing branch planets fanning across the TOP (one per route option). Each branch
 * planet is a TAP TARGET (`data-route-inspect`) — tapping it opens the route-info sheet (app.ts) with
 * the full bet + world detail and a confirm/cancel, so picking a lane is reading the map, not scanning
 * a wall of cards. Colour-keyed to the sheet (rarity ring, biome body, event glyph, ⚔ boss / 🔥
 * harder-path markers).
 *
 * GALAXY-EXACT (kept from the old horizontal chart): each cleared world is grounded in a real
 * constellation/deep-sky object carrying a true J2000 position (`ra`/`dec`, see sky-coords.ts). On the
 * vertical chart a world's HORIZONTAL position follows its real declination, and the VERTICAL gap to the
 * previous world scales with the real angular distance between them — so a hop to a far-flung
 * constellation visibly CLIMBS further. The journey reads as actually wandering the sky.
 *
 * Pure + self-contained: deterministic (no Math.random), NO downloaded asset (the wagon + planets are
 * vector glyphs — the house no-404 rule). A little SMIL twinkle/bob gives it life without a render loop.
 * The returned HTML string is byte-stable for a given input, so it's safe to inject via innerHTML. One
 * responsive SVG scaled to the container width; the PAGE scrolls when a long voyage makes it tall.
 */

import type { Rarity } from '../sim/course/contract';
import { rarCol } from '../sim/rpg/loot';
import { shipSVG } from './shipArt';

export interface StarmapChoice {
  /** Route id — drawn onto the planet's `data-route-inspect` so a tap opens that route's info sheet. */
  id: number;
  label: string;
  /** Event glyph (emoji) — a small badge on the planet (the bet type; the planet itself reads biome). */
  icon: string;
  rarity: Rarity;
  /** How far this lane jumps (drawn as a +N chip). */
  distanceJump: number;
  /** The BIOME this lane flies into (GS-journey-biome) — colours + glyphs the destination planet so the
   *  route preview reads as the world you'll actually play. Optional → a neutral planet (old behaviour). */
  archetype?: string;
  /** The destination world's name, drawn under its planet. */
  worldName?: string;
  /** The atmospheric course effect this lane brings (GS-journey-fx) — drawn as a small corner badge so
   *  the lane previews the weather/lighting you'll play in, not just the biome. */
  effectIcon?: string;
  elite?: boolean;
  bossAhead?: boolean;
}

/** Per-biome planet look (GS-journey-biome) — a colour + glyph so each lane's destination reads on-world.
 *  Self-contained in the widget (no coupling to the heavy render palette). */
const BIOME_LOOK: Record<string, { col: string; glyph: string }> = {
  verdant: { col: '#5fd45a', glyph: '🌳' },
  desert: { col: '#e0b15a', glyph: '🏜️' },
  frost: { col: '#7fd6e6', glyph: '❄️' },
  inferno: { col: '#ff6b4a', glyph: '🌋' },
  void: { col: '#9a7bd0', glyph: '🌌' },
  crystal: { col: '#9fe0f5', glyph: '💎' },
  tempest: { col: '#c8b8ff', glyph: '🌪️' },
  fungal: { col: '#54dba0', glyph: '🍄' },
  ocean: { col: '#5fd49e', glyph: '🌊' },
  cetus: { col: '#5fd8dc', glyph: '🐋' },
};

/** One cleared stop on the travelled trail (Earth → … → YOU). */
export interface StarmapStop {
  /** Zone/theme name, drawn beside its node. */
  label: string;
  /** Real-sky position (equatorial J2000, degrees). Absent → placed at a neutral baseline. */
  ra?: number;
  dec?: number;
  /** The world's biome glyph (GS-journey-history) — drawn on the node so a cleared stop reads as the
   *  world you played (a fun, relevant icon), with a gentle twinkle. Absent → a plain visited dot. */
  glyph?: string;
  /** The biome's accent colour — tints the node ring. */
  col?: string;
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
   * journey visibly BUILDS. The current stop (YOU) is NOT included. Each carries its real-sky
   * position when known (so the trail is galaxy-exact). Optional — an empty trail draws just Earth.
   */
  trail?: StarmapStop[];
  choices: StarmapChoice[];
  /** The cosmetic ship to draw as the "YOU" craft (GS-garage). Absent → the classic Woody Wagon. */
  shipId?: string;
}

// ---- vertical chart geometry -----------------------------------------------------------------
const W = 320; // viewBox width (px, user units); the SVG scales to the container via width:100%
const CHOICE_Y = 62; // the three branch planets sit across the top
const YOU_Y = 168; // YOU sits below the choices; lanes rise from here to each planet
const YOU_X = W / 2;
const FIRST_DROP = 66; // YOU → the most-recent cleared world
const EARTH_DROP = 74; // the oldest cleared world → Earth (Earth has no real coord)
const BOTTOM_PAD = 40; // room under Earth for its label

// Declination → screen x. A FIXED celestial window (so a world's horizontal position is stable across
// the whole run — re-renders never shuffle earlier nodes). The catalogue is southern-curated
// (dec ≈ +24..−72), so this window frames it with headroom; higher dec sits further left.
const DEC_HI = 38;
const DEC_LO = -80;
const X_L = 58;
const X_R = W - 58;
const decX = (dec: number): number => {
  const d = Math.max(DEC_LO, Math.min(DEC_HI, dec));
  return X_L + ((DEC_HI - d) / (DEC_HI - DEC_LO)) * (X_R - X_L);
};

// Vertical gap between consecutive worlds = a small fixed step + a real-angular-distance term, clamped
// to stay legible. The base step keeps labels from colliding on a near hop while still letting a
// far-flung jump CLIMB further; the slope is gentle so a half-sky leap doesn't blow the strip out.
const BASE_GAP = 46;
const PX_PER_DEG = 0.66;
const MIN_GAP = 58;
const MAX_GAP = 150;

// Great-circle angular separation (degrees) between two equatorial positions.
function angSepDeg(a: { ra: number; dec: number }, b: { ra: number; dec: number }): number {
  const R = Math.PI / 180;
  const d1 = a.dec * R,
    d2 = b.dec * R,
    dl = (a.ra - b.ra) * R;
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c))) / R;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A glowing branch planet for one route choice — a TAP TARGET that opens its info sheet. The planet
 *  BODY reads the destination biome (colour + glyph), the RING reads the loot rarity, and small badges
 *  carry the event/bet glyph + atmospheric effect + ⚔/🔥 markers — so a lane previews where you'll play
 *  AND what it costs at a glance (GS-journey-biome, GS-journey-vertical). */
function planetGlyph(cx: number, cy: number, c: StarmapChoice): string {
  const ring = rarCol(c.rarity);
  const look = (c.archetype && BIOME_LOOK[c.archetype]) || { col: '#8aa0c0', glyph: c.icon };
  const r = 20;
  const markers: string[] = [];
  if (c.bossAhead) markers.push('⚔');
  if (c.elite) markers.push('🔥');
  const markerRow = markers.length
    ? `<text x="${cx + r - 2}" y="${cy - r + 6}" font-size="12" text-anchor="middle">${markers.join('')}</text>`
    : '';
  // The atmospheric effect badge (GS-journey-fx) — a small glyph low-left so the lane previews the
  // weather/lighting you'll play in, alongside the biome (planet body) and stakes (ring/markers).
  const effectBadge = c.effectIcon
    ? `<circle cx="${cx - r + 4}" cy="${cy + r - 4}" r="7.5" fill="#0c1020" stroke="${ring}" stroke-width="1"/>
       <text x="${cx - r + 4}" y="${cy + r - 0.5}" font-size="10" text-anchor="middle">${c.effectIcon}</text>`
    : '';
  const name = c.worldName ? (c.worldName.length > 15 ? `${c.worldName.slice(0, 14)}…` : c.worldName) : '';
  const nameLabel = name ? `<text x="${cx}" y="${cy + r + 15}" font-size="10" fill="#eaf0ff" text-anchor="middle" font-weight="700">${esc(name)}</text>` : '';
  const jumpLabel = `<text x="${cx}" y="${cy + r + (name ? 27 : 15)}" font-size="8.5" fill="${ring}" text-anchor="middle">+${c.distanceJump} jump ›</text>`;
  // A soft pulsing halo signals "tap me"; a big transparent hit-circle makes the target thumb-sized.
  return `
    <g data-route-inspect="${c.id}" role="button" tabindex="0" aria-label="${esc(c.worldName ?? c.label)} — view jump" style="cursor:pointer;">
      <circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="transparent" pointer-events="all"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="${ring}" stroke-width="1.3" opacity="0.5">
        <animate attributeName="r" values="${r + 3};${r + 8};${r + 3}" dur="2.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0.05;0.5" dur="2.6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="${look.col}" opacity="0.14"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${look.col}" opacity="0.22"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="2.6"/>
      <circle cx="${cx - 5.5}" cy="${cy - 5.5}" r="${r - 5}" fill="${look.col}" opacity="0.32"/>
      <text x="${cx}" y="${cy + 7}" font-size="20" text-anchor="middle">${look.glyph}</text>
      ${markerRow}
      ${effectBadge}
      ${nameLabel}
      ${jumpLabel}
    </g>`;
}

/**
 * The whole journey widget as an HTML string: one responsive, vertical star-chart (Earth at the bottom,
 * three tappable branch planets at the top) plus a "you're here" caption. Returns markup (not a bare
 * <svg>) — embed it directly. Byte-stable for a given input.
 */
export function journeyMapHTML(opts: StarmapOpts): string {
  const choices = opts.choices.slice(0, 3);
  const n = Math.max(1, choices.length);

  // ---- trail node geometry: YOU → cleared worlds (newest→oldest, climbing DOWN) → Earth -------
  // History is oldest→newest; the NEWEST cleared world sits nearest YOU (top), the oldest nearest Earth
  // (bottom). Walk newest→oldest, dropping each node below the previous by the real angular distance
  // between the two worlds (clamped so the chart stays legible). Worlds without a coord fall to a
  // neutral gap / centred x.
  const stops = opts.trail ?? [];
  const rev = stops.slice().reverse(); // newest first (drawn top→bottom under YOU)
  let y = YOU_Y;
  let prevCoord: { ra: number; dec: number } | null = null;
  const nodes = rev.map((s, i) => {
    const hasC = typeof s.ra === 'number' && typeof s.dec === 'number';
    const coord = hasC ? { ra: s.ra!, dec: s.dec! } : null;
    let gap = i === 0 ? FIRST_DROP : 88; // leaving YOU, or a coord-less hop — a neutral baseline step
    if (i > 0 && coord && prevCoord) gap = Math.max(MIN_GAP, Math.min(MAX_GAP, BASE_GAP + angSepDeg(coord, prevCoord) * PX_PER_DEG));
    y += gap;
    const x = coord ? decX(coord.dec) : YOU_X;
    prevCoord = coord ?? prevCoord;
    return { x, y, label: s.label, glyph: s.glyph, col: s.col };
  });
  const lastY = nodes.length ? nodes[nodes.length - 1]!.y : YOU_Y;
  const earth = { x: decX(8), y: lastY + (nodes.length ? EARTH_DROP : 96) };
  const H = Math.max(300, Math.round(earth.y + BOTTOM_PAD));

  // ---- trail path: a smooth poly from YOU down through the nodes to Earth ---------------------
  const pts: Array<{ x: number; y: number }> = [{ x: YOU_X, y: YOU_Y }, ...nodes, earth];
  let trailPath = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    const cy = (a.y + b.y) / 2; // a gentle S between each pair reads as a flight arc, not a polyline
    trailPath += ` C ${a.x.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }

  const nodeC = '#6fd0d8'; // a "visited" teal — distinct from Earth's blue and YOU's gold
  const dots = nodes
    .map((nd, k) => {
      const lab = nd.label.length > 14 ? `${nd.label.slice(0, 13)}…` : nd.label;
      const right = k % 2 === 0; // stagger labels left/right of the trail to reduce overlap
      const ring = nd.col ?? nodeC;
      const lx = right ? nd.x + 15 : nd.x - 15;
      const anchor = right ? 'start' : 'end';
      const cx = nd.x.toFixed(1);
      const cy = nd.y.toFixed(1);
      // Each cleared world wears its biome glyph (GS-journey-history) with a gentle twinkle, so the
      // trail reads as the actual worlds you've crossed — a relevant, lightly-animated icon per step.
      const face = nd.glyph
        ? `<circle cx="${cx}" cy="${cy}" r="11" fill="${ring}" opacity="0.16"/>
           <circle cx="${cx}" cy="${cy}" r="8.5" fill="#0e1320" stroke="${ring}" stroke-width="1.6"/>
           <text x="${cx}" y="${(nd.y + 4).toFixed(1)}" font-size="12" text-anchor="middle"><animate attributeName="opacity" values="0.78;1;0.78" dur="${(2.4 + (k % 3) * 0.4).toFixed(1)}s" repeatCount="indefinite"/>${nd.glyph}</text>`
        : `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${nodeC}" opacity="0.14"/>
           <circle cx="${cx}" cy="${cy}" r="4" fill="#0e1320" stroke="${nodeC}" stroke-width="1.4"/>
           <circle cx="${(nd.x - 1.2).toFixed(1)}" cy="${(nd.y - 1.2).toFixed(1)}" r="1.6" fill="${nodeC}" opacity="0.5"/>`;
      return `<g>
        ${face}
        <text x="${lx.toFixed(1)}" y="${(nd.y + 3.2).toFixed(1)}" font-size="9" fill="#aeb9cf" text-anchor="${anchor}" font-weight="600">${esc(lab)}</text>
      </g>`;
    })
    .join('');

  const earthGlyph = `
    <g>
      <circle cx="${earth.x}" cy="${earth.y}" r="19" fill="#1a3a6b" stroke="#2f6fd0" stroke-width="1.6"/>
      <path d="M${earth.x - 13},${earth.y - 6} q7,-4 13,1 q5,4 12,1 M${earth.x - 15},${earth.y + 6} q8,3 14,-1 q6,-3 13,1" stroke="#3fae5a" stroke-width="3.2" fill="none" stroke-linecap="round" opacity="0.85"/>
      <text x="${earth.x}" y="${earth.y + 34}" font-size="10.5" fill="#9fb0cf" text-anchor="middle" font-weight="700">EARTH · home</text>
    </g>`;

  // ---- forward lanes: YOU → the three branch planets across the top --------------------------
  const bx = (i: number) => (n === 1 ? YOU_X : X_L + 6 + ((X_R - X_L - 12) * i) / (n - 1));
  const fbranch = choices
    .map((c, i) => {
      const px = bx(i);
      const col = rarCol(c.rarity);
      const path = `M${YOU_X},${YOU_Y} C ${YOU_X},${(YOU_Y + CHOICE_Y) / 2} ${px},${(YOU_Y + CHOICE_Y) / 2} ${px},${CHOICE_Y}`;
      const glow = c.elite || c.bossAhead ? `<path d="${path}" fill="none" stroke="${col}" stroke-width="5.5" opacity="0.18"/>` : '';
      return {
        line: `${glow}<path d="${path}" fill="none" stroke="${col}" stroke-width="1.9" stroke-dasharray="2 4" opacity="0.85"><animate attributeName="stroke-dashoffset" values="12;0" dur="1.1s" repeatCount="indefinite"/></path>`,
        planet: planetGlyph(px, CHOICE_Y, c),
      };
    })
    .reduce((acc, b) => ({ lines: acc.lines + b.line, planets: acc.planets + b.planet }), { lines: '', planets: '' });

  const youLabel = `
    <text x="${YOU_X}" y="${YOU_Y - 22}" font-size="11" fill="#ffce54" text-anchor="middle" font-weight="800">YOU</text>
    <text x="${YOU_X}" y="${YOU_Y + 30}" font-size="8.5" fill="#9aa7c2" text-anchor="middle">${esc(opts.currentLabel)} · dist ${opts.distanceFromStart}</text>`;

  // ONE responsive SVG scaled to the container width (width:100%, height set by the viewBox aspect); the
  // page scrolls when a long voyage makes it tall. The starfield/nebula is a CONTINUOUS CSS background on
  // `.gs-journey`; the SVG itself is transparent.
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Journey map — Earth at the bottom, your route choices at the top" style="display:block;width:100%;height:auto;" data-journey-svg>
    <path d="${trailPath}" fill="none" stroke="#7f8db0" stroke-width="1.7" stroke-dasharray="1 4" opacity="0.7"/>
    ${fbranch.lines}
    ${dots}
    ${earthGlyph}
    ${shipSVG(opts.shipId, YOU_X, YOU_Y, 0.9)}
    ${youLabel}
    ${fbranch.planets}
  </svg>`;

  return `<div class="gs-journey gs-journey--v">${svg}</div>
  <div class="gs-journey-here">📍 You're at <b>${esc(opts.currentLabel)}</b> · dist ${opts.distanceFromStart} · tap a planet up top to choose your jump</div>`;
}
