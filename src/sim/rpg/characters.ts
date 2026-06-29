/**
 * Playable golfers (GS-18) — the character-select roster.
 *
 * Each golfer is CONTENT AS DATA: a starting-loadout tweak (bag/handicap/dispersion) plus a pure
 * per-club shot-shape function (`ClubShotMods` keyed by a club's nominal carry). The shape function
 * is the new lever — it lets a golfer hook the long clubs but stripe the irons, fade everything a
 * touch, or back-spin the wedges, in a way a single scalar dispersion multiplier never could.
 *
 * Pure & headless: nothing here touches the DOM. The `style` block is render-only metadata (colours
 * the play-view golfer + the select-screen card read); the sim never looks at it — exactly like the
 * biome physics-vs-palette split. A new golfer is a new row.
 *
 * Balance philosophy (CLAUDE.md): every golfer keeps the SAME base handicap, so none is flatly
 * better — they trade a clear strength for a clear weakness and PLAY differently. `tests/
 * characters.test.ts` guards that each stays viable (no death-spiral) and they cluster within a
 * tolerance band of mean per-stop Stableford, while still differing measurably in shape/distance.
 */

import { boostDistanceClubs, type PlayerLoadout } from './economy';
import { CLUBS, clubById, type Club } from '../clubs';
import type { ClubShotMods, ShotMods } from '../round';

/** Render-only visual identity for a golfer (cap/skin/shirt + a build scale). */
export interface GolferStyle {
  /** Cap + shirt accent colour. */
  cap: string;
  /** Shirt/torso colour. */
  shirt: string;
  /** Skin tone. */
  skin: string;
  /** Figure size scale (1 = default); a bigger hitter stands a touch taller. */
  build: number;
}

/**
 * Render-only stat ratings for the select card (GS-18, like `style` — the sim never reads these).
 * A 0–5 visual summary of how a golfer PLAYS, drawn as bars on the flashy character-select cards.
 * These mirror the prose blurb/pros/cons; they're flavour, not a sim input.
 */
export interface GolferStats {
  /** Raw distance off the tee. */
  power: number;
  /** Line control — how often it starts on target. */
  accuracy: number;
  /** Short game / scoring touch around the green. */
  touch: number;
  /** Shot-to-shot repeatability (the tail). */
  consistency: number;
}

export interface Character {
  id: string;
  name: string;
  /** The golfer's given name — used for the "Voyage as …" CTA (NOT always the first word of `name`:
   *  Longshot Larry → "Larry", Backspin Bo → "Bo"). */
  shortName: string;
  /** Where they hail from — flavour shown on the select card. */
  origin: string;
  /** Their pronoun/identity line (flavour). */
  identity: string;
  /** One-line pitch of how they play. */
  blurb: string;
  /** Short pro / con tags for the select card. */
  pros: string[];
  cons: string[];
  /** Render-only look (the sim ignores this). */
  style: GolferStyle;
  /** Render-only 0–5 stat ratings for the select card (the sim ignores these). */
  stats: GolferStats;
  /** Tweak the (meta-baked) starting loadout — bag/handicap/dispersion. Pure. */
  loadout(base: PlayerLoadout): PlayerLoadout;
  /** Per-club shot shape: dispersion, fade/hook bias, backspin, by nominal carry. Pure. */
  clubMods(nominalCarry: number): ClubShotMods;
}

// Club-category thresholds (by nominal carry, yards). Distance clubs are the woods/long hybrids you
// hit off the tee (≥185, matching DISTANCE_CLUB_CARRY); irons fill the middle; wedges are the short
// scoring sticks. "5-iron and down" (Backspin Bo) is ≤150 (the 5-iron's carry).
const LONG_CARRY = 185;
const WEDGE_CARRY = 106; // PW and below
const FIVE_IRON_CARRY = 150;

const mods = (m: Partial<ClubShotMods>): ClubShotMods => ({
  dispMult: 1,
  angleBias: 0,
  rollFracDelta: 0,
  ...m,
});

