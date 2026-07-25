/**
 * Story-Tour STAR-MAP NAVIGATION status (GS-story-map-nav) — the pure model behind "what is THIS world, on
 * the star chart, right now?". Player feedback: the campaign's three between-round pulls — ally SIDE QUESTS,
 * chapter QUALIFYING EVENTS, and the Sigil TOURNAMENT — were all funnelled through the spaceport clubhouse
 * (a banner, an ally card), so you couldn't tell from the star map which world hosted a quest, which were
 * qualifiers, or where the Sigil major was; the chart was "unclear and confusing, you can't find anything".
 *
 * This composes the existing progression predicates (`storyQuests`/`storyQualifiers`/`storyTournaments`)
 * into ONE per-world status the star map reads — to STAMP a marker on the world glyph AND to fill the
 * world's dossier — so quests / qualifiers / Sigils are identifiable and actionable straight from the chart.
 *
 * PURE + DOM-free (no window, no rng) so it's unit-testable; nothing in the sim imports it (it's a leaf the
 * app/tests read), so there is no cycle. Content lives in the underlying tables; this is just the read.
 */

import {
  storyWorldById,
  type StoryState,
} from './story';
import {
  questWorld,
  activeQuest,
  questOfferable,
  questBeatPendingReason,
  questGiverName,
  questRewardEffectLabel,
  STORY_QUESTS,
  type StoryQuest,
} from './storyQuests';
import {
  eventQualified,
  qualifyTop,
  qualifierFieldSize,
  QUALIFY_EVENTS_NEEDED,
  QUALIFIER_HOLES,
} from './storyQualifiers';
import { qualifierPlan, qualifierFormatName, qualifierFormatBlurb } from './storyQualifierFormats';
import { getCharacter } from './characters';
import {
  isLiveStoryQualifier,
  tournamentForChapter,
  tournamentWon,
  currentTournament,
  chapterQualifiersMet,
  type StoryTournament,
} from './storyTournaments';

/** The quest that plays on a world, and where the player is with it. */
export interface StoryQuestNav {
  questId: string;
  title: string;
  hook: string;
  /** The giving ally's first name (for the marker/dossier). */
  giver: string;
  rewardName: string;
  /** The reward's "why you want it" line, if any. */
  rewardEffect?: string;
  /** `offerable` = accept & fly now; `active` = accepted, come play it; `pending` = the ally has it but is
   *  holding a beat (carry their bag a round / fly on elsewhere first — a hint, not yet a call to action). */
  state: 'offerable' | 'active' | 'pending';
}

/** A world that is a QUALIFYING EVENT for the player's path this chapter. */
export interface StoryQualifierNav {
  chapter: number;
  /** Finish top-N to qualify. */
  top: number;
  /** The event field size (you + ghosts). */
  field: number;
  /** Best finish already banked clears the top-N bar. */
  qualified: boolean;
  /** The best finishing PLACE recorded here, if the player has played it. */
  place?: number;
  /** GS-story-qualifier-formats: how many holes this event runs (nine). */
  holes: number;
  /** The FORMAT this event is drawn as, named for the dossier, plus how it's won. Shown BEFORE you fly, so
   *  picking which two of the chapter's three events to play is a real choice — of golf, and of company. */
  formatName: string;
  formatBlurb: string;
  /** The tour-mate you'd be drawn with, on a paired format (their short name + id). */
  partnerId?: string;
  partnerName?: string;
  /** Matchplay events qualify on a WIN or a halve, not a placing — the dossier says so instead of "top N". */
  matchplay: boolean;
}

/** A world that is a chapter's Sigil TOURNAMENT venue. */
export interface StoryVenueNav {
  tournament: StoryTournament;
  /** This is the player's CURRENT chapter's Sigil (unwon) — the live objective. */
  current: boolean;
  /** Unlocked to enter RIGHT NOW (the qualifier gate is met) — fly here and tee off the major. */
  ready: boolean;
  /** The Sigil has already been taken (a won venue, before the chapter advances). */
  won: boolean;
  /** Qualifying events cleared / needed (for the "qualify in N more" note when not yet ready). */
  qualifiersMet: number;
  needed: number;
}

/** The full star-map status for one story world — any/all of a quest, a qualifier, a Sigil venue. */
export interface StoryWorldNav {
  courseId: string;
  quest?: StoryQuestNav;
  qualifier?: StoryQualifierNav;
  venue?: StoryVenueNav;
}

/** GS-story-map-nav: the quest status for a world (path-matched) — active here / offerable here / an ally
 *  holding a beat here — or undefined if no quest concerns this world for the player right now. */
