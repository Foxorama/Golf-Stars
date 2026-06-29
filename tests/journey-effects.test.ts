import { describe, it, expect } from 'vitest';
import { routeDifficulty, routeEffect, COURSE_EFFECTS, type CourseEffectId } from '../src/sim/rpg/effects';
import { DEFAULT_EVENT, ROUTE_EVENTS, type RouteEvent } from '../src/sim/rpg/events';
import { startRun, currentCourse } from '../src/sim/rpg/run';

const ev = (over: Partial<RouteEvent>): RouteEvent => ({ ...DEFAULT_EVENT, ...over });

describe('route difficulty (GS-journey-fx)', () => {
  it('is 0 for no event / the neutral open-space default', () => {
    expect(routeDifficulty(undefined)).toBe(0);
    expect(routeDifficulty(DEFAULT_EVENT)).toBe(0);
  });

  it('rises with the event cut delta and clamps to a safe band', () => {
    expect(routeDifficulty(ev({ cutDelta: -1 }))).toBeLessThan(0); // a calm lane = gentler course
    expect(routeDifficulty(ev({ cutDelta: 2 }))).toBeGreaterThan(0); // a harder lane = wilder course
    // Monotonic in cutDelta.
    expect(routeDifficulty(ev({ cutDelta: 3 }))).toBeGreaterThan(routeDifficulty(ev({ cutDelta: 1 })));
    // Clamped both ends so generated wildness stays inside the proven-safe [0.05, 1] envelope.
    expect(routeDifficulty(ev({ cutDelta: 99 }))).toBeLessThanOrEqual(0.25);
    expect(routeDifficulty(ev({ cutDelta: -99 }))).toBeGreaterThanOrEqual(-0.15);
  });
});

describe('route effect mapping (GS-journey-fx)', () => {
  it('open space brings no effect', () => {
    expect(routeEffect(DEFAULT_EVENT)).toBe('none');
    expect(routeEffect(undefined)).toBe('none');
  });

  it('maps thematic events to their flavour, else the category', () => {
    expect(routeEffect(ev({ id: 'full-moon', icon: '🌕' }))).toBe('moonlight');
    expect(routeEffect(ev({ id: 'meteor-drizzle', icon: '☄️' }))).toBe('meteorShower');
    expect(routeEffect(ev({ id: 'solar-flare', icon: '⚡' }))).toBe('solarStorm');
    // Category fallback when the id/icon isn't thematic.
    expect(routeEffect(ev({ id: 'plain-payout', icon: '💰', category: 'payout' }))).toBe('aurora');
    expect(routeEffect(ev({ id: 'plain-toll', icon: '💰', category: 'toll' }))).toBe('solarStorm');
    expect(routeEffect(ev({ id: 'plain-salvage', icon: '💰', category: 'salvage' }))).toBe('spaceJunk');
  });

  it('every catalogue event resolves to a known effect with a card info row', () => {
    for (const e of ROUTE_EVENTS) {
      const fx = routeEffect(e);
      expect(COURSE_EFFECTS[fx], `${e.id} → ${fx}`).toBeDefined();
      expect(COURSE_EFFECTS[fx].icon.length).toBeGreaterThan(0);
    }
    // The info table covers exactly the union.
    const ids: CourseEffectId[] = ['none', 'moonlight', 'meteorShower', 'solarStorm', 'aurora', 'spaceJunk', 'tradeMarket'];
    for (const id of ids) expect(COURSE_EFFECTS[id].id).toBe(id);
  });
});

describe('the chosen route materially changes the course (GS-journey-fx)', () => {
  it('a harder lane generates a wilder course; an easier lane a gentler one (same seed/stop)', () => {
    const base = startRun(42, 'voyage');
    const none = currentCourse(base).meta.wildness;
    const hard = currentCourse({ ...base, pendingEvent: ev({ cutDelta: 3 }) }).meta.wildness;
    const easy = currentCourse({ ...base, pendingEvent: ev({ cutDelta: -1 }) }).meta.wildness;
    expect(hard).toBeGreaterThan(none); // the wildness boost actually lands on the generated course
    expect(easy).toBeLessThan(none);
    expect(hard).toBeLessThanOrEqual(1); // never beyond the proven-safe max
    expect(easy).toBeGreaterThanOrEqual(0.05);
  });

  it('stamps the route effect on the course meta, and stop 0 / no event is unflavoured', () => {
    const base = startRun(7, 'voyage');
    expect(currentCourse(base).meta.effect).toBeUndefined(); // no pending event ⇒ no effect stamp
    const flavoured = currentCourse({ ...base, pendingEvent: ev({ id: 'full-moon', icon: '🌕', cutDelta: 0 }) });
    expect(flavoured.meta.effect).toBe('moonlight');
    // A cutDelta-0 event leaves wildness identical to the no-event course (only flavour changed).
    expect(flavoured.meta.wildness).toBe(currentCourse(base).meta.wildness);
  });
});
