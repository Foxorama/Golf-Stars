/**
 * The LORE system (GS-lore) — one-off story beats that fire when the run reaches a certain moment
 * (a world, a caddy, a faction standing, a depth …). Each beat is a DATA ROW: a pure `trigger`
 * predicate over a snapshot of the arrival, plus the presentation (banner, portrait, dialogue) the
 * render layer paints. The reducer decides WHEN (via `pickLoreEvent`) and records that it was seen
 * (in the persisted `seenLore` set); the sim never runs any of this, so lore adds ZERO rng draws and
 * every seeded run stays byte-identical.
 *
 * ADDING A LORE EVENT is a new row in `LORE_EVENTS` — a `trigger` (the conditions) + the words.
 * Nothing else changes: the gate, the screen, and the once-only tracking are all generic. Keep the
 * table pure (no DOM, no rng) so `tests/lore.test.ts` can prove each trigger fires exactly when it
 * should. The full story lives in `docs/decisions/lore.md`.
 */

import type { BiomeArchetype } from '../course/themes';
import type { ReputationByCharacter } from './factions';
import { CHARACTERS } from './characters';
import { betrayalDoubt, betrayalDistance, betrayalHeardTheWord } from './storyBetrayal';

/** The persisted set of one-off lore events already seen — id → true. A JSON-friendly "set" (JSON has
 *  no native Set), the house style for the `*ByCharacter` maps. Absent ids simply haven't fired yet. */
export type SeenLore = Record<string, true>;

/** One beat of a conversation. `say` is spoken dialogue; `action` is a stage direction (a gesture,
 *  a sigh) that the screen renders dimmer/italic rather than as speech. */
export interface LoreLine {
  kind: 'say' | 'action';
  text: string;
}

/**
 * The runtime facts a lore trigger reads — a pure snapshot of the stop the player just arrived at.
 * Deliberately broad so future events can gate on more than the world (a caddy, a golfer, the format,
 * how deep the run is, faction reputation). Extend this as new events need new inputs; every field is
 * read-only and side-effect-free.
 */
export interface LoreContext {
  /** The arriving course's biome id (e.g. `'derelict-ship'`). */
  biome: string;
  /** The resolved biome archetype (e.g. `'derelict'`) — the stable id to gate a "which world" trigger on. */
  archetype: BiomeArchetype;
  /** The hired named caddy id (`namedCaddyOwned`), or undefined — e.g. `'driver-dan'`. */
  caddyId?: string;
  /** The golfer on the bag. */
  characterId?: string;
  /** The run's format id (voyage / endless / strokeplay / …). */
  format: string;
  /** How deep into the run this stop is (0 = the first stop). */
  stopIndex: number;
  /** Per-character caddy-faction reputation (GS-caddy-factions) — for future faction-gated lore. */
  reputation?: ReputationByCharacter;
  /** GS-story-beats: this arrival is a STORY-TOUR round (a world clear or a Galaxy Tournament) — story
   *  dialogue beats gate on this so they NEVER fire in Voyage/Unending. Absent/false = not a story round. */
  storyRound?: boolean;
  /** GS-story-beats: the campaign chapter on arrival (1..5), for chapter-escalation beats. */
  storyChapter?: number;
  /** GS-story-beats: the chosen path after The Choice (`'warden'`/`'herald'`), for alignment-branched beats. */
  storyAlignment?: 'warden' | 'herald';
  /** GS-story-ragnarok: this story arrival is a GALAXY TOURNAMENT tee-off (a Sigil match), not a practice
   *  world round. The Chapter-1 opening omen gates on this so it fires at the Emerald Invitational (the Sigil
   *  moment) and leaves the early practice worlds teeing off clean (the GS-story-pacing feel). */
  storyTournament?: boolean;
  /** GS-story-doubt: WHO the betrayal arc says will turn (`betrayerId(story)` — the odd one out of the
   *  team-Sigil partner picks). Populated by the gate on every story-round arrival, but only MEANINGFUL
   *  from Chapter 4 on (both picks locked); the doubt beats gate on chapter + path so the fallback value
   *  of an early campaign never fires them. Lets a beat speak in the RIGHT friend's voice — the betrayer
   *  and the competition rival can be different characters at any given point. */
  storyBetrayerId?: string;
  /** GS-story-heard-the-word: WHY the betrayer is the odd one out (`betrayerOddness` — `sidelined` = never
   *  picked, `tempted` = trusted twice). Only meaningful once both team-Sigil picks are locked. The Herald
   *  "I heard the word too" confrontation gates on `tempted`, so it pays off exactly the friend the mid-round
   *  omen showed hearing the word. Absent until both picks lock. */
  storyBetrayerOddness?: 'sidelined' | 'tempted';
}

