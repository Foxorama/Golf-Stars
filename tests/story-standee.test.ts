import { describe, it, expect } from 'vitest';
import { fullBodyStandeeSVG, CADDY_STANDEE, HERALD_STANDEE } from '../src/render/storyStandee';
import { STORY_CADDY_STOCK } from '../src/sim/rpg/storyCaddies';

const BUST = '<svg viewBox="0 0 320 340"><circle cx="160" cy="120" r="60" fill="#abc"/></svg>';

describe('GS-story-fullbody — clubhouse standees are full-body figures', () => {
  it('wraps the bust as head+torso over a taller lower body (feet reach the floor)', () => {
    const out = fullBodyStandeeSVG(BUST, { legs: 'human', cloth: '#333', shoe: '#111' });
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).toContain(BUST); // the identity bust is preserved on top
    // the outer figure is TALLER than the 340 bust (a lower body was added underneath)
    const vb = out.match(/viewBox="0 0 320 (\d+)"/);
    expect(vb).toBeTruthy();
    expect(Number(vb![1])).toBeGreaterThan(340);
  });

  it('each lower-body kind renders and only the mole (creature) is a short figure', () => {
    const heightOf = (legs: 'human' | 'robe' | 'bird' | 'creature') => {
      const out = fullBodyStandeeSVG(BUST, { legs });
      return Number(out.match(/viewBox="0 0 320 (\d+)"/)![1]);
    };
    expect(heightOf('human')).toBeGreaterThan(heightOf('creature'));
    expect(heightOf('robe')).toBeGreaterThan(heightOf('creature'));
    expect(heightOf('bird')).toBeGreaterThan(heightOf('creature'));
  });

  it('every recruitable ally has an intentional standee look (a new ally needs a body)', () => {
    for (const caddyId of new Set(Object.values(STORY_CADDY_STOCK))) {
      expect(CADDY_STANDEE[caddyId], `${caddyId} standee look`).toBeDefined();
    }
  });

  it('the Herald agents share the robed cult look', () => {
    expect(HERALD_STANDEE.legs).toBe('robe');
    expect(fullBodyStandeeSVG(BUST, HERALD_STANDEE)).toContain(BUST);
  });
});
