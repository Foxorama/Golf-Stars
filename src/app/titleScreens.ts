/**
 * The title screen and its painted doorway tiles (GS-title-2 / GS-nav): the hero wordmark, the
 * two GAME tiles, the Trade-Market/Clubhouse doorway tiles, and the PWA install nudge. All tile
 * art is hand-placed (zero rng) so it stays byte-stable.
 */

import { btn, state } from './ctx';
import { FORMATS, ASGARD_FORMAT, STROKEPLAY_FORMAT } from '../sim/rpg/formats';

/** The captured PWA install prompt (beforeinstallprompt), if the browser offered one and the
 *  player hasn't installed/dismissed it. Surfaced as an "Install" button on the title. Set by
 *  app.ts's `start()` listener; cleared by the `[data-install]` wiring. */
export const installView = { deferred: null as (Event & { prompt?: () => void }) | null };

function installDismissed(): boolean {
  try {
    return localStorage.getItem('gs_installNudge') === 'dismissed';
  } catch {
    return false;
  }
}
function installButtonHTML(): string {
  if (!installView.deferred || installDismissed()) return '';
  return `<button class="gs-btn gs-btn--ghost" data-install="1">⬇ Install app</button>`;
}

export function titleScreen(): string {
  // Headline the winnable campaign (GS-voyage) first, then the endless survival format. Each GAME
  // tile (GS-title-2) is the SAME doorway component as the Market/Clubhouse tiles below — painted
  // scene + title + one-line caption, whole tile the button — distinct only via the `--mc` accent
  // (gold vs violet). No badge/launch-bar/progress text: one clean visual family across the title.
  // Ascension is picked at golfer select, not here.
  const modes = Object.values(FORMATS)
    .slice()
    // The Asgard tournament (GS-asgard) is an INTERLUDE format, reached only via the Rainbow-Road
    // eagle trigger — never a selectable game mode on the title. Star Tour (GS-star-tour) is launched
    // from its own star-map course picker, not this generic `start` tile, so it's excluded here too
    // (wired as a bespoke tile in a later pass).
    .filter((f) => f.id !== ASGARD_FORMAT && f.id !== STROKEPLAY_FORMAT)
    .sort((a, b) => Number(!!b.winnable) - Number(!!a.winnable))
    .map(
      (f) => `
      <button class="gs-navtile gs-navtile--game" style="--mc:${f.winnable ? '#ffce54' : '#b88aff'};" data-action='${JSON.stringify({ type: 'start', format: f.id })}'>
        <span class="gs-navtile__art" aria-hidden="true">${f.winnable ? voyageTileArt() : unendingTileArt()}</span>
        <span class="gs-navtile__cap">
          <span class="gs-navtile__title">${f.winnable ? '🚀' : '🌌'} ${f.name}</span>
          <span class="gs-navtile__sub">${f.blurb}</span>
        </span>
      </button>`,
    )
    .join('');
  const best =
    state.bestDistance > 0 || state.bestStableford > 0
      ? `<span class="gs-chip" title="personal bests" style="font-size:12px;">🏁 Best dist <b>${state.bestDistance}</b> · SF <b>${state.bestStableford}</b></span>`
      : '';
  // Unending-Universe lifetime best rides the hero chips row (the tile itself stays caption-only;
  // the full milestone trail lives with the earned gear in the Trade Market).
  const endlessBest =
    state.endlessBestHoles > 0
      ? `<span class="gs-chip" title="Unending Universe best" style="font-size:12px;">∞ Best <b style="color:#4fe08a;">${state.endlessBestHoles}</b> holes</span>`
      : '';
  return `
    <header class="gs-hero">
      <h1 class="gs-hero-title">⛳ Golf Stars</h1>
      <p class="gs-hero-tag">Voyage the galaxy · Make the cut · Travel deeper</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:12px;">✦ <b>${state.shards}</b> Star Shards</span>
        ${state.lifetimeAces > 0 ? `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:12px;" title="lifetime holes-in-one">⛳ <b>${state.lifetimeAces}</b> Ace${state.lifetimeAces === 1 ? '' : 's'}</span>` : ''}
        ${best}
        ${endlessBest}
        ${installButtonHTML()}
      </div>
    </header>
    ${
      state.resumable
        ? `<div class="gs-panel" style="border-color:#2bb673;background:linear-gradient(180deg,#10241a,#0e1a14);">
             <b style="font-size:14px;">Run in progress</b> — stop ${state.resumable.stopIndex + 1}, distance ${state.resumable.distanceFromStart}, ${state.resumable.credits} credits.
             <div style="margin-top:6px;">${btn('▶ Continue run', { type: 'resume' }, { variant: 'primary' })}</div>
           </div>`
        : ''
    }
    <h2 class="gs-seclabel">${state.resumable ? 'Or start a new run — choose your game' : 'Choose your game'}</h2>
    <div class="gs-navtiles">${modes}</div>
    <h2 class="gs-seclabel">Between runs</h2>
    ${navTilesHTML()}`;
}

/** Painted backdrop for the Voyage game tile (GS-title-2): the campaign as a dotted gold route
 *  arcing across three worlds (the three arcs) to a pin flag on the far planet, a ship mid-jump.
 *  Same hand-placed byte-stable house style as the Market/Clubhouse doorway scenes. */
function voyageTileArt(): string {
  const stars = [
    [18, 26], [44, 60], [70, 18], [104, 44], [148, 14], [186, 40], [214, 70],
    [246, 18], [278, 48], [126, 78], [30, 104], [258, 96], [90, 96], [170, 60],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.9 + (i % 3) * 0.5}" fill="#ffffff" opacity="${0.4 + (i % 4) * 0.14}"/>`)
    .join('');
  return `<svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <radialGradient id="ntVoy" cx="80%" cy="18%" r="105%">
        <stop offset="0%" stop-color="#3d3018"/><stop offset="45%" stop-color="#1c2038"/><stop offset="100%" stop-color="#0b0d1c"/>
      </radialGradient>
    </defs>
    <rect width="300" height="150" fill="url(#ntVoy)"/>
    ${stars}
    <!-- three worlds, near → far, the route threading them -->
    <circle cx="34" cy="124" r="20" fill="#4a9e58" opacity="0.9"/>
    <circle cx="28" cy="118" r="20" fill="#63c26e" opacity="0.5"/>
    <circle cx="150" cy="84" r="13" fill="#c2702e" opacity="0.9"/>
    <circle cx="146" cy="80" r="13" fill="#e8a45e" opacity="0.5"/>
    <circle cx="258" cy="40" r="24" fill="#6a4bb8" opacity="0.9"/>
    <circle cx="250" cy="32" r="24" fill="#8f6fd8" opacity="0.45"/>
    <path d="M46,112 C86,96 112,94 138,88 S204,64 236,50" fill="none" stroke="#ffce54" stroke-width="2"
      stroke-dasharray="1.5 7" stroke-linecap="round" opacity="0.9"/>
    <!-- the pin waits on the far world -->
    <g transform="translate(256,14)">
      <rect x="0" y="0" width="2" height="22" fill="#e8e8ea"/>
      <path d="M2,1 L16,6 L2,11 Z" fill="#ff6b6b"/>
    </g>
    <!-- ship mid-jump along the route -->
    <g transform="translate(96,96) rotate(66)">
      <path d="M0,-11 C6,-7.5 6,7.5 0,12.5 C-6,7.5 -6,-7.5 0,-11 Z" fill="#dfe6f2"/>
      <circle cx="0" cy="-1.5" r="2.8" fill="#9fd8e6"/>
      <path d="M-5,6.5 L-10,13 L-2.5,10 Z" fill="#ff6b6b"/>
      <path d="M5,6.5 L10,13 L2.5,10 Z" fill="#ff6b6b"/>
      <path d="M-2.2,12.5 L0,21 L2.2,12.5 Z" fill="#ffc454" opacity="0.9"/>
    </g>
  </svg>`;
}

