/**
 * COURSE COMPOSITION LAYER (GS-compose).
 *
 * The per-hole generator (`generateHole`) draws each hole as an INDEPENDENT, identically-distributed
 * sample — so a 6/9/18-hole stop is N samples from one distribution and reads as "the same 2–3 holes
 * replayed". Real courses are COMPOSED, not sampled: a deliberate par sequence, hole-to-hole contrast,
 * a signature short/heroic hole, and a difficulty ARC (gentle open → teeth in the closing stretch)
 * rather than a flat wildness.
 *
 * This module plans that composition — it is PURE and deterministic (a dedicated `${seed}:compose`
 * side stream), and it decides only WHAT each hole should be (par, per-hole wildness, an optional
 * length signature). `generateHole` consumes the plan; adjacent-shape contrast is layered on in the
 * generation loop (which is the only place that knows the shape a hole actually drew).
 *
 * DETERMINISM CONTRACT: composition is OPT-IN (`GenerateOptions.compose`). With it off (every direct
 * `generateCourse` test, every single-hole slice) the generator is byte-for-byte unchanged — this
 * module is never even called. Only the real run path (`runCourse.currentCourse`) and the composition
 * tests opt in. Balance is preserved by construction: the difficulty arc is MEAN-PRESERVING (the
 * per-hole wildness offsets sum to ~0, so the stop's average wildness equals the course wildness the
 * death-spiral bar is tuned against) and the par mix tracks the generator's own ~25/55/20 proportions,
 * so the composed stop is the same difficulty on average — just varied hole to hole. Guarded by the
 * composed death-spiral bar in `tests/compose.test.ts`.
 */

import { Rng } from '../rng';

/**
 * A composed plan for a single hole. `generateHole` reads `par` (forced, overriding its own par roll)
 * and `wildness` (the per-hole arc value, replacing the flat course wildness); `lengthClass` biases
 * the template's length toward a signature short/heroic hole; `avoidShape` (set by the generation
 * loop, not the planner) is the previous hole's shape family, used to break adjacent-shape repeats.
 */
export interface HolePlan {
  par: 3 | 4 | 5;
  /** Per-hole wildness (the difficulty arc). Mean over a stop ≈ the course wildness. */
  wildness: number;
  /** Signature length bias: a heroic drivable par-4 or a stout long hole. Absent = the natural roll. */
  lengthClass?: 'drivable' | 'long';
  /** Shape family the PREVIOUS hole drew — the generator avoids repeating it (set by the loop). */
  avoidShape?: string;
}

/** Amplitude of the per-hole wildness arc (a per-hole delta of roughly ±0.09 around the course value). */
const ARC_AMP = 0.14;

/**
 * Plan a whole stop (GS-compose). Returns one `HolePlan` per hole. Pure & deterministic off a
 * dedicated `${seed}:compose` stream, so it perturbs no other generator stream.
 */
/** Default par proportions — the generator's own ~25/53/22 mix (round(n·0.25) par-3s, round(n·0.22) par-5s). */
const DEFAULT_PAR_MIX = { p3: 0.25, p4: 0.53, p5: 0.22 };

export function planCourse(
  seed: string | number,
  holeCount: number,
  wildness: number,
  opts: {
    parCap?: 3 | 4 | 5;
    signatures?: boolean;
    parMix?: { p3: number; p4: number; p5: number };
    /**
     * Per-hole DIFFICULTY MIX (GS-star-tour-difficulty): when set, each hole draws its wildness at
     * random from these discrete levels instead of the smooth mean-preserving arc — so a course mixes
     * (say) medium and hard holes and can legitimately come out all-medium or all-hard. Used by the
     * Star Tour records mode, which wants real golf-course teeth rather than the calm arc the Voyage's
     * death-spiral balance is tuned to. Absent ⇒ the arc, byte-for-byte the old composition.
     */
    wildnessMix?: readonly number[];
  } = {},
): HolePlan[] {
  const rng = new Rng(`${seed}:compose`);
  const n = Math.max(1, holeCount);
  const pars = planPars(rng, n, opts.parCap, opts.parMix ?? DEFAULT_PAR_MIX);
  const mix = opts.wildnessMix && opts.wildnessMix.length > 0 ? opts.wildnessMix : undefined;
  const wilds = mix ? planWildnessMix(rng, n, mix) : planWildness(rng, n, wildness);
  const plans: HolePlan[] = pars.map((par, i) => ({ par, wildness: wilds[i]! }));
  // Signature length holes (a heroic drivable par-4, a stout long hole) — skipped on lost/ship worlds
  // (a drivable island-hop is nonsense) and on par-capped ladders (no length room). The caller passes
  // `signatures: false` for those.
  if (opts.signatures !== false && !opts.parCap && n >= 4) assignSignatures(rng, plans);
  return plans;
}

/**
 * Build the par multiset and ORDER it for contrast: proportions track the generator's own natural mix
 * (~25% par-3, ~22% par-5, rest par-4), a par-3 AND a par-5 are guaranteed once the stop is long
 * enough to hold them, and no par repeats three times in a row (consecutive PAIRS are fine — real
 * courses have back-to-back par-4s — but a triple reads as "the same hole again").
 */
