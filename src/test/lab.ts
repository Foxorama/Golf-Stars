/**
 * Sim Lab — the pure, headless experiment engine behind the test hub's "Sim Lab" panels.
 *
 * It RE-IMPLEMENTS NOTHING (test-hub invariant I1, see standards/TEST-HUB-STANDARD.md): every
 * number comes from calling the REAL sim — `resolveShot`/`dispersionProfile` for ball flight,
 * `loadoutFromPerks`/`netDispersion`/`metaStartingLoadout` for builds, `simulateRun` for whole
 * runs. The lab only ORCHESTRATES: loop a club N times and aggregate the landing points into
 * stats/bins; average a build's per-stop Stableford across seeds. That aggregation (mean, σ,
 * percentiles, histogram) is measurement, not game logic — so it lives here, not in the sim.
 *
 * Pure & DOM-free (no `window`, no canvas) so `tests/lab.test.ts` can assert it headlessly —
 * same discipline as `src/sim`. `charts.ts` draws these results; `hub.ts` wires the controls.
 */

import { CLUBS, clubById, type Club } from '../sim/clubs';
import { resolveShot, resolveShape } from '../sim/shot';
import { NEUTRAL_SHOT_MODS, carryControlFor } from '../sim/round';
import { makeRng } from '../sim/rng';
import { simulateRun, type RunStrategy } from '../sim/rpg/run';
import {
  loadoutFromPerks,
  netDispersion,
  handicapDispersion,
  type PlayerLoadout,
} from '../sim/rpg/economy';
import { characterShotMods } from '../sim/rpg/characters';
import { startingLoadoutFor } from '../sim/rpg/run';
import { type MetaUpgrades } from '../sim/rpg/meta';
import { THEMES, themeById, resolveBiome, type Arc } from '../sim/course/themes';
import type { Rarity, Wind } from '../sim/course/contract';

// ── descriptive statistics (pure helpers) ─────────────────────────────────────────────────
export interface Stats {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  /** 10th / 50th (median) / 90th percentiles. */
  p10: number;
  p50: number;
  p90: number;
}

const pct = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i]!;
};

export function summary(xs: number[]): Stats {
  const n = xs.length;
  if (n === 0) return { n: 0, mean: 0, sd: 0, min: 0, max: 0, p10: 0, p50: 0, p90: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    n,
    mean,
    sd: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[n - 1]!,
    p10: pct(sorted, 10),
    p50: pct(sorted, 50),
    p90: pct(sorted, 90),
  };
}

export interface Bin {
  lo: number;
  hi: number;
  count: number;
}

/** Equal-width histogram over [min, max]. `bins` defaults to a Freedman-ish ~sqrt(n). */
export function histogram(xs: number[], bins?: number): Bin[] {
  if (xs.length === 0) return [];
  const k = Math.max(1, bins ?? Math.round(Math.sqrt(xs.length)));
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (hi === lo) hi = lo + 1; // degenerate: one non-empty bin
  const w = (hi - lo) / k;
  const out: Bin[] = Array.from({ length: k }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, count: 0 }));
  for (const x of xs) {
    const idx = Math.min(k - 1, Math.floor((x - lo) / w));
    out[idx]!.count++;
  }
  return out;
}

// ── club dispersion study — "hit the driver N times" ───────────────────────────────────────
// Fire one club N times from the origin straight downrange (+Y, bearing 0) and collect where
// the ball comes to rest. With bearing 0 the sim's frame makes landing = [lateral, carry], so
// x is the left/right miss and y is the carry — a true top-down shot pattern.

export interface ShotSample {
  /** Left(−)/right(+) miss, yards. */
  lateral: number;
  /** Downrange carry, yards. */
  carry: number;
  /** A caddy-guard (Space Ducks / Convict Sheep) knocked this shot back onto the fairway (GS-caddy). */
  redirected?: boolean;
  /** The WOULD-BE miss the guard saved (where the hook/shank would have come down) — for the chart. */
  origLateral?: number;
  origCarry?: number;
}

export interface DispersionStudy {
  clubId: string;
  clubName: string;
  n: number;
  /** Intended (pre-noise) carry for this club on this lie — the bullseye the cone centres on. */
  intended: number;
  /** Net dispersion multiplier applied (handicap skill × equipment), 1 = a robot. */
  dispersionMult: number;
  lie: string;
  wind?: Wind;
  samples: ShotSample[];
  carry: Stats;
  lateral: Stats;
  /** Fraction of shots a caddy-guard redirected back onto the fairway (GS-caddy) — undefined if the
   *  built loadout has no guard caddy (Space Ducks / Convict Sheep). Lets the Lab VERIFY the
   *  interception rate the live game only shows on a rare right-side miss. */
  redirectRate?: number;
  /** The guard's projectile flavour, when one is active. */
  guardKind?: 'laser' | 'boomerang';
}

