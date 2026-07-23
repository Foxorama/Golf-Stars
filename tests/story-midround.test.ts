/**
 * GS-story-midround-omen — the PRE-CHOICE betrayal foreshadow shown at the nine-hole pause of the
 * Chapter-3 major, before The Choice. Pure picker + per-character voice coverage + the reducer flow
 * (the hole-9 divert to the beat, then on to the halftime rival pop, exactly once per run).
 */
import { describe, it, expect } from 'vitest';
import {
  midroundOmen,
  midroundOmenSeen,
  applyMidroundOmen,
  MIDROUND_OMEN_ID,
  MIDROUND_OMEN_CHAPTER,
} from '../src/sim/rpg/storyMidround';
import {
  betrayerId,
  betrayerOddness,
  betrayalSidelined,
  betrayalTempted,
  everyGolferHasBetrayalVoice,
} from '../src/sim/rpg/storyBetrayal';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { otherGolferIds } from '../src/sim/rpg/storyCast';
import { initState, reduce } from '../src/ui/game';
import type { UiState } from '../src/ui/gameState';

// protagonist feather-fade → others, in roster order:
const s = (p1?: string, p2?: string, extra: Partial<StoryState> = {}): StoryState => ({
  ...defaultStoryState('feather-fade'),
  chapter: MIDROUND_OMEN_CHAPTER,
  sigil1Partner: p1,
  sigil2Partner: p2,
  ...extra,
});
const OTHERS = otherGolferIds(defaultStoryState('feather-fade')); // [huang-woo-hook, longshot-larry, backspin-bo]
const [A, B, C] = OTHERS as [string, string, string];

describe('GS-story-midround-omen — the pre-Choice foreshadow picker', () => {
  it('fires at the Chapter-3 turn, before The Choice, once both team-Sigil picks are locked', () => {
    const omen = midroundOmen(s(A, B), 3);
    expect(omen).toBeTruthy();
    expect(omen!.id).toBe(MIDROUND_OMEN_ID);
    expect(omen!.charId).toBe(betrayerId(s(A, B))); // = C, the friend never picked
    expect(omen!.lines.length).toBeGreaterThanOrEqual(3);
  });

  it('TWO DIFFERENT partners → the SIDELINED omen names the unpicked friend', () => {
    const omen = midroundOmen(s(A, B), 3)!;
    expect(omen.flavour).toBe('sidelined');
    expect(omen.charId).toBe(C);
    expect(omen.portrait).toBe(`golfer:${C}`);
    // it IS the sidelined voice for that friend
    expect(omen.lines).toEqual(betrayalSidelined(C));
  });

  it('the SAME partner twice → the TEMPTED omen names the trusted friend (the twist)', () => {
    const omen = midroundOmen(s(A, A), 3)!;
    expect(omen.flavour).toBe('tempted');
    expect(omen.charId).toBe(A);
    expect(omen.lines).toEqual(betrayalTempted(A));
  });

  it('betrayerOddness classifies why the betrayer is the odd one out (undefined until both picks lock)', () => {
    expect(betrayerOddness(s(A, B))).toBe('sidelined');
    expect(betrayerOddness(s(A, A))).toBe('tempted');
    expect(betrayerOddness(s(A, undefined))).toBeUndefined(); // only one pick → not settled
    expect(betrayerOddness(s(undefined, undefined))).toBeUndefined();
  });

  it('does NOT fire off the Chapter-3 turn, after The Choice, before both picks, or once seen', () => {
    expect(midroundOmen(s(A, B), 1)).toBeUndefined(); // wrong chapter
    expect(midroundOmen(s(A, B), 2)).toBeUndefined();
    expect(midroundOmen(s(A, B), 4)).toBeUndefined();
    expect(midroundOmen(s(A, B, { alignment: 'warden' }), 3)).toBeUndefined(); // The Choice already made
    expect(midroundOmen(s(A, undefined), 3)).toBeUndefined(); // only one pick locked
    expect(midroundOmen(s(A, B, { seenStoryBeats: { [MIDROUND_OMEN_ID]: true } }), 3)).toBeUndefined(); // already seen
    expect(midroundOmen(undefined, 3)).toBeUndefined();
  });

  it('applyMidroundOmen marks it seen exactly once (a double-apply is a no-op)', () => {
    const st = s(A, B);
    expect(midroundOmenSeen(st)).toBe(false);
    const once = applyMidroundOmen(st);
    expect(midroundOmenSeen(once)).toBe(true);
    expect(applyMidroundOmen(once)).toBe(once); // idempotent — same object
  });
});

