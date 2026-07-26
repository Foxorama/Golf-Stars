import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shotSentence, situationSentence, holeSentence } from '../src/app/announce';
import type { ShotLog } from '../src/sim/round';

/**
 * Narration guards (GS-a11y-announce).
 *
 * Everything that happens in this game happens on a canvas, and there was no `aria-live` region
 * anywhere — a screen-reader player got silence for a whole round. These pin the WORDING (the
 * builders are pure, so they are node-testable) plus the two structural facts the live region
 * depends on: that it exists, and that it lives OUTSIDE `#app`.
 */

/** A minimal but honest ShotLog — only the fields the narration reads. */
function shot(over: Partial<ShotLog> = {}): ShotLog {
  return {
    from: [0, 0],
    // 200 yd carry straight up-screen (bearing 0 = +Y), landing dead on the aim ray.
    result: { carry: 200, landing: [0, 200], shotBearing: 0 } as ShotLog['result'],
    lieFrom: 'tee',
    lieTo: 'fairway',
    club: { name: '7 iron' } as ShotLog['club'],
    rest: [0, 210],
    roll: 10,
    holed: false,
    landLie: 'fairway',
    ...over,
  } as ShotLog;
}

describe('shot narration', () => {
  it('reports club, distance, straightness, finish and what is left', () => {
    const s = shotSentence(shot(), 150);
    expect(s).toContain('7 iron');
    expect(s).toContain('200 yards');
    expect(s).toContain('Dead straight');
    expect(s).toContain('the fairway');
    expect(s).toContain('150 yards to the pin');
  });

  it('names the side of a miss, off the AIM RAY (not the hole line)', () => {
    // Landing 30 yd to the +x side of a due-north aim ray is a miss RIGHT.
    const right = shotSentence(shot({ result: { carry: 200, landing: [30, 198], shotBearing: 0 } as ShotLog['result'] }), 120);
    expect(right).toContain('right');
    expect(right).not.toContain('left');
    const left = shotSentence(shot({ result: { carry: 200, landing: [-30, 198], shotBearing: 0 } as ShotLog['result'] }), 120);
    expect(left).toContain('left');
    expect(left).not.toContain('right');
  });

  it('leads with the PENALTY when there is one — it changes the score, not just the position', () => {
    const s = shotSentence(shot({ penalty: 'water', lieTo: 'water' }), 180);
    expect(s.startsWith('the water — penalty')).toBe(true);
    expect(s).toContain('one shot');
    // A penalty shot has no meaningful "finished in / dead straight" report.
    expect(s).not.toContain('Dead straight');
  });

  it('celebrates a holed shot and says nothing about distance remaining', () => {
    const s = shotSentence(shot({ holed: true }), undefined);
    expect(s).toContain('In the hole!');
    expect(s).not.toContain('to the pin');
  });

  it('never doubles the article — lieLabel already carries its own', () => {
    for (const lie of ['tee', 'fairway', 'bunker', 'green', 'water'] as const) {
      const s = shotSentence(shot({ lieTo: lie }), 100);
      expect(s, `doubled article for ${lie}: ${s}`).not.toMatch(/\bthe the\b|\bin the a\b/);
    }
  });
});

describe('situation narration', () => {
  it('gives the hole, its shape, the ball position and the wind', () => {
    const s = situationSentence({
      holeNumber: 3, holeCount: 18, par: 4, holeYards: 410,
      lie: 'fairway', distToPin: 155, windMph: 12, windLabel: 'headwind',
    });
    expect(s).toContain('Hole 3 of 18');
    expect(s).toContain('par 4');
    expect(s).toContain('410 yards');
    expect(s).toContain('the fairway');
    expect(s).toContain('155 yards to the pin');
    expect(s).toContain('12 miles per hour headwind');
    expect(s).not.toMatch(/\bthe the\b/);
  });

  it('says nothing about wind when it is calm', () => {
    const s = situationSentence({
      holeNumber: 1, holeCount: 9, par: 3, holeYards: 165, lie: 'tee', distToPin: 165, windMph: 0,
    });
    expect(s).not.toContain('miles per hour');
  });
});

describe('hole result narration', () => {
  it('uses the golf name for the score', () => {
    expect(holeSentence(1, 4)).toContain('Hole in one!');
    expect(holeSentence(2, 4)).toContain('Eagle!');
    expect(holeSentence(3, 4)).toContain('Birdie');
    expect(holeSentence(4, 4)).toContain('Par');
    expect(holeSentence(5, 4)).toContain('Bogey');
    expect(holeSentence(6, 4)).toContain('Double bogey');
    expect(holeSentence(9, 4)).toContain('5 over par');
  });

  it('pluralises honestly', () => {
    expect(holeSentence(1, 3)).toContain('1 shot on a par 3');
    expect(holeSentence(4, 4)).toContain('4 shots on a par 4');
  });
});

describe('the live region itself', () => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it('exists, is polite, and is a STATUS region', () => {
    expect(html).toMatch(/id="gs-live"[^>]*role="status"/);
    expect(html).toMatch(/id="gs-live"[^>]*aria-live="polite"/);
    // `assertive` would interrupt whatever the player is reading to say "7 iron, 148 yards".
    expect(html).not.toMatch(/id="gs-live"[^>]*aria-live="assertive"/);
  });

  it('lives OUTSIDE #app — render() replaces app.innerHTML wholesale', () => {
    // A live region destroyed and rebuilt on every render is not reliably announced: the element
    // has to persist for its content change to register as a change.
    const appIdx = html.indexOf('<div id="app"></div>');
    const liveIdx = html.indexOf('id="gs-live"');
    expect(appIdx).toBeGreaterThan(-1);
    expect(liveIdx).toBeGreaterThan(appIdx);
  });

  it('is visually hidden WITHOUT being removed from the accessibility tree', () => {
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const rule = css.slice(css.indexOf('.gs-sr-only {'), css.indexOf('.gs-sr-only {') + 320);
    expect(rule).toContain('clip-path: inset(50%)');
    // Either of these would make the region unannounceable — the whole point is that it is
    // invisible but PRESENT.
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
  });
});
