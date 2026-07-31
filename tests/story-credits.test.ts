/**
 * GS-story-credits — the Mallrats "where are they now" roll a won campaign ends on.
 *
 * The finale recap has shipped a "Roll the credits ›" button since the finale did, and it went straight
 * to the title: a promise the game never kept. What these guards actually protect is that the roll can
 * never go quietly WRONG once it exists —
 *
 *   · it must be true about the ending it is rolling on (two paths, two sets of epilogues, no blanks);
 *   · it must name the same traitor the ending recap named one screen earlier (the roles come from the
 *     campaign's OWN seams — `betrayerId` / `heraldSeveredId` — and this proves the roll asks them);
 *   · every card must actually DRAW (a portrait token with no art is a card-shaped hole);
 *   · it must never gender the protagonist, who is a PICK (GS-story-neutral-address);
 *   · and the dedication must survive every future refactor of this screen, because that one is a
 *     promise to a real person.
 */
import { describe, it, expect } from 'vitest';
import { creditsRoll, creditsPath, creditsHeading, SPECIAL_THANKS } from '../src/sim/rpg/storyCredits';
import { castPortraitSVG } from '../src/render/castPortrait';
import { defaultStoryState } from '../src/sim/rpg/story';
import { betrayerId, heraldSeveredId } from '../src/sim/rpg/storyBetrayal';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { initState, reduce } from '../src/ui/game';
import { backIntent } from '../src/ui/back';
import type { StoryState } from '../src/sim/rpg/story';

/** A finished campaign on the given road, with both team-Sigil partners picked (so a betrayer resolves). */
const finished = (characterId: string, alignment: 'warden' | 'herald'): StoryState => {
  const others = CHARACTERS.filter((c) => c.id !== characterId).map((c) => c.id);
  return {
    ...defaultStoryState(characterId),
    alignment,
    chapter: 5,
    completed: true,
    sigil1Partner: others[0],
    sigil2Partner: others[0],
  };
};

const allCards = (story: StoryState) => creditsRoll(story).flatMap((s) => s.cards);

describe('GS-story-credits — the roll is true about the ending it rolls on', () => {
  it('every card on every path carries a name, a role and a real epilogue', () => {
    for (const ch of CHARACTERS) {
      for (const path of ['warden', 'herald'] as const) {
        const cards = allCards(finished(ch.id, path));
        expect(cards.length).toBeGreaterThan(12); // the whole cast, not a stub
        for (const c of cards) {
          expect(c.name.trim().length).toBeGreaterThan(0);
          expect(c.role.trim().length).toBeGreaterThan(0);
          // An epilogue is a sentence about a life, not a placeholder.
          expect(c.epilogue.trim().length, `${path}/${c.id}`).toBeGreaterThan(40);
        }
        expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length); // nobody appears twice
      }
    }
  });

  it('the two paths tell genuinely different stories — no shared epilogue anywhere', () => {
    const w = new Map(allCards(finished('feather-fade', 'warden')).map((c) => [c.id, c.epilogue]));
    const h = new Map(allCards(finished('feather-fade', 'herald')).map((c) => [c.id, c.epilogue]));
    for (const [id, text] of w) expect(h.get(id), id).not.toBe(text);
  });

  it('the heading + path follow the alignment (an undecided campaign reads as the Warden road)', () => {
    expect(creditsPath(finished('backspin-bo', 'herald'))).toBe('herald');
    expect(creditsHeading(finished('backspin-bo', 'herald')).title).toBe('Ragnarök');
    expect(creditsPath(defaultStoryState('backspin-bo'))).toBe('warden');
    expect(creditsPath(undefined)).toBe('warden');
    expect(creditsHeading(undefined).title).toBe('The Reseal');
    // Undefined must still build a readable roll — a defensive render can never blank the screen.
    expect(allCards(undefined as unknown as StoryState).length).toBeGreaterThan(12);
  });
});

describe('GS-story-credits — the cast the campaign actually had', () => {
  it('the hero is the campaign golfer, cast last, and every other golfer appears exactly once', () => {
    for (const ch of CHARACTERS) {
      const story = finished(ch.id, 'warden');
      const sections = creditsRoll(story);
      const last = sections[sections.length - 1]!;
      expect(last.cards).toHaveLength(1);
      expect(last.cards[0]!.id).toBe(ch.id);
      expect(last.cards[0]!.role).toContain('Warden');
      const golfers = allCards(story).filter((c) => CHARACTERS.some((g) => g.id === c.id));
      expect(golfers.map((c) => c.id).sort()).toEqual(CHARACTERS.map((c) => c.id).sort());
    }
  });

  it('the odd-one-out card follows the campaign seam, never a second opinion', () => {
    for (const ch of CHARACTERS) {
      const warden = finished(ch.id, 'warden');
      const apartW = allCards(warden).find((c) => c.role === 'The one who heard the whisper');
      expect(apartW?.id).toBe(betrayerId(warden)); // the same friend the ending recap named

      const herald = finished(ch.id, 'herald');
      const apartH = allCards(herald).find((c) => c.role === 'The friend you cut loose');
      expect(apartH?.id).toBe(heraldSeveredId(herald));
      // …and exactly one friend is cast apart; the other two stood the other way.
      expect(allCards(herald).filter((c) => c.role === 'Who came for you at the Ark')).toHaveLength(2);
    }
  });

  it('the Herald road is cast differently from the Warden road', () => {
    expect(creditsRoll(finished('longshot-larry', 'warden')).map((s) => s.title)).toContain('Your friends');
    expect(creditsRoll(finished('longshot-larry', 'herald')).map((s) => s.title)).toContain('The friends you left');
  });
});

