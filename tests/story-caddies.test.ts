import { describe, it, expect } from 'vitest';
import {
  STORY_CADDY_STOCK,
  STORY_CADDY_PRICE,
  worldCaddy,
  worldHasCaddy,
  storyCaddyHired,
  activeStoryCaddy,
  hireStoryCaddy,
  setActiveStoryCaddy,
  applyStoryCaddy,
} from '../src/sim/rpg/storyCaddies';
import { defaultStoryState, STORY_WORLDS } from '../src/sim/rpg/story';
import { isNamedCaddy, startingLoadout } from '../src/sim/rpg/economy';

describe('Story caddy roster — gather your friends (GS-story-caddies)', () => {
  it('every friend waits at a real world and is a real named caddy, each caddy placed once', () => {
    const realWorlds = new Set(STORY_WORLDS.map((w) => w.courseId));
    const seen = new Set<string>();
    for (const [worldId, caddyId] of Object.entries(STORY_CADDY_STOCK)) {
      expect(realWorlds.has(worldId), `${worldId} is a real world`).toBe(true);
      expect(isNamedCaddy(caddyId), `${caddyId} is a named caddy`).toBe(true);
      expect(seen.has(caddyId), `${caddyId} placed once`).toBe(false);
      seen.add(caddyId);
      expect(worldCaddy(worldId)).toBe(caddyId);
      expect(worldHasCaddy(worldId)).toBe(true);
    }
    expect(worldHasCaddy('verdant-18')).toBe(false); // not every world hosts a friend
  });

  it('recruiting spends credits, keeps the caddy, and the FIRST hire carries the bag by default', () => {
    const dan = worldCaddy('derelict-18')!;
    const s0 = { ...defaultStoryState('feather-fade'), credits: 800 };
    const s1 = hireStoryCaddy(s0, dan);
    expect(s1.credits).toBe(800 - STORY_CADDY_PRICE);
    expect(storyCaddyHired(s1, dan)).toBe(true);
    expect(activeStoryCaddy(s1)).toBe(dan); // first friend is active by default
    // A second hire does NOT steal the active slot (you choose in the locker).
    const sandy = worldCaddy('desert-18')!;
    const s2 = hireStoryCaddy({ ...s1, credits: 800 }, sandy);
    expect(storyCaddyHired(s2, sandy)).toBe(true);
    expect(activeStoryCaddy(s2)).toBe(dan);
  });

  it('recruiting is a no-op when broke, already hired, or not a real caddy', () => {
    const dan = worldCaddy('derelict-18')!;
    const broke = { ...defaultStoryState(), credits: STORY_CADDY_PRICE - 1 };
    expect(hireStoryCaddy(broke, dan)).toBe(broke);
    const has = hireStoryCaddy({ ...defaultStoryState(), credits: 800 }, dan);
    expect(hireStoryCaddy(has, dan)).toBe(has); // dup no-op (credits not spent twice)
    expect(hireStoryCaddy({ ...defaultStoryState(), credits: 800 }, 'not-a-caddy')).toEqual({ ...defaultStoryState(), credits: 800 });
  });

  it('a Herald cannot recruit the Warden friends they betrayed (GS-story-quality GAP1)', () => {
    const dan = worldCaddy('derelict-18')!;
    const herald = { ...defaultStoryState(), credits: 2000, alignment: 'herald' as const };
    expect(hireStoryCaddy(herald, dan)).toBe(herald); // no-op on the dark path
    expect(storyCaddyHired(hireStoryCaddy(herald, dan), dan)).toBe(false);
    // a Warden (default undecided) still recruits fine
    const warden = { ...defaultStoryState(), credits: 2000 };
    expect(storyCaddyHired(hireStoryCaddy(warden, dan), dan)).toBe(true);
  });

  it('setActiveStoryCaddy equips an owned friend, benches with undefined, refuses a stranger', () => {
    const dan = worldCaddy('derelict-18')!;
    const sandy = worldCaddy('desert-18')!;
    let s = hireStoryCaddy(hireStoryCaddy({ ...defaultStoryState(), credits: 2000 }, dan), sandy);
    s = setActiveStoryCaddy(s, sandy);
    expect(activeStoryCaddy(s)).toBe(sandy);
    s = setActiveStoryCaddy(s, undefined); // bench everyone
    expect(activeStoryCaddy(s)).toBeUndefined();
    expect(setActiveStoryCaddy(s, 'stranger-caddy')).toBe(s); // not on the roster → no-op
  });

  it('the active caddy folds its real effect + perk into a round loadout; no active is a no-op', () => {
    const dan = worldCaddy('derelict-18')!; // Driver Dan → driverAnywhere + his perk id
    const base = startingLoadout();
    // No caddy → unchanged.
    expect(applyStoryCaddy(base, defaultStoryState())).toBe(base);
    // Hired + active → the effect + the perk are folded (auto ≡ interactive relies on the perk).
    const s = hireStoryCaddy({ ...defaultStoryState(), credits: 800 }, dan);
    const out = applyStoryCaddy(base, s);
    expect(out.perks).toContain(dan);
    expect(out.driverAnywhere).toBe(true);
    // Hired but benched → no fold.
    const benched = setActiveStoryCaddy(s, undefined);
    expect(applyStoryCaddy(base, benched)).toBe(base);
  });
});
