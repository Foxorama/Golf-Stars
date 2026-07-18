import { describe, it, expect } from 'vitest';
import { endingVariant } from '../src/render/storyEnding';

describe('Story ending variants (GS-story-endings)', () => {
  it('maps path × outcome to the four endings', () => {
    // Warden = the good side; Herald = the cult.
    expect(endingVariant('warden', true)).toBe('good-win'); // the universe is saved
    expect(endingVariant('warden', false)).toBe('good-lose'); // the Crow frees the World-Eater
    expect(endingVariant('herald', true)).toBe('cult-win'); // Ragnarök — the universe devoured
    expect(endingVariant('herald', false)).toBe('cult-lose'); // the Wardens prevail; you flee
  });

  it('an unset alignment (never in practice past The Choice) defaults to the good side', () => {
    expect(endingVariant(undefined, true)).toBe('good-win');
    expect(endingVariant(undefined, false)).toBe('good-lose');
  });
});
