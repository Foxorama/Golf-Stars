import { describe, it, expect } from 'vitest';
import { Rng, hashSeed, makeRng } from '../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for a given numeric seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 50 }, () => a.float());
    const seqB = Array.from({ length: 50 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 20 }, () => new Rng(1).float());
    const b = Array.from({ length: 20 }, () => new Rng(2).float());
    expect(a).not.toEqual(b);
  });

  it('keeps float() in [0,1) and int() within inclusive bounds', () => {
    const r = makeRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  it('hashes string seeds stably and seeds from strings', () => {
    expect(hashSeed('hello')).toBe(hashSeed('hello'));
    expect(hashSeed('hello')).not.toBe(hashSeed('world'));
    const r1 = new Rng('daily-2026-06-24');
    const r2 = new Rng('daily-2026-06-24');
    expect(r1.float()).toBe(r2.float());
  });

  it('fork() derives an independent but reproducible child', () => {
    const child1 = new Rng(99).fork().float();
    const child2 = new Rng(99).fork().float();
    expect(child1).toBe(child2);
  });
});
