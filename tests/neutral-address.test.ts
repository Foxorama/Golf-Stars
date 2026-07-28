/**
 * GS-story-neutral-address — the protagonist's gender is the PLAYER's, never the copy's.
 *
 * Story Tour is single-protagonist but the protagonist is a PICK: Feather (she/her), Woo (he/she/they),
 * Larry (he/him), Bo (they/them). `storyCast.ts` already documents the misgendering-proof default —
 * every friend speaks in FIRST PERSON, so only their own pronouns ever reach the copy and the UI refers
 * to them by name. That rule covers how a character talks about THEMSELVES. It says nothing about how
 * they talk to YOU, and that is exactly where two lines slipped through:
 *
 *   · Huang-Woo's stage-1 `overlooked` beat: "Go on, get your rest. Big man's got a big round."
 *   · Venoma's Herald welcome, titled "Welcome, Sister."
 *   · the Parrot's Chapter-3 greeting: "A captain should know his crew before the hard part."
 *
 * TWO SHAPES, and they read differently. The first two are VOCATIVES — a form of address aimed
 * squarely at the player. The third is a GENERIC MASCULINE: an indefinite role the player occupies
 * ("a captain" is you, at the helm of your own ship) carrying "his" as if that were the neutral case.
 * Third-person copy ABOUT an NPC ("a gaunt man in a coat of shed scale", "Sister Ecdysis", Driver Dan's
 * ship "the old girl") is correctly gendered and must stay untouched, so the checks below are shaped to
 * catch those two shapes and nothing else.
 *
 * Three passes, because the bugs fail differently:
 *   1. a WALK of every line the betrayal-voice accessors can put on screen, generic fallbacks included —
 *      proves what actually renders, and reaches copy no text scan can see;
 *   2. a SCAN of the story/lore copy modules' source for vocatives — proves the rule for copy nobody
 *      wired an accessor for (the second bug was a beat TITLE), and covers new rows as they are written;
 *   3. a SCAN of the WHOLE sim/app/render surface for the generic masculine — that one is not a story
 *      problem, it is a copy problem, and the Parrot's line lives in the bar, not in a beat.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  betrayalDefection,
  betrayalFarewell,
  betrayalDoubt,
  betrayalDistance,
  betrayalSidelined,
  betrayalTempted,
  betrayalHeardTheWord,
  betrayalEnticed,
  betrayalOverlooked,
  friendRivalTaunt,
  friendRivalHalftime,
} from '../src/sim/rpg/storyBetrayal';
import { CHARACTERS } from '../src/sim/rpg/characters';

/**
 * A gendered VOCATIVE — someone being addressed as a man or a woman. Deliberately narrow: each pattern
 * needs either an address-shaped adjective ("big man", never "the man") or an honorific sitting in
 * vocative position (end of the sentence or followed by punctuation), so "Brother Ouros" and "a gaunt
 * man in a coat" — real NPCs, correctly gendered — do not trip it.
 */
