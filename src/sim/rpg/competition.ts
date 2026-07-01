/**
 * The competition field & ghost leaderboard (GS-100).
 *
 * You travel the galaxy in a FIELD. Each arc, 20 golfers compete; a live leaderboard with a tightening
 * cut line replaces the old stop splash; the arc boss is whoever tops that leaderboard. This module is
 * the pure ENGINE: it builds the arc field and produces a deterministic, statistical "ghost" score for
 * every AI golfer per hole. (The chosen call, see the design report: simulating real ball-physics for
 * 20 golfers every hole would be slow and untunable — only the matchplay BOSS, in `match.ts`, plays
 * real shots.)
 *
 * Calibration (why the cut bites harder over time): a golfer's per-hole Stableford is centred on a
 * FIXED quality band keyed off their rating (`golferBaseline`), NOT on distance. The cut line
 * (`effectiveCut`, unchanged) RISES with galaxy distance — so early it sweeps only the weak tail of a
 * fixed-quality field, and deep it scythes most of it. The player keeps pace via upgrades (existing
 * balance). Constellation champions sit near the top of the band and get a strong HOME boost in their
 * own zone, so the zone's champion "generally comes out on top" and becomes the boss.
 *
 * Pure & deterministic: seeded `Rng` only, no DOM, no `Math.random`. Standings are a pure function of
 * (seed, arc, holes played, the player's REAL per-hole scores), so nothing new needs persisting beyond
 * the run seed.
 */

import { Rng } from '../rng';
import type { BiomeArchetype, Arc } from '../course/themes';
import { themesForArc } from '../course/themes';
import {
  GOLFERS,
  getGolfer,
  golferProfile,
  championFor,
  type Golfer,
  type GolferTier,
  type GolferLook,
} from './golfers';

/** The sentinel id for the human player's row in a field/standings. */
export const PLAYER_ID = 'player';

/** Golfers in a field (20: the player + 19 AI). */
export const FIELD_SIZE = 20;

// --- Arc grouping (pure; here, not in league, so run.ts can compute the positional cut without a cycle) ---

/** Stops per arc — voyage is 2 ordinary + 1 boss; flat/ladder reuse the grouping as a "season". */
export const ARC_LEN = 3;
export function arcIndexOf(stopIndex: number): number {
  return Math.floor(stopIndex / ARC_LEN);
}
export function arcStartStop(arcIndex: number): number {
  return arcIndex * ARC_LEN;
}
export function stopPosInArc(stopIndex: number): number {
  return stopIndex % ARC_LEN;
}
/** Is this the boss (final) slot of its arc? */
export function isArcBossSlot(stopIndex: number): boolean {
  return stopPosInArc(stopIndex) === ARC_LEN - 1;
}
/** Pressure 0..1 a stop carries (ramps toward the arc's boss slot). */
export function stopPressure(stopIndex: number): number {
  const pos = stopPosInArc(stopIndex);
  return isArcBossSlot(stopIndex) ? 1 : pos / ARC_LEN;
}

/**
 * Positional cut targets (GS-positional-cut / GS-voyage-field): the field is now ONE persistent
 * 20-golfer field across the WHOLE voyage (not rebuilt per arc), and the cut RAMPS DOWN over the six
 * ordinary stops so that exactly TWO remain (you + one rival) going into the final — a 1-on-1
 * matchplay for the title. Indexed by the ordinal of the ordinary stop (0..5: arc1 stops 0,1 → arc2
 * stops 3,4 → arc3 stops 6,7); the boss slot of each arc (pos 2) has no entry (it's a knockout, not a
 * positional cut, and adds nothing to the standings). Ascension tightens the targets, but ONLY the
 * FINAL ordinary stop may cut to 2 (the 1st-v-2nd title match) — every earlier target is floored at 4
 * (GS-cut-balance), so the last pre-boss section always has a real field of at least four and the
 * two-player state exists only at the final boss. A bigger field is fine — eliminated golfers sink
 * below the cut line.
 */
export const VOYAGE_SURVIVOR_TARGETS = [16, 12, 9, 6, 4, 2] as const;

/** Pre-final targets never drop below this, however hard Ascension squeezes (GS-cut-balance). */
export const PRE_FINAL_SURVIVOR_FLOOR = 4;

