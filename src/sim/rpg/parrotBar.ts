/**
 * The Parrot Bar (GS-story-parrot-bar) — "The Crow's Nest", the Prognostic Parrot's cantina aboard the
 * Mothership, the Story-Tour hangout you tap between worlds for the captain's rotating chatter. The lines
 * are CONTENT-AS-DATA: a table of `ParrotBarLine` rows, each an optional `when` predicate over a snapshot
 * of the campaign (chapter / chosen path / Sigils won / whether the finale's beaten) plus the words. Pure
 * and DOM-free (the render/reducer layer picks and paints), so it adds ZERO sim rng and stays reachable
 * from `tests/parrot-bar.test.ts`.
 *
 * ADDING A LINE is a new row — pick a `kind` and (optionally) a `when` gate. `greeting` rows are the
 * opening line (exactly one shows, the first eligible); everything else is tap-through chatter, cycled in
 * table order. Keep the voice consistent with the Parrot elsewhere (`caddyArt.ts`, `lore.ts`, the hub
 * strip): a gruff, foresightful pirate captain, loyal to the Wardens, haunted by his spirit-brother, wary
 * of the Coil. The full story lives in `docs/decisions/story-mode.md`.
 */

/** The chosen path after The Choice (mirrors `StoryAlignment` in `story.ts`). */
export type ParrotBarAlignment = 'warden' | 'herald';

/** A pure snapshot of the campaign the bar chatter reads — no DOM, no rng. */
export interface ParrotBarContext {
  /** Campaign chapter, 1..5. */
  chapter: number;
  /** The chosen path after The Choice (Ch.4+), or undefined before it. */
  alignment?: ParrotBarAlignment;
  /** How many Sigils have been won (`trophyIds.length`). */
  sigils: number;
  /** Whether the Jörmungandr finale has been beaten (`StoryState.completed`). */
  completed: boolean;
}

/** One line the Parrot can say at the bar. */
export interface ParrotBarLine {
  /** Stable id (for tests + tracking). Never reused. */
  id: string;
  /** `greeting` = the opening line (exactly one, the first eligible); the rest are tap-through chatter. */
  kind: 'greeting' | 'lore' | 'coil' | 'hint' | 'path';
  /** Optional gate over the campaign snapshot — absent = always eligible. */
  when?: (c: ParrotBarContext) => boolean;
  /** Which barkeep speaks it (GS-story-herald-clubhouse). Default `parrot` (the Warden/undecided bar); a
   *  `crow` line only shows on the Herald path, where the Carrion Prophet has taken the roost. The two never
   *  mix, so each keeper's voice stays coherent. */
  speaker?: 'parrot' | 'crow';
  /** The spoken line. */
  text: string;
}

/**
 * The chatter table. Greetings first (mutually-exclusive gates so exactly one leads), then the rotating
 * chatter in the order it cycles. Order matters: `parrotBarLines` preserves it.
 */
