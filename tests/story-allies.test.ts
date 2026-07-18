import { describe, it, expect } from 'vitest';
import { initState, reduce } from '../src/ui/game';
import { defaultStoryState } from '../src/sim/rpg/story';
import {
  allyTalk,
  allyLineAt,
  allyFactionName,
  allyFactionBlurb,
  allyName,
  allyHomeWorld,
  talkableAllies,
  crewRoster,
  STORY_ALLY_TALK,
} from '../src/sim/rpg/storyAllies';
import { STORY_CADDY_STOCK } from '../src/sim/rpg/storyCaddies';
import { caddyPortraitSVG } from '../src/render/caddyPortraits';

describe('Story crew ally interactions (GS-story-allies)', () => {
  it('every recruitable roster caddy is talkable, faction-tagged, AND has a portrait avatar', () => {
    // The clubhouse must never show a friend with no card / no face — this is the "avatars added" gate.
    for (const caddyId of Object.values(STORY_CADDY_STOCK)) {
      const talk = allyTalk(caddyId);
      expect(talk, `${caddyId} has talk content`).toBeDefined();
      expect(talk!.lines.length, `${caddyId} has banter lines`).toBeGreaterThan(0);
      expect(allyFactionName(caddyId), `${caddyId} has a faction`).not.toBe('');
      expect(allyFactionBlurb(caddyId), `${caddyId} has a faction blurb`).not.toBe('');
      expect(caddyPortraitSVG(caddyId), `${caddyId} has a portrait`).toContain('<svg');
    }
    // talkableAllies enumerates exactly the placed, named, talkable roster.
    expect(new Set(talkableAllies())).toEqual(new Set(Object.values(STORY_CADDY_STOCK)));
  });

  it('banter cycles through the lines and wraps (never out of range)', () => {
    const dan = 'driver-dan';
    const n = STORY_ALLY_TALK[dan]!.lines.length;
    expect(allyLineAt(dan, 0)).toBe(STORY_ALLY_TALK[dan]!.lines[0]);
    expect(allyLineAt(dan, n)).toBe(STORY_ALLY_TALK[dan]!.lines[0]); // wraps
    expect(allyLineAt(dan, n + 2)).toBe(STORY_ALLY_TALK[dan]!.lines[2]);
    expect(allyLineAt('not-a-caddy', 0)).toBe('');
  });

  it('faction/name/home resolve for a known ally', () => {
    expect(allyFactionName('driver-dan')).toBe('The Long Haul Truckers');
    expect(allyName('driver-dan')).toBeTruthy();
    expect(allyHomeWorld('driver-dan')).toBe('derelict-18'); // his old rig, where you recruit him
  });

  it('crewRoster lists only hired, talkable allies in recruit order', () => {
    const story = { ...defaultStoryState(), hiredCaddyIds: ['driver-dan', 'not-a-caddy', 'auto-caddie'] };
    expect(crewRoster(story)).toEqual(['driver-dan', 'auto-caddie']);
  });

  it('reducer: tap a crew ally on the hub → talk card → cycle banter → carry my bag → close', () => {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 2,
      hiredCaddyIds: ['driver-dan', 'auto-caddie'],
      activeCaddyId: 'driver-dan',
    };
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };

    // Tapping a hired ally opens their card (banter starts on line 0).
    const open = reduce(hub, { type: 'storyInspectAlly', caddyId: 'auto-caddie' });
    expect(open.storyAllyInspectId).toBe('auto-caddie');
    expect(open.storyAllyTalk).toBe(0);

    // A stray tap for a NON-hired caddy is a no-op.
    expect(reduce(hub, { type: 'storyInspectAlly', caddyId: 'mystic-mole' })).toBe(hub);

    // Cycle the banter.
    const talk = reduce(open, { type: 'storyAllyTalk', caddyId: 'auto-caddie' });
    expect(talk.storyAllyTalk).toBe(1);

    // "Carry my bag" makes this ally active (setStoryCaddy now works on the hub, not just the Locker).
    const equipped = reduce(talk, { type: 'setStoryCaddy', caddyId: 'auto-caddie' });
    expect(equipped.story?.activeCaddyId).toBe('auto-caddie');

    // Close the card.
    const closed = reduce(equipped, { type: 'storyCloseAlly' });
    expect(closed.storyAllyInspectId).toBeUndefined();
    expect(closed.storyAllyTalk).toBeUndefined();
  });
});
