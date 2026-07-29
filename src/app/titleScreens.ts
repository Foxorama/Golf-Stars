/**
 * The title screen and its painted doorway tiles (GS-title-2 / GS-nav): the hero wordmark, the
 * two GAME tiles, the Trade-Market/Clubhouse doorway tiles, and the PWA install nudge. All tile
 * art is hand-placed (zero rng) so it stays byte-stable.
 */

import { state } from './ctx';
import { GAME_TITLE, APP_VERSION } from '../brand';
import { FORMATS, ASGARD_FORMAT, STROKEPLAY_FORMAT, getFormat } from '../sim/rpg/formats';
import type { RunSnapshot } from '../sim/rpg/run';
import { shipForCharacter } from '../ui/gameCosmetics';
import { shipCardSVG } from '../render/shipArt';
import { getCharacter } from '../sim/rpg/characters';
import { arcIndexOf } from '../sim/rpg/competition';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { storyComplete } from '../sim/rpg/story';
import { ARCHETYPE_SPACE, ARCHETYPE_TURF } from '../render/palette';
import type { BiomeArchetype } from '../sim/course/themes';

/** The captured PWA install prompt (beforeinstallprompt), if the browser offered one and the
 *  player hasn't installed/dismissed it. Surfaced as an "Install" button on the title. Set by
 *  app.ts's `start()` listener; cleared by the `[data-install]` wiring. */
export const installView = { deferred: null as (Event & { prompt?: () => void }) | null };

