/**
 * Zone identity — content-as-data (GS-19). The lore/profile half of a stop's world, keyed by
 * BIOME ARCHETYPE (the 5 worlds a theme maps to). This is the prose + the at-a-glance hazard/
 * benefit/difficulty profile the per-hole briefing splash reads; the PHYSICS of a world live in
 * `biomes.ts`, the per-theme flavour in `themes.ts`, and the look in the render layer.
 *
 * Each zone is grounded in a real-space inspiration (the constellations/worlds it's drawn from),
 * then exaggerated into a signature golf mechanic so the five worlds FEEL distinct:
 *   • verdant — terraformed garden world: tree-lined parkland, gentle, the tutorial world.
 *   • desert  — Mars-like low-gravity dust belt: dunes, waste sand, the ball flies far.
 *   • frost   — frozen ring-world: glacier ice (slick), frozen ponds, savage crosswind.
 *   • inferno — volcanic ember world: RIVERS OF LAVA cross the fairway — a forced carry.
 *   • void    — near-vacuum target golf: miss the fairway and the ball is LOST TO THE VOID.
 *
 * Pure & DOM-free: no globals, no `Math.random`. The render layer keys the hero art + palette off
 * the archetype; this table is prose + profile only.
 */

import type { BiomeArchetype } from './themes';

/** A single profiled trait of a zone, with an emoji glyph for the at-a-glance card. */
export interface ZoneTrait {
  icon: string;
  text: string;
}

