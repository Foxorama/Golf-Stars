/**
 * The HERALD (Coil) agent talk card (GS-story-herald-clubhouse) — the dark-path twin of the Warden ally talk
 * card (`render/storyCrew.ts`). Tapping a Coil agent standee in the Herald clubhouse raises this modal: their
 * lore portrait (`lorePortraitSVG`, in the Coil palette), name + title, the Coil faction blurb, and a rotating
 * banter line. Reuses the SAME `storyInspectAlly`/`storyAllyTalk`/`storyCloseAlly` actions + tap counter as
 * the Warden card (the screen just branches on `isHeraldAgent`), so no new reducer plumbing.
 *
 * Pure string builder (no DOM, no rng). Own `.gs-herald*` CSS prefix — never the play HUD's `.gs-hud`.
 */

import { lorePortraitSVG } from './loreArt';
import {
  heraldAgent,
  heraldAgentLineAt,
  COIL_FACTION_NAME,
  COIL_FACTION_BLURB,
} from '../sim/rpg/storyHeraldCrew';

/** The Coil agent talk card. `talkCount` selects which banter line shows; the backdrop/✕ closes it. */
export function heraldAgentOverlayHTML(agentId: string, talkCount: number): string {
  const a = heraldAgent(agentId);
  if (!a) return '';
  const line = heraldAgentLineAt(agentId, talkCount);
  const close = JSON.stringify({ type: 'storyCloseAlly' });
  return `${HERALD_STYLE}
    <div class="gs-herald-ov" data-action='${close}'>
      <div class="gs-herald-card" onclick="event.stopPropagation()">
        <div class="gs-herald-top">
          <span class="gs-herald-portrait"${a.tint ? ` style="filter:${a.tint};"` : ''}>${lorePortraitSVG(a.portrait)}</span>
          <div class="gs-herald-id">
            <div class="gs-herald-idrow">
              <h3 class="gs-herald-title">${a.name}</h3>
              <button class="gs-herald-x" data-action='${close}' aria-label="Close">✕</button>
            </div>
            <div class="gs-herald-role">${a.title}</div>
            <div class="gs-herald-faction">${COIL_FACTION_NAME}</div>
            <p class="gs-herald-fblurb">${COIL_FACTION_BLURB}</p>
          </div>
        </div>
        <div class="gs-herald-speech">${line}</div>
        <div class="gs-herald-actions">
          <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyAllyTalk', caddyId: agentId })}'>🐍 Another ›</button>
        </div>
      </div>
    </div>`;
}

const HERALD_STYLE = `<style>
  .gs-herald-ov{position:fixed;inset:0;z-index:62;display:flex;align-items:flex-end;justify-content:center;
    background:rgba(8,4,12,0.7);backdrop-filter:blur(2px);animation:gs-herald-fade .16s ease both;}
  .gs-herald-card{width:100%;max-width:460px;margin:0 10px;background:linear-gradient(180deg,#1a1026,#0d0714);
    border:1px solid #4a2f5a;border-top-color:#7a4a8a;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px #000b;
    padding:16px 16px 20px;animation:gs-herald-rise .2s cubic-bezier(.2,.8,.2,1) both;}
  @media(min-width:560px){.gs-herald-ov{align-items:center;}.gs-herald-card{border-radius:16px;}}
  @keyframes gs-herald-fade{from{opacity:0;}to{opacity:1;}}
  @keyframes gs-herald-rise{from{transform:translateY(16px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
  @media(prefers-reduced-motion:reduce){.gs-herald-ov,.gs-herald-card{animation:none;}}
  .gs-herald-top{display:flex;gap:14px;align-items:flex-start;}
  .gs-herald-portrait{flex:0 0 92px;width:92px;filter:drop-shadow(0 4px 8px #000a);}
  .gs-herald-portrait svg{width:100%;height:auto;display:block;}
  .gs-herald-id{flex:1 1 auto;min-width:0;}
  .gs-herald-idrow{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
  .gs-herald-title{margin:0;font-size:18px;color:#f0e6f8;}
  .gs-herald-x{background:none;border:0;color:#a690b8;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;}
  .gs-herald-role{font-size:12px;color:#b060c0;font-weight:800;letter-spacing:.02em;margin-top:1px;}
  .gs-herald-faction{font-size:12px;color:#7fe0a0;font-weight:700;margin-top:3px;}
  .gs-herald-fblurb{margin:3px 0 0;font-size:11.5px;line-height:1.4;color:#9a8aa8;font-style:italic;}
  .gs-herald-speech{margin:14px 0 0;padding:12px 14px;background:#0a0710;border:1px solid #3a2a48;border-radius:12px;
    font-size:14px;line-height:1.5;color:#ecd8f4;min-height:2.6em;}
  .gs-herald-actions{display:flex;gap:10px;margin-top:14px;}
  .gs-herald-actions .gs-btn{flex:1 1 auto;}
</style>`;
