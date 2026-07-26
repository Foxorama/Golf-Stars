# Golf Stars — idea backlog

Living doc (per CLAUDE.md): scan, rerank, merge, retire — **not append-only.** This file tracks **open
work**. Stable IDs, never reused. When something ships it collapses to a one-line **Done** entry (link the
PR/report); the full story lives in `reports/` + `docs/decisions/` + git, never here. Bad → **Dropped** (say why).

## Avenue decision (settled for now)
What wraps the golf: the **Voyage** is the winnable campaign and the **Unending Universe** (GS-unending)
is the endless survival mode — the old `flat`/`ladder` roguelites are retired (their machinery lives on
under the new format). Avenue (1), a full top-down RPG shell, stays deferred until the loop is exhausted.

## Now / next

**GS-hud-frame-2 — the frame's remaining polish** *(follow-on from the shipped frame, small)*
The persistent frame landed (see Done). Left on the table, all cosmetic and none blocking:
- The controls panel's TOP edge still rises on the putt state (a pace meter is genuinely taller than a
  power bar). The floor is fixed, which is what keeps the buttons still — but a designed empty gauge slot
  on the aim states would make the panel one height everywhere, at the cost of map. Wants eyes-on play
  before deciding it's worth the pixels.
- The top info bar is four lines on a par-4 with a shape + width tag. Now that it no longer reflows, the
  next question is whether it should be two dense lines instead.
- Landscape / tablet has had no pass: the frame is phone-portrait tuned.

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
- **GS-story-midchapter** — ✅ *shipped*: the Sigil-less emotional interlude after the Ch.4 major — Warden "The Prism Accord" (win a fallen friend back) / Herald "The Severing" (betray one for the Coil's blood-money); a real roster golfer as the friend, fires once, colour-coded dialogue + credit outcome.
- **GS-story-yggdrasil** — ✅ *shipped*: the Jörmungandr SPACE BATTLE — five Sigils forge the key → briefing (two readiness gates: firepower/defence, spends Combat Rating) → Canvas battle cinematic (Cthulhu-serpent + golf finisher) → victory (`completed` → storyComplete → Star Tour) / defeat (arm up, rematch). Deferred: two alignment endings, interactive finisher shot.
- **GS-story-beats** — ✅ *shipped* (the inter-chapter dialogue): four escalation beats through the DATA-driven lore machinery (`LoreContext` gained `storyRound`/`storyChapter`/`storyAlignment`) — the Parrot names the Coil (Ch.2), Coilkeepers ring the tee (Ch.3), Venoma confronts you from Ch.4 branching Warden/Herald. Two bespoke SVG portraits (viper-woman Venoma, faceless Coilkeeper). Story-round-gated (never fires in Voyage/Unending), once-only via `seenLore`.
- **GS-story-parrot-bar** — ✅ *shipped* (the Parrot BAR interaction): "The Crow's Nest", a cosmetic Mothership hangout off the clubhouse — tap the Prognostic Parrot to cycle campaign-adaptive chatter (a state-appropriate greeting + rotating lore/Coil/path/hint lines gated on chapter/alignment/Sigils/completion). Content-as-data (`parrotBar.ts`) + a bespoke SVG cantina scene (porthole to space, neon sign, bottle shelf, the Parrot behind the bar reusing his lore bust). Transient tap counter, zero sim rng, no save bump.
- **GS-story-balance** — ✅ *shipped* (the cross-chapter difficulty + economy pass): measured the rival ghost vs fixed to-par reference rounds → the late Sigils were a near-wall (a −6 round won ~13% by Ch5, a mandatory gate) with a Ch2→Ch3 cliff. Recalibrated the rival edges to a smooth ~1-stroke/chapter curve (0.07/0.12/0.18/0.23/0.29) so a grown −6 round wins ~77%→~38% Ch1→Ch5 (winnable-but-earned, growth matters, no cliffs), and added a Sigil-win milestone bonus (`SIGIL_WIN_BONUS` 250, first win only) so the majors fund the escalating spend (5 Sigils ≈ the ~1300cr finale floor). Guarded by `tests/story-balance.test.ts`. **Story Tour is feature-complete** (all chunks shipped).

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
- **GS-rainbow** — legendary Rainbow Ball: every hole becomes Rainbow Road (#150).
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
