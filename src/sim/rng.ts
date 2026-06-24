/**
 * Seeded, deterministic PRNG — the ONLY source of randomness in the sim.
 *
 * `Math.random()` is banned in `src/sim/` (see CLAUDE.md): it breaks reproducible
 * runs, daily seeds, save/restore, and reproducible test failures. Thread an `Rng`
 * instance everywhere instead.
 *
 * Algorithm: mulberry32 — tiny, fast, good-enough statistical quality for a game,
 * and fully specified so the exact byte sequence is reproducible across machines.
 */

/** Raw mulberry32 step: state in, [0,1) float out, next state captured by closure. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash an arbitrary string into a 32-bit seed (so courses can be seeded from
 * names / daily-date strings, not just integers). xfnv1a.
 */
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private next01: () => number;
  /** The seed this generator was constructed with — persist it to reproduce a run. */
  readonly seed: number;

  constructor(seed: number | string) {
    this.seed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.next01 = mulberry32(this.seed);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next01();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next01() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (default 0.5). */
  bool(p = 0.5): boolean {
    return this.next01() < p;
  }

  /** Uniformly pick one element. Throws on empty array (a bug, not a runtime case). */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: empty array');
    return arr[this.int(0, arr.length - 1)]!;
  }

  /**
   * Approx. standard-normal sample (Box–Muller, single value) scaled by `sd`,
   * centred on `mean`. Used for shot dispersion so misses cluster near target.
   */
  gaussian(mean = 0, sd = 1): number {
    // Guard against log(0).
    const u1 = Math.max(this.next01(), 1e-12);
    const u2 = this.next01();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * sd;
  }

  /** Fork a child generator deterministically derived from this stream's next value. */
  fork(): Rng {
    return new Rng(Math.floor(this.next01() * 0xffffffff));
  }
}

/** Convenience constructor. */
export function makeRng(seed: number | string): Rng {
  return new Rng(seed);
}
