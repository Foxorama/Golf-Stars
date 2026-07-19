/**
 * The graphic MOTHERSHIP clubhouse for Story Tour's spaceport (GS-story-clubhouse-scene): the campaign hub
 * you return to between worlds, rendered as ONE interactive scene aboard the Mothership rather than a flat
 * list of buttons. You SEE your golfer standing on the deck (their look), the Prognostic Parrot behind the
 * bar, your equipped ship parked in the hangar bay, and your active caddy at your side — then you TAP a place
 * to go there: the viewport for the star chart, the hangar bay for your fleet, the locker bank for your gear,
 * the bar for the Crow's Nest.
 *
 * This is the story spaceport's OWN identity — a warm-lit wreck-of-a-Mothership interior, distinct from the
 * cosmetic title Clubhouse (`clubhouseLounge.ts`, the Voyage/Unending wardrobe). Reuses the proven scene
 * idiom from the Earth clubhouse + the Crow's Nest (container-query sizing, feet-anchored figures, an SVG
 * backdrop with absolutely-positioned tap hotspots). All art is hand-placed (ZERO rng) so it's byte-stable.
 * Its OWN CSS prefix (`.gs-sclub*`) — never the play HUD's `.gs-hud` (see CLAUDE.md on the global-class
 * gotcha). Pure render; reads only the passed StoryState.
 */

import { getCharacter } from '../sim/rpg/characters';
import { golferPreviewSVG } from './apparelArt';
import { shipSVG } from './shipArt';
import { shipById } from '../sim/rpg/ships';
import { prognosticParrotPortraitSVG, carrionCrowPortraitSVG } from './loreArt';
import { caddyPortraitSVG } from './caddyPortraits';
import { lorePortraitSVG } from './loreArt';
import { activeStoryCaddy } from '../sim/rpg/storyCaddies';
import { crewRoster, allyName } from '../sim/rpg/storyAllies';
import { heraldCrew, type HeraldAgent } from '../sim/rpg/storyHeraldCrew';
import type { StoryState } from '../sim/rpg/story';

/** The Parrot's lore bust, made embeddable at 320×340 inside a positioned `<g transform>` (the Crow's Nest
 *  idiom) so the bird behind the bar is unmistakably the same character. */
function embeddableParrotBust(): string {
  return prognosticParrotPortraitSVG()
    .replace('width="100%"', 'x="0" y="0" width="320" height="340"')
    .replace(/ style="[^"]*"/, '');
}

/** The Carrion Crow bust made embeddable the same way — the Coil's bartender who takes the bar on the Herald
 *  path (GS-story-herald-clubhouse), in place of the Parrot. */
function embeddableCrowBust(): string {
  return carrionCrowPortraitSVG()
    .replace('width="100%"', 'x="0" y="0" width="320" height="340"')
    .replace(/ style="[^"]*"/, '');
}

/** The Coil's OUROBOROS — a serpent swallowing its tail around a dimpled world (the cult's sigil), shown in
 *  the Herald clubhouse viewport where the Warden ship shows a destination planet. Acid-green + venom-violet. */
