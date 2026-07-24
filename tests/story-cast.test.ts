/**
 * GS-story-cast — your three friends aboard the ship + in the clubhouse, interactable like the Parrot.
 * Pure model (the shared "roster minus protagonist" seam + state-aware banter) + headless render assertions
 * (the friend standees appear in the Warden/undecided clubhouse, and NOT on the Herald path).
 */
import { describe, it, expect } from 'vitest';
import {
  otherGolfers,
  otherGolferIds,
  isOtherGolfer,
  castCharacter,
  castTagline,
  castLines,
  castLineAt,
  everyGolferHasCastProfile,
} from '../src/sim/rpg/storyCast';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { CHARACTERS, DEFAULT_CHARACTER_ID } from '../src/sim/rpg/characters';
import { spaceportSceneHTML } from '../src/render/storySpaceport';
import { friendInspectOverlayHTML } from '../src/render/storyCastOverlay';
import { betrayerId } from '../src/sim/rpg/storyBetrayal';
import { initState, reduce } from '../src/ui/game';

function story(over: Partial<StoryState> = {}): StoryState {
  return { ...defaultStoryState(DEFAULT_CHARACTER_ID), chapter: 1, ...over };
}

describe('GS-story-cast — the roster-minus-protagonist seam', () => {
  it('otherGolfers is exactly the three non-protagonist playable golfers, stable order', () => {
    const s = story();
    const others = otherGolfers(s);
    expect(others).toHaveLength(3);
    expect(others.map((c) => c.id)).not.toContain(s.characterId);
    // stable roster order (the CHARACTERS array minus the protagonist)
    expect(otherGolferIds(s)).toEqual(CHARACTERS.filter((c) => c.id !== s.characterId).map((c) => c.id));
  });

  it('isOtherGolfer: true for the three friends, false for the protagonist and unknown ids', () => {
    const s = story();
    for (const id of otherGolferIds(s)) expect(isOtherGolfer(s, id)).toBe(true);
    expect(isOtherGolfer(s, s.characterId)).toBe(false);
    expect(isOtherGolfer(s, 'driver-dan')).toBe(false); // a caddy, not a golfer
    expect(isOtherGolfer(s, 'nope')).toBe(false);
  });

  it('every playable golfer has an authored cast profile', () => {
    expect(everyGolferHasCastProfile()).toBe(true);
    for (const c of CHARACTERS) {
      expect(castTagline(c.id).length).toBeGreaterThan(0);
      expect(castCharacter(c.id)?.id).toBe(c.id);
    }
  });
});

describe('GS-story-cast — state-aware banter', () => {
  it('cycles a non-empty pool; the 0th tap is the friendship bond line', () => {
    const s = story();
    const id = otherGolferIds(s)[0]!;
    const lines = castLines(s, id);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.every((l) => l.length > 0)).toBe(true);
    // wraps
    expect(castLineAt(s, id, 0)).toBe(lines[0]);
    expect(castLineAt(s, id, lines.length)).toBe(lines[0]);
    expect(castLineAt(s, id, -1)).toBe(lines[lines.length - 1]);
  });

  it('the pool adapts to the fork: Warden adds warm lines, Herald adds wary lines (and they differ)', () => {
    const id = otherGolferIds(story())[0]!;
    const undecided = castLines(story(), id);
    const warden = castLines(story({ chapter: 4, alignment: 'warden' }), id);
    const herald = castLines(story({ chapter: 4, alignment: 'herald' }), id);
    // both fork variants add lines the undecided pool doesn't have, and they diverge from each other
    expect(warden.length).toBeGreaterThan(undecided.length);
    expect(herald.length).toBeGreaterThan(undecided.length);
    expect(new Set(warden)).not.toEqual(new Set(herald));
  });
});

