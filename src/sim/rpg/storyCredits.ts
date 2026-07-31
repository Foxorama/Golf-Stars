/**
 * The Story-Tour CREDITS ROLL (GS-story-credits) — the Mallrats "where are they now" cards.
 *
 * The finale recap has shipped a "Roll the credits ›" button since GS-story-yggdrasil and it went
 * straight to the title: the campaign's last promise was the one thing the game never delivered. This
 * module is the roll's CONTENT — one card per cast member, each with the epilogue that character walked
 * into after the root. Pure + DOM-free (no window, no rng, no time), so vitest reads the whole roll.
 *
 * THREE RULES it is built on:
 *
 * 1. **Every card has TWO epilogues, because there are two endings.** A Warden win reseals the serpent
 *    and the galaxy wakes up; a Herald win feeds it and the lights go out, world by world, into the Long
 *    Rest. One shared set of epilogues would be false on whichever path the player did not take — and a
 *    credits roll that lies about the ending it is rolling on is worse than no credits at all. So a row
 *    carries `warden` and `herald`, and `creditsRoll` picks by `story.alignment`.
 *
 * 2. **A golfer's card depends on the ROLE the campaign gave them, and the two paths cast differently.**
 *    On the Warden road one friend heard the whisper and ran (`betrayerId`) and two stayed; on the Coil
 *    road you severed one (`heraldSeveredId`) and the other two came for you at the Ark
 *    (`heraldOpponentIds`). Those are already the campaign's own single seams — this module ASKS them
 *    rather than re-deriving who stood where, so the roll can never name a different traitor than the
 *    ending recap two screens earlier did.
 *
 * 3. **The protagonist's card is written in the SECOND PERSON.** The hero is a PICK — Feather (she/her),
 *    Woo (he/she/they), Larry (he/him), Bo (they/them) — so "he went home to Perth" is only true for one
 *    quarter of the players who reach this screen (GS-story-neutral-address). "You went home to Perth" is
 *    true for all of them, and it is warmer besides. Every other card is third-person about a specific
 *    named character and correctly carries that character's own pronouns.
 *
 * Content-as-data throughout: a new cast member is a ROW (plus a portrait token the shared
 * `render/castPortrait.ts` seam already knows how to draw), never an engine edit.
 */

import { getCharacter } from './characters';
import { otherGolferIds } from './storyCast';
import { betrayerId, heraldSeveredId } from './storyBetrayal';
import type { StoryState } from './story';

/** Which ending the roll is rolling on. */
export type CreditPath = 'warden' | 'herald';

/** One card in the roll: who they are, how to draw them, and what became of them. */
export interface CreditCard {
  /** Stable id — a golfer id, a caddy shop-item id, a Coil agent id, or a bespoke cast id. */
  id: string;
  /** The name across the top of the card. */
  name: string;
  /** The small line under it — who they were to you on this road. */
  role: string;
  /**
   * The portrait token for `render/castPortrait.ts` (`golfer:<id>` / `caddy:<id>` / `agent:<id>` / a
   * bare lore-portrait id). `''` draws a text-only plate — used for the one card that is not a person.
   */
  portrait: string;
  /** The "where are they now", already resolved for this path. */
  epilogue: string;
}

/** A titled run of cards — the roll is grouped like a real credit crawl. */
export interface CreditSection {
  title: string;
  cards: CreditCard[];
}

/** An authored card, before a path is chosen. */
interface CastRow {
  id: string;
  name: string;
  role: string;
  portrait: string;
  warden: string;
  herald: string;
}

/**
 * The dedication that closes the roll. A const rather than inline markup so a test can pin it: this is
 * the one piece of copy on the screen that is a promise to a real person, and a refactor that quietly
 * drops it would be the only bug on this screen that actually matters.
 */
export const SPECIAL_THANKS = {
  heading: 'Special thanks',
  body:
    'Special thanks to Unity_Starfish for hours and hours of testing and reaching a record depth of ' +
    '356 holes in the Unending Universe.',
  signoff: 'All my love — Fox.',
} as const;