/**
 * A story beat. Presentation is pure DATA — the render layer maps `portrait` to a picture and paints
 * `title`/`kicker`/`lines`; the reducer only evaluates `trigger` and (for a `once` event) records the
 * id in `seenLore` so it never fires again.
 */
export interface LoreEvent {
  /** Stable id, never reused — the key stored in the persisted `seenLore` set. */
  id: string;
  /** Fire at most once ever (the default). Set `false` for a beat that may recur. */
  once?: boolean;
  /** Pure predicate over the arrival snapshot — no rng, no side effects. */
  trigger: (ctx: LoreContext) => boolean;
  /** The speaker's display name (shown under the banner). */
  speaker: string;
  /** Which portrait the render layer paints (`render/loreArt.ts` maps this id → SVG). */
  portrait: string;
  /** A short eyebrow/kicker over the title. */
  kicker?: string;
  /** The big banner headline. */
  title: string;
  /** The conversation, top to bottom. */
  lines: LoreLine[];
  /** The dismiss-button label. Defaults to "Continue". */
  cta?: string;
  /** Accent colour hint (hex) — the banner glow / rule. Falls back to a neutral gold. */
  accent?: string;
  /**
   * One-off REWARDS a beat grants when it's DISMISSED (GS-lore-rewards) — a beat can pay out, not just
   * speak. Applied ONCE (the beat is `once`, recorded in `seenLore`), by the reducer's `dismissLore`, so
   * it stays UI/render-only (zero sim rng — determinism/auto≡interactive untouched). Absent ⇒ a pure
   * dialogue beat, byte-for-byte the original. A new kind of reward is a new field here + one branch in
   * `dismissLore`, never an engine edit.
   */
  effects?: LoreEffects;
}

/** The one-off payouts a lore beat grants on dismiss (GS-lore-rewards). All optional; each maps to a
 *  single branch in the reducer's `dismissLore`. */
export interface LoreEffects {
  /** A cosmetic SHIP id added to the owned fleet (a secret grail, never sold — like the ace ship). */
  unlockShip?: string;
  /** Arm the Prognostic Parrot's FORESIGHT at 100% for the stop just arrived at (this stop only): the
   *  pirate captain, true to his word ("I always see the trouble coming"), foresees EVERY swing here. */
  parrotForesight?: boolean;
}

/**
 * The lore table. Ordered by priority — `pickLoreEvent` returns the FIRST match, so if two events
 * could ever fire on the same arrival the earlier row wins (none overlap today).
 */
