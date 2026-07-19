import { describe, it, expect } from 'vitest';
import {
  PARROT_BAR_LINES,
  parrotBarLines,
  parrotBarLineAt,
  type ParrotBarContext,
} from '../src/sim/rpg/parrotBar';

/** A base campaign snapshot — early Chapter 1, no path chosen, no Sigils, unfinished. Override per case. */
const EARLY: ParrotBarContext = { chapter: 1, sigils: 0, completed: false };

describe('GS-story-parrot-bar — the chatter table is pure + well-formed', () => {
  it('every line has a stable unique id and non-empty text', () => {
    const ids = new Set<string>();
    for (const l of PARROT_BAR_LINES) {
      expect(l.id).toBeTruthy();
      expect(ids.has(l.id)).toBe(false);
      ids.add(l.id);
      expect(l.text.length).toBeGreaterThan(0);
    }
  });

  it('parrotBarLines always yields ≥1 line, led by exactly one greeting', () => {
    const states: ParrotBarContext[] = [
      EARLY,
      { chapter: 3, sigils: 3, completed: false },
      { chapter: 4, sigils: 3, completed: false, alignment: 'warden' },
      { chapter: 5, sigils: 5, completed: false, alignment: 'herald' },
      { chapter: 4, sigils: 3, completed: false }, // Ch4 reached, path not yet chosen
      { chapter: 5, sigils: 5, completed: true, alignment: 'warden' },
    ];
    for (const c of states) {
      const lines = parrotBarLines(c);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]!.kind).toBe('greeting');
      // only the leading line is a greeting — the rest are chatter
      expect(lines.slice(1).every((l) => l.kind !== 'greeting')).toBe(true);
    }
  });

  it('the greeting adapts to the campaign state', () => {
    expect(parrotBarLines(EARLY)[0]!.id).toBe('greet-recruited'); // Ch.1: the quest briefing leads (GS-story-pacing)
    expect(parrotBarLines({ chapter: 2, sigils: 1, completed: false })[0]!.id).toBe('greet-early');
    expect(parrotBarLines({ chapter: 3, sigils: 3, completed: false })[0]!.id).toBe('greet-mid');
    expect(parrotBarLines({ chapter: 4, sigils: 3, completed: false, alignment: 'warden' })[0]!.id).toBe('greet-warden');
    expect(parrotBarLines({ chapter: 4, sigils: 3, completed: false, alignment: 'herald' })[0]!.id).toBe('greet-herald');
    expect(parrotBarLines({ chapter: 4, sigils: 3, completed: false })[0]!.id).toBe('greet-choice');
    // completed wins over everything (a Ch5 warden who beat the finale)
    expect(parrotBarLines({ chapter: 5, sigils: 5, completed: true, alignment: 'warden' })[0]!.id).toBe('greet-complete');
  });
});

describe('GS-story-parrot-bar — chatter gates on chapter / path / Sigils / completion', () => {
  const idsFor = (c: ParrotBarContext) => new Set(parrotBarLines(c).map((l) => l.id));

  it('the Coil warnings escalate with the chapter', () => {
    expect(idsFor(EARLY).has('coil-stir')).toBe(false); // Ch1: not yet
    expect(idsFor({ ...EARLY, chapter: 2 }).has('coil-stir')).toBe(true);
    expect(idsFor({ ...EARLY, chapter: 2 }).has('coil-venoma')).toBe(false); // Venoma from Ch3
    expect(idsFor({ ...EARLY, chapter: 3 }).has('coil-venoma')).toBe(true);
  });

  it('the "key forged" line needs five Sigils', () => {
    expect(idsFor({ ...EARLY, chapter: 5, sigils: 4 }).has('coil-final')).toBe(false);
    expect(idsFor({ ...EARLY, chapter: 5, sigils: 5 }).has('coil-final')).toBe(true);
  });

  it('path-specific lines only appear after The Choice, matching the path', () => {
    const warden = idsFor({ chapter: 4, sigils: 3, completed: false, alignment: 'warden' });
    expect(warden.has('path-warden')).toBe(true);
    expect(warden.has('path-herald')).toBe(false);
    const herald = idsFor({ chapter: 4, sigils: 3, completed: false, alignment: 'herald' });
    expect(herald.has('path-herald')).toBe(true);
    expect(herald.has('path-warden')).toBe(false);
    // no path chosen → neither
    const none = idsFor({ chapter: 4, sigils: 3, completed: false });
    expect(none.has('path-warden')).toBe(false);
    expect(none.has('path-herald')).toBe(false);
  });

  it('the Herald bar is the CROW\'s — only crow lines show, no Parrot lines (GS-story-herald-clubhouse)', () => {
    const herald = idsFor({ chapter: 4, sigils: 3, completed: false, alignment: 'herald' });
    // the Crow greets + speaks his own chatter
    expect(parrotBarLines({ chapter: 4, sigils: 3, completed: false, alignment: 'herald' })[0]!.id).toBe('greet-herald');
    expect(herald.has('crow-mercy')).toBe(true);
    expect(herald.has('crow-parrot')).toBe(true);
    expect(herald.has('path-herald')).toBe(true);
    // the Parrot's personal lore + captain-voiced chatter NEVER appear on the dark path
    for (const parrotId of ['lore-brother', 'lore-foresight', 'lore-recruit', 'coil-stir', 'hint-ship', 'path-warden']) {
      expect(herald.has(parrotId)).toBe(false);
    }
    // and the Warden/undecided bar never leaks a crow line
    const warden = idsFor({ chapter: 4, sigils: 3, completed: false, alignment: 'warden' });
    expect(warden.has('crow-mercy')).toBe(false);
    expect(warden.has('crow-serpent')).toBe(false);
  });

  it('the finished-campaign reflection only shows once completed (and hint chatter retires)', () => {
    const done = idsFor({ chapter: 5, sigils: 5, completed: true, alignment: 'warden' });
    expect(done.has('lore-afterglow')).toBe(true);
    // gameplay hints are all "!completed" — none should linger after the win
    expect(done.has('hint-locker')).toBe(false);
    expect(done.has('hint-ship')).toBe(false);
    expect(done.has('hint-revisit')).toBe(false);
    expect(done.has('coil-stir')).toBe(false);
  });
});

describe('GS-story-parrot-bar — parrotBarLineAt cycles deterministically', () => {
  it('talk 0 is the greeting and each tap advances, wrapping', () => {
    const lines = parrotBarLines(EARLY);
    expect(parrotBarLineAt(EARLY, 0).id).toBe(lines[0]!.id);
    expect(parrotBarLineAt(EARLY, 1).id).toBe(lines[1]!.id);
    // wraps back to the greeting after a full loop
    expect(parrotBarLineAt(EARLY, lines.length).id).toBe(lines[0]!.id);
    expect(parrotBarLineAt(EARLY, lines.length + 2).id).toBe(lines[2 % lines.length]!.id);
  });

  it('is safe for any integer tap count (never throws / out of range)', () => {
    for (const t of [0, 1, 7, 99, 1000]) {
      expect(parrotBarLineAt(EARLY, t)).toBeDefined();
      expect(parrotBarLineAt(EARLY, t).text.length).toBeGreaterThan(0);
    }
  });
});