/**
 * Everyone starts with the SAME balanced 11-club bag (GS-clubs-2) — a full, evenly-spaced set from
 * the driver down through a smooth wedge ladder to a 60° and the putter. The earlier sparse signature
 * bags left big gaps in the scoring zone, so dialling distance DOWN near the green meant over-clubbing
 * (the "small club list is too hard close in" complaint): with no club between, say, a 134-yd 7-iron
 * and a 106-yd wedge you had to pick one and miss. This balanced bag keeps the gaps tightest where
 * touch matters most (PW → GW → SW → LW → 60° are 10–20 yd apart) and only loosens up high, where a
 * long approach forgives a few yards. Character identity now lives in the SHOT SHAPE (clubMods) and
 * the distance scalars (Larry +14 / Bo −8), not in a hand-cut bag. Reward clubs (rare+) collected over
 * a run tighten the remaining long/mid gaps and upgrade the distance clubs.
 *
 * The carries (from CLUBS): D 250, 5W 217, 3H 181, 6i 142, 8i 125, PW 106, GW 88, SW 78, LW 68,
 * 60° 48, putter 8 — eleven clubs, descending, with a dense short game.
 */
const BALANCED_BAG: readonly string[] = ['D', '5W', '3H', '6i', '8i', 'PW', 'GW', 'SW', 'LW', '60', 'putter'];
/** Longshot Larry refuses hybrids (GS-clubs): swap the 3-Hybrid for the 3-Iron — a long iron fits his
 *  bomber identity and keeps his bag hybrid-free, the only per-golfer bag difference. */
const BALANCED_BAG_NO_HYBRID: readonly string[] = ['D', '5W', '3i', '6i', '8i', 'PW', 'GW', 'SW', 'LW', '60', 'putter'];

/** Build a golfer's starting bag from club-type ids, stamping every club as the common 'starter' set. */
function buildStartBag(ids: readonly string[]): Club[] {
  return ids
    .map((id) => {
      const base = clubById(id, CLUBS);
      if (!base) throw new Error(`buildStartBag: unknown club "${id}"`);
      return { id: base.id, name: base.name, carry: base.carry, set: 'starter', rarity: 'common' as const };
    })
    .sort((a, b) => b.carry - a.carry);
}

/**
 * The roster. Order is the select-screen order. Ids are stable (persisted in the run snapshot), so
 * never reuse one.
 */
export const CHARACTERS: readonly Character[] = [
  {
    id: 'feather-fade',
    name: 'Feather Fade',
    shortName: 'Feather',
    origin: 'Nairobi, Kenya',
    identity: 'she / her',
    blurb: 'A buttery, controlled fade on every shot — predictable shape, tidy dispersion.',
    pros: ['Tighter overall dispersion', 'Same shape every time'],
    cons: ['Everything drifts right — aim left to hold the line'],
    style: { cap: '#19b2a6', shirt: '#138f86', skin: '#6b4a32', build: 0.98 },
    stats: { power: 2, accuracy: 5, touch: 4, consistency: 5 },
    // A shot-maker: a touch tighter across the bag because her ball flight is so repeatable.
    loadout: (m) => ({ ...m, bag: buildStartBag(BALANCED_BAG), dispersionMult: m.dispersionMult * 0.94 }),
    // A slight-to-medium fade that grows with club length (the driver curves most), in radians, PLUS
    // a spray-zone skew that bakes the fade in: far fewer LEFT misses (her duck-hook/hook nearly
    // vanish), a few more RIGHT (the slice) — so the cone leans right exactly as a fader's does.
    clubMods: (carry) => {
      const t = Math.max(0, Math.min(1, (carry - 70) / (250 - 70)));
      return mods({
        angleBias: 0.018 + 0.042 * t,
        shape: { duckHookL: -0.015, hookL: -0.04, sliceR: 0.035 },
      });
    },
  },
  {
    id: 'huang-woo-hook',
    name: 'Huang-Woo Hook',
    shortName: 'Huang-Woo',
    origin: 'Busan, South Korea',
    identity: 'he / him',
    blurb: 'A surgeon with the irons, but the big sticks fight a snap-hook left.',
    pros: ['Pinpoint irons — far fewer wild misses', 'Deadly approach play'],
    cons: ['Drives & woods hook left and spray wider'],
    style: { cap: '#d23f4f', shirt: '#b23140', skin: '#e8c6a0', build: 1.0 },
    stats: { power: 3, accuracy: 4, touch: 4, consistency: 3 },
    loadout: (m) => ({ ...m, bag: buildStartBag(BALANCED_BAG) }),
    // The big sticks fight a snap-hook: their LEFT zones balloon (a real chance of a duck-hook),
    // while the surgical irons not only spray tighter but also clean up their miss zones (more
    // green, fewer side misses) — so his shape is genuinely two-faced, club to club.
    clubMods: (carry) => {
      if (carry >= LONG_CARRY) return mods({ angleBias: -0.06, dispMult: 1.18, shape: { hookL: 0.05, duckHookL: 0.03 } });
      if (carry >= WEDGE_CARRY) return mods({ angleBias: -0.01, dispMult: 0.78, shape: { hookL: -0.03, sliceR: -0.03 } }); // striped irons
      return mods({ dispMult: 0.9, shape: { hookL: -0.02, sliceR: -0.02 } });
    },
  },
  {
    id: 'longshot-larry',
    name: 'Longshot Larry',
    shortName: 'Larry',
    origin: 'Perth, Australia',
    identity: 'he / him',
    blurb: 'Bombs it off the tee. Where it ends up is anyone’s guess.',
    pros: ['+14 yds on the distance clubs', 'Reaches par-5s in two'],
    cons: ['Wider dispersion — more orange & red misses, big clubs worst', 'Refuses to carry hybrids'],
    style: { cap: '#e0a83f', shirt: '#c4882a', skin: '#d8a878', build: 1.08 },
    stats: { power: 5, accuracy: 1, touch: 2, consistency: 2 },
    // +14 on the distance clubs, and NEVER carries a hybrid (so they never show up in his reward
    // offer) — his bag swaps the 3-Hybrid for a 3-Iron. distanceClubBonus carries the +14 onto any
    // reward distance club he buys later.
    loadout: (m) => ({
      ...m,
      bag: boostDistanceClubs(buildStartBag(BALANCED_BAG_NO_HYBRID), 14),
      dispersionMult: m.dispersionMult * 1.1,
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 14,
      noHybrids: true,
    }),
    // The booming long clubs spray the most; the scoring clubs are merely a touch loose.
    clubMods: (carry) => (carry >= LONG_CARRY ? mods({ dispMult: 1.12 }) : mods({})),
  },
  {
    id: 'backspin-bo',
    name: 'Backspin Bo',
    shortName: 'Bo',
    origin: 'Portland, USA',
    identity: 'they / them',
    blurb: 'Zips the short irons back on a string — pin-seekers that bite and hold.',
    pros: ['Heavy backspin from 5-iron down — approaches stop dead', 'Tighter scoring clubs'],
    cons: ['Slightly shorter off the tee'],
    style: { cap: '#9b5fd4', shirt: '#7d46b8', skin: '#a8714c', build: 1.0 },
    stats: { power: 2, accuracy: 4, touch: 5, consistency: 4 },
    // The balanced bag but −8 off the tee; distanceClubBonus carries the −8 onto reward distance clubs.
    loadout: (m) => ({
      ...m,
      bag: boostDistanceClubs(buildStartBag(BALANCED_BAG), -8),
      distanceClubBonus: (m.distanceClubBonus ?? 0) - 8,
    }),
    clubMods: (carry) =>
      carry <= FIVE_IRON_CARRY ? mods({ rollFracDelta: -0.05, dispMult: 0.95 }) : mods({}),
  },
];