describe('GS-story-credits — every card draws', () => {
  it('each portrait token resolves to real art (or is a deliberate text-only plate)', () => {
    const seen = new Set<string>();
    for (const path of ['warden', 'herald'] as const)
      for (const ch of CHARACTERS)
        for (const c of allCards(finished(ch.id, path))) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          const art = castPortraitSVG(c.portrait, { uidPrefix: 'cred', w: 120, h: 240 });
          if (c.portrait === '') expect(art).toBe(''); // the serpent sits for nobody
          else expect(art.startsWith('<svg'), `${c.id} → ${c.portrait}`).toBe(true);
        }
  });

  it('the shared portrait seam knows all four token shapes (GS-one-description)', () => {
    expect(castPortraitSVG('golfer:feather-fade')).toContain('<svg');
    expect(castPortraitSVG('caddy:driver-dan')).toContain('<svg');
    expect(castPortraitSVG('agent:coil-ouros')).toContain('<svg'); // resolved via the agent's OWN row
    expect(castPortraitSVG('crow')).toContain('<svg');
    expect(castPortraitSVG('')).toBe('');
    // Co-mounted golfer figures must not share SVG defs — ids are document-global.
    const a = castPortraitSVG('golfer:feather-fade', { uidPrefix: 'cred' });
    const b = castPortraitSVG('golfer:backspin-bo', { uidPrefix: 'cred' });
    expect(a).not.toBe(b);
  });
});

describe('GS-story-credits — the protagonist is never gendered', () => {
  it('the hero card speaks in the second person on both paths', () => {
    for (const ch of CHARACTERS)
      for (const path of ['warden', 'herald'] as const) {
        const sections = creditsRoll(finished(ch.id, path));
        const hero = sections[sections.length - 1]!.cards[0]!;
        expect(hero.epilogue).toMatch(/\bYou\b/);
        // The hero is a PICK (she/her · he/she/they · he/him · they/them) — no third-person pronoun
        // may reach their card, because whichever one it is misgenders three quarters of the players.
        expect(hero.epilogue).not.toMatch(/\b(he|him|his|she|her|hers|they|them|their)\b/i);
      }
  });
});

describe('GS-story-credits — the dedication', () => {
  it('names who it thanks, and what for', () => {
    const text = `${SPECIAL_THANKS.heading} ${SPECIAL_THANKS.body} ${SPECIAL_THANKS.signoff}`;
    expect(text).toContain('Unity_Starfish');
    expect(text).toContain('356 holes');
    expect(text).toContain('Unending Universe');
    expect(text).toContain('Fox');
  });
});

describe('GS-story-credits — the flow', () => {
  it('a won finale rolls the credits, and the roll ends on the title', () => {
    const won = {
      ...initState('seed', {}, undefined, finished('feather-fade', 'warden')),
      screen: 'storyFinaleResult' as const,
      lastStoryFinale: { won: true },
    };
    const rolling = reduce(won, { type: 'storyFinaleContinue' });
    expect(rolling.screen).toBe('storyCredits');
    expect(rolling.story).toBeDefined(); // the roll reads the live campaign — it must still be loaded
    expect(reduce(rolling, { type: 'endStoryCredits' }).screen).toBe('title');
  });

  it('back leaves the roll for the title — nothing is left to skip (GS-android-back)', () => {
    const rolling = { ...initState('seed', {}, undefined, finished('backspin-bo', 'herald')), screen: 'storyCredits' as const };
    const intent = backIntent(rolling);
    expect(intent).toEqual({ kind: 'navigate', action: { type: 'endStoryCredits' } });
    expect(reduce(rolling, { type: 'endStoryCredits' }).screen).toBe('title');
  });

  it('`endStoryCredits` is a no-op anywhere else — it can never be a way out of a run', () => {
    const playing = { ...initState('seed'), screen: 'playing' as const };
    expect(reduce(playing, { type: 'endStoryCredits' })).toBe(playing);
  });
});
