# Save integrity — never overwrite what you couldn't read (GS-save-integrity)

`save/integrity.ts` · `save/schema.ts readSave` · `sim/rpg/storyRoster.ts campaignStoreTooNew` ·
`tests/save-integrity.test.ts` + `tests/save-integrity-browser.test.ts`

## The one line that was losing saves

```ts
if (s.version !== SAVE_VERSION) return defaultSave();   // schema.ts, since v1
```

`migrate()` answered **every** blob it did not understand with a fresh default. That made two
completely different situations indistinguishable to the caller:

- **there was nothing here** → start a new game, obviously right;
- **there is something here and I can't read it** → start a new game, and then destroy it, because
  `writeSave` had no idea anything had gone wrong and the next ordinary persist wrote the default
  over the real blob.

The function was correct in isolation and had no way to be otherwise: its return type is `Save`, so
"I couldn't read this" had nowhere to go. Three separate data-loss paths came out of that.

### 1. `newer` — a save from a later build

The narrow routes are a stale CDN copy or an offline boot on a not-yet-retired service worker. The
wide one is the **Capacitor shell**: it never auto-updates and it is its own origin
(`https://localhost`), so "export from the browser, import into the app" is the *documented* workflow
(GS-save-transfer) and was a data-loss path the moment the two builds differed by a schema version.
Since `SAVE_VERSION` moves most releases and the store build moves when a release is cut, that
difference is the normal state of affairs, not an edge case.

### 2. `foreign` — somebody else's blob under our key

itch.io serves every HTML5 game from one shared CDN origin
(`html-classic.itch.zone`), so `fc_save` sits in a bucket shared with every other game on the
platform — see `reports/release-pipeline-2026-07-30.md`, which is where this was first written down as
report item 4. Nothing stops a neighbouring game writing that key. The old behaviour read it as
garbage, started fresh, and then **overwrote their data too**, which is the same bug pointing the
other way.

This is the case the report proposed fixing with "a collision *detector*", and it turned out not to
need one: a blob with no numeric schema version is not ours, and that is the whole test. It falls out
of the same classification the other two arms need.

### 3. `corrupt` — bytes that aren't JSON

A write interrupted part-way, or a quota kill mid-`setItem`. Rare, and the least recoverable, which is
exactly why overwriting it was the wrong response.

## The rule

**This build never overwrites data it could not fully read.**

A fault puts the save layer in READ-ONLY: the game stays completely playable, nothing is persisted,
the title screen says so, and the Save data section offers the stored bytes as a download. Refusing to
write is not caution for its own sake — a save we cannot parse is one we cannot merge into, so writing
is *guessing*, and the thing being guessed over may be a hundred hours of somebody's campaign.

`readSave` is the one function that classifies, and `migrate()` is now a thin wrapper over it
(`read.ok ? read.save : defaultSave()`) so every caller that genuinely has no way to act on the
difference is **byte-for-byte unchanged**. The distinction is opt-in, per call site: boot latches a
fault, import throws, everyone else carries on.

## Where it is enforced

| Writer | Behaviour under a fault |
|---|---|
| `writeSave` | returns `false` |
| `writeCampaignStore` / `writeStory` | returns `false` |
| `clearStory` | no-op — deleting is the most destructive write there is |
| `applyBackup` (import) | **proceeds**, after `clearFault()` |

Returning `false` rather than throwing costs nothing: every caller already handles a `false` from the
storage-unavailable case (private mode, Node), so read-only rides a contract that has been there since
v1.

The import is the one write allowed through, because it is deliberate, confirmed, and replaces every
blob — there is nothing left to protect. `clearFault()` runs **first**, and that ordering is
load-bearing: with the fault still set, every write would refuse and the import would report success
having written nothing, which is the same lie in the opposite direction.

## The campaigns fail in the other direction, and needed the same answer

