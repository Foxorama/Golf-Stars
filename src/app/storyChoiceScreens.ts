/**
 * THE CHOICE (GS-story-chapters) — the alignment fork, reached after winning the Chapter-3 Storm Sigil.
 * The campaign has shown its hand: the Coil is real and the serpent is waking. Now you decide the back
 * half of the story — stay a **Fairway Warden** (protect, re-consecrate, redeem the Viper) or join the
 * **Coil** and become its **Herald** (desecrate, and crush your former friends). The two paths play
 * different worlds, tournaments, rivals, and reach different endings — a real choice, not a coat of paint.
 * Built from design tokens + a self-contained `.gs-choice*` style block (own prefix). Reads live `state`.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import { lorePortraitSVG } from '../render/loreArt';

export function storyChoiceScreen(): string {
  const who = state.story ? getCharacter(state.story.characterId)?.name ?? 'Champion' : 'Champion';
  const card = (
    align: 'warden' | 'herald',
    icon: string,
    title: string,
    sub: string,
    accent: string,
    points: string[],
  ): string => `
    <button class="gs-choice-card" style="--ac:${accent};" data-action='${JSON.stringify({ type: 'chooseAlignment', alignment: align })}'>
      <span class="gs-choice-icon" aria-hidden="true">${icon}</span>
      <span class="gs-choice-title">${title}</span>
      <span class="gs-choice-sub">${sub}</span>
      <ul class="gs-choice-points">${points.map((p) => `<li>${p}</li>`).join('')}</ul>
      <span class="gs-choice-cta">Choose this path ›</span>
    </button>`;

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">The Choice</h1>
      <p class="gs-hero-tag">Three Sigils won · the serpent stirs · now you decide who you are</p>
    </header>
    <section style="max-width:640px;margin:6px auto 0;">
      <div class="gs-choice-offer">
        <div class="gs-choice-portrait" aria-hidden="true">${lorePortraitSVG('voss')}</div>
        <div class="gs-choice-offertext">
          <div class="gs-choice-offername">Malachai "Sable" Voss · The Apostate</div>
          <p class="gs-choice-offerquote">"You've felt it too, ${who}. The whisper in the deep rough. You
            know the Game is a cage. Lay down your clubs with us — or pick them up again for a galaxy that
            will never once thank you. I've stood exactly where you're standing. Choose better than I did.
            Or the same. It ends the same."</p>
        </div>
      </div>
      <p class="gs-choice-lore">The Storm Sigil is yours, but the Coil has shown its face and the galaxy has
        cracked down the middle. The Prognostic Parrot digs his claws into your shoulder, wordless for once.
        The Apostate waits for your answer. Two roads. One golfer. <span style="color:var(--gs-ink);">Choose.</span></p>
      <div class="gs-choice-grid">
        ${card(
          'warden',
          '🛡',
          'Stay a Warden',
          'The light path — protect the galaxy, race the Coil, and try to save a friend from it.',
          '#54c8ff',
          [
            'Play the vigil worlds — hold the void, re-consecrate the shrines.',
            'Face Venoma again — and you may yet <b>win her back</b> from the Coil.',
            'Ending: <b>The Reseal</b> — the serpent bound, the universe saved clean.',
          ],
        )}
        ${card(
          'herald',
          '🐍',
          'Join the Coil',
          'The dark path — desecrate, take the serpent’s power, and crush the friends who stand in your way.',
          '#b060c0',
          [
            'Play the desecration worlds — drown the wards, harvest the dead.',
            'Your old allies become your rivals — <b>crush Driver Dan &amp; Penelope</b>.',
            'Ending: <b>The Long Rest</b> — the serpent freed, a victory that grieves.',
          ],
        )}
      </div>
      <p class="gs-choice-warn">This choice sets the rest of your campaign — it cannot be undone this run.</p>
    </section>
    <style>
      .gs-choice-offer{display:flex;gap:14px;align-items:center;background:linear-gradient(180deg,#161222,#0d0a16);
        border:1px solid #2e2440;border-left:3px solid #8fbfa0;border-radius:14px;padding:12px 14px;margin:2px 0 12px;}
      .gs-choice-portrait{flex:0 0 76px;width:76px;}
      .gs-choice-offername{font-size:12px;font-weight:800;letter-spacing:.02em;color:#a7d8bd;margin-bottom:4px;}
      .gs-choice-offerquote{font-size:13px;line-height:1.55;color:#cdd8ea;font-style:italic;margin:0;}
      @media(max-width:440px){.gs-choice-offer{flex-direction:column;text-align:center;}.gs-choice-portrait{width:88px;flex-basis:88px;}}
      .gs-choice-lore{font-size:14px;line-height:1.6;color:var(--gs-dim,#9fb0c8);text-align:center;margin:2px 0 14px;}
      .gs-choice-grid{display:grid;grid-template-columns:1fr;gap:12px;}
      @media(min-width:560px){.gs-choice-grid{grid-template-columns:1fr 1fr;}}
      .gs-choice-card{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;cursor:pointer;
        background:linear-gradient(180deg,#141926,#0e121b);border:1px solid #263049;border-top:3px solid var(--ac,#54c8ff);
        border-radius:16px;padding:16px 16px 14px;transition:transform .12s ease,box-shadow .12s ease;}
      .gs-choice-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px -10px var(--ac,#54c8ff);}
      .gs-choice-icon{font-size:34px;line-height:1;}
      .gs-choice-title{font-size:19px;font-weight:800;color:var(--gs-ink,#eaf1fb);}
      .gs-choice-sub{font-size:13px;color:var(--gs-dim,#9fb0c8);line-height:1.45;}
      .gs-choice-points{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;align-self:stretch;}
      .gs-choice-points li{font-size:12.5px;line-height:1.45;color:#cdd8ea;padding-left:16px;position:relative;}
      .gs-choice-points li::before{content:'▹';position:absolute;left:0;color:var(--ac,#54c8ff);}
      .gs-choice-cta{margin-top:10px;font-size:13px;font-weight:800;color:var(--ac,#54c8ff);align-self:center;}
      .gs-choice-warn{text-align:center;font-size:12px;color:#c9a06a;margin-top:14px;}
    </style>`;
}
