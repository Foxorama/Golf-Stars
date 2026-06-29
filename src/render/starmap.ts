/**
 * Travel journey map (GS-routes, GS-galaxy-map) — the voyage drawn as a real star-chart.
 *
 * The inter-round "choose your jump" screen is a journey, so it's drawn as one: Earth at the
 * origin, a trail running through every cleared stop to YOU, and three glowing branch planets
 * fanning out ahead (one per route option, colour-keyed to the choice card below — rarity ring,
 * event glyph, jump distance, a ⚔ boss / 🔥 harder-path marker). Picking a lane is reading the map.
 *
 * TWO changes over the old single fixed frame:
 *  • GALAXY-EXACT trail — each cleared world is grounded in a real constellation/deep-sky object, so
 *    it carries a true J2000 position (`ra`/`dec`, see sky-coords.ts). The trail plots those: a
 *    world's vertical screen position follows its real declination, and the gap to the previous
 *    world scales with the real angular distance between them — so a hop to a far-flung constellation
 *    visibly LEAPS further. The journey reads as actually wandering the sky, not a generic curve.
 *  • SCROLLABLE — the trail no longer crams every stop into one frame (it squished as the run grew).
 *    It's a wide, horizontally-scrollable strip (auto-scrolled to the most recent stops); the three
 *    forward branches live in a separate, non-scrolling panel pinned to the right, always on screen.
 *
 * Pure + self-contained: deterministic seeded star placement (no Math.random), NO downloaded asset
 * (the wagon + planets are vector glyphs — the house no-404 rule). A little SMIL twinkle/bob gives it
 * life without a render loop. The returned HTML string is byte-stable for a given input, so it's safe
 * to inject via innerHTML; `wireJourneyScroll` (app.ts) just nudges the strip's scrollLeft after mount.
 */

import type { Rarity } from '../sim/course/contract';
import { rarCol } from '../sim/rpg/loot';
import { shipSVG } from './shipArt';

export interface StarmapChoice {
  /** Route id — used only to key the DOM node, not drawn. */
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
};