describe('GS-story-cast — clubhouse + card render', () => {
  // the class name also appears once in the <style> block, so count the standee BUTTON, not the class.
  const FRIEND_BTN = 'class="gs-sclub-golfer gs-sclub-friend"';

  it('the Warden/undecided clubhouse shows all three friend standees, tappable, named', () => {
    const s = story();
    const html = spaceportSceneHTML(s);
    const count = (html.split(FRIEND_BTN).length - 1);
    expect(count).toBe(3);
    for (const c of otherGolfers(s)) {
      expect(html).toContain(c.shortName);
      // tappable via the widened storyInspectAlly action carrying the golfer id
      expect(html).toContain(`"caddyId":"${c.id}"`);
    }
  });

  it('the prologue clubhouse (chapter 0) shows no friend standees yet', () => {
    expect(spaceportSceneHTML(story({ chapter: 0 }))).not.toContain(FRIEND_BTN);
  });

  it('the Herald sanctum shows no friend standees — they have left you', () => {
    const html = spaceportSceneHTML(story({ chapter: 4, alignment: 'herald' }));
    expect(html).not.toContain(FRIEND_BTN);
  });

  it('after The Defection the betrayer is gone from the clubhouse — a hat is left in their place (GS-story-defection-clubhouse)', () => {
    // Warden, both picks locked (huang/larry) → betrayer = backspin-bo; defection interlude played.
    const s = story({
      chapter: 5,
      alignment: 'warden',
      sigil1Partner: 'huang-woo-hook',
      sigil2Partner: 'longshot-larry',
      seenStoryBeats: { 'interlude-warden': true },
    });
    const betrayer = betrayerId(s); // backspin-bo
    const html = spaceportSceneHTML(s);
    // the two loyal friends still stand, tappable…
    const count = html.split(FRIEND_BTN).length - 1;
    expect(count).toBe(2);
    // …the defector is no longer a talkable standee…
    expect(html).not.toContain(`"caddyId":"${betrayer}"`);
    // …and their abandoned hat is on the floor instead (the rendered element, not just the CSS rule).
    expect(html).toContain('class="gs-sclub-lefthat"');
    expect(html).toContain('hat, left behind');
  });

  it('before The Defection all three friends (incl. the eventual betrayer) still stand in the clubhouse', () => {
    const s = story({
      chapter: 4,
      alignment: 'warden',
      sigil1Partner: 'huang-woo-hook',
      sigil2Partner: 'longshot-larry',
      // no interlude-warden yet → nobody has defected
    });
    const html = spaceportSceneHTML(s);
    expect(html.split(FRIEND_BTN).length - 1).toBe(3);
    // 'gs-sclub-lefthat' is always present in the <style> block, so assert on the rendered element's text.
    expect(html).not.toContain('hat, left behind');
    expect(html).toContain(`"caddyId":"${betrayerId(s)}"`);
  });

  it('the friend talk card renders the golfer, a banter line, and a close action', () => {
    const s = story();
    const id = otherGolferIds(s)[0]!;
    const card = friendInspectOverlayHTML(id, s, 0);
    expect(card).toContain(castCharacter(id)!.name);
    expect(card).toContain(castLineAt(s, id, 0));
    expect(card).toContain('storyCloseAlly');
    expect(card).toContain('storyAllyTalk');
  });
});

describe('GS-story-cast — the reducer interaction (tap → talk → close)', () => {
  it('inspecting a friend golfer opens their card; Another cycles; Close clears it', () => {
    const hub = reduce(reduce(initState('seed'), { type: 'openStory' }), {
      type: 'selectCharacter',
      characterId: 'backspin-bo',
    });
    expect(hub.screen).toBe('story');
    const friendId = otherGolferIds(hub.story!)[0]!;

    const open = reduce(hub, { type: 'storyInspectAlly', caddyId: friendId });
    expect(open.storyAllyInspectId).toBe(friendId);
    expect(open.storyAllyTalk).toBe(0);

    const another = reduce(open, { type: 'storyAllyTalk', caddyId: friendId });
    expect(another.storyAllyTalk).toBe(1);

    const closed = reduce(another, { type: 'storyCloseAlly' });
    expect(closed.storyAllyInspectId).toBeUndefined();
  });

  it('inspecting your OWN protagonist id is a no-op (guard rejects it)', () => {
    const hub = reduce(reduce(initState('seed'), { type: 'openStory' }), {
      type: 'selectCharacter',
      characterId: 'backspin-bo',
    });
    const same = reduce(hub, { type: 'storyInspectAlly', caddyId: 'backspin-bo' });
    expect(same.storyAllyInspectId).toBeUndefined();
  });
});
