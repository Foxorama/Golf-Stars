/**
 * The character-select LORE popup (GS-char-lore). Every select screen (the card grid used by Voyage /
 * Unending Universe / Star Tour, AND the Story clubhouse inspect) can raise THIS card by tapping a
 * golfer's portrait: a bottom-sheet (centred on desktop) that tells you WHO the golfer is — name,
 * age, blood type, gender & pronouns, relationship, best wins, lowest career moment, and a fun fact —
 * over a subtle procedural silhouette of their HOMETOWN.
 *
 * Assetless house style (like the audio + all other art): the hometown backdrop is a hand-placed
 * inline-SVG skyline per `Character.origin`, never a downloaded image. Pure string builder — no DOM,
 * no rng, reads no module state — dropped into a screen via innerHTML like the other overlays.
 *
 * Self-contained: ships its OWN `<style>` with a dedicated `.gs-charlore*` prefix (NEVER the play HUD's
 * `.gs-hud`, per the CSS-collision rule), so it adds no shared global class and can't restyle another
 * screen. Open/close is a reducer field (`characterLoreId`) + `showCharacterLore`/`closeCharacterLore`.
 */

import { type Character } from '../sim/rpg/characters';
import { golferPreviewSVG } from './apparelArt';

/** The `data-action` that closes the lore popup — applied to the backdrop and the ✕. */
const CLOSE_ACTION = JSON.stringify({ type: 'closeCharacterLore' });

/**
 * A subtle procedural silhouette of a golfer's hometown, keyed by `Character.origin`. Assetless — a
 * hand-placed skyline/landscape in flat bands, sized to fill the card header and dimmed by the card's
 * gradient so it reads as atmosphere, not a photo. viewBox 0 0 400 150. Falls back to a generic
 * horizon for an unknown origin so a new golfer never renders a blank header.
 */
