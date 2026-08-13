# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — **not append-only.** This file tracks **open
work**. Stable IDs, never reused. When something ships it collapses to a one-line **Done** entry (link the
PR/report); the full story lives in `reports/` + `docs/decisions/` + git, never here. Bad → **Dropped** (say why).

## Avenue decision (settled for now)
What wraps the golf: the **Voyage** is the winnable campaign and the **Unending Universe** (GS-unending)
is the endless survival mode — the old `flat`/`ladder` roguelites are retired (their machinery lives on
under the new format). Avenue (1), a full top-down RPG shell, stays deferred until the loop is exhausted.

## Now / next

> **THE 1.3.0 PLAY-TEST ITEMS ARE ALL DONE** — GS-runout-seen, GS-fairway-ink-break,
> GS-clubhouse-floor and GS-scene-isolate have shipped (see Done). The entries below are the
> standing backlog, none of them release blockers.


**GS-ui-display-wide — the flow screens are bigger now, but still islands** *(the follow-up
GS-ui-display-scale deliberately left; see `docs/decisions/accessibility.md`)*
The display scale multiplies the caps, it does not remove them: `.gs-main` is 820 LAYOUT px and
`.gs-strres` 460, so at 1920x1080 the Star Tour recap went from 24% of the width to **31%** — better,
and still a column in the middle of a desktop. Every screen that would genuinely use the room wants a
per-screen composition (a two-column recap, a wider board, a shop rack that grows a column), which is
a different job from a scale and should be taken screen by screen with eyes-on, not as one sweep.
Related but separate: **GS-embed-letterbox** below is about what sits BESIDE the play frame; this is
about what sits beside the menus.

**GS-embed-letterbox — mostly ANSWERED by GS-space-sky; what is left is a much smaller question**
*(surfaced by the 2026-07-31 itch-embed layout sweep; downgraded 2026-07-31 after re-measuring the
built embed while shooting `scripts/screenshots.mjs`)*
The entry was written against a letterbox that was **bare `--gs-bg` with the body vignette**, i.e. it
read as a broken embed. GS-space-sky (#682) landed after that sweep and put the seeded star tile on
`body` — so on the itch embed's default desktop viewport (820×760) the ~210px either side of the
395px play strip is now **dressed space, and the same sky as the store page background and the
banner** (GS-itch-page-sky). Verified on the built artifact at 820×760; it is what the shipped store
screenshots show, undoctored. Shape (a) is therefore delivered in its cheap form.
What is still open, and it is minor: the strip is the GENERIC page sky, not the world's own
sky/nebula palette bleeding out of the hole — so an ember world and an ice world letterbox
identically. Also still open: (b) put something there on a wide container (the shot card, the
scoreboard, the caddy).
**Do NOT "fix" this by removing the aspect cap** — `mapFrame()` grows the 360×640 design frame to the
CONTAINER's aspect (GS-play-fullframe), so an uncapped wide container yields a wide camera and every
shot reads as over-zoomed, which is exactly why GS-play-desktop-frame introduced the cap. (c) a
modestly wider camera at wide aspects remains a **physics-adjacent readability change** needing
eyes-on play plus a re-look at `clearOfPanelBias`/`playFocusBias` (GS-play-hud-space) — not a CSS tweak.

**GS-a11y-bridge-idpod — the travel bridge loses the golfer's name at a large scale** *(surfaced by
the 2026-07-26 mobile-layout sweep; the one thing it left visibly wrong)*
`.gs-bhud__idpod` is a fixed-height pill holding `🚩 <name>` + a `white-space: nowrap` "Hole n" chip. At
the top UI-scale rung the chip wins the space and the name ellipsises to nothing — you cannot see which
golfer you are flying as, on their own bridge. Letting `.gs-bhud__who` wrap was tried and rejected: the
name spills below the pill's rounded frame and reads as a rendering fault. It wants a real layout pass on
the pod (a two-line pod at a tight fit, or the progress chip moving into the stat pod), plus a browser
assertion that the name's `scrollWidth` fits its box at every rung. Small, self-contained, needs eyes-on.

**GS-a11y-putt-assist — the pace meter has no alternative** *(surfaced by the 2026-07-26 accessibility
sweep; deliberately NOT done there, because it is a balance change wearing an accessibility hat)*
Putting is a 1250ms sweeping canvas meter you must stop at the right moment (`render/puttMeter.ts`,
`period = 1250`). There is no slower mode, no wider band, no alternative input — so it is a hard timing
gate on every hole for anyone with a motor or cognitive impairment, and the one part of the game the
keyboard/aim work (GS-a11y-keyboard) could not open up.
The machinery for a fix already exists: `takePutt(…, control?)` takes an auto-resolved control, which is
how the **Penelope Putter** caddy plays. So the shapes are (a) an accessibility setting that routes to
that path, (b) a slower `period`, or (c) a wider make band.
**Why it is not done:** every one of those makes putting easier, i.e. it is a difficulty change, and this
repo measures those (contract 4: no death spiral; a power-up must *raise* mean per-stop Stableford to
ship). It needs a death-spiral harness run and a call on whether an assist should also cost something
(shards? a Stableford asterisk? nothing?) — a design decision, not a mechanical one. Do NOT let it in
under an accessibility banner without the harness.

**GS-a11y-shot-aim-tell — the shot arrows are shipped, tested, and invisible** *(surfaced 2026-07-30,
when the author of the feature did not know it existed)*
Every full shot has aimed on ←/→ and powered on ↑/↓ since GS-a11y-keyboard (`app.ts`, `onPlayKey`),
guarded by `tests/a11y-keyboard.test.ts` including a real-browser drive. Nothing on screen says so.
GS-hud-bag deleted the aim panel — correctly, it restated what the cone already draws — and with it
went the last hint that the shot has an aim at all; the map itself is the affordance, and a map is a
pointer affordance. The tell was only missed because the game was played on a phone. **A keyboard
player's first shot looks like a game with one button.**
The gap is discoverability, not capability, so the fix must not become the readout GS-hud-bag
removed: a permanent on-screen hint riding every shot forever is the wrong shape. Candidates, none
costed yet — `aria-keyshortcuts` on the Swing button and the bag (what GS-a11y-putt-arrows did for
the putt, zero visual cost, reaches exactly the players who need it); a first-run-only hint that
retires itself once an arrow has been pressed; a line in the settings sheet beside Readable text and
Reduced motion, where a keyboard player would go looking; or a hint that appears only when a Tab
press reveals a focus ring, i.e. only for players already driving by keyboard.
Deliberately **not** bundled with the putt arrows: that was one mechanic reaching parity, this is a
UI-surface decision with four viable shapes and a rule to respect.

