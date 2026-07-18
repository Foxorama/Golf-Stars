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
    when: (c) => !c.completed && c.chapter >= 4 && c.alignment === 'herald',
    text: "So. You chose the Coil. I won't pretend it doesn't sting, champion. But a captain doesn't jump ship on his crew. Sit. Drink. I'm still here.",
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
    when: (c) => !c.completed && c.alignment === 'herald',
    text: "I've flown for saints and I've flown for pirates, and I'll fly for a Herald if that's the course you've charted. Just know: when your old friends line up against us, I'll still be at your shoulder. Somebody has to be.",
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
];

/**
 * The eligible lines for this campaign state, in cycle order: the first eligible GREETING leads, then all
 * eligible chatter (lore / coil / path / hint) in table order. Always returns at least the greeting.
 */
export function parrotBarLines(c: ParrotBarContext): ParrotBarLine[] {
  const greet = PARROT_BAR_LINES.find((l) => l.kind === 'greeting' && (!l.when || l.when(c)));
  const chatter = PARROT_BAR_LINES.filter((l) => l.kind !== 'greeting' && (!l.when || l.when(c)));
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
