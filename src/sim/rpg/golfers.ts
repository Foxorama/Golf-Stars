/**
 * The competition field — the galaxy's golfers (GS-100).
 *
 * Golf Stars is no longer "you vs a cut-line number": a roster of 100+ styled AI golfers travels the
 * galaxy with you, fills a leaderboard each arc, and sends its best out for a matchplay duel. This
 * module is the ROSTER: pure data + helpers, no DOM, no `Math.random`, no game wiring (that lands in
 * `competition.ts` and `match.ts`). A golfer is content as data, exactly like a `Character` or a biome
 * row — a new golfer is a new row.
 *
 * Two layers so we get flavour at scale without 200 hand-written shot functions:
 *  • GOLFER_ARCHETYPES (~18) — the STYLE templates. Each carries a `GolferProfile` (0–1 ratings
 *    grounded in real golf: bomber vs plotter, fader vs hooker, iron surgeon, wedge wizard, wind
 *    master, clutch iceman, streaky maverick…), prose flavour, and a colour family for the avatar.
 *  • GOLFERS (~150) — the named roster. 28 CONSTELLATION CHAMPIONS (one per constellation theme,
 *    named off its anchor star, `home` = that theme), the 4 playable characters mirrored in as rivals
 *    (they can boss when you don't pick them), and a deterministically-built FIELD that populates the
 *    pack. Every golfer resolves to a `GolferLook` (cap/shirt/skin/build — the `GolferStyle` shape, so
 *    any golfer can be drawn as a boss avatar) and a `GolferProfile` (archetype base ± per-golfer jitter).
 *
 * What makes golfers play differently (the research, applied as data levers): ball-flight SHAPE
 * (draw/fade, high-soft/low-penetrating), DRIVING (bomber/plotter), SCORING zones (irons, wedges,
 * putting, sand, recovery), TEMPERAMENT (clutch/streaky/aggressive), and CONDITIONS (wind). The ghost
 * scorer reads the bundled `rating` + `volatility`; the boss-shot builder reads the shape/flight/power
 * fields so a golfer plays the SAME way as a leaderboard number and as a boss on the hole.
 */

import type { ClubShotMods, ShotMods } from '../round';
import type { ShapeMod } from '../shot';
import type { BiomeArchetype } from '../course/themes';
import { THEMES } from '../course/themes';
import { CHARACTERS, type GolferStyle } from './characters';

/** A golfer's 0–1 style ratings — the single profile the ghost scorer and boss-shot builder share. */
export interface GolferProfile {
  /** Overall scoring strength — the master lever (drives the ghost leaderboard mean). */
  skill: number;
  /** Driving distance (0 = short & straight, 1 = bomber). */
  power: number;
  /** Line control — tighter dispersion (0 = wild, 1 = laser). */
  accuracy: number;
  /** Scrambling / wedges / touch around the green. */
  shortGame: number;
  /** Clutch — lifts performance on pressure (boss/cut) holes; low = a choker. */
  nerve: number;
  /** Shot-to-shot repeatability — narrows the scoring tail. */
  consistency: number;
  /** Wind play — links/desert specialists shrug off the gusts. */
  wind: number;
  /** Ball-flight curve tendency: −1 a big hook (R→L), 0 dead straight, +1 a big fade (L→R). */
  shapeBias: number;
  /** Trajectory: −1 low & penetrating (runs out), 0 medium, +1 high & soft (carries, stops). */
  flight: number;
}

/** The colour family an archetype's avatars are drawn from (deterministically picked per golfer). */
export interface GolferPalette {
  caps: readonly string[];
  shirts: readonly string[];
  skins: readonly string[];
  /** Figure size scale baseline (bombers stand taller). */
  build: number;
}

export interface GolferArchetype {
  id: string;
  /** Short style label for leaderboard tags ("Bomber", "Iron Surgeon"). */
  label: string;
  /** One-line style descriptor (flavour). */
  tagline: string;
  /** Prose fragments woven into a generated golfer's bio. */
  notes: readonly string[];
  profile: GolferProfile;
  palette: GolferPalette;
}

