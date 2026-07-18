/**
 * The Story-Tour FINALE screens (GS-story-yggdrasil) — the Jörmungandr battle. The BRIEFING (reached from
 * the clubhouse once the five Sigils forge the key) reveals the serpent and your ship's readiness across
 * the two battle gates (firepower to breach, engines+shields to survive), and lets you engage. Engaging
 * plays the battle CINEMATIC (app.ts) and lands on the RESULT: victory (universe saved, campaign complete,
 * Star Tour unlocked) or defeat (which gate fell short + how to arm for the rematch). Built from design
 * tokens + a self-contained `.gs-fin*` style block (own prefix). Reads the live `state`.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import {
  finaleResult,
  FINALE_BREACH_NEED,
  FINALE_SURVIVE_NEED,
} from '../sim/rpg/storyFinale';

/** A readiness gate row — its rating vs the threshold, met or short. */
function gateRow(label: string, have: number, need: number, hint: string): string {
  const ok = have >= need;
  const pct = Math.max(0, Math.min(100, Math.round((have / need) * 100)));
  return `
    <div class="gs-fin-gate">
      <div class="gs-fin-gatehd">
        <span>${ok ? '✅' : '⚠️'} ${label}</span>
        <span class="gs-fin-gateval" style="color:${ok ? '#7fe0a0' : '#ff9a6a'};">${have} / ${need}</span>
      </div>
      <div class="gs-fin-bar"><div class="gs-fin-barfill" style="width:${pct}%;background:${ok ? '#4fe08a' : '#e0794f'};"></div></div>
      ${ok ? '' : `<div class="gs-fin-hint">${hint}</div>`}
    </div>`;
}

export function storyFinaleScreen(): string {
  const story = state.story;
  const r = story ? finaleResult(story) : undefined;
  if (!story || !r) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🐍 The Dark Root</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryFinale' })}'>‹ Back</button>
      </div>`;
  }
  const who = getCharacter(story.characterId)?.name ?? 'Champion';
  const ready = r.won;
  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🐍 Jörmungandr</h1>
      <p class="gs-hero-tag">The Dark Root of Yggdrasil · the final battle</p>
    </header>
    <section style="max-width:520px;margin:6px auto 0;">
      <p class="gs-fin-lore">The five Sigils burn together into a single key, and the root of the World-Tree
        splits open. Coiled in the dark below sleeps the world-serpent — and something worse wears it now,
        a corruption from beyond the stars. It is waking. Only your ship stands between it and every world
        you crossed to get here.</p>
      <p class="gs-fin-lore" style="color:#7fe0a0;">🦜 "This is it, ${who}. Everything we armed for. Take the
        shot when she opens her eye — and don’t miss."</p>

      <h2 class="gs-fin-sec">Battle readiness</h2>
      ${gateRow('Firepower — breach the hide', r.weaponRating, FINALE_BREACH_NEED, 'Buy heavier WEAPONS at the shipyard — your guns can’t crack her scales yet.')}
      ${gateRow('Defence — survive the coils', r.defenceRating, FINALE_SURVIVE_NEED, 'Buy ENGINES + SHIELDS at the shipyard — you can’t weather her strike yet.')}
      <div class="gs-fin-verdict" style="color:${ready ? '#7fe0a0' : '#ff9a6a'};">
        ${ready ? '🚀 Your ship is ready. Engage when you are.' : '🛠 Your ship isn’t ready — arm up at the shipyard, then return.'}
      </div>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:16px auto 0;">
      <button class="gs-btn" data-story-finale-engage="1" style="${ready ? '' : 'opacity:0.9;'}">⚔ Engage Jörmungandr</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryFinale' })}'>‹ Not yet — back to the clubhouse</button>
    </div>
    ${FIN_STYLE}`;
}

