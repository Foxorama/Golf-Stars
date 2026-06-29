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
   * Matchplay knockout (GS-100 / GS-matchplay): the boss round is a 1-on-1 duel on the actual course
   * against the player's RANK-MIRROR — the field pairs best-vs-worst (#1 v last, …), so a strong arc
   * earns a weaker opponent and a scrape draws the leader. The boss is a real golfer with their own
   * avatar + shots, the match decided when one is up by more than remain; winning/halving passes the
   * stop and adds NO Stableford to the leaderboard (the match decides advancement, not points). The
   * opponent is resolved from the leaderboard at play time (matchOpponentFor), not named here. Handled
   * by the UI reducer; the headless `playStop`/`simulateRun` plays the same duel for balance/tests.
   */
  mode?: 'matchplay';
  /**
   * Team-duel boss (GS-team-duel): the matchplay duel is played as a TEAM format, where the
   * LOWER-ranked side gets a partner (an extra golfer) and the format's advantage, while the
   * higher-ranked side plays SOLO — a fair handicap that lets the underdog punch up at the boss.
   *  • `'scramble'` — the team hits two balls a shot and plays the better; the player chooses which
   *    ball to keep (the AI team auto-picks the better).
   *  • `'bestball'` — both team players play their OWN ball the whole hole; the better hole score
   *    counts (no per-shot choice).
   *  • `'random'` — resolved to scramble or best-ball deterministically per run, so the boss varies.
   * Always a duel (`mode: 'matchplay'` should be set too); the team layer rides on top. The partner
   * side + the resolved format are computed at play time from the leaderboard (teamDuelSetupForRun).
   */
  team?: 'bestball' | 'scramble' | 'random';
}

/** Is this boss a 1-on-1 matchplay knockout vs the player's rank-mirror (GS-100 / GS-matchplay)? */
export function isMatchplayBoss(boss: BossSpec | undefined): boolean {
  return boss?.mode === 'matchplay';
}

/** Is this boss a TEAM duel (GS-team-duel) — a matchplay duel where the underdog plays a team format? */
export function isTeamDuelBoss(boss: BossSpec | undefined): boolean {
  return !!boss?.team;
}

/**
 * Resolve a team-duel boss's concrete format (GS-team-duel): `'random'` picks scramble|bestball
 * deterministically from the run seed, so the format varies BETWEEN runs but is stable within one.
 * Returns undefined for a non-team boss. Pure.
 */
export function resolveTeamFormat(boss: BossSpec | undefined, seed: number): 'bestball' | 'scramble' | undefined {
  if (!boss?.team) return undefined;
  if (boss.team !== 'random') return boss.team;
  // A small stable hash off the seed → one of the two formats.
  return Math.abs(Math.round(seed) * 2654435761 + 0x9e3779b1) % 2 === 0 ? 'scramble' : 'bestball';
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
  // ordinary stops then a BOSS; clearing the final boss wins the run. Arc I + the FINAL are solo
  // matchplay duels; Arc II is a TEAM duel (GS-team-duel) — best-ball or scramble, random per run,
  // where the underdog side gets a partner. Stops vary in size and one mid-stop CROSSES TWO WORLDS
  // (splitBiome) so the 6/6/6 sameness is broken.
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
        label: 'Arc I Boss · Matchplay',
        boss: { id: 'nebula-open', name: 'The Nebula Open', blurb: 'A nine-hole matchplay knockout — the field pairs best-vs-worst and you face your rank-mirror. Win the most holes and you break into deep space.', cutBonus: 1, mode: 'matchplay' },
      },
      // --- Arc 2 ---
      { holes: 6, label: 'Deep Run I' },
      { holes: 7, label: 'Deep Run II · two worlds', splitBiome: true },
      {
        holes: 9,
        label: 'Arc II Boss · Team Duel',
        boss: { id: 'pulsar-classic', name: 'The Pulsar Classic', blurb: 'A team-format duel — best-ball or scramble. The underdog plays with a partner; the favourite goes it alone. Outscore your rival hole by hole.', cutBonus: 2, mode: 'matchplay', team: 'random' },
      },
      // --- Arc 3 ---
      { holes: 6, label: 'The Far Reach I' },
      { holes: 7, label: 'The Far Reach II · two worlds', splitBiome: true },
      {
        holes: 9,
        label: 'The Galactic Major · Matchplay',
        boss: { id: 'galactic-major', name: 'The Galactic Major', blurb: 'The final. A matchplay knockout against your rank-paired rival — win the match and the voyage is yours.', cutBonus: 3, final: true, mode: 'matchplay' },
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
