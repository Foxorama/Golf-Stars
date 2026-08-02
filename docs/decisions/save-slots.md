# Save slots — one run per mode, per golfer (GS-save-slots)

> **Status: BUILT.** All four steps shipped in one pass — the slot table + save v33, the one
> resumable rule, the title CONTINUE + per-mode picker, and mid-stop resume in every parked mode.
> The brief below is preserved as written (it is still the best statement of *why*); **what actually
> shipped, and the three things the build learned that the brief did not know, are recorded at the
> bottom under "What shipped".** Read both before touching `persist.ts`, `toTitle`, `runSlots.ts` or
> anything that decides what "resume" means.

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

1. **`toTitle` clobbers the parked run with a Story round.** *(Now FIXED — see "What shipped".)*
   `persist.ts` is careful —
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

- `src/sim/rpg/runSlots.ts` — the pure slot table: mode derivation, keys, upsert/read/clear, badges,
  the overwrite warning, and the defensive re-keying migration.
- `src/ui/resumable.ts` — **the one function**: `resumableState`, plus `resumeCost`/`liveRoundProgress`.
- `src/app/persist.ts` — `persist()` + `metaFromSave`, both now thin mappers.
- `src/ui/game.ts` — `resume`, `toTitle`, `selectCharacter`'s overwrite guard, `buildMatch`,
  `modeSlotTags`.
- `src/sim/rpg/storyRoster.ts` — the shape this was copied from (`upsertCampaign`, `campaignTag`,
  `campaignOverwriteWarning`, `migrateCampaignStore`).
- `src/sim/rpg/run.ts` — `snapshotRun` / `RoundProgress`.
- `tests/save-slots.test.ts` — the guard. CLAUDE.md's save bullets, and
  `docs/decisions/story-campaign-slots.md`.

---

## What shipped

**The model, as designed.** `fc_save.runSlots` is `Record<'${mode}:${characterId}', RunSnapshot>` over
`voyage | endless | startour`; `fc_save.lastPlayed` is `{ mode, characterId }` and its `mode` MAY be
`'story'`. `fc_story` is untouched. Save **v33** removes `activeRun` outright rather than keeping it
alongside — two descriptions of "the resumable run" is the bug the version exists to close, and
deleting the field makes every reader fail to compile until it moves. The migration files the existing
snapshot under its own format's mode + golfer and points `lastPlayed` at it, so nobody loses a run and
a returning player's Continue button offers exactly what it offered before. No `BACKUP_VERSION` bump:
the bundle carries the save's own version, so every backup ever written still restores.

**The one function is `resumableState(state)` in `src/ui/resumable.ts`.** `persist()` and `toTitle`
both call it and neither re-derives anything — machine-checked by a source scan that also forbids
`snapshotRun` from reappearing in `persist.ts`, because building its own snapshot is exactly what let
the two disagree. Five cases, each a rule rather than an exception: Asgard parks `asgardReturn` (never
the tournament), a story round moves only the pointer, a finished run gives up its slot, a run with
nothing worth continuing leaves the slots alone, and anything else parks in its own slot.

**Three things the brief did not know:**

1. **`storyRound` has to outrank the format.** A Story world round is played on `STROKEPLAY_FORMAT`
   (it is a pinned static course), so deriving the mode from the format alone would file it under Star
   Tour — and a campaign round would overwrite a parked free-roam round. `runModeOf(formatId,
   storyRound)` checks the flag first.
2. **"Nothing worth continuing" had to become a predicate, not a special case.** Opening the star map
   builds a strokeplay run with a golfer and no course, and under the old single-slot code that
   snapshot silently overwrote the parked offer. `slotTag()` returns `null` for it — the same
   predicate the title card and the picker badge use — so all three agree about whether a slot is
   real, and merely opening a mode can no longer eat the run parked in it.
3. **A confirmed start-over must empty the slot THERE AND THEN.** Waiting for the new run to overwrite
   it is not the same thing: a fresh Star Tour run has no course pinned, so there is nothing worth
   parking yet and the old round would sit there — still offered — after the player had explicitly
   agreed to bin it.