export const DEFAULT_CHARACTER_ID = CHARACTERS[0]!.id;

export function getCharacter(id: string | undefined): Character | undefined {
  return id ? CHARACTERS.find((c) => c.id === id) : undefined;
}

/**
 * Apply a character's starting-loadout tweak over a (meta-baked) base, stamping its id so the run
 * remembers who's playing (and a resume can re-apply the shape). No id → the base unchanged.
 */
export function applyCharacter(id: string | undefined, base: PlayerLoadout): PlayerLoadout {
  const ch = getCharacter(id);
  if (!ch) return base;
  return { ...ch.loadout(base), characterId: ch.id };
}

/** The per-club shot-shape function for a character (neutral straight golfer if none/unknown). */
export function characterShotMods(id: string | undefined): ShotMods | undefined {
  const ch = getCharacter(id);
  return ch ? (carry) => ch.clubMods(carry) : undefined;
}

/**
 * The co-op scramble PARTNER for a boss showdown (GS-scramble): an UNCHOSEN golfer from the roster,
 * picked deterministically from the run seed + stop so it's stable across reloads/resume. Excludes the
 * player's own golfer (you don't partner yourself). Pure — no rng object, just an index hash.
 */
export function scramblePartnerId(seed: number, stopIndex: number, playerId: string | undefined): string {
  const pool = CHARACTERS.filter((c) => c.id !== playerId);
  if (pool.length === 0) return CHARACTERS[0]!.id;
  // A small stable hash off the seed+stop → an index into the eligible roster.
  const h = Math.abs(Math.round(seed) * 2654435761 + stopIndex * 40503) % pool.length;
  return pool[h]!.id;
}

export function scramblePartner(seed: number, stopIndex: number, playerId: string | undefined): Character {
  return getCharacter(scramblePartnerId(seed, stopIndex, playerId))!;
}