function installDismissed(): boolean {
  try {
    return localStorage.getItem('fc_installNudge') === 'dismissed';
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
  // The thematic, mode-aware Continue Run button (GS-continue-button): the character's ship + a message
  // that reads the run being continued (Voyage arc / Unending hole / Star Tour course + hole). Empty for a
  // Star Tour session where no course has been started (nothing meaningful to continue).
  const resumeHTML = continueRunHTML();
  return `
    <header class="gs-hero">
      <h1 class="gs-hero-title">⛳ ${GAME_TITLE}</h1>
      <p class="gs-hero-tag">Voyage the galaxy · Make the cut · Travel deeper</p>
      <!-- The shipped build, quiet but always reachable (GS-release-identity). A player
           reporting a bug needs a build string they can read WITHOUT digging through
           settings, and the title screen is the one place every session passes through. -->
      <p class="gs-hero-build">v${APP_VERSION}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:12px;">✦ <b>${state.shards}</b> Star Shards</span>
        ${state.lifetimeAces > 0 ? `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:12px;" title="lifetime holes-in-one">⛳ <b>${state.lifetimeAces}</b> Ace${state.lifetimeAces === 1 ? '' : 's'}</span>` : ''}
        ${best}
        ${endlessBest}
        ${installButtonHTML()}
      </div>
    </header>
    ${resumeHTML}
    <h2 class="gs-seclabel">${resumeHTML ? 'Or start a new run — choose your game' : 'Choose your game'}</h2>
    <div class="gs-navtiles gs-navtiles--games">${modes}${storyTileHTML()}${destinationTileHTML()}${universeUnendingTileHTML()}${starTourRewardTileHTML()}</div>
    <h2 class="gs-seclabel">Between runs</h2>
    ${navTilesHTML()}`;
}

/** The mode-aware message shown on the Continue Run button (GS-continue-button). Returns `null` when the
 *  run isn't worth (or possible) to continue — today only a Star Tour session with no course teed off. */
function resumeInfo(r: RunSnapshot): { kicker: string; head: string; sub: string } | null {
  const ch = getCharacter(r.characterId);
  const who = ch ? ch.name : 'Your golfer';
  // Star Tour (GS-star-tour): a records chase on a chosen course — only offer a continue once a course has
  // actually been started, and lead with the COURSE (its icon + name) and the hole reached.
  if (r.formatId === STROKEPLAY_FORMAT) {
    if (!r.staticCourseId) return null;
    const spec = staticCourseSpec(r.staticCourseId);
    const hole = (r.stopHoleIndex ?? 0) + 1;
    return {
      kicker: `🗺 Star Tour · ${who}`,
      head: `${courseIconHTML(spec?.archetype)} ${spec?.name ?? 'Course'}`,
      sub: `Round in progress · <b style="color:var(--gs-ink);">Hole ${hole}</b> of 18`,
    };
  }
  // The Voyage (GS-voyage): the winnable campaign runs three arcs — say which arc you're in.
  if (getFormat(r.formatId).winnable) {
    const arc = arcIndexOf(r.stopIndex) + 1;
    return {
      kicker: `🚀 The Voyage · ${who}`,
      head: `Arc ${arc}<span style="color:var(--gs-dim);font-weight:600;"> of 3</span>`,
      sub: `Stop ${r.stopIndex + 1} · ${r.credits} credits`,
    };
  }
  // The Unending Universe (GS-unending): endless survival — say the hole you're up to.
  const hole = (r.holesSurvived ?? 0) + 1;
  return {
    kicker: `🌌 Unending Universe · ${who}`,
    head: `Hole ${hole}`,
    sub: `${r.credits} credits${r.bonusShards ? ` · ✦ ${r.bonusShards}` : ''}`,
  };
}

/** A small themed "course on a world" medallion for the Star Tour continue message — a planet tinted by
 *  the course's world archetype with a pin flag, so the button carries the course's identity. */
function courseIconHTML(archetype: BiomeArchetype | undefined): string {
  const ring = (archetype && ARCHETYPE_SPACE[archetype]?.edge) || 'rgba(120,205,140,0.55)';
  const body = (archetype && ARCHETYPE_TURF[archetype]?.green.base) || '#5fd45a';
  const dark = (archetype && ARCHETYPE_TURF[archetype]?.green.ink) || '#1d4d22';
  return `<svg width="18" height="18" viewBox="0 0 18 18" style="vertical-align:-3px;display:inline-block;" aria-hidden="true">
    <circle cx="9" cy="10" r="5.4" fill="${body}"/>
    <circle cx="7.2" cy="8.2" r="5.4" fill="${dark}" opacity="0.35"/>
    <ellipse cx="9" cy="10" rx="8" ry="2.6" fill="none" stroke="${ring}" stroke-width="1.2"/>
    <line x1="11.4" y1="10.4" x2="11.4" y2="4.6" stroke="#e8e8ea" stroke-width="1"/>
    <path d="M11.4,4.8 L15,6.1 L11.4,7.4 Z" fill="#ff6b6b"/>
  </svg>`;
}

/** The thematic Continue Run button (GS-continue-button): the character's cosmetic ship + a mode-aware
 *  message. The WHOLE card is the resume button. Empty when there's nothing to continue. */
function continueRunHTML(): string {
  const r = state.resumable;
  if (!r) return '';
  const info = resumeInfo(r);
  if (!info) return '';
  const shipId = shipForCharacter(state, r.characterId);
  return `
    <button class="gs-resume" data-action='${JSON.stringify({ type: 'resume' })}'>
      <span class="gs-resume__ship" aria-hidden="true">${shipCardSVG(shipId, 96, 60)}</span>
      <span class="gs-resume__body">
        <span class="gs-resume__kicker">${info.kicker}</span>
        <span class="gs-resume__head">${info.head}</span>
        <span class="gs-resume__sub">${info.sub}</span>
      </span>
      <span class="gs-resume__go" aria-hidden="true">▶</span>
    </button>`;
}

/** The third game tile (GS-story): STORY TOUR — the standalone campaign that grew out of Star Tour. The
 *  whole tile is the button; its caption is mode-aware (Continue an in-progress campaign vs Begin a new
 *  one), reading the loaded `state.story`. Launches its own new-game/continue flow (`openStory`), not the
 *  generic `start` path. The free-roam Star Tour records chase is now a REWARD, unlocked after you complete
 *  Story Tour (GS-story-startour-unlock, `starTourRewardTileHTML`). */
function storyTileHTML(): string {
  const inProgress = !!state.story;
  const sub = inProgress
    ? `Continue your campaign · ${state.story!.chapter <= 0 ? 'the voyage begins' : `Chapter ${state.story!.chapter}`}`
    : 'Save the Universe — a galaxy-spanning golf campaign';
  return `
    <button class="gs-navtile gs-navtile--game gs-navtile--startour" style="--mc:#54c8ff;" data-action='${JSON.stringify({ type: 'openStory' })}'>
      <span class="gs-navtile__art" aria-hidden="true">${starTourTileArt()}</span>
      <span class="gs-navtile__cap">
        <span class="gs-navtile__title">🌠 Story Tour</span>
        <span class="gs-navtile__sub">${sub}</span>
      </span>
    </button>`;
}

/** The STAR TOUR reward tile (GS-story-startour-unlock): the free-roam records chase is a reward for
 *  completing Story Tour — "play the story, then travel the whole galaxy". Hidden until a campaign exists
 *  (so the title stays clean before you start); a LOCKED teaser while the campaign is underway; the live
 *  `openStarTour` tile once the story is won. The `?screen=startour` deep-link (tests) bypasses this. */
function starTourRewardTileHTML(): string {
  // GS-story-startour-unlock: the unlock is PERMANENT — earned on the first finale win (`starTourUnlocked`,
  // main save) and never relocked by starting a new campaign, which resets the campaign's own `completed`.
  // A live completed campaign also counts (covers a win before this session persisted the flag).
  const unlocked = state.starTourUnlocked || (state.story ? storyComplete(state.story) : false);
  if (unlocked) {
    return `
    <button class="gs-navtile gs-navtile--game" style="--mc:#54c8ff;" data-action='${JSON.stringify({ type: 'openStarTour' })}'>
      <span class="gs-navtile__art" aria-hidden="true">${starTourTileArt()}</span>
      <span class="gs-navtile__cap">
        <span class="gs-navtile__title">🗺 Star Tour</span>
        <span class="gs-navtile__sub">Free-roam the whole galaxy — chase course records</span>
      </span>
    </button>`;
  }
  if (!state.story) return ''; // no campaign started and never completed → don't tease it
  return `
    <div class="gs-navtile gs-navtile--game" style="--mc:#3a4656;cursor:default;opacity:0.72;" aria-disabled="true" title="Complete Story Tour to unlock">
      <span class="gs-navtile__art" aria-hidden="true" style="filter:grayscale(0.85) brightness(0.55);">${starTourTileArt()}</span>
      <span class="gs-navtile__cap">
        <span class="gs-navtile__title">🔒 Star Tour</span>
        <span class="gs-navtile__sub">Complete Story Tour to free-roam the galaxy</span>
      </span>
    </div>`;
}

/** Greyed-out placeholder tile beneath THE VOYAGE (GS-title-placeholders): a future campaign,
 *  "The Destination". Non-interactive teaser (a `<div>`, not a button) in the game row, greyed like
 *  the locked Star Tour tile — reuses the Voyage's gold backdrop, muted. Column-aligns under Voyage. */
function destinationTileHTML(): string {
  return `
    <div class="gs-navtile gs-navtile--game" style="--mc:#3a4656;cursor:default;opacity:0.72;" aria-disabled="true" title="Coming soon">
      <span class="gs-navtile__art" aria-hidden="true" style="filter:grayscale(0.85) brightness(0.55);">${voyageTileArt()}</span>
      <span class="gs-navtile__cap">
        <span class="gs-navtile__title">🔒 The Destination</span>
        <span class="gs-navtile__sub">Coming soon</span>
      </span>
    </div>`;
}

/** Greyed-out placeholder tile beneath the UNENDING UNIVERSE (GS-title-placeholders): a future mode,
 *  "Universe Unending" (NOT the Unending Universe above — a distinct, teased mode). Non-interactive,
 *  greyed like the locked Star Tour tile — reuses the Unending violet backdrop, muted. Column-aligns
 *  under the Unending Universe. */
function universeUnendingTileHTML(): string {
  return `
    <div class="gs-navtile gs-navtile--game" style="--mc:#3a4656;cursor:default;opacity:0.72;" aria-disabled="true" title="Coming soon">
      <span class="gs-navtile__art" aria-hidden="true" style="filter:grayscale(0.85) brightness(0.55);">${unendingTileArt()}</span>
      <span class="gs-navtile__cap">
        <span class="gs-navtile__title">🔒 Universe Unending</span>
        <span class="gs-navtile__sub">Coming soon</span>
      </span>
    </div>`;
}

/** Painted backdrop for the Star Tour tile: a constellation star chart with a route reticle over a
 *  ringed world, a ship swooping in — the free-roam map you fly to pick a course. Hand-placed
 *  (byte-stable), same doorway house style. */
function starTourTileArt(): string {
  const stars = [
    [20, 24], [52, 52], [88, 18], [120, 60], [158, 26], [198, 52], [236, 18],
    [268, 46], [40, 92], [150, 96], [228, 92], [76, 116], [186, 120], [280, 108],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.8 + (i % 3) * 0.5}" fill="#dff2ff" opacity="${0.4 + (i % 4) * 0.13}"/>`)
    .join('');
  // A faint constellation line joining a few of the stars — the "chart" feel.
  const lines = `<path d="M20,24 L52,52 L120,60 L158,26 M120,60 L150,96" fill="none" stroke="#54c8ff" stroke-width="1" opacity="0.4"/>`;
  return `<svg viewBox="0 0 300 138" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <radialGradient id="ntTour" cx="60%" cy="34%" r="100%">
        <stop offset="0%" stop-color="#0f3a52"/><stop offset="52%" stop-color="#0c1e38"/><stop offset="100%" stop-color="#060b1c"/>
      </radialGradient>
    </defs>
    <rect width="300" height="138" fill="url(#ntTour)"/>
    ${stars}
    ${lines}
    <!-- a ringed destination world with a selection reticle -->
    <g transform="translate(210,86)">
      <ellipse cx="0" cy="0" rx="34" ry="10" fill="none" stroke="#54c8ff" stroke-width="2" opacity="0.5"/>
      <circle cx="0" cy="0" r="18" fill="#2f7a86"/>
      <circle cx="0" cy="0" r="18" fill="url(#ntTour)" opacity="0.4"/>
      <circle cx="-6" cy="-6" r="18" fill="#7fe0e6" opacity="0.25"/>
      <circle cx="0" cy="0" r="27" fill="none" stroke="#7fe0ff" stroke-width="1.4" stroke-dasharray="4 5" opacity="0.85"/>
      <line x1="0" y1="-31" x2="0" y2="-24" stroke="#7fe0ff" stroke-width="1.4"/>
      <line x1="0" y1="24" x2="0" y2="31" stroke="#7fe0ff" stroke-width="1.4"/>
      <line x1="-31" y1="0" x2="-24" y2="0" stroke="#7fe0ff" stroke-width="1.4"/>
      <line x1="24" y1="0" x2="31" y2="0" stroke="#7fe0ff" stroke-width="1.4"/>
    </g>
    <!-- the ship swooping toward the world -->
    <g transform="translate(84,58) rotate(38)">
      <path d="M0,-11 C6,-7.5 6,7.5 0,12.5 C-6,7.5 -6,-7.5 0,-11 Z" fill="#dfe6f2"/>
      <circle cx="0" cy="-1.5" r="2.8" fill="#8fe6ff"/>
      <path d="M-5,6.5 L-10,13 L-2.5,10 Z" fill="#54c8ff"/>
      <path d="M5,6.5 L10,13 L2.5,10 Z" fill="#54c8ff"/>
      <path d="M-2.2,12.5 L0,21 L2.2,12.5 Z" fill="#ffc454" opacity="0.9"/>
    </g>
  </svg>`;
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
