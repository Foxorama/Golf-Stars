# Android packaging — the Google Play shell (GS-android)

**Status:** scaffolded, unbuilt. The native project exists and is configured; the AAB has never been
compiled (see *What is NOT verified* below). Nothing about the game changed.

## The decision: Capacitor, not a TWA

Golf Stars is already an installable PWA, so the obvious cheap route to Play is a **TWA** (Trusted
Web Activity via Bubblewrap/PWABuilder) — an Android shell that opens the live site in a Chrome tab
with no browser UI. We chose **Capacitor** instead, for three reasons that all bite specifically here:

1. **Digital Asset Links live at the ORIGIN root.** A TWA proves ownership via
   `https://<origin>/.well-known/assetlinks.json`. We deploy to GitHub Pages under the *subpath*
   `/golf-stars/`, so the file would have to be served from `foxorama.github.io/.well-known/` — a
   different repository entirely. Solvable, but it couples the Play release to a repo the game
   doesn't own.
2. **A TWA's saves are Chrome's saves.** TWA storage is the browser's storage for that origin, so
   "clear Chrome data" wipes a hundred-hour campaign. Under Capacitor the WebView's `localStorage`
   lives in the app's private data directory and is cleared only with the app's own data. Given the
   entire save system is `localStorage` (`src/save/`), this is the difference between durable and not.
3. **Offline from install.** Capacitor packages `dist/` into the APK, so there is no first-run network
   dependency and no Chrome requirement at all.

The cost is that a Play update ships a whole new APK rather than being picked up from the web on next
launch. For a game — where a mid-run behaviour change is a *hazard*, not a feature — that is the
right trade.

## The service worker is disabled in the shell

`registerServiceWorker()` (`src/app.ts`) returns early when `Capacitor.isNativePlatform()` is true.

This is the load-bearing detail and it is easy to get wrong: Capacitor serves the bundle from
`https://localhost`, which **passes** the existing `location.protocol` guard, so without the check the
PWA worker would happily register inside the app. Every asset is already local, so it would cache
nothing of value — while reintroducing exactly the stale-serve failure that
`docs/decisions/process-and-deploy.md` exists to prevent: after a Play update the worker could keep
answering from the *previous* build's cache, and the user would have no "hard refresh" to escape with.
The web build is unaffected and keeps its network-first worker.

## Structure

| Thing | Where | Note |
|---|---|---|
| App id | `capacitor.config.ts` → `com.foxorama.golfstars` | **Permanent.** Play keys the listing on it; it can never change after the first upload. |
| Web payload | `webDir: 'dist'` | The existing single-file Vite build, copied verbatim. The game is untouched. |
| Icons / splash | `scripts/android-assets.mjs` → `assets/` → `capacitor-assets` | Derived from `public/icon-512.png` so the artwork has ONE source. Adaptive-icon foreground is inset to 60% because Android crops to the launcher's mask and only the middle ~66% is guaranteed visible. |
| Version | `android/app/build.gradle` | `versionCode`/`versionName` read from env, defaulting to 1/"1.0". CI stamps `versionCode` from the run number — Play rejects any upload that doesn't strictly increase it. |
| Signing | `android/keystore.properties` (untracked) or env | Absent ⇒ the release build still runs and emits an **unsigned** bundle. `*.jks`/`*.keystore`/`keystore.properties` are gitignored: the upload key is the one secret that cannot be casually rotated. |
| CI | `.github/workflows/android.yml` | Deliberately NOT a required check — a Gradle build is slow and `tests.yml` already guards the game. Runs on demand, on `v*` tags, and on changes to the native shell. |

## Commands

```bash
npm run android:assets   # regenerate launcher/splash art from public/icon-512.png
npm run android:sync     # npm run build + cap sync android
npm run android:apk      # debug APK — this is what you sideload to play-test
npm run android:aab      # release bundle for Play
```

## The back gesture (GS-android-back)

On Android an unhandled back button **closes the app**, from any screen, mid-round included — it reads
as a crash, and it is the single most likely thing to sink a store review. `src/ui/back.ts` is the ONE
pure decision (`backIntent(state, ctx)`); the Capacitor hardware button and the desktop Escape key both
route through it, so the behaviour can be exercised without a device and can never fork.

Four tiers, in precedence order:

0. **Dismiss the topmost layer** — the exit confirm, then the settings sheet, then any inspect/lore
   overlay. Never prompts. This is most of the value.
1. **Navigate to the parent**, reusing the EXACT action the screen's own back button dispatches, so
   back can't land somewhere the UI itself wouldn't send you (`clubhouse` → the hall, not the title;
   `starTour` → the campaign when `state.story` is set, else the title).
2. **Swallow** on forward-only beats (lore, boss reward, results, The Choice). Deliberate: treating
   back as "continue" would let a player skip a reward pick and desync `seenStoryBeats`. One dead
   press beats a corrupted campaign.
3. **Confirm, then leave** — only `playing`, and `intro` past the first tee (at the first tee back
   mirrors the screen's own "‹ Change golfer", since nothing has been played).

`title` is the ONLY screen that may close the app.

Two details worth keeping:

- **The confirm is not a data-loss warning, because there is no data loss.** `toTitle` already parks
  an active run as `resumable`. The copy (`exitPrompt`) says the thing that IS true and differs by
  format: a strokeplay round resumes on its current hole (GS-star-tour-resume), a Voyage/Unending stop
  restarts from its first. A test asserts the wording never says "lose".
- **`screenIntent` ends in a `never` guard**, so adding a member to the `Screen` union fails to
  COMPILE until someone decides what back does there. Verified by actually adding a screen and
  watching `tsc` fail in `back.ts` — not assumed.

The confirm card reuses the shared `.gs-sheet` chrome the price notice already borrows, so it adds
**zero new global CSS**. It has no tap-to-dismiss backdrop on purpose: `[data-action]` handlers are
bound per element with no `stopPropagation`, so a backdrop action would also fire on every click
bubbling out of the card.

## What is NOT verified

Stated plainly so nobody reads the scaffolding as a working build:

- **The AAB has never been compiled.** The session that scaffolded this had no Android SDK and its
  network policy blocked `dl.google.com` (403), which serves both the SDK and the Android Gradle
  Plugin. Everything above is configuration; the first real Gradle run will be the first test of it.
  Run `npm run android:apk` locally, or trigger the `android` workflow, to find out.
- **Nothing has run on a device from the shell.** The game is play-tested on a Pixel 9a and an older
  Galaxy *in the browser*; the WebView is a different runtime (no browser chrome, different memory
  ceiling, different audio-focus behaviour on interruption).
- **The hardware BACK button has never been pressed on a device.** The policy is implemented and
  exhaustively unit-tested (`src/ui/back.ts`, `tests/back.test.ts` — see below), and Escape exercises
  the identical path in a browser, but the Capacitor `backButton` event itself is unverified until
  the app runs on real hardware.
- **Saves are still `localStorage`.** Durable enough in a Capacitor WebView to not be a launch
  blocker, but moving `src/save/storage.ts` behind `@capacitor/preferences` (keeping the existing
  `migrate()` chain and JSON export on top) is the belt-and-braces version.
