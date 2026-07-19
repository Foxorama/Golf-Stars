import { describe, it, expect } from 'vitest';
import { hasStoryFigure } from '../src/render/storyFigure';
import { coilAgentLook } from '../src/render/coilAgentArt';
import { HERALD_CREW } from '../src/sim/rpg/storyHeraldCrew';
import { STORY_CADDY_STOCK } from '../src/sim/rpg/storyCaddies';

describe('GS-story-figures — every clubhouse character has a full-body figure', () => {
  it('every recruitable Warden ally resolves to a figure', () => {
    for (const caddyId of new Set(Object.values(STORY_CADDY_STOCK))) {
      expect(hasStoryFigure(caddyId), `${caddyId} figure`).toBe(true);
    }
  });

  it('every Coil (Herald) agent resolves to a figure + a valid drawable look', () => {
    for (const agent of HERALD_CREW) {
      expect(hasStoryFigure(agent.id), `${agent.id} figure`).toBe(true);
      expect(['voss', 'venoma', 'coilkeeper']).toContain(coilAgentLook(agent.id));
    }
  });

  it('coilAgentLook maps the shared Keepers (Ouros + Ecdysis) to the coilkeeper look', () => {
    expect(coilAgentLook('coil-voss')).toBe('voss');
    expect(coilAgentLook('coil-venoma')).toBe('venoma');
    expect(coilAgentLook('coil-ouros')).toBe('coilkeeper');
    expect(coilAgentLook('coil-ecdysis')).toBe('coilkeeper');
  });

  it('a non-character id has no figure', () => {
    expect(hasStoryFigure('not-a-caddy')).toBe(false);
    expect(hasStoryFigure(undefined)).toBe(false);
  });
});
