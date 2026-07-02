import { describe, it, expect } from 'vitest';
import { createWeather, type WeatherOpts } from '../src/render/weather';
import type { Vec } from '../src/sim/course/contract';

/**
 * Meteor STRIKES (GS-meteor-strikes): the meteor-shower sky lands one meteor per cycle ON a supplied
 * crater target (screen space) — an impact flash + ember splash over the mark. Headless differential
 * tests via the weather-mask fake-ctx trick: strikes add arc draws over a bare shower, fire the
 * onStrike cue exactly once per cycle, and are read ONLY by the meteorShower effect.
 */

function fakeCtx(rec: { arcs: number }): CanvasRenderingContext2D {
  const stub = { addColorStop: () => undefined };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'arc')
          return () => {
            rec.arcs += 1;
          };
        return () => stub;
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

const base: WeatherOpts = {
  effect: 'meteorShower',
  width: 360,
  height: 640,
  archetype: 'verdant',
  windSpd: 8,
  windDir: [0, 1] as Vec,
  seed: 1234,
};
const targets = [
  { c: [120, 300] as Vec, r: 6 },
  { c: [200, 420] as Vec, r: 5 },
];
/** Sample a whole strike cycle (2600ms) densely enough to hit dive + impact phases. */
const SWEEP = Array.from({ length: 26 }, (_, i) => 10_000 + i * 100);

function arcsOver(opts: WeatherOpts): number {
  const w = createWeather(opts);
  const rec = { arcs: 0 };
  for (const now of SWEEP) w.draw(fakeCtx(rec), now);
  return rec.arcs;
}

describe('meteor strikes (GS-meteor-strikes)', () => {
  it('strike targets add impact drawing to a meteor-shower sky; none → byte-identical bare shower', () => {
    const bare = arcsOver(base);
    const striking = arcsOver({ ...base, strikeTargets: () => targets });
    expect(striking).toBeGreaterThan(bare); // the dive head + flash + embers actually draw
    expect(arcsOver({ ...base, strikeTargets: () => null })).toBe(bare); // null = no strikes
    expect(arcsOver({ ...base, strikeTargets: () => [] })).toBe(bare); // no craters = no strikes
  });

  it('only the meteorShower effect reads the targets (a moonlit sky ignores them)', () => {
    const bare = arcsOver({ ...base, effect: 'moonlight' });
    const withTargets = arcsOver({ ...base, effect: 'moonlight', strikeTargets: () => targets });
    expect(withTargets).toBe(bare);
  });

  it('fires the onStrike landing cue exactly once per cycle, at the impact moment', () => {
    let cues = 0;
    const w = createWeather({ ...base, strikeTargets: () => targets, onStrike: () => cues++ });
    const ctx = fakeCtx({ arcs: 0 });
    // Sweep two full cycles at 60fps-ish density → exactly two landings.
    for (let now = 5200; now < 5200 + 2 * 2600; now += 40) w.draw(ctx, now);
    expect(cues).toBe(2);
  });

  it('a strike aimed far off-screen is paint-culled (no cue, no extra draws) — camera-safe', () => {
    const off = [{ c: [-500, -500] as Vec, r: 6 }];
    let cues = 0;
    const bare = arcsOver(base);
    const culled = arcsOver({ ...base, strikeTargets: () => off, onStrike: () => cues++ });
    expect(culled).toBe(bare);
    expect(cues).toBe(0);
  });
});