export interface DispersionOpts {
  /** Number of swings. Default 1000. */
  n?: number;
  /** Lie to hit from (LIE_INFO key — fairway, rough, bunker, tee, …). Default 'fairway'. */
  lie?: string;
  wind?: Wind;
  /** A built loadout: its bag sets per-club carry (distance perks), its skill sets the spread. */
  loadout?: PlayerLoadout;
  /** Biome carry multiplier (low-gravity worlds carry further). Default 1. */
  carryMult?: number;
  /** Star-travel theme (GS-17): its resolved biome sets carryMult unless one is given explicitly. */
  themeId?: string;
  /** Selected golfer (GS-18): its per-club shot SHAPE (fade/hook bias + per-club spread) is applied. */
  characterId?: string;
  /** Seed for the swing stream — same seed ⇒ same pattern. Default derives from the club id. */
  seed?: number | string;
}

export function dispersionStudy(clubId: string, opts: DispersionOpts = {}): DispersionStudy {
  const n = Math.max(1, Math.floor(opts.n ?? 1000));
  const lie = opts.lie ?? 'fairway';
  // A chosen theme (GS-17) sets the world's gravity (carry) unless an explicit carryMult overrides.
  const carryMult =
    opts.carryMult ?? (opts.themeId ? resolveBiome(themeById(opts.themeId)!).carryMult : undefined);
  const bag = opts.loadout?.bag ?? CLUBS;
  const club: Club | undefined = clubById(clubId, bag);
  if (!club) throw new Error(`unknown club "${clubId}"`);
  // The golfer's per-club shape (GS-18): folds its dispersion into the spread and rotates the
  // pattern by its fade/hook bias — exactly as executeShot does in the real round.
  const shotMods = characterShotMods(opts.characterId);
  const mods = shotMods ? shotMods(club.carry) : NEUTRAL_SHOT_MODS;
  const baseMult = opts.loadout ? netDispersion(opts.loadout) : 1;
  const dispersionMult = baseMult * mods.dispMult;
  // The asymmetric spray shape (GS-dispersion-2): the loadout's shaping upgrades folded with this
  // club's character skew, and the loadout's distance-control carry-window tweaks by club category.
  const shape = resolveShape(opts.loadout?.shapeMod, mods.shape);
  const cw = carryControlFor(club.carry, {
    minCarryBoost: opts.loadout?.minCarryBoost,
    wedgeWindow: opts.loadout?.wedgeWindow,
  });
  const rng = makeRng(opts.seed ?? `lab:disp:${clubId}:${n}`);

  // Caddy effects that change a SAMPLED shot ride the built loadout, so toggling a caddy in the Lab
  // shows up here: the in-flight guard (Space Ducks / Convict Sheep — knocks a right/left miss back to
  // the green) and Sandy's lie relief (a bad lie carries more). Absent on a base loadout → no-op.
  const guard = opts.loadout?.caddyGuard;
  const lieRelief = opts.loadout?.lieRelief;
  const lefty = opts.loadout?.lefty;

  const from: [number, number] = [0, 0];
  const aim: [number, number] = [0, 100]; // straight downrange (+Y) ⇒ shot bearing 0
  const samples: ShotSample[] = [];
  let intended = 0;
  let redirects = 0;
  for (let i = 0; i < n; i++) {
    const res = resolveShot({
      from,
      aim,
      club,
      lie: lie as never, // LIE_INFO key; FeatureKind at the type boundary
      wind: opts.wind,
      carryMult,
      dispersionMult,
      angleBias: mods.angleBias,
      shape,
      minCarryFracBoost: cw.minCarryFracBoost,
      carryWindowTighten: cw.carryWindowTighten,
      guard,
      lieRelief,
      lefty,
      rng,
    });
    intended = res.intended;
    if (res.redirect) redirects++;
    samples.push({
      lateral: res.landing[0],
      carry: res.landing[1],
      redirected: !!res.redirect,
      origLateral: res.redirect?.originalLanding[0],
      origCarry: res.redirect?.originalLanding[1],
    });
  }

  return {
    clubId,
    clubName: club.name,
    n,
    intended,
    dispersionMult,
    lie,
    wind: opts.wind,
    samples,
    carry: summary(samples.map((s) => s.carry)),
    lateral: summary(samples.map((s) => s.lateral)),
    redirectRate: guard ? redirects / n : undefined,
    guardKind: guard?.kind,
  };
}

