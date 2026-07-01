/**
 * Travel journey map (GS-routes, GS-galaxy-map, GS-journey-vertical, GS-journey-alive) — the voyage
 * drawn as a real star-chart you climb, now with the depth and drama of a proper "choose your jump".
 *
 * The inter-round "choose your jump" screen is a journey, so it's drawn as one — VERTICAL and
 * mobile-first: Earth at the BOTTOM (home), the travelled trail winding UP through every cleared stop
 * to YOU (poised on a glowing launch pad), and three GLOWING WORLDS fanning across the TOP (one per
 * route option). Each destination is a TAP TARGET (`data-route-inspect`) — tapping it opens the
 * route-info sheet (app.ts) with the full bet + world detail and a confirm/cancel, so picking a lane
 * is reading the map, not scanning a wall of cards.
 *
 * GS-journey-alive turns the flat glyph-discs into ACTUAL WORLDS: each destination is a lit-from-the-
 * upper-left sphere (radial-gradient body + terminator crescent + specular glint + atmosphere rim)
 * carrying biome-specific surface art (gas bands, lava cracks + ember glow, ice caps, dunes, lush
 * continents). Boss worlds wear an ominous red aura; harder paths shimmer with heat. Energy pulses
 * flow up the warp corridors toward each gate, a comet periodically flies the travelled trail from
 * Earth up to YOU, and the sky itself twinkles with seeded stars and the odd shooting star — all so
 * the screen feels like a living cockpit, not a diagram. Colour-keyed to the sheet (rarity ring,
 * biome body, event glyph, ⚔ boss / 🔥 harder-path markers).
 *
 * GALAXY-EXACT (kept from the old horizontal chart): each cleared world is grounded in a real
 * constellation/deep-sky object carrying a true J2000 position (`ra`/`dec`, see sky-coords.ts). On the
 * vertical chart a world's HORIZONTAL position follows its real declination, and the VERTICAL gap to the
 * previous world scales with the real angular distance between them — so a hop to a far-flung
 * constellation visibly CLIMBS further. The journey reads as actually wandering the sky.
 *
 * Pure + self-contained: deterministic (a local seeded mulberry32 places the decorative sky — NEVER
 * `Math.random`), NO downloaded asset (every world/ship/comet is a vector glyph — the house no-404
 * rule). SMIL twinkle/drift/flow gives it life without a render loop. The returned HTML string is
 * byte-stable for a given input, so it's safe to inject via innerHTML. One responsive SVG scaled to
 * the container width; the PAGE scrolls when a long voyage makes it tall.
 */

import type { Rarity } from '../sim/course/contract';
import { rarCol } from '../sim/rpg/loot';
import { shipSVG } from './shipArt';

export interface StarmapChoice {
  /** Route id — drawn onto the world's `data-route-inspect` so a tap opens that route's info sheet. */
  id: number;
  label: string;
  /** Event glyph (emoji) — a small badge on the world (the bet type; the world itself reads biome). */
  icon: string;
  rarity: Rarity;
  /** How far this lane jumps (drawn as a +N chip). */
  distanceJump: number;
  /** The BIOME this lane flies into (GS-journey-biome) — colours + glyphs the destination world so the
   *  route preview reads as the place you'll actually play. Optional → a neutral world (old behaviour). */
  archetype?: string;
  /** The destination world's name, drawn under its planet. */
  worldName?: string;
  /** The atmospheric course effect this lane brings (GS-journey-fx) — drawn as a small corner badge so
   *  the lane previews the weather/lighting you'll play in, not just the biome. */
  effectIcon?: string;
  elite?: boolean;
  bossAhead?: boolean;
}

/** Per-biome world look (GS-journey-biome) — a colour + glyph + surface family so each lane's
 *  destination reads on-world. Self-contained in the widget (no coupling to the heavy render palette). */