// ── The golfers ────────────────────────────────────────────────────────────────────────────────────
// Six epilogues each: the hero (second person, both paths) and the two roles a friend can be cast in on
// each road. Written off the character's own `lore` block — the kite over the Ngong Hills, the dented
// driver on the mantelpiece, the roastery named for spin rates — so the card reads as that golfer and
// nobody else.

interface GolferEpilogues {
  warden: { hero: string; loyal: string; betrayer: string };
  herald: { hero: string; foe: string; severed: string };
}

const GOLFER_EPILOGUES: Record<string, GolferEpilogues> = {
  'feather-fade': {
    warden: {
      hero: 'You went home to Nairobi with the Keystone in your bag and a sleeping serpent under the roots of everything. The wind off the Ngong Hills moves exactly as it always did. You still read it better than anyone alive.',
      loyal:
        'Feather Fade went back to the Ngong Hills and taught a generation of kids to read the wind off a kite string. Three of them have since won on tour. All three tee off with a feather clipped to the cap.',
      betrayer:
        'Feather Fade was last logged on a long-range scope, running dark past the final charted buoy. Her transponder still answers — four beeps, then silence. Nobody can agree whether that is a distress code or a joke about the 72nd hole.',
    },
    herald: {
      hero: 'You came home to a Nairobi where the wind has stopped. The kites hang in the still air over the hills. You tell yourself that is peace, and most days you believe it.',
      foe: 'Feather Fade flew at the Ark’s flank with the Ngong wind still in her cap and never once turned away. The Wardens keep the feather in a case aboard the Mothership. There is nothing else left to keep.',
      severed:
        'Feather Fade never flew again. She is out there somewhere in the stillness, aiming left out of habit, waiting on a wind that is not coming back.',
    },
  },
  'huang-woo-hook': {
    warden: {
      hero: 'You went home to Busan, where you can still name any club in the galaxy by the sound of the strike. People bring you recordings now, from worlds you have never played, just to see whether it holds. It holds.',
      loyal:
        'Huang-Woo Hook opened a range on the Busan seafront where every bay faces the harbour they once hooked three straight drives into, live on television. It is the busiest range in Korea. The nets are there for the harbour.',
      betrayer:
        'Huang-Woo Hook crossed the last chart on a dead-quiet burn. Out past it, a Coil listening post logs the same sound over and over: an iron struck clean, blindfolded, with nobody left aboard who can name the club.',
    },
    herald: {
      hero: 'You went home to Busan and sat on the seawall with your eyes shut, listening, the way you learned to. There is nothing left to hear. You listen anyway.',
      foe: 'Huang-Woo Hook flew the Ark’s guns with the visor down, because they had never needed to see. The last thing the gun crews heard was the strike.',
      severed:
        'Huang-Woo Hook went back to the Gwangalli seawall and stayed there through the long green quiet, head tilted, waiting for one more sound worth naming.',
    },
  },
  'longshot-larry': {
    warden: {
      hero: 'You went home to Perth. The kelpie did not care in the slightest that you had saved the universe, and honestly, that helped more than the parade did.',
      loyal:
        'Longshot Larry hung a second dented driver over the mantelpiece and told his kids the whole story. They believe about a third of it. It is, as it happens, the third that actually happened.',
      betrayer:
        'Longshot Larry took the long road out past every chart, which is the only kind of road he ever wanted. Warden trackers still follow a single ball, still carrying, somewhere past the last buoy. It has not come down yet.',
    },
    herald: {
      hero: 'You went home to Perth and stood a long while in a very quiet yard. The kelpie waited by the gate for a sound that never came. You did not have the heart to explain it.',
      foe: 'Longshot Larry flew straight down the Ark’s throat at full power with no plan whatsoever, exactly as he had played every hole of his life. It very nearly worked.',
      severed:
        'Longshot Larry sits somewhere in the stillness with a dented driver and nobody left to tell about it. He tells it anyway. It gets longer every time.',
    },
  },
  'backspin-bo': {
    warden: {
      hero: 'You went home to Portland and named a blend after the shot that put the World-Eater to sleep. It is the slowest roast on the shelf. It sells out anyway.',
      loyal:
        'Backspin Bo opened a roastery with a nine-hole chipping green out the back. The house pour is still “10,000 RPM”. The new one, named for the Reseal, is decaf — because some things, Bo says, ought to stop.',
      betrayer:
        'Backspin Bo left with a bag, a grinder and no forwarding address, out past the edge of every chart. Wherever The Destination turns out to be, somebody there is making very good coffee.',
    },
    herald: {
      hero: 'You went home to Portland, to a roastery that does not open any more. Ten thousand revolutions a minute, and everything in the galaxy has finally stopped spinning. It is complicated.',
      foe: 'Backspin Bo flew the Ark’s flank the way they played a wedge — nothing wasted, everything held back, biting hard and stopping dead precisely where they meant to.',
      severed:
        'Backspin Bo went back to Portland and kept roasting for a while out of habit, then stopped. The last blend never got a name.',
    },
  },
};