**GS-sw-version-derive — the service worker's VERSION is the last hand-bump in the release**
*(surfaced by the 2026-07-30 release-pipeline pass; the one checklist line that pipeline could not
delete)*
`public/sw.js` carries `var VERSION = 'fc-pwa-1'` with a `// bump per deploy` comment. Everything
else in the release now derives from `package.json` — `APP_VERSION` through a Vite `define`, the boot
watchdog through the `%GS_VERSION%` placeholder, the itch build through the tag/package assertion in
`.github/workflows/itch.yml`. This is the last constant somebody must remember, and GS-release-identity
already established that such a constant eventually lies. Forgetting it means returning offline players
keep the previous snapshot one boot longer — not fatal, which is exactly why it will keep being
forgotten.
**Why it is not a quick win.** `public/` files are copied VERBATIM by Vite; substituting into one
needs a small plugin (the `transformIndexHtml` trick doesn't apply). And this is the highest-risk file
in the repo: the cache PREFIX is one decision written in three places that cannot share a constant
(`sw.js` ×2 + index.html's foreign-cache sweep), guarded by `tests/brand.test.ts`, and getting it
wrong makes the page delete its own offline cache every boot while believing it is tidying up after a
sibling app. The VERSION suffix is a *separate* string from that prefix and only the suffix should
move — a pass that conflates them re-creates the exact bug the three-place guard exists to catch.
Wants its own PR with a test that the built `sw.js` carries the package version.

**GS-ball-radius-band-stale — `shot-frames.mjs` asserts the ball bounds GS-ball-art moved**
*(surfaced 2026-08-01 by GS-preview-chromium, the first time this rig had ever run on Windows)*
`scripts/shot-frames.mjs` pins `R_FLOOR = 3` / `R_CAP = 5.5` and calls them "the documented drawn-ball
bounds (GS-ball-art)". They are the PRE-shrink bounds: CLAUDE.md's GS-ball-art bullet now documents a
2.25px floor and a 3.3px cap, after the ball was reported too big twice and came down ~25%. Measured
in the built game the rig reports **2.25–3.34px**, so it fails its own check on every run — the floor
and cap are both stale, and the observed maximum sits a hair over the documented 3.3 (probably the rim
hairline, which is stroked ON the silhouette, but that is a guess and the point is that nobody has
checked).
**Not fixed in the Chromium pass on purpose**: it is an assertion about an ART constant, and the two
honest resolutions — re-pin the rig to 2.25/3.3 with whatever tolerance the rim actually needs, or
decide the drawn ball has drifted off its documented cap — are a judgement call that wants eyes-on and
the `scripts/ball-preview.mjs` sheet beside it, not a number quietly changed to make a red check green.
Worth doing soon: it is the only rig that self-checks rather than just drawing, so it is the one whose
red actually means something.

**GS-a11y-charcard-nesting — the golfer card is invalid interactive HTML** *(small, but touches a
viewport-locked screen)*
`.gs-charcard` is a `<button>` containing `<p>`, `<div>`, and — since GS-a11y-focus — a focusable
`role="button"` portrait. Nested interactive content is invalid, and `<button>` may only hold phrasing
content. It works in every current browser and is now keyboard-operable, so this is correctness and
future-proofing, not a live bug.
Fix shape: make the card a container with a stretched select-`<button>` behind its contents (`position:
absolute; inset: 0`) and the lore portrait a real sibling `<button>` above it in z-order. Deferred
because character select is viewport-locked to one mobile screen (GS-select-onescreen) and the
restructure deserves its own pass + a layout smoke test rather than riding along with an a11y sweep.

**GS-default-aim-full-swing — the pre-armed club is chosen for a full swing it may not want**
*(found while finishing GS-carry-roll-real; the residual after that pass, not a regression from it)*
`autoAimClub` now refuses any club whose FULL flight lands in a penalty, so the pre-armed default is dry
by construction (measured 0 wet landings across 3,072 par-4/5 tee shots, down from 22/1,083 before). What
it still does not model is POWER: on a lay-up it arms the longest club that stays dry rather than a full
club dialled down, which is the shot a player would actually pick. The power seed is already per-shot
(`autoShotPower` does exactly this for the auto sim), so the fix is to let the default pick a
(club, power) PAIR instead of a club. Deliberately left out — it changes the pre-armed power on shots
that are currently fine, so it wants its own pass and its own eyes-on.

**GS-chipin-trickle-phase — a holed chip-in still kinks where its trickle joins the roll**
*(found while fixing GS-roll-hairpin; the only path hairpin left, and it is a deliberate old choice)*
GS-chipin-roll appends a curling trickle to the cup and decided to walk it straight through — "the ball
going in beats the check drama". Measured: every remaining >40° drawn kink is a `chipIn && holed` shot,
27 of them, up to 153°, where the natural roll meets the trickle at an angle. The creep now has the
treatment that would fix it too (stop, beat, slow trickle — `ShotLog.creepFrom`), so this is a small
change: give the trickle its own phase off the same seam. Left out because it is a celebration moment
nobody has complained about, and reversing that call deserves its own eyes-on.

**GS-creep-friction — the creep stops because its budget ran out, not because the slope did**
*(measured while fixing GS-creep-fallline; the "could flow slightly better" half of that report)*
`CREEP_MAX` is a flat 5 yards, and measured over 753 real creeps (`scripts/creep-census.ts`) **66% of
them halt on that budget rather than because the ground flattened or the collar caught them** (61.7%
before GS-creep-fallline — it is pre-existing, not introduced by it, and the fix only nudged it because
the creep now follows the plane, which does not flatten). So the ball trickles down the hill and stops
dead mid-slope for no reason the player can see. What actually stops a real ball is friction beating the
slope, so the honest shape is a decelerating creep whose LENGTH falls out of the steepness it was shed
onto — a ball off a savage bank onto a gentle plane runs a couple of yards, one on a genuinely steep
green keeps going to the collar. Left out because it is a second physics model on the same phase, it
changes rest positions on every contoured green (so it needs the death-spiral harness and probably some
fixture re-pins), and the reporter explicitly ranked it "not the worst thing in the world" against the
wrong-way bug. Cheap interim if it reads badly in play: the drawn creep already eases to a stop
(`creepMsPerYd` smoothstep), so raising `CREEP_MAX` alone would just move the invisible wall further out.

**GS-auto-ai-weak — the headless auto sim is far weaker than a human, and it gates everything**
The auto sim stalls around hole 40 of the Unending Universe; human players reach 350+. Every balance
harness in the suite measures THAT player, so the fences are calibrated to a weak one and have twice now
been mistaken for statements about the physics (see contract 4). Worth its own pass — richer reach-AI,
play-back-to-fairway recovery, better club selection — after which the fences can be re-derived and
tightened honestly. Until then: fences move, physics doesn't.

**GS-knockdown-tunnel — the tree collision walks in steps wider than the trees** *(measured while
shipping GS-flight-shape; deliberately left out of that PR)*
`flightBlockedBy` samples the flight at a fixed `steps = 22`, which on a 250yd drive is an 11-yard
stride — wider than the median tree blob (radius 4.8yd, p10 3.6). It steps straight over trees. Measured
over 3,821 clean-flight shots, raising the walk to 176 steps finds a clip on **3.85%** of the shots the
22-step walk let through (converged: 44 → 2.28%, 88 → 3.09%, 176 → 3.59%, 352 → 3.85%). This is a
contract-5 hole in the direction of leniency — a ball drawn passing through a canopy that the sim let
by — and it predates GS-flight-shape; that change only altered which shots tunnel, not whether they do.
Fix shape: step by DISTANCE, not by a count (`ceil(carry / ~4yd)`, clamped), or test the step SEGMENT
against the blob rather than its endpoint. Not free: `sprayBlocking` probes hundreds of candidate
landings per hole through the same function, and closing the leniency makes the wooded worlds harder
again — so it wants the death-spiral harness. (It also wanted `GS-aim-tree-aware` alongside it, which
has since shipped — see Done — so that half is in hand: the default aim and the 🛟 escape both consult
`flightBlockedBy` now, and both would automatically get stricter with the walk.)

**GS-green-surface-bite — non-penalty hazards eat the putting surface** *(found while building
GS-green-backstop; real, measured, deliberately left out of that PR)*
`lieAt` gives HAZARDS precedence over FEATURES, so any hazard blob overlapping the green polygon turns
that slice of the putting surface into its own lie. `clearGreenOfPenalty` only drops **penalty** blobs
(GS-green-clear, the ice/lava-on-the-green fix) — nothing stops a bunker, pot, deep-rough, fescue or tree
blob from biting a piece of the green. Measured across 1,080 generated holes (10 worlds × 12 seeds ×
9 holes, wildness 0.6): **21.9% of holes carry at least one non-penalty blob poking the putting surface**
— `deeprough` 73, `pot` 59, `bunker` 64, `fescue` 57, `trees` 46, `waste` 4. A tree lie ON the green is
the worst of them. The pin and green centre are still clean (`tests/lie.test.ts` guards those), so this
reads as an edge bite rather than an unplayable hole — which is why it has gone unnoticed.
Fix shape: extend `clearGreenOfPenalty` into a general `clearGreenSurface` post-filter (still pure,
zero-rng, still DROP-only — dropping can only raise Stableford, per the same argument the existing filter
makes). The open question is the drop RULE: dropping a whole greenside bunker because a sliver overlaps
would delete a lot of legitimate greenside sand, so it likely wants an overlap-AREA or vertex-fraction
threshold, or a trim rather than a drop. Wants its own PR + a balance re-measure.

**GS-hud-frame-2 — the frame's remaining polish** *(follow-on from the shipped frame, small)*
The persistent frame landed (see Done). Left on the table, all cosmetic and none blocking:
- The controls panel's TOP edge still rises on the putt state (a pace meter is genuinely taller than a
  power bar), and since GS-hud-bag the aim states have NO panel at all, so the step is now from a pill to a
  full panel. GS-putt-panel took ~40px off that step; the floor is fixed either way, which is what keeps the
  buttons still. Closing the gap entirely would mean a designed empty gauge slot on the aim states — paid
  for in map. Wants eyes-on play before deciding it's worth the pixels.
- Landscape / tablet has had no pass: the frame is phone-portrait tuned.
  *(The "top info bar is four lines" bullet is retired — GS-hud-compass made it one row of pods.)*

**GS-shot-lag-pan — the follow-cam still rebuilds and repaints the world every frame** *(follow-on from
the shipped GS-shot-lag, medium, changes drawn output)*
GS-shot-lag fixed the STILL camera (putt watch 3.3 → 59.9 fps at 12× throttle) and the tail of every shot,
by blitting a cached paint of the scene while the projector is unchanged. While the ball is MOVING the
scene is still rebuilt and re-stroked every frame — ~100,000 canvas ops — which is why the shot watch is
30 fps and not 60. The case for fixing it is measured (`scripts/scene-pan-check.ts`): under a pure pan the
projector differs only by a screen-space translation, and **99.84%** of prims are either screen-anchored
(byte-identical — the sky) or an exact rigid translation (37,896 translate, 6,160 anchored). Only **70 of
44,126** are neither, and they are all the mow-stripe `clip` groups (regenerated across the clip's screen
bbox) plus the `inView`-culled ground detail. So a translate-and-blit cache is *nearly* exact — and would
arguably look BETTER, since stripes would ride the turf instead of the screen — but it is not exact, it
changes drawn output on every world, and it needs the `camera-stability` contract rethought and eyes-on
across the gallery. A feature of its own. Do NOT bolt it onto a perf PR.

**GS-scene-prim-weight — 100,000 canvas ops to paint one hole** *(diagnosis done, no fix scoped)*
The number GS-shot-lag surfaced is worth attacking at the source rather than caching around: a green at
the putt camera resolves ~100k drawing operations, most of them inside `clip` groups (mow bands, apron
rings, isolines, relief). Even one paint of that is a visible hitch on a phone at the moment a shot is
released. Worth a census of which painters dominate (`scripts/paint-census.mjs` samples by call site) and
whether any of them can be drawn as a pattern/sprite rather than N strokes. Balance-neutral by definition
— it is pure render — but it is an art-fidelity conversation, not just a perf one.

**Deferred out of the 2026-07-25 quick-win batch** (both looked small, both are bigger than they read):
- **GS-story-briefing-beat** — the first-visit Parrot briefing currently advertises itself with a gold ❗ on
  the bar hotspot (`storySpaceport.ts`, gated on `chapter <= 1 && !seenStoryBeats['story-bar-briefing']`),
  borrowing the QUEST-marker idiom for something that is not a quest. Player wants it to present as a LORE
  BEAT instead. Not a one-liner: `withLoreGate` wraps stop-INTRO arrivals, so firing a beat on a CLUBHOUSE
  arrival needs either a new gate surface or a `storyMidBeat`-style divert. Design call, then plumbing.
- **GS-story-inspect-flicker** — swapping golfer at a qualifier, and choosing "another" in the clubhouse
  inspect overlay, both flicker hard. Same root cause as GS-settings-flicker: the action falls through to a
  full `render()`, which replaces `app.innerHTML` and replays every mount animation. Fix is the documented
  surgical-refresh pattern (`refreshSettings` is the model — swap the overlay's innerHTML + re-wire), but it
  means routing specific actions around the normal dispatch→render path, which wants care rather than a
  rushed end-of-session patch.
- **Putt-watching renders INSET** — black margins on three sides while every other state is full-bleed
  (seen in the play-test screenshots, not yet reproduced). May share a cause with the chuggy watching view.
  Confirm reproducibility first.
Foundations are shipped; these are the live follow-ons.

**GS-story — Story Mode (the big one; systems roadmap in `docs/decisions/story-mode.md`, narrative canon in
`docs/decisions/story-bible.md`)**
Turn Star Tour into a standalone story-mode campaign, reusing the golf engine + content but forking the
meta layer into its own persistent progression (`StoryState`, `gs_story` save). Voyage/Unending/Clubhouse/
Trade Market stay frozen. Story: the Fairway Wardens (Parrot/Mothership) vs **the Coil** (Sinister Snake
Cult) racing to wake Jörmungandr; 5 Galaxy Tournaments (Lyra→Orion→Draco→split→Hydra Mire) → the Green Key
→ a Cthulhu-serpent SPACE BATTLE at Yggdrasil's root. A mid-story **CHOICE** (stay Warden / join the Coil)
forks into two DISTINCT world-routes (Warden void/crystal/frost vs Herald ocean/derelict/cetus) — different
NPCs, tournaments, cursed-relic vs Warden gear, ships, and ending; the Herald even crushes former allies
Dan & Penelope. Real divergence, still interconnected (shared shrine, cast reversed) — for replay value.
Ships user-facing as **"Story Tour"**; **Star Tour is the reward** — unlocked once the campaign is complete
(`storyComplete` = the `completed` flag OR all five Sigils). Every tappable item/world/relic/ship raises a
**lore card** (`GS-story-lore-cards`); new content ships with detailed flavour. Built as **chunks**, one
focused tested auto-merged PR each:
- **GS-story-save** — ✅ *model + `gs_story` persistence + New Game/Continue + hub shipped*. The spine.
- **GS-story-startour-unlock** — ✅ *rename Story Mode → "Story Tour"; Star Tour tile hidden→locked→open, gated on `storyComplete`.*
- **GS-story-lore-cards** — ✅ *foundation shipped* (`render/loreCard.ts`): reusable tap-to-inspect card (art + name + detail + composed lore + action). First consumer: the Pro Shop. Gear/ship/relic reuse it.
- **GS-story-prologue** — Earth final round (`standrews-18`) → win/victory → Mothership → Parrot recruit → story intro → Clubhouse.
- **GS-story-econ** — ✅ *shipped*: per-world Pro Shop (themed Planet/Phoenix/Solar clubs, lore cards), spend credits, buy→equip into the green bag, revisit (play again / pro shop). The green bag now tees off.
- **GS-story-clubs** — ✅ *shipped* (buy via econ; equip/bag-swap via the locker below).
- **GS-story-gear** — ✅ *shipped*: effect-bearing glove/cap/shoes/ball in the Pro Shop, folded at tee-off (Story-only). Cursed-relic pass is later.
- **GS-story-locker** — ✅ *shipped*: campaign locker — bag builder (equip/unequip owned clubs, ≤14) + gear slot-switch, every item tappable → lore card. Caddy roster waits on a caddy shop.
- **GS-story-gear** — equippable gear WITH effects (gloves/hat/shoes/bag) via `PlayerLoadout` no-op-default fields; the **cursed sheddings** (power + a curse) vs Warden grace; Inventory screen.
- **GS-story-ships** — ✅ *shipped*: spaceport Shipyard — buy/fly the fleet; a scattering of acquisition (buy/milestone/ace/secret) + a credit-earning bonus per ship; every ship → lore card.
- **GS-story-ship-upgrades** — ✅ *shipped*: the outfitting bay — weapons/engines/shields raise a Combat Rating (finale-battle prep, the Parrot nags), engines also give a live credit bonus; every upgrade → lore card. The finale reads combatRating.
- **GS-story-locker** — Story locker/wardrobe variant + per-character equipment screen + caddy roster (hire→keep→choose, no fire).
- **GS-story-map** — worlds gain locked/unlocked/cleared states; chapter-gated unlocks; difficulty-scaled world choice.
- **GS-story-map-nav** — ✅ *shipped*: the star map now SURFACES the three campaign pulls (they were all funnelled through the clubhouse — "unclear, can't find anything"). Each charted world glyph wears a MARKER pill — 🏆 SIGIL (gold+pulse when qualified, dim when locked, ✓ won), ❗ QUEST (accept/go, with a call-ring), 🏁 QUALIFIER (○/✓) — plus a qualifier bottom flag; the world DOSSIER gains actionable sections: accept & fly a quest (`storyStartQuest`), enter the Sigil directly (`openStoryTournament` from the map, returns to the map), and the qualifying top-N bar + your standing. Pure `storyWorldNav`; no save bump.
- **GS-story-tournament** — ✅ *framework + winnable trunk shipped*: one Galaxy Tournament per chapter (unlock by clearing chapter worlds) → beat the rival (Venoma, scaled ghost) → Sigil → chapter advances → next worlds unlock; 5 Sigils = the KEY. Clubhouse banner → lobby → win/lose recap. Deferred: qualifier→final two-round shape, Coil faction row, richer host/rival beats.
- **GS-story-qualifier-formats** — ✅ *shipped*: qualifying events are **nine holes**, drawn into one of five formats (single stroke / single Stableford / paired stroke / paired Stableford / paired matchplay), a paired event played SCRAMBLE or BEST-BALL. The draw is a pure keyed hash off the new `campaignSeed`, so the sheet is fixed per campaign and shown on the dossier BEFORE you fly — picking two of a chapter's three roads is choosing your golf *and* your company. No new engine (paired events arm the team-Sigil machinery); one currency (a place in the field) so the top-N gate is unchanged; balance measured by `scripts/qualifier-balance.ts` (35–63% band across every format). Every pairing feeds the betrayal **partner tally**, which now decides the odd one out (most-partnered → courted, least → benched; the old two-pick rule is the same rule with no qualifiers played), and the first two Sigil WINS pay the live standing off as a per-character scene. Save v6→v7.
- **GS-story-qualifier-partner-pick** — ✅ *shipped*: you now CHOOSE your playing partner for each paired qualifier, from the star-map dossier, exactly as you choose a team-Sigil partner. The draw still sets the format + pairing; only the company is yours — which is the point, since the partner tally is what decides who betrays you. Invalid/skipped picks fall back to the drawn suggestion, so nothing else changed.
- **GS-story-qualifier-match-live** — ✅ *shipped*: a `pair-match` qualifier played out blind (result only on the recap) while the Sigils showed their match live. It now drives the identical chip / per-hole panel / mid-round close-out off ONE pure source (`qualifierMatchThrough`, which the resolution calls too, so live ≡ final by construction), with both sources building one shared `LiveMatch` view — one renderer, not a fork. Closing out banks only the holes the match ran and never writes a partial record.
- **GS-story-chapters (alignment fork)** — ✅ *shipped*: **The Choice** after Ch.3 (Warden vs Herald, sets `alignment`); Ch.4–5 are per-path tournament variants (Warden redeem Venoma / Herald crush Penelope + Driver Dan); the finale ending branches (Reseal / Long Rest). Deferred: Sigil-less mid-chapter per route, Gemini-Ice side world.
- **GS-story-route-rewards** — ✅ *shipped*: cursed sheddings (Herald: big power + a real curse, cheaper) vs Warden grace (clean, dearer), route-gated in the Pro Shop; route ships (Radiant Warden Cruiser / Coil Wyrm-Ship) granted by winning the route's Ch.4 major. Deferred: wyrm-ship battle-frailty nuance.
- **GS-story-champion-cosmetics** — ✅ *shipped*: beating the World-Eater hangs the path's set in the GLOBAL wardrobe/garage — Warden ⇒ the Radiant Warden Cruiser + the three-piece **Warden Vigil** outfit (halo / mantle / raiment), Herald ⇒ the Coil Wyrm-Ship + the three-piece **Coil Shroud** (hood / shroud / scales). The first campaign payout that OUTLIVES the slot: everything else lives in `gs_story` and dies when that golfer starts over. One campaign hangs ONE set, so the other costs a second run down the other road. Ship = the one already earned on that road (granting the same id globally is "you keep it"); outfits are new art but invent no palette — Warden white-gold off `wardenArk.ts`, Coil pieces reusing the DEFECTOR costume's cobra hood / serpent circlet / robe panels / ouroboros clasp, worn now by choice. Idempotent + additive, a loss grants nothing, the recap reveals only genuinely-new pieces. No save bump.
- **GS-story-credits** — ✅ *shipped*: the CREDITS ROLL a won campaign ends on — a Mallrats "where are they now" card per cast member (the six crew, your three friends, the five Coil, both prophets, the serpent as itself, and YOU last), portrait + role + epilogue, crawling itself over a scroller that ends on the dedication and the wordmark. The finale recap's "Roll the credits ›" had gone straight to the title since the finale shipped. Every row carries BOTH endings (the Reseal wakes the galaxy, Ragnarök puts it to sleep — machine-checked that no epilogue is shared); a friend's role is ASKED of `betrayerId`/`heraldSeveredId`, so the roll can't name a different traitor than the ending recap did; the hero's card is SECOND PERSON (the protagonist is a pick — no third-person pronoun may reach it). Portrait resolution moved out of `loreScreens.ts` into the shared `render/castPortrait.ts`. The crawl is a rAF loop, never a CSS animation (reduced motion collapses durations — a keyframed crawl would snap to the end). No save bump, no sim rng, no new hook.
- **GS-story-midchapter** — ✅ *shipped*: the Sigil-less emotional interlude after the Ch.4 major — Warden "The Prism Accord" (win a fallen friend back) / Herald "The Severing" (betray one for the Coil's blood-money); a real roster golfer as the friend, fires once, colour-coded dialogue + credit outcome.
- **GS-story-yggdrasil** — ✅ *shipped*: the Jörmungandr SPACE BATTLE — five Sigils forge the key → briefing (two readiness gates: firepower/defence, spends Combat Rating) → Canvas battle cinematic (Cthulhu-serpent + golf finisher) → victory (`completed` → storyComplete → Star Tour) / defeat (arm up, rematch). Deferred: two alignment endings, interactive finisher shot.
- **GS-story-beats** — ✅ *shipped* (the inter-chapter dialogue): four escalation beats through the DATA-driven lore machinery (`LoreContext` gained `storyRound`/`storyChapter`/`storyAlignment`) — the Parrot names the Coil (Ch.2), Coilkeepers ring the tee (Ch.3), Venoma confronts you from Ch.4 branching Warden/Herald. Two bespoke SVG portraits (viper-woman Venoma, faceless Coilkeeper). Story-round-gated (never fires in Voyage/Unending), once-only via `seenLore`.
- **GS-story-parrot-bar** — ✅ *shipped* (the Parrot BAR interaction): "The Crow's Nest", a cosmetic Mothership hangout off the clubhouse — tap the Prognostic Parrot to cycle campaign-adaptive chatter (a state-appropriate greeting + rotating lore/Coil/path/hint lines gated on chapter/alignment/Sigils/completion). Content-as-data (`parrotBar.ts`) + a bespoke SVG cantina scene (porthole to space, neon sign, bottle shelf, the Parrot behind the bar reusing his lore bust). Transient tap counter, zero sim rng, no save bump.
- **GS-story-balance** — ✅ *shipped* (the cross-chapter difficulty + economy pass): measured the rival ghost vs fixed to-par reference rounds → the late Sigils were a near-wall (a −6 round won ~13% by Ch5, a mandatory gate) with a Ch2→Ch3 cliff. Recalibrated the rival edges to a smooth ~1-stroke/chapter curve (0.07/0.12/0.18/0.23/0.29) so a grown −6 round wins ~77%→~38% Ch1→Ch5 (winnable-but-earned, growth matters, no cliffs), and added a Sigil-win milestone bonus (`SIGIL_WIN_BONUS` 250, first win only) so the majors fund the escalating spend (5 Sigils ≈ the ~1300cr finale floor). Guarded by `tests/story-balance.test.ts`. **Story Tour is feature-complete** (all chunks shipped).

**GS-story-champions — carry a finished golfer into Star Tour (design in `docs/decisions/story-campaign-slots.md`)**
Star Tour was unlocked by finishing Story Tour and connected to it in no other way: the champion free-roam
reads the SINGLE live campaign, so starting a new Story Tour deleted the developed character you had earned.
Three sequential PRs, save work first:
- **GS-story-campaign-slots** — ✅ *shipped* (the save layer): `gs_story` holds a `CampaignStore` — one
  campaign PER GOLFER — instead of one `StoryState`. A pre-roster save is ADOPTED as a one-slot roster (same
  key, so the bundle's blob list is unchanged and nobody loses a campaign); a Star Tour champion IS that
  golfer's completed slot, never a snapshot that can drift; `BACKUP_VERSION` → 2 so an older build refuses a
  roster file loudly rather than restoring one mangled campaign. Guarded by `tests/story-roster.test.ts`.
- **GS-story-campaign-picker** — ✅ *shipped*: the GOLFER picker IS the campaign picker. `openStory` always
  opens the Earth clubhouse and each figure wears a campaign TAG (`Chp 3` / `Prologue` / `★ Complete`, in the
  accessible name too); tapping a golfer with a campaign CONTINUES it, one without starts theirs, and nothing
  is overwritten by picking. Story-Tour-only by construction — the `character` screen is SHARED, so tags are
  passed IN and a renderer never fetches the roster (absent ⇒ byte-for-byte for every other mode). The roster
  moved into `UiState` so the guard on the DESTRUCTIVE write lives in the reducer, where no surface can route
  around it: `selectCharacter` can never overwrite, `storyRestartCampaign` refuses unless `storyOverwriteId`
  names that golfer, and BACK cancels the confirm. The sheet's copy comes from `campaignOverwriteWarning` —
  the same pure function the guard consults — so it can't promise something milder than the write, and it
  says outright when a champion goes too. `currentRoster` lays the live campaign over the boot snapshot, so
  the tags can't go stale without ~190 `state.story` writes each remembering to mirror themselves.
  Guarded by `tests/story-campaign-picker.test.ts`; eyes-on `scripts/campaign-picker-preview.mjs`.
- **GS-story-startour-champions** — ✅ *shipping*: Star Tour offers your CHAMPIONS (one per golfer finished),
  each flying with the bag/gear/caddy/ship they finished with. `openStarTour` reads
  `championCampaigns(currentRoster(state))` — never `state.story`, which is only whichever campaign happens
  to be loaded: **0 ⇒ the classic character-first flow byte-for-byte, 1 ⇒ straight to the map, 2+ ⇒ a
  champion picker.** The 0 case is a PROMISE, not a fallback — `starTourUnlocked` is permanent and remains
  the only gate, so a player who finished under the old single-slot save and then started over still gets
  the mode. A champion ARMS Yggdrasil, but revealing the tree ≠ opening a branch: the hard hammer gate in
  `playYggdrasilRealm` stays and Asgard reads *Bifröst sealed* rather than offering a button that would be
  refused. **The Serpent at the Root** replays the finale as that champion's own `alignment` faced it
  (Warden ⇒ Jörmungandr / Herald ⇒ the Warden Ark) — a SECOND CALLER of `mountStoryBattle`, deliberately NOT
  a reducer action, so "touches no campaign state" is true by construction rather than by remembering; its
  own reduced-motion branch, returning to the MAP. Records were settled DELIBERATELY: **describe, don't
  rank** (save v31) — `StrokePlayRecord.champion` joins `characterId`/`tier` as description, one board per
  course ranked on to-par alone, because a champion IS the live slot and keeps improving, so there is no
  stable loadout identity to key a board on. The ★ also fixes a real lie: a champion's run is built on
  `DEFAULT_BAG_TIER` with the story bag laid over, so `tier` stamped 'common' on a solar bag. Guarded by
  `tests/startour-champions.test.ts` + a browser layout smoke; story in `docs/decisions/story-campaign-slots.md`.
- **GS-startour-serpent-trophy** — ✅ *shipped*: **BEATEN INTO SUBMISSION**, the secret achievement at the
  root. Every Star Tour encounter with the serpent now COUNTS (`serpentBouts`/`serpentWins`, save v32) —
  the replay used to bank nothing at all, which made a repeatable fight a screensaver — and **1,000
  victories** break the beast to the bridle: **The World Serpent** becomes a flyable hull, a bespoke
  `ShipLook['kind']` with its own guns (FANGS), star-map weapon (VENOM), living wyrm cabin and venom-light
  bridge. The tally lives on the MAIN save beside `lifetimeAces`, never in `gs_story` — one campaign per
  golfer means a slot can be started over, and a grind a golfer pick could erase is one nobody would run.
  Which boss you face is deliberately not part of the key (one fight, one place); reduced motion counts too
  (gating the last cosmetic behind watching a battle animation is what `accessibility.md` forbids); and the
  ledger shows the COUNT but never the target, because a secret has to be able to grow without announcing
  itself. Making it count needed the replay's first reducer action, so the "touches no campaign state"
  guarantee MOVED from structural to asserted — `serpentBout` leaves `story`/`campaigns`/`run`/
  `strokePlayBest` referentially identical, checked on object identity. Guarded by
  `tests/serpent-trophy.test.ts`.

**GS-story-betrayal — the deep betrayal arc (design in `docs/decisions/story-betrayal-arc.md`)**
Make the back half almost always DIFFERENT: the other three playable golfers become an aboard-ship CAST you
partner with, and WHO betrays you is decided by your Sigil 1 & 2 partner picks. The five Sigils become
distinct FORMATS (Scramble → Best-ball → Stableford → Strokeplay → 2v2 best-ball Matchplay). Reuses
`match.ts`; content-as-data; Story-save only; determinism/auto≡interactive preserved (new levers no-op by
default). One focused, tested, auto-merged PR each:
- **GS-story-cast** — ✅ *shipped* (#508): the 3 non-protagonist golfers travel aboard + stand in the
  clubhouse, tappable like the Parrot; per-character state-aware talk (warm/wary after The Choice). Shared
  `otherGolfers` seam (`storyCast.ts`) replaces the ad-hoc "roster minus protagonist" computations.
- **GS-story-team-format** — ✅ *shipped* (#509): pure engine (`storyTeams.ts`) — scramble/best-ball vs
  opposing ghost PAIRS + 2v2 best-ball matchplay (reusing `match.ts`); `StoryTournament.format` field.
- **GS-story-partners** — ✅ *shipping*: `StoryState` v5 `sigil1Partner`/`sigil2Partner` + lobby
  partner-picker; Sigil 1 = scramble, Sigil 2 = best-ball, resolved vs opposing pairs; team recap; the pick
  is locked into the campaign (drives the betrayal branch).
- **GS-story-stableford** — ✅ *shipping*: Sigil 3 (Storm Championship) is single-person STABLEFORD (points,
  higher wins; attack every flag). Points recap + leaderboard; The Choice still fires after the win.
- **GS-story-charquests** — ✅ *shipping*: each friend carries a SIGNATURE quest that opens once you PARTNER
  them in a team Sigil — they open up about home (Feather's Nairobi wind, Larry's ocean ball, …) and hand you
  their signature club (`charquest:<id>`) on their clubhouse talk card (🎁 marker). Reuses `completedQuestIds`
  (no save bump); `heraldQuestHook` skips the markers.
- **GS-story-betrayer** — ✅ *shipping*: pure `storyBetrayal.ts` — betrayer = odd-one-out of your two
  partner picks; Warden loyal ally + Herald opponent pair; Coil champion-not-your-guide; `corruptedLookOpts`
  costume. The interlude's fallen/betrayed friend is now the actual betrayer.
- **GS-story-finale-2v2** — ✅ *shipping*: the Ch.5 2v2 best-ball MATCHPLAY finale, both paths. WARDEN =
  You + a loyal friend vs (the Betrayer in corrupted Coil garb + Venoma); HERALD = You + the Coil champion
  who isn't your guide vs your two former friends. Lobby matchup box (figures + costume), matchplay recap
  (scoreline + teams), seed-robust balance (a strong round wins, a blow-up can't be carried to a halve).
- **GS-story-betrayal-beats** — ✅ *shipping*: the mid-chapter interlude reworked into the per-character
  BETRAYAL beat. WARDEN "The Defection" — the betrayer speaks their own defection voice, portrait in
  corrupted Coil garb, and it sets up the shrine finale (no more "win them back"). HERALD "The Severing" —
  keyed to your FIRST completed caddy quest + whether you still wield its reward club (Sandy's Second feels
  heavy) — realistically Sandy/Chipinski/Sam/Penelope, the caddies reachable before The Choice, never the
  Ch.5-only Dan/Mole. The friend's per-character farewell. Four distinct betrayal voices (`BETRAYAL_VOICE`).
- **GS-story-midround-omen** — ✅ *shipped* (player ask: "mid-round at the nine-hole pause there needs to be
  a story beat before the Choice; the odd-man-out beat needs a piece per character per outcome"): the
  PRE-CHOICE betrayal foreshadow. At the turn of the Chapter-3 major (Storm Championship) — both team-Sigil
  partner picks locked, path unchosen — the round diverts ONCE to a cinematic beat (the shared `.gs-lore*`
  card, `storyMidBeat` screen) that shows the future betrayer's first crack, keyed to WHY they're the odd
  one out (`betrayerOddness`): SIDELINED (two distinct picks → the friend you never chose mutters "never
  good enough" at the ropes while a Coil NPC drifts to their shoulder) or TEMPTED (same pick twice → the
  trusted friend admits they heard the Coil's word beside you and "maybe there's something to it"). Then it
  flows into the classic halftime rival pop. Per-character, Coil-NPC flavoured (Huang-Woo ↔ Venoma; Feather/
  Larry/Bo ↔ the Apostate), authored to seed each friend's later defection/farewell so the betrayal stops
  being a switch-flip. Content in `BETRAYAL_VOICE.sidelined/tempted` (`storyBetrayal`), assembly in
  `storyMidround.ts`, once-tracked in `seenStoryBeats`. Pure + render-only — zero sim rng, no save bump.
  Guards: `tests/story-midround.test.ts` (picker + per-character coverage + the hole-9 reducer flow) + a
  `?screen=storymidbeat` browser smoke.
- **GS-story-heard-the-word** — ✅ *shipped*: the mid-round omen's Herald PAYOFF. When you turn Coil, the
  trusted-twice friend who heard the word beside you (the `tempted` omen) did NOT — they resisted the same
  whisper, and now confront you: "I heard the word the same as you… how could you side with them?" Per-
  character Herald arrival beats `story-heard-<golfer>` (`BETRAYAL_VOICE.heardTheWord`), gated on the Herald
  path + `betrayerOddness==='tempted'` + that exact friend (new `LoreContext.storyBetrayerOddness`, populated
  in `withLoreGate`), placed after the Venoma-welcome so the Viper lands first. Pays off the seed the omen
  planted — the tempted friend falls to it on Warden, resists it on Herald. (The Warden linkage was already
  delivered by the omen itself — the player SAW the friend recruited/tempted, then they defect.) Extends
  `BETRAYAL_VOICE`; no new screen, no save bump; guarded in `tests/story-midround.test.ts`.
- **GS-story-aftermath** — ✅ *shipped* (player report: the Ch.4 Warden Sigil "shows the scorecard then goes to
  the betrayer leaving — no win/loss Scorpius screen, feels empty"). A post-result CONFRONTATION beat for the
  back-half Sigils (`storyAftermath.ts` `tournamentAftermath(t, story, won)` → the shared `.gs-lore*` card;
  reducer diverts `storyTournamentContinue` on a Ch.4/5 result → `storyTournamentAftermath`, then
  `storyAftermathContinue` → interlude/clubhouse via the extracted `continuePastTournament`). **Ch.4 Warden**
  Scorpius win + loss (the wordless Sting, the black card's `{betrayer}` name); **Ch.4 Herald** loss only (the
  severed friend still reaching — a win is owned by "The Severing"); **Ch.5 Warden/Herald** win + loss (the Green
  Key forges / the root opens; the betrayer's ultimate fate stays for the ending, GS-story-ambiguous-fate). Not a
  `seenStoryBeats` one-off (a won Sigil can't be replayed → win fires once; a loss re-shows each retry). Pure +
  one screen + a reducer divert; zero sim rng, no save bump. Guarded by `tests/story-aftermath.test.ts` +
  `?screen=storyaftermath` browser smoke.
- **GS-story-betrayal-polish** — balance, dialogue depth, costume polish, docs.
- **GS-the-destination** — the FUTURE game mode the Warden ending now names: the Coil's remnant (and the
  betrayed friend) fled "past the edge of every chart" to **The Destination** — an unknown-deep voyage mode
  where redeeming the friend is the quest. The ending, the mission log, and the story bible all seed the
  name verbatim (GS-story-unending-tease), so the mode ships into an already-told promise. Design TBD
  (player-planned). (Renamed from GS-universe-unending — "Universe Unending" collided with the existing
  Unending Universe endless mode; no code ever shipped under the old name.)
- **GS-story-ambiguous-fate + GS-story-unending-tease** — ✅ *shipped* (the Warden ending rework, player
  design): the shrine no longer promises redemption ("break the whisper's hold" → the Parrot's foresight
  goes dark in the mire; the friend's fate is unknowable), and the Reseal ending resolves it instead —
  Jörmungandr is SUNG TO SLEEP (never shattered: the cinematic settles the serpent, closes its eye under
  amber seal-rings) while the betrayer + the Coil's last wyrm-ship jet off-frame to **The Destination**;
  the recap + the Parrot's last line vow the unknown-deep voyage to bring them home. Ending names the real
  betrayer (`mountStoryEnding.betrayerName`).
- **GS-story-early-beats + GS-story-doubt + GS-story-choice-blind + GS-story-sigil5-play/-look** — ✅
  *shipped* (the story-beats correctness pass, player report): (1) the pre-Choice trunk gained real arrival
  beats (Ch.1 true-line lesson, Ch.2 Venoma DEBUT at the Forge tee-off + the rough-that-moved dread) so the
  story builds from the World Tour to Sigil 3 instead of starting there; (2) the Warden Ch.4 qualifiers run
  the BETRAYER-DOUBT thread (the Parrot's vow naming who's gone quiet → the betrayer's strange question →
  their eve-of-vigil drifting, per-character voices in `BETRAYAL_VOICE.doubt/distance`, keyed off
  `LoreContext.storyBetrayerId` + the `{betrayer}` token so the RIGHT friend speaks) and the Ch.4W Sigil
  intro/Venoma beat are about the brewing betrayal, not "saving Venoma"; (3) The Choice hides its
  consequences — two in-fiction voices, no world/rival/ending spoilers; (4) Sigil 5 plays as a REAL
  interactive 2v2 scramble (the finale ally shares your ball via `scrambleOptsFor`, the resolver's
  `teamPlayed` mode scores the played strokes without re-folding an ally ghost, auto ≡ interactive) and the
  matchup box draws Venoma/Voss portrait busts, never a snake emoji.

**GS-story-review — Story Tour polish backlog** (from `reports/story-mode-review-2026-07-18.md`, the
designer/QA/story-editor pass). The systems all shipped; these close the gaps between the campaign and the
bible. Story-only surfaces (separate save + gated rows) so none risk Voyage/Unending determinism.
- **GS-story-apostate** — ✅ *shipping*: Malachai "Sable" Voss, the Apostate — the bible's dark-mirror
  antagonist, previously absent (0 refs). Adds a `voss` lore portrait, a Ch3 "the Apostate appears" beat,
  his presence delivering The Offer on The Choice screen, and a parrot-bar line. The device that gives The
  Choice its weight.
- **GS-story-econ2** — ✅ *shipping*: chapter-scaled world payouts (reward playing hard worlds) + diminishing
  repeat-revisit returns (kill the grind-the-easiest-world loop), so the shipyard/locker/pro-shop spend
  choices have teeth. Pure model + reachability test.
- **GS-story-hosts** — ✅ *shipping*: restore the bible's named hosts (Sir Aldous Greensward, Magnus Cinder,
  …) into the `host` rows + rival-variety flavour. Data-only.
- **GS-story-finisher** — ⭐ *top follow-up*: make the Jörmungandr finale an actual INTERACTIVE strike
  (the bible's "golf finisher into the serpent's eye") instead of a pure `combatRating ≥ N` threshold. Keep
  the two arm-up gates as the FLOOR (you must be armed to reach the finisher); the strike's quality colours
  the ending (clean kill vs graze) and the two endings diverge in event, not just copy. Highest value.
- **GS-story-worlddiff** — chapter-scaled world DIFFICULTY: a story world round pins the static course with
  `staticEffect:'none'`, so moment-to-moment golf is flat Ch1→Ch5 (only the ghost edge scales). Ride wildness
  off the chapter; guard that the non-story (Star-Tour/records) render of the same course stays byte-identical.
- **GS-story-friends** — cash the "gather your friends" promise: the caddy roster (`hiredCaddyIds`/
  `activeCaddyId` fields exist, no mechanic) — hire-once Warden allies (Dan/Penelope/Pim) that fold into the
  story bag; the three friends as the Ch1 friendly-rival board + named in the interlude.
- **GS-story-choice-cost** — surface the alignment trade-off at The Choice (the Herald interlude pays MORE
  credits with no visible downside today — cursed = a visible cost, not the greedy pick).

**GS-story-quality — 2026-07-19 deep-dive quality pass** (report:
`reports/story-mode-quality-pass-2026-07-19.md`; focus: does the Choice matter + is the final boss fun).
Story-only, `npm run check`-green, no Voyage/Unending risk.
- ✅ *shipped this pass*: fixed the finale serpent writing (misgendered "she"/"ship to ship" → "it");
  re-themed the finale BRIEFING + battle CINEMATIC per alignment (Crow voice + unseal/wards framing for the
  Herald, mechanics identical); "The Reseal" title payoff; Parrot→Crow on the Herald 5th-Sigil/shipyard/loss
  screens; "The Serpent's Fang" Sigil name; path-correct mission log; **re-present The Choice on resume** if
  it was skipped (was a silent railroad to Warden); **Herald can't recruit/quest the friends they must crush**;
  **quest 9-hole rounds no longer corrupt the 18-hole `worldBest`**.
- ✅ *round 2 (player-reported) shipped this pass*: locker LORE cards now open for quest/major/starter clubs
  (the inspect reducer accepted only `club:`/`gear:`); ship rooms EQUIP owned upgrades, buying moved to
  ship-vendor worlds only; the star-map ship draws mounted GUN PODS scaling with installed weapons;
  **Herald caddies** — the Warden friends DESERT you and the Coil inner circle VOLUNTEER as caddies (real
  effects, switch in the locker, on the bag on-course); the **Galewarden Irons** are a matched 5·7·9 SET; and
  early Pro Shops lean on GEAR instead of a redundant club glut.
- **GS-story-gather-early** — ✅ *shipped*: the two Ch.5-gated Warden caddies (Dan/derelict, Mole/mire) left
  no time to recruit + quest before the finale. Decouple a world's CHART reachability from its tournament tier
  — new optional `StoryWorld.chartChapter` (defaults to `unlockChapter`; the derelict + mire chart at Ch.4,
  post-Choice) so a Warden gathers them across Ch.4–5 while the worlds stay Ch.5 tournaments (venue/qualifier/
  difficulty/payout + the quest narrative unchanged). Early visits are plain clears, not out-of-chapter
  qualifiers. Pure model + one reducer guard; no save bump.
- **GS-story-caddy-rep** — ✅ *shipped*: a caddy's side quest unlocks only AFTER you've played a round with
  them on the bag (a lightweight reputation gate, no rep system needed). New persisted `caddiedRoundIds`
  (STORY_VERSION 5→6), recorded on every round resolution with the active caddy; `questOfferable` gates on it.
  Path-agnostic (a Herald Coil volunteer earns their quest the same way) — the seam GS-story-herald-quests uses.
- **GS-story-herald-quests** — ✅ *shipped*: the four Coil inner-circle caddies (Voss/Venoma/Ouros/Ecdysis)
  get their OWN side quests on the Herald path, inheriting the GS-story-caddy-rep gate (carry the bag with them
  first). `StoryQuest.alignment` + `.world` (the volunteers have no recruit world) route the path; NAMED reward
  clubs + effects; the Coil talk card reuses `questSlotHTML` + a Carry-my-bag swap. `heraldQuestHook` (the
  Severing beat) stays WARDEN-only. No save bump.
- **GS-story-world-routing** — per-alignment world unlock (`STORY_WORLDS` is flat/chapter-only; both paths
  chart the identical galaxy). The bible's core replay engine — Warden void/crystal/frost vs Herald ocean/
  derelict/cetus. Add `alignment?` to Ch.4–5 rows + thread `storyWorldUnlocked`; shared shrine on both.
- **GS-story-herald-finale** — the bible's Herald finale = fight the Ark + your former friends, then present
  yourself (new battle art: Warden ships, the wyrm-ship as the player craft). GS-story-battle-2 delivered the
  mechanical divergence (wards to shatter, blockade lances to dodge, the seal strike, the serpent waking as
  the wards fall); still open: the Ark itself on screen with the NAMED friends at its helm + the wyrm-ship as
  the drawn player craft.
- **GS-story-penelope-placement** — stand Dan + Penelope TOGETHER at the Ghost Harvest (the bible's "crush
  Dan & Penelope" beat is never delivered today; the choice screen no longer promises it —
  GS-story-choice-blind removed the spoiler — but the beat itself is still owed).
- **GS-story-boss-juice** — ✅ *shipped as GS-story-battle-2* (the final-battle overhaul): dodgeable
  telegraphed strikes (tap-to-VEER), hit bursts, an enrage ramp, AND further than asked — the outcome now
  has stakes (an armed ship that fights badly is REPELLED, a costless rematch), the whole fight is tuned
  continuously by the arsenal (`finaleBattleTuning` — weapons→volleys, defence→shield pips, engines→recharge),
  the battle serpent is the mythic teaser `paintSerpent`, and the Herald fights a genuinely different battle
  (shatter the wards — the serpent WAKES as they fall — under blockade lances, then strike the brow seal).
- **GS-story-shield-bay** — a `'shield'` room in the ship interior (shields are only at vendor worlds today,
  and one is mandatory for the survive gate — a forced detour). Plus the Ch.1 "Verdant Wood" prize is secretly
  a legendary-tier base; two path-agnostic strings assume you're a Warden on the Herald path.

**Run structure & meta**
- **GS-encounters** — branching StS-style node map (elite / driving-range buff / treasure / shop / boss)
  over today's fixed voyage track. The format + boss layer is its foundation.
- **GS-contracts** — optional per-stop objectives ("eagle a hole → free relic", "4 GIR → +50% credits"):
  a pure scoring read over `PlayedHole[]` + an intro-splash card.
- **GS-meta-unlocks** — spend shards on CONTENT (new golfers/caddies/club sets/biomes/relics), not just
  permanent stat upgrades — so the meta adds variety, not only power.
- **GS-risk-shards / GS-bag-cap** (small) — reward `cutDelta`/rarity-survived in shards; a soft bag cap so
  club loot is a draft, not pure accretion.
- **GS-100 follow-ons** — shot-by-shot boss ANIMATION on the map (honour-gated away-player sequencing);
  a matchplay/boss cadence for the endless Unending Universe (voyage-only today); headless
  `simulateRun` playing the real duel (stroke-play today, for balance/tests).
- **GS-fuel follow-ons** — the OVERDRIVE jump (pay extra ⛽ to deepen a lane's jump +1: a real depth
  throttle, but it bends the voyage's `maxJump` fairness cap + the wildness ramp, so it needs its
  own balance pass); a fuel-flavoured unique showpiece (a great tanker armada, arc 3, once per run).
- **GS-unending follow-ons** — tune the birdie wall from real play (hole 41+ demands birdie-or-better;
  baseline auto-AI dies ~hole 24, so 60/80/100+ are meant to need a stacked build — verify a maxed human
  can actually reach 150); per-tier intro stingers ("the bar tightens…"); an endless leaderboard
  (best-holes daily); maybe a mercy token (one bar-miss forgiven) as a deep shop legendary.

**Course / greens / hazards**
- **GS-greens-4** — template green COMPLEXES on top of the linear `greenSlope`: redan kick-feed, Biarritz
  swale, punchbowl gather, crowned/turtleback shed, false-front reject, two-tier. GS-green-contour-2
  built the foundation (shared `sim/contour.ts` field + local-field roll + topo-isoline art) —
  a template complex is now "author the lobe set", no new machinery.
- **GS-contour-fairways** — contoured FAIRWAYS on the same field: a `Hole` lobe set over the corridor
  feeding `sim/contour.ts` (`slopeFieldAt`/`heightFieldAt` are already surface-agnostic) so fairway
  run-out kicks off mounds and gathers in hollows, drawn by the same `render/contour.ts` isolines.
  Physics retune (every seeded landing moves) — own PR, re-run the death-spiral harness; consider
  kick-plates on dogleg corners as the first authored use.
- **GS-variety-3-followup** — the bigger levers from the hole-design research
  (`reports/hole-variety-research-2026-07-08.md`) not yet built. GS-variety-3 shipped the quick wins
  (straight rises with wildness so deep stops aren't all-bends; drivable par-4s persist; island STORIES
  for void/cetus). Still open, high value: **named TEMPLATE holes** as recognizable set-pieces
  (Redan kick-feed / Cape diagonal carry / Biarritz swale / Short-and-guarded — overlaps GS-greens-4 for
  the green complexes); an **anti-repeat scheduler** (thread the previous hole's shape/length-class/
  dogleg-direction into `chooseTemplate` and bias the next AWAY, so consecutive holes contrast — needs
  prev-hole state threaded through `generateHole`); **angle-of-attack** difficulty (couple the tucked
  pin's side to the fairway side that opens it, so tee-shot PLACEMENT matters, not just power); and the
  research's "difficulty budget" idea (cap the length+bend share, spend the rest on greens/hazards).
- **GS-slope-perks** — abilities that bend the slope rules (backspin check-back uphill, cheaper green-read,
  uphill-magnet). The "until perks exist" caveat in the slope code is the hook.
- **GS-split-fairways** — risky-short vs safe-long alternate fairways (the dogleg-grove machinery is the
  start); centreline-bunker pinch + opposite greenside bunker (open-the-angle).
  **A full implementation already exists but is UNMERGEABLE — recover the patch, don't rewrite blind.**
  PR #377 (closed 2026-07-25) built it: an alternate mown lane diverging through the driving zone off a
  dedicated `:split:` side stream, split from the primary corridor by a non-penalty waste median, opt-in
  per world (`Biome.splitFairway`), auto-AI untouched (it still plays the primary centreline, so
  auto ≡ interactive holds). It cannot be merged: `claude/biome-hole-layout-variety-idvtpv` shares **no
  common ancestor** with `main` (history was rewritten after 2026-07-13 — `git merge` says "refusing to
  merge unrelated histories"), so the base `0aca690` is on a dead lineage. The patch still extracts with
  `git diff 0aca690 claude/biome-hole-layout-variety-idvtpv` — 359 insertions / 7 files; `contract.ts`
  applies cleanly to today's `main`, `generate.ts` + `biomes.ts` + the two docs conflict. **The trap:**
  every claim in it (zero fixture re-pins, the fairness argument, death-spiral neutrality on verdant/
  tempest) was measured at `GENERATOR_VERSION` **25**; we are on **43**, having gained GS-green-flare,
  GS-green-clear and biome profiles — all of which move exactly the corridor/green geometry a split
  fairway interacts with. Re-landing = re-apply + bump 43→44 + **re-measure all three bars from scratch**
  + the eyes-on play-test that PR asked for and never got.
- **GS-fairway-width-2b (follow-on)** — GS-fairway-width-2 shipped the LAY-UP half (the auto AI reads
  the corridor width and lays up off a genuinely tight driving-zone pinch — position over power). Still
  open: teach the reach-AI to read width for CLUB SELECTION in a chute/thin ribbon (a shorter club's
  tighter cone holds the tight drive), and re-tighten the SPARSE-BAG character death-spiral fences — a
  sparse bag has no club to lay up WITH, so width-reading barely moved them. This half overlaps
  GS-rough-gradient-rebalance (richer starter bags / a general play-back-to-the-fairway reach-AI); do
  them together.
- **GS-rough-gradient-rebalance** — the balance half of GS-rough-gradient (shipped: heavy rough hugs the
  fairway + a distance-graded forest at all difficulties, real-golf feel first by design). REACH-AI HALF
  DONE (2026-07-15, PR pending): the auto sim now plays POSITIONAL golf out of trouble — `recoveryTarget`
  punches OUT of trees/deep-rough to the nearest reachable fairway (the #1 death-spiral driver: a trees
  lie fed ~60% of pick-ups, and the sim used to aim through the forest since `clearLine` ignores trees),
  and `autoShotPower` dials a genuine chip/punch down instead of always swinging full (the short-game
  stall). Pure, zero-rng, in the SHARED `layupTarget`/exec path so auto ≡ interactive (byte-checked).
  Pulled the worst sparse-bag max-wildness bar ~1.27→~1.07 toPar and ~20%→~12% floor-hits WITHOUT
  softening the rough; the `tests/characters.test.ts` fences re-tightened 1.45/0.25 → 1.15/0.15.
  STILL OPEN: (a) the full-bag `TODO(GS-biome-variety)` hazard-density fences in `tests/{themes,tents}.test.ts`
  (a per-world hazard-layout debt, not this one) and the `TODO(GS-rough-gradient)` `patches.test.ts` fence
  stayed at their relaxed thresholds (the full bag was already fine, ~0.9, so the reach-AI barely moved it);
  (b) the residual sparse-bag gap to the <1.0/<5% ideal is a SHORT-GAME / scoring pass (a sparse bag's
  ~15-yd club gap still misses more greens), never softer rough; (c) the POSITIONAL-golf tax below (making
  the fairway MATTER) is a separate PR. The gradient knobs (per-hole `buffer` character, `forestReach`,
  ring `plantP`, `ROUGH_CHAR_MIN_WILDNESS`) remain the tuning surface.
  PLAYTEST FINDING (2026-07-07) — the core of this rebalance: "clean open rough lets you skip the fairway;
  different-sized clubs are meaningless if you don't have to play the fairway." Today the DEFAULT off-fairway
  lie is plain `rough` at only −10% carry (`shot.ts LIE_INFO.rough`), the punishing lies (fescue −28%,
  deeprough −50%, trees −40%) sit a blob-radius OFF the centreline (the `standoff`), and corridors are wide
  early (`widthScale 2.0−1.25·wildness`), so bombing driver over everything has ~no positional cost and club
  choice never bites. The fix is a POSITIONAL-golf pass (its own PR + death-spiral harness), NOT softening
  rough: e.g. lift the plain-rough carry tax and/or wilds-spray so a miss actually costs a stroke of position,
  place heavy rough/hazard so the aggressive line is genuinely gated, and reward the fairway lie — measured on
  mean per-stop Stableford, contract 4. Do this WITH the reach-AI + starter-bag work above, not before it.
- **GS-more-worlds** — new exotic archetypes, each a new row + its ~14 Record entries (the registry scales).
  SHIPPED (2 of 4): **Toxic Mire** (`swamp`/Hydra) — the HEAVIEST air in the galaxy (the ball flies short),
  still + humid, acid bog everywhere; and **Scrap Belt** (`metal`/Antlia) — the lowest NON-abyss gravity
  (big low-grav bombs + debris jitter) over a solid derelict-metal graveyard (craters + a hull-plate
  chasm carry). They bracket the gravity spectrum (0.88 ↔ 1.32) with maximally-different visuals; both
  clear the death-spiral + fairness harnesses. Remaining: **neon/cyber grid** and **lightning-storm**
  (the latter overlaps Tempest — needs a distinct physical niche, e.g. static-charge scatter or a
  chain-lightning hazard, or drop it). See `reports/new-worlds-swamp-metal-2026-07-10.md`.
- **GS-hazard-vocab** — internal OB, railway-sleeper/bulkhead carom, chocolate-drop mounds, gorse.
- **GS-weather-play** — deeper per-sky gameplay signatures beyond GS-journey-variety's wind hook.
  SHIPPED: meteor-strike scorch lies (GS-meteor-scorch); GS-journey-fx-2 — every effect now carries a
  real hook (carry mult via biomeMods; stardust/ice/junk GROUND PATCHES generalising the scorch
  machinery in `sim/patches.ts`; gravityWell + frostfall skies; ~16 new events; play-consequence chips
  on the route card; machine-checked "no sky ships as pure dressing"); GS-weather-depth — the
  **acidRain** sky + `acid` patch/lie, storm-visual depth (cloud banks / forked rain-storms), the
  static-round `playerHoleOpts` arming fix (Story/Star-Tour skies bite headlessly too), and every
  Story world re-keyed to a UNIQUE thematic sky with a real hook (Draco Gale = ionStorm tempest,
  Hydra Mire = acidRain). Remaining: collidable junk
  HULKS in the rough (generalize the GS-tents collision the way patches generalized scorch), a
  comet-tail tailwind corridor, eclipse dimming the putt read. Each must stay fair-by-construction and
  thread auto≡interactive exactly like GS-tents did.

**Shot model & clubs**
- **GS-flight-shop** — flight-shaping Pro-Shop gear on top of the per-family flight profiles
  (GS-flight-3): a piercing low-wind driver (apexAt later / peakMult down), a sky-high "drop-anchor"
  wedge set (clears greenside trouble, kills roll), a hybrid that launches over anything. Mechanism
  exists: a `FlightProfile` mod threaded like `ShapeMod` through `flightProfileOf` — items scale
  `peakMult`/`apexAt`, and the aim overlay + knockdown walks read it automatically.
- **GS-clubs follow-ons** — location-specific club SETS with game EFFECTS (not just carry); scoring-club
  upgrade tiers via per-club dispersion/shape (a "tour wedge" that doesn't overshoot); wire reward-club
  acquisition into the cut/credit curve (most runs end before the bag fills today).
- **GS-4b** — smarter recovery/short-game to shrink the rare max-wildness blow-up tail (polish, not a
  blocker — the tail is Stableford-absorbed). NOTE: a naive "club for nearest carry" was tried + REVERTED
  (it reshuffles the RNG stream, didn't shrink the tail). Keep any attempt pure + seeded.

**Engine / codebase health**
- **GS-appsplit** — decompose the `app.ts` god-file (CLAUDE.md flags it as the likeliest regression
  source). Pure leaf clusters are out (haptics, celebrations, golferCards — #157/#158; 3,462 → 2,696
  lines). The rest is `state`-coupled (screens, gesture, `render`, `dispatch`). Next step is
  ARCHITECTURAL — a render context + a golden-HTML snapshot harness first, since the screen HTML is
  currently untested. Plan + staged steps in `reports/app-ts-decomposition-2026-06-30.md`. Do it in a
  fresh, planned session.

## Later
- **GS-release-onebuild — one tag, one suite, one artifact, two destinations.** GS-release-gate put the
  test suite in front of both release workflows, and the honest cost is that a `v*` tag now runs it
  TWICE: `pages.yml` and `itch.yml` both fire on the tag and each calls `tests.yml`. Accepted for now —
  it is the rare path (a handful a month, $0 on a public repo) and it keeps the two destinations failing
  independently, so a butler outage still lets Pages ship. The way to spend it once is a single
  `release.yml`: test → build ONCE → deploy Pages + push itch in parallel from the same artifact. That
  also fixes something subtler — itch.yml's header says *"the SAME `npm run build` output that pages.yml
  serves — itch and the Pages build can never be different code"*, which today is a claim about the
  build COMMAND sitting over two genuinely independent builds; merging makes it structurally true. And
  it gives the tag-vs-`package.json` assertion (currently itch-only, so a mismatched tag still deploys
  Pages with the wrong `APP_VERSION`) one home both destinations gate on. Why it is not done yet: this
  is the path that reaches installed phones, it has already produced three documented incidents (the
  `github-pages` ref-policy refusal, staging serving raw source, the butler-channel save-loss risk), and
  **none of it can be verified without cutting a real tag** — so it wants its own PR, deliberately, on a
  day when a real release is going out behind it. Keep `deploy-pages` and `push-itch` as separate jobs
  both on `needs: build`, or the independence is what the merge quietly costs.
- **GS-spin-bag-build — make the whole-bag backspin an intentional BUILD, not an accident.** GS-spin-bag
  gated `backspinBoost` to the clubs that actually spin (PW and below), because a wedge-slot item was
  quietly taking 43% of the driver's run and zeroing the 7-iron's — which is zero roll, which is zero
  bounce. But the play-test remembered the ungated version fondly: *"there was a fun issue a while back
  where if you got enough backspin then even the driver would backspin, and that would be interesting as a
  game build to explore with Bo because it was great on worlds like cetus, void, rainbow"* — the island
  worlds where run is a LIABILITY and a ball that stops dead is worth more than a ball that goes far.
  That is a real archetype and it deserves to be chosen rather than stumbled into. The seam is already
  there: `RoundOpts.spinsWholeBag` (and the same flag on `backspinRoll`, so the drawn helper line agrees
  — contract 5) ungates it in one place, and nothing sets it yet. So this is a ROW: an item, a perk, or a
  Bo ascension unlock that turns it on. Design questions worth settling first — (a) is it a Pro-Shop
  MYTHIC (it wants to be rare and expensive, since it inverts the distance economy), or Bo-specific
  (his identity, but then it is unavailable to the golfer who most wants to try it second)? (b) does the
  aim overlay need to SAY the driver will check, since the run-out helper line already draws it? (c) the
  death-spiral harness runs default loadouts, so it will not see this at all — a build that removes every
  club's run needs its own balance pass on the island worlds before it ships, not the standard bar.
- **GS-startour-topdown — should the STAR MAP fly the plan-view hull too?** GS-story-battle-topdown built a
  top-down twin for all 11 silhouettes, and the star map has arguably the same problem in a milder form: it
  is a CHART (a view from outside/above) with a side-elevation car driving across it, free to point in any
  direction — a `'nose'` ship rotates to its heading, so it flies "up" the chart showing you its door, which
  is the exact complaint the battle had. Milder because the map is a stylised chart rather than a scene, and
  the side art is the established look everywhere else (cards, pads, garage). Cheap to try — `shipTopSVG`
  has the same signature as `shipSVG` — but it touches the flight loop, the `fly: 'hover'` bank, the thrust
  plume and the weapon muzzle offsets, so it wants its own PR and a `startour-preview.mjs` before/after.
  Ask the player first: this one is taste, not a bug.
- **GS-story-serpent-portrait — a portrait-authored pose for the finale boss.** The remaining half of the
  player's *"because all our graphics are side on it looks pretty weird"*. `paintSerpent` composes the
  beast lying HORIZONTALLY — a side elevation — and the turned finale camera (GS-story-battle-portrait)
  rotates that whole drawing 90°, so what the player sees is a snake's flank while its head dives at them.
  GS-story-battle-epic proved the cheap fix does not exist: rotating the form-shading key light onto
  screen-up shades it along its own spine and drops the head into shadow, and the two are near
  indistinguishable side by side. The real answer is a pose authored for a portrait frame — the skull
  turned toward the camera (a foreshortened three-quarter head, so the maw and BOTH eyes face down the
  screen) with the body coiling away behind it. That is a `SerpentOpts` variant, not a rewrite, but it is
  a real art job and it must not disturb the sigil ceremonies, which are landscape and share the painter —
  so it wants its own PR, its own `serpent-preview.mjs` pass, and the ceremony shot as the control.
  Same question then applies to the Warden Ark (hull-relative shading, so it survives the turn far better).
- **GS-ship-greenside-ring — re-arm the derelict's greenside breach RING.** `ringAllowed = !ship ||
  !lostRough` gates the sanctioned ring of greenside penalty blobs off on any lost-rough hole; since
  GS-ship-calm-space armed the derelict's lost-rough at every wildness, that means always. Not a
  regression (it was only ever a calm-derelict feature) but the derelict now has no greenside danger at
  all. The predicate wants to be "skip on an island-PAD hole", not "skip on lost-rough" — a walled
  corridor is neither. Cheap in code; it consumes new draws so it RE-ROLLS every derelict hole, and the
  ring blobs need `validateGreenApproach` re-proved and the new pad-overlap filter checked (a stranded
  ring blob is now dropped rather than floating in space). Own PR, own sweep.
- **Phantom voids exist in EVERY world, not just the derelict.** The same mitred-offset fold
  (GS-ship-corridor-fold) puts a patch of "not fairway" inside the corridor at tight bends everywhere —
  it is only a lost ball on the walled derelict, but elsewhere it is a silent patch of rough mid-fairway
  that no one drew. Fixing it globally (un-fold every ribbon, or move `pointInPoly` to non-zero winding)
  reflows every seeded course in the game, so it needs its own session with the balance harnesses re-run,
  not a rider on a bug fix.
- **GS-5b — Flux biome/boss art.** Card system + art hook shipped (PR #9); needs the image-gen tooling
  (absent in-session) — see `reports/art-pipeline-2026-06-24.md`. Pass `artUrl` to `courseCardHTML` once
  images exist.
- **GS-16b — Hub I2 parity.** Each hook should have BOTH a URL form and a live form; remaining is a URL
  form for the feel flags (`?feel=`/`?spray=`) + a live no-reload seed/intro helper.
- **GS-mux deferred** — landscape/tablet layout, first-run coaching coachmarks, a putt drag-back gesture
  (the pace meter stands), per-club/character personality surfaced in the UI, multi-touch eyes-on of
  pinch-zoom. (Any new feel knob must add its test-hub control in the same PR — the I4 rule.)

## Done
Terse log — full story in the linked report / `docs/decisions/` / git history.
- **GS-aim-tree-aware** — CLOSED by GS-safe-aim-trees (🛟, #740) + GS-auto-aim-trees (◎). The aim
  family sees canopies now, with a different answer per mode because their jobs differ: safe goes
  ROUND a stand, the default lays up SHORT of it and takes the club that gets there (turning the
  default line would swing the shot map off the corridor). Measured over 29,343 positions on wooded
  worlds, shots pre-armed into a canopy 16.04% → 6.63% and tee shots 6 → 0; 77.8% of the residual is
  a genuinely trapped bag, which is never papered over. Three named exceptions: a par 3 always
  attacks the flag, the green pick is capped at the coverage club, and a lay-up under the minimum is
  refused (that is 🛟's job). `GS-knockdown-tunnel` above is the remaining tree-collision item — it
  wanted this alongside it, and now has it.
- **GS-safe-aim-trees + GS-aim-reset** — the two halves of "I can't get the aim back". SAFE (🛟) now
  asks the sim's own knockdown walk whether the lay-up would actually FLY and, when a canopy blocks
  it, hunts a line that gets the ball out to the fairway or the rough (13.7% of sampled positions on
  a wooded world were blocked; 3,928 of 4,017 escape clean, 0 stay blocked, mean turn 20.4°). The
  AUTO path is pinned byte-for-byte by `autoDecision` passing its own `layupTarget` explicitly. And
  the 🎯 reset is a permanent, correctly-labelled play-frame cell instead of a conditional button
  claiming to "re-aim at the pin" — it restores whatever the player's aim SETTING points at.
- **GS-clubhouse-floor** — the clubhouse furniture stands on the floor. Two literal causes behind
  "velcro'd to the wall": nothing but the golfers cast onto the deck, and the bar counter stopped
  **thirty units clear of it**, hanging. Counters now run down to the deck with a toe kick, the
  locker bank / reliquary stand on plinths, wall units cast onto the wall, and contact shadows pool
  at every foot. The deck line is a named `DECK_Y` that standing furniture derives from. The LOUNGE
  needed nothing — it already had floor-standing furniture and contact shadows, which is why it read
  best of the three. (#704)
- **GS-fairway-ink-break** — the fairway outline no longer runs over greens, hazards and rough.
  `fairwayEdgeRuns` gained OCCLUDERS (the green + the drawn hazard bodies, the same ones the painters
  get) that bury edge exactly as a neighbouring fairway does. Measured over 2,925 holes: ink inside a
  green **2.28% → 0%** (77% of holes → 0), inside a hazard **7.86% → 0.06%**. Trees deliberately
  excluded. No occluders ⇒ byte-for-byte. (#703)
- **GS-scene-isolate** — the clubhouse golfers and their parked cars stopped standing on the settings
  sheet. Feet-anchored figures mint z-indices up to ~1000; without `isolation:isolate` those join the
  ROOT stacking context and paint over every fixed overlay (settings 60, takeovers 60–62). `overflow`
  clips geometry, and `container-type` is not a stacking context. Rule stated for the class: every
  container-query scene frame isolates. (#702)
- **GS-ui-display-scale** — every display lays out as the phone the game is composed for
  (`docs/decisions/accessibility.md`). `--gs-uiscale` becomes
  `calc(var(--gs-readerscale) * var(--gs-displayscale))`; `viewportFit.ts` writes
  `clamp(1, min(w/390, h/844), 1.5)` and settings keeps the reader half, so the display MULTIPLIES the
  player's choice and never replaces it. Star Tour recap 460x442 → **589x560** at 1080p. ⚠ Scoped with
  `--gs-portrait-w` to be multiplied back; building it proved the opposite — it is `0.52·dvh` over a
  `--gs-dvh` that already divides by the zoom, so leaving it alone is what keeps the play/chart frame at
  its shipped 562px and 0.52 aspect. The clear band's 84.1% → 79.7% is the feature's own cost (vertical;
  a wider frame buys none of it back) and is the band the phone already gets.
- **GS-decision-frame-carry** — the shot camera frames where the ball FINISHES, into the clear band
  (`docs/decisions/render.md`). Two compounding faults: `decisionReach` was fed `spray.carryHigh` when the
  ball then runs `runFrac` further (driver +14%), and it was a CONSTANT when the room the HUD leaves is a
  property of the device — the play frame is capped to `--gs-portrait-w`, so a desktop container is a short
  portrait strip. `round.ts sprayTotalHigh` is now the ONE carry→total fold (camera + club suggestion), and
  `project.ts radiusForSpan` solves the radius from the measured span instead of tuning a magic number.
  Measured on the built game: the drawn cone's clearance under the info bar went −54 → **+90px** on a
  320×568 phone, +51 → **+147** on the itch embed, +52 → **+149** on a 1366×768 laptop, while the
  composed-for phone barely moves. Browser guard confirmed to fail on the old camera.
- **GS-story-battle-topdown** — the portrait fight draws the fleet from ABOVE
  (`docs/decisions/story-mode.md`). Reported: *"the side-on spaceships look really weird in portrait mode,
  I keep trying to crane my neck sideways."* The case where turning the camera genuinely breaks, unlike the
  serpent: a snake striking head-first down the screen is a real pose, a car seen through its driver's door
  while it recedes is not. `shipTopArt.ts` is `shipArt.ts`'s plan-view twin in the IDENTICAL frame, so it is
  a sprite swap — nothing downstream moves, and landscape keeps the side art. A plan view is symmetric about
  the keel, so `planMounts` mirrors a one-sided armament (a side elevation hides the far-side gun).
- **GS-story-battle-arms** — the finale's guns are the SHIP'S guns (`docs/decisions/story-mode.md`).
  Reported: *"we kinda need custom art assets for each spaceship that has a customised weapons display…
  a UFO will need different looking and spaced weapons to the wagon."* Every hull in the fleet fired from
  ONE point off the nose with no muzzle flash at all. Now an armament is a ROW keyed by `look.kind`
  (`battleArms.ts`, the battle twin of the star map's `shipWeapons.ts`): mounts, firing pattern, muzzle
  flash and trail motif, in the ship's own exhaust colours — roof-rack pairs, nose spikes, rim emitters,
  wing pylons, mast arcs. THE SPLIT: the upgrade says what a shot DOES (its shape stays, or a five-trigger
  arsenal stops reading as an arsenal), the hull says where it comes from and how it reads. Zero balance —
  a mount moves where a shot is born, never how many there are.
- **GS-story-battle-epic** — the finale battle is a set-piece, not a skirmish
  (`docs/decisions/story-mode.md`). Reported on the freshly-turned portrait fight: *"because all our
  graphics are side on it looks pretty weird… given it's the final boss battle campaign it should be pretty
  flashy and epic, and at the moment it is just fine."* Five render-only rules — the boss ARRIVES (a 2.8s
  entrance: loom out of the dark, name plate slam, roar, HUD wipe), hits BITE (hitstop with the art clock
  frozen, a sprung flinch, sparks, floating damage), the phase turn is a BEAT (one `bossRoar()` whose
  shockwave blows the field clear), the arena has a PLACE (the root, parallax wreckage, a far fleet, a
  waking storm) and the bar is a BOSS BAR (name + epithet, a chip bar draining behind, shattering shields).
  The portrait boss is drawn a fifth bigger about a fixed head pivot, with its ANCHORS mapped through the
  same scale so targeting/muzzle/finisher stay one description. Nothing about damage, spawns, cooldowns,
  thresholds or hitboxes moved. ⚠️ Re-lighting the serpent for the turned camera was built and thrown away
  — screen-up is the beast's own spine, so it shades lengthwise and shadows the head; the side-on read is
  a property of turning a side-on COMPOSITION and wants a portrait-authored pose (see `GS-story-serpent-portrait`).
- **GS-story-battle-portrait** — the finale boss fight is drawn at the orientation the screen has room for
  (`docs/decisions/story-mode.md`). Reported from the couch: *"the end fight works really well… except it's
  a landscape battle when the entire game is in portrait."* On a 390×844 phone the 1000×600 arena
  meet-fitted at scale **0.39** — a 390×234 strip of fight between two slabs of black. An orientation lock
  was rejected on availability (none on iOS Safari, fullscreen-only on Android, a native plugin in the
  shell), so the arena TURNS instead — the same answer `fitFrame` gives the hole map. `battleFrame.ts` is
  the camera: rotate 90° CCW when the container is taller than wide, boss at the top, ship at the bottom,
  **2.8× the drawn area** — and the FIGHT never leaves design space, so every hitbox, speed, spawn and
  phase timing (and therefore the balance) is untouched. The art needed no changes: it was all drawn facing
  along design +x, so the maw and the lance batteries end up pointing down at the player. The HUD gets its
  own always-upright frame — the arena box in landscape (byte-for-byte), the whole safe screen when turned,
  which hands the bars the letterbox bands instead of the playfield. Two seams the turn exposed: full-frame
  washes now cover the view rect, and `paintSerpent` no longer hard-clips its haze at the design box.
- **GS-play-bleed-holeout** — the page frame came back while the putt was still rolling
  (`docs/decisions/ui-intro.md`). Reported from the green: *"the putt make window adds black borders and
  slides slightly down off the bottom of the screen."* The tell was in the screenshot — TWO settings cogs,
  which only happens off full-bleed. `fullBleed` was keyed on `!play.done` while `playingBody` mounts the
  play frame on `anim` FIRST, and a holed putt sets `done` the instant it is struck: for the length of the
  roll the frame was up while the page had already reverted to the padded between-screens layout, so a
  `dvh`-tall screen sat inside a padded frame — inset 16px a side (`x: 16`) and 46px taller than the
  viewport (`scrollHeight` 898 vs 852). One question asked twice in two orders; the predicate now mirrors
  `playingBody`'s (`!!animatingPlay || !state.play.done`). Guarded in a real browser by
  `tests/play-hud-frame.test.ts` — auto-finish holes out in one action, so the whole animation runs with
  `done` already true. Verified red on the unfixed build.
- **GS-cetus-void-deep** — the glow was right, everything around it was too loud
  (`docs/decisions/render.md`). Play-test follow-up: *"much more vibrant now, but the pillars and the
  space background have been brightened too and the holes don't stand out… the greens look really small."*
  One rule, three surfaces: on a world that IS the dark, the only bright thing in the frame is the golf.
  The NEBULA is sized off the screen, so at the play camera the player sees only its bright cores — cut to
  the dimmest in the game, colour at near-zero strength. The CLIFF's top stratum was lighter than the
  fairway standing on it and ran to two-fifths of the drawn island — strata dropped under the fairway,
  depth now a `skirt` row (so the derelict + rainbow, on the same painter, stay byte-for-byte). The GREENS
  were half a render bug (the glow moved bands to yards and left rim STROKES in px — a 6.4px halo over a
  30px green) and half a real outlier (`greenSize` 1.05/1.10, the smallest in the game; both → 1.2, the
  pack median, measured near-neutral on the exempt worlds' own balance run). Vibrance held while the sky
  went dark, which is the whole point.
- **GS-cetus-void-glow** — the two worlds built to glow were the two that didn't
  (`docs/decisions/render.md`). Void and Cetus share one design idea — off the cut turf is the open deep,
  so the player is looking at a LIT SHAPE floating in it — and the game was tinting a slab and drawing a
  line round it. Measured on the drawn map they were the least vibrant worlds in the game (colourfulness:
  void 31.7 vs verdant 52.4; cetus's fairway the least chromatic turf of any non-grey world at OKLab
  C 0.083), and the entire emissive kit was two flat rgba rings in a greyish periwinkle, void-only, sized
  in fixed pixels. Now a `WORLD_GLOW` ROW per luminous world (`style/glow.ts`, no row ⇒ no prims ⇒ every
  other world byte-for-byte): a graded outward bloom with no outer edge to find, a neon rim of stacked
  strokes along the SAME silhouette the ink uses, and an inner glow on the green — which burns brightest,
  because on a landmark-less world it is the shape the eye must find first. Reach in YARDS, chroma bought
  at UNCHANGED lightness (a vibrant dark world, not a brighter one — a glow reads by contrast). Cetus
  48.6 → 60.7 colourfulness, void chroma 0.199 → 0.238. New rig `scripts/biome-vibrance.mjs`; guarded by
  `tests/biome-glow.test.ts` (incl. a chroma floor, so they can't wash out again).
- **GS-fairway-silhouette** — every piece of fairway is outlined, and nothing is outlined where fairway
  meets fairway (`docs/decisions/render.md`). The ink edge was stamped on the FIRST fairway polygon only —
  a real fix for the green flare slashing its ring back across the corridor, which left every OTHER piece
  of cut grass with no outline at all. A census of 1,512 holes: **94% are drawn from more than one fairway
  polygon and 25% carry one that touches nothing else** (a split lane, a broken island segment) — the
  player's "the top fairway doesn't have it". Both wants are one rule: walk each polygon's own edge, keep
  the runs no other fairway polygon buries, and feed that ONE silhouette to the ink, the first-cut edge
  ease (same fault in reverse: the flare's flush join ramped a dark band across mid-fairway) and the
  void/cetus rims. Tolerances are widths of GROUND and unclamped, so the silhouette is a fact about the
  course and a follow-cam zoom can't pop a run in or out. The stacked crown sheen was measured (~2/255)
  and deliberately left alone.
- **GS-green-apron-blend** — the green's apron was never a ring, it was a crescent
  (`docs/decisions/render.md`). The surround was TWO passes: an opaque ramp drawn UNDER the fairway plus a
  tinted collar on top — and once GS-green-flare made the fairway genuinely wrap the green, "under the
  fairway" meant hidden on every side the flare reaches. Rendering 14 worlds with it on and off measured
  what was left: 0.54% of pixels at up to 189/765 of contrast, all of it a one-sided lump of a third colour
  behind the green — on desert/links/ocean/metal, somebody else's turf smeared on the sand. Now ONE skirt
  drawn over the turf and under the surface, two translucent bands walking ground → collar tone → green
  turf, each fading to nothing at its outer edge (a band that meets the ground on a STEP is an object), at a
  tight turf miter so a star green's notches can't spike it. Apron widths in by a third: the broad run-off
  is the FLARE, a real playable feature, and two art passes describing the same yards of approach is what
  read as stacked stickers.
- **GS-putt-panel** — the putt section joined the screen it lives on (`docs/decisions/ui-intro.md`). After
  GS-hud-bag emptied the aim panel and GS-hud-compass podded the top bar, the putt was the one state still
  carrying rows — and it carried them in the deleted screen's chrome: the club cycler's `.gs-clubrow` slabs
  (a class that had quietly become putt-only), a flat private-palette canvas hard-coding `system-ui`, and
  THREE LINES of prose re-teaching the controls every putt. Now: the aim is a POD in `.gs-hudx__pod`'s
  proportions (the caddy credit rides its caption), the ◄/► are round-button-weight nudges, the meter is a
  lit instrument with a rounded well and a chevron marker, and the note is a caption — because the
  instruction moved ONTO the meter (`TAP TO STOP`), which is what let the prose go. Panel ~225 → **~185px**.
  Strictly a repaint: the sweep period, pace mapping and make band are contract-4 balance and are
  machine-checked unchanged. Two bugs fixed on the way past — the canvas now resolves `--gs-font` (a
  hard-coded family in a canvas is a label Readable-text can never reach) and its width floor dropped 240 →
  200, since it had been overhanging the glass on every phone in range.
- **GS-hud-gear-reads** — the HUD stopped quoting a bare bag (`docs/decisions/ui-intro.md`). The lie chip
  printed the raw LIE TABLE and the wind read printed the raw SKY, so a bunker said "−50% carry · wild" to
  a player whose escape caddy had halved it and a 45%-resist ball was shown the 20mph gale it flies through
  at 11 — while the aim cone beside them was already honest, because `previewShot` gets the whole loadout.
  Both now fold the sim's OWN function (`reliedLie`; a new single-source `windResistFactor`, since story
  clubs add `windResist` uncapped and a differently-clamped display would print a negative wind), and a perk
  that only shows as a softer number now carries a TELL — a 🛡 on the chip, a cyan shield ring on the dial.
- **GS-hud-compass** — the top bar became an instrument cluster (`docs/decisions/ui-intro.md`). Six
  independently-wrapping rows of overlapping readouts (hole/total · par+length · live yardage · points ·
  placing · lie · a wind SENTENCE · two hole descriptors) collapsed into one row of PODS — big value over
  a small caption — with a WIND COMPASS anchored left, whose needle reads against the SHOT bearing, i.e.
  both what the map is oriented down and what the sim resolves wind against. The hole's shape/width
  descriptors moved to the tee card where briefing belongs. The nav column went five buttons → two: the
  whole-hole view is a latching toggle and leaving it resets zoom+pan (the old recenter, folded in);
  pinch/⌘-wheel do custom zoom. Bar 112 → **88px**, clear band 50% → **80%**. Also fixed: the Stableford
  chip coloured by the raw gap to the cut, so every stop opened on a red zero — it colours by PACE now.
- **GS-hud-bag** — the bag replaced the control panel (`docs/decisions/ui-intro.md`). The aim HUD's power
  label, spray-odds legend and carry range were restating the aim cone the map already draws to scale, and
  its club cycler was a dozen taps to reach a wedge — ~140px of an 844px phone between the player and the
  golf. The club moved into a golf BAG bottom-right + a picker sheet (one tap to any club, Sam's read and ★
  in its header), the power moved onto the commit button as a fill behind `🏌 Swing · Power 78%`, the aim
  mode became a round button, and the aim/watch panel dissolved to that one pill. Only the bag stays in
  flow — the bar's height IS the camera's clear band — so bottom bar 148 → **66px**, clear band 50% →
  **77%**, and the ball dropped to just above the pill for free. The PUTT panel is untouched.
- **GS-flight-hang** — the short clubs stopped flying like darts (`docs/decisions/putting.md`). Flight
  time was keyed on the CARRY, but hang time is `2·√(2·apex/g)` — a function of the HEIGHT, and the apex
  is tour-flat across the bag. A 9-iron crossed the screen 3× faster than a driver and spent 44ms on its
  closing tenth against a drive's 95. Keyed on apex plus a per-family `dragTaper` (driver 0.72 → wedge
  0.46), the closing tenth is now 95–108ms for every club. Pure render pacing; harness byte-identical.
- **GS-runout-seen** — the middle of the bag landed and stopped (`docs/decisions/putting.md`,
  `reports/runout-bounce-2026-07-31.md`). Hops were PLANNED and then not DRAWN. Two faults: the length
  term was `cos²(descent)`, which is neither half of the projectile pair the module already relies on
  (`apexOverLenFor` is their RATIO), and it collapses across the bag where the real range relation
  `sin(2·descent)` is flat — so every steep club was charged for its steepness TWICE, `RUNOUT_BY_CLASS.len`
  being the other charge. And `hopMinYd` asked "is this hop big enough" in YARDS, which cannot answer a
  question about pixels. `hopBite` + `hopLenK` re-based on the driver (unchanged by construction), and
  the play view passes `Landing.ballYd` — its own draw expression run backwards — so a hop it could not
  show is never planned. `seen == planned` on all 40 firm rows (driver→9i all draw 2 on a full swing)
  and an honest 1-and-roll on all 40 green rows; the driver's run-out also stopped hitting the
  `runoutMaxMs` clamp. Render-only: no sim module imports `runout.ts`, zero carry moved.
- **GS-runout-ladder** — the landing got its ground back (`docs/decisions/putting.md`). The run stopped
  being the flight's leftover: `carryFrac` is now purely the FLIGHT scale (unchanged, so zero carries
  moved) and `runFrac` is its own lever, because buying a driver's run out of its carry dropped its apex
  under a hybrid's and left 12 of 573 forced-carry drives that no club could fly. Fairway roll: driver
  19.4 → 28.1, wood 12.1 → 19.8, short iron 2.6 → 5.7. The drawn bounce train stopped collapsing four
  times faster than it shortened (invisible bounces 6/40 → 3/40). Greens hold (`SURFACE_ROLL.green`
  0.7 → 0.55) and the default aim never asks for an unflyable carry (`carryableBefore`). Harness
  0.6319 → 0.6406 toPar/hole and 8.09% → 8.02% floor-hits, both fences unmoved.
- **GS-flight-shape** (was GS-flight-arc-tail) — the ball stopped dropping out of the sky
  (`docs/decisions/putting.md`). Height was sampled at the Bézier PARAMETER while the ground ran as
  `2t − t²`, so the terminal descent angle was a literal 90°: a drive glided at under 2° from its apex to
  90% of its carry, then fell 16.6yd over the last 23. Height now indexes on the GROUND fraction, and the
  arc became a real trajectory — two cubic legs pinned in value and slope, launch angle off a curved loft
  ramp, apex DERIVED from it (`tan(θ)/4 · liftGain`), descent from a per-family drag ratio. Driver
  11°/31yd/38°, 6-iron 16.5°/26yd/49°, sand wedge 26°/21yd/57°. Harness 0.5139 → 0.6319 toPar/hole and
  5.66% → 8.09% floor-hits, both inside their fences.
- **GS-a11y-sheet-scroll / GS-a11y-tight-fit** — the accessibility settings survive a phone (#607,
  `docs/decisions/accessibility.md`). Every `position:fixed` overlay caps to the viewport and scrolls
  (the settings sheet was 1515px on an 844px screen — and already −326px at the SHIP scale); the raw
  viewport-unit guard widened to any multiple, in TS style strings too; grids stopped blowing out on
  `1fr`'s min-content floor; the play HUD's flanks float at a tight fit (chrome 83% → 61%, clear band
  17% → 39%); the boot cinematic seals `#app`.
- **GS-ball-art** — the ball is a golf ball (#608, `docs/decisions/render.md`). Dimples, an alignment
  band and a maker's mark on a lit sphere that scales with the camera; roll driven by the ball's own
  world displacement, so it stops turning when the ball stops and reverses through a check; a shadow
  that finally makes the hop train visible. `BALL_SKINS` is a row, dressed from the same cosmetic that
  colours the flight tracer.
- **GS-runout-club** — bounce and run read per club (`docs/decisions/putting.md`). The iron flight class
  split at the number so a 3-iron runs and a 9-iron stops; `RUNOUT_BY_CLASS` gives the landing shape to
  the club and the base to the surface. Fixed the backspin skid→drag velocity step (the reported "stops
  and then just slides") and a hop train whose LAST hop was the biggest of the tail. Death-spiral bar
  0.8958 → 0.8740, floor-hits 9.48% → 8.65%.
- **GS-a11y-readable-text / -focus / -announce / -motion / -keyboard / -scale-wrap** — the accessibility
  sweep (#600–#605, `docs/decisions/accessibility.md`). Reader type + a UI scale that fixes small text and
  sub-44px targets with one lever; overlays became real modal dialogs with focus management and `inert`
  backgrounding; live-region narration so a screen-reader player is told what the ball did; the
  reduced-motion toggle finally reduces motion (four gates were asking the OS, not the setting); arrow-key
  aim and power, so the shot is no longer pointer-only. **We ship no dyslexia font, deliberately** — the
  letterform faces fail to beat plain Arial in every trial, and the one positive result resolved to
  spacing; so the toggle buys tracking/word-spacing/leading instead, at zero bytes. Bugs found on the way:
  the settings sheet had been rendering in **Times New Roman**, six buttons behind the settings backdrop
  stayed tab-reachable, and the golfer-card lore portrait announced itself as a button and did nothing.
  Left open on purpose: `GS-a11y-putt-assist`, `GS-a11y-charcard-nesting` (both above).
- **GS-ship-corridor-fold / GS-ship-wall-phantom / GS-ship-breach-restore** — the derelict's walls stop
  lying (7th pass). A mitred ribbon self-intersects at a bend and even-odd `pointInPoly` reads the fold as
  a phantom VOID mid-deck (13% of walled holes, up to 15 yd) — spliced out, and the deck + the bulkhead
  rails now come from ONE `ribbonEdges`. The aim cone had its own bounce predictor that disagreed with the
  sim on 42% of real bounces — `wallFlightHit` deleted, the cone probes `firstSolidDeparture`. A carry over
  a torn-hull gap (or a cut dogleg corner) was being slapped back at the lip: deck ahead on your line now
  means the ball flies on, and a mid-air carom needs a bulkhead within 6 yd, not the resting backstop's 22.
  And `clearVoidHazards` had been deleting 100% of the acid breaches since GS-ship-calm-space — 0 → ~3 per
  wild hole. `docs/decisions/sim-generator.md`.
- **GS-save-transfer** — save export/import, finally wired to a button. `CLAUDE.md` has claimed
  "export/import from day one" since v1; the save LAYER had it (`downloadSave`/`importAndStore`) and
  nothing in the UI ever called them. A backup is a BUNDLE of all three blobs (`gs_save` + `gs_story` +
  `gs_settings`) — exporting the save alone would have silently dropped a whole Story Tour campaign.
  `parseBackup` THROWS on anything untrustworthy rather than `importSave`'s swallow-and-return-
  `defaultSave()` (right for boot, catastrophic for import — it would report success while wiping a real
  save); import is two steps, the pick parsing + summarising and a second tap writing. Export offers a
  file AND a clipboard copy because blob downloads aren't reliable in the Capacitor WebView. Needed
  because localStorage is per-ORIGIN — the website and the shell (`https://localhost`) never shared a
  save — and because the Android signing fix costs one uninstall. `docs/decisions/save-transfer.md`.
- **GS-android signing** — the sideload APK is a RELEASE build signed with the upload key, not
  `assembleDebug` (whose runner-generated certificate changes every run, so Android refused the update);
  every artifact step stamps version code + name; the keyless path stays buildable but goes loud, ending
  in an artifact named `…-UNSIGNED-cannot-update-existing-install`. `docs/decisions/android-packaging.md`.
- **GS-hud-frame** — ONE persistent play HUD across all six play states (`app/playFrame.ts`): five fixed
  regions (info bar · nav column · caddy slot · controls panel · action column), contents change, nothing is
  removed — a dead control greys in place. Panel bottom-anchored with the COMMIT row last, so commit · caddy ·
  `»` sit at the same y in every state. The caddy's slot is permanent (dimmed when off duty, a reserved
  placeholder when none is hired) and the BADGE is now the caddy everywhere — `playView` takes a measured
  `caddyAnchor` and drops its corner figure, so a guard's laser fires off the portrait. Two things the frame
  forced, both wins: **tap-to-swing** (the aim state's commit button, firing the previewed shot through the
  gesture's own dispatch — one-handed play) and the info bar no longer reflowing (min-width'd distance slot +
  score chips on their own row), which surfaced a real bug: the bar was showing the ball's FINAL lie mid-flight,
  spoiling the result. Readouts bumped a step throughout. Guarded by `tests/play-hud-frame.test.ts` (pure +
  real-browser layout, 2px tolerance across the aim→watch transition). `docs/decisions/ui-intro.md`.
- **GS-weather-affinity** — soft thematic weather↔biome bias: a weathered lane (blizzard/dust storm/…)
  now leans toward a fitting world (`EFFECT_BIOME_AFFINITY` + a `pickThemeFrom` weight boost on
  `routeTheme`'s own stream — same draw count, `:routes:` byte-identical, affinity-less skies unchanged).
  Weather stays event-driven + biome-independent; this only nudges WHICH world a weathered lane reaches.
  Also arc-spread the two new worlds (added Piscis Austrinus @swamp + Pyxis @metal, 6★/arc 2) so neither
  is locked to one arc's skies. `docs/decisions/rpg-meta-loop.md`.
- **GS-fairway-width-2** — the auto AI now READS the width grammar: a positioning drive that would come
  down in a genuinely tight driving-zone pinch lays up to the wider bay short of it (`widthLayupTarget`/
  `corridorHalfWidthAt` in `round.ts`, inside the shared `safeTarget` so auto ≡ interactive; pure, zero
  rng). Gated LOW so it fires only on brutal deep-stop corridors — RAISES mean per-stop Stableford
  (contract 4) and improved the max-wildness BIOMES bar (`toPar/hole` 0.78 → 0.77, floor-hit 7.55% →
  7.36%). Re-tightened the biomes floor-hit + themes `toPar` fences the rough-gradient had relaxed.
  Club-selection width-reading + the sparse-bag rebalance remain (GS-fairway-width-2b /
  GS-rough-gradient-rebalance). See `docs/decisions/sim-generator.md`.
- **GS-fuel-4** — fuel earns agency: the lane's SKY prices the passage (solar-wind/comet tailwinds
  −1 ⛽, gravity-well/ion-storm headwinds +1 ⛽ — burn decoupled from distance, derived + zero rng),
  tanker events refuel on arrival (scow/derelict/caravan, arc-tiered), and the SECTOR SCAN burns
  fuel to redraw the three lanes (escalating price, never the last cell, resume-safe via
  `Run.routeScans`, save v19) — doubling as the stranded lifeline. See
  `docs/decisions/rpg-meta-loop.md`.
- **GS-fuel-3** — build hooks on the GS-fuel-2 fuel economy: Ion Thrusters (epic; every jump −1 ⛽,
  min 1, and the journey-map ship trails a luminous ion wake), Reserve Fuel Tank (rare; +4 capacity,
  arrives full via the one-shot `ShopItem.fuelBonus` grant in `buy`), and the eagle siphon (a holed
  eagle-or-better refuels one cell in `finishStop` — great golf extends the journey; never on warp).
  See `docs/decisions/rpg-meta-loop.md`.
- **GS-intro-split** — the stop briefing is two mobile steps instead of one long scroll: step 1 the
  ARC (mode + win condition + the field of 20 competitors, "First Tee ▸" top + bottom-on-overflow +
  "Change golfer"), step 2 the HOLE (viewport-fit map + tap-to-open hazards/benefits popup + Tee Off
  / Watch AI / Back). One `'intro'` reducer screen toggled by view state (`introStage`), reset on
  entry; new `backToCharacter` action; zero save/rng. See `docs/decisions/ui-intro.md`.
- **GS-audio-4** — caddy-guard projectile cues: the Space Ducks laser PEWs on launch (beam whine
  rising into the ball) and SNAPs on contact; the Convict Sheep boomerang whooshes + whirs
  (whip-whip pulses quickening across the flight) and CRACKs wood-on-ball with a wobbling ring.
  Fired via a pure `onRedirect(kind, phase, travelMs)` feel hook at the redirect cinematic's own
  fire/spark beats; `travelMs` folds in the slow-mo so the whir ends exactly at the hit. Zero
  sim/rng impact; call-clean headless contract pinned (`tests/audio.test.ts`). See
  `docs/decisions/audio.md`.
- **GS-audio-3** — hazard & tree landing voices: the touchdown answers in sound (the audio half of
  `spawnLandFX`) — water splash, lava sizzle, void implosion, cetus whale song, ravine rockfall,
  sand/ice/crystal/scorch/stardust/junk — and tree hits are voiced per world archetype off the
  flora table (crystal spires ping, fungal mushrooms squelch, parkland knocks wood, saguaros tonk…).
  Pure `onLand` feel hook + pure classifiers (`landVoiceOf`/`treeVoiceOf`), zero sim/rng impact,
  coverage machine-checked (`tests/audio.test.ts`). See `docs/decisions/audio.md`.
- **GS-audio-2** — sound-design pass: club-FAMILY strike voices (driver boom+ping / wood / hybrid /
  iron click / wedge turf-shhk), a real ball-in-cup drop (rim knock → rattle → thunk → confirm), and
  an assetless GENERATIVE music layer — a distinct ambient track per world archetype + a menu lull,
  behind its own Music setting; coverage + the ≤0.35 subtlety gain bar machine-checked
  (`tests/audio.test.ts`). See `docs/decisions/audio.md`.
- **GS-journey-variety** — the three journey lanes always land distinct world archetypes (never the one
  you're on; split stops cross two archetypes); four new skies (eclipse / ion storm / nebula / comet) with
  real showpiece visuals + junk/trade-camp upgrades; the `effectWindMult` play hook makes weather bite
  fairly (storms gust, eclipses go still — HUD/AI/sim read the same wind). See
  `docs/decisions/rpg-meta-loop.md`.
- **GS-biome-feel** — per-world identity pass (supersedes GS-canopy-recolour): archetype flora (mushrooms/
  conifers/snags/saguaros/spires/palms…), signature ground decor (void asteroids + black hole, inferno
  fissures, ocean surf + cays…), themed OB markers (void warp beacons), per-surface landing FX (splash/
  lava burst/void implosion), ambient air layer + full 10-world wind tints. See `docs/decisions/render.md`.
- **GS-journey-alive** — journey select as a living cockpit: lit-sphere biome worlds (gradient body +
  surface art + terminator + specular + atmosphere), boss red-aura / heat shimmer, warp-corridor energy
  pulses, trail comet, launch-pad + thrusters, lit Earth, seeded twinkles/shooting stars, drifting sky.
  Byte-stable (seeded mulberry32, no Math.random). See `docs/decisions/rpg-meta-loop.md`.
- **GS-appsplit (partial)** — extracted haptics + celebrations (#157) and golfer avatars/leaderboard views
  (#158) out of `app.ts` (3,462 → 2,696 lines). Ongoing — see Now/next.
- **GS-tents** — trade-market route pitches collidable tents around the green (#155).
- **GS-rainbow** — legendary Rainbow Ball: every hole becomes Rainbow Course (#150).
- **GS-cetus** — star-ocean clifftop whale world + island-green par-3s (#152, reworked in GS-cetus-2;
  GS-cetus-3 made it read side-on: render-only dropdown cliff faces + a river of stars with a source
  spilling over the cliff into the starscape ocean, top-down play/aim projection kept untouched).
- **GS-team-duel** — Arc-II boss as a rank-based best-ball/scramble team duel (#147).
- **GS-proshop-2/3** — Pro Shop expansion: themed gear/club sets, bespoke caddy portraits, equal-size
  rarity-glow cards, Power Glove + gear inventory (#140/#141/#148).
- **GS-garage** — Trade Market + Garage: Star Shards buy cosmetic ships; permanent stat upgrades retired (#139).
- **GS-journey-fx** — route choice materially shapes the next course; shared animated screen-space weather (#138/#146).
- **GS-bird** — eagle & albatross fly-over celebrations (#145).
- **GS-greens-3** — green slope + putting break; Mystic Mole green reader (#133/#134).
- **GS-shapes-2 / GS-hazards-2 / GS-worlds / GS-rarity-style** — course-variety pass: hole archetypes;
  pot/fescue/barranca + length-tied greens; four new worlds (crystal/tempest/fungal/ocean); distinct
  rarity reads (#129–#131; `reports/course-variety-pass-2026-06-29.md`).
- **GS-100 / GS-competition** — field of AI golfers, live leaderboard, positional cut, matchplay bosses
  (#100–#104; `reports/competition-golfers-leaderboard-2026-06-28.md`). GS-rival merged in (the field IS the rival).
- **GS-boss/voyage · GS-scramble · GS-variation · GS-ascension · GS-synergy/curses/shop-reroll** — the
  roguelike-loop overhaul: winnable Voyage (arcs + bosses), co-op scramble bosses, multi-biome split stops,
  8-tier ascension, trigger relics + Glass Cannon curse + shop reroll (PR #82;
  `reports/gameplay-loop-review-2026-06-28.md`).
- **GS-routes / GS-14** — risk/reward travel: four trade-off levers, per-arc event slots, ~26+5 themed
  events, SVG starmap (economy/cut only). Triple-legendary easter-egg noted for an achievements system.
- **GS-clubs / GS-caddy / GS-caddy-sam** — per-character starting bags + clubs as loot; named-caddy card set
  (hire one); Suggestible Sam gates the club-suggestion + a confidence edge.
- **GS-19** — themes & fairways overhaul: per-archetype turf, void lost-rough, lava rivers, zone splash.
- **GS-17 (+b/c/d/e/f/g)** — star-travel theming end-to-end: theme table, rarity-tiered biomes, split events,
  rendered constellations, themed upgrades, Sim Lab theme browser (`reports/star-travel-theming-2026-06-26.md`).
- **GS-dispersion-2** — asymmetric 5-zone spray model + zone/distance upgrades
  (`reports/dispersion-graphic-upgrades-2026-06-27.md`).
- **GS-16** — test/demo hub + Sim Lab + auto-discovering CI hook-sync guard.
- **GS-15** — play-loop UX + mechanics: angular dispersion, zoom/follow-cam, green-coverage club, free-aim.
- **GS-bank** — push-your-luck cash-out (bank unspent credits → shards on a banked run).
- **GS-mux (largely)** — mobile UX: WebAudio engine, haptics, settings sheet, lie chip, fast shots,
  aim/zoom gestures, Daily Challenge seed (GS-7), install nudge, Sandy + Mystic Mole caddies
  (`reports/mobile-ux-review-2026-06-28.md`).
- **GS-13** — treelines, fairway bunkers, visible OB (`tests/hazards.test.ts`).
- **GS-12** — persistent meta: Star Shards + Outpost (save v3).
- **GS-11** — deep shop: stackable upgrades + rotating rarity-weighted offer.
- **GS-10** — RPG shot model + interactive play (#18–#21).
- **GS-unending** — the Unending Universe endless survival format (4-hole stops forever, par-relative
  per-hole bar, milestone victory screens + the earn-only Evergreen set + the secret hole-150 ship;
  replaced the flat/ladder roguelites; save v13).
- **GS-9** — run formats: flat + ladder (#8; both retired by GS-unending).
- **GS-8** — interactive meta-loop UI reducer (#5).
- **GS-6** — real pin within the green.
- **GS-5** — course/item cards (#9).
- **GS-3** — Canvas2D play view + ball flight (#4).
- **GS-2** — RPG meta-loop sim layer (#3).
- **GS-1** — wildness & biome system (#2).

## Dropped
- _none yet._ Cautionary "tried & reverted" notes live with their code, not here: the OB-margin tightening
  and the naive nearest-carry club-AI were both reverted (they tipped the death-spiral bar / just
  reshuffled RNG) — see `docs/decisions/sim-generator.md`.
