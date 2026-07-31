/**
 * The graphic EARTH clubhouse for Story Mode's prologue (GS-story-clubhouse): an illustrated golf
 * clubhouse interior — warm wood, a trophy cabinet, and a big window onto St Annette’s + the North Sea —
 * where the four golfers stand around before the World Tour final. Tapping a golfer opens a stats/abilities
 * overlay (their bars, strengths, watch-fors, signature) with the "play as / switch" action.
 *
 * Reuses the proven lounge composition (container-query sizing so figures scale WITH the room; feet-anchored
 * spots with depth scale; z-index by y). All art is hand-placed (ZERO rng) so it's byte-stable. Its OWN CSS
 * prefix (`.gs-eclub*`) — never the play HUD's `.gs-hud` or the lounge's `.gs-lounge*` (see CLAUDE.md on the
 * global-class gotcha). Pure render; reads no live state.
 */

import { getCharacter, CHARACTERS, type Character } from '../sim/rpg/characters';
import { golferPreviewSVG } from './apparelArt';
import { statBar } from './golferCards';
import type { CampaignTag } from '../sim/rpg/storyRoster';

/** Four feet-anchored floor spots (x%, y%, depth scale) — a gentle arc across the clubhouse floor. Fixed
 *  (no shuffle) so each golfer keeps their place: identity is stable turn to turn. */
const EARTH_SPOTS = [
  { x: 21, y: 83, s: 0.95 },
  { x: 40, y: 91, s: 1.06 },
  { x: 61, y: 91, s: 1.06 },
  { x: 80, y: 83, s: 0.95 },
] as const;

/** A small engraved nameplate under a golfer (brass for the active pick, dark wood for the others). */
function nameplate(name: string, col: string, active: boolean): string {
  const bg = active
    ? 'linear-gradient(180deg,#e8c266,#a97b25)'
    : 'linear-gradient(180deg,#3a2c1c,#241a10)';
  const ink = active ? '#2a1a05' : '#d8c6a4';
  const shadow = active ? 'inset 0 1px 0 #fff6cf,0 1px 2px #0008' : '0 1px 2px #0007';
  return `<span style="display:inline-flex;align-items:center;gap:4px;margin-top:2px;padding:2px 8px;border-radius:3px;
    background:${bg};border:1px solid ${active ? '#5c3f12' : '#12100a'};box-shadow:${shadow};
    font-size:clamp(8px,2.1cqw,11.5px);font-weight:800;letter-spacing:.02em;color:${ink};
    white-space:nowrap;font-family:Georgia,'Times New Roman',serif;">
    <span style="width:.52em;height:.52em;border-radius:50%;flex:none;background:${col};
      box-shadow:0 0 0 1px #0007,inset 0 0 1px 1px #fff8;"></span>${name}${active ? ' ★' : ''}</span>`;
}

/**
 * The CAMPAIGN BADGE over a golfer's head (GS-story-campaign-picker) — "Chp 3" / "Prologue" /
 * "★ Complete" — so the picker answers "have I got a run going, and with whom?" at a glance, before
 * you tap anything.
 *
 * Passed IN rather than looked up here: the `character` screen is shared with Voyage / Unending /
 * Star Tour, and a renderer that fetched the roster itself would badge golfers on every mode's picker.
 * Absent tag ⇒ no badge, which is also exactly what every non-Story caller gets for free.
 */
function campaignBadge(tag: CampaignTag): string {
  const done = tag.kind === 'complete';
  const bg = done ? 'linear-gradient(180deg,#3b2f10,#241c07)' : 'linear-gradient(180deg,#12212f,#0c1620)';
  const edge = done ? '#8a6a1e' : '#2c4a63';
  const ink = done ? '#ffd98a' : '#8fc9ee';
  return `<span aria-hidden="true" style="position:absolute;left:50%;top:-3.4cqw;transform:translateX(-50%);
    z-index:2;padding:1px 7px;border-radius:9px;background:${bg};border:1px solid ${edge};
    box-shadow:0 1px 3px #0009;font-size:clamp(7.5px,1.95cqw,10.5px);font-weight:800;letter-spacing:.02em;
    color:${ink};white-space:nowrap;">${tag.short}</span>`;
}

