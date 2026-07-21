/**
 * The LORE popup screen (GS-lore) — a one-off, full-bleed story beat shown on arrival at a stop (the
 * first is Driver Dan recognising the derelict wreck). A pure HTML-string builder: it reads the live
 * `state.pendingLoreId`, resolves the beat's presentation from the pure lore table, and paints a
 * cinematic banner + a bespoke portrait + the dialogue. The single CTA dispatches `dismissLore`, which
 * records the beat as seen and continues to the stop intro. Like every screen module (GS-app-split) it
 * reads `state` from ctx and dispatches through `data-action`; it re-implements no game logic.
 */

import { state, btn } from './ctx';
import { loreEventById, resolveLoreTokens, type LoreLine } from '../sim/rpg/lore';
import { lorePortraitSVG } from '../render/loreArt';
import { getCharacter } from '../sim/rpg/characters';
import { betrayerName } from '../sim/rpg/storyBetrayal';
import { golferPreviewSVG } from '../render/apparelArt';

const DEFAULT_ACCENT = '#ffd97a';

/** A spoken line reads as a bubble; a stage direction (a gesture, a sigh) reads as dim, centred italic.
 *  `resolve` fills the `{betrayer}` story token with the campaign's actual odd-one-out (GS-story-doubt). */
function loreLineHTML(l: LoreLine, resolve: (t: string) => string): string {
  return l.kind === 'action'
    ? `<div class="gs-lore__action">${resolve(l.text)}</div>`
    : `<div class="gs-lore__say">${resolve(l.text)}</div>`;
}

/** GS-story-doubt: a beat spoken by one of the PLAYABLE golfers carries a `golfer:<id>` portrait — drawn
 *  as their real figure (the cast is the portrait). Everything else resolves through `lorePortraitSVG`. */
function lorePortrait(portrait: string): string {
  if (portrait.startsWith('golfer:')) {
    const ch = getCharacter(portrait.slice('golfer:'.length));
    if (ch) {
      return golferPreviewSVG(undefined, undefined, undefined, {
        skin: ch.style.skin,
        shirtBase: ch.style.shirt,
        capColor: ch.style.cap,
        hair: ch.style.hair,
        uid: `lore${ch.id.replace(/[^a-z0-9]/gi, '')}`,
        w: 150,
        h: 300,
      });
    }
  }
  return lorePortraitSVG(portrait);
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
  // GS-story-doubt: the {betrayer} token names the campaign's ACTUAL odd-one-out (the betrayal arc's
  // single seam), so a beat always speaks about the right friend at the right point in time.
  const resolve = (t: string): string => resolveLoreTokens(t, state.story ? betrayerName(state.story) : undefined);
  const lines = event.lines.map((l) => loreLineHTML(l, resolve)).join('');
  return `
    <div class="gs-lore" style="--gs-lore-acc:${acc};">
      <div class="gs-lore__card">
        <div class="gs-lore__banner">
          ${event.kicker ? `<div class="gs-lore__kicker">${event.kicker}</div>` : ''}
          <h1 class="gs-lore__title">${event.title}</h1>
          <div class="gs-lore__speaker"><span class="gs-lore__dot" aria-hidden="true"></span>${event.speaker}</div>
        </div>
        <div class="gs-lore__stage">
          <div class="gs-lore__portrait">${lorePortrait(event.portrait)}</div>
          <div class="gs-lore__lines">${lines}</div>
        </div>
        <div class="gs-lore__cta">
          ${btn(event.cta ?? 'Continue →', { type: 'dismissLore' }, { variant: 'primary', block: true })}
        </div>
      </div>
    </div>`;
}
