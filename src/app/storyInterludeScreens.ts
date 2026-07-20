/**
 * The emotional MID-CHAPTER interlude screen (GS-story-midchapter) — the Sigil-less beat between the two
 * route majors. A full-bleed story scene: the friend's portrait, a title, the dialogue exchange (colour-
 * coded per speaker), and the outcome. Warden = a reunion (win a friend back); Herald = a betrayal (sever
 * one). Built from design tokens + a self-contained `.gs-inter*` style block (own prefix). Reads live
 * `state`; the outcome (mark-seen + credit consequence) is applied by the reducer on continue.
 */

import { state } from './ctx';
import { golferPreviewSVG } from '../render/apparelArt';
import { interludeBeat, interludeScene, interludeFriend, type InterludeSpeaker } from '../sim/rpg/storyInterlude';
import { corruptedLookOpts, COIL_FIGURE_TINT } from '../sim/rpg/storyBetrayal';

const SPEAKER: Record<InterludeSpeaker, { label: (friend: string, you: string) => string; col: string }> = {
  friend: { label: (f) => f, col: '#7fd8ff' },
  you: { label: (_f, y) => y, col: '#eaf1fb' },
  parrot: { label: () => '🦜 The Parrot', col: '#7fe0a0' },
  coil: { label: () => '🐍 The Coil', col: '#c98adf' },
};

export function storyInterludeScreen(): string {
  const story = state.story;
  if (!story || !story.alignment) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">Interlude</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyInterludeContinue' })}'>Continue ›</button>
      </div>`;
  }
  const beat = interludeBeat(story.alignment);
  const scene = interludeScene(story);
  const friend = interludeFriend(story);
  const you = 'You';
  // GS-story-betrayal-warden: on the Warden defection the betrayer's portrait is drawn in corrupted Coil
  // garb (shed-scale + venom tint); on the Herald severing the friend stays a clean Warden.
  const look = scene.corrupt
    ? { ...corruptedLookOpts(friend), uid: `inter${friend.id.replace(/[^a-z0-9]/gi, '')}`, w: 120, h: 210 }
    : { skin: friend.style.skin, shirtBase: friend.style.shirt, capColor: friend.style.cap, hair: friend.style.hair, uid: `inter${friend.id.replace(/[^a-z0-9]/gi, '')}`, w: 120, h: 210 };
  const portrait = golferPreviewSVG(undefined, undefined, undefined, look);
  const herald = story.alignment === 'herald';
  const accent = herald ? '#b060c0' : '#54c8ff';
  const dialogue = scene.lines
    .map((l) => {
      const sp = SPEAKER[l.who];
      const stage = l.who === 'you' && l.text.startsWith('(');
      return `<div class="gs-inter-line${stage ? ' gs-inter-line--stage' : ''}">
        ${stage ? '' : `<span class="gs-inter-who" style="color:${sp.col};">${sp.label(friend.name, you)}</span>`}
        <span class="gs-inter-say">${l.text}</span>
      </div>`;
    })
    .join('');

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">${beat.title}</h1>
      <p class="gs-hero-tag">${beat.kicker}</p>
    </header>
    <section class="gs-inter-wrap" style="--ac:${accent};">
      <div class="gs-inter-portrait" aria-hidden="true"${scene.corrupt ? ` style="filter:${COIL_FIGURE_TINT};"` : ''}>${portrait}</div>
      <div class="gs-inter-dialogue">${dialogue}</div>
    </section>
    <p class="gs-inter-outcome" style="--ac:${accent};">${scene.outcome}</p>
    <div style="max-width:420px;margin:16px auto 0;">
      <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyInterludeContinue' })}'>${herald ? 'Walk away ›' : 'To the shrine ›'}</button>
    </div>
    <style>
      .gs-inter-wrap{display:flex;gap:16px;max-width:600px;margin:6px auto 0;align-items:flex-start;}
      .gs-inter-portrait{flex:0 0 auto;width:120px;filter:drop-shadow(0 6px 16px #000a);}
      .gs-inter-portrait svg{width:100%;height:auto;}
      .gs-inter-dialogue{flex:1 1 auto;display:flex;flex-direction:column;gap:10px;min-width:0;}
      .gs-inter-line{background:linear-gradient(180deg,#141926,#0f131c);border:1px solid #263049;border-left:3px solid var(--ac,#54c8ff);
        border-radius:12px;padding:9px 12px;}
      .gs-inter-line--stage{background:none;border:none;padding:2px 4px;}
      .gs-inter-who{display:block;font-size:11px;font-weight:800;letter-spacing:.03em;margin-bottom:3px;}
      .gs-inter-say{font-size:13.5px;line-height:1.5;color:var(--gs-ink,#eaf1fb);}
      .gs-inter-line--stage .gs-inter-say{color:var(--gs-dim,#9fb0c8);font-style:italic;}
      .gs-inter-outcome{max-width:560px;margin:14px auto 0;text-align:center;font-size:13.5px;line-height:1.6;
        color:var(--gs-dim,#9fb0c8);font-style:italic;border-top:1px solid #232b3b;padding-top:12px;}
      @media(max-width:479px){.gs-inter-wrap{flex-direction:column;align-items:center;}.gs-inter-portrait{width:100px;}}
    </style>`;
}
