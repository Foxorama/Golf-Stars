import { describe, it, expect } from 'vitest';
import { CHARACTERS, getCharacter } from '../src/sim/rpg/characters';
import { characterLoreCardHTML, hometownBackdropSVG } from '../src/render/characterLore';
import { characterScreen } from '../src/render/golferCards';
import { golferInspectOverlayHTML } from '../src/render/storyClubhouse';
import { initState, reduce } from '../src/ui/game';

// GS-char-lore: tapping a golfer's portrait on any select screen opens a lore popup with their dossier
// (name, age, blood type, gender & pronouns, relationship, best wins, lowest moment, fun fact) over a
// subtle hometown backdrop. Pure content + a UI-only reducer field — zero sim rng, no save bump.

describe('character lore — data completeness', () => {
  it('every playable golfer carries a complete lore block', () => {
    for (const ch of CHARACTERS) {
      expect(ch.lore, ch.id).toBeTruthy();
      expect(ch.lore.age, ch.id).toBeGreaterThan(0);
      expect(ch.lore.bloodType.length, ch.id).toBeGreaterThan(0);
      expect(ch.lore.gender.length, ch.id).toBeGreaterThan(0);
      expect(ch.lore.relationship.length, ch.id).toBeGreaterThan(0);
      expect(ch.lore.bestWins.length, ch.id).toBeGreaterThan(0);
      expect(ch.lore.lowestMoment.length, ch.id).toBeGreaterThan(0);
      expect(ch.lore.funFact.length, ch.id).toBeGreaterThan(0);
    }
  });
});

describe('character lore — popup render', () => {
  it('renders every requested field for a golfer', () => {
    const ch = getCharacter('feather-fade')!;
    const html = characterLoreCardHTML(ch);
    // Name, hometown, pronouns, and every biographical beat show up.
    expect(html).toContain(ch.name);
    expect(html).toContain(ch.origin);
    expect(html).toContain(ch.identity); // pronouns
    expect(html).toContain(String(ch.lore.age));
    expect(html).toContain(ch.lore.bloodType);
    expect(html).toContain(ch.lore.gender);
    expect(html).toContain(ch.lore.relationship);
    expect(html).toContain(ch.lore.bestWins[0]!);
    expect(html).toContain(ch.lore.lowestMoment);
    expect(html).toContain(ch.lore.funFact);
    // Closes via a reducer action; carries a hometown backdrop.
    expect(html).toContain('closeCharacterLore');
    expect(html).toContain('gs-charlore-bgsvg');
  });

  it('uses its own CSS prefix and never the play HUD class', () => {
    const html = characterLoreCardHTML(getCharacter('backspin-bo'));
    expect(html).toContain('gs-charlore');
    expect(html).not.toMatch(/gs-hud[^a-z]/);
  });

  it('returns empty string for an unknown golfer', () => {
    expect(characterLoreCardHTML(undefined)).toBe('');
    expect(characterLoreCardHTML(getCharacter('nobody'))).toBe('');
  });

  it('draws a distinct hometown backdrop per city', () => {
    const cities = CHARACTERS.map((c) => hometownBackdropSVG(c.origin, c.style.cap));
    // Each is a non-trivial SVG…
    for (const svg of cities) expect(svg).toContain('<svg');
    // …and no two hometowns render identical scenery.
    expect(new Set(cities).size).toBe(cities.length);
  });
});

describe('character lore — select cards make the portrait a lore trigger', () => {
  it('the card portrait dispatches showCharacterLore and stops the select bubble', () => {
    const html = characterScreen({}, { modeName: 'The Voyage', winnable: true });
    for (const ch of CHARACTERS) {
      expect(html).toContain(`"showCharacterLore","characterId":"${ch.id}"`);
    }
    // The portrait swallows the tap so it never also selects.
    expect(html).toContain('event.stopPropagation()');
    // The whole-card select action is still present.
    expect(html).toContain('selectCharacter');
  });

  it('the Story clubhouse inspect overlay offers a lore path too', () => {
    const html = golferInspectOverlayHTML('longshot-larry', {
      label: '▶ Play as Longshot Larry',
      action: { type: 'selectCharacter', characterId: 'longshot-larry' },
    });
    expect(html).toContain('"showCharacterLore","characterId":"longshot-larry"');
  });
});

describe('character lore — reducer', () => {
  it('opens and closes on a select screen, and a pick clears it', () => {
    let s = initState(1);
    s = reduce(s, { type: 'start', format: 'voyage' });
    expect(s.screen).toBe('character');
    s = reduce(s, { type: 'showCharacterLore', characterId: 'huang-woo-hook' });
    expect(s.characterLoreId).toBe('huang-woo-hook');
    s = reduce(s, { type: 'closeCharacterLore' });
    expect(s.characterLoreId).toBeUndefined();
    // Re-open, then pick a golfer — selecting clears the popup.
    s = reduce(s, { type: 'showCharacterLore', characterId: 'huang-woo-hook' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'huang-woo-hook' });
    expect(s.characterLoreId).toBeUndefined();
  });

  it('ignores the open action off a select screen', () => {
    let s = initState(1);
    expect(s.screen).toBe('title');
    s = reduce(s, { type: 'showCharacterLore', characterId: 'feather-fade' });
    expect(s.characterLoreId).toBeUndefined();
  });
});
