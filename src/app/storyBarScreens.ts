/**
 * The Parrot Bar screen (GS-story-parrot-bar) — "The Crow's Nest", reached from the spaceport clubhouse
 * ("🍺 The Crow's Nest"). A cosmetic Story-Tour hangout: the Prognostic Parrot tends bar and you TAP him
 * (or the "Another, captain" button) to cycle his rotating chatter, which adapts to the campaign (chapter /
 * chosen path / Sigils won / whether the finale's beaten). Pure render off the live `state` + a transient
 * tap counter (`storyBarTalk`) — no sim rng, no save write. Self-contained `.gs-pbar*` style block (own
 * prefix — no global CSS collision, per CLAUDE.md).
 */

import { state } from './ctx';
import { parrotBarLineAt, parrotBarLines, type ParrotBarContext } from '../sim/rpg/parrotBar';
import { parrotBarSceneSVG } from '../render/parrotBarArt';

/** Build the pure chatter context off the live campaign. */
function barContext(): ParrotBarContext {
  const s = state.story!;
  return {
    chapter: s.chapter,
    alignment: s.alignment,
    sigils: s.trophyIds.length,
    completed: s.completed === true,
  };
}

export function storyBarScreen(): string {
  const story = state.story;
  if (!story) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🍺 The Crow's Nest</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryBar' })}'>‹ Back</button>
      </div>`;
  }

  const ctx = barContext();
  const talk = state.storyBarTalk ?? 0;
  const line = parrotBarLineAt(ctx, talk);
  const total = parrotBarLines(ctx).length;
  const idx = ((talk % total) + total) % total;

  const nextAttr = JSON.stringify({ type: 'parrotBarNext' });
  const exitAttr = JSON.stringify({ type: 'exitStoryBar' });

  return `
    <style>
      /* keep the long name on one line on narrow phones (the shared 34px title clips otherwise) */
      .gs-hero--pbar .gs-hero-title { font-size: clamp(22px, 6.4vw, 34px); }
      .gs-pbar { max-width: 720px; margin: 0 auto; padding: 4px 12px 20px; }
      .gs-pbar__scene {
        position: relative; border-radius: 16px; overflow: hidden;
        border: 1px solid #3a2a1a; background: #0f0a07; cursor: pointer;
        box-shadow: 0 8px 30px rgba(0,0,0,0.45), inset 0 0 60px rgba(0,0,0,0.4);
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .gs-pbar__scene:hover { transform: translateY(-1px); box-shadow: 0 12px 38px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.35); }
      .gs-pbar__scene:active { transform: translateY(1px); }
      .gs-pbar__taphint {
        position: absolute; right: 12px; bottom: 10px; z-index: 2;
        font-size: 12px; color: #d6ffe6; background: rgba(13,21,18,0.72);
        border: 1px solid #274a38; border-radius: 999px; padding: 4px 12px;
        pointer-events: none; letter-spacing: 0.02em;
      }
      .gs-pbar__bubble {
        position: relative; margin: 16px auto 0; max-width: 560px;
        background: linear-gradient(180deg, #17211c, #10160f);
        border: 1px solid #274a38; border-radius: 14px; padding: 16px 18px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.4);
      }
      .gs-pbar__bubble::before {
        content: ''; position: absolute; top: -9px; left: 40px;
        border-left: 9px solid transparent; border-right: 9px solid transparent;
        border-bottom: 9px solid #274a38;
      }
      .gs-pbar__who { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #7fe0a0; letter-spacing: 0.02em; }
      .gs-pbar__say { margin: 0; color: #e8e2d2; font-size: 16px; line-height: 1.5; font-style: italic; }
      .gs-pbar__dots { display: flex; gap: 5px; justify-content: center; margin: 14px 0 2px; }
      .gs-pbar__dot { width: 6px; height: 6px; border-radius: 50%; background: #35422f; }
      .gs-pbar__dot--on { background: #7fe0a0; box-shadow: 0 0 6px rgba(127,224,160,0.6); }
      .gs-pbar__actions { display: flex; gap: 10px; max-width: 560px; margin: 16px auto 0; }
      .gs-pbar__actions .gs-btn { flex: 1; }
    </style>

    <header class="gs-hero gs-storyhub gs-hero--pbar">
      <h1 class="gs-hero-title">🍺 The Crow's Nest</h1>
      <p class="gs-hero-tag">The Prognostic Parrot's bar · Chapter ${story.chapter}</p>
    </header>

    <div class="gs-pbar">
      <div class="gs-pbar__scene" role="button" tabindex="0" data-action='${nextAttr}' aria-label="Tap the Parrot for another line">
        ${parrotBarSceneSVG()}
        <span class="gs-pbar__taphint">🦜 tap the captain</span>
      </div>

      <div class="gs-pbar__bubble">
        <p class="gs-pbar__who">🦜 The Prognostic Parrot</p>
        <p class="gs-pbar__say">${line.text}</p>
      </div>

      <div class="gs-pbar__dots" aria-hidden="true">
        ${Array.from({ length: total }, (_, i) => `<span class="gs-pbar__dot${i === idx ? ' gs-pbar__dot--on' : ''}"></span>`).join('')}
      </div>

      <div class="gs-pbar__actions">
        <button class="gs-btn gs-btn--ghost" data-action='${exitAttr}'>‹ Leave the bar</button>
        <button class="gs-btn" data-action='${nextAttr}'>Another, captain ›</button>
      </div>
    </div>`;
}
