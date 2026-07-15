/**
 * The LORE popup screen (GS-lore) — a one-off, full-bleed story beat shown on arrival at a stop (the
 * first is Driver Dan recognising the derelict wreck). A pure HTML-string builder: it reads the live
 * `state.pendingLoreId`, resolves the beat's presentation from the pure lore table, and paints a
 * cinematic banner + a bespoke portrait + the dialogue. The single CTA dispatches `dismissLore`, which
 * records the beat as seen and continues to the stop intro. Like every screen module (GS-app-split) it
 * reads `state` from ctx and dispatches through `data-action`; it re-implements no game logic.
 */

import { state, btn } from './ctx';
import { loreEventById, type LoreLine } from '../sim/rpg/lore';
import { lorePortraitSVG } from '../render/loreArt';

const DEFAULT_ACCENT = '#ffd97a';

/** A spoken line reads as a bubble; a stage direction (a gesture, a sigh) reads as dim, centred italic. */
function loreLineHTML(l: LoreLine): string {
  return l.kind === 'action'
    ? `<div class="gs-lore__action">${l.text}</div>`
    : `<div class="gs-lore__say">${l.text}</div>`;
}

/** Render the pending lore beat. Defensive fallback (a Continue button) if the id doesn't resolve, so a
 *  stale `pendingLoreId` can never blank the screen — dismiss just returns to the intro. */
export function loreScreen(): string {
  const event = loreEventById(state.pendingLoreId);
  if (!event) {
    return `<div style="min-height:60vh;display:flex;align-items:center;justify-content:center;padding:24px;">${btn(
      'Continue →',
      { type: 'dismissLore' },
      { variant: 'primary' },
    )}</div>`;
  }
  const acc = event.accent ?? DEFAULT_ACCENT;
  const lines = event.lines.map(loreLineHTML).join('');
  return `
    <div class="gs-lore" style="--gs-lore-acc:${acc};">
      <div class="gs-lore__card">
        <div class="gs-lore__banner">
          ${event.kicker ? `<div class="gs-lore__kicker">${event.kicker}</div>` : ''}
          <h1 class="gs-lore__title">${event.title}</h1>
          <div class="gs-lore__speaker"><span class="gs-lore__dot" aria-hidden="true"></span>${event.speaker}</div>
        </div>
        <div class="gs-lore__stage">
          <div class="gs-lore__portrait">${lorePortraitSVG(event.portrait)}</div>
          <div class="gs-lore__lines">${lines}</div>
        </div>
        <div class="gs-lore__cta">
          ${btn(event.cta ?? 'Continue →', { type: 'dismissLore' }, { variant: 'primary', block: true })}
        </div>
      </div>
    </div>`;
}
