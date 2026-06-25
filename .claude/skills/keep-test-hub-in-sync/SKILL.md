---
name: keep-test-hub-in-sync
description: >-
  Use when adding or changing a PUBLIC HOOK on the Golf Stars game — a URL param
  (?seed=, ?intro=, …) or a live window._gs* escape-hatch feel flag — or new
  content/sim behaviour you want demoable in the test hub. Encodes the one atomic
  change (add hook → add hub control → extend guard → update docs) so the test/demo
  hub (test.html / src/test/) never silently rots. Invoke before opening the PR.
---

# Keep the Test & Demo Hub in sync

The hub (`test.html` → `src/test/hub.ts`) drives the REAL game through public hooks and runs the
pure sim for batch experiments. It re-implements zero game logic, which keeps it thin but lets it
rot silently — a renamed/added hook leaves a dead button, no error. `tests/test-hub.test.ts` is the
CI guard against that; this skill is the process so you never out-run the guard.

## First: does your change even need manual work?

Most don't — the hub is built to absorb them automatically. **Skip straight to "just ship it" if
your change is:**

- **New content as data** — a club (`CLUBS`), shop perk (`SHOP_ITEMS`), meta upgrade
  (`META_UPGRADES`), lie (`LIE_INFO`), run format (`FORMATS`), or biome row. The hub imports these
  tables, so the new row appears in the Sim Lab's dropdowns/steppers on its own. (The guard's
  "imports, not copies" test protects this — don't replace an import with a hardcoded list.)
- **A change to sim behaviour** — shot model, dispersion, economy, scoring, putting. The Sim Lab
  calls the real functions (`resolveShot`, `simulateRun`, `buildLoadout`), so it reflects the change
  with no edit.
- **A new game screen / feature** — it shows up in the Demo iframe automatically; it IS the game.

If your change is one of those, run `npm test` and ship. The rest of this skill is only for **new
hooks**.

## The atomic change (a NEW hook — `window._gsFoo` or `?foo=`)

Do all four in ONE PR. The guard (`tests/test-hub.test.ts`) auto-discovers hooks from the app
source, so steps 1 and 3 are coupled: add the hook and CI goes red until the hub drives it.

1. **Add the hook to the app.** A `window._gsFoo` feel flag (read where the feel lives, behind the
   escape-hatch rule) or a `new URLSearchParams(location.search).get('foo')` URL param in `app.ts`.

2. **Add the hub control** in `src/test/hub.ts`:
   - URL param → extend `buildGameUrl()` to `p.set('foo', …)` so the Demo can drive it.
   - Live flag → add a setter that writes `frame.contentWindow._gsFoo = …` and a rail button/slider
     that calls it (see `setFeel`/`setSprayCentral` for the pattern). Add the control to a `*Group()`.

3. **Confirm the guard is green.** `npx vitest run tests/test-hub.test.ts`. It auto-discovers the new
   `_gsFoo`/`foo` from the app and asserts the hub now covers it (both directions — a dead hub hook
   fails too). You do NOT hand-edit a hook list; if it's red, the hub is missing the control.

4. **Update docs.** The hub section in `CLAUDE.md` and the conformance notes in
   `standards/TEST-HUB-STANDARD.md` if the hook is significant.

## Verify before the PR

```
npm run typecheck && npm test          # whole suite incl. lab.test.ts + test-hub.test.ts
npm run build                          # two-pass: game, then VITE_HUB=1 appends dist/test.html
```

For canvas/feel changes, eyeball it: build, open `dist/test.html`, fire the Sim Lab panels and drive
the Demo. Canvas feel can't be unit-tested — say "verified eyes-on" in the PR.

## Gotchas

- The hub is a render/DOM side-effect — never put hub logic in the pure reducer (`src/ui/game.ts`)
  or the sim. It pokes the shell (URL + `window._gs*`), never the sim internals.
- New experiment maths go in `src/test/lab.ts` (pure, DOM-free) with a test in `tests/lab.test.ts`,
  NOT in `hub.ts`. `hub.ts` is the imperative shell; `charts.ts` is render-only.
- Singlefile forbids multi-input, so the hub builds in a second `VITE_HUB=1 vite build` pass — keep
  it that way; `tests/build.test.ts` builds only the game.