/** Painted backdrop for the Unending Universe game tile (GS-title-2): a star tunnel of receding
 *  rings pulling toward a bright singularity, a golf ball streaking in — no far shore. Hand-placed,
 *  byte-stable, same house style as the other doorway scenes. */
function unendingTileArt(): string {
  const stars = [
    [16, 22], [48, 48], [80, 14], [118, 58], [160, 20], [204, 48], [242, 12],
    [274, 42], [36, 88], [140, 96], [232, 88], [70, 118], [190, 122], [280, 112],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.8 + (i % 3) * 0.5}" fill="#ffffff" opacity="${0.35 + (i % 4) * 0.14}"/>`)
    .join('');
  // Receding rings pulling toward the bright core — the tunnel with no far end.
  const rings = [
    [58, 44, 0.16], [44, 33, 0.24], [32, 24, 0.34], [21, 15.5, 0.46], [12, 8.5, 0.6],
  ]
    .map(([rx, ry, o]) => `<ellipse cx="212" cy="66" rx="${rx}" ry="${ry}" fill="none" stroke="#b88aff" stroke-width="1.6" opacity="${o}"/>`)
    .join('');
  return `<svg viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <radialGradient id="ntUnd" cx="70%" cy="42%" r="95%">
        <stop offset="0%" stop-color="#332052"/><stop offset="55%" stop-color="#191338"/><stop offset="100%" stop-color="#0a081a"/>
      </radialGradient>
      <radialGradient id="ntUndCore" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f2ecff"/><stop offset="45%" stop-color="#c9a6ff" stop-opacity="0.8"/><stop offset="100%" stop-color="#b88aff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="300" height="150" fill="url(#ntUnd)"/>
    ${stars}
    ${rings}
    <circle cx="212" cy="66" r="15" fill="url(#ntUndCore)"/>
    <!-- a golf ball streaks into the tunnel, trail behind it -->
    <path d="M58,110 Q120,96 176,78" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.5" stroke-dasharray="3 5" stroke-linecap="round"/>
    <circle cx="180" cy="77" r="4.4" fill="#f4f4f4"/>
    <circle cx="178.6" cy="75.6" r="1.3" fill="#ffffff"/>
  </svg>`;
}

