import { describe, it, expect } from 'vitest';
import { THEMES } from '../src/sim/course/themes';
import { skyCoordForName, THEME_SKY } from '../src/render/sky-coords';
import { journeyMapHTML, type StarmapStop } from '../src/render/starmap';

/**
 * Journey map (GS-galaxy-map): the travel screen plots the cleared trail at REAL sky positions, in a
 * horizontally-scrollable strip with a pinned forward-routes panel. These guard the two asks:
 *   • every theme is grounded in a real constellation/object, so it MUST resolve to a sky coord
 *     (a new theme without one would silently fall back to the neutral baseline);
 *   • the trail is galaxy-exact — a far-flung hop spaces the node further than a near one;
 *   • the widget is a scroll strip + sticky panel and is deterministic for a given input.
 */

const choices = [
  { id: 1, label: 'Cruise', icon: '🌬️', rarity: 'common' as const, distanceJump: 1 },
  { id: 2, label: 'Stream', icon: '⭐', rarity: 'rare' as const, distanceJump: 2 },
  { id: 3, label: 'Cache', icon: '🛸', rarity: 'epic' as const, distanceJump: 3, elite: true },
];

describe('journey map sky coordinates', () => {
  it('every voyage theme resolves to a real-sky position (no silent fallback)', () => {
    const missing = THEMES.filter((t) => !skyCoordForName(t.name)).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it('coordinates are valid equatorial J2000 (ra 0..360, dec -90..90)', () => {
    for (const c of Object.values(THEME_SKY)) {
      expect(c.ra).toBeGreaterThanOrEqual(0);
      expect(c.ra).toBeLessThanOrEqual(360);
      expect(c.dec).toBeGreaterThanOrEqual(-90);
      expect(c.dec).toBeLessThanOrEqual(90);
    }
  });
});

describe('journey map widget', () => {
  const trail: StarmapStop[] = ['Canis Minor', 'Cygnus', 'Carina', 'Ptolemy Cluster'].map((name) => {
    const s = skyCoordForName(name)!;
    return { label: name, ra: s.ra, dec: s.dec };
  });
  const opts = { seed: 'demo', stopIndex: trail.length, distanceFromStart: 8, currentLabel: 'Taurus', trail, choices };

  it('renders a scrollable trail strip + a pinned forward panel', () => {
    const html = journeyMapHTML(opts);
    expect(html).toContain('gs-journey-trail');
    expect(html).toContain('data-journey-scroll'); // the scroll hook app.ts snaps to the right
    expect(html).toContain('gs-journey-fwd');
    expect(html).toContain('Taurus'); // the current world is captioned
  });

  it('draws one node per cleared stop (no truncation — the strip scrolls instead)', () => {
    const html = journeyMapHTML(opts);
    const nodes = html.match(/#6fd0d8" stroke-width="1.4"/g) ?? [];
    expect(nodes.length).toBe(trail.length);
    expect(html).not.toContain('more'); // the old "+N more" summary is gone
  });

  it('is galaxy-exact: a far-flung hop is spaced further than a near one', () => {
    // Two adjacent stops close on the sky, then a third far away → its node gap must be wider.
    const near = skyCoordForName('Canis Minor')!; // ~RA 113, dec +6
    const alsoNear = skyCoordForName('Canis Major')!; // neighbour of Canis Minor
    const far = skyCoordForName('47 Tucanae')!; // deep south, far off
    const t: StarmapStop[] = [
      { label: 'Canis Minor', ra: near.ra, dec: near.dec },
      { label: 'Canis Major', ra: alsoNear.ra, dec: alsoNear.dec },
      { label: '47 Tucanae', ra: far.ra, dec: far.dec },
    ];
    const html = journeyMapHTML({ ...opts, trail: t, stopIndex: 3 });
    // node x positions, in draw order
    const xs = [...html.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="6.5"/g)].map((m) => Number(m[1]));
    expect(xs.length).toBe(3);
    const gapNear = xs[1]! - xs[0]!; // Canis Minor → Canis Major (close)
    const gapFar = xs[2]! - xs[1]!; // Canis Major → 47 Tuc (far)
    expect(gapFar).toBeGreaterThan(gapNear);
  });

  it('is deterministic for a given input', () => {
    expect(journeyMapHTML(opts)).toBe(journeyMapHTML(opts));
  });
});