/** The 0-based ordinal of an ORDINARY stop among the voyage's ordinary stops (skips boss slots). */
export function ordinaryStopOrdinal(stopIndex: number): number {
  return arcIndexOf(stopIndex) * (ARC_LEN - 1) + stopPosInArc(stopIndex);
}

export function arcSurvivorTarget(stopIndex: number, ascensionCut = 0): number | undefined {
  if (isArcBossSlot(stopIndex)) return undefined; // boss slot — decided by the match, no positional cut
  const ord = ordinaryStopOrdinal(stopIndex);
  const last = VOYAGE_SURVIVOR_TARGETS.length - 1;
  const base = VOYAGE_SURVIVOR_TARGETS[Math.min(ord, last)]!;
  const floor = ord >= last ? 2 : PRE_FINAL_SURVIVOR_FLOOR;
  return Math.max(floor, base - Math.max(0, Math.round(ascensionCut)));
}

/** A golfer entry in an arc's field (lighter than a full Golfer; the player carries no archetype). */
export interface FieldGolfer {
  id: string;
  name: string;
  shortName: string;
  tier: GolferTier | 'player';
  look: GolferLook;
  isPlayer: boolean;
  /** Champion's home constellation theme (so per-hole home boosts can match). */
  home?: string;
  homeArchetype?: BiomeArchetype;
  /** The playable-character id this golfer mirrors, if any. */
  mirrorsCharacter?: string;
}

export interface Field {
  arcIndex: number;
  arc: Arc;
  playerId: string;
  golfers: FieldGolfer[];
}

function toFieldGolfer(g: Golfer): FieldGolfer {
  return {
    id: g.id,
    name: g.name,
    shortName: g.shortName,
    tier: g.tier,
    look: g.look,
    isPlayer: false,
    home: g.home,
    homeArchetype: g.homeArchetype,
    mirrorsCharacter: g.mirrorsCharacter,
  };
}

export interface PlayerInfo {
  name?: string;
  look: GolferLook;
  /** The character the human picked — so we DON'T also drop their mirror into the field as a rival. */
  characterId?: string;
}

/**
 * Build the deterministic 20-golfer field for an arc. Always includes: the player; a seeded sample of
 * the arc's constellation CHAMPIONS (so a champion can win & boss in their zone); the unchosen playable
 * characters as rivals; then field golfers to fill to 20, weighted toward the arc's home archetypes.
 * Seed-stable → recomputable, nothing new to persist.
 */
export function buildField(seed: number | string, arcIndex: number, arc: Arc, player: PlayerInfo): Field {
  const champions = themesForArc(arc)
    .filter((t) => t.kind === 'constellation')
    .map((t) => championFor(t.id))
    .filter((g): g is Golfer => !!g);
  return assembleField(new Rng(`${seed}:field:${arcIndex}`), champions, player, arcIndex, arc);
}

/**
 * The ONE persistent field for a whole WINNABLE voyage (GS-voyage-field): built once, identical at
 * every stop, so the cut can thin it down across the journey to the final two. Champions span ALL
 * voyage arcs so each zone you pass still has its home favourite in the field. Seed-stable — both
 * the league display and the run's survival check call this with the same inputs, so they agree
 * golfer-for-golfer.
 */
export function buildVoyageField(seed: number | string, player: PlayerInfo): Field {
  const champions = ([1, 2, 3] as Arc[])
    .flatMap((a) => themesForArc(a).filter((t) => t.kind === 'constellation'))
    .map((t) => championFor(t.id))
    .filter((g): g is Golfer => !!g);
  return assembleField(new Rng(`${seed}:voyagefield`), champions, player, 0, 1);
}

/** Assemble a field from a champion pool: the player, a seeded champion sample, the unchosen
 *  playable characters as rivals, then a random ability-spanning fill to FIELD_SIZE. Pure. */
