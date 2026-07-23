/**
 * Story-Tour ALLY SIDE QUESTS (GS-story-quests) — a deep, faction-relevant personal quest for every
 * recruitable ally. Once you've recruited a friend AND the campaign has reached their chapter, they offer
 * you a quest in the Clubhouse (on their talk card, GS-story-allies): travel with them to the world that
 * MEANS something to them — Driver Dan's old long-haul rig (the derelict), Sandy's home dunes, the Mole's
 * deep mire — play it, and they hand you a UNIQUE prize as thanks. GS-story-reward-variety: that prize is
 * whatever fits the friend's story, not always a club — Dan the old trucker gifts his rig's salvaged ENGINE
 * (a ship part), the Doctor a healing tour BALL, the Mole/Whisperer a green-reading CIRCLET/COWL, the
 * Shedmaker serpent-scale hull ARMOUR, the sand-saver still her WEDGE — a real mix of clubs, equipment, and
 * spaceship parts. The quest is their story: why they left, what they lost, what they'll give to get it back.
 *
 * PURE + DOM-free, content-as-data — a new quest is a ROW, never an engine edit. The quest lifecycle lives
 * on `StoryState` (`activeQuestId` + `completedQuestIds`, save-versioned); this module is the table + the
 * pure transitions (offer → accept → play → complete-with-reward). Screens/round wiring live in app/ui.
 */

import { NAMED_STORY_CLUBS, type StoryState, type StoryAlignment } from './story';
import type { LoreLine } from './lore';
import { allyHomeWorld, allyName } from './storyAllies';
import { factionForCaddy, factionById } from './factions';
import { storyCaddyHired, caddiedWith } from './storyCaddies';
import { grantStoryReward, rewardClubId, rewardEffectLabel, type StoryReward } from './storyRewards';

/** One ally's side quest (content-as-data). The reward is a `StoryReward` (club / gear / ship part / ship,
 *  GS-story-reward-variety), granted through the shared reward channel so each plays + looks like the loot
 *  it is. */
/** GS-story-betrayal-herald: the FIRST caddy quest you completed + whether you STILL wield its reward club
 *  — the personal thread the Herald Ch.4 betrayal beat pulls on ("you still swing Sandy's Second, the club
 *  she gave you when you were someone she could be proud of"). Undefined if you never finished an ally quest.
 *  NOTE: caddy quests are only offerable BEFORE The Choice (Ch.1–3, un-turned), so this can only ever be a
 *  caddy reachable by Ch.3 — Sandy (Vela Dunes, Ch.1) / Chipinski (Orion, Ch.2) / Sam (Cygnus, Ch.2) /
 *  Penelope (Coronae, Ch.3). It is NEVER Dan or Mole: their worlds (the derelict + the mire) chart only at
 *  Ch.4 (GS-story-gather-early — post-Choice), where recruiting is Warden-only and questing is off for a
 *  Herald, so a completed Dan/Mole quest is a Warden-path, post-Choice thing this hook never reads. */
