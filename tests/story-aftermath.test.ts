/**
 * GS-story-aftermath — the post-result CONFRONTATION beat shown after a back-half Sigil scorecard (win or
 * loss). Pure coverage: which majors get a beat, the right speaker/portrait per case, the `{betrayer}`
 * token, and trunk / Ch.4-Herald-win returning undefined (unchanged flow). Plus the reducer flow
 * (result → aftermath → interlude on a Ch.4 Warden win; result → aftermath → clubhouse on a loss).
 */
import { describe, it, expect } from 'vitest';
import { tournamentAftermath } from '../src/sim/rpg/storyAftermath';
import { tournamentForChapter } from '../src/sim/rpg/storyTournaments';
import { betrayerId, heraldSeveredId, heraldOpponentIds } from '../src/sim/rpg/storyBetrayal';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { getCharacter } from '../src/sim/rpg/characters';
import { otherGolferIds } from '../src/sim/rpg/storyCast';
import { initState, reduce } from '../src/ui/game';
import type { UiState } from '../src/ui/gameState';

const OTHERS = otherGolferIds(defaultStoryState('feather-fade'));
const [A, B] = OTHERS as [string, string, string];

/** A campaign on a path, with both team-Sigil picks on record so the betrayal arc resolves real friends. */
const s = (alignment: 'warden' | 'herald', p1 = A, p2 = B, chapter = 5): StoryState => ({
  ...defaultStoryState('feather-fade'),
  chapter,
  alignment,
  sigil1Partner: p1,
  sigil2Partner: p2,
  trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm'],
});

const shortName = (id: string) => getCharacter(id)?.shortName ?? id;

describe('GS-story-aftermath — which majors get a confrontation beat', () => {
  it('trunk majors (Ch.1–3) get NO aftermath, win or loss (unchanged flow)', () => {
    for (const ch of [1, 2, 3]) {
      const t = tournamentForChapter(ch)!;
      expect(tournamentAftermath(t, s('warden'), true)).toBeUndefined();
      expect(tournamentAftermath(t, s('warden'), false)).toBeUndefined();
    }
  });

  it('Ch.4 WARDEN (Scorpius) lands a beat on WIN and LOSS — the Silent Sting, wordless', () => {
    const t = tournamentForChapter(4, 'warden')!;
    const story = s('warden');
    const win = tournamentAftermath(t, story, true)!;
    const loss = tournamentAftermath(t, story, false)!;
    expect(win.id).toBe('aftermath-4warden-win');
    expect(loss.id).toBe('aftermath-4warden-loss');
    for (const b of [win, loss]) {
      expect(b.portrait).toBe('scorpius');
      expect(b.speaker).toMatch(/Silent Sting/);
      expect(b.lines.length).toBeGreaterThan(0);
      // He never speaks except the name on the card → exactly one `say` line, and it's the {betrayer} token.
      const says = b.lines.filter((l) => l.kind === 'say');
      expect(says.length).toBe(1);
      expect(says[0]!.text).toContain('{betrayer}');
    }
    expect(win.won).toBe(true);
    expect(loss.won).toBe(false);
  });

  it('Ch.4 HERALD gives a beat on LOSS but NOT on WIN (the Severing interlude owns the win)', () => {
    const t = tournamentForChapter(4, 'herald')!;
    const story = s('herald');
    expect(tournamentAftermath(t, story, true)).toBeUndefined();
    const loss = tournamentAftermath(t, story, false)!;
    expect(loss.id).toBe('aftermath-4herald-loss');
    // The severed friend speaks in their own figure — the same friend the Severing then cuts loose.
    const sev = heraldSeveredId(story);
    expect(loss.portrait).toBe(`golfer:${sev}`);
    expect(loss.speaker).toBe(shortName(sev));
  });

  it('Ch.5 WARDEN — the Green Key forges on a win (the Parrot); Venoma keeps the door on a loss', () => {
    const t = tournamentForChapter(5, 'warden')!;
    const story = s('warden');
    const win = tournamentAftermath(t, story, true)!;
    const loss = tournamentAftermath(t, story, false)!;
    expect(win.id).toBe('aftermath-5warden-win');
    expect(win.portrait).toBe('prognostic-parrot');
    expect(win.lines.some((l) => l.text.includes(shortName(betrayerId(story))))).toBe(true); // names the betrayer
    expect(loss.id).toBe('aftermath-5warden-loss');
    expect(loss.portrait).toBe('venoma');
  });

  it('Ch.5 HERALD — the root opens on a win (the Coil); the two friends bar the way on a loss', () => {
    const t = tournamentForChapter(5, 'herald')!;
    const story = s('herald');
    const win = tournamentAftermath(t, story, true)!;
    const loss = tournamentAftermath(t, story, false)!;
    expect(win.id).toBe('aftermath-5herald-win');
    expect(win.portrait).toBe('crow');
    const [oppA] = heraldOpponentIds(story);
    expect(loss.id).toBe('aftermath-5herald-loss');
    expect(loss.portrait).toBe(`golfer:${oppA}`);
  });
});

describe('GS-story-aftermath — the reducer flow', () => {
  const recap = (story: StoryState, won: boolean): UiState => ({
    ...initState('seed', {}, undefined, story),
    screen: 'storyTournamentResult' as const,
    lastStoryTournament: {
      chapter: 4,
      name: 'The Abyssal Vigil',
      sigilName: 'The Abyssal Sigil',
      prize: '',
      rivalName: 'Scorpius "the Silent Sting"',
      playerGross: won ? 70 : 74,
      rivalGross: 72,
      won,
      finalSigil: false,
    },
  });

  it('a Ch.4 Warden WIN: result → aftermath beat → the Defection interlude', () => {
    const story = { ...s('warden', A, B, 5), trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal'] };
    const after = reduce(recap(story, true), { type: 'storyTournamentContinue' });
    expect(after.screen).toBe('storyTournamentAftermath');
    expect(after.pendingAftermath!.id).toBe('aftermath-4warden-win');
    // still carries the recap so the continuation can branch to the interlude
    expect(after.lastStoryTournament).toBeTruthy();
    const next = reduce(after, { type: 'storyAftermathContinue' });
    expect(next.screen).toBe('storyInterlude');
    expect(next.pendingAftermath).toBeUndefined();
  });

  it('a Ch.4 Warden LOSS: result → aftermath beat → the clubhouse (no interlude)', () => {
    const story = s('warden', A, B, 4);
    const after = reduce(recap(story, false), { type: 'storyTournamentContinue' });
    expect(after.screen).toBe('storyTournamentAftermath');
    expect(after.pendingAftermath!.id).toBe('aftermath-4warden-loss');
    const next = reduce(after, { type: 'storyAftermathContinue' });
    expect(next.screen).toBe('story');
    expect(next.lastStoryTournament).toBeUndefined();
  });

  it('storyAftermathContinue is a no-op off the aftermath screen', () => {
    const story = s('warden');
    const base = initState('seed', {}, undefined, story);
    expect(reduce(base, { type: 'storyAftermathContinue' })).toBe(base);
  });
});
