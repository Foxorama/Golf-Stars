/**
 * The HERALD (Coil) crew (GS-story-herald-clubhouse) — the "alternative allies" a player who takes the dark
 * path at The Choice gathers instead of the Warden caddies. Where the Warden clubhouse fills with the named
 * caddies you recruit, the Herald's Mothership fills with the Coil's inner circle: your mentor the Apostate,
 * your lieutenant the Viper, the Whisperer who recruited you, and the Shedmaker who forges the cursed relics
 * (per `docs/decisions/story-bible.md` — the Coil roster). Content-as-data + gated on `alignment === 'herald'`.
 *
 * These are clubhouse NPCs, NOT caddies (they carry no bag, touch no `caddyEffects`/faction coverage table) —
 * a deliberately isolated seam, so the Warden caddy system is entirely untouched. Pure + deterministic (no
 * rng, no DOM); the screen renders them as standees + a talk card exactly like the Warden crew.
 */

import type { StoryState } from './story';
import type { PlayerLoadout } from './economy';

export type HeraldPortrait = 'voss' | 'venoma' | 'coilkeeper';

export interface HeraldAgent {
  id: string;
  name: string;
  /** The one-word name the game speaks them by (a partner chip, a scramble card, a draw sheet) — the
   *  `Character.shortName` twin, so a Coil agent reads exactly like a tour-mate wherever a partner is
   *  named (GS-story-coil-partners). */
  shortName: string;
  title: string;
  /** Which existing lore portrait bust to draw (all in the Coil palette). */
  portrait: HeraldPortrait;
  /** Optional CSS filter to differentiate two agents that share a portrait (the two hooded cultists). */
  tint?: string;
  /** Rotating banter lines (tap to cycle), Coil-flavoured. */
  lines: string[];
}

/** The Coil faction shown on every Herald agent's talk card (the cult, not a Warden caddy faction). */
export const COIL_FACTION_NAME = 'The Coil';
export const COIL_FACTION_BLURB =
  'The snake cult that worships the World-Eater and works to wake it — calm, courteous, and utterly certain that the kindest mercy is to let every ball come to rest forever.';

/** The Coil inner circle — your crew once you become a Herald. Order = the clubhouse standee order. */
export const HERALD_CREW: readonly HeraldAgent[] = [
  {
    id: 'coil-voss',
    name: 'Malachai "Sable" Voss',
    shortName: 'Voss',
    title: 'The Apostate · your mentor',
    portrait: 'voss',
    lines: [
      '"You feel it now, don\'t you? The quiet under the roar of the gallery. I felt it too, once, on Earth — the day I stopped striving and started to see."',
      '"The Wardens call it a fall. I call it waking. Every fairway ends, champion. We are only kind enough to say so."',
      '"When the serpent stirs, do not flinch. You were always meant to stand at its head — not against it."',
    ],
  },
  {
    id: 'coil-venoma',
    name: 'Venoma "the Viper" Krait',
    shortName: 'Venoma',
    title: 'The Viper · your lieutenant',
    portrait: 'venoma',
    lines: [
      '"So the golden child came over to the shade after all. Good. I was tired of trying to beat you — far better to swing beside you."',
      '"Point me at whoever you like. Old friend, old rival. On this bag, I don\'t miss."',
      '"They\'ll say you betrayed them. Let them. Betrayal is just loyalty that finally saw clearly."',
    ],
  },
  {
    id: 'coil-ouros',
    name: 'Brother Ouros',
    shortName: 'Ouros',
    title: 'The Whisperer',
    portrait: 'coilkeeper',
    tint: 'hue-rotate(-40deg) saturate(1.1)',
    lines: [
      '"I made you the Offer at the crossroads, and you took my hand. I do not gloat. I only… welcome."',
      '"Every soul the Coil keeps was once someone\'s hope. You are no different, and no lesser."',
      '"The Long Rest is not the end of the Game. It is the Game, finished — the only shot that never rolls away."',
    ],
  },
  {
    id: 'coil-ecdysis',
    name: 'Sister Ecdysis',
    shortName: 'Ecdysis',
    title: 'The Shedmaker',
    portrait: 'coilkeeper',
    tint: 'hue-rotate(60deg) saturate(1.2) brightness(1.05)',
    lines: [
      '"Bring me scale shed from the World-Eater and I will grow you a gift — power with a price, as all true things carry."',
      '"A shedding never lies about its curse. That is more than your Warden friends ever gave you."',
      '"Wear what I forge and you wear a little of the serpent. Do not be afraid. It is only becoming what you already are."',
    ],
  },
];