**Step 4 landed in full, and the "prove it or fall back" table came out easier than feared** — because
almost everything a stop needs is DERIVED rather than remembered. The course comes from the run's own
seed/stop/theme/event; the cut and competition field are computed inside `finishStop` from `run` +
`stopPlayed`; the endless per-set allowance from `run.holesSurvived` + the same cards; `run.history`
was already snapshotted (GS-voyage-field); and the qualifier plan is a pure hash off `campaignSeed`.
The only genuinely stateful case was the **matchplay boss**, and `buildMatch(run, course, played)` —
now shared by `playInteractive` AND the resume, so they cannot drift — rebuilds it: the opponent from
the run, the boss's whole card from its own private `:boss` stream (never the play stream, so it is
byte-identical whenever rebuilt), and the duels by folding the cards the player actually banked.

⚠️ **`partnerHoles` is the one thing that cannot be rebuilt.** A best-ball partner's ball is drawn
from the PLAY stream, interleaved with the player's shots, and a resume reseeds that stream. It is
padded to the right LENGTH with the banked cards instead — bookkeeping only, because the reveal reads
`partnerHoles[holeIndex]` (always written fresh by `withBestBallPartner`) and the SCORES for finished
holes are already in `stopPlayed`, where the better ball was banked at the time. Without the padding
the array silently misaligns and every later reveal shows somebody else's card.

**Resuming on the hole is strictly LESS forgiving than what it replaced**, which is worth knowing
before anyone worries about save-scumming: the old rule replayed the whole stop, handing back every
hole. The new one keeps the card and re-tees only the hole in progress. The play stream is reseeded
(its position is not persisted), so the holes still to come draw a fresh dispersion stream — nothing
already banked is re-rolled, and the headless auto sim, the thing determinism is guarded for, never
takes this path.

**Every exit says the rule, in one sentence, from one place.** `resumePromise(state)` reads
`resumeCost`, and both the back-button confirm (`exitPrompt`) and the settings sheet's
return-to-title footer print it — the footer used to promise only a vague "continue it any time"
while the confirm beside it named the rule. Three honest answers: `hole` for every parked mode,
`world` for a Story round (the campaign is saved, the round is not — it owns no slot), `forfeit` for
Asgard. A uniform promise is what the player is owed; a uniform *lie* is not an acceptable way to get
one.

## Postscript: the third bug, found in play (GS-resume-slot-loss)

Reported as *"the issue seems to be related to the 'change golfer' option"* — which was exactly right.

`resume` emptied the slot it was picking up:

```ts
// The offer is consumed: the run is LIVE now, not parked. `persist` re-parks it from the live
// run on this very action, so the slot is refilled before anything can observe it empty.
const runSlots = clearSlot(state.runSlots, target.mode, target.characterId);
```

The second sentence is true. The conclusion does not follow. `resumableState` builds the save from
`state.runSlots` **plus the live run**, so that clear held only as long as the live run was still that
golfer's — and `‹ Change golfer` is the button whose entire job is to make it somebody else's. With
the entry already gone from the in-memory table, the next persist wrote a save with no trace of it:

```
park Larry ▸ re-enter the Voyage ▸ tap Larry (resume) ▸ ‹ Change golfer ▸ tap anyone else
                                          ↑                                      ↑
                              table loses Larry                    disk loses Larry
```

The clear was never load-bearing — `resumableState` upserts the live run into that same slot on every
persist, so the entry is immediately rewritten with fresher data. All the clear ever did was open a
window where the table said **less** than the disk.

**The invariant, stated properly:** `state.runSlots` is a faithful **superset** of the save — it may
lead it, never trail it. The table not yet holding a *fresh* run is fine (`resumableState` adds it, and
abandoning a golfer you just picked should cost their untouched stop-1 run). The table having *dropped*
something is never fine. Only two things may remove an entry: a confirmed start-over, and a run ending.

### Why the existing tests missed it

Every walkthrough in `save-slots.test.ts` reached the picker through `toTitle` — which folds
`resumableState` back into `state.runSlots` and **heals the table**. So the one route that reaches
character select with a live run (`backToCharacter`, gated to the intro at stop 0) was the one route
never walked. Two tests did assert the old behaviour directly, in `ui.test.ts` and
`startour-flow.test.ts`, both as `expect(runSlots).toEqual({})` with the comment *"the offer is
consumed"* — pinning the implementation choice rather than any property a player has. They now assert
the superset invariant instead.

