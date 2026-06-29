import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG } from '../src/render/holeView';

describe('holeView (pure SVG renderer)', () => {
  const hole = generateCourse(1234).holes[0]!;

  it('produces a well-formed SVG with a viewBox', () => {
    const svg = renderHoleSVG(hole, { width: 360, height: 640 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('viewBox="0 0 360 640"');
  });

  it('draws the fairway and green surfaces', () => {
    const svg = renderHoleSVG(hole);
    // Fairway + green fills from the palette appear as polygons.
    expect(svg).toContain('#3f8c3f'); // fairway
    expect(svg).toContain('#5fd45a'); // green
    expect(svg.match(/<polygon/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('renders shot flight lines when provided', () => {
    const withShots = renderHoleSVG(hole, {
      shots: [
        {
          from: [0, 0],
          result: {
            landing: [5, 120],
            carry: 120,
            shotBearing: 0,
            wind: { along: 0, cross: 0 },
            intended: 120,
            apex: 22,
          },
          lieFrom: 'tee',
          lieTo: 'fairway',
          landLie: 'fairway',
          club: { id: '7i', name: '7-Iron', carry: 134 },
          rest: [5, 130],
          roll: 10,
          holed: false,
        },
      ],
    });
    expect(withShots).toContain('<line');
    expect(withShots).toContain('#ffd84a'); // flight-line colour
  });

  it('renders the muted opponent (boss) ghost trail when provided', () => {
    const shot = {
      from: [0, 0] as [number, number],
      result: {
        landing: [5, 120] as [number, number],
        carry: 120,
        shotBearing: 0,
        wind: { along: 0, cross: 0 },
        intended: 120,
        apex: 22,
      },
      lieFrom: 'tee' as const,
      lieTo: 'fairway' as const,
      landLie: 'fairway' as const,
      club: { id: '7i', name: '7-Iron', carry: 134 },
      rest: [5, 130] as [number, number],
      roll: 10,
      holed: false,
    };
    const withGhost = renderHoleSVG(hole, { ghostShots: [shot] });
    expect(withGhost).toContain('#ff6b6b'); // muted opponent colour
    expect(withGhost).toContain('stroke-dasharray="4 3"');
  });

  it('is deterministic for a given hole', () => {
    expect(renderHoleSVG(hole)).toBe(renderHoleSVG(hole));
  });
});
