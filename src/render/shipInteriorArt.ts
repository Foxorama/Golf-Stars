/**
 * SHIP INTERIOR backdrops (GS-story-ship-interior + GS-ship-interior-variety + GS-ship-interior-2) — the
 * illustrated rooms you walk through inside your ship on a long trip: BRIDGE (the helm), LOUNGE (a rec
 * room), WEAPONS bay, ENGINE bay (the reactor), and the LOCKER room. Each is an SVG scene (viewBox
 * 0 0 400 300).
 *
 * GS-ship-interior-variety: an interior is no longer ONE shared layout recoloured — each ship FAMILY gets a
 * genuinely different cabin. `cabinStyleOf(look.kind)` folds the hull kinds into CABIN STYLES — `auto`
 * (wheeled road-trip cabins), `disc` (alien saucers), `steed` (the living winged Pegasus), `bike` (open
 * single-rider frames), `freighter` (industrial haulers) and `aurora` (the luxury star-yacht) — and each
 * style draws its OWN shell + its own take on all five rooms.
 *
 * GS-ship-interior-2 (the quality pass):
 *  • Z-ORDER RULE — a shell's `open` paints the WHOLE room box (walls AND floor); `close` is only a thin
 *    foreground vignette. The first cut painted the floor in `close`, AFTER the props, which buried half
 *    of every scene under the deck (the "empty green dome" bug) — never move the floor back into `close`.
 *  • Set dressing fills the frame: every room has a large focal set piece on the floor line, contact
 *    shadows, dark outline contrast against the tinted walls, and a light source that exists in the scene.
 *  • Per-SHIP cabin overrides (`SHIP_CABIN_OVERRIDE`): the two route-reward hulls reuse base ship kinds
 *    (the Coil Wyrm-Ship flies a `racer` hull, the Radiant Warden Cruiser a `shuttle`), so by kind alone
 *    the herald serpent got a station-wagon cabin. They now carry bespoke styles — `wyrm` (a grown,
 *    ribbed serpent-gut interior lit by venom-light) and `radiant` (a white-gold celestial cathedral).
 *
 * Every scene is tinted to the flown ship's palette (`shipInteriorTheme` reads hull/accent/flame/glass off
 * `ShipLook`), so the woody wagon and the infernal Firebird are distinct WITHIN the auto style too.
 * Hand-placed, byte-stable (no rng), own per-theme/room `si-*` gradient ids. Pure render.
 */

import { shipById, DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import type { ShipRoom } from '../ui/gameState';

export interface ShipTheme {
  kind: string;
  /** The resolved cabin style this ship's rooms draw in (per-ship override, else folded from kind). */
  style: CabinStyle;
  /** Dark hull (back wall). */
  hull: string;
  /** Mid panel (floor / consoles). */
  panel: string;
  /** Trim / edge lines. */
  trim: string;
  /** Energy / glow (reactor, screens, engine). */
  energy: string;
  /** Viewport glass tint. */
  glass: string;
}

/** The interior archetypes a ship's rooms are drawn in — folded from the hull `kind` (or a per-ship override). */
export type CabinStyle = 'auto' | 'disc' | 'steed' | 'bike' | 'freighter' | 'aurora' | 'wyrm' | 'radiant';

const ALL_CABINS: readonly CabinStyle[] = ['auto', 'disc', 'steed', 'bike', 'freighter', 'aurora', 'wyrm', 'radiant'];

/** Fold a hull `kind` into its cabin style. A new ship kind picks up a fitting interior for free. */
export function cabinStyleOf(kind: string): CabinStyle {
  switch (kind) {
    case 'saucer':
    case 'ufo':
      return 'disc';
    case 'pegasus':
      return 'steed';
    // GS-startour-serpent-trophy: the world-serpent hull is a LIVING vessel — the same wyrm cabin the
    // Coil's grown serpent-ship already uses (ribbed gullet, organic panelling), which is exactly what
    // the inside of a serpent should look like. A new cabin style would be a second description of it.
    case 'serpent':
      return 'wyrm';
    case 'moto':
    case 'chopper':
      return 'bike';
    case 'shuttle':
      return 'freighter';
    case 'infinity':
      return 'aurora';
    case 'wagon':
    case 'racer':
    case 'comet':
    case 'firebird':
    default:
      return 'auto';
  }
}

/** GS-ship-interior-2: per-SHIP-ID cabin overrides — for hulls that reuse a base kind but are a different
 *  vessel entirely (the route-reward ships). A new bespoke interior is a row here + a style block below. */
export const SHIP_CABIN_OVERRIDE: Record<string, CabinStyle> = {
  'wyrm-ship': 'wyrm', // the Coil's grown serpent-hull (herald path) — flies a racer kind
  'warden-cruiser': 'radiant', // the Radiant Warden Cruiser (warden path) — flies a shuttle kind
};

/** The cabin style a specific ship draws — the per-ship override wins, else the kind fold. */
export function cabinStyleForShip(shipId: string | undefined, kind: string): CabinStyle {
  return (shipId && SHIP_CABIN_OVERRIDE[shipId]) || cabinStyleOf(kind);
}

/** Mix a #rrggbb hex toward black by `k` (0 = unchanged, 1 = black). */
function darken(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - k));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - k));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - k));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Mix a #rrggbb hex toward white by `k` (0 = unchanged, 1 = white). */
function lighten(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const mix = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) + (255 - parseInt(h.slice(i, i + 2), 16)) * k);
  return `#${[mix(0), mix(2), mix(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Derive the interior palette from the flown ship's cosmetic look — so each ship's rooms feel distinct. */
export function shipInteriorTheme(shipId: string | undefined): ShipTheme {
  const ship = shipById(shipId ?? '') ?? shipById(DEFAULT_SHIP_ID)!;
  const look = ship.look;
  return {
    kind: look.kind,
    style: cabinStyleForShip(ship.id, look.kind),
    hull: darken(look.body, 0.66),
    panel: darken(look.body, 0.42),
    trim: look.accent,
    energy: look.flame,
    glass: look.glass,
  };
}

/** A starfield strip (for viewports) — fixed positions, byte-stable. */
function stars(x: number, y: number, w: number, h: number, n = 14): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const px = x + ((i * 61) % w);
    const py = y + ((i * 37) % h);
    const r = 0.5 + ((i * 13) % 3) * 0.4;
    s += `<circle cx="${px}" cy="${py}" r="${r}" fill="#dfeaff" opacity="${0.4 + ((i * 7) % 5) * 0.12}"/>`;
  }
  return s;
}

/** A soft elliptical contact shadow under a set piece — grounds props on the floor. */
function sh(x: number, y: number, rx: number, ry = Math.max(3, Math.round(rx * 0.22))): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#000" opacity="0.32"/>`;
}

/** The thin foreground vignette every shell's `close` uses — NEVER a floor fill (the buried-props bug). */
function vignette(tint = '#000'): string {
  return `<path d="M0 300 L0 278 Q200 298 400 278 L400 300 Z" fill="${tint}" opacity="0.4"/>
    <rect width="400" height="300" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="6"/>`;
}

/** A short, stable id-safe token from the theme + room so co-mounted SVGs never share gradient ids (per
 *  the document-global-id gotcha) — and the preview harness renders every ship's true wall tint. */
function themeUid(t: ShipTheme, salt = ''): string {
  let h = 2166136261;
  for (const s of [t.hull, t.panel, t.trim, t.energy, t.kind, t.style, salt]) for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return (h >>> 0).toString(36);
}

