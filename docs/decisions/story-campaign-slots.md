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

---

# The picker (GS-story-campaign-picker)

Code: `src/ui/game.ts` (the entry flow + `currentRoster`/`storyCampaignTags`), `src/app/storyScreens.ts`
(`storyGolferPickerHTML` + the confirm sheet), `src/render/storyClubhouse.ts` (the badges),
`src/ui/back.ts`. Guards: `tests/story-campaign-picker.test.ts`. Eyes-on:
`scripts/campaign-picker-preview.mjs`.

## The golfer picker IS the campaign picker

Campaigns are per golfer, so *"which campaign?"* and *"which golfer?"* are the same question — and
answering it on one screen is what makes a second campaign discoverable at all. `openStory` therefore
**always** opens the Earth clubhouse now, instead of dropping straight into the hub, and each figure
wears a **campaign tag**: `Chp 3` · `Prologue` · `★ Complete`. Tapping a golfer who has a campaign
CONTINUES it; tapping one who doesn't starts theirs. Nothing is overwritten by picking.

Chapter 0 is deliberately never rendered as "Chapter 0" — it is the Earth prologue, and a zero there
reads as a bug.

The tags are **Story Tour only by construction**. The `character` screen is shared with Voyage,
Unending and Star Tour, so `campaignTags` takes a roster and the renderer takes the result as an
argument — a renderer that fetched the roster itself would badge golfers on every mode's picker.
Absent tags ⇒ no badges, so every other caller is byte-for-byte unchanged.

The badge also goes into the figure's **accessible name** ("…, In progress — Chapter 3"). It carries
real information; a screen-reader player must not have to open the card to learn it.

## The roster in `UiState`, and why the guard is in the reducer

The reducer is pure and saw only `state.story` — the ONE active campaign — so it could not answer
*"does this golfer already have a campaign?"*, which is exactly the question the overwrite
confirmation turns on. Gating that in the app layer would put the guard somewhere the reducer can
contradict, and **the guard protects a destructive write**.

So `UiState` gained `campaigns: CampaignStore`, hydrated at boot, and the rule lives in the reducer:

- `selectCharacter` under `pendingStoryNew` **can never overwrite** — it resumes an existing campaign
  and only creates for a golfer who has none;
- `storyRestartCampaign` **refuses outright** unless `storyOverwriteId` names that same golfer, so a
  surface that dispatches the create directly — a deep link, a future screen, a stale handler — gets a
  no-op rather than a silent wipe;
- and back **cancels** the confirm (tier 0 in `backIntent`, above the inspect card that raised it). A
  back press must never be able to destroy a campaign.

The sheet's copy is derived from `campaignOverwriteWarning` — the same pure function the reducer's
guard consults, already machine-checked to agree with what `upsertCampaign` really does — so it cannot
promise something milder than the write. For a COMPLETED campaign it says outright that the golfer's
**Star Tour character** goes with it, because that is the consequence a player would not otherwise
connect, and it adds "no other golfer's campaign is touched", because that is the reassurance the
roster earns. "Keep it" is the primary button: the safe choice is the fat one under a thumb.

## `currentRoster` — the one thing that stops the roster going stale

`state.campaigns` is a boot snapshot, and campaigns advance as you play. Mirroring every one of the
~190 `state.story` writes into the roster would be a standing invitation to forget one, so instead
every picker/badge surface reads:

```ts
currentRoster(state) = state.story ? upsertCampaign(state.campaigns, state.story) : state.campaigns
```

This is sound because **only one campaign can change while you play**: the active one, which *is*
`state.story`. Every other slot was loaded at boot and nothing can touch it until it becomes active.

---

# Champions (GS-story-startour-champions)

Code: `src/ui/game.ts` (`openStarTour` / `selectStarTourChampion` / `championRun`),
`src/sim/rpg/storyRoster.ts` (`championCampaigns` / `championRound`),
`src/app/starTourScreens.ts` (the picker, `yggdrasilArmed`, the Root), `src/app.ts` (the replay's battle
mount), `src/sim/rpg/strokePlay.ts` + `src/save/schema.ts` v31 (the record mark). Guards:
`tests/startour-champions.test.ts` + a browser layout smoke in `tests/build.test.ts`.

## The promise that outranks the feature

> **`starTourUnlocked` is a PERMANENT main-save flag and it remains the ONLY gate on Star Tour.**

