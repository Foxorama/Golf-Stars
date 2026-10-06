/**
 * A PARKED STORY ROUND SURVIVES WHATEVER YOU PLAY NEXT (GS-story-liveround-crossmode).
 *
 * The bug: park a Story Tour world round (the title's CONTINUE offers it), then ignore CONTINUE and start
 * anything else — a Voyage, an Unending run, a Star Tour round, the Driving Range. `persistStory` runs
 * after every action and writes `campaignWithLiveRound(state)`, which read "no story round in progress"
 * off the non-story run and REMOVED the parked round. Ignoring CONTINUE cost the player their round.
 * Reproduced on the commit before the Driving Range shipped (40a8de9), so it predates it.
 *
 * The rule now: only a STORY ROUND speaks for the campaign's round. The two deliberate ways a round
 * ends — finishing it, and `leaveRound` — still clear it; those are pinned in `story-flow.test.ts` and
 * `leave-round.test.ts`, and re-asserted at the bottom here so the two halves sit side by side.
 *
 * Asserted through `campaignWithLiveRound` — what `persistStory` WRITES — never through `state.story`
 * alone, which is a cache (the CLAUDE.md warning about asserting on `state.runSlots`, applied here).
 */

import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { campaignWithLiveRound, resumableState } from '../src/ui/resumable';

const HERO = 'backspin-bo';
const OTHER = 'longshot-larry';

function beats(s: UiState): UiState {
  let g = 0;
  while (s.screen === 'lore' && g++ < 8) s = reduce(s, { type: 'dismissLore' });
  return s;
}

function finishHole(s: UiState): UiState {
  let g = 0;
  while (s.play && !s.play.done && g++ < 600) s = reduce(s, { type: 'autoShotHole' });
  return reduce(s, { type: 'holeComplete' });
}

/** A Story world round two holes in, parked on the title. */
function parkedStory(seed: string): UiState {
  let s = beats(reduce(reduce(initState(seed), { type: 'openStory' }), { type: 'selectCharacter', characterId: HERO }));
  s = beats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' }));
  s = finishHole(finishHole(reduce(s, { type: 'playInteractive' })));
  const title = reduce(s, { type: 'toTitle' });
  expect(title.screen).toBe('title');
  expect(title.story?.liveRound?.stopHoleIndex).toBe(2);
  expect(resumableState(title).lastPlayed).toEqual({ mode: 'story', characterId: HERO });
  return title;
}

/** The other modes a player might start instead of pressing CONTINUE, each one hole in. */
const OTHER_MODES: Record<string, (title: UiState) => UiState> = {
  voyage: (t) => finishHole(reduce(beats(reduce(reduce(t, { type: 'start', format: 'voyage' }), { type: 'selectCharacter', characterId: OTHER })), { type: 'playInteractive' })),
  unending: (t) => finishHole(reduce(beats(reduce(reduce(t, { type: 'start', format: 'unending' }), { type: 'selectCharacter', characterId: OTHER })), { type: 'playInteractive' })),
  'star tour': (t) => {
    let s = reduce(reduce(t, { type: 'openStarTour' }), { type: 'selectCharacter', characterId: OTHER });
    s = beats(reduce(s, { type: 'pickStarTourCourse', courseId: 'verdant-18', effect: 'none' }));
    return finishHole(reduce(s, { type: 'playInteractive' }));
  },
  'driving range': (t) => finishHole(reduce(t, { type: 'openRange' })),
};

describe('a parked Story round survives every other mode (GS-story-liveround-crossmode)', () => {
  for (const [mode, play] of Object.entries(OTHER_MODES)) {
    it(`…a ${mode}`, () => {
      const title = parkedStory(`crossmode-${mode}`);
      const parked = title.story!.liveRound!;
      const other = play(title);
      expect(other.screen, `${mode} should be mid-round`).toMatch(/playing|result/);
      // What persistStory would write while the other mode is live: the round is still there.
      expect(campaignWithLiveRound(other)?.liveRound).toEqual(parked);
      // …and back on the title the round is still offered to the Story Tour picker.
      const back = reduce(other, { type: 'toTitle' });
      expect(back.story?.liveRound).toEqual(parked);
      expect(back.campaigns.campaigns[HERO]?.liveRound).toEqual(parked);
      // Picking the campaign up again continues it on the hole it was left on.
      const resumed = reduce(back, { type: 'storyContinueCampaign', characterId: HERO });
      expect(resumed.screen).toBe('playing');
      expect(resumed.play?.holeIndex).toBe(2);
      expect(resumed.run.storyRound).toBe(true);
    });
  }

  it('CONTINUE on the title points at the mode played LAST, and the Story round is not lost by ignoring it', () => {
    const title = parkedStory('crossmode-continue');
    const parked = title.story!.liveRound!;
    const back = reduce(OTHER_MODES.voyage!(title), { type: 'toTitle' });
    // The last thing played was the Voyage, so that is what CONTINUE offers…
    expect(resumableState(back).lastPlayed).toEqual({ mode: 'voyage', characterId: OTHER });
    const cont = reduce(back, { type: 'resume' });
    expect(cont.run.formatId).toBe('voyage');
    expect(cont.run.loadout.characterId).toBe(OTHER);
    // …and the Story round is still waiting, untouched, behind the Story Tour tile.
    expect(campaignWithLiveRound(cont)?.liveRound).toEqual(parked);
  });

  it('the Driving Range does not move CONTINUE at all', () => {
    const title = parkedStory('crossmode-range-pointer');
    const back = reduce(OTHER_MODES['driving range']!(title), { type: 'toTitle' });
    expect(resumableState(back).lastPlayed).toEqual({ mode: 'story', characterId: HERO });
  });

  it('the two deliberate endings still clear the round', () => {
    // Leaving it on purpose.
    let s = beats(reduce(reduce(initState('crossmode-leave'), { type: 'openStory' }), { type: 'selectCharacter', characterId: HERO }));
    s = beats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' }));
    s = finishHole(reduce(s, { type: 'playInteractive' }));
    const left = reduce(s, { type: 'leaveRound' });
    expect(left.screen).toBe('story');
    expect(left.story?.liveRound).toBeUndefined();
    expect(campaignWithLiveRound(left)?.liveRound).toBeUndefined();
    // Finishing it.
    let g = 0;
    while (s.screen === 'playing' && g++ < 400) s = finishHole(s);
    expect(s.screen).not.toBe('playing');
    expect(campaignWithLiveRound(s)?.liveRound).toBeUndefined();
  });
});
