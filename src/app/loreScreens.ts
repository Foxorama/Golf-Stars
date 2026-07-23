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
import { caddyPortraitSVG } from '../render/caddyPortraits';
import { getCharacter } from '../sim/rpg/characters';
import { betrayerName } from '../sim/rpg/storyBetrayal';
import { golferPreviewSVG } from '../render/apparelArt';
import type { Action } from '../ui/game';

const DEFAULT_ACCENT = '#ffd97a';

/** A presentation-only view of a story beat (a `LoreEvent`-shaped payload) — shared by the arrival lore
 *  screen and any dynamic beat (e.g. the mid-round omen) that reuses the `.gs-lore*` cinematic card. */
export interface BeatView {
  accent?: string;
  kicker?: string;
  title: string;
  speaker: string;
  portrait: string;
  lines: readonly LoreLine[];
  cta?: string;
}

/**
 * Build the shared cinematic beat CARD (GS-lore) — banner + bespoke portrait + dialogue + one CTA. Reused
 * so every story beat (arrival lore AND the mid-round omen) reads identically and shares the `.gs-lore*` CSS
 * (never forks a second prefix). `resolve` fills story tokens; `dismiss` is the CTA's action.
 */
export function loreBeatHTML(view: BeatView, resolve: (t: string) => string, dismiss: Action): string {
  const acc = view.accent ?? DEFAULT_ACCENT;
  const lines = view.lines.map((l) => loreLineHTML(l, resolve)).join('');
  return `
    <div class="gs-lore" style="--gs-lore-acc:${acc};">
      <div class="gs-lore__card">
        <div class="gs-lore__banner">
          ${view.kicker ? `<div class="gs-lore__kicker">${view.kicker}</div>` : ''}
          <h1 class="gs-lore__title">${view.title}</h1>
          <div class="gs-lore__speaker"><span class="gs-lore__dot" aria-hidden="true"></span>${view.speaker}</div>
        </div>
        <div class="gs-lore__stage">
          <div class="gs-lore__portrait">${lorePortrait(view.portrait)}</div>
          <div class="gs-lore__lines">${lines}</div>
        </div>
        <div class="gs-lore__cta">
          ${btn(view.cta ?? 'Continue →', dismiss, { variant: 'primary', block: true })}
        </div>
      </div>
    </div>`;
}

/** A spoken line reads as a bubble; a stage direction (a gesture, a sigh) reads as dim, centred italic.
 *  `resolve` fills the `{betrayer}` story token with the campaign's actual odd-one-out (GS-story-doubt). */
function loreLineHTML(l: LoreLine, resolve: (t: string) => string): string {
  return l.kind === 'action'
    ? `<div class="gs-lore__action">${resolve(l.text)}</div>`
    : `<div class="gs-lore__say">${resolve(l.text)}</div>`;
}

/** GS-story-doubt: a beat spoken by one of the PLAYABLE golfers carries a `golfer:<id>` portrait — drawn
 *  as their real figure (the cast is the portrait). GS-story-caddy-quest-dialogue: a `caddy:<id>` portrait
 *  draws the ally's roster bust (the caddy-quest mid-round beat). Everything else resolves through
 *  `lorePortraitSVG`. */
function lorePortrait(portrait: string): string {
  if (portrait.startsWith('caddy:')) {
    const svg = caddyPortraitSVG(portrait.slice('caddy:'.length));
    if (svg) return svg;
  }
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
  // GS-story-doubt: the {betrayer} token names the campaign's ACTUAL odd-one-out (the betrayal arc's
  // single seam), so a beat always speaks about the right friend at the right point in time.
  const resolve = (t: string): string => resolveLoreTokens(t, state.story ? betrayerName(state.story) : undefined);
  return loreBeatHTML(event, resolve, { type: 'dismissLore' });
}
