/**
 * The MID-ROUND OMEN screen (GS-story-midround-omen) — the pre-Choice betrayal foreshadow shown at the
 * nine-hole pause of the Chapter-3 major, BEFORE the halftime rival pop. It reuses the shared `.gs-lore*`
 * cinematic beat card (`loreBeatHTML`), so it reads identically to every other story beat and forks no CSS.
 * Pure HTML-string builder: reads `state.pendingMidBeat` (the assembled omen), paints the future betrayer's
 * own figure + voice, and its single CTA dispatches `storyMidBeatContinue` (mark seen → flow into the pop).
 */

import { state, btn } from './ctx';
import { loreBeatHTML } from './loreScreens';
import { getCharacter } from '../sim/rpg/characters';

/** Render the pending mid-round omen. Defensive fallback (a bare Continue) if it's missing, so a stale
 *  state can never blank the screen — continue just flows on to the halftime pop. */
export function storyMidBeatScreen(): string {
  const omen = state.pendingMidBeat;
  if (!omen) {
    return `<div style="min-height:60vh;display:flex;align-items:center;justify-content:center;padding:24px;">${btn(
      'Play on →',
      { type: 'storyMidBeatContinue' },
      { variant: 'primary' },
    )}</div>`;
  }
  const speaker = getCharacter(omen.charId)?.shortName ?? 'Your friend';
  // The omen lines are already the friend's own words — no story tokens to resolve here (unlike the
  // arrival lore's {betrayer}), so the resolver is the identity.
  return loreBeatHTML(
    { accent: omen.accent, kicker: omen.kicker, title: omen.title, speaker, portrait: omen.portrait, lines: omen.lines, cta: omen.cta },
    (t) => t,
    { type: 'storyMidBeatContinue' },
  );
}