const BY_ID: Record<string, HeraldAgent> = Object.fromEntries(HERALD_CREW.map((a) => [a.id, a]));

/**
 * GS-story-quality: the Coil inner circle VOLUNTEER as your caddies once you turn Herald — replacing the
 * Warden friends who desert you (you can't hire the Warden caddies any more, so the Coil makes up the loss).
 * Each folds a thematic `PlayerLoadout` effect (the `applyStoryCaddy` sibling, reusing existing fields), with
 * a short player-facing label for the locker card. Venoma ("on this bag I don't miss") is the default bag.
 */
export interface HeraldCaddyEffect {
  label: string;
  apply: (m: PlayerLoadout) => PlayerLoadout;
}
export const HERALD_CADDY_EFFECTS: Record<string, HeraldCaddyEffect> = {
  'coil-venoma': {
    label: 'The Viper never misses — tighter dispersion, and the wind bends for her',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.8, windResist: (m.windResist ?? 0) + 0.15 }),
  },
  'coil-voss': {
    label: 'The Apostate’s black driver — a raised distance floor from anywhere',
    apply: (m) => ({ ...m, driverAnywhere: true, minCarryBoost: m.minCarryBoost + 0.08 }),
  },
  'coil-ouros': {
    label: 'The Whisperer reads the green like scripture — putt boost + a longer read',
    apply: (m) => ({ ...m, puttBoost: m.puttBoost + 0.18, puttReadBonus: (m.puttReadBonus ?? 0) + 10, greenRead: true }),
  },
  'coil-ecdysis': {
    label: 'Serpent-scale relief — play clean from any lie',
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.5) }),
  },
};

/** The Coil volunteers' ids (the Herald caddy roster). */
export const HERALD_CADDY_IDS: readonly string[] = HERALD_CREW.map((a) => a.id);
/** Which volunteer carries the bag by default when you turn Herald — the Viper. */
export const HERALD_DEFAULT_CADDY = 'coil-venoma';

/** A Coil agent's caddy effect (undefined if not a herald agent). */
export function heraldCaddyEffect(id: string | undefined): HeraldCaddyEffect | undefined {
  return id ? HERALD_CADDY_EFFECTS[id] : undefined;
}

/** GS-story-quality: swap the caddy roster when the player turns Herald — the Warden friends they betrayed
 *  DESERT them (cleared from the roster), and the Coil inner circle VOLUNTEER in their place (free), Venoma
 *  on the bag by default. Pure; a no-op if not on the Herald path or already swapped. */
export function applyHeraldCaddies(story: StoryState): StoryState {
  if (story.alignment !== 'herald') return story;
  // Already the Coil roster (any subset of the volunteers, no Warden leftovers)? Then respect the player's
  // active choice (they may have benched or switched volunteers) — only the FIRST swap forces Venoma.
  const rosterIsCoil =
    story.hiredCaddyIds.length > 0 && story.hiredCaddyIds.every((id) => HERALD_CADDY_IDS.includes(id));
  if (rosterIsCoil) return story;
  return {
    ...story,
    hiredCaddyIds: [...HERALD_CADDY_IDS], // Warden caddies leave; the Coil takes the bag
    activeCaddyId: HERALD_DEFAULT_CADDY,
  };
}

/** Is this id one of the Coil agents (so the clubhouse/inspect can branch off the caddy roster)? */
export function isHeraldAgent(id: string | undefined): boolean {
  return !!id && id in BY_ID;
}

/** Look up a Coil agent by id. */
export function heraldAgent(id: string): HeraldAgent | undefined {
  return BY_ID[id];
}

/** The Herald crew to show in the clubhouse — the full Coil circle once you've chosen the dark path,
 *  otherwise none (Warden / undecided clubhouses show the caddy crew instead). */
export function heraldCrew(story: StoryState): readonly HeraldAgent[] {
  return story.alignment === 'herald' ? HERALD_CREW : [];
}

/** The banter line for a Coil agent at tap-count `n` (cycles), the Parrot-bar/ally-talk pattern. */
export function heraldAgentLineAt(id: string, n: number): string {
  const a = BY_ID[id];
  if (!a || a.lines.length === 0) return '';
  return a.lines[((n % a.lines.length) + a.lines.length) % a.lines.length]!;
}
