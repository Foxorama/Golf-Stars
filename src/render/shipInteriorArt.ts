/**
 * SHIP INTERIOR backdrops (GS-story-ship-interior) — the illustrated rooms you walk through inside your
 * ship on a long trip: BRIDGE (the helm + a viewport onto space), LOUNGE (a rec room), WEAPONS bay,
 * ENGINE bay (the reactor), and the LOCKER room. Each is an SVG scene (viewBox 0 0 400 300) tinted to the
 * FLOWN ship's own palette (`shipInteriorTheme` reads the hull/accent/flame/glass colours off `ShipLook`),
 * so a woody wagon, a carbon racer, an alien saucer and the infernal Firebird all feel like different
 * vessels for free. Hand-placed, byte-stable, own `si-*` gradient ids. Pure render.
 */

import { shipById, DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import type { ShipRoom } from '../ui/gameState';

export interface ShipTheme {
  kind: string;
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

/** Mix a #rrggbb hex toward black by `k` (0 = unchanged, 1 = black). */
function darken(hex: string, k: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - k));
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - k));
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - k));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Derive the interior palette from the flown ship's cosmetic look — so each ship's rooms feel distinct. */
export function shipInteriorTheme(shipId: string | undefined): ShipTheme {
  const look = (shipById(shipId ?? '') ?? shipById(DEFAULT_SHIP_ID)!).look;
  return {
    kind: look.kind,
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

/** A short, stable id-safe token from the theme so co-mounted SVGs never share gradient ids (per the
 *  document-global-id gotcha) — and the preview harness renders every ship's true wall tint. */
function themeUid(t: ShipTheme): string {
  let h = 2166136261;
  for (const s of [t.hull, t.panel, t.trim, t.energy, t.kind]) for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return (h >>> 0).toString(36);
}

/** The shared room shell: back wall, floor, side conduits, ceiling glow — all in the ship's palette. The
 *  `si-*` gradient ids are suffixed per-theme so multiple room SVGs can co-mount without cross-bleeding. */
function shell(t: ShipTheme, extraDefs = ''): { open: string; close: string; uid: string } {
  const u = themeUid(t);
  return {
    uid: u,
    open: `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="position:absolute;inset:0;">
      <defs>
        <linearGradient id="si-wall-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${t.hull}"/></linearGradient>
        <linearGradient id="si-floor-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${darken(t.hull, 0.3)}"/></linearGradient>
        <radialGradient id="si-glow-${u}" cx="50%" cy="0%" r="90%"><stop offset="0%" stop-color="${t.energy}" stop-opacity="0.24"/><stop offset="100%" stop-color="${t.energy}" stop-opacity="0"/></radialGradient>
        ${extraDefs}
      </defs>
      <rect width="400" height="222" fill="url(#si-wall-${u})"/>
      ${[46, 176].map((y) => `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#00000033" stroke-width="1.4"/>`).join('')}
      <rect x="0" y="0" width="10" height="222" fill="${darken(t.hull, 0.25)}"/><rect x="390" y="0" width="10" height="222" fill="${darken(t.hull, 0.25)}"/>
      <rect x="10" y="0" width="3" height="222" fill="${t.trim}" opacity="0.35"/><rect x="387" y="0" width="3" height="222" fill="${t.trim}" opacity="0.35"/>
      <ellipse cx="200" cy="140" rx="180" ry="100" fill="url(#si-glow-${u})"/>`,
    close: `<rect x="0" y="222" width="400" height="78" fill="url(#si-floor-${u})"/>
      <line x1="0" y1="222" x2="400" y2="222" stroke="${t.trim}" stroke-width="1.4" opacity="0.4"/>
      ${[70, 200, 330].map((x) => `<line x1="${x}" y1="222" x2="${x - 24}" y2="300" stroke="#00000030" stroke-width="1.2"/>`).join('')}
    </svg>`,
  };
}

function bridge(t: ShipTheme): string {
  const s = shell(t);
  return `${s.open}
    <!-- big forward viewport onto space -->
    <rect x="70" y="26" width="260" height="112" rx="10" fill="#060a18"/>
    <rect x="74" y="30" width="252" height="104" rx="8" fill="#0a1230"/>
    ${stars(80, 34, 240, 96, 30)}
    <ellipse cx="150" cy="70" rx="46" ry="30" fill="${t.energy}" opacity="0.14"/>
    <circle cx="250" cy="96" r="12" fill="${t.trim}" opacity="0.5"/><ellipse cx="250" cy="96" rx="22" ry="6" fill="none" stroke="${t.trim}" stroke-width="1" opacity="0.5"/>
    <rect x="70" y="26" width="260" height="112" rx="10" fill="none" stroke="${t.trim}" stroke-width="3"/>
    <!-- helm console + captain's chair -->
    <path d="M120 176 L280 176 L300 210 L100 210 Z" fill="${darken(t.panel, 0.15)}" stroke="${t.trim}" stroke-width="1.4"/>
    ${[140, 170, 200, 230, 260].map((x, i) => `<rect x="${x - 8}" y="184" width="16" height="10" rx="2" fill="${i % 2 ? t.energy : t.trim}" opacity="0.7"/>`).join('')}
    <ellipse cx="200" cy="216" rx="20" ry="6" fill="#0006"/>
    <path d="M188 214 q-4 -26 12 -30 q16 4 12 30 Z" fill="${darken(t.panel, 0.1)}"/><rect x="186" y="196" width="28" height="8" rx="4" fill="${t.trim}" opacity="0.7"/>
    ${s.close}`;
}

function lounge(t: ShipTheme): string {
  const s = shell(t);
  return `${s.open}
    <!-- porthole -->
    <circle cx="316" cy="80" r="42" fill="#060a18"/><circle cx="316" cy="80" r="38" fill="#0a1230"/>
    ${stars(284, 48, 64, 64, 12)}<circle cx="330" cy="66" r="9" fill="${t.energy}" opacity="0.4"/>
    <circle cx="316" cy="80" r="42" fill="none" stroke="${t.trim}" stroke-width="3"/>
    <!-- a couch + low table + a plant -->
    <rect x="40" y="150" width="150" height="30" rx="10" fill="${t.trim}" opacity="0.8"/>
    <rect x="40" y="132" width="150" height="26" rx="10" fill="${darken(t.trim, 0.2)}"/>
    <rect x="210" y="170" width="70" height="10" rx="4" fill="${darken(t.panel, 0.1)}"/><rect x="240" y="180" width="8" height="26" fill="${darken(t.panel, 0.2)}"/>
    <!-- neon "LOUNGE" strip + a glowing drink -->
    <rect x="150" y="40" width="100" height="18" rx="9" fill="#0008" stroke="${t.energy}" stroke-width="1.4"/>
    <text x="200" y="53" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="12" fill="${t.energy}">Rec Deck</text>
    <g transform="translate(255 150)"><path d="M-6 -14 L6 -14 L4 0 L-4 0 Z" fill="${t.energy}" opacity="0.8"/><ellipse cx="0" cy="0" rx="5" ry="1.6" fill="#0c0906"/></g>
    <g transform="translate(300 175)"><rect x="-6" y="-30" width="12" height="30" rx="3" fill="#2f6b3a"/><path d="M0 -30 q-14 -10 -6 -26 q10 6 6 26" fill="#3fae5c"/><path d="M0 -28 q14 -8 6 -24 q-10 6 -6 24" fill="#4fd06c"/></g>
    ${s.close}`;
}

function weapons(t: ShipTheme): string {
  const s = shell(t);
  return `${s.open}
    <!-- an armory wall: turret mounts + a rack of shells -->
    <rect x="40" y="40" width="150" height="120" rx="8" fill="${darken(t.hull, 0.2)}" stroke="${t.trim}" stroke-width="1.4"/>
    ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${64 + c * 34}" cy="${68 + r * 34}" r="9" fill="${darken(t.panel, 0.2)}" stroke="${t.trim}" stroke-width="1"/><circle cx="${64 + c * 34}" cy="${68 + r * 34}" r="3.4" fill="${t.energy}" opacity="0.8"/>`).join('')).join('')}
    <!-- a big cannon barrel on a mount -->
    <g transform="translate(300 130)">
      <rect x="-14" y="-8" width="28" height="26" rx="6" fill="${darken(t.panel, 0.1)}" stroke="${t.trim}" stroke-width="1.2"/>
      <rect x="4" y="-4" width="86" height="12" rx="4" fill="${darken(t.hull, 0.1)}" stroke="${t.trim}" stroke-width="1"/>
      <rect x="86" y="-6" width="10" height="16" rx="3" fill="${t.energy}" opacity="0.85"/>
      <circle cx="0" cy="26" r="10" fill="${darken(t.panel, 0.25)}"/>
    </g>
    <rect x="150" y="40" width="120" height="18" rx="9" fill="#0008" stroke="${t.energy}" stroke-width="1.4"/>
    <text x="210" y="53" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="12" fill="${t.energy}">Weapons Bay</text>
    ${s.close}`;
}

function engine(t: ShipTheme): string {
  const s = shell(
    t,
    `<radialGradient id="si-core-${themeUid(t)}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`,
  );
  return `${s.open}
    <!-- the reactor CORE: a pulsing sphere in a caged ring, plasma conduits feeding it -->
    <g transform="translate(200 120)">
      <ellipse rx="70" ry="70" fill="${t.energy}" opacity="0.14"><animate attributeName="opacity" values="0.1;0.22;0.1" dur="2.4s" repeatCount="indefinite"/></ellipse>
      <circle r="42" fill="url(#si-core-${s.uid})"><animate attributeName="r" values="42;46;42" dur="2.4s" repeatCount="indefinite"/></circle>
      <circle r="54" fill="none" stroke="${t.trim}" stroke-width="3" opacity="0.7"/>
      <ellipse rx="66" ry="20" fill="none" stroke="${t.trim}" stroke-width="2" opacity="0.5"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite"/></ellipse>
      <ellipse rx="20" ry="66" fill="none" stroke="${t.trim}" stroke-width="2" opacity="0.5"/>
    </g>
    <!-- conduits from the walls -->
    ${[60, 340].map((x) => `<path d="M${x} 176 L${x} 120 Q${x} 108 ${x < 200 ? x + 20 : x - 20} 108" fill="none" stroke="${t.energy}" stroke-width="4" opacity="0.55"/>`).join('')}
    <rect x="150" y="34" width="100" height="18" rx="9" fill="#0008" stroke="${t.energy}" stroke-width="1.4"/>
    <text x="200" y="47" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="12" fill="${t.energy}">Engine Core</text>
    ${s.close}`;
}

function locker(t: ShipTheme): string {
  const s = shell(t);
  return `${s.open}
    <!-- a bank of lockers + a gear bench -->
    ${[0, 1, 2, 3].map((i) => `<g transform="translate(${44 + i * 74} 46)">
      <rect x="0" y="0" width="62" height="120" rx="6" fill="${darken(t.hull, 0.15)}" stroke="${t.trim}" stroke-width="1.4"/>
      <rect x="8" y="10" width="46" height="16" rx="3" fill="${darken(t.panel, 0.2)}"/>
      <circle cx="52" cy="70" r="2.6" fill="${t.energy}" opacity="0.8"/>
      <rect x="6" y="60" width="50" height="2" fill="#0004"/>
    </g>`).join('')}
    <rect x="40" y="182" width="320" height="10" rx="4" fill="${darken(t.panel, 0.05)}"/>
    <rect x="150" y="30" width="100" height="16" rx="8" fill="#0008" stroke="${t.trim}" stroke-width="1.2"/>
    <text x="200" y="42" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="11" fill="${t.trim}">Locker Room</text>
    ${s.close}`;
}

/** The SVG backdrop for a ship room, tinted to the flown ship's palette. */
export function shipRoomArt(room: ShipRoom, t: ShipTheme): string {
  switch (room) {
    case 'lounge':
      return lounge(t);
    case 'weapons':
      return weapons(t);
    case 'engine':
      return engine(t);
    case 'locker':
      return locker(t);
    case 'bridge':
    default:
      return bridge(t);
  }
}

/** Display label + icon for each room (nav bar). */
export const SHIP_ROOM_META: Record<ShipRoom, { icon: string; label: string }> = {
  bridge: { icon: '🧭', label: 'Bridge' },
  lounge: { icon: '🛋', label: 'Lounge' },
  weapons: { icon: '🔫', label: 'Weapons' },
  engine: { icon: '⚛', label: 'Engine' },
  locker: { icon: '🎒', label: 'Locker' },
};
