import { describe, it, expect } from 'vitest';
import { spaceportSceneHTML } from '../src/render/storySpaceport';
import { earthClubhouseSceneHTML } from '../src/render/storyClubhouse';
import { defaultStoryState } from '../src/sim/rpg/story';
import { CHARACTERS } from '../src/sim/rpg/characters';

/**
 * THE ROOM IS A ROOM, NOT A BACKDROP (GS-clubhouse-floor).
 *
 * Play-test: *"the Story Tour and Star Tour clubhouse has a bunch of things sitting on the wall and
 * not the floor — your character is standing on the floor and everything else looks like it's
 * velcro'd to the wall."*
 *
 * Two literal causes behind the impression, and the second is the one that made it obvious:
 *
 *   1. NOTHING BUT THE GOLFERS TOUCHED THE FLOOR. The golfers carry a contact shadow; the furniture
 *      carried none and was drawn flat onto the wall, so the room read as a printed backdrop with
 *      four people standing in front of it.
 *   2. THE BAR COUNTER DID NOT REACH THE DECK. Its front panel stopped at y=192 against a deck line
 *      at 222 — thirty units of wall visible underneath it. The bar was, literally, hanging.
 *
 * This is an art pass and most of it is judgement that only eyes-on can settle (`scripts` renders
 * were the real check). What IS mechanical is the second fault, and it is the one that can silently
 * come back the next time somebody nudges a rectangle: so the deck line is a named constant that
 * standing furniture derives its height from, and these cases pin the property rather than the
 * pixels — a unit that stands on the floor reaches the floor.
 */

const HERO = CHARACTERS[2]!.id;
const warden = { ...defaultStoryState(HERO), chapter: 2 };
const herald = { ...defaultStoryState(HERO), chapter: 4, alignment: 'herald' as const };

/** Every `<rect>` in an SVG string, as `{x, y, w, h}` — enough to ask where a slab's bottom edge is. */
function rects(svg: string): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const tag = m[0];
    const num = (k: string): number | null => {
      const v = new RegExp(`\\b${k}="(-?[\\d.]+)"`).exec(tag);
      return v ? Number(v[1]) : null;
    };
    const w = num('width');
    const h = num('height');
    if (w === null || h === null) continue;
    out.push({ x: num('x') ?? 0, y: num('y') ?? 0, w, h });
  }
  return out;
}

/** The deck line of the 400x300 room frame. Both dressings of the room share it. */
const DECK_Y = 222;

describe('the clubhouse furniture stands on the floor (GS-clubhouse-floor)', () => {
  for (const [name, svg] of [
    ['Mothership', spaceportSceneHTML(warden)],
    ['Coil sanctum', spaceportSceneHTML(herald)],
  ] as const) {
    describe(name, () => {
      it('has a bar counter whose front reaches the deck', () => {
        // The counter is the full-width slab on the right of the room. Before the fix its bottom edge
        // was at 192 — thirty units of daylight between the bar and the floor.
        const counter = rects(svg).filter((r) => r.x === 256 && r.w === 140 && r.h > 20);
        expect(counter.length, 'the bar counter body was not found — did its geometry move?').toBe(1);
        expect(counter[0]!.y + counter[0]!.h).toBe(DECK_Y);
      });

      it('leaves nothing hanging just short of the deck', () => {
        // The failure shape, stated generally: a big slab whose bottom edge lands in the dead band
        // just above the floor is furniture floating on the wall. Wall-mounted pieces (the bay, the
        // viewport, the back-bar shelf) finish well clear of that band, so the rule only catches
        // things that were meant to be standing.
        //
        // The question is asked of the UNIT, not of each rectangle: a carcass sitting on a plinth
        // correctly stops above the deck, and it is the plinth that reaches it. So a slab is only
        // hanging if NOTHING overlapping its x-range comes down to the floor.
        const all = rects(svg);
        const reachesDeck = (r: { x: number; w: number }): boolean =>
          all.some(
            (o) =>
              o.x < r.x + r.w && o.x + o.w > r.x && Math.abs(o.y + o.h - DECK_Y) <= 2,
          );
        const hanging = all.filter((r) => {
          const bottom = r.y + r.h;
          return r.w >= 80 && r.h >= 20 && bottom > DECK_Y - 32 && bottom < DECK_Y - 1 && !reachesDeck(r);
        });
        expect(hanging, `these slabs stop just short of the deck: ${JSON.stringify(hanging)}`).toEqual([]);
      });

      it('casts contact shadows onto the deck, so the room is not a flat backdrop', () => {
        // Ellipses sitting ON the deck line at the foot of the standing units. Without them the only
        // things in the room grounded to the floor were the golfers themselves.
        const contact = [...svg.matchAll(/<ellipse\b[^>]*cy="22[3-6]"[^>]*>/g)];
        expect(contact.length).toBeGreaterThanOrEqual(2);
      });
    });
  }

  it('the Earth clubhouse grounds its trophy cabinet too', () => {
    const svg = earthClubhouseSceneHTML(HERO, {});
    // A plinth under the cabinet, ending exactly on the boards.
    const plinth = rects(svg).filter((r) => r.x === 17 && r.w === 80);
    expect(plinth.length).toBeGreaterThanOrEqual(1);
    expect(Math.max(...plinth.map((r) => r.y + r.h))).toBe(DECK_Y + 1);
    // ...and a contact shadow pooling at its foot.
    expect([...svg.matchAll(/<ellipse\b[^>]*cy="22[3-6]"[^>]*>/g)].length).toBeGreaterThanOrEqual(1);
  });
});