A player who completed the campaign under the old single-slot save and then started over holds that flag
with an **empty champion roster** — the fresh campaign wiped its own `completed` flag, and there is no
record anywhere that they ever finished. They must still get Star Tour, on the classic default-loadout
flow. Champions are an *enrichment* of the mode; they are never a new gate on it. Written down here
because it is the one thing in this feature that is invisible until it is broken, and it is guarded by
the first `describe` in the test file rather than buried among the champion assertions.

## Champion select reads the ROSTER, never `state.story`

`openStarTour` used to resolve the champion as `state.story?.completed ? state.story : undefined`. With
one campaign that was the same question; with a roster it is a different one. `state.story` is merely
*whichever campaign happens to be loaded*, so a player with a finished Larry and a half-played Feather
would be told they have no champion at all. It now reads `championCampaigns(currentRoster(state))`:

- **0** ⇒ the classic character-first flow, byte-for-byte (see the promise above);
- **1** ⇒ straight to the map as them — there is nothing to pick;
- **2+** ⇒ the `starTourChampion` picker.

The chosen champion is written to `state.story`, so the ~190 existing `state.story` readers
(`championFreeRoam`, `tourShipId`, the Root) keep working untouched. That is safe precisely because of
the store's second trap: `writeStory` upserts by `characterId` and **does not move `activeId`**, so
free-roaming as Larry can never hijack the Continue of a Feather campaign left mid-chapter.

`championRun` is ONE builder for both entry paths, so a lone champion and a picked one are the identical
golfer. `selectStarTourChampion` refuses a golfer whose campaign is unfinished or absent — the guard is
in the reducer, like the picker's overwrite guard, so no surface can route around it.

## Yggdrasil: revealing the tree ≠ opening every branch

`yggdrasilArmed()` is now `champion || hammer` — the campaign ends at Yggdrasil's root, so a golfer who
has stood there knows where it is. The **hard hammer gate inside `playYggdrasilRealm` is untouched**,
which is what keeps Asgard behind the Asgard reward. That makes the two questions genuinely different,
so there are two functions: a champion-revealed tree renders Asgard as *Bifröst sealed* rather than
offering a button that `playYggdrasilRealm` would silently refuse.

## The Serpent at the Root

A champion's replay of the fight that ended their campaign, hanging beneath the branches because that is
where the campaign ended. The boss is the champion's own `alignment`: Warden ⇒ Jörmungandr, Herald ⇒ the
Warden Ark. `mountStoryBattle` already takes `won`/`loadout`/`shipId`/`herald` as options and had exactly
one production call site, so this is a **second caller, never a forked fight**.

**It is not a reducer action, and that is the design.** A replay must not touch campaign state — no
`winFinale`, no `starTourUnlocked`, no persist — and having *no action to dispatch* makes that true by
construction rather than by remembering. The outcome lands in `starTourView.serpentResult` (app-layer
view state, never persisted) and the recap returns to the **map**, not the title. It needs its own path
rather than a reuse of `openStoryFinale`/`engageStoryFinale` for a structural reason as well:
`finaleUnlocked` is `keyToOtherRealm && completed !== true`, so a finished campaign cannot re-enter the
real finale at all. It also needs its own **reduced-motion branch** — the finale's skips the cinematic by
dispatching `engageStoryFinale`, which is precisely the campaign write this must not do.

The Root is deliberately **not** a `YGGDRASIL_REALMS` row: that table describes places you fly to and
play golf on, and this is a memory you step back into.

## Records: describe, don't rank (save v31)

The open question this feature had to settle. `strokePlayBest` is per-COURSE and does not key on loadout,
so a champion with a full solar bag writes to the same board as a default-bag golfer. **Ranking is left
alone**, and a `champion` flag joins `characterId` and `tier` as description — the standing those two
already had (`tier` is documented as *"not part of the ranking"*).

Keying the board on the loadout was rejected because it cannot be done honestly. A champion **is** the
live campaign slot, deliberately, so that one who keeps shopping after the finale keeps improving — which
means there is **no stable loadout identity to key a board on**. You would be ranking a player against a
bag they no longer own. Splitting the board champion/non-champion was rejected for the same reason plus a
worse one: it fragments a record chase whose whole point is one best per course.

There was also a plain bug to fix while deciding it. A champion's run is built on `DEFAULT_BAG_TIER` with
the developed Story bag laid over the top, so `tier` stamps `common` on a golfer swinging a solar bag —
the board was not merely omitting the fact, it was **misstating** it. The ★ is what makes an out-of-reach
score read as explained rather than as a mystery. Old records simply lack the flag, which is the honest
"we don't know" for a round banked before the game recorded it; the migration is a pure version stamp.
