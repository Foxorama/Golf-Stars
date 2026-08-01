import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ONE DECISION, ONE HOME — the register (GS-one-description).
 *
 * The most expensive recurring bug in this codebase is a single fact described in two places. The
 * derelict ship paid it seven times (where does the deck end); GS-release-identity paid it on the
 * rename; GS-save-slots paid it because `persist` and `toTitle` each had their own idea of what a run
 * parks, which cost players a parked Voyage every time they played a Story world; GS-browser-test-gate
 * paid it with 50 tests that silently skipped in CI for months because nine files each carried their
 * own copy of "where is Chromium"; and GS-save-integrity paid it on the day it shipped, when a new
 * version check re-derived a blob-shape discrimination `migrateCampaignStore` already owned and
 * declared every legacy campaign in existence to be from the future.
 *
 * THE GUARDS THAT ACTUALLY WORK, in order of strength:
 *
 *   1. COMPILE-FORCED. A `Record<FlightClass, …>` or `screenIntent`'s `never` fallthrough does not
 *      detect drift, it makes drift not build. Always prefer this. It only covers decisions shaped
 *      like "one answer per member of a known set".
 *   2. ONE SEAM + A SOURCE SCAN banning the alternative. This file. A behavioural test proves the code
 *      works today; a source scan proves the second description cannot be INTRODUCED tomorrow. It
 *      catches the class, not the instance, for about fifteen lines.
 *   3. A test that reads both copies. Weakest, and sometimes the only option — the service-worker
 *      cache prefix genuinely cannot share a constant across three files, so `brand.test.ts` reads all
 *      three.
 *
 * ── THE ADMISSION RULE ───────────────────────────────────────────────────────────────────────────
 *
 * A row earns its place here only once a fact has TWO OR MORE callers. Extracting a seam for a fact
 * with one caller is over-abstraction, and a row banning re-derivation of a fact nobody re-derives is
 * the same error wearing a guard's clothes — `isBareCampaignBlob` was correctly inline while it had one
 * asker. The trigger for a row is the same as the trigger for the seam: a SECOND asker appeared.
 *
 * And when a row starts producing false positives, the fix is to make the pattern precise or to add a
 * named, justified exception — NEVER to relax it into uselessness. A guard everyone has learned to
 * edit is worse than no guard, which `PRIVACY.md`'s own rule already says in its own words.
 *
 * ── ALREADY GUARDED ELSEWHERE (do not duplicate; add new rows here) ──────────────────────────────
 *
 *   `Math.random` in deterministic paths      → ball.test.ts, runout.test.ts, and the sim suite
 *   `matchMedia` for reduced motion           → a11y-motion.test.ts
 *   `devicePixelRatio` computed locally       → accessibility.test.ts
 *   a `font-family` that is not the token     → accessibility.test.ts
 *   raw viewport units (`vh`/`dvh`/…)         → accessibility.test.ts
 *   `snapshotRun` returning to persist.ts     → save-slots.test.ts
 *   the SW cache prefix, in three files       → brand.test.ts
 *   storage keys vs PRIVACY.md's table        → privacy.test.ts
 *
 * Folding those into this register is a worthwhile follow-up — they are scattered across seven files
 * and their existence is tribal knowledge, which is exactly why the GS-save-integrity bug did not
 * reach for one. It is deliberately NOT done in the same pass that introduces the register: moving a
 * working guard is a change that can only be verified by breaking it on purpose, and doing that to
 * eight of them at once is how a register ends up weaker than the mess it replaced.
 */

const root = resolve(__dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

/** Every source file under a tree, as `[path, source]`. */
function sourceFiles(dir: string, exts = ['.ts']): [string, string][] {
  const out: [string, string][] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(resolve(root, d), { withFileTypes: true })) {
      const p = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (exts.some((e) => entry.name.endsWith(e))) out.push([p, read(p)]);
    }
  };
  walk(dir);
  return out;
}

type Tree = 'src' | 'tests' | 'scripts';

// `scripts/` is dev tooling rather than shipped code, and it is scanned for exactly that reason: it
// is the tree where nobody is watching, so a fact re-derived there rots for months (the ~40 eyes-on
// rigs each carried their own Chromium lookup long after `tests/` was fixed).
const TREES: Record<Tree, [string, string][]> = {
  src: sourceFiles('src'),
  tests: sourceFiles('tests'),
  scripts: sourceFiles('scripts', ['.ts', '.mjs']),
};

/** This file, excluded from its own scans — see the note at the filter below. */
const REGISTER_PATH = 'tests/one-description.test.ts';

