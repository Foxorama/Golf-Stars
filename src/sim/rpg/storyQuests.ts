/**
 * Story-Tour ALLY SIDE QUESTS (GS-story-quests) — a deep, faction-relevant personal quest for every
 * recruitable ally. Once you've recruited a friend AND the campaign has reached their chapter, they offer
 * you a quest in the Clubhouse (on their talk card, GS-story-allies): travel with them to the world that
 * MEANS something to them — Driver Dan's old long-haul rig (the derelict), Sandy's home dunes, the Mole's
 * deep mire — play it, and they hand you a UNIQUE club as thanks (a themed reward club, its own art + carry/
 * putt bonus). The quest is their story: why they left, what they lost, what they'll give to get it back.
 *
 * PURE + DOM-free, content-as-data — a new quest is a ROW, never an engine edit. The quest lifecycle lives
 * on `StoryState` (`activeQuestId` + `completedQuestIds`, save-versioned); this module is the table + the
 * pure transitions (offer → accept → play → complete-with-reward). Screens/round wiring live in app/ui.
 */

import { equipStoryClub, NAMED_STORY_CLUBS, type StoryState } from './story';
import { allyHomeWorld, allyName } from './storyAllies';
import { factionForCaddy, factionById } from './factions';
import { storyCaddyHired, caddiedWith } from './storyCaddies';

/** One ally's side quest (content-as-data). The reward is a themed reward-club id (`club:<set>:<type>`),
 *  resolved through the shared club machinery so it plays + looks like the Voyage reward it is. */
/** GS-story-betrayal-herald: the FIRST caddy quest you completed + whether you STILL wield its reward club
 *  — the personal thread the Herald Ch.4 betrayal beat pulls on ("you still swing Sandy's Second, the club
 *  she gave you when you were someone she could be proud of"). Undefined if you never finished an ally quest.
 *  NOTE: caddy quests are only offerable BEFORE The Choice (Ch.1–3, un-turned), so this can only ever be a
 *  caddy reachable by Ch.3 — Sandy (Vela Dunes, Ch.1) / Chipinski (Orion, Ch.2) / Sam (Cygnus, Ch.2) /
 *  Penelope (Coronae, Ch.3). It is NEVER Dan or Mole: their worlds (the derelict + the mire) chart only at
 *  Ch.4 (GS-story-gather-early — post-Choice), where recruiting is Warden-only and questing is off for a
 *  Herald, so a completed Dan/Mole quest is a Warden-path, post-Choice thing this hook never reads. */
export function heraldQuestHook(story: StoryState): { caddyName: string; clubName: string; stillUsing: boolean } | undefined {
  // The first CADDY quest completed — skip any `charquest:` markers that share `completedQuestIds`.
  const firstCaddyId = story.completedQuestIds.find((id) => STORY_QUESTS.some((x) => x.id === id));
  if (!firstCaddyId) return undefined;
  const q = STORY_QUESTS.find((x) => x.id === firstCaddyId);
  if (!q) return undefined;
  return {
    caddyName: allyName(q.caddyId),
    clubName: q.rewardName,
    stillUsing: story.equippedBagIds.includes(q.rewardClubId),
  };
}

export interface StoryQuest {
  id: string;
  /** The ally who gives it (their shop-item / roster id). */
  caddyId: string;
  /** The chapter the campaign must have reached for the quest to be offered. */
  minChapter: number;
  title: string;
  /** A one-line hook shown on the offer button + the active banner. */
  hook: string;
  /** The ally's pitch when you tap the quest offer (dialogue). */
  offer: readonly string[];
  /** What plays / what's said on the quest round's completion recap, then the reward. */
  complete: readonly string[];
  /** The reward club id (`club:<set>:<type>`) + a bespoke quest name for it. */
  rewardClubId: string;
  rewardName: string;
  rewardBlurb: string;
}

/**
 * The ally quests. Each sends you to that ally's HOME world (`STORY_CADDY_STOCK`, where you recruited them),
 * because that place is their story. Every recruitable caddy has one. Ordered by chapter so the earliest
 * available offer surfaces first.
 */
