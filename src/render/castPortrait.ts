/**
 * The ONE place a story-cast id becomes a drawn PORTRAIT (GS-story-credits).
 *
 * The lore beat card has resolved `golfer:<id>` / `caddy:<id>` / a bare lore-portrait id into art since
 * GS-story-doubt, as a private helper inside `app/loreScreens.ts`. The credits roll is the second asker,
 * and two descriptions of "which picture is this character" is exactly the bug the one-description
 * register exists for — so the rule moved here and both callers read it.
 *
 * Token grammar:
 *   `golfer:<characterId>`  a playable golfer, drawn as their real figure (the cast IS the portrait)
 *   `caddy:<shopItemId>`    a recruitable Warden ally's roster bust
 *   `agent:<heraldAgentId>` a Coil inner-circle agent — resolved to the bust their OWN row names
 *   `<loreId>`              anything else, straight through to `lorePortraitSVG` (venoma / voss / crow / …)
 *
 * ⚠️ SVG ids are DOCUMENT-GLOBAL. `golferPreviewSVG` takes a `uid` prefix for exactly that reason, so
 * every caller passes its own — co-mounting two figures under one prefix would have them share defs.
 * The two hooded Coil agents deliberately share the `coilkeeper` bust (their `HeraldAgent` rows say so)
 * and are told apart by a CSS filter, so a roll showing both emits that bust's ids twice: harmless,
 * because the two copies are byte-identical art and resolve to the same defs either way — the same
 * reasoning `golferPreviewSVG`'s own uid fallback documents. The tint is a property of the AGENT ROW, so
 * `castPortraitTint` reads it there rather than letting a screen author it a second time.
 *
 * Pure string builders — no DOM, no rng.
 */

import { caddyPortraitSVG } from './caddyPortraits';
import { lorePortraitSVG } from './loreArt';
import { golferPreviewSVG } from './apparelArt';
import { getCharacter } from '../sim/rpg/characters';
import { heraldAgent } from '../sim/rpg/storyHeraldCrew';

export interface CastPortraitOpts {
  /** Unique id prefix for this SURFACE's figures — ids are document-global (see the header). */
  uidPrefix?: string;
  /** Drawn size of a `golfer:` figure. The bust portraits size themselves to their container. */
  w?: number;
  h?: number;
}

/** Resolve a cast portrait token to a full `<svg>`, or `''` when nothing is drawable. */
export function castPortraitSVG(token: string, opts: CastPortraitOpts = {}): string {
  if (!token) return '';
  if (token.startsWith('caddy:')) {
    const svg = caddyPortraitSVG(token.slice('caddy:'.length));
    if (svg) return svg;
  }
  if (token.startsWith('agent:')) {
    // A Coil agent's row already names the bust it wears — ask it, never map the id here again.
    const agent = heraldAgent(token.slice('agent:'.length));
    if (agent) return lorePortraitSVG(agent.portrait);
  }
  if (token.startsWith('golfer:')) {
    const ch = getCharacter(token.slice('golfer:'.length));
    if (ch) {
      return golferPreviewSVG(undefined, undefined, undefined, {
        skin: ch.style.skin,
        shirtBase: ch.style.shirt,
        capColor: ch.style.cap,
        hair: ch.style.hair,
        uid: `${opts.uidPrefix ?? 'cast'}${ch.id.replace(/[^a-z0-9]/gi, '')}`,
        w: opts.w ?? 150,
        h: opts.h ?? 300,
      });
    }
  }
  return lorePortraitSVG(token);
}

/**
 * The CSS filter this portrait is drawn under, or `''`. Only the two hooded Coil agents carry one — it
 * is what tells Ouros and Ecdysis apart while they share a bust, and it lives on their `HeraldAgent` row.
 */
export function castPortraitTint(token: string): string {
  if (!token.startsWith('agent:')) return '';
  return heraldAgent(token.slice('agent:'.length))?.tint ?? '';
}