/**
 * A fact with exactly one home.
 *
 *  - `fact`    — what is being decided, in the player's or the domain's terms.
 *  - `home`    — the file that owns it, and the exported name that answers it.
 *  - `pattern` — the shape of a SECOND description. Anything matching this outside the home is a
 *                re-derivation.
 *  - `allowed` — files that may match anyway, each with a reason. An entry without a reason is not an
 *                exception, it is a hole.
 *  - `cost`    — what the codebase paid, or would pay. Rows are not free; this is the justification.
 */
interface OneDescription {
  fact: string;
  home: string;
  answers: string;
  /** Which tree(s) a second description would appear in. A row scanning the wrong one passes vacuously. */
  scan: Tree | Tree[];
  pattern: RegExp;
  allowed?: Record<string, string>;
  cost: string;
}

const REGISTER: OneDescription[] = [
  {
    fact: 'Which shape a persisted `fc_story` blob is — a roster, or a pre-roster single campaign',
    home: 'src/sim/rpg/storyRoster.ts',
    answers: 'isBareCampaignBlob',
    // The discrimination is `campaigns` absent AND `characterId` a string. Anyone spelling that out
    // again is deciding the blob's shape for themselves.
    scan: 'src',
    pattern: /!\w+\.campaigns\s*&&\s*typeof\s+\w+\.characterId\s*===\s*'string'/,
    cost:
      'Both shapes carry a top-level `version` meaning different things (envelope 1 vs STORY_VERSION 7), ' +
      'so a re-derivation read 7 against a maximum of 1 and declared every legacy campaign to be from ' +
      'the future — a save-protection feature that locked out the oldest saves (GS-save-integrity).',
  },
  // NOTE: "what does a live state park" (`resumableState`) is deliberately NOT a row. The second
  // description that actually cost a run was `persist.ts` taking its own snapshot, and
  // save-slots.test.ts already bans `snapshotRun` from that file precisely. A broader ban on
  // `snapshotRun` here would flag the Asgard SUSPENSION (`asgardReturn: snapshotRun(run)`), which
  // answers a different question, and a row that needs three reasoned exceptions to cover a five-site
  // pattern is weaker than the targeted ban that already exists. Duplicating it would break this
  // file's own header rule.
  {
    fact: 'Where Chromium is, and how it is launched',
    home: 'scripts/chromium.mjs',
    answers: 'findChromium',
    // BOTH trees. Fixing this in `tests/` and not in `scripts/` is the whole reason the row grew:
    // the rule was written, obeyed in one tree, and the other went on rotting for months.
    scan: ['tests', 'scripts'],
    // Deliberately scoped to DERIVING a path, not to using one. The browser tests pass the seam's
    // answer straight to `chromium.launch({ executablePath })`, which is calling the seam, not
    // duplicating it — banning that word would flag 22 correct files and teach everyone to edit the
    // guard, which the header rule says is worse than having none.
    pattern: /CHROME_PATH|chrome-linux|ms-playwright|pw-browsers|chromium-\d/i,
    allowed: {
      // The re-export shim. It names the seam it forwards to and derives nothing.
      'tests/chromium.ts': 'the TypeScript re-export of the home — it resolves no paths of its own',
    },
    cost:
      'Nine test files each carried their own copy and they drifted into two different answers, so 50 tests ' +
      'in build.test.ts reported SKIPPED everywhere — CI included — for months. The same lookup was then ' +
      'copy-pasted into 64 eyes-on rigs under scripts/, every copy Linux-only, and those fail SOFT: they ' +
      'printed "no chromium" and exited 0, so on Windows every art preview the project relies on silently ' +
      'rendered nothing while reporting success (GS-browser-test-gate).',
  },
  {
    fact: 'Whether the animator has already drawn this hole',
    home: 'src/app/playAnim.ts',
    answers: 'holeIsNewToAnimator',
    scan: 'src',
    // The original inline condition. Comparing a hole index to the animator's own index is the
    // re-derivation, and it is precisely the comparison that was wrong.
    pattern: /holeIndex\s*!==\s*animHoleIndex/,
    cost:
      'A hole index is not a hole identity: returning to the same index carried the previous visit\'s ' +
      'tallies into a fresh hole and silently skipped that many shots (GS-anim-counter-stale).',
  },
  {
    fact: 'Whether the star chart is the Story campaign navigator or free-roam Star Tour',
    home: 'src/ui/starTourMode.ts',
    answers: 'isStoryChart',
    scan: 'src',
    // The reducer's DOORS write the field (`starTourFreeRoam: true` / `: undefined` — an object
    // literal, no member access), which is the decision being made and is correct. Reading it back
    // off a VALUE is asking the question again, and the question has two parts: the flag AND whether
    // a campaign is even loaded. Scoped to a lower-case receiver, so a prose reference to the field's
    // home on the type (`UiState.starTourFreeRoam`) is not mistaken for a read of one.
    pattern: /\b[a-z]\w*\.starTourFreeRoam/,
    cost:
      'The mode used to be an app-layer flag set on `openStoryMap` alone, while SIX reducer transitions land ' +
      'on the chart — so a campaign that reached its chart through a world-clear recap\'s Pro Shop (no ' +
      '`openStoryMap` anywhere on that route) flew as the records chase, and docking at its spaceport sent ' +
      "the player to the title's cosmetic Clubhouse instead of their own (GS-startour-chart-mode).",
  },
  {
    fact: 'Whether a stored save blob can be read, and why not',
    home: 'src/save/schema.ts',
    answers: 'readSave',
    scan: 'src',
    // Comparing a blob's version to SAVE_VERSION by hand is how the caller loses the distinction
    // between "nothing here" and "something here I can't read".
    pattern: /\.version\s*!==\s*SAVE_VERSION/,
    cost:
      'That one comparison, answered with `defaultSave()`, destroyed a newer save, a neighbouring itch ' +
      "game's blob, and corrupt bytes — three data-loss paths from one line (GS-save-integrity).",
  },
];

