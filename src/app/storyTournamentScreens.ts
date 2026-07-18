/**
 * The Story-Tour GALAXY TOURNAMENT screens (GS-story-tournament) — the chapter climax. The LOBBY (reached
 * from the clubhouse when a tournament is unlocked) sets the stage: the host, the recurring rival, the
 * Sigil + prize at stake, and the tee-off. The RESULT recap resolves it: beat the rival's gross and you win
 * the Sigil (chapter advances, next worlds unlock); the fifth Sigil forges the key to the finale. Built
 * from design tokens + a self-contained `.gs-tourn*` style block (own prefix). Reads the live `state`.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import { STORY_CHAPTER_COUNT } from '../sim/rpg/story';
import { currentTournament, sigilCount } from '../sim/rpg/storyTournaments';

export function storyTournamentScreen(): string {
  const story = state.story;
  const t = story ? currentTournament(story) : undefined;
  if (!story || !t) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🏆 Galaxy Tournament</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryTournament' })}'>‹ Back</button>
      </div>`;
  }
  const who = getCharacter(story.characterId)?.name ?? 'Champion';
  const intro = t.intro.map((p) => `<p class="gs-tourn-lore">${p}</p>`).join('');
  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🏆 ${t.name}</h1>
      <p class="gs-hero-tag">Chapter ${t.chapter} of ${STORY_CHAPTER_COUNT} · hosted by ${t.host}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="the trophy at stake">🏅 <b>${t.sigilName}</b></span>
        <span class="gs-chip" style="border-color:#2a3a2a;color:#7fe0a0;font-size:14px;" title="Sigils won">🏆 <b>${sigilCount(story)}</b> / ${STORY_CHAPTER_COUNT}</span>
      </div>
    </header>
    <section style="max-width:520px;margin:8px auto 0;">
      <div class="gs-tourn-rival">
        <span class="gs-tourn-rivalglyph" aria-hidden="true">${t.rivalId === 'venoma' ? '🐍' : t.rivalId === 'voss' ? '🖤' : '🏌'}</span>
        <div>
          <div class="gs-tourn-rivallabel">Your rival</div>
          <div class="gs-tourn-rivalname">${t.rivalName}</div>
        </div>
      </div>
      ${intro}
      <div class="gs-tourn-prize"><b>🎁 Prize:</b> ${t.prize}</div>
      <div class="gs-tourn-stakes">Beat ${t.rivalName.split(' ')[0]}’s round over 18 holes, ${who}, and the ${t.sigilName} is yours.</div>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:16px auto 0;">
      <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyPlayTournament' })}'>⛳ Tee off — play for the Sigil</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryTournament' })}'>‹ Not yet — back to the clubhouse</button>
    </div>
    ${TOURN_STYLE}`;
}

export function storyTournamentResultScreen(): string {
  const r = state.lastStoryTournament;
  if (!r) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🏆 Tournament</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyTournamentContinue' })}'>Continue ›</button>
      </div>`;
  }
  const diff = r.playerGross - r.rivalGross;
  const margin = diff === 0 ? 'tied, and the tie goes to you' : diff < 0 ? `by ${-diff}` : `by ${diff}`;
  const title = r.won ? (r.finalSigil ? '🗝 The final Sigil!' : `🏅 ${r.sigilName} won!`) : '💔 So close';
  const kicker = r.won
    ? r.finalSigil
      ? 'All five Sigils are yours — they forge the key to the serpent’s root.'
      : `You beat ${r.rivalName.split(' ')[0]} ${margin}. The chapter turns.`
    : `${r.rivalName.split(' ')[0]} edged you ${margin}. Regroup and challenge again.`;
  const body = r.won
    ? r.finalSigil
      ? `<p>The Sigils rise and lock together into a single burning key. Somewhere far below Yggdrasil, something vast stirs — and now you can reach it.</p>
         <p style="color:#7fe0a0;">🦜 "You did it, champion. Five Sigils. The galaxy owes you everything — but it isn’t over. The serpent is awake, and it is coming."</p>`
      : `<p><b>🎁 ${r.prize}</b></p>
         <p>The next reaches of the galaxy open on your star chart.</p>`
    : `<p>A tournament is never lost for good — the venue will host you again. Sharpen your bag, arm your ship, and take the rematch.</p>`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title">${title}</h1>
      <p class="gs-hero-tag">${kicker}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-ink);font-size:14px;">${r.name}</span>
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="your gross vs the rival">You ${r.playerGross} · ${r.rivalName.split(' ')[0]} ${r.rivalGross}</span>
      </div>
    </header>
    <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.55;">
      ${body}
    </section>
    <div style="max-width:420px;margin:18px auto 0;">
      <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyTournamentContinue' })}'>${r.won ? 'Onward ›' : 'Back to the clubhouse ›'}</button>
    </div>
    ${TOURN_STYLE}`;
}

const TOURN_STYLE = `
  <style>
    .gs-tourn-rival{display:flex;align-items:center;gap:12px;background:linear-gradient(180deg,#1a1220,#120c18);
      border:1px solid #3a2440;border-left:3px solid #b060c0;border-radius:12px;padding:10px 14px;margin-bottom:10px;}
    .gs-tourn-rivalglyph{font-size:30px;line-height:1;}
    .gs-tourn-rivallabel{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#c98adf;}
    .gs-tourn-rivalname{font-size:16px;font-weight:800;color:var(--gs-ink,#eaf1fb);}
    .gs-tourn-lore{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--gs-dim,#9fb0c8);font-style:italic;}
    .gs-tourn-prize{background:#0b0f18;border:1px solid #2a3320;border-radius:10px;padding:9px 12px;margin:2px 0 10px;
      font-size:13px;color:#e9c46a;line-height:1.45;}
    .gs-tourn-stakes{text-align:center;font-size:13px;color:var(--gs-ink,#eaf1fb);line-height:1.5;}
  </style>`;