// ── caddy effect summary — "what did this caddy change?" ────────────────────────────────────
// Every NAMED caddy (GS-caddy) folds a field into the loadout. This pure helper reads the BUILT
// loadout and names each active caddy/loadout effect so the Lab can SHOW that a hired caddy did
// something — the per-caddy counterpart to the dispersion/scoring studies. Because each named caddy
// maps to a field here, `tests/lab.test.ts` asserts every caddy in NAMED_CADDY_IDS surfaces an
// effect — the machine-checked "a new caddy must be demoable in the harness" rule.

export interface CaddyEffect {
  /** Loadout field the effect rides. */
  id: string;
  label: string;
  detail: string;
}

export function caddyEffects(loadout: PlayerLoadout): CaddyEffect[] {
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  const out: CaddyEffect[] = [];
  if (loadout.autoPutt) out.push({ id: 'autoPutt', label: 'Auto-putt', detail: 'caddy reads & sinks your putts' });
  if (loadout.driverAnywhere)
    out.push({ id: 'driverAnywhere', label: 'Driver anywhere', detail: 'driver usable from any lie at full stats' });
  if (loadout.chipInBoost)
    out.push({ id: 'chipInBoost', label: 'Chip-in', detail: `+${pct(loadout.chipInBoost)} to hole a wedge near the pin` });
  if (loadout.caddyGuard) {
    const g = loadout.caddyGuard;
    out.push({
      id: 'caddyGuard',
      label: `Guard · ${g.kind}`,
      detail: `${Object.entries(g.redirect).map(([z, p]) => `${Math.round((p as number) * 100)}% ${z}`).join(', ') || '—'} → fairway`,
    });
  }
  if (loadout.clubSuggest)
    out.push({ id: 'clubSuggest', label: 'Club suggestion', detail: 'green-coverage pick + confidence boost on it' });
  if (loadout.lieRelief)
    out.push({ id: 'lieRelief', label: 'Lie relief', detail: `bad-lie penalty eased ${pct(loadout.lieRelief)} toward neutral` });
  if (loadout.puttBoost)
    out.push({ id: 'puttBoost', label: 'Putt boost', detail: `+${fmtNum(loadout.puttBoost)} make-band / lag` });
  return out;
}

const fmtNum = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : '—');

// ── loadout builder — "test club/path/skill upgrades" ──────────────────────────────────────
// Compose a real PlayerLoadout from a handicap, the permanent meta layer, and owned shop perks
// (a multiset — a stackable id repeated buys multiple copies, exactly as the run does). Surface
// the derived stats the upgrades move so a tweak's effect is legible before you play it.

export interface BuiltLoadout {
  loadout: PlayerLoadout;
  /** handicap skill × equipment — what `resolveShot` actually samples. Lower = tighter. */
  netDispersion: number;
  handicap: number;
  /** The handicap-only dispersion factor (~0.7 scratch → ~1.6 at 36). */
  handicapDispersion: number;
  autoPutt: boolean;
  creditMult: number;
  /** Per-club carries AFTER distance-boost perks (Power Cell, Tour Bag, …). */
  clubs: { id: string; name: string; carry: number }[];
}

export interface BuildOpts {
  /** Explicit handicap override (else taken from the meta-baked starting loadout). */
  handicap?: number;
  meta?: MetaUpgrades;
  /** Selected golfer (GS-18): its bag/dispersion tweak layers on the meta base, under the perks. */
  characterId?: string;
  /** Owned shop-perk ids; repeat an id to stack it (Caddie Lesson ×3 = [id,id,id]). */
  perks?: string[];
}

export function buildLoadout(opts: BuildOpts = {}): BuiltLoadout {
  // Golfer's signature bag → meta upgrades baked on top → handicap override → shop perks (incl. reward
  // clubs) — the SAME construction the run uses (startingLoadoutFor), so the lab matches play exactly.
  let base = startingLoadoutFor(opts.meta ?? {}, opts.characterId);
  // The handicap slider sets the STARTING handicap; perks (Pro Coach, Caddie Lesson) then
  // reduce from it — so the override goes on the base, BEFORE perks fold on top.
  if (opts.handicap != null) base = { ...base, handicap: Math.max(0, Math.min(36, opts.handicap)) };
  const loadout = loadoutFromPerks(opts.perks ?? [], base);
  return {
    loadout,
    netDispersion: netDispersion(loadout),
    handicap: loadout.handicap,
    handicapDispersion: handicapDispersion(loadout.handicap),
    autoPutt: !!loadout.autoPutt,
    creditMult: loadout.creditMult,
    clubs: loadout.bag.map((c) => ({ id: c.id, name: c.name, carry: c.carry })),
  };
}