function questNavForWorld(story: StoryState, courseId: string): StoryQuestNav | undefined {
  const build = (q: StoryQuest, s: StoryQuestNav['state']): StoryQuestNav => ({
    questId: q.id,
    title: q.title,
    hook: q.hook,
    giver: questGiverName(q).split(' ')[0] ?? questGiverName(q),
    rewardName: q.rewardName,
    rewardEffect: questRewardEffectLabel(q),
    state: s,
  });
  const active = activeQuest(story);
  if (active && questWorld(active) === courseId) return build(active, 'active');
  for (const q of STORY_QUESTS) {
    if (questWorld(q) !== courseId) continue;
    if (questOfferable(story, q.caddyId)) return build(q, 'offerable');
    // GS-story-quest-soon-marker: only the LAST beat ("fly on elsewhere and they'll open up") reaches the
    // chart. A friend you've merely hired — never had on the bag — has nothing to show you yet, so their
    // home world stays a plain destination instead of lighting up 🎒 SOON the moment you recruit them.
    if (questBeatPendingReason(story, q.caddyId) === 'elsewhere') return build(q, 'pending');
  }
  return undefined;
}

/** GS-story-map-nav: the qualifier status for a world — only for the player's CURRENT chapter's qualifiers
 *  (the live objective), so the chart stays focused on what to do now. Undefined otherwise. */
function qualifierNavForWorld(story: StoryState, courseId: string, chosenPartnerId?: string): StoryQualifierNav | undefined {
  const w = storyWorldById(courseId);
  if (!w || w.unlockChapter !== story.chapter) return undefined;
  if (!isLiveStoryQualifier(story, courseId)) return undefined;
  const res = story.qualifierResults[courseId];
  const plan = qualifierPlan(story, courseId, chosenPartnerId);
  const partnerName = plan?.partnerId ? getCharacter(plan.partnerId)?.shortName : undefined;
  return {
    chapter: w.unlockChapter,
    top: qualifyTop(w.unlockChapter),
    field: qualifierFieldSize(w.unlockChapter),
    qualified: eventQualified(story, courseId),
    place: res?.place,
    holes: plan?.holes ?? QUALIFIER_HOLES,
    formatName: plan ? qualifierFormatName(plan) : 'Singles stroke play',
    formatBlurb: plan ? qualifierFormatBlurb(plan) : '',
    ...(plan?.partnerId ? { partnerId: plan.partnerId } : {}),
    ...(partnerName ? { partnerName } : {}),
    matchplay: plan?.format === 'pair-match',
  };
}

/** GS-story-map-nav: the Sigil-venue status for a world — only for the player's CURRENT chapter's venue,
 *  so the chart headlines the live major (a past-chapter won venue drops off as the chapter advances). */
function venueNavForWorld(story: StoryState, courseId: string): StoryVenueNav | undefined {
  const w = storyWorldById(courseId);
  if (!w || w.unlockChapter !== story.chapter) return undefined;
  const t = tournamentForChapter(w.unlockChapter, story.alignment);
  if (!t || t.venueId !== courseId) return undefined;
  const won = tournamentWon(story, t);
  const ready = currentTournament(story)?.venueId === courseId;
  return {
    tournament: t,
    current: !won,
    ready,
    won,
    qualifiersMet: chapterQualifiersMet(story, w.unlockChapter),
    needed: QUALIFY_EVENTS_NEEDED,
  };
}

/** The whole star-map status for a world — quest + qualifier + venue, whichever apply. */
export function storyWorldNav(story: StoryState, courseId: string, chosenPartnerId?: string): StoryWorldNav {
  return {
    courseId,
    quest: questNavForWorld(story, courseId),
    // GS-story-qualifier-partner-pick: the dossier passes the tour-mate the player has picked for this
    // event so the preview names who you'd ACTUALLY be teeing off beside, not the draw's suggestion.
    qualifier: qualifierNavForWorld(story, courseId, chosenPartnerId),
    venue: venueNavForWorld(story, courseId),
  };
}

/** The single, primary MAP MARKER for a world's glyph (the top pill): the Sigil venue outranks a quest,
 *  which outranks a qualifier — so the most important call-to-action is what shows. Undefined ⇒ no pill. */
export type StoryWorldMarker =
  | 'venue-ready'
  | 'venue-locked'
  | 'venue-won'
  | 'quest'
  | 'quest-active'
  | 'quest-pending'
  | 'qualifier'
  | 'qualified';

export function storyWorldMarker(nav: StoryWorldNav): StoryWorldMarker | undefined {
  if (nav.venue) return nav.venue.won ? 'venue-won' : nav.venue.ready ? 'venue-ready' : 'venue-locked';
  // An ACTIONABLE quest (accept now / go play) outranks the qualifier flag; a PENDING one is only a hint,
  // so it never covers the live objective (GS-story-quest-soon-marker — the 🎒 SOON pill was hiding the
  // 🏁 QUALIFIER banner on a world you actually have to go and qualify at).
  if (nav.quest && nav.quest.state !== 'pending') return nav.quest.state === 'active' ? 'quest-active' : 'quest';
  if (nav.qualifier) return nav.qualifier.qualified ? 'qualified' : 'qualifier';
  if (nav.quest) return 'quest-pending';
  return undefined;
}