/** One golfer standing in the clubhouse — the figure + nameplate, the whole thing a button that opens their
 *  stats/abilities overlay. Feet anchored at the spot; sized in cqw so it scales with the room. */
function clubhouseGolferAt(
  ch: Character,
  spot: (typeof EARTH_SPOTS)[number],
  active: boolean,
  tag?: CampaignTag,
): string {
  const action = JSON.stringify({ type: 'storyInspectGolfer', characterId: ch.id });
  const preview = golferPreviewSVG(undefined, undefined, undefined, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    capColor: ch.style.cap,
    hair: ch.style.hair,
    uid: `eclub${ch.id.replace(/[^a-z0-9]/gi, '')}`,
    w: 72,
    h: 210,
  });
  const z = Math.round(spot.y * 10) + (active ? 5 : 0);
  const w = (11.6 * spot.s).toFixed(2);
  const glow = active
    ? `drop-shadow(0 7px 6px #0008) drop-shadow(0 0 7px ${ch.style.cap}dd)`
    : `drop-shadow(0 6px 5px #0007)`;
  // The badge carries real information, so it goes in the accessible NAME too — a sighted player reads
  // "Chp 3" over the figure and a screen-reader player must not have to open the card to learn it.
  const said = tag ? `, ${tag.label}` : '';
  return `<button class="gs-eclub-golfer${active ? ' gs-eclub-golfer--on' : ''}" data-action='${action}'
    aria-label="View ${ch.name}'s stats and abilities${said}"
    style="position:absolute;left:${spot.x}%;top:${spot.y}%;z-index:${z};width:${w}cqw;
      transform:translate(-50%,-100%);transform-origin:bottom center;filter:${glow};">
    ${tag ? campaignBadge(tag) : ''}
    <span class="gs-eclub-hint">${active ? 'You ★' : 'View ⓘ'}</span>
    <span class="gs-eclub-shadow" style="background:radial-gradient(ellipse at 50% 50%, ${ch.style.cap}66, #0000 70%);"></span>
    ${preview}
    ${nameplate(ch.shortName, ch.style.cap, active)}
  </button>`;
}

/** Scoped CSS for the clubhouse golfers + the stats overlay (once per render; own `.gs-eclub*` prefix). */
function eclubStyle(): string {
  return `<style>
    .gs-eclub-golfer{position:absolute;background:none;border:0;padding:0;cursor:pointer;color:inherit;
      text-align:center;transition:filter .15s ease, translate .15s ease;}
    .gs-eclub-golfer svg{width:100%;height:auto;display:block;}
    .gs-eclub-shadow{display:block;width:80%;height:1.4cqw;min-height:5px;margin:0 auto -1cqw;border-radius:50%;}
    .gs-eclub-golfer:hover,.gs-eclub-golfer:focus-visible{translate:0 -3px;outline:none;filter:drop-shadow(0 10px 8px #000a) brightness(1.08);}
    /* GS-a11y-focus: restore the keyboard ring outline:none above suppressed (hover styling kept). */
    .gs-eclub-golfer:focus-visible{outline:2px solid var(--gs-info);outline-offset:3px;}
    .gs-eclub-golfer:hover .gs-eclub-hint,.gs-eclub-golfer:focus-visible .gs-eclub-hint{opacity:1;}
    .gs-eclub-hint{position:absolute;top:-1.8cqw;left:50%;transform:translateX(-50%);font-size:clamp(8px,2cqw,11px);
      font-weight:700;opacity:0;transition:opacity .15s ease;white-space:nowrap;background:#000a;color:#ffe6a6;
      padding:1px 6px;border-radius:8px;pointer-events:none;}
    .gs-eclub-golfer--on .gs-eclub-hint{background:#a97b25;color:#2a1a05;}
    /* stats/abilities overlay */
    .gs-eclub-ov{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;
      background:rgba(6,8,14,0.66);backdrop-filter:blur(2px);animation:gs-eclub-fade .16s ease both;}
    .gs-eclub-card{width:100%;max-width:460px;margin:0 10px;background:linear-gradient(180deg,#1a140c,#120d07);
      border:1px solid #4a3a22;border-top-color:#6a5228;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px #000a;
      padding:16px 16px 22px;animation:gs-eclub-rise .2s cubic-bezier(.2,.8,.2,1) both;}
    @media(min-width:560px){.gs-eclub-ov{align-items:center;}.gs-eclub-card{border-radius:16px;}}
    @keyframes gs-eclub-fade{from{opacity:0;}to{opacity:1;}}
    @keyframes gs-eclub-rise{from{transform:translateY(16px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
    @media(prefers-reduced-motion:reduce){.gs-eclub-ov,.gs-eclub-card{animation:none;}}
    .gs-eclub-ablist{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:3px;}
    .gs-eclub-ablist li{font-size:13px;line-height:1.35;}
  </style>`;
}