export interface ZoneProfile {
  archetype: BiomeArchetype;
  /** Display name for the world class (distinct from the per-stop theme name). */
  name: string;
  /** One-word/short signature mechanic — the thing that makes this world this world. */
  signature: string;
  /** The real-space inspiration the world is exaggerated from (one sentence). */
  inspiration: string;
  /** Two-to-three sentence flavour briefing for the splash card. */
  brief: string;
  /** What bites you here (penalties, spray, wind…). */
  hazards: ZoneTrait[];
  /** What helps you here (gravity, true surfaces, forgiveness…). */
  benefits: ZoneTrait[];
  /** Baseline difficulty rating 1 (gentle) .. 5 (brutal) — the world's character, not the stop. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export const ZONES: Record<BiomeArchetype, ZoneProfile> = {
  verdant: {
    archetype: 'verdant',
    name: 'Verdant Station',
    signature: 'Tree-lined parkland',
    inspiration:
      'Terraformed garden stations under temperate stars — the welcoming green of Crux, Lyra and Virgo.',
    brief:
      'A lush, earth-normal parkland world: the friendliest stop on the voyage. Tree-lined fairways and the odd pond frame wide, forgiving corridors — somewhere to find your swing before the galaxy turns wild.',
    hazards: [
      { icon: '🌲', text: 'Tree-lined rough — a sprayed ball must punch out' },
      { icon: '💧', text: 'Ponds flank the fairways (penalty)' },
      { icon: '🟡', text: 'Greenside & fairway bunkers' },
    ],
    benefits: [
      { icon: '🌍', text: 'Earth-normal gravity — clubs play true' },
      { icon: '🍃', text: 'Gentle breeze' },
      { icon: '↔️', text: 'Wide, forgiving fairways' },
    ],
    difficulty: 1,
  },
  desert: {
    archetype: 'desert',
    name: 'Dust Belt',
    signature: 'Dunes & waste sand',
    inspiration:
      'Mars-like dust worlds and the sand-dragged hulls of Argo — Vela, Carina and Puppis riding the dunes.',
    brief:
      'A low-gravity desert world of red dust and endless dunes. The thin air lets the ball fly far, but waste sand sprawls everywhere and the gusts are relentless — pick your line through the dunescape.',
    hazards: [
      { icon: '🏜️', text: 'Vast waste-sand fields choke the rough' },
      { icon: '🟡', text: 'Bunkers everywhere — a sandy world' },
      { icon: '🌬️', text: 'Strong, gusting crosswinds' },
    ],
    benefits: [
      { icon: '🪶', text: 'Low gravity — the ball carries far (+~22%)' },
      { icon: '🏃', text: 'Firm fairways run the ball out' },
      { icon: '↔️', text: 'Open, generous corridors' },
    ],
    difficulty: 2,
  },
  frost: {
    archetype: 'frost',
    name: 'Ice Ring',
    signature: 'Glacier ice & crosswind',
    inspiration:
      'Frozen ring-worlds and icy moons — the Crane wading frozen shallows, the cold blue knot of the Pleiades.',
    brief:
      'A frozen ring-world of glacier-blue ice and brutal crosswinds. Slick ice patches scatter the fairways — they spray a struck ball wildly — while frozen ponds wait for anything offline.',
    hazards: [
      { icon: '❄️', text: 'Slick ice patches — high dispersion, hard to control' },
      { icon: '💧', text: 'Frozen ponds (penalty)' },
      { icon: '🌬️', text: 'Savage crosswinds — the worst on the voyage' },
    ],
    benefits: [
      { icon: '🪶', text: 'Thin cold air carries a touch farther' },
      { icon: '💎', text: 'True crystal patches — fast and accurate' },
      { icon: '🎯', text: 'Calm holes reward a precise line' },
    ],
    difficulty: 3,
  },
  inferno: {
    archetype: 'inferno',
    name: 'Ember World',
    signature: 'Rivers of lava',
    inspiration:
      "Volcanic worlds and dying suns — Antares' red heart, the roiling furnace of Eta Carinae.",
    brief:
      'A volcanic ember world where rivers of molten lava run across the scorched basalt fairways. Each crossing is a forced carry — lay up short or fly it clean. The air is calm but heavy, so the ball flies a little shorter.',
    hazards: [
      { icon: '🌋', text: 'Lava rivers cross the fairway — a forced carry' },
      { icon: '🔥', text: 'Lava lakes flank the corridor (penalty)' },
      { icon: '🪨', text: 'Heavy air — the ball flies ~5% shorter' },
    ],
    benefits: [
      { icon: '🍃', text: 'Calm air — little wind to read' },
      { icon: '💎', text: 'True crystal lies near the greens' },
      { icon: '🎯', text: 'Generous landing zones between the rivers' },
    ],
    difficulty: 4,
  },
  void: {
    archetype: 'void',
    name: 'Void Garden',
    signature: 'Island fairways',
    inspiration:
      "The deep dark between the stars — the black hole at Sagittarius' heart, the Coalsack nebula's void-within-the-void.",
    brief:
      'Near-vacuum target golf over the abyss. There is no rough here — only the void. On the deepest, wildest stops, miss the fairway and the ball is lost to the void (stroke and distance). Almost no wind, and the lowest gravity in the galaxy: the ball flies forever.',
    hazards: [
      { icon: '🕳️', text: 'No rough — off the fairway is LOST (deep stops)' },
      { icon: '🌀', text: 'Antigrav pockets jitter the carry' },
      { icon: '🎯', text: 'Tight, island-like corridors' },
    ],
    benefits: [
      { icon: '🪶', text: 'Lowest gravity — the ball carries +~40%' },
      { icon: '🌌', text: 'Near-zero wind' },
      { icon: '💎', text: 'Crystal scatter — true, fast lies' },
    ],
    difficulty: 5,
  },
  crystal: {
    archetype: 'crystal',
    name: 'Prism Reach',
    signature: 'Fields of true crystal',
    inspiration: 'Jewelled worlds and prismatic clusters — the Northern Crown, the crystal wedge of Triangulum.',
    brief:
      'A glittering world paved in fast, true crystal. A clean strike runs dead straight off the glass, so precision is richly rewarded — but the angular spires lining the fairways punish a loose line.',
    hazards: [
      { icon: '💠', text: 'Crystal spires line the rough' },
      { icon: '🕳', text: 'Deep pot bunkers guard the greens' },
      { icon: '📐', text: 'Sharp, faceted greens — tricky targets' },
    ],
    benefits: [
      { icon: '💎', text: 'Fast, TRUE crystal lies everywhere — reward precision' },
      { icon: '🍃', text: 'Gentle, calm air' },
      { icon: '🎯', text: 'A clean strike runs straight and true' },
    ],
    difficulty: 3,
  },
  tempest: {
    archetype: 'tempest',
    name: 'Tempest Reach',
    signature: 'Gas-giant storms',
    inspiration: 'The screaming storms of the gas giants — the storm-dragon Draco, the stormwind Arrow of Sagitta.',
    brief:
      'A gas-giant world of perpetual, howling crosswinds — the wildest air in the galaxy. Read the gale right and the updraught will carry you far; read it wrong and the storm hurls your ball into the next county.',
    hazards: [
      { icon: '🌪️', text: 'The fiercest crosswinds anywhere — never calm' },
      { icon: '🌀', text: 'Gusts jostle the carry' },
      { icon: '🟡', text: 'Storm-scoured bunkers' },
    ],
    benefits: [
      { icon: '🪶', text: 'Updraught carries the ball a touch farther' },
      { icon: '↔️', text: 'Generous fairways to keep the gale fair' },
      { icon: '🎯', text: 'Master the wind and the world opens up' },
    ],
    difficulty: 4,
  },
  fungal: {
    archetype: 'fungal',
    name: 'Spore Jungle',
    signature: 'Bioluminescent jungle',
    inspiration: 'Glowing fungal worlds — the creeping Lizard of Lacerta, the prowling Fox of Vulpecula.',
    brief:
      'A dense, luminous spore-jungle. Towering glowing mushroom stands wall the tightest corridors on the voyage and jungle streams cut across the fairways — a sprayed ball is swallowed by the undergrowth and has to be hacked out.',
    hazards: [
      { icon: '🍄', text: 'The densest groves — tight, walled corridors' },
      { icon: '🌿', text: 'Thick glowing undergrowth (fescue)' },
      { icon: '💧', text: 'Jungle streams cross the fairway — a forced carry' },
    ],
    benefits: [
      { icon: '🌍', text: 'Earth-normal gravity — clubs play true' },
      { icon: '🍃', text: 'Sheltered under the canopy — little wind' },
      { icon: '🎯', text: 'Find the corridor and it scores' },
    ],
    difficulty: 3,
  },
  ocean: {
    archetype: 'ocean',
    name: 'Tidal Archipelago',
    signature: 'Island-hopping golf',
    inspiration: 'Ocean worlds and tidal seas — the breaching Dolphin of Delphinus, the great River Eridanus.',
    brief:
      'A scattered archipelago of fairway islands over a shimmering tidal sea. Sea channels cut across the holes as forced carries and lagoons flank every corridor — stray offline and the ball is wet. Beaches of bunker sand ring the isles.',
    hazards: [
      { icon: '🌊', text: 'Sea channels cross the fairway — a forced carry' },
      { icon: '💧', text: 'Lagoons flank every corridor (penalty)' },
      { icon: '🏖️', text: 'Beach bunkers everywhere' },
    ],
    benefits: [
      { icon: '↔️', text: 'Safe shelves between the water' },
      { icon: '🌬️', text: 'A steady sea-breeze to read' },
      { icon: '🎯', text: 'Pick the island line and commit' },
    ],
    difficulty: 4,
  },
};

export function zoneProfile(archetype: BiomeArchetype): ZoneProfile {
  return ZONES[archetype];
}

// --- Pro Shop staff (GS-proshop) --------------------------------------------
//
// Every world's Pro Shop is staffed by its OWN club pro — a named, archetype-flavoured character
// who greets you with a pithy line keyed by HOW WELL you played the section just before the shop.
// Pure content-as-data (no globals, no render): the view layer draws the avatar + bubble, the sim
// only picks the line. Because you only ever reach a shop AFTER beating the cut, the moods grade
// degrees of SUCCESS — from a nervy scrape-through to a stellar romp — never a failure.

/** How the player's last section graded out, used to pick the Pro's greeting. */
export type ProMood = 'scraped' | 'solid' | 'great' | 'stellar';

/**
 * A notable thing that happened in the section before the shop — the drama the Pro reacts to in
 * preference to the generic success grade. A standout shot (ace/eagle), a disaster (a blow-up hole),
 * or a hot streak (a flurry of birdies).
 */
export type ProEvent = 'ace' | 'eagle' | 'blowup' | 'birdieBlitz';

/** The minimal per-hole shape `sectionEvents` reasons over (a slice of the sim's PlayedHole). */
export interface HoleOutcome {
  par: number;
  strokes: number;
  pickedUp: boolean;
  holed: boolean;
}

export interface ShopPro {
  /** The pro's name. */
  name: string;
  /** A short role line under the name. */
  title: string;
  /** Pithy greetings keyed by how the section before the shop went (each ≥1 line). */
  quips: Record<ProMood, string[]>;
  /** Event-driven reactions (an ace, a blow-up…) preferred over the mood line when one fired. */
  reactions: Partial<Record<ProEvent, string[]>>;
}

export const PROS: Record<BiomeArchetype, ShopPro> = {
  verdant: {
    name: 'Birdie Bellamy',
    title: 'Verdant Station head pro',
    quips: {
      scraped: [
        'Squeaked past the cut, did we? The trees nearly kept your ball as a souvenir.',
        "A pass is a pass — barely. Let's get you some gear before the galaxy turns mean.",
        "I've seen sprinklers with better aim, but you made it. Welcome to the Pro Shop.",
      ],
      solid: [
        'Tidy section! The parkland was kind and so were you.',
        "Nice and steady — that's how you start a voyage.",
        'Solid stuff. Buy something shiny, you earned it.',
      ],
      great: [
        "Now THAT'S parkland golf! The birds are still applauding.",
        'Lovely. Absolutely lovely. Save some birdies for the rest of us.',
        'Great section — the fairways barely got dirty.',
      ],
      stellar: [
        "Are you sure you're not a pro yourself? Spectacular.",
        "I'm framing that scorecard. Pick anything — full price, mind.",
        'Flawless. The trees are filing a formal complaint.',
      ],
    },
    reactions: {
      ace: [
        'A hole-in-one?! On MY station? The trees will tell that one for years.',
        'An ACE! Drinks are on you, legend — well, full price, but still.',
      ],
      eagle: [
        'An eagle — soaring stuff! The parkland approves.',
        'Two under on one hole? Show-off. I love it.',
      ],
      blowup: [
        'One hole tried to eat you alive back there — even the squirrels winced. Shake it off.',
        'Ouch, that blow-up. Happens to everyone on the green stuff. Onward.',
      ],
      birdieBlitz: [
        'Birdies raining down out there — the whole flock is jealous.',
        'A flurry of birdies! Magnificent little run.',
      ],
    },
  },
  desert: {
    name: 'Sandy Dunes',
    title: 'Dust Belt sand-pro',
    quips: {
      scraped: [
        'Dug yourself outta that one by a single grain. Barely.',
        'The dunes nearly swallowed you whole. Grab some kit and toughen up.',
        'Scraped through? Out here that counts as a miracle.',
      ],
      solid: [
        "Kept it on the short grass — what little there is. Respectable.",
        "Solid desert golf. The sand didn't eat too many balls.",
        'Not bad for a dust-belt traveller. Now spend.',
      ],
      great: [
        "Threadin' the dunes like that? I'm impressed, and I don't impress.",
        "Now you're flyin' in this thin air. Great section.",
        "The sand barely touched you. That's pro work.",
      ],
      stellar: [
        'Forty years on these dunes and I rarely see a round like that.',
        'Stellar. Even the sandstorms stopped to watch.',
        'You made the desert look easy. It is NOT easy.',
      ],
    },
    reactions: {
      ace: [
        "A hole-in-one in THIS wind? I don't believe it. I love it.",
        "Ace! Forty years of sand and I'm still grinning.",
      ],
      eagle: [
        "An eagle out on the dunes? Now THAT'S desert golf.",
        'Two under in a sandstorm. Respect, traveller.',
      ],
      blowup: [
        'The desert buried you on one hole back there. It does that. Dust yourself off.',
        'One hole swallowed you whole. Happens to the best of us. Move on.',
      ],
      birdieBlitz: [
        'Birdie after birdie in the dust? Unheard of out here.',
        'A run of birdies in the waste? The dunes are speechless.',
      ],
    },
  },
  frost: {
    name: 'Hailey Frost',
    title: 'Ice Ring teaching pro',
    quips: {
      scraped: [
        'Ooh, chilly finish. You skated over that cut by a hair.',
        'The ice nearly claimed you. Bundle up — and buy a club.',
        'A pass, technically. The crosswind is laughing somewhere.',
      ],
      solid: [
        'Cool and controlled. The ice respects that.',
        'Solid on the slick stuff. Most just slide right off.',
        'Steady hands in a savage wind. Respectable.',
      ],
      great: [
        'Carved that section like a figure skater. Lovely.',
        'Great golf on glass. The ponds stayed hungry.',
        'You read that crosswind like a book. Impressive.',
      ],
      stellar: [
        "Ice-cold brilliance. I'm a little jealous, honestly.",
        "Stellar. The glacier's never seen anything like it.",
        'Flawless on the frost. Pick your prize, champion.',
      ],
    },
    reactions: {
      ace: [
        'A hole-in-one on the ice? Be still my frozen heart.',
        'An ACE in this crosswind. Genuinely, properly impressive.',
      ],
      eagle: [
        'An eagle on the glacier — ice cold and brilliant.',
        'Two under on one hole? The ponds are sulking.',
      ],
      blowup: [
        'The ice claimed one hole back there. Slippery business. Chin up.',
        "One blow-up on the frost — don't let it freeze you. Keep going.",
      ],
      birdieBlitz: [
        "Birdies all over the ice? You're on fire — figuratively.",
        'A flurry of birdies in the snow. Lovely to watch.',
      ],
    },
  },
  inferno: {
    name: 'Ember Stokes',
    title: 'Ember World fire-pro',
    quips: {
      scraped: [
        'You cleared the lava by a whisker — and a singed eyebrow.',
        'Barely survived the fire, eh? Gear up before it gets hotter.',
        "Scraped past the cut. The lava's still hoping you slip.",
      ],
      solid: [
        'Flew the rivers clean enough. Solid work in the heat.',
        'Kept your cool over the molten stuff. Respectable.',
        'Steady over the fire. Not bad at all.',
      ],
      great: [
        'Soared those lava rivers like a phoenix! Great stuff.',
        "The fire didn't lay a finger on you. Beautiful.",
        "Now that's how you golf in a furnace.",
      ],
      stellar: [
        'Blazing! The volcanoes are taking notes.',
        "Stellar round in the inferno. You're forged for this.",
        'Untouchable over the lava. Magnificent.',
      ],
    },
    reactions: {
      ace: [
        'A hole-in-one over LAVA?! You magnificent maniac.',
        'An ace in the inferno! The volcanoes salute you.',
      ],
      eagle: [
        'An eagle across the molten rivers — blazing stuff.',
        "Two under in the fire. You're forged for this.",
      ],
      blowup: [
        'The lava swallowed one whole back there. Brutal. Rise from the ashes.',
        'One hole went up in flames. Phoenix it — keep moving.',
      ],
      birdieBlitz: [
        "Birdies through the fire? You're unstoppable.",
        'A run of birdies in the furnace. Incredible.',
      ],
    },
  },
  void: {
    name: 'Orbit Vance',
    title: 'Void Garden island pro',
    quips: {
      scraped: [
        'The void nearly kept your ball forever. Close one.',
        'Floated past the cut by an atom. Buy something before the abyss notices.',
        'Barely held the islands. Space is patient, friend.',
      ],
      solid: [
        'Kept it on the floating greens. Solid in the dark.',
        'The void stayed empty of your golf balls. Respectable.',
        'Steady over the abyss. Most just panic.',
      ],
      great: [
        'Threaded the islands beautifully. The void went hungry.',
        'Great target golf out here in the nothing.',
        'You made the abyss look small. Impressive.',
      ],
      stellar: [
        'Transcendent. The black hole gave a little bow.',
        'Stellar — fitting, out here amongst the stars.',
        'Perfection over the void. The universe approves.',
      ],
    },
    reactions: {
      ace: [
        'A hole-in-one over the abyss? The universe just blinked.',
        'An ACE in the void. Statistically impossible. Beautiful.',
      ],
      eagle: [
        'An eagle across the islands — defying the dark.',
        'Two under over nothing at all. Sublime.',
      ],
      blowup: [
        "The void ate a whole hole back there. It's hungry out here. Onward.",
        'One hole vanished into the abyss. Let it go — literally.',
      ],
      birdieBlitz: [
        'Birdies in the emptiness? You bend space itself.',
        'A constellation of birdies. Fitting, out here.',
      ],
    },
  },
  crystal: {
    name: 'Facet Vey',
    title: 'Prism Reach crystal-pro',
    quips: {
      scraped: [
        'Scraped through on the glass — the crystal nearly cut you to pieces.',
        'A pass, by a hair. The spires are still polishing themselves smug.',
        'Survived the prism. Barely. Buy something shiny to match the décor.',
      ],
      solid: [
        'Struck it true off the crystal. Solid, clean golf.',
        'Nice and precise — the way this world likes it.',
        'Tidy work on the glass. Respectable.',
      ],
      great: [
        'Pure striking out there! The crystal sang every time.',
        'Great precision — you played the facets like a jeweller.',
        'Lovely. The spires barely got a look at your ball.',
      ],
      stellar: [
        'Flawless on the glass. The whole world is reflecting your brilliance.',
        'Stellar — diamond-sharp golf. Pick a prize, it’s all sparkling.',
        'Untouchable precision. The crystal is genuinely jealous.',
      ],
    },
    reactions: {
      ace: ['A hole-in-one on the prism world?! The facets are dazzled.', 'An ACE! Cut clean as a diamond.'],
      eagle: ['An eagle off the crystal — pure, sharp brilliance.', 'Two under on the glass. Jewel-perfect.'],
      blowup: ['One hole shattered on you back there. The spires bite. Reset.', 'A blow-up on the glass — happens. Polish it off.'],
      birdieBlitz: ['Birdies sparkling all over the crystal — dazzling run.', 'A flurry of birdies, bright as the facets. Lovely.'],
    },
  },
  tempest: {
    name: 'Gale Maddox',
    title: 'Tempest Reach storm-pro',
    quips: {
      scraped: [
        'The gale nearly blew you off the planet. Scraped through, though.',
        'Squeaked past in that wind? You’re either brave or lucky. Maybe both.',
        'A pass — the storm’s still laughing. Gear up before it really blows.',
      ],
      solid: [
        'Held your line in that wind. Solid storm golf.',
        'Read the gale well enough. Respectable in this chaos.',
        'Steady hands in a hurricane. Not bad at all.',
      ],
      great: [
        'You flew the storm like you owned it! Great section.',
        'Carved the gale beautifully — the wind couldn’t touch you.',
        'Now THAT’S how you golf in a hurricane.',
      ],
      stellar: [
        'Untouchable in the teeth of the gale. Magnificent.',
        'Stellar — you made a screaming storm look like a calm morning.',
        'Flawless in that wind. The tempest bows to you.',
      ],
    },
    reactions: {
      ace: ['A hole-in-one in THIS gale?! Impossible. Glorious.', 'An ACE through the storm. I don’t believe my eyes.'],
      eagle: ['An eagle into a hurricane — fearless stuff.', 'Two under in this wind? Astonishing.'],
      blowup: ['The storm ate one hole whole. It does that. Lean into the wind.', 'One gust too many on that hole. Shake it off.'],
      birdieBlitz: ['Birdies in a gale? You’re bending the wind itself.', 'A run of birdies through the storm — incredible.'],
    },
  },
  fungal: {
    name: 'Spore Greene',
    title: 'Spore Jungle green-pro',
    quips: {
      scraped: [
        'The jungle nearly kept your ball as compost. Close one.',
        'Hacked through by a whisker. The undergrowth is still hungry.',
        'A pass — barely. The mushrooms are taking notes.',
      ],
      solid: [
        'Found the corridor often enough. Solid jungle golf.',
        'Kept it out of the glowing stuff, mostly. Respectable.',
        'Steady threading through the groves. Not bad.',
      ],
      great: [
        'Threaded the jungle beautifully! The spores never touched you.',
        'Great golf in the green dark — the groves are impressed.',
        'You found gaps that weren’t even there. Lovely.',
      ],
      stellar: [
        'Untouchable in the jungle. The whole canopy is glowing for you.',
        'Stellar — you danced through the densest world on the voyage.',
        'Flawless among the spores. Magnificent.',
      ],
    },
    reactions: {
      ace: ['A hole-in-one through the jungle?! The mushrooms are speechless.', 'An ACE in the green dark. Luminous.'],
      eagle: ['An eagle through the groves — brilliant threading.', 'Two under in the jungle. Show-off. I love it.'],
      blowup: ['The undergrowth swallowed one hole back there. It happens. Onward.', 'One blow-up in the green — don’t let it take root.'],
      birdieBlitz: ['Birdies blooming everywhere — the jungle approves.', 'A flurry of birdies in the spores. Glowing stuff.'],
    },
  },
  ocean: {
    name: 'Marina Quay',
    title: 'Tidal Archipelago island-pro',
    quips: {
      scraped: [
        'The sea nearly swallowed you whole. Scraped onto the last island.',
        'Squeaked across the channels by a hair. The lagoons are still thirsty.',
        'A pass — barely dry. Buy something before the tide turns.',
      ],
      solid: [
        'Found the islands often enough. Solid sea golf.',
        'Kept it dry, mostly. Respectable in this tide.',
        'Steady hopping island to island. Not bad at all.',
      ],
      great: [
        'Island-hopped like a dolphin! Great section.',
        'Carried the channels clean — the sea went hungry.',
        'You picked every line and committed. Beautiful.',
      ],
      stellar: [
        'Bone-dry brilliance across the whole archipelago. Magnificent.',
        'Stellar — you made the sea look like a pond.',
        'Flawless over the water. The tide bows to you.',
      ],
    },
    reactions: {
      ace: ['A hole-in-one over the SEA?! The dolphins are applauding.', 'An ACE across the channel. Bone-dry and brilliant.'],
      eagle: ['An eagle over the water — fearless carries.', 'Two under across the islands. Sublime.'],
      blowup: ['The sea ate one whole back there. It’s hungry out here. Dry off and go.', 'One splash too many on that hole. Let the tide take it.'],
      birdieBlitz: ['Birdies all over the archipelago — riding the tide.', 'A run of birdies across the sea. Lovely to watch.'],
    },
  },
};

/** The Pro who staffs a given world's shop. */
export function shopPro(archetype: BiomeArchetype): ShopPro {
  return PROS[archetype];
}

/**
 * Grade the section before the shop from its Stableford vs the cut it had to clear. You only reach
 * a shop after PASSING, so this grades degrees of success: a nervy scrape (just over the bar) up to
 * a stellar romp. Ratio-based so it stays meaningful as the cut ramps with galaxy distance.
 */
export function proMood(stableford: number, cut: number): ProMood {
  const r = stableford / Math.max(1, cut);
  if (r < 1.25) return 'scraped';
  if (r < 1.7) return 'solid';
  if (r < 2.2) return 'great';
  return 'stellar';
}

/** Pick a deterministic line from a non-empty list by a salt (e.g. the stop index). */
function pickLine(lines: readonly string[], salt: number): string {
  const i = ((Math.trunc(salt) % lines.length) + lines.length) % lines.length;
  return lines[i]!;
}

/** Pick one of the Pro's mood lines, deterministically from a salt (e.g. the stop index). */
export function proQuip(pro: ShopPro, mood: ProMood, salt: number): string {
  return pickLine(pro.quips[mood], salt);
}

/** When several events fire, the Pro reacts to the most striking first. */
export const PRO_EVENT_PRIORITY: readonly ProEvent[] = ['ace', 'eagle', 'blowup', 'birdieBlitz'];

/**
 * Detect the notable events in a section (the per-hole outcomes). An ace (holed in one), an eagle or
 * better (≥2 under), a blow-up (a picked-up hole or ≥4 over par), and a birdie blitz (≥3 birdies).
 * Pure — reasons over the minimal `HoleOutcome` shape, so it never imports the sim's heavy types.
 */
export function sectionEvents(holes: readonly HoleOutcome[]): ProEvent[] {
  let ace = false;
  let eagle = false;
  let blowup = false;
  let birdies = 0;
  for (const h of holes) {
    const over = h.strokes - h.par;
    if (h.holed && h.strokes === 1) ace = true;
    if (over <= -2) eagle = true;
    if (over === -1) birdies++;
    if (h.pickedUp || over >= 4) blowup = true;
  }
  return PRO_EVENT_PRIORITY.filter((e) =>
    e === 'ace' ? ace : e === 'eagle' ? eagle : e === 'blowup' ? blowup : birdies >= 3,
  );
}

/**
 * The Pro's greeting line: react to the most striking EVENT the section produced (an ace, a blow-up…)
 * if the Pro has a line for it, otherwise fall back to the success-grade MOOD line. Deterministic
 * from the salt (e.g. the stop index), so a given section always greets the same way.
 */
export function proLine(pro: ShopPro, mood: ProMood, events: readonly ProEvent[], salt: number): string {
  for (const e of PRO_EVENT_PRIORITY) {
    const lines = pro.reactions[e];
    if (lines && lines.length && events.includes(e)) return pickLine(lines, salt);
  }
  return proQuip(pro, mood, salt);
}

/** Difficulty as filled/empty pips (e.g. ●●●○○ for 3) for a compact card display. */
export function difficultyPips(d: number): string {
  const n = Math.max(0, Math.min(5, Math.round(d)));
  return '●'.repeat(n) + '○'.repeat(5 - n);
}
