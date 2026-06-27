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

export interface Character {
  id: string;
  name: string;
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
 * The roster. Order is the select-screen order. Ids are stable (persisted in the run snapshot), so
 * never reuse one.
 */
export const CHARACTERS: readonly Character[] = [
  {
    id: 'feather-fade',
    name: 'Feather Fade',
    origin: 'Nairobi, Kenya',
    identity: 'she / her',
    blurb: 'A buttery, controlled fade on every shot — predictable shape, tidy dispersion.',
    pros: ['Tighter overall dispersion', 'Same shape every time'],
    cons: ['Everything drifts right — aim left to hold the line'],
    style: { cap: '#19b2a6', shirt: '#138f86', skin: '#6b4a32', build: 0.98 },
    // A shot-maker: a touch tighter across the bag because her ball flight is so repeatable.
    loadout: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.94 }),
    // A slight-to-medium fade that grows with club length (the driver curves most), in radians.
    clubMods: (carry) => {
      const t = Math.max(0, Math.min(1, (carry - 70) / (250 - 70)));
      return mods({ angleBias: 0.018 + 0.042 * t });
    },
  },
  {
    id: 'huang-woo-hook',
    name: 'Huang-Woo Hook',
    origin: 'Busan, South Korea',
    identity: 'he / him',
    blurb: 'A surgeon with the irons, but the big sticks fight a snap-hook left.',
    pros: ['Pinpoint irons — far fewer wild misses', 'Deadly approach play'],
    cons: ['Drives & woods hook left and spray wider'],
    style: { cap: '#d23f4f', shirt: '#b23140', skin: '#e8c6a0', build: 1.0 },
    loadout: (m) => m,
    clubMods: (carry) => {
      if (carry >= LONG_CARRY) return mods({ angleBias: -0.06, dispMult: 1.18 });
      if (carry >= WEDGE_CARRY) return mods({ angleBias: -0.01, dispMult: 0.78 }); // striped irons
      return mods({ dispMult: 0.9 });
    },
  },
  {
    id: 'longshot-larry',
    name: 'Longshot Larry',
    origin: 'Perth, Australia',
    identity: 'he / him',
    blurb: 'Bombs it off the tee. Where it ends up is anyone’s guess.',
    pros: ['+14 yds on the distance clubs', 'Reaches par-5s in two'],
    cons: ['Wider dispersion — more orange & red misses, big clubs worst'],
    style: { cap: '#e0a83f', shirt: '#c4882a', skin: '#d8a878', build: 1.08 },
    loadout: (m) => ({ ...m, bag: boostDistanceClubs(m.bag, 14), dispersionMult: m.dispersionMult * 1.1 }),
    // The booming long clubs spray the most; the scoring clubs are merely a touch loose.
    clubMods: (carry) => (carry >= LONG_CARRY ? mods({ dispMult: 1.12 }) : mods({})),
  },
  {
    id: 'backspin-bo',
    name: 'Backspin Bo',
    origin: 'Portland, USA',
    identity: 'they / them',
    blurb: 'Zips the short irons back on a string — pin-seekers that bite and hold.',
    pros: ['Heavy backspin from 5-iron down — approaches stop dead', 'Tighter scoring clubs'],
    cons: ['Slightly shorter off the tee'],
    style: { cap: '#9b5fd4', shirt: '#7d46b8', skin: '#caa182', build: 1.0 },
    loadout: (m) => ({ ...m, bag: boostDistanceClubs(m.bag, -8) }),
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