const VOCATIVE: readonly RegExp[] = [
  /\b(big|good|my|young|dear|old|nice|poor|brave|clever|sweet) (man|men|lady|ladies|girl|girls|boy|boys)\b/i,
  /\b(sonny|missy|attaboy|atta-boy|attagirl|atta-girl|laddie|lassie|m['’]?lady|milady|good sir)\b/i,
  // The lookbehind keeps a HYPHENATED compound out of it: the Parrot's "spirit-brother" is his own dead
  // friend, and `lore-brother` is an id — neither is anyone being addressed.
  /(?<![-\w])(lad|lass|sir|ma['’]?am|madam|mister|missus|sister|brother|son|daughter|gentleman|gentlemen)\b(?=['’]?s?\s*(?:[,.!?…—"”]|$))/i,
];

/**
 * A GENERIC MASCULINE (or feminine) standing in for the player: an indefinite role the player occupies,
 * carrying a gendered pronoun in the same sentence. Bounded to one sentence and ~90 characters so a
 * later, unrelated pronoun can't reach back and trip it.
 */
const GENERIC_GENDERED =
  /\b(a|an|any|every|each|the) (captain|golfer|player|champion|pro|rookie|pilot|competitor|contender|winner|traveller|traveler)\b[^.!?]{0,90}?\b(he|him|his|she|her|hers)\b/i;

/**
 * Deliberate exceptions: a gendered phrase whose referent is NOT the player. Each entry is a claim that
 * the line is about a specific someone (or something) else — if you add one, say who.
 */
const NOT_THE_PLAYER: readonly string[] = [
  'The Old Girl', // Driver Dan's SHIP, the Long Haul — the sailor's idiom for a vessel, not a person
  'this old girl', // ditto, in Dan's own voice, standing in her wreck
  'beat the old man', // Sir Aldous Greensward (he/him) about HIMSELF, across his own tee
  'A golfer nobody invited', // Venoma (she/her) — a NAMED rival, introduced indefinitely for the reveal
  'a golfer’s pulse came back under his hands', // the "his" is Dr Chipinski's (he/him), not the golfer's
];

const exempt = (t: string): boolean => NOT_THE_PLAYER.some((ok) => t.includes(ok));
const isVocative = (t: string): boolean => !exempt(t) && VOCATIVE.some((re) => re.test(t));
const isGenericGendered = (t: string): boolean => !exempt(t) && GENERIC_GENDERED.test(t);

describe('GS-story-neutral-address — the betrayal voices never assume the player has a gender', () => {
  // Every line the BETRAYAL_VOICE tables can put on screen, for every golfer, plus each generic
  // fallback (reached with an id that has no row).
  const rendered = (): string[] => {
    const out: string[] = [];
    for (const id of [...CHARACTERS.map((c) => c.id), 'no-such-golfer']) {
      out.push(...betrayalDefection(id), ...betrayalFarewell(id));
      for (const beat of [betrayalDoubt, betrayalDistance, betrayalSidelined, betrayalTempted, betrayalHeardTheWord]) {
        out.push(...beat(id).map((l) => l.text));
      }
      for (const stage of [0, 1] as const) {
        out.push(...betrayalEnticed(id, stage).map((l) => l.text), ...betrayalOverlooked(id, stage).map((l) => l.text));
      }
      for (const voice of ['confront', 'corrupt', 'confrontPair'] as const) {
        out.push(friendRivalTaunt(id, voice), friendRivalHalftime(id, voice, true), friendRivalHalftime(id, voice, false));
      }
    }
    return out;
  };

  it('no gendered vocative in any line the tables can render', () => {
    const lines = rendered();
    expect(lines.length).toBeGreaterThan(200); // the walk actually reached the tables
    expect(lines.filter(isVocative)).toEqual([]);
  });
});

/** Source lines with comments stripped — a comment explaining the rule must not trip the rule. */
const prose = (file: string): { line: number; text: string }[] => {
  const out: { line: number; text: string }[] = [];
  let inBlock = false;
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((raw, i) => {
      let t = raw;
      if (inBlock) {
        const end = t.indexOf('*/');
        if (end < 0) return;
        t = t.slice(end + 2);
        inBlock = false;
      }
      const open = t.indexOf('/*');
      if (open >= 0) {
        const end = t.indexOf('*/', open + 2);
        if (end < 0) {
          inBlock = true;
          t = t.slice(0, open);
        } else t = t.slice(0, open) + t.slice(end + 2);
      }
      const slash = t.indexOf('//');
      if (slash >= 0) t = t.slice(0, slash);
      if (t.trim()) out.push({ line: i + 1, text: t });
    });
  return out;
};

/** Every `.ts` directly under these roots (the scans are file-level, never recursive into `test/`). */
const tsFilesIn = (roots: readonly string[], match?: RegExp): string[] => {
  const out: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root)) if (f.endsWith('.ts') && (!match || match.test(f))) out.push(path.join(root, f));
  }
  return [...new Set(out)].sort();
};

describe('GS-story-neutral-address — the story + lore copy never assumes the player has a gender', () => {
  /** The modules that hold player-facing story/lore prose. */
  const copyFiles = (): string[] => tsFilesIn(['src/sim/rpg', 'src/app'], /^(story|lore|character|parrot)/i);

  it('no gendered vocative anywhere in the story/lore copy modules', () => {
    const files = copyFiles();
    expect(files.length).toBeGreaterThan(20); // the sweep actually found the modules
    const offenders: string[] = [];
    for (const f of files) for (const { line, text } of prose(f)) if (isVocative(text)) offenders.push(`${f}:${line} ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});

describe('GS-story-neutral-address — no generic masculine stands in for the player', () => {
  // Not scoped to the story modules: the Parrot's line lives in the bar, and any screen that describes
  // "a golfer" or "a captain" can make the same assumption.
  const sourceFiles = (): string[] =>
    tsFilesIn(['src/sim', 'src/sim/rpg', 'src/sim/course', 'src/app', 'src/render', 'src/render/style', 'src/ui', 'src/save']);

  it('an indefinite player role never carries a gendered pronoun', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(80); // the sweep actually reached the source
    const offenders: string[] = [];
    for (const f of files) for (const { line, text } of prose(f)) if (isGenericGendered(text)) offenders.push(`${f}:${line} ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});

describe('GS-story-neutral-address — the check itself', () => {
  it('catches all three shipped lines', () => {
    expect(isVocative('Go on, get your rest. Big man’s got a big round.')).toBe(true);
    expect(isVocative('Welcome, Sister')).toBe(true);
    expect(isVocative('Nice work, lad.')).toBe(true);
    expect(isVocative('That’s the way, attaboy!')).toBe(true);
    expect(isGenericGendered('Sit anyway. A captain should know his crew before the hard part.')).toBe(true);
    expect(isGenericGendered('A golfer plays the ball where he finds it.')).toBe(true);
  });

  it('leaves correctly-gendered NPC copy alone', () => {
    expect(isVocative('A gaunt man in a coat of shed scale has stopped at her shoulder.')).toBe(false);
    expect(isVocative('Sister Ecdysis wades out to where an old Warden ward-stone is going under.')).toBe(false);
    expect(isVocative('Brother Ouros’s cowl — the deep whispers the line.')).toBe(false);
    expect(isVocative('I was your HYPE MAN.')).toBe(false);
    expect(isVocative('Back home they said a girl couldn’t out-think this game.')).toBe(false);
    expect(isVocative('hosted by Sir Aldous Greensward')).toBe(false);
    // the fixed line, and a sentence boundary the generic-masculine scan must not reach across
    expect(isGenericGendered('Sit anyway. A captain should know their crew before the hard part.')).toBe(false);
    expect(isGenericGendered('A golfer walks the tee. Voss does not look up from his card.')).toBe(false);
  });
});