`migrateStory` is field-by-field and **never reads `version`**. That is beautifully robust on a boot
path and quietly lossy in one direction: a campaign from a newer build keeps every field this build
knows, silently drops the rest, and the write-after-every-action persists the truncation. The main
save's failure was loud and total; this one is a slow puncture. `campaignStoreTooNew` checks the
envelope *and* every campaign inside it, because `STORY_VERSION` and `CAMPAIGN_STORE_VERSION` move
independently.

### The bug this feature shipped and the test caught

`campaignStoreTooNew` originally read the top-level `version` before working out what shape the blob
was. Both shapes carry that field and it means different things — a roster's is the envelope's
(**1**), a bare pre-roster campaign's is its `STORY_VERSION` (**7**) — so it read 7, compared it
against a maximum of 1, and declared every legacy campaign in existence to be from the future. A
save-protection feature that locks out the oldest saves.

It was a **second description** of a decision `migrateCampaignStore` already owned, which is the
failure mode this codebase pays for repeatedly (the derelict deck edge, `resumableState`, the SW cache
prefix, `findChromium`). There is now one `isBareCampaignBlob`, and both callers ask it.

Worth noting *which* test caught it: not one of the future-version cases — those all passed — but the
dull one asserting that **nothing normal changed**.

## The import hole, closed in the same pass

`parseBackup` guards `obj.version > BACKUP_VERSION` at the *bundle* level. That says nothing about the
save inside it, and the two version independently: `BACKUP_VERSION` tracks the container (it went to 2
when `story` became a roster) while `SAVE_VERSION` ran 27→32 inside an unchanged v1 bundle. So a future
v34 save arrives in a perfectly valid v2 container, and `migrateSaveOrThrow` — whose whole job is to
refuse rather than guess — called `migrate()`, which returns a default **without throwing**. Its
try/catch never fired for exactly that case: the import replaced a real save with an empty one and the
UI reported success.

That is the precise failure `save-transfer.md`'s "Import throws; it does not guess" says the module
exists to prevent, leaking one layer down. It now uses `readSave` and reports the found version. A
newer *campaign* in a bundle throws too — the documented "drop a campaign that won't migrate rather
than fail the whole import" trade covers an **odd** blob, not a readable-but-lossy one, and the
device-side load refuses to truncate those, so the import cannot hold the opposite opinion.

## The rescue, and the trap it avoids

A normal export is built from `loadSave()` — which, under a fault, hands back the empty default. So
the export button would have written a file containing nothing and the player would reasonably have
believed they had a backup. **Worse than offering nothing at all.**

So under a fault the Save data section *replaces* export (and clipboard copy) with **"Download the
stored data as-is"**: the stored bytes exactly, no parse, no migration, no re-stamping. For `newer`
it is a complete rescue — update, import the file. For `corrupt` it is the only copy that will ever
exist of whatever survived, and it costs one tap. Import stays, because it is the way out.

## Deliberately NOT done

- **No quarantine copy under a second key.** It would double the blob inside a quota shared with every
  other game on itch, and it would need a row in PRIVACY.md's table, which `tests/privacy.test.ts`
  machine-checks. Leaving the original untouched achieves the same end and stores nothing new.
- **No save-version bump.** This is pure read-path hardening. (Report item 5 — the "last backed up N
  runs ago" nudge — needs a `lastExportAt` field and is a separate change.)
- **No new storage key, no new hook.** Nothing for PRIVACY.md, nothing for the test hub to sync.
- **`fc_settings` is not covered.** It merges over defaults and holds no progress, so an unreadable one
  costs a player their preferences, not a save.

## Not verified

- **No real device has been shown a newer save.** The whole flow is exercised in headless Chromium
  against the built artifact, including the byte-for-byte assertion after boot. The specific scenario
  worth a manual pass once: play the browser build, then open an older Capacitor APK on the same
  exported file.
- **The `corrupt` arm has never been seen in the wild**, only synthesised. It is the least likely and
  the least recoverable.
