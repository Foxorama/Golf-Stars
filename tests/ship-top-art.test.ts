import { describe, it, expect } from 'vitest';
import { shipTopSVG, shipTopSpriteSVG, TOP_VIEW_BOX } from '../src/render/shipTopArt';
import { shipSVG } from '../src/render/shipArt';
import { SHIPS, DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';

/**
 * GS-story-battle-topdown — the portrait fight draws the fleet FROM ABOVE. Player report: *"the side-on
 * spaceships look really weird in portrait mode, I keep trying to crane my neck sideways."*
 *
 * The art itself needs eyes (`scripts/battle-preview.mjs`'s ship rail). What is machine-checkable is the
 * contract that makes it a safe drop-in: same frame, every ship covered, genuinely DIFFERENT from the side
 * elevation, and none of the house rules broken (no document-global ids, no `Math.random`, no dead SMIL).
 */
describe('top-down ship art', () => {
  it('is authored in the SAME frame as the side elevation — that is what makes it a drop-in', () => {
    // `storyBattle.ts` swaps one sprite for the other without touching SHIP_W/SHIP_H, the hit radius,
    // the shield bubble or a single hardpoint. A different viewBox would silently rescale the hull.
    expect(TOP_VIEW_BOX).toBe('-34 -20 62 40');
    expect(shipTopSpriteSVG('wagon-classic')).toContain(`viewBox="${TOP_VIEW_BOX}"`);
    expect(shipTopSpriteSVG('wagon-classic')).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('every ship in the catalogue has a plan view, and it is not just the side art again', () => {
    for (const s of SHIPS) {
      const top = shipTopSVG(s.id, 0, 0, 1);
      expect(top.length, `${s.id} empty`).toBeGreaterThan(200);
      expect(top, `${s.id}`).toContain('<g transform="translate(0 0) scale(1.000)">');
      // it must actually be different art — a kind that fell through to the side view is the bug
      expect(top, `${s.id} identical to the side elevation`).not.toBe(shipSVG(s.id, 0, 0, 1));
      expect(shipTopSVG(s.id, 0, 0, 1), `${s.id} not pure`).toBe(top); // deterministic
    }
    // …and an unknown id still draws something (the default hull), never a blank
    expect(shipTopSVG(undefined, 0, 0, 1).length).toBeGreaterThan(200);
    expect(shipTopSVG('no-such-ship', 0, 0, 1)).toBe(shipTopSVG(DEFAULT_SHIP_ID, 0, 0, 1));
  });

  it('the fleet still reads as distinct hulls from above', () => {
    const bodies = new Set(SHIPS.map((s) => shipTopSVG(s.id, 0, 0, 1)));
    // palettes differ per ship, so every ship is unique; the real check is that the SILHOUETTES vary —
    // count distinct shapes with the colours stripped out
    const shapes = new Set(SHIPS.map((s) => shipTopSVG(s.id, 0, 0, 1).replace(/#[0-9a-f]{3,6}/gi, '')));
    expect(bodies.size).toBe(SHIPS.length);
    expect(shapes.size).toBeGreaterThanOrEqual(9); // 11 kinds, and the wagon tiers share a silhouette
  });

  it('breaks none of the house rules for embedded SVG', () => {
    for (const s of SHIPS) {
      const top = shipTopSVG(s.id, 0, 0, 1);
      // SVG ids are DOCUMENT-GLOBAL — a shared id cross-tints co-mounted ships (the standing rule)
      expect(top, `${s.id} declares an id`).not.toMatch(/\sid\s*=/);
      expect(top, `${s.id} references a url()`).not.toContain('url(');
      // the battle rasterizes this into an <img>, where SMIL does not run: animation here is dead markup
      expect(top, `${s.id} carries dead SMIL`).not.toContain('<animate');
      expect(top, `${s.id} carries dead SMIL`).not.toContain('animateTransform');
      expect(top).not.toContain('NaN');
      expect(top).not.toContain('undefined');
    }
  });

  it('stays inside its frame — a hull that overflows is a hull that gets clipped', () => {
    // every authored coordinate must sit in the viewBox: x ∈ [−34, 28], y ∈ [−20, 20]
    for (const s of SHIPS) {
      const top = shipTopSVG(s.id, 0, 0, 1);
      const geometry = top.replace(/^<g transform="[^"]*">/, '');
      for (const m of geometry.matchAll(/(?:^|[\s",=(])(-?\d+(?:\.\d+)?)/g)) {
        const v = Number(m[1]);
        // a loose sweep: nothing in this art is ever legitimately beyond the frame's own extents
        expect(Math.abs(v), `${s.id} coordinate ${v} out of frame`).toBeLessThanOrEqual(34);
      }
    }
  });
});