/** Fallback prose for a golfer with no authored row — a new roster golfer still gets an honest card. */
function golferFallback(name: string, path: CreditPath, role: 'hero' | 'a' | 'b'): string {
  if (role === 'hero')
    return path === 'warden'
      ? 'You went home. The galaxy kept turning, and every fairway on it stayed walked.'
      : 'You went home. Nothing turns any more, and the quiet is exactly as deep as promised.';
  return path === 'warden'
    ? `${name} walked away from the root and kept playing, which is the whole of what the Wardens ever asked.`
    : `${name} did not come back from the root. In the stillness that followed, nobody was left to count who had.`;
}

// ── The rest of the cast ───────────────────────────────────────────────────────────────────────────

/** The Warden crew — the friends who carried your bag across the galaxy. */
const CREW: readonly CastRow[] = [
  {
    id: 'driver-dan',
    name: 'Driver Dan',
    role: 'Your first friend on the road',
    portrait: 'caddy:driver-dan',
    warden:
      'Driver Dan retired out to the Ghost Sector and finally went back for the wreck he never talks about. He got her running. He will not say what was aboard, but he now recommends one MORE club than he used to.',
    herald:
      'Driver Dan stood his ground on the Ark’s bridge, because that was what he had always been. Whatever the Coil left of the galaxy, it did not leave a single bag in it worth carrying.',
  },
  {
    id: 'auto-caddie',
    name: 'Penelope Putter',
    role: 'The Wardens’ short-game sage',
    portrait: 'caddy:auto-caddie',
    warden:
      'Penelope Putter said nothing at all about the Reseal, tended a flag on a quiet green for eleven years, and has since been recognised — by absolutely everyone except herself — as the strongest Warden who ever lived.',
    herald:
      'Penelope Putter was the last of them to stop. In a galaxy going still she stood over one final putt, let it go, and remarked that the green had told her this was coming and she had chosen not to listen.',
  },
  {
    id: 'sandy-sandsaver',
    name: 'Sandy Sandsaver',
    role: 'Escape artist of the dunes',
    portrait: 'caddy:sandy-sandsaver',
    warden:
      'Sandy Sandsaver went back to the Vela dunes and holed out from a fried-egg lie for the third time, alone, with nobody watching. She counts it. That is the entire point of Sandy.',
    herald:
      'Sandy Sandsaver was still buried on a world that went quiet before she could get out of it. Nobody had ever seen her fail to escape anything. Nobody has stopped expecting her back.',
  },
  {
    id: 'dr-chipinski',
    name: 'Dr Chipinski',
    role: 'Para-Spatial Medics · on call',
    portrait: 'caddy:dr-chipinski',
    warden:
      'Dr Chipinski answered a call placed a hundred and forty years before he was born, and got there in time. He does not explain this. He has never explained any of it.',
    herald:
      'Dr Chipinski kept answering calls long after there were any left to place. Somewhere in the stillness a bell is still ringing, and something is still on its way.',
  },
  {
    id: 'suggestible-sam',
    name: 'Suggestible Sam',
    role: 'Long Haul yardage man',
    portrait: 'caddy:suggestible-sam',
    warden:
      'Suggestible Sam wrote the definitive account of the Reseal. It agrees with every other account of the Reseal, including the several that contradict each other. It is a bestseller on nine worlds.',
    herald:
      'Suggestible Sam agreed. Sam always agreed. In the last of the quiet he was heard to say it was probably all for the best, and then, much more quietly, that it probably wasn’t.',
  },
  {
    id: 'mystic-mole',
    name: 'The Mystic Mole',
    role: 'Putters’ Guild · reads from below',
    portrait: 'caddy:mystic-mole',
    warden:
      'The Mystic Mole felt the seal take from four hundred feet down and wept, which nobody down there could see either. He has not surfaced since. He maintains the break is better below.',
    herald:
      'The Mystic Mole felt the Long Rest coming up through the soil three worlds early and dug the other way. He is still digging. He is the only one who never stopped.',
  },
];

