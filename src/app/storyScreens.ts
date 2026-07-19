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
import { earthClubhouseSceneHTML, golferInspectOverlayHTML } from '../render/storyClubhouse';
import { spaceportSceneHTML } from '../render/storySpaceport';
import { STORY_CHAPTER_COUNT, PROLOGUE_COURSE_ID, worldCleared, type StoryState } from '../sim/rpg/story';
import { currentTournament } from '../sim/rpg/storyTournaments';
import { finaleUnlocked } from '../sim/rpg/storyFinale';
import { worldHasShop } from '../sim/rpg/storyShop';
import { worldIsShipVendor } from '../sim/rpg/storyShips';
import { worldCaddy, storyCaddyHired, activeStoryCaddy, STORY_CADDY_PRICE } from '../sim/rpg/storyCaddies';
import { shopItem } from '../sim/rpg/economy';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { crewWallHTML, allyInspectOverlayHTML } from '../render/storyCrew';
import { activeQuest, questWorld, questById, questGiverName } from '../sim/rpg/storyQuests';
import { storyObjective } from '../sim/rpg/storyGuide';

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

/**
 * GS-story-objective: the MISSION LOG panel — the campaign's "what do I do now, and why?" surface. Player
 * feedback: after winning the World Tour you were dropped in with "nothing to go on". This shows the
 * overarching GOAL, a live Sigil progress row, and the single most useful NEXT step (with a button that
 * jumps there). Reads the pure `storyObjective`. Shown at the top of the spaceport clubhouse.
 */
function missionPanelHTML(story: StoryState): string {
  const obj = storyObjective(story);
  const pips = Array.from({ length: obj.total }, (_, i) =>
    `<span class="gs-mission-pip${i < obj.sigils ? ' gs-mission-pip--on' : ''}" aria-hidden="true">◆</span>`,
  ).join('');
  const actionBtn = obj.actionLabel && obj.action
    ? `<button class="gs-btn gs-mission-go" data-action='${JSON.stringify(obj.action)}'>${obj.actionLabel} ›</button>`
    : '';
  return `
    <section class="gs-mission" aria-label="Your mission">
      <div class="gs-mission-hdr">
        <span class="gs-mission-title">🎯 Your mission</span>
        <span class="gs-mission-prog">${pips} <b>${obj.sigils}</b>/${obj.total} Sigils</span>
      </div>
      <p class="gs-mission-goal">${obj.goal}</p>
      <div class="gs-mission-next">
        <span class="gs-mission-nextlab">NEXT</span>
        <span class="gs-mission-nexttxt">${obj.next}</span>
      </div>
      ${actionBtn}
    </section>
    <style>
      .gs-mission{max-width:520px;margin:10px auto 0;background:linear-gradient(180deg,#101826,#0c1119);
        border:1px solid #2a3346;border-left:3px solid #7fd8ff;border-radius:14px;padding:12px 14px;}
      .gs-mission-hdr{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
      .gs-mission-title{font-size:14px;font-weight:800;color:#dff3ff;letter-spacing:.02em;}
      .gs-mission-prog{font-size:12px;color:var(--gs-dim,#9fb0c8);white-space:nowrap;}
      .gs-mission-prog b{color:var(--gs-gold,#e9c46a);}
      .gs-mission-pip{color:#2f3b50;font-size:11px;letter-spacing:1px;}
      .gs-mission-pip--on{color:#e9c46a;text-shadow:0 0 5px #e9c46a99;}
      .gs-mission-goal{margin:7px 0 0;font-size:12.5px;line-height:1.45;color:var(--gs-dim,#aeb9c9);}
      .gs-mission-next{margin-top:9px;display:flex;gap:8px;align-items:flex-start;
        background:#0a0f18;border:1px solid #223047;border-radius:10px;padding:8px 10px;}
      .gs-mission-nextlab{flex:0 0 auto;font-size:10px;font-weight:800;letter-spacing:.1em;color:#7fd8ff;
        background:#0e2233;border:1px solid #274a5f;border-radius:6px;padding:2px 6px;margin-top:1px;}
      .gs-mission-nexttxt{font-size:13px;line-height:1.4;color:#eaf2ff;font-weight:600;}
      .gs-mission-go{margin-top:10px;width:100%;}
    </style>`;
}

/**
 * GS-story-objective: the NEW-GAME premise card — the "what is this / why am I playing?" the first-time
 * player was missing. A short, evocative brief shown on the golfer picker so the campaign's shape is clear
 * before you tee off: you're the champion, the Universe is in peril, and the road is five tournaments +
 * a final battle. Pure copy; own `.gs-premise*` scope.
 */