// ── scoring harness — "does this upgrade actually score better?" ────────────────────────────
// Run whole seeded runs through the REAL meta-loop (`simulateRun`) and report the project's
// canonical balance metric: mean per-stop Stableford (NOT full-run distance, which is chaotic —
// see CLAUDE.md). The meta layer bakes into the start; the chosen perks are bought each stop
// (`buy()` is a safe no-op when unaffordable or maxed, so just listing them is enough).

export interface ScoreResult {
  seeds: number;
  /** The headline balance number. */
  meanStablefordPerStop: number;
  /** Average stops survived before the cut (how far the build travels). */
  meanStops: number;
  meanDistance: number;
  /** Share of stops that were blow-ups (0 Stableford) — the death-spiral tail. */
  blowUpRate: number;
  perStop: Stats;
}

export interface ScoreOpts {
  /** How many seeded runs to average. Default 60. */
  seeds?: number;
  /** First seed; runs use baseSeed..baseSeed+seeds-1. Default 1. */
  baseSeed?: number;
  formatId?: string;
  meta?: MetaUpgrades;
  /** Selected golfer (GS-18) baked into the simulated runs. */
  characterId?: string;
  /** Shop-perk ids to buy each stop (repeat to stack). */
  perks?: string[];
}

export function scoreHarness(opts: ScoreOpts = {}): ScoreResult {
  const seeds = Math.max(1, Math.floor(opts.seeds ?? 60));
  const baseSeed = opts.baseSeed ?? 1;
  const perks = opts.perks ?? [];
  const strategy: RunStrategy = {
    formatId: opts.formatId,
    meta: opts.meta,
    characterId: opts.characterId,
    shop: perks.length ? () => perks : undefined,
  };

  const stablefords: number[] = [];
  let totalStops = 0;
  let totalDistance = 0;
  let blowUps = 0;
  for (let s = 0; s < seeds; s++) {
    const { run, stops } = simulateRun(baseSeed + s, strategy);
    for (const st of stops) {
      stablefords.push(st.stableford);
      if (st.stableford <= 0) blowUps++;
    }
    totalStops += stops.length;
    totalDistance += run.distanceFromStart;
  }
  const perStop = summary(stablefords);
  return {
    seeds,
    meanStablefordPerStop: perStop.mean,
    meanStops: totalStops / seeds,
    meanDistance: totalDistance / seeds,
    blowUpRate: stablefords.length ? blowUps / stablefords.length : 0,
    perStop,
  };
}

// ── theme browser — "what does each star-travel theme DO?" (GS-17) ──────────────────────────
// Resolve a theme to its rarity-tiered, flavoured biome (the REAL `resolveBiome`) and report the
// physics it produces, so the Sim Lab can browse every constellation/galaxy and see how its world
// plays. Pure: it only reads the content tables + the real resolver — re-implements nothing.

export interface ThemeStudy {
  id: string;
  name: string;
  kind: string;
  arc: Arc;
  rarity: Rarity;
  archetype: string;
  anchor: string;
  blurb: string;
  /** True for constellations (they draw a sky figure); deep-sky/galaxies fall back to the starfield. */
  hasFigure: boolean;
  /** The resolved biome physics this theme generates its course from. */
  biome: {
    id: string;
    carryMult: number;
    windBase: number;
    windWild: number;
    fairwayWidthMult: number;
    doglegBias: number;
    treeDensity: number;
    fairwayBunkers: number;
  };
}

export function themeStudy(themeId: string): ThemeStudy {
  const t = themeById(themeId);
  if (!t) throw new Error(`unknown theme "${themeId}"`);
  const b = resolveBiome(t);
  return {
    id: t.id,
    name: t.name,
    kind: t.kind,
    arc: t.arc,
    rarity: t.rarity,
    archetype: t.archetype,
    anchor: t.anchor,
    blurb: t.blurb,
    hasFigure: t.kind === 'constellation',
    biome: {
      id: b.id,
      carryMult: b.carryMult,
      windBase: b.windBase,
      windWild: b.windWild,
      fairwayWidthMult: b.fairwayWidthMult,
      doglegBias: b.doglegBias,
      treeDensity: b.treeDensity ?? 0,
      fairwayBunkers: b.fairwayBunkers ?? 0,
    },
  };
}

/** Every theme's study, ordered by arc then rarity — the Sim Lab's theme browser list. */
export function allThemeStudies(): ThemeStudy[] {
  return THEMES.map((t) => themeStudy(t.id));
}