const BIOME_LOOK: Record<string, { col: string; glyph: string; family: SurfaceFamily }> = {
  verdant: { col: '#5fd45a', glyph: '🌳', family: 'lush' },
  desert: { col: '#e0b15a', glyph: '🏜️', family: 'arid' },
  frost: { col: '#7fd6e6', glyph: '❄️', family: 'icy' },
  inferno: { col: '#ff6b4a', glyph: '🌋', family: 'molten' },
  void: { col: '#9a7bd0', glyph: '🌌', family: 'gas' },
  crystal: { col: '#9fe0f5', glyph: '💎', family: 'icy' },
  tempest: { col: '#c8b8ff', glyph: '🌪️', family: 'gas' },
  fungal: { col: '#54dba0', glyph: '🍄', family: 'lush' },
  ocean: { col: '#5fd49e', glyph: '🌊', family: 'lush' },
  cetus: { col: '#5fd8dc', glyph: '🐋', family: 'lush' },
};
type SurfaceFamily = 'lush' | 'arid' | 'icy' | 'molten' | 'gas' | 'plain';

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
const CHOICE_Y = 66; // the three destination worlds sit across the top
const YOU_Y = 172; // YOU sits below the choices; lanes rise from here to each world
const YOU_X = W / 2;
const FIRST_DROP = 66; // YOU → the most-recent cleared world
const EARTH_DROP = 74; // the oldest cleared world → Earth (Earth has no real coord)
const BOTTOM_PAD = 42; // room under Earth for its label

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

// ---- seeded decoration RNG (byte-stable sky) -------------------------------------------------
// The sky's twinkles + shooting stars are placed deterministically from `opts.seed` so a given voyage
// always draws the same chart (the whole widget is byte-stable). NEVER Math.random — that would break
// reproducible runs and the determinism test.
function hashSeed(seed: number | string): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- colour helpers (light/dark shades for a lit sphere) -------------------------------------
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
/** Mix a hex colour toward an rgb target by t∈0..1 → a new hex. */
function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const nr = clamp255(r + (target[0] - r) * t);
  const ng = clamp255(g + (target[1] - g) * t);
  const nb = clamp255(b + (target[2] - b) * t);
  return `#${((1 << 24) | (nr << 16) | (ng << 8) | nb).toString(16).slice(1)}`;
}
const lighten = (hex: string, t: number): string => mix(hex, [255, 255, 255], t);
const darken = (hex: string, t: number): string => mix(hex, [8, 12, 24], t); // toward the space background

