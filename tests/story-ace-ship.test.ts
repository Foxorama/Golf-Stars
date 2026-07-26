import { describe, it, expect } from 'vitest';
import { initState } from '../src/ui/game';
import { resolveStoryRound } from '../src/ui/gameUpdates';
import { defaultStoryState, PROLOGUE_COURSE_ID } from '../src/sim/rpg/story';
import { ACE_SHIP_ID } from '../src/sim/rpg/ships';
import type { UiState } from '../src/ui/gameState';

/**
 * GS-ace-ship / GS-tm-names — a hole-in-one on a STORY TOUR round must land the secret Comet Rider in
 * the GLOBAL owned-ships pool, not only in the campaign's own garage.
 *
 * The bug: `resolveStoryRound` granted the ship via `grantStoryAceShip` (which writes
 * `story.ownedShipIds`) and never touched `state.ownedShips`. But the ace takeover tells the player
 * "Fly it on any golfer from the Clubhouse", and the Clubhouse rack reads `state.ownedShips` — so the
 * ship never appeared there, AND because the overlay's already-owned check ALSO reads `ownedShips`,
 * every later ace re-announced the same "SECRET UNLOCKED" reveal. Both symptoms, one cause.
 *
 * `resolveStoryTournament` was worse — it granted the ship to NEITHER pool.
 */

/** A played hole. `holed` + `strokes === 1` is the canonical definition of an ace (`aceCount`). */
function hole(par: number, strokes: number, holed = true) {
  return {
    record: { par, strokes },
    stat: { par, strokes, putts: 0, penalties: 0, fairwayHit: true },
    shots: [],
    putts: [],
    holed,
    pickedUp: false,
  };
}

/** A minimal Story-round state sitting on the prologue world, mid-campaign. */
function storyState(): UiState {
  const story = defaultStoryState('feather-fade');
  const s = initState('ace-seed', {}, undefined, story);
  return {
    ...s,
    run: { ...s.run, staticCourseId: PROLOGUE_COURSE_ID, loadout: { ...s.run.loadout, characterId: 'feather-fade' } },
  } as UiState;
}

describe('Story Tour hole-in-one grants the Comet Rider globally (GS-ace-ship)', () => {
  it('an aced story round puts the ship in BOTH the story garage and the global pool', () => {
    const s = storyState();
    expect(s.ownedShips).not.toContain(ACE_SHIP_ID);

    const played = [hole(3, 1), ...Array.from({ length: 8 }, () => hole(4, 4))];
    const out = resolveStoryRound(s, played as never);

    expect(out.lifetimeAces).toBe(s.lifetimeAces + 1); // the cross-mode tally still ticks
    expect(out.story?.ownedShipIds).toContain(ACE_SHIP_ID); // the campaign garage (unchanged behaviour)
    expect(out.ownedShips).toContain(ACE_SHIP_ID); // …and the Clubhouse pool the overlay promises
  });

  it('a second aced round does not re-grant or duplicate it (the re-announce guard)', () => {
    const s = storyState();
    const played = [hole(3, 1), ...Array.from({ length: 8 }, () => hole(4, 4))];
    const first = resolveStoryRound(s, played as never);
    const second = resolveStoryRound({ ...s, ownedShips: first.ownedShips, story: first.story }, played as never);
    // Owned exactly once — so `!ownedShips.includes(ACE_SHIP_ID)` is false and the overlay stays quiet.
    expect(second.ownedShips.filter((id) => id === ACE_SHIP_ID)).toHaveLength(1);
  });

  it('a one-stroke hole that never dropped is NOT an ace (the missing `holed` check)', () => {
    const s = storyState();
    // strokes === 1 but not holed — a partial round closed out early. The old local filter counted
    // this as an ace; the canonical `aceCount` does not.
    const played = [hole(3, 1, false), ...Array.from({ length: 8 }, () => hole(4, 4))];
    const out = resolveStoryRound(s, played as never);
    expect(out.lifetimeAces).toBe(s.lifetimeAces); // no false ace banked
    expect(out.ownedShips).not.toContain(ACE_SHIP_ID); // and no ship granted off it
  });

  it('a story round with no ace grants nothing', () => {
    const s = storyState();
    const played = Array.from({ length: 9 }, () => hole(4, 4));
    const out = resolveStoryRound(s, played as never);
    expect(out.lifetimeAces).toBe(s.lifetimeAces);
    expect(out.ownedShips).not.toContain(ACE_SHIP_ID);
  });
});