function assembleField(rng: Rng, championPool: Golfer[], player: PlayerInfo, arcIndex: number, arc: Arc): Field {
  const chosen: FieldGolfer[] = [];
  const used = new Set<string>([PLAYER_ID]);

  const add = (g: Golfer | undefined): void => {
    if (!g || used.has(g.id)) return;
    used.add(g.id);
    chosen.push(toFieldGolfer(g));
  };

  // 1) The player.
  chosen.push({
    id: PLAYER_ID,
    name: player.name?.trim() || 'You',
    shortName: player.name?.trim() || 'You',
    tier: 'player',
    look: player.look,
    isPlayer: true,
  });

  // The chosen character IS the player — reserve their mirror so it can never re-enter the field as a
  // rival (otherwise the fill pass in step 4, which only checks `used`, would add the golfer the player
  // is playing as, showing them twice: once as "You" and once under their own name).
  if (player.characterId) {
    for (const g of GOLFERS.filter((x) => x.mirrorsCharacter === player.characterId)) used.add(g.id);
  }

  // 2) Champions (a seeded sample, up to ~9 — enough that the favourites are present, not so many the
  //    field is all champions). Deduped via `used`, so a voyage pool that spans arcs is fine.
  const champions = shuffle(championPool, rng);
  let added = 0;
  for (const g of champions) {
    if (added >= 9) break;
    if (!used.has(g.id)) {
      add(g);
      added++;
    }
  }

  // 3) Unchosen playable characters as rivals (they can boss when you don't pick them).
  for (const g of GOLFERS.filter((x) => x.mirrorsCharacter && x.mirrorsCharacter !== player.characterId)) {
    if (chosen.length >= FIELD_SIZE) break;
    add(g);
  }

  // 4) Fill to 20 from the field pool as a SEEDED RANDOM SAMPLE spanning the ability range — NOT the
  //    top by skill. The old fill sorted the pool by skill descending, so the field was always the
  //    STRONGEST 19 golfers (an elite cluster, all ~2.0–3.2 SF/hole) with no weak tail — the cut had
  //    nothing gentle to bite, so the leaderboard never thinned early. Field-tier golfers carry no
  //    home archetype, so that sort was pure skill bias and the home-weighting did nothing; a plain
  //    shuffle restores a natural spread (weak field golfers ~1.7/hole up to champions ~2.5/hole), so
  //    the ramping cut sweeps the tail first and eats upward — and because a golfer's score never
  //    depends on the field's composition, this changes WHO gets cut, not the player's own difficulty.
  const pool = shuffle(
    GOLFERS.filter((g) => !used.has(g.id) && g.tier !== 'champion'),
    rng,
  );
  for (const g of pool) {
    if (chosen.length >= FIELD_SIZE) break;
    add(g);
  }

  return { arcIndex, arc, playerId: PLAYER_ID, golfers: chosen.slice(0, FIELD_SIZE) };
}

/** Fisher–Yates with a seeded Rng (pure). */
function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// --- Ghost scoring ------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fixed quality band: a rating-0 golfer averages ~0.6 SF/hole (bogey-ish), a rating-1 ~2.6 (birdie-ish). */
export function golferBaseline(rating: number): number {
  return 0.6 + 2.0 * clamp(rating, 0, 1);
}

/** Strong home lift so a constellation champion tops the board in their own zone. */
export const HOME_BOOST = 0.6;

/**
 * A golfer's per-stop FORM (GS-streaks): a hot/cold streak that shifts their baseline SF/hole for a
 * WHOLE stop, so the leaderboard has lead changes and runs of form instead of a static skill order — a
 * field golfer can go on a tear and leap the board, a champion can have an off week and lose the lead.
 * Constant within a stop (the streak), independent per stop, deterministic from a per-stop key. The
 * swing scales with INCONSISTENCY: streaky golfers run hot and cold (big swings), metronomes stay level
 * (small swings) — so "streaky" actually plays streaky. The mean is 0, so it doesn't shift the field's
 * overall scoring level (the cut calibration is untouched), only WHO is where.
 */
export function golferForm(golferId: string, formKey: string): number {
  const p = golferProfile(golferId);
  const rng = new Rng(`${formKey}:${golferId}`);
  // Sum of three uniforms ≈ a bell, mean 0; amplitude grows as consistency falls.
  const amp = 0.35 + (1 - p.consistency) * 0.85; // ~0.35 (metronome) … ~1.2 (streaky)
  return clamp((rng.float() + rng.float() + rng.float() - 1.5) * amp, -1.6, 1.6);
}

