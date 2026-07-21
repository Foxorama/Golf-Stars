import { describe, it, expect } from 'vitest';
import {
  QUALIFY_EVENTS_NEEDED,
  QUALIFY_TOP,
  qualifyTop,
  qualifierFieldSize,
  qualifierEventsForChapter,
  qualifierField,
  qualifierPlacement,
  placeQualifies,
  recordQualifier,
  eventQualified,
  qualifiedCount,
} from '../src/sim/rpg/storyQualifiers';
import { defaultStoryState, STORY_CHAPTER_COUNT } from '../src/sim/rpg/story';
import { chapterQualifierEvents, tournamentForChapter } from '../src/sim/rpg/storyTournaments';

/**
 * GS-story-qualifiers — the qualifying-event field, placement, and the two-top-N-finishes gate. Pure and
 * deterministic, so the qualifying bar is provable and can never silently wall a competent round.
 */
describe('story qualifiers (GS-story-qualifiers) — field + placement', () => {
  it('thresholds tighten by chapter; a chapter offers MORE qualifiers than it requires (GS-story-world-variety)', () => {
    expect(QUALIFY_TOP).toEqual([10, 8, 6, 4, 4]);
    expect(QUALIFY_EVENTS_NEEDED).toBe(2);
    for (let ch = 1; ch <= STORY_CHAPTER_COUNT; ch++) {
      // A chapter's qualifier events = its worlds minus the Sigil venue. Every chapter now charts four
      // worlds, so there are THREE qualifiers — but you still only need to QUALIFY in two, so the extra
      // event is a CHOICE of road, never more required grind (the whole point of the variety pass).
      const events = qualifierEventsForChapter(ch, tournamentForChapter(ch)?.venueId);
      expect(events.length, `chapter ${ch} qualifiers`).toBe(3);
      expect(events.length, `chapter ${ch} offers more than it needs`).toBeGreaterThan(QUALIFY_EVENTS_NEEDED);
      expect(events).not.toContain(tournamentForChapter(ch)!.venueId);
    }
  });

  it('the field is the right size, sorted low-gross-first, and deterministic', () => {
    for (let ch = 1; ch <= STORY_CHAPTER_COUNT; ch++) {
      const field = qualifierField('verdant2-18', 72, ch);
      expect(field.length, `chapter ${ch} field`).toBe(qualifierFieldSize(ch) - 1);
      for (let i = 1; i < field.length; i++) expect(field[i]!.gross).toBeGreaterThanOrEqual(field[i - 1]!.gross);
      // deterministic
      expect(qualifierField('verdant2-18', 72, ch).map((g) => g.gross)).toEqual(field.map((g) => g.gross));
    }
  });

  it('different worlds field DIFFERENT competitor names (a stable per-world line-up)', () => {
    const a = qualifierField('verdant2-18', 72, 1).map((g) => g.name);
    const b = qualifierField('desert-18', 72, 1).map((g) => g.name);
    expect(a).not.toEqual(b);
  });

  it('the qualifying bar is crisp: matching the N-th-best ghost qualifies; two strokes worse misses', () => {
    for (let ch = 1; ch <= STORY_CHAPTER_COUNT; ch++) {
      const par = 72;
      const field = qualifierField('verdant2-18', par, ch);
      const top = qualifyTop(ch);
      const barGross = field[top - 1]!.gross; // the score of the N-th-best competitor
      // Tie the bar → you place ahead of it (ties favour the player) → inside the top N → qualify.
      expect(placeQualifies(qualifierPlacement(field, barGross), ch), `chapter ${ch} at bar`).toBe(true);
      // Two strokes worse than the bar → outside the top N → miss.
      expect(placeQualifies(qualifierPlacement(field, barGross + 2), ch), `chapter ${ch} over bar`).toBe(false);
    }
  });

  it('placement counts only the competitors who beat you (ties keep you ahead)', () => {
    const field = qualifierField('verdant2-18', 72, 1);
    const best = field[0]!.gross;
    expect(qualifierPlacement(field, best - 5)).toBe(1); // beat everyone → 1st
    expect(qualifierPlacement(field, field[field.length - 1]!.gross + 5)).toBe(field.length + 1); // last
  });
});

describe('story qualifiers — recording + the gate', () => {
  it('recordQualifier keeps only the BEST (lowest) finish per event', () => {
    let s = defaultStoryState('feather-fade');
    s = recordQualifier(s, 'verdant2-18', 8, 16);
    expect(s.qualifierResults['verdant2-18']).toEqual({ place: 8, field: 16 });
    s = recordQualifier(s, 'verdant2-18', 3, 16); // better → replaces
    expect(s.qualifierResults['verdant2-18']!.place).toBe(3);
    s = recordQualifier(s, 'verdant2-18', 9, 16); // worse → ignored
    expect(s.qualifierResults['verdant2-18']!.place).toBe(3);
  });

  it('eventQualified reads the world’s OWN chapter threshold', () => {
    // verdant2-18 is a Chapter-1 world (top 10). 10th qualifies, 11th does not.
    const ok = recordQualifier(defaultStoryState(), 'verdant2-18', 10, 16);
    expect(eventQualified(ok, 'verdant2-18')).toBe(true);
    const miss = recordQualifier(defaultStoryState(), 'verdant2-18', 11, 16);
    expect(eventQualified(miss, 'verdant2-18')).toBe(false);
    // an unknown / unplayed event never qualifies
    expect(eventQualified(defaultStoryState(), 'nope-18')).toBe(false);
  });

  it('qualifiedCount + chapterQualifierEvents drive the two-events gate', () => {
    const events = chapterQualifierEvents(1, undefined);
    let s = defaultStoryState('feather-fade');
    expect(qualifiedCount(s, events)).toBe(0);
    s = recordQualifier(s, events[0]!, 4, 16);
    expect(qualifiedCount(s, events)).toBe(1);
    s = recordQualifier(s, events[1]!, 11, 16); // 11th at a Ch.1 event misses (top 10)
    expect(qualifiedCount(s, events)).toBe(1);
    s = recordQualifier(s, events[1]!, 7, 16); // now inside the top 10
    expect(qualifiedCount(s, events)).toBe(2);
  });
});