export const STORY_QUESTS: readonly StoryQuest[] = [
  {
    id: 'quest-dan',
    caddyId: 'driver-dan',
    minChapter: 3,
    title: "Dan's Last Haul",
    hook: 'Driver Dan wants to visit the derelict — his old rig.',
    offer: [
      '🎒 "Kid. That wreck the Coil calls the Ghost Wreck? …That was my rig. The Long Haul. Best girl I ever drove. ' +
        'I left her out there the night I heard the whisper and ran. Never went back."',
      '"I can’t face her alone. But with you on the bag… come out there with me. Let me say goodbye to the old ' +
        'girl properly. There’s something aboard I want you to have."',
    ],
    complete: [
      '🎒 "There she is. Rustier than I remember. …We hauled half this galaxy in that hold, the Long Haul and me."',
      '"Behind the seat, kid — reach in. That’s my old driver. Solar-forged, drove a ball clean across a ring ' +
        'system once. I want you swinging it now. Somebody oughta. Go save the universe with it."',
    ],
    rewardClubId: 'quest:dan',
    rewardName: NAMED_STORY_CLUBS['quest:dan']!.name,
    rewardBlurb: 'A solar-forged long-haul driver, drop-hitched from the wreck of the Long Haul. Enormous carry.',
  },
  {
    id: 'quest-sandy',
    caddyId: 'sandy-sandsaver',
    minChapter: 2,
    title: 'The Buried Lie',
    hook: 'Sandy wants to settle an old score in the Vela dunes.',
    offer: [
      '🎒 "There’s a lie out in the Vela dunes I’ve never gotten up-and-down from. Plugged, under a lip, ' +
        'facing the wrong way. Cost me a title, forty years back. It still keeps me up."',
      '"Come out there with me. Watch me play it — or play it yourself. Either way, I’m not leaving those ' +
        'dunes owing them anything. And when it’s done, the wedge is yours."',
    ],
    complete: [
      '🎒 "…Out. First try. Forty years, and it was OUT." (She laughs like a landslide.)',
      '"Take the wedge, champion. Sand-Saver’s Second — solar-forged, opens like a dream. From now on there’s ' +
        'no such thing as an unplayable lie. Sandy’s orders."',
    ],
    rewardClubId: 'quest:sandy',
    rewardName: NAMED_STORY_CLUBS['quest:sandy']!.name,
    rewardBlurb: 'The wedge that finally beat the buried lie. Escapes anything, from anywhere.',
  },
  {
    id: 'quest-chipinski',
    caddyId: 'dr-chipinski',
    minChapter: 2,
    title: 'The Forge Call-Out',
    hook: 'Dr Chipinski has a patient down at Orion Forge.',
    offer: [
      '🎒 "You rang? No — I rang. There’s a golfer collapsed at the Forge, third round of heat-stroke, and the ' +
        'Coil won’t stop play to help. Para-Spatial Medics don’t abandon a patient. Neither do I."',
      '"Fly me to Orion Forge. Play the round so the tour can’t cancel it, and I’ll work the sidelines. Save the ' +
        'game, I save the golfer. And I’ll fit you with a wedge that’ll never let a chip flatline."',
    ],
    complete: [
      '🎒 "Patient’s stable. Colour’s back. Ha — you rang, I answered, everybody lives. That’s the practice."',
      '"Here — the Phoenix Scalpel. Solar-forged, precise as a suture. Chip with it and the ball always finds ' +
        'a pulse near the pin. Doctor’s orders."',
    ],
    rewardClubId: 'quest:chipinski',
    rewardName: NAMED_STORY_CLUBS['quest:chipinski']!.name,
    rewardBlurb: 'A surgeon’s pitching wedge, solar-forged for precision. Every chip finds a pulse by the pin.',
  },
  {
    id: 'quest-penelope',
    caddyId: 'auto-caddie',
    minChapter: 3,
    title: 'The Stillest Green',
    hook: 'Penelope offers the Putters’ Guild trial on the crystal greens.',
    offer: [
      '🎒 "There is a green on Coronae Prism so true it shows you your own mind. The Guild calls it the trial of ' +
        'stillness. I have passed it once. I think you are ready to try."',
      '"Come. Read nothing. Force nothing. Let the crystal tell you the line, and hole out from wherever the ' +
        'world puts you. Pass, and the Guild’s own putter is yours — and so is my full trust."',
    ],
    complete: [
      '🎒 "You let go at the top of the stroke. I felt it from here. The green went quiet for you. That is the ' +
        'whole art, and you have it."',
      '"The Star-Reader — solar-true, weighted for surrender, not for effort. Every read it gives you is honest. ' +
        'Putt as if the ball has already stopped. It nearly has."',
    ],
    rewardClubId: 'quest:penelope',
    rewardName: NAMED_STORY_CLUBS['quest:penelope']!.name,
    rewardBlurb: 'The Putters’ Guild trial putter — solar-true, weighted for surrender. Reads run honest and long.',
  },
  {
    id: 'quest-sam',
    caddyId: 'suggestible-sam',
    minChapter: 2,
    title: "Sam's Own Read",
    hook: 'Suggestible Sam wants to trust his own call, just once.',
    offer: [
      '🎒 "So — you always tell ME the club, and I say yes, great, love it. But out on Cygnus Links, in that ' +
        'crosswind… I actually KNOW the read. I do! I’m just scared to say it out loud."',
      '"Take me back to the Links. This time I call the shots and I DON’T change my mind when you look at me. ' +
        'Help me trust myself once. If I manage it… I made you something. It’s good, I think. I THINK it’s good."',
    ],
    complete: [
      '🎒 "Three-wood. Low, into the wind, hold it left. …I called it. I CALLED IT and I didn’t take it back!"',
      '"This is Conviction — I forged it myself, on the Links, and I’m not asking if you like it. It’s ' +
        'solar-forged and it’s YOURS and it flies dead straight because for once I was sure. Take it. …You like it?"',
    ],
    rewardClubId: 'quest:sam',
    rewardName: NAMED_STORY_CLUBS['quest:sam']!.name,
    rewardBlurb: 'The wood Sam forged the day he finally trusted his own read. Flies dead straight.',
  },
  {
    id: 'quest-mole',
    caddyId: 'mystic-mole',
    minChapter: 4,
    title: 'The Deepest Green',
    hook: 'Mystic Mole will read a green no eye has ever seen.',
    offer: [
      '🎒 "Beneath the Hydra Mire is a green I have felt but never surfaced to play. The break there is older ' +
        'than the serpent. I have waited my whole life for a golfer who could hole out on it. blind, by feel."',
      '"Come down into the deep with me. I cannot see your line — I never could — but I will feel it for you. ' +
        'Trust the soil. Trust me. And what I dig up for you afterward, no surface-dweller has ever held."',
    ],
    complete: [
      '🎒 "You holed it. In the dark, by feel alone, you holed it. Even the serpent paused to listen."',
      '"From the deepest seam I dug this: the Dowser, a solar iron that hums toward the hole through any ground. ' +
        'It reads the break with its own bones. Now you carry a little of the deep with you, champion."',
    ],
    rewardClubId: 'quest:mole',
    rewardName: NAMED_STORY_CLUBS['quest:mole']!.name,
    rewardBlurb: 'A solar iron dowsed from beneath the mire — it hums toward the hole through any ground.',
  },
];

