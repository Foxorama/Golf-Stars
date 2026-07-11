# Why "everything today broke" — a regression post-mortem (2026-07-11)

## The claim under investigation

> "Almost everything today has introduced game-breaking regressions, while all the features
> introduced before the refactoring were working really well. Work out what about the refactors
> (done ~8–12 h ago) borked the project."

Short answer: **the refactors did not break anything.** They were clean, tested, barrel-preserving
file splits. What actually happened is that a day of high-churn work landed almost entirely in the
one layer the test suite does not cover — the **app / render / CSS layer** — and that layer has no
automated safety net, so its regressions ship green. The refactors are a *symptom* of the same
growth, and they made one *class* of failure (global CSS/DOM-namespace collisions) slightly easier
to introduce. They are not the cause.

## Timeline (main, 2026-07-11)

| window | PRs | what |
|---|---|---|
| 00:00–04:00 | #326–332 | **New world**: the Derelict spaceship (huge render + sim addition) |
| 04:43–11:02 | #333–346 | **GS-refactor-split**: mechanical file splits (playView, economy, round, app, run, game) |
| 12:00–17:19 | #348–355 | Journey-map redesigned ×3 (#349/#351/#353); ship-wall physics iterated ×3 (#350/#352/#354); the blur fix (#355) |

The user's "pre-refactor good / post-refactor bad" reads as a time correlation. The *cause* is not
the refactor boundary; it's **which layer the work touched** and **whether that layer is tested.**

## What each of "today's" regressions actually was

1. **The blurry, unplayable play screen (#353 → fixed #355).** A genuine regression, but a **CSS
   class-name collision**, not a refactor bug. The journey-map redesign styled its bridge HUD with
   `.gs-hud` — the class the play screen already owns. The second `.gs-hud { inset:0 }` stretched the
   play screen's `.gs-glass` top chip to full-screen, smearing a `backdrop-filter: blur` over the
   whole map. **Zero JavaScript threw**, so all ~1,120 tests stayed green.
   - *Refactor connection (minor, real):* the app-shell split (#336–339) scattered the play HUD into
     `src/app/playHud.ts` and the journey HUD into `src/app/travelScreens.ts`. When everything lived
     in one `app.ts`, reusing `.gs-hud` was more likely to be noticed. Fragmentation raised the odds
     of a **global-namespace** clash (CSS classes and DOM ids are global; the modules are not).

2. **The derelict wall bounce leaking / lost balls (#350/#352/#354, and the caddy fight #356).** Not
   refactor-related at all. This is a genuinely hard feature — a ball contained on a zig-zagging,
   torn-open corridor — that has taken six passes. Each pass was a real improvement on a real bug
   (per-segment collision → deck-boundary containment → deck-boundary flight bounce → caddy-guard
   ordering). Hard ≠ regressed.

3. **PR #347 failing CI while "green locally."** Not a refactor bug and not even a test failure — a
   **type error** (`executeShot(…, {}, rng)` with `ExecOpts.carryMult` required, TS2345). It failed
   the `npm run typecheck` step, which runs *before* the tests in CI. It passed locally because
   `npm test` (vitest) transpiles with esbuild and **does not type-check** — so `npm test` is green
   on code that `tsc` rejects. "Green tests" never implied "type-clean."

## Root cause (the through-line)

**The safety net is concentrated in `src/sim/` (pure, deterministic, ~1,100 Node tests). The
app / render / CSS / DOM layer has almost no automated coverage** — a handful of browser smoke tests
that only assert the app *boots and does not throw*. None of them measured layout, styling, or
screen wiring until #355.

Everything that shipped broken this day lived in that uncovered layer:
- a CSS collision (#353) — invisible to sim tests and to "does it throw" browser tests;
- a type error in a test file (#347) — invisible to vitest, caught only by `tsc`;
- render/feel iteration on a new world — partially covered once sim-level invariants were added
  (the flight-leak and caddy-guard regressions now have seeded tests).

The refactors moved *more* code into that under-tested layer and fragmented it, but they didn't
introduce the bugs. **The gap is coverage of the app/render/CSS layer, plus the discipline of
running the full CI gate locally.**

## What's being done about it

1. **`npm run check`** (this PR) = `typecheck && test && build`, mirroring CI exactly. Running only
   `npm test` is what let #347's type error look green. `check` is now the documented pre-push gate
   in CLAUDE.md. *This directly closes the #347 gap.*
2. **Behavioral layout guards in a real browser** (started #355): a test drives into the play screen
   and asserts the HUD chrome never blankets the map. This is the *only* kind of test that can catch
   a CSS-collision regression, and it now guards the exact #353 failure.
3. **Sim-level invariants for the new world** (#354/#356): seeded end-to-end drives assert no flight
   leaks off a solid deck and no caddy-guard save ends lost — the derelict's feel bugs now have a net.

## Prevention playbook (for the next session)

- **Run `npm run check` before every push** — not `npm test`. Vitest ≠ type-check; a green suite says
  nothing about `tsc`, unused vars, or missing required args.
- **A CSS class / DOM id is global — namespace it per component.** New screen chrome gets its own
  prefix (`.gs-bhud*` for the bridge HUD, not `.gs-hud`). Before adding a `.gs-foo` rule, grep for
  `gs-foo` across `src/` — if another screen already uses it, pick a new name. Fragmented modules
  can't see each other's class names; the grep is the substitute for the old one-big-file view.
- **If it renders, it needs a browser test.** Any new screen or HUD should get a smoke assertion:
  reaches the screen, no page error, no `__gsErr`, and no chrome element blanketing the viewport.
- **Prioritized coverage follow-up (known remaining gap):** the **travel/journey and shop screens**
  have no layout smoke test — reaching them in a headless browser means playing through a stop
  (shot animations + watch/continue screens), which is flaky to script reliably. This is the next
  guard to build (likely by exposing a deterministic deep-link/test hook to mount a screen), and it
  is the highest-risk uncovered surface: the journey map was redesigned three times in one day.

## Update (2026-07-11) — the travel/shop gap is now closed (GS-screen-deeplink)

The follow-up above shipped. A `?screen=travel|shop|starmart|trademarket|clubhouse` deep-link
(`applyDebugParams` → `jumpToScreen` in `src/app.ts`, the exact test-only-URL-param pattern the
GS-asgard `?rainbow=`/`?asgard=` jumps already used) mounts each between-stop / between-run screen
**directly off the real reducer transitions** — no forked logic, no playing a whole stop. Because
the screen is built the honest way (`leaveShop → travel`, `openMarket`, `openClubhouseHall`, and the
same `shopOffer`/`starmartOffer` the reducer itself builds), a real render bug can't hide behind it.

Six new browser layout guards in `tests/build.test.ts` now drive `?screen=…` for all five screens
and assert: the screen mounts (its own distinctive marker), the app never faulted (no `pageerror`,
no recovered `__gsErr`), and we were not bounced back to the title. Plus a travel-specific guard —
the bridge HUD stays `pointer-events:none` (map taps pass through) and the star-map fills the
viewport — the exact `.gs-hud`-collision / zoomed-out-to-a-sliver failure modes the redesign churn
risked. **CI already installs Chromium and runs `npm test`, so these run on every push/PR with no
workflow change** — the layout regressions that used to need eyes-on play are now caught
automatically. As a new URL-param hook it also got a Test-Hub control (a "Screen" button row in the
Demo rail), keeping `tests/test-hub.test.ts`'s parity guard green.
