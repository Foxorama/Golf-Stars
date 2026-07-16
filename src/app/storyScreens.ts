/**
 * Story Mode screens (GS-story-save wiring). For now: the campaign HUB — the Clubhouse you land in with
 * your station wagon parked and the Prognostic Parrot in the bar (per the story bible). It shows the
 * persistent campaign state (protagonist, purse, trophies, bag, ship) and lets you start over. The
 * forward "set course / play a world" action arrives with the prologue + star-map chunks.
 *
 * Built from EXISTING design-token CSS classes (gs-hero / gs-chip / gs-btn / gs-seclabel) + inline styles,
 * so it adds no new global CSS class (no collision risk — see CLAUDE.md). Reads the live `state`.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import { shipById } from '../sim/rpg/ships';
import { shipCardSVG } from '../render/shipArt';
import { STORY_CHAPTER_COUNT } from '../sim/rpg/story';

export function storyHubScreen(): string {
  const story = state.story;
  // Defensive: the hub should only render with a campaign, but never crash if it's missing — offer a start.
  if (!story) {
    return `
      <header class="gs-hero gs-storyhub"><h1 class="gs-hero-title">⛳ Story Mode</h1>
        <p class="gs-hero-tag">The Universe needs a champion.</p></header>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyNewCampaign' })}'>✦ Begin a new campaign</button>
        <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStory' })}'>‹ Back to title</button>
      </div>`;
  }

  const ch = getCharacter(story.characterId);
  const who = ch ? ch.name : 'Champion';
  const ship = shipById(story.equippedShipId);
  const shipName = ship ? ship.name : 'Station Wagon';
  const trophies = story.trophyIds.length;
  const chapterLabel =
    story.chapter <= 0 ? 'Prologue — the voyage begins' : `Chapter ${story.chapter} of ${STORY_CHAPTER_COUNT}`;

  const chip = (title: string, body: string, color = 'var(--gs-gold)') =>
    `<span class="gs-chip" style="border-color:#3a3320;color:${color};font-size:13px;" title="${title}">${body}</span>`;

  // The Parrot's greeting in the bar — the campaign's guide (story bible: Fairway Wardens' prophet).
  const parrotLine =
    story.chapter <= 0
      ? `"The stars are charted, ${who}. When you are ready, we fly — the Universe is counting on you."`
      : `"${trophies} of ${STORY_CHAPTER_COUNT} Sigils. The Coil is not resting, ${who} — and neither is the serpent."`;

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">⛳ Story Mode</h1>
      <p class="gs-hero-tag">${chapterLabel}</p>
      <div class="gs-hero-chips">
        ${chip('your golfer', `🏌 <b>${who}</b>`, 'var(--gs-ink)')}
        ${chip('credits', `✦ <b>${story.credits}</b>`)}
        ${chip('Sigils won', `🏆 <b>${trophies}</b> / ${STORY_CHAPTER_COUNT}`)}
        ${chip('clubs in the bag', `🎒 <b>${story.equippedBagIds.length}</b>`, '#7fe0a0')}
        ${chip('your ship', `🚀 <b>${shipName}</b>`, '#7fd8ff')}
      </div>
    </header>

    <section style="max-width:520px;margin:8px auto 0;">
      <div style="display:flex;align-items:center;gap:14px;background:var(--gs-panel,#161a24);border:1px solid #2a2f3c;border-radius:14px;padding:14px 16px;">
        <span aria-hidden="true" style="flex:0 0 auto;">${shipCardSVG(story.equippedShipId, 108, 66)}</span>
        <p style="margin:0;color:var(--gs-dim);font-size:14px;line-height:1.45;">
          <span style="color:#7fe0a0;">🦜 The Prognostic Parrot:</span> <em>${parrotLine}</em>
        </p>
      </div>
    </section>

    <h2 class="gs-seclabel">The clubhouse</h2>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:0 auto;">
      <div style="text-align:center;color:var(--gs-dim);font-size:13px;padding:6px 0;">
        🗺 The star chart opens as the story unfolds — your first destination is being plotted.
      </div>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyNewCampaign' })}'
        title="Abandon this campaign and start a new one">↺ New campaign</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStory' })}'>‹ Back to title</button>
    </div>`;
}
