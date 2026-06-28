/**
 * Run formats — content-as-data shapes for a run (GS-9).
 *
 * This is the lever for the "what wraps the golf" question: the SAME run machinery plays
 * a flat roguelite (every stop a 6-hole course) or an escalating ladder (3 par-3s → 6 →
 * 9 → 18…). A format is just a list of per-stop specs; nothing in the engine changes.
 *
 * Pure data. `flat` reproduces the original fixed 6-hole behaviour exactly, so adding
 * formats regresses nothing.
 */

/**
 * A boss stop (GS-voyage): a signature, harder course that caps an arc. Beating its (raised) cut
 * lets you travel on; clearing the FINAL boss WINS the run. Content-as-data — a new boss is a row.
 */
export interface BossSpec {
  id: string;
  name: string;
  /** One-line flavour shown on the boss intro splash. */
  blurb: string;
  /** Extra Stableford demanded on top of the distance-ramped cut (the "boss is harder" knob — fair,
   *  since the cut is a scoring threshold, never an unfair hole). */
  cutBonus: number;
  /** The final boss of the voyage — clearing it WINS the run. Exactly one per format. */
  final?: boolean;
  /**
   * Co-op showdown style (GS-scramble): you face this boss with an unchosen golfer as a PARTNER and
   * play best-ball/scramble — hit two balls a shot, keep the better. Absent ⇒ a solo boss. The
   * partner is chosen deterministically from the roster minus the player's golfer.
   */
  partner?: 'scramble';
}

export interface StopSpec {
  holes: number;
  /** Cap the par of every hole (3 = all par-3s). Omit for the normal 3/4/5 mix. */
  parCap?: 3 | 4 | 5;
  /** Short label for the UI. */
  label: string;
  /** This stop is a boss (GS-voyage). */
  boss?: BossSpec;
  /**
   * Split the stop into TWO biome halves (GS-variation): the back holes generate from a DIFFERENT
   * theme/biome than the front, so a single stop crosses two worlds. Pure data; the generator stitches
   * the two halves (see currentCourse). Absent ⇒ a single-biome stop (the original behaviour).
   */
  splitBiome?: boolean;
}

export interface RunFormat {
  id: string;
  name: string;
  blurb: string;
  /** Per-stop specs; stops beyond the list reuse the last (the run ends by cut, not length). */
  stops: StopSpec[];
  /** A bounded, WINNABLE voyage (GS-voyage): the run is over (won) when the final boss is cleared,
   *  not endless. Absent ⇒ an infinite roguelite that only ends by a missed cut (flat/ladder). */
  winnable?: boolean;
  /**
   * Scales the DISTANCE term of the cut ramp (GS-voyage). A winnable campaign is a fixed-length
   * gauntlet, not an endless climb, so its cut should reach a beatable plateau rather than spiral —
   * 1 = the original ramp (flat/ladder), <1 = gentler. Default 1.
   */
  cutMult?: number;
  /** Cap the per-jump distance (and thus the wildness/cut growth) for a bounded campaign. Default 3
   *  (the original 1–3 draw); voyage uses a tighter cap so the deep arcs stay fair to clear. */
  maxJump?: number;
}

export const FORMATS: Record<string, RunFormat> = {
  flat: {
    id: 'flat',
    name: 'Roguelite',
    blurb: 'Every stop is a 6-hole course. Beat the cut, upgrade, travel deeper.',
    stops: [{ holes: 6, label: '6 holes' }],
  },
  ladder: {
    id: 'ladder',
    name: 'The Ascent',
    blurb: 'Start tiny and climb: 3 par-3s → a short 6 → a front 9 → a full 9 → 18.',
    stops: [
      { holes: 3, parCap: 3, label: '3 par-3s' },
      { holes: 6, parCap: 4, label: 'short 6' },
      { holes: 9, label: 'front 9' },
      { holes: 9, label: 'full 9' },
      { holes: 18, label: 'the 18' },
    ],
  },
  // The headline campaign (GS-voyage): a bounded, WINNABLE voyage of three arcs. Each arc is two
  // ordinary stops then a BOSS; clearing the final boss wins the run. Two of the three bosses are
  // co-op SCRAMBLE showdowns (an unchosen golfer partners you). Stops vary in size and one mid-stop
  // CROSSES TWO WORLDS (splitBiome) so the 6/6/6 sameness is broken.
  voyage: {
    id: 'voyage',
    name: 'The Voyage',
    blurb: 'Three arcs across the galaxy, each capped by a boss. Beat the Galactic Major to win the run.',
    winnable: true,
    cutMult: 0.65,
    maxJump: 2,
    stops: [
      // --- Arc 1 ---
      { holes: 6, label: 'Orbit I' },
      { holes: 7, label: 'Orbit II · two worlds', splitBiome: true },
      {
        holes: 9,
        label: 'Arc I Boss',
        boss: { id: 'nebula-open', name: 'The Nebula Open', blurb: 'A nine-hole proving ground at the edge of the dust. Clear the cut to break into deep space.', cutBonus: 1 },
      },
      // --- Arc 2 ---
      { holes: 6, label: 'Deep Run I' },
      { holes: 7, label: 'Deep Run II · two worlds', splitBiome: true },
      {
        holes: 9,
        label: 'Arc II Boss · Scramble',
        boss: { id: 'pulsar-classic', name: 'The Pulsar Classic', blurb: 'A best-ball showdown — an old rival of the crew joins your bag. Two balls a shot, keep the better.', cutBonus: 2, partner: 'scramble' },
      },
      // --- Arc 3 ---
      { holes: 6, label: 'The Far Reach I' },
      { holes: 7, label: 'The Far Reach II · two worlds', splitBiome: true },
      {
        holes: 9,
        label: 'The Galactic Major',
        boss: { id: 'galactic-major', name: 'The Galactic Major', blurb: 'The final. A scramble against the galaxy itself with a partner at your side — win it and the voyage is yours.', cutBonus: 3, final: true, partner: 'scramble' },
      },
    ],
  },
};

export const DEFAULT_FORMAT = 'flat';

export function getFormat(id: string | undefined): RunFormat {
  return (id && FORMATS[id]) || FORMATS[DEFAULT_FORMAT]!;
}

/** The spec for a given stop; stops past the list reuse the last one. */
export function stopSpecFor(format: RunFormat, stopIndex: number): StopSpec {
  return format.stops[Math.min(stopIndex, format.stops.length - 1)]!;
}

/** The boss at this stop, if any (GS-voyage). */
export function bossAt(format: RunFormat, stopIndex: number): BossSpec | undefined {
  return stopSpecFor(format, stopIndex).boss;
}

/** Is this the final stop of a winnable voyage (clearing it WINS the run)? */
export function isFinalStop(format: RunFormat, stopIndex: number): boolean {
  return !!format.winnable && !!bossAt(format, stopIndex)?.final;
}

/** Number of defined stops (the voyage length); 0-length-safe. */
export function stopCount(format: RunFormat): number {
  return format.stops.length;
}
