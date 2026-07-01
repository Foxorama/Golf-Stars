import { describe, it, expect } from 'vitest';
import { createWeather } from '../src/render/weather';
import type { Vec } from '../src/sim/course/contract';

/**
 * GS-rough-frame, animated edition: the weather layer's pinned twinkle STARFIELD must honour the
 * land mask — rough is playable turf now, so stars twinkling over it recreate the "rough became
 * starfields" bug live on every world even after the static scene was fixed. Differential test:
 * same seed + frame, drawn with and without a full-screen mask; only the star arcs may disappear.
 */

/** A recording no-op 2D context: every method exists and returns a gradient-shaped stub; `arc`
 *  increments the counter. Enough surface for the weather draw pass to run headless in node. */
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

describe('weather star-mask (GS-rough-frame)', () => {
  const opts = {
    effect: 'none',
    width: 360,
    height: 640,
    archetype: 'crystal',
    windSpd: 8,
    windDir: [0, 1] as Vec,
    seed: 1234,
  };

  it('a full-screen land mask suppresses the pinned twinkle stars — and only them', () => {
    const bare = { arcs: 0 };
    createWeather({ ...opts }).draw(fakeCtx(bare), 5000);

    const masked = { arcs: 0 };
    const allLand: Vec[][] = [
      [
        [0, 0],
        [360, 0],
        [360, 640],
        [0, 640],
      ],
    ];
    createWeather({ ...opts, starMask: () => allLand }).draw(fakeCtx(masked), 5000);
    expect(masked.arcs).toBeLessThan(bare.arcs); // the starfield stayed off the land…
    expect(masked.arcs).toBeGreaterThan(0); // …while the ambient air / other sky layers still drew

    const nullMask = { arcs: 0 };
    createWeather({ ...opts, starMask: () => null }).draw(fakeCtx(nullMask), 5000);
    expect(nullMask.arcs).toBe(bare.arcs); // a null mask draws identically to no mask at all
  });
});
