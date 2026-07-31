import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spaceportSceneHTML, DECK_TOP_PCT } from '../src/render/storySpaceport';
import { earthClubhouseSceneHTML } from '../src/render/storyClubhouse';
import { defaultStoryState } from '../src/sim/rpg/story';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { chromePath } from './chromium';

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

/**
 * ...AND SO DO THE PEOPLE (GS-clubhouse-floor, second pass).
 *
 * The furniture pass fixed the room and left the cast alone, and the play-test came straight back:
 * *"the non-selected golfers are still velcro'd to the wall."* They were — `FRIEND_SPOTS` put your
 * three friends at 67–72% of the scene when the deck starts at 74%, so measured from the drawn
 * figure their feet landed **7.4 to 12.4 points up the back wall** while you stood on the floor. A
 * person is the one object in the room whose height the eye already knows, so this read worse than
 * any piece of furniture did.
 *
 * ⚠️ THE SPOT NUMBER IS NOT THE FOOT POSITION. A standee is feet-anchored with
 * `translate(-50%,-100%)`, but the NAMEPLATE hangs below the feet inside the same button — measured,
 * ~5.5 points of slack at this figure size. So a spot set exactly to the deck line still leaves the
 * character hovering, and a test that reads the spot table is testing the wrong number. This one
 * drives a real browser and measures the drawn figure.
 */
describe.runIf(chromePath)('the people stand on the floor too (GS-clubhouse-floor)', () => {
  let browser: import('playwright-core').Browser;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  /** Every standee's FEET, as a percentage of the scene box. */
  async function feet(html: string, sceneSel: string) {
    const page = await browser.newPage({ viewport: { width: 700, height: 900 } });
    await page.setContent(`<body style="margin:0;width:620px">${html}</body>`, { waitUntil: 'load' });
    const out = await page.evaluate((sel) => {
      const scene = document.querySelector(sel) as HTMLElement;
      const sr = scene.getBoundingClientRect();
      const res: { who: string; feetPct: number }[] = [];
      for (const el of scene.querySelectorAll('.gs-sclub-golfer,.gs-sclub-caddy,.gs-eclub-golfer')) {
        const svg = el.querySelector('svg');
        const cv = el.querySelector('canvas.gs-caddycv') as HTMLCanvasElement | null;
        let y: number | null = null;
        if (svg) y = svg.getBoundingClientRect().bottom;
        // A caddy is a canvas the app's mount pass draws into. `app.ts` plants the figure's feet at
        // `cv.height - 8` of a 260-tall canvas, so that ratio is where the soles are. It mirrors a
        // number that lives in app.ts — if the draw call moves, this must too.
        else if (cv) {
          const r = cv.getBoundingClientRect();
          y = r.top + r.height * ((260 - 8) / 260);
        }
        if (y === null) continue;
        res.push({
          who: (el.getAttribute('aria-label') || '?').slice(0, 40),
          feetPct: ((y - sr.top) / sr.height) * 100,
        });
      }
      return res;
    }, sceneSel);
    await page.close();
    return out;
  }

  const hero = CHARACTERS[2]!.id;
  const roster = ['driver-dan', 'auto-caddie', 'sandy-sandsaver', 'dr-chipinski', 'suggestible-sam', 'mystic-mole'];

  for (const [name, html, sel] of [
    ['Mothership, chapter 1 (the reported screen)', spaceportSceneHTML({ ...defaultStoryState(hero), chapter: 1 }), '.gs-sclub-scene'],
    [
      'Mothership, full caddy roster',
      spaceportSceneHTML({ ...defaultStoryState(hero), chapter: 3, hiredCaddyIds: roster, activeCaddyId: 'suggestible-sam' }),
      '.gs-sclub-scene',
    ],
    [
      'Coil sanctum',
      spaceportSceneHTML({ ...defaultStoryState(hero), chapter: 4, alignment: 'herald' as const }),
      '.gs-sclub-scene',
    ],
    ['Earth clubhouse', earthClubhouseSceneHTML(hero, {}), 'div[style*="container-type"]'],
  ] as const) {
    it(`${name} — nobody is standing on the back wall`, async () => {
      const people = await feet(html, sel);
      expect(people.length, 'no standees found — the scene did not render').toBeGreaterThan(0);
      // Half a point of tolerance for sub-pixel rounding; the real failures were 7–12 points out.
      const onWall = people.filter((p) => p.feetPct < DECK_TOP_PCT - 0.5);
      expect(
        onWall.map((p) => `${p.who} @ ${p.feetPct.toFixed(1)}% (deck starts ${DECK_TOP_PCT}%)`),
        'these figures have their feet above the deck line — they are standing on the wall',
      ).toEqual([]);
    }, 60_000);
  }
});