// ---- biome surface art (clipped to the world body) -------------------------------------------
// Each family draws a couple of on-brand shapes over the gradient body — enough to read as a real
// world at 40px, cheap enough that three of them animate smoothly on a phone (a few SMIL drifts, no
// filters). Drawn in absolute (cx,cy) coords, clipped to the body circle by the caller.
function surfaceArt(family: SurfaceFamily, cx: number, cy: number, r: number, col: string): string {
  const dk = darken(col, 0.42);
  const lt = lighten(col, 0.42);
  switch (family) {
    case 'gas': {
      // Slow-drifting cloud bands — a gas giant's marble swirl.
      const band = (dy: number, ry: number, fill: string, op: number, dur: string) =>
        `<ellipse cx="${cx}" cy="${(cy + dy).toFixed(1)}" rx="${(r * 1.35).toFixed(1)}" ry="${ry}" fill="${fill}" opacity="${op}">
           <animateTransform attributeName="transform" type="translate" values="0 0;3.2 0;0 0" dur="${dur}" repeatCount="indefinite"/></ellipse>`;
      return band(-r * 0.5, 3.4, lt, 0.5, '7s') + band(-r * 0.08, 4.2, dk, 0.42, '9s') + band(r * 0.42, 3.2, lt, 0.4, '8s') + band(r * 0.72, 2.4, dk, 0.4, '10s');
    }
    case 'molten': {
      // A dark crust webbed with glowing ember cracks that pulse like cooling lava.
      const crack = (d: string, dur: string) =>
        `<path d="${d}" fill="none" stroke="#ffd15a" stroke-width="1.5" stroke-linecap="round" opacity="0.85">
           <animate attributeName="opacity" values="0.85;0.35;0.85" dur="${dur}" repeatCount="indefinite"/></path>`;
      const hot = `<circle cx="${(cx - r * 0.28).toFixed(1)}" cy="${(cy + r * 0.3).toFixed(1)}" r="${(r * 0.34).toFixed(1)}" fill="#ff7a3c" opacity="0.4">
           <animate attributeName="opacity" values="0.4;0.7;0.4" dur="2.4s" repeatCount="indefinite"/></circle>`;
      return (
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${darken(col, 0.55)}" opacity="0.5"/>` +
        hot +
        crack(`M${(cx - r * 0.7).toFixed(1)},${(cy - r * 0.2).toFixed(1)} q${(r * 0.4).toFixed(1)},${(r * 0.3).toFixed(1)} ${(r * 0.7).toFixed(1)},${(-r * 0.1).toFixed(1)} q${(r * 0.3).toFixed(1)},${(-r * 0.2).toFixed(1)} ${(r * 0.6).toFixed(1)},${(r * 0.25).toFixed(1)}`, '2.8s') +
        crack(`M${(cx - r * 0.3).toFixed(1)},${(cy + r * 0.55).toFixed(1)} q${(r * 0.2).toFixed(1)},${(-r * 0.35).toFixed(1)} ${(r * 0.5).toFixed(1)},${(-r * 0.5).toFixed(1)}`, '3.6s')
      );
    }
    case 'icy': {
      // Bright polar caps + a couple of frost fractures.
      return (
        `<ellipse cx="${cx}" cy="${(cy - r * 0.72).toFixed(1)}" rx="${(r * 0.82).toFixed(1)}" ry="${(r * 0.4).toFixed(1)}" fill="#f2fbff" opacity="0.72"/>` +
        `<ellipse cx="${cx}" cy="${(cy + r * 0.78).toFixed(1)}" rx="${(r * 0.66).toFixed(1)}" ry="${(r * 0.34).toFixed(1)}" fill="#f2fbff" opacity="0.6"/>` +
        `<path d="M${(cx - r * 0.5).toFixed(1)},${(cy - r * 0.1).toFixed(1)} l${(r * 0.5).toFixed(1)},${(r * 0.25).toFixed(1)} l${(r * 0.35).toFixed(1)},${(-r * 0.28).toFixed(1)}" fill="none" stroke="#dff2ff" stroke-width="1.1" opacity="0.55"/>`
      );
    }
    case 'arid': {
      // Warm dune ribbons sweeping across the disc.
      const dune = (dy: number, fill: string, op: number) =>
        `<path d="M${(cx - r * 1.2).toFixed(1)},${(cy + dy).toFixed(1)} q${(r * 0.6).toFixed(1)},${(-r * 0.18).toFixed(1)} ${(r * 1.2).toFixed(1)},0 q${(r * 0.6).toFixed(1)},${(r * 0.18).toFixed(1)} ${(r * 1.2).toFixed(1)},0" fill="none" stroke="${fill}" stroke-width="2.6" opacity="${op}"/>`;
      return dune(-r * 0.4, lt, 0.42) + dune(r * 0.05, dk, 0.4) + dune(r * 0.5, lt, 0.36);
    }
    case 'lush': {
      // Organic continents + a drifting weather swirl.
      const blob = (dx: number, dy: number, rr: number, fill: string, op: number) =>
        `<ellipse cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" rx="${rr.toFixed(1)}" ry="${(rr * 0.72).toFixed(1)}" fill="${fill}" opacity="${op}"/>`;
      const cloud = `<path d="M${(cx - r * 0.6).toFixed(1)},${(cy - r * 0.35).toFixed(1)} q${(r * 0.5).toFixed(1)},${(-r * 0.2).toFixed(1)} ${(r * 1.0).toFixed(1)},${(r * 0.05).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.3">
        <animateTransform attributeName="transform" type="translate" values="0 0;3 0.6;0 0" dur="8s" repeatCount="indefinite"/></path>`;
      return blob(-r * 0.28, r * 0.18, r * 0.5, dk, 0.5) + blob(r * 0.36, -r * 0.24, r * 0.36, dk, 0.46) + blob(r * 0.2, r * 0.5, r * 0.3, lt, 0.4) + cloud;
    }
    default:
      // Neutral world — one soft continent + a highlight so even an unknown biome reads as a sphere.
      return `<ellipse cx="${(cx + r * 0.24).toFixed(1)}" cy="${(cy + r * 0.28).toFixed(1)}" rx="${(r * 0.5).toFixed(1)}" ry="${(r * 0.4).toFixed(1)}" fill="${dk}" opacity="0.4"/>`;
  }
}

