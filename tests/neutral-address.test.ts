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
 *
 * Both are VOCATIVES — a form of address aimed at the player — so both misgendered whoever wasn't the
 * gender they assumed. Third-person copy ABOUT an NPC ("a gaunt man in a coat of shed scale", "Sister
 * Ecdysis", Driver Dan's ship "the old girl") is correctly gendered and must stay untouched, so the
 * check below is shaped to catch address and nothing else.
 *
 * Two passes, because they fail differently:
 *   1. a WALK of every line the betrayal-voice accessors can put on screen, generic fallbacks included —
 *      proves what actually renders, and reaches copy no text scan can see;
 *   2. a SCAN of the story/lore copy modules' source — proves the rule for copy nobody wired an
 *      accessor for, and covers new rows the moment they are written.
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
 * Deliberate exceptions: a gendered phrase whose referent is NOT the player. Each entry is a claim that
 * the line is about a specific someone (or something) else — if you add one, say who.
 */
const NOT_THE_PLAYER: readonly string[] = [
  'The Old Girl', // Driver Dan's SHIP, the Long Haul — the sailor's idiom for a vessel, not a person
  'this old girl', // ditto, in Dan's own voice, standing in her wreck
  'beat the old man', // Sir Aldous Greensward (he/him) about HIMSELF, across his own tee
];

const isVocative = (t: string): boolean =>
  !NOT_THE_PLAYER.some((ok) => t.includes(ok)) && VOCATIVE.some((re) => re.test(t));

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

describe('GS-story-neutral-address — the story + lore copy never assumes the player has a gender', () => {
  const ROOTS = ['src/sim/rpg', 'src/app'];
  /** The modules that hold player-facing story/lore prose. */
  const copyFiles = (): string[] => {
    const out: string[] = [];
    for (const root of ROOTS) {
      for (const f of fs.readdirSync(root)) {
        if (f.endsWith('.ts') && /^(story|lore|character|parrot)/i.test(f)) out.push(path.join(root, f));
      }
    }
    out.push('src/sim/rpg/lore.ts', 'src/sim/rpg/parrotBar.ts', 'src/sim/rpg/characterQuests.ts');
    return [...new Set(out)].sort();
  };

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

  it('no gendered vocative anywhere in the story/lore copy modules', () => {
    const files = copyFiles();
    expect(files.length).toBeGreaterThan(20); // the sweep actually found the modules
    const offenders: string[] = [];
    for (const f of files) for (const { line, text } of prose(f)) if (isVocative(text)) offenders.push(`${f}:${line} ${text.trim()}`);
    expect(offenders).toEqual([]);
  });
});

describe('GS-story-neutral-address — the check itself', () => {
  it('catches both shipped lines', () => {
    expect(isVocative('Go on, get your rest. Big man’s got a big round.')).toBe(true);
    expect(isVocative('Welcome, Sister')).toBe(true);
    expect(isVocative('Nice work, lad.')).toBe(true);
    expect(isVocative('That’s the way, attaboy!')).toBe(true);
  });

  it('leaves correctly-gendered NPC copy alone', () => {
    expect(isVocative('A gaunt man in a coat of shed scale has stopped at her shoulder.')).toBe(false);
    expect(isVocative('Sister Ecdysis wades out to where an old Warden ward-stone is going under.')).toBe(false);
    expect(isVocative('Brother Ouros’s cowl — the deep whispers the line.')).toBe(false);
    expect(isVocative('I was your HYPE MAN.')).toBe(false);
    expect(isVocative('Back home they said a girl couldn’t out-think this game.')).toBe(false);
    expect(isVocative('hosted by Sir Aldous Greensward')).toBe(false);
  });
});
