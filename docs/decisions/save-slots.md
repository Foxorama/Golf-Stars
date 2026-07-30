# Save slots — one run per mode, per golfer (GS-save-slots)

> **Status: DESIGNED, NOT BUILT.** This is the brief for the work, written while the analysis was
> fresh. Read it before touching `persist.ts`, `toTitle`, or anything that decides what "resume"
> means. One bug from the same root is already fixed (GS-story-switch-clobber, #662); the other is
> deliberately left for this redesign to subsume rather than patched twice.

## The problem, in one line

**There is ONE resumable run slot in `fc_save`, and four modes fight over it.**

`activeRun` is a single snapshot. Voyage, Unending, Star Tour and Story all write through it, so
starting anything discards whatever else was parked. The player's mental model — *"I have a Voyage
going with Larry and an Unending going with Bo"* — has never been true, and nothing on screen said so.

Story already solved this for itself. `fc_story` is a `CampaignStore`: one campaign per golfer, an
`activeId` pointer, `upsertCampaign` that touches one slot. **That is the shape the rest of the game
needs**, and GS-story-campaign-picker already made the `character` screen take its badges as a
PARAMETER precisely so every mode could use it. The groundwork is done; it was just never generalised.

## The two bugs this came from

Both are the same shape: **two places describing one decision, disagreeing.**

1. **`toTitle` clobbers the parked run with a Story round.** `persist.ts` is careful —
   `state.run.storyRound` and `ASGARD_FORMAT` both pass `state.resumable` through instead of
   snapshotting. `toTitle` (`ui/game.ts`) has neither check, so it overwrites `state.resumable`
   *itself*, and `persist` then faithfully writes it. Park a Voyage, play a Story world, hit Back to
   title — the Voyage is gone. **OPEN. Fixed by this redesign, not before it.**
2. **`storySwitchGolfer` wrote your prologue over the target's campaign.** The `chapter > 0` guard
   protected the campaign being LEFT, never the one being LANDED ON. **FIXED — #662.**

Bug 1 is the direct cost of the single slot: the "never let a Story round be the main-save resumable"
rule exists only because there is one slot to protect. Give each mode its own and the exception —
along with the two descriptions that disagreed — stops existing.

## The model

```
fc_save.runSlots    Record<`${mode}:${characterId}`, RunSnapshot>   // voyage | endless | startour
fc_save.lastPlayed  { mode, characterId }                          // mode MAY be 'story'
fc_story            unchanged — campaigns stay exactly where they are
```

**`fc_story` is deliberately NOT folded in.** It already has the right shape, its own migration, its
own cache, and its own backup handling, and it holds the longest progression in the game. Unifying
buys tidiness and costs a risky migration of the one blob you least want to touch. The other three
modes get the same shape; only the *pointer* is shared.

**Migration v32 → v33** is unusually clean: the existing single `activeRun` becomes one entry keyed by
its own `formatId` + `loadout.characterId`. Nobody loses anything. `fc_save` is already in the backup
bundle and the bundle carries the save's own `version`, so **no `BACKUP_VERSION` bump** — every backup
ever written still restores (GS-save-transfer).

### Title

CONTINUE reads `lastPlayed` and **names both**: *"Continue — The Voyage · Longshot Larry"*. It can
never drop a player into a mode they did not ask for, because it says which one before they tap it.
(The existing `.gs-resume*` chrome already frames this thematically — GS-continue-button.)

### Entering a mode

Mode → the golfer picker (the SAME `character` screen), each golfer badged with their slot **for that
mode**: `Stop 7` · `Hole 34` · `—`. Tap a golfer with a slot: continue. Tap one without: start theirs.
Start-new over an existing slot goes through the confirm, generalised from `storyOverwriteId` to one
slot id.

This is also the answer to the Story hub's duplicate buttons: continue / start over / change golfer
become the same three affordances on one screen in every mode, instead of three bespoke paths in one.

## The decided rule: resume at the hole you were on, in EVERY mode

Chosen over "resume at the start of the stop" because mixed rules are worse than any single rule — a
player who learns one mode's behaviour will lose a run in another. The machinery exists: `RoundProgress`
(`{stopHoleIndex, stopPlayed}`, GS-star-tour-resume) is currently gated to `STROKEPLAY_FORMAT`.

**Per-format proving is the real work**, and it is not just the hole index. Each format must restore,
or provably re-derive from the seed:

| Format | Also needs |
|---|---|
| Voyage stop | the competition field / cut standing, the route + weather already drawn |
| Matchplay boss | `match` state — holes up, closed out |
| Scramble / best-ball | `scrambleChoice` and the partner's card so far |
| Endless | the per-SET cumulative allowance, which resets on set boundaries |
| Story world | qualifier plan + team format (both pure from `campaignSeed`, so likely free) |

**A format that cannot be proven safe falls back to replaying the stop — and SAYS SO in the exit
confirm, in the same words as every other mode.** The uniform promise is what the player is owed; a
uniform *lie* is not an acceptable way to get it.

⚠️ The exit confirm (`exitPrompt`, GS-android-back) is currently the only place this is stated, and
the Story flow's own back paths do not route through it. Whatever the rule ends up being, every exit
must say it.

## Rules: kept, promoted, dropped

**Kept, untouched.** Determinism / zero extra rng draws, auto ≡ interactive, fairness by construction,
the death-spiral bar. This is a save-layer change and must not move a single seeded number — the whole
suite is the guard.

**Kept.** Versioned saves with one migration per step (`save/schema.ts`). This is a textbook case.

**Promoted.** The reducer-level overwrite guard, from story-only to universal. It was right; it simply
was not applied widely enough — which is exactly how #662 happened.

**Dropped.** *"A Story Mode world round is NEVER the main-save resumable."* It was a workaround for
having one slot to fight over, and it is the exception that let `toTitle` and `persist` disagree. With
a slot per mode there is nothing to protect.

**Non-negotiable, new.** There is ONE function that answers "what is this state's resumable run", and
`persist` and `toTitle` both call it. Two descriptions of that decision is the bug this whole document
exists because of.

## Sequence

1. **The slot table + migration** (v32 → v33), `runSlots` written and read through one seam. No UI.
2. **One resumable rule** — the shared function; `toTitle` and `persist` both call it. Bug 1 dies here.
3. **Title CONTINUE + the per-mode golfer picker**, badges passed in as GS-story-campaign-picker
   already allows. The Story hub's duplicate paths collapse into it.
4. **Mid-round resume per format**, one format at a time, each with its own test proving the restored
   state matches playing straight through. Any format that cannot be proven falls back and says so.

Steps 1–2 are safe to land without touching a screen; 3 is where it becomes visible; 4 is the long tail.

## What a fresh session needs

This file, and:

- `src/app/persist.ts` — `persist()` and `roundProgress()`, the current single-slot writer.
- `src/ui/game.ts` — `toTitle` (~2355), `currentRoster` (~228), and the `storyOverwriteId` guards
  around `selectCharacter` / `storyRestartCampaign` (~299–615) that become the universal pattern.
- `src/sim/rpg/storyRoster.ts` — the shape to copy (`upsertCampaign`, `campaignTag`,
  `campaignOverwriteWarning`, `migrateCampaignStore`).
- `src/save/storyStore.ts` — the read-modify-write + cache discipline the new table needs too.
- `src/sim/rpg/run.ts` — `snapshotRun` / `RoundProgress`.
- CLAUDE.md's save bullets, and `docs/decisions/story-campaign-slots.md`.