/** The Coil — the cult that wanted every ball to come to rest forever. */
const COIL: readonly CastRow[] = [
  {
    id: 'venoma',
    name: 'Venoma “the Viper” Krait',
    role: 'The Coil’s prodigy · your rival',
    portrait: 'venoma',
    warden:
      'Venoma Krait was pulled out of the wreckage at the root still arguing. She plays the Outer Nine now under a name nobody checks, and has not cheated once since, which she finds completely unbearable.',
    herald:
      'Venoma Krait got everything she was ever promised. She has since discovered that finishing second-best in a universe with no golf left in it is a very particular sort of prize.',
  },
  {
    id: 'coil-ouros',
    name: 'Brother Ouros',
    role: 'The Whisperer',
    portrait: 'agent:coil-ouros',
    warden:
      'Brother Ouros was found at the root, unhurt, waiting politely to be arrested. He has since made the Offer to every guard on the transport. Two of them have asked for it in writing.',
    herald:
      'Brother Ouros got precisely what he had asked for, and went quiet along with everything else. He had spent a lifetime describing rest to other people. He had never once tried it himself.',
  },
  {
    id: 'coil-ecdysis',
    name: 'Sister Ecdysis',
    role: 'The Shedmaker',
    portrait: 'agent:coil-ecdysis',
    warden:
      'Sister Ecdysis vanished from the root with a forge and a single scale. The Wardens burn every shedding they find. They find more of them every year.',
    herald:
      'Sister Ecdysis forged one last relic in the dark after everything else had stopped, out of pure habit, with nobody left to sell it to. She wore it herself.',
  },
  {
    id: 'scorpius',
    name: 'Scorpius “the Silent Sting”',
    role: 'The hunter who never spoke',
    portrait: 'scorpius',
    warden:
      'Scorpius said nothing at his hearing, nothing at his sentencing, and nothing since. On the morning of the Reseal a small black card was found on the Mothership’s first tee, scratched in acid-green, in a hand nobody could match: “Well played.”',
    herald:
      'Scorpius watched the lights go out from somewhere high and alone, turning a small black card over and over between two fingers. It was blank. It had always been blank.',
  },
  {
    id: 'voss',
    name: 'Malachai “Sable” Voss',
    role: 'The Apostate · your dark mirror',
    portrait: 'voss',
    warden:
      'Malachai Voss lived. The whisper did not. He walks the same eighteen holes on a nothing little course every day of his life, alone, and has never once been able to make himself play the shot between 17 and 18.',
    herald:
      'Malachai Voss stood in the last of the light and, after forty years, finally could not hear anything at all. He had wanted that more than he had ever wanted anything. He tells the dark it was worth it. The dark does not answer.',
  },
];

/** The two prophets — the bird who foresees to save, and the bird who foresees to end. */
const PROPHETS: readonly CastRow[] = [
  {
    id: 'crow',
    name: 'The Carrion Prophet',
    role: 'The Crow · the Coil’s true master',
    portrait: 'crow',
    warden:
      'The Crow was not at the root. The Crow is never at the root. Somewhere out past the last chart a black bird is watching a door, and it has all the time there has ever been.',
    herald:
      'The Crow got exactly what it had designed, down to the final star — and then, for the first time in ten thousand years, had nothing left to foresee. It has not spoken since. It does not appear to be enjoying it.',
  },
  {
    id: 'prognostic-parrot',
    name: 'The Prognostic Parrot',
    role: 'Prophet of the Wardens · your mentor',
    portrait: 'caddy:prognostic-parrot',
    warden:
      'The Prognostic Parrot saw the Reseal coming and never once told you, because a shot you already know you will make is not a shot. He runs the Crow’s Nest still. Behind the bar hang one empty perch and one chart, marked for The Destination.',
    herald:
      'The Prognostic Parrot saw all of it, every branch of it, and came anyway. The last thing he ever did was try. His perch is empty now. So is everything else.',
  },
];