function ouroborosSigil(): string {
  return `<g transform="translate(180 78)">
      <circle r="34" fill="none" stroke="#7fe0a0" stroke-width="5" opacity="0.85"/>
      <circle r="34" fill="none" stroke="#b060c0" stroke-width="1.4" opacity="0.7"/>
      <circle r="34" fill="none" stroke="#0d0714" stroke-width="5" stroke-dasharray="2 7" opacity="0.5"/>
      <g transform="rotate(-40)"><path d="M34,-9 q14,3 14,9 q0,6 -14,9 q6,-9 0,-18 Z" fill="#7fe0a0"/><circle cx="42" cy="-2" r="1.6" fill="#0d0714"/></g>
      <circle r="14" fill="#b060c0"/><circle cx="-4" cy="-4" r="14" fill="#c98ad8" opacity="0.5"/>
      ${[[-5, -4], [3, -6], [6, 2], [-3, 4], [0, -1], [-7, 1]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#5a1f6a" opacity="0.7"/>`).join('')}
    </g>`;
}

/**
 * The illustrated Mothership interior (SVG backdrop). viewBox 0 0 400 300 (4:3). Hand-placed, byte-stable.
 * Left column: the hangar bay (top) + the locker bank (bottom). Centre-back: the star-chart viewport.
 * Right: the bar with the Parrot. A warm-lit deck across the foreground.
 */
function spaceportArt(shipId: string, herald: boolean): string {
  // On the dark path the Crow tends the bar in the Parrot's place (canon: the Carrion Prophet, his mirror).
  const bust = herald ? embeddableCrowBust() : embeddableParrotBust();
  const bottle = (x: number, col: string, h = 26) =>
    `<g transform="translate(${x} ${118 - h})">
       <rect x="0" y="0" width="7" height="${h}" rx="2.4" fill="${col}"/>
       <rect x="2" y="-4" width="3" height="5" fill="#2a2018"/>
       <rect x="1" y="3" width="1.6" height="${h - 8}" fill="#fff" opacity="0.35"/>
     </g>`;
  // GS-story-herald-clubhouse: on the dark path the Mothership becomes the Coil's — violet-dark walls, an
  // acid-green wash, and an OUROBOROS sigil in the viewport instead of a destination planet. (The Parrot's
  // bar stays: canon has him loyal even if you turn.) The Warden palette is the default, byte-identical.
  const p = herald
    ? { wall1: '#241033', wall2: '#0c0714', floor1: '#241436', floor2: '#0f0818', glow: '#7fe0a0', frame: '#b060c0' }
    : { wall1: '#20293c', wall2: '#121826', floor1: '#2a3346', floor2: '#141a26', glow: '#ffdca0', frame: '#7fd8ff' };
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"
    style="position:absolute;inset:0;">
    <defs>
      <linearGradient id="sc-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.wall1}"/><stop offset="100%" stop-color="${p.wall2}"/>
      </linearGradient>
      <linearGradient id="sc-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.floor1}"/><stop offset="100%" stop-color="${p.floor2}"/>
      </linearGradient>
      <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a1030"/><stop offset="55%" stop-color="#1a1444"/><stop offset="100%" stop-color="#2a1050"/>
      </linearGradient>
      <radialGradient id="sc-neb" cx="38%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#6a4fb0" stop-opacity="0.6"/><stop offset="100%" stop-color="#6a4fb0" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sc-bay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0a0f1e"/><stop offset="100%" stop-color="#141d34"/>
      </linearGradient>
      <linearGradient id="sc-counter" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6e4a2c"/><stop offset="100%" stop-color="#3a2614"/>
      </linearGradient>
      <radialGradient id="sc-lamp" cx="50%" cy="0%" r="90%">
        <stop offset="0%" stop-color="${p.glow}" stop-opacity="0.42"/><stop offset="100%" stop-color="${p.glow}" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="sc-port"><rect x="120" y="30" width="120" height="98" rx="7"/></clipPath>
      <clipPath id="sc-hangar"><rect x="8" y="42" width="92" height="96" rx="5"/></clipPath>
    </defs>

    <!-- back wall + panel seams + rivets -->
    <rect width="400" height="228" fill="url(#sc-wall)"/>
    ${[40, 96, 152].map((y) => `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#00000030" stroke-width="1.4"/>`).join('')}
    ${[20, 200, 380].map((x) => [16, 210].map((y) => `<circle cx="${x}" cy="${y}" r="2" fill="#39445c"/>`).join('')).join('')}

    <!-- warm ceiling glow -->
    <ellipse cx="215" cy="150" rx="150" ry="96" fill="url(#sc-lamp)"/>

    <!-- ══ HANGAR BAY (upper-left): open bay onto space, the parked ship ══ -->
    <g>
      <rect x="4" y="38" width="100" height="104" rx="7" fill="#0a0f1e" stroke="#39455f" stroke-width="3"/>
      <g clip-path="url(#sc-hangar)">
        <rect x="8" y="42" width="92" height="96" fill="url(#sc-bay)"/>
        <g fill="#cfe0ff"><circle cx="24" cy="60" r="1"/><circle cx="70" cy="54" r="1.2"/><circle cx="52" cy="78" r="0.9"/><circle cx="86" cy="88" r="1"/><circle cx="30" cy="98" r="1.1"/></g>
        <!-- launch-pad glow + the equipped ship -->
        <ellipse cx="54" cy="122" rx="42" ry="9" fill="#7fd8ff" opacity="0.22"/>
        <ellipse cx="54" cy="122" rx="30" ry="6" fill="none" stroke="#7fd8ff" stroke-width="1" opacity="0.6" stroke-dasharray="4 4"/>
        ${shipSVG(shipId, 54, 108, 1.35)}
      </g>
      <!-- retracted bay-door halves + rail -->
      <rect x="4" y="38" width="10" height="104" fill="#1a2438"/>
      <rect x="94" y="38" width="10" height="104" fill="#1a2438"/>
      <rect x="9" y="34" width="90" height="6" rx="2" fill="#2a3651"/>
      <rect x="9" y="140" width="90" height="6" rx="2" fill="#2a3651"/>
    </g>

    <!-- ══ LOCKER BANK (lower-left) ══ -->
    <g>
      <rect x="8" y="150" width="92" height="72" rx="4" fill="#1b2333" stroke="#33405a" stroke-width="2"/>
      ${[8, 39, 70].map((lx) => `<g>
        <rect x="${lx + 3}" y="154" width="26" height="64" rx="3" fill="#232d40" stroke="#3a4864" stroke-width="1.4"/>
        <rect x="${lx + 6}" y="159" width="20" height="9" rx="1.5" fill="#151c2b"/>
        <circle cx="${lx + 24}" cy="188" r="1.6" fill="#8a97ad"/>
      </g>`).join('')}
      <rect x="8" y="150" width="92" height="6" fill="#2a3651"/>
    </g>

    <!-- ══ STAR-CHART VIEWPORT (centre-back) ══ -->
    <g>
      <rect x="116" y="26" width="128" height="106" rx="9" fill="#0a0d18"/>
      <g clip-path="url(#sc-port)">
        <rect x="120" y="30" width="120" height="98" fill="url(#sc-sky)"/>
        <ellipse cx="176" cy="72" rx="80" ry="56" fill="url(#sc-neb)"/>
        <g fill="#fff">
          <circle cx="140" cy="48" r="1.1"/><circle cx="176" cy="42" r="0.9"/><circle cx="214" cy="52" r="1.2"/>
          <circle cx="150" cy="88" r="1"><animate attributeName="opacity" values="1;0.3;1" dur="3.6s" repeatCount="indefinite"/></circle>
          <circle cx="206" cy="98" r="1"/><circle cx="230" cy="76" r="1.1"/><circle cx="132" cy="110" r="1"/>
          <circle cx="196" cy="116" r="1.2"><animate attributeName="opacity" values="0.4;1;0.4" dur="2.9s" repeatCount="indefinite"/></circle>
        </g>
        ${
          herald
            ? ouroborosSigil()
            : `<!-- a ringed planet ahead: the destination -->
        <g transform="translate(210 108)">
          <circle r="18" fill="#d8a24a"/><circle cx="-6" cy="-6" r="18" fill="#e8bd6e" opacity="0.5"/>
          <ellipse rx="30" ry="8" fill="none" stroke="#ffe6a6" stroke-width="2.6" transform="rotate(-18)" opacity="0.85"/>
        </g>
        <!-- faint charted route line -->
        <path d="M132,120 Q168,96 210,108" fill="none" stroke="#7fd8ff" stroke-width="1" opacity="0.55" stroke-dasharray="3 4"/>`
        }
      </g>
      <rect x="116" y="26" width="128" height="106" rx="9" fill="none" stroke="#3a475f" stroke-width="4"/>
      <rect x="118" y="28" width="124" height="102" rx="7" fill="none" stroke="${p.frame}" stroke-width="1" opacity="0.35"/>
    </g>

    <!-- ══ BAR + PARROT (right) ══ -->
    <g>
      <!-- neon sign -->
      <ellipse cx="326" cy="46" rx="70" ry="15" fill="#7fe0a0" opacity="0.12"/>
      <rect x="266" y="34" width="120" height="26" rx="6" fill="#0d1512" stroke="#274a38" stroke-width="1.4"/>
      <text x="326" y="52" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="14" fill="#d6ffe6">The Crow's Nest</text>
      <!-- back-bar shelf + glowing bottles -->
      <rect x="258" y="70" width="136" height="52" rx="3" fill="#241a12"/>
      <rect x="258" y="70" width="136" height="52" rx="3" fill="none" stroke="#3f2b18" stroke-width="1.6"/>
      <rect x="262" y="99" width="128" height="3" fill="#4a3520"/>
      ${bottle(272, '#7fe0a0', 24)}${bottle(288, '#e8c25a', 20)}${bottle(304, '#6ab6ff', 26)}${bottle(356, '#ff6b6b', 22)}${bottle(372, '#4fd8c8', 24)}
      <!-- the Parrot behind the counter (his lore bust) -->
      <g transform="translate(300 78) scale(0.30)">${bust}</g>
      <!-- bar counter -->
      <rect x="252" y="150" width="146" height="12" rx="4" fill="#8a6034"/>
      <rect x="252" y="150" width="146" height="4" rx="2" fill="#b9884a"/>
      <rect x="256" y="162" width="140" height="30" fill="url(#sc-counter)"/>
      <!-- a full glass left for you -->
      <g transform="translate(300 150)"><path d="M-6 -14 L6 -14 L4 0 L-4 0 Z" fill="#7fe0a0" opacity="0.85"/><ellipse cx="0" cy="0" rx="5" ry="1.6" fill="#0c0906"/></g>
    </g>

    <!-- ══ DECK ══ -->
    <rect x="0" y="222" width="400" height="78" fill="url(#sc-floor)"/>
    <line x1="0" y1="222" x2="400" y2="222" stroke="#0c111c" stroke-width="3"/>
    ${[40, 110, 180, 250, 320, 390].map((x) => `<line x1="${x}" y1="222" x2="${x - 26}" y2="300" stroke="#00000033" stroke-width="1.3"/>`).join('')}
    <ellipse cx="200" cy="250" rx="150" ry="15" fill="#ffd98a" opacity="0.05"/>
  </svg>`;
}

/** A tap hotspot over the scene: a label chip anchored to a rectangular zone, brightening on hover. The zone
 *  itself is near-transparent (the SVG art carries the look); the chip names where it goes. */
function hotspot(
  action: object,
  label: string,
  rect: { l: number; t: number; w: number; h: number },
  aria: string,
  cornerLabel: 'top' | 'bottom' = 'bottom',
): string {
  return `<button class="gs-sclub-hot" data-action='${JSON.stringify(action)}' aria-label="${aria}"
    style="left:${rect.l}%;top:${rect.t}%;width:${rect.w}%;height:${rect.h}%;">
    <span class="gs-sclub-lab gs-sclub-lab--${cornerLabel}">${label}</span>
  </button>`;
}

/**
 * The full interactive Mothership clubhouse scene: the illustrated room, its four tap hotspots (star chart /
 * hangar / locker / bar), your golfer standing on the deck, and — if one is on the bag — your active caddy at
 * your side. Container-query sized so the figures scale with the room. Reads only the passed StoryState.
 */
export function spaceportSceneHTML(story: StoryState): string {
  const ch = getCharacter(story.characterId);
  const ship = shipById(story.equippedShipId);
  const shipName = ship?.name ?? 'Station Wagon';
  const figure = ch
    ? golferPreviewSVG(undefined, undefined, undefined, {
        skin: ch.style.skin,
        shirtBase: ch.style.shirt,
        capColor: ch.style.cap,
        hair: ch.style.hair,
        uid: `sclub${ch.id.replace(/[^a-z0-9]/gi, '')}`,
        w: 72,
        h: 210,
      })
    : '';
  const activeCaddyId = activeStoryCaddy(story);
  const herald = story.alignment === 'herald';

  // Your golfer, feet-anchored on the deck, centre-front. Tap → your locker (change your bag & gear).
  const playerBtn = ch
    ? `<button class="gs-sclub-golfer" data-action='${JSON.stringify({ type: 'openStoryLocker' })}'
        aria-label="You — ${ch.name}. Open your locker."
        style="left:44%;top:97%;width:15cqw;">
        <span class="gs-sclub-hint">You ★</span>
        <span class="gs-sclub-shadow" style="background:radial-gradient(ellipse at 50% 50%, ${ch.style.cap}66, #0000 70%);"></span>
        ${figure}
        <span class="gs-sclub-plate">${ch.shortName} ★</span>
      </button>`
    : '';

  // GS-story-crew-scene / GS-story-herald-clubhouse: the crew stand around the clubhouse. On the WARDEN /
  // undecided path that's your recruited caddies (the active one at your side, "on the bag"). On the HERALD
  // path it's the Coil's inner circle instead (Voss, Venoma, Ouros, Ecdysis) — your dark-path "allies".
  let crewStandees: string;
  if (herald) {
    const agents = heraldCrew(story);
    // Voss (the mentor, index 0) stands at your side; the rest gather along the deck.
    crewStandees = agents
      .slice(0, HERALD_SPOTS.length)
      .map((a, i) => heraldStandee(a, HERALD_SPOTS[i]!, i === 0))
      .join('');
  } else {
    const others = crewRoster(story).filter((id) => id !== activeCaddyId);
    const active = activeCaddyId ? crewStandee(activeCaddyId, { left: 62, top: 85 }, true) : '';
    crewStandees =
      others
        .slice(0, CREW_SPOTS.length)
        .map((id, i) => crewStandee(id, CREW_SPOTS[i]!, false))
        .join('') + active;
  }

  return `${SPACEPORT_STYLE}
    <div class="gs-sclub-scene${herald ? ' gs-sclub-scene--herald' : ''}">
      ${spaceportArt(story.equippedShipId, herald)}
      ${hotspot({ type: 'openStoryMap' }, '🗺 Set course', { l: 28, t: 8, w: 34, h: 36 }, 'Set course — the star chart', 'top')}
      ${hotspot({ type: 'openStoryShipyard' }, `🚀 Hangar`, { l: 1, t: 12, w: 25, h: 36 }, `Hangar — fly your fleet (${shipName})`, 'top')}
      ${hotspot({ type: 'openStoryLocker' }, '🎒 Locker', { l: 1, t: 49, w: 25, h: 26 }, 'Locker — build your bag and gear', 'bottom')}
      ${hotspot({ type: 'openStoryBar' }, "🍺 The Crow's Nest", { l: 63, t: 10, w: 36, h: 40 }, herald ? "The Crow's Nest — talk to the Crow" : "The Crow's Nest — talk to the Parrot", 'top')}
      ${crewStandees}
      ${playerBtn}
    </div>`;
}

/** Herald crew deck spots — Voss (index 0) at your side, the rest gathered along the deck. */
const HERALD_SPOTS: { left: number; top: number }[] = [
  { left: 62, top: 85 }, // Voss — your mentor, at your side
  { left: 31, top: 91 },
  { left: 78, top: 82 },
  { left: 90, top: 91 },
];

/** One Coil agent as a feet-anchored standee (their lore portrait, tinted). Tap → their Herald talk card. */
function heraldStandee(agent: HeraldAgent, spot: { left: number; top: number }, mentor: boolean): string {
  const name = agent.name.replace(/^.*?["']([^"']+)["'].*$/, '$1') || agent.name.split(' ')[0];
  const short = agent.name.includes('"') ? name : agent.name.split(' ')[0];
  return `<button class="gs-sclub-caddy gs-sclub-caddy--herald${mentor ? ' gs-sclub-caddy--on' : ''}"
      data-action='${JSON.stringify({ type: 'storyInspectAlly', caddyId: agent.id })}'
      aria-label="Speak with ${agent.name}"
      style="left:${spot.left}%;top:${spot.top}%;">
      <span class="gs-sclub-cav"${agent.tint ? ` style="filter:${agent.tint};"` : ''}>${lorePortraitSVG(agent.portrait)}</span>
      <span class="gs-sclub-cplate">${short}</span>
    </button>`;
}

/** Deck spots (left%, top%) where non-active crew allies stand around the clubhouse — an arc across the deck
 *  that avoids the centre-front player and the door hotspots. Fixed (byte-stable), so identity is stable. */
const CREW_SPOTS: { left: number; top: number }[] = [
  { left: 31, top: 91 }, // left-front, clear of the locker label + the far-left doors
  { left: 56, top: 79 }, // mid, in front of the bar
  { left: 72, top: 90 },
  { left: 85, top: 81 },
  { left: 93, top: 92 },
];

/** One crew ally as a feet-anchored portrait standee on the deck. Tap → their ally talk card. The active
 *  caddy (on the bag) gets a pink ring + a 🎒 plate; the rest get a plain name plate. */
function crewStandee(caddyId: string, spot: { left: number; top: number }, active: boolean): string {
  const name = allyName(caddyId).split(' ')[0];
  return `<button class="gs-sclub-caddy${active ? ' gs-sclub-caddy--on' : ''}"
      data-action='${JSON.stringify({ type: 'storyInspectAlly', caddyId })}'
      aria-label="Talk to ${allyName(caddyId)}${active ? ', on your bag' : ''}"
      style="left:${spot.left}%;top:${spot.top}%;">
      <span class="gs-sclub-cav">${caddyPortraitSVG(caddyId)}</span>
      <span class="gs-sclub-cplate">${active ? `🎒 ${name}` : name}</span>
    </button>`;
}

const SPACEPORT_STYLE = `<style>
  .gs-sclub-scene{container-type:inline-size;position:relative;width:100%;aspect-ratio:4/3;max-width:620px;
    margin:0 auto;border:1px solid #2a3346;border-radius:16px;overflow:hidden;background:#0f1420;
    box-shadow:0 8px 30px -12px #000a;}
  .gs-sclub-hot{position:absolute;background:none;border:1px solid transparent;border-radius:12px;padding:0;
    cursor:pointer;color:inherit;display:flex;align-items:flex-end;justify-content:center;
    transition:background .15s ease,border-color .15s ease,box-shadow .15s ease;}
  .gs-sclub-hot:hover,.gs-sclub-hot:focus-visible{outline:none;background:#7fd8ff14;border-color:#7fd8ff66;
    box-shadow:inset 0 0 24px #7fd8ff22;}
  .gs-sclub-lab{position:absolute;left:50%;transform:translateX(-50%);font-size:clamp(10px,2.6cqw,14px);
    font-weight:800;white-space:nowrap;background:#0b1018d8;color:#eaf2ff;padding:3px 10px;border-radius:20px;
    border:1px solid #33465f;box-shadow:0 2px 6px #0007;pointer-events:none;}
  .gs-sclub-lab--bottom{bottom:6%;}
  .gs-sclub-lab--top{top:5%;}
  .gs-sclub-hot:hover .gs-sclub-lab,.gs-sclub-hot:focus-visible .gs-sclub-lab{background:#123049;border-color:#7fd8ff;color:#dff3ff;}
  .gs-sclub-golfer{position:absolute;background:none;border:0;padding:0;cursor:pointer;color:inherit;
    text-align:center;transform:translate(-50%,-100%);transform-origin:bottom center;
    filter:drop-shadow(0 7px 6px #0009);transition:filter .15s ease,translate .15s ease;z-index:20;}
  .gs-sclub-golfer svg{width:100%;height:auto;display:block;}
  .gs-sclub-golfer:hover,.gs-sclub-golfer:focus-visible{translate:0 -3px;outline:none;filter:drop-shadow(0 10px 9px #000b) brightness(1.07);}
  .gs-sclub-golfer:hover .gs-sclub-hint,.gs-sclub-golfer:focus-visible .gs-sclub-hint{opacity:1;}
  .gs-sclub-shadow{display:block;width:80%;height:1.4cqw;min-height:5px;margin:0 auto -1cqw;border-radius:50%;}
  .gs-sclub-hint{position:absolute;top:-1.6cqw;left:50%;transform:translateX(-50%);font-size:clamp(8px,2cqw,11px);
    font-weight:700;opacity:0;transition:opacity .15s ease;white-space:nowrap;background:#a97b25;color:#2a1a05;
    padding:1px 7px;border-radius:8px;pointer-events:none;}
  .gs-sclub-plate{display:inline-block;margin-top:2px;padding:2px 8px;border-radius:3px;
    background:linear-gradient(180deg,#e8c266,#a97b25);border:1px solid #5c3f12;box-shadow:inset 0 1px 0 #fff6cf,0 1px 2px #0008;
    font-family:Georgia,serif;font-size:clamp(8px,2.1cqw,11.5px);font-weight:800;color:#2a1a05;white-space:nowrap;}
  /* Crew members stand on the deck as PROPER figures — their full portrait bust (head + shoulders + coat),
     feet-anchored, not a cropped floating head. A soft ground shadow + drop-shadow sits them in the room. */
  .gs-sclub-caddy{position:absolute;background:none;border:0;padding:0;cursor:pointer;color:inherit;text-align:center;
    transform:translate(-50%,-100%);z-index:16;transition:transform .15s ease;}
  .gs-sclub-caddy:hover,.gs-sclub-caddy:focus-visible{outline:none;transform:translate(-50%,-100%) scale(1.06);z-index:22;}
  .gs-sclub-caddy--on{z-index:19;}
  .gs-sclub-cav{display:block;width:17cqw;max-width:96px;margin:0 auto -1cqw;filter:drop-shadow(0 5px 5px #000a);}
  .gs-sclub-cav svg{width:100%;height:auto;display:block;}
  .gs-sclub-caddy--on .gs-sclub-cav{width:20cqw;max-width:112px;filter:drop-shadow(0 6px 6px #000b) drop-shadow(0 0 7px #f0a8c8aa);}
  .gs-sclub-cplate{display:inline-block;margin-top:2px;padding:1px 7px;border-radius:10px;background:#0e141edd;
    border:1px solid #33465f;font-size:clamp(7px,1.8cqw,10px);font-weight:700;color:#cdd8ea;white-space:nowrap;position:relative;z-index:1;}
  .gs-sclub-caddy--on .gs-sclub-cplate{background:#231018ee;border-color:#6a3a52;color:#f0a8c8;}
  /* Herald (Coil) crew — venom-violet glow on the active mentor; violet plate. */
  .gs-sclub-caddy--herald.gs-sclub-caddy--on .gs-sclub-cav{filter:drop-shadow(0 6px 6px #000b) drop-shadow(0 0 8px #b060c0cc);}
  .gs-sclub-caddy--herald .gs-sclub-cplate{background:#1a0f24ee;border-color:#5a3a6a;color:#d6b8e8;}
  /* Herald scene: tint the door labels toward the Coil palette. */
  .gs-sclub-scene--herald .gs-sclub-hot:hover,.gs-sclub-scene--herald .gs-sclub-hot:focus-visible{background:#b060c018;border-color:#b060c066;box-shadow:inset 0 0 24px #7fe0a022;}
  .gs-sclub-scene--herald .gs-sclub-hot:hover .gs-sclub-lab,.gs-sclub-scene--herald .gs-sclub-hot:focus-visible .gs-sclub-lab{background:#2a1236;border-color:#b060c0;color:#ecd8f4;}
</style>`;
