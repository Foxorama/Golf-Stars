import { describe, it, expect } from 'vitest';
import { THEMES } from '../src/sim/course/themes';
import { skyCoordForName, THEME_SKY } from '../src/render/sky-coords';
import { journeyMapHTML, type StarmapStop } from '../src/render/starmap';

/**
 * Journey map (GS-galaxy-map, GS-journey-vertical): the travel screen plots the cleared trail at REAL
 * sky positions on a VERTICAL star-chart — Earth at the bottom, YOU above it, three tappable branch
 * planets across the top. These guard the asks:
 *   • every theme is grounded in a real constellation/object, so it MUST resolve to a sky coord
 *     (a new theme without one would silently fall back to the neutral baseline);
 *   • the trail is galaxy-exact — a far-flung hop climbs the node further than a near one;
 *   • each branch planet is a tap target (`data-route-inspect`) that opens its route-info sheet;
 *   • the widget is deterministic for a given input.
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

  it('renders a vertical star-chart with Earth, a caption, and tappable branch planets', () => {
    const html = journeyMapHTML(opts);
    expect(html).toContain('gs-journey--v'); // the vertical chart container
    expect(html).toContain('EARTH'); // home base is drawn at the bottom
    expect(html).toContain('Taurus'); // the current world is captioned
    // Every route choice is a tap target that opens its info sheet.
    for (const c of choices) expect(html).toContain(`data-route-inspect="${c.id}"`);
  });

  it('draws one node per cleared stop (no truncation — the chart scrolls instead)', () => {
    const html = journeyMapHTML(opts);
    const nodes = html.match(/#6fd0d8" stroke-width="1.4"/g) ?? [];
    expect(nodes.length).toBe(trail.length);
    expect(html).not.toContain('more'); // the old "+N more" summary is gone
  });

  it('is galaxy-exact: a far-flung hop climbs further than a near one', () => {
    // Two adjacent stops close on the sky, then a third far away → its node gap must be taller.
    const near = skyCoordForName('Canis Minor')!; // ~RA 113, dec +6
    const alsoNear = skyCoordForName('Canis Major')!; // neighbour of Canis Minor
    const far = skyCoordForName('47 Tucanae')!; // deep south, far off
    // oldest → newest (as app.ts passes it); the chart draws newest nearest YOU (top), oldest by Earth.
    const t: StarmapStop[] = [
      { label: 'Canis Minor', ra: near.ra, dec: near.dec },
      { label: 'Canis Major', ra: alsoNear.ra, dec: alsoNear.dec },
      { label: '47 Tucanae', ra: far.ra, dec: far.dec },
    ];
    const html = journeyMapHTML({ ...opts, trail: t, stopIndex: 3 });
    // node y positions, in draw order (top→bottom = newest→oldest): 47 Tuc, Canis Major, Canis Minor
    const ys = [...html.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="6.5"/g)].map((m) => Number(m[1]));
    expect(ys.length).toBe(3);
    const gapFar = ys[1]! - ys[0]!; // 47 Tuc → Canis Major (far)
    const gapNear = ys[2]! - ys[1]!; // Canis Major → Canis Minor (close)
    expect(gapFar).toBeGreaterThan(gapNear);
  });

  it('is deterministic for a given input', () => {
    expect(journeyMapHTML(opts)).toBe(journeyMapHTML(opts));
  });
});
