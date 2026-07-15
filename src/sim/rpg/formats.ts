/**
 * Run formats — content-as-data shapes for a run (GS-9).
 *
 * This is the lever for the "what wraps the golf" question: the SAME run machinery plays
 * the endless Unending Universe (4-hole stops forever, per-hole survival bar) or the bounded,
 * winnable Voyage. A format is just a list of per-stop specs plus a couple of rule switches;
 * nothing in the engine changes. (The original `flat`/`ladder` roguelites were retired by
 * GS-unending — `getFormat` folds their ids into the default so old saves still resume.)
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
  /**
   * The "boss is harder" knob, and the voyage's ARC index (1/2/3 for the Arc-I/II/III bosses).
   *  • For a NON-matchplay boss it's extra Stableford demanded on top of the distance-ramped cut (fair —
   *    the cut is a scoring threshold, never an unfair hole).
   *  • For a MATCHPLAY boss (every voyage boss today) the Stableford cut is bypassed — the duel decides
   *    (`matchWon`) — so cutBonus drives the boss's ARC RANK instead (GS-boss-escalation): `bossEdgeForRun`
   *    maps it 1/2/3 → arcRank 0/1/2, sharpening the boss LOADOUT (handicap/distance/dispersion, and the
   *    final pin-hunts), so the three bosses genuinely ESCALATE across the campaign. Keep it 1/2/3 in arc
   *    order; a change reshapes the difficulty climb.
   */
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
  // A small stable hash off the seed → one of the two formats. Mix with Math.imul so every
  // step stays in int32 range: a real run seed reaches ~1e9, and the old `seed * 2654435761`
  // blew past 2^53 into float, where the product's low bit was always rounded away — so `% 2`
  // was ~always 0 and the Arc-II boss came up scramble ~99.8% of the time (the "always
  // scramble" bug). imul keeps the multiply 32-bit exact, so parity is a true ~50/50 coin.
  let h = Math.round(seed) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h % 2 === 0 ? 'scramble' : 'bestball';
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
   *  not endless. Absent ⇒ an infinite run that only ends by failing the survival rule. */
  winnable?: boolean;
  /**
   * Scales the DISTANCE term of the cut ramp (GS-voyage). A winnable campaign is a fixed-length
   * gauntlet, not an endless climb, so its cut should reach a beatable plateau rather than spiral —
   * 1 = the original ramp, <1 = gentler. Default 1.
   */
  cutMult?: number;
  /** Cap the per-jump distance (and thus the wildness/cut growth) for a bounded campaign. Default 3
   *  (the original 1–3 draw); voyage uses a tighter cap so the deep arcs stay fair to clear. */
  maxJump?: number;
  /**
   * PER-HOLE survival (GS-unending): the run lives or dies hole by hole against the par-relative
   * bar in `endless.ts` (quad bogey → … → birdie-or-better), NOT a stop-level Stableford cut. The
   * moment a hole misses its bar the stop stops and the run ends. Threaded identically through the
   * headless `playStop` and the interactive driver so auto ≡ interactive holds.
   */
  holeGate?: boolean;
  /**
   * The tank the run starts with — AND its capacity (GS-fuel-2: `tankCapacity`, the ceiling
   * `buyFuel` stocks to): every journey jump burns `distanceJump` units of ship fuel. The voyage
   * starts with EXACTLY enough for its fixed stop count taken as single hops (stops − 1 travels ×
   * 1 unit) — deep jumps burn ahead of that budget and must be bought back; the Unending
   * Universe's 12-unit tank runs dry mid-run, making the depth-priced depot a real budget line.
   */
  startingFuel?: number;
}

/** Fallback tank for a format with no `startingFuel` row (unknown ids fold into the default anyway). */
export const DEFAULT_STARTING_FUEL = 12;

/** The tank a run of this format starts with — and its capacity (GS-fuel / GS-fuel-2). */
export function startingFuelFor(format: RunFormat): number {
  return format.startingFuel ?? DEFAULT_STARTING_FUEL;
}

