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
  // Escalation: the Parrot names the Coil (Ch.2) → Coilkeepers creep in (Ch.3) → Venoma confronts you after
  // The Choice (Ch.4), her line branching on your path. Each fires ONCE, on a story-round arrival.
  {
    id: 'story-coil-named',
    trigger: (c) => c.storyRound === true && c.storyChapter === 2,
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
  {
    id: 'story-venoma-warden',
    trigger: (c) => c.storyRound === true && (c.storyChapter ?? 0) >= 4 && c.storyAlignment === 'warden',
    speaker: 'Venoma "the Viper" Krait',
    portrait: 'venoma',
    kicker: 'The rival, up close',
    title: 'You Chose Wrong',
    accent: '#c98adf',
    cta: 'We\'ll see →',
    lines: [
      { kind: 'action', text: 'Venoma leans on her driver, smile all teeth, eyes not quite matching it.' },
      { kind: 'say', text: 'A Warden. To the end. How brave. How boring. You could have had the whole galaxy quiet and kind.' },
      { kind: 'action', text: 'For just a second, the smile slips — something underneath it that might be fear.' },
      { kind: 'say', text: "Don't look at me like that. I'm not the one who needs saving. …Am I. Just play, champion. Just play." },
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