describe('GS-story-midround-omen — per-character voice coverage', () => {
  it('every golfer has a full betrayal voice, now including the mid-round scenes', () => {
    expect(everyGolferHasBetrayalVoice()).toBe(true);
  });

  it('every golfer has a distinct, non-empty sidelined + tempted scene', () => {
    for (const ch of CHARACTERS) {
      const sidelined = betrayalSidelined(ch.id);
      const tempted = betrayalTempted(ch.id);
      expect(sidelined.length).toBeGreaterThanOrEqual(3);
      expect(tempted.length).toBeGreaterThanOrEqual(2);
      // the tempted friend heard the word and admits there's "something to it" (the player's ask) — in
      // their own voice, so Larry's colloquial "somethin' to it" counts too.
      expect(tempted.map((l) => l.text).join(' ').toLowerCase()).toMatch(/somethin['’g]? to it/);
      // the sidelined friend was overlooked and a Coil NPC (Voss or Venoma) reaches them
      const sideText = sidelined.map((l) => l.text).join(' ');
      expect(/Voss|Venoma|Apostate|Viper/.test(sideText)).toBe(true);
    }
  });

  it('Huang-Woo\'s Coil thread is Venoma (the player\'s named example)', () => {
    const side = betrayalSidelined('huang-woo-hook').map((l) => l.text).join(' ');
    const tempt = betrayalTempted('huang-woo-hook').map((l) => l.text).join(' ');
    expect(side).toContain('Venoma');
    expect(tempt).toContain('Venoma');
  });

  it('the scenes are the SAME friend\'s voice as their later defection arc (one arc, not a switch-flip)', () => {
    // the omen fires for the betrayer, whose defection/farewell voice reads the same id — a coverage spot-check
    for (const ch of CHARACTERS) {
      expect(betrayalSidelined(ch.id)).not.toEqual(betrayalTempted(ch.id));
    }
  });
});

// ── The reducer flow: reach the Chapter-3 major's turn interactively and prove the divert ────────────────

/** A Chapter-3 campaign qualified for the Storm Championship, with both partner picks locked. */
function stormReady(p1: string, p2: string): UiState {
  const story: StoryState = {
    ...defaultStoryState('feather-fade'),
    chapter: 3,
    sigil1Partner: p1,
    sigil2Partner: p2,
    clearedWorldIds: ['standrews-18', 'crystal-18', 'fungal-18'],
    // Ch.3 qualifier events are the non-venue Ch.3 worlds; qualify (top-N) in two of them.
    qualifierResults: { 'crystal-18': { place: 1, field: 16 }, 'fungal-18': { place: 2, field: 16 } },
    // arm the bag a little so the round plays cleanly (balance-irrelevant to the divert)
    ownedClubIds: [...defaultStoryState().ownedClubIds, 'club:solar:D'],
    equippedBagIds: defaultStoryState().equippedBagIds.map((id) => (id === 'D' ? 'club:solar:D' : id)),
  };
  return { ...initState('storm-seed', {}, undefined, story), screen: 'story' as const };
}

/** Dismiss any arrival lore beat(s) so we reach the intro (the Ch.3 tee-off fires Coilkeeper/Apostate beats). */
function pastLore(s0: UiState): UiState {
  let s1 = s0;
  while (s1.screen === 'lore') s1 = reduce(s1, { type: 'dismissLore' });
  return s1;
}

/** Play interactively hole-by-hole until we leave the 'playing' screen (a pop/beat/result). */
function playUntilNotPlaying(s0: UiState): UiState {
  let s1 = s0;
  let guard = 0;
  while (s1.screen === 'playing' && guard++ < 60) {
    let inner = 0;
    while (s1.play && !s1.play.done && inner++ < 400) s1 = reduce(s1, { type: 'autoShotHole' });
    s1 = reduce(s1, { type: 'holeComplete' });
  }
  return s1;
}

describe('GS-story-midround-omen — the reducer flow at the Storm turn', () => {
  it('diverts to the mid-round beat at hole 9, then flows into the halftime pop, then plays the back nine', () => {
    const hub = stormReady(A, B); // distinct picks → the sidelined omen for C
    const intro = pastLore(reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' }));
    expect(intro.screen).toBe('intro');
    expect(intro.run.storyTournament).toBe(3);

    const s1 = playUntilNotPlaying(reduce(intro, { type: 'playInteractive' }));
    // At the turn: the pre-Choice foreshadow lands BEFORE the rival pop.
    expect(s1.screen).toBe('storyMidBeat');
    expect(s1.pendingMidBeat!.charId).toBe(betrayerId(hub.story!)); // = C
    expect(s1.pendingMidBeat!.flavour).toBe('sidelined');
    // the halftime pop payload is already stashed underneath (shown after the beat)
    expect(s1.storyTournamentMidPop).toBeTruthy();

    // Continue → the beat is marked seen (fires once) and the halftime rival pop shows.
    const pop = reduce(s1, { type: 'storyMidBeatContinue' });
    expect(pop.screen).toBe('storyTournamentPop');
    expect(pop.pendingMidBeat).toBeUndefined();
    expect(pop.story!.seenStoryBeats[MIDROUND_OMEN_ID]).toBe(true);

    // Continue → the back nine.
    const back = reduce(pop, { type: 'tournamentPopContinue' });
    expect(back.screen).toBe('playing');
    expect(back.play!.holeIndex).toBe(9);

    // The round still finishes to a tournament result, and the beat never re-fires.
    const done = playUntilNotPlaying(back);
    expect(done.screen).toBe('storyTournamentResult');
  });

  it('a Chapter-1 major\'s turn shows the classic rival pop, never the mid-round beat (no false fire)', () => {
    // A Ch.1 campaign teeing off the Emerald major has no locked picks yet → the omen must not fire.
    const story: StoryState = {
      ...defaultStoryState('feather-fade'),
      chapter: 1,
      clearedWorldIds: ['standrews-18', 'verdant-18', 'verdant2-18', 'desert-18'],
      qualifierResults: { 'verdant2-18': { place: 1, field: 16 }, 'desert-18': { place: 4, field: 16 } },
    };
    const hub = { ...initState('emerald-seed', {}, undefined, story), screen: 'story' as const };
    const intro = pastLore(reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' }));
    const s1 = playUntilNotPlaying(reduce(intro, { type: 'playInteractive' }));
    expect(s1.screen).toBe('storyTournamentPop'); // straight to the rival pop, no beat
    expect(s1.pendingMidBeat).toBeUndefined();
  });
});