/** Every quest id (for the completed-set + tests). */
export const STORY_QUEST_IDS: readonly string[] = STORY_QUESTS.map((q) => q.id);

export function questById(id: string | undefined): StoryQuest | undefined {
  return id ? STORY_QUESTS.find((q) => q.id === id) : undefined;
}
/** The quest an ally gives (their own quest), or undefined. */
export function questForCaddy(caddyId: string): StoryQuest | undefined {
  return STORY_QUESTS.find((q) => q.caddyId === caddyId);
}
export function questDone(story: StoryState, questId: string): boolean {
  return story.completedQuestIds.includes(questId);
}
/** The currently ACTIVE quest (accepted, not yet completed), if any. */
export function activeQuest(story: StoryState): StoryQuest | undefined {
  return questById(story.activeQuestId);
}
/** The world a quest sends you to — the ally's home world (where you recruited them). */
export function questWorld(quest: StoryQuest): string | undefined {
  return allyHomeWorld(quest.caddyId);
}

/**
 * Is this ally's quest OFFERABLE right now? — the ally is recruited, the chapter has been reached, no quest
 * is currently active, and this one isn't already done. (A world is not required to be cleared: the ally
 * takes you there together as the quest itself.)
 */
export function questOfferable(story: StoryState, caddyId: string): boolean {
  const q = questForCaddy(caddyId);
  if (!q) return false;
  // GS-story-quality (GAP2): once you turn Herald you've betrayed the Wardens — their loyal personal
  // quests (Dan's last haul, Penelope's stillest green, …) are off the table on the dark path.
  if (story.alignment === 'herald') return false;
  if (!storyCaddyHired(story, caddyId)) return false;
  if (questDone(story, q.id)) return false;
  if (story.activeQuestId) return false; // one quest at a time
  if (story.chapter < q.minChapter) return false;
  // GS-story-caddy-rep: an ally opens up about their personal quest only after you've carried the bag with
  // them at least once — a lightweight REPUTATION gate, so a quest never unlocks the instant you recruit.
  if (!caddiedWith(story, caddyId)) return false;
  const world = questWorld(q);
  if (!world) return false;
  // GS-story-quest-beat: don't shove the quest at the player the instant they recruit the ally on that
  // ally's home world — wait a beat. The quest opens up only once they've cleared at least one OTHER world
  // (they've flown on and come back), so it never reads as "you just played this world — now play it again".
  if (!clearedElsewhere(story, world)) return false;
  return true;
}

