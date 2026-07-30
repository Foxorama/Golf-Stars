# Save transfer — export / import (GS-save-transfer, 2026-07-25)

Rule in `CLAUDE.md` → *Versioned saves from v1*. Code: `src/save/backup.ts` (pure format),
`src/app/saveTransfer.ts` (localStorage + DOM), `src/app/overlays.ts` (`saveView` + the section),
`src/app.ts` (`wireSaveTransfer`). Guards: `tests/save-backup.test.ts`,
`tests/save-transfer-browser.test.ts`.

## Why it finally got built

`CLAUDE.md` has claimed "Export/import-to-JSON from day one (localStorage is the only copy)" since
v1. That was true of the save *layer* — `downloadSave` and `importAndStore` have sat in
`save/storage.ts` the whole time — and false of the game: neither function was wired to a single
button. There was no way for a player to back up or move a save.

Two things made that bite at once:

1. The Android signing fix (`android-packaging.md`) means a test device needs **one uninstall** to
   move onto the signed channel. An uninstall wipes the app's `localStorage`, which is the whole save.
2. `localStorage` is scoped to an **origin**, and the Capacitor shell serves from `https://localhost`.
   The website's save and the app's save are, and always were, two separate stores. A tester who has
   been playing on the web URL has nothing on the phone build and no way to get it there.

## A backup is a BUNDLE, not a save

Progress is spread over three localStorage blobs:

| key | what | written by |
|---|---|---|
| `fc_save` | the main save — shards, unlocks, ascension, the resumable run | `save/storage.ts` |
| `fc_story` | the Story Tour campaign, deliberately separate | `save/storyStore.ts` |
| `fc_settings` | preferences | `settings.ts` |

Exporting `fc_save` alone — which is what the pre-existing `downloadSave` did — would have silently
dropped a player's entire Story Tour campaign. "It worked, and you lost half your stuff" is precisely
the failure a backup feature exists to prevent, so the file is an envelope:

```json
{ "kind": "golf-stars-backup", "version": 1, "exportedAt": "...",
  "save": { ... }, "story": { ... } | null, "settings": { ... } | null }
```

> **Superseded at `version: 2`** (GS-story-campaign-slots, `story-campaign-slots.md`): `story` — one
> campaign — became `campaigns`, the per-golfer roster `fc_story` now holds. A v1 file's single
> campaign folds into a one-slot roster on read, so everything written under the shape above still
> restores. The bump is deliberate: it makes an older build **refuse** a v2 file loudly instead of
> handing the roster to `migrateStory` and silently restoring one mangled campaign.

`version` here is the **envelope's**, independent of `SAVE_VERSION`; the save inside carries its own
and rides the existing `migrate()` chain on import. **A new persisted blob must join the bundle**, or
it is lost on every transfer — that's the rule this file exists to state.

`story: null` is a real value, not an absence. Importing a campaign-less backup *clears* the device's
campaign rather than leaving the old one behind — otherwise a restore produces a save-plus-campaign
pairing that never existed on either device.

## Import throws; it does not guess

The single most important line in the module is that `parseBackup` **raises `BackupError`** on
anything it cannot trust. The pre-existing `importSave` in `schema.ts` does the opposite — it
swallows and returns `defaultSave()`:

```ts
export function importSave(json: string): Save {
  try { return migrate(JSON.parse(json)); } catch { return defaultSave(); }
}
```

That is exactly right for a **boot** path (a corrupt blob must not brick the game) and catastrophic
for an **import** path, where it would replace a real save with an empty one and report success. So
the import path never calls it.

Refused, with a player-facing message each: non-JSON, truncated JSON, arrays, bare strings, unrelated
objects, a bundle with no save, and a bundle from a *newer* envelope version. A legacy **bare save**
file — what `exportSave` has always emitted — is still accepted, and reports honestly that it carries
no campaign.

A campaign that won't migrate is the one thing dropped rather than fatal: the main save is the bulk
of a player's progress, and refusing the whole import over an odd `fc_story` is the worse trade. The
confirm summary says what actually came through.

**Update (GS-save-integrity):** that guard leaked one layer down for two years. `parseBackup` checks
the *bundle's* version, but `migrateSaveOrThrow` called `migrate()` for the save inside it — and
`migrate` returns `defaultSave()` for an unknown version **without throwing**, so the try/catch never
fired for the one case that mattered. Since `BACKUP_VERSION` tracks the container and `SAVE_VERSION`
moves independently (27→32 all shipped inside bundle v1), a future save arrives in a valid current
bundle and imported as empty *while reporting success*. It now uses `readSave`, which can tell.
A newer **campaign** in a bundle throws as well: the drop-rather-than-fail trade above covers an *odd*
blob, not a readable-but-lossy one. See `save-integrity.md`.

## Two steps, always

Import replaces everything, so picking a file only **parses and summarises** it — shards, best score,
ascension, ship/cosmetic counts, whether a run is in progress, and which chapter the campaign is at.
Nothing is written until a second, explicitly-worded tap. The browser test asserts this directly:
after the file is chosen and before the confirm, `fc_save` is byte-for-byte what it was.

The summary is also how a player catches the *quiet* mistake — picking the wrong file. An empty
restore looks obviously empty in that list before it costs anything.

Applying reloads the page rather than patching the live reducer. Boot already rebuilds everything
from the blobs; half-applying an import into a running reducer is how you end up with a run pointing
at a course the restored save has never heard of.

## Export offers two routes on purpose

A blob-URL `<a download>` is reliable in a browser and **not** reliable in the Capacitor WebView,
which has no download manager wired up by default. So the section offers a file download *and* a
clipboard copy, and reports what actually happened — a failed download points at the clipboard
button rather than claiming a success it cannot observe.

## A note on old saves

The browser test's first fixture hand-rolled `version: 1` and the confirm summary came back reading
*"0 Star Shards"*. That was correct: v1 predates shards entirely, so the migration chain fills the
default. Worth remembering when a restore looks lossy — a genuinely ancient save **is** lossy, by
definition of the fields not existing yet. The fixture now uses `defaultSave()` at the current
version, which is what a real export looks like.

## Not verified

- **Nothing has been imported on a real device.** The whole flow is exercised in headless Chromium;
  the Capacitor WebView's file picker (`<input type="file">` → the Android document picker) is
  unverified until it runs on hardware. That is the one step most likely to need a native plugin.
- The clipboard route is untested in the shell — `navigator.clipboard` needs a secure origin, which
  `https://localhost` satisfies, but permission behaviour in a WebView is not the same as a browser's.
