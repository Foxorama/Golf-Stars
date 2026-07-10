/**
 * Run serialisation for the save layer (extracted from run.ts, GS-refactor-split).
 *
 * The `RunSnapshot` shape plus `snapshotRun`/`resumeRun` — the round-trip that lets a run park to
 * localStorage and rebuild byte-for-byte, with every field's back-compat default documented inline.
 * `resumeRun` reconstructs the loadout the SAME way `startRun` does (via the shared
 * `startingLoadoutFor` in runLoadout). Pure; the only run dependency is the `Run`/`StopResult` TYPES
 * (erased at compile, so no runtime import cycle). run.ts re-exports every public symbol here, so
 * existing importers are unchanged. Behaviour is byte-for-byte identical to when this lived inside
 * run.ts — a pure move.
 */

import { loadoutFromPerks } from './economy';
import { DEFAULT_FORMAT, getFormat, startingFuelFor } from './formats';
import { DEFAULT_BAG_TIER, type BagTier } from './bag';
import type { MetaUpgrades } from './meta';
import { routeEvent } from './events';
import { themeById } from '../course/themes';
import { startingLoadoutFor } from './runLoadout';
import type { Run, StopResult } from './run';

export interface RunSnapshot {
  seed: number;
  /** Run format id (optional for back-compat with v1-era snapshots → flat). */
  formatId?: string;
  stopIndex: number;
  distanceFromStart: number;
  credits: number;
  /** Owned perks; the loadout is rebuilt from these (over the meta base) on resume. */
  perks: string[];
  /** Permanent meta-upgrade levels (GS-12); the resume base is rebuilt from these. */
  meta?: MetaUpgrades;
  /** Ascension difficulty tier (GS-ascension); 0/absent for back-compat. */
  ascension?: number;
  /** Permanent default-bag tier (GS-bag-tiers), so a resume rebuilds the upgraded starting bag.
   *  Absent ⇒ the un-upgraded common bag (old snapshots). */
  bagTier?: BagTier;
  /** The character's ascension-victory club unlocks (GS-ascension-clubs), so a resume rebuilds the
   *  grown starting bag. Absent ⇒ none (old snapshots / a fresh roster). */
  unlockedClubs?: string[];
  /** The pending route event id (GS-14), so a resume mid-jump keeps the stop's modifier. */
  pendingEventId?: string;
  /** The pending destination-world theme id (GS-journey-biome), so a resume keeps the stop's biome.
   *  Absent on an old snapshot → `currentTheme` falls back to the deterministic draw. */
  pendingThemeId?: string;
  /** Permanent shards banked mid-run by route events (GS-routes); 0/absent for back-compat. */
  bonusShards?: number;
  /** Cumulative holes survived (GS-unending), so a resume keeps the survival bar + milestone
   *  progress. 0/absent for back-compat (non-gate formats never advance it). */
  holesSurvived?: number;
  /** Cumulative gross strokes + par over the survived holes (GS-golf-score), so a resume keeps the
   *  running golf-round score. 0/absent for back-compat. */
  grossStrokes?: number;
  parPlayed?: number;
  /** Unique one-off event ids already fired (GS-17c), so a resume can't re-offer them. */
  firedEventIds?: string[];
  /** The selected golfer (GS-18) — re-applied to the loadout on resume. */
  characterId?: string;
  /** Holes fast-forwarded by warp (GS-warp), so a resume keeps the leaderboard range's start.
   *  0/absent for back-compat (an unwarped run). */
  warpedThrough?: number;
  /** Ship fuel in the tank (GS-fuel), so a resume keeps the gauge. Absent on a pre-fuel snapshot →
   *  the resume grants the format's fresh starting tank (generous, never strands an old save). */
  fuel?: number;
  /** Sector scans burnt at the parked stop (GS-fuel-4), so a resume re-draws the exact lane offer
   *  the player paid fuel for. 0/absent for back-compat (the classic scan-0 offer). */
  routeScans?: number;
  /** Caddies fired this run (GS-caddy-factions), so a resume keeps them out of the shop. Absent on an
   *  old snapshot / a run that never fired anyone → nobody fired (byte-for-byte). */
  firedCaddies?: string[];
  /** The Rainbow Ball was spent on an Asgard tournament (GS-asgard), so a resume keeps it stripped and
   *  the shop keeps it off the rack. Absent on every ordinary run → byte-for-byte unchanged. */
  rainbowConsumed?: boolean;
  /** Every stop finished so far this run (GS-voyage-field): the completed `StopResult`s the positional
   *  cut + team-duel setup are computed from. WITHOUT it a resumed run rebuilt an EMPTY history, which
   *  zeroed the whole arc leaderboard (player + field) and — since the underdog side is decided by
   *  leaderboard rank — flipped a boss team-duel's scramble partner to the player. Absent on old
   *  snapshots → the pre-fix empty history (a resume there still resets the board, but no new save
   *  carries the bug). */
  history?: StopResult[];
}