/** Where a golfer sits in the pecking order — bumps their effective rating. */
export type GolferTier = 'champion' | 'star' | 'contender' | 'field';

export interface Golfer {
  /** Stable id — persisted in standings/boss state, never reused. */
  id: string;
  name: string;
  /** Short display name (leaderboard rows). */
  shortName: string;
  archetypeId: string;
  tier: GolferTier;
  /** Where they hail from (flavour). */
  origin: string;
  /** Constellation theme id they champion (champions only) — their HOME zone. */
  home?: string;
  /** The world they dominate (champions: their theme's archetype). */
  homeArchetype?: BiomeArchetype;
  /** Render look. Mirrored playable characters carry their own `GolferStyle`; everyone else derives one. */
  look: GolferLook;
  /** A character id this golfer mirrors (the 4 playable golfers in the field). */
  mirrorsCharacter?: string;
}

/** The render-only look a boss avatar is drawn from (the `GolferStyle` shape). */
export type GolferLook = GolferStyle;

// --- Deterministic helpers (no Math.random — stable across reloads) -----------

/** A small stable string hash (FNV-1a), used for per-golfer jitter + look picks. */
export function golferHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], h: number): T {
  return arr[h % arr.length]!;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// --- Archetypes ---------------------------------------------------------------

const prof = (p: Partial<GolferProfile>): GolferProfile => ({
  skill: 0.55,
  power: 0.5,
  accuracy: 0.5,
  shortGame: 0.5,
  nerve: 0.5,
  consistency: 0.5,
  wind: 0.5,
  shapeBias: 0,
  flight: 0,
  ...p,
});

// Earthy avatar palettes — varied caps/shirts per family so a pack of "Bombers" doesn't read identical.
const CAPS = ['#d23f4f', '#19b2a6', '#e0a83f', '#9b5fd4', '#3f7fd2', '#e57b3a', '#46c06a', '#d24f9b', '#5a6b7a', '#c4c4c4'];
const SHIRTS = ['#b23140', '#138f86', '#c4882a', '#7d46b8', '#2f63aa', '#c25f24', '#33994f', '#aa3a78', '#445260', '#9aa0a6'];
const SKINS = ['#6b4a32', '#8a5a3a', '#caa182', '#d8a878', '#e8c6a0', '#5a3a26', '#a06a44', '#f0d2b0'];

const palette = (caps: string[], shirts: string[], build = 1): GolferPalette => ({ caps, shirts, skins: SKINS, build });

export const GOLFER_ARCHETYPES: readonly GolferArchetype[] = [
  {
    id: 'bomber',
    label: 'Bomber',
    tagline: 'Hits it a mile — and a mile offline.',
    notes: ['swings out of their shoes', 'reaches par-5s with an iron in hand', 'lives in the trees as often as the fairway'],
    profile: prof({ skill: 0.62, power: 0.95, accuracy: 0.32, consistency: 0.35, flight: 0.3, shapeBias: -0.2 }),
    palette: palette(['#e0a83f', '#e57b3a'], ['#c4882a', '#c25f24'], 1.1),
  },
  {
    id: 'plotter',
    label: 'Plotter',
    tagline: 'Fairways and greens, all day, every day.',
    notes: ['never met a fairway it didn’t hit', 'plays chess while everyone else plays checkers', 'leaves the driver in the bag'],
    profile: prof({ skill: 0.66, power: 0.42, accuracy: 0.92, consistency: 0.85, shapeBias: 0.1 }),
    palette: palette(['#3f7fd2', '#5a6b7a'], ['#2f63aa', '#445260'], 0.97),
  },
  {
    id: 'fader',
    label: 'Fader',
    tagline: 'A buttery left-to-right on every swing.',
    notes: ['a controlled cut they can lean on', 'aims down the left edge and lets it drift', 'never hits a hook by accident'],
    profile: prof({ skill: 0.63, power: 0.58, accuracy: 0.78, consistency: 0.78, shapeBias: 0.6, flight: 0.15 }),
    palette: palette(['#19b2a6', '#46c06a'], ['#138f86', '#33994f'], 1),
  },
  {
    id: 'drawer',
    label: 'Drawer',
    tagline: 'A penetrating right-to-left that chases.',
    notes: ['a power draw that runs forever', 'works the ball around the corner', 'turns it over and lets it release'],
    profile: prof({ skill: 0.63, power: 0.7, accuracy: 0.7, consistency: 0.72, shapeBias: -0.6, flight: -0.2 }),
    palette: palette(['#d23f4f', '#e57b3a'], ['#b23140', '#c25f24'], 1.02),
  },
  {
    id: 'surgeon',
    label: 'Iron Surgeon',
    tagline: 'Stones it from anywhere with a long iron.',
    notes: ['flag-hunts from 200 yards', 'irons like a scalpel', 'paints the ball at the pin'],
    profile: prof({ skill: 0.72, power: 0.55, accuracy: 0.9, shortGame: 0.6, consistency: 0.82, flight: 0.25 }),
    palette: palette(['#9b5fd4', '#3f7fd2'], ['#7d46b8', '#2f63aa'], 1),
  },
  {
    id: 'wedge',
    label: 'Wedge Wizard',
    tagline: 'Lethal inside 120 — spins it to a stop.',
    notes: ['gets up and down from the car park', 'zips wedges back on a string', 'turns three shots into two'],
    profile: prof({ skill: 0.68, power: 0.5, accuracy: 0.7, shortGame: 0.95, consistency: 0.75, flight: 0.5 }),
    palette: palette(['#46c06a', '#19b2a6'], ['#33994f', '#138f86'], 0.98),
  },
  {
    id: 'putter',
    label: 'Putting Magician',
    tagline: 'Reads greens like a paperback.',
    notes: ['holes everything inside fifteen feet', 'never three-putts', 'the flatstick is a wand'],
    profile: prof({ skill: 0.66, power: 0.5, accuracy: 0.66, shortGame: 0.9, nerve: 0.7, consistency: 0.7 }),
    palette: palette(['#d24f9b', '#9b5fd4'], ['#aa3a78', '#7d46b8'], 0.98),
  },
  {
    id: 'sand',
    label: 'Sand Saver',
    tagline: 'Would rather be in a bunker than the rough.',
    notes: ['a genius from the sand', 'splashes it close every time', 'fears no trap'],
    profile: prof({ skill: 0.64, power: 0.55, accuracy: 0.68, shortGame: 0.85, wind: 0.7, consistency: 0.7 }),
    palette: palette(['#e0a83f', '#c4c4c4'], ['#c4882a', '#9aa0a6'], 1),
  },
  {
    id: 'escape',
    label: 'Escape Artist',
    tagline: 'Pulls par from impossible places.',
    notes: ['manufactures shots no coach would teach', 'plays from the trees, the rocks, the abyss', 'a born scrambler'],
    profile: prof({ skill: 0.65, power: 0.62, accuracy: 0.55, shortGame: 0.9, nerve: 0.75, consistency: 0.5 }),
    palette: palette(['#e57b3a', '#d23f4f'], ['#c25f24', '#b23140'], 1.02),
  },
  {
    id: 'iceman',
    label: 'Iceman',
    tagline: 'Ice in the veins when it matters.',
    notes: ['never sees a clutch putt they don’t fancy', 'plays their best when the heat is on', 'a closer'],
    profile: prof({ skill: 0.74, power: 0.6, accuracy: 0.78, nerve: 0.98, consistency: 0.88 }),
    palette: palette(['#3f7fd2', '#5a6b7a'], ['#2f63aa', '#445260'], 1),
  },
  {
    id: 'streaky',
    label: 'Streaky',
    tagline: 'Birdies in bunches, then a quad.',
    notes: ['runs hot and cold', 'can go low or blow up — no in-between', 'a highlight reel and a horror show'],
    profile: prof({ skill: 0.6, power: 0.7, accuracy: 0.55, nerve: 0.4, consistency: 0.25, flight: 0.2 }),
    palette: palette(['#d23f4f', '#e0a83f'], ['#b23140', '#c4882a'], 1.03),
  },
  {
    id: 'wind',
    label: 'Wind Master',
    tagline: 'Flights it under the gale at will.',
    notes: ['a links upbringing — loves a blow', 'knocks it down into a two-club wind', 'reads the breeze off the flag'],
    profile: prof({ skill: 0.67, power: 0.55, accuracy: 0.8, wind: 0.98, consistency: 0.8, flight: -0.5 }),
    palette: palette(['#5a6b7a', '#46c06a'], ['#445260', '#33994f'], 1),
  },
  {
    id: 'athlete',
    label: 'Power Athlete',
    tagline: 'A gym-built swing with surprising control.',
    notes: ['long AND straight — the modern build', 'a coiled, athletic action', 'distance with a parachute'],
    profile: prof({ skill: 0.73, power: 0.88, accuracy: 0.72, consistency: 0.72, flight: 0.3 }),
    palette: palette(['#d23f4f', '#3f7fd2'], ['#b23140', '#2f63aa'], 1.08),
  },
  {
    id: 'metronome',
    label: 'Metronome',
    tagline: 'Tempo you could set a watch to.',
    notes: ['the smoothest swing on tour', 'never out of rhythm', 'languid and unhurried'],
    profile: prof({ skill: 0.71, power: 0.58, accuracy: 0.85, consistency: 0.95, nerve: 0.7, shapeBias: 0.15 }),
    palette: palette(['#19b2a6', '#9b5fd4'], ['#138f86', '#7d46b8'], 0.99),
  },
  {
    id: 'flop',
    label: 'Flop Artist',
    tagline: 'Throws it high and soft over anything.',
    notes: ['a high, soft fade that drops like a butterfly', 'flops it off a cart path', 'all carry, no run'],
    profile: prof({ skill: 0.63, power: 0.52, accuracy: 0.66, shortGame: 0.88, flight: 0.95, shapeBias: 0.35 }),
    palette: palette(['#d24f9b', '#e57b3a'], ['#aa3a78', '#c25f24'], 0.98),
  },
  {
    id: 'grinder',
    label: 'Grinder',
    tagline: 'Ugly but effective — finds a way.',
    notes: ['scraps out a score from nothing', 'never gives a hole away', 'a bulldog over the ball'],
    profile: prof({ skill: 0.64, power: 0.5, accuracy: 0.7, shortGame: 0.72, nerve: 0.78, consistency: 0.72 }),
    palette: palette(['#5a6b7a', '#e0a83f'], ['#445260', '#c4882a'], 1.01),
  },
  {
    id: 'maverick',
    label: 'Maverick',
    tagline: 'Pin-hunts everything — glory or bust.',
    notes: ['fires at every flag', 'no lay-up in the vocabulary', 'thrilling and reckless'],
    profile: prof({ skill: 0.61, power: 0.78, accuracy: 0.48, nerve: 0.6, consistency: 0.4, shapeBias: -0.4, flight: 0.25 }),
    palette: palette(['#e57b3a', '#d24f9b'], ['#c25f24', '#aa3a78'], 1.04),
  },
  {
    id: 'allround',
    label: 'All-Rounder',
    tagline: 'No weakness, no signature — just good.',
    notes: ['solid in every department', 'a complete, balanced game', 'quietly excellent'],
    profile: prof({ skill: 0.75, power: 0.68, accuracy: 0.78, shortGame: 0.75, nerve: 0.75, consistency: 0.8 }),
    palette: palette(['#46c06a', '#3f7fd2'], ['#33994f', '#2f63aa'], 1.01),
  },
];

const archetypeById = new Map(GOLFER_ARCHETYPES.map((a) => [a.id, a]));

export function getArchetype(id: string): GolferArchetype {
  const a = archetypeById.get(id);
  if (!a) throw new Error(`getArchetype: unknown archetype "${id}"`);
  return a;
}

// --- Look derivation ----------------------------------------------------------

/** A deterministic avatar look for a golfer from its archetype palette + id hash. */
function deriveLook(id: string, archetypeId: string): GolferLook {
  const a = getArchetype(archetypeId);
  const h = golferHash(id);
  return {
    cap: pick(a.palette.caps.length ? a.palette.caps : CAPS, h),
    shirt: pick(a.palette.shirts.length ? a.palette.shirts : SHIRTS, h >>> 3),
    skin: pick(a.palette.skins, h >>> 7),
    // ±6% build variance so a pack reads varied.
    build: +(a.palette.build * (0.94 + ((h >>> 11) % 13) / 100)).toFixed(3),
  };
}

// --- Constellation champions --------------------------------------------------

/** A champion: the named star of a constellation theme, with a fitting style. */
interface ChampRow {
  theme: string;
  name: string;
  shortName: string;
  archetypeId: string;
  origin: string;
}

// One champion per constellation theme (28). Named off the anchor star, styled to the zone's character:
// inferno = power/aggression, void high-gravity = bombers, frost/desert = wind, verdant = smooth/precision.
const CHAMPIONS: readonly ChampRow[] = [
  { theme: 'crux', name: 'Sol Acrux', shortName: 'Acrux', archetypeId: 'allround', origin: 'Southern Cross' },
  { theme: 'triangulum-australe', name: 'Tara Atria', shortName: 'Atria', archetypeId: 'plotter', origin: 'Triangulum' },
  { theme: 'grus', name: 'Nereus Alnair', shortName: 'Alnair', archetypeId: 'wind', origin: 'Grus' },
  { theme: 'vela', name: 'Rex Regor', shortName: 'Regor', archetypeId: 'wind', origin: 'Vela' },
  { theme: 'corvus', name: 'Wren Gienah', shortName: 'Gienah', archetypeId: 'grinder', origin: 'Corvus' },
  { theme: 'cygnus', name: 'Dane Deneb', shortName: 'Deneb', archetypeId: 'metronome', origin: 'Cygnus' },
  { theme: 'lyra', name: 'Vera Vega', shortName: 'Vega', archetypeId: 'metronome', origin: 'Lyra' },
  { theme: 'tucana', name: 'Tobias Tucana', shortName: 'Tucana', archetypeId: 'allround', origin: 'Tucana' },
  { theme: 'canis-minor', name: 'Cyon Procyon', shortName: 'Procyon', archetypeId: 'streaky', origin: 'Canis Minor' },
  { theme: 'canis-major', name: 'Cyrus Sirius', shortName: 'Sirius', archetypeId: 'athlete', origin: 'Canis Major' },
  { theme: 'taurus', name: 'Bran Aldebaran', shortName: 'Aldebaran', archetypeId: 'bomber', origin: 'Taurus' },
  { theme: 'carina', name: 'Nessa Canopus', shortName: 'Canopus', archetypeId: 'sand', origin: 'Carina' },
  { theme: 'aquila', name: 'Alta Altair', shortName: 'Altair', archetypeId: 'bomber', origin: 'Aquila' },
  { theme: 'musca', name: 'Musa Mensa', shortName: 'Musca', archetypeId: 'escape', origin: 'Musca' },
  { theme: 'lupus', name: 'Lupa Lykos', shortName: 'Lupus', archetypeId: 'maverick', origin: 'Lupus' },
  { theme: 'ara', name: 'Arden Ara', shortName: 'Ara', archetypeId: 'iceman', origin: 'Ara' },
  { theme: 'phoenix', name: 'Kaa Ankaa', shortName: 'Ankaa', archetypeId: 'streaky', origin: 'Phoenix' },
  { theme: 'puppis', name: 'Nia Naos', shortName: 'Naos', archetypeId: 'wind', origin: 'Puppis' },
  { theme: 'columba', name: 'Faye Phact', shortName: 'Phact', archetypeId: 'plotter', origin: 'Columba' },
  { theme: 'centaurus', name: 'Kenta Rigil', shortName: 'Rigil', archetypeId: 'allround', origin: 'Centaurus' },
  { theme: 'orion', name: 'Orin Rigel', shortName: 'Rigel', archetypeId: 'bomber', origin: 'Orion' },
  { theme: 'scorpius', name: 'Mars Antares', shortName: 'Antares', archetypeId: 'maverick', origin: 'Scorpius' },
  { theme: 'sagittarius', name: 'Kai Australis', shortName: 'Kaus', archetypeId: 'athlete', origin: 'Sagittarius' },
  { theme: 'leo', name: 'Leon Regulus', shortName: 'Regulus', archetypeId: 'iceman', origin: 'Leo' },
  { theme: 'gemini', name: 'Castor Pollux', shortName: 'Pollux', archetypeId: 'metronome', origin: 'Gemini' },
  { theme: 'virgo', name: 'Pia Spica', shortName: 'Spica', archetypeId: 'surgeon', origin: 'Virgo' },
  { theme: 'pegasus', name: 'Faraz Alpheratz', shortName: 'Alpheratz', archetypeId: 'bomber', origin: 'Pegasus' },
  { theme: 'capricornus', name: 'Cora Algedi', shortName: 'Algedi', archetypeId: 'grinder', origin: 'Capricornus' },
  // GS-worlds: champions of the four new worlds.
  { theme: 'triangulum', name: 'Talia Mothallah', shortName: 'Mothallah', archetypeId: 'surgeon', origin: 'Triangulum' },
  { theme: 'corona-borealis', name: 'Alba Alphecca', shortName: 'Alphecca', archetypeId: 'metronome', origin: 'Corona Borealis' },
  { theme: 'sagitta', name: 'Sasha Sham', shortName: 'Sham', archetypeId: 'wind', origin: 'Sagitta' },
  { theme: 'draco', name: 'Drake Eltanin', shortName: 'Eltanin', archetypeId: 'wind', origin: 'Draco' },
  { theme: 'lacerta', name: 'Lacy Vega', shortName: 'Lacerta', archetypeId: 'escape', origin: 'Lacerta' },
  { theme: 'vulpecula', name: 'Vix Anser', shortName: 'Anser', archetypeId: 'maverick', origin: 'Vulpecula' },
  { theme: 'delphinus', name: 'Della Rotanev', shortName: 'Rotanev', archetypeId: 'sand', origin: 'Delphinus' },
  { theme: 'eridanus', name: 'Eira Achernar', shortName: 'Achernar', archetypeId: 'plotter', origin: 'Eridanus' },
];

// --- The field (deterministically built named pack) ---------------------------

const FIELD_FIRST = [
  'Marco', 'Yuki', 'Aiden', 'Sofia', 'Diego', 'Anya', 'Tariq', 'Mei', 'Kofi', 'Lena',
  'Rohan', 'Ingrid', 'Pablo', 'Noa', 'Jin', 'Carla', 'Omar', 'Freya', 'Dev', 'Talia',
  'Hugo', 'Saanvi', 'Luca', 'Zara', 'Theo', 'Amara', 'Niko', 'Priya', 'Esteban', 'Wei',
  'Mateo', 'Ines', 'Kenji', 'Bianca', 'Andre', 'Suki', 'Felix', 'Nadia', 'Bruno', 'Leila',
];

const FIELD_LAST = [
  'Vance', 'Okafor', 'Castellano', 'Nakamura', 'Lindqvist', 'Mbeki', 'Rosales', 'Petrov', 'Dlamini', 'Krause',
  'Santos', 'Yamamoto', 'Bauer', 'Ferreira', 'Novak', 'Haddad', 'Berg', 'Costa', 'Reyes', 'Ito',
  'Moreau', 'Singh', 'Kowalski', 'Adeyemi', 'Larsson', 'Romano', 'Park', 'Delgado', 'Holt', 'Vega',
  'Brandt', 'Okonkwo', 'Sato', 'Marchetti', 'Halloran', 'Nilsen', 'Cruz', 'Baumann', 'Tanaka', 'Voss',
];

const FIELD_ORIGINS = [
  'Verdant Station', 'Dust Belt', 'Ice Ring', 'Ember World', 'Void Garden', 'the Outer Rings',
  'the Core Worlds', 'the Trailing Arm', 'the Frontier', 'the Old Colonies',
];

/** How many field golfers to generate. Roster lands ~152 (28 champions + 4 characters + this). */
const FIELD_SIZE = 120;

/** Spread tiers across the field: a few contenders, the rest pack-fillers. */
function fieldTier(i: number): GolferTier {
  return i % 6 === 0 ? 'contender' : 'field';
}

function buildField(): Golfer[] {
  const out: Golfer[] = [];
  const usedNames = new Set<string>();
  const F = FIELD_FIRST.length;
  const L = FIELD_LAST.length;
  // Walk a Latin-square diagonal: each "row" of F first-names pairs with a surname shifted by the row,
  // so successive rows are distinct diagonals → F×L unique (first,last) pairs, varied surnames per row.
  for (let k = 0; out.length < FIELD_SIZE && k < F * L; k++) {
    const fi = k % F;
    const li = (Math.floor(k / F) + fi) % L;
    const first = FIELD_FIRST[fi]!;
    const last = FIELD_LAST[li]!;
    const name = `${first} ${last}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const id = `field:${name.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    const h = golferHash(id);
    const archetypeId = GOLFER_ARCHETYPES[h % GOLFER_ARCHETYPES.length]!.id;
    out.push({
      id,
      name,
      shortName: last,
      archetypeId,
      tier: fieldTier(out.length),
      origin: pick(FIELD_ORIGINS, h >>> 5),
      look: deriveLook(id, archetypeId),
    });
  }
  return out;
}

// --- Playable characters mirrored into the field ------------------------------

/** Map each playable character to the field archetype that best matches its style. */
const CHARACTER_ARCHETYPE: Record<string, string> = {
  'feather-fade': 'fader',
  'huang-woo-hook': 'surgeon',
  'longshot-larry': 'bomber',
  'backspin-bo': 'wedge',
};

function buildCharacterRivals(): Golfer[] {
  return CHARACTERS.map((c) => ({
    id: `pc:${c.id}`,
    name: c.name,
    shortName: c.shortName,
    archetypeId: CHARACTER_ARCHETYPE[c.id] ?? 'allround',
    tier: 'star' as GolferTier,
    origin: c.origin,
    look: { ...c.style },
    mirrorsCharacter: c.id,
  }));
}

// --- The roster ---------------------------------------------------------------

function buildChampions(): Golfer[] {
  return CHAMPIONS.map((c) => {
    const theme = THEMES.find((t) => t.id === c.theme);
    const id = `champ:${c.theme}`;
    return {
      id,
      name: c.name,
      shortName: c.shortName,
      archetypeId: c.archetypeId,
      tier: 'champion' as GolferTier,
      origin: c.origin,
      home: c.theme,
      homeArchetype: theme?.archetype,
      look: deriveLook(id, c.archetypeId),
    };
  });
}

/** The full roster: champions, mirrored characters, then the generated field. */
export const GOLFERS: readonly Golfer[] = [
  ...buildChampions(),
  ...buildCharacterRivals(),
  ...buildField(),
];

const golferById = new Map(GOLFERS.map((g) => [g.id, g]));

export function getGolfer(id: string): Golfer | undefined {
  return golferById.get(id);
}

/** The champion golfer for a constellation theme (undefined for deep-sky/galaxy themes — no champion). */
export function championFor(themeId: string): Golfer | undefined {
  return GOLFERS.find((g) => g.tier === 'champion' && g.home === themeId);
}

export function golfersForArchetype(a: BiomeArchetype): Golfer[] {
  return GOLFERS.filter((g) => g.homeArchetype === a);
}

// --- Profile / rating derivation ----------------------------------------------

const TIER_RATING_BONUS: Record<GolferTier, number> = {
  champion: 0.18,
  star: 0.12,
  contender: 0.06,
  field: 0,
};

/** A golfer's profile: the archetype base with a small deterministic per-golfer jitter (±0.05). */
export function golferProfile(id: string): GolferProfile {
  const g = getGolfer(id);
  if (!g) return prof({});
  const base = getArchetype(g.archetypeId).profile;
  // Independent small jitters per field so two same-archetype golfers differ slightly (±0.05).
  const j = (field: keyof GolferProfile, salt: number) =>
    clamp01((base[field] as number) + (((golferHash(`${id}:${field}:${salt}`) % 11) - 5) / 100));
  return {
    skill: clamp01((base.skill + TIER_RATING_BONUS[g.tier]) + ((golferHash(`${id}:skill`) % 9) - 4) / 100),
    power: j('power', 1),
    accuracy: j('accuracy', 2),
    shortGame: j('shortGame', 3),
    nerve: j('nerve', 4),
    consistency: j('consistency', 5),
    wind: j('wind', 6),
    shapeBias: Math.max(-1, Math.min(1, base.shapeBias)),
    flight: Math.max(-1, Math.min(1, base.flight)),
  };
}

/** The golfer's effective scoring rating (0–1) the ghost leaderboard centres on. */
export function golferRating(id: string): number {
  return golferProfile(id).skill;
}

export function golferLook(id: string): GolferLook | undefined {
  return getGolfer(id)?.look;
}

// --- Boss shot mods (real physics, PR4) ---------------------------------------

const mods = (m: Partial<ClubShotMods>): ClubShotMods => ({ dispMult: 1, angleBias: 0, rollFracDelta: 0, ...m });

/** Build a spray-zone shape from a fade/hook bias (mirrors the playable-character convention). */
function shapeFromBias(bias: number): ShapeMod {
  if (bias > 0) return { duckHookL: -0.015 * bias, hookL: -0.05 * bias, sliceR: 0.04 * bias };
  if (bias < 0) return { shankR: 0.015 * bias, sliceR: 0.05 * bias, hookL: -0.04 * bias };
  return {};
}

/** A golfer's per-club shot shape (their boss-on-the-hole behaviour), derived from the profile. */
export function profileToClubMods(p: GolferProfile, nominalCarry: number): ClubShotMods {
  const t = Math.max(0, Math.min(1, (nominalCarry - 70) / (250 - 70))); // 0 wedge → 1 driver
  // Tighter line from accuracy+consistency; long clubs spray a touch more.
  const tightness = p.accuracy * 0.6 + p.consistency * 0.4; // 0..1
  const dispMult = +(1.35 - 0.7 * tightness + 0.12 * t).toFixed(3);
  // Curve grows with club length; bias direction from shapeBias.
  const angleBias = +(p.shapeBias * (0.02 + 0.04 * t)).toFixed(4);
  // Low flight runs out (+roll), high flight checks (−roll); strongest on the scoring clubs.
  const rollFracDelta = +(-p.flight * 0.06 * (1 - t)).toFixed(4);
  return mods({ dispMult, angleBias, rollFracDelta, shape: shapeFromBias(p.shapeBias) });
}

/** The `ShotMods` function for a golfer's boss play (keyed by club nominal carry). */
export function bossShotMods(id: string): ShotMods {
  const p = golferProfile(id);
  return (carry) => profileToClubMods(p, carry);
}

/** A golfer's flat distance bonus (yards) on distance clubs for boss play — bombers long, short hitters short. */
export function golferDistanceBonus(id: string): number {
  const p = golferProfile(id);
  return Math.round((p.power - 0.5) * 28); // ±14 at the extremes
}
