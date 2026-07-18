import { describe, it, expect } from 'vitest';
import { defaultStoryState } from '../src/sim/rpg/story';
import { storyObjective } from '../src/sim/rpg/storyGuide';

/**
 * GS-story-objective — the mission-log guide. Proves `storyObjective` names the right stage, goal, sigil
 * progress, and the single next step at each point in the campaign, so the clubhouse can always tell the
 * player "what do I do now, and why?".
 */
describe('story objective guide (GS-story-objective)', () => {
  it('the goal + total is constant, sigils track trophies', () => {
    const s = defaultStoryState();
    const o = storyObjective(s);
    expect(o.total).toBe(5);
    expect(o.sigils).toBe(0);
    expect(o.goal).toMatch(/5 Galaxy Tournaments|Green Key|Jörmungandr/);
    expect(storyObjective({ ...s, trophyIds: ['sigil-emerald', 'sigil-ember'] }).sigils).toBe(2);
  });

  it('a fresh campaign points at the World Tour final (prologue)', () => {
    const o = storyObjective(defaultStoryState());
    expect(o.stage).toBe('prologue');
    expect(o.next).toMatch(/St Andrews|World Tour/);
    expect(o.action).toEqual({ type: 'storyPlayWorld', courseId: 'standrews-18' });
  });

  it('after the prologue, with no chapter worlds cleared, it says clear 2 more', () => {
    const s = { ...defaultStoryState(), chapter: 1, clearedWorldIds: ['standrews-18'] };
    const o = storyObjective(s);
    expect(o.stage).toBe('clear-worlds');
    expect(o.next).toMatch(/clear 2 more worlds/);
    expect(o.next).toMatch(/Emerald Invitational/);
    expect(o.action).toEqual({ type: 'openStoryMap' });
  });

  it('with one chapter world cleared it counts down to one more', () => {
    const s = { ...defaultStoryState(), chapter: 1, clearedWorldIds: ['standrews-18', 'verdant-18'] };
    expect(storyObjective(s).next).toMatch(/clear 1 more world\b/);
  });

  it('when enough worlds are cleared, the tournament is the next step', () => {
    const s = { ...defaultStoryState(), chapter: 1, clearedWorldIds: ['standrews-18', 'verdant-18', 'verdant2-18'] };
    const o = storyObjective(s);
    expect(o.stage).toBe('tournament');
    expect(o.next).toMatch(/Emerald Invitational is open/);
  });

  it('five Sigils forge the key → the finale is the next step', () => {
    const s = {
      ...defaultStoryState(),
      chapter: 5,
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal', 'sigil-serpent'],
    };
    const o = storyObjective(s);
    expect(o.stage).toBe('finale');
    expect(o.sigils).toBe(5);
    expect(o.next).toMatch(/Jörmungandr|Dark Root|Green Key/);
  });

  it('a completed campaign celebrates + points at Star Tour', () => {
    const s = { ...defaultStoryState(), completed: true, trophyIds: ['a', 'b', 'c', 'd', 'e'] };
    const o = storyObjective(s);
    expect(o.stage).toBe('complete');
    expect(o.next).toMatch(/Star Tour/);
  });
});
