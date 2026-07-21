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
import { betrayerName } from '../sim/rpg/storyBetrayal';
import {
  finaleResult,
  finaleLoadout,
  finaleAssaultSeconds,
  FINALE_BREACH_NEED,
  FINALE_SURVIVE_NEED,
  FINALE_OVERWHELM_HITS,
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
  // GS-story-quality: the finale is re-themed by the path chosen at The Choice. The WARDEN comes to KILL
  // the serpent and save the worlds (the Parrot at your side); the HERALD comes to UNSEAL it — first
  // breaking the Warden blockade that arrives to stop you, then presenting the serpent its final release
  // (the Crow, the Coil's true prophet, in the Parrot's place). The mechanics are identical; the framing,
  // the speaker, and the meaning invert. (Jörmungandr is a genderless eldritch enormity — "it", never "she".)
  const herald = story.alignment === 'herald';
  const lore = herald
    ? `The five Sigils burn together into the Green Key, and the root of the World-Tree splits open. Coiled
        in the dark below waits the World-Eater, bound in the Wardens' old wards — and the Ark has come after
        you, your friends at its helm, too late to close the root. Break the last wards that cage it, and
        there is nothing left between the galaxy and its rest.`
    : `The five Sigils burn together into a single key, and the root of the World-Tree splits open. Coiled
        in the dark below sleeps the world-serpent — and something worse wears it now, a corruption from
        beyond the stars. It is waking. Only your ship stands between it and every world you crossed to get here.`;
  const guide = herald
    ? `<p class="gs-fin-lore" style="color:#b0e04f;">🐦‍⬛ "Fly sharp, Herald. Wear the wards down and it
        will thrash harder with every one that gives — venom, lances, the void itself. Keep shields for the
        moment the last ward cracks; nothing dodges that. Then the seal lies bare — strike it, and let the
        serpent rise."</p>`
    : `<p class="gs-fin-lore" style="color:#7fe0a0;">🦜 "This is it, ${who}. It gets MEANER as it bleeds —
        acid, then lightning, then the void itself. Fly around what you can, save the shields for what you
        can't, and when it finally uncoils and bares that eye… you take the shot. Don’t miss."</p>`;
  // GS-story-battle-3: the R-Type sequence fight — fly your ship, fire each weapon from its own trigger,
  // dodge the phase attacks, and hold shields for the near-undodgeable overwhelm at the end.
  const plan = herald
    ? `<p class="gs-fin-battleplan">🚀 <b>Fly your ship</b> — tap anywhere on the field to move; the serpent's
        venom drifts slow enough to fly around.<br>
        ⚔ <b>Fire your arsenal</b> — every weapon you own is its own trigger on the battle HUD, each with its
        own punch and recharge.<br>
        🐍 <b>It wakes in stages.</b> As the wards wear down it sprays ACID, the Warden blockade sweeps the
        field with telegraphed LANCES, and void-rifts tear open — and when the last ward cracks, one
        <b>overwhelming barrage</b> lands that no pilot dodges: your shields must absorb
        ${FINALE_OVERWHELM_HITS} strikes, so keep cells in hand.<br>
        🎯 <b>The Final Strike.</b> When the seal lies bare on its brow, strike the ball home and break it.<br>
        <span style="color:#8fb8ff;">Lose the fight and you are only driven off — re-engage at no cost.</span></p>`
    : `<p class="gs-fin-battleplan">🚀 <b>Fly your ship</b> — tap anywhere on the field to move; the serpent's
        acid drifts slow enough to fly around.<br>
        ⚔ <b>Fire your arsenal</b> — every weapon you own is its own trigger on the battle HUD, each with its
        own punch and recharge.<br>
        🐍 <b>It escalates as it bleeds.</b> At 75% it opens the ACID SPRAY, at 50% it calls telegraphed
        LIGHTNING, at 25% VOID BLASTS detonate across the field — and at the last sliver it UNCOILS in one
        <b>overwhelming barrage</b> no pilot dodges: your shields must absorb ${FINALE_OVERWHELM_HITS}
        strikes, so keep cells in hand.<br>
        🎯 <b>The Final Strike.</b> When its eye is bared, strike the ball home.<br>
        <span style="color:#8fb8ff;">Lose the fight and you are only driven back — re-engage at no cost.</span></p>`;
  // The LIVE battle readout — quoted straight from the same `finaleLoadout` the fight consumes, so the
  // briefing IS the physics: every owned weapon, its real damage and recharge, the real shield pool.
  const lo = finaleLoadout(story);
  const assaultS = finaleAssaultSeconds(lo);
  const weaponRows = lo.weapons
    .map(
      (w) =>
        `<span style="color:${w.color};">▸ ${w.name}</span><b>${w.damage} dmg · ${(w.cooldownMs / 1000).toFixed(1)}s recharge</b>`,
    )
    .join('');
  const readout = `
    <h2 class="gs-fin-sec">Ship readout — your arsenal, live</h2>
    <div class="gs-fin-readout">
      ${weaponRows}
      <span>⚔ Assault</span><b>${
        r.breachOk
          ? `${herald ? 'wears the wards down' : 'brings it to bay'} in ~${Math.round(assaultS)}s of fire`
          : herald
            ? 'cannot break the last ward'
            : 'cannot break its hide'
      }</b>
      <span>🛡 Shields</span><b>${lo.shieldCells} ${lo.shieldCells === 1 ? 'cell' : 'cells'} (the overwhelm costs ${FINALE_OVERWHELM_HITS})</b>
      <span>🚀 Engines</span><b>flight speed ${lo.shipSpeed} · faster weapon recharge</b>
    </div>
    <p class="gs-fin-hint" style="color:#9fb0c8;">Heavier weapons shorten the assault · deeper defence adds
      shield cells · better engines fly and recharge faster. Every phase still comes — arming up sharpens
      the fight, it never skips the gauntlet.</p>`;
  // GS-story-quality (finding C): weapons + engines outfit aboard your ship; SHIELDS are stocked at ship-vendor
  // worlds you fly to — so the guidance names where the gap is actually filled, not the equip-only Hangar.
  const breachHint = herald
    ? 'Buy heavier WEAPONS — aboard your ship or at a ship-vendor world — your guns can’t break its wards yet.'
    : 'Buy heavier WEAPONS — aboard your ship or at a ship-vendor world — your guns can’t crack its scales yet.';
  const surviveHint = 'Buy ENGINES aboard your ship and SHIELDS at a ship-vendor world — you can’t weather the assault yet.';
  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🐍 Jörmungandr</h1>
      <p class="gs-hero-tag">The Dark Root of Yggdrasil · ${herald ? 'the final rite' : 'the final battle'}</p>
    </header>
    <section style="max-width:520px;margin:6px auto 0;">
      <p class="gs-fin-lore">${lore}</p>
      ${guide}

      ${plan}
      ${readout}

      <h2 class="gs-fin-sec">Battle readiness</h2>
      ${gateRow(herald ? 'Firepower — shatter the wards' : 'Firepower — breach the hide', r.weaponRating, FINALE_BREACH_NEED, breachHint)}
      ${gateRow('Defence — survive the assault', r.defenceRating, FINALE_SURVIVE_NEED, surviveHint)}
      <div class="gs-fin-verdict" style="color:${ready ? '#7fe0a0' : '#ff9a6a'};">
        ${ready ? '🚀 Your ship is ready. Engage when you are.' : '🛠 Your ship isn’t ready — arm up, then return.'}
      </div>
      <p class="gs-fin-save">💾 Your campaign is <b>saved</b> right here at the root. Engaging risks nothing —
        lose, and you return to the clubhouse with everything intact to arm up and try again. The root will wait.</p>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:16px auto 0;">
      <button class="gs-btn" data-story-finale-engage="1" style="${ready ? '' : 'opacity:0.9;'}">⚔ Engage Jörmungandr</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryFinale' })}'>‹ Not yet — arm up first (progress saved)</button>
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
    // GS-story-finisher: the interactive strike's quality colours the win — a dead-centre CLEAN strike vs a
    // GRAZE that clipped the eye (the seal still takes; an armed champion always wins). GS-story-unending-
    // tease: the RESEAL never kills the serpent — it sings it to SLEEP — and the win is left one friend
    // short: the betrayer and the Coil's remnant flee to THE DESTINATION (the named unknown deep).
    const graze = r.strike === 'graze';
    const fled = state.story ? betrayerName(state.story) : 'your lost friend';
    const strikeLine = herald
      ? graze
        ? `<p style="color:#ffd08a;">🎯 Your finisher <b>clipped</b> the seal — not the clean release you meant, but enough. The last ward cracks all the same, and you'll always know how close it was.</p>`
        : `<p style="color:#c8e88a;">🎯 A <b>dead-centre</b> strike — the ball vanished into the seal like it was always meant to, and the cage sprang open clean.</p>`
      : graze
        ? `<p style="color:#ffd08a;">🎯 Your finisher <b>clipped</b> the eye — not the pure note you meant to strike, but enough. The great eye wavered, dimmed… and slid shut all the same.</p>`
        : `<p style="color:#9dffce;">🎯 A <b>dead-centre</b> strike — the ball vanished into the serpent's eye like it was always meant to, and the eye… closed. Not a kill. A lullaby.</p>`;
    const title = herald ? '🐍 Ragnarök — The Long Rest' : '🌌 The Reseal — The Universe is Saved';
    const tag = herald
      ? 'The serpent uncoils around the galaxy. The lights go out, one by one, into a final green silence.'
      : 'Jörmungandr sleeps. The seal takes, the root goes quiet, and dawn breaks across every world you crossed.';
    const body = herald
      ? `<p>Your finisher struck true, but not to kill — to <em>release</em>. The World-Eater unwinds across
          the sky, and the lights go out one by one, into a serene and perfect stillness. The Coil hails you
          as its Herald as the last star gutters. The Universe is devoured. You tell yourself it was mercy.</p>
         <p style="color:#b0e04f;">🐍 "It is done, Herald. The old Game is over. What comes next is rest — endless, perfect, still."</p>`
      : `<p>Your finisher found the serpent’s eye — and the World-Eater did not break. It <em>exhaled</em>.
          The coils loosened, the seal took hold, and Jörmungandr sank back beneath the root into a sleep
          with no dreams in it. The Great Game is won — not with a killing blow, but with the truest shot
          ever struck: the one that sang the end of everything back to sleep.</p>
         <p>And yet the dawn came up one friend short. Ahead of the light, a single dark sail ran for open
          night — <b>${fled}</b>, and what remains of the Coil, fleeing past the edge of every chart for
          <b>The Destination</b>. Whatever the whisper has left of them is out there still, in a deep
          no Warden has ever flown.</p>
         <p style="color:#7fe0a0;">🦜 "Let it sleep, champion. We saved everything… and I still count us one
          short. Bringing ${fled} home will mean flying further than any chart we own — all the way to The
          Destination itself. Not today. But when that door opens — you and I go through it together."</p>`;
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
  // GS-story-battle-2: an ARMED loss (`repelled`) is its own recap — the ship was ready, the FIGHT beat you.
  // No shipyard guidance (nothing to buy); steady the guns, veer the strikes, and re-engage at no cost.
  if (r.failReason === 'repelled') {
    const rTitle = herald ? '🛡 Driven Off the Root' : '🐍 Driven Back';
    const rTag = herald
      ? 'The blockade holds you off — this once. The wards you cracked already tremble.'
      : 'The coils sweep you back into the dark — but your ship holds together.';
    const rBody = herald
      ? `<p>Your ship limps clear of the lances, shields spent — but the root remains open, and your arsenal is
          every bit equal to the rite. Fire between their volleys, <b>veer when a lance locks on</b>, and the
          last ward will fall.</p>
         <p style="color:#b0e04f;">🐦‍⬛ "The ship was ready, Herald. Next time, so are you. Go again — the
          serpent keeps no calendar."</p>`
      : `<p>The serpent's coils battered your shields down before your guns could finish the work — but your
          ship is sound and the campaign is saved at the root. Fire between its lunges, <b>veer when it rears
          to strike</b>, and its hide will crack.</p>
         <p style="color:#7fe0a0;">🦜 "The ship did its part — now we do ours. Breathe, champion. We go
          straight back in."</p>`;
    return `
      <header class="gs-hero gs-storyres">
        <h1 class="gs-hero-title">${rTitle}</h1>
        <p class="gs-hero-tag">${rTag}</p>
      </header>
      <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.6;">
        ${rBody}
      </section>
      <div style="max-width:420px;margin:18px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyFinaleContinue' })}'>Back to the root ›</button>
      </div>
      ${FIN_STYLE}`;
  }
  const title = herald ? '🦜 The Wardens Prevail' : '🐦‍⬛ The World-Eater is Free';
  const tag = herald
    ? 'The Parrot, Driver Dan and Penelope hold the root. Engines busted, you flee toward the dark zones.'
    : 'The Crow let you win all along — you were to be the key. The maw opens on the unbroken hide.';
  const body = herald
    ? `<p>Dan plants his feet where your bag once hung. Penelope reads the line that stops you cold. The Parrot
        bars the root, and your busted ship falls away into the unmapped dark. But a Herald is patient — arm
        heavier at a ship-vendor world, and come back for what you were promised.</p>
       <p style="color:#b0e04f;">🐦‍⬛ "Patience, Herald. A blockade is only a delay, and the cage was always
        meant to open. Arm heavier. Return. The serpent keeps no calendar — and neither do we."</p>`
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
    .gs-fin-readout{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;background:#0b0f18;border:1px solid #232b3b;
      border-radius:11px;padding:9px 12px;font-size:12.5px;color:#cbd6e4;}
    .gs-fin-readout b{color:var(--gs-ink,#eaf1fb);font-weight:700;text-align:right;}
    .gs-fin-verdict{text-align:center;font-size:13.5px;font-weight:700;margin-top:12px;line-height:1.5;}
    .gs-fin-battleplan{background:#0b0f18;border:1px solid #232b3b;border-left:3px solid #6a5320;border-radius:10px;
      padding:9px 12px;margin:2px 0 4px;font-size:12.5px;line-height:1.6;color:#cbd6e4;}
    .gs-fin-save{margin:12px 0 0;font-size:12px;line-height:1.5;color:#8fb8ff;text-align:center;
      background:#0a1220;border:1px solid #1f2f44;border-radius:10px;padding:8px 12px;}
  </style>`;
