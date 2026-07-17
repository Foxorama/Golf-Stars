/**
 * Story Mode screens (GS-story). The campaign HUB is the clubhouse you return to between worlds — and it
 * changes with the story (GS-story-prologue): during the PROLOGUE it's an EARTH clubhouse (the four golfers
 * prepping for the World Tour final at St Andrews — grounded, no spaceship, no Parrot, since you haven't been
 * recruited yet); AFTER you win Earth + are recruited it "opens up" to the SPACEPORT clubhouse (your ship
 * parked, the Parrot in the bar, the star chart ahead). That arc — Earth → win → the Universe calls → space —
 * reads far better than starting in a spaceport before you've ever left the ground.
 *
 * Built from EXISTING design-token CSS classes (gs-hero / gs-chip / gs-btn / gs-seclabel) + inline styles,
 * so it adds no new global CSS class (no collision risk — see CLAUDE.md). Reads the live `state`.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import { shipById } from '../sim/rpg/ships';
import { shipCardSVG } from '../render/shipArt';
import { earthClubhouseSceneHTML, golferInspectOverlayHTML } from '../render/storyClubhouse';
import { STORY_CHAPTER_COUNT, PROLOGUE_COURSE_ID, worldCleared, type StoryState } from '../sim/rpg/story';
import { staticCourseSpec } from '../sim/course/staticCourses';

export function storyHubScreen(): string {
  const story = state.story;
  // Defensive: the hub should only render with a campaign, but never crash if it's missing — offer a start.
  if (!story) {
    return `
      <header class="gs-hero gs-storyhub"><h1 class="gs-hero-title">⛳ Story Tour</h1>
        <p class="gs-hero-tag">The Universe needs a champion.</p></header>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyNewCampaign' })}'>✦ Begin a new campaign</button>
        <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStory' })}'>‹ Back to title</button>
      </div>`;
  }
  // The PROLOGUE (haven't won Earth yet) is grounded on Earth; afterwards the campaign opens up to space.
  const inPrologue = story.chapter <= 0 && !worldCleared(story, PROLOGUE_COURSE_ID);
  return inPrologue ? earthClubhouseHTML(story) : spaceClubhouseHTML(story);
}

/** A footer of "New campaign" + "Back to title" shared by both clubhouses. */
function hubFooterHTML(): string {
  return `
    <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyNewCampaign' })}'
      title="Abandon this campaign and start a new one">↺ New campaign</button>
    <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStory' })}'>‹ Back to title</button>`;
}

/**
 * The GOLFER PICKER (GS-story-clubhouse) — the graphic Earth clubhouse used to CHOOSE your protagonist for a
 * new campaign (screen `character` + `pendingStoryNew`). Walk into the clubhouse, tap a golfer, read their
 * stats + abilities, and "Play as" them. Exported for app.ts's render branch.
 */
export function storyGolferPickerHTML(): string {
  const overlay = state.storyInspectId
    ? golferInspectOverlayHTML(state.storyInspectId, {
        label: `▶ Play as ${getCharacter(state.storyInspectId)?.name ?? 'this golfer'}`,
        action: { type: 'selectCharacter', characterId: state.storyInspectId },
      })
    : '';
  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🌍 World Tour</h1>
      <p class="gs-hero-tag">The Final Round · The Old Course, St Andrews · Earth</p>
    </header>
    <section style="max-width:620px;margin:2px auto 0;">
      <div style="text-align:center;color:var(--gs-dim);font-size:13px;line-height:1.5;margin-bottom:8px;">
        The clubhouse hums before the final round. <span style="color:var(--gs-ink);">Tap a golfer</span> to
        weigh their game — then choose who tees it up for the Tour.
      </div>
      ${earthClubhouseSceneHTML(null)}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:14px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStory' })}'>‹ Back to title</button>
    </div>
    ${overlay}`;
}

/**
 * The PROLOGUE clubhouse (GS-story-prologue / GS-story-clubhouse): the graphic Earth clubhouse on the eve of
 * the World Tour final, your chosen golfer highlighted. Tap any golfer to view their stats (yours, or switch
 * to another before you tee off). No spaceship, no Parrot yet — you're still just the best golfer on one small
 * planet. The forward button heads to the first tee at St Andrews.
 */
function earthClubhouseHTML(story: StoryState): string {
  const spec = staticCourseSpec(PROLOGUE_COURSE_ID);
  const courseName = spec?.name ?? 'The Old Course, St Andrews';
  const inspectId = state.storyInspectId;
  const overlay = inspectId
    ? golferInspectOverlayHTML(
        inspectId,
        inspectId === story.characterId
          ? { label: '★ Your golfer', action: {}, disabled: true }
          : { label: `Switch to ${getCharacter(inspectId)?.name ?? 'this golfer'}`, action: { type: 'storySwitchGolfer', characterId: inspectId } },
      )
    : '';
  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🌍 World Tour</h1>
      <p class="gs-hero-tag">The Final Round · ${courseName} · Earth</p>
    </header>
    <section style="max-width:620px;margin:2px auto 0;">
      <div style="text-align:center;color:var(--gs-dim);font-size:13px;line-height:1.5;margin-bottom:8px;">
        Your rivals are here too — but today, the trophy is yours to take.
        <span style="color:var(--gs-ink);">Tap a golfer</span> to check their game.
      </div>
      ${earthClubhouseSceneHTML(story.characterId)}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:14px auto 0;">
      <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyPlayWorld', courseId: PROLOGUE_COURSE_ID })}'>
        ⛳ Head to the first tee — St Andrews
      </button>
      ${hubFooterHTML()}
    </div>
    ${overlay}`;
}

