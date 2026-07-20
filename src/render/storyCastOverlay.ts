/**
 * The FRIEND (playable-golfer) talk card (GS-story-cast) — the cast twin of the Warden ally card
 * (`storyCrew.ts`) and the Herald agent card (`storyHeraldOverlay.ts`). Tapping one of your three
 * tour-mate golfers (in the clubhouse or aboard the ship) raises this modal: their full-body figure
 * (`golferPreviewSVG`, signature look), name + origin + who-they-are tagline, and a rotating, state-aware
 * banter line. Reuses the SAME `storyInspectAlly`/`storyAllyTalk`/`storyCloseAlly` actions + tap counter as
 * the other two cards (the screen just branches on `isOtherGolfer`), so no new reducer plumbing.
 *
 * Pure string builder (no DOM, no rng). Own `.gs-friend*` CSS prefix — never the play HUD's `.gs-hud`.
 * Later betrayal chunks inject a partner/quest row here (the slot is left after the speech bubble).
 */

import { golferPreviewSVG } from './apparelArt';
import { castCharacter, castTagline, castLineAt } from '../sim/rpg/storyCast';
import { characterQuest, characterQuestOfferable, characterQuestClaimed, partneredCharacter } from '../sim/rpg/characterQuests';
import type { StoryState } from '../sim/rpg/story';

/** GS-story-charquests: the friend card's quest row — an OFFER to claim their signature club (once you've
 *  partnered them), a CLAIMED badge, or a "partner me first" nudge. Empty for the protagonist. */
function charQuestSlotHTML(charId: string, story: StoryState): string {
  const q = characterQuest(charId);
  if (!q || charId === story.characterId) return '';
  if (characterQuestClaimed(story, charId)) {
    return `<div class="gs-friend-quest gs-friend-quest--done">✓ <b>${q.title}</b> — <span>${q.rewardName} is in your bag.</span></div>`;
  }
  if (characterQuestOfferable(story, charId)) {
    return `<div class="gs-friend-quest">
      <div class="gs-friend-questtitle">🎁 ${q.title}</div>
      <div class="gs-friend-questhook">${q.bond[0] ?? q.hook}</div>
      <button class="gs-btn" style="margin-top:8px;" data-action='${JSON.stringify({ type: 'claimCharacterQuest', charId })}'>Take ${q.rewardName.split('—')[0]!.trim()} ›</button>
    </div>`;
  }
  // has a quest, but you haven't partnered them yet
  if (!partneredCharacter(story, charId)) {
    return `<div class="gs-friend-quest gs-friend-quest--soon">🎁 <b>${q.title}</b> — pick ${castCharacter(charId)?.shortName ?? 'them'} as your partner in a team Sigil, and they’ll have something for you.</div>`;
  }
  return '';
}

/** The friend talk card. `talkCount` selects the banter line; the backdrop/✕ closes it. `slot` is optional
 *  extra HTML injected under the speech (e.g. a partner-pick row). The character-quest row is always shown. */
export function friendInspectOverlayHTML(charId: string, story: StoryState, talkCount: number, slot = ''): string {
  const ch = castCharacter(charId);
  if (!ch) return '';
  const figure = golferPreviewSVG(undefined, undefined, undefined, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    capColor: ch.style.cap,
    hair: ch.style.hair,
    uid: `friendcard${ch.id.replace(/[^a-z0-9]/gi, '')}`,
    w: 96,
    h: 240,
  });
  const line = castLineAt(story, charId, talkCount);
  const close = JSON.stringify({ type: 'storyCloseAlly' });
  return `${FRIEND_STYLE}
    <div class="gs-friend-ov" data-action='${close}'>
      <div class="gs-friend-card" onclick="event.stopPropagation()">
        <div class="gs-friend-top">
          <span class="gs-friend-portrait">${figure}</span>
          <div class="gs-friend-id">
            <div class="gs-friend-idrow">
              <h3 class="gs-friend-title">${ch.name}</h3>
              <button class="gs-friend-x" data-action='${close}' aria-label="Close">✕</button>
            </div>
            <div class="gs-friend-origin">${ch.origin} · ${ch.identity}</div>
            <p class="gs-friend-tag">${castTagline(charId)}</p>
          </div>
        </div>
        <div class="gs-friend-speech">${line}</div>
        ${charQuestSlotHTML(charId, story)}
        ${slot}
        <div class="gs-friend-actions">
          <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyAllyTalk', caddyId: charId })}'>💬 Another ›</button>
        </div>
      </div>
    </div>`;
}

const FRIEND_STYLE = `<style>
  .gs-friend-ov{position:fixed;inset:0;z-index:62;display:flex;align-items:flex-end;justify-content:center;
    background:rgba(6,8,14,0.66);backdrop-filter:blur(2px);animation:gs-friend-fade .16s ease both;}
  .gs-friend-card{width:100%;max-width:460px;margin:0 10px;background:linear-gradient(180deg,#151b26,#0d1119);
    border:1px solid #2c3546;border-top-color:#3f5068;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px #000a;
    padding:16px 16px 20px;animation:gs-friend-rise .2s cubic-bezier(.2,.8,.2,1) both;}
  @media(min-width:560px){.gs-friend-ov{align-items:center;}.gs-friend-card{border-radius:16px;}}
  @keyframes gs-friend-fade{from{opacity:0;}to{opacity:1;}}
  @keyframes gs-friend-rise{from{transform:translateY(16px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
  @media(prefers-reduced-motion:reduce){.gs-friend-ov,.gs-friend-card{animation:none;}}
  .gs-friend-top{display:flex;gap:14px;align-items:flex-start;}
  .gs-friend-portrait{flex:0 0 96px;width:96px;filter:drop-shadow(0 5px 7px #0009);}
  .gs-friend-portrait svg{width:100%;height:auto;display:block;}
  .gs-friend-id{flex:1 1 auto;min-width:0;}
  .gs-friend-idrow{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
  .gs-friend-title{margin:0;font-size:18px;color:#eef3fb;}
  .gs-friend-x{background:none;border:0;color:#8a97a8;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;}
  .gs-friend-origin{font-size:12px;color:#7fd0ff;font-weight:700;letter-spacing:.02em;margin-top:2px;}
  .gs-friend-tag{margin:6px 0 0;font-size:12.5px;line-height:1.4;color:#aab6c6;}
  .gs-friend-speech{margin:14px 0 0;padding:12px 14px;background:#0b0f18;border:1px solid #232b3b;border-radius:12px;
    font-size:14px;line-height:1.5;color:#e4ecf6;min-height:2.6em;}
  .gs-friend-actions{display:flex;gap:10px;margin-top:14px;}
  .gs-friend-actions .gs-btn{flex:1 1 auto;}
  .gs-friend-quest{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#12201a;border:1px solid #2f4a3a;
    border-left:3px solid #7fe0a0;font-size:12.5px;line-height:1.5;color:#dff3ea;}
  .gs-friend-questtitle{font-weight:800;color:#9dffce;}
  .gs-friend-questhook{margin-top:3px;color:#bfe4cf;font-style:italic;}
  .gs-friend-quest--done{border-left-color:#4fe08a;color:#9dffce;}
  .gs-friend-quest--done span{color:#9aa8bc;font-style:italic;}
  .gs-friend-quest--soon{border-left-color:#4a5566;color:#9aa2b4;background:#141926;}
</style>`;
