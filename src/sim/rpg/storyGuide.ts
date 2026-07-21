/**
 * The Story-Tour OBJECTIVE guide (GS-story-objective) — a pure helper that answers "what do I do now, and
 * why?" at any point in the campaign. Player feedback: after winning the World Tour you were dropped into
 * the spaceport with "nothing to go on — what do you need to do, what's involved?". This computes the
 * overarching GOAL, a live SIGIL progress count, and the single most useful NEXT step from the current
 * StoryState, so the clubhouse can always show a clear mission log.
 *
 * Pure + deterministic (no rng, no DOM) so it's unit-testable; composed from the existing progression
 * predicates (currentTournament / tournamentForChapter / worldsClearedInChapter / finaleUnlocked /
 * storyComplete). Content-as-data: the copy lives here, the screen just renders it.
 */

import {
  STORY_CHAPTER_COUNT,
  PROLOGUE_COURSE_ID,
  worldCleared,
  storyComplete,
  type StoryState,
} from './story';
import {
  currentTournament,
  tournamentForChapter,
  tournamentRival,
  chapterQualifiersMet,
} from './storyTournaments';
import { QUALIFY_EVENTS_NEEDED, qualifyTop } from './storyQualifiers';
import { finaleUnlocked } from './storyFinale';

export type StoryStage = 'prologue' | 'clear-worlds' | 'tournament' | 'finale' | 'complete';

export interface StoryObjective {
  /** The overarching mission — the whole point of the campaign, always shown. */
  goal: string;
  /** The single most useful thing to do right now. */
  next: string;
  /** A short verb label for the next-step action button (undefined ⇒ no button, the CTA is a banner). */
  actionLabel?: string;
  /** The action to dispatch for the next step (paired with actionLabel). */
  action?: { type: string };
  /** Sigils won / total, for a progress row. */
  sigils: number;
  total: number;
  stage: StoryStage;
}

/** Compute the current objective (goal + progress + the single next step) from the campaign state. */
export function storyObjective(story: StoryState): StoryObjective {
  const sigils = story.trophyIds.length;
  const total = STORY_CHAPTER_COUNT;
  // GS-story-quality: the overarching goal reads path-neutral ("reach", not "slay") — a Herald means to
  // FREE Jörmungandr, not kill it — and the completion line reflects which ending you brought about.
  const goal = 'Win 5 Galaxy Tournaments to forge the Green Key — then reach Jörmungandr at the root of Yggdrasil.';
  const base = { goal, sigils, total };

  if (storyComplete(story)) {
    return {
      ...base,
      stage: 'complete',
      next:
        story.alignment === 'herald'
          ? 'The Long Rest has fallen — every fairway still at last. Free-roam Star Tour is now unlocked from the title.'
          : // GS-story-unending-tease: the Reseal put the serpent to SLEEP — and the Coil fled with your
            // friend into the Universe Unending (the unknown deep a future voyage will open).
            'The serpent sleeps and the Universe is saved. Free-roam Star Tour is unlocked from the title — and somewhere past every chart, the Universe Unending holds a friend still worth saving.',
    };
  }
  // Prologue: you haven't won Earth yet (the recruitment hasn't happened).
  if (story.chapter <= 0 && !worldCleared(story, PROLOGUE_COURSE_ID)) {
    return {
      ...base,
      stage: 'prologue',
      next: 'Win the final round of the World Tour at St Andrews to prove yourself Earth’s champion.',
      actionLabel: '⛳ To the first tee',
      action: { type: 'storyPlayWorld', courseId: PROLOGUE_COURSE_ID } as { type: string },
    };
  }
  // All five Sigils forged the key — the finale is live.
  if (finaleUnlocked(story)) {
    return {
      ...base,
      stage: 'finale',
      next: 'All five Sigils are forged into the Green Key — engage Jörmungandr at the Dark Root (see the banner).',
    };
  }
  // A chapter tournament is ready to enter (enough worlds cleared).
  const ready = currentTournament(story);
  if (ready) {
    // GS-story-sigil-rivals: name the EFFECTIVE rival (the betrayal-arc friend on the back-half Sigils).
    const rival = tournamentRival(ready, story).name.split(' ')[0];
    return {
      ...base,
      stage: 'tournament',
      next: `${ready.name} is open — beat ${rival} to win ${ready.sigilName} (see the banner).`,
    };
  }
  // Otherwise: chart a course and clear more of this chapter's worlds to unlock its tournament.
  const t = tournamentForChapter(story.chapter, story.alignment);
  if (t) {
    // GS-story-qualifiers: the gate is two top-N qualifying-event finishes, not just clearing worlds.
    const done = chapterQualifiersMet(story, story.chapter);
    const need = Math.max(0, QUALIFY_EVENTS_NEEDED - done);
    const top = qualifyTop(story.chapter);
    const events = need === 1 ? 'event' : 'events';
    return {
      ...base,
      stage: 'clear-worlds',
      next:
        need > 0
          ? `Finish top ${top} in ${need} more qualifying ${events} on the star chart to earn a start in ${t.name}.`
          : `Enter ${t.name} — it's ready on the star chart.`,
      actionLabel: '🗺 Set course',
      action: { type: 'openStoryMap' } as { type: string },
    };
  }
  // Fallback (no tournament defined for this chapter): keep exploring + banking credits.
  return {
    ...base,
    stage: 'clear-worlds',
    next: 'Chart a course to a charted world, play it, and bank credits for your bag, gear, and ship.',
    actionLabel: '🗺 Set course',
    action: { type: 'openStoryMap' } as { type: string },
  };
}
