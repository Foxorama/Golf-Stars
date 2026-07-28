import { describe, it, expect } from 'vitest';
import { bossTitle, entryBeat, ENTRY_MS, ENTRY_ROAR_MS } from '../src/render/battleIntro';

/**
 * GS-story-battle-epic — the finale boss gets an ENTRANCE. The drawing lives in `storyBattle.ts` (Canvas2D,
 * DOM-bound), so what is testable here is the pure half: who the player is looking at, and the timeline the
 * beat runs on. These are the guards that keep it from silently degrading — a dial that never reaches 1
 * strands the fight behind a half-played cinematic, and a name that outgrows its plate runs off a phone.
 */
describe('finale boss entrance', () => {
  it('names both bosses, and the plate copy fits the frame it is drawn in', () => {
    const warden = bossTitle(false);
    const herald = bossTitle(true);
    expect(warden.name).toBe('JÖRMUNGANDR');
    expect(herald.name).toBe('THE WARDEN ARK');
    // both paths get an epithet — the plate is "who AND what", which is the whole point of billing
    for (const t of [warden, herald]) {
      expect(t.epithet.length).toBeGreaterThan(10);
      // the plate autosizes off the name's length; anything longer than this stops reading as a title
      expect(t.name.length).toBeLessThanOrEqual(16);
      expect(t.epithet.length).toBeLessThanOrEqual(46);
    }
    expect(warden.name).not.toBe(herald.name);
  });

  it('the beat runs its whole course: everything starts at rest and finishes seated', () => {
    const open = entryBeat(0);
    expect(open.loom).toBe(0);
    expect(open.plate).toBe(0);
    expect(open.plateAlpha).toBe(0);
    expect(open.hudIn).toBe(0);
    expect(open.roar).toBe(0);
    expect(open.streak).toBe(1); // the deep is rushing past from the first frame

    // by the time the assault takes over, the boss is fully arrived, the HUD is seated and the plate gone
    const end = entryBeat(ENTRY_MS);
    expect(end.loom).toBe(1);
    expect(end.hudIn).toBe(1);
    expect(end.plateAlpha).toBeLessThan(0.02);
    expect(end.streak).toBe(0);
  });

  it('loom and hudIn only ever go forwards, and every dial stays in 0..1', () => {
    let lastLoom = -1;
    let lastHud = -1;
    for (let e = -200; e <= ENTRY_MS + 4000; e += 25) {
      const b = entryBeat(e);
      for (const [k, v] of Object.entries(b)) {
        expect(Number.isFinite(v), `${k} @${e}`).toBe(true);
        expect(v, `${k} @${e}`).toBeGreaterThanOrEqual(0);
        expect(v, `${k} @${e}`).toBeLessThanOrEqual(1);
      }
      expect(b.loom, `loom went backwards @${e}`).toBeGreaterThanOrEqual(lastLoom);
      expect(b.hudIn, `hudIn went backwards @${e}`).toBeGreaterThanOrEqual(lastHud);
      lastLoom = b.loom;
      lastHud = b.hudIn;
    }
  });

  it('the plate has landed before the roar, and is gone before the fight starts', () => {
    // the name must be readable when the boss roars through it — that is the shot
    expect(entryBeat(ENTRY_ROAR_MS).plate).toBeGreaterThan(0.9);
    expect(entryBeat(ENTRY_ROAR_MS).plateAlpha).toBeGreaterThan(0.9);
    // …and the roar is an IMPULSE: nothing before it, a spike on it, decayed away by the handover
    expect(entryBeat(ENTRY_ROAR_MS - 1).roar).toBe(0);
    expect(entryBeat(ENTRY_ROAR_MS).roar).toBe(1);
    expect(entryBeat(ENTRY_ROAR_MS + 900).roar).toBe(0);
    expect(ENTRY_ROAR_MS).toBeLessThan(ENTRY_MS);
  });

  it('a stalled frame can only land further along the beat, never in an impossible state', () => {
    for (const e of [Number.MAX_SAFE_INTEGER, ENTRY_MS * 40, 1e12]) {
      const b = entryBeat(e);
      expect(b.loom).toBe(1);
      expect(b.hudIn).toBe(1);
      expect(b.plateAlpha).toBe(0);
      expect(b.roar).toBe(0);
    }
  });
});