A reducer test that asserts on `state.runSlots` alone is asserting on a cache. The helpers at the top
of that file exist for this reason: assert through `saved()`, which is what would be **on disk**.

## Postscript 2: the story exception, retired (GS-story-round-resume)

The rule at the top of this document — *resume at the hole you were on, in every mode* — shipped with
an asterisk. Story Tour was `'world'`: the campaign was saved, the **round** was not, so a world was
replayed from its first tee. That was an honest promise, stated in `resumePromise` and repeated
wherever it mattered, about a behaviour that was simply too harsh. Reported from play as *"too brutal
to stop playing halfway through 18 holes and then have to redo all of it"* — and the right response to
an honest promise nobody wants is to change the behaviour, not the wording.

`ResumeCost` is now `'hole' | 'forfeit'`. Asgard is the one exception left, and it is a real one: the
tournament run is ephemeral by design.

### Where the round lives, and why it is rebuilt

`fc_save` and `fc_story` were deliberately kept apart, and that hasn't changed — story still owns no
run slot. The round rides `StoryState.liveRound` (`STORY_VERSION` 8), with the rest of the campaign it
is part of.

It stores **what was chosen, not what was built**: the world, the partner, the hole reached, the card
banked. The run is then rebuilt by `buildStoryWorldRun` — the same function that tees one off — because
a story round is fully determined by the campaign plus those two choices. The qualifier plan is a pure
hash off `campaignSeed` + the world, the sky is a pure function of the world, and the loadout is folded
from the campaign's own gear and caddy. Same reason a parked run's course is rebuilt from its seed
rather than stored: nothing that is derived can drift.

One builder, two callers, and that is not tidiness — a second description here would resume you into a
different bag, a different sky, or a different **scoring format**, since the drawn qualifier format
decides how the card is even counted.

### The write, and the lesson taken from three hours earlier

`campaignWithLiveRound` is the `fc_story` twin of `resumableState`, and both writers call it:
`persistStory` (every action) and `toTitle` (folding the answer back into live state).

That second caller is the whole point. Writing the round to disk while `state.campaigns` said otherwise
is *precisely* GS-resume-slot-loss, fixed the same day — the golfer picker reads state, so a round on
disk that state doesn't know about is a round the Continue button cannot see.

### Three floors

- A finished or abandoned round **removes** the field. A stale offer would re-tee a world you walked off.
- A `liveRound` whose hole the rebuilt course cannot serve falls back to the hub. A `GENERATOR_VERSION`
  bump re-rolls a static course, and a tee that cannot be built must never strand a campaign.
- A malformed persisted `liveRound` degrades to no round — the pre-v8 behaviour, which is the right floor.

No `BACKUP_VERSION` bump: the roster's shape is unchanged. A v8 campaign meeting a v7 build is refused
loudly by `campaignStoreTooNew` rather than silently truncated, which is exactly the case
GS-save-integrity shipped for that morning.

---

## Postscript: the other exit (GS-leave-round, 2026-08-02)

### The hole this feature dug

GS-save-slots gave every mode its own parked run, and GS-story-round-resume gave a campaign its own
live round. Between them they made the game very good at never throwing anything away — and left no
way to throw anything away.

The report:

> *"Because of the save changes there's no way to finish a round now without restarting a new game
> mode. Which, y'know, not so bad for The Voyage and Unending Universe, but for Story Tour, once you
> start a round, either on purpose or on accident, there's no way to back out."*

That reading is exactly right, and the Voyage/Unending caveat is right for a reason worth writing
down: those two have `bank` (GS-bank), a voluntary cash-out at the travel screen, so they always had
*an* ending. The other two had none.

- A **Story world round** teed off by accident put a `liveRound` on the campaign, and
  `storyContinueCampaign` rebuilds it on every entry. The only control that could clear it was
  `storyRestartCampaign` — which destroys the whole campaign. The escape hatch cost more than the
  thing being escaped.
- A **Star Tour round** you had lost interest in was parked in its slot and offered back for ever.
- And there was no way at all to say *"I am finished with this run"* mid-stop.

### Two exits, and they must say different things