export const FORMATS: Record<string, RunFormat> = {
  // The Asgard interlude (GS-asgard): a single nine-hole stroke-play tournament on the Golden Realm
  // against the Warriors Three. Reached only via the Rainbow-Road eagle trigger and played with the
  // player's current bag (minus the Rainbow Ball, so it plays Asgard's real geometry). No travel/shop,
  // so `startingFuel`/`cutMult` are irrelevant; the reducer decides win/lose on total gross and hands
  // the player back to their suspended run.
  asgard: {
    id: 'asgard',
    name: 'Asgard · The Warriors Three',
    blurb: 'A nine-hole stroke-play duel with the Warriors Three on the Golden Realm',
    stops: [{ holes: 9, label: 'Asgard · The Warriors Three' }],
  },
  // The endless survival mode (GS-unending): 4 random holes → Pro Shop → journey lane → 4 more,
  // forever. Survival is the PER-HOLE bar (endless.ts) — quad bogey for the first 8 holes, one
  // stroke tighter every 8, birdie-or-better from hole 41 on — while course wildness keeps ramping
  // with galaxy distance, so the universe itself never stops escalating. Milestones at
  // 40/60/80/100/120/140 holes bank shard bonuses + unlock the Evergreen cosmetic set.
  unending: {
    id: 'unending',
    name: 'Unending Universe',
    blurb: 'Endless survival — every hole has a score to beat',
    stops: [{ holes: 4, label: '4 holes' }],
    holeGate: true,
    // GS-fuel-2: a tank you actually MANAGE — the old 25-unit tank rarely bound before the run
    // ended. Jumps burn 1–3 units, so this runs dry mid-run and refuelling at the depth-priced
    // depot becomes a genuine call against spending the credits on gear.
    startingFuel: 12,
  },
  // STAR TOUR (GS-star-tour): a single 18-hole STROKE-PLAY round on a player-chosen static course,
  // flown to on the free-roam star map. No travel/shop/survival — you play the round and it's banked to
  // the personal course-record leaderboards. The course + weather are pinned on the run (`staticCourseId`
  // / `staticEffect`), so `currentCourse` serves the fixed designed layout instead of a generated stop;
  // the reducer resolves the round (`resolveStrokePlay`) rather than the Stableford-cut flow, exactly as
  // the Asgard interlude does. Not winnable/holeGate — the single stop is the whole run.
  strokeplay: {
    id: 'strokeplay',
    name: 'Star Tour',
    blurb: 'Pick a world, play its 18 — chase your course records',
    stops: [{ holes: 18, label: '18 holes · stroke play' }],
  },
  // The headline campaign (GS-voyage): a bounded, WINNABLE voyage of three arcs. Each arc is two
  // ordinary stops then a BOSS; clearing the final boss wins the run. Arc I + the FINAL are solo
  // matchplay duels; Arc II is a TEAM duel (GS-team-duel) — best-ball or scramble, random per run,
  // where the underdog side gets a partner. Stops vary in size and one mid-stop CROSSES TWO WORLDS
  // (splitBiome) so the 6/6/6 sameness is broken.
  voyage: {
    id: 'voyage',
    name: 'The Voyage',
    blurb: 'The campaign — three arcs, three bosses, one win',
    winnable: true,
    cutMult: 0.65,
    maxJump: 2,
    // GS-fuel: exactly enough to finish the 9-stop voyage by single hops (8 travels × 1 unit) —
    // machine-checked against stops.length in tests/fuel.test.ts, so a re-shaped voyage can't
    // silently strand the frugal player.
    startingFuel: 8,
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

/**
 * The Asgard tournament format (GS-asgard): a one-off, nine-hole STROKE-PLAY side event against the
 * Warriors Three, reached only by earning an eagle-or-better on Rainbow Road (never selectable on the
 * title). Not winnable/holeGate — the reducer scores it as lowest-gross-of-four and returns the player
 * to their suspended run afterward, so `finishStop`'s ordinary Stableford path is a harmless no-op here.
 */
export const ASGARD_FORMAT = 'asgard';

/** The Star Tour stroke-play format id (GS-star-tour): a single 18-hole round on a chosen static course,
 *  reached via the free-roam star map. The reducer resolves the round to the course-record leaderboards
 *  (like Asgard) rather than the ordinary Stableford-cut/travel flow. */
export const STROKEPLAY_FORMAT = 'strokeplay';

export const DEFAULT_FORMAT = 'unending';

export function getFormat(id: string | undefined): RunFormat {
  // Retired ids ('flat'/'ladder') fold into the default, so an old save's active run still resumes.
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
