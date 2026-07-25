# Android packaging — the Google Play shell (GS-android)

**Status:** **building green in CI** as of run #6 (2026-07-25) — `bundleRelease` and `assembleDebug`
both succeed and upload a ~12 MB artifact. The bundle is **UNSIGNED** (no upload key configured yet),
so it is sideload/inspection-grade, not Play-uploadable. Nothing about the game changed.

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
npm run android:assets       # regenerate launcher/splash art from public/icon-512.png
npm run android:sync         # npm run build + cap sync android
npm run android:apk          # debug APK — signed with YOUR ~/.android/debug.keystore
npm run android:apk:release  # release APK — signed with the upload key; the sideload build
npm run android:aab          # release bundle for Play
```

⚠️ **These three produce three DIFFERENT signatures**, and Android will not update across them.
A local debug APK, a CI debug APK and a release APK are mutually un-updatable — switching between
them needs an uninstall (which wipes the save; see *Signing and the "app failed to update" trap*).
Pick one channel per device and stay on it. For play-testing, that channel should be
`android:apk:release` / the CI signed APK, because it is the one that matches Play.

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

## What the first real build cost (three bugs, none of them Gradle's fault)

Recorded because all three were *invisible until executed* — the scaffolding typechecked, the YAML
parsed, and the whole thing still could not produce a single artifact. Configuration that has never
run is not working code.

1. **`secrets` in a step-level `if:` kills the whole workflow.** `if: ${{ secrets.FOO != '' }}` is a
   syntax error — the `secrets` context is not available to a step's `if:` (only `github`/`env`/
   `job`/`runner`/`steps`/`needs` and friends are). GitHub rejects the file at STARTUP, which surfaces
   as a red run with **zero jobs and no logs at all** — nothing like a build failure, and there is no
   log to open. `list_workflow_jobs` returning `total_count: 0` is the tell. Fix: surface the secret
   as **job-level `env`**, which a step `if:` *can* read.
2. **`versionCode (expr).toInteger()` is a Groovy parse trap.** It parses as
   `versionCode(expr).toInteger()` — the setter is called with a String, then `.toInteger()` runs on
   its null return, and the build dies with a bare `> Value is null` pointing at a line that looks
   fine. The space before the paren does the damage. Fix: compute into a local above `android {}`.
3. **`workflow_dispatch` gives you no button until the workflow is on the DEFAULT branch** — useless
   for testing a wrapper pre-merge, which is exactly when you need it. Hence `branches: ['**']` +
   `paths`: push a change to the native shell on any branch and it builds that commit.

Build shape once green: ~2.5 min total, `bundleRelease` ~86s, `assembleDebug` ~32s, artifact ~12 MB.

## Signing and the "app failed to update" trap (2026-07-25)

The first real play-test download failed at the phone with a bare *"app failed to update"*. Nothing
in CI had gone red — the job was green and the artifact downloaded fine. Two independent faults, both
in the workflow rather than the app:

1. **The sideload APK was `assembleDebug`.** A debug APK is signed with the *runner's*
   auto-generated `~/.android/debug.keystore`. GitHub runners are ephemeral, so that certificate
   differs from run to run and matches nothing already on a phone. **Android refuses to update a
   package whose signing certificate changed** — that refusal is the message.
2. **The debug APK was always `versionCode 1`.** `ANDROID_VERSION_CODE` is a per-step `env:`, and
   only the bundle step had it, so `build.gradle`'s `?: '1'` fallback won every time. Against
   anything installed from the bundle that is a *downgrade*, blocked outright before the signature is
   even considered.

And a third thing made it expensive to diagnose: **the keyless path succeeded silently.** With no
`ANDROID_KEYSTORE_BASE64` secret set, `Decode upload keystore` skipped, the `.aab` came out unsigned
(Play would have rejected it), the debug APK came out randomly signed — and the artifact still had
the same friendly name as a good build. Everything looked right until the phone said no.

The fix, all three parts:

- The sideload artifact is now **`assembleRelease`, signed with the upload key** — one stable
  certificate for every build, the same one Play ships, so sideloaded builds update in place forever.
- **Every** artifact step is stamped with `ANDROID_VERSION_CODE` (the run number) and
  `ANDROID_VERSION_NAME` (`1.0.<run>`), so version codes always increase and a tester can read which
  build is on their phone off the Android app-info screen.
- **The keyless path is now loud.** It still builds (that was deliberate — a fork or a pre-key
  checkout needs to be able to compile the wrapper), but it emits a `::warning::`, writes the reason
  into the run summary, and — the part you cannot miss — names the artifact
  `golf-stars-android-UNSIGNED-cannot-update-existing-install`. You have to read that to download it.

### Setting the signing secrets (once)

Generate the upload key **on your own machine** — never in CI, never in a chat transcript; a key that
has been printed anywhere is burned. Then:

```bash
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
base64 -w0 upload.jks    # macOS: base64 -i upload.jks
```

Repo → Settings → Secrets and variables → Actions → four secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the base64 blob above |
| `ANDROID_KEYSTORE_PASSWORD` | the store password you chose |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

Back `upload.jks` up somewhere durable and offline. Losing it means you can never ship an update to
that Play listing under the same key — Play keys the listing on `com.foxorama.golfstars`, which is
permanent (see the top of this doc). `*.jks` / `*.keystore` / `keystore.properties` stay gitignored;
the rule in `android/.gitignore` is not negotiable, which is why there is no zero-setup path here.

### The first uninstall

Because the certificate is changing, the build already on a test device cannot be updated to the
signed one — that phone needs one uninstall, and **an uninstall wipes the app's `localStorage`, which
is the whole save**. After that single reset, every later signed build updates in place.

Note the Capacitor shell serves from `https://localhost`, so **the app's save is a separate store
from the browser build's** — a save made on the web is not on the phone and vice versa. Moving one to
the other is what the save export/import UI is for.

## What is NOT verified

Stated plainly so nobody reads the scaffolding as a working build:

- ~~The AAB has never been compiled.~~ **Now built** — see *What the first real build cost*, below.
  It is unsigned until an upload key exists, so it cannot go to Play yet.
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
