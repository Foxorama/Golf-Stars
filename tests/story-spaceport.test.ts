import { describe, it, expect } from 'vitest';
import { defaultStoryState } from '../src/sim/rpg/story';
import { spaceportSceneHTML } from '../src/render/storySpaceport';

/**
 * GS-story-crew-scene — the recruited crew stand IN the Mothership clubhouse scene (not just a wall below).
 * `spaceportSceneHTML` is a pure string builder, so we can assert its output directly: it renders the four
 * tap hotspots + your golfer always, and a tappable standee per recruited ally (the active one marked).
 */
describe('spaceport clubhouse scene (GS-story-crew-scene)', () => {
  it('always renders the four door hotspots + the player, with no crew standees when none recruited', () => {
    const html = spaceportSceneHTML(defaultStoryState());
    expect(html).toContain('openStoryMap'); // star chart
    expect(html).toContain('openStoryShipyard'); // hangar
    expect(html).toContain('openStoryLocker'); // locker
    expect(html).toContain('openStoryBar'); // the bar
    expect(html).toContain('gs-sclub-golfer'); // you, on the deck
    expect(html).not.toContain('storyInspectAlly'); // nobody recruited yet ⇒ no ally standees
  });

  it('renders a tappable standee for each recruited ally, the active one marked', () => {
    const story = {
      ...defaultStoryState(),
      hiredCaddyIds: ['driver-dan', 'auto-caddie', 'sandy-sandsaver'],
      activeCaddyId: 'driver-dan',
    };
    const html = spaceportSceneHTML(story);
    // one standee per recruited ally (each is a storyInspectAlly button)
    const standees = html.match(/storyInspectAlly/g) ?? [];
    expect(standees.length).toBe(3);
    // each opens that ally's talk card
    expect(html).toContain('"caddyId":"driver-dan"');
    expect(html).toContain('"caddyId":"auto-caddie"');
    expect(html).toContain('"caddyId":"sandy-sandsaver"');
    // the active caddy is distinguished
    expect(html).toContain('gs-sclub-caddy--on');
    expect(html).toMatch(/storyInspectAlly/);
  });
});
