import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG, renderShotOverlaySVG, SHOT_OVERLAY_ID } from '../src/render/holeView';
import { shotSpread } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';

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

  // The pull-to-power gesture redraws JUST the spray-cone overlay group (renderShotOverlaySVG)
  // instead of rebuilding the whole scene per drag frame (the decision-lag fix). That surgical swap
  // is only correct if the overlay-only render is BYTE-IDENTICAL to the same group inside a full
  // renderHoleSVG for the same (focus) framing + spray — otherwise the cone would jump on the first
  // nudge. Guard both here.
  describe('shot-cone overlay byte-identity (renderShotOverlaySVG)', () => {
    const driver = CLUBS.find((c) => c.id === 'D')!;
    const spray = shotSpread(hole, hole.tee, 'tee', hole.green, driver, {});
    // Focus/follow framing exactly as the decision map builds it (ball low, pin up-screen).
    const up: [number, number] = [hole.green[0] - hole.tee[0], hole.green[1] - hole.tee[1]];
    const focusOpts = {
      width: 360,
      height: 640,
      focus: hole.tee,
      viewRadius: Math.max(30, spray.carryHigh * 0.36),
      focusBias: 0.84,
      up,
      biome: 'verdant',
      themeId: 'lyra',
    } as const;

    const groupOf = (svg: string): string => {
      const m = svg.match(new RegExp(`<g id="${SHOT_OVERLAY_ID}">.*?</g>`));
      return m ? m[0] : '';
    };

    it('matches the group emitted by a full renderHoleSVG for the same framing + spray', () => {
      const full = renderHoleSVG(hole, { ...focusOpts, spray });
      const overlay = renderShotOverlaySVG(hole, { ...focusOpts, spray });
      expect(overlay).toContain(`<g id="${SHOT_OVERLAY_ID}">`);
      expect(overlay.length).toBeGreaterThan(`<g id="${SHOT_OVERLAY_ID}"></g>`.length);
      expect(overlay).toBe(groupOf(full));
    });

    it('is deterministic', () => {
      expect(renderShotOverlaySVG(hole, { ...focusOpts, spray })).toBe(
        renderShotOverlaySVG(hole, { ...focusOpts, spray }),
      );
    });
  });

  // GS-putt-read: past the confident read the break line STOPS at a terminus dot — no faint
  // "guessing" tail tracing the rest of the break to the cup (the removed semi-transparent line).
  describe('putt break line read length', () => {
    const puttPath: [number, number][] = Array.from({ length: 13 }, (_, i) => [i * 0.2, i]);

    it('a blind read draws ONLY the confident prefix — one break path, no faint tail', () => {
      const svg = renderHoleSVG(hole, { puttPath, puttReadFrac: 0.5 });
      // Exactly ONE #ffe14a path: the confident dashed prefix — the faint tail is gone.
      const dashed = svg.match(/<path [^>]*stroke="#ffe14a"[^>]*\/>/g)!;
      expect(dashed.length).toBe(1);
      // A filled terminus dot marks where the read ends...
      expect(svg).toMatch(/<circle [^>]*r="2\.6" fill="#ffe14a"/);
      // ...and no open finish ring at the cup (the line no longer pretends to reach it).
      expect(svg).not.toMatch(/<circle [^>]*fill="none" stroke="#ffe14a"/);
      // The old faint tail's signature dash pattern is gone.
      expect(svg).not.toContain('stroke-dasharray="2 5"');
    });

    it('a full read draws the whole line plus the finish ring, no terminus dot', () => {
      const svg = renderHoleSVG(hole, { puttPath, puttReadFrac: 1 });
      const dashed = svg.match(/<path [^>]*stroke="#ffe14a"[^>]*\/>/g)!;
      expect(dashed.length).toBe(1);
      // Finish ring (an unfilled circle) at the tip, and no filled terminus dot.
      expect(svg).toMatch(/<circle [^>]*fill="none" stroke="#ffe14a"/);
      expect(svg).not.toMatch(/<circle [^>]*r="2\.6" fill="#ffe14a"/);
    });

    it('a shorter read frac draws a shorter confident prefix', () => {
      const at = (frac: number) => {
        const svg = renderHoleSVG(hole, { puttPath, puttReadFrac: frac });
        const d = svg.match(/<path d="([^"]+)" fill="none" stroke="#ffe14a"/)![1]!;
        return d.split('L').length; // segments in the confident prefix
      };
      expect(at(0.25)).toBeLessThan(at(0.75));
    });
  });
});