export const PARROT_BAR_LINES: readonly ParrotBarLine[] = [
  // ── Greetings (exactly one shows — the first whose gate fires) ─────────────────────────────
  {
    id: 'greet-complete',
    kind: 'greeting',
    when: (c) => c.completed,
    text: "Well, if it isn't the golfer who put the world-serpent back to sleep. Pull up a stool. The galaxy owes you a round — first one's on me.",
  },
  {
    id: 'greet-early',
    kind: 'greeting',
    when: (c) => !c.completed && c.chapter <= 2,
    text: "Welcome to the Crow's Nest, champion. Best little bar this side of the Bifröst. Sit — the Tour can wait while your captain talks.",
  },
  {
    id: 'greet-mid',
    kind: 'greeting',
    when: (c) => !c.completed && c.chapter === 3,
    text: "Halfway to the key, and the drinks still taste of ozone and dread. Sit anyway. A captain should know his crew before the hard part.",
  },
  {
    id: 'greet-warden',
    kind: 'greeting',
    when: (c) => !c.completed && c.chapter >= 4 && c.alignment === 'warden',
    text: "A Warden walks into my bar. Good. I poured you the strong stuff — you'll need a steady hand for what's coming.",
  },
  {
    id: 'greet-herald',
    kind: 'greeting',
    speaker: 'crow',
    when: (c) => !c.completed && c.chapter >= 4 && c.alignment === 'herald',
    // GS-story-herald-clubhouse: the Parrot doesn't tend the Coil's bar — when you turn, the CROW takes the
    // roost. The Carrion Prophet greets his new Herald (his voice: calm, certain, patient as the grave).
    text: "The little green bird has flown, Herald. He could not stomach what you've become. I have no such weakness. Sit. The Crow keeps this nest now — and I have waited a very long time for you.",
  },
  {
    id: 'greet-choice',
    kind: 'greeting',
    when: (c) => !c.completed && c.chapter >= 4 && !c.alignment,
    text: "The whole galaxy's holding its breath for your choice, and here you are ordering a drink. …Honestly? Good instincts. Sit down.",
  },

  // ── Lore / who the Parrot is ──────────────────────────────────────────────────────────────
  {
    id: 'lore-foresight',
    kind: 'lore',
    text: "They call it foresight. I call it paying attention. Every hazard on every course leans a certain way before it bites — I just learned to read the lean. Cost me plenty to learn it.",
  },
  {
    id: 'lore-brother',
    kind: 'lore',
    text: "I had a spirit-brother once. Best long-haul trucker in the galaxy. His ship's a golf course now — a derelict on the Tour. I wasn't there when it mattered. I'm here now. That's the deal I made with myself.",
  },
  {
    id: 'lore-recruit',
    kind: 'lore',
    text: "You know why I recruited YOU off that World Tour win? Because you swung like someone who'd already seen the ball land. That's rarer than any Sigil, champion.",
  },
  {
    id: 'lore-nest',
    kind: 'lore',
    text: "Every bottle on that shelf is from a world we've played. The green one's swamp-still — don't. The gold one's from a course that no longer exists. We drink to it anyway.",
  },

  // ── The Coil threat (escalates with the chapters) ─────────────────────────────────────────
  {
    id: 'coil-stir',
    kind: 'coil',
    when: (c) => !c.completed && c.chapter >= 2,
    text: "You feel that hum in your teeth at the tee lately? That's the root stirring. The Coil wants Jörmungandr awake, and every Sigil you take is a lock they can't pick. So they'll come for the golfer holding the keys.",
  },
  {
    id: 'coil-venoma',
    kind: 'coil',
    when: (c) => !c.completed && c.chapter >= 3,
    text: "Venoma. The Viper. She'll smile and out-drive you and tell you the end of everything is a kind of peace. Don't argue with her — just beat her. The scoreboard's the only sermon she respects.",
  },
  {
    id: 'coil-apostate',
    kind: 'coil',
    when: (c) => !c.completed && c.chapter >= 3,
    text: "You met Voss out in the storm, then. The Apostate. He held this bag before you did — best there ever was, until the serpent got a claw into him. Don't hate him, champion. Fear what got him. It's the same voice that's whispering to you.",
  },
  {
    id: 'coil-final',
    kind: 'coil',
    when: (c) => !c.completed && c.sigils >= 5,
    text: "Five Sigils. The key's forged, champion. All that's between us and the serpent is one hull-shaking flight and a shot I'd rather not describe on a full stomach. Arm the ship. Then come find me.",
  },

  // ── Path-specific (after The Choice) ──────────────────────────────────────────────────────
  {
    id: 'path-warden',
    kind: 'path',
    when: (c) => !c.completed && c.alignment === 'warden',
    text: "A Warden reseals the world and asks nothing back. Boring, thankless, exactly right. Proud to fly for you, champion. Don't let it go to your head — heads are heavy on the follow-through.",
  },
  {
    id: 'path-herald',
    kind: 'path',
    speaker: 'crow',
    when: (c) => !c.completed && c.alignment === 'herald',
    // The Crow's voice — he wants the cage opened; every Sigil you carry brings the Long Rest closer.
    text: "A Herald does not reseal the world — a Herald ends the striving, and calls it mercy. Carry the Sigils to the root, and let the last ball come to rest. I will be perched at your shoulder when it does.",
  },

  // ── Gameplay hints (in the Parrot's voice) ────────────────────────────────────────────────
  {
    id: 'hint-locker',
    kind: 'hint',
    when: (c) => !c.completed && c.chapter <= 3,
    text: "Credits burning a hole in your bag? Spend 'em in the Locker before the next world. A wiser club in the hand beats a clever excuse on the card.",
  },
  {
    id: 'hint-ship',
    kind: 'hint',
    when: (c) => !c.completed && c.chapter >= 3,
    text: "That serpent won't be out-putted, champion — it'll be out-GUNNED. Get down to the Shipyard. Weapons breach the hull; engines and shields get us home. You'll want both before the end.",
  },
  {
    id: 'hint-revisit',
    kind: 'hint',
    when: (c) => !c.completed,
    text: "No shame in re-flying a world you've cleared to top up the purse. The galaxy always needs one more honest round, and the bar always needs restocking.",
  },
  {
    id: 'lore-afterglow',
    kind: 'lore',
    when: (c) => c.completed,
    text: "The hum's gone from your teeth, eh? Took me a week to trust the quiet. Now the Star Tour's yours — go chase records with nobody trying to end the universe for once. You earned that.",
  },

  // ══ THE CROW's roost (GS-story-herald-clubhouse) — the Coil bar. Only these show on the Herald path; the
  //    Parrot's lines above never do. Calm, certain, patient — the Carrion Prophet, not a cheerful captain. ══
  {
    id: 'crow-complete',
    kind: 'greeting',
    speaker: 'crow',
    when: (c) => c.completed,
    text: "It is done. The last ball has come to rest, and the striving is over. You gave the universe the mercy it could not ask for. Perch a while, Herald. There is nothing left to hurry toward.",
  },
  {
    id: 'crow-mercy',
    kind: 'lore',
    speaker: 'crow',
    text: "The Wardens will tell you the Coil is cruelty. It is the opposite. Every fairway ends in the same cup; we merely spare the world the exhausting pretense of the walk. That is all mercy has ever been.",
  },
  {
    id: 'crow-parrot',
    kind: 'lore',
    speaker: 'crow',
    text: "You wonder where the little green bird went. He flew off cawing about loyalty — as if loyalty ever kept a single ball from rolling to a stop. He was never your prophet, Herald. I have always been.",
  },
  {
    id: 'crow-serpent',
    kind: 'coil',
    speaker: 'crow',
    when: (c) => !c.completed && c.chapter >= 3,
    text: "Jörmungandr does not hunger, whatever the Wardens whisper. It rests. It dreams of a galaxy that has finally stopped trying. Bring it the Sigils and you do not wake a monster — you keep a promise.",
  },
  {
    id: 'crow-friends',
    kind: 'lore',
    speaker: 'crow',
    when: (c) => !c.completed && c.chapter >= 4,
    text: "Your old friends will line up against you at the majors — the trucker, the putter, all of them. Beat them. Not from spite. From kindness. They are simply the last few who haven't yet understood the quiet.",
  },
  {
    id: 'crow-arm',
    kind: 'hint',
    speaker: 'crow',
    when: (c) => !c.completed && c.chapter >= 3,
    text: "Down in the Shipyard they will sell you weapons to 'kill' the serpent. Buy them. Every gun that breaches that hull only widens the door. Arm well, Herald — the cage was always meant to open.",
  },
  {
    id: 'crow-final',
    kind: 'coil',
    speaker: 'crow',
    when: (c) => !c.completed && c.sigils >= 5,
    text: "Five Sigils. The key is forged and it is yours. One last flight to the root, one last shot into the dark — and the long, kind silence begins. I have waited eons for a hand steady enough. Do not keep me waiting.",
  },
];

