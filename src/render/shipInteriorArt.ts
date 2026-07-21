/**
 * SHIP INTERIOR backdrops (GS-story-ship-interior + GS-ship-interior-variety) — the illustrated rooms you
 * walk through inside your ship on a long trip: BRIDGE (the helm), LOUNGE (a rec room), WEAPONS bay, ENGINE
 * bay (the reactor), and the LOCKER room. Each is an SVG scene (viewBox 0 0 400 300).
 *
 * GS-ship-interior-variety: an interior is no longer ONE shared layout recoloured — each ship FAMILY gets a
 * genuinely different cabin, so a station wagon, a little-green-caddie saucer, the Mothership, the Pegasus
 * war-steed, a space chopper and the Infinity Ace yacht all feel like different vessels, not the same room
 * in five paint jobs. `cabinStyleOf(look.kind)` folds the 11 hull kinds into six CABIN STYLES — `auto`
 * (wheeled road-trip cabins), `disc` (alien saucers), `steed` (the living winged Pegasus), `bike` (open
 * single-rider frames), `freighter` (industrial haulers) and `aurora` (the luxury star-yacht) — and each
 * style draws its OWN shell + its own take on all five rooms. Every scene is still tinted to the flown
 * ship's palette (`shipInteriorTheme` reads hull/accent/flame/glass off `ShipLook`), so the woody wagon and
 * the infernal Firebird are distinct WITHIN the auto style too. Hand-placed, byte-stable (no rng), own
 * per-theme/room `si-*` gradient ids. Pure render.
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

/** The six interior archetypes a ship's rooms are drawn in — folded from the hull `kind`. */
export type CabinStyle = 'auto' | 'disc' | 'steed' | 'bike' | 'freighter' | 'aurora';

