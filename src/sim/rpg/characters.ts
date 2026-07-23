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

/**
 * A golfer's CHOSEN hairstyle (render-only, GS-avatar-gender). This is the ONE place a character's
 * gender presentation lives — a hairstyle + colour + optional light stubble, all drawn ABOVE THE NECK.
 * The body silhouette, torso, limbs and every cosmetic outfit are byte-identical for all golfers, so a
 * garment (spacesuit included) drapes the same on everyone and stays fully gender-neutral. Styles are
 * a length/shape spectrum (short `crop` → side-swept `sweep` → medium `tousled` → voluminous `coils`);
 * any character could wear any of them — each row just picks the look that fits that golfer. A sealed
 * helmet hides hair entirely, so all four read identical in a spacesuit.
 */
export interface GolferHair {
  style: 'crop' | 'sweep' | 'tousled' | 'coils';
  /** Hair colour (#rrggbb). */
  color: string;
  /** Optional light facial hair drawn as a faint jaw shade. */
  facial?: 'stubble';
}

/** Render-only visual identity for a golfer (cap/skin/shirt + a build scale + hair). */
export interface GolferStyle {
  /** Cap + shirt accent colour. */
  cap: string;
  /** Shirt/torso colour. */
  shirt: string;
  /** Skin tone. */
  skin: string;
  /** Figure size scale (1 = default); a bigger hitter stands a touch taller. */
  build: number;
  /** The golfer's chosen hairstyle (render-only; drawn only above the neck). Absent ⇒ no hair drawn. */
  hair?: GolferHair;
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

/**
 * Render-only biography for the character-select LORE popup (GS-char-lore). Pure content-as-data — the
 * sim never reads it; it fills the tap-the-portrait "who is this golfer" card on every select screen.
 * Name (`Character.name`), hometown (`origin`) and pronouns (`identity`) already live on the row, so
 * `lore` only carries the extra biographical beats. A new golfer just adds this block.
 */
export interface CharacterLore {
  /** Their age in years. */
  age: number;
  /** Blood type flavour (e.g. "O+", "AB−"). */
  bloodType: string;
  /** Gender identity, paired with `Character.identity` pronouns on the card ("Woman · she / her"). */
  gender: string;
  /** Relationship status flavour. */
  relationship: string;
  /** Career-best wins / honours — a short list of trophies. */
  bestWins: string[];
  /** Their lowest career moment — the humbling one. */
  lowestMoment: string;
  /** A fun, off-course fact about them. */
  funFact: string;
}

export interface Character {
  id: string;
  name: string;
  /** The golfer's given name — used for the "Voyage as …" CTA (NOT always the first word of `name`:
   *  Longshot Larry → "Larry", Backspin Bo → "Bo"). */
  shortName: string;
  /** Where they hail from — flavour shown on the select card (also the lore popup's hometown backdrop). */
  origin: string;
  /** Their pronoun/identity line (flavour). */
  identity: string;
  /** Render-only biography for the lore popup (GS-char-lore; the sim ignores this). */
  lore: CharacterLore;
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
 * Everyone starts with the SAME balanced 10-club bag (GS-clubs-2; trimmed in GS-clubs-3) — a full,
 * evenly-spaced set from the driver down through a smooth wedge ladder to a 60° and the putter. The
 * earlier sparse signature bags left big gaps in the scoring zone, so dialling distance DOWN near the
 * green meant over-clubbing (the "small club list is too hard close in" complaint): with no club
 * between, say, a 134-yd 7-iron and a 106-yd wedge you had to pick one and miss. This balanced bag
 * keeps the gaps tightest where touch matters most (PW → GW → SW → 60° are ~12–20 yd apart) and only
 * loosens up high, where a long approach forgives a few yards. Character identity now lives in the
 * SHOT SHAPE (clubMods) and the distance scalars (Larry +14 / Bo −8), not in a hand-cut bag. Reward
 * clubs (rare+) collected over a run tighten the remaining long/mid gaps and upgrade the distance clubs.
 *
 * The carries (from CLUBS): D 250, 5W 217, 3H 181, 6i 142, 8i 125, PW 106, GW 90, SW 74, 60° 56,
 * putter 8 — ten clubs, descending, with a dense short game. (GS-clubs-3 dropped the Lob Wedge that
 * used to sit between SW and 60°, along with the 7W/9W/4i/AW/58° from the wider taxonomy.)
 */
const BALANCED_BAG: readonly string[] = ['D', '5W', '3H', '6i', '8i', 'PW', 'GW', 'SW', '60', 'putter'];
/** Longshot Larry refuses hybrids (GS-clubs): swap the 3-Hybrid for the 3-Iron — a long iron fits his
 *  bomber identity and keeps his bag hybrid-free, the only per-golfer bag difference. */
const BALANCED_BAG_NO_HYBRID: readonly string[] = ['D', '5W', '3i', '6i', '8i', 'PW', 'GW', 'SW', '60', 'putter'];

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
    lore: {
      age: 29,
      bloodType: 'O+',
      gender: 'Woman',
      relationship: 'In a long-distance relationship',
      bestWins: ['Nairobi Open (×2)', 'Rift Valley Masters', 'Continental Order of Merit'],
      lowestMoment: 'Four-putted the 72nd hole to hand back the Continental Cup by a single stroke.',
      funFact: 'Learned to read wind flying kites over the Ngong Hills — she never tees off without a feather clipped to her cap.',
    },
    blurb: 'A buttery, controlled fade on every shot — predictable shape, tidy dispersion.',
    pros: ['Tighter overall dispersion', 'Same shape every time'],
    cons: ['Everything drifts right — aim left to hold the line'],
    // Feminine presentation: voluminous natural coils framing the face.
    style: { cap: '#19b2a6', shirt: '#138f86', skin: '#6b4a32', build: 0.98, hair: { style: 'coils', color: '#1c1712' } },
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
    identity: 'he / she / they',
    lore: {
      age: 26,
      bloodType: 'A+',
      gender: 'Genderfluid',
      relationship: 'Single',
      bestWins: ['Busan Seaside Invitational', 'Korea Iron Championship', 'Asia-Pacific Approach Title'],
      lowestMoment: 'Snap-hooked three straight tee shots into Gwangalli harbour on live television.',
      funFact: 'Practises irons blindfolded and can name any club by the sound of the strike alone.',
    },
    blurb: 'A surgeon with the irons, but the big sticks fight a snap-hook left.',
    pros: ['Pinpoint irons — far fewer wild misses', 'Deadly approach play'],
    cons: ['Drives & woods hook left and spray wider'],
    // Open presentation (any pronouns): a modern side-swept textured cut that reads as anyone.
    style: { cap: '#d23f4f', shirt: '#b23140', skin: '#e8c6a0', build: 1.0, hair: { style: 'sweep', color: '#14100c' } },
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
    lore: {
      age: 34,
      bloodType: 'B+',
      gender: 'Man',
      relationship: 'Married, two kids and a kelpie',
      bestWins: ['Long Drive World Title (×3)', 'Outback Smash', 'Perth Power Open'],
      lowestMoment: 'Bombed a drive clean out of the stadium onto a passing road train — disqualified, ball never found.',
      funFact: 'Once carried a ball 439 yards downwind; he keeps the dented driver mounted over the mantelpiece.',
    },
    blurb: 'Bombs it off the tee. Where it ends up is anyone’s guess.',
    pros: ['+14 yds on the distance clubs', 'Reaches par-5s in two'],
    cons: ['Wider dispersion — more orange & red misses, big clubs worst', 'Refuses to carry hybrids'],
    // Masculine presentation: a short sandy crop with light stubble.
    style: { cap: '#e0a83f', shirt: '#c4882a', skin: '#d8a878', build: 1.08, hair: { style: 'crop', color: '#b8843f', facial: 'stubble' } },
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
    lore: {
      age: 31,
      bloodType: 'AB−',
      gender: 'Non-binary',
      relationship: 'It’s complicated',
      bestWins: ['Willamette Wedge Classic', 'Cascade Short-Game Series', 'Portland Spin Invitational'],
      lowestMoment: 'Spun a chip so hard it screwed back off the green into the water — losing the playoff to their own backspin.',
      funFact: 'Roasts their own coffee and names each blend after its spin rate; the house pour is “10,000 RPM”.',
    },
    blurb: 'Zips the short irons back on a string — pin-seekers that bite and hold.',
    pros: ['Heavy backspin from 5-iron down — approaches stop dead', 'Tighter scoring clubs'],
    cons: ['Slightly shorter off the tee'],
    // Androgynous presentation: a medium tousled crop.
    style: { cap: '#9b5fd4', shirt: '#7d46b8', skin: '#a8714c', build: 1.0, hair: { style: 'tousled', color: '#2f2318' } },
    stats: { power: 2, accuracy: 4, touch: 5, consistency: 4 },
    // The balanced bag but −8 off the tee; distanceClubBonus carries the −8 onto reward distance clubs.
    loadout: (m) => ({
      ...m,
      bag: boostDistanceClubs(buildStartBag(BALANCED_BAG), -8),
      distanceClubBonus: (m.distanceClubBonus ?? 0) - 8,
    }),
    // Backspin Bo is the ONLY golfer who spins the ball BACK (GS-backspin-optin): the universal wedge
    // backspin was removed from `clubRollFraction`, so Bo now carries the whole check himself. A
    // loft-scaled negative roll on the scoring clubs — mild through the mid irons, biting on the short
    // wedges — makes his approaches genuinely bite and hold while staying controllable (a specialist's
    // spice, not the old land-over-the-green-and-pray lottery every player was stuck with). Above the
    // 5-iron the big sticks are untouched.
    clubMods: (carry) => {
      if (carry > FIVE_IRON_CARRY) return mods({});
      const t = Math.max(0, Math.min(1, (FIVE_IRON_CARRY - carry) / (FIVE_IRON_CARRY - 50)));
      return mods({ rollFracDelta: -0.05 - 0.05 * t, dispMult: 0.95 }); // 5i −0.05 → shortest wedge ~−0.10
    },
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
 * Stable index hash off (seed, stopIndex) into a pool of `poolLen` (GS-team-duel / GS-scramble).
 * Mixes with `Math.imul` so every step stays int32-exact — a bare `seed * BIG` overflows 2^53 for a
 * real run seed (~1e9) and the product's low bits round away, and a plain constant that shares a factor
 * with `poolLen` (e.g. `40503 % 3 === 0`) makes the seed vanish under the modulo. Both failure modes
 * pinned a partner to one golfer regardless of the seed; the two-round imul mixer diffuses every bit
 * before the modulo, so the pick is uniform for ANY pool size (see formats.ts resolveTeamFormat, same
 * fix). `salt` separates the two teams' draws so they rarely field the same golfer.
 */
function partnerIndex(seed: number, stopIndex: number, salt: number, poolLen: number): number {
  let h = ((Math.round(seed) | 0) ^ Math.imul(stopIndex + 1, 0x9e3779b1) ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h % poolLen;
}

/**
 * The co-op scramble PARTNER for a boss showdown (GS-scramble): an UNCHOSEN golfer from the roster,
 * picked deterministically from the run seed + stop so it's stable across reloads/resume. Excludes the
 * player's own golfer (you don't partner yourself). Pure — no rng object, just an index hash.
 */
export function scramblePartnerId(seed: number, stopIndex: number, playerId: string | undefined): string {
  const pool = CHARACTERS.filter((c) => c.id !== playerId);
  if (pool.length === 0) return CHARACTERS[0]!.id;
  return pool[partnerIndex(seed, stopIndex, 0x53435242 /* 'SCRB' */, pool.length)]!.id;
}

export function scramblePartner(seed: number, stopIndex: number, playerId: string | undefined): Character {
  return getCharacter(scramblePartnerId(seed, stopIndex, playerId))!;
}

/**
 * A deterministic partner for the BOSS side of a team duel (GS-team-duel): a playable golfer used as
 * the AI's partner, excluding the player's own character. Salted apart from `scramblePartnerId` so the
 * two teams don't field the same golfer where possible. Pure — a stable index hash.
 */
export function bossPartnerId(seed: number, stopIndex: number, playerId: string | undefined): string {
  const pool = CHARACTERS.filter((c) => c.id !== playerId);
  if (pool.length === 0) return CHARACTERS[0]!.id;
  return pool[partnerIndex(seed, stopIndex, 0x424f5353 /* 'BOSS' */, pool.length)]!.id;
}

export function bossPartner(seed: number, stopIndex: number, playerId: string | undefined): Character {
  return getCharacter(bossPartnerId(seed, stopIndex, playerId))!;
}