/** The two big title-screen doorways (GS-nav): the Trade Market on the left, the Clubhouse on the
 *  right, each a fat themed button with its own painted scene behind the label. */
export function navTilesHTML(): string {
  return `
    <div class="gs-navtiles">
      <button class="gs-navtile gs-navtile--market" data-action='${JSON.stringify({ type: 'openMarket' })}'>
        <span class="gs-navtile__art" aria-hidden="true">${marketTileArt()}</span>
        <span class="gs-navtile__cap">
          <span class="gs-navtile__title">🚀 Trade Market</span>
          <span class="gs-navtile__sub">Spend ✦ Shards on ships &amp; threads</span>
        </span>
      </button>
      <button class="gs-navtile gs-navtile--clubhouse" data-action='${JSON.stringify({ type: 'openClubhouseHall' })}'>
        <span class="gs-navtile__art" aria-hidden="true">${clubhouseTileArt()}</span>
        <span class="gs-navtile__cap">
          <span class="gs-navtile__title">🏠 Clubhouse</span>
          <span class="gs-navtile__sub">Outfit each of your golfers</span>
        </span>
      </button>
    </div>`;
}

/** Painted backdrop for the Trade Market tile: an orbital trading post — a teal-lit docking ring
 *  around a modular hub with warm market windows, stacked cargo crates for wares, and a shuttle
 *  ferrying a crate in. Teal/amber scheme keeps it clearly apart from the violet Unending Universe
 *  doorway. Hand-placed (no rng) so it stays byte-stable. */