/**
 * A glowing destination WORLD for one route choice — a lit sphere that reads its biome (colour +
 * surface art + glyph), rimmed by its loot rarity, orbited by small badges for the event/bet + weather
 * + ⚔/🔥 stakes, and wrapped as a thumb-sized TAP TARGET that opens its info sheet. Boss worlds wear a
 * pulsing red aura; harder paths a warm heat shimmer (GS-journey-alive).
 */
function worldPlanet(cx: number, cy: number, c: StarmapChoice): string {
  const ring = rarCol(c.rarity);
  const look = (c.archetype && BIOME_LOOK[c.archetype]) || { col: '#8aa0c0', glyph: c.icon, family: 'plain' as SurfaceFamily };
  const r = 21;
  const gid = `jw${c.id}`; // unique gradient + clip ids per world
  const light = lighten(look.col, 0.6);
  const dark = darken(look.col, 0.5);

  // Boss = an ominous, slowly-breathing red aura. Elite/harder = a warm heat shimmer. Both sit OUTSIDE
  // the atmosphere so the stakes read before the biome does.
  const boss = c.bossAhead
    ? `<circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="none" stroke="#ff4a3a" stroke-width="2.4" opacity="0.55">
         <animate attributeName="r" values="${r + 7};${r + 14};${r + 7}" dur="1.8s" repeatCount="indefinite"/>
         <animate attributeName="opacity" values="0.6;0.12;0.6" dur="1.8s" repeatCount="indefinite"/></circle>
       <circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="#ff4a3a" opacity="0.06"/>`
    : '';
  const heat =
    c.elite && !c.bossAhead
      ? `<circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="none" stroke="#ffb04a" stroke-width="1.6" opacity="0.4">
           <animate attributeName="opacity" values="0.5;0.12;0.5" dur="1.4s" repeatCount="indefinite"/></circle>`
      : '';

  const markers: string[] = [];
  if (c.bossAhead) markers.push('⚔');
  if (c.elite) markers.push('🔥');
  const markerRow = markers.length
    ? `<text x="${cx + r - 1}" y="${cy - r + 7}" font-size="12" text-anchor="middle">${markers.join('')}
         <animate attributeName="opacity" values="1;0.55;1" dur="1.3s" repeatCount="indefinite"/></text>`
    : '';
  // The atmospheric effect badge (GS-journey-fx) — a small glyph low-left so the lane previews the
  // weather/lighting you'll play in, alongside the biome (world body) and stakes (ring/markers).
  const effectBadge = c.effectIcon
    ? `<circle cx="${cx - r + 4}" cy="${cy + r - 4}" r="7.5" fill="#0c1020" stroke="${ring}" stroke-width="1"/>
       <text x="${cx - r + 4}" y="${cy + r - 0.5}" font-size="10" text-anchor="middle">${c.effectIcon}</text>`
    : '';
  const name = c.worldName ? (c.worldName.length > 15 ? `${c.worldName.slice(0, 14)}…` : c.worldName) : '';
  const nameLabel = name ? `<text x="${cx}" y="${cy + r + 16}" font-size="10" fill="#eaf0ff" text-anchor="middle" font-weight="700">${esc(name)}</text>` : '';
  const jumpLabel = `<text x="${cx}" y="${cy + r + (name ? 28 : 16)}" font-size="8.5" fill="${ring}" text-anchor="middle">+${c.distanceJump} jump ›</text>`;

  return `
    <g data-route-inspect="${c.id}" role="button" tabindex="0" aria-label="${esc(c.worldName ?? c.label)} — view jump" style="cursor:pointer;">
      <defs>
        <radialGradient id="${gid}" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stop-color="${light}"/>
          <stop offset="52%" stop-color="${look.col}"/>
          <stop offset="100%" stop-color="${dark}"/>
        </radialGradient>
        <clipPath id="${gid}c"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="transparent" pointer-events="all"/>
      ${boss}${heat}
      <!-- a soft "tap me" portal pulse in the rarity colour -->
      <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="${ring}" stroke-width="1.3" opacity="0.5">
        <animate attributeName="r" values="${r + 3};${r + 8};${r + 3}" dur="2.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0.05;0.5" dur="2.6s" repeatCount="indefinite"/></circle>
      <!-- atmosphere rim glow (biome-coloured haze around the sphere) -->
      <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${look.col}" opacity="0.12"/>
      <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="${look.col}" opacity="0.16"/>
      <!-- the lit sphere: gradient body + biome surface + terminator + specular glint -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gid})"/>
      <g clip-path="url(#${gid}c)">
        ${surfaceArt(look.family, cx, cy, r, look.col)}
        <ellipse cx="${(cx + r * 0.62).toFixed(1)}" cy="${(cy + r * 0.32).toFixed(1)}" rx="${r}" ry="${r}" fill="#05070f" opacity="0.34"/>
        <ellipse cx="${(cx - r * 0.4).toFixed(1)}" cy="${(cy - r * 0.46).toFixed(1)}" rx="${(r * 0.34).toFixed(1)}" ry="${(r * 0.22).toFixed(1)}" fill="#ffffff" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.28;0.5" dur="3.4s" repeatCount="indefinite"/></ellipse>
      </g>
      <!-- rarity ring -->
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring}" stroke-width="2.4"/>
      <!-- a soft dark vignette keeps the biome glyph legible over any surface -->
      <circle cx="${cx}" cy="${cy}" r="11" fill="#0a0e18" opacity="0.24"/>
      <text x="${cx}" y="${cy + 6}" font-size="18" text-anchor="middle">${look.glyph}</text>
      ${markerRow}
      ${effectBadge}
      ${nameLabel}
      ${jumpLabel}
    </g>`;
}

