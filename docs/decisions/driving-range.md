# The Driving Range — the tutorial (GS-driving-range)

**Where it lives:** `src/sim/rpg/drivingRange.ts` (rules + lesson copy, pure) ·
`src/sim/rpg/drivingRangeCourse.ts` (the three holes) · `src/app/rangeScreens.ts` (coach card,
upgrades row, Stableford panel, graduation card) · reducer cases `openRange` / `rangeDismissLesson` /
`rangeToggleUpgrade` + the range branch of `holeComplete` in `src/ui/game.ts`.
**Guarded by:** `tests/driving-range.test.ts` (pure) + `tests/driving-range-browser.test.ts` (built page).

## What it is

The title's game row had a greyed **"The Destination — Coming soon"** teaser under The Voyage. It is now
a live **🎓 Driving Range** tile: three lesson holes on Verdant Station with a coach who stops the player
at the moment each thing first matters.

| Moment | What the coach teaches |
|---|---|
| First full-shot decision | The aim cone (green = good strike, orange = hook/slice, red = duck-hook/shank), pull-to-power, tap Swing, the bag |
| First putt (wherever it happens) | Reading break with ◄/►, the pace meter's MAKE band, why long putts are hard |
| First decision on hole 2 (water on it) | Penalty strokes (water/lava/void, out of bounds), distance-costing lies, keeping the whole cone dry, ◎/🚩/🛟 and 🎯 |
| Every end-of-hole card | Stableford, taught against the score just made: the ladder lights the rung you landed on |
| First decision on hole 3 | Upgrades — this hole is played with wild range balls; fit Shank Guard etc. in the panel and watch the cone change |

It ends on a graduation card (`rangeResult`): the three-hole card in points, what was covered, and the
modes to try next.

## Decisions, and why

**It teaches the real game, never a simplified one.** The holes come off the live generator, the shots
resolve through the live sim, and the upgrades are the Pro Shop's own rows applied through their own
`apply`. The chips quote the SAME `SprayShape` the cone is drawn from (`previewShot(...).shape`), and the
Stableford ladder is built by calling `stablefordPoints`. Nothing in the lesson restates a number the sim
owns, so nothing can drift from it.

**Holes are chosen by JOB, never by pinned seed.** A seed is a picture of one `GENERATOR_VERSION`; the
first bump re-rolls it and the hazards lesson quietly runs on a dry hole. Each slot walks a deterministic
seed ladder and takes the first hole that passes its rule (short penalty-free par 3 · par 4 with water ·
straight, not-thin par 4), with a scored fallback so a future generator can never throw here. The test
asserts the JOBS, so a bump that breaks one fails loudly.

**Verdant Station** because it is the calmest world in the game (3–4 mph of wind), it is the parkland
the rest of the galaxy is a variation on, and it carries every hazard family the hazards lesson names.

**The wild balls are the range's, not the golfer's.** On the default shape a shank is 2% — a sliver of
red nobody would notice disappearing. `RANGE_BALL_SHAPE` widens every miss zone on the upgrades hole only
(kept under the sim's `MAX_MISS` cap so zones SUM rather than rescale, i.e. the quoted odds are the
honest ones). A source scan pins that no file outside `drivingRange.ts` names it: a teaching prop with
zero balance reach.

**One upgrade per miss zone.** Shank Guard (red right), Anti-Hook Grip (red left), Slice Corrector
(orange right), Hook Corrector (orange left) — so each chip maps to exactly one wedge of the cone and "turn
it on, watch that colour go" is one-to-one. The chips sit in the play frame's controls panel as a ROW (the
frame's own extension point — GS-hud-frame), so they are live between every shot rather than behind a card.

**It is never persisted and it pays nothing.** `runModeOf` → `null` (no slot, no CONTINUE pointer),
`resumeCost` → `practice` ("Nothing to lose — the Driving Range starts fresh"), `abandonCost` → `null`
(leaving already discards it — a second control would be the same button twice, the Asgard reasoning).
The last hole goes to `rangeResult` and never through `finishStop` / `runEndUpdates`, which is what
posts records and pays shards, so it banks nothing **by construction**, not by a flag. The ace takeover
gains a `practice` mode that celebrates without listing payouts it will not make, and the end-of-hole ace
note is suppressed on the range for the same reason.

**`getFormat('range')` returns its own row, kept OUT of `FORMATS`.** Like Asgard, the range has no
`FORMATS` entry (the title and the test hub iterate that table as "modes to offer"), and `getFormat`'s
fallback for an unknown id is the Unending Universe — so the first build of this wore Unending's
set-survival HUD ("need +4") on a tutorial. `getFormat` now answers the range with a private row
(3 holes, no gate, not winnable). The play HUD's score pod shows the running Stableford **points**
(the thing the end-of-hole card teaches), and the end-of-hole card drops the run header (credits, fuel,
handicap — numbers the lesson never explains). Asgard has the same fallback today; that is noted, not
changed here.