describe('one decision, one home (GS-one-description)', () => {
  for (const row of REGISTER) {
    describe(row.fact, () => {
      it(`is answered by ${row.answers} in ${row.home}`, () => {
        const src = read(row.home);
        expect(src, `${row.home} no longer defines ${row.answers} — did it move? Update the register.`).toContain(
          row.answers,
        );
      });

      const trees = [row.scan].flat();
      it(`is not described a second time anywhere in ${trees.join('/, ')}/`, () => {
        const offenders = trees.flatMap((t) => TREES[t]).filter(([path, src]) => {
          if (path === row.home) return false;
          // THIS FILE names every banned shape in its own `pattern` literals, so it matches them all.
          // Naming a re-derivation is not performing one — the register documents the rule it enforces.
          if (path === REGISTER_PATH) return false;
          if (Object.keys(row.allowed ?? {}).some((a) => path.startsWith(a))) return false;
          return row.pattern.test(src);
        }).map(([path]) => path);

        expect(
          offenders,
          `these re-derive a decision that lives in ${row.home} (${row.answers}) — call it instead.\n` +
            `WHY THIS ROW EXISTS: ${row.cost}\n` +
            `If the match is legitimate, add it to that row's \`allowed\` WITH A REASON — never widen the pattern.`,
        ).toEqual([]);
      });
    });
  }

  it('every row carries a home, an answer, and the cost that justifies it', () => {
    // A row with no stated cost is a rule nobody can weigh later. The register is not a style guide.
    for (const row of REGISTER) {
      expect(row.fact.length, `a row needs a fact: ${row.answers}`).toBeGreaterThan(10);
      expect(row.cost.length, `${row.answers} has no stated cost`).toBeGreaterThan(40);
      expect(['src/', 'tests/', 'scripts/'].some((t) => row.home.startsWith(t))).toBe(true);
    }
  });

  it('every exception names a reason, because an unexplained exception is a hole', () => {
    for (const row of REGISTER) {
      for (const [path, reason] of Object.entries(row.allowed ?? {})) {
        expect(reason.length, `${row.answers} exempts ${path} without saying why`).toBeGreaterThan(10);
      }
    }
  });

  it('the patterns actually match the thing they claim to ban', () => {
    // A source scan that matches nothing is a guard that passes forever. Each pattern is proved
    // against a sample of the second description it exists to catch, so a typo'd regex fails HERE
    // rather than in six months when somebody re-derives the fact and nothing complains.
    const samples: Record<string, string> = {
      isBareCampaignBlob: "if (!obj.campaigns && typeof obj.characterId === 'string') return adopt(obj);",
      // The literal shape that was copy-pasted into 64 rigs — a hand-built Playwright cache path.
      findChromium: "const bin = join(base, d, 'chrome-linux', 'chrome');",
      holeIsNewToAnimator: 'if (state.play.holeIndex !== animHoleIndex) { animatedShots = 0; }',
      isStoryChart: 'const worlds = state.starTourFreeRoam ? STATIC_COURSES : storyWorlds(state.story);',
      readSave: 'if (s.version !== SAVE_VERSION) return defaultSave();',
    };
    for (const row of REGISTER) {
      const sample = samples[row.answers];
      expect(sample, `no sample for ${row.answers} — add one or the pattern is unproven`).toBeDefined();
      expect(row.pattern.test(sample!), `${row.answers}'s pattern does not match its own sample`).toBe(true);
    }
  });
});
