/**
 * Story-Tour CADDY-QUEST MID-ROUND BEAT (GS-story-caddy-quest-dialogue) — the "discussion DURING the quest".
 *
 * A caddy quest used to be a pitch (the offer) and a payoff (the completion recap) with a silent 9-hole round
 * in between. This adds the missing middle: at the TURN of a quest round, the ally speaks a short cinematic
 * beat (their `StoryQuest.duringQuest` lines), rendered on the shared `.gs-lore*` beat card. It is:
 *   • QUEST-ONLY — assembled solely from `Run.storyQuest`, so it can only ever fire on the ally's own quest
 *     round, NEVER a Galaxy Tournament / Sigil / any main-story event (those are `storyTournament`, not
 *     `storyQuest`). No overlap with the pre-Choice mid-round OMEN (`storyMidround.ts`, tournament-gated).
 *   • A SINGLE dismissible pause — one beat, one tap to play on. It never chains follow-ups, so it can't
 *     flood the player, and the player is always the one who chose to fly out and play the quest.
 *   • INTERACTIVE-ONLY + zero rng — it diverts the SCREEN between two holes; the headless auto sim resolves
 *     the whole round without it, so auto ≡ interactive and every seeded test is untouched.
 *
 * PURE + DOM-free (the reducer decides WHEN, the render layer paints it). Content-as-data — a caddy gets a
 * mid-round beat simply by carrying `duringQuest` lines on its quest row; absent ⇒ no pause (byte-identical).
 */

import { questById } from './storyQuests';
import { allyName } from './storyAllies';
import type { LoreLine } from './lore';
import type { Run } from './run';

/** The assembled mid-round beat — a `BeatView`-shaped payload the shared `loreBeatHTML` card renders. */
export interface QuestBeat {
  questId: string;
  caddyId: string;
  accent: string;
  kicker: string;
  title: string;
  /** `caddy:<id>` — the render layer draws the ally's roster bust. */
  portrait: string;
  speaker: string;
  lines: readonly LoreLine[];
  cta: string;
}

/**
 * The hole index (0-based `nextIdx` in the reducer's `holeComplete`) at whose boundary the mid-round beat
 * fires — the "turn" of the quest round. Roughly the middle: a 9-hole quest pauses after the 5th hole.
 */
export function questBeatTurnIndex(totalHoles: number): number {
  return Math.max(1, Math.ceil(totalHoles / 2));
}

/**
 * The mid-round beat for the active quest round, or undefined when none applies (pure). Reads ONLY the run's
 * `storyQuest`, so a non-quest round (a tournament, a plain world clear, Voyage/Unending) never produces one.
 * Undefined too if the quest has no authored `duringQuest` lines.
 */
export function questBeatFor(run: Run | undefined): QuestBeat | undefined {
  if (!run?.storyQuest) return undefined;
  const q = questById(run.storyQuest);
  if (!q || !q.duringQuest || q.duringQuest.length === 0) return undefined;
  const herald = q.alignment === 'herald';
  return {
    questId: q.id,
    caddyId: q.caddyId,
    accent: herald ? '#c98adf' : '#e6b45a',
    kicker: 'At the turn',
    title: q.title,
    portrait: `caddy:${q.caddyId}`,
    speaker: allyName(q.caddyId),
    lines: q.duringQuest,
    cta: 'Play on →',
  };
}