/** Fold a hull `kind` into its cabin style. A new ship kind picks up a fitting interior for free. */
export function cabinStyleOf(kind: string): CabinStyle {
  switch (kind) {
    case 'saucer':
    case 'ufo':
      return 'disc';
    case 'pegasus':
      return 'steed';
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

/** A short, stable id-safe token from the theme + room so co-mounted SVGs never share gradient ids (per
 *  the document-global-id gotcha) — and the preview harness renders every ship's true wall tint. */
function themeUid(t: ShipTheme, salt = ''): string {
  let h = 2166136261;
  for (const s of [t.hull, t.panel, t.trim, t.energy, t.kind, salt]) for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return (h >>> 0).toString(36);
}

/** SVG wrapper open/close — shared frame; the body is style-specific. */
function svg(inner: string): string {
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="position:absolute;inset:0;">${inner}</svg>`;
}

/* ═══════════════════════════ AUTO — the wheeled road-trip cabin ═══════════════════════════ */

function autoShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  return {
    open: `<defs>
        <linearGradient id="si-wall-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.08)}"/><stop offset="100%" stop-color="${t.hull}"/></linearGradient>
        <linearGradient id="si-floor-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${darken(t.hull, 0.3)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="222" fill="url(#si-wall-${u})"/>
      <!-- headliner strip -->
      <rect x="0" y="0" width="400" height="20" fill="${darken(t.hull, 0.2)}"/><line x1="0" y1="20" x2="400" y2="20" stroke="${t.trim}" stroke-width="1.4" opacity="0.5"/>
      <!-- quilted door panels down each side -->
      ${[8, 372].map((x) => `<rect x="${x}" y="26" width="20" height="180" rx="6" fill="${darken(t.panel, 0.16)}" stroke="${t.trim}" stroke-width="1" opacity="0.85"/>${[0, 1, 2, 3].map((i) => `<line x1="${x}" y1="${52 + i * 40}" x2="${x + 20}" y2="${52 + i * 40}" stroke="#0004" stroke-width="1"/>`).join('')}`).join('')}`,
    close: `<!-- carpeted floor + transmission tunnel -->
      <rect x="0" y="222" width="400" height="78" fill="url(#si-floor-${u})"/>
      <path d="M170 222 L230 222 L246 300 L154 300 Z" fill="${darken(t.hull, 0.15)}" stroke="${t.trim}" stroke-width="1" opacity="0.6"/>
      <line x1="0" y1="222" x2="400" y2="222" stroke="${t.trim}" stroke-width="1.4" opacity="0.5"/>`,
  };
}

function autoRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'auto' + room);
  const s = autoShell(t, u);
  const chrome = lighten(t.trim, 0.3);
  switch (room) {
    case 'bridge': {
      return svg(`${s.open}
        <!-- windshield onto space -->
        <rect x="40" y="30" width="320" height="96" rx="14" fill="#060a18"/><rect x="46" y="35" width="308" height="86" rx="11" fill="#0a1230"/>
        ${stars(56, 40, 288, 76, 34)}<ellipse cx="130" cy="72" rx="52" ry="28" fill="${t.energy}" opacity="0.12"/>
        <line x1="200" y1="30" x2="200" y2="126" stroke="${darken(t.hull, 0.1)}" stroke-width="4"/>
        <rect x="40" y="30" width="320" height="96" rx="14" fill="none" stroke="${chrome}" stroke-width="3"/>
        <!-- rear-view mirror + fuzzy dice -->
        <rect x="184" y="20" width="32" height="10" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1"/>
        <line x1="200" y1="30" x2="200" y2="44" stroke="${t.trim}" stroke-width="1.4"/>
        <rect x="193" y="44" width="7" height="7" rx="1.5" transform="rotate(45 196.5 47.5)" fill="${t.energy}"/><rect x="200" y="46" width="6" height="6" rx="1.5" transform="rotate(45 203 49)" fill="${lighten(t.energy, 0.2)}"/>
        <!-- padded dashboard + dials + steering yoke -->
        <path d="M20 150 Q200 132 380 150 L380 204 L20 204 Z" fill="${darken(t.panel, 0.12)}" stroke="${chrome}" stroke-width="1.4"/>
        ${[120, 160, 240, 280].map((x, i) => `<circle cx="${x}" cy="172" r="13" fill="#0b0f18" stroke="${chrome}" stroke-width="1.4"/><circle cx="${x}" cy="172" r="9" fill="none" stroke="${t.energy}" stroke-width="1.6" opacity="0.75"/><line x1="${x}" y1="172" x2="${x + (i % 2 ? 5 : -5)}" y2="166" stroke="${t.energy}" stroke-width="1.6"/>`).join('')}
        <rect x="190" y="160" width="20" height="10" rx="2" fill="${t.energy}" opacity="0.7"/>
        <g transform="translate(200 198)"><circle r="24" fill="none" stroke="#0b0f18" stroke-width="8"/><circle r="24" fill="none" stroke="${chrome}" stroke-width="3"/><circle r="6" fill="${darken(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1.4"/><line x1="-24" y1="0" x2="24" y2="0" stroke="${chrome}" stroke-width="3"/><line x1="0" y1="0" x2="0" y2="24" stroke="${chrome}" stroke-width="3"/></g>
        ${s.close}`);
    }
    case 'lounge': {
      return svg(`${s.open}
        <!-- rear porthole + a road-trip map pinned up -->
        <circle cx="330" cy="70" r="34" fill="#060a18"/><circle cx="330" cy="70" r="30" fill="#0a1230"/>${stars(304, 46, 52, 48, 10)}<circle cx="330" cy="70" r="34" fill="none" stroke="${chrome}" stroke-width="3"/>
        <g transform="translate(50 40)"><rect width="92" height="66" rx="3" fill="${lighten(t.panel, 0.15)}" stroke="${chrome}" stroke-width="1.2"/>
          <path d="M8 54 Q30 20 50 34 T84 12" fill="none" stroke="${t.energy}" stroke-width="1.6" stroke-dasharray="3 3"/>${[[12, 50], [50, 32], [82, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${t.trim}"/>`).join('')}</g>
        <!-- bench seat + a cooler + a hanging air-freshener -->
        <rect x="40" y="150" width="200" height="30" rx="10" fill="${t.trim}" opacity="0.85"/><rect x="40" y="130" width="200" height="26" rx="10" fill="${darken(t.trim, 0.24)}"/>
        ${[70, 120, 170, 210].map((x) => `<line x1="${x}" y1="132" x2="${x}" y2="178" stroke="#0003" stroke-width="1.4"/>`).join('')}
        <g transform="translate(300 150)"><rect x="-24" y="0" width="48" height="34" rx="4" fill="${darken(t.panel, 0.05)}" stroke="${chrome}" stroke-width="1.2"/><rect x="-24" y="-6" width="48" height="8" rx="3" fill="${lighten(t.panel, 0.1)}"/><text x="0" y="24" text-anchor="middle" font-size="9" font-weight="800" fill="${t.energy}">SNACKS</text></g>
        <g transform="translate(190 22)"><line x1="0" y1="0" x2="0" y2="18" stroke="${t.trim}" stroke-width="1"/><path d="M0 18 l-9 22 l18 0 Z" fill="${t.energy}" opacity="0.85"/></g>
        ${s.close}`);
    }
    case 'weapons': {
      return svg(`${s.open}
        <!-- the tailgate/trunk thrown open into an armory rack -->
        <path d="M40 34 L360 34 L340 60 L60 60 Z" fill="${darken(t.hull, 0.1)}" stroke="${chrome}" stroke-width="1.4"/>
        <rect x="52" y="62" width="296" height="120" rx="8" fill="${darken(t.hull, 0.22)}" stroke="${chrome}" stroke-width="1.4"/>
        <!-- a rack of racked blasters slotted into the boot -->
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(${78 + i * 62} 78)"><rect x="-6" y="0" width="12" height="86" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${chrome}" stroke-width="1"/><rect x="-14" y="6" width="28" height="12" rx="3" fill="${t.trim}"/><rect x="8" y="9" width="26" height="6" rx="2" fill="${darken(t.panel, 0.1)}"/><circle cx="0" cy="70" r="3.4" fill="${t.energy}" opacity="0.85"/></g>`).join('')}
        <!-- a shell/ammo tool chest -->
        <g transform="translate(300 150)"><rect x="-30" y="0" width="60" height="34" rx="4" fill="${darken(t.panel, 0.15)}" stroke="${chrome}" stroke-width="1.2"/>${[0, 1, 2].map((i) => `<rect x="${-24 + i * 18}" y="8" width="12" height="18" rx="2" fill="${t.energy}" opacity="0.7"/>`).join('')}</g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-core-${u}" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s2 = autoShell(t, u, g);
      return svg(`${s2.open}
        <!-- the hood thrown up, a glowing V-block reactor exposed -->
        <path d="M60 26 L340 26 L360 44 L40 44 Z" fill="${darken(t.hull, 0.1)}" stroke="${chrome}" stroke-width="1.4"/>
        <line x1="200" y1="26" x2="200" y2="10" stroke="${t.trim}" stroke-width="2"/>
        <g transform="translate(200 128)">
          <rect x="-96" y="-40" width="192" height="86" rx="10" fill="${darken(t.panel, 0.12)}" stroke="${chrome}" stroke-width="1.6"/>
          <!-- plasma manifold pipes -->
          ${[-64, -22, 22, 64].map((x) => `<rect x="${x - 9}" y="-56" width="18" height="20" rx="4" fill="${darken(t.panel, 0.05)}" stroke="${chrome}" stroke-width="1"/><rect x="${x - 6}" y="-58" width="12" height="6" rx="2" fill="${t.energy}" opacity="0.85"/>`).join('')}
          <ellipse cx="0" cy="4" rx="46" ry="30" fill="url(#si-core-${u})"><animate attributeName="rx" values="44;50;44" dur="2.3s" repeatCount="indefinite"/></ellipse>
          <ellipse cx="0" cy="4" rx="60" ry="40" fill="none" stroke="${t.energy}" stroke-width="2" opacity="0.4"/>
          ${[-70, 70].map((x) => `<rect x="${x - 5}" y="-6" width="10" height="52" rx="4" fill="${darken(t.panel, 0.05)}"/>`).join('')}
        </g>
        ${s2.close}`);
    }
    case 'locker':
    default: {
      return svg(`${s.open}
        <!-- a garage pegboard of tools + toolbox lockers + the golf bag in the boot -->
        <rect x="30" y="40" width="150" height="120" rx="4" fill="${darken(t.hull, 0.15)}" stroke="${chrome}" stroke-width="1.4"/>
        ${([[52, 66], [88, 62], [126, 70], [58, 110], [104, 116], [146, 108]] as [number, number][]).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#0006"/><path d="M${x} ${y + 4} l0 26 M${x - 6} ${y + 30} l12 0" stroke="${t.trim}" stroke-width="2" opacity="0.7"/>`).join('')}
        ${[0, 1, 2].map((i) => `<g transform="translate(${210 + i * 56} 46)"><rect width="46" height="120" rx="5" fill="${darken(t.hull, 0.12)}" stroke="${chrome}" stroke-width="1.2"/><rect x="6" y="10" width="34" height="12" rx="2" fill="${darken(t.panel, 0.2)}"/><circle cx="38" cy="66" r="2.4" fill="${t.energy}" opacity="0.8"/></g>`).join('')}
        <!-- staff golf bag propped in the corner -->
        <g transform="translate(70 178)"><rect x="-10" y="-46" width="20" height="46" rx="9" fill="${t.trim}"/><rect x="-10" y="-52" width="20" height="12" rx="5" fill="${darken(t.trim, 0.2)}"/>${[-4, 0, 4].map((dx) => `<line x1="${dx}" y1="-52" x2="${dx * 2}" y2="-70" stroke="${chrome}" stroke-width="2"/><circle cx="${dx * 2}" cy="-70" r="2.4" fill="${t.energy}"/>`).join('')}</g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ DISC — the alien saucer pod ═══════════════════════════ */

function discShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  return {
    open: `<defs>
        <radialGradient id="si-dome-${u}" cx="50%" cy="8%" r="120%"><stop offset="0%" stop-color="${lighten(t.panel, 0.18)}"/><stop offset="55%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${t.hull}"/></radialGradient>
        <radialGradient id="si-ring-${u}" cx="50%" cy="100%" r="90%"><stop offset="0%" stop-color="${t.energy}" stop-opacity="0.5"/><stop offset="100%" stop-color="${t.energy}" stop-opacity="0"/></radialGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="${t.hull}"/>
      <!-- domed ceiling: concentric curved seams -->
      <path d="M-30 210 Q200 -80 430 210 Z" fill="url(#si-dome-${u})"/>
      ${[0.32, 0.5, 0.68, 0.86].map((k) => `<path d="M${20 + 180 * k} 210 Q200 ${210 - 300 * (1 - k)} ${380 - 180 * k} 210" fill="none" stroke="${t.trim}" stroke-width="1.2" opacity="${0.5 - k * 0.3}"/>`).join('')}
      <!-- glass dome band showing space -->
      <path d="M40 96 Q200 -34 360 96 L360 108 Q200 -18 40 108 Z" fill="#0a1230" opacity="0.9"/>
      <clipPath id="si-domeclip-${u}"><path d="M40 100 Q200 -26 360 100 Z"/></clipPath>
      <g clip-path="url(#si-domeclip-${u})">${stars(40, 8, 320, 92, 40)}</g>`,
    close: `<!-- circular glowing deck ring -->
      <ellipse cx="200" cy="252" rx="230" ry="70" fill="${darken(t.hull, 0.25)}"/>
      <ellipse cx="200" cy="240" rx="176" ry="48" fill="none" stroke="${t.trim}" stroke-width="2" opacity="0.6"/>
      <ellipse cx="200" cy="240" rx="120" ry="32" fill="none" stroke="${t.energy}" stroke-width="1.6" opacity="0.6"/>
      <ellipse cx="200" cy="252" rx="230" ry="70" fill="url(#si-ring-${u})"/>`,
  };
}

/** A hovering control orb (byte-stable bob). */
function orb(x: number, y: number, r: number, col: string, phase: number): string {
  return `<g><circle cx="${x}" cy="${y}" r="${r + 3}" fill="${col}" opacity="0.18"/><circle cx="${x}" cy="${y}" r="${r}" fill="${col}"><animate attributeName="cy" values="${y};${y - 4};${y}" dur="${(2.4 + phase * 0.3).toFixed(1)}s" repeatCount="indefinite"/></circle></g>`;
}

function discRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'disc' + room);
  const s = discShell(t, u);
  const glow = lighten(t.energy, 0.15);
  switch (room) {
    case 'bridge': {
      return svg(`${s.open}
        <!-- a raised central pilot pod under the dome, ringed by a holo console -->
        <ellipse cx="200" cy="196" rx="150" ry="40" fill="none" stroke="${t.trim}" stroke-width="1.6" opacity="0.5"/>
        <g transform="translate(200 150)">
          <ellipse cx="0" cy="52" rx="56" ry="20" fill="${darken(t.panel, 0.08)}" stroke="${t.trim}" stroke-width="1.6"/>
          <path d="M-38 44 Q0 8 38 44 L34 54 Q0 22 -34 54 Z" fill="${t.glass}" opacity="0.35"/>
          <ellipse cx="0" cy="44" rx="42" ry="14" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.8"/>
          ${[-30, -10, 10, 30].map((x, i) => `<rect x="${x - 4}" y="40" width="8" height="8" rx="2" fill="${i % 2 ? glow : t.trim}" opacity="0.85"/>`).join('')}
          <!-- pilot seat pod -->
          <path d="M-16 44 q-6 -34 16 -38 q22 4 16 38 Z" fill="${darken(t.panel, 0.05)}" stroke="${t.trim}" stroke-width="1.2"/>
        </g>
        <!-- floating holo readouts -->
        ${orb(96, 140, 9, glow, 0)}${orb(304, 132, 7, t.trim, 1)}${orb(120, 96, 5, glow, 2)}
        ${s.close}`);
    }
    case 'lounge': {
      return svg(`${s.open}
        <!-- a glowing plasma pool sunk into the deck, ringed by a curved bench -->
        <ellipse cx="200" cy="210" rx="90" ry="30" fill="${darken(t.energy, 0.4)}"/>
        <ellipse cx="200" cy="206" rx="74" ry="22" fill="${t.energy}" opacity="0.7"><animate attributeName="ry" values="20;24;20" dur="3s" repeatCount="indefinite"/></ellipse>
        <ellipse cx="200" cy="204" rx="42" ry="12" fill="${glow}" opacity="0.9"/>
        <path d="M96 196 Q200 158 304 196" fill="none" stroke="${t.trim}" stroke-width="10" opacity="0.7"/>
        <path d="M96 196 Q200 158 304 196" fill="none" stroke="${lighten(t.trim, 0.2)}" stroke-width="3" opacity="0.8"/>
        <!-- a bubbling lava-lamp column + floating cushions -->
        <g transform="translate(322 120)"><rect x="-9" y="0" width="18" height="86" rx="9" fill="#0b0f18" stroke="${t.trim}" stroke-width="1.2"/>${[70, 46, 24].map((y, i) => `<circle cx="${i % 2 ? 3 : -3}" cy="${y}" r="${5 - i}" fill="${t.energy}" opacity="0.8"><animate attributeName="cy" values="${y};${y - 40};${y}" dur="${(4 + i).toFixed(0)}s" repeatCount="indefinite"/></circle>`).join('')}</g>
        ${[110, 288].map((x, i) => `<ellipse cx="${x}" cy="${150 - i * 6}" rx="16" ry="8" fill="${t.trim}" opacity="0.75"><animate attributeName="cy" values="${150 - i * 6};${144 - i * 6};${150 - i * 6}" dur="${(3 + i).toFixed(0)}s" repeatCount="indefinite"/></ellipse>`).join('')}
        ${s.close}`);
    }
    case 'weapons': {
      return svg(`${s.open}
        <!-- a targeting orb ringed by orbiting ray-emitter nodes -->
        <g transform="translate(200 150)">
          <ellipse rx="118" ry="42" fill="none" stroke="${t.trim}" stroke-width="1.4" opacity="0.5"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="16s" repeatCount="indefinite"/></ellipse>
          ${[0, 60, 120, 180, 240, 300].map((deg) => { const a = (deg * Math.PI) / 180; const x = Math.cos(a) * 118; const y = Math.sin(a) * 42; return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect x="-8" y="-6" width="16" height="12" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${t.trim}" stroke-width="1"/><circle r="3" fill="${glow}"/></g>`; }).join('')}
          <circle r="30" fill="${darken(t.energy, 0.45)}"/><circle r="22" fill="${t.energy}" opacity="0.8"><animate attributeName="r" values="20;24;20" dur="1.8s" repeatCount="indefinite"/></circle><circle r="10" fill="${glow}"/>
          <line x1="-30" y1="0" x2="30" y2="0" stroke="${glow}" stroke-width="1" opacity="0.6"/><line x1="0" y1="-30" x2="0" y2="30" stroke="${glow}" stroke-width="1" opacity="0.6"/>
        </g>
        <!-- underside tractor-beam emitter -->
        <path d="M170 216 L230 216 L214 250 L186 250 Z" fill="${t.energy}" opacity="0.28"/>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-anti-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="40%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s2 = discShell(t, u, g);
      return svg(`${s2.open}
        <!-- the antigrav core: a levitating sphere caged by spinning gyro rings -->
        <g transform="translate(200 152)">
          <ellipse rx="80" ry="80" fill="${t.energy}" opacity="0.12"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="2.6s" repeatCount="indefinite"/></ellipse>
          <circle r="40" fill="url(#si-anti-${u})"><animate attributeName="r" values="40;45;40" dur="2.6s" repeatCount="indefinite"/></circle>
          <ellipse rx="66" ry="24" fill="none" stroke="${t.trim}" stroke-width="2.4" opacity="0.7"><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="66" ry="24" fill="none" stroke="${glow}" stroke-width="1.6" opacity="0.6"><animateTransform attributeName="transform" type="rotate" from="60" to="420" dur="10s" repeatCount="indefinite"/></ellipse>
          <ellipse rx="24" ry="66" fill="none" stroke="${t.trim}" stroke-width="2" opacity="0.55"/>
        </g>
        <!-- gravity tethers to the deck -->
        ${[120, 280].map((x) => `<path d="M${x} 236 Q${x} 190 200 176" fill="none" stroke="${t.energy}" stroke-width="3" opacity="0.5"/>`).join('')}
        ${s2.close}`);
    }
    case 'locker':
    default: {
      return svg(`${s.open}
        <!-- a curved wall of glowing stasis tubes -->
        ${[0, 1, 2, 3, 4].map((i) => { const x = 70 + i * 66; const y = 150 - Math.abs(i - 2) * 8; return `<g transform="translate(${x} ${y})"><rect x="-16" y="-52" width="32" height="104" rx="16" fill="${darken(t.panel, 0.08)}" stroke="${t.trim}" stroke-width="1.4"/><rect x="-11" y="-46" width="22" height="92" rx="11" fill="${t.energy}" opacity="0.28"/><ellipse cx="0" cy="0" rx="8" ry="16" fill="${glow}" opacity="0.5"/><circle cx="0" cy="-44" r="3" fill="${glow}"/></g>`; }).join('')}
        <!-- a specimen bag on a hover-pad -->
        <g transform="translate(200 210)"><ellipse cx="0" cy="6" rx="20" ry="5" fill="${t.energy}" opacity="0.4"/><rect x="-10" y="-40" width="20" height="42" rx="9" fill="${t.trim}"/>${[-4, 0, 4].map((dx) => `<line x1="${dx}" y1="-42" x2="${dx * 2}" y2="-58" stroke="${lighten(t.trim, 0.3)}" stroke-width="2"/>`).join('')}</g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ STEED — the living winged Pegasus ═══════════════════════════ */

function steedShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const gold = lighten(t.trim, 0.15);
  return {
    open: `<defs>
        <linearGradient id="si-sky-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a0f28"/><stop offset="100%" stop-color="${darken(t.hull, 0.1)}"/></linearGradient>
        <linearGradient id="si-hide-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${darken(t.hull, 0.2)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="url(#si-sky-${u})"/>
      ${stars(0, 0, 400, 200, 46)}
      <!-- two great wings framing the open sky -->
      <path d="M-10 240 Q30 60 120 30 Q70 90 80 220 Z" fill="${lighten(t.panel, 0.1)}" opacity="0.95"/>
      <path d="M410 240 Q370 60 280 30 Q330 90 320 220 Z" fill="${lighten(t.panel, 0.1)}" opacity="0.95"/>
      ${([[-10, 240, 120, 30], [410, 240, 280, 30]] as [number, number, number, number][]).map(([x0, y0, x1, y1]) => [0.28, 0.5, 0.72].map((k) => `<path d="M${x0 + (x1 - x0) * 0.12} ${y0 - (y0 - 130) * k} Q${x0 + (x1 - x0) * 0.5} ${y0 - (y0 - 60) * k} ${x0 + (x1 - x0) * (0.62 + k * 0.2)} ${y1 + 40 * k}" fill="none" stroke="${gold}" stroke-width="1.2" opacity="0.5"/>`).join('')).join('')}`,
    close: `<!-- the steed's broad back: a bronze saddle plate over a hide blanket -->
      <path d="M40 210 Q200 188 360 210 L400 300 L0 300 Z" fill="url(#si-hide-${u})"/>
      <path d="M40 210 Q200 188 360 210" fill="none" stroke="${gold}" stroke-width="2" opacity="0.7"/>
      ${[80, 160, 240, 320].map((x) => `<path d="M${x} 224 q6 8 0 16 q-6 -8 0 -16" fill="${gold}" opacity="0.5"/>`).join('')}
      <path d="M120 236 Q200 224 280 236 L296 300 L104 300 Z" fill="${t.trim}" opacity="0.85"/>
      <path d="M120 236 Q200 224 280 236" fill="none" stroke="${gold}" stroke-width="1.6"/>`,
  };
}

function steedRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'steed' + room);
  const s = steedShell(t, u);
  const gold = lighten(t.trim, 0.2);
  const mane = lighten(t.energy, 0.1);
  switch (room) {
    case 'bridge': {
      return svg(`${s.open}
        <!-- the steed's neck + streaming star-mane rising ahead, reins in hand -->
        <path d="M175 210 Q168 150 150 96 Q146 70 172 52 Q150 78 165 120 Q176 168 205 210 Z" fill="${lighten(t.panel, 0.12)}"/>
        <path d="M150 96 Q120 70 108 40 M158 84 Q132 54 128 26 M168 74 Q150 44 152 18 M176 66 Q168 40 178 16" fill="none" stroke="${mane}" stroke-width="3" opacity="0.85" stroke-linecap="round"/>
        ${stars(108, 12, 90, 80, 10)}
        <!-- bridle + reins to the saddle-horn -->
        <path d="M150 92 Q170 96 176 60" fill="none" stroke="${gold}" stroke-width="2"/>
        <path d="M172 60 Q220 130 250 200 M168 66 Q214 134 244 202" fill="none" stroke="${darken(t.trim, 0.1)}" stroke-width="2.4"/>
        <!-- the saddle-horn -->
        <g transform="translate(250 206)"><path d="M-14 0 q0 -22 14 -24 q14 2 14 24 Z" fill="${t.trim}" stroke="${gold}" stroke-width="1.6"/><circle cx="0" cy="-18" r="5" fill="${gold}"/></g>
        ${s.close}`);
    }
    case 'lounge': {
      return svg(`${s.open}
        <!-- a nest of furs + a warm brazier + a horn of mead between the wings -->
        <ellipse cx="200" cy="212" rx="120" ry="30" fill="${darken(t.trim, 0.15)}"/>
        ${[0, 1, 2, 3, 4].map((i) => `<path d="M${120 + i * 40} 214 q10 -14 20 0 q-10 6 -20 0" fill="${lighten(t.trim, 0.15 + i * 0.04)}" opacity="0.9"/>`).join('')}
        <g transform="translate(300 176)"><ellipse cx="0" cy="30" rx="26" ry="8" fill="#0007"/><path d="M-20 30 L20 30 L14 6 L-14 6 Z" fill="${darken(t.panel, 0.05)}" stroke="${gold}" stroke-width="1.4"/><ellipse cx="0" cy="6" rx="14" ry="4" fill="${darken(t.panel, 0.1)}"/>
          ${[-6, 0, 6].map((dx, i) => `<path d="M${dx} 2 q${dx === 0 ? 0 : dx / 2} -18 0 -30" fill="none" stroke="${mane}" stroke-width="${4 - i}" opacity="0.85" stroke-linecap="round"><animate attributeName="opacity" values="0.6;0.95;0.6" dur="${(1.6 + i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}</g>
        <!-- a drinking horn on the fur -->
        <g transform="translate(120 196)"><path d="M-2 0 q-24 4 -34 -14 q22 6 34 4 Z" fill="${gold}" stroke="${darken(t.trim, 0.2)}" stroke-width="1"/><ellipse cx="-2" cy="-2" rx="4" ry="6" fill="${mane}" opacity="0.6"/></g>
        ${s.close}`);
    }
    case 'weapons': {
      return svg(`${s.open}
        <!-- a panoply slung on the flank: lances in a rack, a round shield, runes aglow -->
        <g transform="translate(96 150)"><circle r="46" fill="${darken(t.panel, 0.05)}" stroke="${gold}" stroke-width="3"/><circle r="34" fill="none" stroke="${gold}" stroke-width="1.6" opacity="0.7"/><circle r="10" fill="${gold}"/>${[0, 60, 120, 180, 240, 300].map((d) => { const a = (d * Math.PI) / 180; return `<line x1="${(Math.cos(a) * 12).toFixed(1)}" y1="${(Math.sin(a) * 12).toFixed(1)}" x2="${(Math.cos(a) * 44).toFixed(1)}" y2="${(Math.sin(a) * 44).toFixed(1)}" stroke="${gold}" stroke-width="2" opacity="0.6"/>`; }).join('')}</g>
        <!-- a rack of lances -->
        ${[250, 280, 310].map((x, i) => `<g transform="translate(${x} 70) rotate(${(i - 1) * 8} 0 0)"><rect x="-2" y="0" width="4" height="120" rx="2" fill="${darken(t.trim, 0.1)}"/><path d="M0 -14 l7 16 l-14 0 Z" fill="${gold}"/><rect x="-5" y="30" width="10" height="6" rx="2" fill="${t.trim}"/></g>`).join('')}
        <rect x="236" y="188" width="90" height="8" rx="4" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1"/>
        <!-- glowing runes -->
        ${([[160, 96], [186, 120], [162, 140]] as [number, number][]).map(([x, y], i) => `<path d="M${x} ${y - 8} l0 16 m0 -12 l7 5 m-7 -5 l-7 5" stroke="${mane}" stroke-width="2" fill="none" opacity="0.85"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(2 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-heart-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="${mane}"/><stop offset="70%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.55)}"/></radialGradient>`;
      const s2 = steedShell(t, u, g);
      return svg(`${s2.open}
        <!-- the steed's blazing star-HEART, glowing through the chest between the wings -->
        <g transform="translate(200 148)">
          <ellipse rx="86" ry="86" fill="${t.energy}" opacity="0.14"><animate attributeName="opacity" values="0.1;0.24;0.1" dur="1.4s" repeatCount="indefinite"/></ellipse>
          <path d="M0 40 C-52 6 -46 -40 -16 -40 C-4 -40 0 -28 0 -22 C0 -28 4 -40 16 -40 C46 -40 52 6 0 40 Z" fill="url(#si-heart-${u})"><animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="1.4s" repeatCount="indefinite" additive="sum"/></path>
          <path d="M0 40 C-52 6 -46 -40 -16 -40 C-4 -40 0 -28 0 -22 C0 -28 4 -40 16 -40 C46 -40 52 6 0 40 Z" fill="none" stroke="${gold}" stroke-width="2" opacity="0.7"/>
          <!-- radiant feather-flares -->
          ${[0, 45, 90, 135, 180, 225, 270, 315].map((d) => { const a = (d * Math.PI) / 180; return `<line x1="${(Math.cos(a) * 46).toFixed(1)}" y1="${(Math.sin(a) * 46).toFixed(1)}" x2="${(Math.cos(a) * 68).toFixed(1)}" y2="${(Math.sin(a) * 68).toFixed(1)}" stroke="${mane}" stroke-width="2" opacity="0.5"/>`; }).join('')}
        </g>
        ${s2.close}`);
    }
    case 'locker':
    default: {
      return svg(`${s.open}
        <!-- leather saddlebags + a bronze quiver of clubs strapped to the flank -->
        ${[110, 290].map((x) => `<g transform="translate(${x} 150)"><path d="M-34 -30 L34 -30 L28 44 L-28 44 Z" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.6"/><path d="M-34 -30 Q0 -12 34 -30 L30 6 Q0 -6 -30 6 Z" fill="${t.trim}" opacity="0.85"/><circle cx="0" cy="-8" r="4" fill="${gold}"/>${[-16, 16].map((bx) => `<rect x="${bx - 3}" y="-30" width="6" height="16" rx="2" fill="${gold}" opacity="0.7"/>`).join('')}</g>`).join('')}
        <!-- a quiver of golf clubs -->
        <g transform="translate(200 176)"><path d="M-14 30 L14 30 L11 -18 L-11 -18 Z" fill="${darken(t.panel, 0.05)}" stroke="${gold}" stroke-width="1.4"/><ellipse cx="0" cy="-18" rx="11" ry="4" fill="${darken(t.panel, 0.15)}"/>${[-6, -2, 2, 6].map((dx) => `<line x1="${dx}" y1="-18" x2="${dx * 2.2}" y2="-46" stroke="${gold}" stroke-width="2"/><path d="M${dx * 2.2 - 3} -46 l6 0 l-2 4 l-2 0 Z" fill="${lighten(t.trim, 0.2)}"/>`).join('')}</g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ BIKE — the open single-rider frame ═══════════════════════════ */

function bikeShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const neon = lighten(t.energy, 0.1);
  return {
    open: `<defs>
        <linearGradient id="si-void-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#05060f"/><stop offset="100%" stop-color="${darken(t.hull, 0.2)}"/></linearGradient>
        <linearGradient id="si-streak-${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${neon}" stop-opacity="0"/><stop offset="100%" stop-color="${neon}" stop-opacity="0.7"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="300" fill="url(#si-void-${u})"/>
      ${stars(0, 0, 400, 220, 40)}
      <!-- speed streaks blurring past the open cockpit -->
      ${[40, 92, 150, 190].map((y, i) => `<line x1="0" y1="${y}" x2="${120 + i * 20}" y2="${y}" stroke="url(#si-streak-${u})" stroke-width="${1.5 + (i % 2)}" opacity="0.5"/>`).join('')}
      <!-- a thin roll-cage arc over the rider (the only "wall") -->
      <path d="M24 210 Q200 40 376 210" fill="none" stroke="${darken(t.panel, 0.05)}" stroke-width="8" opacity="0.7"/>
      <path d="M24 210 Q200 40 376 210" fill="none" stroke="${t.trim}" stroke-width="2" opacity="0.6"/>`,
    close: `<!-- the bike's frame deck: a footplate + twin glowing hover-wheels below -->
      <path d="M60 224 L340 224 L360 300 L40 300 Z" fill="${darken(t.hull, 0.1)}"/>
      <path d="M60 224 L340 224" fill="none" stroke="${t.trim}" stroke-width="1.6" opacity="0.6"/>
      ${[110, 290].map((x) => `<ellipse cx="${x}" cy="276" rx="46" ry="14" fill="${neon}" opacity="0.2"/><ellipse cx="${x}" cy="272" rx="40" ry="10" fill="none" stroke="${neon}" stroke-width="3" opacity="0.7"/>`).join('')}`,
  };
}

function bikeRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'bike' + room);
  const s = bikeShell(t, u);
  const neon = lighten(t.energy, 0.15);
  switch (room) {
    case 'bridge': {
      return svg(`${s.open}
        <!-- handlebars + a small instrument nacelle + a bubble windscreen -->
        <path d="M110 200 Q200 150 290 200" fill="none" stroke="${darken(t.panel, 0.05)}" stroke-width="9"/>
        ${[110, 290].map((x, i) => `<g transform="translate(${x} 200)"><rect x="-14" y="-6" width="28" height="14" rx="7" fill="${t.trim}"/><circle cx="${i ? 10 : -10}" cy="1" r="4" fill="${neon}"/></g>`).join('')}
        <!-- instrument nacelle -->
        <g transform="translate(200 160)"><path d="M-40 30 Q0 -6 40 30 Z" fill="${darken(t.panel, 0.08)}" stroke="${t.trim}" stroke-width="1.6"/><circle cx="-16" cy="18" r="10" fill="#0b0f18" stroke="${t.trim}" stroke-width="1.2"/><circle cx="-16" cy="18" r="7" fill="none" stroke="${neon}" stroke-width="1.4"/><line x1="-16" y1="18" x2="-11" y2="13" stroke="${neon}" stroke-width="1.4"/><rect x="4" y="10" width="30" height="16" rx="3" fill="#0b0f18" stroke="${t.trim}" stroke-width="1"/><text x="19" y="22" text-anchor="middle" font-size="9" font-weight="800" fill="${neon}">88</text></g>
        <!-- bubble windscreen -->
        <path d="M150 150 Q200 96 250 150" fill="${t.glass}" opacity="0.25" stroke="${t.trim}" stroke-width="1.4"/>
        <!-- fuel tank between the knees -->
        <ellipse cx="200" cy="212" rx="34" ry="16" fill="${t.trim}"/><ellipse cx="200" cy="206" rx="26" ry="9" fill="${lighten(t.trim, 0.2)}" opacity="0.6"/><circle cx="200" cy="206" r="4" fill="${darken(t.trim, 0.3)}"/>
        ${s.close}`);
    }
    case 'lounge': {
      return svg(`${s.open}
        <!-- a lean pit-stop: a floating neon diner sign, a helmet on the tank, a thermos -->
        <g transform="translate(200 78)"><rect x="-58" y="-18" width="116" height="40" rx="8" fill="#0b0f18" stroke="${neon}" stroke-width="2"/><text x="0" y="8" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="16" fill="${neon}">PIT STOP</text><circle cx="-58" cy="-18" r="3" fill="${neon}"/><circle cx="58" cy="22" r="3" fill="${neon}"/></g>
        <!-- a leaning post -->
        <line x1="120" y1="150" x2="120" y2="216" stroke="${t.trim}" stroke-width="4"/><ellipse cx="120" cy="150" rx="12" ry="4" fill="${t.trim}"/>
        <!-- helmet resting on the tank -->
        <g transform="translate(210 194)"><path d="M-22 6 A22 22 0 0 1 22 6 L22 12 L-22 12 Z" fill="${t.trim}"/><path d="M-18 4 A18 16 0 0 1 6 -10" fill="none" stroke="${neon}" stroke-width="2" opacity="0.7"/><rect x="-20" y="0" width="40" height="8" rx="4" fill="${t.glass}" opacity="0.5"/></g>
        <!-- a thermos -->
        <g transform="translate(150 190)"><rect x="-7" y="-30" width="14" height="30" rx="4" fill="${lighten(t.panel, 0.1)}" stroke="${t.trim}" stroke-width="1"/><rect x="-7" y="-30" width="14" height="8" rx="3" fill="${neon}" opacity="0.7"/></g>
        ${s.close}`);
    }
    case 'weapons': {
      return svg(`${s.open}
        <!-- mounted guns on the forks + saddlebag missile pods + a tank chain-gun -->
        ${[100, 300].map((x, i) => `<g transform="translate(${x} 168)"><rect x="-8" y="-10" width="16" height="40" rx="4" fill="${darken(t.panel, 0.05)}" stroke="${t.trim}" stroke-width="1.2"/>${[0, 1, 2].map((r) => `<circle cx="0" cy="${-4 + r * 12}" r="4" fill="#0b0f18" stroke="${t.trim}" stroke-width="1"/><circle cx="0" cy="${-4 + r * 12}" r="1.6" fill="${neon}"/></g>`).join('')}<rect x="${i ? -20 : 4}" y="30" width="16" height="10" rx="2" fill="${t.trim}"/></g>`).join('')}
        <!-- tank-mounted chain-gun -->
        <g transform="translate(200 188)"><rect x="-10" y="-10" width="20" height="20" rx="5" fill="${darken(t.panel, 0.1)}" stroke="${t.trim}" stroke-width="1.4"/><rect x="6" y="-5" width="60" height="10" rx="3" fill="${darken(t.panel, 0.05)}" stroke="${t.trim}" stroke-width="1"/><rect x="60" y="-7" width="8" height="14" rx="2" fill="${neon}" opacity="0.85"/>${[-3, 3].map((dy) => `<line x1="6" y1="${dy}" x2="60" y2="${dy}" stroke="${t.trim}" stroke-width="1"/>`).join('')}</g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-vtwin-${u}" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s2 = bikeShell(t, u, g);
      return svg(`${s2.open}
        <!-- the exposed V-TWIN reactor between the wheels: glowing pistons + open flame headers -->
        <g transform="translate(200 168)">
          <ellipse rx="70" ry="60" fill="${t.energy}" opacity="0.12"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="1.1s" repeatCount="indefinite"/></ellipse>
          ${[-1, 1].map((sgn) => `<g transform="rotate(${sgn * 26})"><rect x="-15" y="-58" width="30" height="52" rx="6" fill="${darken(t.panel, 0.06)}" stroke="${lighten(t.trim, 0.2)}" stroke-width="1.6"/>${[0, 1, 2, 3].map((f) => `<rect x="-18" y="${-52 + f * 12}" width="36" height="4" rx="2" fill="${darken(t.panel, 0.2)}"/>`).join('')}<circle cx="0" cy="-56" r="7" fill="url(#si-vtwin-${u})"><animate attributeName="r" values="6;9;6" dur="0.5s" repeatCount="indefinite"/></circle></g>`).join('')}
          <circle r="20" fill="url(#si-vtwin-${u})"/><circle r="26" fill="none" stroke="${lighten(t.trim, 0.2)}" stroke-width="2"/>
          <!-- open flame header pipes -->
          ${[-30, 30].map((x) => `<path d="M${x} 10 Q${x * 1.6} 40 ${x * 1.3} 70" fill="none" stroke="${lighten(t.trim, 0.15)}" stroke-width="5"/><path d="M${x} 10 Q${x * 1.6} 40 ${x * 1.3} 70" fill="none" stroke="${t.energy}" stroke-width="2" opacity="0.7"/>`).join('')}
        </g>
        ${s2.close}`);
    }
    case 'locker':
    default: {
      return svg(`${s.open}
        <!-- the golf bag strapped on the tail + tank panniers + a tool roll -->
        <g transform="translate(300 150)"><rect x="-16" y="-50" width="32" height="66" rx="10" fill="${t.trim}"/><rect x="-16" y="-58" width="32" height="14" rx="6" fill="${darken(t.trim, 0.2)}"/>${[-6, 0, 6].map((dx) => `<line x1="${dx}" y1="-58" x2="${dx * 2}" y2="-78" stroke="${lighten(t.trim, 0.3)}" stroke-width="2.4"/><path d="M${dx * 2 - 3} -78 l6 0 l-2 5 l-2 0 Z" fill="${neon}"/>`).join('')}<rect x="-20" y="-20" width="40" height="6" rx="3" fill="${darken(t.trim, 0.3)}"/></g>
        <!-- tank panniers -->
        ${[90, 150].map((x) => `<g transform="translate(${x} 168)"><path d="M-18 -6 L18 -6 L14 40 L-14 40 Z" fill="${darken(t.panel, 0.04)}" stroke="${t.trim}" stroke-width="1.4"/><rect x="-14" y="-6" width="28" height="12" rx="3" fill="${t.trim}" opacity="0.8"/><circle cx="0" cy="4" r="3" fill="${neon}"/></g>`).join('')}
        <!-- a tool roll -->
        <g transform="translate(210 204)"><rect x="-26" y="-6" width="52" height="14" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${t.trim}" stroke-width="1"/>${[-18, -6, 6, 18].map((dx) => `<line x1="${dx}" y1="-6" x2="${dx}" y2="8" stroke="${neon}" stroke-width="1.4" opacity="0.7"/>`).join('')}</g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ FREIGHTER — the industrial cargo hauler ═══════════════════════════ */

function freighterShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const hazard = lighten(t.energy, 0.1);
  return {
    open: `<defs>
        <linearGradient id="si-bulk-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.06)}"/><stop offset="100%" stop-color="${t.hull}"/></linearGradient>
        <linearGradient id="si-plate-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${t.panel}"/><stop offset="100%" stop-color="${darken(t.hull, 0.3)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="222" fill="url(#si-bulk-${u})"/>
      <!-- arched structural ribs down the hold -->
      ${[60, 200, 340].map((x) => `<path d="M${x - 60} 222 Q${x} 30 ${x + 60} 222" fill="none" stroke="${darken(t.hull, 0.1)}" stroke-width="10" opacity="0.55"/><path d="M${x - 60} 222 Q${x} 30 ${x + 60} 222" fill="none" stroke="${t.trim}" stroke-width="1.4" opacity="0.4"/>`).join('')}
      <!-- hanging work-lamp -->
      <line x1="200" y1="0" x2="200" y2="34" stroke="${darken(t.hull, 0.1)}" stroke-width="2"/><path d="M188 34 L212 34 L206 46 L194 46 Z" fill="${darken(t.panel, 0.05)}" stroke="${t.trim}" stroke-width="1"/><ellipse cx="200" cy="48" rx="30" ry="10" fill="${hazard}" opacity="0.22"/>`,
    close: `<!-- corrugated deck plating + hazard stripes -->
      <rect x="0" y="222" width="400" height="78" fill="url(#si-plate-${u})"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="${i * 50}" y="222" width="26" height="6" fill="${hazard}" opacity="0.5" transform="skewX(-18)"/>`).join('')}
      ${[40, 120, 200, 280, 360].map((x) => `<line x1="${x}" y1="230" x2="${x}" y2="300" stroke="#0004" stroke-width="1.4"/>`).join('')}
      <line x1="0" y1="222" x2="400" y2="222" stroke="${t.trim}" stroke-width="1.6" opacity="0.5"/>`,
  };
}

function freighterRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'freighter' + room);
  const s = freighterShell(t, u);
  const hazard = lighten(t.energy, 0.12);
  const steel = lighten(t.panel, 0.14);
  switch (room) {
    case 'bridge': {
      return svg(`${s.open}
        <!-- a workmanlike split forward window + a chunky console bank + a worn captain's chair -->
        <rect x="60" y="40" width="130" height="80" rx="4" fill="#060a18"/><rect x="210" y="40" width="130" height="80" rx="4" fill="#060a18"/>
        ${stars(66, 46, 118, 68, 14)}${stars(216, 46, 118, 68, 14)}
        <rect x="60" y="40" width="130" height="80" rx="4" fill="none" stroke="${steel}" stroke-width="3"/><rect x="210" y="40" width="130" height="80" rx="4" fill="none" stroke="${steel}" stroke-width="3"/>
        <line x1="190" y1="40" x2="190" y2="120" stroke="${darken(t.hull, 0.1)}" stroke-width="8"/>
        <!-- console bank + chunky levers -->
        <rect x="70" y="150" width="260" height="52" rx="6" fill="${darken(t.panel, 0.1)}" stroke="${steel}" stroke-width="1.6"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${88 + i * 40}" y="160" width="24" height="12" rx="2" fill="${i % 2 ? hazard : t.trim}" opacity="0.75"/>`).join('')}
        ${[130, 170, 250, 290].map((x, i) => `<g transform="translate(${x} 190)"><line x1="0" y1="0" x2="${i % 2 ? 8 : -8}" y2="-16" stroke="${steel}" stroke-width="3"/><circle cx="${i % 2 ? 8 : -8}" cy="-16" r="4" fill="${hazard}"/></g>`).join('')}
        <!-- captain's chair -->
        <g transform="translate(200 204)"><rect x="-16" y="-30" width="32" height="34" rx="6" fill="${darken(t.panel, 0.05)}" stroke="${steel}" stroke-width="1.4"/><rect x="-20" y="-34" width="40" height="10" rx="4" fill="${t.trim}"/></g>
        ${s.close}`);
    }
    case 'lounge': {
      return svg(`${s.open}
        <!-- the mess: a bolted metal table, a coffee urn, crates as stools, a corkboard -->
        <rect x="140" y="150" width="120" height="12" rx="3" fill="${steel}" stroke="${darken(t.hull, 0.1)}" stroke-width="1"/><rect x="150" y="162" width="8" height="44" fill="${darken(t.panel, 0.1)}"/><rect x="242" y="162" width="8" height="44" fill="${darken(t.panel, 0.1)}"/>
        ${[110, 290].map((x) => `<rect x="${x - 16}" y="176" width="32" height="30" rx="3" fill="${darken(t.panel, 0.06)}" stroke="${steel}" stroke-width="1.2"/><line x1="${x - 16}" y1="191" x2="${x + 16}" y2="191" stroke="#0004" stroke-width="1"/>`).join('')}
        <!-- coffee urn on the table -->
        <g transform="translate(200 130)"><rect x="-10" y="0" width="20" height="20" rx="4" fill="${steel}" stroke="${darken(t.hull, 0.1)}" stroke-width="1"/><rect x="-6" y="-6" width="12" height="8" rx="2" fill="${darken(t.panel, 0.1)}"/><rect x="10" y="10" width="6" height="4" rx="1" fill="${hazard}"/><circle cx="0" cy="-10" r="2" fill="${hazard}" opacity="0.6"/></g>
        <!-- corkboard on the wall -->
        <g transform="translate(70 56)"><rect width="76" height="56" rx="3" fill="${darken(t.panel, 0.02)}" stroke="${steel}" stroke-width="1.4"/>${[[10, 12], [40, 10], [16, 34], [46, 32]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="20" height="14" rx="1" fill="${i % 2 ? hazard : t.trim}" opacity="0.6"/>`).join('')}</g>
        ${s.close}`);
    }
    case 'weapons': {
      return svg(`${s.open}
        <!-- a cargo-bay armory: crates of ordnance, a rail-mounted deck gun, ammo pallets -->
        ${[[70, 130], [70, 172], [116, 150]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-22" y="-22" width="44" height="44" rx="3" fill="${darken(t.panel, 0.06)}" stroke="${steel}" stroke-width="1.4"/><line x1="-22" y1="0" x2="22" y2="0" stroke="#0004" stroke-width="1"/><line x1="0" y1="-22" x2="0" y2="22" stroke="#0004" stroke-width="1"/><text x="0" y="4" text-anchor="middle" font-size="12" font-weight="800" fill="${hazard}" opacity="0.8">☢</text></g>`).join('')}
        <!-- rail-mounted deck gun -->
        <g transform="translate(280 150)"><rect x="-40" y="42" width="120" height="8" rx="2" fill="${darken(t.panel, 0.1)}" stroke="${steel}" stroke-width="1"/><g transform="rotate(-20)"><rect x="-14" y="-10" width="28" height="30" rx="5" fill="${darken(t.panel, 0.05)}" stroke="${steel}" stroke-width="1.4"/><rect x="8" y="-6" width="70" height="12" rx="3" fill="${darken(t.hull, 0.05)}" stroke="${steel}" stroke-width="1"/><rect x="76" y="-8" width="10" height="16" rx="2" fill="${hazard}"/></g><circle cx="0" cy="46" r="8" fill="${steel}"/></g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-fusion-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="45%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.6)}"/></radialGradient>`;
      const s2 = freighterShell(t, u, g);
      return svg(`${s2.open}
        <!-- a big boxy fusion plant: pipes, gauges, warning lights, coolant glow -->
        <g transform="translate(200 132)">
          <rect x="-90" y="-56" width="180" height="112" rx="8" fill="${darken(t.panel, 0.1)}" stroke="${steel}" stroke-width="1.8"/>
          <circle cx="0" cy="0" r="42" fill="${darken(t.hull, 0.1)}" stroke="${steel}" stroke-width="2"/>
          <circle cx="0" cy="0" r="30" fill="url(#si-fusion-${u})"><animate attributeName="r" values="28;33;28" dur="2s" repeatCount="indefinite"/></circle>
          <!-- pipes off the sides -->
          ${[-1, 1].map((sgn) => `<rect x="${sgn > 0 ? 84 : -108} " y="-30" width="24" height="10" rx="3" fill="${steel}"/><rect x="${sgn > 0 ? 84 : -108}" y="10" width="24" height="10" rx="3" fill="${steel}"/>`).join('')}
          <!-- gauges + warning lights -->
          ${[-72, -54].map((x) => `<circle cx="${x}" cy="-40" r="7" fill="#0b0f18" stroke="${steel}" stroke-width="1"/><line x1="${x}" y1="-40" x2="${x + 4}" y2="-44" stroke="${hazard}" stroke-width="1.4"/>`).join('')}
          ${[54, 72].map((x, i) => `<circle cx="${x}" cy="-40" r="4" fill="${i % 2 ? hazard : t.trim}"><animate attributeName="opacity" values="0.4;1;0.4" dur="${(1.2 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
        </g>
        ${s2.close}`);
    }
    case 'locker':
    default: {
      return svg(`${s.open}
        <!-- a cargo hold of lockers + stacked gear crates + a golf bag lashed down -->
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(${44 + i * 60} 46)"><rect width="50" height="124" rx="4" fill="${darken(t.panel, 0.06)}" stroke="${steel}" stroke-width="1.4"/><rect x="8" y="12" width="34" height="14" rx="2" fill="${darken(t.hull, 0.1)}"/><line x1="8" y1="70" x2="42" y2="70" stroke="#0004" stroke-width="1"/><rect x="40" y="60" width="4" height="18" rx="2" fill="${hazard}" opacity="0.7"/></g>`).join('')}
        <!-- stacked crates -->
        ${([[320, 176], [356, 176], [338, 142]] as [number, number][]).map(([x, y]) => `<rect x="${x - 18}" y="${y - 18}" width="36" height="36" rx="2" fill="${darken(t.panel, 0.04)}" stroke="${steel}" stroke-width="1.2"/><line x1="${x - 18}" y1="${y}" x2="${x + 18}" y2="${y}" stroke="#0004" stroke-width="1"/>`).join('')}
        <!-- a golf bag lashed to the wall -->
        <g transform="translate(300 202)"><rect x="-11" y="-48" width="22" height="48" rx="9" fill="${t.trim}"/><rect x="-11" y="-54" width="22" height="12" rx="5" fill="${darken(t.trim, 0.2)}"/><rect x="-14" y="-30" width="28" height="5" rx="2" fill="${hazard}" opacity="0.6"/></g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ AURORA — the luxury star-yacht ═══════════════════════════ */

function auroraShell(t: ShipTheme, u: string, defs = ''): { open: string; close: string } {
  const gold = lighten(t.trim, 0.2);
  return {
    open: `<defs>
        <linearGradient id="si-aur-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.14)}"/><stop offset="100%" stop-color="${t.hull}"/></linearGradient>
        <linearGradient id="si-aband-${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${t.energy}" stop-opacity="0"/><stop offset="45%" stop-color="${t.energy}" stop-opacity="0.55"/><stop offset="70%" stop-color="${gold}" stop-opacity="0.5"/><stop offset="100%" stop-color="${t.trim}" stop-opacity="0"/></linearGradient>
        <linearGradient id="si-mirror-${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${lighten(t.panel, 0.05)}"/><stop offset="100%" stop-color="${darken(t.hull, 0.2)}"/></linearGradient>
        ${defs}
      </defs>
      <rect width="400" height="222" fill="url(#si-aur-${u})"/>
      <!-- sweeping gold-trimmed curved walls -->
      <path d="M0 60 Q200 20 400 60 L400 0 L0 0 Z" fill="${darken(t.hull, 0.12)}"/>
      <path d="M0 60 Q200 20 400 60" fill="none" stroke="${gold}" stroke-width="2" opacity="0.8"/>
      <!-- living aurora light bands drifting across the ceiling -->
      ${[76, 104, 132].map((y, i) => `<path d="M-40 ${y} Q120 ${y - 22} 240 ${y} T440 ${y}" fill="none" stroke="url(#si-aband-${u})" stroke-width="${9 - i * 2}" opacity="0.55"><animate attributeName="d" values="M-40 ${y} Q120 ${y - 22} 240 ${y} T440 ${y};M-40 ${y} Q120 ${y + 18} 240 ${y} T440 ${y};M-40 ${y} Q120 ${y - 22} 240 ${y} T440 ${y}" dur="${(7 + i * 2)}s" repeatCount="indefinite"/></path>`).join('')}`,
    close: `<!-- mirror-polished floor reflecting the light -->
      <rect x="0" y="222" width="400" height="78" fill="url(#si-mirror-${u})"/>
      <path d="M0 222 Q200 214 400 222" fill="none" stroke="${gold}" stroke-width="2" opacity="0.8"/>
      ${[120, 200, 280].map((x, i) => `<ellipse cx="${x}" cy="262" rx="${30 - i * 4}" ry="26" fill="${t.energy}" opacity="0.08"/>`).join('')}
      <rect x="0" y="222" width="400" height="78" fill="url(#si-aband-${u})" opacity="0.12"/>`,
  };
}

function auroraRoom(room: ShipRoom, t: ShipTheme): string {
  const u = themeUid(t, 'aurora' + room);
  const s = auroraShell(t, u);
  const gold = lighten(t.trim, 0.25);
  const light = lighten(t.energy, 0.2);
  switch (room) {
    case 'bridge': {
      return svg(`${s.open}
        <!-- a floating crystal console + a panoramic curved viewport + a throne chair -->
        <path d="M46 116 Q200 54 354 116 L354 130 Q200 70 46 130 Z" fill="#0a1230"/>
        <clipPath id="si-aurclip-${u}"><path d="M46 120 Q200 60 354 120 Z"/></clipPath>
        <g clip-path="url(#si-aurclip-${u})">${stars(46, 58, 308, 66, 30)}<path d="M46 96 Q200 66 354 96" fill="none" stroke="${light}" stroke-width="10" opacity="0.4"/></g>
        <path d="M46 116 Q200 54 354 116" fill="none" stroke="${gold}" stroke-width="3"/>
        <!-- floating crystal console -->
        <g transform="translate(200 176)"><path d="M-56 24 L56 24 L40 0 L-40 0 Z" fill="${darken(t.panel, 0.05)}" stroke="${gold}" stroke-width="1.6" opacity="0.9"/><path d="M-40 0 L40 0 L30 -14 L-30 -14 Z" fill="${t.energy}" opacity="0.3"/>${[-24, -8, 8, 24].map((x, i) => `<rect x="${x - 4}" y="6" width="8" height="10" rx="2" fill="${i % 2 ? light : gold}" opacity="0.85"/>`).join('')}<ellipse cx="0" cy="24" rx="56" ry="6" fill="${light}" opacity="0.2"/></g>
        <!-- throne-like helm chair -->
        <g transform="translate(200 210)"><path d="M-18 -4 q-6 -40 18 -44 q24 4 18 44 Z" fill="${darken(t.panel, 0.02)}" stroke="${gold}" stroke-width="1.6"/><path d="M0 -46 l-8 -14 l16 0 Z" fill="${gold}"/></g>
        ${s.close}`);
    }
    case 'lounge': {
      return svg(`${s.open}
        <!-- an opulent salon: a chandelier of light, a chaise, a fountain of light -->
        <g transform="translate(200 30)"><line x1="0" y1="0" x2="0" y2="16" stroke="${gold}" stroke-width="1.4"/>${[0, 60, 120, 180, 240, 300].map((d) => { const a = (d * Math.PI) / 180; return `<line x1="0" y1="16" x2="${(Math.cos(a) * 26).toFixed(1)}" y2="${(16 + Math.sin(a) * 20).toFixed(1)}" stroke="${gold}" stroke-width="1"/><circle cx="${(Math.cos(a) * 26).toFixed(1)}" cy="${(16 + Math.sin(a) * 20).toFixed(1)}" r="3.4" fill="${light}"><animate attributeName="opacity" values="0.5;1;0.5" dur="${(2 + (d % 90) / 40).toFixed(1)}s" repeatCount="indefinite"/></circle>`; }).join('')}<circle cx="0" cy="16" r="5" fill="${light}"/></g>
        <!-- a plush chaise -->
        <g transform="translate(120 176)"><path d="M-52 24 L52 24 L52 6 Q52 -4 42 -4 L-42 -4 Q-52 -4 -52 6 Z" fill="${t.trim}" opacity="0.9"/><path d="M-52 6 Q-64 6 -64 -18 L-52 -18 Z" fill="${darken(t.trim, 0.15)}"/><rect x="-40" y="-2" width="80" height="6" rx="3" fill="${gold}" opacity="0.6"/></g>
        <!-- a fountain of light -->
        <g transform="translate(300 190)"><ellipse cx="0" cy="18" rx="26" ry="8" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1.4"/>${[0, 1, 2].map((i) => `<path d="M0 14 q${i ? (i === 1 ? -14 : 14) : 0} -${20 + i * 4} 0 -${34 + i * 6}" fill="none" stroke="${light}" stroke-width="2" opacity="0.7"><animate attributeName="opacity" values="0.4;0.9;0.4" dur="${(1.8 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/></path>`).join('')}<ellipse cx="0" cy="14" rx="14" ry="4" fill="${light}" opacity="0.5"/></g>
        ${s.close}`);
    }
    case 'weapons': {
      return svg(`${s.open}
        <!-- an elegant arsenal: a gilded nova cannon on a mount, energy lances in a case -->
        <g transform="translate(150 150)">
          <ellipse cx="0" cy="46" rx="34" ry="10" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1.4"/>
          <g transform="rotate(-16)"><rect x="-16" y="-12" width="32" height="34" rx="8" fill="${darken(t.panel, 0.04)}" stroke="${gold}" stroke-width="1.6"/><rect x="10" y="-8" width="66" height="16" rx="8" fill="${darken(t.hull, 0.05)}" stroke="${gold}" stroke-width="1.4"/><circle cx="78" cy="0" r="12" fill="${light}" opacity="0.5"/><circle cx="78" cy="0" r="7" fill="${light}"><animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite"/></circle></g>
        </g>
        <!-- a display case of energy lances -->
        <g transform="translate(300 128)"><rect x="-30" y="-4" width="60" height="96" rx="6" fill="#0b0f18" opacity="0.6" stroke="${gold}" stroke-width="1.4"/>${[-14, 0, 14].map((x, i) => `<line x1="${x}" y1="6" x2="${x}" y2="82" stroke="${light}" stroke-width="${3 - i * 0.4}" opacity="0.8"/><circle cx="${x}" cy="6" r="3" fill="${gold}"/>`).join('')}</g>
        ${s.close}`);
    }
    case 'engine': {
      const g = `<radialGradient id="si-phx-${u}" cx="50%" cy="50%" r="55%"><stop offset="0%" stop-color="#fff"/><stop offset="35%" stop-color="${light}"/><stop offset="70%" stop-color="${t.energy}"/><stop offset="100%" stop-color="${darken(t.energy, 0.5)}"/></radialGradient>`;
      const s2 = auroraShell(t, u, g);
      return svg(`${s2.open}
        <!-- the aurora HEART: a phoenix-wing reactor of living light -->
        <g transform="translate(200 148)">
          <ellipse rx="94" ry="88" fill="${t.energy}" opacity="0.12"><animate attributeName="opacity" values="0.08;0.2;0.08" dur="2.8s" repeatCount="indefinite"/></ellipse>
          <!-- unfurled phoenix wings of light -->
          ${[-1, 1].map((sgn) => `<path d="M0 -6 Q${sgn * 60} -56 ${sgn * 96} -20 Q${sgn * 66} -18 ${sgn * 74} 8 Q${sgn * 50} 0 ${sgn * 40} 24 Q${sgn * 24} 12 0 20 Z" fill="${gold}" opacity="0.5"><animateTransform attributeName="transform" type="rotate" values="${sgn * -3};${sgn * 4};${sgn * -3}" dur="3.4s" repeatCount="indefinite"/></path>`).join('')}
          <circle r="34" fill="url(#si-phx-${u})"><animate attributeName="r" values="32;38;32" dur="2.8s" repeatCount="indefinite"/></circle>
          <circle r="46" fill="none" stroke="${gold}" stroke-width="2" opacity="0.7"/>
          <path d="M0 -46 l-6 -12 l12 0 Z" fill="${light}"/>
        </g>
        ${s2.close}`);
    }
    case 'locker':
    default: {
      return svg(`${s.open}
        <!-- a gilded wardrobe wall + a trophy case + the bag on a gold stand -->
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(${52 + i * 58} 50)"><rect width="48" height="120" rx="6" fill="${darken(t.panel, 0.04)}" stroke="${gold}" stroke-width="1.4"/><rect x="6" y="10" width="36" height="14" rx="3" fill="${t.energy}" opacity="0.25"/><circle cx="40" cy="66" r="3" fill="${light}"/><path d="M8 40 L40 40" stroke="${gold}" stroke-width="1" opacity="0.5"/></g>`).join('')}
        <!-- a trophy on a pedestal -->
        <g transform="translate(320 176)"><rect x="-14" y="14" width="28" height="10" rx="3" fill="${darken(t.panel, 0.1)}" stroke="${gold}" stroke-width="1"/><path d="M-10 14 L-6 -6 L6 -6 L10 14 Z" fill="${gold}"/><path d="M-14 -6 Q-14 -20 -6 -20 L6 -20 Q14 -20 14 -6 Z" fill="${light}" opacity="0.5"/><ellipse cx="0" cy="-6" rx="10" ry="3" fill="${gold}"/></g>
        <!-- the bag on a gold stand -->
        <g transform="translate(190 200)"><ellipse cx="0" cy="6" rx="16" ry="4" fill="${gold}" opacity="0.4"/><rect x="-11" y="-46" width="22" height="46" rx="9" fill="${t.trim}"/><rect x="-11" y="-52" width="22" height="12" rx="5" fill="${gold}"/>${[-5, 0, 5].map((dx) => `<line x1="${dx}" y1="-52" x2="${dx * 2}" y2="-70" stroke="${light}" stroke-width="2"/>`).join('')}</g>
        ${s.close}`);
    }
  }
}

/* ═══════════════════════════ dispatch ═══════════════════════════ */

/** The SVG backdrop for a ship room, drawn in the flown ship's CABIN STYLE + palette. */
export function shipRoomArt(room: ShipRoom, t: ShipTheme): string {
  switch (cabinStyleOf(t.kind)) {
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
};

/** The room's display label + icon, flavoured to the flown ship's cabin style. */
export function shipRoomMeta(room: ShipRoom, kind: string): { icon: string; label: string } {
  return { icon: SHIP_ROOM_META[room].icon, label: ROOM_LABELS[cabinStyleOf(kind)][room] };
}