/** SVG wrapper open/close — shared frame; the body is style-specific. */
function svg(inner: string): string {
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="position:absolute;inset:0;">${inner}</svg>`;
}

/* ═══════════════════════════ AUTO — the wheeled road-trip cabin ═══════════════════════════ */

function autoShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const chrome = lighten(t.trim, 0.35);
  return {
    open: `<defs>
        <linearGradient id="si-wall-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.1)}"/><stop offset="100%" stop-color="${t.hull}"/></linearGradient>
        <linearGradient id="si-floor-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${darken(t.hull, 0.18)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.42)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="212" fill="url(#si-wall-${u})"/>
      <!-- headliner strip + dome light -->
      <rect x="0" y="0" width="400" height="24" fill="${darken(t.hull, 0.22)}"/><line x1="0" y1="24" x2="400" y2="24" stroke="${chrome}" stroke-width="1.6" opacity="0.6"/>
      <rect x="178" y="6" width="44" height="12" rx="6" fill="${lighten(t.glass, 0.2)}" opacity="0.9"/><rect x="178" y="6" width="44" height="12" rx="6" fill="none" stroke="${chrome}" stroke-width="1.2"/>
      <ellipse cx="200" cy="30" rx="70" ry="22" fill="${lighten(t.glass, 0.25)}" opacity="0.1"/>
      <!-- quilted door panels down each side, with armrests + chrome handles -->
      ${([[6, 0], [368, 1]] as [number, number][]).map(([x, m]) => `<rect x="${x}" y="30" width="26" height="170" rx="7" fill="${darken(t.panel, 0.18)}" stroke="${chrome}" stroke-width="1" opacity="0.9"/>
        ${[0, 1, 2].map((i) => `<line x1="${x}" y1="${62 + i * 44}" x2="${x + 26}" y2="${62 + i * 44}" stroke="#0005" stroke-width="1.4"/>`).join('')}
        <rect x="${x + (m ? -4 : 4)}" y="118" width="26" height="12" rx="6" fill="${darken(t.panel, 0.06)}" stroke="${chrome}" stroke-width="1"/>
        <rect x="${x + 6}" y="96" width="14" height="5" rx="2.5" fill="${chrome}"/>`).join('')}
      <!-- carpeted floor + stitched mats + transmission tunnel (background — props draw over) -->
      <rect x="0" y="212" width="400" height="88" fill="url(#si-floor-${u})"/>
      <line x1="0" y1="212" x2="400" y2="212" stroke="${chrome}" stroke-width="1.6" opacity="0.55"/>
      ${[0, 1, 2, 3].map((i) => `<line x1="0" y1="${230 + i * 18}" x2="400" y2="${230 + i * 18}" stroke="#ffffff" stroke-width="1" opacity="0.04"/>`).join('')}
      <path d="M176 212 L224 212 L240 300 L160 300 Z" fill="${darken(t.hull, 0.12)}" stroke="${chrome}" stroke-width="1" opacity="0.7"/>
      ${([[92, 250], [308, 250]] as [number, number][]).map(([x, y]) => `<rect x="${x - 34}" y="${y - 12}" width="68" height="30" rx="6" fill="#000" opacity="0.22"/><rect x="${x - 34}" y="${y - 12}" width="68" height="30" rx="6" fill="none" stroke="${chrome}" stroke-width="1" opacity="0.35"/>${[0, 1, 2].map((i) => `<line x1="${x - 26}" y1="${y - 4 + i * 7}" x2="${x + 26}" y2="${y - 4 + i * 7}" stroke="#fff" stroke-width="1" opacity="0.05"/>`).join('')}`).join('')}`,
    close: vignette(darken(t.hull, 0.5)),
  };
}

function autoRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'auto' + room);
  const chrome = lighten(t.trim, 0.35);
  const glow = lighten(t.energy, 0.15);
  switch (room) {
    case 'bridge': {
      const g = `<linearGradient id="si-dash-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.02)}"/><stop offset="100%" stop-color="${darken(t.panel, 0.3)}"/></linearGradient>`;
      const s = autoShell(t, u, g);
      return svg(`${s.open}
        <!-- wraparound windshield onto space -->
        <path d="M34 34 Q200 22 366 34 L358 128 Q200 118 42 128 Z" fill="#060a18"/>
        <path d="M40 39 Q200 28 360 39 L353 122 Q200 113 47 122 Z" fill="#0a1230"/>
        ${stars(54, 42, 292, 74, 40)}<ellipse cx="120" cy="76" rx="56" ry="26" fill="${t.energy}" opacity="0.13"/><circle cx="298" cy="62" r="12" fill="${t.glass}" opacity="0.5"/><circle cx="294" cy="58" r="4" fill="#fff" opacity="0.6"/>
        <path d="M34 34 Q200 22 366 34 L358 128 Q200 118 42 128 Z" fill="none" stroke="${chrome}" stroke-width="3.5"/>
        <line x1="200" y1="26" x2="200" y2="122" stroke="${darken(t.hull, 0.15)}" stroke-width="5"/>
        <!-- rear-view mirror + fuzzy dice -->
        <rect x="182" y="30" width="36" height="11" rx="3" fill="${darken(t.panel, 0.15)}" stroke="${chrome}" stroke-width="1.2"/>
        <line x1="207" y1="41" x2="209" y2="58" stroke="${t.trim}" stroke-width="1.6"/>
        <rect x="202" y="58" width="9" height="9" rx="2" transform="rotate(40 206.5 62.5)" fill="${t.energy}"/><rect x="210" y="61" width="8" height="8" rx="2" transform="rotate(52 214 65)" fill="${lighten(t.energy, 0.25)}"/>
        <circle cx="205" cy="62" r="0.9" fill="#0008"/><circle cx="213" cy="65" r="0.9" fill="#0008"/>
        <!-- padded dashboard with cowl, six deep-set dials, radio + vents -->
        <path d="M14 148 Q200 126 386 148 L386 212 L14 212 Z" fill="url(#si-dash-${u})" stroke="${chrome}" stroke-width="1.6"/>
        <path d="M14 148 Q200 126 386 148 L386 156 Q200 134 14 156 Z" fill="#000" opacity="0.25"/>
        ${[74, 116, 158].map((x, i) => `<circle cx="${x}" cy="178" r="15" fill="#0b0f18" stroke="${chrome}" stroke-width="1.6"/><circle cx="${x}" cy="178" r="11" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.8"/>${[210, 250, 290, 330].map((d) => `<line x1="${(x + Math.cos((d * Math.PI) / 180) * 8).toFixed(1)}" y1="${(178 - Math.sin((d * Math.PI) / 180) * 8).toFixed(1)}" x2="${(x + Math.cos((d * Math.PI) / 180) * 11).toFixed(1)}" y2="${(178 - Math.sin((d * Math.PI) / 180) * 11).toFixed(1)}" stroke="${glow}" stroke-width="1" opacity="0.6"/>`).join('')}<line x1="${x}" y1="178" x2="${x + (i % 2 ? 6 : -5)}" y2="${170 + i}" stroke="${lighten(t.energy, 0.3)}" stroke-width="1.8"/><circle cx="${x}" cy="178" r="2" fill="${chrome}"/>`).join('')}
        ${[242, 284, 326].map((x, i) => `<circle cx="${x}" cy="178" r="15" fill="#0b0f18" stroke="${chrome}" stroke-width="1.6"/><circle cx="${x}" cy="178" r="11" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.8"/><line x1="${x}" y1="178" x2="${x + (i % 2 ? -6 : 5)}" y2="${169 + i * 2}" stroke="${lighten(t.energy, 0.3)}" stroke-width="1.8"/><circle cx="${x}" cy="178" r="2" fill="${chrome}"/>`).join('')}
        <!-- radio with glowing tuner -->
        <rect x="182" y="164" width="36" height="26" rx="4" fill="#0b0f18" stroke="${chrome}" stroke-width="1.4"/>
        <rect x="187" y="169" width="26" height="7" rx="2" fill="${t.energy}" opacity="0.8"/><line x1="199" y1="169" x2="199" y2="176" stroke="#fff" stroke-width="1.4"/>
        ${[190, 199, 208].map((x) => `<circle cx="${x}" cy="184" r="2.4" fill="${chrome}"/>`).join('')}
        <!-- steering yoke on a column, wide and low -->
        ${sh(200, 262, 46, 8)}
        <path d="M200 212 L200 244" stroke="${darken(t.panel, 0.3)}" stroke-width="10"/>
        <g transform="translate(200 246)"><circle r="30" fill="none" stroke="#0b0f18" stroke-width="10"/><circle r="30" fill="none" stroke="${chrome}" stroke-width="3.5"/><circle r="8" fill="${darken(t.panel, 0.12)}" stroke="${chrome}" stroke-width="1.6"/><circle r="3" fill="${glow}"/><line x1="-29" y1="-6" x2="-8" y2="-2" stroke="${chrome}" stroke-width="3.5"/><line x1="29" y1="-6" x2="8" y2="-2" stroke="${chrome}" stroke-width="3.5"/><line x1="0" y1="8" x2="0" y2="29" stroke="${chrome}" stroke-width="3.5"/></g>
        <!-- column shifter + parking brake -->
        <g transform="translate(258 232)"><line x1="0" y1="0" x2="18" y2="-14" stroke="${chrome}" stroke-width="3"/><circle cx="20" cy="-16" r="5" fill="${t.trim}" stroke="#0007" stroke-width="1"/></g>
        ${s.close}`);
    }
    case 'lounge': {
      const s = autoShell(t, u);
      return svg(`${s.open}
        <!-- rear quarter-window + a pinned road-trip star map -->
        <circle cx="322" cy="78" r="38" fill="#060a18"/><circle cx="322" cy="78" r="33" fill="#0a1230"/>${stars(294, 52, 58, 52, 12)}<circle cx="306" cy="66" r="7" fill="${t.glass}" opacity="0.5"/><circle cx="322" cy="78" r="38" fill="none" stroke="${chrome}" stroke-width="3.5"/><path d="M294 58 A 36 36 0 0 1 318 44" fill="none" stroke="#fff" stroke-width="2" opacity="0.25"/>
        <g transform="translate(46 42)"><rect x="-3" y="-3" width="104" height="76" rx="4" fill="${darken(t.hull, 0.25)}"/><rect width="98" height="70" rx="3" fill="${lighten(t.panel, 0.18)}" stroke="${chrome}" stroke-width="1.4"/>
          <path d="M10 58 Q34 22 54 38 T88 14" fill="none" stroke="${t.energy}" stroke-width="1.8" stroke-dasharray="4 3"/>${([[12, 54], [54, 36], [86, 14]] as [number, number][]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${t.trim}" stroke="#0006" stroke-width="1"/>`).join('')}
          <circle cx="30" cy="16" r="5" fill="${t.energy}" opacity="0.6"/><text x="49" y="66" text-anchor="middle" font-size="7" font-weight="700" fill="${darken(t.hull, 0.3)}">GALAXY ROUTE 66</text></g>
        <!-- deep diner-tuck bench seat, the room's hero -->
        ${sh(150, 276, 120, 12)}
        <g transform="translate(30 138)">
          <rect x="0" y="0" width="240" height="56" rx="14" fill="${darken(t.trim, 0.28)}"/>
          <rect x="0" y="0" width="240" height="18" rx="9" fill="${darken(t.trim, 0.14)}"/>
          ${[40, 100, 160, 220].map((x) => `<path d="M${x} 4 L${x} 52" stroke="#0006" stroke-width="2"/>`).join('')}
          <rect x="-6" y="48" width="252" height="46" rx="14" fill="${t.trim}"/>
          <rect x="-6" y="48" width="252" height="14" rx="7" fill="${lighten(t.trim, 0.18)}" opacity="0.8"/>
          ${[40, 100, 160, 220].map((x) => `<path d="M${x} 52 L${x} 92" stroke="#0005" stroke-width="2"/>`).join('')}
        </g>
        <!-- cushions + a thermos on the seat -->
        <g transform="translate(70 172)"><rect x="-16" y="-12" width="32" height="24" rx="6" transform="rotate(-8)" fill="${t.energy}" opacity="0.85"/><rect x="-16" y="-12" width="32" height="24" rx="6" transform="rotate(-8)" fill="none" stroke="#0006" stroke-width="1.2"/></g>
        <g transform="translate(226 168)"><rect x="-8" y="-26" width="16" height="30" rx="5" fill="${lighten(t.panel, 0.2)}" stroke="#0007" stroke-width="1.2"/><rect x="-8" y="-26" width="16" height="9" rx="4" fill="${glow}"/></g>
        <!-- snack cooler with open lid + bottles -->
        ${sh(330, 262, 40, 8)}
        <g transform="translate(330 224)"><rect x="-32" y="-4" width="64" height="42" rx="6" fill="${darken(t.panel, 0.02)}" stroke="${chrome}" stroke-width="1.4"/><rect x="-32" y="-4" width="64" height="10" rx="5" fill="${lighten(t.panel, 0.16)}"/><rect x="-34" y="-18" width="68" height="12" rx="5" fill="${lighten(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1.2" transform="rotate(-14 -34 -18)"/>
          ${[-16, -2, 12].map((x, i) => `<rect x="${x}" y="-16" width="8" height="16" rx="3" fill="${i % 2 ? glow : t.energy}" opacity="0.9"/><rect x="${x + 1.5}" y="-20" width="5" height="5" rx="1.5" fill="${chrome}"/>`).join('')}
          <text x="0" y="26" text-anchor="middle" font-size="10" font-weight="800" fill="${glow}">SNACKS</text></g>
        <!-- hanging tree air-freshener -->
        <g transform="translate(184 26)"><line x1="0" y1="0" x2="0" y2="22" stroke="${chrome}" stroke-width="1.2"/><path d="M0 22 l-10 24 l20 0 Z" fill="${glow}" opacity="0.95"/><path d="M0 30 l-6 12 l12 0 Z" fill="${lighten(t.energy, 0.4)}" opacity="0.8"/><rect x="-2" y="46" width="4" height="4" fill="${darken(t.trim, 0.2)}"/></g>
        ${s.close}`);
    }
    case 'weapons': {
      const s = autoShell(t, u);
      return svg(`${s.open}
        <!-- the trunk thrown open into a lit armory rack -->
        <path d="M30 32 L370 32 L346 62 L54 62 Z" fill="${darken(t.hull, 0.12)}" stroke="${chrome}" stroke-width="1.6"/>
        <line x1="200" y1="32" x2="200" y2="14" stroke="${chrome}" stroke-width="3"/><circle cx="200" cy="12" r="3" fill="${glow}"/>
        <rect x="44" y="62" width="312" height="128" rx="10" fill="${darken(t.hull, 0.3)}" stroke="${chrome}" stroke-width="1.8"/>
        <rect x="52" y="70" width="296" height="112" rx="7" fill="#0b0f18" opacity="0.5"/>
        <ellipse cx="200" cy="72" rx="150" ry="16" fill="${glow}" opacity="0.1"/>
        <!-- hazard-striped sill -->
        ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${52 + i * 38}" y="184" width="19" height="7" fill="${t.energy}" opacity="0.55" transform="skewX(-24)"/>`).join('')}
        <!-- four racked blasters, each with sight-glow + charge cells -->
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(${92 + i * 72} 84)">
          <rect x="-8" y="-4" width="16" height="98" rx="4" fill="${darken(t.panel, 0.14)}" stroke="${chrome}" stroke-width="1.2"/>
          <rect x="-19" y="4" width="38" height="15" rx="4" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/>
          <rect x="10" y="7" width="30" height="8" rx="3" fill="${darken(t.panel, 0.06)}" stroke="${chrome}" stroke-width="1"/><circle cx="42" cy="11" r="3.4" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(1.6 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>
          <rect x="-14" y="19" width="12" height="18" rx="3" fill="${darken(t.trim, 0.25)}"/>
          ${[0, 1].map((c) => `<rect x="${-5 + c * 8}" y="${44 + c * 4}" width="6" height="14" rx="2" fill="${t.energy}" opacity="0.8"/>`).join('')}
          <circle cx="0" cy="82" r="4" fill="${glow}" opacity="0.9"/>
        </g>`).join('')}
        <!-- rolling ammo chest + a trouble light hooked on the lid -->
        ${sh(310, 266, 44, 8)}
        <g transform="translate(310 222)"><rect x="-36" y="0" width="72" height="42" rx="6" fill="${darken(t.panel, 0.16)}" stroke="${chrome}" stroke-width="1.4"/><rect x="-36" y="0" width="72" height="12" rx="6" fill="${lighten(t.panel, 0.08)}"/><rect x="-10" y="4" width="20" height="5" rx="2.5" fill="${chrome}"/>
          ${[-26, -8, 10].map((x, i) => `<rect x="${x}" y="18" width="15" height="19" rx="2" fill="${i % 2 ? t.trim : t.energy}" opacity="0.8" stroke="#0006" stroke-width="1"/>`).join('')}
          <circle cx="-28" cy="46" r="5" fill="#0b0f18" stroke="${chrome}" stroke-width="1.4"/><circle cx="28" cy="46" r="5" fill="#0b0f18" stroke="${chrome}" stroke-width="1.4"/></g>
        <g transform="translate(84 210)"><line x1="0" y1="0" x2="0" y2="14" stroke="${darken(t.panel, 0.2)}" stroke-width="2"/><circle cx="0" cy="24" r="10" fill="${glow}" opacity="0.35"/><circle cx="0" cy="24" r="6" fill="${lighten(t.energy, 0.4)}"/><path d="M-6 18 A8 8 0 0 1 6 18" fill="none" stroke="${chrome}" stroke-width="2"/></g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-core-${u}" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s = autoShell(t, u, g);
      return svg(`${s.open}
        <!-- the hood thrown up on a prop rod -->
        <path d="M52 22 L348 22 L372 46 L28 46 Z" fill="${darken(t.hull, 0.12)}" stroke="${chrome}" stroke-width="1.6"/>
        <path d="M52 22 L348 22 L344 28 L56 28 Z" fill="${lighten(t.panel, 0.06)}" opacity="0.5"/>
        <line x1="330" y1="46" x2="352" y2="112" stroke="${chrome}" stroke-width="3"/>
        <!-- glowing V-block reactor, the room's hero -->
        ${sh(200, 236, 110, 14)}
        <g transform="translate(200 140)">
          <rect x="-110" y="-34" width="220" height="96" rx="12" fill="${darken(t.panel, 0.16)}" stroke="${chrome}" stroke-width="1.8"/>
          <rect x="-110" y="-34" width="220" height="14" rx="7" fill="${lighten(t.panel, 0.06)}" opacity="0.6"/>
          <!-- V of plasma manifold headers -->
          ${[-1, 1].map((sgn) => [0, 1, 2].map((i) => `<g transform="translate(${sgn * (34 + i * 26)} ${-40 - i * 8}) rotate(${sgn * 22})"><rect x="-10" y="-22" width="20" height="26" rx="4" fill="${darken(t.panel, 0.04)}" stroke="${chrome}" stroke-width="1.2"/><rect x="-7" y="-27" width="14" height="7" rx="3" fill="${t.energy}" opacity="0.9"/><line x1="-10" y1="-8" x2="10" y2="-8" stroke="#0005" stroke-width="1.2"/></g>`).join('')).join('')}
          <!-- the core -->
          <ellipse cx="0" cy="12" rx="52" ry="34" fill="url(#si-core-${u})"><animate attributeName="rx" values="50;56;50" dur="2.3s" repeatCount="indefinite"/></ellipse>
          <ellipse cx="0" cy="12" rx="68" ry="46" fill="none" stroke="${t.energy}" stroke-width="2.4" opacity="0.45"/>
          <ellipse cx="-14" cy="2" rx="16" ry="9" fill="#fff" opacity="0.5"/>
          ${[-84, 84].map((x) => `<rect x="${x - 7}" y="-14" width="14" height="66" rx="5" fill="${darken(t.panel, 0.06)}" stroke="${chrome}" stroke-width="1"/>${[0, 1, 2, 3].map((f) => `<line x1="${x - 7}" y1="${-6 + f * 14}" x2="${x + 7}" y2="${-6 + f * 14}" stroke="#0006" stroke-width="1.4"/>`).join('')}`).join('')}
        </g>
        <!-- jumper cables snaking to a floor battery + an oil can -->
        <path d="M110 196 Q84 224 60 234" fill="none" stroke="${darken(t.trim, 0.1)}" stroke-width="4"/><path d="M290 196 Q322 226 344 232" fill="none" stroke="${darken(t.trim, 0.1)}" stroke-width="4"/>
        ${sh(56, 262, 30, 7)}<g transform="translate(56 234)"><rect x="-24" y="0" width="48" height="26" rx="4" fill="${darken(t.panel, 0.2)}" stroke="${chrome}" stroke-width="1.4"/><rect x="-16" y="-6" width="8" height="7" rx="2" fill="${glow}"/><rect x="8" y="-6" width="8" height="7" rx="2" fill="${t.trim}"/><text x="0" y="17" text-anchor="middle" font-size="9" font-weight="800" fill="${glow}">12V</text></g>
        ${sh(346, 260, 18, 5)}<g transform="translate(346 236)"><path d="M-10 0 L10 0 L8 24 L-8 24 Z" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/><path d="M6 2 L20 -8 L22 -4 L10 6 Z" fill="${t.trim}"/><circle cx="0" cy="10" r="4" fill="${darken(t.trim, 0.3)}"/></g>
        <!-- heat shimmer glow under the block -->
        <ellipse cx="200" cy="238" rx="90" ry="10" fill="${t.energy}" opacity="0.14"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="2.3s" repeatCount="indefinite"/></ellipse>
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = autoShell(t, u);
      return svg(`${s.open}
        <!-- garage pegboard wall of golf tools -->
        <rect x="26" y="36" width="168" height="132" rx="5" fill="${darken(t.hull, 0.2)}" stroke="${chrome}" stroke-width="1.6"/>
        <rect x="32" y="42" width="156" height="120" rx="3" fill="${darken(t.hull, 0.08)}"/>
        ${([[52, 58], [92, 54], [132, 60], [168, 56], [56, 106], [100, 112], [144, 104]] as [number, number][]).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2" fill="#0007"/><g transform="translate(${x} ${y}) rotate(${(i % 3) * 6 - 6})"><line x1="0" y1="4" x2="0" y2="34" stroke="${chrome}" stroke-width="2.4"/><path d="M-7 34 L7 34 L${i % 2 ? 9 : 5} 40 L-5 40 Z" fill="${t.trim}" stroke="#0006" stroke-width="1"/></g>`).join('')}
        <rect x="40" y="140" width="140" height="14" rx="4" fill="${darken(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1"/>
        ${[54, 76, 98, 120, 142, 164].map((x, i) => `<circle cx="${x}" cy="147" r="4" fill="${i % 2 ? glow : t.energy}" opacity="0.85"/>`).join('')}
        <!-- twin tall lockers with vents + latches -->
        ${[0, 1].map((i) => `<g transform="translate(${216 + i * 62} 40)">
          <rect width="54" height="152" rx="6" fill="${darken(t.hull, 0.14)}" stroke="${chrome}" stroke-width="1.4"/>
          <rect x="7" y="10" width="40" height="6" rx="2" fill="${darken(t.panel, 0.24)}"/><rect x="7" y="20" width="40" height="6" rx="2" fill="${darken(t.panel, 0.24)}"/>
          <circle cx="45" cy="76" r="3" fill="${glow}"/><rect x="6" y="70" width="24" height="10" rx="3" fill="${i ? t.energy : t.trim}" opacity="0.5"/>
          <line x1="27" y1="0" x2="27" y2="152" stroke="#0005" stroke-width="1.2"/>
        </g>`).join('')}
        <!-- the staff golf bag, hero-lit in the corner -->
        ${sh(84, 272, 34, 8)}
        <g transform="translate(84 270)">
          <ellipse cx="0" cy="-84" rx="34" ry="10" fill="${glow}" opacity="0.12"/>
          <rect x="-17" y="-76" width="34" height="76" rx="14" fill="${t.trim}" stroke="#0007" stroke-width="1.4"/>
          <rect x="-17" y="-76" width="34" height="20" rx="9" fill="${darken(t.trim, 0.22)}"/>
          <rect x="-17" y="-40" width="34" height="12" rx="5" fill="${lighten(t.trim, 0.15)}" opacity="0.7"/>
          <path d="M17 -60 Q26 -40 17 -18" fill="none" stroke="${darken(t.trim, 0.3)}" stroke-width="4"/>
          ${[-8, 0, 8].map((dx, i) => `<line x1="${dx}" y1="-76" x2="${dx * 1.6}" y2="${-102 - (i % 2) * 6}" stroke="${chrome}" stroke-width="2.6"/><path d="M${dx * 1.6 - 4} ${-102 - (i % 2) * 6} l8 0 l-2.5 6 l-3 0 Z" fill="${lighten(t.trim, 0.3)}" stroke="#0006" stroke-width="0.8"/>`).join('')}
        </g>
        <!-- spare boots under the bench -->
        ${sh(342, 274, 26, 6)}
        ${[328, 354].map((x, i) => `<g transform="translate(${x} 258) rotate(${i ? 6 : -4})"><path d="M-8 0 L8 0 L10 12 L-12 12 Z" fill="${darken(t.panel, 0.05)}" stroke="#0007" stroke-width="1.2"/><rect x="-8" y="-8" width="16" height="9" rx="3" fill="${t.trim}"/></g>`).join('')}
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ DISC — the alien saucer pod ═══════════════════════════ */

function discShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const glow = lighten(t.energy, 0.15);
  // Five round portholes ringing the dome, each a lit metal ring onto real space.
  const ports = ([[70, 118, 15], [135, 84, 18], [200, 72, 20], [265, 84, 18], [330, 118, 15]] as [number, number, number][])
    .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="${darken(t.panel, 0.28)}"/>
      <circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="${lighten(t.trim, 0.25)}" stroke-width="2"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="#070c1c"/>
      <clipPath id="si-port${i}-${u}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>
      <g clip-path="url(#si-port${i}-${u})">${stars(x - r, y - r, r * 2, r * 2, 7 + i)}</g>
      <path d="M${x - r * 0.66} ${y - r * 0.5} A ${r * 0.8} ${r * 0.8} 0 0 1 ${x + r * 0.2} ${y - r * 0.86}" fill="none" stroke="${t.glass}" stroke-width="2" opacity="0.5"/>`)
    .join('');
  return {
    open: `<defs>
        <radialGradient id="si-dome-${u}" cx="50%" cy="6%" r="115%"><stop offset="0%" stop-color="${lighten(t.panel, 0.22)}"/><stop offset="50%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${darken(t.hull, 0.15)}"/></radialGradient>
        <radialGradient id="si-deck-${u}" cx="50%" cy="30%" r="80%"><stop offset="0%" stop-color="${darken(t.hull, 0.14)}"/><stop offset="70%" stop-color="${darken(t.hull, 0.4)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.58)}"/></radialGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="${darken(t.hull, 0.45)}"/>
      <!-- domed ceiling with curved structural ribs converging on the hub -->
      <path d="M-40 232 Q200 -96 440 232 Z" fill="url(#si-dome-${u})"/>
      ${[52, 118, 282, 348].map((x2) => `<path d="M200 22 Q${(200 + x2) / 2} ${52 + Math.abs(200 - x2) * 0.16} ${x2} 226" fill="none" stroke="${darken(t.panel, 0.2)}" stroke-width="5" opacity="0.55"/><path d="M200 22 Q${(200 + x2) / 2} ${52 + Math.abs(200 - x2) * 0.16} ${x2} 226" fill="none" stroke="${lighten(t.trim, 0.15)}" stroke-width="1.2" opacity="0.4"/>`).join('')}
      <path d="M-30 214 Q200 118 430 214" fill="none" stroke="${darken(t.panel, 0.16)}" stroke-width="4" opacity="0.5"/>
      <!-- the ceiling hub: stacked discs + a glowing antenna stem -->
      <ellipse cx="200" cy="30" rx="46" ry="13" fill="${darken(t.panel, 0.24)}" stroke="${lighten(t.trim, 0.2)}" stroke-width="1.4"/>
      <ellipse cx="200" cy="24" rx="30" ry="9" fill="${darken(t.panel, 0.1)}" stroke="${lighten(t.trim, 0.2)}" stroke-width="1"/>
      <line x1="200" y1="24" x2="200" y2="8" stroke="${lighten(t.trim, 0.25)}" stroke-width="2"/><circle cx="200" cy="6" r="3.4" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/></circle>
      ${[164, 182, 218, 236].map((x, i) => `<circle cx="${x}" cy="${33 - Math.abs(200 - x) * 0.06}" r="2" fill="${i % 2 ? glow : t.energy}" opacity="0.8"/>`).join('')}
      ${ports}
      <!-- the deck: a dark circular floor with lit concentric rings (background — props draw over) -->
      <ellipse cx="200" cy="258" rx="255" ry="66" fill="url(#si-deck-${u})"/>
      <ellipse cx="200" cy="252" rx="196" ry="46" fill="none" stroke="${t.trim}" stroke-width="2" opacity="0.4"/>
      <ellipse cx="200" cy="250" rx="132" ry="30" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.5"/>
      <ellipse cx="200" cy="248" rx="70" ry="15" fill="none" stroke="${glow}" stroke-width="1.2" opacity="0.35"/>
      ${[-150, -75, 0, 75, 150].map((dx) => `<line x1="${200 + dx * 0.42}" y1="${248 + 14 - Math.abs(dx) * 0.02}" x2="${200 + dx}" y2="${252 + 40 - Math.abs(dx) * 0.04}" stroke="${t.trim}" stroke-width="1" opacity="0.18"/>`).join('')}`,
    close: vignette(darken(t.hull, 0.6)),
  };
}

/** A hovering drone orb with an antenna (byte-stable bob). */
function orb(x: number, y: number, r: number, col: string, glow: string, phase: number): string {
  return `<g><ellipse cx="${x}" cy="${y + r * 2.4}" rx="${r * 1.3}" ry="${r * 0.4}" fill="${glow}" opacity="0.18"/>
    <g><circle cx="${x}" cy="${y}" r="${r + 3}" fill="${glow}" opacity="0.16"/><circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="#0007" stroke-width="1"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff" opacity="0.45"/><line x1="${x}" y1="${y - r}" x2="${x}" y2="${y - r - 6}" stroke="${col}" stroke-width="1.2"/><circle cx="${x}" cy="${y - r - 7}" r="1.8" fill="${glow}"/>
    <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="${(2.4 + phase * 0.3).toFixed(1)}s" repeatCount="indefinite"/></g></g>`;
}

function discRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'disc' + room);
  const glow = lighten(t.energy, 0.2);
  const metal = lighten(t.trim, 0.25);
  switch (room) {
    case 'bridge': {
      const g = `<linearGradient id="si-holo-${u}" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="${glow}" stop-opacity="0.3"/><stop offset="100%" stop-color="${glow}" stop-opacity="0"/></linearGradient>`;
      const s = discShell(t, u, g);
      return svg(`${s.open}
        <!-- the command pedestal: a mushroom-stem console ringed with levers -->
        ${sh(200, 268, 62, 11)}
        <path d="M186 262 Q182 218 168 206 L232 206 Q218 218 214 262 Z" fill="${darken(t.panel, 0.18)}" stroke="#0007" stroke-width="1.4"/>
        <ellipse cx="200" cy="262" rx="46" ry="11" fill="${darken(t.panel, 0.08)}" stroke="${metal}" stroke-width="1.6"/>
        <ellipse cx="200" cy="204" rx="66" ry="17" fill="${darken(t.panel, 0.22)}" stroke="#0008" stroke-width="1.6"/>
        <ellipse cx="200" cy="199" rx="66" ry="17" fill="${darken(t.panel, 0.04)}" stroke="${metal}" stroke-width="1.8"/>
        <ellipse cx="200" cy="197" rx="48" ry="11" fill="${t.energy}" opacity="0.25"/>
        ${[-46, -26, 26, 46].map((dx, i) => `<g transform="translate(${200 + dx} ${199 - Math.abs(dx) * 0.08})"><line x1="0" y1="0" x2="${i < 2 ? -4 : 4}" y2="-11" stroke="${metal}" stroke-width="2.2"/><circle cx="${i < 2 ? -4 : 4}" cy="-13" r="3.4" fill="${i % 2 ? glow : t.energy}" stroke="#0007" stroke-width="0.8"/></g>`).join('')}
        ${[-10, 0, 10].map((dx, i) => `<rect x="${196 + dx - 3}" y="192" width="6" height="6" rx="1.6" fill="${i % 2 ? t.energy : glow}" opacity="0.9"/>`).join('')}
        <!-- the projected holo star-globe above the console -->
        <path d="M166 194 L234 194 L222 122 L178 122 Z" fill="url(#si-holo-${u})"/>
        <g transform="translate(200 118)">
          <circle r="36" fill="${t.energy}" opacity="0.1"/>
          <circle r="28" fill="none" stroke="${glow}" stroke-width="1.4" opacity="0.85"/>
          <ellipse rx="28" ry="10" fill="none" stroke="${glow}" stroke-width="1.2" opacity="0.7"/>
          <ellipse rx="10" ry="28" fill="none" stroke="${glow}" stroke-width="1" opacity="0.5"/>
          <path d="M-28 0 A 28 28 0 0 1 28 0" fill="none" stroke="${glow}" stroke-width="0.8" opacity="0.4"/>
          <ellipse rx="40" ry="14" fill="none" stroke="${metal}" stroke-width="1" opacity="0.5" transform="rotate(-14)"/>
          <circle cx="34" cy="-11" r="3" fill="${lighten(t.energy, 0.45)}"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite"/></circle>
          ${[[-8, -14], [12, 4], [-16, 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff" opacity="0.85"/>`).join('')}
        </g>
        <!-- the pilot's dome chair, offset right -->
        ${sh(298, 258, 34, 8)}
        <g transform="translate(298 218)">
          <path d="M-26 38 Q-34 -6 0 -12 Q34 -6 26 38 Z" fill="${darken(t.panel, 0.1)}" stroke="${metal}" stroke-width="1.6"/>
          <path d="M-18 34 Q-24 -2 0 -6 Q24 -2 18 34 Z" fill="${darken(t.trim, 0.3)}"/>
          <path d="M-18 6 Q0 -2 18 6" fill="none" stroke="${lighten(t.trim, 0.1)}" stroke-width="2" opacity="0.6"/>
          <ellipse cx="0" cy="40" rx="20" ry="5" fill="${darken(t.panel, 0.2)}" stroke="${metal}" stroke-width="1.2"/>
        </g>
        <!-- hovering drone orbs on watch -->
        ${orb(96, 172, 9, t.trim, glow, 0)}${orb(128, 132, 6, darken(t.panel, 0.02), glow, 2)}
        ${s.close}`);
    }
    case 'lounge': {
      const g = `<radialGradient id="si-pool-${u}" cx="50%" cy="40%" r="65%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="${lighten(t.energy, 0.3)}"/><stop offset="100%" stop-color="${darken(t.energy, 0.45)}"/></radialGradient>`;
      const s = discShell(t, u, g);
      return svg(`${s.open}
        <!-- the sunken conversation pit: a ring couch around a glowing plasma pool -->
        ${sh(200, 272, 130, 14)}
        <ellipse cx="200" cy="240" rx="126" ry="36" fill="${darken(t.trim, 0.3)}" stroke="#0008" stroke-width="1.6"/>
        <ellipse cx="200" cy="234" rx="126" ry="36" fill="${t.trim}"/>
        <ellipse cx="200" cy="234" rx="126" ry="36" fill="none" stroke="${lighten(t.trim, 0.2)}" stroke-width="2"/>
        ${[-100, -55, 0, 55, 100].map((dx) => `<path d="M${200 + dx} ${234 - 34 * Math.sqrt(Math.max(0, 1 - (dx / 126) * (dx / 126)))} L${200 + dx} ${234 + 34 * Math.sqrt(Math.max(0, 1 - (dx / 126) * (dx / 126)))}" stroke="#0005" stroke-width="2"/>`).join('')}
        <ellipse cx="200" cy="232" rx="92" ry="24" fill="${darken(t.hull, 0.4)}"/>
        <ellipse cx="200" cy="234" rx="80" ry="19" fill="url(#si-pool-${u})" opacity="0.9"><animate attributeName="ry" values="18;21;18" dur="3s" repeatCount="indefinite"/></ellipse>
        <ellipse cx="200" cy="232" rx="44" ry="9" fill="#fff" opacity="0.55"/>
        ${[[168, 228, 3], [232, 238, 2.4], [204, 224, 2]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.7"><animate attributeName="cy" values="${y};${(y as number) - 10};${y}" dur="${(2.6 + i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        <!-- scatter cushions on the couch ring -->
        ${[[100, 222, -10], [292, 226, 12], [252, 214, -6]].map(([x, y, r]) => `<rect x="${(x as number) - 14}" y="${(y as number) - 9}" width="28" height="18" rx="6" transform="rotate(${r} ${x} ${y})" fill="${t.energy}" opacity="0.85" stroke="#0006" stroke-width="1"/>`).join('')}
        <!-- the bubbling lava-lamp column -->
        ${sh(344, 256, 18, 5)}
        <g transform="translate(344 148)"><rect x="-12" y="0" width="24" height="104" rx="11" fill="#0b0f18" stroke="${metal}" stroke-width="1.6"/><rect x="-8" y="6" width="16" height="94" rx="8" fill="${darken(t.energy, 0.5)}" opacity="0.8"/>${[82, 56, 30].map((y, i) => `<circle cx="${i % 2 ? 3 : -3}" cy="${y}" r="${5.5 - i}" fill="${glow}" opacity="0.9"><animate attributeName="cy" values="${y};${y - 48};${y}" dur="${(4 + i).toFixed(0)}s" repeatCount="indefinite"/></circle>`).join('')}<ellipse cx="0" cy="3" rx="12" ry="4" fill="${metal}"/><circle cx="0" cy="-2" r="2.4" fill="${glow}"/></g>
        <!-- an anti-grav drinks tray floating by the pit -->
        <g transform="translate(72 178)">
          <ellipse cx="0" cy="26" rx="20" ry="5" fill="${glow}" opacity="0.25"/>
          <g><ellipse cx="0" cy="0" rx="26" ry="7" fill="${darken(t.panel, 0.06)}" stroke="${metal}" stroke-width="1.4"/>
          <g transform="translate(-9 -16)"><path d="M-5 0 L5 0 L3 12 L-3 12 Z" fill="${t.glass}" opacity="0.85"/><line x1="2" y1="-6" x2="4" y2="2" stroke="${metal}" stroke-width="1.2"/><circle cx="-1" cy="3" r="1.6" fill="${glow}"/></g>
          <g transform="translate(10 -14)"><path d="M-6 0 Q0 -8 6 0 L4 10 L-4 10 Z" fill="${t.glass}" opacity="0.85"/><circle cx="0" cy="2" r="2" fill="${t.energy}"/></g>
          <animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="3.4s" repeatCount="indefinite" additive="sum"/></g>
        </g>
        ${s.close}`);
    }
    case 'weapons': {
      const g = `<radialGradient id="si-tip-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="${glow}"/><stop offset="100%" stop-color="${darken(t.energy, 0.5)}"/></radialGradient>`;
      const s = discShell(t, u, g);
      return svg(`${s.open}
        <!-- the great ray-cannon telescoping down from the ceiling hub -->
        <path d="M186 40 L214 40 L210 84 L190 84 Z" fill="${darken(t.panel, 0.18)}" stroke="${metal}" stroke-width="1.4"/>
        <path d="M190 84 L210 84 L207 128 L193 128 Z" fill="${darken(t.panel, 0.08)}" stroke="${metal}" stroke-width="1.4"/>
        ${[88, 108, 128].map((y, i) => `<ellipse cx="200" cy="${y}" rx="${17 - i * 2}" ry="5" fill="${darken(t.panel, 0.26)}" stroke="${glow}" stroke-width="1.4" opacity="0.9"/>`).join('')}
        <circle cx="200" cy="142" r="11" fill="url(#si-tip-${u})"><animate attributeName="r" values="10;13;10" dur="1.8s" repeatCount="indefinite"/></circle>
        <path d="M193 150 L207 150 L216 236 L184 236 Z" fill="${glow}" opacity="0.14"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="1.8s" repeatCount="indefinite"/></path>
        <!-- the deck iris the beam fires through -->
        <ellipse cx="200" cy="242" rx="52" ry="13" fill="${darken(t.hull, 0.55)}" stroke="${metal}" stroke-width="1.8"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => { const a = (i * 60 * Math.PI) / 180; return `<path d="M200 242 L${(200 + Math.cos(a) * 48).toFixed(1)} ${(242 + Math.sin(a) * 11).toFixed(1)}" stroke="${darken(t.panel, 0.05)}" stroke-width="2" opacity="0.7"/>`; }).join('')}
        <ellipse cx="200" cy="242" rx="20" ry="5" fill="${glow}" opacity="0.6"/>
        <ellipse cx="200" cy="242" rx="60" ry="16" fill="none" stroke="${t.energy}" stroke-width="1.4" stroke-dasharray="6 5" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="0 200 242" to="360 200 242" dur="14s" repeatCount="indefinite"/></ellipse>
        <!-- wall racks of ray pistols either side -->
        ${[[76, 0], [324, 1]].map(([cx, m]) => `<g transform="translate(${cx} 158)${m ? ' scale(-1 1)' : ''}">
          <path d="M-26 -34 Q-34 0 -26 34 L26 40 L26 -40 Z" fill="${darken(t.panel, 0.2)}" stroke="${metal}" stroke-width="1.4" opacity="0.92"/>
          ${[-24, 0, 24].map((y, i) => `<g transform="translate(-2 ${y})"><rect x="-14" y="-5" width="28" height="10" rx="4" fill="${t.trim}" stroke="#0007" stroke-width="1"/><rect x="10" y="-3" width="12" height="6" rx="3" fill="${darken(t.panel, 0.02)}"/><circle cx="24" cy="0" r="2.6" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(1.5 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle><rect x="-12" y="5" width="8" height="9" rx="2.5" fill="${darken(t.trim, 0.28)}"/></g>`).join('')}
        </g>`).join('')}
        <!-- a targeting drone holding position -->
        ${orb(286, 120, 7, t.trim, glow, 1)}
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-anti-${u}" cx="50%" cy="42%" r="58%"><stop offset="0%" stop-color="#fff"/><stop offset="38%" stop-color="${glow}"/><stop offset="100%" stop-color="${darken(t.energy, 0.55)}"/></radialGradient>`;
      const s = discShell(t, u, g);
      return svg(`${s.open}
        <!-- the antigrav plinth: stepped discs wound with glowing coils -->
        ${sh(200, 272, 84, 12)}
        <ellipse cx="200" cy="258" rx="80" ry="19" fill="${darken(t.panel, 0.24)}" stroke="${metal}" stroke-width="1.6"/>
        <ellipse cx="200" cy="250" rx="62" ry="15" fill="${darken(t.panel, 0.12)}" stroke="${metal}" stroke-width="1.4"/>
        <ellipse cx="200" cy="243" rx="42" ry="10" fill="${darken(t.panel, 0.02)}" stroke="${metal}" stroke-width="1.2"/>
        ${[252, 258].map((y, i) => `<path d="M${138 - i * 8} ${y} Q200 ${y + 12} ${262 + i * 8} ${y}" fill="none" stroke="${t.energy}" stroke-width="2" opacity="${0.5 - i * 0.15}"/>`).join('')}
        <!-- the levitating core sphere in its gyro cage -->
        <g transform="translate(200 152)">
          <ellipse rx="86" ry="80" fill="${t.energy}" opacity="0.1"><animate attributeName="opacity" values="0.07;0.18;0.07" dur="2.6s" repeatCount="indefinite"/></ellipse>
          <circle r="42" fill="url(#si-anti-${u})"><animate attributeName="r" values="42;47;42" dur="2.6s" repeatCount="indefinite"/></circle>
          <circle cx="-13" cy="-14" r="12" fill="#fff" opacity="0.4"/>
          <ellipse rx="70" ry="24" fill="none" stroke="${metal}" stroke-width="3" opacity="0.8"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="70" ry="24" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="60" to="420" dur="10s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="26" ry="70" fill="none" stroke="${metal}" stroke-width="2.4" opacity="0.6"/>
          <g><animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="12s" repeatCount="indefinite"/><circle cx="54" cy="0" r="4" fill="${t.trim}" stroke="#0007" stroke-width="1"/><circle cx="-50" cy="8" r="3" fill="${t.trim}" stroke="#0007" stroke-width="1"/></g>
        </g>
        <!-- crackling energy tethers from plinth to core -->
        ${[-1, 1].map((sgn) => `<path d="M${200 + sgn * 34} 240 L${200 + sgn * 26} 222 L${200 + sgn * 34} 208 L${200 + sgn * 22} 196" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.7"><animate attributeName="opacity" values="0.3;0.9;0.3" dur="${sgn > 0 ? 1.1 : 1.4}s" repeatCount="indefinite"/></path>`).join('')}
        <!-- twin field pylons with insulator stacks -->
        ${[[92, 0], [308, 1]].map(([x, i]) => `${sh(x as number, 262, 24, 6)}<g transform="translate(${x} 204)">
          <path d="M-14 56 L14 56 L9 0 L-9 0 Z" fill="${darken(t.panel, 0.16)}" stroke="${metal}" stroke-width="1.4"/>
          ${[8, 20, 32].map((y) => `<ellipse cx="0" cy="${y}" rx="13" ry="4" fill="${darken(t.panel, 0.02)}" stroke="#0006" stroke-width="1"/>`).join('')}
          <circle cx="0" cy="-6" r="5" fill="${glow}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${i ? 1.9 : 1.6}s" repeatCount="indefinite"/></circle>
          <path d="M0 -8 Q${(i ? -1 : 1) * 46} -34 ${(i ? -1 : 1) * 84} -40" fill="none" stroke="${t.energy}" stroke-width="1.6" opacity="0.5"/>
        </g>`).join('')}
        <!-- wall gauges -->
        ${[[64, 150], [336, 150]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#0b0f18" stroke="${metal}" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${glow}" stroke-width="1.2" opacity="0.8"/><line x1="${x}" y1="${y}" x2="${(x as number) + 4}" y2="${(y as number) - 5}" stroke="${glow}" stroke-width="1.4"/>`).join('')}
        ${s.close}`);
    }
    case 'locker':
    default: {
      const g = `<linearGradient id="si-tube-${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${t.energy}" stop-opacity="0.14"/><stop offset="50%" stop-color="${glow}" stop-opacity="0.4"/><stop offset="100%" stop-color="${t.energy}" stop-opacity="0.14"/></linearGradient>`;
      const s = discShell(t, u, g);
      // Tube contents: golf bag (hero, centre), suit, helmet, trophy, spare clubs.
      const contents = [
        `<g transform="translate(0 6)"><rect x="-7" y="-22" width="14" height="34" rx="6" fill="${darken(t.trim, 0.1)}"/><rect x="-7" y="-22" width="14" height="9" rx="4" fill="${darken(t.trim, 0.3)}"/>${[-3, 1, 5].map((dx) => `<line x1="${dx - 1}" y1="-22" x2="${dx - 2}" y2="-34" stroke="${metal}" stroke-width="1.4"/><circle cx="${dx - 2}" cy="-35" r="1.6" fill="${glow}"/>`).join('')}</g>`,
        `<g transform="translate(0 4)"><circle cx="0" cy="-24" r="7" fill="${t.glass}" opacity="0.9"/><path d="M-8 -16 Q0 -20 8 -16 L7 6 Q0 10 -7 6 Z" fill="${lighten(t.panel, 0.25)}"/><path d="M-8 -16 L-12 2 M8 -16 L12 2" stroke="${lighten(t.panel, 0.25)}" stroke-width="3.4" stroke-linecap="round"/><path d="M-4 6 L-4 22 M4 6 L4 22" stroke="${lighten(t.panel, 0.18)}" stroke-width="4" stroke-linecap="round"/></g>`,
        `<g transform="translate(0 8)"><path d="M-9 -6 A9 9 0 0 1 9 -6 L9 0 Q0 4 -9 0 Z" fill="${t.trim}"/><rect x="-8" y="-6" width="16" height="5" rx="2.5" fill="${t.glass}" opacity="0.8"/><path d="M-6 14 L6 14 L4 24 L-4 24 Z" fill="${t.trim}" opacity="0.8"/></g>`,
        `<g transform="translate(0 8)"><path d="M-8 -18 Q-8 -6 0 -4 Q8 -6 8 -18 Z" fill="${lighten(t.trim, 0.3)}"/><path d="M-11 -18 Q-15 -12 -8 -9 M11 -18 Q15 -12 8 -9" fill="none" stroke="${lighten(t.trim, 0.3)}" stroke-width="2"/><rect x="-2" y="-4" width="4" height="8" fill="${lighten(t.trim, 0.2)}"/><rect x="-7" y="4" width="14" height="5" rx="2" fill="${darken(t.trim, 0.1)}"/></g>`,
        `<g transform="translate(0 6)">${[-4, 0, 4].map((dx, i) => `<line x1="${dx}" y1="20" x2="${dx * 1.8}" y2="-24" stroke="${metal}" stroke-width="2"/><path d="M${dx * 1.8 - 3} -24 l6 0 l-2 5 l-2.5 0 Z" fill="${i === 1 ? glow : t.trim}"/>`).join('')}</g>`,
      ];
      return svg(`${s.open}
        <!-- the curved wall of stasis tubes, gear suspended inside -->
        ${[0, 1, 2, 3, 4].map((i) => {
          const x = 64 + i * 68;
          const y = 158 - Math.abs(i - 2) * 10;
          return `${sh(x, y + 74, 24, 6)}<g transform="translate(${x} ${y})">
            <ellipse cx="0" cy="66" rx="24" ry="7" fill="${darken(t.panel, 0.2)}" stroke="${metal}" stroke-width="1.4"/>
            <ellipse cx="0" cy="63" rx="20" ry="5" fill="${glow}" opacity="0.3"/>
            <rect x="-18" y="-58" width="36" height="122" rx="17" fill="${darken(t.panel, 0.12)}" stroke="${metal}" stroke-width="1.6"/>
            <rect x="-13" y="-52" width="26" height="110" rx="13" fill="url(#si-tube-${u})"/>
            <rect x="-13" y="-52" width="26" height="110" rx="13" fill="none" stroke="${t.glass}" stroke-width="1" opacity="0.5"/>
            <line x1="-8" y1="-46" x2="-8" y2="52" stroke="#fff" stroke-width="2" opacity="0.18"/>
            ${contents[i]}
            <ellipse cx="0" cy="-52" rx="12" ry="4" fill="${lighten(t.panel, 0.1)}" stroke="${metal}" stroke-width="1"/>
            <circle cx="0" cy="-63" r="2.6" fill="${i === 2 ? glow : t.energy}"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(1.6 + i * 0.35).toFixed(2)}s" repeatCount="indefinite"/></circle>
          </g>`;
        }).join('')}
        <!-- frost mist pooling at the tube bases -->
        <ellipse cx="200" cy="242" rx="170" ry="16" fill="${t.glass}" opacity="0.1"/>
        <!-- the release-control podium -->
        ${sh(338, 272, 22, 6)}
        <g transform="translate(338 234)"><path d="M-12 38 L12 38 L7 0 L-7 0 Z" fill="${darken(t.panel, 0.16)}" stroke="${metal}" stroke-width="1.4"/><ellipse cx="0" cy="0" rx="14" ry="5" fill="${darken(t.panel, 0.02)}" stroke="${metal}" stroke-width="1.2"/>${[-6, 0, 6].map((dx, i) => `<circle cx="${dx}" cy="-1" r="1.8" fill="${i % 2 ? glow : t.energy}"/>`).join('')}</g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ STEED — the living winged Pegasus ═══════════════════════════ */

function steedShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const gold = lighten(t.trim, 0.15);
  return {
    open: `<defs>
        <linearGradient id="si-sky-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#070b20"/><stop offset="100%" stop-color="${darken(t.hull, 0.05)}"/></linearGradient>
        <linearGradient id="si-hide-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.06)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.32)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="url(#si-sky-${u})"/>
      ${stars(0, 0, 400, 190, 46)}
      <!-- a comet streaking past -->
      <path d="M320 44 L354 32" stroke="#dfeaff" stroke-width="1.6" opacity="0.7"/><circle cx="356" cy="31" r="2.4" fill="#fff"/>
      <!-- two great feathered wings framing the open sky -->
      ${([[1, 0], [-1, 400]] as [number, number][]).map(([sgn, ox]) => `<g transform="translate(${ox} 0) scale(${sgn} 1)">
        <path d="M-12 250 Q20 60 118 26 Q66 92 76 232 Z" fill="${lighten(t.panel, 0.12)}"/>
        <path d="M-12 250 Q20 60 118 26 Q90 60 76 118 Q40 150 24 250 Z" fill="${lighten(t.panel, 0.2)}" opacity="0.6"/>
        ${[0.22, 0.42, 0.62, 0.82].map((k) => `<path d="M${6 + 30 * k} ${240 - 150 * k} Q${44 + 40 * k} ${210 - 160 * k} ${100 + 22 * k} ${40 + 60 * k}" fill="none" stroke="${gold}" stroke-width="1.3" opacity="${0.55 - k * 0.25}"/>`).join('')}
        ${[[30, 226], [46, 190], [60, 152]].map(([x, y]) => `<path d="M${x} ${y} q10 -6 22 -2 q-10 8 -22 2" fill="${darken(t.panel, 0.08)}" opacity="0.8"/>`).join('')}
      </g>`).join('')}
      <!-- the steed's broad back: hide, bronze spine-plates, the saddle blanket (background — props draw over) -->
      <path d="M30 208 Q200 182 370 208 L400 300 L0 300 Z" fill="url(#si-hide-${u})"/>
      <path d="M30 208 Q200 182 370 208" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.8"/>
      <path d="M30 214 Q200 189 370 214" fill="none" stroke="#000" stroke-width="3" opacity="0.2"/>
      ${[70, 136, 200, 264, 330].map((x) => `<path d="M${x} ${222 - Math.abs(200 - x) * 0.04} q7 9 0 18 q-7 -9 0 -18" fill="${gold}" opacity="0.5"/>`).join('')}
      <path d="M110 240 Q200 224 290 240 L306 300 L94 300 Z" fill="${darken(t.trim, 0.12)}"/>
      <path d="M110 240 Q200 224 290 240" fill="none" stroke="${gold}" stroke-width="2"/>
      <path d="M116 252 Q200 237 284 252" fill="none" stroke="${gold}" stroke-width="1" opacity="0.5"/>
      ${[130, 200, 270].map((x) => `<circle cx="${x}" cy="${262 - Math.abs(200 - x) * 0.03}" r="3" fill="${gold}" opacity="0.7"/>`).join('')}`,
    close: vignette('#06081a'),
  };
}

function steedRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'steed' + room);
  const gold = lighten(t.trim, 0.2);
  const mane = lighten(t.energy, 0.1);
  switch (room) {
    case 'bridge': {
      const s = steedShell(t, u);
      return svg(`${s.open}
        <!-- the steed's neck + streaming star-mane rising ahead -->
        <path d="M158 214 Q146 138 128 84 Q124 52 152 34 Q132 66 146 112 Q160 166 196 214 Z" fill="${lighten(t.panel, 0.14)}" stroke="#0006" stroke-width="1.4"/>
        <path d="M158 214 Q146 138 128 84 Q140 120 158 160 Q172 192 196 214 Z" fill="${darken(t.panel, 0.06)}" opacity="0.6"/>
        ${([[128, 82, 96, 44], [138, 66, 108, 22], [150, 52, 130, 8], [158, 44, 152, 2]] as [number, number, number, number][]).map(([x0, y0, x1, y1], i) => `<path d="M${x0} ${y0} Q${(x0 + x1) / 2 - 10} ${(y0 + y1) / 2} ${x1} ${y1}" fill="none" stroke="${mane}" stroke-width="${3.4 - i * 0.5}" opacity="0.85" stroke-linecap="round"><animate attributeName="opacity" values="0.6;1;0.6" dur="${(2 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}
        ${[[104, 36], [122, 16], [146, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#fff" opacity="0.9"/>`).join('')}
        <!-- ears + bronze bridle -->
        <path d="M130 44 l-8 -14 l12 4 Z" fill="${lighten(t.panel, 0.14)}"/>
        <path d="M126 84 Q146 92 152 60" fill="none" stroke="${gold}" stroke-width="2.4"/><circle cx="127" cy="83" r="3" fill="${gold}"/>
        <!-- reins sweeping back to the saddle-horn -->
        <path d="M150 62 Q226 140 258 208 M144 70 Q220 146 252 212" fill="none" stroke="${darken(t.trim, 0.12)}" stroke-width="2.6"/>
        <!-- the saddle-horn + pommel dais, the rider's post -->
        ${sh(262, 254, 42, 9)}
        <g transform="translate(262 232)">
          <path d="M-34 18 Q0 4 34 18 L28 -8 Q0 -18 -28 -8 Z" fill="${t.trim}" stroke="${gold}" stroke-width="1.8"/>
          <path d="M-20 -8 q0 -30 18 -33 q6 1 7 8 q-12 4 -13 25 Z" fill="${t.trim}" stroke="${gold}" stroke-width="1.8"/>
          <circle cx="4" cy="-34" r="6" fill="${gold}" stroke="#0006" stroke-width="1"/><circle cx="4" cy="-34" r="2.4" fill="${mane}"/>
          ${[-18, 0, 18].map((dx) => `<circle cx="${dx}" cy="8" r="2.4" fill="${gold}" opacity="0.8"/>`).join('')}
        </g>
        <!-- stirrup hanging off the flank -->
        <path d="M318 214 Q322 234 318 246" fill="none" stroke="${darken(t.trim, 0.1)}" stroke-width="3"/>
        <path d="M310 246 A 10 12 0 1 0 326 246" fill="none" stroke="${gold}" stroke-width="3.4"/>
        <!-- a guiding star ahead, the destination -->
        <g transform="translate(64 92)"><circle r="3" fill="#fff"/><path d="M0 -10 L0 10 M-10 0 L10 0" stroke="#fff" stroke-width="1" opacity="0.6"/><circle r="7" fill="#fff" opacity="0.2"><animate attributeName="r" values="6;9;6" dur="2.4s" repeatCount="indefinite"/></circle></g>
        ${s.close}`);
    }
    case 'lounge': {
      const g = `<radialGradient id="si-fire-${u}" cx="50%" cy="70%" r="60%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${mane}"/><stop offset="100%" stop-color="${darken(t.energy, 0.5)}"/></radialGradient>`;
      const s = steedShell(t, u, g);
      return svg(`${s.open}
        <!-- the fur nest, deep and layered -->
        ${sh(160, 278, 96, 11)}
        <ellipse cx="160" cy="252" rx="102" ry="26" fill="${darken(t.trim, 0.3)}"/>
        <ellipse cx="160" cy="246" rx="96" ry="23" fill="${darken(t.trim, 0.08)}"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${76 + i * 34} ${250 - Math.abs(2.5 - i) * 3} q12 -16 24 0 q-12 8 -24 0" fill="${lighten(t.trim, 0.12 + (i % 3) * 0.06)}" opacity="0.95"/>`).join('')}
        <ellipse cx="160" cy="240" rx="52" ry="12" fill="${t.trim}" opacity="0.55"/>
        <path d="M120 236 q16 -12 34 -4 q-14 10 -34 4" fill="${lighten(t.trim, 0.22)}"/>
        <!-- the bronze brazier, warm heart of the nest -->
        ${sh(304, 268, 30, 7)}
        <g transform="translate(304 214)">
          <path d="M-24 46 L24 46 L16 18 L-16 18 Z" fill="${darken(t.panel, 0.06)}" stroke="${gold}" stroke-width="1.6"/>
          <ellipse cx="0" cy="18" rx="17" ry="5" fill="${darken(t.panel, 0.16)}" stroke="${gold}" stroke-width="1.2"/>
          ${[-1, 0, 1].map((k, i) => `<path d="M${k * 7} 15 Q${k * 12} -6 ${k * 3} ${-18 - i * 4}" fill="none" stroke="url(#si-fire-${u})" stroke-width="${5 - i}" stroke-linecap="round" opacity="0.9"><animate attributeName="opacity" values="0.6;1;0.6" dur="${(1.4 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}
          <ellipse cx="0" cy="12" rx="12" ry="4" fill="${mane}" opacity="0.7"/>
          ${[[-30, -18], [26, -26]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${mane}" opacity="0.8"><animate attributeName="cy" values="${y};${(y as number) - 22}" dur="${(2.2 + i * 0.6).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="${(2.2 + i * 0.6).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        </g>
        <!-- a drinking horn on a stand + a lyre resting in the furs -->
        ${sh(68, 268, 20, 5)}
        <g transform="translate(68 240)"><path d="M-12 24 L12 24 L8 16 L-8 16 Z" fill="${darken(t.panel, 0.08)}" stroke="${gold}" stroke-width="1.2"/><path d="M-4 16 q-26 -4 -34 -28 q22 4 36 18 Z" fill="${gold}" stroke="${darken(t.trim, 0.25)}" stroke-width="1.2"/><ellipse cx="-2" cy="-11" rx="5" ry="3" fill="${mane}" opacity="0.7"/></g>
        <g transform="translate(206 218) rotate(-12)"><path d="M-12 0 Q-16 -26 -4 -30 M12 0 Q16 -26 4 -30" fill="none" stroke="${gold}" stroke-width="2.6"/><path d="M-12 0 Q0 6 12 0" fill="none" stroke="${gold}" stroke-width="2.6"/>${[-6, -2, 2, 6].map((x) => `<line x1="${x}" y1="-2" x2="${x * 0.5}" y2="-27" stroke="${mane}" stroke-width="0.9" opacity="0.85"/>`).join('')}</g>
        <!-- fireflies of starlight drifting -->
        ${[[120, 160, 0], [250, 140, 1], [180, 120, 2]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${mane}" opacity="0.8"><animate attributeName="cy" values="${y};${(y as number) - 8};${y}" dur="${(3 + (i as number)).toFixed(0)}s" repeatCount="indefinite"/></circle>`).join('')}
        ${s.close}`);
    }
    case 'weapons': {
      const s = steedShell(t, u);
      return svg(`${s.open}
        <!-- the great round shield, boss gleaming -->
        ${sh(100, 268, 44, 9)}
        <g transform="translate(100 202)">
          <circle r="52" fill="${darken(t.panel, 0.08)}" stroke="${gold}" stroke-width="4"/>
          <circle r="52" fill="none" stroke="#0007" stroke-width="1.4"/>
          <circle r="38" fill="none" stroke="${gold}" stroke-width="1.6" opacity="0.7"/>
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const a = (d * Math.PI) / 180; return `<line x1="${(Math.cos(a) * 14).toFixed(1)}" y1="${(Math.sin(a) * 14).toFixed(1)}" x2="${(Math.cos(a) * 50).toFixed(1)}" y2="${(Math.sin(a) * 50).toFixed(1)}" stroke="${gold}" stroke-width="2" opacity="0.55"/>`; }).join('')}
          <circle r="12" fill="${gold}"/><circle cx="-3" cy="-4" r="4" fill="${lighten(t.trim, 0.45)}"/>
          <path d="M-14 -32 A 36 36 0 0 1 22 -28" fill="none" stroke="#fff" stroke-width="3" opacity="0.25"/>
        </g>
        <!-- the lance rack: three winged lances stood to the sky -->
        ${sh(282, 262, 56, 9)}
        <rect x="226" y="244" width="112" height="10" rx="5" fill="${darken(t.panel, 0.12)}" stroke="${gold}" stroke-width="1.2"/>
        ${[250, 284, 318].map((x, i) => `<g transform="translate(${x} 118) rotate(${(i - 1) * 7} 0 130)">
          <rect x="-2.5" y="0" width="5" height="130" rx="2.5" fill="${darken(t.trim, 0.08)}" stroke="#0006" stroke-width="0.8"/>
          <path d="M0 -22 l9 22 l-18 0 Z" fill="${gold}" stroke="#0006" stroke-width="1"/>
          <path d="M0 -22 l0 22" stroke="${mane}" stroke-width="1.2" opacity="0.8"/>
          <path d="M-7 34 q-10 6 -8 18 q10 -4 8 -18 M7 34 q10 6 8 18 q-10 -4 -8 -18" fill="${lighten(t.trim, 0.3)}" opacity="0.85"/>
          <rect x="-6" y="58" width="12" height="7" rx="3" fill="${t.trim}" stroke="#0006" stroke-width="0.8"/>
        </g>`).join('')}
        <!-- the war-horn slung between + glowing runes on the hide -->
        <g transform="translate(196 236) rotate(-16)"><path d="M0 0 Q-30 4 -44 -16 Q-18 -12 2 -8 Q10 -6 8 0 Z" fill="${gold}" stroke="${darken(t.trim, 0.25)}" stroke-width="1.4"/><ellipse cx="-42" cy="-15" rx="4" ry="6" fill="${darken(t.trim, 0.35)}" transform="rotate(30 -42 -15)"/><circle cx="4" cy="-4" r="2" fill="${mane}"/></g>
        ${([[168, 130, 0], [206, 108, 1], [186, 158, 2]] as [number, number, number][]).map(([x, y, i]) => `<g transform="translate(${x} ${y})"><path d="M0 -9 l0 18 m0 -13 l8 6 m-8 -6 l-8 6 m8 1 l8 6 m-8 -6 l-8 6" stroke="${mane}" stroke-width="2" fill="none" opacity="0.85" stroke-linecap="round"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(2 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path><circle r="14" fill="${mane}" opacity="0.08"/></g>`).join('')}
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-heart-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="${mane}"/><stop offset="70%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.55)}"/></radialGradient>`;
      const s = steedShell(t, u, g);
      return svg(`${s.open}
        <!-- the steed's blazing star-HEART, beating between the wings -->
        <g transform="translate(200 138)">
          <ellipse rx="92" ry="88" fill="${t.energy}" opacity="0.13"><animate attributeName="opacity" values="0.09;0.22;0.09" dur="1.4s" repeatCount="indefinite"/></ellipse>
          <path d="M0 46 C-58 8 -52 -44 -18 -44 C-5 -44 0 -31 0 -24 C0 -31 5 -44 18 -44 C52 -44 58 8 0 46 Z" fill="url(#si-heart-${u})"><animateTransform attributeName="transform" type="scale" values="1;1.09;1" dur="1.4s" repeatCount="indefinite" additive="sum"/></path>
          <path d="M0 46 C-58 8 -52 -44 -18 -44 C-5 -44 0 -31 0 -24 C0 -31 5 -44 18 -44 C52 -44 58 8 0 46 Z" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.8"/>
          <path d="M-26 -22 Q-14 -34 -2 -30" fill="none" stroke="#fff" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const a = (d * Math.PI) / 180; return `<path d="M${(Math.cos(a) * 52).toFixed(1)} ${(Math.sin(a) * 52).toFixed(1)} q${(Math.cos(a) * 14).toFixed(1)} ${(Math.sin(a) * 14).toFixed(1)} ${(Math.cos(a) * 26).toFixed(1)} ${(Math.sin(a) * 26 - 4).toFixed(1)}" fill="none" stroke="${mane}" stroke-width="2.2" opacity="0.55" stroke-linecap="round"/>`; }).join('')}
        </g>
        <!-- golden life-veins running from the heart into the hide -->
        ${[[-1, 118], [1, 282]].map(([sgn, x]) => `<path d="M${200 + (sgn as number) * 44} 172 Q${x} 200 ${x} 236" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.7"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="1.4s" repeatCount="indefinite"/></path><path d="M${x} 236 q${(sgn as number) * 14} 10 ${(sgn as number) * 8} 22" fill="none" stroke="${gold}" stroke-width="1.6" opacity="0.5"/>`).join('')}
        <!-- pulse motes rising off the beat -->
        ${[[164, 96, 0], [238, 88, 1], [200, 72, 2]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="2" fill="${mane}" opacity="0.9"><animate attributeName="cy" values="${y};${(y as number) - 26}" dur="${(1.8 + (i as number) * 0.4).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="${(1.8 + (i as number) * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = steedShell(t, u);
      return svg(`${s.open}
        <!-- tooled-leather saddlebags buckled over the flank -->
        ${[[104, 0], [296, 1]].map(([x, m]) => `${sh(x as number, 266, 40, 8)}<g transform="translate(${x} 196)${m ? ' scale(-1 1)' : ''}">
          <path d="M-38 -34 L38 -34 L32 52 L-32 52 Z" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.8"/>
          <path d="M-38 -34 L38 -34 L32 52 L-32 52 Z" fill="none" stroke="#0006" stroke-width="0.8"/>
          <path d="M-38 -34 Q0 -14 38 -34 L33 10 Q0 -4 -33 10 Z" fill="${t.trim}" stroke="#0006" stroke-width="1"/>
          <path d="M-30 -28 Q0 -10 30 -28" fill="none" stroke="${gold}" stroke-width="1.2" opacity="0.7"/>
          <rect x="-5" y="-8" width="10" height="14" rx="3" fill="${gold}" stroke="#0006" stroke-width="1"/><circle cx="0" cy="-1" r="2" fill="${darken(t.trim, 0.3)}"/>
          ${[-20, 20].map((bx) => `<rect x="${bx - 3.4}" y="-34" width="7" height="20" rx="2.5" fill="${gold}" opacity="0.85"/><rect x="${bx - 5}" y="-20" width="10" height="5" rx="2" fill="${darken(t.trim, 0.25)}"/>`).join('')}
          <path d="M-26 26 q6 8 14 2 M8 30 q8 4 16 -4" fill="none" stroke="${darken(t.trim, 0.2)}" stroke-width="1.2" opacity="0.7"/>
        </g>`).join('')}
        <!-- the bronze club-quiver standing centre, clubs fanned -->
        ${sh(200, 272, 26, 6)}
        <g transform="translate(200 234)">
          <path d="M-16 38 L16 38 L12 -22 L-12 -22 Z" fill="${darken(t.panel, 0.06)}" stroke="${gold}" stroke-width="1.6"/>
          <ellipse cx="0" cy="-22" rx="12" ry="4.4" fill="${darken(t.panel, 0.2)}" stroke="${gold}" stroke-width="1.2"/>
          <path d="M-16 6 L16 6" stroke="${gold}" stroke-width="1.2" opacity="0.6"/>
          ${[-7, -2.5, 2.5, 7].map((dx, i) => `<line x1="${dx}" y1="-22" x2="${dx * 2.6}" y2="${-56 - (i % 2) * 8}" stroke="${gold}" stroke-width="2.2"/><path d="M${dx * 2.6 - 3.5} ${-56 - (i % 2) * 8} l7 0 l-2.5 5.5 l-2.5 0 Z" fill="${lighten(t.trim, 0.25)}" stroke="#0006" stroke-width="0.7"/>`).join('')}
          <path d="M-12 20 q12 6 24 0" fill="none" stroke="${gold}" stroke-width="1" opacity="0.5"/>
        </g>
        <!-- a horseshoe of fortune nailed to the spine-plate -->
        <g transform="translate(200 156)"><path d="M-12 8 A 13 13 0 1 1 12 8" fill="none" stroke="${gold}" stroke-width="4.4"/><path d="M-12 8 A 13 13 0 1 1 12 8" fill="none" stroke="#0006" stroke-width="1" opacity="0.5"/>${[[-12, 8], [12, 8], [0, -13]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${darken(t.trim, 0.3)}"/>`).join('')}<circle cx="0" cy="-24" r="1.6" fill="${mane}"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.2s" repeatCount="indefinite"/></circle></g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ BIKE — the open single-rider frame ═══════════════════════════ */

function bikeShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const neon = lighten(t.energy, 0.1);
  return {
    open: `<defs>
        <linearGradient id="si-void-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#04060f"/><stop offset="100%" stop-color="${darken(t.hull, 0.25)}"/></linearGradient>
        <linearGradient id="si-streak-${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${neon}" stop-opacity="0"/><stop offset="100%" stop-color="${neon}" stop-opacity="0.75"/></linearGradient>
        <linearGradient id="si-bdeck-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${darken(t.hull, 0.08)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.42)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="url(#si-void-${u})"/>
      ${stars(0, 0, 400, 210, 44)}
      <!-- speed streaks blurring past the open frame -->
      ${[36, 74, 108, 148, 184].map((y, i) => `<line x1="${i % 2 ? 0 : 30}" y1="${y}" x2="${150 + i * 24}" y2="${y}" stroke="url(#si-streak-${u})" stroke-width="${1.4 + (i % 3) * 0.8}" opacity="0.55"/>`).join('')}
      <!-- twin chrome roll-cage arcs over the rider -->
      <path d="M16 214 Q200 26 384 214" fill="none" stroke="${darken(t.panel, 0.02)}" stroke-width="9" opacity="0.8"/>
      <path d="M16 214 Q200 26 384 214" fill="none" stroke="${lighten(t.trim, 0.3)}" stroke-width="2.2" opacity="0.7"/>
      <path d="M44 226 Q200 62 356 226" fill="none" stroke="${darken(t.panel, 0.1)}" stroke-width="5" opacity="0.6"/>
      <path d="M44 226 Q200 62 356 226" fill="none" stroke="${neon}" stroke-width="1.4" opacity="0.5"/>
      ${[[62, 172], [338, 172]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${neon}"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.3s" repeatCount="indefinite"/></circle>`).join('')}
      <!-- the frame deck: footplate + twin glowing hover-wheels (background — props draw over) -->
      <path d="M52 222 L348 222 L372 300 L28 300 Z" fill="url(#si-bdeck-${u})"/>
      <path d="M52 222 L348 222" fill="none" stroke="${lighten(t.trim, 0.25)}" stroke-width="1.8" opacity="0.7"/>
      ${[110, 170, 230, 290].map((x) => `<line x1="${x}" y1="228" x2="${x - 8}" y2="300" stroke="#000" stroke-width="1.4" opacity="0.25"/>`).join('')}
      ${[0, 1].map((i) => { const x = 104 + i * 192; return `<ellipse cx="${x}" cy="278" rx="52" ry="15" fill="${neon}" opacity="0.16"/><ellipse cx="${x}" cy="274" rx="44" ry="11" fill="none" stroke="${neon}" stroke-width="3.4" opacity="0.8"/><ellipse cx="${x}" cy="274" rx="30" ry="7" fill="none" stroke="${lighten(t.energy, 0.4)}" stroke-width="1.4" opacity="0.6"/>`; }).join('')}`,
    close: vignette('#04060f'),
  };
}

function bikeRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'bike' + room);
  const neon = lighten(t.energy, 0.15);
  const chrome = lighten(t.trim, 0.3);
  switch (room) {
    case 'bridge': {
      const s = bikeShell(t, u);
      return svg(`${s.open}
        <!-- the bubble windscreen + chrome ape-hanger bars, the rider's office -->
        <path d="M138 152 Q200 84 262 152 L252 158 Q200 100 148 158 Z" fill="${t.glass}" opacity="0.3"/>
        <path d="M138 152 Q200 84 262 152" fill="none" stroke="${chrome}" stroke-width="2.4"/>
        <path d="M96 206 Q200 148 304 206" fill="none" stroke="${darken(t.panel, 0.05)}" stroke-width="10"/>
        <path d="M96 206 Q200 148 304 206" fill="none" stroke="${chrome}" stroke-width="2.4" opacity="0.7"/>
        ${[[96, 206, 0], [304, 206, 1]].map(([x, y, i]) => `<g transform="translate(${x} ${y})">
          <rect x="-16" y="-7" width="32" height="15" rx="7.5" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/>
          <rect x="${i ? -14 : 4}" y="-5" width="10" height="11" rx="3" fill="${darken(t.trim, 0.3)}"/>
          <circle cx="${i ? 12 : -12}" cy="0" r="4.4" fill="${neon}"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.4s" repeatCount="indefinite"/></circle>
          <line x1="${i ? -22 : 22}" y1="-2" x2="${i ? -30 : 30}" y2="-10" stroke="${chrome}" stroke-width="2.4"/><ellipse cx="${i ? -33 : 33}" cy="-13" rx="6" ry="4.4" fill="${darken(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1.4"/>
        </g>`).join('')}
        <!-- the instrument nacelle: twin dials + a digital speedo -->
        ${sh(200, 250, 52, 9)}
        <g transform="translate(200 196)">
          <path d="M-52 44 Q0 -8 52 44 Z" fill="${darken(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1.8"/>
          <circle cx="-24" cy="28" r="13" fill="#0b0f18" stroke="${chrome}" stroke-width="1.4"/><circle cx="-24" cy="28" r="9.5" fill="none" stroke="${neon}" stroke-width="1.4"/><line x1="-24" y1="28" x2="-18" y2="21" stroke="${neon}" stroke-width="1.6"/>
          <circle cx="24" cy="28" r="13" fill="#0b0f18" stroke="${chrome}" stroke-width="1.4"/><circle cx="24" cy="28" r="9.5" fill="none" stroke="${t.energy}" stroke-width="1.4"/><line x1="24" y1="28" x2="31" y2="24" stroke="${t.energy}" stroke-width="1.6"/>
          <rect x="-16" y="2" width="32" height="16" rx="3" fill="#0b0f18" stroke="${chrome}" stroke-width="1.2"/><text x="0" y="14" text-anchor="middle" font-size="11" font-weight="800" fill="${neon}">88</text>
        </g>
        <!-- the teardrop fuel tank, pin-striped -->
        ${sh(200, 286, 40, 7)}
        <g transform="translate(200 268)"><ellipse rx="40" ry="17" fill="${t.trim}" stroke="#0008" stroke-width="1.4"/><ellipse cx="0" cy="-5" rx="30" ry="8" fill="${lighten(t.trim, 0.22)}" opacity="0.7"/><path d="M-34 -4 Q0 -16 34 -4" fill="none" stroke="${neon}" stroke-width="1.4" opacity="0.8"/><circle cx="0" cy="-8" r="4.4" fill="${darken(t.trim, 0.3)}" stroke="${chrome}" stroke-width="1.2"/></g>
        ${s.close}`);
    }
    case 'lounge': {
      const s = bikeShell(t, u);
      return svg(`${s.open}
        <!-- the neon PIT STOP sign, buzzing -->
        <g transform="translate(200 74)">
          <rect x="-64" y="-20" width="128" height="44" rx="9" fill="#0b0f18" stroke="${neon}" stroke-width="2.4"/>
          <rect x="-58" y="-15" width="116" height="34" rx="6" fill="none" stroke="${t.energy}" stroke-width="1" opacity="0.5"/>
          <text x="0" y="9" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="17" fill="${neon}">PIT STOP<animate attributeName="opacity" values="1;1;0.55;1" dur="3.2s" repeatCount="indefinite"/></text>
          ${[[-64, -20], [64, 24], [-64, 24], [64, -20]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="${i % 2 ? neon : t.energy}"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(1.2 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
          <line x1="0" y1="-20" x2="0" y2="-42" stroke="${chrome}" stroke-width="2"/>
        </g>
        <!-- a hover-jukebox thumping beside the deck -->
        ${sh(96, 280, 34, 7)}
        <g transform="translate(96 218)">
          <path d="M-28 62 L28 62 L28 6 Q28 -18 0 -18 Q-28 -18 -28 6 Z" fill="${darken(t.panel, 0.08)}" stroke="${chrome}" stroke-width="1.8"/>
          <path d="M-20 2 Q0 -12 20 2 L20 12 Q0 0 -20 12 Z" fill="${neon}" opacity="0.5"/>
          <rect x="-18" y="20" width="36" height="10" rx="3" fill="#0b0f18" stroke="${chrome}" stroke-width="1"/>
          ${[-10, 0, 10].map((dx, i) => `<rect x="${dx - 3}" y="36" width="6" height="18" rx="2" fill="${i % 2 ? t.energy : neon}" opacity="0.85"><animate attributeName="height" values="18;8;18" dur="${(0.9 + i * 0.25).toFixed(2)}s" repeatCount="indefinite"/><animate attributeName="y" values="36;46;36" dur="${(0.9 + i * 0.25).toFixed(2)}s" repeatCount="indefinite"/></rect>`).join('')}
        </g>
        <!-- lean-post with the helmet hung + a thermos on a crate -->
        ${sh(288, 282, 38, 7)}
        <g transform="translate(288 214)">
          <line x1="0" y1="0" x2="0" y2="66" stroke="${chrome}" stroke-width="4.4"/><ellipse cx="0" cy="0" rx="13" ry="4.4" fill="${t.trim}" stroke="#0007" stroke-width="1"/>
          <g transform="translate(0 22)"><path d="M-19 6 A19 19 0 0 1 19 6 L19 13 L-19 13 Z" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/><path d="M-15 3 A15 13 0 0 1 5 -9" fill="none" stroke="${neon}" stroke-width="2" opacity="0.8"/><rect x="-17" y="1" width="34" height="8" rx="4" fill="${t.glass}" opacity="0.55"/></g>
        </g>
        <g transform="translate(342 252)"><rect x="-20" y="0" width="40" height="30" rx="4" fill="${darken(t.panel, 0.14)}" stroke="${chrome}" stroke-width="1.2"/><line x1="-20" y1="15" x2="20" y2="15" stroke="#0006" stroke-width="1"/><g transform="translate(0 -22)"><rect x="-7" y="0" width="14" height="24" rx="4" fill="${lighten(t.panel, 0.14)}" stroke="#0007" stroke-width="1"/><rect x="-7" y="0" width="14" height="8" rx="3.5" fill="${neon}" opacity="0.85"/></g></g>
        <!-- a road-movie pennant strung on the cage -->
        ${[0, 1, 2, 3].map((i) => `<path d="M${118 + i * 46} ${128 - Math.sin((i + 0.5) * 1.1) * 12} l7 16 l-15 2 Z" fill="${i % 2 ? neon : t.trim}" opacity="0.8"/>`).join('')}
        <path d="M110 126 Q200 100 300 126" fill="none" stroke="${chrome}" stroke-width="1.2" opacity="0.6"/>
        ${s.close}`);
    }
    case 'weapons': {
      const s = bikeShell(t, u);
      return svg(`${s.open}
        <!-- fork-mounted twin gatling pods -->
        ${[[86, 0], [314, 1]].map(([x, m]) => `${sh(x as number, 268, 26, 6)}<g transform="translate(${x} 180)${m ? ' scale(-1 1)' : ''}">
          <rect x="-6" y="0" width="12" height="76" rx="5" fill="${darken(t.panel, 0.02)}" stroke="${chrome}" stroke-width="1.4"/>
          <g transform="translate(2 18)">
            <rect x="-12" y="-14" width="24" height="34" rx="7" fill="${darken(t.panel, 0.12)}" stroke="${chrome}" stroke-width="1.6"/>
            ${[-7, 0, 7].map((dy) => `<rect x="10" y="${dy - 2.4}" width="26" height="4.8" rx="2.4" fill="${darken(t.panel, 0.04)}" stroke="#0006" stroke-width="0.8"/><circle cx="37" cy="${dy}" r="1.8" fill="${neon}"/>`).join('')}
            <circle cx="-4" cy="2" r="5" fill="#0b0f18" stroke="${neon}" stroke-width="1.4"><animate attributeName="stroke-opacity" values="0.5;1;0.5" dur="1.2s" repeatCount="indefinite"/></circle>
          </g>
          <rect x="-10" y="60" width="20" height="9" rx="3" fill="${t.trim}" stroke="#0007" stroke-width="1"/>
        </g>`).join('')}
        <!-- the tank-mounted chain-gun, belt-fed -->
        ${sh(200, 262, 62, 10)}
        <g transform="translate(190 218)">
          <rect x="-16" y="-14" width="32" height="30" rx="6" fill="${darken(t.panel, 0.12)}" stroke="${chrome}" stroke-width="1.6"/>
          <circle cx="0" cy="0" r="6" fill="#0b0f18" stroke="${chrome}" stroke-width="1.2"/><circle cx="0" cy="0" r="2.4" fill="${neon}"/>
          <rect x="14" y="-7" width="72" height="14" rx="5" fill="${darken(t.panel, 0.04)}" stroke="${chrome}" stroke-width="1.4"/>
          ${[-3.5, 3.5].map((dy) => `<line x1="16" y1="${dy}" x2="82" y2="${dy}" stroke="#0006" stroke-width="1.2"/>`).join('')}
          <rect x="84" y="-9.5" width="10" height="19" rx="3" fill="${neon}" opacity="0.9"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.1s" repeatCount="indefinite"/></rect>
          <path d="M-14 14 Q-26 34 -12 44 Q4 50 12 42" fill="none" stroke="${darken(t.trim, 0.1)}" stroke-width="5"/>
          ${[0, 1, 2, 3].map((i) => `<rect x="${-22 + i * 9}" y="${40 - (i % 2) * 3}" width="5" height="9" rx="1.6" transform="rotate(${-18 + i * 12} ${-20 + i * 9} 44)" fill="${chrome}"/>`).join('')}
        </g>
        <!-- a missile clipped under the cage + a targeting monocle HUD -->
        <g transform="translate(268 148) rotate(-8)"><rect x="-30" y="-6" width="60" height="12" rx="6" fill="${darken(t.panel, 0.06)}" stroke="${chrome}" stroke-width="1.4"/><path d="M30 -6 l14 6 l-14 6 Z" fill="${t.energy}"/><path d="M-30 -6 l-8 -6 l0 12 Z M-30 6 l-8 6 l0 -12 Z" fill="${t.trim}"/><circle cx="8" cy="0" r="2.4" fill="${neon}"/></g>
        <g transform="translate(128 128)"><circle r="17" fill="none" stroke="${neon}" stroke-width="1.6" opacity="0.8"/><line x1="-17" y1="0" x2="17" y2="0" stroke="${neon}" stroke-width="1" opacity="0.6"/><line x1="0" y1="-17" x2="0" y2="17" stroke="${neon}" stroke-width="1" opacity="0.6"/><circle r="3.4" fill="${neon}" opacity="0.7"><animate attributeName="r" values="2.5;4.5;2.5" dur="1.6s" repeatCount="indefinite"/></circle></g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-vtwin-${u}" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s = bikeShell(t, u, g);
      return svg(`${s.open}
        <!-- the exposed V-TWIN reactor: finned cylinders, glowing heads, open headers -->
        ${sh(200, 274, 84, 11)}
        <g transform="translate(200 200)">
          <ellipse rx="76" ry="62" fill="${t.energy}" opacity="0.12"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="1.1s" repeatCount="indefinite"/></ellipse>
          ${[-1, 1].map((sgn) => `<g transform="rotate(${sgn * 27})">
            <rect x="-16" y="-64" width="32" height="56" rx="7" fill="${darken(t.panel, 0.08)}" stroke="${chrome}" stroke-width="1.8"/>
            ${[0, 1, 2, 3, 4].map((f) => `<rect x="-20" y="${-58 + f * 11}" width="40" height="4.4" rx="2.2" fill="${darken(t.panel, 0.26)}" stroke="#0005" stroke-width="0.6"/>`).join('')}
            <circle cx="0" cy="-62" r="8" fill="url(#si-vtwin-${u})"><animate attributeName="r" values="7;10;7" dur="0.5s" repeatCount="indefinite"/></circle>
          </g>`).join('')}
          <circle r="24" fill="url(#si-vtwin-${u})"/><circle r="30" fill="none" stroke="${chrome}" stroke-width="2.4"/>
          <circle r="30" fill="none" stroke="#0007" stroke-width="1"/>
          ${[0, 60, 120, 180, 240, 300].map((d) => { const a = (d * Math.PI) / 180; return `<circle cx="${(Math.cos(a) * 27).toFixed(1)}" cy="${(Math.sin(a) * 27).toFixed(1)}" r="1.8" fill="${chrome}"/>`; }).join('')}
          <!-- open flame header pipes -->
          ${[-1, 1].map((sgn) => `<path d="M${sgn * 26} 12 Q${sgn * 62} 34 ${sgn * 54} 66" fill="none" stroke="${chrome}" stroke-width="6"/><path d="M${sgn * 26} 12 Q${sgn * 62} 34 ${sgn * 54} 66" fill="none" stroke="${t.energy}" stroke-width="2.2" opacity="0.8"/><path d="M${sgn * 54} 66 q${sgn * 4} 10 ${sgn * 1} 16" fill="none" stroke="${neon}" stroke-width="3" stroke-linecap="round" opacity="0.8"><animate attributeName="opacity" values="0.4;1;0.4" dur="0.6s" repeatCount="indefinite"/></path>`).join('')}
        </g>
        <!-- a nitro bottle rack + wrench set laid on a shop rag -->
        ${sh(84, 276, 26, 6)}
        <g transform="translate(84 232)">${[-10, 4].map((dx, i) => `<g transform="translate(${dx} 0) rotate(${i ? 7 : -5})"><rect x="-6" y="0" width="12" height="34" rx="5" fill="${i ? t.energy : neon}" opacity="0.9" stroke="#0007" stroke-width="1"/><rect x="-3" y="-7" width="6" height="8" rx="2" fill="${chrome}"/></g>`).join('')}<rect x="-20" y="30" width="42" height="8" rx="3" fill="${darken(t.panel, 0.14)}" stroke="${chrome}" stroke-width="1"/></g>
        <g transform="translate(318 258)"><rect x="-26" y="-4" width="52" height="18" rx="3" fill="${darken(t.trim, 0.35)}" opacity="0.9"/>${[-16, -4, 8].map((dx, i) => `<g transform="translate(${dx} 4) rotate(${i * 8 - 8})"><line x1="0" y1="-8" x2="0" y2="8" stroke="${chrome}" stroke-width="2.4"/><circle cx="0" cy="-9" r="3" fill="none" stroke="${chrome}" stroke-width="1.8"/></g>`).join('')}</g>
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = bikeShell(t, u);
      return svg(`${s.open}
        <!-- the golf bag strapped to the tail rack, hero-lit -->
        ${sh(292, 272, 36, 8)}
        <g transform="translate(292 258)">
          <rect x="-30" y="0" width="60" height="8" rx="4" fill="${darken(t.panel, 0.08)}" stroke="${chrome}" stroke-width="1.4"/>
          <ellipse cx="0" cy="-88" rx="34" ry="10" fill="${neon}" opacity="0.1"/>
          <rect x="-17" y="-72" width="34" height="72" rx="13" fill="${t.trim}" stroke="#0008" stroke-width="1.4"/>
          <rect x="-17" y="-72" width="34" height="18" rx="8" fill="${darken(t.trim, 0.24)}"/>
          <path d="M-17 -36 L17 -36 L17 -26 L-17 -26 Z" fill="${neon}" opacity="0.55"/>
          <path d="M17 -58 Q26 -38 17 -14" fill="none" stroke="${darken(t.trim, 0.32)}" stroke-width="4"/>
          ${[-8, 0, 8].map((dx, i) => `<line x1="${dx}" y1="-72" x2="${dx * 1.7}" y2="${-96 - (i % 2) * 7}" stroke="${chrome}" stroke-width="2.4"/><path d="M${dx * 1.7 - 3.5} ${-96 - (i % 2) * 7} l7 0 l-2.5 5.5 l-2.5 0 Z" fill="${lighten(t.trim, 0.3)}" stroke="#0006" stroke-width="0.8"/>`).join('')}
          ${[-24, 24].map((dx) => `<path d="M${dx} 4 Q${dx * 1.1} -8 ${dx * 0.7} -20" fill="none" stroke="${darken(t.trim, 0.15)}" stroke-width="3"/>`).join('')}
        </g>
        <!-- studded leather panniers slung over the frame -->
        ${[[92, 0], [188, 1]].map(([x, i]) => `${sh(x as number, 274, 30, 7)}<g transform="translate(${x} 218)">
          <path d="M-24 -10 L24 -10 L19 48 L-19 48 Z" fill="${darken(t.panel, 0.02)}" stroke="${chrome}" stroke-width="1.6"/>
          <path d="M-24 -10 Q0 4 24 -10 L21 16 Q0 6 -21 16 Z" fill="${t.trim}" stroke="#0007" stroke-width="1"/>
          ${[-14, 0, 14].map((bx) => `<circle cx="${bx}" cy="24" r="1.6" fill="${chrome}"/>`).join('')}
          <rect x="-4" y="2" width="8" height="12" rx="3" fill="${i ? neon : t.energy}" opacity="0.9"/>
          <path d="M-24 -10 q-6 -12 4 -18 M24 -10 q6 -12 -4 -18" fill="none" stroke="${darken(t.trim, 0.15)}" stroke-width="2.4"/>
        </g>`).join('')}
        <!-- a tool roll spread open + spare visor on a hook -->
        <g transform="translate(146 268)"><rect x="-30" y="-7" width="60" height="16" rx="3.4" fill="${darken(t.panel, 0.12)}" stroke="${chrome}" stroke-width="1"/>${[-21, -7, 7, 21].map((dx, i) => `<line x1="${dx}" y1="-7" x2="${dx}" y2="9" stroke="${i % 2 ? neon : chrome}" stroke-width="1.6" opacity="0.8"/>`).join('')}</g>
        <g transform="translate(58 178)"><line x1="0" y1="-12" x2="0" y2="0" stroke="${chrome}" stroke-width="2"/><path d="M-14 2 A16 12 0 0 1 14 2 L12 12 A14 9 0 0 1 -12 12 Z" fill="${t.glass}" opacity="0.6" stroke="${chrome}" stroke-width="1.2"/></g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ FREIGHTER — the industrial cargo hauler ═══════════════════════════ */

function freighterShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const hazard = lighten(t.energy, 0.1);
  const steel = lighten(t.panel, 0.14);
  return {
    open: `<defs>
        <linearGradient id="si-bulk-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.08)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.08)}"/></linearGradient>
        <linearGradient id="si-plate-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${darken(t.hull, 0.22)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.5)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="218" fill="url(#si-bulk-${u})"/>
      <!-- riveted wall plates + arched structural ribs down the hold -->
      ${[100, 300].map((x) => `<line x1="${x}" y1="30" x2="${x}" y2="218" stroke="#0005" stroke-width="1.4"/>${[60, 110, 160].map((y) => `<circle cx="${x - 6}" cy="${y}" r="1.4" fill="#0008"/><circle cx="${x + 6}" cy="${y}" r="1.4" fill="#0008"/>`).join('')}`).join('')}
      ${[40, 200, 360].map((x) => `<path d="M${x - 70} 218 Q${x} 18 ${x + 70} 218" fill="none" stroke="${darken(t.hull, 0.14)}" stroke-width="12" opacity="0.6"/><path d="M${x - 70} 218 Q${x} 18 ${x + 70} 218" fill="none" stroke="${steel}" stroke-width="1.6" opacity="0.45"/>${[0.3, 0.55, 0.8].map((k) => `<circle cx="${x - 70 + 140 * k}" cy="${218 - Math.sin(k * Math.PI) * 148}" r="1.6" fill="#0007"/>`).join('')}`).join('')}
      <!-- pipe run along the ceiling with a valve wheel -->
      <rect x="0" y="12" width="400" height="8" rx="4" fill="${darken(t.panel, 0.2)}"/><rect x="0" y="12" width="400" height="3" rx="1.5" fill="${steel}" opacity="0.5"/>
      ${[80, 320].map((x) => `<rect x="${x - 4}" y="10" width="8" height="12" rx="2" fill="${steel}"/>`).join('')}
      <g transform="translate(252 24)"><circle r="8" fill="none" stroke="${hazard}" stroke-width="2.4"/><line x1="-8" y1="0" x2="8" y2="0" stroke="${hazard}" stroke-width="2"/><line x1="0" y1="-8" x2="0" y2="8" stroke="${hazard}" stroke-width="2"/></g>
      <!-- hanging work-lamp on a chain, throwing a cone of light -->
      <line x1="140" y1="20" x2="140" y2="46" stroke="${darken(t.hull, 0.1)}" stroke-width="2.4" stroke-dasharray="4 3"/>
      <path d="M126 46 L154 46 L147 60 L133 60 Z" fill="${darken(t.panel, 0.05)}" stroke="${steel}" stroke-width="1.2"/>
      <ellipse cx="140" cy="62" rx="9" ry="3.4" fill="${lighten(t.energy, 0.4)}" opacity="0.9"/>
      <path d="M133 60 L96 218 L184 218 L147 60 Z" fill="${hazard}" opacity="0.07"/>
      <!-- corrugated deck plating (background — props draw over) -->
      <rect x="0" y="218" width="400" height="82" fill="url(#si-plate-${u})"/>
      <line x1="0" y1="218" x2="400" y2="218" stroke="${steel}" stroke-width="1.8" opacity="0.6"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${8 + i * 46}" y="220" width="24" height="6" fill="${hazard}" opacity="0.5" transform="skewX(-20)"/>`).join('')}
      ${[46, 128, 210, 292, 374].map((x) => `<line x1="${x}" y1="228" x2="${x - 10}" y2="300" stroke="#000" stroke-width="1.6" opacity="0.3"/>`).join('')}
      ${[248, 274].map((y) => `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#fff" stroke-width="1" opacity="0.04"/>`).join('')}`,
    close: vignette(darken(t.hull, 0.55)),
  };
}

function freighterRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'freighter' + room);
  const hazard = lighten(t.energy, 0.12);
  const steel = lighten(t.panel, 0.18);
  switch (room) {
    case 'bridge': {
      const s = freighterShell(t, u);
      return svg(`${s.open}
        <!-- split forward windows with heavy mullions -->
        ${[[54, 0], [212, 1]].map(([x, i]) => `<rect x="${x}" y="36" width="134" height="84" rx="5" fill="#060a18"/><rect x="${(x as number) + 5}" y="41" width="124" height="74" rx="3" fill="#0a1230"/>${stars((x as number) + 10, 46, 114, 64, 16)}${i ? `<circle cx="${(x as number) + 96}" cy="70" r="10" fill="${t.glass}" opacity="0.5"/><circle cx="${(x as number) + 93}" cy="67" r="3.4" fill="#fff" opacity="0.6"/>` : `<ellipse cx="${(x as number) + 40}" cy="80" rx="30" ry="14" fill="${t.energy}" opacity="0.12"/>`}<rect x="${x}" y="36" width="134" height="84" rx="5" fill="none" stroke="${steel}" stroke-width="3.4"/>`).join('')}
        <line x1="196" y1="36" x2="196" y2="120" stroke="${darken(t.hull, 0.15)}" stroke-width="10"/>
        <!-- the chunky console bank: toggles, levers, a radar scope -->
        ${sh(200, 262, 140, 13)}
        <g transform="translate(200 176)">
          <path d="M-140 24 L140 24 L128 -14 L-128 -14 Z" fill="${darken(t.panel, 0.12)}" stroke="${steel}" stroke-width="1.8"/>
          <path d="M-140 24 L140 24 L140 58 L-140 58 Z" fill="${darken(t.panel, 0.24)}" stroke="${steel}" stroke-width="1.4"/>
          ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${-116 + i * 38}" y="-6" width="24" height="11" rx="2.4" fill="${i % 2 ? hazard : t.trim}" opacity="0.8" stroke="#0006" stroke-width="0.8"/>`).join('')}
          <g transform="translate(-92 40)"><circle r="14" fill="#0b0f18" stroke="${steel}" stroke-width="1.6"/><circle r="10" fill="none" stroke="${hazard}" stroke-width="1"/><line x1="0" y1="0" x2="7" y2="-7" stroke="${hazard}" stroke-width="1.4"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite"/></line></g>
          ${[[-30, 0], [10, 1], [50, 0], [90, 1]].map(([x, up]) => `<g transform="translate(${x} 40)"><rect x="-5" y="-9" width="10" height="18" rx="3" fill="#0b0f18" stroke="${steel}" stroke-width="1"/><line x1="0" y1="0" x2="0" y2="${up ? -13 : 13}" stroke="${steel}" stroke-width="3"/><circle cx="0" cy="${up ? -14 : 14}" r="4" fill="${up ? hazard : t.trim}" stroke="#0006" stroke-width="1"/></g>`).join('')}
        </g>
        <!-- the captain's worn high-back chair on a rail -->
        ${sh(200, 288, 30, 6)}
        <g transform="translate(200 246)">
          <rect x="-40" y="34" width="80" height="6" rx="3" fill="${darken(t.panel, 0.2)}" stroke="${steel}" stroke-width="1"/>
          <path d="M-4 34 L4 34 L4 18 L-4 18 Z" fill="${darken(t.panel, 0.1)}"/>
          <rect x="-18" y="-24" width="36" height="42" rx="7" fill="${darken(t.trim, 0.24)}" stroke="#0007" stroke-width="1.2"/>
          <rect x="-18" y="-24" width="36" height="10" rx="5" fill="${t.trim}"/>
          <path d="M-14 -2 L14 -2" stroke="#0006" stroke-width="1.4"/><path d="M-22 0 L-26 14 M22 0 L26 14" stroke="${steel}" stroke-width="4" stroke-linecap="round"/>
        </g>
        ${s.close}`);
    }
    case 'lounge': {
      const s = freighterShell(t, u);
      return svg(`${s.open}
        <!-- the mess: bolted steel table set for coffee, crate stools, galley shelf -->
        ${sh(200, 270, 84, 11)}
        <g transform="translate(200 214)">
          <rect x="-72" y="-6" width="144" height="13" rx="4" fill="${steel}" stroke="#0007" stroke-width="1.2"/>
          <rect x="-72" y="-6" width="144" height="4" rx="2" fill="#fff" opacity="0.12"/>
          ${[-58, 58].map((x) => `<path d="M${x - 5} 7 L${x - 9} 52 L${x + 9} 52 L${x + 5} 7 Z" fill="${darken(t.panel, 0.12)}" stroke="${steel}" stroke-width="1.2"/>`).join('')}
          ${[-58, 58].map((x) => `<circle cx="${x}" cy="0" r="1.6" fill="#0008"/>`).join('')}
          <!-- steaming mugs + a dented coffee urn -->
          <g transform="translate(-26 -20)"><rect x="-7" y="0" width="14" height="13" rx="3" fill="${t.trim}" stroke="#0007" stroke-width="1"/><path d="M7 3 q7 3 0 8" fill="none" stroke="${t.trim}" stroke-width="2"/><path d="M-2 -4 q2 -5 0 -9" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.5"><animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.4s" repeatCount="indefinite"/></path></g>
          <g transform="translate(30 -32)"><rect x="-13" y="0" width="26" height="26" rx="5" fill="${steel}" stroke="#0007" stroke-width="1.2"/><rect x="-8" y="-7" width="16" height="9" rx="3" fill="${darken(t.panel, 0.14)}"/><rect x="13" y="12" width="7" height="5" rx="1.6" fill="${hazard}"/><circle cx="0" cy="-11" r="2" fill="${hazard}" opacity="0.7"><animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.8s" repeatCount="indefinite"/></circle></g>
        </g>
        ${[[92, -6], [308, 8]].map(([x, r]) => `${sh(x as number, 282, 24, 6)}<g transform="translate(${x} 246) rotate(${r} 0 18)"><rect x="-20" y="0" width="40" height="36" rx="4" fill="${darken(t.panel, 0.06)}" stroke="${steel}" stroke-width="1.4"/><line x1="-20" y1="18" x2="20" y2="18" stroke="#0006" stroke-width="1.2"/><line x1="0" y1="0" x2="0" y2="36" stroke="#0006" stroke-width="1.2"/><path d="M-14 8 l8 0" stroke="${hazard}" stroke-width="2" opacity="0.7"/></g>`).join('')}
        <!-- galley shelf: stacked ration tins + a hotplate -->
        <g transform="translate(66 128)">
          <rect x="-42" y="0" width="84" height="7" rx="3" fill="${darken(t.panel, 0.16)}" stroke="${steel}" stroke-width="1.2"/>
          ${[-28, -8, 12].map((x, i) => `<rect x="${x}" y="-16" width="16" height="15" rx="2" fill="${i % 2 ? t.trim : darken(t.panel, 0.02)}" stroke="#0006" stroke-width="0.8"/><line x1="${x}" y1="-9" x2="${x + 16}" y2="-9" stroke="#0004" stroke-width="0.8"/>`).join('')}
          <rect x="30" y="-14" width="13" height="13" rx="2" fill="#0b0f18" stroke="${steel}" stroke-width="1"/><circle cx="36.5" cy="-7.5" r="3.4" fill="${t.energy}" opacity="0.8"/>
        </g>
        <!-- the corkboard of postcards from cleared worlds -->
        <g transform="translate(310 74)"><rect x="-42" y="-30" width="84" height="62" rx="4" fill="${darken(t.panel, 0.02)}" stroke="${steel}" stroke-width="1.6"/><rect x="-38" y="-26" width="76" height="54" rx="2" fill="${darken(t.trim, 0.4)}" opacity="0.6"/>
          ${([[-24, -12, -6, 0], [4, -16, 5, 1], [-14, 10, 3, 0], [16, 8, -4, 1]] as [number, number, number, number][]).map(([x, y, r, i]) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-11" y="-8" width="22" height="16" rx="1.6" fill="${i ? hazard : t.glass}" opacity="0.85"/><circle cx="0" cy="-8" r="1.4" fill="${steel}"/></g>`).join('')}</g>
        ${s.close}`);
    }
    case 'weapons': {
      const s = freighterShell(t, u);
      return svg(`${s.open}
        <!-- the rail-mounted deck gun, a serious piece -->
        ${sh(272, 270, 74, 11)}
        <g transform="translate(272 220)">
          <rect x="-64" y="38" width="150" height="9" rx="3" fill="${darken(t.panel, 0.16)}" stroke="${steel}" stroke-width="1.2"/>
          ${[-48, -8, 32, 68].map((x) => `<circle cx="${x}" cy="42.5" r="2" fill="#0008"/>`).join('')}
          <path d="M-14 38 L14 38 L10 14 L-10 14 Z" fill="${darken(t.panel, 0.1)}" stroke="${steel}" stroke-width="1.4"/>
          <g transform="rotate(-22)">
            <rect x="-18" y="-14" width="36" height="34" rx="6" fill="${darken(t.panel, 0.05)}" stroke="${steel}" stroke-width="1.8"/>
            <rect x="14" y="-8" width="88" height="15" rx="4" fill="${darken(t.hull, 0.06)}" stroke="${steel}" stroke-width="1.4"/>
            <rect x="58" y="-11" width="8" height="21" rx="2.4" fill="${steel}"/>
            <rect x="98" y="-10" width="12" height="19" rx="3" fill="${hazard}" opacity="0.9"><animate attributeName="opacity" values="0.6;1;0.6" dur="1.4s" repeatCount="indefinite"/></rect>
            <circle cx="0" cy="2" r="7" fill="#0b0f18" stroke="${steel}" stroke-width="1.4"/><circle cx="0" cy="2" r="2.6" fill="${hazard}"/>
            <path d="M-14 20 L-22 34" stroke="${steel}" stroke-width="4" stroke-linecap="round"/>
          </g>
        </g>
        <!-- ordnance crates, stencilled + strapped -->
        ${([[76, 236, 0], [76, 194, 1], [126, 216, 2]] as [number, number, number][]).map(([x, y, i]) => `${i === 2 ? sh(x, 268, 30, 7) : ''}<g transform="translate(${x} ${y})">
          <rect x="-25" y="-20" width="50" height="42" rx="3.4" fill="${darken(t.panel, 0.04 + i * 0.04)}" stroke="${steel}" stroke-width="1.4"/>
          <line x1="-25" y1="1" x2="25" y2="1" stroke="#0005" stroke-width="1.2"/><rect x="-25" y="-8" width="50" height="5" fill="${i === 0 ? t.trim : hazard}" opacity="0.4"/>
          <text x="0" y="${i === 1 ? 16 : 17}" text-anchor="middle" font-size="12" font-weight="800" fill="${hazard}" opacity="0.9">${i === 1 ? '⚠' : '☢'}</text>
        </g>`).join('')}
        <!-- a shell hoist chain + hook over the crates -->
        <line x1="101" y1="20" x2="101" y2="120" stroke="${steel}" stroke-width="2" stroke-dasharray="5 4"/>
        <path d="M101 120 q-8 8 0 16 q10 -2 6 -12" fill="none" stroke="${steel}" stroke-width="3.4"/>
        <!-- warning klaxon -->
        <g transform="translate(348 140)"><rect x="-8" y="-6" width="16" height="12" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${steel}" stroke-width="1"/><circle cx="0" cy="0" r="4" fill="${hazard}"><animate attributeName="opacity" values="0.3;1;0.3" dur="1s" repeatCount="indefinite"/></circle></g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-fusion-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s = freighterShell(t, u, g);
      return svg(`${s.open}
        <!-- the boxy fusion plant: pipes, gauges, warning lights, coolant glow -->
        ${sh(200, 276, 110, 13)}
        <g transform="translate(200 158)">
          <rect x="-104" y="-64" width="208" height="128" rx="10" fill="${darken(t.panel, 0.12)}" stroke="${steel}" stroke-width="2"/>
          <rect x="-104" y="-64" width="208" height="16" rx="8" fill="${lighten(t.panel, 0.04)}" opacity="0.5"/>
          ${[-84, 84].map((x) => `<line x1="${x}" y1="-58" x2="${x}" y2="58" stroke="#0005" stroke-width="1.4"/>`).join('')}
          <circle cx="0" cy="4" r="48" fill="${darken(t.hull, 0.14)}" stroke="${steel}" stroke-width="2.4"/>
          <circle cx="0" cy="4" r="48" fill="none" stroke="#0007" stroke-width="1"/>
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const a = (d * Math.PI) / 180; return `<circle cx="${(Math.cos(a) * 44).toFixed(1)}" cy="${(4 + Math.sin(a) * 44).toFixed(1)}" r="2" fill="${steel}"/>`; }).join('')}
          <circle cx="0" cy="4" r="34" fill="url(#si-fusion-${u})"><animate attributeName="r" values="32;37;32" dur="2s" repeatCount="indefinite"/></circle>
          <path d="M-12 -6 A 16 16 0 0 1 10 -10" fill="none" stroke="#fff" stroke-width="3" opacity="0.5" stroke-linecap="round"/>
          <!-- flanged pipes off both sides, elbowing to the floor -->
          ${[-1, 1].map((sgn) => `<path d="M${sgn * 104} -28 L${sgn * 138} -28 L${sgn * 138} 70" fill="none" stroke="${darken(t.panel, 0.02)}" stroke-width="11"/><path d="M${sgn * 104} -28 L${sgn * 138} -28 L${sgn * 138} 70" fill="none" stroke="${steel}" stroke-width="2" opacity="0.5"/><rect x="${sgn * 104 - 4}" y="-35" width="8" height="14" rx="2" fill="${steel}"/><rect x="${sgn * 138 - 7}" y="16" width="14" height="6" rx="2" fill="${steel}"/>`).join('')}
          <!-- gauge cluster + blinkers -->
          ${[-78, -56].map((x) => `<circle cx="${x}" cy="-46" r="8" fill="#0b0f18" stroke="${steel}" stroke-width="1.2"/><line x1="${x}" y1="-46" x2="${x + 5}" y2="-51" stroke="${hazard}" stroke-width="1.4"/>`).join('')}
          ${[56, 72, 88].map((x, i) => `<circle cx="${x}" cy="-46" r="4" fill="${i === 1 ? t.trim : hazard}"><animate attributeName="opacity" values="0.35;1;0.35" dur="${(1.1 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
          <text x="0" y="-44" text-anchor="middle" font-size="9" font-weight="800" fill="${hazard}" opacity="0.8">FUSION-9</text>
        </g>
        <!-- coolant drum + a mop leaned against it (a working ship) -->
        ${sh(58, 280, 22, 6)}
        <g transform="translate(58 240)"><rect x="-16" y="0" width="32" height="40" rx="4" fill="${darken(t.panel, 0.06)}" stroke="${steel}" stroke-width="1.4"/><ellipse cx="0" cy="0" rx="16" ry="5" fill="${lighten(t.panel, 0.1)}" stroke="${steel}" stroke-width="1"/><rect x="-16" y="14" width="32" height="6" fill="${hazard}" opacity="0.4"/><line x1="10" y1="-34" x2="22" y2="38" stroke="${darken(t.trim, 0.1)}" stroke-width="3"/><path d="M20 38 q4 8 -6 8 q-6 -2 0 -8" fill="${steel}"/></g>
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = freighterShell(t, u);
      return svg(`${s.open}
        <!-- a wall of stencilled crew lockers -->
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(${40 + i * 60} 52)">
          <rect width="52" height="128" rx="5" fill="${darken(t.panel, 0.06)}" stroke="${steel}" stroke-width="1.6"/>
          <rect x="7" y="10" width="38" height="7" rx="2" fill="${darken(t.hull, 0.12)}"/><rect x="7" y="21" width="38" height="7" rx="2" fill="${darken(t.hull, 0.12)}"/>
          <circle cx="43" cy="72" r="2.6" fill="${i === 2 ? hazard : steel}"/>
          <line x1="26" y1="0" x2="26" y2="128" stroke="#0004" stroke-width="1"/>
          <text x="26" y="112" text-anchor="middle" font-size="10" font-weight="800" fill="${steel}" opacity="0.7">0${i + 1}</text>
          ${i === 1 ? `<rect x="4" y="34" width="44" height="20" rx="2" fill="${hazard}" opacity="0.25"/>` : ''}
        </g>`).join('')}
        <!-- stacked cargo crates, strapped + stencilled -->
        ${sh(320, 278, 48, 9)}
        ${([[298, 240, 0], [344, 240, 1], [320, 202, 2]] as [number, number, number][]).map(([x, y, i]) => `<g transform="translate(${x} ${y})"><rect x="-21" y="-19" width="42" height="40" rx="3" fill="${darken(t.panel, 0.02 + i * 0.05)}" stroke="${steel}" stroke-width="1.4"/><line x1="-21" y1="1" x2="21" y2="1" stroke="#0005" stroke-width="1.2"/><rect x="${i === 2 ? -21 : -6}" y="-19" width="${i === 2 ? 42 : 12}" height="40" fill="${hazard}" opacity="0.2"/><text x="0" y="${8}" text-anchor="middle" font-size="8" font-weight="800" fill="${steel}" opacity="0.8">GS-${(i as number) + 7}</text></g>`).join('')}
        <!-- the golf bag lashed to the crate stack with webbing -->
        ${sh(258, 280, 26, 6)}
        <g transform="translate(258 268)">
          <rect x="-14" y="-62" width="28" height="62" rx="11" fill="${t.trim}" stroke="#0008" stroke-width="1.4"/>
          <rect x="-14" y="-62" width="28" height="16" rx="7" fill="${darken(t.trim, 0.24)}"/>
          ${[-38, -18].map((y) => `<rect x="-17" y="${y}" width="34" height="6" rx="2" fill="${hazard}" opacity="0.7"/>`).join('')}
          ${[-6, 0, 6].map((dx, i) => `<line x1="${dx}" y1="-62" x2="${dx * 1.7}" y2="${-82 - (i % 2) * 6}" stroke="${steel}" stroke-width="2.2"/><path d="M${dx * 1.7 - 3} ${-82 - (i % 2) * 6} l6 0 l-2 5 l-2 0 Z" fill="${lighten(t.trim, 0.2)}"/>`).join('')}
        </g>
        <!-- a hand truck parked by the lockers -->
        <g transform="translate(150 250) rotate(8)"><rect x="-2" y="-44" width="4" height="44" rx="2" fill="${steel}"/><rect x="-16" y="-2" width="30" height="4" rx="2" fill="${steel}"/><circle cx="-2" cy="8" r="7" fill="#0b0f18" stroke="${steel}" stroke-width="2"/></g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ AURORA — the luxury star-yacht ═══════════════════════════ */

function auroraShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const gold = lighten(t.trim, 0.2);
  return {
    open: `<defs>
        <linearGradient id="si-aur-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.16)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.06)}"/></linearGradient>
        <linearGradient id="si-aband-${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${t.energy}" stop-opacity="0"/><stop offset="45%" stop-color="${t.energy}" stop-opacity="0.55"/><stop offset="70%" stop-color="${gold}" stop-opacity="0.5"/><stop offset="100%" stop-color="${t.trim}" stop-opacity="0"/></linearGradient>
        <linearGradient id="si-mirror-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${darken(t.hull, 0.3)}"/><stop offset="55%" stop-color="${darken(t.hull, 0.46)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.28)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="224" fill="url(#si-aur-${u})"/>
      <!-- coffered gold ceiling -->
      <path d="M0 58 Q200 16 400 58 L400 0 L0 0 Z" fill="${darken(t.hull, 0.16)}"/>
      <path d="M0 58 Q200 16 400 58" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.85"/>
      <path d="M0 66 Q200 25 400 66" fill="none" stroke="${gold}" stroke-width="1" opacity="0.4"/>
      ${[60, 140, 260, 340].map((x) => `<circle cx="${x}" cy="${46 - Math.abs(200 - x) * 0.06}" r="2.4" fill="${lighten(t.energy, 0.3)}" opacity="0.8"/>`).join('')}
      <!-- fluted wall pilasters -->
      ${[36, 364].map((x) => `<rect x="${x - 9}" y="52" width="18" height="172" fill="${darken(t.panel, 0.08)}"/><rect x="${x - 9}" y="52" width="4" height="172" fill="#fff" opacity="0.08"/><line x1="${x - 3}" y1="56" x2="${x - 3}" y2="224" stroke="#0005" stroke-width="1"/><line x1="${x + 3}" y1="56" x2="${x + 3}" y2="224" stroke="#0005" stroke-width="1"/><rect x="${x - 12}" y="48" width="24" height="8" rx="3" fill="${gold}" opacity="0.8"/><rect x="${x - 12}" y="216" width="24" height="8" rx="3" fill="${gold}" opacity="0.8"/>`).join('')}
      <!-- living aurora light bands drifting across the ceiling -->
      ${[80, 106, 132].map((y, i) => `<path d="M-40 ${y} Q120 ${y - 24} 240 ${y} T440 ${y}" fill="none" stroke="url(#si-aband-${u})" stroke-width="${10 - i * 2.4}" opacity="0.6"><animate attributeName="d" values="M-40 ${y} Q120 ${y - 24} 240 ${y} T440 ${y};M-40 ${y} Q120 ${y + 18} 240 ${y} T440 ${y};M-40 ${y} Q120 ${y - 24} 240 ${y} T440 ${y}" dur="${(7 + i * 2)}s" repeatCount="indefinite"/></path>`).join('')}
      <!-- mirror-polished floor with soft aurora reflections (background — props draw over) -->
      <rect x="0" y="224" width="400" height="76" fill="url(#si-mirror-${u})"/>
      <path d="M0 224 Q200 216 400 224" fill="none" stroke="${gold}" stroke-width="2.2" opacity="0.85"/>
      ${[110, 200, 290].map((x, i) => `<ellipse cx="${x}" cy="${262 + i * 3}" rx="${34 - i * 5}" ry="24" fill="${t.energy}" opacity="0.07"/>`).join('')}
      <rect x="0" y="224" width="400" height="76" fill="url(#si-aband-${u})" opacity="0.1"/>
      ${[0, 1, 2].map((i) => `<line x1="${60 + i * 120}" y1="230" x2="${52 + i * 120}" y2="300" stroke="#fff" stroke-width="1" opacity="0.05"/>`).join('')}`,
    close: vignette(darken(t.hull, 0.5)),
  };
}

function auroraRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'aurora' + room);
  const gold = lighten(t.trim, 0.25);
  const light = lighten(t.energy, 0.2);
  switch (room) {
    case 'bridge': {
      const s = auroraShell(t, u);
      return svg(`${s.open}
        <!-- the panoramic curved viewport, gold-framed -->
        <path d="M56 128 Q200 60 344 128 L344 142 Q200 76 56 142 Z" fill="#0a1230"/>
        <clipPath id="si-aurclip-${u}"><path d="M56 132 Q200 66 344 132 Z"/></clipPath>
        <g clip-path="url(#si-aurclip-${u})">${stars(56, 64, 288, 70, 34)}<path d="M56 106 Q200 74 344 106" fill="none" stroke="${light}" stroke-width="12" opacity="0.35"/><circle cx="290" cy="98" r="9" fill="${t.glass}" opacity="0.6"/></g>
        <path d="M56 128 Q200 60 344 128" fill="none" stroke="${gold}" stroke-width="3.4"/>
        <path d="M56 142 Q200 76 344 142" fill="none" stroke="${gold}" stroke-width="1.4" opacity="0.6"/>
        <!-- the floating crystal command dais -->
        ${sh(200, 272, 70, 11)}
        <g transform="translate(200 216)">
          <path d="M-62 32 L62 32 L46 4 L-46 4 Z" fill="${darken(t.panel, 0.06)}" stroke="${gold}" stroke-width="1.8"/>
          <path d="M-46 4 L46 4 L34 -12 L-34 -12 Z" fill="${t.energy}" opacity="0.3"/>
          <path d="M-34 -12 L34 -12" stroke="${light}" stroke-width="1.6" opacity="0.8"/>
          ${[-28, -10, 8, 26].map((x, i) => `<rect x="${x - 5}" y="10" width="10" height="12" rx="2.4" fill="${i % 2 ? light : gold}" opacity="0.9" stroke="#0006" stroke-width="0.6"/>`).join('')}
          <ellipse cx="0" cy="32" rx="62" ry="7" fill="${light}" opacity="0.18"/>
          <!-- a holo course-line arcing off the dais -->
          <path d="M0 -14 Q-30 -52 -76 -60" fill="none" stroke="${light}" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.8"/>
          <circle cx="-78" cy="-61" r="3.4" fill="${light}"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/></circle>
        </g>
        <!-- the throne helm chair, wing-backed -->
        ${sh(200, 288, 26, 5)}
        <g transform="translate(200 262)">
          <path d="M-20 20 q-8 -52 20 -56 q28 4 20 56 Z" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.8"/>
          <path d="M-14 16 q-6 -42 14 -46 q20 4 14 46 Z" fill="${darken(t.trim, 0.3)}"/>
          <path d="M-20 -20 q-10 -6 -12 -18 q10 2 14 10 M20 -20 q10 -6 12 -18 q-10 2 -14 10" fill="${gold}" opacity="0.9"/>
          <path d="M0 -38 l-7 -12 l14 0 Z" fill="${gold}"/>
        </g>
        <!-- attendant light-wisps -->
        ${[[96, 190, 0], [310, 182, 1]].map(([x, y, i]) => `<g transform="translate(${x} ${y})"><circle r="5" fill="${light}" opacity="0.85"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(2 + (i as number) * 0.6).toFixed(1)}s" repeatCount="indefinite"/></circle><circle r="10" fill="${light}" opacity="0.15"/><animateTransform attributeName="transform" type="translate" values="${x} ${y};${x} ${(y as number) - 8};${x} ${y}" dur="${(3.4 + (i as number)).toFixed(1)}s" repeatCount="indefinite"/></g>`).join('')}
        ${s.close}`);
    }
    case 'lounge': {
      const s = auroraShell(t, u);
      return svg(`${s.open}
        <!-- the chandelier of captured starlight -->
        <g transform="translate(200 34)">
          <line x1="0" y1="-10" x2="0" y2="14" stroke="${gold}" stroke-width="1.6"/>
          <ellipse cx="0" cy="16" rx="26" ry="6" fill="none" stroke="${gold}" stroke-width="1.8"/>
          ${[0, 60, 120, 180, 240, 300].map((d) => { const a = (d * Math.PI) / 180; const x = Math.cos(a) * 26; const y = 16 + Math.sin(a) * 6; return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + 12).toFixed(1)}" stroke="${gold}" stroke-width="1"/><circle cx="${x.toFixed(1)}" cy="${(y + 15).toFixed(1)}" r="3.4" fill="${light}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(2 + (d % 90) / 40).toFixed(1)}s" repeatCount="indefinite"/></circle>`; }).join('')}
          <circle cx="0" cy="16" r="5" fill="${light}"/><ellipse cx="0" cy="46" rx="44" ry="10" fill="${light}" opacity="0.08"/>
        </g>
        <!-- the grand chaise longue on a dais rug -->
        ${sh(128, 276, 78, 10)}
        <ellipse cx="128" cy="266" rx="86" ry="14" fill="${darken(t.trim, 0.35)}" opacity="0.6"/>
        <g transform="translate(128 228)">
          <path d="M-58 28 L58 28 L58 8 Q58 -4 46 -4 L-46 -4 Q-58 -4 -58 8 Z" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/>
          <path d="M-58 8 Q-72 8 -72 -22 Q-60 -26 -54 -12 Z" fill="${darken(t.trim, 0.16)}" stroke="#0007" stroke-width="1"/>
          <path d="M-50 -4 Q0 -12 50 -4" fill="none" stroke="${lighten(t.trim, 0.25)}" stroke-width="3" opacity="0.7"/>
          <rect x="-44" y="0" width="88" height="6" rx="3" fill="${gold}" opacity="0.7"/>
          ${[-40, 40].map((x) => `<path d="M${x} 28 L${x} 40" stroke="${gold}" stroke-width="3"/><circle cx="${x}" cy="42" r="2.4" fill="${gold}"/>`).join('')}
          <ellipse cx="24" cy="-8" rx="13" ry="8" fill="${light}" opacity="0.85" transform="rotate(-10 24 -8)"/>
        </g>
        <!-- the fountain of liquid light -->
        ${sh(300, 280, 34, 7)}
        <g transform="translate(300 236)">
          <ellipse cx="0" cy="28" rx="34" ry="10" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1.6"/>
          <ellipse cx="0" cy="25" rx="26" ry="6.5" fill="${light}" opacity="0.5"/>
          <path d="M-14 24 L-10 6 L10 6 L14 24 Z" fill="${darken(t.panel, 0.04)}" stroke="${gold}" stroke-width="1.2"/>
          <ellipse cx="0" cy="6" rx="12" ry="4" fill="${gold}"/>
          ${[0, 1, 2].map((i) => `<path d="M0 4 q${i ? (i === 1 ? -16 : 16) : 0} -${22 + i * 5} 0 -${38 + i * 7}" fill="none" stroke="${light}" stroke-width="2.2" opacity="0.75" stroke-linecap="round"><animate attributeName="opacity" values="0.4;0.95;0.4" dur="${(1.8 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}
          ${[[-20, -20, 0], [22, -26, 1]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${light}" opacity="0.9"><animate attributeName="cy" values="${y};${(y as number) + 40}" dur="${(2 + (i as number) * 0.5).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="${(2 + (i as number) * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        </g>
        <!-- a champagne flute table -->
        <g transform="translate(216 258)"><line x1="0" y1="0" x2="0" y2="18" stroke="${gold}" stroke-width="2.4"/><ellipse cx="0" cy="0" rx="16" ry="4.4" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.2"/><g transform="translate(-4 -14)"><path d="M-3 0 L3 0 L2 8 L-2 8 Z" fill="${t.glass}" opacity="0.9"/><line x1="0" y1="8" x2="0" y2="13" stroke="${gold}" stroke-width="1"/><circle cx="0" cy="-1" r="1.4" fill="#fff" opacity="0.8"/></g></g>
        ${s.close}`);
    }
    case 'weapons': {
      const s = auroraShell(t, u);
      return svg(`${s.open}
        <!-- the gilded nova cannon on its display mount, spotlit -->
        <ellipse cx="140" cy="120" rx="60" ry="18" fill="${light}" opacity="0.07"/>
        ${sh(140, 268, 62, 10)}
        <g transform="translate(140 216)">
          <path d="M-44 44 L44 44 L34 24 L-34 24 Z" fill="${darken(t.panel, 0.08)}" stroke="${gold}" stroke-width="1.6"/>
          <path d="M-8 24 L8 24 L5 6 L-5 6 Z" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.2"/>
          <g transform="translate(0 -6) rotate(-18)">
            <rect x="-20" y="-14" width="40" height="30" rx="9" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.8"/>
            <rect x="16" y="-9" width="76" height="18" rx="9" fill="${darken(t.hull, 0.02)}" stroke="${gold}" stroke-width="1.6"/>
            ${[30, 48, 66].map((x) => `<ellipse cx="${x}" cy="0" rx="3" ry="10" fill="none" stroke="${gold}" stroke-width="1.2" opacity="0.7"/>`).join('')}
            <circle cx="94" cy="0" r="13" fill="${light}" opacity="0.4"/><circle cx="94" cy="0" r="8" fill="${light}"><animate attributeName="r" values="7;10;7" dur="2s" repeatCount="indefinite"/></circle>
            <path d="M-14 -8 A 18 12 0 0 1 8 -12" fill="none" stroke="#fff" stroke-width="2.4" opacity="0.5" stroke-linecap="round"/>
          </g>
        </g>
        <!-- the museum case of energy lances -->
        ${sh(306, 272, 44, 8)}
        <g transform="translate(306 156)">
          <rect x="-40" y="-10" width="80" height="118" rx="8" fill="#0b0f18" opacity="0.55" stroke="${gold}" stroke-width="1.8"/>
          <rect x="-34" y="-4" width="68" height="106" rx="5" fill="none" stroke="${light}" stroke-width="0.8" opacity="0.4"/>
          ${[-20, 0, 20].map((x, i) => `<line x1="${x}" y1="8" x2="${x}" y2="92" stroke="${light}" stroke-width="${3.4 - i * 0.5}" opacity="0.85"/><path d="M${x - 4} 8 L${x} -2 L${x + 4} 8 Z" fill="${gold}"/><circle cx="${x}" cy="94" r="2.4" fill="${gold}"/><circle cx="${x}" cy="${30 + i * 14}" r="1.6" fill="#fff" opacity="0.9"><animate attributeName="cy" values="${30 + i * 14};${24 + i * 14};${30 + i * 14}" dur="${(2.4 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
          <rect x="-40" y="104" width="80" height="8" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1"/>
        </g>
        <!-- a laurel crest of crossed clubs on the wall -->
        <g transform="translate(140 96)">
          <path d="M-22 12 Q-30 -6 -16 -18 M22 12 Q30 -6 16 -18" fill="none" stroke="${gold}" stroke-width="2.4"/>
          ${[-1, 1].map((sgn) => `<line x1="${sgn * 14}" y1="10" x2="${sgn * -8}" y2="-14" stroke="${gold}" stroke-width="2"/><path d="M${sgn * -8 - 3} -14 l6 0 l-2 5 l-2 0 Z" fill="${light}"/>`).join('')}
          <circle cx="0" cy="0" r="5" fill="${light}" opacity="0.9"/>
        </g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-phx-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="${light}"/><stop offset="70%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.5)}"/></radialGradient>`;
      const s = auroraShell(t, u, g);
      return svg(`${s.open}
        <!-- the phoenix-wing reactor of living light, on a gold altar plinth -->
        ${sh(200, 280, 70, 10)}
        <g transform="translate(200 258)"><path d="M-56 14 L56 14 L44 -6 L-44 -6 Z" fill="${darken(t.panel, 0.08)}" stroke="${gold}" stroke-width="1.8"/><ellipse cx="0" cy="14" rx="58" ry="6" fill="${light}" opacity="0.15"/></g>
        <g transform="translate(200 154)">
          <ellipse rx="96" ry="88" fill="${t.energy}" opacity="0.12"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="2.8s" repeatCount="indefinite"/></ellipse>
          ${[-1, 1].map((sgn) => `<path d="M0 -8 Q${sgn * 62} -60 ${sgn * 100} -22 Q${sgn * 68} -20 ${sgn * 78} 8 Q${sgn * 52} 0 ${sgn * 42} 26 Q${sgn * 25} 13 0 22 Z" fill="${gold}" opacity="0.55"><animateTransform attributeName="transform" type="rotate" values="${sgn * -3};${sgn * 4};${sgn * -3}" dur="3.4s" repeatCount="indefinite"/></path>
          <path d="M0 -8 Q${sgn * 62} -60 ${sgn * 100} -22" fill="none" stroke="${light}" stroke-width="1.4" opacity="0.6"/>`).join('')}
          <circle r="36" fill="url(#si-phx-${u})"><animate attributeName="r" values="34;40;34" dur="2.8s" repeatCount="indefinite"/></circle>
          <circle r="48" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.8"/>
          <circle r="58" fill="none" stroke="${light}" stroke-width="1" opacity="0.4" stroke-dasharray="3 6"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="20s" repeatCount="indefinite"/></circle>
          <path d="M0 -48 l-7 -13 l14 0 Z" fill="${light}"/>
          ${[[-72, 54, 0], [70, 58, 1], [0, 74, 2]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="2" fill="${light}" opacity="0.9"><animate attributeName="cy" values="${y};${(y as number) - 20}" dur="${(2.2 + (i as number) * 0.5).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="${(2.2 + (i as number) * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        </g>
        <!-- gold conduit filigree carrying the light out along the walls -->
        ${[-1, 1].map((sgn) => `<path d="M${200 + sgn * 96} 154 Q${200 + sgn * 150} 160 ${200 + sgn * 158} 210" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.7"/><path d="M${200 + sgn * 96} 154 Q${200 + sgn * 150} 160 ${200 + sgn * 158} 210" fill="none" stroke="${light}" stroke-width="1" opacity="0.5"><animate attributeName="opacity" values="0.2;0.7;0.2" dur="2.8s" repeatCount="indefinite"/></path>`).join('')}
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = auroraShell(t, u);
      return svg(`${s.open}
        <!-- the gilded wardrobe wall, glass-fronted -->
        ${[0, 1, 2].map((i) => `<g transform="translate(${58 + i * 66} 60)">
          <rect width="56" height="132" rx="7" fill="${darken(t.panel, 0.04)}" stroke="${gold}" stroke-width="1.6"/>
          <rect x="6" y="8" width="44" height="96" rx="4" fill="${t.energy}" opacity="0.14"/>
          <rect x="6" y="8" width="44" height="96" rx="4" fill="none" stroke="${light}" stroke-width="0.8" opacity="0.5"/>
          <line x1="12" y1="14" x2="24" y2="14" stroke="#fff" stroke-width="1.6" opacity="0.3"/>
          ${i === 0 ? `<path d="M28 30 q-10 4 -9 18 l18 0 q1 -14 -9 -18 Z" fill="${t.trim}" opacity="0.9"/><circle cx="28" cy="26" r="4.4" fill="${t.trim}"/>` : ''}
          ${i === 1 ? `<path d="M18 26 L38 26 L36 66 L20 66 Z" fill="${t.trim}" opacity="0.85"/><path d="M18 26 L28 38 L38 26" fill="none" stroke="${gold}" stroke-width="1.2"/>` : ''}
          ${i === 2 ? `<rect x="20" y="28" width="16" height="34" rx="6" fill="${t.trim}" opacity="0.9"/><line x1="24" y1="28" x2="22" y2="16" stroke="${gold}" stroke-width="1.6"/><line x1="32" y1="28" x2="34" y2="16" stroke="${gold}" stroke-width="1.6"/>` : ''}
          <circle cx="48" cy="66" r="2.4" fill="${light}"/><rect x="0" y="104" width="56" height="28" rx="4" fill="${darken(t.panel, 0.14)}" stroke="${gold}" stroke-width="1"/>
        </g>`).join('')}
        <!-- the trophy pedestal under its own beam -->
        <path d="M312 40 L296 200 L344 200 L328 40 Z" fill="${light}" opacity="0.06"/>
        ${sh(320, 276, 30, 7)}
        <g transform="translate(320 216)">
          <rect x="-20" y="40" width="40" height="12" rx="4" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1.2"/>
          <rect x="-14" y="18" width="28" height="24" rx="3" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.2"/>
          <path d="M-11 16 L-5 -6 L5 -6 L11 16 Z" fill="${gold}"/>
          <path d="M-16 -6 Q-17 -22 -7 -22 L7 -22 Q17 -22 16 -6 Z" fill="${light}" opacity="0.6"/>
          <path d="M-16 -6 Q-24 -8 -22 -18 M16 -6 Q24 -8 22 -18" fill="none" stroke="${gold}" stroke-width="2.4"/>
          <ellipse cx="0" cy="-6" rx="12" ry="3.4" fill="${gold}"/><circle cx="-3" cy="-14" r="2" fill="#fff" opacity="0.8"/>
        </g>
        <!-- the golf bag enthroned on a gold stand -->
        ${sh(228, 282, 26, 6)}
        <g transform="translate(228 270)">
          <path d="M-14 8 L14 8 L10 0 L-10 0 Z" fill="${gold}" opacity="0.9"/>
          <rect x="-12" y="-56" width="24" height="56" rx="10" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/>
          <rect x="-12" y="-56" width="24" height="14" rx="6" fill="${gold}"/>
          <path d="M-12 -28 L12 -28 L12 -20 L-12 -20 Z" fill="${light}" opacity="0.5"/>
          ${[-5, 0, 5].map((dx, i) => `<line x1="${dx}" y1="-56" x2="${dx * 1.8}" y2="${-76 - (i % 2) * 5}" stroke="${light}" stroke-width="2.2"/><path d="M${dx * 1.8 - 3} ${-76 - (i % 2) * 5} l6 0 l-2 5 l-2 0 Z" fill="${gold}"/>`).join('')}
        </g>
        ${s.close}`);
    }
  }
}

/* ═══════════════ WYRM — the Coil's grown serpent-hull (herald path, GS-ship-interior-2) ═══════════════ */

function wyrmShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const venom = lighten(t.energy, 0.12);
  const jade = t.trim;
  return {
    open: `<defs>
        <radialGradient id="si-gut-${u}" cx="50%" cy="42%" r="75%"><stop offset="0%" stop-color="${lighten(t.panel, 0.1)}"/><stop offset="70%" stop-color="${darken(t.panel, 0.2)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.4)}"/></radialGradient>
        <linearGradient id="si-scale-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${darken(t.panel, 0.05)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.4)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="url(#si-gut-${u})"/>
      <!-- the dark gullet receding aft -->
      <ellipse cx="200" cy="120" rx="52" ry="66" fill="${darken(t.hull, 0.5)}"/>
      <ellipse cx="200" cy="120" rx="34" ry="46" fill="${darken(t.hull, 0.72)}"/>
      <ellipse cx="200" cy="120" rx="18" ry="26" fill="#020403"/>
      <!-- living rib arches, pale cartilage nested toward the gullet -->
      ${[[196, 0.95, 10], [162, 0.8, 26], [126, 0.62, 44], [92, 0.45, 66]].map(([rx, k, top], i) => `<path d="M${200 - (rx as number)} 244 Q200 ${top} ${200 + (rx as number)} 244" fill="none" stroke="${lighten(t.panel, 0.3 - i * 0.05)}" stroke-width="${13 - i * 2}" opacity="${k}"/>
        <path d="M${200 - (rx as number)} 244 Q200 ${top} ${200 + (rx as number)} 244" fill="none" stroke="#000" stroke-width="${14 - i * 2}" opacity="0.14"/>
        <path d="M${200 - (rx as number)} 244 Q200 ${top} ${200 + (rx as number)} 244" fill="none" stroke="${jade}" stroke-width="1.4" opacity="${(k as number) * 0.55}"/>`).join('')}
      <!-- bioluminescent venom veins crawling the walls -->
      ${[[26, 250, 60, 130, 44, 60], [374, 250, 340, 130, 356, 60]].map(([x0, y0, x1, y1, x2, y2], i) => `<path d="M${x0} ${y0} Q${x1} ${y1} ${x2} ${y2}" fill="none" stroke="${venom}" stroke-width="2.2" opacity="0.6"><animate attributeName="opacity" values="0.3;0.75;0.3" dur="${(2.6 + i * 0.7).toFixed(1)}s" repeatCount="indefinite"/></path><path d="M${(x0 as number) + (i ? -14 : 14)} ${(y0 as number) - 30} q${i ? -12 : 12} -22 ${i ? -4 : 4} -44" fill="none" stroke="${venom}" stroke-width="1.2" opacity="0.4"/>`).join('')}
      <!-- hanging sinew strands off the high ribs -->
      ${[128, 200, 272].map((x, i) => `<path d="M${x} ${34 + Math.abs(200 - x) * 0.12} q${i % 2 ? 5 : -5} 16 0 ${26 + (i % 2) * 8}" fill="none" stroke="${darken(t.panel, 0.16)}" stroke-width="2.4"/><circle cx="${x}" cy="${64 + (i % 2) * 8 + Math.abs(200 - x) * 0.12}" r="3" fill="${venom}" opacity="0.7"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="${(2 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
      <!-- the scale-plated belly floor (background — props draw over) -->
      <path d="M0 244 Q200 218 400 244 L400 300 L0 300 Z" fill="url(#si-scale-${u})"/>
      <path d="M0 244 Q200 218 400 244" fill="none" stroke="${jade}" stroke-width="1.8" opacity="0.5"/>
      ${[0, 1].map((row) => [0, 1, 2, 3, 4, 5].map((i) => { const x = 24 + i * 68 + row * 34; const y = 254 + row * 20 - Math.abs(200 - x) * 0.03; return `<path d="M${x} ${y} q17 -9 34 0 q-17 12 -34 0" fill="${darken(t.panel, 0.26)}" stroke="${jade}" stroke-width="0.8" opacity="0.55"/>`; }).join('')).join('')}`,
    close: vignette('#020604'),
  };
}

function wyrmRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'wyrm' + room);
  const venom = lighten(t.energy, 0.15);
  const jade = t.trim;
  const bone = lighten(t.panel, 0.52);
  switch (room) {
    case 'bridge': {
      const s = wyrmShell(t, u);
      return svg(`${s.open}
        <!-- riding inside the serpent's SKULL: twin eye-socket windows onto space -->
        ${[[112, 0], [288, 1]].map(([cx, m]) => `<g transform="translate(${cx} 110)${m ? ' scale(-1 1)' : ''}">
          <path d="M-52 6 Q-44 -40 6 -34 Q46 -28 44 10 Q40 40 -6 38 Q-48 34 -52 6 Z" fill="${darken(t.hull, 0.7)}" stroke="${bone}" stroke-width="4"/>
          <path d="M-52 6 Q-44 -40 6 -34 Q46 -28 44 10 Q40 40 -6 38 Q-48 34 -52 6 Z" fill="none" stroke="#0009" stroke-width="1.2"/>
          <clipPath id="si-eye${m}-${u}"><path d="M-46 6 Q-39 -34 5 -29 Q40 -24 38 9 Q35 35 -6 33 Q-42 30 -46 6 Z"/></clipPath>
          <g clip-path="url(#si-eye${m}-${u})"><rect x="-52" y="-40" width="104" height="84" fill="#070c1c"/>${stars(-46, -30, 92, 64, 15)}<ellipse cx="10" cy="-4" rx="26" ry="14" fill="${venom}" opacity="0.13"/></g>
          <path d="M-44 -12 Q-20 -30 12 -26" fill="none" stroke="${t.glass}" stroke-width="2" opacity="0.35"/>
        </g>`).join('')}
        <!-- the nasal ridge between the eyes -->
        <path d="M186 84 Q200 74 214 84 L210 158 Q200 168 190 158 Z" fill="${darken(t.panel, 0.22)}" stroke="${bone}" stroke-width="1.6"/>
        <path d="M195 96 L205 96 M193 116 L207 116 M192 136 L208 136" stroke="${bone}" stroke-width="1.4" opacity="0.6"/>
        <!-- the vertebra control stalk, membrane webbed -->
        ${sh(200, 274, 44, 9)}
        <g transform="translate(200 240)">
          ${[0, 1, 2].map((i) => `<ellipse cx="0" cy="${22 - i * 18}" rx="${21 - i * 3}" ry="8" fill="${darken(t.panel, 0.14)}" stroke="${bone}" stroke-width="1.6"/><ellipse cx="0" cy="${19 - i * 18}" rx="${13 - i * 2}" ry="4" fill="${darken(t.panel, 0.02)}" opacity="0.7"/>`).join('')}
          <path d="M-13 -18 Q0 -30 13 -18 L9 -8 Q0 -16 -9 -8 Z" fill="${venom}" opacity="0.5"><animate attributeName="opacity" values="0.3;0.65;0.3" dur="1.8s" repeatCount="indefinite"/></path>
          ${[-1, 1].map((sgn) => `<path d="M${sgn * 14} 18 Q${sgn * 34} 6 ${sgn * 40} -12" fill="none" stroke="${jade}" stroke-width="2.2" opacity="0.7"/><circle cx="${sgn * 41}" cy="-14" r="3.4" fill="${venom}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${sgn > 0 ? 1.5 : 1.9}s" repeatCount="indefinite"/></circle>`).join('')}
        </g>
        <!-- a row of lower teeth cresting the floor line -->
        ${[76, 130, 270, 324].map((x, i) => `<path d="M${x - 8} 246 Q${x} ${218 + (i % 2) * 6} ${x + 8} 246 Z" fill="${bone}" stroke="#0007" stroke-width="1" opacity="0.95"/>`).join('')}
        ${s.close}`);
    }
    case 'lounge': {
      const g = `<radialGradient id="si-hsac-${u}" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="${lighten(t.energy, 0.35)}"/><stop offset="45%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.55)}"/></radialGradient>`;
      const s = wyrmShell(t, u, g);
      return svg(`${s.open}
        <!-- the HEART HOLLOW: a great venom-lit heart-sac suspended in sinew -->
        ${[[152, 42], [248, 42], [200, 30]].map(([x, y]) => `<path d="M${x} ${y} Q${(x as number) < 200 ? (x as number) + 18 : (x as number) - 18} ${(y as number) + 34} 200 96" fill="none" stroke="${darken(t.panel, 0.1)}" stroke-width="3.4"/>`).join('')}
        <g transform="translate(200 138)">
          <ellipse rx="72" ry="66" fill="${t.energy}" opacity="0.1"><animate attributeName="opacity" values="0.06;0.16;0.06" dur="1.6s" repeatCount="indefinite"/></ellipse>
          <path d="M0 44 C-46 12 -44 -34 -16 -38 C-5 -39 0 -28 0 -22 C0 -28 5 -39 16 -38 C44 -34 46 12 0 44 Z" fill="url(#si-hsac-${u})" stroke="${darken(t.energy, 0.4)}" stroke-width="2"><animateTransform attributeName="transform" type="scale" values="1;1.07;1" dur="1.6s" repeatCount="indefinite" additive="sum"/></path>
          <path d="M-18 -20 Q-6 -30 6 -24 M-10 0 Q4 -8 14 2" fill="none" stroke="${lighten(t.energy, 0.4)}" stroke-width="1.6" opacity="0.7"/>
          <path d="M0 44 Q-4 62 -12 74 M0 44 Q6 60 14 72" fill="none" stroke="${venom}" stroke-width="2" opacity="0.6"/>
        </g>
        <!-- the coiled-tail nest to lounge in -->
        ${sh(120, 280, 74, 10)}
        <g transform="translate(120 252)">
          <path d="M-66 8 Q-70 -18 -34 -20 Q0 -22 30 -14 Q66 -6 62 12 Q58 26 20 24 Q-30 22 -50 18 Q-64 16 -66 8 Z" fill="${darken(t.panel, 0.1)}" stroke="${jade}" stroke-width="1.8"/>
          <path d="M-54 2 Q-56 -12 -28 -13 Q4 -14 26 -8 Q50 -2 46 8 Q42 16 12 15 Q-28 13 -44 10 Z" fill="${darken(t.panel, 0.24)}"/>
          ${[-44, -16, 12, 38].map((x) => `<path d="M${x} ${-12 + Math.abs(x) * 0.08} q9 -5 18 0 q-9 7 -18 0" fill="${darken(t.panel, 0.02)}" opacity="0.6"/>`).join('')}
          <path d="M56 10 q16 2 20 -8 q-4 -8 -14 -6" fill="${darken(t.panel, 0.1)}" stroke="${jade}" stroke-width="1.4"/>
        </g>
        <!-- luminous drip-goo stalactites feeding a glow-pool -->
        ${[[306, 58, 0], [336, 74, 1]].map(([x, y, i]) => `<path d="M${x} ${y} q3 12 0 20 q-3 -8 0 -20" fill="${venom}" opacity="0.8"/><circle cx="${x}" cy="${(y as number) + 26}" r="1.8" fill="${venom}"><animate attributeName="cy" values="${(y as number) + 26};${(y as number) + 150}" dur="${(2.8 + (i as number) * 0.9).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="${(2.8 + (i as number) * 0.9).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        ${sh(322, 268, 34, 7)}
        <ellipse cx="322" cy="258" rx="34" ry="9" fill="${darken(t.energy, 0.35)}" stroke="${jade}" stroke-width="1.2" opacity="0.9"/>
        <ellipse cx="322" cy="256" rx="24" ry="5.5" fill="${venom}" opacity="0.55"><animate attributeName="rx" values="22;26;22" dur="2.6s" repeatCount="indefinite"/></ellipse>
        ${s.close}`);
    }
    case 'weapons': {
      const s = wyrmShell(t, u);
      return svg(`${s.open}
        <!-- the FANG ARRAY: harvested fangs racked like torpedoes, plumbed to venom sacs -->
        ${[[92, 0], [308, 1]].map(([cx, m]) => `${sh(cx as number, 272, 40, 8)}<g transform="translate(${cx} 176)${m ? ' scale(-1 1)' : ''}">
          <path d="M-30 -44 Q-40 8 -28 66 L30 74 L30 -52 Z" fill="${darken(t.panel, 0.24)}" stroke="${jade}" stroke-width="1.6" opacity="0.95"/>
          ${[-32, 2, 36].map((y, i) => `<g transform="translate(-4 ${y})">
            <path d="M-20 0 Q4 -10 26 -3 Q10 10 -12 7 Q-18 5 -20 0 Z" fill="${bone}" stroke="#0007" stroke-width="1.2"/>
            <path d="M22 -4 q10 2 14 8" fill="none" stroke="${venom}" stroke-width="2" opacity="0.8"/>
            <circle cx="-16" cy="2" r="2.4" fill="${venom}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(1.4 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></circle>
          </g>`).join('')}
        </g>`).join('')}
        <!-- the central venom-sac feed: a swollen gland dripping into fang lines -->
        ${sh(200, 268, 30, 7)}
        <g transform="translate(200 210)">
          <path d="M0 -34 Q26 -26 24 4 Q22 34 0 38 Q-22 34 -24 4 Q-26 -26 0 -34 Z" fill="${darken(t.energy, 0.3)}" stroke="${jade}" stroke-width="1.6"/>
          <path d="M0 -26 Q18 -20 16 4 Q14 26 0 30 Q-14 26 -16 4 Q-18 -20 0 -26 Z" fill="${t.energy}" opacity="0.55"><animate attributeName="opacity" values="0.35;0.7;0.35" dur="2s" repeatCount="indefinite"/></path>
          <ellipse cx="-5" cy="-10" rx="5" ry="8" fill="${lighten(t.energy, 0.4)}" opacity="0.6"/>
          ${[-1, 1].map((sgn) => `<path d="M${sgn * 20} 12 Q${sgn * 62} 20 ${sgn * 84} -6" fill="none" stroke="${venom}" stroke-width="2.4" opacity="0.7"><animate attributeName="opacity" values="0.4;0.85;0.4" dur="${sgn > 0 ? 1.7 : 2.1}s" repeatCount="indefinite"/></path>`).join('')}
          <path d="M0 38 L0 52" stroke="${venom}" stroke-width="2" opacity="0.7"/>
        </g>
        <!-- the tail-stinger mace mounted overhead, dripping -->
        <g transform="translate(200 58) rotate(-6)">
          <path d="M-58 0 Q-20 -10 12 -4" fill="none" stroke="${darken(t.panel, 0.05)}" stroke-width="7"/>
          ${[-46, -28, -10].map((x) => `<path d="M${x} -3 q5 -4 10 0 q-5 5 -10 0" fill="${darken(t.panel, 0.2)}" opacity="0.8"/>`).join('')}
          <path d="M12 -4 Q34 -8 46 8 Q30 12 18 6 Z" fill="${bone}" stroke="#0007" stroke-width="1.2"/>
          <circle cx="44" cy="9" r="2" fill="${venom}"/><circle cx="46" cy="18" r="1.6" fill="${venom}"><animate attributeName="cy" values="16;30" dur="1.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1.9s" repeatCount="indefinite"/></circle>
        </g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-vcore-${u}" cx="50%" cy="45%" r="58%"><stop offset="0%" stop-color="${lighten(t.energy, 0.5)}"/><stop offset="40%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s = wyrmShell(t, u, g);
      return svg(`${s.open}
        <!-- the VENOM CORE: a pulsing gland caged in ribs, fed by peristaltic ducts -->
        <g transform="translate(200 150)">
          <ellipse rx="86" ry="80" fill="${t.energy}" opacity="0.1"><animate attributeName="opacity" values="0.06;0.18;0.06" dur="1.9s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="46" ry="54" fill="url(#si-vcore-${u})"><animate attributeName="ry" values="52;58;52" dur="1.9s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="46" ry="54" fill="none" stroke="${darken(t.energy, 0.35)}" stroke-width="2"/>
          <ellipse cx="-12" cy="-18" rx="9" ry="14" fill="${lighten(t.energy, 0.5)}" opacity="0.5"/>
          ${[[-30, 10], [26, -6], [4, 30]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${4 - i}" fill="${lighten(t.energy, 0.4)}" opacity="0.8"><animate attributeName="cy" values="${y};${(y as number) - 16};${y}" dur="${(2.2 + i * 0.6).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
          <!-- rib cage clamped over the gland -->
          ${[-1, 1].map((sgn) => [0, 1, 2].map((i) => `<path d="M${sgn * (30 + i * 12)} ${-62 + i * 6} Q${sgn * (58 + i * 10)} ${-20 + i * 8} ${sgn * (34 + i * 10)} ${58 - i * 6}" fill="none" stroke="${bone}" stroke-width="${4.4 - i}" opacity="${0.9 - i * 0.2}"/>`).join('')).join('')}
        </g>
        <!-- peristaltic feed-ducts pumping venom from the floor -->
        ${[[86, 0], [314, 1]].map(([x, i]) => `${sh(x as number, 274, 26, 6)}<g transform="translate(${x} 0)">
          <path d="M0 258 Q${i ? -34 : 34} 220 ${i ? -52 : 52} 178" fill="none" stroke="${darken(t.panel, 0.08)}" stroke-width="12"/>
          <path d="M0 258 Q${i ? -34 : 34} 220 ${i ? -52 : 52} 178" fill="none" stroke="${darken(t.energy, 0.2)}" stroke-width="4" opacity="0.7"/>
          <circle cx="${i ? -10 : 10}" cy="240" r="4" fill="${venom}"><animate attributeName="cx" values="${i ? -4 : 4};${i ? -44 : 44}" dur="1.9s" repeatCount="indefinite"/><animate attributeName="cy" values="250;192" dur="1.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0.2" dur="1.9s" repeatCount="indefinite"/></circle>
          <ellipse cx="0" cy="258" rx="17" ry="6" fill="${darken(t.panel, 0.2)}" stroke="${jade}" stroke-width="1.2"/>
        </g>`).join('')}
        <!-- twitching nerve-endings sparking off the cage -->
        ${[[136, 96, 0], [268, 92, 1]].map(([x, y, i]) => `<path d="M${x} ${y} l${i ? 10 : -10} -8 l${i ? 8 : -8} 4 l${i ? 9 : -9} -7" fill="none" stroke="${venom}" stroke-width="1.4" opacity="0.7"><animate attributeName="opacity" values="0.2;0.9;0.2" dur="${(1.1 + (i as number) * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = wyrmShell(t, u);
      return svg(`${s.open}
        <!-- the SCALE CACHE: lifted belly-scales hinge open as lockers -->
        ${([[86, 118, 0], [166, 104, 1], [246, 104, 2], [326, 118, 3]] as [number, number, number][]).map(([x, y, i]) => `<g transform="translate(${x} ${y})">
          <path d="M-30 -34 Q0 -52 30 -34 Q34 6 0 22 Q-34 6 -30 -34 Z" fill="${darken(t.panel, 0.16)}" stroke="${jade}" stroke-width="1.8"/>
          ${i % 2 === 0
            ? `<path d="M-24 -30 Q0 -44 24 -30 Q27 0 0 14 Q-27 0 -24 -30 Z" fill="${darken(t.hull, 0.55)}"/>
               ${i === 0 ? `<g transform="translate(0 -6)"><rect x="-7" y="-14" width="14" height="26" rx="6" fill="${t.energy}" opacity="0.85"/><rect x="-7" y="-14" width="14" height="7" rx="3.4" fill="${darken(t.energy, 0.3)}"/>${[-3, 2].map((dx) => `<line x1="${dx}" y1="-14" x2="${dx * 1.6}" y2="-24" stroke="${jade}" stroke-width="1.4"/>`).join('')}</g>`
                 : `<g transform="translate(0 -6)">${[-5, 0, 5].map((dx) => `<line x1="${dx}" y1="14" x2="${dx * 1.5}" y2="-16" stroke="${bone}" stroke-width="1.8"/><path d="M${dx * 1.5 - 2.4} -16 l4.8 0 l-1.7 4 l-1.7 0 Z" fill="${venom}"/>`).join('')}</g>`}
               <path d="M-24 -30 Q0 -44 24 -30" fill="none" stroke="${venom}" stroke-width="1.2" opacity="0.6"/>`
            : `<path d="M-24 -30 Q0 -44 24 -30 Q27 0 0 14 Q-27 0 -24 -30 Z" fill="${darken(t.panel, 0.04)}"/>
               <path d="M-14 -26 Q0 -34 14 -26" fill="none" stroke="${lighten(t.panel, 0.2)}" stroke-width="1.6" opacity="0.6"/>
               <circle cx="0" cy="-6" r="3" fill="${venom}" opacity="0.8"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="${(1.8 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></circle>`}
        </g>`).join('')}
        <!-- the golf bag half-swallowed in a membrane pouch, jade straps holding it -->
        ${sh(200, 278, 34, 8)}
        <g transform="translate(200 250)">
          <path d="M-30 24 Q-38 -8 -14 -18 L16 -18 Q40 -8 30 24 Q0 36 -30 24 Z" fill="${darken(t.panel, 0.06)}" stroke="${jade}" stroke-width="1.8" opacity="0.95"/>
          <g transform="translate(0 -22)"><rect x="-13" y="-42" width="26" height="52" rx="10" fill="${t.trim}" stroke="#0008" stroke-width="1.4"/><rect x="-13" y="-42" width="26" height="13" rx="6" fill="${darken(t.trim, 0.28)}"/>${[-6, 0, 6].map((dx, i) => `<line x1="${dx}" y1="-42" x2="${dx * 1.7}" y2="${-60 - (i % 2) * 5}" stroke="${bone}" stroke-width="2.2"/><path d="M${dx * 1.7 - 3} ${-60 - (i % 2) * 5} l6 0 l-2 5 l-2 0 Z" fill="${venom}"/>`).join('')}</g>
          <path d="M-26 8 Q0 -2 26 8" fill="none" stroke="${jade}" stroke-width="2.4" opacity="0.8"/>
          <path d="M-18 18 Q0 10 18 18" fill="none" stroke="${jade}" stroke-width="1.6" opacity="0.6"/>
        </g>
        <!-- watchful venom-light motes -->
        ${[[64, 210, 0], [340, 206, 1]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${venom}" opacity="0.8"><animate attributeName="cy" values="${y};${(y as number) - 10};${y}" dur="${(3 + (i as number)).toFixed(0)}s" repeatCount="indefinite"/></circle>`).join('')}
        ${s.close}`);
    }
  }
}

/* ═══════════ RADIANT — the Warden's celestial cathedral cruiser (warden path, GS-ship-interior-2) ═══════════ */

function radiantShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const gold = darken(t.trim, 0.26); // deep gold — raw trim washes out on the pale marble walls
  const beam = lighten(t.energy, 0.25);
  return {
    open: `<defs>
        <linearGradient id="si-nave-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.glass, 0.55)}"/><stop offset="60%" stop-color="${lighten(t.panel, 0.3)}"/><stop offset="100%" stop-color="${lighten(t.panel, 0.05)}"/></linearGradient>
        <linearGradient id="si-lfloor-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${darken(t.glass, 0.55)}"/><stop offset="100%" stop-color="${darken(t.glass, 0.78)}"/></linearGradient>
        <linearGradient id="si-beam-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${beam}" stop-opacity="0.5"/><stop offset="100%" stop-color="${beam}" stop-opacity="0"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="238" fill="url(#si-nave-${u})"/>
      <!-- vaulted arches receding down the nave -->
      ${[[200, 236, 4], [148, 190, 3], [104, 152, 2]].map(([rx, top, w], i) => `<path d="M${200 - (rx as number)} 238 L${200 - (rx as number)} ${(top as number) + 60} Q200 ${top} ${200 + (rx as number)} ${(top as number) + 60} L${200 + (rx as number)} 238" fill="none" stroke="${gold}" stroke-width="${w}" opacity="${0.75 - i * 0.18}"/>`).join('')}
      <path d="M96 238 L96 208 Q200 148 304 208 L304 238 Z" fill="${lighten(t.panel, 0.42)}" opacity="0.6"/>
      <!-- columns of light falling through the vault -->
      ${[70, 200, 330].map((x, i) => `<path d="M${x - 16} 0 L${x + 16} 0 L${x + 26} 238 L${x - 26} 238 Z" fill="url(#si-beam-${u})" opacity="${0.5 + (i === 1 ? 0.2 : 0)}"/>`).join('')}
      <!-- halo rings floating high in the vault -->
      ${[[130, 40, 26], [270, 40, 26], [200, 24, 34]].map(([x, y, r], i) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r as number) * 0.28}" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.8"><animateTransform attributeName="transform" type="translate" values="0 0;0 ${i % 2 ? 4 : -4};0 0" dur="${(4 + i).toFixed(0)}s" repeatCount="indefinite"/></ellipse><ellipse cx="${x}" cy="${y}" rx="${(r as number) * 0.7}" ry="${(r as number) * 0.18}" fill="none" stroke="${beam}" stroke-width="1" opacity="0.5"/>`).join('')}
      <!-- drifting light-motes -->
      ${[[100, 120, 0], [240, 96, 1], [320, 140, 2], [170, 160, 3]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff" opacity="0.8"><animate attributeName="cy" values="${y};${(y as number) - 14};${y}" dur="${(3.4 + (i as number) * 0.8).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
      <!-- the polished sanctum floor with inlaid gold tracery (background — props draw over) -->
      <rect x="0" y="238" width="400" height="62" fill="url(#si-lfloor-${u})"/>
      <path d="M0 238 L400 238" stroke="${gold}" stroke-width="2.4" opacity="0.9"/>
      <ellipse cx="200" cy="268" rx="150" ry="20" fill="none" stroke="${gold}" stroke-width="1.4" opacity="0.4"/>
      <ellipse cx="200" cy="268" rx="90" ry="12" fill="none" stroke="${beam}" stroke-width="1" opacity="0.4"/>
      ${[70, 200, 330].map((x) => `<ellipse cx="${x}" cy="266" rx="24" ry="6" fill="${beam}" opacity="0.14"/>`).join('')}`,
    close: vignette(darken(t.panel, 0.4)),
  };
}

function radiantRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'radiant' + room);
  const gold = darken(t.trim, 0.26);
  const goldLit = t.trim; // the raw lit gold, for glowing focal pieces
  const beam = lighten(t.energy, 0.25);
  const white = lighten(t.panel, 0.45);
  switch (room) {
    case 'bridge': {
      const s = radiantShell(t, u);
      return svg(`${s.open}
        <!-- the great rose window onto space, the ship's forward eye -->
        <circle cx="200" cy="104" r="62" fill="${darken(t.hull, 0.3)}" stroke="${gold}" stroke-width="4"/>
        <clipPath id="si-rose-${u}"><circle cx="200" cy="104" r="56"/></clipPath>
        <g clip-path="url(#si-rose-${u})"><rect x="138" y="42" width="124" height="124" fill="#070c1c"/>${stars(144, 50, 112, 110, 26)}<ellipse cx="180" cy="96" rx="34" ry="18" fill="${t.energy}" opacity="0.14"/></g>
        ${[0, 45, 90, 135].map((d) => `<line x1="${(200 + Math.cos((d * Math.PI) / 180) * 56).toFixed(1)}" y1="${(104 + Math.sin((d * Math.PI) / 180) * 56).toFixed(1)}" x2="${(200 - Math.cos((d * Math.PI) / 180) * 56).toFixed(1)}" y2="${(104 - Math.sin((d * Math.PI) / 180) * 56).toFixed(1)}" stroke="${gold}" stroke-width="1.6" opacity="0.7"/>`).join('')}
        <circle cx="200" cy="104" r="20" fill="none" stroke="${gold}" stroke-width="1.6" opacity="0.8"/>
        <!-- the altar-helm: a marble console crowned with floating halo interfaces -->
        ${sh(200, 282, 62, 9)}
        <g transform="translate(200 234)">
          <path d="M-52 44 L52 44 L42 10 L-42 10 Z" fill="${white}" stroke="${gold}" stroke-width="2"/>
          <path d="M-42 10 L42 10 L42 18 L-42 18 Z" fill="${gold}" opacity="0.35"/>
          ${[-26, 0, 26].map((x, i) => `<circle cx="${x}" cy="30" r="4.4" fill="${i % 2 ? beam : goldLit}" opacity="0.9"/>`).join('')}
          <ellipse cx="0" cy="2" rx="34" ry="8" fill="none" stroke="${beam}" stroke-width="2" opacity="0.85"><animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="3.4s" repeatCount="indefinite"/></ellipse>
          <ellipse cx="0" cy="-10" rx="22" ry="5" fill="none" stroke="${gold}" stroke-width="1.6" opacity="0.7"><animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" dur="4.2s" repeatCount="indefinite"/></ellipse>
          <circle cx="0" cy="-6" r="3" fill="#fff" opacity="0.9"><animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite"/></circle>
        </g>
        <!-- twin guardian lance-statues flanking the helm -->
        ${[[96, 0], [304, 1]].map(([x, m]) => `${sh(x as number, 280, 24, 6)}<g transform="translate(${x} 214)${m ? ' scale(-1 1)' : ''}">
          <path d="M-12 66 L12 66 L8 54 L-8 54 Z" fill="${white}" stroke="${gold}" stroke-width="1.4"/>
          <path d="M-6 54 Q-8 22 0 12 Q8 22 6 54 Z" fill="${lighten(t.panel, 0.3)}" stroke="${gold}" stroke-width="1.2"/>
          <circle cx="0" cy="6" r="7" fill="${white}" stroke="${gold}" stroke-width="1.2"/>
          <ellipse cx="0" cy="-6" rx="9" ry="2.4" fill="none" stroke="${beam}" stroke-width="1.4"/>
          <line x1="10" y1="60" x2="10" y2="-4" stroke="${gold}" stroke-width="2.4"/><path d="M10 -4 l-4.4 -10 l8.8 0 Z" fill="${beam}"/>
          <path d="M-8 26 q-8 6 -12 16 q10 -2 12 -8" fill="${lighten(t.panel, 0.36)}" opacity="0.9"/>
        </g>`).join('')}
        ${s.close}`);
    }
    case 'lounge': {
      const g = `<radialGradient id="si-well-${u}" cx="50%" cy="42%" r="65%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${beam}"/><stop offset="100%" stop-color="${darken(t.energy, 0.3)}"/></radialGradient>`;
      const s = radiantShell(t, u, g);
      return svg(`${s.open}
        <!-- the LIGHTWELL: a sunken pool of liquid radiance, ringed in gold -->
        ${sh(200, 284, 110, 10)}
        <ellipse cx="200" cy="258" rx="108" ry="26" fill="${white}" stroke="${gold}" stroke-width="2.4"/>
        <ellipse cx="200" cy="256" rx="88" ry="19" fill="${darken(t.panel, 0.3)}"/>
        <ellipse cx="200" cy="256" rx="78" ry="16" fill="url(#si-well-${u})" opacity="0.95"><animate attributeName="ry" values="15;18;15" dur="3.2s" repeatCount="indefinite"/></ellipse>
        <ellipse cx="200" cy="253" rx="40" ry="7" fill="#fff" opacity="0.7"/>
        ${[[168, 250, 0], [232, 258, 1], [204, 246, 2]].map(([x, y, i]) => `<circle cx="${x}" cy="${y}" r="2" fill="#fff" opacity="0.9"><animate attributeName="cy" values="${y};${(y as number) - 34}" dur="${(2.6 + (i as number) * 0.6).toFixed(1)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="${(2.6 + (i as number) * 0.6).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        <!-- curved prayer-benches facing the well -->
        ${[[86, 0], [314, 1]].map(([x, m]) => `${sh(x as number, 272, 40, 8)}<g transform="translate(${x} 240)${m ? ' scale(-1 1)' : ''}">
          <path d="M-34 12 Q0 2 34 12 L34 22 Q0 12 -34 22 Z" fill="${white}" stroke="${gold}" stroke-width="1.6"/>
          <path d="M-30 12 Q-36 -8 -26 -16 L-20 -14 Q-28 -6 -24 10 Z" fill="${lighten(t.panel, 0.3)}" stroke="${gold}" stroke-width="1.2"/>
          ${[-20, 0, 20].map((bx) => `<path d="M${bx} 22 L${bx} 32" stroke="${gold}" stroke-width="2.4"/>`).join('')}
        </g>`).join('')}
        <!-- light-doves wheeling under the vault -->
        ${([[130, 96, 0], [258, 76, 1], [196, 122, 2]] as [number, number, number][]).map(([x, y, i]) => `<g transform="translate(${x} ${y})"><path d="M-8 0 Q-3 -6 0 0 Q3 -6 8 0" fill="none" stroke="#fff" stroke-width="2" opacity="0.9" stroke-linecap="round"><animate attributeName="d" values="M-8 0 Q-3 -6 0 0 Q3 -6 8 0;M-8 -3 Q-3 2 0 -2 Q3 2 8 -3;M-8 0 Q-3 -6 0 0 Q3 -6 8 0" dur="${(0.9 + (i as number) * 0.2).toFixed(1)}s" repeatCount="indefinite"/></path><animateTransform attributeName="transform" type="translate" values="${x} ${y};${(x as number) + (i % 2 ? -16 : 16)} ${(y as number) - 8};${x} ${y}" dur="${(6 + (i as number) * 2).toFixed(0)}s" repeatCount="indefinite"/></g>`).join('')}
        <!-- a chalice of starlight on a slender stand -->
        <g transform="translate(200 208)"><line x1="0" y1="10" x2="0" y2="26" stroke="${gold}" stroke-width="2.4"/><ellipse cx="0" cy="26" rx="10" ry="3" fill="${white}" stroke="${gold}" stroke-width="1"/><path d="M-9 0 Q-9 10 0 10 Q9 10 9 0 Z" fill="${goldLit}"/><ellipse cx="0" cy="0" rx="9" ry="2.6" fill="${beam}"/><circle cx="0" cy="-4" r="2.4" fill="#fff" opacity="0.9"><animate attributeName="cy" values="-3;-7;-3" dur="2.4s" repeatCount="indefinite"/></circle></g>
        ${s.close}`);
    }
    case 'weapons': {
      const s = radiantShell(t, u);
      return svg(`${s.open}
        <!-- the AEGIS VAULT: the great winged shield enshrined in its alcove -->
        <path d="M124 44 Q200 24 276 44 L276 190 L124 190 Z" fill="${lighten(t.panel, 0.24)}" opacity="0.6"/>
        <path d="M124 44 Q200 24 276 44" fill="none" stroke="${gold}" stroke-width="2.4"/>
        ${sh(200, 272, 54, 9)}
        <g transform="translate(200 128)">
          <path d="M0 -44 Q34 -36 44 -14 Q44 30 0 52 Q-44 30 -44 -14 Q-34 -36 0 -44 Z" fill="${white}" stroke="${gold}" stroke-width="3.4"/>
          <path d="M0 -34 Q26 -28 34 -10 Q34 22 0 40 Q-34 22 -34 -10 Q-26 -28 0 -34 Z" fill="none" stroke="${gold}" stroke-width="1.4" opacity="0.7"/>
          <circle cx="0" cy="0" r="10" fill="${goldLit}"/><circle cx="-3" cy="-3" r="3.4" fill="#fff" opacity="0.8"/>
          <path d="M0 -30 L0 30 M-26 0 L26 0" stroke="${gold}" stroke-width="1.6" opacity="0.6"/>
          ${[-1, 1].map((sgn) => `<path d="M${sgn * 40} -18 Q${sgn * 78} -34 ${sgn * 92} -6 Q${sgn * 66} -12 ${sgn * 56} 2 Q${sgn * 74} 6 ${sgn * 78} 22 Q${sgn * 52} 12 ${sgn * 42} 20 Z" fill="${lighten(t.panel, 0.36)}" stroke="${gold}" stroke-width="1.6" opacity="0.95"/>`).join('')}
          <path d="M0 52 L0 108" stroke="${gold}" stroke-width="2.4" opacity="0.7"/>
        </g>
        <!-- consecrated light-lances racked either side -->
        ${[[92, 0], [308, 1]].map(([x, m]) => `${sh(x as number, 276, 30, 7)}<g transform="translate(${x} 0)${m ? ' scale(-1 1) translate(-616 0)' : ''}">
          <rect x="-26" y="258" width="52" height="9" rx="4" fill="${white}" stroke="${gold}" stroke-width="1.2"/>
          ${[-14, 0, 14].map((dx, i) => `<line x1="${dx}" y1="258" x2="${dx}" y2="164" stroke="${i === 1 ? beam : gold}" stroke-width="${i === 1 ? 3 : 2.2}" opacity="0.9"/><path d="M${dx - 4} 164 L${dx} 150 L${dx + 4} 164 Z" fill="${beam}"/><circle cx="${dx}" cy="${196 + i * 12}" r="1.6" fill="#fff" opacity="0.9"><animate attributeName="cy" values="${196 + i * 12};${188 + i * 12};${196 + i * 12}" dur="${(2 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        </g>`).join('')}
        <!-- a ward-sigil burning over the vault arch -->
        <g transform="translate(200 34)"><circle r="10" fill="none" stroke="${beam}" stroke-width="1.6" opacity="0.9"/><path d="M0 -6 L5 3 L-5 3 Z" fill="${beam}" opacity="0.9"/><circle r="15" fill="${beam}" opacity="0.12"><animate attributeName="r" values="13;18;13" dur="2.6s" repeatCount="indefinite"/></circle></g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-halo-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${beam}"/><stop offset="100%" stop-color="${darken(t.energy, 0.35)}"/></radialGradient>`;
      const s = radiantShell(t, u, g);
      return svg(`${s.open}
        <!-- the HALO DRIVE: a captive sun ringed by a great spinning halo -->
        ${sh(200, 278, 60, 9)}
        <g transform="translate(200 258)"><path d="M-48 12 L48 12 L38 -4 L-38 -4 Z" fill="${white}" stroke="${gold}" stroke-width="1.8"/><ellipse cx="0" cy="12" rx="50" ry="6" fill="${beam}" opacity="0.2"/></g>
        <g transform="translate(200 148)">
          <circle r="84" fill="${t.energy}" opacity="0.1"><animate attributeName="opacity" values="0.06;0.16;0.06" dur="3s" repeatCount="indefinite"/></circle>
          <circle r="34" fill="url(#si-halo-${u})"><animate attributeName="r" values="32;37;32" dur="3s" repeatCount="indefinite"/></circle>
          <circle cx="-10" cy="-10" r="9" fill="#fff" opacity="0.6"/>
          <!-- the great halo, edge-on, spinning -->
          <ellipse rx="78" ry="20" fill="none" stroke="${goldLit}" stroke-width="4.4" opacity="0.95"><animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="6s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="78" ry="20" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.5"/>
          <ellipse rx="56" ry="46" fill="none" stroke="${beam}" stroke-width="1.4" opacity="0.55" stroke-dasharray="4 7"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="16s" repeatCount="indefinite"/></ellipse>
          <!-- orbiting seraph-spark -->
          <g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite"/><circle cx="66" cy="0" r="4" fill="#fff"/><circle cx="66" cy="0" r="8" fill="#fff" opacity="0.25"/></g>
          <!-- rays through the vault -->
          ${[20, 70, 110, 160].map((d, i) => { const a = (d * Math.PI) / 180; return `<line x1="${(Math.cos(a) * 44).toFixed(1)}" y1="${(-Math.sin(a) * 44).toFixed(1)}" x2="${(Math.cos(a) * 72).toFixed(1)}" y2="${(-Math.sin(a) * 72).toFixed(1)}" stroke="#fff" stroke-width="1.6" opacity="0.5"><animate attributeName="opacity" values="0.2;0.7;0.2" dur="${(2 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></line>`; }).join('')}
        </g>
        <!-- gold reliquary conduits kneeling to the drive -->
        ${[[92, 0], [308, 1]].map(([x, i]) => `${sh(x as number, 276, 22, 6)}<g transform="translate(${x} 230)">
          <path d="M-14 46 L14 46 L10 0 L-10 0 Z" fill="${white}" stroke="${gold}" stroke-width="1.6"/>
          <ellipse cx="0" cy="0" rx="12" ry="4" fill="${gold}" opacity="0.9"/>
          <path d="M0 -2 Q${i ? -46 : 46} -22 ${i ? -74 : 74} -58" fill="none" stroke="${gold}" stroke-width="2.4" opacity="0.7"/>
          <circle cx="0" cy="-6" r="2.4" fill="#fff"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(1.8 + (i as number) * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>
        </g>`).join('')}
        ${s.close}`);
    }
    case 'locker':
    default: {
      const s = radiantShell(t, u);
      return svg(`${s.open}
        <!-- the RELIQUARY: arched marble cabinets holding the champion's effects -->
        ${[0, 1, 2].map((i) => `<g transform="translate(${70 + i * 74} 96)">
          <path d="M-27 96 L-27 10 Q0 -18 27 10 L27 96 Z" fill="${white}" stroke="${gold}" stroke-width="2"/>
          <path d="M-20 90 L-20 14 Q0 -8 20 14 L20 90 Z" fill="${darken(t.panel, 0.14)}"/>
          ${i === 0 ? `<g transform="translate(0 46)"><path d="M-9 -12 A9 9 0 0 1 9 -12 L9 -6 Q0 -2 -9 -6 Z" fill="${t.energy}" opacity="0.9"/><rect x="-8" y="-12" width="16" height="5" rx="2.4" fill="${t.glass}"/><path d="M-6 6 L6 6 L4 18 L-4 18 Z" fill="${t.energy}" opacity="0.7"/></g>` : ''}
          ${i === 1 ? `<g transform="translate(0 44)"><path d="M-10 -16 Q-10 -4 0 -2 Q10 -4 10 -16 Z" fill="${gold}"/><path d="M-14 -16 Q-18 -10 -10 -7 M14 -16 Q18 -10 10 -7" fill="none" stroke="${gold}" stroke-width="1.8"/><rect x="-2" y="-2" width="4" height="8" fill="${gold}"/><rect x="-8" y="6" width="16" height="5" rx="2" fill="${white}"/></g>` : ''}
          ${i === 2 ? `<g transform="translate(0 46)">${[-5, 0, 5].map((dx) => `<line x1="${dx}" y1="20" x2="${dx * 1.6}" y2="-18" stroke="${gold}" stroke-width="2"/><path d="M${dx * 1.6 - 2.6} -18 l5.2 0 l-1.8 4.4 l-1.8 0 Z" fill="${beam}"/>`).join('')}</g>` : ''}
          <circle cx="0" cy="-22" r="2.4" fill="${beam}"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(2 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>
          <rect x="-27" y="96" width="54" height="8" rx="3" fill="${gold}" opacity="0.5"/>
        </g>`).join('')}
        <!-- the golf bag enshrined on the high plinth, haloed -->
        ${sh(322, 280, 30, 7)}
        <g transform="translate(322 252)">
          <path d="M-24 28 L24 28 L18 8 L-18 8 Z" fill="${white}" stroke="${gold}" stroke-width="1.8"/>
          <ellipse cx="0" cy="-78" rx="26" ry="7" fill="none" stroke="${beam}" stroke-width="2" opacity="0.85"><animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="3.4s" repeatCount="indefinite"/></ellipse>
          <rect x="-13" y="-52" width="26" height="60" rx="11" fill="${t.trim}" stroke="#0007" stroke-width="1.2"/>
          <rect x="-13" y="-52" width="26" height="14" rx="6" fill="${darken(t.trim, 0.2)}"/>
          <path d="M-13 -26 L13 -26 L13 -18 L-13 -18 Z" fill="${beam}" opacity="0.5"/>
          ${[-5, 0, 5].map((dx, i) => `<line x1="${dx}" y1="-52" x2="${dx * 1.7}" y2="${-70 - (i % 2) * 5}" stroke="${lighten(t.trim, 0.3)}" stroke-width="2"/><path d="M${dx * 1.7 - 2.6} ${-70 - (i % 2) * 5} l5.2 0 l-1.8 4.4 l-1.8 0 Z" fill="${gold}"/>`).join('')}
        </g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ dispatch ═══════════════════════════ */

/** The SVG backdrop for a ship room, drawn in the flown ship's CABIN STYLE + palette. */
export function shipRoomArt(room: ShipRoom, t: ShipTheme): string {
  switch (t.style) {
    case 'disc':
      return discRoom(room, t);
    case 'steed':
      return steedRoom(room, t);
    case 'bike':
      return bikeRoom(room, t);
    case 'freighter':
      return freighterRoom(room, t);
    case 'aurora':
      return auroraRoom(room, t);
    case 'wyrm':
      return wyrmRoom(room, t);
    case 'radiant':
      return radiantRoom(room, t);
    case 'auto':
    default:
      return autoRoom(room, t);
  }
}

/** Base display label + icon for each room (nav bar / header) — the generic fallback. */
export const SHIP_ROOM_META: Record<ShipRoom, { icon: string; label: string }> = {
  bridge: { icon: '🧭', label: 'Bridge' },
  lounge: { icon: '🛋', label: 'Lounge' },
  weapons: { icon: '🔫', label: 'Weapons' },
  engine: { icon: '⚛', label: 'Engine' },
  locker: { icon: '🎒', label: 'Locker' },
};

/** Per-cabin-style room NAMES — so a Pegasus's helm reads "Saddle", a saucer's "Helm Pod", a bike's
 *  "Handlebars", not a generic "Bridge". Keeps the room ICON, flavours the LABEL. */
const ROOM_LABELS: Record<CabinStyle, Record<ShipRoom, string>> = {
  auto: { bridge: 'Cockpit', lounge: 'Back Seat', weapons: 'Trunk', engine: 'Hood', locker: 'Boot' },
  disc: { bridge: 'Helm Pod', lounge: 'Bubble Deck', weapons: 'Beam Array', engine: 'Antigrav Core', locker: 'Stasis Bay' },
  steed: { bridge: 'Saddle', lounge: 'The Nest', weapons: 'Panoply', engine: 'Star-Heart', locker: 'Saddlebags' },
  bike: { bridge: 'Handlebars', lounge: 'Pit Stop', weapons: 'Gun Forks', engine: 'V-Twin', locker: 'Panniers' },
  freighter: { bridge: 'Flight Deck', lounge: 'The Mess', weapons: 'Cargo Bay', engine: 'Reactor', locker: 'Cargo Hold' },
  aurora: { bridge: 'Grand Helm', lounge: 'Salon', weapons: 'Nova Battery', engine: 'Phoenix Heart', locker: 'Vault' },
  wyrm: { bridge: 'Skull Helm', lounge: 'Heart Hollow', weapons: 'Fang Array', engine: 'Venom Core', locker: 'Scale Cache' },
  radiant: { bridge: 'Sanctum Helm', lounge: 'Lightwell', weapons: 'Aegis Vault', engine: 'Halo Drive', locker: 'Reliquary' },
};

/** The room's display label + icon, flavoured to the cabin. Accepts a CABIN STYLE (preferred — carries
 *  per-ship overrides, pass `theme.style`) or a raw hull KIND (folded via `cabinStyleOf`; kinds and style
 *  names never collide). */
export function shipRoomMeta(room: ShipRoom, styleOrKind: string): { icon: string; label: string } {
  const style = (ALL_CABINS as readonly string[]).includes(styleOrKind) ? (styleOrKind as CabinStyle) : cabinStyleOf(styleOrKind);
  return { icon: SHIP_ROOM_META[room].icon, label: ROOM_LABELS[style][room] };
}
