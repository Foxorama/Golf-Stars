import { describe, it, expect } from 'vitest';
import { SIGIL_LOOK, sigilLook, hasSigilLook } from '../src/render/sigilCeremony';
import { STORY_TOURNAMENTS } from '../src/sim/rpg/storyTournaments';

describe('Sigil ceremony art coverage (GS-story-sigil-ceremony)', () => {
  it('every tournament Sigil has a bespoke ceremony look — never the neutral fallback', () => {
    for (const t of STORY_TOURNAMENTS) {
      expect(hasSigilLook(t.sigilId), `${t.sigilId} (${t.sigilName}) has ceremony art`).toBe(true);
      const look = sigilLook(t.sigilId);
      expect(look.col).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(look.glow).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(look.glyph.length).toBeGreaterThan(0);
    }
  });

  it('an unknown Sigil id degrades to the neutral gold fallback (never throws)', () => {
    expect(hasSigilLook('not-a-sigil')).toBe(false);
    expect(sigilLook('not-a-sigil').col).toBe('#f0c860');
  });

  it('every look is distinct enough to read apart (unique colours across the set)', () => {
    const cols = Object.values(SIGIL_LOOK).map((l) => l.col);
    expect(new Set(cols).size).toBe(cols.length); // no two Sigils share a colour
  });
});