**The coach card is a sheet, a direct child of `#app`.** So the focus pass makes it the dialog, seals the
app with `inert`, and the arrow-key aim stands down while it is read. It waits its turn — never over a shot
animation, the shot-result card, a scramble pick, the club picker or settings. Back/Escape reads it as
"got it" through the same action its button dispatches (`BackContext.rangeLesson`), so Back can never
raise the leave-the-round confirm over an unread lesson. The backdrop does NOT dismiss it: a lesson a stray
tap on the map could close is one a beginner never reads.

**Lessons fire at a MOMENT, not a hole number.** `rangeLessonDue(hole, phase, seen)` returns the first
unseen lesson whose moment has come, in teaching order — so a player who auto-finishes hole 1 still meets
the putting lesson on the first green they actually putt on. The phase is the play screen's own putt
question (including a chosen fringe putt).

**Left-handed players get their own sides.** Lesson copy uses `{L}`/`{R}` tokens resolved by
`rangeText(text, lefty)`, because GS-lefty mirrors the cone and a lefty's hook flies right.

**The golfer is Feather Fade.** The tutorial comes before choosing anyone, so it uses the first name on
the roster rather than asking a beginner to pick blind.

## Follow-up round (play-test feedback)

**Every scoring format, one per hole** (`RANGE_SCORING`). Hole 1 is taught as **stroke play** (count
every shot, named against par — `scoreName`), hole 2 as **Stableford** (`stablefordPoints`), hole 3 as
**matchplay** against Longshot Larry. The rival plays the hole headlessly on its OWN `:rival` stream the
moment the tee comes up (a test plays it three extra times mid-hole and asserts the player's card is
unchanged), with proper balls — the wild ones are the player's teaching prop. Their line is drawn on the
map the way a Voyage boss's is, the result is the game's own `holeDuel`, and the HUD pod reads what the
hole's format counts (to-par / points / `AS vs Larry`). The match lesson card comes before the upgrades
card on that hole.

**The putting lesson waited for an invisible card.** A ball struck onto the green raised the shot-result
card flag, but that card only rides the AIM screen; on the putt screen the flag stayed set with nothing
drawn, and the coach (gated on the bare flag) waited until the first putt cleared it. The walkthrough
missed it because it ran with Fast Shots on, which skips the card. The gate now asks whether a card is
actually DRAWN in the current phase; a browser test with Fast Shots OFF asserts the lesson is up the first
time the putter is in hand (and fails on the old gate).

**"The Driving Range has opened!"** — a one-time inline announcement on the title (not a modal: news, not
a decision), for every device that has neither dismissed it nor been into the range by any door. Stored
as `Settings.rangeNoticeDone` in `fc_settings` (device-level, merged over defaults ⇒ no save bump, no new
key; PRIVACY.md's row names it). Held back during a save-integrity fault.

**Star Tour tile:** unchanged by this work. Its rule (GS-story-startour-unlock, July) hides it until a
Story campaign exists; staging is a separate origin with no campaign, so it is hidden there. A browser
test pins both halves of the rule.

## Round three: the wild balls were not wild enough

A play-test hit eight shots on the upgrades hole across two passes and saw ONE hook. The first cut
widened every zone a little (~57% clean), which left the lesson nothing to fix. Now the balls are
**~10% clean**, with the misses piled into the shank and duck-hook — the two zones Shank Guard and
Anti-Hook Grip delete OUTRIGHT, so one guard takes clean strikes 10% → ~45% and both → ~80%; the
correctors' −6% stays honest to their shop rows.

The sim caps total miss at 60% (`MAX_MISS`), so 10% clean was impossible. `ShapeMod` gained an
optional `missCap` that `applyShapeMod` honours and `combineShapeMods` carries (only emitted when a side
sets it, so every other combine is the same object as before). It flows through the one function both
the cone and `resolveShot` use, so the drawn wedge and the sampled shot still agree (contract 5).
Absent ⇒ byte-for-byte, and a scan allows `missCap:` only in `shot.ts` and the range module, because a
gameplay mode loosening the cap would be a fairness change.

## What happened to The Destination

Only the PLACEHOLDER tile went. The Destination is still a promise the Story Tour's Warden ending makes
(GS-the-destination in IDEAS); it lost a teaser slot on the title, not a plan.

## Open questions / next

- First-boot nudge: a brand-new device could be pointed at the range (e.g. a "New here?" chip on the title
  when no save exists). Not done — it is a separate decision about the title's first impression.
- The coach's copy is eyes-on content; re-read it after any control moves (the bag button, the aim modes,
  the putt meter) — the copy describes those controls by glyph and position.