/** One cleared stop on the travelled trail (Earth → … → YOU). */
export interface StarmapStop {
  /** Zone/theme name, drawn under its node. */
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

const H = 200; // widget height (px); the trail strip and forward panel share it
const FW = 152; // forward (sticky) panel width (px)

// Declination → screen y. A FIXED celestial window (so a world's height is stable across the whole
// run — re-renders never shuffle earlier nodes). The catalogue is southern-curated (dec ≈ +24..−72),
// so this window frames it with a little headroom; north is up.
const DEC_HI = 38;
const DEC_LO = -80;
const Y_TOP = 30;
const Y_BOT = H - 34;
const decY = (dec: number): number => {
  const d = Math.max(DEC_LO, Math.min(DEC_HI, dec));
  return Y_TOP + ((DEC_HI - d) / (DEC_HI - DEC_LO)) * (Y_BOT - Y_TOP);
};
const MID_Y = (Y_TOP + Y_BOT) / 2; // YOU sits here in the panel; the trail bridges into it

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

/** A glowing branch planet for one route choice. The planet BODY reads the destination biome (colour +
 *  glyph), the RING reads the loot rarity, and a small corner badge carries the event/bet glyph — so a
 *  lane previews where you'll play AND what it costs at a glance (GS-journey-biome). */
function planetGlyph(cx: number, cy: number, c: StarmapChoice): string {
  const ring = rarCol(c.rarity);
  const look = (c.archetype && BIOME_LOOK[c.archetype]) || { col: '#8aa0c0', glyph: c.icon };
  const r = 16;
  const markers: string[] = [];
  if (c.bossAhead) markers.push('⚔');
  if (c.elite) markers.push('🔥');
  const markerRow = markers.length
    ? `<text x="${cx + r - 1}" y="${cy - r + 5}" font-size="11" text-anchor="middle">${markers.join('')}</text>`
    : '';
  // The atmospheric effect badge (GS-journey-fx) — a small glyph low-left so the lane previews the
  // weather/lighting you'll play in, alongside the biome (planet body) and stakes (ring/markers).
  const effectBadge = c.effectIcon
    ? `<circle cx="${cx - r + 3}" cy="${cy + r - 3}" r="6.5" fill="#0c1020" stroke="${ring}" stroke-width="1"/>
       <text x="${cx - r + 3}" y="${cy + r}" font-size="9" text-anchor="middle">${c.effectIcon}</text>`
    : '';
  const name = c.worldName ? (c.worldName.length > 14 ? `${c.worldName.slice(0, 13)}…` : c.worldName) : '';
  const nameLabel = name ? `<text x="${cx}" y="${cy + r + 11}" font-size="8" fill="#cdd7ec" text-anchor="middle" font-weight="700">${esc(name)}</text>` : '';
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="${look.col}" opacity="0.16"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${look.col}" opacity="0.20"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="2.4"/>
      <circle cx="${cx - 4.5}" cy="${cy - 4.5}" r="${r - 4}" fill="${look.col}" opacity="0.30"/>
      <text x="${cx}" y="${cy + 5.5}" font-size="16" text-anchor="middle">${look.glyph}</text>
      ${markerRow}
      ${effectBadge}
      ${nameLabel}
      <text x="${cx}" y="${cy + r + (name ? 20 : 11)}" font-size="7.5" fill="${ring}" text-anchor="middle">+${c.distanceJump} jump</text>
    </g>`;
}

/**
 * The whole journey widget as an HTML string: a scrollable trail strip + a pinned forward panel.
 * Returns markup (not a bare <svg>) — embed it directly; app.ts scrolls the strip to the right after.
 */
export function journeyMapHTML(opts: StarmapOpts): string {
  const choices = opts.choices.slice(0, 3);
  const n = Math.max(1, choices.length);

  // ---- trail node geometry: Earth → cleared worlds (galaxy-exact) ----------------------------
  const earth = { x: 34, y: decY(8) }; // home base — pinned near the celestial equator, left edge
  const stops = opts.trail ?? [];
  // Walk left→right, spacing each node from the previous by the real angular distance between the
  // two worlds (clamped so the strip stays legible). Worlds without a coord fall to a neutral gap/y.
  // gap = a small fixed step + a real-angular-distance term, clamped to stay legible. The base step
  // keeps labels from colliding on a near hop while still letting a far-flung jump LEAP further; the
  // slope is gentle so a half-sky leap doesn't blow the strip out. (MIN floor only bites < ~20°.)
  const BASE_GAP = 50;
  const PX_PER_DEG = 0.72;
  const MIN_GAP = 64;
  const MAX_GAP = 168;
  let x = earth.x;
  let prevCoord: { ra: number; dec: number } | null = null;
  const nodes = stops.map((s) => {
    const hasC = typeof s.ra === 'number' && typeof s.dec === 'number';
    const coord = hasC ? { ra: s.ra!, dec: s.dec! } : null;
    let gap = 96; // leaving Earth (or a coord-less world) — a neutral baseline step
    if (coord && prevCoord) gap = Math.max(MIN_GAP, Math.min(MAX_GAP, BASE_GAP + angSepDeg(coord, prevCoord) * PX_PER_DEG));
    else if (!coord) gap = 88;
    x += gap;
    const y = coord ? decY(coord.dec) : MID_Y;
    prevCoord = coord ?? prevCoord;
    return { x, y, label: s.label, glyph: s.glyph, col: s.col };
  });
  const lastX = nodes.length ? nodes[nodes.length - 1]!.x : earth.x;
  // Width = the last node + room for the bridge into YOU. A small floor keeps an empty/short trail sane;
  // when it's narrower than the strip the SVG's `min-width:100%` + right-anchor (xMaxYMid) pin the bridge
  // to the seam so it MEETS the wagon while Earth still shows. A long trail exceeds this and just scrolls.
  const trailW = Math.max(140, lastX + 96);

  // ---- trail path: a smooth poly through Earth → nodes, then a bridge toward YOU --------------
  const pts: Array<{ x: number; y: number }> = [earth, ...nodes, { x: trailW, y: MID_Y }];
  let trailPath = `M${pts[0]!.x.toFixed(1)},${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    const cx = (a.x + b.x) / 2; // a gentle S between each pair reads as a flight arc, not a polyline
    trailPath += ` C ${cx.toFixed(1)},${a.y.toFixed(1)} ${cx.toFixed(1)},${b.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }

  const nodeC = '#6fd0d8'; // a "visited" teal — distinct from Earth's blue and YOU's gold
  const dots = nodes
    .map((nd, k) => {
      const lab = nd.label.length > 13 ? `${nd.label.slice(0, 12)}…` : nd.label;
      const above = k % 2 === 0; // stagger labels above/below the trail to reduce overlap
      // Each cleared world wears its biome glyph (GS-journey-history) with a gentle twinkle, so the
      // trail reads as the actual worlds you've crossed — a relevant, lightly-animated icon per step.
      const ring = nd.col ?? nodeC;
      const ly = above ? nd.y - 13 : nd.y + 19;
      const cx = nd.x.toFixed(1);
      const cy = nd.y.toFixed(1);
      const face = nd.glyph
        ? `<circle cx="${cx}" cy="${cy}" r="9" fill="${ring}" opacity="0.16"/>
           <circle cx="${cx}" cy="${cy}" r="7" fill="#0e1320" stroke="${ring}" stroke-width="1.5"/>
           <text x="${cx}" y="${(nd.y + 3.4).toFixed(1)}" font-size="10" text-anchor="middle"><animate attributeName="opacity" values="0.75;1;0.75" dur="${(2.4 + (k % 3) * 0.4).toFixed(1)}s" repeatCount="indefinite"/>${nd.glyph}</text>`
        : `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${nodeC}" opacity="0.14"/>
           <circle cx="${cx}" cy="${cy}" r="4" fill="#0e1320" stroke="${nodeC}" stroke-width="1.4"/>
           <circle cx="${(nd.x - 1.2).toFixed(1)}" cy="${(nd.y - 1.2).toFixed(1)}" r="1.6" fill="${nodeC}" opacity="0.5"/>`;
      return `<g>
        ${face}
        <text x="${cx}" y="${ly.toFixed(1)}" font-size="8" fill="#aeb9cf" text-anchor="middle" font-weight="600">${esc(lab)}</text>
      </g>`;
    })
    .join('');

  const earthGlyph = `
    <g>
      <circle cx="${earth.x}" cy="${earth.y}" r="17" fill="#1a3a6b" stroke="#2f6fd0" stroke-width="1.5"/>
      <path d="M${earth.x - 12},${earth.y - 5} q6,-4 12,1 q5,4 11,1 M${earth.x - 14},${earth.y + 6} q7,3 13,-1 q6,-3 12,1" stroke="#3fae5a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
      <text x="${earth.x}" y="${earth.y + 32}" font-size="9.5" fill="#9fb0cf" text-anchor="middle" font-weight="700">EARTH</text>
    </g>`;

  // The strip's starfield/nebula is a CONTINUOUS CSS background on `.gs-journey` (shared by both panels)
  // so there's never a starless gap or a hard seam — the SVG itself is transparent. `min-width:100%` +
  // `xMaxYMid` RIGHT-ANCHORS the content to the seam when the trail is shorter than the strip, so the
  // bridge into YOU always meets the forward panel; when it's longer the strip just scrolls (app.ts
  // snaps it to the right edge), and the bridge still lands at the seam.
  const trailSvg = `<svg width="${trailW}" height="${H}" viewBox="0 0 ${trailW} ${H}" preserveAspectRatio="xMaxYMid meet" role="img" aria-label="Travelled path" style="display:block;min-width:100%;height:${H}px;">
    <path d="${trailPath}" fill="none" stroke="#7f8db0" stroke-width="1.6" stroke-dasharray="1 4" opacity="0.7"/>
    ${dots}
    ${earthGlyph}
  </svg>`;

  // ---- forward (sticky) panel: YOU → three branch lanes --------------------------------------
  const youX = 22;
  const bx = FW - 32;
  const top = 26;
  const span = H - 66;
  const branchY = (i: number) => (n === 1 ? MID_Y : top + (span * i) / (n - 1));
  const fbranch = choices
    .map((c, i) => {
      const by = branchY(i);
      const col = rarCol(c.rarity);
      const path = `M${youX},${MID_Y} C ${youX + 40},${MID_Y} ${bx - 40},${by} ${bx},${by}`;
      const glow = c.elite || c.bossAhead ? `<path d="${path}" fill="none" stroke="${col}" stroke-width="5" opacity="0.18"/>` : '';
      return {
        line: `${glow}<path d="${path}" fill="none" stroke="${col}" stroke-width="1.7" stroke-dasharray="2 4" opacity="0.85"><animate attributeName="stroke-dashoffset" values="12;0" dur="1.1s" repeatCount="indefinite"/></path>`,
        planet: planetGlyph(bx, by, c),
      };
    })
    .reduce((acc, b) => ({ lines: acc.lines + b.line, planets: acc.planets + b.planet }), { lines: '', planets: '' });
  // The trail flows IN to YOU across the seam: a SOLID lead-in from the left edge to the wagon (the trail
  // strip's dashed bridge lands at the same MID_Y at the seam, so the line reads continuous wagon←trail).
  const youStub = `<path d="M0,${MID_Y} L${youX},${MID_Y}" fill="none" stroke="#7f8db0" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>`;
  const youLabel = `
    <text x="${youX + 6}" y="${MID_Y - 16}" font-size="9" fill="#ffce54" text-anchor="middle" font-weight="800">YOU</text>
    <text x="${youX + 6}" y="${MID_Y + 22}" font-size="7.5" fill="#7f8aa3" text-anchor="middle">dist ${opts.distanceFromStart}</text>`;

  const fwdSvg = `<svg width="${FW}" height="${H}" viewBox="0 0 ${FW} ${H}" role="img" aria-label="Routes ahead" style="display:block;">
    ${youStub}
    ${fbranch.lines}
    ${fbranch.planets}
    ${shipSVG(opts.shipId, youX, MID_Y, 0.82)}
    ${youLabel}
  </svg>`;

  return `<div class="gs-journey">
    <div class="gs-journey-trail" data-journey-scroll>${trailSvg}</div>
    <div class="gs-journey-fwd">${fwdSvg}</div>
  </div>
  <div class="gs-journey-here">📍 You're at <b>${esc(opts.currentLabel)}</b> · dist ${opts.distanceFromStart} · ← scroll back through your voyage</div>`;
}