export const LORE_EVENTS: readonly LoreEvent[] = [
  // GS-lore-driver-dan-derelict: Driver Dan recognises the wreck he's teeing off on. Fires the first
  // time a player arrives at the derelict ship in ANY mode with Driver Dan on the bag. The keystone of
  // a planned Driver Dan arc — later beats can gate on `seenLore['driver-dan-derelict']` being set.
  {
    id: 'driver-dan-derelict',
    trigger: (c) => c.archetype === 'derelict' && c.caddyId === 'driver-dan',
    speaker: 'Driver Dan',
    portrait: 'driver-dan',
    kicker: 'A memory stirs',
    title: 'The Old Girl',
    accent: '#e0883a',
    cta: 'Play your best →',
    lines: [
      {
        kind: 'say',
        text: "Ah… this old girl. It's been a long time since I last walked these corridors. We had a lot of good times together…",
      },
      {
        kind: 'say',
        text: "I'd heard she'd been converted — wasn't expecting her to be part of the Space Pro Golf Tour, though.",
      },
      { kind: 'action', text: 'Dan lets out a deep, sad sigh.' },
      {
        kind: 'say',
        text: "She deserved better than this. Although… I am glad she's not drifting out here all alone anymore.",
      },
      { kind: 'action', text: 'Dan gives you a steady look.' },
      { kind: 'say', text: 'Do her proud, will you? Play your best out here.' },
    ],
  },
  // GS-lore-parrot-firebird: the Prognostic Parrot recognises the wreck too — it was his spirit-brother's
  // long-haul ship, and his own great guilt. Fires the first time a player arrives at the derelict with
  // the Prognostic Parrot on the bag (any mode). A caddy is one-at-a-time, so this never collides with the
  // Driver-Dan beat above. Dismissing it PAYS OUT (`effects`): the secret mythic Firebird ship, and the
  // parrot's foresight at 100% for this haunted stop — "I always see the trouble coming."
  {
    id: 'prognostic-parrot-derelict',
    trigger: (c) => c.archetype === 'derelict' && c.caddyId === 'prognostic-parrot',
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'The blocker returns',
    title: 'One Last Job',
    accent: '#f2b53a',
    cta: 'I always see the trouble coming →',
    effects: { unlockShip: 'firebird', parrotForesight: true },
    lines: [
      {
        kind: 'say',
        text: 'I should have been here! I was his blocker. I was the one trusted to run interference. I could always see the trouble coming, and that made me the best…',
      },
      { kind: 'action', text: 'The parrot pauses, staring off into the dark between the stars.' },
      {
        kind: 'say',
        text: 'Karrina was right, though. My partner and our younglings came first — they were my priority, more important than one last job with my spirit-brother.',
      },
      { kind: 'action', text: "The parrot's shoulders, such as they are, slump." },
      {
        kind: 'say',
        text: "And what happened? I blamed them for his death. It wasn't their fault at all — but because I couldn't handle the guilt of not being here, I tore our family apart…",
      },
      {
        kind: 'say',
        text: 'And now the best long-haul truck in the galaxy is a junky golf course, and the best long-haul trucker to ever live died for nothing…',
      },
      { kind: 'action', text: "The parrot's eyes turn to steel." },
      {
        kind: 'say',
        text: "I won't let it happen again, though. Play your best — I always see the trouble coming.",
      },
    ],
  },

  // ── GS-story-beats: Story-Tour NPC dialogue, gated on the campaign (never fires in Voyage/Unending).
  // Escalation (GS-story-early-beats deepened the pre-Choice trunk — the player report: "basically nothing
  // happens till Sigil 3"): the Parrot teaches the true line (Ch.1) → names the Coil (Ch.2) → Venoma strides
  // in uninvited at the Forge (Ch.2 Sigil) → the course itself goes wrong (Ch.2) → Coilkeepers ring the tee
  // (Ch.3) → the Apostate shows himself (Ch.3) → after The Choice the Warden path runs the DOUBT thread (the
  // vow → the betrayer's strange question → their drifting — GS-story-doubt) while Venoma's confrontation
  // branches by path. Each fires ONCE, on a story-round arrival; order in this table IS the sequence.
  {
    id: 'story-true-line',
    trigger: (c) => c.storyRound === true && c.storyChapter === 1 && !c.storyTournament,
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'The first lesson',
    title: 'Feel the True Line',
    accent: '#7fe0a0',
    cta: 'Walk the fairway →',
    lines: [
      { kind: 'action', text: 'The Parrot rides your bag up the first fairway, one eye on your grip and the other on something much further away.' },
      { kind: 'say', text: 'Forget the leaderboard a moment. Feel for the line UNDER the line — the one the fairway wants. Every course has one true way through it, laid down when the world was made.' },
      { kind: 'say', text: "Walk it clean and hole out honest, and you'll feel the whole world breathe out. That's not poetry, champion. That's the job. That's why I pulled you off Earth." },
      { kind: 'say', text: "Play this one true. I'll tell you the rest when you've felt it for yourself." },
    ],
  },
  {
    id: 'story-coil-named',
    trigger: (c) => c.storyRound === true && c.storyChapter === 2 && !c.storyTournament,
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'A shadow over the tour',
    title: 'The Coil',
    accent: '#7fe0a0',
    cta: 'Tee off →',
    lines: [
      { kind: 'action', text: 'The Parrot drops onto your bag, lower than usual, voice quiet.' },
      { kind: 'say', text: "You've felt it too, haven't you? The galleries watching a beat too long. A ball that hisses." },
      { kind: 'say', text: "It's called the Coil — a cult that wants the world-serpent at Yggdrasil's root AWAKE. They think the end of everything is a kind of peace." },
      { kind: 'say', text: 'The Sigils you\'re winning are the only thing that can lock the root. So they will come for you. Win anyway.' },
    ],
  },
  // GS-story-early-beats: Venoma's DEBUT — the bible's Forge Masters beat ("an uninvited golfer strides
  // onto the tee"). Fires at the Chapter-2 Sigil tee-off, so the Viper's first appearance is a scene, not
  // just a name on the lobby card.
  {
    id: 'story-venoma-debut',
    trigger: (c) => c.storyRound === true && c.storyChapter === 2 && c.storyTournament === true,
    speaker: 'Venoma "the Viper" Krait',
    portrait: 'venoma',
    kicker: 'An uninvited entry',
    title: 'The Viper Strides In',
    accent: '#c98adf',
    cta: 'Meet her on the card →',
    lines: [
      { kind: 'action', text: 'The gallery parts. A golfer nobody invited walks the Forge tee like she owns the fire — and drops a ball that HISSES where it lands.' },
      { kind: 'say', text: "So you're the one keeping the lights on. The Coil sent their best to take this Sigil off you. That's me — in case the entrance was unclear." },
      { kind: 'say', text: 'Play your heart out, champion. I do so enjoy taking things from the hopeful.' },
      { kind: 'action', text: 'Somewhere in the gallery, hooded figures bow their heads to her — then turn, all at once, to look at you.' },
    ],
  },
  // GS-story-early-beats: the course itself goes WRONG — the bible's Ch.2 dread beat ("a hole goes wrong;
  // the deep rough moves"). The first hooded stranger speaks, a chapter before the Coilkeepers ring the tee.
  {
    id: 'story-rough-moved',
    trigger: (c) => c.storyRound === true && c.storyChapter === 2 && !c.storyTournament,
    speaker: 'A Hooded Stranger',
    portrait: 'coilkeeper',
    kicker: 'The course goes wrong',
    title: 'The Rough That Moved',
    accent: '#9b6cc0',
    cta: 'Tee off anyway →',
    lines: [
      { kind: 'action', text: 'Overnight the deep rough has crossed the fairway — fifty yards of it, moved like a tide — and not one groundskeeper will meet your eye.' },
      { kind: 'say', text: 'You noticed. Good. The Game notices you too, champion — the serpent turns in its sleep wherever you hole out.' },
      { kind: 'say', text: 'Keep winning, and the ground itself will start choosing sides. Ours already has.' },
      { kind: 'action', text: 'By the time you look back from the tee, the stranger is gone — and the rough is somehow closer.' },
    ],
  },
  {
    id: 'story-coilkeepers',
    trigger: (c) => c.storyRound === true && c.storyChapter === 3,
    speaker: 'A Coilkeeper',
    portrait: 'coilkeeper',
    kicker: 'They came to watch',
    title: 'Coilkeepers in the Gallery',
    accent: '#9b6cc0',
    cta: 'Ignore them →',
    lines: [
      { kind: 'action', text: 'Hooded figures ring the tee, unmoving, a serpent sigil on every chest.' },
      { kind: 'say', text: 'The seal weakens with every world you take, champion. You feel it. The stirring under the roots.' },
      { kind: 'say', text: 'It would be so much easier to stop swinging. To let it come. The Coil would welcome you — you, of all golfers.' },
      { kind: 'action', text: 'They do not blink. The wind moves everything on the course except them.' },
    ],
  },
  // GS-story-apostate: Malachai "Sable" Voss — the champion BEFORE you, who played a course perfectly true,
  // heard the serpent, and fell. He appears in Chapter 3 (the Storm Championship) not to beat you but to
  // SHOW you: he holes a shot no mortal should, then hands you the Wardens' secret and the Coil's argument.
  // He is the device that makes The Choice land. Placed AFTER `story-coilkeepers` so the gallery-dread beat
  // fires on the first Ch.3 arrival and the Apostate on a later one (both once, so they never collide).
  {
    id: 'story-apostate',
    trigger: (c) => c.storyRound === true && c.storyChapter === 3,
    speaker: 'Malachai "Sable" Voss',
    portrait: 'voss',
    kicker: 'The champion who fell',
    title: 'The Apostate',
    accent: '#8fbfa0',
    cta: "I'll be seeing you →",
    lines: [
      { kind: 'action', text: 'A gaunt man in a coat of shed scale steps onto the tee, unhurried. He was the World Tour champion before you. He heard the serpent, once, in the deep rough between 17 and 18. He never stopped hearing it.' },
      { kind: 'say', text: "They told you golf keeps the lights on. True enough. But they didn't tell you the other half: every course you play TRUE, you also bind. Re-consecration is a lock — and a cage. Order is just a prettier word for it." },
      { kind: 'action', text: 'He drops a ball, and without a practice swing holes it from a place no mortal should — the ball curving through the gale like it agreed to go.' },
      { kind: 'say', text: "I'm not here to beat you, champion. I'm here so that when the Coil makes their offer, you'll already know I'm right. The Long Rest isn't the end of the Game. It's mercy for everyone still trapped inside it." },
      { kind: 'action', text: 'He turns to go, the smile of a man wholly at peace. A bead of something dark drips from the head of his black driver.' },
    ],
  },
  // ── GS-story-doubt: the Warden-path Chapter-4 BETRAYAL FORESHADOW thread. The Choice is made, both
  // partner picks are locked, so `betrayerId` is settled — and the whisper starts working on that exact
  // friend, in their own voice, BEFORE the defection is revealed (the interlude after the Ch.4 major).
  // Sequence across the chapter's arrivals: the Parrot's vow (naming who's gone quiet) → the friend's
  // strange question → the friend drifting on the eve of the vigil. Per-character rows so the beat is
  // always the RIGHT golfer — the betrayer and the tournament rival can be different people.
  {
    id: 'story-warden-vow',
    trigger: (c) => c.storyRound === true && c.storyChapter === 4 && c.storyAlignment === 'warden' && !c.storyTournament,
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'After The Choice',
    title: 'The Vow',
    accent: '#54c8ff',
    cta: 'Hold the line →',
    lines: [
      { kind: 'action', text: 'The crew gathers on the flight deck as the ship turns for the deep sky. Nobody has mentioned the storm-world since you left it.' },
      { kind: 'say', text: "You chose the fairway, champion. I won't pretend I wasn't afraid — the Apostate's half-truths have swallowed better golfers than either of us." },
      { kind: 'say', text: 'The others took it hard, each in their own way. Keep an eye on {betrayer}, will you? Barely a word out of them since the storm — and quiet is how it starts.' },
      { kind: 'say', text: "Two Sigils left. We hold the line together — all of us. That's the vow." },
    ],
  },
  ...CHARACTERS.map(
    (ch): LoreEvent => ({
      id: `story-doubt-${ch.id}`,
      trigger: (c) =>
        c.storyRound === true && c.storyChapter === 4 && c.storyAlignment === 'warden' && c.storyBetrayerId === ch.id && !c.storyTournament,
      speaker: ch.shortName,
      portrait: `golfer:${ch.id}`,
      kicker: 'The whisper, working',
      title: `${ch.shortName} Asks a Strange Question`,
      accent: '#c98adf',
      cta: 'Say nothing →',
      lines: [...betrayalDoubt(ch.id)],
    }),
  ),
  ...CHARACTERS.map(
    (ch): LoreEvent => ({
      id: `story-distance-${ch.id}`,
      trigger: (c) => c.storyRound === true && c.storyChapter === 4 && c.storyAlignment === 'warden' && c.storyBetrayerId === ch.id,
      speaker: ch.shortName,
      portrait: `golfer:${ch.id}`,
      kicker: 'The eve of the vigil',
      title: `${ch.shortName}, Drifting`,
      accent: '#b060c0',
      cta: 'Watch them close →',
      lines: [...betrayalDistance(ch.id)],
    }),
  ),
  // GS-story-scorpius: the Chapter-4 Warden rival up close. The fourth Sigil used to pit you against Venoma a
  // SECOND time (she already plays the Ch.2 Forge) — a replay that read like a bug. The Coil, twice-failed
  // with the Viper, now sends its silent assassin: Scorpius, "the Silent Sting". He never speaks — his beat
  // is stage directions + one written card — and he twists the SAME {betrayer} knife the doubt thread carries,
  // wordlessly, which is worse. Fires on a Chapter-4 Warden arrival (the Viper's old slot); the Viper herself
  // returns at the Ch.5 shrine (below), so each Coil champion now owns a distinct chapter.
  {
    // Gated to the vigil tee-off (`storyTournament === true`) so this is your FIRST sighting of him, on
    // the tee where he actually waits — never a stray practice-world encounter that would make the major
    // read as a second meeting. The tournament intro screen sets the STAKES; this beat is the man himself.
    id: 'story-scorpius-warden',
    trigger: (c) => c.storyRound === true && c.storyChapter === 4 && c.storyAlignment === 'warden' && c.storyTournament === true,
    speaker: 'Scorpius, "the Silent Sting"',
    portrait: 'scorpius',
    kicker: 'The hunter, up close',
    title: 'The Silent Sting',
    accent: '#7fe0a0',
    cta: 'Give him nothing →',
    lines: [
      { kind: 'action', text: 'Up close he is smaller than the dread of him, and worse for it — no bulk, no swagger, just economy. A hunter pared down to only what kills. He does not look at the flag. He looks at your hands, at the set of your shoulders, at the place a nerve lives.' },
      { kind: 'action', text: 'Then, without hurry, he turns a small black card between two fingers and holds it up — just long enough to read. Scratched across it in a single acid-green line is one word. A name.' },
      { kind: 'say', text: '{betrayer}.' },
      { kind: 'action', text: 'He lets you feel it land. He has not come only for the Sigil, the card says; he has come for the crack already running through your crew — and he knows exactly whose. He pockets it, taps the stinger at his shoulder once, and tips it a hair past you, toward your own ship. Then he steps to his mark and waits.' },
    ],
  },
  // GS-story-scorpius: the Viper RETURNS at the Chapter-5 shrine, at the traitor's shoulder — her bookend on
  // the Warden path (she debuts at the Ch.2 Forge, vanishes while Scorpius hunts Ch.4, and comes back for the
  // finale). Retargeted from the old `>=4` gate to Ch.5 so it never overlaps Scorpius's chapter, and rewritten
  // for the shrine: the whisper has already found its door, and {betrayer} is standing in it.
  {
    id: 'story-venoma-warden',
    trigger: (c) => c.storyRound === true && (c.storyChapter ?? 0) >= 5 && c.storyAlignment === 'warden',
    speaker: 'Venoma "the Viper" Krait',
    portrait: 'venoma',
    kicker: 'The Viper returns',
    title: 'She Kept a Trophy',
    accent: '#c98adf',
    cta: 'We\'ll see →',
    lines: [
      { kind: 'action', text: 'She is waiting at the shrine, easy and unhurried, like she has all the time in the world now — and she does not stand alone.' },
      { kind: 'say', text: 'Scorpius couldn’t close it either? A pity. He’s such a tidy worker. But some doors you can’t force, champion — you have to be INVITED through. And I was.' },
      { kind: 'say', text: 'You should have watched your crew closer. I told you the Coil whispers through the open door. Well — {betrayer} answers to me now, and they’ll be standing at my shoulder when you tee it up. Wave hello.' },
      { kind: 'action', text: 'She tees a hissing ball and smiles at you like an old friend, wearing your grief like it was cut to fit her.' },
    ],
  },
  {
    id: 'story-venoma-herald',
    trigger: (c) => c.storyRound === true && (c.storyChapter ?? 0) >= 4 && c.storyAlignment === 'herald',
    speaker: 'Venoma "the Viper" Krait',
    portrait: 'venoma',
    kicker: 'One of us now',
    title: 'Welcome, Sister',
    accent: '#b060c0',
    cta: 'Coil and strike →',
    lines: [
      { kind: 'action', text: 'Venoma falls into step beside you, easy, like you\'ve always been on the same side.' },
      { kind: 'say', text: 'I knew it. The first time you out-drove me, I knew you had the Coil in you. Everyone does. Most just never admit it.' },
      { kind: 'say', text: 'The Wardens will send your old friends to stop us. Dan. Penelope. Look them in the eye and swing anyway — that\'s the whole of it.' },
      { kind: 'action', text: 'She flicks a hissing ball into the air and catches it without looking.' },
    ],
  },
  // GS-story-heard-the-word: the HERALD payoff of the TEMPTED mid-round omen. When you turned, the friend
  // you trusted most — who stood at the tee and heard the Coil's word BESIDE you (the tempted omen) — did
  // NOT turn. They resisted the same whisper, and now they come to stop you, heartbroken: "I heard the word
  // the same as you… how could you side with them?" Per-character rows, gated on the Herald path + the
  // tempted oddness + this exact friend, so it fires only when the omen planted the seed for them. Placed
  // after `story-venoma-herald` so the Viper's welcome lands first, then the friend's confrontation.
  ...CHARACTERS.map(
    (ch): LoreEvent => ({
      id: `story-heard-${ch.id}`,
      trigger: (c) =>
        c.storyRound === true &&
        (c.storyChapter ?? 0) >= 4 &&
        c.storyAlignment === 'herald' &&
        c.storyBetrayerOddness === 'tempted' &&
        c.storyBetrayerId === ch.id,
      speaker: ch.shortName,
      portrait: `golfer:${ch.id}`,
      kicker: 'The friend who heard it too',
      title: `${ch.shortName}: "I Heard It Too"`,
      accent: '#54c8ff',
      cta: 'Say nothing →',
      lines: [...betrayalHeardTheWord(ch.id)],
    }),
  ),

  // ── GS-story-ragnarok: the impending-RAGNARÖK escalation thread — one beat per Sigil chapter so EVERY
  // Sigil carries the stakes, not just Ch.3. It tracks the sigil-ceremony's waking serpent (chapter N = N−1
  // Sigils set = `wakefulness`): Ch.1 it only DREAMS, Ch.4 the eye half-opens, Ch.5 Ragnarök is at the door.
  // The back-half beats branch by path (Warden → the Prognostic Parrot; Herald → the Carrion Crow). Each
  // fires ONCE on a story-round arrival, and is placed AFTER the chapter's character beats so those lead and
  // the omen lands on a later arrival that chapter.
  {
    id: 'story-omen-emerald',
    trigger: (c) => c.storyRound === true && c.storyChapter === 1 && c.storyTournament === true,
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'The first tremor',
    title: 'Something Dreams Below',
    accent: '#4fe08a',
    cta: 'Keep the lights on →',
    lines: [
      { kind: 'action', text: 'The Parrot settles on your bag and stares off at the tree line, where a shadow sits that the twin suns cannot shift.' },
      { kind: 'say', text: "Feel that? Play a course TRUE — clean line, honest strike, holed out — and the whole world breathes a little easier. That click when the ball drops is creation agreeing to last one more day." },
      { kind: 'say', text: "There's a reason it matters NOW. Coiled at the root of the World-Tree sleeps the World-Eater — Jörmungandr. It has slept since the first tee-off. But it dreams, champion, and lately the dreams are getting loud." },
      { kind: 'action', text: "The shadow at the tree line has not moved once. Not with the wind. Not at all." },
      { kind: 'say', text: 'Win your Sigil here. Every one you take locks the root a little tighter. So let\'s keep the lights on, you and I.' },
    ],
  },
  {
    id: 'story-omen-abyss-warden',
    trigger: (c) => c.storyRound === true && c.storyChapter === 4 && c.storyAlignment === 'warden',
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'Three Sigils set',
    title: 'The Eye Half-Opens',
    accent: '#4f8ae0',
    cta: 'Two Sigils left →',
    lines: [
      { kind: 'action', text: "The Parrot's feathers are ruffled the wrong way, by a wind you cannot feel. Somewhere far below the star-map, in the dark under the roots, something enormous shifts its weight." },
      { kind: 'say', text: "Three Sigils in the Keystone now — and every time one clicks home, the thing at the root wakes a little MORE. I've SEEN it, champion. Its great eye is half-open, and it is beginning to look back." },
      { kind: 'say', text: "That's the Coil's whole trick: a champion collecting Sigils to LOCK the root looks an awful lot like one forging a key to OPEN it. They'll throw everything at you now to muddy which it is." },
      { kind: 'action', text: 'The Parrot fixes you with one hard, prophetic eye.' },
      { kind: 'say', text: "Two Sigils left. Take them clean — before the serpent's dream leaks all the way into the waking world. Before Ragnarök stops being a word in an old book." },
    ],
  },
  {
    id: 'story-omen-abyss-herald',
    trigger: (c) => c.storyRound === true && c.storyChapter === 4 && c.storyAlignment === 'herald',
    speaker: 'The Carrion Prophet',
    portrait: 'crow',
    kicker: 'Three Sigils set',
    title: 'The Eye Half-Opens',
    accent: '#b0e04f',
    cta: 'Two Sigils left →',
    lines: [
      { kind: 'action', text: 'The Crow rides a wind that is not there, unbothered. Far below the roots, something vast turns its weight over, and the dark itself seems to lean toward you.' },
      { kind: 'say', text: 'Three Sigils, Herald, and the great eye cracks open to watch its liberator work. It KNOWS you now. It is grateful — as grateful as a thing that size can be.' },
      { kind: 'say', text: 'The Wardens still believe you are forging a key to lock the root. Let them believe it. Two more Sigils and the key is yours — and every lock is also a door, if you turn it the other way.' },
      { kind: 'action', text: "The Crow's single burning eye never blinks." },
      { kind: 'say', text: "Ragnarök is not coming for the galaxy, Herald. You are carrying it to them. Caw. Go and take the next Sigil." },
    ],
  },
  {
    id: 'story-ragnarok-warden',
    trigger: (c) => c.storyRound === true && c.storyChapter === 5 && c.storyAlignment === 'warden',
    speaker: 'The Prognostic Parrot',
    portrait: 'prognostic-parrot',
    kicker: 'The seal is failing',
    title: 'Ragnarök at the Door',
    accent: '#7fe0a0',
    cta: 'One Sigil from the end →',
    lines: [
      { kind: 'action', text: 'The Parrot does not land on the bag this time. He hovers, eyes fixed on a sky that has begun to CRACK — thin dark seams spreading like a windscreen struck by a stone.' },
      { kind: 'say', text: "Four Sigils set, and the Keystone is nearly whole. But look UP. The serpent's eye is open now, all the way — and I can feel it looking back down the roots at us." },
      { kind: 'say', text: "This is it, champion. The old books have a word for what comes if it wakes fully: Ragnarök. Every ball, everywhere, coming to rest forever. The Coil calls it mercy. I call it the lights going out one star at a time." },
      { kind: 'say', text: 'One more Sigil forges the key — and then we go DOWN, to the root, to the thing itself. Play this one like the whole galaxy is watching you. Because it is.' },
    ],
  },
  {
    id: 'story-ragnarok-herald',
    trigger: (c) => c.storyRound === true && c.storyChapter === 5 && c.storyAlignment === 'herald',
    speaker: 'The Carrion Prophet',
    portrait: 'crow',
    kicker: 'The Long Rest is near',
    title: 'The Kindest Ending',
    accent: '#b0e04f',
    cta: 'One Sigil from the end →',
    lines: [
      { kind: 'action', text: 'The Crow watches you from a fencepost that was not there a moment ago, single eye burning, calm as a held breath.' },
      { kind: 'say', text: "Caw. Four Sigils, Herald. Do you feel how QUIET it is getting? That is the serpent, exhaling. We are so close now." },
      { kind: 'say', text: "They will tell you this is the end of everything. It is. But 'everything' has been so tired, for so long. One more Sigil forges the key — and you will open the root yourself, and let it all lie down." },
      { kind: 'action', text: 'The Crow tilts its bone-pale beak, almost tender.' },
      { kind: 'say', text: "Ragnarök. Such an ugly word for something so gentle. Come, Herald. Let us put the universe to bed." },
    ],
  },
];

