import { describe, it, expect } from 'vitest';
import { routeDifficulty, routeEffect, effectWindMult, COURSE_EFFECTS, EFFECT_WIND, EFFECT_WIND_CAP, type CourseEffectId } from '../src/sim/rpg/effects';
import { DEFAULT_EVENT, ROUTE_EVENTS, UNIQUE_EVENTS, type RouteEvent } from '../src/sim/rpg/events';
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

  it('the showpiece events read TRUE with the widened set (GS-journey-variety)', () => {
    // The dated eclipses are eclipses, not generic moonlight.
    expect(routeEffect(ev({ id: 'total-solar-eclipse', icon: '🌘' }))).toBe('eclipse');
    expect(routeEffect(ev({ id: 'partial-lunar-eclipse', icon: '🌗' }))).toBe('eclipse');
    expect(routeEffect(ev({ id: 'planetary-conjunction', icon: '🌗' }))).toBe('eclipse');
    // Comets get their own sky, distinct from a meteor shower.
    expect(routeEffect(ev({ id: 'wandering-comet', icon: '☄️' }))).toBe('comet');
    expect(routeEffect(ev({ id: 'comet-apparition', icon: '☄️' }))).toBe('comet');
    // The ion storm family is the blue storm, not the red solar one.
    expect(routeEffect(ev({ id: 'ion-storm', icon: '⚡' }))).toBe('ionStorm');
    expect(routeEffect(ev({ id: 'pulsar-wake', icon: '🌀' }))).toBe('ionStorm');
    expect(routeEffect(ev({ id: 'quasar-beacon', icon: '💠' }))).toBe('ionStorm');
    // …but 'ion' INSIDE a word (opposition, apparition) must not read as the ion storm.
    expect(routeEffect(ev({ id: 'mars-opposition', icon: '🔴' }))).toBe('solarStorm');
    // Star-forming grandeur drifts in as a nebula shroud.
    expect(routeEffect(ev({ id: 'star-nursery', icon: '🌟' }))).toBe('nebula');
    expect(routeEffect(ev({ id: 'galactic-core', icon: '🎆' }))).toBe('nebula');
    expect(routeEffect(ev({ id: 'void-rift', icon: '🕳️' }))).toBe('nebula');
    // Meteor streams by name; orbital hardware is a junk field.
    expect(routeEffect(ev({ id: 'perseids', icon: '🌠' }))).toBe('meteorShower');
    expect(routeEffect(ev({ id: 'geminids', icon: '✨' }))).toBe('meteorShower');
    expect(routeEffect(ev({ id: 'iss-pass', icon: '🛰️' }))).toBe('spaceJunk');
  });

  it('every catalogue event (recurring + unique) resolves to a known effect with a card info row', () => {
    for (const e of [...ROUTE_EVENTS, ...UNIQUE_EVENTS]) {
      const fx = routeEffect(e);
      expect(COURSE_EFFECTS[fx], `${e.id} → ${fx}`).toBeDefined();
      expect(COURSE_EFFECTS[fx].icon.length).toBeGreaterThan(0);
    }
    // The info table covers exactly the union.
    const ids: CourseEffectId[] = ['none', 'moonlight', 'meteorShower', 'solarStorm', 'ionStorm', 'eclipse', 'nebula', 'comet', 'aurora', 'spaceJunk', 'tradeMarket'];
    for (const id of ids) expect(COURSE_EFFECTS[id].id).toBe(id);
  });

  it('the catalogue actually SPREADS across the widened effect set (no monoculture)', () => {
    const seen = new Set([...ROUTE_EVENTS, ...UNIQUE_EVENTS].map((e) => routeEffect(e)));
    for (const id of ['moonlight', 'meteorShower', 'solarStorm', 'ionStorm', 'eclipse', 'nebula', 'comet', 'aurora', 'spaceJunk', 'tradeMarket'] as CourseEffectId[]) {
      expect(seen.has(id), `no event maps to ${id}`).toBe(true);
    }
  });
});

describe('the effect wind hook (GS-journey-variety)', () => {
  it('storm skies gust harder, calm skies go still, everything stays in a modest fair band', () => {
    expect(effectWindMult('ionStorm')).toBeGreaterThan(effectWindMult('solarStorm'));
    expect(effectWindMult('solarStorm')).toBeGreaterThan(1);
    expect(effectWindMult('eclipse')).toBeLessThan(effectWindMult('moonlight'));
    expect(effectWindMult('moonlight')).toBeLessThan(1);
    expect(effectWindMult('none')).toBe(1);
    expect(effectWindMult(undefined)).toBe(1);
    for (const m of Object.values(EFFECT_WIND)) {
      expect(m).toBeGreaterThanOrEqual(0.6);
      expect(m).toBeLessThanOrEqual(1.4);
    }
  });

  it('scales every hole wind by exactly the multiplier (same generation, clamped, deg untouched)', () => {
    const base = startRun(11, 'voyage');
    // Same cutDelta ⇒ identical generation; only the effect (and so the wind transform) differs.
    const plain = currentCourse({ ...base, pendingEvent: ev({ id: 'plain-payout', category: 'payout', cutDelta: 1 }) }); // → aurora, ×1
    const gusty = currentCourse({ ...base, pendingEvent: ev({ id: 'ion-storm', category: 'payout', cutDelta: 1 }) }); // → ionStorm
    const still = currentCourse({ ...base, pendingEvent: ev({ id: 'total-solar-eclipse', category: 'payout', cutDelta: 1 }) }); // → eclipse
    const kUp = effectWindMult('ionStorm');
    const kDown = effectWindMult('eclipse');
    plain.holes.forEach((h, i) => {
      const g = gusty.holes[i]!;
      const s = still.holes[i]!;
      expect(g.wind!.spd).toBeCloseTo(Math.min(EFFECT_WIND_CAP, h.wind!.spd * kUp), 6);
      expect(s.wind!.spd).toBeCloseTo(h.wind!.spd * kDown, 6);
      expect(g.wind!.deg).toBe(h.wind!.deg);
      expect(s.wind!.deg).toBe(h.wind!.deg);
    });
  });

  it('a neutral effect returns the course object UNTOUCHED (byte-for-byte the old path)', () => {
    const base = startRun(13, 'voyage');
    const a = currentCourse(base);
    const b = currentCourse(base);
    expect(a).toEqual(b); // no pending event ⇒ no transform, fully deterministic
    for (const h of a.holes) expect(h.wind!.spd).toBeLessThanOrEqual(EFFECT_WIND_CAP);
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