/**
 * One golfer's ghost Stableford for one hole. Deterministic from `holeKey`+golfer. `homeMatch` lifts a
 * champion in their zone; `pressure` (0..1, ramps toward a boss) lifts the clutch and sinks the chokers;
 * `form` (GS-streaks) is the golfer's per-stop hot/cold streak (see `golferForm`), constant across the
 * stop's holes. The per-hole spread widens for inconsistent/streaky golfers, so they bounce around too.
 */
export function ghostHoleStableford(
  golferId: string,
  holeKey: string,
  homeMatch: boolean,
  pressure = 0,
  form = 0,
): number {
  const p = golferProfile(golferId);
  let base = golferBaseline(p.skill);
  if (homeMatch) base += HOME_BOOST;
  base += (p.nerve - 0.5) * pressure * 0.8;
  base += form;
  const vol = 0.35 + (1 - p.consistency) * 0.7 - (homeMatch ? 0.1 : 0);
  const rng = new Rng(`${holeKey}:${golferId}`);
  // Sum of three uniforms ≈ a bell, mean 0, scaled by volatility.
  const noise = (rng.float() + rng.float() + rng.float() - 1.5) * vol * 2;
  return Math.round(clamp(base + noise, 0, 5));
}

/** Does a golfer's home zone match this hole's theme/archetype? */
export function homeMatches(g: FieldGolfer, themeId: string | undefined, archetype: BiomeArchetype): boolean {
  if (g.home && themeId && g.home === themeId) return true;
  // A champion also feels at home in any zone of their archetype (softer, but still their world).
  return !!g.homeArchetype && g.homeArchetype === archetype;
}

export interface HoleContext {
  /** A deterministic, stable key for this hole (e.g. `${stopSeed}:${holeIndex}`). */
  key: string;
  themeId?: string;
  archetype: BiomeArchetype;
  /** Pressure 0..1 (ramps as a boss stop nears). */
  pressure?: number;
}

/**
 * Ghost per-hole Stableford for every NON-player golfer in the field, over a list of holes (one stop or
 * a whole arc). Returns id → per-hole SF array (same length/order as `holes`).
 */
export function ghostScores(field: Field, holes: HoleContext[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const g of field.golfers) {
    if (g.isPlayer) continue;
    out.set(
      g.id,
      holes.map((h) => ghostHoleStableford(g.id, h.key, homeMatches(g, h.themeId, h.archetype), h.pressure ?? 0)),
    );
  }
  return out;
}

// --- Standings ----------------------------------------------------------------

export interface Standing {
  golferId: string;
  name: string;
  shortName: string;
  tier: GolferTier | 'player';
  look: GolferLook;
  isPlayer: boolean;
  /** Cumulative arc Stableford. */
  total: number;
  /** Holes completed. */
  thru: number;
  /** This-stop Stableford (for the cut), if a stop slice was supplied. */
  stopScore?: number;
  /** 1-based leaderboard position (after sort). */
  position: number;
  /** Below this stop's cut line (eliminated) — set by `applyCut`. */
  cut?: boolean;
}

/**
 * Build sorted standings. `scores` maps every golfer (player included) to their per-hole SF array
 * across the arc so far. `stopHoles` (optional) is how many of the trailing holes belong to the CURRENT
 * stop, so `stopScore` can be computed for the cut. Sort: total desc, then tier, then name (stable).
 */
export function arcStandings(
  field: Field,
  scores: Map<string, number[]>,
  stopHoles?: number,
): Standing[] {
  const rows: Standing[] = field.golfers.map((g) => {
    const arr = scores.get(g.id) ?? [];
    const total = arr.reduce((s, x) => s + x, 0);
    const stopScore = stopHoles !== undefined ? arr.slice(arr.length - stopHoles).reduce((s, x) => s + x, 0) : undefined;
    return {
      golferId: g.id,
      name: g.name,
      shortName: g.shortName,
      tier: g.tier,
      look: g.look,
      isPlayer: g.isPlayer,
      total,
      thru: arr.length,
      stopScore,
      position: 0,
    };
  });
  return rankStandings(rows);
}

/** Sort standings (total desc, then tier, then name — stable) and assign 1-based positions. */
export function rankStandings(rows: Standing[]): Standing[] {
  const tierRank: Record<string, number> = { player: 0, champion: 1, star: 2, contender: 3, field: 4 };
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9) ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => (r.position = i + 1));
  return rows;
}

