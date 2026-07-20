/**
 * The Story-Tour clubhouse CREW WALL (GS-story-allies) — the recruited friends standing around the spaceport
 * clubhouse, each a tappable avatar that opens a talk card (portrait + name + faction + rotating banter, and
 * a "carry my bag" equip). Reads the roster off `StoryState.hiredCaddyIds`; empty until you recruit someone.
 *
 * Pure string builders (no DOM, no rng). Own `.gs-crew*` CSS prefix (never the play HUD's `.gs-hud`, per the
 * CLAUDE.md global-class gotcha). The talk card is the surface the deeper side-QUESTS (GS-story-quests) will
 * extend, so its actions are data-action driven and easy to add a "quest" button to.
 */

import { caddyPortraitSVG } from './caddyPortraits';
import {
  crewRoster,
  allyName,
  allyTalk,
  allyLineAt,
  allyFactionName,
  allyFactionBlurb,
} from '../sim/rpg/storyAllies';
import { activeStoryCaddy, caddiedWith } from '../sim/rpg/storyCaddies';
import { questForCaddy, questOfferable, questDone, questBeatPending } from '../sim/rpg/storyQuests';
import type { StoryState } from '../sim/rpg/story';

/** The crew wall for the spaceport clubhouse: a labelled row of recruited allies, each a tappable avatar.
 *  Returns '' when no one has been recruited yet (so the clubhouse stays clean early). */
export function crewWallHTML(story: StoryState): string {
  const roster = crewRoster(story);
  if (roster.length === 0) return '';
  const active = activeStoryCaddy(story);
  const chips = roster.map((id) => crewChipHTML(id, id === active)).join('');
  return `${CREW_STYLE}
    <h2 class="gs-seclabel">Your crew</h2>
    <div class="gs-crew-wall">${chips}</div>`;
}

/** One recruited ally as a tappable avatar chip (portrait medallion + name + active star). */
function crewChipHTML(caddyId: string, active: boolean): string {
  const action = JSON.stringify({ type: 'storyInspectAlly', caddyId });
  return `<button class="gs-crew-chip${active ? ' gs-crew-chip--on' : ''}" data-action='${action}'
    aria-label="Talk to ${allyName(caddyId)}">
    <span class="gs-crew-av">${caddyPortraitSVG(caddyId)}</span>
    <span class="gs-crew-name">${allyName(caddyId).split(' ')[0]}${active ? ' ★' : ''}</span>
  </button>`;
}

/**
 * The ally TALK card (GS-story-allies): a modal opened by tapping a crew avatar. Portrait, name, faction +
 * its blurb, the current rotating banter line, and actions — "Another ›" (cycle the line), "Carry my bag"
 * (make active, unless already), and Close. `talkCount` drives which banter line shows. The whole backdrop
 * closes it. (`questSlot` lets the later quest chunk inject a quest offer/progress row — empty for now.)
 */