export function hometownBackdropSVG(origin: string, accent: string): string {
  const sky = (a: string, b: string): string =>
    `<rect width="400" height="150" fill="url(#ht-sky)"/>
     <defs><linearGradient id="ht-sky" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/>
     </linearGradient></defs>`;
  const sun = (cx: number, cy: number, r: number, col: string): string =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" opacity="0.85"/>`;

  let scene: string;
  if (origin.includes('Nairobi')) {
    // Savanna at golden hour: low sun, rolling Ngong Hills, a lone acacia, a distant tower.
    scene = `${sky('#f2a65a', '#7a3b2e')}
      ${sun(300, 92, 34, '#ffe08a')}
      <path d="M0 96 Q90 74 180 92 T400 84 V150 H0 Z" fill="#5c3320" opacity="0.9"/>
      <path d="M0 112 Q120 96 240 110 T400 104 V150 H0 Z" fill="#3f2214"/>
      <rect x="66" y="58" width="10" height="60" fill="#2a1810"/>
      <rect x="62" y="50" width="18" height="10" rx="2" fill="#2a1810"/>
      <g fill="#241009">
        <rect x="150" y="70" width="4" height="48"/>
        <path d="M152 66 Q128 60 116 74 Q140 66 152 74 Q164 66 188 74 Q176 60 152 66 Z"/>
      </g>`;
  } else if (origin.includes('Busan')) {
    // Coastal night: mountains, a lit suspension bridge over the sea, city towers.
    scene = `${sky('#243b6b', '#0e1b3a')}
      ${sun(70, 46, 22, '#cfe0ff')}
      <path d="M0 82 L70 44 L120 80 L200 40 L280 82 L360 50 L400 78 V150 H0 Z" fill="#16233f"/>
      <rect x="120" y="104" width="400" height="46" fill="#0b1730"/>
      <g fill="#22345c">
        <rect x="150" y="70" width="14" height="40"/><rect x="170" y="58" width="16" height="52"/>
        <rect x="192" y="76" width="12" height="34"/><rect x="300" y="64" width="15" height="46"/>
        <rect x="320" y="74" width="12" height="36"/>
      </g>
      <path d="M40 104 Q130 70 220 104" fill="none" stroke="${accent}" stroke-width="2" opacity="0.85"/>
      ${[60, 100, 140, 180].map((x) => `<line x1="${x}" y1="${104 - (1 - Math.abs(x - 130) / 130) * 24}" x2="${x}" y2="104" stroke="${accent}" stroke-width="1.2" opacity="0.6"/>`).join('')}`;
  } else if (origin.includes('Perth')) {
    // Sun-baked riverfront: bright sky, the Swan River, a modern skyline.
    scene = `${sky('#7fc7e8', '#e9d38a')}
      ${sun(330, 44, 28, '#fff4c2')}
      <g fill="#2f6f8f">
        <rect x="120" y="60" width="18" height="60"/><rect x="142" y="46" width="20" height="74"/>
        <rect x="166" y="66" width="14" height="54"/><rect x="184" y="52" width="22" height="68"/>
        <rect x="210" y="70" width="16" height="50"/><rect x="230" y="58" width="18" height="62"/>
      </g>
      <path d="M0 118 Q100 108 200 118 T400 116 V150 H0 Z" fill="#2f8fb0" opacity="0.92"/>
      <path d="M0 128 Q120 122 240 128 T400 126 V150 H0 Z" fill="#1f6f92"/>`;
  } else if (origin.includes('Portland')) {
    // Pacific Northwest: snow-capped Mt Hood, evergreen ridge, a river bridge.
    scene = `${sky('#8fb8cf', '#3a5a6e')}
      ${sun(320, 40, 20, '#f4efe0')}
      <path d="M110 118 L210 40 L310 118 Z" fill="#4a5f70"/>
      <path d="M182 66 L210 40 L238 66 L224 60 L210 70 L196 60 Z" fill="#eef4f8"/>
      <path d="M0 104 L40 84 L70 104 L110 80 L150 104 L190 86 L230 104 L280 82 L320 104 L360 86 L400 104 V150 H0 Z" fill="#233d33"/>
      <rect x="0" y="120" width="400" height="30" fill="#1a2c37"/>
      <path d="M40 120 Q120 100 200 120" fill="none" stroke="${accent}" stroke-width="2" opacity="0.7"/>`;
  } else {
    // Generic distant horizon — a new golfer never shows a blank header.
    scene = `${sky('#2a3350', '#111826')}
      ${sun(320, 50, 24, '#c8d6ff')}
      <path d="M0 96 Q100 78 200 94 T400 90 V150 H0 Z" fill="#1a2338"/>
      <path d="M0 116 Q120 104 240 116 T400 112 V150 H0 Z" fill="#0f1626"/>`;
  }
  return `<svg class="gs-charlore-bgsvg" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice"
    width="100%" height="100%" aria-hidden="true">${scene}</svg>`;
}

/** One labelled biographical field (a fact tile). */
function factTile(icon: string, label: string, value: string, accent: string): string {
  return `<div class="gs-charlore-fact">
    <div class="gs-charlore-fact-l"><span aria-hidden="true">${icon}</span> ${label}</div>
    <div class="gs-charlore-fact-v" style="--acc:${accent};">${value}</div>
  </div>`;
}

/**
 * Build the full-screen character lore popup for one golfer. Tapping the backdrop or ✕ closes it; the
 * card swallows the tap so an inner click never dismisses. Returns '' for an unknown golfer.
 */