export function snapshotRun(run: Run): RunSnapshot {
  return {
    seed: run.seed,
    formatId: run.formatId,
    stopIndex: run.stopIndex,
    distanceFromStart: run.distanceFromStart,
    credits: run.credits,
    perks: [...run.loadout.perks],
    meta: { ...run.meta },
    ascension: run.ascension,
    bagTier: run.bagTier,
    unlockedClubs: run.unlockedClubs ? [...run.unlockedClubs] : undefined,
    pendingEventId: run.pendingEvent?.id,
    pendingThemeId: run.pendingTheme?.id,
    bonusShards: run.bonusShards,
    holesSurvived: run.holesSurvived,
    grossStrokes: run.grossStrokes,
    parPlayed: run.parPlayed,
    firedEventIds: [...run.firedEventIds],
    characterId: run.loadout.characterId,
    warpedThrough: run.warpedThrough || undefined,
    fuel: run.fuel,
    routeScans: run.routeScans || undefined,
    firedCaddies: run.firedCaddies.length ? [...run.firedCaddies] : undefined,
    rainbowConsumed: run.rainbowConsumed || undefined,
    // Persist the completed-stop history (GS-voyage-field) so a resume rebuilds the SAME arc
    // leaderboard + team-duel underdog side. Absent when nothing's been finished yet (byte-stable).
    history: run.history.length ? run.history.map((h) => ({ ...h })) : undefined,
  };
}

export function resumeRun(snap: RunSnapshot): Run {
  const meta = snap.meta ?? {};
  const bagTier = snap.bagTier ?? DEFAULT_BAG_TIER;
  return {
    seed: snap.seed,
    formatId: snap.formatId ?? DEFAULT_FORMAT,
    stopIndex: snap.stopIndex,
    distanceFromStart: snap.distanceFromStart,
    credits: snap.credits,
    // Perks (incl. reward clubs, GS-clubs) sit on top of the golfer+meta+bag-tier starting loadout,
    // rebuilt the SAME way `startRun` builds it, so the bag (upgraded starting clubs + bought clubs)
    // reconstructs identically.
    loadout: loadoutFromPerks(
      snap.perks ?? [],
      startingLoadoutFor(meta, snap.characterId, bagTier, snap.unlockedClubs ?? []),
    ),
    meta,
    ascension: snap.ascension ?? 0,
    bagTier,
    unlockedClubs: snap.unlockedClubs ? [...snap.unlockedClubs] : [],
    pendingEvent: snap.pendingEventId ? routeEvent(snap.pendingEventId) : undefined,
    pendingTheme: snap.pendingThemeId ? themeById(snap.pendingThemeId) : undefined,
    bonusShards: snap.bonusShards ?? 0,
    holesSurvived: snap.holesSurvived ?? 0,
    grossStrokes: snap.grossStrokes ?? 0,
    parPlayed: snap.parPlayed ?? 0,
    firedEventIds: snap.firedEventIds ? [...snap.firedEventIds] : [],
    warpedThrough: snap.warpedThrough ?? 0,
    // A pre-fuel snapshot resumes with a fresh tank (GS-fuel) — generous, and never strands it.
    fuel: snap.fuel ?? startingFuelFor(getFormat(snap.formatId ?? DEFAULT_FORMAT)),
    // Scans already burnt at the parked stop (GS-fuel-4) — so a resume re-draws the exact lane
    // offer the player paid fuel for, not the original one. Absent on old snapshots → 0.
    routeScans: snap.routeScans ?? 0,
    firedCaddies: snap.firedCaddies ? [...snap.firedCaddies] : [],
    rainbowConsumed: snap.rainbowConsumed || undefined,
    status: 'active',
    // Restore the finished-stop history (GS-voyage-field) so the positional cut, the arc leaderboard
    // scores and the boss team-duel underdog side reconstruct exactly as they were. Old snapshots
    // (pre-history field) resume empty, as before.
    history: snap.history ? snap.history.map((h) => ({ ...h })) : [],
  };
}