/** Flag every golfer whose THIS-STOP score missed the cut (eliminated). Pure; needs `stopScore` set. */
export function applyCut(standings: Standing[], cut: number): Standing[] {
  return standings.map((s) => ({ ...s, cut: s.stopScore !== undefined ? s.stopScore < cut : false }));
}

/** How many AI golfers survived this stop's cut. */
export function survivorCount(standings: Standing[]): number {
  return standings.filter((s) => !s.cut).length;
}

/**
 * The boss for an arc's final stop: the top-ranked NON-player on the cumulative leaderboard — i.e. the
 * leader, or #2 if the player is #1 (the request's rule, which reduces to "the best golfer who isn't
 * you"). Skips eliminated golfers if the cut has been applied. Returns undefined for an all-player field.
 */
export function bossPick(standings: Standing[]): string | undefined {
  for (const s of standings) {
    if (!s.isPlayer && !s.cut) return s.golferId;
  }
  // Fallback: ignore cut flags if everyone non-player was cut.
  for (const s of standings) if (!s.isPlayer) return s.golferId;
  return undefined;
}

/**
 * The matchplay boss-round PAIRING (GS-matchplay): the field plays a knockout where the leaderboard
 * pairs best-vs-worst — #1 v last, #2 v 2nd-last, … — so a strong arc earns an easy match and a scrape
 * into the boss draws the leader. This returns the golfer the PLAYER is paired with: their rank-mirror
 * among the standings (the i-th from the top meets the i-th from the bottom). Eliminated golfers are
 * dropped first so the pairing is over the boss-eligible survivors only. Falls back to the nearest valid
 * opponent if a mirror lands on the player (an odd survivor count) or is missing.
 */
export function bossOpponentFor(standings: Standing[], playerId = PLAYER_ID): string | undefined {
  const live = standings.filter((s) => !s.cut);
  const pool = live.length >= 2 ? live : standings; // never strand the duel if everyone's flagged cut
  const meIdx = pool.findIndex((s) => s.golferId === playerId);
  if (meIdx < 0) return bossPick(standings);
  const mirror = pool.length - 1 - meIdx;
  // The exact mirror, then walk outward for the nearest non-player if the mirror is the player (odd pool).
  for (let d = 0; d < pool.length; d++) {
    for (const idx of [mirror + d, mirror - d]) {
      const s = pool[idx];
      if (s && idx !== meIdx && !s.isPlayer) return s.golferId;
    }
  }
  return bossPick(standings);
}

/** Resolve the boss pick to its full Golfer (for avatar + shot mods). */
export function bossGolfer(standings: Standing[]): Golfer | undefined {
  const id = bossPick(standings);
  return id ? getGolfer(id) : undefined;
}

// --- Positional cut engine (GS-positional-cut) --------------------------------

/** One stop's inputs to the arc cut: who scored what, and (for an ordinary stop) the survivor target. */
export interface ArcStopSlice {
  stopIndex: number;
  themeId?: string;
  archetype: BiomeArchetype;
  holeCount: number;
  /** The player's REAL Stableford for this stop. */
  playerSF: number;
  /** A boss/knockout stop: contributes NO Stableford and applies NO positional cut (the match decides). */
  isBoss: boolean;
  /** Top-N (by cumulative total) who advance past this ordinary stop; undefined = no cut (boss). */
  target?: number;
}

/** Per-golfer Stableford for one stop: the player's real SF, each ghost's form-shifted ghost SF. A boss
 *  stop scores 0 for everyone (it adds nothing to the leaderboard). Deterministic; the keys MUST match
 *  league's so the displayed board and the survival computation agree byte-for-byte. */