/**
 * The SPACEPORT clubhouse (post-recruitment, Chapter 1+): your ship parked, the Parrot in the bar, the star
 * chart ahead. The campaign has "opened up" to space. The forward "set course" star-map action lands with
 * the GS-story-map chunk; for now, the chart teaser.
 */
function spaceClubhouseHTML(story: StoryState): string {
  const ch = getCharacter(story.characterId);
  const who = ch ? ch.name : 'Champion';
  const ship = shipById(story.equippedShipId);
  const shipName = ship ? ship.name : 'Station Wagon';
  const trophies = story.trophyIds.length;

  const chip = (title: string, body: string, color = 'var(--gs-gold)') =>
    `<span class="gs-chip" style="border-color:#3a3320;color:${color};font-size:13px;" title="${title}">${body}</span>`;
  const parrotLine = `"${trophies} of ${STORY_CHAPTER_COUNT} Sigils. The Coil is not resting, ${who} — and neither is the serpent."`;

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🚀 Clubhouse</h1>
      <p class="gs-hero-tag">Chapter ${story.chapter} of ${STORY_CHAPTER_COUNT}</p>
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

    <h2 class="gs-seclabel">The spaceport</h2>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:0 auto;">
      <button class="gs-btn" data-action='${JSON.stringify({ type: 'openStoryMap' })}'>🗺 Set course — the star chart</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'openStoryLocker' })}'>🎒 Locker — build your bag &amp; gear</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'openStoryShipyard' })}'>🚀 Shipyard — buy &amp; fly ships</button>
      <div style="text-align:center;color:var(--gs-dim);font-size:12px;">Chart a course to a charted world, play it, and bank credits.</div>
      ${hubFooterHTML()}
    </div>`;
}

/**
 * The world-round recap (GS-story-prologue). For now: the round score, credits earned, and — for the
 * prologue — the "you won the World Tour" beat. The Mothership landing + the Parrot's recruitment + the
 * story intro cinematic land in the next chunk, growing out of this screen.
 */
export function storyResultScreen(): string {
  const r = state.lastStoryRound;
  if (!r) {
    return `
      <header class="gs-hero gs-storyres"><h1 class="gs-hero-title">⛳ Round complete</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyRoundContinue' })}'>Continue ›</button>
      </div>`;
  }
  const spec = staticCourseSpec(r.courseId);
  const courseName = spec?.name ?? 'the course';
  const toParStr = r.toPar === 0 ? 'Even par' : r.toPar > 0 ? `+${r.toPar}` : `${r.toPar}`;
  const title = r.wasPrologue ? '🏆 Champion!' : '⛳ World cleared';
  const kicker = r.wasPrologue
    ? `You've won the final round of the World Tour on Earth — the best golfer on the planet.`
    : `You played ${courseName} true.`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title">${title}</h1>
      <p class="gs-hero-tag">${kicker}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-ink);font-size:14px;">${courseName}</span>
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="score to par">⛳ <b>${toParStr}</b> · ${r.strokes} strokes</span>
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="credits earned">✦ <b>+${r.credits}</b> credits</span>
      </div>
    </header>
    <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.5;">
      ${
        r.wasPrologue
          ? `<p><em>As the gallery roars, a shadow falls across the 18th green. Something vast is descending from the sky…</em></p>
             <p style="color:#7fe0a0;">🦜 "Golfer — the Universe needs you. Gather your friends and follow me!"</p>`
          : `<p>Credits banked. The Coil is not resting — nor is the serpent.</p>`
      }
    </section>
    <div style="max-width:420px;margin:18px auto 0;">
      ${
        r.wasPrologue
          ? // GS-story-intro: the prologue victory plays the recruitment cinematic before the clubhouse
            // (app.ts wires `data-story-intro`), so it does NOT use the plain continue action.
            `<button class="gs-btn" data-story-intro="1">Answer the call ›</button>`
          : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyRoundContinue' })}'>Back to the clubhouse ›</button>`
      }
    </div>`;
}
