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
  /** Real-sky position (equatorial J2000, degrees). Absent → placed at a neutral baseline. */
  ra?: number;
  dec?: number;
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

/** The station-wagon spaceship, facing right — a compact vector glyph (no asset). `s` ≈ width/40. */
function wagonGlyph(cx: number, cy: number, s: number): string {
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
      <text x="${cx}" y="${cy + r + 12}" font-size="8" fill="${col}" text-anchor="middle">+${c.distanceJump} jump</text>
    </g>`;
}

/** A seeded starfield + nebula sized to a panel of `w`×`h`, as one SVG fragment. */
function starfield(rng: Rng, w: number, h: number): string {
  const stars: string[] = [];
  const count = Math.round((w * h) / 920); // density-matched so a wide strip isn't sparse
  for (let i = 0; i < count; i++) {
    const x = rng.float() * w;
    const y = rng.float() * h;
    const sr = rng.float() * 1.1 + 0.3;
    const op = (rng.float() * 0.5 + 0.25).toFixed(2);
    const tw =
      i % 11 === 0
        ? `<animate attributeName="opacity" values="${op};0.12;${op}" dur="${(2 + rng.float() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
        : '';
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sr.toFixed(2)}" fill="#dfe7ff" opacity="${op}">${tw}</circle>`);
  }
  const nebula = `
    <ellipse cx="${(w * 0.5).toFixed(0)}" cy="${(h * 0.3).toFixed(0)}" rx="${(w * 0.4).toFixed(0)}" ry="70" fill="url(#sm-neb)" opacity="0.5"/>
    <ellipse cx="${(w * 0.2).toFixed(0)}" cy="${(h * 0.8).toFixed(0)}" rx="90" ry="55" fill="url(#sm-neb2)" opacity="0.4"/>`;
  return nebula + stars.join('');
}

const NEBULA_DEFS = `<defs>
  <radialGradient id="sm-neb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#3a5fb0" stop-opacity="0.5"/><stop offset="100%" stop-color="#3a5fb0" stop-opacity="0"/></radialGradient>
  <radialGradient id="sm-neb2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#6b3aa0" stop-opacity="0.45"/><stop offset="100%" stop-color="#6b3aa0" stop-opacity="0"/></radialGradient>
</defs>`;

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
    return { x, y, label: s.label };
  });
  const lastX = nodes.length ? nodes[nodes.length - 1]!.x : earth.x;
  const trailW = Math.max(FW + 120, lastX + 96); // room past the last node for the bridge into YOU

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
      const ly = above ? nd.y - 10 : nd.y + 15;
      return `<g>
        <circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="6.5" fill="${nodeC}" opacity="0.14"/>
        <circle cx="${nd.x.toFixed(1)}" cy="${nd.y.toFixed(1)}" r="4" fill="#0e1320" stroke="${nodeC}" stroke-width="1.4"/>
        <circle cx="${(nd.x - 1.2).toFixed(1)}" cy="${(nd.y - 1.2).toFixed(1)}" r="1.6" fill="${nodeC}" opacity="0.5"/>
        <text x="${nd.x.toFixed(1)}" y="${ly.toFixed(1)}" font-size="8" fill="#aeb9cf" text-anchor="middle" font-weight="600">${esc(lab)}</text>
      </g>`;
    })
    .join('');

  const earthGlyph = `
    <g>
      <circle cx="${earth.x}" cy="${earth.y}" r="17" fill="#1a3a6b" stroke="#2f6fd0" stroke-width="1.5"/>
      <path d="M${earth.x - 12},${earth.y - 5} q6,-4 12,1 q5,4 11,1 M${earth.x - 14},${earth.y + 6} q7,3 13,-1 q6,-3 12,1" stroke="#3fae5a" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
      <text x="${earth.x}" y="${earth.y + 32}" font-size="9.5" fill="#9fb0cf" text-anchor="middle" font-weight="700">EARTH</text>
    </g>`;

  const trailRng = new Rng(`${opts.seed}:trail:${opts.stopIndex}`);
  const trailSvg = `<svg width="${trailW}" height="${H}" viewBox="0 0 ${trailW} ${H}" role="img" aria-label="Travelled path" style="display:block;">
    ${NEBULA_DEFS}
    ${starfield(trailRng, trailW, H)}
    <path d="${trailPath}" fill="none" stroke="#54607d" stroke-width="1.4" stroke-dasharray="1 4" opacity="0.6"/>
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
  // A short incoming stub on the panel's left edge so the trail visibly flows IN to YOU across the seam.
  const youStub = `<path d="M0,${MID_Y} L${youX},${MID_Y}" fill="none" stroke="#54607d" stroke-width="1.4" stroke-dasharray="1 4" opacity="0.6"/>`;
  const youLabel = `
    <text x="${youX + 6}" y="${MID_Y - 16}" font-size="9" fill="#ffce54" text-anchor="middle" font-weight="800">YOU</text>
    <text x="${youX + 6}" y="${MID_Y + 22}" font-size="7.5" fill="#7f8aa3" text-anchor="middle">dist ${opts.distanceFromStart}</text>`;

  const fwdRng = new Rng(`${opts.seed}:fwd:${opts.stopIndex}`);
  const fwdSvg = `<svg width="${FW}" height="${H}" viewBox="0 0 ${FW} ${H}" role="img" aria-label="Routes ahead" style="display:block;">
    ${NEBULA_DEFS}
    ${starfield(fwdRng, FW, H)}
    ${youStub}
    ${fbranch.lines}
    ${fbranch.planets}
    ${wagonGlyph(youX, MID_Y, 0.82)}
    ${youLabel}
  </svg>`;

  return `<div class="gs-journey">
    <div class="gs-journey-trail" data-journey-scroll>${trailSvg}</div>
    <div class="gs-journey-fwd">${fwdSvg}</div>
  </div>
  <div class="gs-journey-here">📍 You're at <b>${esc(opts.currentLabel)}</b> · dist ${opts.distanceFromStart} · ← scroll back through your voyage</div>`;
}