/**
 * The whole journey widget as an HTML string: one responsive, vertical star-chart (Earth at the bottom,
 * three tappable destination worlds at the top) plus a "you're here" caption. Returns markup (not a
 * bare <svg>) — embed it directly. Byte-stable for a given input.
 */
export function journeyMapHTML(opts: StarmapOpts): string {
  const choices = opts.choices.slice(0, 3);
  const n = Math.max(1, choices.length);
  const rnd = mulberry32(hashSeed(opts.seed));

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
      // Each cleared world wears its biome glyph (GS-journey-history) with a gentle twinkle + a
      // biome-coloured glow, so the trail reads as the actual worlds you've crossed. A glyph-less stop
      // falls back to a plain visited dot (kept byte-identical for the journey-map test).
      const face = nd.glyph
        ? `<circle cx="${cx}" cy="${cy}" r="13" fill="${ring}" opacity="0.12"><animate attributeName="opacity" values="0.12;0.22;0.12" dur="${(3 + (k % 3) * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>
           <circle cx="${cx}" cy="${cy}" r="11" fill="${ring}" opacity="0.16"/>
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
      <defs>
        <radialGradient id="jearth" cx="36%" cy="30%" r="78%">
          <stop offset="0%" stop-color="#5aa0e6"/>
          <stop offset="55%" stop-color="#1f4f9e"/>
          <stop offset="100%" stop-color="#0c1f45"/>
        </radialGradient>
        <clipPath id="jearthc"><circle cx="${earth.x}" cy="${earth.y}" r="19"/></clipPath>
      </defs>
      <circle cx="${earth.x}" cy="${earth.y}" r="27" fill="#3f8fff" opacity="0.1"/>
      <circle cx="${earth.x}" cy="${earth.y}" r="22" fill="#3f8fff" opacity="0.14"/>
      <circle cx="${earth.x}" cy="${earth.y}" r="19" fill="url(#jearth)" stroke="#3f7fd0" stroke-width="1.4"/>
      <g clip-path="url(#jearthc)">
        <path d="M${earth.x - 13},${earth.y - 6} q7,-4 13,1 q5,4 12,1 M${earth.x - 15},${earth.y + 6} q8,3 14,-1 q6,-3 13,1" stroke="#4fbf6a" stroke-width="3.2" fill="none" stroke-linecap="round" opacity="0.9"/>
        <ellipse cx="${(earth.x + 7).toFixed(1)}" cy="${(earth.y + 4).toFixed(1)}" rx="19" ry="19" fill="#05070f" opacity="0.28"/>
      </g>
      <ellipse cx="${(earth.x - 6).toFixed(1)}" cy="${(earth.y - 7).toFixed(1)}" rx="6" ry="4" fill="#ffffff" opacity="0.4"/>
      <text x="${earth.x}" y="${earth.y + 36}" font-size="10.5" fill="#9fb0cf" text-anchor="middle" font-weight="700">EARTH · home</text>
    </g>`;

  // ---- forward lanes: YOU → the three destination worlds across the top ----------------------
  const bx = (i: number) => (n === 1 ? YOU_X : X_L + 6 + ((X_R - X_L - 12) * i) / (n - 1));
  const fbranch = choices
    .map((c, i) => {
      const px = bx(i);
      const col = rarCol(c.rarity);
      const path = `M${YOU_X},${YOU_Y} C ${YOU_X},${(YOU_Y + CHOICE_Y) / 2} ${px},${(YOU_Y + CHOICE_Y) / 2} ${px},${CHOICE_Y}`;
      const hot = c.elite || c.bossAhead;
      const glow = hot ? `<path d="${path}" fill="none" stroke="${col}" stroke-width="6" opacity="0.16"/>` : '';
      // Energy pulses stream UP the corridor toward the gate — bigger/brighter for a boss/harder lane.
      const pulseR = hot ? 3 : 2.1;
      const pulse = `<circle r="${pulseR}" fill="${col}" opacity="0.9"><animate attributeName="opacity" values="0;0.95;0" dur="${(2.2 - i * 0.2).toFixed(1)}s" repeatCount="indefinite"/><animateMotion dur="${(2.2 - i * 0.2).toFixed(1)}s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="${path}"/></circle>`;
      return {
        line: `${glow}<path d="${path}" fill="none" stroke="${col}" stroke-width="1.9" stroke-dasharray="2 4" opacity="0.85"><animate attributeName="stroke-dashoffset" values="12;0" dur="1.1s" repeatCount="indefinite"/></path>${pulse}`,
        planet: worldPlanet(px, CHOICE_Y, c),
      };
    })
    .reduce((acc, b) => ({ lines: acc.lines + b.line, planets: acc.planets + b.planet }), { lines: '', planets: '' });

  // ---- YOU: the ship poised on a glowing launch pad, ready to jump ----------------------------
  const launchPad = `
    <ellipse cx="${YOU_X}" cy="${YOU_Y + 16}" rx="26" ry="7" fill="#ffce54" opacity="0.14"/>
    <ellipse cx="${YOU_X}" cy="${YOU_Y + 16}" rx="17" ry="4.5" fill="none" stroke="#ffce54" stroke-width="1.3" opacity="0.55">
      <animate attributeName="rx" values="12;22;12" dur="2.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.55;0.08;0.55" dur="2.4s" repeatCount="indefinite"/></ellipse>
    <path d="M${YOU_X - 5},${YOU_Y + 10} L${YOU_X},${YOU_Y + 21} L${YOU_X + 5},${YOU_Y + 10} Z" fill="#ff9a3c" opacity="0.75">
      <animate attributeName="opacity" values="0.75;0.3;0.75" dur="0.5s" repeatCount="indefinite"/></path>`;
  // Two ascending sparks give the pad a "warming up" shimmer (seeded x offsets → byte-stable).
  const sparks = [0, 1]
    .map((k) => {
      const sx = (YOU_X + (rnd() - 0.5) * 26).toFixed(1);
      const dur = (2.6 + rnd() * 1.2).toFixed(1);
      const beg = (k * 1.3).toFixed(1);
      return `<circle cx="${sx}" cy="${YOU_Y + 14}" r="1.3" fill="#ffe08a" opacity="0">
        <animate attributeName="cy" values="${YOU_Y + 14};${YOU_Y - 18}" dur="${dur}s" begin="${beg}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;0.9;0" dur="${dur}s" begin="${beg}s" repeatCount="indefinite"/></circle>`;
    })
    .join('');

  const youLabel = `
    <text x="${YOU_X}" y="${YOU_Y - 24}" font-size="11" fill="#ffce54" text-anchor="middle" font-weight="800" letter-spacing="1.5">YOU</text>
    <text x="${YOU_X}" y="${YOU_Y + 34}" font-size="8.5" fill="#9aa7c2" text-anchor="middle">${esc(opts.currentLabel)} · dist ${opts.distanceFromStart}</text>`;

  // ---- the living sky: seeded twinkles + a couple of shooting stars behind everything ---------
  const twinkles = Array.from({ length: 14 }, () => {
    const tx = (rnd() * W).toFixed(1);
    const ty = (18 + rnd() * (H - 36)).toFixed(1);
    const rr = (0.6 + rnd() * 1.1).toFixed(1);
    const dur = (2.2 + rnd() * 3).toFixed(1);
    const beg = (rnd() * 3).toFixed(1);
    return `<circle cx="${tx}" cy="${ty}" r="${rr}" fill="#dfe7ff"><animate attributeName="opacity" values="0.25;0.95;0.25" dur="${dur}s" begin="${beg}s" repeatCount="indefinite"/></circle>`;
  }).join('');
  // Occasional streaks: mostly invisible, flaring across a short diagonal on a long cycle (keyTimes keep
  // them rare so the sky feels calm, then a shooting star catches your eye).
  const shooters = [0, 1]
    .map((k) => {
      const sx = (rnd() * (W - 80)).toFixed(1);
      const sy = (24 + rnd() * (H * 0.5)).toFixed(1);
      const cyc = (7 + k * 4 + rnd() * 3).toFixed(1);
      const beg = (1.5 + k * 3 + rnd() * 2).toFixed(1);
      return `<g opacity="0"><line x1="${sx}" y1="${sy}" x2="${(Number(sx) - 15).toFixed(1)}" y2="${(Number(sy) - 6).toFixed(1)}" stroke="#cfe0ff" stroke-width="1.6" stroke-linecap="round"/>
        <animate attributeName="opacity" values="0;0;0.85;0" keyTimes="0;0.86;0.93;1" dur="${cyc}s" begin="${beg}s" repeatCount="indefinite"/>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 0;60 26;60 26" keyTimes="0;0.86;0.98;1" dur="${cyc}s" begin="${beg}s" repeatCount="indefinite"/></g>`;
    })
    .join('');

  // Trail glow underlay + a comet that periodically flies the travelled path from Earth up to YOU, so
  // the journey behind you feels earned (only drawn when there's a trail to fly).
  const trailGlow = `<path d="${trailPath}" fill="none" stroke="#6fd0d8" stroke-width="4.5" opacity="0.08" stroke-linecap="round"/>`;
  const comet = nodes.length
    ? `<circle r="2.6" fill="#eafcff" opacity="0"><animate attributeName="opacity" values="0;0.9;0.9;0" keyTimes="0;0.1;0.85;1" dur="6s" repeatCount="indefinite"/><animateMotion dur="6s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="${trailPath}"/></circle>`
    : '';

  // ONE responsive SVG scaled to the container width (width:100%, height set by the viewBox aspect); the
  // page scrolls when a long voyage makes it tall. The starfield/nebula is a CONTINUOUS CSS background on
  // `.gs-journey`; the SVG layers its own twinkles/shooting stars over it.
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Journey map — Earth at the bottom, your route choices at the top" style="display:block;width:100%;height:auto;" data-journey-svg>
    ${twinkles}
    ${shooters}
    ${trailGlow}
    <path d="${trailPath}" fill="none" stroke="#7f8db0" stroke-width="1.7" stroke-dasharray="1 4" opacity="0.7"/>
    ${comet}
    ${fbranch.lines}
    ${dots}
    ${earthGlyph}
    ${launchPad}
    ${sparks}
    ${shipSVG(opts.shipId, YOU_X, YOU_Y, 0.9)}
    ${youLabel}
    ${fbranch.planets}
  </svg>`;

  return `<div class="gs-journey gs-journey--v">${svg}</div>
  <div class="gs-journey-here">📍 You're at <b>${esc(opts.currentLabel)}</b> · dist ${opts.distanceFromStart} · tap a world up top to choose your jump</div>`;
}