export function allyInspectOverlayHTML(caddyId: string, story: StoryState, talkCount: number): string {
  const talk = allyTalk(caddyId);
  if (!talk) return '';
  const active = activeStoryCaddy(story) === caddyId;
  const questSlot = questSlotHTML(caddyId, story);
  const faction = allyFactionName(caddyId);
  const factionBlurb = allyFactionBlurb(caddyId);
  const line = allyLineAt(caddyId, talkCount);
  const close = JSON.stringify({ type: 'storyCloseAlly' });
  return `${CREW_STYLE}
    <div class="gs-crew-ov" data-action='${close}'>
      <div class="gs-crew-card" onclick="event.stopPropagation()">
        <div class="gs-crew-cardtop">
          <span class="gs-crew-portrait">${caddyPortraitSVG(caddyId)}</span>
          <div class="gs-crew-id">
            <div class="gs-crew-idrow">
              <h3 class="gs-crew-title">${allyName(caddyId)}</h3>
              <button class="gs-crew-x" data-action='${close}' aria-label="Close">✕</button>
            </div>
            ${faction ? `<div class="gs-crew-faction">${faction}</div>` : ''}
            ${factionBlurb ? `<p class="gs-crew-fblurb">${factionBlurb}</p>` : ''}
            <p class="gs-crew-tag">${talk.tagline}</p>
          </div>
        </div>
        <div class="gs-crew-speech">${line}</div>
        ${questSlot}
        <div class="gs-crew-actions">
          <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyAllyTalk', caddyId })}'>💬 Another ›</button>
          ${active
            ? `<div class="gs-crew-activebadge">🎒 Carrying your bag ★</div>`
            : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'setStoryCaddy', caddyId })}'>🎒 Carry my bag</button>`}
        </div>
      </div>
    </div>`;
}

/** GS-story-quests: the ally card's quest row — an OFFER (accept), an ACTIVE note, or a COMPLETE badge with
 *  the reward. Empty when the ally has no quest (they all do) or it isn't yet available at this chapter.
 *  Exported so the Herald agent card (GS-story-herald-quests) reuses the identical quest UI for the Coil crew. */
export function questSlotHTML(caddyId: string, story: StoryState): string {
  const q = questForCaddy(caddyId);
  if (!q) return '';
  if (questDone(story, q.id)) {
    return `<div class="gs-crew-quest gs-crew-quest--done">✓ <b>${q.title}</b> — done. <span>${q.rewardName} is in your bag.</span></div>`;
  }
  if (story.activeQuestId === q.id) {
    return `<div class="gs-crew-quest gs-crew-quest--active">🗺 <b>${q.title}</b> — accepted. <span>Fly to the star chart and play it together.</span></div>`;
  }
  if (questOfferable(story, caddyId)) {
    return `<div class="gs-crew-quest">
      <div class="gs-crew-questtitle">🗺 A quest: <b>${q.title}</b></div>
      <div class="gs-crew-questhook">${q.hook}</div>
      <button class="gs-btn" style="margin-top:8px;" data-action='${JSON.stringify({ type: 'acceptStoryQuest', questId: q.id })}'>Take it on ›</button>
    </div>`;
  }
  // has a quest, but not yet available (chapter too early, or another quest is active)
  if (story.activeQuestId) return '';
  // GS-story-caddy-rep / GS-story-quest-beat: recruited + chapter-ready, but holding a beat. The FIRST thing
  // an ally waits for is to carry the bag together (reputation); after that it's the "play on elsewhere" beat.
  if (questBeatPending(story, caddyId)) {
    const msg = caddiedWith(story, caddyId)
      ? 'give it a beat. Play on, and they’ll have a quest for you when you’re back aboard.'
      : 'put them on the bag for a round first — carry the bag together, and they’ll open up with a quest.';
    return `<div class="gs-crew-quest gs-crew-quest--soon">🗺 <b>${q.title}</b> — ${msg}</div>`;
  }
  return `<div class="gs-crew-quest gs-crew-quest--soon">🗺 <b>${q.title}</b> — they’ll have something for you deeper into the journey.</div>`;
}

const CREW_STYLE = `<style>
  .gs-crew-wall{display:flex;flex-wrap:wrap;gap:10px;max-width:520px;margin:0 auto 4px;justify-content:center;}
  .gs-crew-chip{display:flex;flex-direction:column;align-items:center;gap:2px;width:78px;padding:6px 4px;
    background:linear-gradient(180deg,#161a24,#10131b);border:1px solid #2a2f3c;border-radius:12px;cursor:pointer;
    color:inherit;font:inherit;transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease;}
  .gs-crew-chip:hover,.gs-crew-chip:focus-visible{transform:translateY(-2px);border-color:#4a5566;outline:none;
    box-shadow:0 6px 14px #0007;}
  .gs-crew-chip--on{border-color:#a97b25;box-shadow:inset 0 0 0 1px #a97b2588;}
  .gs-crew-av{width:60px;height:60px;border-radius:50%;overflow:hidden;display:flex;align-items:flex-end;
    justify-content:center;background:radial-gradient(circle at 50% 38%,#243042,#0e1219);}
  .gs-crew-av svg{width:150%;height:150%;transform:translateY(6%);}
  .gs-crew-name{font-size:11px;font-weight:700;color:#cdd6e4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:74px;}
  .gs-crew-chip--on .gs-crew-name{color:#f0c874;}
  /* talk card */
  .gs-crew-ov{position:fixed;inset:0;z-index:62;display:flex;align-items:flex-end;justify-content:center;
    background:rgba(6,8,14,0.66);backdrop-filter:blur(2px);animation:gs-crew-fade .16s ease both;}
  .gs-crew-card{width:100%;max-width:460px;margin:0 10px;background:linear-gradient(180deg,#161a24,#0e121a);
    border:1px solid #2c3342;border-top-color:#3a4656;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px #000a;
    padding:16px 16px 20px;animation:gs-crew-rise .2s cubic-bezier(.2,.8,.2,1) both;}
  @media(min-width:560px){.gs-crew-ov{align-items:center;}.gs-crew-card{border-radius:16px;}}
  @keyframes gs-crew-fade{from{opacity:0;}to{opacity:1;}}
  @keyframes gs-crew-rise{from{transform:translateY(16px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
  @media(prefers-reduced-motion:reduce){.gs-crew-ov,.gs-crew-card{animation:none;}}
  .gs-crew-cardtop{display:flex;gap:14px;align-items:flex-start;}
  .gs-crew-portrait{flex:0 0 88px;width:88px;filter:drop-shadow(0 4px 6px #0008);}
  .gs-crew-portrait svg{width:100%;height:auto;display:block;}
  .gs-crew-id{flex:1 1 auto;min-width:0;}
  .gs-crew-idrow{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}
  .gs-crew-title{margin:0;font-size:18px;color:#eef3fb;}
  .gs-crew-x{background:none;border:0;color:#8a97a8;font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;}
  .gs-crew-faction{font-size:12px;color:#f0a8c8;font-weight:700;letter-spacing:.02em;margin-top:1px;}
  .gs-crew-fblurb{margin:3px 0 0;font-size:11.5px;line-height:1.4;color:#8a97a8;font-style:italic;}
  .gs-crew-tag{margin:6px 0 0;font-size:12.5px;line-height:1.4;color:#aab6c6;}
  .gs-crew-speech{margin:14px 0 0;padding:12px 14px;background:#0b0f18;border:1px solid #232b3b;border-radius:12px;
    font-size:14px;line-height:1.5;color:#e4ecf6;min-height:2.6em;}
  .gs-crew-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;}
  .gs-crew-actions .gs-btn{flex:1 1 auto;}
  .gs-crew-activebadge{flex:1 1 auto;text-align:center;padding:10px;border-radius:10px;background:#20180a;
    border:1px solid #6a5320;color:#f0c874;font-size:13px;font-weight:700;}
  .gs-crew-quest{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#181322;border:1px solid #3a2f4a;
    border-left:3px solid #a97b25;font-size:12.5px;line-height:1.5;color:#e6ddf0;}
  .gs-crew-questtitle{font-weight:800;color:#f0c874;}
  .gs-crew-questhook{margin-top:3px;color:#c6bcd6;font-style:italic;}
  .gs-crew-quest--active{border-left-color:#54c8ff;color:#bfe4ff;}
  .gs-crew-quest--active span,.gs-crew-quest--done span{color:#9aa8bc;font-style:italic;}
  .gs-crew-quest--done{border-left-color:#4fe08a;color:#9dffce;}
  .gs-crew-quest--soon{border-left-color:#4a4656;color:#9aa2b4;}
</style>`;