/**
 * The first lore event whose `trigger` fires for this arrival and hasn't been seen (for a `once`
 * event). Pure — the reducer marks the returned event's id into `seenLore` when the player dismisses
 * the beat, so it won't be picked again. Returns undefined when nothing qualifies (the common path).
 */
export function pickLoreEvent(
  ctx: LoreContext,
  seen: Readonly<Record<string, boolean>>,
): LoreEvent | undefined {
  return LORE_EVENTS.find((e) => (e.once === false || !seen[e.id]) && e.trigger(ctx));
}

/** Look a lore event up by id — the render layer resolves `pendingLoreId` to its presentation. */
export function loreEventById(id: string | undefined): LoreEvent | undefined {
  if (!id) return undefined;
  return LORE_EVENTS.find((e) => e.id === id);
}

/**
 * GS-story-doubt: resolve the `{betrayer}` story token in a beat's text (pure). Beat rows are static data,
 * but WHO betrays is a per-campaign fact (`betrayerId`) — the render layer passes the resolved short-name
 * (`betrayerName(story)`), so the same row always names the right friend. Non-story surfaces pass nothing
 * and any stray token degrades to a generic read.
 */
export function resolveLoreTokens(text: string, betrayerShortName?: string): string {
  return text.replaceAll('{betrayer}', betrayerShortName ?? 'your friend');
}