export function heraldQuestHook(story: StoryState): { caddyName: string; clubName: string; stillUsing: boolean } | undefined {
  // The first WARDEN caddy quest completed whose reward was a bag CLUB (GS-story-reward-variety) — the beat
  // is "you still swing the club she gave you", so it only ever reads a club-gift quest, skipping the ones
  // that hand over gear / a ship part (no club to still be swinging). It also skips `charquest:` markers AND
  // the Coil (`alignment:'herald'`) quests that share `completedQuestIds`: the Severing beat is about a
  // friend you BETRAYED, so it reads a Warden ally's gift, never a Coil inner-circle one.
  const firstCaddyId = story.completedQuestIds.find((id) =>
    STORY_QUESTS.some((x) => x.id === id && x.alignment !== 'herald' && x.reward.kind === 'club'),
  );
  if (!firstCaddyId) return undefined;
  const q = STORY_QUESTS.find((x) => x.id === firstCaddyId);
  if (!q) return undefined;
  const clubId = rewardClubId(q.reward);
  return {
    caddyName: allyName(q.caddyId),
    clubName: q.rewardName,
    stillUsing: !!clubId && story.equippedBagIds.includes(clubId),
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
  /** GS-story-caddy-quest-dialogue: the ally's MID-ROUND beat — a short cinematic scene at the turn of the
   *  quest round (the `.gs-lore*` beat card, `storyQuestBeat`), so the quest has a middle, not just a pitch
   *  and a payoff. Optional (absent = no mid-round pause, byte-identical). Fires ONLY on the ally's own quest
   *  round (`Run.storyQuest`), never a tournament/Sigil/main-story event, and is a single dismissible pause —
   *  the player plays on with one tap, so it never floods or interrupts the main story. */
  duringQuest?: readonly LoreLine[];
  /** What plays / what's said on the quest round's completion recap, then the reward. */
  complete: readonly string[];
  /** GS-story-reward-variety: the reward this quest hands over — a club, a piece of gear, a ship part, or a
   *  ship, whichever fits the friend's story. `rewardName`/`rewardBlurb` are its display; the `reward` tag
   *  says which system grants it. (A `{kind:'club'}` reward keeps the old ally-gift-club behaviour.) */
  reward: StoryReward;
  rewardName: string;
  rewardBlurb: string;
}

/** GS-story-reward-variety: the "why you want it" line for a quest's reward, whatever its kind (the club
 *  signature effect, a gear detail, a ship-part combat/credit line, a ship's bonus). Used by the recap +
 *  offer card. */
export function questRewardEffectLabel(quest: StoryQuest): string | undefined {
  return rewardEffectLabel(quest.reward);
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
      '"Forty years I told myself she was just metal. Just a hauler. But you don’t leave forty years of your life ' +
        'in the dark and call it nothing. I owe her a proper goodbye, and I’ve been too much of a coward to give it."',
      '"I can’t face her alone. But with you on the bag… come out there with me. Let me say goodbye to the old ' +
        'girl properly. There’s something aboard I want you to have."',
    ],
    duringQuest: [
      { kind: 'action', text: 'Halfway round, Dan stops at a buckled bulkhead, runs a gloved hand down a faded stencil — L-O-N-G  H-A-U-L — and just stands there a while before he can get the words out.' },
      { kind: 'say', text: '🎒 "Slept forty years in the bunk right behind that wall. Hauled ore, hauled ice, hauled a whole colony’s worth of seed grain across the Rim the winter the crops failed. She never once quit on me. …I quit on her."' },
      { kind: 'say', text: '"Keep playin’, kid. To the tour it’s just a golf round out on a dead ship. To me, every hole is a mile of road I never got to finish. Let me drive it to the end this time. With you riding shotgun."' },
    ],
    complete: [
      '🎒 "There she is. Rustier than I remember. …We hauled half this galaxy in that hold, the Long Haul and me."',
      '"Ran when I should’ve stayed. Left her when she never left me. You brought me back out here to face that, ' +
        'and I don’t know that I’d have managed it for anybody else. So — thank you, kid. Truly."',
      '"Down in the engine bay, kid — that’s her drive core. Solar-fusion, hauled a full load clean across a ' +
        'ring system once. Bolt it into your ship. She’s got one more haul left in her, and I want it to be ' +
        'yours. Go save the universe — and come home riding low on winnings."',
    ],
    reward: { kind: 'upgrade', id: 'upg:engine:longhaul' },
    rewardName: "The Long Haul's Drive Core",
    rewardBlurb:
      "Driver Dan's solar-fusion drive core, pulled from the wreck of his old rig — the fleet's biggest hold-and-earn engine, and Combat Rating toward the finale.",
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
      '"I was twenty-two and certain, and that grain of sand made a liar out of certain. I’ve replayed the ' +
        'swing ten thousand nights. Never once played the shot. Time I did."',
      '"Come out there with me. Watch me play it — or play it yourself. Either way, I’m not leaving those ' +
        'dunes owing them anything. And when it’s done, the wedge is yours."',
    ],
    duringQuest: [
      { kind: 'action', text: 'Sandy stops on the ridge above the dunes, wind hissing sand off the crests, and doesn’t take a club out of the bag for a long moment.' },
      { kind: 'say', text: '🎒 "See that bunker on the far side? Left-hand lip, deep as a grave. That’s the one. Forty years I’ve carried it, and it turns out it’s just… a hole in the ground with sand in it."' },
      { kind: 'say', text: '"Keep swinging clean, champion. Play me up close to it. I want to stand over that lie one more time — only this time I’ve got someone on the bag who believes it comes out."' },
    ],
    complete: [
      '🎒 "…Out. First try. Forty years, and it was OUT." (She laughs like a landslide, wipes her eyes with a sandy glove, pretends it’s the grit.)',
      '"You know what did it? Not the technique. I’ve had the technique since before your parents were born. It was standing there with someone who wasn’t waiting for me to fail. That was the missing club."',
      '"Take the wedge, champion. Sand-Saver’s Second — solar-forged, opens like a dream. From now on there’s ' +
        'no such thing as an unplayable lie. Sandy’s orders."',
    ],
    reward: { kind: 'club', id: 'quest:sandy' },
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
      '"I lost one, you know. Years ago, on a course just like Orion — waited for permission that never came, and ' +
        'by the time I moved it was too late. I don’t wait for permission any more. I answer the call."',
      '"Fly me to Orion Forge. Play the round so the tour can’t cancel it, and I’ll work the sidelines. Save the ' +
        'game, I save the golfer. And I’ll fit you with a wedge that’ll never let a chip flatline."',
    ],
    duringQuest: [
      { kind: 'action', text: 'At the turn Dr Chipinski jogs up from the sideline tent, sleeves rolled and scorched, stethoscope swinging, and flashes you a quick thumbs-up before the worry settles back over his face.' },
      { kind: 'say', text: '🎒 "Pulse is steadying — colour’s coming back into them. But that Coil marshal keeps eyeing the clock. Long as there’s a round in play, they can’t clear the Forge and cart everyone off. So keep swinging, champion. You are the reason these doors stay open."' },
      { kind: 'say', text: '"Funny thing about a call-out: nobody rings on the easy days. You just answer, and you keep answering. Give me nine more clean holes and I’ll give this golfer their life back. Deal?"' },
    ],
    complete: [
      '🎒 "Patient’s stable. Colour’s back. Ha — you rang, I answered, everybody lives. That’s the practice."',
      '"You kept the round alive when it would’ve been so easy to walk in out of that heat. You didn’t. That’s the ' +
        'whole oath, right there — not the cleverness, the not-leaving. You’d have made a fine medic, champion."',
      '"Here — a sleeve of Phoenix Core balls, milled on the sidelines while I worked. Each one wound around ' +
        'the same fire I use to restart a heart. Chip with one and it always finds a pulse near the pin — it ' +
        'won’t let a ball flatline any more than I will. Doctor’s orders."',
    ],
    reward: { kind: 'gear', id: 'gear:ball:phoenix' },
    rewardName: 'The Phoenix Core Ball',
    rewardBlurb:
      "Dr Chipinski's own tour ball, wound around phoenix-fire — it lands soft, holds, and every chip finds a pulse by the pin.",
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
      '"I failed it the first time, you know. Read every grain, forced every line, and the crystal turned every ' +
        'putt away. It does not reward the trying. It rewards the letting-go. That lesson took me ten years."',
      '"Come. Read nothing. Force nothing. Let the crystal tell you the line, and hole out from wherever the ' +
        'world puts you. Pass, and the Guild’s own putter is yours — and so is my full trust."',
    ],
    duringQuest: [
      { kind: 'action', text: 'Penelope halts you on the crystal apron, where the whole green rings faintly like a struck glass, and simply waits until your breathing slows to match its tone.' },
      { kind: 'say', text: '🎒 "You are trying. I can see you trying — reading, calculating, forcing the line. The crystal does not answer force. It answers stillness. Let the hands go quiet."' },
      { kind: 'say', text: '"The trial is not to make the putt. It is to stop needing to. Play the rest as though the ball has already come to rest where it belongs. Then — and only then — it will."' },
    ],
    complete: [
      '🎒 "You let go at the top of the stroke. I felt it from here. The green went quiet for you. That is the ' +
        'whole art, and you have it."',
      '"I have waited a long time to caddie for someone who could be still on that green. Longer than I will admit. ' +
        'Thank you for being the one. The Guild will hear of this — and they will know your name from mine."',
      '"The Star-Reader — solar-true, weighted for surrender, not for effort. Every read it gives you is honest. ' +
        'Putt as if the ball has already stopped. It nearly has."',
    ],
    reward: { kind: 'club', id: 'quest:penelope' },
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
      '"It’s not that I can’t see the shot. I see it clear as you do. I just… the second someone looks at me, I ' +
        'fold. I say what I think they want. I’ve done it my whole life. I’m so tired of it."',
      '"Take me back to the Links. This time I call the shots and I DON’T change my mind when you look at me. ' +
        'Help me trust myself once. If I manage it… I made you something. It’s good, I think. I THINK it’s good."',
    ],
    duringQuest: [
      { kind: 'action', text: 'On the exposed ridge at Cygnus Links the crosswind flattens the flags. Sam stands over the bag a long moment, mouth opening and closing, before he forces the words out — quietly, then not quietly.' },
      { kind: 'say', text: '🎒 "Okay. Okay okay okay. You didn’t tell me the club that time — you just let me stand here. And the scary part? I have an answer. It’s right there. I KNOW the shot."' },
      { kind: 'say', text: '"Don’t look at me like you’re waiting to correct me, alright? Just… trust me the way I trust everyone else. One more nine. Let me hear my own voice for once and not flinch at the sound of it."' },
    ],
    complete: [
      '🎒 "Three-wood. Low, into the wind, hold it left. …I called it. I CALLED IT and I didn’t take it back!"',
      '"You know what you did? You didn’t nod along and you didn’t overrule me. You just waited. Nobody ever ' +
        'just waited for me before. Turns out that’s all the confidence was ever going to take."',
      '"This is Conviction — I forged it myself, on the Links, and I’m not asking if you like it. It’s ' +
        'solar-forged and it’s YOURS and it flies dead straight because for once I was sure. Take it. …You like it?"',
    ],
    reward: { kind: 'club', id: 'quest:sam' },
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
      '"The surface folk pitied me my whole life — the blind mole, they said, as if the dark were a cage. It was ' +
        'never a cage. It was a gift they were too sighted to understand. Down there, I am the one who sees."',
      '"Come down into the deep with me. I cannot see your line — I never could — but I will feel it for you. ' +
        'Trust the soil. Trust me. And what I dig up for you afterward, no surface-dweller has ever held."',
    ],
    duringQuest: [
      { kind: 'action', text: 'Deep in the mire the light gives out entirely. The Mole presses one paw flat to the wet ground, tilts his head, and goes utterly still — reading something no eye could ever find.' },
      { kind: 'say', text: '🎒 "Down here your eyes are worth nothing, champion. Good — mine never were. Feel the ground answer up through your feet. The break is older than the serpent, and it is speaking, if you will only stop looking and listen."' },
      { kind: 'say', text: '"I have waited my whole life in the dark for a golfer who would trust the soil over their sight. Play on by feel. Let me be your eyes down here, the way the deep has always been mine."' },
    ],
    complete: [
      '🎒 "You holed it. In the dark, by feel alone, you holed it. Even the serpent paused to listen."',
      '"Do you feel it now — the ground under everything, telling you where the world truly leans? That is what I ' +
        'have felt every day of my life. For once I was not alone down here in the knowing. Thank you for that."',
      '"From the deepest seam I dug this band of mire-iron — the Dowser’s Circlet. Wear it, and the break ' +
        'comes up through the ground into your bones, the way it always did for me. No eyes required. Now you ' +
        'carry a little of the deep with you, champion."',
    ],
    reward: { kind: 'gear', id: 'gear:hat:dowser' },
    rewardName: "The Dowser's Circlet",
    rewardBlurb: 'A band of mire-iron dowsed from the deep — it reads the break through any ground, straight into your bones.',
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
      '"I was the brightest the Wardens ever raised, you know. Their golden child, before you. And out there at ' +
        'the edge I heard the truth they had trained me to shout over — and I could not un-hear it."',
      '"Play the abyss at my side. Not to conquer it — to LISTEN. When you understand what I understood out ' +
        'there, I will put my own driver in your hands. The one I carried down when I fell."',
    ],
    duringQuest: [
      { kind: 'action', text: 'At the edge of the Core the Apostate halts you where the abyss falls away into nothing. For a moment neither of you plays; he only listens, eyes closed, the way a man listens for a tide.' },
      { kind: 'say', text: '🖤 "There. Do you hear it now, under the silence? That is the whisper. It does not command. It does not threaten. It simply tells the truth the Wardens spend their whole lives shouting over — that every ball, in the end, wants to stop."' },
      { kind: 'say', text: '"Play on, champion. Do not conquer this place — let it in. When you understand what I understood out here, the driver in my hands becomes yours, and you will never fear a lie again."' },
    ],
    complete: [
      '🖤 "There. You heard it too — I watched your hands go still on the club. That quiet is the truth the ' +
        'Wardens spend their whole lives shouting over."',
      '"Take my driver. Sable-black, solar-forged, and it does not care where the ball lies — no lie is ' +
        'unplayable to one who has stopped fearing the rest. Swing it, and swing it certain."',
    ],
    reward: { kind: 'club', id: 'quest:voss' },
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
      '"I was somebody\'s daughter once, you know. Somebody\'s prodigy, somebody\'s hope. The Mire took all of ' +
        'that and gave me back something that doesn\'t break. I want you to see where the Viper was made."',
      '"Play the serpent\'s own green at my side. Beat it, and I will forge you a blade from the fang I keep. ' +
        'On this bag I never miss — let me make sure you never do either."',
    ],
    duringQuest: [
      { kind: 'action', text: 'Down in the acid shrine Venoma trails a hand along a wall of shed skins — older and older, going back — and something almost tender crosses the Viper’s face before the edge slides back over it.' },
      { kind: 'say', text: '🐍 "This is where they made me. Where the girl I used to be got left behind like one of these old skins. I hated her for years. Now I just… pity her. She didn’t know yet that shedding is how you survive."' },
      { kind: 'say', text: '"Keep swinging, golden child. Play the serpent’s green like you belong on it — because you do now, whether your old Warden friends like it or not. Beat this place, and I forge you a fang of your own."' },
    ],
    complete: [
      '🐍 "Ha — you played the Mire like you were born in the mud. Maybe you were, and never knew. The old me ' +
        'would have hated you for it. I think she would be jealous."',
      '"I brought you to the one place that made me, and you didn\'t flinch, and you didn\'t pity me. Do you ' +
        'know how rare that is? Voss got a protégé. I think I just got the only friend I\'ve had since I shed my name."',
      '"The Viper\'s Fang — solar-forged, weighted to strike dead straight, and it bends the wind to its line. ' +
        'It does not waver. Neither do we, you and I. Not any more."',
    ],
    reward: { kind: 'club', id: 'quest:venoma' },
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
      '"I was a loud man, once. I argued, I proved, I won. And I heard nothing at all. It was only when I ' +
        'went quiet — truly quiet — that the deep began to speak to me. I would give you that quiet."',
      '"Read nothing with your eyes on that green — let me whisper the line, and hole out on faith. Do it, ' +
        'and I give you the reader I have carried since before your grandfather ever teed off."',
    ],
    duringQuest: [
      { kind: 'action', text: 'On the Cetus Shelf the star-tides fall away below. Brother Ouros draws the hood back from his ears and turns his head slowly, as if catching a voice on the wind that only he can hear.' },
      { kind: 'say', text: '🖤 "I whispered the Offer to you once, at the crossroads, and you took my hand. Now the deep whispers back. Do not read this green with your eyes, champion — let me tell you the line, and hole out on faith alone."' },
      { kind: 'say', text: '"This is the whole of the Long Rest: to stop striving, and let the world choose your line for you. Play on by trust. When you hole out on a whisper, the reader I have carried a lifetime becomes yours."' },
    ],
    complete: [
      '🖤 "You holed it on a whisper. No read, no doubt — only trust. That is the whole of the Long Rest: to ' +
        'stop striving, and let the world choose your line for you."',
      '"Most who take the Offer are running from something — a loss, a grief, a fear. You are not. You came to ' +
        'the quiet clear-eyed, and stayed. In a long life of whispering, you are the first who ever truly listened back."',
      '"Take my cowl — the Whisperer\'s Cowl, worn since before your grandfather teed off. Draw the hood up on ' +
        'a green and the deep hums the true break straight into your ear. Every line it gives is honest. It ' +
        'has never once lied. Nor have I, to you."',
    ],
    reward: { kind: 'gear', id: 'gear:hat:cowl' },
    rewardName: "The Whisperer's Cowl",
    rewardBlurb: "The Whisperer's ancient listening-cowl — the deep hums the true break into your ear. Reads run honest and long.",
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
      '"You wonder that I feel nothing for the wards I drown. I felt everything, once — that is precisely why ' +
        'I shed it. A skin you cannot take off is not armour. It is only another thing that can be cut."',
      '"Play the drowning shrine at my side. When the water is ours, I will fit your bag with a wedge shed ' +
        'from the World-Eater — power, and its price, as all true things carry."',
    ],
    duringQuest: [
      { kind: 'action', text: 'At the drowning shrine Sister Ecdysis wades out to where an old Warden ward-stone is going under, and does not help it — only watches, patient as the tide, until the water takes it whole.' },
      { kind: 'say', text: '🖤 "See how quietly the old wards drown, Herald? No screaming. No fighting it. Just the sea taking back what was always hers. Everything sheds, in the end. The wise do it willingly."' },
      { kind: 'say', text: '"Hold the tide down with me — play the shrine under while it goes. When the water is ours, I will peel a scale from the World-Eater and lay it over your hull. Power, and its price, as all true things carry."' },
    ],
    complete: [
      '🖤 "The wards are drowned; the sea kept its bargain, and so will I. You did not flinch when the old ' +
        'shrine went under. Good. Flinching is for those who still hope."',
      '"I do not give thanks — the old self who knew how to is long shed. But know this: I have fit no other ' +
        'hull but my own before yours. Read that as you like. I mean it as the only kind of trust I keep."',
      '"Then hold still while I fit your hull. The Shedmaker\'s Carapace — sheet upon sheet of the ' +
        'World-Eater\'s own cast scale, annealed and laid over your ship like a second skin. It turns a strike ' +
        'the way the serpent turns a blade. Power, and its price. Wear it into the last fight."',
    ],
    reward: { kind: 'upgrade', id: 'upg:shield:carapace' },
    rewardName: "The Shedmaker's Carapace",
    rewardBlurb:
      "Serpent-scale hull armour shed and re-grown by Sister Ecdysis — the heaviest ship defence a Coil smith has made, and Combat Rating toward the finale.",
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

/** GS-story-map-nav: the OFFERABLE quest that plays on this world (path-matched), if any — so the star-map
 *  dossier for a world can surface "accept & fly" straight from the chart, not only the clubhouse. */
export function offerableQuestForWorld(story: StoryState, courseId: string): StoryQuest | undefined {
  return STORY_QUESTS.find((q) => questWorld(q) === courseId && questOfferable(story, q.caddyId));
}

/** GS-story-map-nav: the quest a world's "start quest" map action should tee off — the ACTIVE quest if it
 *  plays here (already accepted), else an offerable quest that plays here. Undefined if neither. The reducer
 *  accepts it (if not already active) and tees off the quest round, so a quest is playable from the map. */
export function startableQuestForWorld(story: StoryState, courseId: string): StoryQuest | undefined {
  const active = activeQuest(story);
  if (active && questWorld(active) === courseId) return active;
  return offerableQuestForWorld(story, courseId);
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
  // GS-story-reward-variety: grant whatever the quest gives (club → bag, gear → locker, part → fleet, ship →
  // hangar) through the shared, idempotent reward channel, then record it done + clear the active slot.
  const granted = grantStoryReward(story, q.reward);
  return {
    ...granted,
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
