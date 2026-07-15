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