export function storyFinaleResultScreen(): string {
  const r = state.lastStoryFinale;
  if (!r) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🐍 The battle</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyFinaleContinue' })}'>Continue ›</button>
      </div>`;
  }
  if (r.won) {
    // GS-story-chapters: the ending diverges by the path chosen at The Choice — the Warden RESEAL (a clean
    // salvation) vs the Herald LONG REST (a victory that grieves).
    const herald = state.story?.alignment === 'herald';
    // GS-story-finisher: the interactive strike's quality colours the win — a dead-centre CLEAN kill vs a
    // GRAZE that clipped the eye (the serpent still falls; an armed champion always wins).
    const graze = r.strike === 'graze';
    const strikeLine = graze
      ? `<p style="color:#ffd08a;">🎯 Your finisher <b>clipped</b> the eye — not the killing blow you wanted, but enough. The serpent falls all the same, and you'll always know how close it was.</p>`
      : `<p style="color:#9dffce;">🎯 A <b>dead-centre</b> strike — the ball vanished into the serpent's eye like it was always meant to. A perfect kill.</p>`;
    const title = herald ? '🐍 Ragnarök — The Long Rest' : '🌌 The Universe is Saved';
    const tag = herald
      ? 'The serpent uncoils around the galaxy. The lights go out, one by one, into a final green silence.'
      : 'Jörmungandr falls. The corruption scatters into harmless light.';
    const body = herald
      ? `<p>Your finisher struck true, but not to kill — to <em>release</em>. The World-Eater unwinds across
          the sky, and the lights go out one by one, into a serene and perfect stillness. The Coil hails you
          as its Herald as the last star gutters. The Universe is devoured. You tell yourself it was mercy.</p>
         <p style="color:#b0e04f;">🐍 "It is done, Herald. The old Game is over. What comes next is rest — endless, perfect, still."</p>`
      : `<p>Your finisher found the serpent’s eye, and the world-eater came apart across the sky like a
          shattered constellation. The Great Game is won — the galaxy will spin on, and every world you
          crossed remembers the golfer who saved it.</p>
         <p style="color:#7fe0a0;">🦜 "You did it, champion. You actually did it. Now — the whole galaxy is
          open to you. Go and fly it."</p>`;
    return `
      <header class="gs-hero gs-storyres">
        <h1 class="gs-hero-title">${title}</h1>
        <p class="gs-hero-tag">${tag}</p>
      </header>
      <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.6;">
        ${strikeLine}
        ${body}
        <p style="color:var(--gs-gold);"><b>★ Story Tour complete — Star Tour is unlocked on the title.</b></p>
      </section>
      <div style="max-width:420px;margin:18px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyFinaleContinue' })}'>Roll the credits ›</button>
      </div>
      ${FIN_STYLE}`;
  }
  // GS-story-endings: a LOSS is path-specific too — the WARDEN who fails frees the World-Eater (the Crow's
  // long game); the HERALD who fails is put down by the Wardens and flees. Both are dramatised by the ending
  // cinematic (app.ts) — but the finale is never a dead-end: the Parrot's foresight (and, later, the
  // pre-battle save) gives you the pass back to arm up and change this future.
  const herald = state.story?.alignment === 'herald';
  const title = herald ? '🦜 The Wardens Prevail' : '🐦‍⬛ The World-Eater is Free';
  const tag = herald
    ? 'The Parrot, Driver Dan and Penelope hold the root. Engines busted, you flee toward the dark zones.'
    : 'The Crow let you win all along — you were to be the key. The maw opens on the unbroken hide.';
  const body = herald
    ? `<p>Dan plants his feet where your bag once hung. Penelope reads the line that stops you cold. The Parrot
        bars the root, and your busted ship falls away into the unmapped dark. But a Herald is patient — go to
        the shipyard, arm heavier, and come back for what you were promised.</p>
       <p style="color:#8fb8ff;">🦜 "Run to the dark places on no one’s chart, then. …But it isn’t over. Arm up. Come back. We both know you will."</p>`
    : `<p>The great black Crow spreads its wings and <em>laughs</em> — it never fought you; it let you win, every
        round, so YOU would carry the Keystone to the root. The maw yawns. But the Parrot pulls you clear at
        the last — this future can still be unwritten. Return to the shipyard, arm your ship, and take the
        root again before the Crow's design completes.</p>
       <p style="color:#7fe0a0;">🦜 "That thing PLAYED us — but we're not done. Get to the shipyard, arm up, and we go again. We change this."</p>`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title">${title}</h1>
      <p class="gs-hero-tag">${tag}</p>
    </header>
    <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.6;">
      ${body}
    </section>
    <div style="max-width:420px;margin:18px auto 0;">
      <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyFinaleContinue' })}'>Back to the shipyard ›</button>
    </div>
    ${FIN_STYLE}`;
}

const FIN_STYLE = `
  <style>
    .gs-fin-lore{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--gs-dim,#9fb0c8);font-style:italic;}
    .gs-fin-sec{font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--gs-ink,#eaf1fb);margin:14px 0 8px;}
    .gs-fin-gate{background:#0b0f18;border:1px solid #232b3b;border-radius:11px;padding:9px 12px;margin-bottom:9px;}
    .gs-fin-gatehd{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;color:var(--gs-ink,#eaf1fb);}
    .gs-fin-gateval{font-weight:800;}
    .gs-fin-bar{height:7px;border-radius:5px;background:#1a2130;margin-top:7px;overflow:hidden;}
    .gs-fin-barfill{height:100%;border-radius:5px;transition:width .3s ease;}
    .gs-fin-hint{font-size:11.5px;color:#e0a07a;line-height:1.4;margin-top:6px;}
    .gs-fin-verdict{text-align:center;font-size:13.5px;font-weight:700;margin-top:12px;line-height:1.5;}
  </style>`;