/**
 * The eligible lines for this campaign state, in cycle order: the first eligible GREETING leads, then all
 * eligible chatter (lore / coil / path / hint) in table order. Always returns at least the greeting.
 */
export function parrotBarLines(c: ParrotBarContext): ParrotBarLine[] {
  // GS-story-herald-clubhouse: the Herald bar is the Crow's — show only `crow` lines there, only `parrot`
  // lines otherwise, so the barkeep's voice never mixes.
  const keeper: 'parrot' | 'crow' = c.alignment === 'herald' ? 'crow' : 'parrot';
  const eligible = PARROT_BAR_LINES.filter((l) => (l.speaker ?? 'parrot') === keeper && (!l.when || l.when(c)));
  const greet = eligible.find((l) => l.kind === 'greeting');
  const chatter = eligible.filter((l) => l.kind !== 'greeting');
  return greet ? [greet, ...chatter] : chatter;
}

/**
 * The line to show at tap-count `talk` (0 = the greeting, each tap advances one, wrapping). Pure — the
 * reducer holds a transient tap counter, so a bar visit cycles the captain's chatter deterministically.
 */
export function parrotBarLineAt(c: ParrotBarContext, talk: number): ParrotBarLine {
  const lines = parrotBarLines(c);
  const n = lines.length;
  const idx = ((talk % n) + n) % n; // safe modulo for any integer talk
  return lines[idx]!;
}