export function sliceScores(field: Field, seed: number | string, slice: ArcStopSlice): Map<string, number> {
  const out = new Map<string, number>();
  out.set(PLAYER_ID, slice.isBoss ? 0 : slice.playerSF);
  const formKey = `${seed}:form:${slice.stopIndex}`;
  const pressure = stopPressure(slice.stopIndex);
  for (const g of field.golfers) {
    if (g.isPlayer) continue;
    if (slice.isBoss) {
      out.set(g.id, 0);
      continue;
    }
    const form = golferForm(g.id, formKey);
    let sf = 0;
    for (let i = 0; i < slice.holeCount; i++) {
      sf += ghostHoleStableford(g.id, `${seed}:gl:${slice.stopIndex}:${i}`, homeMatches(g, slice.themeId, slice.archetype), pressure, form);
    }
    out.set(g.id, sf);
  }
  return out;
}

export interface ArcCut {
  /** Final standings: cumulative total (frozen at elimination), eliminated golfers flagged + sunk below
   *  survivors, ranked with 1-based positions. */
  standings: Standing[];
  /** golferId → the stop index they were cut at (absent ⇒ still alive). */
  eliminatedAt: Map<string, number>;
  /** Whether the player is still alive after every slice (the positional survival verdict). */
  playerAlive: boolean;
  /** Holes scored (boss stops excluded). */
  thru: number;
  /** Survivor target after the LAST ordinary slice (for the "top N advance" display). */
  lastTarget?: number;
  /** Whether the last slice was a boss (knockout) stop — no cut line is drawn then. */
  lastIsBoss: boolean;
}

const TIER_ORDER: Record<string, number> = { player: 0, champion: 1, star: 2, contender: 3, field: 4 };

/**
 * Walk an arc's stops applying the POSITIONAL cut: after each ordinary stop the top-`target` by
 * cumulative total advance, the rest are eliminated (frozen at their total). Survival is your PLACE in
 * the field — the leaderboard IS the cut. Boss stops add nothing and apply no cut (the match decides).
 * Pure/deterministic; the single source of truth for both the displayed board (league) and the player's
 * survival (run.finishStop), so they can never disagree.
 */
export function arcCut(field: Field, seed: number | string, slices: ArcStopSlice[]): ArcCut {
  const alive = new Set(field.golfers.map((g) => g.id));
  const cum = new Map<string, number>(field.golfers.map((g) => [g.id, 0]));
  const lastStop = new Map<string, number>(field.golfers.map((g) => [g.id, 0]));
  const eliminatedAt = new Map<string, number>();
  let thru = 0;
  let lastTarget: number | undefined;
  let lastIsBoss = false;

  for (const slice of slices) {
    lastIsBoss = slice.isBoss;
    const scores = sliceScores(field, seed, slice);
    if (!slice.isBoss) thru += slice.holeCount;
    for (const g of field.golfers) {
      const v = scores.get(g.id) ?? 0;
      lastStop.set(g.id, v);
      if (alive.has(g.id)) cum.set(g.id, cum.get(g.id)! + v);
    }
    if (!slice.isBoss && slice.target !== undefined) {
      lastTarget = slice.target;
      const ranked = [...alive].sort(
        (a, b) => cum.get(b)! - cum.get(a)! || (TIER_ORDER[tierOf(field, a)] ?? 9) - (TIER_ORDER[tierOf(field, b)] ?? 9) || a.localeCompare(b),
      );
      for (let i = slice.target; i < ranked.length; i++) {
        const id = ranked[i]!;
        alive.delete(id);
        eliminatedAt.set(id, slice.stopIndex);
      }
    }
  }

  const rows: Standing[] = field.golfers.map((g) => ({
    golferId: g.id,
    name: g.name,
    shortName: g.shortName,
    tier: g.tier,
    look: g.look,
    isPlayer: g.isPlayer,
    total: cum.get(g.id)!,
    thru,
    stopScore: slices.length ? lastStop.get(g.id)! : undefined,
    position: 0,
    cut: eliminatedAt.has(g.id),
  }));
  // Survivors above eliminated, each block by total desc (then tier, then name) — so the cut divider
  // sits cleanly between the last survivor and the first eliminated golfer.
  rows.sort(
    (a, b) =>
      (a.cut ? 1 : 0) - (b.cut ? 1 : 0) ||
      b.total - a.total ||
      (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => (r.position = i + 1));

  return { standings: rows, eliminatedAt, playerAlive: alive.has(PLAYER_ID), thru, lastTarget, lastIsBoss };
}

function tierOf(field: Field, id: string): string {
  return field.golfers.find((g) => g.id === id)?.tier ?? 'field';
}
