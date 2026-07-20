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

import { equipStoryClub, NAMED_STORY_CLUBS, type StoryState, type StoryAlignment } from './story';
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
  // The first WARDEN caddy quest completed — skip `charquest:` markers AND the Coil (`alignment:'herald'`)
  // quests (GS-story-herald-quests) that also live in `completedQuestIds`: the Severing beat is about a
  // friend you BETRAYED, so it only ever reads a Warden ally's quest, never a Coil inner-circle one.
  const firstCaddyId = story.completedQuestIds.find((id) =>
    STORY_QUESTS.some((x) => x.id === id && x.alignment !== 'herald'),
  );
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
  /** GS-story-herald-quests: which PATH this quest belongs to. Absent = a WARDEN caddy quest (offerable on
   *  the light/undecided path only — the existing six). `'herald'` = a COIL inner-circle quest (offerable on
   *  the dark path only). `questOfferable` matches this against `story.alignment`. */
  alignment?: StoryAlignment;
  /** GS-story-herald-quests: the world this quest plays on. Absent = the ally's recruit home world
   *  (`allyHomeWorld`, the Warden pattern). Set explicitly for a Coil quest — the Coil volunteers have no
   *  recruit world, so their quest names its own thematic Herald world. */
  world?: string;
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
  // ── The Coil inner circle (GS-story-herald-quests) — the Herald path's caddy quests. The Coil volunteers
  // have no recruit world, so each names its own thematic Herald world; offerable ONLY on the dark path, and
  // (like every caddy quest) only after you've carried the bag with them a round (GS-story-caddy-rep). ──
  {
    id: 'quest-coil-voss',
    caddyId: 'coil-voss',
    alignment: 'herald',
    world: 'void2-18', // the Sagittarius Core abyss — where the Apostate first heard the whisper
    minChapter: 4,
    title: "The Apostate's Confession",
    hook: 'Sable Voss will take you to the black mouth where he first heard the whisper.',
    offer: [
      '🖤 "Come to the edge of the Core with me, champion. To the black mouth where I first heard it — the ' +
        'whisper under the world. I have shown that place to no living soul."',
      '"Play the abyss at my side. Not to conquer it — to LISTEN. When you understand what I understood out ' +
        'there, I will put my own driver in your hands. The one I carried down when I fell."',
    ],
    complete: [
      '🖤 "There. You heard it too — I watched your hands go still on the club. That quiet is the truth the ' +
        'Wardens spend their whole lives shouting over."',
      '"Take my driver. Sable-black, solar-forged, and it does not care where the ball lies — no lie is ' +
        'unplayable to one who has stopped fearing the rest. Swing it, and swing it certain."',
    ],
    rewardClubId: 'quest:voss',
    rewardName: NAMED_STORY_CLUBS['quest:voss']!.name,
    rewardBlurb: "The Apostate's own black driver, carried down the day he fell. Hits from any lie, enormous carry.",
  },
  {
    id: 'quest-coil-venoma',
    caddyId: 'coil-venoma',
    alignment: 'herald',
    world: 'swamp-18', // the Hydra Mire acid shrine — where the Coil raised the Viper
    minChapter: 4,
    title: "The Viper's Nest",
    hook: 'Venoma will take you down into the Mire that made her.',
    offer: [
      '🐍 "You want to really know me? Come down into the Mire — the acid shrine, where the Coil raised me ' +
        'and I shed the girl I used to be. I have never taken a partner there."',
      '"Play the serpent\'s own green at my side. Beat it, and I will forge you a blade from the fang I keep. ' +
        'On this bag I never miss — let me make sure you never do either."',
    ],
    complete: [
      '🐍 "Ha — you played the Mire like you were born in the mud. Maybe you were, and never knew. The old me ' +
        'would have hated you for it. I think she would be jealous."',
      '"The Viper\'s Fang — solar-forged, weighted to strike dead straight, and it bends the wind to its line. ' +
        'It does not waver. Neither do we, you and I. Not any more."',
    ],
    rewardClubId: 'quest:venoma',
    rewardName: NAMED_STORY_CLUBS['quest:venoma']!.name,
    rewardBlurb: 'A blade forged from the Viper\'s own fang — solar-true, flies dead straight and cuts the wind.',
  },
  {
    id: 'quest-coil-ouros',
    caddyId: 'coil-ouros',
    alignment: 'herald',
    world: 'cetus-18', // the Cetus Shelf deep — where the Whisperer listens back
    minChapter: 4,
    title: 'The Listening Deep',
    hook: 'Brother Ouros will teach you to read a green by the whisper alone.',
    offer: [
      '🖤 "Walk the Cetus Shelf with me, champion, out where the star-tides fall and the deep listens back. ' +
        'I whispered the Offer to you once at the crossroads. Now let me teach you to HEAR."',
      '"Read nothing with your eyes on that green — let me whisper the line, and hole out on faith. Do it, ' +
        'and I give you the reader I have carried since before your grandfather ever teed off."',
    ],
    complete: [
      '🖤 "You holed it on a whisper. No read, no doubt — only trust. That is the whole of the Long Rest: to ' +
        'stop striving, and let the world choose your line for you."',
      '"The Whisperer\'s Read — solar-true, and it hums the break into your hands like a confession. Every ' +
        'line it gives you is honest. It has never once lied. Nor have I, to you."',
    ],
    rewardClubId: 'quest:ouros',
    rewardName: NAMED_STORY_CLUBS['quest:ouros']!.name,
    rewardBlurb: 'The Whisperer\'s ancient putter — it hums the true break to your hands. Reads run honest and long.',
  },
  {
    id: 'quest-coil-ecdysis',
    caddyId: 'coil-ecdysis',
    alignment: 'herald',
    world: 'ocean-18', // the Eridanus Atolls — where the Shedmaker drowns the wards
    minChapter: 4,
    title: 'The Shedding',
    hook: 'Sister Ecdysis will forge you a wedge from the serpent\'s cast scale.',
    offer: [
      '🖤 "Bring me to the Atolls, Herald, where I drown the old wards and harvest what the sea gives up. ' +
        'Come hold the tide down with me, and I will grow you a gift from the serpent\'s own cast scale."',
      '"Play the drowning shrine at my side. When the water is ours, I will fit your bag with a wedge shed ' +
        'from the World-Eater — power, and its price, as all true things carry."',
    ],
    complete: [
      '🖤 "The wards are drowned; the sea kept its bargain, and so will I. You did not flinch when the old ' +
        'shrine went under. Good. Flinching is for those who still hope."',
      '"The Shedmaker\'s Scale — a wedge of serpent-plate, and no lie on any world can hold it. It lifts the ' +
        'ball from anywhere, the way the Long Rest lifts the weary from everything. Wear it well."',
    ],
    rewardClubId: 'quest:ecdysis',
    rewardName: NAMED_STORY_CLUBS['quest:ecdysis']!.name,
    rewardBlurb: 'A wedge of cast serpent-scale — no lie on any world can hold it. Escapes anything, from anywhere.',
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
/** The world a quest sends you to — an explicit `world` (a Coil quest names its own, GS-story-herald-quests),
 *  else the ally's recruit home world (the Warden pattern). */
export function questWorld(quest: StoryQuest): string | undefined {
  return quest.world ?? allyHomeWorld(quest.caddyId);
}

/** GS-story-herald-quests: does this quest belong to the player's chosen PATH? A Coil (`alignment:'herald'`)
 *  quest is offerable only to a Herald; a Warden quest only to a non-Herald (undecided/warden). */
function questMatchesPath(quest: StoryQuest, story: StoryState): boolean {
  return (quest.alignment === 'herald') === (story.alignment === 'herald');
}

/**
 * Is this ally's quest OFFERABLE right now? — the ally is recruited, the chapter has been reached, no quest
 * is currently active, and this one isn't already done. (A world is not required to be cleared: the ally
 * takes you there together as the quest itself.)
 */
export function questOfferable(story: StoryState, caddyId: string): boolean {
  const q = questForCaddy(caddyId);
  if (!q) return false;
  // GS-story-herald-quests: a quest belongs to a PATH. A Warden caddy's loyal quest is off the table once
  // you turn Herald (GS-story-quality GAP2 — you betrayed them); a Coil inner-circle quest is offerable ONLY
  // on the dark path. `questMatchesPath` collapses both rules into one alignment match.
  if (!questMatchesPath(q, story)) return false;
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
  if (!q || !questMatchesPath(q, story) || !storyCaddyHired(story, caddyId) || questDone(story, q.id)) return false;
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
