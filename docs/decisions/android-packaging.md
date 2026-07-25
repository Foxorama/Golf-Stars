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

## What is NOT verified

Stated plainly so nobody reads the scaffolding as a working build:

- **The AAB has never been compiled.** The session that scaffolded this had no Android SDK and its
  network policy blocked `dl.google.com` (403), which serves both the SDK and the Android Gradle
  Plugin. Everything above is configuration; the first real Gradle run will be the first test of it.
  Run `npm run android:apk` locally, or trigger the `android` workflow, to find out.
- **Nothing has run on a device from the shell.** The game is play-tested on a Pixel 9a and an older
  Galaxy *in the browser*; the WebView is a different runtime (no browser chrome, different memory
  ceiling, different audio-focus behaviour on interruption).
- **The Android hardware BACK button is unhandled.** The game is a single-page reducer that never
  pushes history entries, so back will close the app from any screen. This needs mapping onto the
  reducer's own back semantics (`@capacitor/app`'s `backButton` listener) and is a design call, not a
  mechanical one — it is the top follow-up before any public track.
- **Saves are still `localStorage`.** Durable enough in a Capacitor WebView to not be a launch
  blocker, but moving `src/save/storage.ts` behind `@capacitor/preferences` (keeping the existing
  `migrate()` chain and JSON export on top) is the belt-and-braces version.
