import { describe, it, expect } from 'vitest';
import {
  interludeBeat,
  interludeBeatId,
  interludeSeen,
  interludeFriend,
  applyInterlude,
} from '../src/sim/rpg/storyInterlude';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { CHARACTERS } from '../src/sim/rpg/characters';

describe('emotional mid-chapters (GS-story-midchapter)', () => {
  it('each path has a distinct interlude with dialogue + an outcome', () => {
    for (const align of ['warden', 'herald'] as const) {
      const beat = interludeBeat(align);
      expect(beat.alignment).toBe(align);
      expect(beat.id).toBe(interludeBeatId(align));
      expect(beat.creditGift).toBeGreaterThan(0);
      const lines = beat.lines('Penelope');
      expect(lines.length).toBeGreaterThanOrEqual(4);
      expect(beat.outcome('Penelope')).toContain('Penelope');
    }
    // the Warden reunion pays a friend's gift; the Herald betrayal pays the Coil's (larger) blood-money
    expect(interludeBeat('herald').creditGift).toBeGreaterThan(interludeBeat('warden').creditGift);
  });

  it('the friend is a roster golfer who is NOT the protagonist', () => {
    const me = CHARACTERS[0]!.id;
    const friend = interludeFriend({ ...defaultStoryState(me) });
    expect(friend.id).not.toBe(me);
    expect(CHARACTERS.some((c) => c.id === friend.id)).toBe(true);
  });

  it('applyInterlude marks it seen once and pays the outcome (idempotent)', () => {
    const s0: StoryState = { ...defaultStoryState('feather-fade'), alignment: 'warden', credits: 100 };
    expect(interludeSeen(s0, 'warden')).toBe(false);
    const s1 = applyInterlude(s0, 'warden');
    expect(interludeSeen(s1, 'warden')).toBe(true);
    expect(s1.credits).toBe(100 + interludeBeat('warden').creditGift);
    // dismissing again is a no-op — no double-pay
    expect(applyInterlude(s1, 'warden')).toBe(s1);
  });
});