/** And the thing at the bottom of the world. Text-only — it was never going to sit for a portrait. */
const SERPENT: CastRow = {
  id: 'jormungandr',
  name: 'JÖRMUNGANDR',
  role: 'the World-Eater · as itself',
  portrait: '',
  warden: 'Sleeping. Dreaming, the Wardens like to think, of a fairway that goes on forever.',
  herald: 'Awake. Fed. And finally, terribly, at rest.',
};

// ── Building the roll ──────────────────────────────────────────────────────────────────────────────

/** The ending this campaign finished on. An undecided campaign reads as the Warden road (the default). */
export function creditsPath(story: StoryState | undefined): CreditPath {
  return story?.alignment === 'herald' ? 'herald' : 'warden';
}

/** Resolve an authored row onto one path. */
function card(row: CastRow, path: CreditPath): CreditCard {
  return { id: row.id, name: row.name, role: row.role, portrait: row.portrait, epilogue: row[path] };
}

/** A golfer's card — `role` says which of the six epilogues this campaign cast them in. */
function golferCard(id: string, path: CreditPath, role: 'hero' | 'a' | 'b'): CreditCard {
  const ch = getCharacter(id);
  const name = ch?.name ?? id;
  const rows = GOLFER_EPILOGUES[id];
  const epilogue =
    path === 'warden'
      ? role === 'hero'
        ? rows?.warden.hero
        : role === 'a'
          ? rows?.warden.loyal
          : rows?.warden.betrayer
      : role === 'hero'
        ? rows?.herald.hero
        : role === 'a'
          ? rows?.herald.foe
          : rows?.herald.severed;
  const label =
    role === 'hero'
      ? path === 'warden'
        ? 'Champion of the Fairway Wardens'
        : 'Herald of the Coil'
      : path === 'warden'
        ? role === 'a'
          ? 'Your friend, to the last'
          : 'The one who heard the whisper'
        : role === 'a'
          ? 'Who came for you at the Ark'
          : 'The friend you cut loose';
  return {
    id,
    name,
    role: label,
    portrait: `golfer:${id}`,
    epilogue: epilogue ?? golferFallback(name, path, role),
  };
}

/**
 * The whole roll, grouped, already resolved for this campaign's ending.
 *
 * Order builds the way a crawl should: the crew who carried the bag, then the friends who walked the
 * road with you, then the people who tried to stop you, then the two prophets, then the thing at the
 * bottom of the world — and YOU last, which is where a credits roll puts the lead.
 */
export function creditsRoll(story: StoryState | undefined): CreditSection[] {
  const path = creditsPath(story);
  const heroId = story?.characterId ?? '';
  // The friends' ROLES come from the campaign's own seams, never re-derived here (GS-one-description):
  // whoever the ending recap named as the one who ran is the one this roll writes the running card for.
  const others = story ? otherGolferIds(story) : [];
  const apart = story ? (path === 'warden' ? betrayerId(story) : heraldSeveredId(story)) : '';
  const friends = others.map((id) => golferCard(id, path, id === apart ? 'b' : 'a'));
  return [
    { title: 'The crew', cards: CREW.map((r) => card(r, path)) },
    { title: path === 'warden' ? 'Your friends' : 'The friends you left', cards: friends },
    { title: 'The Coil', cards: COIL.map((r) => card(r, path)) },
    { title: 'The prophets', cards: PROPHETS.map((r) => card(r, path)) },
    { title: 'And', cards: [card(SERPENT, path)] },
    { title: heroId ? 'And you' : 'The champion', cards: heroId ? [golferCard(heroId, path, 'hero')] : [] },
  ].filter((s) => s.cards.length > 0);
}

/** The line over the roll — what this ending actually was. */
export function creditsHeading(story: StoryState | undefined): { title: string; tag: string } {
  return creditsPath(story) === 'herald'
    ? { title: 'Ragnarök', tag: 'The Long Rest · what became of everyone' }
    : { title: 'The Reseal', tag: 'The universe is saved · what became of everyone' };
}
