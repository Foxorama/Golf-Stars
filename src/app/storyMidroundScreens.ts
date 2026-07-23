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
import type { LoreLine } from '../sim/rpg/lore';

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

/**
 * GS-story-caddy-quest-dialogue: the CADDY-QUEST mid-round beat screen — the ally speaking at the turn of
 * THEIR quest round. Reuses the same shared `.gs-lore*` beat card, so it reads identically to every other
 * story beat and forks no CSS. Reads `state.pendingQuestBeat` (the assembled beat with the caddy's portrait +
 * `duringQuest` lines); its single CTA dispatches `storyQuestBeatContinue` (tee up the next hole, play on).
 */
export function storyQuestBeatScreen(): string {
  const beat = state.pendingQuestBeat;
  if (!beat) {
    return `<div style="min-height:60vh;display:flex;align-items:center;justify-content:center;padding:24px;">${btn(
      'Play on →',
      { type: 'storyQuestBeatContinue' },
      { variant: 'primary' },
    )}</div>`;
  }
  const lines: readonly LoreLine[] = beat.lines;
  return loreBeatHTML(
    { accent: beat.accent, kicker: beat.kicker, title: beat.title, speaker: beat.speaker, portrait: beat.portrait, lines, cta: beat.cta },
    (t) => t,
    { type: 'storyQuestBeatContinue' },
  );
}
