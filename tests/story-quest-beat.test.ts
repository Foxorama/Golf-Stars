/**
 * GS-story-caddy-quest-dialogue — the CADDY-QUEST MID-ROUND BEAT (the "discussion DURING the quest").
 *
 * Proves the pure assembler (quest-only, content-driven, byte-identical when a quest has no `duringQuest`)
 * and the reducer flow: an ally's quest round pauses ONCE at the turn for the caddy's beat, then plays on to
 * the completion recap — and a NON-quest round never diverts (no interruption of the main story).
 */
import { describe, it, expect } from 'vitest';
import { questBeatFor, questBeatTurnIndex } from '../src/sim/rpg/storyQuestBeat';
import { STORY_QUESTS, questForCaddy } from '../src/sim/rpg/storyQuests';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { initState, reduce } from '../src/ui/game';
import type { Run } from '../src/sim/rpg/run';
import type { UiState } from '../src/ui/gameState';

describe('GS-story-caddy-quest-dialogue — the pure mid-round beat assembler', () => {
  it('the turn index is the middle of the round (a 9-hole quest pauses after the 5th)', () => {
    expect(questBeatTurnIndex(9)).toBe(5);
    expect(questBeatTurnIndex(18)).toBe(9);
    expect(questBeatTurnIndex(1)).toBe(1);
  });

  it('assembles a beat from the active quest — the caddy speaks in their own portrait', () => {
    const run = { storyQuest: 'quest-sandy' } as unknown as Run;
    const beat = questBeatFor(run)!;
    expect(beat).toBeTruthy();
    expect(beat.questId).toBe('quest-sandy');
    expect(beat.caddyId).toBe('sandy-sandsaver');
    expect(beat.portrait).toBe('caddy:sandy-sandsaver');
    expect(beat.lines).toEqual(questForCaddy('sandy-sandsaver')!.duringQuest);
    expect(beat.lines.length).toBeGreaterThanOrEqual(2);
  });

  it('is QUEST-ONLY — no run, no storyQuest, or an unknown quest → no beat (never fires elsewhere)', () => {
    expect(questBeatFor(undefined)).toBeUndefined();
    expect(questBeatFor({} as Run)).toBeUndefined();
    expect(questBeatFor({ storyQuest: 'nope' } as unknown as Run)).toBeUndefined();
  });

  // The caddies whose mid-round beat has SHIPPED (GS-story-caddy-quest-dialogue, one PR each). Each must
  // resolve a beat with the caddy's own portrait — extend this as each caddy lands so coverage never regresses.
  const SHIPPED = ['quest-sandy', 'quest-chipinski', 'quest-sam', 'quest-penelope'];
  it('every shipped caddy quest resolves a mid-round beat with its own portrait', () => {
    for (const id of SHIPPED) {
      const beat = questBeatFor({ storyQuest: id } as unknown as Run)!;
      expect(beat, `${id} has a beat`).toBeTruthy();
      expect(beat.portrait).toBe(`caddy:${beat.caddyId}`);
      expect(beat.lines.length, `${id} beat has lines`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a quest with no authored `duringQuest` lines produces no beat (byte-identical, no pause)', () => {
    // Every quest that HAS lines resolves; one without stays silent — the optional-field contract.
    for (const q of STORY_QUESTS) {
      const beat = questBeatFor({ storyQuest: q.id } as unknown as Run);
      if (q.duringQuest && q.duringQuest.length > 0) {
        expect(beat, `${q.id} has a beat`).toBeTruthy();
        expect(beat!.lines).toEqual(q.duringQuest);
      } else {
        expect(beat, `${q.id} has no beat`).toBeUndefined();
      }
    }
  });
});

// ── The reducer flow: tee off Sandy's quest and prove the single mid-round pause ─────────────────────────

/** A campaign with Sandy on the bag and her quest accepted, ready to fly out and play it. */
function sandyQuestReady(): UiState {
  const story: StoryState = {
    ...defaultStoryState('feather-fade'),
    chapter: 2,
    hiredCaddyIds: ['sandy-sandsaver'],
    activeCaddyId: 'sandy-sandsaver',
    caddiedRoundIds: ['sandy-sandsaver'],
    clearedWorldIds: ['standrews-18'], // cleared elsewhere (past the quest-beat gate)
    activeQuestId: 'quest-sandy',
  };
  return { ...initState('sandy-quest-seed', {}, undefined, story), screen: 'story' as const };
}

/** Dismiss any arrival lore beat(s) so we reach the intro. */
function pastLore(s0: UiState): UiState {
  let s1 = s0;
  let guard = 0;
  while (s1.screen === 'lore' && guard++ < 10) s1 = reduce(s1, { type: 'dismissLore' });
  return s1;
}

/** Play interactively hole-by-hole until we leave the 'playing' screen (a beat/result). */
function playUntilNotPlaying(s0: UiState): UiState {
  let s1 = s0;
  let guard = 0;
  while (s1.screen === 'playing' && guard++ < 40) {
    let inner = 0;
    while (s1.play && !s1.play.done && inner++ < 400) s1 = reduce(s1, { type: 'autoShotHole' });
    s1 = reduce(s1, { type: 'holeComplete' });
  }
  return s1;
}

describe('GS-story-caddy-quest-dialogue — the reducer flow on a quest round', () => {
  it('pauses ONCE at the turn for the caddy beat, then plays on to the completion recap', () => {
    const hub = sandyQuestReady();
    const intro = pastLore(reduce(hub, { type: 'playStoryQuest' }));
    expect(intro.screen).toBe('intro');
    expect(intro.run.storyQuest).toBe('quest-sandy');
    expect(intro.course.holes.length).toBe(9); // a 9-hole quest round

    // Play to the turn → the caddy's mid-round beat diverts the screen.
    const s1 = playUntilNotPlaying(reduce(intro, { type: 'playInteractive' }));
    expect(s1.screen).toBe('storyQuestBeat');
    expect(s1.pendingQuestBeat!.caddyId).toBe('sandy-sandsaver');
    expect(s1.pendingQuestBeat!.questId).toBe('quest-sandy');
    // banked exactly the turn-many holes so far (the 5th hole is up next).
    expect(s1.stopPlayed!.length).toBe(questBeatTurnIndex(9));

    // Continue → tee up the turn hole and play on; the beat is cleared and never re-fires.
    const back = reduce(s1, { type: 'storyQuestBeatContinue' });
    expect(back.screen).toBe('playing');
    expect(back.pendingQuestBeat).toBeUndefined();
    expect(back.play!.holeIndex).toBe(questBeatTurnIndex(9));

    // The round finishes to the quest completion recap (which offers the reward) — beat fired exactly once.
    const done = playUntilNotPlaying(back);
    expect(done.screen).toBe('storyResult');
    expect(done.lastStoryRound!.questId).toBe('quest-sandy');
  });

  it('a NON-quest world round never diverts to the caddy beat (no main-story interruption)', () => {
    const story: StoryState = {
      ...defaultStoryState('feather-fade'),
      chapter: 1,
      clearedWorldIds: ['standrews-18'],
    };
    const hub = { ...initState('plain-world-seed', {}, undefined, story), screen: 'story' as const };
    // Fly a plain, already-cleared world (a revisit exploration clear — no quest, no qualifier gating here).
    const intro = pastLore(reduce(hub, { type: 'storyPlayWorld', courseId: 'standrews-18' }));
    expect(intro.run.storyQuest).toBeUndefined();
    let s1 = reduce(intro, { type: 'playInteractive' });
    let guard = 0;
    while (s1.screen === 'playing' && guard++ < 40) {
      let inner = 0;
      while (s1.play && !s1.play.done && inner++ < 400) s1 = reduce(s1, { type: 'autoShotHole' });
      const next = reduce(s1, { type: 'holeComplete' });
      expect(next.screen).not.toBe('storyQuestBeat'); // never the caddy beat on a non-quest round
      s1 = next;
    }
    expect(s1.screen).toBe('storyResult');
  });
});