export function characterLoreCardHTML(ch: Character | undefined): string {
  if (!ch) return '';
  const cap = ch.style.cap;
  const lore = ch.lore;
  const portrait = golferPreviewSVG(undefined, undefined, undefined, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    capColor: ch.style.cap,
    hair: ch.style.hair,
    uid: `charlore${ch.id.replace(/[^a-z0-9]/gi, '')}`,
    w: 84,
    h: 210,
  });
  const wins = lore.bestWins.map((w) => `<li>🏆 ${w}</li>`).join('');
  return `
  <div class="gs-charlore-ov" data-action='${CLOSE_ACTION}'>
    <div class="gs-charlore" role="dialog" aria-label="${ch.name} — golfer profile" onclick="event.stopPropagation()" style="--acc:${cap};--acc-soft:${cap}1c;--acc-glow:${cap}aa;">
      <button class="gs-charlore-x" data-action='${CLOSE_ACTION}' aria-label="Close">✕</button>
      <div class="gs-charlore-hero">
        <div class="gs-charlore-bg">${hometownBackdropSVG(ch.origin, cap)}</div>
        <div class="gs-charlore-heroink">
          <div class="gs-charlore-port">${portrait}</div>
          <div class="gs-charlore-id">
            <span class="gs-charlore-kicker">⛳ Golfer dossier</span>
            <span class="gs-charlore-name">${ch.name}</span>
            <span class="gs-charlore-home">📍 ${ch.origin}</span>
          </div>
        </div>
      </div>
      <div class="gs-charlore-body">
        <div class="gs-charlore-grid">
          ${factTile('🎂', 'Age', `${lore.age}`, cap)}
          ${factTile('🩸', 'Blood type', lore.bloodType, cap)}
          ${factTile('⚧', 'Gender & pronouns', `${lore.gender} · ${ch.identity}`, cap)}
          ${factTile('💞', 'Relationship', lore.relationship, cap)}
        </div>
        <div class="gs-charlore-block">
          <div class="gs-charlore-block-h" style="--acc:${cap};">🏆 Best wins</div>
          <ul class="gs-charlore-wins">${wins}</ul>
        </div>
        <div class="gs-charlore-block">
          <div class="gs-charlore-block-h gs-charlore-block-h--low">💔 Lowest career moment</div>
          <p class="gs-charlore-low">${lore.lowestMoment}</p>
        </div>
        <div class="gs-charlore-block gs-charlore-fun">
          <div class="gs-charlore-block-h" style="--acc:${cap};">✨ Fun fact</div>
          <p class="gs-charlore-funtxt">${lore.funFact}</p>
        </div>
      </div>
      <div class="gs-charlore-foot">
        <button class="gs-charlore-close2" data-action='${CLOSE_ACTION}'>Close · tap the card to choose ${ch.shortName}</button>
      </div>
    </div>
  </div>
  <style>
    .gs-charlore-ov{position:fixed;inset:0;z-index:80;display:flex;align-items:safe flex-end;justify-content:center;
      background:rgba(4,6,11,0.72);backdrop-filter:blur(3px);animation:gs-charlore-fade .16s ease both;}
    .gs-charlore{position:relative;width:100%;max-width:470px;margin:0 8px;overflow:hidden;
      background:linear-gradient(180deg,#141a27,#0d1017);border:1px solid #2c3547;border-radius:20px 20px 0 0;
      box-shadow:0 -12px 40px #000c;animation:gs-charlore-rise .24s cubic-bezier(.2,.8,.2,1) both;
      max-height:calc(var(--gs-dvh) * .92);display:flex;flex-direction:column;}
    @media(min-width:560px){.gs-charlore-ov{align-items:safe center;}.gs-charlore{border-radius:20px;}}
    .gs-charlore-x{position:absolute;top:9px;right:9px;z-index:3;width:34px;height:34px;border-radius:50%;
      border:1px solid #ffffff33;background:#0009;color:#eef;font-size:15px;cursor:pointer;line-height:1;
      backdrop-filter:blur(2px);}
    .gs-charlore-x:hover{background:#000c;color:#fff;}
    /* hero: hometown backdrop + portrait + name */
    .gs-charlore-hero{position:relative;min-height:150px;}
    .gs-charlore-bg{position:absolute;inset:0;overflow:hidden;}
    .gs-charlore-bg::after{content:"";position:absolute;inset:0;
      background:linear-gradient(180deg,#0a0d1400 30%,#0d1017cc 78%,#0d1017 100%),
        linear-gradient(90deg,var(--acc-soft,#5b8bd01c),#0000 60%);}
    .gs-charlore-bgsvg{position:absolute;inset:0;opacity:.62;filter:saturate(.9);}
    .gs-charlore-heroink{position:relative;z-index:2;display:flex;align-items:flex-end;gap:14px;
      padding:16px 16px 12px;height:100%;min-height:150px;box-sizing:border-box;}
    .gs-charlore-port{flex:0 0 auto;width:84px;filter:drop-shadow(0 4px 8px #000a) drop-shadow(0 0 10px var(--acc-glow,#5b8bd0aa));}
    .gs-charlore-port svg{width:100%;height:auto;display:block;}
    .gs-charlore-id{display:flex;flex-direction:column;gap:2px;min-width:0;padding-bottom:4px;}
    .gs-charlore-kicker{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
      color:var(--acc,#5b8bd0);text-shadow:0 1px 3px #000b;}
    .gs-charlore-name{font-size:23px;font-weight:900;line-height:1.05;color:#f3f7ff;text-shadow:0 2px 6px #000c;}
    .gs-charlore-home{font-size:12.5px;font-weight:600;color:#d6e2f2;text-shadow:0 1px 3px #000b;}
    /* body */
    .gs-charlore-body{overflow-y:auto;flex:1 1 auto;-webkit-overflow-scrolling:touch;padding:12px 14px 4px;}
    .gs-charlore-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;}
    .gs-charlore-fact{background:#0b0f18;border:1px solid #232c3d;border-radius:11px;padding:8px 10px;min-width:0;}
    .gs-charlore-fact-l{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7f8ba0;}
    .gs-charlore-fact-v{font-size:13.5px;font-weight:700;color:#eaf1fb;margin-top:2px;line-height:1.25;
      border-left:2px solid var(--acc,#5b8bd0);padding-left:7px;}
    .gs-charlore-block{margin:0 0 12px;}
    .gs-charlore-block-h{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
      color:var(--acc,#5b8bd0);margin-bottom:5px;}
    .gs-charlore-block-h--low{color:#e07a8a;}
    .gs-charlore-wins{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}
    .gs-charlore-wins li{font-size:13px;font-weight:600;color:#e7eefb;background:#0b0f18;border:1px solid #232c3d;
      border-radius:8px;padding:5px 9px;}
    .gs-charlore-low{margin:0;font-size:13px;line-height:1.5;color:#cbd4e4;font-style:italic;
      background:#170f13;border:1px solid #3a2530;border-radius:10px;padding:9px 11px;}
    .gs-charlore-fun{background:radial-gradient(120% 100% at 0% 0%,var(--acc-soft,#5b8bd01c),#0000 70%);
      border:1px solid #2c3547;border-radius:12px;padding:10px 12px;}
    .gs-charlore-funtxt{margin:0;font-size:13.5px;line-height:1.5;color:#eef3fc;}
    .gs-charlore-foot{padding:8px 14px 16px;}
    .gs-charlore-close2{width:100%;padding:11px;border-radius:12px;border:1px solid #2f3a4e;
      background:linear-gradient(180deg,#1a2233,#121826);color:#cdd8ea;font-size:13px;font-weight:700;cursor:pointer;}
    .gs-charlore-close2:hover{background:linear-gradient(180deg,#222d42,#161d2e);color:#eef3fc;}
    @keyframes gs-charlore-fade{from{opacity:0;}to{opacity:1;}}
    @keyframes gs-charlore-rise{from{transform:translateY(20px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
    @media(prefers-reduced-motion:reduce){.gs-charlore-ov,.gs-charlore{animation:none;}}
  </style>`;
}
