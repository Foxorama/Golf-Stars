import { describe, it, expect } from 'vitest';
import { SIGIL_LOOK, sigilLook, hasSigilLook, serpentEyeOpen } from '../src/render/sigilCeremony';
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

describe('the serpent eye slowly opens across the teasers (GS-story-serpent-eye)', () => {
  // The ceremonies drive wake = sigils/5 — the drawn eye must track the captions:
  // sealed (1) → sliver (2) → visibly cracked (3, "the eye cracks open") → half-lidded (4,
  // "it is looking back at you") → wide open on the fifth-Sigil head cut.
  it('is sealed at one Sigil and STRICTLY opens with every Sigil after', () => {
    const opens = [1, 2, 3, 4, 5].map((sigils) => serpentEyeOpen(sigils / 5, 0));
    expect(opens[0]).toBe(0); // one Sigil: still sealed
    for (let i = 1; i < opens.length; i++) expect(opens[i]!).toBeGreaterThan(opens[i - 1]!);
  });

  it('is VISIBLY cracked by the third Sigil and clearly watching by the fourth', () => {
    expect(serpentEyeOpen(3 / 5, 0)).toBeGreaterThanOrEqual(0.2);
    expect(serpentEyeOpen(4 / 5, 0)).toBeGreaterThanOrEqual(0.4);
  });

  it('opens wide on the final head-focus reveal (and for the wide-awake battle serpent)', () => {
    expect(serpentEyeOpen(1, 1)).toBe(1);
    expect(serpentEyeOpen(1, 0)).toBeGreaterThanOrEqual(0.6); // the battle's awake serpent glares
  });

  it('is monotone in both wake and focus (the slow opening can never regress)', () => {
    for (let w = 0; w < 1; w += 0.1) {
      expect(serpentEyeOpen(w + 0.1, 0)).toBeGreaterThanOrEqual(serpentEyeOpen(w, 0));
      expect(serpentEyeOpen(0.5, w + 0.1)).toBeGreaterThanOrEqual(serpentEyeOpen(0.5, w));
    }
  });
});