function planPars(rng: Rng, n: number, parCap: 3 | 4 | 5 | undefined, mix: { p3: number; p4: number; p5: number }): (3 | 4 | 5)[] {
  const cap = parCap ?? 5;
  if (cap === 3) return Array.from({ length: n }, () => 3 as const);

  // Proportions from the (normalised) mix — the default reproduces round(n·0.25)/round(n·0.22) exactly.
  const total = mix.p3 + mix.p4 + mix.p5 || 1;
  let p3 = Math.min(n, Math.max(n >= 4 ? 1 : 0, Math.round((n * mix.p3) / total)));
  let p5 = cap >= 5 ? Math.min(n - p3, Math.max(n >= 5 ? 1 : 0, Math.round((n * mix.p5) / total))) : 0;
  let p4 = n - p3 - p5;
  // Guarantee at least one par-4 (the workhorse) when there's room, trimming the longest bucket.
  if (p4 < 1 && n >= 3) {
    if (p5 > p3 && p5 > 0) p5--;
    else if (p3 > 0) p3--;
    p4 = n - p3 - p5;
  }

  // Order the multiset for contrast: greedily place the par with the MOST remaining (spreads the
  // dominant par-4s out) but never one that would form a triple with the previous two, with an rng
  // tie-break so equal-count routings vary. This guarantees no run of three identical pars whenever
  // the counts allow it (they do for any sane mix), which the swap-a-single-offender approach could
  // not (a triple near the tail had no later hole to swap with).
  const remaining: Record<3 | 4 | 5, number> = { 3: p3, 4: p4, 5: p5 };
  const out: (3 | 4 | 5)[] = [];
  const kinds: (3 | 4 | 5)[] = [3, 4, 5];
  while (out.length < n) {
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    const banned = prev !== undefined && prev === prev2 ? prev : undefined;
    let cands = kinds.filter((k) => remaining[k] > 0 && k !== banned);
    if (cands.length === 0) cands = kinds.filter((k) => remaining[k] > 0); // forced (shouldn't happen)
    const maxRem = Math.max(...cands.map((k) => remaining[k]));
    const top = cands.filter((k) => remaining[k] === maxRem);
    const pick = top[rng.int(0, top.length - 1)]!;
    out.push(pick);
    remaining[pick]--;
  }
  return out;
}

/**
 * The difficulty ARC (GS-compose): a per-hole wildness that opens gentle and builds toward the
 * closing stretch, with a small seeded jitter so it isn't a flat linear ramp (a mid-round breather
 * or a spike is what makes a routing feel designed, not monotone). MEAN-PRESERVING — the offsets are
 * re-centred to sum to zero, so the stop's average wildness equals `wildness` and the death-spiral
 * balance is untouched; only the hole-to-hole texture changes.
 */
function planWildness(rng: Rng, n: number, wildness: number): number[] {
  if (n < 2) return [wildness];
  // Raw offset: a linear build from tee (−0.5) to finish (+0.5) plus a small breather/spike jitter.
  const raw = Array.from({ length: n }, (_, i) => {
    const u = i / (n - 1);
    return u - 0.5 + rng.range(-0.16, 0.16);
  });
  const mean = raw.reduce((s, v) => s + v, 0) / n;
  return raw.map((v) => Math.max(0.05, Math.min(1, wildness + ARC_AMP * (v - mean))));
}

/**
 * The per-hole DIFFICULTY MIX (GS-star-tour-difficulty): each hole INDEPENDENTLY draws one of the
 * discrete `levels` at random — NOT a mean-preserving arc — so the course mixes those difficulty
 * levels hole to hole and can come out entirely one level. Clamped to the generator's [0.05, 1]
 * wildness range. Used by Star Tour (solo records mode); the Voyage never passes a mix, so its arc
 * (and its death-spiral balance) is untouched.
 */
function planWildnessMix(rng: Rng, n: number, levels: readonly number[]): number[] {
  return Array.from({ length: n }, () => {
    const w = levels[rng.int(0, levels.length - 1)]!;
    return Math.max(0.05, Math.min(1, w));
  });
}

/**
 * Mark 1–2 signature holes (GS-compose): a heroic DRIVABLE par-4 (one of golf's most exciting holes)
 * and, on a longer stop, a stout LONG hole for contrast. Chosen from the compose stream among the
 * eligible pars so the same stop always designates the same signatures.
 */
function assignSignatures(rng: Rng, plans: HolePlan[]): void {
  const par4s = plans.map((p, i) => (p.par === 4 ? i : -1)).filter((i) => i >= 0);
  if (par4s.length > 0) {
    const drivable = rng.pick(par4s);
    plans[drivable]!.lengthClass = 'drivable';
    // A long signature: a different long-capable hole (par-4 or par-5), only when the stop is big
    // enough that spending one hole on each signature still leaves variety.
    if (plans.length >= 6) {
      const longs = plans
        .map((p, i) => ((p.par === 4 || p.par === 5) && i !== drivable ? i : -1))
        .filter((i) => i >= 0);
      if (longs.length > 0) plans[rng.pick(longs)]!.lengthClass = 'long';
    }
  }
}

/** The shape FAMILY of a generated hole (from its `shapeId`) — used for adjacent-shape contrast. */
export function shapeFamilyOf(shapeId?: string): string | undefined {
  if (!shapeId) return undefined;
  if (shapeId.includes('hairpin')) return 'hairpin';
  if (shapeId.includes('cape')) return 'cape';
  if (shapeId.includes('double')) return 'double';
  if (shapeId.includes('drivable')) return 'drivable';
  if (shapeId.includes('dogleg') || shapeId.includes('angled')) return 'dogleg';
  if (shapeId.includes('island')) return 'island';
  return 'straight';
}
