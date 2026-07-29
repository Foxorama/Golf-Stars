# Story-Tour campaign slots — one campaign per golfer (GS-story-campaign-slots, 2026-07-29)

Rule in `CLAUDE.md` → *Versioned saves from v1* (the `gs_story` bullet). Code:
`src/sim/rpg/storyRoster.ts` (pure), `src/save/storyStore.ts` (the one localStorage key),
`src/save/backup.ts` + `src/app/saveTransfer.ts` (the bundle), `src/app.ts` (the active pointer).
Guards: `tests/story-roster.test.ts`, `tests/save-backup.test.ts`, `tests/story-flow.test.ts`.

## The bug

`gs_story` held a **single** `StoryState`. `openStory` with no campaign routed to character select,
and `selectCharacter` under `pendingStoryNew` did this:

```ts
story: { ...defaultStoryState(action.characterId), campaignSeed: `c${state.run.seed}` },
```

— then `persistStory()` wrote it over the one key on the very next action. So **tapping a golfer's
card destroyed the campaign you already had**, with no confirmation and no way back.

That is bad on its own, and worse because of what the campaign had quietly become. `GS-story-startour-
champion` made free-roam Star Tour play as your finished protagonist, carrying the bag, gear, caddy
and ship you built up over five chapters:

```ts
const champion = state.story?.completed ? state.story : undefined;   // game.ts
```

The champion was read from the **single live campaign**. So starting a new Story Tour did not merely
lose a campaign — it silently deleted your Star Tour character too, and the only survivor was the
permanent `starTourUnlocked` flag on the main save, which re-opened the mode with nobody developed to
play it as.

## One decision, not three

The asks were: carry a finished character into Star Tour; unlock a character per golfer you finish
with; warn before a restart replaces one; and allow several campaigns at once. Those look like four
features. They are one data-model decision:

> **`characterId → StoryState`. One campaign per golfer.**

Everything falls out:

- four golfers ⇒ four independent campaigns, and Larry's can never touch Feather's;
- a **Star Tour champion IS that golfer's completed slot** (`championCampaigns`) — so there is no
  second copy of a loadout that can drift out of step with the campaign it came from;
- and "starting over as a golfer you already finished with replaces your Star Tour character" stops
  being a rule that needs implementing and becomes a plain description of overwriting one slot. The UI
  owes the player a **warning** (`campaignOverwriteWarning`), never a special case.

### The road not taken: a frozen champion snapshot

The alternative was to copy the `StoryState` at the instant the finale is won and keep it somewhere
separate. It was rejected because it creates two descriptions of one loadout — the classic mistake
this codebase keeps re-learning (see the derelict's seven passes in `sim-generator.md`). It also
fights the requested warning: if the champion is a separate copy, restarting a campaign does *not*
inherently destroy it, so the overwrite would have to be wired deliberately and could disagree with
what the confirmation said. The live slot has one further merit — a champion who keeps shopping after
the finale keeps improving, which is the honest reading of *"the full loadout the player had at the
end of the Story Tour"*.

## Nobody loses a save

Every player upgrading the game is holding the old shape. Three rules make that safe, and the first
is the one the whole feature stands on:

1. **The key does not change.** `migrateCampaignStore` accepts three shapes: a roster, a **legacy bare
   `StoryState`** (adopted as a one-slot roster under its own `characterId`, with `activeId` pointed at
   it), and junk (an empty roster). Because the key is unchanged, the backup bundle's blob list is
   unchanged too, and the campaign's own `STORY_VERSION` chain is untouched — the roster defers to
   `migrateStory` rather than re-implementing it, so a v6 campaign still upgrades exactly as it did.
2. **Nothing throws.** This is a boot path; a corrupt blob degrades to the best honest reading of it.
   A slot that will not parse is dropped and **its neighbours are kept** — losing one campaign is a bad
   day, losing the other three because of it is the failure the feature exists to prevent.
3. **A completed campaign survives as a champion.** Guarded explicitly, because the upgrade must not
   cost anyone the free-roam character they earned.

## Two traps in the store

**`writeStory` read-modify-writes.** It runs after *every* action, so a roster serialised from stale
memory would silently drop every other golfer's campaign — one action, three campaigns gone. A
module-level cache in `storyStore.ts` makes the read cheap; `invalidateCampaignCache()` drops it
whenever something outside the module writes the key (a backup import). The cache is only ever a
**mirror of what is actually on disk**: with no localStorage, `writeCampaignStore` leaves it alone and
returns false, so "no storage" stays the pure no-op it always was rather than quietly becoming an
in-memory store that leaks between callers (which would also have made test order load-bearing).

**`writeStory` must NOT move `activeId`.** Star Tour persists the champion it is free-roaming as on
every action. Had the upsert moved the pointer, free-roaming as Feather would have hijacked the
"Continue" of a campaign you left half-way through chapter three. The pointer moves only where the
player has unambiguously chosen a campaign — `openStory`, or creating one — which is a side-effect-layer
concern and lives in `app.ts`'s dispatch beside `persistStory()`.

`activeCampaign` returns `null` **only** for a genuinely empty roster; with campaigns present and no
pointer it falls back to the first in stable order. Refusing to answer would have shown a player who
owns two campaigns "Begin a new campaign" and no way back to either. *Which* campaign to resume when
several exist is a question for the picker (which reads the roster directly), never for a boot path.

## The bundle: why `BACKUP_VERSION` went to 2

`Backup.story` (one campaign) became `Backup.campaigns` (the roster). The bump is the **point**, not a
formality. An older build reading a v2 file trips its own check:

```ts
if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) throw new BackupError(…)
```

…and refuses with *"That backup was made by a newer version of Golf Stars"*. That is a loud, correct
failure. Had the roster been smuggled through the old `story` field to keep the version at 1, that
build would instead have handed a container to `migrateStory`, restored **one mangled campaign**, and
reported success — exactly the class of silent data loss a backup feature exists to prevent.

Reading is generous in the other direction: a **v1 bundle's single `story` folds into a one-slot
roster** through the same code path a pre-roster `gs_story` blob takes, so every backup file a player
already holds still restores its campaign, champion flag and all.

Import **replaces** the roster wholesale rather than merging. A merge would have to invent an answer
for "both the file and the device have a Feather Fade campaign", and silently picking one is precisely
the guess an import must not make. Instead `describeBackup` now names every campaign in the file and
marks champions with a ★, so a player about to overwrite three campaigns with one sees that on the
confirm step — before the write, which is the only moment it helps.

## What this PR deliberately does NOT do

It is the save layer alone. The player-facing halves ship separately so the risky persistence work
lands reviewable and revertable on its own:

- the Story Tour **campaign picker** + the overwrite confirmation;
- Star Tour **champion select**, the champion-armed Yggdrasil, and the Serpent-at-the-root finale
  replay.

One consequence is already live and worth knowing: because `writeStory` upserts by `characterId`,
starting a campaign as a *different* golfer no longer destroys the existing one — it adds a slot. There
is simply no UI yet that lets you get back to the other one on purpose.