`resumeCost` answered "what does parking cost" and every exit surface read it, because parking was
the only exit. So the shape of the fix is its twin:

| `abandonCost` | when | what it does |
| --- | --- | --- |
| `'world'` | a Story world round | campaign keeps everything; only the round goes, and the world can be flown back to |
| `'round'` | a Star Tour round | discarded, posts no record |
| `'run'` | Voyage / Unending | ends here, pays out nothing |
| `null` | Asgard | **no separate control** — leaving already forfeits (`resumeCost` says so) |

The discrimination is `runModeOf`'s, in the same order and for the same reason: a story round is
played on the strokeplay format, so `storyRound` has to be asked first or a campaign round is filed
as a Star Tour one and offered the wrong sentence.

`abandonTarget(state)` is the ONE predicate — it renders the settings row, words the confirm, and
guards *both* reducer cases, so a forged action can never reach a destructive write the UI would not
have offered. It also excludes a Star Tour golfer standing on the chart with no course pinned, which
is the same judgement `slotTag` makes about whether a parked run is worth offering back.

### The verb changes when the thing changes

A Voyage stop is four holes inside a run with no smaller unit to leave. Calling its control "Leave
the round" would be a lie about what the button does, so it says **Give up this run** — and the
confirm and its button follow. `abandonPrompt` returns label, body, title and confirm label as one
`AbandonCopy`, so a renderer cannot take the label without the matching promise.

### Two writes, one description each

- **`'world'`** clears `play` and re-reads `campaignWithLiveRound`, rather than editing `liveRound`
  itself. That function is the one description of what a campaign parks and it reads the live state;
  editing the field here would be the second description. The answer is folded back into
  `state.campaigns` in the same action — writing one and not the other is GS-resume-slot-loss in the
  campaign's half.
- **`'run'`** marks the run `ended` and delegates to `toTitle`. `resumableState` already empties the
  slot of a run that is not active — the same rule that retires a finished one — so this adds no new
  path to a destructive write, and `toTitle` keeps owning every field that has to be cleared on the
  way to the title rather than having them re-listed.
- **`'round'`** clears the slot explicitly and rebuilds a fresh strokeplay run for the same golfer, so
  the chart's flight and pick machinery has something clean to work on and nothing is left to
  continue.

### Nothing is banked, structurally

`leaveRound` never calls `runEndUpdates`, which is the only thing that posts a record or pays a
shard. `EndReason` gains `'abandoned'` so `status: 'ended'` is never reasonless — and note that
`cashOutShards`'s keeps-credits test is an ALLOWLIST, so a new reason lands on the safe side by
default. Two locks, one of which was already there.

### Where it lives

The settings sheet's footer, above Return to title — the safe exit stays nearest the thumb — as a
full-width `.gs-setrow` rather than a More tile, because it has a whole sentence to say before it is
tapped (GS-settings-more, which was done first to make the room). Back/Escape **cancels** the confirm
like every other tier-0 layer, and that matters more here than for its twin: `cancelExit` merely
keeps you in a round you were going to park, where a stray second press on this one would throw a
round away for good.

### No register row, deliberately

`abandonPrompt` has two renderers and `abandonTarget` has three callers, so the admission rule is met
— but neither candidate pattern survives the header's other rule. A literal scan for the copy would
not catch the actual failure mode (somebody typing *different* words on a third surface), and banning
the mode discrimination outside `resumable.ts` would flag the many legitimate reads of `storyRound`.
The behavioural guard is that the row's sub-line and the confirm's body are the same field of one
object, which `tests/leave-round.test.ts` asserts. A brittle row or a crying-wolf row is worse than
no row; `resumePromise`, the older and more load-bearing twin, has none for the same reason.

### Guard

`tests/leave-round.test.ts` (pure, 15 cases): the cost per format including Asgard's `null`, the
three nothing-to-give-up cases, the verb rule, back cancelling the confirm, and a walkthrough per
mode — a Story round handing the campaign back whole with a parked Voyage untouched, a Star Tour
round posting no record and emptying its slot, a Voyage run paying out nothing. The browser half is
in `tests/settings-sheet.test.ts`: the row is absent on the title, present mid-run naming the *run*,
raises a confirm without leaving anything, and "Keep playing" really keeps you playing.
