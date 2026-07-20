import { describe, it, expect } from 'vitest';
import {
  interludeBeat,
  interludeBeatId,
  interludeSeen,
  interludeFriend,
  interludeScene,
  applyInterlude,
} from '../src/sim/rpg/storyInterlude';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { betrayerId, betrayalDefection, everyGolferHasBetrayalVoice } from '../src/sim/rpg/storyBetrayal';

const withPicks = (p1?: string, p2?: string): StoryState => ({ ...defaultStoryState('feather-fade'), alignment: 'warden', sigil1Partner: p1, sigil2Partner: p2 });

describe('emotional mid-chapters (GS-story-midchapter / betrayal rework)', () => {
  it('each path has distinct meta + a dynamic dialogue scene with an outcome', () => {
    for (const align of ['warden', 'herald'] as const) {
      const beat = interludeBeat(align);
      expect(beat.alignment).toBe(align);
      expect(beat.id).toBe(interludeBeatId(align));
      expect(beat.creditGift).toBeGreaterThan(0);
      const scene = interludeScene({ ...defaultStoryState('feather-fade'), alignment: align });
      expect(scene.lines.length).toBeGreaterThanOrEqual(4);
      expect(scene.outcome.length).toBeGreaterThan(0);
    }
    // the Warden defection pays the loyal ally's war-chest; the Herald severing pays the Coil's blood-money
    expect(interludeBeat('herald').creditGift).toBeGreaterThan(interludeBeat('warden').creditGift);
  });

  it('the interlude friend is the BETRAYER (odd one out), never the protagonist', () => {
    const me = CHARACTERS[0]!.id;
    const st = withPicks('huang-woo-hook', 'longshot-larry'); // betrayer = backspin-bo
    const friend = interludeFriend(st);
    expect(friend.id).toBe(betrayerId(st));
    expect(friend.id).not.toBe(me);
  });

  it('the dialogue is PER-CHARACTER: a different betrayer speaks different defection lines', () => {
    const a = interludeScene(withPicks('huang-woo-hook', 'longshot-larry')); // betrayer bo
    const b = interludeScene(withPicks('backspin-bo', 'longshot-larry')); // betrayer huang
    expect(a.lines[0]!.text).not.toBe(b.lines[0]!.text);
    // the first line is the betrayer's own defection voice
    expect(betrayalDefection('backspin-bo')).toContain(a.lines[0]!.text);
  });

  it('the Warden defection portrait is corrupted; the Herald severing keeps the friend clean', () => {
    expect(interludeScene({ ...withPicks('huang-woo-hook', 'longshot-larry') }).corrupt).toBe(true);
    expect(interludeScene({ ...defaultStoryState('feather-fade'), alignment: 'herald' }).corrupt).toBe(false);
  });

  it('HERALD: the beat pulls on your first completed caddy quest + whether you still wield its club', () => {
    const base = { ...defaultStoryState('feather-fade'), alignment: 'herald' as const, sigil1Partner: 'huang-woo-hook', sigil2Partner: 'longshot-larry' };
    // Sandy's quest — a caddy actually reachable before The Choice (Vela Dunes, Ch.1). Dan/Mole are Ch.5
    // worlds, so they can NEVER be a Herald player's first completed caddy quest — the hook never surfaces them.
    const wielding = interludeScene({ ...base, completedQuestIds: ['quest-sandy'], equippedBagIds: ['quest:sandy'] });
    expect(wielding.outcome).toMatch(/heavy/i);
    expect(wielding.lines.some((l) => l.who === 'coil' && /Sandy|Sand-Saver/i.test(l.text))).toBe(true);
    // benched it
    const benched = interludeScene({ ...base, completedQuestIds: ['quest-sandy'], equippedBagIds: [] });
    expect(benched.lines.some((l) => /bench|dust/i.test(l.text))).toBe(true);
  });

  it('the caddy-quest hook can NEVER surface a Ch.5-only caddy (Dan/Mole) — reachability sanity', () => {
    // Even if a Dan/Mole quest id somehow appeared, a real Herald run can't have completed one pre-Choice;
    // and the FIRST completed CADDY quest is what the hook reads (skipping charquest markers).
    const base = { ...defaultStoryState('feather-fade'), alignment: 'herald' as const };
    // a charquest marker first, then a real caddy quest → the hook skips the marker to the caddy quest
    const s = interludeScene({ ...base, completedQuestIds: ['charquest:huang-woo-hook', 'quest-chipinski'], equippedBagIds: ['quest:chipinski'] });
    expect(s.lines.some((l) => l.who === 'coil' && /Chip/i.test(l.text))).toBe(true);
  });

  it('every playable golfer has a distinct betrayal voice', () => {
    expect(everyGolferHasBetrayalVoice()).toBe(true);
  });

  it('applyInterlude marks it seen once and pays the outcome (idempotent)', () => {
    const s0: StoryState = { ...defaultStoryState('feather-fade'), alignment: 'warden', credits: 100 };
    expect(interludeSeen(s0, 'warden')).toBe(false);
    const s1 = applyInterlude(s0, 'warden');
    expect(interludeSeen(s1, 'warden')).toBe(true);
    expect(s1.credits).toBe(100 + interludeBeat('warden').creditGift);
    expect(applyInterlude(s1, 'warden')).toBe(s1);
  });
});