function marketTileArt(): string {
  const stars = [
    [14, 18], [34, 40], [58, 22], [86, 52], [110, 30], [140, 16], [168, 46],
    [196, 26], [220, 20], [248, 20], [272, 44], [40, 70], [128, 64], [96, 12],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.5}" fill="#dff7f2" opacity="${0.4 + (i % 4) * 0.12}"/>`)
    .join('');
  // A stack of traded cargo containers — the wares of the space bazaar.
  const crate = (x: number, y: number, w: number, h: number, fill: string) =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${fill}"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="none" stroke="#00000033" stroke-width="1"/>` +
    `<line x1="${x + w * 0.5}" y1="${y}" x2="${x + w * 0.5}" y2="${y + h}" stroke="#00000022" stroke-width="1"/></g>`;
  const cargo =
    crate(28, 92, 27, 16, '#e0a53e') +
    crate(57, 96, 22, 12, '#2f8f8a') +
    crate(33, 78, 21, 13, '#c98a6a') +
    crate(56, 84, 16, 11, '#e0a53e');
  // Warm market windows glowing on the station hub.
  const windows = [
    [197, 54], [206, 54], [215, 54], [224, 54],
    [197, 63], [206, 63], [215, 63], [224, 63],
  ]
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="4" rx="0.6" fill="#ffd27a" opacity="0.92"/>`)
    .join('');
  return `<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <radialGradient id="ntMkt" cx="66%" cy="30%" r="98%">
        <stop offset="0%" stop-color="#17585c"/><stop offset="52%" stop-color="#0d2b38"/><stop offset="100%" stop-color="#06121c"/>
      </radialGradient>
      <radialGradient id="ntMktGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffd98a" stop-opacity="0.5"/><stop offset="100%" stop-color="#ffd98a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="300" height="120" fill="url(#ntMkt)"/>
    ${stars}
    <!-- orbital trade station: a docking ring circling a modular hub with lit market windows -->
    <g>
      <circle cx="212" cy="56" r="30" fill="url(#ntMktGlow)"/>
      <ellipse cx="212" cy="56" rx="48" ry="19" fill="none" stroke="#39d9c4" stroke-width="3.4" opacity="0.42"/>
      <ellipse cx="212" cy="56" rx="48" ry="19" fill="none" stroke="#7ff0e0" stroke-width="1.2" opacity="0.6"/>
      <circle cx="164" cy="56" r="3.4" fill="#39d9c4" opacity="0.85"/>
      <circle cx="260" cy="56" r="3.4" fill="#39d9c4" opacity="0.85"/>
      <rect x="192" y="42" width="40" height="30" rx="7" fill="#28454d"/>
      <rect x="192" y="42" width="40" height="9" rx="7" fill="#35636d"/>
      ${windows}
      <rect x="211" y="30" width="2" height="12" fill="#5c7a80"/>
      <circle cx="212" cy="29" r="2.4" fill="#ff8f5e"/>
    </g>
    ${cargo}
    <!-- a shuttle ferrying a crate in toward the market -->
    <g transform="translate(118,44) rotate(18)">
      <path d="M0,-12 C6,-8 6,8 0,14 C-6,8 -6,-8 0,-12 Z" fill="#dfe6f2"/>
      <circle cx="0" cy="-2" r="3.1" fill="#8fe6da"/>
      <path d="M-6,7 L-11,15 L-3,11 Z" fill="#39d9c4"/>
      <path d="M6,7 L11,15 L3,11 Z" fill="#39d9c4"/>
      <rect x="-4" y="14" width="8" height="6" rx="1" fill="#e0a53e"/>
    </g>
  </svg>`;
}

/** Painted backdrop for the Clubhouse tile: a cosy clubhouse on the green under a dusk sky — building,
 *  lit windows, a pin flag on a rolling hill. Hand-placed (no rng) so it stays byte-stable. */
function clubhouseTileArt(): string {
  return `<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <linearGradient id="ntSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#23304a"/><stop offset="60%" stop-color="#3a4d55"/><stop offset="100%" stop-color="#5a6e3a"/>
      </linearGradient>
      <linearGradient id="ntGrass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5fb04a"/><stop offset="100%" stop-color="#2f7a33"/>
      </linearGradient>
    </defs>
    <rect width="300" height="120" fill="url(#ntSky)"/>
    <circle cx="248" cy="30" r="14" fill="#ffe6a6" opacity="0.85"/>
    <path d="M0,84 Q90,58 170,74 T300,70 V120 H0 Z" fill="url(#ntGrass)"/>
    <path d="M0,98 Q120,82 220,94 T300,92 V120 H0 Z" fill="#256a2a" opacity="0.7"/>
    <g transform="translate(58,52)">
      <rect x="0" y="14" width="78" height="40" fill="#6e4a2c"/>
      <rect x="0" y="14" width="78" height="40" fill="#00000022"/>
      <path d="M-8,16 L39,-8 L86,16 Z" fill="#8a3b2e"/>
      <rect x="33" y="34" width="16" height="20" fill="#3a2716"/>
      <rect x="10" y="24" width="13" height="11" fill="#ffd76b"/>
      <rect x="55" y="24" width="13" height="11" fill="#ffd76b"/>
    </g>
    <g transform="translate(214,40)">
      <rect x="0" y="0" width="2.5" height="44" fill="#d8d8d8"/>
      <path d="M2.5,0 L24,7 L2.5,14 Z" fill="#ff6b6b"/>
      <circle cx="1.2" cy="44" r="3.2" fill="#f4f4f4"/>
    </g>
  </svg>`;
}
