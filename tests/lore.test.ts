import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { withLoreGate } from '../src/ui/gameUpdates';
import {
  LORE_EVENTS,
  pickLoreEvent,
  loreEventById,
  type LoreContext,
} from '../src/sim/rpg/lore';
import { lorePortraitSVG } from '../src/render/loreArt';
import { generateCourse } from '../src/sim/course/generate';
import { CHARACTERS } from '../src/sim/rpg/characters';

/** A base arrival context — a plain world with no caddy. Override per case. */
const BASE: LoreContext = {
  biome: 'verdant-station',
  archetype: 'verdant',
  caddyId: undefined,
  characterId: CHARACTERS[0]!.id,
  format: 'voyage',
  stopIndex: 3,
};

/** An arrival at the derelict wreck with Driver Dan on the bag — the trigger for the first beat. */
const DERELICT_DAN: LoreContext = {
  ...BASE,
  biome: 'derelict-ship',
  archetype: 'derelict',
  caddyId: 'driver-dan',
};

describe('lore table (GS-lore) — pure pickLoreEvent', () => {
  it('the Driver-Dan-at-the-derelict beat fires only for derelict + Driver Dan, when unseen', () => {
    const e = pickLoreEvent(DERELICT_DAN, {});
    expect(e?.id).toBe('driver-dan-derelict');
  });

  it('does NOT fire once the beat has been seen (once-only)', () => {
    expect(pickLoreEvent(DERELICT_DAN, { 'driver-dan-derelict': true })).toBeUndefined();
  });

  it('does NOT fire on another world, even with Driver Dan', () => {
    expect(pickLoreEvent({ ...DERELICT_DAN, biome: 'ember-world', archetype: 'inferno' }, {})).toBeUndefined();
  });

  it('does NOT fire at the derelict with a different caddy or no caddy', () => {
    expect(pickLoreEvent({ ...DERELICT_DAN, caddyId: 'dr-chipinski' }, {})).toBeUndefined();
    expect(pickLoreEvent({ ...DERELICT_DAN, caddyId: undefined }, {})).toBeUndefined();
  });

  it('is a pure function of (context, seen) — same inputs, same result', () => {
    expect(pickLoreEvent(DERELICT_DAN, {})?.id).toBe(pickLoreEvent(DERELICT_DAN, {})?.id);
  });

  it('every event has a stable id, a trigger, a portrait, and at least one line', () => {
    const ids = new Set<string>();
    for (const e of LORE_EVENTS) {
      expect(e.id).toBeTruthy();
      expect(ids.has(e.id)).toBe(false); // ids never reused
      ids.add(e.id);
      expect(typeof e.trigger).toBe('function');
      expect(e.portrait).toBeTruthy();
      expect(e.lines.length).toBeGreaterThan(0);
    }
  });

  it('loreEventById resolves a real beat and shrugs off unknown/undefined ids', () => {
    expect(loreEventById('driver-dan-derelict')?.speaker).toBe('Driver Dan');
    expect(loreEventById('nope')).toBeUndefined();
    expect(loreEventById(undefined)).toBeUndefined();
  });

  it('lorePortraitSVG paints Driver Dan and returns empty for an unknown portrait', () => {
    const svg = lorePortraitSVG('driver-dan');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Driver Dan'); // aria-label
    expect(lorePortraitSVG('who?')).toBe('');
  });
});

/** Inject a hired caddy into a run's loadout (what owning that caddy means to the gate). */
function withCaddy(s: UiState, caddyId: string): UiState {
  return { ...s, run: { ...s.run, loadout: { ...s.run.loadout, perks: [...s.run.loadout.perks, caddyId] } } };
}

/** Drive a Star Tour run up to the point a course is picked, with Driver Dan on the bag. */
function starTourWithDan(): UiState {
  let s = initState('lore-seed');
  s = reduce(s, { type: 'openStarTour' });
  s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
  expect(s.screen).toBe('starTour');
  return withCaddy(s, 'driver-dan');
}

describe('lore arrival gate (GS-lore) — reducer flow, mode-agnostic', () => {
  it('arriving at the derelict wreck with Driver Dan diverts the intro to the lore beat', () => {
    const arrived = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'derelict-18' });
    expect(arrived.course.biome).toBe('derelict-ship');
    expect(arrived.screen).toBe('lore');
    expect(arrived.pendingLoreId).toBe('driver-dan-derelict');
  });

  it('dismissing the beat marks it seen and continues to the stop intro', () => {
    const lore = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'derelict-18' });
    const after = reduce(lore, { type: 'dismissLore' });
    expect(after.screen).toBe('intro');
    expect(after.pendingLoreId).toBeUndefined();
    expect(after.seenLore['driver-dan-derelict']).toBe(true);
  });

  it('the beat never fires a second time once seen (arriving again lands straight on the intro)', () => {
    const lore = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'derelict-18' });
    const seen = reduce(lore, { type: 'dismissLore' }); // seenLore now records it
    // Re-arrive at the same wreck with Dan still aboard — the gate must NOT re-divert.
    const again = withLoreGate({ ...seen, screen: 'intro' });
    expect(again.screen).toBe('intro');
    expect(again.pendingLoreId).toBeUndefined();
  });

  it('a non-derelict arrival with Driver Dan is untouched (no misfire)', () => {
    const s = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'verdant-18' });
    expect(s.screen).toBe('intro');
    expect(s.pendingLoreId).toBeUndefined();
  });

  it('the gate is a no-op off the intro screen', () => {
    const s = starTourWithDan(); // screen: 'starTour'
    expect(withLoreGate(s).screen).toBe('starTour');
  });

  it('withLoreGate reads the live caddy — a derelict arrival WITHOUT Driver Dan stays on the intro', () => {
    let s = initState('lore-seed-2');
    // Hand-build an honest "arrived at the derelict" intro state (no caddy on the bag).
    const course = generateCourse('gs-lore-test', { biome: 'derelict-ship', holes: 4, wildness: 0.6 });
    s = { ...s, screen: 'intro', course, run: { ...s.run, stopIndex: 2 } };
    expect(s.course.biome).toBe('derelict-ship');
    const gated = withLoreGate(s);
    expect(gated.screen).toBe('intro');
    expect(gated.pendingLoreId).toBeUndefined();
    // ...but add Driver Dan and the SAME arrival now diverts.
    expect(withLoreGate(withCaddy(s, 'driver-dan')).screen).toBe('lore');
  });
});