/** Has the player cleared at least one world OTHER than `world`? (The quest "beat" signal.) */
function clearedElsewhere(story: StoryState, world: string): boolean {
  return story.clearedWorldIds.some((w) => w !== world);
}

/**
 * The ally is recruited + chapter-ready, but their quest is holding a BEAT — either you haven't carried the
 * bag with them yet (GS-story-caddy-rep) or you haven't played on elsewhere (GS-story-quest-beat).
 * Distinguishes the "wait a beat" state from "the chapter's too early" so the crew card can say the right
 * thing (put them on the bag for a round, then fly on).
 */
export function questBeatPending(story: StoryState, caddyId: string): boolean {
  const q = questForCaddy(caddyId);
  if (!q || !storyCaddyHired(story, caddyId) || questDone(story, q.id)) return false;
  if (story.activeQuestId) return false;
  if (story.chapter < q.minChapter) return false;
  if (!caddiedWith(story, caddyId)) return true; // recruited + ready, but not yet carried a round together
  const world = questWorld(q);
  return !!world && !clearedElsewhere(story, world);
}

/** Accept a quest (pure): make it the active quest. No-op if not offerable. */
export function acceptQuest(story: StoryState, questId: string): StoryState {
  const q = questById(questId);
  if (!q || !questOfferable(story, q.caddyId)) return story;
  return { ...story, activeQuestId: questId };
}

/**
 * Complete the active quest (pure): grant its reward club (owned + equipped into the bag via the shared
 * `equipStoryClub`), record it done, and clear the active slot. No-op if the id isn't the active quest.
 */
export function completeQuest(story: StoryState, questId: string): StoryState {
  const q = questById(questId);
  if (!q || story.activeQuestId !== questId || questDone(story, questId)) return story;
  const ownedClubIds = story.ownedClubIds.includes(q.rewardClubId)
    ? story.ownedClubIds
    : [...story.ownedClubIds, q.rewardClubId];
  const withClub = equipStoryClub({ ...story, ownedClubIds }, q.rewardClubId);
  return {
    ...withClub,
    activeQuestId: undefined,
    completedQuestIds: [...story.completedQuestIds, questId],
  };
}

/** The ally's faction name (for the quest card framing), or ''. */
export function questFactionName(quest: StoryQuest): string {
  const fid = factionForCaddy(quest.caddyId);
  return (fid && factionById(fid)?.name) || '';
}

/** The giving ally's display name. */
export function questGiverName(quest: StoryQuest): string {
  return allyName(quest.caddyId);
}