/**
 * The illustrated clubhouse room (SVG backdrop): a wood-panelled interior with a trophy cabinet, a chalk
 * leaderboard, warm lamps, and a big picture window onto St Annette’s links and the North Sea. viewBox
 * 0 0 400 300 (4:3). Hand-placed, byte-stable.
 */
function earthClubhouseArt(): string {
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"
    style="position:absolute;inset:0;">
    <defs>
      <linearGradient id="ec-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3a2817"/><stop offset="100%" stop-color="#241809"/>
      </linearGradient>
      <linearGradient id="ec-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5a3f24"/><stop offset="100%" stop-color="#3a2814"/>
      </linearGradient>
      <linearGradient id="ec-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cfe0ea"/><stop offset="58%" stop-color="#aec6d4"/><stop offset="100%" stop-color="#8fb0be"/>
      </linearGradient>
      <linearGradient id="ec-sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6f97a4"/><stop offset="100%" stop-color="#4c7683"/>
      </linearGradient>
      <linearGradient id="ec-links" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6fae55"/><stop offset="100%" stop-color="#4c8a3c"/>
      </linearGradient>
      <radialGradient id="ec-lamp" cx="50%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffd98a" stop-opacity="0.42"/><stop offset="100%" stop-color="#ffd98a" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- back wall + plank lines -->
    <rect width="400" height="230" fill="url(#ec-wall)"/>
    ${[26, 58, 90, 122, 154, 186].map((y) => `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#00000033" stroke-width="1.5"/>`).join('')}
    ${[70, 140, 210, 280, 350].map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="230" stroke="#00000022" stroke-width="1"/>`).join('')}

    <!-- warm ceiling lamp + glow -->
    <ellipse cx="200" cy="70" rx="150" ry="90" fill="url(#ec-lamp)"/>

    <!-- WALL CAST SHADOWS (GS-clubhouse-floor). The cabinet, the window and the leaderboard were drawn
         flat onto the panelling, so the room read as a printed backdrop with four people standing in
         front of it. One soft offset slab behind each, down-and-right off the shared upper-left key,
         buys them thickness. Drawn BEFORE the pieces so each sits on its own shadow. -->
    <g fill="#000" opacity="0.3">
      <rect x="24" y="74" width="74" height="150" rx="4"/>
      <rect x="119" y="35" width="170" height="110" rx="5"/>
      <rect x="310" y="74" width="76" height="96" rx="3"/>
    </g>
    <line x1="200" y1="0" x2="200" y2="16" stroke="#1c130a" stroke-width="2"/>
    <path d="M182,16 L218,16 L212,30 L188,30 Z" fill="#2a1c0e"/>
    <ellipse cx="200" cy="30" rx="15" ry="3.4" fill="#ffcf7a"/>

    <!-- the big picture window onto St Annette’s -->
    <g>
      <rect x="118" y="34" width="164" height="104" rx="4" fill="#0d0a06"/>
      <rect x="123" y="39" width="154" height="94" fill="url(#ec-sky)"/>
      <!-- sea band + horizon -->
      <rect x="123" y="86" width="154" height="20" fill="url(#ec-sea)"/>
      <!-- far town / R&A clubhouse silhouette on the horizon -->
      <g fill="#3d5560" opacity="0.7">
        <rect x="132" y="76" width="14" height="12"/><rect x="146" y="70" width="10" height="18"/>
        <rect x="158" y="78" width="8" height="10"/><rect x="230" y="74" width="12" height="14"/>
        <rect x="244" y="79" width="9" height="9"/>
      </g>
      <!-- links: rolling fairway + a green with the pin -->
      <rect x="123" y="104" width="154" height="29" fill="url(#ec-links)"/>
      <path d="M123,110 Q160,102 200,108 T277,106 L277,133 L123,133 Z" fill="#5c9e46"/>
      <ellipse cx="212" cy="123" rx="24" ry="7" fill="#7ec25e"/>
      <line x1="212" y1="123" x2="212" y2="110" stroke="#e8e8ea" stroke-width="1.2"/>
      <path d="M212,110 L221,113 L212,116 Z" fill="#ff5a5a"/>
      <!-- the Annette Bridge, a little stone hump over the burn -->
      <path d="M150,128 Q160,120 170,128" fill="none" stroke="#8a8172" stroke-width="3.4"/>
      <!-- window mullions -->
      <line x1="200" y1="39" x2="200" y2="133" stroke="#0d0a06" stroke-width="4"/>
      <line x1="123" y1="86" x2="277" y2="86" stroke="#0d0a06" stroke-width="3"/>
      <rect x="115" y="31" width="170" height="110" rx="5" fill="none" stroke="#5a4326" stroke-width="4"/>
    </g>

    <!-- trophy cabinet, left wall -->
    <g>
      <rect x="20" y="70" width="74" height="150" rx="4" fill="#1c130a" stroke="#3a2a17" stroke-width="2"/>
      ${[92, 130, 168].map((sy) => `<rect x="24" y="${sy}" width="66" height="3" fill="#3a2a17"/>`).join('')}
      <!-- gold trophies on the shelves (the World Tour) -->
      ${[[38, 90], [58, 90], [78, 90], [46, 128], [70, 128], [56, 166]]
        .map(([tx, ty]) => `<g transform="translate(${tx},${ty})">
          <path d="M-4,-12 Q-4,-4 0,-3 Q4,-4 4,-12 Z" fill="#f0c64e"/>
          <path d="M-4,-11 C-8,-11 -8,-6 -4,-6 M4,-11 C8,-11 8,-6 4,-6" fill="none" stroke="#f0c64e" stroke-width="1.2"/>
          <rect x="-1.2" y="-3" width="2.4" height="3" fill="#c99a2e"/><rect x="-3.4" y="0" width="6.8" height="2" rx="0.6" fill="#a97b25"/>
        </g>`).join('')}
      <!-- GS-clubhouse-floor: the cabinet met the floor line dead flat with nothing beneath it. A PLINTH
           that oversails the carcass, lit along its top edge, gives the eye a horizontal surface exactly
           where the case meets the boards — the cue that separates standing furniture from wall art. -->
      <rect x="17" y="214" width="80" height="9" rx="2" fill="#150e06"/>
      <rect x="17" y="214" width="80" height="2.2" fill="#4a3520" opacity="0.9"/>
    </g>

    <!-- chalk leaderboard, right wall -->
    <g>
      <rect x="306" y="70" width="76" height="96" rx="3" fill="#20301f" stroke="#4a3a22" stroke-width="3"/>
      <text x="344" y="86" fill="#eae0c0" font-size="10" font-weight="700" text-anchor="middle" font-family="Georgia,serif">WORLD TOUR</text>
      <line x1="314" y1="92" x2="374" y2="92" stroke="#5a6a52" stroke-width="1"/>
      ${['1  ·······', '2  ·······', '3  ·······', '4  ·······'].map((t, i) => `<text x="314" y="${106 + i * 13}" fill="#b9c7a8" font-size="8.5" font-family="monospace">${t}</text>`).join('')}
    </g>

    <!-- floor -->
    <rect x="0" y="222" width="400" height="78" fill="url(#ec-floor)"/>
    ${[0, 50, 100, 150, 200, 250, 300, 350].map((x) => `<line x1="${x}" y1="222" x2="${x - 20}" y2="300" stroke="#00000030" stroke-width="1.4"/>`).join('')}
    <line x1="0" y1="222" x2="400" y2="222" stroke="#1c120a" stroke-width="3"/>
    <!-- CONTACT SHADOWS (GS-clubhouse-floor): the golfers were the only things casting onto the boards.
         Drawn AFTER the floor so they darken it, tight and soft at the foot of each standing piece. -->
    <ellipse cx="57" cy="224" rx="46" ry="8" fill="#000" opacity="0.36"/>
    <ellipse cx="106" cy="250" rx="17" ry="5" fill="#000" opacity="0.3"/>
    <ellipse cx="200" cy="252" rx="150" ry="16" fill="#ffd98a" opacity="0.06"/>

    <!-- a golf bag leaning by the cabinet, foreground dressing -->
    <g transform="translate(102,214)">
      <rect x="-7" y="-4" width="14" height="40" rx="6" fill="#7a2f2f" transform="rotate(-8)"/>
      <rect x="-6" y="-14" width="12" height="12" rx="3" fill="#5a2020" transform="rotate(-8)"/>
      ${[-4, -1, 2].map((gx) => `<line x1="${gx}" y1="-14" x2="${gx - 3}" y2="-26" stroke="#ccc" stroke-width="1.4" transform="rotate(-8)"/>`).join('')}
    </g>
  </svg>`;
}

/** The full clubhouse scene: the room + the four golfers (the active one highlighted). Container-query
 *  sized so figures scale with the room. */
export function earthClubhouseSceneHTML(
  activeId: string | null,
  /** GS-story-campaign-picker: campaign tags by golfer id, for the picker's badges. Omitted everywhere
   *  else (and by every non-Story caller) ⇒ no badges, byte-for-byte the classic scene. */
  tags: Record<string, CampaignTag> = {},
): string {
  const figures = CHARACTERS.map((ch, i) =>
    clubhouseGolferAt(ch, EARTH_SPOTS[i % EARTH_SPOTS.length]!, ch.id === activeId, tags[ch.id]),
  ).join('');
  // isolation:isolate confines the golfers' high z-indices to this scene's own stacking context, so the
  // fixed stats overlay (z-index 60, a later sibling) always paints ABOVE them — without it the feet-anchored
  // figures (z up to ~915) bled on top of the inspect card (the "golfers overlay the stat screen" bug).
  return `${eclubStyle()}
    <div style="container-type:inline-size;position:relative;isolation:isolate;width:100%;aspect-ratio:4/3;max-width:620px;
      margin:0 auto;border:1px solid #3a2f1f;border-radius:16px;overflow:hidden;background:#140d07;">
      ${earthClubhouseArt()}
      ${figures}
    </div>`;
}

/**
 * The stats/abilities overlay for one golfer (GS-story-clubhouse). Shows the portrait, signature, stat
 * bars, strengths (abilities) and watch-fors, and a primary action button (Play as / Switch / your golfer).
 * `primary` is the action row; the whole card is the modal (tapping the backdrop closes it).
 */
export function golferInspectOverlayHTML(
  characterId: string,
  primary: { label: string; action: object; disabled?: boolean },
  /** GS-story-campaign-picker: this golfer's campaign state + an optional SECOND action under the
   *  primary one (the picker's "start over", which is destructive and therefore never the fat button).
   *  Both optional ⇒ every existing caller renders exactly as before. */
  extra: { tag?: CampaignTag; secondary?: { label: string; action: object } } = {},
): string {
  const ch = getCharacter(characterId);
  if (!ch) return '';
  const portrait = golferPreviewSVG(undefined, undefined, undefined, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    capColor: ch.style.cap,
    hair: ch.style.hair,
    uid: `eclubov${ch.id.replace(/[^a-z0-9]/gi, '')}`,
    w: 72,
    h: 210,
  });
  const cap = ch.style.cap;
  const abilities = ch.pros
    .map((p) => `<li><span style="color:var(--gs-accent,#7fe0a0);">✦</span> <span style="color:var(--gs-ink,#eee);">${p}</span></li>`)
    .join('');
  const watch = ch.cons
    .map((c) => `<li><span style="color:var(--gs-warn,#e6a24a);">▲</span> <span style="color:var(--gs-dim,#9aa);">${c}</span></li>`)
    .join('');
  const st = ch.stats;
  const btn = primary.disabled
    ? `<div class="gs-btn" style="opacity:0.6;cursor:default;text-align:center;">${primary.label}</div>`
    : `<button class="gs-btn" data-action='${JSON.stringify(primary.action)}'>${primary.label}</button>`;
  // GS-story-campaign-picker: the destructive action is deliberately the GHOST button under the primary
  // one — continuing is the safe, common choice and should be the fat one under a thumb.
  const secondaryBtn = extra.secondary
    ? `<button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify(extra.secondary.action)}'>${extra.secondary.label}</button>`
    : '';
  const tagLine = extra.tag
    ? `<div style="margin-top:5px;font-size:12px;font-weight:800;letter-spacing:.02em;
        color:${extra.tag.kind === 'complete' ? '#ffd98a' : '#8fc9ee'};">${extra.tag.label}</div>`
    : '';
  return `${eclubStyle()}
    <div class="gs-eclub-ov" data-action='${JSON.stringify({ type: 'storyCloseInspect' })}'>
      <div class="gs-eclub-card" data-eclub-keep="1" onclick="event.stopPropagation()">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div style="flex:0 0 84px;filter:drop-shadow(0 4px 6px #0008) drop-shadow(0 0 8px ${cap}aa);">${portrait}</div>
          <div style="flex:1 1 auto;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <h3 style="margin:0;font-size:19px;color:var(--gs-ink,#fff);">${ch.name}</h3>
              <button class="gs-eclub-x" data-action='${JSON.stringify({ type: 'storyCloseInspect' })}'
                aria-label="Close" style="background:none;border:0;color:var(--gs-dim,#9aa);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px;">✕</button>
            </div>
            <div style="font-size:12px;color:${cap};font-weight:700;letter-spacing:.02em;margin-top:1px;">${ch.origin} · ${ch.identity}</div>
            ${tagLine}
            <p style="margin:6px 0 0;font-size:13px;line-height:1.4;color:var(--gs-dim,#9aa);">${ch.blurb}</p>
          </div>
        </div>

        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">
          ${statBar('PWR', st.power, cap)}${statBar('ACC', st.accuracy, cap)}
          ${statBar('TCH', st.touch, cap)}${statBar('CON', st.consistency, cap)}
        </div>

        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;">
          <div>
            <div style="font-size:11px;letter-spacing:.08em;color:var(--gs-accent,#7fe0a0);font-weight:800;">STRENGTHS</div>
            <ul class="gs-eclub-ablist">${abilities}</ul>
          </div>
          <div>
            <div style="font-size:11px;letter-spacing:.08em;color:var(--gs-warn,#e6a24a);font-weight:800;">WATCH FOR</div>
            <ul class="gs-eclub-ablist">${watch}</ul>
          </div>
        </div>

        <button class="gs-eclub-lorebtn" data-action='${JSON.stringify({ type: 'showCharacterLore', characterId: ch.id })}'
          style="margin-top:12px;width:100%;padding:9px;border-radius:10px;border:1px solid ${cap}66;
            background:${cap}14;color:${cap};font-size:12.5px;font-weight:700;cursor:pointer;">
          📖 Read ${ch.shortName}'s story
        </button>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">${btn}${secondaryBtn}</div>
      </div>
    </div>`;
}