function premiseCardHTML(): string {
  return `
    <section class="gs-premise" aria-label="Story Tour — the premise">
      <div class="gs-premise-kicker">✦ STORY TOUR</div>
      <p class="gs-premise-lede">You are <b>Earth's greatest golfer</b>, about to defend your World Tour crown
        on the Old Course. But win, and a shadow will fall — the Universe needs a champion, and the
        <span style="color:#7fe0a0;">Prognostic Parrot</span> has foreseen you.</p>
      <div class="gs-premise-road">
        <span class="gs-premise-step">🌍 Win Earth</span><span class="gs-premise-arr">›</span>
        <span class="gs-premise-step">🚀 Voyage the galaxy</span><span class="gs-premise-arr">›</span>
        <span class="gs-premise-step">🏆 Win 5 Sigils</span><span class="gs-premise-arr">›</span>
        <span class="gs-premise-step">🐍 Slay Jörmungandr</span>
      </div>
      <style>
        .gs-premise{max-width:560px;margin:10px auto 2px;background:linear-gradient(180deg,#101826,#0b1017);
          border:1px solid #2a3346;border-left:3px solid #7fe0a0;border-radius:14px;padding:12px 16px;}
        .gs-premise-kicker{font-size:11px;font-weight:800;letter-spacing:.14em;color:#7fe0a0;}
        .gs-premise-lede{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--gs-dim,#aeb9c9);}
        .gs-premise-lede b{color:var(--gs-ink,#eaf1fb);}
        .gs-premise-road{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:10px;}
        .gs-premise-step{font-size:11.5px;font-weight:700;color:#dfe8f4;background:#0e1420;border:1px solid #273246;
          border-radius:20px;padding:3px 10px;white-space:nowrap;}
        .gs-premise-arr{color:#4a5a72;font-weight:800;}
      </style>
    </section>`;
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
    ${premiseCardHTML()}
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
        <span style="display:block;margin-top:4px;color:#7fd8ff;font-size:12px;">Win this round to become World Champion — then answer the call to the stars.</span>
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
 * The chapter's Galaxy Tournament banner (GS-story-tournament) — shown on the clubhouse only when the
 * current chapter's tournament is UNLOCKED (enough of its worlds cleared, Sigil unwon). The chapter climax,
 * so it's a prominent gold call-to-action above the spaceport actions. Empty when no tournament is ready.
 */
function tournamentBannerHTML(story: StoryState): string {
  // GS-story-yggdrasil: once the five Sigils forge the key, the FINALE takes over the banner — the climax.
  if (finaleUnlocked(story)) {
    return `
    <section style="max-width:520px;margin:12px auto 0;">
      <button class="gs-btn" style="background:linear-gradient(180deg,#1a1220,#0e1614);border-color:#3a6a52;color:#9dffce;text-align:left;padding:12px 16px;"
        data-action='${JSON.stringify({ type: 'openStoryFinale' })}'>
        <div style="font-size:15px;font-weight:800;">🐍 The Dark Root has opened</div>
        <div style="font-size:12px;color:#7fe0a0;font-weight:600;margin-top:2px;">All five Sigils are yours — Jörmungandr wakes. Engage the finale.</div>
      </button>
    </section>`;
  }
  const t = currentTournament(story);
  if (!t) return '';
  return `
    <section style="max-width:520px;margin:12px auto 0;">
      <button class="gs-btn" style="background:linear-gradient(180deg,#2a2410,#1c1808);border-color:#6a5320;color:#ffe6a6;text-align:left;padding:12px 16px;"
        data-action='${JSON.stringify({ type: 'openStoryTournament' })}'>
        <div style="font-size:15px;font-weight:800;">🏆 ${t.name} — now open</div>
        <div style="font-size:12px;color:#d8c089;font-weight:600;margin-top:2px;">Play for ${t.sigilName} · your rival ${t.rivalName.split(' ')[0]} awaits</div>
      </button>
    </section>`;
}

/** GS-story-quests: the active ally-quest banner — a call to fly to the ally's world and play the quest.
 *  Empty when no quest is accepted. */
function questBannerHTML(story: StoryState): string {
  const q = activeQuest(story);
  if (!q) return '';
  const world = q ? questWorld(q) : undefined;
  const worldName = world ? staticCourseSpec(world)?.name ?? 'their world' : 'their world';
  return `
    <section style="max-width:520px;margin:12px auto 0;">
      <button class="gs-btn" style="background:linear-gradient(180deg,#1e1630,#140e1e);border-color:#5a3f8a;color:#d6c2ff;text-align:left;padding:12px 16px;"
        data-action='${JSON.stringify({ type: 'playStoryQuest' })}'>
        <div style="font-size:15px;font-weight:800;">🗺 ${q.title} — with ${questGiverName(q).split(' ')[0]}</div>
        <div style="font-size:12px;color:#b8a8e0;font-weight:600;margin-top:2px;">Fly to ${worldName} and play it together ›</div>
      </button>
    </section>`;
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
  // GS-story-allies: the recruited crew stand in the clubhouse; tap one to talk (their portrait, faction,
  // and rotating banter). Empty until you recruit a friend out in the galaxy.
  const allyOverlay = state.storyAllyInspectId
    ? allyInspectOverlayHTML(state.storyAllyInspectId, story, state.storyAllyTalk ?? 0)
    : '';

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
        ${(() => { const c = activeStoryCaddy(story); const n = c ? shopItem(c)?.name : undefined; return n ? chip('your caddy', `🎒 <b>${n}</b>`, '#f0a8c8') : ''; })()}
      </div>
    </header>

    ${missionPanelHTML(story)}

    <!-- GS-story-clubhouse-scene: the interactive Mothership clubhouse — tap the star chart, hangar, locker,
         or the bar to go there; your golfer + active caddy stand on the deck, the Parrot tends the bar. -->
    <section style="max-width:620px;margin:8px auto 0;">
      ${spaceportSceneHTML(story)}
      <p style="text-align:center;color:var(--gs-dim);font-size:12px;line-height:1.45;margin:8px 0 0;">
        <span style="color:#7fe0a0;">🦜</span> <em>${parrotLine}</em>
      </p>
    </section>

    ${tournamentBannerHTML(story)}

    ${questBannerHTML(story)}

    ${crewWallHTML(story)}

    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:14px auto 0;">
      ${hubFooterHTML()}
    </div>
    ${allyOverlay}`;
}

/** GS-story-caddies: the recap's recruit-a-friend row for the world just cleared (a caddy waits here) —
 *  recruit them, or note they're already aboard. Empty when no friend waits at this world. */
function recapCaddyHTML(story: StoryState | undefined, courseId: string): string {
  if (!story) return '';
  const caddyId = worldCaddy(courseId);
  if (!caddyId) return '';
  const name = shopItem(caddyId)?.name ?? 'a friend';
  if (storyCaddyHired(story, caddyId)) return `<div style="text-align:center;color:#7fe0a0;font-size:13px;">🎒 ${name} is already in your crew.</div>`;
  return `<button class="gs-btn" style="background:linear-gradient(180deg,#22161f,#170f16);border-color:#6a3a52;color:#f0a8c8;" data-action='${JSON.stringify({ type: 'hireStoryCaddy', worldId: courseId, caddyId })}'>🎒 Recruit ${name} · ✦ ${STORY_CADDY_PRICE}</button>`;
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
  // GS-story-quests: a quest round's recap is the QUEST completion — the ally's parting scene + the reward.
  const quest = r.questId ? questById(r.questId) : undefined;
  const title = quest ? '🎁 Quest complete!' : r.wasPrologue ? '🏆 Champion!' : '⛳ World cleared';
  const kicker = quest
    ? `${quest.title} — ${questGiverName(quest).split(' ')[0]} keeps their word.`
    : r.wasPrologue
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
        quest
          ? `${quest.complete.map((l) => `<p style="color:#e6ddf0;">${l}</p>`).join('')}
             <div style="margin:10px auto 0;max-width:460px;background:#181322;border:1px solid #3a2f4a;border-left:3px solid #a97b25;border-radius:10px;padding:10px 14px;text-align:left;">
               <div style="font-size:13px;font-weight:800;color:#f0c874;">🎁 ${quest.rewardName}</div>
               <div style="font-size:12.5px;color:#c6bcd6;margin-top:2px;">${quest.rewardBlurb}</div>
             </div>`
          : r.wasPrologue
            ? `<p><em>As the gallery roars, a shadow falls across the 18th green. Something vast is descending from the sky…</em></p>
             <p style="color:#7fe0a0;">🦜 "Golfer — the Universe needs you. Gather friends and allies, and follow me!"</p>`
            : `<p>Credits banked. The Coil is not resting — nor is the serpent.</p>`
      }
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:18px auto 0;">
      ${
        quest
          ? // GS-story-quests: claim the reward (grants + equips the club, records the quest done) → clubhouse.
            `<button class="gs-btn" data-action='${JSON.stringify({ type: 'completeStoryQuest' })}'>🎁 Take ${quest.rewardName} — back to the clubhouse ›</button>`
          : r.wasPrologue
            ? // GS-story-intro: the prologue victory plays the recruitment cinematic before the clubhouse
              // (app.ts wires `data-story-intro`), so it does NOT use the plain continue action.
              `<button class="gs-btn" data-story-intro="1">Answer the call ›</button>`
            : // GS-story-shop-access / GS-story-caddies: shop the world you just cleared right here (Pro Shop
              // always; ship-vendor worlds open their shipyard; a friend who waits here can be recruited) —
              // no need to fly back for the first visit. All guarded to a stocking world, so each only shows
              // where there's actually something to do.
              `${worldHasShop(r.courseId) ? `<button class="gs-btn" data-action='${JSON.stringify({ type: 'openStoryShop', worldId: r.courseId })}'>🛒 Visit the Pro Shop</button>` : ''}
             ${worldIsShipVendor(r.courseId) ? `<button class="gs-btn" data-action='${JSON.stringify({ type: 'openStoryShipyard', worldId: r.courseId })}'>🚀 Visit the Shipyard</button>` : ''}
             ${recapCaddyHTML(state.story, r.courseId)}
             <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyRoundContinue' })}'>Back to the clubhouse ›</button>`
      }
    </div>`;
}
